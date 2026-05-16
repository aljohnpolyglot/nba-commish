import React, { useState, useMemo } from 'react';
import {
  Award, BookOpen, Building2, CheckCircle, GraduationCap,
  MapPin, Star, Target, TrendingUp, Trophy, Users,
} from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';
import { convertTo2KRating, computeAge } from '../../../../../utils/helpers';
import { MyFace, isRealFaceConfig } from '../../../../shared/MyFace';
import { defaultAcademyBudgetForTier } from '../../../../../services/tycoon/economyScale';

function potColor(pot: number): string {
  if (pot >= 80) return 'text-emerald-300';
  if (pot >= 70) return 'text-amber-300';
  if (pot >= 60) return 'text-sky-300';
  return 'text-slate-400';
}

function recommendation(ovr: number, pot: number): { label: string; color: string } {
  if (pot >= 78 && ovr >= 58) return { label: 'NBA Caliber Prospect', color: 'text-emerald-300' };
  if (pot >= 68 && ovr >= 52) return { label: 'Good Prospect',        color: 'text-sky-300' };
  if (pot >= 58)              return { label: 'Developing',           color: 'text-amber-300' };
  return                              { label: 'Long Shot',            color: 'text-rose-300' };
}

interface AcademySectionProps {
  tycoon: TycoonState;
  teamName: string;
  players: any[];
  userTeamId: number;
  simYear: number;
  seniorRosterSize: number;
  maxRosterSize?: number;
  onAcademyBudgetChange?: (budget: number) => void;
  locked?: boolean;
}

const ACADEMY_BUDGET_TIERS = [
  { value: 0, label: 'None',
    desc: 'The academy is shuttered. No new prospects develop here this year, and nothing will be ready to promote to your senior team next offseason.',
    cost: 0 },
  { value: 1, label: 'Minimal',
    desc: 'Bare-bones operation. A trickle of low-ceiling local kids comes through — expect mostly bench-end prospects when promotion season arrives.',
    cost: 250_000 },
  { value: 2, label: 'Standard',
    desc: 'Regional scouting plus basic youth coaching. Solid developing prospects will be eligible for promotion to your senior team next offseason.',
    cost: 750_000 },
  { value: 3, label: 'Elevated',
    desc: 'National recruiting and dedicated development staff. A handful of genuinely good prospects will be ready to challenge for senior-team minutes.',
    cost: 1_500_000 },
  { value: 4, label: 'Elite',
    desc: 'International scouts and a full development pipeline. Expect multiple NBA-caliber-tier prospects to graduate into your senior squad next offseason.',
    cost: 3_000_000 },
  { value: 5, label: 'World Class',
    desc: 'Top-tier dormitories, multi-country camps, and the best youth coaches in the league. The cream of the crop — star-potential prospects regularly come through and get promoted to your senior team.',
    cost: 6_000_000 },
] as const;

export const AcademySection: React.FC<AcademySectionProps> = ({
  tycoon, teamName, players, userTeamId, simYear, seniorRosterSize, maxRosterSize = 15, onAcademyBudgetChange, locked = false,
}) => {
  const level = tycoon.facilities.academy.level;
  const rating = 54 + level * 9;
  const budget = (tycoon as any).academyBudget ?? defaultAcademyBudgetForTier(tycoon.tier);
  const budgetTier = ACADEMY_BUDGET_TIERS[Math.max(0, Math.min(5, budget))];

  const youthPlayers = useMemo(() => {
    return players
      .filter(p => p.tid === userTeamId && computeAge(p, simYear) <= 19 && computeAge(p, simYear) >= 15)
      .map(p => {
        const r = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null;
        const bbgmOvr = p.overallRating ?? r?.ovr ?? 45;
        const bbgmPot = p.pot ?? r?.pot ?? 55;
        const k2Ovr = convertTo2KRating(bbgmOvr, r?.hgt ?? 50, r?.tp);
        const k2Pot = convertTo2KRating(bbgmPot, r?.hgt ?? 50, r?.tp);
        const age = computeAge(p, simYear);
        return {
          id: p.pid ?? p.internalId ?? p.id,
          name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
          pos: p.pos ?? r?.pos ?? '?',
          age,
          ovr: k2Ovr,
          pot: k2Pot,
          face: p.face,
          imgURL: p.imgURL,
        };
      })
      .sort((a, b) => b.pot - a.pot);
  }, [players, userTeamId, simYear]);

  const slotsAvailable = Math.max(0, maxRosterSize - seniorRosterSize);
  const promotable = youthPlayers.filter(p => {
    const rec = recommendation(p.ovr, p.pot);
    return rec.label === 'Highly Recommended' || rec.label === 'Recommended';
  }).length;

  return (
    <div className="space-y-5">
      <OverviewTab
        level={level}
        rating={rating}
        teamName={teamName}
        youthCount={youthPlayers.length}
        promotable={promotable}
        slotsAvailable={slotsAvailable}
        maxRosterSize={maxRosterSize}
        seniorRosterSize={seniorRosterSize}
        budget={budget}
        budgetTier={budgetTier}
        onAcademyBudgetChange={onAcademyBudgetChange}
        locked={locked}
      />
    </div>
  );
};

const KpiBox: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }> = ({ icon, label, value, sub, accent = 'text-emerald-300' }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-center">
    <div className={`flex justify-center ${accent}`}>{icon}</div>
    <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-black ${accent}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
  </div>
);

const YouthPortrait: React.FC<{ player: any }> = ({ player }) => {
  if (player.imgURL) {
    return <img src={player.imgURL} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-800" />;
  }
  if (isRealFaceConfig(player.face)) {
    return (
      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800">
        <MyFace face={player.face} style={{ width: 40, height: 53 }} />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
      <span className="text-xs font-bold text-slate-400">{(player.name ?? '?')[0]}</span>
    </div>
  );
};

const OverviewTab: React.FC<{
  level: number; rating: number; teamName: string;
  youthCount: number; promotable: number; slotsAvailable: number;
  maxRosterSize: number; seniorRosterSize: number;
  budget: number;
  budgetTier: { value: number; label: string; desc: string; cost: number };
  onAcademyBudgetChange?: (budget: number) => void;
  locked?: boolean;
}> = ({ level, rating: _ratingFromLevel, teamName, youthCount, promotable, slotsAvailable, maxRosterSize, seniorRosterSize, budget, budgetTier, onAcademyBudgetChange, locked = false }) => {
  // Visual lever = slider (budget). Facility level is shown as a static badge
  // but doesn't drive the bars/percentages — that's the spending decision.
  const driver = budget; // 0–5 slider value
  const tierLabel = driver >= 5 ? 'World Class' : driver >= 4 ? 'Elite' : driver >= 3 ? 'Excellent' : driver >= 2 ? 'Good' : driver >= 1 ? 'Basic' : 'Idle';
  const rating = Math.min(99, 50 + driver * 10);
  const formatEur = (v: number) => v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `€${Math.round(v / 1_000)}K` : `€${v}`;
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 flex items-center justify-center shrink-0">
              <GraduationCap size={36} className="text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Youth Academy</div>
              <h3 className="text-2xl font-black text-white mt-1">{teamName} Academy</h3>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="inline-flex rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-300">Facility Lvl {level}</span>
                <span className="inline-flex rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-black text-amber-300">Investment · {budgetTier.label}</span>
                <span className="inline-flex rounded-lg border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-xs font-black text-violet-300">{tierLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <KpiBox icon={<Users size={22} />} label="Youth Players" value={`${Math.min(12, youthCount)}/12`} sub="EYBL squad cap" />
          <KpiBox icon={<Star size={22} />} label="Rating" value={String(rating)} sub={tierLabel} />
          <KpiBox icon={<Trophy size={22} />} label="Senior Slots" value={`${seniorRosterSize}/${maxRosterSize}`} sub={`${slotsAvailable} open`} />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Academy Benefits</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ['Talent Pipeline', `+${Math.round(driver * 5)}%`, 'Stronger pipeline produces better youth prospects who graduate to your senior team each offseason.'],
              ['Youth Development', `+${Math.round(driver * 6)}%`, 'Funded coaching accelerates young player progression rates.'],
              ['Recruitment Range', driver >= 4 ? 'International' : driver >= 2 ? 'National' : driver >= 1 ? 'Regional' : 'Local Only', 'Bigger budgets attract talent from wider regions.'],
            ].map(([name, bonus, desc]) => (
              <div key={name} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="text-sm font-black text-white">{name}</div>
                <div className="text-xl font-black text-emerald-300 mt-1">{bonus}</div>
                <p className="text-xs text-slate-400 mt-2">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {onAcademyBudgetChange && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Annual Academy Investment</div>
            <p className="text-xs text-slate-500 mb-5">Bigger budget = stronger prospects show up at the start of next offseason.</p>
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={budget}
              onChange={(e) => onAcademyBudgetChange(parseInt(e.target.value, 10))}
              disabled={locked}
              className={`w-full accent-emerald-400 ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            {locked && <div className="mt-3 text-xs font-bold text-amber-300">Academy investment is locked until next offseason.</div>}
            <div className="grid grid-cols-3 mt-4 text-xs sm:text-sm">
              <div><div className="text-slate-400 truncate">{formatEur(0)}</div><div className="text-[10px] sm:text-xs text-slate-500">None</div></div>
              <div className="text-center"><div className="text-emerald-300 font-black truncate">{formatEur(budgetTier.cost)}</div><div className="text-[10px] sm:text-xs text-slate-500">{budgetTier.label}</div></div>
              <div className="text-right"><div className="text-slate-400 truncate">{formatEur(ACADEMY_BUDGET_TIERS[5].cost)}</div><div className="text-[10px] sm:text-xs text-slate-500">World Class</div></div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
              {budgetTier.desc}
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Academy Departments</div>
          <div className="divide-y divide-slate-800">
            {[
              { label: 'Youth Coaching', icon: <Users size={18} />, tier: driver >= 4 ? 'Elite' : driver >= 2 ? 'Advanced' : driver >= 1 ? 'Standard' : 'Basic' },
              { label: 'Scouting & Recruitment', icon: <Target size={18} />, tier: driver >= 5 ? 'Elite' : driver >= 3 ? 'Advanced' : driver >= 1 ? 'Standard' : 'Basic' },
              { label: 'Education Program', icon: <BookOpen size={18} />, tier: driver >= 3 ? 'Advanced' : driver >= 1 ? 'Standard' : 'Basic' },
              { label: 'Dormitories', icon: <Building2 size={18} />, tier: driver >= 4 ? 'Elite' : driver >= 2 ? 'Advanced' : 'Basic' },
              { label: 'Regional Camps', icon: <MapPin size={18} />, tier: driver >= 3 ? 'Advanced' : driver >= 2 ? 'Standard' : 'Basic' },
            ].map(dept => {
              const tierColor = dept.tier === 'Elite' ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10'
                : dept.tier === 'Advanced' ? 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                : dept.tier === 'Standard' ? 'text-sky-300 border-sky-400/40 bg-sky-400/10'
                : 'text-slate-400 border-slate-600 bg-slate-800/50';
              return (
                <div key={dept.label} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">{dept.icon}</span>
                    <span className="text-sm font-bold text-slate-200">{dept.label}</span>
                  </div>
                  <span className={`rounded-lg border px-2.5 py-1 text-xs font-black ${tierColor}`}>{dept.tier}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Quick Info</div>
          <div className="divide-y divide-slate-800">
            {[
              ['Academy', `${teamName} Academy`],
              ['Facility Level', `${level} / 5`],
              ['Investment', budgetTier.label],
              ['Annual Cost', formatEur(budgetTier.cost)],
              ['Rating', String(rating)],
              ['Youth Players', `${Math.min(12, youthCount)} / 12`],
              ['Senior Slots', `${slotsAvailable} open`],
            ].map(([label, val]) => (
              <div key={label} className="py-2.5 flex justify-between gap-3">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-bold text-slate-200 truncate text-right max-w-[160px]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-300 mb-3">Academy Impact</div>
          <div className="space-y-3">
            {[
              ['Youth Quality', Math.min(99, 30 + driver * 14)],
              ['Development Speed', Math.min(99, 25 + driver * 14)],
              ['Scouting Reach', Math.min(99, 20 + driver * 16)],
              ['Graduate Rate', Math.min(99, 35 + driver * 12)],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{label}</span>
                  <span className="font-black text-emerald-300">{value}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

export const YouthPromotionPanel: React.FC<{
  youthPlayers: Array<{ id: any; name: string; pos: string; age: number; ovr: number; pot: number; face: any; imgURL?: string }>;
  slotsAvailable: number; seniorRosterSize: number; maxRosterSize: number;
  onPromote?: (ids: any[]) => void;
}> = ({ youthPlayers, slotsAvailable, seniorRosterSize, maxRosterSize, onPromote }) => {
  const [selected, setSelected] = useState<Set<any>>(new Set());
  const toggle = (id: any) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < slotsAvailable) next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox icon={<Users size={22} />} label="Eligible Players" value={String(youthPlayers.length)} sub="Youth roster" />
        <KpiBox icon={<Award size={22} />} label="Recommended" value={String(youthPlayers.filter(p => recommendation(p.ovr, p.pot).label.includes('Recommended')).length)} />
        <KpiBox icon={<CheckCircle size={22} />} label="Selected" value={String(selected.size)} sub="To promote" />
        <KpiBox icon={<Trophy size={22} />} label="Slots" value={`${seniorRosterSize}/${maxRosterSize}`} sub={`${slotsAvailable} available`} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Offseason Promotion</div>
        <p className="text-xs text-slate-500 mb-5">Select players to promote to the main roster.</p>

        {youthPlayers.length > 0 ? (
          <>
            <div className="hidden sm:grid grid-cols-[44px_1fr_56px_44px_56px_56px_140px_40px] gap-3 px-2 mb-2">
              <div />
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Player</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Pos</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Age</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">OVR</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">POT</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Recommendation</div>
              <div />
            </div>
            <div className="divide-y divide-slate-800">
              {youthPlayers.map(p => {
                const rec = recommendation(p.ovr, p.pot);
                const pColor = potColor(p.pot);
                const isSelected = selected.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`py-3 px-2 rounded-lg cursor-pointer transition-all ${
                      isSelected ? 'bg-emerald-500/10 border border-emerald-500/30' : 'hover:bg-slate-800/50'
                    }`}
                    onClick={() => toggle(p.id)}
                  >
                    <div className="grid grid-cols-[44px_1fr_56px_44px_56px_56px_160px_40px] gap-3 items-center">
                      <YouthPortrait player={p} />
                      <div className="text-sm font-bold text-white truncate">{p.name}</div>
                      <div className="text-sm text-slate-300 font-bold">{p.pos}</div>
                      <div className="text-sm text-slate-400 tabular-nums">{p.age}</div>
                      <div className="text-sm font-black text-white tabular-nums">{p.ovr}</div>
                      <div className={`text-sm font-black tabular-nums ${pColor}`}>{p.pot}</div>
                      <div className={`text-xs font-bold ${rec.color}`}>{rec.label}</div>
                      <div className="flex justify-center">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'border-emerald-400 bg-emerald-400'
                            : 'border-slate-600'
                        }`}>
                          {isSelected && <CheckCircle size={14} className="text-slate-950" />}
                        </div>
                      </div>
                    </div>

                    <div className="sm:hidden mt-2 flex items-center gap-3">
                      <span className="text-xs text-slate-500">{p.pos} · {p.age}y</span>
                      <span className="text-xs font-bold text-white">OVR {p.ovr}</span>
                      <span className={`text-xs font-bold ${pColor}`}>POT {p.pot}</span>
                      <span className={`text-xs ${rec.color}`}>{rec.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="text-sm text-emerald-300 font-bold">
                {selected.size > 0 ? `${selected.size} Player${selected.size > 1 ? 's' : ''} Selected` : 'No players selected'}
              </div>
              <button
                disabled={selected.size === 0}
                onClick={() => onPromote?.(Array.from(selected))}
                className={`h-12 px-8 rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 ${
                  selected.size > 0
                    ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <TrendingUp size={16} /> Promote Selected Players
              </button>
            </div>
          </>
        ) : (
          <div className="py-12 text-center">
            <GraduationCap size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm text-slate-500">No youth players in the academy.</p>
            <p className="text-xs text-slate-600 mt-1">Youth prospects are generated each season based on your academy level.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 flex items-start gap-3">
        <GraduationCap size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-emerald-300">Youth Development Tip</div>
          <p className="text-xs text-slate-400 mt-1">Promoting players at the right time is key. Keep an eye on their potential and playing time opportunities.</p>
        </div>
      </div>
    </div>
  );
};
