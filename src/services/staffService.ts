import type { StaffData, NBAPlayer as Player } from '../types';

interface TeamLogoRecord {
  logoUrl?: string;
  imgURL?: string;
}
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
  teamNameMap: Map<string, TeamLogoRecord>
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
    if (teamRecord) enriched.teamLogoUrl = teamRecord.logoUrl ?? teamRecord.imgURL;
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

// ── Coach data fetchers ───────────────────────────────────────────────────────

const COACH_PHOTOS_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/60f5ef1e4d09066d1001a9acf3de127a/raw/516852da634669f0f2cd68d6fb1ba5371cb5d15a/coach_photos.json";
const COACHES_BIO_URL = "https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbacoachesbio";
const NBA2K_COACH_LIST_URL = "https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nba2kcoachlist";
const COACH_CONTRACTS_URL = "https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbacoachescontract";

export interface CoachData {
  staff: string;
  team: string;
  startSeason: string;
  yearsInRole: number;
  birthDate: string | null;
  nationality: string;
  img?: string;
}

export interface NBA2KCoachData {
  name: string;
  image: string;
  url: string;
  team: string;
  position: string;
  league: string;
  born: string;
  age: string;
  nationality: string;
  college?: string;
  coaching_career?: string;
  career_history?: string;
  playing_career?: string;
  nba_draft?: string;
  high_school?: string;
  weight?: string;
  height?: string;
}

export interface CoachContractHistory {
  team: string;
  contract_length: number;
  start_year: number;
  end_year: number;
  annual_salary: number;
  total_value: number;
}

export interface CoachContractData {
  name: string;
  total_exp_years: number;
  current_team_2026: string;
  history: CoachContractHistory[];
}

let _coachPhotos: Record<string, string> = {};
let _coachBios: CoachData[] = [];
let _nba2kCoaches: NBA2KCoachData[] = [];
let _coachContracts: CoachContractData[] = [];
let _coachDataFetched = false;

function normalizeName(name: string): string {
  if (!name) return '';
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export const fetchCoachData = async (): Promise<void> => {
  if (_coachDataFetched) return;
  try {
    const [photosRes, biosRes, nba2kRes, contractsRes] = await Promise.all([
      fetch(COACH_PHOTOS_GIST), fetch(COACHES_BIO_URL), fetch(NBA2K_COACH_LIST_URL), fetch(COACH_CONTRACTS_URL),
    ]);
    if (photosRes.ok) {
      const rawPhotos = await photosRes.json();
      _coachPhotos = {};
      for (const key in rawPhotos) _coachPhotos[normalizeName(key)] = rawPhotos[key];
    }
    if (biosRes.ok) _coachBios = await biosRes.json();
    if (nba2kRes.ok) _nba2kCoaches = await nba2kRes.json();
    if (contractsRes.ok) _coachContracts = await contractsRes.json();
    _coachDataFetched = true;
  } catch (e) {
    console.error('[CoachData] fetch failed', e);
  }
};

export const getCoachPhoto = (name: string): string | undefined => _coachPhotos[normalizeName(name)];
export const getCoachBio = (name: string): CoachData | undefined => _coachBios.find(c => normalizeName(c.staff) === normalizeName(name));
export const getAllCoaches = (): CoachData[] => _coachBios;
export const getNBA2KCoach = (name: string): NBA2KCoachData | undefined => _nba2kCoaches.find(c => normalizeName(c.name) === normalizeName(name));
export const getTeamStaff = (teamName: string): NBA2KCoachData[] => _nba2kCoaches.filter(c => c.team === teamName);
export const getCoachContract = (name: string): CoachContractData | undefined => _coachContracts.find(c => normalizeName(c.name) === normalizeName(name));

// ── Main export ────────────────────────────────────────────────────────────────

export const getStaffData = async (
  allPlayers: Player[],
  teamNameMap: Map<string, TeamLogoRecord>
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
