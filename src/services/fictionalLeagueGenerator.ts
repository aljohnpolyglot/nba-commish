// Builds a fictional NBA-shaped league from scratch — 30 teams + 450 players
// generated via the same draft pipeline (genDraftPlayers) we use for yearly
// prospect classes.
//
// Why this is more than just "call the draft generator":
// genDraftPlayers stratifies for a SINGLE draft class (1 generational max,
// ~2 franchise, ~5 lottery, etc). Aggregating 15 classes for league population
// gives ~5 generationals — not realistic for one league. The fix here regrades
// every player's OVR after generation so the final distribution matches a real
// NBA roster (1 superstar, ~12 all-stars, ~60 starters, etc).

import type { NBATeam, NBAPlayer } from '../types';
import { FICTIONAL_TEAMS, fictionalLogoUrl } from '../data/fictionalTeams';
import { generateDraftClassForGame } from './genDraftPlayers';
import { getNameData } from '../data/nameDataFetcher';
import { INITIAL_LEAGUE_STATS } from '../constants';

interface FictionalLeagueResult {
  teams: NBATeam[];
  players: NBAPlayer[];
}

const ROSTER_SIZE = 15;
const NUM_TEAMS = 30;
const TOTAL_PLAYERS = ROSTER_SIZE * NUM_TEAMS; // 450
const NUM_DRAFT_CLASSES = 15;

function createSeededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Talent curve — target K2 OVR by league rank ────────────────────────────
// Modeled on the actual NBA distribution (~1 superstar, ~12 all-stars,
// ~60 quality starters, ~150 rotation, ~150 bench, ~75 fringe).
function targetK2ForRank(rank: number, rng: () => number): number {
  const r = rng();
  if (rank === 0)     return 95 + r * 2;             // 95-97 (LeBron-tier)
  if (rank < 4)       return 91 + r * 3;             // 91-94 (top 4)
  if (rank < 13)      return 87 + r * 3;             // 87-90 (rest of top 13 = 13 stars total)
  if (rank < 40)      return 82 + r * 4;             // 82-86 (all-stars + top starters)
  if (rank < 100)     return 77 + r * 4;             // 77-81 (solid starters)
  if (rank < 200)     return 71 + r * 5;             // 71-76 (rotation)
  if (rank < 320)     return 66 + r * 4;             // 66-70 (bench)
  return 58 + r * 7;                                 // 58-65 (fringe / 2-way)
}

// K2 = 0.88 * BBGM + 31  →  BBGM = (K2 - 31) / 0.88
const k2ToBbgm = (k2: number): number => Math.round((k2 - 31) / 0.88);

// ─── Age curve — older for top tier, younger for fringe ─────────────────────
function targetAgeForRank(rank: number, rng: () => number): number {
  const r = rng();
  let mid: number;
  if (rank < 13)     mid = 27;  // stars: prime years
  else if (rank < 40)  mid = 26;  // starters
  else if (rank < 100) mid = 25;
  else if (rank < 200) mid = 24;
  else if (rank < 320) mid = 22;  // bench: younger
  else                 mid = 21;  // fringe: rookies / 2-way
  return Math.max(19, Math.min(38, Math.round(mid + (r - 0.5) * 8)));
}

// ─── Contracts: cap-pct based with variance (respects EconomyTab settings) ──
//
// Uses the live INITIAL_LEAGUE_STATS values for salaryCap +
// minContractStaticAmount + maxContractStaticPercentage so commissioner-edited
// economy rules flow through to generated contracts. Adds ±15-20% per-player
// variance so two K2 92 stars don't end up on identical deals.
const SALARY_CAP_USD = INITIAL_LEAGUE_STATS.salaryCap;
const MIN_CONTRACT_USD = (INITIAL_LEAGUE_STATS.minContractStaticAmount ?? 1.273) * 1_000_000;
const MAX_CAP_PCT = (INITIAL_LEAGUE_STATS.maxContractStaticPercentage ?? 30) / 100;

// Cap-percentage targets per K2 OVR tier. Variance applied per player.
function targetCapPctForK2(k2: number): number {
  if (k2 >= 92) return MAX_CAP_PCT;                   // supermax-eligible
  if (k2 >= 88) return MAX_CAP_PCT * 0.83;            // ~25% (max 5+yr, no supermax)
  if (k2 >= 84) return 0.18;                          // mid-tier all-stars
  if (k2 >= 80) return 0.12;                          // top starters
  if (k2 >= 76) return 0.075;                         // solid starters
  if (k2 >= 72) return 0.045;                         // rotation
  if (k2 >= 68) return 0.025;                         // bench
  return 0;                                            // fringe → min
}

function contractForK2(k2: number, age: number, startYear: number, rng: () => number) {
  const basePct = targetCapPctForK2(k2);
  // ±20% variance so identical-K2 players don't end up on identical deals
  const variance = 1 + (rng() - 0.5) * 0.4;
  let amountUSD = SALARY_CAP_USD * basePct * variance;
  // Floor at min contract (covers fringe / 0% tier)
  amountUSD = Math.max(MIN_CONTRACT_USD, amountUSD);

  // Years: stars get long deals, vets get short, fringe gets 1yr.
  // Older stars often re-sign short to keep flexibility — slight age penalty.
  let years: number;
  if (k2 >= 88 && age < 32)      years = 3 + Math.floor(rng() * 3);  // 3-5
  else if (k2 >= 82 && age < 33) years = 2 + Math.floor(rng() * 3);  // 2-4
  else if (k2 >= 75)             years = 1 + Math.floor(rng() * 3);  // 1-3
  else if (k2 >= 68)             years = 1 + Math.floor(rng() * 2);  // 1-2
  else                           years = 1;                                    // min deals
  // Cap years at remaining viable career window
  years = Math.min(years, Math.max(1, 38 - age));

  return {
    amount: Math.round(amountUSD / 1000), // BBGM thousands
    exp: startYear + years - 1,
    years,
    amountUSD,
  };
}

// Draft age weighted: stars often go 19-20, late picks go 21-22 (older college kids).
function estimateDraftAge(k2: number, rng: () => number): number {
  if (k2 >= 85) return 19 + Math.floor(rng() * 2);     // 19-20 (one-and-done lottery)
  if (k2 >= 75) return 19 + Math.floor(rng() * 3);     // 19-21
  return 20 + Math.floor(rng() * 3);                   // 20-22 (late bloomers)
}

// Assign unique draft slots per year. Best K2 in a year gets pick #1, next #2, etc.
// Once R1 (1-30) is full, overflow to R2 (1-30). Beyond 60 → undrafted (round 0).
// This guarantees no two players ever share (year, round, pick).
function assignDraftSlots<T extends { _draftYear: number; _k2: number; _draftTid: number }>(
  players: T[],
): Array<T & { round: number; pick: number; draftTidFinal: number }> {
  // Group by draft year
  const byYear = new Map<number, T[]>();
  for (const p of players) {
    if (!byYear.has(p._draftYear)) byYear.set(p._draftYear, []);
    byYear.get(p._draftYear)!.push(p);
  }
  // Within each year, sort by K2 desc so the best players in the year get the lowest picks
  const result = new Map<T, { round: number; pick: number; draftTidFinal: number }>();
  for (const [, yearPlayers] of byYear) {
    yearPlayers.sort((a, b) => b._k2 - a._k2);
    yearPlayers.forEach((p, slot) => {
      let round: number, pick: number;
      if (slot < 30)        { round = 1; pick = slot + 1; }       // R1 pick 1-30
      else if (slot < 60)   { round = 2; pick = slot - 29; }      // R2 pick 1-30
      else                  { round = 0; pick = 0; }              // undrafted
      result.set(p, {
        round,
        pick,
        draftTidFinal: round === 0 ? -1 : p._draftTid,
      });
    });
  }
  return players.map(p => ({ ...p, ...result.get(p)! }));
}

// Fake one minimal stats row per pro season so yearsOfService = stats.filter(...).length
// works correctly for Bird-Rights / supermax / max-contract eligibility checks.
function fakeCareerStats(draftYear: number, careerYears: number, currentTid: number, rng: () => number): any[] {
  return Array.from({ length: careerYears }, (_, i) => ({
    season: draftYear + i,
    tid: currentTid,         // simplification — no mid-career trade history modeled
    playoffs: false,
    gp: 55 + Math.floor(rng() * 25),  // 55-79 GP
    gs: Math.floor(rng() * 60),
    min: 1200 + Math.floor(rng() * 1200),
  }));
}

function buildContractYears(amountUSD: number, startYear: number, years: number, rng: () => number) {
  return Array.from({ length: years }, (_, i) => {
    const yr = startYear + i;
    // 4% annual escalator + tiny per-year noise
    const noise = 1 + (rng() - 0.5) * 0.04;
    const escalated = Math.round(amountUSD * Math.pow(1.04, i) * noise);
    return {
      season: `${yr - 1}-${String(yr).slice(-2)}`,
      guaranteed: escalated,
      option: '',
    };
  });
}

export function generateFictionalLeague(startYear: number, seed?: number): FictionalLeagueResult {
  const rng = seed == null ? Math.random : createSeededRandom(seed);
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

  // Generate 15 stratified draft classes — variance per call (extraRoll) gives
  // us ~480 raw prospects to choose from. We'll trim to exactly 450 after sort.
  const nameData = getNameData();
  const raw: NBAPlayer[] = [];
  for (let i = 0; i < NUM_DRAFT_CLASSES; i++) {
    const cls = generateDraftClassForGame(startYear, NUM_TEAMS, rng, nameData, startYear);
    raw.push(...cls);
  }

  // Sort by raw OVR desc, trim to exactly 450 (drops the worst ~30)
  raw.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  const trimmed = raw.slice(0, TOTAL_PLAYERS);

  // ─── Phase 1: Active players — compute all metadata except draft slot ────
  // Snake-draft assigns tids so talent spreads evenly: Round 0 ranks 0..29 →
  // tid 0..29, Round 1 ranks 30..59 → tid 29..0, etc.
  const activeMeta = trimmed.map((p, rank) => {
    const round0 = Math.floor(rank / NUM_TEAMS);
    const indexInRound = rank % NUM_TEAMS;
    const tid = round0 % 2 === 0 ? indexInRound : (NUM_TEAMS - 1 - indexInRound);

    const targetK2 = targetK2ForRank(rank, rng);
    const targetBbgm = k2ToBbgm(targetK2);
    const age = targetAgeForRank(rank, rng);
    const potBoost = age < 23 ? (4 + Math.floor(rng() * 7))
                  : age < 28 ? (1 + Math.floor(rng() * 4))
                  : Math.floor(rng() * 2);
    const targetPotBbgm = Math.min(82, targetBbgm + potBoost);
    const ratings = (p.ratings ?? []).map((r, i) =>
      i === (p.ratings?.length ?? 1) - 1
        ? { ...r, ovr: targetBbgm, pot: targetPotBbgm }
        : r
    );
    const contract = contractForK2(targetK2, age, startYear, rng);
    const contractYears = buildContractYears(contract.amountUSD, startYear, contract.years, rng);
    const draftAge = Math.min(age, estimateDraftAge(targetK2, rng));
    const draftYear = startYear - (age - draftAge);
    const careerYears = Math.max(0, age - draftAge);

    return {
      base: p, tid, age, targetK2, targetBbgm, targetPotBbgm, ratings,
      contract, contractYears, draftYear, careerYears,
    };
  });

  // ─── Phase 2: Free Agents — same metadata pass, no team / no contract ────
  const faRaw: NBAPlayer[] = [];
  for (let i = 0; i < 4; i++) {
    const cls = generateDraftClassForGame(startYear, 20, rng, nameData, startYear);
    faRaw.push(...cls);
  }
  const faMeta = faRaw.slice(0, 80).map(p => {
    // FAs span K2 56-72 (vet mins, G-League call-ups, declining vets)
    const targetK2 = 56 + rng() * 16;
    const targetBbgm = k2ToBbgm(targetK2);
    const age = 22 + Math.floor(rng() * 13);
    const targetPotBbgm = Math.min(82, targetBbgm + Math.floor(rng() * 5));
    const ratings = (p.ratings ?? []).map((r, i) =>
      i === (p.ratings?.length ?? 1) - 1
        ? { ...r, ovr: targetBbgm, pot: targetPotBbgm }
        : r
    );
    const draftAge = Math.min(age, estimateDraftAge(targetK2, rng));
    const draftYear = startYear - (age - draftAge);
    const careerYears = Math.max(0, age - draftAge);
    // FAs were originally drafted by SOME team — pick a random NBA team
    const draftTidPick = Math.floor(rng() * NUM_TEAMS);

    return {
      base: p, age, targetK2, targetBbgm, targetPotBbgm, ratings,
      draftYear, careerYears, draftTidPick,
    };
  });

  // ─── Phase 3: Assign unique draft slots across active + FA pools ─────────
  // Both pools must share the slot pool because year X may have players
  // currently active AND currently FA. Each (year, round, pick) is unique.
  type Seed = { _draftYear: number; _k2: number; _draftTid: number; _ref: any };
  const seeds: Seed[] = [
    ...activeMeta.map(m => ({ _draftYear: m.draftYear, _k2: m.targetK2, _draftTid: m.tid, _ref: m })),
    ...faMeta.map(m => ({ _draftYear: m.draftYear, _k2: m.targetK2, _draftTid: m.draftTidPick, _ref: m })),
  ];
  const slotted = assignDraftSlots(seeds);
  const slotMap = new Map<any, { round: number; pick: number; draftTidFinal: number }>();
  for (const s of slotted) {
    slotMap.set(s._ref, { round: s.round, pick: s.pick, draftTidFinal: s.draftTidFinal });
  }

  // ─── Phase 4: Build final NBAPlayer objects ──────────────────────────────
  const activePlayers: NBAPlayer[] = activeMeta.map(m => {
    const slot = slotMap.get(m)!;
    return {
      ...m.base,
      tid: m.tid,
      status: 'Active' as const,
      age: m.age,
      born: m.base.born ? { ...m.base.born, year: startYear - m.age } : { year: startYear - m.age, loc: 'USA' },
      overallRating: m.targetBbgm,
      potential: m.targetPotBbgm,
      ratings: m.ratings,
      contract: { amount: m.contract.amount, exp: m.contract.exp },
      contractYears: m.contractYears,
      draft: {
        year: m.draftYear,
        round: slot.round,
        pick: slot.pick,
        tid: slot.draftTidFinal,
        originalTid: slot.draftTidFinal,
      },
      stats: fakeCareerStats(m.draftYear, m.careerYears, m.tid, rng),
    };
  });

  const freeAgents: NBAPlayer[] = faMeta.map(m => {
    const slot = slotMap.get(m)!;
    return {
      ...m.base,
      tid: -1,
      status: 'Free Agent' as const,
      age: m.age,
      born: m.base.born ? { ...m.base.born, year: startYear - m.age } : { year: startYear - m.age, loc: 'USA' },
      overallRating: m.targetBbgm,
      potential: m.targetPotBbgm,
      ratings: m.ratings,
      contract: undefined as any,
      contractYears: undefined as any,
      draft: {
        year: m.draftYear,
        round: slot.round,
        pick: slot.pick,
        tid: slot.draftTidFinal,
        originalTid: slot.draftTidFinal,
      },
      stats: fakeCareerStats(m.draftYear, m.careerYears, m.draftTidPick, rng),
    };
  });

  // ─── Rookie Class (60 prospects, tid=-2, draft year = next year) ──────────
  // sandboxToNBAPlayer already sets tid=-2 + status='Draft Prospect', so we
  // mostly pass through. Stratified one-class call gives a realistic mix of
  // generational/franchise/lottery/late-1st/2nd-round prospects.
  const rookies: NBAPlayer[] = generateDraftClassForGame(
    startYear + 1, 60, rng, nameData, startYear,
  ).map(p => ({ ...p, stats: [] }));

  return {
    teams,
    players: [...activePlayers, ...freeAgents, ...rookies],
  };
}
