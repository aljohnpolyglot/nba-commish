import {
  getCachedHistoricalPbaTeamHistorySource,
  type PbaTeamHistorySource,
} from '../pba/historicalRemoteSources';
import { NBA_ALL_STAR_EVENT_LOGOS } from '../../data/nbaAllStarEventLogos';
import { WNBA_ALL_STAR_EVENT_LOGOS } from '../../data/wnbaAllStarEventLogos';
import {
  resolveWnbaLeagueLogo,
  type WnbaLogoHistorySource,
} from '../teamIdentity/wnbaLogoHistory';
import { resolveNbaConferenceLogo } from '../../data/nbaConferenceLogos';
import { ALL_STAR_ASSETS } from './allStarSelectionHelpers';

const logoUrl = (logo: any): string | undefined => {
  const value = String(logo?.displayedUrl ?? logo?.originalUrl ?? '').trim();
  return /^https:\/\//.test(value) ? value : undefined;
};

export function resolvePbaAllStarEventLogo(
  season: number,
  source: PbaTeamHistorySource | null = getCachedHistoricalPbaTeamHistorySource(),
): string | undefined {
  const page = source?.pages?.find(entry => entry.title === 'PBA All-Star Weekend');
  const logos = (page?.logos ?? [])
    .map(logo => ({ logo, season: Number(logo.sectionName) }))
    .filter(entry => Number.isFinite(entry.season) && logoUrl(entry.logo))
    .sort((left, right) => left.season - right.season);
  const exact = logos.find(entry => entry.season === season);
  if (exact) return logoUrl(exact.logo);
  const prior = logos.filter(entry => entry.season <= season).at(-1);
  return logoUrl(prior?.logo ?? logos[0]?.logo);
}

export function resolveNbaAllStarEventLogo(season: number): string | undefined {
  if (!Number.isInteger(season)) return undefined;
  const exact = NBA_ALL_STAR_EVENT_LOGOS[season];
  if (exact) return exact;
  if (season <= 2027) return undefined;
  return NBA_ALL_STAR_EVENT_LOGOS[2027];
}

export function resolveWnbaAllStarEventLogo(
  season: number,
  source: WnbaLogoHistorySource | null,
): string | undefined {
  if (!Number.isInteger(season)) return undefined;
  const eventLogo = WNBA_ALL_STAR_EVENT_LOGOS[season];
  if (eventLogo) return eventLogo;
  if (!source) return undefined;
  return resolveWnbaLeagueLogo(source, season, { uiMode: 'wnba_isolated' })?.logoUrl;
}

export interface ResolveAllStarEventLogoOptions {
  league: 'nba' | 'wnba' | 'pba' | 'other';
  season: number;
  pbaSource?: PbaTeamHistorySource | null;
  wnbaSource?: WnbaLogoHistorySource | null;
}

interface ResolveAllStarExhibitionTeamLogoOptions {
  tid: number;
  teamName?: string;
  season: number;
  useNbaConferenceLogos: boolean;
  bracketTeams?: Array<{ tid: number; logoUrl?: string }>;
}

export function resolveAllStarExhibitionTeamLogo({
  tid,
  teamName,
  season,
  useNbaConferenceLogos,
  bracketTeams = [],
}: ResolveAllStarExhibitionTeamLogoOptions): string | undefined {
  const bracketLogo = bracketTeams.find(team => team.tid === tid)?.logoUrl;
  if (bracketLogo) return bracketLogo;
  const normalizedName = String(teamName ?? '').toLowerCase();
  if (normalizedName.includes('usa') || normalizedName.includes('stripe')) return ALL_STAR_ASSETS.usaLogo;
  if (normalizedName.includes('world')) return ALL_STAR_ASSETS.worldLogo;
  if (tid === -1) {
    return useNbaConferenceLogos
      ? resolveNbaConferenceLogo('East', season) ?? ALL_STAR_ASSETS.eastLogo
      : ALL_STAR_ASSETS.eastLogo;
  }
  if (tid === -2) {
    return useNbaConferenceLogos
      ? resolveNbaConferenceLogo('West', season) ?? ALL_STAR_ASSETS.westLogo
      : ALL_STAR_ASSETS.westLogo;
  }
  if (tid === -3) return ALL_STAR_ASSETS.eastLogo;
  if (tid === -4) return ALL_STAR_ASSETS.westLogo;
  if (tid === -5 || tid === -6) return ALL_STAR_ASSETS.celebrityLogo;
  return undefined;
}

export function resolveAllStarEventLogo(
  options: ResolveAllStarEventLogoOptions,
): string | undefined {
  if (options.league === 'nba') return resolveNbaAllStarEventLogo(options.season);
  if (options.league === 'wnba') {
    return resolveWnbaAllStarEventLogo(options.season, options.wnbaSource ?? null);
  }
  if (options.league === 'pba') {
    return resolvePbaAllStarEventLogo(options.season, options.pbaSource);
  }
  return undefined;
}
