import React from 'react';
import { Trophy } from 'lucide-react';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';

export interface EuroCompetitionChampionCard {
  competitionId: string;
  label: string;
  accentColor: string;
  season: number;
  champion: any | null;
  runnerUp: any | null;
  record?: { wins?: number; losses?: number; won?: number; lost?: number } | null;
  count: number;
}

export const EuroCompetitionChampionsSection: React.FC<{
  champions: EuroCompetitionChampionCard[];
}> = ({ champions }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5">
    <div className="mb-4 flex items-center gap-2">
      <Trophy size={13} className="text-amber-400" />
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Competition Champions</span>
      <span className="ml-auto text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
        {champions.length} {champions.length === 1 ? 'Competition' : 'Competitions'}
      </span>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {champions.map(card => {
        const championSnapshot = card.champion ? getHistoricalTeamSnapshot(card.champion, card.season) : null;
        const runnerUpSnapshot = card.runnerUp ? getHistoricalTeamSnapshot(card.runnerUp, card.season) : null;
        const wins = card.record?.won ?? card.record?.wins;
        const losses = card.record?.lost ?? card.record?.losses;
        return (
          <div
            key={card.competitionId}
            className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-4"
            style={{ borderColor: `${card.accentColor}55`, boxShadow: `inset 0 1px 0 ${card.accentColor}33` }}
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl"
              style={{ backgroundColor: `${card.accentColor}22` }}
            />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: card.accentColor }}>
                  {card.label}
                </div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Champion
                </div>
              </div>
              <span
                className="shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em]"
                style={{ borderColor: `${card.accentColor}55`, color: card.accentColor, backgroundColor: `${card.accentColor}16` }}
              >
                {card.count}×
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
                {championSnapshot?.logoUrl
                  ? <img src={championSnapshot.logoUrl} alt="" className="h-11 w-11 object-contain" referrerPolicy="no-referrer" />
                  : <span className="text-sm font-black text-slate-500">{championSnapshot?.abbrev ?? card.champion.abbrev ?? '—'}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-black text-white">{getTeamFullName(card.champion)}</div>
                {wins != null && losses != null && <div className="text-sm font-semibold text-slate-400">{wins}-{losses}</div>}
              </div>
            </div>
            {card.runnerUp && (
              <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3 text-xs text-slate-500">
                {runnerUpSnapshot?.logoUrl && <img src={runnerUpSnapshot.logoUrl} alt="" className="h-5 w-5 object-contain" referrerPolicy="no-referrer" />}
                <span className="shrink-0 font-bold uppercase tracking-wider">Runner-up</span>
                <span className="truncate font-semibold text-slate-300">{getTeamFullName(card.runnerUp)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
