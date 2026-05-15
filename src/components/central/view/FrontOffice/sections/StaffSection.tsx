import React, { useMemo, useState } from 'react';
import { Briefcase, Search, Star, Users } from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getCountryFlag } from '../../../../../utils/countryFlags';
import { getTeamFullName } from '../../../../../utils/teamNames';
import { makePlaceholderCoach, makePlaceholderGM } from '../../../../../services/staff/staffFallback';
import { MyFace, isRealFaceConfig } from '../../../../shared/MyFace';
import { getStaffImageUrl, randomStaffImageId, deterministicStaffImageId } from '../../../../../utils/staffPortrait';
import { StaffSigningModal, type StaffCandidate } from '../StaffSigning/StaffSigningModal';
import { SectionTitle } from '../shared/helpers';
import { FacilityKpi } from '../shared/FacilityKpi';

export const StaffSection: React.FC<{ state: any; team: any; onHireStaff: (hire: any) => void }> = ({ state, team, onHireStaff }) => {
  const [signingOpen, setSigningOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Head Coach');
  const teamName = getTeamFullName(team);
  const isGMOwnTeam = state.gameMode === 'gm' && (team.id ?? team.tid) === state.userTeamId;
  const commName: string | undefined = state.commissionerName;
  let coach: any = (state.staff?.coaches ?? []).find((s: any) => s.team === team.name || s.team === teamName)
    ?? makePlaceholderCoach(team);
  // In GM mode on the user's own team, show the user's identity as GM — replace placeholder name only when no real coach is hired yet.
  if (isGMOwnTeam && commName && coach?.isPlaceholder) {
    coach = { ...coach, name: commName, playerPortraitUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(commName)}&background=1e293b&color=FDB927&size=256&bold=true` };
  }
  const gm = (state.staff?.gms ?? []).find((s: any) => s.team === team.name || s.team === teamName)
    ?? makePlaceholderGM(team);
  const owner = (state.staff?.owners ?? []).find((s: any) => s.team === team.name || s.team === teamName);
  const persistentStaff = new Map<string, any>((team.tycoon?.staffMembers ?? []).map((s: any) => [s.role, s]));
  const getStaffFace = (person: any) => isRealFaceConfig(person?.face) ? person.face : undefined;
  const buildAttributes = (role: string, seed: number) => {
    const roleBoost: Record<string, Array<[string, number]>> = {
      'Head Coach': [['Tactics', 84], ['Offense', 80], ['Defense', 78], ['Development', 76], ['Motivation', 82]],
      'Assistant Coach': [['Opponent Prep', 76], ['Player Drills', 78], ['Defense', 74], ['Development', 80], ['Adaptability', 72]],
      'Head of Sports Science': [['Conditioning', 84], ['Load Control', 82], ['Recovery', 78], ['Biomechanics', 76], ['Data Habits', 74]],
      'Head Physio': [['Physiotherapy', 85], ['Rehab Speed', 82], ['Diagnostics', 76], ['Prevention', 80], ['Care Quality', 78]],
      'Chief Scout': [['Ability Judging', 82], ['Potential Judging', 84], ['Market Reads', 76], ['Negotiating', 72], ['Network', 78]],
      'Head of Analytics': [['Data Models', 83], ['Video Tools', 78], ['Opponent Models', 80], ['Lineup Advice', 77], ['Reporting', 75]],
    };
    return (roleBoost[role] ?? roleBoost['Head Coach']).map(([label, value], index) => [label, Math.max(45, Math.min(95, value + ((seed + index * 7) % 9) - 4))] as [string, number]);
  };
  const roles = [
    { role: 'Head Coach', person: persistentStaff.get('Head Coach') ?? coach, group: 'Coaching & Performance', focus: 'Tactics, rotations, player development', salary: 1_850_000, years: persistentStaff.get('Head Coach')?.contractYears ?? (coach.yearsWithTeam ? Math.max(1, 4 - Math.min(3, coach.yearsWithTeam)) : 2) },
    { role: 'Assistant Coach', person: persistentStaff.get('Assistant Coach') ?? null, group: 'Coaching & Performance', focus: 'Training sessions and opponent prep', salary: 620_000, years: persistentStaff.get('Assistant Coach')?.contractYears ?? 0 },
    { role: 'Head of Sports Science', person: persistentStaff.get('Head of Sports Science') ?? null, group: 'Coaching & Performance', focus: 'Injury prevention and workload monitoring', salary: 540_000, years: persistentStaff.get('Head of Sports Science')?.contractYears ?? 0 },
    { role: 'Head Physio', person: persistentStaff.get('Head Physio') ?? null, group: 'Coaching & Performance', focus: 'Recovery speed and day-to-day availability', salary: 460_000, years: persistentStaff.get('Head Physio')?.contractYears ?? 0 },
    { role: 'Chief Scout', person: persistentStaff.get('Chief Scout') ?? gm, group: 'Scouting & Analytics', focus: 'Player evaluation and market intelligence', salary: 720_000, years: persistentStaff.get('Chief Scout')?.contractYears ?? 2 },
    { role: 'Head of Analytics', person: persistentStaff.get('Head of Analytics') ?? null, group: 'Scouting & Analytics', focus: 'Shot profile, lineup data, and opponent models', salary: 510_000, years: persistentStaff.get('Head of Analytics')?.contractYears ?? 0 },
  ];
  const filledRoles = roles.filter((r) => r.person).length;
  const totalCost = roles.reduce((sum, r) => sum + (r.person ? r.salary : 0), 0);
  const avgSkill = Math.round(roles.reduce((sum, r, index) => sum + (r.person ? buildAttributes(r.role, index * 11)[0][1] : 58), 0) / roles.length);
  const CANDIDATE_POOL_NAMES: Array<{ name: string; nat: string; flag: string }> = [
    { name: 'Xavi Pascual',      nat: 'ESP', flag: '🇪🇸' },
    { name: 'Marco Calvani',     nat: 'ITA', flag: '🇮🇹' },
    { name: 'Dejan Radonjić',    nat: 'MNE', flag: '🇲🇪' },
    { name: 'Sito Alonso',       nat: 'ESP', flag: '🇪🇸' },
    { name: 'Vincent Collet',    nat: 'FRA', flag: '🇫🇷' },
    { name: 'Tomislav Mijatović',nat: 'CRO', flag: '🇭🇷' },
    { name: 'Andrea Trinchieri', nat: 'ITA', flag: '🇮🇹' },
    { name: 'Ergin Ataman',      nat: 'TUR', flag: '🇹🇷' },
    { name: 'Pablo Herrera',     nat: 'ESP', flag: '🇪🇸' },
    { name: 'Jasmin Repeša',     nat: 'CRO', flag: '🇭🇷' },
    { name: 'Luka Dončičić',     nat: 'SVN', flag: '🇸🇮' },
    { name: 'Sergio Scariolo',   nat: 'ITA', flag: '🇮🇹' },
    { name: 'Athanasios Skourtopoulos', nat: 'GRE', flag: '🇬🇷' },
    { name: 'Régis Boissié',     nat: 'FRA', flag: '🇫🇷' },
    { name: 'Bogdan Karaičić',   nat: 'SRB', flag: '🇷🇸' },
    { name: 'Mantas Vaitkus',    nat: 'LTU', flag: '🇱🇹' },
    { name: 'Diego Ocampo',      nat: 'ESP', flag: '🇪🇸' },
    { name: 'Ettore Messina',    nat: 'ITA', flag: '🇮🇹' },
    { name: 'Saša Obradović',    nat: 'SRB', flag: '🇷🇸' },
    { name: 'Sławomir Górczyński',nat: 'POL', flag: '🇵🇱' },
    { name: 'Janis Bērziņš',     nat: 'LVA', flag: '🇱🇻' },
    { name: 'Kostas Mexas',      nat: 'GRE', flag: '🇬🇷' },
    { name: 'Aitor Hidalgo',     nat: 'ESP', flag: '🇪🇸' },
    { name: 'Tomas Pacesas',     nat: 'LTU', flag: '🇱🇹' },
    { name: 'Goran Sretenović',  nat: 'SRB', flag: '🇷🇸' },
    { name: 'Pierre Vincent',    nat: 'FRA', flag: '🇫🇷' },
    { name: 'Boris Diaw',        nat: 'FRA', flag: '🇫🇷' },
    { name: 'Daniel Bjelica',    nat: 'SRB', flag: '🇷🇸' },
    { name: 'Iván Cardenas',     nat: 'ESP', flag: '🇪🇸' },
    { name: 'Stelios Sidiropoulos', nat: 'GRE', flag: '🇬🇷' },
  ];
  const buildPool = (role: string): Array<{ id: string; role: string; name: string; nationality: string; flag: string; salary: number; rating: number; years: number; face: any; attributes: Array<[string, number]> }> => {
    const roleIdx = roles.findIndex((r) => r.role === role);
    const baseSalary = roles[Math.max(0, roleIdx)].salary;
    const baseRating = buildAttributes(role, 41)[0][1];
    return Array.from({ length: 5 }, (_, i) => {
      const pickIdx = ((roleIdx + 1) * 7 + i * 11) % CANDIDATE_POOL_NAMES.length;
      const p = CANDIDATE_POOL_NAMES[pickIdx];
      const ovrJitter = [8, 4, 0, -4, -8][i] + ((roleIdx * 3 + i * 5) % 5);
      const rating = Math.max(58, Math.min(95, baseRating + ovrJitter));
      const salaryMult = 0.55 + (rating - 60) / 60;
      const salary = Math.round((baseSalary * salaryMult) / 10_000) * 10_000;
      const years = 3 + ((roleIdx + i) % 12);
      const seed = roleIdx * 100 + i * 13;
      return {
        id: `${role}-${i}`,
        role,
        name: p.name,
        nationality: p.nat,
        flag: p.flag,
        salary,
        rating,
        years,
        face: undefined,
        staffImageId: randomStaffImageId(),
        attributes: buildAttributes(role, seed),
      };
    });
  };
  const candidatePool = useMemo(() => {
    const map = new Map<string, StaffCandidate[]>();
    for (const r of roles) {
      const roleIdx = roles.findIndex((roleDef) => roleDef.role === r.role);
      const generated = (state.staffFreeAgents ?? [])
        .filter((member: any) => (member.position ?? member.jobTitle) === r.role)
        .map((member: any, index: number): StaffCandidate => {
          const rating = Math.max(50, Math.min(96, Math.round(member.reputation ?? 62)));
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
            staffImageId: member.staffImageId ?? randomStaffImageId(),
            attributes: buildAttributes(r.role, rating + index * 7),
          };
        })
        .sort((a: StaffCandidate, b: StaffCandidate) => b.rating - a.rating)
        .slice(0, 12);
      map.set(r.role, generated.length > 0 ? generated : buildPool(r.role));
    }
    return map;
  }, [state.staffFreeAgents, selectedRole, teamName]);
  const renderPortrait = (face: any, initials: string, size = 'w-16 h-20', staffImageId?: number, name?: string, portraitUrl?: string) => {
    const resolvedId = staffImageId ?? (name ? deterministicStaffImageId(name) : undefined);
    const staffImg = getStaffImageUrl(resolvedId) ?? portraitUrl ?? null;
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
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <SectionTitle icon={<Users size={22} />} title="Staff" subtitle="Manage your coaching, performance, and support team." />
        <button onClick={() => setSigningOpen(true)} className="h-14 rounded-xl border border-amber-400/50 bg-amber-400/15 px-7 text-amber-200 font-black uppercase tracking-widest text-xs hover:bg-amber-400/20">
          Hire Staff Member
        </button>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <FacilityKpi icon={<Users size={22} />} label="Total Staff" value={`${filledRoles}/${roles.length}`} sub={`${roles.length - filledRoles} open roles`} />
        <FacilityKpi icon={<Briefcase size={22} />} label="Annual Cost" value={formatCurrencyWithCode(totalCost, 'EUR', false)} sub="Committed staff payroll" />
        <FacilityKpi icon={<Star size={22} />} label="Average Skill" value={`${avgSkill}/100`} sub={avgSkill >= 80 ? 'Elite group' : 'Competitive group'} />
        <FacilityKpi icon={<Search size={22} />} label="Open Roles" value={String(roles.length - filledRoles)} sub="Hiring market available" />
      </div>
      <div className="grid xl:grid-cols-[1fr_390px] gap-6">
        <div className="space-y-6">
          {['Coaching & Performance', 'Scouting & Analytics'].map((group) => (
            <section key={group} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{group}</div>
              <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
                {roles.filter((item) => item.group === group).map((item, index) => {
                  const attrs = buildAttributes(item.role, index * 17);
                  const initials = item.person?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '+';
                  const rating = item.person ? Math.round(attrs.reduce((sum, a) => sum + a[1], 0) / attrs.length) : 0;
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
                      onClick={() => { setSelectedRole(item.role); }}
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
                        {attrs.slice(0, 5).map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[96px_1fr_28px] gap-2 items-center">
                            <span className="text-[10px] text-slate-500 truncate">{label}</span>
                            <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><span className="block h-full bg-amber-300" style={{ width: `${value}%` }} /></span>
                            <span className="text-[10px] font-black text-slate-400 tabular-nums">{value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{item.years} Years Left</span>
                        <span className="text-slate-400">{formatCurrencyWithCode(item.salary, 'EUR', false)}/yr</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex-1">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Staff Chemistry</div>
              <div className="mt-2 h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-400 to-amber-300" style={{ width: `${Math.min(96, avgSkill + 7)}%` }} /></div>
              <div className="mt-2 text-sm text-slate-400">The current group is stable, but open performance roles limit the recovery and scouting ceiling.</div>
            </div>
            <div className="flex gap-3">
              <button className="h-12 rounded-xl border border-slate-700 px-5 text-sm font-black text-slate-300 hover:text-white">Staff Directory</button>
              <button onClick={() => setSigningOpen(true)} className="h-12 rounded-xl border border-amber-400/50 bg-amber-400/15 px-5 text-sm font-black text-amber-200">Hire Staff</button>
            </div>
          </div>
        </div>
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-amber-300">Front Office Chain</div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
                <div className="text-xs text-slate-500">General Manager</div>
                <div className="font-black text-white">{gm.name}</div>
              </div>
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
                <div className="text-xs text-slate-500">Owner</div>
                <div className="font-black text-white">{owner?.name ?? 'Ownership group'}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      {signingOpen && (
        <StaffSigningModal
          selectedRole={selectedRole}
          pool={candidatePool.get(selectedRole) ?? []}
          roleFocus={roles.find((r) => r.role === selectedRole)?.focus ?? ''}
          onClose={() => setSigningOpen(false)}
          renderPortrait={renderPortrait}
          onSign={(payload) => {
            onHireStaff(payload);
            setSigningOpen(false);
          }}
        />
      )}
    </div>
  );
};
