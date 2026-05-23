import type { Asset } from './realsternTypes';

export const IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800';

const parseRooms = (s?: string): number => {
  if (!s) return 0;
  const n = parseInt(s);
  return isNaN(n) ? 0 : n;
};

export const estimateSqm = (beds?: string, baths?: string): number => {
  const b = parseRooms(beds);
  const ba = parseRooms(baths);
  const sqft = 1200 + b * 400 + ba * 150;
  return Math.round(sqft * 0.0929);
};

export const fakeDaysListed = (id: string) => {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (hash % 180) + 3;
};

export type SortOption =
  | 'premium'
  | 'popular'
  | 'recent'
  | 'price-asc'
  | 'price-desc'
  | 'area-asc'
  | 'area-desc'
  | 'price-m2-asc'
  | 'price-m2-desc';

export const formatWealth = (millions: number) => {
  if (millions >= 1000) return `$${(millions / 1000).toFixed(2)}B`;
  if (millions >= 1) return `$${millions.toFixed(2)}M`;
  return `$${(millions * 1000).toFixed(0)}K`;
};

type ExternalAssetRecord = {
  id?: string;
  title?: string;
  price?: string | number;
  location?: string;
  image?: string;
  beds?: string;
  baths?: string;
  office?: string;
};

const toAsset = (item: ExternalAssetRecord): Asset => {
  const locParts = item.location ? item.location.split(',').map((s) => s.trim()) : [];
  const city = locParts[0] || 'Unknown';
  const state = locParts[1] || 'Unknown';

  return {
    id: item.id || Math.random().toString(36).slice(2, 11),
    title: item.title || 'Untitled Asset',
    price: parseInt(String(item.price ?? '0')) || 1_000_000,
    location: item.location || 'Unknown',
    city,
    state,
    image: item.image,
    category: 'Real Estate',
    details: {
      beds: item.beds,
      baths: item.baths,
      office: item.office,
    },
  };
};

export const fetchExternalAssets = async (): Promise<Asset[] | null> => {
  const response = await fetch(
    'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/realestatedata'
  );
  if (!response.ok) return null;
  const text = await response.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) return null;

  const formatted = data.map((item) => toAsset(item as ExternalAssetRecord));
  const withValidImages = formatted.filter(
    (asset) => asset.image && asset.image.startsWith('https://img.jamesedition.com')
  );

  const uniqueMap = new Map<string, Asset>();
  withValidImages.forEach((asset) => {
    const key = `${asset.title}-${asset.price}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, asset);
    }
  });

  return Array.from(uniqueMap.values());
};
