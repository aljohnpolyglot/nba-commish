import React, { useMemo, useState } from 'react';
import { ArrowUpDown, BriefcaseBusiness, Check, Handshake, Search, X } from 'lucide-react';
import type { LoanCandidate, LoanLength } from '../../services/transfer/loanMarket';
import { getLoanCandidates, getLoanOfferInterestPercent, LOAN_LENGTH_LABELS, loanEndDate } from '../../services/transfer/loanMarket';
import { toISO } from '../../services/transfer/transferMarket';
import type { NBAPlayer } from '../../types';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { useGame } from '../../store/GameContext';
import { CountryFlag } from '../shared/CountryFlag';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { fmtEUR, OvrPotPair } from './EuroTransferMarketShared';
import { isInLoanWindow } from '../../utils/transferWindow';

const OfferModal: React.FC<{
  candidate: LoanCandidate;
  onClose: () => void;
  currentDate: string;
  windowOpen: boolean;
  onSubmit: (feeEUR: number, wageSharePercent: number, length: LoanLength) => Promise<void>;
}> = ({ candidate, currentDate, windowOpen, onClose, onSubmit }) => {
  const { state } = useGame();
  const [feeEUR, setFeeEUR] = useState(candidate.suggestedFeeEUR);
  const [wageSharePercent, setWageSharePercent] = useState(candidate.recommendedReason === 'salary-relief' ? 100 : 50);
  const [length, setLength] = useState<LoanLength>(candidate.suggestedLength);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const player = candidate.player;
  const parent = resolveAnyTeam(candidate.parentTid, state.teams, state.nonNBATeams ?? []);
  const parentLogo = parent ? getResolvedTeamLogoUrl(parent, state.leagueStats?.year) : undefined;
  const interest = getLoanOfferInterestPercent(state, {
    playerId: player.internalId,
    parentTid: candidate.parentTid,
    borrowerTid: Number(state.userTeamId ?? -1),
    feeEUR,
    wageSharePercent,
    reason: candidate.recommendedReason,
    duration: length,
    endDate: loanEndDate(currentDate, length),
  });
  const interestLabel = interest >= 80 ? 'Very Interested' : interest >= 66 ? 'Interested' : interest >= 50 ? 'Considering' : 'Unlikely';
  const submit = async () => {
    if (submitting || !windowOpen) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(feeEUR, wageSharePercent, length);
    } catch {
      setSubmitError('The loan offer could not be submitted. Please try again.');
      setSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 shadow-2xl sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={52} />
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Loan Offer</div>
              <div className="truncate text-xl font-black text-white">{player.name}</div>
              <div className="text-xs text-slate-400">{player.pos} · loan through {loanEndDate(currentDate, length)}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-5 p-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950/70 p-2 ring-1 ring-white/10">
                {parentLogo ? <img src={parentLogo} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" /> : <span className="text-[9px] font-black text-slate-500">CLUB</span>}
              </div>
              <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Parent Club</div><div className="truncate text-sm font-black text-white">{parent ? getTeamFullName(parent as any) : 'Parent club'}</div></div>
            </div>
            <div className="w-full sm:w-52">
              <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider"><span className="text-slate-500">Club Interest</span><span className={interest >= 66 ? 'text-emerald-300' : interest >= 50 ? 'text-amber-300' : 'text-rose-300'}>{interestLabel}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full transition-all ${interest >= 66 ? 'bg-emerald-400' : interest >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${interest}%` }} /></div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loan Fee</div>
                <div className="mt-1 text-2xl font-black text-emerald-300">{fmtEUR(feeEUR)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setFeeEUR(value => Math.max(0, value - 25_000))} className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-950 text-lg font-black text-white hover:border-cyan-400">−</button>
                <button type="button" onClick={() => setFeeEUR(value => value + 25_000)} className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-950 text-lg font-black text-white hover:border-cyan-400">+</button>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">Club suggestion: {fmtEUR(candidate.suggestedFeeEUR)}. You control the offer; the parent club controls the answer.</div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Loan Length</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(LOAN_LENGTH_LABELS) as LoanLength[]).map(value => (
                <button key={value} type="button" onClick={() => setLength(value)} className={`rounded-xl border px-3 py-3 text-xs font-black ${length === value ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'}`}>
                  <span className="inline-flex items-center gap-1">{LOAN_LENGTH_LABELS[value]}{length === value && <Check size={13} />}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Wage Share Paid by Your Club</div>
            <div className="grid grid-cols-3 gap-2">
              {[0, 50, 100].map(value => (
                <button key={value} type="button" onClick={() => setWageSharePercent(value)} className={`rounded-xl border px-3 py-2 text-xs font-black ${wageSharePercent === value ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'}`}>{value}%</button>
              ))}
            </div>
          </div>
        </div>
        {submitError && <div className="mx-4 mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs font-bold text-rose-200">{submitError}</div>}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 p-4 sm:flex-row sm:justify-end">
          <button type="button" disabled={submitting} onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-300 disabled:opacity-40">Cancel</button>
          <button type="button" disabled={!windowOpen || submitting} onClick={() => void submit()} className="rounded-xl bg-cyan-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? 'Submitting…' : 'Submit Loan Offer'}</button>
        </div>
      </div>
    </div>
  );
};

export const EuroLoanFinderTab: React.FC<{ onOpenPlayer: (player: NBAPlayer) => void }> = ({ onOpenPlayer }) => {
  const { state, dispatchAction } = useGame();
  const userTid = Number(state.userTeamId ?? -1);
  const year = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const currentDate = toISO(state.date ?? `${year}-07-01`);
  const loanWindow = isInLoanWindow(state.date, state.leagueStats);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'potential' | 'overall' | 'age' | 'fee'>('potential');
  const [selected, setSelected] = useState<LoanCandidate | null>(null);
  const candidates = useMemo(() => getLoanCandidates(state, userTid), [state, userTid]);
  const visible = useMemo(() => candidates
    .filter(candidate => candidate.player.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice()
    .sort((left, right) => {
      if (sort === 'overall') return getDisplayOverall(right.player) - getDisplayOverall(left.player);
      if (sort === 'age') return (left.player.born?.year ?? 0) - (right.player.born?.year ?? 0);
      if (sort === 'fee') return left.suggestedFeeEUR - right.suggestedFeeEUR;
      return getDisplayPotential(right.player, year) - getDisplayPotential(left.player, year);
    }), [candidates, query, sort, year]);
  const activeLoans = (state.loanAgreements ?? []).filter(agreement => agreement.status === 'active' && agreement.borrowerTid === userTid);
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-4"><div className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Available</div><div className="mt-1 text-2xl font-black text-white">{visible.length}</div><div className="text-[10px] text-slate-500">Loan candidates</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">On Loan</div><div className="mt-1 text-2xl font-black text-white">{activeLoans.length}</div><div className="text-[10px] text-slate-500">Currently with your squad</div></div>
      </div>
      {!loanWindow.open && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-4 py-3 text-xs text-cyan-200">
          The loan window is closed. You can review candidates and active loans, but new offers reopen during the next window.
        </div>
      )}
      {activeLoans.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white"><BriefcaseBusiness size={15} className="text-cyan-300" /> Active Loans</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {activeLoans.map(agreement => {
              const player = state.players.find(item => item.internalId === agreement.playerId);
              return <div key={agreement.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2"><span className="text-xs font-bold text-white">{player?.name ?? 'Player'}</span><span className="text-right text-[10px] text-slate-500"><span className="block font-bold text-cyan-300">Duration: {LOAN_LENGTH_LABELS[agreement.duration ?? 'season']}</span>Returns {agreement.endDate}</span></div>;
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2"><Search size={15} className="text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search loan candidates..." className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400"><ArrowUpDown size={14} /><select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="bg-transparent text-white outline-none"><option value="potential">Potential</option><option value="overall">Overall</option><option value="age">Age</option><option value="fee">Suggested Fee</option></select></label>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">No credible loan candidates match this search.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map(candidate => {
            const player = candidate.player;
            const parent = resolveAnyTeam(candidate.parentTid, state.teams, state.nonNBATeams ?? []);
            const age = player.born?.year ? year - player.born.year : Number(player.age ?? 25);
            return (
              <div key={player.internalId} className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 text-left transition-colors hover:border-cyan-400/45 hover:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => onOpenPlayer(player)} className="flex min-w-0 items-center gap-3 text-left hover:opacity-90"><PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={44} /><div className="min-w-0"><div className="truncate text-sm font-black text-white">{player.name}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500"><CountryFlag country={player.born?.loc} className="h-3 w-4 rounded-[2px]" />{player.pos} · {age}y</div></div></button>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <OvrPotPair ovr={getDisplayOverall(player)} pot={getDisplayPotential(player, year)} small />
                    <button type="button" disabled={!loanWindow.open} onClick={() => setSelected(candidate)} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40">View Loan Offer <Handshake size={12} /></button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] sm:grid-cols-3"><div className="col-span-2 sm:col-span-1"><div className="uppercase tracking-wider text-slate-600">Parent Club</div><div className="mt-1 flex min-w-0 items-center gap-2">{parent && <img src={getResolvedTeamLogoUrl(parent, state.leagueStats?.year)} alt="" className="h-6 w-6 shrink-0 object-contain" referrerPolicy="no-referrer" />}<span className="truncate font-bold text-slate-300">{parent ? getTeamFullName(parent as any) : 'Club'}</span></div></div><div><div className="uppercase tracking-wider text-slate-600">Suggested Fee</div><div className="mt-1 font-black text-emerald-300">{fmtEUR(candidate.suggestedFeeEUR)}</div></div><div><div className="uppercase tracking-wider text-slate-600">Duration</div><div className="mt-1 font-black text-cyan-300">{LOAN_LENGTH_LABELS[candidate.suggestedLength]}</div></div></div>
              </div>
            );
          })}
        </div>
      )}
      {selected && <OfferModal candidate={selected} currentDate={currentDate} windowOpen={loanWindow.open} onClose={() => setSelected(null)} onSubmit={async (feeEUR, wageSharePercent, length) => {
        await dispatchAction({ type: 'SUBMIT_LOAN_OFFER', payload: { playerId: selected.player.internalId, parentTid: selected.parentTid, borrowerTid: userTid, feeEUR, wageSharePercent, reason: selected.recommendedReason, duration: length, endDate: loanEndDate(currentDate, length) } } as any);
        setSelected(null);
      }} />}
    </div>
  );
};
