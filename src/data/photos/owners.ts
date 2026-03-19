const OWNER_PHOTOS_GIST = "https://gist.github.com/aljohnpolyglot/e6dc34be82219e02ff153593eac1470c/raw/f72e3a1f40f2054f970b8e7b58a8824ad22e2902/owner_photos.json";

let _photos: Record<string, string> = {};
let _fetched = false;

export const fetchOwnerPhotos = async (): Promise<void> => {
  if (_fetched) return;
  try {
    const res = await fetch(OWNER_PHOTOS_GIST);
    if (res.ok) _photos = await res.json();
    _fetched = true;
  } catch (e) {
    console.error('[OwnerPhotos] fetch failed', e);
  }
};

export const getOwnerPhoto = (name: string): string | undefined => _photos[name];
