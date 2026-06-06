import { NBAPlayer, NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import {
  shootingStarsLegendRatingOf,
  shootingStarsLegendScore,
  shootingStarsLegendStatsForSeason,
  shootingStarsRatingOf,
  shootingStarsScore,
  shootingStarsStatsForSeason,
} from './shootingStarsRatings';

export interface ShootingStarsTeam {
  teamId: string;
  label: string;
  playerIds: string[];
  playerNames: string[];
  timeSec: number;
  round1Time?: number | null;
  finalTime?: number | null;
}

export interface ShootingStarsShotAttempt {
  attempt: number;
  shooterId: string;
  shooterName: string;
  made: boolean;
  durationSec: number;
}

export interface ShootingStarsStationRun {
  shotIndex: number;
  shotType: 'BANK_SHOT' | 'TOP_OF_KEY' | 'THREE_POINT' | 'HALF_COURT';
  shotLabel: string;
  shooterId: string;
  shooterName: string;
  moveTimeSec: number;
  timeSec: number;
  attempts: ShootingStarsShotAttempt[];
}

export interface ShootingStarsRunLog {
  teamId: string;
  label: string;
  round: 1 | 2;
  timeSec: number;
  stations: ShootingStarsStationRun[];
}

export interface ShootingStarsResult {
  teams: ShootingStarsTeam[];
  winnerTeamId: string;
  winnerLabel: string;
  log: string[];
  runs?: ShootingStarsRunLog[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isLegend = (player: NBAPlayer) => !(player as any).diedYear && (player.status === 'Retired' || !!player.retiredYear || !!player.hof);

const ratingOf = (player: NBAPlayer, key: 'tp' | 'fg' | 'ins' | 'spd', season?: number) =>
  isLegend(player) ? shootingStarsLegendRatingOf(player, key, season) : shootingStarsRatingOf(player, key);

const scoreOf = (player: NBAPlayer, season?: number) =>
  isLegend(player) ? shootingStarsLegendScore(player, season) : shootingStarsScore(player);

const statsOf = (player: NBAPlayer, season?: number) =>
  isLegend(player) ? shootingStarsLegendStatsForSeason(player, season) : shootingStarsStatsForSeason(player, season);

const makeProbability = (player: NBAPlayer, key: 'tp' | 'fg' | 'ins', season?: number, halfcourt = false): number => {
  const rating = ratingOf(player, key, season);
  const stats = statsOf(player, season);
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

const SHOOTING_STATIONS = [
  { shotType: 'BANK_SHOT' as const, shotLabel: 'Bank Shot', key: 'ins' as const, maxAttempts: 4, moveBase: 2.2 },
  { shotType: 'TOP_OF_KEY' as const, shotLabel: 'Top of Key', key: 'fg' as const, maxAttempts: 5, moveBase: 2.8 },
  { shotType: 'THREE_POINT' as const, shotLabel: 'NBA Three', key: 'tp' as const, maxAttempts: 6, moveBase: 3.2 },
  { shotType: 'HALF_COURT' as const, shotLabel: 'Halfcourt Shot', key: 'tp' as const, maxAttempts: 12, moveBase: 3.8, halfcourt: true },
];

const scaleRunStations = (stations: ShootingStarsStationRun[], targetTime: number) => {
  const rawTotal = stations.reduce((sum, station) => sum + station.timeSec, 0);
  const scale = rawTotal > 0 ? targetTime / rawTotal : 1;
  const scaled = stations.map(station => {
    const moveTimeSec = Number((station.moveTimeSec * scale).toFixed(3));
    const attempts = station.attempts.map(attempt => ({ ...attempt, durationSec: Number((attempt.durationSec * scale).toFixed(3)) }));
    return {
      ...station,
      moveTimeSec,
      attempts,
      timeSec: Number((moveTimeSec + attempts.reduce((sum, attempt) => sum + attempt.durationSec, 0)).toFixed(3)),
    };
  });
  const delta = Number((targetTime - scaled.reduce((sum, station) => sum + station.timeSec, 0)).toFixed(3));
  if (Math.abs(delta) > 0 && scaled.length > 0) {
    const lastStation = scaled[scaled.length - 1];
    const lastAttempt = lastStation.attempts[lastStation.attempts.length - 1];
    if (lastAttempt) lastAttempt.durationSec = Number((lastAttempt.durationSec + delta).toFixed(3));
    lastStation.timeSec = Number((lastStation.moveTimeSec + lastStation.attempts.reduce((sum, attempt) => sum + attempt.durationSec, 0)).toFixed(3));
  }
  return scaled;
};

const simulateRun = (
  teamPlayers: NBAPlayer[],
  season: number | undefined,
  context: { teamId: string; label: string; round: 1 | 2 },
): ShootingStarsRunLog => {
  const ordered = [...teamPlayers].sort((a, b) => scoreOf(b, season) - scoreOf(a, season));
  const bestInside = [...teamPlayers].sort((a, b) => ratingOf(b, 'ins', season) + ratingOf(b, 'fg', season) - ratingOf(a, 'ins', season) - ratingOf(a, 'fg', season))[0] ?? ordered[0];
  const bestMid = [...teamPlayers].sort((a, b) => ratingOf(b, 'fg', season) - ratingOf(a, 'fg', season))[0] ?? ordered[0];
  const bestThree = [...teamPlayers].sort((a, b) => ratingOf(b, 'tp', season) - ratingOf(a, 'tp', season))[0] ?? ordered[0];
  const halfcourtOrder = [...teamPlayers].sort((a, b) => ratingOf(b, 'tp', season) + ratingOf(b, 'spd', season) * 0.15 - ratingOf(a, 'tp', season) - ratingOf(a, 'spd', season) * 0.15);
  const stationShooters = [bestInside, bestMid, bestThree];

  const stations = SHOOTING_STATIONS.map((station, shotIndex): ShootingStarsStationRun => {
    const primaryShooter = station.halfcourt ? halfcourtOrder[0] ?? ordered[0] : stationShooters[shotIndex] ?? ordered[0];
    const speed = ratingOf(primaryShooter, 'spd', season);
    const moveTimeSec = station.moveBase + clamp((78 - speed) * 0.025, -0.35, 0.85);
    const shotTime = station.halfcourt ? 1.25 : 0.85;
    const resetTime = station.halfcourt ? 1.75 : 1.15;
    const attempts: ShootingStarsShotAttempt[] = [];
    let made = false;

    while (!made && attempts.length < station.maxAttempts) {
      const shooter = station.halfcourt
        ? halfcourtOrder[attempts.length % Math.max(1, halfcourtOrder.length)] ?? primaryShooter
        : primaryShooter;
      const probability = makeProbability(shooter, station.key, season, station.halfcourt);
      made = Math.random() < probability || attempts.length === station.maxAttempts - 1;
      const passReset = station.halfcourt && attempts.length > 0 ? 0.45 + clamp((78 - ratingOf(shooter, 'spd', season)) * 0.01, -0.12, 0.25) : 0;
      attempts.push({
        attempt: attempts.length + 1,
        shooterId: shooter.internalId,
        shooterName: shooter.name,
        made,
        durationSec: shotTime + (made ? 0 : resetTime) + passReset,
      });
    }

    return {
      shotIndex,
      shotType: station.shotType,
      shotLabel: station.shotLabel,
      shooterId: primaryShooter.internalId,
      shooterName: primaryShooter.name,
      moveTimeSec,
      attempts,
      timeSec: moveTimeSec + attempts.reduce((sum, attempt) => sum + attempt.durationSec, 0),
    };
  });

  const chemistry = teamPlayers.every(player => player.tid === teamPlayers[0]?.tid) ? -0.6 : 0.3;
  const variance = (Math.random() - 0.5) * 3.2;
  const rawTotal = stations.reduce((sum, station) => sum + station.timeSec, 0);
  const timeSec = Math.round(Math.max(24, rawTotal + chemistry + variance) * 10) / 10;

  return {
    ...context,
    timeSec,
    stations: scaleRunStations(stations, timeSec),
  };
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
      .sort((a, b) => scoreOf(b, season) - scoreOf(a, season));
    const legends = players
      .filter(p => !(p as any).diedYear && (p.status === 'Retired' || !!p.retiredYear || !!p.hof))
      .sort((a, b) => scoreOf(b, season) - scoreOf(a, season));

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
        const aBest = Math.max(...currentNba.filter(player => player.tid === a.id).map(player => scoreOf(player, season)));
        const bBest = Math.max(...currentNba.filter(player => player.tid === b.id).map(player => scoreOf(player, season)));
        return bBest - aBest;
      });

    const entries: NBAPlayer[] = [];
    for (const team of orderedTeams) {
      if (entries.length >= teamCount * 3) break;
      const city = teamCity(team);
      const nba = currentNba.filter(player => player.tid === team.id).sort((a, b) => scoreOf(b, season) - scoreOf(a, season))[0];
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
      .map(teamPlayers => [...teamPlayers].sort((a, b) => scoreOf(b, season) - scoreOf(a, season)).slice(0, 3))
      .filter(teamPlayers => teamPlayers.length === 3)
      .sort((a, b) => b.reduce((sum, p) => sum + scoreOf(p, season), 0) - a.reduce((sum, p) => sum + scoreOf(p, season), 0))
      .slice(0, teamCount)
      .flat();
  }

  static simulate(contestants: NBAPlayer[], teamCount: number, playersPerTeam: number, nbaTeams: NBATeam[] = [], season?: number): ShootingStarsResult {
    const log: string[] = ['Welcome to the Shooting Stars Challenge!'];
    const runs: ShootingStarsRunLog[] = [];

    const resultTeams: ShootingStarsTeam[] = [];
    for (let i = 0; i < teamCount; i++) {
      const teamPlayers = contestants.slice(i * playersPerTeam, (i + 1) * playersPerTeam);
      if (teamPlayers.length === 0) continue;
      const anchorTeam = nbaTeams.find(team => team.id === teamPlayers[0]?.tid) ?? nbaTeams[i];
      const label = anchorTeam ? getTeamFullName(anchorTeam) : `Team ${String.fromCharCode(65 + i)}`;
      const teamId = anchorTeam ? String(anchorTeam.id) : `ss-team-${i}`;
      const round1Run = simulateRun(teamPlayers, season, { teamId, label, round: 1 });
      runs.push(round1Run);
      resultTeams.push({
        teamId,
        label,
        playerIds: teamPlayers.map(p => p.internalId),
        playerNames: teamPlayers.map(p => p.name),
        timeSec: round1Run.timeSec,
        round1Time: round1Run.timeSec,
        finalTime: null,
      });
      log.push(`${label} (${teamPlayers.map(p => p.name).join(', ')}) finishes Round 1 in ${round1Run.timeSec}s.`);
    }

    const finalists = [...resultTeams].sort((a, b) => (a.round1Time ?? a.timeSec) - (b.round1Time ?? b.timeSec)).slice(0, 2);
    finalists.forEach(finalist => {
      const playersForTeam = finalist.playerIds
        .map(playerId => contestants.find(player => player.internalId === playerId))
        .filter((player): player is NBAPlayer => !!player);
      const finalRun = simulateRun(playersForTeam, season, { teamId: finalist.teamId, label: finalist.label, round: 2 });
      runs.push(finalRun);
      finalist.finalTime = finalRun.timeSec;
      finalist.timeSec = finalRun.timeSec;
      log.push(`${finalist.label} posts ${finalRun.timeSec}s in the final.`);
    });

    resultTeams.sort((a, b) => {
      const at = a.finalTime ?? (a.round1Time ?? a.timeSec) + 10000;
      const bt = b.finalTime ?? (b.round1Time ?? b.timeSec) + 10000;
      return at - bt;
    });
    const winner = resultTeams[0];
    log.push(`${winner.label} wins the Shooting Stars Challenge with a time of ${winner.timeSec}s!`);

    return { teams: resultTeams, winnerTeamId: winner.teamId, winnerLabel: winner.label, log, runs };
  }
}
