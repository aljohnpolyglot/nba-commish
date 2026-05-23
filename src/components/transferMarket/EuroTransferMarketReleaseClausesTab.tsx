import React, { useState } from 'react';
import { FileWarning } from 'lucide-react';
import type { ClauseStatus, ReleaseClause } from './mockData';
import { useTransferMarketContext } from './state';
import { clauseStatusColor, ClubChip, fmtEUR, OpenMarketPlayer, OvrPotPair, PlayerCell, RatingBadge, StatusPill } from './EuroTransferMarketShared';

export const ReleaseClausesTab: React.FC<{ onOpenPlayer: OpenMarketPlayer }> = ({ onOpenPlayer }) => {
  const { clauses } = useTransferMarketContext();
  const [filter, setFilter] = useState<ClauseStatus | 'all'>('all');
  const [selected, setSelected] = useState<ReleaseClause | null>(clauses[0] ?? null);

  React.useEffect(() => {
    if (!selected && clauses[0]) setSelected(clauses[0]);
    if (selected && !clauses.find(c => c.id === selected.id)) setSelected(clauses[0] ?? null);
  }, [clauses, selected]);

  const filtered = filter === 'all' ? clauses : clauses.filter(c => c.status === filter);
  const filterTabs: Array<{ key: ClauseStatus | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'Active', label: 'Active' },
    { key: 'Trigger Risk', label: 'Trigger Risk' },
    { key: 'Fired', label: 'Fired' },
    { key: 'No Clause', label: 'No Clause' },
    { key: 'Expired', label: 'Expired' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      <div className="col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
            <FileWarning size={16} className="text-amber-400" />
            Release Clauses
            <span className="text-[10px] font-bold text-slate-500">Buyout clauses on your active contracts</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterTabs.map(t => {
            const count = t.key === 'all' ? clauses.length : clauses.filter(c => c.status === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                  filter === t.key ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {t.label} <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-slate-800/40 rounded-2xl border border-slate-800/50 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-900/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold">
            <div className="col-span-3">Player</div>
            <div className="col-span-1 text-center">OVR</div>
            <div className="col-span-1 text-center">POT</div>
            <div className="col-span-2">Clause Type</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-1">Expires</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500 border-t border-slate-800/40">
              No clauses on your active contracts.
            </div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left border-t border-slate-800/40 transition-colors ${
                selected?.id === c.id ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : 'hover:bg-slate-800/30'
              }`}
            >
              <div className="col-span-3"><PlayerCell p={c.player} small onOpen={onOpenPlayer} /></div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="OVR" value={c.player.ovr} small /></div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="POT" value={c.player.pot} small /></div>
              <div className="col-span-2 text-[11px] font-bold text-slate-300">{c.type}</div>
              <div className="col-span-2 text-xs font-black text-white">{c.amountEUR > 0 ? fmtEUR(c.amountEUR) : '—'}</div>
              <div className="col-span-1 text-[10px] text-slate-400">{c.expiresDate}</div>
              <div className="col-span-2 text-right">
                <StatusPill tone={clauseStatusColor(c.status)}>{c.status}</StatusPill>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {!selected ? (
          <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-800/60 text-sm text-slate-500 text-center">
            Pick a clause on the left to view its details.
          </div>
        ) : (
          <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-800/60 space-y-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Player</div>

            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-white">
                {selected.player.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-white truncate">{selected.player.name}</div>
                <div className="text-[10px] text-slate-500">{selected.player.flag} {selected.player.position} · {selected.player.age}y · {selected.player.contractYearsLeft}y left</div>
                <div className="mt-1"><OvrPotPair ovr={selected.player.ovr} pot={selected.player.pot} small /></div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl p-4 border border-purple-500/30">
              <div className="text-[10px] uppercase tracking-wider text-purple-400 font-bold">Clause Amount</div>
              <div className="text-3xl font-black text-purple-300 mt-1">{selected.amountEUR > 0 ? fmtEUR(selected.amountEUR) : '—'}</div>
              <div className="text-[10px] text-slate-400 mt-1">{selected.type}</div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Clause Information</div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Status</span>
                <StatusPill tone={clauseStatusColor(selected.status)}>{selected.status}</StatusPill>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Expires</span>
                <span className="font-bold text-white">{selected.expiresDate}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Term notice</span>
                <span className="font-bold text-white">{selected.termNoticeDays > 0 ? `${selected.termNoticeDays} days` : '—'}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Payment structure</span>
                <span className="font-bold text-white">{selected.paymentStructure}</span>
              </div>
            </div>

            {selected.status === 'No Clause' ? (
              <div className="bg-slate-900/60 rounded-xl p-3 border border-amber-500/30">
                <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">Description</div>
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  This contract has no release clause. Any club must negotiate a transfer fee with you directly — you cannot be forced to sell.
                </p>
              </div>
            ) : (
              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Description</div>
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  Any club that deposits {fmtEUR(selected.amountEUR)} can sign {selected.player.name.split(' ')[0]} without your approval. Term notice of {selected.termNoticeDays} days must be filed before payment is finalized.
                </p>
              </div>
            )}

            {selected.recentActivity.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Recent Activity</div>
                <div className="space-y-1.5">
                  {selected.recentActivity.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px]">
                      <span className="text-slate-500 shrink-0 font-mono">{a.date}</span>
                      <span className="text-slate-300">{a.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider">
              Edit Clause
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
