import React, { useMemo, useState } from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { buildFullDraftSlotMap, comparePicks, formatPickLabel } from '../../../../../services/draft/draftClassStrength';
import { isNoDraftLeague } from '../../../../../services/offseason/offseasonState';
import { resolveAnyTeam } from '../../../../../utils/teamLookup';
import { getUnconsumedDraftPicks } from '../../../../../services/draft/DraftPickGenerator';
import { forfeitTeamDraftPicks } from '../../../../../services/aspireSideDeals';
import type { DraftPick } from '../../../../../types';

interface DraftPicksProps {
  teamId: number;
}

export function DraftPicks({ teamId }: DraftPicksProps) {
  const { state, dispatchAction } = useGame();
  const [forfeitPick, setForfeitPick] = useState<DraftPick | null>(null);
  const [forfeitReason, setForfeitReason] = useState('League rules violation');
  const noDraft = isNoDraftLeague(state.leagueStats as any);
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const currentYear = state.leagueStats?.year || 2026;
  const lotterySlotByTid = useMemo(
    () => buildFullDraftSlotMap((state as any).draftLotteryResult, state.teams),
    [(state as any).draftLotteryResult, state.teams],
  );
  const availablePicks = getUnconsumedDraftPicks(state);
  const picks = availablePicks.filter(p => p.tid === teamId);

  if (noDraft) {
    return (
      <div className="text-slate-500 font-bold uppercase tracking-widest">
        Draft picks are disabled in no-draft leagues.
      </div>
    );
  }

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
  const tradedAway = availablePicks.filter(p => p.originalTid === teamId && p.tid !== teamId);

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
            const seasonPicks = picksBySeason[season].sort((a, b) => comparePicks(a, b, currentYear, lotterySlotByTid));
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
                    const origTeam = resolveAnyTeam(pick.originalTid, state.teams, state.nonNBATeams ?? []);

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
                            {formatPickLabel(pick, currentYear, lotterySlotByTid, false).toUpperCase()}
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
                        {state.gameMode !== 'gm' && (
                          <button onClick={() => setForfeitPick(pick)} className="rounded-lg bg-rose-600/15 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-rose-300 hover:bg-rose-600 hover:text-white">Forfeit</button>
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
                  const ownerTeam = resolveAnyTeam(pick.tid, state.teams, state.nonNBATeams ?? []);
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
                          {formatPickLabel(pick, currentYear, lotterySlotByTid, false).toUpperCase()}
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
      {forfeitPick && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4">
          <div role="dialog" aria-label="Forfeit draft pick" className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-black text-white">Forfeit this pick?</h2>
            <p className="mt-2 text-sm text-slate-400">{formatPickLabel(forfeitPick, currentYear, lotterySlotByTid, false)} will be permanently removed from the draft.</p>
            <label className="mt-5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Reason
              <input value={forfeitReason} onChange={event => setForfeitReason(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-rose-400" />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setForfeitPick(null)} className="rounded-xl border border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-300">Cancel</button>
              <button disabled={!forfeitReason.trim()} onClick={() => {
                const resolved = forfeitTeamDraftPicks(state, teamId, 1, forfeitReason.trim(), [forfeitPick.dpid]);
                if (resolved !== state) dispatchAction({ type: 'UPDATE_STATE', payload: { draftPicks: resolved.draftPicks, history: resolved.history } } as any);
                setForfeitPick(null);
              }} className="rounded-xl bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40">Confirm Forfeiture</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
