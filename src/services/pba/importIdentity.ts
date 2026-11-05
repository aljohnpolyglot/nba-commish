import type { NBAPlayer } from '../../types';
import type { ZenGMBio } from '../../data/realPlayerDataFetcher';
import { getLastAttendedSchool } from '../../utils/educationUtils';
import { getPlayerNationalityCountries } from '../../utils/playerNationality';
import { isEligiblePlayerPortrait, mergePlayerCareer } from '../../utils/playerCareerMerge';
import { normalizePbaDraftPlayerName } from './pbaDraftArchive';
import { historicalPbaIdentityKey } from './historicalSeasonBuilder';
import { hasHistoricalPbaBiographyChronologyConflict } from './historicalSeasonBuilder';
import type { PbaMasterSource } from './historicalTypes';
import { hasMeaningfulSourceText } from './sourceIdentityValues';
import { sameCanonicalPlayerIdentity } from '../../utils/playerIdentity';

export function isExplicitHistoricalPbaImport(player: Partial<NBAPlayer>): boolean {
  return !!(
    (player as any).historicalPbaSource?.importTagged
    || (player as any).pbaImportSource
    || (player as any).pbaImportEvidence
  );
}

export function mergePbaImportReference(importPlayer: NBAPlayer, reference?: NBAPlayer): NBAPlayer {
  if (!reference) return importPlayer;
  const countries = getPlayerNationalityCountries(reference);
  const referencePortrait = isEligiblePlayerPortrait(reference.imgURL) ? reference.imgURL : undefined;
  const merged = mergePlayerCareer(importPlayer, reference, { preferHistoryPortrait: !!referencePortrait });
  return {
    ...merged,
    born: reference.born ?? merged.born,
    nationality: countries.length > 0 ? countries.join(' / ') : merged.nationality,
    age: reference.age ?? merged.age,
    college: hasMeaningfulSourceText(reference.college) ? reference.college : merged.college,
    draft: reference.draft ?? merged.draft,
    imgURL: referencePortrait ?? merged.imgURL,
  } as NBAPlayer;
}

type VerifiedPbaImportBio = ZenGMBio & { slug: string };

export function restorePbaImportReferenceBios(
  players: readonly NBAPlayer[],
  resolveReference: (player: NBAPlayer) => VerifiedPbaImportBio | null | undefined,
): NBAPlayer[] {
  return players.map(player => {
    if (!isExplicitHistoricalPbaImport(player) || player.historicalPbaSource?.biographyChronologyRejected) return player;
    const reference = resolveReference(player);
    if (!reference) return player;
    const lastAttended = getLastAttendedSchool(reference.college);
    const currentBref = player.sourceIds?.bref;
    const brefValues = new Set(
      (Array.isArray(currentBref) ? currentBref : currentBref ? [currentBref] : [])
        .map(value => String(value).trim())
        .filter(Boolean),
    );
    brefValues.add(reference.slug);
    return {
      ...player,
      college: hasMeaningfulSourceText(player.college) ? player.college : lastAttended ?? undefined,
      srID: player.srID || reference.slug,
      slug: player.slug || reference.slug,
      sourceIds: {
        ...player.sourceIds,
        bref: brefValues.size === 1 ? [...brefValues][0] : [...brefValues],
      },
    } as NBAPlayer;
  });
}

export function restorePbaImportSourceNationalities(
  players: readonly NBAPlayer[],
  source: PbaMasterSource,
): NBAPlayer[] {
  const sourceByIdentity = new Map(source.players.map(player => [historicalPbaIdentityKey(player), player]));
  return players.map(player => {
    if (!isExplicitHistoricalPbaImport(player) || player.historicalPbaSource?.biographyChronologyRejected) return player;
    const identityKey = player.historicalPbaSource?.identityKey;
    if (!identityKey) return player;
    const sourcePlayer = sourceByIdentity.get(identityKey);
    if (!sourcePlayer) return player;
    const countries = getPlayerNationalityCountries(sourcePlayer);
    if (countries.length === 0) return player;
    const nationality = countries.join(' / ');
    const preservesOtherLeagueBirthplace = !!player.historicalEndesaSource
      && hasMeaningfulSourceText(player.born?.loc);
    return {
      ...player,
      nationality,
      born: {
        ...player.born,
        ...(preservesOtherLeagueBirthplace ? {} : { loc: nationality }),
      },
    };
  });
}

export function restorePbaImportReferenceNationalities(
  players: readonly NBAPlayer[],
  resolveReference: (player: NBAPlayer) => Pick<NBAPlayer, 'nationality' | 'born'> | null | undefined,
): NBAPlayer[] {
  return players.map(player => {
    if (!isExplicitHistoricalPbaImport(player) || player.historicalPbaSource?.biographyChronologyRejected) return player;
    const currentCountries = getPlayerNationalityCountries(player);
    const needsReference = currentCountries.length === 0
      || (currentCountries.length === 1 && currentCountries[0] === 'Philippines');
    if (!needsReference) return player;
    const reference = resolveReference(player);
    if (!reference) return player;
    const countries = getPlayerNationalityCountries(reference);
    if (countries.length === 0 || (countries.length === 1 && countries[0] === 'Philippines')) return player;
    const nationality = countries.join(' / ');
    const preservesOtherLeagueBirthplace = !!player.historicalEndesaSource
      && hasMeaningfulSourceText(player.born?.loc);
    return {
      ...player,
      nationality,
      born: {
        ...player.born,
        ...(preservesOtherLeagueBirthplace ? {} : { loc: nationality }),
      },
    };
  });
}

function candidateScore(player: NBAPlayer): number {
  return (player.tid >= 0 ? 100_000 : 0)
    + ((player.stats ?? []).reduce((sum, row) => sum + Number(row?.gp ?? 0), 0) * 10)
    + (player.stats?.length ?? 0)
    + (player.awards?.length ?? 0);
}

function hasCompatibleImportIdentity(importPlayer: NBAPlayer, candidate: NBAPlayer): boolean {
  if (sameCanonicalPlayerIdentity(importPlayer, candidate)) return true;
  const importBirthYear = Number(importPlayer.born?.year);
  const candidateBirthYear = Number(candidate.born?.year);
  if (!Number.isInteger(importBirthYear) || importBirthYear <= 0 || importBirthYear !== candidateBirthYear) return false;
  const importDraftYear = Number(importPlayer.draft?.year);
  const candidateDraftYear = Number(candidate.draft?.year);
  return !Number.isInteger(importDraftYear)
    || importDraftYear <= 0
    || !Number.isInteger(candidateDraftYear)
    || candidateDraftYear <= 0
    || importDraftYear === candidateDraftYear;
}

export function sanitizePbaImportBiographyClaims(
  players: readonly NBAPlayer[],
  source: PbaMasterSource,
): NBAPlayer[] {
  const rejectedKeys = new Set(source.players
    .filter(hasHistoricalPbaBiographyChronologyConflict)
    .map(historicalPbaIdentityKey));
  if (rejectedKeys.size === 0) return [...players];
  return players.map(player => {
    const identityKey = player.historicalPbaSource?.identityKey;
    if (!identityKey || !isExplicitHistoricalPbaImport(player) || !rejectedKeys.has(identityKey)) return player;
    const sourceIds = { ...(player.sourceIds ?? {}) };
    delete sourceIds.bref;
    return {
      ...player,
      born: undefined,
      age: undefined,
      nationality: undefined,
      hgt: undefined,
      weight: undefined,
      college: undefined,
      imgURL: undefined,
      srID: undefined,
      slug: undefined,
      sourceIds,
      historicalPbaSource: {
        ...player.historicalPbaSource,
        biographyChronologyRejected: true,
      },
    };
  });
}

export function mergeDuplicatePbaImportIdentities(
  players: readonly NBAPlayer[],
  uiMode?: string,
): NBAPlayer[] {
  if (uiMode === 'pba_isolated') return [...players];
  const byName = new Map<string, number[]>();
  players.forEach((player, index) => {
    const key = normalizePbaDraftPlayerName(player.name);
    if (!key) return;
    byName.set(key, [...(byName.get(key) ?? []), index]);
  });
  const removed = new Set<number>();
  const replacements = new Map<number, NBAPlayer>();
  players.forEach((player, importIndex) => {
    if (!isExplicitHistoricalPbaImport(player)) return;
    const candidates = (byName.get(normalizePbaDraftPlayerName(player.name)) ?? [])
      .filter(index => index !== importIndex
        && !isExplicitHistoricalPbaImport(players[index])
        && hasCompatibleImportIdentity(player, players[index]))
      .sort((left, right) => candidateScore(players[right]) - candidateScore(players[left]));
    const canonicalIndex = candidates[0];
    if (canonicalIndex == null) return;
    const canonical = replacements.get(canonicalIndex) ?? players[canonicalIndex];
    replacements.set(canonicalIndex, mergePlayerCareer(canonical, player) as NBAPlayer);
    removed.add(importIndex);
  });
  if (removed.size === 0) return [...players];
  return players
    .filter((_, index) => !removed.has(index))
    .map((player, index) => replacements.get(index) ?? player);
}
