import React from 'react';
import { ChevronDown, RotateCcw, Shield, User } from 'lucide-react';
import {
  DEFAULT_DEFENDER_DETAIL,
  DefenderDetail,
  DoublingOverride,
  PnrOverride,
} from '../../../../../../store/defenderDetailStore';
import {
  COMPACT_DROPDOWN_CLASS,
  DEFENDER_DETAIL_FIELDS,
  DOUBLING_OVERRIDE_OPTIONS,
  PNR_OVERRIDE_OPTIONS,
} from './defenseTabShared';

interface StarterView {
  internalId: string;
  name: string;
  pos?: string;
}

interface DefenderDetailSectionProps {
  starters: StarterView[];
  detailMap: Record<string, DefenderDetail>;
  expandedDefenderId: string | null;
  summarizeDetail: (detail: DefenderDetail) => string;
  isCustomized: (detail: DefenderDetail) => boolean;
  onToggleExpanded: (defenderId: string) => void;
  onUpdateDetail: <K extends keyof DefenderDetail>(
    defenderId: string,
    key: K,
    value: DefenderDetail[K]
  ) => void;
  onResetDetail: (defenderId: string) => void;
}

export function DefenderDetailSection({
  starters,
  detailMap,
  expandedDefenderId,
  summarizeDetail,
  isCustomized,
  onToggleExpanded,
  onUpdateDetail,
  onResetDetail,
}: DefenderDetailSectionProps) {
  return (
    <div>
      <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2 mt-4">Defender Detail</h5>
      <p className="text-[10px] text-slate-500 mb-3">
        Per-defender baseline tendencies. Tap a card to expand.
      </p>
      <div className="space-y-1.5">
        {starters.map((player, idx) => {
          const id = player.internalId;
          const detail = detailMap[id] ?? DEFAULT_DEFENDER_DETAIL;
          const isExpanded = expandedDefenderId === id;
          const customized = isCustomized(detail);
          const slotPos = ['PG', 'SG', 'SF', 'PF', 'C'][idx] ?? player.pos ?? 'F';
          return (
            <div
              key={id}
              className={`bg-[#1a1a1a] border rounded transition-all ${
                isExpanded ? 'border-cyan-500/40' : customized ? 'border-cyan-900/40' : 'border-gray-800'
              }`}
            >
              <button
                onClick={() => onToggleExpanded(id)}
                className="w-full flex items-center justify-between p-2.5 text-left hover:bg-[#0d0d0d]/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="text-[9px] font-black text-cyan-400 bg-black/60 px-1.5 py-0.5 rounded shrink-0">
                    {slotPos}
                  </span>
                  <User size={12} className="text-slate-500 shrink-0" />
                  <span className="text-xs md:text-sm font-bold text-white truncate">
                    {player.name}
                  </span>
                  {customized && !isExpanded && (
                    <span className="text-[9px] text-cyan-400 uppercase tracking-widest font-black shrink-0">
                      Custom
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isExpanded && (
                    <span className="hidden md:inline text-[10px] text-slate-500 font-mono">
                      {summarizeDetail(detail)}
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-800 p-3 space-y-2">
                  {DEFENDER_DETAIL_FIELDS.map(row => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr] items-center gap-2"
                    >
                      <span className="text-[10px] md:text-xs font-bold text-slate-300">{row.label}</span>
                      <select
                        className={`${COMPACT_DROPDOWN_CLASS} w-full`}
                        value={detail[row.key]}
                        onChange={e => onUpdateDetail(id, row.key, e.target.value as DefenderDetail[typeof row.key])}
                      >
                        {row.options.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div className="border-t border-gray-800 pt-2 mt-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Shield size={10} className="text-amber-400" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400">Scheme Override</span>
                      <span className="text-[9px] text-slate-500 italic ml-auto">Team default unless changed</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr] items-center gap-2 mb-1.5">
                      <span className="text-[10px] md:text-xs font-bold text-slate-300">PnR Coverage</span>
                      <select
                        className={`${COMPACT_DROPDOWN_CLASS} w-full`}
                        value={detail.scheme?.pnr ?? 'Inherit'}
                        onChange={e => {
                          const nextScheme = {
                            ...(detail.scheme ?? { pnr: 'Inherit', doubling: 'Inherit' }),
                            pnr: e.target.value as PnrOverride,
                          };
                          onUpdateDetail(id, 'scheme', nextScheme);
                        }}
                      >
                        {PNR_OVERRIDE_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option === 'Inherit' ? 'Inherit (Team Default)' : option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr] items-center gap-2">
                      <span className="text-[10px] md:text-xs font-bold text-slate-300">Doubling</span>
                      <select
                        className={`${COMPACT_DROPDOWN_CLASS} w-full`}
                        value={detail.scheme?.doubling ?? 'Inherit'}
                        onChange={e => {
                          const nextScheme = {
                            ...(detail.scheme ?? { pnr: 'Inherit', doubling: 'Inherit' }),
                            doubling: e.target.value as DoublingOverride,
                          };
                          onUpdateDetail(id, 'scheme', nextScheme);
                        }}
                      >
                        {DOUBLING_OVERRIDE_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option === 'Inherit' ? 'Inherit (Team Default)' : option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {customized && (
                    <button
                      onClick={() => onResetDetail(id)}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400 transition-colors mt-2 ml-auto"
                    >
                      <RotateCcw size={10} />
                      Reset to defaults
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {starters.length === 0 && (
          <p className="text-[11px] text-slate-500 italic">No projected starters — fill the roster first.</p>
        )}
      </div>
    </div>
  );
}
