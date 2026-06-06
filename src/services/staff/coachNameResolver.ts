import type { NBATeam, StaffData, StaffMember } from '../../types';

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

export function resolveHeadCoachName(team: NBATeam, staff?: StaffData | null, season?: number): string {
  const tycoonHeadCoach = ((team as any).tycoon?.staffMembers ?? [])
    .find((member: StaffMember) => isHeadCoach(member) && member.name);
  if (tycoonHeadCoach?.name) return tycoonHeadCoach.name;

  const keys = teamKeys(team);
  const staffCoach = staff?.coaches?.find(member => {
    if (!member?.name || isExplicitNonHeadCoach(member)) return false;
    return valuesMatchTeam([member.team, member.position, member.jobTitle], keys);
  });
  if (staffCoach?.name) return staffCoach.name;

  return fallbackCoachName(team);
}
