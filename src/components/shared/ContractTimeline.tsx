import React, { useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating } from '../../utils/helpers';
import { contractToUSD, formatSalaryM } from '../../utils/salaryUtils';

/** Apply NBA-standard ~5% annual raise to locked contract years (baked in at signing). */
function annualRaise(baseUSD: number, yearsFromNow: number): number {
  if (yearsFromNow <= 0) return baseUSD;
  return Math.round(baseUSD * Math.pow(1.05, yearsFromNow));
}

interface ContractTimelineProps {
  teamId: number;
  /** Optional: override currentYear (defaults to leagueStats.year) */
  currentYear?: number;
}

export const ContractTimeline: React.FC<ContractTimelineProps> = ({ teamId, currentYear: yearProp }) => {
  const { state } = useGame();
  const currentYear = yearProp ?? state.leagueStats.year;

  const teamPlayers = useMemo(
    () => state.players.filter(p =>
      p.tid === teamId &&
      !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')
    ),
    [state.players, teamId]
  );

  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? 15;
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;
  const twoWayCount = teamPlayers.filter(p => !!(p as any).twoWay).length;
  const ngCount = teamPlayers.filter(p => !!(p as any).nonGuaranteed).length;
  const standardCount = teamPlayers.length - twoWayCount;
  const mleCount = teamPlayers.filter(p => !!(p as any).mleSignedVia).length;

  return (
    <div className="overflow-x-auto custom-scrollbar p-3 sm:p-6">
      <table className="w-full text-sm text-left whitespace-nowrap border-separate border-spacing-y-2">
        <thead>
          <tr className="text-slate-400">
            <th className="pb-4 font-medium w-1/4">Player</th>
            <th className="pb-4 font-medium text-center w-32 text-yellow-500 border-b-2 border-yellow-500">{currentYear - 1}-{String(currentYear).slice(2)}</th>
            <th className="pb-4 font-medium text-center w-32">{currentYear}-{String(currentYear + 1).slice(2)}</th>
            <th className="pb-4 font-medium text-center w-32">{currentYear + 1}-{String(currentYear + 2).slice(2)}</th>
            <th className="pb-4 font-medium text-center w-32">{currentYear + 2}-{String(currentYear + 3).slice(2)}</th>
            <th className="pb-4 font-medium text-center w-32">{currentYear + 3}-{String(currentYear + 4).slice(2)}</th>
          </tr>
        </thead>
        <tbody>
          {[...teamPlayers].sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)).map(player => {
            const isTwoWayPlayer = !!(player as any).twoWay;
            const isNGPlayer = !!(player as any).nonGuaranteed;
            const baseUSD = isTwoWayPlayer ? 625_000 : contractToUSD(player.contract?.amount || 0);
            const expYear = player.contract?.exp || currentYear;
            const yearsLeft = expYear - currentYear + 1;

            const contractYears: Array<{ season: string; guaranteed: number; option: string }> =
              (player as any).contractYears ?? [];
            const cyByYear = new Map<number, { guaranteed: number; option: string }>();
            contractYears.forEach(cy => {
              const y = parseInt(cy.season.split('-')[0], 10) + 1;
              cyByYear.set(y, { guaranteed: cy.guaranteed, option: cy.option });
            });

            const lastNonZeroEntry = [...cyByYear.entries()]
              .filter(([, v]) => v.guaranteed > 0)
              .sort(([a], [b]) => b - a)[0];
            const lastNonZeroYear = lastNonZeroEntry?.[0] ?? currentYear;
            const lastNonZeroUSD  = lastNonZeroEntry?.[1]?.guaranteed ?? baseUSD;

            // First leagueStats year where the deal pays. For a rookie drafted
            // during leagueStats.year=2026, contractYears starts at "2026-27"
            // (leagueStats year 2027) — so the current-year column must render
            // empty rather than fall through to the annualRaise fallback.
            const firstCyYear = cyByYear.size > 0
              ? Math.min(...[...cyByYear.keys()])
              : null;

            const yr = (n: number): number => {
              if (isTwoWayPlayer) return 625_000;
              const y = currentYear + n;
              const cy = cyByYear.get(y);
              if (cy) {
                if (cy.guaranteed > 0) return cy.guaranteed;
                const delta = y - lastNonZeroYear;
                return annualRaise(lastNonZeroUSD, delta);
              }
              return annualRaise(baseUSD, n);
            };

            const optType = (n: number): 'player' | 'team' | 'twoway' | 'ng' | null => {
              if (isTwoWayPlayer) return 'twoway';
              if (isNGPlayer && n === 0) return 'ng';
              const y = currentYear + n;
              const cy = cyByYear.get(y);
              if (cy?.option === 'Player') return 'player';
              if (cy?.option === 'Team')   return 'team';
              if (y === expYear) {
                if (player.contract?.hasPlayerOption) return 'player';
                if ((player.contract as any)?.hasTeamOption) return 'team';
              }
              return null;
            };

            const getCellStyle = (n: number) => {
              const opt = optType(n);
              if (opt === 'twoway') return 'bg-purple-500/20 text-purple-300 font-bold text-center py-1.5 rounded border border-purple-500/30';
              if (opt === 'ng')     return 'bg-amber-500/15 text-amber-300 font-bold text-center py-1.5 rounded border border-amber-500/40 border-dashed';
              if (opt === 'player') return 'bg-[#facc15]/10 text-[#facc15] font-bold text-center py-1.5 rounded border border-[#facc15] border-dashed';
              if (opt === 'team')   return 'bg-[#38bdf8]/10 text-[#38bdf8] font-bold text-center py-1.5 rounded border border-[#38bdf8] border-dashed';
              return 'bg-[#facc15] text-slate-900 font-bold text-center py-1.5 rounded';
            };

            const faCell    = <div className="text-slate-600 text-xs text-center py-1.5">FA</div>;
            const emptyCell = <div className="text-slate-800 text-xs text-center py-1.5">—</div>;
            const cell = (n: number) => {
              // Pre-contract column for rookies (drafted but first paid season is
              // currentYear+1). Leave blank — they're not on the books yet.
              if (firstCyYear !== null && currentYear + n < firstCyYear) return emptyCell;
              return yearsLeft > n
                ? <div className={getCellStyle(n)}>{formatSalaryM(yr(n))}</div>
                : (yearsLeft === n ? faCell : emptyCell);
            };

            return (
              <tr key={player.internalId}>
                <td
                  className={`py-1 pl-2 border-l-[3px] rounded-l-md ${
                    isTwoWayPlayer
                      ? 'border-purple-500/70 bg-purple-500/[0.04]'
                      : isNGPlayer
                      ? 'border-amber-500/70 bg-amber-500/[0.04]'
                      : 'border-[#facc15]/60 bg-[#facc15]/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${isTwoWayPlayer ? 'text-purple-300' : isNGPlayer ? 'text-amber-200' : 'text-slate-200'}`}>
                      {player.name.split(' ')[0][0]}. {player.name.split(' ').slice(1).join(' ')}
                    </span>
                    {(() => { const k2 = convertTo2KRating(player.overallRating, player.ratings?.[player.ratings.length-1]?.hgt ?? 50, player.ratings?.[player.ratings.length-1]?.tp); return <span className={`text-xs ${k2 >= 85 ? 'text-emerald-400' : k2 >= 75 ? 'text-slate-300' : 'text-slate-500'}`}>{k2}</span>; })()}
                    {isTwoWayPlayer && <span className="text-[8px] font-black text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-widest">2W</span>}
                    {isNGPlayer && !isTwoWayPlayer && <span className="text-[8px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-widest">NG</span>}
                  </div>
                </td>
                <td className="py-1 px-1">{cell(0)}</td>
                <td className="py-1 px-1">{cell(1)}</td>
                <td className="py-1 px-1">{cell(2)}</td>
                <td className="py-1 px-1">{cell(3)}</td>
                <td className="py-1 px-1">{cell(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-6 flex items-center gap-6 text-xs text-slate-400 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-[#facc15] rounded-sm" />
          <span>Guaranteed <span className="text-slate-300 font-mono">{standardCount}/{maxStandard}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-cyan-500/20 border border-cyan-500/30 rounded-sm" />
          <span className="text-cyan-300">MLE <span className="font-mono">{mleCount}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-500/20 border border-purple-500/30 rounded-sm" />
          <span className="text-purple-300">Two-Way <span className="font-mono">{twoWayCount}/{maxTwoWay}</span></span>
        </div>
        {ngCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500/15 border border-amber-500/40 border-dashed rounded-sm" />
            <span className="text-amber-300">Non-Guaranteed <span className="font-mono">{ngCount}</span></span>
          </div>
        )}
        <div className="flex items-center gap-2 border border-slate-500 border-dashed px-2 py-0.5 rounded"><span>Player option</span></div>
        <div className="flex items-center gap-2 border border-[#38bdf8] border-dashed px-2 py-0.5 rounded text-[#38bdf8]"><span>Team option</span></div>
        <div className="flex items-center gap-2"><span className="text-slate-600 font-bold">FA</span><span>Free agent</span></div>
      </div>
    </div>
  );
};
