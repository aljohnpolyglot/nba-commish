import { normalizeHistoricalNbaTeamAbbrev } from '../../../utils/historicalNbaTeamAbbrev';

const normalizeAbbrev = (value: unknown): string => normalizeHistoricalNbaTeamAbbrev(value) ?? '';

export function isFranchiseStatRow(
  row: { tid?: number; abbrev?: string; teamAbbrev?: string; tm?: string; TM?: string },
  teamId: number,
  acceptedTeamAbbrevs: ReadonlySet<string>,
): boolean {
  if (Number(row.tid) === teamId) return true;
  const abbrev = normalizeAbbrev(row.abbrev ?? row.teamAbbrev ?? row.tm ?? row.TM);
  return Boolean(abbrev) && [...acceptedTeamAbbrevs].some(candidate => normalizeAbbrev(candidate) === abbrev);
}

export function scoreFranchiseCareerProduction(totals: { pts: number; reb: number; ast: number }): number {
  return Math.max(0, totals.pts) * 0.0012
    + Math.max(0, totals.reb) * 0.0005
    + Math.max(0, totals.ast) * 0.00065;
}

export function combineFranchiseLegacyScore(legacyScore: number, productionScore: number): number {
  return Math.max(0, productionScore) + Math.max(0, legacyScore) * 0.3;
}
