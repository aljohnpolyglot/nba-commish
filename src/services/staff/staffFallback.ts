/**
 * staffFallback — synthetic placeholders for missing staff data.
 *
 * NBA staff (coaches, GMs, owners) come from a curated gist. International
 * leagues (Endesa, Euroleague, …) have no equivalent dataset, so consumers
 * that look up staff for those teams get null.
 *
 * Rather than auto-generating staff at init time and persisting them in
 * `state.staff` (heavy + churns saves), we provide on-demand synthetic
 * records here. Same pattern fictional league uses for its generated
 * coaches, but lazier — only created when something asks.
 *
 * Use these when a real lookup returns null but the UI needs a non-null
 * value to render. Don't push these into `state.staff`; they are
 * read-through fallbacks, not state.
 */
import type { NBATeam } from '../../types';
import { DEFAULT_GM_ATTRIBUTES, type GMAttributes } from './gmAttributes';

export interface PlaceholderGM {
  name: string;
  position: string;
  team: string;
  nationality?: string;
  attributes: GMAttributes;
  playerPortraitUrl: string;
  isPlaceholder: true;
  face?: any;
}

export interface PlaceholderCoach {
  name: string;
  position: string;
  team: string;
  nationality?: string;
  yearsWithTeam?: number;
  born?: { year: number; loc?: string };
  // Coach attribute shape mirrors the gist data — minimal subset here so
  // CoachingView can render. Consumers needing specific fields should add
  // them with sensible defaults rather than reading raw from the gist.
  systemBias?: string;
  reputation?: number;
  isPlaceholder: true;
}

const EUROPEAN_COACH_POOL: Array<{ name: string; nat: string }> = [
  { name: 'Xavi Pascual',           nat: 'Spain' },
  { name: 'Sito Alonso',            nat: 'Spain' },
  { name: 'Diego Ocampo',           nat: 'Spain' },
  { name: 'Pedro Martínez',         nat: 'Spain' },
  { name: 'Iván Cardenas',          nat: 'Spain' },
  { name: 'Jaume Ponsarnau',        nat: 'Spain' },
  { name: 'Ergin Ataman',           nat: 'Turkey' },
  { name: 'Andrea Trinchieri',      nat: 'Italy' },
  { name: 'Sergio Scariolo',        nat: 'Italy' },
  { name: 'Ettore Messina',         nat: 'Italy' },
  { name: 'Dejan Radonjić',         nat: 'Montenegro' },
  { name: 'Saša Obradović',         nat: 'Serbia' },
  { name: 'Vincent Collet',         nat: 'France' },
  { name: 'Athanasios Skourtopoulos', nat: 'Greece' },
];

const EUROPEAN_GM_POOL: Array<{ name: string; nat: string }> = [
  { name: 'Juan Carlos Sánchez',    nat: 'Spain' },
  { name: 'Alberto Miralles',       nat: 'Spain' },
  { name: 'Rafa Jofresa',           nat: 'Spain' },
  { name: 'Pablo Laso',             nat: 'Spain' },
  { name: 'Mirsad Türkcan',         nat: 'Turkey' },
  { name: 'Davide Bonora',          nat: 'Italy' },
  { name: 'Dimitrios Diamantidis',  nat: 'Greece' },
  { name: 'Vassilis Spanoulis',     nat: 'Greece' },
  { name: 'Nikola Dragović',        nat: 'Serbia' },
  { name: 'Marko Tušek',            nat: 'Slovenia' },
  { name: 'Loïc Schwartz',          nat: 'France' },
  { name: 'Tomislav Ercegović',     nat: 'Croatia' },
];

const EUROPEAN_OWNER_POOL: Array<{ name: string; nat: string }> = [
  { name: 'Familia Reyes',          nat: 'Spain' },
  { name: 'Grupo Hidalgo',          nat: 'Spain' },
  { name: 'Salazar Holdings',       nat: 'Spain' },
  { name: 'Galante Investments',    nat: 'Italy' },
  { name: 'Diamantidis Group',      nat: 'Greece' },
  { name: 'Karageorgis Holdings',   nat: 'Greece' },
  { name: 'Petrović Family',        nat: 'Serbia' },
  { name: 'Lefèvre & Fils',         nat: 'France' },
  { name: 'Yıldız Group',           nat: 'Turkey' },
];

/** Deterministic numeric "hash" of a string — used to vary attributes per team
 *  without committing actual records to state. Same input → same output. */
function seedFromTeam(team: NBATeam): number {
  const key = `${team.id}-${team.name}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fmtTeamLabel(team: NBATeam): string {
  return team.region && !team.name.includes(team.region)
    ? `${team.region} ${team.name}`
    : team.name;
}

function isEuroLikeTeam(team: NBATeam): boolean {
  const tid = (team as any).id ?? (team as any).tid ?? 0;
  return tid >= 1000;
}

export function makePlaceholderGM(team: NBATeam): PlaceholderGM {
  const seed = seedFromTeam(team);
  const jitter = (base: number, offset: number) =>
    Math.max(40, Math.min(95, base + ((offset % 21) - 10)));
  const useEuro = isEuroLikeTeam(team);
  const pick = useEuro ? EUROPEAN_GM_POOL[seed % EUROPEAN_GM_POOL.length] : null;
  const name = pick?.name ?? `${fmtTeamLabel(team)} GM`;
  return {
    name,
    position: 'General Manager',
    team: fmtTeamLabel(team),
    nationality: pick?.nat,
    attributes: {
      trade_aggression: jitter(DEFAULT_GM_ATTRIBUTES.trade_aggression, seed),
      scouting_focus:   jitter(DEFAULT_GM_ATTRIBUTES.scouting_focus,   seed >> 3),
      work_ethic:       jitter(DEFAULT_GM_ATTRIBUTES.work_ethic,       seed >> 6),
      spending:         jitter(DEFAULT_GM_ATTRIBUTES.spending,         seed >> 9),
    },
    playerPortraitUrl: team.logoUrl
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=552583&color=fff&size=256&bold=true`,
    isPlaceholder: true,
  };
}

export function makePlaceholderCoach(team: NBATeam): PlaceholderCoach {
  const seed = seedFromTeam(team);
  const useEuro = isEuroLikeTeam(team);
  const pick = useEuro ? EUROPEAN_COACH_POOL[(seed >> 2) % EUROPEAN_COACH_POOL.length] : null;
  const name = pick?.name ?? `${fmtTeamLabel(team)} Head Coach`;
  const yearsWithTeam = 1 + (seed % 5);
  const bornYear = 1965 + ((seed >> 4) % 25);
  return {
    name,
    position: 'Head Coach',
    team: fmtTeamLabel(team),
    nationality: pick?.nat,
    yearsWithTeam,
    born: { year: bornYear, loc: pick?.nat },
    reputation: 55 + (seed % 25),
    isPlaceholder: true,
  };
}

/** Synthesize coach / GM / owner placeholders for every non-NBA club in the
 *  current save so CoachingView / TeamIntel don't show "Unknown Coach" for
 *  Euroleague, Endesa, PBA, etc. Called once at init from GameContext after
 *  the curated NBA staff gist resolves. Lightweight + deterministic per team. */
export function generatePlaceholderNonNBAStaff(state: { nonNBATeams?: any[] }): {
  coaches: PlaceholderCoach[];
  gms: PlaceholderGM[];
  owners: Array<{ name: string; team: string; isPlaceholder: true }>;
} {
  const coaches: PlaceholderCoach[] = [];
  const gms: PlaceholderGM[] = [];
  const owners: Array<{ name: string; team: string; isPlaceholder: true }> = [];
  for (const t of state.nonNBATeams ?? []) {
    const teamLike = {
      id: t.tid,
      name: t.name,
      region: t.region,
      logoUrl: t.imgURL,
    } as NBATeam;
    coaches.push(makePlaceholderCoach(teamLike));
    gms.push(makePlaceholderGM(teamLike));
    const seed = seedFromTeam(teamLike);
    const ownerPick = EUROPEAN_OWNER_POOL[(seed >> 5) % EUROPEAN_OWNER_POOL.length];
    owners.push({
      name: ownerPick.name,
      team: fmtTeamLabel(teamLike),
      isPlaceholder: true,
    });
  }
  return { coaches, gms, owners };
}
