import React, { useState } from 'react';
import { Player, SlotPosition, DraftSlot, getResolvedOvr } from '../types';
import { FantasyTeam } from '../lib/wheelDraft';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase,
  ChevronRight,
  User,
  Hash,
  Award,
  Calendar,
  Globe,
  GraduationCap,
  History,
  Ruler,
  Compass,
  Map,
  Shield,
  HelpCircle,
  Eye,
  Sparkles
} from 'lucide-react';
import { PlayerReveal } from './PlayerReveal';
import { soundFx } from '../lib/audio';
import { getTeamBranding, TeamLogo } from '../lib/nbaBranding';
import { CountryFlag } from '../../shared/CountryFlag';

interface BriefcaseDraftViewProps {
  key?: React.Key;
  roundNumber: number;
  players: Player[]; // 30 players for this round
  slots: DraftSlot[];
  fantasyTeams?: FantasyTeam[];
  onAddToTeam: (player: Player) => void;
  onNextRound: () => void;
  lifelines: number;
  onUseLifeline: () => void;
  rosterSize: number;
}

type LocalStage = 'CHOOSING' | 'REVEALING_PICK' | 'BOARD_REVEAL';

// Clue Type Configurations
const CLUE_TYPES = [
  { key: 'age', label: 'Age', icon: Calendar },
  { key: 'height', label: 'Height', icon: Ruler },
  { key: 'weight', label: 'Weight', icon: User },
  { key: 'jerseyNumber', label: 'Jersey Number', icon: Hash },
  { key: 'currentTeam', label: 'Current Team', icon: Briefcase },
  { key: 'draftTeam', label: 'Draft Team', icon: Award },
  { key: 'draftPick', label: 'Draft Pick Number', icon: Award },
  { key: 'draftYear', label: 'Draft Year', icon: Calendar },
  { key: 'nationality', label: 'Country / Nationality', icon: Globe },
  { key: 'college', label: 'College / Previous Club', icon: GraduationCap },
  { key: 'formerTeams', label: 'Former Teams', icon: History },
  { key: 'position', label: 'Position', icon: Shield },
  { key: 'conference', label: 'Conference', icon: Map },
  { key: 'division', label: 'Division', icon: Compass },
];

/**
 * Audit and format helper to retrieve factual player clues.
 * Ensures we only display valid properties and never display undefined/NaN.
 */
function getPlayerClueValue(player: Player, key: string): { valid: boolean; displayValue: string; element?: React.ReactNode } {
  switch (key) {
    case 'jerseyNumber': {
      const val = player.jerseyNumber;
      const valid = val !== undefined && val !== null;
      return { valid, displayValue: valid ? `#${val}` : '' };
    }
    case 'currentTeam': {
      const val = player.teamName;
      const valid = !!val;
      return {
        valid,
        displayValue: val || '',
        element: valid ? (
          <div className="flex items-center gap-1.5 justify-end">
            <TeamLogo abbrev={player.teamAbbrev} sizeClass="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[130px]">{val}</span>
          </div>
        ) : undefined,
      };
    }
    case 'draftTeam': {
      const val = player.draftTeamAbbrev;
      const valid = !!val;
      let branding = val ? getTeamBranding(val) : null;
      return {
        valid,
        displayValue: branding?.name || val || '',
        element: (valid && val) ? (
          <div className="flex items-center gap-1.5 justify-end">
            <TeamLogo abbrev={val} sizeClass="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[130px]">{branding?.name || val}</span>
          </div>
        ) : undefined,
      };
    }
    case 'draftPick': {
      const val = player.draftPick;
      const valid = !!val;
      if (valid && val) {
        const match = val.match(/Pick\s*#?\s*(\d+)/i);
        const display = match ? `PICK #${match[1]}` : val.toUpperCase();
        return { valid, displayValue: display };
      }
      return { valid, displayValue: '' };
    }
    case 'draftYear': {
      const val = player.draftYear;
      const valid = val !== undefined && val !== null && val > 1950;
      return { valid, displayValue: valid ? `${val}` : '' };
    }
    case 'age': {
      const val = player.age;
      const valid = val !== undefined && val !== null && val > 0;
      return { valid, displayValue: valid ? `${val} yrs` : '' };
    }
    case 'nationality': {
      const val = player.nationality;
      const valid = !!val;
      if (valid && val) {
        const parts = val.split(',').map((s) => s.trim());
        const countryStr = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        return {
          valid,
          displayValue: countryStr,
          element: (
            <div className="flex items-center gap-1.5 justify-end">
              <CountryFlag country={countryStr} />
              <span className="truncate max-w-[130px]">{countryStr}</span>
            </div>
          ),
        };
      }
      return { valid, displayValue: '' };
    }
    case 'college': {
      const val = player.college;
      const valid = !!val && val.toLowerCase() !== 'none';
      return { valid, displayValue: val || '' };
    }
    case 'formerTeams': {
      const val = player.formerTeams;
      const valid = !!val && val.length > 0;
      return { valid, displayValue: valid ? val.join(', ') : '' };
    }
    case 'height': {
      const val = player.heightFeetInches;
      const valid = !!val;
      return { valid, displayValue: val || '' };
    }
    case 'weight': {
      const val = player.weight;
      const valid = val !== undefined && val !== null && val > 150;
      return { valid, displayValue: valid ? `${val} lbs` : '' };
    }
    case 'position': {
      const val = player.displayPos || player.position;
      const valid = !!val;
      return { valid, displayValue: val || '' };
    }
    case 'conference': {
      const val = player.conference;
      const valid = !!val;
      return { valid, displayValue: valid ? `${val} Conf.` : '' };
    }
    case 'division': {
      const val = player.division;
      const valid = !!val;
      return { valid, displayValue: valid ? `${val} Div.` : '' };
    }
    default:
      return { valid: false, displayValue: '' };
  }
}

function MiniHeadshotWithTeam({ src, name, teamAbbrev }: { src?: string; name: string; teamAbbrev?: string }) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative shrink-0">
      {src && !hasError ? (
        <img
          src={src}
          alt={name}
          className="w-10 h-10 rounded-full object-cover border border-slate-700 bg-slate-800 shrink-0 shadow-sm"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">
          {name ? name.slice(0, 2).toUpperCase() : <User className="w-5 h-5 text-slate-500" />}
        </div>
      )}
      {teamAbbrev && (
        <div className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700 p-0.5 rounded-full shadow">
          <TeamLogo abbrev={teamAbbrev} sizeClass="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
}

export function BriefcaseDraftView({
  roundNumber,
  players,
  slots,
  fantasyTeams,
  onAddToTeam,
  onNextRound,
  lifelines,
  onUseLifeline,
  rosterSize,
}: BriefcaseDraftViewProps) {
  const [localStage, setLocalStage] = useState<LocalStage>('CHOOSING');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealedAll, setRevealedAll] = useState(false);

  // Strategic Lifeline States
  const [activeCaseIndex, setActiveCaseIndex] = useState<number | null>(null);
  const [showClueMenu, setShowClueMenu] = useState(false);
  const [revealedCluesByCase, setRevealedCluesByCase] = useState<Record<number, string[]>>({});

  const handleCaseClick = (index: number) => {
    if (localStage !== 'CHOOSING') return;
    setActiveCaseIndex(index);
    setShowClueMenu(false);
    soundFx.playClick();
  };

  const handleUseLifeline = (clueKey: string) => {
    if (activeCaseIndex === null || lifelines <= 0) return;
    
    const targetPlayer = players[activeCaseIndex];
    if (!targetPlayer) return;

    const info = getPlayerClueValue(targetPlayer, clueKey);
    if (!info.valid) return;

    const existing = revealedCluesByCase[activeCaseIndex] || [];
    if (existing.includes(clueKey)) return;
    
    // Optimistic guard in case of rapid clicks (using string to track in-flight)
    if (document.body.dataset.spendingClue === clueKey) return;
    document.body.dataset.spendingClue = clueKey;
    
    onUseLifeline();
    
    setRevealedCluesByCase((prev) => {
      const current = prev[activeCaseIndex] || [];
      return {
        ...prev,
        [activeCaseIndex]: [...current, clueKey],
      };
    });
    
    soundFx.playReveal();
    setShowClueMenu(false);
    setTimeout(() => {
      delete document.body.dataset.spendingClue;
    }, 50);
  };

  const handleFinalizeCase = (index: number) => {
    setSelectedIndex(index);
    setLocalStage('REVEALING_PICK');
    soundFx.playClick();
    onAddToTeam(players[index]);
    setActiveCaseIndex(null);
  };

  const handleRevealFinished = () => {
    setRevealedAll(true);
    setLocalStage('BOARD_REVEAL');
    soundFx.playReveal();
  };

  const selectedPlayer = selectedIndex !== null ? players[selectedIndex] : null;
  const selectedBranding = selectedPlayer ? getTeamBranding(selectedPlayer.teamAbbrev) : null;

  // Find which fantasy team drafted each player (if fantasyTeams is provided)
  const getDraftingTeamLogo = (playerId: string) => {
    if (!fantasyTeams) return null;
    for (const team of fantasyTeams) {
      if (team.players.some((p) => p.id === playerId)) {
        return team.isUser ? 'YOU' : team.abbrev;
      }
    }
    return null;
  };

  // Factual details of active player being inspected
  const activePlayer = activeCaseIndex !== null ? players[activeCaseIndex] : null;
  const activeRevealedKeys = activeCaseIndex !== null ? (revealedCluesByCase[activeCaseIndex] || []) : [];

  return (
    <div className="w-full flex flex-col items-center max-w-6xl mx-auto px-4 py-4">
      {/* HEADER */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-xs font-black tracking-widest text-amber-400 uppercase mb-3 shadow-md"
        >
          <Briefcase className="w-4 h-4 text-amber-400" />
          BRIEFCASE DRAFT — ROUND {roundNumber} OF {rosterSize}
        </motion.div>
        
        {/* Lifelines Inventory HUD */}
        <div className="flex justify-center items-center gap-2.5 mb-2 bg-slate-900/60 border border-slate-800/80 px-4 py-2 rounded-xl text-xs font-bold text-slate-300 max-w-sm mx-auto">
          <HelpCircle className="w-4 h-4 text-amber-400" />
          <span>LIFELINES FOR DRAFT:</span>
          <span className="font-mono text-base font-black text-amber-400">
            {lifelines} / {rosterSize}
          </span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tighter italic mt-1">
          {localStage === 'CHOOSING'
            ? 'CHOOSE YOUR CASE'
            : revealedAll
            ? `ALL ${players.length} CASES REVEALED`
            : 'MOMENT OF TRUTH'}
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-lg mx-auto font-medium">
          {localStage === 'CHOOSING'
            ? `Use up to ${rosterSize} global lifelines to inspect cases. Finalize your pick strategically!`
            : revealedAll
            ? "Compare your pick against the rest of this round's players!"
            : 'Unlocking case contents...'}
        </p>
      </div>

      {/* 30-CASE BOARD GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 w-full max-w-5xl">
        {players.map((player, idx) => {
          const isSelected = selectedIndex === idx;
          const showContent = revealedAll || (isSelected && localStage !== 'CHOOSING');
          const branding = getTeamBranding(player.teamAbbrev);
          const usedCluesCount = (revealedCluesByCase[idx] || []).length;

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={localStage === 'CHOOSING' ? { scale: 1.03, y: -2 } : {}}
              onClick={() => handleCaseClick(idx)}
              className={`
                relative rounded-xl transition-all overflow-hidden cursor-pointer
                ${
                  !showContent
                    ? 'bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700/80 hover:border-amber-400 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] p-3 min-h-[120px] flex flex-col items-center justify-center gap-1.5'
                    : isSelected
                    ? 'bg-amber-950/40 border-2 border-amber-400 ring-2 ring-amber-400/30 p-2.5 min-h-[120px] flex flex-col justify-between shadow-lg'
                    : 'bg-slate-900/90 border border-slate-800 p-2.5 min-h-[120px] flex flex-col justify-between hover:border-slate-700'
                }
              `}
            >
              {/* UNREVEALED BRIEFCASE */}
              <AnimatePresence mode="wait">
                {!showContent ? (
                  <motion.div
                    key="closed"
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="flex flex-col items-center justify-center gap-1 text-center"
                  >
                    <Briefcase className="w-7 h-7 text-amber-500/80 mb-0.5" />
                    <span className="text-xs font-black tracking-widest text-slate-300 font-mono">
                      CASE {(idx + 1).toString().padStart(2, '0')}
                    </span>

                    {/* Magnifying glass subtle indicator */}
                    {usedCluesCount > 0 && (
                      <span className="text-[9px] font-black tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 mt-1">
                        🔍 {usedCluesCount} {usedCluesCount === 1 ? 'CLUE' : 'CLUES'}
                      </span>
                    )}
                  </motion.div>
                ) : (
                  /* Revealed player card with source-team identity. */
                  <motion.div
                    key="revealed"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full flex flex-col items-center justify-between h-full gap-1"
                  >
                    {/* Header Row: Case # + Picked Badge */}
                    <div className="w-full flex items-center justify-between gap-1 text-[10px] font-mono">
                      <span className="text-slate-500 font-bold">
                        #{(idx + 1).toString().padStart(2, '0')}
                      </span>
                      {isSelected && (
                        <span className="bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider">
                          YOUR PICK
                        </span>
                      )}
                    </div>

                    {/* Headshot with source-team logo overlay. */}
                    <MiniHeadshotWithTeam
                      src={player.headshotUrl}
                      name={player.name}
                      teamAbbrev={player.teamAbbrev}
                    />

                    {/* Full Player Name (2 lines allowed, clean font) */}
                    <div className="text-center w-full min-w-0 px-0.5">
                      <div className="text-[11px] font-black text-white leading-tight uppercase line-clamp-2">
                        {player.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 flex items-center justify-center gap-1">
                        <span>{player.teamAbbrev}</span> • <span>{player.displayPos || player.position}</span>
                      </div>
                    </div>

                    {/* OVR Pill */}
                    <div
                      className="mt-1 w-full text-center py-0.5 rounded bg-slate-950/90 border"
                      style={{ borderColor: branding.primaryColor || '#334155' }}
                    >
                      <span className="text-xs font-black font-mono text-amber-400">
                        {getResolvedOvr(player)} OVR
                      </span>
                    </div>

                    {/* Show Fantasy Team Assignment */}
                    {revealedAll && !isSelected && (
                      <div className="w-full flex items-center justify-center gap-1.5 mt-1 bg-slate-800/80 py-1 rounded text-[10px] font-bold text-slate-300">
                        <span className="text-slate-500">→</span>
                        {(() => {
                          const teamAbbrev = getDraftingTeamLogo(player.id);
                          if (teamAbbrev === 'YOU') {
                            return <span className="text-amber-400">YOU</span>;
                          }
                          return (
                            <div className="flex items-center gap-1">
                              {teamAbbrev && <TeamLogo abbrev={teamAbbrev} sizeClass="w-3 h-3" />}
                              <span>{teamAbbrev}</span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* STRATEGIC CASE ACTION MODAL (Centered Modal) */}
      <AnimatePresence>
        {activeCaseIndex !== null && activePlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center max-w-md w-full relative"
              style={{
                borderColor: '#fbbf24',
                boxShadow: '0 0 40px rgba(251, 191, 36, 0.15)',
              }}
            >
              {/* Header */}
              <div className="text-amber-400 text-xs font-black tracking-widest uppercase mb-1 font-mono">
                INVESTIGATING CASE
              </div>
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">
                CASE {(activeCaseIndex + 1).toString().padStart(2, '0')}
              </h3>

              {/* Main Action Area */}
              <AnimatePresence mode="wait">
                {!showClueMenu ? (
                  <motion.div
                    key="main-view"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="w-full flex flex-col items-center"
                  >
                    {/* Closed Briefcase Visual */}
                    <div className="w-24 h-24 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800 mb-4 shadow-inner relative animate-pulse">
                      <Briefcase className="w-11 h-11 text-amber-500" />
                    </div>

                    {/* Global Lifeline HUD pill inside modal */}
                    <div className="bg-slate-950 border border-slate-800 px-4 py-1.5 rounded-full text-xs font-bold text-slate-300 mb-4 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      <span>LIFELINES REMAINING:</span>
                      <span className="font-mono text-amber-400 font-black">
                        {lifelines} / {rosterSize}
                      </span>
                    </div>

                    {/* Already Revealed Clues List */}
                    <div className="w-full space-y-2 mb-6 bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800/50 pb-1.5 flex items-center justify-between">
                        <span>REVEALED INTEL</span>
                        <span className="text-amber-400 font-mono">
                          {activeRevealedKeys.length} USED
                        </span>
                      </h4>

                      {activeRevealedKeys.length === 0 ? (
                        <p className="text-slate-500 text-[11px] py-4 text-center font-bold">
                          No intel unlocked. Spend 1 lifeline to reveal a factual clue about the hidden player.
                        </p>
                      ) : (
                        <div className="space-y-2.5 pt-1.5 max-h-36 overflow-y-auto pr-1">
                          {activeRevealedKeys.map((key) => {
                            const clueConfig = CLUE_TYPES.find((c) => c.key === key);
                            const info = getPlayerClueValue(activePlayer, key);
                            if (!clueConfig || !info.valid) return null;

                            const IconComponent = clueConfig.icon;

                            return (
                              <div key={key} className="flex items-center justify-between gap-4 text-xs border-b border-slate-900/40 pb-1.5 last:border-0 last:pb-0">
                                <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
                                  <IconComponent className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
                                  <span>{clueConfig.label}</span>
                                </div>
                                <div className="text-slate-100 font-black uppercase text-right truncate">
                                  {info.element ? info.element : info.displayValue}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Lifeline spend action */}
                    <div className="w-full space-y-2.5">
                      <button
                        disabled={lifelines <= 0}
                        onClick={() => setShowClueMenu(true)}
                        className={`
                          w-full py-3 rounded-xl font-black uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 border
                          ${
                            lifelines <= 0
                              ? 'bg-slate-800/30 border-slate-800/40 text-slate-500 cursor-not-allowed'
                              : 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-400 hover:border-amber-400'
                          }
                        `}
                      >
                        🔍 INVESTIGATE (-1 LIFELINE)
                      </button>

                      <button
                        onClick={() => handleFinalizeCase(activeCaseIndex)}
                        className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.25)] flex items-center justify-center gap-2 text-xs"
                      >
                        💼 FINALIZE PICK
                      </button>

                      <button
                        onClick={() => setActiveCaseIndex(null)}
                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-wider text-[11px] rounded-xl transition-all"
                      >
                        BACK TO CASES
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  /* Clue Selection Sub-Menu */
                  <motion.div
                    key="clue-menu"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="w-full flex flex-col items-center"
                  >
                    <div className="text-xs font-bold text-slate-400 mb-3 text-center uppercase tracking-wider">
                      SELECT CLUE CATEGORY TO REVEAL
                    </div>

                    {/* Grid of available clue categories */}
                    <div className="grid grid-cols-2 gap-2 w-full max-h-60 overflow-y-auto pr-1">
                      {CLUE_TYPES.map((clue) => {
                        const info = getPlayerClueValue(activePlayer, clue.key);
                        const isAlreadyRevealed = activeRevealedKeys.includes(clue.key);
                        const isAvailable = info.valid && !isAlreadyRevealed;

                        // Only render if the hidden player actually has this data
                        if (!info.valid) return null;

                        const ClueIcon = clue.icon;

                        return (
                          <button
                            key={clue.key}
                            disabled={isAlreadyRevealed}
                            onClick={() => handleUseLifeline(clue.key)}
                            className={`
                              flex items-center gap-2 p-2.5 rounded-lg text-xs font-bold transition-all text-left border
                              ${
                                isAlreadyRevealed
                                  ? 'bg-slate-800/30 border-slate-800/40 text-slate-500 cursor-not-allowed'
                                  : 'bg-slate-950 border-slate-800 hover:border-amber-400 hover:bg-slate-900 text-slate-200'
                              }
                            `}
                          >
                            <ClueIcon className="w-4 h-4 text-amber-500 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{clue.label}</span>
                              {isAlreadyRevealed && <span className="text-[9px] text-amber-500/70 font-mono">REVEALED</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setShowClueMenu(false)}
                      className="w-full mt-5 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold uppercase tracking-wider text-xs rounded-xl transition-all border border-slate-800"
                    >
                      BACK TO CASE
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* REVEAL OVERLAY MODAL FOR SELECTED CASE */}
      <AnimatePresence>
        {localStage === 'REVEALING_PICK' && selectedPlayer && selectedBranding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 30 }}
              transition={{ type: 'spring', damping: 20 }}
              className="relative bg-slate-900 border-2 p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-md w-full"
              style={{
                borderColor: selectedBranding.primaryColor || '#f59e0b',
                boxShadow: `0 0 50px ${selectedBranding.primaryColor}55`,
              }}
            >
              <div className="text-amber-400 text-xs font-black tracking-widest uppercase mb-4 animate-pulse">
                CASE {(selectedIndex! + 1).toString().padStart(2, '0')} UNLOCKED
              </div>

              {/* Headshot with team logo badge */}
              <div
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-4 mb-4 bg-slate-800 shadow-xl relative"
                style={{ borderColor: selectedBranding.primaryColor }}
              >
                {selectedPlayer.headshotUrl ? (
                  <img
                    src={selectedPlayer.headshotUrl}
                    alt={selectedPlayer.name}
                    className="w-full h-full object-cover scale-110"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-black text-slate-600 uppercase">
                    {selectedPlayer.firstName[0]}
                    {selectedPlayer.lastName[0]}
                  </div>
                )}
              </div>

              {/* Source-team logo and name. */}
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <TeamLogo abbrev={selectedPlayer.teamAbbrev} sizeClass="w-6 h-6" />
                <span className="text-slate-300 text-xs font-black uppercase tracking-wider">
                  {selectedPlayer.teamName}
                </span>
              </div>

              {/* Full Name */}
              <h3 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mb-2 leading-tight">
                {selectedPlayer.name}
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">
                {selectedPlayer.displayPos || selectedPlayer.position} • {selectedPlayer.teamAbbrev}
              </p>

              {/* OVR STATS */}
              <div className="flex items-center justify-center gap-6 mb-8 bg-slate-950/80 border border-slate-800 py-3 px-6 rounded-2xl w-full">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    OVERALL
                  </span>
                  <span className="text-3xl font-black text-white font-mono">
                    {getResolvedOvr(selectedPlayer)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleRevealFinished}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 text-sm"
              >
                SEE WHAT YOU MISSED <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOTTOM ACTION BAR WHEN FULL BOARD IS REVEALED */}
      {localStage === 'BOARD_REVEAL' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 flex flex-col items-center gap-3"
        >
          <button
            onClick={onNextRound}
            className="px-10 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-[0_0_30px_rgba(245,158,11,0.35)] flex items-center gap-2"
          >
            NEXT ROUND <ChevronRight className="w-5 h-5" />
          </button>
        </motion.div>
      )}
    </div>
  );
}
