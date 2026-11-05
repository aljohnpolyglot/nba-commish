import { useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { isHistoricalNbaWhatIfTimeline, timelineInputFromState } from '../../utils/historicalTimeline';
import euroBasketHistory from '../../data/euroBasketHistory.json';
import type { InternationalTournamentState } from './types';

const DETAIL_URLS: Record<number, string> = {
  2025: 'https://www.fiba.basketball/en/events/fiba-eurobasket-2025',
  2022: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/208210',
  2017: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/9604',
  2015: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/7259',
  2013: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/6774',
  2011: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/5939',
  2009: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/5134',
  2007: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/4323',
  2005: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/2725',
  2003: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1836',
  2001: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1835',
  1999: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1867',
  1997: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1866',
  1995: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1865',
  1993: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1864',
  1991: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1863',
  1989: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1862',
  1987: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1861',
  1985: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1860',
  1983: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1859',
  1981: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1858',
  1979: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1857',
  1977: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1856',
  1975: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1855',
  1973: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1854',
  1971: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1853',
  1969: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1852',
  1967: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1851',
  1965: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1850',
  1963: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1849',
  1961: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1848',
  1959: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1847',
  1957: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1846',
  1955: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1845',
  1953: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1844',
  1951: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1843',
  1949: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1842',
  1947: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1841',
  1946: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1840',
  1939: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1839',
  1937: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/1838',
  1935: 'https://www.fiba.basketball/en/history/208-fiba-eurobasket/2250',
};

export interface EuroBasketEdition {
  year: number;
  edition: string;
  hosts: string[];
  status: 'complete' | 'scheduled' | 'cancelled' | 'branch' | 'in-progress';
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  finalScore: string | null;
  thirdPlaceScore: string | null;
  teams?: number;
  url: string | null;
}

export function rollingEuroBasketHorizon(rows: readonly EuroBasketEdition[]): EuroBasketEdition[] {
  const historical = rows.filter(row => row.status === 'complete' || row.status === 'cancelled');
  const upcoming = rows
    .filter(row => row.status !== 'complete' && row.status !== 'cancelled')
    .sort((left, right) => left.year - right.year)
    .slice(0, 2);
  return [...historical, ...upcoming];
}

function savedCountry(
  tournament: InternationalTournamentState,
  teamId: string | undefined,
): string | null {
  return tournament.teams.find(team => team.id === teamId)?.country ?? null;
}

function savedScore(
  tournament: InternationalTournamentState,
  phase: 'final' | 'third-place',
  winnerTeamId: string | undefined,
  fallback?: string,
): string | null {
  const game = tournament.games.find(row => row.phase === phase && row.played);
  if (!game || typeof game.homeScore !== 'number' || typeof game.awayScore !== 'number' || !winnerTeamId) {
    return fallback ?? null;
  }
  return winnerTeamId === game.homeTeamId
    ? `${game.homeScore}–${game.awayScore}`
    : `${game.awayScore}–${game.homeScore}`;
}

export function useEuroBasketEditions(): EuroBasketEdition[] {
  const { state } = useGame();
  const historicalNba = isHistoricalNbaWhatIfTimeline(timelineInputFromState(state));
  const branchYear = state.leagueStats?.uiMode === 'euro_isolated'
    ? Number(state.euroStartSeason ?? state.leagueStats.year)
    : historicalNba ? Number(state.nbaStartYear ?? 0) : 0;

  const currentYear = state.date
    ? new Date(state.date).getUTCFullYear()
    : Number(state.leagueStats?.year ?? branchYear);

  return useMemo(() => {
    const saved = [...(state.internationalTournamentHistory ?? []), state.internationalTournament]
      .filter((entry): entry is InternationalTournamentState => !!entry && entry.kind === 'eurobasket');
    const savedByYear = new Map(saved.map(entry => [entry.year, entry]));
    const rows = [...euroBasketHistory] as Array<Record<string, unknown> & {
      edition: string;
      year: number;
      hosts: string[];
    }>;
    let year = Math.max(...rows.map(row => row.year));
    let edition = Math.max(...rows.map(row => Number(row.edition) || 0));
    const throughYear = Math.max(currentYear + 8, ...saved.map(entry => entry.year));
    while (year + 4 <= throughYear) {
      year += 4;
      edition += 1;
      rows.push({ edition: String(edition), year, hosts: [], teams: 24 });
    }

    const editions = rows.map(row => {
      const tournament = savedByYear.get(row.year);
      const completed = !!tournament?.result && ['complete', 'reviewed'].includes(tournament.status);
      const hiddenByBranch = branchYear > 0 && row.year > branchYear && !tournament;
      const cancelled = typeof row.status === 'string';
      const sourceComplete = row.gold != null;
      const result = tournament?.result;
      return {
        year: row.year,
        edition: row.edition,
        hosts: tournament?.hostCountries.length
          ? tournament.hostCountries
          : hiddenByBranch ? [] : row.hosts,
        status: tournament && !completed
          ? 'in-progress' as const
          : completed ? 'complete' as const
            : hiddenByBranch ? 'branch' as const
              : cancelled ? 'cancelled' as const
                : sourceComplete ? 'complete' as const : 'scheduled' as const,
        champion: completed
          ? savedCountry(tournament, result?.championTeamId)
          : hiddenByBranch ? null : typeof row.gold === 'string' ? row.gold : null,
        runnerUp: completed
          ? savedCountry(tournament, result?.runnerUpTeamId)
          : hiddenByBranch ? null : typeof row.silver === 'string' ? row.silver : null,
        thirdPlace: completed
          ? savedCountry(tournament, result?.thirdPlaceTeamId)
          : hiddenByBranch ? null : typeof row.bronze === 'string' ? row.bronze : null,
        fourthPlace: completed
          ? savedCountry(tournament, result?.fourthPlaceTeamId)
          : hiddenByBranch ? null : typeof row.fourthPlace === 'string' ? row.fourthPlace : null,
        finalScore: completed
          ? savedScore(tournament, 'final', result?.championTeamId, result?.finalScore)
          : hiddenByBranch ? null : typeof row.score === 'string' ? row.score : null,
        thirdPlaceScore: completed
          ? savedScore(tournament, 'third-place', result?.thirdPlaceTeamId, result?.thirdPlaceScore)
          : hiddenByBranch ? null : typeof row.bronzeScore === 'string' ? row.bronzeScore : null,
        teams: typeof row.teams === 'number' ? row.teams : tournament?.teams.length,
        url: hiddenByBranch || tournament && !tournament.readOnly
          ? null
          : DETAIL_URLS[row.year] ?? null,
      };
    });
    return rollingEuroBasketHorizon(editions);
  }, [
    branchYear,
    currentYear,
    state.internationalTournament,
    state.internationalTournamentHistory,
  ]);
}
