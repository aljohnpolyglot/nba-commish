import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Target, Trash2 } from 'lucide-react';
import { RivalAction, RivalPlan, RIVAL_ACTIONS } from '../../../../../../store/rivalGameplanStore';

interface RivalAddOption {
  id: number;
  logoUrl?: string;
  label: string;
}

interface ConfiguredRivalView {
  oppTid: number;
  logoUrl?: string;
  displayName: string;
  previewText: string;
  plan: RivalPlan;
}

interface RivalPlansSectionProps {
  configuredCount: number;
  totalOpponents: number;
  showAddRival: boolean;
  unconfiguredOpponents: RivalAddOption[];
  configuredRivals: ConfiguredRivalView[];
  expandedRivalTid: number | null;
  dropdownClassName: string;
  findPlayerName: (id?: string) => string;
  onToggleAddRival: () => void;
  onAddRival: (oppTid: number) => void;
  onToggleExpanded: (oppTid: number) => void;
  onCycleTarget: (oppTid: number, slot: 'primary' | 'secondary', direction: 1 | -1) => void;
  onUpdateAction: (oppTid: number, slot: 'primary' | 'secondary', action: RivalAction) => void;
  onRemovePlan: (oppTid: number) => void;
}

export function RivalPlansSection({
  configuredCount,
  totalOpponents,
  showAddRival,
  unconfiguredOpponents,
  configuredRivals,
  expandedRivalTid,
  dropdownClassName,
  findPlayerName,
  onToggleAddRival,
  onAddRival,
  onToggleExpanded,
  onCycleTarget,
  onUpdateAction,
  onRemovePlan,
}: RivalPlansSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 mt-4">
        <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase">
          Rival Plans <span className="text-[10px] text-slate-600 ml-2">{configuredCount} / {totalOpponents} configured</span>
        </h5>
        <button
          onClick={onToggleAddRival}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <Plus size={12} />
          Add Rival
        </button>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">
        Per-opponent target list. Set once — sticks all season. Auto-resets when a target is traded.
      </p>

      {showAddRival && (
        <div className="bg-[#1a1a1a] border border-cyan-900/40 rounded p-3 mb-2">
          <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Pick a Team</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
            {unconfiguredOpponents.map(opp => (
              <button
                key={opp.id}
                onClick={() => onAddRival(opp.id)}
                className="flex items-center gap-1.5 p-2 rounded bg-[#0d0d0d] border border-gray-800 hover:border-cyan-500/50 transition-colors text-left"
              >
                {opp.logoUrl && <img src={opp.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />}
                <span className="text-[10px] font-bold text-white truncate">{opp.label}</span>
              </button>
            ))}
            {unconfiguredOpponents.length === 0 && (
              <div className="col-span-full text-[10px] text-slate-500 italic">All teams configured.</div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {configuredCount === 0 && !showAddRival && (
          <div className="bg-[#0d0d0d] border border-gray-800 rounded p-3 text-center">
            <Target size={16} className="mx-auto text-slate-600 mb-1" />
            <p className="text-[11px] text-slate-500">No rival plans yet. Click <span className="text-cyan-400 font-bold">+ Add Rival</span> to target a specific team's stars.</p>
          </div>
        )}
        {configuredRivals.map(({ oppTid, logoUrl, displayName, previewText, plan }) => {
          const isExpanded = expandedRivalTid === oppTid;
          return (
            <div
              key={oppTid}
              className={`bg-[#1a1a1a] border rounded transition-all ${isExpanded ? 'border-cyan-500/40' : 'border-gray-800'}`}
            >
              <button
                onClick={() => onToggleExpanded(oppTid)}
                className="w-full flex items-center justify-between p-2.5 text-left hover:bg-[#0d0d0d]/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {logoUrl && <img src={logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />}
                  <span className="text-xs md:text-sm font-bold text-white truncate">{displayName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isExpanded && (
                    <span className="hidden md:inline text-[10px] text-cyan-300 font-mono truncate max-w-[200px]">
                      {previewText}
                    </span>
                  )}
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-800 p-3 space-y-3">
                  {(['primary', 'secondary'] as const).map(slot => {
                    const targetId = slot === 'primary' ? plan.primaryTargetId : plan.secondaryTargetId;
                    const action = slot === 'primary' ? plan.primaryAction : plan.secondaryAction;
                    const label = slot === 'primary' ? 'PRIMARY TARGET' : 'SECONDARY TARGET';
                    const labelColor = slot === 'primary' ? 'text-rose-400' : 'text-amber-400';
                    return (
                      <div key={slot} className="bg-[#0d0d0d] rounded p-2 border border-gray-800">
                        <div className={`text-[9px] font-black uppercase tracking-widest ${labelColor} mb-1.5`}>{label}</div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <button
                            onClick={() => onCycleTarget(oppTid, slot, -1)}
                            className="text-gray-400 hover:text-white p-1"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="text-cyan-300 font-bold text-xs flex-1 text-center truncate">
                            {findPlayerName(targetId)}
                          </span>
                          <button
                            onClick={() => onCycleTarget(oppTid, slot, 1)}
                            className="text-gray-400 hover:text-white p-1"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                        {targetId && (
                          <select
                            className={`${dropdownClassName} w-full`}
                            value={action ?? RIVAL_ACTIONS[0]}
                            onChange={e => onUpdateAction(oppTid, slot, e.target.value as RivalAction)}
                          >
                            {RIVAL_ACTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                          </select>
                        )}
                        {slot === 'secondary' && !targetId && (
                          <button
                            onClick={() => onCycleTarget(oppTid, 'secondary', 1)}
                            className="w-full text-[10px] text-cyan-400 hover:text-cyan-300 py-1"
                          >
                            + Add secondary target
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => onRemovePlan(oppTid)}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400 transition-colors ml-auto"
                  >
                    <Trash2 size={10} />
                    Remove plan
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
