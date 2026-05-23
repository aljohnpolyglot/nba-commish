import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../../../../../store/GameContext';
import { StarterService } from '../../../../../../services/simulation/StarterService';
import { isEuroClubTeamId } from '../../../../../../services/simulation/SimulatorKnobs';
import { effectiveRecord, getTradeOutlook, getCapThresholds, topNAvgK2 } from '../../../../../../utils/salaryUtils';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import {
  getIdealRotation,
  saveIdealRotation,
  clearIdealRotation,
  reconcileIdealMinutes,
  reconcileStarters,
} from '../../../../../../store/idealRotationStore';
import type { NBAPlayer } from '../../../../../../types';
import { getLockedStrategy, lockStrategy } from '../../../../../../store/coachStrategyLockStore';
import { calculateCoachSliders } from '../lib/coachSliders';
import { resolveAnyTeam, isOnRoster } from '../../../../../../utils/teamLookup';
import { getGameDateParts } from '../../../../../../utils/dateUtils';
import { computeBaselineFromService, computeStrengthOptimalBaseline, OUTLOOK_OPTIONS, type OutlookKey } from './idealRotationBaseline';
import { IdealRotationReseedModal } from './IdealRotationReseedModal';
import {
  IdealRotationFloatingMinutes,
  IdealRotationHeader,
  IdealRotationPanel,
  IdealRotationStartersPanel,
  IdealRotationSwapHint,
  IdealRotationTwoWayPanel,
} from './IdealRotationPanels';

interface IdealRotationTabProps {
  teamId: number;
}

export function IdealRotationTab({ teamId }: IdealRotationTabProps) {
  const { state } = useGame();
  const isEuroClubTeam = useMemo(() => isEuroClubTeamId(teamId), [teamId]);
  const gameLengthMinutes = (state.leagueStats?.quarterLength ?? (isEuroClubTeam ? 10 : 12)) * (state.leagueStats?.numQuarters ?? 4);
  const targetMinutes = gameLengthMinutes * 5;
  const maxPlayerMinutes = gameLengthMinutes;

  const benchDepth = useMemo(() => {
    const locked = getLockedStrategy(teamId);
    if (locked) return locked.sliders.benchDepth ?? 50;
    const team = state.teams.find(entry => entry.id === teamId);
    if (team) {
      const year = state.leagueStats?.year ?? new Date().getFullYear();
      const rec = effectiveRecord(team, year);
      const teamPlayers = state.players.filter(player => player.tid === teamId);
      const confRank = [...state.teams.filter(entry => entry.conference === team.conference)]
        .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
        .findIndex(entry => entry.id === teamId) + 1;
      const outlook = getTradeOutlook(
        teamPlayers.reduce((sum, player) => sum + (player.contract?.amount ?? 0) * 1000, 0),
        rec.wins,
        rec.losses,
        teamPlayers.filter(player => (player.contract?.exp ?? 0) <= year).length,
        getCapThresholds(state.leagueStats as any),
        confRank,
        0,
        topNAvgK2(teamPlayers, 3),
        topNAvgK2(state.players.filter(player => player.tid >= 0 && player.tid < 30), 3),
      );
      const roleDepth: Record<string, number> = { heavy_buyer: 15, buyer: 30, neutral: 50, seller: 65, rebuilding: 85 };
      return roleDepth[outlook.role] ?? 50;
    }
    return calculateCoachSliders(state.players.filter(player => player.tid === teamId && isOnRoster(player)) as any).benchDepth;
  }, [teamId, state.players, state.teams, state.leagueStats]);

  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const isCommissioner = state.gameMode !== 'gm';
  const canEdit = isCommissioner || teamId === state.userTeamId;
  const isPlayoffSeason = useMemo(() => {
    if (!state.date) return false;
    const { month } = getGameDateParts(state.date);
    return month >= 4 && month <= 6;
  }, [state.date]);

  const allRoster = useMemo(() => state.players.filter(player => player.tid === teamId && isOnRoster(player)), [state.players, teamId]);
  const twoWayIneligible = useMemo(() => (isPlayoffSeason ? allRoster.filter(player => (player as any).twoWay) : []), [allRoster, isPlayoffSeason]);
  const roster = useMemo(() => (isPlayoffSeason ? allRoster.filter(player => !(player as any).twoWay) : allRoster), [allRoster, isPlayoffSeason]);
  const rosterIds = useMemo(() => roster.map(player => player.internalId), [roster]);
  const rosterIdKey = rosterIds.join('|');
  const currentYear = state.leagueStats?.year || 2026;

  const projectedStarters = useMemo(
    () => (team ? StarterService.getProjectedStarters(team, state.players).slice(0, 5).map(player => player.internalId) : []),
    [team, state.players],
  );
  const standingsCtx = useMemo(() => {
    if (!team) return { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
    const rec = effectiveRecord(team, currentYear);
    const confTeams = state.teams
      .filter(entry => entry.conference === team.conference)
      .map(entry => ({ team: entry, rec: effectiveRecord(entry, currentYear) }))
      .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const leaderWL = leader ? leader.rec.wins - leader.rec.losses : 0;
    const myWL = rec.wins - rec.losses;
    return {
      conferenceRank: Math.max(1, confTeams.findIndex(entry => entry.team.id === team.id) + 1),
      gbFromLeader: Math.max(0, (leaderWL - myWL) / 2),
      gamesRemaining: Math.max(0, 82 - (rec.wins + rec.losses)),
    };
  }, [team, state.teams, currentYear]);

  const [reseedOpen, setReseedOpen] = useState(false);
  const [reseedOutlook, setReseedOutlook] = useState<OutlookKey>('auto');
  const reseedDepth = useMemo(() => OUTLOOK_OPTIONS.find(option => option.key === reseedOutlook)?.depth ?? benchDepth, [reseedOutlook, benchDepth]);
  const reseedPreview = useMemo(() => {
    if (!reseedOpen || !team) return null;
    const bias = OUTLOOK_OPTIONS.find(option => option.key === reseedOutlook)?.bias ?? 1.0;
    return isEuroClubTeam
      ? computeBaselineFromService(
          team,
          state.players,
          roster,
          currentYear,
          standingsCtx,
          reseedDepth,
          state.leagueStats?.quarterLength ?? 10,
          state.leagueStats?.numQuarters ?? 4,
          'euro_club',
        )
      : computeStrengthOptimalBaseline(team, roster, currentYear, reseedDepth, bias, targetMinutes, maxPlayerMinutes);
  }, [reseedOpen, team, reseedOutlook, isEuroClubTeam, state.players, roster, currentYear, standingsCtx, reseedDepth, state.leagueStats?.quarterLength, state.leagueStats?.numQuarters, targetMinutes, maxPlayerMinutes]);

  const [tick, setTick] = useState(0);
  const saved = useMemo(() => getIdealRotation(teamId), [teamId, tick, rosterIdKey]);
  const locked = saved?.locked ?? false;
  const { starters, minutes } = useMemo(() => {
    const baseline = isEuroClubTeam
      ? computeBaselineFromService(
          team,
          state.players,
          roster,
          currentYear,
          standingsCtx,
          benchDepth,
          state.leagueStats?.quarterLength ?? 10,
          state.leagueStats?.numQuarters ?? 4,
          'euro_club',
        )
      : computeStrengthOptimalBaseline(team, roster, currentYear, benchDepth, 1.0, targetMinutes, maxPlayerMinutes);
    const byOvr = [...roster].sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a)).map(player => player.internalId);
    const fallback = baseline.starterIds.length ? baseline.starterIds : (projectedStarters.length ? projectedStarters : byOvr);

    if (!locked || !saved) {
      return { starters: reconcileStarters([], rosterIds, fallback), minutes: baseline.minutes };
    }

    const reconciledStarters = reconcileStarters(saved.starterIds, rosterIds, fallback);
    const reconciledMinutes = reconcileIdealMinutes(saved.minutes, rosterIds);
    const changed =
      reconciledStarters.join('|') !== saved.starterIds.join('|') ||
      Object.keys(reconciledMinutes).length !== Object.keys(saved.minutes).length ||
      Object.entries(reconciledMinutes).some(([id, value]) => saved.minutes[id] !== value);
    if (changed && canEdit) {
      saveIdealRotation(teamId, { starterIds: reconciledStarters, minutes: reconciledMinutes, locked: true, benchOrder: saved.benchOrder });
    }
    return { starters: reconciledStarters, minutes: reconciledMinutes };
  }, [isEuroClubTeam, team, state.players, state.leagueStats?.quarterLength, state.leagueStats?.numQuarters, roster, currentYear, standingsCtx, benchDepth, targetMinutes, maxPlayerMinutes, projectedStarters, locked, saved, rosterIds, canEdit, teamId]);

  const playersById = useMemo(() => new Map(state.players.map(player => [player.internalId, player] as const)), [state.players]);
  const benchPlayers = useMemo(() => {
    const nonStarters = roster.filter(player => !new Set(starters).has(player.internalId));
    if (locked && saved?.benchOrder?.length) {
      const byId = new Map(nonStarters.map(player => [player.internalId, player]));
      const ordered: NBAPlayer[] = [];
      for (const id of saved.benchOrder) {
        const player = byId.get(id);
        if (player) {
          ordered.push(player);
          byId.delete(id);
        }
      }
      for (const player of nonStarters) {
        if (byId.has(player.internalId)) ordered.push(player);
      }
      return ordered;
    }
    return locked
      ? nonStarters.sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a))
      : nonStarters.sort((a, b) => (minutes[b.internalId] ?? 0) - (minutes[a.internalId] ?? 0));
  }, [roster, starters, locked, saved?.benchOrder, minutes]);
  const starterPlayers = useMemo(() => {
    const raw = starters.map(id => playersById.get(id)).filter((player): player is NBAPlayer => !!player);
    const needsResort = !locked || !saved || saved.starterIds.some(id => !rosterIds.includes(id));
    return needsResort ? StarterService.sortByPositionSlot(raw, currentYear) : raw;
  }, [starters, playersById, locked, saved, rosterIds, currentYear]);

  const totalMinutes = Object.values(minutes).reduce((a, b) => a + b, 0);
  const remaining = targetMinutes - totalMinutes;
  const writable = canEdit && locked;
  const persistEdit = (nextStarters: string[], nextMinutes: Record<string, number>) => {
    if (!canEdit) return;
    saveIdealRotation(teamId, { starterIds: nextStarters, minutes: nextMinutes, locked: true, benchOrder: getIdealRotation(teamId)?.benchOrder });
    setTick(value => value + 1);
  };
  const setMins = (id: string, value: number) => {
    if (!writable) return;
    const clamped = Math.max(0, Math.min(maxPlayerMinutes, value));
    const current = minutes[id] ?? 0;
    if (clamped > current) {
      const othersTotal = Object.entries(minutes).reduce((sum, [playerId, mins]) => (playerId === id ? sum : sum + mins), 0);
      persistEdit(starters, { ...minutes, [id]: Math.min(clamped, Math.max(current, targetMinutes - othersTotal)) });
      return;
    }
    persistEdit(starters, { ...minutes, [id]: clamped });
  };
  const toggleLock = () => {
    if (!canEdit) return;
    if (locked) {
      clearIdealRotation(teamId);
    } else {
      const ordered = StarterService.sortByPositionSlot(
        starters.map(id => playersById.get(id)).filter((player): player is NBAPlayer => !!player),
        currentYear,
      ).map(player => player.internalId);
      saveIdealRotation(teamId, { starterIds: ordered, minutes, locked: true, benchOrder: benchPlayers.map(player => player.internalId) });
    }
    setTick(value => value + 1);
  };
  const applyReseed = () => {
    if (!reseedPreview || !canEdit) return;
    const ordered = StarterService.sortByPositionSlot(
      reseedPreview.starterIds.map(id => state.players.find(player => player.internalId === id)).filter((player): player is NBAPlayer => !!player),
      currentYear,
    ).map(player => player.internalId);
    const benchOrder = Object.entries(reseedPreview.minutes)
      .filter(([id]) => !reseedPreview.starterIds.includes(id) && reseedPreview.minutes[id] > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);
    saveIdealRotation(teamId, { starterIds: ordered, minutes: reseedPreview.minutes, locked: true, benchOrder });
    const rosterForSliders = state.players.filter(player => player.tid === teamId && isOnRoster(player));
    const baseSliders = getLockedStrategy(teamId)?.sliders ?? calculateCoachSliders(rosterForSliders as any);
    lockStrategy(teamId, { ...baseSliders, benchDepth: reseedDepth });
    setTick(value => value + 1);
    setReseedOpen(false);
  };

  const performSwap = (src: string, target: string) => {
    if (!writable || src === target) return;
    const srcInStart = starters.indexOf(src);
    const tgtInStart = starters.indexOf(target);
    const benchIds = benchPlayers.map(player => player.internalId);
    const srcInBench = benchIds.indexOf(src);
    const tgtInBench = benchIds.indexOf(target);
    if (srcInStart >= 0 && tgtInStart >= 0) {
      const next = [...starters];
      [next[srcInStart], next[tgtInStart]] = [next[tgtInStart], next[srcInStart]];
      persistEdit(next, minutes);
    } else if (srcInBench >= 0 && tgtInStart >= 0) {
      const next = [...starters];
      next[tgtInStart] = src;
      persistEdit(next, minutes);
    } else if (srcInStart >= 0 && tgtInBench >= 0) {
      const next = [...starters];
      next[srcInStart] = target;
      persistEdit(next, minutes);
    }
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingSlider, setDraggingSlider] = useState<{ id: string; value: number } | null>(null);
  const [drag, setDrag] = useState<null | { id: string; source: 'starter' | 'rotation'; startX: number; startY: number; dx: number; dy: number; active: boolean }>(null);
  const dragRef = useRef(drag);
  const performSwapRef = useRef(performSwap);
  const suppressNextClick = useRef(false);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  performSwapRef.current = performSwap;

  const handleTap = (id: string) => {
    if (!writable) return;
    if (selectedId === null) {
      setSelectedId(id);
    } else if (selectedId === id) {
      setSelectedId(null);
    } else {
      performSwap(selectedId, id);
      setSelectedId(null);
    }
  };
  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;

  const onCardPointerDown = (id: string, source: 'starter' | 'rotation') => (e: React.PointerEvent) => {
    if (!writable || (e.button !== undefined && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest('input, button, [data-no-drag]')) return;
    setDrag({ id, source, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false });
  };

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const dx = e.clientX - current.startX;
      const dy = e.clientY - current.startY;
      const active = current.active || Math.hypot(dx, dy) > 8;
      setDrag({ ...current, dx, dy, active });
      if (active) e.preventDefault();
    };
    const finish = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) {
        setDrag(null);
        return;
      }
      if (!current.active) {
        suppressNextClick.current = true;
        handleTapRef.current(current.id);
        setDrag(null);
        window.setTimeout(() => {
          suppressNextClick.current = false;
        }, 500);
        return;
      }
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.('[data-player-id]') as HTMLElement | null;
      const targetId = target?.getAttribute('data-player-id');
      suppressNextClick.current = true;
      if (targetId && targetId !== current.id) performSwapRef.current(current.id, targetId);
      setDrag(null);
      window.setTimeout(() => {
        suppressNextClick.current = false;
      }, 500);
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drag]);

  const dragStyle = (id: string, source: 'starter' | 'rotation') =>
    !drag || drag.id !== id || drag.source !== source || !drag.active
      ? undefined
      : ({
          transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(1.06)`,
          zIndex: 50,
          opacity: 0.92,
          boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
          transition: 'none',
          pointerEvents: 'none',
        } satisfies React.CSSProperties);
  const onCardClick = (id: string) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (!drag) handleTap(id);
  };
  const noScrollOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const scrollables: Array<{ el: Element; top: number }> = [];
    let current: Element | null = e.target;
    while (current) {
      if (current.scrollHeight > current.clientHeight) scrollables.push({ el: current, top: current.scrollTop });
      current = current.parentElement;
    }
    const winY = window.scrollY;
    requestAnimationFrame(() => {
      scrollables.forEach(({ el, top }) => {
        (el as HTMLElement).scrollTop = top;
      });
      window.scrollTo(window.scrollX, winY);
    });
  };

  const [headerMinutesVisible, setHeaderMinutesVisible] = useState(true);
  const headerMinutesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = headerMinutesRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setHeaderMinutesVisible(entry.isIntersecting), { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!team) return <div className="text-slate-400 text-sm">Team not found.</div>;

  return (
    <div className="flex flex-col gap-4">
      <IdealRotationHeader
        canEdit={canEdit}
        headerMinutesRef={headerMinutesRef}
        isCommissioner={isCommissioner}
        locked={locked}
        remaining={remaining}
        targetMinutes={targetMinutes}
        totalMinutes={totalMinutes}
        onReseed={() => setReseedOpen(true)}
        onToggleLock={toggleLock}
      />
      <IdealRotationReseedModal
        open={reseedOpen}
        benchDepth={benchDepth}
        maxPlayerMinutes={maxPlayerMinutes}
        playersById={playersById}
        reseedDepth={reseedDepth}
        reseedOutlook={reseedOutlook}
        reseedPreview={reseedPreview}
        onApply={applyReseed}
        onClose={() => setReseedOpen(false)}
        onOutlookChange={setReseedOutlook}
      />
      <IdealRotationSwapHint selectedId={selectedId} onCancel={() => setSelectedId(null)} />
      <IdealRotationStartersPanel
        dragStyle={dragStyle}
        onCardClick={onCardClick}
        onCardPointerDown={onCardPointerDown}
        selectedId={selectedId}
        starterPlayers={starterPlayers}
        writable={writable}
      />
      <IdealRotationTwoWayPanel currentYear={currentYear} isPlayoffSeason={isPlayoffSeason} players={twoWayIneligible} />
      <IdealRotationFloatingMinutes remaining={remaining} targetMinutes={targetMinutes} totalMinutes={totalMinutes} visible={headerMinutesVisible} />
      <IdealRotationPanel
        benchPlayers={benchPlayers}
        currentYear={currentYear}
        dragStyle={dragStyle}
        draggingSlider={draggingSlider}
        maxPlayerMinutes={maxPlayerMinutes}
        minutes={minutes}
        noScrollOnFocus={noScrollOnFocus}
        onCardClick={onCardClick}
        onCardPointerDown={onCardPointerDown}
        onSliderChange={(id, value) => setDraggingSlider({ id, value })}
        onSliderCommit={id => {
          if (writable && draggingSlider?.id === id) {
            setMins(id, draggingSlider.value);
            setDraggingSlider(null);
          }
        }}
        selectedId={selectedId}
        starterPlayers={starterPlayers}
        writable={writable}
      />
    </div>
  );
}
