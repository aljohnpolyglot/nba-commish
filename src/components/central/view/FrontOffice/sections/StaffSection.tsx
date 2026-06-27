import React, { useMemo, useState } from 'react';
import { Briefcase, Search, Star, Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getCountryFlag, normalizeNationality } from '../../../../../utils/countryFlags';
import { getTeamFullName } from '../../../../../utils/teamNames';
import { makePlaceholderCoach, makePlaceholderGM } from '../../../../../services/staff/staffFallback';
import { MyFace, isRealFaceConfig } from '../../../../shared/MyFace';
import { getStaffImageUrl, deterministicStaffImageId, resolveStaffImageId } from '../../../../../utils/staffPortrait';
import { inferEuroStaffLeagueId, normalizeStaffPoolRole } from '../../../../../services/euro/staffPool';
import { fetchCoachData, getCoachBio, getNBA2KCoach, getTeamStaff, getCoachContractSnapshot, getStaffCareerSnapshot, OWNER_IMAGES } from '../../../../../services/staffService';
import { ensureStaffPhotoData, resolveCoachPortrait, resolveStaffPortrait, useStaffPhotoStore } from '../../../../../store/staffPhotoStore';
import { StaffSigningModal, type StaffCandidate } from '../StaffSigning/StaffSigningModal';
import { getStaffMarketSalary, getStaffRoleBaseSalary, normalizeStaffSalary, type StaffMarket } from '../../../../../services/tycoon/economyScale';
import { SectionTitle } from '../shared/helpers';
import { FacilityKpi } from '../shared/FacilityKpi';
import { PersonnelActionsModal, type PersonnelActionType } from '../../PersonnelActionsModal';
import type { Personnel } from '../../LeagueOfficeSearcher';
import {
  buildStaffAttrs,
  buildDisplayAttributes,
  seedForStaff,
  staffOverallFor,
  resolveStaffRating,
  computeStaffOverall,
  attrsForCoach,
  STAFF_ATTRIBUTE_GROUPS,
  getStaffAttributeTooltip,
} from '../../../../../services/staff/displayAttributes';
import { getStaffGameplayTooltip } from '../../../../../services/staff/staffGameplayEffects';
import { parseCareerLines, resolveHistoryLogo, splitCoachingRow, splitPlayingRow } from '../shared/staffCareerUtils';
import { getLocalRegenPortraitFallbackUrl } from '../../../../../utils/newgenPortrait';

export const StaffSection: React.FC<{
  state: any;
  team: any;
  onHireStaff: (hire: any) => void;
  onFireStaff: (role: string) => void;
  onPromoteStaff: (person: any, fromRole: string, toRole: string) => void;
}> = ({ state, team, onHireStaff, onFireStaff, onPromoteStaff }) => {
  const parseCareerLinesForYear = (value: string | undefined) =>
    parseCareerLines(String(value ?? '').replace(/present/gi, String(currentYear)));
  const formatYearsLeftLabel = (years: number) => `${years} ${years === 1 ? 'Year' : 'Years'} Left`;
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingMode, setSigningMode] = useState<'hire' | 'extension'>('hire');
  const [selectedRole, setSelectedRole] = useState('Head Coach');
  const [actionPerson, setActionPerson] = useState<{ role: string; person: any; years: number; salary: number } | null>(null);
  const [fireConfirm, setFireConfirm] = useState<{ role: string; name: string } | null>(null);
  const [ratingsPerson, setRatingsPerson] = useState<{ role: string; person: any; years: number; salary: number } | null>(null);
  const [ratingsTab, setRatingsTab] = useState<'attributes' | 'career'>('attributes');
  const [resignPool, setResignPool] = useState<any[] | null>(null);
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
  const firedRoles: string[] = (team.tycoon?.firedStaffRoles ?? []);
  const tycoonTier = team.tycoon?.tier;
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();
  const currency: string = state.leagueStats?.currency ?? 'EUR';
  const tid = team.id ?? team.tid;
  const staffMarket: StaffMarket = tid >= 0 && tid < 100
    ? 'nba'
    : tid >= 2000 && tid < 2100
      ? 'pba'
      : 'euro';
  const teamName = getTeamFullName(team);
  const teamLogoUrl = team.logoUrl ?? team.imgURL ?? team.teamLogoUrl ?? team.imgURLSmall;
  const isGMOwnTeam = state.gameMode === 'gm' && (team.id ?? team.tid) === state.userTeamId;
  const commName: string | undefined = state.commissionerName;
  const resolveCoachPhoto = (name?: string, savedPortrait?: string): string | undefined =>
    resolveCoachPortrait(name, savedPortrait);
  let coach: any = (state.staff?.coaches ?? []).find((s: any) => s.team === team.name || s.team === teamName)
    ?? makePlaceholderCoach(team);
  // Ensure coach record carries the best available portrait URL so the card
  // can render it via renderPortrait's portraitUrl parameter (which now wins
  // over the random Staff{N}.png fallback).
  if (coach && !coach.isPlaceholder) {
    coach = { ...coach, playerPortraitUrl: resolveCoachPhoto(coach.name, coach.playerPortraitUrl) };
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
  const persistentStaff = new Map<string, any>((team.tycoon?.staffMembers ?? []).map((s: any) => [s.role, s]));
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
      yearsWithTeam: person?.yearsWithTeam ?? career.yearsWithTeam,
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
  const realACPool = realTeamCoaches
    .filter(c => isACPosition(c.position))
    .filter(c => c.name !== coach?.name);
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
      staffImageId: deterministicStaffImageId(c.name),
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
    { role: 'Head Coach', person: resolvePerson('Head Coach', coach), group: 'Coaching', focus: 'Tactics, rotations, game-day decisions', salary: getStaffRoleBaseSalary(tycoonTier, 'Head Coach', staffMarket), years: (() => {
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
    { role: 'Chief Scout', person: resolvePerson('Chief Scout', gm), group: 'Scouting & Analytics', focus: 'Player evaluation and market intelligence', salary: getStaffRoleBaseSalary(tycoonTier, 'Chief Scout', staffMarket), years: persistentStaff.get('Chief Scout')?.contractYears ?? 2 },
    { role: 'Head of Analytics', person: resolvePerson('Head of Analytics', null), group: 'Scouting & Analytics', focus: 'Shot profile, lineup data, and opponent models', salary: getStaffRoleBaseSalary(tycoonTier, 'Head of Analytics', staffMarket), years: persistentStaff.get('Head of Analytics')?.contractYears ?? 0 },
  ];
  const rolesWithLiveSalaries = roles.map(item => {
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
      : item.salary;
    return { ...item, person, years, salary };
  });
  const filledRoles = rolesWithLiveSalaries.filter((r) => r.person).length;
  const openRoleCount = rolesWithLiveSalaries.filter((r) => !r.person).length;
  const expiringRoleCount = rolesWithLiveSalaries.filter((r) => r.person && Number(r.years) <= 0).length;
  const dueRoleCount = openRoleCount + expiringRoleCount;
  const totalCost = rolesWithLiveSalaries.reduce((sum, r) => sum + (r.person ? r.salary : 0), 0);
  const avgSkill = Math.round(rolesWithLiveSalaries.reduce((sum, r) => sum + (r.person ? staffOverallFor(r.role, r.person) : 58), 0) / rolesWithLiveSalaries.length);
  const needCandidatePools = signingOpen || !!actionPerson || !!resignPool;
  // Single source of truth for FA candidates: read from state.staffFreeAgents,
  // filter by user's league (so a Manresa GM never sees Euroleague-only FAs)
  // and target position. The pool is guaranteed depth=10 per position via
  // ensureStaffPoolDepth, so no on-the-fly emergency generation here.
  const userLeagueId = inferEuroStaffLeagueId(team.tid ?? team.id ?? 0);
  const candidatePool = useMemo(() => {
    if (!needCandidatePools) return new Map<string, StaffCandidate[]>();
    const normalizeNameKey = (value: string | undefined | null) => String(value ?? '').trim().toLowerCase();
    const isAllowedNationality = (_nationalityRaw: unknown) => true;
    const staffCandidateRating = (member: any, computed: number) => {
      if (userLeagueId !== 'pba') return computed;
      const stored = Number(member?.rating ?? member?.reputation ?? computed);
      const value = Number.isFinite(stored) ? stored : computed;
      return Math.max(42, Math.min(64, Math.round(value)));
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
      // Assistant Coach 2/3 are slot variants — they share the 'Assistant Coach'
      // pool. The base role name is what the FA pool tracks.
      const poolRole = r.role.replace(/ \d+$/, '');
      const acceptedPoolRoles = poolRole === 'Head Coach'
        ? new Set(['Head Coach', 'Assistant Coach'])
        : new Set([poolRole]);
      const fromFreeAgency = (state.staffFreeAgents ?? [])
        .filter((member: any) => {
          if (employedNames.has(normalizeNameKey(member?.name))) return false;
          const memberRole = normalizeStaffPoolRole(member.position ?? member.jobTitle ?? member.role);
          if (!acceptedPoolRoles.has(memberRole)) return false;
          // Tolerate legacy save members without leagueId (pre-pool-refactor).
          if (!member.leagueId && userLeagueId === 'pba') return false;
          if (member.leagueId && member.leagueId !== userLeagueId) return false;
          return isAllowedNationality(member.nationality);
        })
        .map((member: any, index: number): StaffCandidate => {
          // Seed comes from the FA's stored identity (name + reputation), so
          // the attributes the modal shows here are the SAME attributes that
          // the card and ratings-modal will render after hire.
          const seed = seedForStaff(member);
          const attrs = attrsForCoach(member.name, seed, {
            role: r.role,
            attributeProfile: member.attributeProfile,
            attributeOverrides: member.attributeOverrides,
          });
          const career = getStaffCareerSnapshot(member, currentYear);
          const computedRating = resolveStaffRating(r.role, { ...member, coachingYears: Math.max(1, career.yearsExperience), playingYears: 0 });
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
            },
          );
          return {
            id: member.id ?? `staff-fa-${r.role}-${member.name}-${index}`,
            role: r.role,
            name: member.name,
            nationality: normalizeNationality(member.nationality ?? 'Unknown'),
            flag: getCountryFlag(normalizeNationality(member.nationality ?? 'Unknown')),
            teamLogoUrl: member.formerTeamLogoUrl ?? member.teamLogoUrl,
            lastRole: member.formerRole ?? member.position ?? member.jobTitle ?? member.role ?? 'N/A',
            lastTeam: member.formerTeam ?? member.team ?? 'N/A',
            salary: baseSalary,
            rating,
            years: Math.max(1, career.yearsExperience),
            coachingYears: Math.max(1, career.yearsExperience),
            playingYears: 0,
            career_history: member.career_history ?? getNBA2KCoach(member.name)?.career_history,
            coaching_career: member.coaching_career ?? getNBA2KCoach(member.name)?.coaching_career,
            face: member.face,
            staffImageId: resolveStaffImageId(member),
            playerPortraitUrl: member.playerPortraitUrl,
            attributeOverrides: member.attributeOverrides,
            attributes: buildAttributes(r.role, seed, member.name, {
              attributeProfile: member.attributeProfile,
              attributeOverrides: member.attributeOverrides,
            }),
          };
        });
      const fromDirectory = ((state.staff?.coaches ?? []) as any[])
        .filter(member => {
          if (userLeagueId === 'pba') return false;
          if (!member?.name) return false;
          if (employedNames.has(normalizeNameKey(member.name))) return false;
          if (occupiedStaffNames.has(normalizeNameKey(member.name))) return false;
          if (!isAllowedNationality(member.nationality)) return false;
          const directoryRole = normalizeStaffPoolRole(member.role ?? member.jobTitle ?? member.position);
          return directoryRole === poolRole;
        })
        .map((member: any, index: number): StaffCandidate => {
          const seed = seedForStaff(member);
          const attrs = attrsForCoach(member.name, seed, {
            role: r.role,
            attributeProfile: member.attributeProfile,
            attributeOverrides: member.attributeOverrides,
          });
          const career = getStaffCareerSnapshot(member, currentYear);
          const rating = resolveStaffRating(r.role, { ...member, coachingYears: Math.max(1, career.yearsExperience), playingYears: 0 });
          return {
            id: member.id ?? `staff-dir-${poolRole.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${member.name}-${index}`,
            role: r.role,
            name: member.name,
            nationality: normalizeNationality(member.nationality ?? 'Unknown'),
            flag: getCountryFlag(normalizeNationality(member.nationality ?? 'Unknown')),
            teamLogoUrl: member.formerTeamLogoUrl ?? member.teamLogoUrl,
            lastRole: member.formerRole ?? member.jobTitle ?? member.role ?? member.position ?? 'N/A',
            lastTeam: member.formerTeam ?? member.team ?? (typeof member.position === 'string' ? member.position : 'N/A'),
            salary: normalizeStaffSalary(
              tycoonTier,
              r.role,
              member.salary,
              rating,
              {
                yearsExperience: career.yearsExperience,
                yearsWithTeam: career.yearsWithTeam,
                market: staffMarket,
              },
            ),
            rating,
            years: Math.max(1, career.yearsExperience),
            coachingYears: Math.max(1, career.yearsExperience),
            playingYears: 0,
            career_history: member.career_history ?? getNBA2KCoach(member.name)?.career_history,
            coaching_career: member.coaching_career ?? getNBA2KCoach(member.name)?.coaching_career,
            face: member.face,
            staffImageId: resolveStaffImageId(member),
            playerPortraitUrl: member.playerPortraitUrl,
            attributeOverrides: member.attributeOverrides,
            attributes: buildAttributes(r.role, seed, member.name, {
              attributeProfile: member.attributeProfile,
              attributeOverrides: member.attributeOverrides,
            }),
          };
        });
      const fromRetiredJoins = ((state.players ?? []) as any[])
        .filter((player: any) => {
          if (!player?.name) return false;
          if (!player?.postCareerStaffJoined) return false;
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
          const inferredLeagueId = (() => {
            if (typeof lastTid !== 'number') return 'nba';
            if (lastTid >= 0 && lastTid < 100) return 'nba';
            if (lastTid >= 1000 && lastTid < 1100) return 'euroleague';
            if (lastTid >= 5000 && lastTid < 5100) return 'endesa';
            if (lastTid >= 2000 && lastTid < 2100) return 'pba';
            if (lastTid >= 4000 && lastTid < 4100) return 'bleague';
            if (lastTid >= 7000 && lastTid < 7100) return 'chinacba';
            if (lastTid >= 8000 && lastTid < 8100) return 'nblaus';
            return 'endesa';
          })();
          return inferredLeagueId === userLeagueId;
        })
        .map((player: any, index: number): StaffCandidate => {
          const teamNameByTid = new Map<number, string>([
            ...((state.teams ?? []) as any[]).map((t: any) => [Number(t.id ?? t.tid), getTeamFullName(t)] as const),
            ...((state.nonNBATeams ?? []) as any[]).map((t: any) => [Number(t.tid ?? t.id), getTeamFullName(t)] as const),
          ]);
          const teamLogoByTid = new Map<number, string | undefined>([
            ...((state.teams ?? []) as any[]).map((t: any) => [Number(t.id ?? t.tid), t.logoUrl ?? t.imgURL ?? t.teamLogoUrl] as const),
            ...((state.nonNBATeams ?? []) as any[]).map((t: any) => [Number(t.tid ?? t.id), t.logoUrl ?? t.imgURL ?? t.teamLogoUrl] as const),
          ]);
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
            playingYears: Math.max(
              1,
              ((player.stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length) || 1,
            ),
          });
          const rating = staffCandidateRating(player, computedRating);
          const yearsExperience = Math.max(
            1,
            ((player.stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length) || 1,
          );
          const playingYears = yearsExperience;
          return {
            id: player.internalId ? `retired-join-${player.internalId}` : `retired-join-${player.name}-${index}`,
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
            salary: normalizeStaffSalary(
              tycoonTier,
              r.role,
              getStaffMarketSalary(undefined, r.role, rating, {
                market: staffMarket,
                yearsExperience,
                yearsWithTeam: 0,
              }),
              rating,
              { yearsExperience, yearsWithTeam: 0, market: staffMarket },
            ),
            rating,
            years: 0,
            coachingYears: 0,
            playingYears,
            face: player.face,
            staffImageId: player.staffImageId ?? deterministicStaffImageId(player.name),
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
      const faBucket = dedupeByName(fromFreeAgency).sort((a, b) => b.rating - a.rating);
      const directoryBucket = dedupeByName(fromDirectory).sort((a, b) => b.rating - a.rating);

      const targetCountByRole: Record<string, number> = {
        'Head Coach': 60,
        'Assistant Coach': 48,
        'Player Development Coach': 40,
      };
      const targetCount = targetCountByRole[poolRole] ?? 36;

      // Keep all retired-join staff visible, then fill with strongest market FAs,
      // then directory backfill only if still under target.
      const keep: StaffCandidate[] = [...retiredBucket];
      const seen = new Set(keep.map(candidate => normalizeNameKey(candidate.name)));
      const pushUnique = (candidate: StaffCandidate) => {
        const key = normalizeNameKey(candidate.name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        keep.push(candidate);
      };
      for (const candidate of faBucket) {
        if (keep.length >= targetCount) break;
        pushUnique(candidate);
      }
      for (const candidate of directoryBucket) {
        if (keep.length >= targetCount) break;
        pushUnique(candidate);
      }
      map.set(r.role, keep);
    }
    return map;
  }, [currentYear, needCandidatePools, rolesWithLiveSalaries, staffMarket, state.players, state.staff?.coaches, state.staffFreeAgents, userLeagueId, tycoonTier]);
  const renderPortrait = (face: any, initials: string, size = 'w-16 h-20', staffImageId?: number, name?: string, portraitUrl?: string) => {
    const staffImg = resolveStaffPortrait({ name, savedPortrait: portraitUrl, staffImageId });
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
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <FacilityKpi icon={<Users size={22} />} label="Total Staff" value={`${filledRoles}/${roles.length}`} sub={`${roles.length - filledRoles} open roles`} />
        <FacilityKpi icon={<Briefcase size={22} />} label="Annual Cost" value={formatCurrencyWithCode(totalCost, currency, false)} sub="Current yearly payroll" />
        <FacilityKpi icon={<Star size={22} />} label="Average Skill" value={`${avgSkill}/100`} sub={avgSkill >= 80 ? 'Elite staff group' : 'Solid staff group'} />
        <FacilityKpi
          icon={<Search size={22} />}
          label="Roles Due"
          value={String(dueRoleCount)}
          sub={dueRoleCount === 0
            ? 'No interviews or renewals needed'
            : `${openRoleCount} open · ${expiringRoleCount} renewals due`}
        />
      </div>
      <div className="grid xl:grid-cols-[1fr_390px] gap-6">
        <div className="space-y-6">
          {['Coaching', 'Performance', 'Scouting & Analytics'].map((group) => (
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
                        onClick={() => { setSelectedRole(item.role); setSigningMode('hire'); setSigningOpen(true); }}
                        title={tooltip}
                        className="text-left rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 transition-all hover:border-amber-400/50 hover:bg-amber-400/5 flex flex-col items-center justify-center text-center min-h-[280px]"
                      >
                        <div className="w-14 h-14 rounded-full border border-dashed border-slate-600 flex items-center justify-center text-2xl font-black text-slate-500">+</div>
                        <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-amber-300">{item.role}</div>
                        <div className="mt-1 text-sm font-black text-slate-300">Open Position</div>
                        <div className="mt-5 inline-flex items-center justify-center rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 h-9 text-[11px] font-black uppercase tracking-widest text-amber-200">{ctaLabel}</div>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={item.role}
                      onClick={() => setActionPerson({ role: item.role, person: item.person, years: item.years, salary: item.salary })}
                      title={tooltip}
                      className="text-left rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-all hover:border-slate-600"
                    >
                      <div className="flex items-start gap-3">
                        {renderPortrait(face, initials, 'w-16 h-20', item.person?.staffImageId, item.person?.name, item.person?.playerPortraitUrl)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-black text-white truncate">{item.person?.name}</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">{item.role}</div>
                              {Number(item.years) <= 0 && (
                                <div className="mt-1 inline-flex rounded border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-300">
                                  Renewal Due
                                </div>
                              )}
                            </div>
                            <div className="w-11 h-11 rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 flex items-center justify-center text-sm font-black">
                              {rating}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{item.person?.nationality}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className={Number(item.years) <= 0 ? 'text-rose-300' : 'text-slate-500'}>{formatYearsLeftLabel(item.years)}</span>
                        <span className="text-slate-400">{formatCurrencyWithCode(item.salary, currency, false)}/yr</span>
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
                : getStaffImageUrl(gm.staffImageId) ?? getStaffImageUrl(deterministicStaffImageId(gm.name)) ?? null;
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
                      {!isGMOwnTeam && gm.nationality && <div className="text-xs text-slate-400 mt-0.5">{getCountryFlag(gm.nationality)} {gm.nationality}</div>}
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
              const realOwnerPhoto = op.playerPortraitUrl
                ?? (OWNER_IMAGES as Record<string, string>)[op.name ?? '']
                ?? null;
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
                      {op.nationality && <div className="text-xs text-slate-400 mt-0.5">{getCountryFlag(op.nationality)} {op.nationality}</div>}
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
      {signingOpen && (
        <StaffSigningModal
          selectedRole={selectedRole}
          pool={resignPool ?? (candidatePool.get(selectedRole) ?? [])}
          roleFocus={rolesWithLiveSalaries.find((r) => r.role === selectedRole)?.focus ?? ''}
          currency={currency}
          market={staffMarket}
          mode={signingMode}
          // NBA tids (0-99) → American-only emergency pool. Spaniards/Frenchmen as
          // "limited options" candidates for a Mavs GM was the bug.
          emergencyCountries={(() => {
            const tid = team.id ?? team.tid;
            if (tid >= 0 && tid < 100) return ['American'];
            if (tid >= 1000 && tid < 1100) return ['Spain', 'France', 'Italy', 'Serbia', 'Greece', 'Turkey'];
            if (tid >= 2000 && tid < 2100) return ['Philippines'];
            return undefined;
          })()}
          onClose={() => { setSigningOpen(false); setResignPool(null); setSigningMode('hire'); }}
          renderPortrait={renderPortrait}
          onSign={(payload) => {
            onHireStaff(payload);
            setSigningOpen(false);
            setResignPool(null);
            setSigningMode('hire');
          }}
        />
      )}

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
        const staffPersonnel: Personnel = {
          id: person?.id ?? `staff-${role}`,
          name: person?.name ?? '',
          type: 'coach',
          jobTitle: role,
          team: teamName,
          playerPortraitUrl: resolveStaffPortrait({
            name: person?.name,
            savedPortrait: person?.playerPortraitUrl,
            staffImageId: person?.staffImageId,
          }),
        };
        const filterActions: PersonnelActionType[] = [
          ...(isExpiring ? ['resign_staff' as PersonnelActionType] : []),
          'view_ratings',
          'view_candidates',
          ...(isAC && hcVacant ? ['promote_to_hc' as PersonnelActionType] : []),
          ...(!isExpiring ? ['fire' as PersonnelActionType] : []),
          // 'contact', // Direct Message — wire later
        ];
        return (
          <PersonnelActionsModal
            person={staffPersonnel}
            isOpen={true}
            onClose={() => setActionPerson(null)}
            filterActions={filterActions}
            onActionSelect={(action) => {
              if (action === 'fire') {
                setFireConfirm({ role, name: person?.name ?? role });
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
                  },
                );
                const resignCandidate = {
                  id: member?.id ?? `resign-${role}`,
                  role,
                  name: person?.name ?? '',
                  nationality: person?.nationality ?? '',
                  flag: getCountryFlag(person?.nationality),
                  salary: baseSalary,
                  rating,
                  years: 2,
                  face: person?.face,
                  staffImageId: person?.staffImageId,
                  playerPortraitUrl: resolveStaffPortrait({
                    name: person?.name,
                    savedPortrait: person?.playerPortraitUrl,
                    staffImageId: person?.staffImageId,
                  }),
                  attributes: buildAttributes(baseRole, seedForStaff(member ?? person), person?.name, {
                    attributeProfile: (member ?? person)?.attributeProfile,
                  }),
                };
                const replacementPool = candidatePool.get(role) ?? [];
                const mergedPool = [resignCandidate, ...replacementPool.filter(candidate =>
                  candidate.name !== resignCandidate.name && candidate.id !== resignCandidate.id
                )];
                setResignPool(mergedPool);
                setSelectedRole(role);
                setSigningMode('extension');
                setActionPerson(null);
                setSigningOpen(true);
              }
              else if (action === 'view_ratings') {
                setRatingsTab('attributes');
                setRatingsPerson({ role, person, years, salary });
                setActionPerson(null);
              }
              else if (action === 'view_candidates') {
                setSelectedRole(role);
                setResignPool(null);
                setSigningMode('hire');
                setActionPerson(null);
                setSigningOpen(true);
              }
              else { setActionPerson(null); }
            }}
          />
        );
      })()}

      {/* Staff Ratings detail modal — shows ALL 15 StaffAttributes grouped by
          category. Single source of truth via buildStaffAttrs + STAFF_ATTRIBUTE_GROUPS. */}
      <AnimatePresence>
        {ratingsPerson && (() => {
          const { role, person, years, salary } = ratingsPerson;
          const seed = seedForStaff(person);
          // Curated gist entry first (Kerr 99 OFF, Rivers 58 TACT, …), local
          // seed fallback for fictional/Euro/unknown names. Always re-derive
          // the overall from these attrs so the header number matches the bars.
          const attrs = attrsForCoach(person?.name, seed, {
            role,
            attributeProfile: person?.attributeProfile,
            attributeOverrides: person?.attributeOverrides,
          });
          const rating = resolveStaffRating(role, person);
          const initials = person?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '?';
          const face = getStaffFace(person);
          const baseRole = role.replace(/ \d+$/, '');
          const careerMeta = getNBA2KCoach(person?.name ?? '');
          const rawCoaching = Array.from(new Set([
            ...parseCareerLinesForYear(careerMeta?.career_history ?? careerMeta?.coaching_career),
            ...parseCareerLinesForYear(person?.career_history ?? person?.coaching_career),
          ]));
          const rawPlaying = parseCareerLinesForYear(careerMeta?.playing_career);
          const coachingHistory: string[] = [];
          const playingFromCoaching: string[] = [];
          let inPlayerSection = false;
          for (const raw of rawCoaching) {
            const line = raw.trim();
            if (!line) continue;
            const startsAsPlayer = /^\s*as player[:\s]/i.test(line);
            if (startsAsPlayer) inPlayerSection = true;
            const cleaned = line.replace(/^\s*as player[:\s]*/i, '').trim();
            const isCoachRow = /\(([^)]+)\)\s*$/.test(cleaned) || /coach/i.test(cleaned);
            if (isCoachRow) {
              coachingHistory.push(cleaned);
              inPlayerSection = false;
            } else if (inPlayerSection) {
              playingFromCoaching.push(cleaned);
            }
          }
          const normalizeName = (value: string | undefined) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const matchedPlayer = (state.players ?? []).find((p: any) => normalizeName(p?.name) === normalizeName(person?.name));
          const playingCareerRows = [...rawPlaying, ...playingFromCoaching]
            .map(splitPlayingRow)
            .filter(row => row.team && row.team !== '—');
          const playerAwards: Array<{ type?: string; season?: number }> = matchedPlayer?.awards ?? [];
          const countAwards = (...types: string[]) => playerAwards.filter(a => types.includes(String(a.type ?? ''))).length;
          const countAwardsContains = (...tokens: string[]) =>
            playerAwards.filter(a => tokens.some(token => String(a.type ?? '').includes(token))).length;
          const awardsSummary = [
            { label: 'NBA Champion', value: countAwards('Won Championship', 'Champion', 'NBA Champion') },
            { label: 'MVP', value: countAwards('Most Valuable Player', 'MVP') },
            { label: 'Finals MVP', value: countAwards('Finals MVP') },
            { label: 'All-Star', value: countAwards('All-Star') },
            { label: 'All-NBA', value: countAwardsContains('All-NBA', 'All-League') },
            { label: 'DPOY', value: countAwards('Defensive Player of the Year', 'DPOY') },
          ].filter(item => item.value > 0);
          const retirementSeason = (() => {
            const explicit = Number((matchedPlayer as any)?.retiredYear);
            if (Number.isFinite(explicit) && explicit > 0) return explicit;
            const seasons = (matchedPlayer?.stats ?? []).map((s: any) => Number(s?.season)).filter((s: number) => Number.isFinite(s) && s > 0);
            if (seasons.length === 0) return null;
            return Math.max(...seasons);
          })();

          // ── Profile derivation ─────────────────────────────────────────
          // Tycoon staffMembers don't persist bornYear/careerStart, so we
          // derive deterministically from the same seed that drives attrs.
          // Real fields (person.born.year, person.bornYear, yearsWithTeam,
          // hiredYear) win when present.
          const career = getStaffCareerSnapshot(person, currentYear);
          const bornYear = career.bornYear ?? (currentYear - (32 + (seed % 30)));
          const age = Math.max(24, career.age ?? (currentYear - bornYear));
          const tenure = Math.max(0, career.yearsWithTeam);
          const experience = Math.max(tenure, career.yearsExperience);
          const expTier = experience >= 20 ? 'Veteran'
            : experience >= 12 ? 'Established'
            : experience >= 6 ? 'Experienced'
            : 'Rising';
          const expTone = experience >= 20 ? 'border-violet-400/40 bg-violet-400/10 text-violet-300'
            : experience >= 12 ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : experience >= 6 ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
            : 'border-sky-400/40 bg-sky-400/10 text-sky-300';
          const hiredYearDisplay = career.hiredYear ?? (tenure > 0 ? currentYear - tenure : currentYear);
          const contractEndYear = currentYear + years;
          const status = years <= 0 ? 'Renewal Due' : 'Locked In';
          const statusTone = years <= 0 ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
            : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300';
          return (
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setRatingsPerson(null)} />
              <motion.div
                className="relative z-10 w-full md:min-w-[860px] max-w-5xl max-h-[88vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl"
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              >
                <header className="flex items-start justify-between gap-4 p-6 border-b border-slate-800">
                  <div className="flex items-start gap-4">
                    {renderPortrait(face, initials, 'w-20 h-24', person?.staffImageId, person?.name, person?.playerPortraitUrl)}
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">{baseRole}</div>
                      <h2 className="text-2xl font-black text-white leading-tight mt-1">{person?.name}</h2>
                      {person?.nationality && (
                        <div className="text-sm text-slate-400 mt-1">{getCountryFlag(person.nationality)} {normalizeNationality(person.nationality)}</div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-1">
                          <Star size={14} className="text-violet-300" />
                          <span className="text-sm font-black text-violet-200">Overall {rating}</span>
                        </div>
                        <div className={`inline-flex items-center rounded-lg border px-3 py-1 ${expTone}`}>
                          <span className="text-xs font-black uppercase tracking-widest">{expTier}</span>
                        </div>
                        <div className={`inline-flex items-center rounded-lg border px-3 py-1 ${statusTone}`}>
                          <span className="text-xs font-black uppercase tracking-widest">{status}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setRatingsPerson(null)} className="text-slate-400 hover:text-white p-1">
                    <X size={20} />
                  </button>
                </header>
                <div className="p-6 space-y-5">
                  <section>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Profile</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Age', value: `${age}`, sub: `Born ${bornYear}` },
                        { label: 'Experience', value: `${experience} yrs`, sub: expTier },
                        { label: 'Tenure', value: `${tenure} yr${tenure === 1 ? '' : 's'}`, sub: `Since ${hiredYearDisplay}` },
                        { label: 'Contract Left', value: `${years} yr${years === 1 ? '' : 's'}`, sub: `Through ${contractEndYear}` },
                        { label: 'Annual Salary', value: formatCurrencyWithCode(salary, currency, false), sub: 'Per year' },
                        // Fall back to the nba2k coach record's nationality — it
                        // carries country data even when the saved staff entry
                        // doesn't (CoachingView reads the same field).
                        { label: 'Nationality', value: person?.nationality ?? getNBA2KCoach(person?.name ?? '')?.nationality ?? 'Unknown', sub: getCountryFlag(person?.nationality ?? getNBA2KCoach(person?.name ?? '')?.nationality) },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{stat.label}</div>
                          <div className="text-base font-black text-white mt-1 truncate">{stat.value}</div>
                          {stat.sub && <div className="text-[10px] text-slate-500 mt-0.5 truncate">{stat.sub}</div>}
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      onClick={() => setRatingsTab('attributes')}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest ${ratingsTab === 'attributes' ? 'border-amber-400/60 bg-amber-400/15 text-amber-300' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}
                    >
                      Attributes
                    </button>
                    <button
                      onClick={() => setRatingsTab('career')}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest ${ratingsTab === 'career' ? 'border-amber-400/60 bg-amber-400/15 text-amber-300' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}
                    >
                      Career
                    </button>
                  </div>
                  {ratingsTab === 'attributes' ? STAFF_ATTRIBUTE_GROUPS.map((group) => (
                    <section key={group.label}>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">{group.label}</div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {group.keys.map(([key, label]) => {
                          const value = attrs[key];
                          const tone = value >= 85 ? 'bg-emerald-400 text-emerald-300'
                            : value >= 75 ? 'bg-violet-400 text-violet-300'
                            : value >= 65 ? 'bg-amber-400 text-amber-300'
                            : 'bg-slate-500 text-slate-400';
                          const [barBg, textColor] = tone.split(' ');
                          return (
                            <div key={key}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400" title={getStaffAttributeTooltip(key)}>{label}</span>
                                <span className={`font-black ${textColor}`}>{value}</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                                <div className={`h-full ${barBg}`} style={{ width: `${value}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )) : (
                    <div className="grid gap-4 md:grid-cols-3">
                      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Coaching History</div>
                        {coachingHistory.length > 0 ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-[86px_minmax(0,1fr)_96px] gap-2 border-b border-slate-800 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              <span>Years</span><span>Team</span><span>Role</span>
                            </div>
                            {coachingHistory.map((row, index) => {
                              const parsed = splitCoachingRow(row);
                              const displayTeam = parsed.team && parsed.team !== '—' ? parsed.team : (person?.team ?? '—');
                              const logo = resolveHistoryLogo(displayTeam);
                              return (
                                <div key={`${row}-${index}`} className="grid grid-cols-[86px_minmax(0,1fr)_96px] gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-xs">
                                  <div className="text-slate-400">{parsed.years}</div>
                                  <div className="flex items-center gap-2 min-w-0 text-slate-200">
                                    {logo ? <img src={logo} alt="" className="h-4 w-4 object-contain" /> : null}
                                    <span className="truncate">{displayTeam}</span>
                                  </div>
                                  <div className="text-slate-300 truncate">{parsed.role}</div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">No coaching-history rows available.</div>
                        )}
                      </section>
                      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Playing Career</div>
                        {playingCareerRows.length > 0 ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-[86px_minmax(0,1fr)_70px] gap-2 border-b border-slate-800 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              <span>Years</span><span>Team</span><span>Pos</span>
                            </div>
                            {playingCareerRows.map((parsed, index) => {
                              const logo = resolveHistoryLogo(parsed.team);
                              return (
                                <div key={`${parsed.years}-${parsed.team}-${index}`} className="grid grid-cols-[86px_minmax(0,1fr)_70px] gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-xs">
                                  <div className="text-slate-400">{parsed.years}</div>
                                  <div className="flex items-center gap-2 min-w-0 text-slate-200">
                                    {logo ? <img src={logo} alt="" className="h-4 w-4 object-contain" /> : null}
                                    <span className="truncate">{parsed.team}</span>
                                  </div>
                                  <div className="text-slate-300 truncate">{parsed.position}</div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">No playing-career rows available.</div>
                        )}
                      </section>
                      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Awards & Retirement</div>
                        {awardsSummary.length > 0 ? (
                          <ul className="space-y-1.5 text-xs text-slate-300">
                            {awardsSummary.map(item => <li key={item.label}>• {item.label}: {item.value}</li>)}
                          </ul>
                        ) : (
                          <div className="text-xs text-slate-500">No awards summary available.</div>
                        )}
                        <div className="mt-3 border-t border-slate-800 pt-2 text-xs">
                          <div className="text-slate-500">Retirement</div>
                          <div className="text-slate-300">{retirementSeason ? `Retired in ${retirementSeason}` : 'No retirement-season record'}</div>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
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
                <div className="mt-2 text-sm text-slate-400">This will remove them from the {fireConfirm.role} role.</div>
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
                    onFireStaff(fireConfirm.role);
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
    </div>
  );
};
