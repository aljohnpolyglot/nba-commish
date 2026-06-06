import React from 'react';
import { LOTTERY_PRESETS } from '../../../../lib/lotteryPresets';

interface DraftLotterySettingsProps {
    draftType: string;
    setDraftType: (val: string) => void;
    isPbaMode?: boolean;
}

// Build grouped options from the single source of truth in lotteryPresets.ts.

const GROUPED = Object.entries(LOTTERY_PRESETS).reduce<Record<string, { key: string; label: string }[]>>(
    (acc, [key, preset]) => {
        if (!acc[preset.group]) acc[preset.group] = [];
        acc[preset.group].push({ key, label: preset.label });
        return acc;
    },
    {},
);

const SPECIAL_OPTIONS = [
    { key: 'no_draft', label: 'No Draft - transfer/signing league' },
] as const;

export const DraftLotterySettings: React.FC<DraftLotterySettingsProps> = ({ draftType, setDraftType, isPbaMode = false }) => {
    return (
        <div className="flex flex-col gap-3 p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Lottery System</span>
            <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-4 px-4 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            >
                {Object.entries(GROUPED).map(([group, options]) => {
                    const visibleOptions = options.filter(({ key }) => isPbaMode || key !== 'pba_draft');
                    if (visibleOptions.length === 0) return null;
                    return (
                        <optgroup key={group} label={group}>
                            {visibleOptions.map(({ key, label }) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </optgroup>
                    );
                })}
                {(isPbaMode || draftType === 'pba_draft') && (
                    <optgroup label="PBA">
                        <option value="pba_draft">PBA Draft Order</option>
                    </optgroup>
                )}
                <optgroup label="Special">
                    {SPECIAL_OPTIONS.map(({ key, label }) => (
                        <option key={key} value={key}>{label}</option>
                    ))}
                </optgroup>
            </select>
            <p className="text-[10px] text-slate-500 font-medium mt-1">
                Select the mechanism used to determine the draft order for non-playoff teams, or disable the draft entirely for transfer-based leagues.
            </p>
        </div>
    );
};
