import type { NBAPlayer } from '../types';

type SourceIdValue = string | number | Array<string | number>;
type PlayerIdentity = Pick<NBAPlayer,
  'internalId' | 'personId' | 'sourceIds' | 'srID' | 'slug' | 'nbaId' | 'name' | 'born' | 'draft' | 'gender' | 'status' | 'historicalEndesaSource' | 'historicalPbaSource' | 'historicalEuropeSource'
>;

const identityToken = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const CURATED_PERSON_BY_ALIAS: Record<string, string> = {
  'bref:valanjo01': 'person:jonas-valanciunas',
  'realgm:24239': 'person:jonas-valanciunas',
  'bref:farieke01': 'person:kenneth-faried',
  'realgm:2303': 'person:kenneth-faried',
  'realgm:133946': 'person:kai-sotto',
};

const sourceRefToken = (value: unknown): string | undefined => {
  const ref = String(value ?? '').trim();
  if (!ref) return undefined;
  const realgm = ref.match(/realgm\.com\/player\/[^/]+\/(?:summary|profile)\/(\d+)/i);
  if (realgm) return `realgm:${realgm[1]}`;
  const bref = ref.match(/basketball-reference\.com\/players\/[a-z]\/([^/.]+)\.html/i);
  if (bref) return `bref:${identityToken(bref[1])}`;
  const fiba = ref.match(/fiba\.basketball\/[^\s]*\/players?\/(\d+)-/i);
  if (fiba) return `fiba:${fiba[1]}`;
  return `ref:${identityToken(ref)}`;
};

const appendSourceValue = (tokens: Set<string>, namespace: string, value: SourceIdValue | undefined) => {
  for (const entry of Array.isArray(value) ? value : [value]) {
    const normalized = identityToken(entry);
    if (normalized) tokens.add(`${identityToken(namespace)}:${normalized}`);
  }
};

export function getPlayerIdentityEvidenceTokens(player: PlayerIdentity): string[] {
  const tokens = new Set<string>();
  const personId = identityToken(player.personId ?? player.historicalEuropeSource?.personId);
  if (personId) tokens.add(`person:${personId.replace(/^person:/, '')}`);
  const stableLegacyId = identityToken(player.srID);
  const stableSlug = identityToken(player.slug);
  if (stableLegacyId) tokens.add(`bref:${stableLegacyId}`);
  if (stableSlug) tokens.add(`bref:${stableSlug}`);
  if (player.nbaId != null && identityToken(player.nbaId)) tokens.add(`nba:${identityToken(player.nbaId)}`);

  for (const [namespace, value] of Object.entries(player.sourceIds ?? {})) {
    appendSourceValue(tokens, namespace, value as SourceIdValue);
  }
  const realgmInternal = identityToken(player.internalId).match(/realgm[-_:](\d+)/i);
  if (realgmInternal) tokens.add(`realgm:${realgmInternal[1]}`);
  if (player.historicalEndesaSource?.identityKey) tokens.add(`endesa:${identityToken(player.historicalEndesaSource.identityKey)}`);
  if (player.historicalPbaSource?.identityKey) tokens.add(`pba:${identityToken(player.historicalPbaSource.identityKey)}`);
  for (const ref of player.historicalEuropeSource?.sourceRefs ?? []) {
    const token = sourceRefToken(ref);
    if (token) tokens.add(token);
  }
  return [...tokens];
}

export function resolveCanonicalPersonId(player: PlayerIdentity): string {
  const direct = identityToken(player.personId ?? player.historicalEuropeSource?.personId);
  if (direct) return `person:${direct.replace(/^person:/, '')}`;
  const evidence = getPlayerIdentityEvidenceTokens(player);
  for (const token of evidence) {
    const curated = CURATED_PERSON_BY_ALIAS[token];
    if (curated) return curated;
  }
  const preferred = evidence.find(token => token.startsWith('bref:'))
    ?? evidence.find(token => token.startsWith('nba:'))
    ?? evidence.find(token => !token.startsWith('ref:'));
  if (preferred) return `person:${preferred}`;
  return `person:runtime:${identityToken(player.internalId) || 'unknown'}`;
}

export function withCanonicalPersonIdentity<T extends NBAPlayer>(player: T): T {
  const sourceIds: Record<string, string | string[]> = { ...(player.sourceIds ?? {}) };
  const append = (namespace: string, value: string) => {
    if (!value) return;
    const current = sourceIds[namespace];
    const values = new Set(Array.isArray(current) ? current : current ? [current] : []);
    values.add(value);
    sourceIds[namespace] = values.size === 1 ? [...values][0] : [...values];
  };
  for (const token of getPlayerIdentityEvidenceTokens(player)) {
    const separator = token.indexOf(':');
    if (separator <= 0 || token.startsWith('person:')) continue;
    append(token.slice(0, separator), token.slice(separator + 1));
  }
  return {
    ...player,
    personId: resolveCanonicalPersonId(player),
    sourceIds,
  };
}

export function sameCanonicalPlayerIdentity(left: PlayerIdentity, right: PlayerIdentity): boolean {
  const leftId = identityToken(left.internalId);
  const rightId = identityToken(right.internalId);
  if (leftId && rightId && leftId === rightId) return true;
  if (resolveCanonicalPersonId(left) === resolveCanonicalPersonId(right)) return true;

  const rightTokens = new Set(getPlayerIdentityEvidenceTokens(right));
  return getPlayerIdentityEvidenceTokens(left).some(token => rightTokens.has(token));
}

export function createCanonicalPlayerIdentityIndex(players: readonly PlayerIdentity[]) {
  const byInternalId = new Set<string>();
  const byPersonId = new Set<string>();
  const byEvidence = new Set<string>();

  for (const player of players) {
    const internalId = identityToken(player.internalId);
    if (internalId) byInternalId.add(internalId);
    byPersonId.add(resolveCanonicalPersonId(player));
    getPlayerIdentityEvidenceTokens(player).forEach(token => byEvidence.add(token));
  }

  return {
    has(player: PlayerIdentity): boolean {
      const internalId = identityToken(player.internalId);
      if (internalId && byInternalId.has(internalId)) return true;
      if (byPersonId.has(resolveCanonicalPersonId(player))) return true;
      return getPlayerIdentityEvidenceTokens(player).some(token => byEvidence.has(token));
    },
  };
}

const playerIdentityRichness = (player: NBAPlayer): number => (
  (Number(player.tid) >= 0 ? 1_000_000 : 0)
  + (player.status === 'Retired' ? 0 : 100_000)
  + (player.stats?.length ?? 0) * 100
  + (player.ratings?.length ?? 0) * 10
  + (player.awards?.length ?? 0)
);

export function createCanonicalPlayerResolverIndex(players: readonly NBAPlayer[]) {
  const byPersonId = new Map<string, NBAPlayer>();
  const aliasOwners = new Map<string, string | null>();
  for (const player of players) {
    const personId = resolveCanonicalPersonId(player);
    for (const token of getPlayerIdentityEvidenceTokens(player)) {
      if (token.startsWith('ref:')) continue;
      const alias = `person:${token.replace(/^person:/, '')}`;
      const owner = aliasOwners.get(alias);
      aliasOwners.set(alias, owner === undefined || owner === personId ? personId : null);
    }
    const existing = byPersonId.get(personId);
    if (!existing || playerIdentityRichness(player) > playerIdentityRichness(existing)) {
      byPersonId.set(personId, player);
    }
  }
  return {
    size: byPersonId.size,
    resolve(personId: string): NBAPlayer | undefined {
      const target = identityToken(personId);
      if (!target) return undefined;
      const key = `person:${target.replace(/^person:/, '')}`;
      return byPersonId.get(key) ?? byPersonId.get(aliasOwners.get(key) ?? '');
    },
  };
}

const playerResolverIndexCache = new WeakMap<readonly NBAPlayer[], ReturnType<typeof createCanonicalPlayerResolverIndex>>();

export function resolvePlayerByCanonicalPersonId(
  players: readonly NBAPlayer[],
  personId: string,
): NBAPlayer | undefined {
  let index = playerResolverIndexCache.get(players);
  if (!index) {
    index = createCanonicalPlayerResolverIndex(players);
    playerResolverIndexCache.set(players, index);
  }
  return index.resolve(personId);
}
