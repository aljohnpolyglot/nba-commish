import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Star, Unlock } from 'lucide-react';
import { getCoachPhoto, getNBA2KCoach, getTeamStaff } from '../lib/staffService';
import { useGame } from '../../../../../../store/GameContext';
import { PersonnelActionsModal, type PersonnelActionType } from '../../../PersonnelActionsModal';
import type { Personnel } from '../../../LeagueOfficeSearcher';
import { computeStaffOverall, attrsForCoach, seedForStaff, staffOverallFor } from '../../../../../../services/staff/displayAttributes';
import { deterministicStaffImageId, getStaffImageUrl, resolveStaffImageId } from '../../../../../../utils/staffPortrait';

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

function displayRole(role: string) {
  return String(role ?? 'Staff').replace(/ \d+$/, '');
}

function portraitForStaff(staff: any) {
  return staff.playerPortraitUrl
    ?? getCoachPhoto(staff.name)
    ?? getNBA2KCoach(staff.name)?.image
    ?? getStaffImageUrl(resolveStaffImageId(staff))
    ?? getStaffImageUrl(deterministicStaffImageId(staff.name))
    ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.name ?? 'Staff')}&background=1a1a2e&color=FDB927&size=256&bold=true`;
}

export function CoachingStaffTab({ team, canEdit }: { team: any; canEdit: boolean }) {
  const { state, dispatchAction } = useGame();
  const [actionPerson, setActionPerson] = useState<any | null>(null);
  const staffRows = useMemo(() => {
    const order = [
      'Head Coach',
      'Assistant Coach',
      'Assistant Coach 2',
      'Assistant Coach 3',
      'Head of Sports Science',
      'Head Physio',
      'Player Development Coach',
      'Chief Scout',
      'Head of Analytics',
    ];
    const persistedMembers = (team?.tycoon?.staffMembers ?? []) as any[];
    const teamLabel = String(team?.teamName ?? (team?.region && team?.name ? `${team.region} ${team.name}` : team?.name) ?? '').trim();
    const teamKeys = Array.from(new Set([teamLabel, team?.name, team?.region].map(value => String(value ?? '').trim()).filter(Boolean)));
    const fallbackDirectoryMembers = persistedMembers.length > 0 ? [] : (() => {
      const staticCoaches = ((state as any).staff?.coaches ?? []) as any[];
      const teamKeySet = new Set(teamKeys.map(value => value.toLowerCase()));
      const staticHeadCoach = staticCoaches.find(coach => {
        const role = String(coach?.role ?? coach?.jobTitle ?? coach?.position ?? '').toLowerCase();
        const coachTeam = String(coach?.team ?? '').toLowerCase();
        return coach?.name && role.includes('head coach') && teamKeySet.has(coachTeam);
      });
      const sourceRows = teamKeys.flatMap(key => getTeamStaff(key));
      const seen = new Set<string>();
      const realRows = sourceRows.filter(row => {
        const key = String(row?.name ?? '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const rows: any[] = [];
      const headCoach = staticHeadCoach ?? realRows.find(row => String(row?.position ?? '').toLowerCase().includes('head coach'));
      if (headCoach?.name) rows.push({ ...headCoach, role: 'Head Coach', jobTitle: 'Head Coach', position: 'Head Coach' });
      const assistants = realRows.filter(row => String(row?.position ?? '').toLowerCase().includes('assistant coach') && row.name !== headCoach?.name);
      assistants.slice(0, 3).forEach((assistant, index) => {
        const role = index === 0 ? 'Assistant Coach' : `Assistant Coach ${index + 1}`;
        rows.push({ ...assistant, role, jobTitle: role, position: role });
      });
      return rows;
    })();
    const members = persistedMembers.length > 0 ? persistedMembers : fallbackDirectoryMembers;
    return order
      .map(role => {
        const member = members.find(staff => String(staff?.role ?? staff?.position ?? staff?.jobTitle) === role);
        if (!member) return null;
        const attrs = attrsForCoach(member.name, seedForStaff(member), {
          role,
          attributeProfile: member.attributeProfile,
          attributeOverrides: member.attributeOverrides,
        });
        return {
          role,
          member,
          rating: staffOverallFor(role, member) || Number(member.reputation ?? computeStaffOverall(role, attrs)),
          portrait: portraitForStaff(member),
        };
      })
      .filter(Boolean) as Array<{ role: string; member: any; rating: number; portrait: string }>;
  }, [team, (state as any).staff?.coaches]);

  const handleStaffAction = (action: PersonnelActionType) => {
    if (!actionPerson) return;
    if (action === 'fire') {
      void dispatchAction({
        type: 'FIRE_PERSONNEL',
        payload: {
          contacts: [{
            id: actionPerson.member.id ?? `staff-${actionPerson.role}`,
            name: actionPerson.member.name,
            title: displayRole(actionPerson.role),
            organization: team?.teamName ?? team?.name,
            type: 'coach',
            playerPortraitUrl: actionPerson.portrait,
          }],
        },
      } as any);
    }
    setActionPerson(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto max-h-[560px] pr-2 scrollbar-hide">
      <h3 className="text-sm font-black uppercase tracking-widest mb-4 text-yellow-500">Coaching Staff</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {staffRows.map(({ role, member, rating, portrait }) => (
          <button
            key={role}
            onClick={() => setActionPerson({ role, member, rating, portrait })}
            className={`relative min-h-[145px] rounded-lg border border-slate-700 bg-slate-950/40 p-4 text-left transition-all ${canEdit ? 'hover:border-yellow-500/60 hover:bg-slate-900/70' : 'cursor-default hover:border-slate-600'}`}
          >
            {role === 'Head Coach' && <Star size={14} className="absolute left-3 top-3 text-yellow-400 fill-yellow-400" />}
            <div className="absolute right-3 top-3 h-9 w-9 rounded-full border border-emerald-500/50 bg-emerald-500/10 text-emerald-300 flex items-center justify-center text-xs font-black">
              {Math.round(rating)}
            </div>
            <div className="flex flex-col items-center text-center gap-2 pt-2">
              <img
                src={portrait}
                alt={member.name}
                className="h-16 w-16 rounded-full object-cover object-top"
                referrerPolicy="no-referrer"
                onError={event => {
                  event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name ?? 'Staff')}&background=1a1a2e&color=FDB927&size=256&bold=true`;
                }}
              />
              <div className="min-w-0 w-full">
                <div className="truncate text-sm font-black text-white">{member.name}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-widest text-yellow-400">{displayRole(role)}</div>
              </div>
            </div>
          </button>
        ))}
        {staffRows.length === 0 && <div className="col-span-full text-gray-400 text-sm italic">No staff information available for this team.</div>}
      </div>
      {actionPerson && (
        <PersonnelActionsModal
          person={{
            id: actionPerson.member.id ?? `staff-${actionPerson.role}`,
            name: actionPerson.member.name,
            type: 'coach',
            jobTitle: displayRole(actionPerson.role),
            team: team?.teamName ?? team?.name,
            playerPortraitUrl: actionPerson.portrait,
          } as Personnel}
          isOpen={true}
          onClose={() => setActionPerson(null)}
          filterActions={(canEdit
            ? ['view_ratings', 'view_candidates', ...((actionPerson.member.contractYears ?? 1) > 0 ? ['fire' as PersonnelActionType] : [])]
            : ['view_ratings']
          ) as PersonnelActionType[]}
          onActionSelect={handleStaffAction}
        />
      )}
    </div>
  );
}
