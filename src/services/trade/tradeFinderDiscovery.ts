import type { DraftPick, LeagueStats, NBAPlayer, NBATeam } from '../../types';
import {
  calcOvr2K,
  calcPot2K,
  calcPlayerTV,
  getPickTV,
  isContenderChampionshipCore,
  isOnTradingBlock,
  isRecentlySignedLocked,
  isUntouchable,
  isWalkingExpiring,
  type PickValueContext,
  type TVContext,
} from './tradeValueEngine';
import { DEFAULT_TRADABLE_PICK_SEASONS } from '../draft/DraftPickGenerator';
import { formatPickLabel } from '../draft/draftClassStrength';
import { validateCBATradeRules } from '../../utils/cbaTradeRules';
import { wouldStepienViolateForTid } from './stepienRule';
import { isTradeExcludedPlayer, roleToMode, type TradeOffer, type TradeOfferItem } from './tradeFinderShared';

const MAX_DISCOVERY_OFFERS = 12;
const MAX_PICKS_PER_DUMP = 2;

interface EmptyBasketDumpInput {
  userTid: number;
  players: NBAPlayer[];
  teams: NBATeam[];
  draftPicks: DraftPick[];
  currentYear: number;
  minTradableSeason: number;
  powerRanks: Map<number, number>;
  teamOutlooks: Map<number, { role: string }>;
  tvContext?: TVContext;
  capSpaces?: Map<number, number>;
  classStrengthByYear?: Map<number, number>;
  lotterySlotByTid?: Map<number, number>;
  stepienEnabled?: boolean;
  tradablePickWindow?: number;
  isPostDeadlinePreFA?: boolean;
  recentlySignedLockMs?: { currentDate: string; leagueStats?: LeagueStats };
  allowPbaRoster?: boolean;
}

function fairAnnualSalaryM(k2: number): number {
  if (k2 >= 90) return 50;
  if (k2 >= 85) return 40;
  if (k2 >= 80) return 30;
  if (k2 >= 75) return 22;
  if (k2 >= 70) return 12;
  if (k2 >= 65) return 6;
  if (k2 >= 60) return 3;
  return 1.5;
}

function contractDumpCost(player: NBAPlayer, currentYear: number): number {
  const amountK = player.contract?.amount ?? 0;
  const exp = player.contract?.exp ?? currentYear;
  if (amountK <= 0) return 0;
  const annualM = amountK / 1000;
  const yearsLeft = Math.max(1, exp - currentYear + 1);
  const overpayM = Math.max(0, annualM - fairAnnualSalaryM(calcOvr2K(player)));
  return overpayM * yearsLeft * 0.6;
}

export function generateEmptyBasketDumpOffers(input: EmptyBasketDumpInput): TradeOffer[] {
  const {
    userTid,
    players,
    teams,
    draftPicks,
    currentYear,
    minTradableSeason,
    powerRanks,
    teamOutlooks,
    tvContext,
    capSpaces,
    classStrengthByYear,
    lotterySlotByTid,
    stepienEnabled = false,
    tradablePickWindow = DEFAULT_TRADABLE_PICK_SEASONS,
    isPostDeadlinePreFA = false,
    recentlySignedLockMs,
    allowPbaRoster = false,
  } = input;
  const leagueStats = recentlySignedLockMs?.leagueStats;
  if ((leagueStats as any)?.tradesAllowed === false) return [];

  const userTeam = teams.find(t => t.id === userTid);
  if (!userTeam) return [];

  const capDisabled = leagueStats?.salaryCapEnabled === false;
  const userCapSpaceK = capDisabled ? Number.POSITIVE_INFINITY : (capSpaces?.get(userTid) ?? -Infinity);
  if (!capDisabled && (!Number.isFinite(userCapSpaceK) || userCapSpaceK <= 0)) return [];

  const minLivePickSeason = Math.max(minTradableSeason, currentYear);
  const liveDraftPicks = draftPicks.filter(pk => pk.season >= currentYear);
  const maxRoster = leagueStats?.maxStandardPlayersPerTeam ?? 15;
  const tradableWindow = tradablePickWindow ?? DEFAULT_TRADABLE_PICK_SEASONS;
  const pickCtx: PickValueContext = {
    currentYear,
    totalTeams: teams.length,
    powerRanks,
    classStrengthByYear,
    lotterySlotByTid,
  };
  const isWalking = (player: NBAPlayer) =>
    isWalkingExpiring(player, currentYear, isPostDeadlinePreFA, tvContext?.credibleResignExpiringIds);
  const isLocked = recentlySignedLockMs
    ? (player: NBAPlayer) => isRecentlySignedLocked(player, recentlySignedLockMs.currentDate, recentlySignedLockMs.leagueStats)
    : (_player: NBAPlayer) => false;
  const stepienBlocks = (tid: number, pick: DraftPick, alreadyLeaving: DraftPick[]) =>
    stepienEnabled
    && pick.round === 1
    && wouldStepienViolateForTid(liveDraftPicks, currentYear, tradableWindow, tid, [...alreadyLeaving, pick]);

  const offers: TradeOffer[] = [];

  for (const team of teams) {
    if (team.id === userTid) continue;

    const theirMode = roleToMode(teamOutlooks.get(team.id)?.role ?? 'neutral');
    const roster = players
      .filter(p => p.tid === team.id && !isTradeExcludedPlayer(p, allowPbaRoster))
      .filter(p => !isWalking(p) && !isLocked(p));
    const overflow = Math.max(0, roster.length - maxRoster);
    const teamPicks = liveDraftPicks
      .filter(pk => pk.tid === team.id && pk.season >= minLivePickSeason)
      .map(pick => ({ pick, tv: getPickTV(pick, pickCtx) }))
      .filter(entry => entry.tv > 0)
      .filter(entry => {
        if (entry.pick.round !== 1) return true;
        const knownSlot = entry.pick.season === currentYear
          ? lotterySlotByTid?.get(entry.pick.originalTid)
          : undefined;
        return !(knownSlot && knownSlot <= 14) && entry.tv <= 16;
      })
      .sort((a, b) => a.tv - b.tv);

    const candidates = roster
      .filter(p => (p.contract?.amount ?? 0) > 0)
      .filter(p => (p.contract?.amount ?? 0) <= userCapSpaceK + 100)
      .filter(p => !isUntouchable(p, theirMode, currentYear, tvContext?.mvpRank))
      .filter(p => !isContenderChampionshipCore(p, roster, theirMode, currentYear, tvContext?.mvpRank))
      .map(player => {
        const tv = calcPlayerTV(player, theirMode, currentYear, tvContext);
        const ovr = calcOvr2K(player);
        const pot = calcPot2K(player, currentYear);
        const dumpCost = contractDumpCost(player, currentYear);
        const blockBonus = isOnTradingBlock(player, theirMode, currentYear, false, tvContext?.mvpRank) ? 4 : 0;
        const overflowBonus = overflow > 0 && (tv <= 6 || ovr <= 68) ? 6 + overflow * 3 : 0;
        const score = dumpCost + blockBonus + overflowBonus - Math.max(0, tv) * 0.3;
        return { player, tv, ovr, pot, dumpCost, score, overflowBonus };
      })
      .filter(c => c.tv <= 24)
      .filter(c => c.dumpCost >= 7 || c.overflowBonus > 0 || (c.ovr <= 65 && c.tv <= 5))
      .filter(c => c.score >= 4)
      .sort((a, b) => b.score - a.score);

    for (const candidate of candidates.slice(0, 3)) {
      const compensationTarget = Math.max(
        0,
        Math.min(36, candidate.dumpCost >= 7 ? candidate.dumpCost - Math.max(0, candidate.tv) * 0.45 : 0),
      );
      const chosenPicks: DraftPick[] = [];
      const chosenPickItems: TradeOfferItem[] = [];
      let pickTV = 0;
      let firstRoundPicks = 0;

      if (compensationTarget > 0) {
        for (const entry of teamPicks) {
          if (chosenPicks.length >= MAX_PICKS_PER_DUMP) break;
          if (entry.pick.round === 1 && firstRoundPicks >= 1) continue;
          if (stepienBlocks(team.id, entry.pick, chosenPicks)) continue;
          if (chosenPicks.length === 0 && entry.tv > compensationTarget + 14) continue;
          chosenPicks.push(entry.pick);
          if (entry.pick.round === 1) firstRoundPicks++;
          pickTV += entry.tv;
          chosenPickItems.push({
            id: String(entry.pick.dpid),
            type: 'pick',
            label: formatPickLabel(entry.pick, currentYear, lotterySlotByTid, false),
            val: entry.tv,
            pick: entry.pick,
          });
          if (pickTV >= compensationTarget) break;
        }
      }

      if (compensationTarget > 3 && pickTV < Math.min(8, compensationTarget * 0.5)) continue;
      if (chosenPicks.length === 0 && candidate.overflowBonus <= 0) continue;

      const cba = validateCBATradeRules({
        teamAId: userTid,
        teamBId: team.id,
        teamAPlayers: [],
        teamBPlayers: [candidate.player],
        teamAPicks: [],
        teamBPicks: chosenPicks,
        teams,
        players,
        leagueStats: leagueStats as any,
        currentDate: recentlySignedLockMs?.currentDate ?? '',
        currentYear,
      });
      if (!cba.ok) continue;

      const playerItem: TradeOfferItem = {
        id: candidate.player.internalId,
        type: 'player',
        label: candidate.player.name,
        val: Math.max(0.1, candidate.tv),
        player: candidate.player,
        ovr: candidate.ovr,
        pot: candidate.pot,
      };
      const totalVal = Math.max(1, pickTV + candidate.dumpCost * 0.35 + candidate.overflowBonus - Math.max(0, candidate.tv) * 0.15);
      offers.push({
        tid: team.id,
        variant: 'dump',
        items: [playerItem, ...chosenPickItems],
        totalVal,
      });
      break;
    }
  }

  return offers
    .sort((a, b) => b.totalVal - a.totalVal)
    .slice(0, MAX_DISCOVERY_OFFERS);
}
