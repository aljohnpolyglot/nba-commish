import React, { useMemo } from 'react';
import { NBAPlayer } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { useGame } from '../../store/GameContext';

const f1 = (v: number) => Number.isFinite(v) && v !== 0 ? v.toFixed(1) : '—';

export const PlayerHoverCardSimple: React.FC<{ player: NBAPlayer }> = ({ player }) => {
  const { state } = useGame();
  const season = state.leagueStats?.year ?? 2026;
  const team = state.teams.find(t => t.id === player.tid);

  const ratings = player.ratings?.find((r: any) => r.season === season) ?? player.ratings?.[player.ratings.length - 1];
  const k2Ovr = convertTo2KRating(player.overallRating ?? 60, ratings?.hgt ?? 50, ratings?.tp ?? 50);

  const stats = useMemo(() => {
    const all = ((player as any).stats ?? []) as any[];
    return all.filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).slice(-1)[0] ?? null;
  }, [player]);

  const gp = stats?.gp || 1;
  const trb = stats ? (stats.trb ?? ((stats.orb ?? 0) + (stats.drb ?? 0))) / gp : 0;

  return (
    <div className="w-44 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/70 p-2.5 text-[10px]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="font-black text-white text-xs truncate">{player.name}</div>
          <div className="text-slate-400">{player.pos} · {team?.abbrev ?? 'FA'}</div>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-[7px] text-slate-500 uppercase tracking-wide">OVR</div>
          <div className="font-black text-white text-sm leading-none">{k2Ovr}</div>
        </div>
      </div>
      {stats && (
        <div className="flex justify-between border-t border-slate-700/50 pt-1.5">
          {[
            { label: 'PTS', val: f1(stats.pts / gp) },
            { label: 'REB', val: f1(trb) },
            { label: 'AST', val: f1(stats.ast / gp) },
          ].map(({ label, val }) => (
            <div key={label} className="text-center flex-1">
              <div className="text-slate-500">{label}</div>
              <div className="text-slate-200 font-black tabular-nums">{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
