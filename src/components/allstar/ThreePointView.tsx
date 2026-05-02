import React from 'react';
import { Star, Trophy } from 'lucide-react';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { useGame } from '../../store/GameContext';
import { getPlayerHeadshot, getTeamLogo, extractTeamId, extractNbaId } from '../../utils/helpers';
import { NBAPlayer } from '../../types';
import { calcThreePointOdds } from '../../utils/allStarOdds';

function getShooterStats(player: NBAPlayer, currentSeason: number) {
  // Get current season stats
  const seasonStats = player.stats?.find(s => s.season === currentSeason && !s.playoffs);
  // Fall back to latest available
  const latest = seasonStats ?? player.stats?.[player.stats.length - 1];

  if (!latest) return null;

  const gp    = latest.gp   ?? 0;
  const tpm   = latest.tp   ?? 0;   // 3PM total
  const tpa   = latest.tpa  ?? 0;   // 3PA total
  const tpp   = latest.tpp  ?? 0;   // 3P% (0-1 scale in BBGM, multiply by 100)
  const ppg   = gp > 0 ? (latest.pts ?? 0) / gp : 0;
  const tpmPg = gp > 0 ? tpm / gp : 0;
  const tpaPg = gp > 0 ? tpa / gp : 0;

  return {
    ppg:    ppg.toFixed(1),
    tpmPg:  tpmPg.toFixed(1),
    tpaPg:  tpaPg.toFixed(1),
    tpp:    tpp.toFixed(1) + '%',   // convert to percentage display
    gp,
  };
}

interface ThreePointViewProps {
  allStar: any;
  players: any[];
  ownTid?: number | null;
}

export const ThreePointView: React.FC<ThreePointViewProps> = ({ allStar, players, ownTid }) => {
  const { state } = useGame();
  const teams = state.teams;
  const currentYear = state.leagueStats.year;

  const isAnnounced = allStar.threePointContestants && allStar.threePointContestants.length > 0;
  const isComplete  = !!allStar.threePointContest;

  if (!isAnnounced) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
          <Star size={32} className="text-slate-700" />
        </div>
        <h3 className="text-xl font-black text-white mb-2">3-Point Contest</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          The participants for the 3-Point Contest will be announced on Feb 8.
        </p>
      </div>
    );
  }

  if (!isComplete) {
    const contestants = allStar.threePointContestants;
    
    return (
      <div>
        <div className="text-center mb-12">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
            3-Point Contest
          </h3>
          <p className="text-slate-400 text-sm">
            Saturday, Feb 14 · {contestants.length} contestants · Crypto.com Arena
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {contestants.map((c: any) => {
            const p = players.find(pl => pl.internalId === (c.internalId || c.playerId)) || c;
            const team = teams.find(t => t.id === p.tid);
            const teamId = p.teamNbaId || (team ? extractTeamId(team.logoUrl, team.abbrev) : null) || 1610612737;
            const teamColor = team?.colors?.[0] || '#6366f1';
            const nbaId = p.nbaId || extractNbaId(p.imgURL || "", p.name);
            const isOwn = ownTid !== null && ownTid !== undefined && p?.tid === ownTid;

            const stats = getShooterStats(p, currentYear);
            const contestOdds = calcThreePointOdds(contestants.map((c: any) => players.find(pl => pl.internalId === (c.internalId || c.playerId)) || c), p);

            return (
              <div key={p.internalId} className={`rounded-xl p-4 flex flex-col items-center gap-2 transition-colors shadow-xl border ${
                isOwn
                  ? 'bg-indigo-500/10 border-indigo-500/40'
                  : 'bg-[#0d1117] border-slate-800 hover:border-slate-700'
              }`}>
                <div className="relative mx-auto mb-2 w-20 h-20">
                  <div 
                    className="w-20 h-20 rounded-full overflow-hidden bg-slate-800 border-2"
                    style={{ borderColor: `${teamColor}40` }}
                  >
                    <img 
                      src={getPlayerHeadshot(p.playerId || p.internalId, nbaId)}
                      className="w-full h-full object-cover"
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${p.playerId || p.internalId}/100/100`;
                      }}
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1 border border-slate-800">
                    <img 
                      src={getTeamLogo(teamId)}
                      className="w-5 h-5 object-contain"
                      alt="team"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                <div className="flex flex-col items-center my-1">
                  <div className="text-[9px] font-bold tracking-[0.2em] text-slate-500 mb-0.5">TO WIN</div>
                  <div className={`text-3xl font-black font-mono tracking-tight ${contestOdds.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {contestOdds}
                  </div>
                </div>

                <div className="text-sm font-bold text-white mb-0.5">
                  <PlayerNameWithHover player={p}>{p.name}</PlayerNameWithHover>
                </div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                    <span className="text-[8px] font-black text-slate-500 uppercase">{p.pos}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">
                    {team?.abbrev || 'NBA'}
                  </span>
                </div>

                {stats && (
                  <div className="flex items-center w-full bg-[#0a0f1a] border border-slate-800 rounded-lg overflow-hidden mt-1">
                    <div className="flex-1 flex flex-col items-center py-2 px-1">
                      <div className="text-sm font-bold font-mono text-slate-200">{stats.ppg}</div>
                      <div className="text-[9px] font-bold tracking-[0.15em] text-slate-500 mt-0.5">PPG</div>
                    </div>
                    <div className="w-px h-8 bg-slate-800" />
                    <div className="flex-1 flex flex-col items-center py-2 px-1">
                      <div className="text-sm font-bold font-mono text-slate-200">{stats.tpmPg}</div>
                      <div className="text-[9px] font-bold tracking-[0.15em] text-slate-500 mt-0.5">3PM</div>
                    </div>
                    <div className="w-px h-8 bg-slate-800" />
                    <div className="flex-1 flex flex-col items-center py-2 px-1">
                      <div className="text-sm font-bold font-mono text-slate-200">{stats.tpaPg}</div>
                      <div className="text-[9px] font-bold tracking-[0.15em] text-slate-500 mt-0.5">3PA</div>
                    </div>
                    <div className="w-px h-8 bg-slate-800" />
                    <div className="flex-1 flex flex-col items-center py-2 px-1">
                      <div className="text-sm font-bold font-mono text-slate-200">{stats.tpp}</div>
                      <div className="text-[9px] font-bold tracking-[0.15em] text-slate-500 mt-0.5">3P%</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const { contestants, winnerName, winnerId } = allStar.threePointContest;
  const winnerPlayer = players.find((p: any) => p.internalId === winnerId)
    || players.find((p: any) => p.name === winnerName);
  const winnerTeam = winnerPlayer ? teams.find(t => t.id === winnerPlayer.tid) : null;
  const winnerNbaId = winnerPlayer?.nbaId || extractNbaId(winnerPlayer?.imgURL || '', winnerName);

  return (
    <div>
      {/* Champion Hero */}
      <div className="relative bg-gradient-to-br from-indigo-900/60 via-violet-900/40 to-indigo-900/60 border border-indigo-500/30 rounded-3xl overflow-hidden mb-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_60%)] pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center gap-6 p-8">
          {/* Headshot */}
          <div className="relative shrink-0">
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-400 shadow-[0_0_40px_rgba(99,102,241,0.4)]">
              <img
                src={getPlayerHeadshot(winnerPlayer?.internalId || winnerId, winnerNbaId)}
                alt={winnerName}
                className="w-full h-full object-cover object-top"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(winnerName?.split(' ').map((n: string) => n[0]).join('') || 'C')}&background=4f46e5&color=fff&size=224`;
                }}
              />
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-black px-3 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
              <Trophy size={8} /> CHAMPION
            </div>
          </div>

          {/* Info */}
          <div className="text-center sm:text-left">
            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] mb-1">
              {currentYear} Three-Point Contest Champion
            </div>
            <h2 className="text-4xl font-black italic tracking-tighter text-white mb-1">
              {winnerPlayer
                ? <PlayerNameWithHover player={winnerPlayer}>{winnerName}</PlayerNameWithHover>
                : winnerName}
            </h2>
            {winnerTeam && (
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <img src={getTeamLogo(winnerPlayer?.teamNbaId || (winnerTeam ? extractTeamId(winnerTeam.logoUrl, winnerTeam.abbrev) : null) || 1610612737)} className="w-5 h-5 object-contain" referrerPolicy="no-referrer" alt="" />
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{winnerTeam.abbrev}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 grid grid-cols-4 text-xs font-black text-slate-500 uppercase tracking-widest">
          <span className="col-span-2">Sharpshooter</span>
          <span className="text-right">Round 1</span>
          <span className="text-right">Finals</span>
        </div>
        <div className="divide-y divide-slate-800">
          {contestants
            .sort((a: any, b: any) => (b.finalScore ?? -1) - (a.finalScore ?? -1))
            .map((c: any) => {
              const player = players.find(p => p.internalId === c.playerId);
              const team = teams.find(t => t.id === player?.tid);
              const teamId = c.teamNbaId || (team ? extractTeamId(team.logoUrl, team?.abbrev) : null) || 1610612737;
              const teamColor = team?.colors?.[0] || '#6366f1';
              const nbaId = c.nbaId || (player ? extractNbaId(player.imgURL || "", c.playerName) : null);

              return (
                <div key={c.playerId} className={`grid grid-cols-4 px-6 py-4 transition-colors text-sm items-center ${c.isWinner ? 'bg-indigo-500/5' : ''}`}>
                  <div className="col-span-2 flex items-center gap-4">
                    <div className="relative shrink-0">
                      <div 
                        className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border-2"
                        style={{ borderColor: `${teamColor}40` }}
                      >
                        <img 
                          src={getPlayerHeadshot(c.playerId, nbaId)}
                          className="w-full h-full object-cover"
                          alt={c.playerName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${c.playerId}/100/100`;
                          }}
                        />
                      </div>
                      {c.isWinner && (
                        <div className="absolute -top-1 -right-1 bg-indigo-500 rounded-full p-0.5 shadow-lg">
                          <Star size={8} className="text-white fill-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        {player
                          ? <PlayerNameWithHover player={player} className="text-slate-200 font-bold">{c.playerName}</PlayerNameWithHover>
                          : <span className="text-slate-200 font-bold">{c.playerName}</span>}
                        <img 
                          src={getTeamLogo(teamId)}
                          className="w-4 h-4 object-contain"
                          alt="team"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono uppercase">
                        {team?.abbrev || 'NBA'}
                      </span>
                    </div>
                  </div>
                  <span className="text-right text-slate-400 font-mono font-bold">
                    {c.round1Score}
                  </span>
                  <span className={`text-right font-mono font-black text-lg ${c.finalScore ? 'text-white' : 'text-slate-700'}`}>
                    {c.finalScore ?? '—'}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
      
      <div className="mt-6 flex items-center justify-between px-2">
        <div className="text-[10px] text-slate-500 font-medium">
          Max score: 30 pts · Money ball = 2 pts
        </div>
        {allStar.threePointContest.log && (
          <button className="text-[10px] text-indigo-400 font-bold hover:underline uppercase tracking-widest">
            View Full Log
          </button>
        )}
      </div>
    </div>
  );
};
