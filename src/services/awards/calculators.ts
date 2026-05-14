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
import { checkEligibility, playerAge } from './eligibility';

const getTrb = (s: any) => s.trb || s.reb || (s.orb || 0) + (s.drb || 0);

const bestStat = (stats: NBAGMStat[] | undefined, season: number): NBAGMStat | undefined => {
  if (!stats) return undefined;
  for (const s of [season, season - 1]) {
    const filtered = stats.filter(st => st.season === s && !st.playoffs);
    if (filtered.length > 0) return filtered.reduce((p, c) => (p.gp >= c.gp ? p : c));
  }
  return undefined;
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
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || !checkEligibility(['min-games'], p, stat, team, ctx.season, ctx.minGames)) continue;
    const gp = stat.gp;
    const rpg = getTrb(stat) / gp;
    const spg = stat.stl / gp;
    const bpg = stat.blk / gp;
    const diq = (p.ratings?.[p.ratings.length - 1] as any)?.diq ?? 50;
    const defMult = Math.max(0.4, diq / 70);
    const winPct = (team.wins ?? 0) / ((team.wins ?? 0) + (team.losses ?? 0) || 1);
    let score = (spg * 3.5 + bpg * 3.0 + rpg * 0.15) * (0.6 + winPct * 0.8) * defMult;
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
    if (p.draft?.year !== ctx.season - 1) continue;
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
    const cur = bestStat(p.stats, ctx.season);
    const prev = bestStat(p.stats, ctx.season - 1);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!cur || !prev || !checkEligibility(['min-games'], p, cur, team, ctx.season, ctx.minGames)) continue;
    if ((prev.gp ?? 0) < 20) continue;
    const curPPG = cur.pts / cur.gp;
    const prevPPG = prev.pts / prev.gp;
    const ppgJump = curPPG - prevPPG;
    if (ppgJump < 2) continue;
    let score = ppgJump * 4 + (curPPG - 14) * 0.3;
    candidates.push({ player: p, team, score, odds: '', stats: cur });
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
    const coach = ctx.staff?.coaches?.find(c => (c.team ?? '').toLowerCase().trim() === t.name.toLowerCase().trim());
    const coachName = coach?.name ?? `${t.name} Head Coach`;
    const score = winPct * 70 + improvement * 1.5;
    candidates.push({ coachName, team: t, score, odds: '', wins, losses, improvement } as any);
  }
  return assignOdds(candidates.filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 10));
};

// ─── All-Team selections ────────────────────────────────────────────────────
/** Returns up to 15 candidates (3 teams of 5). Args: { numTeams: 3, perTeam: 5 } */
export const allTeamCalc: Calculator = (ctx) => {
  const numTeams = ctx.args?.numTeams ?? 3;
  const perTeam = ctx.args?.perTeam ?? 5;
  const candidates: AwardCandidate[] = [];
  for (const p of ctx.players) {
    if (!inPool(p, ctx.poolTids)) continue;
    const stat = bestStat(p.stats, ctx.season);
    const team = getTeam(ctx.teams, p.tid) ?? stubTeam(p.tid);
    if (!stat || !checkEligibility(['min-games'], p, stat, team, ctx.season, ctx.minGames)) continue;
    const gp = stat.gp;
    const score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.5 + (stat.ast / gp) * 0.6 + computePIR(stat) * 0.4;
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
  'young': youngCalc,
  'stat-leader': statLeaderCalc,
  'pir': pirCalc,
  'coy': coyCalc,
  'all-team': allTeamCalc,
  'postseason': postseasonCalc,
};
