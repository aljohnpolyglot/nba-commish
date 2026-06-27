import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import {
  getTradeDeadlineDate, getDraftLotteryDate, getDraftDate,
  getCurrentOffseasonEffectiveFAStart, getOpeningNightDate, getTrainingCampDate,
  getAllStarWeekendStartDate, getCurrentOffseasonFAMoratoriumEnd, toISODateString,
} from '../../utils/dateUtils';
import { Tab } from '../../types';
import { useDraftEventGate } from '../../hooks/useDraftEventGate';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';
import { useTeamOptionGate } from '../../hooks/useTeamOptionGate';
import { useExpiringResignGate } from '../../hooks/useExpiringResignGate';
import { useTycoonYearEndGate } from '../../hooks/useTycoonYearEndGate';
import {
  computeUpcomingSeasonYear,
  isNoDraftLeague,
} from '../../services/offseason/offseasonState';
import {
  firstUnfinishedRow,
  getVisibleOffseasonRows,
  OFFSEASON_ROW_LABELS,
  OFFSEASON_ROW_TAB,
} from '../../services/offseason/offseasonChecklistState';
import { isEuroIsolatedMode, isPbaActiveConferenceMode, isPbaIsolatedMode, isPbaOffseasonMode } from '../../utils/uiMode';
import { userQualifiesForContinental } from '../../utils/euroLeagueDefaults';
import { isInTransferWindow } from '../../utils/transferWindow';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { autoRunDraft } from '../../services/logic/autoResolversParts/draftResolvers';
import {
  addDays,
  addDaysToDate,
  clampToToday,
  competitionRegularComplete,
  competitionRoundDate,
  findFirstCompetitionDate,
  findFirstPlayInDate,
  findFirstPreseasonDate,
  findFirstRegularSeasonDate,
  findFirstTruePlayoffDate,
  findLastCompetitionDate,
  findLastCompetitionRegularDate,
  findLastPreseasonDate,
  findLastRegSeasonDate,
  findLastTruePlayoffDate,
  findPlayInEndDate,
  findPlayoffRoundEndDate,
  getEuroCompetitionTarget,
  getEuroPhaseLabel,
  getPhaseLabel,
  getSimPhase,
  minScheduledDate,
  type PlayOption,
  pushFutureOption,
} from './playButtonOptions';

interface PlayButtonProps {
  setCurrentView: (v: Tab) => void;
}

export const PlayButton: React.FC<PlayButtonProps> = ({ setCurrentView }) => {
  const { state, dispatchAction, currentView } = useGame();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const norm = normalizeDate(state.date);
  const ls = state.leagueStats;
  const seasonYear: number = ls?.year ?? new Date(state.date).getUTCFullYear();
  const calDate = new Date(`${norm}T00:00:00Z`);
  const calYear = calDate.getUTCFullYear();
  const calMonth = calDate.getUTCMonth() + 1;
  const isEuro = isEuroIsolatedMode(state);
  const isPba = isPbaIsolatedMode(state);
  const preseasonSeasonYear = isPba ? computeUpcomingSeasonYear(calMonth, calYear, ls?.year ?? calYear) : seasonYear;
  const noDraft = isNoDraftLeague(ls);
  const transferWindowStatus = useMemo(
    () => (isEuro ? isInTransferWindow(state.date ?? new Date(), state.leagueStats as any) : null),
    [isEuro, state.date, state.leagueStats],
  );
  const unresolvedEuroTransferMarket = isEuro && state.offseasonChecklist?.transferMarket !== 'done' && state.offseasonChecklist?.transferMarket !== 'skipped';

  const phase = getSimPhase(state);
  const phaseLabel = useMemo(() => {
    if (isPba) {
      const currentConference = (state.leagueStats as any)?.pbaConference ?? 'philippine';
      const currentSpec = currentConference === 'commissioners'
        ? PBA_COMPETITIONS[1]
        : currentConference === 'governors'
          ? PBA_COMPETITIONS[2]
          : PBA_COMPETITIONS[0];
      const upcomingGames = (state.schedule ?? [])
        .filter((game: any) => game.competitionId === currentSpec.id && !game.played)
        .sort((a: any, b: any) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
      const nextPhase = upcomingGames[0]?.competitionPhase;
      if (nextPhase === 'play-in' || nextPhase === 'qf' || nextPhase === 'sf' || nextPhase === 'final') return `${currentSpec.shortName} playoffs`;
      if (nextPhase === 'group' || nextPhase?.startsWith('r')) return `${currentSpec.shortName} regular season`;
      if (competitionRegularComplete(state, currentSpec.id) && !isPbaOffseasonMode(state)) return `${currentSpec.shortName} playoffs`;
      if (isPbaOffseasonMode(state)) return `${currentSpec.shortName} offseason`;
      return `${currentSpec.shortName} season`;
    }
    return isEuro ? getEuroPhaseLabel(state, seasonYear) : getPhaseLabel(phase, seasonYear, calYear);
  }, [isEuro, isPba, state, seasonYear, phase, calYear]);
  const isCommissioner = state.gameMode !== 'gm';
  const euroCompetitionState = useMemo(() => ({
    activeCompetitions: state.activeCompetitions,
    leagueStats: state.leagueStats,
    userTeamId: state.userTeamId,
    gameMode: state.gameMode,
    teams: state.teams,
    nonNBATeams: state.nonNBATeams,
    schedule: state.schedule,
    boxScores: state.boxScores,
    clubAliasMap: (state as any).clubAliasMap,
  }), [
    state.activeCompetitions,
    state.leagueStats,
    state.userTeamId,
    state.gameMode,
    state.teams,
    state.nonNBATeams,
    state.schedule,
    state.boxScores,
    (state as any).clubAliasMap,
  ]);

  const draftGate = useDraftEventGate({
    onNavigateToDraftLottery: () => setCurrentView('Draft Lottery' as Tab),
    onNavigateToDraft: () => setCurrentView('Draft Board' as Tab),
  });
  const rosterGate = useRosterComplianceGate();
  const teamOptionGate = useTeamOptionGate({
    onNavigateManual: () => setCurrentView('Team Office' as Tab),
  });
  const expiringGate = useExpiringResignGate({
    onNavigateManual: () => setCurrentView('Team Office' as Tab),
  });
  const tycoonYearEndGate = useTycoonYearEndGate();

  const guardedSim = useCallback((fn: () => void | Promise<void>, targetDate?: string) => {
    expiringGate.attempt(() => {
      teamOptionGate.attempt(() => {
        rosterGate.attempt(() => {
          draftGate.attempt(() => {
            tycoonYearEndGate.attempt(fn, targetDate);
          });
        });
      }, targetDate);
    }, targetDate);
  }, [draftGate, expiringGate, rosterGate, teamOptionGate, tycoonYearEndGate]);

  const simDay = useCallback(() => {
    setOpen(false);
    guardedSim(() => dispatchAction({ type: 'ADVANCE_DAY' }), addDays(norm, 1));
  }, [dispatchAction, guardedSim, norm]);

  const simToDate = useCallback((date: string) => {
    setOpen(false);
    guardedSim(
      () => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: date, stopBefore: true } } as any),
      date,
    );
  }, [dispatchAction, guardedSim]);

  const simThrough = useCallback((date: string) => {
    setOpen(false);
    guardedSim(
      () => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: date } } as any),
      date,
    );
  }, [dispatchAction, guardedSim]);

  const simPbaThroughConferenceTransition = useCallback((date: string) => {
    setOpen(false);
    guardedSim(
      () => dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: date, autoResolveOffseasonTasks: true },
      } as any),
      date,
    );
  }, [dispatchAction, guardedSim]);

  const simDraftToEnd = useCallback(() => {
    setOpen(false);
    const targetDate = addDays(norm, 1);
    guardedSim(
      () => dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate, stopBefore: true, assistantGM: true },
      } as any),
      targetDate,
    );
  }, [dispatchAction, guardedSim, norm]);

  const simPbaDraftToEnd = useCallback(() => {
    setOpen(false);
    const patch = autoRunDraft(state as any);
    if ((patch as any)?.draftComplete) {
      dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaDraft' } } as any);
    } else {
      setCurrentView('Draft Board' as Tab);
    }
  }, [dispatchAction, setCurrentView, state]);

  const navigate = useCallback((view: Tab) => {
    setOpen(false);
    setCurrentView(view);
  }, [setCurrentView]);

  const options: PlayOption[] = useMemo(() => {
    if (isPba) {
      const currentConference = (state.leagueStats as any)?.pbaConference ?? 'philippine';
      const currentSpec = currentConference === 'commissioners'
        ? PBA_COMPETITIONS[1]
        : currentConference === 'governors'
          ? PBA_COMPETITIONS[2]
          : PBA_COMPETITIONS[0];
      const conferenceGames = (state.schedule ?? [])
        .filter((game: any) => game.competitionId === currentSpec.id && !game.played)
        .sort((a: any, b: any) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
      const playoffPhases = ['play-in', 'qf', 'sf', 'final'];
      const playoffGames = conferenceGames.filter((game: any) => playoffPhases.includes(String(game.competitionPhase)));
      const pbaPhase = String((state.leagueStats as any)?.pbaConferencePhase ?? '');
      const nextGame = pbaPhase === 'playoffs' && playoffGames.length > 0 ? playoffGames[0] : conferenceGames[0];
      const nextDate = nextGame ? normalizeDate(nextGame.date) : null;
      const nextPhase = nextGame?.competitionPhase;
      const samePhaseGames = nextPhase
        ? (playoffPhases.includes(String(nextPhase)) ? playoffGames : conferenceGames).filter((game: any) => game.competitionPhase === nextPhase)
        : [];
      const phaseEnd = samePhaseGames.length > 0 ? normalizeDate(samePhaseGames[samePhaseGames.length - 1].date) : null;
      const conferenceEnd = conferenceGames.length > 0 ? normalizeDate(conferenceGames[conferenceGames.length - 1].date) : null;
      const regularComplete = competitionRegularComplete(state, currentSpec.id);
      const regularSeasonEnd = findLastCompetitionRegularDate(state, currentSpec.id);
      const firstPlayoffDate = findFirstCompetitionDate(state, currentSpec.id, playoffPhases)
        ?? (regularComplete ? competitionRoundDate(state, seasonYear, currentSpec.id, ['qf', 'quarterfinals'], 'start') : null);
      const firstPlayoffPhase = playoffGames[0]?.competitionPhase;
      const playoffRoundEnd = firstPlayoffPhase
        ? normalizeDate(playoffGames.filter((game: any) => game.competitionPhase === firstPlayoffPhase).at(-1)?.date ?? playoffGames[0].date)
        : regularComplete
          ? competitionRoundDate(state, seasonYear, currentSpec.id, ['qf', 'quarterfinals'], 'end')
          : null;
      const playoffEnd = findLastCompetitionDate(state, currentSpec.id, playoffPhases)
        ?? (regularComplete ? competitionRoundDate(state, seasonYear, currentSpec.id, ['final', 'final-four'], 'end') : null);
      const hasNextPlayoff = !!nextPhase && playoffPhases.includes(String(nextPhase));
      const playoffsActive = pbaPhase === 'playoffs' || hasNextPlayoff || (!!firstPlayoffDate && regularComplete && norm >= firstPlayoffDate);
      if (playoffsActive) {
        const playoffOpts: PlayOption[] = [];
        if (nextDate) {
          playoffOpts.push({ label: 'Sim Next Game', action: () => simThrough(clampToToday(nextDate, norm)) });
        }
        if (phaseEnd) {
          playoffOpts.push({ label: 'Sim Round', action: () => simThrough(clampToToday(phaseEnd, norm)) });
        } else if (playoffRoundEnd) {
          playoffOpts.push({ label: 'Sim Round', action: () => simThrough(clampToToday(playoffRoundEnd, norm)) });
        }
        if (playoffEnd) {
          playoffOpts.push({ label: 'Sim to Champion', action: () => simThrough(clampToToday(playoffEnd, norm)) });
        }
        playoffOpts.push({ label: 'One day', action: simDay });
        return playoffOpts;
      }
      const opts: PlayOption[] = [
        { label: 'One day', action: simDay },
        { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
        { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
      ];
      if (phaseEnd && phaseEnd >= norm) {
        if (hasNextPlayoff) {
          opts.push({ label: 'Sim playoff round', action: () => simThrough(phaseEnd) });
        }
      }
      if (!hasNextPlayoff && regularComplete && firstPlayoffDate && firstPlayoffDate >= norm) {
        opts.push({ label: `To ${currentSpec.shortName} playoffs`, action: () => simToDate(firstPlayoffDate) });
      }
      if (!hasNextPlayoff && regularComplete && playoffRoundEnd && playoffRoundEnd >= norm) {
        opts.push({ label: 'Sim playoff round', action: () => simThrough(playoffRoundEnd) });
      }
      if (regularComplete && playoffEnd && playoffEnd >= norm) {
        opts.push({
          label: currentConference === 'governors' ? 'Sim to next season' : 'Sim to next conference',
          action: () => currentConference === 'governors'
            ? simThrough(playoffEnd)
            : simPbaThroughConferenceTransition(playoffEnd),
        });
      } else if (!regularComplete && regularSeasonEnd && regularSeasonEnd >= norm) {
        opts.push({ label: `To ${currentSpec.shortName} playoffs`, action: () => simThrough(regularSeasonEnd) });
      } else if (conferenceEnd && conferenceEnd >= norm) {
        opts.push({ label: `Through ${currentSpec.shortName} playoffs`, action: () => simThrough(conferenceEnd) });
      }
      if (state.offseasonChecklist && !isPbaActiveConferenceMode(state)) {
        const visibleRows = getVisibleOffseasonRows(
          state.leagueStats as any,
          null,
          state.date,
          (state as any).expansionSchedule,
          state.offseasonChecklist,
          {
            lotteryResolved: !!(state.draftLotteryResult && state.draftLotteryResult.length > 0),
            draftComplete: !!state.draftComplete,
          },
        );
        if (visibleRows.length === 0) return opts;
        const nextRow = firstUnfinishedRow(state.offseasonChecklist as any, undefined, visibleRows);
        const openTask = (row: any) => {
          const tab = OFFSEASON_ROW_TAB[row as keyof typeof OFFSEASON_ROW_TAB];
          if (tab) {
            if (row === 'pbaLocalFreeAgency') {
              dispatchAction({
                type: 'UPDATE_STATE',
                payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } },
              } as any);
            }
            dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
            navigate(tab as Tab);
            return;
          }
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
        };
        opts.length = 0;
        if (nextRow) {
          const rowStatus = state.offseasonChecklist[nextRow];
          const canFinishReviewRow =
            rowStatus === 'in-progress' &&
            (nextRow === 'pbaLocalFreeAgency' || nextRow === 'pbaImportSearch');
          if (nextRow === 'pbaConferenceAwards') {
            opts.push({
              label: currentConference === 'governors' ? 'Sim to next season' : 'Sim to next conference',
              action: () => {
                dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: nextRow } } as any);
                const remainingRows = visibleRows.filter(row => row !== nextRow);
                openTask(firstUnfinishedRow(
                  { ...(state.offseasonChecklist as any), [nextRow]: 'done' },
                  undefined,
                  remainingRows,
                ) ?? (currentConference === 'governors' ? 'pbaDraft' : 'pbaImportSearch'));
              },
            });
          } else if (nextRow === 'pbaDraft') {
            opts.push(
              { label: 'Watch PBA Draft', action: () => openTask(nextRow) },
              { label: 'Sim to end of PBA Draft', action: simPbaDraftToEnd },
            );
          } else {
            opts.push({
              label: canFinishReviewRow
                ? `Finish ${OFFSEASON_ROW_LABELS[nextRow] ?? 'task'}`
                : `Open ${OFFSEASON_ROW_LABELS[nextRow] ?? 'next task'}`,
              action: () => {
                if (canFinishReviewRow) {
                  dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: nextRow } } as any);
                  return;
                }
                openTask(nextRow);
              },
            });
          }
        } else {
          opts.push({
            label: currentConference === 'governors' ? 'Enter New Season' : 'Enter Next Conference',
            action: () => {
              setOpen(false);
              dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
              setCurrentView('Schedule' as Tab);
            },
          });
        }
      }
      return opts;
    }

    if (isEuro) {
      const userCanSeeEuroleague = userQualifiesForContinental(euroCompetitionState as any);
      const competitionState = userCanSeeEuroleague
        ? euroCompetitionState
        : {
            ...euroCompetitionState,
            schedule: (state.schedule ?? []).filter((game: any) => game.competitionId !== 'euroleague'),
          };
      const firstFixture = findFirstCompetitionDate(competitionState);
      const nextFixture = minScheduledDate((competitionState.schedule ?? []).filter((game: any) =>
        game.competitionId && !game.played && normalizeDate(game.date) > norm,
      ));
      const currentOrNextFixture = minScheduledDate((competitionState.schedule ?? []).filter((game: any) =>
        game.competitionId && !game.played && normalizeDate(game.date) >= norm,
      ));
      const endesaRegularEnd = findLastCompetitionRegularDate(competitionState, 'endesa');
      const euroleagueRegularEnd = userCanSeeEuroleague ? findLastCompetitionRegularDate(competitionState, 'euroleague') : null;
      const endesaRegularIsComplete = competitionRegularComplete(competitionState, 'endesa');
      const euroleagueRegularIsComplete = userCanSeeEuroleague && competitionRegularComplete(competitionState, 'euroleague');
      const endesaQfSpecStart = endesaRegularIsComplete
        ? competitionRoundDate(competitionState, seasonYear, 'endesa', ['qf', 'quarterfinals'], 'start')
        : null;
      const euroleagueQfSpecStart = euroleagueRegularIsComplete
        ? competitionRoundDate(competitionState, seasonYear, 'euroleague', ['qf', 'quarterfinals'], 'start')
        : null;
      const euroleagueFinalFourSpecStart = euroleagueRegularIsComplete
        ? competitionRoundDate(competitionState, seasonYear, 'euroleague', ['sf', 'semifinals', 'final-four'], 'start')
        : null;
      const euroleagueFinalSpecEnd = euroleagueRegularIsComplete
        ? competitionRoundDate(competitionState, seasonYear, 'euroleague', ['final', 'final-four'], 'end')
        : null;
      const endesaFinalSpecEnd = endesaRegularIsComplete
        ? competitionRoundDate(competitionState, seasonYear, 'endesa', ['final'], 'end')
        : null;
      const euroleaguePlayInStart = findFirstCompetitionDate(competitionState, 'euroleague', ['play-in'])
        ?? (euroleagueQfSpecStart ? addDays(euroleagueQfSpecStart, -8) : null);
      const euroleagueQfStart = findFirstCompetitionDate(competitionState, 'euroleague', ['qf']) ?? euroleagueQfSpecStart;
      const euroleagueFinalFourStart = findFirstCompetitionDate(competitionState, 'euroleague', ['sf', 'final']) ?? euroleagueFinalFourSpecStart;
      const euroleagueSeasonEnd = findLastCompetitionDate(competitionState, 'euroleague') ?? euroleagueFinalSpecEnd;
      const endesaPlayoffStart = findFirstCompetitionDate(competitionState, 'endesa', ['qf']) ?? endesaQfSpecStart;
      const endesaSeasonEnd = findLastCompetitionDate(competitionState, 'endesa') ?? endesaFinalSpecEnd;
      const allCompetitionEnd = [findLastCompetitionDate(competitionState), userCanSeeEuroleague ? euroleagueSeasonEnd : null, endesaSeasonEnd]
        .filter((date): date is string => !!date)
        .sort()
        .at(-1) ?? null;
      const trainingCampStr = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
      const activeCompetition = getEuroCompetitionTarget(competitionState, seasonYear, norm, currentView);

      const opts: PlayOption[] = [
        { label: 'One day', action: simDay },
        { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
        { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
      ];
      if (
        unresolvedEuroTransferMarket &&
        transferWindowStatus?.open &&
        transferWindowStatus.window === 'winter' &&
        transferWindowStatus.currentClose
      ) {
        const winterClose = normalizeDate(transferWindowStatus.currentClose.toISOString());
        if (winterClose > norm) {
          opts.push({
            label: 'Through winter transfer window',
            action: () => simThrough(winterClose),
          });
        }
      }

      pushFutureOption(opts, norm, 'Until next fixture', nextFixture ?? firstFixture, simToDate);
      if (currentOrNextFixture && currentOrNextFixture >= norm) {
        opts.push({ label: 'Through next fixture', action: () => simThrough(currentOrNextFixture) });
      }
      if (activeCompetition?.postseasonActive) {
        if (activeCompetition.nextGameDate) {
          opts.push({
            label: `Sim ${activeCompetition.label} game`,
            action: () => simThrough(clampToToday(activeCompetition.nextGameDate!, norm)),
          });
        }
        if (activeCompetition.roundEndDate) {
          opts.push({
            label: `Sim ${activeCompetition.label} round`,
            action: () => simThrough(clampToToday(activeCompetition.roundEndDate!, norm)),
          });
        }
        if (activeCompetition.postseasonEndDate) {
          opts.push({
            label: `Sim to ${activeCompetition.label} champion`,
            action: () => simThrough(clampToToday(activeCompetition.postseasonEndDate!, norm)),
          });
        }
      }
      if (userCanSeeEuroleague) {
        pushFutureOption(opts, norm, 'Through EuroLeague regular season', euroleagueRegularEnd, simThrough);
      }
      pushFutureOption(opts, norm, 'Through Liga Endesa regular season', endesaRegularEnd, simThrough);
      pushFutureOption(opts, norm, 'To Liga Endesa playoffs', endesaPlayoffStart, simToDate);
      if (userCanSeeEuroleague) {
        pushFutureOption(opts, norm, 'Until EuroLeague play-in', euroleaguePlayInStart, simToDate);
        pushFutureOption(opts, norm, 'Until EuroLeague playoffs', euroleagueQfStart, simToDate);
        pushFutureOption(opts, norm, 'Until EuroLeague Final Four', euroleagueFinalFourStart, simToDate);
        pushFutureOption(opts, norm, 'Through EuroLeague Final', euroleagueSeasonEnd, simThrough);
      }
      pushFutureOption(opts, norm, 'To offseason', allCompetitionEnd, simThrough);
      pushFutureOption(opts, norm, 'Until training camp', trainingCampStr, simToDate);
      return opts;
    }

    const tdStr = toISODateString(getTradeDeadlineDate(seasonYear, ls));
    const draftLotteryStr = toISODateString(getDraftLotteryDate(seasonYear, ls));
    const draftStr = toISODateString(getDraftDate(seasonYear, ls));
    const faStartStr = toISODateString(getCurrentOffseasonEffectiveFAStart(`${norm}T00:00:00Z`, ls, state.schedule));
    const faMoratoriumEndStr = toISODateString(getCurrentOffseasonFAMoratoriumEnd(`${norm}T00:00:00Z`, ls, state.schedule));
    const openingNightStr = findFirstRegularSeasonDate(state) ?? toISODateString(getOpeningNightDate(seasonYear, ls, state.schedule as any));
    const allStarStr = toISODateString(addDaysToDate(getAllStarWeekendStartDate(seasonYear, ls), -1));
    const preseasonStr = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
    const lastPlayoffStr = findLastTruePlayoffDate(state) ?? addDays(draftStr, -1);

    switch (phase) {
      case 'preseason': {
        const opts: PlayOption[] = [
          { label: 'One day', action: simDay },
          { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
          { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
        ];
        const firstPreseason = findFirstPreseasonDate(state);
        const lastPreseason = findLastPreseasonDate(state);
        const trainingCampStr = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
        if (norm < trainingCampStr) {
          opts.push({ label: 'Until training camp', action: () => simToDate(trainingCampStr) });
        }
        if (firstPreseason && firstPreseason > norm) {
          opts.push({ label: 'Until preseason games', action: () => simToDate(firstPreseason) });
        }
        if (lastPreseason && lastPreseason >= norm) {
          opts.push({ label: 'Through preseason', action: () => simThrough(lastPreseason) });
        }
        opts.push({ label: 'To opening night', action: () => simToDate(openingNightStr) });
        return opts;
      }

      case 'regular-season': {
        const opts: PlayOption[] = [
          { label: 'One day', action: simDay },
          { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
          { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
        ];
        if (norm < tdStr) {
          opts.push({ label: 'Until trade deadline', action: () => simToDate(tdStr) });
        }
        if (norm < allStarStr) {
          opts.push({ label: 'Until All-Star events', action: () => simToDate(allStarStr) });
        }
        const lastRegSeasonStr = findLastRegSeasonDate(state);
        if (lastRegSeasonStr && lastRegSeasonStr >= norm) {
          opts.push({ label: 'Through regular season', action: () => simThrough(lastRegSeasonStr) });
        }
        const playInScheduled = ls?.playIn !== false ? findFirstPlayInDate(state) : null;
        const playInCalFallback = `${calYear}-04-14`;
        const playInTarget = ls?.playIn !== false
          ? (playInScheduled ?? (lastRegSeasonStr ? addDays(lastRegSeasonStr, 1) : null) ?? (norm < playInCalFallback ? playInCalFallback : null))
          : null;
        if (playInTarget && playInTarget > norm) {
          opts.push({ label: 'Until play-in', action: () => simToDate(playInTarget) });
        }
        const playoffScheduled = findFirstTruePlayoffDate(state);
        const playoffCalFallback = ls?.playIn !== false ? `${calYear}-04-19` : `${calYear}-04-16`;
        const playoffTarget = playoffScheduled
          ?? (playInTarget ? addDays(playInTarget, 1) : null)
          ?? (norm < playoffCalFallback ? playoffCalFallback : null);
        if (playoffTarget && playoffTarget > norm) {
          opts.push({ label: 'Until playoffs', action: () => simToDate(playoffTarget) });
        }
        if (!noDraft && norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDate(draftLotteryStr) });
        }
        return opts;
      }

      case 'playin': {
        const playInEnd = findPlayInEndDate(state);
        const playoffStart = findFirstTruePlayoffDate(state)
          ?? (playInEnd ? addDays(playInEnd, 1) : (norm < `${calYear}-04-19` ? `${calYear}-04-19` : null));
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        if (playInEnd && playInEnd >= norm) {
          opts.push({ label: 'Until end of play-in', action: () => simThrough(playInEnd) });
        }
        if (playoffStart && playoffStart > norm) {
          opts.push({ label: 'Until playoffs', action: () => simToDate(playoffStart) });
        }
        if (!noDraft && norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDate(draftLotteryStr) });
        } else if (!noDraft && norm === draftLotteryStr) {
          opts.push({ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) });
        }
        opts.push({ label: 'Through playoffs', action: () => simThrough(lastPlayoffStr) });
        return opts;
      }

      case 'playoffs': {
        const roundEnd = findPlayoffRoundEndDate(state);
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        if (roundEnd && roundEnd >= norm) {
          opts.push({ label: 'Until end of round', action: () => simThrough(roundEnd) });
        }
        if (!noDraft && norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDate(draftLotteryStr) });
        } else if (!noDraft && norm === draftLotteryStr) {
          opts.push({ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) });
        }
        opts.push({ label: 'Through playoffs', action: () => simThrough(lastPlayoffStr) });
        const offseasonStart = state.playoffs?.bracketComplete ? addDays(lastPlayoffStr, 1) : draftStr;
        if (norm < offseasonStart) {
          opts.push({ label: 'To offseason', action: () => simToDate(offseasonStart) });
        }
        return opts;
      }

      case 'draft-lottery': {
        const opts: PlayOption[] = [
          { label: 'One day', action: simDay },
          ...(!noDraft ? [{ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) }] : []),
          ...(!noDraft ? [{ label: 'Until draft', action: () => simToDate(draftStr) }] : []),
        ];
        if (isCommissioner) {
          opts.push(
            { label: 'Skip to training camp', action: () => simToDate(preseasonStr) },
            { label: 'Skip to opening night', action: () => simToDate(openingNightStr) },
          );
        }
        return opts;
      }

      case 'draft':
        return [
          { label: 'Sim to end of draft', action: simDraftToEnd },
          { label: 'Watch draft', action: () => navigate('Draft Board' as Tab) },
        ];

      case 'after-draft': {
        const opts: PlayOption[] = [];
        if (isCommissioner) {
          opts.push({ label: 'Skip to training camp', action: () => simToDate(preseasonStr) });
          opts.push({ label: 'Skip to opening night', action: () => simToDate(openingNightStr) });
        }
        opts.push({ label: 'One day', action: simDay });
        if (!noDraft && !state.draftComplete) {
          opts.push({ label: 'Watch draft', action: () => navigate('Draft Board' as Tab) });
          opts.push({ label: 'Sim to end of draft', action: simDraftToEnd });
        }
        if (norm < faStartStr) {
          opts.push({ label: 'Until FA opens', action: () => simToDate(faStartStr) });
        }
        if (norm < faMoratoriumEndStr) {
          opts.push({ label: 'Until signings open', action: () => simToDate(faMoratoriumEndStr) });
        }
        return opts;
      }

      case 'free-agency': {
        const activeMarkets = (state.faBidding?.markets ?? []).filter((market: any) => !market.resolved);
        const marketTarget = (markets: any[]) => {
          const nextDecisionDay = markets
            .map((market: any) => Number(market.decidesOnDay))
            .filter((day: number) => Number.isFinite(day))
            .sort((a: number, b: number) => a - b)[0];
          if (nextDecisionDay == null) return addDays(norm, 1);
          return addDays(norm, Math.max(1, nextDecisionDay - (state.day ?? 0)));
        };
        const majorMarketPlayerIds = new Set(
          state.players
            .filter((player: any) => player.tid < 0 && player.status === 'Free Agent' && (player.overallRating ?? 0) >= 55)
            .map((player: any) => player.internalId),
        );
        const majorMarkets = activeMarkets.filter((market: any) => majorMarketPlayerIds.has(market.playerId));
        const opts: PlayOption[] = [];
        if (isCommissioner) {
          opts.push({ label: 'Skip to training camp', action: () => simToDate(preseasonStr) });
          opts.push({ label: 'Skip to opening night', action: () => simToDate(openingNightStr) });
        }
        opts.push(
          { label: 'One day', action: simDay },
          { label: 'One FA week', action: () => simToDate(addDays(norm, 7)) },
        );
        if (norm < faMoratoriumEndStr) {
          opts.push({ label: 'Through moratorium', action: () => simToDate(faMoratoriumEndStr) });
        }
        if (activeMarkets.length > 0) {
          opts.push({ label: 'Until next FA decision', action: () => simThrough(marketTarget(activeMarkets)) });
        }
        if (majorMarkets.length > 0) {
          opts.push({ label: 'Until major FAs resolve', action: () => simThrough(marketTarget(majorMarkets)) });
        }
        opts.push(
          { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
          { label: 'Until training camp', action: () => simToDate(preseasonStr) },
        );
        const nextSeasonOpening = toISODateString(getOpeningNightDate(preseasonSeasonYear, ls, state.schedule as any));
        if (nextSeasonOpening > norm) {
          opts.push({ label: 'Through preseason', action: () => simToDate(nextSeasonOpening) });
        }
        return opts;
      }

      default:
        return [{ label: 'One day', action: simDay }];
    }
  }, [
    currentView,
    isCommissioner,
    isEuro,
    isPba,
    ls,
    navigate,
    noDraft,
    norm,
    phase,
    seasonYear,
    simDay,
    simDraftToEnd,
    simPbaDraftToEnd,
    simThrough,
    simToDate,
    calYear,
    euroCompetitionState,
    transferWindowStatus?.currentClose,
    transferWindowStatus?.open,
    transferWindowStatus?.window,
    state.schedule,
    state.players,
    state.faBidding?.markets,
    state.offseasonChecklist?.transferMarket,
    state.offseasonChecklist,
    state.day,
    state.playoffs,
    state.draftComplete,
    dispatchAction,
  ]);

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', escHandler);
    };
  }, []);

  const disabled = state.isProcessing;
  const primaryOption = options[0];

  return (
    <div className="flex items-center gap-3">
      <div ref={ref} className="relative flex items-center">
        <button
          onClick={() => { if (!disabled) primaryOption?.action(); }}
          disabled={disabled}
          aria-label={primaryOption?.label ?? 'Sim day'}
          title={primaryOption?.label ?? 'Sim day'}
          className={`flex items-center justify-center px-3 py-1.5 rounded-l-lg transition-colors ${
            disabled
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-[#2d5a27] hover:bg-[#3a7233] text-white'
          }`}
        >
          <Play size={14} fill="currentColor" />
        </button>
        <button
          onClick={() => !disabled && setOpen(prev => !prev)}
          disabled={disabled}
          className={`flex items-center px-1.5 py-1.5 rounded-r-lg border-l border-black/30 transition-colors ${
            disabled
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-[#1e4219] hover:bg-[#2d5a27] text-white'
          }`}
        >
          <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && !disabled && (
          <div className="absolute top-full left-0 mt-1 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl z-[300] min-w-[240px] py-1.5 overflow-hidden">
            {options.map((option, index) => (
              <button
                key={index}
                onClick={option.action}
                className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5 transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col leading-none min-w-0">
        <span className="text-[11px] font-bold text-white truncate">{phaseLabel}</span>
        <span className={`text-[10px] mt-0.5 ${state.isProcessing ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
          {state.isProcessing ? 'Simulating…' : 'Idle'}
        </span>
      </div>

      {draftGate.modal}
      {rosterGate.modal}
      {teamOptionGate.modal}
      {expiringGate.modal}
      {tycoonYearEndGate.modal}
    </div>
  );
};
