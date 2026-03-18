import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { RuleToggle, RuleInput } from '../RuleControls';

interface FoulsLimitsSectionProps {
    foulOutLimit: number;
    setFoulOutLimit: (val: number) => void;
    teamFoulPenalty: number;
    setTeamFoulPenalty: (val: number) => void;
    flagrantFoulPenaltyEnabled: boolean;
    setFlagrantFoulPenaltyEnabled: (val: boolean) => void;
    clearPathFoulEnabled: boolean;
    setClearPathFoulEnabled: (val: boolean) => void;
    illegalScreenEnabled: boolean;
    setIllegalScreenEnabled: (val: boolean) => void;
    overTheBackFoulEnabled: boolean;
    setOverTheBackFoulEnabled: (val: boolean) => void;
    looseBallFoulEnabled: boolean;
    setLooseBallFoulEnabled: (val: boolean) => void;
    chargingEnabled: boolean;
    setChargingEnabled: (val: boolean) => void;
    handcheckingEnabled: boolean;
    setHandcheckingEnabled: (val: boolean) => void;
    techEjectionLimit: number;
    setTechEjectionLimit: (val: number) => void;
    flagrant1EjectionLimit: number;
    setFlagrant1EjectionLimit: (val: number) => void;
    flagrant2EjectionLimit: number;
    setFlagrant2EjectionLimit: (val: number) => void;
    fightingInstantEjection: boolean;
    setFightingInstantEjection: (val: boolean) => void;
    useYellowRedCards: boolean;
    setUseYellowRedCards: (val: boolean) => void;
}

export const FoulsLimitsSection: React.FC<FoulsLimitsSectionProps> = ({
    foulOutLimit, setFoulOutLimit,
    teamFoulPenalty, setTeamFoulPenalty,
    flagrantFoulPenaltyEnabled, setFlagrantFoulPenaltyEnabled,
    clearPathFoulEnabled, setClearPathFoulEnabled,
    illegalScreenEnabled, setIllegalScreenEnabled,
    overTheBackFoulEnabled, setOverTheBackFoulEnabled,
    looseBallFoulEnabled, setLooseBallFoulEnabled,
    chargingEnabled, setChargingEnabled,
    handcheckingEnabled, setHandcheckingEnabled,
    techEjectionLimit, setTechEjectionLimit,
    flagrant1EjectionLimit, setFlagrant1EjectionLimit,
    flagrant2EjectionLimit, setFlagrant2EjectionLimit,
    fightingInstantEjection, setFightingInstantEjection,
    useYellowRedCards, setUseYellowRedCards
}) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <ShieldAlert size={16} className="text-rose-400" />
                <h5 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Fouls & Limits</h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <RuleInput id="foulOutLimit" value={foulOutLimit} onChange={setFoulOutLimit} />
                <RuleInput id="teamFoulPenalty" value={teamFoulPenalty} onChange={setTeamFoulPenalty} />
                <RuleToggle id="flagrantFoulPenaltyEnabled" value={flagrantFoulPenaltyEnabled} onChange={setFlagrantFoulPenaltyEnabled} />
                <RuleToggle id="clearPathFoulEnabled" value={clearPathFoulEnabled} onChange={setClearPathFoulEnabled} />
                <RuleToggle id="illegalScreenEnabled" value={illegalScreenEnabled} onChange={setIllegalScreenEnabled} />
                <RuleToggle id="overTheBackFoulEnabled" value={overTheBackFoulEnabled} onChange={setOverTheBackFoulEnabled} />
                <RuleToggle id="looseBallFoulEnabled" value={looseBallFoulEnabled} onChange={setLooseBallFoulEnabled} />
                <RuleToggle id="chargingEnabled" value={chargingEnabled} onChange={setChargingEnabled} />
                <RuleToggle id="handcheckingEnabled" value={handcheckingEnabled} onChange={setHandcheckingEnabled} />
            </div>
            <div className="pt-4 border-t border-slate-800/50 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ejections & Discipline</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    <RuleInput id="techEjectionLimit" value={techEjectionLimit} onChange={setTechEjectionLimit} />
                    <RuleInput id="flagrant1EjectionLimit" value={flagrant1EjectionLimit} onChange={setFlagrant1EjectionLimit} />
                    <RuleInput id="flagrant2EjectionLimit" value={flagrant2EjectionLimit} onChange={setFlagrant2EjectionLimit} />
                    <RuleToggle id="fightingInstantEjection" value={fightingInstantEjection} onChange={setFightingInstantEjection} />
                    <RuleToggle id="useYellowRedCards" value={useYellowRedCards} onChange={setUseYellowRedCards} />
                </div>
            </div>
        </div>
    );
};
