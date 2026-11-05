import { getPlayerInjuryProfile, type PlayerInjuryProfile } from '../data/playerInjuryData';
import type { NBAPlayer } from '../types';
import type { K2Data } from '../services/simulation/convert2kAttributes';
import { isExternalLeagueStatus } from '../constants';

export function computeDurability(careerCount: number, careerGP: number): number {
  if (careerGP <= 0) return 75;
  const per100 = (careerCount / careerGP) * 100;
  return Math.max(0, Math.min(99, Math.round(99 - per100 * 5)));
}

export function getPlayerInjuryProfileForPlayer(player: NBAPlayer): PlayerInjuryProfile | null {
  if (
    player.sourceInjuryProfileDisabled ||
    player.face != null ||
    String(player.internalId ?? '').startsWith('gen-')
  ) return null;
  return getPlayerInjuryProfile(player.name);
}

export function applyHistoricalNbaInjuryProfilePolicy(
  players: NBAPlayer[],
  startYear: number,
): NBAPlayer[] {
  if (!Number.isFinite(Number(startYear))) return players;
  let changed = false;
  const next = players.map(player => {
    if (player.tid >= 100 || isExternalLeagueStatus(player.status)) return player;
    const draftYear = Number(player.draft?.year);
    const brokenPostBranchDurability =
      Number.isFinite(draftYear) &&
      draftYear >= startYear &&
      player.durability != null &&
      player.durability <= 0;
    if (player.sourceInjuryProfileDisabled && !brokenPostBranchDurability) return player;
    changed = true;
    return {
      ...player,
      sourceInjuryProfileDisabled: true,
      ...(brokenPostBranchDurability ? { durability: 75 } : {}),
    };
  });
  return changed ? next : players;
}

export function getRealDurability(player: NBAPlayer): number | null {
  if (player.durability != null) return player.durability;
  const profile = getPlayerInjuryProfileForPlayer(player);
  if (!profile) return null;
  const careerGP = (player.stats ?? [])
    .filter((stat: any) => !stat.playoffs && (stat.tid ?? -1) >= 0)
    .reduce((sum: number, stat: any) => sum + (stat.gp ?? 0), 0);
  return computeDurability(profile.careerCount, careerGP);
}

export function applyDurabilityToK2(k2: K2Data, durability: number | null): K2Data {
  if (durability == null) return k2;
  const value = Math.max(0, Math.min(99, durability));
  return {
    ...k2,
    MI: { sub: [value], ovr: value },
  };
}

export function durabilityColor(durability: number): string {
  if (durability >= 80) return '#22c55e';
  if (durability >= 60) return '#eab308';
  if (durability >= 40) return '#f97316';
  return '#f43f5e';
}

export function durabilityLabel(durability: number): string {
  if (durability >= 90) return 'Iron Man';
  if (durability >= 75) return 'Durable';
  if (durability >= 60) return 'Average';
  if (durability >= 45) return 'Fragile';
  if (durability >= 30) return 'Injury-Prone';
  return 'Glass';
}
