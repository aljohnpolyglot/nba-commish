import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { contractToUSD, formatSalaryM } from '../../../utils/salaryUtils';
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
    return m;
  }, [state.teams]);

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

  // Real per-season contract data from nbacontractsdata gist (stored by applyContractOverrides)
  const contractYears: Array<{ season: string; guaranteed: number; option: string }> =
    (player as any).contractYears ?? [];

  const isTwoWay = !!(player as any).twoWay;

  // ── Build all rows ──────────────────────────────────────────────────────────
  const allRows = useMemo(() => {
    // ── Path A: Real contract data from gist ───────────────────────────────
    if (contractYears.length > 0) {
      return contractYears.map(cy => {
        // "2025-26" → season year 2026 (matches game's leagueStats.year convention)
        const yr = parseInt(cy.season.split('-')[0], 10) + 1;
        const isFutureRow = yr > currentYear;

        let teamName: string;
        if (yr >= currentYear) {
          teamName = currentTeamName;
        } else {
          const tid = tidBySeason.get(yr);
          teamName = tid != null ? (teamNameMap.get(tid) ?? 'Unknown') : 'Unknown';
        }

        const optionLabel =
          cy.option === 'Player' ? 'Player Option' :
          cy.option === 'Team'   ? 'Team Option' :
          isTwoWay               ? 'Two-Way' : null;

        return {
          season: yr,
          teamName,
          salaryUSD: cy.guaranteed,
          isFuture: isFutureRow,
          option: optionLabel,
        };
      });
    }

    // ── Path B: BBGM salaries (past) + annualRaise escalator (future) ─────
    // Past rows from BBGM salaries[]
    const bbgmSalaries: Array<{ season: number; amount: number }> = (player as any).salaries ?? [];
    const pastRows: Array<{ season: number; teamName: string; salaryUSD: number; isFuture: boolean; option: string | null }> = [];

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
        futureRows.push({
          season: yr,
          teamName: currentTeamName,
          salaryUSD: isTwoWay ? 625_000 : annualRaise(baseUSD, yearsFromNow),
          isFuture: yearsFromNow > 0,
          option: isTwoWay ? 'Two-Way'
            : hasPlayerOpt ? 'Player Option'
            : hasTeamOpt   ? 'Team Option'
            : (player.contract.rookie && yr === currentYear ? 'Rookie' : null),
        });
      }
    }

    return [...pastRows, ...futureRows];
  }, [contractYears, player, currentYear, currentTeamName, tidBySeason, teamNameMap, isTwoWay]);
  const careerTotal = allRows.reduce((sum, r) => sum + r.salaryUSD, 0);

  const hasBirdRights = !!(player as any).hasBirdRights;
  const superMaxEligible = !!(player as any).superMaxEligible;

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
      {(isTwoWay || hasBirdRights || superMaxEligible) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {isTwoWay && (
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
              Two-Way Contract
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
                <td className="py-2 text-center text-slate-400">NBA</td>
                <td className="py-2 text-right font-mono font-bold text-slate-100">
                  {row.salaryUSD > 0
                    ? formatSalaryM(row.salaryUSD)
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
