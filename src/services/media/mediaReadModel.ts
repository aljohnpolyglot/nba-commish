import type {
  GameResult,
  GameState,
  MediaFact,
  MediaPage,
  MediaQuery,
  NewsItem,
  SocialPost,
} from '../../types';
import { TimeService } from '../time/TimeService';
import {
  isInternalFallbackSocialPost,
  resolveNewsFactCopy,
} from './mediaFactPresentation';
import {
  getCachedMedia,
  getMemoryCachedMedia,
  setCachedMedia,
  clearMediaCache,
} from './mediaCache';

const MEDIA_MODEL_VERSION = 6;

export type MediaReadItem =
  | (NewsItem & { htmlContent?: string; title?: string; skipAiExpansion?: boolean })
  | (SocialPost & { htmlContent?: string });

export interface MediaArticleReadModel {
  id: string;
  headline: string;
  body: string;
  date: string;
  leagueScope: string;
  sourceRef: { kind: string; id: string };
}

type Diagnostics = {
  newsQueries: number;
  socialQueries: number;
  articleQueries: number;
  cacheHits: number;
  providerRequests: number;
  photoRequests: number;
  lastNewsQueryMs: number;
  lastSocialQueryMs: number;
  lastArticleQueryMs: number;
};

const diagnostics: Diagnostics = {
  newsQueries: 0,
  socialQueries: 0,
  articleQueries: 0,
  cacheHits: 0,
  providerRequests: 0,
  photoRequests: 0,
  lastNewsQueryMs: 0,
  lastSocialQueryMs: 0,
  lastArticleQueryMs: 0,
};

export const getMediaReadModelDiagnostics = (): Diagnostics => ({ ...diagnostics });
export const resetMediaReadModelDiagnostics = (): void => {
  for (const key of Object.keys(diagnostics) as Array<keyof Diagnostics>) diagnostics[key] = 0;
};
const inFlightPages = new Map<string, Promise<MediaPage<MediaReadItem>>>();
export const clearMediaReadModelCache = async (): Promise<void> => {
  inFlightPages.clear();
  await clearMediaCache();
};

const abortIfRequested = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
};

const queryKey = (query: MediaQuery): string => `page:${MEDIA_MODEL_VERSION}:${JSON.stringify(query)}`;

const readMediaMetadata = (item: MediaReadItem) => {
  const row = item as MediaReadItem & {
    league?: string;
    leagueId?: string;
    competitionId?: string;
    teamId?: number;
    tid?: number;
    homeTeamId?: number;
    awayTeamId?: number;
    teamIds?: number[];
    category?: string;
    newsType?: string;
    data?: Record<string, unknown>;
  };
  const data = row.data ?? {};
  const teamIds = [
    ...(Array.isArray(row.teamIds) ? row.teamIds : []),
    ...(Array.isArray(data.teamIds) ? data.teamIds : []),
    row.teamId,
    data.teamId,
    row.tid,
    data.tid,
    row.homeTeamId,
    row.awayTeamId,
    data.homeTeamId,
    data.awayTeamId,
  ].filter(value => value !== null && value !== undefined && value !== '')
    .map(Number).filter(Number.isFinite);
  return {
    league: String(row.leagueId ?? row.league ?? data.leagueId ?? data.league ?? '').toLowerCase(),
    competitionId: String(row.competitionId ?? data.competitionId ?? '').toLowerCase(),
    teamIds,
    category: String(row.category ?? data.category ?? '').toLowerCase(),
  };
};

const matchesMediaQuery = (item: MediaReadItem, query: MediaQuery): boolean => {
  const metadata = readMediaMetadata(item);
  const leagueScope = query.leagueScope.trim().toLowerCase();
  if (metadata.league && metadata.league !== leagueScope) return false;
  if (leagueScope === 'euro' && metadata.league !== 'euro') return false;
  if (query.competitionId && metadata.competitionId !== query.competitionId.toLowerCase()) return false;
  if (query.teamId !== undefined && !metadata.teamIds.includes(query.teamId)) return false;
  if (query.category && metadata.category !== query.category.toLowerCase()) return false;
  return true;
};

const materializeMediaPage = async (
  state: GameState,
  query: MediaQuery,
  key: string,
): Promise<MediaPage<MediaReadItem>> => {
  const cutoff = TimeService.normalize(query.asOfDate);
  // MediaFacts are the canonical, compact audit/index layer. They are not a
  // substitute for the authored NewsGenerator/SocialEngine presentation
  // layers: projecting every fact directly caused generic league updates to
  // bury recaps, debates, memes, photos and handle-specific voices.
  const legacy = (query.feed === 'news' ? state.news ?? [] : state.socialFeed ?? [])
    .filter(row => TimeService.compare((row as NewsItem | SocialPost).date, cutoff) <= 0)
    .filter(row => query.feed !== 'social' || !isInternalFallbackSocialPost(row as SocialPost))
    .filter(row => matchesMediaQuery(row as MediaReadItem, query))
    .slice()
    .sort((left, right) => TimeService.compare(right.date, left.date) || left.id.localeCompare(right.id));
  const ordered = legacy.sort((left, right) =>
    TimeService.compare(right.date, left.date) || left.id.localeCompare(right.id));
  const normalizedAuthor = query.authorHandle?.replace(/^@/, '').trim().toLowerCase();
  const scoped = normalizedAuthor
    ? ordered.filter(item => 'handle' in item && item.handle.replace(/^@/, '').toLowerCase() === normalizedAuthor)
    : ordered;
  const offsetMatch = query.cursor?.match(/^v1:(\d+):/);
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
  const limit = Math.max(1, Math.min(100, Math.floor(query.limit)));
  const items = scoped.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const page: MediaPage<MediaReadItem> = {
    items,
    nextCursor: nextOffset < scoped.length ? `v1:${nextOffset}:${items.at(-1)?.id ?? ''}` : null,
    generatedFromRevision: query.stateRevision,
  };
  // The in-memory cache is populated synchronously by setCachedMedia. Durable
  // IndexedDB persistence is a regenerable read-model concern and must not
  // hold the first visible page behind a large-save/browser storage stall.
  void setCachedMedia(key, page).catch(() => undefined);
  return page;
};

export async function queryMediaPage(
  state: GameState,
  query: MediaQuery,
  signal?: AbortSignal,
): Promise<MediaPage<MediaReadItem>> {
  const started = performance.now();
  const timingKey = query.feed === 'news' ? 'lastNewsQueryMs' : 'lastSocialQueryMs';
  abortIfRequested(signal);
  const key = queryKey(query);
  const cached = await getCachedMedia<MediaPage<MediaReadItem>>(key);
  abortIfRequested(signal);
  if (cached) {
    diagnostics.cacheHits += 1;
    diagnostics[timingKey] = performance.now() - started;
    return cached;
  }
  let pending = inFlightPages.get(key);
  if (!pending) {
    diagnostics[query.feed === 'news' ? 'newsQueries' : 'socialQueries'] += 1;
    pending = materializeMediaPage(state, query, key).finally(() => inFlightPages.delete(key));
    inFlightPages.set(key, pending);
  }
  const page = await pending;
  abortIfRequested(signal);
  diagnostics[timingKey] = performance.now() - started;
  return page;
}

export async function queryMediaArticle(
  state: GameState,
  itemId: string,
  leagueScope: string,
  signal?: AbortSignal,
): Promise<MediaArticleReadModel> {
  const started = performance.now();
  abortIfRequested(signal);
  diagnostics.articleQueries += 1;
  const factId = itemId.endsWith(':social') ? itemId.slice(0, -7) : itemId;
  const key = `article:${MEDIA_MODEL_VERSION}:${state.saveId ?? 'unsaved'}:${state.mediaEventRevision ?? 0}:${leagueScope}:${factId}`;
  const memoryCached = getMemoryCachedMedia<MediaArticleReadModel>(key);
  abortIfRequested(signal);
  if (memoryCached) {
    diagnostics.cacheHits += 1;
    diagnostics.lastArticleQueryMs = performance.now() - started;
    return memoryCached;
  }
  const fact = (state.mediaFacts ?? []).find(candidate => candidate.id === factId && candidate.leagueScope === leagueScope);
  if (!fact) {
    const cached = await getCachedMedia<MediaArticleReadModel>(key);
    abortIfRequested(signal);
    if (cached) {
      diagnostics.cacheHits += 1;
      diagnostics.lastArticleQueryMs = performance.now() - started;
      return cached;
    }
    const legacy = (state.news ?? []).find(item => item.id === itemId);
    if (!legacy) throw new Error(`media_item_not_found:${itemId}`);
    const article: MediaArticleReadModel = {
      id: legacy.id,
      headline: legacy.headline ?? 'League update',
      body: legacy.content ?? '',
      date: legacy.date,
      leagueScope,
      sourceRef: { kind: 'legacy-news', id: legacy.id },
    };
    diagnostics.lastArticleQueryMs = performance.now() - started;
    return article;
  }
  const copy = resolveNewsFactCopy(state, fact);
  const article: MediaArticleReadModel = {
    id: fact.id,
    headline: copy.headline,
    body: `${copy.summary} The league's official record for ${fact.availableAt} confirms the result.`,
    date: fact.availableAt,
    leagueScope: fact.leagueScope,
    sourceRef: fact.sourceRef,
  };
  abortIfRequested(signal);
  void setCachedMedia(key, article).catch(() => undefined);
  diagnostics.lastArticleQueryMs = performance.now() - started;
  return article;
}
