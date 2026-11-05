import React from 'react';
import { Zap } from 'lucide-react';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { useGame } from '../../store/GameContext';
import { normalizeDate, extractTeamId } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getRisingStarsEventLabel } from '../../services/allStar/allStarEventAvailability';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { getLeagueEventDisplayName } from '../../services/franchises/franchiseEventNaming';
import {
  getLeagueFormerPlayerCaptainCandidates,
  resolveFormerPlayerCaptains,
} from '../../services/allStar/captainPool';
import { RisingStarsFinalHeader } from './RisingStarsFinalHeader';
import { getScoutedDisplayOverall } from '../../utils/scoutingFuzz';

interface RisingStarsViewProps {
  allStar: any;
  ownTid?: number | null;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
  onPlayerClick?: (player: any) => void;
}

export const RisingStarsView: React.FC<RisingStarsViewProps> = ({ allStar, ownTid, onWatchGame, onViewBoxScore, onPlayerClick }) => {
  const { state } = useGame();
  const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
  const announcementLabel = dates.risingStarsAnnounced.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const eventDateLabel = dates.risingStars.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const rsFormat = state.leagueStats?.risingStarsFormat ?? '4team_tournament';
  const eventLabel = getLeagueEventDisplayName(
    state,
    'rising_stars',
    getRisingStarsEventLabel(state.leagueStats),
  );
  const isTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team';
  const isUsaWorld = rsFormat === 'usa_vs_world';
  const isCaptainsDraft = rsFormat === 'captains_draft';
  const bracket = isTournament ? allStar?.risingStarsBracket : undefined;
  const gameId = allStar?.risingStarsGameId;
  const game = state.schedule?.find((g: any) => g.gid === gameId);
  const boxScore = game
    ? findBoxScoreForGame(state.boxScores, game.gid, game.date, { homeTid: game.homeTid, awayTid: game.awayTid })
    : state.boxScores?.find((r: any) => r.gameId === gameId || (r.homeTeamId === -3 && r.awayTeamId === -4));
  const roster = allStar?.risingStarsRoster || [];

  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game.played;

  if (!isTournament && !roster.length) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
          <Zap size={32} className="text-slate-700" />
        </div>
        <h3 className="text-xl font-black text-white mb-2">{eventLabel}</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          The best rookies and sophomores will be selected on {announcementLabel}.
        </p>
      </div>
    );
  }

  const rookies = roster.filter((p: any) => p.isRookie);
  const sophomores = roster.filter((p: any) => !p.isRookie);
  const usaRoster = roster.filter((p: any) => p.risingStarsTeam === 'USA' || p.conference === 'USA');
  const worldRoster = roster.filter((p: any) => p.risingStarsTeam === 'World' || p.conference === 'World');
  const captainOneRoster = roster.filter((p: any) => p.risingStarsTeam === 'Captain 1');
  const captainTwoRoster = roster.filter((p: any) => p.risingStarsTeam === 'Captain 2');
  const formerPlayerCaptains = isCaptainsDraft
    ? resolveFormerPlayerCaptains(
        state.leagueStats.risingStarsLegendCaptainIds,
        getLeagueFormerPlayerCaptainCandidates(state.players, state.teams, state.leagueStats),
      )
    : [];

  const PlayerCard = ({ p }: { p: any }) => {
    const fullPlayer = state.players?.find((pl: any) => pl.internalId === p.playerId);
    // NBA team first, then non-NBA (G-League etc.) by tid + league.
    const nbaTeam = state.teams?.find((t: any) => t.abbrev === p.teamAbbrev)
      ?? (fullPlayer ? state.teams?.find((t: any) => t.id === fullPlayer.tid) : null);
    const nonNbaTeam = !nbaTeam && fullPlayer
      ? (state.nonNBATeams ?? []).find((t: any) => t.tid === fullPlayer.tid && t.league === fullPlayer.status)
      : null;
    const team = nbaTeam ? getHistoricalTeamSnapshot(nbaTeam, state.leagueStats.year) : nonNbaTeam;
    const teamLogoUrl = getResolvedTeamLogoUrl(team, state.leagueStats.year);
    const teamAbbrev = (team as any)?.abbrev || p.teamAbbrev || '—';
    const imgUrl = (fullPlayer && getPlayerImage(fullPlayer)) || undefined;
    const isOwn = ownTid !== null && ownTid !== undefined && fullPlayer?.tid === ownTid;
    const bioPlayer = fullPlayer ?? { name: p.playerName, internalId: p.playerId };
    const handleOpenPlayer = () => onPlayerClick?.(bioPlayer);
    const displayOverall = fullPlayer
      ? getScoutedDisplayOverall(state, fullPlayer, state.leagueStats.year)
      : p.ovr;

    return (
      <div
        role={onPlayerClick ? 'button' : undefined}
        tabIndex={onPlayerClick ? 0 : undefined}
        onClick={onPlayerClick ? handleOpenPlayer : undefined}
        onKeyDown={onPlayerClick ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenPlayer();
          }
        } : undefined}
        className={`border rounded-xl p-3 flex items-center gap-3 shadow-lg transition-transform hover:scale-[1.02] ${
          onPlayerClick ? 'cursor-pointer hover:border-slate-600' : ''
        } ${
          isOwn
            ? 'bg-indigo-500/10 border-indigo-500/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <PlayerPortrait
          imgUrl={imgUrl}
          face={(fullPlayer as any)?.face}
          playerName={p.playerName}
          teamLogoUrl={teamLogoUrl}
          overallRating={fullPlayer?.overallRating ?? p.ovr}
          ratings={fullPlayer?.ratings}
          ovrLabel={displayOverall != null ? String(displayOverall) : undefined}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">
            {fullPlayer
              ? <PlayerNameWithHover player={fullPlayer}>{p.playerName}</PlayerNameWithHover>
              : p.playerName}
          </div>
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            {(p.position || fullPlayer?.pos || '—')} · {teamAbbrev}
          </div>
        </div>
      </div>
    );
  };

  const homeTeamName = allStar?.risingStarsTeams?.[0] || boxScore?.homeTeamName || (isUsaWorld ? 'Team USA' : 'Team 1');
  const awayTeamName = allStar?.risingStarsTeams?.[1] || boxScore?.awayTeamName || (isUsaWorld ? 'Team World' : 'Team 2');
  const finalBracket = isTournament ? bracket?.games?.find((entry: any) => entry.round === 'final') : undefined;
  const finalBracketHomeName = finalBracket
    ? bracket?.teams?.find((team: any) => team.tid === finalBracket.homeTid)?.name ?? homeTeamName
    : homeTeamName;
  const finalBracketAwayName = finalBracket
    ? bracket?.teams?.find((team: any) => team.tid === finalBracket.awayTid)?.name ?? awayTeamName
    : awayTeamName;
  const displayHomeTeamName = isTournament ? finalBracketHomeName : homeTeamName;
  const displayAwayTeamName = isTournament ? finalBracketAwayName : awayTeamName;

  // Conference logos — matches the WatchGamePreviewModal / AllStarWeekendOrchestrator
  const HOME_LOGO = isCaptainsDraft
    ? (formerPlayerCaptains[0] ? getPlayerImage(formerPlayerCaptains[0]) : undefined)
    : isUsaWorld
      ? 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f1fa-1f1f8.png'
      : 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Eastern_Conference_%28NBA%29_logo.svg/200px-Eastern_Conference_%28NBA%29_logo.svg.png';
  const AWAY_LOGO = isCaptainsDraft
    ? (formerPlayerCaptains[1] ? getPlayerImage(formerPlayerCaptains[1]) : undefined)
    : isUsaWorld
      ? 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f310.png'
      : 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Western_Conference_%28NBA%29_logo.svg/200px-Western_Conference_%28NBA%29_logo.svg.png';

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
              <div className={`text-3xl font-black mb-1 ${g.played ? (didHomeTeamWin(g) ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
                {g.played ? g.homeScore : '—'}
              </div>
              <div className="text-[10px] text-sky-400 font-black uppercase tracking-widest leading-tight">{homeT?.name ?? 'TBD'}</div>
              {homeT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {homeT.coachName.split(' ').pop()}</div>}
            </div>
            <div className="text-lg font-black text-slate-700 italic">VS</div>
            <div className="flex-1 text-center">
              <div className={`text-3xl font-black mb-1 ${g.played ? (!didHomeTeamWin(g) ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
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
        {boxScore && game?.played && (
          <RisingStarsFinalHeader
            game={game}
            boxScore={boxScore}
            homeName={displayHomeTeamName}
            awayName={displayAwayTeamName}
            homeLogo={HOME_LOGO}
            awayLogo={AWAY_LOGO}
            onViewBoxScore={selectedGame => onViewBoxScore?.({ ...selectedGame, expectedHomeTeamName: displayHomeTeamName, expectedAwayTeamName: displayAwayTeamName })}
          />
        )}
        {/* Bracket games or pre-bracket placeholder */}
        {orderedGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orderedGames.map((g: any) => <BracketGameCard key={g.gid} g={g} />)}
          </div>
        ) : (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">{eventLabel}</h3>
            <p className="text-slate-400 text-sm mb-4">4-team bracket · Semifinals + Championship · {eventDateLabel}</p>
            {roster.length > 0 && (
              <p className="text-slate-500 text-xs max-w-lg mx-auto mb-4">
                The player pool is already announced. The 4 tournament teams are finalized on event night, so this screen shows the rookie and sophomore pool until the bracket is built.
              </p>
            )}
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
                    teamNbaId: teamObj ? extractTeamId(getResolvedTeamLogoUrl(teamObj, state.leagueStats.year), teamObj.abbrev) : null,
                    position: fp.pos,
                    ovr: fp.overallRating,
                    imgURL: getPlayerImage(fp),
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
          roster.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(isUsaWorld
                ? [
                    { label: 'Team USA', players: usaRoster },
                    { label: 'Team World', players: worldRoster },
                  ]
                : [
                    { label: 'Sophomores', players: sophomores },
                    { label: 'Rookies', players: rookies },
                  ]
              ).map(({ label, players }) => (
                <div key={label} className="space-y-3">
                  <div className="flex items-center gap-3 px-2">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest whitespace-nowrap">{label}</h4>
                    <div className="h-px bg-slate-800 flex-1" />
                    <span className="text-[10px] text-slate-500 font-bold tracking-widest">
                      Announced {dates.risingStarsAnnounced.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {players.map((p: any) => <PlayerCard key={p.playerId} p={p} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-slate-600 italic">
              The player pool will be announced {announcementLabel}.
            </div>
          )
        )}
      </div>
    );
  }

  // ── Legacy 2-team path (rookies vs sophomores) ───────────────────────────
  return (
    <div className="space-y-8">
      {boxScore && game ? (
        <RisingStarsFinalHeader
          game={game}
          boxScore={boxScore}
          homeName={displayHomeTeamName}
          awayName={displayAwayTeamName}
          homeLogo={HOME_LOGO}
          awayLogo={AWAY_LOGO}
          onViewBoxScore={selectedGame => onViewBoxScore?.({ ...selectedGame, expectedHomeTeamName: displayHomeTeamName, expectedAwayTeamName: displayAwayTeamName })}
        />
      ) : (
        <div className="text-center max-w-2xl mx-auto">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
            {eventDateLabel}
          </h3>
          <p className="text-slate-400 text-sm">
            {eventLabel} · {isUsaWorld ? 'USA vs World' : isCaptainsDraft ? 'Former Player Captains Draft' : 'Rookies vs Sophomores'}
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
            {(isUsaWorld ? usaRoster : isCaptainsDraft ? captainOneRoster : sophomores).map((p: any) => <PlayerCard key={p.playerId} p={p} />)}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <h4 className="text-sm font-black text-white uppercase tracking-widest whitespace-nowrap">{awayTeamName}</h4>
            <div className="h-px bg-slate-800 flex-1" />
          </div>
          <div className="grid grid-cols-1 gap-3">
            {(isUsaWorld ? worldRoster : isCaptainsDraft ? captainTwoRoster : rookies).map((p: any) => <PlayerCard key={p.playerId} p={p} />)}
          </div>
        </div>
      </div>
    </div>
  );
};
