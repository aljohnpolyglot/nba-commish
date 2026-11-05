import type { GameState, HistoryEntry, NBAPlayer } from '../types';
import { calculateSocialEngagement } from '../utils/helpers';
import { clearWaiverMarkers } from '../utils/contractCleanup';
import { areTwoWayContractsEnabled, isTwoWayContract } from '../utils/contractTypes';
import { appendPlayerTransaction } from '../utils/playerBirdRights';
import { computeTradeEligibleDate } from '../utils/signingMoratorium';
import { formatContractTotalUSD, getCapThresholds, getContractLimits, getMLEAvailability, getTeamPayrollUSD, hasBirdRights } from '../utils/salaryUtils';
import { isRfaMatchingEnabled } from '../utils/ruleFlags';
import { getTwoWayRosterLimit } from '../utils/rosterLimits';
import { parseGameDate } from '../utils/dateUtils';
import { getInsiderHandle } from '../data/social/handles';
import { buildShamsTransactionPost } from './social/templates/charania';
import { findShamsPhoto } from './social/charaniaphotos';
import {
  generateAIBids,
  getRFAPriorTid,
  resolvePlayerDecision,
  type FreeAgentBid,
  type FreeAgentMarket,
} from './freeAgencyBidding';
import type { MarketTickResult } from './faMarketTickerTypes';
import { getK2, lastYearOptionLabel, optionTag } from './faMarketTickerUtils';
import { getPrimaryInsiderKey, isTwitterAvailable } from '../utils/mediaTimeline';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalBaseStipendUSD,
  isWnbaDevelopmentalServiceEligible,
} from './wnba/developmentalContracts';
import { isPlayerRestrictedFreeAgent } from './freeAgency/rfaEligibility';
import { rfaOfferSheetSalaries } from './freeAgency/rfaOfferSheetSalaries';
import { formatCurrencyWithCode } from '../utils/helpers';

type MleType = 'room' | 'non_taxpayer' | 'taxpayer' | null;

interface ResolutionContext {
  state: GameState;
  currentDay: number;
  currentYear: number;
  workingMarkets: FreeAgentMarket[];
  signedPlayerIds: Set<string>;
  playerMutations: Map<string, Partial<NBAPlayer>>;
  historyEntries: HistoryEntry[];
  newsItems: any[];
  socialPosts: any[];
  userBidResolutions: MarketTickResult['userBidResolutions'];
  rfaOfferSheets: MarketTickResult['rfaOfferSheets'];
  rfaMatchResolutions: MarketTickResult['rfaMatchResolutions'];
  aspireOutcomes: MarketTickResult['aspireOutcomes'];
  userBidRejectedByLegality: Set<string>;
  effectiveMaxRoster: number;
  resolutionMaxYears: number;
  moratoriumActive: boolean;
  moratoriumEndDay: number;
  emitUserBidRejection: (market: FreeAgentMarket, playerName: string, opts: { winnerTeamName?: string; reason?: string }) => void;
  newlyCommittedForTeam: (teamId: number) => number;
  getProjectedStandardRosterCount: (teamId: number) => number;
  getMleTypeForBid: (bid: FreeAgentBid, player: NBAPlayer, payrollUSD: number) => MleType;
  getBaeForBid: (bid: FreeAgentBid, player: NBAPlayer, payrollUSD: number) => boolean;
  consumeMleForBid: (teamId: number, type: MleType, salaryUSD: number) => void;
  consumeBaeForBid: (teamId: number, salaryUSD: number) => void;
  recordCapSpaceForBid: (teamId: number) => void;
  getHardCapForTeam: (teamId: number) => number;
  localMleUsage: NonNullable<GameState['leagueStats']>['mleUsage'];
  includeDerivedMedia: boolean;
}

export function resolveDueMarkets(ctx: ResolutionContext): void {
  const sanitizeBidOption = (option: FreeAgentBid['option']): FreeAgentBid['option'] =>
    option === 'PLAYER' && ctx.state.leagueStats?.playerOptionsEnabled === false ? 'NONE' : option;

  const getBidResolutionBlockReason = (bid: FreeAgentBid, player: NBAPlayer): string | null => {
    const team = ctx.state.teams.find(t => t.id === bid.teamId);
    if (!team) return 'team is no longer available';
    if (bid.nonGuaranteed && ctx.state.leagueStats?.nonGuaranteedContractsEnabled === false) {
      return 'non-guaranteed contracts are not available under current league rules';
    }
    if (bid.twoWay) {
      const maxTwoWay = getTwoWayRosterLimit(ctx.state.leagueStats as any);
      if (!areTwoWayContractsEnabled(ctx.state.leagueStats) || maxTwoWay <= 0) {
        return 'two-way contracts are not available under current league rules';
      }
      if (areWnbaDevelopmentalContractsEnabled(ctx.state.leagueStats)
        && !isWnbaDevelopmentalServiceEligible(player, ctx.currentYear, ctx.state.leagueStats)) {
        return 'the player is not eligible for a developmental contract';
      }
      const existingTwoWay = ctx.state.players.filter(p => p.tid === bid.teamId && isTwoWayContract(p, ctx.state.leagueStats)).length;
      const pendingTwoWay = Array.from(ctx.playerMutations.values()).filter(mutation => mutation.tid === bid.teamId && isTwoWayContract(mutation, ctx.state.leagueStats)).length;
      if (existingTwoWay + pendingTwoWay >= maxTwoWay) {
        return `your two-way slots are full (${maxTwoWay}/${maxTwoWay}) for the new season`;
      }
      return null;
    }
    if (!bid.twoWay && ctx.getProjectedStandardRosterCount(bid.teamId) >= ctx.effectiveMaxRoster) {
      return `your standard roster is full (${ctx.effectiveMaxRoster}/${ctx.effectiveMaxRoster}) for the new season`;
    }
    const thresholds = getCapThresholds(ctx.state.leagueStats as any);
    const payroll = getTeamPayrollUSD(ctx.state.players, bid.teamId, team, ctx.currentYear, ctx.state.leagueStats as any) + ctx.newlyCommittedForTeam(bid.teamId);
    if (payroll + bid.salaryUSD > ctx.getHardCapForTeam(bid.teamId)) {
      return 'would exceed the team’s hard cap';
    }
    const priorTid = getRFAPriorTid(player);
    if (ctx.state.leagueStats?.birdRightsEnabled !== false && bid.teamId === priorTid && hasBirdRights(player)) return null;
    const capSpace = thresholds.salaryCap - payroll;
    if (bid.fundingSource === 'biannual') {
      return ctx.getBaeForBid(bid, player, payroll)
        ? null
        : 'no longer fits the remaining bi-annual exception';
    }
    if (capSpace >= bid.salaryUSD || !!ctx.getMleTypeForBid(bid, player, payroll)) return null;
    return 'no longer fits your cap space or exception room for the new season';
  };

  const resolutionOrder = ctx.workingMarkets
    .map((market, index) => {
      const player = ctx.state.players.find(candidate => candidate.internalId === market.playerId);
      return {
        index,
        playerId: market.playerId,
        k2: player ? getK2(player) : Number.NEGATIVE_INFINITY,
      };
    })
    .sort((left, right) => right.k2 - left.k2 || left.playerId.localeCompare(right.playerId));

  for (const { index: i } of resolutionOrder) {
    let market = ctx.workingMarkets[i];
    const hadUserBidForLog = market.bids.some(b => b.isUserBid);
    if (market.resolved) {
      if (hadUserBidForLog) console.log(`[FA-RESOLVE] Skipping ${market.playerName ?? market.playerId} — already resolved.`);
      continue;
    }
    if (market.pendingMatch) continue;
    if (!ctx.state.faResolveAllToday && (market.decidesOnDay ?? 0) > ctx.currentDay) {
      if (hadUserBidForLog) console.log(`[FA-RESOLVE] Skipping ${market.playerName ?? market.playerId} — decidesOnDay=${market.decidesOnDay} > currentDay=${ctx.currentDay}.`);
      continue;
    }
    if (ctx.moratoriumActive) {
      if (hadUserBidForLog) console.log(`[FA-RESOLVE] Skipping ${market.playerName ?? market.playerId} — moratorium active.`);
      continue;
    }
    if (hadUserBidForLog) {
      console.log(`[FA-RESOLVE] Resolving ${market.playerName ?? market.playerId} — currentDay=${ctx.currentDay}, decidesOnDay=${market.decidesOnDay}, bids=${market.bids.length}, activeBids=${market.bids.filter(b => b.status === 'active').length}`);
    }

    const player = ctx.state.players.find(p => p.internalId === market.playerId);
    if (!player) {
      ctx.emitUserBidRejection(market, market.playerName ?? 'Unknown', { reason: 'is no longer available' });
      ctx.workingMarkets[i] = { ...market, resolved: true };
      continue;
    }
    if (player.tid >= 0) {
      const winnerName = ctx.state.teams.find(t => t.id === player.tid)?.name ?? 'another team';
      ctx.emitUserBidRejection(market, player.name, { winnerTeamName: winnerName });
      ctx.workingMarkets[i] = { ...market, resolved: true };
      continue;
    }

    const legalBids = market.bids.map(bid => {
      if (bid.status !== 'active') return bid;
      const blockReason = getBidResolutionBlockReason(bid, player);
      if (!blockReason) return bid;
      if (bid.isUserBid) {
        ctx.emitUserBidRejection(market, player.name, { reason: blockReason });
        ctx.userBidRejectedByLegality.add(market.playerId);
        return { ...bid, status: 'rejected' as const };
      }
      return { ...bid, status: 'withdrawn' as const };
    });
    market = { ...market, bids: legalBids };
    ctx.workingMarkets[i] = market;

    const resolved = resolvePlayerDecision(market, player, ctx.state);
    ctx.workingMarkets[i] = resolved;

    const winner = resolved.bids.find(b => b.status === 'accepted');
    if (!winner) {
      if (hadUserBidForLog) {
        console.warn(`[FA-RESOLVE] ${market.playerName ?? market.playerId} closed with no accepted bid while user had a bid.`);
        ctx.emitUserBidRejection(market, market.playerName ?? player.name, { reason: 'did not accept any offer' });
        ctx.workingMarkets[i] = {
          ...resolved,
          bids: resolved.bids.map(b => b.isUserBid && b.status === 'active'
            ? { ...b, status: 'rejected' as const }
            : b),
        };
      }
      continue;
    }

    const team = ctx.state.teams.find(t => t.id === winner.teamId);
    if (!team) continue;

    const rfaEnabled = isRfaMatchingEnabled(ctx.state.leagueStats);
    const isRFA = isPlayerRestrictedFreeAgent(player);
    const priorTid = getRFAPriorTid(player);
    const matchWindowDays = (ctx.state.leagueStats as any).rfaMatchWindowDays ?? 2;
    if (
      rfaEnabled &&
      isRFA &&
      priorTid >= 0 &&
      winner.teamId !== priorTid &&
      !market.pendingMatch &&
      !winner.isUserBid
    ) {
      ctx.workingMarkets[i] = {
        ...resolved,
        resolved: false,
        pendingMatch: true,
        pendingMatchExpiresDay: ctx.currentDay + matchWindowDays,
        pendingMatchPriorTid: priorTid,
        pendingMatchOfferBidId: winner.id,
      };
      const userTeamForRFA = ctx.state.gameMode === 'gm' ? ((ctx.state as any).userTeamId ?? -999) : -999;
      const offeredYears = Math.min(winner.years, ctx.resolutionMaxYears);
      if (priorTid === userTeamForRFA) {
        ctx.rfaOfferSheets.push({
          playerId: player.internalId,
          playerName: player.name,
          signingTeamName: team.name,
          annualM: Math.round(winner.salaryUSD / 100_000) / 10,
          salaryUSD: winner.salaryUSD,
          years: offeredYears,
          expiresInDays: matchWindowDays,
        });
      }
      const winnerOption = sanitizeBidOption(winner.option);
      const totalOfferValue = formatCurrencyWithCode(rfaOfferSheetSalaries(winner.salaryUSD, offeredYears).reduce((sum, salary) => sum + salary, 0), 'USD', false);
      const priorTeamForHist = ctx.state.teams.find(t => t.id === priorTid);
      ctx.historyEntries.push({
        text: `${player.name} signs offer sheet with the ${team.name}: ${totalOfferValue}/${offeredYears}yr${optionTag(winnerOption)} — ${priorTeamForHist?.name ?? 'prior team'} has ${matchWindowDays} days to match.`,
        date: ctx.state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: team.id,
      } as any);
      if (ctx.includeDerivedMedia) {
        const offerSourceName = getInsiderHandle(ctx.state.leagueType, ctx.state.date, ctx.state.leagueStats?.year, ctx.state.leagueStats?.uiMode).name;
        ctx.newsItems.push({
        id: `rfa-offer-sheet-${player.internalId}-${ctx.state.date}`,
        headline: `${player.name} Signs Offer Sheet with ${team.name}`,
        content: `${player.name} (RFA) has agreed to a ${offeredYears}-year, ${totalOfferValue} offer sheet with the ${team.name}. The ${priorTeamForHist?.name ?? 'prior team'} has ${matchWindowDays} days to match. Sources: ${offerSourceName}.`,
        date: ctx.state.date,
        type: 'transaction',
        read: false,
        isNew: true,
        });
      }
      continue;
    }

    const isTwoWay = !!winner.twoWay;
    const isDevelopmental = isTwoWay && areWnbaDevelopmentalContractsEnabled(ctx.state.leagueStats);
    const finalYears = isDevelopmental ? 1 : Math.min(winner.years, ctx.resolutionMaxYears);
    const finalOption = isDevelopmental ? 'NONE' : sanitizeBidOption(winner.option);
    const annualSalaryUSD = isDevelopmental
      ? getWnbaDevelopmentalBaseStipendUSD(ctx.state.leagueStats)
      : winner.salaryUSD;
    const isNonGuaranteed = !!winner.nonGuaranteed && finalYears === 1;
    const joinedNewTeam = priorTid >= 0 && priorTid !== winner.teamId;
    const newContract = {
      amount: Math.round(annualSalaryUSD / 1_000),
      exp: ctx.currentYear + finalYears - 1,
      hasPlayerOption: finalOption === 'PLAYER',
      ...(isTwoWay ? { type: isDevelopmental ? 'DEVELOPMENTAL' : 'TWO_WAY' } : {}),
    };
    const newContractYears = Array.from({ length: finalYears }, (_, idx) => {
      const yr = ctx.currentYear + idx;
      const annual = Math.round(annualSalaryUSD * Math.pow(1.05, idx));
      const isLast = idx === finalYears - 1;
      return {
        season: `${yr - 1}-${String(yr).slice(-2)}`,
        guaranteed: isNonGuaranteed ? 0 : annual,
        option: isDevelopmental ? 'developmental' : isTwoWay ? 'twoWay' : isLast ? lastYearOptionLabel(finalOption) : '',
      };
    });
    const historicalYears = ((player as any).contractYears ?? []).filter((cy: any) => {
      const yr = parseInt(cy.season.split('-')[0], 10) + 1;
      return yr < ctx.currentYear;
    });
    const prevSalaryUSDFirstYear = (Number((player as any).contract?.amount) || 0) * 1_000;
    const minUSD = getContractLimits(player, ctx.state.leagueStats as any).minSalaryUSD;
    const signingPayroll = getTeamPayrollUSD(ctx.state.players, winner.teamId, team, ctx.currentYear, ctx.state.leagueStats as any) + ctx.newlyCommittedForTeam(winner.teamId);
    const mleTypeUsed = isTwoWay ? null : ctx.getMleTypeForBid(winner, player, signingPayroll);
    const baeUsed = !isTwoWay && ctx.getBaeForBid(winner, player, signingPayroll);
    const mutation: Partial<NBAPlayer> = clearWaiverMarkers({
      tid: winner.teamId,
      status: (ctx.state.leagueStats?.uiMode === 'wnba_isolated' ? 'WNBA' : 'Active') as any,
      contract: newContract,
      contractYears: [...historicalYears, ...newContractYears],
      mleSignedVia: mleTypeUsed ?? undefined,
      baeSignedVia: baeUsed || undefined,
      signedDate: ctx.state.date,
      transactions: appendPlayerTransaction(player, { season: ctx.currentYear, tid: winner.teamId, type: 'freeAgent' }),
      tradeEligibleDate: computeTradeEligibleDate({
        signingDate: ctx.state.date,
        contractYears: finalYears,
        salaryUSDFirstYear: annualSalaryUSD,
        prevSalaryUSDFirstYear,
        usedBirdRights: !joinedNewTeam,
        isReSign: !joinedNewTeam,
        isMinimum: annualSalaryUSD <= minUSD * 1.01,
        isTwoWay,
        leagueStats: ctx.state.leagueStats as any,
      }),
      twoWay: isTwoWay && !isDevelopmental,
      developmentalContract: isDevelopmental || undefined,
      developmentalGamesPlayed: isDevelopmental ? 0 : undefined,
      developmentalContractSeason: isDevelopmental ? ctx.currentYear : undefined,
      nonGuaranteed: isNonGuaranteed,
      ...(joinedNewTeam ? { yearsWithTeam: 0, hasBirdRights: false } : {}),
    } as any);
    ctx.playerMutations.set(player.internalId, mutation);
    ctx.consumeMleForBid(winner.teamId, mleTypeUsed, winner.salaryUSD);
    if (baeUsed) {
      ctx.consumeBaeForBid(winner.teamId, winner.salaryUSD);
    } else if (
      !mleTypeUsed &&
      !(priorTid === winner.teamId && hasBirdRights(player)) &&
      signingPayroll < getCapThresholds(ctx.state.leagueStats).salaryCap
    ) {
      ctx.recordCapSpaceForBid(winner.teamId);
    }
    ctx.signedPlayerIds.add(player.internalId);

    const annualM = Math.round(annualSalaryUSD / 100_000) / 10;
    const totalValue = formatContractTotalUSD(annualSalaryUSD, finalYears);
    const twoWayTag = isDevelopmental ? ' (developmental)' : isTwoWay ? ' (two-way)' : '';
    const ngTag = isNonGuaranteed ? ' (non-guaranteed)' : '';
    const baeTag = baeUsed ? ' (bi-annual exception)' : '';
    const userWon = !!winner.isUserBid;
    if (userWon && winner.aspireSideDeal) {
      ctx.aspireOutcomes.push({
        playerId: player.internalId,
        playerName: player.name,
        teamId: winner.teamId,
        sideDeal: winner.aspireSideDeal,
      });
    }
    const signingVerb = joinedNewTeam ? 'signs with' : 're-signs with';
    if (market.bids.some(b => b.isUserBid) && !ctx.userBidRejectedByLegality.has(market.playerId)) {
      const winnerTeam = ctx.state.teams.find(t => t.id === winner.teamId);
      ctx.userBidResolutions.push({
        playerName: player.name,
        accepted: userWon,
        winnerTeamName: userWon ? undefined : (winnerTeam?.name ?? winner.teamName),
        annualM,
        salaryUSD: annualSalaryUSD,
        years: finalYears,
      });
    }
    ctx.historyEntries.push({
      text: `${player.name} ${signingVerb} the ${team.name}: ${totalValue}/${finalYears}yr${optionTag(finalOption)}${twoWayTag}${ngTag}${baeTag}`,
      date: ctx.state.date,
      type: 'Signing',
      playerIds: [player.internalId],
      tid: team.id,
    } as any);

    const k2 = getK2(player);
    if (ctx.includeDerivedMedia) {
      const headline = !joinedNewTeam
        ? `${player.name} Re-Signs with ${team.name}`
        : userWon
          ? `${player.name} Picks Your ${team.name}`
          : annualM >= 30
            ? `${player.name} Lands Max Deal with ${team.name}`
            : `${player.name} Signs with ${team.name}`;
      const faInsiderName = getInsiderHandle(ctx.state.leagueType, ctx.state.date, ctx.state.leagueStats?.year, ctx.state.leagueStats?.uiMode).name;
      ctx.newsItems.push({
        id: `fa-market-signing-${player.internalId}-${ctx.state.date}`,
        headline,
        content: `${player.name} has ${joinedNewTeam ? 'agreed to' : 're-signed on'} a ${finalYears}-year, ${totalValue} deal with the ${team.name}${optionTag(finalOption)}${twoWayTag}${ngTag}. Sources: ${faInsiderName}.`,
        date: ctx.state.date,
        type: 'transaction',
        read: false,
        isNew: true,
      });
    }

    if (ctx.includeDerivedMedia && k2 >= 78) {
      const shamsContent = buildShamsTransactionPost({
        type: 'signing',
        playerName: player.name,
        teamName: team.name,
        amount: annualM,
        years: finalYears,
        hasPlayerOption: finalOption === 'PLAYER',
        mediaContext: ctx.state.leagueStats?.uiMode === 'pba_isolated' ? 'pba' : 'nba',
      });
      if (shamsContent) {
        const faPostInsider = getInsiderHandle(ctx.state.leagueType, ctx.state.date, ctx.state.leagueStats?.year, ctx.state.leagueStats?.uiMode);
        const engagement = calculateSocialEngagement(faPostInsider.atHandle, shamsContent, player.overallRating);
        const socialAvailable = isTwitterAvailable(ctx.state.date, ctx.state.leagueStats?.year);
        const useShamsMedia = getPrimaryInsiderKey(ctx.state.date, ctx.state.leagueStats?.year) === 'shams'
          && ctx.state.leagueType !== 'fictional'
          && ctx.state.leagueStats?.uiMode !== 'pba_isolated';
        const shamsPhoto = socialAvailable && useShamsMedia ? findShamsPhoto(player.name, team.name) : null;
        if (!socialAvailable) continue;
        ctx.socialPosts.push({
          id: `insider-market-sign-${player.internalId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          author: faPostInsider.name,
          handle: faPostInsider.atHandle,
          content: shamsContent,
          date: parseGameDate(ctx.state.date).toISOString(),
          likes: engagement.likes,
          retweets: engagement.retweets,
          source: 'TwitterX' as const,
          isNew: true,
          playerPortraitUrl: (player as any).imgURL,
          ...(shamsPhoto ? { mediaUrl: shamsPhoto.image_url } : {}),
        });
      }
    }
  }
}

export function resolvePendingRfaMatches(ctx: ResolutionContext): void {
  const userTeamIdRFA = ctx.state.gameMode === 'gm' ? ((ctx.state as any).userTeamId ?? -999) : -999;
  const rfaThresholds = getCapThresholds(ctx.state.leagueStats as any);
  const autoDeclineOver2nd = (ctx.state.leagueStats as any).rfaAutoDeclineOver2ndApron ?? true;

  for (let i = 0; i < ctx.workingMarkets.length; i++) {
    const market = ctx.workingMarkets[i];
    if (!market.pendingMatch || market.resolved) continue;
    const player = ctx.state.players.find(p => p.internalId === market.playerId);
    if (!player) { ctx.workingMarkets[i] = { ...market, resolved: true, pendingMatch: false }; continue; }

    const priorTid = market.pendingMatchPriorTid ?? -1;
    if (priorTid < 0) { ctx.workingMarkets[i] = { ...market, resolved: true, pendingMatch: false }; continue; }
    const priorTeam = ctx.state.teams.find(t => t.id === priorTid);
    const offerBid = market.bids.find(b => b.id === market.pendingMatchOfferBidId);
    const signingTeam = ctx.state.teams.find(t => t.id === offerBid?.teamId);
    if (!offerBid || !priorTeam || !signingTeam) {
      ctx.workingMarkets[i] = { ...market, resolved: true, pendingMatch: false };
      continue;
    }
    const manualDecision = (market as FreeAgentMarket & { manualRfaDecision?: 'match' | 'decline' }).manualRfaDecision;
    if (priorTid === userTeamIdRFA && !manualDecision) continue;

    const windowExpired = (market.pendingMatchExpiresDay ?? 0) <= ctx.currentDay;
    let willMatch = manualDecision === 'match';
    if (!manualDecision && !windowExpired) {
      const k2 = getK2(player);
      const priorPayroll = getTeamPayrollUSD(ctx.state.players, priorTid, priorTeam, ctx.currentYear, ctx.state.leagueStats as any);
      const overSecondApron = rfaThresholds.secondApron != null && priorPayroll >= rfaThresholds.secondApron;
      if (!autoDeclineOver2nd || !overSecondApron) {
        let h = 0;
        const seed = `rfa_match_${market.playerId}_${ctx.currentYear}`;
        for (let si = 0; si < seed.length; si++) h = (Math.imul(31, h) + seed.charCodeAt(si)) | 0;
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
        const roll = ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
        const matchPct = k2 >= 85 ? 0.85 : k2 >= 80 ? 0.70 : 0.55;
        willMatch = roll < matchPct;
      }
    }

    if (willMatch && ctx.getProjectedStandardRosterCount(priorTid) >= ctx.effectiveMaxRoster) {
      if (manualDecision === 'match') continue;
      willMatch = false;
    }
    if (!willMatch && ctx.getProjectedStandardRosterCount(offerBid.teamId) >= ctx.effectiveMaxRoster) {
      ctx.workingMarkets[i] = {
        ...market,
        resolved: true,
        pendingMatch: false,
        bids: market.bids.map(b => b.status === 'active' ? { ...b, status: 'rejected' as const } : b),
      };
      ctx.historyEntries.push({
        text: `${player.name}'s offer sheet voided — both ${priorTeam.name} and ${signingTeam.name} have no open roster slot.`,
        date: ctx.state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: signingTeam.id,
      } as any);
      continue;
    }

    const winningTid = willMatch ? priorTid : offerBid.teamId;
    const winningTeam = willMatch ? priorTeam : signingTeam;
    const finalYearsRFA = Math.min(offerBid.years, ctx.resolutionMaxYears);
    const finalOptionRFA = offerBid.option === 'PLAYER' && ctx.state.leagueStats?.playerOptionsEnabled === false ? 'NONE' : offerBid.option;
    const isNonGuaranteedRFA = ctx.state.leagueStats?.nonGuaranteedContractsEnabled !== false && !!offerBid.nonGuaranteed && finalYearsRFA === 1;
    const newContract = {
      amount: Math.round(offerBid.salaryUSD / 1_000),
      exp: ctx.currentYear + finalYearsRFA - 1,
      hasPlayerOption: finalOptionRFA === 'PLAYER',
    };
    const newContractYears = rfaOfferSheetSalaries(offerBid.salaryUSD, finalYearsRFA).map((annual, idx) => {
      const yr = ctx.currentYear + idx;
      return {
        season: `${yr - 1}-${String(yr).slice(-2)}`,
        guaranteed: isNonGuaranteedRFA ? 0 : annual,
        option: idx === finalYearsRFA - 1 ? lastYearOptionLabel(finalOptionRFA) : '',
      };
    });
    const histYears = ((player as any).contractYears ?? []).filter((cy: any) => {
      const yr = parseInt(cy.season.split('-')[0], 10) + 1;
      return yr < ctx.currentYear;
    });
    const priorTidRfa = (player.tid >= 0 && player.tid < 100) ? player.tid : getRFAPriorTid(player);
    const joinedNewTeam = priorTidRfa >= 0 && winningTid !== priorTidRfa;
    const prevSalaryUSDFirstYearRfa = (Number((player as any).contract?.amount) || 0) * 1_000;
    const minUSDRfa = getContractLimits(player, ctx.state.leagueStats as any).minSalaryUSD;
    const rfaPayroll = getTeamPayrollUSD(ctx.state.players, winningTid, winningTeam, ctx.currentYear, ctx.state.leagueStats as any) + ctx.newlyCommittedForTeam(winningTid);
    const rfaBidForMle = { ...offerBid, teamId: winningTid };
    const rfaMleTypeUsed = ctx.getMleTypeForBid(rfaBidForMle, player, rfaPayroll);
    const rfaBaeUsed = !willMatch && ctx.getBaeForBid(rfaBidForMle, player, rfaPayroll);
    ctx.playerMutations.set(player.internalId, clearWaiverMarkers({
      tid: winningTid,
      status: 'Active' as any,
      contract: newContract,
      contractYears: [...histYears, ...newContractYears],
      mleSignedVia: rfaMleTypeUsed ?? undefined,
      baeSignedVia: rfaBaeUsed || undefined,
      signedDate: ctx.state.date,
      transactions: appendPlayerTransaction(player, { season: ctx.currentYear, tid: winningTid, type: 'freeAgent' }),
      tradeEligibleDate: computeTradeEligibleDate({
        signingDate: ctx.state.date,
        contractYears: finalYearsRFA,
        salaryUSDFirstYear: offerBid.salaryUSD,
        prevSalaryUSDFirstYear: prevSalaryUSDFirstYearRfa,
        usedBirdRights: !joinedNewTeam,
        isReSign: !joinedNewTeam,
        isMinimum: offerBid.salaryUSD <= minUSDRfa * 1.01,
        leagueStats: ctx.state.leagueStats as any,
      }),
      twoWay: false,
      nonGuaranteed: isNonGuaranteedRFA,
      ...(joinedNewTeam ? { yearsWithTeam: 0, hasBirdRights: false } : {}),
    } as any));
    ctx.consumeMleForBid(winningTid, rfaMleTypeUsed, offerBid.salaryUSD);
    if (rfaBaeUsed) {
      ctx.consumeBaeForBid(winningTid, offerBid.salaryUSD);
    } else if (
      !rfaMleTypeUsed &&
      !(priorTidRfa === winningTid && hasBirdRights(player)) &&
      rfaPayroll < getCapThresholds(ctx.state.leagueStats).salaryCap
    ) {
      ctx.recordCapSpaceForBid(winningTid);
    }
    ctx.signedPlayerIds.add(player.internalId);

    const { manualRfaDecision: _manualRfaDecision, ...resolvedMarket } = market as FreeAgentMarket & { manualRfaDecision?: 'match' | 'decline' };
    ctx.workingMarkets[i] = {
      ...resolvedMarket,
      resolved: true,
      pendingMatch: false,
      matchedByPriorTeam: willMatch,
    };
    ctx.rfaMatchResolutions.push({
      playerName: player.name,
      priorTeamName: priorTeam.name,
      signingTeamName: signingTeam.name,
      matched: willMatch,
      userInvolved: userTeamIdRFA === priorTid || userTeamIdRFA === offerBid.teamId,
    });

    const totalRfaValue = formatCurrencyWithCode(rfaOfferSheetSalaries(offerBid.salaryUSD, finalYearsRFA).reduce((sum, salary) => sum + salary, 0), 'USD', false);
    if (willMatch) {
      ctx.historyEntries.push({
        text: `${priorTeam.name} matched ${signingTeam.name}'s offer sheet on ${player.name}: ${totalRfaValue}/${finalYearsRFA}yr.`,
        date: ctx.state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: priorTeam.id,
      } as any);
      if (ctx.includeDerivedMedia) ctx.newsItems.push({
        id: `rfa-matched-${player.internalId}-${ctx.state.date}`,
        headline: `${priorTeam.name} Match ${signingTeam.name}'s Offer for ${player.name}`,
        content: `The ${priorTeam.name} have matched the ${signingTeam.name}'s ${finalYearsRFA}-year, ${totalRfaValue} offer sheet for ${player.name}, retaining the restricted free agent. Sources: ${getInsiderHandle(ctx.state.leagueType, ctx.state.date, ctx.state.leagueStats?.year, ctx.state.leagueStats?.uiMode).name}.`,
        date: ctx.state.date,
        type: 'transaction',
        read: false,
        isNew: true,
      });
    } else {
      ctx.historyEntries.push({
        text: `${player.name} signs with the ${signingTeam.name}: ${totalRfaValue}/${finalYearsRFA}yr (${priorTeam.name} declined to match).`,
        date: ctx.state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: signingTeam.id,
      } as any);
      if (ctx.includeDerivedMedia) ctx.newsItems.push({
        id: `rfa-not-matched-${player.internalId}-${ctx.state.date}`,
        headline: `${signingTeam.name} Land ${player.name} as ${priorTeam.name} Decline Match`,
        content: `${player.name} (${finalYearsRFA}yr · ${totalRfaValue}) joins the ${signingTeam.name} after the ${priorTeam.name} declined to match the offer sheet.`,
        date: ctx.state.date,
        type: 'transaction',
        read: false,
        isNew: true,
      });
    }
  }
}

export function withdrawExhaustedTeamBids(ctx: ResolutionContext): void {
  if (ctx.playerMutations.size === 0) return;
  const thresholds = getCapThresholds(ctx.state.leagueStats as any);
  const capUSD = thresholds.salaryCap;
  const newlyCommitted = new Map<number, number>();
  const twoWayRosterActive = getTwoWayRosterLimit(ctx.state.leagueStats as any) > 0;
  const isActiveTwoWayMutation = (mutation: Partial<NBAPlayer>): boolean =>
    twoWayRosterActive && isTwoWayContract(mutation, ctx.state.leagueStats);
  for (const mutation of ctx.playerMutations.values()) {
    const tid = mutation.tid;
    const amountK = mutation.contract?.amount;
    if (tid != null && tid >= 0 && amountK != null && !isActiveTwoWayMutation(mutation)) {
      newlyCommitted.set(tid, (newlyCommitted.get(tid) ?? 0) + amountK * 1_000);
    }
  }

  for (const market of ctx.workingMarkets) {
    if (market.resolved) continue;
    market.bids = market.bids.map(bid => {
      if (bid.status !== 'active' || bid.isUserBid) return bid;
      if (bid.twoWay) return bid;
      const extra = newlyCommitted.get(bid.teamId) ?? 0;
      if (extra === 0) return bid;

      const bidTeam = ctx.state.teams.find(t => t.id === bid.teamId);
      const teamPayroll = getTeamPayrollUSD(ctx.state.players, bid.teamId, bidTeam, ctx.currentYear, ctx.state.leagueStats as any);
      const effectivePayroll = teamPayroll + extra;
      if (effectivePayroll + bid.salaryUSD > ctx.getHardCapForTeam(bid.teamId)) {
        return { ...bid, status: 'withdrawn' as const };
      }
      const capSpace = capUSD - effectivePayroll;
      const mleAvail = getMLEAvailability(bid.teamId, effectivePayroll, bid.salaryUSD, thresholds, {
        ...(ctx.state.leagueStats as any),
        mleUsage: ctx.localMleUsage,
      });
      const player = ctx.state.players.find(candidate => candidate.internalId === market.playerId);
      const baeAvailable = !!player && ctx.getBaeForBid(bid, player, effectivePayroll);
      return capSpace >= bid.salaryUSD || baeAvailable || (!mleAvail.blocked && bid.salaryUSD <= mleAvail.available)
        ? bid
        : { ...bid, status: 'withdrawn' as const };
    });
  }
}
