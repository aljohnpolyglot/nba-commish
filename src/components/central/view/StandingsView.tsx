import React, { useState, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type StandingsViewType = 'league' | 'conf' | 'div';

export const StandingsView: React.FC = () => {
  const { state, navigateToTeam } = useGame();
  const [viewType, setViewType] = useState<StandingsViewType>('conf');
  const currentYear = state.leagueStats.year;

  const standingsData = useMemo(() => {
    // Fast team lookup for conf/div comparisons
    const teamMap = new Map(state.teams.map(t => [t.id, t]));

    // Build exclusion set: preseason, playoff, play-in game IDs from the schedule
    // (GameResult has no isPreseason flag — must cross-reference state.schedule)
    const nonRegularGids = new Set(
      state.schedule
        .filter(g => g.isPreseason || g.isPlayoff || g.isPlayIn)
        .map(g => g.gid)
    );

    // Per-team accumulators derived from box scores
    const acc: Record<number, {
      totalWins: number; totalLosses: number;
      homeWins: number; homeLosses: number;
      confWins: number; confLosses: number;
      divWins: number; divLosses: number;
      ptsFor: number; ptsAgainst: number;
      games: { won: boolean; date: string }[];
    }> = {};

    state.teams.forEach(t => {
      acc[t.id] = {
        totalWins: 0, totalLosses: 0,
        homeWins: 0, homeLosses: 0,
        confWins: 0, confLosses: 0,
        divWins: 0, divLosses: 0,
        ptsFor: 0, ptsAgainst: 0,
        games: [],
      };
    });

    // Regular season only — exclude preseason/playoff/play-in via schedule lookup,
    // plus all-star variants which have no gid match
    state.boxScores
      .filter(g =>
        !g.isAllStar && !g.isRisingStars && !g.isCelebrityGame &&
        !nonRegularGids.has(g.gameId)
      )
      .forEach(g => {
        const homeAcc = acc[g.homeTeamId];
        const awayAcc = acc[g.awayTeamId];
        const homeWon = g.homeScore > g.awayScore;
        const homeTeam = teamMap.get(g.homeTeamId);
        const awayTeam = teamMap.get(g.awayTeamId);

        if (homeAcc && homeTeam) {
          homeAcc.ptsFor += g.homeScore;
          homeAcc.ptsAgainst += g.awayScore;
          homeWon ? homeAcc.totalWins++ : homeAcc.totalLosses++;
          homeWon ? homeAcc.homeWins++  : homeAcc.homeLosses++;
          homeAcc.games.push({ won: homeWon, date: g.date });

          if (awayTeam) {
            const sameConf = homeTeam.conference === awayTeam.conference;
            const sameDiv = homeTeam.did !== undefined && homeTeam.did === awayTeam.did;
            if (sameConf) { homeWon ? homeAcc.confWins++ : homeAcc.confLosses++; }
            if (sameDiv)  { homeWon ? homeAcc.divWins++  : homeAcc.divLosses++;  }
          }
        }

        if (awayAcc && awayTeam) {
          awayAcc.ptsFor += g.awayScore;
          awayAcc.ptsAgainst += g.homeScore;
          !homeWon ? awayAcc.totalWins++ : awayAcc.totalLosses++;
          awayAcc.games.push({ won: !homeWon, date: g.date });

          if (homeTeam) {
            const sameConf = awayTeam.conference === homeTeam.conference;
            const sameDiv = awayTeam.did !== undefined && awayTeam.did === homeTeam.did;
            if (sameConf) { !homeWon ? awayAcc.confWins++ : awayAcc.confLosses++; }
            if (sameDiv)  { !homeWon ? awayAcc.divWins++  : awayAcc.divLosses++;  }
          }
        }
      });

    const teams = state.teams.map(team => {
      const s = acc[team.id] ?? {
        totalWins: 0, totalLosses: 0,
        homeWins: 0, homeLosses: 0,
        confWins: 0, confLosses: 0,
        divWins: 0, divLosses: 0,
        ptsFor: 0, ptsAgainst: 0,
        games: [],
      };

      // Use box-score-derived totals so preseason is never counted
      const wins = s.totalWins;
      const losses = s.totalLosses;
      const totalGames = wins + losses;
      const winPct = totalGames > 0 ? wins / totalGames : 0;

      const roadWins = wins - s.homeWins;
      const roadLosses = losses - s.homeLosses;

      const avgPtsFor = totalGames > 0 ? (s.ptsFor / totalGames).toFixed(1) : '0.0';
      const avgPtsAgainst = totalGames > 0 ? (s.ptsAgainst / totalGames).toFixed(1) : '0.0';
      const movNum = totalGames > 0 ? (s.ptsFor - s.ptsAgainst) / totalGames : 0;
      const mov = movNum.toFixed(1);

      // streak is { type: 'W' | 'L', count: number } on NBATeam
      const streakObj = team.streak;
      const streakStr = streakObj
        ? `${streakObj.type === 'W' ? 'Won' : 'Lost'} ${streakObj.count}`
        : '-';

      // Last 10 regular season games
      const last10 = [...s.games]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);
      const l10Wins = last10.filter(g => g.won).length;
      const l10Losses = last10.length - l10Wins;

      // Division name from leagueStats.divs (keyed by did)
      const divObj = state.leagueStats.divs?.find(d => d.did === team.did);
      const division = divObj?.name ?? team.conference;

      return {
        ...team,
        wins,     // override team.wins with regular-season-only count
        losses,   // override team.losses with regular-season-only count
        winPct,
        movNum,
        homeRecord: `${s.homeWins}-${s.homeLosses}`,
        roadRecord: `${roadWins}-${roadLosses}`,
        divRecord: `${s.divWins}-${s.divLosses}`,
        confRecord: `${s.confWins}-${s.confLosses}`,
        avgPtsFor,
        avgPtsAgainst,
        mov,
        streakStr,
        l10Record: `${l10Wins}-${l10Losses}`,
        division,
      };
    });

    // Sort by win pct, then wins as tiebreaker
    teams.sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

    if (viewType === 'league') {
      return [{ title: 'League Standings', teams }];
    } else if (viewType === 'conf') {
      return [
        { title: 'Eastern Conference', teams: teams.filter(t => t.conference === 'East') },
        { title: 'Western Conference', teams: teams.filter(t => t.conference === 'West') },
      ];
    } else {
      const divNames = [...new Set(teams.map(t => t.division))].filter(Boolean).sort() as string[];
      return divNames.map(div => ({
        title: div.toLowerCase().endsWith('division') ? div : `${div} Division`,
        teams: teams.filter(t => t.division === div),
      }));
    }
  }, [state.teams, state.boxScores, state.schedule, state.leagueStats.divs, viewType]);

  const renderTable = (group: { title: string; teams: any[] }) => {
    const leader = group.teams[0];
    const leaderWins = leader?.wins || 0;
    const leaderLosses = leader?.losses || 0;

    return (
      <div key={group.title} className="mb-8">
        <h3 className="text-xl font-bold text-white mb-4 px-4">{group.title}</h3>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-y border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="px-3 py-3 font-medium text-center">W</th>
                <th className="px-3 py-3 font-medium text-center">L</th>
                <th className="px-3 py-3 font-medium text-center">%</th>
                <th className="px-3 py-3 font-medium text-center" title="Games Back">GB</th>
                <th className="px-3 py-3 font-medium text-center">Home</th>
                <th className="px-3 py-3 font-medium text-center">Road</th>
                <th className="px-3 py-3 font-medium text-center">Div</th>
                <th className="px-3 py-3 font-medium text-center">Conf</th>
                <th className="px-3 py-3 font-medium text-center" title="Points Scored Per Game">PS</th>
                <th className="px-3 py-3 font-medium text-center" title="Points Allowed Per Game">PA</th>
                <th className="px-3 py-3 font-medium text-center" title="Margin of Victory">MOV</th>
                <th className="px-3 py-3 font-medium text-center">Streak</th>
                <th className="px-3 py-3 font-medium text-center">L10</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {group.teams.map((team, index) => {
                const gb = ((leaderWins - team.wins) + (team.losses - leaderLosses)) / 2;
                const gbDisplay = gb === 0 ? '-' : gb.toFixed(1);

                return (
                  <tr key={team.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 w-4 text-right text-xs">{index + 1}</span>
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-slate-800 rounded p-1">
                          <img
                            src={team.logoUrl}
                            alt={team.abbrev}
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <button
                          onClick={() => navigateToTeam(team.id)}
                          className="font-medium text-slate-200 hover:text-indigo-400 transition-colors text-left flex items-center gap-1.5"
                        >
                          <span className="hidden sm:inline">{team.region} {team.name}</span>
                          <span className="sm:hidden">{team.abbrev}</span>
                          {team.clinchedPlayoffs && (
                            <span className="text-[10px] text-slate-500 font-bold">{team.clinchedPlayoffs}</span>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-white font-medium">{team.wins}</td>
                    <td className="px-3 py-2 text-center text-white">{team.losses}</td>
                    <td className="px-3 py-2 text-center text-slate-300">{team.winPct.toFixed(3).replace(/^0+/, '')}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{gbDisplay}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.homeRecord}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.roadRecord}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.divRecord}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.confRecord}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.avgPtsFor}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.avgPtsAgainst}</td>
                    <td className={`px-3 py-2 text-center font-medium ${team.movNum > 0 ? 'text-emerald-400' : team.movNum < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {team.movNum > 0 ? '+' : ''}{team.mov}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">{team.streakStr}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.l10Record}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Standings</h1>

          <div className="flex items-center gap-3">
            {/* Year indicator */}
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-md overflow-hidden">
              <button className="px-2 py-1.5 hover:bg-slate-800 text-slate-400 transition-colors border-r border-slate-700" disabled>
                <ChevronLeft className="w-4 h-4 opacity-50" />
              </button>
              <button className="px-2 py-1.5 hover:bg-slate-800 text-slate-400 transition-colors border-r border-slate-700" disabled>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
              <span className="bg-transparent text-white text-sm font-medium px-3 py-1.5 select-none">
                {currentYear}
              </span>
            </div>

            {/* View type selector */}
            <select
              className="bg-slate-900 border border-slate-700 text-white text-sm font-medium px-3 py-1.5 rounded-md outline-none cursor-pointer"
              value={viewType}
              onChange={(e) => setViewType(e.target.value as StandingsViewType)}
            >
              <option value="league">League</option>
              <option value="conf">Conference</option>
              <option value="div">Division</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0 sm:p-4">
        <div className="max-w-7xl mx-auto space-y-2">
          {standingsData.map(renderTable)}

          {/* Legend */}
          <div className="mt-8 p-4 text-sm text-slate-500 flex flex-col md:flex-row justify-between gap-6 border-t border-slate-800/50">
            <div className="space-y-0.5">
              <p><span className="font-bold text-slate-400">z</span> — clinched #1 seed</p>
              <p><span className="font-bold text-slate-400">x</span> — clinched playoffs</p>
              <p><span className="font-bold text-slate-400">w</span> — clinched play-in</p>
              <p><span className="font-bold text-slate-400">o</span> — eliminated from contention</p>
            </div>
            <div className="max-w-md">
              <p className="font-semibold text-slate-400 mb-2">Tiebreakers — {currentYear} season:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Head-to-head record</li>
                <li>Division winner</li>
                <li>Division record (same div)</li>
                <li>Conference record (same conf)</li>
                <li>Margin of victory</li>
                <li>Coin flip</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
