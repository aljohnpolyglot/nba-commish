import type { GameState } from '../../../types';

export const autoSimVotes = async (state: GameState): Promise<Partial<GameState>> => {
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

export function backfillAllStarAwards(state: GameState): Partial<GameState> {
  const allStarData = state.allStar as any;
  const year = state.leagueStats.year;
  const entries: Array<{ internalId?: string; name?: string; awardType: string }> = [];
  if (allStarData?.dunkContest?.winnerId || allStarData?.dunkContest?.winnerName)
    entries.push({ internalId: allStarData.dunkContest.winnerId, name: allStarData.dunkContest.winnerName, awardType: 'Slam Dunk Contest Winner' });
  if (allStarData?.threePointContest?.winnerId || allStarData?.threePointContest?.winnerName)
    entries.push({ internalId: allStarData.threePointContest.winnerId, name: allStarData.threePointContest.winnerName, awardType: 'Three-Point Contest Winner' });
  if (allStarData?.gameMvp?.name)
    entries.push({ name: allStarData.gameMvp.name, awardType: 'All-Star Game MVP' });

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
