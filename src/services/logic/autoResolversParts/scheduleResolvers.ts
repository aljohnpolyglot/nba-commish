import type { GameState, NBACupState, NonNBATeam } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';
import { getRolloverDate, toISODateString } from '../../../utils/dateUtils';
import { isNbaCupEnabled } from '../../../utils/ruleFlags';
import { generateSchedule } from '../../gameScheduler';
import { generateForCompetition, selectCompetitionTeamTids } from '../../competition/competitionScheduler';
import { drawCupGroups } from '../../nbaCup/drawGroups';
import { injectCupGroupGames } from '../../nbaCup/scheduleInjector';

export const autoGenerateSchedule = (state: GameState): Partial<GameState> => {
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const year = state.leagueStats.year;
  const seasonStart = `${year - 1}-10-01`;
  const seasonEnd = pbaIsolated
    ? `${year}-06-30`
    : toISODateString(getRolloverDate(year, state.leagueStats as any, state.schedule as any));
  const hasRegularSeason = state.schedule.some(
    g => !(g as any).competitionId
         && !(g as any).isPreseason
         && !(g as any).isPlayoff
         && !(g as any).isPlayIn
         && !(g as any).isNBACup
         && !(g as any).isCupTBD
         && normalizeDate(g.date) >= seasonStart && normalizeDate(g.date) <= seasonEnd
  );
  if (hasRegularSeason) {
    if (isNbaCupEnabled(state.leagueStats) && state.nbaCup?.groups?.length) {
      const hasCupGames = state.schedule.some(g => (g as any).isNBACup);
      if (!hasCupGames) {
        console.log('[autoGenerateSchedule] Self-heal: schedule exists but no Cup games tagged → injecting now');
        const scheduledDates: Record<string, Set<number>> = {};
        for (const g of state.schedule as any[]) {
          const ds = String(g.date).split('T')[0];
          if (!scheduledDates[ds]) scheduledDates[ds] = new Set<number>();
          scheduledDates[ds].add(g.homeTid);
          scheduledDates[ds].add(g.awayTid);
        }
        const maxGid = Math.max(0, ...state.schedule.map(g => g.gid));
        const result = injectCupGroupGames([], maxGid + 1, state.nbaCup.groups, state.saveId || 'default', year - 1, scheduledDates, { excludeFromRecord: true });
        if (result.games.length > 0) {
          const merged = [...state.schedule, ...result.games].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          return { schedule: merged };
        }
      }
    }
    return {};
  }

  const intlPreseasonGames = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
         && g.date >= seasonStart
  );
  let nbaCupPatch: NBACupState | undefined;
  const cupEnabled = isNbaCupEnabled(state.leagueStats);
  let cupGroups = cupEnabled ? (state.nbaCup?.groups ?? []) : [];
  if (cupEnabled && cupGroups.length === 0) {
    const prevStandings = state.teams.map(t => ({ tid: t.id, wins: t.wins, losses: t.losses }));
    cupGroups = drawCupGroups(state.teams, prevStandings, state.saveId ?? 'default', state.leagueStats.year);
    nbaCupPatch = {
      year: state.leagueStats.year,
      status: 'group',
      groups: cupGroups,
      wildcards: { East: null, West: null },
      knockout: [],
    };
  }

  const generatedSchedule = generateSchedule(
    state.teams,
    state.christmasGames,
    state.globalGames,
    state.leagueStats.numGamesDiv ?? null,
    state.leagueStats.numGamesConf ?? null,
    state.leagueStats.mediaRights,
    state.leagueStats.year,
    cupGroups.length > 0 ? cupGroups : undefined,
    state.saveId,
  );
  let schedule = generatedSchedule;
  if (pbaIsolated) {
    const maxExistingGid = Math.max(0, ...state.schedule.map(g => g.gid));
    const backgroundNbaGames = generatedSchedule.map((game, index) => ({
      ...game,
      gid: maxExistingGid + 1 + index,
    }));
    schedule = [...state.schedule, ...backgroundNbaGames].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid,
    );
  } else if (state.activeCompetitions?.length) {
    const compGames = state.activeCompetitions.flatMap((spec, index) => {
      const teams = selectCompetitionTeamTids(spec, state).map(tid => ({ tid }));
      const start = new Date(`${state.leagueStats.year - 1}-${String(spec.seasonStart.month).padStart(2, '0')}-${String(spec.seasonStart.day).padStart(2, '0')}T00:00:00Z`);
      return generateForCompetition(spec, teams, start, 700_000 + index * 50_000);
    });
    schedule = [...schedule, ...compGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  if (!pbaIsolated && intlPreseasonGames.length > 0) {
    const maxGid = Math.max(0, ...schedule.map(g => g.gid));
    const renumbered = intlPreseasonGames.map((g, i) => ({ ...g, gid: maxGid + 1 + i }));
    schedule = [...schedule, ...renumbered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }
  return nbaCupPatch ? { schedule, nbaCup: nbaCupPatch } : { schedule };
};

export const autoScheduleIntlPreseason = (state: GameState): Partial<GameState> => {
  const y1 = state.leagueStats.year - 1;
  const seasonStart = `${y1}-10-01`;
  const existingIntl = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
       && g.date >= seasonStart
  );
  if (existingIntl.length > 0) return {};

  const nonNBATeams: NonNBATeam[] = (state as any).nonNBATeams ?? [];
  if (nonNBATeams.length === 0) return {};

  const playersByTid = new Map<number, number[]>();
  state.players.forEach(p => {
    if (!playersByTid.has(p.tid)) playersByTid.set(p.tid, []);
    playersByTid.get(p.tid)!.push(p.overallRating ?? 70);
  });
  const teamStrength = (tid: number) => {
    const ratings = playersByTid.get(tid);
    if (!ratings || ratings.length === 0) return 0;
    return ratings.reduce((s, r) => s + r, 0) / ratings.length;
  };

  const sortedNBA = [...state.teams].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const usedNBA = new Set<number>();
  const pickNBA = () => {
    const pool = sortedNBA.filter(t => !usedNBA.has(t.id)).slice(0, 5);
    if (pool.length === 0) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedNBA.add(pick.id);
    return pick;
  };

  const playerCount = (tid: number) => playersByTid.get(tid)?.length ?? 0;
  const usedNonNBA = new Set<number>();
  const pickNonNBA = (league: NonNBATeam['league']) => {
    const pool = nonNBATeams
      .filter(t => t.league === league && !usedNonNBA.has(t.tid) && playerCount(t.tid) >= 8)
      .sort((a, b) => teamStrength(b.tid) - teamStrength(a.tid))
      .slice(0, 5);
    if (pool.length === 0) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedNonNBA.add(pick.tid);
    return pick;
  };

  let gid = Math.max(0, ...state.schedule.map(g => g.gid)) + 1;
  const makeGame = (nba: any, nonNBA: NonNBATeam, date: string) => ({
    gid: gid++,
    homeTid: nba.id,
    awayTid: nonNBA.tid,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: new Date(`${date}T00:00:00Z`).toISOString(),
    isPreseason: true,
    city: nonNBA.region || 'International',
    country: nonNBA.league,
  });

  const plan: [NonNBATeam['league'], string][] = [
    ['Euroleague', `${y1}-10-02`],
    ['B-League', `${y1}-10-04`],
    ['Euroleague', `${y1}-10-07`],
    ['China CBA', `${y1}-10-09`],
    ['B-League', `${y1}-10-11`],
    ['NBL Australia', `${y1}-10-13`],
    ['PBA', `${y1}-10-15`],
  ];

  const newGames: any[] = [];
  for (const [league, date] of plan) {
    const nonNBA = pickNonNBA(league);
    const nba = pickNBA();
    if (nonNBA && nba) newGames.push(makeGame(nba, nonNBA, date));
  }

  if (newGames.length === 0) return {};

  const schedule = [...state.schedule, ...newGames].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return { schedule };
};

export const autoPickChristmasGames = (state: GameState): Partial<GameState> => {
  if (state.christmasGames && state.christmasGames.length > 0) return {};
  const east = [...state.teams]
    .filter(t => t.conference === 'East')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 5);
  const west = [...state.teams]
    .filter(t => t.conference === 'West')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 5);

  const games = east.slice(0, 5).map((eTeam, i) => ({
    homeTid: i % 2 === 0 ? eTeam.id : west[i]?.id ?? eTeam.id,
    awayTid: i % 2 === 0 ? west[i]?.id ?? eTeam.id : eTeam.id,
  }));

  return { christmasGames: games };
};

export const autoPickGlobalGames = (state: GameState): Partial<GameState> => {
  if (state.globalGames && state.globalGames.length > 0) return {};
  const y = state.leagueStats.year;
  const y1 = y - 1;
  const sorted = [...state.teams].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const [t1, t2, t3, t4, t5, t6] = sorted;
  if (!t1 || !t2) return { globalGames: [] };

  const globalGames = [
    { homeTid: t1.id, awayTid: t2.id, date: `${y1}-11-08T00:00:00Z`, city: 'London', country: 'UK' },
    { homeTid: t3?.id ?? t1.id, awayTid: t4?.id ?? t2.id, date: `${y1}-11-15T00:00:00Z`, city: 'Paris', country: 'France' },
    { homeTid: t5?.id ?? t1.id, awayTid: t6?.id ?? t2.id, date: `${y1}-11-22T00:00:00Z`, city: 'Mexico City', country: 'Mexico' },
  ];

  return { globalGames };
};
