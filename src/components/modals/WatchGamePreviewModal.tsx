import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Play, Shield, ChevronRight, Tv } from 'lucide-react';
import { NBATeam, Game, NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { calculateTeamStrength } from '../../utils/playerRatings';
import { getPlayerHeadshot } from '../../utils/helpers';
import { StarterService } from '../../services/simulation/StarterService';
import { getPlayerImage } from '../central/view/bioCache';
import { RefereePickerModal } from './RefereePickerModal';
import { RigConfirmModal } from './RigConfirmModal';
import { fetchRefereeData, getRefereePhoto } from '../../data/photos';
import { pickBroadcasterForGame, BROADCASTER_NAMES, BROADCASTER_LOGOS, getBroadcasterDisplayName, FICTIONAL_BROADCASTER_BADGE } from '../../utils/broadcastingUtils';
import { getGameplan } from '../../store/gameplanStore';
import { getPlayersOnCourt } from '../../services/simulation/courtSize';
import { resolveRigGameOffer } from '../../services/referees/rigGame';
import type { RefereeData } from '../../data/photos/referees';
import { getScoutedDisplayOverall } from '../../utils/scoutingFuzz';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';

interface SelectedRef {
  id: string;
  name: string;
  slug: string;
  photo?: string;
  number?: string;
  isFictional?: boolean;
  ratings?: Record<string, number | null>;
  riggingProfile?: Record<string, unknown>;
}

interface WatchGamePreviewModalProps {
  game: Game;
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  players: NBAPlayer[];
  homeStartersOverride?: NBAPlayer[];
  awayStartersOverride?: NBAPlayer[];
  onClose: () => void;
  onConfirm: (riggedForTid?: number, watchLive?: boolean) => void;
}

export function resolvePreviewOverrideStarters(
  team: NBATeam,
  overridePlayers: NBAPlayer[],
  season: number,
  playersOnCourt: number,
): NBAPlayer[] {
  return StarterService.getProjectedStarters(
    team,
    overridePlayers,
    season,
    overridePlayers,
    true,
    playersOnCourt,
  );
}

export function resolvePreviewPlayerPortrait(player: NBAPlayer): string {
  const shared = getPlayerImage(player);
  if (shared) return shared;
  return getPlayerHeadshot(
    player.internalId,
    String((player as NBAPlayer & { nbaId?: string }).nbaId ?? '') || null,
  );
}

export const WatchGamePreviewModal: React.FC<WatchGamePreviewModalProps> = ({
  game, homeTeam, awayTeam, players,
  homeStartersOverride, awayStartersOverride,
  onClose, onConfirm
}) => {
  const { state, dispatchAction } = useGame();
  const playersOnCourt = getPlayersOnCourt(state.leagueStats);

  const isIntrasquad = homeTeam.id === awayTeam.id;

  // For non-NBA (external) teams tid ≥ 100, StarterService's `status === 'Active'`
  // filter produces an empty list. Fall back to top-5 by rating instead.
  const getStarters = (team: NBATeam, isHome: boolean): NBAPlayer[] => {
    if (isHome && homeStartersOverride && homeStartersOverride.length > 0) {
      return resolvePreviewOverrideStarters(team, homeStartersOverride, state.leagueStats.year, playersOnCourt);
    }
    if (!isHome && awayStartersOverride && awayStartersOverride.length > 0) {
      return resolvePreviewOverrideStarters(team, awayStartersOverride, state.leagueStats.year, playersOnCourt);
    }
    // GM's saved gameplan wins over StarterService for their own team
    if (state.gameMode === 'gm' && team.id === state.userTeamId) {
      const plan = getGameplan(team.id);
      if (plan?.starterIds?.length === playersOnCourt) {
        const byId = new Map(players.map(p => [p.internalId, p]));
        const picked = plan.starterIds
          .map(id => byId.get(id))
          .filter((p): p is NBAPlayer => !!p && p.tid === team.id);
        if (picked.length === playersOnCourt) return picked;
      }
    }
    if (team.id >= 100) {
      // External / non-NBA roster — pick 1C, 2F, 2G by position, sorted by overall
      const roster = players
        .filter(p => p.tid === team.id)
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
      return StarterService.getProjectedStarters(
        team,
        players,
        state.leagueStats.year,
        roster,
        true,
        playersOnCourt,
      );
    }
    return StarterService.getProjectedStarters(
      team,
      players,
      state.leagueStats.year,
      undefined,
      true,
      playersOnCourt,
    );
  };

  const homeStarters = getStarters(homeTeam, true);
  const awayStarters = getStarters(awayTeam, false);

  const exhibitionStrength = (starters: NBAPlayer[]) => starters.length > 0
    ? Math.round(starters.reduce((sum, player) => sum + getScoutedDisplayOverall(state, player, state.leagueStats.year), 0) / starters.length)
    : 0;
  const homeOvr = homeTeam.id < 0 ? exhibitionStrength(homeStarters) : calculateTeamStrength(homeTeam.id, players);
  const awayOvr = awayTeam.id < 0 ? exhibitionStrength(awayStarters) : calculateTeamStrength(awayTeam.id, players);
  // Broadcaster + tipoff time — prefer pre-attached data on game, compute as fallback
  const isFictional = state.leagueType === 'fictional';
  const gameBroadcastInfo = (() => {
    const bcId = game.broadcaster || '';
    if (game.broadcasterName && game.tipoffTime) {
      return {
        broadcasterName: getBroadcasterDisplayName(bcId || game.broadcasterName, isFictional) || game.broadcasterName,
        tipoffTime: game.tipoffTime,
      };
    }
    const mediaRights = state.leagueStats?.mediaRights;
    if (mediaRights) {
      const allTeams = state.teams || [];
      const { broadcasterName, tipoffTime } = pickBroadcasterForGame(
        game, mediaRights,
        allTeams.find((t: NBATeam) => t.id === game.homeTid),
        allTeams.find((t: NBATeam) => t.id === game.awayTid),
        allTeams,
      );
      return { broadcasterName: getBroadcasterDisplayName(bcId, isFictional) || broadcasterName, tipoffTime };
    }
    return { broadcasterName: isFictional ? 'League Pass' : 'League Pass', tipoffTime: '7:30 PM ET' };
  })();

  // Rig state
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [showRigPanel, setShowRigPanel] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [showRigConfirm, setShowRigConfirm] = useState(false);
  const [selectedRef, setSelectedRef] = useState<SelectedRef | null>(null);
  const [isSettlingRig, setIsSettlingRig] = useState(false);
  const canRigGame = state.gameMode === 'commissioner' && state.leagueType === 'fictional';

  // Preload ref photos when rig panel opens
  useEffect(() => {
    if (showRigPanel) fetchRefereeData();
  }, [showRigPanel]);

  const handleRefSelected = (ref: RefereeData) => {
    setSelectedRef({
      ...ref,
      photo: getRefereePhoto(ref.name) || undefined,
      number: String(ref.officialNumber ?? ref.id),
    });
    setShowRefPicker(false);
    setShowRigConfirm(true);
  };

  const selectedRigOffer = selectedRef && riggedForTid !== undefined
    ? resolveRigGameOffer(state, game.gid, selectedRef as RefereeData, riggedForTid)
    : undefined;

  const settleRigAndStart = async (watchLive: boolean) => {
    if (!selectedRef || riggedForTid === undefined || !selectedRigOffer?.settlement || !selectedRigOffer.canAfford) {
      return;
    }
    setIsSettlingRig(true);
    await dispatchAction({
      type: 'SETTLE_RIG_GAME_OFFER',
      payload: {
        gameId: game.gid,
        refereeId: selectedRef.id,
        favoredTid: riggedForTid,
      },
    });
    const effectiveRig = selectedRigOffer.settlement.outcome === 'success'
      ? riggedForTid
      : undefined;
    setShowRigConfirm(false);
    onConfirm(effectiveRig, watchLive);
    onClose();
  };

  const renderTeamPreview = (team: NBATeam, starters: NBAPlayer[], ovr: number, isHome: boolean) => {
    const isRigged = riggedForTid === team.id;

    return (
      <section className="flex min-w-0 flex-1 flex-col border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
        <div className="mb-5 flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[#111827] sm:h-20 sm:w-20">
            {team.logoUrl ? (
              <>
                <img
                  src={team.logoUrl}
                  alt=""
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                    event.currentTarget.nextElementSibling?.removeAttribute('hidden');
                  }}
                />
                <span hidden className="text-sm font-black text-slate-400">{team.abbrev}</span>
              </>
            ) : <span className="text-sm font-black text-slate-400">{team.abbrev}</span>}
            {isRigged && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                <Shield size={10} className="text-black" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">{isHome ? 'Home' : 'Away'}</p>
            <h3 className="truncate text-xl font-black uppercase tracking-tight text-white sm:text-2xl">{team.name}</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">OVR</span>
              <span className="font-mono text-xl font-black text-indigo-300">{ovr || '—'}</span>
              {team.id >= 0 && (
                <span className="text-sm font-bold text-slate-400 font-mono">{team.wins ?? 0}–{team.losses ?? 0}</span>
              )}
            </div>
          </div>
        </div>

        {!isIntrasquad ? (
          <div className="w-full space-y-3">
            <h4 className="mb-2 border-b border-white/10 pb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              Projected Lineup ({playersOnCourt})
            </h4>
            {starters.map((player) => {
              const rating = getScoutedDisplayOverall(state, player, state.leagueStats.year);
              const playerName = player.name ?? (player as any).playerName ?? 'Player';
              const playerId = player.internalId ?? (player as any).playerId ?? Math.random().toString();
              const portraitSrc = resolvePreviewPlayerPortrait(player);
              return (
                <div key={playerId} className="flex min-h-12 items-center gap-3 border border-white/[0.06] bg-black/20 px-3 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.04]">
                  <PlayerPortrait
                    imgUrl={portraitSrc}
                    playerName={playerName}
                    playerIdentity={player}
                    portraitSeason={state.leagueStats.year}
                    size={40}
                  />
                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    <PlayerNameWithHover player={player} className="max-w-[150px] truncate text-left text-sm font-bold text-white sm:max-w-[190px]">{playerName}</PlayerNameWithHover>
                    <span className="text-[10px] font-bold text-slate-500">{player.pos}</span>
                  </div>
                  <div className={`text-lg font-black font-mono ${rating >= 90 ? 'text-amber-400' : rating >= 80 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {rating}
                  </div>
                </div>
              );
            })}
          </div>
        ) : isIntrasquad ? (
          <div className="w-full mt-4 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 text-center">
            <div className="text-3xl mb-2">🏀</div>
            <p className="text-slate-500 text-[10px] mt-1 uppercase tracking-widest">Intrasquad Scrimmage</p>
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-preview-title"
          className="relative flex max-h-[calc(100dvh-16px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080b12] shadow-2xl sm:max-h-[calc(100dvh-32px)] sm:rounded-[28px]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0d111b] p-4 sm:px-6 sm:py-5">
            <h2 id="game-preview-title" className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-white md:text-xl">
              <Play size={20} className="text-indigo-500" />
              Game Preview
            </h2>
            <button onClick={onClose} aria-label="Close game preview" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
              <X size={24} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#080b12]">
            <div className="grid grid-cols-1 gap-3 p-3 sm:p-5 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
              {renderTeamPreview(awayTeam, awayStarters, awayOvr, false)}

              <div className="flex shrink-0 flex-row items-center justify-center gap-3 py-1 md:flex-col md:px-2 md:py-0">
                <div className="text-3xl font-black italic tracking-tighter text-slate-700 md:text-5xl">VS</div>
                <div className="mt-2 md:mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  {new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="mt-1 text-[11px] font-bold text-indigo-400 text-center">
                  {gameBroadcastInfo.tipoffTime}
                </div>
                {(() => {
                  const bcId   = game.broadcaster || '';
                  const logoUrl = BROADCASTER_LOGOS[bcId];
                  return (
                    <div className="mt-2 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                      {isFictional ? (() => {
                        const badge = FICTIONAL_BROADCASTER_BADGE[bcId];
                        return badge ? (
                          <div className={`w-7 h-7 ${badge.bg} ${badge.shape} flex items-center justify-center overflow-hidden shrink-0`}>
                            <span className={`${badge.font} ${badge.text} leading-none select-none ${badge.initials.length <= 2 ? 'text-[9px]' : 'text-[7px]'}`}>{badge.initials}</span>
                          </div>
                        ) : <Tv size={13} className="text-slate-400 shrink-0" />;
                      })() : logoUrl ? (
                        <div className="w-7 h-7 bg-white rounded-md p-1 flex items-center justify-center overflow-hidden shrink-0">
                          <img
                            src={logoUrl}
                            alt={gameBroadcastInfo.broadcasterName}
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      ) : (
                        <Tv size={13} className="text-slate-400 shrink-0" />
                      )}
                      <span className="text-[10px] font-bold text-slate-300 whitespace-nowrap">
                        {gameBroadcastInfo.broadcasterName}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {renderTeamPreview(homeTeam, homeStarters, homeOvr, true)}
            </div>

            {canRigGame && homeTeam.id >= 0 && awayTeam.id >= 0 && !isIntrasquad && (
              <div className="px-6 md:px-12 pb-6">
                {!showRigPanel ? (
                  <button
                    onClick={() => setShowRigPanel(true)}
                    className="w-full py-3 rounded-2xl bg-white/3 hover:bg-white/6 border border-white/8 hover:border-amber-500/30 text-slate-500 hover:text-amber-400 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <Shield size={13} />
                    Rig This Game
                  </button>
                ) : (
                  <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-4">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Select Favored Team</p>
                    <div className="flex gap-3">
                      {[awayTeam, homeTeam].map(team => (
                        <button
                          key={team.id}
                          onClick={() => setRiggedForTid(riggedForTid === team.id ? undefined : team.id)}
                          className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                            riggedForTid === team.id
                              ? 'bg-amber-500/20 border-amber-500/60'
                              : 'bg-white/5 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <img src={team.logoUrl} alt={team.name} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
                          <span className="text-[10px] font-black text-white uppercase tracking-tight">{team.name}</span>
                          {riggedForTid === team.id && <span className="text-[9px] text-amber-400 font-bold">FAVORED</span>}
                        </button>
                      ))}
                    </div>
                    {riggedForTid !== undefined && (
                      <button
                        onClick={() => setShowRefPicker(true)}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        Choose Referee
                        <ChevronRight size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => { setShowRigPanel(false); setRiggedForTid(undefined); }}
                      className="w-full text-[9px] text-slate-600 hover:text-slate-400 font-bold uppercase tracking-widest transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 md:p-6 border-t border-white/10 bg-[#111] flex flex-col md:flex-row justify-end gap-3 md:gap-4 shrink-0">
            <button
              onClick={() => {
                if (riggedForTid !== undefined) {
                  setShowRefPicker(true);
                } else {
                  onConfirm(undefined, false);
                  onClose();
                }
              }}
              className="w-full md:w-auto px-8 py-3 md:py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl md:rounded-2xl font-bold transition-all uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2"
            >
              Simulate Only
            </button>
            <button
              onClick={() => {
                if (riggedForTid !== undefined) {
                  setShowRefPicker(true);
                } else {
                  onConfirm(undefined, true);
                  onClose();
                }
              }}
              className="w-full md:w-auto px-8 py-3 md:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl md:rounded-2xl font-bold transition-all shadow-xl shadow-indigo-500/20 uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2"
            >
              {riggedForTid !== undefined ? (
                <>
                  <Shield size={16} />
                  Choose Referee →
                </>
              ) : (
                <>
                  <Play size={16} />
                  Watch Game Live
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>

      {showRefPicker && (
        <RefereePickerModal
          onSelect={handleRefSelected}
          onClose={() => setShowRefPicker(false)}
        />
      )}

      <RigConfirmModal
        isOpen={showRigConfirm}
        favoredTeamName={
          riggedForTid === homeTeam.id ? homeTeam.name :
          riggedForTid === awayTeam.id ? awayTeam.name : ''
        }
        refName={selectedRef?.name || ''}
        refNumber={selectedRef?.number || ''}
        refPhoto={selectedRef?.photo}
        amountMillion={selectedRigOffer?.settlement?.quotedAmountMillion ?? 0}
        personalWealthMillion={state.stats.personalWealth}
        isProcessing={isSettlingRig}
        onClose={() => setShowRigConfirm(false)}
        onWatchLive={() => void settleRigAndStart(true)}
        onJustSimulate={() => void settleRigAndStart(false)}
      />
    </>
  );
};
