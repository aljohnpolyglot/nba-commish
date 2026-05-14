import React from 'react';
import { ArrowLeftRight, Info, Lock } from 'lucide-react';
import type { LeagueStats } from '../../../../types';
import { EURO_ISOLATED_DEFAULTS } from '../../../../constants';

const InfoTooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-flex items-center justify-center ml-1">
        <Info size={12} className="text-slate-500 cursor-help hover:text-indigo-400 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none shadow-xl border border-slate-700 text-center leading-relaxed">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
    </div>
);

type TM = NonNullable<LeagueStats['transferMarket']>;

interface Props {
    transferMarket: TM | undefined;
    setTransferMarket: (tm: TM) => void;
    /** Window-Dates lock once a save is active. False during CommissionerSetup, true during in-save edits. */
    windowDatesLocked: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMMDD(s: string): string {
    const [m, d] = s.split('-').map(n => parseInt(n, 10));
    if (!m || !d) return s;
    return `${MONTH_NAMES[m - 1]} ${d}`;
}

function validMMDD(s: string): boolean {
    return /^\d{2}-\d{2}$/.test(s);
}

export const TransferMarketSection: React.FC<Props> = ({ transferMarket, setTransferMarket, windowDatesLocked }) => {
    const tm: TM = transferMarket ?? (EURO_ISOLATED_DEFAULTS.transferMarket as TM);

    const update = <K extends keyof TM>(key: K, value: TM[K]) => {
        setTransferMarket({ ...tm, [key]: value });
    };

    const summerSpan = `${fmtMMDD(tm.summerStart)} – ${fmtMMDD(tm.summerEnd)}`;
    const winterSpan = `${fmtMMDD(tm.winterStart)} – ${fmtMMDD(tm.winterEnd)}`;

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ArrowLeftRight size={16} className="text-amber-400" />
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Transfer Market</h2>
                </div>
                <button
                    onClick={() => update('enabled', !tm.enabled)}
                    className={`w-10 h-5 rounded-full transition-all duration-200 relative ${tm.enabled ? 'bg-amber-500' : 'bg-slate-700'}`}
                    aria-label="Toggle transfer market"
                >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${tm.enabled ? 'left-5' : 'left-0.5'}`} />
                </button>
            </div>
            <p className="text-[10px] text-slate-500 -mt-2">
                Player auctions, release-clause buyouts, and cross-league bids. Disable for pure-NBA saves.
            </p>

            {tm.enabled && (
                <>
                    {/* ─── Windows ───────────────────────────────────────── */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">Transfer Windows</h3>
                            {windowDatesLocked && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase">
                                    <Lock size={10} /> Locked
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-500">
                            Listings + bids only open inside these calendar spans. Active auctions resolve normally even after a window closes.
                        </p>

                        {/* Summer window */}
                        <div className="bg-slate-900/60 rounded-2xl p-4 border border-amber-500/20 space-y-3">
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider">Summer Window</span>
                                <span className="font-black text-amber-300">{summerSpan}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Start (MM-DD)</span>
                                    <input
                                        type="text"
                                        value={tm.summerStart}
                                        disabled={windowDatesLocked}
                                        onChange={e => validMMDD(e.target.value) && update('summerStart', e.target.value)}
                                        placeholder="07-01"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[11px] py-1.5 px-3 focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">End (MM-DD)</span>
                                    <input
                                        type="text"
                                        value={tm.summerEnd}
                                        disabled={windowDatesLocked}
                                        onChange={e => validMMDD(e.target.value) && update('summerEnd', e.target.value)}
                                        placeholder="09-30"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[11px] py-1.5 px-3 focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Winter window */}
                        <div className="bg-slate-900/60 rounded-2xl p-4 border border-blue-500/20 space-y-3">
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider">Winter Window</span>
                                <span className="font-black text-blue-300">{winterSpan}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Start (MM-DD)</span>
                                    <input
                                        type="text"
                                        value={tm.winterStart}
                                        disabled={windowDatesLocked}
                                        onChange={e => validMMDD(e.target.value) && update('winterStart', e.target.value)}
                                        placeholder="01-01"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[11px] py-1.5 px-3 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">End (MM-DD)</span>
                                    <input
                                        type="text"
                                        value={tm.winterEnd}
                                        disabled={windowDatesLocked}
                                        onChange={e => validMMDD(e.target.value) && update('winterEnd', e.target.value)}
                                        placeholder="01-31"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[11px] py-1.5 px-3 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* ─── Auction Duration ──────────────────────────────── */}
                    <div className="pt-4 border-t border-slate-800/50 space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-bold uppercase tracking-wider flex items-center">
                                Auction Duration
                                <InfoTooltip text="How long a listing stays open before the highest bid auto-resolves. Shorter = more drama, longer = more bid iterations." />
                            </span>
                            <span className="font-black text-emerald-300">{tm.auctionDays} days</span>
                        </div>
                        <input
                            type="range"
                            min={3}
                            max={14}
                            step={1}
                            value={tm.auctionDays}
                            onChange={e => update('auctionDays', parseInt(e.target.value, 10))}
                            className="w-full accent-emerald-500"
                        />
                    </div>

                    {/* ─── Tier Gating + Bidder Pool ─────────────────────── */}
                    <div className="pt-4 border-t border-slate-800/50 space-y-3">
                        <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Bidder Eligibility</h3>

                        <div className="flex items-center justify-between bg-slate-900/40 rounded-xl px-3 py-2.5">
                            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center">
                                Tier Gating
                                <InfoTooltip text="When enabled, bidders must have cash and wage-headroom for the player. Prevents lowball spam from broke clubs." />
                            </span>
                            <button
                                onClick={() => update('tierGating', !tm.tierGating)}
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${tm.tierGating ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${tm.tierGating ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center">
                                Bidder Pool
                                <InfoTooltip text="Which leagues may participate as bidders on your listings. Affects pool size and offer realism." />
                            </span>
                            <select
                                value={tm.bidderPool}
                                onChange={e => update('bidderPool', e.target.value as TM['bidderPool'])}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[11px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                            >
                                <option value="euro">Euro Only (Euroleague + Endesa)</option>
                                <option value="plus_nba">Euro + NBA</option>
                                <option value="all">All Leagues (+ WNBA / CBA / PBA / NBL)</option>
                            </select>
                        </div>
                    </div>

                    {/* ─── Release Clause Default ────────────────────────── */}
                    <div className="pt-4 border-t border-slate-800/50 space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-bold uppercase tracking-wider flex items-center">
                                Default Release Clause
                                <InfoTooltip text="Start-value for the release-clause slider when signing a new contract. Higher = harder to poach, but player demands more wage." />
                            </span>
                            <span className="font-black text-purple-300">{tm.releaseClauseDefaultMult}× total wage</span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={10}
                            step={1}
                            value={tm.releaseClauseDefaultMult}
                            onChange={e => update('releaseClauseDefaultMult', parseInt(e.target.value, 10))}
                            className="w-full accent-purple-500"
                        />
                        <p className="text-[9px] text-slate-500 italic">
                            Real Madrid–style clause: any club that pays this amount can sign your player without negotiation. Negotiable per-contract in the Signing Modal.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};
