// Generates fictional StaffData (owners, GMs, head coaches, league office) for
// fictional leagues. Pulls names from the bundled nameData pool used elsewhere.
//
// Coach bio/contract/2K-rating data lives in lib/staffService (modded-only) —
// for fictional we only set name + position; downstream tooling should treat
// missing bio/contract as "no extra data" rather than crash.

import type { StaffData, StaffMember, NBATeam } from '../types';
import type { NameData } from '../genplayersconstants';

function pickName(nameData: NameData, country = 'USA'): string {
  const c = nameData.countries?.[country] ?? nameData.countries?.['USA'];
  const firstPool = Object.keys(c?.first ?? {});
  const lastPool = Object.keys(c?.last ?? {});
  if (!firstPool.length || !lastPool.length) return 'John Smith';
  const first = firstPool[Math.floor(Math.random() * firstPool.length)];
  const last = lastPool[Math.floor(Math.random() * lastPool.length)];
  return `${first} ${last}`;
}

const LEAGUE_OFFICE_TITLES = [
  'Deputy Commissioner',
  'President of Basketball Operations',
  'SVP of Player Personnel',
  'Director of Officiating',
  'Chief Legal Officer',
  'SVP of Communications',
  'Director of Player Development',
  'VP of Referee Operations',
  'SVP of Marketing',
  'Chief Financial Officer',
];

export function generateFictionalStaff(teams: NBATeam[], nameData: NameData): StaffData {
  const buildPerTeam = (position: string, jobTitle: string): StaffMember[] =>
    teams.map(t => ({
      name: pickName(nameData),
      team: t.name,
      position,
      jobTitle,
      teamLogoUrl: t.logoUrl,
    }));

  const owners = buildPerTeam('Owner', 'Majority Owner');
  const gms = buildPerTeam('GM', 'General Manager');
  const coaches = buildPerTeam('Head Coach', 'Head Coach');
  const leagueOffice: StaffMember[] = LEAGUE_OFFICE_TITLES.map(title => ({
    name: pickName(nameData),
    position: title,
    jobTitle: title,
  }));

  return { owners, gms, coaches, leagueOffice };
}

// ─── Referees ───────────────────────────────────────────────────────────────
// Real-NBA refs are fetched from a gist via fetchRefereeData(); fictional mode
// pre-seeds the same in-memory cache so the gist call never runs.
import type { RefereeData } from '../data/photos/referees';

export function generateFictionalReferees(nameData: NameData, count = 36): RefereeData[] {
  return Array.from({ length: count }, (_, i) => {
    const name = pickName(nameData);
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
    return {
      id: String(1000 + i),
      name,
      slug,
    };
  });
}
