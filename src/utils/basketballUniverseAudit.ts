import { PBA_COMPETITIONS } from '../data/templates/philippines/competitions';
import { SPAIN_COMPETITIONS } from '../data/templates/spain/competitions';
import { resolveCompetitionSeason } from '../services/competition/competitionResolver';
import { dateForCompetitionSeason } from '../services/competition/competitionSeasonState';
import { selectCompetitionTeamTids } from '../services/competition/competitionScheduler';
import type { CompetitionSpec } from '../services/competition/types';
import type { GameState } from '../types';
import { normalizeDate } from './helpers';
import { resolveAnyTeam } from './teamLookup';
import { getTeamFullName } from './teamNames';
import { logPbaLazySimAudit } from './pbaLazySimDebug';

const TAG = '[BASKETAUDIT]';
const PLAYOFF_PHASES = new Set(['play-in', 'qf', 'sf', 'final', 'quarterfinals', 'semifinals', 'final-four']);

function regularPhase(phase: unknown): boolean {
  const key = String(phase ?? '').toLowerCase();
  return !key || ['group', 'league', 'regular', 'regular-season'].includes(key) || key.startsWith('r');
}

function expectedRegularGames(spec: CompetitionSpec, teamCount: number): number {
  if (teamCount < 2) return 0;
  const gamesPerTeam = Math.floor(Number(spec.gamesPerTeam ?? teamCount - 1));
  if (gamesPerTeam > 0 && gamesPerTeam < teamCount - 1) return Math.floor((teamCount * gamesPerTeam) / 2);
  const singleRoundRobin = (teamCount * (teamCount - 1)) / 2;
  return (spec.gamesPerTeam ?? 0) >= (teamCount - 1) * 2 ? singleRoundRobin * 2 : singleRoundRobin;
}

function competitionEndDate(spec: CompetitionSpec, season: number): string {
  const rounds = spec.playoffFormat?.rounds ?? [];
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
  const end = lastRound?.end ?? spec.seasonEnd;
  return dateForCompetitionSeason(spec, season, end.month, end.day).slice(0, 10);
}

function competitionStartDate(spec: CompetitionSpec, season: number): string {
  return dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day).slice(0, 10);
}

function firstPlayoffDate(spec: CompetitionSpec, season: number): string {
  const round = spec.playoffFormat?.rounds?.find(entry =>
    PLAYOFF_PHASES.has(entry.phase) || entry.phase === 'quarterfinals' || entry.phase === 'final',
  );
  return round
    ? dateForCompetitionSeason(spec, season, round.start.month, round.start.day).slice(0, 10)
    : competitionEndDate(spec, season);
}

function inCompetitionSeason(game: any, spec: CompetitionSpec, season: number): boolean {
  const date = normalizeDate(game?.date);
  return date >= competitionStartDate(spec, season) && date <= competitionEndDate(spec, season);
}

function teamLabel(state: GameState, tid: number): string {
  const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  return team ? getTeamFullName(team) || team.abbrev || String(tid) : `tid${tid}`;
}

function buildCompetitionRows(state: GameState, specs: CompetitionSpec[], season: number) {
  const today = normalizeDate(state.date);
  return specs.map(spec => {
    const tids = selectCompetitionTeamTids(spec, state as any);
    const expected = expectedRegularGames(spec, tids.length);
    const schedule = (state.schedule ?? []).filter((game: any) =>
      game.competitionId === spec.id && inCompetitionSeason(game, spec, season),
    );
    const boxes = (state.boxScores ?? []).filter((game: any) =>
      game.competitionId === spec.id && inCompetitionSeason(game, spec, season),
    );
    const regularScheduled = schedule.filter((game: any) => regularPhase(game.competitionPhase));
    const regularPlayed = boxes.filter((game: any) => regularPhase(game.competitionPhase));
    const futureRegular = regularScheduled.filter((game: any) => !game.played && normalizeDate(game.date) >= today);
    const overdueRegular = regularScheduled.filter((game: any) => !game.played && normalizeDate(game.date) < today);
    const playoffScheduled = schedule.filter((game: any) => PLAYOFF_PHASES.has(String(game.competitionPhase ?? '').toLowerCase()));
    const playoffPlayed = boxes.filter((game: any) => PLAYOFF_PHASES.has(String(game.competitionPhase ?? '').toLowerCase()));
    const resolution = resolveCompetitionSeason(spec, state.boxScores as any, season, tids);
    return {
      competition: spec.shortName,
      id: spec.id,
      window: `${competitionStartDate(spec, season)} -> ${competitionEndDate(spec, season)}`,
      playoffStart: firstPlayoffDate(spec, season),
      teams: tids.length,
      expectedRegular: expected,
      regularScheduled: regularScheduled.length,
      regularPlayed: regularPlayed.length,
      futureRegular: futureRegular.length,
      overdueRegular: overdueRegular.length,
      playoffScheduled: playoffScheduled.length,
      playoffPlayed: playoffPlayed.length,
      champion: resolution?.championTid != null ? teamLabel(state, resolution.championTid) : '',
      status: regularPlayed.length < expected
        ? `regular ${regularPlayed.length}/${expected}`
        : resolution?.championTid != null
          ? 'champion resolved'
          : playoffScheduled.length > 0 || playoffPlayed.length > 0
            ? 'playoffs active'
            : today >= firstPlayoffDate(spec, season)
              ? 'ready for playoffs'
              : 'regular active',
    };
  });
}

function buildNbaRows(state: GameState) {
  const today = normalizeDate(state.date);
  const rows = state.teams
    .filter((team: any) => Number(team.id) >= 0 && Number(team.id) < 100)
    .map((team: any) => ({ tid: team.id, team: team.abbrev ?? team.name, wl: Number(team.wins ?? 0) + Number(team.losses ?? 0), scheduled: 0, played: 0, overdue: 0 }));
  const byTid = new Map(rows.map(row => [row.tid, row]));
  for (const game of state.schedule as any[]) {
    if (game.competitionId || game.isPreseason || game.isPlayoff || game.isPlayIn || game.isAllStar || game.isRisingStars || game.isCelebrityGame || game.excludeFromRecord) continue;
    const tids = [game.homeTid ?? game.homeTeamId, game.awayTid ?? game.awayTeamId];
    if (!tids.every(tid => byTid.has(tid))) continue;
    for (const tid of tids) {
      const row = byTid.get(tid)!;
      row.scheduled += 1;
      if (game.played) row.played += 1;
      else if (normalizeDate(game.date) < today) row.overdue += 1;
    }
  }
  return rows.sort((a, b) => Math.abs(82 - b.scheduled) - Math.abs(82 - a.scheduled) || a.team.localeCompare(b.team));
}

function logNbaAudit(state: GameState) {
  const rows = buildNbaRows(state);
  const shortSchedule = rows.filter(row => row.scheduled !== 82);
  const overdue = rows.filter(row => row.overdue > 0);
  const playoffs = state.playoffs;
  console.log(TAG, 'NBA summary', {
    date: normalizeDate(state.date),
    teams: rows.length,
    scheduleTeamsNot82: shortSchedule.length,
    teamsWithOverdueGames: overdue.length,
    playoffSeason: playoffs?.season ?? '',
    playoffRound: playoffs?.currentRound ?? '',
    playoffComplete: playoffs?.bracketComplete ?? false,
    champion: playoffs?.champion != null ? teamLabel(state, playoffs.champion) : '',
  });
  console.table(rows);
}

function logRosterAudit(state: GameState) {
  const buckets = (state.players ?? []).reduce((acc: Record<string, number>, player: any) => {
    const tid = Number(player.tid);
    const key = tid >= 2000 && tid < 2100
      ? 'PBA'
      : tid >= 1000 && tid < 2000
        ? 'Euroleague'
        : tid >= 5000 && tid < 5100
          ? 'Endesa'
          : tid >= 0 && tid < 100
            ? 'NBA'
            : String(player.status ?? 'Other');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.table(Object.entries(buckets).map(([bucket, players]) => ({ bucket, players })));
}

export function logBasketballUniverseAudit(state: GameState, context = 'manual'): void {
  const season = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const activeSpecs = state.activeCompetitions?.length ? state.activeCompetitions : [];
  const euroSpecs = activeSpecs.filter(spec => spec.id === 'endesa' || spec.id === 'euroleague' || spec.id === 'copa-del-rey' || spec.id === 'supercopa');
  const pbaSpecs = activeSpecs.filter(spec => spec.id.startsWith('pba-'));
  const effectiveEuroSpecs = euroSpecs.length > 0 ? euroSpecs : SPAIN_COMPETITIONS;
  const effectivePbaSpecs = pbaSpecs.length > 0 ? pbaSpecs : PBA_COMPETITIONS;

  console.group(`${TAG} ${context}`);
  console.log(TAG, {
    date: state.date,
    normalizedDate: normalizeDate(state.date),
    season,
    uiMode: state.leagueStats?.uiMode ?? 'nba',
    activeCompetitions: activeSpecs.map(spec => spec.id),
  });
  console.log(TAG, 'NBA schedule/playoff sanity');
  logNbaAudit(state);
  console.log(TAG, 'Euro competition sanity');
  console.table(buildCompetitionRows(state, effectiveEuroSpecs, season));
  console.log(TAG, 'PBA competition sanity');
  console.table(buildCompetitionRows(state, effectivePbaSpecs, season));
  console.log(TAG, 'Roster scope sanity');
  logRosterAudit(state);
  if (state.leagueStats?.uiMode === 'pba_isolated') {
    logPbaLazySimAudit(state, `${context} detail`);
  }
  console.groupEnd();
}
