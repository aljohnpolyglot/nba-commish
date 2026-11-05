import type { NonNBATeam, StaffMember } from '../../types';
import { getTeamCountry } from '../../utils/teamCountry';
import { getTeamFullName } from '../../utils/teamNames';
import { displayStaffRole, finalizeStaffStint, stampStaffHireCareer } from '../staff/staffCareerRows';
import { toStaffFreeAgent } from './staffPool';
import { inferEuroStaffLeagueId, isEuroStaffLeagueId } from './staffPool';
import { europeanCoachTeamMatchScore } from './historicalCoachSource';
import { getStaffMarketSalary } from '../tycoon/economyScale';

const COACHING_ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Assistant Coach 2',
  'Assistant Coach 3',
  'Player Development Coach',
] as const;
const COACHING_POOL_ROLES = new Set(['Head Coach', 'Assistant Coach', 'Player Development Coach', 'Youth Coach']);

type HistoryEntry = { text: string; date: string; type: 'Personnel'; tid: number };

export type EuroCoachHiringResult = {
  teams: NonNBATeam[];
  historyEntries: HistoryEntry[];
  freeAgents: StaffMember[];
  consumedFreeAgentIds: string[];
};

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const baseRole = (value: unknown): string => String(value ?? '').replace(/ \d+$/, '').trim();

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function matchingPreference(member: StaffMember, team: NonNBATeam) {
  return (member.historicalClubPreferences ?? [])
    .filter(preference => europeanCoachTeamMatchScore(preference.team, team) >= 32)
    .sort((left, right) => right.endYear - left.endYear || right.tenureYears - left.tenureYears)[0];
}

function contractYears(member: StaffMember, team: NonNBATeam): number {
  const tenure = matchingPreference(member, team)?.tenureYears
    ?? member.sourceObservedTenureYears
    ?? member.salaryAskYears
    ?? member.contractYears
    ?? 2;
  return Math.max(1, Math.min(5, Math.round(tenure)));
}

function originalClubPreferenceApplies(member: StaffMember, team: NonNBATeam, year: number): boolean {
  if (!matchingPreference(member, team)) return false;
  return hash(`${member.id ?? member.name}|${team.tid}|${year}|original-club`) % 100 < 80;
}

function isLocalCandidate(member: StaffMember, team: NonNBATeam, teams: NonNBATeam[]): boolean {
  const country = getTeamCountry(team, { nonNBATeams: teams });
  return Boolean(country && normalize(member.nationality) === normalize(country));
}

function candidateScore(member: StaffMember, team: NonNBATeam, teams: NonNBATeam[], role: string, year: number): number {
  const rating = Number(member.rating ?? member.reputation ?? 50);
  const originalClubBonus = originalClubPreferenceApplies(member, team, year) ? 300 : 0;
  const nationalityBonus = isLocalCandidate(member, team, teams) ? 24 : 0;
  const sourceRoleBonus = baseRole(member.role ?? member.position ?? member.jobTitle) === baseRole(role) ? 8 : 0;
  const tieBreak = (hash(`${member.id ?? member.name}|${team.tid}|${role}|${year}`) % 1000) / 1000;
  return rating + originalClubBonus + nationalityBonus + sourceRoleBonus + tieBreak;
}

function hireCandidate(
  team: NonNBATeam,
  role: string,
  year: number,
  teams: NonNBATeam[],
  pool: StaffMember[],
  consumed: Set<string>,
  employedNames: Set<string>,
  economyScale: number,
): StaffMember | null {
  const leagueId = inferEuroStaffLeagueId(team.tid, 'modded', { teamLeague: team.league, uiMode: 'euro_isolated' });
  const candidate = pool
    .filter(member => !member.id || !consumed.has(member.id))
    .filter(member => !employedNames.has(normalize(member.name)))
    .filter(member => !member.leagueId || isEuroStaffLeagueId(member.leagueId))
    .filter(member => COACHING_POOL_ROLES.has(baseRole(member.role ?? member.position ?? member.jobTitle)))
    .sort((left, right) => candidateScore(right, team, teams, role, year) - candidateScore(left, team, teams, role, year))[0];
  if (!candidate) return null;
  if (candidate.id) consumed.add(candidate.id);
  employedNames.add(normalize(candidate.name));
  const rating = Number(candidate.rating ?? candidate.reputation ?? 55);
  return stampStaffHireCareer({
    ...candidate,
    role,
    position: role,
    jobTitle: role,
    team: getTeamFullName(team),
    teamLogoUrl: team.imgURL,
    leagueId,
    contractYears: contractYears(candidate, team),
    hiredYear: year,
    roleStartYear: year,
    yearsWithTeam: 0,
    salary: getStaffMarketSalary(team.tycoon?.tier, role, rating, {
      market: 'euro',
      economyScale,
      yearsExperience: Math.max(1, year - Number(candidate.careerStartYear ?? year)),
      yearsWithTeam: 0,
    }),
    isPlaceholder: false,
  }, role, getTeamFullName(team), year);
}

export function processEuroCoachHiring(
  teams: NonNBATeam[],
  year: number,
  date: string,
  userTeamId: number | null | undefined,
  staffFreeAgents: StaffMember[],
  economyScale = 1,
): EuroCoachHiringResult {
  const historyEntries: HistoryEntry[] = [];
  const freeAgents: StaffMember[] = [];
  const consumed = new Set<string>();
  const activeTeam = teams.find(team => team.tid === userTeamId);
  const activeLeagueId = activeTeam
    ? inferEuroStaffLeagueId(activeTeam.tid, 'modded', { teamLeague: activeTeam.league, uiMode: 'euro_isolated' })
    : null;
  const employedNames = new Set(teams.flatMap(team => ((team.tycoon?.staffMembers ?? []) as StaffMember[]).map(member => normalize(member.name))).filter(Boolean));
  const nextTeams = teams.map(team => {
    const leagueId = inferEuroStaffLeagueId(team.tid, 'modded', { teamLeague: team.league, uiMode: 'euro_isolated' });
    if (!activeLeagueId || leagueId !== activeLeagueId || team.tid === userTeamId || !team.tycoon) return team;
    const teamName = getTeamFullName(team);
    const existing = (team.tycoon.staffMembers ?? []) as StaffMember[];
    const supportStaff = existing.filter(member => !(COACHING_ROLES as readonly string[]).includes(String(member.role ?? member.position ?? member.jobTitle)));
    const coachingStaff: StaffMember[] = [];

    for (const role of COACHING_ROLES) {
      const current = existing.find(member => String(member.role ?? member.position ?? member.jobTitle) === role);
      if (current) {
        const remaining = Math.max(0, Math.round(current.contractYears ?? 1) - 1);
        if (remaining > 0) {
          coachingStaff.push({ ...current, contractYears: remaining, yearsWithTeam: Math.max(0, Number(current.yearsWithTeam ?? 0) + 1) });
          continue;
        }
        const rating = Number(current.rating ?? current.reputation ?? 55);
        const localBonus = isLocalCandidate(current, team, teams) ? 8 : 0;
        const extensionChance = originalClubPreferenceApplies(current, team, year)
          ? 80
          : Math.max(30, Math.min(82, Math.round(rating + localBonus - 10)));
        if (hash(`${current.id ?? current.name}|${team.tid}|${year}|extension`) % 100 < extensionChance) {
          const years = contractYears(current, team);
          const yearsWithTeam = Math.max(0, Number(current.yearsWithTeam ?? 0) + 1);
          coachingStaff.push({
            ...current,
            contractYears: years,
            yearsWithTeam,
            salary: getStaffMarketSalary(team.tycoon.tier, role, rating, {
              market: 'euro',
              economyScale,
              yearsExperience: Math.max(1, year - Number(current.careerStartYear ?? year)),
              yearsWithTeam,
            }),
          });
          historyEntries.push({ text: `${current.name} signed a ${years}-year extension with ${teamName}.`, date, type: 'Personnel', tid: team.tid });
          continue;
        }
        const finalized = finalizeStaffStint({ ...current, contractYears: 0 }, role, teamName, year);
        freeAgents.push(toStaffFreeAgent(finalized, leagueId, current.id ?? `euro-coach-fa-${team.tid}-${normalize(current.name)}-${year}`));
        employedNames.delete(normalize(current.name));
        historyEntries.push({ text: `${current.name}'s contract with ${teamName} expired.`, date, type: 'Personnel', tid: team.tid });
      }

      const hire = hireCandidate(team, role, year, teams, staffFreeAgents, consumed, employedNames, economyScale);
      if (hire) {
        coachingStaff.push(hire);
        historyEntries.push({ text: `${teamName} hired ${hire.name} as ${displayStaffRole(role)}.`, date, type: 'Personnel', tid: team.tid });
      }
    }

    return { ...team, tycoon: { ...team.tycoon, staffMembers: [...coachingStaff, ...supportStaff] } } as NonNBATeam;
  });

  return {
    teams: nextTeams,
    historyEntries,
    freeAgents,
    consumedFreeAgentIds: [...consumed],
  };
}
