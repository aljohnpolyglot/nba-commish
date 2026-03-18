import React from 'react';
import { Flag } from 'lucide-react';
import { RuleToggle, RuleInput } from '../RuleControls';

interface CoachingStrategySectionProps {
    maxTimeouts: number;
    setMaxTimeouts: (val: number) => void;
    clutchTimeoutLimit: number;
    setClutchTimeoutLimit: (val: number) => void;
    coachChallenges: boolean;
    setCoachChallenges: (val: boolean) => void;
    maxCoachChallenges: number;
    setMaxCoachChallenges: (val: number) => void;
    challengeReimbursed: boolean;
    setChallengeReimbursed: (val: boolean) => void;
}

export const CoachingStrategySection: React.FC<CoachingStrategySectionProps> = ({
    maxTimeouts, setMaxTimeouts,
    clutchTimeoutLimit, setClutchTimeoutLimit,
    coachChallenges, setCoachChallenges,
    maxCoachChallenges, setMaxCoachChallenges,
    challengeReimbursed, setChallengeReimbursed
}) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <Flag size={16} className="text-amber-400" />
                <h5 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Coaching & Strategy</h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <RuleInput id="maxTimeouts" value={maxTimeouts} onChange={setMaxTimeouts} />
                <RuleInput id="clutchTimeoutLimit" value={clutchTimeoutLimit} onChange={setClutchTimeoutLimit} />
                <div className="space-y-2">
                    <RuleToggle id="coachChallenges" value={coachChallenges} onChange={setCoachChallenges} />
                    {coachChallenges && (
                        <div className="space-y-2 pl-4 border-l border-slate-800">
                            <RuleInput id="maxCoachChallenges" value={maxCoachChallenges} onChange={setMaxCoachChallenges} />
                            <RuleToggle id="challengeReimbursed" value={challengeReimbursed} onChange={setChallengeReimbursed} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
