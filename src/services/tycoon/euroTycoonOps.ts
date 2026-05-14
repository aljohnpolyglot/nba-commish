import type { GameState, NBATeam, NBAPlayer } from '../../types';
import type { BoardPromise, FinanceRecapLine, SponsorReview, TycoonState } from '../../types/tycoon';
import { ALL_SLOTS } from '../../types/tycoon';
import { getSponsorConflictWarnings } from './sponsorshipEngine';

interface EuroTycoonOpsResult {
  teams: NBATeam[];
  news: any[];
  socialFeed: any[];
}

function daysBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const start = new Date(`${String(a).slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${String(b).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${String(dateIso).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function rosterWages(players: NBAPlayer[], tid: number): number {
  return Math.round(players
    .filter((p: any) => p.tid === tid)
    .reduce((sum, p: any) => sum + ((p.contract?.amount ?? 0) * 1000), 0));
}

function staffWages(tycoon: TycoonState): number {
  return Math.round((tycoon.staffMembers ?? []).reduce((sum, s) => sum + (s.salary ?? 0), 0));
}

function seedPromises(year: number, tycoon: TycoonState): BoardPromise[] {
  return [
    { id: `cash-${year}`, year, type: 'cash', label: 'Keep club cash positive', target: 1, progress: (tycoon.cashOnHand ?? 0) >= 0 ? 1 : 0, status: 'active', confidenceDelta: 8 },
    { id: `medical-${year}`, year, type: 'medical', label: 'Maintain a credible recovery program', target: 450_000, progress: Math.min(1, (tycoon.medicalBudget ?? 0) / 450_000), status: 'active', confidenceDelta: 5 },
    { id: `scouting-${year}`, year, type: 'scouting', label: 'Fund a real scouting department', target: 250_000, progress: Math.min(1, (tycoon.scoutingInvestment ?? 0) / 250_000), status: 'active', confidenceDelta: 5 },
  ];
}

function updateBoardPromises(tycoon: TycoonState, year: number, endDate: string): void {
  const current = tycoon.boardPromises?.some(p => p.year === year)
    ? [...(tycoon.boardPromises ?? [])]
    : [...(tycoon.boardPromises ?? []), ...seedPromises(year, tycoon)];
  const monthDay = endDate.slice(5, 10);
  const shouldGrade = monthDay >= '06-15';
  let confidence = tycoon.boardConfidence ?? 60;

  tycoon.boardPromises = current.map(p => {
    if (p.year !== year || p.status !== 'active') return p;
    const progress = p.type === 'cash' ? ((tycoon.cashOnHand ?? 0) >= 0 ? 1 : 0)
      : p.type === 'medical' ? Math.min(1, (tycoon.medicalBudget ?? 0) / p.target)
      : p.type === 'scouting' ? Math.min(1, (tycoon.scoutingInvestment ?? 0) / p.target)
      : p.progress;
    if (!shouldGrade) return { ...p, progress };
    const status: BoardPromise['status'] = progress >= 0.95 ? 'kept' : 'missed';
    confidence += status === 'kept' ? p.confidenceDelta : -p.confidenceDelta;
    return { ...p, progress, status };
  }).slice(-12);

  if ((tycoon.cashOnHand ?? 0) < -1_000_000) confidence -= 3;
  tycoon.boardConfidence = clampConfidence(confidence);
  tycoon.ownerFiringRisk = tycoon.boardConfidence < 18 || (tycoon.cashOnHand ?? 0) < -6_000_000;
}

function buildSponsorReview(tycoon: TycoonState, year: number): SponsorReview | undefined {
  const openSlots = ALL_SLOTS.filter(slot => tycoon.sponsorships[slot] == null);
  const expiringSlots = ALL_SLOTS.filter(slot => {
    const deal = tycoon.sponsorships[slot];
    return !!deal && deal.yearsRemaining <= 1;
  });
  if (openSlots.length === 0 && expiringSlots.length === 0) return undefined;
  return {
    id: `sponsor-review-${year}-${openSlots.join('_')}-${expiringSlots.join('_')}`,
    year,
    openSlots,
    expiringSlots,
    conflictWarnings: getSponsorConflictWarnings(tycoon),
  };
}

function maybePressConference(state: GameState, team: NBATeam, endDate: string, daysAdvanced: number) {
  const tycoon = team.tycoon;
  if (!tycoon || tycoon.pendingPressConference || daysAdvanced < 3) return null;
  const tid = (team as any).tid ?? team.id;
  const candidates = (state.players ?? [])
    .filter((p: any) => p.tid === tid && !p.retiredYear)
    .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  const player = candidates[0] as any;
  if (!player) return null;
  const seed = String(player.internalId ?? player.pid ?? player.id ?? player.name)
    .split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) + new Date(`${endDate}T00:00:00Z`).getUTCDate();
  if (seed % 6 !== 0 && (tycoon.boardConfidence ?? 60) >= 35) return null;
  return {
    id: `pc-${endDate}-${player.internalId ?? player.pid ?? player.name}`,
    playerId: String(player.internalId ?? player.pid ?? player.id ?? ''),
    playerName: player.name ?? 'A key player',
    headline: `${player.name ?? 'A key player'} wants clarity`,
    prompt: `${player.name ?? 'A key player'} has asked for a public response after questions about role, ambition, and club direction.`,
    options: [
      { id: 'support' as const, label: 'Back the player publicly', boardDelta: -2, moraleDelta: 8 },
      { id: 'discipline' as const, label: 'Demand professionalism', boardDelta: 4, moraleDelta: -5 },
      { id: 'deflect' as const, label: 'Keep it internal', boardDelta: 1, moraleDelta: 1 },
    ],
  };
}

export function applyEuroTycoonDailyOps(
  state: GameState,
  teams: NBATeam[],
  startDate: string,
  endDate: string,
  daysAdvanced: number,
): EuroTycoonOpsResult {
  if (state.leagueStats?.uiMode !== 'euro_isolated' || state.gameMode !== 'gm' || daysAdvanced <= 0) {
    return { teams, news: [], socialFeed: [] };
  }
  const userTeamId = state.userTeamId;
  const teamIndex = teams.findIndex((t: any) => (t.id ?? t.tid) === userTeamId);
  if (teamIndex < 0 || !teams[teamIndex].tycoon) return { teams, news: [], socialFeed: [] };

  const team = { ...teams[teamIndex], tycoon: { ...teams[teamIndex].tycoon! } };
  const tycoon = team.tycoon!;
  const tid = (team as any).tid ?? team.id;
  const news: any[] = [];
  const socialFeed: any[] = [];
  const lines: FinanceRecapLine[] = [];

  const lastPay = tycoon.lastTycoonPayslipDate ?? startDate;
  const duePeriods = Math.floor(daysBetween(lastPay, endDate) / 14);
  let payrollOut = 0;
  if (duePeriods > 0) {
    const playerPayroll = rosterWages(state.players ?? [], tid) / 26;
    const staffPayroll = staffWages(tycoon) / 26;
    payrollOut = Math.round((playerPayroll + staffPayroll) * duePeriods);
    tycoon.cashOnHand = Math.round((tycoon.cashOnHand ?? 0) - payrollOut);
    tycoon.lastTycoonPayslipDate = addDays(lastPay, duePeriods * 14);
    lines.push({ label: `${duePeriods} payroll run${duePeriods === 1 ? '' : 's'}`, amount: -payrollOut, kind: 'expense' });
  }

  const homeGames = (state.schedule ?? []).filter((g: any) => {
    const d = String(g.date ?? '').slice(0, 10);
    return d > startDate.slice(0, 10) && d <= endDate.slice(0, 10) && g.played && g.homeTid === tid;
  }).length;
  if (homeGames > 0) {
    const ticketMult = tycoon.ticketPriceMultiplier ?? 1;
    const matchdayEstimate = Math.round(homeGames * 120_000 * ticketMult * (0.8 + (tycoon.cityPrestige ?? 0.5)));
    lines.push({ label: `${homeGames} home matchday${homeGames === 1 ? '' : 's'} booked`, amount: matchdayEstimate, kind: 'note' });
  }

  updateBoardPromises(tycoon, state.leagueStats.year, endDate);

  const pendingReview = buildSponsorReview(tycoon, state.leagueStats.year);
  if (pendingReview && tycoon.pendingSponsorReview?.id !== pendingReview.id) {
    tycoon.pendingSponsorReview = pendingReview;
    news.push({
      id: `tycoon-sponsor-review-${Date.now()}`,
      headline: 'Sponsor Review Required',
      content: `${team.name} have ${pendingReview.openSlots.length} open sponsor slots and ${pendingReview.expiringSlots.length} expiring deals to review.`,
      date: endDate,
      type: 'league',
      read: false,
      isNew: true,
    });
  }

  const press = maybePressConference(state, team, endDate, daysAdvanced);
  if (press) {
    tycoon.pendingPressConference = press;
    news.push({
      id: `tycoon-press-${Date.now()}`,
      headline: press.headline,
      content: press.prompt,
      date: endDate,
      type: 'player',
      read: false,
      isNew: true,
    });
    socialFeed.push({
      id: `tycoon-social-${Date.now()}`,
      author: 'Euro Hoops Wire',
      handle: '@eurohoopswire',
      content: `${press.playerName} situation now needs a club response. Board confidence: ${tycoon.boardConfidence}/100.`,
      timestamp: endDate,
      likes: 0,
      retweets: 0,
      comments: [],
      read: false,
    });
  }

  const monthKey = endDate.slice(0, 7);
  const financeEnabled = tycoon.financeRecapSettings?.enabled !== false;
  if (financeEnabled && tycoon.financeRecapSettings?.mutedMonth !== monthKey && daysAdvanced >= 3) {
    const cashIn = lines.filter(l => l.kind === 'income').reduce((sum, l) => sum + Math.max(0, l.amount), 0);
    const cashOut = lines.filter(l => l.kind === 'expense').reduce((sum, l) => sum + Math.abs(l.amount), 0);
    tycoon.pendingFinanceRecap = {
      id: `finance-${startDate.slice(0, 10)}-${endDate.slice(0, 10)}`,
      startDate: startDate.slice(0, 10),
      endDate: endDate.slice(0, 10),
      cashIn,
      cashOut,
      net: cashIn - cashOut,
      cashOnHand: tycoon.cashOnHand ?? 0,
      nextPayday: addDays(tycoon.lastTycoonPayslipDate ?? endDate, 14),
      lines: lines.length > 0 ? lines : [{ label: 'No cash events posted in this sim window', amount: 0, kind: 'note' }],
    };
  }

  const nextTeams = [...teams];
  nextTeams[teamIndex] = team;
  return { teams: nextTeams, news, socialFeed };
}
