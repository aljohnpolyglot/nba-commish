const COACH_PHOTOS_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/60f5ef1e4d09066d1001a9acf3de127a/raw/dc4d96ce84d7ee647a315cd320cd1557a0253467/coach_photos.json";
const COACHES_SLUG_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/507a565da541f171a066ec546c3cdd57/raw/4ee6024d54aa947b57b7d1fc0df472fe77edc1d9/coahes_slug";

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
    if (slugsRes.ok) {
      const text = await slugsRes.text();
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        const json = text.slice(start, end + 1)
          .replace(/\/\/[^\n]*/g, '')
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
          .replace(/'/g, '"')
          .replace(/,(\s*[}\]])/g, '$1');
        _slugs = JSON.parse(json);
      }
    }
    _fetched = true;
  } catch (e) {
    console.error('[CoachData] fetch failed', e);
  }
};

export const getCoachPhoto = (name: string): string | undefined => _photos[name];
export const getCoachSlug  = (name: string): string | undefined => _slugs.find(c => c.name === name)?.slug;
export const getAllCoaches  = (): CoachData[] => _slugs;
