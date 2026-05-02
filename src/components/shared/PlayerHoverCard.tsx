import React, { useMemo } from 'react';
import { NBAPlayer } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { getDisplayPotential } from '../../utils/playerRatings';
import { useGame } from '../../store/GameContext';

const ratingColor = (v: number) =>
  v >= 70 ? 'text-green-400' :
  v >= 55 ? 'text-amber-400' :
  v >= 40 ? 'text-orange-500' :
  'text-red-400';

const f1 = (v: number) => Number.isFinite(v) && v !== 0 ? v.toFixed(1) : '—';
const fpct = (n: number, d: number) => d > 0 ? `.${Math.round(n / d * 1000).toString().padStart(3, '0')}` : '—';

const StatRow: React.FC<{ label: string; val: string }> = ({ label, val }) => (
  <div className="flex items-center justify-between gap-1">
    <span className="text-slate-500">{label}:</span>
    <span className="text-slate-200 font-bold tabular-nums">{val}</span>
  </div>
);

export const PlayerHoverCard: React.FC<{ player: NBAPlayer }> = ({ player }) => {
  const { state } = useGame();
  const season = state.leagueStats?.year ?? 2026;
  const team = state.teams.find(t => t.id === player.tid);
  const age = (player as any).born?.year ? season - (player as any).born.year : (player.age ?? 0);

  const ratings = useMemo(() => {
    const r = (player.ratings?.find((r: any) => r.season === season) ?? player.ratings?.[player.ratings.length - 1] ?? {}) as Record<string, number>;
    return { hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50, ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50, oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50, ...r };
  }, [player, season]);

  const k2Ovr = convertTo2KRating(player.overallRating ?? 60, ratings.hgt, ratings.tp);
  const pot = getDisplayPotential(player, season);

  const stats = useMemo(() => {
    const all = ((player as any).stats ?? []) as any[];
    return all.filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).slice(-1)[0] ?? null;
  }, [player]);

  const ATTRS: { label: string; key: keyof typeof ratings }[] = [
    { label: 'Hgt', key: 'hgt' }, { label: 'Ins', key: 'ins' },
    { label: 'Str', key: 'stre' }, { label: 'Dnk', key: 'dnk' },
    { label: 'Spd', key: 'spd' }, { label: 'Ft', key: 'ft' },
    { label: 'Jmp', key: 'jmp' }, { label: '2Pt', key: 'fg' },
    { label: 'End', key: 'endu' }, { label: '3Pt', key: 'tp' },
    { label: 'oIQ', key: 'oiq' }, { label: 'dIQ', key: 'diq' },
    { label: 'Drb', key: 'drb' }, { label: 'Reb', key: 'reb' },
    { label: 'Pss', key: 'pss' },
  ];

  const gp = stats?.gp || 1;
  const trb = stats ? ((stats.trb ?? ((stats.orb ?? 0) + (stats.drb ?? 0)))) / gp : 0;

  return (
    <div className="w-52 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/70 p-2.5 text-[10px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-700/50">
        <div className="min-w-0 flex-1">
          <div className="font-black text-white text-xs truncate">{player.name}</div>
          <div className="text-slate-400">{player.pos} {team?.abbrev ?? 'FA'} {age} yo</div>
        </div>
        <div className="flex gap-2.5 ml-2 shrink-0 text-center">
          <div>
            <div className="text-[7px] text-slate-500 uppercase tracking-wide">Ovr</div>
            <div className="font-black text-white text-sm leading-none">{k2Ovr}</div>
          </div>
          <div>
            <div className="text-[7px] text-slate-500 uppercase tracking-wide">Pot</div>
            <div className="font-black text-sky-400 text-sm leading-none">{pot}</div>
          </div>
        </div>
      </div>

      {/* Ratings */}
      <div className="text-[8px] text-slate-500 font-bold mb-1">{season} Ratings</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mb-2">
        {ATTRS.map(({ label, key }) => {
          const v = Math.round(ratings[key] ?? 50);
          return (
            <div key={label} className="flex items-center justify-between">
              <span className="text-slate-400">{label}:</span>
              <span className={`font-black ${ratingColor(v)}`}>{v}</span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      {stats && (
        <>
          <div className="text-[8px] text-slate-500 font-bold mb-1 pt-1.5 border-t border-slate-700/50">{stats.season ?? season} Stats</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <StatRow label="PTS" val={f1(stats.pts / gp)} />
            <StatRow label="MP" val={f1(stats.min / gp)} />
            <StatRow label="TRB" val={f1(trb)} />
            <StatRow label="PER" val={f1(stats.per ?? 0)} />
            <StatRow label="AST" val={f1(stats.ast / gp)} />
            <StatRow label="EWA" val={f1(stats.ewa ?? 0)} />
            <StatRow label="FG%" val={fpct(stats.fg, stats.fga)} />
            <StatRow label="FT%" val={fpct(stats.ft, stats.fta)} />
            <StatRow label="TS%" val={stats.tsPct ? `${(stats.tsPct).toFixed(1)}%` : '—'} />
            <StatRow label="3PAr" val={fpct(stats.tpa, stats.fga)} />
            <StatRow label="3P%" val={fpct(stats.tp, stats.tpa)} />
            <StatRow label="FTr" val={fpct(stats.fta, stats.fga)} />
            <StatRow label="BLK" val={f1(stats.blk / gp)} />
            <StatRow label="STL" val={f1(stats.stl / gp)} />
            <StatRow label="TO" val={f1(stats.tov / gp)} />
          </div>
        </>
      )}
    </div>
  );
};
