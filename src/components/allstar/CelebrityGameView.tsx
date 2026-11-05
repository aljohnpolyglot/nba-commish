import React from 'react';
import { Users, Trophy, Star, ExternalLink } from 'lucide-react';
import { normalizeDate } from '../../utils/helpers';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import {
  getLeagueEventDisplayName,
  getLeagueEventSponsorName,
} from '../../services/franchises/franchiseEventNaming';
import { getLocalRatedCelebritiesForYear } from '../../data/celebrityEventSource';
import { normalizeCelebrityImageNameKey } from '../../data/celebrities';

interface CelebrityGameViewProps {
  allStar: any;
  state: any;
  ownTid?: number | null;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
}

export const CelebrityGameView: React.FC<CelebrityGameViewProps> = ({ allStar, state, ownTid, onWatchGame, onViewBoxScore }) => {
  const eventName = getLeagueEventDisplayName(state, 'celebrity_game', 'NBA All-Star Celebrity Game');
  const sponsorName = getLeagueEventSponsorName(state, 'celebrity_game');
  const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
  const announcementLabel = dates.celebrityAnnounced.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const eventDateLabel = dates.celebrityGame.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const isAutoSelected = state.leagueStats.celebrityRosterAutoSelected;
  const roster = allStar?.celebrityRoster || state.leagueStats.celebrityRoster || [];
  const celebrityProfiles = allStar?.celebrityRosterProfiles || state.leagueStats.celebrityRosterProfiles || [];
  const profilesByName = new Map(
    [
      ...getLocalRatedCelebritiesForYear(state.leagueStats.year, state.leagueType === 'fictional' ? 'fictional' : 'real'),
      ...celebrityProfiles,
    ].map((profile: any) => [normalizeCelebrityImageNameKey(profile.name), profile]),
  );
  const teamDetails = Array.isArray(allStar?.celebrityTeamDetails) ? allStar.celebrityTeamDetails : null;
  const gameDetails = allStar?.celebrityGameDetails;
  const hasHistoricalTeamDetails = Boolean(teamDetails);

  const game = state.schedule?.find((g: any) => g.gid === 90002);
  const boxScore = game
    ? findBoxScoreForGame(state.boxScores, game.gid, game.date, { homeTid: game.homeTid, awayTid: game.awayTid })
    : state.boxScores?.find((b: any) => b.gameId === 90002 || (b.homeTeamId === -5 && b.awayTeamId === -6));
  const gameResult = allStar?.celebrityGameResult || (boxScore ? {
    homeScore: boxScore.homeScore,
    awayScore: boxScore.awayScore,
    homeTeamId: boxScore.homeTeamId,
    awayTeamId: boxScore.awayTeamId,
    winnerId: boxScore.winnerId,
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
        <h3 className="text-xl font-black text-white mb-2">{eventName}</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          The star-studded roster will be announced on {announcementLabel}.
        </p>
      </div>
    );
  }

  const teamNames = (teamDetails?.length ?? 0) >= 2
    ? [teamDetails[0]?.name, teamDetails[1]?.name]
    : allStar?.celebrityTeams || ['Team Spotlight', 'Team Prime'];
  const team1 = teamDetails?.[0]?.roster?.length ? teamDetails[0].roster : roster.slice(0, 10);
  const team2 = teamDetails?.[1]?.roster?.length ? teamDetails[1].roster : roster.slice(10, 20);
  const eventMeta = [
    gameDetails?.location,
    gameDetails?.halftimePerformance ? `Halftime: ${gameDetails.halftimePerformance}` : null,
  ].filter((item): item is string => Boolean(item));
  const renderTeamStaff = (details: any) => {
    if (!details) return null;
    const rows = [
      details.headCoach ? `Head Coach: ${details.headCoach}` : null,
      details.assistantCoaches?.length ? `Assistants: ${details.assistantCoaches.join(', ')}` : null,
      details.generalManager ? `GM: ${details.generalManager}` : null,
      details.captains?.length ? `Captains: ${details.captains.join(', ')}` : null,
      ...(details.extra || []).map((field: any) => `${field.label}: ${field.value}`),
    ].filter((row): row is string => Boolean(row));
    if (!rows.length) return null;
    return (
      <div className="flex flex-wrap gap-2 px-2">
        {rows.map((row: string) => (
          <span key={row} className="px-2 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {row}
          </span>
        ))}
      </div>
    );
  };

  const getCelebrityWikipediaUrl = (name: string, profile: any): string =>
    profile?.wikipediaUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(name.trim().replace(/\\s+/g, '_'))}`;

  return (
    <div className="space-y-12">
      {gameResult ? (
        <div className="bg-gradient-to-br from-fuchsia-600/20 via-pink-600/10 to-purple-600/20 border border-fuchsia-500/20 rounded-3xl p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            <Trophy className="text-fuchsia-500/40" size={48} />
          </div>
          
          <div className="text-[10px] font-black text-fuchsia-400 uppercase tracking-[0.3em] mb-8">
            {eventName} · Final
          </div>

          <div className="flex items-center justify-center gap-12 md:gap-24 mb-10">
            <div className="text-center">
              <div className={`text-6xl font-black mb-2 ${didHomeTeamWin(gameResult) ? 'text-white' : 'text-slate-600'}`}>
                {gameResult.homeScore}
              </div>
              <div className="text-xs font-bold text-fuchsia-300 uppercase tracking-widest">{gameResult.homeTeamName || teamNames[0]}</div>
            </div>
            <div className="text-3xl font-black text-slate-800 italic">VS</div>
            <div className="text-center">
              <div className={`text-6xl font-black mb-2 ${!didHomeTeamWin(gameResult) ? 'text-white' : 'text-slate-600'}`}>
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
            {eventName} {state.leagueStats.year}
          </h3>
          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-12 bg-slate-800" />
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">
              {eventDateLabel} · 7:00 PM ET{eventMeta.length ? ` · ${eventMeta.join(' · ')}` : ''}
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
          { label: teamNames[0], players: team1, details: teamDetails?.[0], color: 'from-fuchsia-600 to-purple-600', badge: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20' },
          { label: teamNames[1], players: team2, details: teamDetails?.[1], color: 'from-pink-600 to-rose-600', badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20' }
        ].map((team, idx) => (
          <div key={`${team.label}-${idx}`} className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-lg font-black text-white uppercase tracking-tight italic">{team.label}</h4>
              <div className={`h-1 w-24 bg-gradient-to-r ${team.color} rounded-full opacity-50`} />
            </div>
            {renderTeamStaff(team.details)}
            <div className="grid grid-cols-1 gap-3">
              {team.players.map((name: string) => {
                const profile = profilesByName.get(normalizeCelebrityImageNameKey(name)) as any;
                const imageUrl = profile?.imgUrl;
                return (
                  <a
                    key={name}
                    href={getCelebrityWikipediaUrl(name, profile)}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:border-fuchsia-500/50 hover:bg-slate-900 transition-colors group"
                    aria-label={`Open Wikipedia page for ${name}`}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt="" loading="lazy" className="w-12 h-12 rounded-xl object-cover bg-slate-950 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-fuchsia-900/40 flex items-center justify-center text-sm font-black text-fuchsia-300 shrink-0">
                        {name.charAt(0)}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors truncate">{name}</span>
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{profile?.type || 'Celebrity'}</span>
                    </div>
                    <ExternalLink size={15} className="text-slate-600 group-hover:text-fuchsia-400 shrink-0" aria-hidden="true" />
                    {hasHistoricalTeamDetails && <div className="px-2 py-0.5 rounded text-[8px] font-black border shrink-0 bg-slate-800 text-slate-400 border-slate-700">ROSTER</div>}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 text-center">
        <p className="text-[10px] text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
          The {eventName} features stars from film, TV, music and sports{ sponsorName ? `, with ${sponsorName} as presenting partner` : ''}. 
          Rosters are composed of {hasHistoricalTeamDetails ? 'the announced team lineups' : isAutoSelected ? 'auto-selected fan favorites' : 'hand-picked selections'}.
        </p>
      </div>
    </div>
  );
};
