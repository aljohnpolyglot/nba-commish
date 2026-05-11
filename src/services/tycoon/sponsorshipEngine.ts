import type { Sponsorship, SponsorshipSlot, TycoonState, TycoonTier } from '../../types/tycoon';
import { TIER_BASE, SPAIN_INITIAL_SPONSORS } from './specs/spain';

export interface SuccessHistory {
  recentEndesaPositions: number[]; // letzte 3 Saisons, 1–18 each
  recentEuroleagueStages: Array<'final-four' | 'qf' | 'group' | 'none'>;
}

export interface SponsorshipOffer {
  slot: SponsorshipSlot;
  sponsor: string;
  valuePerYear: number;
  years: number; // 3–4
}

const PRESTIGE: Record<TycoonTier, number> = { S: 0.5, A: 0.3, B: 0.1, C: 0.0, D: -0.1 };

function recentSuccessBonus(h: SuccessHistory): number {
  let b = 0;
  for (const pos of h.recentEndesaPositions ?? []) {
    if (pos >= 1 && pos <= 4) b += 0.05;
  }
  for (const st of h.recentEuroleagueStages ?? []) {
    if (st === 'final-four') b += 0.10;
    else if (st === 'qf') b += 0.05;
  }
  return Math.min(0.45, b);
}

function pickSponsorName(tier: TycoonTier, slot: SponsorshipSlot, existing?: string | null): string {
  const pool = SPAIN_INITIAL_SPONSORS[tier][slot] ?? ['Default Sponsor'];
  const filtered = existing ? pool.filter(n => n !== existing) : pool;
  if (filtered.length === 0) return pool[0];
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function getMarketOffer(
  state: TycoonState,
  slot: SponsorshipSlot,
  history: SuccessHistory,
): SponsorshipOffer {
  const tb = TIER_BASE[state.tier];
  const existing = state.sponsorships[slot];
  const successBonus = recentSuccessBonus(history);
  const loyaltyBonus = existing ? 0.10 : 0;
  const penalty = state.nextRenewalPenaltyFactor ?? 1.0;
  const noise = 0.95 + Math.random() * 0.10;

  const value = Math.round(
    tb.sponsorshipFloor[slot] *
    (1 + successBonus) *
    (1 + PRESTIGE[state.tier]) *
    (1 + loyaltyBonus) *
    penalty *
    noise
  );

  return {
    slot,
    sponsor: existing?.sponsor ?? pickSponsorName(state.tier, slot, null),
    valuePerYear: value,
    years: 3 + Math.floor(Math.random() * 2),
  };
}

export function applyRenewal(state: TycoonState, slot: SponsorshipSlot, offer: SponsorshipOffer, currentYear: number): void {
  state.sponsorships[slot] = {
    sponsor: offer.sponsor,
    valuePerYear: offer.valuePerYear,
    yearsRemaining: offer.years,
    signedYear: currentYear,
  };
  delete state.nextRenewalPenaltyFactor;
}

export function applyDecline(state: TycoonState, slot: SponsorshipSlot): void {
  state.sponsorships[slot] = null;
}

/** Year-End: dekrementiert alle yearsRemaining, expired Verträge → null */
export function dekrementSponsorshipYears(state: TycoonState): void {
  (['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).forEach(slot => {
    const s = state.sponsorships[slot];
    if (!s) return;
    s.yearsRemaining -= 1;
    if (s.yearsRemaining <= 0) {
      state.sponsorships[slot] = null;
    }
  });
}

/** Initial-Seed beim LOAD_GAME für neue Euro-Saves */
export function seedInitialSponsorships(tier: TycoonTier, currentYear: number): TycoonState['sponsorships'] {
  const tb = TIER_BASE[tier];
  const make = (slot: SponsorshipSlot): Sponsorship => ({
    sponsor: pickSponsorName(tier, slot, null),
    valuePerYear: Math.round(tb.sponsorshipFloor[slot] * (0.9 + Math.random() * 0.3)),
    yearsRemaining: 1 + Math.floor(Math.random() * 4),
    signedYear: currentYear - 1,
  });
  return { kit: make('kit'), sleeve: make('sleeve'), stadium: make('stadium') };
}

export function hasExpiredSlot(state: TycoonState): boolean {
  return (['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).some(s => state.sponsorships[s] === null);
}
