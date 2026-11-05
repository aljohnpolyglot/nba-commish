import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { getDisplayOverall, getDisplayPotential } from '../../../../../utils/playerRatings';
import { fuzzRatingValue, getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../../../../utils/scoutingFuzz';
import { computeMoodScore } from '../../../../../utils/mood/moodScore';
import { findGMForTeam, normalizeGMAttributes } from '../../../../../services/staff/gmAttributes';
import { StarterService } from '../../../../../services/simulation/StarterService';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import { getGameplan } from '../../../../../store/gameplanStore';
import { formatPlayerSalaryDisplay, getPlayerContractExpiryDisplay, getPlayerCurrentSalaryUSD } from '../../../../../utils/salaryUtils';
import type { GameState, NBAPlayer } from '../../../../../types';
import { PlayerNameWithHover } from '../../../../shared/PlayerNameWithHover';
import { resolveAnyTeam, isOnRoster } from '../../../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../../../utils/uiMode';
import { getDisplayAge } from '../../../../../store/playerRatingStore';
import { makePlaceholderGM } from '../../../../../services/staff/staffFallback';
import { getFatigueBarColor, getFatigueTextColor, getInjuryRisk, getMoodBarColor } from '../../../../shared/playerWellness';
import { getConferenceSpec, type PbaConference } from '../../../../../services/pba/conferenceTransition';
import { getSigningRosterLimit, getStandardRosterLimit, getTwoWayRosterLimit } from '../../../../../utils/rosterLimits';
import { areNonGuaranteedContractsEnabled, areTwoWayContractsEnabled, isNonGuaranteedContract, isTwoWayContract } from '../../../../../utils/contractTypes';
import { getTeamRosterContractCounts } from '../../../../../utils/rosterCounts';
import { getTeamCompetitionRecord } from '../../../../../utils/competitionRecord';
import { getPlayersOnCourt } from '../../../../../services/simulation/courtSize';
import { normalizePositionLabel } from '../../../../../utils/positionUtils';
import { getCalibratedPer } from '../../../../../utils/advancedStatCalibration';
import { areWnbaDevelopmentalContractsEnabled, getWnbaDevelopmentalContractLabel } from '../../../../../services/wnba/developmentalContracts';
import { isLeagueTrainingCampWindow } from '../../../../../services/leagueCalendar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSalary(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${(usd / 1_000).toFixed(0)}K`;
}

function getK2WithDelta(state: GameState, p: NBAPlayer, currentYear: number): { k2: number; delta: number | null } {
  const k2 = getScoutedDisplayOverall(state, p, currentYear);
  if (!p.ratings || p.ratings.length < 2) return { k2, delta: null };
  const prevK2 = fuzzRatingValue(getDisplayOverall(p, currentYear - 1), state, p, `ovr-${currentYear - 1}`);
  return { k2, delta: k2 - prevK2 };
}

function getPotWithDelta(state: GameState, p: NBAPlayer, currentYear: number): { pot: number; delta: number | null } {
  const pot = getScoutedDisplayPotential(state, p, currentYear, currentYear);
  if (!p.ratings || p.ratings.length < 2) return { pot, delta: null };
  const prevPot = fuzzRatingValue(getDisplayPotential(p, currentYear - 1, currentYear - 1), state, p, `pot-${currentYear - 1}`);
  return { pot, delta: pot - prevPot };
}

function isRegularRosterBox(box: any, schedule: any[], competitionId?: string) {
  const sched = schedule.find(g => g.gid === box.gameId);
  const boxCompetitionId = String(box.competitionId ?? sched?.competitionId ?? '');
  if (competitionId && boxCompetitionId !== competitionId) return false;
  const phase = box.competitionPhase ?? sched?.competitionPhase;
  if (sched?.isPreseason || sched?.isPlayIn || sched?.isPlayoff) return false;
  if (box.isPreseason || box.isPlayIn || box.isPlayoff) return false;
  if (phase === 'play-in' || phase === 'qf' || phase === 'sf' || phase === 'final') return false;
  return true;
}

function getLastSeasonStats(p: NBAPlayer, teamId: number, currentYear: number, competitionId?: string) {
  const stats = ((p as any).stats ?? []) as any[];
  if (competitionId) {
    const currentCompetitionRow = stats
      .filter(s =>
        !s.playoffs &&
        (s.gp ?? 0) > 0 &&
        s.tid === teamId &&
        s.season === currentYear &&
        String(s.competitionId ?? '') === competitionId
      )
      .slice(-1)[0];
    const historicalPbaSeasonRow = competitionId.startsWith('pba-')
      ? stats
          .filter(s =>
            !s.playoffs &&
            (s.gp ?? 0) > 0 &&
            s.tid === teamId &&
            s.season === currentYear &&
            String(s.competitionId ?? '') === 'pba'
          )
          .slice(-1)[0]
      : null;
    const displayRow = currentCompetitionRow ?? historicalPbaSeasonRow;
    if (!displayRow) return null;
    const gp = displayRow.gp;
    return {
      g: gp,
      mp: (displayRow.min ?? 0) / gp,
      pts: (displayRow.pts ?? 0) / gp,
      reb: ((displayRow.orb ?? 0) + (displayRow.drb ?? 0)) / gp || (displayRow.trb ?? 0) / gp,
      ast: (displayRow.ast ?? 0) / gp,
      per: getCalibratedPer(displayRow),
    };
  }
  const currentTeamRow = stats
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && s.tid === teamId && s.season === currentYear)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0))
    .slice(-1)[0];
  const last = currentTeamRow ?? stats
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && s.tid === teamId)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0))
    .slice(-1)[0];
  if (!last) return null;
  const gp = last.gp;
  return {
    g: gp,
    mp: (last.min ?? 0) / gp,
    pts: (last.pts ?? 0) / gp,
    reb: ((last.orb ?? 0) + (last.drb ?? 0)) / gp || (last.trb ?? 0) / gp,
    ast: (last.ast ?? 0) / gp,
    per: getCalibratedPer(last),
  };
}

function getBoxScoreDerivedStats(p: NBAPlayer, teamId: number, currentYear: number, boxScores: any[], schedule: any[], competitionId?: string) {
  let g = 0, min = 0, pts = 0, reb = 0, ast = 0, per = 0;
  for (const box of boxScores ?? []) {
    if ((box.season ?? currentYear) !== currentYear) continue;
    if (!isRegularRosterBox(box, schedule, competitionId)) continue;
    const lines = box.homeTeamId === teamId
      ? box.homeStats ?? []
      : box.awayTeamId === teamId
        ? box.awayStats ?? []
        : [];
    const line = lines.find((s: any) => s.playerId === p.internalId);
    if (!line) continue;
    g++;
    min += Number(line.min ?? 0);
    pts += Number(line.pts ?? 0);
    reb += Number(line.reb ?? ((line.orb ?? 0) + (line.drb ?? 0)));
    ast += Number(line.ast ?? 0);
    per += line.per != null ? getCalibratedPer(line) : Number(line.gameScore ?? 0);
  }
  if (g <= 0) return null;
  return { g, mp: min / g, pts: pts / g, reb: reb / g, ast: ast / g, per: per / g };
}

function getYearsWithTeam(p: NBAPlayer, teamId: number): number {
  const seasons = new Set<number>();
  ((p as any).stats ?? []).forEach((s: any) => {
    if (!s.playoffs && s.tid === teamId) seasons.add(s.season);
  });
  return seasons.size;
}

const fmt1 = (v: number) => (Number.isFinite(v) && v > 0 ? v.toFixed(1) : '—');
const hasBrokenGMName = (name?: string | null): boolean => {
  const normalized = String(name ?? '').trim().toLowerCase();
  return !normalized || normalized === 'unknown gm' || normalized === 'gunknown gm' || normalized === 'ai gm' || normalized.endsWith(' gm');
};

// ── Types ──────────────────────────────────────────────────────────────────────

type SortMode = 'rating' | 'rotation' | 'gameplan';
type SortCol = 'name' | 'num' | 'pos' | 'age' | 'k2' | 'pot' | 'salary' | 'exp' | 'ywt' | 'g' | 'mp' | 'pts' | 'reb' | 'ast' | 'per' | 'fatigue' | 'mood';

interface RowData {
  player: NBAPlayer;
  jerseyNum: string;
  k2: number;
  k2Delta: number | null;
  pot: number;
  potDelta: number | null;
  age: number;
  currentSalaryUSD: number;
  currentSalaryLabel: string;
  effectiveExp: number;
  expiryLabel: string;
  isConferenceDeal: boolean;
  yearsLeft: number;
  ywt: number;
  g: number;
  mp: number;
  pts: number;
  reb: number;
  ast: number;
  per: number;
  trainingFatigue: number;
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
  overall: 'General decision-making competence across roster-building decisions.',
  trade_aggression: 'How often this GM initiates trades.',
  scouting_focus: 'How strongly this GM values and protects draft capital.',
  drafting: 'Ability to identify value throughout the draft.',
  negotiation: 'Ability to attract and retain established players.',
  work_ethic: 'How actively this GM searches for roster improvements.',
  spending: 'Willingness to use available budget and roster exceptions.',
  team_chemistry: 'How connected and coordinated the current roster is as a team.',
};

function AttributeBar({ label, value, tooltip, tone = 'default' }: {
  label: string;
  value: number;
  tooltip?: string;
  tone?: 'default' | 'chemistry';
}) {
  const isChemistry = tone === 'chemistry';
  const barColor = isChemistry ? 'bg-[#FDB927]' : value >= 80 ? 'bg-[#FDB927]' : value >= 70 ? 'bg-slate-300' : 'bg-slate-500';
  return (
    <div className="flex flex-col gap-1.5 group relative cursor-default">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <span className={cn('text-sm font-black', isChemistry ? 'text-[#FDB927]' : 'text-slate-100')}>{value}</span>
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
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const playersOnCourt = getPlayersOnCourt(state.leagueStats);
  const hideNbaContractBadges = isEuroIsolatedMode(state) || teamId >= 100;
  const expandedRosterWindow = state.offseasonChecklist?.freeAgency === 'in-progress'
    || isLeagueTrainingCampWindow(state.date, state.leagueStats);
  const maxStandardRoster = getStandardRosterLimit(state.leagueStats as any);
  const maxActiveRoster = getSigningRosterLimit(state.leagueStats as any, expandedRosterWindow);
  const maxTwoWayRoster = getTwoWayRosterLimit(state.leagueStats as any);
  const twoWayContractsEnabled = !hideNbaContractBadges && areTwoWayContractsEnabled(state.leagueStats);
  const developmentalActive = areWnbaDevelopmentalContractsEnabled(state.leagueStats);
  const secondaryContractLabel = getWnbaDevelopmentalContractLabel(state.leagueStats);
  const nonGuaranteedContractsEnabled = !hideNbaContractBadges && areNonGuaranteedContractsEnabled(state.leagueStats);
  const showNbaContractMix = !hideNbaContractBadges;
  const activeCompetitionId = state.leagueStats?.uiMode === 'pba_isolated'
    ? getConferenceSpec(((state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference).id
    : isEuroIsolatedMode(state)
      ? state.euroPrimaryCompetitionId
      : undefined;

  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const teamColor = team?.colors?.[0] ?? '#552583';
  const teamRecord = useMemo(
    () => activeCompetitionId
      ? getTeamCompetitionRecord(state.boxScores ?? [], teamId, currentYear, activeCompetitionId)
      : null,
    [activeCompetitionId, currentYear, state.boxScores, teamId],
  );
  const displayWins = teamRecord?.wins ?? team?.wins ?? 0;
  const displayLosses = teamRecord?.losses ?? team?.losses ?? 0;
  const teamChemistry = Number(Math.max(0, Math.min(100, Number(
    team?.teamChemistry
      ?? (team as any)?.chemistry
      ?? (team as any)?.Chemistry
      ?? 50,
  ))).toFixed(1));

  const teamPlayers = useMemo(
    () => (state.players ?? []).filter(p => p.tid === teamId),
    [state.players, teamId],
  );

  const rosterCounts = useMemo(() => {
    const counts = getTeamRosterContractCounts(teamPlayers, teamId, state.leagueStats, (team as any)?.league ?? 'NBA');
    return {
      ...counts,
      twoWayCount: twoWayContractsEnabled ? counts.twoWayCount : 0,
      nonGuaranteedCount: nonGuaranteedContractsEnabled ? counts.nonGuaranteedCount : 0,
    };
  }, [nonGuaranteedContractsEnabled, state.leagueStats, team, teamId, teamPlayers, twoWayContractsEnabled]);

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
  const placeholderGM = useMemo(
    () => (team ? makePlaceholderGM(team as any) : null),
    [team],
  );
  const foundGM = findGMForTeam(state, teamId);
  const gmObj = foundGM && !hasBrokenGMName(foundGM.name) ? foundGM : placeholderGM;
  const gmAttrs = normalizeGMAttributes(gmObj?.attributes);
  let gmName = gmObj?.name ?? '';
  let gmPortrait = gmObj?.playerPortraitUrl ?? '';
  if (isOwnTeam && state.commissionerName) {
    gmName = state.commissionerName;
    gmPortrait = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.commissionerName)}&background=${teamColor.replace('#', '')}&color=fff&size=256&bold=true`;
  }

  const allRows = useMemo((): RowData[] => {
    const active = teamPlayers.filter(p => isOnRoster(p) && p.contract);
    return active.map(p => {
      const { k2, delta: k2Delta } = getK2WithDelta(state, p, currentYear);
      const { pot, delta: potDelta } = getPotWithDelta(state, p, currentYear);
      const stats =
        getLastSeasonStats(p, teamId, currentYear, activeCompetitionId) ??
        getBoxScoreDerivedStats(p, teamId, currentYear, state.boxScores ?? [], state.schedule ?? [], activeCompetitionId);
      const { score: moodScore } = computeMoodScore(
        p, team, state.date, false, false, false, teamPlayers, currentYear,
      );
      // Effective expiration — re-signs leave contract.exp pointing at the OLD
      // current-year deal until season rollover, with the new deal living in
      // contractYears[]. Use the later of the two so the EXP column reflects the
      // total commitment after a re-sign instead of flashing "expiring" for a
      // freshly extended player.
      const cyYears = (((p as any).contractYears ?? []) as Array<{ season?: string }>)
        .map(cy => parseInt((cy.season ?? '').split('-')[0], 10) + 1)
        .filter(y => Number.isFinite(y));
      const latestCY = cyYears.length > 0 ? Math.max(...cyYears) : 0;
      const baseExpiry = getPlayerContractExpiryDisplay(p as any, currentYear);
      const effectiveExp = baseExpiry.isConferenceDeal ? baseExpiry.sortYear : Math.max(baseExpiry.sortYear || currentYear, latestCY);
      const yearsLeft = baseExpiry.isConferenceDeal ? 0 : Math.max(0, effectiveExp - currentYear);
      return {
        player: p,
        jerseyNum: (p as any).jerseyNumber ?? '—',
        k2,
        k2Delta,
        pot,
        potDelta,
        age: getDisplayAge(p, currentYear),
        currentSalaryUSD: getPlayerCurrentSalaryUSD(p as any, currentYear),
        currentSalaryLabel: formatPlayerSalaryDisplay(p as any, currentYear, state.nonNBATeams ?? []),
        effectiveExp,
        expiryLabel: baseExpiry.isConferenceDeal ? baseExpiry.label : String(effectiveExp || '—'),
        isConferenceDeal: baseExpiry.isConferenceDeal,
        yearsLeft,
        ywt: getYearsWithTeam(p, teamId),
        g: stats?.g ?? 0,
        mp: stats?.mp ?? 0,
        pts: stats?.pts ?? 0,
        reb: stats?.reb ?? 0,
        ast: stats?.ast ?? 0,
        per: stats?.per ?? 0,
        trainingFatigue: Math.max(0, Math.min(100, Math.round((p as any).trainingFatigue ?? 0))),
        moodScore,
        isTwoWay: twoWayContractsEnabled && isTwoWayContract(p, state.leagueStats),
        isNonGuaranteed: nonGuaranteedContractsEnabled && isNonGuaranteedContract(p, state.leagueStats),
        isInjured: ((p as any).injury?.gamesRemaining ?? 0) > 0,
        injuryType: (p as any).injury?.type ?? 'Injured',
      };
    });
  }, [teamPlayers, team, state.date, state.leagueStats, state.boxScores, state.schedule, currentYear, teamId, hideNbaContractBadges, twoWayContractsEnabled, nonGuaranteedContractsEnabled, state.nonNBATeams, activeCompetitionId]);

  const rows = useMemo((): RowData[] => {
    if (sortMode === 'rotation' && team) {
      const healthy = teamPlayers.filter(p => isOnRoster(p) && !((p as any).injury?.gamesRemaining > 0));
      const savedPlan = getGameplan(teamId);
      const healthyById = new Map(healthy.map(p => [p.internalId, p]));
      const savedStarters = (savedPlan?.starterIds ?? [])
        .map(id => healthyById.get(id))
        .filter(Boolean) as NBAPlayer[];
      const rawStarters = savedStarters.length === playersOnCourt
        ? savedStarters
        : StarterService.getProjectedStarters(team, state.players, currentYear, healthy, true, playersOnCourt);
      const startersSorted = savedStarters.length === playersOnCourt
        ? savedStarters
        : StarterService.sortByPositionSlot(rawStarters, currentYear);
      const starterIds = new Set(startersSorted.map(p => p.internalId));
      const starterRows = startersSorted
        .map(p => allRows.find(r => r.player.internalId === p.internalId))
        .filter(Boolean) as RowData[];
      const benchOrder = savedPlan?.benchOrder ?? [];
      const benchRank = new Map(benchOrder.map((id, idx) => [id, idx]));
      const benchRows = allRows
        .filter(r => !starterIds.has(r.player.internalId) && !r.isInjured)
        .sort((a, b) => {
          const ar = benchRank.get(a.player.internalId);
          const br = benchRank.get(b.player.internalId);
          if (ar != null && br != null) return ar - br;
          if (ar != null) return -1;
          if (br != null) return 1;
          return b.k2 - a.k2;
        });
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
      else if (col === 'pos')    { av = normalizePositionLabel(a.player.pos, a.player.hgt); bv = normalizePositionLabel(b.player.pos, b.player.hgt); }
      else if (col === 'age')    { av = a.age;  bv = b.age; }
      else if (col === 'k2')     { av = a.k2;   bv = b.k2; }
      else if (col === 'pot')    { av = a.pot;  bv = b.pot; }
      else if (col === 'salary') { av = a.currentSalaryUSD; bv = b.currentSalaryUSD; }
      else if (col === 'exp')    { av = a.effectiveExp; bv = b.effectiveExp; }
      else if (col === 'ywt')    { av = a.ywt;  bv = b.ywt; }
      else if (col === 'g')      { av = a.g;    bv = b.g; }
      else if (col === 'mp')     { av = a.mp;   bv = b.mp; }
      else if (col === 'pts')    { av = a.pts;  bv = b.pts; }
      else if (col === 'reb')    { av = a.reb;  bv = b.reb; }
      else if (col === 'ast')    { av = a.ast;  bv = b.ast; }
      else if (col === 'per')    { av = a.per;  bv = b.per; }
      else if (col === 'fatigue'){ av = a.trainingFatigue; bv = b.trainingFatigue; }
      else if (col === 'mood')   { av = a.moodScore; bv = b.moodScore; }
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === 'asc' ? av - bv : bv - av;
    });
  }, [allRows, sort, sortMode, team, teamPlayers, state.players, currentYear, playersOnCourt]);

  // In rotation mode, inject a "Bench" divider after the configured starting unit.
  const rotationStarterCount = sortMode === 'rotation' && team
    ? Math.min(playersOnCourt, rows.filter(r => !r.isInjured).length)
    : 0;

  // Starter IDs for rotation + gameplan highlight
  const starterIds = useMemo((): Set<string> => {
    if ((sortMode === 'rotation' || sortMode === 'gameplan') && team) {
      const healthy = teamPlayers.filter(p => isOnRoster(p) && !((p as any).injury?.gamesRemaining > 0));
      const savedPlan = getGameplan(teamId);
      const healthyIds = new Set(healthy.map(p => p.internalId));
      if ((savedPlan?.starterIds ?? []).filter(id => healthyIds.has(id)).length === playersOnCourt) {
        return new Set(savedPlan!.starterIds);
      }
      const starters = StarterService.getProjectedStarters(
        team,
        state.players,
        currentYear,
        healthy,
        true,
        playersOnCourt,
      );
      return new Set(starters.map(p => p.internalId));
    }
    return new Set();
  }, [sortMode, team, teamPlayers, state.players, currentYear, teamId, playersOnCourt]);

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
      {/* Mobile-only GM strip */}
      <div className="md:hidden flex items-center gap-3 mb-2 rounded-lg border border-[#30363d] bg-slate-900/60 px-3 py-2">
        <div className="w-9 h-9 rounded-full border border-white/10 overflow-hidden bg-slate-800/50 shrink-0">
          <PlayerPortrait playerName={gmName || 'GM'} imgUrl={gmPortrait} disableNameFallback size={36} />
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
            <div className="text-sm font-black text-slate-200">{displayWins}</div>
          </div>
          <div>
            <div className="text-[8px] uppercase tracking-widest text-slate-500">L</div>
            <div className="text-sm font-black text-slate-200">{displayLosses}</div>
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
      {isOwnTeam && (
        <div className="md:hidden mb-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
          <AttributeBar
            label="Team Chemistry"
            value={teamChemistry}
            tooltip={ATTR_TOOLTIPS.team_chemistry}
            tone="chemistry"
          />
        </div>
      )}

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
                <PlayerPortrait playerName={gmName || 'GM'} imgUrl={gmPortrait} disableNameFallback size={56} />
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
                  <div className="text-sm font-black text-slate-200">{displayWins}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-slate-500">L</div>
                  <div className="text-sm font-black text-slate-200">{displayLosses}</div>
                </div>
              </div>
            </div>
          </div>

          {/* GM Attributes + Sort dropdown */}
          <div className="rounded-lg border border-[#30363d] bg-slate-900/50 p-3 flex flex-col gap-3 flex-1 min-h-0">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800 pb-2">
              GM Attributes
            </div>
            <AttributeBar label="Overall" value={gmAttrs.overall} tooltip={ATTR_TOOLTIPS.overall} />
            <AttributeBar label="Trade Aggr." value={gmAttrs.trade_aggression} tooltip={ATTR_TOOLTIPS.trade_aggression} />
            <AttributeBar label="Scouting"    value={gmAttrs.scouting_focus}   tooltip={ATTR_TOOLTIPS.scouting_focus} />
            <AttributeBar label="Drafting"    value={gmAttrs.drafting}         tooltip={ATTR_TOOLTIPS.drafting} />
            <AttributeBar label="Negotiation" value={gmAttrs.negotiation}      tooltip={ATTR_TOOLTIPS.negotiation} />
            <AttributeBar label="Work Ethic"  value={gmAttrs.work_ethic}        tooltip={ATTR_TOOLTIPS.work_ethic} />
            <AttributeBar label="Spending"    value={gmAttrs.spending}          tooltip={ATTR_TOOLTIPS.spending} />
            {isOwnTeam && (
              <div className="mt-1 border-t border-amber-400/20 pt-3">
                <AttributeBar
                  label="Team Chemistry"
                  value={teamChemistry}
                  tooltip={ATTR_TOOLTIPS.team_chemistry}
                  tone="chemistry"
                />
              </div>
            )}

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
            {showNbaContractMix && (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-emerald-500/50 border border-emerald-500/60 inline-block" />
                  {expandedRosterWindow
                    ? `${rosterCounts.total}/${maxActiveRoster} camp · ${Math.max(0, maxActiveRoster - rosterCounts.total)} available`
                    : `${rosterCounts.standardCount}/${maxStandardRoster} standard`}
                </span>
                {twoWayContractsEnabled && <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-violet-500/50 border border-violet-500/60 inline-block" />
                  {rosterCounts.twoWayCount}/{maxTwoWayRoster} {secondaryContractLabel.toLowerCase()}
                </span>}
                {nonGuaranteedContractsEnabled && <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-amber-500/30 border border-amber-500/50 inline-block" />
                  {rosterCounts.nonGuaranteedCount} non-guaranteed
                </span>}
              </>
            )}
            {sortMode !== 'rating' && (
              <span className="ml-auto text-slate-600 italic">
                {sortMode === 'rotation' ? 'Rotation locked · click By Rating to sort columns' : 'Game Plan (PER) · click By Rating to sort columns'}
              </span>
            )}
          </div>

          <div className="md:hidden flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
            {rows.map((r) => {
              const p = r.player;
              const moodPct = Math.round(((r.moodScore + 10) / 20) * 100);
              const fatigueRisk = getInjuryRisk(r.trainingFatigue);
              const isStarter = starterIds.has(p.internalId);
              const isExpiring = r.yearsLeft === 0;

              return (
                <div
                  key={p.internalId}
                  role="button"
                  tabIndex={0}
                  onClick={() => quick.openFor(p)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') quick.openFor(p);
                  }}
                  className={cn(
                    'w-full rounded-lg border border-[#30363d] bg-slate-950/70 p-3 text-left transition-colors',
                    r.isInjured
                      ? 'opacity-60'
                      : isStarter && !r.isTwoWay && !r.isNonGuaranteed
                      ? 'border-l-amber-400 bg-amber-500/10'
                      : r.isTwoWay
                      ? 'border-l-violet-500 bg-violet-500/10'
                      : r.isNonGuaranteed
                      ? 'border-l-amber-500 bg-amber-500/10'
                      : 'hover:bg-white/5',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <PlayerPortrait playerName={p.name} imgUrl={p.imgURL} face={(p as any).face} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">#{r.jerseyNum}</span>
                        <PlayerNameWithHover player={p} className="truncate text-sm font-black text-slate-100">
                          {p.name}
                        </PlayerNameWithHover>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        <span>{normalizePositionLabel(p.pos, p.hgt)}</span>
                        <span>{r.age} yrs</span>
                        {isStarter && (sortMode === 'rotation' || sortMode === 'gameplan') && <span className="rounded border border-amber-400/40 bg-amber-500/20 px-1 py-0.5 text-amber-300">Starter</span>}
                        {r.isInjured && <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1 py-0.5 text-rose-300">{r.injuryType}</span>}
                        {r.isTwoWay && <span className="rounded border border-violet-500/50 bg-violet-500/30 px-1 py-0.5 text-violet-300">{developmentalActive ? 'DEV' : '2W'}</span>}
                        {r.isNonGuaranteed && <span className="rounded border border-amber-500/50 bg-amber-500/30 px-1 py-0.5 text-amber-300">NG</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={cn(
                        'text-2xl font-black tabular-nums leading-none',
                        r.k2 >= 90 ? 'text-blue-300' : r.k2 >= 85 ? 'text-emerald-300' : r.k2 >= 78 ? 'text-amber-300' : 'text-slate-300',
                      )}>
                        {r.k2}
                      </div>
                      <div className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">OVR</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      ['Pot', r.pot],
                      ['YWT', r.ywt],
                      ['G', r.g > 0 ? r.g : '—'],
                      ['MP', r.mp > 0 ? fmt1(r.mp) : '—'],
                      ['PTS', fmt1(r.pts)],
                      ['TRB', fmt1(r.reb)],
                      ['AST', fmt1(r.ast)],
                      ['PER', fmt1(r.per)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md bg-slate-900/80 px-2 py-1.5">
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</div>
                        <div className="mt-0.5 text-xs font-black tabular-nums text-slate-100">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-slate-900/80 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Fatigue</span>
                        <span className={`rounded border px-1 py-0.5 text-[7px] ${fatigueRisk.color}`}>{fatigueRisk.label}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full ${getFatigueBarColor(r.trainingFatigue)}`} style={{ width: `${Math.max(2, r.trainingFatigue)}%` }} />
                      </div>
                    </div>
                    <div className="rounded-md bg-slate-900/80 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Mood</span>
                        <span className="text-[9px] text-slate-400 tabular-nums">{r.moodScore >= 0 ? '+' : ''}{r.moodScore.toFixed(1)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className={cn('h-full rounded', getMoodBarColor(r.moodScore))} style={{ width: `${moodPct}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-800 pt-2 text-[10px]">
                    <span className="truncate font-semibold text-slate-300">
                      {r.currentSalaryUSD > 0 ? r.currentSalaryLabel : 'No active salary'}
                    </span>
                    <span className={cn('shrink-0 font-black tabular-nums', r.isConferenceDeal ? 'text-amber-300' : isExpiring ? 'text-rose-300' : 'text-slate-500')}>
                      {r.expiryLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block flex-1 min-h-0 overflow-auto rounded-lg border border-[#30363d] bg-black/40 scrollbar-hide">
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
                  <SortTh col="fatigue" label="Fatigue" cls="text-left" />
                  <SortTh col="mood"   label="Mood" cls="text-left" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const p = r.player;
                  const isExpiring = r.yearsLeft === 0;
                  const moodPct = Math.round(((r.moodScore + 10) / 20) * 100);
                  const fatigueRisk = getInjuryRisk(r.trainingFatigue);

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
                          <td colSpan={17} className="py-0.5 px-3">
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
                          <td colSpan={17} className="py-0.5 px-3">
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
                            <PlayerNameWithHover player={p} className="font-semibold truncate max-w-[90px] text-slate-100">{p.name}</PlayerNameWithHover>
                            {isStarter && (sortMode === 'rotation' || sortMode === 'gameplan') && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 shrink-0">S</span>
                            )}
                            {r.isInjured && (
                              <span
                                title={`Out — ${r.injuryType}`}
                                className="text-[8px] font-black text-red-500 shrink-0 cursor-default"
                              >✚</span>
                            )}
                            {r.isTwoWay && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-violet-500/30 text-violet-300 border border-violet-500/50 shrink-0">{developmentalActive ? 'DEV' : '2W'}</span>
                            )}
                            {r.isNonGuaranteed && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 shrink-0">NG</span>
                            )}
                          </div>
                        </td>

                        <td className="text-center text-slate-400 px-1.5">{normalizePositionLabel(p.pos, p.hgt)}</td>
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
                          {r.currentSalaryUSD > 0 ? r.currentSalaryLabel : <span className="text-slate-600">—</span>}
                        </td>

                        <td className="text-center tabular-nums px-1.5">
                          <span className={cn('text-[10px] font-bold', r.isConferenceDeal ? 'text-amber-300 font-black' : isExpiring ? 'text-rose-300 font-black' : 'text-slate-500')}>
                            {r.expiryLabel}
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

                        <td className="px-2 py-1.5" style={{ minWidth: 120 }}>
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1">
                              <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">
                                <span className={getFatigueTextColor(r.trainingFatigue)}>{r.trainingFatigue}%</span>
                                <span className={`px-1 py-0.5 rounded border text-[7px] ${fatigueRisk.color}`}>{fatigueRisk.label}</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className={`h-full transition-all ${getFatigueBarColor(r.trainingFatigue)}`} style={{ width: `${Math.max(2, r.trainingFatigue)}%` }} />
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-2 py-1.5" style={{ minWidth: 80 }}>
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                              <div className={cn('h-full rounded transition-all', getMoodBarColor(r.moodScore))} style={{ width: `${moodPct}%` }} />
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
