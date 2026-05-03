import React from 'react';
import { Trophy, DollarSign, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import type { LeagueStats } from '../../../../types';
import { ruleValue } from './rulesDefaults';
import { useGame } from '../../../../store/GameContext';
import { normalizeDate } from '../../../../utils/helpers';

interface NBACupTabProps {
    rules: LeagueStats;
    setRule: <K extends keyof LeagueStats>(key: K, value: LeagueStats[K]) => void;
}

/** Returns whether we're still inside the commissioner grace window — i.e., the
 *  schedule has NOT yet been generated for the upcoming season. Aug 14 is the
 *  trigger date in autoResolvers (schedule_generation key). After that, the Cup
 *  group games are already baked into the schedule, so tournament toggles can only
 *  affect the FOLLOWING season. */
function useGracePeriod(seasonYear: number, currentDateRaw: string) {
    const currentIso = normalizeDate(currentDateRaw);
    const graceCloseIso = `${seasonYear - 1}-08-14`;
    return currentIso < graceCloseIso;
}

function ToggleRow({ label, description, value, onChange }: {
    label: string;
    description: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">{label}</span>
                <span className="text-[10px] text-slate-500 font-medium mt-1">{description}</span>
            </div>
            <button
                onClick={() => onChange(!value)}
                className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${value ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
            >
                {value ? 'ENABLED' : 'DISABLED'}
            </button>
        </div>
    );
}

function PrizeInput({ label, value, onChange, color }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    color: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{label}</span>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                <input
                    type="number"
                    value={value}
                    onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-7 pr-3 text-white font-mono text-sm py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    min="0"
                    step="10000"
                />
            </div>
            <span className="text-[9px] text-slate-600 font-medium text-center">per player</span>
        </div>
    );
}

export const NBACupTab: React.FC<NBACupTabProps> = ({ rules, setRule }) => {
    const { state } = useGame();
    const seasonYear = state.leagueStats.year ?? new Date().getFullYear() + 1;
    const inGrace = useGracePeriod(seasonYear, state.date ?? '');

    const inSeasonTournament = ruleValue(rules, 'inSeasonTournament') as boolean;
    const cupPrizePoolEnabled = (ruleValue(rules, 'cupPrizePoolEnabled') ?? true) as boolean;
    const cupPrizePoolAutoInflate = (ruleValue(rules, 'cupPrizePoolAutoInflate') ?? true) as boolean;
    const cupPrizeWinner = (ruleValue(rules, 'cupPrizeWinner') ?? 500_000) as number;
    const cupPrizeRunnerUp = (ruleValue(rules, 'cupPrizeRunnerUp') ?? 200_000) as number;
    const cupPrizeSemi = (ruleValue(rules, 'cupPrizeSemi') ?? 100_000) as number;
    const cupPrizeQuarter = (ruleValue(rules, 'cupPrizeQuarter') ?? 50_000) as number;

    return (
        <div className="space-y-12">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">NBA Cup</h1>
                <p className="text-xs text-slate-500 font-medium max-w-2xl">
                    Configure the in-season tournament — mid-season group play, knockout bracket, and player prize pool.
                </p>
            </div>

            {/* ── Grace period banner ───────────────────────────────────────── */}
            {inGrace ? (
                <div className="flex items-center gap-3 px-5 py-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                    <Clock size={16} className="text-emerald-400 shrink-0" />
                    <div>
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-widest">Grace Period Open</span>
                        <p className="text-[10px] text-emerald-500/80 font-medium mt-0.5">
                            Schedule not yet generated — changes here apply to the upcoming {seasonYear - 1}–{String(seasonYear).slice(2)} season
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 px-5 py-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                    <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                    <div>
                        <span className="text-xs font-bold text-amber-300 uppercase tracking-widest">Grace Period Closed</span>
                        <p className="text-[10px] text-amber-500/80 font-medium mt-0.5">
                            Schedule already locked for this season — any changes saved here take effect next season
                        </p>
                    </div>
                </div>
            )}

            {/* ── Tournament on/off ─────────────────────────────────────────── */}
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm space-y-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
                        <Trophy size={20} />
                    </div>
                    <h4 className="text-xl font-black text-white uppercase tracking-tight">Tournament</h4>
                </div>

                <div className="space-y-2">
                    <ToggleRow
                        label="In-Season Tournament"
                        description="The NBA Cup — mid-season group play and knockout bracket"
                        value={inSeasonTournament}
                        onChange={v => setRule('inSeasonTournament', v)}
                    />
                    {!inGrace && (
                        <div className="flex items-center gap-2 px-3">
                            <span className="text-[9px] font-bold text-amber-400/70 uppercase tracking-widest">Takes effect next season</span>
                        </div>
                    )}
                </div>

                {/* Future commissioner settings:
                    - Group stage size (number of groups per conference: 5 or 6 teams)
                    - Knockout bracket format (quarterfinal byes for group leaders)
                    - Cup final location (commissioner sets city / arena name)
                    - Broadcaster override (tag Cup nights TNT/ABC/NBC)
                    - Tiebreaker priority (head-to-head → point differential → coin flip)
                    - Wildcard selection method (best 2nd-place record vs. point differential)
                    - Cup game scheduling window (earliest/latest month for group games)
                    - Whether Cup games count toward regular-season standings (excludeFromRecord override)
                */}
            </div>

            {/* ── Prize Pool — only when tournament is on ─────────────────── */}
            {inSeasonTournament && (
                <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm space-y-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
                            <DollarSign size={20} />
                        </div>
                        <h4 className="text-xl font-black text-white uppercase tracking-tight">Prize Pool</h4>
                    </div>

                    <ToggleRow
                        label="Enable Prize Pool"
                        description="Distribute per-player cash bonuses to finishers — applied at the Cup Final, changes take effect any time before it"
                        value={cupPrizePoolEnabled}
                        onChange={v => setRule('cupPrizePoolEnabled', v)}
                    />

                    {cupPrizePoolEnabled && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <PrizeInput
                                    label="Winner"
                                    value={cupPrizeWinner}
                                    onChange={v => setRule('cupPrizeWinner', v)}
                                    color="text-amber-400"
                                />
                                <PrizeInput
                                    label="Runner-up"
                                    value={cupPrizeRunnerUp}
                                    onChange={v => setRule('cupPrizeRunnerUp', v)}
                                    color="text-slate-300"
                                />
                                <PrizeInput
                                    label="Semifinalist"
                                    value={cupPrizeSemi}
                                    onChange={v => setRule('cupPrizeSemi', v)}
                                    color="text-slate-400"
                                />
                                <PrizeInput
                                    label="Quarterfinalist"
                                    value={cupPrizeQuarter}
                                    onChange={v => setRule('cupPrizeQuarter', v)}
                                    color="text-slate-500"
                                />
                            </div>

                            {/* Auto-inflate: applied at offseason rollover — scales prize amounts
                                by the same inflation rate used for the salary cap that year. */}
                            <div className="flex items-center justify-between p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp size={14} className="text-indigo-400" />
                                        <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Auto-Inflate Prizes</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-medium mt-1">Scale prize amounts with the salary cap inflation rate each offseason</span>
                                </div>
                                <button
                                    onClick={() => setRule('cupPrizePoolAutoInflate', !cupPrizePoolAutoInflate)}
                                    className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${cupPrizePoolAutoInflate ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
                                >
                                    {cupPrizePoolAutoInflate ? 'ENABLED' : 'DISABLED'}
                                </button>
                            </div>

                            {/* Future prize pool settings:
                                - MVP bonus (additional payment on top of winner share)
                                - All-Tournament Team bonus (flat per-player amount for 5-man team)
                                - Broadcaster revenue share (% of Cup TV deal added to prize pool)
                                - Prize pool cap (max total payout as % of league luxury tax revenue)
                                - Group stage bonus (small per-win payment during group play)
                            */}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
