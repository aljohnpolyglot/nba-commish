import { GameState, NonNBATeam } from '../../types';
import { generateSchedule } from '../gameScheduler';

// ── Schedule Generation (Aug 14) ──────────────────────────────────────────
export const autoGenerateSchedule = (state: GameState): Partial<GameState> => {
  const hasRegularSeason = state.schedule.some(
    g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn
  );
  if (hasRegularSeason) return {}; // already generated, skip
  const intlPreseasonGames = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
  );
  let schedule = generateSchedule(
    state.teams,
    state.christmasGames,
    state.globalGames,
    state.leagueStats.numGamesDiv ?? null,
    state.leagueStats.numGamesConf ?? null,
    state.leagueStats.mediaRights
  );
  if (intlPreseasonGames.length > 0) {
    // Re-gid intl games to start after the freshly generated schedule's max gid
    // so they never collide with regular/preseason game gids (which start from 0)
    const maxGid = Math.max(0, ...schedule.map(g => g.gid));
    const renumbered = intlPreseasonGames.map((g, i) => ({ ...g, gid: maxGid + 1 + i }));
    schedule = [...schedule, ...renumbered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }
  return { schedule };
};

// ── International Preseason Auto-Schedule (Aug 13) ────────────────────────
// Auto-picks 5 intl preseason games (2 Euroleague, 2 B-League, 1 PBA) if the
// commissioner hasn't scheduled any manually. NBA opponents are drawn from the
// top 5 teams by strength; non-NBA opponents are chosen from the top 5 in each
// league ranked by their players' average overall rating.
export const autoScheduleIntlPreseason = (state: GameState): Partial<GameState> => {
  // Skip if commissioner already scheduled intl preseason games
  const existingIntl = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
  );
  if (existingIntl.length > 0) return {};

  const nonNBATeams: NonNBATeam[] = (state as any).nonNBATeams ?? [];
  if (nonNBATeams.length === 0) return {};

  // Compute non-NBA team strength from player average rating
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

  // NBA opponents: pick randomly from top 5 by strength, no repeats
  const sortedNBA = [...state.teams].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const usedNBA = new Set<number>();
  const pickNBA = () => {
    const pool = sortedNBA.filter(t => !usedNBA.has(t.id)).slice(0, 5);
    if (pool.length === 0) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedNBA.add(pick.id);
    return pick;
  };

  // Non-NBA opponents: pick randomly from top 5 by player strength, no repeats
  // Require at least 9 players so the sim can field a proper rotation
  const playerCount = (tid: number) => playersByTid.get(tid)?.length ?? 0;
  const usedNonNBA = new Set<number>();
  const pickNonNBA = (league: NonNBATeam['league']) => {
    const pool = nonNBATeams
      .filter(t => t.league === league && !usedNonNBA.has(t.tid) && playerCount(t.tid) >= 9)
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

  // Schedule: 2 Euroleague (Oct 2, Oct 8), 2 B-League/Japan (Oct 5, Oct 11), 1 PBA (Oct 14)
  const plan: [NonNBATeam['league'], string][] = [
    ['Euroleague', '2025-10-02'],
    ['B-League',   '2025-10-05'],
    ['Euroleague', '2025-10-08'],
    ['B-League',   '2025-10-11'],
    ['PBA',        '2025-10-14'],
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

// ── Christmas Games ────────────────────────────────────────────────────────
export const autoPickChristmasGames = (state: GameState): Partial<GameState> => {
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

// ── Global Games ───────────────────────────────────────────────────────────
export const autoPickGlobalGames = (state: GameState): Partial<GameState> => {
  // Don't overwrite games the commissioner already configured
  if (state.globalGames && state.globalGames.length > 0) return {};
  return { globalGames: [] };
};

// ── All-Star Voting ────────────────────────────────────────────────────────
export const autoSimVotes = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { getAllStarWeekendDates } = await import('../allStar/AllStarWeekendOrchestrator');
    const { AllStarSelectionService } = await import('../allStar/AllStarSelectionService');
    const dates = getAllStarWeekendDates(state.leagueStats.year);

    const votes = AllStarSelectionService.simulateVotingPeriod(
      state.players,
      state.teams,
      state.leagueStats.year,
      dates.votingEnd,
      [],
      28
    );

    return {
      allStar: {
        season: state.leagueStats.year,
        startersAnnounced: false,
        reservesAnnounced: false,
        roster: [],
        weekendComplete: false,
        ...(state.allStar ?? {}),
        votes,
      } as any,
    };
  } catch (err) {
    console.warn('autoSimVotes failed:', err);
    return {};
  }
};

// ── All-Star Starters ──────────────────────────────────────────────────────
export const autoAnnounceStarters = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarSelectionService } = await import('../allStar/AllStarSelectionService');
    const starters = AllStarSelectionService.selectStarters(
      state.allStar?.votes ?? [],
      state.players
    );
    return {
      allStar: {
        ...(state.allStar as any),
        roster: starters,
        startersAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoAnnounceStarters failed:', err);
    return {};
  }
};

// ── All-Star Reserves + Rising Stars + Celebrity ───────────────────────────
export const autoAnnounceReserves = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarSelectionService } = await import('../allStar/AllStarSelectionService');
    const reserves = AllStarSelectionService.selectReserves(
      state.players,
      state.teams,
      state.leagueStats.year,
      state.allStar?.roster ?? []
    );
    const fullRoster = [...(state.allStar?.roster ?? []), ...reserves];

    let risingStarsRoster: any[] = [];
    try {
      const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(
        state.players,
        state.leagueStats.year
      );
      const getCategory = (pos: string) =>
        pos === 'G' || pos === 'PG' || pos === 'SG' ? 'Guard' : 'Frontcourt';
      risingStarsRoster = [...rookies, ...sophs].map(p => {
        const team = state.teams.find(t => t.id === p.tid);
        return {
          playerId: p.internalId,
          playerName: p.name,
          teamAbbrev: team?.abbrev ?? '',
          conference: team?.conference ?? '',
          isStarter: true,
          position: p.pos ?? 'F',
          category: getCategory(p.pos ?? 'F'),
          isRookie: rookies.includes(p),
          nbaId: (p as any).nbaId,
          imgURL: (p as any).imgURL,
        };
      });
    } catch (e) {
      console.warn('Rising Stars auto-select failed:', e);
    }

    let celebrityRoster: string[] = [];
    try {
      const { fetchRatedCelebrities } = await import('../../data/celebrities');
      const celebs = await fetchRatedCelebrities();
      celebrityRoster = [...celebs].sort(() => Math.random() - 0.5).slice(0, 20).map((c: any) => c.name);
    } catch (e) {
      console.warn('Celebrity roster auto-select failed:', e);
    }

    const broadcasters = ['Shannon', 'Stephen A', 'Chuck', 'Shaq', 'Kenny', 'Ernie'];
    const shuffled = [...broadcasters].sort(() => Math.random() - 0.5);

    return {
      allStar: {
        ...(state.allStar as any),
        roster: fullRoster,
        reservesAnnounced: true,
        risingStarsRoster,
        risingStarsAnnounced: true,
        risingStarsTeams: [`Team ${shuffled[0]}`, `Team ${shuffled[1]}`],
        celebrityAnnounced: true,
        celebrityRoster,
        celebrityTeams: [`Team ${shuffled[2]}`, `Team ${shuffled[3]}`],
      },
    };
  } catch (err) {
    console.warn('autoAnnounceReserves failed:', err);
    return {};
  }
};

// ── Dunk Contest Contestants ───────────────────────────────────────────────
export const autoSelectDunkContestants = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarDunkContestSim } = await import('../allStar/AllStarDunkContestSim');
    const contestants = AllStarDunkContestSim.selectContestants(state.players);
    return {
      allStar: {
        ...(state.allStar as any),
        dunkContestContestants: contestants,
        dunkContestAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoSelectDunkContestants failed:', err);
    return {};
  }
};

// ── 3-Point Contest Contestants ────────────────────────────────────────────
export const autoSelectThreePointContestants = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarThreePointContestSim } = await import('../allStar/AllStarThreePointContestSim');
    const contestants = AllStarThreePointContestSim.selectContestants(
      state.players,
      state.leagueStats.year
    );
    return {
      allStar: {
        ...(state.allStar as any),
        threePointContestants: contestants,
        threePointAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoSelectThreePointContestants failed:', err);
    return {};
  }
};

// ── All-Star Weekend (full sim) ────────────────────────────────────────────
export const autoSimAllStarWeekend = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarWeekendOrchestrator, getAllStarWeekendDates } = await import('../allStar/AllStarWeekendOrchestrator');

    let stateForSim = state;
    if (!(state.allStar as any)?.gamesInjected) {
      const newSchedule = AllStarWeekendOrchestrator.injectAllStarGames(
        state.schedule,
        state.teams,
        state.leagueStats.year,
        state.allStar?.roster ?? [],
        state.leagueStats
      );
      stateForSim = {
        ...state,
        schedule: newSchedule,
        allStar: { ...(state.allStar as any), gamesInjected: true },
      };
    }

    const patch = await AllStarWeekendOrchestrator.simulateWeekend(stateForSim, {
      friday: true,
      saturday: true,
      sunday: true,
    });

    return patch;
  } catch (err) {
    console.warn('autoSimAllStarWeekend failed:', err);
    return {};
  }
};
