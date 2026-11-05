import type { NBAPlayer } from '../../types';
import { PRE_DRAFT_DRIVING_DUNK } from '../../data/dunkData';
import { getLastAttendedSchool } from '../../utils/educationUtils';
import { getPBARosterEconomyConfig } from '../externalRosterService.shared';
import {
  findPbaDraftRowsByYear,
  normalizePbaDraftPlayerName,
} from './pbaDraftArchive';
import {
  cleanHistoricalPbaPlayerName,
  historicalPbaIdentityKey,
  isHistoricalPbaImport,
  mapHistoricalPbaPlayer,
} from './historicalSeasonBuilder';
import type { PbaMasterSource, PbaSourcePlayer } from './historicalTypes';
import { getPbaSourceDraftYear, getUpcomingPbaDraftYears } from './draftCalendar';

type RealPbaDraftCandidate = {
  college: string;
  country: string;
  name: string;
  pos: string;
  source: PbaSourcePlayer;
  sourceKind: 'archive' | 'roster-source';
};

export type PbaRealDraftMaterialization = {
  addedByYear: Record<number, number>;
  players: NBAPlayer[];
  realByYear: Record<number, number>;
};

function candidateRows(source: PbaMasterSource, draftYear: number): RealPbaDraftCandidate[] {
  const sourceDraftYear = getPbaSourceDraftYear(draftYear);
  const sourceRows = source.players.filter(player => (
    Number(player.draft?.year) === sourceDraftYear
    && !isHistoricalPbaImport(player)
    && (player.ratings ?? []).some(row => Number(row.season) === sourceDraftYear)
  ));
  const sourceByName = new Map(sourceRows.map(player => [
    normalizePbaDraftPlayerName(cleanHistoricalPbaPlayerName(String(player.name ?? ''))),
    player,
  ]));
  const archiveRows = findPbaDraftRowsByYear(draftYear);
  const archiveCandidates = archiveRows.flatMap(row => {
    const matchedSource = sourceByName.get(row.normalizedPlayerName);
    if (!matchedSource || /\(Import\)\s*$/i.test(row.playerName) || isHistoricalPbaImport(matchedSource)) {
      return [];
    }
    return [{
        name: row.playerName,
        pos: row.pos,
        country: row.countryOfBirth,
        college: row.schoolClubTeam,
        source: matchedSource,
        sourceKind: 'archive' as const,
      }];
  });
  const archiveNames = new Set(archiveCandidates.map(candidate => (
    normalizePbaDraftPlayerName(candidate.name)
  )));
  const sourceCandidates = sourceRows
    .filter(player => !archiveNames.has(normalizePbaDraftPlayerName(cleanHistoricalPbaPlayerName(String(player.name ?? '')))))
    .map(player => ({
        name: cleanHistoricalPbaPlayerName(String(player.name ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`)),
        pos: String(player.pos ?? 'GF'),
        country: String(player.born?.loc ?? 'Philippines'),
        college: String(player.college ?? 'Philippines'),
        source: player,
        sourceKind: 'roster-source' as const,
      }));
  const candidates = [...archiveCandidates, ...sourceCandidates];
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = normalizePbaDraftPlayerName(candidate.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasBranchDraftTransaction(player: NBAPlayer, draftYear?: number): boolean {
  return ((player as any).transactions ?? []).some((transaction: any) => (
    transaction?.type === 'draft'
    && Number(transaction?.pickNum) > 0
    && (draftYear === undefined || Number(transaction?.season) === draftYear)
  ));
}

function realProspect(
  candidate: RealPbaDraftCandidate,
  mappedSource: NBAPlayer,
  existing: NBAPlayer | undefined,
  draftYear: number,
): NBAPlayer {
  const source = candidate.source;
  const rawSourceCountry = String(candidate.country || source?.born?.loc || '').trim();
  const sourceCountry = !rawSourceCountry || ['-', '—', '0', 'n/a', 'na', 'unknown'].includes(rawSourceCountry.toLowerCase())
    ? 'Philippines'
    : rawSourceCountry;
  const nationality = sourceCountry.toLowerCase().includes('philippines')
    ? sourceCountry
    : `${sourceCountry} / Philippines`;
  const sourceHeight = Number(source?.hgt);
  const sourceWeight = Number(source?.weight);
  const sourceBirthYear = Number(source?.born?.year);
  const validSourceBirthYear = Number.isInteger(sourceBirthYear) && sourceBirthYear >= 1900 && sourceBirthYear <= draftYear - 15;
  const rawBirthLocation = String(source?.born?.loc ?? '').trim();
  const birthLocation = !rawBirthLocation || ['-', '—', '0', 'n/a', 'na', 'unknown'].includes(rawBirthLocation.toLowerCase())
    ? sourceCountry
    : rawBirthLocation;
  const words = candidate.name.trim().split(/\s+/);
  const firstName = words.slice(0, -1).join(' ') || words[0];
  const lastName = words.length > 1 ? words[words.length - 1] : '';
  const sourceIdentityKey = source ? historicalPbaIdentityKey(source) : undefined;
  const preDraftDunk = PRE_DRAFT_DRIVING_DUNK[candidate.name];
  return {
    ...mappedSource,
    internalId: existing?.internalId ?? `pba-draft-source:${draftYear}:${normalizePbaDraftPlayerName(candidate.name)}`,
    name: candidate.name,
    firstName,
    lastName,
    tid: -2,
    status: 'Draft Prospect',
    pos: source?.pos ?? candidate.pos ?? mappedSource.pos,
    college: getLastAttendedSchool(source?.college ?? candidate.college ?? mappedSource.college) ?? undefined,
    hgt: Number.isFinite(sourceHeight) && sourceHeight >= 48 && sourceHeight <= 100 ? sourceHeight : mappedSource.hgt,
    weight: Number.isFinite(sourceWeight) && sourceWeight >= 80 && sourceWeight <= 500 ? sourceWeight : mappedSource.weight,
    born: validSourceBirthYear
      ? { year: sourceBirthYear, loc: birthLocation }
      : mappedSource.born,
    imgURL: mappedSource.imgURL,
    face: mappedSource.face,
    nationality,
    ratings: mappedSource.ratings,
    overallRating: mappedSource.overallRating,
    potential: mappedSource.potential,
    drivingDunk: preDraftDunk?.draftYear === draftYear ? preDraftDunk.rating : mappedSource.drivingDunk,
    stats: [],
    awards: [],
    contract: undefined,
    contractYears: [],
    injury: { type: 'Healthy', gamesRemaining: 0 },
    draft: { year: draftYear, round: 0, pick: 0, tid: -1, originalTid: -1 },
    historicalPbaSource: existing?.historicalPbaSource ?? mappedSource.historicalPbaSource,
    pbaDraftSourceIdentityKey: sourceIdentityKey ?? (existing as any)?.pbaDraftSourceIdentityKey,
    pbaLocalEligible: true,
    historicalPbaDraftProspect: true,
    pbaDraftSource: candidate.sourceKind,
    pbaDraftSourceYear: draftYear,
    pbaDraftRatingsSource: 'historical-pba-roster',
  } as NBAPlayer;
}

export function materializeRealPbaDraftClasses(
  players: NBAPlayer[],
  source: PbaMasterSource,
  currentYear: number,
  _eligibilityRule?: string,
  horizonYears = 4,
): PbaRealDraftMaterialization {
  const nextPlayers = [...players];
  const economy = getPBARosterEconomyConfig();
  const realByYear: Record<number, number> = {};
  const addedByYear: Record<number, number> = {};

  for (const draftYear of getUpcomingPbaDraftYears(currentYear, horizonYears)) {
    const candidates = candidateRows(source, draftYear);
    realByYear[draftYear] = candidates.length;
    if (candidates.length === 0) continue;
    let added = 0;
    candidates.forEach(candidate => {
      const normalizedName = normalizePbaDraftPlayerName(candidate.name);
      const existingIndex = nextPlayers.findIndex(player => normalizePbaDraftPlayerName(player.name) === normalizedName);
      const existing = existingIndex >= 0 ? nextPlayers[existingIndex] : undefined;
      if (existing && hasBranchDraftTransaction(existing)) return;
      const mappedSource = mapHistoricalPbaPlayer(candidate.source, getPbaSourceDraftYear(draftYear), economy, source);
      if (!mappedSource) return;
      const prospect = realProspect(candidate, mappedSource, existing, draftYear);
      if (existingIndex >= 0) nextPlayers[existingIndex] = prospect;
      else {
        nextPlayers.push(prospect);
        added += 1;
      }
    });
    addedByYear[draftYear] = added;
  }

  return { players: nextPlayers, realByYear, addedByYear };
}
