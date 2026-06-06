import { useEffect, useMemo, useState } from 'react';
import type { NBAPlayer } from '../../types';
import { getRosterData } from '../../services/rosterService';
import { loadRatings } from '../../data/NBA2kRatings';
import { ContestPickItem, ContestPickMetric, toContestPickItem } from './contestPlayerTypes';

type View = 'LOADING' | 'PICK' | 'RUN' | 'RESULTS';

type UseContestPlayerPickerArgs = {
  maxPicks: number;
  scorePlayer: (player: NBAPlayer) => number;
  metrics?: (player: NBAPlayer) => ContestPickMetric[];
};

export function useContestPlayerPicker({ maxPicks, scorePlayer, metrics }: UseContestPlayerPickerArgs) {
  const [view, setView] = useState<View>('LOADING');
  const [items, setItems] = useState<ContestPickItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([getRosterData(2025, 'Opening Week'), loadRatings()])
      .then(([{ players, teams }]) => {
        if (cancelled) return;
        const teamMap: Record<number, string> = {};
        teams.forEach((team: any) => { teamMap[team.id] = team.abbrev; });
        const nextItems = (players as NBAPlayer[])
          .filter((player: any) => player.tid >= 0 && player.tid < 100 && !player.retiredYear)
          .map(player => toContestPickItem(player, teamMap[(player as any).tid] ?? 'NBA', scorePlayer(player), metrics?.(player) ?? []))
          .sort((a, b) => b.score - a.score);
        setItems(nextItems);
        setView('PICK');
      })
      .catch(err => {
        console.error('[useContestPlayerPicker] roster load failed', err);
        if (!cancelled) setView('PICK');
      });
    return () => { cancelled = true; };
  }, [metrics, scorePlayer]);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < maxPicks) next.add(id);
      return next;
    });
  };

  const selectedPlayers = useMemo(
    () => items.filter(item => selectedIds.has(item.player.id)).map(item => item.source),
    [items, selectedIds],
  );

  const reset = () => {
    setSelectedIds(new Set());
    setView('PICK');
  };

  return { view, setView, items, selectedIds, selectedPlayers, toggle, reset };
}
