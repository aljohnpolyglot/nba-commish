import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { StaffAttributes } from '../../../../../TeamTraining/types';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { normalizeNationality } from '../../../../../utils/countryFlags';
import { CountryFlag } from '../../../../shared/CountryFlag';
import { displayStaffRole } from '../../../../../services/staff/staffCareerRows';

export type StaffCandidate = {
  id: string;
  role: string;
  name: string;
  nationality: string;
  flag: string;
  salary: number;
  rating: number;
  years: number;
  coachingYears?: number;
  playingYears?: number;
  face: any;
  staffImageId?: number;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  lastRole?: string;
  lastTeam?: string;
  playingCareerTeams?: string[];
  playingCareerRows?: Array<{ years: string; team: string; position: string }>;
  awardsSummary?: string[];
  playingCareerStats?: { games: number; ppg: number; rpg: number; apg: number; fgPct: number; seasons: number };
  isGeneratedDepth?: boolean;
  careerStartYear?: number;
  hiredYear?: number;
  roleStartYear?: number;
  askYears?: number;
  askBonus?: number;
  career_history?: string;
  coaching_career?: string;
  attributeProfile?: 'default' | 'nba';
  attributeOverrides?: Partial<StaffAttributes>;
  attributes: Array<[string, number]>;
};

export type StaffSigningMode = 'hire' | 'extension';

const CANDIDATE_PAGE_SIZE = 24;

export type StaffPortraitRenderer = (
  face: any,
  initials: string,
  size?: string,
  staffImageId?: number,
  name?: string,
  portraitUrl?: string,
) => React.ReactNode;

const OvrRing: React.FC<{ value: number }> = ({ value }) => {
  const pct = Math.max(0, Math.min(100, ((value - 55) / 40) * 100));
  const color = value >= 85 ? '#34d399' : value >= 75 ? '#fbbf24' : value >= 65 ? '#fb923c' : '#f87171';
  const size = 40;
  const radius = size / 2 - 3;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-10 w-10 shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeWidth={3} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * pct) / 100}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[7px] font-bold leading-none text-slate-500">OVR</span>
        <span className="text-xs font-black leading-none tabular-nums" style={{ color }}>{value}</span>
      </div>
    </div>
  );
};

export const StaffSigningModal: React.FC<{
  selectedRole: string;
  pool: StaffCandidate[];
  onClose: () => void;
  onSelectCandidate: (candidate: StaffCandidate) => void;
  renderPortrait: StaffPortraitRenderer;
  currency?: string;
  loading?: boolean;
}> = ({
  selectedRole,
  pool,
  onClose,
  onSelectCandidate,
  renderPortrait,
  currency = 'EUR',
  loading = false,
}) => {
  const [sortKey, setSortKey] = useState<'overall' | 'salary-asc' | 'salary-desc' | 'years'>('overall');
  const [visibleCount, setVisibleCount] = useState(CANDIDATE_PAGE_SIZE);
  useEffect(() => setVisibleCount(CANDIDATE_PAGE_SIZE), [selectedRole, sortKey]);
  const sortedPool = useMemo(() => {
    const candidates = [...pool];
    if (sortKey === 'overall') candidates.sort((a, b) => b.rating - a.rating);
    if (sortKey === 'salary-asc') candidates.sort((a, b) => a.salary - b.salary);
    if (sortKey === 'salary-desc') candidates.sort((a, b) => b.salary - a.salary);
    if (sortKey === 'years') candidates.sort((a, b) => b.years - a.years);
    return candidates;
  }, [pool, sortKey]);
  const visiblePool = sortedPool.slice(0, visibleCount);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] overflow-y-auto overflow-x-hidden bg-black/85 p-2 backdrop-blur-md sm:p-4 md:p-8"
    >
      <div className="mx-auto w-full max-w-[1240px] overflow-hidden rounded-2xl border border-violet-400/30 bg-slate-950 text-white shadow-2xl">
        <header className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-800 p-4 sm:grid-cols-[1fr_auto_1fr] sm:p-5">
          <button onClick={onClose} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
            <ArrowLeft size={16} /> Back to Staff
          </button>
          <div className="hidden text-center sm:block">
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-violet-300">View Candidates</div>
            <div className="text-xs text-slate-400">Review available options for {displayStaffRole(selectedRole)}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close candidates"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 sm:p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/15 text-amber-300">
              <Briefcase size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Position</div>
              <div className="truncate text-lg font-black text-amber-300">{displayStaffRole(selectedRole)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Available</div>
              <div className="text-sm font-black tabular-nums text-slate-200">{loading ? '…' : pool.length}</div>
            </div>
          </div>

          <div className="mb-3 mt-5 flex items-center justify-between gap-3">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Candidates</div>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              Sort:
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-bold text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="overall">Overall</option>
                <option value="salary-asc">Salary ↑</option>
                <option value="salary-desc">Salary ↓</option>
                <option value="years">Experience</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400" role="status">
              Loading candidates…
            </div>
          ) : sortedPool.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {visiblePool.map(candidate => (
                <button
                  key={candidate.id}
                  onClick={() => onSelectCandidate(candidate)}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left transition-all hover:border-amber-400/50 hover:bg-amber-400/5"
                >
                  {renderPortrait(
                    candidate.face,
                    candidate.name.split(' ').map(part => part[0]).join('').slice(0, 2),
                    'w-14 h-16',
                    candidate.staffImageId,
                    candidate.name,
                    candidate.playerPortraitUrl,
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-white sm:text-base">{candidate.name}</div>
                    <div className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-violet-300">{displayStaffRole(candidate.role)}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <CountryFlag country={candidate.nationality} />
                      <span className="truncate">{normalizeNationality(candidate.nationality)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <OvrRing value={candidate.rating} />
                    <div className="text-[10px] font-black tabular-nums text-emerald-300">
                      {formatCurrencyWithCode(candidate.salary, currency, false)} / {candidate.askYears ?? 2}yr
                    </div>
                    <div className="text-[9px] text-slate-500">{candidate.coachingYears ?? candidate.years} yrs exp</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
              No candidates are currently available for {selectedRole}.
            </div>
          )}
          {visiblePool.length < sortedPool.length && (
            <button
              onClick={() => setVisibleCount(count => Math.min(sortedPool.length, count + CANDIDATE_PAGE_SIZE))}
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-200 hover:border-amber-400/50 hover:text-white"
            >
              Show More Candidates ({sortedPool.length - visiblePool.length} remaining)
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
