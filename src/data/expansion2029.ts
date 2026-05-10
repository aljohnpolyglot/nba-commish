// ZenGM 2029-Expansion-Default-Daten — geteilt zwischen ExpansionDraftSetupModal
// (Apply-Template-Button) und GameContext.tsx (Auto-Seed bei Game-Init).
//
// Quelle: ZenGM-Blog 2026-04-09 + BBGM-2028-Save-Layout.

import type { ExpansionTeamSpec } from '../types';
import { ZENGM_EXPANSION_POOL } from './expansionTeamPool';

export type RealignmentMove = { conference: 'East' | 'West'; cid: 0 | 1; did: number };

/** 8 Divisionen à 4 Teams. Maps NBA-tid (staticNbaTeams.ts) → neue
 *  conference/cid/did. MIN bewegt sich West→East — alle anderen bleiben in
 *  ihrer Conference, bekommen aber neue Division-Zuordnungen.
 *
 *    East/cid=0:  Northeast(0), Midwest(1), Mid-Atlantic(2), Southeast(3)
 *    West/cid=1:  Northwest(4), Pacific(5),  Southwest(6),    Central(7)
 */
export const ZENGM_2029_REALIGNMENT: Record<number, RealignmentMove> = {
  // East
  0:  { conference: 'East', cid: 0, did: 3 }, // ATL → Southeast
  1:  { conference: 'East', cid: 0, did: 0 }, // BOS → Northeast
  2:  { conference: 'East', cid: 0, did: 0 }, // BKN → Northeast
  3:  { conference: 'East', cid: 0, did: 3 }, // CHA → Southeast
  4:  { conference: 'East', cid: 0, did: 1 }, // CHI → Midwest
  5:  { conference: 'East', cid: 0, did: 2 }, // CLE → Mid-Atlantic
  8:  { conference: 'East', cid: 0, did: 1 }, // DET → Midwest
  11: { conference: 'East', cid: 0, did: 2 }, // IND → Mid-Atlantic
  15: { conference: 'East', cid: 0, did: 3 }, // MIA → Southeast
  16: { conference: 'East', cid: 0, did: 1 }, // MIL → Midwest
  17: { conference: 'East', cid: 0, did: 1 }, // MIN → East/Midwest (West→East move)
  19: { conference: 'East', cid: 0, did: 0 }, // NYK → Northeast
  21: { conference: 'East', cid: 0, did: 3 }, // ORL → Southeast
  22: { conference: 'East', cid: 0, did: 0 }, // PHI → Northeast
  27: { conference: 'East', cid: 0, did: 2 }, // TOR → Mid-Atlantic
  29: { conference: 'East', cid: 0, did: 2 }, // WAS → Mid-Atlantic
  // West
  6:  { conference: 'West', cid: 1, did: 6 }, // DAL → Southwest
  7:  { conference: 'West', cid: 1, did: 7 }, // DEN → Central
  9:  { conference: 'West', cid: 1, did: 4 }, // GSW → Northwest
  10: { conference: 'West', cid: 1, did: 6 }, // HOU → Southwest
  12: { conference: 'West', cid: 1, did: 5 }, // LAC → Pacific
  13: { conference: 'West', cid: 1, did: 5 }, // LAL → Pacific
  14: { conference: 'West', cid: 1, did: 7 }, // MEM → Central
  18: { conference: 'West', cid: 1, did: 6 }, // NOP → Southwest
  20: { conference: 'West', cid: 1, did: 7 }, // OKC → Central
  23: { conference: 'West', cid: 1, did: 5 }, // PHX → Pacific
  24: { conference: 'West', cid: 1, did: 4 }, // POR → Northwest
  25: { conference: 'West', cid: 1, did: 4 }, // SAC → Northwest
  26: { conference: 'West', cid: 1, did: 6 }, // SAS → Southwest
  28: { conference: 'West', cid: 1, did: 7 }, // UTA → Central
};

export const SEED_2029_YEAR = 2029;

/** Default-Expansion-Teams für Auto-Seed: Seattle + Vegas aus Pool A. */
export const SEED_2029_TEAMS: ExpansionTeamSpec[] =
  ZENGM_EXPANSION_POOL.filter(t => t.abbrev === 'SEA' || t.abbrev === 'LV');

export const SEED_2029_SETTINGS = {
  perTeamLimit: 8,
  maxDraftedPerTeam: 2,
  picksPerExpansionTeam: 14,
};
