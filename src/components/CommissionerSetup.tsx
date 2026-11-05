import React, { useDeferredValue, useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { User, ArrowRight, Crown, ArrowLeft, BarChart2, Banknote, CalendarDays, Dumbbell, Brain, Activity, Crosshair, Search, BarChart, Building2, Users, Shirt, Star } from 'lucide-react';
import { SettingsManager } from '../services/SettingsManager';
import { INITIAL_LEAGUE_STATS } from '../constants';
import { getCommissionerBootstrapDate, getSeasonSimStartDate, toISODateString } from '../utils/dateUtils';
import type { LeagueType, ModdedLeagueBase, EuropeMarket } from './setup/LeagueTypeSelector';
import { Home as FranchisePicker } from './central/view/TeamOffice/pages/Home';
import { seedEuroCareer, type EuroCareerSeed } from '../services/euro/careerSeed';
import type { NonNBATeam } from '../types';
import { MyFace, isRealFaceConfig } from './shared/MyFace';
import { getTeamFullName } from '../utils/teamNames';
import { getStaffImageUrl, resolveStaffImageId } from '../utils/staffPortrait';
import { CountryFlag } from './shared/CountryFlag';
import { displayStaffRole } from '../services/staff/staffCareerRows';
import { getOwnerPhoto } from '../data/photos/owners';
import { SponsorLogo } from './tycoon/SponsorLogo';
import { getBrandMeta, resolveSponsorLeagueKey } from '../data/sponsorCatalogFetcher';

// Euro saves always open on July 1 so every Year-0 task starts from one checkpoint.
const EURO_SIM_START_DATE = `${INITIAL_LEAGUE_STATS.year - 1}-07-01`;
import { StartDateTimeline } from './setup/StartDateTimeline';
import { JumpReviewScreen } from './setup/JumpReviewScreen';
import { HistoricalSeasonPicker } from './setup/HistoricalSeasonPicker';
import { NbaGmStartModePicker } from './setup/NbaGmStartModePicker';
import { HistoricalEndesaSeasonPicker } from './setup/HistoricalEndesaSeasonPicker';
import { FictionalLeagueBuilder, type FictionalLeagueStartupConfig } from './setup/FictionalLeagueBuilder';
import { FictionalRosterSetupScreen } from './setup/FictionalSetupScreens';
import { useSetupRosterLoader } from './setup/useSetupRosterLoader';
import { ModdedProfileSetup, ModdedRoleSelector } from './setup/ModdedSetupScreens';
import { FictionalProfileSetup } from './setup/FictionalProfileSetup';
import { shouldPrepareSetupRoster, type SetupStep } from './setup/setupRosterLoadingPolicy';
import { DEFAULT_HISTORICAL_NBA_START_YEAR } from '../data/historicalNbaSeasons';
import { resolveSetupFranchiseIdentityOptions } from './setup/franchisePickerIdentity';
import { ENDESA_HISTORICAL_CATALOG, endesaStartYearToSourceSeason } from '../services/historicalEndesa/catalog';
import {
  getHistoricalPbaRuleOverrides,
} from '../services/pba/historicalCatalog';
import {
  PBA_HISTORY,
  getPlayablePbaSeasons,
  type PlayablePbaSeason,
} from '../services/pba/historyConfig';
import { loadHistoricalPbaSource } from '../services/pba/historicalLoader';
import { getEuroDomesticSourceForMarket } from '../data/euroBasketballSources';
import { buildEuropeanSourceSeasonOptions } from '../data/europeHistoricalBackfill';
import { getEuroHistoricalEconomyFactor } from '../services/euro/historicalEconomy';
import { getConferenceStartIso } from '../services/pba/conferenceTransition';
import { getPbaKeyDates } from './setup/keyDates';
import { isPbaRosterLocal } from '../services/pba/importManager';
import { getCachedEuropeanCoachSource, mergeEuropeanCoachStaffForTeam } from '../services/euro/historicalCoachSource';
import type {
  FictionalHistoryMode,
  FictionalNationalityFrequency,
  FictionalPlayerPool,
  FictionalRosterMode,
  OpeningRosterMode,
  FictionalStartupTeamDef,
  LeagueStats,
  NbaGmStartMode,
} from '../types';
import { resolveOpeningRosterMode } from '../services/fantasyDraft/openingFantasyDraft';
import { buildPersistedStartModePolicy, type SeasonStartModePolicy } from '../services/lifecycle/startModePolicy';

interface CommissionerSetupProps {
  leagueType: LeagueType;
  moddedLeagueBase?: ModdedLeagueBase;
  europeMarket?: EuropeMarket;
  onStart: (payload: {
    name: string;
    startScenario: string;
    skipLLM?: boolean;
    startDate: string;
    jumpRequired: boolean;
    gameMode?: 'commissioner' | 'gm';
    userTeamId?: number;
    assistantGM?: boolean;
    leagueType?: LeagueType;
    moddedLeagueBase?: ModdedLeagueBase;
    europeMarket?: EuropeMarket;
    fictionalLeagueSeed?: number;
    euroCareerSeed?: EuroCareerSeed;
    euroCareerLeagueId?: string;
    nbaStartYear?: number;
    nbaGmStartMode?: NbaGmStartMode;
    endesaStartYear?: number;
    euroStartSeason?: number;
    pbaStartYear?: number;
    pbaSeasonKey?: number;
    fictionalLeagueName?: string;
    fictionalSeasonYear?: number;
    fictionalHistoryMode?: FictionalHistoryMode;
    fictionalTeams?: FictionalStartupTeamDef[];
    fictionalPlayerPool?: FictionalPlayerPool;
    fictionalRosterMode?: FictionalRosterMode;
    openingRosterMode?: OpeningRosterMode;
    fictionalNationalityFrequencies?: FictionalNationalityFrequency[];
    fictionalLeagueRules?: Partial<LeagueStats>;
    startModePolicy?: SeasonStartModePolicy;
    firstActionDate?: string;
  }) => void;
  onBack: () => void;
}

export const CommissionerSetup: React.FC<CommissionerSetupProps> = ({ leagueType, moddedLeagueBase, europeMarket, onStart, onBack }) => {
  const [step, setStep] = useState<SetupStep>('mode');
  const [gameMode, setGameMode] = useState<'commissioner' | 'gm'>(
    moddedLeagueBase === 'europe' || moddedLeagueBase === 'nba' ? 'gm' : 'commissioner'
  );
  // Keep undefined for GM mode — the user picks a team post-init via TeamOffice. No more "everyone is Atlanta".
  const [userTeamId, setUserTeamId] = useState<number | undefined>(undefined);
  const nameRef = useRef('');
  const isEuroSetup = leagueType === 'modded' && moddedLeagueBase === 'europe';
  const isPbaSetup = leagueType === 'modded' && moddedLeagueBase === 'philippines';
  const isWnbaSetup = leagueType === 'modded' && moddedLeagueBase === 'wnba';
  const isNbaSetup = leagueType === 'modded' && moddedLeagueBase === 'nba';
  const isSpainEuropeSetup = leagueType === 'modded' && moddedLeagueBase === 'europe' && europeMarket === 'spain';
  const primaryEuroSource = getEuroDomesticSourceForMarket(europeMarket);
  const primaryEuroLeagueId = isSpainEuropeSetup ? 'endesa' : primaryEuroSource?.leagueId ?? 'endesa';
  const primaryEuroLeagueStatus = isSpainEuropeSetup ? 'Endesa' : primaryEuroSource?.leagueStatus ?? 'Endesa';
  const primaryEuroLeagueName = isSpainEuropeSetup ? 'Liga Endesa' : primaryEuroSource?.displayName ?? 'Domestic League';
  const primaryEuroCountry = isSpainEuropeSetup ? 'Spain' : europeMarket
    ? europeMarket.charAt(0).toUpperCase() + europeMarket.slice(1)
    : 'Europe';
  const isHistoricalNbaSetup = isNbaSetup;
  const isHistoricalEuroSetup = isEuroSetup && gameMode === 'gm';
  const isHistoricalEndesaSetup = isSpainEuropeSetup && gameMode === 'gm';
  const isHistoricalPbaSetup = isPbaSetup;
  const [selectedNbaStartYear, setSelectedNbaStartYear] = useState(DEFAULT_HISTORICAL_NBA_START_YEAR);
  const [selectedEndesaStartYear, setSelectedEndesaStartYear] = useState(ENDESA_HISTORICAL_CATALOG.latestStartYear);
  const [selectedEuroSourceSeason, setSelectedEuroSourceSeason] = useState(primaryEuroSource?.coverageThrough ?? INITIAL_LEAGUE_STATS.year);
  const [selectedPbaSeasonKey, setSelectedPbaSeasonKey] = useState<number>(PBA_HISTORY.playableStartYear);
  const [pbaHistoricalSeasons, setPbaHistoricalSeasons] = useState<PlayablePbaSeason[]>([]);
  const activeEuroSourceSeason = isSpainEuropeSetup
    ? endesaStartYearToSourceSeason(selectedEndesaStartYear)
    : selectedEuroSourceSeason;
  const euroHistoricalSeasons = useMemo(() => buildEuropeanSourceSeasonOptions(
    europeMarket,
    primaryEuroSource,
    isSpainEuropeSetup ? {
      start: endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.firstStartYear),
      through: endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.latestStartYear),
    } : undefined,
  ), [europeMarket, isSpainEuropeSetup, primaryEuroSource]);
  const activeNbaStartYear = selectedNbaStartYear;
  const activePbaSourceSeason = selectedPbaSeasonKey;
  const deferredNbaStartYear = useDeferredValue(activeNbaStartYear);
  const deferredEndesaStartYear = useDeferredValue(selectedEndesaStartYear);
  const deferredEuroSourceSeason = useDeferredValue(selectedEuroSourceSeason);
  const deferredPbaSourceSeason = useDeferredValue(activePbaSourceSeason);
  const pbaSeasonOptions = pbaHistoricalSeasons.length > 0
    ? pbaHistoricalSeasons
    : [{
        season: PBA_HISTORY.playableStartYear,
        sourceSeason: PBA_HISTORY.playableStartYear,
        startYear: PBA_HISTORY.playableStartYear,
        label: String(PBA_HISTORY.playableStartYear),
        dataStatus: 'COMPLETE' as const,
        teamCount: 0,
      }];
  const nbaSeasonEndYear = activeNbaStartYear + 1;
  const nbaDefaultStartDate = toISODateString(getSeasonSimStartDate(nbaSeasonEndYear));
  const commissionerNbaStartDate = toISODateString(getCommissionerBootstrapDate(activeNbaStartYear));
  const pbaOffseasonDate = getPbaKeyDates(activePbaSourceSeason)
    .find(item => item.zone === 'offseason')?.date
    ?? getConferenceStartIso('philippine', activePbaSourceSeason);
  const pbaCommissionerStartDate = (() => {
    const date = new Date(`${pbaOffseasonDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  })();
  const defaultStartDate = isHistoricalEuroSetup
    ? `${activeEuroSourceSeason - 1}-07-01`
    : isEuroSetup
      ? EURO_SIM_START_DATE
      : isPbaSetup
        ? gameMode === 'commissioner'
          ? pbaCommissionerStartDate
          : getConferenceStartIso('philippine', activePbaSourceSeason)
        : nbaDefaultStartDate;
  const [chosenDate, setChosenDate] = useState<string>(defaultStartDate);
  const [settings, setSettings] = useState(() => SettingsManager.getSettings());
  const [fictionalLeagueSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [fictionalStartupConfig, setFictionalStartupConfig] = useState<FictionalLeagueStartupConfig | null>(null);
  const [pendingStartRequest, setPendingStartRequest] = useState<{
    overrideDate?: string;
    assistantGM?: boolean;
    overrideTeamId?: number;
    overrideEuroSeed?: EuroCareerSeed | null;
    overrideFictionalConfig?: FictionalLeagueStartupConfig;
    overrideNbaGmStartMode?: NbaGmStartMode;
    returnStep: SetupStep;
  } | null>(null);
  const [euroCareerSeed, setEuroCareerSeed] = useState<EuroCareerSeed | null>(null);
  const isFictional = leagueType === 'fictional';
  const franchiseIdentityOptions = resolveSetupFranchiseIdentityOptions({
    leagueType,
    moddedLeagueBase,
    nbaStartYear: activeNbaStartYear,
    euroSourceSeason: activeEuroSourceSeason,
    pbaSourceSeason: activePbaSourceSeason,
    wnbaSourceSeason: INITIAL_LEAGUE_STATS.year,
  });
  const {
    teams: rosterTeams,
    players: rosterPlayers,
    loading: rosterLoading,
    slow: rosterSlow,
    supported: rosterSupported,
    error: rosterError,
    retry: retryRosterLoad,
  } = useSetupRosterLoader({
    enabled: shouldPrepareSetupRoster(step),
    leagueType,
    moddedLeagueBase,
    europeMarket,
    activeNbaStartYear: deferredNbaStartYear,
    activeEndesaStartYear: deferredEndesaStartYear,
    activeEuroSourceSeason: isSpainEuropeSetup
      ? endesaStartYearToSourceSeason(deferredEndesaStartYear)
      : deferredEuroSourceSeason,
    activePbaStartYear: deferredPbaSourceSeason,
    fictionalLeagueSeed,
    fictionalSeasonYear: fictionalStartupConfig?.seasonYear,
    fictionalTeams: fictionalStartupConfig?.teams,
    fictionalHistoryMode: fictionalStartupConfig?.historyMode,
    fictionalPlayerPool: fictionalStartupConfig?.playerPool,
    fictionalNationalityFrequencies: fictionalStartupConfig?.nationalities,
    fictionalLeagueRules: fictionalStartupConfig?.leagueRules,
  });
  const rosterSelectionPending = isNbaSetup
    ? deferredNbaStartYear !== activeNbaStartYear
    : isPbaSetup
      ? deferredPbaSourceSeason !== activePbaSourceSeason
      : isSpainEuropeSetup
        ? deferredEndesaStartYear !== selectedEndesaStartYear
        : isEuroSetup
          ? deferredEuroSourceSeason !== selectedEuroSourceSeason
          : false;
  const seasonRosterTeams = rosterSelectionPending ? [] : rosterTeams;
  const seasonRosterPlayers = rosterSelectionPending ? [] : rosterPlayers;
  const seasonRosterLoading = rosterLoading || rosterSelectionPending;
  useEffect(() => {
    if (isNbaSetup || isHistoricalEuroSetup || isHistoricalPbaSetup) setChosenDate(defaultStartDate);
  }, [defaultStartDate, isHistoricalEuroSetup, isHistoricalPbaSetup, isNbaSetup]);

  useEffect(() => {
    if (isNbaSetup) setSelectedNbaStartYear(DEFAULT_HISTORICAL_NBA_START_YEAR);
  }, [isNbaSetup]);

  useEffect(() => {
    if (!isHistoricalPbaSetup) return;
    let cancelled = false;
    loadHistoricalPbaSource().then(source => {
      if (cancelled) return;
      const seasons = getPlayablePbaSeasons(source);
      setPbaHistoricalSeasons(seasons);
      setSelectedPbaSeasonKey(seasons.at(-1)?.season ?? PBA_HISTORY.playableStartYear);
    }).catch(() => {
      if (!cancelled) setPbaHistoricalSeasons([]);
    });
    return () => {
      cancelled = true;
    };
  }, [isHistoricalPbaSetup]);

  const handleHistoricalSeasonChange = (startYear: number) => {
    setSelectedNbaStartYear(startYear);
    setUserTeamId(undefined);
  };

  const handleHistoricalEndesaSeasonChange = (startYear: number) => {
    setSelectedEndesaStartYear(startYear);
    setUserTeamId(undefined);
    setEuroCareerSeed(null);
  };

  const handleHistoricalEuroSeasonChange = (startYear: number) => {
    setSelectedEuroSourceSeason(startYear + 1);
    setUserTeamId(undefined);
    setEuroCareerSeed(null);
  };

  const handleHistoricalPbaSeasonChange = (seasonKey: number) => {
    setSelectedPbaSeasonKey(seasonKey);
    setUserTeamId(undefined);
  };

  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    SettingsManager.saveSettings(updated);
  };

  const handleNameContinue = (profileName: string) => {
    if (!profileName.trim()) return;
    nameRef.current = profileName;
    if (isHistoricalNbaSetup || isHistoricalEuroSetup || isHistoricalPbaSetup) {
      setStep('season');
      return;
    }
    if (isFictional) {
      setStep('fictionalStartup');
      return;
    }
    if (gameMode === 'gm') {
      setStep('franchise');
      return;
    }
    if (isEuroSetup) {
      handleStart(defaultStartDate);
      return;
    }
    if (isNbaSetup) {
      setStep('nbaStart');
      return;
    }
    handleStart(defaultStartDate);
  };

  const buildEuroCareerSeed = (teamId: number): EuroCareerSeed | null => {
    const team = rosterTeams.find(t => t.id === teamId);
    if (!team) return null;
    const nonNBATeams = rosterTeams.map(t => ({
      tid: t.id,
      region: t.region,
      name: t.name,
      abbrev: t.abbrev,
      imgURL: t.logoUrl,
      colors: t.colors,
      league: primaryEuroLeagueStatus,
    })) as NonNBATeam[];
    const masterSeed = ((fictionalLeagueSeed ^ Math.imul(teamId || 1, 2654435761)) >>> 0) || 1;
    const economyScale = getEuroHistoricalEconomyFactor(activeEuroSourceSeason);
    const careerSeed = seedEuroCareer(
      team,
      { players: rosterPlayers, nonNBATeams },
      primaryEuroLeagueId,
      masterSeed,
      economyScale,
      activeEuroSourceSeason,
    );
    const coachSource = getCachedEuropeanCoachSource();
    return coachSource
      ? {
          ...careerSeed,
          staff: mergeEuropeanCoachStaffForTeam(
            team,
            careerSeed.staff,
            activeEuroSourceSeason,
            primaryEuroLeagueId,
            coachSource,
          ),
        }
      : careerSeed;
  };

  const handleStart = (
    overrideDate?: string,
    assistantGM?: boolean,
    overrideTeamId?: number,
    overrideEuroSeed?: EuroCareerSeed | null,
    overrideFictionalConfig?: FictionalLeagueStartupConfig,
    overrideNbaGmStartMode?: NbaGmStartMode,
    openingRosterMode?: OpeningRosterMode,
  ) => {
    // Always reset to Fast mode when starting a new game
    SettingsManager.updateSettings({ llmPerformance: 1 });
    const nameCase = nameRef.current.trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    const activeFictionalConfig = overrideFictionalConfig ?? fictionalStartupConfig;
    if (gameMode === 'gm' && !activeFictionalConfig && !openingRosterMode) {
      setPendingStartRequest({
        overrideDate,
        assistantGM,
        overrideTeamId,
        overrideEuroSeed,
        overrideFictionalConfig,
        overrideNbaGmStartMode,
        returnStep: step,
      });
      setStep('rosterSetup');
      return;
    }
    const fictionalStartPolicy = activeFictionalConfig
      ? buildPersistedStartModePolicy(
          activeFictionalConfig.seasonYear,
          { ...INITIAL_LEAGUE_STATS, ...activeFictionalConfig.leagueRules },
          'opening_rosters',
        )
      : undefined;
    const fictionalStartDate = fictionalStartPolicy?.firstActionDate;
    const commissionerStartDate = activeFictionalConfig
      ? fictionalStartDate!
      : isNbaSetup
        ? overrideDate ?? commissionerNbaStartDate
        : overrideDate ?? fictionalStartDate ?? chosenDate;
    const requestedDate = gameMode === 'commissioner'
      ? commissionerStartDate
      : overrideDate ?? fictionalStartDate ?? chosenDate;
    const date = isEuroSetup ? defaultStartDate : requestedDate;
    const fallbackPbaTeamId = isPbaSetup ? rosterTeams[0]?.id : undefined;
    const selectedTeamId = overrideTeamId ?? userTeamId ?? fallbackPbaTeamId;
    const selectedEuroSeed = overrideEuroSeed ?? (isEuroSetup ? euroCareerSeed : null);
    const resolvedRosterMode = resolveOpeningRosterMode(
      gameMode,
      activeFictionalConfig?.rosterMode ?? openingRosterMode,
    );
    onStart({
      name: nameCase,
      startScenario: 'regular_season',
      skipLLM: !settings.enableLLM,
      startDate: date,
      // Isolated leagues initialize their own calendar after START_GAME.
      jumpRequired: gameMode === 'gm'
        && !(isEuroSetup || isPbaSetup || activeFictionalConfig)
        && !overrideNbaGmStartMode
        && date > defaultStartDate,
      gameMode,
      userTeamId: gameMode === 'gm' ? selectedTeamId : undefined,
      assistantGM: gameMode === 'gm' ? (assistantGM ?? false) : false,
      leagueType,
      moddedLeagueBase: leagueType === 'modded' ? moddedLeagueBase : undefined,
      europeMarket: leagueType === 'modded' ? europeMarket : undefined,
      fictionalLeagueSeed: isFictional ? fictionalLeagueSeed : undefined,
      fictionalLeagueName: activeFictionalConfig?.leagueName,
      fictionalSeasonYear: activeFictionalConfig?.seasonYear,
      fictionalHistoryMode: activeFictionalConfig?.historyMode,
      fictionalTeams: activeFictionalConfig?.teams,
      fictionalPlayerPool: activeFictionalConfig?.playerPool,
      fictionalRosterMode: activeFictionalConfig ? resolvedRosterMode : undefined,
      openingRosterMode: resolvedRosterMode,
      fictionalNationalityFrequencies: activeFictionalConfig?.nationalities,
      fictionalLeagueRules: activeFictionalConfig?.leagueRules,
      startModePolicy: fictionalStartPolicy,
      firstActionDate: fictionalStartPolicy?.firstActionDate,
      euroCareerSeed: selectedEuroSeed ?? undefined,
      euroCareerLeagueId: selectedEuroSeed ? primaryEuroLeagueId : undefined,
      nbaStartYear: isNbaSetup ? selectedNbaStartYear : undefined,
      nbaGmStartMode: isNbaSetup ? overrideNbaGmStartMode : undefined,
      endesaStartYear: isHistoricalEndesaSetup ? selectedEndesaStartYear : undefined,
      euroStartSeason: isEuroSetup ? activeEuroSourceSeason : undefined,
      pbaStartYear: isHistoricalPbaSetup ? selectedPbaSeasonKey - 1 : undefined,
      pbaSeasonKey: isHistoricalPbaSetup ? selectedPbaSeasonKey : undefined,
    });
  };

  const handleDateSelected = (date: string) => {
    if (isEuroSetup) {
      handleStart(defaultStartDate, false, userTeamId, euroCareerSeed);
      return;
    }
    if (isPbaSetup) {
      handleStart(date, false, userTeamId, euroCareerSeed);
      return;
    }
    setChosenDate(date);
    if (date === defaultStartDate) {
      handleStart(date, false, userTeamId, euroCareerSeed);
    } else {
      setStep('review');
    }
  };

  const handleBack = () => {
    if (step === 'rosterSetup' && pendingStartRequest) {
      setStep(pendingStartRequest.returnStep);
      setPendingStartRequest(null);
    } else if (step === 'review') {
      setStep('timeline');
    } else if (step === 'euroReview') {
      setStep('franchise');
    } else if (step === 'fictionalStartup') {
      setStep('name');
    } else if (step === 'nbaStart') {
      setStep('franchise');
    } else if (step === 'timeline') {
      if (isEuroSetup && euroCareerSeed) {
        setStep('euroReview');
        return;
      }
      setStep(isHistoricalNbaSetup ? 'season' : gameMode === 'gm' ? 'franchise' : 'name');
    } else if (step === 'season') {
      setStep('name');
    } else if (step === 'franchise') {
      setStep(isHistoricalNbaSetup || isHistoricalEuroSetup || isHistoricalPbaSetup ? 'season' : fictionalStartupConfig ? 'fictionalStartup' : 'name');
    } else if (step === 'name') {
      setStep('mode');
    } else {
      onBack();
    }
  };

  if (step === 'rosterSetup' && pendingStartRequest) {
    return (
      <FictionalRosterSetupScreen
        onSelect={(mode) => {
          const request = pendingStartRequest;
          setPendingStartRequest(null);
          handleStart(
            request.overrideDate,
            request.assistantGM,
            request.overrideTeamId,
            request.overrideEuroSeed,
            request.overrideFictionalConfig,
            request.overrideNbaGmStartMode,
            mode,
          );
        }}
      />
    );
  }

  if (step === 'fictionalStartup' && isFictional) {
    return (
      <FictionalLeagueBuilder
        onBack={() => setStep('name')}
        onContinue={(config) => {
          setFictionalStartupConfig(config);
          setUserTeamId(undefined);
          if (gameMode === 'gm') {
            setStep('franchise');
          } else {
            handleStart(undefined, false, undefined, null, config);
          }
        }}
      />
    );
  }

  // ── Mode Picker (first screen) ────────────────────────────────────────────
  if (step === 'mode') {
    if (!isFictional) {
      return (
        <ModdedRoleSelector
          leagueBase={moddedLeagueBase}
          selectedRole={gameMode}
          onSelect={setGameMode}
          onContinue={() => setStep('name')}
          onBack={onBack}
        />
      );
    }
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        <button
          onClick={onBack}
          className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20"
        >
          <ArrowLeft size={20} /> Back to Menu
        </button>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-2xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-3">Choose Your Role</h1>
            <p className="text-slate-400 text-sm">How do you want to experience the {isFictional ? 'league' : moddedLeagueBase === 'europe' ? 'European game' : moddedLeagueBase === 'philippines' ? 'PBA' : 'NBA'}?</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Commissioner Card — Europe remains GM-only until its assembly flow is complete. */}
            <button
              onClick={() => {
                if (moddedLeagueBase === 'europe') return;
                setGameMode('commissioner'); setStep('name');
              }}
              disabled={moddedLeagueBase === 'europe'}
              className={`group relative p-6 rounded-2xl border-2 transition-all text-left ${
                moddedLeagueBase === 'europe'
                  ? 'border-slate-900 bg-slate-900/30 opacity-50 cursor-not-allowed'
                  : gameMode === 'commissioner'
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <Crown size={24} className="text-indigo-400" />
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Commissioner</h3>
                {moddedLeagueBase === 'europe' && (
                  <span className="ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded">
                    Coming Soon
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                {moddedLeagueBase === 'europe'
                  ? <>European commissioner mode is in development. For now, European saves are <span className="text-white font-bold">GM-only</span>.</>
                  : moddedLeagueBase === 'philippines'
                    ? <>Run the <span className="font-bold text-white">entire PBA</span>. Review league proposals, tune competition rules and finances, manage events, and guide every franchise from the offseason calendar.</>
                  : <>Control the <span className="text-white font-bold">entire league</span>. Set rules, suspend players, force trades, manage finances, and shape the narrative.</>
                }
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Rules', 'Suspensions', 'Economy', 'LLM Narrative', 'All Teams'].map(tag => (
                  <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded">{tag}</span>
                ))}
              </div>
            </button>

            {/* GM Card */}
            <button
              onClick={() => { setGameMode('gm'); setStep('name'); }}
              className={`group relative p-6 rounded-2xl border-2 transition-all text-left ${
                gameMode === 'gm'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <User size={24} className="text-emerald-400" />
                <h3 className="text-xl font-black text-white uppercase tracking-tight">General Manager</h3>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Manage <span className="text-white font-bold">one team</span>. Build your roster through trades and free agency{moddedLeagueBase === 'europe' ? '' : ', and the draft'}. Compete for a championship.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(moddedLeagueBase === 'europe'
                  ? ['Trades', 'Free Agency', 'No Draft', 'Roster', 'Your Team']
                  : moddedLeagueBase === 'philippines'
                    ? ['3 Cups', 'Imports', getHistoricalPbaRuleOverrides(activePbaSourceSeason).fourPointLine ? '4-Point Line' : 'Historical Rules', 'Draft', 'Your Team']
                    : ['Trades', 'Free Agency', 'Draft', 'Roster', 'Your Team']
                ).map(tag => (
                  <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">{tag}</span>
                ))}
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === 'season' && isHistoricalNbaSetup) {
    return (
      <HistoricalSeasonPicker
        selectedStartYear={selectedNbaStartYear}
        onChange={handleHistoricalSeasonChange}
        onContinue={() => {
          if (!seasonRosterLoading && rosterSupported && seasonRosterTeams.length > 0) {
            if (gameMode === 'gm') setStep('franchise');
            else setStep('nbaStart');
          }
        }}
        onBack={() => setStep('name')}
        teams={seasonRosterTeams}
        players={seasonRosterPlayers}
        loading={seasonRosterLoading}
        loadSlow={rosterSlow}
        sourceReady={rosterSupported}
        errorMessage={rosterError}
        onRetry={retryRosterLoad}
        continueLabel={gameMode === 'gm' ? 'Choose Team' : 'Choose Starting Point'}
      />
    );
  }

  if (step === 'season' && isHistoricalPbaSetup) {
    return (
      <HistoricalEndesaSeasonPicker
        selectedStartYear={selectedPbaSeasonKey}
        onChange={handleHistoricalPbaSeasonChange}
        onContinue={() => {
          if (seasonRosterLoading || !rosterSupported || seasonRosterTeams.length < 2) return;
          if (gameMode === 'gm') setStep('franchise');
          else handleStart(pbaCommissionerStartDate);
        }}
        onBack={() => setStep('name')}
        teams={seasonRosterTeams}
        players={seasonRosterPlayers}
        loading={seasonRosterLoading}
        loadSlow={rosterSlow}
        sourceReady={rosterSupported}
        errorMessage={rosterError}
        onRetry={retryRosterLoad}
        leagueName="PBA"
        countryName="Philippine"
        seasons={pbaSeasonOptions}
        requiredTeamCount={2}
        featuredPlayerFilter={player => isPbaRosterLocal(player)}
        earliestPlayableNote="Earliest complete playable PBA season in this database."
        seasonNote=""
      />
    );
  }

  if (step === 'season' && isHistoricalEndesaSetup) {
    return (
      <HistoricalEndesaSeasonPicker
        selectedStartYear={selectedEndesaStartYear}
        onChange={handleHistoricalEndesaSeasonChange}
        onContinue={() => {
          if (!seasonRosterLoading && rosterSupported && seasonRosterTeams.length >= 2) setStep('franchise');
        }}
        onBack={() => setStep('name')}
        teams={seasonRosterTeams}
        players={seasonRosterPlayers}
        loading={seasonRosterLoading}
        loadSlow={rosterSlow}
        sourceReady={rosterSupported}
        errorMessage={rosterError}
        onRetry={retryRosterLoad}
        seasons={euroHistoricalSeasons}
        requiredTeamCount={2}
        earliestPlayableNote="Earliest complete playable Liga ACB season in this database."
      />
    );
  }

  if (step === 'season' && isHistoricalEuroSetup && primaryEuroSource) {
    return (
      <HistoricalEndesaSeasonPicker
        selectedStartYear={selectedEuroSourceSeason - 1}
        onChange={handleHistoricalEuroSeasonChange}
        onContinue={() => {
          if (!seasonRosterLoading && rosterSupported && seasonRosterTeams.length >= 2) setStep('franchise');
        }}
        onBack={() => setStep('name')}
        teams={seasonRosterTeams}
        players={seasonRosterPlayers}
        loading={seasonRosterLoading}
        loadSlow={rosterSlow}
        sourceReady={rosterSupported}
        errorMessage={rosterError}
        onRetry={retryRosterLoad}
        leagueName={primaryEuroLeagueName}
        countryName={primaryEuroCountry}
        seasons={euroHistoricalSeasons}
        requiredTeamCount={2}
      />
    );
  }

  // Fullscreen franchise picker — GM mode only, between name and timeline.
  // Recycles the TeamOffice Home grid so the visual language matches the in-game Team Office.
  if (step === 'franchise') {
    return (
      <div className="min-h-screen w-full bg-[#0d1117] overflow-y-auto">
        <button
          onClick={() => setStep(isHistoricalNbaSetup || isHistoricalEuroSetup || isHistoricalPbaSetup ? 'season' : fictionalStartupConfig ? 'fictionalStartup' : 'name')}
          className="absolute top-6 left-6 text-[#8b949e] hover:text-white flex items-center gap-2 transition-colors z-20 text-sm font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div className="px-4 md:px-10 py-10">
          {rosterLoading ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center text-[#8b949e] font-bold uppercase tracking-widest">
              <div className="animate-pulse">{rosterSlow ? 'Still preparing franchises…' : 'Loading franchises…'}</div>
              {rosterSlow && (
                <div className="max-w-md text-xs normal-case leading-6 tracking-normal text-[#8b949e]/80">
                  This can take longer on a weak connection. You can wait here or go back and choose another season.
                </div>
              )}
            </div>
          ) : !rosterSupported ? (
            <div className="min-h-[60vh] flex items-center justify-center px-4">
              <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
                <div className="text-sm font-black uppercase tracking-widest text-amber-300">Franchises Unavailable</div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {rosterError ?? 'Teams could not be prepared. Check your connection and try again.'}
                </p>
                <button
                  onClick={retryRosterLoad}
                  className="mt-5 h-11 rounded-xl bg-amber-500 px-5 text-xs font-black uppercase tracking-widest text-slate-950 transition-colors hover:bg-amber-400"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <FranchisePicker
              pickerMode
              selectedTid={userTeamId ?? null}
              teams={rosterTeams}
              players={rosterPlayers}
              seasonYear={franchiseIdentityOptions.seasonYear}
              preserveProvidedBranding={franchiseIdentityOptions.preserveProvidedBranding}
              title={isEuroSetup
                ? `Pick Your ${primaryEuroLeagueName} Club`
                : isPbaSetup
                  ? 'Pick Your PBA Team'
                  : isWnbaSetup
                    ? 'Pick Your WNBA Team'
                    : undefined}
              subtitle={isEuroSetup
                ? `Choose a ${primaryEuroCountry} club for the ${primaryEuroLeagueName} season.`
                : isPbaSetup
                  ? 'Three conferences per season. Philippine Cup, Commissioner\'s Cup, Governors\' Cup.'
                  : isWnbaSetup
                    ? 'Choose the franchise you will lead.'
                    : undefined}
              onSelectTeam={(teamId) => {
                setUserTeamId(teamId);
                if (isFictional && fictionalStartupConfig) {
                  handleStart(undefined, false, teamId);
                  return;
                }
                if (isPbaSetup) {
                  setStep('timeline');
                  return;
                }
                if (isWnbaSetup) {
                  handleStart(undefined, false, teamId);
                  return;
                }
                if (isEuroSetup) {
                  const seed = buildEuroCareerSeed(teamId);
                  setEuroCareerSeed(seed);
                  if (seed) {
                    setStep('euroReview');
                  } else {
                    handleStart(defaultStartDate, false, teamId);
                  }
                  return;
                }
                setStep(isNbaSetup ? 'nbaStart' : 'timeline');
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (step === 'nbaStart' && isNbaSetup) {
    return (
      <NbaGmStartModePicker
        startYear={selectedNbaStartYear}
        gameMode={gameMode}
        onSelect={(mode, date) => handleStart(date, false, userTeamId, null, undefined, mode)}
        onBack={() => setStep(gameMode === 'gm'
          ? 'franchise'
          : isHistoricalNbaSetup
            ? 'season'
            : 'name')}
      />
    );
  }

  if (step === 'euroReview' && euroCareerSeed && userTeamId != null) {
    const staff = euroCareerSeed.staff;
    const teamObj = euroCareerSeed.team;
    const teamColors = (teamObj.colors ?? []).filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 3);
    while (teamColors.length < 3) teamColors.push(['#2563EB', '#F8FAFC', '#0F172A'][teamColors.length]);
    const neutralClubColors = new Set(['#000000', '#0B0B0B', '#111111', '#111827', '#0F172A', '#1F2937', '#FFFFFF', '#F8FAFC', '#F9FAFB', '#9CA3AF', '#C8C9C7']);
    const accentColors = teamColors.filter(color => !neutralClubColors.has(color.toUpperCase()));
    const teamAccent = accentColors[0] ?? teamColors[0];
    const teamAccentAlt = accentColors[1] ?? teamAccent;
    const accentRgb = teamAccent.slice(1).match(/.{2}/g)?.map(channel => Number.parseInt(channel, 16)) ?? [255, 255, 255];
    const accentText = (accentRgb[0] * 299 + accentRgb[1] * 587 + accentRgb[2] * 114) / 1000 > 156 ? '#020617' : '#FFFFFF';
    const panelStyle = {
      borderColor: `${teamAccent}35`,
      background: `linear-gradient(145deg, ${teamAccent}10 0%, rgba(15, 23, 42, 0.86) 48%, ${teamAccentAlt}0D 100%)`,
      boxShadow: `inset 0 1px 0 ${teamAccent}12`,
    };
    const stadiumCap = (teamObj as any).stadiumCapacity as number | undefined;
    const academyLevel = euroCareerSeed.tier === 'Powerhouse' ? 5 : euroCareerSeed.tier === 'Established' ? 4 : euroCareerSeed.tier === 'MidTier' ? 3 : 2;
    const domesticGoal = `Build a sustainable contender in ${primaryEuroLeagueName} while earning a place among Europe’s best clubs.`;
    const sponsorLeague = resolveSponsorLeagueKey(europeMarket, euroCareerSeed.leagueId, primaryEuroCountry, primaryEuroLeagueName);

    const STAFF_ROLE_ICONS: Record<string, React.ReactNode> = {
      'Head Coach': <Dumbbell size={18} style={{ color: teamAccent }} />,
      'Assistant Coach': <Users size={18} style={{ color: teamAccent }} />,
      'Assistant Coach 2': <Users size={18} style={{ color: teamAccent }} />,
      'Assistant Coach 3': <Users size={18} style={{ color: teamAccent }} />,
      'Head of Sports Science': <Activity size={18} style={{ color: teamAccent }} />,
      'Head Physio': <Activity size={18} style={{ color: teamAccent }} />,
      'Player Development Coach': <Dumbbell size={18} style={{ color: teamAccent }} />,
      'Chief Scout': <Search size={18} style={{ color: teamAccent }} />,
      'Head of Analytics': <BarChart size={18} style={{ color: teamAccent }} />,
    };

    const SPONSOR_SLOT_LABELS: Record<string, string> = {
      main: 'Main Sponsor',
      jersey: 'Jersey Sponsor',
      arena: 'Arena Sponsor',
    };
    return (
      <div
        className="relative isolate min-h-screen bg-slate-950 text-slate-100 overflow-y-auto"
        style={{
          background: `
            radial-gradient(circle at 10% -5%, ${teamAccent}38 0%, transparent 34%),
            radial-gradient(circle at 94% 12%, ${teamAccentAlt}24 0%, transparent 30%),
            linear-gradient(145deg, #020617 0%, #070D1B 46%, #020617 100%)
          `,
        }}
      >
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-1 z-30"
          style={{ background: `linear-gradient(90deg, ${teamAccent}, ${teamAccentAlt}, ${teamColors[2]})` }}
        />
        <div
          className="pointer-events-none fixed -left-32 top-40 h-72 w-72 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: teamAccent }}
        />
        <button
          onClick={() => setStep('franchise')}
          className="fixed top-6 left-4 sm:left-6 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20 text-sm font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div className="relative z-10 max-w-[1280px] mx-auto px-4 sm:px-5 py-16 md:py-20">
          {/* ── Header: Logo + Team Name + Chips ── */}
          <div className="mb-8 flex flex-col md:flex-row md:items-start gap-5">
            {teamObj.logoUrl && (
              <div
                className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border p-3 flex items-center justify-center shrink-0"
                style={{
                  borderColor: `${teamAccent}55`,
                  background: `radial-gradient(circle at 35% 25%, ${teamAccent}2E 0%, rgba(15, 23, 42, 0.88) 68%)`,
                  boxShadow: `0 18px 50px ${teamAccent}24`,
                }}
              >
                <img src={teamObj.logoUrl} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] mb-2" style={{ color: teamAccent }}>{primaryEuroLeagueName} Career</div>
              <h1 className="text-3xl md:text-5xl font-black text-white leading-tight break-words">{getTeamFullName(teamObj)}</h1>
              <p className="mt-2 text-sm text-slate-400 max-w-2xl">Review the starting club profile before the save is created.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-xl border px-4 py-2" style={panelStyle}>
                  <BarChart2 size={16} className="text-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tier</span>
                  <span className="text-sm font-black text-white">{euroCareerSeed.tier}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border px-4 py-2" style={panelStyle}>
                  <Banknote size={16} style={{ color: teamAccent }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Starting Budget</span>
                  <span className="text-sm font-black" style={{ color: teamAccent }}>{'€'}{(euroCareerSeed.budget / 1_000_000).toFixed(1)}M</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border px-4 py-2" style={panelStyle}>
                  <CalendarDays size={16} className="text-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Start Date</span>
                  <span className="text-sm font-black text-white">July 1</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            {/* ── Left Column ── */}
            <div className="space-y-6">
              {/* Technical Staff */}
              <section className="rounded-2xl border overflow-hidden" style={panelStyle}>
                <div className="px-5 pt-5 pb-3">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Technical Staff
                    <div className="mt-1 h-0.5 w-10 rounded-full" style={{ background: `linear-gradient(90deg, ${teamAccent}, ${teamAccentAlt})` }} />
                  </div>
                </div>
                <div className="px-5 pb-4 grid md:grid-cols-2 gap-3">
                  {staff.map(member => (
                    <div
                      key={member.position}
                      className="flex items-center gap-3 rounded-xl border bg-slate-950/60 p-3"
                      style={{ borderColor: `${teamAccent}24`, background: `linear-gradient(110deg, ${teamAccent}0D, rgba(2, 6, 23, 0.7) 42%)` }}
                    >
                      {/* Portrait */}
                      <div className="w-14 h-14 shrink-0 rounded-lg bg-slate-800/60 overflow-hidden border" style={{ borderColor: `${teamAccent}35` }}>
                        {(() => {
                          const staffImg = member.playerPortraitUrl ?? getStaffImageUrl((member as any).staffImageId);
                          if (staffImg) return <img src={staffImg} alt={member.name} className="w-full h-full object-cover" loading="lazy" />;
                          if (isRealFaceConfig(member.face)) return <MyFace face={member.face} lazy style={{ width: '100%', height: '100%' }} />;
                          return <div className="w-full h-full flex items-center justify-center text-slate-600"><User size={24} /></div>;
                        })()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{member.name}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: teamAccent }}>{displayStaffRole(member.jobTitle ?? member.position ?? '')}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <CountryFlag country={member.nationality ?? ''} />
                          <span>{member.nationality ?? 'Unknown'}</span>
                        </div>
                      </div>
                      {/* Role Icon */}
                      <div className="shrink-0 opacity-60">
                        {STAFF_ROLE_ICONS[member.jobTitle ?? member.position ?? ''] ?? <User size={18} className="text-slate-600" />}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Staff Overview footer */}
                <div className="border-t px-5 py-3 flex items-center justify-between text-xs text-slate-500" style={{ borderColor: `${teamAccent}24` }}>
                  <span className="font-bold uppercase tracking-widest">Staff Overview</span>
                  <span className="flex items-center gap-1.5"><Users size={14} /> {staff.length} Staff Members</span>
                </div>
              </section>

              {/* ── Bottom Bar: Club details ── */}
              <div className="rounded-2xl border px-5 py-4 grid grid-cols-1 min-[390px]:grid-cols-2 sm:grid-cols-4 gap-4 text-xs" style={panelStyle}>
                <div className="flex items-center gap-2">
                  <Shirt size={16} style={{ color: teamAccent }} />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Club Colors</div>
                    <div className="mt-1 flex items-center gap-1">
                      {teamColors.slice(0, 3).map((c, i) => (
                        <span key={i} className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ background: c, boxShadow: `0 0 10px ${c}55` }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-slate-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stadium</div>
                    <div className="font-bold text-white">{teamObj.region ?? 'Arena'}</div>
                    {stadiumCap && <div className="text-slate-500">Capacity: {stadiumCap.toLocaleString()}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Crown size={16} className="text-slate-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nickname</div>
                    <div className="font-bold text-white">{teamObj.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Star size={16} style={{ color: teamAccent }} />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Youth Facility</div>
                    <div className="flex gap-0.5 mt-0.5">
                      {[1,2,3,4,5].map(i => (
                        <Star
                          key={i}
                          size={12}
                          className={i <= academyLevel ? 'fill-current' : 'text-slate-700'}
                          style={i <= academyLevel ? { color: teamAccent } : undefined}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right Sidebar ── */}
            <aside className="space-y-6">
              {/* Owner */}
              <section className="rounded-2xl border p-5" style={panelStyle}>
                <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Owner</div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-800/60 overflow-hidden shrink-0 border" style={{ borderColor: `${teamAccent}35` }}>
                    {(() => {
                      const ownerImg = getOwnerPhoto(euroCareerSeed.owner.name)
                        ?? getStaffImageUrl(resolveStaffImageId(euroCareerSeed.owner));
                      if (ownerImg) return <img src={ownerImg} alt={euroCareerSeed.owner.name} className="w-full h-full object-cover" loading="lazy" />;
                      if (isRealFaceConfig(euroCareerSeed.owner.face)) return <MyFace face={euroCareerSeed.owner.face} lazy style={{ width: '100%', height: '100%' }} />;
                      return <div className="w-full h-full flex items-center justify-center text-slate-600"><User size={28} /></div>;
                    })()}
                  </div>
                  <div>
                    <div className="text-lg font-black text-white">{euroCareerSeed.owner.name}</div>
                    <div className="text-sm text-slate-400 flex items-center gap-1.5">
                      <CountryFlag country={euroCareerSeed.owner.nationality} />
                      {euroCareerSeed.owner.nationality}
                    </div>
                  </div>
                </div>
              </section>

              {/* Sponsors */}
              <section className="rounded-2xl border p-5" style={panelStyle}>
                <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Sponsors</div>
                <div className="space-y-3">
                  {euroCareerSeed.sponsors.length === 0 ? (
                    <div className="text-sm text-slate-400">Sponsor catalog pending. Slots will be filled by the tycoon layer.</div>
                  ) : euroCareerSeed.sponsors.map(slot => (
                    <div
                      key={slot.slotId}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-3 rounded-xl border bg-slate-950/60 p-3"
                      style={{ borderColor: `${teamAccent}24`, background: `linear-gradient(110deg, ${teamAccent}0D, rgba(2, 6, 23, 0.7) 42%)` }}
                    >
                      <SponsorLogo name={slot.brand} meta={getBrandMeta(sponsorLeague, slot.brand)} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{SPONSOR_SLOT_LABELS[slot.slotId] ?? slot.slotId}</div>
                        <div className="font-bold text-white truncate">{slot.brand}</div>
                      </div>
                      <div className="w-full sm:w-auto pl-[52px] sm:pl-0 text-sm font-bold shrink-0 whitespace-nowrap" style={{ color: teamAccent }}>{'€'}{(slot.amountEUR / 1_000_000).toFixed(1)}M / year</div>
                    </div>
                  ))}
                </div>
              </section>

              <section
                className="rounded-2xl border p-5"
                style={{
                  borderColor: `${teamAccent}48`,
                  background: `linear-gradient(135deg, ${teamAccent}18 0%, ${teamAccentAlt}0C 100%)`,
                }}
              >
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-3" style={{ color: teamAccent }}>
                  <Crosshair size={16} /> Domestic Objectives
                </div>
                <p className="text-sm leading-relaxed text-slate-200">{domesticGoal}</p>
              </section>

              {/* Start Career */}
              <button
                onClick={() => handleStart(defaultStartDate, false, userTeamId, euroCareerSeed)}
                className="w-full min-h-14 rounded-2xl font-black uppercase tracking-widest transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-3 text-base px-4"
                style={{
                  color: accentText,
                  background: `linear-gradient(110deg, ${teamAccent} 0%, ${teamAccentAlt} 100%)`,
                  boxShadow: `0 18px 42px ${teamAccent}32`,
                }}
              >
                Start Career <ArrowRight size={20} />
              </button>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // Timeline and review are full-screen, handled separately
  if (step === 'timeline' && gameMode === 'gm' && !isEuroSetup && !isWnbaSetup) {
    return (
      <StartDateTimeline
        onSelect={handleDateSelected}
        onBack={() => setStep(isEuroSetup && euroCareerSeed ? 'euroReview' : isHistoricalNbaSetup ? (gameMode === 'gm' ? 'franchise' : 'season') : gameMode === 'gm' ? 'franchise' : 'name')}
        leagueType={leagueType}
        moddedLeagueBase={moddedLeagueBase}
        seasonEndYear={isHistoricalNbaSetup ? nbaSeasonEndYear : isHistoricalPbaSetup ? activePbaSourceSeason : undefined}
      />
    );
  }

  if (step === 'review' && gameMode === 'gm' && !isEuroSetup && !isWnbaSetup) {
    return (
      <JumpReviewScreen
        chosenDate={chosenDate}
        gameMode={gameMode}
        leagueType={leagueType}
        moddedLeagueBase={moddedLeagueBase}
        seasonEndYear={isHistoricalNbaSetup ? nbaSeasonEndYear : isHistoricalPbaSetup ? activePbaSourceSeason : undefined}
        onContinue={(assistantGM) => handleStart(undefined, assistantGM, userTeamId, euroCareerSeed)}
        onBack={() => setStep('timeline')}
      />
    );
  }

  if (!isFictional) {
    const continueLabel = gameMode === 'gm'
      ? (isNbaSetup ? 'Choose Season & Start' : 'Choose Team')
      : isNbaSetup
        ? 'Choose Season & Start'
        : isWnbaSetup
          ? 'Start WNBA'
          : 'Choose Start Date';
    return (
      <ModdedProfileSetup
        gameMode={gameMode}
        initialName={nameRef.current}
        enableLLM={settings.enableLLM}
        continueLabel={continueLabel}
        onToggleLLM={() => updateSetting('enableLLM', !settings.enableLLM)}
        onContinue={handleNameContinue}
        onBack={handleBack}
      />
    );
  }

  return (
    <FictionalProfileSetup
      gameMode={gameMode}
      initialName={nameRef.current}
      enableLLM={settings.enableLLM}
      onToggleLLM={() => updateSetting('enableLLM', !settings.enableLLM)}
      onContinue={handleNameContinue}
      onBack={handleBack}
    />
  );
};
