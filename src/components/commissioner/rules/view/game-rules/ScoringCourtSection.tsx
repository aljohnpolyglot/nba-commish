import React from 'react';
import { Target } from 'lucide-react';
import { RuleToggle, RuleInput } from '../RuleControls';

interface ScoringCourtSectionProps {
    threePointLineEnabled: boolean;
    setThreePointLineEnabled: (val: boolean) => void;
    threePointLineDistance: number;
    setThreePointLineDistance: (val: number) => void;
    fourPointLine: boolean;
    setFourPointLine: (val: boolean) => void;
    fourPointLineDistance: number;
    setFourPointLineDistance: (val: number) => void;
    dunkValue: number;
    setDunkValue: (val: number) => void;
    fieldGoalValue: 1 | 2;
    setFieldGoalValue: (value: 1 | 2) => void;
    freeThrowsEnabled: boolean;
    setFreeThrowsEnabled: (value: boolean) => void;
    heaveRuleEnabled: boolean;
    setHeaveRuleEnabled: (val: boolean) => void;
    backcourtViolationEnabled: boolean;
    setBackcourtViolationEnabled: (val: boolean) => void;
    travelingEnabled: boolean;
    setTravelingEnabled: (val: boolean) => void;
    doubleDribbleEnabled: boolean;
    setDoubleDribbleEnabled: (val: boolean) => void;
    goaltendingEnabled: boolean;
    setGoaltendingEnabled: (val: boolean) => void;
    basketInterferenceEnabled: boolean;
    setBasketInterferenceEnabled: (val: boolean) => void;
    kickedBallEnabled: boolean;
    setKickedBallEnabled: (val: boolean) => void;
    outOfBoundsEnabled: boolean;
    setOutOfBoundsEnabled: (val: boolean) => void;
    freeThrowDistance: number;
    setFreeThrowDistance: (val: number) => void;
    rimHeight: number;
    setRimHeight: (val: number) => void;
    ballWeight: number;
    setBallWeight: (val: number) => void;
    courtLength: number;
    setCourtLength: (val: number) => void;
    baselineLength: number;
    setBaselineLength: (val: number) => void;
    keyWidth: number;
    setKeyWidth: (val: number) => void;
    cornerThrowInEnabled: boolean;
    setCornerThrowInEnabled: (val: boolean) => void;
}

export const ScoringCourtSection: React.FC<ScoringCourtSectionProps> = ({
    threePointLineEnabled, setThreePointLineEnabled,
    threePointLineDistance, setThreePointLineDistance,
    fourPointLine, setFourPointLine,
    fourPointLineDistance, setFourPointLineDistance,
    dunkValue, setDunkValue,
    fieldGoalValue, setFieldGoalValue,
    freeThrowsEnabled, setFreeThrowsEnabled,
    heaveRuleEnabled, setHeaveRuleEnabled,
    backcourtViolationEnabled, setBackcourtViolationEnabled,
    travelingEnabled, setTravelingEnabled,
    doubleDribbleEnabled, setDoubleDribbleEnabled,
    goaltendingEnabled, setGoaltendingEnabled,
    basketInterferenceEnabled, setBasketInterferenceEnabled,
    kickedBallEnabled, setKickedBallEnabled,
    outOfBoundsEnabled, setOutOfBoundsEnabled,
    freeThrowDistance, setFreeThrowDistance,
    rimHeight, setRimHeight,
    ballWeight, setBallWeight,
    courtLength, setCourtLength,
    baselineLength, setBaselineLength,
    keyWidth, setKeyWidth,
    cornerThrowInEnabled, setCornerThrowInEnabled
}) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <Target size={16} className="text-sky-400" />
                <h5 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Scoring & Court</h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <div className="space-y-2">
                    <div>
                        <div className="text-sm font-bold text-slate-200">Field Goal Value</div>
                        <div className="text-xs text-slate-500">Points awarded for an ordinary made basket.</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950/50 p-1">
                        {[1, 2].map(points => (
                            <button
                                key={points}
                                type="button"
                                onClick={() => setFieldGoalValue(points as 1 | 2)}
                                className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${fieldGoalValue === points ? 'bg-sky-500 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                {points} {points === 1 ? 'POINT' : 'POINTS'}
                            </button>
                        ))}
                    </div>
                </div>
                <RuleToggle id="freeThrowsEnabled" value={freeThrowsEnabled} onChange={setFreeThrowsEnabled} />
                <div className="space-y-2">
                    <RuleToggle id="threePointLineEnabled" value={threePointLineEnabled} onChange={setThreePointLineEnabled} />
                    {threePointLineEnabled && <RuleInput id="threePointLineDistance" value={threePointLineDistance} onChange={setThreePointLineDistance} />}
                </div>
                <div className="space-y-2">
                    <RuleToggle id="fourPointLine" value={fourPointLine} onChange={setFourPointLine} />
                    {fourPointLine && <RuleInput id="fourPointLineDistance" value={fourPointLineDistance} onChange={setFourPointLineDistance} />}
                </div>
                <div className="space-y-2">
                    <div>
                        <div className="text-sm font-bold text-slate-200">Dunk Value</div>
                        <div className="text-xs text-slate-500">Points awarded for a successful dunk.</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950/50 p-1">
                        {[1, 2, 3].map(points => (
                            <button
                                key={points}
                                type="button"
                                onClick={() => setDunkValue(points)}
                                className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${
                                    dunkValue === points
                                        ? 'bg-sky-500 text-white'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                {points} POINTS
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    <RuleToggle id="heaveRuleEnabled" value={heaveRuleEnabled} onChange={setHeaveRuleEnabled} />
                    {heaveRuleEnabled && (
                        <p className="text-xs leading-relaxed text-slate-500">
                            Eligible misses in the final three seconds of non-final regulation periods are charged to the team, not the shooter. Made heaves still count normally.
                        </p>
                    )}
                </div>
                {/* FT distance, rim height, ball weight, and court dimensions feed simulator stat knobs. */}
                <RuleInput id="freeThrowDistance" value={freeThrowDistance} onChange={setFreeThrowDistance} />
                <RuleInput id="rimHeight" value={rimHeight} onChange={setRimHeight} />
                <RuleInput id="ballWeight" value={ballWeight} onChange={setBallWeight} />
            </div>
            {/* Violations and geometry map into turnover, pace, efficiency, block, and shot-location knobs. */}
            <div className="pt-4 border-t border-slate-800/50 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <RuleInput id="courtLength" value={courtLength} onChange={setCourtLength} />
                <RuleInput id="baselineLength" value={baselineLength} onChange={setBaselineLength} />
                <RuleInput id="keyWidth" value={keyWidth} onChange={setKeyWidth} />
                <div className="space-y-2">
                    <RuleToggle id="outOfBoundsEnabled" value={outOfBoundsEnabled} onChange={setOutOfBoundsEnabled} />
                    {outOfBoundsEnabled && <RuleToggle id="cornerThrowInEnabled" value={cornerThrowInEnabled} onChange={setCornerThrowInEnabled} />}
                </div>
                <RuleToggle id="backcourtViolationEnabled" value={backcourtViolationEnabled} onChange={setBackcourtViolationEnabled} />
                <RuleToggle id="travelingEnabled" value={travelingEnabled} onChange={setTravelingEnabled} />
                <RuleToggle id="doubleDribbleEnabled" value={doubleDribbleEnabled} onChange={setDoubleDribbleEnabled} />
                <RuleToggle id="goaltendingEnabled" value={goaltendingEnabled} onChange={setGoaltendingEnabled} />
                <RuleToggle id="basketInterferenceEnabled" value={basketInterferenceEnabled} onChange={setBasketInterferenceEnabled} />
                <RuleToggle id="kickedBallEnabled" value={kickedBallEnabled} onChange={setKickedBallEnabled} />
            </div>
        </div>
    );
};
