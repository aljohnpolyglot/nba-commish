import type { GameState } from '../../../types';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDunkContestEnabled,
  isRisingStarsEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
} from '../../allStar/allStarEventAvailability';
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
import { normalizePlayerAwardType } from '../../../utils/playerAwardNormalizer';
import { materializeAllStarSelectionAwards } from '../../allStar/allStarInjuryReplacements';
import { getPlayersOnCourt } from '../../simulation/courtSize';
import { publishContestField } from '../../news/nativeLeagueAnnouncements';
import { getAllStarPlayerEligibility } from '../../allStar/allStarSelectionHelpers';
import {
  selectExternalSkillsContestants,
  selectExternalThreePointContestants,
} from '../../externalLeague/allStarContestSelection';
import { withDeterministicRandom } from '../../simulation/deterministicRandom';
import { buildAllStarEventSeed, snapshotAllStarParticipants } from '../../allStar/allStarDeterminism';
import { recordSimulationPerf } from '../../simulation/simulationPerfDebug';
import {
  getCaptainTeamName,
  getLeagueFormerPlayerCaptainCandidates,
  resolveFormerPlayerCaptains,
} from '../../allStar/captainPool';
import { buildAllStarSnubStories } from '../../allStar/allStarSnubStories';
import { isTwitterAvailable } from '../../../utils/mediaTimeline';

const skipIsolatedNonNbaAllStar = (state: GameState) =>
  state.leagueStats?.uiMode === 'euro_isolated';

const skipDisabledNbaAllStar = (state: GameState) =>
  skipIsolatedNonNbaAllStar(state) || !isAllStarGameEnabled(state.leagueStats);

const perfNow = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const recordReserveLeaf = (
  leaf: string,
  startedAt: number,
  items: number,
  extra: Record<string, string | number | boolean | undefined> = {},
): void => recordSimulationPerf({
  engine: 'allstar-reserves-leaf',
  leaf,
  items,
  totalMs: perfNow() - startedAt,
  ...extra,
});

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
  if (skipDisabledNbaAllStar(state)) return {};
  if ((state.allStar?.votes?.length ?? 0) > 0) return {};
  try {
    const { getAllStarWeekendDates } = await import('../../allStar/AllStarWeekendOrchestrator');
    const { AllStarSelectionService, getAllStarPlayerEligibility } = await import('../../allStar/AllStarSelectionService');
    const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
    const playerEligibility = getAllStarPlayerEligibility(state.leagueStats, state.teams);

    const votes = withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-votes'),
      () => AllStarSelectionService.simulateVotingPeriod(
        state.players,
        state.teams,
        state.leagueStats.year,
        dates.votingEnd,
        [],
        28,
        playerEligibility,
        state.leagueStats,
      ),
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
  if (skipDisabledNbaAllStar(state)) return {};
  if (state.allStar?.startersAnnounced) return {};
  try {
    const { AllStarSelectionService, bucketRoster, getAllStarPlayerEligibility, normalizeAllStarRoster } = await import('../../allStar/AllStarSelectionService');
    const playerEligibility = getAllStarPlayerEligibility(state.leagueStats, state.teams);
    let starters = AllStarSelectionService.selectStarters(
      state.allStar?.votes ?? [],
      state.players,
      getPlayersOnCourt(state.leagueStats),
      playerEligibility,
    );
    starters = normalizeAllStarRoster(bucketRoster(
      starters,
      state.players,
      state.allStar?.votes ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams,
      playerEligibility,
      state.leagueStats.allStarCaptainType,
    ), state.players, playerEligibility);
    return {
      players: materializeAllStarSelectionAwards(state.players, starters, state.leagueStats.year),
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
  const resolverStartedAt = perfNow();
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaAllStarSelection(state);
  if (skipDisabledNbaAllStar(state)) return {};
  if (state.allStar?.reservesAnnounced) return {};
  try {
    const moduleStartedAt = perfNow();
    const { AllStarSelectionService, bucketRoster, getAllStarPlayerEligibility } = await import('../../allStar/AllStarSelectionService');
    recordReserveLeaf('selection-module-import', moduleStartedAt, 1);
    const eligibilityStartedAt = perfNow();
    const playerEligibility = getAllStarPlayerEligibility(state.leagueStats, state.teams);
    recordReserveLeaf('eligibility-resolver', eligibilityStartedAt, state.teams.length);
    const selectionStartedAt = perfNow();
    const reserves = AllStarSelectionService.selectReserves(
      state.players,
      state.teams,
      state.leagueStats.year,
      state.allStar?.roster ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams,
      getPlayersOnCourt(state.leagueStats),
      playerEligibility,
    );
    recordReserveLeaf('reserve-selection', selectionStartedAt, state.players.length, {
      teamsScanned: state.teams.length,
      starterCount: state.allStar?.roster?.length ?? 0,
      reserveCount: reserves.length,
    });
    const normalizationStartedAt = perfNow();
    const fullRoster = bucketRoster(
      [...(state.allStar?.roster ?? []), ...reserves],
      state.players,
      state.allStar?.votes ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams,
      playerEligibility,
      state.leagueStats.allStarCaptainType,
    );
    recordReserveLeaf('roster-bucketing-and-normalization', normalizationStartedAt, fullRoster.length, {
      playersScanned: state.players.length,
    });

    const awardsStartedAt = perfNow();
    const season = state.leagueStats.year;
    const playersWithAllStar = materializeAllStarSelectionAwards(state.players, fullRoster, season);
    recordReserveLeaf('all-star-award-materialization', awardsStartedAt, state.players.length, {
      selected: fullRoster.length,
    });

    const celebrityEnabled = isCelebrityGameEnabled(state.leagueStats);
    const existingCelebrityAnnounced = state.allStar?.celebrityAnnounced === true;
    let celebrityRoster: string[] = [...(state.allStar?.celebrityRoster ?? state.leagueStats.celebrityRoster ?? [])];
    let celebrityRosterProfiles = [...(state.allStar?.celebrityRosterProfiles ?? [])];
    if (celebrityEnabled && celebrityRoster.length === 0) {
      try {
        const celebrityModuleStartedAt = perfNow();
        const { getLocalRatedCelebritiesForYear } = await import('../../../data/celebrityEventSource');
        const { addOccasionalBasketballGuests } = await import('../../../data/celebrities');
        recordReserveLeaf('celebrity-module-import', celebrityModuleStartedAt, 1);
        const poolSource = state.leagueType === 'fictional' ? 'fictional' : 'real';
        const celebrityHydrationStartedAt = perfNow();
        const celebs = getLocalRatedCelebritiesForYear(state.leagueStats.year, poolSource);
        recordReserveLeaf('celebrity-local-pool-resolution', celebrityHydrationStartedAt, celebs.length, {
          poolSource,
        });
        const celebritySelectionStartedAt = perfNow();
        celebrityRosterProfiles = withDeterministicRandom(
          buildAllStarEventSeed(state, 'allstar-celebrity-roster'),
          () => addOccasionalBasketballGuests(
            [...celebs].sort(() => Math.random() - 0.5).slice(0, 20),
            state.players,
            state.leagueStats.year,
            state.leagueType === 'fictional',
          ),
        );
        celebrityRoster = celebrityRosterProfiles.map(celebrity => celebrity.name);
        recordReserveLeaf('celebrity-roster-selection-snapshot', celebritySelectionStartedAt, celebs.length, {
          selected: celebrityRoster.length,
        });
      } catch (e) {
        console.warn('Celebrity roster auto-select failed:', e);
      }
    }

    const resultStartedAt = perfNow();
    const snubs = buildAllStarSnubStories(state, fullRoster);
    const patch: Partial<GameState> = {
      players: playersWithAllStar,
      news: [...snubs.news, ...(state.news ?? [])],
      socialFeed: isTwitterAvailable(state.date, season)
        ? [...snubs.social, ...(state.socialFeed ?? [])]
        : state.socialFeed,
      allStar: {
        ...(state.allStar as any),
        roster: fullRoster,
        reservesAnnounced: true,
        risingStarsRoster: state.allStar?.risingStarsRoster ?? [],
        risingStarsAnnounced: state.allStar?.risingStarsAnnounced ?? false,
        risingStarsTeams: state.allStar?.risingStarsTeams ?? [],
        celebrityAnnounced: existingCelebrityAnnounced,
        celebrityRoster,
        celebrityRosterProfiles,
        celebrityTeams: (state.allStar?.celebrityTeams?.length ?? 0) >= 2
          ? state.allStar?.celebrityTeams ?? []
          : celebrityEnabled && celebrityRoster.length > 0
            ? ['Team Spotlight', 'Team Prime']
            : [],
      },
    };
    recordReserveLeaf('result-materialization', resultStartedAt, fullRoster.length + celebrityRoster.length);
    recordSimulationPerf({
      engine: 'allstar-reserves-total',
      playersScanned: state.players.length,
      teamsScanned: state.teams.length,
      starters: state.allStar?.roster?.length ?? 0,
      reserves: reserves.length,
      celebrities: celebrityRoster.length,
      totalMs: perfNow() - resolverStartedAt,
    });

    return patch;
  } catch (err) {
    console.warn('autoAnnounceReserves failed:', err);
    return {};
  }
};

export const autoAnnounceRisingStars = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  if (skipDisabledNbaAllStar(state) || !isRisingStarsEnabled(state.leagueStats)) return {};
  if (state.allStar?.risingStarsAnnounced) return {};
  try {
    const { AllStarSelectionService, isUsaPlayer } = await import('../../allStar/AllStarSelectionService');
    const isUsaWorld = state.leagueStats.risingStarsFormat === 'usa_vs_world';
    const isCaptainsDraft = state.leagueStats.risingStarsFormat === 'captains_draft';
    const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(
      state.players,
      state.leagueStats.year,
    );
    const { usa, world } = isUsaWorld
      ? AllStarSelectionService.getRisingStarsUsaWorldRoster(state.players, state.leagueStats.year)
      : { usa: [], world: [] };
    const captainDraftTeams = isCaptainsDraft
      ? AllStarSelectionService.getRisingStarsCaptainsDraftRoster(state.players, state.leagueStats.year)
      : [[], []];
    const selectedPlayers = isUsaWorld
      ? [...usa, ...world]
      : isCaptainsDraft
        ? [...captainDraftTeams[0], ...captainDraftTeams[1]]
        : [...rookies, ...sophs];
    const captainOneIds = new Set(captainDraftTeams[0].map(player => player.internalId));
    const roster = selectedPlayers.map(player => {
      const team = state.teams.find(candidate => candidate.id === player.tid);
      const usaPlayer = isUsaWorld && isUsaPlayer(player);
      const captainSide = isCaptainsDraft
        ? (captainOneIds.has(player.internalId) ? 'Captain 1' : 'Captain 2')
        : undefined;
      const playerWithSourceId = player as typeof player & { nbaId?: string | number };
      return {
        playerId: player.internalId,
        playerName: player.name,
        teamAbbrev: team?.abbrev ?? '',
        conference: isUsaWorld ? (usaPlayer ? 'USA' : 'World') : (team?.conference ?? ''),
        isStarter: true,
        position: player.pos ?? 'F',
        category: ['G', 'PG', 'SG'].includes(player.pos ?? 'F') ? 'Guard' : 'Frontcourt',
        isRookie: rookies.includes(player),
        risingStarsTeam: isUsaWorld ? (usaPlayer ? 'USA' : 'World') : captainSide,
        nbaId: playerWithSourceId.nbaId,
        imgURL: player.imgURL,
      };
    });
    if (roster.length === 0) return {};
    const formerPlayerCandidates = isCaptainsDraft
      ? getLeagueFormerPlayerCaptainCandidates(state.players, state.teams, state.leagueStats)
      : [];
    const formerPlayerCaptains = isCaptainsDraft
      ? resolveFormerPlayerCaptains(state.leagueStats.risingStarsLegendCaptainIds, formerPlayerCandidates)
      : [];
    if (isCaptainsDraft && formerPlayerCaptains.length < 2) {
      console.warn('Rising Stars Captains Draft requires two former players from this league.');
      return {};
    }
    const risingStarsTeams = isUsaWorld
      ? ['Team USA', 'Team World']
      : isCaptainsDraft
        ? [
            getCaptainTeamName(formerPlayerCaptains[0], 'Team 1'),
            getCaptainTeamName(formerPlayerCaptains[1], 'Team 2'),
          ]
        : ['Team Sophomores', 'Team Rookies'];
    return {
      ...(isCaptainsDraft ? {
        leagueStats: {
          ...state.leagueStats,
          risingStarsCaptainType: 'legend' as const,
          risingStarsLegendCaptainIds: formerPlayerCaptains.map(player => player.internalId),
        },
      } : {}),
      allStar: {
        ...(state.allStar as any),
        risingStarsRoster: roster,
        risingStarsAnnounced: true,
        risingStarsTeams,
      },
    };
  } catch (err) {
    console.warn('Rising Stars auto-select failed:', err);
    return {};
  }
};

export const autoAnnounceCelebrityRoster = async (
  state: GameState,
  includeDerivedMedia = true,
): Promise<Partial<GameState>> => {
  if (skipDisabledNbaAllStar(state) || !isCelebrityGameEnabled(state.leagueStats)) return {};
  const names = state.allStar?.celebrityRoster ?? state.leagueStats.celebrityRoster ?? [];
  if (state.allStar?.celebrityAnnounced || names.length === 0) return {};
  const allStar = { ...(state.allStar as any), celebrityAnnounced: true };
  return {
    allStar,
    ...publishContestField(
      { ...state, allStar } as GameState,
      'celebrity-game',
      'Celebrity Game',
      names,
      includeDerivedMedia,
    ),
  };
};

export const autoSelectDunkContestants = async (
  state: GameState,
  announce = true,
  includeDerivedMedia = true,
): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaContestSelection(state);
  if (skipDisabledNbaAllStar(state)) return {};
  if (!isDunkContestEnabled(state.leagueStats)) return {};
  const num = Math.min(12, Math.max(2, Math.round(state.leagueStats.allStarDunkContestPlayers ?? 4)));
  const existing = state.allStar?.dunkContestContestants ?? [];
  if (existing.length === num) {
    if (!announce || state.allStar?.dunkContestAnnounced) return {};
    const allStar = { ...(state.allStar as any), dunkContestAnnounced: true };
    return {
      allStar,
      ...publishContestField({ ...state, allStar } as GameState, 'dunk-contest', 'Slam Dunk Contest', existing.map(player => player.name), includeDerivedMedia),
    };
  }
  try {
    const { AllStarDunkContestSim } = await import('../../allStar/AllStarDunkContestSim');
    const contestants = snapshotAllStarParticipants(withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-dunk-field'),
      () => AllStarDunkContestSim.selectContestants(state.players, num),
    ));
    const allStar = {
      ...(state.allStar as any),
      dunkContestContestants: contestants,
      dunkContestAnnounced: announce && contestants.length === num,
    };
    return {
      allStar,
      ...(announce && contestants.length === num
        ? publishContestField({ ...state, allStar } as GameState, 'dunk-contest', 'Slam Dunk Contest', contestants.map(player => player.name), includeDerivedMedia)
        : {}),
    };
  } catch (err) {
    console.warn('autoSelectDunkContestants failed:', err);
    return {};
  }
};

export const autoSelectThreePointContestants = async (
  state: GameState,
  announce = true,
  includeDerivedMedia = true,
): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaContestSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (!isThreePointContestEnabled(state.leagueStats)) return {};
  const num = Math.min(20, Math.max(2, Math.round(state.leagueStats.allStarThreePointContestPlayers ?? 8)));
  const existing = state.allStar?.threePointContestants ?? [];
  if (existing.length === num) {
    if (!announce || state.allStar?.threePointAnnounced) return {};
    const allStar = { ...(state.allStar as any), threePointAnnounced: true };
    return {
      allStar,
      ...publishContestField({ ...state, allStar } as GameState, 'three-point-contest', 'Three-Point Contest', existing.map(player => player.name), includeDerivedMedia),
    };
  }
  try {
    const { AllStarThreePointContestSim } = await import('../../allStar/AllStarThreePointContestSim');
    const contestants = snapshotAllStarParticipants(withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-three-point-field'),
      () => state.leagueStats.uiMode === 'wnba_isolated'
        ? selectExternalThreePointContestants(state.players, state.leagueStats.year, num, {
            playerEligible: getAllStarPlayerEligibility(state.leagueStats, state.teams),
          })
        : AllStarThreePointContestSim.selectContestants(
            state.players,
            state.leagueStats.year,
            num,
          ),
    ));
    const allStar = {
      ...(state.allStar as any),
      threePointContestants: contestants,
      threePointAnnounced: announce && contestants.length === num,
    };
    return {
      allStar,
      ...(announce && contestants.length === num
        ? publishContestField({ ...state, allStar } as GameState, 'three-point-contest', 'Three-Point Contest', contestants.map(player => player.name), includeDerivedMedia)
        : {}),
    };
  } catch (err) {
    console.warn('autoSelectThreePointContestants failed:', err);
    return {};
  }
};

export const autoSelectShootingStarsContestants = async (
  state: GameState,
  announce = true,
  includeDerivedMedia = true,
): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  if (skipDisabledNbaAllStar(state)) return {};
  if (!isShootingStarsEnabled(state.leagueStats)) return {};
  const teams = Math.min(30, Math.max(2, Math.round(state.leagueStats.allStarShootingStarsTeams ?? Math.round((state.leagueStats.allStarShootingStarsTotalPlayers ?? 12) / 3))));
  const num = teams * 3;
  const existing = (state.allStar as any)?.shootingStarsContestants ?? [];
  if (existing.length === num) {
    if (!announce || (state.allStar as any)?.shootingStarsAnnounced) return {};
    const allStar = { ...(state.allStar as any), shootingStarsAnnounced: true };
    return {
      allStar,
      ...publishContestField({ ...state, allStar } as GameState, 'shooting-stars', 'Shooting Stars', existing.map((player: any) => player.name), includeDerivedMedia),
    };
  }
  try {
    const {
      AllStarShootingStarsSim,
      shouldUseCrossLeagueShootingStarsFormat,
    } = await import('../../allStar/AllStarShootingStarsSim');
    const hostCity = state.leagueStats.allStarHosts?.find((host: any) => host.year === state.leagueStats.year)?.city;
    const contestants = snapshotAllStarParticipants(withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-shooting-stars-field'),
      () => AllStarShootingStarsSim.selectContestants(
        state.players,
        state.leagueStats.year,
        num,
        state.teams,
        state.nonNBATeams ?? [],
        hostCity,
        shouldUseCrossLeagueShootingStarsFormat(state),
      ),
    ));
    const allStar = {
      ...(state.allStar as any),
      shootingStarsContestants: contestants,
      shootingStarsAnnounced: announce && contestants.length === num,
    };
    return {
      allStar,
      ...(announce && contestants.length === num
        ? publishContestField({ ...state, allStar } as GameState, 'shooting-stars', 'Shooting Stars', contestants.map(player => player.name), includeDerivedMedia)
        : {}),
    };
  } catch (err) {
    console.warn('autoSelectShootingStarsContestants failed:', err);
    return {};
  }
};

export const autoSelectSkillsChallengeContestants = async (
  state: GameState,
  announce = true,
  includeDerivedMedia = true,
): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return buildPbaContestSelection(state);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (!isSkillsChallengeEnabled(state.leagueStats)) return {};
  const num = Math.min(30, Math.max(3, Math.round(state.leagueStats.allStarSkillsChallengeTeams ?? state.leagueStats.allStarSkillsChallengeTotalPlayers ?? 4)));
  const existing = (state.allStar as any)?.skillsChallengeContestants ?? [];
  if (existing.length === num) {
    if (!announce || (state.allStar as any)?.skillsChallengeAnnounced) return {};
    const allStar = { ...(state.allStar as any), skillsChallengeAnnounced: true };
    return {
      allStar,
      ...publishContestField({ ...state, allStar } as GameState, 'skills-challenge', 'Skills Challenge', existing.map((player: any) => player.name), includeDerivedMedia),
    };
  }
  try {
    const { AllStarSkillsChallengeSim } = await import('../../allStar/AllStarSkillsChallengeSim');
    const contestants = snapshotAllStarParticipants(withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-skills-field'),
      () => state.leagueStats.uiMode === 'wnba_isolated'
        ? selectExternalSkillsContestants(state.players, num, {
            playerEligible: getAllStarPlayerEligibility(state.leagueStats, state.teams),
          })
        : AllStarSkillsChallengeSim.selectContestants(state.players, state.leagueStats.year, num),
    ));
    const allStar = {
      ...(state.allStar as any),
      skillsChallengeContestants: contestants,
      skillsChallengeAnnounced: announce && contestants.length === num,
    };
    return {
      allStar,
      ...(announce && contestants.length === num
        ? publishContestField({ ...state, allStar } as GameState, 'skills-challenge', 'Skills Challenge', contestants.map(player => player.name), includeDerivedMedia)
        : {}),
    };
  } catch (err) {
    console.warn('autoSelectSkillsChallengeContestants failed:', err);
    return {};
  }
};

export const autoSelectHorseContestants = async (
  state: GameState,
  announce = true,
  includeDerivedMedia = true,
): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  if (skipDisabledNbaAllStar(state)) return {};
  if (state.leagueStats.allStarHorse !== true) return {};
  const num = Math.min(10, Math.max(3, Math.round(state.leagueStats.allStarHorseParticipants ?? 3)));
  const existing = (state.allStar as any)?.horseContestants ?? [];
  if (existing.length === num) {
    if (!announce || (state.allStar as any)?.horseAnnounced) return {};
    const allStar = { ...(state.allStar as any), horseAnnounced: true };
    return {
      allStar,
      ...publishContestField({ ...state, allStar } as GameState, 'horse', 'H-O-R-S-E', existing.map((player: any) => player.name), includeDerivedMedia),
    };
  }
  try {
    const { AllStarHorseSim } = await import('../../allStar/AllStarHorseSim');
    const contestants = snapshotAllStarParticipants(withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-horse-field'),
      () => AllStarHorseSim.selectContestants(state.players, state.leagueStats.year, num, state.teams),
    ));
    const allStar = {
      ...(state.allStar as any),
      horseContestants: contestants,
      horseAnnounced: announce && contestants.length === num,
    };
    return {
      allStar,
      ...(announce && contestants.length === num
        ? publishContestField({ ...state, allStar } as GameState, 'horse', 'H-O-R-S-E', contestants.map(player => player.name), includeDerivedMedia)
        : {}),
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
  if (skipDisabledNbaAllStar(state)) return {};
  const allStarData = state.allStar as any;
  const year = state.leagueStats.year;
  const entries: Array<{ internalId?: string; name?: string; awardType: string }> = [];
  for (const rosterEntry of allStarData?.roster ?? []) {
    entries.push({ internalId: rosterEntry.playerId, name: rosterEntry.playerName, awardType: 'All-Star' });
  }
  if (allStarData?.dunkContest?.winnerId || allStarData?.dunkContest?.winnerName)
    entries.push({ internalId: allStarData.dunkContest.winnerId, name: allStarData.dunkContest.winnerName, awardType: 'Slam Dunk Contest Winner' });
  if (allStarData?.threePointContest?.winnerId || allStarData?.threePointContest?.winnerName)
    entries.push({ internalId: allStarData.threePointContest.winnerId, name: allStarData.threePointContest.winnerName, awardType: 'Three-Point Contest Winner' });
  if (allStarData?.danceContest?.winnerTeamId) {
    const winnerTeam = allStarData.danceContest.teams?.find((team: any) => team.teamId === allStarData.danceContest.winnerTeamId);
    (winnerTeam?.playerIds ?? []).forEach((playerId: string, index: number) => {
      entries.push({ internalId: playerId, name: winnerTeam.playerNames?.[index], awardType: 'All-Star Dance Contest Champion' });
    });
  }
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
    entries.push({ internalId: allStarData.gameMvp.playerId, name: allStarData.gameMvp.name, awardType: 'All-Star MVP' });
  if (allStarData?.risingStarsMvp?.name)
    entries.push({ internalId: allStarData.risingStarsMvp.playerId, name: allStarData.risingStarsMvp.name, awardType: 'Rising Stars MVP' });
  const finalAllStarGame = allStarData?.bracket?.games?.find((game: any) => game.round === 'final' && game.played && game.mvpName);
  if (!allStarData?.gameMvp?.name && finalAllStarGame?.mvpName)
    entries.push({ internalId: finalAllStarGame.mvpId, name: finalAllStarGame.mvpName, awardType: 'All-Star MVP' });
  const finalRisingStarsGame = allStarData?.risingStarsBracket?.games?.find((game: any) => game.round === 'final' && game.played && game.mvpName);
  if (!allStarData?.risingStarsMvp?.name && finalRisingStarsGame?.mvpName)
    entries.push({ internalId: finalRisingStarsGame.mvpId, name: finalRisingStarsGame.mvpName, awardType: 'Rising Stars MVP' });
  if (allStarData?.throne?.champion?.playerId)
    entries.push({ internalId: allStarData.throne.champion.playerId, name: allStarData.throne.champion.playerName, awardType: 'The Throne' });

  if (entries.length === 0) return {};

  const allPresent = entries.every(e =>
    state.players.some(p =>
      ((e.internalId && p.internalId === e.internalId) ||
       (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())) &&
      (p.awards ?? []).some(a => normalizePlayerAwardType(a.type) === e.awardType && a.season === year)
    )
  );
  if (allPresent) return {};

  const updatedPlayers = state.players.map(p => {
    const playerEntries = entries.filter(e =>
      (e.internalId && p.internalId === e.internalId) ||
      (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())
    );
    const missing = playerEntries.filter(entry =>
      !(p.awards ?? []).some(a => normalizePlayerAwardType(a.type) === entry.awardType && a.season === year)
    );
    return missing.length > 0
      ? { ...p, awards: [...(p.awards ?? []), ...missing.map(entry => ({ type: entry.awardType, season: year }))] }
      : p;
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
