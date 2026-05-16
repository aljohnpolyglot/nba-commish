export type SponsorshipSlot = 'kit' | 'sleeve' | 'back' | 'shorts' | 'training' | 'court' | 'stadium' | 'practice';
export const ALL_SLOTS: SponsorshipSlot[] = ['kit', 'sleeve', 'back', 'shorts', 'training', 'court', 'stadium', 'practice'];
export const CORE_SLOTS: SponsorshipSlot[] = ['kit', 'sleeve', 'stadium'];
export type TycoonTier = 'S' | 'A' | 'B' | 'C' | 'D';

export type SponsorIndustry =
  | 'airline'
  | 'tech'
  | 'fashion'
  | 'bank'
  | 'auto'
  | 'telecom'
  | 'beer'
  | 'water'
  | 'energy_drink'
  | 'gambling'
  | 'sportswashing'
  | 'generic';

export type SponsorArchetype = 'premium' | 'gambling' | 'tech' | 'local' | 'generic';

export interface SponsorRelationshipEntry {
  year: number;
  /** Either narrow event type (sign/renew used by applyRenewal) or richer ledger
   *  events written by sponsorship-engine helpers. Loosened to a union of both
   *  ergonomic shapes so the engine doesn't need a separate type per write
   *  site. */
  eventType?: 'sign' | 'renew';
  event?: 'signed' | 'renewed' | 'breached' | 'conflict' | 'paid';
  value?: number;
  delta?: number;
  note?: string;
}

export interface Sponsorship {
  sponsor: string;
  valuePerYear: number; // EUR
  yearsRemaining: number;
  signedYear: number;
  industry?: SponsorIndustry;
  archetype?: SponsorArchetype;
  personality?: string;
  personalityProse?: string;
  /** EUR one-time bonus paid up front when the contract was signed. */
  signingBonus?: number;
  /** Append-only log of contractual milestones with this sponsor. */
  relationshipHistory?: SponsorRelationshipEntry[];
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
    medical?: number;
    academy?: number;
  };
  profit: number;
  cashOnHandEnd: number;
  ffpDeficitContribution: number; // min(profit, 0)
}

export interface TravelPreferences {
  hotel: number;   // 1–5 quality tier
  flight: number;  // 1–5 quality tier
  bus: number;     // 1–5 quality tier
}

export interface PendingSponsorReview {
  /** Deterministic id used to dedupe re-seeds of the same review window. */
  id?: string;
  year?: number;
  openSlots: SponsorshipSlot[];
  expiringSlots: SponsorshipSlot[];
  conflictWarnings: string[];
}

/** Same payload as PendingSponsorReview but with required id+year. Returned by
 *  euroTycoonOps.buildSponsorReview to write into TycoonState.pendingSponsorReview. */
export interface SponsorReview {
  id: string;
  year: number;
  openSlots: SponsorshipSlot[];
  expiringSlots: SponsorshipSlot[];
  conflictWarnings: string[];
}

export interface BoardPromise {
  id: string;
  year: number;
  type: 'cash' | 'medical' | 'scouting';
  label: string;
  target: number;
  progress: number;
  status: 'active' | 'kept' | 'missed';
  confidenceDelta: number;
}

export interface FinanceRecapLine {
  label: string;
  amount: number;
  kind: 'income' | 'expense' | 'note';
}

export interface FinanceRecapPending {
  id: string;
  startDate: string;
  endDate: string;
  cashIn: number;
  cashOut: number;
  net: number;
  cashOnHand: number;
  nextPayday: string;
  lines: FinanceRecapLine[];
}

export interface FinanceRecapSettings {
  enabled?: boolean;
  mutedMonth?: string;
}

export interface OneTimePayout {
  id?: string;
  year: number;
  brand: string;
  amount: number;
  kind: 'endorsement' | 'sponsorship';
  date: string;
  expiresAfterYear?: number;
  offerLabel?: string;
  slotLabel?: string;
  industry?: SponsorIndustry | 'generic';
}

export interface PressConferencePendingOption {
  id: 'support' | 'discipline' | 'deflect';
  label: string;
  boardDelta: number;
  moraleDelta: number;
}

export interface PressConferencePending {
  id: string;
  playerId: string;
  playerName: string;
  headline: string;
  prompt: string;
  options: PressConferencePendingOption[];
}

export interface PlayerDramaLogEntry {
  id: string;
  date: string;
  playerId: string;
  playerName: string;
  response: PressConferencePendingOption['id'];
  boardDelta: number;
  moraleDelta: number;
}

export interface TycoonState {
  tier: TycoonTier;
  sponsorships: Partial<Record<SponsorshipSlot, Sponsorship | null>>;
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
  boardPromises?: BoardPromise[];
  medicalBudget?: number;        // EUR/year
  /** Youth academy spending tier 0-5 (None → World Class). Drives prospect
   *  spawn quality at the start of each offseason. Costs are billed via
   *  ACADEMY_BUDGET_TIERS[budget].cost on the bi-weekly cadence run. */
  academyBudget?: number;        // 0-5 tier index
  travelPreferences?: TravelPreferences;
  scoutingInvestment?: number;   // EUR/year
  cityPrestige?: number;         // 0–1
  ticketPriceMultiplier?: number;
  budgetLocked?: boolean;
  budgetLockedYear?: number;
  pendingSponsorReview?: PendingSponsorReview;
  /** Set true when boardConfidence dips below threshold OR cash crashes —
   *  surfaces a UI banner to nudge the user toward corrective action. */
  ownerFiringRisk?: boolean;
  /** Bi-weekly cadence anchor for the player+staff payroll runs. */
  lastTycoonPayslipDate?: string;
  pendingPressConference?: PressConferencePending;
  pendingFinanceRecap?: FinanceRecapPending;
  financeRecapSettings?: FinanceRecapSettings;
  oneTimePayouts?: OneTimePayout[];
  playerDramaLog?: PlayerDramaLogEntry[];
  /** One-shot marker that the init-heal pass has run for this club.
   *  Once set, tier and tier-derived defaults are NEVER touched by the
   *  heal again — subsequent tier movement (bankruptcy, ownership change,
   *  promotion via Euroleague performance) flows through gameplay events
   *  and should not be reverted by re-loading the save. */
  tierInitHealed?: boolean;
  staffSalaryScaleHealed?: boolean;
  staffMembers?: Array<{
    id: string;
    role: string;
    name: string;
    nationality?: string;
    salary: number;
    contractYears: number;
    rating?: number;
    hiredYear?: number;
    signingBonus?: number;
    face?: any;
    staffImageId?: number;
  }>;
}

export interface TierBase {
  stadiumCapacity: number;
  ticketPrice: number;
  tvRevenue: number; // EUR/year
  sponsorshipFloor: Record<'kit' | 'sleeve' | 'stadium', number>; // EUR/year per core slot
  facilityOpsPerLevel: number;
  travelBase: number;
  scoutingBudget: number;
  startingCash: number;
}
