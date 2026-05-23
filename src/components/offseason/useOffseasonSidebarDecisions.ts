import { useState } from 'react';
import { convertTo2KRating } from '../../utils/helpers';
import type { NBAPlayer } from '../../types';

type Args = {
  dispatchAction: (action: any) => Promise<void> | void;
  pendingTeamOptions: NBAPlayer[];
  rfaCandidates: NBAPlayer[];
};

export function useOffseasonSidebarDecisions({
  dispatchAction,
  pendingTeamOptions,
  rfaCandidates,
}: Args) {
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [exercisedIds, setExercisedIds] = useState<Set<string>>(new Set());
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());
  const [qoModalOpen, setQoModalOpen] = useState(false);
  const [qoSubmittedIds, setQoSubmittedIds] = useState<Set<string>>(new Set());
  const [qoSkippedIds, setQoSkippedIds] = useState<Set<string>>(new Set());

  const handleOptionsAssistant = async () => {
    for (const p of pendingTeamOptions) {
      await dispatchAction({ type: 'EXERCISE_TEAM_OPTION', payload: { playerId: p.internalId } } as any);
    }
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOptionsModalOpen(false);
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
  };

  const handleOptionsExerciseOne = async (playerId: string) => {
    await dispatchAction({ type: 'EXERCISE_TEAM_OPTION', payload: { playerId } } as any);
    setExercisedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleOptionsDeclineOne = async (playerId: string) => {
    await dispatchAction({ type: 'DECLINE_TEAM_OPTION', payload: { playerId } } as any);
    setDeclinedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleOptionsDismiss = () => {
    const totalResolved = exercisedIds.size + declinedIds.size;
    if (totalResolved >= pendingTeamOptions.length && pendingTeamOptions.length > 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    }
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOptionsModalOpen(false);
  };

  const handleOptionsManual = () => {
    setOptionsModalOpen(false);
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {},
    } as any);
  };

  const handleQoSubmitOne = (playerId: string) => {
    dispatchAction({ type: 'SUBMIT_QUALIFYING_OFFER', payload: { playerId } } as any);
    setQoSubmittedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleQoSkipOne = (playerId: string) => {
    dispatchAction({ type: 'SKIP_QUALIFYING_OFFER', payload: { playerId } } as any);
    setQoSkippedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleQoAssistantAll = () => {
    rfaCandidates.forEach(p => {
      const k2 = convertTo2KRating(
        p.overallRating ?? 0,
        (p as any).ratings?.[(p as any).ratings?.length - 1]?.hgt ?? 50,
        (p as any).ratings?.[(p as any).ratings?.length - 1]?.tp ?? 50,
      );
      if (k2 >= 70) {
        handleQoSubmitOne(p.internalId);
      } else {
        handleQoSkipOne(p.internalId);
      }
    });
    setQoModalOpen(false);
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
  };

  const handleQoDismiss = () => {
    const totalDecided = qoSubmittedIds.size + qoSkippedIds.size;
    if (totalDecided >= rfaCandidates.length && rfaCandidates.length > 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
    }
    setQoSubmittedIds(new Set());
    setQoSkippedIds(new Set());
    setQoModalOpen(false);
  };

  return {
    optionsModalOpen,
    setOptionsModalOpen,
    exercisedIds,
    declinedIds,
    qoModalOpen,
    setQoModalOpen,
    qoSubmittedIds,
    qoSkippedIds,
    handleOptionsAssistant,
    handleOptionsExerciseOne,
    handleOptionsDeclineOne,
    handleOptionsDismiss,
    handleOptionsManual,
    handleQoSubmitOne,
    handleQoSkipOne,
    handleQoAssistantAll,
    handleQoDismiss,
  };
}
