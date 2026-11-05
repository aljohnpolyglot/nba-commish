import type { NBATeam, StaffData, StaffMember } from '../../types';
import { PBA_TEAM_DATA } from '../../data/templates/philippines/teamPopulations';

function normalize(value?: string | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function teamLabel(team: NBATeam): string {
  const name = String(team.name ?? '').trim();
  const region = String((team as any).region ?? '').trim();
  return region && name && !name.toLowerCase().includes(region.toLowerCase())
    ? `${region} ${name}`
    : name;
}

function teamKeys(team: NBATeam): string[] {
  return [
    team.name,
    teamLabel(team),
    team.abbrev,
    (team as any).region,
  ].map(normalize).filter(Boolean);
}

function valuesMatchTeam(values: Array<string | undefined>, keys: string[]): boolean {
  return values
    .map(normalize)
    .filter(Boolean)
    .some(value => keys.some(key => value === key || value.includes(key) || key.includes(value)));
}

function memberRole(member: StaffMember): string {
  return normalize(member.role ?? member.jobTitle ?? member.position);
}

function isHeadCoach(member: StaffMember): boolean {
  return memberRole(member) === 'head coach';
}

function isExplicitNonHeadCoach(member: StaffMember): boolean {
  const role = memberRole(member);
  return !!role && (
    role.includes('assistant') ||
    role.includes('physio') ||
    role.includes('science') ||
    role.includes('development') ||
    role.includes('scout') ||
    role.includes('analytics') ||
    role.includes('owner') ||
    role.includes('general manager')
  );
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fallbackCoachName(team: NBATeam): string {
  const firstNames = ['Adrian', 'Bruno', 'Carlos', 'Diego', 'Esteban', 'Javier', 'Luis', 'Marco', 'Rafael', 'Sergio'];
  const lastNames = ['Alonso', 'Cabrera', 'Delgado', 'Herrera', 'Lopez', 'Morales', 'Navarro', 'Ortega', 'Romero', 'Vidal'];
  const seed = hash(`${team.id}-${teamLabel(team)}-${team.abbrev}`);
  return `${firstNames[seed % firstNames.length]} ${lastNames[(seed >>> 4) % lastNames.length]}`;
}

function isPbaTeam(team: NBATeam): boolean {
  const tid = Number((team as any).tid ?? team.id);
  return (team as any).league === 'PBA' || (Number.isFinite(tid) && tid >= 2000 && tid < 2100);
}

function resolvePbaMetaCoach(team: NBATeam): string | undefined {
  if (!isPbaTeam(team)) return undefined;
  const keys = new Set(teamKeys(team));
  const meta = PBA_TEAM_DATA.find(entry => {
    const aliases = [entry.abbrev, entry.region, entry.name, ...entry.aliases].map(normalize).filter(Boolean);
    return aliases.some(alias => keys.has(alias) || [...keys].some(key => key.includes(alias) || alias.includes(key)));
  });
  return meta?.coach;
}

export function resolveHeadCoachMember(team: NBATeam, staff?: StaffData | null): StaffMember | undefined {
  const tycoonHeadCoach = ((team as any).tycoon?.staffMembers ?? [])
    .find((member: StaffMember) => isHeadCoach(member) && member.name);
  if (tycoonHeadCoach?.name) return tycoonHeadCoach;

  const keys = teamKeys(team);
  const matchesTeam = (member: StaffMember) => {
    if (!member?.name || isExplicitNonHeadCoach(member)) return false;
    return valuesMatchTeam([member.team, member.position, member.jobTitle], keys);
  };
  return staff?.coaches?.find(member => isHeadCoach(member) && matchesTeam(member))
    ?? staff?.coaches?.find(matchesTeam);
}

export function resolveHeadCoachName(team: NBATeam, staff?: StaffData | null, season?: number): string {
  void season;
  const member = resolveHeadCoachMember(team, staff);
  if (member?.name) return member.name;

  const pbaMetaCoach = resolvePbaMetaCoach(team);
  if (pbaMetaCoach) return pbaMetaCoach;

  return fallbackCoachName(team);
}
