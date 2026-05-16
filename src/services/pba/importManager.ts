import { getCountryFromLoc } from '../../utils/helpers';
import type { NBAPlayer } from '../../types';

export type ImportRule = 'none' | 'one_no_height_limit' | 'one_max_6ft5';
export type PbaConference = 'philippine' | 'commissioners' | 'governors';

const MAX_HEIGHT_INCHES_GOV_CUP = 77; // 6'5"

export function getImportRuleForConference(conference?: PbaConference): ImportRule {
  if (conference === 'commissioners') return 'one_no_height_limit';
  if (conference === 'governors') return 'one_max_6ft5';
  return 'none';
}

export function isFilipino(player: NBAPlayer): boolean {
  const loc = (player.born?.loc ?? '').toLowerCase();
  const explicit = ((player as any).born?.country ?? (player as any).nationality ?? '').toLowerCase();
  if (explicit.includes('philippines')) return true;
  if (loc.includes('philippines')) return true;
  const country = getCountryFromLoc(player.born?.loc).toLowerCase();
  return country === 'philippines';
}

export function isImportEligible(player: NBAPlayer, conference?: PbaConference): { eligible: boolean; reason?: string } {
  const rule = getImportRuleForConference(conference);

  if (rule === 'none') {
    return { eligible: false, reason: 'No imports allowed in the Philippine Cup' };
  }

  if (isFilipino(player)) {
    return { eligible: true };
  }

  if (rule === 'one_max_6ft5' && (player.hgt ?? 0) > MAX_HEIGHT_INCHES_GOV_CUP) {
    const feet = Math.floor((player.hgt ?? 0) / 12);
    const inches = (player.hgt ?? 0) % 12;
    return { eligible: false, reason: `Governors' Cup imports must be 6'5" or shorter (player is ${feet}'${inches}")` };
  }

  return { eligible: true };
}

export function getActiveImport(players: NBAPlayer[], teamId: number): NBAPlayer | undefined {
  return players.find(p => p.tid === teamId && (p as any).isImport);
}

export function stampImportFlags(players: NBAPlayer[], conference?: PbaConference): NBAPlayer[] {
  if (!conference || conference === 'philippine') return players;
  return players.map(p => {
    if (p.tid < 2000 || p.tid >= 2100) return p;
    if ((p as any).isImport) return p;
    if (isFilipino(p)) return p;
    return { ...p, isImport: true, importConference: conference } as any;
  });
}

export function canSignInPba(
  player: NBAPlayer,
  teamId: number,
  conference: PbaConference | undefined,
  allPlayers: NBAPlayer[],
): { allowed: boolean; reason?: string } {
  if (isFilipino(player)) return { allowed: true };

  const rule = getImportRuleForConference(conference);

  if (rule === 'none') {
    return { allowed: false, reason: 'This is a no-import conference. You can only sign Filipino players.' };
  }

  const existing = getActiveImport(allPlayers, teamId);
  if (existing) {
    return { allowed: false, reason: `Max imports reached. You already have ${existing.name} as your import.` };
  }

  if (rule === 'one_max_6ft5' && (player.hgt ?? 0) > MAX_HEIGHT_INCHES_GOV_CUP) {
    const feet = Math.floor((player.hgt ?? 0) / 12);
    const inches = (player.hgt ?? 0) % 12;
    return { allowed: false, reason: `Governors' Cup imports must be 6'5" or shorter. This player is ${feet}'${inches}".` };
  }

  return { allowed: true };
}
