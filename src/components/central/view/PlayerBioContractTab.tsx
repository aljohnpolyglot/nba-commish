import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { contractToUSD, formatSalaryM, getContractLimits } from '../../../utils/salaryUtils';
import { formatExternalSalary } from '../../../constants';
import { isEuroIsolatedMode } from '../../../utils/uiMode';
import { getTeamFullName } from '../../../utils/teamNames';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { areNonGuaranteedContractsEnabled, areTwoWayContractsEnabled, getContractTimelineOptionKind, isNonGuaranteedContract, isTwoWayContract, normalizeContractOptionKind } from '../../../utils/contractTypes';
import type { NBAPlayer, NBATeam, NonNBATeam } from '../../../types';
import { PlayerBioDisciplineTable } from './PlayerBioDisciplineTable';
import { formatLeagueSeasonLabel, getLeagueCalendarDates } from '../../../services/leagueCalendar';
import { formatGameDateShort } from '../../../utils/dateUtils';
import {
  getFullRosterPlayerForIdentity,
  getNativeHistoricalSalaryRowsForIdentity,
} from '../../../data/realPlayerDataFetcher';
import { getHistoricalNbaBranchSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalCompensationUSD,
  getWnbaDevelopmentalContractLabel,
} from '../../../services/wnba/developmentalContracts';
import { resolveOffseasonContractDecision } from '../../../services/freeAgency/offseasonContractDecision';

interface PlayerBioContractTabProps {
  player: NBAPlayer;
}

type SalaryDisplayRow = {
  season: number;
  teamName: string;
  tid: number;
  salaryUSD: number;
  isFuture: boolean;
  option: string | null;
  scopeLabel?: string;
  league?: string;
};

const salaryScopeLabel = (value: unknown): string | undefined => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'philippine') return 'Philippine Cup';
  if (normalized === 'commissioners') return "Commissioner's Cup";
  if (normalized === 'governors') return "Governors' Cup";
  return normalized ? String(value) : undefined;
};

/** ~5% annual raise fallback for game-generated contracts (not from real gist data). */
function annualRaise(baseUSD: number, yearsFromNow: number): number {
  if (yearsFromNow <= 0) return baseUSD;
  return Math.round(baseUSD * Math.pow(1.05, yearsFromNow));
}

export const PlayerBioContractTab: React.FC<PlayerBioContractTabProps> = ({ player }) => {
  const { state } = useGame();
  const currentYear = state.leagueStats.year;
  const euroIsolated = isEuroIsolatedMode(state);
  const twoWayActive = !euroIsolated && areTwoWayContractsEnabled(state.leagueStats);
  const developmentalActive = areWnbaDevelopmentalContractsEnabled(state.leagueStats);
  const secondaryContractLabel = getWnbaDevelopmentalContractLabel(state.leagueStats);
  const nonGuaranteedActive = !euroIsolated && areNonGuaranteedContractsEnabled(state.leagueStats);
  const birdRightsActive = !euroIsolated && state.leagueStats?.birdRightsEnabled !== false;
  const supermaxActive = birdRightsActive && state.leagueStats?.supermaxEnabled !== false;
  const playerOptionsActive = state.leagueStats?.playerOptionsEnabled !== false;
  const rookieScaleActive = (state.leagueStats as any)?.rookieScaleType !== 'none';
  const rookieTeamOptionsActive = rookieScaleActive && (state.leagueStats as any)?.rookieTeamOptionsEnabled !== false;
  const nonGuaranteedGuaranteeDate = getLeagueCalendarDates(currentYear, state.leagueStats).nonGuaranteedGuaranteeDate;
  const nonGuaranteedGuaranteeLabel = nonGuaranteedGuaranteeDate
    ? formatGameDateShort(nonGuaranteedGuaranteeDate)
    : null;
  const nativeSourcePlayer = state.leagueType === 'fictional' ? undefined : getFullRosterPlayerForIdentity(player);
  const sourceCutoff = isEuroIsolatedMode(state)
    ? Math.max(0, Number(state.euroStartSeason ?? currentYear) - 1)
    : getHistoricalNbaBranchSeasonCutoff({
        currentYear,
        leagueType: state.leagueType,
        moddedLeagueBase: state.moddedLeagueBase,
        nbaStartYear: state.nbaStartYear,
      }) ?? currentYear;
  const careerStats = useMemo(() => {
    const rows = new Map<string, NonNullable<NBAPlayer['stats']>[number]>();
    for (const row of nativeSourcePlayer?.stats ?? []) {
      if (Number(row.season) <= sourceCutoff) rows.set(`${row.season}|${row.tid}|${row.playoffs ? 1 : 0}|${String(row.competitionId ?? '')}`, row);
    }
    for (const row of player.stats ?? []) rows.set(`${row.season}|${row.tid}|${row.playoffs ? 1 : 0}|${String(row.competitionId ?? '')}`, row);
    return [...rows.values()];
  }, [nativeSourcePlayer?.stats, player.stats, sourceCutoff]);
  const careerSalaries = useMemo(() => {
    const rows = new Map<string, NonNullable<NBAPlayer['salaries']>[number]>();
    for (const row of getNativeHistoricalSalaryRowsForIdentity(player, sourceCutoff)) {
      rows.set(`${row.season}|-1|`, row);
    }
    for (const row of nativeSourcePlayer?.salaries ?? []) {
      if (Number(row.season) <= sourceCutoff) rows.set(`${row.season}|${row.tid ?? -1}|${row.teamAbbrev ?? ''}`, row);
    }
    for (const row of player.salaries ?? []) rows.set(`${row.season}|${row.tid ?? -1}|${row.teamAbbrev ?? ''}`, row);
    return [...rows.values()];
  }, [nativeSourcePlayer?.salaries, player, player.salaries, sourceCutoff]);

  const teamsByTid = useMemo(() => {
    const m = new Map<number, NBATeam | NonNBATeam>();
    [...state.teams, ...(state.teamArchive ?? [])].forEach(team => {
      if (!m.has(team.id)) m.set(team.id, team);
    });
    (state.nonNBATeams ?? []).forEach(team => {
      if (!m.has(team.tid)) m.set(team.tid, team);
    });
    return m;
  }, [state.teams, state.teamArchive, state.nonNBATeams]);

  const teamNameAtSeason = useMemo(() => {
    const allTeams = [...state.teams, ...(state.teamArchive ?? []), ...(state.nonNBATeams ?? [])];
    return (tid: number, season: number, abbrev?: string): string | null => {
      const direct = tid >= 0 ? teamsByTid.get(tid) : undefined;
      if (direct) return getTeamFullName(getHistoricalTeamSnapshot(direct, season));
      const normalizedAbbrev = String(abbrev ?? '').trim().toUpperCase();
      if (!normalizedAbbrev) return null;
      const match = allTeams.find(team =>
        String(getHistoricalTeamSnapshot(team, season).abbrev ?? '').trim().toUpperCase() === normalizedAbbrev,
      );
      return match
        ? getTeamFullName(getHistoricalTeamSnapshot(match, season))
        : normalizedAbbrev;
    };
  }, [state.teams, state.teamArchive, state.nonNBATeams, teamsByTid]);

  const currentTeamName = useMemo(() => {
    if (player.tid >= 0) return teamNameAtSeason(player.tid, currentYear) ?? 'Unknown';
    return 'Free Agent';
  }, [currentYear, player.tid, teamNameAtSeason]);

  const tidBySeason = useMemo(() => {
    const m = new Map<number, number>();
    careerStats.forEach(s => {
      if (!s.playoffs && (s.tid ?? -1) >= 0 && !m.has(s.season)) m.set(s.season, s.tid);
    });
    return m;
  }, [careerStats]);

  const abbrevBySeason = useMemo(() => {
    const map = new Map<number, string>();
    for (const stat of careerStats) {
      if (stat.playoffs) continue;
      const abbrev = String((stat as any).abbrev ?? (stat as any).teamAbbrev ?? '').trim().toUpperCase();
      if (abbrev) map.set(Number(stat.season), abbrev);
    }
    return map;
  }, [careerStats]);

  const nonNBALeagueByTid = useMemo(() => {
    const m = new Map<number, string>();
    (state.nonNBATeams ?? []).forEach((t: any) => m.set(t.tid, t.league));
    return m;
  }, [state.nonNBATeams]);

  const contractYears: Array<{
    season: string;
    guaranteed: number;
    option: string;
    type?: string;
    conference?: string;
    competitionId?: string;
    teamId?: number;
  }> =
    ((player as any).contractYears?.length
      ? (player as any).contractYears
      : (nativeSourcePlayer as any)?.contractYears?.filter((row: { season?: string }) => {
          const start = Number(String(row.season ?? '').slice(0, 4));
          return Number.isFinite(start) && start + 1 <= sourceCutoff;
        }) ?? []);

  const isTwoWay = twoWayActive && isTwoWayContract(player, state.leagueStats);
  const isNonGuaranteed = nonGuaranteedActive && isNonGuaranteedContract(player, state.leagueStats);
  const contractLimits = useMemo(
    () => getContractLimits(player, state.leagueStats),
    [player, state.leagueStats],
  );
  const offseasonDecision = useMemo(
    () => resolveOffseasonContractDecision(player, state),
    [player, state],
  );
  const offseasonDecisionLabel = (() => {
    switch (offseasonDecision.kind) {
      case 'ROOKIE_TEAM_OPTION_DUE': return 'Rookie Team Option Due';
      case 'ROOKIE_EXIT_RFA_QO': return 'Rookie Deal Complete · RFA Decision';
      case 'ROOKIE_EXTENSION_ACTIVE': return 'Rookie Extension Active';
      case 'TEAM_OPTION_DUE': return 'Team Option Due';
      case 'PLAYER_OPTION_DUE': return 'Player Option Due';
      case 'RFA_QO_DUE': return 'Qualifying Offer Decision';
      case 'UFA_EXPIRING': return 'Contract Decision Due';
      case 'NON_GUARANTEE_DECISION': return 'Guarantee Decision Due';
      default: return null;
    }
  })();

  // ── Build all rows ──────────────────────────────────────────────────────────
  const allRows = useMemo(() => {
    const sourceSalaries = careerSalaries;
    const sourceSalaryBySeason = new Map(sourceSalaries.map(row => [row.season, row]));
    const transactionTidAtSeason = (season: number): number | undefined => {
      const rows = (player.transactions ?? [])
        .filter(row => row.tid >= 0 && Number(row.season) <= season)
        .sort((left, right) => Number(right.season) - Number(left.season));
      return rows[0]?.tid;
    };
    const latestStatsTidAtSeason = (season: number): number | undefined => {
      const rows = careerStats
        .filter(row => !row.playoffs && row.tid >= 0 && Number(row.season) <= season)
        .sort((left, right) => Number(right.season) - Number(left.season));
      return rows[0]?.tid;
    };
    const provenanceTid = (
      season: number,
      explicitTid?: number,
      transactionTid?: number,
    ): number => {
      if (Number.isFinite(explicitTid) && Number(explicitTid) >= 0) return Number(explicitTid);
      const exactStatsTid = tidBySeason.get(season);
      if (exactStatsTid !== undefined) return exactStatsTid;
      if (transactionTid !== undefined && transactionTid >= 0) return transactionTid;
      const savedTransactionTid = transactionTidAtSeason(season);
      if (savedTransactionTid !== undefined) return savedTransactionTid;
      const priorStatsTid = latestStatsTidAtSeason(season);
      if (priorStatsTid !== undefined) return priorStatsTid;
      const draftYear = Number(player.draft?.year);
      if (
        player.draft?.tid !== undefined
        && player.draft.tid >= 0
        && Number.isFinite(draftYear)
        && season >= draftYear
        && season <= draftYear + 1
      ) return player.draft.tid;
      return -1;
    };
    const labelSourceOption = (value: unknown): string | null => {
      const kind = normalizeContractOptionKind(value);
      if (kind === 'player' && playerOptionsActive) return 'Player Option';
      if (kind === 'team' && rookieTeamOptionsActive) return 'Team Option';
      if (kind === 'twoWay') return secondaryContractLabel;
      if (kind === 'nonGuaranteed') return 'Non-Guaranteed';
      return null;
    };
    const sourcePastRows = sourceSalaries
      .slice()
      .sort((a, b) => a.season - b.season)
      .filter(sal => sal.season < currentYear && contractToUSD(sal.amount) > 0)
      .map(sal => {
        const tid = provenanceTid(sal.season, sal.tid);
        const abbrev = sal.teamAbbrev ?? abbrevBySeason.get(sal.season);
        return {
          season: sal.season,
          teamName: teamNameAtSeason(tid, sal.season, abbrev) ?? 'Unknown Team',
          tid,
          salaryUSD: contractToUSD(sal.amount),
          isFuture: false,
          option: labelSourceOption(sal.option),
          scopeLabel: salaryScopeLabel(sal.conference ?? sal.competitionId),
          league: sal.league,
        };
      });
    const dedupeRows = (rows: SalaryDisplayRow[]) => {
      const byIdentity = new Map<string, SalaryDisplayRow>();
      for (const row of rows) {
        const key = `${row.season}|${row.tid >= 0 ? `tid:${row.tid}` : row.teamName.toLowerCase()}|${row.scopeLabel ?? ''}`;
        const previous = byIdentity.get(key);
        if (!previous || row.salaryUSD > 0 || previous.salaryUSD <= 0) byIdentity.set(key, row);
      }
      return [...byIdentity.values()].sort((a, b) =>
        a.season - b.season
        || a.teamName.localeCompare(b.teamName)
        || String(a.scopeLabel ?? '').localeCompare(String(b.scopeLabel ?? '')),
      );
    };
    // ── Path A: Real contract data from gist ───────────────────────────────
    if (contractYears.length > 0) {
      // Drop past-season rows that have $0 guaranteed and no option flag — these are
      // 10-day / training-camp / two-way blips the gist preserves but that render as
      // confusing "—" rows in Career Earnings. Keep current/future rows regardless so
      // an unsigned current year still shows up.
      const visibleYears = contractYears.filter(cy => {
        const yr = parseInt(cy.season.split('-')[0], 10) + 1;
        if (yr >= currentYear) return true;
        if ((cy.guaranteed ?? 0) > 0) return true;
        const opt = (cy.option ?? '').toLowerCase();
        return opt === 'team' || opt === 'player';
      });
      const timelineRows = visibleYears.map(cy => {
        // "2025-26" → season year 2026 (matches game's leagueStats.year convention)
        const yr = parseInt(cy.season.split('-')[0], 10) + 1;
        const isFutureRow = yr > currentYear;

        let teamName: string;
        let rowTid: number;
        const contractTeamId = Number(cy.teamId ?? -1);
        if (contractTeamId >= 0) {
          teamName = teamNameAtSeason(contractTeamId, yr) ?? currentTeamName;
          rowTid = contractTeamId;
        } else if (yr >= currentYear) {
          teamName = currentTeamName;
          rowTid = player.tid;
        } else {
          const sourceSalary = sourceSalaryBySeason.get(yr);
          const tid = provenanceTid(yr, sourceSalary?.tid);
          const abbrev = sourceSalary?.teamAbbrev ?? abbrevBySeason.get(yr);
          teamName = teamNameAtSeason(tid, yr, abbrev) ?? 'Unknown Team';
          rowTid = tid;
        }

        const currentYearRow = yr === currentYear;
        const optionKind = getContractTimelineOptionKind(
          cy,
          yr,
          currentYear,
          isTwoWay ? 'twoWay' : isNonGuaranteed ? 'nonGuaranteed' : 'none',
        );
        const optionLabel =
          optionKind === 'player' && playerOptionsActive ? 'Player Option' :
          optionKind === 'team' && rookieTeamOptionsActive ? 'Team Option' :
          optionKind === 'twoWay' ? secondaryContractLabel :
          optionKind === 'nonGuaranteed' ? 'Non-Guaranteed' :
          (rookieScaleActive && player.contract?.rookie && yr === currentYear) ? 'Rookie' : null;

        const salaryUSD = currentYearRow && isNonGuaranteed && (cy.guaranteed ?? 0) <= 0 && player.contract?.amount
          ? contractToUSD(player.contract.amount)
          : cy.guaranteed;
        return {
          season: yr,
          teamName,
          tid: rowTid,
          salaryUSD,
          isFuture: isFutureRow,
          option: currentYearRow && isNonGuaranteed && !optionLabel ? 'Non-Guaranteed' : optionLabel,
          scopeLabel: salaryScopeLabel(cy.conference ?? cy.competitionId),
          league: cy.type === 'pba_import' ? 'PBA' : undefined,
        };
      });
      return dedupeRows([...sourcePastRows, ...timelineRows]);
    }

    // ── Path B: BBGM salaries (past) + annualRaise escalator (future) ─────
    // Past rows from BBGM salaries[]
    const pastRows: SalaryDisplayRow[] = [];

    pastRows.push(...sourcePastRows);

    // Future rows: annualRaise escalator (only for game-generated contracts)
    const futureRows: typeof pastRows = [];
    const liveContractAmount = Number(player.contract?.amount ?? 0);
    const liveContractExp = Number(player.contract?.exp ?? 0);
    const isActiveRosteredPlayer = player.tid >= 0 && player.status !== 'Retired' && player.status !== 'Prospect';
    const baseUSD = liveContractAmount > 0
      ? contractToUSD(liveContractAmount)
      : isActiveRosteredPlayer
        ? Math.round(contractLimits.minSalaryUSD)
        : 0;
    const exp = liveContractExp >= currentYear ? liveContractExp : currentYear;
    if (baseUSD > 0 && exp >= currentYear && (liveContractAmount > 0 || isActiveRosteredPlayer)) {
      for (let yr = currentYear; yr <= exp; yr++) {
        const yearsFromNow = yr - currentYear;
        const isFinalYear = yr === exp;
        const hasPlayerOpt = playerOptionsActive && isFinalYear && !!player.contract.hasPlayerOption;
        const teamOptionExp = Number((player.contract as any).teamOptionExp ?? exp);
        const hasTeamOpt = rookieTeamOptionsActive && !!(player.contract as any).hasTeamOption &&
          yr === teamOptionExp;
        const isCurrentRow = yr === currentYear;
        futureRows.push({
          season: yr,
          teamName: currentTeamName,
          tid: player.tid,
          salaryUSD: isTwoWay
            ? developmentalActive ? getWnbaDevelopmentalCompensationUSD(player, state.leagueStats) : 625_000
            : annualRaise(baseUSD, yearsFromNow),
          isFuture: yearsFromNow > 0,
          option: isTwoWay ? secondaryContractLabel
            : (isCurrentRow && isNonGuaranteed) ? 'Non-Guaranteed'
            : hasPlayerOpt ? 'Player Option'
            : hasTeamOpt   ? 'Team Option'
            : (rookieScaleActive && player.contract.rookie && yr === currentYear ? 'Rookie' : null),
        });
      }
    }

    return dedupeRows([...pastRows, ...futureRows]);
  }, [abbrevBySeason, careerSalaries, careerStats, contractLimits.minSalaryUSD, contractYears, player, currentYear, currentTeamName, tidBySeason, teamNameAtSeason, isTwoWay, isNonGuaranteed, playerOptionsActive, rookieScaleActive, rookieTeamOptionsActive, state.leagueStats, developmentalActive, secondaryContractLabel]);
  const careerTotal = allRows.reduce((sum, r) => sum + r.salaryUSD, 0);

  const hasBirdRights = birdRightsActive && !!(player as any).hasBirdRights;
  const superMaxEligible = supermaxActive && !!(player as any).superMaxEligible;
  const isRookieExtEligible = rookieScaleActive && contractLimits.isRookieExtEligible;
  const rookieRoseQualified = contractLimits.rookieRoseQualified;

  return (
    <div className="p-4 md:p-8 space-y-4">
      {!euroIsolated && (isTwoWay || isNonGuaranteed || hasBirdRights || superMaxEligible || isRookieExtEligible || offseasonDecisionLabel) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {offseasonDecisionLabel && (
            <span className="text-[10px] font-black uppercase tracking-widest text-sky-300 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full">
              {offseasonDecisionLabel}
            </span>
          )}
          {isTwoWay && (
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
              {secondaryContractLabel} Contract
            </span>
          )}
          {isNonGuaranteed && !isTwoWay && (
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
              Non-Guaranteed{nonGuaranteedGuaranteeLabel ? ` · Guarantees ${nonGuaranteedGuaranteeLabel}` : ''}
            </span>
          )}
          {hasBirdRights && !isTwoWay && (
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              Bird Rights
            </span>
          )}
          {superMaxEligible && (
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
              Super Max Eligible
            </span>
          )}
          {isRookieExtEligible && !superMaxEligible && (
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
              {rookieRoseQualified ? 'Rookie Ext · Rose Rule' : 'Rookie Ext Eligible'}
            </span>
          )}
        </div>
      )}
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Salary History</h3>
        {allRows.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-4 py-8 text-center text-sm text-slate-500">
            No salary data available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
              <th className="py-2 text-left font-bold w-20">Season</th>
              <th className="py-2 text-left font-bold">Team</th>
              <th className="py-2 text-center font-bold w-16">Lg</th>
              <th className="py-2 text-right font-bold w-28">Salary</th>
              <th className="py-2 text-right font-bold w-28">Type</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${
                  row.season === currentYear ? 'bg-slate-800/20' : ''
                }`}
              >
                <td className="py-2 text-left font-mono text-slate-300">
                  {formatLeagueSeasonLabel(row.season, state.leagueStats)}
                </td>
                <td className="py-2 text-left text-slate-200 font-medium">
                  {row.teamName}
                  {row.scopeLabel && <span className="block text-[9px] uppercase tracking-wider text-slate-500">{row.scopeLabel}</span>}
                </td>
                <td className="py-2 text-center text-slate-400">{row.league ?? nonNBALeagueByTid.get(row.tid) ?? 'NBA'}</td>
                <td className="py-2 text-right font-mono font-bold text-slate-100">
                  {row.salaryUSD > 0
                    ? (row.league || nonNBALeagueByTid.has(row.tid)
                        ? formatExternalSalary(row.salaryUSD, row.league ?? nonNBALeagueByTid.get(row.tid)!)
                        : formatSalaryM(row.salaryUSD))
                    : <span className="text-slate-600">—</span>
                  }
                </td>
                <td className="py-2 text-right">
                  {row.option === 'Player Option' && (
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Player Opt.</span>
                  )}
                  {row.option === 'Team Option' && (
                    <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">Team Opt.</span>
                  )}
                  {row.option === 'Rookie' && (
                    <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">Rookie</span>
                  )}
                  {row.option === secondaryContractLabel && twoWayActive && (
                    <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">{secondaryContractLabel}</span>
                  )}
                  {row.option === 'Non-Guaranteed' && nonGuaranteedActive && (
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Non-Guar.</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {careerTotal > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-700 bg-slate-800/40">
                <td colSpan={4} className="py-2 text-left text-[10px] uppercase font-black text-slate-400 tracking-widest pl-1">
                  Career Earnings
                </td>
                <td className="py-2 text-right font-mono font-black text-emerald-400 pr-1">
                  {formatSalaryM(careerTotal)}
                </td>
              </tr>
            </tfoot>
          )}
            </table>
          </div>
        )}
      </section>
      <PlayerBioDisciplineTable player={player} />
    </div>
  );
};
