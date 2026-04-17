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

export const fetchCoachData = async (): Promise<void> => {
  if (_fetched) return;
  try {
    const [photosRes, slugsRes, nba2kRes] = await Promise.all([
      fetch(COACH_PHOTOS_GIST),
      fetch(COACHES_SLUG_GIST),
      fetch(NBA2K_COACH_LIST_URL).catch(() => null),
    ]);
    if (photosRes.ok) _photos = await photosRes.json();
    if (slugsRes.ok) _slugs = await slugsRes.json();
    if (nba2kRes && nba2kRes.ok) {
      const list: { name: string; image: string }[] = await nba2kRes.json();
      list.forEach(c => { if (c.image) _nba2kImages[c.name] = c.image; });
    }
    _fetched = true;
  } catch (e) {
    console.error('[CoachData] fetch failed', e);
  }
};

/** Returns coach photo URL with fallback chain: gist photo → 2K image → slug img → undefined */
export const getCoachPhoto = (name: string): string | undefined =>
  _photos[name] || _nba2kImages[name] || _slugs.find(c => c.name === name)?.img || undefined;

export const getCoachSlug  = (name: string): string | undefined => _slugs.find(c => c.name === name)?.slug;
export const getAllCoaches  = (): CoachData[] => _slugs;
