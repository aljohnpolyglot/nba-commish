import type { GameState } from '../../types';
import type { EuroTeamTrophy } from '../euro/euroTeamHistory';

type TitleSeason = {
  season: number;
  isChamp: boolean;
};

export function buildModdedTeamTrophies(
  state: GameState,
  teamId: number,
  namespace: 'nba' | 'wnba',
  accentColor: string,
  seasons: TitleSeason[],
): EuroTeamTrophy[] {
  const leagueName = namespace === 'wnba' ? 'WNBA Championship' : 'NBA Championship';
  const trophies: EuroTeamTrophy[] = seasons
    .filter(season => season.isChamp)
    .map(season => {
      const result = (state.seasonHistory ?? []).find(entry => entry.year === season.season && entry.championTid === teamId);
      return {
        key: `${namespace}:${season.season}:${teamId}`,
        season: season.season,
        competitionId: namespace,
        competitionName: leagueName,
        shortName: leagueName,
        accentColor,
        runnerUpTid: result?.runnerUpTid,
      };
    });

  if (namespace === 'nba') {
    const cups = [...Object.values(state.nbaCupHistory ?? {}), ...(state.nbaCup?.status === 'complete' ? [state.nbaCup] : [])];
    for (const cup of cups) {
      if (cup.championTid !== teamId) continue;
      trophies.push({
        key: `nba-cup:${cup.year}:${teamId}`,
        season: cup.year,
        competitionId: 'nba-in-season-tournament',
        competitionName: 'NBA Cup',
        shortName: 'NBA Cup',
        accentColor: '#f59e0b',
        runnerUpTid: cup.runnerUpTid,
      });
    }
  }

  if (namespace === 'wnba') {
    const cupStates = Object.values(state.cupCompetitions ?? {})
      .filter(cup => cup.competitionId === 'wnba-commissioners-cup');
    const cupHistory = [
      ...(state.historicalWnba?.commissionersCupHistory ?? []),
      ...cupStates.flatMap(cup => cup.history),
    ];
    for (const cup of cupHistory) {
      if (cup.championTid !== teamId) continue;
      trophies.push({
        key: `wnba-commissioners-cup:${cup.season}:${teamId}`,
        season: cup.season,
        competitionId: 'wnba-commissioners-cup',
        competitionName: "WNBA Commissioner's Cup",
        shortName: "Commissioner's Cup",
        accentColor: '#f97316',
        runnerUpTid: cup.runnerUpTid ?? undefined,
      });
    }
  }

  return [...new Map(trophies.map(trophy => [trophy.key, trophy])).values()]
    .sort((left, right) => right.season - left.season || left.competitionName.localeCompare(right.competitionName));
}
