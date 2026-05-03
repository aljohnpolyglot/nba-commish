import React, { useMemo } from 'react';
import { Crown, Sparkles, Skull, ChevronRight, Trophy, Megaphone, Vote } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { getPlayerImage } from '../central/view/bioCache';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { parseGameDate } from '../../utils/dateUtils';

interface ThroneContestViewProps {
  allStar: any;
  players: any[];
  ownTid?: number | null;
}

const BLOC_COLORS = {
  fan:    { stop1: '#f43f5e', stop2: '#fb7185', label: 'FAN',    pct: 40, glow: 'shadow-rose-500/50' },
  player: { stop1: '#a855f7', stop2: '#c084fc', label: 'PLAYER', pct: 30, glow: 'shadow-purple-500/50' },
  media:  { stop1: '#06b6d4', stop2: '#22d3ee', label: 'MEDIA',  pct: 20, glow: 'shadow-cyan-500/50' },
  coach:  { stop1: '#facc15', stop2: '#fde047', label: 'COACH',  pct: 10, glow: 'shadow-yellow-500/50' },
};

const BlocBar: React.FC<{ value: number; color: keyof typeof BLOC_COLORS; max?: number }> = ({ value, color, max = 100 }) => {
  const c = BLOC_COLORS[color];
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[8px] font-black tracking-widest text-zinc-500">{c.label}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-900 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.0, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${c.stop1}, ${c.stop2})` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[10px] font-bold text-white">{value}</span>
    </div>
  );
};

const VoterPie: React.FC = () => (
  <div className="flex items-center justify-center flex-wrap gap-2 mb-6 text-[9px] font-black uppercase tracking-widest">
    <span className="px-2 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">Fan 40%</span>
    <span className="px-2 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">Player 30%</span>
    <span className="px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Media 20%</span>
    <span className="px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">Coach 10%</span>
  </div>
);

const HeroHeader: React.FC<{ phaseLabel: string; sub: string }> = ({ phaseLabel, sub }) => (
  <div className="relative overflow-hidden rounded-3xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 via-amber-900/5 to-black px-8 py-8">
    <div className="absolute inset-0 opacity-20 pointer-events-none">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-yellow-500 rounded-full blur-[150px]" />
    </div>
    <div className="relative text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-yellow-400" />
        <span className="text-[10px] font-black tracking-[0.4em] text-yellow-400">{phaseLabel}</span>
        <Sparkles className="w-4 h-4 text-yellow-400" />
      </div>
      <h2 className="text-5xl font-black italic tracking-tighter text-white mb-2">THE THRONE</h2>
      <p className="text-sm text-zinc-400 max-w-xl mx-auto">{sub}</p>
    </div>
  </div>
);

const KingCallout: React.FC<{ king: any; vacated: boolean }> = ({ king, vacated }) => {
  if (!king) return null;
  const kingPortrait = getPlayerImage(king);
  if (vacated) {
    return (
      <div className="rounded-2xl border-2 border-red-500/40 bg-red-950/20 p-6 flex items-center gap-4">
        <Skull className="w-8 h-8 text-red-400 shrink-0" />
        <div>
          <p className="text-[10px] font-black tracking-widest text-red-300 mb-1">THRONE VACATED</p>
          <p className="text-sm text-zinc-300">
            <PlayerNameWithHover player={king}>{king.name}</PlayerNameWithHover> cannot defend.
            The crown is up for grabs — anyone in the field of 16 can claim it.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent p-5 flex items-center gap-5">
      <div className="relative shrink-0">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4)]">
          {kingPortrait ? (
            <img src={kingPortrait} alt={king.name} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-black">
              {king.name.split(' ').map((n: string) => n[0]).join('')}
            </div>
          )}
        </div>
        <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black tracking-[0.3em] text-yellow-400 mb-1">MANDATORY TITLE DEFENSE</p>
        <p className="text-base font-black text-white">
          <PlayerNameWithHover player={king}>{king.name}</PlayerNameWithHover> returns as the #1 seed.
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">Auto-included in the field. Everyone else is gunning for the crown.</p>
      </div>
    </div>
  );
};

export const ThroneContestView: React.FC<ThroneContestViewProps> = ({ allStar, players, ownTid }) => {
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

    const matchesByRound: Record<number, any[]> = {};
    (throne.bracket ?? []).forEach((m: any) => {
      matchesByRound[m.round] = matchesByRound[m.round] ?? [];
      matchesByRound[m.round].push(m);
    });
    const rounds = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
    const roundLabels: Record<number, string> = { 1: 'Round of 16', 2: 'Quarterfinals', 3: 'Semifinals', 4: 'The Final' };

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
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}>
            {rounds.map(r => (
              <div key={r} className="space-y-2">
                <p className="text-[9px] font-black tracking-widest text-zinc-500 uppercase mb-2">{roundLabels[r] ?? `Round ${r}`}</p>
                {matchesByRound[r].map((m: any, idx: number) => {
                  const p1 = players.find(p => p.internalId === m.player1Id);
                  const p2 = players.find(p => p.internalId === m.player2Id);
                  const p1Win = m.winnerId === m.player1Id;
                  return (
                    <div key={idx} className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                      <div className={`flex items-center justify-between px-3 py-2 ${p1Win ? 'bg-yellow-500/5' : ''}`}>
                        <span className={`text-[11px] font-bold truncate ${p1Win ? 'text-yellow-300' : 'text-zinc-500 line-through'}`}>{p1?.name ?? m.player1Id}</span>
                        <span className={`text-[11px] font-mono font-black ${p1Win ? 'text-yellow-300' : 'text-zinc-600'}`}>{m.score1}</span>
                      </div>
                      <div className={`flex items-center justify-between px-3 py-2 border-t border-zinc-800 ${!p1Win ? 'bg-yellow-500/5' : ''}`}>
                        <span className={`text-[11px] font-bold truncate ${!p1Win ? 'text-yellow-300' : 'text-zinc-500 line-through'}`}>{p2?.name ?? m.player2Id}</span>
                        <span className={`text-[11px] font-mono font-black ${!p1Win ? 'text-yellow-300' : 'text-zinc-600'}`}>{m.score2}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────
  // PHASE 4 — FIELD LOCKED (Jan 30 → Saturday)
  // ─────────────────────────────────────
  if (isFieldLocked && throne) {
    const voteRows = fieldIds
      .map(id => ({
        playerId: id,
        rank: throne.voteBreakdown?.[id]?.rank ?? 0,
        fan: throne.voteBreakdown?.[id]?.fan ?? 0,
        player: throne.voteBreakdown?.[id]?.player ?? 0,
        media: throne.voteBreakdown?.[id]?.media ?? 0,
        coach: throne.voteBreakdown?.[id]?.coach ?? 0,
        composite: throne.voteBreakdown?.[id]?.composite ?? 0,
      }))
      .sort((a, b) => a.rank - b.rank);

    return (
      <div className="space-y-8">
        <HeroHeader
          phaseLabel="FIELD LOCKED · TIPS OFF SATURDAY"
          sub="16 players · Single-elimination · First to 12 (win-by-2) · 7-second shot clock"
        />
        {beltHolderPlayer && <KingCallout king={beltHolderPlayer} vacated={isVacated} />}
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3 flex items-center gap-2">
            <Crown size={12} className="text-yellow-400" /> Final Composite Vote
          </h3>
          <VoterPie />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {voteRows.map((row, idx) => {
            const player = players.find(p => p.internalId === row.playerId);
            if (!player) return null;
            const isOwn = ownTid !== null && ownTid !== undefined && player.tid === ownTid;
            const isDefender = row.playerId === titleDefenderId;
            const portrait = getPlayerImage(player);
            const team = teams.find(t => t.id === player.tid);
            return (
              <motion.div
                key={row.playerId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.4 }}
                className={`relative rounded-2xl border p-4 ${
                  isDefender
                    ? 'bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-zinc-950 border-yellow-500/40 shadow-[0_0_30px_rgba(250,204,21,0.15)]'
                    : isOwn
                      ? 'bg-indigo-500/5 border-indigo-500/40'
                      : 'bg-zinc-900/60 border-zinc-800'
                }`}
              >
                <div className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono font-black text-[10px] text-white">{row.rank}</div>
                {isDefender && (
                  <div className="absolute -top-2 right-3 bg-gradient-to-r from-yellow-500 to-amber-400 text-black text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Crown size={9} /> DEFENDER
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-full overflow-hidden bg-zinc-800 shrink-0 ${isDefender ? 'border-2 border-yellow-400' : 'border border-white/10'}`}>
                    {portrait ? <img src={portrait} alt={player.name} className="w-full h-full object-cover object-top" /> : <div className="w-full h-full flex items-center justify-center text-zinc-500 font-black text-sm">{player.name.split(' ').map((n: string) => n[0]).join('')}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-black truncate ${isDefender ? 'text-yellow-200' : 'text-white'}`}><PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover></p>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{player.pos} · {team?.abbrev ?? ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[8px] font-black tracking-widest text-zinc-500">VOTE</p>
                    <p className="text-2xl font-mono font-black text-white tabular-nums">{row.composite}</p>
                  </div>
                </div>
                <div className="space-y-1.5 pt-3 border-t border-zinc-800/60">
                  <BlocBar value={row.fan} color="fan" />
                  <BlocBar value={row.player} color="player" />
                  <BlocBar value={row.media} color="media" />
                  <BlocBar value={row.coach} color="coach" />
                </div>
              </motion.div>
            );
          })}
        </div>
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
    tallyEntries.sort((a, b) => b[1].composite - a[1].composite);
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

        {/* Live leaderboard — top 16 */}
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
            <ChevronRight size={12} /> Currently In · Top 16
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <AnimatePresence>
              {top16.map(([pid, t], idx) => {
                const player = players.find(p => p.internalId === pid);
                if (!player) return null;
                const team = teams.find(tt => tt.id === player.tid);
                const isDefender = pid === titleDefenderId;
                const portrait = getPlayerImage(player);
                return (
                  <motion.div
                    key={pid}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className={`rounded-xl border p-3 flex items-center gap-3 ${
                      isDefender
                        ? 'bg-yellow-500/10 border-yellow-500/40'
                        : 'bg-emerald-500/5 border-emerald-500/20'
                    }`}
                  >
                    <span className="w-6 text-center font-mono font-black text-[11px] text-zinc-400 shrink-0">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                      {portrait ? <img src={portrait} alt={player.name} className="w-full h-full object-cover object-top" /> : <div className="w-full h-full flex items-center justify-center text-zinc-500 font-black text-[10px]">{player.name.split(' ').map((n: string) => n[0]).join('')}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${isDefender ? 'text-yellow-200' : 'text-white'}`}>
                        {isDefender && <Crown size={10} className="inline mr-1 text-yellow-400" />}
                        <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
                      </p>
                      <p className="text-[9px] text-zinc-500 uppercase tracking-widest">{player.pos} · {team?.abbrev ?? ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-mono font-black text-white tabular-nums">{t.composite}</p>
                      <p className="text-[8px] text-zinc-500 tracking-wider">VOTES</p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
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
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-yellow-400/10 flex items-center justify-center mb-6 border border-yellow-400/30">
        <Crown className="w-8 h-8 text-yellow-400" />
      </div>
      <h3 className="text-3xl font-black italic tracking-tighter text-white mb-2">THE THRONE</h3>
      <p className="text-sm text-zinc-500 max-w-md mb-6">
        A 16-player single-elimination 1v1 tournament. Sign-ups open December 1. Composite vote (40% fan / 30% player / 20% media / 10% coach) selects the field of 16 on January 30. Tournament tips off All-Star Saturday.
      </p>
      {beltHolderPlayer && (
        <div className="mt-2">
          <KingCallout king={beltHolderPlayer} vacated={false} />
        </div>
      )}
    </div>
  );
};
