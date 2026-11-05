/** FA bidding engine: AI bids, user offers, daily decision resolution. */

import type { NBAPlayer, NBATeam, GameState } from '../types';
import { getDisplayAge, getDisplayOverall } from '../store/playerRatingStore';
import { getGMAttributes, clampSpendOffer, negotiationInterestModifier } from './staff/gmAttributes';
import { SettingsManager } from './SettingsManager';
import {
  computeContractOffer,
  getBiannualExceptionAvailability,
  getCapThresholds,
  getContractLimits,
  getLateCareerMarketAdjustment,
  getMLEAvailability,
  getTeamHardCapUSD,
  getTeamPayrollUSD,
} from '../utils/salaryUtils';
import { resolveBirdRightsForTeam } from '../utils/playerBirdRights';
import { daysBetweenGameDates, getGameDateParts } from '../utils/dateUtils';
import { getWnbaMinimumSalaryUSD } from './wnba/economy';
import type { AspireSideDeal } from './aspireSideDeals';
import { isUnavailableInternationalTournamentPlayer } from '../utils/prospectUtils';

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
  twoWay?: boolean;
  nonGuaranteed?: boolean;
  fundingSource?: 'standard' | 'mle' | 'biannual';
  mleType?: 'room' | 'non_taxpayer' | 'taxpayer' | null;
  aspireSideDeal?: AspireSideDeal;
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
  centralDecisionDay?: number;
  centralDecisionLocked?: boolean;
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

function getSalaryBasisUSD(leagueStats: GameState['leagueStats'] | undefined): number {
  const rawCap = Number((leagueStats as any)?.salaryCap ?? 0);
  if (Number.isFinite(rawCap) && rawCap > 0) return rawCap;
  const historical = Number((leagueStats as any)?.historicalContractScaleCap ?? 0);
  if (Number.isFinite(historical) && historical > 0) return historical;
  return 154_600_000;
}

function getBidMinSalaryUSD(leagueStats: GameState['leagueStats'] | undefined): number {
  const ls = leagueStats as any;
  if (ls?.uiMode === 'wnba_isolated') return getWnbaMinimumSalaryUSD(Number(ls.year), 0);
  if (ls?.minContractType === 'none') return 0;
  const staticMinM = Number(ls?.minContractStaticAmount ?? 1.273);
  if (ls?.minContractType === 'static') return staticMinM * 1_000_000;
  return Math.round(getSalaryBasisUSD(leagueStats) * (staticMinM / 154.6));
}

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
  if (p && (p.tid >= 0 || p.status !== 'Free Agent' || isUnavailableInternationalTournamentPlayer(p))) return false;

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
    const t = [...txns].sort((a, b) => b.season - a.season).find(x => x.tid >= 0 && x.tid < 100);
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
  if (isUnavailableInternationalTournamentPlayer(player)) return [];
  const bids: FreeAgentBid[] = [];
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  // Only exclude the user's team from AI bidding in GM mode. In commissioner
  // mode there's no "user team" — userTeamId may still be set as the last-managed
  // franchise from a mode switch, but excluding it would silently freeze that
  // franchise out of FA. Sentinel -999 matches AITradeHandler/AIFreeAgentHandler.
  const userTeamId = state.gameMode === 'gm' ? ((state as any).userTeamId ?? -999) : -999;
  const cap = getSalaryBasisUSD(state.leagueStats);
  const minSalary = getBidMinSalaryUSD(state.leagueStats);

  // Get player K2 OVR for salary computation
  const k2 = getDisplayOverall(player);

  const thresholds = getCapThresholds(state.leagueStats as any);
  const luxuryTax = thresholds.luxuryTax;
  const capRulesActive = Number.isFinite(thresholds.salaryCap);
  // 2nd-apron derived ceiling — used as an absolute brake so teams already $80M+
  // over the apron can't fire fresh offer sheets (RFA poaching path). Defaults
  // mirror getCapThresholds() so a missing leagueStats override still gates.
  const secondApronUSD = Number.isFinite(thresholds.secondApron)
    ? thresholds.secondApron
    : Number.POSITIVE_INFINITY;
  const apronHardCeilingUSD = secondApronUSD * 1.5;

  // Bird Rights override: prior team can re-sign over cap regardless of payroll.
  const priorTid = getRFAPriorTid(player);
  const playerHasBirdRights = state.leagueStats?.birdRightsEnabled !== false
    && priorTid >= 0
    && resolveBirdRightsForTeam(player, priorTid, currentYear);
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
      const payroll = getTeamPayrollUSD(state.players, t.id, t, currentYear, state.leagueStats as any);
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
      if (capRulesActive && payroll >= apronHardCeilingUSD) return false;
      if (isBirdHolder) return true; // Bird Rights override — prior team always bids
      // Non-Bird-Rights teams over the 2nd apron can't realistically poach via
      // RFA offer sheet either (over-cap, no MLE headroom, no salary-match path).
      if (capRulesActive && payroll >= secondApronUSD) return false;
      const capSpace = cap - payroll;
      const mle = getMLEAvailability(team.id, payroll, 0, thresholds, state.leagueStats as any);
      const mleUSD = Math.max(0, Math.round(mle.available ?? 0));
      const bae = getBiannualExceptionAvailability({
        teamId: team.id,
        payrollUSD: payroll,
        contractSeasons: 2,
        acquisitionType: 'signing',
        season: currentYear,
        currentDate: state.date,
        schedule: state.schedule,
        thresholds,
        leagueStats: state.leagueStats,
      });
      return !capRulesActive || capSpace >= minSalary || payroll < luxuryTax || mleUSD >= minSalary || bae.available >= minSalary;
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

    const age = getDisplayAge(player, currentYear);
    pct *= getLateCareerMarketAdjustment(player, age, k2, k2, currentYear).multiplier;

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
    const bae = getBiannualExceptionAvailability({
      teamId: team.id,
      payrollUSD: payroll,
      contractSeasons: 2,
      acquisitionType: 'signing',
      season: currentYear,
      currentDate: state.date,
      schedule: state.schedule,
      thresholds,
      leagueStats: state.leagueStats,
    });
    const baeUSD = Math.max(0, Math.round(bae.available));
    let salaryUSD = Math.max(minSalary, Math.round(cap * pct));
    let fundingSource: NonNullable<FreeAgentBid['fundingSource']> = 'standard';
    let bidMleType: FreeAgentBid['mleType'];

    // Each team's GM spending attribute (50–100) scales the bid: low spenders lowball, high spenders overpay.
    const teamSpending = getGMAttributes(state, team.id).spending;
    salaryUSD = clampSpendOffer(salaryUSD, teamSpending, Math.round(cap * 0.35));
    salaryUSD = Math.max(minSalary, salaryUSD);
    const contractLimits = getContractLimits(
      isBirdHolder ? ({ ...player, hasBirdRights: true } as NBAPlayer) : player,
      state.leagueStats as any,
    );
    salaryUSD = Math.max(contractLimits.minSalaryUSD, Math.min(contractLimits.maxSalaryUSD, salaryUSD));
    if (declinedTeamOption?.teamId === team.id && declinedTeamOption.salaryUSD > 0) {
      salaryUSD = Math.min(contractLimits.maxSalaryUSD, Math.max(salaryUSD, declinedTeamOption.salaryUSD));
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
      salaryUSD = Math.min(contractLimits.maxSalaryUSD, Math.max(salaryUSD, incumbentFloor));
    }

    // Cap-space enforcement: only bid what the team can actually commit.
    // Bird Rights override: prior team can sign over the cap up to the player's
    // max contract — the only way over-tax contenders re-sign their own stars.
    const teamHardCapUSD = getTeamHardCapUSD(state.leagueStats, thresholds, team.id, currentYear);
    if (payroll + salaryUSD > teamHardCapUSD) {
      continue;
    }
    if (!capRulesActive) {
      // No cap era/rule set — budgets drive the bid, not cap-space exceptions.
    } else if (isBirdHolder) {
      // Bird Rights — bid stands as computed (clamped earlier vs. cap × 0.35)
    } else if (capSpace >= salaryUSD) {
      // Full room — bid stands as computed
    } else if (!bae.blocked && salaryUSD <= baeUSD && (mle.blocked || mleUSD > baeUSD)) {
      fundingSource = 'biannual';
    } else if (payroll < luxuryTax && salaryUSD <= mleUSD) {
      // Over cap but under tax — MLE bid is valid as-is
      fundingSource = 'mle';
      bidMleType = mle.type;
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
    const minYears = Math.max(1, Number((state.leagueStats as any)?.minContractLength ?? 1));
    const maxYears = Math.max(
      minYears,
      Number(isBirdHolder
        ? ((state.leagueStats as any)?.maxContractLengthBird ?? (state.leagueStats as any)?.maxContractLengthStandard ?? 5)
        : ((state.leagueStats as any)?.maxContractLengthStandard ?? 5)),
    );
    years = Math.max(minYears, Math.min(maxYears, years));
    if (fundingSource === 'biannual') years = Math.min(2, years);
    const option: FreeAgentBid['option'] =
      state.leagueStats?.playerOptionsEnabled !== false && k2 >= 88 && years >= 3 ? 'PLAYER' : 'NONE';

    bids.push({
      id: bidId(player.internalId, team.id),
      playerId: player.internalId,
      teamId: team.id,
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      salaryUSD,
      years,
      option,
      fundingSource,
      ...(fundingSource === 'mle' ? { mleType: bidMleType ?? null } : {}),
      isUserBid: false,
      submittedDay: state.day,
      expiresDay: state.day + 3 + Math.floor(Math.random() * 3), // 3-5 day decision window
      status: 'active',
    });
  }

  return bids;
}

function getMarketValuePct(k2: number, player?: NBAPlayer, currentYear?: number): number {
  const base =
    k2 >= 95 ? 0.30 :
    k2 >= 90 ? 0.22 :
    k2 >= 85 ? 0.15 :
    k2 >= 80 ? 0.10 :
    k2 >= 75 ? 0.06 :
    0.02;
  if (!player || !currentYear) return base;
  const age = getDisplayAge(player, currentYear);
  return base * getLateCareerMarketAdjustment(player, age, k2, k2, currentYear).multiplier;
}

interface BidDecisionScoreParts {
  annualScore: number;
  totalScore: number;
  desirabilityScore: number;
  yearsScore: number;
  optionScore: number;
  historyScore: number;
  guaranteeScore: number;
  negotiationScore: number;
  aspireScore: number;
}

function getBidDecisionScoreParts(
  bid: FreeAgentBid,
  player: NBAPlayer,
  state: GameState,
): BidDecisionScoreParts {
  const cap = getSalaryBasisUSD(state.leagueStats);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const k2 = getDisplayOverall(player);
  const marketValue = Math.max(1, Math.round(cap * getMarketValuePct(k2, player, currentYear)));

  const team = state.teams.find(t => t.id === bid.teamId);
  const desirability = team ? teamDesirability(team, player, state.players, currentYear) : 50;
  const history = getBidTeamHistory(bid, player, state);
  const negotiation = getGMAttributes(state, bid.teamId).negotiation;

  const annualRatio = bid.salaryUSD / marketValue;
  const totalRatio = (bid.salaryUSD * Math.max(1, bid.years)) / (marketValue * 2);

  return {
    annualScore: Math.min(78, annualRatio * 40),
    totalScore: Math.min(58, totalRatio * 32),
    desirabilityScore: desirability * 0.18,
    yearsScore: Math.min(8, Math.max(1, bid.years) * 1.4),
    optionScore: bid.option === 'PLAYER' ? 5 : bid.option === 'TEAM' ? -3 : 0,
    historyScore: Math.min(18, history.totalBonus),
    guaranteeScore: (bid.twoWay ? -14 : 0) + (bid.nonGuaranteed ? -7 : 0),
    negotiationScore: negotiationInterestModifier(negotiation) * 83.8,
    aspireScore: bid.aspireSideDeal ? Math.min(35, Math.max(0, bid.aspireSideDeal.risk) * 0.35) : 0,
  };
}

export function computeBidDecisionScore(
  bid: FreeAgentBid,
  player: NBAPlayer,
  state: GameState,
): number {
  const parts = getBidDecisionScoreParts(bid, player, state);
  return parts.annualScore +
    parts.totalScore +
    parts.desirabilityScore +
    parts.yearsScore +
    parts.optionScore +
    parts.historyScore +
    parts.guaranteeScore +
    parts.negotiationScore +
    parts.aspireScore;
}

/** Resolve a player's decision when decidesOnDay is reached. */
export function resolvePlayerDecision(
  market: FreeAgentMarket,
  player: NBAPlayer,
  state: GameState,
): FreeAgentMarket {
  const activeBids = market.bids.filter(b => b.status === 'active');
  if (activeBids.length === 0) return { ...market, resolved: true };

  const scored = activeBids
    .map(bid => ({ bid, score: computeBidDecisionScore(bid, player, state) }))
    .sort((a, b) => b.score - a.score);

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
  const raw = computeBidDecisionScore(bid, player, state);
  const baseline = 83.8; // market-rate, avg team, 2yr, NONE
  const { signingDifficulty = 50 } = SettingsManager.getSettings();
  const diffMult = 1.5 - signingDifficulty / 100; // 0→1.5x easy, 50→1.0x default, 100→0.5x brutal
  return Math.round((raw / baseline) * 100 * diffMult);
}
