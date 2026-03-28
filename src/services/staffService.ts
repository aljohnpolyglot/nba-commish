import type { StaffData, NBAPlayer as Player, NBATeam as Team } from '../types';
const STAFF_DATA_URL =
  'https://gist.githubusercontent.com/aljohnpolyglot/27eff0d6d9a204338987e03c7f3bf444/raw/staff_complete_2025';

const COACH_WORKER =
  'https://fragrant-bar-f766.mogatas-princealjohn-05082003.workers.dev/';

// ── Image overrides ────────────────────────────────────────────────────────────

const COACH_IMAGES: Record<string, string> = {};

const OWNER_IMAGES: Record<string, string> = {
  'Tony Ressler':    'https://imageio.forbes.com/specials-images/imageserve/59d5204431358e542c035670/0x0.jpg?format=jpg&crop=1053,1053,x164,y65,safe&height=416&width=416&fit=bounds',
  'Marc Lore':       'https://imageio.forbes.com/specials-images/imageserve/61685375d087090f4887090f/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds',
  'Steve Ballmer':   'https://imageio.forbes.com/specials-images/imageserve/62d6f03769e31b54d502512c/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds',
  'Jerry Reinsdorf': 'https://imageio.forbes.com/specials-images/imageserve/59d51f7231358e542c03550e/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds',
  'Jeanie Buss':     'https://imageio.forbes.com/specials-images/imageserve/59d51f9e31358e542c03555f/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds',
  'Joe Lacob':       'https://imageio.forbes.com/specials-images/imageserve/59d51f8a31358e542c03553d/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds',
};

// ── Replacement pools ──────────────────────────────────────────────────────────

/** Placeholder owner replacements until real fist data is available. */
export const OWNER_REPLACEMENT_POOL: string[] = [
  'Mark Cuban',
  'Peter Guber',
  'Larry Ellison',
  'David Tepper',
  'Tilman Fertitta',
];

// ── Raw gist format ────────────────────────────────────────────────────────────

interface RawStaffMember {
  name: string;
  /** New gist format: contains team name (e.g. "Atlanta Hawks") */
  position?: string;
  imageUrl?: string | null;
  /** Legacy fields — kept for backwards compat */
  team?: string;
  jobTitle?: string;
}

interface EnrichedStaffMember extends RawStaffMember {
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
}

// ── Enrichment ─────────────────────────────────────────────────────────────────

const enrichStaffMember = (
  staffMember: RawStaffMember,
  allPlayers: Player[],
  teamNameMap: Map<string, Team>
): EnrichedStaffMember => {
  const enriched: EnrichedStaffMember = { ...staffMember };

  // 0. Explicit image overrides (coaches / owners)
  if (COACH_IMAGES[staffMember.name]) {
    enriched.playerPortraitUrl = COACH_IMAGES[staffMember.name];
    return enriched;
  }
  if (OWNER_IMAGES[staffMember.name]) {
    enriched.playerPortraitUrl = OWNER_IMAGES[staffMember.name];
    return enriched;
  }

  // 0b. Use imageUrl from gist if provided
  if (staffMember.imageUrl) {
    enriched.playerPortraitUrl = staffMember.imageUrl;
    return enriched;
  }

  // 1. RealGM image pattern
  const nameParts = staffMember.name.split(' ');
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    enriched.playerPortraitUrl = `https://basketball.realgm.com/images/nba/4.2/profiles/photos/2006/${lastName}_${firstName}.jpg`;
  }

  // 2. Fallback: match a player portrait
  if (!enriched.playerPortraitUrl) {
    const playerRecord = allPlayers.find(
      p => p.name.toLowerCase() === staffMember.name.toLowerCase()
    );
    if (playerRecord) enriched.playerPortraitUrl = playerRecord.imgURL;
  }

  // 3. Fallback: team logo — use position (new format) or team (legacy)
  const teamName = staffMember.position || staffMember.team;
  if (!enriched.playerPortraitUrl && teamName) {
    const teamRecord = teamNameMap.get(teamName.toLowerCase());
    if (teamRecord) enriched.teamLogoUrl = teamRecord.logoUrl;
  }

  return enriched;
};

// ── Coach assistant fetcher (for fire-replacement UI) ─────────────────────────

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fetches assistant coach names for a given head coach name.
 * Returns [] on any failure.
 */
export async function getCoachAssistants(coachName: string): Promise<string[]> {
  try {
    const slug = nameToSlug(coachName);
    const res = await fetch(`${COACH_WORKER}?slug=${slug}`);
    if (!res.ok) return [];
    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const section = doc.querySelector('.fusion-text-2');
    if (!section) return [];

    const names: string[] = [];
    section.querySelectorAll('li, p').forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 2) names.push(text);
    });
    return names;
  } catch {
    return [];
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

export const getStaffData = async (
  allPlayers: Player[],
  teamNameMap: Map<string, Team>
): Promise<StaffData> => {
  try {
    const response = await fetch(STAFF_DATA_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const enrichedOwners = (data.owners || []).map((owner: RawStaffMember) =>
      enrichStaffMember(owner, allPlayers, teamNameMap)
    );

    const enrichedGms = (data.gms || []).map((gm: RawStaffMember) => {
      const enriched = enrichStaffMember(gm, allPlayers, teamNameMap);
      // Manual correction for Dallas GM
      const teamField = (enriched.position || enriched.team || '').toLowerCase();
      if (teamField === 'mavericks' || teamField === 'dallas mavericks' || teamField === 'dallas') {
        enriched.name = 'Michael Finley';
        enriched.jobTitle = 'General Manager';
      }
      return enriched;
    });

    const enrichedCoaches = (data.coaches || []).map((coach: RawStaffMember) =>
      enrichStaffMember(coach, allPlayers, teamNameMap)
    );

    const enrichedLeagueOffice = (data.leagueOffice || []).map((lo: RawStaffMember) =>
      enrichStaffMember(lo, allPlayers, teamNameMap)
    );

    return {
      owners: enrichedOwners,
      gms: enrichedGms,
      coaches: enrichedCoaches,
      leagueOffice: enrichedLeagueOffice,
    };
  } catch (error) {
    console.error('Failed to fetch and process staff data:', error);
    return { owners: [], gms: [], coaches: [], leagueOffice: [] };
  }
};
