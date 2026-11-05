import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { DraftSlot, DraftMode, OrdinaryDraftType, Player, getResolvedOvr } from '../types';
import { soundFx } from '../lib/audio';
import { TeamLogo, getTeamBranding } from '../lib/nbaBranding';
import { Trophy, ArrowRight, Flame, Sparkles, User } from 'lucide-react';

interface FinalRosterProps {
  slots: DraftSlot[];
  userTeam: {
    name: string;
    abbrev: string;
    players: Player[];
    slots: DraftSlot[];
  };
  draftMode: DraftMode | null;
  ordinaryDraftType?: OrdinaryDraftType | null;
  remainingBudget?: number;
  rosterSize: number;
  onContinue: () => void;
}

function PlayerHeadshot({ src, name, sizeClass = 'w-14 h-14' }: { src?: string; name: string; sizeClass?: string }) {
  const [hasError, setHasError] = useState(false);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-full object-cover border-2 border-slate-700 bg-slate-800 shadow-md shrink-0`}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    );
  }

  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '??';

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br from-slate-800 to-slate-950 border-2 border-slate-700 flex items-center justify-center text-slate-300 font-black tracking-wider font-mono shadow-md shrink-0`}
    >
      {initials}
    </div>
  );
}

function PlayerCard({ slot, variant }: { slot: DraftSlot; variant: 'starter' | 'bench' | 'deep' }) {
  const player = slot.player;
  const branding = player ? getTeamBranding(player.teamAbbrev) : null;
  const borderStyle = branding?.primaryColor ? { borderColor: branding.primaryColor } : {};

  if (!player) {
    return (
      <div className="border border-dashed border-slate-800 bg-slate-950/40 rounded-xl p-4 flex flex-col items-center justify-center min-h-[160px] text-center opacity-60">
        <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest px-2 py-0.5 bg-rose-500/10 rounded-full mb-2">
          {slot.slotPosition}
        </span>
        <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center text-slate-700 font-bold mb-2">
          <User className="w-6 h-6" />
        </div>
        <div className="text-xs font-bold text-slate-500 uppercase">UNFILLED</div>
        <div className="text-[10px] text-slate-600">0 OVR Penalty</div>
      </div>
    );
  }

  const pOvr = player.displayOvr ?? player.ovr;

  if (variant === 'starter') {
    return (
      <div
        className="relative bg-slate-900/90 border-2 rounded-xl p-4 flex flex-col justify-between items-center text-center shadow-lg hover:shadow-xl transition-all h-full"
        style={borderStyle}
      >
        {/* Header: Slot Badge & OVR */}
        <div className="w-full flex justify-between items-center mb-3">
          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 tracking-wider font-mono">
            {slot.slotPosition}
          </span>
          <span className="text-xl font-black font-mono text-amber-400 drop-shadow-sm">
            {pOvr}
          </span>
        </div>

        {/* Headshot */}
        <div className="my-2">
          <PlayerHeadshot src={player.headshotUrl} name={player.name} sizeClass="w-16 h-16 sm:w-20 sm:h-20" />
        </div>

        {/* Name & Team */}
        <div className="w-full mt-2">
          <h4 className="text-sm sm:text-base font-black text-white uppercase truncate tracking-wide" title={player.name}>
            {player.name}
          </h4>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-slate-400">
            <TeamLogo abbrev={player.teamAbbrev} sizeClass="w-4 h-4 shrink-0" />
            <span className="font-bold truncate max-w-[100px]">{player.teamAbbrev}</span>
            <span className="text-slate-600 font-black">•</span>
            <span className="font-bold">{player.position}</span>
          </div>
        </div>
      </div>
    );
  }

  // Bench and Deep Bench Card (Compact but contains portrait + logo + position + OVR)
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center gap-3 shadow-md hover:border-slate-700 transition-all">
      {/* Headshot */}
      <PlayerHeadshot src={player.headshotUrl} name={player.name} sizeClass="w-10 h-10" />

      {/* Info details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 justify-between">
          <span className="text-[9px] font-black font-mono text-slate-400 bg-slate-800 px-1 py-0.2 rounded shrink-0">
            {slot.slotPosition}
          </span>
          <span className="text-xs font-black font-mono text-amber-400 shrink-0">
            {pOvr}
          </span>
        </div>
        <h4 className="text-xs font-bold text-slate-200 truncate mt-0.5 uppercase" title={player.name}>
          {player.name}
        </h4>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
          <TeamLogo abbrev={player.teamAbbrev} sizeClass="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[55px]">{player.teamAbbrev}</span>
          <span className="text-slate-600">•</span>
          <span>{player.position}</span>
        </div>
      </div>
    </div>
  );
}

export const FinalRoster: React.FC<FinalRosterProps> = ({
  slots,
  userTeam,
  draftMode,
  ordinaryDraftType,
  remainingBudget,
  rosterSize,
  onContinue,
}) => {
  const starters = slots.slice(0, 5);
  const bench = slots.slice(5, 10);
  const deepBench = slots.slice(10);

  const getPlayerOvr = (p: Player | null) => (p ? getResolvedOvr(p) : 0);

  const filledStarters = starters.filter((s) => s.player !== null);
  const filledBench = bench.filter((b) => b.player !== null);
  const filledDeep = deepBench.filter((d) => d.player !== null);

  const starterSum = filledStarters.reduce((acc, s) => acc + getPlayerOvr(s.player), 0);
  const benchSum = filledBench.reduce((acc, b) => acc + getPlayerOvr(b.player), 0);
  const deepBenchSum = filledDeep.reduce((acc, d) => acc + getPlayerOvr(d.player), 0);

  const starterAvg = filledStarters.length > 0 ? starterSum / filledStarters.length : 0;
  const benchAvg = filledBench.length > 0 ? benchSum / filledBench.length : 0;
  const deepBenchAvg = filledDeep.length > 0 ? deepBenchSum / filledDeep.length : 0;

  let weightSum = 0;
  let weightedOvrSum = 0;

  if (filledStarters.length > 0) {
    weightSum += 0.50;
    weightedOvrSum += starterAvg * 0.50;
  }
  if (filledBench.length > 0) {
    weightSum += 0.35;
    weightedOvrSum += benchAvg * 0.35;
  }
  if (filledDeep.length > 0) {
    weightSum += 0.15;
    weightedOvrSum += deepBenchAvg * 0.15;
  }

  const teamOvr = weightSum > 0 ? Math.round(weightedOvrSum / weightSum) : 0;

  const totalPlayers = slots.filter((s) => s.player !== null).length;
  const avgStarterOvr = Math.round(starterAvg);

  const modeLabel =
    draftMode === 'BLIND_PACK'
      ? 'Blind Pack'
      : draftMode === 'BRIEFCASE'
      ? 'Briefcase'
      : draftMode === 'WHEEL_OF_TEAMS'
      ? 'Wheel of Teams'
      : draftMode === 'BUDGET'
      ? 'Budget Draft'
      : draftMode === 'ORDINARY'
      ? `Ordinary Draft (${ordinaryDraftType || 'Fixed'})`
      : 'Fantasy Draft';

  useEffect(() => {
    soundFx.playFinalFanfare();

    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.5 },
      colors: ['#f59e0b', '#3b82f6', '#10b981', '#ffffff'],
    });
  }, []);

  const playersOnly = slots.map((s) => s.player).filter((p): p is NonNullable<typeof p> => p !== null);
  const highestOvrPlayer =
    playersOnly.length > 0
      ? [...playersOnly].sort((a, b) => getResolvedOvr(b) - getResolvedOvr(a))[0]
      : null;
  const lowestOvrPlayer =
    playersOnly.length > 0
      ? [...playersOnly].sort((a, b) => getResolvedOvr(a) - getResolvedOvr(b))[0]
      : null;
  const avgRosterOvr =
    playersOnly.length > 0
      ? Math.round(playersOnly.reduce((acc, p) => acc + getResolvedOvr(p), 0) / playersOnly.length)
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/98 overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
      <div className="max-w-5xl w-full py-8 flex flex-col items-center">
        {/* Header Title */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <span className="text-amber-400 text-xs font-black tracking-widest uppercase px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full inline-flex items-center gap-1.5 mb-3">
            <Trophy className="w-4 h-4 text-amber-400 animate-pulse" /> DRAFT COMPLETED
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-wider uppercase drop-shadow-lg">
            YOUR TEAM IS READY
          </h1>
        </motion.div>

        {/* TEAM OVR & SUMMARY PANEL */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl"
        >
          {/* Left: Large Team OVR badge */}
          <div className="flex items-center gap-4 text-center md:text-left shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex flex-col items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 font-mono">
              <span className="text-4xl font-black leading-none">{teamOvr}</span>
              <span className="text-[10px] font-black uppercase tracking-widest mt-1">OVR</span>
            </div>
          </div>

          {/* Center: Fantasy team logo + team name + draft-complete status */}
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <TeamLogo abbrev={userTeam.abbrev} sizeClass="w-14 h-14 shrink-0" />
            <div>
              <div className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 justify-center sm:justify-start">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                Draft Complete
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide mt-0.5">
                {userTeam.name || 'Your Franchise'}
              </h2>
            </div>
          </div>

          {/* Right: Compact factual summary chips */}
          <div className="flex flex-wrap md:flex-col lg:flex-row gap-2 justify-center md:justify-end shrink-0 max-w-sm">
            <div className="px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Players</div>
              <div className="text-xs font-black text-white">{totalPlayers} / {rosterSize}</div>
            </div>
            <div className="px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Format</div>
              <div className="text-xs font-black text-white">{modeLabel}</div>
            </div>
            {draftMode === 'BUDGET' && (
              <div className="px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Leftover</div>
                <div className="text-xs font-black text-amber-400 font-mono">${remainingBudget ?? 0}</div>
              </div>
            )}
            <div className="px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Starters Avg</div>
              <div className="text-xs font-black text-amber-400 font-mono">{avgStarterOvr} OVR</div>
            </div>
          </div>
        </motion.div>

        {/* HERO STARTING LINEUP SECTION */}
        <div className="w-full mb-8">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" /> STARTING FIVE
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {starters.map((slot, idx) => (
              <motion.div
                key={slot.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
              >
                <PlayerCard slot={slot} variant="starter" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* BENCH SECTION */}
        <div className="w-full mb-8">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            BENCH ROTATION
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {bench.map((slot, idx) => (
              <motion.div
                key={slot.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + idx * 0.04 }}
              >
                <PlayerCard slot={slot} variant="bench" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* DEEP BENCH SECTION */}
        <div className="w-full mb-8">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            DEEP BENCH
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {deepBench.map((slot, idx) => (
              <motion.div
                key={slot.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + idx * 0.04 }}
              >
                <PlayerCard slot={slot} variant="deep" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* FACTUAL METRICS SECTION */}
        {playersOnly.length > 0 && (
          <div className="w-full mb-10 bg-slate-900/30 border border-slate-900 rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" /> ROSTER METRICS
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Highest OVR</div>
                  <div className="text-sm font-black text-white mt-1 truncate max-w-[180px]">{highestOvrPlayer?.name}</div>
                </div>
                <span className="text-lg font-mono font-black text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20 shrink-0">
                  {highestOvrPlayer ? getPlayerOvr(highestOvrPlayer) : '—'}
                </span>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Lowest OVR</div>
                  <div className="text-sm font-black text-white mt-1 truncate max-w-[180px]">{lowestOvrPlayer?.name}</div>
                </div>
                <span className="text-lg font-mono font-black text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded border border-slate-700/50 shrink-0">
                  {lowestOvrPlayer ? getPlayerOvr(lowestOvrPlayer) : '—'}
                </span>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Roster Average</div>
                  <div className="text-sm font-black text-white mt-1">{rosterSize}-Player Pool</div>
                </div>
                <span className="text-lg font-mono font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  {avgRosterOvr} OVR
                </span>
              </div>
            </div>
          </div>
        )}

        {/* BUTTON ACTIONS */}
        {/* STANDALONE FANTASY-DRAFT MINI-GAME FLOW.
            In this isolated prototype, the completed draft can show "DRAFT AGAIN"
            so the user can immediately replay the mini-game.

            WHEN WIRED INTO THE MAIN GAME:
            this Fantasy Draft is part of the game's real fantasy-draft setup flow.
            Replace the standalone "DRAFT AGAIN" completion action with the game's
            normal CONTINUE action and advance into the actual league/save using the
            newly drafted fantasy rosters.

            Do not duplicate the main game's navigation, save creation, or league
            initialization inside this standalone prototype. */}
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onContinue}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-black text-base uppercase tracking-wider shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" /> CONTINUE
          </motion.button>
        </div>
      </div>
    </div>
  );
};
