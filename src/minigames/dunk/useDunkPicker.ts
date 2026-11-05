import { useEffect, useMemo, useState } from 'react';
import { NBAPlayer } from '../../types';
import { getRosterData } from '../../services/rosterService';
import { loadRatings, getPlayerRealK2 } from '../../data/NBA2kRatings';
import { useGame } from '../../store/GameContext';
import { resolveMinigameNbaPlayers } from '../shared/minigameRoster';
import { getDrivingDunk } from '../../services/allStar/allStarDunkContestHelpers';

export const DUNK_MAX_PICKS = 4;
export const DUNK_MIN_PICKS = 2;

type View = 'LOADING' | 'PICK' | 'RUN';

export const getDunkPickerRating = (p: NBAPlayer): number | null => {
  const saved = p.drivingDunk == null ? Number.NaN : Number(p.drivingDunk);
  if (Number.isFinite(saved)) return Math.max(0, Math.min(99, Math.round(saved)));
  const k2 = getPlayerRealK2(p.name);
  const sourced = k2?.IS?.[2] == null ? Number.NaN : Number(k2.IS[2]);
  if (Number.isFinite(sourced)) return Math.max(0, Math.min(99, Math.round(sourced)));
  const fallback = Number(getDrivingDunk(p.name));
  return Number.isFinite(fallback) ? Math.max(0, Math.min(99, Math.round(fallback))) : null;
};

export function useDunkPicker() {
  const { state } = useGame();
  const [view, setView] = useState<View>('LOADING');
  const [players, setPlayers] = useState<NBAPlayer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getRosterData(2025, 'Opening Week'),
      loadRatings(),
    ])
      .then(([{ players: roster }]) => {
        if (cancelled) return;
        const filtered = resolveMinigameNbaPlayers(state.players, roster as NBAPlayer[])
          .filter((p: any) => p.tid >= 0 && p.tid < 100 && !p.retiredYear)
          .map(player => {
            const drivingDunk = getDunkPickerRating(player);
            return drivingDunk == null ? player : { ...player, drivingDunk };
          })
          .sort((a, b) => (getDunkPickerRating(b) ?? 0) - (getDunkPickerRating(a) ?? 0));
        setPlayers(filtered);
        setView('PICK');
      })
      .catch(err => {
        console.error('[useDunkPicker] roster load failed', err);
        if (!cancelled) setView('PICK');
      });
    return () => { cancelled = true; };
  }, [state.players]);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < DUNK_MAX_PICKS) next.add(id);
      return next;
    });
  };

  const selectedPlayers = useMemo(
    () => players.filter(p => selectedIds.has(p.internalId)),
    [players, selectedIds]
  );

  const start = () => setView('RUN');
  const reset = () => {
    setSelectedIds(new Set());
    setView('PICK');
  };

  return { view, players, selectedIds, selectedPlayers, toggle, start, reset };
}
