import type { GameResult, GameState, HistoricalAward, NewsItem, SeasonHistoryEntry } from '../../types';
import { NewsGenerator } from '../news/NewsGenerator';
import { computePlayoffMvpFromResults, generatePlayoffSeriesNews } from './lazySimRunnerHelpers';

type LazySimPlayoffOutcomeArgs = {
  state: GameState;
  stateWithSim: GameState;
  allSimResults: GameResult[];
  updatedPlayers: GameState['players'];
};

type LazySimPlayoffOutcome = {
  updatedPlayers: GameState['players'];
  playoffSeriesNews: NewsItem[];
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
  const playoffSeriesNews = generatePlayoffSeriesNews(
    state.playoffs,
    stateWithSim.playoffs,
    stateWithSim.teams,
    stateWithSim.date,
    state.leagueStats.year,
    allSimResults,
    updatedPlayers,
    stateWithSim.historicalAwards,
  );

  const champHistoricalAwards: HistoricalAward[] = [];
  const semifinalsMvpAwards: HistoricalAward[] = [];
  let champTeamsWithRoundsWon: GameState['teams'] | null = null;

  if (stateWithSim.playoffs?.bracketComplete && !state.playoffs?.bracketComplete && stateWithSim.playoffs.champion) {
    const champTid = stateWithSim.playoffs.champion;
    const finalsSeries = stateWithSim.playoffs.series.find(s => s.round === 4);
    const loserTid = finalsSeries
      ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
      : undefined;
    const champTeam = stateWithSim.teams.find(t => t.id === champTid);
    const loserTeam = loserTid !== undefined ? stateWithSim.teams.find(t => t.id === loserTid) : undefined;
    const season = state.leagueStats.year;

    if (champTeam) {
      champHistoricalAwards.push({ season, type: 'Champion', name: champTeam.name, tid: champTid });
    }
    if (loserTeam) {
      champHistoricalAwards.push({ season, type: 'Runner Up', name: loserTeam.name, tid: loserTid });
    }

    if (champTeam || loserTeam) {
      champTeamsWithRoundsWon = stateWithSim.teams.map(t => {
        const isChamp = t.id === champTid;
        const isRunner = loserTid !== undefined && t.id === loserTid;
        if (!isChamp && !isRunner) return t;
        return {
          ...t,
          seasons: (t.seasons ?? []).map((s: any) =>
            Number(s.season) === Number(season)
              ? { ...s, playoffRoundsWon: isChamp ? 4 : 3 }
              : s
          ),
        };
      });
    }

    if (champTeam) {
      const champRosterIds = new Set(
        updatedPlayers.filter(p => p.tid === champTid).map(p => p.internalId),
      );
      updatedPlayers = updatedPlayers.map(p => {
        if (!champRosterIds.has(p.internalId)) return p;
        const already = (p.awards ?? []).some(a => a.season === season && a.type === 'NBA Champion');
        if (already) return p;
        return { ...p, awards: [...(p.awards ?? []), { season, type: 'NBA Champion' }] };
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

    const fmvpAward = champHistoricalAwards.find(a => a.type === 'Finals MVP');
    if (fmvpAward && champTeam) {
      const champPlayerStats = allSimResults
        .filter(r => r.homeTeamId === champTid || r.awayTeamId === champTid)
        .flatMap(r => (r.homeTeamId === champTid ? r.homeStats : r.awayStats))
        .filter(s => s.playerId === fmvpAward.pid);
      const avgPts = champPlayerStats.length > 0
        ? (champPlayerStats.reduce((sum, item) => sum + item.pts, 0) / champPlayerStats.length).toFixed(1)
        : '?';
      const fmvpItem = NewsGenerator.generate('finals_mvp', stateWithSim.date, {
        playerName: fmvpAward.name,
        teamName: champTeam.name,
        teamCity: champTeam.region ?? champTeam.name,
        year: season,
        pts: avgPts,
      });
      if (fmvpItem) playoffSeriesNews.push(fmvpItem);
    }
  }

  if (stateWithSim.playoffs && state.playoffs) {
    for (const newSeries of stateWithSim.playoffs.series) {
      if (newSeries.round !== 3 || newSeries.status !== 'complete') continue;
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
  if (stateWithSim.playoffs?.bracketComplete && !state.playoffs?.bracketComplete && stateWithSim.playoffs.champion) {
    const champTid = stateWithSim.playoffs.champion;
    const finalsSeries = stateWithSim.playoffs.series.find(series => series.round === 4);
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
      champion: champTeam?.name ?? 'Unknown',
      championTid: champTid,
      runnerUp: loserTeam?.name,
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
    playoffSeriesNews,
    champHistoricalAwards,
    semifinalsMvpAwards,
    champTeamsWithRoundsWon,
    seasonHistoryPatch,
  };
}
