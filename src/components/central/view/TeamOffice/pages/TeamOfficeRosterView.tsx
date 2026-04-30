import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { convertTo2KRating } from '../../../../../utils/helpers';
import { calculatePlayerOverallForYear, getDisplayPotential } from '../../../../../utils/playerRatings';
import { computeMoodScore } from '../../../../../utils/mood/moodScore';
import { getGMAttributes, findGMForTeam } from '../../../../../services/staff/gmAttributes';
import { StarterService } from '../../../../../services/simulation/StarterService';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import type { NBAPlayer } from '../../../../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSalary(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${(usd / 1_000).toFixed(0)}K`;
}

function getK2WithDelta(p: NBAPlayer, currentYear: number): { k2: number; delta: number | null } {
  const currR = p.ratings?.[p.ratings.length - 1];
  const k2 = convertTo2KRating(p.overallRating, currR?.hgt ?? 50, currR?.tp ?? 50);
  if (!p.ratings || p.ratings.length < 2) return { k2, delta: null };
  const prevOvr = calculatePlayerOverallForYear(p as any, currentYear - 1);
  const prevR = p.ratings.find(r => r.season === currentYear - 1) ?? p.ratings[p.ratings.length - 2];
  const prevK2 = convertTo2KRating(prevOvr, prevR?.hgt ?? 50, prevR?.tp ?? 50);
  return { k2, delta: k2 - prevK2 };
}

function getPotWithDelta(p: NBAPlayer, currentYear: number): { pot: number; delta: number | null } {
  const pot = getDisplayPotential(p, currentYear);
  if (!p.ratings || p.ratings.length < 2) return { pot, delta: null };
  const prevPot = getDisplayPotential(p, currentYear - 1);
  return { pot, delta: pot - prevPot };
}

function getLastSeasonStats(p: NBAPlayer) {
  const stats = ((p as any).stats ?? []) as any[];
  const last = stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).slice(-1)[0];
  if (!last) return null;
  const gp = last.gp;
  return {
    g: gp,
    mp: (last.min ?? 0) / gp,
    pts: (last.pts ?? 0) / gp,
    reb: ((last.orb ?? 0) + (last.drb ?? 0)) / gp || (last.trb ?? 0) / gp,
    ast: (last.ast ?? 0) / gp,
    per: last.per ?? 0,
  };
}

function getYearsWithTeam(p: NBAPlayer, teamId: number): number {
  const seasons = new Set<number>();
  ((p as any).stats ?? []).forEach((s: any) => {
    if (!s.playoffs && s.tid === teamId) seasons.add(s.season);
  });
  return seasons.size;
}

const fmt1 = (v: number) => (Number.isFinite(v) && v > 0 ? v.toFixed(1) : '—');

// ── Types ──────────────────────────────────────────────────────────────────────

type SortMode = 'rating' | 'rotation' | 'gameplan';
type SortCol = 'name' | 'num' | 'pos' | 'age' | 'k2' | 'pot' | 'salary' | 'exp' | 'ywt' | 'g' | 'mp' | 'pts' | 'reb' | 'ast' | 'per' | 'mood';

interface RowData {
  player: NBAPlayer;
  jerseyNum: string;
  k2: number;
  k2Delta: number | null;
  pot: number;
  potDelta: number | null;
  age: number;
  currentSalaryUSD: number;
  yearsLeft: number;
  ywt: number;
  g: number;
  mp: number;
  pts: number;
  reb: number;
  ast: number;
  per: number;
  moodScore: number;
  isTwoWay: boolean;
  isNonGuaranteed: boolean;
  isInjured: boolean;
  injuryType: string;
}

interface Props {
  teamId: number;
}

// ── Sidebar attribute bar ─────────────────────────────────────────────────────

const ATTR_TOOLTIPS = {
  trade_aggression: 'How often this GM initiates trades.',
  scouting_focus: 'Preference for hoarding draft picks versus trading them for proven young players.',
  work_ethic: 'Appetite for constant roster churn versus keeping the same group together.',
  spending: 'Sets the opening offer in free agency — high-spending GMs start above market; value hunters start lean.',
};

function AttributeBar({ label, value, tooltip }: { label: string; value: number; tooltip?: string }) {
  const barColor = value >= 80 ? 'bg-[#FDB927]' : value >= 70 ? 'bg-slate-300' : 'bg-slate-500';
  return (
    <div className="flex flex-col gap-1.5 group relative cursor-help">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <span className="text-sm font-black text-slate-100">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
        <div className={cn('h-full transition-all duration-700', barColor)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      {tooltip && (
        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-52 bg-[#0d1117] border border-[#30363d] rounded p-2 z-50 text-[10px] text-white leading-snug shadow-2xl">
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TeamOfficeRosterView({ teamId }: Props) {
  const { state } = useGame();
  const quick = usePlayerQuickActions();
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  const currentYear = state.leagueStats?.year ?? 2026;

  const team = state.teams.find(t => t.id === teamId);
  const teamColor = team?.colors?.[0] ?? '#552583';

  const teamPlayers = useMemo(
    () => (state.players ?? []).filter(p => p.tid === teamId),
    [state.players, teamId],
  );

  const rosterCounts = useMemo(() => {
    const activePlayers = teamPlayers.filter(p => p.status === 'Active' && p.contract);
    const twoWayCount = activePlayers.filter(p => !!(p as any).twoWay).length;
    const nonGuaranteedCount = activePlayers.filter(p => !!(p as any).nonGuaranteed).length;
    const guaranteedCount = Math.max(0, activePlayers.length - twoWayCount - nonGuaranteedCount);
    return {
      total: activePlayers.length,
      guaranteedCount,
      twoWayCount,
      nonGuaranteedCount,
    };
  }, [teamPlayers]);

  const [sortMode, setSortMode] = useState<SortMode>(
    () => (localStorage.getItem('rosterSortMode') as SortMode | null) ?? 'rating',
  );
  const handleSortMode = (m: SortMode) => { setSortMode(m); localStorage.setItem('rosterSortMode', m); };
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'k2', dir: 'desc' });

  const handleSort = (col: SortCol) => {
    if (sortMode !== 'rating') return;
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const canSort = sortMode === 'rating';

  const SortTh = ({ col, label, cls = 'text-right' }: { col: SortCol; label: string; cls?: string }) => (
    <th
      className={cn(
        cls, 'px-1.5 py-2 whitespace-nowrap text-[9px] uppercase tracking-wider font-bold transition-colors',
        canSort ? 'cursor-pointer hover:text-slate-300' : 'cursor-default text-slate-600',
      )}
      onClick={() => handleSort(col)}
    >
      {label}{canSort && sort.col === col && <span className="ml-0.5 text-amber-400">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
    </th>
  );

  // GM sidebar
  const gmObj = findGMForTeam(state, teamId);
  const gmAttrs = getGMAttributes(state, teamId);
  let gmName = gmObj?.name ?? '';
  let gmPortrait = gmObj?.playerPortraitUrl ?? '';
  if (isOwnTeam && state.commissionerName) {
    gmName = state.commissionerName;
    gmPortrait = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.commissionerName)}&background=${teamColor.replace('#', '')}&color=fff&size=256&bold=true`;
  }

  const allRows = useMemo((): RowData[] => {
    const active = teamPlayers.filter(p => p.status === 'Active' && p.contract);
    return active.map(p => {
      const { k2, delta: k2Delta } = getK2WithDelta(p, currentYear);
      const { pot, delta: potDelta } = getPotWithDelta(p, currentYear);
      const stats = getLastSeasonStats(p);
      const { score: moodScore } = computeMoodScore(
        p, team, state.date, false, false, false, teamPlayers, currentYear,
      );
      const yearsLeft = Math.max(0, (p.contract?.exp ?? currentYear) - currentYear);
      return {
        player: p,
        jerseyNum: (p as any).jerseyNumber ?? '—',
        k2,
        k2Delta,
        pot,
        potDelta,
        age: p.born?.year ? currentYear - p.born.year : (p.age ?? 0),
        currentSalaryUSD: (p.contract?.amount ?? 0) * 1_000,
        yearsLeft,
        ywt: getYearsWithTeam(p, teamId),
        g: stats?.g ?? 0,
        mp: stats?.mp ?? 0,
        pts: stats?.pts ?? 0,
        reb: stats?.reb ?? 0,
        ast: stats?.ast ?? 0,
        per: stats?.per ?? 0,
        moodScore,
        isTwoWay: !!(p as any).twoWay,
        isNonGuaranteed: !!(p as any).nonGuaranteed,
        isInjured: ((p as any).injury?.gamesRemaining ?? 0) > 0,
        injuryType: (p as any).injury?.type ?? 'Injured',
      };
    });
  }, [teamPlayers, team, state.date, state.leagueStats, currentYear, teamId]);

  const rows = useMemo((): RowData[] => {
    if (sortMode === 'rotation' && team) {
      const healthy = teamPlayers.filter(p => p.status === 'Active' && !((p as any).injury?.gamesRemaining > 0));
      const rawStarters = StarterService.getProjectedStarters(team, state.players, currentYear, healthy);
      const startersSorted = StarterService.sortByPositionSlot(rawStarters, currentYear);
      const starterIds = new Set(startersSorted.map(p => p.internalId));
      const starterRows = startersSorted
        .map(p => allRows.find(r => r.player.internalId === p.internalId))
        .filter(Boolean) as RowData[];
      const benchRows = allRows
        .filter(r => !starterIds.has(r.player.internalId) && !r.isInjured)
        .sort((a, b) => b.k2 - a.k2);
      const injuredRows = allRows.filter(r => r.isInjured).sort((a, b) => b.k2 - a.k2);
      return [...starterRows, ...benchRows, ...injuredRows];
    }

    if (sortMode === 'gameplan') {
      return [...allRows].sort((a, b) => {
        if (a.isInjured !== b.isInjured) return a.isInjured ? 1 : -1;
        const perDiff = b.per - a.per;
        if (Math.abs(perDiff) > 0.1) return perDiff;
        return b.mp - a.mp;
      });
    }

    // 'rating' — column-sortable
    return [...allRows].sort((a, b) => {
      const { col, dir } = sort;
      let av: any = 0, bv: any = 0;
      if (col === 'name')   { av = a.player.name; bv = b.player.name; }
      else if (col === 'num')    { av = parseInt(a.jerseyNum) || 99; bv = parseInt(b.jerseyNum) || 99; }
      else if (col === 'pos')    { av = a.player.pos ?? ''; bv = b.player.pos ?? ''; }
      else if (col === 'age')    { av = a.age;  bv = b.age; }
      else if (col === 'k2')     { av = a.k2;   bv = b.k2; }
      else if (col === 'pot')    { av = a.pot;  bv = b.pot; }
      else if (col === 'salary') { av = a.currentSalaryUSD; bv = b.currentSalaryUSD; }
      else if (col === 'exp')    { av = a.player.contract?.exp ?? 0; bv = b.player.contract?.exp ?? 0; }
      else if (col === 'ywt')    { av = a.ywt;  bv = b.ywt; }
      else if (col === 'g')      { av = a.g;    bv = b.g; }
      else if (col === 'mp')     { av = a.mp;   bv = b.mp; }
      else if (col === 'pts')    { av = a.pts;  bv = b.pts; }
      else if (col === 'reb')    { av = a.reb;  bv = b.reb; }
      else if (col === 'ast')    { av = a.ast;  bv = b.ast; }
      else if (col === 'per')    { av = a.per;  bv = b.per; }
      else if (col === 'mood')   { av = a.moodScore; bv = b.moodScore; }
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === 'asc' ? av - bv : bv - av;
    });
  }, [allRows, sort, sortMode, team, teamPlayers, state.players, currentYear]);

  // In rotation mode, inject a "Bench" divider after row index 4 (starters = 0-4)
  const rotationStarterCount = sortMode === 'rotation' && team
    ? Math.min(5, rows.filter(r => !r.isInjured).length)
    : 0;

  // Starter IDs for rotation + gameplan highlight
  const starterIds = useMemo((): Set<string> => {
    if ((sortMode === 'rotation' || sortMode === 'gameplan') && team) {
      const healthy = teamPlayers.filter(p => p.status === 'Active' && !((p as any).injury?.gamesRemaining > 0));
      const starters = StarterService.getProjectedStarters(team, state.players, currentYear, healthy);
      return new Set(starters.map(p => p.internalId));
    }
    return new Set();
  }, [sortMode, team, teamPlayers, state.players, currentYear]);

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
      {/* Mobile-only GM strip */}
      <div className="md:hidden flex items-center gap-3 mb-2 rounded-lg border border-[#30363d] bg-slate-900/60 px-3 py-2">
        <div className="w-9 h-9 rounded-full border border-white/10 overflow-hidden bg-slate-800/50 shrink-0">
          <PlayerPortrait playerName={gmName || 'GM'} imgUrl={gmPortrait} size={36} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-black text-slate-100 truncate">{gmName || 'Unknown GM'}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400">
            {isOwnTeam ? 'You · GM' : 'General Manager'}
          </div>
        </div>
        <div className="flex gap-3 ml-auto shrink-0 text-center">
          <div>
            <div className="text-[8px] uppercase tracking-widest text-slate-500">W</div>
            <div className="text-sm font-black text-slate-200">{team?.wins ?? 0}</div>
          </div>
          <div>
            <div className="text-[8px] uppercase tracking-widest text-slate-500">L</div>
            <div className="text-sm font-black text-slate-200">{team?.losses ?? 0}</div>
          </div>
        </div>
        <select
          value={sortMode}
          onChange={e => handleSortMode(e.target.value as SortMode)}
          className="ml-2 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-200 outline-none cursor-pointer shrink-0"
        >
          <option value="rating">OVR</option>
          <option value="rotation">Rotation</option>
          <option value="gameplan">PER</option>
        </select>
      </div>

      <div className="h-full flex gap-4 min-h-0">
        {/* GM Sidebar — LEFT (desktop only) */}
        <aside className="hidden md:flex w-[210px] shrink-0 flex-col gap-3">
          {/* GM card */}
          <div
            className="rounded-lg p-3 border border-[#30363d] relative overflow-hidden shrink-0"
            style={{ background: `linear-gradient(135deg, ${teamColor}22, transparent)` }}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-14 h-14 rounded-full border-2 border-white/10 overflow-hidden bg-slate-800/50 shrink-0">
                <PlayerPortrait playerName={gmName || 'GM'} imgUrl={gmPortrait} size={56} />
              </div>
              <div>
                <div className="text-xs font-black text-slate-100 leading-tight">{gmName || 'Unknown GM'}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400 mt-0.5">
                  {isOwnTeam ? 'You · GM' : 'General Manager'}
                </div>
              </div>
              <div className="flex gap-4 mt-1">
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-slate-500">W</div>
                  <div className="text-sm font-black text-slate-200">{team?.wins ?? 0}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-slate-500">L</div>
                  <div className="text-sm font-black text-slate-200">{team?.losses ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          {/* GM Attributes + Sort dropdown */}
          <div className="rounded-lg border border-[#30363d] bg-slate-900/50 p-3 flex flex-col gap-3 flex-1 min-h-0">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800 pb-2">
              GM Attributes
            </div>
            <AttributeBar label="Trade Aggr." value={gmAttrs.trade_aggression} tooltip={ATTR_TOOLTIPS.trade_aggression} />
            <AttributeBar label="Scouting"    value={gmAttrs.scouting_focus}   tooltip={ATTR_TOOLTIPS.scouting_focus} />
            <AttributeBar label="Work Ethic"  value={gmAttrs.work_ethic}        tooltip={ATTR_TOOLTIPS.work_ethic} />
            <AttributeBar label="Spending"    value={gmAttrs.spending}          tooltip={ATTR_TOOLTIPS.spending} />

            {/* Sort mode dropdown */}
            <div className="mt-auto pt-3 border-t border-slate-800">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Sort View</div>
              <select
                value={sortMode}
                onChange={e => handleSortMode(e.target.value as SortMode)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-200 outline-none cursor-pointer"
              >
                <option value="rating">↕ By Rating (OVR)</option>
                <option value="rotation">📋 By Rotation</option>
                <option value="gameplan">📊 By Game Plan (PER)</option>
              </select>
            </div>
          </div>
        </aside>

        {/* Main Roster Table */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-3 shrink-0 text-[10px] text-slate-500">
            <span>{rosterCounts.total} players</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500/50 border border-emerald-500/60 inline-block" />
              {rosterCounts.guaranteedCount}/15 guaranteed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-violet-500/50 border border-violet-500/60 inline-block" />
              {rosterCounts.twoWayCount}/3 two-way
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-amber-500/30 border border-amber-500/50 inline-block" />
              {rosterCounts.nonGuaranteedCount} non-guaranteed
            </span>
            {sortMode !== 'rating' && (
              <span className="ml-auto text-slate-600 italic">
                {sortMode === 'rotation' ? 'Rotation locked · click By Rating to sort columns' : 'Game Plan (PER) · click By Rating to sort columns'}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-[#30363d] bg-black/40 scrollbar-hide">
            <table className="w-full text-xs min-w-[900px]">
              <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
                <tr className={cn('border-b border-slate-800', canSort ? 'text-slate-400' : 'text-slate-600')}>
                  <SortTh col="num"    label="#"    cls="text-center" />
                  <th
                    className={cn(
                      'text-left px-2 py-2 whitespace-nowrap text-[9px] uppercase tracking-wider font-bold transition-colors',
                      canSort ? 'cursor-pointer hover:text-slate-300 text-slate-400' : 'cursor-default text-slate-600',
                    )}
                    onClick={() => handleSort('name')}
                  >
                    Name{canSort && sort.col === 'name' && <span className="ml-0.5 text-amber-400">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
                  </th>
                  <SortTh col="pos"    label="Pos"  cls="text-center" />
                  <SortTh col="age"    label="Age"  cls="text-center" />
                  <SortTh col="k2"     label="Ovr" />
                  <SortTh col="pot"    label="Pot" />
                  <SortTh col="salary" label="Contract" />
                  <SortTh col="exp"    label="Exp"  cls="text-center" />
                  <SortTh col="ywt"    label="YWT"  cls="text-center" />
                  <SortTh col="g"      label="G"    cls="text-center" />
                  <SortTh col="mp"     label="MP" />
                  <SortTh col="pts"    label="PTS" />
                  <SortTh col="reb"    label="TRB" />
                  <SortTh col="ast"    label="AST" />
                  <SortTh col="per"    label="PER" />
                  <SortTh col="mood"   label="Mood" cls="text-left" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const p = r.player;
                  const isExpiring = r.yearsLeft === 0;
                  const moodPct = Math.round(((r.moodScore + 10) / 20) * 100);
                  const moodBarColor =
                    r.moodScore >= 5 ? 'bg-emerald-400' :
                    r.moodScore >= 1 ? 'bg-amber-400' :
                    r.moodScore >= -1 ? 'bg-slate-400' : 'bg-rose-400';

                  // Bench divider in rotation mode
                  const showBenchDivider = sortMode === 'rotation' && idx === rotationStarterCount && rotationStarterCount > 0;
                  // Injury divider in rotation mode
                  const showInjuredDivider = sortMode === 'rotation' && r.isInjured && !rows[idx - 1]?.isInjured;
                  // Starter highlight for rotation + gameplan
                  const isStarter = starterIds.has(p.internalId);

                  return (
                    <React.Fragment key={p.internalId}>
                      {showBenchDivider && (
                        <tr>
                          <td colSpan={16} className="py-0.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-px bg-slate-700/40" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Bench</span>
                              <div className="flex-1 h-px bg-slate-700/40" />
                            </div>
                          </td>
                        </tr>
                      )}
                      {showInjuredDivider && (
                        <tr>
                          <td colSpan={16} className="py-0.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-px bg-rose-700/30" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-rose-600">Injured</span>
                              <div className="flex-1 h-px bg-rose-700/30" />
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr
                        className={cn(
                          'border-t border-slate-800/60 cursor-pointer transition-colors',
                          r.isInjured
                            ? 'opacity-50 hover:opacity-70'
                            : isStarter && !r.isTwoWay && !r.isNonGuaranteed
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 border-l-2 border-l-amber-400'
                            : r.isTwoWay
                            ? 'bg-violet-500/10 hover:bg-violet-500/20 border-l-2 border-l-violet-500'
                            : r.isNonGuaranteed
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 border-l-2 border-l-amber-500'
                            : 'hover:bg-white/5',
                        )}
                        onClick={() => quick.openFor(p)}
                      >
                        <td className="text-center tabular-nums px-1.5 text-slate-500 font-mono text-[10px]">
                          {r.jerseyNum}
                        </td>

                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <PlayerPortrait playerName={p.name} imgUrl={p.imgURL} face={(p as any).face} size={24} />
                            <span className="font-semibold truncate max-w-[90px] text-slate-100">{p.name}</span>
                            {isStarter && (sortMode === 'rotation' || sortMode === 'gameplan') && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 shrink-0">S</span>
                            )}
                            {r.isInjured && (
                              <span
                                title={`Out — ${r.injuryType}`}
                                className="text-[8px] font-black text-red-500 shrink-0 cursor-help"
                              >✚</span>
                            )}
                            {r.isTwoWay && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-violet-500/30 text-violet-300 border border-violet-500/50 shrink-0">2W</span>
                            )}
                            {r.isNonGuaranteed && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 shrink-0">NG</span>
                            )}
                          </div>
                        </td>

                        <td className="text-center text-slate-400 px-1.5">{p.pos}</td>
                        <td className="text-center text-slate-400 tabular-nums px-1.5">{r.age}</td>

                        <td className="text-right tabular-nums px-1.5 whitespace-nowrap">
                          <span className={cn(
                            'font-black',
                            r.k2 >= 90 ? 'text-blue-300' : r.k2 >= 85 ? 'text-emerald-300' : r.k2 >= 78 ? 'text-amber-300' : 'text-slate-400',
                          )}>{r.k2}</span>
                          {r.k2Delta !== null && r.k2Delta !== 0 && (
                            <span className={cn('ml-1 text-[9px] font-bold', r.k2Delta > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                              {r.k2Delta > 0 ? '+' : ''}{r.k2Delta}
                            </span>
                          )}
                        </td>

                        <td className="text-right tabular-nums px-1.5 whitespace-nowrap">
                          <span className={cn(
                            'font-semibold',
                            r.pot >= 90 ? 'text-blue-300/80' : r.pot >= 85 ? 'text-emerald-300/80' : r.pot >= 78 ? 'text-amber-300/80' : 'text-slate-500',
                          )}>{r.pot}</span>
                          {r.potDelta !== null && r.potDelta !== 0 && (
                            <span className={cn('ml-1 text-[9px]', r.potDelta > 0 ? 'text-emerald-400/70' : 'text-rose-400/70')}>
                              {r.potDelta > 0 ? '+' : ''}{r.potDelta}
                            </span>
                          )}
                        </td>

                        <td className="text-right tabular-nums px-1.5 whitespace-nowrap text-slate-300">
                          {r.currentSalaryUSD > 0 ? fmtSalary(r.currentSalaryUSD) : <span className="text-slate-600">—</span>}
                        </td>

                        <td className="text-center tabular-nums px-1.5">
                          <span className={cn('text-[10px] font-bold', isExpiring ? 'text-rose-300 font-black' : 'text-slate-500')}>
                            {p.contract?.exp ?? '—'}
                          </span>
                        </td>

                        <td className="text-center tabular-nums px-1.5 text-slate-400">{r.ywt}</td>
                        <td className="text-center tabular-nums px-1 text-slate-400">
                          {r.g > 0 ? r.g : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{r.mp > 0 ? fmt1(r.mp) : <span className="text-slate-600">—</span>}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.pts)}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.reb)}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.ast)}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.per)}</td>

                        <td className="px-2 py-1.5" style={{ minWidth: 80 }}>
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                              <div className={cn('h-full rounded transition-all', moodBarColor)} style={{ width: `${moodPct}%` }} />
                            </div>
                            <span className="text-[9px] text-slate-500 tabular-nums w-6 text-right shrink-0">
                              {r.moodScore >= 0 ? '+' : ''}{r.moodScore.toFixed(1)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {createPortal(quick.portals, document.body)}
    </>
  );
}
