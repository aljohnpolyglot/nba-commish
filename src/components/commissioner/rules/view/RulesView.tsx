import React, { useState } from 'react';
import { useGame } from '../../../../store/GameContext';
import { useRulesState } from './useRulesState';
import { RulesHeader } from './RulesHeader';
import { TabsContent } from './TabsContent';
import { formatGameDateShort } from '../../../../utils/dateUtils';
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
        hasConfigChanges={rulesState.hasConfigChanges}
        isEditable={isEditable}
        isSaving={rulesState.isSaving}
        handleSaveConfig={rulesState.handleSaveConfig}
        handleResetConfig={rulesState.handleResetConfig}
      />

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
                This page is read-only outside the preseason governance window.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Rule changes are only editable after offseason ends and before schedule generation on {formatGameDateShort(settingsWindow.closesOnDate)}.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RulesView;
