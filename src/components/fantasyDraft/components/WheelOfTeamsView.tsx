import React, { useState } from 'react';
import { Player, SlotPosition, DraftSlot, getResolvedOvr } from '../types';
import { motion } from 'motion/react';
import { Disc, ChevronRight, User, Sparkles, AlertCircle, Trophy } from 'lucide-react';
import {
  TeamInfo,
  extractTeams,
  selectRandomValidTeam,
  AIRoundPickSummary,
  FantasyTeam,
} from '../lib/wheelDraft';
import { PlayerReveal } from './PlayerReveal';
import { WheelLandingModal } from './WheelLandingModal';
import { soundFx } from '../lib/audio';
import { getTeamBranding, TeamLogo, FantasyTeamLogo } from '../lib/nbaBranding';
import { DraftHistoryStrip, DraftHistoryEntry } from './DraftHistoryStrip';

interface WheelOfTeamsViewProps {
  key?: React.Key;
  roundNumber: number;
  userDraftSlot: number;
  allPlayers: Player[];
  draftedIds: Set<string>;
  slots: DraftSlot[];
  recentAiPicks?: AIRoundPickSummary[];
  aiTeams?: FantasyTeam[];
  fantasyTeams: FantasyTeam[];
  playerOwnerById: Map<string, string>;
  draftHistory: DraftHistoryEntry[];
  onContinue: (player: Player) => void;
  rosterSize: number;
}

type LocalStage = 'READY_TO_SPIN' | 'SPINNING' | 'TEAM_LANDED' | 'PLAYER_SELECTION' | 'ADDING_TO_TEAM';

function PlayerHeadshotWithLogo({ src, name, teamAbbrev }: { src?: string; name: string; teamAbbrev: string }) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative shrink-0">
      {src && !hasError ? (
        <img
          src={src}
          alt={name}
          className="w-12 h-12 rounded-xl object-cover border border-slate-700 bg-slate-800 shrink-0 shadow-sm"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">
          {name.slice(0, 2).toUpperCase() || <User className="w-6 h-6 text-slate-500" />}
        </div>
      )}
      <div className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700 p-0.5 rounded-full shadow">
        <TeamLogo abbrev={teamAbbrev} sizeClass="w-4 h-4" />
      </div>
    </div>
  );
}

export function WheelOfTeamsView({
  roundNumber,
  userDraftSlot,
  allPlayers,
  draftedIds,
  slots,
  recentAiPicks,
  aiTeams,
  fantasyTeams,
  playerOwnerById,
  draftHistory,
  onContinue,
  rosterSize,
}: WheelOfTeamsViewProps) {
  const teams = React.useMemo(() => {
    return extractTeams(allPlayers);
  }, [allPlayers]);

  const [localStage, setLocalStage] = useState<LocalStage>('READY_TO_SPIN');
  const [selectedTeam, setSelectedTeam] = useState<TeamInfo | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [rotationDegree, setRotationDegree] = useState<number>(0);

  const numSlices = teams.length;
  const sliceAngle = 360 / numSlices;

  const handleSpin = () => {
    if (localStage !== 'READY_TO_SPIN') return;

    soundFx.playClick();
    setLocalStage('SPINNING');
    setSelectedPlayer(null);

    const targetTeam = selectRandomValidTeam(teams, allPlayers, draftedIds);
    setSelectedTeam(targetTeam);

    const targetIndex = teams.findIndex((t) => t.abbrev === targetTeam.abbrev);
    const sliceCenter = targetIndex * sliceAngle + sliceAngle / 2;
    const targetSliceRotation = 360 - sliceCenter;

    const currentBase = Math.floor(rotationDegree / 360) * 360;
    const nextFullSpins = 360 * 6;
    const finalDegree = currentBase + nextFullSpins + targetSliceRotation;

    setRotationDegree(finalDegree);

    let tickCount = 0;
    const tickInterval = setInterval(() => {
      soundFx.playClick();
      tickCount++;
      if (tickCount > 12) clearInterval(tickInterval);
    }, 250);

    setTimeout(() => {
      clearInterval(tickInterval);
      soundFx.playReveal();
      setLocalStage('TEAM_LANDED');
    }, 4000);
  };

  const handleViewRoster = () => {
    setLocalStage('PLAYER_SELECTION');
    soundFx.playClick();
  };

  const handleConfirmPlayerSelect = () => {
    if (!selectedPlayer) return;
    setLocalStage('ADDING_TO_TEAM');
    soundFx.playClick();
  };

  if (localStage === 'ADDING_TO_TEAM' && selectedPlayer) {
    return (
      <PlayerReveal
        selectedOption={{ id: 'wheel', player: selectedPlayer, clues: { exposedClues: [] } }}
        otherOptions={[]}
        slots={slots}
        onContinue={onContinue}
        isBriefcaseMode={true}
      />
    );
  }

  // All players on the selected source team, sorted by display OVR.
  const allTeamPlayers = selectedTeam
    ? allPlayers.filter((p) => p.teamAbbrev === selectedTeam.abbrev).sort((a, b) => getResolvedOvr(b) - getResolvedOvr(a))
    : [];

  const undraftedCount = allTeamPlayers.filter((p) => !draftedIds.has(p.id)).length;

  const teamBranding = selectedTeam ? getTeamBranding(selectedTeam.abbrev) : null;

  // Helper to find who drafted a taken player using the authoritative playerOwnerById map
  const getDrafterInfo = (playerId: string) => {
    const ownerId = playerOwnerById.get(playerId);
    if (ownerId !== undefined) {
      const ownerTeam = fantasyTeams.find((t) => String(t.id) === ownerId);
      if (ownerTeam) {
        return {
          name: ownerTeam.name,
          isUser: ownerTeam.isUser,
          draftSlot: ownerTeam.draftSlot,
          abbrev: ownerTeam.abbrev,
        };
      }
    }
    return null;
  };

  const isEvenRound = roundNumber % 2 === 0;
  const effectiveDraftSlot = isEvenRound ? (31 - userDraftSlot) : userDraftSlot;

  return (
    <div className="w-full flex flex-col items-center max-w-5xl mx-auto px-4 py-4">
      {/* HEADER */}
      <div className="text-center mb-4 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-xs font-black tracking-widest text-amber-400 uppercase mb-3 shadow-md"
        >
          <Disc className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '8s' }} />
          <span>YOUR PICK</span>
          <span className="text-slate-600">•</span>
          <span>ROUND {roundNumber} OF {rosterSize}</span>
          <span className="text-slate-600">•</span>
          <span className="text-emerald-400">DRAFT SLOT {effectiveDraftSlot} OF {fantasyTeams.length}</span>
        </motion.div>

        <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tighter italic">
          {localStage === 'READY_TO_SPIN' || localStage === 'SPINNING'
            ? 'SPIN FOR YOUR TEAM'
            : localStage === 'TEAM_LANDED'
            ? 'TEAM SELECTED!'
            : `SELECT FROM ${selectedTeam?.name.toUpperCase()}`}
        </h2>

        <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-lg mx-auto font-medium">
          {localStage === 'READY_TO_SPIN'
            ? `You draft as Slot #${effectiveDraftSlot} this round. Spin the ${fantasyTeams.length}-team wheel to claim a player from that opening roster!`
            : localStage === 'SPINNING'
            ? 'Wheel is spinning... landing on a team...'
            : localStage === 'TEAM_LANDED'
            ? `You landed on the ${selectedTeam?.name}! Choose your player below.`
            : `Draft any available undrafted player from the ${selectedTeam?.name}.`}
        </p>

        {/* DRAFT HISTORY STRIP */}
        {localStage === 'READY_TO_SPIN' && (
          <div className="mt-4 max-w-3xl w-full">
            <DraftHistoryStrip history={draftHistory} userDraftSlot={effectiveDraftSlot} />
          </div>
        )}
      </div>

      {/* WHEEL DISPLAY STAGE */}
      {(localStage === 'READY_TO_SPIN' || localStage === 'SPINNING' || localStage === 'TEAM_LANDED') && (
        <div className="flex flex-col items-center justify-center my-2 w-full">
          {/* WHEEL CONTAINER */}
          <div className="relative w-80 h-80 sm:w-[420px] sm:h-[420px] flex items-center justify-center my-4">
            {/* POINTER AT 12 O'CLOCK */}
            <div className="absolute -top-5 z-30 w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-t-[32px] border-t-amber-400 drop-shadow-[0_4px_12px_rgba(245,158,11,0.8)]" />

            {/* SVG WHEEL */}
            <div
              className="w-full h-full rounded-full border-4 border-amber-400/90 shadow-[0_0_60px_rgba(245,158,11,0.25)] overflow-hidden transition-transform duration-[4000ms] cubic-bezier(0.15,0.9,0.2,1.0)"
              style={{ transform: `rotate(${rotationDegree}deg)` }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full bg-slate-950">
                {teams.map((t, idx) => {
                  const branding = getTeamBranding(t.abbrev);
                  const sliceFill = branding.primaryColor || '#1e293b';
                  const isSelected = selectedTeam?.abbrev === t.abbrev && localStage === 'TEAM_LANDED';

                  if (numSlices === 1) {
                    return (
                      <g key={t.abbrev}>
                        <circle
                          cx="50"
                          cy="50"
                          r="50"
                          fill={sliceFill}
                          stroke={isSelected ? '#f59e0b' : '#090d16'}
                          strokeWidth={isSelected ? '1.5' : '0.5'}
                        />
                        {branding.logoUrl && (
                          <image
                            href={branding.logoUrl}
                            x="38"
                            y="38"
                            width="24"
                            height="24"
                            preserveAspectRatio="xMidYMid meet"
                          />
                        )}
                      </g>
                    );
                  }

                  const startAngle = idx * sliceAngle;
                  const endAngle = (idx + 1) * sliceAngle;
                  const startRad = (startAngle * Math.PI) / 180;
                  const endRad = (endAngle * Math.PI) / 180;

                  const x1 = 50 + 50 * Math.cos(startRad);
                  const y1 = 50 + 50 * Math.sin(startRad);
                  const x2 = 50 + 50 * Math.cos(endRad);
                  const y2 = 50 + 50 * Math.sin(endRad);

                  const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 0 1 ${x2} ${y2} Z`;

                  const midDeg = startAngle + sliceAngle / 2;
                  const midRad = (midDeg * Math.PI) / 180;

                  // Logo position centered cleanly in slice
                  const logoRadius = 33;
                  const logoX = 50 + logoRadius * Math.cos(midRad) - 2.8;
                  const logoY = 50 + logoRadius * Math.sin(midRad) - 2.8;

                  return (
                    <g key={t.abbrev}>
                      {/* SLICE POLYGON */}
                      <path
                        d={pathData}
                        fill={sliceFill}
                        stroke={isSelected ? '#f59e0b' : '#090d16'}
                        strokeWidth={isSelected ? '1.5' : '0.5'}
                      />

                      {/* TEAM LOGO IMAGE (NO TEXT ABBREVIATION FOR CLEAN WHEEL) */}
                      {branding.logoUrl && (
                        <image
                          href={branding.logoUrl}
                          x={logoX}
                          y={logoY}
                          width="5.6"
                          height="5.6"
                          preserveAspectRatio="xMidYMid meet"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* WHEEL CENTER HUB */}
            <div className="absolute z-20 w-16 h-16 rounded-full bg-slate-950 border-4 border-amber-400 flex items-center justify-center shadow-xl">
              <Disc className={`w-8 h-8 text-amber-400 ${localStage === 'SPINNING' ? 'animate-spin' : ''}`} />
            </div>
          </div>

          {/* SPIN / RESULT CONTROLS */}
          <div className="mt-4 flex flex-col items-center gap-4">
            {localStage === 'READY_TO_SPIN' && (
              <button
                onClick={handleSpin}
                className="px-12 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-lg uppercase tracking-widest rounded-xl transition-all shadow-[0_0_30px_rgba(245,158,11,0.4)] flex items-center gap-2 cursor-pointer"
              >
                SPIN WHEEL <Sparkles className="w-5 h-5" />
              </button>
            )}

            {localStage === 'SPINNING' && (
              <div className="text-amber-400 font-black uppercase tracking-widest animate-pulse text-sm">
                SPINNING WHEEL...
              </div>
            )}

            <WheelLandingModal
              isOpen={localStage === 'TEAM_LANDED'}
              team={selectedTeam}
              undraftedCount={undraftedCount}
              onConfirm={handleViewRoster}
            />
          </div>
        </div>
      )}

      {/* PLAYER SELECTION STAGE */}
      {localStage === 'PLAYER_SELECTION' && selectedTeam && teamBranding && (
        <div className="w-full flex flex-col items-center">
          {/* TEAM BANNER WITH LOGO & PALETTE */}
          <div
            className="w-full bg-slate-900 border-2 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-xl"
            style={{ borderColor: teamBranding.primaryColor || '#f59e0b' }}
          >
            <div className="flex items-center gap-3.5">
              <TeamLogo abbrev={selectedTeam.abbrev} sizeClass="w-12 h-12" />
              <div className="text-left">
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  {selectedTeam.name}
                </h3>
                <p className="text-xs text-slate-300 font-bold uppercase">
                  {undraftedCount} Available Undrafted Players ({allTeamPlayers.length - undraftedCount} Taken)
                </p>
              </div>
            </div>

          </div>

          {/* PLAYERS GRID WITH GREYED-OUT TAKEN PLAYERS SHOWING FANTASY TEAM */}
          {allTeamPlayers.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center max-w-md my-6">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-300">
                No players found for {selectedTeam.name}.
              </p>
              <button
                onClick={handleSpin}
                className="mt-4 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl cursor-pointer"
              >
                Respin Wheel
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full mb-8">
              {allTeamPlayers.map((player) => {
                const isTaken = draftedIds.has(player.id);
                const isSelected = selectedPlayer?.id === player.id;
                const drafter = isTaken ? getDrafterInfo(player.id) : null;

                return (
                  <div
                    key={player.id}
                    onClick={() => {
                      if (!isTaken) setSelectedPlayer(player);
                    }}
                    className={`
                      p-3 rounded-2xl border transition-all flex items-center gap-3 relative overflow-hidden
                      ${
                        isTaken
                          ? 'bg-slate-950/60 border-slate-800/60 opacity-60 grayscale-[30%] cursor-not-allowed select-none'
                          : isSelected
                          ? 'bg-amber-950/40 border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] cursor-pointer'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900 cursor-pointer'
                      }
                    `}
                  >
                    <PlayerHeadshotWithLogo
                      src={player.headshotUrl}
                      name={player.name}
                      teamAbbrev={player.teamAbbrev}
                    />

                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-black truncate uppercase leading-tight ${isTaken ? 'text-slate-400 line-through' : 'text-white'}`}>
                        {player.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 flex items-center gap-1">
                        <span>{player.displayPos || player.position}</span> • <span>{player.teamAbbrev}</span>
                      </div>

                      {isTaken && drafter ? (
                        <div className="mt-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800/80 text-[9px] font-bold">
                          <span className="text-rose-400 font-black tracking-wider uppercase shrink-0">TAKEN BY</span>
                          <FantasyTeamLogo abbrev={drafter.abbrev} sizeClass="w-3.5 h-3.5" />
                          <span className="truncate text-slate-300 font-semibold">
                            {drafter.isUser ? 'YOUR TEAM' : drafter.name.replace(' Fantasy', '')}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs font-black font-mono text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            {getResolvedOvr(player)} OVR
                          </span>
                        </div>
                      )}
                    </div>

                    {!isTaken && isSelected && (
                      <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-amber-400 shadow" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* DRAFT CONFIRM BUTTON */}
          {selectedPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="sticky bottom-4 z-40 bg-slate-950/95 border border-amber-500/80 backdrop-blur-md p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 max-w-md w-full"
            >
              <div className="flex items-center gap-2.5">
                <TeamLogo abbrev={selectedPlayer.teamAbbrev} sizeClass="w-8 h-8" />
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-400">
                    SELECTED PLAYER
                  </span>
                  <div className="text-sm font-black text-white uppercase">
                    {selectedPlayer.name} ({getResolvedOvr(selectedPlayer)} OVR)
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirmPlayerSelect}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center gap-1 shrink-0"
              >
                DRAFT PLAYER <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
