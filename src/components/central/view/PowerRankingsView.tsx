import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBATeam, Game } from '../../../types';
import { getOwnTeamId } from '../../../utils/helpers';

export const PowerRankingsView: React.FC = () => {
  const { state, navigateToTeam } = useGame();
  const ownTid = getOwnTeamId(state);

  const rankings = useMemo(() => {
    const teamGames = new Map<number, Game[]>();
    state.teams.forEach(t => teamGames.set(t.id, []));

    state.schedule.forEach(game => {
      if (game.played && !game.isPreseason && !game.isAllStar && !game.isExhibition) {
        if (teamGames.has(game.homeTid)) teamGames.get(game.homeTid)!.push(game);
        if (teamGames.has(game.awayTid)) teamGames.get(game.awayTid)!.push(game);
      }
    });

    teamGames.forEach((games, tid) => {
      games.sort((a, b) => b.gid - a.gid);
    });

    const allHave10Games = Array.from(teamGames.values()).every(games => games.length >= 10);

    const calculateScore = (team: NBATeam, games: Game[]) => {
      const wins = games.filter(g => {
        const isHome = g.homeTid === team.id;
        return isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
      }).length;
      const totalGames = games.length;
      const winPct = totalGames > 0 ? wins / totalGames : 0;

      const l10Games = games.slice(0, 10);
      const l10Wins = l10Games.filter(g => {
        const isHome = g.homeTid === team.id;
        return isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
      }).length;
      const l10WinPct = l10Games.length > 0 ? l10Wins / l10Games.length : 0;

      let score = 0;
      if (allHave10Games) {
        score = (winPct * 100 * 0.5) + (team.strength * 0.2) + (l10WinPct * 100 * 0.3);
      } else {
        const lastSeason = team.seasons?.find(s => s.season === state.leagueStats.year - 1);
        const lastSeasonWinPct = lastSeason && (lastSeason.won + lastSeason.lost > 0) 
          ? lastSeason.won / (lastSeason.won + lastSeason.lost) 
          : 0.5;
        const playoffRounds = lastSeason?.playoffRoundsWon || 0;
        
        score = (team.strength * 0.3) + 
                (lastSeasonWinPct * 100 * 0.3) + 
                (playoffRounds * 5) + 
                (winPct * 100 * 0.2);
      }
      return score;
    };

    const currentRankings = state.teams.map(team => {
      const games = teamGames.get(team.id) || [];
      const score = calculateScore(team, games);
      
      const l10Games = games.slice(0, 10);
      const l10Sequence = l10Games.map(g => {
        const isHome = g.homeTid === team.id;
        return (isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore) ? 'W' : 'L';
      }).reverse(); // chronological order for display: oldest on left, latest on right

      // Calculate differential from games
      let totalPtsFor = 0;
      let totalPtsAgainst = 0;
      games.forEach(g => {
        const isHome = g.homeTid === team.id;
        totalPtsFor += isHome ? g.homeScore : g.awayScore;
        totalPtsAgainst += isHome ? g.awayScore : g.homeScore;
      });
      const totalGames = games.length;
      const differential = totalGames > 0 ? ((totalPtsFor - totalPtsAgainst) / totalGames).toFixed(1) : '0.0';

      // Calculate streak from games
      let streakType: 'W' | 'L' | null = null;
      let streakCount = 0;
      for (const g of games) {
        const isHome = g.homeTid === team.id;
        const won = isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
        const currentType = won ? 'W' : 'L';
        if (streakType === null) {
          streakType = currentType;
          streakCount = 1;
        } else if (streakType === currentType) {
          streakCount++;
        } else {
          break;
        }
      }
      const streakStr = streakType ? `${streakType}${streakCount}` : '-';

      // Calculate average age of top 10 players
      const teamPlayers = state.players.filter(p => p.tid === team.id);
      const top10Players = [...teamPlayers]
        .sort((a, b) => b.overallRating - a.overallRating)
        .slice(0, 10);
      
      const avgAge = top10Players.length > 0
        ? (top10Players.reduce((sum, p) => {
            const playerAge = p.born?.year ? (state.leagueStats.year - p.born.year) : (p.age || 0);
            return sum + playerAge;
          }, 0) / top10Players.length).toFixed(1)
        : '-';

      return { team, score, l10Sequence, differential, streakStr, avgAge };
    }).sort((a, b) => b.score - a.score);

    // Preseason rankings — always calculated with 0 games (pure strength/last-season formula)
    const preseasonRankings = state.teams.map(team => {
      const score = calculateScore(team, []);
      return { team, score };
    }).sort((a, b) => b.score - a.score);

    // Calculate last week's rankings (as of the most recent Sunday)
    const currentDate = new Date(state.date);
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday
    const daysSinceSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
    const lastSunday = new Date(currentDate);
    lastSunday.setDate(currentDate.getDate() - daysSinceSunday);
    lastSunday.setHours(23, 59, 59, 999);

    const lastWeekRankings = state.teams.map(team => {
      const games = teamGames.get(team.id) || [];
      const lastWeekGames = games.filter(g => new Date(g.date) <= lastSunday);
      const score = calculateScore(team, lastWeekGames);
      return { team, score };
    }).sort((a, b) => b.score - a.score);

    return currentRankings.map((cr, index) => {
      const currentRank = index + 1;
      const lastWeekIndex = lastWeekRankings.findIndex(lwr => lwr.team.id === cr.team.id);
      const lastWeekRank = lastWeekIndex >= 0 ? lastWeekIndex + 1 : currentRank;
      const preseasonIndex = preseasonRankings.findIndex(pr => pr.team.id === cr.team.id);
      const preseasonRank = preseasonIndex >= 0 ? preseasonIndex + 1 : currentRank;
      const jumpVsLastWeek = lastWeekRank - currentRank;   // positive = rose vs last week
      const jumpVsPreseason = preseasonRank - currentRank; // positive = rose vs preseason

      return {
        ...cr,
        currentRank,
        lastWeekRank,
        preseasonRank,
        jumpVsLastWeek,
        jumpVsPreseason,
      };
    });
  }, [state.teams, state.players, state.schedule, state.leagueStats.year, state.date]);

  const totalGP = state.teams.reduce((sum, t) => sum + (t.wins ?? 0) + (t.losses ?? 0), 0);
  const seasonNotStarted = totalGP === 0;

  return (
    <div className="h-full flex flex-col bg-[#0f172a] text-slate-200 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-slate-800 shrink-0">
        <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight">Power Rankings</h2>
        <p className="text-slate-400 text-xs md:text-sm font-medium mt-1">
          {seasonNotStarted ? 'Preseason projections based on roster strength' : 'Updated weekly based on performance, strength, and momentum'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 md:p-6 custom-scrollbar">
        <div className="max-w-6xl mx-auto bg-slate-900/50 rounded-xl md:rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[650px] md:min-w-full">
              <thead className="bg-slate-950/80 text-[10px] md:text-xs uppercase tracking-widest text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3 md:px-6 py-3 md:py-4 font-bold text-center w-12 md:w-16">Rank</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 font-bold">Team</th>
                  {!seasonNotStarted && <th className="px-3 md:px-4 py-3 md:py-4 font-bold text-center w-14 md:w-18">Last Wk</th>}
                  {!seasonNotStarted && <th className="px-3 md:px-4 py-3 md:py-4 font-bold text-center w-10 md:w-14">▲▼</th>}
                  <th className="px-3 md:px-4 py-3 md:py-4 font-bold text-center w-14 md:w-18">Pre-S</th>
                  {!seasonNotStarted && <th className="px-3 md:px-4 py-3 md:py-4 font-bold text-center w-10 md:w-14">▲▼</th>}
                  {!seasonNotStarted && <th className="px-3 md:px-6 py-3 md:py-4 font-bold text-center w-16 md:w-20">Streak</th>}
                  {!seasonNotStarted && <th className="px-3 md:px-6 py-3 md:py-4 font-bold text-center w-16 md:w-20">Diff</th>}
                  <th className="hidden lg:table-cell px-4 md:px-6 py-4 font-bold text-center w-20">Avg Age</th>
                  {!seasonNotStarted && <th className="px-3 md:px-6 py-3 md:py-4 font-bold w-32 md:w-48">Last 10</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {rankings.map((row) => {
                  const isOwn = ownTid !== null && row.team.id === ownTid;
                  return (
                  <tr
                    key={row.team.id}
                    className={`transition-colors cursor-pointer group ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-800/30'}`}
                    onClick={() => navigateToTeam(row.team.id)}
                  >
                    <td className="px-3 md:px-6 py-3 md:py-4 text-center">
                      <span className="text-base md:text-lg font-black text-white">{row.currentRank}</span>
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4">
                      <div className="flex items-center gap-2 md:gap-4">
                        {row.team.logoUrl ? (
                          <img
                            src={row.team.logoUrl}
                            alt={row.team.name}
                            className="w-6 h-6 md:w-10 md:h-10 object-contain drop-shadow-md group-hover:scale-110 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-6 h-6 md:w-10 md:h-10 rounded-full bg-slate-800 flex items-center justify-center text-[8px] md:text-xs font-bold">
                            {row.team.abbrev}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-white text-xs md:text-base leading-tight truncate flex items-center gap-1.5">
                            <span className="truncate"><span className="hidden md:inline">{row.team.region} </span>{row.team.name}</span>
                            {isOwn && <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40 shrink-0">You</span>}
                          </div>
                          <div className="text-[9px] md:text-xs font-medium text-slate-500 uppercase tracking-wider">{row.team.wins}-{row.team.losses}</div>
                        </div>
                      </div>
                    </td>
                    {!seasonNotStarted && (
                    <td className="px-3 md:px-4 py-3 md:py-4 text-center">
                      <span className="text-slate-400 font-bold text-xs md:text-sm">{row.lastWeekRank}</span>
                    </td>
                    )}
                    {!seasonNotStarted && (
                    <td className="px-2 md:px-3 py-3 md:py-4 text-center">
                      <span className={`font-bold text-xs md:text-sm ${
                        row.jumpVsLastWeek > 0 ? 'text-emerald-400' : row.jumpVsLastWeek < 0 ? 'text-rose-400' : 'text-slate-600'
                      }`}>
                        {row.jumpVsLastWeek > 0 ? `+${row.jumpVsLastWeek}` : row.jumpVsLastWeek < 0 ? row.jumpVsLastWeek : '–'}
                      </span>
                    </td>
                    )}
                    <td className="px-3 md:px-4 py-3 md:py-4 text-center">
                      <span className="text-slate-500 font-bold text-xs md:text-sm">{row.preseasonRank}</span>
                    </td>
                    {!seasonNotStarted && (
                    <td className="px-2 md:px-3 py-3 md:py-4 text-center">
                      <span className={`font-bold text-xs md:text-sm ${
                        row.jumpVsPreseason > 0 ? 'text-emerald-400' : row.jumpVsPreseason < 0 ? 'text-rose-400' : 'text-slate-600'
                      }`}>
                        {row.jumpVsPreseason > 0 ? `+${row.jumpVsPreseason}` : row.jumpVsPreseason < 0 ? row.jumpVsPreseason : '–'}
                      </span>
                    </td>
                    )}
                    {!seasonNotStarted && (
                    <td className="px-3 md:px-6 py-3 md:py-4 text-center">
                      <span className={`font-bold text-xs md:text-sm ${
                        row.streakStr.startsWith('W') ? 'text-emerald-400' : row.streakStr.startsWith('L') ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {row.streakStr}
                      </span>
                    </td>
                    )}
                    {!seasonNotStarted && (
                    <td className="px-3 md:px-6 py-3 md:py-4 text-center">
                      <span className={`font-bold text-xs md:text-sm ${
                        parseFloat(row.differential) > 0 ? 'text-emerald-400' : parseFloat(row.differential) < 0 ? 'text-rose-400' : 'text-slate-400'
                      }`}>
                        {parseFloat(row.differential) > 0 ? '+' : ''}{row.differential}
                      </span>
                    </td>
                    )}
                    <td className="hidden lg:table-cell px-4 md:px-6 py-4 text-center">
                      <span className="text-slate-300 font-bold text-sm">{row.avgAge}</span>
                    </td>
                    {!seasonNotStarted && (
                    <td className="px-3 md:px-6 py-3 md:py-4">
                      <div className="flex items-center gap-0.5 md:gap-1">
                        {row.l10Sequence.length > 0 ? (
                          row.l10Sequence.map((result, i) => (
                            <div 
                              key={i}
                              className={`w-3 h-3 md:w-5 md:h-5 rounded-[2px] md:rounded flex items-center justify-center text-[6px] md:text-[10px] font-black ${
                                result === 'W' 
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {result}
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500 text-[9px] md:text-xs font-medium italic">No games</span>
                        )}
                      </div>
                    </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
