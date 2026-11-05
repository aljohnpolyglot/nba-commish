import type { GameState, HistoryEntry, NBAPlayer, NonNBATeam } from '../../types';
import type { CompetitionSeasonResolution } from '../competition/competitionResolver';
import { getTeamFullName } from '../../utils/teamNames';

type RelegationTeam = NonNBATeam & {
  euroDomesticRelegatedFrom?: string;
  euroDomesticRelegatedSeason?: number;
};

export interface EuroDomesticRelegationResult {
  teams: NonNBATeam[];
  participantTids: number[];
  history: HistoryEntry[];
}

export function applyEuroDomesticRelegation(input: {
  state: GameState;
  teams: NonNBATeam[];
  players: NBAPlayer[];
  resolution?: CompetitionSeasonResolution;
  nextSeason: number;
}): EuroDomesticRelegationResult {
  const competitionId = input.state.euroPrimaryCompetitionId;
  const spec = input.state.activeCompetitions?.find(competition => competition.id === competitionId);
  const seeded = competitionId ? input.state.euroCompetitionTeamTids?.[competitionId] ?? [] : [];
  if (!competitionId || !spec || !input.resolution || input.state.historicalEndesa) {
    return { teams: input.teams, participantTids: seeded, history: [] };
  }

  const current = [...new Set(seeded.length > 0 ? seeded : input.resolution.standings.map(row => row.tid))];
  const targetCount = Math.max(2, Number(spec.teamCount ?? current.length));
  const leagueStatus = spec.teamSelector.startsWith('league:') ? spec.teamSelector.slice('league:'.length) : null;
  if (!leagueStatus || current.length < 2) return { teams: input.teams, participantTids: current, history: [] };

  const rosterCounts = new Map<number, number>();
  for (const player of input.players) {
    if (player.tid < 0 || player.status === 'Retired') continue;
    rosterCounts.set(player.tid, (rosterCounts.get(player.tid) ?? 0) + 1);
  }
  const currentSet = new Set(current);
  const candidates = (input.teams as RelegationTeam[])
    .filter(team => team.league === leagueStatus && !currentSet.has(team.tid) && (rosterCounts.get(team.tid) ?? 0) >= 8)
    .sort((left, right) => (
      Number(right.tid === input.state.userTeamId) - Number(left.tid === input.state.userTeamId)
      || Number(left.euroDomesticRelegatedSeason ?? Number.MAX_SAFE_INTEGER) - Number(right.euroDomesticRelegatedSeason ?? Number.MAX_SAFE_INTEGER)
      || (rosterCounts.get(right.tid) ?? 0) - (rosterCounts.get(left.tid) ?? 0)
      || left.tid - right.tid
    ));

  const standingsBottom = [...input.resolution.standings]
    .sort((left, right) => right.seed - left.seed)
    .map(row => row.tid)
    .filter(tid => currentSet.has(tid));
  const vacancies = Math.max(0, targetCount - current.length);
  const replacementSlots = current.length >= targetCount ? Math.min(2, candidates.length, standingsBottom.length) : 0;
  const promotionCount = Math.min(candidates.length, vacancies + replacementSlots);
  const promoted = candidates.slice(0, promotionCount);
  const relegationCount = Math.max(0, current.length + promotionCount - targetCount);
  let relegatedTids = standingsBottom.slice(0, relegationCount);
  const userTid = input.state.gameMode === 'gm' ? input.state.userTeamId : null;
  if (userTid != null && currentSet.has(userTid) && standingsBottom.slice(0, 2).includes(userTid) && !relegatedTids.includes(userTid)) {
    relegatedTids = [...relegatedTids, userTid];
  }

  const promotedSet = new Set(promoted.map(team => team.tid));
  const relegatedSet = new Set(relegatedTids);
  const nextTids = current.filter(tid => !relegatedSet.has(tid));
  for (const team of promoted) if (!nextTids.includes(team.tid)) nextTids.push(team.tid);

  const teams = (input.teams as RelegationTeam[]).map(team => {
    if (promotedSet.has(team.tid)) {
      const { euroDomesticRelegatedFrom: _from, euroDomesticRelegatedSeason: _season, ...active } = team;
      return active as NonNBATeam;
    }
    if (!relegatedSet.has(team.tid)) return team;
    return {
      ...team,
      euroDomesticRelegatedFrom: competitionId,
      euroDomesticRelegatedSeason: input.nextSeason,
    };
  });
  const byTid = new Map(teams.map(team => [team.tid, team]));
  const history: HistoryEntry[] = [];
  const movementCount = Math.max(promoted.length, relegatedTids.length);
  for (let index = 0; index < movementCount; index += 1) {
    const promotedTeam = promoted[index];
    const relegatedTeam = byTid.get(relegatedTids[index]);
    const text = promotedTeam && relegatedTeam
      ? `${getTeamFullName(promotedTeam)} entered ${spec.displayName} as ${getTeamFullName(relegatedTeam)} left the top division.`
      : promotedTeam
        ? `${getTeamFullName(promotedTeam)} entered ${spec.displayName}.`
        : relegatedTeam
          ? `${getTeamFullName(relegatedTeam)} was relegated from ${spec.displayName} and remains available for club operations.`
          : '';
    if (text) history.push({
      text, date: input.state.date, type: 'League Event', league: 'euro',
      eventType: promotedTeam ? 'club-promotion' : 'club-relegation',
      teamIds: [promotedTeam?.tid, relegatedTeam?.tid].filter((tid): tid is number => tid != null),
      sourceIds: { competitionId },
    });
  }
  return { teams, participantTids: nextTids, history };
}
