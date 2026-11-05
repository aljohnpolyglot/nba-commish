import { Dispatch, MutableRefObject, SetStateAction, useEffect } from 'react';
import { GameState, Tab } from '../../types';
import { ensureStaffPoolDepth, inferEuroStaffLeagueId, isEuroStaffLeagueId } from '../../services/euro/staffPool';
import { ensureEuroUserAcademyProspects } from '../../services/externalLeagueSustainer';
import {
  getPlayerBioPreloadSignature,
  prehydratePlayerBioData,
} from '../../services/playerBioPreload';
import { setActiveSaveId } from '../gameplanStore';
import { setActiveSaveId as setTradingBlockSaveId } from '../tradingBlockStore';
import { setActiveSaveId as setScoringOptionsSaveId } from '../scoringOptionsStore';
import { setActiveSaveId as setCoachStrategySaveId } from '../coachStrategyLockStore';
import { setActiveSaveId as setIdealRotationSaveId } from '../idealRotationStore';
import { setActiveSaveId as setCoachSystemSaveId } from '../coachSystemStore';
import { setActiveSaveId as setDefenseGameplanSaveId } from '../defenseGameplanStore';
import { setActiveSaveId as setMatchupAssignmentsSaveId } from '../matchupAssignmentsStore';
import { setActiveSaveId as setDefenderDetailSaveId } from '../defenderDetailStore';
import { setActiveSaveId as setRivalGameplanSaveId } from '../rivalGameplanStore';
import { SEED_2029_TEAMS, SEED_2029_YEAR, SEED_2029_SETTINGS, ZENGM_2029_REALIGNMENT } from '../../data/expansion2029';
import { findHistoricalNbaExpansionEvent } from '../../data/historicalNbaExpansionSchedule';
import { DEFAULT_EXPANSION_PROTECTION_SETTINGS } from '../../services/expansion/expansionOffseasonTransition';
import { applyTeamIdentitiesForTimeline } from '../../utils/teamAssets';
import { isHistoricalNbaWhatIfTimeline, timelineInputFromState } from '../../utils/historicalTimeline';
import { buildHistoricalNonPlayerCoachPoolAdditions } from '../../services/staff/historicalCoachPool';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import { getNameData } from '../../data/nameDataFetcher';
import { FICTIONAL_STAFF_SEED_VERSION, healFictionalStaffState } from '../../services/fictionalStaffGenerator';
import { hydrateWorkerNbaStaffAchievements } from '../../services/staff/coachAchievements';
import { ensureOpeningTeamHeadCoach, isOpeningNbaStaffWindow, syncStaffDirectoryHeadCoaches } from '../../services/staff/activeStaffContracts';
import {
  buildExpansionBidProfile,
  buildGeneratedExpansionBidSchedule,
  selectGeneratedHistoricalBidCandidates,
} from '../../services/expansion/generatedExpansionBidding';
import { loadGeneratedTeamCatalog } from '../../services/generatedTeamCatalog';
import {
  buildPbaExpansionBidProfile,
  buildPbaFictionalExpansionSchedule,
  loadPbaFictionalExpansionPool,
  PBA_EXPANSION_PROTECTION_SETTINGS,
} from '../../services/pba/fictionalExpansion';
import {
  buildNextWnbaExpansionSchedule,
  WNBA_EXPANSION_PROTECTION_SETTINGS,
} from '../../services/wnba/expansion';
import {
  bootstrapFullOffseasonRetirements,
  needsFullOffseasonRetirementBootstrap,
} from '../../services/offseason/fullOffseasonRetirementBootstrap';

type SetGameState = Dispatch<SetStateAction<GameState>>;
type SetTabState = Dispatch<SetStateAction<Tab>>;

const NBA_HISTORICAL_COACH_SEED_VERSION = 9;
const WNBA_STAFF_SEED_VERSION = 1;

function isInternalRetirementReviewArtifact(id: unknown): boolean {
  const value = String(id ?? '');
  return value.endsWith('-retired_players')
    || value.endsWith('-staff_retirements')
    || value.endsWith('-referee_retirements');
}

function hasCurrentHistoricalCoachSeed(leagueStats: any): boolean {
  const version = Number(leagueStats?.nbaHistoricalCoachSeedVersion ?? (leagueStats?.nbaHistoricalCoachSeeded ? 1 : 0));
  return Number.isFinite(version) && version >= NBA_HISTORICAL_COACH_SEED_VERSION;
}

interface BootstrapParams {
  state: GameState;
  currentView: Tab;
  setCurrentView: SetTabState;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
}

export function useGameProviderBootstrapEffects({
  state,
  currentView,
  setCurrentView,
  setState,
}: BootstrapParams) {
  useEffect(() => {
    setActiveSaveId(state.saveId);
    setTradingBlockSaveId(state.saveId);
    setScoringOptionsSaveId(state.saveId);
    setCoachStrategySaveId(state.saveId);
    setIdealRotationSaveId(state.saveId);
    setCoachSystemSaveId(state.saveId);
    setDefenseGameplanSaveId(state.saveId);
    setMatchupAssignmentsSaveId(state.saveId);
    setDefenderDetailSaveId(state.saveId);
    setRivalGameplanSaveId(state.saveId);
  }, [state.saveId]);

  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (currentView !== 'Social Feed') return;
    if (isTwitterAvailable(state.date, state.leagueStats?.year)) return;
    setCurrentView('League News');
  }, [state.isDataLoaded, state.date, state.leagueStats?.year, currentView, setCurrentView]);

  useEffect(() => {
    if (!state.isDataLoaded || (!state.socialFeed?.length && !state.news?.length)) return;
    const hasPreTwitterPosts = state.socialFeed.some(post => !isTwitterAvailable(post.date, state.leagueStats?.year));
    const hasInternalReviewArtifacts = state.socialFeed.some(post => isInternalRetirementReviewArtifact(post.id))
      || state.news.some(item => isInternalRetirementReviewArtifact(item.id));
    if (!hasPreTwitterPosts && !hasInternalReviewArtifacts) return;
    setState(prev => ({
      ...prev,
      socialFeed: (prev.socialFeed ?? []).filter(post =>
        isTwitterAvailable(post.date, prev.leagueStats?.year)
        && !isInternalRetirementReviewArtifact(post.id),
      ),
      news: (prev.news ?? []).filter(item => !isInternalRetirementReviewArtifact(item.id)),
    }));
  }, [state.isDataLoaded, state.socialFeed, state.news, state.leagueStats?.year, setState]);

  useEffect(() => {
    if (!state.isDataLoaded) return;
    setState(prev => {
      if (!prev.isDataLoaded) return prev;
      const input = timelineInputFromState(prev);
      const teams = applyTeamIdentitiesForTimeline(prev.teams ?? [], input);
      const nonNBATeams = applyTeamIdentitiesForTimeline(prev.nonNBATeams ?? [], input);
      if (teams === prev.teams && nonNBATeams === prev.nonNBATeams) return prev;
      return { ...prev, teams, nonNBATeams } as GameState;
    });
  }, [
    state.isDataLoaded,
    state.saveId,
    state.leagueStats?.year,
    (state.leagueStats as any)?.moddedLeagueBase,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaStartYear,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || !needsFullOffseasonRetirementBootstrap(state)) return;
    setState(previous => bootstrapFullOffseasonRetirements(previous));
  }, [
    state.isDataLoaded,
    state.leagueStats,
    state.nbaGmStartMode,
    state.nbaStartYear,
    state.offseasonChecklist?.retiredPlayersReview,
    state.offseasonChecklist?.staffRetirements,
    state.saveId,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || !state.staff) return;
    if ((state.leagueStats as any)?.workerNbaStaffAwardHydrationPending !== true) return;
    if ((state.leagueStats as any)?.nbaGMStaffSeeded !== true) return;
    setState(prev => {
      if (!prev.staff || (prev.leagueStats as any)?.workerNbaStaffAwardHydrationPending !== true) return prev;
      const patch = hydrateWorkerNbaStaffAchievements(prev);
      return {
        ...prev,
        ...patch,
        leagueStats: {
          ...prev.leagueStats,
          workerNbaStaffAwardHydrationPending: false,
          workerNbaStaffAwardHydrationVersion: 1,
        } as any,
      };
    });
  }, [
    state.isDataLoaded,
    state.staff,
    (state.leagueStats as any)?.nbaGMStaffSeeded,
    (state.leagueStats as any)?.workerNbaStaffAwardHydrationPending,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueType !== 'fictional') return;
    const version = Number((state.leagueStats as any)?.fictionalStaffSeedVersion ?? 0);
    if (version >= FICTIONAL_STAFF_SEED_VERSION) return;
    setState(prev => healFictionalStaffState(prev, getNameData()));
  }, [
    state.isDataLoaded,
    state.leagueType,
    (state.leagueStats as any)?.fictionalStaffSeedVersion,
    state.saveId,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueStats?.uiMode !== 'wnba_isolated') return;
    if (Number(state.leagueStats.wnbaStaffSeedVersion ?? 0) >= WNBA_STAFF_SEED_VERSION) return;
    if (!state.teams?.length) return;
    let cancelled = false;
    import('../../services/staff/nbaRealStaffSeed').then(seedMod => {
      if (cancelled) return;
      setState(prev => {
        if (!prev.isDataLoaded || prev.leagueStats?.uiMode !== 'wnba_isolated') return prev;
        if (Number(prev.leagueStats.wnbaStaffSeedVersion ?? 0) >= WNBA_STAFF_SEED_VERSION) return prev;
        const seeded = seedMod.seedActiveLeagueStaffForTeams(
          prev.teams,
          prev.leagueStats.year ?? new Date().getFullYear(),
          {
            source: 'wnba-generated-staff',
            leagueId: 'wnba',
            attributeProfile: 'default',
            headCoaches: prev.staff?.coaches ?? [],
          },
        );
        return {
          ...prev,
          teams: seeded.teams,
          leagueStats: {
            ...prev.leagueStats,
            wnbaStaffSeedVersion: WNBA_STAFF_SEED_VERSION,
          },
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    state.isDataLoaded,
    state.leagueStats?.uiMode,
    state.leagueStats?.wnbaStaffSeedVersion,
    state.saveId,
    state.teams,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (state.leagueType === 'fictional') return;
    if (state.leagueStats?.uiMode && state.leagueStats.uiMode !== 'nba') return;
    if ((state.leagueStats as any)?.nbaGMStaffSeeded && hasCurrentHistoricalCoachSeed(state.leagueStats)) return;
    if (!state.teams?.length) return;

    let cancelled = false;
    Promise.all([
      import('../../services/staffService'),
      import('../../services/staff/nbaRealStaffSeed'),
    ]).then(async ([staffMod, seedMod]) => {
      await staffMod.fetchCoachData();
      if (cancelled) return;
      setState(prev => {
        if (!prev.isDataLoaded) return prev;
        if (prev.leagueType === 'fictional') return prev;
        if (prev.leagueStats?.uiMode && prev.leagueStats.uiMode !== 'nba') return prev;
        if ((prev.leagueStats as any)?.nbaGMStaffSeeded && hasCurrentHistoricalCoachSeed(prev.leagueStats)) return prev;
        const currentYear = prev.leagueStats?.year ?? new Date().getFullYear();
        const staffSeedYear = isHistoricalNbaWhatIfTimeline(timelineInputFromState(prev))
          ? prev.nbaStartYear ?? currentYear
          : currentYear;
        const seeded = seedMod.seedRealNBAStaffForAllTeams(
          prev.teams,
          undefined,
          staffSeedYear,
          { fillSupportRoles: true, replacePlaceholderRoles: true, replaceModernHistoricalMismatches: true },
        );
        const staffedTeams = isOpeningNbaStaffWindow(prev)
          ? seeded.teams.map(team => ensureOpeningTeamHeadCoach(team, currentYear).team)
          : seeded.teams;
        if (seeded.filledRoleCount > 0) {
          console.log(`[NBA STAFF] seeded ${seeded.filledRoleCount} AI staff roles across ${seeded.seededCount} teams.`);
        }
        const shouldUseHistoricalCoachPool = prev.leagueType === 'modded' &&
          prev.moddedLeagueBase === 'nba' &&
          (!prev.leagueStats?.uiMode || prev.leagueStats.uiMode === 'nba');
        const historicalCoachPool = shouldUseHistoricalCoachPool
          ? buildHistoricalNonPlayerCoachPoolAdditions({
              state: { ...prev, teams: staffedTeams } as any,
              currentYear: staffSeedYear,
              staffFreeAgents: prev.staffFreeAgents ?? [],
            })
          : {
              additions: [],
              joinedKeys: ((prev.leagueStats as any)?.historicalCoachPoolJoinedKeys ?? []) as string[],
            };
        const staffFreeAgentsWithHistoricalAdditions = [
          ...historicalCoachPool.additions,
          ...(prev.staffFreeAgents ?? []),
        ];
        const hasNbaStaffPool = staffFreeAgentsWithHistoricalAdditions.some((member: any) => member?.leagueId === 'nba');
        const stockedPool = (prev.leagueStats as any)?.staffPoolSeeded && hasNbaStaffPool
          ? { staffFreeAgents: staffFreeAgentsWithHistoricalAdditions }
          : ensureStaffPoolDepth(
              { ...prev, teams: staffedTeams, staffFreeAgents: staffFreeAgentsWithHistoricalAdditions } as any,
              'nba',
            );
        return {
          ...prev,
          teams: staffedTeams,
          staff: syncStaffDirectoryHeadCoaches(prev.staff, staffedTeams, currentYear),
          staffFreeAgents: stockedPool.staffFreeAgents ?? prev.staffFreeAgents,
          leagueStats: {
            ...prev.leagueStats,
            nbaAIStaffSeeded: true,
            nbaGMStaffSeeded: true,
            nbaHistoricalCoachSeeded: true,
            nbaHistoricalCoachSeedVersion: NBA_HISTORICAL_COACH_SEED_VERSION,
            historicalCoachPoolJoinedKeys: historicalCoachPool.joinedKeys,
            staffPoolSeeded: true,
          } as any,
        };
      });
    }).catch(err => {
      console.warn('[NBA STAFF] AI staff seed failed', err);
    });

    return () => {
      cancelled = true;
    };
  }, [
    state.isDataLoaded,
    state.gameMode,
    state.leagueType,
    state.leagueStats?.uiMode,
    (state.leagueStats as any)?.nbaGMStaffSeeded,
    (state.leagueStats as any)?.nbaHistoricalCoachSeeded,
    (state.leagueStats as any)?.nbaHistoricalCoachSeedVersion,
    state.userTeamId,
    state.teams?.length,
    setState,
  ]);

  useEffect(() => {
    const retirementSnapshotVersion = 2;
    const year = Number(state.leagueStats?.year);
    const branchStartYear = Number(state.nbaStartYear ?? year);
    if (
      !state.isDataLoaded
      || state.leagueType !== 'modded'
      || state.moddedLeagueBase !== 'nba'
      || (state.leagueStats?.uiMode && state.leagueStats.uiMode !== 'nba')
      || !Number.isFinite(year)
      || year !== branchStartYear
      || (
        Number((state.leagueStats as any)?.historicalNbaYearZeroRetirementsYear) === year
        && Number((state.leagueStats as any)?.historicalNbaYearZeroRetirementsVersion ?? 0) >= retirementSnapshotVersion
      )
    ) return;

    let cancelled = false;
    Promise.all([
      import('../../services/staff/historicalCoachArchive'),
      import('../../services/staff/historicalNbaCoaches'),
      import('../../services/zengmHistoricalRoster'),
    ]).then(async ([archiveModule, coachModule, rosterModule]) => {
      await archiveModule.prepareHistoricalCoachArchive();
      const playerRetirees = await rosterModule.buildZengmHistoricalYearZeroRetirees(
        year,
        state.teams,
        state.players,
      );
      if (cancelled) return;
      setState(previous => {
        const activeYear = Number(previous.leagueStats?.year);
        const activeBranchStartYear = Number(previous.nbaStartYear ?? activeYear);
        if (
          !previous.isDataLoaded
          || previous.leagueType !== 'modded'
          || previous.moddedLeagueBase !== 'nba'
          || activeYear !== activeBranchStartYear
          || (
            Number((previous.leagueStats as any)?.historicalNbaYearZeroRetirementsYear) === activeYear
            && Number((previous.leagueStats as any)?.historicalNbaYearZeroRetirementsVersion ?? 0) >= retirementSnapshotVersion
          )
        ) return previous;
        const generatedStaffRetirements = coachModule.buildHistoricalNbaStaffRetirementAnnouncements(
          previous.teams,
          activeYear,
        );
        const existingIds = new Set((previous.staffRetirementAnnouncements ?? []).map(record => record.id));
        const staffAdditions = generatedStaffRetirements.filter(record => !existingIds.has(record.id));
        const existingPlayerKeys = new Set(previous.players.flatMap(player => [
          String(player.slug ?? player.srID ?? '').trim().toLowerCase(),
          String(player.name ?? '').trim().toLowerCase(),
        ]).filter(Boolean));
        const playerAdditions = playerRetirees.filter(player =>
          !existingPlayerKeys.has(String(player.slug ?? player.srID ?? '').trim().toLowerCase())
          && !existingPlayerKeys.has(String(player.name ?? '').trim().toLowerCase()),
        );
        return {
          ...previous,
          players: [...previous.players, ...playerAdditions],
          staffRetirementAnnouncements: [
            ...(previous.staffRetirementAnnouncements ?? []),
            ...staffAdditions,
          ],
          leagueStats: {
            ...previous.leagueStats,
            historicalNbaYearZeroRetirementsYear: activeYear,
            historicalNbaYearZeroRetirementsVersion: retirementSnapshotVersion,
          } as any,
        };
      });
    }).catch(error => {
      console.warn('[NBA STAFF] historical retirement snapshot failed', error);
    });
    return () => {
      cancelled = true;
    };
  }, [
    state.isDataLoaded,
    state.leagueStats?.uiMode,
    state.leagueStats?.year,
    (state.leagueStats as any)?.historicalNbaYearZeroRetirementsYear,
    (state.leagueStats as any)?.historicalNbaYearZeroRetirementsVersion,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaStartYear,
    state.players,
    state.saveId,
    state.teams,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueStats?.uiMode !== 'euro_isolated' || state.gameMode !== 'gm') return;
    const year = state.leagueStats?.year ?? new Date().getFullYear();
    if ((state.leagueStats as any)?.euroAcademySeededYear === year) return;
    const academy = ensureEuroUserAcademyProspects(state as any, year);
    if (academy.additions.length === 0) return;
    setState(prev => ({
      ...prev,
      players: academy.players,
      leagueStats: prev.leagueStats
        ? { ...prev.leagueStats, euroAcademySeededYear: year }
        : prev.leagueStats,
    }));
  }, [state.isDataLoaded, state.leagueStats?.uiMode, state.leagueStats?.year, state.gameMode, state.userTeamId, state.players, state.nonNBATeams, setState]);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueStats?.uiMode !== 'euro_isolated') return;
    const hasNbaFaState =
      (state.faBidding?.markets?.length ?? 0) > 0 ||
      (state.pendingFAToasts?.length ?? 0) > 0 ||
      (((state as any).pendingRFAOfferSheets ?? []).length > 0) ||
      (((state as any).pendingRFAMatchResolutions ?? []).length > 0);
    if (!hasNbaFaState) return;
    setState(prev => ({
      ...prev,
      faBidding: { markets: [] },
      pendingFAToasts: [],
      pendingRFAOfferSheets: [],
      pendingRFAMatchResolutions: [],
    } as any));
  }, [
    state.isDataLoaded,
    state.leagueStats?.uiMode,
    state.faBidding?.markets?.length,
    state.pendingFAToasts?.length,
    (state as any).pendingRFAOfferSheets?.length,
    (state as any).pendingRFAMatchResolutions?.length,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueStats?.uiMode !== 'pba_isolated') return;
    const currentYear = Number(state.leagueStats?.year);
    if (!Number.isFinite(currentYear)) return;
    const activeSchedule = state.expansionSchedule;
    if (activeSchedule) {
      if (
        activeSchedule.league === 'pba'
        && state.gameMode === 'gm'
        && activeSchedule.year <= currentYear + 1
        && !state.expansionBidDecisions?.[activeSchedule.year]
      ) {
        setState(prev => {
          const schedule = prev.expansionSchedule;
          if (
            schedule?.league !== 'pba'
            || schedule.year > Number(prev.leagueStats?.year) + 1
            || prev.expansionBidDecisions?.[schedule.year]
          ) return prev;
          const acceptedTeams = [...schedule.teams]
            .sort((left, right) => {
              const rightProfile = buildPbaExpansionBidProfile(prev, right);
              const leftProfile = buildPbaExpansionBidProfile(prev, left);
              return (rightProfile.bidAmount ?? 0) - (leftProfile.bidAmount ?? 0)
                || left.abbrev.localeCompare(right.abbrev);
            })
            .slice(0, Math.min(2, schedule.teams.length));
          return {
            ...prev,
            expansionSchedule: { ...schedule, teams: acceptedTeams },
            expansionBidDecisions: {
              ...(prev.expansionBidDecisions ?? {}),
              [schedule.year]: {
                status: acceptedTeams.length > 0 ? 'accepted' : 'rejected',
                teamAbbrevs: acceptedTeams.map(team => team.abbrev),
                decidedAt: prev.date,
                acknowledgedAt: prev.date,
                league: 'pba',
              },
            },
          };
        });
      }
      return;
    }

    let cancelled = false;
    loadPbaFictionalExpansionPool()
      .then(pool => {
        if (cancelled) return;
        setState(prev => {
          if (!prev.isDataLoaded || prev.leagueStats?.uiMode !== 'pba_isolated' || prev.expansionSchedule) {
            return prev;
          }
          const schedule = buildPbaFictionalExpansionSchedule(prev, pool);
          if (!schedule) return prev;
          return {
            ...prev,
            expansionSchedule: schedule,
            expansionProtectionSettings: { ...PBA_EXPANSION_PROTECTION_SETTINGS },
          };
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    state.isDataLoaded,
    state.gameMode,
    state.leagueStats?.uiMode,
    state.leagueStats?.year,
    state.expansionSchedule,
    state.expansionBidDecisions,
    state.nonNBATeams,
    state.saveId,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueStats?.uiMode !== 'wnba_isolated') return;
    const currentYear = Number(state.leagueStats.year);
    if (!Number.isFinite(currentYear)) return;
    const activeSchedule = state.expansionSchedule;
    if (activeSchedule) {
      if (
        activeSchedule.league === 'wnba'
        && state.gameMode === 'gm'
        && activeSchedule.year <= currentYear
        && !state.expansionBidDecisions?.[activeSchedule.year]
      ) {
        setState(prev => {
          const schedule = prev.expansionSchedule;
          if (
            schedule?.league !== 'wnba'
            || schedule.year > Number(prev.leagueStats.year)
            || prev.expansionBidDecisions?.[schedule.year]
          ) return prev;
          return {
            ...prev,
            expansionBidDecisions: {
              ...(prev.expansionBidDecisions ?? {}),
              [schedule.year]: {
                status: 'accepted',
                teamAbbrevs: schedule.teams.map(team => team.abbrev),
                decidedAt: prev.date,
                acknowledgedAt: prev.date,
                league: 'wnba',
              },
            },
          };
        });
      }
      return;
    }
    setState(prev => {
      if (!prev.isDataLoaded || prev.leagueStats.uiMode !== 'wnba_isolated' || prev.expansionSchedule) return prev;
      const schedule = buildNextWnbaExpansionSchedule(prev);
      if (!schedule) return prev;
      return {
        ...prev,
        expansionSchedule: schedule,
        expansionProtectionSettings: { ...WNBA_EXPANSION_PROTECTION_SETTINGS },
      };
    });
  }, [
    state.isDataLoaded,
    state.gameMode,
    state.leagueStats?.uiMode,
    state.leagueStats?.year,
    state.leagueStats?.wnbaExpansionCompletedYears,
    state.expansionSchedule,
    state.expansionBidDecisions,
    state.teams,
    setState,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (
      state.leagueStats?.uiMode === 'euro_isolated'
      || state.leagueStats?.uiMode === 'pba_isolated'
      || state.leagueStats?.uiMode === 'wnba_isolated'
    ) {
      return;
    }
    if (state.leagueType === 'fictional') return;
    if (state.expansionSchedule) {
      if (
        state.gameMode === 'gm'
        && !state.expansionBidDecisions?.[state.expansionSchedule.year]
        && state.expansionSchedule.year <= Number(state.leagueStats?.year)
      ) {
        setState(prev => {
          const schedule = prev.expansionSchedule;
          if (!schedule || prev.expansionBidDecisions?.[schedule.year]) return prev;
          const historicalEvent = isHistoricalNbaWhatIfTimeline(timelineInputFromState(prev))
            ? findHistoricalNbaExpansionEvent(
                prev.leagueStats?.year,
                prev.teams,
                prev.leagueStats?.historicalExpansionSkippedSeasons ?? [],
                prev.nbaStartYear,
              )
            : null;
          const historicalAbbrevs = new Set(
            historicalEvent?.season === schedule.year
              ? historicalEvent.teams.map(team => team.abbrev)
              : [],
          );
          const seed2029Abbrevs = new Set(SEED_2029_TEAMS.map(team => team.abbrev));
          const expectedTeams = schedule.teams.filter(team =>
            historicalAbbrevs.has(team.abbrev)
            || schedule.year === SEED_2029_YEAR && seed2029Abbrevs.has(team.abbrev)
          );
          const acceptedTeams = expectedTeams.length > 0
            ? expectedTeams
            : [...schedule.teams]
                .sort((left, right) => (
                  buildExpansionBidProfile(prev, right).bidUSD - buildExpansionBidProfile(prev, left).bidUSD
                  || left.abbrev.localeCompare(right.abbrev)
                ))
                .slice(0, Math.min(2, schedule.teams.length));
          return {
            ...prev,
            expansionSchedule: { ...schedule, teams: acceptedTeams },
            expansionBidDecisions: {
              ...(prev.expansionBidDecisions ?? {}),
              [schedule.year]: {
                status: acceptedTeams.length > 0 ? 'accepted' : 'rejected',
                teamAbbrevs: acceptedTeams.map(team => team.abbrev),
                decidedAt: prev.date,
                acknowledgedAt: prev.date,
              },
            },
          };
        });
        return;
      }
      if (state.gameMode !== 'gm' && !state.expansionBidDecisions?.[state.expansionSchedule.year]) {
        const historicalEvent = isHistoricalNbaWhatIfTimeline(timelineInputFromState(state))
          ? findHistoricalNbaExpansionEvent(
          state.leagueStats?.year,
          state.teams,
          state.leagueStats?.historicalExpansionSkippedSeasons ?? [],
          state.nbaStartYear,
        )
          : null;
        const isHistoricalSeed = historicalEvent?.season === state.expansionSchedule.year;
        const isInitial2029Seed = state.expansionSchedule.year === SEED_2029_YEAR
          && state.leagueStats?.auto2029ExpansionSeeded === true;
        if (isHistoricalSeed || isInitial2029Seed) {
          let cancelled = false;
          loadGeneratedTeamCatalog()
            .catch(() => [])
            .then(catalog => {
              if (cancelled) return;
              setState(prev => {
                const schedule = prev.expansionSchedule;
                if (!schedule || prev.expansionBidDecisions?.[schedule.year]) return prev;
                const catalogAbbrevs = new Set(
                  catalog.map(team => String(team.abbrev ?? '').trim().toUpperCase()).filter(Boolean),
                );
                if (schedule.teams.some(team => catalogAbbrevs.has(team.abbrev.toUpperCase()))) return prev;
                const candidates = selectGeneratedHistoricalBidCandidates(
                  prev,
                  schedule.year,
                  catalog,
                  schedule.teams,
                );
                if (candidates.length === 0) return prev;
                return {
                  ...prev,
                  expansionSchedule: {
                    ...schedule,
                    teams: [...schedule.teams, ...candidates],
                  },
                };
              });
            });
          return () => {
            cancelled = true;
          };
        }
      }
      return;
    }
    if (isHistoricalNbaWhatIfTimeline(timelineInputFromState(state))) {
      const historicalEvent = findHistoricalNbaExpansionEvent(
        state.leagueStats?.year,
        state.teams,
        state.leagueStats?.historicalExpansionSkippedSeasons ?? [],
        state.nbaStartYear,
      );
      if (historicalEvent) {
        let cancelled = false;
        loadGeneratedTeamCatalog()
          .catch(() => [])
          .then(catalog => {
            if (cancelled) return;
            setState(prev => {
              if (!prev.isDataLoaded || prev.expansionSchedule) return prev;
              const latestEvent = findHistoricalNbaExpansionEvent(
                prev.leagueStats?.year,
                prev.teams,
                prev.leagueStats?.historicalExpansionSkippedSeasons ?? [],
                prev.nbaStartYear,
              );
              if (!latestEvent) return prev;
              const branchCandidates = prev.gameMode === 'gm'
                ? []
                : selectGeneratedHistoricalBidCandidates(
                    prev,
                    latestEvent.season,
                    catalog,
                    latestEvent.teams,
                  );
              return {
                ...prev,
                expansionSchedule: {
                  year: latestEvent.season,
                  teams: [...latestEvent.teams, ...branchCandidates],
                  realignment: latestEvent.realignment ?? {},
                },
                expansionProtectionSettings: { ...DEFAULT_EXPANSION_PROTECTION_SETTINGS },
                leagueStats: prev.leagueStats
                  ? { ...prev.leagueStats, historicalExpansionAutoSeededSeason: latestEvent.season }
                  : prev.leagueStats,
              };
            });
          });
        return () => {
          cancelled = true;
        };
      }
    }
    if (state.leagueStats?.auto2029ExpansionSeeded) {
      let cancelled = false;
      loadGeneratedTeamCatalog()
        .catch(() => [])
        .then(catalog => {
          if (cancelled) return;
          setState(prev => {
            if (!prev.isDataLoaded || prev.expansionSchedule) return prev;
            const latestSchedule = buildGeneratedExpansionBidSchedule(prev, catalog);
            if (!latestSchedule) return prev;
            return {
              ...prev,
              expansionSchedule: latestSchedule,
              expansionProtectionSettings: { ...DEFAULT_EXPANSION_PROTECTION_SETTINGS },
            };
          });
        });
      return () => {
        cancelled = true;
      };
    }
    const lsYear = state.leagueStats?.year;
    if (lsYear == null || lsYear >= SEED_2029_YEAR) {
      setState(prev => ({
        ...prev,
        leagueStats: prev.leagueStats
          ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
          : prev.leagueStats,
      }));
      return;
    }
    setState(prev => ({
      ...prev,
      expansionSchedule: {
        year: SEED_2029_YEAR,
        teams: SEED_2029_TEAMS,
        realignment: ZENGM_2029_REALIGNMENT,
      },
      expansionProtectionSettings: SEED_2029_SETTINGS,
      leagueStats: prev.leagueStats
        ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
        : prev.leagueStats,
    }));
  }, [
    state.isDataLoaded,
    state.gameMode,
    state.leagueStats?.year,
    state.expansionSchedule,
    state.expansionBidDecisions,
    state.leagueStats?.auto2029ExpansionSeeded,
    state.leagueStats?.historicalExpansionSkippedSeasons,
    state.leagueStats?.uiMode,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaStartYear,
    state.saveId,
    state.teams,
    setState,
  ]);

  useEffect(() => {
    if (currentView !== 'Draft Scouting') return;
    const seasonYear = state.leagueStats?.year ?? new Date().getFullYear();
    if (state.draftCombineResultsAvailableYear !== seasonYear) return;
    if (state.draftCombineResultsViewedYear === seasonYear) return;
    setState(prev => ({
      ...prev,
      draftCombineResultsViewedYear: seasonYear,
    }));
  }, [
    currentView,
    state.leagueStats?.year,
    state.draftCombineResultsAvailableYear,
    state.draftCombineResultsViewedYear,
    setState,
  ]);
}

export function useGameProviderPostLoadEffects(state: GameState, setState: SetGameState) {
  const playerBioPreloadSignature = getPlayerBioPreloadSignature(state);
  const externalEuropeanTeamCount = (state.nonNBATeams ?? []).filter(team => (
    isEuroStaffLeagueId(inferEuroStaffLeagueId(
      team.tid,
      state.leagueType,
      { teamLeague: team.league, uiMode: state.leagueStats?.uiMode },
    ))
  )).length;

  useEffect(() => {
    if (!state.isDataLoaded || !state.players?.length) return;
    void prehydratePlayerBioData(state);
  }, [playerBioPreloadSignature, state.isDataLoaded]);

  useEffect(() => {
    const year = Number(state.leagueStats?.year);
    const snapshotKey = `${year}:${externalEuropeanTeamCount}:2`;
    const supportsEuropeanSnapshot = state.leagueType === 'modded'
      && (
        state.moddedLeagueBase === 'nba'
        || state.leagueStats?.uiMode === 'euro_isolated'
      );
    if (
      !state.isDataLoaded
      || !supportsEuropeanSnapshot
      || externalEuropeanTeamCount === 0
      || !Number.isFinite(year)
      || (state.leagueStats as any)?.externalEuropeanCoachSnapshotKey === snapshotKey
    ) return;

    let cancelled = false;
    import('../../services/euro/historicalCoachSource')
      .then(async coachModule => {
        const source = await coachModule.loadEuropeanCoachSource();
        if (cancelled) return;
        setState(previous => {
          const activeYear = Number(previous.leagueStats?.year);
          const activeTeamCount = (previous.nonNBATeams ?? []).filter(team => (
            isEuroStaffLeagueId(inferEuroStaffLeagueId(
              team.tid,
              previous.leagueType,
              { teamLeague: team.league, uiMode: previous.leagueStats?.uiMode },
            ))
          )).length;
          const activeKey = `${activeYear}:${activeTeamCount}`;
          const versionedActiveKey = `${activeKey}:2`;
          const activeSupportsEuropeanSnapshot = previous.leagueType === 'modded'
            && (
              previous.moddedLeagueBase === 'nba'
              || previous.leagueStats?.uiMode === 'euro_isolated'
            );
          if (
            !previous.isDataLoaded
            || !activeSupportsEuropeanSnapshot
            || activeTeamCount === 0
            || (previous.leagueStats as any)?.externalEuropeanCoachSnapshotKey === versionedActiveKey
          ) return previous;
          const snapshot = coachModule.applyEuropeanCoachSnapshot(
            previous.nonNBATeams ?? [],
            activeYear + 1,
            'euroleague',
            source,
          );
          const existingKeys = new Set((previous.staffFreeAgents ?? []).map(member =>
            `${String(member.name).toLowerCase()}|${String(member.position ?? '')}`,
          ));
          const additions = snapshot.staffFreeAgents.filter(member =>
            !existingKeys.has(`${String(member.name).toLowerCase()}|${String(member.position ?? '')}`),
          );
          const retirementIds = new Set((previous.staffRetirementAnnouncements ?? []).map(record => record.id));
          const retirementKeys = new Set((previous.staffRetirementAnnouncements ?? []).map(record =>
            `${String(record.name).toLowerCase().replace(/[^a-z0-9]+/g, '')}|${record.season}`,
          ));
          const retirementAdditions = snapshot.retirementAnnouncements.filter(record =>
            !retirementIds.has(record.id)
            && !retirementKeys.has(`${String(record.name).toLowerCase().replace(/[^a-z0-9]+/g, '')}|${record.season}`),
          );
          return {
            ...previous,
            nonNBATeams: snapshot.teams,
            staffFreeAgents: [...(previous.staffFreeAgents ?? []), ...additions],
            staffRetirementAnnouncements: [
              ...(previous.staffRetirementAnnouncements ?? []),
              ...retirementAdditions,
            ],
            leagueStats: {
              ...previous.leagueStats,
              externalEuropeanCoachSnapshotKey: versionedActiveKey,
              externalEuropeanCoachSourceVersion: snapshot.sourceVersion,
            } as any,
          };
        });
      })
      .catch(error => {
        console.warn('[European staff] historical coach snapshot failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, [
    externalEuropeanTeamCount,
    setState,
    state.gameMode,
    state.isDataLoaded,
    state.leagueStats?.year,
    state.leagueStats?.uiMode,
    (state.leagueStats as any)?.externalEuropeanCoachSnapshotKey,
    state.leagueType,
    state.moddedLeagueBase,
    state.saveId,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.refereePool !== undefined) return;
    let cancelled = false;
    Promise.all([
      import('../../services/referees/refereeRoster'),
      import('../../data/photos/referees'),
    ]).then(async ([refereeMod, refereeDataMod]) => {
      const setup = await refereeMod.loadRefereeRoster(state as any);
      if (cancelled) return;
      refereeDataMod.setRefereeData(setup.active);
      setState(prev => {
        if (prev.refereePool !== undefined) return prev;
        const announcements = [
          ...setup.yearZeroRetirements,
          ...(prev.refereeRetirementAnnouncements ?? []),
        ].filter((record, index, rows) => rows.findIndex(candidate => candidate.id === record.id) === index);
        return {
          ...prev,
          refereePool: setup.pool,
          refereeRetirementAnnouncements: announcements,
          staff: prev.staff ? { ...prev.staff, referees: setup.active } : prev.staff,
        };
      });
    }).catch(error => {
      console.warn('[REFEREES] Bundled referee roster unavailable.', error);
    });
    return () => {
      cancelled = true;
    };
  }, [setState, state.isDataLoaded, state.refereePool]);

  useEffect(() => {
    if (!state.isDataLoaded || state.broadcastTalent !== undefined || !state.players?.length) return;
    let cancelled = false;
    import('../../services/broadcasting/broadcastTalent')
      .then(async module => {
        const setup = await module.buildInitialBroadcastTalent(state, state.players);
        if (cancelled) return;
        setState(previous => previous.broadcastTalent !== undefined
          ? previous
          : {
              ...previous,
              players: setup.players,
              broadcastTalent: setup.records,
            });
      })
      .catch(error => {
        console.warn('[Broadcast talent] Archive unavailable; the saved league can continue without it.', error);
      });
    return () => {
      cancelled = true;
    };
  }, [
    setState,
    state.broadcastTalent,
    state.isDataLoaded,
    state.leagueStats?.year,
    state.players,
    state.saveId,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.staff || !state.players?.length || !state.teams?.length) return;

    const load = () => {
      Promise.all([
        import('../../services/staffService'),
        import('../../data/photos/coaches'),
        import('../../services/staff/historicalNbaExecutives'),
        import('../../services/staff/gmAttributeSource'),
        import('../../services/referees/refereeRoster'),
        import('../../data/photos/referees'),
      ]).then(([staffMod, coachesPhotosMod, executivesMod, gmSourceMod, refereeMod, refereeDataMod]) => {
        const teamNameMap = new Map(state.teams.map(t => [t.name.toLowerCase(), t]));
        Promise.all([
          staffMod.getStaffData(state.players, teamNameMap),
          coachesPhotosMod.fetchCoachData(),
          staffMod.fetchCoachData(),
          import('../../services/staff/staffFallback'),
        ]).then(([staff, _photos, _coaches, fallbackMod]) => {
          const nonNba = fallbackMod.generatePlaceholderNonNBAStaff(state);
          const merged = {
            ...staff,
            coaches: [...(staff.coaches ?? []), ...nonNba.coaches],
            gms: [...(staff.gms ?? []), ...nonNba.gms],
            owners: [...(staff.owners ?? []), ...nonNba.owners],
          };
          setState(prev => {
            const season = prev.leagueStats?.year ?? new Date().getFullYear();
            const shouldRefresh = executivesMod.shouldUseHistoricalNbaExecutives(prev as any);
            const historicalStaff = shouldRefresh
              ? executivesMod.refreshHistoricalNbaGeneralManagers(merged, prev.teams, season)
              : merged;
            const nextStaff = prev.leagueStats?.uiMode === 'wnba_isolated' || prev.moddedLeagueBase === 'wnba'
              ? gmSourceMod.mergeSourcedLeagueGMs(historicalStaff, prev.teams, season, 'wnba')
              : historicalStaff;
            const referees = refereeMod.getActiveReferees(
              prev.refereePool ?? [],
              season,
              refereeMod.getRefereeMode(prev),
            );
            if (referees.length > 0) refereeDataMod.setRefereeData(referees);
            return {
              ...prev,
              staff: { ...nextStaff, referees },
              leagueStats: shouldRefresh
                ? {
                    ...prev.leagueStats,
                    historicalNbaExecutivesSeason: season,
                    historicalNbaExecutivesVersion: executivesMod.HISTORICAL_NBA_EXECUTIVES_VERSION,
                    ...(prev.leagueStats?.uiMode === 'wnba_isolated' || prev.moddedLeagueBase === 'wnba'
                      ? { gmAttributeSourceVersion: 1 }
                      : {}),
                  } as any
                : prev.leagueStats,
            };
          });
        });
      });
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(load, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(load, 2000);
    return () => clearTimeout(id);
  }, [state.isDataLoaded, !!state.staff, state.players?.length, state.teams?.length, setState]);

  useEffect(() => {
    if (!state.isDataLoaded || !state.staff || !(state.nonNBATeams?.length)) return;
    let cancelled = false;
    import('../../services/staff/staffFallback').then(fallbackMod => {
      if (cancelled) return;
      setState(prev => {
        if (!prev.staff || !(prev.nonNBATeams?.length)) return prev;
        const fallback = fallbackMod.generatePlaceholderNonNBAStaff(prev);
        const normalize = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const mergeByTeam = <T extends { team?: string }>(existing: T[], generated: T[]) => {
          const occupied = new Set(existing.map(member => normalize(member.team)).filter(Boolean));
          const additions = generated.filter(member => {
            const key = normalize(member.team);
            if (!key || occupied.has(key)) return false;
            occupied.add(key);
            return true;
          });
          return additions.length > 0 ? [...existing, ...additions] : existing;
        };
        const coaches = mergeByTeam(prev.staff.coaches ?? [], fallback.coaches);
        const gms = mergeByTeam(prev.staff.gms ?? [], fallback.gms);
        const owners = mergeByTeam(prev.staff.owners ?? [], fallback.owners);
        if (coaches === prev.staff.coaches && gms === prev.staff.gms && owners === prev.staff.owners) return prev;
        return { ...prev, staff: { ...prev.staff, coaches, gms, owners } };
      });
    });
    return () => { cancelled = true; };
  }, [setState, state.isDataLoaded, state.nonNBATeams, state.staff]);

  useEffect(() => {
    if (!state.isDataLoaded || !state.staff || !state.teams?.length) return;
    const season = state.leagueStats?.year ?? new Date().getFullYear();

    let cancelled = false;
    import('../../services/staff/historicalNbaExecutives').then(execMod => {
      if (cancelled) return;
      setState(prev => {
        if (!prev.isDataLoaded || !prev.staff || !execMod.shouldUseHistoricalNbaExecutives(prev as any)) return prev;
        const activeSeason = prev.leagueStats?.year ?? season;
        if ((prev.leagueStats as any)?.historicalNbaExecutivesSeason === activeSeason &&
            (prev.leagueStats as any)?.historicalNbaExecutivesVersion === execMod.HISTORICAL_NBA_EXECUTIVES_VERSION) return prev;
        return {
          ...prev,
          staff: execMod.refreshHistoricalNbaGeneralManagers(prev.staff, prev.teams, activeSeason),
          leagueStats: {
            ...prev.leagueStats,
            historicalNbaExecutivesSeason: activeSeason,
            historicalNbaExecutivesVersion: execMod.HISTORICAL_NBA_EXECUTIVES_VERSION,
          } as any,
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    state.isDataLoaded,
    !!state.staff,
    state.teams?.length,
    state.leagueStats?.year,
    (state.leagueStats as any)?.historicalNbaExecutivesSeason,
    (state.leagueStats as any)?.historicalNbaExecutivesVersion,
    setState,
  ]);

  useEffect(() => {
    const isWnba = state.leagueStats?.uiMode === 'wnba_isolated' || state.moddedLeagueBase === 'wnba';
    if (!state.isDataLoaded || !state.staff || !state.teams?.length || !isWnba) return;
    if (Number((state.leagueStats as any)?.gmAttributeSourceVersion ?? 0) >= 1) return;
    let cancelled = false;
    import('../../services/staff/gmAttributeSource').then(sourceMod => {
      if (cancelled) return;
      setState(prev => {
        if (!prev.staff) return prev;
        const season = prev.leagueStats?.year ?? new Date().getFullYear();
        return {
          ...prev,
          staff: sourceMod.mergeSourcedLeagueGMs(prev.staff, prev.teams, season, 'wnba'),
          leagueStats: { ...prev.leagueStats, gmAttributeSourceVersion: 1 } as any,
        };
      });
    });
    return () => { cancelled = true; };
  }, [
    state.isDataLoaded,
    state.staff,
    state.teams,
    state.leagueStats?.uiMode,
    state.moddedLeagueBase,
    (state.leagueStats as any)?.gmAttributeSourceVersion,
    setState,
  ]);
}
