import type { Game, GameState, HistoricalAward, SeasonHistoryEntry } from '../../types';
import { sortByStandings } from '../../utils/standingsUtils';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveHeadCoachMember } from '../staff/coachNameResolver';
import { appendCoachAchievementToTeam } from '../staff/coachAchievements';

const CHAMPIONSHIP_AWARD_TYPES = new Set(['Champion', 'Won Championship', 'NBA Champion']);

const isMainLeagueRegularSeasonGame = (game: Game, teamIds: Set<number>): boolean => (
  teamIds.has(game.homeTid)
  && teamIds.has(game.awayTid)
  && !game.isPreseason
  && !game.isPlayoff
  && !game.isPlayIn
  && !game.isAllStar
  && !game.isRisingStars
  && !game.isCelebrityGame
  && !game.isExhibition
  && !game.excludeFromRecord
  && !game.competitionId
);

export const resolveStandingsChampion = (state: GameState): GameState => {
  if (
    state.leagueStats.playoffsEnabled !== false
    || state.leagueStats.uiMode === 'euro_isolated'
    || state.leagueStats.uiMode === 'pba_isolated'
    || state.playoffs?.bracketComplete
  ) return state;

  const season = state.leagueStats.year;
  const priorChampion = (state.historicalAwards ?? []).some(award => (
    award.season === season && award.type === 'Champion' && !award.competitionId
  )) || (state.seasonHistory ?? []).some(entry => entry.year === season && entry.championTid != null);
  if (priorChampion) return state;

  const leagueTeams = state.teams.filter(team => team.id >= 0 && team.id < 100);
  if (leagueTeams.length === 0 || !leagueTeams.some(team => team.wins + team.losses > 0)) return state;

  const teamIds = new Set(leagueTeams.map(team => team.id));
  if (state.schedule.some(game => !game.played && isMainLeagueRegularSeasonGame(game, teamIds))) return state;

  const table = sortByStandings(leagueTeams, state.leagueStats.tiebreakers, state.headToHead, state.leagueStats);
  const champion = table[0];
  const runnerUp = table[1];
  if (!champion) return state;

  const championName = getTeamFullName(champion);
  const championCoach = resolveHeadCoachMember(champion, state.staff);
  const leagueName = String(state.leagueStats.leagueName ?? '').trim() || 'League';
  const runnerUpName = runnerUp ? getTeamFullName(runnerUp) : undefined;
  const teamAwards: HistoricalAward[] = [
    {
      season,
      type: 'Champion',
      name: championName,
      tid: champion.id,
      coachName: championCoach?.name,
      coachId: championCoach?.id ?? championCoach?.sourcePlayerId,
    },
    ...(runnerUp ? [{ season, type: 'Runner Up', name: runnerUpName!, tid: runnerUp.id }] : []),
  ];
  const seasonAwards = state.historicalAwards ?? [];
  const awardByType = (type: string) => seasonAwards.find(award => award.season === season && award.type === type);
  const existingEntry = (state.seasonHistory ?? []).find(entry => entry.year === season);
  const seasonEntry: SeasonHistoryEntry = {
    ...existingEntry,
    year: season,
    champion: championName,
    championTid: champion.id,
    championSource: 'standings',
    runnerUp: runnerUpName,
    runnerUpTid: runnerUp?.id,
    mvp: existingEntry?.mvp ?? awardByType('MVP')?.name,
    mvpPid: existingEntry?.mvpPid ?? awardByType('MVP')?.pid,
    roty: existingEntry?.roty ?? awardByType('ROY')?.name,
    rotyPid: existingEntry?.rotyPid ?? awardByType('ROY')?.pid,
    dpoy: existingEntry?.dpoy ?? awardByType('DPOY')?.name,
    dpoyPid: existingEntry?.dpoyPid ?? awardByType('DPOY')?.pid,
  };
  const historyEntry = `${season}: ${championName} won the league title with the best regular-season record.`;

  return {
    ...state,
    teams: state.teams.map(team => team.id === champion.id && championCoach
      ? appendCoachAchievementToTeam(team, {
          coachName: championCoach.name,
          coachId: championCoach.id ?? championCoach.sourcePlayerId,
        }, {
          season,
          type: 'Champion',
          label: `${season} ${leagueName} Champion`,
          league: state.leagueStats.uiMode ?? 'nba',
          teamId: champion.id,
          teamName: championName,
          role: 'Head Coach',
        })
      : team),
    players: state.players.map(player => {
      if (player.tid !== champion.id) return player;
      const alreadyChampion = (player.awards ?? []).some(award => (
        award.season === season && CHAMPIONSHIP_AWARD_TYPES.has(award.type)
      ));
      return alreadyChampion
        ? player
        : { ...player, awards: [...(player.awards ?? []), { season, type: 'Champion' }] };
    }),
    historicalAwards: [...seasonAwards, ...teamAwards],
    seasonHistory: [
      ...(state.seasonHistory ?? []).filter(entry => entry.year !== season),
      seasonEntry,
    ],
    history: (state.history ?? []).includes(historyEntry)
      ? state.history
      : [...(state.history ?? []), historyEntry],
  };
};
