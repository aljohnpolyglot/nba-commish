import { Dispatch, MutableRefObject, SetStateAction, useEffect } from 'react';
import { GameState, Tab } from '../../types';
import { ensureStaffPoolDepth } from '../../services/euro/staffPool';
import { ensureEuroUserAcademyProspects } from '../../services/externalLeagueSustainer';
import { prefetchPlayerBio } from '../../components/central/view/bioCache';
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

type SetGameState = Dispatch<SetStateAction<GameState>>;
type SetTabState = Dispatch<SetStateAction<Tab>>;

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
    if (state.isDataLoaded && state.gameMode === 'gm' && currentView === 'Schedule') {
      setCurrentView('Team Office');
    }
  }, [state.isDataLoaded, state.gameMode, currentView, setCurrentView]);

  useEffect(() => {
    if (!state.isDataLoaded || state.gameMode !== 'gm') return;
    if (state.leagueType === 'fictional') return;
    if (state.leagueStats?.uiMode && state.leagueStats.uiMode !== 'nba') return;
    if ((state.leagueStats as any)?.nbaGMStaffSeeded) return;
    if (!state.teams?.length) return;

    let cancelled = false;
    Promise.all([
      import('../../services/staffService'),
      import('../../services/staff/nbaRealStaffSeed'),
    ]).then(async ([staffMod, seedMod]) => {
      await staffMod.fetchCoachData();
      if (cancelled) return;
      setState(prev => {
        if (!prev.isDataLoaded || prev.gameMode !== 'gm') return prev;
        if (prev.leagueType === 'fictional') return prev;
        if (prev.leagueStats?.uiMode && prev.leagueStats.uiMode !== 'nba') return prev;
        if ((prev.leagueStats as any)?.nbaGMStaffSeeded) return prev;
        const seeded = seedMod.seedRealNBAStaffForAllTeams(
          prev.teams,
          undefined,
          prev.leagueStats?.year ?? new Date().getFullYear(),
          { fillSupportRoles: true },
        );
        if (seeded.filledRoleCount > 0) {
          console.log(`[NBA STAFF] seeded ${seeded.filledRoleCount} AI staff roles across ${seeded.seededCount} teams.`);
        }
        const stockedPool = (prev.leagueStats as any)?.staffPoolSeeded
          ? { staffFreeAgents: prev.staffFreeAgents ?? [] }
          : ensureStaffPoolDepth(
              { ...prev, teams: seeded.teams, staffFreeAgents: prev.staffFreeAgents ?? [] } as any,
              'nba',
            );
        return {
          ...prev,
          teams: seeded.teams,
          staffFreeAgents: stockedPool.staffFreeAgents ?? prev.staffFreeAgents,
          leagueStats: {
            ...prev.leagueStats,
            nbaAIStaffSeeded: true,
            nbaGMStaffSeeded: true,
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
    state.userTeamId,
    state.teams?.length,
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
    if (!state.isDataLoaded) return;
    if (state.leagueStats?.auto2029ExpansionSeeded) return;
    if (state.expansionSchedule) return;
    if (state.leagueStats?.uiMode === 'euro_isolated') {
      setState(prev => ({
        ...prev,
        leagueStats: prev.leagueStats
          ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
          : prev.leagueStats,
      }));
      return;
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
  }, [state.isDataLoaded, state.leagueStats?.year, state.expansionSchedule, state.leagueStats?.auto2029ExpansionSeeded, state.leagueStats?.uiMode, setState]);
}

export function useGameProviderPostLoadEffects(state: GameState, setState: SetGameState) {
  useEffect(() => {
    if (!state.players || state.players.length === 0) return;
    const sorted = [...state.players]
      .filter(p => p.status === 'Active')
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
    sorted.forEach((player, i) => {
      setTimeout(() => prefetchPlayerBio(player), i * 4000);
    });
  }, [!!state.players?.length, state.players]);

  useEffect(() => {
    if (!state.isDataLoaded || state.staff || !state.players?.length || !state.teams?.length) return;

    const load = () => {
      Promise.all([
        import('../../services/staffService'),
        import('../../data/photos/coaches'),
      ]).then(([staffMod, coachesMod]) => {
        const teamNameMap = new Map(state.teams.map(t => [t.name.toLowerCase(), t]));
        Promise.all([
          staffMod.getStaffData(state.players, teamNameMap),
          coachesMod.fetchCoachData(),
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
          setState(prev => ({ ...prev, staff: merged }));
        });
      });
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(load, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(load, 2000);
    return () => clearTimeout(id);
  }, [state.isDataLoaded, !!state.staff, state.staff, state.players, state.teams, setState]);
}
