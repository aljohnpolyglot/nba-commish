import type { NBAPlayer } from '../../types';
import { getProspectDisplayPotential } from '../../utils/playerRatings';
import { calcOvr2K } from '../trade/tradeValueEngine';

const unit = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

export function calculateInternationalDraftValue(player: NBAPlayer, draftYear: number): number {
  const overall = calcOvr2K(player);
  const potential = getProspectDisplayPotential(player, draftYear);
  const age = player.born?.year ? draftYear - player.born.year : Number(player.age ?? 22);
  const ageAdjustment = age <= 19 ? 5 : age === 20 ? 2 : age === 21 ? 0 : -4;
  return Math.max(30, Math.min(99, Math.round(overall * 0.58 + potential * 0.42 + ageAdjustment)));
}

export function shouldDeclareForInternationalDraft(player: NBAPlayer, draftYear: number): boolean {
  const age = player.born?.year ? draftYear - player.born.year : Number(player.age ?? 99);
  if (age < 19 || age > 22) return false;
  const value = calculateInternationalDraftValue(player, draftYear);
  if (value >= 82) return true;
  const chance = value >= 77 ? 0.72 : value >= 72 ? 0.34 : value >= 68 ? 0.1 : 0;
  return unit(`${player.internalId}:${draftYear}:declare`) < chance;
}

export function projectInternationalDraftSelection(player: NBAPlayer, draftYear: number): {
  score: number;
  selected: boolean;
  pick?: number;
  destinationIndex?: number;
} {
  const score = calculateInternationalDraftValue(player, draftYear);
  const selectionChance = score >= 86 ? 0.99 : score >= 80 ? 0.9 : score >= 76 ? 0.64 : score >= 72 ? 0.28 : 0.06;
  const selected = unit(`${player.internalId}:${draftYear}:selected`) < selectionChance;
  if (!selected) return { score, selected };
  const pick = Math.max(1, Math.min(60, Math.round(3 + (92 - score) * 2.1 + unit(`${player.internalId}:${draftYear}:pick`) * 12)));
  return {
    score,
    selected,
    pick,
    destinationIndex: Math.floor(unit(`${player.internalId}:${draftYear}:team`) * 30),
  };
}
