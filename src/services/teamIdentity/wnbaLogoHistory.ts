import { getTeamFullName, type TeamLike } from '../../utils/teamNames';

export const WNBA_LOGO_HISTORY_PATH = '/data/external/wnba/wnba_logo_history.json';

export type WnbaLogoType =
  | 'primary-or-unspecified'
  | 'secondary'
  | 'alternate'
  | 'icon'
  | 'wordmark'
  | 'anniversary'
  | string;

export interface WnbaLogoPaletteDetail {
  hex: string;
  rgb: [number, number, number];
  pixelShare: number;
}

export interface WnbaLogoHistoryRow {
  eraLabel?: string;
  startYear?: number | null;
  endYear?: number | null;
  present?: boolean;
  specificYears?: number[];
  logoType?: WnbaLogoType;
  caption?: string;
  imageName?: string;
  fileExtension?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  palette?: string[];
  paletteDetails?: WnbaLogoPaletteDetail[];
  paletteStatus?: string;
  paletteError?: string | null;
}

export interface WnbaLogoHistoryPage {
  title?: string;
  linkText?: string;
  pageUrl?: string;
  isRootPage?: boolean;
  logoCount?: number;
  logos: WnbaLogoHistoryRow[];
}

export interface WnbaLogoHistorySource {
  schemaVersion: number;
  source?: string;
  rootPage?: string;
  scrapedAt?: string;
  summary?: {
    pagesQueued?: number;
    pagesSaved?: number;
    failedPages?: number;
    totalLogos?: number;
  };
  pages: WnbaLogoHistoryPage[];
  errors?: unknown[];
}

export interface WnbaIdentityScope {
  league?: string;
  status?: string;
  uiMode?: string;
  competitionId?: string;
  conference?: string;
  tid?: number;
}

export interface WnbaTeamIdentityLike extends TeamLike, WnbaIdentityScope {
  fullName?: string;
  aliases?: string[];
  identitySeasons?: TeamLike[];
  seasons?: TeamLike[];
}

export type WnbaLogoVariant = 'primary' | 'secondary' | 'alternate' | 'icon' | 'wordmark' | 'anniversary' | 'any';
export type WnbaLogoPageKind = 'league' | 'team' | 'former-team' | 'media';

export interface WnbaLogoResolution {
  page: WnbaLogoHistoryPage;
  pageKind: WnbaLogoPageKind;
  logo: WnbaLogoHistoryRow;
  logoUrl: string;
  colors: string[];
  paletteDetails: WnbaLogoPaletteDetail[];
  sourceLabel: string;
}

export interface WnbaLogoIdentityPeriod {
  startYear?: number;
  endYear?: number;
  present: boolean;
  specificYears: number[];
  logoType: WnbaLogoType;
  logoUrl: string;
  colors: string[];
  paletteDetails: WnbaLogoPaletteDetail[];
  sourceLabel: string;
  pageTitle: string;
}

export interface ResolveWnbaLogoOptions {
  variant?: WnbaLogoVariant;
  preferOriginal?: boolean;
}

let sourcePromise: Promise<WnbaLogoHistorySource> | null = null;

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const compact = (value: unknown): string => normalize(value).replace(/\s+/g, '');

const optionalNumber = (value: unknown): number | undefined => {
  if (value == null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isValidSource = (value: unknown): value is WnbaLogoHistorySource => {
  if (!isRecord(value) || Number(value.schemaVersion) !== 2 || !Array.isArray(value.pages)) return false;
  return value.pages.every(page => (
    isRecord(page)
    && Array.isArray(page.logos)
    && page.logos.every(logo => isRecord(logo))
  ));
};

const isWnbaToken = (value: unknown): boolean => {
  const key = compact(value);
  return key.startsWith('wnba') || key.includes('womensnationalbasketballassociation');
};

export function isWnbaIdentityScope(scope: WnbaIdentityScope | null | undefined): boolean {
  if (!scope) return false;
  const tid = Number(scope.tid);
  if (Number.isInteger(tid) && tid >= 3000 && tid < 4000) return true;
  return [
    scope.league,
    scope.status,
    scope.uiMode,
    scope.competitionId,
    scope.conference,
  ].some(isWnbaToken);
}

export async function loadWnbaLogoHistory(): Promise<WnbaLogoHistorySource> {
  if (!sourcePromise) {
    sourcePromise = fetch(WNBA_LOGO_HISTORY_PATH)
      .then(async response => {
        if (!response.ok) throw new Error(`WNBA logo history could not be loaded (${response.status}).`);
        const source: unknown = await response.json();
        if (!isValidSource(source)) throw new Error('WNBA logo history has an unsupported schema.');
        return source;
      })
      .catch(error => {
        sourcePromise = null;
        throw error;
      });
  }
  return sourcePromise;
}

const isMediaPage = (page: WnbaLogoHistoryPage): boolean => {
  const key = compact(page.title ?? page.linkText);
  return key.startsWith('wnbaon') || key === 'wnbaseasonpass';
};

const logoHasYear = (logo: WnbaLogoHistoryRow, season: number): boolean => {
  if (logo.logoType === 'anniversary') {
    return (logo.specificYears ?? []).includes(season);
  }
  const start = optionalNumber(logo.startYear);
  if (start == null) return (logo.specificYears ?? []).includes(season);
  const end = logo.present === true
    ? Number.MAX_SAFE_INTEGER
    : optionalNumber(logo.endYear) ?? start;
  return season >= start && season <= end;
};

const validColors = (colors: unknown): string[] => (
  Array.isArray(colors)
    ? colors.map(String).filter(color => /^#[0-9a-f]{6}$/i.test(color))
    : []
);

export function getWnbaLogoUrl(
  logo: WnbaLogoHistoryRow | null | undefined,
  preferOriginal = false,
): string | undefined {
  if (!logo || /infowhite|placeholder|undefined/i.test(`${logo.caption ?? ''} ${logo.imageName ?? ''}`)) {
    return undefined;
  }
  const candidates = preferOriginal
    ? [logo.imageUrl, logo.thumbnailUrl]
    : [logo.thumbnailUrl, logo.imageUrl];
  return candidates
    .map(value => String(value ?? '').trim())
    .find(value => /^https?:\/\//i.test(value));
}

const variantMatches = (logo: WnbaLogoHistoryRow, variant: WnbaLogoVariant): boolean => {
  if (variant === 'any') return logo.logoType !== 'anniversary';
  if (variant === 'primary') return !logo.logoType || logo.logoType === 'primary-or-unspecified';
  return logo.logoType === variant;
};

export function selectWnbaLogoForSeason(
  page: WnbaLogoHistoryPage | null | undefined,
  season: number,
  options: ResolveWnbaLogoOptions = {},
): WnbaLogoHistoryRow | undefined {
  if (!page || !Number.isFinite(season)) return undefined;
  const variant = options.variant ?? 'primary';
  const ranked = page.logos
    .map((logo, index) => ({ logo, index }))
    .filter(({ logo }) => logoHasYear(logo, season) && !!getWnbaLogoUrl(logo, options.preferOriginal))
    .filter(({ logo }) => variantMatches(logo, variant));
  if (ranked.length > 0) {
    return ranked.sort((left, right) => (
      Number((right.logo.specificYears ?? []).includes(season))
      - Number((left.logo.specificYears ?? []).includes(season))
      || left.index - right.index
    ))[0].logo;
  }
  if (variant === 'primary') {
    return page.logos.find(logo => (
      logoHasYear(logo, season)
      && logo.logoType !== 'anniversary'
      && !!getWnbaLogoUrl(logo, options.preferOriginal)
    ));
  }
  return undefined;
}

const pageAliases = (page: WnbaLogoHistoryPage, season: number): string[] => [
  page.title,
  page.linkText,
  ...page.logos
    .filter(logo => logoHasYear(logo, season))
    .flatMap(logo => [logo.caption, logo.imageName]),
].map(value => String(value ?? '')).filter(Boolean);

const teamAliases = (team: WnbaTeamIdentityLike): string[] => {
  const rows = [
    ...(team.identitySeasons ?? []),
    ...(team.seasons ?? []),
  ];
  return [...new Set([
    team.fullName,
    getTeamFullName(team),
    team.region,
    team.name,
    team.abbrev,
    ...(team.aliases ?? []),
    ...rows.flatMap(row => [getTeamFullName(row), row.region, row.name, row.abbrev]),
  ].map(value => String(value ?? '').trim()).filter(value => compact(value).length >= 3))];
};

const textScore = (left: unknown, right: unknown): number => {
  const a = compact(left);
  const b = compact(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) return 40;
  return 0;
};

const pageScore = (page: WnbaLogoHistoryPage, aliases: string[], season: number): number => Math.max(
  0,
  ...pageAliases(page, season).flatMap(pageAlias => aliases.map(alias => textScore(pageAlias, alias))),
);

export function findWnbaTeamLogoPage(
  source: WnbaLogoHistorySource,
  team: WnbaTeamIdentityLike,
  season: number,
): WnbaLogoHistoryPage | undefined {
  const aliases = teamAliases(team);
  return source.pages
    .filter(page => !page.isRootPage && !isMediaPage(page))
    .filter(page => !!selectWnbaLogoForSeason(page, season))
    .map((page, index) => ({ page, index, score: pageScore(page, aliases, season) }))
    .filter(row => row.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.page;
}

const sourceYear = (source: WnbaLogoHistorySource): number => {
  const year = Number(String(source.scrapedAt ?? '').slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
};

export function getWnbaLogoPageKind(
  page: WnbaLogoHistoryPage,
  asOfYear: number,
): WnbaLogoPageKind {
  if (page.isRootPage) return 'league';
  if (isMediaPage(page)) return 'media';
  const hasPresentLogo = page.logos.some(logo => logo.present === true && !!getWnbaLogoUrl(logo));
  const lastEndYear = Math.max(
    0,
    ...page.logos.map(logo => Number(logo.endYear ?? logo.startYear ?? 0)).filter(Number.isFinite),
  );
  return !hasPresentLogo && lastEndYear > 0 && lastEndYear < asOfYear ? 'former-team' : 'team';
}

const resolvePage = (
  source: WnbaLogoHistorySource,
  page: WnbaLogoHistoryPage | undefined,
  season: number,
  options: ResolveWnbaLogoOptions,
): WnbaLogoResolution | undefined => {
  const logo = selectWnbaLogoForSeason(page, season, options);
  const logoUrl = getWnbaLogoUrl(logo, options.preferOriginal);
  if (!page || !logo || !logoUrl) return undefined;
  return {
    page,
    pageKind: getWnbaLogoPageKind(page, sourceYear(source)),
    logo,
    logoUrl,
    colors: validColors(logo.palette),
    paletteDetails: logo.paletteDetails ?? [],
    sourceLabel: String(logo.caption ?? page.linkText ?? page.title ?? '').trim(),
  };
};

export function resolveWnbaLeagueLogo(
  source: WnbaLogoHistorySource,
  season: number,
  scope: WnbaIdentityScope,
  options: ResolveWnbaLogoOptions = {},
): WnbaLogoResolution | undefined {
  if (!isWnbaIdentityScope(scope)) return undefined;
  return resolvePage(source, source.pages.find(page => page.isRootPage), season, options);
}

export function resolveWnbaTeamLogo(
  source: WnbaLogoHistorySource,
  team: WnbaTeamIdentityLike,
  season: number,
  options: ResolveWnbaLogoOptions = {},
): WnbaLogoResolution | undefined {
  if (!isWnbaIdentityScope(team)) return undefined;
  return resolvePage(source, findWnbaTeamLogoPage(source, team, season), season, options);
}

const buildTimeline = (
  page: WnbaLogoHistoryPage | undefined,
  options: ResolveWnbaLogoOptions,
): WnbaLogoIdentityPeriod[] => {
  if (!page) return [];
  const variant = options.variant ?? 'primary';
  return page.logos
    .filter(logo => variantMatches(logo, variant))
    .flatMap(logo => {
      const logoUrl = getWnbaLogoUrl(logo, options.preferOriginal);
      if (!logoUrl) return [];
      const startYear = optionalNumber(logo.startYear);
      const endYear = optionalNumber(logo.endYear);
      return [{
        startYear,
        endYear,
        present: logo.present === true,
        specificYears: (logo.specificYears ?? []).filter(Number.isFinite),
        logoType: logo.logoType ?? 'primary-or-unspecified',
        logoUrl,
        colors: validColors(logo.palette),
        paletteDetails: logo.paletteDetails ?? [],
        sourceLabel: String(logo.caption ?? page.linkText ?? page.title ?? '').trim(),
        pageTitle: String(page.title ?? page.linkText ?? '').trim(),
      }];
    })
    .sort((left, right) => (
      Number(left.startYear ?? left.specificYears[0] ?? Number.MAX_SAFE_INTEGER)
      - Number(right.startYear ?? right.specificYears[0] ?? Number.MAX_SAFE_INTEGER)
    ));
};

export function buildWnbaLeagueLogoTimeline(
  source: WnbaLogoHistorySource,
  scope: WnbaIdentityScope,
  options: ResolveWnbaLogoOptions = {},
): WnbaLogoIdentityPeriod[] {
  if (!isWnbaIdentityScope(scope)) return [];
  return buildTimeline(source.pages.find(page => page.isRootPage), options);
}

export function buildWnbaTeamLogoTimeline(
  source: WnbaLogoHistorySource,
  team: WnbaTeamIdentityLike,
  referenceSeason: number,
  options: ResolveWnbaLogoOptions = {},
): WnbaLogoIdentityPeriod[] {
  if (!isWnbaIdentityScope(team)) return [];
  return buildTimeline(findWnbaTeamLogoPage(source, team, referenceSeason), options);
}

export function listWnbaIdentityPages(source: WnbaLogoHistorySource): Array<{
  page: WnbaLogoHistoryPage;
  kind: Exclude<WnbaLogoPageKind, 'media'>;
}> {
  const asOfYear = sourceYear(source);
  return source.pages
    .map(page => ({ page, kind: getWnbaLogoPageKind(page, asOfYear) }))
    .filter((entry): entry is { page: WnbaLogoHistoryPage; kind: Exclude<WnbaLogoPageKind, 'media'> } => (
      entry.kind !== 'media'
    ));
}
