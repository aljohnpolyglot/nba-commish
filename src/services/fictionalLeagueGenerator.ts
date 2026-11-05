import type {
  FictionalHistoryMode,
  FictionalNationalityFrequency,
  FictionalPlayerPool,
  FictionalStartupTeamDef,
  LeagueStats,
  NBATeam,
  NBAPlayer,
} from '../types';
import { FICTIONAL_TEAMS, fictionalLogoUrl } from '../data/fictionalTeams';
import { generateDraftClassForGame } from './genDraftPlayers';
import { getNameData } from '../data/nameDataFetcher';
import { createPortraitUsageSet } from '../utils/newgenPortrait';
import { normalizeFictionalPositionLabel } from '../utils/positionUtils';
import { INITIAL_LEAGUE_STATS } from '../constants';
import { generateFictionalHistory } from './fictionalHistoryGenerator';
import { buildRatingsHistory } from './playerDevelopment/reverseProgression';
import {
  buildCareerSalaries,
  buildContractYears,
  buildFictionalPlayoffStats,
  buildTidArc,
  buildTransactions,
  fakeCareerStats,
} from './fictionalLeagueGeneratorCareer';
import { applyGeneratedFamilyLineages } from './playerFamilyLineage';
interface FictionalLeagueResult {
  teams: NBATeam[];
  players: NBAPlayer[];
  historicalAwards: Array<{ season: number; type: string; name?: string; pid?: string; tid?: number }>;
}
const NUM_DRAFT_CLASSES = 15;
interface FictionalEconomy {
  salaryCapUsd: number;
  minContractUsd: number;
  maxCapPct: number;
  supermaxPct: number;
  minContractLength: number;
  maxContractLengthStandard: number;
  maxContractLengthBird: number;
}
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
function targetCapPctForK2(k2: number, economy: FictionalEconomy): number {
  if (k2 >= 92) return economy.supermaxPct;
  if (k2 >= 88) return economy.maxCapPct;
  if (k2 >= 84) return economy.maxCapPct * 0.60;
  if (k2 >= 80) return economy.maxCapPct * 0.40;
  if (k2 >= 76) return economy.maxCapPct * 0.25;
  if (k2 >= 72) return economy.maxCapPct * 0.15;
  if (k2 >= 68) return economy.maxCapPct * 0.083;
  return 0;                                            // fringe → min
}
function contractForK2(k2: number, age: number, startYear: number, rng: () => number, economy: FictionalEconomy) {
  const basePct = targetCapPctForK2(k2, economy);
  const variance = 1 + (rng() - 0.5) * 0.4;
  let amountUSD = economy.salaryCapUsd * basePct * variance;
  amountUSD = Math.max(economy.minContractUsd, amountUSD);
  let years: number;
  if (k2 >= 88 && age < 32) years = 3 + Math.floor(rng() * Math.max(1, economy.maxContractLengthBird - 2));
  else if (k2 >= 82 && age < 33) years = 2 + Math.floor(rng() * Math.max(1, economy.maxContractLengthStandard - 1));
  else if (k2 >= 75) years = 1 + Math.floor(rng() * Math.min(3, economy.maxContractLengthStandard));
  else if (k2 >= 68) years = 1 + Math.floor(rng() * Math.min(2, economy.maxContractLengthStandard));
  else years = economy.minContractLength;
  years = Math.max(economy.minContractLength, Math.min(years, economy.maxContractLengthBird, Math.max(1, 38 - age)));
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
interface GenerateFictionalLeagueOptions {
  teams?: FictionalStartupTeamDef[];
  historyMode?: FictionalHistoryMode;
  playerPool?: FictionalPlayerPool;
  nationalityFrequencies?: FictionalNationalityFrequency[];
  leagueRules?: Partial<LeagueStats>;
}

export function generateFictionalLeague(startYear: number, seed?: number, options: GenerateFictionalLeagueOptions = {}): FictionalLeagueResult {
  const rng = seed == null ? Math.random : createSeededRandom(seed);
  const teamDefs = options.teams && options.teams.length > 0 ? options.teams : FICTIONAL_TEAMS;
  const historyMode = options.historyMode ?? 'established';
  const leagueRules = { ...INITIAL_LEAGUE_STATS, ...options.leagueRules };
  const salaryCapUsd = Math.max(
    1,
    leagueRules.salaryCap > 0
      ? leagueRules.salaryCap
      : leagueRules.historicalContractScaleCap ?? INITIAL_LEAGUE_STATS.salaryCap,
  );
  const taxThresholdUsd = salaryCapUsd * (leagueRules.luxuryTaxThresholdPercentage ?? 121.5) / 100;
  const firstApronUsd = salaryCapUsd * (leagueRules.firstApronPercentage ?? 126.7) / 100;
  const secondApronUsd = salaryCapUsd * (leagueRules.secondApronPercentage ?? 134.4) / 100;
  const minPayrollUsd = salaryCapUsd * (leagueRules.minimumPayrollPercentage ?? 90) / 100;
  const minPayrollEnabled = leagueRules.minimumPayrollEnabled ?? true;
  const apronsEnabled = leagueRules.apronsEnabled ?? true;
  const luxuryTaxEnabled = leagueRules.luxuryTaxEnabled ?? true;
  const economy: FictionalEconomy = {
    salaryCapUsd,
    minContractUsd: (leagueRules.minContractStaticAmount ?? 1.273) * 1_000_000,
    maxCapPct: (leagueRules.maxContractStaticPercentage ?? 30) / 100,
    supermaxPct: (leagueRules.supermaxPercentage ?? 35) / 100,
    minContractLength: leagueRules.minContractLength ?? 1,
    maxContractLengthStandard: leagueRules.maxContractLengthStandard ?? 4,
    maxContractLengthBird: leagueRules.maxContractLengthBird ?? 5,
  };
  const gender = options.playerPool === 'womens' ? 'female' : options.playerPool === 'mixed' ? 'mixed' : 'male';
  const nationalityFrequencies = Object.fromEntries(
    (options.nationalityFrequencies ?? [])
      .filter(entry => entry.frequency > 0)
      .map(entry => [entry.country, entry.frequency]),
  );
  const draftContext = {
    nationalityFrequencies: Object.keys(nationalityFrequencies).length > 0 ? nationalityFrequencies : undefined,
  };
  const nameData = getNameData();
  const usedPortraitUrls = createPortraitUsageSet();
  const generatePlayers = (count: number, draftYear = startYear) => generateDraftClassForGame(
    draftYear,
    count,
    rng,
    nameData,
    draftYear,
    leagueRules.draftEligibilityRule,
    gender,
    'regen_pack',
    'normal',
    draftContext,
    usedPortraitUrls,
  ).map(player => ({
    ...player,
    pos: normalizeFictionalPositionLabel(player.pos, player.hgt),
    sourceInjuryProfileDisabled: true,
  }));
  const numTeams = teamDefs.length;
  const totalPlayers = (leagueRules.maxStandardPlayersPerTeam ?? 15) * numTeams;
  const teams: NBATeam[] = teamDefs.map(def => ({
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
    stadiumCapacity: def.stadiumCapacity,
    logoUrl: def.imgURL || fictionalLogoUrl(def.abbrev),
    colors: def.colors,
    streak: { type: 'W' as const, count: 0 },
    seasons: [{ season: startYear, won: 0, lost: 0, playoffRoundsWon: -1 }],
    retiredJerseyNumbers: [],
  }));
  const raw: NBAPlayer[] = [];
  for (let i = 0; i < NUM_DRAFT_CLASSES; i++) {
    const cls = generatePlayers(numTeams);
    raw.push(...cls);
  }
  raw.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  const trimmed = raw.slice(0, totalPlayers);
  const activeMeta = trimmed.map((p, rank) => {
    const round0 = Math.floor(rank / numTeams);
    const indexInRound = rank % numTeams;
    const tid = round0 % 2 === 0 ? indexInRound : (numTeams - 1 - indexInRound);
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
    const contract = contractForK2(targetK2, age, startYear, rng, economy);
    const contractYears = buildContractYears(contract.amountUSD, startYear, contract.years, rng);
    const draftAge = Math.max(age - (NUM_DRAFT_CLASSES - 1), Math.min(age, estimateDraftAge(targetK2, rng)));
    const draftYear = startYear - 1 - (age - draftAge);
    const careerYears = Math.max(0, age - draftAge);
    const currentRatingsEntry = ratings[ratings.length - 1] ?? {};
    const ratingsHistory = buildRatingsHistory(
      currentRatingsEntry, age, startYear, careerYears, `act_${rank}_${(p as any).id ?? (p as any).firstName ?? p.name}`,
    );
    const fullRatings = [...ratingsHistory, { ...currentRatingsEntry, season: startYear }];
    const draftTidPick = Math.floor(rng() * numTeams);
    const tidArc = buildTidArc(draftTidPick, tid, careerYears, targetBbgm, rng, numTeams);
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
        const floor = minPayrollEnabled ? minPayrollUsd : salaryCapUsd * 0.83;
        payroll = floor + rng() * (salaryCapUsd - floor);
      } else if (tier < 2.0) {
        const ceiling = luxuryTaxEnabled ? taxThresholdUsd : firstApronUsd;
        payroll = salaryCapUsd + rng() * (ceiling - salaryCapUsd);
      } else if (tier < 3.0 && luxuryTaxEnabled) {
        const ceiling = apronsEnabled ? firstApronUsd : secondApronUsd;
        payroll = taxThresholdUsd + rng() * (ceiling - taxThresholdUsd);
      } else if (tier < 4.0 && apronsEnabled) {
        payroll = firstApronUsd + rng() * (secondApronUsd - firstApronUsd);
      } else if (apronsEnabled) {
        payroll = secondApronUsd + rng() * (secondApronUsd * 0.11);
      } else {
        const ceiling = salaryCapUsd * 1.5;
        payroll = salaryCapUsd + rng() * (ceiling - salaryCapUsd);
      }
      teamPayrollTargets.set(tid, payroll);
    }
    for (const [tid, members] of byTeam) {
      const target = teamPayrollTargets.get(tid)!;
      const current = members.reduce((s, m) => s + m.contract.amountUSD, 0);
      if (current <= 0) continue;
      const scale = target / current;
      for (const m of members) {
        const scaledUSD = Math.max(economy.minContractUsd, m.contract.amountUSD * scale);
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
    const cls = generatePlayers(20);
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
    const draftAge = Math.max(age - (NUM_DRAFT_CLASSES - 1), Math.min(age, estimateDraftAge(targetK2, rng)));
    const draftYear = startYear - 1 - (age - draftAge);
    const careerYears = Math.max(0, age - draftAge);
    const draftTidPick = Math.floor(rng() * numTeams);
    const currentRatingsEntry = ratings[ratings.length - 1] ?? {};
    const ratingsHistory = buildRatingsHistory(
      currentRatingsEntry, age, startYear, careerYears, `fa_${(p as any).id ?? (p as any).firstName ?? p.name}`,
    );
    const fullRatings = [...ratingsHistory, { ...currentRatingsEntry, season: startYear }];
    const lastCareerTid = Math.floor(rng() * numTeams);
    const tidArc = buildTidArc(draftTidPick, lastCareerTid, careerYears, targetBbgm, rng, numTeams);
    const transactions = buildTransactions(tidArc, draftYear);
    return {
      base: p, age, targetK2, targetBbgm, targetPotBbgm, ratings: fullRatings,
      ratingsHistory, draftYear, careerYears, draftTidPick, draftAge,
      tidArc, transactions,
    };
  });
  const occupiedByDraftYear = new Map<number, number>();
  for (const meta of [...activeMeta, ...faMeta]) {
    occupiedByDraftYear.set(meta.draftYear, (occupiedByDraftYear.get(meta.draftYear) ?? 0) + 1);
  }
  const archiveMeta = historyMode === 'established'
    ? Array.from({ length: NUM_DRAFT_CLASSES }, (_, index) => startYear - NUM_DRAFT_CLASSES + index)
      .flatMap(draftYear => {
        const missing = Math.max(0, 60 - (occupiedByDraftYear.get(draftYear) ?? 0));
        return generatePlayers(missing, draftYear).map((base, playerIndex) => {
          const draftAge = Math.max(18, Math.min(23, Number(base.age ?? 21)));
          const age = startYear - (draftYear - draftAge);
          const availableSeasons = Math.max(0, startYear - draftYear - 1);
          const careerYears = availableSeasons === 0
            ? 0
            : Math.max(1, Math.min(availableSeasons, 1 + Math.floor(rng() * Math.min(10, availableSeasons))));
          const sourceRating: any = base.ratings?.[base.ratings.length - 1] ?? {};
          const ratingsHistory = Array.from({ length: careerYears }, (_, seasonIndex) => ({
            ...sourceRating,
            season: draftYear + seasonIndex + 1,
            ovr: Math.max(25, Math.min(82, Number(sourceRating.ovr ?? base.overallRating ?? 45) + Math.min(5, seasonIndex) * (rng() < 0.65 ? 1 : 0))),
          }));
          const lastRating = ratingsHistory[ratingsHistory.length - 1] ?? sourceRating;
          const targetBbgm = Number(lastRating.ovr ?? base.overallRating ?? 45);
          const targetK2 = 31 + 0.88 * targetBbgm;
          const draftTidPick = Math.floor(rng() * numTeams);
          const lastCareerTid = Math.floor(rng() * numTeams);
          const tidArc = buildTidArc(draftTidPick, lastCareerTid, careerYears, targetBbgm, rng, numTeams);
          return {
            base,
            age,
            draftAge,
            draftYear,
            careerYears,
            targetBbgm,
            targetK2,
            ratingsHistory,
            ratings: ratingsHistory.length > 0 ? ratingsHistory : [{ ...sourceRating, season: draftYear }],
            tidArc,
            transactions: buildTransactions(tidArc, draftYear),
            draftTidPick,
            seed: `archive_${draftYear}_${playerIndex}`,
          };
        });
      })
    : [];
  type Seed = { _draftYear: number; _k2: number; _draftTid: number; _ref: any };
  const draftRating = (ratingsHistory: any[], fallbackK2: number) => {
    const rookieOvr = Number(ratingsHistory[0]?.ovr);
    return Number.isFinite(rookieOvr) ? 31 + 0.88 * rookieOvr : fallbackK2;
  };
  const seeds: Seed[] = [
    ...activeMeta.map(m => ({ _draftYear: m.draftYear, _k2: draftRating(m.ratingsHistory, m.targetK2), _draftTid: m.tidArc[0] ?? m.tid, _ref: m })),
    ...faMeta.map(m => ({ _draftYear: m.draftYear, _k2: draftRating(m.ratingsHistory, m.targetK2), _draftTid: m.tidArc[0] ?? m.draftTidPick, _ref: m })),
    ...archiveMeta.map(m => ({ _draftYear: m.draftYear, _k2: draftRating(m.ratingsHistory, m.targetK2), _draftTid: m.tidArc[0] ?? m.draftTidPick, _ref: m })),
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
      salaries: buildCareerSalaries({
        draftYear: m.draftYear,
        careerYears: m.careerYears,
        tidArc: m.tidArc,
        ratingsHistory: m.ratingsHistory,
        round: slot.round,
        pick: slot.pick,
        currentYear: startYear,
        salaryCapUsd,
        minSalaryUsd: economy.minContractUsd,
        rng,
      }),
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
      salaries: buildCareerSalaries({
        draftYear: m.draftYear,
        careerYears: m.careerYears,
        tidArc: m.tidArc,
        ratingsHistory: m.ratingsHistory,
        round: slot.round,
        pick: slot.pick,
        currentYear: startYear,
        salaryCapUsd,
        minSalaryUsd: economy.minContractUsd,
        rng,
      }),
      transactions: m.transactions as any,
    };
  });
  const retiredPlayers: NBAPlayer[] = archiveMeta.map(m => {
    const slot = slotMap.get(m)!;
    return {
      ...m.base,
      tid: -1,
      status: 'Retired' as const,
      age: m.age,
      born: m.base.born ? { ...m.base.born, year: m.draftYear - m.draftAge } : { year: m.draftYear - m.draftAge, loc: 'USA' },
      overallRating: m.targetBbgm,
      potential: Math.max(m.targetBbgm, Number(m.base.potential ?? m.targetBbgm)),
      ratings: m.ratings,
      contract: undefined,
      contractYears: undefined,
      retiredYear: m.draftYear + m.careerYears,
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
      salaries: buildCareerSalaries({
        draftYear: m.draftYear,
        careerYears: m.careerYears,
        tidArc: m.tidArc,
        ratingsHistory: m.ratingsHistory,
        round: slot.round,
        pick: slot.pick,
        currentYear: startYear,
        salaryCapUsd,
        minSalaryUsd: economy.minContractUsd,
        rng,
      }),
      transactions: m.transactions as any,
    };
  });
  const rookies: NBAPlayer[] = generatePlayers(Math.max(110, numTeams * 3 + 20)).map(p => ({ ...p, stats: [] }));
  const history = historyMode === 'brand_new'
    ? { historicalAwards: [], teamSeasons: new Map<number, Array<{ season: number; won: number; lost: number; playoffRoundsWon: number }>>() }
    : generateFictionalHistory([...activePlayers, ...freeAgents, ...retiredPlayers], teams, startYear, rng, leagueRules);
  const teamsWithHistory = teams.map(t => {
    const past = history.teamSeasons.get(t.id) ?? [];
    const sortedPast = [...past].sort((a, b) => a.season - b.season);
    return { ...t, seasons: [...sortedPast, ...(t.seasons ?? [])] };
  });
  const awardsByPid = new Map<string, Array<{ season: number; type: string }>>();
  for (const a of history.historicalAwards) {
    if (!a.pid) continue; // Champion/Runner Up are team-level, no pid
    if (!awardsByPid.has(a.pid)) awardsByPid.set(a.pid, []);
    awardsByPid.get(a.pid)!.push({ season: a.season, type: a.type });
  }
  const playersWithAwards = [...activePlayers, ...freeAgents, ...retiredPlayers, ...rookies].map(p => {
    const list = awardsByPid.get(p.internalId ?? '');
    const playoffStats = historyMode === 'brand_new'
      ? []
      : buildFictionalPlayoffStats(p.stats ?? [], history.teamSeasons, rng);
    return {
      ...p,
      stats: [...(p.stats ?? []), ...playoffStats],
      ...(list && list.length > 0 ? { awards: [...((p as any).awards ?? []), ...list] } : {}),
    };
  });
  const originPlayersBeforeFamily = historyMode === 'brand_new'
    ? playersWithAwards.map(player => ({
        ...player,
        ratings: (player.ratings ?? []).slice(-1).map(rating => ({ ...rating, season: startYear })),
        stats: [],
        transactions: [],
        awards: [],
        draft: player.draft ? { ...player.draft, round: 0, pick: 0, tid: -1, originalTid: -1 } : player.draft,
      }))
    : playersWithAwards;
  const rookieIds = new Set(rookies.map(player => player.internalId));
  const originPlayers = applyGeneratedFamilyLineages(
    originPlayersBeforeFamily.filter(player => !rookieIds.has(player.internalId)),
    originPlayersBeforeFamily.filter(player => rookieIds.has(player.internalId)),
    startYear,
    'fictional',
  ).players;
  return {
    teams: teamsWithHistory,
    players: originPlayers,
    historicalAwards: history.historicalAwards,
  };
}
