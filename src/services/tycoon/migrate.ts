import type { NBATeam, NonNBATeam } from '../../types';
import type { SponsorPerk, TycoonState } from '../../types/tycoon';
import { TIER_BASE, getTierForClub, getCityPrestige } from './specs/spain';
import { classifySponsor, seedInitialSponsorships } from './sponsorshipEngine';
import { ALL_SLOTS } from '../../types/tycoon';
import { defaultAcademyBudgetEURForTier, normalizeAcademyBudgetEUR, getStaffMarketSalary, normalizeStaffSalary } from './economyScale';
import { CLUB_FINANCE_SCHEMA_VERSION, ensureClubFinanceState } from './clubFinance';
import { getSponsorOpportunities, isLegacySponsorFallbackName, resolveSponsorLeagueKey, pickSponsorName } from '../../data/sponsorCatalogFetcher';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../data/euroBasketballSources';
import { seedTierAndBudget } from '../euro/tierBudgetSeed';
import { mapSetupTierToTycoonTier } from '../../utils/tierMapping';
import { seedStaffSix } from '../euro/staffSeed';
import { getCanonicalEuroClubAbbrev } from '../../utils/teamNames';
import { applySponsorPerkOnDealSigned } from './sponsorPerkEngine';
import { resolveSponsorPerk } from './sponsorPerkLibrary';
import { buildSponsorPerformanceBonuses } from './sponsorOfferConstants';

type TycoonHost = NBATeam | NonNBATeam;

function healSponsorPerkSemantics(perk: SponsorPerk): SponsorPerk {
  if (
    perk.id === 'salary-insurance-50'
    && perk.effect?.target === 'injuredPlayerSalaryCost'
  ) {
    return resolveSponsorPerk(perk.id) ?? perk;
  }
  if (
    perk.id === 'hospitality-revenue-10'
    && perk.effect?.target === 'hospitalityRevenue'
  ) {
    return resolveSponsorPerk(perk.id) ?? perk;
  }
  return perk;
}

function resolveTeamLeagueId(team: TycoonHost): string {
  const league = String((team as any).league ?? '');
  if (league === 'Endesa') return 'endesa';
  if (league === 'Euroleague') return 'euroleague';
  return EURO_BASKETBALL_SOURCE_ARCHIVES.find(source => source.leagueStatus === league)?.leagueId ?? 'euroleague';
}

function resolveTeamTier(team: TycoonHost): TycoonState['tier'] {
  const startingTier = (team as any).startingTier;
  if (startingTier) return mapSetupTierToTycoonTier(startingTier);
  const leagueId = resolveTeamLeagueId(team);
  if (leagueId === 'endesa') return getTierForClub((team as any).name ?? (team as any).region ?? '');
  const seed = Number((team as any).tid ?? (team as any).id ?? 1) || 1;
  return mapSetupTierToTycoonTier(seedTierAndBudget({
    teamAbbrev: String((team as any).abbrev ?? ''),
    leagueId,
    subSeed: seed,
  }).tier);
}

function defaultScoutingInvestmentForTier(tier: TycoonState['tier']): number {
  switch (tier) {
    case 'S': return 1_200_000;
    case 'A': return 850_000;
    case 'B': return 550_000;
    case 'C': return 320_000;
    case 'D': return 180_000;
  }
}

function defaultMedicalBudgetForTier(tier: TycoonState['tier']): number {
  switch (tier) {
    case 'S': return 900_000;
    case 'A': return 650_000;
    case 'B': return 450_000;
    case 'C': return 300_000;
    case 'D': return 180_000;
  }
}

function defaultTravelPreferencesForTier(tier: TycoonState['tier']): TycoonState['travelPreferences'] {
  switch (tier) {
    case 'S': return { hotel: 5.0, flight: 5.0, bus: 5.0 };
    case 'A': return { hotel: 4.5, flight: 4.5, bus: 4.0 };
    case 'B': return { hotel: 4.0, flight: 4.0, bus: 3.5 };
    case 'C': return { hotel: 3.5, flight: 3.0, bus: 3.0 };
    case 'D': return { hotel: 3.0, flight: 2.5, bus: 2.5 };
  }
}

function seedBoardPromises(currentYear: number, t: TycoonState, economyScale = 1): TycoonState['boardPromises'] {
  return [
    {
      id: `cash-${currentYear}`,
      year: currentYear,
      type: 'cash',
      label: 'Keep club cash positive',
      target: 1,
      progress: (t.cashOnHand ?? 0) >= 0 ? 1 : 0,
      status: 'active',
      confidenceDelta: 8,
    },
    {
      id: `medical-${currentYear}`,
      year: currentYear,
      type: 'medical',
      label: 'Maintain a credible recovery program',
      target: Math.round(450_000 * economyScale),
      progress: Math.min(1, (t.medicalBudget ?? 0) / Math.max(1, 450_000 * economyScale)),
      status: 'active',
      confidenceDelta: 5,
    },
    {
      id: `scouting-${currentYear}`,
      year: currentYear,
      type: 'scouting',
      label: 'Fund a real scouting department',
      target: Math.round(250_000 * economyScale),
      progress: Math.min(1, (t.scoutingInvestment ?? 0) / Math.max(1, 250_000 * economyScale)),
      status: 'active',
      confidenceDelta: 5,
    },
  ];
}

const TYCOON_STAFF_ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Assistant Coach 2',
  'Assistant Coach 3',
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;

const EURO_ACADEMY_STAFF_ROLES = [
  'Head of Academy',
  'Regional Scout',
  'Regional Scout 2',
  'Regional Scout 3',
  'Regional Scout 4',
] as const;

function isEuroStaffClub(team: TycoonHost): boolean {
  const tid = Number((team as any).tid ?? (team as any).id ?? -1);
  const leagueId = resolveTeamLeagueId(team);
  return tid >= 1000
    && !(tid >= 2000 && tid < 3000)
    && (leagueId === 'endesa' || leagueId === 'euroleague' || EURO_BASKETBALL_SOURCE_ARCHIVES.some(source => source.leagueId === leagueId));
}

function staffRolesForTeam(team: TycoonHost): readonly string[] {
  return isEuroStaffClub(team) ? [...TYCOON_STAFF_ROLES, ...EURO_ACADEMY_STAFF_ROLES] : TYCOON_STAFF_ROLES;
}

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function setupTierFor(tier: TycoonState['tier']): 'Powerhouse' | 'Established' | 'MidTier' | 'Underdog' {
  if (tier === 'S') return 'Powerhouse';
  if (tier === 'A') return 'Established';
  if (tier === 'B') return 'MidTier';
  return 'Underdog';
}

function seedDefaultStaffMembers(
  team: TycoonHost,
  tier: TycoonState['tier'],
  currentYear: number,
  economyScale = 1,
): TycoonState['staffMembers'] {
  const teamKey = `${(team as any).name ?? (team as any).region ?? 'club'}-${(team as any).tid ?? (team as any).id ?? 0}`;
  const tid = Number((team as any).tid ?? (team as any).id ?? 0);
  const leagueId = resolveTeamLeagueId(team);
  const normalizedTeam = { ...(team as any), id: tid, logoUrl: (team as any).logoUrl ?? (team as any).imgURL } as NBATeam;
  const nonNBATeams = 'league' in team ? [team as NonNBATeam] : [];
  const seeded = seedStaffSix(
    normalizedTeam,
    { players: [], nonNBATeams },
    leagueId,
    setupTierFor(tier),
    hashSeed(teamKey),
    currentYear,
  );
  const byRole = new Map(seeded.map(member => [member.position, member]));
  return staffRolesForTeam(team).map(role => {
    const member = byRole.get(role);
    const rating = Math.round(member?.rating ?? member?.reputation ?? 60);
    return {
      id: `staff-${teamKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      role,
      name: member?.name ?? `${role} Candidate`,
      nationality: member?.nationality,
      salary: Math.round(getStaffMarketSalary(tier, role, rating, { market: 'euro' }) * economyScale),
      contractYears: member?.contractYears ?? 2,
      rating,
      hiredYear: currentYear - 1,
      bornYear: member?.bornYear,
      careerStartYear: member?.careerStartYear,
      staffImageId: member?.staffImageId,
      playerPortraitUrl: member?.playerPortraitUrl,
      leagueId,
    };
  });
}

function ensureDefaultStaffMembers(team: TycoonHost, currentYear: number, economyScale = 1): void {
  const t: TycoonState = (team as any).tycoon;
  if (!t) return;
  const existing = Array.isArray(t.staffMembers) ? t.staffMembers : [];
  if (existing.length === 0) {
    t.staffMembers = seedDefaultStaffMembers(team, t.tier, currentYear, economyScale);
    return;
  }
  const byRole = new Map(existing.map(member => [member.role, member]));
  const expectedRoles = staffRolesForTeam(team);
  const missing = expectedRoles.filter(role => !byRole.has(role));
  if (missing.length === 0) return;
  const seeded = seedDefaultStaffMembers(team, t.tier, currentYear, economyScale);
  t.staffMembers = [...existing, ...seeded.filter(member => missing.includes(member.role as any))];
}

function healEuroChiefScoutRating(team: TycoonHost): void {
  const tycoon: TycoonState = (team as any).tycoon;
  if (!tycoon || tycoon.chiefScoutRatingHealed || !isEuroStaffClub(team)) return;
  const chiefScout = tycoon.staffMembers?.find(member => member.role === 'Chief Scout');
  const regionalRatings = (tycoon.staffMembers ?? [])
    .filter(member => /^Regional Scout(?:\s+[2-4])?$/.test(member.role))
    .map(member => Number(member.rating))
    .filter(Number.isFinite);
  if (chiefScout && regionalRatings.length > 0) {
    const regionalAverage = regionalRatings.reduce((sum, rating) => sum + rating, 0) / regionalRatings.length;
    const currentRating = Number(chiefScout.rating ?? 50);
    chiefScout.rating = Math.max(Number.isFinite(currentRating) ? currentRating : 50, Math.round(regionalAverage));
  }
  tycoon.chiefScoutRatingHealed = true;
}

function applyHistoricalMoneyScale(t: TycoonState, economyScale: number): void {
  if (Number.isFinite(Number(t.historicalEconomyScaleApplied))) return;
  const scale = Math.max(0.05, Number.isFinite(economyScale) ? economyScale : 1);
  const money = (value: unknown) => Math.round((Number.isFinite(Number(value)) ? Number(value) : 0) * scale);
  t.cashOnHand = money(t.cashOnHand);
  t.medicalBudget = money(t.medicalBudget);
  t.scoutingInvestment = money(t.scoutingInvestment);
  t.sponsorships = Object.fromEntries(Object.entries(t.sponsorships ?? {}).map(([slot, sponsor]) => [
    slot,
    sponsor ? {
      ...sponsor,
      valuePerYear: money(sponsor.valuePerYear),
      signingBonus: sponsor.signingBonus == null ? undefined : money(sponsor.signingBonus),
      performanceBonuses: sponsor.performanceBonuses?.map(bonus => ({ ...bonus, amountEUR: money(bonus.amountEUR) })),
    } : sponsor,
  ]));
  t.staffMembers = (t.staffMembers ?? []).map(member => ({ ...member, salary: money(member.salary), signingBonus: member.signingBonus == null ? undefined : money(member.signingBonus) }));
  t.transactions = (t.transactions ?? []).map(item => ({ ...item, amountEUR: money(item.amountEUR), balanceAfterEUR: money(item.balanceAfterEUR) }));
  t.commitments = (t.commitments ?? []).map(item => ({ ...item, amountEUR: money(item.amountEUR) }));
  t.activeReservations = (t.activeReservations ?? []).map(item => ({ ...item, amountEUR: money(item.amountEUR) }));
  if (t.regionalScoutingBudget) t.regionalScoutingBudget = { ...t.regionalScoutingBudget, allocatedEUR: money(t.regionalScoutingBudget.allocatedEUR), spentEUR: money(t.regionalScoutingBudget.spentEUR) };
  if (t.creditFacility) t.creditFacility = { ...t.creditFacility, limitEUR: money(t.creditFacility.limitEUR), drawnEUR: money(t.creditFacility.drawnEUR) };
  t.loans = (t.loans ?? []).map(loan => ({
    ...loan,
    originalPrincipalEUR: money(loan.originalPrincipalEUR),
    outstandingPrincipalEUR: money(loan.outstandingPrincipalEUR),
  }));
  t.boardPromises = (t.boardPromises ?? []).map(item => ({ ...item, target: item.type === 'cash' || item.type === 'medical' || item.type === 'scouting' ? money(item.target) : item.target }));
  t.oneTimePayouts = (t.oneTimePayouts ?? []).map(item => ({
    ...item,
    amount: money(item.amount),
    performanceBonuses: item.performanceBonuses?.map(bonus => ({ ...bonus, amountEUR: money(bonus.amountEUR) })),
  }));
  if (t.facilities?.stadium?.upgradePending) t.facilities.stadium.upgradePending.cost = money(t.facilities.stadium.upgradePending.cost);
  if (t.facilities?.trainingCenter?.upgradePending) t.facilities.trainingCenter.upgradePending.cost = money(t.facilities.trainingCenter.upgradePending.cost);
  if (t.facilities?.academy?.upgradePending) t.facilities.academy.upgradePending.cost = money(t.facilities.academy.upgradePending.cost);
  t.historicalEconomyScaleApplied = scale;
  t.currentEconomyIndex = scale;
}

export function migrateTeamTycoon(team: TycoonHost, currentYear: number, economyScale = 1): void {
  if ((team as any).tycoon) return;
  const tier = resolveTeamTier(team);
  const sponsorLeague = resolveSponsorLeagueKey((team as any).league, (team as any).region, (team as any).name);
  const tb = TIER_BASE[tier];

  const scale = Math.max(0.05, Number.isFinite(economyScale) ? economyScale : 1);
  const sponsorships = seedInitialSponsorships(tier, currentYear, undefined, sponsorLeague, scale);
  (team as any).tycoon = {
    tier,
    sponsorships,
    facilities: {
      stadium: { level: 1, capacity: tb.stadiumCapacity },
      trainingCenter: { level: 1 },
      academy: { level: 1 },
      medicalCenter: { level: 1 },
    },
    ledgerHistory: [],
    cashOnHand: Math.round(tb.startingCash * scale),
    historicalEconomyScaleApplied: scale,
    currentEconomyIndex: scale,
    schemaVersion: CLUB_FINANCE_SCHEMA_VERSION,
    transactions: [],
    commitments: [],
    activeReservations: [],
    creditFacility: { limitEUR: 0, drawnEUR: 0, annualRate: 0.05 },
    financialStatus: 'healthy',
    boardConfidence: 60,
    ffpRollingDeficit: 0,
    ticketPriceMultiplier: 1.0,
    medicalBudget: Math.round(defaultMedicalBudgetForTier(tier) * scale),
    travelPreferences: defaultTravelPreferencesForTier(tier),
    scoutingInvestment: Math.round(defaultScoutingInvestmentForTier(tier) * scale),
    academyBudget: defaultAcademyBudgetEURForTier(tier, scale),
    boardPromises: [],
    staffMembers: seedDefaultStaffMembers(team, tier, currentYear, scale),
    tierInitHealed: true,
    marketProfileVersion: 1,
  } as TycoonState;
  ensureClubFinanceState((team as any).tycoon, currentYear);
  healEuroChiefScoutRating(team);
  // Seed board promises after creation (needs t.cashOnHand etc)
  (team as any).tycoon.boardPromises = seedBoardPromises(currentYear, (team as any).tycoon, scale);
}

/** In-place migration for existing saves that are missing new fields. */
export function upgradeExistingTycoon(
  team: TycoonHost,
  currentYear: number,
  economyScale = 1,
): void {
  const t: TycoonState = (team as any).tycoon;
  if (!t) return;

  const name = (team as any).name ?? '';
  const region = (team as any).region ?? '';
  const sponsorLeague = resolveSponsorLeagueKey((team as any).league, region, name);

  // ── Init-only tier heal ────────────────────────────────────────────
  // Repairs the original misclassification bug where teams whose names
  // didn't match the SPAIN_CLUB_TIERS lookup got seeded as Tier D with
  // 4500-seat arenas and €120K sponsorships — even when they should
  // have been Tier S/A (Real Madrid, Baskonia Vitoria-Gasteiz, …).
  //
  // Runs ONCE per club, gated by tierInitHealed. After the flag is set,
  // tier movement is owned by gameplay (bankruptcy demotion, EuroLeague
  // promotion) and this function never touches tier again — even on
  // subsequent loads. This protects clubs whose tier legitimately
  // shifted away from the static spec.
  const needsLegacyMarketHeal = t.marketProfileVersion !== 1 && (team as any).league !== 'Endesa';
  if (!t.tierInitHealed || needsLegacyMarketHeal) {
    const correctTier = resolveTeamTier(team);
    // Only heal the unambiguous init bug: saved D-tier vs static spec
    // saying higher. Other mismatches may be intentional gameplay state.
    const isInitBug = t.tier === 'D' && correctTier !== 'D' && TIER_BASE[correctTier];
    if (isInitBug) {
      t.tier = correctTier;
      const seedEconomyIndex = Number.isFinite(Number(t.historicalEconomyScaleApplied))
        ? Math.max(0.05, Number(t.currentEconomyIndex ?? economyScale))
        : 1;
      t.sponsorships = seedInitialSponsorships(correctTier, currentYear, undefined, sponsorLeague, seedEconomyIndex);
      if (!t.facilities?.stadium?.upgradePending && t.facilities?.stadium) {
        (t.facilities.stadium as any).capacity = TIER_BASE[correctTier].stadiumCapacity;
      }
      // Bump tier-derived budgets only when they're below the new tier's
      // floor — preserves any user-tuned higher value already in place.
      const newScouting = defaultScoutingInvestmentForTier(correctTier);
      if ((t.scoutingInvestment ?? 0) < newScouting) t.scoutingInvestment = newScouting;
      const newMedical = defaultMedicalBudgetForTier(correctTier);
      if ((t.medicalBudget ?? 0) < newMedical) t.medicalBudget = newMedical;
      if (!Number.isFinite(Number(t.cashOnHand))) {
        t.cashOnHand = TIER_BASE[correctTier].startingCash;
      }
    }
    t.tierInitHealed = true;
    t.marketProfileVersion = 1;
  }
  if (!Number.isFinite(Number(t.cashOnHand))) {
    t.cashOnHand = TIER_BASE[t.tier]?.startingCash ?? 2_000_000;
  }
  if (t.cityPrestige === undefined) t.cityPrestige = getCityPrestige(name || region, t.tier);
  if (t.ticketPriceMultiplier === undefined) t.ticketPriceMultiplier = 1.0;
  if (t.medicalBudget === undefined) t.medicalBudget = defaultMedicalBudgetForTier(t.tier);
  if (t.scoutingInvestment === undefined) t.scoutingInvestment = defaultScoutingInvestmentForTier(t.tier);
  t.academyBudget = normalizeAcademyBudgetEUR(t.academyBudget, t.tier, t.currentEconomyIndex ?? economyScale);
  if (t.travelPreferences === undefined) t.travelPreferences = defaultTravelPreferencesForTier(t.tier);
  ensureClubFinanceState(t, currentYear);
  if (!Array.isArray(t.boardPromises)) t.boardPromises = seedBoardPromises(currentYear, t);
  if (!Array.isArray(t.staffMembers)) t.staffMembers = [];
  const existingScale = Number.isFinite(Number(t.historicalEconomyScaleApplied))
    ? Math.max(0.05, Number(t.historicalEconomyScaleApplied))
    : 1;
  ensureDefaultStaffMembers(team, currentYear, existingScale);
  if (!t.staffSalaryScaleHealed) {
    t.staffMembers = t.staffMembers.map(member => ({
      ...member,
      salary: Math.round(normalizeStaffSalary(t.tier, member.role, member.salary / existingScale, member.rating, { market: 'euro' }) * existingScale),
    }));
    t.staffSalaryScaleHealed = true;
  }
  healEuroChiefScoutRating(team);

  // Heal incomplete facilities (older saves may have only stadium set)
  const f = t.facilities ?? ({} as any);
  if (!f.stadium) f.stadium = { level: 1, capacity: TIER_BASE[t.tier]?.stadiumCapacity ?? 7500 };
  if (!(f.stadium as any).capacity) (f.stadium as any).capacity = TIER_BASE[t.tier]?.stadiumCapacity ?? 7500;
  if (!f.trainingCenter) f.trainingCenter = { level: 1 };
  if (!f.academy) f.academy = { level: 1 };
  if (!f.medicalCenter) f.medicalCenter = { level: 1 };
  t.facilities = f;

  // Fill missing sponsorship slots and classify existing ones
  const existing = t.sponsorships ?? ({} as any);
  const upgraded: any = {};
  const assignedBrands = new Set(
    ALL_SLOTS
      .map(slot => ({ slot, sponsor: String(existing[slot]?.sponsor ?? '') }))
      .filter(entry => entry.sponsor && !isLegacySponsorFallbackName(sponsorLeague, entry.slot, entry.sponsor))
      .map(entry => entry.sponsor),
  );
  for (const slot of ALL_SLOTS) {
    if (slot in existing) {
      upgraded[slot] = existing[slot];
    } else {
      upgraded[slot] = makeFallback(t.tier, slot, t.cityPrestige ?? 0.5, currentYear, sponsorLeague);
    }
    if (upgraded[slot] && isLegacySponsorFallbackName(sponsorLeague, slot, String(upgraded[slot].sponsor ?? ''))) {
      const opportunities = getSponsorOpportunities(sponsorLeague, t.tier, slot);
      const opportunity = opportunities.find(candidate => !assignedBrands.has(candidate.brand)) ?? opportunities[0];
      if (opportunity) {
        const valuePerYear = Math.max(0, Number(upgraded[slot].valuePerYear ?? opportunity.baseAnnualValueEUR));
        upgraded[slot] = {
          ...upgraded[slot],
          sponsor: opportunity.brand,
          industry: opportunity.industry,
          archetype: opportunity.archetype,
          perk: resolveSponsorPerk(
            opportunity.perkId,
            opportunity.perkValueOverride ?? opportunity.perkValue,
            opportunity.perkProductId,
          ),
          performanceBonuses: buildSponsorPerformanceBonuses(
            valuePerYear,
            opportunity.archetype,
            opportunity.bonusProfileId,
          ),
        };
        assignedBrands.add(opportunity.brand);
      }
    }
    if (upgraded[slot] && !upgraded[slot]?.industry) {
      upgraded[slot] = { ...upgraded[slot]!, ...classifySponsor(upgraded[slot]!.sponsor) };
    }
  }
  t.sponsorships = upgraded;
  for (const deal of Object.values(t.sponsorships)) {
    if (deal?.perk) {
      deal.perk = healSponsorPerkSemantics(deal.perk);
      applySponsorPerkOnDealSigned(t, deal.sponsor, deal.perk, currentYear);
    }
  }
  for (const deal of t.oneTimePayouts ?? []) {
    if (deal.perk) {
      deal.perk = healSponsorPerkSemantics(deal.perk);
      applySponsorPerkOnDealSigned(t, deal.brand, deal.perk, currentYear);
    }
  }
  applyHistoricalMoneyScale(t, economyScale);
}

function makeFallback(tier: TycoonState['tier'], slot: string, cityPrestige: number, currentYear: number, league: ReturnType<typeof resolveSponsorLeagueKey>) {
  const floorMap: Record<string, number> = {
    kit: 2_500_000, naming: 1_800_000, sleeve: 600_000, shorts: 300_000,
    training: 400_000, court: 350_000, arena: 800_000, digital: 250_000,
  };
  const floor = floorMap[slot] ?? 200_000;
  const tierMult: Record<TycoonState['tier'], number> = { S: 2.5, A: 1.8, B: 1.2, C: 0.8, D: 0.5 };
  const scale = (tierMult[tier] ?? 1) * (0.5 + cityPrestige * 0.9);
  const opportunity = getSponsorOpportunities(league, tier, slot as any)[0];
  const sponsor = opportunity?.brand ?? pickSponsorName(league, tier, slot as any);
  const value = Math.round(floor * scale * 0.6);
  return {
    sponsor,
    ...classifySponsor(sponsor),
    ...(opportunity ? {
      industry: opportunity.industry,
      archetype: opportunity.archetype,
      perk: resolveSponsorPerk(
        opportunity.perkId,
        opportunity.perkValueOverride ?? opportunity.perkValue,
        opportunity.perkProductId,
      ),
      performanceBonuses: buildSponsorPerformanceBonuses(value, opportunity.archetype, opportunity.bonusProfileId),
    } : {}),
    valuePerYear: value,
    yearsRemaining: 2,
    signedYear: currentYear - 1,
    contractEndYear: currentYear + 1,
  };
}

export function migrateAllEuroTeams(state: {
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  leagueStats: { year: number; uiMode?: string | null; historicalEconomyScale?: number };
}): number {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return 0;
  let migrated = 0;
  for (const team of [...state.teams, ...(state.nonNBATeams ?? [])]) {
    const canonicalAbbrev = getCanonicalEuroClubAbbrev(team);
    if (canonicalAbbrev && canonicalAbbrev !== String((team as any).abbrev ?? '').trim().toUpperCase()) {
      (team as any).abbrev = canonicalAbbrev;
    }
    if ((team as any).tycoon) {
      upgradeExistingTycoon(team, state.leagueStats.year, Number(state.leagueStats.historicalEconomyScale ?? 1));
      continue;
    }
    migrateTeamTycoon(team, state.leagueStats.year, Number(state.leagueStats.historicalEconomyScale ?? 1));
    migrated++;
  }
  return migrated;
}

/** Heal pass that runs in any UI mode — fixes stale tycoon state on
 *  external-league teams that were seeded before tier resolution
 *  matured. Only touches teams that already have a tycoon (no new
 *  migrations); for fresh seeds use migrateTeamTycoon directly. */
export function healAllExistingTycoons(state: {
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  leagueStats: { year: number };
}): number {
  let healed = 0;
  for (const team of [...state.teams, ...(state.nonNBATeams ?? [])]) {
    if ((team as any).tycoon) {
      upgradeExistingTycoon(team, state.leagueStats.year);
      healed++;
    }
  }
  return healed;
}
