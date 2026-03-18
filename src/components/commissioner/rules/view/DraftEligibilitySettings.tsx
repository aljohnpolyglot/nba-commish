import React from 'react';

interface DraftEligibilitySettingsProps {
    eligibilityRule: string;
    setEligibilityRule: (val: string) => void;
}

export const DraftEligibilitySettings: React.FC<DraftEligibilitySettingsProps> = ({ eligibilityRule, setEligibilityRule }) => {
    return (
        <div className="flex flex-col gap-3 p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Draft Eligibility Rule</span>
            <select 
                value={eligibilityRule}
                onChange={(e) => setEligibilityRule(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-4 px-4 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            >
                <option value="one_and_done">2006–Present: The "One-and-Done" Rule (Age 19 + 1 Year Removed from HS)</option>
                <option value="prep_to_pro">1975–2005: The "Prep-to-Pro" Era (High Schoolers Eligible)</option>
                <option value="hardship">1971–1975: The "Hardship" Rule (Underclassmen Eligible)</option>
                <option value="pre_1970s">Pre-1970s: Four Years of College Eligibility Required</option>
            </select>
            <p className="text-[10px] text-slate-500 font-medium mt-1">
                Determine the criteria for players to enter the NBA Draft.
            </p>
        </div>
    );
};
