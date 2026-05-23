import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import type { CoachData } from '../lib/staffService';
import { getCoachPhoto, getCoachBio, getNBA2KCoach } from '../lib/staffService';
import { StarterService } from '../lib/starterService';
import { fetchCoachData, getCoachContractSnapshot, getStaffCareerSnapshot, type NBA2KCoachData, type CoachData as CoachBioData } from '../../../../../../services/staffService';
import { GameplanTab } from './GameplanTab';
import { IdealRotationTab } from './IdealRotationTab';
import { DefenseTab } from './DefenseTab';
import { CoachingSidebar } from './CoachingSidebar';
import { CoachingSystemTab } from './CoachingSystemTab';
import { CoachingPreferencesTab, CoachingStaffTab, CoachingStrategyTab } from './CoachingSupportTabs';
import { getMinutesDiff } from '../../../../../../store/gameplanStore';
import { getScoringOptions, saveScoringOptions } from '../../../../../../store/scoringOptionsStore';
import { getLockedStrategy, lockStrategy, unlockStrategy } from '../../../../../../store/coachStrategyLockStore';
import { getCoachSystem } from '../../../../../../store/coachSystemStore';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import { getStaffImageUrl } from '../../../../../../utils/staffPortrait';
import { useGame } from '../../../../../../store/GameContext';

interface CoachingViewProps {
  team: any;
  allCoaches: CoachData[];
  staffData: any;
  onSaveSystem?: (teamId: string, systemName: string) => void;
}

type ActiveTab = 'GAMEPLAN' | 'DEFENSE' | 'IDEAL' | 'SYSTEM' | 'COACHING' | 'PREFERENCES' | 'STAFF';

const TAB_CONFIG: Array<{ key: ActiveTab; label: string; title?: string }> = [
  { key: 'GAMEPLAN', label: 'Gameplan' },
  { key: 'IDEAL', label: 'Ideal', title: "Full-strength rotation — the one you'll actually tweak. The game-day rotation derives from this minus injuries." },
  { key: 'DEFENSE', label: 'Defense', title: 'Team-wide defensive scheme template — base coverage rules.' },
  { key: 'SYSTEM', label: 'System' },
  { key: 'COACHING', label: 'Strategy' },
  { key: 'PREFERENCES', label: 'Preferences' },
  { key: 'STAFF', label: 'Staff' },
];

function getBornDate(bornStr?: string) {
  if (!bornStr) return 'Unknown';
  const match = bornStr.match(/(?:[a-zA-Z]+\s\d{1,2},?\s\d{4})|(?:\d{1,2}\s[a-zA-Z]+\s\d{4})/);
  return match ? match[0] : bornStr;
}

function calculateAge(bornStr?: string) {
  const yearMatch = bornStr?.match(/\d{4}/);
  return yearMatch ? 2026 - parseInt(yearMatch[0]) : null;
}

export default function CoachingView({ team, allCoaches, staffData, onSaveSystem }: CoachingViewProps) {
  void allCoaches;
  const { state } = useGame();
  const [, setCoachDataVersion] = useState(0);
  const canEdit = state.gameMode !== 'gm' || Number(team.tid) === state.userTeamId;
  const [activeTab, setActiveTab] = useState<ActiveTab>('GAMEPLAN');
  const [starters, setStarters] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState(() => getCoachSystem(Number(team.tid))?.selectedSystem ?? team.bestSystem);
  const [pendingTab, setPendingTab] = useState<ActiveTab | null>(null);
  const [pendingMinutesDiff, setPendingMinutesDiff] = useState(0);
  const usageSortedPlayers = useMemo(() => {
    if (!team?.roster) return [];
    return [...team.roster].sort((a, b) => {
      const usage = (player: any) => {
        if (!player.ratings?.[0]) return 0;
        const r = player.ratings[0];
        const usageScore = r.ins * 0.23 + r.dnk * 0.15 + r.fg * 0.15 + r.tp * 0.15 + r.spd * 0.08 + r.hgt * 0.08 + r.drb * 0.08 + r.oiq * 0.08;
        return usageScore * 0.5 + getDisplayOverall(player) * 0.5;
      };
      return usage(b) - usage(a);
    });
  }, [team]);
  const baselineIds = useMemo(() => usageSortedPlayers.slice(0, 3).map((p: any) => String(p.internalId ?? p.pid)), [usageSortedPlayers]);
  const [scoringOptionIds, setScoringOptionIds] = useState<string[]>(baselineIds);
  const [lockTick, setLockTick] = useState(0);
  const lockedStrategy = useMemo(() => getLockedStrategy(Number(team.tid)), [team.tid, lockTick]);
  const effectiveSliders = lockedStrategy?.sliders ?? team.coachSliders;

  const requestTabChange = (next: ActiveTab) => {
    if (state.leagueStats?.uiMode !== 'euro_isolated' && activeTab === 'GAMEPLAN' && next !== 'GAMEPLAN') {
      const diff = getMinutesDiff(Number(team.tid));
      if (diff !== 0) {
        setPendingMinutesDiff(diff);
        setPendingTab(next);
        return;
      }
    }
    setActiveTab(next);
  };

  const toggleStrategyLock = () => {
    if (!canEdit) return;
    if (lockedStrategy) unlockStrategy(Number(team.tid));
    else lockStrategy(Number(team.tid), team.coachSliders);
    setLockTick(tick => tick + 1);
  };

  const updateLockedSlider = (key: string, value: number) => {
    if (!canEdit || !lockedStrategy) return;
    lockStrategy(Number(team.tid), { ...lockedStrategy.sliders, [key]: value });
    setLockTick(tick => tick + 1);
  };

  useEffect(() => {
    if (!lockedStrategy) {
      setScoringOptionIds(baselineIds);
      return;
    }
    const rosterIds = new Set(usageSortedPlayers.map((p: any) => String(p.internalId ?? p.pid)));
    const saved = getScoringOptions(Number(team.tid));
    const source = saved && saved.optionIds.length === 3 ? saved.optionIds : baselineIds;
    const picked = new Set<string>();
    const backfillPool = baselineIds.filter(id => !source.includes(id));
    const reconciled = source.map(id => {
      if (rosterIds.has(id) && !picked.has(id)) {
        picked.add(id);
        return id;
      }
      while (backfillPool.length) {
        const next = backfillPool.shift()!;
        if (!picked.has(next) && rosterIds.has(next)) {
          picked.add(next);
          return next;
        }
      }
      return id;
    });
    setScoringOptionIds(reconciled);
    if (!saved || saved.optionIds.some((value, index) => value !== reconciled[index])) saveScoringOptions(Number(team.tid), reconciled);
  }, [team.tid, baselineIds.join('|'), lockedStrategy, usageSortedPlayers]);

  const handleOptionChange = (optionIndex: number, direction: number) => {
    if (!canEdit) return;
    setScoringOptionIds(prev => {
      const ids = usageSortedPlayers.map((p: any) => String(p.internalId ?? p.pid));
      if (ids.length === 0) return prev;
      let cursor = ids.indexOf(prev[optionIndex]);
      if (cursor < 0) cursor = optionIndex;
      let attempts = 0;
      let nextId = prev[optionIndex];
      do {
        cursor = (cursor + direction + ids.length) % ids.length;
        nextId = ids[cursor];
        attempts += 1;
      } while (attempts <= ids.length && prev.some((other, index) => index !== optionIndex && other === nextId));
      const next = [...prev];
      next[optionIndex] = nextId;
      saveScoringOptions(Number(team.tid), next);
      return next;
    });
  };

  const handleSystemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!canEdit) return;
    const next = e.target.value;
    setSelectedSystem(next);
    onSaveSystem?.(team.tid, next);
  };

  useEffect(() => {
    let cancelled = false;
    void fetchCoachData().then(() => {
      if (!cancelled) setCoachDataVersion(v => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setSelectedSystem(getCoachSystem(Number(team.tid))?.selectedSystem ?? team.bestSystem);
  }, [team.tid, team.bestSystem]);

  useEffect(() => {
    setStarters(
      StarterService.getProjectedStarters({ tid: Number(team.tid), id: Number(team.tid) } as any, team.top12, 2026, team.top12, true),
    );
  }, [team]);

  let coachName = 'Unknown Coach';
  let coachImg = 'https://via.placeholder.com/150';
  let coachBio: CoachBioData | undefined;
  let nba2kCoach: NBA2KCoachData | undefined;
  let teamCoachRecord: any;
  const persistedHeadCoach = (team?.tycoon?.staffMembers ?? []).find((member: any) => member?.role === 'Head Coach') ?? null;
  if (staffData?.coaches) {
    const teamLabel = team.teamName.toLowerCase().trim();
    const teamShortName = team.teamName.toLowerCase().split(' ').pop() || '';
    const teamCoach = staffData.coaches.find((coach: any) => {
      const coachTeam = String(coach.team || '').toLowerCase().trim();
      const coachPosition = String(coach.position || '').toLowerCase().trim();
      return coachTeam === teamLabel || coachTeam === teamShortName || teamLabel.endsWith(coachTeam) || coachTeam.endsWith(teamShortName) || (coachPosition.includes('head coach') && !coachTeam && staffData.coaches.length === 1);
    });
    if (teamCoach) {
      teamCoachRecord = teamCoach;
      coachName = teamCoach.name;
      coachBio = getCoachBio(coachName);
      nba2kCoach = getNBA2KCoach(coachName);
      coachImg = getCoachPhoto(coachName) || teamCoach.playerPortraitUrl || nba2kCoach?.image || getStaffImageUrl(teamCoach.staffImageId) || `https://ui-avatars.com/api/?name=${encodeURIComponent(teamCoach.name)}&background=1a1a2e&color=FDB927&size=512&bold=true`;
    }
  }
  if (persistedHeadCoach && (coachName === 'Unknown Coach' || persistedHeadCoach.name === coachName)) {
    teamCoachRecord = { ...persistedHeadCoach, ...teamCoachRecord };
    coachName = teamCoachRecord.name ?? coachName;
    coachBio = getCoachBio(coachName) ?? coachBio;
    nba2kCoach = getNBA2KCoach(coachName) ?? nba2kCoach;
    coachImg = getCoachPhoto(coachName) || teamCoachRecord.playerPortraitUrl || nba2kCoach?.image || getStaffImageUrl(teamCoachRecord.staffImageId) || coachImg;
  }

  const displayYear = state.leagueStats?.year ?? 2026;
  const coachCareer = getStaffCareerSnapshot({
    ...teamCoachRecord,
    startSeason: coachBio?.startSeason ?? teamCoachRecord?.startSeason,
    coaching_career: nba2kCoach?.coaching_career ?? teamCoachRecord?.coaching_career,
    born: teamCoachRecord?.born ?? coachBio?.birthDate ?? nba2kCoach?.born,
    age: teamCoachRecord?.age ?? nba2kCoach?.age,
  }, displayYear);
  const coachContract = getCoachContractSnapshot(coachName, displayYear);
  let contractDisplay = '-';
  if (coachContract?.endYear != null) {
    contractDisplay = coachContract.annualSalary ? `$${(coachContract.annualSalary / 1000000).toFixed(1).replace('.0', '')}M until ${coachContract.endYear}` : `Until ${coachContract.endYear}`;
  } else if (teamCoachRecord?.contractExp) contractDisplay = `Until ${teamCoachRecord.contractExp}`;
  else if (teamCoachRecord?.contractYears != null) contractDisplay = `${teamCoachRecord.contractYears}yr remaining`;
  else if (teamCoachRecord?.yearsWithTeam != null) contractDisplay = `${Math.max(0, 4 - Math.min(4, teamCoachRecord.yearsWithTeam))}yr remaining`;

  const nationality = teamCoachRecord?.nationality || nba2kCoach?.nationality || coachBio?.nationality || teamCoachRecord?.born?.loc || 'Unknown';
  let coachingCareer = nba2kCoach?.coaching_career;
  if (!coachingCareer || coachingCareer === 'Unknown') {
    if (coachBio?.startSeason) coachingCareer = `${coachBio.startSeason.split('-')[0]}-present`;
    else if (teamCoachRecord?.startSeason) coachingCareer = `${String(teamCoachRecord.startSeason).split('-')[0]}-present`;
    else if (teamCoachRecord?.careerStartYear) coachingCareer = `${teamCoachRecord.careerStartYear}-present`;
    else if (coachCareer.careerStartYear != null) coachingCareer = `${coachCareer.careerStartYear}-present`;
    else coachingCareer = 'Unknown';
  }
  let born = getBornDate(nba2kCoach?.born);
  if (!born || born === 'Unknown') {
    born = coachBio?.birthDate || (teamCoachRecord?.born?.year ? `${teamCoachRecord.born.year}` : coachCareer.bornYear != null ? `${coachCareer.bornYear}` : teamCoachRecord?.bornYear ? `${teamCoachRecord.bornYear}` : 'Unknown');
  }
  const coachAge = Number(nba2kCoach?.age) || calculateAge(born) || coachCareer.age || (teamCoachRecord?.bornYear ? displayYear - Number(teamCoachRecord.bornYear) : null);

  const renderTabContent = () => {
    if (activeTab === 'IDEAL') return <IdealRotationTab teamId={Number(team.tid)} />;
    if (activeTab === 'GAMEPLAN') return <GameplanTab teamId={Number(team.tid)} />;
    if (activeTab === 'DEFENSE') return <DefenseTab teamId={Number(team.tid)} />;
    if (activeTab === 'SYSTEM') {
      return <CoachingSystemTab team={team} selectedSystem={selectedSystem} canEdit={canEdit} isMobile={isMobile} starters={starters} onSystemChange={handleSystemChange} />;
    }
    if (activeTab === 'COACHING') {
      return <CoachingStrategyTab canEdit={canEdit} lockedStrategy={lockedStrategy} effectiveSliders={effectiveSliders} toggleStrategyLock={toggleStrategyLock} updateLockedSlider={updateLockedSlider} />;
    }
    if (activeTab === 'PREFERENCES') {
      return (
        <CoachingPreferencesTab
          canEdit={canEdit}
          lockedStrategy={lockedStrategy}
          effectiveSliders={effectiveSliders}
          toggleStrategyLock={toggleStrategyLock}
          updateLockedSlider={updateLockedSlider}
          scoringOptionIds={scoringOptionIds}
          usageSortedPlayers={usageSortedPlayers}
          handleOptionChange={handleOptionChange}
        />
      );
    }
    return <CoachingStaffTab teamName={team.teamName} coachName={coachName} />;
  };

  return (
    <div className="bg-[#1a1a1a] text-white p-3 md:p-6 rounded-lg shadow-xl max-w-6xl mx-auto flex flex-col gap-3">
      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <Lock size={12} className="shrink-0" />
          <span className="font-bold uppercase tracking-widest text-[10px]">Read only</span>
          <span className="text-amber-100/80">GM mode — coaching settings can only be edited for your own team.</span>
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-6">
        <CoachingSidebar
          coachName={coachName}
          coachImg={coachImg}
          nba2kCoach={nba2kCoach}
          coachBio={coachBio}
          teamCoachRecord={teamCoachRecord}
          contractDisplay={contractDisplay}
          coachAge={coachAge}
          born={born}
          nationality={nationality}
          coachingCareer={coachingCareer}
          selectedSystem={selectedSystem}
          bestSystem={team.bestSystem}
        />
        <div className="w-full lg:w-2/3 flex flex-col">
          <div className="flex border-b border-gray-700 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
            {TAB_CONFIG.map(tab => (
              <button
                key={tab.key}
                className={`px-4 md:px-6 py-2 font-bold uppercase text-xs md:text-sm flex-shrink-0 ${activeTab === tab.key ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
                onClick={() => requestTabChange(tab.key)}
                title={tab.title}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-grow bg-[#222] rounded-lg border border-gray-700 p-3 md:p-4">{renderTabContent()}</div>
        </div>
      </div>
      {pendingTab && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1a1a1a] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="font-black uppercase tracking-widest text-amber-300 text-sm">Rotation Not Finished</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Gameplan minutes don't total 240.</div>
              </div>
            </div>
            <div className="text-sm text-slate-300 mb-5 leading-relaxed">
              Your rotation is currently <span className={`font-black ${pendingMinutesDiff > 0 ? 'text-amber-300' : 'text-rose-300'}`}>{pendingMinutesDiff > 0 ? `${pendingMinutesDiff} min under` : `${Math.abs(pendingMinutesDiff)} min over`}</span> the 48-minute team budget. Finish distributing minutes before switching tabs so next game's rotation isn't broken.
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button onClick={() => { setPendingTab(null); setPendingMinutesDiff(0); }} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest">Keep Editing</button>
              <button
                onClick={() => {
                  const next = pendingTab;
                  setPendingTab(null);
                  setPendingMinutesDiff(0);
                  if (next) setActiveTab(next);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase text-xs tracking-widest"
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
