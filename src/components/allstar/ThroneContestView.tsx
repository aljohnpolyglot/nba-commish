import React, { useMemo } from 'react';
import { Crown, Sparkles, Skull, ChevronRight, Trophy, Megaphone, Vote, Play, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { getPlayerImage } from '../central/view/bioCache';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { TournamentBracket } from '../../throne/components/TheThroneGame/Bracket';
import { toThronePlayer } from '../../services/allStar/throneOrchestrator';
import type { Match as ThroneMatch } from '../../throne/types/throne';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { parseGameDate } from '../../utils/dateUtils';
import { HeroHeader, KingCallout, type VoteRowData, VoteTable, VoterPie } from './ThroneContestViewShared';

interface ThroneContestViewProps {
  allStar: any;
  players: any[];
  ownTid?: number | null;
  onWatch?: () => void;
  isSimulating?: boolean;
}

export const ThroneContestView: React.FC<ThroneContestViewProps> = ({ allStar, players, ownTid, onWatch, isSimulating }) => {
  const { state } = useGame();
  const teams = state.teams;
  const dates = getAllStarWeekendDates(state.leagueStats.year);
  const currentDate = parseGameDate(state.date);

  const throne = allStar?.throne;
  const fieldIds: string[] = throne?.fieldPlayerIds ?? [];
  const titleDefenderId: string | null = throne?.titleDefenderId ?? allStar?.beltHolderInternalId ?? null;
  const beltHolderId: string | null = allStar?.beltHolderInternalId ?? null;
  const isVacated = !!allStar?.throneVacated;
  const beltHolderPlayer = beltHolderId ? players.find(p => p.internalId === beltHolderId) : null;

  // PHASE DETERMINATION
  const isComplete = !!throne?.complete;
  const isFieldLocked = !!allStar?.throneAnnounced;
  const signupSchedule: Array<{ playerId: string; date: string }> = allStar?.throneSignupSchedule ?? [];
  const inSignupEra = currentDate >= dates.throneSignupOpens && currentDate < dates.throneVotingOpens;
  const inVotingEra = currentDate >= dates.throneVotingOpens && currentDate < dates.throneFieldReveal;

  // ─────────────────────────────────────
  // PHASE 5 — POST-TOURNAMENT (champion + bracket)
  // ─────────────────────────────────────
  if (isComplete && throne.champion) {
    const champPlayer = players.find(p => p.internalId === throne.champion.playerId);
    const champPortrait = champPlayer ? getPlayerImage(champPlayer) : null;
    const totalPD = throne.cumulativePDs?.[throne.champion.playerId] ?? 0;

    // Adapt persisted BracketMatch → ThroneMatch (the shape TournamentBracket expects).
    // Each persisted match has player1Id/player2Id/winnerId; resolve to Player objects.
    const findThronePlayer = (id: string, seed: number) => {
      const np = players.find(p => p.internalId === id);
      return np ? toThronePlayer(np, seed) : null;
    };
    const throneMatches: ThroneMatch[] = (throne.bracket ?? []).map((m: any, idx: number) => {
      const p1 = findThronePlayer(m.player1Id, idx * 2 + 1);
      const p2 = findThronePlayer(m.player2Id, idx * 2 + 2);
      const winner = m.winnerId
        ? (m.winnerId === m.player1Id ? p1 : m.winnerId === m.player2Id ? p2 : null)
        : null;
      return {
        id: `${m.round}-${idx}`,
        round: m.round,
        player1: p1,
        player2: p2,
        winner,
        score1: m.score1 ?? 0,
        score2: m.score2 ?? 0,
      };
    });

    return (
      <div className="space-y-10">
        <div className="relative overflow-hidden rounded-3xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-zinc-950 px-8 py-10">
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-80 h-80 bg-yellow-500 rounded-full blur-[120px]" />
            <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-amber-500 rounded-full blur-[120px]" />
          </div>
          <div className="relative flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-5 h-5 text-yellow-400 animate-pulse" />
              <span className="text-[10px] font-black tracking-[0.3em] text-yellow-400">KING OF 1V1</span>
              <Crown className="w-5 h-5 text-yellow-400 animate-pulse" />
            </div>
            <div className="relative mb-4">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-yellow-400 shadow-[0_0_60px_rgba(250,204,21,0.5)]">
                {champPortrait ? (
                  <img src={champPortrait} alt={throne.champion.playerName} className="w-full h-full object-cover object-top" />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-black text-3xl">
                    {throne.champion.playerName.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-amber-400 text-black text-[10px] font-black px-4 py-1 rounded-full whitespace-nowrap shadow-lg">
                THE THRONE
              </div>
            </div>
            <h2 className="text-4xl font-black italic tracking-tighter text-white mt-4">
              {champPlayer ? <PlayerNameWithHover player={champPlayer}>{throne.champion.playerName}</PlayerNameWithHover> : throne.champion.playerName}
            </h2>
            <p className="text-xs text-yellow-400/80 mt-1 mb-4 tracking-wider font-bold">CHAMPION · CUMULATIVE PD +{totalPD}</p>
            <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              <span>$5M Prize</span>
              <span className="w-1 h-1 rounded-full bg-zinc-600" />
              <span>King of 1v1</span>
              <span className="w-1 h-1 rounded-full bg-zinc-600" />
              <span>Defends Next Year</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <Trophy size={14} className="text-yellow-400" /> Bracket Recap
          </h3>
          <TournamentBracket matches={throneMatches} currentMatchIndex={-1} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────
  // PHASE 4 — FIELD LOCKED (Jan 30 → Saturday)
  // ─────────────────────────────────────
  if (isFieldLocked && throne) {
    const isSaturdayOrLater = currentDate >= dates.saturday;
    const voteRows: VoteRowData[] = fieldIds
      .map(id => {
        const b = throne.voteBreakdown?.[id] ?? {};
        return {
          playerId: id,
          rank: b.rank ?? 0,
          composite: b.composite ?? 0,
          fanVotes:    b.fanVotes    ?? 0, fanRank:    b.fanRank    ?? 0,
          playerVotes: b.playerVotes ?? 0, playerRank: b.playerRank ?? 0,
          mediaVotes:  b.mediaVotes  ?? 0, mediaRank:  b.mediaRank  ?? 0,
          coachVotes:  b.coachVotes  ?? 0, coachRank:  b.coachRank  ?? 0,
        };
      })
      .sort((a, b) => a.rank - b.rank);

    return (
      <div className="space-y-8">
        <HeroHeader
          phaseLabel="FIELD LOCKED · TIPS OFF SATURDAY"
          sub="16 players · Single-elimination · First to 12 (win-by-2) · 7-second shot clock"
        />
        {isSaturdayOrLater && onWatch && (
          <div className="flex justify-center">
            <button
              onClick={onWatch}
              disabled={isSimulating}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-black font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSimulating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Simulating Tournament…
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  Watch The Throne
                </>
              )}
            </button>
          </div>
        )}
        {beltHolderPlayer && <KingCallout king={beltHolderPlayer} vacated={isVacated} />}
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3 flex items-center gap-2">
            <Crown size={12} className="text-yellow-400" /> Final Composite Vote
          </h3>
          <VoterPie />
        </div>
        <VoteTable
          rows={voteRows}
          players={players}
          teams={teams}
          titleDefenderId={titleDefenderId}
          ownTid={ownTid}
        />
      </div>
    );
  }

  // ─────────────────────────────────────
  // PHASE 3 — VOTING ERA (Jan 16 → Jan 30)
  // ─────────────────────────────────────
  if (inVotingEra) {
    const tally = allStar?.throneVoteTally ?? {};
    const progress = allStar?.throneVotingProgress ?? 0;
    const pctDone = Math.round(progress * 100);

    const tallyEntries = Object.entries(tally) as Array<[string, any]>;
    // Composite is weighted-RANK-average — lower is better. Recompute on the fly
    // from per-bloc ranks so stale legacy data (which stored weighted scores) heals.
    const liveComposite = (t: any) =>
      0.4 * (t.fanRank ?? 999) + 0.3 * (t.playerRank ?? 999)
      + 0.2 * (t.mediaRank ?? 999) + 0.1 * (t.coachRank ?? 999);
    tallyEntries.sort((a, b) => liveComposite(a[1]) - liveComposite(b[1]));
    const top16 = tallyEntries.slice(0, 16);
    const onTheBubble = tallyEntries.slice(16, 22);

    return (
      <div className="space-y-8">
        <HeroHeader
          phaseLabel="COMPOSITE VOTE · LIVE TALLY"
          sub={`Voting closes January 30 · field of 16 locked at close`}
        />

        {/* Voting progress bar */}
        <div className="rounded-2xl border border-yellow-500/20 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Vote className="w-4 h-4 text-yellow-400" />
              <span className="text-[10px] font-black tracking-widest text-yellow-400">VOTING IN PROGRESS</span>
            </div>
            <span className="text-xs font-mono font-black text-white">{pctDone}%</span>
          </div>
          <div className="h-3 rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
            <motion.div
              className="h-full bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.6)]"
              initial={{ width: 0 }}
              animate={{ width: `${pctDone}%` }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 mt-2 text-center">Standings shift daily as ballots come in. Top 16 lock on January 30.</p>
        </div>

        {beltHolderPlayer && <KingCallout king={beltHolderPlayer} vacated={isVacated} />}
        <VoterPie />

        {/* Live leaderboard — top 16 (MVP-style table) */}
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
            <ChevronRight size={12} /> Currently In · Top 16
          </h3>
          <VoteTable
            rows={top16.map(([pid, t], idx) => ({
              playerId: pid,
              rank: idx + 1,
              composite: t.composite ?? 0,
              fanVotes: t.fanVotes ?? 0, fanRank: t.fanRank ?? 0,
              playerVotes: t.playerVotes ?? 0, playerRank: t.playerRank ?? 0,
              mediaVotes: t.mediaVotes ?? 0, mediaRank: t.mediaRank ?? 0,
              coachVotes: t.coachVotes ?? 0, coachRank: t.coachRank ?? 0,
            }))}
            players={players}
            teams={teams}
            titleDefenderId={titleDefenderId}
            ownTid={ownTid}
          />
        </div>

        {/* On the bubble */}
        {onTheBubble.length > 0 && (
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">
              <ChevronRight size={12} /> On The Bubble
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
              {onTheBubble.map(([pid, t], idx) => {
                const player = players.find(p => p.internalId === pid);
                if (!player) return null;
                const team = teams.find(tt => tt.id === player.tid);
                return (
                  <div key={pid} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2 flex items-center gap-2">
                    <span className="w-6 text-center font-mono text-[10px] text-zinc-600 shrink-0">{17 + idx}</span>
                    <span className="flex-1 text-[11px] text-zinc-400 truncate"><PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover> · <span className="text-zinc-600">{team?.abbrev ?? ''}</span></span>
                    <span className="text-[11px] font-mono font-bold text-zinc-500">{t.composite}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────
  // PHASE 2 — SIGN-UP ERA (Dec 1 → Jan 15)
  // ─────────────────────────────────────
  if (inSignupEra && signupSchedule.length > 0) {
    const todayIso = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`;
    const visible = signupSchedule.filter(s => s.date <= todayIso);
    const total = signupSchedule.length;
    const totalDays = Math.max(1, Math.floor((dates.throneVotingOpens.getTime() - dates.throneSignupOpens.getTime()) / (1000 * 60 * 60 * 24)));
    const elapsedDays = Math.max(0, Math.floor((currentDate.getTime() - dates.throneSignupOpens.getTime()) / (1000 * 60 * 60 * 24)));
    const pct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    // Most-recent signups (last 8)
    const recent = [...visible].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

    return (
      <div className="space-y-8">
        <HeroHeader
          phaseLabel="SIGN-UPS LIVE · CLOSES JAN 15"
          sub="Players are declaring for the 1v1 tournament. The defending king is auto-included."
        />

        {/* Big counter */}
        <div className="rounded-3xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 via-zinc-950 to-zinc-950 p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Megaphone className="w-4 h-4 text-yellow-400" />
            <span className="text-[10px] font-black tracking-[0.3em] text-yellow-400">SIGNED UP</span>
          </div>
          <motion.p
            key={visible.length}
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-7xl font-black tabular-nums text-white tracking-tight"
          >
            {visible.length}
          </motion.p>
          <p className="text-xs text-zinc-500 mt-2 tracking-wider font-bold">PLAYERS DECLARED</p>
          <div className="mt-6 max-w-md mx-auto">
            <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1.0, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-yellow-500 to-amber-400"
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-2 tracking-widest">SIGN-UP WINDOW · {pct}%</p>
          </div>
        </div>

        {beltHolderPlayer && <KingCallout king={beltHolderPlayer} vacated={isVacated} />}

        {/* Latest sign-ups */}
        {recent.length > 0 && (
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3 flex items-center gap-2">
              <ChevronRight size={12} className="text-yellow-400" /> Latest Declarations
            </h3>
            <div className="space-y-2">
              <AnimatePresence>
                {recent.map(s => {
                  const player = players.find(p => p.internalId === s.playerId);
                  if (!player) return null;
                  const team = teams.find(t => t.id === player.tid);
                  const portrait = getPlayerImage(player);
                  const isKing = s.playerId === beltHolderId;
                  const fmtDate = new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  return (
                    <motion.div
                      key={s.playerId}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`rounded-xl border p-3 flex items-center gap-3 ${
                        isKing
                          ? 'bg-yellow-500/10 border-yellow-500/40'
                          : 'bg-zinc-900/60 border-zinc-800'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0 ${isKing ? 'border-2 border-yellow-400' : ''}`}>
                        {portrait ? <img src={portrait} alt={player.name} className="w-full h-full object-cover object-top" /> : <div className="w-full h-full flex items-center justify-center text-zinc-500 font-black text-xs">{player.name.split(' ').map((n: string) => n[0]).join('')}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${isKing ? 'text-yellow-200' : 'text-white'}`}>
                          {isKing && <Crown size={11} className="inline mr-1 text-yellow-400" />}
                          <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
                        </p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{player.pos} · {team?.abbrev ?? ''}</p>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-600 shrink-0">{fmtDate}</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {visible.length > recent.length && (
              <p className="text-[10px] text-zinc-600 text-center mt-3 italic">
                +{visible.length - recent.length} more declarations · full field locks Jan 30
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest text-zinc-600 uppercase pt-4">
          <span>Composite vote opens Jan 16</span>
          <ChevronRight size={10} />
          <span>Field of 16 revealed Jan 30</span>
          <ChevronRight size={10} />
          <span>Tournament Saturday · {dates.saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>

        {void total}
      </div>
    );
  }

  // ─────────────────────────────────────
  // PHASE 1 — PRE-SIGNUP (before Dec 1)
  // ─────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-yellow-400/10 flex items-center justify-center mb-6 border border-yellow-400/30">
        <Crown className="w-8 h-8 text-yellow-400" />
      </div>
      <h3 className="text-3xl font-black italic tracking-tighter text-white mb-3">THE THRONE</h3>
      <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
        A 16-player single-elimination 1v1 tournament held on All-Star Saturday.
      </p>

      <div className="w-full max-w-md text-left mb-8">
        <p className="text-[10px] font-black tracking-[0.3em] text-yellow-400/80 mb-3 text-center">SCHEDULE</p>
        <ul className="space-y-2.5">
          <li className="flex items-start gap-3 rounded-xl bg-zinc-900/40 border border-zinc-800 px-4 py-3">
            <span className="text-[10px] font-mono font-black text-yellow-400 shrink-0 mt-0.5 tracking-wider">DEC 1</span>
            <span className="text-xs text-zinc-300">Sign-ups open</span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-zinc-900/40 border border-zinc-800 px-4 py-3">
            <span className="text-[10px] font-mono font-black text-yellow-400 shrink-0 mt-0.5 tracking-wider">JAN 16</span>
            <span className="text-xs text-zinc-300">Composite voting opens</span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-zinc-900/40 border border-zinc-800 px-4 py-3">
            <span className="text-[10px] font-mono font-black text-yellow-400 shrink-0 mt-0.5 tracking-wider">JAN 30</span>
            <span className="text-xs text-zinc-300">Field of 16 revealed</span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-yellow-500/5 border border-yellow-500/30 px-4 py-3">
            <span className="text-[10px] font-mono font-black text-yellow-300 shrink-0 mt-0.5 tracking-wider">SAT</span>
            <span className="text-xs text-yellow-100 font-bold">Tournament tips off</span>
          </li>
        </ul>
      </div>

      <div className="w-full max-w-md mb-8">
        <p className="text-[10px] font-black tracking-[0.3em] text-yellow-400/80 mb-3 text-center">COMPOSITE VOTE</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-3 text-center">
            <p className="text-2xl font-black font-mono text-rose-300 leading-none mb-1">40%</p>
            <p className="text-[9px] font-black tracking-widest text-rose-400/80">FAN</p>
          </div>
          <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 px-3 py-3 text-center">
            <p className="text-2xl font-black font-mono text-purple-300 leading-none mb-1">30%</p>
            <p className="text-[9px] font-black tracking-widest text-purple-400/80">PLAYER</p>
          </div>
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 px-3 py-3 text-center">
            <p className="text-2xl font-black font-mono text-cyan-300 leading-none mb-1">20%</p>
            <p className="text-[9px] font-black tracking-widest text-cyan-400/80">MEDIA</p>
          </div>
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-3 py-3 text-center">
            <p className="text-2xl font-black font-mono text-yellow-300 leading-none mb-1">10%</p>
            <p className="text-[9px] font-black tracking-widest text-yellow-400/80">COACH</p>
          </div>
        </div>
      </div>

      {beltHolderPlayer && (
        <div className="w-full max-w-md">
          <KingCallout king={beltHolderPlayer} vacated={false} />
        </div>
      )}
    </div>
  );
};
