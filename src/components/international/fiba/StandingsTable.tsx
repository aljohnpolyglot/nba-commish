import { standings, getFlagUrl } from '../../../data/fiba/data';
import type { Team } from '../../../data/fiba/types';

interface StandingsTableProps {
  teams?: Team[];
  mode?: 'standings' | 'odds';
  onTeamSelect?: (teamCode: string) => void;
}

export default function StandingsTable({ teams = standings, mode = 'standings', onTeamSelect }: StandingsTableProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 pb-16">
      <div className="bg-[#1b2330] rounded-none overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#2d3544]">
              <th className="py-4 px-6 text-[13px] font-bold text-[#8d939e] uppercase tracking-wider w-16 text-center">#</th>
              <th className="py-4 px-6 text-[13px] font-bold text-[#8d939e] uppercase tracking-wider">Teams</th>
              {mode === 'odds' && (
                <th className="py-4 px-6 text-right text-[13px] font-bold text-[#8d939e] uppercase tracking-wider">Title Odds</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2d3544]">
            {teams.map((team) => {
              const selectable = !!team.code && !!onTeamSelect;
              const flagSrc = team.flagUrl || getFlagUrl(team.flagId ?? '', team.code);
              const selectTeam = () => {
                if (team.code) onTeamSelect?.(team.code);
              };
              return (
              <tr
                key={team.code ?? `${team.rank}-${team.name}`}
                className={`transition-colors group ${selectable ? 'cursor-pointer hover:bg-[#252f40]' : ''}`}
                onClick={selectable ? selectTeam : undefined}
                onKeyDown={selectable ? event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectTeam();
                  }
                } : undefined}
                role={selectable ? 'button' : undefined}
                tabIndex={selectable ? 0 : undefined}
              >
                <td className="py-4 px-6 text-center font-bold text-white text-sm">
                  {team.rank}.
                </td>
                <td className="py-4 px-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-7 flex items-center justify-center">
                      {flagSrc ? (
                        <img src={flagSrc} alt="" className="max-w-full max-h-full object-cover rounded-sm" />
                      ) : (
                        <span className="text-[10px] font-black text-slate-500">{team.code}</span>
                      )}
                    </div>
                    <span className="font-semibold text-white text-[15px]">{team.name}</span>
                  </div>
                </td>
                {mode === 'odds' && (
                  <td className="py-4 px-6 text-right font-black text-[#5bf5a3] text-sm">{team.odds}</td>
                )}
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}
