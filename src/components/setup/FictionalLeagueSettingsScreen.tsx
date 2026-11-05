import React, { useState } from 'react';
import type { LeagueStats } from '../../types';
import { TabsContent } from '../commissioner/rules/view/TabsContent';
import { useRulesState } from '../commissioner/rules/view/useRulesStateCore';
import { RulesHeader } from '../commissioner/rules/view/RulesHeader';

type SettingsTab = 'Format' | 'NBA Cup' | 'Economy' | 'Draft' | 'Honors' | 'All-Star' | 'Game Rules';

export function FictionalLeagueSettingsScreen({ initialRules, onContinue }: {
  initialRules: LeagueStats;
  onContinue: (rules: Partial<LeagueStats>) => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('Format');
  const rulesState = useRulesState(initialRules, async () => {}, true);

  const continueSetup = () => onContinue({
    ...initialRules,
    ...rulesState.rules,
    rules: rulesState.localRules,
    draftEligibilityRule: rulesState.eligibilityRule,
  });

  return (
    <div className="fictional-league-settings relative z-10 mx-auto flex h-screen w-full max-w-[1400px] flex-col px-4 py-6">
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-gray-800 bg-black/60 shadow-2xl backdrop-blur-md">
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="mx-auto h-full max-w-6xl overflow-y-auto">
            <div className="mx-auto max-w-7xl pb-28 pt-4 md:pt-8">
              <RulesHeader
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                startup
              />
              <div className="relative mt-8"><TabsContent activeTab={activeTab} rulesState={rulesState} startup /></div>
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={continueSetup}
        className="fixed right-4 z-[70] whitespace-nowrap rounded-lg bg-red-600 px-5 py-3 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_24px_rgba(220,38,38,0.55)] transition-all hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300 sm:right-6 sm:px-8 sm:text-base"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        Next: League Origin
      </button>
    </div>
  );
}
