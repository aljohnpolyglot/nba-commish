import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, FileImage, FileSignature, ScrollText, ShieldX, X } from 'lucide-react';
import type {
  CommissionerBoardPaper,
  GameState,
} from '../../types';
import {
  buildCommissionerBoardPaper,
  buildGovernorsBoardLogoChanges,
  buildGovernorsBoardVenueChanges,
} from '../../services/commissionerTasks/boardPaper';
import { loadArenas } from '../../utils/arenaData';
import { getTeamFullName } from '../../utils/teamNames';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';

interface Props {
  state: GameState;
  busy: boolean;
  onClose: () => void;
  onConfirm: (paper: CommissionerBoardPaper) => void;
}

const formatValue = (value: string | number | boolean | null) => {
  if (value == null) return 'Not set';
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';
  return String(value).replace(/_/g, ' ');
};

export function GovernorsBoardTaskPanel({
  state,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const initial = useMemo(() => buildCommissionerBoardPaper(state), [state]);
  const [paper, setPaper] = useState(initial);
  const [page, setPage] = useState<'rules' | 'franchises' | 'logos'>('rules');
  const [arenasReady, setArenasReady] = useState(false);
  const accepted = paper.proposals.filter(proposal => proposal.accepted).length;
  useEffect(() => {
    let active = true;
    loadArenas().finally(() => {
      if (active) setArenasReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const arenaChanges = useMemo(() => {
    if (!arenasReady) return [];
    return buildGovernorsBoardVenueChanges(state.teams, state.leagueStats.year).map(change => {
      const team = state.teams.find(candidate => candidate.id === change.teamId);
      const teamSnapshot = team
        ? getHistoricalTeamSnapshot(team, state.leagueStats.year)
        : undefined;
      return {
        ...change,
        teamName: teamSnapshot
          ? getTeamFullName(teamSnapshot)
          : 'Franchise',
        teamLogoUrl: teamSnapshot?.logoUrl,
        teamAbbrev: teamSnapshot?.abbrev,
      };
    });
  }, [arenasReady, state.leagueStats.year, state.teams]);
  const logoChanges = useMemo(
    () => paper.logoChanges ?? buildGovernorsBoardLogoChanges(state.teams, state.leagueStats.year),
    [paper.logoChanges, state.leagueStats.year, state.teams],
  );

  const toggle = (key: string) => setPaper(current => ({
    ...current,
    proposals: current.proposals.map(proposal =>
      proposal.key === key ? { ...proposal, accepted: !proposal.accepted } : proposal,
    ),
  }));

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/85 sm:items-center sm:p-4">
      <div className="max-h-[96vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-slate-700 bg-[#f4ecd9] text-slate-900 shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-400/40 px-5 py-5 sm:px-8">
          <div className="flex gap-3">
            <span className="rounded-xl border border-slate-800/20 bg-slate-900 p-3 text-amber-300"><ScrollText size={24} /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-600">Board of Governors · {paper.cycleYear}</p>
              <h2 className="mt-1 font-serif text-2xl font-black sm:text-3xl">
                Proposed League Resolutions
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {accepted} accepted · {paper.proposals.length - accepted} vetoed
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-600 hover:bg-black/10"><X size={20} /></button>
        </header>

        <div className="grid grid-cols-3 border-b border-slate-400/40 bg-black/[0.04] p-1 sm:mx-8 sm:mt-4 sm:rounded-xl sm:border">
          {([
            ['rules', 'League Rules', ScrollText],
            ['franchises', 'Franchises', Building2],
            ['logos', 'Logo Changes', FileImage],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-[9px] font-black uppercase tracking-wider sm:text-[10px] ${
                page === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-black/5'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-3 px-5 py-5 sm:px-8">
          {page === 'rules' && paper.proposals.length === 0 && (
              <div className="rounded-xl border border-slate-900/15 bg-white/50 p-6 text-center">
                <p className="font-serif text-lg font-black">No rule changes proposed</p>
                <p className="mt-1 text-sm text-slate-600">The governors submitted no league-rule changes for this season.</p>
              </div>
          )}
          {page === 'rules' && paper.proposals.map((proposal, index) => (
              <article key={proposal.key} className={`rounded-xl border p-4 ${proposal.accepted ? 'border-emerald-800/25 bg-white/55' : 'border-rose-900/25 bg-rose-100/65'}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-900/20 text-xs font-black">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-serif text-lg font-black">{proposal.label}</h3>
                      <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${proposal.accepted ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-white'}`}>
                        {proposal.accepted ? 'Accepted' : 'Vetoed'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm">
                      <span className="rounded-lg border border-slate-900/15 bg-white/50 px-2 py-2 font-bold">{formatValue(proposal.previous)}</span>
                      <span className="font-black text-slate-500">→</span>
                      <span className="rounded-lg border border-amber-900/20 bg-amber-100/70 px-2 py-2 font-black">{formatValue(proposal.next)}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => toggle(proposal.key)} className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border text-xs font-black uppercase tracking-wider ${proposal.accepted ? 'border-rose-800/30 text-rose-900 hover:bg-rose-100' : 'border-emerald-800/30 text-emerald-900 hover:bg-emerald-100'}`}>
                  {proposal.accepted ? <ShieldX size={15} /> : <Check size={15} />}
                  {proposal.accepted ? 'Veto resolution' : 'Restore resolution'}
                </button>
              </article>
          ))}
          {page !== 'rules' && !arenasReady && (
            <div className="rounded-xl border border-slate-900/15 bg-white/50 p-6 text-center text-sm font-bold text-slate-600">
              Loading venue records...
            </div>
          )}
          {page === 'franchises' && arenasReady && arenaChanges.length === 0 && (
            <div className="rounded-xl border border-slate-900/15 bg-white/50 p-6 text-center">
              <p className="font-serif text-lg font-black">No franchise changes</p>
              <p className="mt-1 text-sm text-slate-600">No changes are scheduled for the {state.leagueStats.year} season.</p>
            </div>
          )}
          {page === 'franchises' && arenaChanges.map(change => (
            <article key={`${change.teamId}-${change.kind}`} className="rounded-xl border border-slate-900/15 bg-white/55 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-900/15 bg-white/65 p-1.5">
                  {change.teamLogoUrl
                    ? <img src={change.teamLogoUrl} alt="" className="max-h-full max-w-full object-contain" />
                    : <span className="text-[10px] font-black text-slate-500">{change.teamAbbrev ?? '?'}</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{change.teamName}</p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-amber-800">
                    {change.kind === 'naming' ? 'Naming Rights' : 'Arena Change'}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm">
                <span className="rounded-lg border border-slate-900/15 bg-white/50 px-2 py-2 font-bold">{change.previous.name}</span>
                <span className="font-black text-slate-500">→</span>
                <span className="rounded-lg border border-amber-900/20 bg-amber-100/70 px-2 py-2 font-black">{change.next.name}</span>
              </div>
              {change.kind === 'stadium' && (
                <p className="mt-3 text-xs font-semibold text-slate-600">
                  {change.next.location}{change.next.capacity ? ` · ${change.next.capacity.toLocaleString()} seats` : ''}
                </p>
              )}
            </article>
          ))}
          {page === 'logos' && logoChanges.length === 0 && (
            <div className="rounded-xl border border-slate-900/15 bg-white/50 p-6 text-center">
              <p className="font-serif text-lg font-black">No logo changes</p>
              <p className="mt-1 text-sm text-slate-600">No franchise is changing its primary mark for the {state.leagueStats.year} season.</p>
            </div>
          )}
          {page === 'logos' && logoChanges.map(change => (
            <article key={`${change.teamId}-logo`} className="rounded-xl border border-slate-900/15 bg-white/55 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{change.teamName}</p>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex h-24 items-center justify-center rounded-xl border border-slate-900/15 bg-white/60 p-3">
                  <img src={change.previousLogoUrl} alt={`${change.teamName} previous logo`} className="max-h-full max-w-full object-contain" />
                </div>
                <span className="font-black text-slate-500">→</span>
                <div className="flex h-24 items-center justify-center rounded-xl border border-amber-900/20 bg-amber-100/70 p-3">
                  <img src={change.nextLogoUrl} alt={`${change.teamName} new logo`} className="max-h-full max-w-full object-contain" />
                </div>
              </div>
            </article>
          ))}
        </div>

        <footer className="flex justify-end border-t border-slate-400/40 bg-black/[0.04] p-5 sm:px-8">
          <button
              disabled={busy || !arenasReady}
            onClick={() => onConfirm({
              ...paper,
              venueChanges: arenaChanges.map(change => ({
                teamId: change.teamId,
                kind: change.kind,
                previous: change.previous,
                next: change.next,
              })),
              logoChanges,
            })}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-40 sm:w-auto"
          >
            <FileSignature size={16} />
            Sign Proposal
          </button>
        </footer>
      </div>
    </div>
  );
}
