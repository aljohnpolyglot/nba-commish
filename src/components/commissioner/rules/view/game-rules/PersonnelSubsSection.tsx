import React from 'react';
import { Users } from 'lucide-react';
import { RuleToggle, RuleInput } from '../RuleControls';

interface PersonnelSubsSectionProps {
    maxPlayersOnCourt: number;
    setMaxPlayersOnCourt: (val: number) => void;
    minPlayersPerTeam: number;
    substitutionLimitEnabled: boolean;
    setSubstitutionLimitEnabled: (val: boolean) => void;
    maxSubstitutions: number;
    setMaxSubstitutions: (val: number) => void;
    noDribbleRule: boolean;
    setNoDribbleRule: (val: boolean) => void;
    dribbleRule: 'none' | 'single_bounce_no_shot' | 'continuous';
    setDribbleRule: (val: 'none' | 'single_bounce_no_shot' | 'continuous') => void;
    multiballEnabled: boolean;
    setMultiballEnabled: (val: boolean) => void;
    multiballCount: number;
    setMultiballCount: (val: number) => void;
}

export const PersonnelSubsSection: React.FC<PersonnelSubsSectionProps> = ({
    maxPlayersOnCourt, setMaxPlayersOnCourt, minPlayersPerTeam,
    substitutionLimitEnabled, setSubstitutionLimitEnabled,
    maxSubstitutions, setMaxSubstitutions,
    setNoDribbleRule, dribbleRule, setDribbleRule,
    multiballEnabled, setMultiballEnabled,
    multiballCount, setMultiballCount
}) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-indigo-400" />
                <h5 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Personnel & Subs</h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <RuleInput id="maxPlayersOnCourt" value={maxPlayersOnCourt} onChange={setMaxPlayersOnCourt} maxValue={Math.min(10, minPlayersPerTeam)} />
                <div className="space-y-2">
                    <RuleToggle id="substitutionLimitEnabled" value={substitutionLimitEnabled} onChange={setSubstitutionLimitEnabled} />
                    {substitutionLimitEnabled && (
                        <div className="pl-4 border-l border-slate-800">
                            <RuleInput id="maxSubstitutions" value={maxSubstitutions} onChange={setMaxSubstitutions} />
                        </div>
                    )}
                </div>
                <label className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dribbling</span>
                    <select
                        aria-label="Dribbling Rule"
                        value={dribbleRule}
                        onChange={event => {
                            const next = event.target.value as 'none' | 'single_bounce_no_shot' | 'continuous';
                            setDribbleRule(next);
                            setNoDribbleRule(next === 'none');
                        }}
                        className="min-w-0 max-w-[12rem] rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-bold text-white focus:border-indigo-500 focus:outline-none"
                    >
                        <option value="none">No dribbling</option>
                        <option value="single_bounce_no_shot">Single bounce, no shot</option>
                        <option value="continuous">Continuous dribbling</option>
                    </select>
                </label>
                <div className="space-y-2">
                    <RuleToggle id="multiballEnabled" value={multiballEnabled} onChange={setMultiballEnabled} />
                    {multiballEnabled && <RuleInput id="multiballCount" value={multiballCount} onChange={setMultiballCount} />}
                    <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200/80">
                        Experimental — multiball is saved but does not affect simulation yet.
                    </p>
                </div>
            </div>
        </div>
    );
};
