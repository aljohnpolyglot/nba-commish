import { seasonLabelToEndYear } from '../utils/historicalTimeline';
import { competitionHistoryDisplayName } from './euroDomesticHistoryAdapters';
import type {
  CompetitionAllLeagueTeam,
  CompetitionHistoryAward,
  CompetitionSeason,
} from './euroleagueHistoryFetcher';

export interface SavedCompetitionHistoryRow {
  season?: number;
  championTid?: number | null;
  runnerUpTid?: number | null;
  championName?: string;
  runnerUpName?: string;
}

export interface SavedCompetitionAwardRow {
  season?: number;
  type?: string;
  name?: string;
  tid?: number;
  competitionId?: string;
  coachName?: string;
}

const cleanText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const savedSeasonLabel = (endYear: number): string => {
  const suffix = endYear % 100 === 0 ? String(endYear) : String(endYear).slice(-2).padStart(2, '0');
  return `${endYear - 1}–${suffix}`;
};

export function normalizeSavedCompetitionHistory(
  competitionId: string,
  branchSeason: number,
  rows: SavedCompetitionHistoryRow[],
  awards: SavedCompetitionAwardRow[],
  resolveTeamName: (tid: number | null | undefined) => string | undefined,
): CompetitionSeason[] {
  return rows
    .filter(row => Number(row.season) >= branchSeason && row.championTid != null)
    .map(row => {
      const season = Number(row.season);
      const seasonAwards = awards.filter(award =>
        Number(award.season) === season && award.competitionId === competitionId,
      );
      const allLeagueTeams = new Map<string, CompetitionAllLeagueTeam['players']>();
      const normalizedAwards: CompetitionHistoryAward[] = [];
      for (const award of seasonAwards) {
        const type = cleanText(award.type);
        const name = cleanText(award.coachName ?? award.name);
        if (!type || !name || type === 'Champion' || type === 'Runner Up') continue;
        const team = resolveTeamName(award.tid);
        if (/all[- ]?.*team|best five/i.test(type)) {
          allLeagueTeams.set(type, [...(allLeagueTeams.get(type) ?? []), { name, team }]);
        } else {
          normalizedAwards.push({
            type,
            name,
            team,
            role: award.coachName || /coach/i.test(type) ? 'coach' : 'player',
          });
        }
      }
      return {
        Season: savedSeasonLabel(season),
        League: competitionHistoryDisplayName(competitionId),
        Champions: resolveTeamName(row.championTid) ?? (cleanText(row.championName) || undefined),
        Runnersup: resolveTeamName(row.runnerUpTid) ?? (cleanText(row.runnerUpName) || undefined),
        Awards: normalizedAwards,
        All_League_Teams: [...allLeagueTeams].map(([name, players]) => ({ name, players })),
      };
    })
    .sort((left, right) =>
      (seasonLabelToEndYear(right.Season) ?? 0) - (seasonLabelToEndYear(left.Season) ?? 0),
    );
}
