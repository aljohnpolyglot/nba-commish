import React, { useState, useMemo, useRef } from 'react';
import { useGame } from '../store/GameContext';
import { RosterComplianceModal } from '../components/modals/RosterComplianceModal';
import { getDisplayOverall } from '../utils/playerRatings';
import { getGameDateParts } from '../utils/dateUtils';
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
    const empty = { mode: null as 'over' | 'under' | null, excess: [] as NBAPlayer[], slotsNeeded: 0, isPreseasonEnd: false, phase: 'offseason' as 'training-camp' | 'regular-season' | 'playoffs' | 'offseason', maxRoster: 15 };
    if (state.gameMode !== 'gm' || state.userTeamId == null || !state.date) return empty;
    const { month, day } = getGameDateParts(state.date);
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
    const phase: 'training-camp' | 'regular-season' | 'playoffs' | 'offseason' =
      isTrainingCamp ? 'training-camp'
      : isRegularSeason ? 'regular-season'
      : isPlayoffs ? 'playoffs'
      : 'offseason';

    // Only block sim for under-roster when there are actual games on the
    // schedule the team needs to suit up for. During the offseason / pre-FA
    // window the user literally can't sign anyone yet (FA hasn't opened),
    // so an under-gate just deadlocks them. Same goes for active-playoffs:
    // only block if the user's team still has an upcoming playoff game.
    const today = state.date;
    const hasUpcomingUserGame = state.schedule?.some((g: any) => {
      if (g.homeTid !== state.userTeamId && g.awayTid !== state.userTeamId) return false;
      if (g.played) return false;
      return !today || (g.date ?? '') >= today;
    }) ?? false;
    const livePhase = isRegularSeason || (isPlayoffs && userStillInPlayoffs && hasUpcomingUserGame);
    if (livePhase && standardRoster.length < minRoster) {
      return { mode: 'under' as const, excess: [], slotsNeeded: minRoster - standardRoster.length, isPreseasonEnd: false, phase, maxRoster: maxStd };
    }
    // Training camp: 21 TOTAL (standard + NG + two-way share one pool)
    if (isTrainingCamp && allRoster.length > maxCamp) {
      const excess = [...allRoster]
        .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
        .slice(0, allRoster.length - maxCamp);
      return { mode: 'over' as const, excess, slotsNeeded: 0, isPreseasonEnd: false, phase, maxRoster: maxCamp };
    }
    // Regular season: standard-only limit
    if (isRegularSeason && standardRoster.length > maxStd) {
      const excess = [...standardRoster]
        .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
        .slice(0, standardRoster.length - maxStd);
      return { mode: 'over' as const, excess, slotsNeeded: 0, isPreseasonEnd: false, phase, maxRoster: maxStd };
    }
    return { ...empty, isPreseasonEnd: isTrainingCamp, phase, maxRoster: isTrainingCamp ? maxCamp : maxStd };
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
      maxRoster={check.maxRoster}
      phase={check.phase}
      isPreseasonEnd={check.isPreseasonEnd}
      onAutoAction={handleAuto}
      onManual={handleManual}
    />
  );

  return { attempt, modal, isBlocked: !!check.mode, check };
}
