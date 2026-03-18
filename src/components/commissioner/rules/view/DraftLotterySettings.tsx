import React from 'react';

interface DraftLotterySettingsProps {
    draftType: string;
    setDraftType: (val: string) => void;
}

export const DraftLotterySettings: React.FC<DraftLotterySettingsProps> = ({ draftType, setDraftType }) => {
    return (
        <div className="flex flex-col gap-3 p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Lottery System</span>
            <select 
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-4 px-4 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            >
                <optgroup label="NBA Standards">
                    <option value="nba2019">Modern (2019+) - Smoothed Odds</option>
                    <option value="nba1994">Classic (1994-2018) - Weighted Top 3 Picks</option>
                    <option value="nba1990">Early Weighted (1990-1993) - Weighted Top 3 Picks</option>
                    <option value="nba1987">Early Lottery (1987-1989) - Random Top 3 Picks</option>
                    <option value="nba1985">Original Lottery (1985-1986) - Pure Random Order</option>
                    <option value="nba1966">Coin Flip (1966-1984) - Top 2 Teams Battle for #1</option>
                    <option value="strict">Strict (Traditional) - Reverse Standings Order</option>
                </optgroup>
                <optgroup label="Other Leagues">
                    <option value="nhl2021">NHL (2021+) - Weighted Top 2 Picks</option>
                    <option value="nhl2017">NHL (2017-2020) - Weighted Top 3 Picks</option>
                    <option value="mlb2022">MLB (2022+) - Weighted Top 6 Picks</option>
                </optgroup>
                <optgroup label="Tournament Based">
                    <option value="goldPlan">Gold Plan (Points-Based) - Earned After Elimination</option>
                    <option value="bracket">Bracket (Lottery Tourney) - Non-Playoff Winner Gets #1</option>
                    <option value="ladder">Ladder (Consolation) - Best of the Rest Order</option>
                    <option value="tankBowl">Tank Bowl (Reverse Tourney) - Worst Team Loser Gets #1</option>
                </optgroup>
                <optgroup label="Creative & Chaotic">
                    <option value="wheel">The Wheel (30-Year Cycle) - Pre-determined Fixed Picks</option>
                    <option value="auction">Draft Auction (Bidding) - Buy Picks with Performance Dollars</option>
                    <option value="flat">Flat Odds (Equal Weight) - Identical Chance for All</option>
                    <option value="lateSurge">Late Surge (Incentivized) - Extra Balls for Late Wins</option>
                    <option value="combine">Combine (Physical/Mental) - Staff Drills Determine Order</option>
                    <option value="social">Social (Fan Engagement) - Weighted by Fan Interaction</option>
                    <option value="marble">Marble Race (Physics-Based) - Randomized Gravity Finish</option>
                    <option value="no_draft">No Draft - All Rookies Become Free Agents</option>
                </optgroup>
            </select>
            <p className="text-[10px] text-slate-500 font-medium mt-1">
                Select the mechanism used to determine the draft order for non-playoff teams.
            </p>
        </div>
    );
};
