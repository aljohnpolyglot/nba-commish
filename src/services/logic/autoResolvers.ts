import { GameState } from '../../types';

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
export const autoPickGlobalGames = (_state: GameState): Partial<GameState> => {
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
