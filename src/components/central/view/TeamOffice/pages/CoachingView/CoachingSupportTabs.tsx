import React from 'react';
import { ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react';
import { getCoachPhoto, getNBA2KCoach, getTeamStaff } from '../lib/staffService';

const TACTIC_SLIDERS = [
  { label: 'Tempo', key: 'tempo' },
  { label: 'Defensive Pressure', key: 'defensivePressure' },
  { label: 'Help Defense', key: 'helpDefense' },
  { label: 'Fast Break', key: 'fastBreak' },
  { label: 'Crash Offensive Glass', key: 'crashOffensiveGlass' },
  { label: 'Run Plays Frequency', key: 'runPlays' },
  { label: 'Early Offense', key: 'earlyOffense' },
  { label: 'Double Team', key: 'doubleTeam' },
  { label: 'Zone Usage Frequency', key: 'zoneUsage' },
] as const;

const SHOT_SLIDERS = [
  { label: 'Shot Inside', key: 'shotInside' },
  { label: 'Shot Close', key: 'shotClose' },
  { label: 'Shot Medium', key: 'shotMedium' },
  { label: 'Shot 3PT', key: 'shot3pt' },
  { label: 'Attack Basket', key: 'attackBasket' },
  { label: 'Post Plays', key: 'postPlayers' },
] as const;

const PREFERENCE_SLIDERS = [
  { label: 'Bench Depth', key: 'benchDepth' },
  { label: 'Offense / Defense', key: 'prefOffDef' },
  { label: 'Inside / Outside', key: 'prefInOut' },
  { label: 'Size / Speed', key: 'prefSizeSpeed' },
  { label: 'Athleticism / Skill', key: 'prefAthleticSkill' },
] as const;

function lockButtonClass(canEdit: boolean, lockedStrategy: any) {
  if (!canEdit) return 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed';
  return lockedStrategy ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700';
}

function StrategyLockButton({ canEdit, lockedStrategy, toggleStrategyLock }: { canEdit: boolean; lockedStrategy: any; toggleStrategyLock: () => void }) {
  return (
    <button
      onClick={toggleStrategyLock}
      disabled={!canEdit}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] md:text-xs font-bold uppercase transition-colors ${lockButtonClass(canEdit, lockedStrategy)}`}
      title={!canEdit ? 'GM mode — read only for other teams' : lockedStrategy ? 'Strategy locked — roster changes won\'t shift sliders' : 'Lock strategy against roster/injury changes'}
    >
      {lockedStrategy ? <Lock size={12} /> : <Unlock size={12} />}
      {lockedStrategy ? 'Locked' : 'Lock'}
    </button>
  );
}

function SliderRows({
  sliders,
  canEdit,
  lockedStrategy,
  effectiveSliders,
  updateLockedSlider,
}: {
  sliders: readonly { label: string; key: string }[];
  canEdit: boolean;
  lockedStrategy: any;
  effectiveSliders: any;
  updateLockedSlider: (key: string, value: number) => void;
}) {
  return (
    <>
      {sliders.map((slider, index) => (
        <div key={slider.key} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${index % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'}`}>
          <span className="text-xs md:text-sm font-bold">{slider.label}</span>
          <div className="flex items-center gap-4 w-full sm:w-1/2">
            <span className="text-yellow-500 font-bold w-8 text-right text-xs md:text-sm">{effectiveSliders[slider.key]}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={effectiveSliders[slider.key]}
              readOnly={!canEdit || !lockedStrategy}
              disabled={!canEdit || !lockedStrategy}
              onChange={e => updateLockedSlider(slider.key, Number(e.target.value))}
              className={`w-full accent-yellow-500 ${canEdit && lockedStrategy ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
              title={!canEdit ? 'GM mode — read only for other teams' : undefined}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export function CoachingStrategyTab({
  canEdit,
  lockedStrategy,
  effectiveSliders,
  toggleStrategyLock,
  updateLockedSlider,
}: {
  canEdit: boolean;
  lockedStrategy: any;
  effectiveSliders: any;
  toggleStrategyLock: () => void;
  updateLockedSlider: (key: string, value: number) => void;
}) {
  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm">Tactics</h4>
        <StrategyLockButton canEdit={canEdit} lockedStrategy={lockedStrategy} toggleStrategyLock={toggleStrategyLock} />
      </div>
      <SliderRows sliders={TACTIC_SLIDERS} canEdit={canEdit} lockedStrategy={lockedStrategy} effectiveSliders={effectiveSliders} updateLockedSlider={updateLockedSlider} />
      <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm mt-6 mb-2">Shot Distribution</h4>
      <SliderRows sliders={SHOT_SLIDERS} canEdit={canEdit} lockedStrategy={lockedStrategy} effectiveSliders={effectiveSliders} updateLockedSlider={updateLockedSlider} />
    </div>
  );
}

export function CoachingPreferencesTab({
  canEdit,
  lockedStrategy,
  effectiveSliders,
  toggleStrategyLock,
  updateLockedSlider,
  scoringOptionIds,
  usageSortedPlayers,
  handleOptionChange,
}: {
  canEdit: boolean;
  lockedStrategy: any;
  effectiveSliders: any;
  toggleStrategyLock: () => void;
  updateLockedSlider: (key: string, value: number) => void;
  scoringOptionIds: string[];
  usageSortedPlayers: any[];
  handleOptionChange: (optionIndex: number, direction: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end mb-2">
        <StrategyLockButton canEdit={canEdit} lockedStrategy={lockedStrategy} toggleStrategyLock={toggleStrategyLock} />
      </div>
      <div className="mb-6">
        <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm mb-2">Scoring Options</h4>
        {['FIRST OPTION', 'SECOND OPTION', 'THIRD OPTION'].map((label, index) => {
          const id = scoringOptionIds[index];
          const player = usageSortedPlayers.find(p => String(p.internalId ?? p.pid) === id);
          return (
            <div key={label} className="flex justify-between items-center bg-[#1a1a1a] p-2 rounded mb-2 border border-gray-800">
              <span className="text-xs md:text-sm font-bold w-32">{label}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleOptionChange(index, -1)}
                  disabled={!canEdit || !lockedStrategy}
                  className={`transition-colors p-1 ${canEdit && lockedStrategy ? 'text-gray-400 hover:text-white' : 'text-gray-700 cursor-not-allowed'}`}
                  title={!canEdit ? 'GM mode — read only for other teams' : lockedStrategy ? 'Previous option' : 'Lock strategy to edit scoring options'}
                ><ChevronLeft size={16} /></button>
                <span className="text-yellow-500 font-bold text-sm w-40 text-center truncate">{player ? player.name : '-'}</span>
                <button
                  onClick={() => handleOptionChange(index, 1)}
                  disabled={!canEdit || !lockedStrategy}
                  className={`transition-colors p-1 ${canEdit && lockedStrategy ? 'text-gray-400 hover:text-white' : 'text-gray-700 cursor-not-allowed'}`}
                  title={!canEdit ? 'GM mode — read only for other teams' : lockedStrategy ? 'Next option' : 'Lock strategy to edit scoring options'}
                ><ChevronRight size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <SliderRows sliders={PREFERENCE_SLIDERS} canEdit={canEdit} lockedStrategy={lockedStrategy} effectiveSliders={effectiveSliders} updateLockedSlider={updateLockedSlider} />
      <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm mt-6 mb-2">Play Through Injuries</h4>
      {([
        { label: 'Regular Season', key: 'ptiRegular', defaultVal: 0 },
        { label: 'Playoffs', key: 'ptiPlayoffs', defaultVal: 40 },
      ] as const).map((slider, index) => {
        const value = effectiveSliders[slider.key] ?? slider.defaultVal;
        const ptiLevel = Math.round((value / 100) * 4);
        const ptiDesc = ['Healthy only', 'Day-to-day (1–3 games)', 'Moderate (4–7 games)', 'Significant (8–14 games)', 'Major (15+ games)'][ptiLevel];
        return (
          <div key={slider.key} className={`flex flex-col gap-1 ${index % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span className="text-xs md:text-sm font-bold">{slider.label}</span>
              <div className="flex items-center gap-4 w-full sm:w-1/2">
                <span className="text-yellow-500 font-bold w-8 text-right text-xs md:text-sm">{value}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={value}
                  readOnly={!canEdit || !lockedStrategy}
                  disabled={!canEdit || !lockedStrategy}
                  onChange={e => updateLockedSlider(slider.key, Number(e.target.value))}
                  className={`w-full accent-yellow-500 ${canEdit && lockedStrategy ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                  title={!canEdit ? 'GM mode — read only for other teams' : undefined}
                />
              </div>
            </div>
            <div className="text-[10px] text-slate-500 px-2 sm:pl-[calc(50%+1rem)]">{ptiDesc}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CoachingStaffTab({ teamName, coachName }: { teamName: string; coachName: string }) {
  const assistants = getTeamStaff(teamName).filter(staff => {
    if (staff.name === coachName) return false;
    const pos = (staff.position ?? '').toLowerCase();
    return pos.includes('assistant') && pos.includes('coach');
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto max-h-[500px] pr-2 scrollbar-hide">
      <h3 className="text-xl font-bold uppercase mb-4 text-yellow-500">Assistant Coaches</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assistants.map((staff, index) => (
          <div key={index} className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 flex gap-4 items-center">
            <img
              src={staff.image || getCoachPhoto(staff.name) || `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.name)}&background=1a1a2e&color=FDB927&size=128`}
              alt={staff.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-gray-600 flex-shrink-0"
              referrerPolicy="no-referrer"
              onError={e => {
                const image = e.target as HTMLImageElement;
                const nba2k = getNBA2KCoach(staff.name);
                const fallbacks = [
                  getCoachPhoto(staff.name),
                  nba2k?.image,
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.name)}&background=1a1a2e&color=FDB927&size=128`,
                ].filter(Boolean) as string[];
                const next = fallbacks.find(url => url && url !== image.src);
                if (next) image.src = next;
              }}
            />
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight">{staff.name}</span>
              <span className="text-sm text-yellow-500 mb-1">{staff.position}</span>
              <span className="text-xs text-gray-400 line-clamp-2" title={staff.coaching_career || staff.playing_career || ''}>
                {staff.coaching_career || staff.playing_career || 'Career info unavailable'}
              </span>
            </div>
          </div>
        ))}
        {assistants.length === 0 && <div className="col-span-full text-gray-400 text-sm italic">No assistant coach information available for this team.</div>}
      </div>
    </div>
  );
}
