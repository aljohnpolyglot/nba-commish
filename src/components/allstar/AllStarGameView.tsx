import React from 'react';
import { Star, Trophy, Zap } from 'lucide-react';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { normalizeDate, getPlayerHeadshot, getTeamLogo, extractTeamId, extractNbaId } from '../../utils/helpers';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';

interface AllStarGameViewProps {
  allStar: any;
  state: any;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
}

export const AllStarGameView: React.FC<AllStarGameViewProps> = ({ allStar, state, onWatchGame, onViewBoxScore }) => {
  const boxScore = state.boxScores?.find((b: any) => b.gameId === allStar?.allStarGameId || (b.homeTeamId === -1 && b.awayTeamId === -2));
  const game = state.schedule?.find((g: any) => g.gid === allStar?.allStarGameId);
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const isCaptainsDraft = state.leagueStats?.allStarFormat === 'captains_draft';
  const allTeams = React.useMemo(
    () => [
      ...(state.teams ?? []),
      ...((state.nonNBATeams ?? []).map((team: any) => ({ ...team, id: team.tid ?? team.id, logoUrl: team.logoUrl ?? team.imgURL }))),
    ],
    [state.nonNBATeams, state.teams],
  );
  const playerById = React.useMemo(
    () => new Map<string, any>((state.players ?? []).map((player: any) => [player.internalId, player])),
    [state.players],
  );
  const getBucketLabel = React.useCallback((bucket: string) => {
    if (isCaptainsDraft) {
      const captain = allStar?.roster?.find((entry: any) => entry.conference === bucket && entry.isCaptain);
      if (captain?.playerName) {
        const parts = String(captain.playerName).trim().split(/\s+/);
        return `Team ${parts[parts.length - 1]}`;
      }
      return bucket === 'East' ? (isPba ? 'Team A' : 'East All-Stars') : (isPba ? 'Team B' : 'West All-Stars');
    }
    if (bucket === 'East') return isPba ? 'Team A' : 'Eastern Conference';
    if (bucket === 'West') return isPba ? 'Team B' : 'Western Conference';
    return bucket;
  }, [allStar?.roster, isCaptainsDraft, isPba]);
  const getEntryTeam = React.useCallback((entry: any) => {
    const player = playerById.get(entry?.playerId);
    return allTeams.find((team: any) => team.abbrev === entry?.teamAbbrev)
      ?? allTeams.find((team: any) => Number(team.id ?? team.tid) === Number(player?.tid));
  }, [allTeams, playerById]);
  const getTeamLogoFor = React.useCallback((team: any, fallbackTeamId?: number | string | null) => {
    const resolved = getResolvedTeamLogoUrl(team);
    if (resolved) return resolved;
    const numericTeamId = Number(fallbackTeamId);
    if (Number.isFinite(numericTeamId) && numericTeamId > 0) return getTeamLogo(numericTeamId);
    return team?.logoUrl ?? team?.imgURL ?? '';
  }, []);
  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game.played;
  const formatLabel = game?.gameFormat === 'target_score'
    ? `First to ${game.targetScore ?? state.leagueStats?.allStarGameTargetScore ?? 40}`
    : game?.gameFormat === 'elam_ending'
      ? `Elam Ending · +${state.leagueStats?.allStarOvertimeTargetPoints ?? 24}`
      : 'Timed Game';

  if (!boxScore) {
    const buckets = Array.from(new Set((allStar?.roster ?? []).map((p: any) => p.conference).filter(Boolean)));
    const order = ['East', 'West', 'USA1', 'USA2', 'WORLD', 'WORLD1', 'WORLD2'];
    buckets.sort((a: any, b: any) => order.indexOf(a) - order.indexOf(b));
    const groups = buckets.map((bucket: any, index: number) => ({
      label: getBucketLabel(bucket),
      players: allStar?.roster?.filter((p: any) => p.conference === bucket) ?? [],
      color: index === 0 ? 'text-blue-400' : 'text-red-400',
    }));

    return (
      <div>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
            {isPba ? 'PBA All-Star Game' : 'The 75th All-Star Game'}
          </h3>
          <p className="text-slate-400 text-sm">
            Sunday, Feb 15 · {formatLabel}
          </p>
          
          {canWatch && (
            <button 
              onClick={() => onWatchGame?.(game)}
              className="mt-6 px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto"
            >
              <Star size={18} className="fill-white" />
              Watch Live
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {groups.map(conf => (
            <div key={conf.label} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                <span className={`text-xs font-black uppercase tracking-widest ${conf.color}`}>
                  {conf.label}
                </span>
                <span className="text-[10px] text-slate-500 font-bold">
                  {conf.players.length} Players
                </span>
              </div>
              <div className="divide-y divide-slate-800/50">
                {conf.players.map((p: any) => {
                  const team = getEntryTeam(p);
                  const teamId = p.teamNbaId || (team ? extractTeamId(team.logoUrl ?? team.imgURL ?? '', p.teamAbbrev) : null) || 1610612737;
                  const teamColor = team?.colors?.[0] || '#64748b';
                  const fullPlayer = playerById.get(p.playerId);
                  const teamLogo = getTeamLogoFor(team, teamId);

                  return (
                    <div key={p.playerId} className="px-6 py-3 flex items-center justify-between hover:bg-slate-800/20 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          <div
                            className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border-2"
                            style={{ borderColor: `${teamColor}40` }}
                          >
                            <img
                              src={getPlayerHeadshot(p.playerId, p.nbaId)}
                              className="w-full h-full object-cover"
                              alt={p.playerName}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${p.playerId}/100/100`;
                              }}
                            />
                          </div>
                          {p.isStarter && (
                            <div className="absolute -top-1 -right-1 bg-amber-400 rounded-full p-0.5 shadow-lg">
                              <Star size={8} className="text-slate-900 fill-slate-900" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-200 font-bold">
                              {fullPlayer
                                ? <PlayerNameWithHover player={fullPlayer}>{p.playerName}</PlayerNameWithHover>
                                : p.playerName}
                            </span>
                            {teamLogo && (
                              <img
                                src={teamLogo}
                                className="w-4 h-4 object-contain"
                                alt={p.teamAbbrev}
                                referrerPolicy="no-referrer"
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{p.teamAbbrev}</span>
                        </div>
                      </div>
                      <div className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                        <span className="text-[9px] font-black text-slate-400 uppercase">
                          {p.position}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const topScorers = [...boxScore.homeStats, ...boxScore.awayStats]
    .sort((a, b) => b.pts - a.pts || b.reb - a.reb || b.ast - a.ast)
    .slice(0, 10);

  const mvpPlayer = topScorers[0] ? state.players?.find((pl: any) => pl.internalId === topScorers[0].playerId) : null;
  const isHomeWinner = boxScore.homeScore > boxScore.awayScore;
  const homeBucket = game?.homeTid === -1 ? 'East' : 'West';
  const awayBucket = game?.awayTid === -2 ? 'West' : 'East';
  const homeLabel = boxScore.homeTeamName ?? getBucketLabel(homeBucket);
  const awayLabel = boxScore.awayTeamName ?? getBucketLabel(awayBucket);

  return (
    <div>
      <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 mb-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-red-500/5 pointer-events-none" />
        
        <div className="flex items-center justify-center gap-12 mb-6">
          <div className="text-center">
            <div className={`text-5xl font-black mb-2 ${isHomeWinner ? 'text-white' : 'text-slate-500'}`}>
              {boxScore.homeScore}
            </div>
            <div className="text-[10px] text-blue-400 font-black uppercase tracking-widest">
              {homeLabel}
            </div>
          </div>
          <div className="text-2xl font-black text-slate-700">VS</div>
          <div className="text-center">
            <div className={`text-5xl font-black mb-2 ${!isHomeWinner ? 'text-white' : 'text-slate-500'}`}>
              {boxScore.awayScore}
            </div>
            <div className="text-[10px] text-red-400 font-black uppercase tracking-widest">
              {awayLabel}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-center gap-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-800 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <Trophy size={12} className="text-amber-400" />
            Final Score
          </div>

          {topScorers[0] && (
            <div className="flex flex-col items-center gap-1">
              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Game MVP</div>
              <div className="px-6 py-2 bg-white text-black rounded-full text-sm font-black uppercase tracking-tight shadow-xl shadow-white/10">
                {mvpPlayer
                  ? <PlayerNameWithHover player={mvpPlayer}>{topScorers[0].name}</PlayerNameWithHover>
                  : topScorers[0].name}
              </div>
            </div>
          )}

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

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Top Performers
          </span>
          <Zap size={14} className="text-amber-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-3">Player</th>
                <th className="px-6 py-3 text-right">PTS</th>
                <th className="px-6 py-3 text-right">REB</th>
                <th className="px-6 py-3 text-right">AST</th>
                <th className="px-6 py-3 text-right">FG%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {topScorers.map((p: any, i: number) => {
                const team = allTeams.find((t: any) => Number(t.id ?? t.tid) === Number(p.tid));
                const teamId = team ? extractTeamId(team.logoUrl ?? team.imgURL ?? '', team.abbrev) : null;
                const teamColor = team?.colors?.[0] || '#64748b';
                const player = state.players?.find((pl: any) => pl.internalId === p.playerId);
                const nbaId = player ? extractNbaId(player.imgURL || "", p.name) : null;
                const teamLogo = getTeamLogoFor(team, teamId);

                return (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border-2 shrink-0"
                          style={{ borderColor: `${teamColor}40` }}
                        >
                          <img 
                            src={getPlayerHeadshot(p.playerId, nbaId)}
                            className="w-full h-full object-cover"
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${p.playerId}/100/100`;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-bold text-slate-200 truncate">
                            {player
                              ? <PlayerNameWithHover player={player}>{p.name}</PlayerNameWithHover>
                              : p.name}
                          </div>
                            {teamLogo && (
                              <img 
                                src={teamLogo}
                                className="w-4 h-4 object-contain"
                                alt="team"
                                referrerPolicy="no-referrer"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                              <span className="text-[8px] font-black text-slate-500 uppercase">{p.pos}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-bold uppercase">{team?.abbrev || (isPba ? 'PBA' : 'NBA')}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-black text-white">{p.pts}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-400">{p.reb}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-400">{p.ast}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-500">
                      {p.fga > 0 ? ((p.fgm / p.fga) * 100).toFixed(0) : 0}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
