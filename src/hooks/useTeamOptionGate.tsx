import React, { useMemo, useRef, useState } from 'react';
import { useGame } from '../store/GameContext';
import { TeamOptionGateModal } from '../components/modals/TeamOptionGateModal';
import { getCurrentOffseasonEffectiveFAStart, getGameDateParts } from '../utils/dateUtils';
import { normalizeDate } from '../utils/helpers';

interface TeamOptionGateOptions {
  onNavigateManual?: () => void;
}

export function useTeamOptionGate(options: TeamOptionGateOptions = {}) {
  const { state, dispatchAction } = useGame();
  const [open, setOpen] = useState(false);
  const [exercisedIds, setExercisedIds] = useState<Set<string>>(new Set());
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);

  const pendingTeamOptions = useMemo(() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const nextYear = currentYear + 1;
    return state.players.filter((p: any) => {
      if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
      if (!p.contract?.hasTeamOption) return false;
      const teamOptionExp = Number(p.contract?.teamOptionExp ?? p.contract?.exp ?? 0);
      return teamOptionExp === nextYear;
    });
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats?.year]);

  const wouldCrossOptionDeadline = (targetDate?: string) => {
    if (!state.date || pendingTeamOptions.length === 0) return false;
    const { year } = getGameDateParts(state.date);
    const today = normalizeDate(state.date);
    const target = targetDate ? normalizeDate(targetDate) : today;
    const optionDeadline = `${year}-06-29`;
    const faStart = normalizeDate(getCurrentOffseasonEffectiveFAStart(`${today}T00:00:00Z`, state.leagueStats as any, state.schedule as any).toISOString());
    if (today >= faStart) return false;
    return today <= optionDeadline && target >= optionDeadline;
  };

  const attempt = (fn: () => void | Promise<void>, targetDate?: string) => {
    if (wouldCrossOptionDeadline(targetDate)) {
      pendingRef.current = fn;
      setOpen(true);
      return false;
    }
    void fn();
    return true;
  };

  const handleAssistant = async () => {
    for (const p of pendingTeamOptions) {
      await dispatchAction({ type: 'EXERCISE_TEAM_OPTION' as any, payload: { playerId: p.internalId } });
    }
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOpen(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) await pending();
  };

  const handleExerciseOne = async (playerId: string) => {
    await dispatchAction({ type: 'EXERCISE_TEAM_OPTION' as any, payload: { playerId } });
    setExercisedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleDeclineOne = async (playerId: string) => {
    await dispatchAction({ type: 'DECLINE_TEAM_OPTION' as any, payload: { playerId } });
    setDeclinedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleManual = () => {
    pendingRef.current = null;
    setExercisedIds(new Set());
    setOpen(false);
    options.onNavigateManual?.();
  };

  const handleDismiss = () => {
    pendingRef.current = null;
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOpen(false);
  };

  const modal = (
    <TeamOptionGateModal
      isOpen={open}
      players={pendingTeamOptions}
      onAssistant={handleAssistant}
      onManual={handleManual}
      onDismiss={handleDismiss}
      onExerciseOne={handleExerciseOne}
      onDeclineOne={handleDeclineOne}
      exercisedIds={exercisedIds}
      declinedIds={declinedIds}
    />
  );

  return { attempt, modal, isBlocked: pendingTeamOptions.length > 0 };
}
