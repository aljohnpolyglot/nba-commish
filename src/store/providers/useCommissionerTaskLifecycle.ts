import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import type { GameState } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import {
  areCommissionerTaskLedgersEqual,
  commissionerTaskKey,
  ensureCommissionerTaskLedger,
  getCommissionerTaskCycleYear,
} from '../../services/commissionerTasks/taskRegistry';
import {
  isHistoricalBroadcastMode,
  resolveCommissionerTask,
} from '../../services/commissionerTasks/taskResolution';
import {
  getAllStarReplacementAutoDecisionDate,
  getOutstandingAllStarInjuries,
} from '../../services/allStar/allStarInjuryReplacements';

type SetGameState = Dispatch<SetStateAction<GameState>>;

export function useCommissionerTaskLifecycle(state: GameState, setState: SetGameState) {
  const historicalResolutionKey = useRef<string | null>(null);
  const allStarAutoResolutionKey = useRef<string | null>(null);
  const hofAutoResolutionKey = useRef<string | null>(null);

  useEffect(() => {
    if (
      !state.isDataLoaded
      || state.gameMode === 'gm'
      || state.leagueStats.uiMode === 'euro_isolated'
    ) return;
    const next = ensureCommissionerTaskLedger(state);
    if (areCommissionerTaskLedgersEqual(state.commissionerTasks, next)) return;
    setState(previous => {
      const ledger = ensureCommissionerTaskLedger(previous);
      return areCommissionerTaskLedgersEqual(previous.commissionerTasks, ledger)
        ? previous
        : { ...previous, commissionerTasks: ledger };
    });
  }, [
    setState,
    state.allStar,
    state.christmasGames,
    state.commissionerTasks,
    state.date,
    state.draftComplete,
    state.draftLotteryResult,
    state.expansionSchedule,
    state.gameMode,
    state.globalGames,
    state.isDataLoaded,
    state.leagueStats,
    state.schedule,
    state.seasonHistory,
  ]);

  useEffect(() => {
    if (
      !state.isDataLoaded
      || state.gameMode === 'gm'
      || state.leagueStats.uiMode === 'euro_isolated'
      || state.leagueStats.uiMode === 'pba_isolated'
      || !isHistoricalBroadcastMode(state)
    ) return;
    const ledger = ensureCommissionerTaskLedger(state);
    const key = commissionerTaskKey(getCommissionerTaskCycleYear(state), 'media_rights_renewal');
    const record = ledger.records[key];
    if (!record || record.status !== 'pending' || normalizeDate(state.date) < record.openDate) return;
    if (historicalResolutionKey.current === key) return;
    historicalResolutionKey.current = key;
    let cancelled = false;
    resolveCommissionerTask(state, 'media_rights_renewal', { mode: 'auto' })
      .then(patch => {
        if (cancelled) return;
        setState(previous => ({ ...previous, ...patch }));
      })
      .finally(() => {
        if (historicalResolutionKey.current === key) historicalResolutionKey.current = null;
      });
    return () => { cancelled = true; };
  }, [
    setState,
    state.commissionerTasks,
    state.date,
    state.gameMode,
    state.isDataLoaded,
    state.leagueStats,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaStartYear,
    state.saveId,
  ]);

  useEffect(() => {
    if (
      !state.isDataLoaded
      || state.gameMode === 'gm'
      || state.leagueStats.uiMode === 'euro_isolated'
      || state.leagueStats.uiMode === 'pba_isolated'
    ) return;
    const cycle = getCommissionerTaskCycleYear(state);
    const record = ensureCommissionerTaskLedger(state).records[
      commissionerTaskKey(cycle, 'all_star_replacements')
    ];
    const today = normalizeDate(state.date);
    if (
      !record
      || today < record.openDate
      || today >= record.dueDate
      || !['pending', 'in_progress'].includes(record.status)
    ) return;
    const outstanding = getOutstandingAllStarInjuries(state);
    if (outstanding.length === 0) return;
    const existingIds = new Set(state.inbox.map(email => email.id));
    const newEmails = outstanding
      .filter(({ entry }) => !existingIds.has(`all-star-replacement-${cycle}-${entry.playerId}`))
      .map(({ entry, player }) => ({
        id: `all-star-replacement-${cycle}-${entry.playerId}`,
        sender: 'NBA League Operations',
        senderRole: 'All-Star Operations',
        organization: 'NBA',
        subject: `${entry.playerName} needs an All-Star replacement`,
        body: `${entry.playerName} is injured and cannot take part in All-Star Weekend. Make the selection in the All-Star workspace before ${getAllStarReplacementAutoDecisionDate(state)}. If you miss the deadline, the Assistant Commissioner will choose the replacement on Friday before the All-Star Game.`,
        read: false,
        replied: false,
        playerPortraitUrl: player.imgURL,
        date: state.date,
      }));
    if (newEmails.length === 0) return;
    setState(previous => {
      const ids = new Set(previous.inbox.map(email => email.id));
      const additions = newEmails.filter(email => !ids.has(email.id));
      return additions.length > 0 ? { ...previous, inbox: [...additions, ...previous.inbox] } : previous;
    });
  }, [
    setState,
    state.allStar,
    state.commissionerTasks,
    state.date,
    state.gameMode,
    state.inbox,
    state.isDataLoaded,
    state.leagueStats,
    state.players,
  ]);

  useEffect(() => {
    if (
      !state.isDataLoaded
      || state.gameMode === 'gm'
      || state.leagueStats.uiMode === 'euro_isolated'
    ) return;
    const cycle = getCommissionerTaskCycleYear(state);
    const key = commissionerTaskKey(cycle, 'hof_ceremony');
    const record = ensureCommissionerTaskLedger(state).records[key];
    const today = normalizeDate(state.date);
    if (
      !record
      || today < record.dueDate
      || !['pending', 'in_progress'].includes(record.status)
      || hofAutoResolutionKey.current === key
    ) return;
    hofAutoResolutionKey.current = key;
    let cancelled = false;
    resolveCommissionerTask(state, 'hof_ceremony', { mode: 'auto' })
      .then(patch => {
        if (cancelled) return;
        setState(previous => ({ ...previous, ...patch }));
      })
      .finally(() => {
        if (hofAutoResolutionKey.current === key) hofAutoResolutionKey.current = null;
      });
    return () => { cancelled = true; };
  }, [
    setState,
    state.commissionerTasks,
    state.date,
    state.gameMode,
    state.isDataLoaded,
    state.leagueStats,
    state.players,
  ]);

  useEffect(() => {
    if (
      !state.isDataLoaded
      || state.gameMode === 'gm'
      || state.leagueStats.uiMode === 'euro_isolated'
      || state.leagueStats.uiMode === 'pba_isolated'
    ) return;
    const cycle = getCommissionerTaskCycleYear(state);
    const key = commissionerTaskKey(cycle, 'all_star_replacements');
    const record = ensureCommissionerTaskLedger(state).records[key];
    const today = normalizeDate(state.date);
    if (
      !record
      || today < record.dueDate
      || !['pending', 'in_progress'].includes(record.status)
      || getOutstandingAllStarInjuries(state).length === 0
      || allStarAutoResolutionKey.current === key
    ) return;
    allStarAutoResolutionKey.current = key;
    let cancelled = false;
    resolveCommissionerTask(state, 'all_star_replacements', { mode: 'auto' })
      .then(patch => {
        if (cancelled) return;
        setState(previous => ({ ...previous, ...patch }));
      })
      .finally(() => {
        if (allStarAutoResolutionKey.current === key) allStarAutoResolutionKey.current = null;
      });
    return () => { cancelled = true; };
  }, [
    setState,
    state.allStar,
    state.commissionerTasks,
    state.date,
    state.gameMode,
    state.inbox,
    state.isDataLoaded,
    state.leagueStats,
    state.players,
  ]);
}
