import React, { useState, useMemo, useRef } from 'react';
import { useGame } from '../store/GameContext';
import { RosterComplianceModal } from '../components/modals/RosterComplianceModal';
import { SignFreeAgentModal } from '../components/modals/SignFreeAgentModal';
import { getDisplayOverall } from '../utils/playerRatings';
import { formatGameDateShort, parseGameDate } from '../utils/dateUtils';
import type { NBAPlayer } from '../types';
import { isOnRoster, resolveAnyTeam } from '../utils/teamLookup';
import { isEuroIsolatedMode, isPbaActiveConferencePhase, isPbaIsolatedMode } from '../utils/uiMode';
import { getSigningRosterLimit, getStandardRosterLimit, getTwoWayRosterLimit } from '../utils/rosterLimits';
import { areTwoWayContractsEnabled, isTwoWayContract } from '../utils/contractTypes';
import { normalizeDate } from '../utils/helpers';
import { getLeagueCalendarDates, getLeagueSeasonForDate, isLeaguePostseasonWindow, isLeagueRegularSeasonWindow, isLeagueTrainingCampWindow } from '../services/leagueCalendar';
import { getRosterComplianceAutoFillCandidates } from '../store/gameContext/rosterComplianceAutoFill';

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
  const [signingPlayer, setSigningPlayer] = useState<NBAPlayer | null>(null);
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
      deadlineLabel: undefined as string | undefined,
    };
    if (state.gameMode !== 'gm' || state.userTeamId == null || !state.date) return empty;
    const euroIsolated = isEuroIsolatedMode(state);
    const pbaIsolated = isPbaIsolatedMode(state);
    const isTrainingCamp = isLeagueTrainingCampWindow(state.date, state.leagueStats);
    const isExpandedRosterWindow = state.offseasonChecklist?.freeAgency === 'in-progress' || isTrainingCamp;
    const isRegularSeason = isLeagueRegularSeasonWindow(state.date, state.leagueStats);
    const isPlayoffs = isLeaguePostseasonWindow(state.date, state.leagueStats);
    const userTeam = resolveAnyTeam(state.userTeamId, state.teams ?? [], state.nonNBATeams ?? []);
    const userClinched = (userTeam as any)?.clinchedPlayoffs as string | undefined;
    const userStillInPlayoffs = isPlayoffs && (userClinched === 'w' || userClinched === 'x' || userClinched === 'y' || userClinched === 'z');

    const allRoster = state.players.filter(p =>
      p.tid === state.userTeamId && isOnRoster(p)
    );
    const minRoster = pbaIsolated ? 10 : (state.leagueStats?.minPlayersPerTeam ?? 14);
    const maxStd = getStandardRosterLimit(state.leagueStats);
    const maxTwoWay = getTwoWayRosterLimit(state.leagueStats);
    const maxCamp = getSigningRosterLimit(state.leagueStats, isExpandedRosterWindow);
    const twoWayEnabled = maxTwoWay > 0 && areTwoWayContractsEnabled(state.leagueStats);
    const isActiveTwoWay = (p: any) => twoWayEnabled && isTwoWayContract(p, state.leagueStats);
    const standardRoster = allRoster.filter(p => !isActiveTwoWay(p));
    const twoWayRoster = twoWayEnabled ? allRoster.filter(p => isActiveTwoWay(p)) : [];

    // Enforce minimum only when games are live and meaningful: regular season, or playoffs while still competing.
    // During the saved training-camp/free-agency window and post-elimination, teams are building their roster.
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
    const today = normalizeDate(state.date);
    const hasUpcomingUserGame = state.schedule?.some((g: any) => {
      if (g.homeTid !== state.userTeamId && g.awayTid !== state.userTeamId) return false;
      if (g.played) return false;
      const gameDate = normalizeDate(g.date);
      return !today || !gameDate || gameDate >= today;
    }) ?? false;
    const pbaConferencePhase = (state.leagueStats as any)?.pbaConferencePhase;
    const pbaLivePhase = pbaIsolated && isPbaActiveConferencePhase(pbaConferencePhase) && hasUpcomingUserGame;
    const livePhase = pbaIsolated
      ? pbaLivePhase
      : isRegularSeason || (isPlayoffs && userStillInPlayoffs && hasUpcomingUserGame);
    if (euroIsolated) {
      return { ...empty, phase, maxRoster: Math.max(maxStd, standardRoster.length) };
    }
    if (pbaIsolated) {
      const pbaPhase: 'regular-season' | 'playoffs' | 'offseason' =
        pbaConferencePhase === 'playoffs' ? 'playoffs'
        : pbaConferencePhase === 'regularSeason' ? 'regular-season'
        : 'offseason';
      if (livePhase && standardRoster.length < minRoster) {
        return { ...empty, mode: 'under' as const, slotsNeeded: minRoster - standardRoster.length, phase: pbaPhase, maxRoster: maxStd };
      }
      if (livePhase && standardRoster.length > maxStd) {
        const excess = [...standardRoster]
          .sort((a, b) => getDisplayOverall(a) - getDisplayOverall(b))
          .slice(0, standardRoster.length - maxStd);
        return { ...empty, mode: 'over' as const, excess, phase: pbaPhase, maxRoster: maxStd };
      }
      return { ...empty, phase: pbaPhase, maxRoster: maxStd };
    }
    if (livePhase && standardRoster.length < minRoster) {
      return { ...empty, mode: 'under' as const, slotsNeeded: minRoster - standardRoster.length, phase, maxRoster: maxStd };
    }
    // Training camp: 21 TOTAL (standard + NG + two-way share one pool)
    if (isExpandedRosterWindow && allRoster.length > maxCamp) {
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
    const season = getLeagueSeasonForDate(state.date, state.leagueStats) || state.leagueStats?.year;
    const guaranteeDeadline = season ? getLeagueCalendarDates(season, state.leagueStats).nonGuaranteedGuaranteeDate : undefined;
    const currentDate = parseGameDate(state.date);
    const daysUntilGuarantee = guaranteeDeadline
      ? Math.ceil((guaranteeDeadline.getTime() - currentDate.getTime()) / 86_400_000)
      : Number.NaN;
    const inNgDeadlineWindow = state.leagueStats?.nonGuaranteedContractsEnabled !== false
      && Number.isFinite(daysUntilGuarantee)
      && daysUntilGuarantee > 0
      && daysUntilGuarantee <= 9;
    if (inNgDeadlineWindow) {
      const userNGs = standardRoster.filter(p => !!(p as any).nonGuaranteed);
      if (userNGs.length > 0) {
        const sortedNGs = [...userNGs].sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a));
        const deadlineLabel = formatGameDateShort(guaranteeDeadline!);
        return {
          ...empty,
          mode: 'ng-deadline' as const,
          excess: sortedNGs,
          phase,
          maxRoster: maxStd,
          deadlineLabel,
          description: `On ${deadlineLabel}, every non-guaranteed contract still on a roster becomes guaranteed for the rest of the season. Cut now or guarantee them before the deadline.`,
        };
      }
    }
    return { ...empty, isPreseasonEnd: isTrainingCamp, phase, maxRoster: isExpandedRosterWindow ? maxCamp : maxStd };
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats, state.date, state.schedule, state.teams, state.nonNBATeams, state.offseasonChecklist?.freeAgency]);

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
    } else if (check.mode === 'under') {
      const candidates = getRosterComplianceAutoFillCandidates(state, check.slotsNeeded);
      if (candidates.length < check.slotsNeeded) {
        setOpen(true);
        return;
      }
      await dispatchAction({
        type: 'AUTOFILL_ROSTER_COMPLIANCE',
        payload: {
          teamId: state.userTeamId,
          playerIds: candidates.map(player => player.internalId),
        },
      });
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

  const canConvertExcess = check.mode === 'over'
    && check.limitLabel === 'two-way'
    && check.phase === 'regular-season'
    && (() => {
      const twoWayEnabled = getTwoWayRosterLimit(state.leagueStats) > 0 && areTwoWayContractsEnabled(state.leagueStats);
      const standardCount = state.players.filter(p =>
        p.tid === state.userTeamId && isOnRoster(p) && (!twoWayEnabled || !isTwoWayContract(p, state.leagueStats))
      ).length;
      return standardCount < getStandardRosterLimit(state.leagueStats);
    })();

  const userTeam = state.userTeamId != null
    ? resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? [])
    : null;

  const modal = (
    <>
      <RosterComplianceModal
        isOpen={open && !signingPlayer}
        mode={check.mode ?? 'over'}
        excessPlayers={check.excess}
        slotsNeeded={check.slotsNeeded}
        minRoster={isPbaIsolatedMode(state) ? 10 : (state.leagueStats?.minPlayersPerTeam ?? 14)}
        maxRoster={check.maxRoster}
        limitLabel={check.limitLabel}
        description={check.description}
        deadlineLabel={check.deadlineLabel}
        phase={check.phase}
        isPreseasonEnd={check.isPreseasonEnd}
        leagueStats={state.leagueStats}
        onAutoAction={handleAuto}
        onManual={handleManual}
        canConvertExcess={canConvertExcess}
        onConvertOne={canConvertExcess ? (player) => setSigningPlayer(player) : undefined}
      />
      {signingPlayer && userTeam && (
        <SignFreeAgentModal
          initialPlayer={signingPlayer}
          initialTeam={userTeam as any}
          forceContractType="GUARANTEED"
          onClose={() => setSigningPlayer(null)}
          onConfirm={async (payload) => {
            setSigningPlayer(null);
            await dispatchAction({ type: 'SIGN_FREE_AGENT' as any, payload });
          }}
        />
      )}
    </>
  );

  return { attempt, modal, isBlocked: !!check.mode, check };
}
