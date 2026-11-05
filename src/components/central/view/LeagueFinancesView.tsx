import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Ticket, TrendingUp } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { resolveAttendanceProfile } from '../../../utils/attendanceUtils';
import { getOwnTeamId } from '../../../utils/helpers';
import { getMLEAvailability, getTeamPayrollUSD, type CapThresholds, effectiveRecord, getCapStatus, getCapThresholds } from '../../../utils/salaryUtils';
import { resolveTeamStrategyProfile } from '../../../utils/teamStrategy';
import { getActiveTPEs, getTotalActiveTPE } from '../../../utils/tradeExceptionUtils';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../../utils/uiMode';
import { getSigningRosterLimit, getTwoWayRosterLimit } from '../../../utils/rosterLimits';
import { getTeamRosterContractCounts } from '../../../utils/rosterCounts';
import { areTradeExceptionsEnabled, isMleEnabled } from '../../../utils/ruleFlags';
import {
  type AttSortKey,
  AttendanceTab,
  type CapSortKey,
  CapRow,
  CapSortHeader,
  getCapGrid,
  type TabKey,
  TeamEnriched,
  LeagueFinancesEuroView,
  ROLE_RANK,
  STATUS_SEVERITY,
  TradeBoardTab,
  areAttendanceSoldOut,
} from './LeagueFinancesViewShared';
import { LeagueFinancesHeader } from './LeagueFinancesHeader';
import type { NBATeam } from '../../../types';
import { areTwoWayContractsEnabled } from '../../../utils/contractTypes';
import { areWnbaDevelopmentalContractsEnabled } from '../../../services/wnba/developmentalContracts';
import { isLeagueTrainingCampWindow } from '../../../services/leagueCalendar';

export const LeagueFinancesView: React.FC = () => {
  const { state, navigateToTeamFinances } = useGame();
  const ownTid = getOwnTeamId(state);
  const [tab, setTab] = useState<TabKey>('cap');
  const [capSort, setCapSort] = useState<CapSortKey>('payroll');
  const [capDir, setCapDir] = useState<'desc' | 'asc'>('desc');
  const [attSort, setAttSort] = useState<AttSortKey>('attendance');
  const [attDir, setAttDir] = useState<'desc' | 'asc'>('desc');
  const tradesDisabled = state.leagueStats?.tradesAllowed === false;
  const pbaIsolated = isPbaIsolatedMode(state);
  const wnbaIsolated = isWnbaIsolatedMode(state);
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats), [state.leagueStats]);
  const capRulesActive = Number.isFinite(thresholds.salaryCap);
  const taxRulesActive = Number.isFinite(thresholds.luxuryTax);
  const showMleColumn = isMleEnabled(state.leagueStats);
  const showTpeColumn = areTradeExceptionsEnabled(state.leagueStats);
  const seasonYear = state.leagueStats.year;
  const expandedRosterWindow = state.offseasonChecklist?.freeAgency === 'in-progress'
    || isLeagueTrainingCampWindow(state.date, state.leagueStats);

  useEffect(() => {
    if (tradesDisabled && tab === 'trade') setTab('cap');
  }, [tradesDisabled, tab]);

  useEffect(() => {
    if ((capSort === 'mle' && !showMleColumn) || (capSort === 'tpe' && !showTpeColumn)) {
      setCapSort('payroll');
      setCapDir('desc');
    }
  }, [capSort, showMleColumn, showTpeColumn]);

  const financeTeams = useMemo(() => {
    if (!pbaIsolated) return state.teams;
    return (state.nonNBATeams ?? [])
      .filter((team: any) => team?.league === 'PBA')
      .map((team: any) => ({
        ...team,
        id: Number(team.tid ?? team.id),
        conference: 'PBA',
      }));
  }, [pbaIsolated, state.teams, state.nonNBATeams]);

  const confStandings = useMemo(() => {
    const byConf: Record<string, { teamId: number; wins: number; losses: number }[]> = {};
    financeTeams.forEach(t => {
      const conf = t.conference || 'East';
      if (!byConf[conf]) byConf[conf] = [];
      const rec = effectiveRecord(t, seasonYear, true);
      byConf[conf].push({ teamId: t.id, wins: rec.wins, losses: rec.losses });
    });

    const result: Record<number, { confRank: number; gbFromLeader: number }> = {};
    Object.values(byConf).forEach(list => {
      list.sort((a, b) => {
        const aWp = a.wins / (a.wins + a.losses || 1);
        const bWp = b.wins / (b.wins + b.losses || 1);
        return bWp - aWp || b.wins - a.wins;
      });
      const leader = list[0];
      list.forEach((entry, idx) => {
        const gb = ((leader.wins - entry.wins) + (entry.losses - leader.losses)) / 2;
        result[entry.teamId] = { confRank: idx + 1, gbFromLeader: Math.max(0, gb) };
      });
    });
    return result;
  }, [financeTeams, seasonYear, wnbaIsolated]);

  const teamData: TeamEnriched[] = useMemo(() => financeTeams.map(team => {
    const rosterCounts = getTeamRosterContractCounts(
      state.players,
      team.id,
      state.leagueStats,
      pbaIsolated ? 'PBA' : wnbaIsolated ? 'WNBA' : 'NBA',
    );
    const players = rosterCounts.rosterPlayers;
    const payroll = getTeamPayrollUSD(state.players, team.id, team, seasonYear, state.leagueStats as any);
    const expiringCount = players.filter(p => (p.contract?.exp ?? 0) <= seasonYear).length;
    const standardMax = getSigningRosterLimit(state.leagueStats as any, expandedRosterWindow);
    const twoWayMax = getTwoWayRosterLimit(state.leagueStats as any);
    const twoWayEnabled = twoWayMax > 0 && areTwoWayContractsEnabled(state.leagueStats);
    const secondaryContractShortLabel = areWnbaDevelopmentalContractsEnabled(state.leagueStats) ? 'DEV' : '2W';
    const twoWayCount = twoWayEnabled ? rosterCounts.twoWayCount : 0;
    const standardCount = expandedRosterWindow ? rosterCounts.total : rosterCounts.standardCount;
    const { confRank = 15, gbFromLeader = 0 } = confStandings[team.id] ?? {};
    const { wins: effectiveWins, losses: effectiveLosses } = effectiveRecord(team, seasonYear, true);
    const topPlayer = [...players].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0];
    const hasInjuredStar = !!topPlayer && (topPlayer.injury?.gamesRemaining ?? 0) >= 30;
    const mle = getMLEAvailability(team.id, payroll, 0, thresholds, state.leagueStats);
    const reservedMleUSD = ((state.faBidding?.markets ?? []) as any[])
      .filter(m => !m?.resolved)
      .reduce((sum, market) => {
        const topMine = (market.bids ?? [])
          .filter((b: any) => b.teamId === team.id && b.status === 'active')
          .sort((a: any, b: any) => (b.salaryUSD ?? 0) - (a.salaryUSD ?? 0))[0];
        return sum + (topMine?.salaryUSD ?? 0);
      }, 0);
    const mleAvailable = mle.type && !mle.blocked ? Math.max(0, mle.available - reservedMleUSD) : 0;
    const mleUsed = mle.type ? Math.min(mle.limit ?? 0, (mle.used ?? 0) + reservedMleUSD) : 0;
    const mleLimit = mle.type && !mle.blocked ? (mle.limit ?? 0) : 0;
    const mleType = mle.type === 'room' ? 'Room' : mle.type === 'taxpayer' ? 'Tax' : mle.type ? 'NT' : '—';
    const tpeTotalUSD = getTotalActiveTPE(team, state.date);
    const tpeCount = getActiveTPEs(team, state.date).length;
    const strategy = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: financeTeams as any,
      leagueStats: state.leagueStats,
      currentYear: seasonYear,
      gameMode: state.gameMode,
      userTeamId: state.userTeamId,
    });
    const attendanceProfile = resolveAttendanceProfile(state, team as NBATeam);
    return { team, payroll, expiringCount, standardCount, standardMax, twoWayCount, twoWayMax, twoWayEnabled, secondaryContractShortLabel, confRank, gbFromLeader, effectiveWins, effectiveLosses, hasInjuredStar, mleAvailable, mleUsed, mleLimit, mleType, tpeTotalUSD, tpeCount, strategy, attendanceProfile };
  }), [financeTeams, state.players, seasonYear, confStandings, thresholds, state.leagueStats, state.gameMode, state.userTeamId, state.date, state.faBidding?.markets, pbaIsolated, wnbaIsolated, expandedRosterWindow]);

  const maxPayroll = useMemo(
    () => capRulesActive
      ? Math.max(
          ...teamData.map(d => d.payroll),
          (Number.isFinite(thresholds.secondApron)
            ? thresholds.secondApron
            : Number.isFinite(thresholds.firstApron)
              ? thresholds.firstApron
              : Number.isFinite(thresholds.luxuryTax)
                ? thresholds.luxuryTax
                : thresholds.salaryCap) * 1.05,
        )
      : Math.max(...teamData.map(d => d.payroll), 1),
    [teamData, thresholds, capRulesActive],
  );
  const totalPayroll = useMemo(() => teamData.reduce((sum, d) => sum + d.payroll, 0), [teamData]);
  const overTaxCount = useMemo(() => taxRulesActive ? teamData.filter(d => d.payroll >= thresholds.luxuryTax).length : 0, [teamData, thresholds, taxRulesActive]);
  const underCapCount = useMemo(() => capRulesActive ? teamData.filter(d => d.payroll < thresholds.salaryCap).length : 0, [teamData, thresholds, capRulesActive]);
  const avgPayroll = totalPayroll / (teamData.length || 1);

  const capSorted = useMemo(() => [...teamData].sort((a, b) => {
    let diff = 0;
    if (capSort === 'payroll') diff = a.payroll - b.payroll;
    else if (capSort === 'wins') diff = a.effectiveWins - b.effectiveWins;
    else if (capSort === 'mle') diff = showMleColumn ? a.mleAvailable - b.mleAvailable : a.payroll - b.payroll;
    else if (capSort === 'tpe') diff = showTpeColumn ? a.tpeTotalUSD - b.tpeTotalUSD : a.payroll - b.payroll;
    else if (capSort === 'expiring') diff = a.expiringCount - b.expiringCount;
    else if (capSort === 'roster') diff = (a.standardCount * 10 + a.twoWayCount) - (b.standardCount * 10 + b.twoWayCount);
    else if (capSort === 'status') {
      const left = STATUS_SEVERITY[getCapStatus(a.payroll, thresholds).key] ?? 0;
      const right = STATUS_SEVERITY[getCapStatus(b.payroll, thresholds).key] ?? 0;
      diff = left - right;
    } else if (capSort === 'strategy') {
      const left = ROLE_RANK[a.strategy.tradeRole] ?? 2;
      const right = ROLE_RANK[b.strategy.tradeRole] ?? 2;
      diff = right - left;
    } else {
      diff = a.team.name.localeCompare(b.team.name);
    }
    return capDir === 'desc' ? -diff : diff;
  }), [teamData, capSort, capDir, thresholds, showMleColumn, showTpeColumn]);

  const attSorted = useMemo(() => {
    const profiles = teamData.map(d => ({ d, p: d.attendanceProfile }));
    profiles.sort((a, b) => {
      let diff = 0;
      if (attSort === 'attendance') diff = a.p.avgAttendance - b.p.avgAttendance;
      else if (attSort === 'revenue') diff = a.p.seasonRevenue - b.p.seasonRevenue;
      else if (attSort === 'fill') diff = a.p.fillRate - b.p.fillRate;
      else if (attSort === 'capacity') diff = a.p.arenaCapacity - b.p.arenaCapacity;
      else if (attSort === 'ticket') diff = a.p.avgTicketPrice - b.p.avgTicketPrice;
      else if (attSort === 'wins') diff = a.d.effectiveWins - b.d.effectiveWins;
      else diff = a.d.team.name.localeCompare(b.d.team.name);
      return attDir === 'desc' ? -diff : diff;
    });
    return profiles.map(x => x.d);
  }, [teamData, attSort, attDir, seasonYear]);

  const buyers = useMemo(() => teamData.filter(d => d.strategy.initiateBuyTrades).sort((a, b) => a.confRank - b.confRank), [teamData]);
  const sellers = useMemo(() => teamData.filter(d => d.strategy.initiateSellTrades).sort((a, b) => b.confRank - a.confRank), [teamData]);
  const neutrals = useMemo(() => teamData.filter(d => !d.strategy.initiateBuyTrades && !d.strategy.initiateSellTrades), [teamData]);
  const attTotals = useMemo(() => {
    const profiles = teamData.map(d => d.attendanceProfile);
    const totalRev = profiles.reduce((sum, p) => sum + p.seasonRevenue, 0);
    const avgFill = profiles.reduce((sum, p) => sum + p.fillRate, 0) / (profiles.length || 1);
    const avgAtt = profiles.reduce((sum, p) => sum + p.avgAttendance, 0) / (profiles.length || 1);
    const soldOut = profiles.filter(p => areAttendanceSoldOut(p.avgAttendance, p.arenaCapacity)).length;
    const actualTeams = profiles.filter(p => p.source === 'actual').length;
    return { totalRev, avgFill, avgAtt: Math.round(avgAtt), soldOut, actualTeams, teamCount: profiles.length };
  }, [teamData, seasonYear]);

  const toggleCap = (col: CapSortKey) => {
    if (capSort === col) setCapDir(dir => dir === 'desc' ? 'asc' : 'desc');
    else { setCapSort(col); setCapDir('desc'); }
  };
  const toggleAtt = (col: AttSortKey) => {
    if (attSort === col) setAttDir(dir => dir === 'desc' ? 'asc' : 'desc');
    else { setAttSort(col); setAttDir('desc'); }
  };

  if (isEuroIsolatedMode(state)) {
    return <LeagueFinancesEuroView state={state} ownTid={ownTid} navigateToTeamFinances={navigateToTeamFinances} />;
  }

  return (
    <div className="h-full flex flex-col bg-[#1a1d24] text-slate-200 overflow-hidden">
      <LeagueFinancesHeader
        seasonYear={seasonYear}
        thresholds={thresholds as CapThresholds}
        avgPayroll={avgPayroll}
        overTaxCount={overTaxCount}
        underCapCount={underCapCount}
        teamCount={teamData.length}
        leagueStats={state.leagueStats}
      />

      <div className="flex-shrink-0 flex items-center gap-1 border-b border-slate-800/50 bg-[#161616] px-4">
        {([
          { key: 'cap', label: 'Cap Overview', icon: DollarSign },
          ...(tradesDisabled ? [] : [{ key: 'trade' as const, label: 'Trade Board', icon: TrendingUp }]),
          { key: 'attendance', label: 'Attendance', icon: Ticket },
        ] as const).map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              tab === item.key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <item.icon size={11} />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'cap' && (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <div className="min-w-[1048px]">
            <div className={`${getCapGrid(showMleColumn, showTpeColumn)} sticky top-0 z-10 border-b border-slate-800/40 bg-[#161616] px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest`}>
              <span className="text-right">#</span>
              <CapSortHeader capSort={capSort} capDir={capDir} col="name" label="Team" onToggle={toggleCap} />
              <CapSortHeader capSort={capSort} capDir={capDir} col="wins" label="W-L" align="center" onToggle={toggleCap} />
              <CapSortHeader capSort={capSort} capDir={capDir} col="strategy" label="Strategy" align="center" onToggle={toggleCap} />
              <CapSortHeader capSort={capSort} capDir={capDir} col="status" label="Status" align="center" onToggle={toggleCap} />
              <span className="px-1">Payroll vs. Cap</span>
              <CapSortHeader capSort={capSort} capDir={capDir} col="payroll" label="Payroll" align="right" onToggle={toggleCap} />
              {showMleColumn && <CapSortHeader capSort={capSort} capDir={capDir} col="mle" label="MLE" align="right" onToggle={toggleCap} />}
              {showTpeColumn && <CapSortHeader capSort={capSort} capDir={capDir} col="tpe" label="TPE" align="right" onToggle={toggleCap} />}
              <CapSortHeader capSort={capSort} capDir={capDir} col="expiring" label="Exp" align="right" onToggle={toggleCap} />
              <CapSortHeader capSort={capSort} capDir={capDir} col="roster" label="Roster" align="right" onToggle={toggleCap} />
              <span />
            </div>
            {capSorted.map((d, index) => (
              <CapRow
                key={d.team.id}
                d={d}
                thresholds={thresholds}
                maxPayroll={maxPayroll}
                rank={index + 1}
                isOwn={ownTid !== null && d.team.id === ownTid}
                showMle={showMleColumn}
                showTpe={showTpeColumn}
                onClick={() => navigateToTeamFinances(d.team.id)}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'trade' && !tradesDisabled && (
        <TradeBoardTab
          buyers={buyers}
          sellers={sellers}
          neutrals={neutrals}
          thresholds={thresholds}
          ownTid={ownTid}
          navigateToTeamFinances={navigateToTeamFinances}
        />
      )}

      {tab === 'attendance' && (
        <AttendanceTab
          attTotals={attTotals}
          attSorted={attSorted}
          attSort={attSort}
          attDir={attDir}
          ownTid={ownTid}
          seasonYear={seasonYear}
          navigateToTeamFinances={navigateToTeamFinances}
          onToggleAtt={toggleAtt}
        />
      )}
    </div>
  );
};
