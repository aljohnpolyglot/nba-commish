import React from 'react';
import { Trophy, Zap, ArrowRight } from 'lucide-react';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { normalizeDate } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { AllStarRosterPanels, buildAllStarRosterPanels } from './AllStarRosterPanels';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';
import { getHistoricalTeamSnapshot, getTeamPrimaryColor } from '../../utils/teamAssets';
import { getAllStarPlayerEligibility, normalizeAllStarRoster } from '../../services/allStar/allStarSelectionHelpers';
import { getAllStarSelectionSeasons } from '../../utils/awardHistory';
import { buildPbaAllStarLeagueStats, isPbaLocalAllStarEligible } from '../../services/pba/allStar';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { AllStarFinalHeader } from './PbaAllStarFinalHeader';
import { resolveLegendCaptains } from '../../services/allStar/captainPool';
import { getPrimaryPlayerCountry } from '../../utils/playerNationality';
import { getScoutedDisplayOverall } from '../../utils/scoutingFuzz';

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
  const allStarLeagueStats = isPba ? buildPbaAllStarLeagueStats(state.leagueStats) : state.leagueStats;
  const dates = getAllStarWeekendDates(state.leagueStats.year, allStarLeagueStats);
  const startersDateLabel = dates.startersAnnounced.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const reservesDateLabel = dates.reservesAnnounced.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const playerById = React.useMemo(
    () => new Map<string, any>((state.players ?? []).map((p: any) => [p.internalId, p])),
    [state.players],
  );
  const resolveScheduledGame = React.useCallback((gameMeta: any) => {
    if (!gameMeta) return undefined;
    const candidates = (state.schedule ?? []).filter((g: any) => g.gid === gameMeta.gid);
    if (candidates.length === 0) return undefined;
    const exact = candidates.find((g: any) =>
      g.homeTid === gameMeta.homeTid &&
      g.awayTid === gameMeta.awayTid &&
      (!!g.isAllStar || !!g.isRisingStars || !!g.isCelebrityGame)
    );
    if (exact) return exact;
    const dated = [...candidates]
      .filter((g: any) => !!g.isAllStar || !!g.isRisingStars || !!g.isCelebrityGame)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return dated[0] ?? candidates[candidates.length - 1];
  }, [state.schedule]);

  const bracket = allStar?.bracket;
  const finalBracketGame = bracket?.games?.find((bg: any) => bg.round === 'final')
    ?? bracket?.games?.find((bg: any) => bg.gid === allStar?.allStarGameId);
  const game = resolveScheduledGame(finalBracketGame)
    ?? (!isPba ? resolveScheduledGame({ gid: allStar?.allStarGameId, homeTid: undefined, awayTid: undefined }) : undefined);
  const homeBracket = bracket?.teams?.find((t: any) => t.tid === game?.homeTid);
  const awayBracket = bracket?.teams?.find((t: any) => t.tid === game?.awayTid);
  const boxScore = game ? findBoxScoreForGame(state.boxScores, game.gid, game.date, {
    homeTid: game.homeTid,
    awayTid: game.awayTid,
    homeTeamName: homeBracket?.name,
    awayTeamName: awayBracket?.name,
  }) : undefined;
  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game?.played;
  const gameModeLabel = game?.gameFormat === 'target_score'
    ? `First to ${game.targetScore ?? allStarLeagueStats?.allStarGameTargetScore ?? 40}`
    : game?.gameFormat === 'elam_ending'
      ? `Elam Ending · +${allStarLeagueStats?.allStarOvertimeTargetPoints ?? 24}`
      : 'Timed Game';

  const homeFinalName = boxScore?.homeTeamName ?? homeBracket?.name ?? (isPba ? 'Team A' : 'East All-Stars');
  const awayFinalName = boxScore?.awayTeamName ?? awayBracket?.name ?? (isPba ? 'Team B' : 'West All-Stars');
  if (!allStar?.startersAnnounced) {
    return <div className="text-center py-12 text-slate-500">Starters announced {startersDateLabel}.</div>;
  }

  const normalizedRoster = normalizeAllStarRoster(
    allStar.roster ?? [],
    state.players ?? [],
    isPba
      ? player => isPbaLocalAllStarEligible(player, state)
      : getAllStarPlayerEligibility(state.leagueStats, teams),
  );
  const activeRoster = normalizedRoster.filter((p: any) => !p.isInjuredDNP);
  const format = allStarLeagueStats?.allStarFormat ?? 'east_vs_west';
  const isUsaWorld = format === 'usa_vs_world';
  const isCaptainsDraft = format === 'captains_draft';

  const buildPlayerData = (p: any) => {
    const team = teams.find((t: any) => t.abbrev === p.teamAbbrev)
      ?? teams.find((t: any) => t.id === playerById.get(p.playerId)?.tid);
    const fullPlayer = playerById.get(p.playerId) ?? null;
    const currentSeason = state.leagueStats?.year;
    const teamSnapshot = team ? getHistoricalTeamSnapshot(team, currentSeason) : null;
    const teamColor = teamSnapshot ? getTeamPrimaryColor(teamSnapshot) : '#64748b';
    const imgUrl = (fullPlayer && getPlayerImage(fullPlayer)) || undefined;
    const allStarSeasons = getAllStarSelectionSeasons(fullPlayer?.awards, currentSeason);
    const alreadyAwarded = allStarSeasons.includes(currentSeason);
    const allStarCount = alreadyAwarded ? allStarSeasons.length : allStarSeasons.length + 1;
    const country = isUsaWorld ? getPrimaryPlayerCountry(fullPlayer ?? {}) : 'Unknown';
    const displayOverall = fullPlayer ? getScoutedDisplayOverall(state, fullPlayer, currentSeason) : undefined;
    return { team: teamSnapshot ?? team, teamColor, teamLogoUrl: teamSnapshot?.logoUrl, fullPlayer, imgUrl, allStarCount, country, displayOverall };
  };

  const replacements = normalizedRoster.filter((p: any) => p.isInjuryReplacement);
  const dnps         = normalizedRoster.filter((p: any) => p.isInjuredDNP);
  const legendCaptains = allStarLeagueStats?.allStarCaptainType === 'legend'
    ? resolveLegendCaptains(allStarLeagueStats.allStarLegendCaptainIds, state.players ?? [])
    : [];
  const panels = buildAllStarRosterPanels(
    activeRoster,
    isCaptainsDraft,
    playerById,
    legendCaptains,
    allStarLeagueStats?.allStarTeamNames ?? [],
    isPba ? {} : {
      East: bracket?.teams?.find((team: any) => team.bucketKey === 'East')?.logoUrl,
      West: bracket?.teams?.find((team: any) => team.bucketKey === 'West')?.logoUrl,
    },
  );

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
      {(boxScore || finalBracketGame?.played || game?.played) && (
        <AllStarFinalHeader
          allStar={allStar}
          state={state}
          showDanceResult={isPba}
          onViewBoxScore={selectedGame => onViewBoxScore?.({
            ...selectedGame,
            expectedHomeTeamName: homeBracket?.name,
            expectedAwayTeamName: awayBracket?.name,
          })}
        />
      )}

      {isBracketTournament && playedBracketGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playedBracketGames.map((g: any) => {
            const homeT = bracket.teams?.find((t: any) => t.tid === g.homeTid);
            const awayT = bracket.teams?.find((t: any) => t.tid === g.awayTid);
            const isFinal = g.round === 'final';
            const sched = resolveScheduledGame(g);
            return (
              <div key={g.gid} className={`bg-slate-900 rounded-2xl border ${isFinal ? 'border-amber-500/40' : 'border-slate-800'} p-5`}>
                <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${isFinal ? 'text-amber-400' : 'text-sky-400'}`}>
                  {isFinal ? 'Championship · Final' : 'Semifinal'} · First to {g.targetScore ?? (isFinal ? 25 : 40)}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 text-center">
                    <div className={`text-3xl font-black mb-1 ${didHomeTeamWin(g) ? 'text-white' : 'text-slate-600'}`}>{g.homeScore}</div>
                    <div className="text-[10px] text-sky-400 font-black uppercase tracking-widest leading-tight">{homeT?.name ?? homeFinalName}</div>
                    {homeT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {homeT.coachName.split(' ').pop()}</div>}
                  </div>
                  <div className="text-lg font-black text-slate-700 italic">VS</div>
                  <div className="flex-1 text-center">
                    <div className={`text-3xl font-black mb-1 ${!didHomeTeamWin(g) ? 'text-white' : 'text-slate-600'}`}>{g.awayScore}</div>
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
                    <button onClick={() => onViewBoxScore?.({
                      ...sched,
                      expectedHomeTeamName: homeT?.name,
                      expectedAwayTeamName: awayT?.name,
                    })} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all">
                      View Box Score
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (boxScore || finalBracketGame?.played) ? null : canWatch && game ? (
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
          ★ = Fan vote starters · Reserves announced {reservesDateLabel}
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
                    ovrLabel={fullPlayer ? String(getScoutedDisplayOverall(state, fullPlayer, state.leagueStats.year)) : undefined}
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
                          ovrLabel={repData.displayOverall != null ? String(repData.displayOverall) : undefined}
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
                      ovrLabel={rData.displayOverall != null ? String(rData.displayOverall) : undefined}
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
