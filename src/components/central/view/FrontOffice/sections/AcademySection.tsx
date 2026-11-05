import React, { useState, useMemo } from 'react';
import {
  Award, BookOpen, Building2, CheckCircle, GraduationCap,
  MapPin, Minus, Plus, Star, Target, TrendingUp, Trophy, Users,
} from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';
import { computeAge } from '../../../../../utils/helpers';
import { getDisplayOverall, getDisplayPotential } from '../../../../../utils/playerRatings';
import { MyFace, isRealFaceConfig } from '../../../../shared/MyFace';
import {
  ACADEMY_BUDGET_MAX_EUR,
  ACADEMY_BUDGET_STEP_EUR,
  getAcademyBudgetStrength,
  normalizeAcademyBudgetEUR,
} from '../../../../../services/tycoon/economyScale';
import { getTycoonFacilityLevel } from '../../../../../services/tycoon/tierBase';
import { normalizePositionLabel } from '../../../../../utils/positionUtils';

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

export const AcademySection: React.FC<AcademySectionProps> = ({
  tycoon, teamName, players, userTeamId, simYear, seniorRosterSize, maxRosterSize = 15, onAcademyBudgetChange, locked = false,
}) => {
  const level = getTycoonFacilityLevel(tycoon.facilities?.academy);
  const economyIndex = tycoon.currentEconomyIndex ?? 1;
  const budget = normalizeAcademyBudgetEUR(tycoon.academyBudget, tycoon.tier, economyIndex);
  const budgetStrength = getAcademyBudgetStrength(budget, tycoon.tier, economyIndex);
  const rating = Math.min(99, 50 + Math.round(budgetStrength * 49));

  const youthPlayers = useMemo(() => {
    return players
      .filter(p => p.tid === userTeamId && !p.promotedFromAcademy && computeAge(p, simYear) <= 19 && computeAge(p, simYear) >= 15)
      .map(p => {
        const r = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null;
        const age = computeAge(p, simYear);
        return {
          id: p.pid ?? p.internalId ?? p.id,
          name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
          pos: p.pos ?? r?.pos ?? '?',
          age,
          ovr: getDisplayOverall(p, simYear),
          pot: getDisplayPotential(p, simYear, simYear),
          face: p.face,
          imgURL: p.imgURL,
          hgt: p.hgt ?? r?.hgt,
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
        budgetStrength={budgetStrength}
        economyIndex={economyIndex}
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
  budgetStrength: number;
  economyIndex: number;
  onAcademyBudgetChange?: (budget: number) => void;
  locked?: boolean;
}> = ({ level, rating: _ratingFromLevel, teamName, youthCount, promotable, slotsAvailable, maxRosterSize, seniorRosterSize, budget, budgetStrength, economyIndex, onAcademyBudgetChange, locked = false }) => {
  const driver = budgetStrength;
  const qualityLabel = driver >= 0.85 ? 'Elite' : driver >= 0.65 ? 'Excellent' : driver >= 0.4 ? 'Good' : driver > 0 ? 'Developing' : 'Idle';
  const rating = Math.min(99, 50 + Math.round(driver * 49));
  const budgetStep = Math.max(1, Math.round(ACADEMY_BUDGET_STEP_EUR * economyIndex));
  const budgetMax = Math.round(ACADEMY_BUDGET_MAX_EUR * economyIndex);
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
                <span className="inline-flex rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-black text-amber-300">Annual Budget · {formatEur(budget)}</span>
                <span className="inline-flex rounded-lg border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-xs font-black text-violet-300">{qualityLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <KpiBox icon={<Users size={22} />} label="Youth Players" value={`${Math.min(12, youthCount)}/12`} sub="EYBL squad cap" />
          <KpiBox icon={<Star size={22} />} label="Rating" value={String(rating)} sub={qualityLabel} />
          <KpiBox icon={<Trophy size={22} />} label="Senior Slots" value={`${seniorRosterSize}/${maxRosterSize}`} sub={`${slotsAvailable} open`} />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Academy Benefits</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ['Talent Pipeline', `+${Math.round(driver * 25)}%`, 'Stronger pipeline produces better youth prospects who graduate to your senior team each offseason.'],
              ['Youth Development', `+${Math.round(driver * 30)}%`, 'Funded coaching accelerates young player progression rates.'],
              ['Recruitment Range', driver >= 0.8 ? 'International' : driver >= 0.4 ? 'National' : driver > 0 ? 'Regional' : 'Local Only', 'Bigger budgets attract talent from wider regions.'],
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
            <div className="grid grid-cols-[46px_minmax(0,1fr)_46px] items-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
              <button type="button" onClick={() => onAcademyBudgetChange(Math.max(0, budget - budgetStep))} disabled={locked || budget <= 0} aria-label="Decrease academy investment" className="flex h-11 items-center justify-center border-r border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700"><Minus size={16} /></button>
              <div className="text-center"><div className="text-sm font-black text-emerald-300">{formatEur(budget)}</div><div className="text-[10px] font-bold text-slate-500">per season</div></div>
              <button type="button" onClick={() => onAcademyBudgetChange(Math.min(budgetMax, budget + budgetStep))} disabled={locked || budget >= budgetMax} aria-label="Increase academy investment" className="flex h-11 items-center justify-center border-l border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700"><Plus size={16} /></button>
            </div>
            {locked && <div className="mt-3 text-xs font-bold text-amber-300">Academy investment is locked until next offseason.</div>}
            <div className="grid grid-cols-3 mt-4 text-xs sm:text-sm">
              <div><div className="text-slate-400 truncate">{formatEur(0)}</div><div className="text-[10px] sm:text-xs text-slate-500">None</div></div>
              <div className="text-center"><div className="text-emerald-300 font-black truncate">{formatEur(budget)}</div><div className="text-[10px] sm:text-xs text-slate-500">Current</div></div>
              <div className="text-right"><div className="text-slate-400 truncate">{formatEur(budgetMax)}</div><div className="text-[10px] sm:text-xs text-slate-500">Maximum</div></div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
              This saved annual amount directly shapes academy recruitment and player development.
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Academy Departments</div>
          <div className="divide-y divide-slate-800">
            {[
              { label: 'Youth Coaching', icon: <Users size={18} />, tier: driver >= 0.8 ? 'Elite' : driver >= 0.4 ? 'Advanced' : driver > 0 ? 'Standard' : 'Basic' },
              { label: 'Scouting & Recruitment', icon: <Target size={18} />, tier: driver >= 0.9 ? 'Elite' : driver >= 0.6 ? 'Advanced' : driver > 0 ? 'Standard' : 'Basic' },
              { label: 'Education Program', icon: <BookOpen size={18} />, tier: driver >= 0.6 ? 'Advanced' : driver > 0 ? 'Standard' : 'Basic' },
              { label: 'Dormitories', icon: <Building2 size={18} />, tier: driver >= 0.8 ? 'Elite' : driver >= 0.4 ? 'Advanced' : 'Basic' },
              { label: 'Regional Camps', icon: <MapPin size={18} />, tier: driver >= 0.6 ? 'Advanced' : driver >= 0.4 ? 'Standard' : 'Basic' },
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
              ['Annual Budget', formatEur(budget)],
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
              ['Youth Quality', Math.round(Math.min(99, 30 + driver * 69))],
              ['Development Speed', Math.round(Math.min(99, 25 + driver * 74))],
              ['Scouting Reach', Math.round(Math.min(99, 20 + driver * 79))],
              ['Graduate Rate', Math.round(Math.min(99, 35 + driver * 64))],
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
  youthPlayers: Array<{ id: any; name: string; pos: string; age: number; ovr: number; pot: number; face: any; imgURL?: string; hgt?: number }>;
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
                    <div className="flex items-center gap-3 sm:grid sm:grid-cols-[44px_1fr_56px_44px_56px_56px_160px_40px]">
                      <YouthPortrait player={p} />
                      <div className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:block">{p.name}</div>
                      <div className="hidden text-sm font-bold text-slate-300 sm:block">{normalizePositionLabel(p.pos, p.hgt)}</div>
                      <div className="hidden text-sm tabular-nums text-slate-400 sm:block">{p.age}</div>
                      <div className="hidden text-sm font-black tabular-nums text-white sm:block">{p.ovr}</div>
                      <div className={`hidden text-sm font-black tabular-nums sm:block ${pColor}`}>{p.pot}</div>
                      <div className={`hidden text-xs font-bold sm:block ${rec.color}`}>{rec.label}</div>
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
                      <span className="text-xs text-slate-500">{normalizePositionLabel(p.pos, p.hgt)} · {p.age}y</span>
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
