import React, { useMemo, useState } from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../../../../shared/PlayerSelectorGrid';
import { calcOvr2K, calcPot2K, calcPlayerTV, computeLeagueAvg, getPotColor, type TeamMode } from '../../../../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, getTeamPayrollUSD, topNAvgK2 } from '../../../../../utils/salaryUtils';
import { NBAPlayer, NBATeam } from '../../../../../types';
import { PlayerBioView } from '../../PlayerBioView';

interface TradingBlockProps {
  teamId: number;
}

const EXTERNAL = ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];

function ovrText(v: number): string {
  if (v >= 95) return 'text-violet-300';
  if (v >= 90) return 'text-blue-300';
  if (v >= 85) return 'text-emerald-300';
  if (v >= 78) return 'text-amber-300';
  if (v >= 72) return 'text-slate-300';
  return 'text-red-400';
}

export function TradingBlock({ teamId }: TradingBlockProps) {
  const { state } = useGame();
  const { players, teams, draftPicks } = state;
  const currentYear = state.leagueStats?.year ?? 2026;
  const allActive = players.filter(p => p.tid >= 0 && !EXTERNAL.includes(p.status ?? '') && p.status !== 'Draft Prospect');
  const teamPlayers = allActive.filter(p => p.tid === teamId);
  const team = teams.find(t => t.id === teamId);
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  // Determine team mode using real trade outlook
  const teamMode: TeamMode = useMemo(() => {
    if (!team) return 'rebuild';
    const payroll = getTeamPayrollUSD(players, teamId);
    const rec = effectiveRecord(team, currentYear);
    const confTeams = teams.filter(t => t.conference === team.conference).map(t => ({
      t, rec: effectiveRecord(t, currentYear),
    })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const lw = leader?.rec.wins ?? 0;
    const ll = leader?.rec.losses ?? 0;
    const idx = confTeams.findIndex(c => c.t.id === teamId);
    const confRank = idx >= 0 ? idx + 1 : 15;
    const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
    const expiring = players.filter(p => p.tid === teamId && (p.contract?.exp ?? 0) <= currentYear).length;
    const starAvg = topNAvgK2(players, teamId, 3);
    const outlook = getTradeOutlook(payroll, rec.wins, rec.losses, expiring, thresholds, confRank, gb, starAvg);
    if (outlook.role === 'heavy_buyer' || outlook.role === 'buyer') return 'contend';
    if (outlook.role === 'rebuilding') return 'presti';
    return 'rebuild';
  }, [team, players, teams, teamId, currentYear, thresholds]);

  if (teamPlayers.length === 0) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  const rosterWithTV = teamPlayers.map(p => ({
    player: p,
    tv: calcPlayerTV(p, teamMode, currentYear),
    ovr: calcOvr2K(p),
    pot: calcPot2K(p, currentYear),
  }));

  // ── Editable lists with state ─────────────────────────────────────────────
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === (state as any).userTeamId;

  // ── Smart defaults based on team mode ────────────────────────────────────
  // Helper: years with team (from stats history)
  const yearsWithTeam = (p: NBAPlayer): number => {
    if (!p.stats) return 1;
    return p.stats.filter((s: any) => s.tid === teamId && !s.playoffs && s.gp > 0).length || 1;
  };
  const playerAge = (p: NBAPlayer): number => p.born?.year ? currentYear - p.born.year : (p.age ?? 27);

  const defaultUntouchableIds = useMemo(() => {
    const candidates = rosterWithTV.filter(r => {
      const age = playerAge(r.player);
      const ywt = yearsWithTeam(r.player);

      // Loyalty: 10+ years with team = always untouchable (Curry rule)
      if (ywt >= 10) return true;

      if (teamMode === 'contend') {
        // Contending: K2 82+ are core rotation pieces
        return r.ovr >= 82;
      } else if (teamMode === 'presti' || teamMode === 'rebuild') {
        // Rebuilding: young (< 25) + high potential (POT 86+)
        return age < 25 && r.pot >= 86;
      } else {
        // Neutral: stars (K2 85+) or young high-potential
        return r.ovr >= 85 || (age < 24 && r.pot >= 88);
      }
    });
    return new Set(candidates.slice(0, 5).map(r => r.player.internalId));
  }, [rosterWithTV, teamMode, currentYear]);

  const defaultBlockIds = useMemo(() => {
    const utIds = defaultUntouchableIds;
    const candidates = rosterWithTV
      .filter(r => !utIds.has(r.player.internalId))
      .filter(r => {
        const age = playerAge(r.player);

        if (teamMode === 'contend') {
          // Contending: dump low-OVR or expiring non-contributors
          return r.ovr < 78 || (r.player.contract?.exp ?? currentYear + 5) <= currentYear + 1;
        } else if (teamMode === 'presti' || teamMode === 'rebuild') {
          // Rebuilding: dump expensive vets (age 28+, K2 75+)
          return age >= 28 && r.ovr >= 75;
        } else {
          // Neutral: overpaid or aging
          return (r.player.contract?.amount ?? 0) > 15000 && r.ovr < 82;
        }
      })
      .sort((a, b) => a.tv - b.tv);
    return new Set(candidates.slice(0, 5).map(r => r.player.internalId));
  }, [rosterWithTV, defaultUntouchableIds, teamMode, currentYear]);

  const [untouchableIds, setUntouchableIds] = useState<Set<string>>(() => defaultUntouchableIds);
  const [blockIds, setBlockIds] = useState<Set<string>>(() => defaultBlockIds);
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
  const [editingColumn, setEditingColumn] = useState<'untouchable' | 'block' | 'targets' | null>(null);
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  const untouchablesList = rosterWithTV.filter(r => untouchableIds.has(r.player.internalId));
  const tradingBlockList = rosterWithTV.filter(r => blockIds.has(r.player.internalId));

  // Target List: user-selected from other teams, or AI-suggested
  const otherPlayers = allActive.filter(p => p.tid !== teamId);
  const otherWithTV = useMemo(() => otherPlayers.map(p => ({
    player: p,
    tv: calcPlayerTV(p, teamMode, currentYear),
    ovr: calcOvr2K(p),
    pot: calcPot2K(p, currentYear),
  })), [otherPlayers, teamMode, currentYear]);

  const targetList = useMemo(() => {
    if (targetIds.size > 0) return otherWithTV.filter(r => targetIds.has(r.player.internalId));
    return [...otherWithTV]
      .sort((a, b) => teamMode === 'rebuild' || teamMode === 'presti' ? (b.pot - (b.player.age || 25)) - (a.pot - (a.player.age || 25)) : b.tv - a.tv)
      .slice(0, 5);
  }, [otherWithTV, targetIds, teamMode]);

  // Selector items
  const ownRosterItems: PlayerSelectorItem[] = useMemo(() =>
    rosterWithTV.map(r => ({ player: r.player, score: r.ovr, subtitle: `${r.ovr} OVR · TV ${r.tv}` })),
  [rosterWithTV]);

  const leagueItems: PlayerSelectorItem[] = useMemo(() =>
    otherWithTV.map(r => ({ player: r.player, score: r.ovr, subtitle: `${r.ovr} OVR` })),
  [otherWithTV]);

  const toggle = (list: 'untouchable' | 'block' | 'targets', id: string) => {
    const setter = list === 'untouchable' ? setUntouchableIds : list === 'block' ? setBlockIds : setTargetIds;
    const max = list === 'untouchable' ? 3 : 5;
    setter(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else if (n.size < max) n.add(id);
      return n;
    });
  };

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1">
        <EditableColumn title="Target List" items={targetList} teams={teams}
          onAdd={() => setEditingColumn('targets')} accentColor="#818cf8" onPlayerClick={setViewingPlayer} />
        <EditableColumn title="Trading Block" items={tradingBlockList} teams={teams}
          onAdd={() => setEditingColumn('block')} accentColor="#f87171" onPlayerClick={setViewingPlayer} />
        <EditableColumn title="Untouchables" items={untouchablesList} teams={teams}
          onAdd={() => setEditingColumn('untouchable')} accentColor="#34d399" onPlayerClick={setViewingPlayer} />
      </div>

      {/* ── Player Selector Modal ──────────────────────────────────── */}
      {editingColumn && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">
            <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm sm:text-lg font-black text-white uppercase tracking-widest">
                {editingColumn === 'untouchable' ? 'Untouchables (Max 3)' : editingColumn === 'block' ? 'Trading Block (Max 5)' : 'Target List (Max 5)'}
              </h3>
              <button onClick={() => setEditingColumn(null)} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-xs rounded-xl">Done</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <PlayerSelectorGrid
                items={editingColumn === 'targets' ? leagueItems : ownRosterItems}
                teams={teams as any}
                selectedIds={editingColumn === 'untouchable' ? untouchableIds : editingColumn === 'block' ? blockIds : targetIds}
                onToggle={(id) => toggle(editingColumn!, id)}
                maxSelections={editingColumn === 'untouchable' ? 3 : 5}
                accentColor={editingColumn === 'untouchable' ? 'emerald' : editingColumn === 'block' ? 'red' : 'indigo'}
                searchPlaceholder={editingColumn === 'targets' ? 'Search league players...' : 'Search your roster...'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TVItem {
  player: NBAPlayer;
  tv: number;
  ovr: number;
  pot: number;
}

function EditableColumn({ title, items, teams, onAdd, accentColor, onPlayerClick }: { title: string; items: TVItem[]; teams: NBATeam[]; onAdd?: () => void; accentColor?: string; onPlayerClick?: (p: NBAPlayer) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-[1.5px] font-bold border-b border-[#30363d] pb-3" style={{ color: accentColor ?? '#FDB927' }}>
        {title}
      </h2>
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-[#8b949e] text-xs italic py-4 text-center">No players set</p>
        )}
        {items.map((item, i) => {
          const team = teams.find(t => t.id === item.player.tid);
          return <PlayerCard key={i} item={item} teamLogoUrl={team?.logoUrl} onClick={() => onPlayerClick?.(item.player)} />;
        })}
        {onAdd && (
          <button
            onClick={onAdd}
            className="mt-2 flex items-center justify-center gap-2 bg-white/5 border border-transparent hover:border-[#30363d] text-[#8b949e] hover:text-white py-3 px-4 rounded transition-colors font-bold uppercase text-[10px] tracking-widest"
          >
            + Edit List
          </button>
        )}
      </div>
    </div>
  );
}

/** TV → half-star rating (0.5 increments, max 5) */
function tvToStars(tv: number): number {
  if (tv >= 200) return 5;
  if (tv >= 160) return 4.5;
  if (tv >= 120) return 4;
  if (tv >= 90) return 3.5;
  if (tv >= 60) return 3;
  if (tv >= 40) return 2.5;
  if (tv >= 25) return 2;
  if (tv >= 12) return 1.5;
  if (tv >= 5) return 1;
  return 0.5;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-[1px] shrink-0">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = stars >= i + 1;
        const half = !filled && stars >= i + 0.5;
        return (
          <span key={i} className={cn("text-[10px]", filled || half ? "text-[#FDB927]" : "text-[#30363d]")}>
            {half ? '⯪' : '★'}
          </span>
        );
      })}
    </div>
  );
}

function PlayerCard({ item, teamLogoUrl, onClick }: { item: TVItem; teamLogoUrl?: string; onClick?: () => void }) {
  const { player, ovr, pot, tv } = item;
  const stars = tvToStars(tv);

  return (
    <div onClick={onClick} className="bg-[#161b22]/60 backdrop-blur-md border border-[#30363d] rounded p-3 flex items-center gap-3 group hover:border-[#FDB927] transition-colors cursor-pointer relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-[#FDB927] transition-colors" />

      <PlayerPortrait
        playerName={player.name}
        imgUrl={player.imgURL}
        teamLogoUrl={teamLogoUrl}
        size={40}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="font-bold text-[#e6edf3] uppercase text-sm truncate group-hover:text-[#FDB927] transition-colors">{player.name}</span>
        <span className="text-[#8b949e] text-[10px] font-bold uppercase tracking-wider">{player.pos}{player.born?.year || player.age ? ` | ${player.born?.year ? (new Date().getFullYear() - player.born.year) : player.age}y` : ''}</span>
      </div>

      {/* OVR + POT */}
      <div className="flex flex-col items-end flex-shrink-0">
        <div className={cn("text-xs font-black tabular-nums", ovrText(ovr))}>{ovr}</div>
        <div className={cn("text-[10px] font-bold tabular-nums", getPotColor(pot))}>{pot}</div>
      </div>

      <StarRating stars={stars} />
    </div>
  );
}
