import { dataUrlCandidates } from '../utils/dataProxy';
import { readJsonResponse } from '../utils/jsonResponse';

export const PBA_COACH_SOURCE_URLS = [
  '/data/external/pba/pba-historical-coaches.json',
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pbahistoricalcoaches.json',
] as const;
export const PBA_TEAM_HISTORY_SOURCE_URLS = [
  '/data/external/pba/pba-teams-history-logos-colors.json',
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pba-teams-history-logos-colors',
] as const;

export type PbaCoachCareerRow = {
  years?: string;
  team?: string;
};

export type PbaHistoricalCoach = {
  id?: string;
  name?: string;
  retiredYear?: number | null;
  retireddYer?: number | null;
  retirementYear?: number | null;
  lastSeason?: number | null;
  season_max?: number | null;
  image?: string | {
    url?: string;
    originalUrl?: string;
    originalFileUrl?: string;
    largestThumbnailUrl?: string;
    thumbnailUrl?: string;
  };
  allInfoboxFields?: Record<string, string>;
  careerInformation?: {
    coachingCareer?: string | null;
  };
  rating?: {
    coachRating?: number;
    percentile?: number;
  };
  awards?: Array<{
    originalText?: string;
    type?: string;
    role?: string;
    count?: number;
  }>;
  experience?: {
    headCoachYears?: number;
    assistantCoachYears?: number;
    consultantYears?: number;
    totalCoachingYears?: number;
  } | Array<{
    headCoachYears?: number;
    assistantCoachYears?: number;
    consultantYears?: number;
    totalCoachingYears?: number;
  }>;
  careerHistory?: {
    headCoaching?: PbaCoachCareerRow[];
    assistantCoaching?: PbaCoachCareerRow[];
    consulting?: PbaCoachCareerRow[];
    youthCoaching?: PbaCoachCareerRow[];
    other?: PbaCoachCareerRow[];
  };
};

export type PbaHistoricalCoachSource = {
  metadata?: {
    generatedAt?: string;
    coachCount?: number;
  };
  coaches: PbaHistoricalCoach[];
};

export type PbaTeamLogoPeriod = {
  from?: number;
  to?: number;
  present?: boolean;
};

export type PbaTeamLogoRow = {
  id?: string;
  sectionName?: string;
  pageTitle?: string;
  periods?: PbaTeamLogoPeriod[];
  originalUrl?: string;
  displayedUrl?: string;
  palette5?: string[] | null;
  dataRelevant?: string;
};

export type PbaTeamHistoryPage = {
  title?: string;
  displayTitle?: string;
  isTeam?: boolean;
  navLabels?: string[];
  logos?: PbaTeamLogoRow[];
};

export type PbaTeamHistorySource = {
  meta?: {
    generatedAt?: string;
    schemaVersion?: number;
  };
  pages: PbaTeamHistoryPage[];
  logos?: PbaTeamLogoRow[];
};

export type HistoricalPbaRemoteSources = {
  coaches: PbaHistoricalCoachSource;
  teams: PbaTeamHistorySource;
  coachSourceVersion: string;
  teamHistorySourceVersion: string;
};

let sourcePromise: Promise<HistoricalPbaRemoteSources> | null = null;
let cachedSources: HistoricalPbaRemoteSources | null = null;
let teamSourcePromise: Promise<PbaTeamHistorySource> | null = null;
let cachedTeamSource: PbaTeamHistorySource | null = null;

async function fetchJson<T>(urls: string[], label: string): Promise<T> {
  const failures: string[] = [];
  for (const candidate of dataUrlCandidates(urls)) {
    try {
      const response = await fetch(candidate, { cache: 'no-store' });
      return await readJsonResponse<T>(response, `${label} (${candidate})`);
    } catch (error) {
      failures.push(`${error instanceof Error ? error.message : String(error)} ${candidate}`);
    }
  }
  throw new Error(`${label} could not be loaded headlessly (${failures.join(' | ')})`);
}

export async function loadHistoricalPbaRemoteSources(): Promise<HistoricalPbaRemoteSources> {
  if (!sourcePromise) {
    sourcePromise = Promise.all([
      fetchJson<PbaHistoricalCoachSource>([...PBA_COACH_SOURCE_URLS], 'Historical PBA coaches')
        .catch((): PbaHistoricalCoachSource => ({ coaches: [] })),
      loadHistoricalPbaTeamHistorySource(),
    ]).then(([coaches, teams]) => {
      if (!Array.isArray(teams.pages) || teams.pages.length === 0) {
        throw new Error('Historical PBA team source has no team pages.');
      }
      cachedSources = {
        coaches,
        teams,
        coachSourceVersion: coaches.metadata?.generatedAt ?? (coaches.coaches.length > 0 ? `coaches-${coaches.coaches.length}` : 'coaches-unavailable'),
        teamHistorySourceVersion: teams.meta?.generatedAt ?? `team-history-${teams.meta?.schemaVersion ?? 1}`,
      };
      return cachedSources;
    }).catch(error => {
      sourcePromise = null;
      throw error;
    });
  }
  return sourcePromise;
}

export const getCachedHistoricalPbaRemoteSources = (): HistoricalPbaRemoteSources | null => cachedSources;

export async function loadHistoricalPbaTeamHistorySource(): Promise<PbaTeamHistorySource> {
  if (!teamSourcePromise) {
    teamSourcePromise = fetchJson<PbaTeamHistorySource>([...PBA_TEAM_HISTORY_SOURCE_URLS], 'Historical PBA team identities')
      .then(source => {
        if (!Array.isArray(source.pages) || source.pages.length === 0) {
          throw new Error('Historical PBA team source has no team pages.');
        }
        cachedTeamSource = source;
        return source;
      })
      .catch(error => {
        teamSourcePromise = null;
        throw error;
      });
  }
  return teamSourcePromise;
}

export const getCachedHistoricalPbaTeamHistorySource = (): PbaTeamHistorySource | null => cachedTeamSource;
