import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Loader, ExternalLink } from 'lucide-react';
import {
  fetchEuroleagueHistory,
  cleanChampionName,
  cleanPlayerName,
  EuroleagueSeason,
} from '../../data/euroleagueHistoryFetcher';

const STAR_AWARDS: Array<{ key: keyof EuroleagueSeason; label: string }> = [
  { key: 'Season_MVP',           label: 'Season MVP' },
  { key: 'Final_Four_MVP',       label: 'Final Four MVP' },
  { key: 'Finals_MVP',           label: 'Finals MVP' },
  { key: 'Playoffs_MVP',         label: 'Playoffs MVP' },
  { key: 'Playin_MVP',           label: 'Play-In MVP' },
  { key: 'Alphonso_Ford_Trophy', label: 'Top Scorer · Alphonso Ford' },
  { key: 'Best_Defender',        label: 'Best Defender' },
  { key: 'Rising_Star',          label: 'Rising Star' },
  { key: 'Coach_of_the_Year',    label: 'Coach of the Year' },
];

const STAT_LEADERS: Array<{ key: keyof EuroleagueSeason; label: string }> = [
  { key: 'Top_scorer',   label: 'Top Scorer' },
  { key: 'Points',       label: 'Points' },
  { key: 'Rebounds',     label: 'Rebounds' },
  { key: 'Assists',      label: 'Assists' },
  { key: 'Steals',       label: 'Steals' },
  { key: 'Blocks',       label: 'Blocks' },
  { key: 'Index_Rating', label: 'PIR Leader' },
];

export const EuroleagueHistoryView: React.FC = () => {
  const [seasons, setSeasons] = useState<EuroleagueSeason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EuroleagueSeason | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEuroleagueHistory()
      .then(data => { if (!cancelled) setSeasons(data); })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, []);

  // Most-titled clubs: count champion appearances across all seasons
  const titlesByClub = useMemo(() => {
    if (!seasons) return [];
    const m = new Map<string, number>();
    seasons.forEach(s => {
      const champ = cleanChampionName(s.Champions);
      if (champ) m.set(champ, (m.get(champ) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [seasons]);

  if (error) {
    return (
      <div className="p-8 text-rose-400 text-sm">
        Could not load Euroleague history: {error}
      </div>
    );
  }
  if (!seasons) {
    return (
      <div className="p-8 text-slate-500 text-sm flex items-center gap-2">
        <Loader className="w-4 h-4 animate-spin" /> Loading Euroleague history…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5"
        style={{ boxShadow: 'inset 0 1px 0 #fb923c55' }}>
        <div className="text-[10px] font-black uppercase tracking-[0.35em] text-orange-400">
          Turkish Airlines Euroleague
        </div>
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white mt-1">
          History · {seasons.length} Seasons
        </h1>
        <p className="text-slate-500 text-xs mt-2">
          From {seasons[seasons.length - 1].Season ?? '1995–96'} to {seasons[0].Season ?? '2024–25'}.
        </p>
      </div>

      {/* Most-titled clubs */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">
          Most-Titled Clubs
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800/40">
          {titlesByClub.map(([club, n]) => (
            <div key={club} className="bg-slate-950/80 p-4 flex items-baseline justify-between">
              <span className="text-sm text-slate-300 truncate">{club}</span>
              <span className="text-amber-300 font-black text-lg ml-3">{n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Champions table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">
          Champions by Season
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Season</th>
                <th className="text-left px-4 py-2">Champion</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Runner-up</th>
                <th className="text-left px-4 py-2 hidden lg:table-cell">Final Four MVP</th>
                <th className="text-left px-4 py-2 hidden lg:table-cell">Season MVP</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s, i) => {
                const champ = cleanChampionName(s.Champions);
                const isSelected = selected === s;
                return (
                  <tr
                    key={i}
                    onClick={() => setSelected(isSelected ? null : s)}
                    className={`border-t border-slate-900 cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-500/10 text-white' : 'text-slate-300 hover:bg-slate-900/60'
                    }`}
                  >
                    <td className="px-4 py-2 font-bold tabular-nums">{s.Season ?? '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-bold text-white">{champ || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell text-slate-400">{cleanChampionName(s.Runnersup) || '—'}</td>
                    <td className="px-4 py-2 hidden lg:table-cell text-slate-400">{cleanPlayerName(s.Final_Four_MVP) || '—'}</td>
                    <td className="px-4 py-2 hidden lg:table-cell text-slate-400">{cleanPlayerName(s.Season_MVP ?? s.Regular_Season_MVP) || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-[10px] uppercase tracking-widest text-slate-600">
                        {isSelected ? 'Hide' : 'Detail'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="rounded-2xl border border-amber-500/30 bg-slate-950/70 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                {selected.Season_Title ?? selected.League ?? 'Euroleague'}
              </div>
              <div className="text-base font-black text-white">{selected.Season ?? ''}</div>
            </div>
            {selected.Wikipedia_URL && (
              <a
                href={selected.Wikipedia_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300"
              >
                Wikipedia <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-800/40">
            <div className="bg-slate-950 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Awards</div>
              <div className="space-y-1.5 text-sm">
                {STAR_AWARDS.map(({ key, label }) => {
                  const val = cleanPlayerName(selected[key] as string | undefined);
                  if (!val) return null;
                  return (
                    <div key={key} className="flex justify-between gap-3">
                      <span className="text-slate-500 text-xs">{label}</span>
                      <span className="text-white font-bold text-right">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-slate-950 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Stat Leaders</div>
              <div className="space-y-1.5 text-sm">
                {STAT_LEADERS.map(({ key, label }) => {
                  const val = (selected[key] as string | undefined)?.trim();
                  if (!val) return null;
                  return (
                    <div key={key} className="flex justify-between gap-3">
                      <span className="text-slate-500 text-xs">{label}</span>
                      <span className="text-white font-bold text-right">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {(selected.Highest_scoring || selected.Biggest_home_win || selected.Biggest_away_win) && (
              <div className="bg-slate-950 p-4 md:col-span-2">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Notable Games</div>
                <div className="space-y-1 text-xs text-slate-300">
                  {selected.Highest_scoring && <div>🏀 Highest scoring: {selected.Highest_scoring}</div>}
                  {selected.Biggest_home_win && <div>🏠 Biggest home win: {selected.Biggest_home_win}</div>}
                  {selected.Biggest_away_win && <div>✈️ Biggest away win: {selected.Biggest_away_win}</div>}
                  {selected.Winning_streak && <div>🔥 Winning streak: {selected.Winning_streak}</div>}
                  {selected.Losing_streak && <div>💀 Losing streak: {selected.Losing_streak}</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
