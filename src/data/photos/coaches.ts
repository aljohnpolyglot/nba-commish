const COACH_PHOTOS_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/60f5ef1e4d09066d1001a9acf3de127a/raw/516852da634669f0f2cd68d6fb1ba5371cb5d15a/coach_photos.json";
const COACHES_SLUG_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/507a565da541f171a066ec546c3cdd57/raw/8126d3e15aeada369db649943a9486e08e7c3d7f/coahes_slug";

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
let _fetched = false;

export const fetchCoachData = async (): Promise<void> => {
  if (_fetched) return;
  try {
    const [photosRes, slugsRes] = await Promise.all([
      fetch(COACH_PHOTOS_GIST),
      fetch(COACHES_SLUG_GIST),
    ]);
    if (photosRes.ok) _photos = await photosRes.json();
    if (slugsRes.ok) _slugs = await slugsRes.json();
    _fetched = true;
  } catch (e) {
    console.error('[CoachData] fetch failed', e);
  }
};

export const getCoachPhoto = (name: string): string | undefined => _photos[name];
export const getCoachSlug  = (name: string): string | undefined => _slugs.find(c => c.name === name)?.slug;
export const getAllCoaches  = (): CoachData[] => _slugs;
