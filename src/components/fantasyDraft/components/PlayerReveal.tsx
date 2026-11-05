import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { CardOption, Player, DraftSlot, SlotPosition, getResolvedOvr } from '../types';
import { soundFx } from '../lib/audio';
import { getTeamBranding, TeamLogo } from '../lib/nbaBranding';
import { UserCheck, CheckCircle2, AlertCircle, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

interface PlayerRevealProps {
  selectedOption: CardOption;
  otherOptions: CardOption[];
  slots: DraftSlot[];
  onContinue: (player: Player) => void;
  isBriefcaseMode?: boolean;
}

type RevealPhase = 'CARD_FLIP' | 'RECAP_AND_CONTINUE';

// Helper component for player headshots with team logo badge
const PlayerAvatar: React.FC<{
  headshotUrl?: string;
  name: string;
  teamAbbrev?: string;
  sizeClass?: string;
  borderClass?: string;
  iconSizeClass?: string;
}> = ({
  headshotUrl,
  name,
  teamAbbrev,
  sizeClass = 'w-14 h-14',
  borderClass = 'border border-slate-700',
  iconSizeClass = 'w-6 h-6',
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative shrink-0">
      <div
        className={`relative ${sizeClass} rounded-full ${borderClass} overflow-hidden bg-slate-950 shrink-0 flex items-center justify-center shadow-md`}
      >
        {headshotUrl && !hasError ? (
          <img
            src={headshotUrl}
            alt={name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setHasError(true)}
          />
        ) : (
          <UserCheck className={`${iconSizeClass} text-slate-400`} />
        )}
      </div>

      {/* Team Logo Badge */}
      {teamAbbrev && (
        <div className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700 p-0.5 rounded-full shadow-lg">
          <TeamLogo abbrev={teamAbbrev} sizeClass="w-5 h-5" />
        </div>
      )}
    </div>
  );
};

// Reusable elegant PlayerCard component for different display contexts
const PlayerCard: React.FC<{
  player: Player;
  size: 'hero' | 'subdued' | 'compact';
}> = ({ player, size }) => {
  const branding = getTeamBranding(player.teamAbbrev);
  const isElite = getResolvedOvr(player) >= 90;
  const isStar = getResolvedOvr(player) >= 84;

  const isHero = size === 'hero';
  const isSubdued = size === 'subdued';
  const isCompact = size === 'compact';

  let borderColor = '#334155'; // border-slate-700
  let shadowStyle = {};

  if (isHero) {
    if (isElite) {
      borderColor = '#fbbf24'; // amber-400
      shadowStyle = { boxShadow: '0 20px 40px -8px rgba(251, 191, 36, 0.25)' };
    } else if (isStar) {
      borderColor = '#a78bfa'; // purple-400
      shadowStyle = { boxShadow: '0 20px 40px -8px rgba(167, 139, 250, 0.25)' };
    } else {
      borderColor = branding.primaryColor || '#1e293b';
      shadowStyle = { boxShadow: `0 20px 40px -8px ${borderColor}40` };
    }
  } else {
    borderColor = '#1e293b'; // subdued/compact dark borders
  }

  return (
    <div
      className={`relative rounded-2xl border-4 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col justify-between transition-all duration-500
        ${isHero ? 'w-64 sm:w-72 h-80 sm:h-96 p-5 sm:p-6 z-20 scale-100 ring-2 ring-emerald-500/10' : ''}
        ${isSubdued ? 'w-56 sm:w-60 h-72 sm:h-80 p-4 sm:p-5 z-10 opacity-40 grayscale hover:opacity-60' : ''}
        ${isCompact ? 'w-32 sm:w-36 h-44 sm:h-48 p-2.5 opacity-40 grayscale hover:opacity-60' : ''}
      `}
      style={{
        borderColor,
        ...shadowStyle,
      }}
    >
      {/* Card Header */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className={`text-[8px] font-black tracking-widest uppercase leading-none ${isHero ? 'text-slate-400' : 'text-slate-500'}`}>
            {player.displayPos || player.position}
          </span>
          {!isCompact && (
            <span className="text-[8px] text-slate-500 font-bold mt-1">
              {player.teamAbbrev}
            </span>
          )}
        </div>
      </div>

      {/* Player Image / Info */}
      <div className="flex flex-col items-center my-auto min-w-0">
        <PlayerAvatar
          headshotUrl={player.headshotUrl}
          name={player.name}
          teamAbbrev={player.teamAbbrev}
          sizeClass={
            isHero 
              ? "w-24 h-24 sm:w-28 sm:h-28" 
              : isSubdued 
              ? "w-18 h-18 sm:w-20 sm:h-20" 
              : "w-12 h-12"
          }
          borderClass={
            !isHero
              ? 'border border-slate-800'
              : isElite
              ? 'border-4 border-amber-400'
              : isStar
              ? 'border-4 border-purple-400'
              : 'border-2 border-slate-700'
          }
          iconSizeClass={isHero ? "w-10 h-10" : isSubdued ? "w-8 h-8" : "w-6 h-6"}
        />

        <h2 className={`font-black uppercase tracking-tight mt-2 text-center leading-none truncate w-full ${
          isHero ? 'text-sm sm:text-base text-white' : isSubdued ? 'text-xs text-slate-300' : 'text-[10px] text-slate-300'
        }`}>
          {player.name}
        </h2>
        {!isCompact && (
          <span className="text-[9px] font-semibold mt-0.5 text-center text-slate-500 truncate w-full">
            {player.teamName}
          </span>
        )}
      </div>

      {/* Rating Badge */}
      <div className="flex flex-col items-center justify-center border-t border-slate-800/80 pt-2 shrink-0">
        <span
          className={`font-black font-mono leading-none ${
            isHero 
              ? `text-2xl sm:text-3xl ${isElite ? 'text-amber-400' : isStar ? 'text-purple-400' : 'text-slate-200'}` 
              : isSubdued 
              ? 'text-xl sm:text-2xl text-slate-400'
              : 'text-lg text-slate-400'
          }`}
        >
          {getResolvedOvr(player)}
        </span>
        <span className="text-[7px] font-black uppercase tracking-widest mt-0.5 text-slate-500">
          OVR RATING
        </span>
      </div>
    </div>
  );
};

export const PlayerReveal: React.FC<PlayerRevealProps> = ({
  selectedOption,
  otherOptions,
  slots,
  onContinue,
  isBriefcaseMode = false,
}) => {
  const player = selectedOption.player;
  const branding = getTeamBranding(player.teamAbbrev);

  // Standalone reveal tiers use the canonical K2 display scale.
  const isElite = getResolvedOvr(player) >= 90;
  const isStar = getResolvedOvr(player) >= 84;

  const [phase, setPhase] = useState<RevealPhase>(isBriefcaseMode ? 'RECAP_AND_CONTINUE' : 'CARD_FLIP');
  const [isFlipped, setIsFlipped] = useState(isBriefcaseMode);
  const [animatedOvr, setAnimatedOvr] = useState(30);
  const [isOvrComplete, setIsOvrComplete] = useState(false);

  // Phase 1: Card Flip
  useEffect(() => {
    const flipTimer = setTimeout(() => {
      setIsFlipped(true);
      soundFx.playCardFlip();
    }, 500);

    return () => clearTimeout(flipTimer);
  }, []);

  // Phase 2: Sound & Confetti
  useEffect(() => {
    if (!isFlipped) return;

    const soundTimer = setTimeout(() => {
      if (isElite) {
        soundFx.playSuperPull();
        confetti({
          particleCount: 100,
          spread: 75,
          origin: { y: 0.6 },
          colors: [branding.primaryColor, branding.secondaryColor, '#f59e0b', '#ffffff'],
        });
      } else if (isStar) {
        confetti({
          particleCount: 45,
          spread: 50,
          origin: { y: 0.65 },
          colors: [branding.primaryColor, '#f59e0b', '#ffffff'],
        });
      }
    }, 600);

    return () => clearTimeout(soundTimer);
  }, [isFlipped, isElite, isStar, branding]);

  // Phase 3: Animate OVR counter
  useEffect(() => {
    if (!isFlipped) return;

    let current = Math.max(25, getResolvedOvr(player) - 12);
    const target = getResolvedOvr(player);
    setAnimatedOvr(current);

    const speed = isElite ? 35 : 22;
    const interval = setInterval(() => {
      current += 1;
      setAnimatedOvr(current);
      soundFx.playRatingTick();

      if (current >= target) {
        clearInterval(interval);
        setIsOvrComplete(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [isFlipped, getResolvedOvr(player), isElite]);

  const handleAddToTeamClick = () => {
    onContinue(player);
  };

  return (
    <div className="w-full flex flex-col items-center justify-center p-2 sm:p-4">
      {/* Simple Clean Header */}
      <div className="text-center mb-4">
        <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
          {phase === 'CARD_FLIP' ? 'MYSTERY REVEAL' : 'SELECTION RESOLVED'}
        </span>
        <h3 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter mt-1 italic">
          {phase === 'CARD_FLIP' ? (isBriefcaseMode ? 'CASE REVEAL' : 'PACK OPENING') : 'PLAYER REVEALED'}
        </h3>
      </div>

      <div className="relative w-full max-w-5xl flex flex-col items-center justify-center py-4">
        {/* The Card Tableau */}
        <div className="relative w-full flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 lg:gap-12 min-h-[400px]">
          
          {/* DESKTOP Left Side Card: Unselected Option 0 */}
          {phase === 'RECAP_AND_CONTINUE' && otherOptions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -60, scale: 0.8, rotate: -3 }}
              animate={{ opacity: 1, x: 0, scale: 1, rotate: -3 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="hidden md:block md:order-1"
            >
              <PlayerCard player={otherOptions[0].player} size="subdued" />
              <div className="text-center mt-2.5">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Missed Option</span>
              </div>
            </motion.div>
          )}

          {/* Center Card: The Selected Hero */}
          <div className="order-1 md:order-2 flex flex-col items-center z-20">
            {phase === 'RECAP_AND_CONTINUE' && (
              <div className="text-center mb-2.5">
                <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-wider">
                  YOUR PICK
                </span>
              </div>
            )}
            
            <div className="relative w-72 h-96 [perspective:1000px]">
              <motion.div
                className="w-full h-full relative [transform-style:preserve-3d] transition-all duration-700"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
              >
                {/* Front Side (Card Back visually) */}
                <div className="absolute inset-0 w-full h-full rounded-2xl border-2 border-slate-800 bg-slate-900 flex flex-col items-center justify-center p-6 shadow-2xl [backface-visibility:hidden]">
                  <div className="w-20 h-20 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800 mb-4 animate-pulse">
                    <Sparkles className="w-10 h-10 text-amber-500" />
                  </div>
                  <h3 className="text-sm font-black text-slate-400 tracking-widest uppercase">
                    {isBriefcaseMode ? 'UNWRAPPING CASE...' : 'OPENING PACK...'}
                  </h3>
                </div>

                {/* Back Side (Player Reveal Card) */}
                <div
                  className="absolute inset-0 w-full h-full rounded-2xl border-4 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col justify-between p-5 sm:p-6 shadow-2xl [transform:rotateY(180deg)] [backface-visibility:hidden]"
                  style={{
                    borderColor: isElite
                      ? '#fbbf24'
                      : isStar
                      ? '#a78bfa'
                      : branding.primaryColor || '#1e293b',
                    boxShadow: isElite
                      ? '0 25px 50px -12px rgba(251, 191, 36, 0.25)'
                      : isStar
                      ? '0 25px 50px -12px rgba(167, 139, 250, 0.25)'
                      : '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase leading-none">
                        {player.displayPos || player.position}
                      </span>
                      <span className="text-[8px] text-slate-500 font-bold mt-1">
                        {player.teamAbbrev}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <PlayerAvatar
                      headshotUrl={player.headshotUrl}
                      name={player.name}
                      teamAbbrev={player.teamAbbrev}
                      sizeClass="w-24 h-24 sm:w-28 sm:h-28"
                      borderClass={
                        isElite
                          ? 'border-4 border-amber-400'
                          : isStar
                          ? 'border-4 border-purple-400'
                          : 'border-2 border-slate-700'
                      }
                      iconSizeClass="w-12 h-12"
                    />
                    <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight mt-3 text-center leading-none">
                      {player.name}
                    </h2>
                    <span className="text-[10px] text-slate-400 font-semibold mt-1">
                      {player.teamName}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center border-t border-slate-800/80 pt-3">
                    <span
                      className={`text-3xl sm:text-4xl font-black font-mono leading-none ${
                        isElite ? 'text-amber-400' : isStar ? 'text-purple-400' : 'text-slate-200'
                      }`}
                    >
                      {animatedOvr}
                    </span>
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                      OVERALL RATING
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* DESKTOP Right Side Card: Unselected Option 1 */}
          {phase === 'RECAP_AND_CONTINUE' && otherOptions.length > 1 && (
            <motion.div
              initial={{ opacity: 0, x: 60, scale: 0.8, rotate: 3 }}
              animate={{ opacity: 1, x: 0, scale: 1, rotate: 3 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="hidden md:block md:order-3"
            >
              <PlayerCard player={otherOptions[1].player} size="subdued" />
              <div className="text-center mt-2.5">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Missed Option</span>
              </div>
            </motion.div>
          )}

        </div>

        {/* MOBILE Missed Cards Row (Beneath Hero Card) */}
        {phase === 'RECAP_AND_CONTINUE' && otherOptions.length > 0 && (
          <div className="flex md:hidden flex-row items-center justify-center gap-4 mt-8 w-full px-2">
            {otherOptions.map((opt) => (
              <motion.div
                key={opt.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center"
              >
                <PlayerCard player={opt.player} size="compact" />
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider mt-1.5">Missed</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* BUTTON ACTIONS */}
        <div className="w-full max-w-sm mt-8 flex flex-col items-center min-h-[60px]">
          <AnimatePresence mode="wait">
            {phase === 'CARD_FLIP' ? (
              isOvrComplete && (
                <motion.button
                  key="reveal-btn"
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                  onClick={() => setPhase('RECAP_AND_CONTINUE')}
                  className="w-full py-4 px-6 rounded-xl font-bold text-sm bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer shadow-lg shadow-amber-500/20 uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <span>REVEAL</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              )
            ) : (
              <motion.button
                key="next-pick-btn"
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddToTeamClick}
                className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base uppercase tracking-wider shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
              >
                <CheckCircle2 className="w-5 h-5" /> NEXT PICK
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
