import type { Game, GameResult, GameState, NBATeam, NonNBATeam, PlayerGameStats } from '../../types';
import { resolveAnyTeam } from '../../utils/teamLookup';

type FranchiseRecord = NonNullable<GameState['simFranchiseRecords']>[number];
const RECORDS_PER_CATEGORY = 10;

const STAT_DEFINITIONS: Array<{
  category: string;
  key: string;
  value: (stats: PlayerGameStats) => number;
}> = [
  { category: 'Points', key: 'PTS', value: stats => stats.pts ?? 0 },
  { category: 'Rebounds', key: 'REB', value: stats => stats.reb ?? ((stats.orb ?? 0) + (stats.drb ?? 0)) },
  { category: 'Assists', key: 'AST', value: stats => stats.ast ?? 0 },
  { category: 'Steals', key: 'STL', value: stats => stats.stl ?? 0 },
  { category: 'Blocks', key: 'BLK', value: stats => stats.blk ?? 0 },
  { category: 'Three-Pointers Made', key: '3PM', value: stats => stats.threePm ?? 0 },
  { category: 'Field Goals Made', key: 'FGM', value: stats => stats.fgm ?? 0 },
  { category: 'Free Throws Made', key: 'FTM', value: stats => stats.ftm ?? 0 },
  { category: 'Turnovers', key: 'TOV', value: stats => stats.tov ?? 0 },
  { category: 'Offensive Rebounds', key: 'OREB', value: stats => stats.orb ?? 0 },
  { category: 'Defensive Rebounds', key: 'DREB', value: stats => stats.drb ?? 0 },
];

export function mergeFranchiseRecords(input: {
  existing: FranchiseRecord[];
  results: GameResult[];
  schedule: Game[];
  teams: NBATeam[];
  nonNBATeams: NonNBATeam[];
  fallbackDate: string;
  fallbackSeason: number;
}): FranchiseRecord[] {
  const records = [...input.existing];
  const scheduleByGameId = new Map(input.schedule.map(game => [game.gid, game]));

  for (const result of input.results) {
    if (result.homeTeamId < 0 || result.awayTeamId < 0) continue;
    const scheduledGame = scheduleByGameId.get(result.gameId);
    const isPlayoff = result.isPlayoff === true || scheduledGame?.isPlayoff === true;
    const gameDate = result.date || input.fallbackDate;
    const competitionId = result.competitionId ?? scheduledGame?.competitionId;
    const season = result.season ?? input.fallbackSeason;
    const sides = [
      { stats: result.homeStats, teamId: result.homeTeamId, opponentId: result.awayTeamId },
      { stats: result.awayStats, teamId: result.awayTeamId, opponentId: result.homeTeamId },
    ];

    for (const side of sides) {
      const team = resolveAnyTeam(side.teamId, input.teams, input.nonNBATeams);
      const opponent = resolveAnyTeam(side.opponentId, input.teams, input.nonNBATeams);
      if (!team) continue;
      for (const stats of side.stats ?? []) {
        for (const definition of STAT_DEFINITIONS) {
          const value = definition.value(stats);
          if (value <= 0) continue;
          const playerKey = String(stats.playerId ?? stats.name ?? '').trim().toLowerCase();
          const index = records.findIndex(record => (
            record.tid === side.teamId
            && record.category === definition.category
            && record.isPlayoff === isPlayoff
            && String(record.playerId ?? record.NAME ?? '').trim().toLowerCase() === playerKey
          ));
          if (index >= 0 && value <= records[index].value) continue;
          const record: FranchiseRecord = {
            tid: side.teamId,
            category: definition.category,
            isPlayoff,
            value,
            NAME: stats.name,
            DATE: gameDate,
            OPP: opponent?.abbrev ?? '',
            TM: team.abbrev ?? '',
            SearchCategory: definition.category,
            playerId: stats.playerId,
            competitionId,
            season,
            [definition.key]: String(value),
          };
          if (index >= 0) records[index] = record;
          else records.push(record);
        }
      }
    }
  }

  const grouped = new Map<string, FranchiseRecord[]>();
  for (const record of records) {
    const key = `${record.tid}:${record.category}:${record.isPlayoff ? 1 : 0}`;
    const group = grouped.get(key) ?? [];
    group.push(record);
    grouped.set(key, group);
  }
  return [...grouped.values()].flatMap(group => group
    .sort((left, right) => right.value - left.value || String(right.DATE).localeCompare(String(left.DATE)))
    .slice(0, RECORDS_PER_CATEGORY));
}
