import type { NonNBATeam } from '../types';
import { isUsableTeamLogoUrl, normalizeTeamLogoUrl } from '../utils/teamAssets';
import { readJsonResponse } from './utils/jsonResponse';

type TeamLogoSourceRow = {
  displayName?: string;
  articleTitle?: string;
  logoUrl?: string | null;
  logoThumbUrl?: string | null;
};

export type ExternalTeamLogoSourceSnapshot = {
  teams?: TeamLogoSourceRow[];
};

type TeamLogoSourceDescriptor = {
  path: string;
  sourceSeason: number;
};

const EXTERNAL_TEAM_LOGO_SOURCES: Readonly<Record<string, TeamLogoSourceDescriptor>> = {
  'B-League': { path: '/data/external/bleague/japan-team-logos.json', sourceSeason: 2026 },
};

const TEAM_ALIASES: Readonly<Record<string, string>> = {
  aishinseahorses: 'seahorsesmikawa',
  fukuokarizing: 'rizingzephyrfukuoka',
  hitachisunrockers: 'tokyosunrockers',
  linktochigibrex: 'utsunomiyabrex',
  nagoyafightingeagles: 'fightingeaglesnagoya',
  nigataalbirex: 'niigataalbirexbb',
  nishinomiyastorks: 'kobestorks',
  sanenneophoenix: 'sanenneophoenix',
  shigalakestars: 'shigalakes',
};

const catalogPromises = new Map<string, Promise<ReadonlyMap<string, string>>>();
const cachedCatalogs = new Map<string, ReadonlyMap<string, string>>();

export function normalizeExternalTeamLogoName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function canonicalTeamKey(value: unknown): string {
  const key = normalizeExternalTeamLogoName(value);
  return TEAM_ALIASES[key] ?? key;
}

export function buildExternalTeamLogoCatalog(
  snapshot: ExternalTeamLogoSourceSnapshot,
): ReadonlyMap<string, string> {
  const catalog = new Map<string, string>();
  for (const row of snapshot.teams ?? []) {
    const logo = [row.logoUrl, row.logoThumbUrl]
      .map(normalizeTeamLogoUrl)
      .find(isUsableTeamLogoUrl);
    if (!logo) continue;
    for (const name of [row.displayName, row.articleTitle]) {
      const key = canonicalTeamKey(name);
      if (key) catalog.set(key, logo);
    }
  }
  return catalog;
}

export function resolveExternalTeamLogoFromCatalog(
  catalog: ReadonlyMap<string, string> | null | undefined,
  team: Pick<NonNBATeam, 'region' | 'name'> | null | undefined,
): string | undefined {
  if (!catalog || !team) return undefined;
  const candidates = [
    `${team.region ?? ''} ${team.name ?? ''}`,
    team.name,
    team.region,
  ];
  for (const candidate of candidates) {
    const logo = catalog.get(canonicalTeamKey(candidate));
    if (logo) return logo;
  }
  return undefined;
}

export async function loadExternalTeamLogoCatalog(
  league: string,
  season?: number,
): Promise<ReadonlyMap<string, string>> {
  const descriptor = EXTERNAL_TEAM_LOGO_SOURCES[league];
  if (!descriptor || (Number.isFinite(season) && Number(season) < descriptor.sourceSeason)) return new Map();
  const cached = cachedCatalogs.get(descriptor.path);
  if (cached) return cached;
  const existing = catalogPromises.get(descriptor.path);
  if (existing) return existing;
  const pending = fetch(descriptor.path, { cache: 'no-store' })
    .then(response => readJsonResponse<ExternalTeamLogoSourceSnapshot>(response, `${league} team logo catalog`))
    .then(snapshot => {
      const catalog = buildExternalTeamLogoCatalog(snapshot);
      cachedCatalogs.set(descriptor.path, catalog);
      return catalog;
    })
    .catch(error => {
      catalogPromises.delete(descriptor.path);
      throw error;
    });
  catalogPromises.set(descriptor.path, pending);
  return pending;
}

export function applyExternalTeamLogoCatalog<T extends NonNBATeam>(
  teams: T[],
  league: string,
  catalog: ReadonlyMap<string, string> | null | undefined,
  season?: number,
): T[] {
  const descriptor = EXTERNAL_TEAM_LOGO_SOURCES[league];
  if (!descriptor || !catalog || (Number.isFinite(season) && Number(season) < descriptor.sourceSeason)) return teams;
  return teams.map(team => {
    if (team.league !== league) return team;
    const logo = resolveExternalTeamLogoFromCatalog(catalog, team);
    return logo && logo !== team.imgURL ? { ...team, imgURL: logo } : team;
  });
}

export async function preloadExternalTeamLogoCatalogsForTeams(
  teams: Array<Pick<NonNBATeam, 'league'>>,
  season?: number,
): Promise<void> {
  const leagues = new Set(teams
    .map(team => String(team.league ?? ''))
    .filter(league => !!EXTERNAL_TEAM_LOGO_SOURCES[league]));
  await Promise.all([...leagues].map(league => loadExternalTeamLogoCatalog(league, season).catch(() => new Map())));
}

export function applyCachedExternalTeamLogoCatalogs<T extends NonNBATeam>(
  teams: T[],
  season?: number,
): T[] {
  return Object.entries(EXTERNAL_TEAM_LOGO_SOURCES).reduce((current, [league, descriptor]) => (
    applyExternalTeamLogoCatalog(current, league, cachedCatalogs.get(descriptor.path), season)
  ), teams);
}
