import React from 'react';
import { Activity } from 'lucide-react';
import { DailyPlanModal } from '../../TeamTraining/components/DailyPlanModal';
import { TrainingFranchisePicker } from './TrainingFranchisePicker';
import { getPracticeLabel, type SavedDefaultState } from './trainingCenterShared';
import type { Allocations, TrainingParadigm } from '../../TeamTraining/types';

export function TrainingCenterPickerShell({ onSelectTeam }: { onSelectTeam: (teamId: number) => void }) {
  return (
    <div className="bg-slate-950 min-h-full text-white">
      <header className="h-[60px] bg-[linear-gradient(to_bottom,#1a1a1a,#000)] flex items-center px-4 sm:px-10 border-b border-[#30363d] justify-between shrink-0 relative z-20">
        <div className="font-black text-xl sm:text-2xl tracking-widest uppercase">
          Training <span className="text-[#FDB927]">Center</span>
        </div>
        <div className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-bold">
          Pick a franchise
        </div>
      </header>
      <div className="h-[3px] bg-gradient-to-r from-transparent via-[#FDB927]/60 to-transparent" />
      <div className="h-px bg-[#30363d]" />
      <TrainingFranchisePicker onSelectTeam={onSelectTeam} />
    </div>
  );
}

export function TrainingCenterHeader({
  teamName,
  currentDate,
  isReadOnly,
  isGM,
  selectedTeamId,
  activeLeagueTeams,
  onBack,
  onTeamChange,
}: {
  teamName: string;
  currentDate: string;
  isReadOnly: boolean;
  isGM: boolean;
  selectedTeamId: number;
  activeLeagueTeams: Array<{ id: number; name: string }>;
  onBack: () => void;
  onTeamChange: (teamId: number) => void;
}) {
  return (
    <header className="h-[60px] bg-[linear-gradient(to_bottom,#1a1a1a,#000)] flex items-center px-4 sm:px-10 border-b border-[#30363d] justify-between shrink-0 relative z-20">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={onBack}
          className="font-black text-xl sm:text-2xl tracking-widest uppercase hover:text-[#FDB927] transition-colors"
          title="Back to franchise picker"
        >
          ←
        </button>
        <div className="font-black text-xl sm:text-2xl tracking-widest uppercase truncate">
          Training <span className="text-[#FDB927]">Center</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-3 pl-3 border-l border-[#30363d]">
          <Activity size={12} className="text-[#FDB927]" />
          {teamName} · {currentDate}
        </div>
        {isReadOnly && (
          <div className="hidden md:flex items-center gap-1.5 ml-3 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">View Only</span>
          </div>
        )}
      </div>

      {!isGM && (
        <select
          className="bg-[#1a1a1a] border border-[#30363d] text-white rounded-md px-3 py-1.5 text-xs uppercase tracking-wide outline-none focus:border-[#FDB927]"
          value={selectedTeamId}
          onChange={(e) => onTeamChange(Number(e.target.value))}
        >
          {activeLeagueTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </header>
  );
}

export function TrainingCenterTabs({
  activeView,
  onViewChange,
}: {
  activeView: 'training' | 'roster' | 'proficiency';
  onViewChange: (view: 'training' | 'roster' | 'proficiency') => void;
}) {
  const tabs = [
    { id: 'training', label: 'Dashboard' },
    { id: 'roster', label: 'Roster' },
    { id: 'proficiency', label: 'Systems' },
  ] as const;

  return (
    <div className="border-b border-[#30363d] bg-[#0a0a0a] px-4 sm:px-10">
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((t) => {
          const isActive = activeView === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onViewChange(t.id)}
              className={`relative px-4 sm:px-6 py-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
              {isActive && (
                <>
                  <div className="absolute -bottom-[1px] left-0 w-full h-[2px] bg-white" />
                  <div className="absolute -bottom-[3px] left-0 w-full h-[3px] bg-[#FDB927]" />
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DormantTrainingStateCard({ label, subtext }: { label: string; subtext: string }) {
  return (
    <div className="bg-black border border-slate-800 rounded-3xl p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FDB927]/10 border border-[#FDB927]/30 mb-4">
        <Activity size={28} className="text-[#FDB927]" />
      </div>
      <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mb-2">{label}</h2>
      <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">{subtext}</p>
      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-6">
        Roster + Systems tabs remain editable
      </p>
    </div>
  );
}

export function TrainingPlanModals({
  selectedPlanDateISO,
  selectedDayDataActivity,
  modalIntensity,
  modalAllocations,
  modalParadigm,
  top5Systems,
  onCloseSelectedPlan,
  onSaveSelectedPlan,
  normalDefaultOpen,
  normalDefaultDraft,
  onCloseNormalDefault,
  onSaveNormalDefault,
}: {
  selectedPlanDateISO: string | null;
  selectedDayDataActivity: string;
  modalIntensity: number;
  modalAllocations: Allocations;
  modalParadigm: TrainingParadigm;
  top5Systems: string[];
  onCloseSelectedPlan: () => void;
  onSaveSelectedPlan: (i: number, a: Allocations, p: TrainingParadigm) => void;
  normalDefaultOpen: boolean;
  normalDefaultDraft: { intensity: number; allocations: Allocations; paradigm: TrainingParadigm };
  onCloseNormalDefault: () => void;
  onSaveNormalDefault: (i: number, a: Allocations, p: TrainingParadigm) => void;
}) {
  return (
    <>
      <DailyPlanModal
        isOpen={selectedPlanDateISO !== null}
        onClose={onCloseSelectedPlan}
        day={selectedPlanDateISO ? Number(selectedPlanDateISO.slice(8, 10)) : 0}
        activity={selectedDayDataActivity}
        intensity={modalIntensity}
        allocations={modalAllocations}
        paradigm={modalParadigm}
        top5Systems={top5Systems}
        onSave={onSaveSelectedPlan}
      />
      <DailyPlanModal
        isOpen={normalDefaultOpen}
        onClose={onCloseNormalDefault}
        day={0}
        activity="TEAM PRACTICE TEMPLATE"
        intensity={normalDefaultDraft.intensity}
        allocations={normalDefaultDraft.allocations}
        paradigm={normalDefaultDraft.paradigm}
        top5Systems={top5Systems}
        onSave={onSaveNormalDefault}
      />
    </>
  );
}

export function SaveAsDefaultPrompt({
  savedDefault,
  onCancel,
  onConfirm,
}: {
  savedDefault: SavedDefaultState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!savedDefault) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#1a1a1a] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="font-black uppercase tracking-widest text-amber-300 text-sm">
              Use for Similar Days?
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Update upcoming auto-planned days
            </div>
          </div>
        </div>
        <div className="text-sm text-slate-300 mb-5 leading-relaxed">
          Replace <span className="font-bold text-rose-300">{savedDefault.matchCount}</span> upcoming auto-day
          {savedDefault.matchCount === 1 ? '' : 's'} of{' '}
          <span className="font-bold text-slate-200">
            {savedDefault.oldPlan ? `${getPracticeLabel(savedDefault.oldPlan.paradigm)} ${savedDefault.oldPlan.intensity}%` : ''}
          </span>{' '}
          with{' '}
          <span className="font-bold text-amber-300">
            {getPracticeLabel(savedDefault.newPlan.paradigm)} {savedDefault.newPlan.intensity}%
          </span>
          ?
          <div className="text-[11px] text-slate-500 mt-2">
            Only auto-cells are touched — your manually-edited days stay as-is.
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase text-xs tracking-widest"
          >
            Keep This Day
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest"
          >
            Apply to Similar Days ({savedDefault.matchCount})
          </button>
        </div>
      </div>
    </div>
  );
}
