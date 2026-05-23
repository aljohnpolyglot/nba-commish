import rawCollegeTeams from '../data/collegeTeamCatalog.json';

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

const MANUAL_ALIASES: Record<string, string> = {
  unc: 'North Carolina',
  ncstate: 'NC State',
  missst: 'Mississippi State',
  stjohns: "St. John's",
  saintjohns: "St. John's",
  stjoes: "Saint Joseph's",
  saintjoes: "Saint Joseph's",
  olemiss: 'Ole Miss',
};

function normalizeCollegeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

function saintVariant(value: string): string | null {
  if (/\bsaint\b/i.test(value)) return value.replace(/\bsaint\b/gi, 'St.');
  if (/\bst\b\.?/i.test(value)) return value.replace(/\bst\b\.?/gi, 'Saint');
  return null;
}

function addAlias(map: Map<string, CollegeTeamProfile>, alias: string | null | undefined, team: CollegeTeamProfile) {
  if (!alias) return;
  const normalized = normalizeCollegeKey(alias);
  if (!normalized || map.has(normalized)) return;
  map.set(normalized, team);
}

function buildCollegeLookup(): Map<string, CollegeTeamProfile> {
  const lookup = new Map<string, CollegeTeamProfile>();

  for (const team of collegeTeams) {
    addAlias(lookup, team.name, team);
    addAlias(lookup, team.abbreviation, team);
    addAlias(lookup, `${team.name} ${team.mascot}`, team);

    const saintName = saintVariant(team.name);
    const saintFullName = saintVariant(`${team.name} ${team.mascot}`);
    addAlias(lookup, saintName, team);
    addAlias(lookup, saintFullName, team);
  }

  for (const [alias, teamName] of Object.entries(MANUAL_ALIASES)) {
    const team = collegeTeams.find(entry => normalizeCollegeKey(entry.name) === normalizeCollegeKey(teamName));
    if (team) addAlias(lookup, alias, team);
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

  const direct = collegeLookup.get(normalized);
  if (direct) return direct;

  let bestMatch: CollegeTeamProfile | null = null;
  let bestScore = 0;

  for (const team of collegeTeams) {
    for (const candidate of [team.name, `${team.name} ${team.mascot}`, team.abbreviation]) {
      const candidateKey = normalizeCollegeKey(candidate);
      if (!candidateKey) continue;
      if (normalized === candidateKey) return team;
      if (normalized.includes(candidateKey) || candidateKey.includes(normalized)) {
        const score = Math.min(normalized.length, candidateKey.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = team;
        }
      }
    }
  }

  return bestMatch;
}
