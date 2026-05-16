/**
 * marketEligibility.ts — single source of truth for which leagues participate
 * in the Euro Transfer Market.
 *
 * Architectural reason this lives in its own file: tickTransferMarket, the UI
 * filters, and the team-league label helper all need to agree on "which TIDs
 * are valid sellers/bidders". Hardcoding ranges in three places led to leaks
 * (WNBA/PBA/B-League/CBA teams showing up as 'Liga Endesa' listings). One
 * registry → one truth.
 *
 * TID offset convention (per CLAUDE.md):
 *   NBA:        0–99
 *   Euroleague: 1000–1999
 *   PBA:        2000–2999
 *   WNBA:       3000–3999
 *   B-League:   4000–4999
 *   Liga Endesa: 5000–5999
 *   G-League:   6000–6999
 *   CBA:        7000–7999
 *   NBL:        8000–8999
 */

export interface TransferMarketLeague {
  name: string;
  minTid: number;
  maxTid: number;
}

/**
 * Leagues that participate in the Euro Transfer Market. To add a new league
 * (e.g. B-League if user enables it), append here and the ticker + UI pick it
 * up automatically. PBA, WNBA, G-League, CBA, NBL deliberately excluded —
 * they have their own roster mechanics or no transfer-fee concept at all.
 */
export const TRANSFER_MARKET_LEAGUES: readonly TransferMarketLeague[] = [
  { name: 'Euroleague',  minTid: 1000, maxTid: 1999 },
  { name: 'Liga Endesa', minTid: 5000, maxTid: 5999 },
];

/** True if this tid belongs to a league that participates in the transfer market. */
export function isTransferMarketEligibleTid(tid: number): boolean {
  if (typeof tid !== 'number' || tid < 0) return false;
  return TRANSFER_MARKET_LEAGUES.some(lg => tid >= lg.minTid && tid <= lg.maxTid);
}

/** Returns the league a tid belongs to, or null if it's not in any transfer-market league. */
export function getTransferMarketLeague(tid: number): TransferMarketLeague | null {
  if (typeof tid !== 'number' || tid < 0) return null;
  return TRANSFER_MARKET_LEAGUES.find(lg => tid >= lg.minTid && tid <= lg.maxTid) ?? null;
}

/** Filter a list of teams (NBATeam-shaped or tycoon-shaped) down to eligible sellers/bidders. */
export function filterTransferMarketTeams<T extends { tid?: number; id?: number }>(teams: T[]): T[] {
  return teams.filter(t => isTransferMarketEligibleTid((t.tid ?? t.id) as number));
}
