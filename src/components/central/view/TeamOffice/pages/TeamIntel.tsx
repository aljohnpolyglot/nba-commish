import React, { useMemo, useState } from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../../../../shared/PlayerSelectorGrid';
import { StarterService } from '../../../../../services/simulation/StarterService';
import { convertTo2KRating } from '../../../../../utils/helpers';
import { NBAPlayer } from '../../../../../types';
import { calcPlayerTV, calcOvr2K, type TeamMode } from '../../../../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, topNAvgK2 } from '../../../../../utils/salaryUtils';

interface TeamIntelProps {
  teamId: number;
}

/** Get K2 (2K-style) overall for a player */
function getK2Ovr(p: NBAPlayer): number {
  const r = p.ratings?.[p.ratings.length - 1];
  if (!r) return p.overallRating;
  return convertTo2KRating(p.overallRating, r.hgt ?? 50, r.tp ?? 50);
}

export function TeamIntel({ teamId }: TeamIntelProps) {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const players = (state.players || []).filter(p => p.tid === teamId && p.status === 'Active');
  const allPlayers = (state.players || []).filter(p => p.tid >= 0 && p.status === 'Active');
  const teamColor = team?.colors?.[0] || '#552583';
  const teamName = team ? `${team.region} ${team.name}` : '';

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  // Use StarterService for projected starters (returns best 5 in a natural lineup)
  const starters = StarterService.getProjectedStarters(team, state.players);

  // Sort starters: G → G → F → F → C
  const posOrder: Record<string, number> = { PG: 0, G: 1, SG: 2, GF: 3, SF: 4, F: 5, PF: 6, FC: 7, C: 8 };
  const sortedStarters = [...starters.slice(0, 5)].sort(
    (a, b) => (posOrder[a.pos || 'F'] ?? 5) - (posOrder[b.pos || 'F'] ?? 5)
  );

  const lineup: { player: NBAPlayer; lineupPos: string }[] = [];
  const usedIds = new Set<string>();

  sortedStarters.forEach((p) => {
    lineup.push({ player: p, lineupPos: p.pos || 'F' });
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

  // Status — compare team's top-8 K2 average to league average
  const teamTop8K2 = sortedByK2.slice(0, 8);
  const avgK2 = teamTop8K2.length > 0
    ? teamTop8K2.reduce((a, p) => a + getK2Ovr(p), 0) / teamTop8K2.length
    : 0;

  const allTeamIds = [...new Set(allPlayers.map(p => p.tid))];
  const leagueAvgK2 = allTeamIds.reduce((sum, tid) => {
    const roster = allPlayers.filter(p => p.tid === tid).sort((a, b) => getK2Ovr(b) - getK2Ovr(a)).slice(0, 8);
    return sum + (roster.reduce((s, p) => s + getK2Ovr(p), 0) / Math.max(1, roster.length));
  }, 0) / Math.max(1, allTeamIds.length);

  // ── Real trade outlook using salaryUtils ──────────────────────────────────
  const currentYear = state.leagueStats?.year || 2026;
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  const { status, teamMode, tradingBlock, untouchables, targets, needPositions } = useMemo(() => {
    const payroll = players.reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000), 0);
    const rec = effectiveRecord(team!, currentYear);
    const confTeams = state.teams.filter(t => t.conference === team!.conference).map(t => ({
      t, rec: effectiveRecord(t, currentYear),
    })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const idx = confTeams.findIndex(c => c.t.id === teamId);
    const confRank = idx >= 0 ? idx + 1 : 15;
    const gb = Math.max(0, ((leader?.rec.wins ?? 0) - rec.wins + rec.losses - (leader?.rec.losses ?? 0)) / 2);
    const expCount = players.filter(p => (p.contract?.exp ?? 0) <= currentYear).length;
    const starAvg = topNAvgK2(state.players, teamId, 3);
    const outlook = getTradeOutlook(payroll, rec.wins, rec.losses, expCount, thresholds, confRank, gb, starAvg);

    // Derive mode
    let mode: TeamMode = 'rebuild';
    let statusLabel = 'REBUILDING';
    if (outlook.role === 'heavy_buyer' || outlook.role === 'buyer') { mode = 'contend'; statusLabel = 'CONTENDING'; }
    else if (outlook.role === 'seller') { mode = 'rebuild'; statusLabel = 'SELLING'; }
    else if (outlook.role === 'rebuilding') { mode = 'presti'; statusLabel = 'REBUILDING'; }
    else { mode = 'rebuild'; statusLabel = 'BUYING'; }

    // Trade value for each player
    const rosterTV = players.map(p => ({
      player: p,
      tv: calcPlayerTV(p, mode, currentYear),
      k2: calcOvr2K(p),
    })).sort((a, b) => b.tv - a.tv);

    // Untouchables: top-2 players with K2 >= 85 and TV >= 30
    const untouchList = rosterTV.filter(r => r.k2 >= 85 && r.tv >= 30).slice(0, 2);

    // Trading block: players the team would be willing to move
    // Rebuilding: dump high-salary vets; Contending: dump low-OVR expirings
    let blockList: typeof rosterTV = [];
    if (mode === 'contend') {
      // Contenders trade away low-value expirings
      blockList = rosterTV.filter(r => r.k2 < 80 && (r.player.contract?.exp ?? currentYear + 5) <= currentYear + 1).slice(0, 3);
    } else if (mode === 'presti') {
      // Rebuilders: trade anyone not young + high potential
      const age = (p: NBAPlayer) => p.born?.year ? currentYear - p.born.year : 27;
      blockList = rosterTV.filter(r => age(r.player) >= 28 && r.k2 >= 75).slice(0, 4);
    } else {
      // Sellers: anyone with salary > $10M and K2 < 85
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
      teamMode: mode,
      tradingBlock: blockList,
      untouchables: untouchList,
      targets: weakPos,
      needPositions: weakPos,
    };
  }, [players, state.teams, state.players, teamId, currentYear, thresholds, team]);

  // Expiring contracts
  const expiring = [...players]
    .filter(p => p.contract && p.contract.exp <= currentYear)
    .sort((a, b) => getK2Ovr(b) - getK2Ovr(a));

  // ── Editable lists (own team only) ──────────────────────────────────────
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  const [editingList, setEditingList] = useState<'untouchable' | 'block' | 'targets' | null>(null);

  // User-editable untouchable + trading block IDs (persisted on state if available)
  const [untouchableIds, setUntouchableIds] = useState<Set<string>>(() =>
    new Set(untouchables.map(r => r.player.internalId))
  );
  const [blockIds, setBlockIds] = useState<Set<string>>(() =>
    new Set(tradingBlock.map(r => r.player.internalId))
  );
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());

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

  const toggleUntouchable = (id: string) => {
    setUntouchableIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else if (n.size < 3) n.add(id);
      return n;
    });
  };
  const toggleBlock = (id: string) => {
    setBlockIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else if (n.size < 5) n.add(id);
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

      {/* Content Split */}
      <div className="flex-1 flex flex-col lg:flex-row border border-[#30363d] rounded-b-lg overflow-hidden bg-[#161b22]/80 backdrop-blur-md">

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
                <div key={i} className="grid grid-cols-[40px_40px_1fr_40px] gap-2 items-center px-2 py-2 bg-white/5 rounded hover:bg-white/10 transition-colors cursor-pointer group">
                  <span className="text-[#8b949e] font-bold text-xs">{lineupPos}</span>
                  <PlayerPortrait playerName={p.name} imgUrl={p.imgURL} size={32} />
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
            <div className="font-black text-lg tracking-widest uppercase">{status}</div>
          </div>

          <div className="p-8 space-y-6 text-sm text-[#e6edf3]/90 leading-relaxed">
            {/* Team Outlook */}
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
              <p>
                {status === 'REBUILDING'
                  ? `The ${team.name} are clearly in rebuild mode and will likely be looking to dump players for picks.`
                  : status === 'SELLING'
                  ? `The ${team.name} are looking to shed salary and acquire young talent or draft capital.`
                  : status === 'BUYING'
                  ? `We might be able to get draft picks from this team, as they think they are a few pieces away from having a championship team.`
                  : `This team is in win-now mode and will be looking for veteran pieces to push them over the top.`}
              </p>
            </div>

            {/* Trading Block */}
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
              <div className="flex-1">
                <p>
                  {(() => {
                    const blockPlayers = isOwnTeam
                      ? players.filter(p => blockIds.has(p.internalId))
                      : tradingBlock.map(r => r.player);
                    if (blockPlayers.length > 0) return (
                      <>
                        {isOwnTeam ? 'Your trading block: ' : status === 'CONTENDING' ? 'Players this team is willing to move: ' : 'Players potentially available via trade: '}
                        {blockPlayers.map((p, i) => (
                          <span key={i}>
                            <span className="text-[#FDB927] font-medium">{p.name}</span> ({p.pos}, {getK2Ovr(p)} OVR)
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

            {/* Untouchables */}
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] mt-2 shrink-0" />
              <div className="flex-1">
                <p>
                  {(() => {
                    const untouchPlayers = isOwnTeam
                      ? players.filter(p => untouchableIds.has(p.internalId))
                      : untouchables.map(r => r.player);
                    if (untouchPlayers.length > 0) return (
                      <>
                        Untouchables:{' '}
                        {untouchPlayers.map((p, i) => (
                          <span key={i}>
                            <span className="text-[#FDB927] font-bold">{p.name}</span> ({getK2Ovr(p)} OVR)
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
                                <span className="text-[#FDB927] font-medium">{p.name}</span> ({tTeam?.abbrev}, {getK2Ovr(p)} OVR)
                                {i < targetPlayers.length - 1 ? ', ' : ''}
                              </span>
                            );
                          })}
                        </>
                      );
                    }
                    if (targets.length > 0) {
                      return status === 'CONTENDING'
                        ? `The ${team!.name} are looking to acquire depth at ${targets.join(' and ')} to solidify their playoff rotation.`
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
                        <span className="text-[#FDB927] font-medium cursor-pointer hover:underline">{p.name}</span> ({p.pos}, {k2}, ${((p.contract?.amount || 0) / 1000).toFixed(1)}M)
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

      {/* ── Player Selector Modal ──────────────────────────────────────── */}
      {editingList && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => setEditingList(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]" onClick={e => e.stopPropagation()}>
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
  );
}
