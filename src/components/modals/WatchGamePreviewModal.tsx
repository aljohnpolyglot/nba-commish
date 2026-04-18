import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Play, Shield, ChevronRight, Tv } from 'lucide-react';
import { NBATeam, Game, NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { calculateTeamStrength } from '../../utils/playerRatings';
import { convertTo2KRating, getPlayerHeadshot, getPlayersForExhibitionTeam, extractNbaId } from '../../utils/helpers';
import { StarterService } from '../../services/simulation/StarterService';
import { getPlayerImage } from '../central/view/bioCache';
import { REFS } from '../central/view/LeagueOfficeSearcher';
import { RefereePickerModal } from './RefereePickerModal';
import { RigConfirmModal } from './RigConfirmModal';
import { fetchRefereeData, getRefereePhoto } from '../../data/photos';
import { pickBroadcasterForGame, BROADCASTER_NAMES, BROADCASTER_LOGOS } from '../../utils/broadcastingUtils';
import { getGameplan } from '../../store/gameplanStore';

interface SelectedRef {
  id: string;
  name: string;
  slug: string;
  photo?: string;
  number?: string;
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

export const WatchGamePreviewModal: React.FC<WatchGamePreviewModalProps> = ({
  game, homeTeam, awayTeam, players,
  homeStartersOverride, awayStartersOverride,
  onClose, onConfirm
}) => {
  const { state } = useGame();

  const isCelebrity = !!(game as any).isCelebrityGame;
  const isRisingStars = !!(game as any).isRisingStars;
  const isAllStar = !!(game as any).isAllStar;
  const isIntrasquad = homeTeam.id === awayTeam.id;

  // For non-NBA (external) teams tid ≥ 100, StarterService's `status === 'Active'`
  // filter produces an empty list. Fall back to top-5 by rating instead.
  const getStarters = (team: NBATeam, isHome: boolean): NBAPlayer[] => {
    if (isHome && homeStartersOverride && homeStartersOverride.length > 0)
      return homeStartersOverride.slice(0, 5);
    if (!isHome && awayStartersOverride && awayStartersOverride.length > 0)
      return awayStartersOverride.slice(0, 5);
    // GM's saved gameplan wins over StarterService for their own team
    if (state.gameMode === 'gm' && team.id === state.userTeamId) {
      const plan = getGameplan(team.id);
      if (plan?.starterIds?.length === 5) {
        const byId = new Map(players.map(p => [p.internalId, p]));
        const picked = plan.starterIds
          .map(id => byId.get(id))
          .filter((p): p is NBAPlayer => !!p && p.tid === team.id);
        if (picked.length === 5) return picked;
      }
    }
    if (isCelebrity || isRisingStars || isAllStar)
      return getPlayersForExhibitionTeam(game, isHome, state.allStar, players).slice(0, 5);
    if (team.id >= 100) {
      // External / non-NBA roster — pick 1C, 2F, 2G by position, sorted by overall
      const roster = players
        .filter(p => p.tid === team.id)
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
      const starters: NBAPlayer[] = [];
      const used = new Set<string>();
      const pickPos = (posTokens: string[], need: number) => {
        for (const p of roster) {
          if (need === 0) break;
          if (used.has(p.internalId)) continue;
          if (posTokens.some(tok => (p.pos ?? '').includes(tok))) {
            starters.push(p); used.add(p.internalId); need--;
          }
        }
        // fill gaps from remaining roster
        for (const p of roster) {
          if (need === 0) break;
          if (!used.has(p.internalId)) { starters.push(p); used.add(p.internalId); need--; }
        }
      };
      pickPos(['C'], 1);
      pickPos(['F'], 2);
      pickPos(['G'], 2);
      // safety — shouldn't be needed but fill if still short
      for (const p of roster) {
        if (starters.length >= 5) break;
        if (!used.has(p.internalId)) starters.push(p);
      }
      return starters;
    }
    return StarterService.getProjectedStarters(team, players);
  };

  const homeStarters = getStarters(homeTeam, true);
  const awayStarters = getStarters(awayTeam, false);

  const homeOvr = homeTeam.id < 0 ? 85 : calculateTeamStrength(homeTeam.id, players);
  const awayOvr = awayTeam.id < 0 ? 85 : calculateTeamStrength(awayTeam.id, players);

  // Broadcaster + tipoff time — prefer pre-attached data on game, compute as fallback
  const gameBroadcastInfo = (() => {
    if (game.broadcasterName && game.tipoffTime) {
      return { broadcasterName: game.broadcasterName, tipoffTime: game.tipoffTime };
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
      return { broadcasterName, tipoffTime };
    }
    return { broadcasterName: 'NBA League Pass', tipoffTime: '7:30 PM ET' };
  })();

  // Rig state
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [showRigPanel, setShowRigPanel] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [showRigConfirm, setShowRigConfirm] = useState(false);
  const [selectedRef, setSelectedRef] = useState<SelectedRef | null>(null);

  // Preload ref photos when rig panel opens
  useEffect(() => {
    if (showRigPanel) fetchRefereeData();
  }, [showRigPanel]);

  const handleRefSelected = (ref: { id: string; name: string; slug: string }) => {
    setSelectedRef({
      ...ref,
      photo: getRefereePhoto(ref.name) || undefined,
      number: ref.id,
    });
    setShowRefPicker(false);
    setShowRigConfirm(true);
  };

  const handleRigWatchLive = () => {
    setShowRigConfirm(false);
    onConfirm(riggedForTid, true);
    onClose();
  };

  const handleRigJustSimulate = () => {
    setShowRigConfirm(false);
    onConfirm(riggedForTid, false);
    onClose();
  };

  const renderTeamPreview = (team: NBATeam, starters: NBAPlayer[], ovr: number, isHome: boolean) => {
    const teamLogo = isCelebrity && isHome
      ? 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRffhUYYZKE2ShRfkq_jZsd'
      : team.logoUrl;

    const isRigged = riggedForTid === team.id;

    return (
      <div className={`flex flex-col flex-1 ${isHome ? 'items-end text-right' : 'items-start text-left'}`}>
        <div className={`flex items-center gap-4 mb-6 ${isHome ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className="relative">
            <img src={teamLogo} alt={team.name} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" referrerPolicy="no-referrer" />
            {isRigged && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                <Shield size={10} className="text-black" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">{team.name}</h3>
            <div className={`flex items-center gap-3 mt-1 ${isHome ? 'justify-end' : 'justify-start'}`}>
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">OVR</span>
              <span className="text-2xl font-black font-mono text-indigo-400">{ovr}</span>
              {team.id >= 0 && (
                <span className="text-sm font-bold text-slate-400 font-mono">{team.wins ?? 0}–{team.losses ?? 0}</span>
              )}
            </div>
          </div>
        </div>

        {!isCelebrity && !isIntrasquad ? (
          <div className="w-full space-y-3">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-white/10 pb-2">Projected Starters</h4>
            {starters.map((player) => {
              const rating = convertTo2KRating(player.overallRating || (player as any).ovr || (player as any).rating || 60, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp);
              const playerName = player.name ?? (player as any).playerName ?? 'Player';
              const playerId = player.internalId ?? (player as any).playerId ?? Math.random().toString();
              const nbaId = (player as any).nbaId || extractNbaId(player.imgURL || "", playerName);
              // For external players with no NBA CDN ID, use imgURL directly
              const portraitSrc = nbaId
                ? getPlayerHeadshot(playerId, nbaId)
                : (player.imgURL || getPlayerHeadshot(playerId, null));
              return (
                <div key={playerId} className={`flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5 ${isHome ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden flex-shrink-0 border border-white/10 relative">
                    <img
                      src={portraitSrc}
                      alt={playerName}
                      className="w-full h-full object-cover absolute inset-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(playerName)}&background=0D9488&color=fff`;
                      }}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className={`flex flex-col flex-1 ${isHome ? 'items-end' : 'items-start'}`}>
                    <span className="text-sm font-bold text-white truncate max-w-[120px] md:max-w-[160px]">{playerName}</span>
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
        ) : (
          <div className="w-full mt-4 p-4 rounded-2xl bg-fuchsia-500/5 border border-fuchsia-500/20 text-center">
            <div className="text-3xl mb-2">🎤🎬🏀</div>
            <p className="text-fuchsia-300 text-sm font-bold">Celebrity Roster</p>
            <p className="text-slate-500 text-[10px] mt-1 uppercase tracking-widest">Exhibition Matchup</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-[#0a0a0a] border border-white/10 rounded-[24px] md:rounded-[32px] w-full max-w-5xl flex flex-col shadow-2xl overflow-hidden max-h-[calc(100dvh-32px)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 md:p-6 border-b border-white/10 bg-[#111] shrink-0">
            <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Play size={20} className="text-indigo-500" />
              Game Preview
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-gradient-to-b from-[#111] to-[#0a0a0a]">
            <div className="flex flex-col md:flex-row gap-8 md:gap-12 p-6 md:p-12">
              {renderTeamPreview(awayTeam, awayStarters, awayOvr, false)}

              <div className="flex flex-col items-center justify-center py-4 md:py-0 shrink-0">
                <div className="text-4xl md:text-6xl font-black text-slate-800 italic tracking-tighter">VS</div>
                <div className="mt-2 md:mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  {new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="mt-1 text-[11px] font-bold text-indigo-400 text-center">
                  {gameBroadcastInfo.tipoffTime}
                </div>
                {!isCelebrity && !isAllStar && !isRisingStars && (() => {
                  const bcId   = game.broadcaster || '';
                  const logoUrl = BROADCASTER_LOGOS[bcId];
                  return (
                    <div className="mt-2 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                      {logoUrl ? (
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

            {/* Rig Panel */}
            {!isCelebrity && !isAllStar && !isRisingStars && !isIntrasquad && (
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
              onClick={onClose}
              className="w-full md:w-auto px-8 py-3 md:py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl md:rounded-2xl font-bold transition-all uppercase tracking-widest text-[10px] md:text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm(riggedForTid, false);
                onClose();
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
        onClose={() => setShowRigConfirm(false)}
        onWatchLive={handleRigWatchLive}
        onJustSimulate={handleRigJustSimulate}
      />
    </>
  );
};
