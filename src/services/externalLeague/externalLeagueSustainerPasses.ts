import type { GameState, NBAPlayer } from '../../types';
import { EXTERNAL_LEAGUE_STATUSES, EXTERNAL_MENS_LEAGUE_STATUSES, EXTERNAL_SALARY_SCALE } from '../../constants';
import {
  ADULT_DIRECT_NATIONALITY,
  type ExternalHistoryEntry,
  type ExternalRetireeRecord,
  getPlayerCountry,
  computeCareerGP,
  seededRandom,
  WITH_YOUTH_LEAGUES,
  genderForLeague,
} from './externalLeagueIdentity';
import { initCollegeTracking, recordRetiredCollege, resolveNationalityLeague } from './externalLeagueRouting';
import { createPortraitUsageSet, getNationalityPortraitRace, getRegenPortraitUrl } from '../../utils/newgenPortrait';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../data/euroBasketballSources';
import {
  pickTeamForGeneratedPlayer,
  pickUnderRosteredTeam,
  sampleLeagueCountry,
  sampleTeamCountry,
  spawnExternalPlayer,
} from './externalLeagueSpawn';
import { normalizeAcademyBudgetEUR } from '../tycoon/economyScale';
import { getSimulationSeed } from '../saveIdentity';

const EXTERNAL_AUTO_FILL_LEAGUES = new Set([
  'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'B-League', 'G-League', 'WNBA',
  ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
]);

type RecentExternalPerformance = { gp: number; ppg: number };

function getRecentExternalPerformance(player: NBAPlayer, year: number): RecentExternalPerformance {
  const currentRows = (player.stats ?? []).filter((row: any) =>
    Number(row?.season) === year
    && row?.playoffs !== true
    && Number(row?.gp ?? 0) > 0,
  );
  const umbrella = currentRows.filter((row: any) => String(row?.competitionId ?? '').toLowerCase() === 'pba');
  const candidates = umbrella.length > 0 ? umbrella : currentRows;
  const best = candidates.sort((left: any, right: any) => Number(right?.gp ?? 0) - Number(left?.gp ?? 0))[0] as any;
  const gp = Number(best?.gp ?? 0);
  return { gp, ppg: gp > 0 ? Number(best?.pts ?? 0) / gp : 0 };
}

export function getExternalRetirementProbability(
  status: string,
  age: number,
  ovr: number,
  performance: RecentExternalPerformance = { gp: 0, ppg: 0 },
): number {
  if (status === 'G-League') {
    if (age >= 35) return 1;
    if (age >= 32 && ovr < 45) return 0.5;
    if (age >= 30 && ovr < 40) return 0.3;
    return 0;
  }
  if (status === 'PBA') {
    if (performance.gp >= 10 && performance.ppg >= 15 && age <= 42) return 0;
    if (performance.gp >= 10 && performance.ppg >= 10 && age <= 40) return 0;
    if (age >= 43) return 1;
    if (age >= 41) return 0.55;
    if (age >= 39 && ovr < 38) return 0.3;
    if (age >= 37 && ovr < 32) return 0.15;
    if (age >= 35 && ovr < 28) return 0.08;
    return 0;
  }
  if (status === 'China CBA' || status === 'NBL Australia') {
    if (age >= 44) return 1;
    if (age >= 41 && ovr < 42) return 0.3;
    if (age >= 38 && ovr < 38) return 0.15;
    return 0;
  }
  if (status === 'WNBA') {
    if (age >= 41) return 1;
    if (age >= 37 && ovr < 44) return 0.3;
    if (age >= 34 && ovr < 38) return 0.18;
    return 0;
  }
  if (age >= 42) return 1;
  if (age >= 39 && ovr < 42) return 0.3;
  if (age >= 36 && ovr < 38) return 0.15;
  return 0;
}

function repairEuroAcademyProspect(
  player: NBAPlayer,
  team: any,
  countryFallback: string,
  year: number,
  index: number,
  usedPortraitUrls: Set<string>,
): NBAPlayer {
  const ratings = Array.isArray(player.ratings) ? player.ratings : [];
  const latest = ratings[ratings.length - 1] as any;
  const heightFromRating = Number.isFinite(Number(latest?.hgt))
    ? 68 + Math.round((Math.max(0, Math.min(99, Number(latest.hgt))) / 99) * 22)
    : 78;
  const heightIn = Number(player.hgt ?? (player as any).finalHgt ?? heightFromRating);
  const strength = Math.max(10, Math.min(99, Number(latest?.stre ?? 50)));
  const weightLbs = Number(player.weight ?? (player as any).finalWeight);
  const repairedWeight = Number.isFinite(weightLbs) && weightLbs > 0
    ? Math.round(weightLbs)
    : Math.round((20 + (strength / 99) * 8) * Math.pow(heightIn, 2) / 703);
  const country = getPlayerCountry(player) || countryFallback || 'Spain';
  const seed = String(player.internalId ?? `${team?.tid ?? 'academy'}-${year}-${index}`);
  const imgURL = player.imgURL || getRegenPortraitUrl(seed, getNationalityPortraitRace(seed, country), {
    nationality: country,
    bornLoc: country,
    gender: genderForLeague(String(team?.league ?? 'Euroleague')),
    usedPortraitUrls,
  }) || undefined;
  return {
    ...player,
    pos: normalizePositionLabel(player.pos ?? latest?.pos, heightIn),
    hgt: heightIn,
    weight: repairedWeight,
    finalHgt: Number((player as any).finalHgt ?? heightIn),
    finalWeight: Number((player as any).finalWeight ?? repairedWeight),
    imgURL,
    born: {
      ...(player.born ?? {}),
      year: player.born?.year ?? year - Number((player as any).age ?? 17),
      loc: player.born?.loc ?? country,
    },
    nationality: (player as any).nationality ?? country,
  } as NBAPlayer;
}

export function ensureEuroUserAcademyProspects(
  state: GameState & { nonNBATeams?: any[] },
  year: number,
): { players: NBAPlayer[]; additions: NBAPlayer[] } {
  if (state.leagueStats?.uiMode !== 'euro_isolated' || state.gameMode !== 'gm' || state.userTeamId == null) {
    return { players: state.players ?? [], additions: [] };
  }
  if ((state.seasonHistory?.length ?? 0) === 0) {
    return { players: state.players ?? [], additions: [] };
  }

  const players = state.players ?? [];
  const team = (state.nonNBATeams ?? []).find((t: any) => (t.tid ?? t.id) === state.userTeamId);
  if (!team || !WITH_YOUTH_LEAGUES.has(team.league)) return { players, additions: [] };

  const teamAny = team as any;
  const academyBudget = normalizeAcademyBudgetEUR(
    teamAny.tycoon?.academyBudget,
    teamAny.tycoon?.tier,
    teamAny.tycoon?.currentEconomyIndex ?? 1,
  );
  if (academyBudget <= 0) return { players, additions: [] };

  const ageOf = (p: NBAPlayer) => p.born?.year ? year - p.born.year : ((p as any).age ?? 0);
  const usedPortraitUrls = createPortraitUsageSet(players.map(player => player.imgURL));
  let repairedPlayers = players;
  let repairedAny = false;
  repairedPlayers = repairedPlayers.map((p: any, index) => {
    if (p.tid !== state.userTeamId || p.promotedFromAcademy) return p;
    const age = ageOf(p);
    if (age < 14 || age > 18) return p;
    const needsRepair = !p.imgURL || !p.weight || !p.hgt || !p.pos || String(p.pos).includes(',');
    if (!needsRepair) return p;
    repairedAny = true;
    const countryFallback = sampleTeamCountry(
      team.league,
      team,
      state.nonNBATeams ?? [],
      repairedPlayers,
      seededRandom(`academy_repair_${state.userTeamId}_${year}_${index}`),
    );
    return repairEuroAcademyProspect(p, team, countryFallback, year, index, usedPortraitUrls);
  });
  return { players: repairedAny ? repairedPlayers : players, additions: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #1 — External-league retirement pass
// ═══════════════════════════════════════════════════════════════════════════════

export function retireExternalLeaguePlayers(
  players: NBAPlayer[],
  year: number,
  stateDate: string,
  state?: Pick<GameState, 'boxScores'>,
): {
  players: NBAPlayer[];
  retirees: ExternalRetireeRecord[];
  historyEntries: ExternalHistoryEntry[];
} {
  const EXTERNAL_FOR_RETIRE = new Set(EXTERNAL_LEAGUE_STATUSES);
  const retirees: ExternalRetireeRecord[] = [];
  const historyEntries: ExternalHistoryEntry[] = [];
  const normalizeName = (name: string | undefined) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const countPbaBoxScoreGP = (player: NBAPlayer): number => {
    const playerKey = normalizeName(player.name);
    const games = new Set<string>();
    for (const box of state?.boxScores ?? []) {
      if (!String((box as any).competitionId ?? '').startsWith('pba-')) continue;
      const rows = [
        ...((box as any).homeStats ?? []),
        ...((box as any).awayStats ?? []),
      ];
      const appeared = rows.some((stat: any) => {
        const statPid = String(stat?.playerId ?? stat?.pid ?? '');
        const statName = normalizeName(stat?.playerName ?? stat?.name);
        const matched = statPid === player.internalId || (!!playerKey && statName === playerKey);
        if (!matched) return false;
        return Number(stat?.min ?? 0) > 0
          || Number(stat?.pts ?? 0) > 0
          || Number(stat?.reb ?? stat?.trb ?? 0) > 0
          || Number(stat?.ast ?? 0) > 0
          || Number(stat?.stl ?? 0) > 0
          || Number(stat?.blk ?? 0) > 0;
      });
      if (appeared) games.add(String((box as any).gid ?? (box as any).id ?? `${(box as any).date}-${(box as any).homeTeamId}-${(box as any).awayTeamId}`));
    }
    return games.size;
  };
  const careerGamesFor = (player: NBAPlayer, league: string): number => {
    const statGP = computeCareerGP(player);
    if (league !== 'PBA') return statGP;
    return Math.max(statGP, countPbaBoxScoreGP(player));
  };

  const updated = players.map(p => {
    const status = (p as any).status ?? '';
    if (!EXTERNAL_FOR_RETIRE.has(status)) return p;
    if ((p as any).diedYear) return p;

    const age = p.born?.year
      ? year - p.born.year
      : (typeof p.age === 'number' && p.age > 0 ? p.age : 0);
    const ovr = p.overallRating ?? 60;

    const performance = status === 'PBA' ? getRecentExternalPerformance(p, year) : undefined;
    const prob = getExternalRetirementProbability(status, age, ovr, performance);

    if (prob <= 0) return p;

    const roll = seededRandom(`retire_ext_${p.internalId}_${year}`);
    if (roll >= prob) return p;

    const careerGP = careerGamesFor(p, status);
    const country = getPlayerCountry(p);
    retirees.push({ player: { ...p } as NBAPlayer, league: status, country, careerGP });

    // Fix 2: track college outflow so replacements get league-appropriate schools
    const college = (p as any).college ?? '';
    if (college) {
      recordRetiredCollege(status, college);
    }

    historyEntries.push({
      text: careerGP > 0
        ? `${p.name} retired from the ${status} after ${careerGP} career games.`
        : `${p.name} retired from the ${status} after his ${status} career.`,
      date: stateDate,
      type: 'Retirement',
      playerIds: [p.internalId],
      eventType: 'retirement',
      personId: p.personId,
      sourceIds: p.sourceIds,
      league: status,
      tid: p.tid >= 0 ? p.tid : undefined,
      teamIds: p.tid >= 0 ? [p.tid] : undefined,
    });

    console.log(`[ExternalRetire] ${p.name} (${country}, age ${age}, OVR ${ovr}, ${status}) → RETIRED`);

    return {
      ...p,
      status: 'Retired' as const,
      tid: -1,
      retiredYear: year,
      retiredFromLeague: status,
      hofLeague: status === 'PBA' || status === 'WNBA' ? status : undefined,
      farewellTour: undefined,
      contract: undefined,
    } as any as NBAPlayer;
  });

  return { players: updated, retirees, historyEntries };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #2 — Minimum 12 per team (safety net — runs at init + end of rollover)
// ═══════════════════════════════════════════════════════════════════════════════

export function enforceExternalMinRoster(
  state: GameState & { nonNBATeams?: any[] },
  year: number,
): { additions: NBAPlayer[] } {
  const MIN_ROSTER = 12;
  const MAX_ROSTER = 15;
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const simulationSeed = getSimulationSeed(state);
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];

  // Fix 2: rebuild college frequency map from current roster
  initCollegeTracking(state.players);
  const additions: NBAPlayer[] = [];
  const usedPortraitUrls = createPortraitUsageSet(state.players.map(player => player.imgURL));

  for (const team of nonNBATeams) {
    if (!EXTERNAL_AUTO_FILL_LEAGUES.has(team.league)) continue;

    const currentCount =
      state.players.filter(p => p.tid === team.tid && (p as any).status !== 'Retired').length +
      additions.filter(p => p.tid === team.tid).length;

    const deficit = Math.min(MIN_ROSTER - currentCount, MAX_ROSTER - currentCount);
    if (deficit <= 0) continue;

    for (let i = 0; i < deficit; i++) {
      const rngBase = `safety_${simulationSeed}_${team.tid}_${year}_${i}`;

      // Journeymen ages: 26:0.30, 27:0.25, 28:0.20, 29:0.15, 30:0.10
      const rngAge = seededRandom(rngBase + '_age');
      let targetAge = 30;
      const ageTable: [number, number][] = [[26, 0.30], [27, 0.55], [28, 0.75], [29, 0.90], [30, 1.00]];
      for (const [a, cumulative] of ageTable) {
        if (rngAge <= cumulative) { targetAge = a; break; }
      }

      // Nationality: sample from existing league players for bio realism
      const country = sampleTeamCountry(
        team.league,
        team,
        nonNBATeams,
        [...state.players, ...additions],
        seededRandom(rngBase + '_nat'),
      ) || (ADULT_DIRECT_NATIONALITY[team.league] ?? '');

      const player = spawnExternalPlayer({
        league: team.league,
        targetAge,
        year,
        rngBase,
        tid: team.tid,
        team,
        salaryCap,
        isYouth: false, // safety net always spawns adult journeymen
        country,
        usedPortraitUrls,
      });
      if (player) additions.push(player);
    }
  }

  if (additions.length > 0) {
    console.log(`[ExternalSustainer] enforceExternalMinRoster: +${additions.length} safety players`);
  }
  return { additions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #3 — Two-track repopulation (1:1 nationality matching)
// ═══════════════════════════════════════════════════════════════════════════════

export function repopulateExternalLeagues(
  state: GameState & { nonNBATeams?: any[] },
  retirees: ExternalRetireeRecord[],
  year: number,
  nextYear: number,
): { additions: NBAPlayer[] } {
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const simulationSeed = getSimulationSeed(state);
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];
  const additions: NBAPlayer[] = [];
  const usedPortraitUrls = createPortraitUsageSet(state.players.map(player => player.imgURL));

  // ── Build outflow per league × country ─────────────────────────────────────
  // outflow[league][country] = count of players who left
  const outflow: Record<string, Record<string, number>> = {};

  // Retirees — already have country from retireExternalLeaguePlayers
  for (const r of retirees) {
    if (!EXTERNAL_AUTO_FILL_LEAGUES.has(r.league)) continue;
    const country = r.country || sampleLeagueCountry(r.league, nonNBATeams, state.players, 0.5);
    outflow[r.league] = outflow[r.league] ?? {};
    outflow[r.league][country] = (outflow[r.league][country] ?? 0) + 1;
  }

  // 19y auto-declarers this rollover: born.year === year - 18 (turned 19 at this rollover)
  const externalTeamByTid = new Map(nonNBATeams
    .filter(team => EXTERNAL_AUTO_FILL_LEAGUES.has(team.league))
    .map(team => [Number(team.tid), team] as const));
  const declarers = state.players.filter(p =>
    p.tid === -2 &&
    (p as any).status === 'Draft Prospect' &&
    ((p as any).draft?.year ?? 0) === nextYear &&
    ((p.born?.year ?? 0) === year - 18) &&
    p.preDraftClub?.tid != null &&
    externalTeamByTid.has(Number(p.preDraftClub.tid)),
  );
  for (const d of declarers) {
    const sourceTeam = externalTeamByTid.get(Number(d.preDraftClub?.tid));
    if (!sourceTeam) continue;
    const country = getPlayerCountry(d);
    const homeLeague = sourceTeam.league;
    if (homeLeague && EXTERNAL_AUTO_FILL_LEAGUES.has(homeLeague)) {
      outflow[homeLeague] = outflow[homeLeague] ?? {};
      outflow[homeLeague][country] = (outflow[homeLeague][country] ?? 0) + 1;
    }
  }

  // ── Spawn replacements 1:1 by league × country ─────────────────────────────
  let spawnIdx = 0;
  for (const [league, countryMap] of Object.entries(outflow)) {
    const leagueTeams = nonNBATeams.filter(t => t.league === league);
    if (leagueTeams.length === 0) continue;
    const isYouth = WITH_YOUTH_LEAGUES.has(league);

    for (const [country, count] of Object.entries(countryMap)) {
      for (let i = 0; i < count; i++) {
        const rngBase = `repop_${simulationSeed}_${league.replace(/[\s-]/g, '')}_${year}_${spawnIdx++}`;

        if (isYouth) {
          // Track A: spawn 15-18yo at a youth-club team
          const rngAge = seededRandom(rngBase + '_yage');
          const youthAge = rngAge < 0.25 ? 15 : rngAge < 0.55 ? 16 : rngAge < 0.80 ? 17 : 18;

          const team = pickTeamForGeneratedPlayer(leagueTeams, state.players, additions, country, rngBase + '_team');
          if (!team) continue;
          const spawnCountry = sampleTeamCountry(
            league,
            team,
            nonNBATeams,
            [...state.players, ...additions],
            seededRandom(rngBase + '_spawn_nat'),
          ) || country;

          const player = spawnExternalPlayer({ league, targetAge: youthAge, year, rngBase, tid: team.tid, team, salaryCap, isYouth: true, country: spawnCountry, usedPortraitUrls });
          if (player) additions.push(player);
        } else {
          // Track B: adult-direct (PBA, China CBA) — 22-26yo
          const rngAge = seededRandom(rngBase + '_aage');
          const adultAge = rngAge < 0.30 ? 22 : rngAge < 0.55 ? 23 : rngAge < 0.75 ? 24 : rngAge < 0.90 ? 25 : 26;

          const team = pickTeamForGeneratedPlayer(leagueTeams, state.players, additions, country, rngBase + '_team');
          if (!team) continue;
          const spawnCountry = sampleTeamCountry(
            league,
            team,
            nonNBATeams,
            [...state.players, ...additions],
            seededRandom(rngBase + '_spawn_nat'),
          ) || country;

          const player = spawnExternalPlayer({ league, targetAge: adultAge, year, rngBase, tid: team.tid, team, salaryCap, isYouth: false, country: spawnCountry, usedPortraitUrls });
          if (player) additions.push(player);
        }
      }
    }
  }

  if (additions.length > 0) {
    const summary = Object.entries(outflow).map(([l, cm]) =>
      `${l}:${Object.values(cm).reduce((a, b) => a + b, 0)}`).join(', ');
    console.log(`[ExternalSustainer] repopulate: +${additions.length} players (${summary})`);
  }

  return { additions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #3b — Undrafted-returns-home (call after autoRunDraft)
// ═══════════════════════════════════════════════════════════════════════════════

export function returnUndraftedToHomeLeague(
  players: NBAPlayer[],
  draftYear: number,
  state: GameState & { nonNBATeams?: any[] },
): {
  players: NBAPlayer[];
  historyEntries: ExternalHistoryEntry[];
  euroScouting?: GameState['euroScouting'];
} {
  const EXTERNAL_LEAGUES = new Set(EXTERNAL_MENS_LEAGUE_STATUSES);
  const DOMESTIC = new Set(['USA', 'Canada', '']);
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const historyEntries: ExternalHistoryEntry[] = [];
  const returnedAcademyPlayers: NBAPlayer[] = [];
  const returnedAcademyIds = new Set<string>();

  const updated = players.map(p => {
    if (p.tid !== -1 || (p as any).status !== 'Free Agent') return p;
    const draft = (p as any).draft ?? {};
    if (draft.year !== draftYear || draft.round !== 0) return p;

    const exactTeam = p.preDraftClub?.tid != null
      ? nonNBATeams.find(team => team.tid === p.preDraftClub?.tid)
      : undefined;
    const country = getPlayerCountry(p);
    if (!exactTeam && DOMESTIC.has(country)) return p;

    const homeLeague = exactTeam?.league
      ?? resolveNationalityLeague(country, seededRandom(`undrafted_${p.internalId}_rng`));
    if (!homeLeague || !EXTERNAL_LEAGUES.has(homeLeague)) return p;

    const leagueTeams = nonNBATeams.filter(t => t.league === homeLeague);
    if (leagueTeams.length === 0) return p;

    const team = exactTeam ?? pickUnderRosteredTeam(leagueTeams, players);
    if (!team) return p;

    const scale = EXTERNAL_SALARY_SCALE[homeLeague] ?? { minPct: 0.001, maxPct: 0.005 };
    const salaryUSD = Math.round(salaryCap * (scale.minPct * 1.5));

    historyEntries.push({
      text: `${p.name} returned to the ${homeLeague} after going undrafted in the ${draftYear} NBA Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [p.internalId],
      eventType: 'transaction',
      personId: p.personId,
      sourceIds: p.sourceIds,
      league: homeLeague,
      tid: Number(team.tid ?? team.id),
      teamIds: [Number(team.tid ?? team.id)],
    });

    const returned = {
      ...p,
      tid: team.tid,
      status: homeLeague as NBAPlayer['status'],
      preDraftClub: undefined,
      contract: {
        amount: Math.round(salaryUSD / 1_000),
        exp: draftYear + 1,
      },
    } as NBAPlayer;
    if (p.preDraftClub?.rosterBucket === 'academy') {
      returnedAcademyIds.add(p.internalId);
      returnedAcademyPlayers.push({
        ...returned,
        euroAcademyPlayer: true,
        promotedFromAcademy: undefined,
      });
    }
    return returned;
  });

  if (historyEntries.length > 0) {
    console.log(`[ExternalSustainer] returnUndrafted: ${historyEntries.length} players returned home from ${draftYear} draft`);
  }

  const euroScouting = returnedAcademyPlayers.length > 0 && state.euroScouting
    ? {
        ...state.euroScouting,
        academyPlayers: [
          ...state.euroScouting.academyPlayers.filter(player => !returnedAcademyIds.has(player.internalId)),
          ...returnedAcademyPlayers,
        ] as GameState['euroScouting']['academyPlayers'],
      }
    : state.euroScouting;

  return {
    players: updated.filter(player => !returnedAcademyIds.has(player.internalId)),
    historyEntries,
    euroScouting,
  };
}
