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
import { generateFictionalHistory } from './fictionalHistoryGenerator';
import { buildRatingsHistory } from './playerDevelopment/reverseProgression';

interface FictionalLeagueResult {
  teams: NBATeam[];
  players: NBAPlayer[];
  historicalAwards: Array<{ season: number; type: string; name?: string; pid?: string; tid?: number }>;
}

// ─── Settings pulled from INITIAL_LEAGUE_STATS (configurable via EconomyTab) ──
// ROSTER_SIZE, cap thresholds, contract bounds — all read from the same source
// the commissioner edits. Generator stays in sync with whatever rules the user
// dialed in before starting the league.
const ROSTER_SIZE = INITIAL_LEAGUE_STATS.maxStandardPlayersPerTeam ?? 15;
const NUM_TEAMS = 30;
const TOTAL_PLAYERS = ROSTER_SIZE * NUM_TEAMS;
const NUM_DRAFT_CLASSES = 15;

// Cap thresholds (USD) — derived from configurable percentages.
const SALARY_CAP_USD     = INITIAL_LEAGUE_STATS.salaryCap;
const TAX_THRESHOLD_USD  = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.luxuryTaxThresholdPercentage ?? 121.5) / 100;
const FIRST_APRON_USD    = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.firstApronPercentage ?? 126.7) / 100;
const SECOND_APRON_USD   = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.secondApronPercentage ?? 134.4) / 100;
const MIN_PAYROLL_USD    = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.minimumPayrollPercentage ?? 90) / 100;
const MIN_PAYROLL_ENABLED = INITIAL_LEAGUE_STATS.minimumPayrollEnabled ?? true;
const APRONS_ENABLED      = INITIAL_LEAGUE_STATS.apronsEnabled ?? true;
const LUXURY_TAX_ENABLED  = INITIAL_LEAGUE_STATS.luxuryTaxEnabled ?? true;

// Contract bounds.
const MIN_CONTRACT_USD       = (INITIAL_LEAGUE_STATS.minContractStaticAmount ?? 1.273) * 1_000_000;
const MAX_CAP_PCT            = (INITIAL_LEAGUE_STATS.maxContractStaticPercentage ?? 30) / 100;
const SUPERMAX_PCT           = (INITIAL_LEAGUE_STATS.supermaxPercentage ?? 35) / 100;
const MIN_CONTRACT_LENGTH    = INITIAL_LEAGUE_STATS.minContractLength ?? 1;
const MAX_CONTRACT_LENGTH_STD = INITIAL_LEAGUE_STATS.maxContractLengthStandard ?? 4;
const MAX_CONTRACT_LENGTH_BIRD = INITIAL_LEAGUE_STATS.maxContractLengthBird ?? 5;

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

// Cap-percentage targets per K2 OVR tier. All anchored to MAX_CAP_PCT so they
// scale automatically when the commissioner changes max contract percentage.
// Adds ±15-20% per-player variance so two K2 92 stars don't end up identical.
function targetCapPctForK2(k2: number): number {
  if (k2 >= 92) return SUPERMAX_PCT;                  // supermax-eligible (35% default)
  if (k2 >= 88) return MAX_CAP_PCT;                   // max contract (30%)
  if (k2 >= 84) return MAX_CAP_PCT * 0.60;            // mid-tier all-stars (~18%)
  if (k2 >= 80) return MAX_CAP_PCT * 0.40;            // top starters (~12%)
  if (k2 >= 76) return MAX_CAP_PCT * 0.25;            // solid starters (~7.5%)
  if (k2 >= 72) return MAX_CAP_PCT * 0.15;            // rotation (~4.5%)
  if (k2 >= 68) return MAX_CAP_PCT * 0.083;           // bench (~2.5%)
  return 0;                                            // fringe → min
}

function contractForK2(k2: number, age: number, startYear: number, rng: () => number) {
  const basePct = targetCapPctForK2(k2);
  // ±20% variance so identical-K2 players don't end up on identical deals
  const variance = 1 + (rng() - 0.5) * 0.4;
  let amountUSD = SALARY_CAP_USD * basePct * variance;
  // Floor at min contract (covers fringe / 0% tier)
  amountUSD = Math.max(MIN_CONTRACT_USD, amountUSD);

  // Years: stars get long deals (Bird-rights extension length), vets get
  // short, fringe gets the configured minimum. Bound by the commissioner's
  // configured min/max contract length settings.
  let years: number;
  if (k2 >= 88 && age < 32)      years = 3 + Math.floor(rng() * (MAX_CONTRACT_LENGTH_BIRD - 2));  // up to bird-max
  else if (k2 >= 82 && age < 33) years = 2 + Math.floor(rng() * (MAX_CONTRACT_LENGTH_STD - 1));   // up to standard-max
  else if (k2 >= 75)             years = 1 + Math.floor(rng() * Math.min(3, MAX_CONTRACT_LENGTH_STD));
  else if (k2 >= 68)             years = 1 + Math.floor(rng() * Math.min(2, MAX_CONTRACT_LENGTH_STD));
  else                           years = MIN_CONTRACT_LENGTH;
  // Clamp to configured bounds + remaining viable career window.
  years = Math.max(MIN_CONTRACT_LENGTH, Math.min(years, MAX_CONTRACT_LENGTH_BIRD, Math.max(1, 38 - age)));

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

// Box-Muller — pure-function gaussian using two seeded uniforms.
function gauss(rng: () => number, std: number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
}

// Assign unique draft slots per year. Sort by *scouted* K2 (current K2 + noise +
// occasional outlier swings), not raw K2 — otherwise current talent perfectly
// predicts original pick: no steals (Jokic #41), no busts (Bennett #1), no
// late-bloomer variance. Noise model:
//   ±~6 K2 std        — normal scouting variance (most picks land in their tier)
//   12% outlier roll  — major scouting miss (±18 K2 std), produces 2nd-round MVPs
//                       and lottery washouts at realistic rates
// Once R1 (1-30) is full, overflow to R2 (1-30). Beyond 60 → undrafted (round 0).
function assignDraftSlots<T extends { _draftYear: number; _k2: number; _draftTid: number }>(
  players: T[],
  rng: () => number,
): Array<T & { round: number; pick: number; draftTidFinal: number }> {
  const byYear = new Map<number, T[]>();
  for (const p of players) {
    if (!byYear.has(p._draftYear)) byYear.set(p._draftYear, []);
    byYear.get(p._draftYear)!.push(p);
  }
  const result = new Map<T, { round: number; pick: number; draftTidFinal: number }>();
  for (const [, yearPlayers] of byYear) {
    const scouted = yearPlayers.map(p => {
      const noise = gauss(rng, 6);
      const outlier = rng() < 0.12 ? gauss(rng, 18) : 0;
      return { p, score: p._k2 + noise + outlier };
    });
    scouted.sort((a, b) => b.score - a.score);
    scouted.forEach(({ p }, slot) => {
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

// Inverse of statstobbgm.html's calculateRatings — given a player's BBGM ratings,
// derive a plausible per-game stat line. Same anchor points (33.7/44.8/73.5) as the
// forward formula. Assumes gpWeight=1 (full-season ratings, no small-sample blending).
const L_3P_AVG = 33.7, L_FG_AVG = 44.8, L_FT_AVG = 73.5;
function ratingsToStats(r: any, hgtIn: number, pos: string, mpg: number) {
  const hgtRating = (hgtIn - 67) * 4.1;
  const valueWeight = Math.min(1, mpg / 22);
  const clamp = (v: number, lo: number, hi: number) =>
    !isFinite(v) ? lo : Math.max(lo, Math.min(hi, v));

  // stl from spd (position-branched in forward formula)
  let stl: number;
  const spd = r.spd ?? 50;
  if (pos.includes('G'))      stl = (spd - 52 - valueWeight * 10) / 10;
  else if (pos.includes('F')) stl = (spd - 38 - valueWeight * 10) / 5;
  else                        stl = (spd - 22 - valueWeight * 5)  / 3;
  stl = clamp(stl, 0.1, 3.5);

  const blk = clamp(((r.diq ?? 50) - 22 - stl * 16) / 22, 0.0, 4.0);
  const apg = clamp((r.pss ?? 50) / 10.5, 0.3, 12);
  const trb = clamp(((r.reb ?? 50) - hgtRating * 0.18) / 5.2, 1, 16);
  const ppg = clamp(((r.oiq ?? 50) - 22 - apg * 2) / 2.4, 1, 36);
  const fgp = clamp((r.ins ?? 50) - 22 - ppg * 1.7 + L_FG_AVG, 30, 65);
  const tpp = clamp(L_3P_AVG + ((r.tp ?? 50) - 50) / 4.2, 15, 48);
  const ftp = clamp(L_FT_AVG + ((r.ft ?? 50) - 50) / 1.4, 40, 95);

  // Derive shot volume from PPG + shooting %s. Modern NBA mix: 30% of FGA from 3,
  // FT-rate ≈ 0.25 of FGA. Solving:
  //   PPG = FGA × (1.40·fgp/100 + 0.90·tpp/100 + 0.25·ftp/100)
  // Position adjustments: bigs take fewer 3s, more FTs at the rim.
  const threeRate = pos.includes('C') ? 0.10 : pos.includes('F') ? 0.28 : 0.42;
  const ftRate    = pos.includes('C') ? 0.32 : pos.includes('F') ? 0.26 : 0.22;
  const ptsPerFga = 2 * (1 - threeRate) * (fgp / 100)
                  + 3 * threeRate * (tpp / 100)
                  + ftRate * (ftp / 100);
  const fga = clamp(ppg / Math.max(0.5, ptsPerFga), 1, 26);
  const tpa = fga * threeRate;
  const fta = fga * ftRate;
  const fgm = fga * fgp / 100;
  const tpm = tpa * tpp / 100;
  const ftm = fta * ftp / 100;
  // Reb split: ~78% defensive, 22% offensive (NBA average).
  const drb = trb * 0.78;
  const orb = trb * 0.22;
  // TOV from usage proxy (high-PPG/APG players turn it over more).
  const tov = clamp(0.5 + 0.10 * ppg + 0.20 * apg, 0.3, 5.5);
  // PF — bigs foul more, rough min-based baseline.
  const pf  = clamp(1.6 + (pos.includes('C') ? 0.6 : pos.includes('F') ? 0.3 : 0), 1, 4.5);

  return {
    ppg, apg, trb, drb, orb, stl, blk, tov, pf,
    fga, fgm, tpa, tpm, fta, ftm,
    fgp, tpp, ftp,
  };
}

// Synthesizes per-season stat lines from per-year ratings snapshots (built via
// reverse progression). Each season's box-score-derived stats reference that
// season's ratings — so a player's rookie 3pt% comes from rookie-year `tp`,
// not their (presumably higher) current `tp`.
//
// `ratingsHistory` length must match `careerYears` (oldest first; reverseProgression
// already returns them in chronological order).
function fakeCareerStats(
  draftYear: number,
  careerYears: number,
  tidArc: number[],
  rng: () => number,
  ratingsHistory: any[],
  hgtIn: number,
  pos: string,
): any[] {
  return Array.from({ length: careerYears }, (_, i) => {
    const seasonRatings = ratingsHistory[i] ?? {};
    const ovr = seasonRatings.ovr ?? 50;
    // mpg from that year's OVR tier (rookie OVR 45 → ~22 mpg, peak OVR 62 → ~36 mpg)
    const peakMpg = ovr >= 60 ? 36 : ovr >= 55 ? 32 : ovr >= 50 ? 28 : ovr >= 45 ? 22 : ovr >= 40 ? 16 : 11;
    const mpg = Math.round(peakMpg * (1 + (rng() - 0.5) * 0.15));   // ±7.5% per-season noise
    const gp = 55 + Math.floor(rng() * 25);                          // 55-79 GP
    const min = Math.round(gp * mpg);
    const stat = ratingsToStats(seasonRatings, hgtIn, pos, mpg);
    const noise = () => 1 + (rng() - 0.5) * 0.10;                    // small per-stat jitter

    return {
      season: draftYear + i,
      tid: tidArc[i] ?? tidArc[tidArc.length - 1] ?? -1,
      playoffs: false,
      gp,
      gs: Math.floor(rng() * 60),
      min,
      // Counting volume stats — totals (per game × gp), so views can derive
      // per-game / FG% / eFG% / TS% straight from FG/FGA/3P/3PA/FT/FTA.
      pts: Math.round(stat.ppg * noise() * gp),
      ast: Math.round(stat.apg * noise() * gp),
      trb: Math.round(stat.trb * noise() * gp),
      drb: Math.round(stat.drb * noise() * gp),
      orb: Math.round(stat.orb * noise() * gp),
      stl: Math.round(stat.stl * noise() * gp),
      blk: Math.round(stat.blk * noise() * gp),
      tov: Math.round(stat.tov * noise() * gp),
      pf:  Math.round(stat.pf  * noise() * gp),
      fg:  Math.round(stat.fgm * noise() * gp),
      fga: Math.round(stat.fga * noise() * gp),
      tp:  Math.round(stat.tpm * noise() * gp),
      tpa: Math.round(stat.tpa * noise() * gp),
      ft:  Math.round(stat.ftm * noise() * gp),
      fta: Math.round(stat.fta * noise() * gp),
      fgp: Math.round(stat.fgp * 10) / 10,
      tpp: Math.round(stat.tpp * 10) / 10,
      ftp: Math.round(stat.ftp * 10) / 10,
    };
  });
}

// Builds a tid sequence for a player's career — starts at draft team, occasional
// mid-career trades, ends at currentTid (so the live roster matches their final tid).
// Stars (high OVR) bias loyalty; role players bounce more.
function buildTidArc(
  draftTidPick: number,
  currentTid: number,
  careerYears: number,
  ovr: number,
  rng: () => number,
): number[] {
  if (careerYears <= 0) return [];
  if (careerYears === 1) return [currentTid];
  const tradeProb = ovr >= 60 ? 0.06 : ovr >= 50 ? 0.12 : 0.18;
  const arc: number[] = [];
  let active = draftTidPick;
  for (let i = 0; i < careerYears; i++) {
    if (i === careerYears - 1) {
      active = currentTid;
    } else if (i > 0 && rng() < tradeProb) {
      let next = Math.floor(rng() * NUM_TEAMS);
      if (next === active) next = (next + 1) % NUM_TEAMS;
      active = next;
    }
    arc.push(active);
  }
  return arc;
}

// One transactions[] entry per team change in the arc.
function buildTransactions(
  tidArc: number[],
  draftYear: number,
): Array<{ season: number; tid: number; type?: string }> {
  if (tidArc.length === 0) return [];
  const txns: Array<{ season: number; tid: number; type?: string }> = [
    { season: draftYear, tid: tidArc[0], type: 'draft' },
  ];
  for (let i = 1; i < tidArc.length; i++) {
    if (tidArc[i] !== tidArc[i - 1]) {
      txns.push({ season: draftYear + i, tid: tidArc[i], type: 'trade' });
    }
  }
  return txns;
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
    // Force underlying attrs to match the target OVR (additive shift), otherwise
    // ratingsToStats reads rookie-level oiq/ins/pss for "stars" and produces
    // 8 PPG for K2 95 players. Without this, OVR is the only star indicator.
    const ATTR_KEYS = ['stre','spd','jmp','endu','ins','dnk','ft','fg','tp','oiq','diq','drb','pss','reb'];
    const ratings = (p.ratings ?? []).map((r, i) => {
      if (i !== (p.ratings?.length ?? 1) - 1) return r;
      const curAvg = ATTR_KEYS.reduce((s, a) => s + ((r as any)[a] ?? 50), 0) / ATTR_KEYS.length;
      const delta = targetBbgm - curAvg;
      const next: any = { ...r, ovr: targetBbgm, pot: targetPotBbgm };
      for (const a of ATTR_KEYS) {
        next[a] = Math.max(0, Math.min(99, ((r as any)[a] ?? 50) + delta));
      }
      return next;
    });
    const contract = contractForK2(targetK2, age, startYear, rng);
    const contractYears = buildContractYears(contract.amountUSD, startYear, contract.years, rng);
    const draftAge = Math.min(age, estimateDraftAge(targetK2, rng));
    const draftYear = startYear - (age - draftAge);
    const careerYears = Math.max(0, age - draftAge);

    // Reverse-progressed ratings snapshots for every past pro season.
    // The current-year entry is `ratings[ratings.length - 1]`; history goes
    // before it in chronological order so player.ratings = [...past, current].
    const currentRatingsEntry = ratings[ratings.length - 1] ?? {};
    const ratingsHistory = buildRatingsHistory(
      currentRatingsEntry, age, startYear, careerYears, `act_${rank}_${p.id ?? p.firstName}`,
    );
    const fullRatings = [...ratingsHistory, { ...currentRatingsEntry, season: startYear }];

    // Career team arc — varies tid across seasons (trades), ends at current tid.
    // FAs use draftTidPick as origin; active players also originate from a random
    // team (could be the same as current — that's fine, "1-team career").
    const draftTidPick = Math.floor(rng() * NUM_TEAMS);
    const tidArc = buildTidArc(draftTidPick, tid, careerYears, targetBbgm, rng);
    const transactions = buildTransactions(tidArc, draftYear);

    return {
      base: p, tid, age, targetK2, targetBbgm, targetPotBbgm, ratings: fullRatings,
      ratingsHistory, contract, contractYears, draftYear, careerYears, draftAge,
      tidArc, transactions,
    };
  });

  // ─── Phase 1.5: Team-level payroll targeting ─────────────────────────────
  // Without this, every team's payroll is the sum of ~15 individual contracts,
  // which always lands ~$120M (under cap) because most players get 1-yr min
  // deals. Real NBA: ~30% of teams are in tax, ~15% over apron. Target FIRST
  // (based on market + star concentration), scale player contracts to match.
  // All thresholds (cap/tax/apron) read from INITIAL_LEAGUE_STATS so the
  // commissioner's configured economy rules drive the spread.
  const teamPayrollTargets = new Map<number, number>();
  {
    const byTeam = new Map<number, typeof activeMeta>();
    for (const m of activeMeta) {
      if (!byTeam.has(m.tid)) byTeam.set(m.tid, []);
      byTeam.get(m.tid)!.push(m);
    }

    // Per-team tier score: market-weighted + star count + noise.
    for (const [tid, members] of byTeam) {
      const team = teams.find(t => t.id === tid);
      const popM = team?.pop ?? 2.0;
      // popFactor: Memphis 1.3 → 0.16, Boston 7.3 → 0.91, NYC 21.5 → 2.0
      const popFactor = Math.min(popM / 8, 2.0);
      // Stars on the roster (K2 ≥ 84) push spending up
      const stars = members.filter(m => m.targetK2 >= 84).length;
      const starFactor = stars * 0.6;
      const noise = rng() * 1.5;
      const tier = popFactor + starFactor + noise; // typical 0-5 range

      // Map tier → target payroll using configured cap/tax/apron thresholds.
      // If aprons or luxury tax are disabled in settings, we collapse those
      // tiers into the next-lower bracket so spending still spreads but stays
      // within the commissioner's enabled rules.
      let payroll: number;
      if (tier < 1.0) {
        // Rebuilders: under cap
        const floor = MIN_PAYROLL_ENABLED ? MIN_PAYROLL_USD : SALARY_CAP_USD * 0.83;
        payroll = floor + rng() * (SALARY_CAP_USD - floor);
      } else if (tier < 2.0) {
        // Over cap, under tax
        const ceiling = LUXURY_TAX_ENABLED ? TAX_THRESHOLD_USD : FIRST_APRON_USD;
        payroll = SALARY_CAP_USD + rng() * (ceiling - SALARY_CAP_USD);
      } else if (tier < 3.0 && LUXURY_TAX_ENABLED) {
        // Tax payers
        const ceiling = APRONS_ENABLED ? FIRST_APRON_USD : SECOND_APRON_USD;
        payroll = TAX_THRESHOLD_USD + rng() * (ceiling - TAX_THRESHOLD_USD);
      } else if (tier < 4.0 && APRONS_ENABLED) {
        // 1st apron
        payroll = FIRST_APRON_USD + rng() * (SECOND_APRON_USD - FIRST_APRON_USD);
      } else if (APRONS_ENABLED) {
        // 2nd apron contenders
        payroll = SECOND_APRON_USD + rng() * (SECOND_APRON_USD * 0.11);
      } else {
        // Fall-through when aprons/tax disabled — scale by tier into a single range
        const ceiling = SALARY_CAP_USD * 1.5;
        payroll = SALARY_CAP_USD + rng() * (ceiling - SALARY_CAP_USD);
      }

      teamPayrollTargets.set(tid, payroll);
    }

    // Scale each team's per-player contracts to hit the target.
    for (const [tid, members] of byTeam) {
      const target = teamPayrollTargets.get(tid)!;
      const current = members.reduce((s, m) => s + m.contract.amountUSD, 0);
      if (current <= 0) continue;
      const scale = target / current;

      for (const m of members) {
        // Never scale below configured minimum contract.
        const scaledUSD = Math.max(MIN_CONTRACT_USD, m.contract.amountUSD * scale);
        m.contract = {
          ...m.contract,
          amountUSD: scaledUSD,
          amount: Math.round(scaledUSD / 1000),
        };
        m.contractYears = buildContractYears(
          scaledUSD,
          startYear,
          m.contract.years,
          rng,
        );
      }
    }
  }

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
    // Same attr shift as activeMeta — without it, FA stats look identical to rookies.
    const ATTR_KEYS = ['stre','spd','jmp','endu','ins','dnk','ft','fg','tp','oiq','diq','drb','pss','reb'];
    const ratings = (p.ratings ?? []).map((r, i) => {
      if (i !== (p.ratings?.length ?? 1) - 1) return r;
      const curAvg = ATTR_KEYS.reduce((s, a) => s + ((r as any)[a] ?? 50), 0) / ATTR_KEYS.length;
      const delta = targetBbgm - curAvg;
      const next: any = { ...r, ovr: targetBbgm, pot: targetPotBbgm };
      for (const a of ATTR_KEYS) {
        next[a] = Math.max(0, Math.min(99, ((r as any)[a] ?? 50) + delta));
      }
      return next;
    });
    const draftAge = Math.min(age, estimateDraftAge(targetK2, rng));
    const draftYear = startYear - (age - draftAge);
    const careerYears = Math.max(0, age - draftAge);
    // FAs were originally drafted by SOME team — pick a random NBA team
    const draftTidPick = Math.floor(rng() * NUM_TEAMS);

    const currentRatingsEntry = ratings[ratings.length - 1] ?? {};
    const ratingsHistory = buildRatingsHistory(
      currentRatingsEntry, age, startYear, careerYears, `fa_${p.id ?? p.firstName}`,
    );
    const fullRatings = [...ratingsHistory, { ...currentRatingsEntry, season: startYear }];

    // FAs: career arc starts at draftTidPick, ends at... another random team
    // (they're FAs now, so no current team — last career season was on someone).
    const lastCareerTid = Math.floor(rng() * NUM_TEAMS);
    const tidArc = buildTidArc(draftTidPick, lastCareerTid, careerYears, targetBbgm, rng);
    const transactions = buildTransactions(tidArc, draftYear);

    return {
      base: p, age, targetK2, targetBbgm, targetPotBbgm, ratings: fullRatings,
      ratingsHistory, draftYear, careerYears, draftTidPick, draftAge,
      tidArc, transactions,
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
  const slotted = assignDraftSlots(seeds, rng);
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
      stats: fakeCareerStats(
        m.draftYear, m.careerYears, m.tidArc, rng,
        m.ratingsHistory,
        m.base.hgt ?? 78,
        m.base.pos ?? 'GF',
      ),
      transactions: m.transactions as any,
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
      stats: fakeCareerStats(
        m.draftYear, m.careerYears, m.tidArc, rng,
        m.ratingsHistory,
        m.base.hgt ?? 78,
        m.base.pos ?? 'GF',
      ),
      transactions: m.transactions as any,
    };
  });

  // ─── Rookie Class (110 prospects, tid=-2, draft year = current cycle) ────
  // The draft AFTER the current season uses startYear (= leagueStats.year).
  // We generate 110 prospects but only 60 picks exist (R1+R2), so ~50 will go
  // undrafted in autoRunDraft and become free agents / G-League fodder. Mirrors
  // real NBA draft pools (100-120 declarees, 60 picks, ~50% undrafted).
  const rookies: NBAPlayer[] = generateDraftClassForGame(
    startYear, 110, rng, nameData, startYear,
  ).map(p => ({ ...p, stats: [] }));

  // ─── Phase 5: Fake league history (champions / awards / W-L per past year) ──
  // Drives LeagueHistoryView. Without this every past season shows TBA / —.
  const history = generateFictionalHistory(activePlayers, teams, startYear, rng);
  // Merge generated past seasons into each team's seasons[] array
  // (generator output: oldest → newest order so .seasons stays chronological).
  const teamsWithHistory = teams.map(t => {
    const past = history.teamSeasons.get(t.id) ?? [];
    const sortedPast = past.sort((a, b) => a.season - b.season);
    return { ...t, seasons: [...sortedPast, ...t.seasons] };
  });

  // ─── Phase 6: Distribute history awards into per-player .awards[] ────────
  // PlayerBio's Awards tab + career-summary widgets read player.awards[],
  // not state.historicalAwards. Without this fan-out, the league-history view
  // shows awards but the player profile says "no career awards".
  const awardsByPid = new Map<string, Array<{ season: number; type: string }>>();
  for (const a of history.historicalAwards) {
    if (!a.pid) continue; // Champion/Runner Up are team-level, no pid
    if (!awardsByPid.has(a.pid)) awardsByPid.set(a.pid, []);
    awardsByPid.get(a.pid)!.push({ season: a.season, type: a.type });
  }
  const playersWithAwards = [...activePlayers, ...freeAgents, ...rookies].map(p => {
    const list = awardsByPid.get(p.internalId ?? '');
    if (!list || list.length === 0) return p;
    return { ...p, awards: [...((p as any).awards ?? []), ...list] };
  });

  return {
    teams: teamsWithHistory,
    players: playersWithAwards,
    historicalAwards: history.historicalAwards,
  };
}
