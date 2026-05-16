import type { GameState, NBATeam, OwnerProfile, SetupTierLabel, StaffMember } from '../../types';
import { mapSetupTierToTycoonTier } from '../../utils/tierMapping';
import { seedOwner } from './ownerSeed';
import { seedSponsors } from './sponsorSeed';
import type { SponsorSlot } from './sponsorSeedTypes';
import { seedStaffSix } from './staffSeed';
import { seedTierAndBudget } from './tierBudgetSeed';

export type CardKey = 'tier' | 'staff' | 'owner' | 'sponsors';

export interface EuroCareerManualOverrides {
  tier?: SetupTierLabel;
  budget?: number;
  staff?: Record<string, StaffMember>;
  owner?: Partial<OwnerProfile>;
  sponsors?: Record<string, SponsorSlot>;
}

export interface EuroCareerSeed {
  masterSeed: number;
  leagueId: string;
  team: NBATeam;
  state: Pick<GameState, 'players' | 'nonNBATeams'>;
  tier: SetupTierLabel;
  budget: number;
  staff: StaffMember[];
  owner: OwnerProfile;
  sponsors: SponsorSlot[];
  manualOverrides: EuroCareerManualOverrides;
}

function subSeed(master: number, key: CardKey): number {
  const tag = { tier: 0x11, staff: 0x22, owner: 0x33, sponsors: 0x44 }[key];
  const mixed = Math.imul(master ^ tag, 0x9e3779b1) >>> 0;
  return mixed || 1;
}

function applyOverridesToSeed(base: EuroCareerSeed): EuroCareerSeed {
  const overrides = base.manualOverrides;
  let next: EuroCareerSeed = { ...base };
  if (overrides.tier) next = { ...next, tier: overrides.tier };
  if (overrides.budget) next = { ...next, budget: overrides.budget };
  if (overrides.staff) {
    next = {
      ...next,
      staff: next.staff.map(member => overrides.staff?.[member.position ?? ''] ?? member),
    };
  }
  if (overrides.owner) next = { ...next, owner: { ...next.owner, ...overrides.owner } };
  if (overrides.sponsors) {
    next = {
      ...next,
      sponsors: next.sponsors.map(slot => overrides.sponsors?.[slot.slotId] ?? slot),
    };
  }
  return next;
}

export function seedEuroCareer(
  team: NBATeam,
  state: Pick<GameState, 'players' | 'nonNBATeams'>,
  leagueId: string,
  masterSeed: number,
): EuroCareerSeed {
  const tierBudget = seedTierAndBudget({
    teamAbbrev: team.abbrev,
    leagueId,
    subSeed: subSeed(masterSeed, 'tier'),
  });
  const staff = seedStaffSix(team, state, leagueId, tierBudget.tier, subSeed(masterSeed, 'staff'));
  const owner = seedOwner(team, state, leagueId, tierBudget.tier, subSeed(masterSeed, 'owner'));
  const sponsors = seedSponsors(leagueId, mapSetupTierToTycoonTier(tierBudget.tier), subSeed(masterSeed, 'sponsors'));
  return {
    masterSeed,
    leagueId,
    team,
    state,
    tier: tierBudget.tier,
    budget: tierBudget.budget,
    staff,
    owner,
    sponsors,
    manualOverrides: {},
  };
}

export function rerollCard(
  seed: EuroCareerSeed,
  card: CardKey,
  newSubSeed: number,
): EuroCareerSeed {
  const next: EuroCareerSeed = { ...seed, manualOverrides: { ...seed.manualOverrides } };
  const { team, state, leagueId } = seed;
  switch (card) {
    case 'tier': {
      const tierBudget = seedTierAndBudget({ teamAbbrev: team.abbrev, leagueId, subSeed: newSubSeed });
      next.tier = tierBudget.tier;
      next.budget = tierBudget.budget;
      delete next.manualOverrides.tier;
      delete next.manualOverrides.budget;
      break;
    }
    case 'staff':
      next.staff = seedStaffSix(team, state, leagueId, next.tier, newSubSeed);
      delete next.manualOverrides.staff;
      break;
    case 'owner':
      next.owner = seedOwner(team, state, leagueId, next.tier, newSubSeed);
      delete next.manualOverrides.owner;
      break;
    case 'sponsors':
      next.sponsors = seedSponsors(leagueId, mapSetupTierToTycoonTier(next.tier), newSubSeed);
      delete next.manualOverrides.sponsors;
      break;
  }
  return applyOverridesToSeed(next);
}

export function applyOverride<K extends keyof EuroCareerManualOverrides>(
  seed: EuroCareerSeed,
  key: K,
  value: EuroCareerManualOverrides[K],
): EuroCareerSeed {
  return applyOverridesToSeed({
    ...seed,
    manualOverrides: { ...seed.manualOverrides, [key]: value },
  });
}

export function clearOverride(
  seed: EuroCareerSeed,
  key: keyof EuroCareerManualOverrides,
): EuroCareerSeed {
  const manualOverrides = { ...seed.manualOverrides };
  delete manualOverrides[key];
  return applyOverridesToSeed({ ...seed, manualOverrides });
}
