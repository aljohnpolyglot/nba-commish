import React from 'react';
import { Users, Info } from 'lucide-react';

const InfoTooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-flex items-center justify-center ml-1">
        <Info size={12} className="text-slate-500 cursor-default hover:text-indigo-400 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none shadow-xl border border-slate-700 text-center leading-relaxed">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
    </div>
);

export const EconomyTeamsSection = ({ props, wnbaMode = false }: { props: any; wnbaMode?: boolean }) => {
    const secondaryEnabled = wnbaMode ? props.developmentalContractsEnabled : props.twoWayContractsEnabled;
    const secondaryLimit = wnbaMode ? props.maxDevelopmentalPlayersPerTeam : props.maxTwoWayPlayersPerTeam;
    const setSecondaryEnabled = wnbaMode ? props.setDevelopmentalContractsEnabled : props.setTwoWayContractsEnabled;
    const setSecondaryLimit = wnbaMode ? props.setMaxDevelopmentalPlayersPerTeam : props.setMaxTwoWayPlayersPerTeam;
    const secondaryLabel = wnbaMode ? 'Developmental' : 'Two-Way';
    const totalRosterLimit = props.maxStandardPlayersPerTeam + secondaryLimit;

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center gap-2">
                <Users size={16} className="text-sky-400" />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Teams</h2>
            </div>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Allow {secondaryLabel} Contracts</span>
                        <InfoTooltip text={wnbaMode
                            ? 'Extra contracts for players with limited service. Compensation is paid as a weekly stipend plus active-game bonuses.'
                            : 'Contracts that allow players to play for both the NBA team and their G League affiliate.'}
                        />
                    </div>
                    <button
                        onClick={() => setSecondaryEnabled(!secondaryEnabled)}
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${secondaryEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${secondaryEnabled ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Allow Non-Guaranteed Contracts</span>
                        <InfoTooltip text="Training-camp deals that can be waived before the league's optional guarantee deadline. Roster limits and dates come from the saved league rules." />
                    </div>
                    <button
                        onClick={() => props.setNonGuaranteedContractsEnabled(!(props.nonGuaranteedContractsEnabled ?? true))}
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${(props.nonGuaranteedContractsEnabled ?? true) ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${(props.nonGuaranteedContractsEnabled ?? true) ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum Players Per Team</span>
                        <InfoTooltip text="The minimum number of players a team must have on their roster (not the number to start a regulation game)." />
                    </div>
                    <input 
                        type="number" 
                        min="1"
                        value={props.minPlayersPerTeam} 
                        onChange={(e) => props.setMinPlayersPerTeam(Math.max(1, parseInt(e.target.value)))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                {!secondaryEnabled ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Players Per Team</span>
                            <InfoTooltip text="The maximum number of players on standard NBA contracts." />
                        </div>
                        <input 
                            type="number" 
                            min={props.minPlayersPerTeam}
                            value={props.maxPlayersPerTeam} 
                            onChange={(e) => props.setMaxPlayersPerTeam(Math.max(props.minPlayersPerTeam, parseInt(e.target.value)))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Standard Contract Players</span>
                                    <InfoTooltip text="The maximum number of players on standard contracts." />
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400">Total: {totalRosterLimit}</span>
                            </div>
                            <input 
                                type="number" 
                                min={props.minPlayersPerTeam}
                                value={props.maxStandardPlayersPerTeam} 
                                onChange={(e) => props.setMaxStandardPlayersPerTeam(Math.max(props.minPlayersPerTeam, parseInt(e.target.value)))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max {secondaryLabel} Players</span>
                                    <InfoTooltip text={wnbaMode
                                        ? 'The maximum number of developmental players carried outside the standard roster.'
                                        : 'The maximum number of players on two-way contracts (spending time between the NBA and G League).'}
                                    />
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400">Total: {totalRosterLimit}</span>
                            </div>
                            <input
                                type="number"
                                min="0"
                                value={secondaryLimit}
                                onChange={(e) => setSecondaryLimit(Math.max(0, parseInt(e.target.value)))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        {wnbaMode && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <DevelopmentalNumberField
                                    label="Max Service Years"
                                    value={props.developmentalMaxServiceYears}
                                    min={0}
                                    onChange={props.setDevelopmentalMaxServiceYears}
                                    tooltip="Players above this number of completed WNBA service years are not eligible."
                                />
                                <DevelopmentalNumberField
                                    label="Max Active Games"
                                    value={props.developmentalMaxGames}
                                    min={0}
                                    onChange={props.setDevelopmentalMaxGames}
                                    tooltip="A developmental player becomes unavailable after reaching this active-game total."
                                />
                                <DevelopmentalNumberField
                                    label="Weekly Stipend (USD)"
                                    value={props.developmentalWeeklyStipendUSD}
                                    min={0}
                                    onChange={props.setDevelopmentalWeeklyStipendUSD}
                                    tooltip="Weekly stipend paid across the 20-week developmental contract period."
                                />
                                <DevelopmentalNumberField
                                    label="Active-Game Bonus (USD)"
                                    value={props.developmentalActiveGameBonusUSD}
                                    min={0}
                                    onChange={props.setDevelopmentalActiveGameBonusUSD}
                                    tooltip="Additional compensation paid for every active-game appearance."
                                />
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Training Camp Roster</span>
                                    <InfoTooltip text="Maximum players allowed on a roster during the offseason and training camp (before the regular season). NBA default is 21. Teams must cut to the regular season limit before games begin." />
                                </div>
                                <span className="text-[10px] font-bold text-amber-400">Preseason only</span>
                            </div>
                            <input
                                type="number"
                                min={totalRosterLimit}
                                value={props.maxTrainingCampRoster}
                                onChange={(e) => props.setMaxTrainingCampRoster(Math.max(totalRosterLimit, parseInt(e.target.value)))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[9px] text-slate-500 italic">
                                During the offseason and training camp, teams can carry up to {props.maxTrainingCampRoster} players. Rosters are trimmed to {totalRosterLimit} when the regular season starts.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const DevelopmentalNumberField = ({
    label,
    value,
    min,
    onChange,
    tooltip,
}: {
    label: string;
    value: number;
    min: number;
    onChange: (value: number) => void;
    tooltip: string;
}) => (
    <div className="flex flex-col gap-2">
        <div className="flex items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
            <InfoTooltip text={tooltip} />
        </div>
        <input
            type="number"
            min={min}
            value={value}
            onChange={event => onChange(Math.max(min, Number.parseInt(event.target.value, 10) || min))}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
        />
    </div>
);
