export type SponsorshipSlot = 'kit' | 'sleeve' | 'stadium';
export type TycoonTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface Sponsorship {
  sponsor: string;
  valuePerYear: number; // EUR
  yearsRemaining: number;
  signedYear: number;
}

export interface FacilityState {
  level: number; // 1–5
  upgradePending?: {
    targetLevel: number;
    finishYear: number;
    cost: number;
  };
}

export interface StadiumFacilityState extends FacilityState {
  capacity: number;
}

export interface AnnualLedger {
  year: number;
  revenue: {
    matchday: number;
    sponsorship: number;
    prize: number;
    tv: number;
    transfer: number; // MVP = 0
  };
  expenses: {
    wages: number;
    staff: number;
    facility: number;
    scouting: number;
    travel: number;
    financeCosts: number; // MVP = 0
  };
  profit: number;
  cashOnHandEnd: number;
  ffpDeficitContribution: number; // min(profit, 0)
}

export interface TycoonState {
  tier: TycoonTier;
  sponsorships: {
    kit: Sponsorship | null;
    sleeve: Sponsorship | null;
    stadium: Sponsorship | null;
  };
  facilities: {
    stadium: StadiumFacilityState;
    trainingCenter: FacilityState;
    academy: FacilityState;
  };
  ledgerHistory: AnnualLedger[]; // letzte 10, FIFO
  cashOnHand: number; // EUR
  boardConfidence: number; // 0–100, MVP = 60 static
  ffpRollingDeficit: number;
  /** Transient flag von eventChecker, dämpft nächste Sponsorship-Renewal-Berechnung */
  nextRenewalPenaltyFactor?: number;
}

export interface TierBase {
  stadiumCapacity: number;
  ticketPrice: number;
  tvRevenue: number; // EUR/year
  sponsorshipFloor: Record<SponsorshipSlot, number>; // EUR/year per slot
  facilityOpsPerLevel: number;
  travelBase: number;
  scoutingBudget: number;
  startingCash: number;
}
