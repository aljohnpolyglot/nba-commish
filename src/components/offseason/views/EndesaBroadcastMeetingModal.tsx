import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Banknote, CalendarDays, Check, MapPin, Radio, X } from 'lucide-react';
import type { GameState } from '../../../types';
import { buildEuroMediaRightsMeeting, type EuroMediaRightsRow } from '../../../services/euro/mediaRights';
import { getTeamFullName } from '../../../utils/teamNames';

type Props = {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onMarkDone: () => void;
};

type SortKey = 'club' | 'equal' | 'performance' | 'commercial' | 'total';

const money = (value: number) => `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;

function seasonLabel(season: number): string {
  return `${season - 1}/${String(season).slice(-2)}`;
}

export function EndesaBroadcastMeetingModal({ open, state, onClose, onMarkDone }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'total', direction: 'desc' });
  const [stage, setStage] = useState<'distribution' | 'club-share'>('distribution');
  useEffect(() => {
    if (open) setStage('distribution');
  }, [open]);
  if (!open) return null;
  const meeting = buildEuroMediaRightsMeeting(state);
  const teams = new Map([...state.teams, ...state.nonNBATeams]
    .map(team => [Number((team as any).id ?? (team as any).tid), team]));
  const leagueNames = meeting.competitions.map(competition => competition.competitionName).join(' · ');
  const changeSort = (key: SortKey) => setSort(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }));
  const sortedRows = (rows: EuroMediaRightsRow[]) => rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftTeam = teams.get(left.row.teamId);
      const rightTeam = teams.get(right.row.teamId);
      const values: Record<Exclude<SortKey, 'club'>, [number, number]> = {
        equal: [left.row.equalShareEUR, right.row.equalShareEUR],
        performance: [left.row.performanceShareEUR, right.row.performanceShareEUR],
        commercial: [left.row.commercialShareEUR, right.row.commercialShareEUR],
        total: [left.row.totalEUR, right.row.totalEUR],
      };
      const comparison = sort.key === 'club'
        ? getTeamFullName(leftTeam).localeCompare(getTeamFullName(rightTeam))
        : values[sort.key][0] - values[sort.key][1];
      return (sort.direction === 'asc' ? comparison : -comparison) || left.index - right.index;
    })
    .map(({ row }) => row);
  const userShares = meeting.competitions.map(competition => ({
    competitionName: competition.competitionName,
    amountEUR: competition.rows.find(row => row.teamId === state.userTeamId)?.totalEUR ?? 0,
  })).filter(entry => entry.amountEUR > 0);
  const totalUserShare = userShares.reduce((sum, entry) => sum + entry.amountEUR, 0);

  if (stage === 'club-share') {
    const userTeam = teams.get(Number(state.userTeamId ?? -1));
    return (
      <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="euro-media-cash-title">
        <section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-emerald-400/30 bg-[#07131d] p-5 text-white shadow-2xl sm:rounded-3xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><Banknote size={25} /></div><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Club Distribution</p><h2 id="euro-media-cash-title" className="mt-1 text-2xl font-black uppercase">Media Rights Received</h2></div></div>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={20} /></button>
          </div>
          <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-5 text-center">
            <div className="text-sm font-bold text-slate-300">{userTeam ? getTeamFullName(userTeam) : 'Your club'} receives</div>
            <div className="mt-2 text-4xl font-black text-emerald-300">{money(totalUserShare)}</div>
            <div className="mt-2 text-xs text-slate-500">The amount will be posted to Club Cash when you complete this review.</div>
          </div>
          <div className="mt-5 space-y-2">
            {userShares.map(entry => <div key={entry.competitionName} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/65 px-4 py-3 text-sm"><span className="font-bold text-slate-300">{entry.competitionName}</span><span className="font-black text-emerald-300">{money(entry.amountEUR)}</span></div>)}
            {userShares.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">Your club has no distribution in this meeting.</div>}
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={onMarkDone} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-950"><Check size={16} />Mark Done</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/85 p-2 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true" aria-labelledby="euro-media-rights-title">
      <div className="flex min-h-full items-center justify-center">
        <section className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-600/70 bg-[#07131d] text-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
          <header className="relative shrink-0 overflow-hidden border-b border-slate-700/70 px-4 py-5 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,rgba(37,99,235,0.2),transparent_26%),linear-gradient(105deg,rgba(2,10,18,0.98),rgba(8,21,32,0.88),rgba(57,24,5,0.24))]" />
            <button onClick={onClose} aria-label="Close meeting" className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white sm:right-5 sm:top-5"><X size={22} /></button>
            <div className="relative grid gap-5 lg:grid-cols-[1fr_330px] lg:items-start">
              <div className="flex items-start gap-4 pr-10">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-orange-400"><Radio size={29} /></div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">European Basketball</p>
                  <h2 id="euro-media-rights-title" className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-4xl">Offseason Meeting</h2>
                  <p className="mt-1 font-bold text-orange-300">Media Rights Reveal</p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Review the domestic and continental distributions affecting your club for the {seasonLabel(meeting.season)} season.</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-600/70 bg-slate-950/65 p-4 text-sm">
                <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-300">Meeting Information</div>
                <div className="grid grid-cols-[105px_1fr] gap-y-3 text-slate-400">
                  <span>Meeting Type</span><span className="font-bold text-orange-300">Media Rights Reveal</span>
                  <span>Competitions</span><span className="font-bold text-white">{leagueNames || 'No active distribution'}</span>
                  <span className="flex items-center gap-1"><CalendarDays size={14} />Date</span><span className="text-white">June 15, {meeting.season - 1}</span>
                  <span className="flex items-center gap-1"><MapPin size={14} />Scope</span><span className="text-white">Domestic and continental rights</span>
                </div>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                {meeting.competitions.map(competition => (
                  <section key={competition.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/45">
                    <div className="p-4 sm:p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-300">{competition.competitionName}</p>
                      <h3 className="mt-1 text-lg font-black uppercase sm:text-xl">{seasonLabel(competition.season)} Revenue Distribution</h3>
                      <p className="mt-1 text-sm text-slate-400">Total Revenue to be Distributed: <span className="font-bold text-emerald-400">{money(competition.totalPoolEUR)}</span></p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <PoolCard tone="sky" label="Equal Share (40%)" value={competition.equalPoolEUR} />
                        <PoolCard tone="orange" label="Performance (30%)" value={competition.performancePoolEUR} />
                        <PoolCard tone="violet" label="Commercial & Audience (30%)" value={competition.commercialPoolEUR} />
                      </div>
                      {competition.commercialProvisional && <p className="mt-3 text-xs font-semibold text-amber-300">Commercial shares are provisional until distinct market information is available.</p>}
                    </div>
                    <div className="hidden grid-cols-[42px_minmax(170px,1.4fr)_repeat(4,minmax(100px,0.75fr))] border-y border-slate-700 bg-slate-900/80 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400 md:grid">
                      <span>#</span>
                      <SortHeader label="Club" sortKey="club" active={sort} onClick={changeSort} />
                      <SortHeader label="Equal" sortKey="equal" tone="text-sky-300" active={sort} onClick={changeSort} />
                      <SortHeader label="Performance" sortKey="performance" tone="text-orange-300" active={sort} onClick={changeSort} />
                      <SortHeader label="Commercial" sortKey="commercial" tone="text-violet-300" active={sort} onClick={changeSort} />
                      <SortHeader label="Total" sortKey="total" active={sort} onClick={changeSort} />
                    </div>
                    <div className="divide-y divide-slate-800">
                      {sortedRows(competition.rows).map((row, index) => {
                        const team: any = teams.get(row.teamId);
                        const isUser = row.teamId === state.userTeamId;
                        const change = row.previousTotalEUR ? (row.totalEUR / row.previousTotalEUR - 1) * 100 : null;
                        return (
                          <article key={row.teamId} className={`${isUser ? 'bg-orange-500/[0.08]' : 'bg-slate-950/20'} p-3 md:grid md:grid-cols-[42px_minmax(170px,1.4fr)_repeat(4,minmax(100px,0.75fr))] md:items-center`}>
                            <span className="hidden text-sm text-slate-400 md:block">{index + 1}</span>
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center">{team?.logoUrl || team?.imgURL ? <img src={team.logoUrl ?? team.imgURL} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-black text-slate-500">{team?.abbrev ?? '?'}</span>}</div>
                              <div className="min-w-0"><div className={`truncate text-sm font-bold ${isUser ? 'text-orange-300' : 'text-white'}`}>{team ? getTeamFullName(team) : `Club ${row.teamId}`}{isUser ? ' (You)' : ''}</div>{change != null && <div className={`text-[10px] font-bold ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs previous</div>}</div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:contents">
                              <MoneyCell mobileLabel="Equal" tone="text-sky-300" value={row.equalShareEUR} />
                              <MoneyCell mobileLabel="Performance" tone="text-orange-300" value={row.performanceShareEUR} />
                              <MoneyCell mobileLabel="Commercial" tone="text-violet-300" value={row.commercialShareEUR} />
                              <MoneyCell mobileLabel="Total" tone="font-black text-white" value={row.totalEUR} />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {meeting.competitions.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm font-semibold text-slate-400">Your club has no media-rights distribution to review.</div>}
              </div>

              <aside className="h-fit rounded-xl border border-slate-700 bg-slate-950/45 p-5 xl:sticky xl:top-0">
                <h3 className="text-base font-black uppercase">About the Distribution Model</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">Each competition pays its own rights package. Clubs receive an equal base plus performance and commercial shares.</p>
                <div className="mt-5 space-y-4">
                  <InfoCard tone="sky" title="40% Equal Share" body="Distributed equally among the participating clubs." />
                  <InfoCard tone="orange" title="30% Performance Share" body="Based on results in the relevant competition." />
                  <InfoCard tone="violet" title="30% Commercial & Audience" body="Based on market reach, audience, and club profile." />
                </div>
                <div className="mt-5 border-t border-slate-700 pt-4 text-sm leading-6 text-slate-400">Historical starts use that season’s economy. Future distributions move with the league economy.</div>
              </aside>
            </div>
          </div>

          <footer className="flex shrink-0 justify-end border-t border-slate-700 bg-[#061019] p-4 sm:px-6">
            <button onClick={() => setStage('club-share')} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-orange-700 to-orange-500 px-8 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-orange-950/40 hover:from-orange-600 hover:to-orange-400 sm:w-auto">Continue to Club Share <ArrowRight size={18} /></button>
          </footer>
        </section>
      </div>
    </div>
  );
}

function SortHeader({ label, sortKey, tone = '', active, onClick }: {
  label: string;
  sortKey: SortKey;
  tone?: string;
  active: { key: SortKey; direction: 'asc' | 'desc' };
  onClick: (key: SortKey) => void;
}) {
  const selected = active.key === sortKey;
  return (
    <button type="button" onClick={() => onClick(sortKey)} className={`flex items-center gap-1 text-left hover:text-white ${tone}`}>
      {label}
      {selected && (active.direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );
}

function PoolCard({ tone, label, value }: { tone: 'sky' | 'orange' | 'violet'; label: string; value: number }) {
  const classes = tone === 'sky' ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : tone === 'orange' ? 'border-orange-500/30 bg-orange-500/10 text-orange-300' : 'border-violet-500/30 bg-violet-500/10 text-violet-300';
  return <div className={`rounded-lg border p-3 text-center ${classes}`}><div className="text-xs font-black uppercase">{label}</div><div className="mt-1 text-lg font-bold text-white">{money(value)}</div></div>;
}

function MoneyCell({ mobileLabel, tone, value }: { mobileLabel: string; tone: string; value: number }) {
  return <div><span className="text-slate-500 md:hidden">{mobileLabel} · </span><span className={tone}>{money(value)}</span></div>;
}

function InfoCard({ tone, title, body }: { tone: 'sky' | 'orange' | 'violet'; title: string; body: string }) {
  const classes = tone === 'sky' ? 'border-sky-500/40 bg-sky-500/10 text-sky-300' : tone === 'orange' ? 'border-orange-500/40 bg-orange-500/10 text-orange-300' : 'border-violet-500/40 bg-violet-500/10 text-violet-300';
  return <div className={`rounded-xl border p-4 ${classes}`}><div className="font-black">{title}</div><div className="mt-1 text-sm leading-5 text-slate-300">{body}</div></div>;
}
