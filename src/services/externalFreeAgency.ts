/**
 * externalFreeAgency.ts
 *
 * Annual free-agency pass for foreign-league players. Runs at season rollover
 * (Jun 30) AFTER the rollover map has auto-resigned sub-K2-70 players in place
 * and BEFORE retirement/repopulation.
 *
 * Inputs: pool of players whose contracts JUST expired this rollover (collected
 * by seasonRollover.ts via a side-effect Set).
 *
 * Per-player decision (constants from src/constants.ts):
 *   roll < EXTERNAL_RESIGN_PROBABILITY (0.90) → keep current re-sign (no-op)
 *   0.90 ≤ roll < 0.97                        → switch teams within same league
 *   roll ≥ 0.97                               → cross-league move
 *
 * Within-league team switching uses resolveClubAffinity (already exported from
 * externalLeagueSustainer) + HOME_COUNTRY_BIAS to weight home-country clubs.
 * Cross-league uses resolveNationalityLeague (also exported from sustainer).
 *
 * Salary on the new deal: scaled from EXTERNAL_SALARY_SCALE × OVR-norm, mirroring
 * spawnExternalPlayer's formula.
 */

import type { GameState, NBAPlayer } from '../types';
import {
  EXTERNAL_SALARY_SCALE,
  EXTERNAL_RESIGN_PROBABILITY,
  HOME_COUNTRY_BIAS,
} from '../constants';
import { resolveClubAffinity, resolveNationalityLeague } from './externalLeagueSustainer';

const TEAM_SWITCH_CUTOFF = EXTERNAL_RESIGN_PROBABILITY + 0.07; // 0.97
const EXTERNAL_LEAGUES = new Set([
  'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League', 'WNBA',
]);

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function pickWeighted<T>(items: Array<{ item: T; weight: number }>, rng: number): T | null {
  const total = items.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return items[0]?.item ?? null;
  let roll = rng * total;
  for (const e of items) {
    roll -= Math.max(0, e.weight);
    if (roll <= 0) return e.item;
  }
  return items[items.length - 1]?.item ?? null;
}

function computeSalaryUSD(league: string, ovr: number, salaryCap: number): number {
  const scale = EXTERNAL_SALARY_SCALE[league] ?? { minPct: 0.001, maxPct: 0.005 };
  // Map OVR 30→min, 60→max with linear interpolation (matches spawnExternalPlayer's band).
  const ovrNorm = Math.max(0, Math.min(1, (ovr - 30) / 30));
  return Math.round(salaryCap * (scale.minPct + ovrNorm * (scale.maxPct - scale.minPct)));
}

export interface ExternalFAHistoryEntry {
  text: string;
  date: string;
  type: 'Signing';
  playerIds: string[];
}

export function runExternalFreeAgency(
  state: GameState & { nonNBATeams?: any[] },
  expiredPlayerIds: Set<string>,
  currentYear: number,
): { players: NBAPlayer[]; historyEntries: ExternalFAHistoryEntry[] } {
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const historyEntries: ExternalFAHistoryEntry[] = [];

  if (expiredPlayerIds.size === 0) {
    return { players: state.players, historyEntries };
  }

  const updatedPlayers = state.players.map(p => {
    if (!expiredPlayerIds.has(p.internalId)) return p;
    const status = (p as any).status ?? '';
    if (!EXTERNAL_LEAGUES.has(status)) return p;
    if ((p as any).diedYear || status === 'Retired') return p;

    const seed = `extfa_${p.internalId}_${currentYear}`;
    const roll = seededRandom(seed);

    // 90% — keep the auto-resign (no-op, the rollover map already extended the contract)
    if (roll < EXTERNAL_RESIGN_PROBABILITY) return p;

    const country = p.born?.loc ?? (p as any).nationality ?? '';
    const ovr = p.overallRating ?? 40;
    const currentTid = p.tid;

    // 7% — switch teams within the same league
    if (roll < TEAM_SWITCH_CUTOFF) {
      const sameLeagueTeams = nonNBATeams.filter(t => t.league === status && t.tid !== currentTid);
      if (sameLeagueTeams.length === 0) return p;

      const weights = sameLeagueTeams.map(team => {
        const affinity = resolveClubAffinity(team.tid, country);
        const homeBoost = affinity >= 3.0 ? HOME_COUNTRY_BIAS / (1 - HOME_COUNTRY_BIAS) : 1.0;
        const roster = state.players.filter(pp => pp.tid === team.tid && (pp as any).status !== 'Retired').length;
        const slotPenalty = roster >= 13 ? 0.3 : 1.0; // discourage stuffing already-full rosters
        return { item: team, weight: affinity * homeBoost * slotPenalty };
      });
      const newTeam = pickWeighted(weights, seededRandom(seed + '_team'));
      if (!newTeam) return p;

      const newSalaryUSD = computeSalaryUSD(status, ovr, salaryCap);
      const newExp = currentYear + 1 + Math.floor(seededRandom(seed + '_yrs') * 2); // 1-2 yrs
      historyEntries.push({
        text: `${p.name} signed with ${newTeam.region ?? ''} ${newTeam.name ?? newTeam.abbrev ?? 'club'} (${status}).`.replace(/\s+/g, ' ').trim(),
        date: state.date ?? `Jun 30, ${currentYear}`,
        type: 'Signing',
        playerIds: [p.internalId],
      });
      return {
        ...p,
        tid: newTeam.tid,
        yearsWithTeam: 0,
        contract: { ...(p.contract ?? {}), amount: Math.round(newSalaryUSD / 1_000), exp: newExp, hasPlayerOption: false },
      } as any as NBAPlayer;
    }

    // 3% — cross-league move (men's external only — WNBA stays in WNBA)
    if (status === 'WNBA') return p;
    const targetLeague = resolveNationalityLeague(country, seededRandom(seed + '_league'));
    if (!targetLeague || targetLeague === status || !EXTERNAL_LEAGUES.has(targetLeague) || targetLeague === 'WNBA') {
      return p;
    }
    const targetTeams = nonNBATeams.filter(t => t.league === targetLeague);
    if (targetTeams.length === 0) return p;

    const weights = targetTeams.map(team => {
      const affinity = resolveClubAffinity(team.tid, country);
      const roster = state.players.filter(pp => pp.tid === team.tid && (pp as any).status !== 'Retired').length;
      const slotPenalty = roster >= 13 ? 0.3 : 1.0;
      return { item: team, weight: affinity * slotPenalty };
    });
    const newTeam = pickWeighted(weights, seededRandom(seed + '_xleague_team'));
    if (!newTeam) return p;

    const newSalaryUSD = computeSalaryUSD(targetLeague, ovr, salaryCap);
    const newExp = currentYear + 1 + Math.floor(seededRandom(seed + '_xleague_yrs') * 2);
    historyEntries.push({
      text: `${p.name} left the ${status} to sign with ${newTeam.region ?? ''} ${newTeam.name ?? newTeam.abbrev ?? 'club'} (${targetLeague}).`.replace(/\s+/g, ' ').trim(),
      date: state.date ?? `Jun 30, ${currentYear}`,
      type: 'Signing',
      playerIds: [p.internalId],
    });
    return {
      ...p,
      tid: newTeam.tid,
      status: targetLeague as NBAPlayer['status'],
      yearsWithTeam: 0,
      contract: { ...(p.contract ?? {}), amount: Math.round(newSalaryUSD / 1_000), exp: newExp, hasPlayerOption: false },
    } as any as NBAPlayer;
  });

  if (historyEntries.length > 0) {
    console.log(`[ExternalFA] ${historyEntries.length} external FA moves processed (pool: ${expiredPlayerIds.size})`);
  }

  return { players: updatedPlayers, historyEntries };
}
