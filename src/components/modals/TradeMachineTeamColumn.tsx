import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TeamDropdown } from '../shared/TeamDropdown';
import { isTradeEligible } from '../../utils/signingMoratorium';
import { isRecentlySignedLocked, isWalkingExpiring } from '../../services/trade/tradeValueEngine';
import { formatPickLabel } from '../../services/draft/draftClassStrength';
import { resolveAnyTeam } from '../../utils/teamLookup';
import type { DraftPick, NBAPlayer, NBATeam } from '../../types';
import { OutgoingPickPill, OutgoingPill, PlayerRow } from './TradeMachineRows';

export const TradeMachineTeamColumn: React.FC<{
  label: string;
  isGM?: boolean;
  selectedTeamId: number | null;
  otherTeamId: number | null;
  onSelectTeam: (id: number) => void;
  teamsWithRecords: any[];
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  outgoingDisplaySalary: string;
  incomingDisplaySalary: string;
  salaryMismatchTeam?: 'A' | 'B' | null;
  selectedPlayerIds: Set<string>;
  selectedPlayers: NBAPlayer[];
  onRemovePlayer: (id: string) => void;
  selectedPicks: DraftPick[];
  onRemovePick: (dpid: number) => void;
  activeTeams: NBATeam[];
  currentYear: number;
  lotterySlotByTid: Map<number, number>;
  cashCapRemaining: number;
  cashUSD: number;
  setCashUSD: (value: number) => void;
  activeTab: 'roster' | 'picks';
  setActiveTab: (tab: 'roster' | 'picks') => void;
  displayRoster: Array<NBAPlayer & { isIncoming?: boolean }>;
  picksAvailable: DraftPick[];
  canClickAssets: boolean;
  currentSeason: number;
  postDeadlinePreFA: boolean;
  rslCtx: { currentDate: string; leagueStats: any };
  onTogglePlayer: (player: NBAPlayer & { isIncoming?: boolean }) => void;
  onTogglePick: (pick: DraftPick) => void;
  stepienBlocked: Set<number>;
  stateTeams: NBATeam[];
  nonNBATeams: any[];
  suggestedPlayerIds?: Set<string>;
  suggestedPickIds?: Set<number>;
  formatContract: (player: NBAPlayer) => string;
}> = ({
  label,
  isGM = false,
  selectedTeamId,
  otherTeamId,
  onSelectTeam,
  teamsWithRecords,
  dropdownOpen,
  onToggleDropdown,
  outgoingDisplaySalary,
  incomingDisplaySalary,
  salaryMismatchTeam,
  selectedPlayerIds,
  selectedPlayers,
  onRemovePlayer,
  selectedPicks,
  onRemovePick,
  activeTeams,
  currentYear,
  lotterySlotByTid,
  cashCapRemaining,
  cashUSD,
  setCashUSD,
  activeTab,
  setActiveTab,
  displayRoster,
  picksAvailable,
  canClickAssets,
  currentSeason,
  postDeadlinePreFA,
  rslCtx,
  onTogglePlayer,
  onTogglePick,
  stepienBlocked,
  stateTeams,
  nonNBATeams,
  suggestedPlayerIds,
  suggestedPickIds,
  formatContract,
}) => (
  <div className="flex-1 flex flex-col bg-[#1e1e1e] border border-slate-700/50 rounded-2xl overflow-hidden relative shadow-2xl min-h-[85vh] lg:min-h-0">
    <div className="p-5 border-b border-slate-700/50 bg-[#161616]">
      <TeamDropdown
        label={label}
        selectedTeamId={selectedTeamId}
        onSelect={onSelectTeam}
        teams={teamsWithRecords}
        otherTeamId={otherTeamId}
        isOpen={dropdownOpen}
        onToggle={onToggleDropdown}
      />
    </div>

    <div className="border-b border-slate-700/30 bg-[#161616]/50">
      <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <span>Outgoing <strong className="text-white ml-2">-{outgoingDisplaySalary}</strong></span>
          {(selectedPlayers.length > 0 || selectedPlayerIds.size > 0) && (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
              salaryMismatchTeam ? 'bg-rose-900/60 text-rose-400' : 'bg-emerald-900/60 text-emerald-400'
            }`}>
              {salaryMismatchTeam ? '✗ Fix Salary' : '✓ Salary OK'}
            </span>
          )}
        </div>
        <ChevronUp size={14} className="opacity-30" />
      </div>

      {(selectedPlayers.length > 0 || selectedPicks.length > 0) && (
        <div className="px-4 pb-4 overflow-x-auto custom-scrollbar">
          <div className="flex gap-2 min-w-min">
            {selectedPlayers.map(p => (
              <OutgoingPill key={p.internalId} player={p} onRemove={() => onRemovePlayer(p.internalId)} />
            ))}
            {selectedPicks.map(pk => (
              <OutgoingPickPill
                key={pk.dpid}
                pick={pk}
                teams={activeTeams}
                currentYear={currentYear}
                lotterySlotByTid={lotterySlotByTid}
                onRemove={() => onRemovePick(pk.dpid)}
              />
            ))}
          </div>
        </div>
      )}

      {selectedTeamId !== null && (
        <div className="px-4 pb-3 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <span>Cash:</span>
          <input
            type="range"
            min={0}
            max={cashCapRemaining}
            step={250_000}
            value={Math.min(cashUSD, cashCapRemaining)}
            onChange={e => setCashUSD(parseInt(e.target.value, 10))}
            className="flex-1 accent-indigo-500"
          />
          <span className={`tabular-nums ${cashUSD > 0 ? 'text-emerald-300' : 'text-slate-600'}`}>
            ${(cashUSD / 1_000_000).toFixed(2)}M
          </span>
          <span className="text-[9px] text-slate-600">cap left ${(cashCapRemaining / 1_000_000).toFixed(1)}M</span>
        </div>
      )}
    </div>

    <div className="border-b border-slate-700/30 bg-[#161616]/50 p-2 flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">
      <span>Incoming <strong className="text-indigo-400 ml-2">+{incomingDisplaySalary}</strong></span>
      <ChevronDown size={14} className="opacity-30" />
    </div>

    <div className="flex gap-6 px-5 pt-4 border-b border-slate-700/50 text-[11px] font-black text-slate-500 uppercase tracking-widest">
      <button onClick={() => setActiveTab('roster')} className={`pb-3 transition-all ${activeTab === 'roster' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>
        Roster ({displayRoster.length})
      </button>
      <button onClick={() => setActiveTab('picks')} className={`pb-3 transition-all ${activeTab === 'picks' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>
        Picks ({picksAvailable.length})
      </button>
    </div>

    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
      {activeTab === 'roster' ? (
        displayRoster.map(player => {
          const isSel = selectedPlayerIds.has(player.internalId);
          const moratoriumLocked = !isSel && !(player as any).isIncoming
            && rslCtx.leagueStats?.postSigningMoratoriumEnabled !== false
            && !isTradeEligible(player, rslCtx.currentDate, rslCtx.leagueStats as any);
          const walking = !isSel && !(player as any).isIncoming
            && (isWalkingExpiring(player, currentSeason, postDeadlinePreFA)
              || isRecentlySignedLocked(player, rslCtx.currentDate, rslCtx.leagueStats)
              || moratoriumLocked);
          return (
            <PlayerRow
              key={player.internalId}
              player={player}
              isSelected={isSel}
              isSuggested={suggestedPlayerIds?.has(player.internalId)}
              onToggle={() => onTogglePlayer(player)}
              formatContract={formatContract}
              teams={activeTeams}
              disabled={!canClickAssets || walking}
              currentSeason={currentSeason}
              moratoriumLockedUntil={moratoriumLocked ? (player as any).tradeEligibleDate : undefined}
            />
          );
        })
      ) : (
        <div className="p-4 space-y-2">
          {picksAvailable.map(pick => {
            const isSelected = selectedPicks.some(p => p.dpid === pick.dpid);
            const origTeam = resolveAnyTeam(pick.originalTid, stateTeams, nonNBATeams) ?? activeTeams.find(t => t.id === pick.originalTid);
            const stepienBlocks = !isSelected && stepienBlocked.has(pick.dpid);
            const disabled = !canClickAssets || stepienBlocks;
            return (
              <button
                key={pick.dpid}
                disabled={disabled}
                title={stepienBlocks ? 'Stepien Rule — would leave this team with no 1st in two straight future drafts.' : undefined}
                onClick={() => onTogglePick(pick)}
                className={`w-full flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${
                  stepienBlocks ? 'bg-slate-950/60 border-slate-800/60 opacity-40 grayscale cursor-not-allowed'
                    : isSelected ? 'bg-blue-600/10 border-blue-500/50'
                    : suggestedPickIds?.has(pick.dpid) ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
                  <img src={origTeam?.logoUrl} alt="" className="w-full h-full object-contain" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-black text-white uppercase tracking-tight">{formatPickLabel(pick, currentYear, lotterySlotByTid, false).toUpperCase()}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {stepienBlocks ? <span className="text-rose-400">Stepien Rule</span> : <>Via {origTeam?.name}</>}
                  </div>
                </div>
                {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  </div>
);
