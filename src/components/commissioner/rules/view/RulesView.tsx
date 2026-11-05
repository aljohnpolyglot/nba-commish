import React, { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { useGame } from '../../../../store/GameContext';
import { useRulesState } from './useRulesState';
import { RulesHeader } from './RulesHeader';
import { TabsContent } from './TabsContent';
import { getCommissionerSettingsWindow } from '../../../../utils/commissionerSettings';

const RulesView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const { leagueStats } = state;
  const [activeTab, setActiveTab] = useState('Format');
  const settingsWindow = getCommissionerSettingsWindow(state);
  const isEditable = settingsWindow.isOpen;
  
  const rulesState = useRulesState(leagueStats, dispatchAction, isEditable);
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RulesHeader 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {isEditable && rulesState.hasConfigChanges && (
        <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">League Settings Review</p>
          <p className="mt-1 text-sm text-slate-300">Review or change league settings. Saved changes will appear in the final Governors Board recap.</p>
        </div>
      )}

      <div className="relative mt-8">
        <div className={isEditable ? '' : 'pointer-events-none select-none opacity-45 grayscale'}>
          <TabsContent 
            activeTab={activeTab}
            rulesState={rulesState}
          />
        </div>
        {!isEditable && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center p-4 sm:p-6">
            <div className="max-w-xl rounded-3xl border border-amber-500/30 bg-slate-950/85 px-5 py-4 text-center shadow-2xl backdrop-blur-sm">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Commissioner Settings Locked</p>
              <p className="mt-2 text-sm text-slate-200">
                League rules can only be changed while the League Settings Review task is open.
              </p>
            </div>
          </div>
        )}
      </div>

      {isEditable && (
        <div
          className="fixed right-4 z-[90] flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur sm:right-6"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={rulesState.handleResetConfig}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-3 text-slate-300 hover:bg-white/10"
            title="Reset Changes"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            onClick={rulesState.handleSaveConfig}
            disabled={rulesState.isSaving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={16} /> {rulesState.isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
};

export default RulesView;
