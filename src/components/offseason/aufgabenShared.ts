import React from 'react';
import { useGame } from '../../store/GameContext';
import type { GameState } from '../../types';
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
import { getTransferMarketSettings, isInTransferWindow } from '../../utils/transferWindow';
import { getTeamFullName } from '../../utils/teamNames';
import { computeDraftSeasonYear, computeUpcomingSeasonYear } from '../../services/offseason/offseasonState';
import { getCoachContractSnapshot, getTeamStaff } from '../../services/staffService';
import { getHOFCeremonyDateString } from '../../services/playerDevelopment/hofChecker';
import { isSponsorDueForRenewal } from '../../services/tycoon/sponsorshipEngine';

const ENDORSEMENT_SLOT_CAP = 4;
const COACHING_ROLES = ['Head Coach', 'Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'];
const SUPPORT_ROLES = ['Head of Sports Science', 'Head Physio', 'Player Development Coach', 'Chief Scout', 'Head of Analytics'];

type LeagueYearState = Pick<GameState, 'date' | 'leagueStats' | 'offseasonChecklist' | 'schedule'>;

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
  const currentMonth = state.date ? parseGameDate(state.date).getUTCMonth() + 1 : 7;
  const currentYear = state.date ? parseGameDate(state.date).getUTCFullYear() : lsYear;
  let seasonYear = computeUpcomingSeasonYear(currentMonth, currentYear, lsYear);
  let campISO = toISODateString(getTrainingCampDate(seasonYear, ls));
  if (todayNorm && campISO < todayNorm) {
    seasonYear = Math.max(seasonYear + 1, currentYear + 1);
    campISO = toISODateString(getTrainingCampDate(seasonYear, ls));
  }
  return campISO;
}

export function getOffseasonCalendarYear(state: { date?: string; leagueStats?: { year?: number } | null }): number {
  if (state.date) return parseGameDate(state.date).getUTCFullYear();
  return state.leagueStats?.year ?? new Date().getFullYear();
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
  const candidates: string[] = [];
  if (state.offseasonChecklist?.retiredPlayersReview !== 'done') {
    candidates.push(`${offseasonYear}-07-01`);
  }
  if (state.offseasonChecklist?.hofCeremony !== 'done') {
    candidates.push(getHOFCeremonyDateString(offseasonYear));
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
    complete: dueSlots.length === 0 && emptySlotCount === 0 && endorsementCount >= ENDORSEMENT_SLOT_CAP,
  };
}

export function getStaffOpenByGroup(team: any, staff: any, currentYear: number): { coaching: number; support: number } {
  const members: any[] = team?.tycoon?.staffMembers ?? [];
  const fired: string[] = team?.tycoon?.firedStaffRoles ?? [];
  const teamName: string | undefined = team?.name;
  const teamFullName = team ? getTeamFullName(team) : teamName;
  const persistedEntries = members
    .map((m): [string | undefined, any] => [m.role, m])
    .filter((entry): entry is [string, any] => !!entry[0]);
  const persistedByRole = new Map<string, any>(persistedEntries);
  const headCoach = (staff?.coaches ?? []).find(
    (s: any) => (s.team === teamName || s.team === teamFullName) && ((s.position ?? s.jobTitle ?? s.role) === 'Head Coach'),
  );
  const realTeamCoaches = getTeamStaff(teamName ?? '').concat(teamFullName && teamFullName !== teamName ? getTeamStaff(teamFullName) : []);
  const realAssistantSlots = realTeamCoaches
    .filter((s: any) => {
      const pos = String(s.position ?? s.jobTitle ?? s.role ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
      return pos === 'assistant coach' || pos === 'lead assistant coach';
    })
    .filter((s: any) => !members.some(m => m.name === s.name));
  const missingAssistantRoles = COACHING_ROLES
    .filter(role => role.startsWith('Assistant Coach'))
    .filter(role => !fired.includes(role) && !persistedByRole.has(role));
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
  const isOpenOrExpiring = (role: string) => {
    if (fired.includes(role)) return true;
    const persisted = persistedByRole.get(role);
    if (persisted) return (yearsLeftFor(persisted) ?? 0) <= 0;
    if (role === 'Head Coach') {
      if (!headCoach) return true;
      return (yearsLeftFor(headCoach) ?? 1) <= 0;
    }
    if (role.startsWith('Assistant Coach')) {
      const assistant = autoFilledAssistants.get(role);
      if (!assistant) return true;
      return (yearsLeftFor(assistant) ?? 1) <= 0;
    }
    return true;
  };
  return {
    coaching: COACHING_ROLES.filter(isOpenOrExpiring).length,
    support: SUPPORT_ROLES.filter(isOpenOrExpiring).length,
  };
}

export function getTransferWindowProgress(date: string | Date | undefined, leagueStats: any): { current: number; total: number; isLast: boolean; todayIso: string; closeIso: string } | null {
  if (!date) return null;
  const ws = isInTransferWindow(date, leagueStats);
  if (!ws.open || !ws.currentClose || !ws.window) return null;

  const todayIso = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date(date as any).toISOString().slice(0, 10);
  const closeIso = ws.currentClose.toISOString().slice(0, 10);
  const settings = getTransferMarketSettings(leagueStats);
  const startMMDD = ws.window === 'summer' ? settings.summerStart : settings.winterStart;
  const [startMonth, startDay] = startMMDD.split('-').map((n: string) => parseInt(n, 10));
  const todayDate = new Date(`${todayIso}T00:00:00Z`);
  const closeDate = new Date(`${closeIso}T00:00:00Z`);
  let startDate = new Date(Date.UTC(closeDate.getUTCFullYear(), startMonth - 1, startDay));
  if (startDate.getTime() > closeDate.getTime()) {
    startDate = new Date(Date.UTC(closeDate.getUTCFullYear() - 1, startMonth - 1, startDay));
  }
  const msPerDay = 86_400_000;
  const total = Math.max(1, Math.round((closeDate.getTime() - startDate.getTime()) / msPerDay) + 1);
  const current = Math.max(1, Math.min(total, Math.round((todayDate.getTime() - startDate.getTime()) / msPerDay) + 1));
  return { current, total, isLast: current >= total, todayIso, closeIso };
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
    const draftSeasonYear = computeDraftSeasonYear(cMonth, cYear, lsYear);
    const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, cYear, lsYear);
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
