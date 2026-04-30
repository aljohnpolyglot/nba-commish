import React from 'react';
import { PlayerTournamentStats } from '../types/throne';

interface StatsTableProps {
  stats: Record<string, PlayerTournamentStats>;
}

export const StatsTable: React.FC<StatsTableProps> = ({ stats }) => {
  const sortedStats = Object.values(stats).sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return b.pd - a.pd;
  });

  return (
    <div className="bg-zinc-950 border border-zinc-800 overflow-hidden rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800">
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Player</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">W</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">L</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-yellow-500 text-center">Pts</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">PD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {sortedStats.map((stat, i) => (
              <tr key={stat.id} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 flex items-center gap-3">
                  <span className="font-mono text-[10px] text-zinc-700 w-4">{i + 1}</span>
                  <img src={stat.imgURL} className="w-8 h-8 rounded bg-zinc-800 object-cover" alt="" />
                  <span className="font-black uppercase italic text-xs">{stat.lastName}</span>
                </td>
                <td className="px-4 py-3 text-center font-mono text-xs text-green-500 font-bold">{stat.wins}</td>
                <td className="px-4 py-3 text-center font-mono text-xs text-red-500 font-bold">{stat.losses}</td>
                <td className="px-4 py-3 text-center font-mono text-xs font-black text-yellow-500 tabular-nums">
                  {stat.pts || 0}
                </td>
                <td className="px-4 py-3 text-center font-mono text-xs font-bold text-yellow-500 tabular-nums">
                  {stat.pd > 0 ? `+${stat.pd}` : stat.pd}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
