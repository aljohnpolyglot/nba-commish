import React from 'react';
import { Zap } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate, getPlayerHeadshot, getTeamLogo, extractTeamId, extractNbaId, convertTo2KRating } from '../../utils/helpers';

interface RisingStarsViewProps {
  allStar: any;
  ownTid?: number | null;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
}

export const RisingStarsView: React.FC<RisingStarsViewProps> = ({ allStar, ownTid, onWatchGame, onViewBoxScore }) => {
  const { state } = useGame();
  const bracket = allStar?.risingStarsBracket;
  const rsFormat = state.leagueStats?.risingStarsFormat ?? '4team_tournament';
  const isTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team' || !!bracket?.teams?.length;
  const gameId = allStar?.risingStarsGameId;
  const game = state.schedule?.find((g: any) => g.gid === gameId);
  const boxScore = state.boxScores?.find((r: any) => r.gameId === gameId || (r.homeTeamId === -3 && r.awayTeamId === -4));
  const roster = allStar?.risingStarsRoster || [];

  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game.played;

  if (!isTournament && !roster.length) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
          <Zap size={32} className="text-slate-700" />
        </div>
        <h3 className="text-xl font-black text-white mb-2">Rising Stars</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          The best rookies and sophomores will be selected on Jan 29.
        </p>
      </div>
    );
  }

  const rookies = roster.filter((p: any) => p.isRookie);
  const sophomores = roster.filter((p: any) => !p.isRookie);

  const PlayerCard = ({ p, key }: { p: any, key?: any }) => {
    const team = state.teams?.find(t => t.abbrev === p.teamAbbrev);
    const teamId = p.teamNbaId || (team ? extractTeamId(team.logoUrl, p.teamAbbrev) : null) || 1610612737;
    const teamColor = team?.colors?.[0] || '#64748b';
    const fullPlayer = state.players?.find((pl: any) => pl.internalId === p.playerId);
    const rating = convertTo2KRating(fullPlayer?.overallRating || p.ovr || 60, fullPlayer?.ratings?.[fullPlayer.ratings.length - 1]?.hgt ?? 50, fullPlayer?.ratings?.[fullPlayer.ratings.length - 1]?.tp);

    const nbaId = p.nbaId || extractNbaId(p.imgURL || "", p.playerName);
    const isOwn = ownTid !== null && ownTid !== undefined && fullPlayer?.tid === ownTid;

    return (
      <div
        key={p.playerId}
        className={`border rounded-xl p-3 flex items-center gap-3 border-l-4 shadow-lg transition-transform hover:scale-[1.02] ${
          isOwn
            ? 'bg-indigo-500/10 border-indigo-500/60'
            : 'bg-slate-900 border-slate-800'
        }`}
        style={{ borderLeftColor: isOwn ? '#6366f1' : teamColor }}
      >
        <div className="relative shrink-0">
          <div 
            className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border-2"
            style={{ borderColor: `${teamColor}40` }}
          >
            <img 
              src={getPlayerHeadshot(p.playerId, nbaId)}
              className="w-full h-full object-cover"
              alt={p.playerName}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${p.playerId}/100/100`;
              }}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-bold text-white truncate">{p.playerName}</span>
            <img 
              src={getTeamLogo(teamId)}
              className="w-4 h-4 object-contain shrink-0"
              alt={p.teamAbbrev}
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{p.teamAbbrev}</span>
            <div className="ml-auto px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-1">
              <span className="text-[8px] font-black text-slate-500 uppercase">{p.position || 'G'}</span>
              <span className={`text-[10px] font-black ${rating >= 90 ? 'text-amber-400' : rating >= 80 ? 'text-emerald-400' : 'text-indigo-400'}`}>{rating}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const homeTeamName = allStar?.risingStarsTeams?.[0] || boxScore?.homeTeamName || 'Team 1';
  const awayTeamName = allStar?.risingStarsTeams?.[1] || boxScore?.awayTeamName || 'Team 2';

  // Conference logos — matches the WatchGamePreviewModal / AllStarWeekendOrchestrator
  const HOME_LOGO = 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Eastern_Conference_%28NBA%29_logo.svg/200px-Eastern_Conference_%28NBA%29_logo.svg.png';
  const AWAY_LOGO = 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Western_Conference_%28NBA%29_logo.svg/200px-Western_Conference_%28NBA%29_logo.svg.png';

  // ── Tournament path: 4-team bracket (3 NBA + 1 G League) ─────────────────
  if (isTournament) {
    const bracketTeams = (bracket?.teams ?? []) as Array<{
      tid: number; name: string; abbrev: string; coachName?: string;
      isGLeague?: boolean; wins?: number; losses?: number; pf?: number; pa?: number;
      playerIds?: string[];
    }>;
    // Game cards (SF + Final, in bracket order)
    const orderedGames = [...(bracket?.games ?? [])].sort((a: any, b: any) => {
      if (a.round === b.round) return a.gid - b.gid;
      return a.round === 'sf' ? -1 : 1;
    });
    // Pre-bracket: find any today RS schedule games for Watch Live
    const todayRsGames = !bracket
      ? (state.schedule?.filter((g: any) =>
          g.isRisingStars &&
          normalizeDate(g.date) === normalizeDate(state.date) &&
          !g.played
        ) ?? [])
      : [];

    const BracketGameCard = ({ g }: { g: any }) => {
      const homeT = bracketTeams.find(t => t.tid === g.homeTid);
      const awayT = bracketTeams.find(t => t.tid === g.awayTid);
      const isFinal = g.round === 'final';
      const sched = state.schedule?.find((s: any) => s.gid === g.gid);
      const canWatchThis = sched && normalizeDate(sched.date) === normalizeDate(state.date) && !sched.played;
      return (
        <div className={`bg-slate-900 rounded-2xl border ${isFinal ? 'border-amber-500/40' : 'border-slate-800'} p-5`}>
          <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${isFinal ? 'text-amber-400' : 'text-sky-400'}`}>
            {isFinal ? 'Championship · Final' : 'Semifinal'} · First to {g.targetScore ?? (isFinal ? 25 : 40)}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <div className={`text-3xl font-black mb-1 ${g.played ? (g.homeScore >= g.awayScore ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
                {g.played ? g.homeScore : '—'}
              </div>
              <div className="text-[10px] text-sky-400 font-black uppercase tracking-widest leading-tight">{homeT?.name ?? 'TBD'}</div>
              {homeT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {homeT.coachName.split(' ').pop()}</div>}
            </div>
            <div className="text-lg font-black text-slate-700 italic">VS</div>
            <div className="flex-1 text-center">
              <div className={`text-3xl font-black mb-1 ${g.played ? (g.awayScore > g.homeScore ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
                {g.played ? g.awayScore : '—'}
              </div>
              <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest leading-tight">{awayT?.name ?? 'TBD'}</div>
              {awayT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {awayT.coachName.split(' ').pop()}</div>}
            </div>
          </div>
          {g.played && g.mvpName && (
            <div className="mt-3 text-center text-[10px] text-amber-400 font-black uppercase tracking-wide">
              MVP: {g.mvpName} · {g.mvpPts} pts
            </div>
          )}
          {(g.played || canWatchThis) && (
            <div className="flex justify-center mt-3">
              {g.played
                ? <button onClick={() => sched && onViewBoxScore?.(sched)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all">View Box Score</button>
                : canWatchThis && <button onClick={() => onWatchGame?.(sched)} className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-black rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"><Zap size={12} className="fill-current" />Watch Live</button>}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-8">
        {/* Bracket games or pre-bracket placeholder */}
        {orderedGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orderedGames.map((g: any) => <BracketGameCard key={g.gid} g={g} />)}
          </div>
        ) : (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Rising Stars Tournament</h3>
            <p className="text-slate-400 text-sm mb-4">4-team bracket · Semifinals + Championship · Feb 13</p>
            {todayRsGames.length > 0 && (
              <button
                onClick={() => onWatchGame?.(todayRsGames[0])}
                className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto"
              >
                <Zap size={18} className="fill-white" />
                Watch Live
              </button>
            )}
          </div>
        )}

        {/* All 4 team rosters */}
        {bracketTeams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bracketTeams.map(t => {
              const teamPlayers = (t.playerIds ?? [])
                .map((id: string) => {
                  const fp = state.players?.find((np: any) => np.internalId === id);
                  if (!fp) return null;
                  const teamObj = state.teams.find((tm: any) => tm.id === fp.tid);
                  return {
                    playerId: fp.internalId,
                    playerName: fp.name,
                    teamAbbrev: teamObj?.abbrev ?? (fp.status === 'G-League' ? 'GL' : '—'),
                    teamNbaId: teamObj?.logoUrl ? extractTeamId(teamObj.logoUrl, teamObj.abbrev) : null,
                    position: fp.pos,
                    ovr: fp.overallRating,
                    imgURL: (fp as any).imgURL,
                  };
                })
                .filter(Boolean);
              return (
                <div key={t.tid} className="space-y-3">
                  <div className="flex items-center gap-3 px-2">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest whitespace-nowrap">{t.name}</h4>
                    <div className="h-px bg-slate-800 flex-1" />
                    <span className="text-[10px] text-slate-500 font-bold tracking-widest">{t.wins ?? 0}-{t.losses ?? 0}</span>
                  </div>
                  {t.coachName && (
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-2">
                      Coach {t.coachName}{t.isGLeague ? ' · G League' : ''}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3">
                    {teamPlayers.length > 0
                      ? teamPlayers.map((p: any) => <PlayerCard key={p.playerId} p={p} />)
                      : <div className="text-xs text-slate-600 italic px-2">Roster assigned at sim time.</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-slate-600 italic">
            Teams and rosters announced Jan 29.
          </div>
        )}
      </div>
    );
  }

  // ── Legacy 2-team path (rookies vs sophomores) ───────────────────────────
  return (
    <div className="space-y-8">
      {boxScore ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6">
            Friday Night · Final Score
          </div>
          <div className="flex items-center justify-center gap-12 md:gap-24 mb-8">
            <div className="text-center">
              <img
                src={HOME_LOGO}
                alt={homeTeamName}
                className="w-16 h-16 object-contain mx-auto mb-3 drop-shadow-lg"
                referrerPolicy="no-referrer"
              />
              <div className={`text-5xl font-black mb-1 ${boxScore.homeScore > boxScore.awayScore ? 'text-white' : 'text-slate-600'}`}>
                {boxScore.homeScore}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{homeTeamName}</div>
            </div>
            <div className="text-4xl font-black text-slate-800">VS</div>
            <div className="text-center">
              <img
                src={AWAY_LOGO}
                alt={awayTeamName}
                className="w-16 h-16 object-contain mx-auto mb-3 drop-shadow-lg"
                referrerPolicy="no-referrer"
              />
              <div className={`text-5xl font-black mb-1 ${boxScore.awayScore > boxScore.homeScore ? 'text-white' : 'text-slate-600'}`}>
                {boxScore.awayScore}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{awayTeamName}</div>
            </div>
          </div>
          {(() => {
            const mvp = [...(boxScore.homeStats || []), ...(boxScore.awayStats || [])]
              .sort((a: any, b: any) => b.pts - a.pts || b.reb - a.reb || b.ast - a.ast)[0];
            return mvp ? (
              <div className="flex flex-col items-center gap-1 mb-4">
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Game MVP</div>
                <div className="px-6 py-2 bg-white text-black rounded-full text-sm font-black uppercase tracking-tight shadow-xl shadow-white/10">
                  {mvp.name}
                </div>
              </div>
            ) : null;
          })()}

          {game && (
            <button
              onClick={() => onViewBoxScore?.(game)}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all"
            >
              View Box Score
            </button>
          )}
        </div>
      ) : (
        <div className="text-center max-w-2xl mx-auto">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
            Friday, Feb 13
          </h3>
          <p className="text-slate-400 text-sm">
            Rising Stars Challenge · Rookies vs Sophomores
          </p>

          {canWatch && (
            <button
              onClick={() => onWatchGame?.(game)}
              className="mt-6 px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto"
            >
              <Zap size={18} className="fill-white" />
              Watch Live
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <h4 className="text-sm font-black text-white uppercase tracking-widest whitespace-nowrap">{homeTeamName}</h4>
            <div className="h-px bg-slate-800 flex-1" />
          </div>
          <div className="grid grid-cols-1 gap-3">
            {sophomores.map((p: any) => <PlayerCard key={p.playerId} p={p} />)}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <h4 className="text-sm font-black text-white uppercase tracking-widest whitespace-nowrap">{awayTeamName}</h4>
            <div className="h-px bg-slate-800 flex-1" />
          </div>
          <div className="grid grid-cols-1 gap-3">
            {rookies.map((p: any) => <PlayerCard key={p.playerId} p={p} />)}
          </div>
        </div>
      </div>
    </div>
  );
};
