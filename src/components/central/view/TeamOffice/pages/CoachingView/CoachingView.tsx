import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import type { CoachData } from '../lib/staffService';
import { getCoachPhoto, getCoachBio, getNBA2KCoach } from '../lib/staffService';
import { fetchCoachData, getCoachContractSnapshot, getStaffCareerSnapshot, type NBA2KCoachData, type CoachData as CoachBioData } from '../../../../../../services/staffService';
import { GameplanTab } from './GameplanTab';
import { IdealRotationTab } from './IdealRotationTab';
import { CoachingSidebar } from './CoachingSidebar';
import { CoachingSystemTab } from './CoachingSystemTab';
import { CoachingPreferencesTab, CoachingStaffTab, CoachingStrategyTab } from './CoachingSupportTabs';
import { getMinutesDiff } from '../../../../../../store/gameplanStore';
import { getScoringOptions, saveScoringOptions } from '../../../../../../store/scoringOptionsStore';
import { getLockedStrategy, lockStrategy, unlockStrategy } from '../../../../../../store/coachStrategyLockStore';
import { getCoachSystem } from '../../../../../../store/coachSystemStore';
import { getGameplan } from '../../../../../../store/gameplanStore';
import { getIdealRotation } from '../../../../../../store/idealRotationStore';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import { getStaffImageUrl } from '../../../../../../utils/staffPortrait';
import { useGame } from '../../../../../../store/GameContext';
import { normalizeNationality } from '../../../../../../utils/countryFlags';
import { CoachingTabWelcomeModal } from './CoachingTabWelcomeModal';
import { useCoachingTabWelcome } from './useCoachingTabWelcome';
import { isOnRoster, resolveAnyTeam } from '../../../../../../utils/teamLookup';
import { PBA_TEAM_DATA } from '../../../../../../data/templates/philippines/teamPopulations';
import { buildStarterOrder, getHealthyRoster } from './gameplanTabShared';

interface CoachingViewProps {
  team: any;
  allCoaches: CoachData[];
  staffData: any;
  onSaveSystem?: (teamId: string, systemName: string) => void;
}

type ActiveTab = 'GAMEPLAN' | 'IDEAL' | 'SYSTEM' | 'COACHING' | 'PREFERENCES' | 'STAFF';

const TAB_CONFIG: Array<{ key: ActiveTab; label: string; title?: string }> = [
  { key: 'GAMEPLAN', label: 'Gameplan' },
  { key: 'IDEAL', label: 'Ideal', title: "Full-strength rotation — the one you'll actually tweak. The game-day rotation derives from this minus injuries." },
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

function calculateAge(bornStr: string | undefined, currentYear: number) {
  const yearMatch = bornStr?.match(/\d{4}/);
  return yearMatch ? currentYear - parseInt(yearMatch[0]) : null;
}

function normalizeNameKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePersonKey(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findPbaCoachMeta(team: any) {
  const keys = [
    team?.abbrev,
    team?.region,
    team?.name,
    team?.teamName,
  ]
    .map(value => normalizeNameKey(value))
    .filter(Boolean);
  return PBA_TEAM_DATA.find(entry =>
    keys.includes(normalizeNameKey(entry.abbrev))
    || keys.includes(normalizeNameKey(entry.region))
    || keys.includes(normalizeNameKey(entry.name))
    || entry.aliases.some(alias => keys.includes(normalizeNameKey(alias))),
  );
}

function findLatestHeadCoachFromHistory(history: any[] | undefined, teamName: string) {
  if (!history?.length || !teamName) return null;
  const escapedTeam = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hirePattern = new RegExp(`${escapedTeam}\\s+hired\\s+(.+?)\\s+as\\s+Head Coach\\.?$`, 'i');
  const expiredPattern = new RegExp(`(.+?)'s contract with the ${escapedTeam} expired after serving as Head Coach\\.?$`, 'i');
  const firedPattern = new RegExp(`${escapedTeam}\\s+fired\\s+(.+?)\\s+as\\s+Head Coach\\.?$`, 'i');
  const retiredPattern = new RegExp(`(.+?) retired from the ${escapedTeam} staff as Head Coach\\.?$`, 'i');
  const sorted = [...history]
    .map((entry, index) => ({ entry: typeof entry === 'string' ? { text: entry } : entry, index }))
    .sort((a, b) => {
      const da = new Date(a.entry?.date ?? '').getTime() || 0;
      const db = new Date(b.entry?.date ?? '').getTime() || 0;
      return db - da || b.index - a.index;
    });
  const unavailable = new Set<string>();
  for (const { entry } of sorted) {
    const text = String(entry?.text ?? '');
    const expired = text.match(expiredPattern)?.[1] ?? text.match(firedPattern)?.[1] ?? text.match(retiredPattern)?.[1];
    if (expired) unavailable.add(normalizeNameKey(expired));
    const hired = text.match(hirePattern)?.[1];
    if (hired && !unavailable.has(normalizeNameKey(hired))) return hired.trim();
  }
  return null;
}

function compactCareerRange(career: string, fallback: string) {
  const years = Array.from(String(career ?? '').matchAll(/(\d{4})\s*[-\u2010-\u2015]\s*(\d{4}|Present|present)/g));
  if (years.length === 0) return fallback;
  const start = years
    .map(match => Number(match[1]))
    .filter(year => Number.isFinite(year))
    .sort((a, b) => a - b)[0];
  if (!start) return fallback;
  const hasPresent = years.some(match => /^present$/i.test(match[2]));
  const endYears = years
    .map(match => /^present$/i.test(match[2]) ? null : Number(match[2]))
    .filter((year): year is number => Number.isFinite(year));
  const end = hasPresent ? 'present' : Math.max(...endYears);
  return `${start}-${end}`;
}

export default function CoachingView({ team: inputTeam, allCoaches, staffData, onSaveSystem }: CoachingViewProps) {
  void allCoaches;
  const { state, dispatchAction } = useGame();
  const [, setCoachDataVersion] = useState(0);
  const team = useMemo(() => {
    const inputId = Number(inputTeam?.id ?? inputTeam?.tid);
    const liveTeam = Number.isFinite(inputId)
      ? resolveAnyTeam(inputId, state.teams ?? [], state.nonNBATeams ?? [])
      : null;
    return liveTeam ? { ...inputTeam, ...liveTeam } : inputTeam;
  }, [inputTeam, state.teams, state.nonNBATeams]);
  const canEdit = state.gameMode !== 'gm' || Number(team.tid) === state.userTeamId;
  const [activeTab, setActiveTab] = useState<ActiveTab>('GAMEPLAN');
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
  const coachingTabWelcome = useCoachingTabWelcome(state.saveId, activeTab);

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

  const starters = useMemo(() => {
    const teamId = Number(team?.tid ?? team?.id);
    if (!Number.isFinite(teamId)) return [];
    const onTeamPlayers = state.players.filter(player => player.tid === teamId && isOnRoster(player));
    if (onTeamPlayers.length === 0) return [];
    const onTeamIds = new Set(onTeamPlayers.map(player => player.internalId));
    const { healthyRoster, healthyIds } = getHealthyRoster(state.players, teamId);
    const savedPlan = getGameplan(teamId);
    const idealPlan = getIdealRotation(teamId);
    const starterIds = buildStarterOrder({
      savedStarterIds: savedPlan?.starterIds,
      idealStarterIds: idealPlan?.locked ? idealPlan.starterIds : undefined,
      team,
      players: state.players,
      teamId,
      currentYear: state.leagueStats?.year ?? 2026,
      onTeamIds,
      healthyRoster,
      healthyIds,
      forceSort: false,
    });
    const playersById = new Map(state.players.map(player => [player.internalId, player] as const));
    return starterIds
      .map(id => playersById.get(id))
      .filter((player): player is any => !!player);
  }, [team, state.players, state.leagueStats?.year]);

  let coachName = 'Unknown Coach';
  let coachImg = 'https://via.placeholder.com/150';
  let coachBio: CoachBioData | undefined;
  let nba2kCoach: NBA2KCoachData | undefined;
  let teamCoachRecord: any;
  const displayYear = state.leagueStats?.year ?? 2026;
  const isPbaMode = state.leagueStats?.uiMode === 'pba_isolated' || (Number(team?.tid) >= 2000 && Number(team?.tid) < 3000);
  const calendarDisplayYear = Number(new Date(state.date).getFullYear()) || displayYear;
  const staffDisplayYear = isPbaMode ? calendarDisplayYear : displayYear;
  const pbaCoachMeta = isPbaMode ? findPbaCoachMeta(team) : undefined;
  const teamFullName = String(team.teamName ?? team.name ?? '').trim();
  const historyHeadCoachName = findLatestHeadCoachFromHistory(state.history as any[], teamFullName);
  const persistedHeadCoach = (team?.tycoon?.staffMembers ?? []).find((member: any) => {
    const role = String(member?.role ?? member?.position ?? member?.jobTitle ?? '').replace(/ \d+$/, '');
    return role === 'Head Coach';
  }) ?? null;
  React.useEffect(() => {
    if (!historyHeadCoachName || normalizeNameKey(historyHeadCoachName) === normalizeNameKey(persistedHeadCoach?.name)) return;
    const teamId = Number(team.id ?? team.tid);
    if (!Number.isFinite(teamId)) return;
    const patchedTeams = (state.teams ?? []).map((stateTeam: any) => {
      if (Number(stateTeam.id ?? stateTeam.tid) !== teamId) return stateTeam;
      const members = [...(stateTeam.tycoon?.staffMembers ?? [])];
      const existingIndex = members.findIndex((member: any) => String(member?.role ?? member?.position ?? member?.jobTitle ?? '').replace(/ \d+$/, '') === 'Head Coach');
      const replacement = {
        ...(existingIndex >= 0 ? members[existingIndex] : {}),
        name: historyHeadCoachName,
        role: 'Head Coach',
        position: 'Head Coach',
        jobTitle: 'Head Coach',
      };
      if (existingIndex >= 0) members[existingIndex] = replacement;
      else members.push(replacement);
      return {
        ...stateTeam,
        tycoon: {
          ...(stateTeam.tycoon ?? {}),
          staffMembers: members,
        },
      };
    });
    void dispatchAction({ type: 'UPDATE_STATE', payload: { teams: patchedTeams } } as any);
  }, [historyHeadCoachName, persistedHeadCoach?.name, team.id, team.tid, dispatchAction]);
  const effectiveHeadCoach = historyHeadCoachName && normalizeNameKey(historyHeadCoachName) !== normalizeNameKey(persistedHeadCoach?.name)
    ? { ...(persistedHeadCoach ?? {}), name: historyHeadCoachName, role: 'Head Coach', position: 'Head Coach', jobTitle: 'Head Coach' }
    : persistedHeadCoach;
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
  if (effectiveHeadCoach) {
    teamCoachRecord = { ...teamCoachRecord, ...effectiveHeadCoach };
    coachName = teamCoachRecord.name ?? coachName;
    coachBio = getCoachBio(coachName) ?? coachBio;
    nba2kCoach = getNBA2KCoach(coachName) ?? nba2kCoach;
    coachImg = getCoachPhoto(coachName) || teamCoachRecord.playerPortraitUrl || nba2kCoach?.image || getStaffImageUrl(teamCoachRecord.staffImageId) || coachImg;
  }

  if (pbaCoachMeta) {
    coachName = pbaCoachMeta.coach || coachName;
    const pbaPortrait = teamCoachRecord?.playerPortraitUrl || getStaffImageUrl(teamCoachRecord?.staffImageId);
    const safePbaRecord = teamCoachRecord?.leagueId === 'pba' || String(teamCoachRecord?.source ?? '').startsWith('pba')
      ? teamCoachRecord
      : {};
    teamCoachRecord = {
      ...safePbaRecord,
      name: coachName,
      team: teamFullName,
      role: 'Head Coach',
      position: 'Head Coach',
      jobTitle: 'Head Coach',
      bornYear: pbaCoachMeta.bornYear,
      nationality: 'Philippines',
      hiredYear: safePbaRecord?.hiredYear ?? staffDisplayYear - 1,
      yearsWithTeam: safePbaRecord?.yearsWithTeam ?? 1,
      contractYears: safePbaRecord?.contractYears ?? 3,
      salary: safePbaRecord?.salary,
      playerPortraitUrl: pbaPortrait,
    };
    coachBio = undefined;
    nba2kCoach = undefined;
    coachImg = pbaPortrait || getCoachPhoto(coachName) || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachName)}&background=1a1a2e&color=FDB927&size=512&bold=true`;
  }

  const coachCareer = getStaffCareerSnapshot({
    ...teamCoachRecord,
    startSeason: teamCoachRecord?.startSeason ?? coachBio?.startSeason,
    coaching_career: teamCoachRecord?.career_history ?? teamCoachRecord?.coaching_career ?? (!pbaCoachMeta ? nba2kCoach?.coaching_career : undefined),
    born: teamCoachRecord?.born ?? coachBio?.birthDate ?? nba2kCoach?.born,
    age: teamCoachRecord?.age ?? (!pbaCoachMeta ? nba2kCoach?.age : undefined),
  }, staffDisplayYear);
  const coachContract = isPbaMode ? null : getCoachContractSnapshot(coachName, displayYear);
  let contractDisplay = '-';
  if (isPbaMode && teamCoachRecord?.contractYears != null) {
    const years = Math.max(0, Number(teamCoachRecord.contractYears));
    const salary = Number(teamCoachRecord.salary);
    contractDisplay = Number.isFinite(salary) && salary > 0
      ? `₱${(salary / 1000000).toFixed(1).replace('.0', '')}M · ${years}yr`
      : `${years}yr remaining`;
  } else if (teamCoachRecord?.contractYears != null) {
    const endYear = displayYear + Math.max(0, Number(teamCoachRecord.contractYears));
    const salary = Number(teamCoachRecord.salary);
    contractDisplay = Number.isFinite(salary) && salary > 0
      ? `$${(salary / 1000000).toFixed(1).replace('.0', '')}M until ${endYear}`
      : `${teamCoachRecord.contractYears}yr remaining`;
  } else if (teamCoachRecord?.contractExp) contractDisplay = `Until ${teamCoachRecord.contractExp}`;
  else if (coachContract?.endYear != null) {
    contractDisplay = coachContract.annualSalary ? `$${(coachContract.annualSalary / 1000000).toFixed(1).replace('.0', '')}M until ${coachContract.endYear}` : `Until ${coachContract.endYear}`;
  }
  else if (teamCoachRecord?.yearsWithTeam != null) contractDisplay = `${Math.max(0, 4 - Math.min(4, teamCoachRecord.yearsWithTeam))}yr remaining`;

  const nationality = normalizeNationality(teamCoachRecord?.nationality || (pbaCoachMeta ? 'Philippines' : nba2kCoach?.nationality) || coachBio?.nationality || teamCoachRecord?.born?.loc || 'Unknown');
  const matchedPlayer = (state.players ?? []).find((player: any) => normalizePersonKey(player?.name) === normalizePersonKey(coachName));
  const savedCareerRows = String(teamCoachRecord?.career_history ?? teamCoachRecord?.coaching_career ?? '').trim();
  const externalCoachRows = pbaCoachMeta ? '' : String(nba2kCoach?.career_history ?? nba2kCoach?.coaching_career ?? '').trim();
  const isPlayerToStaff = !!matchedPlayer && Number(teamCoachRecord?.coachingYears ?? 0) <= 0 && Number(teamCoachRecord?.playingYears ?? 0) > 0;
  let coachingCareer = isPlayerToStaff
    ? savedCareerRows
    : [externalCoachRows, savedCareerRows].filter(Boolean).join('\n');
  if (!coachingCareer || coachingCareer === 'Unknown') {
    if (coachBio?.startSeason) coachingCareer = `${coachBio.startSeason.split('-')[0]}-present`;
    else if (teamCoachRecord?.startSeason) coachingCareer = `${String(teamCoachRecord.startSeason).split('-')[0]}-present`;
    else if (teamCoachRecord?.careerStartYear) coachingCareer = `${teamCoachRecord.careerStartYear}-present`;
    else if (coachCareer.careerStartYear != null) coachingCareer = `${coachCareer.careerStartYear}-present`;
    else if (teamCoachRecord?.hiredYear) coachingCareer = `${teamCoachRecord.hiredYear}-present`;
    else coachingCareer = 'Unknown';
  }
  coachingCareer = compactCareerRange(coachingCareer, coachingCareer);
  let born = getBornDate(pbaCoachMeta ? undefined : nba2kCoach?.born);
  if (!born || born === 'Unknown') {
    born = coachBio?.birthDate || (teamCoachRecord?.born?.year ? `${teamCoachRecord.born.year}` : coachCareer.bornYear != null ? `${coachCareer.bornYear}` : teamCoachRecord?.bornYear ? `${teamCoachRecord.bornYear}` : 'Unknown');
  }
  const coachAge = Number(teamCoachRecord?.age)
    || (!pbaCoachMeta ? Number(nba2kCoach?.age) : 0)
    || calculateAge(born, staffDisplayYear)
    || coachCareer.age
    || (teamCoachRecord?.bornYear ? staffDisplayYear - Number(teamCoachRecord.bornYear) : null);

  const renderTabContent = () => {
    if (activeTab === 'IDEAL') return <IdealRotationTab teamId={Number(team.tid)} />;
    if (activeTab === 'GAMEPLAN') return <GameplanTab teamId={Number(team.tid)} />;
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
    return <CoachingStaffTab team={team} canEdit={canEdit} />;
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
          teamCoachRecord={{ ...teamCoachRecord, yearsWithTeam: coachCareer.yearsWithTeam }}
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
      <CoachingTabWelcomeModal
        open={coachingTabWelcome.open}
        tab={coachingTabWelcome.currentTab}
        onClose={coachingTabWelcome.close}
        onDontShowAgain={coachingTabWelcome.dontShowAgain}
      />
    </div>
  );
}
