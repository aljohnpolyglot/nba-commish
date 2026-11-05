import { findCollegeTeamProfile } from '../../../../../services/collegeTeamCatalog';
import { TEAM_COLORS } from '../../../../../constants/teamColors';
import { STATIC_NBA_TEAMS } from '../../../../../data/staticNbaTeams';

export function parseCareerLines(value: string | undefined, activeYear = new Date().getFullYear()): string[] {
  if (!value) return [];
  const currentYear = String(activeYear);
  const normalized = String(value)
    .replace(/As coach:\s*/gi, '')
    .replace(/present/gi, currentYear)
    .replace(/\s+/g, ' ')
    .trim();
  const injected = normalized.replace(/(?=(?:\d{4}\s*[-\u2010-\u2015]\s*(?:\d{4}|\d{2}|present|Present)))/g, '\n');
  return injected
    .split(/\r?\n|[|•]+/g)
    .map(part => part.trim())
    .filter(part => part.length > 0);
}

export function splitCoachingRow(row: string): { years: string; team: string; role: string } {
  const cleaned = row.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(\d{4}(?:\s*[-\u2010-\u2015]\s*(?:\d{4}|\d{2}|present))?)\s*(.*)$/i);
  if (!match) return { years: '—', team: cleaned, role: '—' };
  const remainder = (match[2] ?? '').trim();
  const roleMatch = remainder.match(/\(([^)]+)\)\s*$/);
  const trailingRoleMatch = !roleMatch ? remainder.match(/\b(interim|assistant coach|assistant|head coach)\s*$/i) : null;
  const rawRole = roleMatch?.[1]
    ? roleMatch[1].replace(/^as\s+/i, '').trim()
    : trailingRoleMatch?.[1] ?? 'Head Coach';
  const role = /^assistant$/i.test(rawRole)
    ? 'Assistant Coach'
    : /^interim$/i.test(rawRole)
      ? 'Head Coach'
      : rawRole;
  const teamRaw = roleMatch
    ? remainder.slice(0, roleMatch.index).trim()
    : trailingRoleMatch
      ? remainder.slice(0, trailingRoleMatch.index).trim()
      : remainder;
  const team = teamRaw.replace(/\d{4}$/g, '').trim();
  return { years: match[1].replace(/\s+/g, ' '), team: team || '—', role };
}

export function splitPlayingRow(row: string): { years: string; team: string; position: string } {
  const cleaned = row.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(\d{4}(?:\s*[-\u2010-\u2015]\s*(?:\d{4}|\d{2}|present))?)\s*(.*)$/i);
  if (!match) return { years: '—', team: cleaned, position: '—' };
  const remainder = (match[2] ?? '').trim();
  const posMatch = remainder.match(/\b(PG|SG|SF|PF|C|G|F|FC|GF|PG\/SG|SG\/SF|SF\/PF|PF\/C)\b\s*$/i);
  const position = posMatch?.[1]?.toUpperCase() ?? '—';
  const team = (posMatch ? remainder.slice(0, posMatch.index).trim() : remainder).replace(/\d{4}$/g, '').trim();
  return { years: match[1].replace(/\s+/g, ' '), team: team || '—', position };
}

export function resolveHistoryLogo(teamName: string): string | undefined {
  const exactNba = TEAM_COLORS[teamName]?.logo;
  if (exactNba) return exactNba;
  const college = findCollegeTeamProfile(teamName);
  if (!college) return undefined;
  if (college.name.trim().toLowerCase() !== teamName.trim().toLowerCase()) return undefined;
  return college.logoUrl;
}

export function endYearFromRange(years: string): number {
  const m = years.match(/(\d{4})\s*[-\u2010-\u2015]\s*(\d{4}|\d{2})$/);
  if (m) {
    const start = Number(m[1]);
    const rawEnd = m[2];
    if (rawEnd.length === 4) return Number(rawEnd);
    let end = Math.floor(start / 100) * 100 + Number(rawEnd);
    if (end < start) end += 100;
    return end;
  }
  const single = years.match(/(\d{4})$/);
  return single ? Number(single[1]) : 0;
}

export function startYearFromRange(years: string): number {
  const m = years.match(/^(\d{4})/);
  return m ? Number(m[1]) : 0;
}

export function isCareerRowVisibleInYear(row: string, activeYear: number): boolean {
  const parsed = splitCoachingRow(row);
  const start = startYearFromRange(parsed.years);
  const end = endYearFromRange(parsed.years);
  if (start && start > activeYear) return false;
  if (end && end > activeYear) return false;
  return true;
}

export function isCoachingCareerRow(row: string): boolean {
  const cleaned = row.replace(/\s+/g, ' ').trim();
  if (!cleaned || /^as player:?/i.test(cleaned)) return false;
  const parsed = splitCoachingRow(cleaned);
  if (!startYearFromRange(parsed.years)) return false;
  if (!parsed.team || parsed.team === '—') return false;
  return /\bcoach\b/i.test(parsed.role) || /\bcoach\b/i.test(cleaned) || /\binterim\b/i.test(cleaned);
}

function canonicalCareerTeam(team: string): string {
  const key = team.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = STATIC_NBA_TEAMS.find(candidate =>
    [candidate.abbrev, candidate.fullName, candidate.name, candidate.region]
      .some(value => value.toLowerCase().replace(/[^a-z0-9]/g, '') === key),
  );
  return match?.fullName ?? team.trim();
}

function canonicalCareerRole(role: string): string {
  if (/assistant/i.test(role)) return 'Assistant Coach';
  if (/head coach|interim/i.test(role)) return 'Head Coach';
  return role.trim();
}

export function normalizeCoachingCareerRows(rows: string[], activeYear: number): string[] {
  const grouped = new Map<string, Array<{ start: number; end: number; team: string; role: string }>>();
  for (const row of rows) {
    if (!isCoachingCareerRow(row) || !isCareerRowVisibleInYear(row, activeYear)) continue;
    const parsed = splitCoachingRow(row);
    const start = startYearFromRange(parsed.years);
    const end = endYearFromRange(parsed.years) || start;
    if (!start || !end || start > activeYear) continue;
    const team = canonicalCareerTeam(parsed.team);
    const role = canonicalCareerRole(parsed.role);
    const key = `${team.toLowerCase()}|${role.toLowerCase()}`;
    const group = grouped.get(key) ?? [];
    group.push({ start, end: Math.min(end, activeYear), team, role });
    grouped.set(key, group);
  }

  const merged: Array<{ start: number; end: number; team: string; role: string }> = [];
  for (const group of grouped.values()) {
    const sorted = group.sort((left, right) => left.start - right.start || left.end - right.end);
    for (const row of sorted) {
      const previous = merged[merged.length - 1];
      if (previous && previous.team === row.team && previous.role === row.role && row.start <= previous.end + 1) {
        previous.end = Math.max(previous.end, row.end);
      } else {
        merged.push({ ...row });
      }
    }
  }

  return merged
    .sort((left, right) => right.end - left.end || right.start - left.start)
    .map(row => `${row.start}-${row.end >= activeYear ? 'Present' : row.end} ${row.team} (${row.role})`);
}
