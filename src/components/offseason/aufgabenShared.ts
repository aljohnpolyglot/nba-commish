import React from 'react';
import { useGame } from '../../store/GameContext';
import type { GameState, OffseasonChecklistRow } from '../../types';
import { ALL_SLOTS, type SponsorshipSlot } from '../../types/tycoon';
import { normalizeDate } from '../../utils/helpers';
import {
  getCurrentOffseasonFAMoratoriumEnd,
  getDraftDate,
  getDraftLotteryDate,
  getTrainingCampDate,
  parseGameDate,
  toISODateString,
} from '../../utils/dateUtils';
import { getTeamFullName } from '../../utils/teamNames';
import { computeDraftSeasonYear, computeUpcomingSeasonYear } from '../../services/offseason/offseasonState';
import { getCoachContractSnapshot, getTeamStaff } from '../../services/staffService';
import { isSponsorDueForRenewal } from '../../services/tycoon/sponsorshipEngine';
import { getActiveTeamStaffMembers, hasPersistedStaffRoster } from '../../services/staff/activeStaffContracts';

const ENDORSEMENT_SLOT_CAP = 4;
const COACHING_ROLES = ['Head Coach', 'Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'];
const SUPPORT_ROLES = ['Head of Sports Science', 'Head Physio', 'Player Development Coach', 'Chief Scout', 'Head of Analytics'];

const canonicalStaffRole = (role: unknown): string => {
  const raw = String(role ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw) return '';
  if (raw === 'head coach') return 'Head Coach';
  if (raw === 'assistant coach' || raw === 'lead assistant coach') return 'Assistant Coach';
  if (raw === 'assistant coach 2') return 'Assistant Coach 2';
  if (raw === 'assistant coach 3') return 'Assistant Coach 3';
  if (raw === 'head of sports science') return 'Head of Sports Science';
  if (raw === 'head physio') return 'Head Physio';
  if (raw === 'player development coach') return 'Player Development Coach';
  if (raw === 'chief scout') return 'Chief Scout';
  if (raw === 'head of analytics') return 'Head of Analytics';
  return String(role ?? '').trim();
};

const staffIdentityKey = (person: any): string => {
  const sourcePlayerId = String(person?.sourcePlayerId ?? '').trim();
  if (sourcePlayerId) return `player:${sourcePlayerId}`;
  const name = String(person?.name ?? '').trim().toLowerCase();
  if (name) return `name:${name}`;
  const id = String(person?.id ?? '').trim();
  return id ? `id:${id}` : '';
};

type LeagueYearState = Pick<GameState, 'date' | 'leagueStats' | 'offseasonChecklist' | 'schedule' | 'internationalTournament' | 'summerLeagueTournament'>;

const INTERNATIONAL_REVIEW_DAY_OFFSETS: Partial<Record<OffseasonChecklistRow, number>> = {
  retiredPlayersReview: -4,
  staffRetirements: -3,
  staffSignings: -2,
};

function addDaysISO(date: string, days: number): string {
  const next = parseGameDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toISODateString(next);
}

export function lsYearOf(state: { leagueStats?: { year?: number } | null }): number {
  return state.leagueStats?.year ?? new Date().getFullYear();
}

export function getUpcomingTrainingCampISO(state: {
  date?: string;
  leagueStats?: any;
}) {
  const ls = state.leagueStats as any;
  const lsYear = lsYearOf(state);
  const todayNorm = state.date ? normalizeDate(state.date) : '';
  if (ls?.uiMode === 'pba_isolated') return todayNorm;
  const currentMonth = state.date ? parseGameDate(state.date).getUTCMonth() + 1 : 7;
  const currentYear = state.date ? parseGameDate(state.date).getUTCFullYear() : lsYear;
  const currentDay = state.date ? parseGameDate(state.date).getUTCDate() : 1;
  const seasonYear = computeUpcomingSeasonYear(currentMonth, currentYear, lsYear, ls, currentDay);
  return toISODateString(getTrainingCampDate(seasonYear, ls));
}

export function getOffseasonCalendarYear(state: { date?: string; leagueStats?: { year?: number } | null }): number {
  if (state.date) return parseGameDate(state.date).getUTCFullYear();
  return state.leagueStats?.year ?? new Date().getFullYear();
}

export function getRetirementClassYear(state: {
  date?: string;
  leagueStats?: { year?: number; uiMode?: string } | null;
}): number {
  // The retirement class belongs to the offseason calendar year. Once the
  // next-season label has advanced (for example 2016-17 on July 5, 2016),
  // leagueStats.year is already one year ahead of the players' retiredYear.
  return getOffseasonCalendarYear(state);
}

export function isPlayerInRetirementClass(
  player: { internalId: string; retiredYear?: number },
  announcedPlayerIds: ReadonlySet<string>,
  visibleClassYears: ReadonlySet<number>,
): boolean {
  const retiredYear = Number(player.retiredYear);
  if (Number.isFinite(retiredYear) && retiredYear > 0) return visibleClassYears.has(retiredYear);
  return announcedPlayerIds.has(player.internalId);
}

export function getInternationalSummerReviewDateISO(
  state: LeagueYearState,
  row: OffseasonChecklistRow,
): string | undefined {
  const offset = INTERNATIONAL_REVIEW_DAY_OFFSETS[row];
  const tournament = state.internationalTournament;
  const calendarYear = getOffseasonCalendarYear(state);
  const isCurrentSummerTournament = tournament?.games.some(game =>
    Number(game.date.slice(0, 4)) === calendarYear,
  );
  if (offset === undefined || !tournament || !isCurrentSummerTournament) return undefined;
  if (state.offseasonChecklist?.internationalTournament === 'skipped') return undefined;
  return addDaysISO(getUpcomingTrainingCampISO(state), offset);
}

export function getEffectivePlayerExpYear(player: any, currentYear: number): number {
  const cyYears = (((player as any).contractYears ?? []) as Array<{ season?: string }>)
    .map(cy => parseInt(String(cy.season ?? '').split('-')[0], 10) + 1)
    .filter(y => Number.isFinite(y));
  const latestCY = cyYears.length > 0 ? Math.max(...cyYears) : 0;
  return Math.max(Number(player?.contract?.exp ?? currentYear), latestCY);
}

export function formatMonthDay(dateLike?: string): string {
  if (!dateLike) return 'soon';
  return parseGameDate(dateLike).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

export function formatOrdinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

export function getNextPostFaTargetISO(state: LeagueYearState): string {
  const campStartISO = getUpcomingTrainingCampISO(state);
  const todayNorm = state.date ? normalizeDate(state.date) : '';
  const offseasonYear = getOffseasonCalendarYear(state);
  const summerLeagueStatus = state.offseasonChecklist?.summerLeague;
  if (summerLeagueStatus === 'pending' || summerLeagueStatus === 'in-progress') {
    const nextSummerLeagueDate = state.summerLeagueTournament?.games
      .filter(game => !game.played)
      .map(game => game.date)
      .sort()[0];
    if (nextSummerLeagueDate && nextSummerLeagueDate < campStartISO) {
      return nextSummerLeagueDate > todayNorm ? nextSummerLeagueDate : todayNorm;
    }
  }
  const tournamentStatus = state.offseasonChecklist?.internationalTournament;
  if (tournamentStatus === 'pending' || tournamentStatus === 'in-progress') {
    const nextTournamentDate = state.internationalTournament?.games
      .filter(game => !game.played)
      .map(game => game.date)
      .sort()[0];
    if (nextTournamentDate && nextTournamentDate < campStartISO) {
      return nextTournamentDate > todayNorm ? nextTournamentDate : todayNorm;
    }
  }
  const candidates: string[] = [];
  if (state.offseasonChecklist?.retiredPlayersReview !== 'done') {
    candidates.push(getInternationalSummerReviewDateISO(state, 'retiredPlayersReview') ?? `${offseasonYear}-07-01`);
  }
  const nextLegacyEvent = candidates
    .filter(d => todayNorm && d > todayNorm && d < campStartISO)
    .sort()[0];
  return nextLegacyEvent ?? campStartISO;
}

function uniqueEndorsementCount(team: any): number {
  return new Set(
    ((team?.tycoon?.oneTimePayouts ?? []) as any[])
      .filter((p: any) => p.kind === 'endorsement')
      .map((p: any) => `${p.year}-${p.brand}-${p.amount}-${p.offerLabel ?? ''}`),
  ).size;
}

export function getSponsorCoverage(team: any, currentYear: number): { dueCount: number; dueCoreCount: number; emptySlotCount: number; endorsementCount: number; complete: boolean } {
  const sponsorships = team?.tycoon?.sponsorships ?? {};
  const dueSlots = ALL_SLOTS.filter(slot => !sponsorships[slot] || isSponsorDueForRenewal(sponsorships[slot], currentYear));
  const dueCoreCount = (['kit', 'sleeve', 'stadium'] as SponsorshipSlot[])
    .reduce((n, slot) => n + (!sponsorships[slot] || isSponsorDueForRenewal(sponsorships[slot], currentYear) ? 1 : 0), 0);
  const emptySlotCount = ALL_SLOTS.reduce((n, slot) => n + (!sponsorships[slot] ? 1 : 0), 0);
  const endorsementCount = uniqueEndorsementCount(team);
  return {
    dueCount: dueSlots.length,
    dueCoreCount,
    emptySlotCount,
    endorsementCount,
    complete: dueSlots.length === 0 && emptySlotCount === 0,
  };
}

export function getStaffOpenByGroup(team: any, staff: any, currentYear: number): { coaching: number; support: number } {
  if (!team) return { coaching: 0, support: 0 };
  const persistedStaffRosterExists = hasPersistedStaffRoster(team);
  const members: any[] = getActiveTeamStaffMembers(team, currentYear);
  const fired = new Set<string>(((team?.tycoon?.firedStaffRoles ?? []) as string[]).map(canonicalStaffRole));
  const teamName: string | undefined = team?.name;
  const teamFullName = team ? getTeamFullName(team) : teamName;
  const persistedEntries = members
    .map((m): [string, any] => [canonicalStaffRole(m.role), m])
    .filter((entry): entry is [string, any] => !!entry[0]);
  const persistedByRole = new Map<string, any>(persistedEntries);
  const headCoach = (staff?.coaches ?? []).find(
    (s: any) => (s.team === teamName || s.team === teamFullName) && ((s.position ?? s.jobTitle ?? s.role) === 'Head Coach'),
  );
  const gm = (staff?.gms ?? []).find((s: any) => s.team === teamName || s.team === teamFullName);
  const activeHeadCoachName = String(persistedByRole.get('Head Coach')?.name ?? headCoach?.name ?? '').trim().toLowerCase();
  const realTeamCoaches = getTeamStaff(teamName ?? '').concat(teamFullName && teamFullName !== teamName ? getTeamStaff(teamFullName) : []);
  const realAssistantSlots = (persistedStaffRosterExists ? [] : realTeamCoaches)
    .filter((s: any) => {
      const pos = String(s.position ?? s.jobTitle ?? s.role ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
      return pos === 'assistant coach' || pos === 'lead assistant coach';
    })
    .filter((s: any) => String(s.name ?? '').trim().toLowerCase() !== activeHeadCoachName)
    .filter((s: any) => !members.some(m => m.name === s.name));
  const missingAssistantRoles = COACHING_ROLES
    .filter(role => role.startsWith('Assistant Coach'))
    .filter(role => !fired.has(role) && !persistedByRole.has(role));
  const autoFilledAssistants = new Map<string, any>();
  missingAssistantRoles.slice(0, realAssistantSlots.length).forEach((role, index) => {
    autoFilledAssistants.set(role, realAssistantSlots[index]);
  });
  const yearsLeftFor = (person: any): number | null => {
    const persistedYears = Number(person?.contractYears);
    if (Number.isFinite(persistedYears)) return Math.max(0, Math.round(persistedYears));
    const contract = getCoachContractSnapshot(person?.name, currentYear);
    if (contract?.yearsLeft != null) return contract.yearsLeft;
    const expYear = Number(person?.contractExp);
    if (Number.isFinite(expYear)) return Math.max(0, Math.round(expYear - currentYear));
    return null;
  };
  const personForRole = (role: string) => {
    const canonicalRole = canonicalStaffRole(role);
    if (fired.has(canonicalRole)) return null;
    const persisted = persistedByRole.get(role);
    if (persisted) return persisted;
    if (role === 'Head Coach') return persistedStaffRosterExists ? null : headCoach ?? null;
    if (role.startsWith('Assistant Coach')) return autoFilledAssistants.get(role) ?? null;
    if (role === 'Chief Scout') return persistedStaffRosterExists ? null : gm ?? { name: 'General Manager', contractYears: 2 };
    return null;
  };
  const dueCounts = { coaching: 0, support: 0 };
  const seenPeople = new Set<string>();
  const addDueForRoles = (roles: readonly string[], group: keyof typeof dueCounts) => {
    for (const role of roles) {
      const canonicalRole = canonicalStaffRole(role);
      const person = personForRole(role);
      const key = staffIdentityKey(person);
      const duplicate = !!key && seenPeople.has(key);
      if (key && !duplicate) seenPeople.add(key);
      const persisted = persistedByRole.get(role);
      const yearsLeft = person ? yearsLeftFor(person) : null;
      const due = fired.has(canonicalRole)
        || !person
        || duplicate
        || ((persisted ? (yearsLeft ?? 0) : (yearsLeft ?? 1)) <= 0);
      if (due) dueCounts[group] += 1;
    }
  };
  addDueForRoles(COACHING_ROLES, 'coaching');
  addDueForRoles(SUPPORT_ROLES, 'support');
  return {
    coaching: dueCounts.coaching,
    support: dueCounts.support,
  };
}

export function useCalendarRowSignals() {
  const { state } = useGame();
  return React.useMemo(() => {
    if (!state.date) return {};
    const ls = state.leagueStats as any;
    const lsYear = lsYearOf(state);
    const todayStr = normalizeDate(state.date);
    const cParsed = parseGameDate(state.date);
    const cMonth = cParsed.getUTCMonth() + 1;
    const cYear = cParsed.getUTCFullYear();
    const cDay = cParsed.getUTCDate();
    const draftSeasonYear = computeDraftSeasonYear(cMonth, cYear, lsYear, ls, cDay);
    const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, cYear, lsYear, ls, cDay);
    const draftStr = toISODateString(getDraftDate(draftSeasonYear, ls));
    const lotteryStr = toISODateString(getDraftLotteryDate(draftSeasonYear, ls));
    const campStr = toISODateString(getTrainingCampDate(upcomingSeasonYear, ls));
    const faOpenStr = toISODateString(getCurrentOffseasonFAMoratoriumEnd(state.date, ls, state.schedule as any));
    return {
      onDraftDay: todayStr === draftStr,
      onLotteryDay: todayStr === lotteryStr,
      onCampOpenDay: todayStr === campStr,
      onFAOpenDay: todayStr === faOpenStr,
    };
  }, [state.date, state.leagueStats, state.schedule]);
}
