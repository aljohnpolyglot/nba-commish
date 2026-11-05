import React from 'react';
import { DollarSign } from 'lucide-react';
import { type CapThresholds, formatSalaryM } from '../../../utils/salaryUtils';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import type { LeagueStats } from '../../../types';

export const LeagueFinancesHeader: React.FC<{
  seasonYear: number;
  thresholds: CapThresholds;
  avgPayroll: number;
  overTaxCount: number;
  underCapCount: number;
  teamCount: number;
  leagueStats: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>;
}> = ({ seasonYear, thresholds, avgPayroll, overTaxCount, underCapCount, teamCount, leagueStats }) => {
  const capRulesActive = Number.isFinite(thresholds.salaryCap);
  const taxRulesActive = Number.isFinite(thresholds.luxuryTax);
  const firstApronActive = Number.isFinite(thresholds.firstApron);
  const secondApronActive = Number.isFinite(thresholds.secondApron);
  const cards = taxRulesActive
    ? [
        { label: 'Salary Cap', value: capRulesActive ? formatSalaryM(thresholds.salaryCap) : 'No Cap', color: 'text-sky-400' },
        { label: 'Luxury Tax', value: formatSalaryM(thresholds.luxuryTax), color: 'text-yellow-400' },
        { label: 'Avg Payroll', value: formatSalaryM(avgPayroll), color: 'text-white' },
        { label: 'Tax Payers', value: <>{overTaxCount}<span className="text-xs text-slate-500 font-normal"> / {teamCount}</span></>, color: 'text-rose-400' },
      ]
    : [
        { label: 'Salary Cap', value: capRulesActive ? formatSalaryM(thresholds.salaryCap) : 'No Cap', color: 'text-sky-400' },
        { label: 'Avg Payroll', value: formatSalaryM(avgPayroll), color: 'text-white' },
        { label: 'Under Cap', value: <>{underCapCount}<span className="text-xs text-slate-500 font-normal"> / {teamCount}</span></>, color: 'text-emerald-400' },
      ];

  return (
    <div className="flex-shrink-0 border-b border-slate-800/50 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
          <DollarSign size={16} className="text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white tracking-tight">Team Finances</h1>
          <p className="text-[10px] text-slate-400">{formatLeagueSeasonLabel(seasonYear, leagueStats)} · All {teamCount} Teams · Click any row for full breakdown</p>
        </div>
      </div>
      <div className={`grid gap-2.5 ${cards.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {cards.map(card => (
          <div key={card.label} className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/30">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{card.label}</div>
            <div className={`text-base font-black ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-[9px] text-slate-300">
        {capRulesActive ? (
          <>
            <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-sky-400 inline-block" /> Cap {formatSalaryM(thresholds.salaryCap)}</span>
            {taxRulesActive && <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-yellow-400 inline-block" /> Tax {formatSalaryM(thresholds.luxuryTax)}</span>}
            {firstApronActive && <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-orange-400 inline-block" /> 1st Apron {formatSalaryM(thresholds.firstApron)}</span>}
            {secondApronActive && <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-rose-400 inline-block" /> 2nd Apron {formatSalaryM(thresholds.secondApron)}</span>}
            <span className="ml-auto">{underCapCount} teams under cap</span>
          </>
        ) : (
          <span>No salary cap for this season.</span>
        )}
      </div>
    </div>
  );
};
