import React, { useState, useRef } from 'react';
import { useGame } from '../store/GameContext';
import { getDraftLotteryDate, getDraftDate, toISODateString } from '../utils/dateUtils';
import { DraftEventGateModal } from '../components/modals/DraftEventGateModal';

interface DraftEventGateOptions {
  onNavigateToDraftLottery?: () => void;
  onNavigateToDraft?: () => void;
}

export function useDraftEventGate(options: DraftEventGateOptions = {}) {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);
  const { onNavigateToDraftLottery, onNavigateToDraft } = options;

  const eventType: 'lottery' | 'draft' | null = (() => {
    if (state.gameMode !== 'gm' || !state.date) return null;
    const ls = state.leagueStats as any;
    const seasonYear: number = ls?.year ?? 2026;
    const todayStr = new Date(state.date).toISOString().slice(0, 10);

    // Lottery: only block if user's team is a lottery team (no playoff clinch)
    const lotteryStr = toISODateString(getDraftLotteryDate(seasonYear, ls));
    if (todayStr === lotteryStr && !(state.draftLotteryResult as any)?.length) {
      const userTeam = state.teams?.find(t => t.id === state.userTeamId);
      const clinched = (userTeam as any)?.clinchedPlayoffs as string | undefined;
      const isLotteryTeam = !clinched || !['w', 'x', 'y', 'z'].includes(clinched);
      if (isLotteryTeam) return 'lottery';
    }

    // Draft: all teams participate
    const draftStr  = toISODateString(getDraftDate(seasonYear, ls));
    const draftStr2 = toISODateString(new Date(getDraftDate(seasonYear, ls).getTime() + 86_400_000));
    if ((todayStr === draftStr || todayStr === draftStr2) && !state.draftComplete) {
      return 'draft';
    }

    return null;
  })();

  const attempt = (fn: () => void | Promise<void>): void => {
    if (eventType) {
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
    if (pending) await pending();
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
