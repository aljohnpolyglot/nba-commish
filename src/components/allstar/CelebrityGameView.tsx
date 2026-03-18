import React from 'react';
import { Users, Trophy, Star } from 'lucide-react';
import { normalizeDate } from '../../utils/helpers';

interface CelebrityGameViewProps {
  allStar: any;
  state: any;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
}

export const CelebrityGameView: React.FC<CelebrityGameViewProps> = ({ allStar, state, onWatchGame, onViewBoxScore }) => {
  const isAutoSelected = state.leagueStats.celebrityRosterAutoSelected;
  const roster = allStar?.celebrityRoster || state.leagueStats.celebrityRoster || [];

  const game = state.schedule?.find((g: any) => g.gid === 90002);
  const boxScore = state.boxScores?.find((b: any) =>
    b.gameId === 90002 || (b.homeTeamId === -5 && b.awayTeamId === -6)
  );
  const gameResult = allStar?.celebrityGameResult || (boxScore ? {
    homeScore: boxScore.homeScore,
    awayScore: boxScore.awayScore,
    homeTeamName: boxScore.homeTeamName,
    awayTeamName: boxScore.awayTeamName,
    mvpName: [...(boxScore.homeStats || []), ...(boxScore.awayStats || [])]
      .sort((a: any, b: any) => b.pts - a.pts)[0]?.name || 'MVP'
  } : null);

  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game.played;

  if (!roster.length) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
          <Users size={32} className="text-slate-700" />
        </div>
        <h3 className="text-xl font-black text-white mb-2">Celebrity Game</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          The star-studded roster will be announced on Jan 29.
        </p>
      </div>
    );
  }

  const teamNames = allStar?.celebrityTeams || ['Team Shannon', 'Team Stephen A'];
  const team1 = roster.slice(0, 10);
  const team2 = roster.slice(10, 20);

  return (
    <div className="space-y-12">
      {gameResult ? (
        <div className="bg-gradient-to-br from-fuchsia-600/20 via-pink-600/10 to-purple-600/20 border border-fuchsia-500/20 rounded-3xl p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            <Trophy className="text-fuchsia-500/40" size={48} />
          </div>
          
          <div className="text-[10px] font-black text-fuchsia-400 uppercase tracking-[0.3em] mb-8">
            Ruffles Celebrity Game · Final
          </div>

          <div className="flex items-center justify-center gap-12 md:gap-24 mb-10">
            <div className="text-center">
              <div className={`text-6xl font-black mb-2 ${gameResult.homeScore > gameResult.awayScore ? 'text-white' : 'text-slate-600'}`}>
                {gameResult.homeScore}
              </div>
              <div className="text-xs font-bold text-fuchsia-300 uppercase tracking-widest">{gameResult.homeTeamName || teamNames[0]}</div>
            </div>
            <div className="text-3xl font-black text-slate-800 italic">VS</div>
            <div className="text-center">
              <div className={`text-6xl font-black mb-2 ${gameResult.awayScore > gameResult.homeScore ? 'text-white' : 'text-slate-600'}`}>
                {gameResult.awayScore}
              </div>
              <div className="text-xs font-bold text-pink-300 uppercase tracking-widest">{gameResult.awayTeamName || teamNames[1]}</div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="inline-flex flex-col items-center">
              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Game MVP</div>
              <div className="px-6 py-2 bg-white text-black rounded-full text-sm font-black uppercase tracking-tight shadow-xl shadow-white/10">
                {gameResult.mvpName}
              </div>
            </div>
            
            {game && (
              <button 
                onClick={() => onViewBoxScore?.(game)}
                className="px-8 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-fuchsia-500/20"
              >
                View Full Box Score
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-2 italic">
            Celebrity Game {state.leagueStats.year}
          </h3>
          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-12 bg-slate-800" />
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">
              Friday, Feb 13 · 7:00 PM ET
            </p>
            <span className="h-px w-12 bg-slate-800" />
          </div>

          {canWatch && (
            <button 
              onClick={() => onWatchGame?.(game)}
              className="mt-6 px-8 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto"
            >
              <Star size={18} className="fill-white" />
              Watch Live
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {[
          { label: teamNames[0], players: team1, color: 'from-fuchsia-600 to-purple-600', badge: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20' },
          { label: teamNames[1], players: team2, color: 'from-pink-600 to-rose-600', badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20' }
        ].map((team, idx) => (
          <div key={team.label} className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-lg font-black text-white uppercase tracking-tight italic">{team.label}</h4>
              <div className={`h-1 w-24 bg-gradient-to-r ${team.color} rounded-full opacity-50`} />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {team.players.map((name: string, i: number) => (
                <div key={name} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between hover:border-slate-700 transition-colors group">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{name}</span>
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Celebrity</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black border ${!isAutoSelected ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                    {!isAutoSelected ? "COMMISSIONER'S PICK" : "AUTO-SELECTED"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 text-center">
        <p className="text-[10px] text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
          The Ruffles NBA All-Star Celebrity Game features stars from film, TV, music and sports. 
          Rosters are composed of {isAutoSelected ? 'auto-selected fan favorites' : 'hand-picked selections'} and special commissioner invites.
        </p>
      </div>
    </div>
  );
};
