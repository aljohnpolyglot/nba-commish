import React, { useState, useMemo, useRef } from 'react';
import { useGame } from '../store/GameContext';
import { RosterComplianceModal } from '../components/modals/RosterComplianceModal';
import { getDisplayOverall } from '../utils/playerRatings';
import type { NBAPlayer } from '../types';

/**
 * Roster compliance gate — single chokepoint for every user-triggered sim
 * advancement (Sim Day, Simulate to Date, Sim Season, watch-game advance,
 * seasonal/actions/playoff auto-advance, etc).
 *
 * Blocks two directions:
 *   • OVER  — user's standard roster > maxStandardPlayersPerTeam in regular season
 *   • UNDER — user's standard roster < minPlayersPerTeam any time
 *
 * Usage:
 *   const gate = useRosterComplianceGate();
 *   // wrap every dispatch:
 *   gate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY' }));
 *   // render the modal once per view:
 *   {gate.modal}
 */
export function useRosterComplianceGate() {
  const { state, dispatchAction } = useGame();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);

  const check = useMemo(() => {
    const empty = { mode: null as 'over' | 'under' | null, excess: [] as NBAPlayer[], slotsNeeded: 0, isPreseasonEnd: false };
    if (state.gameMode !== 'gm' || state.userTeamId == null || !state.date) return empty;
    const d = new Date(state.date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const isTrainingCamp = (month >= 7 && month <= 9) || (month === 10 && day <= 21);
    const isRegularSeason = (month === 10 && day >= 22) || (month >= 11) || (month >= 1 && month <= 3);
    const isPlayoffs = month >= 4 && month <= 6;
    const userTeam = state.teams?.find(t => t.id === state.userTeamId);
    const userClinched = (userTeam as any)?.clinchedPlayoffs as string | undefined;
    const userStillInPlayoffs = isPlayoffs && (userClinched === 'w' || userClinched === 'x' || userClinched === 'y' || userClinched === 'z');

    const allRoster = state.players.filter(p =>
      p.tid === state.userTeamId && p.status === 'Active'
    );
    const standardRoster = allRoster.filter(p => !(p as any).twoWay);
    const minRoster = state.leagueStats?.minPlayersPerTeam ?? 14;
    const maxStd = state.leagueStats?.maxStandardPlayersPerTeam ?? 15;
    const maxCamp = state.leagueStats?.maxTrainingCampRoster ?? 21;

    // Enforce minimum only when games are live and meaningful: regular season, or playoffs while still competing.
    // During training camp / free agency (Jul–Oct 21) and post-elimination, teams are building their roster.
    if ((isRegularSeason || userStillInPlayoffs) && standardRoster.length < minRoster) {
      return { mode: 'under' as const, excess: [], slotsNeeded: minRoster - standardRoster.length, isPreseasonEnd: false };
    }
    // Training camp: 21 TOTAL (standard + NG + two-way share one pool)
    if (isTrainingCamp && allRoster.length > maxCamp) {
      const excess = [...allRoster]
        .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
        .slice(0, allRoster.length - maxCamp);
      return { mode: 'over' as const, excess, slotsNeeded: 0, isPreseasonEnd: false };
    }
    // Regular season: standard-only limit
    if (isRegularSeason && standardRoster.length > maxStd) {
      const excess = [...standardRoster]
        .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
        .slice(0, standardRoster.length - maxStd);
      return { mode: 'over' as const, excess, slotsNeeded: 0, isPreseasonEnd: false };
    }
    return { ...empty, isPreseasonEnd: isTrainingCamp };
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats, state.date]);

  const attempt = (fn: () => void | Promise<void>) => {
    if (check.mode) {
      pendingRef.current = fn;
      setOpen(true);
      return false;
    }
    void fn();
    return true;
  };

  const handleAuto = async () => {
    if (check.mode === 'over') {
      for (const p of check.excess) {
        await dispatchAction({
          type: 'WAIVE_PLAYER' as any,
          payload: {
            targetId: p.internalId,
            targetName: p.name,
            contacts: [{ id: p.internalId, name: p.name, type: 'player' }],
          },
        });
      }
    }
    setOpen(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) await pending();
  };

  const handleManual = () => {
    pendingRef.current = null;
    setOpen(false);
  };

  const modal = (
    <RosterComplianceModal
      isOpen={open}
      mode={check.mode ?? 'over'}
      excessPlayers={check.excess}
      slotsNeeded={check.slotsNeeded}
      minRoster={state.leagueStats?.minPlayersPerTeam ?? 14}
      isPreseasonEnd={check.isPreseasonEnd}
      onAutoAction={handleAuto}
      onManual={handleManual}
    />
  );

  return { attempt, modal, isBlocked: !!check.mode, check };
}
