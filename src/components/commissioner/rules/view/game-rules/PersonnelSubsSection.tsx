import React from 'react';
import { Users } from 'lucide-react';
import { RuleToggle, RuleInput } from '../RuleControls';

interface PersonnelSubsSectionProps {
    maxPlayersOnCourt: number;
    setMaxPlayersOnCourt: (val: number) => void;
    substitutionLimitEnabled: boolean;
    setSubstitutionLimitEnabled: (val: boolean) => void;
    maxSubstitutions: number;
    setMaxSubstitutions: (val: number) => void;
    noDribbleRule: boolean;
    setNoDribbleRule: (val: boolean) => void;
    multiballEnabled: boolean;
    setMultiballEnabled: (val: boolean) => void;
    multiballCount: number;
    setMultiballCount: (val: number) => void;
}

export const PersonnelSubsSection: React.FC<PersonnelSubsSectionProps> = ({
    maxPlayersOnCourt, setMaxPlayersOnCourt,
    substitutionLimitEnabled, setSubstitutionLimitEnabled,
    maxSubstitutions, setMaxSubstitutions,
    noDribbleRule, setNoDribbleRule,
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
                <RuleInput id="maxPlayersOnCourt" value={maxPlayersOnCourt} onChange={setMaxPlayersOnCourt} />
                <div className="space-y-2">
                    <RuleToggle id="substitutionLimitEnabled" value={substitutionLimitEnabled} onChange={setSubstitutionLimitEnabled} />
                    {substitutionLimitEnabled && (
                        <div className="pl-4 border-l border-slate-800">
                            <RuleInput id="maxSubstitutions" value={maxSubstitutions} onChange={setMaxSubstitutions} />
                        </div>
                    )}
                </div>
                <RuleToggle id="noDribbleRule" value={noDribbleRule} onChange={setNoDribbleRule} />
                <div className="space-y-2">
                    <RuleToggle id="multiballEnabled" value={multiballEnabled} onChange={setMultiballEnabled} />
                    {multiballEnabled && <RuleInput id="multiballCount" value={multiballCount} onChange={setMultiballCount} />}
                </div>
            </div>
        </div>
    );
};
