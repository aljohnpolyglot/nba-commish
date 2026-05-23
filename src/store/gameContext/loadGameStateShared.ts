import type { GameState } from '../../types';
import type { EuroCareerSeed } from '../../services/euro/careerSeed';
import { EURO_ISOLATED_DEFAULTS } from '../../constants';

const EURO_SETUP_SPONSOR_SLOT: Record<string, 'kit' | 'sleeve' | 'stadium'> = {
  main: 'kit',
  jersey: 'sleeve',
  arena: 'stadium',
};

export const EURO_TRANSFER_MARKET_DEFAULTS = EURO_ISOLATED_DEFAULTS.transferMarket as NonNullable<GameState['leagueStats']['transferMarket']>;

export function getClubId(team: any): number | undefined {
  return team?.tid ?? team?.id;
}

export function getClubLabel(team: any): string {
  if (!team) return 'Euro Club';
  if (team.region && team.name && !String(team.name).includes(String(team.region))) {
    return `${team.region} ${team.name}`;
  }
  return team.name ?? team.abbrev ?? 'Euro Club';
}

export function buildSetupSponsorships(seed: EuroCareerSeed, signedYear: number) {
  return seed.sponsors.reduce((acc, slot) => {
    const tycoonSlot = EURO_SETUP_SPONSOR_SLOT[slot.slotId];
    if (!tycoonSlot) return acc;
    acc[tycoonSlot] = {
      sponsor: slot.brand,
      valuePerYear: slot.amountEUR,
      yearsRemaining: slot.years,
      signedYear,
    };
    return acc;
  }, {} as Record<'kit' | 'sleeve' | 'stadium', any>);
}

export function mergeTycoonStaffMembers(existingMembers: any[] | undefined, seededMembers: any[]) {
  const merged = new Map<string, any>();
  for (const member of existingMembers ?? []) {
    const role = member?.role ?? member?.position ?? member?.jobTitle;
    if (!role || merged.has(role)) continue;
    merged.set(role, member);
  }
  for (const member of seededMembers) {
    const role = member?.role ?? member?.position ?? member?.jobTitle;
    if (!role) continue;
    merged.set(role, { ...merged.get(role), ...member, role });
  }
  return [...merged.values()];
}
