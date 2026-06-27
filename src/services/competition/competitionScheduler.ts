import type { Game } from '../../types';
import type { CompetitionDayOfWeek, CompetitionSpec } from './types';
import { selectEuroleagueParticipants } from '../../utils/euroleagueQualification';
import { getActivePbaCompetitionId } from '../../utils/uiMode';
import { dateForCompetitionSeason } from './competitionSeasonState';

type CompetitionTeamSource = {
  nonNBATeams?: Array<{ tid: number; league?: string; pop?: number }>;
  clubAliasMap?: Record<number, number>;
  userTeamId?: number | null;
};

type CompetitionScheduleRepairState = CompetitionTeamSource & {
  date: string;
  schedule: Game[];
  leagueStats?: { uiMode?: string; pbaConference?: string; pbaConferencePhase?: string } | null;
};

const DAY_TO_INDEX: Record<CompetitionDayOfWeek, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const iso = (date: Date) => date.toISOString();

function uniqueTids(tids: number[]): number[] {
  return [...new Set(tids.filter(tid => tid >= 100))];
}

function capTeamCount(tids: number[], count?: number, userTeamId?: number | null): number[] {
  if (!count || tids.length <= count) return tids;
  const capped = tids.slice(0, count);
  if (userTeamId == null || capped.includes(userTeamId) || !tids.includes(userTeamId)) return capped;
  return [...capped.slice(0, -1), userTeamId];
}

export function selectCompetitionTeamTids(spec: CompetitionSpec, source: CompetitionTeamSource): number[] {
  const teams = source.nonNBATeams ?? [];
  if (spec.teamSelector === 'allEndesa') {
    return capTeamCount(uniqueTids(teams.filter(t => t.league === 'Endesa').map(t => t.tid)), spec.teamCount, source.userTeamId);
  }
  if (spec.teamSelector === 'allEuroleague') {
    return selectEuroleagueParticipants(source, spec.teamCount).tids;
  }
  // Domestic-cup selectors (Supercopa, Copa del Rey) — Endesa-only, sorted by
  // market size as a stand-in for "qualified contender". Real Supercopa uses
  // top 4 from the previous Endesa season, but for a fresh save and to keep
  // the selector deterministic we pick the largest-population clubs (Real,
  // Barça, Valencia, Málaga …).
  if (spec.teamSelector === 'supercopaQualified' || spec.teamSelector === 'top8EndesaMidseason') {
    const ranked = teams
      .filter(t => t.league === 'Endesa')
      .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
      .map(t => t.tid);
    return capTeamCount(uniqueTids(ranked), spec.teamCount, source.userTeamId);
  }
  if (spec.teamSelector === 'allPBA') {
    return capTeamCount(uniqueTids(teams.filter(t => t.league === 'PBA').map(t => t.tid)), spec.teamCount, source.userTeamId);
  }
  // Fallback: Endesa clubs only. Previously this fell through to "Endesa OR
  // Euroleague" which let Anadolu Efes / Panathinaikos / AEK end up in the
  // Supercopa bracket — never what a domestic Spanish tournament wants.
  return capTeamCount(
    uniqueTids(teams.filter(t => t.league === 'Endesa').map(t => t.tid)),
    spec.teamCount,
    source.userTeamId,
  );
}

function nextSlot(date: Date, days: CompetitionDayOfWeek[]): Date {
  const allowed = new Set(days.map(d => DAY_TO_INDEX[d]));
  const cursor = new Date(date);
  for (let i = 0; i < 14; i++) {
    if (allowed.has(cursor.getUTCDay())) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor;
}

function makeGame(gid: number, homeTid: number, awayTid: number, date: Date, spec: CompetitionSpec, phase: string): Game {
  return {
    gid,
    homeTid,
    awayTid,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: iso(date),
    competitionId: spec.id,
    competitionPhase: phase,
  };
}

function nextRoundDate(date: Date, days: CompetitionDayOfWeek[]): Date {
  const cursor = new Date(date);
  cursor.setUTCDate(cursor.getUTCDate() + 7);
  return nextSlot(cursor, days);
}

function inferCompetitionSeason(spec: CompetitionSpec, seasonStart: Date): number {
  const crossesCalendarYear =
    spec.seasonStart.month > spec.seasonEnd.month ||
    (spec.seasonStart.month === spec.seasonEnd.month && spec.seasonStart.day > spec.seasonEnd.day);
  return crossesCalendarYear ? seasonStart.getUTCFullYear() + 1 : seasonStart.getUTCFullYear();
}

function allAllowedDates(start: Date, end: Date, days: CompetitionDayOfWeek[]): Date[] {
  const allowed = new Set(days.map(d => DAY_TO_INDEX[d]));
  const cursor = new Date(start);
  const dates: Date[] = [];
  while (cursor.getTime() <= end.getTime()) {
    if (allowed.has(cursor.getUTCDay())) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates.length > 0 ? dates : [new Date(start)];
}

function buildRoundRobinPairs(spec: CompetitionSpec, teams: { tid: number }[]): Array<{ homeTid: number; awayTid: number; round: number }> {
  const pool = teams.length % 2 === 0 ? [...teams] : [...teams, { tid: -1 }];
  const rounds = pool.length - 1;
  const requestedGamesPerTeam = Number(spec.gamesPerTeam ?? rounds);
  const firstLegRounds = requestedGamesPerTeam > 0 && requestedGamesPerTeam < rounds
    ? Math.max(1, Math.floor(requestedGamesPerTeam))
    : rounds;
  const half = pool.length / 2;
  const pairs: Array<{ homeTid: number; awayTid: number; round: number }> = [];
  const buildLeg = (reverseHomeAway: boolean) => {
    let rotation = [...pool];
    const roundLimit = reverseHomeAway ? rounds : firstLegRounds;
    for (let round = 1; round <= roundLimit; round++) {
      for (let i = 0; i < half; i++) {
        const a = rotation[i];
        const b = rotation[rotation.length - 1 - i];
        if (a.tid !== -1 && b.tid !== -1) {
          pairs.push({
            homeTid: reverseHomeAway ? b.tid : a.tid,
            awayTid: reverseHomeAway ? a.tid : b.tid,
            round: reverseHomeAway ? rounds + round : round,
          });
        }
      }
      rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1)];
    }
  };
  buildLeg(false);
  if (requestedGamesPerTeam >= (teams.length - 1) * 2) buildLeg(true);
  return pairs;
}

function pbaDenseRoundRobin(spec: CompetitionSpec, teams: { tid: number }[], seasonStart: Date, gidStart: number): Game[] {
  const days: CompetitionDayOfWeek[] = spec.daysOfWeek?.length ? spec.daysOfWeek : ['Wed', 'Fri', 'Sat', 'Sun'];
  const season = inferCompetitionSeason(spec, seasonStart);
  const firstPostseasonRound = spec.playoffFormat?.rounds?.[0];
  const regularEndIso = firstPostseasonRound
    ? dateForCompetitionSeason(spec, season, firstPostseasonRound.start.month, firstPostseasonRound.start.day)
    : dateForCompetitionSeason(spec, season, spec.seasonEnd.month, spec.seasonEnd.day);
  const regularEnd = new Date(regularEndIso);
  if (firstPostseasonRound) regularEnd.setUTCDate(regularEnd.getUTCDate() - 1);
  const slots = allAllowedDates(nextSlot(seasonStart, days), regularEnd, days);
  const pairs = buildRoundRobinPairs(spec, teams);
  const maxGamesPerDate = Math.max(2, Math.ceil(pairs.length / Math.max(1, slots.length)));
  const dayCounts = new Map<string, number>();
  const teamsByDay = new Map<string, Set<number>>();
  const games: Game[] = [];
  let gid = gidStart;
  let cursor = 0;

  for (const pair of pairs) {
    let selectedIndex = -1;
    for (let offset = 0; offset < slots.length; offset++) {
      const idx = (cursor + offset) % slots.length;
      const key = slots[idx].toISOString().slice(0, 10);
      const teamsOnDate = teamsByDay.get(key) ?? new Set<number>();
      if ((dayCounts.get(key) ?? 0) < maxGamesPerDate && !teamsOnDate.has(pair.homeTid) && !teamsOnDate.has(pair.awayTid)) {
        selectedIndex = idx;
        break;
      }
    }
    if (selectedIndex < 0) {
      for (let offset = 0; offset < slots.length; offset++) {
        const idx = (cursor + offset) % slots.length;
        const key = slots[idx].toISOString().slice(0, 10);
        if ((dayCounts.get(key) ?? 0) < maxGamesPerDate) {
          selectedIndex = idx;
          break;
        }
      }
    }
    if (selectedIndex < 0) selectedIndex = cursor % slots.length;
    const date = slots[selectedIndex];
    const key = date.toISOString().slice(0, 10);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    const teamsOnDate = teamsByDay.get(key) ?? new Set<number>();
    teamsOnDate.add(pair.homeTid);
    teamsOnDate.add(pair.awayTid);
    teamsByDay.set(key, teamsOnDate);
    games.push(makeGame(gid++, pair.homeTid, pair.awayTid, date, spec, `r${pair.round}`));
    cursor = (selectedIndex + 1) % slots.length;
  }
  return games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid);
}

function roundRobin(spec: CompetitionSpec, teams: { tid: number }[], seasonStart: Date, gidStart: number): Game[] {
  const games: Game[] = [];
  const days: CompetitionDayOfWeek[] = spec.daysOfWeek?.length ? spec.daysOfWeek : ['Sat'];
  let gid = gidStart;
  let date = nextSlot(seasonStart, days);

  const pool = teams.length % 2 === 0 ? [...teams] : [...teams, { tid: -1 }];
  const rounds = pool.length - 1;
  const requestedGamesPerTeam = Number(spec.gamesPerTeam ?? rounds);
  const firstLegRounds = requestedGamesPerTeam > 0 && requestedGamesPerTeam < rounds
    ? Math.max(1, Math.floor(requestedGamesPerTeam))
    : rounds;
  const half = pool.length / 2;
  const phaseForRound = (round: number) => spec.format === 'regular-league' ? `r${round}` : 'group';
  const buildLeg = (reverseHomeAway: boolean) => {
    let rotation = [...pool];
    const roundLimit = reverseHomeAway ? rounds : firstLegRounds;
    for (let round = 1; round <= roundLimit; round++) {
      for (let i = 0; i < half; i++) {
        const a = rotation[i];
        const b = rotation[rotation.length - 1 - i];
        if (a.tid !== -1 && b.tid !== -1) {
          const homeTid = reverseHomeAway ? b.tid : a.tid;
          const awayTid = reverseHomeAway ? a.tid : b.tid;
          games.push(makeGame(gid++, homeTid, awayTid, date, spec, phaseForRound(reverseHomeAway ? rounds + round : round)));
        }
      }
      date = nextRoundDate(date, days);
      rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1)];
    }
  };

  buildLeg(false);
  if (requestedGamesPerTeam >= (teams.length - 1) * 2) {
    buildLeg(true);
  }
  return games;
}

export function generateForCompetition(
  spec: CompetitionSpec,
  teams: { tid: number }[],
  seasonStart: Date,
  gidStart = 700_000,
): Game[] {
  if (teams.length < 2) return [];
  if (spec.format === 'regular-league' || spec.format === 'group-knockout') {
    if (spec.id.startsWith('pba-')) return pbaDenseRoundRobin(spec, teams, seasonStart, gidStart);
    return roundRobin(spec, teams, seasonStart, gidStart);
  }
  const days: CompetitionDayOfWeek[] = spec.daysOfWeek?.length ? spec.daysOfWeek : ['Sat'];
  let date = nextSlot(seasonStart, days);
  let gid = gidStart;
  const selected = teams.slice(0, spec.format === 'tournament' ? 4 : 8);
  const games: Game[] = [];
  // Only seed the FIRST bracket round here. Subsequent rounds (SF + Final for
  // 8-team knockouts, Final for 4-team tournaments) are written by
  // injectSingleEliminationProgression once the prior round has been played —
  // so the Final isn't hardcoded to seed[0]–seed[2] before SFs happen.
  for (let i = 0; i + 1 < selected.length; i += 2) {
    games.push(makeGame(gid++, selected[i].tid, selected[i + 1].tid, date, spec, selected.length > 4 ? 'qf' : 'sf'));
    date = nextSlot(new Date(date.getTime() + 86_400_000), days);
  }
  return games;
}

/**
 * Generates preseason friendlies for a competition (regular-league / group-knockout only).
 * Each club gets ~2 exhibitions in the 14 days before seasonStart. Marked
 * `isPreseason: true` with NO `competitionId` so they:
 *   - route through `engine.ts` pickIntlKnobs as preseason-exhibition (12-min quarters)
 *   - get skipped by `postProcessor.ts` stat aggregation (no career-stat pollution)
 *   - are ignored by `competitionResolver` (no W-L or standings impact)
 * Mirrors the NBA `gameScheduler.ts` 15-day preseason block for the external leagues.
 */
export function generatePreseasonFriendlies(
  spec: CompetitionSpec,
  teams: { tid: number }[],
  scheduleYear: number,
  gidStart = 750_000,
): Game[] {
  if (teams.length < 2) return [];
  if (spec.format !== 'regular-league' && spec.format !== 'group-knockout') return [];

  const seasonStart = new Date(Date.UTC(
    scheduleYear - 1,
    spec.seasonStart.month - 1,
    spec.seasonStart.day,
  ));
  const windowStart = new Date(seasonStart);
  windowStart.setUTCDate(windowStart.getUTCDate() - 14);

  // Two passes: each team plays once as home, once as away.
  const pool = [...teams].sort(() => Math.random() - 0.5);
  const games: Game[] = [];
  let gid = gidStart;

  const buildPass = (reverseHA: boolean, passOffset: number) => {
    const ordered = reverseHA ? [...pool].reverse() : pool;
    for (let i = 0; i < Math.floor(ordered.length / 2); i++) {
      const a = ordered[i].tid;
      const b = ordered[ordered.length - 1 - i].tid;
      if (a === b) continue;
      const dayOffset = passOffset + (i % 7);
      const date = new Date(windowStart);
      date.setUTCDate(windowStart.getUTCDate() + dayOffset);
      games.push({
        gid: gid++,
        homeTid: reverseHA ? b : a,
        awayTid: reverseHA ? a : b,
        homeScore: 0,
        awayScore: 0,
        played: false,
        date: iso(date),
        isPreseason: true,
      } as Game);
    }
  };

  buildPass(false, 0);
  buildPass(true, 7);
  return games;
}

function expectedRegularSeasonGames(spec: CompetitionSpec, teamCount: number): number {
  if (teamCount < 2) return 0;
  const gamesPerTeam = Math.floor(Number(spec.gamesPerTeam ?? teamCount - 1));
  if (gamesPerTeam > 0 && gamesPerTeam < teamCount - 1) {
    return Math.floor((teamCount * gamesPerTeam) / 2);
  }
  const singleRoundRobin = (teamCount * (teamCount - 1)) / 2;
  return (spec.gamesPerTeam ?? 0) >= (teamCount - 1) * 2 ? singleRoundRobin * 2 : singleRoundRobin;
}

function gameKey(game: Pick<Game, 'homeTid' | 'awayTid'>): string {
  return `${game.homeTid}->${game.awayTid}`;
}

function shouldHandleCompetitionSpec(state: CompetitionScheduleRepairState, spec: CompetitionSpec): boolean {
  const activePbaId = getActivePbaCompetitionId(state);
  if (!spec.id.startsWith('pba-')) return true;
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return true;
  return activePbaId === spec.id;
}

function pruneInactivePbaGames(schedule: Game[], state: CompetitionScheduleRepairState): Game[] {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return schedule;
  const activePbaId = getActivePbaCompetitionId(state);
  return schedule.filter(game =>
    !String(game.competitionId ?? '').startsWith('pba-') ||
    game.played ||
    (activePbaId != null && game.competitionId === activePbaId),
  );
}

export function repairCompetitionSchedules(
  state: CompetitionScheduleRepairState,
  specs: CompetitionSpec[] = [],
  season: number,
): Game[] {
  let schedule = pruneInactivePbaGames([...state.schedule], state);
  let nextGid = Math.max(700_000, ...schedule.map(game => game.gid)) + 1;

  for (const spec of specs.filter(s => (s.format === 'regular-league' || s.format === 'group-knockout') && shouldHandleCompetitionSpec(state, s))) {
    const teamTids = selectCompetitionTeamTids(spec, state);
    const expected = expectedRegularSeasonGames(spec, teamTids.length);
    if (expected === 0) continue;

    const seasonStart = dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day);
    const seasonEnd = dateForCompetitionSeason(spec, season, spec.seasonEnd.month, spec.seasonEnd.day);
    const current = schedule.filter(game => game.competitionId === spec.id);
    const regularCurrent = current.filter(game => game.competitionPhase === 'group' || game.competitionPhase?.startsWith('r'));
    const otherCurrent = current.filter(game => !(game.competitionPhase === 'group' || game.competitionPhase?.startsWith('r')));
    const inWindow = regularCurrent.filter(game => game.date >= seasonStart && game.date <= seasonEnd);
    const participants = new Set(regularCurrent.flatMap(game => [game.homeTid, game.awayTid]));
    const isSparse = inWindow.length < Math.floor(expected * 0.8) || teamTids.some(tid => !participants.has(tid));
    const unplayedRegular = regularCurrent.filter(game => !game.played);
    const isOverScheduled = inWindow.length > expected && unplayedRegular.length > 0;
    if (!isSparse && !isOverScheduled) continue;

    const played = regularCurrent.filter(game => game.played);
    const playedKeys = new Set(played.map(gameKey));
    const repairStart = new Date(Math.max(new Date(seasonStart).getTime(), new Date(state.date).getTime()));
    const regenerated = generateForCompetition(spec, teamTids.map(tid => ({ tid })), repairStart, nextGid)
      .filter(game => !playedKeys.has(gameKey(game)));
    nextGid += regenerated.length;
    schedule = [
      ...schedule.filter(game => game.competitionId !== spec.id),
      ...otherCurrent,
      ...played,
      ...regenerated,
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid);
  }

  return schedule;
}
