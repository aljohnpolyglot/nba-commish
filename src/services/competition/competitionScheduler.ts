import type { Game } from '../../types';
import type { CompetitionDayOfWeek, CompetitionSpec } from './types';

type CompetitionTeamSource = {
  nonNBATeams?: Array<{ tid: number; league?: string; pop?: number }>;
  clubAliasMap?: Record<number, number>;
  userTeamId?: number | null;
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
  if (spec.teamSelector === 'allEndesa') {
    return capTeamCount(uniqueTids(teams.filter(t => t.league === 'Endesa').map(t => t.tid)), spec.teamCount, source.userTeamId);
  }
  if (spec.teamSelector === 'allEuroleague') {
    const euroTids = teams.filter(t => t.league === 'Euroleague').map(t => source.clubAliasMap?.[t.tid] ?? t.tid);
    const mergedClubTids = Object.values(source.clubAliasMap ?? {});
    return capTeamCount(uniqueTids([...euroTids, ...mergedClubTids]), spec.teamCount, source.userTeamId);
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

function roundRobin(spec: CompetitionSpec, teams: { tid: number }[], seasonStart: Date, gidStart: number): Game[] {
  const games: Game[] = [];
  const days: CompetitionDayOfWeek[] = spec.daysOfWeek?.length ? spec.daysOfWeek : ['Sat'];
  let gid = gidStart;
  let date = nextSlot(seasonStart, days);

  const pool = teams.length % 2 === 0 ? [...teams] : [...teams, { tid: -1 }];
  const rounds = pool.length - 1;
  const half = pool.length / 2;
  const phaseForRound = (round: number) => spec.format === 'regular-league' ? `r${round}` : 'group';
  const buildLeg = (reverseHomeAway: boolean) => {
    let rotation = [...pool];
    for (let round = 1; round <= rounds; round++) {
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
  if ((spec.gamesPerTeam ?? 0) >= (teams.length - 1) * 2) {
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

function dateForCompetitionSeason(season: number, month: number, day: number): string {
  return new Date(Date.UTC(month >= 9 ? season - 1 : season, month - 1, day)).toISOString();
}

function expectedRegularSeasonGames(spec: CompetitionSpec, teamCount: number): number {
  if (teamCount < 2) return 0;
  const singleRoundRobin = (teamCount * (teamCount - 1)) / 2;
  return (spec.gamesPerTeam ?? 0) >= (teamCount - 1) * 2 ? singleRoundRobin * 2 : singleRoundRobin;
}

function gameKey(game: Pick<Game, 'homeTid' | 'awayTid'>): string {
  return `${game.homeTid}->${game.awayTid}`;
}

export function repairCompetitionSchedules(
  state: CompetitionScheduleRepairState,
  specs: CompetitionSpec[] = [],
  season: number,
): Game[] {
  let schedule = [...state.schedule];
  let nextGid = Math.max(700_000, ...schedule.map(game => game.gid)) + 1;

  for (const spec of specs.filter(s => s.format === 'regular-league' || s.format === 'group-knockout')) {
    const teamTids = selectCompetitionTeamTids(spec, state);
    const expected = expectedRegularSeasonGames(spec, teamTids.length);
    if (expected === 0) continue;

    const seasonStart = dateForCompetitionSeason(season, spec.seasonStart.month, spec.seasonStart.day);
    const seasonEnd = dateForCompetitionSeason(season, spec.seasonEnd.month, spec.seasonEnd.day);
    const current = schedule.filter(game => game.competitionId === spec.id);
    const regularCurrent = current.filter(game => game.competitionPhase === 'group' || game.competitionPhase?.startsWith('r'));
    const inWindow = regularCurrent.filter(game => game.date >= seasonStart && game.date <= seasonEnd);
    const participants = new Set(regularCurrent.flatMap(game => [game.homeTid, game.awayTid]));
    const isSparse = inWindow.length < Math.floor(expected * 0.8) || teamTids.some(tid => !participants.has(tid));
    if (!isSparse) continue;

    const played = current.filter(game => game.played);
    const playedKeys = new Set(played.map(gameKey));
    const repairStart = new Date(Math.max(new Date(seasonStart).getTime(), new Date(state.date).getTime()));
    const regenerated = generateForCompetition(spec, teamTids.map(tid => ({ tid })), repairStart, nextGid)
      .filter(game => !playedKeys.has(gameKey(game)));
    nextGid += regenerated.length;
    schedule = [
      ...schedule.filter(game => game.competitionId !== spec.id),
      ...played,
      ...regenerated,
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid);
  }

  return schedule;
}
