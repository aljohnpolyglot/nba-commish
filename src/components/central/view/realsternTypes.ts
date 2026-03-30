export interface Asset {
  id: string;
  title: string;
  price: number;
  location: string;
  state?: string;
  city?: string;
  image: string;
  description?: string;
  category: 'Real Estate' | 'Experience' | 'Luxury' | 'Elite';
  details?: {
    beds?: string;
    baths?: string;
    office?: string;
  };
}

export interface OwnedAsset extends Asset {
  purchasedAt: string;
  instanceId: string;
}

export interface GameState {
  personalWealth: number;
  inventory: OwnedAsset[];
}
