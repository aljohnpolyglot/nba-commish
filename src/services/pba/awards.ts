import type { NBAPlayer } from '../../types';

export interface PbaConferenceAward {
  season: number;
  conference: 'philippine' | 'commissioners' | 'governors';
  teamId: number;
  teamName: string;
  finalsMvpId?: string;
  finalsMvpName?: string;
  bestPlayerId?: string;
  bestPlayerName?: string;
  bestImportId?: string;
  bestImportName?: string;
}

export function computeConferenceBestPlayer(
  players: NBAPlayer[],
  pbaTeamTids: Set<number>,
): { id: string; name: string } | null {
  let best: NBAPlayer | null = null;
  let bestPpg = 0;
  for (const p of players) {
    if (!pbaTeamTids.has(p.tid)) continue;
    const stats = p.stats?.[p.stats.length - 1];
    if (!stats || !stats.gp) continue;
    const ppg = (stats.pts ?? 0) / stats.gp;
    if (ppg > bestPpg) {
      bestPpg = ppg;
      best = p;
    }
  }
  return best ? { id: best.internalId, name: best.name } : null;
}

export function computeConferenceBestImport(
  players: NBAPlayer[],
  pbaTeamTids: Set<number>,
): { id: string; name: string } | null {
  let best: NBAPlayer | null = null;
  let bestPpg = 0;
  for (const p of players) {
    if (!pbaTeamTids.has(p.tid)) continue;
    if (!(p as any).isImport) continue;
    const stats = p.stats?.[p.stats.length - 1];
    if (!stats || !stats.gp) continue;
    const ppg = (stats.pts ?? 0) / stats.gp;
    if (ppg > bestPpg) {
      bestPpg = ppg;
      best = p;
    }
  }
  return best ? { id: best.internalId, name: best.name } : null;
}

export function computeSeasonMVP(
  players: NBAPlayer[],
  pbaTeamTids: Set<number>,
): { id: string; name: string } | null {
  // Simple: highest PPG among PBA players across all conferences
  return computeConferenceBestPlayer(players, pbaTeamTids);
}
