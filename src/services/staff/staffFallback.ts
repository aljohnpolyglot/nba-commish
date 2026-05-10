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
  attributes: GMAttributes;
  playerPortraitUrl: string;
  isPlaceholder: true;
}

export interface PlaceholderCoach {
  name: string;
  position: string;
  team: string;
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

export function makePlaceholderGM(team: NBATeam): PlaceholderGM {
  const seed = seedFromTeam(team);
  // Spread attributes ±10 around defaults so each placeholder feels distinct.
  const jitter = (base: number, offset: number) =>
    Math.max(40, Math.min(95, base + ((offset % 21) - 10)));
  return {
    name: `${fmtTeamLabel(team)} GM`,
    position: `${fmtTeamLabel(team)} General Manager`,
    team: fmtTeamLabel(team),
    attributes: {
      trade_aggression: jitter(DEFAULT_GM_ATTRIBUTES.trade_aggression, seed),
      scouting_focus:   jitter(DEFAULT_GM_ATTRIBUTES.scouting_focus,   seed >> 3),
      work_ethic:       jitter(DEFAULT_GM_ATTRIBUTES.work_ethic,       seed >> 6),
      spending:         jitter(DEFAULT_GM_ATTRIBUTES.spending,         seed >> 9),
    },
    playerPortraitUrl: team.logoUrl
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(fmtTeamLabel(team))}&background=552583&color=fff&size=256&bold=true`,
    isPlaceholder: true,
  };
}

export function makePlaceholderCoach(team: NBATeam): PlaceholderCoach {
  return {
    name: `${fmtTeamLabel(team)} Head Coach`,
    position: 'Head Coach',
    team: fmtTeamLabel(team),
    reputation: 60,
    isPlaceholder: true,
  };
}
