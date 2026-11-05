import React, { useEffect, useState } from 'react';
import { DEFAULT_CAP_INFLATION_AVERAGE, INITIAL_LEAGUE_STATS } from '../../constants';
import { getHistoricalNbaRuleOverrides } from '../../data/historicalNbaSeasons';
import { COUNTRY_FREQUENCIES } from '../../genplayersconstants';
import type { FictionalHistoryMode, FictionalPlayerPool, FictionalRosterMode, LeagueStats } from '../../types';
import { applyEraRulesProfile } from '../../services/era/eraRulesProfile';
import { FictionalLeagueSettingsScreen } from './FictionalLeagueSettingsScreen';
import {
  FictionalLeagueOriginScreen,
  FictionalLeagueTypeScreen,
  FictionalNationalitiesScreen,
  FictionalRosterSetupScreen,
  FictionalYearScreen,
} from './FictionalSetupScreens';
import { FictionalTeamCustomizer } from './FictionalTeamCustomizer';
import { loadGeneratedTeamCatalog } from '../../services/generatedTeamCatalog';
import {
  buildInitialConferences,
  serializeBuilderTeams,
  type BuilderConference,
  type BuilderScreen,
  type FictionalLeagueStartupConfig,
  type GeneratedTeamCatalogEntry,
} from './fictionalLeagueBuilderTypes';
import { FIRST_BASKETBALL_YEAR, getBasketballEraRules } from '../../services/era/basketballEraRules';

interface FictionalLeagueBuilderProps {
  onBack: () => void;
  onContinue: (config: FictionalLeagueStartupConfig) => void;
}

const SCREEN_BACK: Partial<Record<BuilderScreen, BuilderScreen>> = {
  customize: 'year',
  leagueType: 'customize',
  nationalities: 'leagueType',
  leagueSettings: 'nationalities',
  leagueOrigin: 'leagueSettings',
  rosterSetup: 'leagueOrigin',
};

const FIRST_FICTIONAL_RULE_YEAR = FIRST_BASKETBALL_YEAR;
const CURRENT_FICTIONAL_RULE_YEAR = INITIAL_LEAGUE_STATS.year;

function getDefaultFictionalSeasonYear(): number {
  const now = new Date();
  const currentSeasonEndYear = now.getUTCFullYear() + (now.getUTCMonth() >= 6 ? 1 : 0);
  return Math.max(INITIAL_LEAGUE_STATS.year, currentSeasonEndYear);
}

function scaleRulesEconomy(rules: LeagueStats, seasonYear: number): LeagueStats {
  const anchorYear = seasonYear < FIRST_FICTIONAL_RULE_YEAR
    ? FIRST_FICTIONAL_RULE_YEAR
    : seasonYear > CURRENT_FICTIONAL_RULE_YEAR
      ? CURRENT_FICTIONAL_RULE_YEAR
      : seasonYear;
  const yearDelta = seasonYear - anchorYear;
  if (yearDelta === 0 || rules.inflationEnabled === false) return rules;

  const factor = Math.pow(1 + (rules.inflationAverage ?? DEFAULT_CAP_INFLATION_AVERAGE) / 100, yearDelta);
  const scaleUsd = (value: number | undefined) => value == null ? value : Math.max(0, Math.round(value * factor));
  const scaleMillions = (value: number | undefined) => value == null ? value : Math.max(0, value * factor);

  return {
    ...rules,
    revenue: rules.revenue * factor,
    salaryCap: scaleUsd(rules.salaryCap) ?? rules.salaryCap,
    luxuryPayroll: scaleUsd(rules.luxuryPayroll) ?? rules.luxuryPayroll,
    historicalContractScaleCap: scaleUsd(rules.historicalContractScaleCap),
    minContract: scaleUsd(rules.minContract) ?? rules.minContract,
    maxContract: scaleUsd(rules.maxContract) ?? rules.maxContract,
    minContractStaticAmount: scaleMillions(rules.minContractStaticAmount),
    rookieStaticAmount: scaleMillions(rules.rookieStaticAmount),
    roomMleAmount: scaleUsd(rules.roomMleAmount),
    nonTaxpayerMleAmount: scaleUsd(rules.nonTaxpayerMleAmount),
    taxpayerMleAmount: scaleUsd(rules.taxpayerMleAmount),
    biannualAmount: scaleUsd(rules.biannualAmount),
    cupPrizeWinner: scaleUsd(rules.cupPrizeWinner),
    cupPrizeRunnerUp: scaleUsd(rules.cupPrizeRunnerUp),
    cupPrizeSemi: scaleUsd(rules.cupPrizeSemi),
    cupPrizeQuarter: scaleUsd(rules.cupPrizeQuarter),
    mediaRights: rules.mediaRights ? {
      ...rules.mediaRights,
      lpPrice: rules.mediaRights.lpPrice * factor,
      lpPriceMonthly: rules.mediaRights.lpPriceMonthly == null ? undefined : rules.mediaRights.lpPriceMonthly * factor,
      totalRev: rules.mediaRights.totalRev * factor,
      mediaRev: rules.mediaRights.mediaRev * factor,
      lpRev: rules.mediaRights.lpRev * factor,
      salaryCap: rules.mediaRights.salaryCap * factor,
    } : undefined,
  };
}

export function getFictionalRulesForYear(seasonYear: number): LeagueStats {
  const currentRuleSeason = INITIAL_LEAGUE_STATS.year - 1;
  const selectedRuleSeason = Math.max(FIRST_BASKETBALL_YEAR, Math.min(currentRuleSeason, seasonYear - 1));
  const historicalOverrides = getHistoricalNbaRuleOverrides(selectedRuleSeason);
  const basketballEra = getBasketballEraRules(seasonYear);
  const modernAprons = selectedRuleSeason >= 2023 && historicalOverrides.apronsEnabled !== false;
  return applyEraRulesProfile(scaleRulesEconomy({
    ...INITIAL_LEAGUE_STATS,
    ...historicalOverrides,
    historicalEraKey: basketballEra.key,
    historicalEraStartYear: seasonYear,
    apronsEnabled: modernAprons,
    numberOfAprons: modernAprons ? 2 : 0,
    firstApronPercentage: modernAprons ? historicalOverrides.firstApronPercentage : undefined,
    secondApronPercentage: modernAprons ? historicalOverrides.secondApronPercentage : undefined,
    firstApronAmount: modernAprons ? historicalOverrides.firstApronAmount ?? 0 : 0,
    secondApronAmount: modernAprons ? historicalOverrides.secondApronAmount ?? 0 : 0,
    year: seasonYear,
    uiMode: 'fictional',
  }, seasonYear), seasonYear);
}

export function FictionalLeagueBuilder({ onBack, onContinue }: FictionalLeagueBuilderProps) {
  const defaultSeasonYear = getDefaultFictionalSeasonYear();
  const [screen, setScreen] = useState<BuilderScreen>('year');
  const [seasonYear, setSeasonYear] = useState(String(defaultSeasonYear));
  const [conferences, setConferences] = useState<BuilderConference[]>(buildInitialConferences);
  const [catalog, setCatalog] = useState<GeneratedTeamCatalogEntry[]>([]);
  const [playerPool, setPlayerPool] = useState<FictionalPlayerPool>('mens');
  const [nationalities, setNationalities] = useState(() => Object.entries(COUNTRY_FREQUENCIES)
    .map(([country, frequency]) => ({ country, frequency }))
    .sort((a, b) => a.country.localeCompare(b.country)));
  const [leagueRules, setLeagueRules] = useState<LeagueStats>(() => getFictionalRulesForYear(defaultSeasonYear));

  useEffect(() => {
    loadGeneratedTeamCatalog()
      .then(setCatalog)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const previous = SCREEN_BACK[screen];
      if (previous) setScreen(previous);
      else onBack();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onBack, screen]);

  const finish = (historyMode: FictionalHistoryMode, rosterMode: FictionalRosterMode) => {
    onContinue({
      leagueName: 'Association',
      seasonYear: Number(seasonYear),
      historyMode,
      playerPool,
      rosterMode,
      nationalities,
      leagueRules,
      teams: serializeBuilderTeams(conferences),
    });
  };

  const continueFromYear = () => {
    const parsedYear = Number(seasonYear);
    if (!Number.isInteger(parsedYear) || parsedYear < FIRST_BASKETBALL_YEAR || parsedYear > 9999) return;
    setLeagueRules(getFictionalRulesForYear(parsedYear));
    setScreen('customize');
  };

  const chooseOrigin = (historyMode: FictionalHistoryMode) => {
    if (historyMode === 'brand_new') {
      setScreen('rosterSetup');
      return;
    }
    finish('established', 'current');
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-black font-sans text-white">
      <div className="pointer-events-none absolute inset-0 z-0"><div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/40 via-black to-black" /><div className="absolute right-0 top-0 h-full w-1/2 translate-x-32 skew-x-12 bg-gradient-to-bl from-pink-600/30 to-transparent" /><div className="absolute bottom-0 left-0 h-full w-1/2 -translate-x-32 -skew-x-12 bg-gradient-to-tr from-red-600/30 to-transparent" /></div>

      {screen === 'year' && <FictionalYearScreen year={seasonYear} onChange={setSeasonYear} onContinue={continueFromYear} />}
      {screen === 'customize' && <FictionalTeamCustomizer conferences={conferences} catalog={catalog} onChange={setConferences} onProceed={() => setScreen('leagueType')} />}
      {screen === 'leagueType' && <FictionalLeagueTypeScreen onSelect={(pool) => { setPlayerPool(pool); setScreen('nationalities'); }} />}
      {screen === 'nationalities' && <FictionalNationalitiesScreen nationalities={nationalities} onChange={(country, frequency) => setNationalities(current => current.map(entry => entry.country === country ? { ...entry, frequency } : entry))} onContinue={() => setScreen('leagueSettings')} />}
      {screen === 'leagueSettings' && <FictionalLeagueSettingsScreen key={leagueRules.year} initialRules={leagueRules} onContinue={(rules) => { setLeagueRules(current => ({ ...current, ...rules })); setScreen('leagueOrigin'); }} />}
      {screen === 'leagueOrigin' && <FictionalLeagueOriginScreen onSelect={chooseOrigin} />}
      {screen === 'rosterSetup' && <FictionalRosterSetupScreen onSelect={(rosterMode) => finish('brand_new', rosterMode)} />}
    </div>
  );
}

export type { FictionalLeagueStartupConfig } from './fictionalLeagueBuilderTypes';
