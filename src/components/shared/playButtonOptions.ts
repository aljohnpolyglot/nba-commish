import { Tab } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import {
  getDraftDate,
  getDraftLotteryDate,
  isDraftBlockedByUnresolvedPlayoffs,
  toISODateString,
} from '../../utils/dateUtils';
import { getOffseasonState, type OffseasonPhase } from '../../services/offseason/offseasonState';
import { isEuroVisibleScheduleGame } from '../../utils/euroLeagueDefaults';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { resolveCompetitionSeason } from '../../services/competition/competitionResolver';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import {
  getPbaConferenceCalendarForSeason,
  resolvePbaSeasonDate,
} from '../../services/pba/calendar';
import {
  competitionSeasonForBox,
  isPbaRegularPhase,
  PBA_POSTSEASON_PHASES,
} from '../../services/pba/competitionGames';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';

export type SimPhase =
  | 'preseason'
  | 'regular-season'
  | 'playin'
  | 'playoffs'
  | 'draft-lottery'
  | 'draft'
  | 'after-draft'
  | 'free-agency';

export interface PlayOption {
  label: string;
  action: () => void;
}

export function addDays(dateStr: string, days: number): string {
  const norm = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : normalizeDate(dateStr);
  const date = new Date(`${norm}T00:00:00Z`);
  if (isNaN(date.getTime())) return dateStr;
  date.setUTCDate(date.getUTCDate() + days);
  return toISODateString(date);
}

export function addDaysToDate(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function offseasonPhaseToSimPhase(phase: OffseasonPhase, draftComplete: boolean): SimPhase | null {
  switch (phase) {
    case 'draftDay':   return draftComplete ? 'after-draft' : 'draft';
    case 'postDraft':  return 'after-draft';
    case 'moratorium': return 'free-agency';
    case 'birdRights': return 'free-agency';
    case 'openFA':     return 'free-agency';
    case 'preCamp':    return 'preseason';
    default:           return null;
  }
}

export function getSimPhase(state: any): SimPhase {
  const norm = normalizeDate(state.date);
  const currentDate = new Date(`${norm}T00:00:00Z`);
  const leagueStats = state.leagueStats;
  const seasonYear: number = leagueStats?.year ?? currentDate.getUTCFullYear();
  const lotteryEnabled = isDraftLotteryEnabled(leagueStats?.draftType);
  const draftLotteryDate = getDraftLotteryDate(seasonYear, leagueStats);
  const draftDate = getDraftDate(seasonYear, leagueStats);
  const hasPlayIn = (state.playoffs?.playInGames ?? []).some((game: any) => !game.winner);
  const hasActivePlayoffs = (state.playoffs?.series ?? []).some((series: any) => series.status !== 'complete');
  const draftBlockedByPlayoffs = isDraftBlockedByUnresolvedPlayoffs(state);
  const draftComplete = resolveLeagueSeasonLifecycle(state).draft.draft === 'complete';
  const offseasonState = getOffseasonState(state.date, leagueStats, state.schedule, {
    draftComplete,
    playoffsActive: hasActivePlayoffs,
  });
  const fromOrchestrator = offseasonPhaseToSimPhase(offseasonState.phase, draftComplete);
  const playoffsBlockOrchestrator = hasActivePlayoffs || draftBlockedByPlayoffs;
  const firstRegularSeasonDate = findFirstRegularSeasonDate(state);
  const lastUnplayedRegularSeasonDate = findLastRegSeasonDate(state);

  if (hasActivePlayoffs || draftBlockedByPlayoffs) return 'playoffs';
  if (hasPlayIn && !hasActivePlayoffs) return 'playin';
  if (
    firstRegularSeasonDate
    && lastUnplayedRegularSeasonDate
    && norm >= firstRegularSeasonDate
    && norm <= lastUnplayedRegularSeasonDate
  ) return 'regular-season';

  if (
    fromOrchestrator &&
    !(fromOrchestrator === 'after-draft' && playoffsBlockOrchestrator) &&
    !(fromOrchestrator === 'draft' && playoffsBlockOrchestrator)
  ) {
    return fromOrchestrator;
  }

  if (firstRegularSeasonDate && norm < firstRegularSeasonDate) return 'preseason';
  if (lastUnplayedRegularSeasonDate && norm <= lastUnplayedRegularSeasonDate) return 'regular-season';
  if (draftComplete) return 'after-draft';
  if (currentDate > draftDate) return 'after-draft';
  if (toISODateString(draftDate) === norm) return draftComplete ? 'after-draft' : 'draft';
  if (lotteryEnabled && currentDate >= draftLotteryDate) return 'draft-lottery';
  return 'regular-season';
}

export function getPhaseLabel(phase: SimPhase, seasonYear: number, calYear: number, lotteryComplete = false): string {
  switch (phase) {
    case 'preseason':      return `${calYear} preseason`;
    case 'regular-season': return `${seasonYear} regular season`;
    case 'playin':         return `${seasonYear} play-in`;
    case 'playoffs':       return `${seasonYear} playoffs`;
    case 'draft-lottery':  return lotteryComplete ? `${seasonYear} pre-draft` : `${seasonYear} draft lottery`;
    case 'draft':          return `${seasonYear} draft`;
    case 'after-draft':    return `${seasonYear} offseason`;
    case 'free-agency':    return `${seasonYear} free agency`;
  }
}

export function getEuroPhaseLabel(state: any, seasonYear: number): string {
  const unplayedCompetitionGames = (state.schedule ?? []).filter((game: any) =>
    game.competitionId &&
    !game.played &&
    isEuroVisibleScheduleGame(state, game),
  ).sort((left: any, right: any) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)));
  const next = unplayedCompetitionGames[0];
  if (!next) return `${seasonYear} European offseason`;
  const spec = (state.activeCompetitions ?? []).find((competition: any) => competition.id === next.competitionId);
  const label = competitionDisplayLabel(spec);
  if (next.competitionPhase === 'play-in') return `${seasonYear} ${label} play-in`;
  if (next.competitionPhase === 'qf') return `${seasonYear} ${label} quarterfinals`;
  if (next.competitionPhase === 'sf') return `${seasonYear} ${label} semifinals`;
  if (next.competitionPhase === 'final') return `${seasonYear} ${label} final`;
  if (next.competitionPhase === 'group' || next.competitionPhase?.startsWith('r')) return `${seasonYear} ${label}`;
  return `${seasonYear} European offseason`;
}

export function minScheduledDate(games: any[]): string | null {
  if (!games.length) return null;
  return normalizeDate(games.reduce((a, b) => (normalizeDate(a.date) < normalizeDate(b.date) ? a : b)).date);
}

function maxScheduledDate(games: any[]): string | null {
  if (!games.length) return null;
  return normalizeDate(games.reduce((a, b) => (normalizeDate(a.date) > normalizeDate(b.date) ? a : b)).date);
}

export function findFirstPreseasonDate(state: any): string | null {
  return minScheduledDate((state.schedule ?? []).filter((game: any) => game.isPreseason && !game.played));
}

export function findLastPreseasonDate(state: any): string | null {
  return maxScheduledDate((state.schedule ?? []).filter((game: any) => game.isPreseason && !game.played));
}

export function findFirstRegularSeasonDate(state: any): string | null {
  return minScheduledDate(
    (state.schedule ?? []).filter((game: any) =>
      !game.isPreseason &&
      !game.isPlayoff &&
      !game.isPlayIn &&
      !game.isAllStar &&
      !game.isRisingStars &&
      !game.isCelebrity &&
      !game.isExhibition &&
      !game.isNBACup &&
      !game.isCupTBD,
    ),
  );
}

export function findLastRegSeasonDate(state: any): string | null {
  return maxScheduledDate(
    (state.schedule ?? []).filter((game: any) => !game.isPreseason && !game.isPlayoff && !game.isPlayIn && !game.played),
  );
}

export function findFirstPlayInDate(state: any): string | null {
  return minScheduledDate((state.schedule ?? []).filter((game: any) => game.isPlayIn && !game.played));
}

export function findPlayInEndDate(state: any): string | null {
  return maxScheduledDate((state.schedule ?? []).filter((game: any) => game.isPlayIn && !game.played));
}

export function findFirstTruePlayoffDate(state: any): string | null {
  return minScheduledDate((state.schedule ?? []).filter((game: any) => game.isPlayoff && !game.isPlayIn && !game.played));
}

export function findLastTruePlayoffDate(state: any): string | null {
  const playoffGames = (state.schedule ?? []).filter((game: any) => game.isPlayoff && !game.isPlayIn);
  if (state.playoffs?.bracketComplete) {
    return maxScheduledDate(playoffGames.filter((game: any) => game.played));
  }
  return maxScheduledDate(playoffGames.filter((game: any) => !game.played));
}

export function findPlayoffRoundEndDate(state: any): string | null {
  const activeSeries = (state.playoffs?.series ?? []).filter((series: any) => series.status !== 'complete');
  if (!activeSeries.length) return null;
  const minRound = Math.min(...activeSeries.map((series: any) => series.round ?? 1));
  const currentRoundIds = new Set(activeSeries.filter((series: any) => (series.round ?? 1) === minRound).map((series: any) => series.id));
  return maxScheduledDate(
    (state.schedule ?? []).filter(
      (game: any) => game.isPlayoff && !game.isPlayIn && !game.played && game.playoffSeriesId && currentRoundIds.has(game.playoffSeriesId),
    ),
  );
}

function isCompetitionRegularPhase(game: any): boolean {
  return game.competitionId && (game.competitionPhase === 'group' || game.competitionPhase?.startsWith('r'));
}

export function findFirstCompetitionDate(state: any, competitionId?: string, phases?: string[]): string | null {
  return minScheduledDate(
    (state.schedule ?? []).filter((game: any) =>
      game.competitionId &&
      !game.played &&
      (!competitionId || game.competitionId === competitionId) &&
      (!phases || phases.includes(game.competitionPhase)),
    ),
  );
}

export function findLastCompetitionDate(state: any, competitionId?: string, phases?: string[]): string | null {
  return maxScheduledDate(
    (state.schedule ?? []).filter((game: any) =>
      game.competitionId &&
      !game.played &&
      (!competitionId || game.competitionId === competitionId) &&
      (!phases || phases.includes(game.competitionPhase)),
    ),
  );
}

export function findLastCompetitionRegularDate(state: any, competitionId?: string): string | null {
  return maxScheduledDate(
    (state.schedule ?? []).filter((game: any) =>
      !game.played &&
      isCompetitionRegularPhase(game) &&
      (!competitionId || game.competitionId === competitionId),
    ),
  );
}

export function competitionRegularComplete(state: any, competitionId: string): boolean {
  return !(state.schedule ?? []).some((game: any) =>
    game.competitionId === competitionId &&
    !game.played &&
    isCompetitionRegularPhase(game),
  );
}

export function getPbaConferencePlayState(state: any, spec: any, seasonYear: number) {
  const isCurrentSeason = (game: any) =>
    game?.competitionId === spec.id && competitionSeasonForBox(spec, game) === seasonYear;
  const currentSchedule = (state.schedule ?? []).filter(isCurrentSeason);
  const currentBoxScores = (state.boxScores ?? []).filter(isCurrentSeason);
  const currentRows = [...currentSchedule, ...currentBoxScores];
  const unplayedGames = currentSchedule
    .filter((game: any) => !game.played)
    .sort((left: any, right: any) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)));
  const unplayedRegularGames = unplayedGames.filter((game: any) => isPbaRegularPhase(game.competitionPhase));
  const unplayedPostseasonGames = unplayedGames.filter((game: any) =>
    PBA_POSTSEASON_PHASES.has(String(game.competitionPhase ?? '')),
  );
  const hasRegularSeasonMaterial = currentRows.some((game: any) => isPbaRegularPhase(game.competitionPhase));
  const postseasonMaterialized = currentRows.some((game: any) =>
    PBA_POSTSEASON_PHASES.has(String(game.competitionPhase ?? '')),
  );
  return {
    currentSchedule,
    currentBoxScores,
    unplayedGames,
    unplayedRegularGames,
    unplayedPostseasonGames,
    hasCurrentCompetitionMaterial: currentRows.length > 0,
    hasRegularSeasonMaterial,
    regularComplete: hasRegularSeasonMaterial && unplayedRegularGames.length === 0,
    postseasonMaterialized,
  };
}

export function competitionRoundDate(
  state: any,
  seasonYear: number,
  competitionId: string,
  phases: string[],
  edge: 'start' | 'end',
): string | null {
  const spec = (state.activeCompetitions ?? []).find((competition: any) => competition.id === competitionId);
  const round = spec?.playoffFormat?.rounds?.find((entry: any) => phases.includes(entry.phase));
  if (competitionId.startsWith('pba-') && round?.phase) {
    const calendar = getPbaConferenceCalendarForSeason(competitionId, seasonYear);
    const phase = round.phase as 'qf' | 'sf' | 'final';
    const pbaDate = calendar.playoffs?.[phase]?.[edge];
    if (pbaDate) return resolvePbaSeasonDate(seasonYear, pbaDate);
  }
  const date = round?.[edge];
  if (!date) return null;
  const year = date.month >= 9 ? seasonYear - 1 : seasonYear;
  return `${year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

const EURO_POSTSEASON_PHASES = ['play-in', 'qf', 'sf', 'final'];

function isEuroPostseasonPhase(phase?: string): boolean {
  return !!phase && EURO_POSTSEASON_PHASES.includes(phase);
}

export function clampToToday(date: string, today: string): string {
  return normalizeDate(date) <= today ? today : normalizeDate(date);
}

function competitionDisplayLabel(spec: any): string {
  return spec?.displayName || spec?.name || spec?.shortName || 'competition';
}

function relatedUserTeamIds(state: any): Set<number> {
  const ids = new Set<number>();
  if (state.userTeamId !== undefined && state.userTeamId !== null) ids.add(state.userTeamId);
  if (state.controlledTeams?.length) {
    state.controlledTeams.forEach((teamId: number) => ids.add(teamId));
  }
  return ids;
}

function euroRoundSpecEndDate(state: any, seasonYear: number, competitionId: string, phase: string): string | null {
  const aliases = phase === 'qf'
    ? ['qf', 'quarterfinals']
    : phase === 'sf'
      ? ['sf', 'semifinals', 'final-four']
      : [phase];
  return competitionRoundDate(state, seasonYear, competitionId, aliases, 'end');
}

export function getEuroCompetitionTarget(state: any, seasonYear: number, norm: string, currentView?: Tab | null) {
  const relatedTeams = relatedUserTeamIds(state);
  const visibleCompetitions = (state.activeCompetitions ?? []).filter((spec: any) => spec.id !== 'nba');
  const priorityView = typeof currentView === 'string' ? currentView.toLowerCase() : '';
  const participatingByNextDate = visibleCompetitions
    .map((spec: any) => ({
      spec,
      nextDate: minScheduledDate((state.schedule ?? []).filter((game: any) =>
        game.competitionId === spec.id
        && !game.played
        && (relatedTeams.has(game.homeTid) || relatedTeams.has(game.awayTid)),
      )),
    }))
    .filter((entry: any) => !!entry.nextDate)
    .sort((left: any, right: any) => left.nextDate.localeCompare(right.nextDate));
  const targetSpec = visibleCompetitions.find((spec: any) => priorityView.includes(spec.id))
    ?? participatingByNextDate[0]?.spec
    ?? visibleCompetitions[0];

  if (!targetSpec) return null;

  const nextGame = (state.schedule ?? [])
    .filter((game: any) => game.competitionId === targetSpec.id && !game.played)
    .sort((a: any, b: any) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)))[0];
  const nextPostseasonGame = (state.schedule ?? [])
    .filter((game: any) => game.competitionId === targetSpec.id && !game.played && isEuroPostseasonPhase(game.competitionPhase))
    .sort((a: any, b: any) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)))[0];
  const roundEnd = nextPostseasonGame
    ? euroRoundSpecEndDate(state, seasonYear, targetSpec.id, nextPostseasonGame.competitionPhase)
    : null;
  const postseasonStart = findFirstCompetitionDate(state, targetSpec.id, EURO_POSTSEASON_PHASES);
  const postseasonEnd = [
    findLastCompetitionDate(state, targetSpec.id, EURO_POSTSEASON_PHASES),
    euroRoundSpecEndDate(state, seasonYear, targetSpec.id, 'final'),
    competitionRoundDate(state, seasonYear, targetSpec.id, ['final-four'], 'end'),
    competitionRoundDate(state, seasonYear, targetSpec.id, ['qf', 'quarterfinals'], 'start'),
  ].filter((date): date is string => !!date).sort().at(-1) ?? null;
  const regularComplete = competitionRegularComplete(state, targetSpec.id);
  const participantTids = selectCompetitionTeamTids(targetSpec, state);
  const resolution = resolveCompetitionSeason(
    targetSpec,
    state.boxScores ?? [],
    seasonYear,
    participantTids,
  );
  const competitionResolved = resolution?.championTid != null;
  const firstPostseasonPhase = String(targetSpec.playoffFormat?.rounds?.[0]?.phase ?? 'qf');
  const minimumPostseasonParticipants = firstPostseasonPhase === 'final'
    ? 2
    : firstPostseasonPhase === 'sf' || firstPostseasonPhase === 'semifinals' || firstPostseasonPhase === 'final-four'
      ? 4
      : 8;
  const postseasonMaterialized = (state.schedule ?? []).some((game: any) =>
    game.competitionId === targetSpec.id && isEuroPostseasonPhase(game.competitionPhase),
  ) || (state.boxScores ?? []).some((game: any) =>
    game.competitionId === targetSpec.id && isEuroPostseasonPhase(game.competitionPhase),
  );
  const postseasonSeedError = !competitionResolved
    && regularComplete
    && !!postseasonEnd
    && norm >= (postseasonStart ?? competitionRoundDate(state, seasonYear, targetSpec.id, ['qf', 'quarterfinals', 'final-four'], 'start') ?? postseasonEnd)
    && !postseasonMaterialized
    && (participantTids.length < minimumPostseasonParticipants || !resolution);
  const postseasonActive = !competitionResolved && (
    !!nextPostseasonGame || (regularComplete && !!postseasonEnd && (!postseasonStart || norm >= postseasonStart))
  );

  return {
    id: targetSpec.id as string,
    label: competitionDisplayLabel(targetSpec),
    nextGameDate: nextGame ? normalizeDate(nextGame.date) : null,
    roundEndDate: roundEnd,
    postseasonEndDate: postseasonEnd,
    postseasonActive,
    competitionResolved,
    postseasonSeedError,
  };
}

export function pushFutureOption(options: PlayOption[], norm: string, label: string, date: string | null, action: (date: string) => void) {
  if (date && date > norm && !options.some(option => option.label === label)) {
    options.push({ label, action: () => action(date) });
  }
}
