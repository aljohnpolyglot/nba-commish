import React from 'react';
import { Timer } from 'lucide-react';
import { RuleToggle, RuleInput } from '../RuleControls';

interface TimingViolationsSectionProps {
    shotClockEnabled: boolean;
    setShotClockEnabled: (val: boolean) => void;
    shotClockValue: number;
    setShotClockValue: (val: number) => void;
    backcourtTimerEnabled: boolean;
    setBackcourtTimerEnabled: (val: boolean) => void;
    backcourtTimerValue: number;
    setBackcourtTimerValue: (val: number) => void;
    offensiveThreeSecondEnabled: boolean;
    setOffensiveThreeSecondEnabled: (val: boolean) => void;
    offensiveThreeSecondValue: number;
    setOffensiveThreeSecondValue: (val: number) => void;
    defensiveThreeSecondEnabled: boolean;
    setDefensiveThreeSecondEnabled: (val: boolean) => void;
    defensiveThreeSecondValue: number;
    setDefensiveThreeSecondValue: (val: number) => void;
    inboundTimerEnabled: boolean;
    setInboundTimerEnabled: (val: boolean) => void;
    inboundTimerValue: number;
    setInboundTimerValue: (val: number) => void;
    backToBasketTimerEnabled: boolean;
    setBackToBasketTimerEnabled: (val: boolean) => void;
    backToBasketTimerValue: number;
    setBackToBasketTimerValue: (val: number) => void;
    illegalZoneDefenseEnabled: boolean;
    setIllegalZoneDefenseEnabled: (val: boolean) => void;
    shotClockResetOffensiveRebound: number;
    setShotClockResetOffensiveRebound: (val: number) => void;
}

export const TimingViolationsSection: React.FC<TimingViolationsSectionProps> = ({
    shotClockEnabled, setShotClockEnabled,
    shotClockValue, setShotClockValue,
    backcourtTimerEnabled, setBackcourtTimerEnabled,
    backcourtTimerValue, setBackcourtTimerValue,
    offensiveThreeSecondEnabled, setOffensiveThreeSecondEnabled,
    offensiveThreeSecondValue, setOffensiveThreeSecondValue,
    defensiveThreeSecondEnabled, setDefensiveThreeSecondEnabled,
    defensiveThreeSecondValue, setDefensiveThreeSecondValue,
    inboundTimerEnabled, setInboundTimerEnabled,
    inboundTimerValue, setInboundTimerValue,
    backToBasketTimerEnabled, setBackToBasketTimerEnabled,
    backToBasketTimerValue, setBackToBasketTimerValue,
    illegalZoneDefenseEnabled, setIllegalZoneDefenseEnabled,
    shotClockResetOffensiveRebound, setShotClockResetOffensiveRebound
}) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <Timer size={16} className="text-emerald-400" />
                <h5 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Timing Violations</h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <div className="space-y-2">
                    <RuleToggle id="shotClockEnabled" value={shotClockEnabled} onChange={setShotClockEnabled} />
                    {shotClockEnabled && (
                        <div className="space-y-2 pl-4 border-l border-slate-800/50">
                            <RuleInput id="shotClockValue" value={shotClockValue} onChange={setShotClockValue} />
                            <RuleInput id="shotClockResetOffensiveRebound" value={shotClockResetOffensiveRebound} onChange={setShotClockResetOffensiveRebound} />
                        </div>
                    )}
                </div>
                <div className="space-y-2">
                    <RuleToggle id="backcourtTimerEnabled" value={backcourtTimerEnabled} onChange={setBackcourtTimerEnabled} />
                    {backcourtTimerEnabled && <RuleInput id="backcourtTimerValue" value={backcourtTimerValue} onChange={setBackcourtTimerValue} />}
                </div>
                <div className="space-y-2">
                    <RuleToggle id="offensiveThreeSecondEnabled" value={offensiveThreeSecondEnabled} onChange={setOffensiveThreeSecondEnabled} />
                    {offensiveThreeSecondEnabled && <RuleInput id="offensiveThreeSecondValue" value={offensiveThreeSecondValue} onChange={setOffensiveThreeSecondValue} />}
                </div>
                <div className="space-y-2">
                    <RuleToggle id="defensiveThreeSecondEnabled" value={defensiveThreeSecondEnabled} onChange={setDefensiveThreeSecondEnabled} />
                    {defensiveThreeSecondEnabled && <RuleInput id="defensiveThreeSecondValue" value={defensiveThreeSecondValue} onChange={setDefensiveThreeSecondValue} />}
                </div>
                <div className="space-y-2">
                    <RuleToggle id="inboundTimerEnabled" value={inboundTimerEnabled} onChange={setInboundTimerEnabled} />
                    {inboundTimerEnabled && <RuleInput id="inboundTimerValue" value={inboundTimerValue} onChange={setInboundTimerValue} />}
                </div>
                <div className="space-y-2">
                    <RuleToggle id="backToBasketTimerEnabled" value={backToBasketTimerEnabled} onChange={setBackToBasketTimerEnabled} />
                    {backToBasketTimerEnabled && <RuleInput id="backToBasketTimerValue" value={backToBasketTimerValue} onChange={setBackToBasketTimerValue} />}
                </div>
                <div className="space-y-2">
                    <RuleToggle id="illegalZoneDefenseEnabled" value={illegalZoneDefenseEnabled} onChange={setIllegalZoneDefenseEnabled} />
                </div>
            </div>
        </div>
    );
};
