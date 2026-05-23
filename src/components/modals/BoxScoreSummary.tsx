import type { Game, GameResult, PlayerGameStats } from '../../types';
import { getPeriodLabel } from '../../utils/gameClock';

interface BoxScoreQuarterlyScoresProps {
  awayAbbrevLabel: string;
  game: Game;
  homeAbbrevLabel: string;
  numQuarters: number;
  result?: GameResult;
}

export function BoxScoreQuarterlyScores({
  awayAbbrevLabel,
  game,
  homeAbbrevLabel,
  numQuarters,
  result,
}: BoxScoreQuarterlyScoresProps) {
  if (!result?.quarterScores) return null;

  const { home, away } = result.quarterScores;
  const otCount = result.isOT ? result.otCount : 0;
  const periodHeaders = Array.from({ length: numQuarters }, (_, i) => getPeriodLabel(i + 1, numQuarters));
  const periodCellsFor = (scores: number[]) => scores.slice(0, numQuarters);

  const renderRow = (label: string, scores: number[], total: number, keyPrefix: string) => (
    <tr>
      <td className="py-2 text-left font-bold text-slate-300">{label}</td>
      {periodCellsFor(scores).map((score, i) => (
        <td key={`${keyPrefix}-q-${i}`} className="py-2 font-mono text-slate-400">{score}</td>
      ))}
      {Array.from({ length: otCount }).map((_, i) => (
        <td key={`${keyPrefix}-ot-${i}`} className="py-2 font-mono text-slate-400">{scores[numQuarters + i] ?? 0}</td>
      ))}
      <td className="py-2 font-mono font-bold text-white">{total}</td>
    </tr>
  );

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 px-4 overflow-x-auto custom-scrollbar">
      <table className="w-full text-xs text-center">
        <thead className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/10">
          <tr>
            <th className="py-2 text-left">Team</th>
            {periodHeaders.map((period) => <th key={period} className="py-2">{period}</th>)}
            {Array.from({ length: otCount }).map((_, i) => (
              <th key={`ot-${i}`} className="py-2">OT{i + 1}</th>
            ))}
            <th className="py-2 font-bold text-white">T</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {renderRow(awayAbbrevLabel, away, game.awayScore, 'away')}
          {renderRow(homeAbbrevLabel, home, game.homeScore, 'home')}
        </tbody>
      </table>
    </div>
  );
}

interface BoxScoreTeamComparisonProps {
  awayAbbrevLabel: string;
  awayTeamId: number;
  fourPointEnabled: boolean;
  homeAbbrevLabel: string;
  homeTeamId: number;
  onTeamClick?: (teamId: number) => void;
  result?: GameResult;
}

function calculateTeamStats(stats: PlayerGameStats[], oppStats: PlayerGameStats[]) {
  let fgm = 0, fga = 0, threePm = 0, threePa = 0, fourPm = 0, fourPa = 0, ftm = 0, fta = 0, orb = 0, drb = 0, ast = 0, stl = 0, blk = 0, tov = 0, pf = 0;
  let fgAtRim = 0, fgLowPost = 0;
  stats.forEach((stat) => {
    fgm += stat.fgm; fga += stat.fga;
    threePm += stat.threePm; threePa += stat.threePa;
    fourPm += stat.fourPm || 0; fourPa += stat.fourPa || 0;
    ftm += stat.ftm; fta += stat.fta;
    orb += stat.orb; drb += stat.drb;
    ast += stat.ast; stl += stat.stl;
    blk += stat.blk; tov += stat.tov; pf += stat.pf;
    fgAtRim += stat.fgAtRim || 0; fgLowPost += stat.fgLowPost || 0;
  });

  let oppDrb = 0;
  oppStats.forEach((stat) => { oppDrb += stat.drb; });

  const eFG = fga > 0 ? ((fgm + 0.5 * threePm + fourPm) / fga) * 100 : 0;
  const tovPct = (fga + 0.44 * fta + tov) > 0 ? (tov / (fga + 0.44 * fta + tov)) * 100 : 0;
  const orbPct = (orb + oppDrb) > 0 ? (orb / (orb + oppDrb)) * 100 : 0;
  const ftFga = fga > 0 ? fta / fga : 0;
  const pip = fgAtRim * 2 + fgLowPost * 2;

  return {
    eFG, tovPct, orbPct, ftFga, pip,
    fgm, fga, threePm, threePa, fourPm, fourPa, ftm, fta, orb, drb, ast, stl, blk, tov, pf,
  };
}

export function BoxScoreTeamComparison({
  awayAbbrevLabel,
  awayTeamId,
  fourPointEnabled,
  homeAbbrevLabel,
  homeTeamId,
  onTeamClick,
  result,
}: BoxScoreTeamComparisonProps) {
  if (!result) return null;
  const awayStats = calculateTeamStats(result.awayStats, result.homeStats);
  const homeStats = calculateTeamStats(result.homeStats, result.awayStats);

  const StatRow = ({ label, awayVal, homeVal }: { label: string; awayVal: string | number; homeVal: string | number }) => (
    <div className="flex justify-between items-center py-2 border-b border-white/5">
      <div className="w-1/3 text-left font-mono text-slate-300">{awayVal}</div>
      <div className="w-1/3 text-center text-[10px] text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="w-1/3 text-right font-mono text-slate-300">{homeVal}</div>
    </div>
  );

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto mt-6 mb-6 px-4">
      <table className="w-full text-xs text-center mb-8">
        <thead className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/10">
          <tr>
            <th className="py-2 text-left">Team</th>
            <th className="py-2">eFG%</th>
            <th className="py-2">TOV%</th>
            <th className="py-2">ORB%</th>
            <th className="py-2">FTA/FGA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          <tr>
            <td className="py-2 text-left">
              <button onClick={() => onTeamClick?.(awayTeamId)} className="font-bold text-white hover:text-indigo-400 transition-colors">
                {awayAbbrevLabel}
              </button>
            </td>
            <td className="py-2 font-mono text-slate-300">{awayStats.eFG.toFixed(1)}</td>
            <td className="py-2 font-mono text-slate-300">{awayStats.tovPct.toFixed(1)}</td>
            <td className="py-2 font-mono text-slate-300">{awayStats.orbPct.toFixed(1)}</td>
            <td className="py-2 font-mono text-slate-300">{awayStats.ftFga.toFixed(3)}</td>
          </tr>
          <tr>
            <td className="py-2 text-left">
              <button onClick={() => onTeamClick?.(homeTeamId)} className="font-bold text-white hover:text-indigo-400 transition-colors">
                {homeAbbrevLabel}
              </button>
            </td>
            <td className="py-2 font-mono text-slate-300">{homeStats.eFG.toFixed(1)}</td>
            <td className="py-2 font-mono text-slate-300">{homeStats.tovPct.toFixed(1)}</td>
            <td className="py-2 font-mono text-slate-300">{homeStats.orbPct.toFixed(1)}</td>
            <td className="py-2 font-mono text-slate-300">{homeStats.ftFga.toFixed(3)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex justify-between text-xs font-bold tracking-widest text-slate-500 mb-2">
        <span className="text-white">{awayAbbrevLabel}</span>
        <span>TEAM STATS</span>
        <span className="text-indigo-400">{homeAbbrevLabel}</span>
      </div>

      <div className="flex flex-col">
        <StatRow label="Field Goals" awayVal={`${awayStats.fgm}-${awayStats.fga} (${awayStats.fga > 0 ? ((awayStats.fgm / awayStats.fga) * 100).toFixed(1) : '0.0'}%)`} homeVal={`${homeStats.fgm}-${homeStats.fga} (${homeStats.fga > 0 ? ((homeStats.fgm / homeStats.fga) * 100).toFixed(1) : '0.0'}%)`} />
        <StatRow label="3PT FG" awayVal={`${awayStats.threePm}-${awayStats.threePa} (${awayStats.threePa > 0 ? ((awayStats.threePm / awayStats.threePa) * 100).toFixed(1) : '0.0'}%)`} homeVal={`${homeStats.threePm}-${homeStats.threePa} (${homeStats.threePa > 0 ? ((homeStats.threePm / homeStats.threePa) * 100).toFixed(1) : '0.0'}%)`} />
        {fourPointEnabled && (
          <StatRow label="4PT FG" awayVal={`${awayStats.fourPm}-${awayStats.fourPa} (${awayStats.fourPa > 0 ? ((awayStats.fourPm / awayStats.fourPa) * 100).toFixed(1) : '0.0'}%)`} homeVal={`${homeStats.fourPm}-${homeStats.fourPa} (${homeStats.fourPa > 0 ? ((homeStats.fourPm / homeStats.fourPa) * 100).toFixed(1) : '0.0'}%)`} />
        )}
        <StatRow label="Free Throws" awayVal={`${awayStats.ftm}-${awayStats.fta} (${awayStats.fta > 0 ? ((awayStats.ftm / awayStats.fta) * 100).toFixed(1) : '0.0'}%)`} homeVal={`${homeStats.ftm}-${homeStats.fta} (${homeStats.fta > 0 ? ((homeStats.ftm / homeStats.fta) * 100).toFixed(1) : '0.0'}%)`} />
        <StatRow label="Rebounds" awayVal={awayStats.orb + awayStats.drb} homeVal={homeStats.orb + homeStats.drb} />
        <StatRow label="Assists" awayVal={awayStats.ast} homeVal={homeStats.ast} />
        <StatRow label="Steals" awayVal={awayStats.stl} homeVal={homeStats.stl} />
        <StatRow label="Blocks" awayVal={awayStats.blk} homeVal={homeStats.blk} />
        <StatRow label="Turnovers" awayVal={awayStats.tov} homeVal={homeStats.tov} />
        <StatRow label="Fouls" awayVal={awayStats.pf} homeVal={homeStats.pf} />
        <StatRow label="Points in the Paint" awayVal={awayStats.pip} homeVal={homeStats.pip} />
      </div>
    </div>
  );
}

