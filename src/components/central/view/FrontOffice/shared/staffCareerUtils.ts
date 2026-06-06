import { findCollegeTeamProfile } from '../../../../../services/collegeTeamCatalog';
import { TEAM_COLORS } from '../../../../../constants/teamColors';

export function parseCareerLines(value: string | undefined): string[] {
  if (!value) return [];
  const currentYear = String(new Date().getFullYear());
  const normalized = String(value)
    .replace(/As coach:\s*/gi, '')
    .replace(/present/gi, currentYear)
    .replace(/\s+/g, ' ')
    .trim();
  const injected = normalized.replace(/(?=(?:\d{4}\s*[-\u2010-\u2015]\s*(?:\d{4}|present|Present)))/g, '\n');
  return injected
    .split(/\r?\n|[|•]+/g)
    .map(part => part.trim())
    .filter(part => part.length > 0);
}

export function splitCoachingRow(row: string): { years: string; team: string; role: string } {
  const cleaned = row.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(\d{4}(?:\s*[-\u2010-\u2015]\s*\d{4})?)\s*(.*)$/i);
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
  const match = cleaned.match(/^(\d{4}(?:\s*[-\u2010-\u2015]\s*\d{4})?)\s*(.*)$/i);
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
  const m = years.match(/(\d{4})\s*[-\u2010-\u2015]\s*(\d{4})$/);
  if (m) return Number(m[2]);
  const single = years.match(/(\d{4})$/);
  return single ? Number(single[1]) : 0;
}
