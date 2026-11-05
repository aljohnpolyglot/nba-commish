import type { NBAPlayer, PlayerRelative, PlayerRelativeType } from '../types';
import { computeAge } from '../utils/helpers';
import { isPlayerVisibleInTimeline } from '../utils/historicalTimeline';
import { getPrimaryPlayerCountry } from '../utils/playerNationality';
import { inverseRelativeType, normalizeRelativeName, resolveFamilyRelative } from '../utils/familyTies';
import { createPortraitUsageSet, getRegenPortraitUrl, type RegenRace } from '../utils/newgenPortrait';
import { hashPortraitSeed } from '../utils/portraitPoolAllocator';

export type FamilyGenerationScope = 'nba' | 'pba' | 'euro' | 'fictional';

export interface FamilyLineageEvent {
  id: string;
  kind: 'parent_child' | 'siblings' | 'twins';
  introducedYear: number;
  familyId: string;
  playerIds: string[];
  playerNames: string[];
  prospectId: string;
  prospectName: string;
  relativeId: string;
  relativeName: string;
  relationLabel: string;
}

export interface GeneratedFamilyLineageResult { players: NBAPlayer[]; events: FamilyLineageEvent[] }

const EXTERNAL_STATUSES = new Set([
  'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia',
]);
const LINEAGE_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V', 'VI']);

function unit(seed: string): number { return hashPortraitSeed(seed) / 0xffffffff; }

function playerGender(player: NBAPlayer): 'male' | 'female' {
  return String((player as any).gender ?? '').toLowerCase() === 'female' ? 'female' : 'male';
}

function playerBirthYear(player: NBAPlayer, year: number): number {
  const bornYear = Number(player.born?.year ?? 0);
  return bornYear > 0 ? bornYear : year - computeAge(player, year);
}

function playerDraftYear(player: NBAPlayer, fallback: number): number {
  const year = Number(player.draft?.year ?? 0);
  return year > 0 ? year : fallback;
}

function isInScope(player: NBAPlayer, scope: FamilyGenerationScope): boolean {
  const tid = Number(player.tid);
  const status = String(player.status ?? '');
  if (scope === 'fictional') return true;
  if (scope === 'pba') {
    return (tid >= 2000 && tid < 3000)
      || status === 'PBA'
      || !!player.historicalPbaSource
      || String((player as any).pbaDraftTunedVersion ?? '').startsWith('pba-draft-')
      || (player.stats ?? []).some(stat => Number(stat.tid) >= 2000 && Number(stat.tid) < 3000);
  }
  if (scope === 'euro') {
    const leagueLabel = `${status} ${String((player as any).league ?? '')}`.toLowerCase();
    return !!player.historicalEndesaSource
      || !!player.euroAcademyPlayer
      || /euro|endesa|acb|serie a|bbl|betclic|lnb|france|italy|germany|greece|turkey|lithuania|israel|vtb|aba|adriatic/.test(leagueLabel)
      || (player.stats ?? []).some(stat =>
        /euro|endesa|acb|french|italian|german|greek|turkish|lithuanian|vtb|adriatic|copa|supercopa|coppa|leaders-cup|mindaugas|presidential/
          .test(String(stat.competitionId ?? '').toLowerCase()),
      );
  }
  if (tid >= 0) return tid < 100;
  if (EXTERNAL_STATUSES.has(status) || player.historicalPbaSource || player.historicalEndesaSource
    || String((player as any).pbaDraftTunedVersion ?? '').startsWith('pba-draft-')) return false;
  if (/^(?:euro|pba|wnba|bleague|gleague|cba|nbl|ext-gen)-/i.test(String(player.internalId ?? ''))) return false;
  const hasNbaFootprint = (player.stats ?? []).some(stat => Number(stat.tid) >= 0 && Number(stat.tid) < 100)
    || (player.transactions ?? []).some(transaction => Number(transaction.tid) >= 0 && Number(transaction.tid) < 100)
    || (Number(player.draft?.tid) >= 0 && Number(player.draft?.tid) < 100);
  const nbaIdentity = /^(?:nba|hist|native|gen)-/i.test(String(player.internalId ?? ''));
  return hasNbaFootprint || status === 'Draft Prospect' || status === 'Prospect'
    || (nbaIdentity && (status === 'Free Agent' || status === 'Retired'));
}

function splitLineageName(player: NBAPlayer): { given: string; surname: string; suffix?: string } {
  const raw = String(player.name ?? '').replace(/\s+/g, ' ').trim();
  const parts = raw.split(' ').filter(Boolean);
  const tail = parts.at(-1)?.replace(/[.]/g, '').toUpperCase() ?? '';
  const suffix = LINEAGE_SUFFIXES.has(tail) ? tail : undefined;
  if (suffix) parts.pop();
  const storedLast = String(player.lastName ?? '').replace(/\s+/g, ' ').trim();
  const storedLastParts = storedLast.split(' ').filter(Boolean);
  if (LINEAGE_SUFFIXES.has(storedLastParts.at(-1)?.replace(/[.]/g, '').toUpperCase() ?? '')) storedLastParts.pop();
  const surname = storedLastParts.join(' ') || parts.at(-1) || 'Player';
  const given = String(player.firstName ?? '').trim() || parts.slice(0, -1).join(' ') || parts[0] || 'Prospect';
  return { given, surname, suffix };
}

function lineageBaseName(player: NBAPlayer): string {
  const parts = splitLineageName(player);
  return normalizeRelativeName(`${parts.given} ${parts.surname}`);
}

function nextSuffix(parentSuffix?: string): string {
  if (parentSuffix === 'JR' || parentSuffix === 'II') return 'III';
  if (parentSuffix === 'III') return 'IV';
  if (parentSuffix === 'IV') return 'V';
  if (parentSuffix === 'V') return 'VI';
  return 'Jr.';
}

function familyIdFor(player: NBAPlayer): string {
  if (player.familyId) return player.familyId;
  const seed = `${lineageBaseName(player)}-${player.born?.year ?? 'unknown'}`;
  return `family-${hashPortraitSeed(seed).toString(36)}`;
}

function relationKey(relative: PlayerRelative): string {
  const identity = String(relative.playerId ?? '').trim() || String(relative.pid ?? '').trim() || normalizeRelativeName(relative.name);
  return `${relative.type}:${identity}`;
}

function withRelative(player: NBAPlayer, relative: PlayerRelative): NBAPlayer {
  const relatives = [...(player.relatives ?? [])];
  const key = relationKey(relative);
  const index = relatives.findIndex(candidate =>
    relationKey(candidate) === key
    || (
      candidate.type === relative.type
      && normalizeRelativeName(candidate.name) === normalizeRelativeName(relative.name)
    ),
  );
  if (index >= 0) relatives[index] = { ...relatives[index], ...relative };
  else relatives.push(relative);
  return { ...player, familyId: relative.familyId ?? player.familyId, relatives };
}

function relationTo(type: PlayerRelativeType, target: NBAPlayer, familyId: string,
  introducedYear?: number, identicalTwin?: boolean): PlayerRelative {
  const rawPid = Number((target as any).pid);
  return {
    type,
    name: target.name,
    playerId: target.internalId,
    ...(Number.isFinite(rawPid) ? { pid: rawPid } : {}),
    familyId,
    ...(introducedYear ? { introducedYear } : {}),
    ...(identicalTwin ? { identicalTwin: true } : {}),
  };
}

function linkedPair(first: NBAPlayer, second: NBAPlayer,
  firstType: PlayerRelativeType, secondType: PlayerRelativeType, familyId: string,
  introducedYear?: number, identicalTwin?: boolean): [NBAPlayer, NBAPlayer] {
  const firstWithIdentity = { ...first, familyId, familyPortraitSeed: first.familyPortraitSeed ?? familyId };
  const secondWithIdentity = { ...second, familyId, familyPortraitSeed: second.familyPortraitSeed ?? familyId };
  return [
    withRelative(firstWithIdentity, relationTo(firstType, secondWithIdentity, familyId, introducedYear, identicalTwin)),
    withRelative(secondWithIdentity, relationTo(secondType, firstWithIdentity, familyId, introducedYear, identicalTwin)),
  ];
}

function choose<T extends NBAPlayer>(players: T[], seed: string): T | undefined {
  if (players.length === 0) return undefined;
  return [...players].sort((a, b) =>
    hashPortraitSeed(`${seed}:${a.internalId}`) - hashPortraitSeed(`${seed}:${b.internalId}`),
  )[0];
}

function targetCount(size: number, rate: number, seed: string): number {
  const expected = size * rate;
  return Math.floor(expected) + (unit(`${seed}:fraction`) < expected % 1 ? 1 : 0);
}

function relatedFace(anchor: NBAPlayer, prospect: NBAPlayer): any {
  const anchorFace = (anchor as any).face;
  const prospectFace = (prospect as any).face;
  if (!anchorFace || typeof anchorFace !== 'object') return prospectFace;
  return {
    ...anchorFace,
    ...(prospectFace?.hair ? { hair: prospectFace.hair } : {}),
    ...(prospectFace?.facialHair ? { facialHair: prospectFace.facialHair } : {}),
    ...(prospectFace?.accessories ? { accessories: prospectFace.accessories } : {}),
    ...(prospectFace?.jersey ? { jersey: prospectFace.jersey } : {}),
  };
}

function familyPortrait(anchor: NBAPlayer, prospect: NBAPlayer, familyId: string, used: Set<string>): Partial<NBAPlayer> {
  const race = (['black', 'asian', 'brown', 'white'].includes(String((anchor as any).race))
    ? (anchor as any).race
    : (prospect as any).race) as RegenRace;
  const nationality = getPrimaryPlayerCountry(anchor, getPrimaryPlayerCountry(prospect));
  return {
    familyPortraitSeed: familyId,
    imgURL: getRegenPortraitUrl(`${familyId}:relative`, race || 'white', {
      nationality,
      bornLoc: prospect.born?.loc,
      gender: playerGender(prospect),
      usedPortraitUrls: used,
    }) ?? prospect.imgURL,
    ...({ race: race || (prospect as any).race, face: relatedFace(anchor, prospect) } as any),
  };
}

function renameWithSurname(player: NBAPlayer, surname: string): NBAPlayer {
  const { given } = splitLineageName(player);
  return { ...player, firstName: given, lastName: surname, name: `${given} ${surname}`.trim() };
}

function renameAsNamesake(player: NBAPlayer, parent: NBAPlayer): NBAPlayer {
  const parentName = splitLineageName(parent);
  const suffix = nextSuffix(parentName.suffix);
  const lastName = `${parentName.surname} ${suffix}`;
  return { ...player, firstName: parentName.given, lastName, name: `${parentName.given} ${lastName}` };
}

function eventForPair(
  kind: FamilyLineageEvent['kind'],
  prospect: NBAPlayer,
  relative: NBAPlayer,
  familyId: string,
  introducedYear: number,
  relationLabel: string,
): FamilyLineageEvent {
  return {
    id: `family-${kind}-${[prospect.internalId, relative.internalId].sort().join('-')}`,
    kind,
    introducedYear,
    familyId,
    playerIds: [prospect.internalId, relative.internalId],
    playerNames: [prospect.name, relative.name],
    prospectId: prospect.internalId,
    prospectName: prospect.name,
    relativeId: relative.internalId,
    relativeName: relative.name,
    relationLabel,
  };
}

export function applyGeneratedFamilyLineages(existingPlayers: NBAPlayer[], additions: NBAPlayer[],
  currentYear: number, scope: FamilyGenerationScope = 'nba',
  historicalBranchStartYear?: number): GeneratedFamilyLineageResult {
  const branchSafeExisting = historicalBranchStartYear
    ? sanitizeHistoricalFutureFamilyTies(existingPlayers, historicalBranchStartYear)
    : existingPlayers;
  const branchSafeAdditions = historicalBranchStartYear
    ? sanitizeHistoricalFutureFamilyTies(additions, historicalBranchStartYear)
    : additions;
  if (branchSafeAdditions.length === 0) {
    return {
      players: reconcilePlayerFamilyTiesForScope(
        branchSafeExisting,
        currentYear,
        scope,
        historicalBranchStartYear,
      ),
      events: [],
    };
  }
  const allById = new Map([...branchSafeExisting, ...branchSafeAdditions].map(player => [player.internalId, player]));
  const existingIds = new Set(branchSafeExisting.map(player => player.internalId));
  const usedAdditionIds = new Set<string>();
  const usedPortraits = createPortraitUsageSet([...branchSafeExisting, ...branchSafeAdditions].map(player => player.imgURL));
  const events: FamilyLineageEvent[] = [];
  const yearGroups = new Map<number, NBAPlayer[]>();
  for (const addition of branchSafeAdditions.filter(player =>
    isInScope(player, scope)
    || (scope === 'pba' && player.tid === -2 && getPrimaryPlayerCountry(player) === 'Philippines'),
  )) {
    const year = playerDraftYear(addition, currentYear);
    const group = yearGroups.get(year);
    if (group) group.push(addition);
    else yearGroups.set(year, [addition]);
  }

  const replace = (player: NBAPlayer) => allById.set(player.internalId, player);
  const hasNameCollision = (player: NBAPlayer) => [...allById.values()].some(candidate =>
    candidate.internalId !== player.internalId
    && normalizeRelativeName(candidate.name) === normalizeRelativeName(player.name),
  );
  for (const [draftYear, rawGroup] of yearGroups) {
    const seed = `${scope}:${draftYear}:${rawGroup.map(player => player.internalId).sort().join(':')}`;
    const available = () => rawGroup
      .map(player => allById.get(player.internalId)!)
      .filter(player => !usedAdditionIds.has(player.internalId));

    for (let index = 0; index < targetCount(rawGroup.length, 0.0125, `${seed}:parent`); index++) {
      const prospect = choose(available(), `${seed}:parent-prospect:${index}`);
      if (!prospect) break;
      const prospectBorn = playerBirthYear(prospect, currentYear);
      const candidates = [...allById.values()].filter(candidate => {
        if (!existingIds.has(candidate.internalId) || !isInScope(candidate, scope)) return false;
        if (playerGender(candidate) !== playerGender(prospect)) return false;
        const gap = prospectBorn - playerBirthYear(candidate, currentYear);
        return gap >= 18 && gap <= 45;
      });
      const sameCountry = candidates.filter(candidate => getPrimaryPlayerCountry(candidate) === getPrimaryPlayerCountry(prospect));
      const parent = choose(sameCountry.length > 0 ? sameCountry : candidates, `${seed}:parent-anchor:${index}`);
      if (!parent) continue;
      const familyId = familyIdFor(parent);
      const namesake = unit(`${seed}:namesake:${prospect.internalId}`) < 0.62;
      let child = namesake ? renameAsNamesake(prospect, parent) : renameWithSurname(prospect, splitLineageName(parent).surname);
      if (hasNameCollision(child)) child = renameWithSurname(prospect, splitLineageName(parent).surname);
      if (hasNameCollision(child)) continue;
      child = { ...child, ...familyPortrait(parent, child, familyId, usedPortraits) } as NBAPlayer;
      const parentType = playerGender(parent) === 'female' ? 'mother' : 'father';
      const childType = playerGender(child) === 'female' ? 'daughter' : 'son';
      const [linkedChild, linkedParent] = linkedPair(child, parent, parentType, childType, familyId, draftYear);
      replace(linkedChild);
      replace(linkedParent);
      usedAdditionIds.add(child.internalId);
      events.push(eventForPair('parent_child', linkedChild, linkedParent, familyId, draftYear, parentType));
    }

    for (let index = 0; index < targetCount(rawGroup.length, 0.015, `${seed}:sibling`); index++) {
      const prospect = choose(available(), `${seed}:sibling-prospect:${index}`);
      if (!prospect) break;
      const prospectBorn = playerBirthYear(prospect, currentYear);
      const candidates = [...allById.values()].filter(candidate => {
        if (!existingIds.has(candidate.internalId) || !isInScope(candidate, scope)) return false;
        if (playerGender(candidate) !== playerGender(prospect)) return false;
        if (splitLineageName(candidate).given === splitLineageName(prospect).given) return false;
        if (playerDraftYear(candidate, draftYear) > draftYear) return false;
        const gap = Math.abs(prospectBorn - playerBirthYear(candidate, currentYear));
        return gap >= 1 && gap <= 14;
      });
      const sameCountry = candidates.filter(candidate => getPrimaryPlayerCountry(candidate) === getPrimaryPlayerCountry(prospect));
      const sibling = choose(sameCountry.length > 0 ? sameCountry : candidates, `${seed}:sibling-anchor:${index}`);
      if (!sibling) continue;
      const familyId = familyIdFor(sibling);
      let renamed = renameWithSurname(prospect, splitLineageName(sibling).surname);
      if (hasNameCollision(renamed)) continue;
      renamed = { ...renamed, ...familyPortrait(sibling, renamed, familyId, usedPortraits) } as NBAPlayer;
      const prospectType = playerGender(sibling) === 'female' ? 'sister' : 'brother';
      const siblingType = playerGender(renamed) === 'female' ? 'sister' : 'brother';
      const [linkedProspect, linkedSibling] = linkedPair(renamed, sibling, prospectType, siblingType, familyId, draftYear);
      replace(linkedProspect);
      replace(linkedSibling);
      usedAdditionIds.add(renamed.internalId);
      events.push(eventForPair('siblings', linkedProspect, linkedSibling, familyId, draftYear, prospectType));
    }

    for (let index = 0; index < targetCount(rawGroup.length, 0.0075, `${seed}:twin`); index++) {
      const first = choose(available(), `${seed}:twin-first:${index}`);
      if (!first) break;
      const second = choose(available().filter(player =>
        player.internalId !== first.internalId
        && playerGender(player) === playerGender(first)
        && splitLineageName(player).given !== splitLineageName(first).given,
      ), `${seed}:twin-second:${index}`);
      if (!second) continue;
      const familyId = familyIdFor(first);
      const renamedSecond = {
        ...renameWithSurname(second, splitLineageName(first).surname),
        born: first.born ? { ...first.born } : second.born,
        imgURL: first.imgURL,
        familyPortraitSeed: familyId,
        ...({ race: (first as any).race, nationality: (first as any).nationality, face: (first as any).face } as any),
      } as NBAPlayer;
      const [linkedFirst, linkedSecond] = linkedPair(first, renamedSecond, 'twin', 'twin', familyId, draftYear, true);
      replace(linkedFirst);
      replace(linkedSecond);
      usedAdditionIds.add(first.internalId);
      usedAdditionIds.add(second.internalId);
      events.push(eventForPair('twins', linkedFirst, linkedSecond, familyId, draftYear, 'twin'));
    }
  }

  return {
    players: reconcilePlayerFamilyTiesForScope(
      [...allById.values()],
      currentYear,
      scope,
      historicalBranchStartYear,
    ),
    events,
  };
}

export function reconcilePlayerFamilyTies(players: NBAPlayer[], currentYear: number,
  suffixInferenceCutoffYear = currentYear): NBAPlayer[] {
  const byId = new Map<string, NBAPlayer>(
    players.map(player => [player.internalId, { ...player, relatives: [...(player.relatives ?? [])] }]),
  );
  const current = () => [...byId.values()];
  for (const player of current()) {
    for (const relative of player.relatives ?? []) {
      const target = resolveFamilyRelative(relative, current());
      if (!target || target.internalId === player.internalId) continue;
      const familyId = relative.familyId ?? player.familyId ?? target.familyId ?? familyIdFor(player);
      const normalized = relationTo(
        relative.type as PlayerRelativeType,
        target,
        familyId,
        relative.introducedYear,
        relative.identicalTwin,
      );
      byId.set(player.internalId, withRelative({ ...byId.get(player.internalId)!, familyId }, normalized));
      const inverse = inverseRelativeType(relative.type, player);
      byId.set(target.internalId, withRelative(
        { ...byId.get(target.internalId)!, familyId },
        relationTo(inverse, player, familyId, relative.introducedYear, relative.identicalTwin),
      ));
    }
  }

  const visible = current().filter(player => isPlayerVisibleInTimeline(player, suffixInferenceCutoffYear));
  const byBaseName = new Map<string, NBAPlayer[]>();
  for (const player of visible) {
    const suffix = splitLineageName(player).suffix;
    if (!suffix || suffix === 'SR') continue;
    const base = lineageBaseName(player);
    const bucket = byBaseName.get(base);
    if (bucket) bucket.push(player);
    else byBaseName.set(base, [player]);
  }
  for (const [base, children] of byBaseName) {
    const possibleParents = visible.filter(player => lineageBaseName(player) === base);
    for (const child of children) {
      const childBorn = playerBirthYear(child, currentYear);
      const parent = choose(possibleParents.filter(candidate => {
        if (candidate.internalId === child.internalId) return false;
        const suffix = splitLineageName(candidate).suffix;
        const childSuffix = splitLineageName(child).suffix;
        if (childSuffix === 'III' && suffix && suffix !== 'JR' && suffix !== 'II') return false;
        const gap = childBorn - playerBirthYear(candidate, currentYear);
        return gap >= 18 && gap <= 55;
      }), `suffix-parent:${child.internalId}`);
      if (!parent) continue;
      const familyId = parent.familyId ?? child.familyId ?? familyIdFor(parent);
      const introducedYear = playerDraftYear(child, currentYear);
      const parentType = playerGender(parent) === 'female' ? 'mother' : 'father';
      const childType = playerGender(child) === 'female' ? 'daughter' : 'son';
      const [linkedChild, linkedParent] = linkedPair(
        byId.get(child.internalId)!,
        byId.get(parent.internalId)!,
        parentType,
        childType,
        familyId,
        introducedYear,
      );
      byId.set(linkedChild.internalId, linkedChild);
      byId.set(linkedParent.internalId, linkedParent);
    }
  }
  return players.map(player => {
    const resolved = byId.get(player.internalId) ?? player;
    const seen = new Set<string>();
    const relatives = (resolved.relatives ?? []).filter(relative => {
      const key = `${relative.type}:${normalizeRelativeName(relative.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return relatives.length === (resolved.relatives ?? []).length ? resolved : { ...resolved, relatives };
  });
}

export function reconcilePlayerFamilyTiesForScope(players: NBAPlayer[], currentYear: number,
  scope: FamilyGenerationScope, suffixInferenceCutoffYear = currentYear): NBAPlayer[] {
  if (scope === 'fictional') return reconcilePlayerFamilyTies(players, currentYear, suffixInferenceCutoffYear);
  const scoped = players.filter(player => isInScope(player, scope));
  const reconciledById = new Map(
    reconcilePlayerFamilyTies(scoped, currentYear, suffixInferenceCutoffYear)
      .map(player => [player.internalId, player]),
  );
  return players.map(player => reconciledById.get(player.internalId) ?? player);
}

export function sanitizeHistoricalFutureFamilyTies(players: NBAPlayer[], branchStartYear: number,
  scope: FamilyGenerationScope = 'nba'): NBAPlayer[] {
  return players.map(player => {
    if (!isInScope(player, scope)) return player;
    const relatives = (player.relatives ?? []).filter(relative => {
      if (relative.familyId && relative.introducedYear) return true;
      const target = resolveFamilyRelative(relative, players);
      return !!target
        && isInScope(target, scope)
        && isPlayerVisibleInTimeline(player, branchStartYear)
        && isPlayerVisibleInTimeline(target, branchStartYear);
    });
    return relatives.length === (player.relatives ?? []).length ? player : { ...player, relatives };
  });
}

export function getFamilyLineageEventsForYear(players: NBAPlayer[], year: number,
  scope: FamilyGenerationScope = 'nba'): FamilyLineageEvent[] {
  const events = new Map<string, FamilyLineageEvent>();
  for (const player of players) {
    if (!isInScope(player, scope)) continue;
    for (const relative of player.relatives ?? []) {
      if (Number(relative.introducedYear ?? 0) !== year) continue;
      const target = resolveFamilyRelative(relative, players);
      if (!target || target.internalId === player.internalId) continue;
      if (!isInScope(target, scope)) continue;
      if (!isPlayerVisibleInTimeline(player, year) || !isPlayerVisibleInTimeline(target, year)) continue;
      const ids = [player.internalId, target.internalId].sort();
      const key = ids.join(':');
      if (events.has(key)) continue;
      const kind = relative.type === 'twin'
        ? 'twins'
        : ['father', 'mother', 'son', 'daughter'].includes(relative.type) ? 'parent_child' : 'siblings';
      const prospect = playerDraftYear(player, year) >= playerDraftYear(target, year) ? player : target;
      const anchor = prospect.internalId === player.internalId ? target : player;
      const relationLabel = kind === 'twins'
        ? 'twin'
        : kind === 'siblings'
          ? (playerGender(anchor) === 'female' ? 'sister' : 'brother')
          : (playerGender(anchor) === 'female' ? 'mother' : 'father');
      const familyId = relative.familyId ?? player.familyId ?? target.familyId ?? familyIdFor(anchor);
      events.set(key, eventForPair(kind, prospect, anchor, familyId, year, relationLabel));
    }
  }
  return [...events.values()];
}
