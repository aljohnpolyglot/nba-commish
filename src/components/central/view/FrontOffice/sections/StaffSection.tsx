import React, { useMemo, useState } from 'react';
import { Briefcase, Search, Star, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_CAP_INFLATION_AVERAGE } from '../../../../../constants';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getCountryFlag, normalizeNationality } from '../../../../../utils/countryFlags';
import { getTeamFullName } from '../../../../../utils/teamNames';
import { makePlaceholderCoach, makePlaceholderGM } from '../../../../../services/staff/staffFallback';
import { MyFace, isRealFaceConfig } from '../../../../shared/MyFace';
import { getStaffImageUrl, resolveStaffImageId } from '../../../../../utils/staffPortrait';
import { getStaffAskProfile, inferEuroStaffLeagueId, isEuroStaffLeagueId, mergeStaffCandidateBuckets, normalizeStaffPoolRole } from '../../../../../services/euro/staffPool';
import { fetchCoachData, getCoachBio, getNBA2KCoach, getTeamStaff, getCoachContractSnapshot, getStaffCareerSnapshot, OWNER_IMAGES } from '../../../../../services/staffService';
import { ensureStaffPhotoData, resolveCoachPortrait, sanitizeStaffPhotoUrl, useStaffPhotoStore } from '../../../../../store/staffPhotoStore';
import { StaffSigningModal, type StaffCandidate } from '../StaffSigning/StaffSigningModal';
import { StaffOfferModal, type StaffOfferDecision } from '../StaffSigning/StaffOfferModal';
import { StaffDecisionModal } from '../StaffSigning/StaffDecisionModal';
import { getStaffMarketSalary, getStaffRoleBaseSalary, normalizeStaffSalary, resolveStaffMarketForTeam } from '../../../../../services/tycoon/economyScale';
import { SectionTitle } from '../shared/helpers';
import { StaffSummaryCard } from '../shared/StaffSummaryCard';
import { PersonnelActionsModal, type PersonnelActionType } from '../../PersonnelActionsModal';
import type { Personnel } from '../../LeagueOfficeSearcher';
import { PersonnelBioView } from '../../PersonnelBioView';
import { PersonnelRatingsView } from '../../PersonnelRatingsView';
import {
  buildStaffAttrs,
  buildDisplayAttributes,
  seedForStaff,
  staffOverallFor,
  resolveStaffRating,
  computeStaffOverall,
  attrsForCoach,
} from '../../../../../services/staff/displayAttributes';
import { displayStaffRole } from '../../../../../services/staff/staffCareerRows';
import { getStaffGameplayTooltip } from '../../../../../services/staff/staffGameplayEffects';
import { CountryFlag } from '../../../../shared/CountryFlag';
import { getSeasonEconomyIndex } from '../../../../../services/tycoon/clubFinance';
import { getPbaHistoricalEconomyFactor } from '../../../../../services/pba/historicalEconomy';
import { getLocalRegenPortraitFallbackUrl } from '../../../../../utils/newgenPortrait';
import type { StaffOfferRejection } from '../../../../../types/tycoon';
import { getActiveTeamStaffMembers, hasPersistedStaffRoster } from '../../../../../services/staff/activeStaffContracts';
import { useManagedTeamActivity } from '../../../../../hooks/useManagedTeamActivity';

export function resolveOwnerPrimaryPortrait(owner: any, fictionalLeague: boolean): string | null {
  return owner?.playerPortraitUrl
    ?? (OWNER_IMAGES as Record<string, string>)[owner?.name ?? '']
    ?? (fictionalLeague ? getStaffImageUrl(resolveStaffImageId(owner ?? {})) : null)
    ?? null;
}

export const StaffSection: React.FC<{
  state: any;
  team: any;
  onHireStaff: (hire: any) => boolean;
  onFireStaff: (role: string, person?: any) => void;
  onPromoteStaff: (person: any, fromRole: string, toRole: string) => void;
  onRecordStaffRejection: (rejection: StaffOfferRejection) => void;
}> = ({ state, team, onHireStaff, onFireStaff, onPromoteStaff, onRecordStaffRejection }) => {
  const teamActivity = useManagedTeamActivity();
  const formatYearsLeftLabel = (years: number) => `${years} ${years === 1 ? 'Year' : 'Years'} Left`;
  const [signingOpen, setSigningOpen] = useState(false);
  const [offerCandidate, setOfferCandidate] = useState<{ candidate: StaffCandidate; mode: 'hire' | 'extension' } | null>(null);
  const [staffDecision, setStaffDecision] = useState<StaffOfferDecision | null>(null);
  const [selectedRole, setSelectedRole] = useState('Head Coach');
  const [actionPerson, setActionPerson] = useState<{ role: string; person: any; years: number; salary: number } | null>(null);
  const [candidateAction, setCandidateAction] = useState<{ role: string; candidate: StaffCandidate } | null>(null);
  const [fireConfirm, setFireConfirm] = useState<{ role: string; name: string; person?: any } | null>(null);
  const [ratingsPerson, setRatingsPerson] = useState<Personnel | null>(null);
  const [bioPerson, setBioPerson] = useState<Personnel | null>(null);
  const [candidateRole, setCandidateRole] = useState<string | null>(null);
  const [, setCoachDataVersion] = useState(0);
  const staffPhotoVersion = useStaffPhotoStore(s => s.version);
  void staffPhotoVersion;
  React.useEffect(() => {
    ensureStaffPhotoData();
    let cancelled = false;
    void fetchCoachData().then(() => {
      if (!cancelled) setCoachDataVersion(v => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  React.useEffect(() => {
    if (!signingOpen) {
      setCandidateRole(null);
      return;
    }
    const timer = window.setTimeout(() => setCandidateRole(selectedRole), 0);
    return () => window.clearTimeout(timer);
  }, [selectedRole, signingOpen]);
  const firedRoles: string[] = (team.tycoon?.firedStaffRoles ?? []);
  const tycoonTier = team.tycoon?.tier;
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();
  const teamId = Number(team?.id ?? team?.tid);
  const canHostTeamActivity = state.gameMode === 'gm'
    && Number.isFinite(teamId)
    && state.userTeamId === teamId;
  const coachAchievementCount = (personOrName: any, kind: 'coy' | 'champion'): number => {
    const name = typeof personOrName === 'string' ? personOrName : personOrName?.name;
    const key = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key) return 0;
    const ids = new Set([personOrName?.id, personOrName?.sourcePlayerId].filter(Boolean).map(String));
    const achievements = Array.isArray(personOrName?.coachAchievements) ? personOrName.coachAchievements : [];
    const matchesKind = (type: unknown) => kind === 'coy'
      ? /coach of the year|best coach|\bcoy\b/i.test(String(type ?? ''))
      : /champion/i.test(String(type ?? ''));
    const rows = new Set<string>();
    for (const achievement of achievements) {
      if (matchesKind(achievement?.type) || matchesKind(achievement?.label)) {
        rows.add(`${achievement?.season}|${achievement?.competitionId ?? ''}|${achievement?.type ?? ''}|${achievement?.label ?? ''}`);
      }
    }
    for (const award of (state.historicalAwards ?? []) as any[]) {
      const season = Number(award?.season);
      if (!Number.isFinite(season) || season > currentYear) continue;
      const type = String(award?.type ?? '').toLowerCase();
      if (!matchesKind(type)) continue;
      const idMatch = award?.coachId && ids.has(String(award.coachId));
      const winner = award?.coachName ?? (kind === 'coy' ? award?.name ?? award?.coy?.name : undefined);
      const nameMatch = String(winner ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === key;
      if (idMatch || nameMatch) rows.add(`${season}|${award?.competitionId ?? ''}|${type}`);
    }
    return rows.size;
  };
  const coachOfYearCount = (personOrName: any): number => coachAchievementCount(personOrName, 'coy');
  const coachChampionshipCount = (personOrName: any): number => coachAchievementCount(personOrName, 'champion');
  const coachAwardsSummary = (person: any): string[] => {
    const coyCount = coachOfYearCount(person);
    const championshipCount = coachChampionshipCount(person);
    return [
      coyCount > 0 ? `${coyCount}x Coach of the Year` : null,
      championshipCount > 0 ? `${championshipCount}x Champion as Coach` : null,
    ].filter((value): value is string => !!value);
  };
  const currency: string = state.leagueStats?.currency ?? 'EUR';
  const rejectedOffers = (team.tycoon?.staffOfferRejections ?? []) as StaffOfferRejection[];
  const findRejectedOffer = (candidate: StaffCandidate) => {
    const candidateName = candidate.name.trim().toLowerCase();
    return rejectedOffers.find(rejection =>
      rejection.candidateId === candidate.id
      || rejection.candidateName.trim().toLowerCase() === candidateName
    );
  };
  const openStaffOffer = (candidate: StaffCandidate, role: string, mode: 'hire' | 'extension') => {
    setSelectedRole(role);
    setSigningOpen(false);
    setCandidateAction(null);
    const previousRejection = findRejectedOffer(candidate);
    if (previousRejection) {
      setStaffDecision({
        candidate,
        role,
        mode,
        salary: previousRejection.salary,
        years: previousRejection.years,
        bonus: previousRejection.bonus,
        ratio: 0,
        accepted: false,
        previouslyRejected: true,
      });
      return;
    }
    setOfferCandidate({ candidate, mode });
  };
  const tid = team.id ?? team.tid;
  const staffMarket = resolveStaffMarketForTeam(team);
  const staffEconomyIndex = staffMarket === 'euro'
    ? getSeasonEconomyIndex(state, currentYear)
    : staffMarket === 'pba'
      ? getPbaHistoricalEconomyFactor(
          currentYear,
          Number(state.leagueStats?.inflationAverage ?? DEFAULT_CAP_INFLATION_AVERAGE) / 100,
        )
      : 1;
  const teamName = getTeamFullName(team);
  const teamLogoUrl = team.logoUrl ?? team.imgURL ?? team.teamLogoUrl ?? team.imgURLSmall;
  const isGMOwnTeam = state.gameMode === 'gm' && (team.id ?? team.tid) === state.userTeamId;
  const commName: string | undefined = state.commissionerName;
  const isStrictStaffPortraitSource = (person: any): boolean => {
    const source = String(person?.source ?? '');
    return source === 'historical-nba-coaches' || (source.startsWith('pba') && person?.isPlaceholder !== true);
  };
  const isHistoricalNbaBranch = state.leagueType === 'modded'
    && state.moddedLeagueBase === 'nba'
    && Number(state.nbaStartYear ?? 2026) < 2026;
  const isModernRealStaffMember = (person: any): boolean => {
    const source = String(person?.source ?? '');
    const id = String(person?.id ?? '');
    return source === 'nba-real-staff' || id.startsWith('nba-real-staff-');
  };
  const hasEnteredStaffMarket = (person: any): boolean => {
    const nba2k = getNBA2KCoach(person?.name ?? '');
    const career = getStaffCareerSnapshot({
      ...person,
      careerStartYear: person?.careerStartYear ?? nba2k?.coaching_career ?? person?.coaching_career,
      coaching_career: person?.coaching_career ?? nba2k?.coaching_career,
      startSeason: person?.startSeason ?? nba2k?.coaching_career,
    }, currentYear);
    return career.careerStartYear != null ? career.careerStartYear <= currentYear : currentYear >= 2026;
  };
  const generatedStaffImageId = (person: any): number | undefined => {
    if (String(person?.source ?? '').startsWith('fictional-generated-staff')) return undefined;
    if (typeof person?.staffImageId === 'number') return person.staffImageId;
    const source = String(person?.source ?? '');
    const id = String(person?.id ?? '');
    const generated = person?.isPlaceholder === true
      || source.startsWith('generated')
      || source.includes('fallback')
      || id.startsWith('nba-ai-staff-');
    return generated ? resolveStaffImageId(person) : undefined;
  };
  const staffIdentityKey = (person: any): string => {
    const sourcePlayerId = String(person?.sourcePlayerId ?? '').trim();
    if (sourcePlayerId) return `player:${sourcePlayerId}`;
    const name = String(person?.name ?? '').trim().toLowerCase();
    if (name) return `name:${name}`;
    const id = String(person?.id ?? '').trim();
    return id ? `id:${id}` : '';
  };
  const resolveCoachPhoto = (name?: string, savedPortrait?: string, strict = false): string | undefined =>
    strict ? sanitizeStaffPhotoUrl(savedPortrait) : resolveCoachPortrait(name, savedPortrait);
  let coach: any = (state.staff?.coaches ?? []).find((s: any) => s.team === team.name || s.team === teamName)
    ?? makePlaceholderCoach(team, { currentYear, leagueId: staffMarket });
  // Ensure coach record carries the best available portrait URL so the card
  // can render it via renderPortrait's portraitUrl parameter (which now wins
  // over the random Staff{N}.png fallback).
  if (coach && !coach.isPlaceholder) {
    coach = { ...coach, playerPortraitUrl: resolveCoachPhoto(coach.name, coach.playerPortraitUrl, isStrictStaffPortraitSource(coach)) };
  }
  // In GM mode on the user's own team, show the user's identity as GM — replace placeholder name only when no real coach is hired yet.
  if (isGMOwnTeam && commName && coach?.isPlaceholder) {
    coach = { ...coach, name: commName, playerPortraitUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(commName)}&background=1e293b&color=FDB927&size=256&bold=true` };
  }
  const gmFromState = (state.staff?.gms ?? []).find((s: any) => s.team === team.name || s.team === teamName);
  // Regenerate on-demand if the saved entry still has the old "Team Name GM" format or is a plain placeholder.
  const gm = (gmFromState && !gmFromState.isPlaceholder && !gmFromState.name.endsWith(' GM'))
    ? gmFromState
    : makePlaceholderGM(team);
  const owner = (state.staff?.owners ?? []).find((s: any) => s.team === team.name || s.team === teamName);
  const persistedStaffRosterExists = hasPersistedStaffRoster(team);
  const persistentStaff = new Map<string, any>(getActiveTeamStaffMembers(team, currentYear).map((s: any) => [s.role, s]));
  const getStaffFace = (person: any) => isRealFaceConfig(person?.face) ? person.face : undefined;
  const hydrateStaffPerson = (person: any, role: string) => {
    if (!person) return person;
    const name = person.name;
    const baseRole = role.replace(/ \d+$/, '');
    const isCoachRole = baseRole.includes('Coach');
    if (!isCoachRole) return person;
    const bio = name ? getCoachBio(name) : undefined;
    const nba2k = name ? getNBA2KCoach(name) : undefined;
    const contract = name ? getCoachContractSnapshot(name, currentYear) : null;
    const career = getStaffCareerSnapshot({
      ...person,
      careerStartYear: person?.careerStartYear ?? bio?.startSeason ?? nba2k?.coaching_career,
      born: person?.born ?? bio?.birthDate ?? undefined,
      age: person?.age ?? nba2k?.age ?? undefined,
    }, currentYear);
    return {
      ...person,
      nationality: normalizeNationality(person?.nationality ?? nba2k?.nationality ?? bio?.nationality ?? person?.born?.loc ?? 'Unknown'),
      yearsWithTeam: career.yearsWithTeam,
      hiredYear: person?.hiredYear ?? career.hiredYear ?? (career.yearsWithTeam > 0 ? currentYear - career.yearsWithTeam : undefined),
      careerStartYear: person?.careerStartYear ?? career.careerStartYear ?? undefined,
      bornYear: person?.bornYear ?? career.bornYear ?? undefined,
      contractYears: person?.contractYears ?? contract?.yearsLeft ?? undefined,
      contractExp: person?.contractExp ?? contract?.endYear ?? undefined,
      salary: person?.salary ?? contract?.annualSalary ?? undefined,
    };
  };
  // buildDisplayAttributes/buildStaffAttrs imported from shared module —
  // single source of truth across StaffSection / Signing modal / Ratings modal.
  const buildAttributes = buildDisplayAttributes;
  // Real ACs for this team from the nba2kcoachlist gist (positions like
  // "Assistant Coach", "Lead Assistant Coach"). Used at render time to fill
  // any empty AC slot — only when persisted staffMembers don't already cover
  // the role and the user hasn't fired that slot.
  const realTeamCoaches = getTeamStaff(team.name).concat(team.name !== teamName ? getTeamStaff(teamName) : []);
  const isACPosition = (pos: string) => {
    const p = (pos ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    return p === 'assistant coach' || p === 'lead assistant coach' || p === 'assistant  coach';
  };
  const activeHeadCoachName = String(persistentStaff.get('Head Coach')?.name ?? (!persistedStaffRosterExists ? coach?.name : '') ?? '').trim().toLowerCase();
  const realACPool = (isHistoricalNbaBranch && staffMarket === 'nba') || persistedStaffRosterExists
    ? []
    : realTeamCoaches
      .filter(c => isACPosition(c.position))
      .filter(c => c.name.trim().toLowerCase() !== activeHeadCoachName);
  // Build a real-coach record shaped like a persisted staffMember so the rest
  // of the render pipeline (attrs, photos, attributes seed) treats it the same.
  const realCoachToPerson = (c: any) => {
    const contract = getCoachContractSnapshot(c.name, currentYear);
    const career = getStaffCareerSnapshot(c, currentYear);
    return {
      name: c.name,
      nationality: normalizeNationality(c.nationality ?? 'American'),
      position: c.position,
      playerPortraitUrl: resolveCoachPhoto(c.name, undefined),
      staffImageId: undefined,
      isPlaceholder: false,
      isRealAutoFill: true,
      salary: contract?.annualSalary ?? undefined,
      contractYears: contract?.yearsLeft ?? 1,
      hiredYear: currentYear - Math.max(1, career.yearsWithTeam || 1),
      yearsWithTeam: career.yearsWithTeam,
      careerStartYear: career.careerStartYear ?? undefined,
      bornYear: career.bornYear ?? undefined,
    };
  };
  const getSalaryContext = (person: any, persisted: any) => {
    const career = getStaffCareerSnapshot(persisted ?? person, currentYear);
    const contract = person?.name ? getCoachContractSnapshot(person.name, currentYear) : null;
    const shouldTrustExternalSalary = !persisted || String(persisted?.id ?? '').startsWith('nba-real-staff-');
    return {
      yearsExperience: career.yearsExperience,
      yearsWithTeam: career.yearsWithTeam,
      externalSalary: shouldTrustExternalSalary ? contract?.annualSalary ?? null : null,
      economyScale: staffEconomyIndex,
    };
  };
  let realACCursor = 0;
  const nextRealAC = () => realACPool[realACCursor++];
  const resolvePerson = (role: string, fallback: any) => {
    if (firedRoles.includes(role)) return null;
    const persisted = persistentStaff.get(role);
    if (persisted) return persisted;
    if (fallback) return fallback;
    // Auto-fill empty AC slots from the real coach list (only when nothing
    // persisted and not fired by the user). Order: AC, AC 2, AC 3.
    if (role.startsWith('Assistant Coach')) {
      const realAC = nextRealAC();
      if (realAC) return realCoachToPerson(realAC);
    }
    return null;
  };
  const roles = [
    { role: 'Head Coach', person: resolvePerson('Head Coach', persistedStaffRosterExists ? null : coach), group: 'Coaching', focus: 'Tactics, rotations, game-day decisions', salary: getStaffRoleBaseSalary(tycoonTier, 'Head Coach', staffMarket), years: (() => {
      const persisted = persistentStaff.get('Head Coach')?.contractYears;
      if (persisted != null) return persisted;
      const contract = getCoachContractSnapshot(coach?.name, currentYear);
      if (contract?.yearsLeft != null) return contract.yearsLeft;
      return coach.yearsWithTeam ? Math.max(1, 4 - Math.min(3, coach.yearsWithTeam)) : 2;
    })() },
    // Resolve each AC slot exactly ONCE so the auto-fill cursor doesn't get
    // double-advanced and lose a real coach to a phantom second read.
    ...(() => {
      const ac1 = resolvePerson('Assistant Coach', null);
      const ac2 = resolvePerson('Assistant Coach 2', null);
      const ac3 = resolvePerson('Assistant Coach 3', null);
      return [
        { role: 'Assistant Coach',   person: ac1, group: 'Coaching', focus: 'Training sessions and opponent prep', salary: getStaffRoleBaseSalary(tycoonTier, 'Assistant Coach', staffMarket), years: persistentStaff.get('Assistant Coach')?.contractYears   ?? (ac1 as any)?.contractYears ?? 0 },
        { role: 'Assistant Coach 2', person: ac2, group: 'Coaching', focus: 'Training sessions and opponent prep', salary: getStaffRoleBaseSalary(tycoonTier, 'Assistant Coach 2', staffMarket), years: persistentStaff.get('Assistant Coach 2')?.contractYears ?? (ac2 as any)?.contractYears ?? 0 },
        { role: 'Assistant Coach 3', person: ac3, group: 'Coaching', focus: 'Training sessions and opponent prep', salary: getStaffRoleBaseSalary(tycoonTier, 'Assistant Coach 3', staffMarket), years: persistentStaff.get('Assistant Coach 3')?.contractYears ?? (ac3 as any)?.contractYears ?? 0 },
      ];
    })(),
    { role: 'Head of Sports Science', person: resolvePerson('Head of Sports Science', null), group: 'Performance', focus: 'Injury prevention and workload monitoring', salary: getStaffRoleBaseSalary(tycoonTier, 'Head of Sports Science', staffMarket), years: persistentStaff.get('Head of Sports Science')?.contractYears ?? 0 },
    { role: 'Head Physio', person: resolvePerson('Head Physio', null), group: 'Performance', focus: 'Recovery speed and day-to-day availability', salary: getStaffRoleBaseSalary(tycoonTier, 'Head Physio', staffMarket), years: persistentStaff.get('Head Physio')?.contractYears ?? 0 },
    // Player Development Coach — drives off-floor skill growth. Will wire to
    // the player progression engine: their development + motivating attrs
    // multiply per-player progression deltas during the season.
    { role: 'Player Development Coach', person: resolvePerson('Player Development Coach', null), group: 'Performance', focus: 'Individual workouts and off-season skill growth', salary: getStaffRoleBaseSalary(tycoonTier, 'Player Development Coach', staffMarket), years: persistentStaff.get('Player Development Coach')?.contractYears ?? 0 },
    { role: 'Chief Scout', person: resolvePerson('Chief Scout', persistedStaffRosterExists ? null : gm), group: 'Scouting & Analytics', focus: 'Player evaluation and market intelligence', salary: getStaffRoleBaseSalary(tycoonTier, 'Chief Scout', staffMarket), years: persistentStaff.get('Chief Scout')?.contractYears ?? (persistedStaffRosterExists ? 0 : 2) },
    { role: 'Head of Analytics', person: resolvePerson('Head of Analytics', null), group: 'Scouting & Analytics', focus: 'Shot profile, lineup data, and opponent models', salary: getStaffRoleBaseSalary(tycoonTier, 'Head of Analytics', staffMarket), years: persistentStaff.get('Head of Analytics')?.contractYears ?? 0 },
    ...(staffMarket === 'euro' ? [
      { role: 'Head of Academy', person: resolvePerson('Head of Academy', null), group: 'Youth Academy', focus: 'Academy development and long-term player growth', salary: getStaffRoleBaseSalary(tycoonTier, 'Head of Academy', staffMarket), years: persistentStaff.get('Head of Academy')?.contractYears ?? 0 },
      { role: 'Regional Scout', person: resolvePerson('Regional Scout', null), group: 'Youth Academy', focus: 'International youth identification', salary: getStaffRoleBaseSalary(tycoonTier, 'Regional Scout', staffMarket), years: persistentStaff.get('Regional Scout')?.contractYears ?? 0 },
      { role: 'Regional Scout 2', person: resolvePerson('Regional Scout 2', null), group: 'Youth Academy', focus: 'International youth identification', salary: getStaffRoleBaseSalary(tycoonTier, 'Regional Scout 2', staffMarket), years: persistentStaff.get('Regional Scout 2')?.contractYears ?? 0 },
      { role: 'Regional Scout 3', person: resolvePerson('Regional Scout 3', null), group: 'Youth Academy', focus: 'International youth identification', salary: getStaffRoleBaseSalary(tycoonTier, 'Regional Scout 3', staffMarket), years: persistentStaff.get('Regional Scout 3')?.contractYears ?? 0 },
      { role: 'Regional Scout 4', person: resolvePerson('Regional Scout 4', null), group: 'Youth Academy', focus: 'International youth identification', salary: getStaffRoleBaseSalary(tycoonTier, 'Regional Scout 4', staffMarket), years: persistentStaff.get('Regional Scout 4')?.contractYears ?? 0 },
    ] : []),
  ];
  const rawRolesWithLiveSalaries = roles.map(item => {
    const person = item.person ? hydrateStaffPerson(item.person, item.role) : item.person;
    const persisted = persistentStaff.get(item.role);
    const years = persisted?.contractYears ?? person?.contractYears ?? item.years;
    const salary = person
      ? normalizeStaffSalary(
        tycoonTier,
        item.role,
        persisted?.salary ?? person?.salary ?? item.salary,
        persisted?.rating ?? person?.rating,
        { market: staffMarket, ...getSalaryContext(person, persisted) },
      )
      : Math.round(item.salary * staffEconomyIndex);
    return { ...item, person, years, salary };
  });
  const seenStaffPeople = new Set<string>();
  const rolesWithLiveSalaries = rawRolesWithLiveSalaries.map(item => {
    if (item.person && Number(item.years) <= 0) {
      return { ...item, person: null, years: 0 };
    }
    const key = staffIdentityKey(item.person);
    if (key && seenStaffPeople.has(key)) return { ...item, person: null, years: 0 };
    if (key) seenStaffPeople.add(key);
    return item;
  });
  const filledRoles = rolesWithLiveSalaries.filter((r) => r.person).length;
  const openRoleCount = rolesWithLiveSalaries.filter((r) => !r.person).length;
  const totalCost = rolesWithLiveSalaries.reduce((sum, r) => sum + (r.person ? r.salary : 0), 0);
  const avgSkill = Math.round(rolesWithLiveSalaries.reduce((sum, r) => sum + (r.person ? staffOverallFor(r.role, r.person) : 58), 0) / rolesWithLiveSalaries.length);
  const needCandidatePools = candidateRole !== null;
  // Single source of truth for FA candidates: read real staff FAs, retired
  // player-to-staff joins, and the staff directory without trimming the list.
  const userLeagueId = inferEuroStaffLeagueId(team.tid ?? team.id ?? 0, state.leagueType, {
    teamLeague: (team as any).league,
    uiMode: state.leagueStats?.uiMode,
  });
  const candidatePool = useMemo(() => {
    if (!needCandidatePools) return new Map<string, StaffCandidate[]>();
    const normalizeNameKey = (value: string | undefined | null) => String(value ?? '').trim().toLowerCase();
    const buildAsk = (member: any, identity: string, baseSalary: number) => {
      const profile = getStaffAskProfile(member, identity);
      const salary = Math.max(5_000, Math.round(baseSalary * profile.salaryAskMultiplier / 5_000) * 5_000);
      return {
        salary,
        askYears: profile.salaryAskYears,
        askBonus: Math.round(salary * profile.salaryAskBonusRate / 5_000) * 5_000,
      };
    };
    const isAllowedNationality = (_nationalityRaw: unknown) => true;
    const staffCandidateRating = (member: any, computed: number) => {
      if (userLeagueId !== 'pba') return computed;
      const value = Number.isFinite(computed) ? computed : Number(member?.rating ?? member?.reputation ?? 50);
      return Math.max(20, Math.min(70, Math.round(value)));
    };
    const isGeneratedPoolMember = (member: any) => {
      const source = String(member?.source ?? '').toLowerCase();
      const id = String(member?.id ?? '').toLowerCase();
      return source.includes('generated')
        || source.includes('fallback')
        || source.includes('ai-staff')
        || id.startsWith('euro-staff-fa-')
        || id.startsWith('nba-ai-staff-');
    };
    const employedNames = new Set<string>();
    for (const nbaTeam of (state.teams ?? []) as any[]) {
      for (const member of (nbaTeam?.tycoon?.staffMembers ?? []) as any[]) {
        const key = normalizeNameKey(member?.name);
        if (key) employedNames.add(key);
      }
    }
    for (const euroTeam of (state.nonNBATeams ?? []) as any[]) {
      for (const member of (euroTeam?.tycoon?.staffMembers ?? []) as any[]) {
        const key = normalizeNameKey(member?.name);
        if (key) employedNames.add(key);
      }
    }
    const occupiedStaffNames = new Set(
      rolesWithLiveSalaries
        .map(role => normalizeNameKey(role.person?.name))
        .filter(Boolean),
    );
    const map = new Map<string, StaffCandidate[]>();
    for (const r of rolesWithLiveSalaries) {
      if (r.role !== candidateRole) continue;
      // Assistant Coach 2/3 are slot variants — they share the 'Assistant Coach'
      // pool. The base role name is what the FA pool tracks.
      const poolRole = r.role.replace(/ \d+$/, '');
      const coachingTrackRoles = new Set(['Head Coach', 'Assistant Coach', 'Player Development Coach', 'Youth Coach']);
      const acceptedPoolRoles = coachingTrackRoles.has(poolRole)
        ? coachingTrackRoles
        : new Set([poolRole]);
      const fromFreeAgency = (state.staffFreeAgents ?? [])
        .filter((member: any) => {
          if (employedNames.has(normalizeNameKey(member?.name))) return false;
          const memberRole = normalizeStaffPoolRole(member.position ?? member.jobTitle ?? member.role);
          if (!acceptedPoolRoles.has(memberRole)) return false;
          // Tolerate legacy save members without leagueId (pre-pool-refactor).
          if (!member.leagueId && userLeagueId === 'pba') return false;
          const nbaCanSeeEuropeanCandidate = userLeagueId === 'nba' && isEuroStaffLeagueId(member.leagueId);
          if (
            member.leagueId
            && member.leagueId !== userLeagueId
            && !(isEuroStaffLeagueId(userLeagueId) && isEuroStaffLeagueId(member.leagueId))
            && !nbaCanSeeEuropeanCandidate
          ) return false;
          if (isHistoricalNbaBranch && userLeagueId === 'nba' && isModernRealStaffMember(member) && !hasEnteredStaffMarket(member)) return false;
          return isAllowedNationality(member.nationality);
        })
        .map((member: any, index: number): StaffCandidate => {
          const seed = seedForStaff(member);
          const generatedDepth = isGeneratedPoolMember(member);
          const attributeProfile = member.attributeProfile
            ?? (userLeagueId === 'nba' && generatedDepth ? 'nba' : undefined);
          const attrs = attrsForCoach(member.name, seed, {
            role: r.role,
            attributeProfile,
            attributeOverrides: member.attributeOverrides,
          });
          const career = getStaffCareerSnapshot(member, currentYear);
          const memberRole = normalizeStaffPoolRole(member.position ?? member.jobTitle ?? member.role);
          const roleOverall = computeStaffOverall(r.role, attrs);
          const persistedRating = resolveStaffRating(r.role, {
            ...member,
            attributeProfile,
            coachingYears: Math.max(1, career.yearsExperience),
            playingYears: 0,
          });
          const computedRating = coachingTrackRoles.has(poolRole) && coachingTrackRoles.has(memberRole)
            ? roleOverall
            : poolRole === 'Head of Analytics' && generatedDepth
              ? Math.max(persistedRating, roleOverall)
              : persistedRating;
          const rating = staffCandidateRating(member, computedRating);
          const baseSalary = normalizeStaffSalary(
            tycoonTier,
            r.role,
            member.salary,
            rating,
            {
              yearsExperience: career.yearsExperience,
              yearsWithTeam: career.yearsWithTeam,
              market: staffMarket,
              economyScale: staffEconomyIndex,
            },
          );
          const candidateId = member.id ?? `staff-fa-${r.role}-${member.name}-${index}`;
          const ask = buildAsk(member, candidateId, baseSalary);
          return {
            id: candidateId,
            role: r.role,
            name: member.name,
            nationality: normalizeNationality(member.nationality ?? 'Unknown'),
            flag: getCountryFlag(normalizeNationality(member.nationality ?? 'Unknown')),
            teamLogoUrl: member.formerTeamLogoUrl ?? member.teamLogoUrl,
            lastRole: member.formerRole ?? member.position ?? member.jobTitle ?? member.role ?? 'N/A',
            lastTeam: member.formerTeam ?? member.team ?? 'N/A',
            ...ask,
            rating,
            years: Math.max(1, career.yearsExperience),
            coachingYears: Math.max(1, career.yearsExperience),
            playingYears: 0,
            careerStartYear: career.careerStartYear ?? member.careerStartYear,
            hiredYear: career.hiredYear ?? member.hiredYear,
            roleStartYear: member.roleStartYear,
            isGeneratedDepth: generatedDepth,
            career_history: member.career_history,
            coaching_career: member.coaching_career ?? (isStrictStaffPortraitSource(member) ? undefined : getNBA2KCoach(member.name)?.coaching_career),
            awardsSummary: Array.from(new Set([...(Array.isArray(member.awardsSummary) ? member.awardsSummary : []), ...coachAwardsSummary(member)])),
            face: member.face,
            staffImageId: isStrictStaffPortraitSource(member) ? undefined : generatedStaffImageId(member),
            playerPortraitUrl: member.playerPortraitUrl,
            attributeProfile,
            attributeOverrides: member.attributeOverrides,
            attributes: buildAttributes(r.role, seed, member.name, {
              attributeProfile,
              attributeOverrides: member.attributeOverrides,
            }),
          };
        });
      const fromDirectory = ((state.staff?.coaches ?? []) as any[])
        .filter(member => {
          if (userLeagueId === 'pba') return false;
          if (!member?.name) return false;
          if (state.leagueType === 'fictional' && member.team && member.team !== 'Unemployed') return false;
          if (isHistoricalNbaBranch && userLeagueId === 'nba' && !hasEnteredStaffMarket(member)) return false;
          if (employedNames.has(normalizeNameKey(member.name))) return false;
          if (occupiedStaffNames.has(normalizeNameKey(member.name))) return false;
          if (!isAllowedNationality(member.nationality)) return false;
          const directoryRole = normalizeStaffPoolRole(member.role ?? member.jobTitle ?? member.position);
          return acceptedPoolRoles.has(directoryRole);
        })
        .map((member: any, index: number): StaffCandidate => {
          const seed = seedForStaff(member);
          const attrs = attrsForCoach(member.name, seed, {
            role: r.role,
            attributeProfile: member.attributeProfile,
            attributeOverrides: member.attributeOverrides,
          });
          const career = getStaffCareerSnapshot(member, currentYear);
          const directoryRole = normalizeStaffPoolRole(member.role ?? member.jobTitle ?? member.position);
          const rating = coachingTrackRoles.has(poolRole) && coachingTrackRoles.has(directoryRole)
            ? computeStaffOverall(r.role, attrs)
            : resolveStaffRating(r.role, { ...member, coachingYears: Math.max(1, career.yearsExperience), playingYears: 0 });
          const candidateId = member.id ?? `staff-dir-${poolRole.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${member.name}-${index}`;
          const baseSalary = normalizeStaffSalary(
            tycoonTier,
            r.role,
            member.salary,
            rating,
            {
              yearsExperience: career.yearsExperience,
              yearsWithTeam: career.yearsWithTeam,
              market: staffMarket,
              economyScale: staffEconomyIndex,
            },
          );
          const ask = buildAsk(member, candidateId, baseSalary);
          return {
            id: candidateId,
            role: r.role,
            name: member.name,
            nationality: normalizeNationality(member.nationality ?? 'Unknown'),
            flag: getCountryFlag(normalizeNationality(member.nationality ?? 'Unknown')),
            teamLogoUrl: member.formerTeamLogoUrl ?? member.teamLogoUrl,
            lastRole: member.formerRole ?? member.jobTitle ?? member.role ?? member.position ?? 'N/A',
            lastTeam: member.formerTeam ?? member.team ?? 'N/A',
            ...ask,
            rating,
            years: Math.max(1, career.yearsExperience),
            coachingYears: Math.max(1, career.yearsExperience),
            playingYears: 0,
            careerStartYear: career.careerStartYear ?? member.careerStartYear,
            hiredYear: career.hiredYear ?? member.hiredYear,
            roleStartYear: member.roleStartYear,
            career_history: member.career_history,
            coaching_career: member.coaching_career ?? (isStrictStaffPortraitSource(member) ? undefined : getNBA2KCoach(member.name)?.coaching_career),
            awardsSummary: Array.from(new Set([...(Array.isArray(member.awardsSummary) ? member.awardsSummary : []), ...coachAwardsSummary(member)])),
            face: member.face,
            staffImageId: isStrictStaffPortraitSource(member) ? undefined : generatedStaffImageId(member),
            playerPortraitUrl: member.playerPortraitUrl,
            attributeProfile: member.attributeProfile,
            attributeOverrides: member.attributeOverrides,
            attributes: buildAttributes(r.role, seed, member.name, {
              attributeProfile: member.attributeProfile,
              attributeOverrides: member.attributeOverrides,
            }),
          };
        });
      const teamByTid = new Map<number, any>([
        ...((state.teams ?? []) as any[]).map((candidate: any) => [Number(candidate.id ?? candidate.tid), candidate] as const),
        ...((state.nonNBATeams ?? []) as any[]).map((candidate: any) => [Number(candidate.tid ?? candidate.id), candidate] as const),
      ]);
      const teamNameByTid = new Map<number, string>();
      const teamLogoByTid = new Map<number, string | undefined>();
      for (const [candidateTid, candidateTeam] of teamByTid) {
        teamNameByTid.set(candidateTid, getTeamFullName(candidateTeam));
        teamLogoByTid.set(candidateTid, candidateTeam.logoUrl ?? candidateTeam.imgURL ?? candidateTeam.teamLogoUrl);
      }
      const fromRetiredJoins = ((state.players ?? []) as any[])
        .filter((player: any) => {
          if (!player?.name) return false;
          if (!player?.postCareerStaffJoined) return false;
          if (isHistoricalNbaBranch && Number(player.tid ?? -1) >= 0 && Number(player.tid ?? -1) < 100) return false;
          if (employedNames.has(normalizeNameKey(player.name))) return false;
          if (occupiedStaffNames.has(normalizeNameKey(player.name))) return false;
          const joinedRole = normalizeStaffPoolRole(player.postCareerStaffRole);
          if (!acceptedPoolRoles.has(joinedRole)) return false;

          // Keep league-scoped visibility using last known team tid footprint.
          const statTids = (player.stats ?? [])
            .filter((s: any) => !s.playoffs && typeof s.tid === 'number' && (s.gp ?? 0) > 0)
            .map((s: any) => s.tid as number);
          const txTids = (player.transactions ?? [])
            .filter((tx: any) => typeof tx.tid === 'number')
            .map((tx: any) => tx.tid as number);
          const lastTid = [...statTids, ...txTids, player.draft?.tid]
            .reverse()
            .find((tid: any) => typeof tid === 'number' && tid >= 0);
          const lastTeam = typeof lastTid === 'number' ? teamByTid.get(lastTid) : undefined;
          const inferredLeagueId = inferEuroStaffLeagueId(lastTid ?? -1, state.leagueType, {
            teamLeague: lastTeam && 'league' in lastTeam ? lastTeam.league : undefined,
            uiMode: state.leagueStats.uiMode,
          });
          if (inferredLeagueId === userLeagueId) return true;
          return inferredLeagueId === 'nba' && userLeagueId !== 'pba';
        })
        .map((player: any, index: number): StaffCandidate => {
          const playingTids = new Set<number>();
          for (const stat of (player.stats ?? [])) {
            const tid = Number(stat?.tid);
            if ((stat?.gp ?? 0) > 0 && Number.isFinite(tid) && tid >= 0) playingTids.add(tid);
          }
          for (const tx of (player.transactions ?? [])) {
            const tid = Number(tx?.tid);
            if (Number.isFinite(tid) && tid >= 0) playingTids.add(tid);
          }
          if (Number.isFinite(Number(player?.draft?.tid)) && Number(player.draft.tid) >= 0) {
            playingTids.add(Number(player.draft.tid));
          }
          const lastTeamTid = [...playingTids].reverse()[0];
          const playingCareerTeams = [...playingTids]
            .map(tid => teamNameByTid.get(tid))
            .filter((name): name is string => !!name)
            .slice(0, 12);
          const regularStats = (player.stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0);
          const byTid = new Map<number, any[]>();
          for (const s of regularStats) {
            const tid = Number(s?.tid);
            if (!Number.isFinite(tid) || tid < 0) continue;
            const arr = byTid.get(tid) ?? [];
            arr.push(s);
            byTid.set(tid, arr);
          }
          const playingCareerRows = [...byTid.entries()].map(([tid, rows]) => {
            const seasons = rows.map(r => Number(r.season)).filter((n: number) => Number.isFinite(n)).sort((a: number, b: number) => a - b);
            const first = seasons[0];
            const last = seasons[seasons.length - 1];
            const years = first && last ? `${first}-${last}` : '—';
            return {
              years,
              team: teamNameByTid.get(tid) ?? 'Unknown Team',
              position: player.pos ?? '—',
            };
          }).sort((a, b) => String(b.years).localeCompare(String(a.years)));
          const totalGames = regularStats.reduce((sum: number, s: any) => sum + Number(s.gp ?? 0), 0);
          const sumStat = (key: string) => regularStats.reduce((sum: number, s: any) => sum + Number(s[key] ?? 0), 0);
          const perGame = (key: string) => totalGames > 0 ? sumStat(key) / totalGames : 0;
          const madeFG = sumStat('fg');
          const attFG = sumStat('fga');
          const awardList: Array<{ type?: string }> = player.awards ?? [];
          const countAward = (...types: string[]) => awardList.filter(a => types.includes(String(a.type ?? ''))).length;
          const countAwardContains = (...tokens: string[]) => awardList.filter(a => tokens.some(t => String(a.type ?? '').includes(t))).length;
          const awardsSummary = [
            (() => { const n = countAward('Won Championship', 'Champion', 'NBA Champion'); return n > 0 ? `${n}x NBA Champion` : null; })(),
            (() => { const n = countAward('Finals MVP'); return n > 0 ? `${n}x Finals MVP` : null; })(),
            (() => { const n = countAward('All-Star'); return n > 0 ? `${n}x NBA All-Star` : null; })(),
            (() => { const n = countAwardContains('All-NBA', 'All-League'); return n > 0 ? `${n}x All-NBA Team` : null; })(),
            (() => { const n = countAward('All-Rookie First Team'); return n > 0 ? `${n}x NBA All-Rookie First Team` : null; })(),
          ].filter((v): v is string => !!v);
          const seed = seedForStaff(player);
          const attrs = attrsForCoach(player.name, seed, {
            role: r.role,
            attributeOverrides: player.attributeOverrides,
          });
          const computedRating = resolveStaffRating(r.role, {
            ...player,
            ...attrs,
            coachingYears: 0,
            playingYears: Math.max(1, regularStats.length),
          });
          const rating = staffCandidateRating(player, computedRating);
          const yearsExperience = Math.max(1, regularStats.length);
          const playingYears = yearsExperience;
          const candidateId = player.internalId ? `retired-join-${player.internalId}` : `retired-join-${player.name}-${index}`;
          const baseSalary = normalizeStaffSalary(
            tycoonTier,
            r.role,
            getStaffMarketSalary(undefined, r.role, rating, {
              market: staffMarket,
              yearsExperience,
              yearsWithTeam: 0,
              economyScale: staffEconomyIndex,
            }),
            rating,
            { yearsExperience, yearsWithTeam: 0, market: staffMarket, economyScale: staffEconomyIndex },
          );
          const ask = buildAsk(player, candidateId, baseSalary);
          return {
            id: candidateId,
            role: r.role,
            name: player.name,
            nationality: normalizeNationality(player.born?.loc?.split(',').pop()?.trim() ?? player.nationality ?? 'Unknown'),
            flag: getCountryFlag(normalizeNationality(player.born?.loc?.split(',').pop()?.trim() ?? player.nationality ?? 'Unknown')),
            teamLogoUrl: (typeof lastTeamTid === 'number' ? teamLogoByTid.get(lastTeamTid) : undefined),
            lastRole: 'Player',
            lastTeam: (typeof lastTeamTid === 'number' ? teamNameByTid.get(lastTeamTid) : undefined) ?? 'Retired Player Pool',
            playingCareerTeams,
            playingCareerRows,
            awardsSummary,
            playingCareerStats: {
              games: totalGames,
              ppg: perGame('pts'),
              rpg: perGame('trb'),
              apg: perGame('ast'),
              fgPct: attFG > 0 ? (madeFG / attFG) * 100 : 0,
              seasons: regularStats.length,
            },
            ...ask,
            rating,
            years: 0,
            coachingYears: 0,
            playingYears,
            face: player.face,
            staffImageId: player.staffImageId,
            playerPortraitUrl: player.imgURL,
            attributeOverrides: player.attributeOverrides,
            attributes: buildAttributes(r.role, seed, player.name, {
              attributeOverrides: player.attributeOverrides,
            }),
          };
        });
      const dedupeByName = (arr: StaffCandidate[]) => {
        const seen = new Set<string>();
        return arr.filter(candidate => {
          const key = normalizeNameKey(candidate.name);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const retiredBucket = dedupeByName(fromRetiredJoins).sort((a, b) => b.rating - a.rating);
      const sourceFaBucket = dedupeByName(fromFreeAgency.filter(candidate => !candidate.isGeneratedDepth)).sort((a, b) => b.rating - a.rating);
      const generatedDepthBucket = dedupeByName(fromFreeAgency.filter(candidate => candidate.isGeneratedDepth)).sort((a, b) => b.rating - a.rating);
      const directoryBucket = dedupeByName(fromDirectory).sort((a, b) => b.rating - a.rating);

      const keep = mergeStaffCandidateBuckets({
        retired: retiredBucket,
        source: sourceFaBucket,
        directory: directoryBucket,
        generated: generatedDepthBucket,
      });
      map.set(r.role, keep);
    }
    return map;
  }, [candidateRole, currentYear, isHistoricalNbaBranch, needCandidatePools, rolesWithLiveSalaries, staffEconomyIndex, staffMarket, state.historicalAwards, state.leagueStats.uiMode, state.leagueType, state.nonNBATeams, state.players, state.staff?.coaches, state.staffFreeAgents, state.teams, userLeagueId, tycoonTier]);
  const renderPortrait = (face: any, initials: string, size = 'w-16 h-20', staffImageId?: number, name?: string, portraitUrl?: string, strictPortrait = false) => {
    const staffImg = strictPortrait
      ? sanitizeStaffPhotoUrl(portraitUrl)
      : resolveCoachPortrait(name, portraitUrl) ?? getStaffImageUrl(staffImageId);
    return (
      <div className={`${size} rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0 relative`}>
        {staffImg ? (
          <img
            src={staffImg}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(event) => {
              const img = event.currentTarget;
              if (img.dataset.localRegenFallback === '1') return;
              const fallback = getLocalRegenPortraitFallbackUrl(img.src);
              if (fallback) {
                img.dataset.localRegenFallback = '1';
                img.src = fallback;
              }
            }}
          />
        ) : isRealFaceConfig(face) ? (
          <div className="absolute left-1/2 top-1/2" style={{ width: '92%', height: '138%', transform: 'translate(-50%, -45%)' }}>
            <MyFace face={face} lazy style={{ width: '100%', height: '100%' }} />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-black text-amber-200">{initials}</div>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <SectionTitle icon={<Users size={22} />} title="Staff" subtitle="Manage your coaching, performance, and support team." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StaffSummaryCard icon={<Users size={20} />} label="Total Staff" value={`${filledRoles}/${roles.length}`} accent="blue" progress={filledRoles / Math.max(1, roles.length)} />
        <StaffSummaryCard icon={<Briefcase size={20} />} label="Annual Cost" value={formatCurrencyWithCode(totalCost, currency, false)} accent="violet" progress={filledRoles / Math.max(1, roles.length)} />
        <StaffSummaryCard icon={<Star size={20} />} label="Average Skill" value={`${avgSkill}/100`} accent="cyan" progress={avgSkill / 100} />
        <StaffSummaryCard icon={<Search size={20} />} label="Open Roles" value={String(openRoleCount)} accent="orange" progress={(roles.length - openRoleCount) / Math.max(1, roles.length)} />
      </div>
      <div className="grid xl:grid-cols-[1fr_390px] gap-6">
        <div className="space-y-6">
          {['Coaching', 'Performance', 'Scouting & Analytics', ...(staffMarket === 'euro' ? ['Youth Academy'] : [])].map((group) => (
            <section key={group} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{group}</div>
              <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
                {rolesWithLiveSalaries.filter((item) => item.group === group).map((item) => {
                  // Real NBA coaches (HC / AC) get curated or seeded gist
                  // values from nbacoachesratings; everyone else falls back
                  // to the local hashed-name seed.
                  const personSeed = item.person ? seedForStaff(item.person) : 0;
                  const personAttrs = item.person ? attrsForCoach(item.person.name, personSeed, {
                    role: item.role,
                    attributeProfile: item.person.attributeProfile,
                    attributeOverrides: item.person.attributeOverrides,
                  }) : null;
                  const baseRole = item.role.replace(/ \d+$/, '');
                  const initials = item.person?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '+';
                  const rating = item.person ? resolveStaffRating(item.role, item.person) : 0;
                  const face = getStaffFace(item.person);
                  const open = !item.person;
                  const tooltip = getStaffGameplayTooltip(item.role, team);
                  if (open) {
                    const ctaLabel = item.role.includes('Coach') ? 'Hire Coach'
                      : item.role.includes('Scout') ? 'Hire Scout'
                      : item.role.includes('Analyt') ? 'Hire Analyst'
                      : 'Hire Staff';
                    return (
                      <button
                        key={item.role}
                        onClick={() => {
                          setSelectedRole(item.role);
                          setSigningOpen(true);
                        }}
                        title={tooltip}
                        className="text-left rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 transition-all hover:border-amber-400/50 hover:bg-amber-400/5 flex flex-col items-center justify-center text-center min-h-[280px]"
                      >
                        <div className="w-14 h-14 rounded-full border border-dashed border-slate-600 flex items-center justify-center text-2xl font-black text-slate-500">+</div>
                        <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-amber-300">{displayStaffRole(item.role)}</div>
                        <div className="mt-1 text-sm font-black text-slate-300">Open Position</div>
                        <div className="mt-5 inline-flex items-center justify-center rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 h-9 text-[11px] font-black uppercase tracking-widest text-amber-200">{ctaLabel}</div>
                      </button>
                    );
                  }
                  const renewalDue = Number(item.years) <= 0;
                  return (
                    <button
                      key={item.role}
                      onClick={() => setActionPerson({ role: item.role, person: item.person, years: item.years, salary: item.salary })}
                      title={tooltip}
                      className={`text-left rounded-xl border bg-slate-950/70 p-4 transition-all ${renewalDue ? 'border-rose-400/60 shadow-[0_0_0_1px_rgba(251,113,133,0.18)] hover:border-rose-300/80' : 'border-slate-800 hover:border-slate-600'}`}
                    >
                      <div className="flex items-start gap-3">
                        {renderPortrait(face, initials, 'w-16 h-20', item.person?.staffImageId, item.person?.name, item.person?.playerPortraitUrl, isStrictStaffPortraitSource(item.person))}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-black text-white truncate">{item.person?.name}</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">{displayStaffRole(item.role)}</div>
                            </div>
                            <div className="w-11 h-11 rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 flex items-center justify-center text-sm font-black">
                              {rating}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{item.person?.nationality}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className={Number(item.years) <= 1 ? 'text-rose-300' : 'text-slate-500'}>{formatYearsLeftLabel(item.years)}</span>
                        <span className="text-slate-400">{formatCurrencyWithCode(item.salary, currency, false)}/yr</span>
                      </div>
                      <div className="mt-3 flex items-center justify-end border-t border-slate-800 pt-3 text-[10px] font-black uppercase tracking-widest text-amber-300">
                        <span>Manage ›</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-amber-300 mb-4">Front Office Chain</div>

            {/* GM card */}
            {(() => {
              const gmName = isGMOwnTeam && commName ? commName : gm.name;
              const gmImg = isGMOwnTeam && commName
                ? `https://ui-avatars.com/api/?name=${encodeURIComponent(commName)}&background=1e293b&color=FDB927&size=256&bold=true`
                : getStaffImageUrl(generatedStaffImageId(gm)) ?? null;
              const gmAttrs = (!isGMOwnTeam || !commName) ? (gm.attributes ?? {}) : null;
              return (
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 mb-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">General Manager</div>
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                      <img src={gmImg ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(gmName)}&background=1e293b&color=FDB927&size=256&bold=true`} alt={gmName} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-white leading-tight truncate">{gmName}</div>
                      {!isGMOwnTeam && gm.nationality && <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400"><CountryFlag country={gm.nationality} /> {normalizeNationality(gm.nationality)}</div>}
                      {isGMOwnTeam && <div className="text-xs text-amber-300 mt-0.5 font-black">You</div>}
                      {gmAttrs && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {gmAttrs.trade_aggression != null && <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-black text-slate-300">Trade {gmAttrs.trade_aggression}</span>}
                          {gmAttrs.scouting_focus != null && <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-black text-slate-300">Scouting {gmAttrs.scouting_focus}</span>}
                          {gmAttrs.spending != null && <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-black text-slate-300">Spending {gmAttrs.spending}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {isGMOwnTeam && state.gmCareer?.employment && (
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider">
                        <span className="text-slate-500">Current contract</span>
                        <span className="text-emerald-300">{formatCurrencyWithCode(state.gmCareer.employment.annualSalary, state.gmCareer.employment.currency ?? currency, false)}/yr · {state.gmCareer.employment.yearsRemaining} yrs</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-500">
                        <span>Owner approval</span><span className="text-slate-200">{Math.round(state.gmCareer.approval)}/100</span>
                      </div>
                      <div className="relative mt-1.5 h-3 overflow-hidden rounded bg-slate-900">
                        <div className={`h-full transition-[width] duration-700 ${state.gmCareer.approval >= 70 ? 'bg-emerald-500' : state.gmCareer.approval >= 45 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${Math.max(0, Math.min(100, state.gmCareer.approval))}%` }} />
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-10">{Array.from({ length: 10 }, (_, index) => <span key={index} className="border-r border-slate-950/50 last:border-0" />)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Owner card */}
            {(() => {
              const op = (team as any).ownerProfile ?? owner;
              if (!op) return (
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Owner</div>
                  <div className="font-black text-white">Ownership group</div>
                </div>
              );
              const realOwnerPhoto = resolveOwnerPrimaryPortrait(op, state.leagueType === 'fictional');
              const hasFace = isRealFaceConfig(op.face);
              const ownerImgFinal = realOwnerPhoto ?? (hasFace ? null : teamLogoUrl);
              const WEALTH_LABEL: Record<string, string> = { Billionaire: 'Billionaire', NationalMagnate: 'National Magnate', LocalWealthy: 'Local Wealthy' };
              const PATIENCE_BADGE: Record<string, string> = { LongTerm: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', Steady: 'border-amber-400/40 bg-amber-400/10 text-amber-300', TriggerHappy: 'border-rose-400/40 bg-rose-400/10 text-rose-300' };
              const VISION_LABEL: Record<string, string> = { WinNow: 'Win Now', Develop: 'Develop', Frugal: 'Frugal' };
              return (
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Owner</div>
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                      {ownerImgFinal
                        ? <img
                            src={ownerImgFinal}
                            alt={op.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(event) => {
                              if (!teamLogoUrl) return;
                              const img = event.currentTarget;
                              if (img.dataset.fallbackLogo === '1') return;
                              img.dataset.fallbackLogo = '1';
                              img.className = 'w-full h-full object-contain p-1.5';
                              img.src = teamLogoUrl;
                            }}
                          />
                        : isRealFaceConfig(op.face)
                        ? <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '92%', height: '138%', transform: 'translate(-50%, -45%)' }}><MyFace face={op.face} lazy style={{ width: '100%', height: '100%' }} /></div></div>
                        : teamLogoUrl
                          ? <img src={teamLogoUrl} alt="" className="w-full h-full object-contain p-1.5" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center text-xs font-black text-amber-200">{op.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-white leading-tight truncate">{op.name}</div>
                      {op.nationality && <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400"><CountryFlag country={op.nationality} /> {normalizeNationality(op.nationality)}</div>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {op.wealthTier && <span className="rounded border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] font-black text-violet-300">{WEALTH_LABEL[op.wealthTier] ?? op.wealthTier}</span>}
                        {op.patience && <span className={`rounded border px-2 py-0.5 text-[10px] font-black ${PATIENCE_BADGE[op.patience] ?? 'border-slate-700 text-slate-300'}`}>{op.patience}</span>}
                        {op.vision && <span className="rounded border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-black text-sky-300">{VISION_LABEL[op.vision] ?? op.vision}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </aside>
      </div>
      <AnimatePresence mode="wait">
        {signingOpen ? (
          <StaffSigningModal
            key="staff-candidates"
            selectedRole={selectedRole}
            pool={candidateRole === selectedRole ? candidatePool.get(selectedRole) ?? [] : []}
            loading={candidateRole !== selectedRole}
            currency={currency}
            onClose={() => {
              setSigningOpen(false);
            }}
            renderPortrait={renderPortrait}
            onSelectCandidate={(candidate) => {
              setSigningOpen(false);
              setCandidateAction({ role: selectedRole, candidate });
            }}
          />
        ) : offerCandidate ? (
          <StaffOfferModal
            key="staff-offer"
            candidate={offerCandidate.candidate}
            selectedRole={selectedRole}
            mode={offerCandidate.mode}
            currency={currency}
            currentYear={currentYear}
            tycoon={team.tycoon}
            renderPortrait={renderPortrait}
            onCancel={() => {
              if (offerCandidate.mode === 'hire') setSigningOpen(true);
              setOfferCandidate(null);
            }}
            onSubmit={(decision) => {
              setOfferCandidate(null);
              if (!decision.accepted) {
                onRecordStaffRejection({
                  candidateId: decision.candidate.id,
                  candidateName: decision.candidate.name,
                  role: decision.role,
                  mode: decision.mode,
                  season: currentYear,
                  date: String(state.date ?? `${currentYear}-06-30`),
                  salary: decision.salary,
                  years: decision.years,
                  bonus: decision.bonus,
                });
              }
              setStaffDecision(decision);
            }}
          />
        ) : staffDecision ? (
          <StaffDecisionModal
            key="staff-decision"
            decision={staffDecision}
            currency={currency}
            renderPortrait={renderPortrait}
            clubName={teamName}
            clubCountry={team.country ?? team.nation}
            clubCity={team.city ?? team.region}
            competitionLabel={team.league ?? state.euroPrimaryCompetitionId}
            onAcknowledge={() => {
              setStaffDecision(null);
            }}
            onFinalize={() => {
              const completed = onHireStaff({
                ...staffDecision.candidate,
                role: staffDecision.role,
                salary: staffDecision.salary,
                years: staffDecision.years,
                bonus: staffDecision.bonus,
                sponsorSigningPerk: staffDecision.sponsorSigningPerk,
              });
              if (!completed) return;
              setStaffDecision(null);
            }}
          />
        ) : null}
      </AnimatePresence>

      {candidateAction && (() => {
        const { role, candidate } = candidateAction;
        const occupied = rolesWithLiveSalaries.find(item => item.role === role)?.person;
        const candidateCareer = getStaffCareerSnapshot(candidate, currentYear);
        const candidatePersonnel: Personnel = {
          id: candidate.id,
          name: candidate.name,
          type: 'coach',
          jobTitle: role,
          team: candidate.lastTeam && candidate.lastTeam !== 'N/A' ? candidate.lastTeam : undefined,
          playerPortraitUrl: candidate.playerPortraitUrl
            ?? resolveCoachPortrait(candidate.name)
            ?? getStaffImageUrl(candidate.staffImageId),
          teamLogoUrl: candidate.teamLogoUrl,
          bornYear: candidateCareer.bornYear,
          careerStartYear: candidateCareer.careerStartYear,
          careerHistory: candidate.career_history ?? candidate.coaching_career,
          nationality: candidate.nationality,
          honors: candidate.awardsSummary,
          careerRows: candidate.playingCareerRows?.map(row => ({
            years: row.years,
            organization: row.team,
            role: row.position && row.position !== '—' ? `Player · ${row.position}` : 'Player',
          })),
          attributes: attrsForCoach(candidate.name, seedForStaff(candidate), {
            role,
            attributeProfile: candidate.attributeProfile,
            attributeOverrides: candidate.attributeOverrides,
          }),
        };
        return (
          <PersonnelActionsModal
            person={candidatePersonnel}
            isOpen={true}
            onClose={() => {
              setCandidateAction(null);
              setSigningOpen(true);
            }}
            filterActions={occupied ? ['view_bio', 'view_ratings'] : ['view_bio', 'view_ratings', 'sign_staff']}
            footerMessage={occupied
              ? `${occupied.name} currently holds the ${displayStaffRole(role)} position. Fire the current staff member before signing a replacement.`
              : undefined}
            onActionSelect={(action) => {
              if (action === 'view_bio') {
                setBioPerson(candidatePersonnel);
                setCandidateAction(null);
              } else if (action === 'view_ratings') {
                setRatingsPerson(candidatePersonnel);
                setCandidateAction(null);
              } else if (action === 'sign_staff' && !occupied) {
                openStaffOffer(candidate, role, 'hire');
              }
            }}
          />
        );
      })()}

      {/* Staff Action Modal — reuses PersonnelActionsModal infrastructure */}
      {(() => {
        if (!actionPerson) return null;
        const { role, person, years, salary } = actionPerson;
        const isAC = role.startsWith('Assistant Coach');
        const hcVacant = firedRoles.includes('Head Coach');
        const member = (team.tycoon?.staffMembers ?? []).find((s: any) => s.role === role);
        // Trust the displayed "Years Left" so the action gates align with the
        // card. Member-based math missed Head Coaches living only in
        // state.staff.coaches (no tycoon.staffMembers entry).
        const isExpiring = years <= 0;
        const canExtend = years <= 1;
        const staffPersonnel: Personnel = {
          id: person?.id ?? `staff-${role}`,
          name: person?.name ?? '',
          type: 'coach',
          jobTitle: role,
          team: teamName,
          teamLogoUrl,
          playerPortraitUrl: isStrictStaffPortraitSource(person)
            ? sanitizeStaffPhotoUrl(person?.playerPortraitUrl)
            : resolveCoachPortrait(person?.name, person?.playerPortraitUrl) ?? getStaffImageUrl(generatedStaffImageId(person)),
          bornYear: (member ?? person)?.bornYear,
          careerStartYear: (member ?? person)?.careerStartYear,
          hiredYear: (member ?? person)?.hiredYear,
          yearsWithTeam: getStaffCareerSnapshot(member ?? person, currentYear).yearsWithTeam,
          careerHistory: (member ?? person)?.career_history ?? (member ?? person)?.coaching_career,
          basketballReferenceUrl: (member ?? person)?.basketballReferenceUrl,
          bioText: (member ?? person)?.bioText,
          nationality: (member ?? person)?.nationality,
          honors: Array.from(new Set([
            ...(Array.isArray((member ?? person)?.awardsSummary) ? (member ?? person).awardsSummary : []),
            ...coachAwardsSummary(member ?? person),
          ])),
          careerRows: Array.isArray((member ?? person)?.playingCareerRows)
            ? (member ?? person).playingCareerRows.map((row: any) => ({
                years: String(row.years ?? ''),
                organization: String(row.team ?? row.organization ?? ''),
                role: row.role ?? (row.position && row.position !== '—' ? `Player · ${row.position}` : 'Player'),
              }))
            : undefined,
          attributes: attrsForCoach(person?.name, seedForStaff(member ?? person), {
            role,
            attributeProfile: (member ?? person)?.attributeProfile,
            attributeOverrides: (member ?? person)?.attributeOverrides,
          }),
        };
        const filterActions: PersonnelActionType[] = [
          ...(canExtend ? ['resign_staff' as PersonnelActionType] : []),
          'view_bio',
          'view_ratings',
          ...(canHostTeamActivity ? ['dinner' as PersonnelActionType, 'movie' as PersonnelActionType] : []),
          'view_candidates',
          ...(isAC && hcVacant ? ['promote_to_hc' as PersonnelActionType] : []),
          ...(!isExpiring ? ['fire' as PersonnelActionType] : []),
        ];
        return (
          <PersonnelActionsModal
            person={staffPersonnel}
            isOpen={true}
            onClose={() => setActionPerson(null)}
            filterActions={filterActions}
            onActionSelect={(action) => {
              if (action === 'fire') {
                setFireConfirm({ role, name: person?.name ?? role, person });
                setActionPerson(null);
              }
              else if (action === 'dinner' || action === 'movie') {
                teamActivity.open({
                  id: staffPersonnel.id,
                  name: staffPersonnel.name,
                  title: staffPersonnel.jobTitle ?? 'Staff',
                  organization: staffPersonnel.team ?? getTeamFullName(team),
                  type: 'coach',
                  playerPortraitUrl: staffPersonnel.playerPortraitUrl,
                  teamLogoUrl: staffPersonnel.teamLogoUrl,
                }, action, teamId);
                setActionPerson(null);
              }
              else if (action === 'promote_to_hc') { onPromoteStaff(person, role, 'Head Coach'); setActionPerson(null); }
              else if (action === 'resign_staff') {
                const baseRole = role.replace(/ \d+$/, '');
                const career = getStaffCareerSnapshot(member ?? person, currentYear);
                const attrs = attrsForCoach(person?.name, seedForStaff(member ?? person), {
                  role,
                  attributeProfile: (member ?? person)?.attributeProfile,
                  attributeOverrides: (member ?? person)?.attributeOverrides,
                });
                const rating = resolveStaffRating(role, member ?? person);
                const baseSalary = getStaffMarketSalary(
                  tycoonTier,
                  role,
                  rating,
                  {
                    market: staffMarket,
                    yearsExperience: Math.max(1, career.yearsExperience),
                    yearsWithTeam: career.yearsWithTeam + 1,
                    economyScale: staffEconomyIndex,
                  },
                );
                const sourcePerson = member ?? person;
                const resignId = member?.id ?? `resign-${role}`;
                const resignAskProfile = getStaffAskProfile(sourcePerson, resignId);
                const resignSalary = Math.max(5_000, Math.round(baseSalary * resignAskProfile.salaryAskMultiplier / 5_000) * 5_000);
                const resignCandidate = {
                  ...sourcePerson,
                  id: resignId,
                  role,
                  name: person?.name ?? '',
                  nationality: person?.nationality ?? '',
                  flag: getCountryFlag(person?.nationality),
                  salary: resignSalary,
                  askYears: resignAskProfile.salaryAskYears,
                  askBonus: Math.round(resignSalary * resignAskProfile.salaryAskBonusRate / 5_000) * 5_000,
                  rating,
                  years: 2,
                  face: person?.face,
                  staffImageId: isStrictStaffPortraitSource(person) ? undefined : generatedStaffImageId(person),
                  playerPortraitUrl: isStrictStaffPortraitSource(person)
                    ? sanitizeStaffPhotoUrl(person?.playerPortraitUrl)
                    : resolveCoachPortrait(person?.name, person?.playerPortraitUrl) ?? getStaffImageUrl(generatedStaffImageId(person)),
                  attributes: buildAttributes(baseRole, seedForStaff(member ?? person), person?.name, {
                    attributeProfile: (member ?? person)?.attributeProfile,
                  }),
                };
                setActionPerson(null);
                openStaffOffer(resignCandidate, role, 'extension');
              }
              else if (action === 'view_ratings') {
                setRatingsPerson(staffPersonnel);
                setActionPerson(null);
              }
              else if (action === 'view_bio') {
                setBioPerson(staffPersonnel);
                setActionPerson(null);
              }
              else if (action === 'view_candidates') {
                setSelectedRole(role);
                setActionPerson(null);
                setSigningOpen(true);
              }
              else { setActionPerson(null); }
            }}
          />
        );
      })()}

      <AnimatePresence>
        {bioPerson && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setBioPerson(null)} />
            <motion.div
              className="relative z-10 flex h-[94vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-blue-400/30 bg-slate-900 shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
            >
              <PersonnelBioView person={bioPerson} onBack={() => setBioPerson(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ratingsPerson && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setRatingsPerson(null)} />
            <motion.div
              className="relative z-10 flex h-[94vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-blue-400/30 bg-slate-900 shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
            >
              <PersonnelRatingsView person={ratingsPerson} onBack={() => setRatingsPerson(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fireConfirm && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setFireConfirm(null)} />
            <motion.div
              className="relative z-10 w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 shadow-2xl"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="p-6 border-b border-slate-800">
                <div className="text-[10px] font-black uppercase tracking-widest text-rose-300">Confirm Staff Move</div>
                <div className="mt-2 text-lg font-black text-white leading-tight">Fire {fireConfirm.name}?</div>
                <div className="mt-2 text-sm text-slate-400">This will remove them from the {displayStaffRole(fireConfirm.role)} role.</div>
              </div>
              <div className="p-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setFireConfirm(null)}
                  className="h-10 px-4 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-xs font-black uppercase tracking-widest hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onFireStaff(fireConfirm.role, fireConfirm.person);
                    setFireConfirm(null);
                  }}
                  className="h-10 px-4 rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-200 text-xs font-black uppercase tracking-widest hover:bg-rose-500/25"
                >
                  Confirm Fire
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {teamActivity.portals}
    </div>
  );
};
