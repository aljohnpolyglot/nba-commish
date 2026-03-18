import React from 'react';
import { UserPlus } from 'lucide-react';
import { DraftLotterySettings } from './DraftLotterySettings';

import { DraftEligibilitySettings } from './DraftEligibilitySettings';

interface DraftTabProps {
    draftType: string;
    setDraftType: (val: string) => void;
    eligibilityRule: string;
    setEligibilityRule: (val: string) => void;
}

export const DraftTab: React.FC<DraftTabProps> = ({
    draftType,
    setDraftType,
    eligibilityRule,
    setEligibilityRule
}) => {
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm space-y-8">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
                    <UserPlus size={20} />
                </div>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">Draft Rules</h4>
            </div>

            <div className="space-y-6">
                <DraftLotterySettings draftType={draftType} setDraftType={setDraftType} />
                <DraftEligibilitySettings eligibilityRule={eligibilityRule} setEligibilityRule={setEligibilityRule} />
            </div>
        </div>
    );
};
