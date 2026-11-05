/**
 * All award score calculators in one file — pure, no state mutation.
 *
 * Each calculator receives a CalculatorContext (players + teams + pool +
 * season + args) and returns sorted candidates. The "winner" is index 0.
 *
 * Same calculator powers multiple AwardDefinition records:
 *   - mvpCalc → NBA MVP, EL MVP, ACB MVP, Fictional MVP
 *   - statLeaderCalc → Top Scorer / Reb / Ast / Stl / Blk / 3P
 */
import type { NBAPlayer, NBAGMStat, NBATeam } from '../../types';
import type { Calculator, CalculatorContext, AwardCandidate, CalculatorId } from './types';
import { checkEligibility, isRookieForSeason, playerAge } from './eligibility';
import { resolveHeadCoachName } from '../staff/coachNameResolver';
import { normalizeGMAttributes, resolveGeneralManagerForTeam } from '../staff/gmAttributes';
import { getTeamFullName } from '../../utils/teamNames';
import { getCalibratedPer } from '../../utils/advancedStatCalibration';
import { getDpoyScore, getLeagueDefensiveRating, getMipScore, wasAllStarBeforeSeason } from '../logic/AwardServiceShared';

const getTrb = (s: any) => s.trb || s.reb || (s.orb || 0) + (s.drb || 0);

const bestStat = (stats: NBAGMStat[] | undefined, season: number): NBAGMStat | undefined => {
  if (!stats) return undefined;
  for (const s of [season, season - 1]) {
    const filtered = stats.filter(st => st.season === s && !st.playoffs);
    if (filtered.length > 0) return filtered.reduce((p, c) => (p.gp >= c.gp ? p : c));
  }
  return undefined;
};

const exactStat = (stats: NBAGMStat[] | undefined, season: number, playoffs = false): NBAGMStat | undefined =>
  stats
    ?.filter(stat => stat.season === season && Boolean(stat.playoffs) === playoffs)
    .reduce<NBAGMStat | undefined>((best, current) => !best || current.gp > best.gp ? current : best, undefined);

const contributionScore = (stat: NBAGMStat): number => {
  const gp = Math.max(1, stat.gp);
  return (
    stat.pts
    + getTrb(stat) * 0.7
    + stat.ast * 0.8
    + stat.stl * 1.7
    + stat.blk * 1.5
    - Math.max(0, stat.fga - stat.fg) * 0.7
    - Math.max(0, stat.fta - stat.ft) * 0.4
    - stat.tov
    - stat.pf * 0.2
  ) / gp;
};

/** FIBA PIR. We approximate FoulsDrawn ≈ FTA × 0.4 since we don't track it. */
function computePIR(s: NBAGMStat): number {
  const gp = s.gp || 1;
  const fgMissed = ((s.fga ?? 0) - (s.fg ?? 0));
  const ftMissed = ((s.fta ?? 0) - (s.ft ?? 0));
  const foulsDrawn = (s.fta ?? 0) * 0.4;
  const pir = (s.pts + getTrb(s) + s.ast + s.stl + s.blk + foulsDrawn)
            - (fgMissed + ftMissed + (s.tov ?? 0) + (s.pf ?? 0));
  return pir / gp;
}

const PLAYER_AWARD_COUNT = (p: NBAPlayer, types: string[]): number =>
  p.awards?.filter(a => types.includes(a.type)).length ?? 0;

function assignOdds(arr: AwardCandidate[]): AwardCandidate[] {
  const top = arr[0]?.score || 1;
  return arr.map((c, i) => {
    const ratio = c.score / top;
    let odds: string;
    if (i === 0) odds = `${Math.round(45 + ratio * 25)}%`;
    else if (i === 1) odds = `${Math.round(18 + ratio * 8)}%`;
    else if (i === 2) odds = `${Math.round(10 + ratio * 5)}%`;
    else odds = `+${Math.round(800 + (1 - ratio) * 1500)}`;
    return { ...c, odds };
  });
}

function inPool(p: NBAPlayer, pool: Set<number>): boolean {
  return pool.has(p.tid);
}

function getTeam(teams: NBATeam[], tid: number): NBATeam | undefined {
  return teams.find(t => t.id === tid);
}

function stubTeam(tid: number): NBATeam {
  return { id: tid, name: 'Unknown', abbrev: '?', wins: 0, losses: 0 } as unknown as NBATeam;
}

// ─── MVP ────────────────────────────────────────────────────────────────────
export const mvpCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    const hasInjury = !!((p as any).injury && (p as any).injury.gamesRemaining > 0);
    if (!stat) continue;
    if (!checkEligibility(['min-games'], p, stat, team, ctx.season, ctx.minGames)) {
      // Injury exception: -3 games tolerance
      if (!hasInjury) continue;
      if (!checkEligibility(['min-games'], p, stat, team, ctx.season, Math.max(ctx.minGames - 3, 1))) continue;
    }
    const gp = stat.gp;
    const ppg = stat.pts / gp;
    const rpg = getTrb(stat) / gp;
    const apg = stat.ast / gp;
    if (ppg < 10) continue;
    const winPct = (team.wins ?? 0) / ((team.wins ?? 0) + (team.losses ?? 0) || 1);
    let score = (ppg * 1.2 + rpg * 0.5 + apg * 0.6) * (0.7 + winPct * 0.8);
    const pastMVPs = PLAYER_AWARD_COUNT(p, ['Most Valuable Player', 'Euroleague MVP', 'Liga ACB MVP']);
    score *= Math.max(0.925, 1 - pastMVPs * 0.025);
    candidates.push({ player: p, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── DPOY ───────────────────────────────────────────────────────────────────
export const dpoyCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  const leagueDrtg = getLeagueDefensiveRating(ctx.players.filter(player => inPool(player, ctx.poolTids)), ctx.season);
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || !checkEligibility(['min-games'], p, stat, team, ctx.season, ctx.minGames)) continue;
    const diq = (p.ratings?.[p.ratings.length - 1] as any)?.diq ?? 50;
    const winPct = (team.wins ?? 0) / ((team.wins ?? 0) + (team.losses ?? 0) || 1);
    let score = getDpoyScore(stat, diq, winPct, leagueDrtg);
    const past = PLAYER_AWARD_COUNT(p, ['Defensive Player of the Year', 'Euroleague Best Defender']);
    score *= Math.max(0.925, 1 - past * 0.025);
    candidates.push({ player: p, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── Rookie of the Year ─────────────────────────────────────────────────────
export const rookieCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    if (!isRookieForSeason(p, ctx.season, ctx.uiMode)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || !checkEligibility(['min-games'], p, stat, team, ctx.season, ctx.minGames)) continue;
    const gp = stat.gp;
    const score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.5 + (stat.ast / gp) * 0.5;
    candidates.push({ player: p, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── Sixth Man of the Year ──────────────────────────────────────────────────
export const sixManCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || !checkEligibility(['min-games', 'bench-role'], p, stat, team, ctx.season, ctx.minGames)) continue;
    const gp = stat.gp;
    const tsPct = (stat as any).tsPct || 52;
    const efficiencyBonus = (tsPct - 52) * 0.05;
    let score = (stat.pts / gp) * 1.2 + (getTrb(stat) / gp) * 0.4 + (stat.ast / gp) * 0.4 + efficiencyBonus;
    score *= Math.max(0.925, 1 - PLAYER_AWARD_COUNT(p, ['Sixth Man of the Year']) * 0.025);
    candidates.push({ player: p, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── Most Improved Player ───────────────────────────────────────────────────
export const mipCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    if (wasAllStarBeforeSeason(p, ctx.season) || isRookieForSeason(p, ctx.season, ctx.uiMode)) continue;
    const cur = exactStat(p.stats, ctx.season);
    const prev = exactStat(p.stats, ctx.season - 1);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!cur || !prev || !checkEligibility(['min-games'], p, cur, team, ctx.season, ctx.minGames)) continue;
    const score = getMipScore(cur, prev);
    if (score == null) continue;
    candidates.push({ player: p, team, score, odds: '', stats: cur });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const clutchCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = bestStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const q4Points = Number(stat.q4Pts ?? 0);
    if (q4Points <= 0) continue;
    const games = Math.max(1, stat.gp);
    const score = q4Points / games
      + Number(stat.q4Reb ?? 0) / games * 0.35
      + Number(stat.q4Ast ?? 0) / games * 0.45
      + Number(stat.gameWinners ?? 0) * 1.25;
    candidates.push({ player, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const ibmCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const winPct = (team.wins ?? 0) / Math.max(1, (team.wins ?? 0) + (team.losses ?? 0));
    candidates.push({ player, team, score: contributionScore(stat) * (0.8 + winPct * 0.4), odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const comebackCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids) || isRookieForSeason(player, ctx.season, ctx.uiMode)) continue;
    const current = exactStat(player.stats, ctx.season);
    const previous = exactStat(player.stats, ctx.season - 1);
    const olderPeak = (player.stats ?? [])
      .filter(stat => !stat.playoffs && stat.season < ctx.season - 1 && stat.gp >= 20)
      .reduce<NBAGMStat | undefined>((best, stat) => !best || contributionScore(stat) > contributionScore(best) ? stat : best, undefined);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!current || !olderPeak || !checkEligibility(['min-games'], player, current, team, ctx.season, ctx.minGames)) continue;
    const priorGames = previous?.gp ?? 0;
    const priorValue = previous ? contributionScore(previous) : 0;
    const currentValue = contributionScore(current);
    const restoredLevel = Math.min(1.25, currentValue / Math.max(1, contributionScore(olderPeak)));
    const absenceSeverity = Math.max(0, 1 - priorGames / Math.max(1, ctx.minGames));
    const productionRecovery = Math.max(0, currentValue - priorValue);
    if (absenceSeverity < 0.2 || productionRecovery <= 2 || restoredLevel < 0.55) continue;
    candidates.push({ player, team, score: productionRecovery * 2 + absenceSeverity * 12 + restoredLevel * 5, odds: '', stats: current });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const ironmanCalc: Calculator = (ctx) => {
  const teamGames = new Map(ctx.teams.map(team => [team.id, (team.wins ?? 0) + (team.losses ?? 0)]));
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    const requiredGames = teamGames.get(player.tid) ?? 0;
    if (!stat || requiredGames <= 0 || stat.gp < requiredGames) continue;
    candidates.push({ player, team, score: stat.min - stat.pf * 0.001, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const sidekickCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const team of ctx.teams) {
    if (!ctx.poolTids.has(team.id)) continue;
    const roster = ctx.players
      .filter(player => player.tid === team.id)
      .map(player => ({ player, stat: exactStat(player.stats, ctx.season) }))
      .filter((entry): entry is { player: NBAPlayer; stat: NBAGMStat } => Boolean(entry.stat))
      .filter(entry => checkEligibility(['min-games'], entry.player, entry.stat, team, ctx.season, ctx.minGames))
      .map(entry => ({ player: entry.player, team, stats: entry.stat, score: contributionScore(entry.stat), odds: '' }))
      .sort((a, b) => b.score - a.score);
    if (roster[1]) candidates.push(roster[1]);
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const scoreConsistency = (per: number, gamesPlayed: number): number =>
  per * Math.pow(Math.min(1, Math.max(0, gamesPlayed) / 65), 20);

export const leastValuableCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const mpg = stat.min / Math.max(1, stat.gp);
    const per = getCalibratedPer(stat);
    if (mpg < 12 || per >= 13) continue;
    const trueShooting = Number(stat.tsPct ?? 0);
    const normalizedTs = trueShooting > 1 ? trueShooting / 100 : trueShooting;
    const inefficiency = normalizedTs > 0 ? Math.max(0, 0.54 - normalizedTs) * 30 : 0;
    const score = (13 - per) * Math.min(1.25, mpg / 24)
      + inefficiency
      + (stat.tov / Math.max(1, stat.gp)) * 0.25;
    candidates.push({ player, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const consistencyCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || stat.gp < 1) continue;
    const score = scoreConsistency(getCalibratedPer(stat), stat.gp);
    candidates.push({ player, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

const normalizedRate = (value: number | undefined): number => {
  const rate = Number(value ?? 0);
  return rate > 1 ? rate / 100 : rate;
};

export const sharpshooterCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const threesAttemptedPerGame = stat.tpa / Math.max(1, stat.gp);
    if (threesAttemptedPerGame < 2) continue;
    const threesMadePerGame = stat.tp / Math.max(1, stat.gp);
    const threePointRate = normalizedRate(stat.tpp || (stat.tpa > 0 ? stat.tp / stat.tpa : 0));
    const score = threePointRate * 60
      + threesMadePerGame * 8
      + normalizedRate(stat.ftp) * 4;
    candidates.push({ player, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const twoWayCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const gp = Math.max(1, stat.gp);
    const points = stat.pts / gp;
    if (points < 12) continue;
    const rebounds = getTrb(stat) / gp;
    const steals = stat.stl / gp;
    const blocks = stat.blk / gp;
    const drtg = Number(stat.drtg ?? 0);
    const defensiveImpact = steals * 2.5
      + blocks * 2
      + rebounds * 0.15
      + (drtg > 0 ? Math.max(0, 112 - drtg) * 0.25 : 0);
    if (defensiveImpact < 2.5) continue;
    const winPct = (team.wins ?? 0) / Math.max(1, (team.wins ?? 0) + (team.losses ?? 0));
    const score = Math.sqrt(Math.max(0, contributionScore(stat)) * defensiveImpact) * (0.9 + winPct * 0.2);
    candidates.push({ player, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const performanceCalc: Calculator = (ctx) => {
  const playersById = new Map(ctx.players.map(player => [String(player.internalId), player]));
  const candidates: AwardCandidate[] = [];
  for (const game of ctx.boxScores) {
    if (Number(game.season) !== ctx.season
      || game.isPreseason
      || game.excludeFromRecord
      || game.isAllStar
      || game.isRisingStars
      || game.isCelebrityGame
      || !ctx.poolTids.has(game.homeTeamId)
      || !ctx.poolTids.has(game.awayTeamId)) continue;
    const isPlayoff = game.isPlayoff === true || game.isPlayIn === true;
    const isEliminationGame = game.isEliminationGame === true;
    for (const [teamId, opponentId, stats] of [
      [game.homeTeamId, game.awayTeamId, game.homeStats],
      [game.awayTeamId, game.homeTeamId, game.awayStats],
    ] as const) {
      const team = getTeam(ctx.teams, teamId) ?? stubTeam(teamId);
      const opponent = getTeam(ctx.teams, opponentId) ?? stubTeam(opponentId);
      for (const gameStats of stats) {
        const player = playersById.get(String(gameStats.playerId));
        if (!player) continue;
        const isGameWinner = String(game.gameWinner?.playerId ?? '') === String(gameStats.playerId);
        const contextBonus = (isPlayoff ? 1 : 0) + (isEliminationGame ? 0.75 : 0) + (isGameWinner ? 0.75 : 0);
        candidates.push({
          player,
          team,
          score: Number(gameStats.gameScore ?? 0) + contextBonus,
          odds: '',
          game: {
            gameId: game.gameId,
            date: game.date,
            stats: gameStats,
            opponent,
            won: game.winnerId === teamId,
            isPlayoff,
            isEliminationGame,
            isGameWinner,
            contextBonus,
          },
        });
      }
    }
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const hustleCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const total = (stat.deflections ?? stat.stl * 2.4) + (stat.chargesDrawn ?? stat.pf * 0.08) * 3 + stat.stl + stat.blk * 0.5;
    candidates.push({ player, team, score: total / Math.max(1, stat.gp), odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const sportsmanshipCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const discipline = (player.disciplineHistory ?? []).filter(record => record.season === ctx.season);
    if (discipline.length > 0 || (stat.techs ?? 0) > 0 || player.suspension?.gamesRemaining) continue;
    candidates.push({ player, team, score: stat.min - stat.pf * 0.05, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

const stablePlayerTieBreak = (player: NBAPlayer): number =>
  [...player.internalId].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 997, 0) / 997;

export const teammateCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || !checkEligibility(['min-games'], player, stat, team, ctx.season, ctx.minGames)) continue;
    const isLeader = player.personalityBadges?.includes('leader') || player.badges?.some(badge => /leader|ambassador/i.test(badge));
    const score = (isLeader ? 12 : 0) + stat.ast / Math.max(1, stat.gp) + Math.min(5, stat.gp / 20) + stablePlayerTieBreak(player);
    candidates.push({ player, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

export const playoffMvpCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const player of ctx.players) {
    if (!inPool(player, ctx.poolTids)) continue;
    const stat = exactStat(player.stats, ctx.season, true);
    const team = getTeam(ctx.teams, player.tid) ?? stubTeam(player.tid);
    if (!stat || stat.gp < ctx.minGames) continue;
    candidates.push({ player, team, score: contributionScore(stat), odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── Young / Rising Star (under-22 or under-23, depending on args) ──────────
export const youngCalc: Calculator = (ctx) => {
  const cap = ctx.args?.ageCap ?? 23;
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    if (playerAge(p, ctx.season) >= cap) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || stat.gp < Math.max(8, ctx.minGames / 2)) continue;
    const gp = stat.gp;
    const score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.4 + (stat.ast / gp) * 0.4 + computePIR(stat) * 0.3;
    candidates.push({ player: p, team, score, odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── Stat Leader (metric-driven: 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | '3p') ──
export const statLeaderCalc: Calculator = (ctx) => {
  const metric: string = ctx.args?.metric ?? 'pts';
  const metricFn = (s: NBAGMStat): number => {
    const gp = s.gp || 1;
    switch (metric) {
      case 'pts': return s.pts / gp;
      case 'reb': return getTrb(s) / gp;
      case 'ast': return s.ast / gp;
      case 'stl': return s.stl / gp;
      case 'blk': return s.blk / gp;
      case '3p':  return ((s as any).tp ?? (s as any).fg3 ?? 0) / gp;
      default:    return s.pts / gp;
    }
  };
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || stat.gp < Math.max(8, ctx.minGames / 2)) continue;
    candidates.push({ player: p, team, score: metricFn(stat), odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── PIR Leader ─────────────────────────────────────────────────────────────
export const pirCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || stat.gp < Math.max(8, ctx.minGames / 2)) continue;
    candidates.push({ player: p, team, score: computePIR(stat), odds: '', stats: stat });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── Coach of the Year ──────────────────────────────────────────────────────
export const coyCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const t of ctx.teams) {
    if (!ctx.poolTids.has(t.id)) continue;
    const wins = t.wins ?? 0;
    const losses = t.losses ?? 0;
    const winPct = wins / (wins + losses || 1);
    const prevWins = (t.seasons ?? [])[(t.seasons ?? []).length - 2]?.won ?? wins;
    const improvement = wins - prevWins;
    const coachName = resolveHeadCoachName(t, ctx.staff, ctx.season);
    const score = winPct * 70 + improvement * 1.5;
    candidates.push({ coachName, team: t, score, odds: '', wins, losses, improvement } as any);
  }
  return assignOdds(candidates.filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 10));
};

export const executiveCalc: Calculator = (ctx) => {
  const candidates: AwardCandidate[] = [];
  for (const team of ctx.teams) {
    if (!ctx.poolTids.has(team.id)) continue;
    const wins = Number(team.wins ?? 0);
    const losses = Number(team.losses ?? 0);
    if (wins + losses <= 0) continue;
    const previousSeason = (team.seasons ?? [])
      .filter(row => Number(row.season) < ctx.season)
      .sort((a, b) => Number(b.season) - Number(a.season))[0];
    const previousWins = Number(previousSeason?.won ?? wins);
    const currentWinPct = wins / Math.max(1, wins + losses);
    const improvement = wins - previousWins;
    const savedExecutive = resolveGeneralManagerForTeam(team, ctx.staff);
    const isUserExecutive = ctx.gameMode === 'gm' && ctx.userTeamId === team.id;
    const attributes = normalizeGMAttributes(savedExecutive?.attributes);
    const executiveName = isUserExecutive && ctx.commissionerName
      ? ctx.commissionerName
      : savedExecutive?.name ?? `${getTeamFullName(team)} General Manager`;
    const competence = attributes.overall * 0.16
      + attributes.drafting * 0.05
      + attributes.negotiation * 0.05
      + attributes.scouting_focus * 0.04;
    const score = currentWinPct * 70 + Math.max(-10, improvement) * 1.5 + competence;
    candidates.push({
      executiveName,
      executiveId: isUserExecutive
        ? `user-gm-${team.id}`
        : savedExecutive?.executiveId ?? savedExecutive?.id ?? savedExecutive?.sourcePlayerId,
      team,
      score,
      odds: '',
    });
  }
  return assignOdds(candidates.sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── All-Team selections ────────────────────────────────────────────────────
/** Returns up to 15 candidates (3 teams of 5). Args: { numTeams: 3, perTeam: 5 } */
export const allTeamCalc: Calculator = (ctx) => {
  const numTeams = ctx.args?.numTeams ?? 3;
  const perTeam = ctx.args?.perTeam ?? 5;
  const variant = ctx.args?.variant ?? 'all-league';
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat) continue;
    if (variant === 'all-rookie') {
      if (!checkEligibility(['rookie-year', 'min-games'], p, stat, team, ctx.season, ctx.minGames, 82, ctx.uiMode)) continue;
    } else if (!checkEligibility(['min-games'], p, stat, team, ctx.season, ctx.minGames)) {
      continue;
    }
    const gp = stat.gp;
    let score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.5 + (stat.ast / gp) * 0.6 + computePIR(stat) * 0.4;
    if (variant === 'all-defensive') {
      const spg = stat.stl / gp;
      const bpg = stat.blk / gp;
      const rpg = getTrb(stat) / gp;
      const diq = (p.ratings?.[p.ratings.length - 1] as any)?.diq ?? 50;
      const defMult = Math.max(0.4, diq / 70);
      score = (spg * 3.5 + bpg * 3.0 + rpg * 0.15) * defMult;
    } else if (variant === 'all-rookie') {
      score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.5 + (stat.ast / gp) * 0.5;
    }
    const pos = (p.ratings?.[p.ratings.length - 1] as any)?.pos ?? p.pos ?? 'F';
    candidates.push({ player: p, team, score, odds: '', stats: stat, pos });
  }
  const sorted = candidates.sort((a, b) => b.score - a.score).slice(0, numTeams * perTeam);
  return sorted.map((c, idx) => ({ ...c, teamIndex: Math.floor(idx / perTeam) }));
};

// ─── Postseason marker (not actually computed — playoff resolver writes it) ─
export const postseasonCalc: Calculator = () => [];

// ─── Registry of calculators ────────────────────────────────────────────────
export const CALCULATORS: Record<CalculatorId, Calculator> = {
  'mvp': mvpCalc,
  'dpoy': dpoyCalc,
  'rookie': rookieCalc,
  'six-man': sixManCalc,
  'mip': mipCalc,
  'clutch': clutchCalc,
  'ibm': ibmCalc,
  'comeback': comebackCalc,
  'ironman': ironmanCalc,
  'sidekick': sidekickCalc,
  'least-valuable': leastValuableCalc,
  'performance': performanceCalc,
  'consistency': consistencyCalc,
  'sharpshooter': sharpshooterCalc,
  'two-way': twoWayCalc,
  'hustle': hustleCalc,
  'sportsmanship': sportsmanshipCalc,
  'teammate': teammateCalc,
  'playoff-mvp': playoffMvpCalc,
  'young': youngCalc,
  'stat-leader': statLeaderCalc,
  'pir': pirCalc,
  'coy': coyCalc,
  'executive': executiveCalc,
  'all-team': allTeamCalc,
  'postseason': postseasonCalc,
};
