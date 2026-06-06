import React from 'react';
import { Trophy, Zap, ArrowRight } from 'lucide-react';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { normalizeDate, getCountryFromLoc, getCountryCode } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { ALL_STAR_ASSETS } from '../../services/allStar/AllStarSelectionService';
import { AllStarRosterPanels, buildAllStarRosterPanels } from './AllStarRosterPanels';

const EAST_LOGO  = ALL_STAR_ASSETS.eastLogo;
const WEST_LOGO  = ALL_STAR_ASSETS.westLogo;
const USA_LOGO   = ALL_STAR_ASSETS.usaLogo;
const WORLD_LOGO = ALL_STAR_ASSETS.worldLogo;

interface AllStarRosterProps {
  allStar: any;
  state: any;
  teams?: any[];
  ownTid?: number | null;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
  onPlayerClick?: (player: any) => void;
}

export const AllStarRoster: React.FC<AllStarRosterProps> = ({ allStar, state, teams: providedTeams, ownTid, onWatchGame, onViewBoxScore, onPlayerClick }) => {
  const teams = providedTeams ?? state.teams;
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const playerById = React.useMemo(
    () => new Map<string, any>((state.players ?? []).map((p: any) => [p.internalId, p])),
    [state.players],
  );

  const gameId = allStar?.allStarGameId;
  const game = state.schedule?.find((g: any) => g.gid === gameId);
  const boxScore = state.boxScores?.find((r: any) => r.gameId === gameId || (r.homeTeamId === -1 && r.awayTeamId === -2));
  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game?.played;
  const gameModeLabel = game?.gameFormat === 'target_score'
    ? `First to ${game.targetScore ?? state.leagueStats?.allStarGameTargetScore ?? 40}`
    : game?.gameFormat === 'elam_ending'
      ? `Elam Ending · +${state.leagueStats?.allStarOvertimeTargetPoints ?? 24}`
      : 'Timed Game';

  const bracket = allStar?.bracket;
  const homeBracket = bracket?.teams?.find((t: any) => t.tid === game?.homeTid);
  const awayBracket = bracket?.teams?.find((t: any) => t.tid === game?.awayTid);
  const homeFinalName = boxScore?.homeTeamName ?? homeBracket?.name ?? (isPba ? 'Team A' : 'East All-Stars');
  const awayFinalName = boxScore?.awayTeamName ?? awayBracket?.name ?? (isPba ? 'Team B' : 'West All-Stars');

  // Captains_draft: swap East/West logos for the captains' portraits.
  const formatEarly = state.leagueStats?.allStarFormat ?? 'east_vs_west';
  const isCaptainsDraftFormat = formatEarly === 'captains_draft';
  const homeBucketKey = game?.homeTid === -1 ? 'East' : 'West';
  const awayBucketKey = game?.awayTid === -2 ? 'West' : 'East';
  const homeCaptain = isCaptainsDraftFormat ? allStar.roster?.find((r: any) => r.conference === homeBucketKey && r.isCaptain) : null;
  const awayCaptain = isCaptainsDraftFormat ? allStar.roster?.find((r: any) => r.conference === awayBucketKey && r.isCaptain) : null;
  const homeCaptainPlayer = homeCaptain ? playerById.get(homeCaptain.playerId) : null;
  const awayCaptainPlayer = awayCaptain ? playerById.get(awayCaptain.playerId) : null;
  const homeCaptainImg = homeCaptainPlayer ? getPlayerImage(homeCaptainPlayer) : null;
  const awayCaptainImg = awayCaptainPlayer ? getPlayerImage(awayCaptainPlayer) : null;

  if (!allStar?.startersAnnounced) {
    return <div className="text-center py-12 text-slate-500">Starters announced Jan 22.</div>;
  }

  const format = state.leagueStats?.allStarFormat ?? 'east_vs_west';
  const isUsaWorld = format === 'usa_vs_world';
  const isCaptainsDraft = format === 'captains_draft';

  const buildPlayerData = (p: any) => {
    const team = teams.find((t: any) => t.abbrev === p.teamAbbrev)
      ?? teams.find((t: any) => t.id === playerById.get(p.playerId)?.tid);
    const teamColor = team?.colors?.[0] ?? '#64748b';
    const fullPlayer = playerById.get(p.playerId) ?? null;
    const imgUrl = (fullPlayer && getPlayerImage(fullPlayer)) || undefined;
    const currentSeason = state.leagueStats?.year;
    const pastAllStars = fullPlayer?.awards?.filter((a: any) => a.type === 'All-Star').length ?? 0;
    const alreadyAwarded = fullPlayer?.awards?.some((a: any) => a.type === 'All-Star' && a.season === currentSeason);
    const allStarCount = alreadyAwarded ? pastAllStars : pastAllStars + 1;
    const country = getCountryFromLoc(fullPlayer?.born?.loc);
    const cc = country && country !== 'Unknown' ? getCountryCode(country) : '';
    // Twemoji PNG — emoji-style flag that renders on every OS (Windows native flag emoji don't).
    const flagUrl = isUsaWorld && cc ? `https://flagcdn.com/w40/${cc}.png` : null;
    return { team, teamColor, fullPlayer, imgUrl, allStarCount, flagUrl, country };
  };

  const replacements = allStar.roster.filter((p: any) => p.isInjuryReplacement);
  const dnps         = allStar.roster.filter((p: any) => p.isInjuredDNP);
  const panels = buildAllStarRosterPanels(allStar.roster, isCaptainsDraft, playerById);

  const isBracketTournament = bracket?.games?.length > 1;
  const playedBracketGames = bracket?.games
    ?.filter((g: any) => g.played)
    .sort((a: any, b: any) => {
      if (a.round === b.round) return a.gid - b.gid;
      return a.round === 'final' ? 1 : -1;
    }) ?? [];

  return (
    <div className="space-y-8">

      {/* ── Game result or Watch prompt ───────────────────────────────────── */}
      {isBracketTournament && playedBracketGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playedBracketGames.map((g: any) => {
            const homeT = bracket.teams?.find((t: any) => t.tid === g.homeTid);
            const awayT = bracket.teams?.find((t: any) => t.tid === g.awayTid);
            const isFinal = g.round === 'final';
            const sched = state.schedule?.find((s: any) => s.gid === g.gid);
            return (
              <div key={g.gid} className={`bg-slate-900 rounded-2xl border ${isFinal ? 'border-amber-500/40' : 'border-slate-800'} p-5`}>
                <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${isFinal ? 'text-amber-400' : 'text-sky-400'}`}>
                  {isFinal ? 'Championship · Final' : 'Semifinal'} · First to {g.targetScore ?? (isFinal ? 25 : 40)}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 text-center">
                    <div className={`text-3xl font-black mb-1 ${g.homeScore >= g.awayScore ? 'text-white' : 'text-slate-600'}`}>{g.homeScore}</div>
                    <div className="text-[10px] text-sky-400 font-black uppercase tracking-widest leading-tight">{homeT?.name ?? homeFinalName}</div>
                    {homeT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {homeT.coachName.split(' ').pop()}</div>}
                  </div>
                  <div className="text-lg font-black text-slate-700 italic">VS</div>
                  <div className="flex-1 text-center">
                    <div className={`text-3xl font-black mb-1 ${g.awayScore > g.homeScore ? 'text-white' : 'text-slate-600'}`}>{g.awayScore}</div>
                    <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest leading-tight">{awayT?.name ?? awayFinalName}</div>
                    {awayT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {awayT.coachName.split(' ').pop()}</div>}
                  </div>
                </div>
                {g.mvpName && (
                  <div className="mt-3 text-center text-[10px] text-amber-400 font-black uppercase tracking-wide">
                    MVP: {g.mvpName} · {g.mvpPts} pts
                  </div>
                )}
                {sched && (
                  <div className="flex justify-center mt-3">
                    <button onClick={() => onViewBoxScore?.(sched)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all">
                      View Box Score
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : boxScore ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6">
            Sunday Night · Final Score
          </div>
          <div className="flex items-center justify-center gap-12 md:gap-24 mb-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-3 overflow-hidden">
                {isCaptainsDraftFormat && homeCaptainImg ? (
                  <img src={homeCaptainImg} className="w-full h-full object-cover" alt="Home Captain" referrerPolicy="no-referrer" />
                ) : (
                  <img src={EAST_LOGO} className="w-8 h-8 object-contain" alt="Home" />
                )}
              </div>
              <div className={`text-5xl font-black mb-1 ${boxScore.homeScore > boxScore.awayScore ? 'text-white' : 'text-slate-600'}`}>
                {boxScore.homeScore}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{homeFinalName}</div>
            </div>
            <div className="text-4xl font-black text-slate-800">VS</div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-3 overflow-hidden">
                {isCaptainsDraftFormat && awayCaptainImg ? (
                  <img src={awayCaptainImg} className="w-full h-full object-cover" alt="Away Captain" referrerPolicy="no-referrer" />
                ) : (
                  <img src={WEST_LOGO} className="w-8 h-8 object-contain" alt="Away" />
                )}
              </div>
              <div className={`text-5xl font-black mb-1 ${boxScore.awayScore > boxScore.homeScore ? 'text-white' : 'text-slate-600'}`}>
                {boxScore.awayScore}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{awayFinalName}</div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-800 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <Trophy size={12} className="text-amber-400" />
              Final
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
      ) : canWatch && game ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">All-Star Game</h3>
          <p className="text-slate-400 text-sm mb-6">The main event · {gameModeLabel}</p>
          <button
            onClick={() => onWatchGame?.(game)}
            className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto"
          >
            <Zap size={18} className="fill-white" />
            Watch Live
          </button>
        </div>
      ) : null}

      {!allStar.reservesAnnounced && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
          ★ = Fan vote starters · Reserves announced Jan 29
        </div>
      )}

      {/* ── Bracket per-round MVPs (multi-game formats only, classic single-game only) ── */}
      {!isBracketTournament && bracket && bracket.games?.filter((g: any) => g.played && g.mvpName).length > 1 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={12} className="text-amber-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-400/80">Per-Game MVPs</span>
            <div className="h-px bg-slate-800 flex-1" />
          </div>
          <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden">
            {bracket.games.filter((g: any) => g.played && g.mvpName).map((g: any) => {
              const mvpRoster = allStar.roster?.find((r: any) =>
                r.playerName === g.mvpName && (g.mvpTeam ? r.conference === g.mvpTeam : true));
              const fullPlayer = mvpRoster
                ? playerById.get(mvpRoster.playerId)
                : state.players?.find((p: any) => p.name === g.mvpName);
              const imgUrl = fullPlayer ? getPlayerImage(fullPlayer) : undefined;
              const homeT = bracket.teams?.find((t: any) => t.tid === g.homeTid);
              const awayT = bracket.teams?.find((t: any) => t.tid === g.awayTid);
              const matchupLabel = `${homeT?.abbrev ?? '?'} ${g.homeScore}–${g.awayScore} ${awayT?.abbrev ?? '?'}`;
              const roundLabel = g.round === 'final' ? 'CHAMPIONSHIP' : g.round === 'sf' ? 'SEMIFINAL' : 'ROUND ROBIN';
              return (
                <div
                  key={g.gid}
                  className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 last:border-0 hover:bg-slate-800/30 transition-colors cursor-pointer"
                  onClick={() => fullPlayer && onPlayerClick?.(fullPlayer)}
                >
                  <PlayerPortrait
                    imgUrl={imgUrl}
                    face={(fullPlayer as any)?.face}
                    playerName={g.mvpName}
                    overallRating={fullPlayer?.overallRating}
                    ratings={fullPlayer?.ratings}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      {fullPlayer
                        ? <PlayerNameWithHover player={fullPlayer}>{g.mvpName}</PlayerNameWithHover>
                        : g.mvpName}
                      <span className="text-[8px] font-black text-amber-400 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded">
                        {g.mvpPts ?? 0} PTS
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                      {roundLabel} · {matchupLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Team panels (dynamic by format/bucket) ───────────────────────── */}
      <AllStarRosterPanels
        buildPlayerData={buildPlayerData}
        isCaptainsDraft={isCaptainsDraft}
        onPlayerClick={onPlayerClick}
        ownTid={ownTid}
        panels={panels}
      />

      {/* ── Injury replacements ───────────────────────────────────────────── */}
      {(replacements.length > 0 || dnps.length > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-rose-400 text-sm">⚡</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Injury Replacements</span>
            <div className="h-px bg-slate-800 flex-1" />
          </div>
          <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden">

            {/* DNP → replacement pairs */}
            {dnps.map((dnp: any) => {
              const replacement = replacements.find((r: any) => r.injuredPlayerId === dnp.playerId);
              const dnpData = buildPlayerData(dnp);
              const repData = replacement ? buildPlayerData(replacement) : null;
              return (
                <div key={dnp.playerId} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 last:border-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0 opacity-50">
                    <PlayerPortrait imgUrl={dnpData.imgUrl} face={(dnpData.fullPlayer as any)?.face} playerName={dnp.playerName} size={36} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-400 line-through truncate">
                        {dnpData.fullPlayer
                          ? <PlayerNameWithHover player={dnpData.fullPlayer}>{dnp.playerName}</PlayerNameWithHover>
                          : dnp.playerName}
                      </div>
                      <span className="text-[8px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">DNP · INJURY</span>
                    </div>
                  </div>
                  {replacement && repData && (
                    <>
                      <ArrowRight size={14} className="text-slate-600 shrink-0" />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <PlayerPortrait
                          imgUrl={repData.imgUrl}
                          face={(repData.fullPlayer as any)?.face}
                          playerName={replacement.playerName}
                          overallRating={repData.fullPlayer?.overallRating}
                          ratings={repData.fullPlayer?.ratings}
                          size={36}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">
                            {repData.fullPlayer
                              ? <PlayerNameWithHover player={repData.fullPlayer}>{replacement.playerName}</PlayerNameWithHover>
                              : replacement.playerName}
                          </div>
                          <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">REPLACEMENT</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Standalone replacements whose original is no longer in the DNP list */}
            {replacements
              .filter((r: any) => !dnps.find((d: any) => d.playerId === r.injuredPlayerId))
              .map((r: any) => {
                const rData = buildPlayerData(r);
                return (
                  <div key={r.playerId} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 last:border-0">
                    <PlayerPortrait
                      imgUrl={rData.imgUrl}
                      face={(rData.fullPlayer as any)?.face}
                      playerName={r.playerName}
                      overallRating={rData.fullPlayer?.overallRating}
                      ratings={rData.fullPlayer?.ratings}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {rData.fullPlayer
                          ? <PlayerNameWithHover player={rData.fullPlayer}>{r.playerName}</PlayerNameWithHover>
                          : r.playerName}
                      </div>
                      <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">REPLACEMENT</span>
                    </div>
                  </div>
                );
              })}

          </div>
        </div>
      )}

    </div>
  );
};
