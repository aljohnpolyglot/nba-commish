import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../../../../shared/PlayerSelectorGrid';
import { StarterService } from '../../../../../services/simulation/StarterService';
import { convertTo2KRating } from '../../../../../utils/helpers';
import { NBAPlayer, TeamStatus } from '../../../../../types';
import { calcPlayerTV, calcOvr2K, isUntouchable, type TeamMode } from '../../../../../services/trade/tradeValueEngine';
import { MANUAL_STATUS_LABEL } from '../../../../../utils/salaryUtils';
import { getTradingBlock, saveTradingBlock } from '../../../../../store/tradingBlockStore';
import { TeamIntelFreeAgency } from './TeamIntelFreeAgency';
import { TeamIntelExpiring } from './TeamIntelExpiring';
import { resolveTeamStrategyProfile } from '../../../../../utils/teamStrategy';

interface TeamIntelProps {
  teamId: number;
  onPlayerClick?: (player: NBAPlayer) => void;
}

/** Get K2 (2K-style) overall for a player */
function getK2Ovr(p: NBAPlayer): number {
  const r = p.ratings?.[p.ratings.length - 1];
  if (!r) return p.overallRating;
  return convertTo2KRating(p.overallRating, r.hgt ?? 50, r.tp ?? 50);
}

export function TeamIntel({ teamId, onPlayerClick }: TeamIntelProps) {
  const { state, dispatchAction } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const players = (state.players || []).filter(p => p.tid === teamId && p.status === 'Active');
  const teamColor = team?.colors?.[0] || '#552583';
  const teamName = team ? `${team.region} ${team.name}` : '';

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  // Reuse StarterService — same path GamePlan / IdealRotation / Depth Chart take.
  // sortByPositionSlot does the depth-aware ordering; the player's own `pos`
  // carries the auto-rename (e.g., a Wagner-style swingman tagged 'GF' shows
  // as GF, not SF) so the lineup labels match GamePlan exactly.
  const currentSeason = state.leagueStats?.year ?? 2026;
  const projected = StarterService.getProjectedStarters(team, state.players, currentSeason);
  const sortedStarters = StarterService.sortByPositionSlot(projected.slice(0, 5), currentSeason);

  const lineup: { player: NBAPlayer; lineupPos: string }[] = [];
  const usedIds = new Set<string>();

  sortedStarters.forEach((p) => {
    lineup.push({ player: p, lineupPos: (p.pos || 'F').toUpperCase() });
    usedIds.add(p.internalId);
  });

  // 6th man: best remaining HEALTHY player by K2
  const sortedByK2 = [...players].sort((a, b) => getK2Ovr(b) - getK2Ovr(a));
  const sixthMan = sortedByK2.find(p => !usedIds.has(p.internalId) && !((p as any).injury?.gamesRemaining > 0));
  if (sixthMan) {
    lineup.push({ player: sixthMan, lineupPos: '6TH' });
  }

  // Cap space
  const totalSalary = players.reduce((acc, p) => acc + (p.contract?.amount || 0), 0);
  const capSpace = 136000 - totalSalary; // amounts in thousands
  const capFormatted = capSpace < 0
    ? `-$${Math.abs(capSpace / 1000).toFixed(1)}M`
    : `$${(capSpace / 1000).toFixed(1)}M`;

  const currentYear = state.leagueStats?.year || 2026;

  const { status, strategyKey, tradingBlock, untouchables, targets } = useMemo(() => {
    const strategy = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: state.userTeamId,
    });
    const mode: TeamMode = strategy.teamMode;
    const statusLabel = strategy.label.toUpperCase();

    // Trade value for each player
    const rosterTV = players.map(p => ({
      player: p,
      tv: calcPlayerTV(p, mode, currentYear),
      k2: calcOvr2K(p),
    })).sort((a, b) => b.tv - a.tv);

    // Untouchables: shared rule w/ AI/TradingBlock — contend K2≥82, rebuild/presti age<25 & POT≥85,
    // plus 10-yr loyalty and young-contender core. Cap at 3 to match UI limit.
    const untouchList = rosterTV.filter(r => isUntouchable(r.player, mode, currentYear)).slice(0, 3);

    // Trading block: players the team would be willing to move
    // Keep this aligned with the shared strategy profile so the narrative
    // reflects how the AI will actually treat the roster.
    let blockList: typeof rosterTV = [];
    if (strategy.key === 'contending' || strategy.key === 'win_now' || strategy.key === 'play_in_push') {
      blockList = rosterTV.filter(r => r.k2 < 80 && (r.player.contract?.exp ?? currentYear + 5) <= currentYear + 1).slice(0, 3);
    } else if (strategy.key === 'retooling') {
      const age = (p: NBAPlayer) => p.born?.year ? currentYear - p.born.year : 27;
      blockList = rosterTV.filter(r =>
        age(r.player) >= 28 &&
        (r.player.contract?.exp ?? currentYear + 5) <= currentYear + 2 &&
        r.k2 >= 74
      ).slice(0, 4);
    } else if (strategy.key === 'cap_clearing') {
      blockList = [...rosterTV]
        .sort((a, b) => (b.player.contract?.amount ?? 0) - (a.player.contract?.amount ?? 0))
        .filter(r => (r.player.contract?.amount ?? 0) > 9000)
        .slice(0, 4);
    } else if (strategy.key === 'rebuilding' || strategy.key === 'development' || mode === 'presti') {
      const age = (p: NBAPlayer) => p.born?.year ? currentYear - p.born.year : 27;
      blockList = rosterTV.filter(r => age(r.player) >= 28 && r.k2 >= 75).slice(0, 4);
    } else {
      blockList = rosterTV.filter(r => (r.player.contract?.amount ?? 0) > 10000 && r.k2 < 85).slice(0, 3);
    }
    // Don't put untouchables on the block
    const untouchIds = new Set(untouchList.map(u => u.player.internalId));
    blockList = blockList.filter(r => !untouchIds.has(r.player.internalId));

    // Targets: positions where team is weakest
    const posGroups: Record<string, number[]> = { G: [], F: [], C: [] };
    for (const r of rosterTV) {
      const pos = r.player.pos ?? 'F';
      if (pos.includes('G') || pos === 'PG' || pos === 'SG') posGroups.G.push(r.k2);
      else if (pos.includes('C') || pos === 'FC') posGroups.C.push(r.k2);
      else posGroups.F.push(r.k2);
    }
    const avgByPos = Object.entries(posGroups).map(([pos, vals]) => ({
      pos, avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, count: vals.length,
    })).sort((a, b) => a.avg - b.avg);
    const weakPos = avgByPos.filter(p => p.avg < 82 || p.count < 2).slice(0, 2).map(p => p.pos === 'G' ? 'Guard' : p.pos === 'F' ? 'Forward' : 'Center');

    return {
      status: statusLabel,
      strategyKey: strategy.key,
      tradingBlock: blockList,
      untouchables: untouchList,
      targets: weakPos,
    };
  }, [players, state.teams, state.players, teamId, currentYear, team, state.gameMode, state.userTeamId, state.leagueStats]);

  // Expiring contracts
  const expiring = [...players]
    .filter(p => p.contract && p.contract.exp <= currentYear)
    .sort((a, b) => getK2Ovr(b) - getK2Ovr(a));

  // ── Editable lists (own team only) ──────────────────────────────────────
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  const [editingList, setEditingList] = useState<'untouchable' | 'block' | 'targets' | null>(null);
  // ── Sub-tab pill: Trades (existing) | Free Agency (new) ─────────────────
  // Both views share the team banner; only the body switches. Persists per-mount.
  const [intelTab, setIntelTab] = useState<'trades' | 'fa' | 'expiring'>('trades');

  // Hydrate from tradingBlockStore so the narrative reflects what the user
  // actually marked in the Trading Block UI (and stays in sync with AI/trade
  // engines that read the same store). Falls back to the heuristic defaults
  // computed above when the team has no saved entry yet.
  const rosterIdSet = useMemo(() => new Set(players.map(p => p.internalId)), [players]);
  const otherIdSet = useMemo(
    () => new Set(state.players.filter(p => p.tid >= 0 && p.tid !== teamId && p.status === 'Active').map(p => p.internalId)),
    [state.players, teamId],
  );
  const initialFromStore = useMemo(() => {
    const saved = getTradingBlock(teamId);
    if (!saved) return null;
    return {
      untouchable: new Set(saved.untouchableIds.filter(id => rosterIdSet.has(id))),
      block: new Set(saved.blockIds.filter(id => rosterIdSet.has(id))),
      target: new Set(saved.targetIds.filter(id => otherIdSet.has(id))),
    };
    // Re-hydrate when teamId changes; mid-render roster diffs are pruned by the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const [untouchableIds, setUntouchableIds] = useState<Set<string>>(
    () => initialFromStore?.untouchable ?? new Set(untouchables.map(r => r.player.internalId)),
  );
  const [blockIds, setBlockIds] = useState<Set<string>>(
    () => initialFromStore?.block ?? new Set(tradingBlock.map(r => r.player.internalId)),
  );
  const [targetIds, setTargetIds] = useState<Set<string>>(
    () => initialFromStore?.target ?? new Set(),
  );

  // Drop ids that no longer point at valid roster slots (player was traded/cut).
  useEffect(() => {
    setUntouchableIds(prev => {
      const next = new Set([...prev].filter(id => rosterIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setBlockIds(prev => {
      const next = new Set([...prev].filter(id => rosterIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setTargetIds(prev => {
      const next = new Set([...prev].filter(id => otherIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rosterIdSet, otherIdSet]);

  // Persist edits to the same store the Trading Block UI + AI consume so the
  // narrative, the column UI, and trade engines stay aligned.
  useEffect(() => {
    if (!isOwnTeam) return;
    const existing = getTradingBlock(teamId);
    saveTradingBlock(teamId, {
      untouchableIds: Array.from(untouchableIds),
      blockIds: Array.from(blockIds),
      targetIds: Array.from(targetIds),
      blockPickIds: existing?.blockPickIds ?? [],
    });
  }, [isOwnTeam, teamId, untouchableIds, blockIds, targetIds]);

  // Build items for selectors
  const ownRosterItems: PlayerSelectorItem[] = useMemo(() =>
    players.map(p => ({
      player: p,
      score: getK2Ovr(p),
      subtitle: `${getK2Ovr(p)} OVR`,
    })),
  [players]);

  const leagueTargetItems: PlayerSelectorItem[] = useMemo(() =>
    state.players
      .filter(p => p.tid >= 0 && p.tid !== teamId && p.status === 'Active')
      .map(p => ({
        player: p,
        score: getK2Ovr(p),
        subtitle: `${getK2Ovr(p)} OVR`,
      })),
  [state.players, teamId]);

  // Untouchable and block are mutually exclusive — adding to one removes
  // from the other so the narrative + Trading Block UI never disagree.
  const toggleUntouchable = (id: string) => {
    setUntouchableIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); return n; }
      if (n.size >= 3) return prev;
      n.add(id);
      return n;
    });
    setBlockIds(prev => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };
  const toggleBlock = (id: string) => {
    setBlockIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); return n; }
      if (n.size >= 5) return prev;
      n.add(id);
      return n;
    });
    setUntouchableIds(prev => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };
  const toggleTarget = (id: string) => {
    setTargetIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else if (n.size < 5) n.add(id);
      return n;
    });
  };

  return (
    <>
    <div className="h-full flex flex-col relative z-10">
      {/* Top Banner */}
      <div
        className="rounded-t-lg p-4 sm:p-8 flex flex-col md:flex-row items-center justify-between border border-[#30363d] border-b-0 relative overflow-hidden gap-6 md:gap-0"
        style={{ backgroundColor: teamColor }}
      >
        <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-black/80 via-black/50 to-transparent z-0" />
        <div className="relative z-10 flex items-center gap-8">
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-[#161b22]/80 backdrop-blur-md rounded-full border-4 border-[#FDB927]/50 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] p-4">
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={teamName} className="w-full h-full object-contain drop-shadow-lg" referrerPolicy="no-referrer" />
            ) : (
              <span className="font-black text-3xl sm:text-4xl text-[#FDB927]">{team.abbrev}</span>
            )}
          </div>
        </div>

        <div className="relative z-10 flex gap-4 sm:gap-10 text-center w-full md:w-auto justify-center flex-wrap">
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Record</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{team.wins}-{team.losses}</div>
          </div>
          {(() => {
            const hasGames = (team.wins + team.losses) > 0;
            const confTeams = state.teams.filter(t => t.conference === team.conference)
              .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
            const confRank = confTeams.findIndex(t => t.id === teamId) + 1;
            // Divisions live on `did` (numeric), not a `division` string — so the
            // old team.division equality was `undefined === undefined` for every
            // team, making divRank identical to a league-wide rank.
            const divTeams = state.teams.filter(t => (t as any).did === (team as any).did)
              .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
            const divRank = divTeams.findIndex(t => t.id === teamId) + 1;
            return (<>
              <div>
                <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Conf</div>
                <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{hasGames ? `#${confRank}` : 'TBD'}</div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Div</div>
                <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{hasGames && divTeams.length > 1 ? `#${divRank}` : 'TBD'}</div>
              </div>
            </>);
          })()}
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Cap Space</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{capFormatted}</div>
          </div>
        </div>
      </div>

      {/* Sub-tab pill — Trades (existing intel) vs Free Agency (new scouting tab) */}
      <div className="flex border-x border-[#30363d] bg-[#0d1117]">
        {([
          { key: 'trades'   as const, label: 'Trades' },
          { key: 'fa'       as const, label: 'Free Agency' },
          { key: 'expiring' as const, label: 'Expiring' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setIntelTab(t.key)}
            className={cn(
              'flex-1 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-colors border-b-2',
              intelTab === t.key
                ? 'text-[#FDB927] border-[#FDB927] bg-[#FDB927]/5'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/5',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {intelTab === 'expiring' ? (
        <div className="flex-1 border border-[#30363d] border-t-0 rounded-b-lg p-3 bg-[#161b22]/80 backdrop-blur-md min-h-0 overflow-hidden">
          <TeamIntelExpiring teamId={teamId} onPlayerClick={onPlayerClick} />
        </div>
      ) : intelTab === 'fa' ? (
        <div className="flex-1 border border-[#30363d] border-t-0 rounded-b-lg p-3 bg-[#161b22]/80 backdrop-blur-md min-h-0 overflow-hidden">
          <TeamIntelFreeAgency teamId={teamId} onPlayerClick={onPlayerClick} />
        </div>
      ) : (
      <>
      {/* Content Split */}
      <div className="flex-1 flex flex-col lg:flex-row border border-[#30363d] border-t-0 rounded-b-lg overflow-hidden bg-[#161b22]/80 backdrop-blur-md">

        {/* Left: Lineup */}
        <div className="w-full lg:w-[350px] border-b lg:border-b-0 lg:border-r border-[#30363d] bg-black/40 flex flex-col shrink-0">
          <div className="p-4 border-b border-[#30363d]">
            <h3 className="font-bold uppercase tracking-wider text-sm">Lineup</h3>
          </div>
          <div className="flex-1 p-4 flex flex-col gap-1">
            <div className="grid grid-cols-[40px_40px_1fr_40px] gap-2 text-xs font-bold text-[#8b949e] uppercase tracking-wider px-2 mb-2">
              <span>Pos</span>
              <span></span>
              <span>Name</span>
              <span className="text-center">OVR</span>
            </div>
            {lineup.map(({ player: p, lineupPos }, i) => {
              const k2 = getK2Ovr(p);
              return (
                <div key={i} onClick={() => onPlayerClick?.(p)} className="grid grid-cols-[40px_40px_1fr_40px] gap-2 items-center px-2 py-2 bg-white/5 rounded hover:bg-white/10 transition-colors cursor-pointer group">
                  <span className="text-[#8b949e] font-bold text-xs">{lineupPos}</span>
                  <PlayerPortrait playerName={p.name} imgUrl={p.imgURL} face={(p as any).face} size={32} />
                  <span className="font-semibold text-sm truncate group-hover:text-[#FDB927] transition-colors">
                    {p.name.charAt(0)}. {p.name.split(' ').slice(1).join(' ')}
                  </span>
                  <span className={cn(
                    "text-center text-sm font-black tabular-nums",
                    k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400'
                  )}>
                    {k2}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Team Status */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-[#30363d] flex justify-between items-center bg-black/20">
            <h3 className="font-bold text-[#8b949e] uppercase tracking-wider text-sm">Team Status</h3>
            {isOwnTeam ? (
              <select
                value={team.manualTeamStatus ?? ''}
                onChange={(e) => {
                  const v = e.target.value as TeamStatus | '';
                  const next: TeamStatus | undefined = v === '' ? undefined : v;
                  const nextTeams = state.teams.map(t =>
                    t.id === team.id ? { ...t, manualTeamStatus: next } : t
                  );
                  dispatchAction({ type: 'UPDATE_STATE', payload: { teams: nextTeams } });
                }}
                className="bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 font-black text-xs tracking-widest uppercase text-[#FDB927] hover:border-[#FDB927] focus:border-[#FDB927] focus:outline-none cursor-pointer"
                title="Pin your team's direction. Overrides the auto-computed outlook — narratives, AI trade logic, and trade proposals will all use this value."
              >
                <option value="">Auto ({status})</option>
                {(['contending', 'win_now', 'play_in_push', 'retooling', 'cap_clearing', 'rebuilding', 'development'] as TeamStatus[]).map(s => (
                  <option key={s} value={s}>{MANUAL_STATUS_LABEL[s]}</option>
                ))}
              </select>
            ) : (
              <div className="font-black text-lg tracking-widest uppercase">{status}</div>
            )}
          </div>

          <div className="p-8 space-y-6 text-sm text-[#e6edf3]/90 leading-relaxed">
            {/* Team Outlook */}
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
              <p>
                {status === 'REBUILDING'
                  ? `The ${team.name} are focused on the long view and will prioritize picks, prospects, and flexibility over short-term wins.`
                  : strategyKey === 'development'
                  ? `The ${team.name} are developing a younger core and will be cautious about moves that block prospects or burn future assets.`
                  : strategyKey === 'cap_clearing'
                  ? `The ${team.name} are looking to clean up the books and move money off the roster while preserving their core pieces.`
                  : strategyKey === 'retooling'
                  ? `The ${team.name} are trying to reshape the roster around their main pieces rather than tearing everything down.`
                  : strategyKey === 'play_in_push'
                  ? `The ${team.name} are chasing immediate help, but they should still be price-sensitive on bigger moves.`
                  : strategyKey === 'win_now'
                  ? `The ${team.name} are in win-now mode and will be looking for veterans who fit the rotation right away.`
                  : `The ${team.name} are operating like a contender and will be shopping for upgrades that raise the playoff ceiling.`}
              </p>
            </div>

            {/* Trading Block — drives off the same blockIds the Trading Block
                UI persists, with anyone marked untouchable filtered out so the
                narrative never lists an off-limits player as movable. */}
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
              <div className="flex-1">
                <p>
                  {(() => {
                    const blockPlayers = players
                      .filter(p => blockIds.has(p.internalId) && !untouchableIds.has(p.internalId));
                    if (blockPlayers.length > 0) return (
                      <>
                        {isOwnTeam ? 'Your trading block: ' : strategyKey === 'contending' || strategyKey === 'win_now' || strategyKey === 'play_in_push' ? 'Moveable depth pieces: ' : 'Players potentially available via trade: '}
                        {blockPlayers.map((p, i) => (
                          <span key={i}>
                            <span onClick={() => onPlayerClick?.(p)} className="text-[#FDB927] font-medium cursor-pointer hover:underline">{p.name}</span> ({p.pos}, {getK2Ovr(p)} OVR)
                            {i < blockPlayers.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </>
                    );
                    return `The ${team!.name} don't have any players on the trading block.`;
                  })()}
                </p>
              </div>
            </div>

            {/* Untouchables — single source of truth via untouchableIds. */}
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
              <div className="flex-1">
                <p>
                  {(() => {
                    const untouchPlayers = players.filter(p => untouchableIds.has(p.internalId));
                    if (untouchPlayers.length > 0) return (
                      <>
                        Untouchables:{' '}
                        {untouchPlayers.map((p, i) => (
                          <span key={i}>
                            <span onClick={() => onPlayerClick?.(p)} className="text-[#FDB927] font-bold cursor-pointer hover:underline">{p.name}</span> ({getK2Ovr(p)} OVR)
                            {i < untouchPlayers.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                        {' — off-limits in any trade discussion.'}
                      </>
                    );
                    return `We currently aren't aware of any players on this team that can be considered untouchable.`;
                  })()}
                </p>
              </div>
            </div>

            {/* Target List / Team Needs */}
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
              <div className="flex-1">
                <p>
                  {(() => {
                    if (isOwnTeam && targetIds.size > 0) {
                      const targetPlayers = state.players.filter(p => targetIds.has(p.internalId));
                      return (
                        <>
                          Your acquisition targets:{' '}
                          {targetPlayers.map((p, i) => {
                            const tTeam = state.teams.find(t => t.id === p.tid);
                            return (
                              <span key={i}>
                                <span onClick={() => onPlayerClick?.(p)} className="text-[#FDB927] font-medium cursor-pointer hover:underline">{p.name}</span> ({tTeam?.abbrev}, {getK2Ovr(p)} OVR)
                                {i < targetPlayers.length - 1 ? ', ' : ''}
                              </span>
                            );
                          })}
                        </>
                      );
                    }
                    if (targets.length > 0) {
                      return strategyKey === 'contending' || strategyKey === 'win_now' || strategyKey === 'play_in_push'
                        ? `The ${team!.name} are looking to acquire depth at ${targets.join(' and ')} to solidify their playoff rotation.`
                        : strategyKey === 'retooling' || strategyKey === 'cap_clearing'
                        ? `The ${team!.name} could move veterans or contracts while targeting better balance at ${targets.join(' and ')}.`
                        : `The ${team!.name} could use an upgrade at the ${targets.join(' and ')} position${targets.length > 1 ? 's' : ''}.`;
                    }
                    return `There currently doesn't appear to be any targets for this team.`;
                  })()}
                </p>
              </div>
            </div>

            {/* Expiring Contracts */}
            {expiring.length > 0 && (
              <div className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
                <p>
                  Expiring contracts:{' '}
                  {expiring.slice(0, 3).map((p, i) => {
                    const k2 = getK2Ovr(p);
                    return (
                      <span key={i}>
                        <span onClick={() => onPlayerClick?.(p)} className="text-[#FDB927] font-medium cursor-pointer hover:underline">{p.name}</span> ({p.pos}, {k2}, ${((p.contract?.amount || 0) / 1000).toFixed(1)}M)
                        {i < Math.min(expiring.length, 3) - 1 ? ', ' : ''}
                      </span>
                    );
                  })}
                  {expiring.length > 3 && ` + ${expiring.length - 3} other players`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {/* ── Player Selector Modal ──────────────────────────────────────── */}
      {editingList && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => setEditingList(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm sm:text-lg font-black text-white uppercase tracking-widest">
                {editingList === 'untouchable' ? 'Untouchables' : editingList === 'block' ? 'Trading Block' : 'Target List'}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {editingList === 'untouchable' ? `${untouchableIds.size}/3` : editingList === 'block' ? `${blockIds.size}/5` : `${targetIds.size}/5`}
                </span>
                <button onClick={() => setEditingList(null)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-xs rounded-xl">Done</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <PlayerSelectorGrid
                items={editingList === 'targets' ? leagueTargetItems : ownRosterItems}
                teams={state.teams as any}
                selectedIds={editingList === 'untouchable' ? untouchableIds : editingList === 'block' ? blockIds : targetIds}
                onToggle={editingList === 'untouchable' ? toggleUntouchable : editingList === 'block' ? toggleBlock : toggleTarget}
                maxSelections={editingList === 'untouchable' ? 3 : 5}
                accentColor={editingList === 'untouchable' ? 'emerald' : editingList === 'block' ? 'red' : 'indigo'}
                searchPlaceholder={editingList === 'targets' ? 'Search league players...' : 'Search your roster...'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
