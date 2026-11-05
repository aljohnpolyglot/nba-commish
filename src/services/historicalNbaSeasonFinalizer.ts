import type { GameResult, GameState, HistoricalAward, NBAPlayer, SeasonHistoryEntry } from '../types';
import { isHistoricalNbaStart } from '../data/historicalNbaSeasons';
import { announce as announceAwardViaEngine, getEnabledAwards } from './awards/AwardEngine';
import { computePlayoffMvpFromResults } from './logic/lazySimRunnerHelpers';
import { getTeamFullName } from '../utils/teamNames';
import { resolveHeadCoachMember } from './staff/coachNameResolver';
import { appendCoachAchievementToTeam } from './staff/coachAchievements';

function isHistoricalNbaSave(state: GameState): boolean {
  const nbaStartYear = Number(state.nbaStartYear ?? 0);
  return state.leagueType === 'modded' &&
    state.moddedLeagueBase === 'nba' &&
    isHistoricalNbaStart(nbaStartYear);
}

function mergeHistoricalAwards(existing: HistoricalAward[], additions: HistoricalAward[]): HistoricalAward[] {
  const seen = new Set(existing.map(award => [
    award.season,
    award.type ?? '',
    award.pid ?? '',
    award.tid ?? '',
    award.name ?? '',
    award.competitionId ?? '',
  ].join('|')));
  const merged = [...existing];
  for (const award of additions) {
    const key = [
      award.season,
      award.type ?? '',
      award.pid ?? '',
      award.tid ?? '',
      award.name ?? '',
      award.competitionId ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(award);
  }
  return merged;
}

function addPlayerAwardOnce(players: NBAPlayer[], playerId: string, season: number, type: string): NBAPlayer[] {
  return players.map(player => {
    if (player.internalId !== playerId) return player;
    if ((player.awards ?? []).some(award => award.season === season && award.type === type)) return player;
    return { ...player, awards: [...(player.awards ?? []), { season, type }] };
  });
}

function buildCompletedPlayoffPatch(state: GameState, season: number): {
  awards: HistoricalAward[];
  players: NBAPlayer[];
  teams: GameState['teams'];
} {
  const playoffs = state.playoffs;
  if (!playoffs?.bracketComplete || playoffs.champion == null) {
    return { awards: [], players: state.players, teams: state.teams };
  }

  const awards: HistoricalAward[] = [];
  let players = state.players;
  let teams = state.teams;
  const championTid = playoffs.champion;
  const finalsSeries = playoffs.series.find(series => series.round === 4 && series.status === 'complete');
  const runnerUpTid = finalsSeries
    ? (finalsSeries.higherSeedTid === championTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
    : undefined;
  const champion = state.teams.find(team => team.id === championTid);
  const runnerUp = runnerUpTid != null ? state.teams.find(team => team.id === runnerUpTid) : undefined;

  const championCoach = champion ? resolveHeadCoachMember(champion, state.staff) : undefined;
  if (champion) {
    awards.push({
      season,
      type: 'Champion',
      name: getTeamFullName(champion),
      tid: championTid,
      coachName: championCoach?.name,
      coachId: championCoach?.id ?? championCoach?.sourcePlayerId,
    });
    const champRosterIds = new Set(players.filter(player => player.tid === championTid).map(player => player.internalId));
    for (const playerId of champRosterIds) {
      players = addPlayerAwardOnce(players, playerId, season, 'NBA Champion');
    }
  }
  if (runnerUp) {
    awards.push({ season, type: 'Runner Up', name: getTeamFullName(runnerUp), tid: runnerUpTid });
  }

  if (champion || runnerUp) {
    teams = state.teams.map(team => {
      const isChampion = team.id === championTid;
      const isRunnerUp = runnerUpTid != null && team.id === runnerUpTid;
      if (!isChampion && !isRunnerUp) return team;
      const nextTeam = {
        ...team,
        seasons: (team.seasons ?? []).map((row: any) =>
          Number(row.season) === Number(season)
            ? { ...row, playoffRoundsWon: isChampion ? 4 : Math.max(Number(row.playoffRoundsWon ?? 0), 3) }
            : row,
        ),
      };
      return isChampion && championCoach ? appendCoachAchievementToTeam(nextTeam, {
        coachName: championCoach.name,
        coachId: championCoach.id ?? championCoach.sourcePlayerId,
      }, {
        season,
        type: 'Champion',
        label: `${season} NBA Champion`,
        league: 'nba',
        teamId: championTid,
        teamName: getTeamFullName(champion),
        role: 'Head Coach',
      }) : nextTeam;
    });
  }

  const finalsGameIds = new Set<number>(finalsSeries?.gameIds ?? []);
  const finalsResults = ((state.boxScores ?? []) as GameResult[]).filter(result => finalsGameIds.has(result.gameId));
  if (finalsResults.length > 0 && champion) {
    const mvpStat = computePlayoffMvpFromResults(finalsResults, championTid);
    const mvpPlayer = mvpStat ? players.find(player => player.internalId === mvpStat.pid) : undefined;
    if (mvpPlayer) {
      awards.push({ season, type: 'Finals MVP', name: mvpPlayer.name, pid: mvpPlayer.internalId, tid: championTid });
      players = addPlayerAwardOnce(players, mvpPlayer.internalId, season, 'Finals MVP');
    }
  }

  return { awards, players, teams };
}

function buildSeasonHistoryEntry(state: GameState, season: number, awards: HistoricalAward[]): SeasonHistoryEntry | null {
  const playoffs = state.playoffs;
  if (!playoffs?.bracketComplete || playoffs.champion == null) return null;
  const championTid = playoffs.champion;
  const finalsSeries = playoffs.series.find(series => series.round === 4);
  const runnerUpTid = finalsSeries
    ? (finalsSeries.higherSeedTid === championTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
    : undefined;
  const champion = state.teams.find(team => team.id === championTid);
  const runnerUp = runnerUpTid != null ? state.teams.find(team => team.id === runnerUpTid) : undefined;
  const seasonAward = (type: string) => awards.find(award => Number(award.season) === Number(season) && award.type === type);

  return {
    year: season,
    champion: champion ? getTeamFullName(champion) : 'Unknown',
    championTid,
    runnerUp: runnerUp ? getTeamFullName(runnerUp) : undefined,
    runnerUpTid,
    mvp: seasonAward('MVP')?.name,
    mvpPid: seasonAward('MVP')?.pid as string | undefined,
    finalsMvp: seasonAward('Finals MVP')?.name,
    finalsMvpPid: seasonAward('Finals MVP')?.pid as string | undefined,
    roty: seasonAward('ROY')?.name,
    rotyPid: seasonAward('ROY')?.pid as string | undefined,
    dpoy: seasonAward('DPOY')?.name,
    dpoyPid: seasonAward('DPOY')?.pid as string | undefined,
  };
}

export function finalizeHistoricalNbaSeason(state: GameState, season = state.leagueStats?.year): GameState {
  const targetSeason = Number(season);
  if (!isHistoricalNbaSave(state) || !Number.isFinite(targetSeason)) return state;
  if (!state.playoffs?.bracketComplete || state.playoffs.champion == null) return state;

  let finalized = state;
  const seasonAwardIds = getEnabledAwards(finalized as any)
    .filter(award => award.calculatorId !== 'postseason')
    .map(award => award.id);
  for (const awardId of seasonAwardIds) {
    const patch = announceAwardViaEngine(finalized, awardId);
    if (Object.keys(patch).length > 0) finalized = { ...finalized, ...patch } as GameState;
  }

  const playoffPatch = buildCompletedPlayoffPatch(finalized, targetSeason);
  const historicalAwards = mergeHistoricalAwards(finalized.historicalAwards ?? [], playoffPatch.awards);
  const seasonHistoryEntry = buildSeasonHistoryEntry(
    { ...finalized, teams: playoffPatch.teams, players: playoffPatch.players, historicalAwards },
    targetSeason,
    historicalAwards,
  );
  const seasonHistory = seasonHistoryEntry
    ? [
        ...((finalized.seasonHistory ?? []) as SeasonHistoryEntry[]).filter(entry => Number(entry.year) !== targetSeason),
        seasonHistoryEntry,
      ]
    : finalized.seasonHistory;

  return {
    ...finalized,
    players: playoffPatch.players,
    teams: playoffPatch.teams,
    historicalAwards,
    seasonHistory,
  };
}
