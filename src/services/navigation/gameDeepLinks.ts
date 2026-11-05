import type { Tab } from '../../types';

export type GameDeepLinkRoute =
  | { kind: 'home'; saveId: string }
  | { kind: 'player'; saveId: string; personId: string; slug?: string }
  | { kind: 'franchise'; saveId: string; franchiseId: string; slug?: string }
  | { kind: 'team'; saveId: string; teamIdentityId: string; slug?: string }
  | { kind: 'competition'; saveId: string; competitionId: string }
  | { kind: 'game'; saveId: string; gameId: string }
  | { kind: 'draft'; saveId: string; season: number }
  | { kind: 'history'; saveId: string; leagueOrCompetitionId: string };

export interface GameDeepLinkParseResult {
  route: GameDeepLinkRoute | null;
  error?: string;
}

const decodeSegment = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded || null;
  } catch {
    return null;
  }
};

const encodeSegment = (value: string | number): string => encodeURIComponent(String(value).trim());

export const createEntitySlug = (value: string): string => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

export function buildGameDeepLink(route: GameDeepLinkRoute): string {
  const base = `/game/${encodeSegment(route.saveId)}`;
  switch (route.kind) {
    case 'home':
      return base;
    case 'player':
      return `${base}/player/${encodeSegment(route.personId)}${route.slug ? `/${encodeSegment(route.slug)}` : ''}`;
    case 'franchise':
      return `${base}/franchise/${encodeSegment(route.franchiseId)}${route.slug ? `/${encodeSegment(route.slug)}` : ''}`;
    case 'team':
      return `${base}/team/${encodeSegment(route.teamIdentityId)}${route.slug ? `/${encodeSegment(route.slug)}` : ''}`;
    case 'competition':
      return `${base}/competition/${encodeSegment(route.competitionId)}`;
    case 'game':
      return `${base}/game/${encodeSegment(route.gameId)}`;
    case 'draft':
      return `${base}/draft/${encodeSegment(route.season)}`;
    case 'history':
      return `${base}/history/${encodeSegment(route.leagueOrCompetitionId)}`;
  }
}

export function parseGameDeepLink(pathname: string): GameDeepLinkParseResult {
  const segments = String(pathname ?? '').split('/').filter(Boolean);
  if (segments[0] !== 'game') return { route: null };
  const saveId = decodeSegment(segments[1]);
  if (!saveId) return { route: null, error: 'This game link is missing a valid save identifier.' };
  if (segments.length === 2) return { route: { kind: 'home', saveId } };

  const entityType = decodeSegment(segments[2]);
  const entityId = decodeSegment(segments[3]);
  if (!entityType || !entityId) {
    return { route: null, error: 'This game link is missing a valid entity identifier.' };
  }
  const slug = decodeSegment(segments[4]) ?? undefined;

  switch (entityType) {
    case 'player':
      return { route: { kind: 'player', saveId, personId: entityId, slug } };
    case 'franchise':
      return { route: { kind: 'franchise', saveId, franchiseId: entityId, slug } };
    case 'team':
      return { route: { kind: 'team', saveId, teamIdentityId: entityId, slug } };
    case 'competition':
      return { route: { kind: 'competition', saveId, competitionId: entityId } };
    case 'game':
      return { route: { kind: 'game', saveId, gameId: entityId } };
    case 'draft': {
      const season = Number(entityId);
      return Number.isSafeInteger(season) && season >= 1940 && season <= 9999
        ? { route: { kind: 'draft', saveId, season } }
        : { route: null, error: 'This draft link contains an invalid season.' };
    }
    case 'history':
      return { route: { kind: 'history', saveId, leagueOrCompetitionId: entityId } };
    default:
      return { route: null, error: 'This game link points to an unsupported entity type.' };
  }
}

export function getGameDeepLinkTab(route: GameDeepLinkRoute, homeView: Tab = 'Schedule'): Tab {
  switch (route.kind) {
    case 'player': return 'Player Bios';
    case 'franchise': return 'Franchises';
    case 'team': return 'Team History';
    case 'competition': return 'NBA Cup';
    case 'game': return 'Schedule';
    case 'draft': return 'Draft Scouting';
    case 'history': return 'League History';
    case 'home': return homeView;
  }
}
