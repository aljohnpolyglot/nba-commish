import type { GameState } from '../types';

export interface ChampionshipCelebration {
  key: string;
  season: number;
  competitionId: string;
  competitionName: string;
  championTid: number;
  runnerUpTid?: number;
  finalsMvp?: string;
}

function mainLeagueName(state: GameState): string {
  if (state.moddedLeagueBase === 'wnba') return 'WNBA';
  return state.leagueStats.leagueName || (state.leagueType === 'fictional' ? 'League' : 'NBA');
}

function mainBracketCelebration(state: GameState): ChampionshipCelebration[] {
  if (state.leagueStats.uiMode === 'pba_isolated' || state.leagueStats.uiMode === 'euro_isolated') return [];
  if (!state.playoffs?.bracketComplete || state.playoffs.champion == null) return [];
  const season = Number(state.playoffs.season ?? state.leagueStats.year);
  const history = state.seasonHistory?.find(entry => entry.year === season && entry.championTid === state.playoffs?.champion);
  const finals = state.playoffs.series?.find(series => series.conference === 'Finals' || series.round === 4);
  const runnerUpTid = history?.runnerUpTid ?? (finals
    ? finals.higherSeedTid === state.playoffs.champion ? finals.lowerSeedTid : finals.higherSeedTid
    : undefined);
  return [{
    key: `main:${season}:${state.playoffs.champion}`,
    season,
    competitionId: 'league-championship',
    competitionName: `${mainLeagueName(state)} Championship`,
    championTid: state.playoffs.champion,
    runnerUpTid,
    finalsMvp: history?.finalsMvp,
  }];
}

function pbaCelebrations(state: GameState): ChampionshipCelebration[] {
  if (state.leagueStats.uiMode !== 'pba_isolated') return [];
  const labels = {
    philippine: 'PBA Philippine Cup',
    commissioners: "PBA Commissioner's Cup",
    governors: "PBA Governors' Cup",
  } as const;
  return (state.leagueStats.pbaConferenceChampions ?? []).map(entry => ({
    key: `pba:${entry.season}:${entry.conference}:${entry.teamId}`,
    season: entry.season,
    competitionId: `pba-${entry.conference}`,
    competitionName: labels[entry.conference],
    championTid: entry.teamId,
    finalsMvp: state.players.find(player => player.internalId === entry.finalsMvpId)?.name,
  }));
}

function euroCelebrations(state: GameState): ChampionshipCelebration[] {
  if (state.leagueStats.uiMode !== 'euro_isolated') return [];
  const specs = new Map((state.activeCompetitions ?? []).map(spec => [spec.id, spec]));
  return Object.entries(state.competitionHistory ?? {}).flatMap(([competitionId, rows]) => (
    (rows as Array<Record<string, unknown>>).flatMap(row => {
      const season = Number(row.season);
      const championTid = Number(row.championTid);
      if (!Number.isFinite(season) || !Number.isFinite(championTid)) return [];
      const runnerUpTid = Number(row.runnerUpTid);
      return [{
        key: `euro:${competitionId}:${season}:${championTid}`,
        season,
        competitionId,
        competitionName: specs.get(competitionId)?.displayName ?? competitionId,
        championTid,
        ...(Number.isFinite(runnerUpTid) ? { runnerUpTid } : {}),
      }];
    })
  ));
}

export function collectChampionshipCelebrations(state: GameState): ChampionshipCelebration[] {
  return [
    ...mainBracketCelebration(state),
    ...pbaCelebrations(state),
    ...euroCelebrations(state),
  ];
}
