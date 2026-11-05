import type { GameState } from '../../types';
import { calculateDisplayTeamOverall, calculateTeamStrengthWithMinutes } from '../playerRatings';
import { convertTo2KRating } from '../helpers';
import { buildStandingsContext } from '../../services/simulation/GameSimulator/engineDaySetup';
import { resolveRotationPlan } from '../../services/simulation/rotationPlan';
import { KNOBS_DEFAULT } from '../../services/simulation/SimulatorKnobs';
import { getSimulatorMode } from '../../services/simulation/SimulatorAdapter';
import { getTeamFullName } from '../teamNames';
import { copyTextToClipboard, type CheatResult } from './shared';

type TeamAuditRow = {
  tid: number;
  conf: string;
  rank: number;
  strengthRank: number;
  rankDelta: number;
  team: string;
  record: string;
  gp: number;
  winPct: number;
  displayOvr: number;
  rotationStrength: number;
  healthy: number;
  injured: number;
  topTwo: string;
};

function isNbaTeam(team: any): boolean {
  return Number.isInteger(team?.id) && team.id >= 0 && team.id < 100 && (team.conference === 'East' || team.conference === 'West');
}

function isRosterPlayer(player: any): boolean {
  if (!player) return false;
  if (player.status === 'Retired') return false;
  if (player.tid == null || player.tid < 0) return false;
  return true;
}

function playerK2(player: any, season?: number): number {
  const rating = Array.isArray(player?.ratings)
    ? [...player.ratings]
        .filter((row: any) => season == null || Number(row?.season ?? 0) <= season)
        .sort((a: any, b: any) => Number(b?.season ?? 0) - Number(a?.season ?? 0))[0] ?? player.ratings[player.ratings.length - 1]
    : undefined;
  return convertTo2KRating(Number(player?.overallRating ?? rating?.ovr ?? 50), Number(rating?.hgt ?? 50), rating?.tp);
}

function currentSeasonStats(player: any, season: number): any {
  const rows = Array.isArray(player?.stats)
    ? player.stats.filter((row: any) => Number(row?.season) === season && !row?.playoffs)
    : [];
  if (rows.length === 0) return { gp: 0, min: 0, pts: 0, per: 0 };
  return rows.reduce(
    (acc: any, row: any) => {
      const gp = Number(row?.gp ?? 0);
      const min = Number(row?.min ?? 0);
      acc.gp += gp;
      acc.min += min;
      acc.pts += Number(row?.pts ?? 0);
      acc.reb += Number(row?.trb ?? row?.reb ?? 0);
      acc.ast += Number(row?.ast ?? 0);
      acc.perWeighted += Number(row?.per ?? 0) * Math.max(1, min);
      acc.perWeight += Math.max(1, min);
      return acc;
    },
    { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, perWeighted: 0, perWeight: 0 },
  );
}

function formatPct(wins: number, losses: number): number {
  const gp = wins + losses;
  return gp > 0 ? Number((wins / gp).toFixed(3)) : 0;
}

function teamKnobs(teamId: number, standings: Map<number, any>) {
  return { ...KNOBS_DEFAULT, ...(standings.get(teamId) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 }) };
}

function rotationStrengthForTeam(state: GameState, team: any, season: number, standings: Map<number, any>): { strength: number; plan: any } {
  const plan = resolveRotationPlan(team, state.players ?? [], season, teamKnobs(team.id, standings), 0);
  const minuteMap: Record<string, number> = {};
  plan.rotation.forEach((player: any, index: number) => {
    minuteMap[player.internalId] = Number(plan.minuteTargets[index] ?? 0);
  });
  return {
    strength: calculateTeamStrengthWithMinutes(plan.rotation as any, minuteMap, season),
    plan,
  };
}

function buildTeamRows(state: GameState): { rows: TeamAuditRow[]; strengthByTid: Map<number, number>; planByTid: Map<number, any> } {
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const teams = (state.teams ?? []).filter(isNbaTeam);
  const standings = buildStandingsContext(teams as any);
  const strengthByTid = new Map<number, number>();
  const planByTid = new Map<number, any>();

  for (const team of teams) {
    const result = rotationStrengthForTeam(state, team, season, standings);
    strengthByTid.set(team.id, result.strength);
    planByTid.set(team.id, result.plan);
  }

  const strengthRankByTid = new Map<number, number>();
  for (const conf of ['East', 'West']) {
    teams
      .filter(team => team.conference === conf)
      .sort((a, b) => (strengthByTid.get(b.id) ?? 0) - (strengthByTid.get(a.id) ?? 0))
      .forEach((team, index) => strengthRankByTid.set(team.id, index + 1));
  }

  const rows = teams.map(team => {
    const roster = (state.players ?? []).filter((player: any) => player.tid === team.id && isRosterPlayer(player));
    const healthy = roster.filter((player: any) => Number(player.injury?.gamesRemaining ?? 0) <= 0);
    const top = [...healthy].sort((a, b) => playerK2(b, season) - playerK2(a, season));
    const rank = standings.get(team.id)?.conferenceRank ?? 99;
    const strengthRank = strengthRankByTid.get(team.id) ?? 99;
    const wins = Number(team.wins ?? 0);
    const losses = Number(team.losses ?? 0);
    return {
      tid: team.id,
      conf: team.conference,
      rank,
      strengthRank,
      rankDelta: rank - strengthRank,
      team: team.abbrev ?? getTeamFullName(team),
      record: `${wins}-${losses}`,
      gp: wins + losses,
      winPct: formatPct(wins, losses),
      displayOvr: calculateDisplayTeamOverall(team.id, state.players ?? [], roster as any),
      rotationStrength: strengthByTid.get(team.id) ?? 0,
      healthy: healthy.length,
      injured: roster.length - healthy.length,
      topTwo: top.slice(0, 2).map(player => `${player.name} ${playerK2(player, season)}`).join(' / '),
    };
  });

  rows.sort((a, b) => a.conf.localeCompare(b.conf) || a.rank - b.rank);
  return { rows, strengthByTid, planByTid };
}

function resolveTargetTeam(state: GameState, target?: string | number): any {
  const teams = (state.teams ?? []).filter(isNbaTeam);
  if (typeof target === 'number') return teams.find(team => team.id === target) ?? null;
  const key = String(target ?? '').trim().toLowerCase();
  if (key) {
    return teams.find(team =>
      String(team.abbrev ?? '').toLowerCase() === key ||
      String(team.name ?? '').toLowerCase().includes(key) ||
      getTeamFullName(team).toLowerCase().includes(key)
    ) ?? null;
  }
  return teams.find(team =>
    String(team.abbrev ?? '').toUpperCase() === 'OKC' ||
    /oklahoma|thunder/i.test(`${team.name ?? ''} ${team.region ?? ''}`)
  ) ?? teams.find(team => team.id === (state as any).userTeamId) ?? teams[0] ?? null;
}

function normalSeasonGame(game: any): boolean {
  return !!game?.played &&
    !game.isPreseason &&
    !game.isPlayoff &&
    !game.isPlayIn &&
    !game.isAllStar &&
    !game.isExhibition &&
    !game.excludeFromRecord &&
    game.homeTid >= 0 &&
    game.awayTid >= 0;
}

function scoreFor(game: any, tid: number): { own: number; opp: number; oppTid: number; site: string } {
  const home = game.homeTid === tid;
  return {
    own: Number(home ? game.homeScore : game.awayScore),
    opp: Number(home ? game.awayScore : game.homeScore),
    oppTid: home ? game.awayTid : game.homeTid,
    site: home ? 'vs' : '@',
  };
}

function teamGameRows(state: GameState, team: any, strengthByTid: Map<number, number>): any[] {
  const teamById = new Map((state.teams ?? []).map((entry: any) => [entry.id, entry]));
  return (state.schedule ?? [])
    .filter((game: any) => normalSeasonGame(game) && (game.homeTid === team.id || game.awayTid === team.id))
    .sort((a: any, b: any) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    .map((game: any) => {
      const score = scoreFor(game, team.id);
      const opp = teamById.get(score.oppTid);
      const margin = score.own - score.opp;
      return {
        date: game.date,
        site: score.site,
        opp: opp?.abbrev ?? `tid${score.oppTid}`,
        score: `${score.own}-${score.opp}`,
        result: margin > 0 ? 'W' : 'L',
        margin,
        ownStr: strengthByTid.get(team.id) ?? 0,
        oppStr: strengthByTid.get(score.oppTid) ?? 0,
        strDiff: Number(((strengthByTid.get(team.id) ?? 0) - (strengthByTid.get(score.oppTid) ?? 0)).toFixed(1)),
      };
    });
}

function boxRowsForTeam(state: GameState, team: any, limit = 8): any[] {
  const playersById = new Map((state.players ?? []).map((player: any) => [player.internalId, player]));
  const time = (value: any) => {
    const parsed = Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return (state.boxScores ?? [])
    .filter((box: any) => box.homeTeamId === team.id || box.awayTeamId === team.id)
    .sort((a: any, b: any) => time(b.date) - time(a.date))
    .slice(0, limit)
    .map((box: any) => {
      const home = box.homeTeamId === team.id;
      const stats = home ? box.homeStats ?? [] : box.awayStats ?? [];
      const top = [...stats].sort((a: any, b: any) => Number(b.pts ?? 0) - Number(a.pts ?? 0)).slice(0, 3);
      const fga = stats.reduce((sum: number, row: any) => sum + Number(row.fga ?? 0), 0);
      const fgm = stats.reduce((sum: number, row: any) => sum + Number(row.fgm ?? 0), 0);
      const tpm = stats.reduce((sum: number, row: any) => sum + Number(row.threePm ?? 0), 0);
      return {
        date: box.date,
        score: `${home ? box.homeScore : box.awayScore}-${home ? box.awayScore : box.homeScore}`,
        result: box.winnerId === team.id ? 'W' : 'L',
        efg: fga > 0 ? Number((((fgm + 0.5 * tpm) / fga) * 100).toFixed(1)) : 0,
        top: top.map((row: any) => `${playersById.get(row.playerId)?.name ?? row.name}: ${row.pts}`).join(' | '),
      };
    });
}

async function drillTeam(state: GameState, team: any, rows: TeamAuditRow[], strengthByTid: Map<number, number>, planByTid: Map<number, any>): Promise<string> {
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const roster = (state.players ?? [])
    .filter((player: any) => player.tid === team.id && isRosterPlayer(player))
    .sort((a: any, b: any) => playerK2(b, season) - playerK2(a, season));
  const rosterRows = roster.map((player: any) => {
    const stat = currentSeasonStats(player, season);
    const gp = Number(stat.gp ?? 0);
    const min = Number(stat.min ?? 0);
    return {
      player: player.name,
      pos: player.pos ?? player.position ?? '',
      k2: playerK2(player, season),
      rawOvr: Number(Number(player.overallRating ?? 0).toFixed(1)),
      age: player.age ?? (player.born?.year ? season - player.born.year : ''),
      status: player.status ?? '',
      injury: Number(player.injury?.gamesRemaining ?? 0) > 0 ? `${player.injury?.type ?? 'inj'} ${player.injury.gamesRemaining}g` : '',
      fatigue: Number(Number(player.trainingFatigue ?? 0).toFixed(1)),
      gp,
      mpg: gp > 0 ? Number((min / gp).toFixed(1)) : 0,
      ppg: gp > 0 ? Number((Number(stat.pts ?? 0) / gp).toFixed(1)) : 0,
      per: stat.perWeight > 0 ? Number((stat.perWeighted / stat.perWeight).toFixed(1)) : 0,
    };
  });
  const plan = planByTid.get(team.id);
  const rotationRows = (plan?.rotation ?? []).map((player: any, index: number) => ({
    slot: index + 1,
    player: player.name,
    pos: player.pos ?? player.position ?? '',
    k2: playerK2(player, season),
    targetMin: Number(Number(plan.minuteTargets?.[index] ?? 0).toFixed(1)),
    injury: Number(player.injury?.gamesRemaining ?? 0) > 0 ? `${player.injury?.type ?? 'inj'} ${player.injury.gamesRemaining}g` : '',
    fatigue: Number(Number(player.trainingFatigue ?? 0).toFixed(1)),
  }));
  const games = teamGameRows(state, team, strengthByTid);
  const badLosses = games.filter(row => row.result === 'L' && row.strDiff >= 8);
  const boxRows = boxRowsForTeam(state, team);
  const targetSummary = rows.find(row => row.tid === team.id);

  console.group(`%cSIMAUDIT TEAM ${team.abbrev ?? team.name}`, 'color:#60a5fa;font-weight:bold');
  console.log({
    team: getTeamFullName(team),
    record: targetSummary?.record,
    conferenceRank: targetSummary?.rank,
    strengthRank: targetSummary?.strengthRank,
    displayOvr: targetSummary?.displayOvr,
    rotationStrength: targetSummary?.rotationStrength,
    rotationSource: plan?.source,
    starMpgTarget: plan?.starMpgTarget,
  });
  console.log('Roster by K2 OVR');
  console.table(rosterRows);
  console.log('Current sim rotation/minute targets');
  console.table(rotationRows);
  console.log('Recent games');
  console.table(games.slice(-20).reverse());
  if (badLosses.length > 0) {
    console.warn(`Losses as +8 current-strength favorite: ${badLosses.length}. Older games may predate trades/progression.`);
    console.table(badLosses.slice(-20).reverse());
  }
  console.log('Recent box-score shooting/top scorers');
  console.table(boxRows);
  console.groupEnd();

  const tsv = [
    'section\tteam\tfield1\tfield2\tfield3\tfield4\tfield5\tfield6',
    ...rosterRows.map(row => ['roster', team.abbrev, row.player, row.pos, row.k2, row.injury || 'healthy', row.mpg, row.ppg].join('\t')),
    ...games.slice(-20).map(row => ['game', team.abbrev, row.date, `${row.site} ${row.opp}`, row.score, row.result, row.margin, row.strDiff].join('\t')),
  ].join('\n');
  return tsv;
}

export async function runSimOutcomeAudit(state: GameState, target?: string | number): Promise<CheatResult> {
  const { rows, strengthByTid, planByTid } = buildTeamRows(state);
  const targetTeam = resolveTargetTeam(state, target);
  const suspicious = rows
    .filter(row => row.gp >= 10 && Math.abs(row.rankDelta) >= 5)
    .sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta));

  console.group('%c🏀 SIMAUDIT', 'color:#f59e0b;font-weight:bold');
  console.log({
    date: state.date,
    season: state.leagueStats?.year,
    simulatorMode: getSimulatorMode(),
    target: targetTeam ? `${targetTeam.abbrev ?? targetTeam.id} ${getTeamFullName(targetTeam)}` : 'none',
  });
  console.log('Conference standings vs rotation strength');
  console.table(rows);
  console.log('Suspicious rank/strength mismatches');
  if (suspicious.length > 0) console.table(suspicious);
  else console.log('No 5+ rank/strength mismatches after 10+ games.');
  console.groupEnd();

  const leagueTsv = [
    'section\tconf\trank\tstrengthRank\trankDelta\tteam\trecord\twinPct\tdisplayOvr\trotationStrength\thealthy\tinjured\ttopTwo',
    ...rows.map(row => [
      'team',
      row.conf,
      row.rank,
      row.strengthRank,
      row.rankDelta,
      row.team,
      row.record,
      row.winPct,
      row.displayOvr,
      row.rotationStrength,
      row.healthy,
      row.injured,
      row.topTwo,
    ].join('\t')),
  ].join('\n');
  const teamTsv = targetTeam ? await drillTeam(state, targetTeam, rows, strengthByTid, planByTid) : '';
  await copyTextToClipboard(`${leagueTsv}\n${teamTsv ? `\n${teamTsv}` : ''}`);

  if (typeof window !== 'undefined') {
    (window as any).__simAuditTeam = (teamKey?: string | number) => runSimOutcomeAudit(state, teamKey);
  }

  return {
    title: 'SIMAUDIT',
    body: `Logged ${rows.length} NBA teams and ${suspicious.length} rank/strength mismatch${suspicious.length === 1 ? '' : 'es'}. Copied TSV to clipboard. Run window.__simAuditTeam("HOU") for another team.`,
    ok: true,
  };
}
