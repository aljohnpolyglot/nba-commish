import { fetchWorkerNbaSeasonHistoriesThrough } from '../../data/basketballDataWorkerHistory';
import type { BRefSeasonData } from '../../data/brefFetcher';
import type { HistoricalAward, NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { buildHistoricalStaffCandidatesForTeam } from '../staff/historicalNbaCoaches';
import { resolveHistoricalNbaExecutiveAwardIdentity } from '../staff/historicalNbaExecutives';

export const WORKER_NBA_STAFF_AWARD_SOURCE = 'basketball-data-worker:wikipedia';

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function namedRecipients(season: BRefSeasonData, awardName: string): string[] {
  const names = season.otherAwards
    .filter(award => normalize(award.awardName) === normalize(awardName))
    .flatMap(award => award.recipients.map(recipient => recipient.name));
  if (awardName === 'Coach of the Year' && season.coy?.name) names.push(season.coy.name);
  return [...new Set(names.map(name => name.trim()).filter(Boolean))];
}

function buildCoachAward(season: BRefSeasonData, sourceName: string, teams: NBATeam[]): HistoricalAward | null {
  const nameKey = normalize(sourceName);
  for (const team of teams) {
    const coach = buildHistoricalStaffCandidatesForTeam(team, season.year)
      .find(candidate => candidate.role === 'Head Coach' && normalize(candidate.name) === nameKey);
    if (!coach) continue;
    return {
      season: season.year,
      type: 'Coach of the Year',
      name: coach.name,
      tid: team.id,
      team: getTeamFullName(team),
      uiMode: 'nba',
      role: 'coach',
      coachName: coach.name,
      source: WORKER_NBA_STAFF_AWARD_SOURCE,
    };
  }
  return null;
}

function buildExecutiveAward(season: BRefSeasonData, sourceName: string, teams: NBATeam[]): HistoricalAward | null {
  const executive = resolveHistoricalNbaExecutiveAwardIdentity(sourceName, season.year, teams);
  if (!executive) return null;
  return {
    season: season.year,
    type: 'Executive of the Year',
    name: executive.name,
    tid: executive.team.id,
    team: getTeamFullName(executive.team),
    uiMode: 'nba',
    role: 'executive',
    executiveName: executive.name,
    executiveId: executive.executiveId,
    source: WORKER_NBA_STAFF_AWARD_SOURCE,
  };
}

export function buildWorkerNbaStaffAwardRows(
  seasons: BRefSeasonData[],
  teams: NBATeam[],
): HistoricalAward[] {
  const nbaTeams = teams.filter(team => team.id >= 0 && team.id < 100);
  return seasons.flatMap(season => [
    ...namedRecipients(season, 'Coach of the Year')
      .map(name => buildCoachAward(season, name, nbaTeams)),
    ...namedRecipients(season, 'Executive of the Year')
      .map(name => buildExecutiveAward(season, name, nbaTeams)),
  ]).filter((award): award is HistoricalAward => award !== null);
}

export async function buildWorkerNbaStaffAwardsThrough(
  teams: NBATeam[],
  completedSeasonCutoff: number,
): Promise<HistoricalAward[]> {
  const seasons = await fetchWorkerNbaSeasonHistoriesThrough(completedSeasonCutoff);
  return buildWorkerNbaStaffAwardRows(seasons, teams);
}
