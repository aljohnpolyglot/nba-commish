import React from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface DraftPicksProps {
  teamId: number;
}

export function DraftPicks({ teamId }: DraftPicksProps) {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const picks = (state.draftPicks || []).filter(p => p.tid === teamId);
  const currentYear = state.leagueStats?.year || 2026;

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  // Group picks by season
  const picksBySeason = picks.reduce<Record<number, typeof picks>>((acc, pick) => {
    if (!acc[pick.season]) acc[pick.season] = [];
    acc[pick.season].push(pick);
    return acc;
  }, {});

  const seasons = Object.keys(picksBySeason).map(Number).sort();

  // Traded-away picks (owned by other teams but originally from this team)
  const tradedAway = (state.draftPicks || []).filter(p => p.originalTid === teamId && p.tid !== teamId);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-end border-b border-slate-700/50 pb-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-white">Draft Pick Inventory</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">{picks.length} pick{picks.length !== 1 ? 's' : ''} owned</p>
        </div>
      </div>

      {seasons.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4 opacity-30">📭</div>
          <p className="text-slate-500 font-bold uppercase tracking-widest">No draft picks available</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {seasons.map(season => {
            const seasonPicks = picksBySeason[season].sort((a, b) => a.round - b.round);
            const yearsFromNow = Math.max(0, season - currentYear);
            const isNextYear = yearsFromNow <= 1;
            const isStale = yearsFromNow >= 3;

            return (
              <div key={season}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className={cn(
                    "text-[11px] font-black uppercase tracking-widest",
                    season === currentYear ? "text-indigo-400" : "text-slate-500"
                  )}>
                    {season} Draft {season === currentYear && '(Current)'}
                  </h2>
                  {season !== currentYear && (
                    <div className={cn(
                      "flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg",
                      isNextYear ? 'bg-indigo-900/50 text-indigo-300' :
                      isStale   ? 'bg-slate-800 text-slate-500' :
                                  'bg-slate-800/80 text-slate-400'
                    )}>
                      {isNextYear ? <TrendingUp size={10} /> : isStale ? null : <TrendingDown size={10} />}
                      {isNextYear ? 'Next' : `+${yearsFromNow}yr`}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {seasonPicks.map(pick => {
                    const isOwnPick = pick.originalTid === teamId;
                    const origTeam = state.teams.find(t => t.id === pick.originalTid);

                    return (
                      <div
                        key={pick.dpid}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-xl border-2 transition-all",
                          isOwnPick
                            ? "bg-slate-900/50 border-slate-800"
                            : "bg-blue-600/10 border-blue-500/50"
                        )}
                      >
                        {/* Original team logo */}
                        <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
                          {origTeam?.logoUrl ? (
                            <img src={origTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-[9px] font-black text-slate-400">{origTeam?.abbrev ?? '?'}</span>
                          )}
                        </div>

                        {/* Pick info */}
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-black text-white uppercase tracking-tight">
                            {pick.season} {pick.round === 1 ? '1ST' : '2ND'} ROUND
                          </div>
                          {!isOwnPick && (
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              Via {origTeam?.region} {origTeam?.name}
                            </div>
                          )}
                        </div>

                        {/* Round badge */}
                        <div className={cn(
                          "text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0",
                          pick.round === 1 ? "bg-indigo-900/50 text-indigo-300" : "bg-slate-800 text-slate-500"
                        )}>
                          {pick.round === 1 ? '1st' : '2nd'}
                        </div>

                        {/* Acquired badge */}
                        {!isOwnPick && (
                          <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Traded Away Section */}
          {tradedAway.length > 0 && (
            <div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-rose-400/70 mb-3 pt-4 border-t border-slate-700/50">
                Traded Away ({tradedAway.length})
              </h2>
              <div className="space-y-2 opacity-50">
                {[...tradedAway].sort((a, b) => a.season - b.season || a.round - b.round).map(pick => {
                  const ownerTeam = state.teams.find(t => t.id === pick.tid);
                  return (
                    <div
                      key={pick.dpid}
                      className="flex items-center gap-4 p-3 rounded-xl border-2 bg-slate-900/30 border-slate-800/50"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
                        {ownerTeam?.logoUrl ? (
                          <img src={ownerTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-[9px] font-black text-slate-400">{ownerTeam?.abbrev ?? '?'}</span>
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-black text-white/50 uppercase tracking-tight line-through">
                          {pick.season} {pick.round === 1 ? '1ST' : '2ND'} ROUND
                        </div>
                        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                          Traded to {ownerTeam?.region} {ownerTeam?.name}
                        </div>
                      </div>
                      <div className="text-[9px] font-black text-rose-400/60 uppercase tracking-wider px-2 py-1 rounded-lg bg-rose-900/20 flex-shrink-0">
                        Traded
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
