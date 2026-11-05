import rawCollegeTeams from '../data/collegeTeamCatalog.json';
import rawCollegeAliases from '../data/collegeTeamAliases.json';

export interface CollegeTeamProfile {
  id: string;
  name: string;
  mascot: string;
  abbreviation: string;
  conferenceId: string;
  conferenceName: string;
  isPowerConference: boolean;
  prestige: number;
  offenseRating: number;
  defenseRating: number;
  state: string;
  pipelineStates: string[];
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
}

const collegeTeams = rawCollegeTeams as CollegeTeamProfile[];
const collegeAliases = rawCollegeAliases.aliases as Record<string, string>;

function normalizeCollegeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

const ambiguousCollegeKeys = new Set(rawCollegeAliases.ambiguous.map(normalizeCollegeKey));

function saintVariant(value: string): string | null {
  if (/\bsaint\b/i.test(value)) return value.replace(/\bsaint\b/gi, 'St.');
  if (/\bst\b\.?/i.test(value)) return value.replace(/\bst\b\.?/gi, 'Saint');
  return null;
}

function addCatalogAlias(
  map: Map<string, CollegeTeamProfile | null>,
  alias: string | null | undefined,
  team: CollegeTeamProfile,
) {
  if (!alias) return;
  const normalized = normalizeCollegeKey(alias);
  if (!normalized) return;

  const existing = map.get(normalized);
  if (existing && existing.id !== team.id) {
    map.set(normalized, null);
    return;
  }
  if (!map.has(normalized)) map.set(normalized, team);
}

function buildCollegeLookup(): Map<string, CollegeTeamProfile | null> {
  const lookup = new Map<string, CollegeTeamProfile | null>();
  const teamsById = new Map(collegeTeams.map(team => [team.id, team]));

  for (const team of collegeTeams) {
    addCatalogAlias(lookup, team.name, team);
    addCatalogAlias(lookup, team.abbreviation, team);
    addCatalogAlias(lookup, `${team.name} ${team.mascot}`, team);

    const saintName = saintVariant(team.name);
    const saintFullName = saintVariant(`${team.name} ${team.mascot}`);
    addCatalogAlias(lookup, saintName, team);
    addCatalogAlias(lookup, saintFullName, team);
  }

  for (const [alias, teamId] of Object.entries(collegeAliases)) {
    const team = teamsById.get(teamId);
    if (!team) throw new Error(`Unknown college team alias target: ${teamId}`);
    lookup.set(normalizeCollegeKey(alias), team);
  }

  return lookup;
}

const collegeLookup = buildCollegeLookup();

export function getCollegeTeamLabel(team: CollegeTeamProfile): string {
  return team.mascot ? `${team.name} ${team.mascot}` : team.name;
}

export function findCollegeTeamProfile(collegeName?: string | null): CollegeTeamProfile | null {
  if (!collegeName) return null;

  const normalized = normalizeCollegeKey(collegeName);
  if (!normalized) return null;
  if (ambiguousCollegeKeys.has(normalized)) return null;

  const direct = collegeLookup.get(normalized);
  return direct ?? null;
}
