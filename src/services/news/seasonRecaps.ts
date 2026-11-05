import type { NewsItem } from '../../components/news/types';
import type { NBAPlayer, NBATeam } from '../../types';
import type { SeasonHistoryEntry } from '../../types/offseason';
import { getTeamFullName } from '../../utils/teamNames';
import { getPlayerImage } from '../../components/central/view/bioCache';
import { STATIC_NBA_TEAMS, staticNbaTeamLogo } from '../../data/staticNbaTeams';
import { readJsonResponse } from '../utils/jsonResponse';

const NBA_SEASON_RECAPS_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbaseasonrecaps';

interface RawRecapLink {
  text?: string;
  url?: string;
}

interface RawSeasonRecap {
  season?: string;
  sourceUrl?: string;
  pageTitle?: string;
  subtitle?: string;
  headline?: string;
  heroImage?: string;
  ogImage?: string;
  articleText?: string;
  articleHtml?: string;
  links?: RawRecapLink[];
}

interface RawSeasonRecapPayload {
  seasons?: RawSeasonRecap[];
}

let recapsPromise: Promise<RawSeasonRecap[]> | null = null;

function twoDigitYear(year: number): string {
  return String(year).slice(-2).padStart(2, '0');
}

export function previousNbaSeasonLabelForStartYear(startYear: number): string | null {
  if (!Number.isFinite(startYear) || startYear < 1947) return null;
  return `${startYear - 1}-${twoDigitYear(startYear)}`;
}

export function getSeasonReviewDestination(
  news: Array<Partial<NewsItem> & { headline?: string }> | undefined,
  completedSeason: number,
  uiMode?: string,
): { view: 'League News' | 'League History'; articleId?: string } {
  if (uiMode === 'euro_isolated') return { view: 'League History', articleId: undefined };
  const seasonLabel = previousNbaSeasonLabelForStartYear(completedSeason);
  const exactId = seasonLabel ? `nba-season-recap-${seasonLabel}` : '';
  const article = (news ?? []).find(item => item.id === exactId)
    ?? (news ?? []).find(item => {
      if (!seasonLabel) return false;
      const text = `${item.id ?? ''} ${item.title ?? ''} ${item.headline ?? ''}`;
      return String(item.category ?? '').toLowerCase() === 'season recap' && text.includes(seasonLabel);
    });
  return article?.id
    ? { view: 'League News', articleId: article.id }
    : { view: 'League History', articleId: undefined };
}

export function buildOpeningSeasonReviewNews(
  leagueName: string,
  seasonLabel: string,
  date: string,
): NewsItem {
  return {
    id: `opening-season-review-${leagueName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${seasonLabel}`,
    category: 'Season Recap',
    date,
    title: `${seasonLabel} ${leagueName} Season Review`,
    content: `The ${seasonLabel} season is complete. Review the final standings, postseason results, awards, and roster decisions before the new campaign begins.`,
    impact: 'high',
    url: '#',
    skipAiExpansion: true,
  };
}

function recapDateForSeason(season: string): string {
  const match = season.match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const startYear = Number(match[1]);
  const endYear = startYear + 1;
  if (season === '2019-20') return '2020-10-12';
  return `${endYear}-06-30`;
}

function formatDisplayDate(date: string): string {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return date;
  }
}

function compactText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function readMoreLinks(links: RawRecapLink[] | undefined, sourceUrl?: string): Array<{ text: string; url: string }> {
  const seen = new Set<string>();
  return (links ?? [])
    .map(link => ({
      text: compactText(link.text),
      url: compactText(link.url),
    }))
    .filter(link => {
      if (!link.text || !/^https?:\/\//i.test(link.url)) return false;
      if (/^(previous|next) season$/i.test(link.text)) return false;
      if (sourceUrl && link.url === sourceUrl) return false;
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .slice(0, 6);
}

async function fetchSeasonRecaps(): Promise<RawSeasonRecap[]> {
  if (!recapsPromise) {
    recapsPromise = fetch(NBA_SEASON_RECAPS_URL)
      .then(response => readJsonResponse<RawSeasonRecapPayload>(response, 'NBA season recap archive'))
      .then(payload => Array.isArray(payload.seasons) ? payload.seasons : [])
      .catch(error => {
        recapsPromise = null;
        throw error;
      });
  }
  return recapsPromise;
}

export async function fetchPriorNbaSeasonRecap(startYear: number): Promise<NewsItem | null> {
  const season = previousNbaSeasonLabelForStartYear(startYear);
  if (!season) return null;

  const recaps = await fetchSeasonRecaps();
  const recap = recaps.find(item => item.season === season);
  if (!recap) return null;

  const title = compactText(recap.pageTitle) || `Season Review: ${season}`;
  const summary = compactText(recap.subtitle) || compactText(recap.headline) || compactText(recap.articleText).slice(0, 220);
  const sourceUrl = compactText(recap.sourceUrl);
  return {
    id: `nba-season-recap-${season}`,
    category: 'Season Recap',
    date: formatDisplayDate(recapDateForSeason(season)),
    title,
    content: summary,
    imageUrl: compactText(recap.heroImage) || compactText(recap.ogImage) || undefined,
    impact: 'high',
    url: sourceUrl || '#',
    htmlContent: recap.articleHtml,
    sourceUrl: sourceUrl || undefined,
    readMoreLinks: readMoreLinks(recap.links, sourceUrl),
    skipAiExpansion: true,
  };
}

export function buildSavedNbaSeasonRecaps(
  history: SeasonHistoryEntry[] | undefined,
  nbaTeams: NBATeam[] | undefined,
  players: NBAPlayer[] | undefined,
): NewsItem[] {
  const fallbackTeams = STATIC_NBA_TEAMS.map(team => ({
    id: team.tid,
    region: team.region,
    name: team.name,
    abbrev: team.abbrev,
    logoUrl: staticNbaTeamLogo(team),
  })) as unknown as NBATeam[];
  const teams = [...fallbackTeams, ...(nbaTeams ?? []).filter(team => team.id >= 0 && team.id < 100)];
  const playerPool = (players ?? []).filter(player => player.tid >= 0 && player.tid < 100);
  const teamById = new Map(teams.map(team => [Number(team.id), team]));
  return (history ?? [])
    .map((entry): NewsItem | null => {
      const champion = teamById.get(Number(entry.championTid));
      if (!champion) return null;
      const runnerUp = entry.runnerUpTid != null ? teamById.get(Number(entry.runnerUpTid)) : undefined;
      const championName = getTeamFullName(champion);
      const details = [
        runnerUp ? `${championName} finished the title run against ${getTeamFullName(runnerUp)}.` : `${championName} finished the season as NBA champions.`,
        entry.mvp ? `${entry.mvp} was named league MVP.` : '',
        entry.finalsMvp ? `${entry.finalsMvp} earned Finals MVP.` : '',
        entry.roty ? `${entry.roty} was Rookie of the Year.` : '',
        entry.dpoy ? `${entry.dpoy} won Defensive Player of the Year.` : '',
      ].filter(Boolean).join(' ');
      const featuredName = entry.finalsMvp ?? entry.mvp;
      const featuredPlayer = featuredName ? playerPool.find(player => player.name === featuredName) : undefined;
      return {
        id: `nba-branch-season-recap-${entry.year}`,
        category: 'Season Recap',
        date: formatDisplayDate(`${entry.year}-06-30`),
        title: `${entry.year} NBA Season Recap: ${championName} are champions`,
        content: details,
        imageUrl: featuredPlayer ? getPlayerImage(featuredPlayer) : champion.logoUrl,
        impact: 'high' as const,
        url: '#',
        skipAiExpansion: true,
      };
    })
    .filter((item): item is NewsItem => item !== null)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}
