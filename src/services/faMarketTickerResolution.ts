import type { GameState, HistoryEntry, NBAPlayer } from '../types';
import { calculateSocialEngagement } from '../utils/helpers';
import { clearWaiverMarkers } from '../utils/contractCleanup';
import { computeTradeEligibleDate } from '../utils/signingMoratorium';
import { formatContractTotalUSD, getCapThresholds, getMLEAvailability, getTeamPayrollUSD, hasBirdRights } from '../utils/salaryUtils';
import { isRfaMatchingEnabled } from '../utils/ruleFlags';
import { parseGameDate } from '../utils/dateUtils';
import { getInsiderHandle, getInsiderWoj } from '../data/social/handles';
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
  userBidRejectedForCap: Set<string>;
  effectiveMaxRoster: number;
  resolutionMaxYears: number;
  moratoriumActive: boolean;
  moratoriumEndDay: number;
  emitUserBidRejection: (market: FreeAgentMarket, playerName: string, opts: { winnerTeamName?: string; reason?: string }) => void;
  newlyCommittedForTeam: (teamId: number) => number;
  getProjectedStandardRosterCount: (teamId: number) => number;
  getMleTypeForBid: (bid: FreeAgentBid, player: NBAPlayer, payrollUSD: number) => MleType;
  consumeMleForBid: (teamId: number, type: MleType, salaryUSD: number) => void;
  localMleUsage: NonNullable<GameState['leagueStats']>['mleUsage'];
}

export function resolveDueMarkets(ctx: ResolutionContext): void {
  const bidStillLegalAtResolution = (bid: FreeAgentBid, player: NBAPlayer): boolean => {
    const team = ctx.state.teams.find(t => t.id === bid.teamId);
    if (!team) return false;
    if (!bid.twoWay && ctx.getProjectedStandardRosterCount(bid.teamId) >= ctx.effectiveMaxRoster) {
      return false;
    }
    const priorTid = getRFAPriorTid(player);
    if (bid.teamId === priorTid && hasBirdRights(player)) return true;

    const thresholds = getCapThresholds(ctx.state.leagueStats as any);
    const payroll = getTeamPayrollUSD(ctx.state.players, bid.teamId, team, ctx.currentYear) + ctx.newlyCommittedForTeam(bid.teamId);
    const capSpace = thresholds.salaryCap - payroll;
    return capSpace >= bid.salaryUSD || !!ctx.getMleTypeForBid(bid, player, payroll);
  };

  for (let i = 0; i < ctx.workingMarkets.length; i++) {
    let market = ctx.workingMarkets[i];
    const hadUserBidForLog = market.bids.some(b => b.isUserBid);
    if (market.resolved) {
      if (hadUserBidForLog) console.log(`[FA-RESOLVE] Skipping ${market.playerName ?? market.playerId} — already resolved.`);
      continue;
    }
    if ((market.decidesOnDay ?? 0) > ctx.currentDay) {
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
      if (bidStillLegalAtResolution(bid, player)) return bid;
      if (bid.isUserBid) {
        ctx.emitUserBidRejection(market, player.name, { reason: 'no longer fits your cap space or exception room after season rollover' });
        ctx.userBidRejectedForCap.add(market.playerId);
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
    const contract = (player as any).contract;
    const isRFA =
      !!(contract?.isRestrictedFA || contract?.restrictedFA) ||
      !!(contract?.rookie && (player as any).draft?.round === 1);
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
      if (priorTid === userTeamForRFA) {
        ctx.rfaOfferSheets.push({
          playerId: player.internalId,
          playerName: player.name,
          signingTeamName: team.name,
          annualM: Math.round(winner.salaryUSD / 100_000) / 10,
          salaryUSD: winner.salaryUSD,
          years: winner.years,
          expiresInDays: matchWindowDays,
        });
      }
      const totalOfferValue = formatContractTotalUSD(winner.salaryUSD, winner.years);
      const priorTeamForHist = ctx.state.teams.find(t => t.id === priorTid);
      ctx.historyEntries.push({
        text: `${player.name} signs offer sheet with the ${team.name}: ${totalOfferValue}/${winner.years}yr${optionTag(winner.option)} — ${priorTeamForHist?.name ?? 'prior team'} has ${matchWindowDays} days to match.`,
        date: ctx.state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: team.id,
      } as any);
      ctx.newsItems.push({
        id: `rfa-offer-sheet-${player.internalId}-${ctx.state.date}`,
        headline: `${player.name} Signs Offer Sheet with ${team.name}`,
        content: `${player.name} (RFA) has agreed to a ${winner.years}-year, ${totalOfferValue} offer sheet with the ${team.name}. The ${priorTeamForHist?.name ?? 'prior team'} has ${matchWindowDays} days to match. Sources: Adrian Wojnarowski.`,
        date: ctx.state.date,
        type: 'transaction',
        read: false,
        isNew: true,
      });
      continue;
    }

    const finalYears = Math.min(winner.years, ctx.resolutionMaxYears);
    const isTwoWay = !!winner.twoWay;
    const isNonGuaranteed = !!winner.nonGuaranteed && finalYears === 1;
    const joinedNewTeam = priorTid >= 0 && priorTid !== winner.teamId;
    const newContract = {
      amount: Math.round(winner.salaryUSD / 1_000),
      exp: ctx.currentYear + finalYears - 1,
      hasPlayerOption: winner.option === 'PLAYER',
    };
    const newContractYears = Array.from({ length: finalYears }, (_, idx) => {
      const yr = ctx.currentYear + idx;
      const annual = Math.round(winner.salaryUSD * Math.pow(1.05, idx));
      const isLast = idx === finalYears - 1;
      return {
        season: `${yr - 1}-${String(yr).slice(-2)}`,
        guaranteed: isNonGuaranteed ? 0 : annual,
        option: isLast ? lastYearOptionLabel(winner.option) : '',
      };
    });
    const historicalYears = ((player as any).contractYears ?? []).filter((cy: any) => {
      const yr = parseInt(cy.season.split('-')[0], 10) + 1;
      return yr < ctx.currentYear;
    });
    const prevSalaryUSDFirstYear = (Number((player as any).contract?.amount) || 0) * 1_000;
    const minUSD = ((ctx.state.leagueStats?.minContractStaticAmount as number | undefined) ?? 1.273) * 1_000_000;
    const signingPayroll = getTeamPayrollUSD(ctx.state.players, winner.teamId, team, ctx.currentYear) + ctx.newlyCommittedForTeam(winner.teamId);
    const mleTypeUsed = ctx.getMleTypeForBid(winner, player, signingPayroll);
    const mutation: Partial<NBAPlayer> = clearWaiverMarkers({
      tid: winner.teamId,
      status: 'Active' as any,
      contract: newContract,
      contractYears: [...historicalYears, ...newContractYears],
      mleSignedVia: mleTypeUsed ?? undefined,
      signedDate: ctx.state.date,
      tradeEligibleDate: computeTradeEligibleDate({
        signingDate: ctx.state.date,
        contractYears: finalYears,
        salaryUSDFirstYear: winner.salaryUSD,
        prevSalaryUSDFirstYear,
        usedBirdRights: !joinedNewTeam,
        isReSign: !joinedNewTeam,
        isMinimum: winner.salaryUSD <= minUSD * 1.01,
        isTwoWay,
        leagueStats: ctx.state.leagueStats as any,
      }),
      ...(isTwoWay ? { twoWay: true } : {}),
      ...(isNonGuaranteed ? { nonGuaranteed: true } : {}),
      ...(joinedNewTeam ? { yearsWithTeam: 0, hasBirdRights: false } : {}),
    } as any);
    ctx.playerMutations.set(player.internalId, mutation);
    ctx.consumeMleForBid(winner.teamId, mleTypeUsed, winner.salaryUSD);
    ctx.signedPlayerIds.add(player.internalId);

    const annualM = Math.round(winner.salaryUSD / 100_000) / 10;
    const totalValue = formatContractTotalUSD(winner.salaryUSD, finalYears);
    const twoWayTag = isTwoWay ? ' (two-way)' : '';
    const ngTag = isNonGuaranteed ? ' (non-guaranteed)' : '';
    const userWon = !!winner.isUserBid;
    if (market.bids.some(b => b.isUserBid) && !ctx.userBidRejectedForCap.has(market.playerId)) {
      const winnerTeam = ctx.state.teams.find(t => t.id === winner.teamId);
      ctx.userBidResolutions.push({
        playerName: player.name,
        accepted: userWon,
        winnerTeamName: userWon ? undefined : (winnerTeam?.name ?? winner.teamName),
        annualM,
        salaryUSD: winner.salaryUSD,
        years: finalYears,
      });
    }
    ctx.historyEntries.push({
      text: `${player.name} signs with the ${team.name}: ${totalValue}/${finalYears}yr${optionTag(winner.option)}${twoWayTag}${ngTag}`,
      date: ctx.state.date,
      type: 'Signing',
      playerIds: [player.internalId],
      tid: team.id,
    } as any);

    const headline = userWon
      ? `${player.name} Picks Your ${team.name}`
      : annualM >= 30
        ? `${player.name} Lands Max Deal with ${team.name}`
        : `${player.name} Signs with ${team.name}`;
    const faInsiderName = getInsiderHandle(ctx.state.leagueType).name;
    const faWojName = getInsiderWoj(ctx.state.leagueType).name;
    ctx.newsItems.push({
      id: `fa-market-signing-${player.internalId}-${ctx.state.date}`,
      headline,
      content: `${player.name} has agreed to a ${finalYears}-year, ${totalValue} deal with the ${team.name}${optionTag(winner.option)}${twoWayTag}${ngTag}. ${annualM >= 30 ? `Sources: ${faInsiderName}.` : `Sources: ${faWojName}.`}`,
      date: ctx.state.date,
      type: 'transaction',
      read: false,
      isNew: true,
    });

    const k2 = getK2(player);
    if (k2 >= 78) {
      const shamsContent = buildShamsTransactionPost({
        type: 'signing',
        playerName: player.name,
        teamName: team.name,
        amount: annualM,
        years: finalYears,
        hasPlayerOption: winner.option === 'PLAYER',
      });
      if (shamsContent) {
        const faPostInsider = getInsiderHandle(ctx.state.leagueType);
        const engagement = calculateSocialEngagement(faPostInsider.atHandle, shamsContent, player.overallRating);
        const shamsPhoto = findShamsPhoto(player.name, team.name);
        ctx.socialPosts.push({
          id: `shams-market-sign-${player.internalId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          author: faPostInsider.name,
          handle: faPostInsider.atHandle,
          content: shamsContent,
          date: parseGameDate(ctx.state.date).toISOString(),
          likes: engagement.likes,
          retweets: engagement.retweets,
          source: 'TwitterX' as const,
          isNew: true,
          playerPortraitUrl: (player as any).imgURL,
          ...(shamsPhoto ? { mediaUrl: shamsPhoto } : {}),
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
    if (priorTid === userTeamIdRFA) continue;

    const windowExpired = (market.pendingMatchExpiresDay ?? 0) <= ctx.currentDay;
    let willMatch = false;
    if (!windowExpired) {
      const k2 = getK2(player);
      const priorPayroll = ctx.state.players
        .filter(p => p.tid === priorTid && !(p as any).twoWay)
        .reduce((sum, p) => sum + ((p.contract?.amount ?? 0) * 1_000), 0);
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
    const isNonGuaranteedRFA = !!offerBid.nonGuaranteed && finalYearsRFA === 1;
    const newContract = {
      amount: Math.round(offerBid.salaryUSD / 1_000),
      exp: ctx.currentYear + finalYearsRFA - 1,
      hasPlayerOption: offerBid.option === 'PLAYER',
    };
    const newContractYears = Array.from({ length: finalYearsRFA }, (_, idx) => {
      const yr = ctx.currentYear + idx;
      const annual = Math.round(offerBid.salaryUSD * Math.pow(1.05, idx));
      return {
        season: `${yr - 1}-${String(yr).slice(-2)}`,
        guaranteed: isNonGuaranteedRFA ? 0 : annual,
        option: idx === finalYearsRFA - 1 ? lastYearOptionLabel(offerBid.option) : '',
      };
    });
    const histYears = ((player as any).contractYears ?? []).filter((cy: any) => {
      const yr = parseInt(cy.season.split('-')[0], 10) + 1;
      return yr < ctx.currentYear;
    });
    const priorTidRfa = (player.tid >= 0 && player.tid <= 29) ? player.tid : getRFAPriorTid(player);
    const joinedNewTeam = priorTidRfa >= 0 && winningTid !== priorTidRfa;
    const prevSalaryUSDFirstYearRfa = (Number((player as any).contract?.amount) || 0) * 1_000;
    const minUSDRfa = ((ctx.state.leagueStats?.minContractStaticAmount as number | undefined) ?? 1.273) * 1_000_000;
    const rfaPayroll = getTeamPayrollUSD(ctx.state.players, winningTid, winningTeam, ctx.currentYear) + ctx.newlyCommittedForTeam(winningTid);
    const rfaBidForMle = { ...offerBid, teamId: winningTid };
    const rfaMleTypeUsed = ctx.getMleTypeForBid(rfaBidForMle, player, rfaPayroll);
    ctx.playerMutations.set(player.internalId, clearWaiverMarkers({
      tid: winningTid,
      status: 'Active' as any,
      contract: newContract,
      contractYears: [...histYears, ...newContractYears],
      mleSignedVia: rfaMleTypeUsed ?? undefined,
      signedDate: ctx.state.date,
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
      ...(isNonGuaranteedRFA ? { nonGuaranteed: true } : {}),
      ...(joinedNewTeam ? { yearsWithTeam: 0, hasBirdRights: false } : {}),
    } as any));
    ctx.consumeMleForBid(winningTid, rfaMleTypeUsed, offerBid.salaryUSD);
    ctx.signedPlayerIds.add(player.internalId);

    ctx.workingMarkets[i] = {
      ...market,
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

    const totalRfaValue = formatContractTotalUSD(offerBid.salaryUSD, finalYearsRFA);
    if (willMatch) {
      ctx.historyEntries.push({
        text: `${priorTeam.name} matched ${signingTeam.name}'s offer sheet on ${player.name}: ${totalRfaValue}/${finalYearsRFA}yr.`,
        date: ctx.state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: priorTeam.id,
      } as any);
      ctx.newsItems.push({
        id: `rfa-matched-${player.internalId}-${ctx.state.date}`,
        headline: `${priorTeam.name} Match ${signingTeam.name}'s Offer for ${player.name}`,
        content: `The ${priorTeam.name} have matched the ${signingTeam.name}'s ${finalYearsRFA}-year, ${totalRfaValue} offer sheet for ${player.name}, retaining the restricted free agent. Sources: Adrian Wojnarowski.`,
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
      ctx.newsItems.push({
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
  for (const mutation of ctx.playerMutations.values()) {
    const tid = mutation.tid;
    const amountK = mutation.contract?.amount;
    if (tid != null && tid >= 0 && amountK != null) {
      newlyCommitted.set(tid, (newlyCommitted.get(tid) ?? 0) + amountK * 1_000);
    }
  }

  for (const market of ctx.workingMarkets) {
    if (market.resolved) continue;
    market.bids = market.bids.map(bid => {
      if (bid.status !== 'active' || bid.isUserBid) return bid;
      const extra = newlyCommitted.get(bid.teamId) ?? 0;
      if (extra === 0) return bid;

      const teamPayroll = ctx.state.players
        .filter(p => p.tid === bid.teamId && !(p as any).twoWay)
        .reduce((sum, p) => sum + ((p.contract?.amount ?? 0) * 1_000), 0);
      const effectivePayroll = teamPayroll + extra;
      const capSpace = capUSD - effectivePayroll;
      const mleAvail = getMLEAvailability(bid.teamId, effectivePayroll, bid.salaryUSD, thresholds, {
        ...(ctx.state.leagueStats as any),
        mleUsage: ctx.localMleUsage,
      });
      return capSpace >= bid.salaryUSD || (!mleAvail.blocked && bid.salaryUSD <= mleAvail.available)
        ? bid
        : { ...bid, status: 'withdrawn' as const };
    });
  }
}
