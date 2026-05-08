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
    const empty = {
      mode: null as 'over' | 'under' | 'ng-deadline' | null,
      excess: [] as NBAPlayer[],
      slotsNeeded: 0,
      isPreseasonEnd: false,
      phase: 'offseason' as 'training-camp' | 'regular-season' | 'playoffs' | 'offseason',
      maxRoster: 15,
      limitLabel: undefined as string | undefined,
      description: undefined as string | undefined,
    };
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
    const twoWayRoster = allRoster.filter(p => !!(p as any).twoWay);
    const minRoster = state.leagueStats?.minPlayersPerTeam ?? 14;
    const maxStd = state.leagueStats?.maxStandardPlayersPerTeam ?? 15;
    const maxTwoWay = state.leagueStats?.twoWayContractsEnabled === false
      ? 0
      : (state.leagueStats?.maxTwoWayPlayersPerTeam ?? 3);
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
      return { ...empty, mode: 'under' as const, slotsNeeded: minRoster - standardRoster.length, phase, maxRoster: maxStd };
    }
    // Training camp: 21 TOTAL (standard + NG + two-way share one pool)
    if (isTrainingCamp && allRoster.length > maxCamp) {
      const excess = [...allRoster]
        .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
        .slice(0, allRoster.length - maxCamp);
      console.log('[RosterGate] OVER training-camp', {
        allRoster: allRoster.length, maxCamp,
        excess: excess.map(p => ({ id: p.internalId, name: p.name, ovr: getDisplayOverall(p), ng: !!(p as any).nonGuaranteed, tw: !!(p as any).twoWay })),
      });
      return { ...empty, mode: 'over' as const, excess, phase, maxRoster: maxCamp };
    }
    // Regular season: standard and two-way slots are separate buckets.
    if (isRegularSeason && twoWayRoster.length > maxTwoWay) {
      const excess = [...twoWayRoster]
        .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
        .slice(0, twoWayRoster.length - maxTwoWay);
      return {
        ...empty,
        mode: 'over' as const,
        excess,
        phase,
        maxRoster: maxTwoWay,
        limitLabel: 'two-way',
        description: `Regular season two-way limit is ${maxTwoWay}. Convert or waive excess two-way players before simulating.`,
      };
    }
    // Regular season: standard roster limit
    if (isRegularSeason && standardRoster.length > maxStd) {
      const excess = [...standardRoster]
        .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
        .slice(0, standardRoster.length - maxStd);
      console.log('[RosterGate] OVER regular-season standard', {
        standardRoster: standardRoster.length, maxStd,
        excess: excess.map(p => ({ id: p.internalId, name: p.name, ovr: getDisplayOverall(p), ng: !!(p as any).nonGuaranteed, tw: !!(p as any).twoWay })),
      });
      return { ...empty, mode: 'over' as const, excess, phase, maxRoster: maxStd };
    }
    // NG guarantee deadline countdown — fires Jan 1–9 (9-day window before
    // the configured Jan 10 deadline) when user-team still carries any NG
    // players. After Jan 10 the auto-guarantee in simulationHandler kicks
    // in unconditionally as a safety net, so the gate is only here to give
    // the user one last chance to waive (free release) or convert to 2W.
    const ngDeadlineMonth = (state.leagueStats as any)?.ngGuaranteeDeadlineMonth ?? 1;
    const ngDeadlineDay = (state.leagueStats as any)?.ngGuaranteeDeadlineDay ?? 10;
    const inNgDeadlineWindow = month === ngDeadlineMonth && day < ngDeadlineDay;
    if (inNgDeadlineWindow) {
      const userNGs = standardRoster.filter(p => !!(p as any).nonGuaranteed);
      if (userNGs.length > 0) {
        const sortedNGs = [...userNGs].sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a));
        return { ...empty, mode: 'ng-deadline' as const, excess: sortedNGs, phase, maxRoster: maxStd };
      }
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
    console.log('[RosterGate] handleAuto fired', {
      mode: check.mode,
      excessCount: check.excess.length,
      excess: check.excess.map(p => ({ id: p.internalId, name: p.name, ng: !!(p as any).nonGuaranteed, tw: !!(p as any).twoWay, tid: p.tid, status: p.status })),
    });
    if (check.mode === 'over') {
      for (const p of check.excess) {
        console.log('[RosterGate] dispatching WAIVE_PLAYER for', p.name, p.internalId);
        try {
          await dispatchAction({
            type: 'WAIVE_PLAYER' as any,
            payload: {
              targetId: p.internalId,
              targetName: p.name,
              contacts: [{ id: p.internalId, name: p.name, type: 'player' }],
            },
          });
          console.log('[RosterGate] WAIVE_PLAYER returned for', p.name);
        } catch (e) {
          console.error('[RosterGate] WAIVE_PLAYER threw for', p.name, e);
        }
      }
    } else if (check.mode === 'ng-deadline') {
      // "Guarantee All" — flip every NG to guaranteed via CONVERT_CONTRACT_TYPE.
      // Mirrors what the Jan 10 auto-guarantee will do anyway, just earlier
      // and acknowledged by the user.
      for (const p of check.excess) {
        try {
          await dispatchAction({
            type: 'CONVERT_CONTRACT_TYPE' as any,
            payload: { playerId: p.internalId, to: 'GUARANTEED' },
          });
        } catch (e) {
          console.error('[RosterGate] CONVERT_CONTRACT_TYPE threw for', p.name, e);
        }
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
      limitLabel={check.limitLabel}
      description={check.description}
      phase={check.phase}
      isPreseasonEnd={check.isPreseasonEnd}
      onAutoAction={handleAuto}
      onManual={handleManual}
    />
  );

  return { attempt, modal, isBlocked: !!check.mode, check };
}
