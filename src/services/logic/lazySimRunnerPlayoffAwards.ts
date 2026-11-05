import type { GameResult, GameState, HistoricalAward, SeasonHistoryEntry } from '../../types';
import { computePlayoffMvpFromResults } from './lazySimRunnerHelpers';
import { resolveHeadCoachMember } from '../staff/coachNameResolver';
import { getTeamFullName } from '../../utils/teamNames';
import { appendCoachAchievementToTeam } from '../staff/coachAchievements';
import { getEnabledAwards } from '../awards/AwardEngine';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { resolveFinalsRound } from '../playoffs/playoffRounds';

type LazySimPlayoffOutcomeArgs = {
  state: GameState;
  stateWithSim: GameState;
  allSimResults: GameResult[];
  updatedPlayers: GameState['players'];
};

type LazySimPlayoffOutcome = {
  updatedPlayers: GameState['players'];
  champHistoricalAwards: HistoricalAward[];
  semifinalsMvpAwards: HistoricalAward[];
  champTeamsWithRoundsWon: GameState['teams'] | null;
  seasonHistoryPatch: { seasonHistory: SeasonHistoryEntry[] } | null;
};

export function buildLazySimPlayoffOutcomes({
  state,
  stateWithSim,
  allSimResults,
  updatedPlayers,
}: LazySimPlayoffOutcomeArgs): LazySimPlayoffOutcome {
  const finalsRound = resolveFinalsRound(stateWithSim.leagueStats, stateWithSim.playoffs);
  const leagueLabels = getLeagueLabels(
    stateWithSim.leagueType,
    stateWithSim.leagueStats.uiMode,
    stateWithSim.leagueStats.leagueName,
  );
  const champHistoricalAwards: HistoricalAward[] = [];
  const semifinalsMvpAwards: HistoricalAward[] = [];
  let champTeamsWithRoundsWon: GameState['teams'] | null = null;
  const conferenceFinalsMvpEnabled = getEnabledAwards(stateWithSim)
    .some(award => award.id === 'conf-finals-mvp');

  if (stateWithSim.playoffs?.bracketComplete && !state.playoffs?.bracketComplete && stateWithSim.playoffs.champion != null) {
    const champTid = stateWithSim.playoffs.champion;
    const finalsSeries = stateWithSim.playoffs.series.find(s => s.round === finalsRound);
    const loserTid = finalsSeries
      ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
      : undefined;
    const champTeam = stateWithSim.teams.find(t => t.id === champTid);
    const loserTeam = loserTid !== undefined ? stateWithSim.teams.find(t => t.id === loserTid) : undefined;
    const season = state.leagueStats.year;
    const leagueId = stateWithSim.leagueStats.uiMode ?? (stateWithSim.leagueType === 'fictional' ? 'fictional' : 'nba');
    const leagueName = leagueLabels.leagueName;
    const championCoach = champTeam ? resolveHeadCoachMember(champTeam, stateWithSim.staff ?? state.staff) : undefined;

    if (champTeam) {
      champHistoricalAwards.push({
        season,
        type: 'Champion',
        name: getTeamFullName(champTeam),
        tid: champTid,
        coachName: championCoach?.name,
        coachId: championCoach?.id ?? championCoach?.sourcePlayerId,
      });
    }
    if (loserTeam) {
      champHistoricalAwards.push({ season, type: 'Runner Up', name: getTeamFullName(loserTeam), tid: loserTid });
    }

    if (champTeam || loserTeam) {
      champTeamsWithRoundsWon = stateWithSim.teams.map(t => {
        const isChamp = t.id === champTid;
        const isRunner = loserTid !== undefined && t.id === loserTid;
        if (!isChamp && !isRunner) return t;
        const nextTeam = {
          ...t,
          seasons: (t.seasons ?? []).map((s: any) =>
            Number(s.season) === Number(season)
              ? { ...s, playoffRoundsWon: isChamp ? finalsRound : finalsRound - 1 }
              : s
          ),
        };
        return isChamp && championCoach ? appendCoachAchievementToTeam(nextTeam, {
          coachName: championCoach.name,
          coachId: championCoach.id ?? championCoach.sourcePlayerId,
        }, {
          season,
          type: 'Champion',
          label: `${season} ${leagueName} Champion`,
          league: leagueId,
          teamId: champTid,
          teamName: getTeamFullName(champTeam),
          role: 'Head Coach',
        }) : nextTeam;
      });
    }

    if (champTeam) {
      const champRosterIds = new Set(
        updatedPlayers.filter(p => p.tid === champTid).map(p => p.internalId),
      );
      const championAwardType = `${leagueName} Champion`;
      updatedPlayers = updatedPlayers.map(p => {
        if (!champRosterIds.has(p.internalId)) return p;
        const already = (p.awards ?? []).some(a => a.season === season && a.type === championAwardType);
        if (already) return p;
        return { ...p, awards: [...(p.awards ?? []), { season, type: championAwardType }] };
      });
    }

    const finalsGameIds = new Set<number>(finalsSeries?.gameIds ?? []);
    const priorFinalsResults = ((state.boxScores ?? []) as GameResult[]).filter(r => finalsGameIds.has(r.gameId));
    const finalsResults = [...priorFinalsResults, ...allSimResults.filter(r => finalsGameIds.has(r.gameId))];
    if (finalsResults.length > 0 && finalsSeries) {
      const mvpStat = computePlayoffMvpFromResults(finalsResults, champTid);
      if (mvpStat) {
        const mvpPlayer = updatedPlayers.find(p => p.internalId === mvpStat.pid);
        if (mvpPlayer) {
          champHistoricalAwards.push({ season, type: 'Finals MVP', name: mvpPlayer.name, pid: mvpPlayer.internalId, tid: champTid });
          updatedPlayers = updatedPlayers.map(p =>
            p.internalId === mvpPlayer.internalId
              ? { ...p, awards: [...(p.awards ?? []), { season, type: 'Finals MVP' }] }
              : p,
          );
        }
      }
    }

  }

  if (conferenceFinalsMvpEnabled && stateWithSim.playoffs && state.playoffs) {
    for (const newSeries of stateWithSim.playoffs.series) {
      if (newSeries.round !== finalsRound - 1 || newSeries.status !== 'complete') continue;
      const prevSeries = state.playoffs.series.find(s => s.id === newSeries.id);
      if (prevSeries?.status === 'complete') continue;
      const winnerTid = newSeries.winnerId;
      if (winnerTid == null) continue;

      const seriesGameIds = new Set<number>(newSeries.gameIds ?? []);
      const priorBox = (state.boxScores ?? []) as GameResult[];
      const seriesResults = [
        ...priorBox.filter(box => seriesGameIds.has(box.gameId)),
        ...allSimResults.filter(result => seriesGameIds.has(result.gameId)),
      ];
      if (seriesResults.length === 0) continue;

      const mvpStat = computePlayoffMvpFromResults(seriesResults, winnerTid);
      if (!mvpStat) continue;
      const season = state.leagueStats.year;
      const mvpPlayer = updatedPlayers.find(p => p.internalId === mvpStat.pid);
      if (!mvpPlayer) continue;

      semifinalsMvpAwards.push({
        season,
        type: 'Semifinals MVP',
        name: mvpPlayer.name,
        pid: mvpPlayer.internalId,
        tid: winnerTid,
      });
      updatedPlayers = updatedPlayers.map(p =>
        p.internalId === mvpPlayer.internalId
          ? { ...p, awards: [...(p.awards ?? []), { season, type: 'Semifinals MVP' }] }
          : p,
      );
    }
  }

  let seasonHistoryPatch: { seasonHistory: SeasonHistoryEntry[] } | null = null;
  if (stateWithSim.playoffs?.bracketComplete && !state.playoffs?.bracketComplete && stateWithSim.playoffs.champion != null) {
    const champTid = stateWithSim.playoffs.champion;
    const finalsSeries = stateWithSim.playoffs.series.find(series => series.round === finalsRound);
    const loserTid = finalsSeries
      ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
      : undefined;
    const season = state.leagueStats.year;
    const champTeam = stateWithSim.teams.find(t => t.id === champTid);
    const loserTeam = loserTid != null ? stateWithSim.teams.find(t => t.id === loserTid) : undefined;
    const awards = [...(stateWithSim.historicalAwards ?? []), ...champHistoricalAwards];
    const seasonAward = (type: string) => awards.find(a => a.season === season && a.type === type);
    const newEntry: SeasonHistoryEntry = {
      year: season,
      champion: champTeam ? getTeamFullName(champTeam) : 'Unknown',
      championTid: champTid,
      runnerUp: loserTeam ? getTeamFullName(loserTeam) : undefined,
      runnerUpTid: loserTid,
      mvp: seasonAward('MVP')?.name,
      mvpPid: seasonAward('MVP')?.pid as string | undefined,
      finalsMvp: seasonAward('Finals MVP')?.name,
      finalsMvpPid: seasonAward('Finals MVP')?.pid as string | undefined,
      roty: seasonAward('ROY')?.name,
      rotyPid: seasonAward('ROY')?.pid as string | undefined,
      dpoy: seasonAward('DPOY')?.name,
      dpoyPid: seasonAward('DPOY')?.pid as string | undefined,
    };
    seasonHistoryPatch = {
      seasonHistory: [
        ...(stateWithSim.seasonHistory ?? []).filter(entry => entry.year !== season),
        newEntry,
      ],
    };
  }

  return {
    updatedPlayers,
    champHistoricalAwards,
    semifinalsMvpAwards,
    champTeamsWithRoundsWon,
    seasonHistoryPatch,
  };
}
