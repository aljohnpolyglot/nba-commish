import type { ExpansionTeamSpec } from '../types';

export interface GeneratedTeamCatalogEntry {
  tid?: number;
  region?: string;
  name?: string;
  abbrev?: string;
  pop?: number;
  stadiumCapacity?: number;
  colors?: string[];
  imgURL?: string;
  imgURLSmall?: string;
  wordmarkURL?: string;
  logos?: { primary?: string; small?: string; wordmark?: string };
  cid?: number;
  conference?: string;
  location?: { latitude?: number; longitude?: number };
}

let generatedTeamCatalogRequest: Promise<GeneratedTeamCatalogEntry[]> | undefined;

export async function loadGeneratedTeamCatalog(): Promise<GeneratedTeamCatalogEntry[]> {
  generatedTeamCatalogRequest ??= fetch('/data/generated-teams.json')
    .then(response => {
      if (!response.ok) throw new Error(`Generated team catalog request failed: ${response.status}`);
      return response.json() as Promise<{ teams?: unknown }>;
    })
    .then(data => Array.isArray(data.teams) ? data.teams as GeneratedTeamCatalogEntry[] : [])
    .catch(error => {
      generatedTeamCatalogRequest = undefined;
      throw error;
    });
  return generatedTeamCatalogRequest;
}

export function generatedCatalogTeamToExpansion(team: GeneratedTeamCatalogEntry): ExpansionTeamSpec {
  const conference = String(team.conference ?? '').toLowerCase();
  const longitude = Number(team.location?.longitude);
  const isEast = team.cid === 0
    || conference.startsWith('east')
    || (team.cid !== 1 && !conference.startsWith('west') && Number.isFinite(longitude) && longitude > -100);
  const colors = team.colors?.length && team.colors.length >= 3
    ? [String(team.colors[0]), String(team.colors[1]), String(team.colors[2])] as [string, string, string]
    : ['#1d428a', '#c8102e', '#ffffff'] as [string, string, string];

  return {
    region: String(team.region ?? '').trim(),
    name: String(team.name ?? '').trim(),
    abbrev: String(team.abbrev ?? '').trim().toUpperCase().slice(0, 3),
    pop: Math.max(0.1, Number(team.pop) || 2),
    stadiumCapacity: Math.max(1, Number(team.stadiumCapacity) || 18_000),
    colors,
    imgURL: team.imgURL ?? team.logos?.primary,
    imgURLSmall: team.imgURLSmall ?? team.logos?.small,
    conference: isEast ? 'East' : 'West',
    cid: isEast ? 0 : 1,
    did: isEast ? 2 : 5,
    lat: Number.isFinite(Number(team.location?.latitude)) ? Number(team.location?.latitude) : undefined,
    lng: Number.isFinite(longitude) ? longitude : undefined,
  };
}
