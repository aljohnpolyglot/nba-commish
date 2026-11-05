import { getConferenceStartIso, getPbaCalendarPosition, type PbaConference } from './conferenceTransition';
import { getLatestPlayablePbaSeason, isPlayablePbaSeason } from './historyConfig';
import type { PbaMasterSource } from './historicalTypes';

const alignDateToSeason = (date: string, sourceSeason: number): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return getConferenceStartIso('philippine', sourceSeason);
  const position = getPbaCalendarPosition(date);
  if (position.seasonYear === sourceSeason) return date;
  parsed.setUTCFullYear(parsed.getUTCFullYear() + sourceSeason - position.seasonYear);
  const aligned = parsed.toISOString().slice(0, 10);
  return getPbaCalendarPosition(aligned).seasonYear === sourceSeason
    ? aligned
    : getConferenceStartIso('philippine', sourceSeason);
};

const PBA_START_CONFERENCES: PbaConference[] = ['philippine', 'commissioners', 'governors'];

const snapToConferenceStart = (date: string, sourceSeason: number): string => {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const choices = PBA_START_CONFERENCES.map(conference => getConferenceStartIso(conference, sourceSeason));
  if (!Number.isFinite(target)) return choices[0];
  return choices.reduce((closest, choice) => {
    const closestDistance = Math.abs(new Date(`${closest}T00:00:00Z`).getTime() - target);
    const choiceDistance = Math.abs(new Date(`${choice}T00:00:00Z`).getTime() - target);
    return choiceDistance < closestDistance ? choice : closest;
  });
};

export function resolvePbaStartupSelection(
  source: PbaMasterSource,
  requestedSourceSeason?: number,
  requestedStartDate?: string,
): { sourceSeason: number; startDate: string } {
  const latest = getLatestPlayablePbaSeason(source);
  const sourceSeason = requestedSourceSeason != null && isPlayablePbaSeason(requestedSourceSeason, source)
    ? requestedSourceSeason
    : latest;
  return {
    sourceSeason,
    startDate: snapToConferenceStart(
      alignDateToSeason(
        requestedStartDate ?? getConferenceStartIso('philippine', sourceSeason),
        sourceSeason,
      ),
      sourceSeason,
    ),
  };
}
