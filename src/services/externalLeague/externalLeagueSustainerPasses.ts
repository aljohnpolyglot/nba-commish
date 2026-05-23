import type { GameState, NBAPlayer } from '../../types';
import { EXTERNAL_SALARY_SCALE } from '../../constants';
import {
  ADULT_DIRECT_NATIONALITY,
  type ExternalHistoryEntry,
  type ExternalRetireeRecord,
  getPlayerCountry,
  computeCareerGP,
  seededRandom,
  WITH_YOUTH_LEAGUES,
} from './externalLeagueIdentity';
import { initCollegeTracking, recordRetiredCollege, resolveNationalityLeague } from './externalLeagueRouting';
import {
  pickTeamForGeneratedPlayer,
  pickUnderRosteredTeam,
  sampleLeagueCountry,
  sampleTeamCountry,
  spawnExternalPlayer,
} from './externalLeagueSpawn';

export function ensureEuroUserAcademyProspects(
  state: GameState & { nonNBATeams?: any[] },
  year: number,
): { players: NBAPlayer[]; additions: NBAPlayer[] } {
  if (state.leagueStats?.uiMode !== 'euro_isolated' || state.gameMode !== 'gm' || state.userTeamId == null) {
    return { players: state.players ?? [], additions: [] };
  }

  const players = state.players ?? [];
  const team = (state.nonNBATeams ?? []).find((t: any) => (t.tid ?? t.id) === state.userTeamId);
  if (!team || !WITH_YOUTH_LEAGUES.has(team.league)) return { players, additions: [] };

  const teamAny = team as any;
  const academyBudget = Math.max(0, Math.min(5, teamAny.tycoon?.academyBudget ?? 2));
  if (academyBudget <= 0) return { players, additions: [] };

  const ageOf = (p: NBAPlayer) => p.born?.year ? year - p.born.year : ((p as any).age ?? 0);
  const existing = players.filter((p: any) => {
    if (p.tid !== state.userTeamId || p.promotedFromAcademy) return false;
    const age = ageOf(p);
    return age >= 15 && age <= 19;
  }).length;
  const academyLevel = Math.max(1, Math.min(5, teamAny.tycoon?.facilities?.academy?.level ?? 1));
  const target = Math.max(2, Math.min(8, 2 + academyBudget + Math.floor(academyLevel / 2)));
  if (existing >= target) return { players, additions: [] };

  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const additions: NBAPlayer[] = [];
  for (let i = existing; i < target; i++) {
    const rngBase = `user_academy_${team.tid}_${year}_${i}`;
    const ageRoll = seededRandom(`${rngBase}_age`);
    const targetAge = ageRoll < 0.20 ? 15 : ageRoll < 0.50 ? 16 : ageRoll < 0.78 ? 17 : 18;
    const country = sampleTeamCountry(
      team.league,
      team,
      state.nonNBATeams ?? [],
      [...players, ...additions],
      seededRandom(`${rngBase}_nat`),
    );
    const player = spawnExternalPlayer({
      league: team.league,
      targetAge,
      year,
      rngBase,
      tid: team.tid,
      team,
      salaryCap,
      isYouth: true,
      country,
    });
    if (player) additions.push(player);
  }

  return {
    players: additions.length > 0 ? [...players, ...additions] : players,
    additions,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #1 — External-league retirement pass
// ═══════════════════════════════════════════════════════════════════════════════

export function retireExternalLeaguePlayers(
  players: NBAPlayer[],
  year: number,
  stateDate: string,
): {
  players: NBAPlayer[];
  retirees: ExternalRetireeRecord[];
  historyEntries: ExternalHistoryEntry[];
} {
  const EXTERNAL_FOR_RETIRE = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League', 'WNBA',
  ]);
  const retirees: ExternalRetireeRecord[] = [];
  const historyEntries: ExternalHistoryEntry[] = [];

  const updated = players.map(p => {
    const status = (p as any).status ?? '';
    if (!EXTERNAL_FOR_RETIRE.has(status)) return p;
    if ((p as any).diedYear) return p;

    const age = p.born?.year
      ? year - p.born.year
      : (typeof p.age === 'number' && p.age > 0 ? p.age : 0);
    const ovr = p.overallRating ?? 60;

    let prob = 0;
    if (status === 'G-League') {
      if (age >= 35) prob = 1.0;
      else if (age >= 32 && ovr < 45) prob = 0.50;
      else if (age >= 30 && ovr < 40) prob = 0.30;
    } else if (status === 'PBA') {
      // PBA is a craft/finesse league — late 30s is PRIME (LA Tenorio, Paul Lee,
      // June Mar Fajardo all played starter-quality into their 40s). Only true
      // wash-outs retire; anyone still producing stays on indefinitely.
      if (age >= 46) prob = 1.0;
      else if (age >= 43 && ovr < 40) prob = 0.30;
      else if (age >= 40 && ovr < 35) prob = 0.15;
    } else if (status === 'China CBA' || status === 'NBL Australia') {
      // Similar finesse-pro leagues — careers into early 40s realistic
      if (age >= 44) prob = 1.0;
      else if (age >= 41 && ovr < 42) prob = 0.30;
      else if (age >= 38 && ovr < 38) prob = 0.15;
    } else if (status === 'WNBA') {
      // WNBA careers shorter than NBA — Sue Bird (40) and Diana Taurasi (40+)
      // are the outliers. Most stars retire 35-37, role players 32-34.
      if (age >= 41) prob = 1.0;
      else if (age >= 37 && ovr < 44) prob = 0.30;
      else if (age >= 34 && ovr < 38) prob = 0.18;
    } else {
      // Euroleague, Endesa, B-League — higher athletic demand, slightly earlier churn
      if (age >= 42) prob = 1.0;
      else if (age >= 39 && ovr < 42) prob = 0.30;
      else if (age >= 36 && ovr < 38) prob = 0.15;
    }

    if (prob <= 0) return p;

    const roll = seededRandom(`retire_ext_${p.internalId}_${year}`);
    if (roll >= prob) return p;

    const careerGP = computeCareerGP(p);
    const country = getPlayerCountry(p);
    retirees.push({ player: { ...p } as NBAPlayer, league: status, country, careerGP });

    // Fix 2: track college outflow so replacements get league-appropriate schools
    const college = (p as any).college ?? '';
    if (college) {
      recordRetiredCollege(status, college);
    }

    historyEntries.push({
      text: `${p.name} retired from the ${status} after ${careerGP} career games.`,
      date: stateDate,
      type: 'Retirement',
      playerIds: [p.internalId],
    });

    console.log(`[ExternalRetire] ${p.name} (${country}, age ${age}, OVR ${ovr}, ${status}) → RETIRED`);

    return {
      ...p,
      status: 'Retired' as const,
      retiredYear: year,
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
  const EXTERNAL_LEAGUES = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League', 'WNBA',
  ]);
  const MIN_ROSTER = 12;
  const MAX_ROSTER = 15;
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];

  // Fix 2: rebuild college frequency map from current roster
  initCollegeTracking(state.players);
  const additions: NBAPlayer[] = [];

  for (const team of nonNBATeams) {
    if (!EXTERNAL_LEAGUES.has(team.league)) continue;

    const currentCount =
      state.players.filter(p => p.tid === team.tid && (p as any).status !== 'Retired').length +
      additions.filter(p => p.tid === team.tid).length;

    const deficit = Math.min(MIN_ROSTER - currentCount, MAX_ROSTER - currentCount);
    if (deficit <= 0) continue;

    for (let i = 0; i < deficit; i++) {
      const rngBase = `safety_${team.tid}_${year}_${i}`;

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
  const EXTERNAL_LEAGUES = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League', 'WNBA',
  ]);
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];
  const additions: NBAPlayer[] = [];

  // ── Build outflow per league × country ─────────────────────────────────────
  // outflow[league][country] = count of players who left
  const outflow: Record<string, Record<string, number>> = {};

  // Retirees — already have country from retireExternalLeaguePlayers
  for (const r of retirees) {
    if (!EXTERNAL_LEAGUES.has(r.league)) continue;
    const country = r.country || sampleLeagueCountry(r.league, nonNBATeams, state.players, 0.5);
    outflow[r.league] = outflow[r.league] ?? {};
    outflow[r.league][country] = (outflow[r.league][country] ?? 0) + 1;
  }

  // 19y auto-declarers this rollover: born.year === year - 18 (turned 19 at this rollover)
  const declarers = state.players.filter(p =>
    p.tid === -2 &&
    (p as any).status === 'Draft Prospect' &&
    ((p as any).draft?.year ?? 0) === nextYear &&
    ((p.born?.year ?? 0) === year - 18),
  );
  for (const d of declarers) {
    const country = getPlayerCountry(d);
    const homeLeague = resolveNationalityLeague(country, 0.5);
    if (homeLeague && EXTERNAL_LEAGUES.has(homeLeague)) {
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
        const rngBase = `repop_${league.replace(/[\s-]/g, '')}_${year}_${spawnIdx++}`;

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

          const player = spawnExternalPlayer({ league, targetAge: youthAge, year, rngBase, tid: team.tid, team, salaryCap, isYouth: true, country: spawnCountry });
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

          const player = spawnExternalPlayer({ league, targetAge: adultAge, year, rngBase, tid: team.tid, team, salaryCap, isYouth: false, country: spawnCountry });
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
): { players: NBAPlayer[]; historyEntries: ExternalHistoryEntry[] } {
  const EXTERNAL_LEAGUES = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League',
  ]);  // WNBA intentionally excluded — undrafted-NBA-prospect routing is men's-only
  const DOMESTIC = new Set(['USA', 'Canada', '']);
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const historyEntries: ExternalHistoryEntry[] = [];

  const updated = players.map(p => {
    if (p.tid !== -1 || (p as any).status !== 'Free Agent') return p;
    const draft = (p as any).draft ?? {};
    if (draft.year !== draftYear || draft.round !== 0) return p;

    const country = getPlayerCountry(p);
    if (DOMESTIC.has(country)) return p;

    const homeLeague = resolveNationalityLeague(country, seededRandom(`undrafted_${p.internalId}_rng`));
    if (!homeLeague || !EXTERNAL_LEAGUES.has(homeLeague)) return p;

    const leagueTeams = nonNBATeams.filter(t => t.league === homeLeague);
    if (leagueTeams.length === 0) return p;

    const team = pickUnderRosteredTeam(leagueTeams, players);
    if (!team) return p;

    const scale = EXTERNAL_SALARY_SCALE[homeLeague] ?? { minPct: 0.001, maxPct: 0.005 };
    const salaryUSD = Math.round(salaryCap * (scale.minPct * 1.5));

    historyEntries.push({
      text: `${p.name} returned to the ${homeLeague} after going undrafted in the ${draftYear} NBA Draft.`,
      date: state.date ?? `Jun 30, ${draftYear}`,
      type: 'Draft',
      playerIds: [p.internalId],
    });

    return {
      ...p,
      tid: team.tid,
      status: homeLeague as NBAPlayer['status'],
      contract: {
        amount: Math.round(salaryUSD / 1_000),
        exp: draftYear + 1,
      },
    };
  });

  if (historyEntries.length > 0) {
    console.log(`[ExternalSustainer] returnUndrafted: ${historyEntries.length} players returned home from ${draftYear} draft`);
  }

  return { players: updated, historyEntries };
}
