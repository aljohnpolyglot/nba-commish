export interface Payslip {
  id: string;
  date: string;
  payPeriod: string;
  grossPay: number;
  federalTax: number;
  stateTax: number;
  cityTax: number;
  netPay: number;
  daysPaid: number;
}

export interface BetLeg {
  gameId?: number;
  playerId?: string;
  description: string;
  odds: number;
  condition: string;
}

export interface Bet {
  id: string;
  date: string;
  type: 'moneyline' | 'over_under' | 'spread' | 'parlay';
  status: 'pending' | 'won' | 'lost';
  wager: number;
  potentialPayout: number;
  legs: BetLeg[];
}

export interface CommishStoreItem {
  product: {
    title: string;
    price: string;
    image: string;
    isStatic?: boolean;
    link?: string;
    category?: string;
  };
  quantity: number;
  date: string;
}

export interface OwnedRealEstateAsset {
  id: string;
  title: string;
  price: number;
  location: string;
  state?: string;
  city?: string;
  image: string;
  description?: string;
  category: string;
  details?: { beds?: string; baths?: string; office?: string };
  purchasedAt: string;
  instanceId: string;
}
