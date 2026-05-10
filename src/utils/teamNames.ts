// Canonical team-name resolver für UI-Rendering.
//
// NBA-Convention (siehe README + CLAUDE.md): NBATeam.name enthält normalerweise
// bereits die Stadt — z. B. "Houston Rockets", "Oklahoma City Thunder". Code
// der `region + ' ' + name` konkateniert produziert dann "Houston Houston
// Rockets". Andererseits speichern Expansion-Teams gelegentlich nur den
// Nickname ("Rockets" / "Blue Chips" / "SuperSonics"). Dieser Helper
// normalisiert beides:
//
//   { name: "Houston Rockets",   region: "Houston"   } → "Houston Rockets"
//   { name: "Rockets",           region: "Houston"   } → "Houston Rockets"
//   { name: "Blue Chips",        region: "Las Vegas" } → "Las Vegas Blue Chips"
//   { name: "SuperSonics",       region: "Seattle"   } → "Seattle SuperSonics"
//   { name: "Atlanta Hawks",     region: "Atlanta"   } → "Atlanta Hawks"
//   { name: "Houston Houston Rockets" }                → "Houston Houston Rockets" (already broken — leave alone)
//
// Use this anywhere a Team-Header / List / Standings displays a team name.
// Replace inline `${team.region} ${team.name}` with `getTeamFullName(team)`.

export interface TeamLike {
  name?: string;
  region?: string;
  abbrev?: string;
  abbreviation?: string;
  location?: string;
  id?: number;
  tid?: number;
}

/** Returns "Region Nickname" — handles legacy/expansion saves where `name`
 *  may be either nickname-only or already-prefixed. */
export function getTeamFullName(team: TeamLike | null | undefined): string {
  if (!team) return '';
  const name = (team.name ?? '').trim();
  const region = (team.region ?? team.location ?? '').trim();
  if (!name) return region;
  if (!region) return name;
  // Already starts with region (BBGM standard pattern) → use as-is
  if (name.toLowerCase().startsWith(region.toLowerCase() + ' ') || name.toLowerCase() === region.toLowerCase()) {
    return name;
  }
  return `${region} ${name}`;
}

/** Just the nickname portion (Rockets, Blue Chips). Inverse of fullName. */
export function getTeamNickname(team: TeamLike | null | undefined): string {
  if (!team) return '';
  const name = (team.name ?? '').trim();
  const region = (team.region ?? team.location ?? '').trim();
  if (!region || !name) return name;
  if (name.toLowerCase().startsWith(region.toLowerCase() + ' ')) {
    return name.slice(region.length).trim();
  }
  return name;
}
