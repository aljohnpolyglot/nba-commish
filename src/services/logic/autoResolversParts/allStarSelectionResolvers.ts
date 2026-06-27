import type { GameState } from '../../../types';
import {
  backfillPbaAllStarAwards,
  buildPbaAllStarLeagueStats,
  buildPbaAllStarPatch,
  buildPbaContestPatch,
  emptyPbaAllStarState,
  hasReachedPbaAllStarContestAnnouncement,
  hasReachedPbaAllStarRosterAnnouncement,
  isPbaAllStarStateLocal,
} from '../../pba/allStar';

const skipIsolatedNonNbaAllStar = (state: GameState) =>
  state.leagueStats?.uiMode === 'euro_isolated';

const buildPbaAllStarSelection = async (state: GameState): Promise<Partial<GameState>> => {
  const leagueStats = buildPbaAllStarLeagueStats(state.leagueStats);
  const stateForPba = { ...state, leagueStats } as GameState;
  if (!hasReachedPbaAllStarRosterAnnouncement(stateForPba)) {
    return {
      leagueStats,
      allStar: emptyPbaAllStarState(leagueStats.year) as any,
    };
  }
  const patch = buildPbaAllStarPatch(stateForPba, state.players);
  return {
    ...(patch ?? {}),
    leagueStats,
  };
};

const buildPbaContestSelection = async (state: GameState): Promise<Partial<GameState>> => {
  const leagueStats = buildPbaAllStarLeagueStats(state.leagueStats);
  const stateForPba = { ...state, leagueStats } as GameState;
  if (!hasReachedPbaAllStarRosterAnnouncement(stateForPba)) {
    return {
      leagueStats,
      allStar: emptyPbaAllStarState(leagueStats.year) as any,
    };
  }
  const basePatch: Partial<Pick<GameState, 'players' | 'allStar'>> = stateForPba.allStar?.reservesAnnounced && isPbaAllStarStateLocal(stateForPba, stateForPba.allStar)
    ? {}
    : buildPbaAllStarPatch(stateForPba, stateForPba.players) ?? {};
  const players = basePatch.players ?? state.players;
  const allStar = (basePatch.allStar ?? state.allStar) as any;
  if (!allStar?.reservesAnnounced) {
    return {
      ...basePatch,
      leagueStats,
    };
  }
  return {
    ...basePatch,
    leagueStats,
    allStar: hasReachedPbaAllStarContestAnnouncement({ ...stateForPba, players, allStar } as GameState)
      ? buildPbaContestPatch({ ...stateForPba, players, allStar } as GameState, players, allStar)
      : allStar,
  };
};

export const autoSimVotes = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaAllStarSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if ((state.allStar?.votes?.length ?? 0) > 0) return {};
  try {
    const { getAllStarWeekendDates } = await import('../../allStar/AllStarWeekendOrchestrator');
    const { AllStarSelectionService } = await import('../../allStar/AllStarSelectionService');
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

export const autoAnnounceStarters = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaAllStarSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.allStar?.startersAnnounced) return {};
  try {
    const { AllStarSelectionService, bucketRoster } = await import('../../allStar/AllStarSelectionService');
    let starters = AllStarSelectionService.selectStarters(
      state.allStar?.votes ?? [],
      state.players
    );
    starters = bucketRoster(
      starters,
      state.players,
      state.allStar?.votes ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams
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

export const autoAnnounceReserves = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaAllStarSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.allStar?.reservesAnnounced) return {};
  try {
    const { AllStarSelectionService, bucketRoster } = await import('../../allStar/AllStarSelectionService');
    let reserves = AllStarSelectionService.selectReserves(
      state.players,
      state.teams,
      state.leagueStats.year,
      state.allStar?.roster ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams
    );
    let fullRoster = [...(state.allStar?.roster ?? []), ...reserves];
    fullRoster = bucketRoster(
      fullRoster,
      state.players,
      state.allStar?.votes ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams
    );

    const season = state.leagueStats.year;
    const allStarIds = new Set(fullRoster.map((r: any) => r.playerId));
    const playersWithAllStar = state.players.map(p => {
      if (!allStarIds.has(p.internalId)) return p;
      const already = (p.awards ?? []).some(a => a.season === season && a.type === 'All-Star');
      if (already) return p;
      return { ...p, awards: [...(p.awards ?? []), { season, type: 'All-Star' }] };
    });

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
      const { fetchRatedCelebrities } = await import('../../../data/celebrities');
      const celebs = await fetchRatedCelebrities();
      celebrityRoster = [...celebs].sort(() => Math.random() - 0.5).slice(0, 20).map((c: any) => c.name);
    } catch (e) {
      console.warn('Celebrity roster auto-select failed:', e);
    }

    const broadcasters = ['Shannon', 'Stephen A', 'Chuck', 'Shaq', 'Kenny', 'Ernie'];
    const shuffled = [...broadcasters].sort(() => Math.random() - 0.5);

    return {
      players: playersWithAllStar,
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

export const autoSelectDunkContestants = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaContestSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.allStar?.dunkContestAnnounced) return {};
  try {
    const { AllStarDunkContestSim } = await import('../../allStar/AllStarDunkContestSim');
    const num = state.leagueStats.allStarDunkContestPlayers ?? 4;
    const contestants = AllStarDunkContestSim.selectContestants(state.players, num);
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

export const autoSelectThreePointContestants = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaContestSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.allStar?.threePointAnnounced) return {};
  try {
    const { AllStarThreePointContestSim } = await import('../../allStar/AllStarThreePointContestSim');
    const num = state.leagueStats.allStarThreePointContestPlayers ?? 8;
    const contestants = AllStarThreePointContestSim.selectContestants(
      state.players,
      state.leagueStats.year,
      num
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

export const autoSelectShootingStarsContestants = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.leagueStats.allStarShootingStars === false) return {};
  if ((state.allStar as any)?.shootingStarsAnnounced) return {};
  try {
    const { AllStarShootingStarsSim } = await import('../../allStar/AllStarShootingStarsSim');
    const teams = Math.min(30, Math.max(2, Math.round(state.leagueStats.allStarShootingStarsTeams ?? Math.round((state.leagueStats.allStarShootingStarsTotalPlayers ?? 12) / 3))));
    const num = teams * 3;
    const hostCity = state.leagueStats.allStarHosts?.find((host: any) => host.year === state.leagueStats.year)?.city;
    const contestants = AllStarShootingStarsSim.selectContestants(state.players, state.leagueStats.year, num, state.teams, state.nonNBATeams ?? [], hostCity);
    return {
      allStar: {
        ...(state.allStar as any),
        shootingStarsContestants: contestants,
        shootingStarsAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoSelectShootingStarsContestants failed:', err);
    return {};
  }
};

export const autoSelectSkillsChallengeContestants = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaContestSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.leagueStats.allStarSkillsChallenge !== true) return {};
  if ((state.allStar as any)?.skillsChallengeAnnounced) return {};
  try {
    const { AllStarSkillsChallengeSim } = await import('../../allStar/AllStarSkillsChallengeSim');
    const num = Math.min(30, Math.max(3, Math.round(state.leagueStats.allStarSkillsChallengeTeams ?? state.leagueStats.allStarSkillsChallengeTotalPlayers ?? 4)));
    const contestants = AllStarSkillsChallengeSim.selectContestants(state.players, state.leagueStats.year, num);
    return {
      allStar: {
        ...(state.allStar as any),
        skillsChallengeContestants: contestants,
        skillsChallengeAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoSelectSkillsChallengeContestants failed:', err);
    return {};
  }
};

export const autoSelectHorseContestants = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.leagueStats.allStarHorse !== true) return {};
  if ((state.allStar as any)?.horseAnnounced) return {};
  try {
    const { AllStarHorseSim } = await import('../../allStar/AllStarHorseSim');
    const num = Math.min(10, Math.max(3, Math.round(state.leagueStats.allStarHorseParticipants ?? 3)));
    const contestants = AllStarHorseSim.selectContestants(state.players, state.leagueStats.year, num, state.teams);
    return {
      allStar: {
        ...(state.allStar as any),
        horseContestants: contestants,
        horseAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoSelectHorseContestants failed:', err);
    return {};
  }
};

export function backfillAllStarAwards(state: GameState): Partial<GameState> {
  if (state.leagueStats?.uiMode === 'pba_isolated') {
    return { players: backfillPbaAllStarAwards(state, state.players, state.allStar) };
  }
  if (skipIsolatedNonNbaAllStar(state)) return {};
  const allStarData = state.allStar as any;
  const year = state.leagueStats.year;
  const entries: Array<{ internalId?: string; name?: string; awardType: string }> = [];
  if (allStarData?.dunkContest?.winnerId || allStarData?.dunkContest?.winnerName)
    entries.push({ internalId: allStarData.dunkContest.winnerId, name: allStarData.dunkContest.winnerName, awardType: 'Slam Dunk Contest Winner' });
  if (allStarData?.threePointContest?.winnerId || allStarData?.threePointContest?.winnerName)
    entries.push({ internalId: allStarData.threePointContest.winnerId, name: allStarData.threePointContest.winnerName, awardType: 'Three-Point Contest Winner' });
  if (allStarData?.shootingStars?.winnerTeamId) {
    const winnerTeam = allStarData.shootingStars.teams?.find((team: any) => team.teamId === allStarData.shootingStars.winnerTeamId);
    (winnerTeam?.playerIds ?? []).forEach((playerId: string, index: number) => {
      entries.push({ internalId: playerId, name: winnerTeam.playerNames?.[index], awardType: 'Shooting Stars Winner' });
    });
  }
  if (allStarData?.skillsChallenge?.winnerId || allStarData?.skillsChallenge?.winnerName)
    entries.push({ internalId: allStarData.skillsChallenge.winnerId, name: allStarData.skillsChallenge.winnerName, awardType: 'Skills Challenge Winner' });
  if (allStarData?.horseTournament?.winnerId || allStarData?.horseTournament?.winnerName)
    entries.push({ internalId: allStarData.horseTournament.winnerId, name: allStarData.horseTournament.winnerName, awardType: 'H-O-R-S-E Winner' });
  if (allStarData?.gameMvp?.name)
    entries.push({ name: allStarData.gameMvp.name, awardType: 'All-Star Game MVP' });
  if (allStarData?.throne?.champion?.playerId)
    entries.push({ internalId: allStarData.throne.champion.playerId, name: allStarData.throne.champion.playerName, awardType: 'The Throne' });

  if (entries.length === 0) return {};

  const allPresent = entries.every(e =>
    state.players.some(p =>
      ((e.internalId && p.internalId === e.internalId) ||
       (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())) &&
      (p.awards ?? []).some(a => a.type === e.awardType && a.season === year)
    )
  );
  if (allPresent) return {};

  const updatedPlayers = state.players.map(p => {
    const entry = entries.find(e =>
      (e.internalId && p.internalId === e.internalId) ||
      (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())
    );
    if (!entry) return p;
    if ((p.awards ?? []).some(a => a.type === entry.awardType && a.season === year)) return p;
    return { ...p, awards: [...(p.awards ?? []), { type: entry.awardType, season: year }] };
  });
  return { players: updatedPlayers };
}

const asBackgroundNbaAllStarState = (state: GameState): GameState => ({
  ...state,
  leagueStats: { ...state.leagueStats, uiMode: 'nba' } as any,
  allStar: (state as any).backgroundNbaAllStar,
});

const remapBackgroundNbaAllStarPatch = (state: GameState, patch: Partial<GameState>): Partial<GameState> => {
  if (!patch || Object.keys(patch).length === 0) return {};
  const next: any = { ...patch };
  if ('allStar' in next) {
    next.backgroundNbaAllStar = next.allStar;
    delete next.allStar;
  }
  if ('leagueStats' in next) {
    next.leagueStats = state.leagueStats;
  }
  return next;
};

const runBackgroundNbaAllStarResolver = async (
  state: GameState,
  resolver: (state: GameState) => Promise<Partial<GameState>> | Partial<GameState>,
): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return {};
  const patch = await resolver(asBackgroundNbaAllStarState(state));
  return remapBackgroundNbaAllStarPatch(state, patch);
};

export const autoSimBackgroundNbaVotes = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, autoSimVotes);

export const autoAnnounceBackgroundNbaStarters = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, autoAnnounceStarters);

export const autoAnnounceBackgroundNbaReserves = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, autoAnnounceReserves);

export const autoSelectBackgroundNbaDunkContestants = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, autoSelectDunkContestants);

export const autoSelectBackgroundNbaThreePointContestants = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, autoSelectThreePointContestants);

export const autoSelectBackgroundNbaShootingStarsContestants = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, autoSelectShootingStarsContestants);

export const autoSelectBackgroundNbaSkillsChallengeContestants = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, autoSelectSkillsChallengeContestants);

export const backfillBackgroundNbaAllStarAwards = (state: GameState): Promise<Partial<GameState>> =>
  runBackgroundNbaAllStarResolver(state, backfillAllStarAwards);
