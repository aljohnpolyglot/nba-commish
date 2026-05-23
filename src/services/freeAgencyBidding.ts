/** FA bidding engine: AI bids, user offers, daily decision resolution. */

import type { NBAPlayer, NBATeam, GameState } from '../types';
import { getDisplayOverall } from '../store/playerRatingStore';
import { getGMAttributes, clampSpendOffer } from './staff/gmAttributes';
import { SettingsManager } from './SettingsManager';
import { hasBirdRights as resolveBirdRights, computeContractOffer, getCapThresholds, getMLEAvailability } from '../utils/salaryUtils';
import { daysBetweenGameDates, getGameDateParts } from '../utils/dateUtils';

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
  submittedDay: number;
  expiresDay: number;
  status: 'active' | 'accepted' | 'rejected' | 'withdrawn' | 'outbid';
  /** AI camp-invite bid: one-year, zero-guarantee deal that can be released free. */
  nonGuaranteed?: boolean;
}

export interface FreeAgentMarket {
  playerId: string;
  playerName: string;
  bids: FreeAgentBid[];
  decidesOnDay: number;
  resolved: boolean;
  /** Season/day stamp for stale-market cleanup. Older saves may not have these. */
  season?: number;
  openedDay?: number;
  openedDate?: string;
  // ── RFA matching offer-sheet support ────────────────────────────────────
  /** Set when the resolved-winning team is NOT the player's prior team AND
   *  the player is a Restricted Free Agent. Suspends final mutation until the
   *  prior team decides match-or-decline. */
  pendingMatch?: boolean;
  /** Sim day by which the prior team must decide. Auto-decline at expiry. */
  pendingMatchExpiresDay?: number;
  /** The team that holds match rights (the player's prior NBA team). */
  pendingMatchPriorTid?: number;
  /** The bid that won the offer-sheet vote — the terms the prior team would match. */
  pendingMatchOfferBidId?: string;
  /** Set true once the prior team matches; the resolved signing flips to priorTid. */
  matchedByPriorTeam?: boolean;
}

export const MAX_FA_MARKET_DECISION_WINDOW_DAYS = 30;

export function isPlausibleActiveMarket(
  market: FreeAgentMarket,
  state: GameState,
  player?: NBAPlayer,
): boolean {
  if (market.resolved) return false;
  const currentDay = state.day ?? 0;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const marketSeason = market.season;

  if (marketSeason != null && marketSeason !== currentYear) return false;
  if ((market.decidesOnDay - currentDay) > MAX_FA_MARKET_DECISION_WINDOW_DAYS) return false;
  if ((currentDay - market.decidesOnDay) > MAX_FA_MARKET_DECISION_WINDOW_DAYS) return false;
  if (market.openedDay != null && (currentDay - market.openedDay) > MAX_FA_MARKET_DECISION_WINDOW_DAYS) return false;

  const p = player ?? state.players.find(pp => pp.internalId === market.playerId);
  if (p && (p.tid >= 0 || p.status !== 'Free Agent')) return false;

  return true;
}

export function getActiveUserBidMarketPlayerIds(state: GameState): Set<string> {
  return new Set(
    (state.faBidding?.markets ?? [])
      .filter(m => !m.resolved && m.bids?.some(b => b.isUserBid && b.status === 'active'))
      .map(m => m.playerId),
  );
}

export interface BidTeamHistory {
  seasonsWithTeam: number;
  championshipsWithTeam: number;
  continuityBonus: number;
  titleBonus: number;
  totalBonus: number;
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

function getTeamChampionshipSeasons(teamId: number, state: GameState): Set<number> {
  const seasons = new Set<number>();

  for (const award of state.historicalAwards ?? []) {
    if (award.type === 'Champion' && Number(award.tid) === teamId) {
      seasons.add(Number(award.season));
    }
  }

  const team = state.teams.find(t => t.id === teamId);
  for (const season of team?.seasons ?? []) {
    if ((season.playoffRoundsWon ?? 0) >= 4) seasons.add(Number(season.season));
  }

  return seasons;
}

export function getBidTeamHistory(
  bid: Pick<FreeAgentBid, 'teamId'>,
  player: NBAPlayer,
  state: GameState,
): BidTeamHistory {
  const seasonsOnTeam = new Set<number>();
  for (const stat of player.stats ?? []) {
    if ((stat as any).playoffs) continue;
    if ((stat.tid ?? -1) !== bid.teamId) continue;
    if ((stat.gp ?? 0) <= 0) continue;
    if (typeof stat.season === 'number') seasonsOnTeam.add(stat.season);
  }

  let seasonsWithTeam = seasonsOnTeam.size;
  if (bid.teamId === player.tid) {
    seasonsWithTeam = Math.max(seasonsWithTeam, Number((player as any).yearsWithTeam ?? 0));
  }

  const championshipSeasons = getTeamChampionshipSeasons(bid.teamId, state);
  let championshipsWithTeam = 0;
  seasonsOnTeam.forEach(season => {
    if (championshipSeasons.has(season)) championshipsWithTeam += 1;
  });

  let continuityBonus = Math.min(10, seasonsWithTeam * 1.5);
  if (bid.teamId === player.tid && seasonsWithTeam > 0) {
    continuityBonus += 6;
  }
  const titleBonus = Math.min(18, championshipsWithTeam * 6);

  return {
    seasonsWithTeam,
    championshipsWithTeam,
    continuityBonus,
    titleBonus,
    totalBonus: continuityBonus + titleBonus,
  };
}

/** Helper: NBA tid (0–29) the player last played for, or -1. Shared with faMarketTicker. */
export function getRFAPriorTid(player: NBAPlayer): number {
  const txns: Array<{ season: number; tid: number }> = (player as any).transactions ?? [];
  if (txns.length > 0) {
    const t = [...txns].sort((a, b) => b.season - a.season).find(x => x.tid >= 0 && x.tid <= 29);
    if (t) return t.tid;
  }
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const s = stats.filter(x => !x.playoffs && (x.gp ?? 0) > 0 && (x.tid ?? -1) >= 0 && (x.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))[0];
  return s ? (s.tid ?? -1) : -1;
}

export function getDeclinedTeamOptionInfo(
  player: NBAPlayer,
  currentYear: number,
): { teamId: number; salaryUSD: number } | null {
  const teamId = Number((player as any).declinedTeamOptionByTid ?? -1);
  const seasonYear = Number((player as any).declinedTeamOptionSeasonYear ?? 0);
  if (teamId < 0 || seasonYear !== currentYear) return null;
  return {
    teamId,
    salaryUSD: Math.max(0, Number((player as any).declinedTeamOptionSalaryUSD ?? 0)),
  };
}

export function generateAIBids(
  player: NBAPlayer,
  state: GameState,
  maxBids = 3,
): FreeAgentBid[] {
  const bids: FreeAgentBid[] = [];
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  // Only exclude the user's team from AI bidding in GM mode. In commissioner
  // mode there's no "user team" — userTeamId may still be set as the last-managed
  // franchise from a mode switch, but excluding it would silently freeze that
  // franchise out of FA. Sentinel -999 matches AITradeHandler/AIFreeAgentHandler.
  const userTeamId = state.gameMode === 'gm' ? ((state as any).userTeamId ?? -999) : -999;
  const cap = state.leagueStats?.salaryCap ?? 154_600_000;
  const minSalary = (state.leagueStats as any)?.minContractStaticAmount
    ? (state.leagueStats as any).minContractStaticAmount * 1_000_000
    : 1_200_000;

  // Get player K2 OVR for salary computation
  const k2 = getDisplayOverall(player);

  const thresholds = getCapThresholds(state.leagueStats as any);
  const luxuryTax = thresholds.luxuryTax;
  // 2nd-apron derived ceiling — used as an absolute brake so teams already $80M+
  // over the apron can't fire fresh offer sheets (RFA poaching path). Defaults
  // mirror getCapThresholds() so a missing leagueStats override still gates.
  const secondApronUSD = cap * (((state.leagueStats as any)?.secondApronPercentage ?? 134.4) / 100);
  const apronHardCeilingUSD = secondApronUSD * 1.5;

  // Bird Rights override: prior team can re-sign over cap regardless of payroll.
  const priorTid = getRFAPriorTid(player);
  const playerHasBirdRights = resolveBirdRights(player) && priorTid >= 0;
  const declinedTeamOption = getDeclinedTeamOptionInfo(player, currentYear);

  // Eligibility: cap space OR MLE-eligible OR Bird Rights with prior team.
  // 90-day cooldown: a team that just waived this player won't bid again immediately.
  // Bird-rights team gets a pass since they've committed to keeping the player.
  const recentlyWaivedBy = (player as any).recentlyWaivedBy as number | undefined;
  const recentlyWaivedDate = (player as any).recentlyWaivedDate as string | undefined;
  const isRecentlyWaivedByTeam = (tid: number): boolean => {
    if (recentlyWaivedBy !== tid || !recentlyWaivedDate || !state.date) return false;
    const days = daysBetweenGameDates(recentlyWaivedDate, state.date);
    return days >= 0 && days < 90;
  };

  const eligibleTeams = state.teams
    .filter(t => t.id !== userTeamId) // exclude user's team
    .map(t => {
      const payroll = state.players
        .filter(p => p.tid === t.id && !(p as any).twoWay)
        .reduce((sum, p) => sum + ((p.contract?.amount ?? 0) * 1_000), 0);
      const isBirdHolder = playerHasBirdRights && t.id === priorTid;
      return {
        team: t,
        payroll,
        desirability: teamDesirability(t, player, state.players, currentYear),
        isBirdHolder,
      };
    })
    .filter(({ team, payroll, isBirdHolder }) => {
      if (isRecentlyWaivedByTeam(team.id)) return false;
      // Aggregate apron ceiling — even Bird-Rights bids stop firing once a team
      // is $80M+ over 2nd apron. Real LAC-2026 pathology: $343M payroll, still
      // bidding on RFA offer sheets and stacking re-signs because per-bid gates
      // never aggregated. Hard ceiling at 2nd apron + 50%.
      if (payroll >= apronHardCeilingUSD) return false;
      if (isBirdHolder) return true; // Bird Rights override — prior team always bids
      // Non-Bird-Rights teams over the 2nd apron can't realistically poach via
      // RFA offer sheet either (over-cap, no MLE headroom, no salary-match path).
      if (payroll >= secondApronUSD) return false;
      const capSpace = cap - payroll;
      const mle = getMLEAvailability(team.id, payroll, 0, thresholds, state.leagueStats as any);
      const mleUSD = Math.max(0, Math.round(mle.available ?? 0));
      return capSpace >= minSalary || payroll < luxuryTax || mleUSD >= minSalary;
    })
    // Bird Rights team gets priority slot via desirability boost so they don't
    // get squeezed out when the candidate slice fills up with cap-rich rivals.
    .sort((a, b) => {
      if (a.isBirdHolder && !b.isBirdHolder) return -1;
      if (!a.isBirdHolder && b.isBirdHolder) return 1;
      return b.desirability - a.desirability;
    });

  // Take 3× max candidates so the cap-affordability filter has something to chew
  // through. Without the wider pool every star ended up with the same 3-team
  // bidding market because only ~3 teams in a multi-season league have real
  // cap room — desirability sort then locks it in.
  const bidders = eligibleTeams.slice(0, Math.max(maxBids * 3, 12));

  for (const { team, desirability, payroll, isBirdHolder } of bidders) {
    if (bids.length >= maxBids) break;

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
    // Bird Rights teams over-pay to retain — incumbents fight harder for their
    // own stars (Mavs / Lakers re-sign at max all the time). +15% on top of base.
    if (isBirdHolder) pct *= 1.15;

    // Mid-season decay — real NBA: post-camp signings are min/NG, December
    // contracts are clearance-rack pricing, by trade deadline it's all 10-day.
    // Without this, faMarketTicker hands out $100M+ deals in November.
    const dStr = state.date;
    if (dStr) {
      const { month: m, day } = getGameDateParts(dStr);
      if (m >= 2 && m <= 6) pct *= 0.20;
      else if (m === 1) pct *= 0.35;
      else if (m === 11 || m === 12 || (m === 10 && day >= 22)) pct *= 0.55;
    }

    const capSpace = cap - payroll;
    const mle = getMLEAvailability(team.id, payroll, 0, thresholds, state.leagueStats as any);
    const mleUSD = Math.max(0, Math.round(mle.available ?? 0));
    let salaryUSD = Math.max(minSalary, Math.round(cap * pct));

    // Each team's GM spending attribute (50–100) scales the bid: low spenders lowball, high spenders overpay.
    const teamSpending = getGMAttributes(state, team.id).spending;
    salaryUSD = clampSpendOffer(salaryUSD, teamSpending, Math.round(cap * 0.35));
    salaryUSD = Math.max(minSalary, salaryUSD);
    if (declinedTeamOption?.teamId === team.id && declinedTeamOption.salaryUSD > 0) {
      salaryUSD = Math.max(salaryUSD, declinedTeamOption.salaryUSD);
    }

    // Bird Rights stars — incumbents max out for their own. Real NBA: LAL/MAVS/etc.
    // offer max contract to retain LeBron/Doncic-tier players. The pct + spending
    // clamp above can lowball incumbents (low-spending GM attribute swallowing the
    // +15% premium); for K2 ≥ 85 with Bird Rights, force at least the player's
    // computed market value as a floor so incumbents don't lose their stars on a
    // cheaper bid than the open-market team is offering.
    if (isBirdHolder && k2 >= 85) {
      const marketOffer = computeContractOffer(player, state.leagueStats as any);
      const incumbentFloor = Math.round(marketOffer.salaryUSD * 1.05); // 5% over market value
      salaryUSD = Math.max(salaryUSD, incumbentFloor);
    }

    // Cap-space enforcement: only bid what the team can actually commit.
    // Bird Rights override: prior team can sign over the cap up to the player's
    // max contract — the only way over-tax contenders re-sign their own stars.
    if (isBirdHolder) {
      // Bird Rights — bid stands as computed (clamped earlier vs. cap × 0.35)
    } else if (capSpace >= salaryUSD) {
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
    let years: number;
    if (k2 >= 85) years = 2 + Math.floor(Math.random() * 3);
    else if (k2 >= 75) years = 1 + Math.floor(Math.random() * 3);
    else years = 1 + Math.floor(Math.random() * 2);
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

function getMarketValuePct(k2: number): number {
  if (k2 >= 95) return 0.30;
  if (k2 >= 90) return 0.22;
  if (k2 >= 85) return 0.15;
  if (k2 >= 80) return 0.10;
  if (k2 >= 75) return 0.06;
  return 0.02;
}

/** Resolve a player's decision when decidesOnDay is reached. */
export function resolvePlayerDecision(
  market: FreeAgentMarket,
  player: NBAPlayer,
  state: GameState,
): FreeAgentMarket {
  const activeBids = market.bids.filter(b => b.status === 'active');
  if (activeBids.length === 0) return { ...market, resolved: true };

  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const cap = state.leagueStats?.salaryCap ?? 154_600_000;
  const k2 = getDisplayOverall(player);
  const marketValue = Math.round(cap * getMarketValuePct(k2));

  // Score each bid
  const scored = activeBids.map(bid => {
    const team = state.teams.find(t => t.id === bid.teamId);
    const desirability = team ? teamDesirability(team, player, state.players, currentYear) : 50;
    const history = getBidTeamHistory(bid, player, state);

    // Weighted score: salary 60% + desirability 25% + years 10% + option 5%
    const salaryScore = (bid.salaryUSD / Math.max(1, marketValue)) * 60;
    const desScore = desirability * 0.25;
    const yearsScore = Math.min(10, bid.years * 2);
    const optionScore = bid.option === 'PLAYER' ? 5 : bid.option === 'TEAM' ? -2 : 0;
    const historyScore = history.totalBonus;

    return { bid, score: salaryScore + desScore + yearsScore + optionScore + historyScore };
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

/** Bid competitiveness 0–130+%, mirrors resolvePlayerDecision weighting. */
export function computeOfferStrength(
  bid: FreeAgentBid,
  player: NBAPlayer,
  state: GameState,
): number {
  const cap = state.leagueStats?.salaryCap ?? 154_600_000;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const k2 = getDisplayOverall(player);
  const marketValue = Math.round(cap * getMarketValuePct(k2));

  const team = state.teams.find(t => t.id === bid.teamId);
  const des = team ? teamDesirability(team, player, state.players, currentYear) : 50;
  const history = getBidTeamHistory(bid, player, state);

  const salaryScore = (bid.salaryUSD / Math.max(1, marketValue)) * 60;
  const desScore = des * 0.25;
  const yearsScore = Math.min(10, bid.years * 2);
  const optionScore = bid.option === 'PLAYER' ? 5 : bid.option === 'TEAM' ? -2 : 0;
  const raw = salaryScore + desScore + yearsScore + optionScore + history.totalBonus;
  const baseline = 76.5; // market-rate, avg team, 2yr, NONE
  const { signingDifficulty = 50 } = SettingsManager.getSettings();
  const diffMult = 1.5 - signingDifficulty / 100; // 0→1.5x easy, 50→1.0x default, 100→0.5x brutal
  return Math.round((raw / baseline) * 100 * diffMult);
}
