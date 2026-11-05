import React from 'react';
import { BarChart3, ChevronRight, Sparkles, Star, Trophy } from 'lucide-react';
import type { Game, GameState, NBAPlayer } from '../../types';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { getPlayerImage } from '../central/view/bioCache';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';

interface AllStarFinalHeaderProps {
  allStar: NonNullable<GameState['allStar']>;
  state: GameState;
  onViewBoxScore: (game: Game) => void;
  showDanceResult?: boolean;
}

type Bracket = NonNullable<NonNullable<GameState['allStar']>['bracket']>;
type BracketTeam = Bracket['teams'][number];

interface FinalSide {
  captain?: NBAPlayer;
  captainName: string;
  isWinner: boolean;
  label: string;
  logoUrl?: string;
  score: number;
}

const bucketForTid = (tid: number): string => tid === -1 ? 'East' : tid === -2 ? 'West' : '';

const teamLabel = (label: string | undefined, fallback: string): string => {
  const normalized = String(label ?? '').trim();
  return normalized || fallback;
};

const CaptainPortrait: React.FC<{ logoUrl?: string; player?: NBAPlayer; name: string; winner: boolean }> = ({ logoUrl, player, name, winner }) => (
  <div className={`rounded-full bg-slate-950/80 p-1 shadow-[0_0_30px_rgba(168,85,247,0.28)] ${winner ? 'ring-2 ring-amber-300' : 'ring-2 ring-fuchsia-500'}`}>
    {player ? (
      <PlayerPortrait
        face={player.face}
        imgUrl={getPlayerImage(player) ?? undefined}
        playerName={name}
        size={78}
      />
    ) : (
      <div className="flex h-[78px] w-[78px] items-center justify-center overflow-hidden rounded-full border-2 border-slate-700 bg-slate-900">
        {logoUrl ? <img src={logoUrl} alt="" className="h-14 w-14 object-contain" /> : <Star size={34} className="fill-violet-300 text-violet-300" />}
      </div>
    )}
  </div>
);

const TeamScoreCard: React.FC<{ side: FinalSide }> = ({ side }) => (
  <div
    className={`relative min-w-0 overflow-hidden rounded-2xl border px-3 py-4 sm:px-5 sm:py-5 xl:px-7 ${
      side.isWinner
        ? 'border-amber-400/90 bg-gradient-to-br from-amber-500/20 via-[#071426]/95 to-[#071426] shadow-[0_0_32px_rgba(245,158,11,0.22)]'
        : 'border-fuchsia-500/70 bg-gradient-to-br from-fuchsia-600/15 via-[#100b2d]/95 to-[#090a22] shadow-[0_0_32px_rgba(168,85,247,0.18)]'
    }`}
  >
    {side.isWinner && (
      <div className="absolute left-0 top-0 z-10 flex items-center gap-1.5 rounded-br-xl bg-gradient-to-r from-amber-500 to-yellow-200 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-950 sm:text-[10px]">
        <Trophy size={12} /> Winner
      </div>
    )}
    <div className={`flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-4 ${side.isWinner ? 'pt-5 sm:pt-3' : ''}`}>
      <CaptainPortrait logoUrl={side.logoUrl} player={side.captain} name={side.captainName} winner={side.isWinner} />
      <div className="min-w-0 text-center sm:flex-1 sm:text-left">
        <div className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-slate-200 sm:text-xs xl:text-base">
          {side.label}
        </div>
        <div className={`mt-1 font-mono text-4xl font-black leading-none tracking-tighter sm:text-6xl xl:text-7xl ${side.isWinner ? 'text-white' : 'text-slate-200'}`}>
          {side.score}
        </div>
      </div>
    </div>
  </div>
);

export const AllStarFinalHeader: React.FC<AllStarFinalHeaderProps> = ({
  allStar,
  state,
  onViewBoxScore,
  showDanceResult = false,
}) => {
  const bracketFinal = allStar.bracket?.games.find(game => game.round === 'final')
    ?? allStar.bracket?.games.find(game => game.gid === allStar.allStarGameId);
  const scheduledFinal = state.schedule.find(game => game.gid === allStar.allStarGameId && game.isAllStar);
  const finalMeta = bracketFinal ?? scheduledFinal;
  if (!finalMeta) return null;

  const scheduledCandidates = state.schedule.filter(game => game.gid === finalMeta.gid && game.isAllStar);
  const game = scheduledCandidates.find(candidate =>
    candidate.homeTid === finalMeta.homeTid && candidate.awayTid === finalMeta.awayTid
  ) ?? scheduledCandidates.at(-1);
  const homeTeam = allStar.bracket?.teams.find(team => team.tid === finalMeta.homeTid);
  const awayTeam = allStar.bracket?.teams.find(team => team.tid === finalMeta.awayTid);
  const boxScore = game ? findBoxScoreForGame(state.boxScores, game.gid, game.date, {
    homeTid: game.homeTid,
    awayTid: game.awayTid,
    homeTeamName: homeTeam?.name,
    awayTeamName: awayTeam?.name,
  }) : undefined;
  const homeScore = boxScore?.homeScore ?? finalMeta.homeScore;
  const awayScore = boxScore?.awayScore ?? finalMeta.awayScore;
  const homeWon = boxScore ? didHomeTeamWin(boxScore) : didHomeTeamWin(finalMeta);

  const buildSide = (team: BracketTeam | undefined, meta: Pick<Game, 'homeTid' | 'awayTid'>, home: boolean): FinalSide => {
    const tid = home ? meta.homeTid : meta.awayTid;
    const bucket = bucketForTid(tid);
    const captainEntry = allStar.roster.find(entry => entry.isCaptain && entry.conference === bucket);
    const captain = captainEntry
      ? state.players.find(player => player.internalId === captainEntry.playerId)
      : undefined;
    return {
      captain,
      captainName: captainEntry?.playerName ?? team?.name?.replace(/^Team\s+/i, '') ?? 'All-Star Captain',
      isWinner: home ? homeWon : !homeWon,
      label: teamLabel(home ? boxScore?.homeTeamName : boxScore?.awayTeamName, team?.name ?? (home ? 'Team A' : 'Team B')),
      logoUrl: team?.logoUrl,
      score: home ? homeScore : awayScore,
    };
  };

  const homeSide = buildSide(homeTeam, finalMeta, true);
  const awaySide = buildSide(awayTeam, finalMeta, false);
  const [winner, runnerUp] = homeSide.isWinner ? [homeSide, awaySide] : [awaySide, homeSide];
  const mvpName = allStar.gameMvp?.name ?? bracketFinal?.mvpName;
  const mvpPlayerId = allStar.gameMvp?.playerId ?? bracketFinal?.mvpId;
  const mvpPlayer = state.players.find(player =>
    (mvpPlayerId && player.internalId === mvpPlayerId) || (!mvpPlayerId && player.name === mvpName)
  );
  const danceChampion = showDanceResult && allStar.danceContest?.complete
    ? allStar.danceContest.winnerLabel
    : undefined;

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-indigo-400/30 bg-[#030718] p-3 text-white shadow-[0_18px_70px_rgba(0,0,0,0.48)] sm:p-5 xl:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(168,85,247,0.22),transparent_30%),linear-gradient(135deg,rgba(30,64,175,0.08),transparent_45%,rgba(88,28,135,0.12))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />

      <div className="relative mb-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-amber-300 sm:mb-5 sm:text-xs">
        <div className="h-px w-6 bg-gradient-to-r from-transparent to-amber-400 sm:w-16" />
        <Star size={12} className="fill-current" />
        Sunday Night · Final Score
        <Star size={12} className="fill-current" />
        <div className="h-px w-6 bg-gradient-to-l from-transparent to-amber-400 sm:w-16" />
      </div>

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4 xl:gap-7">
        <TeamScoreCard side={winner} />
        <div className="flex flex-col items-center gap-2 sm:gap-3">
          <div className="bg-gradient-to-b from-yellow-100 via-amber-300 to-amber-700 bg-clip-text text-2xl font-black italic text-transparent drop-shadow-[0_0_12px_rgba(245,158,11,0.6)] sm:text-4xl xl:text-6xl">
            VS
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/50 bg-slate-950/70 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-amber-300 sm:text-[10px]">
            <Trophy size={11} /> Final
          </div>
        </div>
        <TeamScoreCard side={runnerUp} />
      </div>

      {game && (
        <div className="relative mt-3 flex flex-wrap justify-center gap-2 sm:mt-4">
          <button
            onClick={() => onViewBoxScore(game)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200/60 bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-600 px-5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_8px_24px_rgba(245,158,11,0.24)] transition hover:brightness-110 sm:px-7 sm:text-xs"
          >
            <BarChart3 size={15} /> View Box Score <ChevronRight size={15} />
          </button>
        </div>
      )}

      {(mvpName || danceChampion) && (
        <div className="relative mt-4 border-t border-indigo-400/25 pt-3 sm:mt-5 sm:pt-4">
          <div className="mb-3 flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.26em] text-amber-300 sm:text-[11px]">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/70" />
            All-Star Awards
            <Star size={10} className="fill-current" />
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-fuchsia-500/70" />
          </div>
          <div className={`grid gap-2 sm:gap-3 ${mvpName && danceChampion ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {mvpName && (
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-amber-400/45 bg-gradient-to-r from-amber-500/20 to-amber-950/25 px-3 py-3 sm:px-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300 sm:h-12 sm:w-12">
                  <Trophy size={24} />
                </div>
                <div className="min-w-0">
                  <div className="text-[8px] font-black uppercase tracking-[0.12em] text-amber-400 sm:text-[10px]">All-Star MVP</div>
                  <div className="truncate text-xs font-black text-white sm:text-lg">
                    {mvpPlayer ? <PlayerNameWithHover player={mvpPlayer}>{mvpName}</PlayerNameWithHover> : mvpName}
                  </div>
                </div>
              </div>
            )}
            {danceChampion && (
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-fuchsia-500/50 bg-gradient-to-r from-fuchsia-600/20 to-violet-950/35 px-3 py-3 sm:px-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-400/15 text-fuchsia-300 sm:h-12 sm:w-12">
                  <Sparkles size={25} />
                </div>
                <div className="min-w-0">
                  <div className="text-[8px] font-black uppercase tracking-[0.12em] text-fuchsia-400 sm:text-[10px]">Dance Champions</div>
                  <div className="truncate text-xs font-black text-white sm:text-lg">{danceChampion}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
