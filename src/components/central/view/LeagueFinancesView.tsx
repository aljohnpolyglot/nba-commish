import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { formatCurrency } from '../../../utils/helpers';
import { ExternalLink } from 'lucide-react';

export const LeagueFinancesView: React.FC = () => {
  const { state, setSelectedTeamId, setCurrentView } = useGame();
const currentYear = state.leagueStats.year;

  const {
    salaryCap,
    luxuryPayroll,
    luxuryTax,
    minContract
  } = state.leagueStats;

  // We need to calculate payrolls for each team
  const teamFinances = useMemo(() => {
    const finances = state.teams.map(team => {
      // Calculate payroll
      const teamPlayers = state.players.filter(p => p.tid === team.id);
      const payroll = teamPlayers.reduce((sum, p) => {
        return sum + (p.contract?.amount || 0);
      }, 0);

      // Calculate cap space
      const capSpace = salaryCap - payroll;

      // Mock other values if they don't exist in NBATeam
      const pop = team.pop || Math.floor(Math.random() * 15000000) + 5000000;
      const avgAttendance = Math.floor(Math.random() * 5000) + 15000;
      const ticketPrice = Math.random() * 100 + 50;
      const revenue = Math.random() * 200000000 + 100000000;
      const profit = revenue - payroll - (Math.random() * 50000000);
      const cash = Math.random() * 50000000 + 10000000;
      const rosterSpots = 15 - teamPlayers.length;
      const strategy = team.wins > team.losses ? 'Contending' : 'Rebuilding';

      return {
        ...team,
        payroll,
        capSpace,
        pop,
        avgAttendance,
        ticketPrice,
        revenue,
        profit,
        cash,
        rosterSpots,
        strategy
      };
    });

    // Sort by payroll descending
    return finances.sort((a, b) => b.payroll - a.payroll);
  }, [state.teams, state.players, salaryCap]);

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header Bar */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              League Finances
              <ExternalLink className="w-4 h-4 text-slate-500" />
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-2 text-sm text-slate-300">
            <p>
              Salary cap: <strong className="text-white">{formatCurrency(salaryCap, false)}</strong> (teams over this amount cannot sign free agents for more than the minimum contract)
            </p>
            <p>
              Luxury tax limit: <strong className="text-white">{formatCurrency(luxuryPayroll, false)}</strong> (teams with payrolls above this limit will be assessed a fine equal to {luxuryTax} times the difference at the end of the season)
            </p>
          </div>

          <div className="overflow-x-auto custom-scrollbar border border-slate-800 rounded-xl">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-slate-400 uppercase bg-slate-900/80 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Team</th>
                  <th className="px-4 py-3 font-medium text-right">Pop</th>
                  <th className="px-4 py-3 font-medium text-right">Avg Attendance</th>
                  <th className="px-4 py-3 font-medium text-right">Ticket Price</th>
                  <th className="px-4 py-3 font-medium text-right">Revenue</th>
                  <th className="px-4 py-3 font-medium text-right">Profit</th>
                  <th className="px-4 py-3 font-medium text-right">Cash</th>
                  <th className="px-4 py-3 font-medium text-right">Payroll</th>
                  <th className="px-4 py-3 font-medium text-right">Cap Space</th>
                  <th className="px-4 py-3 font-medium text-center">Roster Spots</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 bg-slate-900/30">
                {teamFinances.map((team) => (
                  <tr key={team.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-slate-800 rounded p-1">
                          <img 
                            src={team.logoUrl} 
                            alt={team.abbrev}
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${team.abbrev}&background=random`;
                            }}
                          />
                        </div>
                        <button 
                          onClick={() => {
                            setSelectedTeamId(team.id);
                            setCurrentView('Team Finances');
                          }}
                          className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                      {team.region || team.name.split(' ')[0]} {team.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{team.pop.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{team.avgAttendance.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatCurrency(team.ticketPrice, false)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatCurrency(team.revenue, false)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${team.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(team.profit, false)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatCurrency(team.cash, false)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-200">{formatCurrency(team.payroll, false)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${team.capSpace >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(team.capSpace, false)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-300">{team.rosterSpots}</td>
                    <td className="px-4 py-3 text-slate-300">{team.strategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
};
