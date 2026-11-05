import { getCurrentSeasonYear, isHistoricalNbaWhatIfTimeline, type HistoricalTimelineInput } from './historicalTimeline';

import { getEuroClubFallbackLogo } from './euroTeamLogos';

const BBGM_LOGO_PRIMARY = 'https://play.basketball-gm.com/img/logos-primary';
const BBGM_LOGO_SECONDARY = 'https://play.basketball-gm.com/img/logos-secondary';
const HISTORICAL_PELICANS_LOGO_URL = 'https://content.sportslogos.net/logos/6/4962/full/2681_new_orleans_pelicans-primary-2014.png';
const PELICANS_LOGO_URL = 'https://content.sportslogos.net/logos/6/4962/full/new_orleans_pelicans_logo_primary_2024_sportslogosnet-9292.png';
const CHARLOTTE_HORNETS_LOGO_URL = 'https://cdn.nba.com/logos/nba/1610612766/global/L/logo.svg';
const HISTORICAL_CHARLOTTE_HORNETS_LOGO_URL = 'https://content.sportslogos.net/logos/6/256/full/charlotte_hornets_logo_primary_19896932.png';
const HISTORICAL_CHARLOTTE_BOBCATS_LOGO_URL = 'https://i.ibb.co/sbwBPkc/cha2005.png';
const HISTORICAL_NEW_ORLEANS_HORNETS_LOGO_URL = 'https://static.wikia.nocookie.net/nba/images/c/c7/NOHornetslogo20022005.gif/revision/latest?cb=20190712191725';

const LEGACY_EXPANSION_LOGO_ABBREVS: Record<string, string> = {
  CHP: 'BAL',
  CHH: 'CHA',
  NOJ: 'UTA',
  SDR: 'HOU',
};

const HISTORICAL_HORNETS_LOGO_ABBREVS: Record<string, string> = {
  NOH: 'NOH',
  NOK: 'NOK',
  NOL: 'NOH',
};

const normalizeKey = (value: unknown): string =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const normalizeAbbrev = (value: unknown): string =>
  String(value ?? '').trim().toUpperCase();

export const normalizeTeamLogoUrl = (value: unknown): string => {
  const url = String(value ?? '').trim();
  if (!/^https:\/\/static\.wikia\.nocookie\.net\/logopedia\//i.test(url)) return url;
  return url.replace(/\/revision\/latest\/scale-to-width-down\/\d+(?=\?|$)/i, '/revision/latest');
};

export const isUsableTeamLogoUrl = (value: unknown): value is string => {
  const url = normalizeTeamLogoUrl(value);
  return !!url && !/footer_fb|blank|placeholder|proballers\.com\/media\/team\/default\.svg|kit_shorts|\/img\/jerseys\/|gordon(?:%27|')s-gin-pba\.gif|\/(?:undefined|null)(?:[./?]|$)/i.test(url);
};

function isRawBbgmLogoForAbbrev(value: unknown, abbrev: string): boolean {
  const url = String(value ?? '').trim();
  if (!url || !abbrev) return false;
  const escapedAbbrev = abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`/img/logos-(?:primary|secondary)/${escapedAbbrev}\\.svg$`, 'i').test(url);
}

function isRawBbgmLogo(value: unknown): boolean {
  return /play\.basketball-gm\.com\/img\/logos-(?:primary|secondary)\/[^/?#]+\.svg(?:[?#].*)?$/i
    .test(String(value ?? '').trim());
}

export function getBbgmTeamLogoUrl(abbrev: unknown, variant: 'primary' | 'secondary' = 'primary'): string | undefined {
  const normalized = normalizeAbbrev(abbrev);
  if (!normalized) return undefined;
  const base = variant === 'secondary' ? BBGM_LOGO_SECONDARY : BBGM_LOGO_PRIMARY;
  return `${base}/${normalized}.svg`;
}

type HistoricalIdentityRow = {
  season: number;
  abbrev?: string;
  region?: string;
  name?: string;
  imgURL?: string;
  imgURLSmall?: string;
  logoUrl?: string;
  teamLogoUrl?: string;
  colors?: string[];
};

const identityRow = (
  season: number,
  abbrev: string,
  region: string,
  name: string,
  colors: string[],
): HistoricalIdentityRow => ({
  season,
  abbrev,
  region,
  name,
  colors,
  imgURL: getBbgmTeamLogoUrl(LEGACY_EXPANSION_LOGO_ABBREVS[abbrev] ?? abbrev, 'primary'),
  imgURLSmall: getBbgmTeamLogoUrl(LEGACY_EXPANSION_LOGO_ABBREVS[abbrev] ?? abbrev, 'secondary'),
});

const HISTORICAL_IDENTITY_FALLBACKS: Array<{ keys: string[]; rows: HistoricalIdentityRow[] }> = [
  {
    keys: ['vancouvergrizzlies', 'memphisgrizzlies', 'van', 'mem'],
    rows: [
      identityRow(1996, 'VAN', 'Vancouver', 'Grizzlies', ['#00788c', '#f5b112', '#bed4e9']),
      identityRow(2002, 'MEM', 'Memphis', 'Grizzlies', ['#5d76a9', '#12173f', '#f5b112']),
    ],
  },
  {
    keys: ['neworleanshornets', 'neworleansoklahomacityhornets', 'neworleanspelicans', 'noh', 'nok', 'nol', 'nop'],
    rows: [
      identityRow(2003, 'NOH', 'New Orleans', 'Hornets', ['#008ca8', '#4b2e83', '#fdb927']),
      identityRow(2006, 'NOK', 'New Orleans/Oklahoma City', 'Hornets', ['#008ca8', '#4b2e83', '#fdb927']),
      identityRow(2008, 'NOH', 'New Orleans', 'Hornets', ['#008ca8', '#4b2e83', '#fdb927']),
      { ...identityRow(2014, 'NOP', 'New Orleans', 'Pelicans', ['#0c2340', '#c8102e', '#85714d']), logoUrl: HISTORICAL_PELICANS_LOGO_URL, imgURL: HISTORICAL_PELICANS_LOGO_URL, imgURLSmall: HISTORICAL_PELICANS_LOGO_URL },
      { ...identityRow(2024, 'NOP', 'New Orleans', 'Pelicans', ['#0c2340', '#c8102e', '#85714d']), logoUrl: PELICANS_LOGO_URL, imgURL: PELICANS_LOGO_URL, imgURLSmall: PELICANS_LOGO_URL },
    ],
  },
  {
    keys: ['charlottehornets', 'charlottebobcats', 'chh', 'cha', 'cho'],
    rows: [
      {
        ...identityRow(1989, 'CHH', 'Charlotte', 'Hornets', ['#1d8cab', '#702f8a', '#ffffff']),
        logoUrl: HISTORICAL_CHARLOTTE_HORNETS_LOGO_URL,
        imgURL: HISTORICAL_CHARLOTTE_HORNETS_LOGO_URL,
        imgURLSmall: HISTORICAL_CHARLOTTE_HORNETS_LOGO_URL,
      },
      {
        ...identityRow(2005, 'CHA', 'Charlotte', 'Bobcats', ['#f26522', '#1d1160', '#ffffff']),
        logoUrl: HISTORICAL_CHARLOTTE_BOBCATS_LOGO_URL,
        imgURL: HISTORICAL_CHARLOTTE_BOBCATS_LOGO_URL,
        imgURLSmall: HISTORICAL_CHARLOTTE_BOBCATS_LOGO_URL,
      },
      {
        ...identityRow(2015, 'CHA', 'Charlotte', 'Hornets', ['#1d8cab', '#1d1160', '#a1a1a4']),
        logoUrl: CHARLOTTE_HORNETS_LOGO_URL,
        imgURL: CHARLOTTE_HORNETS_LOGO_URL,
        imgURLSmall: CHARLOTTE_HORNETS_LOGO_URL,
      },
    ],
  },
  {
    keys: ['philadelphiawarriors', 'sanfranciscowarriors', 'goldenstatewarriors', 'phw', 'sfw', 'gs', 'gsw'],
    rows: [
      identityRow(1947, 'PHW', 'Philadelphia', 'Warriors', ['#1d428a', '#ffc72c', '#ffffff']),
      identityRow(1963, 'SFW', 'San Francisco', 'Warriors', ['#1d428a', '#ffc72c', '#ffffff']),
      identityRow(1972, 'GSW', 'Golden State', 'Warriors', ['#1d428a', '#ffc72c', '#ffffff']),
      identityRow(2011, 'GSW', 'Golden State', 'Warriors', ['#006bb6', '#fdb927', '#26282a']),
    ],
  },
  {
    keys: ['buffalobraves', 'sandiegoclippers', 'losangelesclippers', 'buf', 'sdc', 'lac'],
    rows: [
      identityRow(1971, 'BUF', 'Buffalo', 'Braves', ['#f36f21', '#5c88da', '#ffffff']),
      identityRow(1979, 'SDC', 'San Diego', 'Clippers', ['#0b60ad', '#e23d3a', '#ffffff']),
      identityRow(1985, 'LAC', 'Los Angeles', 'Clippers', ['#0b60ad', '#e23d3a', '#ffffff']),
    ],
  },
];

type TeamLogoLike = {
  abbrev?: unknown;
  name?: unknown;
  region?: unknown;
  fullName?: unknown;
  logoUrl?: unknown;
  imgURL?: unknown;
  teamLogo?: unknown;
  teamLogoUrl?: unknown;
  imgURLSmall?: unknown;
};

function isModernNewOrleansPelicansIdentity(team: TeamLogoLike | null | undefined, season?: number | string): boolean {
  const rawAbbrev = normalizeAbbrev(team?.abbrev);
  const seasonYear = Number(season);
  const keys = [team?.name, team?.region, team?.fullName, `${team?.region ?? ''} ${team?.name ?? ''}`].map(normalizeKey);
  const hasNewOrleansKey = keys.some(key => key.includes('neworleans'));
  const hasPelicansKey = keys.some(key => key.includes('pelicans'));
  const isNewOrleansAbbrev = rawAbbrev === 'NOP' || rawAbbrev === 'NOH' || rawAbbrev === 'NOK' || rawAbbrev === 'NOL';
  if (rawAbbrev === 'NOP' || (hasNewOrleansKey && hasPelicansKey)) return true;
  return isNewOrleansAbbrev && hasNewOrleansKey && Number.isFinite(seasonYear) && seasonYear >= 2013;
}

function isStaleModernNewOrleansLogo(
  value: unknown,
  team: TeamLogoLike | null | undefined,
  season?: number | string,
): boolean {
  return isModernNewOrleansPelicansIdentity(team, season) && (
    isRawBbgmLogoForAbbrev(value, 'NOH') ||
    isRawBbgmLogoForAbbrev(value, 'NOK') ||
    isRawBbgmLogoForAbbrev(value, 'NOL')
  );
}

function getPelicansLogoForSeason(season?: number | string): string {
  const seasonYear = Number(season);
  return Number.isFinite(seasonYear) && seasonYear < 2024
    ? HISTORICAL_PELICANS_LOGO_URL
    : PELICANS_LOGO_URL;
}

function pickUsableLogo(
  values: unknown[],
  team: TeamLogoLike | null | undefined,
  season?: number | string,
): string | undefined {
  for (const value of values) {
    const logo = normalizeTeamLogoUrl(value);
    if (isUsableTeamLogoUrl(logo) && !isStaleModernNewOrleansLogo(logo, team, season)) return logo;
  }
  return undefined;
}

function pickUsableNonRawLogo(
  values: unknown[],
  team: TeamLogoLike | null | undefined,
  season?: number | string,
): string | undefined {
  const rawAbbrev = normalizeAbbrev(team?.abbrev);
  for (const value of values) {
    const logo = normalizeTeamLogoUrl(value);
    if (
      isUsableTeamLogoUrl(logo) &&
      !isStaleModernNewOrleansLogo(logo, team, season) &&
      !isRawBbgmLogoForAbbrev(logo, rawAbbrev)
    ) {
      return logo;
    }
  }
  return undefined;
}

function hasCustomNonRawLogo(team: TeamLogoLike | null | undefined, season?: number | string): boolean {
  return Boolean(pickUsableNonRawLogo(
    [team?.logoUrl, team?.imgURL, team?.teamLogo, team?.teamLogoUrl, team?.imgURLSmall],
    team,
    season,
  ));
}

function isSameTeamIdentity(left: any, right: any): boolean {
  const leftAbbrev = normalizeAbbrev(left?.abbrev);
  const rightAbbrev = normalizeAbbrev(right?.abbrev);
  const leftRegion = normalizeKey(left?.region);
  const rightRegion = normalizeKey(right?.region);
  const leftName = normalizeKey(left?.name);
  const rightName = normalizeKey(right?.name);
  if (leftRegion && rightRegion && leftName && rightName) {
    return leftRegion === rightRegion && leftName === rightName;
  }
  if (leftAbbrev && rightAbbrev && leftAbbrev !== rightAbbrev) return false;
  if (leftRegion && rightRegion && leftRegion !== rightRegion) return false;
  if (leftName && rightName && leftName !== rightName) return false;
  return true;
}

export function getExpansionTeamLogoUrl(
  team: TeamLogoLike | null | undefined,
  variant: 'primary' | 'secondary' = 'primary',
): string | undefined {
  const rawAbbrev = normalizeAbbrev(team?.abbrev);
  if (!rawAbbrev) return undefined;
  return getBbgmTeamLogoUrl(LEGACY_EXPANSION_LOGO_ABBREVS[rawAbbrev] ?? rawAbbrev, variant);
}

function resolveKnownLegacyExpansionLogo(team: TeamLogoLike | null | undefined): string | undefined {
  const rawAbbrev = normalizeAbbrev(team?.abbrev);
  const historicalHornetsAbbrev = HISTORICAL_HORNETS_LOGO_ABBREVS[rawAbbrev];
  if (historicalHornetsAbbrev) {
    const keys = [team?.name, team?.region, `${team?.region ?? ''} ${team?.name ?? ''}`].map(normalizeKey);
    const isNewOrleansHornets = keys.some(key => key.includes('neworleans') || key.includes('oklahomacity')) &&
      keys.some(key => key.includes('hornets'));
    if (isNewOrleansHornets) return HISTORICAL_NEW_ORLEANS_HORNETS_LOGO_URL;
  }
  if (hasCustomNonRawLogo(team)) return undefined;
  if (!rawAbbrev || !LEGACY_EXPANSION_LOGO_ABBREVS[rawAbbrev]) return undefined;
  return getExpansionTeamLogoUrl(team);
}

const buildBadgeDataUrl = (label: string, color: string): string => {
  const safeLabel = String(label || '?').slice(0, 4).toUpperCase();
  const safeColor = String(color || '#1e293b');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="${safeColor}"/><rect x="4" y="4" width="88" height="88" rx="14" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/><text x="48" y="56" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const PBA_PREFERRED_MARKS: Array<{ keys: string[]; url: string }> = [
  {
    keys: ['meralcobolts', 'meralco', 'bolts', 'mer'],
    url: 'https://statsspace01.sgp1.digitaloceanspaces.com/basketball_organizer/images/5rg0jlac21fve9xix02wncz1t1uy',
  },
  {
    keys: ['tnttropang5g', 'tnttropanggiga', 'tnt', 'tropang5g', 'tropanggiga'],
    url: 'https://statsspace01.sgp1.digitaloceanspaces.com/basketball_organizer/images/6a0o355pjdq3syfi83969r81dqp6',
  },
];

function historicalFallbackIdentityRows(team: any): HistoricalIdentityRow[] {
  const identityRows = [
    ...(Array.isArray(team?.identitySeasons) ? team.identitySeasons : []),
    ...(Array.isArray(team?.seasons) ? team.seasons : []),
  ];
  const namedKeys = new Set([
    team?.name,
    `${team?.region ?? ''} ${team?.name ?? ''}`,
    ...identityRows.flatMap((row: any) => [row?.name, `${row?.region ?? ''} ${row?.name ?? ''}`]),
  ].map(normalizeKey).filter(Boolean));
  const namedMatch = HISTORICAL_IDENTITY_FALLBACKS.find(group => group.keys.some(key => namedKeys.has(key)));
  if (namedMatch) return namedMatch.rows;
  if (namedKeys.size > 0) return [];
  const abbrevKeys = new Set([team?.abbrev, ...identityRows.map((row: any) => row?.abbrev)].map(normalizeKey).filter(Boolean));
  return HISTORICAL_IDENTITY_FALLBACKS.find(group => group.keys.some(key => abbrevKeys.has(key)))?.rows ?? [];
}

function hasIdentityPayload(row: any): boolean {
  return Boolean(row?.abbrev || row?.region || row?.name || row?.logoUrl || row?.imgURL || row?.imgURLSmall || row?.teamLogoUrl || normalizeColors(row?.colors));
}

function getTeamIdentityRows(team: any): any[] {
  const fallbackRows = historicalFallbackIdentityRows(team);
  const identityRows = Array.isArray(team?.identitySeasons) ? team.identitySeasons : [];
  const seasonRows = Array.isArray(team?.seasons) ? team.seasons : [];
  return [...fallbackRows, ...identityRows, ...seasonRows].filter(hasIdentityPayload);
}

function resolveSeasonTeamData(team: any, season?: number | string) {
  if (season == null) return null;
  const seasonYear = Number(season);
  if (!Number.isFinite(seasonYear)) return null;
  const fallbackRows = historicalFallbackIdentityRows(team).map((entry, index) => ({ entry, index, priority: 2 }));
  const identityRows = (Array.isArray(team?.identitySeasons) ? team.identitySeasons : [])
    .map((entry: any, index: number) => ({ entry, index, priority: 3 }));
  const seasonRows = (Array.isArray(team?.seasons) ? team.seasons : [])
    .map((entry: any, index: number) => ({ entry, index, priority: 1 }));
  return [...fallbackRows, ...identityRows, ...seasonRows]
    .filter(row => hasIdentityPayload(row.entry))
    .map(row => ({ ...row, season: Number(row.entry?.season) }))
    .filter(row => Number.isFinite(row.season) && row.season <= seasonYear)
    .sort((a, b) => b.season - a.season || b.priority - a.priority || b.index - a.index)[0]?.entry ?? null;
}

function resolveSeasonLogo(team: any, season?: number | string): string | undefined {
  if (season == null) return undefined;
  const seasonYear = Number(season);
  if (!Number.isFinite(seasonYear)) return undefined;
  const seasonRow = resolveSeasonTeamData(team, seasonYear);
  if (!seasonRow) return undefined;
  const seasonTeam = { ...team, ...seasonRow };
  const directLogo = pickUsableLogo(
    [seasonRow.logoUrl, seasonRow.imgURL, seasonRow.imgURLSmall, seasonRow.teamLogoUrl],
    seasonTeam,
    seasonYear,
  );
  if (isModernNewOrleansPelicansIdentity(seasonTeam, seasonYear)) return getPelicansLogoForSeason(seasonYear);
  const expansionLogo = resolveKnownLegacyExpansionLogo(seasonTeam);
  if (expansionLogo) return expansionLogo;
  const existingProperLogo = isSameTeamIdentity(team, seasonTeam)
    ? pickUsableNonRawLogo([team?.logoUrl, team?.imgURL, team?.teamLogo, team?.teamLogoUrl, team?.imgURLSmall], team, seasonYear)
    : undefined;
  if (!directLogo && existingProperLogo) return existingProperLogo;
  if (directLogo && isRawBbgmLogoForAbbrev(directLogo, normalizeAbbrev(seasonTeam.abbrev)) && existingProperLogo) {
    return existingProperLogo;
  }
  return directLogo ?? getBbgmTeamLogoUrl(seasonTeam.abbrev);
}

function resolveLatestSeasonLogo(team: any): string | undefined {
  const rows = [...getTeamIdentityRows(team)]
    .filter((entry: any) => Number.isFinite(Number(entry?.season)))
    .sort((a: any, b: any) => Number(b?.season) - Number(a?.season));
  for (const row of rows) {
    const rowTeam = { ...team, ...row };
    const rowSeason = Number(row?.season);
    const directLogo = pickUsableLogo([row.logoUrl, row.imgURL, row.imgURLSmall, row.teamLogoUrl], rowTeam, rowSeason);
    if (isModernNewOrleansPelicansIdentity(rowTeam, rowSeason)) return getPelicansLogoForSeason(rowSeason);
    const expansionLogo = resolveKnownLegacyExpansionLogo(rowTeam);
    if (expansionLogo) return expansionLogo;
    const existingProperLogo = isSameTeamIdentity(team, rowTeam)
      ? pickUsableNonRawLogo([team?.logoUrl, team?.imgURL, team?.teamLogo, team?.teamLogoUrl, team?.imgURLSmall], team, rowSeason)
      : undefined;
    if (directLogo && isRawBbgmLogoForAbbrev(directLogo, normalizeAbbrev(rowTeam.abbrev)) && existingProperLogo) {
      return existingProperLogo;
    }
    if (directLogo) return directLogo;
  }
  return undefined;
}

function normalizeColors(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const colors = value.map(color => String(color ?? '').trim()).filter(Boolean);
  return colors.length > 0 ? colors : undefined;
}

function areColorsEqual(a: unknown, b: unknown): boolean {
  const left = normalizeColors(a) ?? [];
  const right = normalizeColors(b) ?? [];
  return left.length === right.length && left.every((color, index) => color === right[index]);
}

export function getResolvedTeamLogoUrl(team: any, season?: number | string): string {
  if (!team) return '';
  const identityKeys = [
    team?.name,
    team?.region,
    `${team?.region ?? ''} ${team?.name ?? ''}`,
  ].map(normalizeKey).filter(Boolean);
  const keys = [...identityKeys, normalizeKey(team?.abbrev)].filter(Boolean);

  const isPbaTeam = team?.league === 'PBA' || team?.conference === 'PBA' || keys.some(key =>
    PBA_PREFERRED_MARKS.some(mark => mark.keys.includes(key) || mark.keys.some(alias => key.includes(alias))),
  );

  const seasonLogo = resolveSeasonLogo(team, season);
  if (seasonLogo && (!isPbaTeam || !isRawBbgmLogo(seasonLogo))) return seasonLogo;

  if (isPbaTeam) {
    const seasonIdentity = resolveSeasonTeamData(team, season);
    const pbaIdentity = seasonIdentity ? { ...team, ...seasonIdentity } : team;
    const pbaIdentityKeys = [
      pbaIdentity?.name,
      pbaIdentity?.region,
      `${pbaIdentity?.region ?? ''} ${pbaIdentity?.name ?? ''}`,
    ].map(normalizeKey).filter(Boolean);
    const directLogo = pickUsableLogo([team?.logoUrl, team?.imgURL, team?.teamLogo, team?.teamLogoUrl, team?.imgURLSmall], team, season);
    if (directLogo && !isRawBbgmLogo(directLogo)) return directLogo;
    const preferred = PBA_PREFERRED_MARKS.find(mark =>
      pbaIdentityKeys.some(key => mark.keys.includes(key) || mark.keys.some(alias => key.includes(alias))),
    );
    if (preferred) return preferred.url;
    return buildBadgeDataUrl(
      pbaIdentity?.region ?? pbaIdentity?.name ?? pbaIdentity?.abbrev ?? 'PBA',
      getTeamPrimaryColor(pbaIdentity),
    );
  }

  const directLogo = pickUsableLogo([team?.logoUrl, team?.imgURL, team?.teamLogo, team?.teamLogoUrl, team?.imgURLSmall], team, season);
  if (isModernNewOrleansPelicansIdentity(team, season)) {
    if (directLogo) return directLogo;
    const latestSeasonLogo = resolveLatestSeasonLogo(team);
    return latestSeasonLogo ?? PELICANS_LOGO_URL;
  }
  const expansionLogo = resolveKnownLegacyExpansionLogo(team);
  if (expansionLogo) return expansionLogo;
  if (directLogo) return directLogo;
  const euroFallbackLogo = getEuroClubFallbackLogo(team);
  if (euroFallbackLogo) return euroFallbackLogo;
  const latestSeasonLogo = resolveLatestSeasonLogo(team);
  if (latestSeasonLogo) return latestSeasonLogo;
  return '';
}

export function getHistoricalTeamSnapshot(team: any, season?: number | string): any {
  const seasonRow = resolveSeasonTeamData(team, season);
  const logoUrl = getResolvedTeamLogoUrl(team, season);
  return {
    ...(team ?? {}),
    region: seasonRow?.region ?? team?.region ?? '',
    name: seasonRow?.name ?? team?.name ?? '',
    abbrev: seasonRow?.abbrev ?? team?.abbrev ?? '',
    logoUrl,
    colors: normalizeColors(seasonRow?.colors) ?? normalizeColors(team?.colors),
  };
}

export function materializeTeamIdentityForSeason<T extends Record<string, any>>(team: T, season?: number | string): T {
  if (!team) return team;
  const snapshot = getHistoricalTeamSnapshot(team, season);
  const next = {
    ...team,
    region: snapshot.region,
    name: snapshot.name,
    abbrev: snapshot.abbrev,
    logoUrl: snapshot.logoUrl,
    colors: snapshot.colors,
  };
  return next.region === team.region &&
    next.name === team.name &&
    next.abbrev === team.abbrev &&
    next.logoUrl === team.logoUrl &&
    areColorsEqual(next.colors, team.colors)
    ? team
    : next;
}

export type TeamIdentityApplicationMode = 'passive' | 'setup' | 'scheduled';

function shouldApplyHistoricalBranchIdentity(input: HistoricalTimelineInput, mode: TeamIdentityApplicationMode): boolean {
  if (!isHistoricalNbaWhatIfTimeline(input)) return true;
  if (mode !== 'passive') return true;
  const currentYear = Number(input.currentYear ?? 0);
  const branchStartYear = Number(input.nbaStartYear ?? 0);
  if (!Number.isFinite(currentYear) || !Number.isFinite(branchStartYear) || branchStartYear <= 0) return true;
  return currentYear <= branchStartYear + 1;
}

export function applyTeamIdentitiesForTimeline<T extends Record<string, any>>(
  teams: readonly T[] | undefined,
  input: HistoricalTimelineInput,
  options: { mode?: TeamIdentityApplicationMode } = {},
): T[] {
  if (!teams) return [];
  const mode = options.mode ?? 'passive';
  if (!shouldApplyHistoricalBranchIdentity(input, mode)) return teams as T[];
  const season = getCurrentSeasonYear(input);
  let changed = false;
  const nextTeams = teams.map(team => {
    const next = materializeTeamIdentityForSeason(team, season);
    if (next !== team) changed = true;
    return next;
  });
  return changed ? nextTeams : teams as T[];
}

export function getTeamPrimaryColor(team: any): string {
  return team?.colors?.[0] ?? team?.primaryColor ?? '#1e293b';
}
