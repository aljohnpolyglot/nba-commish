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
import { buildCoachNationalityPool, type NationalityPoolEntry } from '../euro/nationalityPool';
import { getNameData } from '../../data/nameDataFetcher';
import { deterministicStaffImageId } from '../../utils/staffPortrait';

export interface PlaceholderGM {
  name: string;
  position: string;
  team: string;
  nationality?: string;
  attributes: GMAttributes;
  playerPortraitUrl: string;
  staffImageId: number;
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
  contractExp?: number;
  startSeason?: string;
  staffImageId: number;
  // Coach attribute shape mirrors the gist data — minimal subset here so
  // CoachingView can render. Consumers needing specific fields should add
  // them with sensible defaults rather than reading raw from the gist.
  systemBias?: string;
  reputation?: number;
  isPlaceholder: true;
}

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

function pickWeighted(pool: NationalityPoolEntry[], seed: number): string {
  if (pool.length === 0) return 'Spain';
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = (seed % 10_000) / 10_000 * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.country;
  }
  return pool[0].country;
}

function leagueIdForTeam(team: NBATeam): string {
  const league = String((team as any).league ?? team.conference ?? '').toLowerCase();
  if (league.includes('endesa')) return 'endesa';
  if (league.includes('euroleague')) return 'euroleague';
  const tid = (team as any).id ?? 0;
  if (tid >= 5000 && tid < 5100) return 'endesa';
  if (tid >= 1000 && tid < 1100) return 'euroleague';
  return league || 'endesa';
}

function fallbackNationality(team: NBATeam, seed: number): string {
  const leagueId = leagueIdForTeam(team);
  if (leagueId === 'endesa') return seed % 5 === 0 ? 'Argentina' : 'Spain';
  return ['Serbia', 'Lithuania', 'Greece', 'Italy', 'Spain', 'France', 'Turkey', 'Croatia'][seed % 8];
}

function resolveNationality(
  team: NBATeam,
  seed: number,
  opts: { country?: string; nationality?: string; nationalityPool?: NationalityPoolEntry[] } = {},
): string {
  return opts.nationality
    ?? opts.country
    ?? (opts.nationalityPool ? pickWeighted(opts.nationalityPool, seed) : fallbackNationality(team, seed));
}

/** Picks a first+last name from the bundled nameData for the given nationality and seed. */
function pickNameFromSeed(nationality: string, seed: number): string {
  const nameData = getNameData() as any;
  const country = nameData.countries?.[nationality] ?? nameData.countries?.['Spain'];
  const firsts = Object.keys(country?.first ?? {});
  const lasts = Object.keys(country?.last ?? {});
  if (!firsts.length || !lasts.length) return 'Staff Member';
  const first = firsts[Math.abs(seed) % firsts.length];
  const last = lasts[Math.abs(seed >> 3) % lasts.length];
  return `${first} ${last}`;
}

export function makePlaceholderGM(
  team: NBATeam,
  opts: { country?: string; nationality?: string; nationalityPool?: NationalityPoolEntry[] } = {},
): PlaceholderGM {
  const seed = seedFromTeam(team);
  // Spread attributes +/-10 around defaults so each placeholder feels distinct.
  const jitter = (base: number, offset: number) =>
    Math.max(40, Math.min(95, base + ((offset % 21) - 10)));
  const nationality = resolveNationality(team, seed, opts);
  const name = pickNameFromSeed(nationality, seed ^ 0xf00d);
  return {
    name,
    position: `${fmtTeamLabel(team)} General Manager`,
    team: fmtTeamLabel(team),
    nationality,
    attributes: {
      trade_aggression: jitter(DEFAULT_GM_ATTRIBUTES.trade_aggression, seed),
      scouting_focus:   jitter(DEFAULT_GM_ATTRIBUTES.scouting_focus,   seed >> 3),
      work_ethic:       jitter(DEFAULT_GM_ATTRIBUTES.work_ethic,       seed >> 6),
      spending:         jitter(DEFAULT_GM_ATTRIBUTES.spending,         seed >> 9),
    },
    playerPortraitUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=FDB927&size=256&bold=true`,
    staffImageId: deterministicStaffImageId(name),
    isPlaceholder: true,
  };
}

export function makePlaceholderCoach(
  team: NBATeam,
  opts: { country?: string; nationality?: string; nationalityPool?: NationalityPoolEntry[]; currentYear?: number } = {},
): PlaceholderCoach {
  const seed = seedFromTeam(team);
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const yearsWithTeam = 1 + (seed % 6);
  const bornYear = 1963 + ((seed >> 4) % 28);
  const nationality = resolveNationality(team, seed, opts);
  const startYear = currentYear - yearsWithTeam;
  const name = pickNameFromSeed(nationality, seed);
  return {
    name,
    position: 'Head Coach',
    team: fmtTeamLabel(team),
    nationality,
    yearsWithTeam,
    born: { year: bornYear, loc: nationality },
    contractExp: currentYear + Math.max(1, 4 - Math.min(3, yearsWithTeam)),
    startSeason: `${startYear}-${String(startYear + 1).slice(2)}`,
    reputation: 60,
    staffImageId: deterministicStaffImageId(name),
    isPlaceholder: true,
  };
}

/** Synthesize coach / GM / owner placeholders for every non-NBA club in the
 *  current save so CoachingView / TeamIntel don't show "Unknown Coach" for
 *  Euroleague, Endesa, PBA, etc. Called once at init from GameContext after
 *  the curated NBA staff gist resolves. Lightweight + deterministic per team. */
export function generatePlaceholderNonNBAStaff(state: { nonNBATeams?: any[]; players?: any[]; leagueStats?: { year?: number } }): {
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
      conference: t.league,
      league: t.league,
    } as unknown as NBATeam;
    const leagueId = leagueIdForTeam(teamLike);
    const pool = buildCoachNationalityPool({ players: state.players ?? [] } as any, leagueId);
    coaches.push(makePlaceholderCoach(teamLike, { nationalityPool: pool, currentYear: state.leagueStats?.year }));
    gms.push(makePlaceholderGM(teamLike, { nationalityPool: pool }));
    owners.push({
      name: `${fmtTeamLabel(teamLike)} Ownership Group`,
      team: fmtTeamLabel(teamLike),
      isPlaceholder: true,
    });
  }
  return { coaches, gms, owners };
}
