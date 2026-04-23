import React from 'react';
import { LOTTERY_PRESETS } from '../../../../lib/lotteryPresets';

interface DraftLotterySettingsProps {
    draftType: string;
    setDraftType: (val: string) => void;
}

// Build grouped options from the single source of truth in lotteryPresets.ts.
// Removed options (no backing preset yet) are commented out below for reference:
// strict, goldPlan, bracket, ladder, tankBowl, wheel, auction, flat, lateSurge, combine, social, marble, no_draft

const GROUPED = Object.entries(LOTTERY_PRESETS).reduce<Record<string, { key: string; label: string }[]>>(
    (acc, [key, preset]) => {
        if (!acc[preset.group]) acc[preset.group] = [];
        acc[preset.group].push({ key, label: preset.label });
        return acc;
    },
    {},
);

export const DraftLotterySettings: React.FC<DraftLotterySettingsProps> = ({ draftType, setDraftType }) => {
    return (
        <div className="flex flex-col gap-3 p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Lottery System</span>
            <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-4 px-4 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            >
                {Object.entries(GROUPED).map(([group, options]) => (
                    <optgroup key={group} label={group}>
                        {options.map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </optgroup>
                ))}
            </select>
            <p className="text-[10px] text-slate-500 font-medium mt-1">
                Select the mechanism used to determine the draft order for non-playoff teams.
            </p>
        </div>
    );
};
