import type { NewsItem } from '../../components/news/types';
import type { GameState, NBATeam, NonNBATeam } from '../../types';
import type { InternationalTournamentState } from '../fiba/types';
import { internationalTournamentTitle } from '../fiba/competitionIdentity';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamCountry } from '../../utils/teamCountry';
import { getTeamFullName } from '../../utils/teamNames';
import { readJsonResponse } from '../utils/jsonResponse';
import { renderNewsTemplate } from './NewsGenerator';

const EURO_RECAP_PATH = '/data/historical/euro/europe-season-recaps.json';

interface RawEuropeSeasonRecap {
  competitionId?: string;
  competitionName?: string;
  market?: string;
  level?: string;
  season?: string;
  seasonLabel?: string;
  endYear?: number;
  date?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
}

export interface EuroNewsTeamOption {
  id: number;
  teamIds: number[];
  name: string;
  abbrev: string;
  country: string;
  logoUrl?: string;
  searchTerms: string[];
  team: NBATeam;
}

export function compactNewsText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function displayNewsDate(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function asNewsTeam(team: NonNBATeam, season: number): NBATeam {
  const snapshot = getHistoricalTeamSnapshot(team, season);
  return {
    id: team.tid,
    name: snapshot.name ?? team.name,
    abbrev: snapshot.abbrev ?? team.abbrev ?? team.name.slice(0, 3).toUpperCase(),
    region: snapshot.region ?? team.region,
    conference: team.league,
    cid: team.cid,
    did: team.did,
    wins: Number(snapshot.wins ?? snapshot.won ?? 0),
    losses: Number(snapshot.losses ?? snapshot.lost ?? 0),
    strength: Number(snapshot.strength ?? 0),
    logoUrl: getResolvedTeamLogoUrl(team, season) || undefined,
  };
}

function selectedEuroLeagueNames(state: GameState): Set<string> {
  const names = new Set<string>();
  for (const competition of state.activeCompetitions ?? []) {
    if (competition.teamSelector.startsWith('league:')) {
      names.add(competition.teamSelector.slice('league:'.length));
    } else if (competition.teamSelector === 'allEndesa') {
      names.add('Endesa');
    } else if (competition.teamSelector === 'allEuroleague') {
      names.add('Euroleague');
    }
  }
  return names;
}

export function buildEuroNewsTeamOptions(state: GameState, season: number): EuroNewsTeamOption[] {
  const explicitTids = new Set(
    Object.values(state.euroCompetitionTeamTids ?? {}).flat().map(Number),
  );
  if (state.userTeamId != null) explicitTids.add(Number(state.userTeamId));
  const leagueNames = selectedEuroLeagueNames(state);
  const aliases = state.clubAliasMap ?? {};
  const teamsByTid = new Map((state.nonNBATeams ?? []).map(team => [team.tid, team]));
  const grouped = new Map<number, NonNBATeam[]>();

  for (const team of state.nonNBATeams ?? []) {
    const canonicalTid = Number(aliases[team.tid] ?? team.tid);
    const included = explicitTids.has(team.tid)
      || explicitTids.has(canonicalTid)
      || leagueNames.has(team.league);
    if (!included) continue;
    const country = getTeamCountry(team, state);
    if (!country || country === 'USA' || country === 'Philippines') continue;
    const rows = grouped.get(canonicalTid) ?? [];
    rows.push(team);
    grouped.set(canonicalTid, rows);
  }

  return [...grouped.entries()]
    .map(([canonicalTid, rows]): EuroNewsTeamOption | null => {
      const primary = teamsByTid.get(canonicalTid) ?? rows[0];
      if (!primary) return null;
      const team = asNewsTeam(primary, season);
      const country = getTeamCountry(primary, state);
      if (!country) return null;
      const name = getTeamFullName(team);
      const teamIds = [...new Set([canonicalTid, ...rows.map(row => row.tid)])];
      const searchTerms = [...new Set([
        name,
        team.name,
        team.region ?? '',
        team.abbrev,
        ...rows.flatMap(row => [row.name, row.region ?? '', row.abbrev ?? '']),
      ].map(compactNewsText).filter(Boolean))];
      return {
        id: canonicalTid,
        teamIds,
        name,
        abbrev: team.abbrev,
        country,
        logoUrl: team.logoUrl,
        searchTerms,
        team,
      };
    })
    .filter((team): team is EuroNewsTeamOption => team !== null)
    .sort((left, right) => left.country.localeCompare(right.country) || left.name.localeCompare(right.name));
}

let recapPromise: Promise<RawEuropeSeasonRecap[]> | null = null;

async function loadEuropeSeasonRecaps(): Promise<RawEuropeSeasonRecap[]> {
  if (!recapPromise) {
    recapPromise = fetch(EURO_RECAP_PATH)
      .then(response => readJsonResponse<unknown>(response, 'European season recap archive'))
      .then(payload => Array.isArray(payload) ? payload as RawEuropeSeasonRecap[] : [])
      .catch(error => {
        recapPromise = null;
        throw error;
      });
  }
  return recapPromise;
}

export async function fetchEuroOpeningSeasonRecaps(
  completedEndYear: number,
  supportedCountries: string[],
): Promise<NewsItem[]> {
  if (!Number.isFinite(completedEndYear)) return [];
  const supported = new Set(supportedCountries);
  const recaps = await loadEuropeSeasonRecaps();
  return recaps
    .filter(recap => Number(recap.endYear) === completedEndYear)
    .filter(recap => recap.level !== 'domestic' || supported.has(compactNewsText(recap.market)))
    .map((recap): NewsItem => {
      const market = compactNewsText(recap.market);
      const domestic = recap.level === 'domestic';
      const sourceUrl = compactNewsText(recap.sourceUrl);
      return {
        id: `europe-season-recap-${compactNewsText(recap.competitionId)}-${compactNewsText(recap.season)}`,
        category: 'Season Recap',
        date: displayNewsDate(compactNewsText(recap.date)),
        title: compactNewsText(recap.title) || `${compactNewsText(recap.competitionName)} ${compactNewsText(recap.seasonLabel)} recap`,
        content: compactNewsText(recap.description),
        imageUrl: compactNewsText(recap.imageUrl) || undefined,
        impact: domestic ? 'standard' : 'high',
        url: sourceUrl || '#',
        sourceUrl: sourceUrl || undefined,
        skipAiExpansion: true,
        countries: domestic && market ? [market] : undefined,
        competitionId: compactNewsText(recap.competitionId) || undefined,
        scope: domestic ? 'country' : 'europe-wide',
        league: 'euro',
        leagueId: 'euro',
      } as NewsItem;
    })
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

function tournamentArticle(tournament: InternationalTournamentState, asOfDate: string): NewsItem | null {
  const title = internationalTournamentTitle(tournament.kind);
  const completed = Boolean(tournament.result) && (tournament.status === 'complete' || tournament.status === 'reviewed');
  const finalGame = tournament.games.find(game => game.phase === 'final');
  const date = finalGame?.date ?? `${tournament.year}-01-01`;
  if (completed && compactNewsText(date).slice(0, 10) > compactNewsText(asOfDate).slice(0, 10)) return null;
  if (completed && tournament.result) {
    const champion = tournament.teams.find(team => team.id === tournament.result?.championTeamId);
    const runnerUp = tournament.teams.find(team => team.id === tournament.result?.runnerUpTeamId);
    if (!champion) return null;
    const rendered = renderNewsTemplate('international_champion', {
      championName: champion.country,
      tournamentName: title,
      runnerUpClause: runnerUp ? ` after defeating ${runnerUp.country}` : '',
      scoreClause: tournament.result.finalScore ? `, ${tournament.result.finalScore}` : '',
    }, { seed: tournament.id });
    if (!rendered) return null;
    return {
      id: `international-result-${tournament.id}`,
      category: 'International',
      date: displayNewsDate(date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: champion.imageUrl,
      impact: 'high',
      url: '#',
      skipAiExpansion: true,
      countries: [champion.country, runnerUp?.country].filter((country): country is string => Boolean(country)),
      competitionId: tournament.competitionId,
      scope: 'international',
    };
  }

  const hosts = tournament.hostCountries.join(' and ');
  const rendered = renderNewsTemplate('international_field_set', {
    tournamentName: title,
    year: tournament.year,
    teamCount: tournament.teams.length,
    hostClause: hosts ? ` in ${hosts}` : '',
  }, { seed: tournament.id });
  if (!rendered) return null;
  return {
    id: `international-field-${tournament.id}`,
    category: 'International',
    date: displayNewsDate(date),
    title: rendered.headline,
    content: rendered.content,
    imageUrl: tournament.teams[0]?.imageUrl,
    impact: 'standard',
    url: '#',
    skipAiExpansion: true,
    countries: [...new Set([...tournament.hostCountries, ...tournament.teams.map(team => team.country)])],
    competitionId: tournament.competitionId,
    scope: 'international',
  };
}

export function buildSharedInternationalArticles(state: GameState): NewsItem[] {
  const currentYear = Number(state.leagueStats?.year ?? compactNewsText(state.date).slice(0, 4));
  const currentTournamentId = state.internationalTournament?.id;
  const tournaments = [...(state.internationalTournamentHistory ?? []), state.internationalTournament]
    .filter((tournament): tournament is InternationalTournamentState => Boolean(tournament))
    .filter(tournament => tournament.id === currentTournamentId || tournament.year <= currentYear);
  const unique = new Map(tournaments.map(tournament => [tournament.id, tournament]));
  return [...unique.values()]
    .sort((left, right) => right.year - left.year)
    .slice(0, 8)
    .map(tournament => tournamentArticle(tournament, state.date))
    .filter((article): article is NewsItem => article !== null);
}

export function articleMatchesEuroPortal(
  article: NewsItem,
  selectedCountry: string | null,
  selectedTeam: EuroNewsTeamOption | null,
): boolean {
  const metadata = article as NewsItem & { league?: string; leagueId?: string };
  const leagueId = metadata.leagueId ?? metadata.league;
  if (leagueId && leagueId !== 'euro') return false;
  if (leagueId !== 'euro' && article.scope !== 'international') return false;
  if (selectedTeam) {
    const articleTeamIds = new Set(article.teamIds ?? []);
    if (!selectedTeam.teamIds.some(tid => articleTeamIds.has(tid))) return false;
  }
  if (!selectedCountry) return true;
  if (article.scope === 'europe-wide' || article.scope === 'international') return true;
  return (article.countries ?? []).includes(selectedCountry);
}
