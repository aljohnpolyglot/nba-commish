import React, { useState, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import {
  Star, Globe, Music, Trophy, Zap,
  Clock, CheckCircle, Lock, RotateCcw, Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CelebrityRosterModal } from '../modals/CelebrityRosterModal';
import { ChristmasGamesModal } from '../modals/ChristmasGamesModal';
import { GlobalGamesModal } from '../modals/GlobalGamesModal';
import { PreseasonInternationalModal } from '../modals/PreseasonInternationalModal';
import { InvitePerformanceModal } from '../modals/InvitePerformanceModal';
import { RigVotingModal } from './modals/RigVotingModal';
import { AllStarReplacementModal } from './modals/AllStarReplacementModal';
import { DunkContestModal } from './modals/DunkContestModal';
import { ThreePointContestModal } from './modals/ThreePointContestModal';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { SettingsManager } from '../../services/SettingsManager';
import { NBAPlayer } from '../../types';

// ─── Deadline helpers ─────────────────────────────────────────────────────────

function daysUntil(dateStr: Date | null | undefined, currentDate: Date): number | null {
  if (!dateStr) return null;
  const diff = Math.ceil((dateStr.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function deadlineBadge(days: number | null, isPast: boolean) {
  if (isPast) return null;
  if (days === null) return null;
  if (days < 0) return { label: 'WINDOW CLOSED', color: 'text-slate-500 bg-slate-900 border-slate-700' };
  if (days === 0) return { label: 'DEADLINE TODAY', color: 'text-red-400 bg-red-500/10 border-red-500/30 animate-pulse' };
  if (days <= 3) return { label: `${days}D LEFT`, color: 'text-red-400 bg-red-500/10 border-red-500/30' };
  if (days <= 7) return { label: `${days}D LEFT`, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
  if (days <= 21) return { label: `${days}D LEFT`, color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' };
  return { label: `${days}D`, color: 'text-slate-400 bg-slate-800 border-slate-700' };
}

// ─── Card component ───────────────────────────────────────────────────────────

interface SeasonalCardProps {
  title: string;
  description: string;
  cost: string;
  benefit: string;
  icon: any;
  color: string;
  deadline: Date | null;
  currentDate: Date;
  disabled?: boolean;
  completed?: boolean;
  locked?: boolean;
  lockedReason?: string;
  onClick: () => void;
}

const SeasonalCard: React.FC<SeasonalCardProps> = ({
  title, description, cost, benefit, icon: Icon, color,
  deadline, currentDate, disabled, completed, locked, lockedReason, onClick
}) => {
  const days = daysUntil(deadline, currentDate);
  const badge = deadlineBadge(days, !!completed);
  const isExpired = days !== null && days < 0;
  const isDisabled = disabled || completed || locked || isExpired;

  return (
    <motion.button
      whileHover={!isDisabled ? { scale: 1.02, y: -2 } : {}}
      whileTap={!isDisabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={isDisabled}
      className={`relative p-6 rounded-[2rem] border text-left transition-all duration-300 flex flex-col h-full ${
        isDisabled
          ? 'bg-slate-900/20 border-slate-800/50 opacity-50 cursor-not-allowed grayscale'
          : `bg-slate-900/40 border-slate-800 hover:bg-slate-800/60 hover:border-${color}-500/30 hover:shadow-xl hover:shadow-${color}-500/10`
      }`}
    >
      <div className={`absolute top-0 right-0 w-32 h-32 bg-${color}-500/5 blur-[60px] rounded-full -mr-10 -mt-10 pointer-events-none`}></div>

      {/* Header row */}
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-400 border border-${color}-500/20`}>
          <Icon size={22} />
        </div>
        <div className="flex flex-col items-end gap-1">
          {completed && (
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle size={10} /> Done
            </span>
          )}
          {locked && !completed && (
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 flex items-center gap-1">
              <Lock size={10} /> Locked
            </span>
          )}
          {badge && !completed && !locked && (
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border flex items-center gap-1 ${badge.color}`}>
              <Clock size={9} /> {badge.label}
            </span>
          )}
        </div>
      </div>

      <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2 relative z-10">{title}</h3>
      {locked && lockedReason && (
        <p className="text-xs text-slate-500 font-medium italic mb-2 relative z-10">{lockedReason}</p>
      )}
      <p className="text-sm text-slate-400 font-medium leading-relaxed mb-6 relative z-10 flex-1">{description}</p>

      <div className="space-y-2 mt-auto relative z-10">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span className="text-slate-500">Cost</span>
          <span className="text-rose-400">{cost}</span>
        </div>
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span className="text-slate-500">Benefit</span>
          <span className="text-emerald-400">{benefit}</span>
        </div>
      </div>
    </motion.button>
  );
};

// ─── Main SeasonalView ────────────────────────────────────────────────────────

const SeasonalView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const [processing, setProcessing] = useState(false);

  // Modal visibility state
  const [rigVotingOpen, setRigVotingOpen] = useState(false);
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [dunkModalOpen, setDunkModalOpen] = useState(false);
  const [threePointModalOpen, setThreePointModalOpen] = useState(false);
  const [celebrityModalOpen, setCelebrityModalOpen] = useState(false);
  const [christmasModalOpen, setChristmasModalOpen] = useState(false);
  const [globalGamesModalOpen, setGlobalGamesModalOpen] = useState(false);
  const [preseasonIntlModalOpen, setPreseasonIntlModalOpen] = useState(false);
  const [invitePerformanceModalOpen, setInvitePerformanceModalOpen] = useState(false);

  const currentDate = new Date(state.date);
  const season = state.leagueStats.year || 2026;
  const dates = useMemo(() => getAllStarWeekendDates(season), [season]);

  const allStar = state.allStar;

  // Derived booleans
  const votingOpen = currentDate >= dates.votingStart && currentDate <= dates.votingEnd;
  const startersAnnounced = allStar?.startersAnnounced ?? false;

  const exec = async (type: string, payload?: any) => {
    setProcessing(true);
    await new Promise(r => setTimeout(r, SettingsManager.getDelay(600)));
    await dispatchAction({ type: type as any, payload });
    setProcessing(false);
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleRigVoting = async (playerId: string, playerName: string, ghostVotes: number) => {
    setRigVotingOpen(false);
    await exec('ADVANCE_DAY', {
      outcomeText: `Commissioner secretly injected ${(ghostVotes / 1000000).toFixed(2)}M ghost votes for ${playerName} in the All-Star fan vote.`,
      isSpecificEvent: true,
      customAction: { type: 'RIG_ALL_STAR_VOTING', playerId, playerName, ghostVotes }
    });
    // Also update votes locally (immediate patch)
    dispatchAction({
      type: 'RIG_ALL_STAR_VOTING' as any,
      payload: { playerId, ghostVotes }
    });
  };

  const handleAllStarReplacement = async (injuredId: string, injuredName: string, replacementId: string, replacementName: string, conference: string) => {
    setReplacementOpen(false);
    // Update roster immediately (no day advance for this action)
    dispatchAction({
      type: 'ADD_ALL_STAR_REPLACEMENT' as any,
      payload: { injuredId, replacementId, replacementName, conference }
    });
    await exec('ADVANCE_DAY', {
      outcomeText: `Due to injury, ${injuredName} will not participate in the All-Star Game. Commissioner has selected ${replacementName} as the official replacement — they will receive All-Star honors.`,
      isSpecificEvent: true
    });
  };

  const handleDunkContestants = (contestants: NBAPlayer[]) => {
    setDunkModalOpen(false);
    dispatchAction({ type: 'SET_DUNK_CONTESTANTS', payload: { contestants } });
  };

  const handleThreePointContestants = (contestants: NBAPlayer[]) => {
    setThreePointModalOpen(false);
    dispatchAction({ type: 'SET_THREE_POINT_CONTESTANTS', payload: { contestants } });
  };

  const handleCelebrityRoster = async (roster: any[]) => {
    setCelebrityModalOpen(false);
    const rosterNames = roster.map((c: any) => c.name).join(', ');
    await exec('CELEBRITY_ROSTER', { roster: rosterNames });
  };

  const handleChristmas = async (games: any) => {
    setChristmasModalOpen(false);
    await exec('SET_CHRISTMAS_GAMES', { games });
  };

  const handleGlobalGames = async (games: any) => {
    setGlobalGamesModalOpen(false);
    await exec('GLOBAL_GAMES', { games });
  };

  const handlePreseasonIntl = async (payloads: any) => {
    setPreseasonIntlModalOpen(false);
    await exec('ADD_PRESEASON_INTERNATIONAL', { games: payloads });
  };

  const handleInvitePerformance = async (details: any) => {
    setInvitePerformanceModalOpen(false);
    await exec('INVITE_PERFORMANCE', details);
  };

  // ─── Action definitions (sorted by deadline) ────────────────────────────────

  const seasonStarted = state.schedule.some(g => g.played);
  const christmasDeadline = new Date(season - 1, 11, 25); // Dec 25
  const seasonStartDeadline = new Date(season - 1, 9, 24); // Oct 24

  const actions = [
    // Pre-season actions (deadline = Oct 24)
    {
      id: 'GLOBAL_GAMES', title: 'Global Games Cities',
      description: 'Select international cities to host regular season NBA games. Opens global markets, sponsorships, and fan bases.',
      cost: '-$100k/city', benefit: '+++Global Revenue',
      icon: Globe, color: 'blue', deadline: seasonStartDeadline,
      disabled: state.leagueStats.hasScheduledGlobalGames || seasonStarted,
      completed: !!state.leagueStats.hasScheduledGlobalGames,
      onClick: () => setGlobalGamesModalOpen(true),
    },
    {
      id: 'ADD_PRESEASON_INTERNATIONAL', title: 'International Preseason',
      description: 'Schedule preseason exhibition games vs. elite international clubs — Euroleague, PBA, B-League.',
      cost: '-$10k Personal', benefit: '+Global Diplomacy',
      icon: Globe, color: 'emerald', deadline: seasonStartDeadline,
      disabled: seasonStarted,
      completed: false,
      onClick: () => setPreseasonIntlModalOpen(true),
    },
    {
      id: 'SET_CHRISTMAS_GAMES', title: 'Christmas Day Games',
      description: "Curate the NBA's marquee Christmas matchups — the highest-rated regular-season broadcast window.",
      cost: 'None', benefit: '+++Viewership / ++Revenue',
      icon: Trophy, color: 'rose', deadline: christmasDeadline,
      disabled: (state.christmasGames && state.christmasGames.length > 0) || seasonStarted,
      completed: !!(state.christmasGames && state.christmasGames.length > 0),
      onClick: () => setChristmasModalOpen(true),
    },
    // All-Star voting window (deadline = votingEnd Jan 14)
    {
      id: 'RIG_ALL_STAR_VOTING', title: 'Rig All-Star Voting',
      description: 'Inject ghost votes for a fan-vote candidate during the open voting window — one time only.',
      cost: 'None (Covert)', benefit: '+Control Fan Vote / +Influence',
      icon: Star, color: 'violet', deadline: dates.votingEnd,
      disabled: !votingOpen || !!(allStar?.hasRiggedVoting),
      completed: !!(allStar?.hasRiggedVoting),
      locked: !votingOpen && !allStar?.hasRiggedVoting,
      lockedReason: !votingOpen ? 'Only available while All-Star fan voting is open.' : undefined,
      onClick: () => setRigVotingOpen(true),
    },
    // Celebrity roster (deadline = celebrity announced Jan 29)
    {
      id: 'CELEBRITY_ROSTER', title: 'Celebrity Game Roster',
      description: 'Hand-pick celebrities, athletes, and influencers for All-Star Saturday. Strategic casting spikes viewership.',
      cost: 'None', benefit: '++Viewership / ++Buzz',
      icon: Star, color: 'amber', deadline: dates.celebrityAnnounced,
      disabled: !!(allStar?.celebrityAnnounced),
      completed: !!(allStar?.celebrityAnnounced),
      onClick: () => setCelebrityModalOpen(true),
    },
    // Dunk Contest (deadline = Feb 5) — open after starters announced
    {
      id: 'SET_DUNK_CONTESTANTS',
      title: (allStar?.dunkContestContestants ?? []).length > 0 ? 'Dunk Contest — Edit Lineup' : 'Dunk Contest Participants',
      description: (allStar?.dunkContestContestants ?? []).length > 0
        ? `${(allStar?.dunkContestContestants ?? []).length} contestants announced — click to edit the lineup.`
        : 'Curate the slam dunk contest. Once starters are announced, select up to 6 high-flyers.',
      cost: 'None', benefit: '++Saturday Ratings / +Buzz',
      icon: Zap, color: 'amber', deadline: dates.dunkContestAnnounced,
      disabled: false,
      completed: false,
      locked: !startersAnnounced,
      lockedReason: 'Available once All-Star starters are announced.',
      onClick: () => setDunkModalOpen(true),
    },
    // 3-Point Contest (deadline = Feb 8) — open after starters announced
    {
      id: 'SET_THREE_POINT_CONTESTANTS',
      title: (allStar?.threePointContestants ?? []).length > 0 ? '3-Point Contest — Edit Lineup' : '3-Point Contest Participants',
      description: (allStar?.threePointContestants ?? []).length > 0
        ? `${(allStar?.threePointContestants ?? []).length} contestants announced — click to edit the lineup.`
        : 'Pick the shooters for the three-point contest. Once starters are announced, select up to 8 marksmen.',
      cost: 'None', benefit: '++Saturday Ratings / +Ratings',
      icon: Target, color: 'sky', deadline: dates.threePointAnnounced,
      disabled: false,
      completed: false,
      locked: !startersAnnounced,
      lockedReason: 'Available once All-Star starters are announced.',
      onClick: () => setThreePointModalOpen(true),
    },
    // All-Star Roster Edit (deadline = saturday)
    {
      id: 'SET_ALL_STAR_REPLACEMENT', title: 'All-Star Roster Edit',
      description: (() => {
        if (!startersAnnounced) return 'Once starters are announced, manage roster — swap players or add injury replacements.';
        const roster = state.allStar?.roster ?? [];
        const injured = roster.filter(r => {
          const p = state.players.find(pl => pl.internalId === r.playerId);
          return !!(p as any)?.injury && !r.isInjuredDNP;
        });
        if (injured.length > 0) return `${injured.length} All-Star${injured.length > 1 ? 's are' : ' is'} injured and cannot participate — add your replacements.`;
        return `${roster.filter(r => !r.isInjuryReplacement).length} All-Stars selected — swap any player or add injury replacements.`;
      })(),
      cost: 'None', benefit: '+Roster Control / +Fair Play',
      icon: RotateCcw, color: 'sky', deadline: dates.saturday,
      disabled: false,
      completed: false,
      locked: !startersAnnounced,
      lockedReason: 'All-Star starters must be announced first.',
      onClick: () => setReplacementOpen(true),
    },
    // Invite performance (flexible / evergreen)
    {
      id: 'INVITE_PERFORMANCE', title: 'Invite Performance',
      description: 'Book world-class artists for halftime shows, All-Star ceremonies, or Christmas Day spectacles.',
      cost: '-League Funds (varies)', benefit: '+Popularity / ++Viewership',
      icon: Music, color: 'amber', deadline: null,
      disabled: false,
      completed: false,
      onClick: () => setInvitePerformanceModalOpen(true),
    },
  ] as const;

  // Sort by deadline: null deadlines go last, past deadlines sorted by proximity
  const sorted = [...actions].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.getTime() - b.deadline.getTime();
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar bg-slate-950 md:rounded-[2.5rem] border-x border-b md:border border-slate-800 shadow-2xl">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <Star size={24} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">Seasonal Actions</h2>
              <p className="text-slate-500 font-medium text-sm">Time-sensitive commissioner decisions — sorted by deadline</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 text-[10px] font-black uppercase tracking-widest">
            <span className="flex items-center gap-1.5 text-red-400"><Clock size={10} /> &lt;3 days = urgent</span>
            <span className="flex items-center gap-1.5 text-amber-400"><Clock size={10} /> &lt;7 days = soon</span>
            <span className="flex items-center gap-1.5 text-sky-400"><Clock size={10} /> &lt;21 days = upcoming</span>
            <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle size={10} /> done</span>
          </div>
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {sorted.map(action => (
            <SeasonalCard
              key={action.id}
              title={action.title}
              description={action.description}
              cost={action.cost}
              benefit={action.benefit}
              icon={action.icon}
              color={action.color}
              deadline={action.deadline ?? null}
              currentDate={currentDate}
              disabled={action.disabled || processing}
              completed={'completed' in action ? action.completed : false}
              locked={'locked' in action ? (action as any).locked : false}
              lockedReason={'lockedReason' in action ? (action as any).lockedReason : undefined}
              onClick={action.onClick}
            />
          ))}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {rigVotingOpen && <RigVotingModal onClose={() => setRigVotingOpen(false)} onConfirm={handleRigVoting} />}
        {replacementOpen && <AllStarReplacementModal onClose={() => setReplacementOpen(false)} onConfirm={handleAllStarReplacement} />}
        {dunkModalOpen && <DunkContestModal onClose={() => setDunkModalOpen(false)} onConfirm={handleDunkContestants} />}
        {threePointModalOpen && <ThreePointContestModal onClose={() => setThreePointModalOpen(false)} onConfirm={handleThreePointContestants} />}
      </AnimatePresence>

      {celebrityModalOpen && (
        <CelebrityRosterModal
          onClose={() => setCelebrityModalOpen(false)}
          onConfirm={handleCelebrityRoster}
        />
      )}
      {christmasModalOpen && (
        <ChristmasGamesModal
          teams={state.teams}
          onClose={() => setChristmasModalOpen(false)}
          onConfirm={handleChristmas}
          initialGames={state.christmasGames}
        />
      )}
      {globalGamesModalOpen && (
        <GlobalGamesModal
          teams={state.teams}
          onClose={() => setGlobalGamesModalOpen(false)}
          onConfirm={handleGlobalGames}
        />
      )}
      {preseasonIntlModalOpen && (
        <PreseasonInternationalModal
          teams={state.teams}
          nonNBATeams={(state.nonNBATeams ?? []).filter(t => (state.players ?? []).filter(p => p.tid === t.tid).length >= 9)}
          onClose={() => setPreseasonIntlModalOpen(false)}
          onConfirm={handlePreseasonIntl}
        />
      )}
      {invitePerformanceModalOpen && (
        <InvitePerformanceModal
          onClose={() => setInvitePerformanceModalOpen(false)}
          onConfirm={handleInvitePerformance}
        />
      )}
    </div>
  );
};

export default SeasonalView;
