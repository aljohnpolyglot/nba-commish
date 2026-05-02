import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { contractToUSD, formatSalaryM, getContractLimits } from '../../../utils/salaryUtils';
import { formatExternalSalary } from '../../../constants';
import type { NBAPlayer } from '../../../types';

interface PlayerBioContractTabProps {
  player: NBAPlayer;
}

/** ~5% annual raise fallback for game-generated contracts (not from real gist data). */
function annualRaise(baseUSD: number, yearsFromNow: number): number {
  if (yearsFromNow <= 0) return baseUSD;
  return Math.round(baseUSD * Math.pow(1.05, yearsFromNow));
}

export const PlayerBioContractTab: React.FC<PlayerBioContractTabProps> = ({ player }) => {
  const { state } = useGame();
  const currentYear = state.leagueStats.year;

  // Team name lookup
  const teamNameMap = useMemo(() => {
    const m = new Map<number, string>();
    state.teams.forEach(t => m.set(t.id, t.name));
    // Include external league teams so overseas players don't show "Unknown"
    (state.nonNBATeams ?? []).forEach((t: any) => m.set(t.tid, t.region ? `${t.region} ${t.name}` : t.name));
    return m;
  }, [state.teams, state.nonNBATeams]);

  // Current team name for future rows
  const currentTeamName = useMemo(() => {
    if (player.tid >= 0) return teamNameMap.get(player.tid) ?? 'Unknown';
    return 'Free Agent';
  }, [player.tid, teamNameMap]);

  // Stat → tid lookup for historical team names
  const tidBySeason = useMemo(() => {
    const m = new Map<number, number>();
    (player.stats ?? []).forEach(s => {
      if (!s.playoffs && (s.tid ?? -1) >= 0 && !m.has(s.season)) m.set(s.season, s.tid);
    });
    return m;
  }, [player.stats]);

  // NonNBA tid → league name (for Lg column)
  const nonNBALeagueByTid = useMemo(() => {
    const m = new Map<number, string>();
    (state.nonNBATeams ?? []).forEach((t: any) => m.set(t.tid, t.league));
    return m;
  }, [state.nonNBATeams]);

  // Real per-season contract data from nbacontractsdata gist (stored by applyContractOverrides)
  const contractYears: Array<{ season: string; guaranteed: number; option: string }> =
    (player as any).contractYears ?? [];

  const isTwoWay = !!(player as any).twoWay;
  const isNonGuaranteed = !!(player as any).nonGuaranteed;

  // ── Build all rows ──────────────────────────────────────────────────────────
  const allRows = useMemo(() => {
    // ── Path A: Real contract data from gist ───────────────────────────────
    if (contractYears.length > 0) {
      let lastKnownTeamName = currentTeamName;
      let lastKnownTid = player.tid;
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
      return visibleYears.map(cy => {
        // "2025-26" → season year 2026 (matches game's leagueStats.year convention)
        const yr = parseInt(cy.season.split('-')[0], 10) + 1;
        const isFutureRow = yr > currentYear;

        let teamName: string;
        let rowTid: number;
        if (yr >= currentYear) {
          teamName = currentTeamName;
          rowTid = player.tid;
        } else {
          const tid = tidBySeason.get(yr);
          // Fall back to last known team when no stat entry exists for that season
          // (e.g. a team-option year where the player was cut/became FA mid-contract)
          teamName = tid != null ? (teamNameMap.get(tid) ?? lastKnownTeamName) : lastKnownTeamName;
          rowTid = tid ?? lastKnownTid;
        }
        lastKnownTeamName = teamName;
        lastKnownTid = rowTid;

        const optionLabel =
          cy.option === 'Player' ? 'Player Option' :
          cy.option === 'Team'   ? 'Team Option' :
          isTwoWay               ? 'Two-Way' :
          (player.contract?.rookie && yr === currentYear) ? 'Rookie' : null;

        const currentYearRow = yr === currentYear;
        return {
          season: yr,
          teamName,
          tid: rowTid,
          salaryUSD: cy.guaranteed,
          isFuture: isFutureRow,
          option: currentYearRow && isNonGuaranteed && !optionLabel ? 'Non-Guaranteed' : optionLabel,
        };
      });
    }

    // ── Path B: BBGM salaries (past) + annualRaise escalator (future) ─────
    // Past rows from BBGM salaries[]
    const bbgmSalaries: Array<{ season: number; amount: number }> = (player as any).salaries ?? [];
    const pastRows: Array<{ season: number; teamName: string; tid: number; salaryUSD: number; isFuture: boolean; option: string | null }> = [];

    if (bbgmSalaries.length > 0) {
      bbgmSalaries
        .slice()
        .sort((a, b) => a.season - b.season)
        .filter(sal => sal.season < currentYear && contractToUSD(sal.amount) > 0)
        .forEach(sal => {
          const tid = tidBySeason.get(sal.season) ?? -1;
          pastRows.push({
            season: sal.season,
            teamName: tid >= 0 ? (teamNameMap.get(tid) ?? 'Unknown') : 'Free Agent',
            tid,
            salaryUSD: contractToUSD(sal.amount),
            isFuture: false,
            option: null,
          });
        });
    }

    // Future rows: annualRaise escalator (only for game-generated contracts)
    const futureRows: typeof pastRows = [];
    if (player.contract?.amount && player.contract.exp) {
      const baseUSD = contractToUSD(player.contract.amount);
      const exp = player.contract.exp;
      for (let yr = currentYear; yr <= exp; yr++) {
        const yearsFromNow = yr - currentYear;
        const isFinalYear = yr === exp;
        const hasPlayerOpt = isFinalYear && !!player.contract.hasPlayerOption;
        const hasTeamOpt = !!(player.contract as any).hasTeamOption &&
          yr === ((player.contract as any).teamOptionExp ?? -1) + 1;
        const isCurrentRow = yr === currentYear;
        futureRows.push({
          season: yr,
          teamName: currentTeamName,
          tid: player.tid,
          salaryUSD: isTwoWay ? 625_000 : annualRaise(baseUSD, yearsFromNow),
          isFuture: yearsFromNow > 0,
          option: isTwoWay ? 'Two-Way'
            : (isCurrentRow && isNonGuaranteed) ? 'Non-Guaranteed'
            : hasPlayerOpt ? 'Player Option'
            : hasTeamOpt   ? 'Team Option'
            : (player.contract.rookie && yr === currentYear ? 'Rookie' : null),
        });
      }
    }

    return [...pastRows, ...futureRows];
  }, [contractYears, player, currentYear, currentTeamName, tidBySeason, teamNameMap, isTwoWay, isNonGuaranteed]);
  const careerTotal = allRows.reduce((sum, r) => sum + r.salaryUSD, 0);

  const hasBirdRights = !!(player as any).hasBirdRights;
  const superMaxEligible = !!(player as any).superMaxEligible;
  const { isRookieExtEligible, rookieRoseQualified } = useMemo(
    () => getContractLimits(player, state.leagueStats),
    [player, state.leagueStats],
  );

  if (allRows.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        No salary data available.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      {/* Contract status badges */}
      {(isTwoWay || isNonGuaranteed || hasBirdRights || superMaxEligible || isRookieExtEligible) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {isTwoWay && (
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
              Two-Way Contract
            </span>
          )}
          {isNonGuaranteed && !isTwoWay && (
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
              Non-Guaranteed · Guarantees Jan 10
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
                  {row.season - 1}–{String(row.season).slice(-2)}
                </td>
                <td className="py-2 text-left text-slate-200 font-medium">{row.teamName}</td>
                <td className="py-2 text-center text-slate-400">{nonNBALeagueByTid.get(row.tid) ?? 'NBA'}</td>
                <td className="py-2 text-right font-mono font-bold text-slate-100">
                  {row.salaryUSD > 0
                    ? (nonNBALeagueByTid.has(row.tid)
                        ? formatExternalSalary(row.salaryUSD, nonNBALeagueByTid.get(row.tid)!)
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
                  {row.option === 'Two-Way' && (
                    <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">Two-Way</span>
                  )}
                  {row.option === 'Non-Guaranteed' && (
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
    </div>
  );
};
