import type { GameState, NBAPlayer } from '../../types';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { generateForCompetition, selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { injectCompetitionPostseasonGames, resolveCompetitionSeason } from '../competition/competitionResolver';
import { dateForCompetitionSeason } from '../competition/competitionSeasonState';
import { initialPbaEndOfSeasonChecklist, initialPbaInterConferenceChecklist } from '../offseason/offseasonState';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { isPbaActiveConferencePhase } from '../../utils/uiMode';
import { buildPbaLiveAwardPatch, buildPbaSeasonAwardPatch } from './awards';
import { autoManagePbaImports } from './importAutomation';
import { normalizeDate } from '../../utils/helpers';
import { selectCountedPbaRegularBoxScores } from './competitionGames';

export type PbaConference = 'philippine' | 'commissioners' | 'governors';

const CONFERENCE_ORDER: PbaConference[] = ['philippine', 'commissioners', 'governors'];
const PBA_POSTSEASON_PHASES = new Set(['play-in', 'qf', 'sf', 'final']);

const isPbaPostseasonGame = (game: any) => PBA_POSTSEASON_PHASES.has(String(game?.competitionPhase ?? ''));

const isPbaRegularSeasonGame = (game: any) => !isPbaPostseasonGame(game);

export function getNextConference(current: PbaConference): PbaConference | null {
  const idx = CONFERENCE_ORDER.indexOf(current);
  return idx < CONFERENCE_ORDER.length - 1 ? CONFERENCE_ORDER[idx + 1] : null;
}

export function getConferenceSpec(conf: PbaConference) {
  const map: Record<PbaConference, number> = { philippine: 0, commissioners: 1, governors: 2 };
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
      } as any;
    }
    return p;
  });
}

function advancePbaStaffContractsForOffseason(nonNBATeams: GameState['nonNBATeams'] | undefined): GameState['nonNBATeams'] {
  if (!Array.isArray(nonNBATeams)) return nonNBATeams;
  return nonNBATeams.map((team: any) => {
    if (team?.league !== 'PBA' || !Array.isArray(team?.tycoon?.staffMembers)) return team;
    const nextMembers = team.tycoon.staffMembers.map((member: any) => {
      const currentYears = Number(member?.contractYears);
      if (!Number.isFinite(currentYears)) return member;
      return {
        ...member,
        contractYears: Math.max(0, Math.round(currentYears) - 1),
        yearsWithTeam: Number.isFinite(Number(member?.yearsWithTeam))
          ? Number(member.yearsWithTeam) + 1
          : member?.yearsWithTeam,
      };
    });
    return {
      ...team,
      tycoon: {
        ...(team.tycoon ?? {}),
        staffMembers: nextMembers,
      },
    };
  }) as any;
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
  const spec = getConferenceSpec(nextConf);
  const ls = state.leagueStats as any;
  const seasonYear = ls?.year ?? new Date().getFullYear();
  const calYear = nextConf === 'philippine' && spec.seasonStart.month >= 7 ? seasonYear - 1 : seasonYear;
  const start = new Date(Date.UTC(calYear, spec.seasonStart.month - 1, spec.seasonStart.day));
  const source = { nonNBATeams: (state as any).nonNBATeams, userTeamId: state.userTeamId };
  const tids = selectCompetitionTeamTids(spec, source);
  const gidBase = nextConf === 'commissioners' ? 810_000 : 820_000;
  return generateForCompetition(spec, tids.map(tid => ({ tid })), start, gidBase);
}

export function getConferenceStartDate(conf: PbaConference, seasonYear: number): string {
  const d = new Date(`${getConferenceStartIso(conf, seasonYear)}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getConferenceStartIso(conf: PbaConference, seasonYear: number): string {
  const spec = getConferenceSpec(conf);
  const calYear = conf === 'philippine' && spec.seasonStart.month >= 7 ? seasonYear - 1 : seasonYear;
  const month = String(spec.seasonStart.month).padStart(2, '0');
  const day = String(spec.seasonStart.day).padStart(2, '0');
  return `${calYear}-${month}-${day}`;
}

function getConferenceDateIso(conf: PbaConference, seasonYear: number, month: number, day: number): string {
  return dateForCompetitionSeason(getConferenceSpec(conf), seasonYear, month, day).slice(0, 10);
}

function getConferencePlayoffStartIso(conf: PbaConference, seasonYear: number): string | null {
  const round = getConferenceSpec(conf).playoffFormat?.rounds[0];
  if (!round) return null;
  return getConferenceDateIso(conf, seasonYear, round.start.month, round.start.day);
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

  const spec = getConferenceSpec(conf);
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

function expectedPbaRegularSeasonGames(spec: ReturnType<typeof getConferenceSpec>, teamCount: number): number {
  if (teamCount < 2) return 0;
  const gamesPerTeam = Math.floor(Number(spec.gamesPerTeam ?? teamCount - 1));
  if (gamesPerTeam > 0 && gamesPerTeam < teamCount - 1) return Math.floor((teamCount * gamesPerTeam) / 2);
  const singleRoundRobin = (teamCount * (teamCount - 1)) / 2;
  return (spec.gamesPerTeam ?? 0) >= (teamCount - 1) * 2 ? singleRoundRobin * 2 : singleRoundRobin;
}

function ensureActivePbaConferenceSchedule(
  state: GameState,
  leagueStats: any,
  conference: PbaConference,
  seasonYear: number,
): GameState {
  if (leagueStats?.pbaConferencePhase !== 'regularSeason') return state;
  const spec = getConferenceSpec(conference);
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
    tids.some((tid: number) => !participants.has(tid))
  );
  const hasFutureRegular = schedule.some((game: any) =>
    game.competitionId === spec.id &&
    !game.played &&
    isPbaRegularSeasonGame(game) &&
    normalizeDate(game.date) >= today,
  );
  if (hasFutureRegular && !isSparse) return state;

  const playedKeys = new Set(
    schedule
      .filter((game: any) => game.competitionId === spec.id && game.played && isPbaRegularSeasonGame(game))
      .map(regularGameKey),
  );
  const nextGid = Math.max(getPbaGidBase(conference), ...schedule.map((game: any) => Number(game.gid) || 0)) + 1;
  const generated = generateForCompetition(
    spec,
    tids.map((tid: number) => ({ tid })),
    new Date(`${getConferenceStartIso(conference, seasonYear)}T00:00:00Z`),
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
  return {
    ...state,
    schedule: [...cleanedSchedule, ...generated]
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid),
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

function disablePbaSalaryCapFields(leagueStats: any): any {
  const next = {
    ...leagueStats,
    salaryCapEnabled: false,
    salaryCapType: 'none',
    luxuryTaxEnabled: false,
    apronsEnabled: false,
    minimumPayrollEnabled: false,
    mleEnabled: false,
  };
  return (
    leagueStats?.salaryCapEnabled === false &&
    leagueStats?.salaryCapType === 'none' &&
    leagueStats?.luxuryTaxEnabled === false &&
    leagueStats?.apronsEnabled === false &&
    leagueStats?.minimumPayrollEnabled === false &&
    leagueStats?.mleEnabled === false
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
      ? initialPbaEndOfSeasonChecklist()
      : initialPbaInterConferenceChecklist(conference),
  };
}

function hasConferencePostseasonMaterial(state: GameState, competitionId: string): boolean {
  return [
    ...(state.schedule ?? []),
    ...(state.boxScores ?? []),
  ].some((game: any) =>
    game?.competitionId === competitionId &&
    ['qf', 'sf', 'final'].includes(String(game?.competitionPhase ?? '')),
  );
}

function injectReadyPbaPostseason(state: GameState, leagueStats: any, conference: PbaConference, season: number): GameState | null {
  if (!isPbaActiveConferencePhase(leagueStats?.pbaConferencePhase)) return null;
  if (isBeforeConferencePlayoffs(state, conference, season)) return null;
  const spec = getConferenceSpec(conference);
  const schedule = state.schedule ?? [];
  const currentGames = schedule.filter((game: any) => game.competitionId === spec.id);
  if (currentGames.length === 0) return null;
  const teamTids = selectCompetitionTeamTids(spec, state as any);
  const expectedRegular = expectedPbaRegularSeasonGames(spec, teamTids.length);
  if (expectedRegular > 0 && selectCountedPbaRegularBoxScores(state.boxScores ?? [], spec, season).length < expectedRegular) return null;
  if (hasConferencePostseasonMaterial(state, spec.id)) return null;
  const scheduleForPostseason = schedule.filter((game: any) =>
    game.competitionId !== spec.id ||
    game.played ||
    isPbaPostseasonGame(game),
  );
  const nextSchedule = injectCompetitionPostseasonGames({ ...state, leagueStats, schedule: scheduleForPostseason } as any, [spec] as any, season);
  if (nextSchedule.length <= scheduleForPostseason.length) return null;
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
  const currentSeason = Number(leagueStats?.year ?? position.seasonYear);
  const preparedYearEndSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
  const completedConferenceSeason = Number.isFinite(preparedYearEndSeason) ? preparedYearEndSeason : position.seasonYear;
  const currentSpec = getConferenceSpec(currentConference);
  const currentGames = (state.schedule ?? []).filter((game: any) => game.competitionId === currentSpec.id);
  const currentBoxes = (state.boxScores ?? []).filter((game: any) => game.competitionId === currentSpec.id);
  const shouldKeepCompletedCurrentConference =
    currentConference === position.conference &&
    currentPhase === 'offseason' &&
    hasRecordedConferenceChampion(leagueStats, currentConference, completedConferenceSeason);
  const shouldKeepUnresolvedCurrentConference =
    currentConference !== position.conference &&
    isPbaActiveConferencePhase(currentPhase) &&
    (currentGames.length > 0 || currentBoxes.length > 0) &&
    !hasRecordedConferenceChampion(leagueStats, currentConference, currentSeason);
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
      phase: hasConferencePostseasonMaterial(state, currentSpec.id) ? 'playoffs' : currentPhase,
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

  const spec = getConferenceSpec(position.conference);
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
        new Date(`${getConferenceStartIso(position.conference, position.seasonYear)}T00:00:00Z`),
        position.conference === 'philippine' ? 800_000 : position.conference === 'commissioners' ? 810_000 : 820_000,
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
  const importManagedState = current === 'commissioners' || current === 'governors'
    ? autoManagePbaImports(state, current, {
        allowInjuryReplacements: true,
        excludeUserTeam: state.gameMode === 'gm',
        fillMissingTeams: true,
      })
    : state;
  const basePatch: Partial<GameState> = importManagedState !== state
    ? { players: importManagedState.players, history: importManagedState.history }
    : {};
  const spec = getConferenceSpec(current);
  const season = (importManagedState.leagueStats as any)?.year ?? new Date().getFullYear();
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

  const currentGames = schedule.filter((game: any) => game.competitionId === spec.id);
  const hasPostseasonMaterial =
    currentGames.some((game: any) => ['qf', 'sf', 'final'].includes(String(game.competitionPhase))) ||
    [...(importManagedState.boxScores ?? []), ...pendingBoxScores].some((game: any) =>
      game.competitionId === spec.id && ['qf', 'sf', 'final'].includes(String(game.competitionPhase)),
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
  const nextConference = getNextConference(current);
  const awardPatch = buildPbaLiveAwardPatch(
    { ...importManagedState, boxScores } as GameState,
    current,
    spec.id,
    resolution.championTid,
    resolution.runnerUpTid,
  );
  const awardMeta = awardPatch.conferenceAwardMeta ?? {};
  const recordedChampion = {
    season,
    conference: current,
    teamId: resolution.championTid,
    teamName: championName,
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
  } as any;
  const clearedPlayers = clearConferenceImports(importManagedState.players, current);

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
    const nextNonNBATeams = advancePbaStaffContractsForOffseason(importManagedState.nonNBATeams);
    const seasonAwardPatch = buildPbaSeasonAwardPatch({
      ...importManagedState,
      ...awardPatch,
      leagueStats: nextLeagueStats,
      nonNBATeams: nextNonNBATeams,
      boxScores,
      history,
    } as GameState);
    return {
      ...basePatch,
      ...awardPatch,
      ...seasonAwardPatch,
      players: clearedPlayers,
      nonNBATeams: nextNonNBATeams,
      leagueStats: nextLeagueStats,
      schedule: schedule.filter((game: any) => game.competitionId !== spec.id || game.played),
      offseasonChecklist: initialPbaEndOfSeasonChecklist(),
      history,
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
