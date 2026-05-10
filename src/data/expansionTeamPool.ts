// Expansion Draft — vorgefüllter ZenGM-/NBA-Default-Pool (Pool A).
//
// Quelle: ZenGM teamInfos.ts (Apache 2.0)
// https://raw.githubusercontent.com/zengm-games/zengm/master/src/common/teamInfos.ts
// — daraus die 10 NBA-Expansion-relevanten Cities. Hartford + Anaheim sind in
// teamInfos.ts nicht enthalten und unten manuell ergänzt mit Pop-Daten aus
// US-Census-Metro-Stats (Hartford ~1.2M, Anaheim ~13.2M = LA-Combined).
//
// Conference/Division folgen ZenGM-2029-Schema (8 Divisionen à 4 Teams):
//   East / cid=0 : Northeast(0), Midwest(1), Mid-Atlantic(2), Southeast(3)
//   West / cid=1 : Northwest(4), Pacific(5),  Southwest(6),    Central(7)
//
// Nicht das Repo-Legacy-6-Div-Schema (fictionalTeams.ts) — User-Spec via Blog
// 2026-04-09 + BBGM-Save-Layout (Save zeigt Division 1-8).
//
// User kann im ExpansionDraftSetupModal alles überschreiben (Region, Name,
// Abbrev, Pop, Conference, Division, Colors).

import type { ExpansionTeamSpec } from '../types';

export const ZENGM_EXPANSION_POOL: ExpansionTeamSpec[] = [
  {
    region: 'Seattle',
    name: 'SuperSonics',
    abbrev: 'SEA',
    pop: 3.8,
    colors: ['#005c5c', '#fbe122', '#356830'],
    conference: 'West',
    cid: 1,
    did: 4, // Northwest
  },
  {
    region: 'Las Vegas',
    name: 'Knights',
    abbrev: 'LV',
    pop: 2.1,
    colors: ['#1c73bb', '#ffd600', '#0c5983'],
    conference: 'West',
    cid: 1,
    did: 5, // Pacific
  },
  {
    region: 'Vancouver',
    name: 'Grizzlies',
    abbrev: 'VAN',
    pop: 2.3,
    colors: ['#00788c', '#f5b112', '#bed4e9'],
    conference: 'West',
    cid: 1,
    did: 5, // Pacific
  },
  {
    region: 'Buffalo',
    name: 'Braves',
    abbrev: 'BUF',
    pop: 1.1,
    colors: ['#07295c', '#f16229', '#d13522'],
    conference: 'East',
    cid: 0,
    did: 0, // Northeast
  },
  {
    region: 'Kansas City',
    name: 'Kings',
    abbrev: 'KC',
    pop: 1.6,
    colors: ['#8f2100', '#ffb500', '#d4731c'],
    conference: 'East',
    cid: 0,
    did: 1, // Midwest
  },
  {
    region: 'San Diego',
    name: 'Clippers',
    abbrev: 'SD',
    pop: 4.7,
    colors: ['#1d428a', '#c8102e', '#bec0c2'],
    conference: 'West',
    cid: 1,
    did: 5, // Pacific
  },
  {
    region: 'Pittsburgh',
    name: 'Rivers',
    abbrev: 'PIT',
    pop: 1.7,
    colors: ['#231f20', '#fbee28', '#a5acaf'],
    conference: 'East',
    cid: 0,
    did: 2, // Mid-Atlantic
  },
  {
    region: 'Baltimore',
    name: 'Bullets',
    abbrev: 'BAL',
    pop: 2.7,
    colors: ['#002b5c', '#e31837', '#ffffff'],
    conference: 'East',
    cid: 0,
    did: 2, // Mid-Atlantic
  },
  {
    region: 'St. Louis',
    name: 'Hawks',
    abbrev: 'STL',
    pop: 2.2,
    colors: ['#c8102e', '#fdb927', '#000000'],
    conference: 'East',
    cid: 0,
    did: 1, // Midwest
  },
  {
    region: 'Mexico City',
    name: 'Aztecs',
    abbrev: 'MXC',
    pop: 20.5,
    colors: ['#1a9190', '#510f0f', '#eb5924'],
    conference: 'West',
    cid: 1,
    did: 6, // Southwest
  },

  // ─── Manuell ergänzt (nicht in ZenGM teamInfos.ts) ────────────────────────
  {
    region: 'Hartford',
    name: 'Whalers',
    abbrev: 'HAR',
    pop: 1.2,
    colors: ['#0c8e36', '#000000', '#e51937'],
    conference: 'East',
    cid: 0,
    did: 0, // Northeast
  },
  {
    region: 'Anaheim',
    name: 'Mighty Ducks',
    abbrev: 'ANA',
    pop: 13.2,
    colors: ['#fc4c02', '#a2aaad', '#000000'],
    conference: 'West',
    cid: 1,
    did: 5, // Pacific
  },
];

/** Lookup per Abbrev — z. B. wenn der User im Modal "SEA" anklickt und wir die
 *  Default-Werte einsetzen müssen. */
export function getZenGMTeamByAbbrev(abbrev: string): ExpansionTeamSpec | undefined {
  return ZENGM_EXPANSION_POOL.find(t => t.abbrev === abbrev);
}
