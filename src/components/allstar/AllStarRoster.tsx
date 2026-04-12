import React from 'react';
import { Star, Trophy, Zap } from 'lucide-react';
import { normalizeDate, getPlayerHeadshot, getTeamLogo, extractTeamId, convertTo2KRating } from '../../utils/helpers';

interface AllStarRosterProps {
  allStar: any;
  state: any;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
}

export const AllStarRoster: React.FC<AllStarRosterProps> = ({ allStar, state, onWatchGame, onViewBoxScore }) => {
  const teams = state.teams;
  
  const gameId = allStar?.allStarGameId;
  const game = state.schedule?.find((g: any) => g.gid === gameId);
  const boxScore = state.boxScores?.find((r: any) => r.gameId === gameId || (r.homeTeamId === -1 && r.awayTeamId === -2));

  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game.played;

  if (!allStar?.startersAnnounced) {
    return (
      <div className="text-center py-12 text-slate-500">
        Starters announced Jan 22.
      </div>
    );
  }

  const ConfRoster = ({ players, logo, label }: { players: any[], logo: string, label: string }) => {
    const starters = players.filter(p => p.isStarter);
    const reserves = players.filter(p => !p.isStarter);
    const startersFrontcourt = starters.filter(p => p.category === 'Frontcourt');
    const startersGuards = starters.filter(p => p.category === 'Guard');

    const PlayerRow = ({ p, key }: { p: any, key?: any }) => {
      const team = teams.find(t => t.abbrev === p.teamAbbrev);
      const teamId = p.teamNbaId || (team ? extractTeamId(team.logoUrl, p.teamAbbrev) : null) || 1610612737;
      const teamColor = team?.colors?.[0] || '#64748b';
      const fullPlayer = state.players?.find((pl: any) => pl.internalId === p.playerId);
      const rating = convertTo2KRating(fullPlayer?.overallRating || p.ovr || 60, fullPlayer?.ratings?.[fullPlayer.ratings.length - 1]?.hgt ?? 50, fullPlayer?.ratings?.[fullPlayer.ratings.length - 1]?.tp);
      const pastAllStars = fullPlayer?.awards?.filter((a: any) => a.type === 'All-Star').length ?? 0;
      const allStarCount = pastAllStars + 1; // +1 for this season

      return (
        <div
          key={p.playerId}
          className={`flex items-center gap-3 px-4 py-3 border-b border-slate-800 last:border-0 transition-colors ${
            p.isStarter
              ? 'bg-slate-900 border-l-2 border-l-amber-400/50'
              : 'bg-slate-900/40'
          }`}
        >
          <div className="relative shrink-0">
            <div
              className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border-2"
              style={{ borderColor: `${teamColor}40` }}
            >
              <img
                src={fullPlayer?.imgURL || getPlayerHeadshot(p.playerId, p.nbaId)}
                className="w-full h-full object-cover"
                alt={p.playerName}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!img.dataset.triedCdn) {
                    img.dataset.triedCdn = '1';
                    img.src = getPlayerHeadshot(p.playerId, p.nbaId);
                  } else {
                    img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.playerName)}&background=1e293b&color=94a3b8&size=100`;
                  }
                }}
              />
            </div>
            {p.isStarter && (
              <div className="absolute -top-1 -right-1 bg-amber-400 rounded-full p-0.5 shadow-lg">
                <Star size={8} className="text-slate-900 fill-slate-900" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white truncate">
                {p.playerName}
              </span>
              <img
                src={getTeamLogo(teamId)}
                className="w-5 h-5 object-contain shrink-0"
                alt={p.teamAbbrev}
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="text-[9px] font-black text-amber-400/70 uppercase tracking-wider">
              {allStarCount}× All-Star
            </span>
          </div>

          <div className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
            <span className="text-[10px] font-black text-slate-400 uppercase">
              {p.position}
            </span>
          </div>

          <div className="ml-2 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
            <span className={`text-[10px] font-black ${rating >= 90 ? 'text-amber-400' : rating >= 80 ? 'text-emerald-400' : 'text-indigo-400'}`}>
              {rating}
            </span>
          </div>
        </div>
      );
    };

    return (
      <div>
        <div className="flex items-center gap-4 mb-4">
          <img src={logo} className="w-6 h-6 object-contain" alt={label}/>
          <div className="flex items-center gap-3 flex-1">
            <h3 className="text-sm font-black text-white uppercase tracking-wider whitespace-nowrap">
              {label} · {players.length}
            </h3>
            <div className="h-px bg-slate-800 flex-1" />
          </div>
        </div>
        <div className="bg-slate-900/20 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          {/* Starters */}
          <div className="px-4 py-1.5 bg-slate-800/30 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
            Starters
          </div>
          {starters.map((p) => <PlayerRow key={p.playerId} p={p} />)}

          {/* Reserves */}
          {reserves.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-slate-800/30 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                Reserves
              </div>
              {reserves.map((p) => <PlayerRow key={p.playerId} p={p} />)}
            </>
          )}
        </div>
      </div>
    );
  };

  const east = allStar.roster.filter((p: any) => p.conference === 'East');
  const west = allStar.roster.filter((p: any) => p.conference === 'West');

  return (
    <div className="space-y-8">
      {boxScore ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6">
            Sunday Night · Final Score
          </div>
          <div className="flex items-center justify-center gap-12 md:gap-24 mb-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                <img src="https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748" className="w-8 h-8 object-contain" alt="East" />
              </div>
              <div className={`text-5xl font-black mb-1 ${boxScore.homeScore > boxScore.awayScore ? 'text-white' : 'text-slate-600'}`}>
                {boxScore.homeScore}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">East All-Stars</div>
            </div>
            <div className="text-4xl font-black text-slate-800">VS</div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
                <img src="https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726" className="w-8 h-8 object-contain" alt="West" />
              </div>
              <div className={`text-5xl font-black mb-1 ${boxScore.awayScore > boxScore.homeScore ? 'text-white' : 'text-slate-600'}`}>
                {boxScore.awayScore}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">West All-Stars</div>
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-800 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <Trophy size={12} className="text-amber-400" />
              Final Score
            </div>
            
            {game && (
              <button 
                onClick={() => onViewBoxScore?.(game)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all"
              >
                View Box Score
              </button>
            )}
          </div>
        </div>
      ) : (
        canWatch && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
              All-Star Game
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              The main event · East vs West
            </p>
            <button 
              onClick={() => onWatchGame?.(game)}
              className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto"
            >
              <Zap size={18} className="fill-white" />
              Watch Live
            </button>
          </div>
        )
      )}

      {!allStar.reservesAnnounced && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 text-xs text-amber-400">
          ★ = Fan vote starter · Reserves announced Jan 29
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <ConfRoster
          players={east}
          logo="https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748"
          label="Eastern Conference"
        />
        <ConfRoster
          players={west}
          logo="https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726"
          label="Western Conference"
        />
      </div>

      {/* Injury Replacements */}
      {(() => {
        const replacements = allStar.roster.filter((p: any) => p.isInjuryReplacement);
        const dnps = allStar.roster.filter((p: any) => p.isInjuredDNP);
        if (replacements.length === 0 && dnps.length === 0) return null;
        return (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-3 flex-1">
                <h3 className="text-sm font-black text-white uppercase tracking-wider whitespace-nowrap flex items-center gap-2">
                  <span className="text-rose-400">⚡</span> Injury Replacements
                </h3>
                <div className="h-px bg-slate-800 flex-1" />
              </div>
            </div>
            <div className="bg-slate-900/20 rounded-xl border border-slate-800 overflow-hidden">
              {dnps.map((p: any) => {
                const replacement = replacements.find((r: any) => r.injuredPlayerId === p.playerId);
                return (
                  <div key={p.playerId} className="flex items-center gap-4 px-4 py-3 border-b border-slate-800 last:border-0">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 opacity-50">
                        <img src={state.players?.find((pl: any) => pl.internalId === p.playerId)?.imgURL || `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nbaId || p.playerId}.png`} className="w-full h-full object-cover" alt={p.playerName} referrerPolicy="no-referrer" onError={(e) => { const img = e.target as HTMLImageElement; if (!img.dataset.triedCdn) { img.dataset.triedCdn = '1'; img.src = `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nbaId || p.playerId}.png`; } else { img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.playerName)}&background=1e293b&color=94a3b8&size=100`; } }} />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-500 line-through">{p.playerName}</span>
                        <span className="ml-2 text-[8px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">DNP · INJURY</span>
                      </div>
                    </div>
                    {replacement && (
                      <>
                        <span className="text-slate-700 text-xs">→</span>
                        <div className="flex items-center gap-2 flex-1">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800">
                            <img src={state.players?.find((pl: any) => pl.internalId === replacement.playerId)?.imgURL || `https://cdn.nba.com/headshots/nba/latest/1040x760/${replacement.nbaId || replacement.playerId}.png`} className="w-full h-full object-cover" alt={replacement.playerName} referrerPolicy="no-referrer" onError={(e) => { const img = e.target as HTMLImageElement; if (!img.dataset.triedCdn) { img.dataset.triedCdn = '1'; img.src = `https://cdn.nba.com/headshots/nba/latest/1040x760/${replacement.nbaId || replacement.playerId}.png`; } else { img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(replacement.playerName)}&background=1e293b&color=94a3b8&size=100`; } }} />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-white">{replacement.playerName}</span>
                            <span className="ml-2 text-[8px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.5 rounded">REPLACEMENT</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {replacements.filter((r: any) => !dnps.find((d: any) => d.playerId === r.injuredPlayerId)).map((r: any) => (
                <div key={r.playerId} className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 last:border-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800">
                    <img src={state.players?.find((pl: any) => pl.internalId === r.playerId)?.imgURL || `https://cdn.nba.com/headshots/nba/latest/1040x760/${r.nbaId || r.playerId}.png`} className="w-full h-full object-cover" alt={r.playerName} referrerPolicy="no-referrer" onError={(e) => { const img = e.target as HTMLImageElement; if (!img.dataset.triedCdn) { img.dataset.triedCdn = '1'; img.src = `https://cdn.nba.com/headshots/nba/latest/1040x760/${r.nbaId || r.playerId}.png`; } else { img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(r.playerName)}&background=1e293b&color=94a3b8&size=100`; } }} />
                  </div>
                  <span className="text-sm font-bold text-white">{r.playerName}</span>
                  <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.5 rounded">REPLACEMENT</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
