import { useMemo } from 'react';
import tournamentHistory from '../../data/fibaTournamentHistory.json';
import { useGame } from '../../store/GameContext';
import { isHistoricalNbaWhatIfTimeline, timelineInputFromState } from '../../utils/historicalTimeline';
import type { InternationalTournamentState } from './types';
import { getPbaMajorTournamentDates } from '../pba/calendar';

type TournamentHistory = typeof tournamentHistory;

function tournamentEndDate(kind: 'world-cup' | 'olympics-men', year: number): string {
  const configured = getPbaMajorTournamentDates(kind, year);
  const fallbackEnd = kind === 'world-cup' ? '09-15' : '08-10';
  return `${year}-${configured?.end ?? fallbackEnd}`;
}

function completedBeforeBranch(kind: 'world-cup' | 'olympics-men', year: number, branchDate: string): boolean {
  return tournamentEndDate(kind, year) < branchDate;
}

export function branchSafeHistory(history: TournamentHistory, branchDate: string): TournamentHistory {
  return {
    ...history,
    worldCup: history.worldCup.map(row => completedBeforeBranch('world-cup', row.year, branchDate) || row.status !== 'complete' ? row : {
      ...row,
      status: 'branch',
      champion: null,
      runnerUp: null,
      finalScore: null,
      thirdPlace: null,
      fourthPlace: null,
      thirdPlaceScore: null,
      finalVenue: null,
      thirdPlaceVenue: null,
    }),
    olympicsMen: history.olympicsMen.map(row => completedBeforeBranch('olympics-men', Number(row.playedYear ?? row.year), branchDate) || row.status !== 'complete' ? row : {
      ...row,
      status: 'branch',
      gold: null,
      silver: null,
      goldMedalGameScore: null,
      bronze: null,
      fourthPlace: null,
      bronzeMedalGameScore: null,
    }),
  };
}

export function extendCadence(history: TournamentHistory, throughYear: number): TournamentHistory {
  const worldCup = [...history.worldCup] as any[];
  let worldYear = Math.max(...worldCup.map(row => row.year));
  let edition = Math.max(...worldCup.map(row => row.edition ?? 0));
  while (worldYear + 4 <= throughYear) {
    worldYear += 4;
    edition += 1;
    worldCup.push({
      edition,
      year: worldYear,
      hosts: [],
      status: 'branch',
      champion: null,
      runnerUp: null,
      finalScore: null,
      finalVenue: null,
      finalNote: null,
      thirdPlace: null,
      fourthPlace: null,
      thirdPlaceScore: null,
      thirdPlaceVenue: null,
      thirdPlaceNote: null,
      teams: 32,
    });
  }

  const olympicsMen = [...history.olympicsMen] as any[];
  let olympicYear = Math.max(...olympicsMen.map(row => row.year));
  while (olympicYear + 4 <= throughYear) {
    olympicYear += 4;
    olympicsMen.push({
      year: olympicYear,
      playedYear: olympicYear,
      hosts: [],
      status: 'branch',
      gold: null,
      silver: null,
      goldMedalGameScore: null,
      bronze: null,
      fourthPlace: null,
      bronzeMedalGameScore: null,
    });
  }
  return { ...history, worldCup, olympicsMen } as TournamentHistory;
}

function withTournamentPresence(
  history: TournamentHistory,
  tournament: InternationalTournamentState | undefined,
): TournamentHistory {
  if (!tournament) return history;
  if (tournament.kind === 'eurobasket') return history;
  const status = ['complete', 'reviewed'].includes(tournament.status) ? 'complete' : 'branch';
  if (tournament.kind === 'world-cup') {
    return {
      ...history,
      worldCup: history.worldCup.map(row => row.year === tournament.year ? {
        ...row,
        hosts: row.hosts.length > 0 ? row.hosts : tournament.hostCountries,
        status,
      } : row),
    } as TournamentHistory;
  }
  return {
    ...history,
    olympicsMen: history.olympicsMen.map(row => row.year === tournament.year ? {
      ...row,
      hosts: row.hosts.length > 0 ? row.hosts : tournament.hostCountries,
      status,
    } : row),
  } as TournamentHistory;
}

export function rollingHorizon(history: TournamentHistory): TournamentHistory {
  const keep = <T extends { status: string; year: number }>(rows: readonly T[]): T[] => [
    ...rows.filter(row => row.status === 'complete'),
    ...rows.filter(row => row.status !== 'complete').sort((left, right) => left.year - right.year).slice(0, 2),
  ];
  return {
    ...history,
    worldCup: keep(history.worldCup) as TournamentHistory['worldCup'],
    olympicsMen: keep(history.olympicsMen) as TournamentHistory['olympicsMen'],
  };
}

function withTournamentResult(
  history: TournamentHistory,
  tournament: InternationalTournamentState | undefined,
): TournamentHistory {
  if (!tournament?.result || !['complete', 'reviewed'].includes(tournament.status)) return history;
  if (tournament.kind === 'eurobasket') return history;
  const country = (teamId: string | undefined): string | null =>
    tournament.teams.find(team => team.id === teamId)?.country ?? null;
  const placementScore = (phase: 'final' | 'third-place', winnerTeamId: string | undefined, fallback?: string): string | null => {
    const game = tournament.games.find(row => row.phase === phase && row.played);
    if (!game || typeof game.homeScore !== 'number' || typeof game.awayScore !== 'number' || !winnerTeamId) return fallback ?? null;
    return winnerTeamId === game.homeTeamId
      ? `${game.homeScore}-${game.awayScore}`
      : `${game.awayScore}-${game.homeScore}`;
  };
  if (tournament.kind === 'world-cup') {
    return {
      ...history,
      worldCup: history.worldCup.map(row => row.year !== tournament.year ? row : {
        ...row,
        status: 'complete',
        champion: country(tournament.result?.championTeamId),
        runnerUp: country(tournament.result?.runnerUpTeamId),
        finalScore: placementScore('final', tournament.result?.championTeamId, tournament.result?.finalScore),
        thirdPlace: country(tournament.result?.thirdPlaceTeamId),
        fourthPlace: country(tournament.result?.fourthPlaceTeamId),
        thirdPlaceScore: placementScore('third-place', tournament.result?.thirdPlaceTeamId, tournament.result?.thirdPlaceScore),
      }),
    } as TournamentHistory;
  }
  return {
    ...history,
    olympicsMen: history.olympicsMen.map(row => row.year !== tournament.year ? row : {
      ...row,
      status: 'complete',
      gold: country(tournament.result?.championTeamId),
      silver: country(tournament.result?.runnerUpTeamId),
      goldMedalGameScore: placementScore('final', tournament.result?.championTeamId, tournament.result?.finalScore),
      bronze: country(tournament.result?.thirdPlaceTeamId),
      fourthPlace: country(tournament.result?.fourthPlaceTeamId),
      bronzeMedalGameScore: placementScore('third-place', tournament.result?.thirdPlaceTeamId, tournament.result?.thirdPlaceScore),
    }),
  } as TournamentHistory;
}

export function useTournamentHistory(tournament?: InternationalTournamentState): TournamentHistory {
  const { state } = useGame();
  const timeline = timelineInputFromState(state);
  const historicalWhatIf = isHistoricalNbaWhatIfTimeline(timeline);
  const branchYear = Number(state.nbaStartYear ?? 0);
  const branchDate = state.nbaBranchDate
    ?? (state.nbaGmStartMode === 'fixed_preseason' || state.nbaGmStartMode === 'opening_rosters'
      ? `${branchYear}-10-01`
      : `${branchYear}-01-01`);
  const currentYear = state.date ? new Date(state.date).getUTCFullYear() : Number(state.leagueStats?.year ?? branchYear);

  return useMemo(
    () => {
      const safeHistory = historicalWhatIf && branchYear > 0
        ? branchSafeHistory(tournamentHistory, branchDate)
        : tournamentHistory;
      const savedTournaments = [...(state.internationalTournamentHistory ?? []), tournament]
        .filter((entry): entry is InternationalTournamentState => !!entry)
      const latestSavedYear = Math.max(currentYear, ...savedTournaments.map(entry => entry.year));
      const extended = extendCadence(safeHistory, latestSavedYear + 12);
      const resolved = savedTournaments.reduce(withTournamentResult, extended);
      return rollingHorizon(withTournamentPresence(resolved, tournament));
    },
    [branchDate, branchYear, currentYear, historicalWhatIf, state.internationalTournamentHistory, tournament],
  );
}
