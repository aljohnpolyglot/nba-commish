import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { K2_CATS, getRadarValues, type K2Data } from '../../services/simulation/convert2kAttributes';
import { convertTo2KRating } from '../../utils/helpers';
import { LEAGUE_DISPLAY_MULTIPLIERS } from '../../hooks/useLeagueScaledRatings';
import {
  fuzzRatingValue,
  getScoutedDisplayOverall,
  getScoutedDisplayPotential,
  getScoutedK2Data,
} from '../../utils/scoutingFuzz';
import { ensurePlayerRatingData, resolvePlayerRatingBundle, usePlayerRatingStore } from '../../store/playerRatingStore';
import { RadarChart, RatingBar, getRatingColor } from './PlayerRatingsModalShared';
import { PlayerRatingsProgressionTab } from './PlayerRatingsProgressionTab';
import { PlayerRatingsEditor } from './PlayerRatingsEditor';
import { usePlayerRatingsEditor } from './usePlayerRatingsEditor';
import { inferArchetype } from '../../services/scoutingReport';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { getTeamFullName } from '../../utils/teamNames';
import { getPlayerRatingPercentileProfile } from '../../services/scouting/percentileProfiles';

interface PlayerRatingsModalProps {
  player: NBAPlayer;
  season: number;
  onClose: () => void;
}
export const PlayerRatingsModal: React.FC<PlayerRatingsModalProps> = ({ player, season, onClose }) => {
  const { state, updatePlayerRatings } = useGame();
  const isGodMode = state.godModeEnabled === true;
  const ratingVersion = usePlayerRatingStore(s => s.version);
  const safeNumber = React.useCallback((value: number, fallback = 50) => (
    Number.isFinite(value) ? value : fallback
  ), []);

  React.useEffect(() => {
    ensurePlayerRatingData();
  }, []);
  const editor = usePlayerRatingsEditor({
    player,
    season,
    ratingVersion,
    isGodMode,
    updatePlayerRatings,
  });
  const { currentRatings, ratingBundle } = editor;
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [viewTab, setViewTab] = useState<'Ratings' | 'Progression'>('Ratings');
  const [progressPeriod, setProgressPeriod] = useState<'Career' | '3Y' | '1Y'>('Career');
  const simYear = state.leagueStats?.year ?? new Date().getFullYear();
  const displayOverall2k = getScoutedDisplayOverall(state, player, season);
  const displayPot2k = getScoutedDisplayPotential(state, player, season, season);

  const ratingHistory = useMemo(() => {
    const attrKeys = ['stre','spd','jmp','endu','ins','dnk','ft','fg','tp','oiq','diq','drb','pss','reb'];
    const history = (player.ratings ?? [])
      .filter((r: any) => r.season != null)
      .filter((r: any) => !player.retiredYear || r.season <= player.retiredYear)
      .sort((a: any, b: any) => a.season - b.season)
      .map((r: any) => {
        const baseOvr = (r.ovr && r.ovr > 0 && r.ovr <= 100)
          ? r.ovr
          : Math.round(attrKeys.reduce((s: number, k: string) => s + (r[k] ?? 50), 0) / attrKeys.length);
        return {
          season: `'${String(r.season).slice(-2)}`,
          ovr: fuzzRatingValue(
            convertTo2KRating(baseOvr, r.hgt ?? 50, r.tp),
            state,
            player,
            'ovr',
          ),
        };
      });
    if (!player.retiredYear && history.length > 0) {
      history[history.length - 1] = { ...history[history.length - 1], ovr: displayOverall2k };
    }
    return history;
  }, [player, state, displayOverall2k]);
  const team = state.teams.find(t => t.id === player.tid)
    ?? (state.nonNBATeams ?? []).find((t: any) => t.tid === player.tid);
  const teamColor = (team as any)?.primaryColor ?? '#6366f1';
  const isExternalLeague = !!LEAGUE_DISPLAY_MULTIPLIERS[player.status ?? ''];
  const k2 = ratingBundle.k2;
  const displayK2 = ratingBundle.displayK2;
  const scoutedDisplayK2 = useMemo(
    () => getScoutedK2Data(state, player, displayK2),
    [state, player, displayK2],
  );
  const k2RadarValues = getRadarValues(scoutedDisplayK2, displayOverall2k);
  const percentileProfile = useMemo(
    () => getPlayerRatingPercentileProfile(state, player, season),
    [player, ratingVersion, season, state],
  );
  const playerAge = ratingBundle.age;
  const playerArchetype = (player as any).developmentArchetype ?? inferArchetype(player);
  const identityLine = [
    normalizePositionLabel(player.pos, player.hgt),
    playerArchetype,
    team ? getTeamFullName(team as any) : null,
    `Age ${playerAge}`,
  ].filter(Boolean).join(' • ');

  const snapshotInfo = useMemo(() => {
    const ratings = (player.ratings ?? []) as any[];
    if (ratings.length === 0) return { displayK2: scoutedDisplayK2, year: simYear, label: 'Now' };
    const sorted = [...ratings].filter(r => r.season != null).sort((a, b) => a.season - b.season);
    let target: any | undefined;
    let label = 'Rookie';
    if (progressPeriod === 'Career') {
      target = sorted[0];
      label = `Rookie '${String(target?.season ?? '').slice(-2)}`;
    } else if (progressPeriod === '3Y') {
      const yr = simYear - 3;
      target = sorted.find(r => r.season === yr) ?? [...sorted].reverse().find(r => r.season <= yr) ?? sorted[0];
      label = `'${String(yr).slice(-2)}`;
    } else {
      const yr = simYear - 1;
      target = sorted.find(r => r.season === yr) ?? [...sorted].reverse().find(r => r.season <= yr) ?? sorted[0];
      label = `'${String(yr).slice(-2)}`;
    }
    if (!target) return { displayK2: scoutedDisplayK2, year: simYear, label: 'Now' };
    const snapshotK2 = resolvePlayerRatingBundle(
      player,
      simYear,
      target.season,
      { ratingsOverride: target },
    ).displayK2;
    return {
      displayK2: getScoutedK2Data(state, player, snapshotK2),
      year: target.season ?? simYear,
      label,
    };
  }, [player, progressPeriod, simYear, scoutedDisplayK2, ratingVersion, state]);

  const mentorEntries = useMemo(() => {
    const history = player.mentorHistory ?? [];
    if (history.length === 0 && !player.mentorId) return [];
    const playerById = new Map<string, any>();
    for (const p of state.players) playerById.set((p as any).internalId, p);
    const open = history.find(h => !h.endDate);
    let entries = history;
    if (player.mentorId && !open) {
      entries = [...history, { mentorId: player.mentorId, startDate: 'unknown' }];
    }
    return entries.map(h => ({
      ...h,
      mentor: playerById.get(h.mentorId) ?? null,
    }));
  }, [player.mentorHistory, player.mentorId, state.players]);

  const toggleCat = (k: string) => {
    setCollapsedCats(prev => ({ ...prev, [k]: !prev[k] }));
  };

  const potK2 = displayPot2k;
  const displayOverallText = String(displayOverall2k);
  const displayPotText = String(displayPot2k);
  const ovrColor = getRatingColor(displayOverall2k);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[70] flex items-center justify-center p-0 md:p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full h-full md:h-auto md:max-h-[92vh] md:max-w-2xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex-shrink-0 p-4 md:p-6 border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <PlayerPortrait
                  imgUrl={player.imgURL}
                  face={(player as any).face}
                  teamLogoUrl={team && 'logoUrl' in team ? team.logoUrl : undefined}
                  overallRating={player.overallRating}
                  ovrLabel={displayOverallText}
                  ratings={player.ratings}
                  playerName={player.name}
                  size={56}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-black uppercase tracking-tight text-white leading-none truncate">
                    {player.name}
                  </h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {identityLine}
                  </p>
                  {isExternalLeague && (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/25 rounded-full text-[9px] font-black text-amber-400 uppercase tracking-widest">
                      {player.status}
                    </span>
                  )}
                </div>
                <div
                  className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 shadow-lg ml-1"
                  style={{ borderColor: ovrColor, backgroundColor: `${ovrColor}18` }}
                >
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">OVR</span>
                  <span className="text-2xl font-black leading-none mt-0.5" style={{ color: ovrColor }}>{displayOverallText}</span>
                </div>
                {(() => {
                  const potDisplay = displayPot2k;
                  const potColor = potDisplay >= 90 ? '#3b82f6' : potDisplay >= 80 ? '#22c55e' : potDisplay >= 70 ? '#eab308' : '#94a3b8';
                  return (
                    <div
                      className="flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border border-slate-700 bg-slate-800/50 ml-1"
                    >
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">POT</span>
                      <span className="text-lg font-black leading-none mt-0.5" style={{ color: potColor }}>{displayPotText}</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isGodMode && (
                <button
                  onClick={editor.toggleEditing}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    editor.editMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  <Edit2 size={12} />
                  {editor.editMode ? 'Cancel' : 'Edit Ratings'}
                </button>
                )}
                {isGodMode && editor.editMode && (
                  <button
                    onClick={editor.save}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-500 transition-all"
                  >
                    <Save size={12} />
                    Save
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-4 md:p-6 space-y-4">
              <div>
                <RadarChart values={percentileProfile.radarValues} />
                <p className="-mt-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {percentileProfile.cohortLabel} percentile · {percentileProfile.cohortSize} players
                </p>
              </div>

              {editor.editMode ? (
                <PlayerRatingsEditor
                  k2={k2}
                  onDetailChange={editor.changeDetail}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex rounded-xl overflow-hidden border border-slate-700">
                    {(['Ratings', 'Progression'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setViewTab(tab)}
                        className={`flex-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                          viewTab === tab
                            ? tab === 'Ratings' ? 'bg-sky-600 text-white' : 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {viewTab === 'Ratings' && (
                    <div className="space-y-3">
                      {K2_CATS.map(cat => {
                        const catData = scoutedDisplayK2[cat.k as keyof typeof scoutedDisplayK2];
                        const isCollapsed = collapsedCats[cat.k] ?? false;
                        const catColor = getRatingColor(catData.ovr);
                        return (
                          <div key={cat.k} className="bg-slate-800/50 rounded-2xl overflow-hidden border border-slate-800">
                            <button
                              onClick={() => toggleCat(cat.k)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black uppercase tracking-widest w-6 text-center" style={{ color: catColor }}>{cat.k}</span>
                                <span className="text-sm font-bold text-white">{cat.n}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black" style={{ color: catColor }}>{safeNumber(catData.ovr)}</span>
                                {isCollapsed ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronUp size={14} className="text-slate-500" />}
                              </div>
                            </button>
                            {!isCollapsed && (
                              <div className="px-4 pb-3 pt-1 border-t border-slate-700/50">
                                {cat.sub.map((subName, idx) => (
                                  <RatingBar key={subName} value={safeNumber(catData.sub[idx] ?? 50)} label={subName} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* POT bar — always at bottom of K2 tab */}
                      {(() => {
                        const potColor = potK2 >= 90 ? '#3b82f6' : potK2 >= 80 ? '#22c55e' : potK2 >= 70 ? '#eab308' : '#94a3b8';
                        return (
                          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Potential</span>
                              <span className="text-sm font-black" style={{ color: potColor }}>{potK2}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-700/60 rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${potK2}%`, backgroundColor: potColor }}
                                />
                              </div>
                              <span className="text-[9px] text-slate-500 font-bold w-20 text-right">
                                {playerAge >= 29 ? 'Peak (29+)' : `Age ${playerAge} proj.`}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {viewTab === 'Progression' && (
                    <PlayerRatingsProgressionTab
                      player={player}
                      currentRatings={currentRatings}
                      ratingHistory={ratingHistory}
                      overall2k={displayOverall2k}
                      teamColor={teamColor}
                      progressPeriod={progressPeriod}
                      setProgressPeriod={setProgressPeriod}
                      snapshotInfo={snapshotInfo as { displayK2: K2Data; year: number; label: string }}
                      displayK2={scoutedDisplayK2 as K2Data}
                      collapsedCats={collapsedCats}
                      setCollapsedCats={setCollapsedCats}
                      radarValues={k2RadarValues}
                      mentorEntries={mentorEntries as Array<{
                        mentorId: string;
                        startDate?: string;
                        endDate?: string;
                        mentor: (NBAPlayer & { mentorExp?: number }) | null;
                      }>}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
