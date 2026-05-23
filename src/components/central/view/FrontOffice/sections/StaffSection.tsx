import React, { useMemo, useState } from 'react';
import { Briefcase, Search, Star, Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getCountryFlag } from '../../../../../utils/countryFlags';
import { getTeamFullName } from '../../../../../utils/teamNames';
import { makePlaceholderCoach, makePlaceholderGM } from '../../../../../services/staff/staffFallback';
import { MyFace, isRealFaceConfig } from '../../../../shared/MyFace';
import { getStaffImageUrl, deterministicStaffImageId, resolveStaffImageId } from '../../../../../utils/staffPortrait';
import { inferEuroStaffLeagueId } from '../../../../../services/euro/staffPool';
import { getNBA2KCoach, getTeamStaff, getCoachContractSnapshot, getStaffCareerSnapshot, OWNER_IMAGES } from '../../../../../services/staffService';
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
  computeStaffOverall,
  attrsForCoach,
  ROLE_DISPLAY_KEYS,
  STAFF_ATTRIBUTE_GROUPS,
} from '../../../../../services/staff/displayAttributes';
import { getStaffGameplayTooltip } from '../../../../../services/staff/staffGameplayEffects';

export const StaffSection: React.FC<{
  state: any;
  team: any;
  onHireStaff: (hire: any) => void;
  onFireStaff: (role: string) => void;
  onPromoteStaff: (person: any, fromRole: string, toRole: string) => void;
}> = ({ state, team, onHireStaff, onFireStaff, onPromoteStaff }) => {
  const formatYearsLeftLabel = (years: number) => `${years} ${years === 1 ? 'Year' : 'Years'} Left`;
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingMode, setSigningMode] = useState<'hire' | 'extension'>('hire');
  const [selectedRole, setSelectedRole] = useState('Head Coach');
  const [actionPerson, setActionPerson] = useState<{ role: string; person: any; years: number; salary: number } | null>(null);
  const [ratingsPerson, setRatingsPerson] = useState<{ role: string; person: any; years: number; salary: number } | null>(null);
  const [resignPool, setResignPool] = useState<any[] | null>(null);
  const staffPhotoVersion = useStaffPhotoStore(s => s.version);
  void staffPhotoVersion;
  React.useEffect(() => {
    ensureStaffPhotoData();
  }, []);
  const firedRoles: string[] = (team.tycoon?.firedStaffRoles ?? []);
  const tycoonTier = team.tycoon?.tier;
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();
  const currency: string = state.leagueStats?.currency ?? 'EUR';
  const tid = team.id ?? team.tid;
  const staffMarket: StaffMarket = tid >= 0 && tid < 100 ? 'nba' : 'euro';
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
      nationality: c.nationality ?? 'USA',
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
    const persisted = persistentStaff.get(item.role);
    const salary = item.person
      ? normalizeStaffSalary(
        tycoonTier,
        item.role,
        persisted?.salary ?? item.person?.salary ?? item.salary,
        persisted?.rating ?? item.person?.rating,
        { market: staffMarket, ...getSalaryContext(item.person, persisted) },
      )
      : item.salary;
    return { ...item, salary };
  });
  const filledRoles = rolesWithLiveSalaries.filter((r) => r.person).length;
  const openRoleCount = rolesWithLiveSalaries.filter((r) => !r.person).length;
  const expiringRoleCount = rolesWithLiveSalaries.filter((r) => r.person && Number(r.years) <= 0).length;
  const dueRoleCount = openRoleCount + expiringRoleCount;
  const totalCost = rolesWithLiveSalaries.reduce((sum, r) => sum + (r.person ? r.salary : 0), 0);
  const avgSkill = Math.round(rolesWithLiveSalaries.reduce((sum, r) => sum + (r.person ? staffOverallFor(r.role, r.person) : 58), 0) / rolesWithLiveSalaries.length);
  // Single source of truth for FA candidates: read from state.staffFreeAgents,
  // filter by user's league (so a Manresa GM never sees Euroleague-only FAs)
  // and target position. The pool is guaranteed depth=10 per position via
  // ensureStaffPoolDepth, so no on-the-fly emergency generation here.
  const userLeagueId = inferEuroStaffLeagueId(team.tid ?? team.id ?? 0);
  const candidatePool = useMemo(() => {
    const map = new Map<string, StaffCandidate[]>();
    for (const r of rolesWithLiveSalaries) {
      // Assistant Coach 2/3 are slot variants — they share the 'Assistant Coach'
      // pool. The base role name is what the FA pool tracks.
      const poolRole = r.role.replace(/ \d+$/, '');
      const generated = (state.staffFreeAgents ?? [])
        .filter((member: any) => {
          if ((member.position ?? member.jobTitle) !== poolRole) return false;
          // Tolerate legacy save members without leagueId (pre-pool-refactor).
          if (member.leagueId && member.leagueId !== userLeagueId) return false;
          if (userLeagueId === 'nba') {
            const nationality = String(member.nationality ?? '').toLowerCase();
            return !nationality || nationality === 'usa' || nationality === 'united states';
          }
          return true;
        })
        .map((member: any, index: number): StaffCandidate => {
          // Seed comes from the FA's stored identity (name + reputation), so
          // the attributes the modal shows here are the SAME attributes that
          // the card and ratings-modal will render after hire.
          const seed = seedForStaff(member);
          const attrsFull = buildStaffAttrs(seed);
          const rating = computeStaffOverall(r.role, attrsFull);
          const career = getStaffCareerSnapshot(member, currentYear);
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
            nationality: member.nationality ?? 'Unknown',
            flag: getCountryFlag(member.nationality),
            salary: baseSalary,
            rating,
            years: Math.max(1, career.yearsExperience),
            face: member.face,
            staffImageId: resolveStaffImageId(member),
            playerPortraitUrl: member.playerPortraitUrl,
            attributes: buildAttributes(r.role, seed),
          };
        })
        .sort((a: StaffCandidate, b: StaffCandidate) => b.rating - a.rating)
        .slice(0, 12);
      map.set(r.role, generated);
    }
    return map;
  }, [currentYear, staffMarket, state.staffFreeAgents, userLeagueId, teamName, tycoonTier]);
  const renderPortrait = (face: any, initials: string, size = 'w-16 h-20', staffImageId?: number, name?: string, portraitUrl?: string) => {
    const staffImg = resolveStaffPortrait({ name, savedPortrait: portraitUrl, staffImageId });
    return (
      <div className={`${size} rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0 relative`}>
        {staffImg ? (
          <img src={staffImg} alt="" className="w-full h-full object-cover" loading="lazy" />
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
                  const personAttrs = item.person ? attrsForCoach(item.person.name, personSeed) : null;
                  const baseRole = item.role.replace(/ \d+$/, '');
                  const displayKeys = ROLE_DISPLAY_KEYS[baseRole] ?? ROLE_DISPLAY_KEYS['Head Coach'];
                  const attrs: Array<[string, number]> = personAttrs
                    ? displayKeys.map(([k, label]) => [label, personAttrs[k]])
                    : buildAttributes(item.role, personSeed);
                  const initials = item.person?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '+';
                  const rating = personAttrs ? computeStaffOverall(item.role, personAttrs) : 0;
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
                        <div className="mt-3 text-xs text-slate-500 leading-5 max-w-[220px]">{item.focus}</div>
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
                            </div>
                            <div className="w-11 h-11 rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 flex items-center justify-center text-sm font-black">
                              {rating}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{item.person?.nationality}</div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 mt-3 leading-5" title={tooltip}>{item.focus}</div>
                      <div className="mt-4 space-y-2">
                        {attrs.map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[96px_1fr_28px] gap-2 items-center">
                            <span className="text-[10px] text-slate-500 truncate">{label}</span>
                            <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><span className="block h-full bg-amber-300" style={{ width: `${value}%` }} /></span>
                            <span className="text-[10px] font-black text-slate-400 tabular-nums">{value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{formatYearsLeftLabel(item.years)}</span>
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
          // NBA tids (0-99) → USA-only emergency pool. Spaniards/Frenchmen as
          // "limited options" candidates for a Mavs GM was the bug.
          emergencyCountries={(() => {
            const tid = team.id ?? team.tid;
            if (tid >= 0 && tid < 100) return ['USA'];
            if (tid >= 1000 && tid < 1100) return ['Spain', 'France', 'Italy', 'Serbia', 'Greece', 'Turkey'];
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
          'fire',
          // 'contact', // Direct Message — wire later
        ];
        return (
          <PersonnelActionsModal
            person={staffPersonnel}
            isOpen={true}
            onClose={() => setActionPerson(null)}
            filterActions={filterActions}
            onActionSelect={(action) => {
              if (action === 'fire') { onFireStaff(role); setActionPerson(null); }
              else if (action === 'promote_to_hc') { onPromoteStaff(person, role, 'Head Coach'); setActionPerson(null); }
              else if (action === 'resign_staff') {
                const baseRole = role.replace(/ \d+$/, '');
                const career = getStaffCareerSnapshot(member ?? person, currentYear);
                const rating = Math.min(95, (member?.rating ?? 72) + 1);
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
                  attributes: buildAttributes(baseRole, rating + 3),
                };
                setResignPool([resignCandidate]);
                setSelectedRole(role);
                setSigningMode('extension');
                setActionPerson(null);
                setSigningOpen(true);
              }
              else if (action === 'view_ratings') {
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
          const attrs = attrsForCoach(person?.name, seed);
          const rating = computeStaffOverall(role, attrs);
          const initials = person?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '?';
          const face = getStaffFace(person);
          const baseRole = role.replace(/ \d+$/, '');

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
                className="relative z-10 w-full max-w-2xl max-h-[88vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl"
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
                        <div className="text-sm text-slate-400 mt-1">{getCountryFlag(person.nationality)} {person.nationality}</div>
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
                  {STAFF_ATTRIBUTE_GROUPS.map((group) => (
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
                                <span className="text-slate-400">{label}</span>
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
                  ))}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
