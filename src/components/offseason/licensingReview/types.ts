export type LeagueMode = 'euroleague' | 'liga_endesa';

export interface Team {
  id: number;
  name: string;
  logoUrl?: string;
  status: string;
  statusType: 'long-term' | 'active' | 'expiring' | 'expired' | 'vacant' | 'safe' | 'relegated' | 'promoted';
  record?: string;
  rank?: number;
}

export interface Candidate {
  id: number;
  name: string;
  logoUrl?: string;
  performance: number;
  continentalStanding: number;
  clubStanding: number;
  continuity: number;
  totalScore: number;
  isSelected?: boolean;
  incumbent?: boolean;
}

export type EuroLeagueStep = 1 | 2 | 3 | 4;
export type LigaEndesaStep = 1 | 2 | 3 | 4;
