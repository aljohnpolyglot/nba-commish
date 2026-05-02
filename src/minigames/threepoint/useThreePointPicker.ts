import { useEffect, useMemo, useState } from 'react';
import { NBAPlayer } from '../../types';
import { getRosterData } from '../../services/rosterService';
import {
  ThreePointContestant,
  mapPlayerToContestant,
} from '../../components/allstar/allstarevents/threepoint/contestants';
import { loadRatings } from '../../data/NBA2kRatings';
import { calculateK2 } from '../../services/simulation/convert2kAttributes';

export const TPT_MAX_PICKS = 8;
export const TPT_MIN_PICKS = 3;

type View = 'LOADING' | 'PICK' | 'RUN';

// Sort by K2-converted Three-Point Shot (OS.sub[2]) for game accuracy
const tpScore = (p: NBAPlayer): number => {
  const r: any = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : {};
  const k2 = calculateK2({
    hgt: r.hgt ?? 50, stre: r.stre ?? 50, spd: r.spd ?? 50, jmp: r.jmp ?? 50, endu: 70,
    ins: r.ins ?? 50, dnk: r.dnk ?? 50,
    ft: Math.min(99, Math.round((r.fg ?? 50) * 0.9 + 5)),
    fg: r.fg ?? 50, tp: r.tp ?? 50,
    oiq: Math.min(99, Math.round((r.drb ?? 50) * 0.4 + (r.fg ?? 50) * 0.3 + (r.tp ?? 50) * 0.2 + 10)),
    diq: r.def ?? r.diq ?? 50, drb: r.drb ?? 50,
    pss: Math.min(99, Math.round((r.drb ?? 50) * 0.7 + 15)),
    reb: r.reb ?? 50, blk: r.blk ?? 50,
  }, { pos: (p as any).pos ?? 'F', heightIn: (p as any).hgt ?? 78, weightLbs: (p as any).weight ?? 220, age: (p as any).age ?? 26 });
  return Math.round(k2.OS.sub[2]);
};

export function useThreePointPicker() {
  const [view, setView] = useState<View>('LOADING');
  const [players, setPlayers] = useState<NBAPlayer[]>([]);
  const [teamAbbrevByTid, setTeamAbbrevByTid] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getRosterData(2025, 'Opening Week'),
      loadRatings(),
    ])
      .then(([{ players: roster, teams }]) => {
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
