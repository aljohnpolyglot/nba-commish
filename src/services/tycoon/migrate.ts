import type { NBATeam, NonNBATeam } from '../../types';
import type { TycoonState } from '../../types/tycoon';
import { TIER_BASE, getTierForClub, getCityPrestige, SPAIN_INITIAL_SPONSORS } from './specs/spain';
import { classifySponsor, seedInitialSponsorships } from './sponsorshipEngine';
import { ALL_SLOTS } from '../../types/tycoon';
import { defaultAcademyBudgetForTier, getStaffMarketSalary, normalizeStaffSalary } from './economyScale';

type TycoonHost = NBATeam | NonNBATeam;

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

function seedBoardPromises(currentYear: number, t: TycoonState): TycoonState['boardPromises'] {
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
      target: 450_000,
      progress: Math.min(1, (t.medicalBudget ?? 0) / 450_000),
      status: 'active',
      confidenceDelta: 5,
    },
    {
      id: `scouting-${currentYear}`,
      year: currentYear,
      type: 'scouting',
      label: 'Fund a real scouting department',
      target: 250_000,
      progress: Math.min(1, (t.scoutingInvestment ?? 0) / 250_000),
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

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedDefaultStaffMembers(team: TycoonHost, tier: TycoonState['tier'], currentYear: number): TycoonState['staffMembers'] {
  const teamKey = `${(team as any).name ?? (team as any).region ?? 'club'}-${(team as any).tid ?? (team as any).id ?? 0}`;
  const firstNames = ['Adrian', 'Bruno', 'Carlos', 'Diego', 'Esteban', 'Javier', 'Luis', 'Marco', 'Nico', 'Rafael', 'Sergio', 'Tomas'];
  const lastNames = ['Alonso', 'Cabrera', 'Delgado', 'Herrera', 'Iglesias', 'Lopez', 'Morales', 'Navarro', 'Ortega', 'Romero', 'Santos', 'Vidal'];
  return TYCOON_STAFF_ROLES.map((role, index) => {
    const seed = hashSeed(`${teamKey}-${role}`);
    const rating = 58 + (seed % 24);
    const first = firstNames[(seed + index) % firstNames.length];
    const last = lastNames[((seed >>> 4) + index * 3) % lastNames.length];
    return {
      id: `staff-${teamKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      role,
      name: `${first} ${last}`,
      nationality: 'Spain',
      salary: getStaffMarketSalary(tier, role, rating),
      contractYears: 1 + (seed % 4),
      rating,
      hiredYear: currentYear - 1,
    };
  });
}

function ensureDefaultStaffMembers(team: TycoonHost, currentYear: number): void {
  const t: TycoonState = (team as any).tycoon;
  if (!t) return;
  const existing = Array.isArray(t.staffMembers) ? t.staffMembers : [];
  if (existing.length === 0) {
    t.staffMembers = seedDefaultStaffMembers(team, t.tier, currentYear);
    return;
  }
  const byRole = new Map(existing.map(member => [member.role, member]));
  const missing = TYCOON_STAFF_ROLES.filter(role => !byRole.has(role));
  if (missing.length === 0) return;
  const seeded = seedDefaultStaffMembers(team, t.tier, currentYear);
  t.staffMembers = [...existing, ...seeded.filter(member => missing.includes(member.role as any))];
}

export function migrateTeamTycoon(team: TycoonHost, currentYear: number): void {
  if ((team as any).tycoon) return;
  const tier = getTierForClub((team as any).name ?? (team as any).region ?? '');
  const tb = TIER_BASE[tier];

  (team as any).tycoon = {
    tier,
    sponsorships: seedInitialSponsorships(tier, currentYear),
    facilities: {
      stadium: { level: 1, capacity: tb.stadiumCapacity },
      trainingCenter: { level: 1 },
      academy: { level: 1 },
    },
    ledgerHistory: [],
    cashOnHand: tb.startingCash,
    boardConfidence: 60,
    ffpRollingDeficit: 0,
    ticketPriceMultiplier: 1.0,
    medicalBudget: defaultMedicalBudgetForTier(tier),
    travelPreferences: defaultTravelPreferencesForTier(tier),
    scoutingInvestment: defaultScoutingInvestmentForTier(tier),
    academyBudget: defaultAcademyBudgetForTier(tier),
    boardPromises: [],
    staffMembers: seedDefaultStaffMembers(team, tier, currentYear),
    tierInitHealed: true,
  } as TycoonState;
  // Seed board promises after creation (needs t.cashOnHand etc)
  (team as any).tycoon.boardPromises = seedBoardPromises(currentYear, (team as any).tycoon);
}

/** In-place migration for existing saves that are missing new fields. */
export function upgradeExistingTycoon(
  team: TycoonHost,
  currentYear: number,
): void {
  const t: TycoonState = (team as any).tycoon;
  if (!t) return;

  const name = (team as any).name ?? '';
  const region = (team as any).region ?? '';

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
  if (!t.tierInitHealed) {
    const correctTier = getTierForClub(name || region);
    // Only heal the unambiguous init bug: saved D-tier vs static spec
    // saying higher. Other mismatches may be intentional gameplay state.
    const isInitBug = t.tier === 'D' && correctTier !== 'D' && TIER_BASE[correctTier];
    if (isInitBug) {
      t.tier = correctTier;
      t.sponsorships = seedInitialSponsorships(correctTier, currentYear);
      if (!t.facilities?.stadium?.upgradePending && t.facilities?.stadium) {
        (t.facilities.stadium as any).capacity = TIER_BASE[correctTier].stadiumCapacity;
      }
      // Bump tier-derived budgets only when they're below the new tier's
      // floor — preserves any user-tuned higher value already in place.
      const newScouting = defaultScoutingInvestmentForTier(correctTier);
      if ((t.scoutingInvestment ?? 0) < newScouting) t.scoutingInvestment = newScouting;
      const newMedical = defaultMedicalBudgetForTier(correctTier);
      if ((t.medicalBudget ?? 0) < newMedical) t.medicalBudget = newMedical;
      if (!t.cashOnHand || t.cashOnHand <= 0) {
        t.cashOnHand = TIER_BASE[correctTier].startingCash;
      }
    }
    t.tierInitHealed = true;
  }
  if (!t.cashOnHand || t.cashOnHand <= 0) {
    t.cashOnHand = TIER_BASE[t.tier]?.startingCash ?? 2_000_000;
  }
  if (t.cityPrestige === undefined) t.cityPrestige = getCityPrestige(name || region, t.tier);
  if (t.ticketPriceMultiplier === undefined) t.ticketPriceMultiplier = 1.0;
  if (t.medicalBudget === undefined) t.medicalBudget = defaultMedicalBudgetForTier(t.tier);
  if (t.scoutingInvestment === undefined) t.scoutingInvestment = defaultScoutingInvestmentForTier(t.tier);
  if (t.academyBudget === undefined) t.academyBudget = defaultAcademyBudgetForTier(t.tier);
  if (t.travelPreferences === undefined) t.travelPreferences = defaultTravelPreferencesForTier(t.tier);
  if (!Array.isArray(t.boardPromises)) t.boardPromises = seedBoardPromises(currentYear, t);
  if (!Array.isArray(t.staffMembers)) t.staffMembers = [];
  ensureDefaultStaffMembers(team, currentYear);
  if (!t.staffSalaryScaleHealed) {
    t.staffMembers = t.staffMembers.map(member => ({
      ...member,
      salary: normalizeStaffSalary(t.tier, member.role, member.salary, member.rating),
    }));
    t.staffSalaryScaleHealed = true;
  }

  // Heal incomplete facilities (older saves may have only stadium set)
  const f = t.facilities ?? ({} as any);
  if (!f.stadium) f.stadium = { level: 1, capacity: TIER_BASE[t.tier]?.stadiumCapacity ?? 7500 };
  if (!(f.stadium as any).capacity) (f.stadium as any).capacity = TIER_BASE[t.tier]?.stadiumCapacity ?? 7500;
  if (!f.trainingCenter) f.trainingCenter = { level: 1 };
  if (!f.academy) f.academy = { level: 1 };
  t.facilities = f;

  // Fill missing sponsorship slots and classify existing ones
  const existing = t.sponsorships ?? ({} as any);
  const upgraded: any = {};
  for (const slot of ALL_SLOTS) {
    if (slot in existing) {
      upgraded[slot] = existing[slot];
    } else {
      upgraded[slot] = makeFallback(t.tier, slot, t.cityPrestige ?? 0.5, currentYear);
    }
    if (upgraded[slot] && !upgraded[slot]?.industry) {
      upgraded[slot] = { ...upgraded[slot]!, ...classifySponsor(upgraded[slot]!.sponsor) };
    }
  }
  t.sponsorships = upgraded;
}

function makeFallback(tier: TycoonState['tier'], slot: string, cityPrestige: number, currentYear: number) {
  const floorMap: Record<string, number> = {
    kit: 2_500_000, naming: 1_800_000, sleeve: 600_000, shorts: 300_000,
    training: 400_000, court: 350_000, arena: 800_000, digital: 250_000,
  };
  const floor = floorMap[slot] ?? 200_000;
  const tierMult: Record<TycoonState['tier'], number> = { S: 2.5, A: 1.8, B: 1.2, C: 0.8, D: 0.5 };
  const scale = (tierMult[tier] ?? 1) * (0.5 + cityPrestige * 0.9);
  const pool = (SPAIN_INITIAL_SPONSORS as any)[tier]?.[slot] ?? ['Default Sponsor'];
  const sponsor = pool[Math.floor(Math.random() * pool.length)];
  const value = Math.round(floor * scale * 0.6);
  return {
    sponsor,
    ...classifySponsor(sponsor),
    valuePerYear: value,
    yearsLeft: 2,
    expiresAfterYear: currentYear + 1,
  };
}

export function migrateAllEuroTeams(state: {
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  leagueStats: { year: number; uiMode?: string | null };
}): number {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return 0;
  let migrated = 0;
  for (const team of [...state.teams, ...(state.nonNBATeams ?? [])]) {
    if ((team as any).tycoon) {
      upgradeExistingTycoon(team, state.leagueStats.year);
      continue;
    }
    migrateTeamTycoon(team, state.leagueStats.year);
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
