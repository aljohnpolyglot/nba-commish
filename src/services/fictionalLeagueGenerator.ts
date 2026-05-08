// Builds a fictional NBA-shaped league from scratch — 30 teams + ~450 players
// generated via the same draft pipeline (genDraftPlayers) we use for yearly
// prospect classes. Phase 2a: balanced talent via snake-draft distribution +
// age spread + tiered placeholder contracts. Phase 2b can refine ratings/age
// curves to feel more like real veterans.

import type { NBATeam, NBAPlayer } from '../types';
import { FICTIONAL_TEAMS, fictionalLogoUrl } from '../data/fictionalTeams';
import { generateDraftClassForGame } from './genDraftPlayers';
import { getNameData } from '../data/nameDataFetcher';

interface FictionalLeagueResult {
  teams: NBATeam[];
  players: NBAPlayer[];
}

const ROSTER_SIZE = 15;
const NUM_TEAMS = 30;

// Contract tiers in BBGM thousands ($1k = 1 unit). Tier index = OVR rank bucket.
// Sums to ~$108M per team (1 star + 2 starters + 4 rotation + 4 bench + 4 mins).
const CONTRACT_TIERS_K = [
  30_000, // 0-29:    stars       — ~1 per team
  15_000, // 30-89:   starters    — ~2 per team
  7_000,  // 90-209:  rotation    — ~4 per team
  3_000,  // 210-329: bench       — ~4 per team
  2_000,  // 330-449: min deals   — ~4 per team
];

function contractForRank(rank: number): { amount: number; exp: number } {
  let tier = 4;
  if (rank < 30)       tier = 0;
  else if (rank < 90)  tier = 1;
  else if (rank < 210) tier = 2;
  else if (rank < 330) tier = 3;
  return { amount: CONTRACT_TIERS_K[tier], exp: 0 }; // exp set per startYear by caller
}

export function generateFictionalLeague(startYear: number): FictionalLeagueResult {
  const teams: NBATeam[] = FICTIONAL_TEAMS.map(def => ({
    id: def.tid,
    name: `${def.region} ${def.name}`,
    abbrev: def.abbrev,
    region: def.region,
    conference: def.conference,
    cid: def.cid,
    did: def.did,
    wins: 0,
    losses: 0,
    strength: 0,
    pop: def.pop,
    logoUrl: fictionalLogoUrl(def.abbrev),
    colors: def.colors,
    streak: { type: 'W', count: 0 },
    seasons: [{ season: startYear, won: 0, lost: 0, playoffRoundsWon: -1 }],
    retiredJerseyNumbers: [],
  }));

  // Generate 15 stratified draft classes — each contributes ~1 generational/franchise,
  // 4-6 lottery, 8-10 late-1st, 15-18 fringe per call. Aggregating gives a realistic
  // league talent curve (≈30 stars, ≈90 starters, etc).
  const nameData = getNameData();
  const allPlayers: NBAPlayer[] = [];
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cls = generateDraftClassForGame(startYear, NUM_TEAMS, Math.random, nameData, startYear);
    allPlayers.push(...cls);
  }

  // Sort OVR desc so snake-draft spreads talent evenly across teams
  allPlayers.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

  const players: NBAPlayer[] = allPlayers.map((p, rank) => {
    // Snake-draft: round 0 = teams 0..29, round 1 = teams 29..0, round 2 = teams 0..29
    const round = Math.floor(rank / NUM_TEAMS);
    const indexInRound = rank % NUM_TEAMS;
    const tid = round % 2 === 0 ? indexInRound : (NUM_TEAMS - 1 - indexInRound);

    // Spread ages 19–34 by tier so stars skew older (vets), bench skews younger
    // Without this, every player is age 19 (draft-prospect default)
    const tierAgeBase = rank < 30 ? 26 : rank < 90 ? 25 : rank < 210 ? 24 : rank < 330 ? 22 : 20;
    const targetAge = Math.max(19, Math.min(36, tierAgeBase + Math.floor(Math.random() * 9) - 4));

    const { amount, exp } = contractForRank(rank);
    const yearsLeft = 1 + Math.floor(Math.random() * 4); // 1–4 year deals

    return {
      ...p,
      tid,
      status: 'Active' as const,
      age: targetAge,
      born: p.born ? { ...p.born, year: startYear - targetAge } : { year: startYear - targetAge, loc: 'USA' },
      contract: { amount, exp: startYear + yearsLeft - 1 },
      stats: [],
    };
  });

  return { teams, players };
}
