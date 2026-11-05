import {
  getHistoricalCompletedSeasonCutoff,
  isHistoricalNbaWhatIfTimeline,
} from '../../utils/historicalTimeline';

interface HOFHistoryWindowInput {
  currentYear?: number;
  leagueType?: string;
  moddedLeagueBase?: string;
  nbaStartYear?: number;
  seasonComplete?: boolean;
}

export function isHistoricalNbaWhatIfSave(input: HOFHistoryWindowInput): boolean {
  return isHistoricalNbaWhatIfTimeline(input);
}

export function getHistoricalNbaCompletedSeasonCutoff(input: HOFHistoryWindowInput): number | undefined {
  const cutoff = getHistoricalCompletedSeasonCutoff(input);
  const currentYear = Number(input.currentYear ?? 0);
  return cutoff !== undefined && input.seasonComplete === true && currentYear > 0
    ? Math.max(cutoff, currentYear)
    : cutoff;
}

export function getHistoricalNbaBranchSeasonCutoff(input: HOFHistoryWindowInput): number | undefined {
  if (!isHistoricalNbaWhatIfSave(input)) return undefined;
  const nbaStartYear = Number(input.nbaStartYear ?? 0);
  return nbaStartYear > 0 ? nbaStartYear : undefined;
}

export function getExternalHOFMaxInductionYear(input: HOFHistoryWindowInput): number | undefined {
  const branchCutoff = getHistoricalNbaBranchSeasonCutoff(input);
  if (branchCutoff !== undefined) return branchCutoff;
  const currentYear = Number(input.currentYear ?? 0);
  return currentYear > 0 ? currentYear : undefined;
}

type ExternalHOFInducteeLike = {
  name?: string;
  inductionYear?: number;
};

export function isExternalHOFInductionAllowed(
  inductee: ExternalHOFInducteeLike,
  input: HOFHistoryWindowInput,
): boolean {
  if (!isHistoricalNbaWhatIfSave(input)) return true;
  const inductionYear = Number(inductee.inductionYear ?? 0);
  const branchCutoff = getHistoricalNbaBranchSeasonCutoff(input);
  return inductionYear > 0 && branchCutoff !== undefined && inductionYear <= branchCutoff;
}

export function filterExternalHOFInducteesForTimeline<T extends ExternalHOFInducteeLike>(
  inductees: readonly T[],
  input: HOFHistoryWindowInput,
): T[] {
  return inductees.filter(inductee => isExternalHOFInductionAllowed(inductee, input));
}
