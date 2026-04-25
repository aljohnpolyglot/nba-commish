import React from 'react';
import { Star, Trophy, Zap, ArrowRight } from 'lucide-react';
import { normalizeDate } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import { PlayerPortrait } from '../shared/PlayerPortrait';

const EAST_LOGO = 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748';
const WEST_LOGO = 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726';

interface AllStarRosterProps {
  allStar: any;
  state: any;
  onWatchGame?: (game: any) => void;
  onViewBoxScore?: (game: any) => void;
  onPlayerClick?: (player: any) => void;
}

export const AllStarRoster: React.FC<AllStarRosterProps> = ({ allStar, state, onWatchGame, onViewBoxScore, onPlayerClick }) => {
  const teams = state.teams;

  const gameId = allStar?.allStarGameId;
  const game = state.schedule?.find((g: any) => g.gid === gameId);
  const boxScore = state.boxScores?.find((r: any) => r.gameId === gameId || (r.homeTeamId === -1 && r.awayTeamId === -2));
  const isToday = game && normalizeDate(game.date) === normalizeDate(state.date);
  const canWatch = isToday && !game?.played;

  if (!allStar?.startersAnnounced) {
    return <div className="text-center py-12 text-slate-500">Starters announced Jan 22.</div>;
  }

  const buildPlayerData = (p: any) => {
    const team = teams.find((t: any) => t.abbrev === p.teamAbbrev);
    const teamColor = team?.colors?.[0] ?? '#64748b';
    const fullPlayer = state.players?.find((pl: any) => pl.internalId === p.playerId) ?? null;
    const imgUrl = (fullPlayer && getPlayerImage(fullPlayer)) || undefined;
    const currentSeason = state.leagueStats?.year;
    const pastAllStars = fullPlayer?.awards?.filter((a: any) => a.type === 'All-Star').length ?? 0;
    const alreadyAwarded = fullPlayer?.awards?.some((a: any) => a.type === 'All-Star' && a.season === currentSeason);
    const allStarCount = alreadyAwarded ? pastAllStars : pastAllStars + 1;
    return { team, teamColor, fullPlayer, imgUrl, allStarCount };
  };

  // ── Starter hero card ────────────────────────────────────────────────────────
  const StarterCard = ({ p }: { p: any }) => {
    const { team, teamColor, fullPlayer, imgUrl, allStarCount } = buildPlayerData(p);
    return (
      <div
        className="relative flex flex-col items-center gap-1.5 p-3 pt-4 rounded-2xl border cursor-pointer"
        style={{
          borderColor: `${teamColor}55`,
          background: `linear-gradient(160deg, ${teamColor}18 0%, rgba(15,23,42,0.9) 55%)`,
        }}
        onClick={() => onPlayerClick?.(fullPlayer ?? { name: p.playerName, internalId: p.playerId })}
      >
        {/* Thin team-color top accent */}
        <div
          className="absolute top-0 left-4 right-4 h-px rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, ${teamColor}90, transparent)` }}
        />

        {/* Gold STARTER badge */}
        <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 rounded-full">
          <Star size={7} className="text-amber-400 fill-amber-400" />
          <span className="text-[7px] font-black text-amber-400 uppercase tracking-wide">Starter</span>
        </div>

        {/* Portrait — team logo top-left, OVR bottom-right via PlayerPortrait */}
        <div className="mt-1">
          <PlayerPortrait
            imgUrl={imgUrl}
            face={(fullPlayer as any)?.face}
            playerName={p.playerName}
            teamLogoUrl={team?.logoUrl}
            overallRating={fullPlayer?.overallRating}
            ratings={fullPlayer?.ratings}
            size={56}
          />
        </div>

        {/* Name + position */}
        <div className="text-center w-full mt-0.5">
          <div className="text-[11px] font-black text-white leading-tight truncate px-1">{p.playerName}</div>
          <div className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">{p.position}</div>
        </div>

        {/* All-Star count */}
        <div className="flex items-center gap-0.5 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
          <Star size={7} className="text-amber-400 fill-amber-400" />
          <span className="text-[9px] font-black text-amber-400">{allStarCount}×</span>
        </div>
      </div>
    );
  };

  // ── Reserve list row ─────────────────────────────────────────────────────────
  const ReserveRow = ({ p }: { p: any }) => {
    const { team, fullPlayer, imgUrl, allStarCount } = buildPlayerData(p);
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors cursor-pointer"
        onClick={() => onPlayerClick?.(fullPlayer ?? { name: p.playerName, internalId: p.playerId })}
      >
        <PlayerPortrait
          imgUrl={imgUrl}
          face={(fullPlayer as any)?.face}
          playerName={p.playerName}
          teamLogoUrl={team?.logoUrl}
          overallRating={fullPlayer?.overallRating}
          ratings={fullPlayer?.ratings}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate">{p.playerName}</div>
          <div className="text-[10px] text-slate-500 uppercase font-bold">{p.position} · {p.teamAbbrev}</div>
        </div>
        <span className="text-[9px] font-black text-amber-400/80 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full shrink-0">
          {allStarCount}×
        </span>
      </div>
    );
  };

  // ── Conference panel ─────────────────────────────────────────────────────────
  const ConfSection = ({ players, logo, label, isEast }: {
    players: any[]; logo: string; label: string; isEast: boolean;
  }) => {
    const starters = players.filter((p: any) => p.isStarter);
    const reserves = players.filter((p: any) => !p.isStarter);
    const confText   = isEast ? 'text-blue-400'      : 'text-red-400';
    const confBorder = isEast ? 'border-blue-500/20' : 'border-red-500/20';
    const confFrom   = isEast ? 'from-blue-950/20'   : 'from-red-950/20';

    return (
      <div className={`rounded-2xl border ${confBorder} bg-gradient-to-b ${confFrom} via-slate-900/80 to-slate-900 overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center gap-3 px-4 py-3 border-b ${confBorder}`}>
          <img src={logo} className="w-7 h-7 object-contain" alt={label} />
          <span className={`text-sm font-black uppercase tracking-wider ${confText}`}>{label}</span>
          <span className="ml-auto text-[10px] font-black text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">
            {players.length}
          </span>
        </div>

        {/* Starters */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Star size={9} className="text-amber-400 fill-amber-400" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/70">Starters</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {starters.map((p: any) => <StarterCard key={p.playerId} p={p} />)}
          </div>
        </div>

        {/* Reserves */}
        {reserves.length > 0 && (
          <div className="border-t border-slate-800/60">
            <div className="px-4 py-2.5 border-b border-slate-800/40">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Reserves</span>
            </div>
            {reserves.map((p: any) => <ReserveRow key={p.playerId} p={p} />)}
          </div>
        )}
      </div>
    );
  };

  const east = allStar.roster.filter((p: any) => p.conference === 'East');
  const west = allStar.roster.filter((p: any) => p.conference === 'West');

  const replacements = allStar.roster.filter((p: any) => p.isInjuryReplacement);
  const dnps         = allStar.roster.filter((p: any) => p.isInjuredDNP);

  return (
    <div className="space-y-8">

      {/* ── Game result or Watch prompt ───────────────────────────────────── */}
      {boxScore ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6">
            Sunday Night · Final Score
          </div>
          <div className="flex items-center justify-center gap-12 md:gap-24 mb-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                <img src={EAST_LOGO} className="w-8 h-8 object-contain" alt="East" />
              </div>
              <div className={`text-5xl font-black mb-1 ${boxScore.homeScore > boxScore.awayScore ? 'text-white' : 'text-slate-600'}`}>
                {boxScore.homeScore}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">East All-Stars</div>
            </div>
            <div className="text-4xl font-black text-slate-800">VS</div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
                <img src={WEST_LOGO} className="w-8 h-8 object-contain" alt="West" />
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
          <p className="text-slate-400 text-sm mb-6">The main event · East vs West</p>
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

      {/* ── East / West panels ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ConfSection players={east} logo={EAST_LOGO} label="Eastern Conference" isEast={true} />
        <ConfSection players={west} logo={WEST_LOGO} label="Western Conference" isEast={false} />
      </div>

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
                      <div className="text-xs font-bold text-slate-400 line-through truncate">{dnp.playerName}</div>
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
                          <div className="text-xs font-bold text-white truncate">{replacement.playerName}</div>
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
                      <div className="text-xs font-bold text-white truncate">{r.playerName}</div>
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
