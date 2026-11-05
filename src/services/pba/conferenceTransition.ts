import type { GameState, NBAPlayer } from '../../types';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { generateForCompetition, selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { injectCompetitionPostseasonGames, resolveCompetitionSeason } from '../competition/competitionResolver';
import { dateForCompetitionSeason } from '../competition/competitionSeasonState';
import { getDraftSeasonYearForState, initialPbaEndOfSeasonChecklist, initialPbaInterConferenceChecklist } from '../offseason/offseasonState';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { isPbaActiveConferencePhase } from '../../utils/uiMode';
import { buildPbaLiveAwardPatch, buildPbaSeasonAwardPatch } from './awards';
import { autoManagePbaImports } from './importAutomation';
import { normalizeDate } from '../../utils/helpers';
import { competitionSeasonForBox, selectCountedPbaRegularBoxScores } from './competitionGames';
import { buildPbaGovernorsBoardMeeting } from './governorsBoard';
import { trimPbaOversizedRosters } from './rosterTrim';
import { carryPbaDraftClassForward, isPbaDraftHeldInYear } from './draftCalendar';

export type PbaConference = 'philippine' | 'commissioners' | 'governors';

const CONFERENCE_ORDER: PbaConference[] = ['philippine', 'commissioners', 'governors'];
const PBA_POSTSEASON_PHASES = new Set(['play-in', 'qf', 'sf', 'final']);

const isPbaPostseasonGame = (game: any) => PBA_POSTSEASON_PHASES.has(String(game?.competitionPhase ?? ''));

const isPbaRegularSeasonGame = (game: any) => !isPbaPostseasonGame(game);

const hasPbaRegularScheduleCollisions = (games: any[]): boolean => {
  const appearances = new Set<string>();
  for (const game of games) {
    const date = normalizeDate(game.date);
    for (const tid of [Number(game.homeTid), Number(game.awayTid)]) {
      const key = `${date}:${tid}`;
      if (appearances.has(key)) return true;
      appearances.add(key);
    }
  }
  return false;
};

export function getNextConference(current: PbaConference, seasonYear?: number): PbaConference | null {
  const idx = CONFERENCE_ORDER.indexOf(current);
  return idx < CONFERENCE_ORDER.length - 1 ? CONFERENCE_ORDER[idx + 1] : null;
}

export function getConferenceSpec(conf: PbaConference, seasonYear?: number) {
  const map: Record<PbaConference, number> = { philippine: 0, commissioners: 1, governors: 2 };
  void seasonYear;
  return PBA_COMPETITIONS[map[conf]];
}

export function clearConferenceImports(players: NBAPlayer[], conference: PbaConference): NBAPlayer[] {
  return players.map(p => {
    if ((p as any).isImport && (p as any).importConference === conference) {
      return {
        ...p,
        tid: -1,
        status: 'Free Agent',
        isImport: undefined,
        importConference: undefined,
        importTeamId: undefined,
        pbaImportContract: undefined,
        contract: undefined,
        recentlyWaivedBy: undefined,
        recentlyWaivedDate: undefined,
        signedDate: undefined,
        tradeEligibleDate: undefined,
      } as any;
    }
    return p;
  });
}

export function recordConferenceChampion(
  state: GameState,
  conference: PbaConference,
  championTid: number,
  championName: string,
): any[] {
  const season = (state.leagueStats as any)?.year ?? new Date().getFullYear();
  const existing: any[] = (state.leagueStats as any)?.pbaConferenceChampions ?? [];
  return [
    ...existing,
    { season, conference, teamId: championTid, teamName: championName },
  ];
}

export function checkGrandSlam(champions: any[], season: number): { teamId: number; teamName: string } | null {
  const seasonChamps = champions.filter((c: any) => c.season === season);
  if (seasonChamps.length < 3) return null;
  const tids = seasonChamps.map((c: any) => c.teamId);
  if (new Set(tids).size === 1) {
    return { teamId: tids[0], teamName: seasonChamps[0].teamName };
  }
  return null;
}

export function generateNextConferenceSchedule(
  state: GameState,
  nextConf: PbaConference,
): any[] {
  const ls = state.leagueStats as any;
  const seasonYear = ls?.year ?? new Date().getFullYear();
  const spec = getConferenceSpec(nextConf, seasonYear);
  const start = new Date(`${getEffectiveConferenceStartIso(nextConf, seasonYear, state.date)}T00:00:00Z`);
  const source = { nonNBATeams: (state as any).nonNBATeams, userTeamId: state.userTeamId };
  const tids = selectCompetitionTeamTids(spec, source);
  const gidBase = getNextPbaScheduleGid(state, nextConf);
  return generateForCompetition(spec, tids.map(tid => ({ tid })), start, gidBase);
}

export function getConferenceStartDate(conf: PbaConference, seasonYear: number): string {
  const d = new Date(`${getConferenceStartIso(conf, seasonYear)}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getConferenceStartIso(conf: PbaConference, seasonYear: number): string {
  const spec = getConferenceSpec(conf, seasonYear);
  const calYear = conf === 'philippine' && spec.seasonStart.month >= 7 ? seasonYear - 1 : seasonYear;
  const month = String(spec.seasonStart.month).padStart(2, '0');
  const day = String(spec.seasonStart.day).padStart(2, '0');
  return `${calYear}-${month}-${day}`;
}

function getEffectiveConferenceStartIso(conf: PbaConference, seasonYear: number, currentDate: string): string {
  const scheduled = getConferenceStartIso(conf, seasonYear);
  const current = normalizeDate(currentDate);
  return current > scheduled ? current : scheduled;
}

function pbaSeasonYearForDatedRow(spec: ReturnType<typeof getConferenceSpec>, row: any): number | null {
  const savedSeason = Number(row?.season ?? row?.seasonYear);
  if (Number.isFinite(savedSeason) && savedSeason > 0) return savedSeason;
  const date = new Date(row?.date ?? '');
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const crossesCalendarYear =
    spec.seasonStart.month > spec.seasonEnd.month ||
    (spec.seasonStart.month === spec.seasonEnd.month && spec.seasonStart.day > spec.seasonEnd.day);
  return crossesCalendarYear && month >= spec.seasonStart.month ? year + 1 : year;
}

function mostCommonPbaSeasonYear(years: Array<number | null | undefined>, fallback: number): number {
  const counts = new Map<number, number>();
  years.forEach(year => {
    if (!Number.isFinite(Number(year))) return;
    const key = Number(year);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  if (counts.size === 0) return fallback;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

export function inferPbaConferenceSeasonYear(
  state: Pick<GameState, 'date' | 'schedule' | 'boxScores' | 'leagueStats'>,
  conference?: PbaConference,
): number {
  const leagueStats = state.leagueStats as any;
  const currentConference = (conference ?? leagueStats?.pbaConference ?? 'philippine') as PbaConference;
  const position = getPbaCalendarPosition(state.date);
  const leagueYear = Number(leagueStats?.year);
  const fallback = position.conference === currentConference
    ? position.seasonYear
    : Number.isFinite(leagueYear)
      ? leagueYear
      : position.seasonYear;
  const spec = getConferenceSpec(currentConference, Number.isFinite(leagueYear) ? leagueYear : fallback);
  const competitionRows = [
    ...(state.schedule ?? []).filter((game: any) => game?.competitionId === spec.id),
    ...(state.boxScores ?? []).filter((game: any) => game?.competitionId === spec.id),
  ];
  if (
    Number.isFinite(leagueYear) &&
    competitionRows.some(row => pbaSeasonYearForDatedRow(spec, row) === leagueYear)
  ) return leagueYear;
  const unplayedScheduledYears = (state.schedule ?? [])
    .filter((game: any) => game?.competitionId === spec.id && !game.played)
    .map((game: any) => pbaSeasonYearForDatedRow(spec, game));
  if (unplayedScheduledYears.length > 0) return mostCommonPbaSeasonYear(unplayedScheduledYears, fallback);
  const allYears = competitionRows.map((game: any) => pbaSeasonYearForDatedRow(spec, game));
  return mostCommonPbaSeasonYear(allYears, fallback);
}

function getConferenceDateIso(conf: PbaConference, seasonYear: number, month: number, day: number): string {
  return dateForCompetitionSeason(getConferenceSpec(conf, seasonYear), seasonYear, month, day).slice(0, 10);
}

function getConferencePlayoffStartIso(conf: PbaConference, seasonYear: number): string | null {
  const round = getConferenceSpec(conf, seasonYear).playoffFormat?.rounds[0];
  if (!round) return null;
  return getConferenceDateIso(conf, seasonYear, round.start.month, round.start.day);
}

export function getPbaFirstPlayoffDate(
  state: Pick<GameState, 'date' | 'schedule' | 'boxScores' | 'leagueStats'>,
  conference?: PbaConference,
): string | null {
  const currentConference = (conference ?? (state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference;
  const seasonYear = inferPbaConferenceSeasonYear(state, currentConference);
  const competitionId = getConferenceSpec(currentConference, seasonYear).id;
  const scheduled = (state.schedule ?? [])
    .filter((game: any) =>
      game?.competitionId === competitionId
      && !game.played
      && ['qf', 'sf', 'final'].includes(String(game?.competitionPhase ?? '')),
    )
    .map((game: any) => normalizeDate(game.date))
    .filter(Boolean)
    .sort()[0];
  return scheduled ?? getConferencePlayoffStartIso(currentConference, seasonYear);
}

function isBeforeConferencePlayoffs(state: GameState, conf: PbaConference, seasonYear: number): boolean {
  const playoffStart = getConferencePlayoffStartIso(conf, seasonYear);
  return !!playoffStart && normalizeDate(state.date) < playoffStart;
}

function prunePrematurePbaPostseason(
  state: GameState,
  leagueStats: any,
  conf: PbaConference,
  seasonYear: number,
): GameState {
  const playoffStart = getConferencePlayoffStartIso(conf, seasonYear);
  const shouldPrune =
    !!playoffStart &&
    (normalizeDate(state.date) < playoffStart || leagueStats?.pbaConferencePhase === 'regularSeason');
  if (!shouldPrune) return state;

  const spec = getConferenceSpec(conf, seasonYear);
  const schedule = (state.schedule ?? []).filter((game: any) =>
    game.played ||
    game.competitionId !== spec.id ||
    !isPbaPostseasonGame(game),
  );
  return schedule.length === (state.schedule ?? []).length ? state : { ...state, schedule };
}

function regularGameKey(game: any): string {
  const tids = [Number(game.homeTid), Number(game.awayTid)].sort((a, b) => a - b);
  return `${tids[0]}-${tids[1]}`;
}

function getPbaGidBase(conf: PbaConference): number {
  if (conf === 'commissioners') return 810_000;
  if (conf === 'governors') return 820_000;
  return 800_000;
}

export function getNextPbaScheduleGid(
  state: Pick<GameState, 'schedule' | 'boxScores'>,
  conference: PbaConference,
): number {
  const ids = [
    ...(state.schedule ?? []).map(game => Number(game.gid) || 0),
    ...(state.boxScores ?? []).map(game => Number((game as any).gameId ?? (game as any).gid) || 0),
  ];
  return Math.max(getPbaGidBase(conference) - 1, 0, ...ids) + 1;
}

function expectedPbaRegularSeasonGames(spec: ReturnType<typeof getConferenceSpec>, teamCount: number): number {
  if (teamCount < 2) return 0;
  const gamesPerTeam = Math.floor(Number(spec.gamesPerTeam ?? teamCount - 1));
  if (gamesPerTeam > 0 && gamesPerTeam < teamCount - 1) return Math.floor((teamCount * gamesPerTeam) / 2);
  const singleRoundRobin = (teamCount * (teamCount - 1)) / 2;
  return (spec.gamesPerTeam ?? 0) >= (teamCount - 1) * 2 ? singleRoundRobin * 2 : singleRoundRobin;
}

function applySavedPbaOpeningNight(
  state: GameState,
  schedule: GameState['schedule'],
  conference: PbaConference,
  seasonYear: number,
): GameState['schedule'] {
  if (
    conference !== 'philippine'
    || state.leagueStats.globalGamesScheduledYear !== seasonYear
    || !state.globalGames?.[0]
  ) return schedule;
  const selection = state.globalGames[0];
  const competitionId = getConferenceSpec(conference, seasonYear).id;
  const regularGames = schedule
    .filter(game =>
      game.competitionId === competitionId
      && !game.played
      && isPbaRegularSeasonGame(game),
    )
    .sort((left, right) => left.date.localeCompare(right.date) || left.gid - right.gid);
  const selected = regularGames.find(game =>
    (game.homeTid === selection.homeTid && game.awayTid === selection.awayTid)
    || (game.homeTid === selection.awayTid && game.awayTid === selection.homeTid),
  );
  const first = regularGames[0];
  if (!selected || !first) return schedule;
  if (
    selected.gid === first.gid
    && selected.city === selection.city
    && selected.country === selection.country
    && selected.venue === selection.venue
  ) return schedule;
  return schedule
    .map(game => {
      if (game.gid === selected.gid) {
        return {
          ...game,
          date: first.date,
          city: selection.city,
          country: selection.country,
          venue: selection.venue,
        };
      }
      if (first.gid !== selected.gid && game.gid === first.gid) {
        return { ...game, date: selected.date };
      }
      return game;
    })
    .sort((left, right) => left.date.localeCompare(right.date) || left.gid - right.gid);
}

function ensureActivePbaConferenceSchedule(
  state: GameState,
  leagueStats: any,
  conference: PbaConference,
  seasonYear: number,
): GameState {
  if (leagueStats?.pbaConferencePhase !== 'regularSeason') return state;
  const spec = getConferenceSpec(conference, seasonYear);
  const today = normalizeDate(state.date);
  const playoffStart = getConferencePlayoffStartIso(conference, seasonYear);
  if (playoffStart && today >= playoffStart) return state;

  const schedule = state.schedule ?? [];
  const tids = selectCompetitionTeamTids(spec, {
    nonNBATeams: (state as any).nonNBATeams,
    userTeamId: state.userTeamId,
  });
  if (tids.length < 2) return state;
  const expected = expectedPbaRegularSeasonGames(spec, tids.length);
  const regularCurrent = schedule.filter((game: any) =>
    game.competitionId === spec.id &&
    isPbaRegularSeasonGame(game) &&
    normalizeDate(game.date) >= getConferenceStartIso(conference, seasonYear) &&
    (!playoffStart || normalizeDate(game.date) < playoffStart),
  );
  const participants = new Set(regularCurrent.flatMap((game: any) => [Number(game.homeTid), Number(game.awayTid)]));
  const isSparse = expected > 0 && (
    regularCurrent.length < Math.floor(expected * 0.8) ||
    tids.some((tid: number) => !participants.has(tid)) ||
    hasPbaRegularScheduleCollisions(regularCurrent.filter((game: any) => !game.played))
  );
  const hasFutureRegular = schedule.some((game: any) =>
    game.competitionId === spec.id &&
    !game.played &&
    isPbaRegularSeasonGame(game) &&
    normalizeDate(game.date) >= today,
  );
  if (hasFutureRegular && !isSparse) {
    const adjusted = applySavedPbaOpeningNight(state, schedule, conference, seasonYear);
    return adjusted === schedule ? state : { ...state, schedule: adjusted };
  }

  const playedKeys = new Set(
    schedule
      .filter((game: any) => game.competitionId === spec.id && game.played && isPbaRegularSeasonGame(game))
      .map(regularGameKey),
  );
  const nextGid = getNextPbaScheduleGid({ ...state, schedule }, conference);
  const generated = generateForCompetition(
    spec,
    tids.map((tid: number) => ({ tid })),
    new Date(`${getEffectiveConferenceStartIso(conference, seasonYear, state.date)}T00:00:00Z`),
    nextGid,
  ).filter((game: any) =>
    normalizeDate(game.date) >= today &&
    (!playoffStart || normalizeDate(game.date) < playoffStart) &&
    !playedKeys.has(regularGameKey(game)),
  );
  if (generated.length === 0) return state;

  const cleanedSchedule = schedule.filter((game: any) =>
    game.competitionId !== spec.id ||
    game.played ||
    isPbaPostseasonGame(game) ||
    (!isSparse && normalizeDate(game.date) >= today),
  );
  const nextSchedule = [...cleanedSchedule, ...generated]
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid);
  return {
    ...state,
    schedule: applySavedPbaOpeningNight(state, nextSchedule, conference, seasonYear),
  };
}

export function getPbaCalendarPosition(date: string): { conference: PbaConference; seasonYear: number; phase: 'regularSeason' | 'playoffs' | 'offseason' } {
  const norm = normalizeDate(date);
  const [calYear, month, day] = norm.split('-').map(Number);
  if (month > 10 || (month === 10 && day >= 5)) {
    return {
      conference: 'philippine',
      seasonYear: calYear + 1,
      phase: month === 12 && day >= 15 ? 'playoffs' : 'regularSeason',
    };
  }
  if (month === 10) {
    return { conference: 'governors', seasonYear: calYear, phase: 'offseason' };
  }
  if (month < 3 || (month === 3 && day <= 10)) {
    const afterPhilippineFinals = month === 2 && day > 15;
    return { conference: 'philippine', seasonYear: calYear, phase: afterPhilippineFinals || month === 3 ? 'offseason' : 'playoffs' };
  }
  if (month < 7 || (month === 7 && day <= 9)) {
    return {
      conference: 'commissioners',
      seasonYear: calYear,
      phase: (month === 6 && day >= 3) || (month === 7 && day <= 7) ? 'playoffs' : month === 7 ? 'offseason' : 'regularSeason',
    };
  }
  return {
    conference: 'governors',
    seasonYear: calYear,
    phase: (month === 8 && day >= 28) || month === 9 ? 'playoffs' : 'regularSeason',
  };
}

function cleanBadPbaRolloverNews(news: any[] | undefined): any[] | undefined {
  if (!Array.isArray(news)) return news;
  let changed = false;
  const filtered = news.filter(item => {
    const text = `${item?.headline ?? ''} ${item?.content ?? ''}`;
    const badPbaCapNews =
      /NBA Season Underway/i.test(text) &&
      /Salary Cap Set/i.test(text) &&
      /\$0\.\dM/i.test(text);
    if (badPbaCapNews) changed = true;
    return !badPbaCapNews;
  });
  return changed ? filtered : news;
}

export function disablePbaSalaryCapFields(leagueStats: any): any {
  const next = {
    ...leagueStats,
    salaryCapEnabled: false,
    salaryCapType: 'none',
    luxuryTaxEnabled: false,
    apronsEnabled: false,
    minimumPayrollEnabled: false,
    mleEnabled: false,
    maxContractType: 'none',
  };
  return (
    leagueStats?.salaryCapEnabled === false &&
    leagueStats?.salaryCapType === 'none' &&
    leagueStats?.luxuryTaxEnabled === false &&
    leagueStats?.apronsEnabled === false &&
    leagueStats?.minimumPayrollEnabled === false &&
    leagueStats?.mleEnabled === false &&
    leagueStats?.maxContractType === 'none'
  ) ? leagueStats : next;
}

function hasRecordedConferenceChampion(leagueStats: any, conference: PbaConference, season: number): boolean {
  return ((leagueStats?.pbaConferenceChampions ?? []) as any[]).some((entry: any) =>
    Number(entry?.season) === Number(season) && entry?.conference === conference,
  );
}

function ensurePbaOffseasonChecklist(state: GameState, conference: PbaConference): GameState {
  if ((state.leagueStats as any)?.pbaConferencePhase !== 'offseason' || state.offseasonChecklist) return state;
  return {
    ...state,
    offseasonChecklist: conference === 'governors'
      ? initialPbaEndOfSeasonChecklist(state.gameMode === 'gm')
      : initialPbaInterConferenceChecklist(conference),
  };
}

function hasConferencePostseasonMaterial(
  state: GameState,
  spec: ReturnType<typeof getConferenceSpec>,
  season: number,
): boolean {
  return [
    ...(state.schedule ?? []),
    ...(state.boxScores ?? []),
  ].some((game: any) =>
    game?.competitionId === spec.id &&
    ['qf', 'sf', 'final'].includes(String(game?.competitionPhase ?? '')) &&
    competitionSeasonForBox(spec, game) === season,
  );
}

function injectReadyPbaPostseason(state: GameState, leagueStats: any, conference: PbaConference, season: number): GameState | null {
  if (!isPbaActiveConferencePhase(leagueStats?.pbaConferencePhase)) return null;
  if (isBeforeConferencePlayoffs(state, conference, season)) return null;
  const spec = getConferenceSpec(conference, season);
  const schedule = state.schedule ?? [];
  const currentGames = schedule.filter((game: any) =>
    game.competitionId === spec.id && competitionSeasonForBox(spec, game) === season,
  );
  if (currentGames.length === 0) return null;
  const teamTids = selectCompetitionTeamTids(spec, state as any);
  const expectedRegular = expectedPbaRegularSeasonGames(spec, teamTids.length);
  if (expectedRegular > 0 && selectCountedPbaRegularBoxScores(state.boxScores ?? [], spec, season).length < expectedRegular) return null;
  const hasPostseasonMaterial = hasConferencePostseasonMaterial(state, spec, season);
  const scheduleForPostseason = hasPostseasonMaterial
    ? schedule
    : schedule.filter((game: any) =>
        game.competitionId !== spec.id ||
        game.played ||
        isPbaPostseasonGame(game),
      );
  const nextSchedule = injectCompetitionPostseasonGames({ ...state, leagueStats, schedule: scheduleForPostseason } as any, [spec] as any, season);
  const changed = nextSchedule.length !== scheduleForPostseason.length || nextSchedule.some((game, index) => game !== scheduleForPostseason[index]);
  if (!changed) return null;
  return {
    ...state,
    schedule: nextSchedule,
    leagueStats: {
      ...leagueStats,
      pbaConferencePhase: 'playoffs',
    } as any,
  };
}

export function repairPbaConferenceForDate(state: GameState): GameState {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated' || !state.date) return state;
  let position = getPbaCalendarPosition(state.date);
  const leagueStats = disablePbaSalaryCapFields(state.leagueStats as any);
  const currentConference = (leagueStats?.pbaConference ?? 'philippine') as PbaConference;
  const currentPhase = leagueStats?.pbaConferencePhase;
  const cleanedNews = cleanBadPbaRolloverNews(state.news as any);
  const preparedYearEndSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
  if (
    currentConference === 'governors'
    && currentPhase === 'offseason'
    && Number.isFinite(preparedYearEndSeason)
    && Number(leagueStats?.year) === preparedYearEndSeason + 1
  ) {
    return ensurePbaOffseasonChecklist(
      cleanedNews !== state.news || leagueStats !== state.leagueStats
        ? { ...state, leagueStats, news: cleanedNews as any }
        : state,
      currentConference,
    );
  }
  const currentSeason = inferPbaConferenceSeasonYear(state, currentConference);
  const completedConferenceSeason = Number.isFinite(preparedYearEndSeason) ? preparedYearEndSeason : position.seasonYear;
  const currentSpec = getConferenceSpec(currentConference, currentSeason);
  const currentGames = (state.schedule ?? []).filter((game: any) =>
    game.competitionId === currentSpec.id && competitionSeasonForBox(currentSpec, game) === currentSeason,
  );
  const currentBoxes = (state.boxScores ?? []).filter((game: any) =>
    game.competitionId === currentSpec.id && competitionSeasonForBox(currentSpec, game) === currentSeason,
  );
  const shouldKeepCompletedCurrentConference =
    currentConference === position.conference &&
    currentPhase === 'offseason' &&
    hasRecordedConferenceChampion(leagueStats, currentConference, completedConferenceSeason);
  const shouldKeepUnresolvedCurrentConference =
    isPbaActiveConferencePhase(currentPhase) &&
    (currentGames.length > 0 || currentBoxes.length > 0) &&
    !hasRecordedConferenceChampion(leagueStats, currentConference, currentSeason) &&
    (
      currentConference !== position.conference ||
      position.phase === 'offseason'
    );
  if (shouldKeepCompletedCurrentConference) {
    position = {
      conference: currentConference,
      seasonYear: completedConferenceSeason,
      phase: 'offseason',
    };
  }
  if (shouldKeepUnresolvedCurrentConference) {
    position = {
      conference: currentConference,
      seasonYear: currentSeason,
      phase: hasConferencePostseasonMaterial(state, currentSpec, currentSeason) ? 'playoffs' : currentPhase,
    };
  }
  if (
    Number(leagueStats?.year) === position.seasonYear &&
    currentConference === position.conference &&
    currentPhase === position.phase
  ) {
    const baseState = ensurePbaOffseasonChecklist((cleanedNews !== state.news || leagueStats !== state.leagueStats)
      ? { ...state, leagueStats, news: cleanedNews as any }
      : state, currentConference);
    const withoutEarlyPostseason = prunePrematurePbaPostseason(baseState, leagueStats, currentConference, position.seasonYear);
    const withSchedule = ensureActivePbaConferenceSchedule(
      withoutEarlyPostseason,
      withoutEarlyPostseason.leagueStats,
      currentConference,
      position.seasonYear,
    );
    const withPostseason = injectReadyPbaPostseason(withSchedule, withSchedule.leagueStats, currentConference, position.seasonYear);
    if (withPostseason) return { ...withPostseason, news: cleanedNews as any };
    if (withSchedule !== state || cleanedNews !== state.news || leagueStats !== state.leagueStats) {
      return { ...withSchedule, news: cleanedNews as any };
    }
    return baseState;
  }

  const spec = getConferenceSpec(position.conference, position.seasonYear);
  const targetCompetitionId = spec.id;
  const norm = normalizeDate(state.date);
  const pbaSchedule = state.schedule ?? [];
  const hasCurrentSeasonGames = pbaSchedule.some((game: any) =>
    game.competitionId === targetCompetitionId &&
    normalizeDate(game.date) >= getConferenceStartIso(position.conference, position.seasonYear),
  );
  const source = { nonNBATeams: (state as any).nonNBATeams, userTeamId: state.userTeamId };
  const tids = selectCompetitionTeamTids(spec, source);
  const generatedAll = hasCurrentSeasonGames || position.phase === 'offseason'
    ? []
    : generateForCompetition(
        spec,
        tids.map((tid: number) => ({ tid })),
        new Date(`${getEffectiveConferenceStartIso(position.conference, position.seasonYear, state.date)}T00:00:00Z`),
        getNextPbaScheduleGid(state, position.conference),
      );
  const generated = generatedAll.filter((game: any) => normalizeDate(game.date) >= norm);
  const cleanedSchedule = pbaSchedule.filter((game: any) => {
    const competitionId = String(game.competitionId ?? '');
    if (!competitionId.startsWith('pba-')) return true;
    if (game.played) return true;
    if (competitionId !== targetCompetitionId) return false;
    return normalizeDate(game.date) >= norm || hasCurrentSeasonGames;
  });
  const cleanedPlayers = currentConference !== position.conference
    ? clearConferenceImports(state.players, currentConference)
    : state.players;

  const repairedState = ensurePbaOffseasonChecklist({
    ...state,
    players: cleanedPlayers,
    news: cleanedNews as any,
    schedule: [...cleanedSchedule, ...generated],
    leagueStats: {
      ...leagueStats,
      year: position.seasonYear,
      pbaConference: position.conference,
      pbaConferencePhase: position.phase,
      pbaYearEndRolloverPreparedSeason: shouldKeepCompletedCurrentConference && Number.isFinite(preparedYearEndSeason)
        ? preparedYearEndSeason
        : undefined,
    } as any,
    offseasonChecklist: position.phase === 'regularSeason' ? undefined : state.offseasonChecklist,
  }, position.conference);
  const cleanedPremature = prunePrematurePbaPostseason(repairedState, repairedState.leagueStats, position.conference, position.seasonYear);
  const scheduledState = ensureActivePbaConferenceSchedule(
    cleanedPremature,
    cleanedPremature.leagueStats,
    position.conference,
    position.seasonYear,
  );
  return injectReadyPbaPostseason(scheduledState, scheduledState.leagueStats, position.conference, position.seasonYear) ?? scheduledState;
}

export function applyPbaConferenceLifecycle(
  state: GameState,
  pendingBoxScores: any[] = [],
): Partial<GameState> {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return {};
  const leagueStats = state.leagueStats as any;
  if (!isPbaActiveConferencePhase(leagueStats?.pbaConferencePhase)) return {};
  const current: PbaConference = leagueStats?.pbaConference ?? 'philippine';
  const importCandidateState = current === 'commissioners' || current === 'governors'
    ? autoManagePbaImports(state, current, {
        allowInjuryReplacements: true,
        excludeUserTeam: state.gameMode === 'gm',
        fillMissingTeams: true,
      })
    : state;
  const importRosterTrim = trimPbaOversizedRosters(importCandidateState, importCandidateState.players);
  const importManagedState = importRosterTrim.trimmed.length > 0
    ? {
        ...importCandidateState,
        players: importRosterTrim.players,
        history: [...(importCandidateState.history ?? []), ...importRosterTrim.history],
      }
    : importCandidateState;
  const basePatch: Partial<GameState> = importManagedState !== state
    ? { players: importManagedState.players, history: importManagedState.history }
    : {};
  const season = (importManagedState.leagueStats as any)?.year ?? new Date().getFullYear();
  const spec = getConferenceSpec(current, season);
  const regularSeasonGuardState = prunePrematurePbaPostseason(
    importManagedState,
    importManagedState.leagueStats,
    current,
    season,
  );
  const schedule = regularSeasonGuardState.schedule ?? [];
  if (regularSeasonGuardState !== importManagedState && isBeforeConferencePlayoffs(regularSeasonGuardState, current, season)) {
    return {
      ...basePatch,
      schedule,
      leagueStats: { ...regularSeasonGuardState.leagueStats, pbaConferencePhase: 'regularSeason' } as any,
    };
  }
  const hasCurrentConference = schedule.some((game: any) => game.competitionId === spec.id);
  if (!hasCurrentConference) return basePatch;

  const currentGames = schedule.filter((game: any) =>
    game.competitionId === spec.id && competitionSeasonForBox(spec, game) === season,
  );
  const hasPostseasonMaterial =
    currentGames.some((game: any) => ['qf', 'sf', 'final'].includes(String(game.competitionPhase))) ||
    [...(importManagedState.boxScores ?? []), ...pendingBoxScores].some((game: any) =>
      game.competitionId === spec.id &&
      ['qf', 'sf', 'final'].includes(String(game.competitionPhase)) &&
      competitionSeasonForBox(spec, game) === season,
    );
  if (!hasPostseasonMaterial) {
    if (isBeforeConferencePlayoffs(importManagedState, current, season)) {
      if (leagueStats.pbaConferencePhase !== 'regularSeason') {
        return { ...basePatch, leagueStats: { ...importManagedState.leagueStats, pbaConferencePhase: 'regularSeason' } as any };
      }
      return basePatch;
    }
    const boxScores = [...(importManagedState.boxScores ?? []), ...pendingBoxScores];
    const scheduleForPostseason = schedule.filter((game: any) =>
      game.competitionId !== spec.id ||
      game.played ||
      isPbaPostseasonGame(game),
    );
    const nextSchedule = injectCompetitionPostseasonGames({ ...importManagedState, schedule: scheduleForPostseason, boxScores } as any, [spec] as any, season);
    if (nextSchedule.length > scheduleForPostseason.length) {
      return {
        ...basePatch,
        schedule: nextSchedule,
        leagueStats: { ...importManagedState.leagueStats, pbaConferencePhase: 'playoffs' } as any,
      };
    }
  }
  const nextPhase = hasPostseasonMaterial ? 'playoffs' : 'regularSeason';
  const boxScores = [...(importManagedState.boxScores ?? []), ...pendingBoxScores];
  const teamTids = selectCompetitionTeamTids(spec, importManagedState as any);
  const resolution = resolveCompetitionSeason(spec, boxScores as any, season, teamTids);

  if (!resolution?.championTid) {
    if (leagueStats.pbaConferencePhase !== nextPhase) {
      return { ...basePatch, leagueStats: { ...importManagedState.leagueStats, pbaConferencePhase: nextPhase } as any };
    }
    return basePatch;
  }

  const existingChampions: any[] = leagueStats?.pbaConferenceChampions ?? [];
  const alreadyRecorded = existingChampions.some((entry: any) =>
    Number(entry.season) === Number(season) && entry.conference === current,
  );
  const champion = resolveAnyTeam(resolution.championTid, importManagedState.teams, importManagedState.nonNBATeams ?? []);
  const runnerUp = resolution.runnerUpTid != null
    ? resolveAnyTeam(resolution.runnerUpTid, importManagedState.teams, importManagedState.nonNBATeams ?? [])
    : null;
  const championName = champion ? getTeamFullName(champion as any) : `Team ${resolution.championTid}`;
  const runnerUpName = runnerUp ? getTeamFullName(runnerUp as any) : null;
  const nextConference = getNextConference(current, season);
  const awardPatch = buildPbaLiveAwardPatch(
    { ...importManagedState, boxScores } as GameState,
    current,
    spec.id,
    resolution.championTid,
    resolution.runnerUpTid,
  );
  const awardMeta = awardPatch.conferenceAwardMeta ?? {};
  const championRecord = boxScores
    .filter((game: any) =>
      game?.competitionId === spec.id
      && Number(game?.season ?? season) === Number(season)
      && (Number(game?.homeTeamId) === Number(resolution.championTid) || Number(game?.awayTeamId) === Number(resolution.championTid)),
    )
    .reduce((record: { won: number; lost: number; wins: number; losses: number }, game: any) => {
      const isHome = Number(game.homeTeamId) === Number(resolution.championTid);
      const teamScore = Number(isHome ? game.homeScore : game.awayScore);
      const opponentScore = Number(isHome ? game.awayScore : game.homeScore);
      if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore) || teamScore === opponentScore) return record;
      if (teamScore > opponentScore) {
        record.won += 1;
        record.wins += 1;
      } else {
        record.lost += 1;
        record.losses += 1;
      }
      return record;
    }, { won: 0, lost: 0, wins: 0, losses: 0 });
  const recordedChampion = {
    season,
    conference: current,
    teamId: resolution.championTid,
    teamName: championName,
    record: championRecord,
    ...awardMeta,
  };
  const nextChampions = alreadyRecorded
    ? existingChampions.map((entry: any) =>
        Number(entry.season) === Number(season) && entry.conference === current
          ? { ...entry, ...recordedChampion }
          : entry,
      )
    : [...existingChampions, recordedChampion];
  const nextLeagueStats = {
    ...importManagedState.leagueStats,
    pbaConferencePhase: 'offseason',
    pbaConferenceChampions: nextChampions,
    pbaMuseSelected: nextConference ? importManagedState.leagueStats.pbaMuseSelected : false,
  } as any;
  const conferenceAwardPlayers = awardPatch.players ?? importManagedState.players;
  const clearedPlayers = clearConferenceImports(conferenceAwardPlayers, current);

  const historyEntry = {
    text: `${championName} won the ${spec.displayName}${runnerUpName ? ` over ${runnerUpName}` : ''}.`,
    date: importManagedState.date,
    type: 'PBA',
    tid: resolution.championTid,
  };
  const history = alreadyRecorded || (importManagedState.history ?? []).some((entry: any) => entry.text === historyEntry.text && entry.type === historyEntry.type)
    ? importManagedState.history
    : [...(importManagedState.history ?? []), historyEntry as any];

  if (!nextConference) {
    const seasonAwardPatch = buildPbaSeasonAwardPatch({
      ...importManagedState,
      ...awardPatch,
      leagueStats: nextLeagueStats,
      boxScores,
      history,
    } as GameState);
    const yearEndPlayers = clearConferenceImports(
      seasonAwardPatch.players ?? awardPatch.players ?? importManagedState.players,
      current,
    );
    const completedSchedule = schedule.filter((game: any) => game.competitionId !== spec.id || game.played);
    const draftYear = getDraftSeasonYearForState(importManagedState);
    const draftHeld = isPbaDraftHeldInYear(draftYear);
    const completedState = {
      ...importManagedState,
      ...basePatch,
      ...awardPatch,
      ...seasonAwardPatch,
      players: draftHeld
        ? yearEndPlayers
        : carryPbaDraftClassForward(yearEndPlayers, draftYear, importManagedState.leagueStats),
      leagueStats: nextLeagueStats,
      schedule: completedSchedule,
      boxScores,
      offseasonChecklist: initialPbaEndOfSeasonChecklist(importManagedState.gameMode === 'gm', importManagedState.gameMode === 'gm', draftHeld),
      history: draftHeld ? history : [...history, {
        text: `The ${draftYear} PBA Draft was not held. Eligible players will enter the ${draftYear + 1} class.`,
        date: importManagedState.date,
        type: 'PBA',
      } as any],
      draftComplete: draftHeld ? undefined : true,
      draftLotteryResult: undefined,
      activeDraftPicks: undefined,
      activeDraftPassedPicks: undefined,
      activeDraftOrder: undefined,
    } as GameState;
    const pendingGovernorsBoardMeeting = buildPbaGovernorsBoardMeeting(completedState);
    return {
      ...basePatch,
      ...awardPatch,
      ...seasonAwardPatch,
      players: completedState.players,
      nonNBATeams: completedState.nonNBATeams,
      draftPicks: completedState.draftPicks,
      historicalPba: completedState.historicalPba,
      leagueStats: {
        ...completedState.leagueStats,
        pbaYearEndRolloverPreparedSeason: undefined,
        pbaDraftComplete: !draftHeld,
        pbaDraftCompleteSeason: draftHeld ? undefined : completedState.leagueStats.year,
      },
      schedule: completedState.schedule,
      offseasonChecklist: completedState.offseasonChecklist,
      history: completedState.history,
      draftComplete: draftHeld ? undefined : true,
      draftLotteryResult: undefined,
      activeDraftPicks: undefined,
      activeDraftPassedPicks: undefined,
      activeDraftOrder: undefined,
      pendingGovernorsBoardMeeting,
    };
  }

  return {
    ...basePatch,
    ...awardPatch,
    players: clearedPlayers,
    leagueStats: nextLeagueStats,
    schedule: schedule.filter((game: any) => game.competitionId !== spec.id || game.played),
    offseasonChecklist: initialPbaInterConferenceChecklist(current),
    history,
  };
}
