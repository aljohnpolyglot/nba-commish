import type { NBAPlayer } from '../../types';
import { isFilipino } from './importManager';

export function getPbaDraftPool(players: NBAPlayer[]): NBAPlayer[] {
  return players.filter(p => {
    if (p.tid !== -2) return false; // draft prospects only
    if (!isFilipino(p)) return false;
    return true;
  });
}

export function getPbaDraftOrder(
  standings: Array<{ tid: number; w: number; l: number }>,
  pbaTeamTids: number[],
): number[] {
  // Reverse Gov Cup standings (worst record picks first)
  const standingsMap = new Map(standings.map(s => [s.tid, s]));
  return [...pbaTeamTids].sort((a, b) => {
    const ra = standingsMap.get(a);
    const rb = standingsMap.get(b);
    if (!ra && !rb) return 0;
    if (!ra) return -1;
    if (!rb) return 1;
    const pctA = ra.w + ra.l > 0 ? ra.w / (ra.w + ra.l) : 0;
    const pctB = rb.w + rb.l > 0 ? rb.w / (rb.w + rb.l) : 0;
    return pctA - pctB; // worst first
  });
}

export const PBA_DRAFT_ROUNDS = 2;
