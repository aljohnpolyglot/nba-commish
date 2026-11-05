import React from 'react';
import { Calendar, Minus, Plus } from 'lucide-react';
import {
    getBalancedFirstRoundByes,
    getMinimumPlayoffField,
    getOpeningRoundGameCount,
    getPlayoffBracketCapacity,
    isBalancedPlayoffField,
    MAX_PLAYOFF_ROUNDS,
    MIN_PLAYOFF_ROUNDS,
} from '../../../../utils/playoffFormat';
import type { LeagueCalendar } from '../../../../types';
import { SeasonCalendarSection } from './SeasonCalendarSection';

// NBA-standard maximums — users may go LOWER but never higher.
// Capping the upper bound prevents calendar overflow (draft slides into July,
// FA collides with playoffs, etc.) which is the root cause of the offseason
// pipeline bugs.
export const NBA_MAX_GAMES_PER_SEASON  = 82;
export const NBA_MAX_DIVISION_GAMES    = 16; // 4 games × 4 division opponents
export const NBA_MAX_CONFERENCE_GAMES  = 36; // 4×6 + 3×4 vs non-div same-conf
export const NBA_MAX_PLAYOFF_SERIES    = 7;  // best-of-7

interface FormatTabProps {
    playoffsEnabled: boolean;
    setPlayoffsEnabled: (val: boolean) => void;
    playIn: boolean;
    setPlayIn: (val: boolean) => void;
    playoffFormat: (number | string)[];
    updatePlayoffFormat: (index: number, value: string) => void;
    addPlayoffRound: () => void;
    removePlayoffRound: () => void;
    numPlayoffTeams: number;
    setNumPlayoffTeams: (val: number) => void;
    numPlayoffByes: number;
    setNumPlayoffByes: (val: number) => void;
    playoffsByConf: boolean;
    setPlayoffsByConf: (val: boolean) => void;
    minGamesRequirement: number | string;
    setMinGamesRequirement: (val: string) => void;
    customScheduleEnabled: boolean;
    setCustomScheduleEnabled: (val: boolean) => void;
    leagueCalendar: LeagueCalendar;
    setLeagueCalendar: (val: LeagueCalendar) => void;
    gamesPerSeason: number;
    setGamesPerSeason: (val: number) => void;
    divisionGames: number;
    setDivisionGames: (val: number) => void;
    conferenceGames: number;
    setConferenceGames: (val: number) => void;
    preseasonGamesPerTeam: number;
    setPreseasonGamesPerTeam: (val: number) => void;
    jerseyPatchProgramEnabled: boolean;
    setJerseyPatchProgramEnabled: (val: boolean) => void;
    uiMode?: string;
    seasonYear: number;
    inSeasonTournament: boolean;
    allStarGameEnabled: boolean;
    summerLeagueEnabled: boolean;
}

export const FormatTab: React.FC<FormatTabProps> = ({
    playoffsEnabled,
    setPlayoffsEnabled,
    playIn,
    setPlayIn,
    playoffFormat,
    updatePlayoffFormat,
    addPlayoffRound,
    removePlayoffRound,
    numPlayoffTeams,
    setNumPlayoffTeams,
    numPlayoffByes,
    setNumPlayoffByes,
    playoffsByConf,
    setPlayoffsByConf,
    minGamesRequirement,
    setMinGamesRequirement,
    customScheduleEnabled,
    setCustomScheduleEnabled,
    leagueCalendar,
    setLeagueCalendar,
    gamesPerSeason,
    setGamesPerSeason,
    divisionGames,
    setDivisionGames,
    conferenceGames,
    setConferenceGames,
    preseasonGamesPerTeam,
    setPreseasonGamesPerTeam,
    jerseyPatchProgramEnabled,
    setJerseyPatchProgramEnabled,
    uiMode,
    seasonYear,
    inSeasonTournament,
    allStarGameEnabled,
    summerLeagueEnabled,
}) => {
    const isNbaMode = uiMode === 'nba';
    const maxGames = isNbaMode ? NBA_MAX_GAMES_PER_SEASON : 200;
    const maxDivisionGames = isNbaMode ? NBA_MAX_DIVISION_GAMES : gamesPerSeason;
    const maxConferenceGames = isNbaMode ? NBA_MAX_CONFERENCE_GAMES : gamesPerSeason;
    const playoffCapacity = getPlayoffBracketCapacity(playoffFormat.length);
    const minimumPlayoffField = getMinimumPlayoffField(playoffFormat.length, playoffsByConf);
    const balancedByes = getBalancedFirstRoundByes(numPlayoffTeams, playoffFormat.length);
    const openingRoundGames = getOpeningRoundGameCount(numPlayoffTeams, numPlayoffByes);
    const balancedField = isBalancedPlayoffField(numPlayoffTeams, numPlayoffByes, playoffFormat.length);
    const handlePlayoffTeamsChange = (value: number) => {
        const requested = Math.min(playoffCapacity, Math.max(minimumPlayoffField, Math.round(value) || minimumPlayoffField));
        const teams = playoffsByConf && requested % 2 !== 0 ? requested - 1 : requested;
        setNumPlayoffTeams(teams);
        setNumPlayoffByes(getBalancedFirstRoundByes(teams, playoffFormat.length));
    };
    const handlePlayoffByesChange = (value: number) => {
        const maximumByes = playoffCapacity - minimumPlayoffField;
        const requested = Math.min(maximumByes, Math.max(0, Math.round(value) || 0));
        const byes = playoffsByConf && requested % 2 !== 0 ? requested - 1 : requested;
        setNumPlayoffByes(byes);
        setNumPlayoffTeams(playoffCapacity - byes);
    };
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-5 sm:p-8 rounded-[2.5rem] backdrop-blur-sm space-y-8">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
                    <Calendar size={20} />
                </div>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">Season Format</h4>
            </div>
            
            <div className="flex flex-col gap-4 p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Playoffs</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1">
                        {playoffsEnabled ? 'Use a postseason bracket to decide the league champion' : 'Best regular-season record wins the league title'}
                    </span>
                </div>
                <button
                    type="button"
                    aria-pressed={playoffsEnabled}
                    onClick={() => setPlayoffsEnabled(!playoffsEnabled)}
                    className={`w-full text-xs font-black px-4 py-2 rounded-xl transition-all sm:w-auto ${playoffsEnabled ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}
                >
                    {playoffsEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
            </div>

            <div className={`flex flex-col gap-4 p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50 sm:flex-row sm:items-center sm:justify-between ${playoffsEnabled ? '' : 'opacity-50'}`}>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Play-In Tournament</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1">
                        {!playoffsEnabled ? 'Requires playoffs' : playoffsByConf ? 'Teams 7-10 compete for final playoff seeds' : 'Conference seeding is required for this Play-In format'}
                    </span>
                </div>
                <button
                    type="button"
                    aria-pressed={playIn}
                    onClick={() => setPlayIn(!playIn)}
                    disabled={!playoffsEnabled || !playoffsByConf}
                    className={`w-full text-xs font-black px-4 py-2 rounded-xl transition-all sm:w-auto disabled:cursor-not-allowed ${playIn && playoffsEnabled && playoffsByConf ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
                >
                    {playIn && playoffsEnabled && playoffsByConf ? 'ENABLED' : 'DISABLED'}
                </button>
            </div>

            <div className={`p-5 sm:p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50 space-y-4 ${playoffsEnabled ? '' : 'opacity-50'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Playoff Rounds & Series Length</span>
                        <p className="mt-1 text-[10px] text-slate-500 font-medium">
                            {playoffsEnabled ? `${playoffFormat.length} round(s) · field capacity ${playoffCapacity} · max best-of-${NBA_MAX_PLAYOFF_SERIES}` : 'Requires playoffs'}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={removePlayoffRound}
                            disabled={!playoffsEnabled || playoffFormat.length <= MIN_PLAYOFF_ROUNDS}
                            className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-[10px] font-black uppercase text-slate-300 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <Minus size={14} /> Remove round
                        </button>
                        <button
                            type="button"
                            onClick={addPlayoffRound}
                            disabled={!playoffsEnabled || playoffFormat.length >= MAX_PLAYOFF_ROUNDS}
                            className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 text-[10px] font-black uppercase text-indigo-200 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <Plus size={14} /> Add round
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {playoffFormat.map((games, idx) => (
                        <div key={idx} className="flex flex-col gap-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase text-center">Round {idx+1}</span>
                            <select
                                value={games}
                                onChange={(e) => updatePlayoffFormat(idx, e.target.value)}
                                disabled={!playoffsEnabled}
                                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 text-center font-mono text-lg text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed"
                            >
                                {[1, 3, 5, 7].map(value => (
                                    <option key={value} value={value}>Best of {value}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            </div>

            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${playoffsEnabled ? '' : 'opacity-50'}`}>
                <label className="flex flex-col gap-2 rounded-2xl border border-slate-800/50 bg-slate-800/40 p-5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Playoff Teams</span>
                    <input
                        type="number"
                        min={minimumPlayoffField}
                        max={playoffCapacity}
                        value={numPlayoffTeams}
                        onChange={event => handlePlayoffTeamsChange(Number(event.target.value))}
                        disabled={!playoffsEnabled}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 text-center font-mono text-lg text-white focus:border-indigo-500 focus:outline-none"
                    />
                </label>
                <label className="flex flex-col gap-2 rounded-2xl border border-slate-800/50 bg-slate-800/40 p-5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">First-Round Byes</span>
                    <input
                        type="number"
                        min="0"
                        max={Math.max(0, playoffCapacity - minimumPlayoffField)}
                        value={numPlayoffByes}
                        onChange={event => handlePlayoffByesChange(Number(event.target.value))}
                        disabled={!playoffsEnabled}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 text-center font-mono text-lg text-white focus:border-indigo-500 focus:outline-none"
                    />
                </label>
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800/50 bg-slate-800/40 p-5">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Seeding</span>
                        <p className="mt-2 text-xs font-bold text-slate-200">{playoffsByConf ? 'By conference' : 'League-wide'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setPlayoffsByConf(!playoffsByConf)}
                        disabled={!playoffsEnabled}
                        className="w-full rounded-xl bg-slate-800 px-3 py-2 text-[10px] font-black uppercase text-slate-300 disabled:cursor-not-allowed"
                    >
                        Switch seeding
                    </button>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-xs sm:col-span-3 ${balancedField ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-200'}`}>
                    {balancedField
                        ? `${numPlayoffTeams} teams · ${numPlayoffByes} opening-round byes · ${openingRoundGames} opening game(s) · ${playoffCapacity / 2} teams in the next round.`
                        : `Unbalanced field. Use ${balancedByes} first-round byes for ${numPlayoffTeams} teams across ${playoffFormat.length} rounds.`}
                    {!balancedField && (
                        <button
                            type="button"
                            onClick={() => setNumPlayoffByes(balancedByes)}
                            disabled={!playoffsEnabled}
                            className="ml-2 font-black underline decoration-amber-400/60 underline-offset-2 disabled:opacity-40"
                        >
                            Balance bracket
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Schedule</span>
                    <button
                        type="button"
                        onClick={() => setCustomScheduleEnabled(!customScheduleEnabled)}
                        className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${customScheduleEnabled ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
                    >
                        {customScheduleEnabled ? 'CUSTOM' : 'STANDARD'}
                    </button>
                </div>
                {/* Derived non-conference games: gamesPerSeason - division - conference.
                    Negative ⇒ user has over-allocated; show a red callout so they can fix
                    before save (handleSaveConfig clamps as a safety net). */}
                {(() => {
                    const interConf = gamesPerSeason - divisionGames - conferenceGames;
                    const interConfClass = interConf < 0
                        ? 'text-rose-400'
                        : interConf > 30 ? 'text-amber-400' : 'text-emerald-400';
                    return (
                        <p className="text-[10px] text-slate-500 font-medium">
                            {isNbaMode ? 'NBA standard: 82 / 16 / 36.' : 'Imported league schedule.'}
                            <span className="ml-2">Inter-conference games: <strong className={interConfClass}>{interConf}</strong></span>
                            {interConf < 0 && <span className="ml-2 text-rose-400 font-bold">⚠ Division + Conference exceeds total games</span>}
                        </p>
                    );
                })()}
                <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${customScheduleEnabled ? '' : 'opacity-50'}`}>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Preseason Games</span>
                        <input
                            type="number"
                            value={preseasonGamesPerTeam}
                            onChange={(e) => setPreseasonGamesPerTeam(parseInt(e.target.value, 10))}
                            disabled={!customScheduleEnabled}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="0"
                            max="20"
                        />
                        <span className="text-[9px] text-slate-600 font-medium text-center">Per team · exhibition only</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Games Per Season</span>
                        <input
                            type="number"
                            value={gamesPerSeason}
                            onChange={(e) => setGamesPerSeason(parseInt(e.target.value, 10))}
                            disabled={!customScheduleEnabled}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="1"
                            max={maxGames}
                        />
                        <span className="text-[9px] text-slate-600 font-medium text-center">Max {maxGames}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Division Games</span>
                        <input
                            type="number"
                            value={divisionGames}
                            onChange={(e) => setDivisionGames(parseInt(e.target.value, 10))}
                            disabled={!customScheduleEnabled}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="0"
                            max={Math.min(maxDivisionGames, gamesPerSeason)}
                        />
                        <span className="text-[9px] text-slate-600 font-medium text-center">Max {maxDivisionGames}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Conference Games</span>
                        <input
                            type="number"
                            value={conferenceGames}
                            onChange={(e) => setConferenceGames(parseInt(e.target.value, 10))}
                            disabled={!customScheduleEnabled}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="0"
                            max={Math.min(maxConferenceGames, Math.max(0, gamesPerSeason - divisionGames))}
                        />
                        <span className="text-[9px] text-slate-600 font-medium text-center">Max {maxConferenceGames}</span>
                    </div>
                </div>
            </div>

            <SeasonCalendarSection
                calendar={leagueCalendar}
                onChange={setLeagueCalendar}
                seasonYear={seasonYear}
                gamesPerSeason={gamesPerSeason}
                playInEnabled={playIn}
                cupEnabled={inSeasonTournament}
                allStarEnabled={allStarGameEnabled}
                summerLeagueEnabled={summerLeagueEnabled}
            />

            <div className="flex flex-col gap-4 p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Jersey Patch Program</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1">
                        Allow teams to negotiate jersey patch sponsorships
                    </span>
                </div>
                <button
                    type="button"
                    aria-pressed={jerseyPatchProgramEnabled}
                    onClick={() => setJerseyPatchProgramEnabled(!jerseyPatchProgramEnabled)}
                    className={`w-full text-xs font-black px-4 py-2 rounded-xl transition-all sm:w-auto ${jerseyPatchProgramEnabled ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}
                >
                    {jerseyPatchProgramEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
            </div>

            <div className="flex items-center justify-between p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Minimum Games Requirement</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1">Required games for major award eligibility</span>
                </div>
                <div className="flex items-center gap-3">
                    <input 
                        type="number" 
                        value={minGamesRequirement} 
                        onChange={(e) => setMinGamesRequirement(e.target.value)}
                        className="w-16 bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-2 focus:outline-none focus:border-indigo-500"
                        min="0"
                        max={gamesPerSeason}
                    />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">GAMES</span>
                </div>
            </div>
        </div>
    );
};
