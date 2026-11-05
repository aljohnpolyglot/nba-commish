import { dataUrlCandidates } from '../utils/dataProxy';
import { readJsonResponse } from '../utils/jsonResponse';

const SOURCE_ROOT = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/europeancoaches';
const SOURCE_INDEX_URL = `${SOURCE_ROOT}/european-coaches-index.json`;

export type SourceCareerRow = { years?: string; team?: string };

export type EuropeanCoachSourceCoach = {
  id?: string;
  name?: string;
  retiredYear?: number | null;
  retireddYer?: number | null;
  retirementYear?: number | null;
  wikipediaUrl?: string;
  listedUnderCountries?: string[];
  image?: {
    thumbnailUrl?: string | null;
    largestThumbnailUrl?: string | null;
    originalFileUrl?: string | null;
  };
  biography?: {
    introduction?: string | null;
    birthDate?: string | null;
    birthPlace?: string | null;
    nationality?: string | null;
    died?: string | null;
  };
  currentBasketballRole?: { team?: string | null; position?: string | null };
  careerInformation?: {
    playingCareer?: string | null;
    coachingCareer?: string | null;
  };
  careerHistory?: {
    headCoaching?: SourceCareerRow[];
    assistantCoaching?: SourceCareerRow[];
    consulting?: SourceCareerRow[];
    youthCoaching?: SourceCareerRow[];
    other?: SourceCareerRow[];
  };
  awards?: Array<{
    originalText?: string;
    type?: string;
    role?: string;
    count?: number;
    weightedPoints?: number;
    affectsCoachRating?: boolean;
  }>;
  rating?: { coachRating?: number; percentile?: number };
};

type SourceIndex = {
  metadata?: { generatedAt?: string; coachCount?: number };
  coachCount?: number;
  alphabetFiles?: Array<{ bucket?: string; coachCount?: number; jsonFile?: string }>;
};

type SourceBucket = {
  bucket?: string;
  coachCount?: number;
  coaches?: EuropeanCoachSourceCoach[];
};

export type EuropeanCoachSource = {
  coaches: EuropeanCoachSourceCoach[];
  generatedAt: string;
  coachCount: number;
  sourceVersion: string;
};

let sourcePromise: Promise<EuropeanCoachSource> | null = null;
let cachedSource: EuropeanCoachSource | null = null;

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const failures: string[] = [];
  for (const candidate of dataUrlCandidates([url])) {
    try {
      const response = await fetch(candidate, { cache: 'no-store' });
      return await readJsonResponse<T>(response, `${label} (${candidate})`);
    } catch (error) {
      failures.push(`${error instanceof Error ? error.message : String(error)} ${candidate}`);
    }
  }
  throw new Error(`${label} could not be loaded headlessly (${failures.join(' | ')})`);
}

export async function loadEuropeanCoachSource(): Promise<EuropeanCoachSource> {
  if (!sourcePromise) {
    sourcePromise = fetchJson<SourceIndex>(SOURCE_INDEX_URL, 'European coach index')
      .then(async index => {
        const files = (index.alphabetFiles ?? []).filter(file => Number(file.coachCount ?? 0) > 0 && file.jsonFile);
        if (files.length === 0) throw new Error('European coach index has no populated coach files.');
        const buckets = await Promise.all(files.map(file => fetchJson<SourceBucket>(
          `${SOURCE_ROOT}/${file.jsonFile}`,
          `European coach bucket ${file.bucket ?? file.jsonFile}`,
        )));
        const coaches = buckets.flatMap(bucket => bucket.coaches ?? []);
        const expected = Number(index.coachCount ?? index.metadata?.coachCount ?? 0);
        const uniqueIds = new Set(coaches.map(coach => String(coach.id ?? '')).filter(Boolean));
        if (expected <= 0 || coaches.length !== expected || uniqueIds.size !== coaches.length) {
          throw new Error(`European coach source failed integrity checks (${coaches.length}/${expected}, ${uniqueIds.size} unique).`);
        }
        const generatedAt = String(index.metadata?.generatedAt ?? 'unknown');
        cachedSource = {
          coaches,
          generatedAt,
          coachCount: coaches.length,
          sourceVersion: `${generatedAt}-${coaches.length}`,
        };
        return cachedSource;
      })
      .catch(error => {
        sourcePromise = null;
        throw error;
      });
  }
  return sourcePromise;
}

export const getCachedEuropeanCoachSource = (): EuropeanCoachSource | null => cachedSource;
