import React, { useMemo, useState } from 'react';
import { ArrowLeft, Award, Briefcase, Star, X } from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { deterministicStaffImageId } from '../../../../../utils/staffPortrait';
import { getCountryFlag } from '../../../../../utils/countryFlags';
import { getNameData } from '../../../../../data/nameDataFetcher';
import { FacilityKpi } from '../shared/FacilityKpi';
import { SliderRow } from '../shared/SliderRow';
import { getStaffMarketSalary, type StaffMarket } from '../../../../../services/tycoon/economyScale';
import {
  buildDisplayAttributes,
  buildStaffAttrs,
  computeStaffOverall,
  seedForStaff,
  ROLE_DISPLAY_KEYS,
} from '../../../../../services/staff/displayAttributes';

export type StaffCandidate = {
  id: string;
  role: string;
  name: string;
  nationality: string;
  flag: string;
  salary: number;
  rating: number;
  years: number;
  face: any;
  staffImageId?: number;
  playerPortraitUrl?: string;
  attributes: Array<[string, number]>;
};

type WizardStep = 'candidates' | 'offer' | 'review';
export type StaffSigningMode = 'hire' | 'extension';

/** Focus tag labels for the candidate-list summary line. Derived from the
 *  shared ROLE_DISPLAY_KEYS so the strings here always match what the card
 *  and signing-modal Key Attributes section render. */
const focusTagsFor = (role: string): string[] => {
  const baseRole = role.replace(/ \d+$/, '');
  const keys = ROLE_DISPLAY_KEYS[baseRole] ?? ROLE_DISPLAY_KEYS['Head Coach'];
  return keys.slice(0, 4).map(([, label]) => label);
};

const NAME_POOL_COUNTRY_ALIASES: Record<string, string> = {
  American: 'USA',
  Spanish: 'Spain',
};

function resolveNamePoolCountry(country: string): string {
  return NAME_POOL_COUNTRY_ALIASES[country] ?? country;
}

const StepperPill: React.FC<{ index: number; label: string; status: 'done' | 'current' | 'todo' }> = ({ index, label, status }) => (
  <div className="flex items-center gap-2">
    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-black ${
      status === 'done'    ? 'bg-emerald-400 text-slate-950' :
      status === 'current' ? 'bg-amber-400 text-slate-950' :
                             'bg-slate-800 text-slate-500 border border-slate-700'
    }`}>
      {status === 'done' ? '✓' : index}
    </div>
    <span className={`text-xs font-black uppercase tracking-wider ${
      status === 'done'    ? 'text-emerald-300' :
      status === 'current' ? 'text-amber-300' :
                             'text-slate-500'
    }`}>{label}</span>
  </div>
);

const OvrRing: React.FC<{ value: number; size?: number }> = ({ value, size = 44 }) => {
  const pct = Math.max(0, Math.min(100, ((value - 55) / 40) * 100));
  const color = value >= 85 ? '#34d399' : value >= 75 ? '#fbbf24' : value >= 65 ? '#fb923c' : '#f87171';
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1e293b" strokeWidth={3} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[8px] font-bold text-slate-400 leading-none">OVR</span>
        <span className="text-sm font-black text-white leading-none tabular-nums" style={{ color }}>{value}</span>
      </div>
    </div>
  );
};

export const StaffSigningModal: React.FC<{
  selectedRole: string;
  pool: StaffCandidate[];
  roleFocus: string;
  onClose: () => void;
  onSign: (hire: any) => void;
  renderPortrait: (face: any, initials: string, size?: string, staffImageId?: number, name?: string, portraitUrl?: string) => React.ReactNode;
  /** Currency for salary display. NBA mode passes 'USD', Euro passes 'EUR'. */
  currency?: string;
  mode?: StaffSigningMode;
  market?: StaffMarket;
  /** Country pool the emergency fallback uses when the real FA list is thin.
   *  NBA mode passes ['USA']; Euro mode keeps the multi-country mix. Without
   *  this, a Mavs GM saw Edgar Hernández-Sonseca pop up as a Dev Coach. */
  emergencyCountries?: string[];
}> = ({ selectedRole, pool, onClose, onSign, renderPortrait, currency = 'EUR', mode = 'hire', market = 'nba', emergencyCountries }) => {
  const isExtension = mode === 'extension';
  const candidatePool = useMemo(() => {
    if (pool.length >= 3) return pool;
    const nameData = getNameData() as any;
    const countries = emergencyCountries ?? ['Spain', 'France', 'Italy', 'Serbia', 'Greece', 'Turkey'];
    const needed = 3 - pool.length;
    const emergency: StaffCandidate[] = [];
    for (let i = 0; i < needed; i++) {
      const country = countries[(selectedRole.length + i) % countries.length];
      const countryData = nameData.countries?.[resolveNamePoolCountry(country)] ?? nameData.countries?.USA;
      const firsts = Object.keys(countryData?.first ?? {});
      const lasts = Object.keys(countryData?.last ?? {});
      const first = firsts[(selectedRole.length + i * 7) % Math.max(1, firsts.length)] ?? 'Interim';
      const last = lasts[(selectedRole.length * 3 + i * 11) % Math.max(1, lasts.length)] ?? 'Candidate';
      const fullName = `${first} ${last}`;
      // Same seed pipeline as the FA pool so emergency candidates also show a
      // role-weighted overall consistent with the card and ratings modal.
      const seed = seedForStaff({ name: fullName, reputation: 54 + i * 3 });
      const attrsFull = buildStaffAttrs(seed);
      const rating = computeStaffOverall(selectedRole, attrsFull);
      emergency.push({
        id: `emergency-${selectedRole}-${i}`,
        role: selectedRole,
        name: fullName,
        nationality: country,
        flag: getCountryFlag(country),
        salary: getStaffMarketSalary(undefined, selectedRole, rating, {
          market,
          yearsExperience: 2 + i * 2,
          yearsWithTeam: 0,
        }),
        rating,
        years: 2 + i * 2,
        face: undefined,
        staffImageId: deterministicStaffImageId(fullName),
        attributes: buildDisplayAttributes(selectedRole, seed),
      });
    }
    return [...pool, ...emergency];
  }, [emergencyCountries, market, pool, selectedRole]);
  const [step, setStep] = useState<WizardStep>('candidates');
  const [selectedId, setSelectedId] = useState<string>(candidatePool[0]?.id ?? '');
  const [sortKey, setSortKey] = useState<'overall' | 'salary-asc' | 'salary-desc' | 'years'>('overall');
  const sortedPool = useMemo(() => {
    const arr = [...candidatePool];
    if (sortKey === 'overall')      arr.sort((a, b) => b.rating - a.rating);
    if (sortKey === 'salary-asc')   arr.sort((a, b) => a.salary - b.salary);
    if (sortKey === 'salary-desc')  arr.sort((a, b) => b.salary - a.salary);
    if (sortKey === 'years')        arr.sort((a, b) => b.years - a.years);
    return arr;
  }, [candidatePool, sortKey]);
  const candidate = candidatePool.find((c) => c.id === selectedId) ?? candidatePool[0];

  const [salary, setSalary] = useState(candidate?.salary ?? 500_000);
  const [years, setYears] = useState(2);
  const [bonus, setBonus] = useState(120_000);
  const [decision, setDecision] = useState<null | { accepted: boolean; label: string; ratio: number; salary: number; years: number; bonus: number }>(null);

  React.useEffect(() => {
    if (candidate) setSalary(candidate.salary);
  }, [candidate?.id]);

  if (!candidate) {
    return (
      <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center">
          <p className="text-slate-400">No candidates available for {selectedRole}.</p>
          <button onClick={onClose} className="mt-4 w-full h-11 rounded-xl bg-slate-800 text-slate-200 font-bold">Close</button>
        </div>
      </div>
    );
  }

  const focusTags = focusTagsFor(selectedRole);

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md p-4 md:p-8 overflow-y-auto">
      <div className="max-w-[1480px] mx-auto rounded-2xl border border-violet-400/30 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <button onClick={onClose} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"><ArrowLeft size={16} /> Back to Staff</button>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-violet-300">
              {isExtension ? 'Staff Contract Extension' : 'New Staff Signing'}
            </div>
            <div className="text-xs text-slate-400">
              {isExtension ? 'Negotiate terms to keep this staff member in place' : 'Negotiate and secure the right person for the role'}
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex items-center justify-center gap-4 px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <StepperPill index={1} label="Role"       status="done" />
          <div className="h-px w-8 bg-slate-800" />
          <StepperPill index={2} label="Candidates" status={step === 'candidates' ? 'current' : 'done'} />
          <div className="h-px w-8 bg-slate-800" />
          <StepperPill index={3} label={isExtension ? 'Terms' : 'Offer'} status={step === 'offer' ? 'current' : step === 'review' ? 'done' : 'todo'} />
          <div className="h-px w-8 bg-slate-800" />
          <StepperPill index={4} label="Review"     status={step === 'review' ? 'current' : 'todo'} />
        </div>

        <div className="px-6 pt-6">
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Briefcase size={22} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Selected Role</div>
              <div className="text-xl font-black text-amber-300">{selectedRole}</div>
              <div className="text-xs text-slate-400 mt-0.5">Role Focus · {focusTags.join(', ')}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pool</div>
              <div className="text-sm font-black text-slate-200 tabular-nums">{candidatePool.length} candidates</div>
            </div>
          </div>
        </div>

        {step === 'candidates' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Top Candidates</div>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                Sort by:
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="overall">Overall</option>
                  <option value="salary-asc">Salary ↑</option>
                  <option value="salary-desc">Salary ↓</option>
                  <option value="years">Experience</option>
                </select>
              </label>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {sortedPool.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`text-left rounded-2xl border p-4 transition-all flex items-center gap-4 ${
                      active ? 'border-amber-400/60 bg-amber-400/10 ring-1 ring-amber-400/40' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                    }`}
                  >
                    {renderPortrait(c.face, c.name.split(' ').map((n) => n[0]).join('').slice(0, 2), 'w-16 h-20', c.staffImageId, c.name, c.playerPortraitUrl)}
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-black text-white truncate">{c.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-violet-300">{c.role}</div>
                        {c.id.startsWith('emergency-') && (
                          <span className="text-[9px] uppercase tracking-wider text-rose-300 bg-rose-900/40 px-1.5 py-0.5 rounded">
                            Limited options
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">{c.flag} {c.nationality}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <OvrRing value={c.rating} />
                      <div className="text-[11px] font-black text-emerald-300 tabular-nums">{formatCurrencyWithCode(c.salary, currency, false)}</div>
                      <div className="text-[10px] text-slate-500">{c.years} yrs exp</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs text-slate-500">Selected · <span className="text-amber-300 font-bold">{candidate.name}</span></div>
              <button
                onClick={() => setStep('offer')}
                className="h-12 px-6 rounded-xl bg-amber-400 text-slate-950 font-black uppercase tracking-widest text-xs hover:bg-amber-300"
              >
                {isExtension ? 'Negotiate Extension' : 'Negotiate Offer'} →
              </button>
            </div>
          </div>
        )}

        {step === 'offer' && (
          <div className="grid xl:grid-cols-[1fr_360px] gap-0">
            <main className="p-6">
              <div className="grid lg:grid-cols-[220px_1fr] gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex justify-center">
                  {renderPortrait(candidate.face, candidate.name.split(' ').map((n) => n[0]).join('').slice(0, 2), 'w-44 h-56', candidate.staffImageId, candidate.name, candidate.playerPortraitUrl)}
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-violet-300">{candidate.role}</div>
                  <h3 className="text-4xl font-black tracking-tight mt-2">{candidate.name}</h3>
                  <p className="text-sm text-slate-400 mt-2">{candidate.flag} {candidate.nationality} · {candidate.years} years experience · Strong fit for {selectedRole}.</p>
                  <div className="mt-5 grid sm:grid-cols-3 gap-3">
                    <FacilityKpi icon={<Award size={20} />} label="Reputation" value={`${candidate.rating}/100`} sub="Market profile" />
                    <FacilityKpi icon={<Briefcase size={20} />} label="Current Ask" value={formatCurrencyWithCode(candidate.salary, currency, false)} sub="Annual salary" />
                    <FacilityKpi icon={<Star size={20} />} label="Interest" value="High" sub="Would join now" />
                  </div>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Key Attributes</div>
                <div className="grid md:grid-cols-2 gap-4">
                  {candidate.attributes.map(([label, value]) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">{label}</span><span className="font-black text-violet-300">{value}</span></div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${value}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setStep('candidates')}
                className="mt-4 text-xs text-slate-400 hover:text-white"
              >
                ← Back to candidates
              </button>
            </main>
            <aside className="border-l border-slate-800 p-6 space-y-5">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-violet-300">
                  {isExtension ? 'Extension Package' : 'Negotiation Package'}
                </div>
                <p className="text-sm text-slate-400 mt-2">Tune the offer. Strength compares against the current ask.</p>
              </div>
              <SliderRow label="Annual Salary" value={salary} min={Math.max(80_000, Math.round(candidate.salary * 0.65 / 5_000) * 5_000)} max={Math.round(candidate.salary * 1.65 / 5_000) * 5_000} step={5_000} onChange={setSalary} formatter={(v) => formatCurrencyWithCode(v, currency, false)} />
              <SliderRow label="Contract Length" value={years} min={1} max={4} step={1} onChange={setYears} formatter={(v) => `${v} years`} />
              <SliderRow label="Signing Bonus" value={bonus} min={0} max={900_000} step={25_000} onChange={setBonus} formatter={(v) => formatCurrencyWithCode(v, currency, false)} />
              {(() => {
                const effectiveAnnual = salary + (bonus / Math.max(1, years));
                const ratio = candidate.salary > 0 ? effectiveAnnual / candidate.salary : 1;
                const lengthAdj = ratio + (years - 1) * 0.03;
                let label = 'Likely';
                let tone = 'text-emerald-300';
                let strengthBarColor = 'bg-emerald-400';
                let willAccept = true;
                if (lengthAdj < 0.70) { label = 'Will reject — too low'; tone = 'text-rose-300'; strengthBarColor = 'bg-rose-500'; willAccept = false; }
                else if (lengthAdj < 0.85) { label = 'Insulted — likely no'; tone = 'text-rose-300'; strengthBarColor = 'bg-rose-400'; willAccept = false; }
                else if (lengthAdj < 0.97) { label = 'Tempted — coin flip'; tone = 'text-amber-300'; strengthBarColor = 'bg-amber-400'; willAccept = true; }
                else if (lengthAdj < 1.10) { label = 'Likely'; tone = 'text-emerald-300'; strengthBarColor = 'bg-emerald-400'; willAccept = true; }
                else { label = 'Eager — premium offer'; tone = 'text-emerald-300'; strengthBarColor = 'bg-emerald-300'; willAccept = true; }
                const pct = Math.round(lengthAdj * 100);
                const barWidth = Math.min(100, Math.max(0, lengthAdj * 100 - 60) * 2.5);
                return (
                  <>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-500">Package Preview</div>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">Annual</span><span className="font-black text-white">{formatCurrencyWithCode(salary, currency, false)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Total commitment</span><span className="font-black text-white">{formatCurrencyWithCode(salary * years + bonus, currency, false)}</span></div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-slate-400">Offer Strength</span>
                            <span className={`font-black ${tone} tabular-nums`}>{pct}% of ask</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div className={`h-full ${strengthBarColor} transition-all`} style={{ width: `${barWidth}%` }} />
                          </div>
                        </div>
                        <div className="flex justify-between"><span className="text-slate-400">Approval outlook</span><span className={`font-black ${tone}`}>{label}</span></div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setDecision({ accepted: willAccept, label, ratio: lengthAdj, salary, years, bonus });
                        setStep('review');
                      }}
                      className="w-full h-14 rounded-xl border border-violet-400/60 bg-violet-400/15 text-violet-200 font-black uppercase tracking-widest hover:bg-violet-400/25"
                    >
                      {isExtension ? 'Submit Terms' : 'Submit Offer'}
                    </button>
                  </>
                );
              })()}
            </aside>
          </div>
        )}

        {step === 'review' && decision && (
          <div className="p-6">
            <div className={`max-w-2xl mx-auto rounded-2xl border-2 bg-slate-900/40 p-8 text-center ${
              decision.accepted ? 'border-emerald-400/60' : 'border-rose-400/60'
            }`}>
              <div className={`text-[10px] font-black uppercase tracking-[0.4em] mb-4 ${
                decision.accepted ? 'text-emerald-300' : 'text-rose-300'
              }`}>
                {decision.accepted
                  ? (isExtension ? 'Extension Accepted' : 'Offer Accepted')
                  : (isExtension ? 'Extension Rejected' : 'Offer Rejected')}
              </div>
              <div className="flex justify-center mb-4">
                {renderPortrait(candidate.face, candidate.name.split(' ').map((n) => n[0]).join('').slice(0, 2), 'w-28 h-36', candidate.staffImageId, candidate.name, candidate.playerPortraitUrl)}
              </div>
              <h3 className="text-3xl font-black tracking-tight mb-3">{candidate.name}</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-5 max-w-md mx-auto">
                {decision.accepted
                  ? `"${formatCurrencyWithCode(decision.salary, currency, false)} per year for ${decision.years} year${decision.years === 1 ? '' : 's'} works. I'm in — looking forward to getting started."`
                  : decision.ratio < 0.7
                    ? `"That offer is well below what I'm worth. I'll be looking elsewhere — don't waste my time again."`
                    : `"It's close, but not quite there. Come back with a stronger offer if you really want me."`}
              </p>
              <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-4 mb-6 text-xs text-slate-400 max-w-sm mx-auto">
                <div className="flex justify-between"><span>Salary</span><span className="text-white font-bold">{formatCurrencyWithCode(decision.salary, currency, false)}</span></div>
                <div className="flex justify-between mt-1"><span>Term</span><span className="text-white font-bold">{decision.years} year{decision.years === 1 ? '' : 's'}</span></div>
                <div className="flex justify-between mt-1"><span>Bonus</span><span className="text-white font-bold">{formatCurrencyWithCode(decision.bonus, currency, false)}</span></div>
                <div className="flex justify-between mt-1 pt-1 border-t border-slate-800"><span>vs. ask</span><span className={`font-black ${decision.accepted ? 'text-emerald-300' : 'text-rose-300'}`}>{Math.round(decision.ratio * 100)}%</span></div>
              </div>
              <div className="flex gap-3 max-w-sm mx-auto">
                <button
                  onClick={() => { setDecision(null); setStep('offer'); }}
                  className="flex-1 h-12 rounded-xl bg-slate-800 text-slate-200 font-black uppercase tracking-widest text-xs hover:bg-slate-700"
                >
                  {decision.accepted ? 'Adjust' : isExtension ? 'Adjust Terms' : 'Adjust Offer'}
                </button>
                {decision.accepted && (
                  <button
                    onClick={() => {
                      onSign({ ...candidate, role: selectedRole, salary: decision.salary, years: decision.years, bonus: decision.bonus });
                      setDecision(null);
                    }}
                    className="flex-1 h-12 rounded-xl bg-emerald-400 text-slate-950 font-black uppercase tracking-widest text-xs hover:bg-emerald-300"
                  >
                    {isExtension ? 'Finalize Extension' : 'Finalize Hire'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
