const normalizeRole = (role: string) => String(role ?? '').replace(/\bAssistant Coach\s+[23]\b/gi, 'Assistant Coach').trim();

const normalizeText = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export const displayStaffRole = (role: string) => normalizeRole(role) || String(role ?? '').trim();

export const closePresentCareerRanges = (career: string | undefined, endYear: number) =>
  String(career ?? '').replace(/(\d{4})\s*-\s*Present/gi, `$1-${endYear}`);

export const staffCareerStartYear = (person: any, fallbackYear: number) => {
  const value = Number(person?.roleStartYear ?? person?.hiredYear ?? person?.careerStartYear ?? fallbackYear);
  return Number.isFinite(value) ? Math.round(value) : fallbackYear;
};

export const staffTeamHiredYear = (person: any, currentYear: number) => {
  const hiredYear = Number(person?.hiredYear);
  if (Number.isFinite(hiredYear) && hiredYear > 0 && hiredYear <= currentYear) return Math.round(hiredYear);
  const yearsWithTeam = Number(person?.yearsWithTeam);
  if (Number.isFinite(yearsWithTeam) && yearsWithTeam >= 0) {
    return currentYear - Math.round(yearsWithTeam);
  }
  return currentYear;
};

export const currentStaffYearsWithTeam = (person: any, currentYear: number) =>
  Math.max(0, currentYear - staffTeamHiredYear(person, currentYear));

export function appendStaffCareerRow(career: string | undefined, startYear: number, teamName: string, role: string) {
  const roleLabel = displayStaffRole(role);
  const row = `${startYear}-Present ${teamName} (${roleLabel})`;
  const base = String(career ?? '').trim();
  const lower = normalizeText(base);
  if (lower.includes(normalizeText(row))) return base;
  return base ? `${base}\n${row}` : row;
}

export function finalizeStaffCareerRow(
  career: string | undefined,
  startYear: number,
  endYear: number,
  teamName: string,
  role: string,
) {
  const roleLabel = displayStaffRole(role);
  const closed = closePresentCareerRanges(career, endYear).trim();
  const lower = normalizeText(closed);
  if (
    lower.includes(`${startYear}-${endYear}`) &&
    lower.includes(normalizeText(teamName)) &&
    lower.includes(normalizeText(roleLabel))
  ) {
    return closed;
  }
  const row = `${startYear}-${endYear} ${teamName} (${roleLabel})`;
  return closed ? `${closed}\n${row}` : row;
}

export function finalizeStaffStint(person: any, role: string, teamName: string, endYear: number) {
  if (!person) return person;
  const startYear = staffCareerStartYear(person, endYear);
  return {
    ...person,
    career_history: finalizeStaffCareerRow(person?.career_history ?? person?.coaching_career ?? '', startYear, endYear, teamName, role),
    coaching_career: finalizeStaffCareerRow(person?.coaching_career ?? person?.career_history ?? '', startYear, endYear, teamName, role),
  };
}

export function stampStaffHireCareer(person: any, role: string, teamName: string, currentYear: number) {
  return {
    ...person,
    role,
    roleStartYear: currentYear,
    hiredYear: currentYear,
    yearsWithTeam: 0,
    career_history: appendStaffCareerRow(
      closePresentCareerRanges(person?.career_history ?? person?.coaching_career ?? '', currentYear),
      currentYear,
      teamName,
      role,
    ),
    coaching_career: appendStaffCareerRow(
      closePresentCareerRanges(person?.coaching_career ?? person?.career_history ?? '', currentYear),
      currentYear,
      teamName,
      role,
    ),
  };
}

export function buildCurrentStaffCareerRow(person: any, fallbackTeam: string, fallbackRole: string, activeYear: number): string | null {
  const teamName = String(person?.team ?? fallbackTeam ?? '').trim();
  const role = displayStaffRole(String(person?.role ?? person?.position ?? person?.jobTitle ?? fallbackRole ?? ''));
  if (!teamName || !role) return null;
  const startYear = staffCareerStartYear(person, activeYear);
  if (!Number.isFinite(startYear) || startYear <= 0 || startYear > activeYear) return null;
  return `${startYear}-Present ${teamName} (${role})`;
}
