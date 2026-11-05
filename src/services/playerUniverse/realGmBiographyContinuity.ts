import type { NBAPlayer } from '../../types';
import type { RealGmBiographyContinuityRecord } from '../../data/realGmBiographyContinuity';
import { getRealGmBiographyContinuityRecord } from '../../data/realGmBiographyContinuity';
import {
  getPlayerIdentityEvidenceTokens,
  resolveCanonicalPersonId,
} from '../../utils/playerIdentity';

export interface CanonicalBiographySource {
  internalId?: string;
  personId?: string;
  sourceIds?: NBAPlayer['sourceIds'];
  srID?: string;
  slug?: string;
  nbaId?: string | number;
  name?: string;
  profileUrl?: string;
  provider?: string;
  position?: string;
  heightInches?: number;
  weightPounds?: number;
  birthDate?: string;
  birthplace?: string;
  hometown?: string;
  nationality?: string;
  college?: string;
  highSchool?: string;
  preDraftTeam?: string;
  draftStatus?: string;
  agent?: string;
}

function parseBirthDate(value: string | undefined): NBAPlayer['born'] | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    loc: '',
  };
}

export function hydrateRealGmBiography(
  player: NBAPlayer,
  record: RealGmBiographyContinuityRecord | undefined,
): NBAPlayer {
  if (!record) return player;
  return projectCanonicalPlayerBiography(player, [{
    personId: `person:realgm:${record.sourceId}`,
    sourceIds: { realgm: record.sourceId },
    name: record.name,
    profileUrl: record.profileUrl,
    provider: 'RealGM',
    position: record.position,
    heightInches: record.heightInches,
    weightPounds: record.weightPounds,
    birthDate: record.birthDate,
    hometown: record.hometown,
    nationality: record.nationality,
    college: record.college,
    highSchool: record.highSchool,
    preDraftTeam: record.preDraftTeam,
    draftStatus: record.draftStatus,
    agent: record.agent,
  }]);
}

const sourceAsIdentityPlayer = (source: CanonicalBiographySource): NBAPlayer => ({
  internalId: source.internalId ?? '',
  personId: source.personId,
  sourceIds: source.sourceIds,
  srID: source.srID,
  slug: source.slug,
  nbaId: source.nbaId,
  name: source.name ?? '',
  tid: -1,
  ratings: [],
} as NBAPlayer);

const hasStrongBiographyIdentity = (player: NBAPlayer, source: CanonicalBiographySource): boolean => {
  const sourcePlayer = sourceAsIdentityPlayer(source);
  const playerInternalId = String(player.internalId ?? '').trim().toLowerCase();
  const sourceInternalId = String(source.internalId ?? '').trim().toLowerCase();
  if (playerInternalId && sourceInternalId && playerInternalId === sourceInternalId) return true;

  const sourceEvidence = getPlayerIdentityEvidenceTokens(sourcePlayer);
  const sourceTokens = new Set(sourceEvidence);
  if (getPlayerIdentityEvidenceTokens(player).some(token => sourceTokens.has(token))) return true;

  const playerPersonId = resolveCanonicalPersonId(player);
  const sourcePersonId = resolveCanonicalPersonId(sourcePlayer);
  return sourceEvidence.length > 0
    && !playerPersonId.startsWith('person:runtime:')
    && !sourcePersonId.startsWith('person:runtime:')
    && playerPersonId === sourcePersonId;
};

const isUserOwned = (player: NBAPlayer, field: keyof NonNullable<NBAPlayer['biographyFieldAuthority']>): boolean => {
  const authority = player.biographyFieldAuthority?.[field];
  return authority === 'user' || authority === 'custom';
};

const sourceIdForBiography = (source: CanonicalBiographySource): string => {
  const entries = Object.entries(source.sourceIds ?? {});
  const preferred = entries.find(([, value]) => String([value].flat()[0] ?? '').trim());
  if (preferred) return String([preferred[1]].flat()[0]);
  return String(source.personId ?? source.internalId ?? '').replace(/^person:/i, '');
};

const projectSource = (player: NBAPlayer, source: CanonicalBiographySource): NBAPlayer => {
  const parsedBirth = parseBirthDate(source.birthDate);
  const born = parsedBirth && !isUserOwned(player, 'born')
    ? { ...parsedBirth, loc: source.birthplace ?? source.nationality ?? player.born?.loc ?? '' }
    : player.born;
  const sourceCollege = String(source.college ?? '').trim();
  const hasAuthoritativeCollege = sourceCollege.length > 0 && !/^(?:unknown|none|n\/a|—|-)$/i.test(sourceCollege);
  const college = hasAuthoritativeCollege && !isUserOwned(player, 'college')
    ? sourceCollege
    : player.college;
  const sourceId = sourceIdForBiography(source);
  const sourceBiography = sourceId || source.profileUrl
    ? {
        provider: source.provider ?? 'Canonical Source',
        sourceId,
        profileUrl: source.profileUrl ?? '',
        ...(source.hometown != null ? { hometown: source.hometown } : {}),
        ...(source.highSchool != null ? { highSchool: source.highSchool } : {}),
        ...(source.preDraftTeam != null ? { preDraftTeam: source.preDraftTeam } : {}),
        ...(source.draftStatus != null ? { draftStatus: source.draftStatus } : {}),
        ...(source.agent != null ? { agent: source.agent } : {}),
      }
    : player.sourceBiography;
  const next: NBAPlayer = {
    ...player,
    pos: source.position != null && !isUserOwned(player, 'pos') ? source.position : player.pos,
    hgt: source.heightInches != null && !isUserOwned(player, 'hgt') ? source.heightInches : player.hgt,
    weight: source.weightPounds != null && !isUserOwned(player, 'weight') ? source.weightPounds : player.weight,
    born,
    nationality: source.nationality != null && !isUserOwned(player, 'nationality')
      ? source.nationality
      : player.nationality,
    college,
    sourceBiography,
  };
  const changed = next.pos !== player.pos
    || next.hgt !== player.hgt
    || next.weight !== player.weight
    || next.nationality !== player.nationality
    || next.college !== player.college
    || JSON.stringify(next.born) !== JSON.stringify(player.born)
    || JSON.stringify(next.sourceBiography) !== JSON.stringify(player.sourceBiography);
  return changed ? next : player;
};

const getDefaultBiographySources = (player: NBAPlayer): CanonicalBiographySource[] => {
  const ids = getPlayerIdentityEvidenceTokens(player)
    .filter(token => token.startsWith('realgm:'))
    .map(token => token.slice('realgm:'.length));
  return ids
    .map(getRealGmBiographyContinuityRecord)
    .filter((record): record is RealGmBiographyContinuityRecord => !!record)
    .map(record => ({
      personId: `person:realgm:${record.sourceId}`,
      sourceIds: { realgm: record.sourceId },
      name: record.name,
      profileUrl: record.profileUrl,
      provider: 'RealGM',
      position: record.position,
      heightInches: record.heightInches,
      weightPounds: record.weightPounds,
      birthDate: record.birthDate,
      hometown: record.hometown,
      nationality: record.nationality,
      college: record.college,
      highSchool: record.highSchool,
      preDraftTeam: record.preDraftTeam,
      draftStatus: record.draftStatus,
      agent: record.agent,
    }));
}

/** Read-only biography projection; strong identity is required and gameplay fields are never copied. */
export function projectCanonicalPlayerBiography(
  player: NBAPlayer,
  sources: readonly CanonicalBiographySource[] = getDefaultBiographySources(player),
): NBAPlayer {
  const source = sources.find(candidate => hasStrongBiographyIdentity(player, candidate));
  return source ? projectSource(player, source) : player;
}

export const hydrateCanonicalSourceBiography = projectCanonicalPlayerBiography;
