import type { Game } from '../../types';
import type { CompetitionDayOfWeek, CompetitionSpec } from './types';
import { selectEuroleagueParticipants } from '../../utils/euroleagueQualification';
import { normalizeDate } from '../../utils/helpers';
import { getActivePbaCompetitionId } from '../../utils/uiMode';
import { dateForCompetitionSeason, matchesScheduleSeason } from './competitionSeasonState';
import { deconflictCompetitionSchedules } from './competitionScheduleDeconflict';
import { selectQualifiedDomesticCupTids } from './domesticCupStandings';

export { deconflictCompetitionSchedules } from './competitionScheduleDeconflict';

type CompetitionTeamSource = {
  nonNBATeams?: Array<{ tid: number; league?: string; endesaRelegated?: boolean }>;
  clubAliasMap?: Record<number, number>;
  euroleagueSeededTids?: number[];
  euroleagueSeedSeason?: number;
  euroCompetitionTeamTids?: Record<string, number[]>;
  euroleagueSelectionSeason?: number;
  leagueStats?: { year?: number; uiMode?: string; pbaConference?: string; pbaConferencePhase?: string } | null;
  userTeamId?: number | null;
  schedule?: Game[];
};

type CompetitionScheduleRepairState = CompetitionTeamSource & {
  date: string;
  schedule: Game[];
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
  const qualifiedCupTids = selectQualifiedDomesticCupTids(spec, source);
  if (qualifiedCupTids?.length) return qualifiedCupTids;
  const seededSourceTids = source.euroCompetitionTeamTids?.[spec.id];
  if (seededSourceTids?.length) {
    return capTeamCount(uniqueTids(seededSourceTids), spec.teamCount, source.userTeamId);
  }
  const activeEndesaTeams = teams.filter(team => team.league === 'Endesa' && team.endesaRelegated !== true);
  if (spec.teamSelector === 'allEndesa') {
    return capTeamCount(uniqueTids(activeEndesaTeams.map(team => team.tid)), spec.teamCount, source.userTeamId);
  }
  if (spec.teamSelector === 'allEuroleague') {
    return selectEuroleagueParticipants(source, spec.teamCount).tids;
  }
  if (spec.teamSelector === 'allPBA') {
    return uniqueTids(teams.filter(t => t.league === 'PBA').map(t => t.tid));
  }
  if (spec.teamSelector.startsWith('league:')) {
    const league = spec.teamSelector.slice('league:'.length);
    return capTeamCount(uniqueTids(teams.filter(team => team.league === league).map(team => team.tid)), spec.teamCount, source.userTeamId);
  }
  return capTeamCount(
    uniqueTids(activeEndesaTeams.map(team => team.tid)),
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
    season: inferCompetitionSeason(spec, date),
    competitionId: spec.id,
    competitionPhase: phase,
  };
}

function nextRoundDate(date: Date, days: CompetitionDayOfWeek[], spacingDays = 7): Date {
  const cursor = new Date(date);
  cursor.setUTCDate(cursor.getUTCDate() + Math.max(1, spacingDays));
  return nextSlot(cursor, days);
}

function inferCompetitionSeason(spec: CompetitionSpec, seasonStart: Date): number {
  if (!spec.id.startsWith('pba-')) {
    return seasonStart.getUTCMonth() + 1 >= 9
      ? seasonStart.getUTCFullYear() + 1
      : seasonStart.getUTCFullYear();
  }
  const crossesCalendarYear =
    spec.seasonStart.month > spec.seasonEnd.month ||
    (spec.seasonStart.month === spec.seasonEnd.month && spec.seasonStart.day > spec.seasonEnd.day);
  if (!crossesCalendarYear) return seasonStart.getUTCFullYear();
  return seasonStart.getUTCMonth() + 1 >= spec.seasonStart.month
    ? seasonStart.getUTCFullYear() + 1
    : seasonStart.getUTCFullYear();
}

function allAllowedDates(
  start: Date,
  end: Date,
  days: CompetitionDayOfWeek[],
  blackoutRanges: Array<{ start: Date; end: Date }> = [],
): Date[] {
  const allowed = new Set(days.map(d => DAY_TO_INDEX[d]));
  const cursor = new Date(start);
  const dates: Date[] = [];
  while (cursor.getTime() <= end.getTime()) {
    const blackedOut = blackoutRanges.some(range => cursor >= range.start && cursor <= range.end);
    if (allowed.has(cursor.getUTCDay()) && !blackedOut) dates.push(new Date(cursor));
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

function regularSeasonEnd(spec: CompetitionSpec, season: number): Date {
  const end = spec.regularSeasonEnd ?? spec.seasonEnd;
  return new Date(dateForCompetitionSeason(spec, season, end.month, end.day));
}

function spreadRoundDates(spec: CompetitionSpec, seasonStart: Date, roundCount: number): Date[] {
  const days: CompetitionDayOfWeek[] = spec.daysOfWeek?.length ? spec.daysOfWeek : ['Sat'];
  const first = nextSlot(seasonStart, days);
  if (spec.roundSpacingDays) {
    const dates = [first];
    while (dates.length < roundCount) {
      dates.push(nextRoundDate(dates[dates.length - 1], days, spec.roundSpacingDays));
    }
    return dates;
  }
  const season = inferCompetitionSeason(spec, seasonStart);
  const blackoutRanges = (spec.blackoutPeriods ?? []).map(period => ({
    start: new Date(dateForCompetitionSeason(spec, season, period.start.month, period.start.day)),
    end: new Date(dateForCompetitionSeason(spec, season, period.end.month, period.end.day)),
  }));
  const slots = allAllowedDates(first, regularSeasonEnd(spec, season), days, blackoutRanges);
  if (roundCount <= 1) return [slots[0]];
  return Array.from({ length: roundCount }, (_, index) =>
    slots[Math.round((index * (slots.length - 1)) / (roundCount - 1))],
  );
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
  const pairs = buildRoundRobinPairs(spec, teams);
  const rounds = [...new Set(pairs.map(pair => pair.round))].sort((a, b) => a - b);
  const dates = spreadRoundDates(spec, seasonStart, rounds.length);
  const dateByRound = new Map(rounds.map((round, index) => [round, dates[index]]));
  let gid = gidStart;
  const phaseForRound = (round: number) => spec.format === 'regular-league' ? `r${round}` : 'group';
  return pairs.map(pair => makeGame(
    gid++,
    pair.homeTid,
    pair.awayTid,
    dateByRound.get(pair.round) ?? dates[0] ?? seasonStart,
    spec,
    phaseForRound(pair.round),
  ));
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
    const groupCount = Math.min(Math.max(1, Math.floor(spec.groupCount ?? 1)), Math.floor(teams.length / 2));
    if (spec.format === 'group-knockout' && groupCount > 1) {
      const groups = Array.from({ length: groupCount }, () => [] as { tid: number }[]);
      teams.forEach((team, index) => groups[index % groupCount].push(team));
      let nextGid = gidStart;
      return groups.flatMap(group => {
        const games = roundRobin({ ...spec, groupCount: undefined }, group, seasonStart, nextGid);
        nextGid += games.length;
        return games;
      });
    }
    return roundRobin(spec, teams, seasonStart, gidStart);
  }
  const days: CompetitionDayOfWeek[] = spec.daysOfWeek?.length ? spec.daysOfWeek : ['Sat'];
  const date = nextSlot(seasonStart, days);
  let gid = gidStart;
  const selected = teams.slice(0, spec.format === 'tournament' ? 4 : 8);
  const games: Game[] = [];
  // Only seed the FIRST bracket round here. Subsequent rounds (SF + Final for
  // 8-team knockouts, Final for 4-team tournaments) are written by
  // injectSingleEliminationProgression once the prior round has been played —
  // so the Final isn't hardcoded to seed[0]–seed[2] before SFs happen.
  const seedPairs = selected.length === 8
    ? [[0, 7], [3, 4], [1, 6], [2, 5]]
    : selected.length === 4
      ? [[0, 3], [1, 2]]
      : Array.from({ length: Math.floor(selected.length / 2) }, (_, index) => [index * 2, index * 2 + 1]);
  for (const [left, right] of seedPairs) {
    games.push(makeGame(gid++, selected[left].tid, selected[right].tid, date, spec, selected.length > 4 ? 'qf' : 'sf'));
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
      games.push(buildPreseasonFriendlyGame({
        gid: gid++,
        homeTid: reverseHA ? b : a,
        awayTid: reverseHA ? a : b,
        date,
        season: scheduleYear,
      }));
    }
  };

  buildPass(false, 0);
  buildPass(true, 7);
  return games;
}

export function buildPreseasonFriendlyGame(input: {
  gid: number;
  homeTid: number;
  awayTid: number;
  date: Date | string;
  season: number;
}): Game {
  return {
    gid: input.gid,
    homeTid: input.homeTid,
    awayTid: input.awayTid,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: new Date(input.date).toISOString(),
    season: input.season,
    isPreseason: true,
    isExhibition: true,
    excludeFromRecord: true,
  };
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
    const teamTids = selectCompetitionTeamTids(spec, { ...state, schedule });
    const expected = expectedRegularSeasonGames(spec, teamTids.length);
    if (expected === 0) continue;

    const seasonStart = dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day);
    const current = schedule.filter(game =>
      game.competitionId === spec.id && matchesScheduleSeason(game, season),
    );
    const regularCurrent = current.filter(game => game.competitionPhase === 'group' || game.competitionPhase?.startsWith('r'));
    const participants = new Set(regularCurrent.flatMap(game => [game.homeTid, game.awayTid]));
    const isSparse = regularCurrent.length < Math.floor(expected * 0.8) || teamTids.some(tid => !participants.has(tid));
    const unplayedRegular = regularCurrent.filter(game => !game.played);
    const isOverScheduled = regularCurrent.length > expected && unplayedRegular.length > 0;
    if (!isSparse && !isOverScheduled) continue;

    const played = regularCurrent.filter(game => game.played);
    const playedKeys = new Set(played.map(gameKey));
    const repairStart = new Date(Math.max(new Date(seasonStart).getTime(), new Date(state.date).getTime()));
    const regenerated = generateForCompetition(spec, teamTids.map(tid => ({ tid })), repairStart, nextGid)
      .filter(game => !playedKeys.has(gameKey(game)));
    nextGid += regenerated.length;
    const currentRegularGids = new Set(regularCurrent.map(game => game.gid));
    schedule = [
      ...schedule.filter(game => !currentRegularGids.has(game.gid)),
      ...played,
      ...regenerated,
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid);
  }

  for (const spec of specs.filter(s => (s.format === 'knockout' || s.format === 'tournament') && shouldHandleCompetitionSpec(state, s))) {
    const seasonStart = dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day);
    const seasonEnd = dateForCompetitionSeason(spec, season, spec.seasonEnd.month, spec.seasonEnd.day);
    if (spec.qualificationRule === 'domestic-standings' && normalizeDate(state.date) < normalizeDate(seasonStart)) {
      schedule = schedule.filter(game => game.played || game.competitionId !== spec.id);
      continue;
    }
    const teamTids = selectCompetitionTeamTids(spec, { ...state, schedule });
    if (teamTids.length < 2) continue;
    const seasonGames = schedule.filter(game =>
      game.competitionId === spec.id && game.date >= seasonStart && game.date <= seasonEnd,
    );
    const initialPhase = teamTids.length > 4 ? 'qf' : 'sf';
    const initialRound = seasonGames.filter(game => game.competitionPhase === initialPhase);
    const expectedInitialGames = Math.floor(Math.min(teamTids.length, spec.format === 'tournament' ? 4 : 8) / 2);
    const repairInitialRound = seasonGames.length > 0
      && !seasonGames.some(game => game.played)
      && (
        initialRound.length !== expectedInitialGames
        || new Set(initialRound.map(game => normalizeDate(game.date))).size > 1
      );
    if ((seasonGames.length > 0 && !repairInitialRound) || new Date(state.date).getTime() > new Date(seasonEnd).getTime()) continue;
    const start = new Date(Math.max(new Date(seasonStart).getTime(), new Date(state.date).getTime()));
    const generated = generateForCompetition(spec, teamTids.map(tid => ({ tid })), start, nextGid);
    nextGid += generated.length;
    schedule = [
      ...schedule.filter(game => game.played || game.competitionId !== spec.id),
      ...generated,
    ].sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime() || left.gid - right.gid,
    );
  }

  return state.leagueStats?.uiMode === 'euro_isolated'
    ? deconflictCompetitionSchedules(schedule, specs)
    : schedule;
}
