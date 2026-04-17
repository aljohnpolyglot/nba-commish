import React, { useState, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { X, ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { NBAPlayer, NBATeam, DraftPick } from '../../types';
import { TradeSummaryModal } from './TradeSummaryModal';
import { TeamDropdown } from '../shared/TeamDropdown';
import { PlayerPortrait } from '../shared/PlayerPortrait';

interface TradeMachineModalProps {
  onClose: () => void;
  onConfirm: (payload: { teamAId: number, teamBId: number, teamAPlayers: string[], teamBPlayers: string[], teamAPicks: number[], teamBPicks: number[] }) => void;
  // Optional pre-load state (from Trade Finder "Manage Trade")
  initialTeamAId?: number;
  initialTeamBId?: number;
  initialTeamAPlayerIds?: string[];
  initialTeamBPlayerIds?: string[];
  initialTeamAPickDpids?: number[];
  initialTeamBPickDpids?: number[];
}

// HELPER: The "Eyebrow" Pill for outgoing players
const OutgoingPill = ({ player, onRemove }: { player: NBAPlayer, onRemove: () => void }) => (
  <div className="flex items-center gap-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-full pl-1 pr-2 py-1 transition-colors shadow-sm">
    {player.imgURL ? <img src={player.imgURL} alt={player.name} className="w-6 h-6 rounded-full object-cover bg-slate-800" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-400">{player.name[0]}</span>}
    <span className="text-xs font-bold text-white whitespace-nowrap">
      {player.name.charAt(0)}. {player.name.split(' ').slice(1).join(' ')}
    </span>
    <button onClick={onRemove} className="w-4 h-4 rounded-full bg-slate-500 hover:bg-rose-500 flex items-center justify-center text-white transition-colors">
      <X size={10} />
    </button>
  </div>
);

// HELPER: PlayerRow component
const PlayerRow = ({ player, isSelected, onToggle, formatContract, teams, disabled, currentSeason }: {
  player: NBAPlayer & { isIncoming?: boolean };
  isSelected: boolean;
  onToggle: () => void;
  formatContract: (amount: number) => string;
  teams: NBATeam[];
  disabled: boolean;
  currentSeason?: number;
}) => {
  const team = teams.find(t => t.id === player.tid);
  // Use current season stats if player has played (gp > 0), otherwise fall back to last season
  const currentSeasonStats = player.stats?.find(s => s.season === currentSeason);
  const seasonStats = (currentSeasonStats && (currentSeasonStats.gp ?? 0) > 0)
    ? currentSeasonStats
    : (player.stats?.filter(s => (s.gp ?? 0) > 0).at(-1) ?? currentSeasonStats);
  const gp = seasonStats?.gp || 0;
  const ppg = gp > 0 ? ((seasonStats!.pts ?? 0) / gp).toFixed(1) : '—';
  const rpg = gp > 0 ? ((seasonStats!.trb ?? 0) / gp).toFixed(1) : '—';
  const apg = gp > 0 ? ((seasonStats!.ast ?? 0) / gp).toFixed(1) : '—';

  return (
    <div
      onClick={() => !disabled && onToggle()}
      className={`group relative flex items-center p-3 border-b border-slate-700/30 transition-all duration-200
                  ${disabled ? 'opacity-40 cursor-not-allowed grayscale-[0.5]' : 'cursor-pointer'}
                  hover:bg-slate-800/50
                  ${isSelected ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''}`}
    >
      <PlayerPortrait
        imgUrl={player.imgURL}
        teamLogoUrl={team?.logoUrl}
        overallRating={player.overallRating}
        isIncoming={player.isIncoming}
        size={48}
      />

      {/* Player Info */}
      <div className="flex-1 ml-4 min-w-0">
          <div className="text-sm font-black text-white truncate group-hover:text-blue-400 transition-colors">{player.name}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{player.pos} • {player.contract?.exp} YRS</div>
          <div className="flex gap-3 mt-1 text-[9px] text-slate-500 font-mono">
              <span><strong className="text-slate-300">{ppg}</strong> PPG</span>
              <span><strong className="text-slate-300">{rpg}</strong> RPG</span>
              <span><strong className="text-slate-300">{apg}</strong> APG</span>
          </div>
      </div>

      {/* Contract & Logo */}
      <div className="flex items-center gap-4">
          <div className="text-right">
              <div className="text-sm font-black text-white">{formatContract(player.contract?.amount || 0)}</div>
              <div className="text-[10px] font-bold text-slate-500">{player.contract?.exp} YRS LEFT</div>
          </div>
          <MoreVertical size={16} className="text-slate-600 group-hover:text-slate-400" />
      </div>
    </div>
  );
};


export const TradeMachineModal: React.FC<TradeMachineModalProps> = ({
  onClose, onConfirm,
  initialTeamAId, initialTeamBId,
  initialTeamAPlayerIds, initialTeamBPlayerIds,
  initialTeamAPickDpids, initialTeamBPickDpids,
}) => {
  const { state } = useGame();
  const [teamAId, setTeamAId] = useState<number | null>(initialTeamAId ?? null);
  const [teamBId, setTeamBId] = useState<number | null>(initialTeamBId ?? null);

  // Pre-load players/picks from Trade Finder if provided
  const [teamAPlayers, setTeamAPlayers] = useState<NBAPlayer[]>(() =>
    initialTeamAPlayerIds ? state.players.filter(p => initialTeamAPlayerIds.includes(p.internalId)) : []
  );
  const [teamBPlayers, setTeamBPlayers] = useState<NBAPlayer[]>(() =>
    initialTeamBPlayerIds ? state.players.filter(p => initialTeamBPlayerIds.includes(p.internalId)) : []
  );
  const [teamAPicks, setTeamAPicks] = useState<DraftPick[]>(() =>
    initialTeamAPickDpids ? state.draftPicks.filter(pk => initialTeamAPickDpids.includes(pk.dpid)) : []
  );
  const [teamBPicks, setTeamBPicks] = useState<DraftPick[]>(() =>
    initialTeamBPickDpids ? state.draftPicks.filter(pk => initialTeamBPickDpids.includes(pk.dpid)) : []
  );
  
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [activeTabA, setActiveTabA] = useState<'roster' | 'picks'>('roster');
  const [activeTabB, setActiveTabB] = useState<'roster' | 'picks'>('roster');
  const [openDropdown, setOpenDropdown] = useState<'A' | 'B' | null>(null);

  const formatContract = (amount: number) => `$${(amount / 1000).toFixed(1)}M`;

  // Calculate team standings (wins/losses for sorting)
  const teamsWithRecords = useMemo(() => {
    const nonRegularGids = new Set(
      state.schedule
        .filter(g => g.isPreseason || g.isPlayoff || g.isPlayIn)
        .map(g => g.gid)
    );

    const records: Record<number, { wins: number; losses: number }> = {};
    state.teams.forEach(t => { records[t.id] = { wins: 0, losses: 0 }; });

    state.boxScores
      .filter(g => !g.isAllStar && !g.isRisingStars && !g.isCelebrityGame && !nonRegularGids.has(g.gameId))
      .forEach(g => {
        const homeWon = g.homeScore > g.awayScore;
        if (records[g.homeTeamId]) homeWon ? records[g.homeTeamId].wins++ : records[g.homeTeamId].losses++;
        if (records[g.awayTeamId]) !homeWon ? records[g.awayTeamId].wins++ : records[g.awayTeamId].losses++;
      });

    return state.teams
      .map(t => ({ ...t, wins: records[t.id]?.wins || 0, losses: records[t.id]?.losses || 0 }))
      .sort((a, b) => b.wins - a.wins);
  }, [state.teams, state.boxScores, state.schedule]);

  const teamA = state.teams.find(t => t.id === teamAId);
  const teamB = state.teams.find(t => t.id === teamBId);

  // Memos for rosters and picks
  const teamARoster = useMemo(() => state.players
    .filter(p => p.tid === teamAId && !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || ''))
    .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)),
  [state.players, teamAId]);

  const teamBRoster = useMemo(() => state.players
    .filter(p => p.tid === teamBId && !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || ''))
    .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)),
  [state.players, teamBId]);

  const tradablePickCutoff = (state.leagueStats.year ?? new Date().getFullYear()) + (state.leagueStats.tradableDraftPickSeasons ?? 7);
  const teamAPicksAvailable = useMemo(() => state.draftPicks.filter(p => p.tid === teamAId && p.season <= tradablePickCutoff), [state.draftPicks, teamAId, tradablePickCutoff]);
  const teamBPicksAvailable = useMemo(() => state.draftPicks.filter(p => p.tid === teamBId && p.season <= tradablePickCutoff), [state.draftPicks, teamBId, tradablePickCutoff]);

  const displayTeamARoster = useMemo(() => {
    const incoming = teamBPlayers.map(p => ({ ...p, isIncoming: true }));
    const native = teamARoster.filter(p => !teamAPlayers.some(out => out.internalId === p.internalId));
    return [...incoming, ...native];
  }, [teamBPlayers, teamARoster, teamAPlayers]);

  const displayTeamBRoster = useMemo(() => {
    const incoming = teamAPlayers.map(p => ({ ...p, isIncoming: true }));
    const native = teamBRoster.filter(p => !teamBPlayers.some(out => out.internalId === p.internalId));
    return [...incoming, ...native];
  }, [teamAPlayers, teamBRoster, teamBPlayers]);

  const teamASalary = useMemo(() => teamAPlayers.reduce((sum, p) => sum + (p.contract?.amount || 0), 0), [teamAPlayers]);
  const teamBSalary = useMemo(() => teamBPlayers.reduce((sum, p) => sum + (p.contract?.amount || 0), 0), [teamBPlayers]);

  const salaryMismatchInfo = useMemo(() => {
    // Picks-for-picks: no salary to check
    if (teamAPlayers.length === 0 && teamBPlayers.length === 0) return null;
    // Picks-for-player: always a mismatch — you can't acquire salary by sending only picks
    // (real NBA rule: picks-only side can only absorb salary up to their cap room,
    // but we simplify: if one side sends no players and receives a player, flag it)
    if (teamAPlayers.length === 0 && teamBPlayers.length > 0) {
      return { message: `${teamA?.abbrev || 'Team A'} cannot receive players while sending only picks.`, team: 'A' as const };
    }
    if (teamBPlayers.length === 0 && teamAPlayers.length > 0) {
      return { message: `${teamB?.abbrev || 'Team B'} cannot receive players while sending only picks.`, team: 'B' as const };
    }
    // Both sides have players — apply standard 125% salary matching rule
    // Contracts stored in thousands of dollars; $100K buffer = 100 units
    const maxA = teamASalary * 1.25 + 100;
    const maxB = teamBSalary * 1.25 + 100;
    if (teamBSalary > maxA) return { message: `${teamA?.abbrev || 'Team A'} receiving too much salary.`, team: 'A' as const };
    if (teamASalary > maxB) return { message: `${teamB?.abbrev || 'Team B'} receiving too much salary.`, team: 'B' as const };
    return null;
  }, [teamASalary, teamBSalary, teamA, teamB, teamAPlayers, teamBPlayers]);

  const handleConfirm = () => {
    if (teamAId !== null && teamBId !== null) setShowSummaryModal(true);
  };

  const handleExecuteTrade = (force: boolean) => {
    if (teamAId !== null && teamBId !== null) {
      setShowSummaryModal(false);
      onConfirm({
        teamAId, teamBId,
        teamAPlayers: teamAPlayers.map(p => p.internalId),
        teamBPlayers: teamBPlayers.map(p => p.internalId),
        teamAPicks: teamAPicks.map(p => p.dpid),
        teamBPicks: teamBPicks.map(p => p.dpid)
      });
    }
  };

  const canClickAssets = teamAId !== null && teamBId !== null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 z-[60] flex flex-col items-center justify-start lg:justify-center p-3 sm:p-4 font-sans backdrop-blur-md overflow-y-auto">

        {/* ACTION BAR — sticky on mobile, absolute on desktop */}
        <div className="sticky top-0 lg:fixed lg:bottom-6 lg:top-auto z-50 flex gap-2 sm:gap-4 bg-[#161616] p-2 rounded-2xl border border-slate-700 shadow-2xl mb-3 lg:mb-0 w-full max-w-xs sm:max-w-sm lg:max-w-none lg:w-auto lg:left-1/2 lg:-translate-x-1/2">
            <button onClick={handleConfirm} disabled={!canClickAssets || (teamAPlayers.length === 0 && teamBPlayers.length === 0 && teamAPicks.length === 0 && teamBPicks.length === 0)} className="flex-1 lg:flex-none px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20">
                Validate Deal
            </button>
            <button onClick={onClose} className="flex-1 lg:flex-none px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all">Close</button>
        </div>

        {/* MAIN 2-COLUMN WRAPPER */}
        <div className="w-full max-w-6xl h-auto lg:h-[80vh] flex flex-col lg:flex-row gap-3 sm:gap-6 pb-4 lg:pb-0">
          
          {/* ======================= TEAM 1 COLUMN ======================= */}
          <div className="flex-1 flex flex-col bg-[#1e1e1e] border border-slate-700/50 rounded-2xl overflow-hidden relative shadow-2xl min-h-[50vh] lg:min-h-0">
            
            <div className="p-5 border-b border-slate-700/50 bg-[#161616]">
                <TeamDropdown 
                    label="Team 1" 
                    selectedTeamId={teamAId} 
                    onSelect={(id) => { setTeamAId(id); setTeamAPlayers([]); setTeamAPicks([]); }} 
                    teams={teamsWithRecords} 
                    otherTeamId={teamBId}
                    isOpen={openDropdown === 'A'}
                    onToggle={() => setOpenDropdown(openDropdown === 'A' ? null : 'A')}
                />
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50">
                <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <span>Outgoing <strong className="text-white ml-2">-{formatContract(teamASalary)}</strong></span>
                        {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                            salaryMismatchInfo?.team === 'A' ? 'bg-rose-900/60 text-rose-400' : 'bg-emerald-900/60 text-emerald-400'
                          }`}>
                            {salaryMismatchInfo?.team === 'A' ? '✗ Fix Salary' : '✓ Salary OK'}
                          </span>
                        )}
                    </div>
                    <ChevronUp size={14} className="opacity-30" />
                </div>
                {teamAPlayers.length > 0 && (
                    <div className="px-4 pb-4 flex flex-wrap gap-2">
                        {teamAPlayers.map(p => (
                            <OutgoingPill key={p.internalId} player={p} onRemove={() => setTeamAPlayers(teamAPlayers.filter(x => x.internalId !== p.internalId))} />
                        ))}
                    </div>
                )}
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50 p-2 flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">
                <span>Incoming <strong className="text-indigo-400 ml-2">+{formatContract(teamBSalary)}</strong></span>
                <ChevronDown size={14} className="opacity-30" />
            </div>

            <div className="flex gap-6 px-5 pt-4 border-b border-slate-700/50 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                <button onClick={() => setActiveTabA('roster')} className={`pb-3 transition-all ${activeTabA === 'roster' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Roster ({displayTeamARoster.length})</button>
                <button onClick={() => setActiveTabA('picks')} className={`pb-3 transition-all ${activeTabA === 'picks' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Picks ({teamAPicksAvailable.length})</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
                {activeTabA === 'roster' ? (
                    displayTeamARoster.map(player => (
                        <PlayerRow
                            key={player.internalId}
                            player={player}
                            isSelected={teamAPlayers.some(x => x.internalId === player.internalId)}
                            onToggle={() => setTeamAPlayers([...teamAPlayers, player])}
                            formatContract={formatContract}
                            teams={state.teams}
                            disabled={!canClickAssets}
                            currentSeason={state.leagueStats.year}
                        />
                    ))
                ) : (
                    <div className="p-4 space-y-2">
                        {teamAPicksAvailable.map(pick => {
                            const isSelected = teamAPicks.some(p => p.dpid === pick.dpid);
                            const origTeam = state.teams.find(t => t.id === pick.originalTid);
                            return (
                                <button 
                                    key={pick.dpid}
                                    disabled={!canClickAssets}
                                    onClick={() => isSelected ? setTeamAPicks(teamAPicks.filter(p => p.dpid !== pick.dpid)) : setTeamAPicks([...teamAPicks, pick])}
                                    className={`w-full flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${isSelected ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
                                        <img src={origTeam?.logoUrl} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="text-sm font-black text-white uppercase tracking-tight">{pick.season} {pick.round === 1 ? '1ST' : '2ND'} ROUND</div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Via {origTeam?.name}</div>
                                    </div>
                                    {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
          </div>

          {/* ======================= TEAM 2 COLUMN ======================= */}
          <div className="flex-1 flex flex-col bg-[#1e1e1e] border border-slate-700/50 rounded-2xl overflow-hidden relative shadow-2xl min-h-[50vh] lg:min-h-0">
            
            <div className="p-5 border-b border-slate-700/50 bg-[#161616]">
                <TeamDropdown 
                    label="Team 2" 
                    selectedTeamId={teamBId} 
                    onSelect={(id) => { setTeamBId(id); setTeamBPlayers([]); setTeamBPicks([]); }} 
                    teams={teamsWithRecords} 
                    otherTeamId={teamAId}
                    isOpen={openDropdown === 'B'}
                    onToggle={() => setOpenDropdown(openDropdown === 'B' ? null : 'B')}
                />
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50">
                <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <span>Outgoing <strong className="text-white ml-2">-{formatContract(teamBSalary)}</strong></span>
                        {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                            salaryMismatchInfo?.team === 'B' ? 'bg-rose-900/60 text-rose-400' : 'bg-emerald-900/60 text-emerald-400'
                          }`}>
                            {salaryMismatchInfo?.team === 'B' ? '✗ Fix Salary' : '✓ Salary OK'}
                          </span>
                        )}
                    </div>
                    <ChevronUp size={14} className="opacity-30" />
                </div>
                {teamBPlayers.length > 0 && (
                    <div className="px-4 pb-4 flex flex-wrap gap-2">
                        {teamBPlayers.map(p => (
                            <OutgoingPill key={p.internalId} player={p} onRemove={() => setTeamBPlayers(teamBPlayers.filter(x => x.internalId !== p.internalId))} />
                        ))}
                    </div>
                )}
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50 p-2 flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">
                <span>Incoming <strong className="text-indigo-400 ml-2">+{formatContract(teamASalary)}</strong></span>
                <ChevronDown size={14} className="opacity-30" />
            </div>

            <div className="flex gap-6 px-5 pt-4 border-b border-slate-700/50 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                <button onClick={() => setActiveTabB('roster')} className={`pb-3 transition-all ${activeTabB === 'roster' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Roster ({displayTeamBRoster.length})</button>
                <button onClick={() => setActiveTabB('picks')} className={`pb-3 transition-all ${activeTabB === 'picks' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Picks ({teamBPicksAvailable.length})</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
                {activeTabB === 'roster' ? (
                    displayTeamBRoster.map(player => (
                        <PlayerRow
                            key={player.internalId}
                            player={player}
                            isSelected={teamBPlayers.some(x => x.internalId === player.internalId)}
                            onToggle={() => setTeamBPlayers([...teamBPlayers, player])}
                            formatContract={formatContract}
                            teams={state.teams}
                            disabled={!canClickAssets}
                            currentSeason={state.leagueStats.year}
                        />
                    ))
                ) : (
                    <div className="p-4 space-y-2">
                        {teamBPicksAvailable.map(pick => {
                            const isSelected = teamBPicks.some(p => p.dpid === pick.dpid);
                            const origTeam = state.teams.find(t => t.id === pick.originalTid);
                            return (
                                <button 
                                    key={pick.dpid}
                                    disabled={!canClickAssets}
                                    onClick={() => isSelected ? setTeamBPicks(teamBPicks.filter(p => p.dpid !== pick.dpid)) : setTeamBPicks([...teamBPicks, pick])}
                                    className={`w-full flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${isSelected ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
                                        <img src={origTeam?.logoUrl} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="text-sm font-black text-white uppercase tracking-tight">{pick.season} {pick.round === 1 ? '1ST' : '2ND'} ROUND</div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Via {origTeam?.name}</div>
                                    </div>
                                    {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
          </div>
        </div>

        {teamA && teamB && showSummaryModal && (
            <TradeSummaryModal
                isOpen={showSummaryModal}
                onClose={() => setShowSummaryModal(false)}
                onConfirmTrade={() => handleExecuteTrade(false)}
                onForceTrade={() => handleExecuteTrade(true)}
                tradeDetails={{
                    teamA, teamB,
                    teamAPlayers, teamBPlayers,
                    teamAPicks, teamBPicks,
                    teamASentSalary: teamASalary,
                    teamBSentSalary: teamBSalary,
                }}
                salaryMismatchInfo={salaryMismatchInfo}
            />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
