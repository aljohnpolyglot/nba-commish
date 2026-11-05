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

export interface SponsorPerformanceBonus {
  id: string;
  type?: string;
  target?: string | number;
  label: string;
  rate: number;
  amountEUR: number;
}

export interface SponsorPerkEffect {
  target: string | string[];
  operation: string;
  value?: number;
  uses?: number;
  reset?: string;
  appliesTo?: string[];
  excludedCosts?: string[];
  equivalentAnnualValueRatePerUse?: number;
  qualityFloorStars?: number;
  flightCostMultiplier?: number;
  hotelCostMultiplier?: number;
  lockBudgetControl?: boolean;
  minimumInjuryDays?: number;
  limitAnnualValueRate?: number;
  interestRateDiscountPoints?: number;
  trigger?: string;
  permanent?: boolean;
  duplicateAllowed?: boolean;
}

export interface SponsorPerk {
  id: string;
  label: string;
  description: string;
  value?: number;
  productId?: string;
  effect?: SponsorPerkEffect;
  effectType?:
    | 'quality_lock'
    | 'cost_coverage'
    | 'revenue_multiplier'
    | 'attendance_multiplier'
    | 'signing_allowance'
    | 'rating_installation'
    | 'cash_only';
  targetSystem?:
    | 'flightQuality'
    | 'hotelQuality'
    | 'groundTravelCosts'
    | 'playerStaffSigningOffers'
    | 'matchdayFoodRevenue'
    | 'matchdayDrinkRevenue'
    | 'gateRevenue'
    | 'homeAttendance'
    | 'merchandiseRevenue'
    | 'trainingRating'
    | 'medicalRating'
    | 'arenaRating'
    | 'analyticsRating'
    | 'none';
  unit?: 'percent' | 'stars' | 'uses' | 'rating' | 'free' | 'none';
  durationType?: 'while_active' | 'seasonal_allowance' | 'one_time_each_season' | 'one_time_permanent' | 'cash_only';
  resetRule?: 'season' | 'contract' | 'never';
  stackable?: boolean;
}

export interface SponsorProductInstallation {
  productId: string;
  productName: string;
  sponsor: string;
  perkId: string;
  targetRating: 'training' | 'medical' | 'arena' | 'analytics';
  ratingBoost: number;
  installedYear: number;
}

export interface SponsorPerkUsage {
  sponsor: string;
  perkId: string;
  season: number;
  uses: number;
}

export interface SponsorSigningPerkGrant {
  sponsor: string;
  perkId: string;
  label: string;
  season: number;
  equivalentAnnualValueEUR: number;
}

export interface Sponsorship {
  sponsor: string;
  valuePerYear: number; // EUR
  yearsRemaining: number;
  signedYear: number;
  contractEndYear?: number;
  industry?: SponsorIndustry;
  archetype?: SponsorArchetype;
  personality?: string;
  personalityProse?: string;
  /** EUR one-time bonus paid up front when the contract was signed. */
  signingBonus?: number;
  performanceBonuses?: SponsorPerformanceBonus[];
  paymentSchedule?: 'quarterly' | 'annual';
  renewalOptionYears?: number;
  terminationNoticeDays?: number;
  perk?: SponsorPerk;
  headquartersCity?: string;
  headquartersCountry?: string;
  headquartersIso2?: string;
  benefitPackage?: SponsorBenefitPackage;
  benefitPackageVersion?: 1;
  /** Append-only log of contractual milestones with this sponsor. */
  relationshipHistory?: SponsorRelationshipEntry[];
}

export interface FacilityState {
  level: number; // 1–5
  permanentSponsorRatingBonus?: number;
  trainingAreaLevels?: Partial<Record<TrainingFacilityAreaKey, number>>;
  upgradePending?: {
    targetLevel: number;
    finishYear: number;
    cost: number;
  };
}

export type MedicalFacilityAreaKey =
  | 'clinic'
  | 'recovery'
  | 'physicalTherapy'
  | 'diagnostics'
  | 'hydrotherapy'
  | 'loadManagement';

export interface MedicalFacilityState extends FacilityState {
  medicalAreaLevels?: Partial<Record<MedicalFacilityAreaKey, number>>;
}

export interface StadiumFacilityState extends FacilityState {
  capacity: number;
  baseCapacity?: number;
  installedArenaFeatures?: ArenaFeatureId[];
  completedArenaProjects?: string[];
  venue?: ArenaVenueIdentity;
  venueHistory?: ArenaVenueHistoryEntry[];
}

export interface ArenaVenueIdentity {
  id: string;
  name: string;
  city: string;
  country: string;
  iso2: string;
  openingYear?: number;
  acquiredYear?: number;
  kind: 'existing' | 'new-build';
  baseCapacity: number;
}

export interface ArenaVenueHistoryEntry extends ArenaVenueIdentity {
  leftYear: number;
  finalCapacity: number;
  installedArenaFeatures: ArenaFeatureId[];
  completedArenaProjects: string[];
}

export interface SponsorBenefitPackage {
  kind: 'travel' | 'recovery' | 'training' | 'arena' | 'bank';
  label: string;
  travelMode?: 'flight' | 'bus';
  serviceStars?: number;
  fatigueReduction?: number;
  trainingArea?: TrainingFacilityAreaKey;
  trainingRatingBonus?: number;
  arenaFeatureId?: ArenaFeatureId;
  bankLoanLimitEUR?: number;
  bankAnnualRate?: number;
  inKindValueEUR?: number;
}

export type TrainingFacilityAreaKey = 'courts' | 'strength' | 'science' | 'video' | 'media' | 'recovery';

export type ArenaFeatureId =
  | 'led-ribbon'
  | 'luxury-suites'
  | 'jumbotron'
  | 'premium-courtside'
  | 'fan-zone'
  | 'sound-system'
  | 'media-center'
  | 'tunnel-show';

export interface CommercialTrustEntry {
  year: number;
  sponsor: string;
  slot: SponsorshipSlot;
  event: 'breached';
  note: string;
}

export interface AnnualLedgerComponent {
  id: string;
  label: string;
  amount: number;
  status: 'contracted' | 'earned' | 'posted' | 'projected';
  competitionId?: string;
  slot?: SponsorshipSlot;
  sponsor?: string;
  industry?: SponsorIndustry;
  date?: string;
  playerId?: string;
  counterpartyTid?: number;
  counterpartyName?: string;
  transactionType?: 'Permanent transfer' | 'Loan';
}

export interface AnnualLedger {
  year: number;
  revenue: {
    matchday: number;
    commercial?: number;
    sponsorship: number;
    prize: number;
    tv: number;
    transfer: number; // MVP = 0
  };
  revenueDetails?: Partial<Record<'matchday' | 'commercial' | 'sponsorship' | 'prize' | 'tv' | 'transfer', AnnualLedgerComponent[]>>;
  expenses: {
    wages: number;
    staff: number;
    facility: number;
    scouting: number;
    travel: number;
    transfer?: number;
    financeCosts: number; // MVP = 0
    medical?: number;
    academy?: number;
  };
  profit: number;
  cashOnHandEnd: number;
  ffpDeficitContribution: number; // min(profit, 0)
  prebookedRevenue?: number;
  postedNet?: number;
}

export interface BroadcastDistributionReceipt {
  id: string;
  year: number;
  competitionId?: string;
  totalPoolEUR: number;
  equalShareEUR: number;
  performanceShareEUR: number;
  commercialShareEUR: number;
  totalEUR: number;
}

export type ClubFinanceCategory =
  | 'academy'
  | 'broadcast'
  | 'commercial'
  | 'credit'
  | 'facility'
  | 'finance'
  | 'matchday'
  | 'medical'
  | 'prize'
  | 'scouting'
  | 'sponsorship'
  | 'staff'
  | 'transfer'
  | 'travel'
  | 'wages'
  | 'other';

export interface ClubFinanceTransaction {
  id: string;
  sourceId: string;
  date: string;
  season: number;
  category: ClubFinanceCategory;
  label: string;
  amountEUR: number;
  balanceAfterEUR: number;
  competitionId?: string;
  commitmentId?: string;
  playerId?: string;
  counterpartyTid?: number;
  counterpartyName?: string;
  transactionType?: 'Permanent transfer' | 'Loan';
}

export interface ClubFinanceCommitment {
  id: string;
  sourceId: string;
  dueDate: string;
  season: number;
  category: ClubFinanceCategory;
  label: string;
  amountEUR: number;
  status: 'scheduled' | 'settled' | 'cancelled';
  competitionId?: string;
  settledTransactionId?: string;
  creditLoanId?: string;
  creditPrincipalEUR?: number;
}

export interface ClubFinanceReservation {
  id: string;
  sourceId: string;
  createdDate: string;
  amountEUR: number;
  purpose: 'facility' | 'free-agency' | 'staff' | 'transfer' | 'loan' | 'other';
  label: string;
  expiresDate?: string;
}

export type TicketPricingLevel = 'community' | 'value' | 'standard' | 'premium' | 'elite';

export interface RegionalScoutingBudget {
  season: number;
  allocatedEUR: number;
  spentEUR: number;
}

export interface ClubCreditFacility {
  limitEUR: number;
  drawnEUR: number;
  annualRate: number;
  sponsor?: string;
}

export interface ClubLoan {
  id: string;
  lender: string;
  openedDate: string;
  originalPrincipalEUR: number;
  outstandingPrincipalEUR: number;
  annualRate: number;
  termMonths: number;
  scheduleRevision: number;
  paymentSequence?: number;
  status: 'active' | 'repaid';
  repaidDate?: string;
}

export type ClubFinancialStatus = 'healthy' | 'watch' | 'strained' | 'critical';

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
  archetype?: SponsorArchetype;
  benefitPackage?: SponsorBenefitPackage;
  performanceBonuses?: SponsorPerformanceBonus[];
  perk?: SponsorPerk;
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

export interface StaffOfferRejection {
  candidateId: string;
  candidateName: string;
  role: string;
  mode: 'hire' | 'extension';
  season: number;
  date: string;
  salary: number;
  years: number;
  bonus: number;
}

export interface CommercialPlayerShirtSale {
  playerId: string;
  playerName: string;
  units: number;
  revenueEUR: number;
}

export interface CommercialMatchdayRecord {
  gameId: string;
  gid: number;
  season: number;
  date: string;
  competitionId?: string;
  opponentTid: number;
  opponentName: string;
  attendance: number;
  capacity: number;
  ticketPriceEUR: number;
  gateRevenueEUR: number;
  foodRevenueEUR: number;
  drinkRevenueEUR: number;
  matchdayRevenueEUR: number;
  merchandiseGrossRevenueEUR: number;
  merchandiseDistributionCostEUR: number;
  merchandiseRevenueEUR: number;
  clubMediaRevenueEUR: number;
  playerShirtSales: CommercialPlayerShirtSale[];
}

export interface TycoonState {
  schemaVersion?: number;
  marketProfileVersion?: number;
  historicalEconomyScaleApplied?: number;
  currentEconomyIndex?: number;
  tier: TycoonTier;
  sponsorships: Partial<Record<SponsorshipSlot, Sponsorship | null>>;
  facilities: {
    stadium: StadiumFacilityState;
    trainingCenter: FacilityState;
    academy: FacilityState;
    medicalCenter?: MedicalFacilityState;
  };
  ledgerHistory: AnnualLedger[]; // letzte 10, FIFO
  cashOnHand: number; // EUR
  transactions?: ClubFinanceTransaction[];
  commitments?: ClubFinanceCommitment[];
  activeReservations?: ClubFinanceReservation[];
  creditFacility?: ClubCreditFacility;
  loans?: ClubLoan[];
  bankLoanSequence?: number;
  financialStatus?: ClubFinancialStatus;
  regionalScoutingBudget?: RegionalScoutingBudget;
  ticketPricingLevel?: TicketPricingLevel;
  broadcastReceipts?: BroadcastDistributionReceipt[];
  boardConfidence: number; // 0–100, MVP = 60 static
  ffpRollingDeficit: number;
  /** Transient flag von eventChecker, dämpft nächste Sponsorship-Renewal-Berechnung */
  nextRenewalPenaltyFactor?: number;
  commercialTrust?: number;
  commercialTrustHistory?: CommercialTrustEntry[];
  boardPromises?: BoardPromise[];
  medicalBudget?: number;        // EUR/year
  /** Saved annual academy spend in the league currency; legacy 0-5 values migrate on load. */
  academyBudget?: number;
  travelPreferences?: TravelPreferences;
  scoutingInvestment?: number;   // EUR/year
  cityPrestige?: number;         // 0–1
  /** Finite multiplier from 0 (free admission) upward, without an artificial gameplay maximum. */
  ticketPriceMultiplier?: number;
  budgetLocked?: boolean;
  budgetLockedYear?: number;
  pendingSponsorReview?: PendingSponsorReview;
  sponsorInboxOfferIds?: string[];
  /** Set true when boardConfidence dips below threshold OR cash crashes —
   *  surfaces a UI banner to nudge the user toward corrective action. */
  ownerFiringRisk?: boolean;
  /** Bi-weekly cadence anchor for the player+staff payroll runs. */
  lastTycoonPayslipDate?: string;
  pendingPressConference?: PressConferencePending;
  pendingFinanceRecap?: FinanceRecapPending;
  financeRecapSettings?: FinanceRecapSettings;
  oneTimePayouts?: OneTimePayout[];
  sponsorPerkUsage?: SponsorPerkUsage[];
  commercialMatchdays?: CommercialMatchdayRecord[];
  installedSponsorProducts?: SponsorProductInstallation[];
  analyticsPermanentSponsorRatingBonus?: number;
  playerDramaLog?: PlayerDramaLogEntry[];
  /** One-shot marker that the init-heal pass has run for this club.
   *  Once set, tier and tier-derived defaults are NEVER touched by the
   *  heal again — subsequent tier movement (bankruptcy, ownership change,
   *  promotion via Euroleague performance) flows through gameplay events
   *  and should not be reverted by re-loading the save. */
  tierInitHealed?: boolean;
  staffSalaryScaleHealed?: boolean;
  chiefScoutRatingHealed?: boolean;
  staffOfferRejections?: StaffOfferRejection[];
  staffMembers?: Array<{
    id: string;
    role: string;
    name: string;
    nationality?: string;
    salary: number;
    contractYears: number;
    rating?: number;
    hiredYear?: number;
    yearsWithTeam?: number;
    bornYear?: number;
    careerStartYear?: number;
    position?: string;
    jobTitle?: string;
    motivationType?: import('../services/staff/staffRetirement').StaffMotivationType;
    healthDurability?: number;
    stressTolerance?: number;
    signingBonus?: number;
    signingPerk?: SponsorSigningPerkGrant;
    face?: any;
    staffImageId?: number;
    playerPortraitUrl?: string;
    leagueId?: string;
    source?: string;
    sourcePlayerId?: string;
    coachAchievements?: import('./staff').StaffMember['coachAchievements'];
    retiredYear?: number;
    retiredDate?: string;
    retirementReason?: import('../services/staff/staffRetirement').StaffRetirementReason;
    retirementReasonLabel?: string;
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
