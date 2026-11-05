import { getHistoricalCoachPhoto } from '../../services/staff/historicalNbaCoaches';
import { readJsonResponse } from '../../services/utils/jsonResponse';
import { getPbaStaffPortrait } from '../../services/pba/staffSources';

const COACH_PHOTOS_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/60f5ef1e4d09066d1001a9acf3de127a/raw/516852da634669f0f2cd68d6fb1ba5371cb5d15a/coach_photos.json";
const COACHES_SLUG_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/507a565da541f171a066ec546c3cdd57/raw/8126d3e15aeada369db649943a9486e08e7c3d7f/coahes_slug";
const NBA2K_COACH_LIST_URL = "https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nba2kcoachlist";

export interface CoachData {
  name: string;
  team: string;
  conf: string;
  div: string;
  slug: string;
  img: string;
}

let _photos: Record<string, string> = {};
let _slugs: CoachData[] = [];
let _nba2kImages: Record<string, string> = {};
let _fetched = false;
let _fetchPromise: Promise<void> | null = null;

const normalizeCoachName = (name: string): string => name
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLowerCase();

export const fetchCoachData = async (): Promise<void> => {
  if (_fetched) return;
  if (_fetchPromise) return _fetchPromise;
  const loadOptional = async <T,>(url: string, label: string): Promise<T | null> => {
    try {
      return await readJsonResponse<T>(await fetch(url), label);
    } catch (error) {
      console.warn(`[CoachPhotos] ${label} unavailable`, error);
      return null;
    }
  };
  _fetchPromise = (async () => {
    const [photos, slugs, nba2kCoaches] = await Promise.all([
      loadOptional<Record<string, string>>(COACH_PHOTOS_GIST, 'Coach photo catalog'),
      loadOptional<CoachData[]>(COACHES_SLUG_GIST, 'Coach slug catalog'),
      loadOptional<Array<{ name: string; image: string }>>(NBA2K_COACH_LIST_URL, 'NBA coach portrait catalog'),
    ]);
    if (photos && typeof photos === 'object' && !Array.isArray(photos)) {
      _photos = Object.fromEntries(Object.entries(photos).map(([name, image]) => [normalizeCoachName(name), image]));
    }
    if (Array.isArray(slugs)) _slugs = slugs;
    if (Array.isArray(nba2kCoaches)) {
      for (const coach of nba2kCoaches) {
        if (coach?.name && coach.image) _nba2kImages[normalizeCoachName(coach.name)] = coach.image;
      }
    }
    _fetched = true;
  })();
  try {
    await _fetchPromise;
  } finally {
    _fetchPromise = null;
  }
};

/** Returns coach photo URL with fallback chain: gist photo → 2K image → slug img → undefined */
export const getCoachPhoto = (name: string): string | undefined =>
  _photos[normalizeCoachName(name)]
  || _nba2kImages[normalizeCoachName(name)]
  || _slugs.find(coach => normalizeCoachName(coach.name) === normalizeCoachName(name))?.img
  || getPbaStaffPortrait(name)
  || getHistoricalCoachPhoto(name);

export const getCoachSlug  = (name: string): string | undefined => _slugs.find(coach => normalizeCoachName(coach.name) === normalizeCoachName(name))?.slug;
export const getAllCoaches  = (): CoachData[] => _slugs;
