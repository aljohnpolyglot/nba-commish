import React, { useState } from 'react';
import { useGame } from '../../../../store/GameContext';
import { useRulesState } from './useRulesState';
import { RulesHeader } from './RulesHeader';
import { TabsContent } from './TabsContent';

const RulesView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const { leagueStats } = state;
  const [activeTab, setActiveTab] = useState('Format');
  
  const rulesState = useRulesState(leagueStats, dispatchAction);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RulesHeader 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasConfigChanges={rulesState.hasConfigChanges}
        isSaving={rulesState.isSaving}
        handleSaveConfig={rulesState.handleSaveConfig}
        handleResetConfig={rulesState.handleResetConfig}
      />

      <div className="mt-8">
        <TabsContent 
          activeTab={activeTab}
          rulesState={rulesState}
        />
      </div>
    </div>
  );
};

export default RulesView;
