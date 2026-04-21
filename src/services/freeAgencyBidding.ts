/**
 * freeAgencyBidding.ts — FA Bidding Engine for GM Mode
 *
 * Manages competitive free agent offers during the FA period.
 * AI teams generate bids, user submits offers, player decides based on value + desirability.
 *
 * Flow:
 *   1. FA period opens (Jul 1) → generateMarketBids() creates AI team offers for top FAs
 *   2. User views FA, sees competitor bids on "Team Offers" tab
 *   3. User submits their own offer via SigningModal
 *   4. Each sim day during FA → resolveExpiredBids() + generateNewBids()
 *   5. Player decides after ~2-5 days based on best overall offer
 */

import type { NBAPlayer, NBATeam, GameState } from '../types';
import { convertTo2KRating } from '../utils/helpers';
import { getGMAttributes, clampSpendOffer } from './staff/gmAttributes';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FreeAgentBid {
  id: string;
  playerId: string;
  teamId: number;
  teamName: string;
  teamLogoUrl?: string;
  salaryUSD: number;
  years: number;
  option: 'NONE' | 'PLAYER' | 'TEAM';
  isUserBid: boolean;
  submittedDay: number;     // state.day when bid was placed
  expiresDay: number;       // bid expires after this day (player decides)
  status: 'active' | 'accepted' | 'rejected' | 'withdrawn' | 'outbid';
}

export interface FreeAgentMarket {
  playerId: string;
  playerName: string;
  bids: FreeAgentBid[];
  decidesOnDay: number;     // the day the player makes their choice
  resolved: boolean;
}

// ── Bid Generation ───────────────────────────────────────────────────────────

/** Generate a unique bid ID */
function bidId(playerId: string, teamId: number): string {
  return `bid_${playerId}_${teamId}_${Date.now()}`;
}

/**
 * Compute how desirable a team is to a free agent (0-100).
 * Factors: win record, market size, cap space, role opportunity.
 */
export function teamDesirability(
  team: NBATeam,
  player: NBAPlayer,
  players: NBAPlayer[],
  currentYear: number,
): number {
  let score = 50; // neutral baseline

  // Winning matters — players want to compete
  const winPct = (team.wins + team.losses) > 0
    ? team.wins / (team.wins + team.losses)
    : 0.5;
  score += (winPct - 0.5) * 40; // -20 to +20

  // Market size (pop field, if available)
  const pop = (team as any).pop ?? 5;
  score += Math.min(10, pop * 0.8); // up to +10

  // Role opportunity — fewer good players = bigger role
  const teamRoster = players.filter(p => p.tid === team.id);
  const betterPlayers = teamRoster.filter(p => (p.overallRating ?? 0) > (player.overallRating ?? 0)).length;
  score += Math.max(-5, 10 - betterPlayers * 2); // fewer stars above = more appealing

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculate how likely a player accepts an offer (0-100%).
 * Based on: salary vs market value, years, team desirability, competitor bids.
 */
export function calculateAcceptanceProbability(
  bid: FreeAgentBid,
  player: NBAPlayer,
  marketValue: number,
  desirability: number,
  competitorBids: FreeAgentBid[],
): number {
  // Salary ratio: how much are they offering vs market value?
  const salaryRatio = marketValue > 0 ? bid.salaryUSD / marketValue : 1;
  let prob = salaryRatio * 50; // base from salary

  // Desirability bonus (0-100 → 0-25 bonus)
  prob += desirability * 0.25;

  // Years stability bonus
  prob += Math.min(10, bid.years * 2.5);

  // Player option bonus
  if (bid.option === 'PLAYER') prob += 5;
  if (bid.option === 'TEAM') prob -= 3;

  // Competitor pressure: if best competing offer is higher, less likely to accept yours
  const bestCompetitor = competitorBids
    .filter(b => b.id !== bid.id && b.status === 'active')
    .sort((a, b) => b.salaryUSD - a.salaryUSD)[0];

  if (bestCompetitor && bestCompetitor.salaryUSD > bid.salaryUSD) {
    const deficit = (bestCompetitor.salaryUSD - bid.salaryUSD) / marketValue;
    prob -= deficit * 30;
  }

  return Math.max(5, Math.min(99, Math.round(prob)));
}

/**
 * Generate AI team bids for a free agent.
 * Called when the FA market opens or when user views a player.
 */
export function generateAIBids(
  player: NBAPlayer,
  state: GameState,
  maxBids = 3,
): FreeAgentBid[] {
  const bids: FreeAgentBid[] = [];
  const currentYear = state.leagueStats?.year ?? 2026;
  // Only exclude the user's team from AI bidding in GM mode. In commissioner
  // mode there's no "user team" — userTeamId may still be set as the last-managed
  // franchise from a mode switch, but excluding it would silently freeze that
  // franchise out of FA. Sentinel -999 matches AITradeHandler/AIFreeAgentHandler.
  const userTeamId = state.gameMode === 'gm' ? ((state as any).userTeamId ?? -999) : -999;
  const cap = state.leagueStats?.salaryCap ?? 154_600_000;
  const minSalary = (state.leagueStats as any)?.minContractStaticAmount ?? 1_200_000;

  // Get player K2 OVR for salary computation
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const k2 = convertTo2KRating(player.overallRating ?? 60, lastRating?.hgt ?? 50);

  const luxuryTax = (state.leagueStats as any)?.luxuryPayroll ?? cap * 1.18;
  // MLE value: ~8.5% of cap (matches getMLEAvailability rough ceiling)
  const mleUSD = Math.round(cap * 0.085);

  // Only teams with cap space or MLE eligibility
  const eligibleTeams = state.teams
    .filter(t => t.id !== userTeamId) // exclude user's team
    .map(t => {
      const payroll = state.players
        .filter(p => p.tid === t.id && !(p as any).twoWay)
        .reduce((sum, p) => sum + ((p.contract?.amount ?? 0) * 1_000), 0);
      return { team: t, payroll, desirability: teamDesirability(t, player, state.players, currentYear) };
    })
    .filter(({ payroll }) => {
      const capSpace = cap - payroll;
      // Must have at least min salary worth of room, or be MLE-eligible (under tax)
      return capSpace >= minSalary || payroll < luxuryTax;
    })
    .sort((a, b) => b.desirability - a.desirability);

  // Take extra candidates in case some get filtered out by per-offer cap check
  const bidders = eligibleTeams.slice(0, maxBids * 2);

  for (const { team, desirability, payroll } of bidders) {
    if (bids.length >= maxBids) break;

    // Salary based on K2 tier + some randomness
    let pct: number;
    if (k2 >= 95) pct = 0.28 + Math.random() * 0.05;
    else if (k2 >= 90) pct = 0.20 + Math.random() * 0.04;
    else if (k2 >= 85) pct = 0.13 + Math.random() * 0.04;
    else if (k2 >= 80) pct = 0.08 + Math.random() * 0.03;
    else if (k2 >= 75) pct = 0.04 + Math.random() * 0.03;
    else if (k2 >= 70) pct = 0.02 + Math.random() * 0.02;
    else pct = 0.008 + Math.random() * 0.005;

    // Desperate/contending teams bid higher
    if (desirability > 70) pct *= 1.1;

    const capSpace = cap - payroll;
    let salaryUSD = Math.max(minSalary, Math.round(cap * pct));

    // Each team's GM spending attribute (50–100) scales the bid: low spenders lowball, high spenders overpay.
    const teamSpending = getGMAttributes(state, team.id).spending;
    salaryUSD = clampSpendOffer(salaryUSD, teamSpending, Math.round(cap * 0.35));
    salaryUSD = Math.max(minSalary, salaryUSD);

    // Cap-space enforcement: only bid what the team can actually commit
    if (capSpace >= salaryUSD) {
      // Full room — bid stands as computed
    } else if (payroll < luxuryTax && salaryUSD <= mleUSD) {
      // Over cap but under tax — MLE bid is valid as-is
    } else if (capSpace >= minSalary) {
      // Partial room — clamp bid to available cap space
      salaryUSD = capSpace;
    } else {
      // Can't afford even the minimum — skip this team
      continue;
    }
    const years = k2 >= 85 ? (2 + Math.floor(Math.random() * 3)) : k2 >= 75 ? (1 + Math.floor(Math.random() * 3)) : (1 + Math.floor(Math.random() * 2));
    const option: FreeAgentBid['option'] = k2 >= 88 && years >= 3 ? 'PLAYER' : 'NONE';

    bids.push({
      id: bidId(player.internalId, team.id),
      playerId: player.internalId,
      teamId: team.id,
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      salaryUSD,
      years,
      option,
      isUserBid: false,
      submittedDay: state.day,
      expiresDay: state.day + 3 + Math.floor(Math.random() * 3), // 3-5 day decision window
      status: 'active',
    });
  }

  return bids;
}

/**
 * Resolve a player's decision. Called when decidesOnDay is reached.
 * Returns the winning bid (accepted) and marks others as rejected.
 */
export function resolvePlayerDecision(
  market: FreeAgentMarket,
  player: NBAPlayer,
  state: GameState,
): FreeAgentMarket {
  const activeBids = market.bids.filter(b => b.status === 'active');
  if (activeBids.length === 0) return { ...market, resolved: true };

  const currentYear = state.leagueStats?.year ?? 2026;
  const cap = state.leagueStats?.salaryCap ?? 154_600_000;
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const k2 = convertTo2KRating(player.overallRating ?? 60, lastRating?.hgt ?? 50);

  // Market value baseline
  let pct: number;
  if (k2 >= 95) pct = 0.30; else if (k2 >= 90) pct = 0.22; else if (k2 >= 85) pct = 0.15;
  else if (k2 >= 80) pct = 0.10; else if (k2 >= 75) pct = 0.06; else pct = 0.02;
  const marketValue = Math.round(cap * pct);

  // Score each bid
  const scored = activeBids.map(bid => {
    const team = state.teams.find(t => t.id === bid.teamId);
    const desirability = team ? teamDesirability(team, player, state.players, currentYear) : 50;

    // Weighted score: salary 60% + desirability 25% + years 10% + option 5%
    const salaryScore = (bid.salaryUSD / Math.max(1, marketValue)) * 60;
    const desScore = desirability * 0.25;
    const yearsScore = Math.min(10, bid.years * 2);
    const optionScore = bid.option === 'PLAYER' ? 5 : bid.option === 'TEAM' ? -2 : 0;

    return { bid, score: salaryScore + desScore + yearsScore + optionScore };
  }).sort((a, b) => b.score - a.score);

  // Winner is the highest-scored bid
  const winner = scored[0];
  const updatedBids = market.bids.map(b => {
    if (b.id === winner.bid.id) return { ...b, status: 'accepted' as const };
    if (b.status === 'active') return { ...b, status: 'rejected' as const };
    return b;
  });

  return { ...market, bids: updatedBids, resolved: true };
}

/**
 * Compute how competitive a bid is (0-130+%).
 * Uses the same weighted formula as resolvePlayerDecision.
 * baseline = market-rate offer from an average team (des=50, 2yr, NONE) = 76.5
 */
export function computeOfferStrength(
  bid: FreeAgentBid,
  player: NBAPlayer,
  state: GameState,
): number {
  const cap = state.leagueStats?.salaryCap ?? 154_600_000;
  const currentYear = state.leagueStats?.year ?? 2026;
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const k2 = convertTo2KRating(player.overallRating ?? 60, lastRating?.hgt ?? 50);

  let pct: number;
  if (k2 >= 95) pct = 0.30; else if (k2 >= 90) pct = 0.22; else if (k2 >= 85) pct = 0.15;
  else if (k2 >= 80) pct = 0.10; else if (k2 >= 75) pct = 0.06; else pct = 0.02;
  const marketValue = Math.round(cap * pct);

  const team = state.teams.find(t => t.id === bid.teamId);
  const des = team ? teamDesirability(team, player, state.players, currentYear) : 50;

  const salaryScore = (bid.salaryUSD / Math.max(1, marketValue)) * 60;
  const desScore = des * 0.25;
  const yearsScore = Math.min(10, bid.years * 2);
  const optionScore = bid.option === 'PLAYER' ? 5 : bid.option === 'TEAM' ? -2 : 0;
  const raw = salaryScore + desScore + yearsScore + optionScore;
  const baseline = 76.5; // market-rate, avg team, 2yr, NONE
  return Math.round((raw / baseline) * 100);
}
