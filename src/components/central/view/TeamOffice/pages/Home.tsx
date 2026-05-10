import React from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { calculateTeamStrength } from '../../../../../utils/playerRatings';
import { NBATeam, NBAPlayer } from '../../../../../types';
import { getActiveLeagueTeams, isOnRoster } from '../../../../../utils/teamLookup';

interface HomeProps {
  onSelectTeam: (teamId: number) => void;
  /** When provided, these override the game-state teams/players — used by the setup-flow franchise picker, which runs before state.teams is populated. */
  teams?: NBATeam[];
  players?: NBAPlayer[];
  /** Force the "picker mode" header/copy regardless of gameMode. */
  pickerMode?: boolean;
  /** Override for userTid highlighting in prop-driven mode. */
  selectedTid?: number | null;
  /** Header title override — defaults to "Select Franchise" / "Pick Your Franchise". */
  title?: string;
  /** Header subtitle override — defaults to the front-office copy. */
  subtitle?: string;
  /** Optional team ids to visually call out in picker mode. */
  highlightedTeamIds?: number[];
  /** Label for highlighted teams. */
  highlightedLabel?: string;
}

export function Home({ onSelectTeam, teams: teamsProp, players: playersProp, pickerMode, selectedTid, title, subtitle, highlightedTeamIds, highlightedLabel }: HomeProps) {
  const { state, dispatchAction } = useGame();
  // Non-NBA GMs (Endesa/Euroleague) see their own league's teams here, not NBA.
  // teamsProp override (setup-flow franchise picker) wins over the auto-resolution.
  const teams = teamsProp ?? getActiveLeagueTeams(state);
  const players = playersProp ?? state.players ?? [];
  const isGM = state.gameMode === 'gm';
  const userTid = pickerMode ? (selectedTid ?? null) : (isGM ? state.userTeamId ?? null : null);
  const needsTeamPick = pickerMode || (isGM && state.userTeamId == null);
  const highlightedSet = new Set(highlightedTeamIds ?? []);

  // Wrap the select handler — when the GM is picking their franchise for the first time,
  // commit the choice to state.userTeamId so every other system (TradeFinder, AI gating,
  // TeamPickerGrid, etc.) knows which team is theirs.
  const handleSelect = (teamId: number) => {
    if (needsTeamPick && !pickerMode) {
      dispatchAction({ type: 'UPDATE_STATE', payload: { userTeamId: teamId } } as any);
    }
    onSelectTeam(teamId);
  };

  // In GM mode the user's team is hoisted to the front of the grid and glows by default.
  const sortedTeams = [...teams].sort((a, b) => {
    if (userTid != null) {
      if (a.id === userTid) return -1;
      if (b.id === userTid) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      <div className="flex justify-between items-end border-b border-[#30363d] pb-4">
        <div>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter text-[#e6edf3]">
            {title ?? (needsTeamPick ? 'Pick Your Franchise' : 'Select Franchise')}
          </h1>
          <p className="text-[#8b949e] font-medium mt-1">
            {subtitle ?? (needsTeamPick
              ? 'Welcome, GM. Choose the team you want to build. This locks in who signs you to that five-year contract.'
              : 'Choose a team to manage their front office operations.')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {sortedTeams.map((team) => {
          const roster = players.filter(p => p.tid === team.id && isOnRoster(p));
          const teamOverall = calculateTeamStrength(team.id, players);
          const teamColor = team.colors?.[0] || '#552583';
          const isUserTeam = team.id === userTid;
          const isHighlighted = highlightedSet.has(team.id);

          return (
            <button
              key={team.id}
              onClick={() => handleSelect(team.id)}
              className={cn(
                "group relative flex flex-col items-center p-4 rounded-xl border transition-all duration-300 overflow-hidden text-left",
                isUserTeam
                  ? "bg-[#1a1a2e]/80 border-2"
                  : isHighlighted
                    ? "bg-[#161b22]/70 border-[#c0841a] hover:border-[#fbbf24] hover:bg-[#1b2130]"
                  : "bg-[#161b22]/40 border-[#30363d] hover:border-[#8b949e] hover:bg-[#161b22]/80"
              )}
              style={isUserTeam
                ? { borderColor: teamColor, boxShadow: `0 0 24px ${teamColor}80` }
                : isHighlighted
                  ? { boxShadow: '0 0 20px rgba(251, 191, 36, 0.16)' }
                  : undefined}
            >
              {/* Background Glow — always on for user team, hover-only for others */}
              <div
                className={cn(
                  "absolute inset-0 transition-opacity duration-500 blur-xl",
                  isUserTeam ? "opacity-20" : "opacity-0 group-hover:opacity-10"
                )}
                style={{ backgroundColor: teamColor }}
              />
              {isUserTeam && (
                <span className="absolute top-1.5 right-1.5 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ backgroundColor: teamColor, color: '#fff' }}>
                  Your Team
                </span>
              )}
              {!isUserTeam && isHighlighted && (
                <span className="absolute top-1.5 right-1.5 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                  {highlightedLabel ?? 'Featured'}
                </span>
              )}

              <div className="h-20 w-20 mb-4 relative z-10 flex items-center justify-center">
                {team.logoUrl ? (
                  <img
                    src={team.logoUrl}
                    alt={team.name}
                    className="w-full h-full object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#21262d] flex items-center justify-center font-black text-xl text-[#8b949e]">
                    {team.abbrev}
                  </div>
                )}
              </div>

              <div className="w-full text-center relative z-10">
                <h3 className="font-black uppercase tracking-tight text-sm text-[#e6edf3] leading-tight mb-1">
                  {team.region && !team.name.includes(team.region) ? `${team.region} ${team.name}` : team.name}
                </h3>
                <div className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">
                  {team.wins}-{team.losses} | {roster.length} Players
                </div>
                {isHighlighted && (
                  <div className="mt-1 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
                    Euroleague sister club
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-[#30363d]/50 flex justify-between items-center w-full">
                  <span className="text-[9px] text-[#8b949e] uppercase truncate mr-2">Team OVR</span>
                  <span className="text-[10px] font-black text-[#FDB927]">{teamOverall}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
