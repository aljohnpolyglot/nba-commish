import { useEffect, useMemo, useState } from 'react';
import { NBAPlayer } from '../../types';
import { getRosterData } from '../../services/rosterService';
import {
  ThreePointContestant,
  mapPlayerToContestant,
} from '../../components/allstar/allstarevents/threepoint/contestants';

export const TPT_MAX_PICKS = 8;
export const TPT_MIN_PICKS = 3;

type View = 'LOADING' | 'PICK' | 'RUN';

const tpScore = (p: NBAPlayer): number => {
  const r = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null;
  return (r as any)?.tp ?? 0;
};

export function useThreePointPicker() {
  const [view, setView] = useState<View>('LOADING');
  const [players, setPlayers] = useState<NBAPlayer[]>([]);
  const [teamAbbrevByTid, setTeamAbbrevByTid] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getRosterData(2025, 'Opening Week')
      .then(({ players: roster, teams }) => {
        if (cancelled) return;
        const abbrevMap: Record<number, string> = {};
        teams.forEach((t: any) => { abbrevMap[t.id] = t.abbrev; });
        setTeamAbbrevByTid(abbrevMap);
        const filtered = (roster as NBAPlayer[])
          .filter((p: any) => p.tid >= 0 && p.tid < 100 && !p.retiredYear)
          .sort((a, b) => tpScore(b) - tpScore(a));
        setPlayers(filtered);
        setView('PICK');
      })
      .catch(err => {
        console.error('[useThreePointPicker] roster load failed', err);
        if (!cancelled) setView('PICK');
      });
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < TPT_MAX_PICKS) next.add(id);
      return next;
    });
  };

  const selectedPlayers = useMemo(
    () => players.filter(p => selectedIds.has(p.internalId)),
    [players, selectedIds]
  );

  const selectedContestants: ThreePointContestant[] = useMemo(
    () => selectedPlayers.map(p =>
      mapPlayerToContestant(p, teamAbbrevByTid[(p as any).tid] ?? 'NBA')
    ),
    [selectedPlayers, teamAbbrevByTid]
  );

  const start = () => setView('RUN');
  const reset = () => {
    setSelectedIds(new Set());
    setView('PICK');
  };

  return {
    view, players, selectedIds, selectedPlayers, selectedContestants,
    toggle, start, reset,
  };
}
