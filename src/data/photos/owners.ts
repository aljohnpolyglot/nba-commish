const OWNER_PHOTOS_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/e6dc34be82219e02ff153593eac1470c/raw/67720b21bbb3d71d9bb8693ef3d0707e95267318/owner_photos.json";

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
