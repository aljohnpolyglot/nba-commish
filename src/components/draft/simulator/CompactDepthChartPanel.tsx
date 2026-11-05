import React, { useMemo } from 'react';
import type { GameState, NBAPlayer } from '../../../types';
import { StarterService } from '../../../services/simulation/StarterService';
import { getCourtSlotLabels, getPlayersOnCourt } from '../../../services/simulation/courtSize';
import { getScoutedDisplayOverall } from '../../../utils/scoutingFuzz';
import { isOnRoster, resolveAnyTeam } from '../../../utils/teamLookup';

interface CompactDepthChartPanelProps {
  state: GameState;
  teamId: number;
}

export const CompactDepthChartPanel: React.FC<CompactDepthChartPanelProps> = ({ state, teamId }) => {
  const season = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const playersOnCourt = getPlayersOnCourt(state.leagueStats);
  const slots = getCourtSlotLabels(playersOnCourt);
  const rows = useMemo(() => {
    const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
    if (!team) return [];
    const roster = state.players.filter(player => player.tid === teamId && isOnRoster(player));
    const starters = StarterService.sortByPositionSlot(
      StarterService.getProjectedStarters(team, state.players, season, roster, true, playersOnCourt),
      season,
    );
    const starterIds = new Set(starters.map(player => player.internalId));
    const bench = roster
      .filter(player => !starterIds.has(player.internalId))
      .sort((left, right) => getScoutedDisplayOverall(state, right, season) - getScoutedDisplayOverall(state, left, season))
      .slice(0, playersOnCourt);
    return slots.map((slot, index) => ({ slot, starter: starters[index], backup: bench[index] }));
  }, [playersOnCourt, season, slots, state, teamId]);

  if (rows.length === 0) return <p className="text-xs text-white/40">No active roster available.</p>;

  const playerCell = (player: NBAPlayer | undefined) => player ? (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-bold text-white">{player.name}</div>
      <div className="text-[9px] font-black tabular-nums text-indigo-300">
        OVR {getScoutedDisplayOverall(state, player, season)}
      </div>
    </div>
  ) : <span className="text-[10px] text-rose-400">Open slot</span>;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-2 text-[8px] font-black uppercase tracking-widest text-white/35">
        <span>Pos</span><span>Starter</span><span>Next up</span>
      </div>
      {rows.map(({ slot, starter, backup }) => (
        <div key={slot} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg border border-white/5 bg-black/25 px-2 py-2">
          <span className="text-[10px] font-black text-amber-300">{slot}</span>
          {playerCell(starter)}
          {playerCell(backup)}
        </div>
      ))}
    </div>
  );
};
