import React, { useState } from 'react';
import { ThreePointContestant } from '../data/contestants';
import { ThreePointContestResult } from '../data/ThreePointContestSim';

interface ResultsTable3PTProps {
  contestants: ThreePointContestant[];
  result: ThreePointContestResult | null;
}

export function ResultsTable3PT({ contestants, result }: ResultsTable3PTProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (!result) return null;

  // Build rows
  const rows = contestants.map(c => {
    const r1 = result.round1.find(r => r.playerId === c.id);
    const finals = result.finals.find(r => r.playerId === c.id);
    
    const isWinner = result.winnerId === c.id;
    const isFinalist = !!finals;
    
    let sortScore = 0;
    if (isWinner) sortScore = 1000 + (finals?.totalScore || 0);
    else if (isFinalist) sortScore = 500 + (finals?.totalScore || 0);
    else sortScore = r1?.totalScore || 0;

    return {
      contestant: c,
      r1,
      finals,
      isWinner,
      isFinalist,
      sortScore
    };
  });

  rows.sort((a, b) => b.sortScore - a.sortScore);

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Final Results</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] sm:text-xs tracking-wider">
              <tr>
                <th className="p-2 sm:p-4 font-medium">Rank</th>
                <th className="p-2 sm:p-4 font-medium">Player</th>
                <th className="p-2 sm:p-4 font-medium hidden sm:table-cell">Team</th>
                <th className="p-2 sm:p-4 font-medium text-right">R1</th>
                <th className="p-2 sm:p-4 font-medium text-right">Finals</th>
                <th className="p-2 sm:p-4 font-medium text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.map((row, idx) => {
                let rowBg = 'bg-transparent';
                let rankColor = 'text-slate-400';
                let resultText = 'DNQ';
                let resultColor = 'text-slate-500';

                if (row.isWinner) {
                  rowBg = 'bg-amber-500/10';
                  rankColor = 'text-amber-500 font-bold';
                  resultText = 'Champion';
                  resultColor = 'text-amber-500 font-bold';
                } else if (row.isFinalist) {
                  rankColor = 'text-slate-300 font-bold';
                  resultText = 'Finalist';
                  resultColor = 'text-amber-500/80';
                }

                const isExpanded = expandedRow === row.contestant.id;

                return (
                  <React.Fragment key={row.contestant.id}>
                    <tr 
                      className={`${rowBg} hover:bg-slate-800/30 transition-colors cursor-pointer`}
                      onClick={() => setExpandedRow(isExpanded ? null : row.contestant.id)}
                    >
                      <td className={`p-2 sm:p-4 ${rankColor}`}>{idx + 1}</td>
                      <td className="p-2 sm:p-4">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                          <img src={row.contestant.imgURL} alt={row.contestant.name} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 object-cover" />
                          <span className="font-bold text-white text-xs sm:text-sm">{row.contestant.name}</span>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-slate-300 hidden sm:table-cell">{row.contestant.team}</td>
                      <td className="p-2 sm:p-4 text-right font-mono text-base sm:text-lg text-slate-200">{row.r1?.totalScore || 0}</td>
                      <td className="p-2 sm:p-4 text-right font-mono text-base sm:text-lg text-white font-bold">
                        {row.finals?.totalScore !== undefined ? row.finals.totalScore : '-'}
                      </td>
                      <td className={`p-2 sm:p-4 text-right ${resultColor} uppercase text-[9px] sm:text-xs tracking-wider`}>
                        {resultText}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-900/50">
                        <td colSpan={6} className="p-4 border-t border-slate-800/50">
                          <div className="flex flex-col space-y-3">
                            {row.r1 && (
                              <div className="flex items-center justify-end space-x-4">
                                <span className="text-xs text-slate-400 uppercase tracking-wider">Round 1 Breakdown:</span>
                                <div className="flex space-x-2">
                                  {row.r1.stations.map((s, i) => (
                                    <div key={i} className="px-2 py-1 bg-slate-800 rounded text-xs font-mono text-slate-300 border border-slate-700">
                                      {s.score}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {row.finals && (
                              <div className="flex items-center justify-end space-x-4">
                                <span className="text-xs text-slate-400 uppercase tracking-wider">Finals Breakdown:</span>
                                <div className="flex space-x-2">
                                  {row.finals.stations.map((s, i) => (
                                    <div key={i} className="px-2 py-1 bg-slate-800 rounded text-xs font-mono text-amber-500 border border-slate-700">
                                      {s.score}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
