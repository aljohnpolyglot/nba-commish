import { NBAPlayer, NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';

export interface ShootingStarsTeam {
  teamId: string;
  label: string;
  playerIds: string[];
  playerNames: string[];
  timeSec: number;
  round1Time?: number | null;
  finalTime?: number | null;
}

export interface ShootingStarsResult {
  teams: ShootingStarsTeam[];
  winnerTeamId: string;
  winnerLabel: string;
  log: string[];
}

type ShootingRatingKey = 'tp' | 'fg' | 'ins' | 'spd';

const ratingOf = (p: NBAPlayer, key: ShootingRatingKey): number => {
  const r = p.ratings?.[p.ratings.length - 1] as any;
  return (r?.[key] ?? 50);
};

const score = (p: NBAPlayer) => ratingOf(p, 'tp') * 0.45 + ratingOf(p, 'fg') * 0.3 + ratingOf(p, 'ins') * 0.15 + ratingOf(p, 'spd') * 0.1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const currentOrLatestStats = (player: NBAPlayer, season?: number) => {
  const rows = (player.stats ?? []).filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0);
  const seasonRows = season != null ? rows.filter(stat => stat.season === season) : [];
  const source = seasonRows.length > 0
    ? seasonRows
    : rows.filter(stat => stat.season === Math.max(...rows.map(row => row.season ?? 0)));

  if (source.length === 0) return null;

  return source.reduce((acc, row) => ({
    gp: acc.gp + (row.gp ?? 0),
    fg: acc.fg + (row.fg ?? 0),
    fga: acc.fga + (row.fga ?? 0),
    tp: acc.tp + (row.tp ?? 0),
    tpa: acc.tpa + (row.tpa ?? 0),
  }), { gp: 0, fg: 0, fga: 0, tp: 0, tpa: 0 });
};

const makeProbability = (player: NBAPlayer, key: 'tp' | 'fg' | 'ins', season?: number, halfcourt = false): number => {
  const rating = ratingOf(player, key);
  const stats = currentOrLatestStats(player, season);
  const ratingComponent = clamp((rating - 35) / 65, 0, 1);
  const statComponent = stats
    ? key === 'tp'
      ? (stats.tpa > 0 ? clamp((stats.tp / stats.tpa - 0.25) / 0.2, -0.4, 0.5) : 0)
      : (stats.fga > 0 ? clamp((stats.fg / stats.fga - 0.42) / 0.18, -0.3, 0.45) : 0)
    : 0;
  const volumeComponent = stats && stats.gp > 0 && key === 'tp'
    ? clamp((stats.tpa / stats.gp - 3) / 8, -0.15, 0.22)
    : 0;
  const base = halfcourt ? 0.065 : key === 'tp' ? 0.38 : key === 'fg' ? 0.6 : 0.72;
  const max = halfcourt ? 0.19 : key === 'tp' ? 0.62 : 0.88;
  return clamp(base + ratingComponent * (halfcourt ? 0.1 : 0.22) + statComponent * 0.12 + volumeComponent, 0.035, max);
};

const simulateStation = (
  player: NBAPlayer,
  key: 'tp' | 'fg' | 'ins',
  season: number | undefined,
  options: { halfcourt?: boolean; maxAttempts: number; moveBase: number },
) => {
  const probability = makeProbability(player, key, season, options.halfcourt);
  let attempts = 1;
  while (attempts < options.maxAttempts && Math.random() > probability) attempts += 1;
  const speed = ratingOf(player, 'spd');
  const resetTime = options.halfcourt ? 1.75 : 1.15;
  const shotTime = options.halfcourt ? 1.25 : 0.85;
  return options.moveBase + clamp((78 - speed) * 0.025, -0.35, 0.85) + attempts * shotTime + Math.max(0, attempts - 1) * resetTime;
};

const simulateRun = (teamPlayers: NBAPlayer[], season?: number): number => {
  const ordered = [...teamPlayers].sort((a, b) => score(b) - score(a));
  const bestInside = [...teamPlayers].sort((a, b) => ratingOf(b, 'ins') + ratingOf(b, 'fg') - ratingOf(a, 'ins') - ratingOf(a, 'fg'))[0] ?? ordered[0];
  const bestMid = [...teamPlayers].sort((a, b) => ratingOf(b, 'fg') - ratingOf(a, 'fg'))[0] ?? ordered[0];
  const bestThree = [...teamPlayers].sort((a, b) => ratingOf(b, 'tp') - ratingOf(a, 'tp'))[0] ?? ordered[0];
  const halfcourtOrder = [...teamPlayers].sort((a, b) => ratingOf(b, 'tp') + ratingOf(b, 'spd') * 0.15 - ratingOf(a, 'tp') - ratingOf(a, 'spd') * 0.15);

  let total = 0;
  total += simulateStation(bestInside, 'ins', season, { maxAttempts: 4, moveBase: 2.2 });
  total += simulateStation(bestMid, 'fg', season, { maxAttempts: 5, moveBase: 2.8 });
  total += simulateStation(bestThree, 'tp', season, { maxAttempts: 6, moveBase: 3.2 });

  let halfcourtMade = false;
  let halfcourtAttempts = 0;
  while (!halfcourtMade && halfcourtAttempts < 12) {
    const shooter = halfcourtOrder[halfcourtAttempts % Math.max(1, halfcourtOrder.length)];
    halfcourtAttempts += 1;
    total += simulateStation(shooter, 'tp', season, { halfcourt: true, maxAttempts: 1, moveBase: halfcourtAttempts === 1 ? 3.8 : 0.5 });
    halfcourtMade = Math.random() < makeProbability(shooter, 'tp', season, true) || halfcourtAttempts === 12;
  }

  const chemistry = teamPlayers.every(player => player.tid === teamPlayers[0]?.tid) ? -0.6 : 0.3;
  const variance = (Math.random() - 0.5) * 3.2;
  return Math.round(Math.max(24, total + chemistry + variance) * 10) / 10;
};

const cityOf = (value?: string): string => {
  const raw = (value ?? '').split(',')[0].toLowerCase().trim();
  if (['inglewood', 'hollywood', 'anaheim'].includes(raw)) return 'los angeles';
  if (raw === 'la') return 'los angeles';
  if (raw === 'ny') return 'new york';
  return raw;
};

const teamCity = (team: any): string => cityOf(team?.region ?? team?.city ?? team?.name);

const playerTeamIds = (player: NBAPlayer): number[] => {
  const ids = new Set<number>();
  if (player.tid >= 0 && player.tid < 100) ids.add(player.tid);
  player.stats?.forEach(stat => {
    if (stat.tid >= 0 && stat.tid < 100) ids.add(stat.tid);
  });
  player.transactions?.forEach(tx => {
    if (tx.tid >= 0 && tx.tid < 100) ids.add(tx.tid);
  });
  if (player.draft?.tid != null && player.draft.tid >= 0 && player.draft.tid < 100) ids.add(player.draft.tid);
  return [...ids];
};

export class AllStarShootingStarsSim {
  static selectContestants(
    players: NBAPlayer[],
    season: number,
    totalPlayers: number,
    teams: NBATeam[] = [],
    nonNBATeams: any[] = [],
    hostCity?: string,
  ): NBAPlayer[] {
    const currentNba = players.filter(p =>
      p.tid >= 0 &&
      p.tid < 100 &&
      !(p as any).diedYear &&
      p.status !== 'Retired' &&
      p.stats?.some(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0)
    );
    const wnbaPlayers = players
      .filter(p => p.status === 'WNBA' && !(p as any).diedYear)
      .sort((a, b) => score(b) - score(a));
    const legends = players
      .filter(p => !(p as any).diedYear && (p.status === 'Retired' || !!p.retiredYear || !!p.hof))
      .sort((a, b) => score(b) - score(a));

    const teamCount = Math.max(2, Math.floor(totalPlayers / 3));
    const nbaTeams = teams.length
      ? teams
      : Array.from(new Set(currentNba.map(p => p.tid))).map(tid => ({ id: tid, name: `Team ${tid}`, abbrev: `T${tid}`, region: '' } as any));
    const wnbaTeams = nonNBATeams.filter(team => team.league === 'WNBA');
    const usedWnba = new Set<string>();
    const usedLegends = new Set<string>();
    const host = cityOf(hostCity);

    const orderedTeams = [...nbaTeams]
      .filter(team => currentNba.some(player => player.tid === team.id))
      .sort((a: any, b: any) => {
        const ah = host && teamCity(a) === host ? 1 : 0;
        const bh = host && teamCity(b) === host ? 1 : 0;
        if (ah !== bh) return bh - ah;
        const aBest = Math.max(...currentNba.filter(player => player.tid === a.id).map(score));
        const bBest = Math.max(...currentNba.filter(player => player.tid === b.id).map(score));
        return bBest - aBest;
      });

    const entries: NBAPlayer[] = [];
    for (const team of orderedTeams) {
      if (entries.length >= teamCount * 3) break;
      const city = teamCity(team);
      const nba = currentNba.filter(player => player.tid === team.id).sort((a, b) => score(b) - score(a))[0];
      if (!nba) continue;

      const matchingWnbaTids = wnbaTeams.filter(wnbaTeam => teamCity(wnbaTeam) === city).map(wnbaTeam => wnbaTeam.tid);
      const wnba = wnbaPlayers.find(player =>
        !usedWnba.has(player.internalId) &&
        (matchingWnbaTids.includes(player.tid) || matchingWnbaTids.length === 0)
      ) ?? wnbaPlayers.find(player => !usedWnba.has(player.internalId));
      const legend = legends.find(player => !usedLegends.has(player.internalId) && playerTeamIds(player).includes(team.id))
        ?? legends.find(player => !usedLegends.has(player.internalId));
      if (!wnba || !legend) continue;

      usedWnba.add(wnba.internalId);
      usedLegends.add(legend.internalId);
      entries.push(nba, wnba, legend);
    }

    if (entries.length >= 6) return entries.slice(0, teamCount * 3);

    const grouped = new Map<number, NBAPlayer[]>();
    currentNba.forEach(player => {
      if (!grouped.has(player.tid)) grouped.set(player.tid, []);
      grouped.get(player.tid)!.push(player);
    });
    return Array.from(grouped.values())
      .map(teamPlayers => [...teamPlayers].sort((a, b) => score(b) - score(a)).slice(0, 3))
      .filter(teamPlayers => teamPlayers.length === 3)
      .sort((a, b) => b.reduce((sum, p) => sum + score(p), 0) - a.reduce((sum, p) => sum + score(p), 0))
      .slice(0, teamCount)
      .flat();
  }

  static simulate(contestants: NBAPlayer[], teamCount: number, playersPerTeam: number, nbaTeams: NBATeam[] = [], season?: number): ShootingStarsResult {
    const log: string[] = ['Welcome to the Shooting Stars Challenge!'];

    const resultTeams: ShootingStarsTeam[] = [];
    for (let i = 0; i < teamCount; i++) {
      const teamPlayers = contestants.slice(i * playersPerTeam, (i + 1) * playersPerTeam);
      if (teamPlayers.length === 0) continue;
      const round1Time = simulateRun(teamPlayers, season);
      const anchorTeam = nbaTeams.find(team => team.id === teamPlayers[0]?.tid);
      const label = anchorTeam ? getTeamFullName(anchorTeam) : `Team ${String.fromCharCode(65 + i)}`;
      resultTeams.push({
        teamId: anchorTeam ? String(anchorTeam.id) : `ss-team-${i}`,
        label,
        playerIds: teamPlayers.map(p => p.internalId),
        playerNames: teamPlayers.map(p => p.name),
        timeSec: round1Time,
        round1Time,
        finalTime: null,
      });
      log.push(`${label} (${teamPlayers.map(p => p.name).join(', ')}) finishes Round 1 in ${round1Time}s.`);
    }

    const finalists = [...resultTeams].sort((a, b) => (a.round1Time ?? a.timeSec) - (b.round1Time ?? b.timeSec)).slice(0, 2);
    finalists.forEach(finalist => {
      const playersForTeam = finalist.playerIds
        .map(playerId => contestants.find(player => player.internalId === playerId))
        .filter((player): player is NBAPlayer => !!player);
      const finalTime = simulateRun(playersForTeam, season);
      finalist.finalTime = finalTime;
      finalist.timeSec = finalTime;
      log.push(`${finalist.label} posts ${finalTime}s in the final.`);
    });

    resultTeams.sort((a, b) => {
      const at = a.finalTime ?? (a.round1Time ?? a.timeSec) + 10000;
      const bt = b.finalTime ?? (b.round1Time ?? b.timeSec) + 10000;
      return at - bt;
    });
    const winner = resultTeams[0];
    log.push(`${winner.label} wins the Shooting Stars Challenge with a time of ${winner.timeSec}s!`);

    return { teams: resultTeams, winnerTeamId: winner.teamId, winnerLabel: winner.label, log };
  }
}
