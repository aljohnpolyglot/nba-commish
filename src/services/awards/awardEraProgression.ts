import type { LeagueStats } from '../../types';
import { AWARD_REGISTRY } from './AwardRegistry';
import { defaultAwardSettings, isAwardDefaultActive } from './AwardEngine';
import type { UIMode } from './types';

export const AWARD_SETTINGS_ERA_VERSION = 3;

export function getAwardUIMode(leagueStats: Partial<LeagueStats>): UIMode {
  const mode = leagueStats.uiMode;
  return mode === 'euro_isolated' || mode === 'pba_isolated' || mode === 'wnba_isolated' || mode === 'fictional'
    ? mode
    : 'nba';
}

export function getAwardSettingActive(
  leagueStats: Partial<LeagueStats>,
  awardId: string,
  season = Number(leagueStats.year),
): boolean {
  const definition = AWARD_REGISTRY.find(award => award.id === awardId);
  if (!definition) return false;
  const stored = leagueStats.awardSettings?.enabled?.[awardId];
  return typeof stored === 'boolean'
    ? stored
    : isAwardDefaultActive(definition, getAwardUIMode(leagueStats), season);
}

export function advanceAwardSettingsForSeason(
  leagueStats: LeagueStats,
  nextSeason: number,
): LeagueStats {
  const mode = getAwardUIMode(leagueStats);
  const currentSettings = leagueStats.awardSettings
    ?? defaultAwardSettings(mode, Number(leagueStats.year));
  const enabled = { ...currentSettings.enabled };
  const overrides = leagueStats.awardSettingsCommissionerOverrides ?? {};

  for (const award of AWARD_REGISTRY) {
    if (!(award.id in enabled)) {
      enabled[award.id] = isAwardDefaultActive(award, mode, Number(leagueStats.year));
    }
    if (!(award.id in overrides)) {
      const wasDefaultActive = isAwardDefaultActive(award, mode, Number(leagueStats.year));
      const isDefaultActive = isAwardDefaultActive(award, mode, nextSeason);
      if (wasDefaultActive !== isDefaultActive) enabled[award.id] = isDefaultActive;
    }
  }

  return {
    ...leagueStats,
    year: nextSeason,
    awardSettings: { ...currentSettings, enabled },
    awardSettingsEraVersion: AWARD_SETTINGS_ERA_VERSION,
  };
}

export function migrateAwardSettingsToCurrentEra(
  leagueStats: LeagueStats,
  season: number,
): LeagueStats {
  const mode = getAwardUIMode(leagueStats);
  const currentSettings = leagueStats.awardSettings ?? defaultAwardSettings(mode, season);
  const enabled = { ...currentSettings.enabled };
  const overrides = leagueStats.awardSettingsCommissionerOverrides ?? {};

  for (const award of AWARD_REGISTRY) {
    if (award.id in overrides) {
      enabled[award.id] = overrides[award.id];
    } else if (award.introducedSeason !== undefined || award.retiredAfterSeason !== undefined) {
      enabled[award.id] = isAwardDefaultActive(award, mode, season);
    } else if (!(award.id in enabled)) {
      enabled[award.id] = isAwardDefaultActive(award, mode, season);
    }
  }

  return {
    ...leagueStats,
    awardSettings: { ...currentSettings, enabled },
    awardSettingsEraVersion: AWARD_SETTINGS_ERA_VERSION,
  };
}
