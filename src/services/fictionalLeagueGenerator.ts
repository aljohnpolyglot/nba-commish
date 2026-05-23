import type { NBATeam, NBAPlayer } from '../types';
import { FICTIONAL_TEAMS, fictionalLogoUrl } from '../data/fictionalTeams';
import { generateDraftClassForGame } from './genDraftPlayers';
import { getNameData } from '../data/nameDataFetcher';
import { INITIAL_LEAGUE_STATS } from '../constants';
import { generateFictionalHistory } from './fictionalHistoryGenerator';
import { buildRatingsHistory } from './playerDevelopment/reverseProgression';
import {
  buildContractYears,
  buildTidArc,
  buildTransactions,
  fakeCareerStats,
} from './fictionalLeagueGeneratorCareer';
interface FictionalLeagueResult {
  teams: NBATeam[];
  players: NBAPlayer[];
  historicalAwards: Array<{ season: number; type: string; name?: string; pid?: string; tid?: number }>;
}
const ROSTER_SIZE = INITIAL_LEAGUE_STATS.maxStandardPlayersPerTeam ?? 15;
const NUM_TEAMS = 30;
const TOTAL_PLAYERS = ROSTER_SIZE * NUM_TEAMS;
const NUM_DRAFT_CLASSES = 15;
const SALARY_CAP_USD     = INITIAL_LEAGUE_STATS.salaryCap;
const TAX_THRESHOLD_USD  = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.luxuryTaxThresholdPercentage ?? 121.5) / 100;
const FIRST_APRON_USD    = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.firstApronPercentage ?? 126.7) / 100;
const SECOND_APRON_USD   = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.secondApronPercentage ?? 134.4) / 100;
const MIN_PAYROLL_USD    = SALARY_CAP_USD * (INITIAL_LEAGUE_STATS.minimumPayrollPercentage ?? 90) / 100;
const MIN_PAYROLL_ENABLED = INITIAL_LEAGUE_STATS.minimumPayrollEnabled ?? true;
const APRONS_ENABLED      = INITIAL_LEAGUE_STATS.apronsEnabled ?? true;
const LUXURY_TAX_ENABLED  = INITIAL_LEAGUE_STATS.luxuryTaxEnabled ?? true;
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
const k2ToBbgm = (k2: number): number => Math.round((k2 - 31) / 0.88);
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
  const variance = 1 + (rng() - 0.5) * 0.4;
  let amountUSD = SALARY_CAP_USD * basePct * variance;
  amountUSD = Math.max(MIN_CONTRACT_USD, amountUSD);
  let years: number;
  if (k2 >= 88 && age < 32)      years = 3 + Math.floor(rng() * (MAX_CONTRACT_LENGTH_BIRD - 2));  // up to bird-max
  else if (k2 >= 82 && age < 33) years = 2 + Math.floor(rng() * (MAX_CONTRACT_LENGTH_STD - 1));   // up to standard-max
  else if (k2 >= 75)             years = 1 + Math.floor(rng() * Math.min(3, MAX_CONTRACT_LENGTH_STD));
  else if (k2 >= 68)             years = 1 + Math.floor(rng() * Math.min(2, MAX_CONTRACT_LENGTH_STD));
  else                           years = MIN_CONTRACT_LENGTH;
  years = Math.max(MIN_CONTRACT_LENGTH, Math.min(years, MAX_CONTRACT_LENGTH_BIRD, Math.max(1, 38 - age)));
  return {
    amount: Math.round(amountUSD / 1000), // BBGM thousands
    exp: startYear + years - 1,
    years,
    amountUSD,
  };
}
function estimateDraftAge(k2: number, rng: () => number): number {
  if (k2 >= 85) return 19 + Math.floor(rng() * 2);     // 19-20 (one-and-done lottery)
  if (k2 >= 75) return 19 + Math.floor(rng() * 3);     // 19-21
  return 20 + Math.floor(rng() * 3);                   // 20-22 (late bloomers)
}
function gauss(rng: () => number, std: number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
}
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
  const nameData = getNameData();
  const raw: NBAPlayer[] = [];
  for (let i = 0; i < NUM_DRAFT_CLASSES; i++) {
    const cls = generateDraftClassForGame(startYear, NUM_TEAMS, rng, nameData, startYear);
    raw.push(...cls);
  }
  raw.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  const trimmed = raw.slice(0, TOTAL_PLAYERS);
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
    const currentRatingsEntry = ratings[ratings.length - 1] ?? {};
    const ratingsHistory = buildRatingsHistory(
      currentRatingsEntry, age, startYear, careerYears, `act_${rank}_${(p as any).id ?? (p as any).firstName ?? p.name}`,
    );
    const fullRatings = [...ratingsHistory, { ...currentRatingsEntry, season: startYear }];
    const draftTidPick = Math.floor(rng() * NUM_TEAMS);
    const tidArc = buildTidArc(draftTidPick, tid, careerYears, targetBbgm, rng, NUM_TEAMS);
    const transactions = buildTransactions(tidArc, draftYear);
    return {
      base: p, tid, age, targetK2, targetBbgm, targetPotBbgm, ratings: fullRatings,
      ratingsHistory, contract, contractYears, draftYear, careerYears, draftAge,
      tidArc, transactions,
    };
  });
  const teamPayrollTargets = new Map<number, number>();
  {
    const byTeam = new Map<number, typeof activeMeta>();
    for (const m of activeMeta) {
      if (!byTeam.has(m.tid)) byTeam.set(m.tid, []);
      byTeam.get(m.tid)!.push(m);
    }
    for (const [tid, members] of byTeam) {
      const team = teams.find(t => t.id === tid);
      const popM = team?.pop ?? 2.0;
      const popFactor = Math.min(popM / 8, 2.0);
      const stars = members.filter(m => m.targetK2 >= 84).length;
      const starFactor = stars * 0.6;
      const noise = rng() * 1.5;
      const tier = popFactor + starFactor + noise; // typical 0-5 range
      let payroll: number;
      if (tier < 1.0) {
        const floor = MIN_PAYROLL_ENABLED ? MIN_PAYROLL_USD : SALARY_CAP_USD * 0.83;
        payroll = floor + rng() * (SALARY_CAP_USD - floor);
      } else if (tier < 2.0) {
        const ceiling = LUXURY_TAX_ENABLED ? TAX_THRESHOLD_USD : FIRST_APRON_USD;
        payroll = SALARY_CAP_USD + rng() * (ceiling - SALARY_CAP_USD);
      } else if (tier < 3.0 && LUXURY_TAX_ENABLED) {
        const ceiling = APRONS_ENABLED ? FIRST_APRON_USD : SECOND_APRON_USD;
        payroll = TAX_THRESHOLD_USD + rng() * (ceiling - TAX_THRESHOLD_USD);
      } else if (tier < 4.0 && APRONS_ENABLED) {
        payroll = FIRST_APRON_USD + rng() * (SECOND_APRON_USD - FIRST_APRON_USD);
      } else if (APRONS_ENABLED) {
        payroll = SECOND_APRON_USD + rng() * (SECOND_APRON_USD * 0.11);
      } else {
        const ceiling = SALARY_CAP_USD * 1.5;
        payroll = SALARY_CAP_USD + rng() * (ceiling - SALARY_CAP_USD);
      }
      teamPayrollTargets.set(tid, payroll);
    }
    for (const [tid, members] of byTeam) {
      const target = teamPayrollTargets.get(tid)!;
      const current = members.reduce((s, m) => s + m.contract.amountUSD, 0);
      if (current <= 0) continue;
      const scale = target / current;
      for (const m of members) {
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
  const faRaw: NBAPlayer[] = [];
  for (let i = 0; i < 4; i++) {
    const cls = generateDraftClassForGame(startYear, 20, rng, nameData, startYear);
    faRaw.push(...cls);
  }
  const faMeta = faRaw.slice(0, 80).map(p => {
    const targetK2 = 56 + rng() * 16;
    const targetBbgm = k2ToBbgm(targetK2);
    const age = 22 + Math.floor(rng() * 13);
    const targetPotBbgm = Math.min(82, targetBbgm + Math.floor(rng() * 5));
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
    const draftTidPick = Math.floor(rng() * NUM_TEAMS);
    const currentRatingsEntry = ratings[ratings.length - 1] ?? {};
    const ratingsHistory = buildRatingsHistory(
      currentRatingsEntry, age, startYear, careerYears, `fa_${(p as any).id ?? (p as any).firstName ?? p.name}`,
    );
    const fullRatings = [...ratingsHistory, { ...currentRatingsEntry, season: startYear }];
    const lastCareerTid = Math.floor(rng() * NUM_TEAMS);
    const tidArc = buildTidArc(draftTidPick, lastCareerTid, careerYears, targetBbgm, rng, NUM_TEAMS);
    const transactions = buildTransactions(tidArc, draftYear);
    return {
      base: p, age, targetK2, targetBbgm, targetPotBbgm, ratings: fullRatings,
      ratingsHistory, draftYear, careerYears, draftTidPick, draftAge,
      tidArc, transactions,
    };
  });
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
  const rookies: NBAPlayer[] = generateDraftClassForGame(
    startYear, 110, rng, nameData, startYear,
  ).map(p => ({ ...p, stats: [] }));
  const history = generateFictionalHistory(activePlayers, teams, startYear, rng);
  const teamsWithHistory = teams.map(t => {
    const past = history.teamSeasons.get(t.id) ?? [];
    const sortedPast = past.sort((a, b) => a.season - b.season);
    return { ...t, seasons: [...sortedPast, ...t.seasons] };
  });
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
