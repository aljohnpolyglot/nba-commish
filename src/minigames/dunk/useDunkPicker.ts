import { useEffect, useMemo, useState } from 'react';
import { NBAPlayer } from '../../types';
import { getRosterData } from '../../services/rosterService';
import { loadRatings, getPlayerRealK2 } from '../../data/NBA2kRatings';

export const DUNK_MAX_PICKS = 4;
export const DUNK_MIN_PICKS = 2;

type View = 'LOADING' | 'PICK' | 'RUN';

// Driving Dunk = IS.sub[2], fallback to raw dnk if gist not loaded
const dunkScore = (p: NBAPlayer): number => {
  const k2 = getPlayerRealK2(p.name);
  if (k2?.IS?.[2] != null) return k2.IS[2];
  const r = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null;
  return (r as any)?.dnk ?? 40;
};

export function useDunkPicker() {
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
        const filtered = (roster as NBAPlayer[])
          .filter((p: any) => p.tid >= 0 && p.tid < 100 && !p.retiredYear)
          .sort((a, b) => dunkScore(b) - dunkScore(a));
        setPlayers(filtered);
        setView('PICK');
      })
      .catch(err => {
        console.error('[useDunkPicker] roster load failed', err);
        if (!cancelled) setView('PICK');
      });
    return () => { cancelled = true; };
  }, []);

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
