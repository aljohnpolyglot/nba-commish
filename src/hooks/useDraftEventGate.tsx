import React, { useState, useRef } from 'react';
import { useGame } from '../store/GameContext';
import { getDraftLotteryDate, getDraftDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../utils/dateUtils';
import { DraftEventGateModal } from '../components/modals/DraftEventGateModal';
import { normalizeDate } from '../utils/helpers';
import { isNoDraftLeague } from '../services/offseason/offseasonState';
import { isPbaIsolatedMode } from '../utils/uiMode';
import {
  authorizeAssistantGMDraftEvent,
  clearAssistantGMDraftEventAuthorization,
} from '../services/assistantGMFlag';
import { isCurrentDraftClassComplete } from '../services/draft/DraftPickGenerator';
import {
  lifecycleWithDraftEventAuthority,
  resolveLeagueSeasonLifecycle,
} from '../services/lifecycle/leagueSeasonLifecycle';
import {
  isLotteryBoundaryOwnedByTargetPlan,
  resolveCalendarEventDisposition,
} from '../services/lifecycle/calendarEventDisposition';
import type { TargetPlan } from '../services/simulation/targetPlanner';

interface DraftEventGateOptions {
  onNavigateToDraftLottery?: () => void;
  onNavigateToDraft?: () => void;
}

export function useDraftEventGate(options: DraftEventGateOptions = {}) {
  const { state, dispatchAction } = useGame();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);
  const { onNavigateToDraftLottery, onNavigateToDraft } = options;

  const eventType: 'lottery' | 'draft' | null = (() => {
    if ((state.gameMode !== 'gm' && state.gameMode !== 'commissioner') || !state.date) return null;
    const ls = state.leagueStats as any;
    if (isNoDraftLeague(ls) || isPbaIsolatedMode(state)) return null;
    const lifecycle = resolveLeagueSeasonLifecycle(state);
    const seasonYear = lifecycle.draft.year;
    if (seasonYear == null) return null;
    const todayStr = normalizeDate(state.date);
    const draftBlockedByPlayoffs = isDraftBlockedByUnresolvedPlayoffs(state);

    const lotteryStr = toISODateString(getDraftLotteryDate(seasonYear, ls));
    if (
      todayStr === lotteryStr
      && lifecycle.draft.lotteryEnabled
      && lifecycle.draft.lottery !== 'complete'
    ) {
      return 'lottery';
    }

    const draftStr = toISODateString(getDraftDate(seasonYear, ls));
    if (
      todayStr === draftStr
      && lifecycle.draft.orderReview === 'complete'
      && !isCurrentDraftClassComplete(state)
      && !draftBlockedByPlayoffs
    ) {
      return 'draft';
    }

    return null;
  })();

  const attempt = (fn: () => void | Promise<void>, targetPlan?: TargetPlan): void => {
    const lotteryDisposition = eventType === 'lottery'
      ? resolveCalendarEventDisposition(state, {
          eventKey: 'draft_lottery',
          eventDate: toISODateString(getDraftLotteryDate(
            resolveLeagueSeasonLifecycle(state).draft.year ?? state.leagueStats.year,
            state.leagueStats,
          )),
          targetPlan,
          commandType: targetPlan?.name ?? 'UI_DRAFT_EVENT_GATE',
        })
      : null;
    const runnerOwnsManualLotteryBlocker = lotteryDisposition === 'MANUAL_BLOCKER'
      && isLotteryBoundaryOwnedByTargetPlan(targetPlan);
    const mustPause = eventType === 'draft'
      || (eventType === 'lottery'
        && lotteryDisposition === 'MANUAL_BLOCKER'
        && !runnerOwnsManualLotteryBlocker);
    if (mustPause) {
      pendingRef.current = fn;
      setOpen(true);
      return;
    }
    void fn();
  };

  const handleAutoSim = async () => {
    setOpen(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || !eventType) return;
    authorizeAssistantGMDraftEvent(eventType, normalizeDate(state.date));
    try {
      const lifecycleEvent = eventType === 'lottery' ? 'lottery' : 'draft';
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          seasonLifecycle: lifecycleWithDraftEventAuthority(state, lifecycleEvent, 'delegated'),
        },
      });
      await pending();
    } finally {
      clearAssistantGMDraftEventAuthorization();
    }
  };

  const handleWatch = () => {
    pendingRef.current = null;
    setOpen(false);
    if (eventType === 'lottery') onNavigateToDraftLottery?.();
    else if (eventType === 'draft') onNavigateToDraft?.();
  };

  const handleDismiss = () => {
    pendingRef.current = null;
    setOpen(false);
  };

  const modal = (
    <DraftEventGateModal
      isOpen={open}
      eventType={eventType ?? 'draft'}
      canNavigate={eventType === 'lottery' ? !!onNavigateToDraftLottery : !!onNavigateToDraft}
      onAutoSim={handleAutoSim}
      onWatch={handleWatch}
      onDismiss={handleDismiss}
    />
  );

  return { attempt, modal, isBlocked: !!eventType, eventType };
}
