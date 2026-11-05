import React, { useMemo, useState } from 'react';
import { ArrowDownUp, ArrowRightLeft, ArrowUp, ArrowDown, CalendarDays, CheckCircle2, RotateCcw, ShieldAlert, Star, X } from 'lucide-react';
import type { FreeAgencyDailyDecision, FreeAgencyDecisionStatus } from '../../types';
import { useGame } from '../../store/GameContext';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { formatExternalSalary } from '../../constants';
import { isRealFaceConfig, MyFace } from '../shared/MyFace';
import { resolveCommissionerTask } from '../../services/commissionerTasks/taskResolution';

function statusPresentation(status: FreeAgencyDecisionStatus, commissionerReview = false) {
  if (status === 'signed-with-you') {
    return { label: 'Signed', className: 'text-emerald-400', icon: <CheckCircle2 size={17} /> };
  }
  if (status === 're-signed') {
    return { label: 'Re-signed', className: 'text-violet-400', icon: <RotateCcw size={17} /> };
  }
  return { label: commissionerReview ? 'Signed' : 'Signed Elsewhere', className: 'text-amber-400', icon: <ArrowRightLeft size={17} /> };
}

function TeamLabel({ name, logo }: { name: string; logo?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {logo && <img src={logo} alt="" className="h-7 w-7 shrink-0 object-contain" />}
      <span className="truncate">{name}</span>
    </span>
  );
}

function PlayerPortrait({ decision, className }: { decision: FreeAgencyDailyDecision; className: string }) {
  return (
    <div className={`${className} relative shrink-0 overflow-hidden rounded-full bg-slate-800`}>
      {decision.playerImage ? (
        <img src={decision.playerImage} alt="" className="h-full w-full object-cover object-top" />
      ) : isRealFaceConfig(decision.playerFace) ? (
        <div className="absolute left-1/2 top-1/2 h-[136%] w-[136%] -translate-x-1/2 -translate-y-1/2">
          <MyFace face={decision.playerFace} style={{ width: '100%', height: '100%' }} />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center font-black text-slate-500">
          {decision.playerName.charAt(0)}
        </div>
      )}
    </div>
  );
}

function ContractLabel({ decision }: { decision: FreeAgencyDailyDecision }) {
  const total = decision.currency === 'PHP'
    ? formatExternalSalary(decision.contractTotalUSD, 'PBA')
    : formatCurrencyWithCode(decision.contractTotalUSD, decision.currency, false);
  return (
    <span className="font-black tabular-nums text-slate-100">
      {decision.contractYears} {decision.contractYears === 1 ? 'Year' : 'Years'} · {total}
    </span>
  );
}

function contractTypeLabel(decision: FreeAgencyDailyDecision) {
  if (decision.contractType === 'non-guaranteed') return 'Non-guaranteed';
  if (decision.contractType === 'two-way') return 'Two-way';
  if (decision.contractType === 'developmental') return 'Developmental';
  return 'Guaranteed';
}

function optionLabel(decision: FreeAgencyDailyDecision) {
  return decision.option === 'PLAYER' ? 'Player' : decision.option === 'TEAM' ? 'Team' : '—';
}

function DecisionTable({
  title,
  subtitle,
  decisions,
  commissionerReview = false,
}: {
  title: string;
  subtitle: string;
  decisions: FreeAgencyDailyDecision[];
  commissionerReview?: boolean;
}) {
  type SortKey = 'overall' | 'potential' | 'contract';
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  const sortedDecisions = useMemo(() => {
    if (!sort) return decisions;
    return decisions
      .map((decision, index) => ({ decision, index }))
      .sort((a, b) => {
        const aValue = sort.key === 'contract' ? a.decision.contractTotalUSD : sort.key === 'overall' ? a.decision.overall : a.decision.potential;
        const bValue = sort.key === 'contract' ? b.decision.contractTotalUSD : sort.key === 'overall' ? b.decision.overall : b.decision.potential;
        const difference = (Number(aValue) || 0) - (Number(bValue) || 0);
        return difference === 0
          ? a.index - b.index
          : sort.direction === 'asc' ? difference : -difference;
      })
      .map(({ decision }) => decision);
  }, [decisions, sort]);

  const toggleSort = (key: SortKey) => {
    setSort(current => current?.key === key
      ? current.direction === 'asc' ? { key, direction: 'desc' } : null
      : { key, direction: 'desc' });
  };

  const SortHeader = ({ label, sortKey, className = '' }: { label: string; sortKey: SortKey; className?: string }) => {
    const active = sort?.key === sortKey;
    return (
      <th className={className}>
        <button type="button" onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1.5 text-left hover:text-white" aria-label={`Sort by ${label}`}>
          {label}
          {active ? (sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowDownUp size={12} />}
        </button>
      </th>
    );
  };
  if (decisions.length === 0) return null;
  return (
    <section className="mb-5">
      <div className="mb-2 flex flex-wrap items-end gap-x-4 gap-y-1 px-1">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-700/70 md:block">
        <table className="w-full table-fixed text-left">
          <thead className="bg-slate-950/90 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="w-[19%] px-4 py-3">Player</th>
              <th className="w-[4%] px-2 py-3">Pos</th>
              <SortHeader label="OVR" sortKey="overall" className="w-[4%] px-2 py-3" />
              <SortHeader label="Pot" sortKey="potential" className="w-[4%] px-2 py-3" />
              <th className="w-[13%] px-2 py-3">Previous Team</th>
              <th className="w-[13%] px-2 py-3">New Team</th>
              <th className="w-[11%] px-2 py-3">Status</th>
              <th className="w-[10%] px-2 py-3">Type</th>
              <th className="w-[8%] px-2 py-3">Option</th>
              <SortHeader label="Contract" sortKey="contract" className="w-[14%] px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {sortedDecisions.map(decision => {
              const presentation = statusPresentation(decision.status, commissionerReview);
              return (
                <tr key={decision.playerId} className={`border-t border-slate-800 ${decision.isUserTarget ? 'bg-blue-500/10' : 'bg-slate-900/55'}`}>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {decision.isUserTarget && <Star size={16} className="shrink-0 fill-emerald-400 text-emerald-400" />}
                      <PlayerPortrait decision={decision} className="h-10 w-10" />
                      <div className="min-w-0">
                        <div className="truncate font-bold text-white">{decision.playerName}</div>
                        {decision.isUserTarget && <div className="text-[10px] font-black uppercase tracking-widest text-blue-400">My Target</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-sm text-slate-300">{decision.position}</td>
                  <td className="px-2 py-3 font-black text-white">{decision.overall}</td>
                  <td className="px-2 py-3 font-black text-emerald-400">{decision.potential}</td>
                  <td className="px-2 py-3 text-sm text-slate-300"><TeamLabel name={decision.previousTeamName} logo={decision.previousTeamLogo} /></td>
                  <td className="px-2 py-3 text-sm text-white"><TeamLabel name={decision.newTeamName} logo={decision.newTeamLogo} /></td>
                  <td className={`px-2 py-3 text-xs font-black uppercase ${presentation.className}`}><span className="inline-flex items-center gap-1.5">{presentation.icon}{presentation.label}</span></td>
                  <td className="px-2 py-3 text-[10px] font-black uppercase text-slate-300">{contractTypeLabel(decision)}</td>
                  <td className="px-2 py-3 text-[10px] font-black uppercase text-slate-400">{optionLabel(decision)}</td>
                  <td className="px-3 py-3 text-xs"><ContractLabel decision={decision} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {sortedDecisions.map(decision => {
          const presentation = statusPresentation(decision.status, commissionerReview);
          return (
            <article key={decision.playerId} className={`rounded-xl border p-4 ${decision.isUserTarget ? 'border-blue-500/40 bg-blue-500/10' : 'border-slate-800 bg-slate-900/65'}`}>
              <div className="flex items-center gap-3">
                <PlayerPortrait decision={decision} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-bold text-white">{decision.isUserTarget && <Star size={14} className="fill-emerald-400 text-emerald-400" />}{decision.playerName}</div>
                  <div className="mt-1 text-xs text-slate-400">{decision.position} · OVR {decision.overall} · POT {decision.potential}</div>
                </div>
                <span className={`text-right text-[10px] font-black uppercase ${presentation.className}`}>{presentation.label}</span>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                <TeamLabel name={decision.previousTeamName} logo={decision.previousTeamLogo} />
                <ArrowRightLeft size={14} className="text-slate-600" />
                <TeamLabel name={decision.newTeamName} logo={decision.newTeamLogo} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3 text-xs">
                <ContractLabel decision={decision} />
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] font-black uppercase text-slate-400">{contractTypeLabel(decision)}</span>
                {decision.option && decision.option !== 'NONE' && <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[9px] font-black uppercase text-violet-300">{optionLabel(decision)} option</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export const FreeAgencyDailySummaryModal: React.FC = () => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const [isCompleting, setIsCompleting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const summary = state.pendingFreeAgencySummary;
  if (!summary || ((state as any).pendingRFAOfferSheets?.length ?? 0) > 0) return null;
  const commissionerReview = summary.commissionerReview === true && state.gameMode !== 'gm';
  const targets = summary.decisions.filter(decision => decision.isUserTarget);
  const leagueSignings = summary.decisions.filter(decision => !decision.isUserTarget && decision.status !== 're-signed');
  const reSignings = summary.decisions.filter(decision => !decision.isUserTarget && decision.status === 're-signed');
  const signedWithYou = summary.decisions.filter(decision => decision.status === 'signed-with-you').length;
  const signedElsewhere = summary.decisions.filter(decision => decision.status === 'signed-elsewhere').length;
  const reSigned = summary.decisions.filter(decision => decision.status === 're-signed').length;
  const aspireDecisions = summary.decisions.filter(decision => decision.aspireSideDeal);

  const close = async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      const deferredView = summary.combined ? state.pendingPostFreeAgencyView : undefined;
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          pendingFreeAgencySummary: undefined,
          pendingPostFreeAgencyView: undefined,
          ...(state.gameMode === 'gm' ? { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } } : {}),
        },
      } as any);
      if (deferredView) setCurrentView(deferredView);
      else if (!summary.combined) setCurrentView(state.gameMode === 'gm' ? 'Team Office' as any : 'Free Agents' as any);
    } finally {
      setIsClosing(false);
    }
  };
  const completeCommissionerReview = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      const patch = await resolveCommissionerTask(state, 'commissioner_free_agency', {
        mode: 'manual',
        resolution: {
          reviewedLeagueSignings: summary.decisions.length,
          reviewedFreeAgencyDays: summary.totalDays,
        },
      });
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: { ...patch, pendingFreeAgencySummary: undefined },
      } as any);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 p-2 backdrop-blur-md sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#07111d] shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700/70 px-4 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-blue-700 p-2 text-white"><CalendarDays size={22} /></span>
              <div>
                <h2 className="text-xl font-black uppercase tracking-wide text-white sm:text-3xl">{summary.signingConfirmation ? 'Signing Confirmation' : summary.combined ? 'Free Agency Summary' : 'Daily Free Agency Summary'}</h2>
                <p className="text-xs text-slate-400 sm:text-sm">
                  {summary.signingConfirmation ? summary.date : summary.combined ? `Full ${summary.totalDays}-day period · through ${summary.date}` : `Day ${summary.day} of ${summary.totalDays} · ${summary.date}`}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              {summary.decisions.length > 0
                ? commissionerReview
                  ? 'League-wide decisions from the complete free-agency period.'
                  : 'These players reached a decision.'
                : summary.combined
                  ? 'No players reached a decision during this free-agency period.'
                  : 'No players reached a decision today.'}
            </p>
          </div>
          {!commissionerReview && (
            <button type="button" disabled={isClosing} onClick={() => void close()} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"><X size={24} /></button>
          )}
        </header>

        <div className={`grid shrink-0 grid-cols-2 gap-2 border-b border-slate-800 px-4 py-3 sm:px-6 ${commissionerReview ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
          <div className="rounded-lg bg-slate-900 p-3"><div className="text-xl font-black text-white">{summary.decisions.length}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Decisions</div></div>
          {!commissionerReview && <div className="rounded-lg bg-emerald-500/10 p-3"><div className="text-xl font-black text-emerald-400">{signedWithYou}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Signed With You</div></div>}
          <div className="rounded-lg bg-amber-500/10 p-3"><div className="text-xl font-black text-amber-400">{signedElsewhere}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{commissionerReview ? 'Joined New Teams' : 'Signed Elsewhere'}</div></div>
          <div className="rounded-lg bg-violet-500/10 p-3"><div className="text-xl font-black text-violet-400">{reSigned}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Re-signed</div></div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-3 sm:p-6">
          {aspireDecisions.map(decision => {
            const deal = decision.aspireSideDeal!;
            const caught = deal.roll <= deal.risk;
            return (
              <section key={`aspire-${decision.playerId}`} className={`mb-5 rounded-xl border p-4 ${caught ? 'border-rose-500/50 bg-rose-500/10' : 'border-emerald-500/40 bg-emerald-500/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ShieldAlert size={20} className={caught ? 'text-rose-300' : 'text-emerald-300'} />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">ASPIRE · {deal.sponsor}</p>
                      <p className="mt-1 font-black uppercase text-white">Detection Roll · {decision.playerName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className={`text-3xl font-black tabular-nums ${caught ? 'text-rose-300' : 'text-emerald-300'}`}>{deal.roll}</span>
                    <span className="text-xs font-bold uppercase text-slate-400">vs {deal.risk}% risk<br />{caught ? 'Caught' : 'Clear'}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-300">{caught ? 'The agreement was discovered. Future first-round picks were forfeited under the saved risk penalty.' : 'The agreement was not discovered. No picks were forfeited.'}</p>
              </section>
            );
          })}
          {!commissionerReview && <DecisionTable title={`${summary.signingConfirmation ? 'Completed Signing' : 'My Targets'} (${targets.length})`} subtitle={summary.signingConfirmation ? 'The deal is finalized' : 'Players you made offers to'} decisions={targets} />}
          <DecisionTable title={`League Signings (${leagueSignings.length})`} subtitle={commissionerReview ? 'Completed signings across the league' : 'Other completed signings around the league'} decisions={leagueSignings} commissionerReview={commissionerReview} />
          <DecisionTable title={`Re-signed (${reSignings.length})`} subtitle="Players returning to their previous teams" decisions={reSignings} commissionerReview={commissionerReview} />
        </div>

        <footer className="shrink-0 border-t border-slate-700/70 bg-slate-950/90 p-3 sm:px-6 sm:py-4">
          <button
            type="button"
            disabled={isCompleting || isClosing}
            onClick={commissionerReview ? () => void completeCommissionerReview() : () => void close()}
            className="w-full rounded-xl bg-blue-700 px-5 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-blue-600 disabled:cursor-wait disabled:opacity-60 sm:ml-auto sm:block sm:w-auto"
          >
            {commissionerReview ? (isCompleting ? 'Completing…' : 'Mark Done') : isClosing ? 'Continuing…' : summary.combined ? 'Continue to Next Task' : 'Back to Free Agency'}
          </button>
        </footer>
      </div>
    </div>
  );
};
