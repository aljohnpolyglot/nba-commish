import { useState } from 'react';
import { DevArchetype, Player, IndividualIntensity, Staffing, Team, TrainingParadigm, Allocations } from '../types';
import { AlertCircle, Info, ChevronRight, GraduationCap } from 'lucide-react';
import { Tooltip } from './ToolTip';
import { ARCHETYPE_NAMES, getFocusWeights, ARCHETYPE_PROFILES } from '../constants/archetypes';
import { ATTRIBUTE_LABELS } from '../constants/trainingSystems';
import { TrainingFocusModal } from './TrainingFocusModal';
import { MentorshipModal } from './MentorshipModal';
import { PlayerProgressionModal } from './PlayerProgressionModal';
import { PlayerNameWithHover } from '../../components/shared/PlayerNameWithHover';
import type { NBAPlayer } from '../../types';

interface Props {
  roster: Player[];
  staffing: Staffing;
  teams: Team[];
  /** Map TrainingTeam.id → NBAPlayer so the row can render PlayerNameWithHover. */
  nbaPlayersById?: Map<string, NBAPlayer>;
  /** Current league year — passed through to PlayerProgressionModal for real history. */
  currentYear?: number;
  currentDate?: string;
  trainingCalendar?: Record<string, { intensity: number; paradigm: TrainingParadigm; allocations: Allocations; auto?: boolean }>;
  updateDevFocus: (playerId: string, focus: DevArchetype) => void;
  updateIndividualIntensity: (playerId: string, intensity: IndividualIntensity) => void;
  updateMentor: (playerId: string, mentorId: string | undefined) => void;
  logs: string[];
}

export function RosterView({ roster, staffing, teams, nbaPlayersById, currentYear, currentDate, trainingCalendar, updateDevFocus, updateIndividualIntensity, updateMentor, logs }: Props) {
  const [focusModalPlayerId, setFocusModalPlayerId] = useState<string | null>(null);
  const [mentorshipModalPlayerId, setMentorshipModalPlayerId] = useState<string | null>(null);
  const [progressionModalPlayerId, setProgressionModalPlayerId] = useState<string | null>(null);

  const baseFuzz = 20;
  const scoutPA = staffing.chiefScout?.attributes.judgingPlayerPotential || 0;
  const scoutCA = staffing.chiefScout?.attributes.judgingPlayerAbility || 0;
  const analyticCA = staffing.headOfAnalytics?.attributes.judgingPlayerAbility || 0;
  const analyticPA = staffing.headOfAnalytics?.attributes.judgingPlayerPotential || 0;

  const caFuzz = Math.max(0, Math.round(baseFuzz - (analyticCA * 0.8) - (scoutCA * 0.2)));
  const paFuzz = Math.max(0, Math.round(baseFuzz - (scoutPA * 0.8) - (analyticPA * 0.2)));

  const renderFuzzedValue = (value: number, _fuzzLevel: number) => {
     return Math.round(value).toString();
  };

  const getEffectiveOvr = (player: Player) => {
    let eff = player.ovr;
    if (player.fatigue > 80) eff -= 4;
    else if (player.fatigue > 60) eff -= 2;
    // if (player.sharpness < 30) eff -= 3;
    // else if (player.sharpness > 80) eff += 2;
    if (player.morale < 30) eff -= 2;
    else if (player.morale > 80) eff += 1;
    return eff;
  };

  // Tier colors mirror TeamOfficeRosterView (the General Manager view) so the
  // Training Center reads the same way as the rest of the game.
  const getOvrColor = (ovr: number) => {
    if (ovr >= 90) return 'text-blue-300';
    if (ovr >= 85) return 'text-emerald-300';
    if (ovr >= 78) return 'text-amber-300';
    return 'text-slate-400';
  };
  const getPotColor = (pot: number) => {
    if (pot >= 90) return 'text-blue-300/80';
    if (pot >= 85) return 'text-emerald-300/80';
    if (pot >= 78) return 'text-amber-300/80';
    return 'text-slate-500';
  };
  const getMoodBarColor = (score: number) => {
    if (score >= 5) return 'bg-emerald-400';
    if (score >= 1) return 'bg-amber-400';
    if (score >= -1) return 'bg-slate-400';
    return 'bg-rose-400';
  };

  const getMoraleColor = (val: number) => {
    if (val > 80) return 'text-emerald-400';
    if (val > 60) return 'text-blue-400';
    if (val > 40) return 'text-yellow-400';
    if (val > 20) return 'text-orange-400';
    return 'text-red-500';
  };

  const getMoraleString = (val: number) => {
    if (val > 85) return 'Superb';
    if (val > 70) return 'Good';
    if (val > 45) return 'Okay';
    if (val > 25) return 'Poor';
    return 'Abysmal';
  };


  const getInjuryRisk = (fatigue: number) => {
    if (fatigue > 85) return { label: 'RED ZONE', color: 'text-red-500 font-bold bg-red-500/10 border-red-500/30' };
    if (fatigue > 70) return { label: 'HIGH', color: 'text-orange-500 font-bold bg-orange-500/10 border-orange-500/30' };
    if (fatigue > 50) return { label: 'MODERATE', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30' };
    return { label: 'LOW', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' };
  };

  const veterans = roster.filter(p => p.age >= 28);

  const activeFocusPlayer = roster.find(p => p.id === focusModalPlayerId);

  return (
    <div className="grid grid-cols-1 gap-8 mt-8">
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden backdrop-blur-xl">
        <div className="p-6 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/50">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Active Roster</h2>
            <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">
               <span>Total: {roster.length} Players</span>
            </div>
        </div>
        <div className="overflow-x-auto custom-scrollbar relative">
          <table className="w-full text-left text-sm text-slate-300 min-w-[900px] border-separate border-spacing-0">
            <thead className="text-[10px] uppercase bg-slate-950/40 text-slate-500 font-black tracking-widest border-b border-slate-800/40 sticky top-0 z-20">
              <tr>
                <th className="px-3 py-2 md:px-6 md:py-4 sticky left-0 bg-slate-950 z-30 min-w-[140px] md:min-w-[200px]">Player</th>
                <th className="px-3 py-2 md:px-6 md:py-4 text-center">OVR</th>
                <th className="px-3 py-2 md:px-6 md:py-4 text-center">POT</th>
                <th className="px-3 py-2 md:px-6 md:py-4 text-center">YWT</th>
                <th className="px-3 py-2 md:px-6 md:py-4 min-w-[120px]">Conditioning</th>
                <th className="px-3 py-2 md:px-6 md:py-4 text-center">Morale</th>
                <th className="px-3 py-2 md:px-6 md:py-4 w-[140px] md:w-[180px]">Dev Focus</th>
                <th className="px-3 py-2 md:px-6 md:py-4 w-[140px] md:w-[180px]">Mentorship</th>
                <th className="px-3 py-2 md:px-6 md:py-4 min-w-[120px]">Intensity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {roster.map((player) => {
                const effOvr = getEffectiveOvr(player);
                const diff = (effOvr - player.ovr).toFixed(1);
                const diffStr = Number(diff) > 0 ? `+${diff}` : diff;

                 return (
                 <tr key={player.id} className="group hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setProgressionModalPlayerId(player.id)}>
                  <td className="px-3 py-3 md:px-6 md:py-4 md:pb-5 sticky left-0 bg-slate-900 group-hover:bg-slate-800/50 z-10 transition-colors border-r border-slate-800/30">
                    <div className="flex items-center gap-2 md:gap-4">
                      <div className="relative group/avatar">
                        {player.imgURL ? (
                          <img src={player.imgURL} alt="" className="w-8 h-8 md:w-12 md:h-12 aspect-square rounded-full object-cover bg-slate-800 border border-slate-700 shadow-lg" />
                        ) : (
                          <div className="w-8 h-8 md:w-12 md:h-12 aspect-square rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 font-black text-sm md:text-xl shrink-0 group-hover/avatar:text-blue-400 transition-colors">
                            {player.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-xs md:text-sm text-white tracking-tight flex items-center gap-1 md:gap-2 truncate">
                          {(() => {
                            const nbaP = nbaPlayersById?.get(player.id);
                            return nbaP ? (
                              <PlayerNameWithHover player={nbaP} className="group-hover:text-blue-400 transition-colors truncate">
                                {player.name}
                              </PlayerNameWithHover>
                            ) : (
                              <span className="group-hover:text-blue-400 transition-colors cursor-default truncate">{player.name}</span>
                            );
                          })()}
                          {player.injury && <span className="text-red-500 animate-pulse"><AlertCircle size={12} className="md:w-[14px] md:h-[14px]" /></span>}
                        </div>
                        <div className="text-[9px] md:text-[10px] text-slate-500 mt-0.5 md:mt-1 font-bold uppercase tracking-widest flex items-center gap-1 md:gap-2">
                          <span className="text-blue-500 bg-blue-500/10 px-1 md:px-1.5 py-0.5 rounded border border-blue-500/20">{player.pos || 'SF'}</span>
                          <span>{player.age} YRS</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                       <Tooltip text={`Actual: ${player.ovr.toFixed(1)} | Season Avg: ${effOvr.toFixed(1)}`}>
                         <div className="flex items-baseline justify-center gap-1 whitespace-nowrap">
                           <span className={`text-base md:text-lg font-black tabular-nums tracking-tight ${getOvrColor(effOvr)}`}>
                             {renderFuzzedValue(effOvr, 0)}
                           </span>
                           {player.ovrDelta !== null && player.ovrDelta !== undefined && player.ovrDelta !== 0 && (
                             <span className={`text-[9px] font-bold ${player.ovrDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                               {player.ovrDelta > 0 ? '+' : ''}{player.ovrDelta}
                             </span>
                           )}
                         </div>
                       </Tooltip>
                       {Number(diff) !== 0 && (
                         <span className={`text-[9px] font-black ${Number(diff) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                           {diffStr} FORM
                         </span>
                       )}
                    </div>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 text-center">
                    <Tooltip text={`True Potential: ${player.pot}`}>
                      <div className="flex items-baseline justify-center gap-1 whitespace-nowrap">
                        <span className={`font-black text-xs md:text-sm font-mono tabular-nums tracking-tight ${getPotColor(player.pot)}`}>
                          {renderFuzzedValue(player.pot, paFuzz)}
                        </span>
                        {player.potDelta !== null && player.potDelta !== undefined && player.potDelta !== 0 && (
                          <span className={`text-[9px] font-bold ${player.potDelta > 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                            {player.potDelta > 0 ? '+' : ''}{player.potDelta}
                          </span>
                        )}
                      </div>
                    </Tooltip>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 text-center">
                    {/* DOCUMENTATION: connect ywt with teamOverview in teamIntel from game state */}
                    <div className="text-slate-400 font-black text-sm md:text-base font-mono tracking-tight">
                      {player.ywt}
                    </div>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 min-w-[120px] md:min-w-[140px]">
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-[9px] font-black text-slate-500 tracking-widest">
                           <span>FATIGU</span>
                           <span className={getInjuryRisk(player.fatigue).color}>
                             {getInjuryRisk(player.fatigue).label}
                           </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                           <div
                             className={`h-full transition-all duration-500 ${player.fatigue > 75 ? 'bg-red-500' : player.fatigue > 40 ? 'bg-yellow-500' : 'bg-blue-500 shadow-[0_0_8px_#3b82f6]'}`}
                             style={{ width: `${player.fatigue}%` }}
                           />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 min-w-[140px] md:min-w-[160px]">
                    {/* Canonical mood bar — same renderer as TeamOfficeRosterView. */}
                    {(() => {
                      const moodScore = player.moodScore;
                      if (moodScore === undefined) {
                        return <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">—</span>;
                      }
                      const moodPct = Math.round(((moodScore + 10) / 20) * 100);
                      return (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                            <div className={`h-full rounded transition-all ${getMoodBarColor(moodScore)}`} style={{ width: `${moodPct}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-500 tabular-nums w-8 text-right shrink-0">
                            {moodScore >= 0 ? '+' : ''}{moodScore.toFixed(1)}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4">
                    <div className="min-w-[140px] md:min-w-[160px]">
                      <button
                        onClick={(e) => {
                           e.stopPropagation();
                           setFocusModalPlayerId(player.id);
                        }}
                        className={`group/btn flex items-center justify-between w-full p-2.5 md:p-4 rounded-xl md:rounded-[1.5rem] border text-[9px] md:text-[11px] font-black uppercase tracking-tight transition-all duration-300 ${
                          player.devFocus === 'Balanced'
                           ? 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-white'
                           : 'bg-blue-600/10 border-blue-500/40 text-blue-400 hover:bg-blue-600/20 hover:border-blue-500 shadow-xl shadow-black/20'
                        }`}
                      >
                        <div className="flex flex-col items-start truncate">
                           <span className="text-[8px] opacity-40 mb-0.5 tracking-[0.2em]">Program</span>
                           <span className="truncate">{player.devFocus}</span>
                        </div>
                        <ChevronRight size={14} className="opacity-40 group-hover/btn:opacity-100 group-hover/btn:translate-x-1 transition-all" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4">
                    <div className="relative group/mentor min-w-[140px] md:min-w-[160px]">
                      {(() => {
                        const mentor = roster.find(p => p.id === player.mentorId);
                        return (
                          <button
                            onClick={(e) => {
                               e.stopPropagation();
                               setMentorshipModalPlayerId(player.id);
                            }}
                            className={`group/mbtn flex items-center justify-between w-full p-2.5 md:p-4 rounded-xl md:rounded-[1.5rem] border text-[9px] md:text-[11px] font-black uppercase tracking-tight transition-all duration-300 ${
                              player.mentorId
                               ? 'bg-emerald-600/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/20 hover:border-emerald-500 shadow-xl shadow-black/20'
                               : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-white'
                            }`}
                          >
                            <div className="flex flex-col items-start truncate text-left">
                               <span className="text-[8px] opacity-40 mb-0.5 tracking-[0.2em]">Mentor</span>
                               <span className="truncate">{mentor ? mentor.name : 'Unassigned'}</span>
                            </div>
                            <GraduationCap size={14} className="opacity-40 group-hover/mbtn:opacity-100 transition-all" />
                          </button>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4">
                    <select
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      className={`relative z-10 bg-slate-950 border rounded-lg md:rounded-xl p-1.5 md:p-2.5 text-[9px] md:text-[10px] font-black uppercase tracking-tight outline-none w-full cursor-pointer
                        ${player.individualIntensity === 'Double' ? 'border-orange-500/30 text-orange-400 focus:border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]'
                        : player.individualIntensity === 'Half' ? 'border-emerald-500/30 text-emerald-400'
                        : player.individualIntensity === 'Rest' ? 'border-violet-500/30 text-violet-400'
                        : 'border-slate-800 text-slate-400 hover:border-slate-600'}`}
                      value={player.individualIntensity}
                      onChange={(e) => {
                        e.stopPropagation();
                        updateIndividualIntensity(player.id, e.target.value as IndividualIntensity);
                      }}
                    >
                      <option value="Rest">Rest</option>
                      <option value="Half">Light</option>
                      <option value="Normal">Normal</option>
                      <option value="Double">Heavy</option>
                    </select>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <TrainingFocusModal
        isOpen={!!focusModalPlayerId}
        onClose={() => setFocusModalPlayerId(null)}
        currentFocus={activeFocusPlayer?.devFocus || 'Balanced'}
        playerName={activeFocusPlayer?.name || ''}
        playerPos={activeFocusPlayer?.pos || 'SF'}
        playerAge={activeFocusPlayer?.age}
        playerStats={activeFocusPlayer?.stats}
        onSelect={(focus) => focusModalPlayerId && updateDevFocus(focusModalPlayerId, focus as DevArchetype)}
        imgURL={activeFocusPlayer?.imgURL}
      />

      <MentorshipModal
        isOpen={!!mentorshipModalPlayerId}
        onClose={() => setMentorshipModalPlayerId(null)}
        player={roster.find(p => p.id === mentorshipModalPlayerId) || null}
        roster={roster}
        teams={teams}
        onSelectMentor={(pId, mId) => updateMentor(pId, mId || undefined)}
      />

      <PlayerProgressionModal
        player={roster.find(p => p.id === progressionModalPlayerId) || null}
        nbaPlayer={progressionModalPlayerId ? nbaPlayersById?.get(progressionModalPlayerId) : undefined}
        currentYear={currentYear}
        currentDate={currentDate}
        trainingCalendar={trainingCalendar}
        team={(() => {
          const nbaP = progressionModalPlayerId ? nbaPlayersById?.get(progressionModalPlayerId) : undefined;
          return nbaP ? teams.find(t => t.tid === nbaP.tid) : undefined;
        })()}
        onClose={() => setProgressionModalPlayerId(null)}
      />
    </div>
  );
}
