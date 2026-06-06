import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getTeamFullName } from '../../utils/teamNames';
import type { NBATeam } from '../../types';

const fmtEUR = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);

const tierRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const teamId = (team: any): number => team.id ?? team.tid;
const teamLogo = (team: any): string | undefined => team.logoUrl ?? team.imgURL;

export const EuroBankruptcyModal: React.FC = () => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const pending = state.pendingEuroBankruptcy;
  const [selectedTid, setSelectedTid] = useState<number | null>(null);

  const allClubs = useMemo(() => [...(state.teams as any[]), ...((state as any).nonNBATeams ?? [])], [state.teams, (state as any).nonNBATeams]);
  const failedClub = useMemo(() => {
    if (!pending) return null;
    return allClubs.find(team => teamId(team) === pending.teamId) ?? null;
  }, [allClubs, pending]);
  const owner = failedClub?.ownerProfile;
  const injectionAmount = owner?.wealthTier === 'Billionaire' && !owner.cashInjectionUsedThisSeason
    ? 15_000_000
    : owner?.wealthTier === 'NationalMagnate' && (owner.seasonsSinceLastInjection ?? 0) >= 2
      ? 8_000_000
      : 0;

  const candidates = useMemo(() => {
    if (!pending) return [];
    return allClubs
      .filter(team => team.tycoon && teamId(team) !== pending.teamId)
      .sort((a, b) => {
        const tierDelta = (tierRank[a.tycoon?.tier ?? 'D'] ?? 9) - (tierRank[b.tycoon?.tier ?? 'D'] ?? 9);
        if (tierDelta !== 0) return tierDelta;
        return (b.tycoon?.cashOnHand ?? 0) - (a.tycoon?.cashOnHand ?? 0);
      }) as NBATeam[];
  }, [allClubs, pending]);

  if (!pending) return null;

  const selected = candidates.find(team => teamId(team) === selectedTid) ?? candidates[0];

  const confirm = () => {
    if (!selected) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        userTeamId: teamId(selected),
        pendingEuroBankruptcy: undefined,
      },
    } as any);
    setCurrentView('Front Office');
  };

  const acceptInjection = () => {
    if (!pending || !injectionAmount) return;
    const patchClub = (team: any) => {
      if (teamId(team) !== pending.teamId || !team.tycoon || !team.ownerProfile) return team;
      return {
        ...team,
        tycoon: {
          ...team.tycoon,
          cashOnHand: Math.round((team.tycoon.cashOnHand ?? 0) + injectionAmount),
        },
        ownerProfile: {
          ...team.ownerProfile,
          cashInjectionUsedThisSeason: true,
          seasonsSinceLastInjection: 0,
          consecutiveBadSeasons: 0,
        },
      };
    };
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        teams: state.teams.map(patchClub),
        nonNBATeams: ((state as any).nonNBATeams ?? []).map(patchClub),
        pendingEuroBankruptcy: undefined,
      },
    } as any);
    setCurrentView('Front Office');
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-rose-500/40 bg-slate-950 shadow-2xl shadow-rose-950/40">
        <div className="flex items-start gap-4 border-b border-slate-800 bg-rose-950/20 p-4 sm:p-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-200">
            <ShieldAlert size={26} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-rose-300">Game Over: Bankruptcy</div>
            <h2 className="text-2xl font-black text-white mt-1">{pending.teamName} is insolvent</h2>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl">
              The club closes the year with {fmtEUR(pending.cashOnHand)} cash. The league continues, but your current project ends here.
              Pick a new Euro club to continue your GM career.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-0">
          <div className="max-h-[62vh] overflow-y-auto p-4 sm:p-5">
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {candidates.map(team => {
                const active = (selected ? teamId(selected) : selectedTid) === teamId(team);
                const tycoon = team.tycoon!;
                return (
                  <button
                    key={teamId(team)}
                    onClick={() => setSelectedTid(teamId(team))}
                    className={`text-left rounded-2xl border p-4 transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-400/10'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {teamLogo(team) && <img src={teamLogo(team)} alt="" className="w-10 h-10 object-contain" />}
                      <div className="min-w-0">
                        <div className="font-black text-white truncate">{getTeamFullName(team)}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tier {tycoon.tier}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-950/70 p-2">
                        <div className="text-slate-500 font-bold uppercase text-[9px]">Cash</div>
                        <div className={tycoon.cashOnHand >= 0 ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'}>
                          {fmtEUR(tycoon.cashOnHand)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 p-2">
                        <div className="text-slate-500 font-bold uppercase text-[9px]">Prestige</div>
                        <div className="text-amber-200 font-black">{Math.round((tycoon.cityPrestige ?? 0.5) * 100)}%</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="border-t border-slate-800 bg-slate-900/50 p-4 sm:p-5 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
              <div className="flex items-center gap-2 text-amber-200 font-black uppercase tracking-widest text-xs">
                <AlertTriangle size={16} /> New Assignment
              </div>
              <p className="text-sm text-slate-200 mt-3">
                Your old club stays in the league under AI control. Sponsorships, roster state, and competition history are preserved.
              </p>
            </div>
            {selected && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">Selected</div>
                <div className="text-lg font-black text-white mt-1">{getTeamFullName(selected)}</div>
                <div className="text-sm text-slate-400 mt-2">Cash: {fmtEUR(selected.tycoon?.cashOnHand ?? 0)}</div>
              </div>
            )}
            {injectionAmount > 0 && (
              <button
                onClick={acceptInjection}
                className="mt-5 w-full h-12 rounded-xl bg-emerald-400 text-slate-950 font-black uppercase tracking-widest hover:bg-emerald-300"
              >
                Accept {fmtEUR(injectionAmount)} Owner Injection
              </button>
            )}
            <button
              onClick={confirm}
              disabled={!selected}
              className="mt-3 w-full h-12 rounded-xl bg-amber-400 text-slate-950 font-black uppercase tracking-widest hover:bg-amber-300 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              Take Over Club <ArrowRight size={18} />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
};
