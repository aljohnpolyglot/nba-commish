import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useGame } from '../../../../../../store/GameContext';
import { getGameplan, saveGameplan, clearGameplan, type Gameplan } from '../../../../../../store/gameplanStore';
import { getIdealRotation } from '../../../../../../store/idealRotationStore';
import { getLockedStrategy } from '../../../../../../store/coachStrategyLockStore';
import { pushToast } from '../../../../../shared/ToastNotifier';
import { isEuroClubTeamId, KNOBS_PBA } from '../../../../../../services/simulation/SimulatorKnobs';
import { MinutesPlayedService } from '../../../../../../services/simulation/MinutesPlayedService';
import { injurySeverityLevel } from '../../../../../../services/simulation/playThroughInjuriesFactor';
import { resolveRotationPlan } from '../../../../../../services/simulation/rotationPlan';
import { buildLeagueBaseKnobs } from '../../../../../../services/simulation/GameSimulator/engineLeagueKnobs';
import type { NBAPlayer } from '../../../../../../types';
import { effectiveRecord } from '../../../../../../utils/salaryUtils';
import { getGameDateParts } from '../../../../../../utils/dateUtils';
import { resolveAnyTeam, isOnRoster } from '../../../../../../utils/teamLookup';
import {
  buildBenchOrder,
  buildIdealMinuteOverrides,
  buildMinuteOverrides,
  buildStarterOrder,
  getHealthyRoster,
  isInjured,
} from './gameplanTabShared';
import { useGameplanDrag } from './useGameplanDrag';

export interface GameplanTabController {
  team: any;
  state: ReturnType<typeof useGame>['state']; canEdit: boolean; isCommissioner: boolean;
  currentYear: number; targetMinutes: number; maxPlayerMinutes: number;
  starters: NBAPlayer[]; rotationBench: NBAPlayer[]; minuteOverrides: Record<string, number>;
  selectedId: string | null; totalMinutes: number; remaining: number;
  headerMinutesVisible: boolean; headerMinutesRef: React.RefObject<HTMLDivElement | null>;
  nextMatchup: any; opponent: any; matchupKind: 'reg' | 'cup' | 'playoff' | 'playin' | null;
  matchupDateLabel: string;
  matchupSeries: { round: string; myWins: number; oppWins: number; gameNum?: number } | null;
  injuredPlayers: NBAPlayer[]; twoWayIneligible: NBAPlayer[]; isPlayoffSeason: boolean;
  onCardPointerDown: (id: string, source: 'starter' | 'rotation') => (e: React.PointerEvent) => void;
  dragStyle: (id: string, source: 'starter' | 'rotation') => React.CSSProperties | undefined;
  handleCardClick: (id: string) => void; handleTap: (id: string) => void; clearSelection: () => void;
  autoDistribute: () => void; resetToAuto: () => void; setMins: (id: string, value: number) => void;
  noScrollOnFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export function useGameplanTabController(teamId: number): GameplanTabController {
  const { state } = useGame();
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const currentYear = state.leagueStats?.year || 2026;
  const defaultQuarterLength = isEuroClubTeamId(teamId) ? 10 : 12;
  const gameLengthMinutes = (state.leagueStats?.quarterLength ?? defaultQuarterLength) * (state.leagueStats?.numQuarters ?? 4);
  const targetMinutes = gameLengthMinutes * 5;
  const maxPlayerMinutes = gameLengthMinutes;
  const canEdit = state.gameMode !== 'gm' || teamId === state.userTeamId;
  const isCommissioner = state.gameMode !== 'gm';

  const isPlayoffSeason = useMemo(() => {
    if (!state.date) return false;
    const { month } = getGameDateParts(state.date);
    return month >= 4 && month <= 6;
  }, [state.date]);

  const nextMatchup = useMemo(() => {
    if (!state.schedule || !state.date) return null;
    return state.schedule
      .filter(g => !g.played)
      .filter(g => g.homeTid === teamId || g.awayTid === teamId)
      .filter(
        g =>
          !g.isPreseason &&
          !g.isExhibition &&
          !g.isAllStar &&
          !g.isRisingStars &&
          !g.isCelebrityGame &&
          !g.isDunkContest &&
          !g.isThreePointContest &&
          !g.isThroneEvent &&
          !g.isCupTBD,
      )
      .filter(g => g.date >= state.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  }, [state.schedule, state.date, teamId]);

  const matchupSeries = useMemo(() => {
    if (!nextMatchup?.isPlayoff || !nextMatchup.playoffSeriesId) return null;
    const series = (state as any).playoffs?.series?.find((s: any) => s.id === nextMatchup.playoffSeriesId);
    if (!series) return null;
    return {
      round:
        series.round === 1
          ? 'Round 1'
          : series.round === 2
            ? 'Round 2'
            : series.round === 3
              ? 'Conference Finals'
              : 'NBA Finals',
      myWins: series.higherSeedTid === teamId ? series.higherSeedWins : series.lowerSeedWins,
      oppWins: series.higherSeedTid === teamId ? series.lowerSeedWins : series.higherSeedWins,
      gameNum: nextMatchup.playoffGameNumber,
    };
  }, [nextMatchup, state, teamId]);

  const matchupDateLabel = useMemo(() => {
    if (!nextMatchup) return '';
    try {
      return format(parseISO(nextMatchup.date), 'EEE MMM d');
    } catch {
      return nextMatchup.date;
    }
  }, [nextMatchup]);

  const matchupKind = useMemo<'reg' | 'cup' | 'playoff' | 'playin' | null>(() => {
    if (!nextMatchup) return null;
    if (nextMatchup.isPlayoff) return 'playoff';
    if (nextMatchup.isPlayIn) return 'playin';
    if (nextMatchup.isNBACup) return 'cup';
    return 'reg';
  }, [nextMatchup]);

  const opponent = useMemo(() => {
    if (!nextMatchup) return null;
    const opponentTid = nextMatchup.homeTid === teamId ? nextMatchup.awayTid : nextMatchup.homeTid;
    return state.teams.find(t => t.id === opponentTid) ?? null;
  }, [nextMatchup, state.teams, teamId]);

  const { ptiRegular, ptiPlayoffs } = useMemo(() => {
    const locked = getLockedStrategy(teamId);
    return {
      ptiRegular: locked?.sliders.ptiRegular ?? 0,
      ptiPlayoffs: locked?.sliders.ptiPlayoffs ?? 40,
    };
  }, [teamId]);
  const ptiLevel = Math.round(((isPlayoffSeason ? ptiPlayoffs : ptiRegular) / 100) * 4);

  const { rotation, baseMinutes, injuredPlayers, benchPool, twoWayIneligible } = useMemo(() => {
    if (!team) {
      return { rotation: [], baseMinutes: [], injuredPlayers: [], benchPool: [], twoWayIneligible: [] };
    }
    const roster = state.players.filter(p => p.tid === teamId && isOnRoster(p));
    const playoffIneligible = isPlayoffSeason ? roster.filter(p => (p as any).twoWay) : [];
    const eligibleRoster = isPlayoffSeason ? roster.filter(p => !(p as any).twoWay) : roster;
    const injured = eligibleRoster.filter(p => isInjured(p, ptiLevel));
    const rec = effectiveRecord(team, currentYear);
    const confTeams = state.teams
      .filter(t => t.conference === team.conference)
      .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
      .sort((a, b) => b.rec.wins - b.rec.losses - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const confRank = Math.max(1, confTeams.findIndex(c => c.t.id === teamId) + 1 || 8);
    const gb = Math.max(0, ((leader?.rec.wins ?? 0) - rec.wins + rec.losses - (leader?.rec.losses ?? 0)) / 2);
    const gamesRemaining = Math.max(0, 82 - (rec.wins + rec.losses));
    const baseKnobs = buildLeagueBaseKnobs(state.leagueStats);
    const isPbaTeam = teamId >= 2000 && teamId < 3000;
    const resolvedPlan = resolveRotationPlan(
      team,
      state.players,
      currentYear,
      {
        ...(isPbaTeam ? { ...baseKnobs, ...KNOBS_PBA } : baseKnobs),
        conferenceRank: confRank,
        gbFromLeader: gb,
        gamesRemaining,
        playThroughInjuries: ptiLevel,
        quarterLength: state.leagueStats?.quarterLength ?? (isPbaTeam ? KNOBS_PBA.quarterLength : defaultQuarterLength),
        numQuarters: state.leagueStats?.numQuarters ?? 4,
      },
      0,
      undefined,
    );
    const inRotationIds = new Set(resolvedPlan.rotation.map(p => p.internalId));
    return {
      rotation: resolvedPlan.rotation.filter(p => !(p as any).twoWay || !isPlayoffSeason),
      baseMinutes: resolvedPlan.minuteTargets,
      injuredPlayers: injured,
      benchPool: eligibleRoster.filter(p => !inRotationIds.has(p.internalId) && !isInjured(p, ptiLevel)),
      twoWayIneligible: playoffIneligible,
    };
  }, [
    team,
    state.players,
    state.teams,
    state.leagueStats?.quarterLength,
    state.leagueStats?.numQuarters,
    state.leagueStats,
    teamId,
    currentYear,
    isPlayoffSeason,
    ptiLevel,
    defaultQuarterLength,
  ]);

  const onTeamIds = useMemo(
    () => new Set(state.players.filter(p => p.tid === teamId && isOnRoster(p)).map(p => p.internalId)),
    [state.players, teamId],
  );
  const { healthyRoster, healthyIds } = useMemo(() => getHealthyRoster(state.players, teamId), [state.players, teamId]);

  const [starterOrder, setStarterOrder] = useState<string[]>([]);
  const [benchOrder, setBenchOrder] = useState<string[]>([]);
  const [minuteOverrides, setMinuteOverrides] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seededFor = useRef('');

  useEffect(() => {
    const key = rotation.map(p => p.internalId).join('|');
    if (!key || key === seededFor.current) return;
    seededFor.current = key;
    const saved = getGameplan(teamId);
    const ideal = !saved ? getIdealRotation(teamId) : null;
    const starters = buildStarterOrder({
      savedStarterIds: saved?.starterIds,
      idealStarterIds: ideal?.locked ? ideal.starterIds : undefined,
      team,
      players: state.players,
      teamId,
      currentYear,
      onTeamIds,
      healthyRoster,
      healthyIds,
      forceSort: false,
    });
    setStarterOrder(starters);
    setBenchOrder(buildBenchOrder(saved?.benchOrder, starters, rotation, onTeamIds));
    setMinuteOverrides(
      buildMinuteOverrides({
        rotation,
        baseMinutes,
        maxPlayerMinutes,
        targetMinutes,
        savedMinuteOverrides: saved?.minuteOverrides,
        idealMinutes: buildIdealMinuteOverrides(ideal, rotation),
      }),
    );
  }, [
    rotation,
    baseMinutes,
    team,
    state.players,
    teamId,
    currentYear,
    onTeamIds,
    healthyRoster,
    healthyIds,
    maxPlayerMinutes,
    targetMinutes,
  ]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!canEdit || starterOrder.length !== 5) return;
    const plan: Gameplan = {
      starterIds: starterOrder,
      benchOrder,
      minuteOverrides: Object.fromEntries(Object.entries(minuteOverrides).filter(([, value]) => value > 0)),
    };
    saveGameplan(teamId, plan);
  }, [starterOrder, benchOrder, minuteOverrides, canEdit, teamId]);

  const playersById = useMemo(() => new Map(state.players.map(player => [player.internalId, player])), [state.players]);
  const starters = useMemo(
    () => starterOrder.map(id => playersById.get(id)).filter((p): p is NBAPlayer => !!p),
    [starterOrder, playersById],
  );
  const rotationBench = useMemo(() => {
    const starterSet = new Set(starterOrder);
    const seen = new Set<string>();
    const rawBench: NBAPlayer[] = [];
    for (const player of rotation) {
      if (starterSet.has(player.internalId) || isInjured(player, ptiLevel) || seen.has(player.internalId)) continue;
      seen.add(player.internalId);
      rawBench.push(player);
    }
    for (const player of benchPool) {
      if (starterSet.has(player.internalId) || seen.has(player.internalId)) continue;
      seen.add(player.internalId);
      rawBench.push(player);
    }
    const byId = new Map(rawBench.map(player => [player.internalId, player]));
    const ordered: NBAPlayer[] = [];
    for (const id of benchOrder) {
      const player = byId.get(id);
      if (player) {
        ordered.push(player);
        byId.delete(id);
      }
    }
    for (const player of rawBench) {
      if (byId.has(player.internalId)) ordered.push(player);
    }
    return ordered;
  }, [starterOrder, rotation, benchPool, benchOrder, ptiLevel]);

  const performSwap = (sourceId: string, targetId: string) => {
    if (!canEdit || sourceId === targetId) return;
    const starterSourceIndex = starterOrder.indexOf(sourceId);
    const starterTargetIndex = starterOrder.indexOf(targetId);
    const benchIds = rotationBench.map(player => player.internalId);
    const benchSourceIndex = benchIds.indexOf(sourceId);
    const benchTargetIndex = benchIds.indexOf(targetId);
    if (starterSourceIndex >= 0 && starterTargetIndex >= 0) {
      setStarterOrder(prev => {
        const next = [...prev];
        [next[starterSourceIndex], next[starterTargetIndex]] = [next[starterTargetIndex], next[starterSourceIndex]];
        return next;
      });
      return;
    }
    if (benchSourceIndex >= 0 && benchTargetIndex >= 0) {
      const next = [...benchIds];
      [next[benchSourceIndex], next[benchTargetIndex]] = [next[benchTargetIndex], next[benchSourceIndex]];
      setBenchOrder(next);
      return;
    }
    if (benchSourceIndex >= 0 && starterTargetIndex >= 0) {
      const displaced = starterOrder[starterTargetIndex];
      setStarterOrder(prev => {
        const next = [...prev];
        next[starterTargetIndex] = sourceId;
        return next;
      });
      const nextBench = [...benchIds];
      nextBench[benchSourceIndex] = displaced;
      setBenchOrder(nextBench);
      return;
    }
    if (starterSourceIndex >= 0 && benchTargetIndex >= 0) {
      const displaced = benchIds[benchTargetIndex];
      setStarterOrder(prev => {
        const next = [...prev];
        next[starterSourceIndex] = displaced;
        return next;
      });
      const nextBench = [...benchIds];
      nextBench[benchTargetIndex] = sourceId;
      setBenchOrder(nextBench);
    }
  };

  const handleTap = (id: string) => {
    if (!canEdit) return;
    if (selectedId === null) {
      setSelectedId(id);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    performSwap(selectedId, id);
    setSelectedId(null);
  };

  const { onCardPointerDown, dragStyle, handleCardClick } = useGameplanDrag({
    canEdit,
    handleTap,
    performSwap,
  });

  const totalMinutes = useMemo(() => Object.values(minuteOverrides).reduce((a, b) => a + b, 0), [minuteOverrides]);
  const remaining = targetMinutes - totalMinutes;

  const setMins = (id: string, value: number) => {
    if (!canEdit) return;
    setMinuteOverrides(prev => {
      const clamped = Math.max(0, Math.min(maxPlayerMinutes, value));
      const current = prev[id] ?? 0;
      if (clamped > current) {
        const othersTotal = Object.entries(prev).reduce((sum, [key, minutes]) => (key === id ? sum : sum + minutes), 0);
        const maxAllowed = Math.max(current, targetMinutes - othersTotal);
        return { ...prev, [id]: Math.min(clamped, maxAllowed) };
      }
      return { ...prev, [id]: clamped };
    });
  };

  useEffect(() => {
    if (!canEdit || remaining === 0) return;
    const timer = setTimeout(() => pushToast({ type: 'rotation-budget', delta: remaining }), 1500);
    return () => clearTimeout(timer);
  }, [remaining, canEdit]);

  const noScrollOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const scrollables: Array<{ el: Element; top: number }> = [];
    let element: Element | null = e.target;
    while (element) {
      if (element.scrollHeight > element.clientHeight) scrollables.push({ el: element, top: element.scrollTop });
      element = element.parentElement;
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
    const observer = new IntersectionObserver(([entry]) => setHeaderMinutesVisible(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const seedAutoState = (forceSort: boolean) => {
    const ideal = getIdealRotation(teamId);
    const starters = buildStarterOrder({
      savedStarterIds: undefined,
      idealStarterIds: ideal?.locked ? ideal.starterIds : undefined,
      team,
      players: state.players,
      teamId,
      currentYear,
      onTeamIds,
      healthyRoster,
      healthyIds,
      forceSort,
    });
    setStarterOrder(starters);
    setBenchOrder(rotation.map(player => player.internalId).filter(id => !new Set(starters).has(id)));
    setMinuteOverrides(
      buildMinuteOverrides({
        rotation,
        baseMinutes,
        maxPlayerMinutes,
        targetMinutes,
        idealMinutes: buildIdealMinuteOverrides(ideal, rotation),
      }),
    );
    setSelectedId(null);
  };

  const resetToAuto = () => {
    if (!canEdit) return;
    clearGameplan(teamId);
    seededFor.current = '';
    seedAutoState(true);
  };

  const autoDistribute = () => {
    if (!canEdit) return;
    const entries = Object.entries(minuteOverrides);
    const currentTotal = entries.reduce((a, [, value]) => a + value, 0);
    if (currentTotal === targetMinutes) return;
    if (currentTotal <= 0) {
      const roster = [...starters, ...rotationBench].slice(0, 10);
      if (roster.length === 0) return;
      const per = Math.floor(targetMinutes / roster.length);
      const next = Object.fromEntries(roster.map(player => [player.internalId, per]));
      let residual = targetMinutes - per * roster.length;
      for (let i = 0; i < roster.length && residual > 0; i++) {
        next[roster[i].internalId] += 1;
        residual -= 1;
      }
      setMinuteOverrides(next);
      return;
    }
    const scale = targetMinutes / currentTotal;
    const next = Object.fromEntries(
      entries.map(([key, value]) => [key, Math.max(0, Math.min(maxPlayerMinutes, Math.round(value * scale)))]),
    );
    let diff = targetMinutes - Object.values(next).reduce((a, b) => a + b, 0);
    const order = Object.entries(next).sort((a, b) => b[1] - a[1]).map(([key]) => key);
    for (let i = 0; diff !== 0 && i < order.length; i++) {
      const key = order[i];
      const step = diff > 0 ? 1 : -1;
      const nextValue = next[key] + step;
      if (nextValue < 0 || nextValue > maxPlayerMinutes) continue;
      next[key] = nextValue;
      diff -= step;
    }
    setMinuteOverrides(next);
  };

  return {
    team,
    state,
    canEdit,
    isCommissioner,
    currentYear,
    targetMinutes,
    maxPlayerMinutes,
    starters,
    rotationBench,
    minuteOverrides,
    selectedId,
    totalMinutes,
    remaining,
    headerMinutesVisible,
    headerMinutesRef,
    nextMatchup,
    opponent,
    matchupKind,
    matchupDateLabel,
    matchupSeries,
    injuredPlayers,
    twoWayIneligible,
    isPlayoffSeason,
    onCardPointerDown,
    dragStyle,
    handleCardClick,
    handleTap,
    clearSelection: () => setSelectedId(null),
    autoDistribute,
    resetToAuto,
    setMins,
    noScrollOnFocus,
  };
}
