import { materializeTeamIdentityForSeason } from '../../utils/teamAssets';

interface SetupFranchiseIdentityInput {
  leagueType: 'fictional' | 'modded';
  moddedLeagueBase?: 'nba' | 'wnba' | 'europe' | 'philippines';
  nbaStartYear: number;
  euroSourceSeason: number;
  pbaSourceSeason: number;
  wnbaSourceSeason: number;
}

export interface FranchiseIdentityOptions {
  seasonYear?: number;
  preserveProvidedBranding: boolean;
}

export function resolveSetupFranchiseIdentityOptions(
  input: SetupFranchiseIdentityInput,
): FranchiseIdentityOptions {
  if (input.leagueType === 'fictional') {
    return { preserveProvidedBranding: true };
  }
  const seasonYear = input.moddedLeagueBase === 'nba'
    ? input.nbaStartYear
    : input.moddedLeagueBase === 'europe'
      ? input.euroSourceSeason
      : input.moddedLeagueBase === 'philippines'
        ? input.pbaSourceSeason
        : input.moddedLeagueBase === 'wnba'
          ? input.wnbaSourceSeason
          : undefined;
  return { seasonYear, preserveProvidedBranding: false };
}

export function presentFranchisePickerTeam<T extends object>(
  team: T,
  options: FranchiseIdentityOptions,
): T {
  return options.preserveProvidedBranding
    ? team
    : materializeTeamIdentityForSeason(team as T & Record<string, unknown>, options.seasonYear) as T;
}
