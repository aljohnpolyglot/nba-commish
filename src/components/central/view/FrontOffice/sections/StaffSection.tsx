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
import { getCoachPhoto, getNBA2KCoach, getTeamStaff, getCoachContract, OWNER_IMAGES } from '../../../../../services/staffService';
import { StaffSigningModal, type StaffCandidate } from '../StaffSigning/StaffSigningModal';
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

export const StaffSection: React.FC<{
  state: any;
  team: any;
  onHireStaff: (hire: any) => void;
  onFireStaff: (role: string) => void;
  onPromoteStaff: (person: any, fromRole: string, toRole: string) => void;
}> = ({ state, team, onHireStaff, onFireStaff, onPromoteStaff }) => {
  const [signingOpen, setSigningOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Head Coach');
  const [actionPerson, setActionPerson] = useState<{ role: string; person: any; years: number; salary: number } | null>(null);
  const [ratingsPerson, setRatingsPerson] = useState<{ role: string; person: any; years: number; salary: number } | null>(null);
  const [resignPool, setResignPool] = useState<any[] | null>(null);
  const firedRoles: string[] = (team.tycoon?.firedStaffRoles ?? []);
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();
  const currency: string = state.leagueStats?.currency ?? 'EUR';
  const teamName = getTeamFullName(team);
  const isGMOwnTeam = state.gameMode === 'gm' && (team.id ?? team.tid) === state.userTeamId;
  const commName: string | undefined = state.commissionerName;
  // Mirror CoachingView's exact photo resolution chain so the real Erik
  // Spoelstra / Ime Udoka / etc. shots show up here too. Order matters:
  // gist photo > saved portrait > nba2k fan-wiki > deterministic Staff{N}.
  const resolveCoachPhoto = (name?: string, savedPortrait?: string): string | undefined =>
    getCoachPhoto(name ?? '') ?? savedPortrait ?? getNBA2KCoach(name ?? '')?.image ?? undefined;
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
  const realCoachToPerson = (c: any) => ({
    name: c.name,
    nationality: c.nationality ?? 'USA',
    position: c.position,
    playerPortraitUrl: resolveCoachPhoto(c.name, undefined),
    staffImageId: deterministicStaffImageId(c.name),
    isPlaceholder: false,
    isRealAutoFill: true,        // flag for downstream UI hints
    // Auto-filled ACs sit on a one-year handshake that expires at the next
    // rollover — so the user sees "1 Years Left" on the card and can re-sign
    // them in the offseason instead of staring at a 0-year ghost contract.
    contractYears: 1,
    hiredYear: currentYear - 1,
  });
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
    { role: 'Head Coach', person: resolvePerson('Head Coach', coach), group: 'Coaching', focus: 'Tactics, rotations, game-day decisions', salary: 1_850_000, years: (() => {
      const persisted = persistentStaff.get('Head Coach')?.contractYears;
      if (persisted) return persisted;
      // Real contract length from nbacoachescontract gist when available.
      const contract = coach?.name ? getCoachContract(coach.name) : undefined;
      if (contract && contract.history.length) {
        const remaining = Math.max(1, contract.history[0].end_year - currentYear + 1);
        return remaining;
      }
      return coach.yearsWithTeam ? Math.max(1, 4 - Math.min(3, coach.yearsWithTeam)) : 2;
    })() },
    // Resolve each AC slot exactly ONCE so the auto-fill cursor doesn't get
    // double-advanced and lose a real coach to a phantom second read.
    ...(() => {
      const ac1 = resolvePerson('Assistant Coach', null);
      const ac2 = resolvePerson('Assistant Coach 2', null);
      const ac3 = resolvePerson('Assistant Coach 3', null);
      return [
        { role: 'Assistant Coach',   person: ac1, group: 'Coaching', focus: 'Training sessions and opponent prep', salary: 620_000, years: persistentStaff.get('Assistant Coach')?.contractYears   ?? (ac1 as any)?.contractYears ?? 0 },
        { role: 'Assistant Coach 2', person: ac2, group: 'Coaching', focus: 'Training sessions and opponent prep', salary: 580_000, years: persistentStaff.get('Assistant Coach 2')?.contractYears ?? (ac2 as any)?.contractYears ?? 0 },
        { role: 'Assistant Coach 3', person: ac3, group: 'Coaching', focus: 'Training sessions and opponent prep', salary: 550_000, years: persistentStaff.get('Assistant Coach 3')?.contractYears ?? (ac3 as any)?.contractYears ?? 0 },
      ];
    })(),
    { role: 'Head of Sports Science', person: resolvePerson('Head of Sports Science', null), group: 'Performance', focus: 'Injury prevention and workload monitoring', salary: 540_000, years: persistentStaff.get('Head of Sports Science')?.contractYears ?? 0 },
    { role: 'Head Physio', person: resolvePerson('Head Physio', null), group: 'Performance', focus: 'Recovery speed and day-to-day availability', salary: 460_000, years: persistentStaff.get('Head Physio')?.contractYears ?? 0 },
    // Player Development Coach — drives off-floor skill growth. Will wire to
    // the player progression engine: their development + motivating attrs
    // multiply per-player progression deltas during the season.
    { role: 'Player Development Coach', person: resolvePerson('Player Development Coach', null), group: 'Performance', focus: 'Individual workouts and off-season skill growth', salary: 480_000, years: persistentStaff.get('Player Development Coach')?.contractYears ?? 0 },
    { role: 'Chief Scout', person: resolvePerson('Chief Scout', gm), group: 'Scouting & Analytics', focus: 'Player evaluation and market intelligence', salary: 720_000, years: persistentStaff.get('Chief Scout')?.contractYears ?? 2 },
    { role: 'Head of Analytics', person: resolvePerson('Head of Analytics', null), group: 'Scouting & Analytics', focus: 'Shot profile, lineup data, and opponent models', salary: 510_000, years: persistentStaff.get('Head of Analytics')?.contractYears ?? 0 },
  ];
  const filledRoles = roles.filter((r) => r.person).length;
  const totalCost = roles.reduce((sum, r) => sum + (r.person ? r.salary : 0), 0);
  const avgSkill = Math.round(roles.reduce((sum, r) => sum + (r.person ? staffOverallFor(r.role, r.person) : 58), 0) / roles.length);
  // Single source of truth for FA candidates: read from state.staffFreeAgents,
  // filter by user's league (so a Manresa GM never sees Euroleague-only FAs)
  // and target position. The pool is guaranteed depth=10 per position via
  // ensureStaffPoolDepth, so no on-the-fly emergency generation here.
  const userLeagueId = inferEuroStaffLeagueId(team.tid ?? team.id ?? 0);
  const candidatePool = useMemo(() => {
    const map = new Map<string, StaffCandidate[]>();
    for (const r of roles) {
      const roleIdx = roles.findIndex((roleDef) => roleDef.role === r.role);
      // Assistant Coach 2/3 are slot variants — they share the 'Assistant Coach'
      // pool. The base role name is what the FA pool tracks.
      const poolRole = r.role.replace(/ \d+$/, '');
      const generated = (state.staffFreeAgents ?? [])
        .filter((member: any) => {
          if ((member.position ?? member.jobTitle) !== poolRole) return false;
          // Tolerate legacy save members without leagueId (pre-pool-refactor).
          return !member.leagueId || member.leagueId === userLeagueId;
        })
        .map((member: any, index: number): StaffCandidate => {
          // Seed comes from the FA's stored identity (name + reputation), so
          // the attributes the modal shows here are the SAME attributes that
          // the card and ratings-modal will render after hire.
          const seed = seedForStaff(member);
          const attrsFull = buildStaffAttrs(seed);
          const rating = computeStaffOverall(r.role, attrsFull);
          const baseSalary = roles[Math.max(0, roleIdx)].salary;
          const salaryMult = 0.55 + (rating - 60) / 60;
          return {
            id: member.id ?? `staff-fa-${r.role}-${member.name}-${index}`,
            role: r.role,
            name: member.name,
            nationality: member.nationality ?? 'Unknown',
            flag: getCountryFlag(member.nationality),
            salary: Math.round((baseSalary * salaryMult) / 10_000) * 10_000,
            rating,
            years: Math.max(1, (member.yearsWithTeam ?? 1) + 2),
            face: member.face,
            staffImageId: resolveStaffImageId(member),
            attributes: buildAttributes(r.role, seed),
          };
        })
        .sort((a: StaffCandidate, b: StaffCandidate) => b.rating - a.rating)
        .slice(0, 12);
      map.set(r.role, generated);
    }
    return map;
  }, [state.staffFreeAgents, userLeagueId, teamName]);
  const renderPortrait = (face: any, initials: string, size = 'w-16 h-20', staffImageId?: number, name?: string, portraitUrl?: string) => {
    // Real photo (from nba2kcoachlist / state.staff.coaches) always wins over
    // the random Staff{N}.png fallback. Without this Ime Udoka rendered as a
    // bald stranger because the deterministic placeholder beat his real shot.
    const resolvedId = staffImageId ?? (name ? deterministicStaffImageId(name) : undefined);
    const staffImg = portraitUrl ?? getStaffImageUrl(resolvedId) ?? null;
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
        <FacilityKpi icon={<Briefcase size={22} />} label="Annual Cost" value={formatCurrencyWithCode(totalCost, currency, false)} sub="Committed staff payroll" />
        <FacilityKpi icon={<Star size={22} />} label="Average Skill" value={`${avgSkill}/100`} sub={avgSkill >= 80 ? 'Elite group' : 'Competitive group'} />
        <FacilityKpi icon={<Search size={22} />} label="Open Roles" value={String(roles.length - filledRoles)} sub="Hiring market available" />
      </div>
      <div className="grid xl:grid-cols-[1fr_390px] gap-6">
        <div className="space-y-6">
          {['Coaching', 'Performance', 'Scouting & Analytics'].map((group) => (
            <section key={group} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{group}</div>
              <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
                {roles.filter((item) => item.group === group).map((item) => {
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
                  if (open) {
                    const ctaLabel = item.role.includes('Coach') ? 'Hire Coach'
                      : item.role.includes('Scout') ? 'Hire Scout'
                      : item.role.includes('Analyt') ? 'Hire Analyst'
                      : 'Hire Staff';
                    return (
                      <button
                        key={item.role}
                        onClick={() => { setSelectedRole(item.role); setSigningOpen(true); }}
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
                      <div className="text-xs text-slate-400 mt-3 leading-5">{item.focus}</div>
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
                        <span className="text-slate-500">{item.years} Years Left</span>
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
              // Owner display priority:
              //   1. real saved photo URL
              //   2. curated OWNER_IMAGES map (Ressler/Ballmer/etc.)
              //   3. generated facesjs facepack (Euro owners get one in seedOwner)
              //   4. owner's own staffImageId → Staff{N}.png
              //   5. deterministic Staff{N}.png from name hash
              // Face beats the indexed Staff sprite because those PNGs render
              // as logo-shaped blobs in the small 14×16 owner frame.
              const realOwnerPhoto = op.playerPortraitUrl
                ?? (OWNER_IMAGES as Record<string, string>)[op.name ?? '']
                ?? null;
              const hasFace = isRealFaceConfig(op.face);
              const fallbackStaffUrl = realOwnerPhoto
                ? null
                : (hasFace ? null : (getStaffImageUrl(op.staffImageId) ?? getStaffImageUrl(deterministicStaffImageId(op.name))));
              const ownerImgFinal = realOwnerPhoto ?? fallbackStaffUrl;
              const WEALTH_LABEL: Record<string, string> = { Billionaire: 'Billionaire', NationalMagnate: 'National Magnate', LocalWealthy: 'Local Wealthy' };
              const PATIENCE_BADGE: Record<string, string> = { LongTerm: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', Steady: 'border-amber-400/40 bg-amber-400/10 text-amber-300', TriggerHappy: 'border-rose-400/40 bg-rose-400/10 text-rose-300' };
              const VISION_LABEL: Record<string, string> = { WinNow: 'Win Now', Develop: 'Develop', Frugal: 'Frugal' };
              return (
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Owner</div>
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                      {ownerImgFinal
                        ? <img src={ownerImgFinal} alt={op.name} className="w-full h-full object-cover" loading="lazy" />
                        : isRealFaceConfig(op.face)
                        ? <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '92%', height: '138%', transform: 'translate(-50%, -45%)' }}><MyFace face={op.face} lazy style={{ width: '100%', height: '100%' }} /></div></div>
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
          roleFocus={roles.find((r) => r.role === selectedRole)?.focus ?? ''}
          currency={currency}
          // NBA tids (0-99) → USA-only emergency pool. Spaniards/Frenchmen as
          // "limited options" candidates for a Mavs GM was the bug.
          emergencyCountries={(() => {
            const tid = team.id ?? team.tid;
            if (tid >= 0 && tid < 100) return ['USA'];
            if (tid >= 1000 && tid < 1100) return ['Spain', 'France', 'Italy', 'Serbia', 'Greece', 'Turkey'];
            return undefined;
          })()}
          onClose={() => { setSigningOpen(false); setResignPool(null); }}
          renderPortrait={renderPortrait}
          onSign={(payload) => {
            onHireStaff(payload);
            setSigningOpen(false);
            setResignPool(null);
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
        const isExpiring = years <= 1;
        const staffPersonnel: Personnel = {
          id: person?.id ?? `staff-${role}`,
          name: person?.name ?? '',
          type: 'coach',
          jobTitle: role,
          team: teamName,
          // Same photo chain as the card: real gist photo first, then nba2k
          // image, then the saved portrait, then the placeholder. Keeps the
          // PersonnelActionsModal aligned with the Staff card and CoachingView.
          playerPortraitUrl: resolveCoachPhoto(person?.name, person?.playerPortraitUrl)
            ?? getStaffImageUrl(person?.staffImageId)
            ?? getStaffImageUrl(deterministicStaffImageId(person?.name ?? ''))
            ?? undefined,
        };
        const filterActions: PersonnelActionType[] = [
          ...(isExpiring ? ['resign_staff' as PersonnelActionType] : []),
          'view_ratings',
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
                const roleIdx = roles.findIndex(r => r.role === role);
                const baseSalary = roles[Math.max(0, roleIdx)]?.salary ?? 600_000;
                const rating = Math.min(95, (member?.rating ?? 72) + 1);
                const resignCandidate = {
                  id: member?.id ?? `resign-${role}`,
                  role,
                  name: person?.name ?? '',
                  nationality: person?.nationality ?? '',
                  flag: getCountryFlag(person?.nationality),
                  salary: Math.round(baseSalary * (0.9 + rating / 200) / 10_000) * 10_000,
                  rating,
                  years: 2,
                  face: person?.face,
                  staffImageId: person?.staffImageId,
                  attributes: buildAttributes(baseRole, rating + 3),
                };
                setResignPool([resignCandidate]);
                setSelectedRole(role);
                setActionPerson(null);
                setSigningOpen(true);
              }
              else if (action === 'view_ratings') {
                setRatingsPerson({ role, person, years, salary });
                setActionPerson(null);
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
          const bornYear = person?.born?.year ?? person?.bornYear ?? (currentYear - (32 + (seed % 30)));
          const age = Math.max(24, currentYear - bornYear);
          const careerStartYear = person?.careerStartYear
            ?? (person?.startSeason ? parseInt(String(person.startSeason).slice(0, 4), 10) : null);
          const tenureFromHired = person?.hiredYear != null ? Math.max(1, currentYear - person.hiredYear) : null;
          const tenure = person?.yearsWithTeam ?? tenureFromHired ?? 1;
          const experience = careerStartYear != null
            ? Math.max(tenure, currentYear - careerStartYear)
            : Math.max(tenure, Math.min(35, age - 22));
          const expTier = experience >= 20 ? 'Veteran'
            : experience >= 12 ? 'Established'
            : experience >= 6 ? 'Experienced'
            : 'Rising';
          const expTone = experience >= 20 ? 'border-violet-400/40 bg-violet-400/10 text-violet-300'
            : experience >= 12 ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : experience >= 6 ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
            : 'border-sky-400/40 bg-sky-400/10 text-sky-300';
          const hiredYearDisplay = person?.hiredYear ?? (currentYear - tenure);
          const contractEndYear = currentYear + years;
          const status = years <= 1 ? 'Expiring' : years === 2 ? 'Final Year' : 'Locked In';
          const statusTone = years <= 1 ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
            : years === 2 ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
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
