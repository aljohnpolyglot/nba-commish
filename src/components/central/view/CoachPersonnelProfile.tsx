import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Clock3,
  Flag,
  HelpCircle,
  Star,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { StaffAttributes } from '../../../TeamTraining/types';
import { useGame } from '../../../store/GameContext';
import {
  STAFF_ATTRIBUTE_GROUPS,
  attrsForCoach,
  computeStaffOverall,
  getStaffAttributeTooltip,
  seedForStaff,
} from '../../../services/staff/displayAttributes';
import { getCountryFlagCode, normalizeNationality } from '../../../utils/countryFlags';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { CountryFlag } from '../../shared/CountryFlag';
import { displayStaffRole } from '../../../services/staff/staffCareerRows';
import type { Personnel } from './LeagueOfficeSearcher';
import { resolveTeamByHistoricalName } from '../../../utils/teamLookup';

type CoachProfileMode = 'bio' | 'ratings';

type CareerRow = {
  years: string;
  organization: string;
  role: string;
  startYear?: number;
};

interface CoachPersonnelProfileProps {
  mode: CoachProfileMode;
  person: Personnel;
  onBack: () => void;
  portraitUrl?: string;
  biography?: string;
  loading?: boolean;
}

const ROLE_SUFFIXES = [
  'Associate Head Coach',
  'Assistant Coach',
  'Head Coach',
  'General Manager',
  'Team Manager',
  'Vice President',
  'President',
  'Executive',
  'Consultant',
  'Chief Scout',
  'Scout',
  'Coach',
  'Player',
] as const;

function normalizeIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCareerSegment(segment: string): CareerRow | null {
  const clean = segment.replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '');
  const match = clean.match(/^((?:19|20)\d{2}(?:\s*[-–—]\s*(?:(?:19|20)\d{2}|present))?)\s+(.+)$/i);
  if (!match) return null;

  const years = match[1].replace(/\s+/g, '').replace(/[–—]/g, '-');
  let remainder = match[2].trim();
  let role = '';
  const parenthesizedRole = remainder.match(/\(([^)]+)\)$/);
  if (parenthesizedRole) {
    role = parenthesizedRole[1].trim();
    remainder = remainder.slice(0, parenthesizedRole.index).trim();
  } else {
    const roleMatch = ROLE_SUFFIXES.find(candidate =>
      remainder.toLowerCase().endsWith(candidate.toLowerCase()),
    );
    if (roleMatch) {
      role = roleMatch;
      remainder = remainder.slice(0, -roleMatch.length).trim();
    }
  }

  if (!remainder) return null;
  return {
    years,
    organization: remainder,
    role: role || 'Coach',
    startYear: Number(years.slice(0, 4)),
  };
}

function parseCareerRows(person: Personnel): CareerRow[] {
  const explicitRows = (person.careerRows ?? []).map(row => ({
    years: row.years,
    organization: row.organization,
    role: row.role,
    startYear: Number(row.years.match(/(?:19|20)\d{2}/)?.[0]),
  }));
  const source = String(person.careerHistory ?? '').trim();
  const sourceRows = source
    ? source
        .replace(/\r?\n/g, ' ')
        .split(/(?=\b(?:19|20)\d{2}(?:\s*[-–—]\s*(?:(?:19|20)\d{2}|present))?\b)/i)
        .map(parseCareerSegment)
        .filter((row): row is CareerRow => row !== null)
    : [];

  const combined = [...explicitRows, ...sourceRows];
  if (combined.length === 0 && person.team) {
    const startYear = person.hiredYear ?? person.careerStartYear;
    combined.push({
      years: startYear ? `${startYear}-Present` : 'Present',
      organization: person.team,
      role: person.jobTitle || 'Coach',
      startYear,
    });
  }

  const seen = new Set<string>();
  return combined.filter(row => {
    const key = `${normalizeIdentity(row.years)}|${normalizeIdentity(row.organization)}|${normalizeIdentity(row.role)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitHonor(honor: string): { count?: string; label: string } {
  const match = honor.trim().match(/^(\d+)\s*[x×]\s*(.+)$/i);
  return match ? { count: `${match[1]}×`, label: match[2] } : { label: honor.trim() };
}

function resolveAttributes(person: Personnel): StaffAttributes {
  const fallback = attrsForCoach(person.name, seedForStaff(person), { role: person.jobTitle ?? 'Head Coach' });
  const source = person.attributes ?? {};
  const next = { ...fallback };
  for (const group of STAFF_ATTRIBUTE_GROUPS) {
    for (const [key] of group.keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[key] = Math.max(0, Math.min(100, Math.round(value)));
      }
    }
  }
  return next;
}

function yearsLabel(value: number | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return `${Math.max(0, Math.round(value))} ${Math.round(value) === 1 ? 'year' : 'years'}`;
}

export const CoachPersonnelProfile: React.FC<CoachPersonnelProfileProps> = ({
  mode,
  person,
  onBack,
  portraitUrl,
  biography,
  loading = false,
}) => {
  const { state } = useGame();
  const resolvedPortraitUrl = portraitUrl || person.playerPortraitUrl || '';
  const [portraitFailed, setPortraitFailed] = useState(false);
  useEffect(() => setPortraitFailed(false), [resolvedPortraitUrl]);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const attributes = useMemo(() => resolveAttributes(person), [person]);
  const careerRows = useMemo(() => parseCareerRows(person), [person]);
  const honors = useMemo(
    () => (person.honors ?? []).map(splitHonor).filter(honor => honor.label.length > 0),
    [person.honors],
  );
  const teams = useMemo(() => [...state.teams, ...(state.nonNBATeams ?? [])], [state.nonNBATeams, state.teams]);

  const findTeam = (organization?: string, season?: number) => resolveTeamByHistoricalName(teams, organization, season);

  const currentTeam = findTeam(person.team, currentYear);
  const currentTeamLogo = person.teamLogoUrl
    || (currentTeam ? getResolvedTeamLogoUrl(currentTeam, currentYear) : '');
  const rawBornYear = Number(person.bornYear);
  const bornYear = Number.isInteger(rawBornYear) && rawBornYear >= 1900 && rawBornYear <= currentYear
    ? rawBornYear
    : undefined;
  const age = bornYear ? currentYear - bornYear : undefined;
  const rawCareerStartYear = Number(person.careerStartYear)
    || careerRows.map(row => row.startYear).find(year => Number.isFinite(year));
  const careerStartYear = rawCareerStartYear && rawCareerStartYear >= 1900 && rawCareerStartYear <= currentYear
    ? rawCareerStartYear
    : undefined;
  const experience = careerStartYear ? Math.max(0, currentYear - careerStartYear) : undefined;
  const withTeam = Number.isFinite(Number(person.yearsWithTeam))
    ? Number(person.yearsWithTeam)
    : person.hiredYear
      ? Math.max(0, currentYear - person.hiredYear)
      : undefined;
  const overall = computeStaffOverall(person.jobTitle ?? 'Head Coach', attributes);
  const nationality = normalizeNationality(person.nationality);
  const showNationality = nationality !== 'Unknown';
  const stats: Array<{ label: string; value: string; Icon: typeof UserRound; accent?: boolean }> = [];
  if (age != null) stats.push({ label: 'Age', value: String(age), Icon: UserRound });
  if (bornYear) stats.push({ label: 'Born', value: String(bornYear), Icon: CalendarDays });
  if (careerStartYear) stats.push({ label: 'Career Began', value: String(careerStartYear), Icon: Flag });
  if (experience != null) stats.push({ label: 'Experience', value: yearsLabel(experience)!, Icon: Clock3 });
  if (withTeam != null) stats.push({ label: 'With Team', value: yearsLabel(withTeam)!, Icon: UsersRound });
  if (mode === 'ratings') stats.push({ label: 'Overall', value: String(overall), Icon: Star, accent: true });

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_70%_15%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(145deg,#07111f,#081426_55%,#06101e)] text-white">
      <button
        type="button"
        onClick={onBack}
        className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-xl border border-blue-400/30 bg-slate-950/70 text-slate-200 shadow-[0_0_18px_rgba(37,99,235,0.2)] transition hover:border-blue-300 hover:text-white sm:right-6 sm:top-6"
        aria-label="Close personnel profile"
      >
        <X size={24} />
      </button>

      <div className="custom-scrollbar h-full overflow-y-auto p-4 pr-4 sm:p-7 lg:p-10">
        <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-7">
          <section className="grid gap-6 pr-12 sm:pr-16 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-10">
            <div className="mx-auto h-[270px] w-[220px] overflow-hidden rounded-2xl border border-blue-400/50 bg-slate-900 shadow-[0_0_28px_rgba(37,99,235,0.22)] sm:h-[310px] sm:w-[250px] lg:mx-0">
              {resolvedPortraitUrl && !portraitFailed ? (
                <img
                  src={resolvedPortraitUrl}
                  alt={person.name}
                  className="h-full w-full object-cover object-top"
                  referrerPolicy="no-referrer"
                  onError={() => setPortraitFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-6xl font-black text-slate-600">
                  {person.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)}
                </div>
              )}
            </div>

            <div className="min-w-0 self-center">
              <h1 className="break-words text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">{person.name}</h1>
              <p className="mt-2 text-sm font-black uppercase tracking-[0.28em] text-blue-400 sm:text-xl">
                {displayStaffRole(person.jobTitle || 'Coach')}
              </p>
              <div className="mt-6 space-y-3 text-base text-slate-300 sm:text-xl">
                {person.team && (
                  <div className="flex items-center gap-3">
                    {currentTeamLogo ? (
                      <img src={currentTeamLogo} alt="" className="h-7 w-7 object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <Building2 size={24} className="text-blue-300" />
                    )}
                    <span>{person.team}</span>
                  </div>
                )}
                {showNationality && (
                  <div className="flex items-center gap-3">
                    <CountryFlag country={nationality} className="inline-flex h-5 w-8 sm:h-6 sm:w-9" />
                    <span>{nationality}</span>
                  </div>
                )}
              </div>

              {stats.length > 0 && (
                <div className="mt-7 grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-600/60 bg-slate-950/20 sm:grid-cols-3 xl:grid-cols-6">
                  {stats.map(({ label, value, Icon, accent }) => (
                    <div key={label} className="min-w-0 border-b border-r border-slate-700/70 p-4 last:border-r-0 sm:p-5">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <Icon size={17} className={accent ? 'text-amber-300' : 'text-blue-300'} />
                        {label}
                      </div>
                      <div className={`mt-2 truncate text-lg font-black sm:text-xl ${accent ? 'text-amber-300' : 'text-slate-100'}`}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map(index => <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-800/60" />)}
            </div>
          ) : mode === 'ratings' ? (
            <div className="space-y-5">
              {STAFF_ATTRIBUTE_GROUPS.map(group => (
                <section key={group.label}>
                  <h2 className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-blue-400">{group.label}</h2>
                  <div className="grid gap-x-10 gap-y-3 rounded-xl border border-slate-600/60 bg-slate-950/20 p-4 sm:grid-cols-2 sm:p-5">
                    {group.keys.map(([key, label]) => {
                      const value = attributes[key];
                      return (
                        <div key={key}>
                          <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                            <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
                              <span>{label}</span>
                              <details className="group relative shrink-0">
                                <summary
                                  className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-slate-500 transition hover:bg-blue-500/10 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                  aria-label={`What ${label} affects`}
                                >
                                  <HelpCircle size={13} />
                                </summary>
                                <span
                                  role="tooltip"
                                  className="absolute bottom-full left-0 z-30 mb-2 hidden w-56 rounded-lg border border-blue-400/30 bg-slate-950 p-2.5 text-xs font-medium leading-relaxed text-slate-200 shadow-2xl group-open:block sm:left-1/2 sm:-translate-x-1/2"
                                >
                                  {getStaffAttributeTooltip(key)}
                                </span>
                              </details>
                            </span>
                            <span className="font-black text-slate-100">{value}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                            <div className="h-full rounded-full bg-amber-400" style={{ width: `${value}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <>
              {honors.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-blue-400">Awards / Honors</h2>
                  <div className="custom-scrollbar flex snap-x gap-3 overflow-x-auto pb-3">
                    {honors.map((honor, index) => (
                      <div key={`${honor.label}-${index}`} className="flex min-h-24 w-[250px] shrink-0 snap-start items-center gap-3 rounded-xl border border-slate-600/60 bg-slate-950/25 p-4 sm:w-[280px]">
                        {index % 3 === 1 ? <Star className="shrink-0 text-blue-400" /> : <Trophy className="shrink-0 text-amber-300" />}
                        <div className="min-w-0">
                          {honor.count && <span className="text-2xl font-black text-white">{honor.count}</span>}
                          <p className="text-sm leading-tight text-slate-300">{honor.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {biography && (
                <section className="rounded-xl border border-slate-600/60 bg-slate-950/20 p-5">
                  <h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-blue-400">Biography</h2>
                  <p className="text-sm leading-relaxed text-slate-300 sm:text-base">{biography}</p>
                </section>
              )}

              <section className="min-h-0">
                <h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-blue-400">Career Summary</h2>
                {careerRows.length > 0 ? (
                  <div className="custom-scrollbar max-h-[410px] overflow-y-auto rounded-xl border border-slate-600/60 bg-slate-950/20">
                    {careerRows.map((row, index) => {
                      const matchedTeam = findTeam(row.organization, row.startYear);
                      const logoUrl = matchedTeam ? getResolvedTeamLogoUrl(matchedTeam, row.startYear ?? currentYear) : '';
                      const isCountry = !matchedTeam && Boolean(getCountryFlagCode(row.organization));
                      return (
                        <div key={`${row.years}-${row.organization}-${row.role}-${index}`} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 border-b border-slate-700/70 p-4 last:border-b-0 sm:grid-cols-[48px_150px_minmax(0,1fr)_180px] sm:items-center">
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden">
                            {logoUrl ? (
                              <img src={logoUrl} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                            ) : isCountry ? (
                              <CountryFlag country={row.organization} className="inline-flex h-7 w-10" />
                            ) : (
                              <Building2 size={22} className="text-blue-400" />
                            )}
                          </div>
                          <div className="min-w-0 sm:contents">
                            <div className="text-sm font-bold text-slate-400">{row.years}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100 sm:mt-0">{row.organization}</div>
                            <div className="mt-1 text-sm text-slate-400 sm:mt-0 sm:text-right">{displayStaffRole(row.role)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/20 p-8 text-center text-sm text-slate-500">
                    No career history is available for this coach.
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
