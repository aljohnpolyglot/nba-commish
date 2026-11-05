import { computeContractOffer, getContractLimits, getMLEAvailability, getTeamCapProfileFromState } from '../../utils/salaryUtils';
import { getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { isTwoWayContract } from '../../utils/contractTypes';
import { isNbaTwoWayServiceEligible } from '../../utils/playerExperience';
import { clampOfferForDate, getK2Ovr, getMinSalaryUSD, isLoyalBlocked, isRecentWaiverByTeam } from './aiFreeAgencyHelpers';
import { getStandardRosterTargetAfterMarketReservations, type FreeAgencyRoundContext } from './roundShared';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalBaseStipendUSD,
  isWnbaDevelopmentalServiceEligible,
} from '../wnba/developmentalContracts';
import {
  isEmergencyMinimumRosterOfferEligible,
  preserveRosterCompletionMarketOffer,
} from './rosterCompletionOfferPolicy';
import { simDebug } from '../../utils/simDebug';

export function runTwoWayAndCampPasses(
  ctx: FreeAgencyRoundContext,
  isPreseasonWindow: boolean,
  maxCampRoster: number,
  maxCampSigningsPerTeam = Number.POSITIVE_INFINITY,
) {
  const nbaBackgroundInPbaMode = (ctx.state.leagueStats as any).uiMode === 'pba_isolated';
  const maxTwoWay = nbaBackgroundInPbaMode ? 3 : getTwoWayRosterLimit(ctx.state.leagueStats as any);
  const twoWayEnabled = maxTwoWay > 0;
  const isActiveTwoWay = (playerOrSigning: any): boolean => twoWayEnabled && isTwoWayContract(playerOrSigning, ctx.state.leagueStats);
  const TWO_WAY_OVR_CAP = 60;
  const TWO_WAY_K2_CAP = 74;
  const wnbaDevelopmental = areWnbaDevelopmentalContractsEnabled(ctx.state.leagueStats);
  const secondarySalaryUSD = wnbaDevelopmental
    ? getWnbaDevelopmentalBaseStipendUSD(ctx.state.leagueStats)
    : 625_000;
  const canRecruitFromGLeague = !wnbaDevelopmental
    && !['euro_isolated', 'pba_isolated'].includes(String((ctx.state.leagueStats as any).uiMode ?? ''));

  if (twoWayEnabled && maxTwoWay > 0) {
    for (const team of ctx.sortedAITeams) {
      if (isPreseasonWindow) {
        const totalOnTeam = ctx.state.players.filter(p => p.tid === team.id).length;
        const totalSigned = ctx.results.filter(r => r.teamId === team.id).length;
        if (totalOnTeam + totalSigned >= maxCampRoster) continue;
      }

      const existingTwoWay = ctx.state.players.filter(p => p.tid === team.id && isActiveTwoWay(p)).length;
      const signedTwoWay = ctx.results.filter(r => r.teamId === team.id && isActiveTwoWay(r)).length;
      const slotsAvailable = maxTwoWay - (existingTwoWay + signedTwoWay);
      if (slotsAvailable <= 0) continue;

      const alreadySignedIds = new Set(ctx.results.map(result => result.playerId));
      const twoWayCandidates = [
        ...ctx.pool,
        ...(canRecruitFromGLeague ? ctx.state.players.filter(player => player.status === 'G-League') : []),
      ]
        .filter(player => !alreadySignedIds.has(player.internalId))
        .filter(player => !ctx.marketPendingIds.has(player.internalId))
        .filter(p => (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
        .filter(p => getK2Ovr(p) <= TWO_WAY_K2_CAP)
        .filter(p => wnbaDevelopmental
          ? isWnbaDevelopmentalServiceEligible(p, ctx.currentYear, ctx.state.leagueStats)
          : isNbaTwoWayServiceEligible(p, ctx.currentYear))
        .filter(p => !isLoyalBlocked(p, team.id, ctx.currentYear))
        .filter(p => !isRecentWaiverByTeam(p, team.id, ctx.state.date))
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

      let filled = 0;
      for (const candidate of twoWayCandidates) {
        if (filled >= slotsAvailable) break;
        const signed = ctx.signPlayer(
          candidate,
          team,
          { salaryUSD: secondarySalaryUSD, years: 1, hasPlayerOption: false },
          null,
          0,
          true,
        );
        if (signed) filled++;
      }
    }
  }

  if (!isPreseasonWindow) return;

  const NG_OVR_CAP = 50;
  const minSalaryUSDPreseason = getMinSalaryUSD(ctx.state.leagueStats);
  const seasonCap = Number.isFinite(ctx.thresholds.salaryCap)
    ? ctx.thresholds.salaryCap
    : Number((ctx.state.leagueStats as any).historicalContractScaleCap ?? 140_000_000);
  const NG_CAP_PCT_BY_OVR: Array<{ maxOvr: number; pct: number }> = [
    { maxOvr: 50, pct: 0.009 },
    { maxOvr: 55, pct: 0.011 },
    { maxOvr: 60, pct: 0.014 },
    { maxOvr: 65, pct: 0.019 },
    { maxOvr: 70, pct: 0.024 },
    { maxOvr: 75, pct: 0.029 },
    { maxOvr: 99, pct: 0.034 },
  ];
  const ngFillTarget = maxCampRoster;

  for (const team of ctx.sortedAITeams) {
    const totalCamp = ctx.state.players.filter(p => p.tid === team.id).length
      + ctx.results.filter(r => r.teamId === team.id).length;
    if (totalCamp >= ngFillTarget) continue;

    const ngSlots = Math.min(ngFillTarget - totalCamp, maxCampSigningsPerTeam);
    const ngCandidates = ctx.pool
      .filter(p => (p.overallRating ?? 99) <= NG_OVR_CAP)
      .filter(p => getK2Ovr(p) < 80)
      .filter(p => !isLoyalBlocked(p, team.id, ctx.currentYear))
      .filter(p => !isRecentWaiverByTeam(p, team.id, ctx.state.date))
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

    let filled = 0;
    for (const candidate of ngCandidates) {
      if (filled >= ngSlots) break;
      const ovr = candidate.overallRating ?? 50;
      const tierPct = (NG_CAP_PCT_BY_OVR.find(t => ovr <= t.maxOvr) ?? NG_CAP_PCT_BY_OVR[NG_CAP_PCT_BY_OVR.length - 1]).pct;
      let seed = 0;
      const id = candidate.internalId ?? '';
      for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
      const jitter = 0.90 + ((Math.abs(seed) % 200) / 1000);
      const target = seasonCap * tierPct * jitter;
      const ngCeiling = seasonCap * NG_CAP_PCT_BY_OVR[NG_CAP_PCT_BY_OVR.length - 1].pct * 1.10;
      const ngSalaryUSD = Math.max(
        minSalaryUSDPreseason,
        Math.min(ngCeiling, Math.round(target / 25_000) * 25_000),
      );
      const signed = ctx.signPlayer(
        candidate,
        team,
        { salaryUSD: ngSalaryUSD, years: 1, hasPlayerOption: false },
        null,
        0,
        false,
        true,
      );
      if (signed) filled++;
    }
  }
}

export function runRosterCompletionPasses(ctx: FreeAgencyRoundContext) {
  const nbaBackgroundInPbaMode = (ctx.state.leagueStats as any).uiMode === 'pba_isolated';
  const maxTwoWay = nbaBackgroundInPbaMode ? 3 : getTwoWayRosterLimit(ctx.state.leagueStats as any);
  const twoWayEnabled = maxTwoWay > 0;
  const isActiveTwoWay = (playerOrSigning: any): boolean => twoWayEnabled && isTwoWayContract(playerOrSigning, ctx.state.leagueStats);
  const pass4Debug = typeof window !== 'undefined' && (window as any).__DEBUG_PASS4 === true;
  const pass4Diag: Array<{
    team: string;
    startRoster: number;
    endRoster: number;
    fillTarget: number;
    signedThisPass: number;
    iterations: number;
    poolSizeStart: number;
    poolSizeEnd: number;
    capRejects: number;
    mleRejects: number;
    forcedMinDeal: boolean;
    stopReason: string;
  }> = [];

  for (const team of ctx.sortedAITeams) {
    const fillTarget = getStandardRosterTargetAfterMarketReservations(ctx.state, team.id, ctx.maxStandard);
    const alreadySigned = () => ctx.results.filter(r => r.teamId === team.id && !isActiveTwoWay(r)).length;
    const computeRosterSize = () =>
      ctx.state.players.filter(p => p.tid === team.id && !isActiveTwoWay(p)).length + alreadySigned();
    let rosterSize = computeRosterSize();
    const startRoster = rosterSize;
    const startSignedCount = alreadySigned();
    const poolSizeStart = ctx.pool.length;
    let iterations = 0;
    let capRejects = 0;
    let mleRejects = 0;
    let forcedMinDeal = false;
    let stopReason = 'reached fill target';
    if (rosterSize >= fillTarget) continue;

    let signedThisIteration = true;
    while (rosterSize < fillTarget && ctx.pool.length > 0 && signedThisIteration) {
      signedThisIteration = false;
      iterations++;
      const profile = getTeamCapProfileFromState(ctx.state, team.id, ctx.thresholds as any);
      const localEntry = ctx.localMleUsed.get(team.id);
      const effectiveLS = localEntry
        ? { ...ctx.state.leagueStats, mleUsage: { ...(ctx.state.leagueStats as any).mleUsage, [team.id]: localEntry } }
        : ctx.state.leagueStats;
      const candidates = ctx.pool
        .filter(p => !isLoyalBlocked(p, team.id, ctx.currentYear))
        .filter(p => !isRecentWaiverByTeam(p, team.id, ctx.state.date))
        .map(p => ({
          player: p,
          offer: clampOfferForDate(
            computeContractOffer(p, ctx.state.leagueStats as any),
            ctx.state.date, ctx.currentYear, ctx.state.leagueStats, getK2Ovr(p),
          ),
        }))
        .map(({ player, offer }) => ({ player, offer: preserveRosterCompletionMarketOffer(offer) }))
        .sort((a, b) => (b.player.overallRating ?? 0) - (a.player.overallRating ?? 0) || a.offer.salaryUSD - b.offer.salaryUSD);

      const roundSpentUSD = ctx.results
        .filter(result => result.teamId === team.id && !isActiveTwoWay(result))
        .reduce((sum, result) => sum + result.salaryUSD, 0);
      const effectiveCapSpace = profile.capSpaceUSD - roundSpentUSD;
      const effectivePayroll = profile.payrollUSD + roundSpentUSD;

      for (const { player, offer } of candidates) {
        if (offer.salaryUSD <= effectiveCapSpace + 2_000_000) {
          signedThisIteration = ctx.signPlayer(player, team, offer, null, 0, false, ctx.isCampInvite(player, offer));
          if (signedThisIteration) {
            rosterSize = computeRosterSize();
            break;
          }
        }
        capRejects++;

        const mleAvail = getMLEAvailability(team.id, effectivePayroll, offer.salaryUSD, ctx.thresholds as any, effectiveLS as any);
        if (!mleAvail.blocked && mleAvail.type && offer.salaryUSD <= mleAvail.available) {
          const prevUsed = localEntry?.usedUSD ?? 0;
          ctx.localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
          signedThisIteration = ctx.signPlayer(player, team, offer, mleAvail.type, offer.salaryUSD, false, ctx.isCampInvite(player, offer));
          if (signedThisIteration) {
            rosterSize = computeRosterSize();
            break;
          }
          if (localEntry) ctx.localMleUsed.set(team.id, localEntry);
          else ctx.localMleUsed.delete(team.id);
        }
        mleRejects++;
      }

      if (!signedThisIteration && ctx.pool.length > 0 && rosterSize < fillTarget) {
        const minSalaryUSD = getMinSalaryUSD(ctx.state.leagueStats);
        const minDealCandidate = ctx.pool
          .filter(p => !isLoyalBlocked(p, team.id, ctx.currentYear))
          .filter(p => !isRecentWaiverByTeam(p, team.id, ctx.state.date))
          .map(player => ({
            player,
            marketOffer: clampOfferForDate(
              computeContractOffer(player, ctx.state.leagueStats as any),
              ctx.state.date,
              ctx.currentYear,
              ctx.state.leagueStats,
              getK2Ovr(player),
            ),
          }))
          .filter(({ player, marketOffer }) => isEmergencyMinimumRosterOfferEligible({
            playerK2: getK2Ovr(player),
            marketOfferUSD: marketOffer.salaryUSD,
            minSalaryUSD,
          }))
          .sort((a, b) => (a.player.overallRating ?? 0) - (b.player.overallRating ?? 0))[0];
        if (minDealCandidate) {
          const minDealOffer = { salaryUSD: minSalaryUSD, years: 1, hasPlayerOption: false };
          signedThisIteration = ctx.signPlayer(
            minDealCandidate.player,
            team,
            minDealOffer,
            null,
            0,
            false,
            ctx.isCampInvite(minDealCandidate.player, minDealOffer),
          );
          if (signedThisIteration) {
            forcedMinDeal = true;
            rosterSize = computeRosterSize();
          }
        }
      }
    }

    if (rosterSize >= fillTarget) stopReason = 'reached fill target';
    else if (ctx.pool.length === 0) stopReason = 'pool exhausted';
    else if (!signedThisIteration) stopReason = 'no affordable candidate (all cap+MLE+min blocked — pool empty?)';

    if (pass4Debug) {
      pass4Diag.push({
        team: team.name,
        startRoster,
        endRoster: rosterSize,
        fillTarget,
        signedThisPass: alreadySigned() - startSignedCount,
        iterations,
        poolSizeStart,
        poolSizeEnd: ctx.pool.length,
        capRejects,
        mleRejects,
        forcedMinDeal,
        stopReason,
      });
    }
  }

  if (pass4Debug && pass4Diag.length > 0) {
    const underFilled = pass4Diag.filter(d => d.endRoster < d.fillTarget);
    simDebug('free-agency', () => (
      `[Pass4] ${ctx.state.date} — ${pass4Diag.length} teams processed, ${underFilled.length} still below fillTarget after pass`
    ), { event: 'pass4-summary', teams: pass4Diag.length, underFilled: underFilled.length });
    if (underFilled.length > 0) {
      simDebug('free-agency', () => (
        `[Pass4] Teams still under target: ${underFilled.map(d => `${d.team} ${d.endRoster}/${d.fillTarget} (${d.stopReason})`).join(' · ')}`
      ), { event: 'pass4-underfilled', teams: underFilled.length });
    }
  }

  if ((ctx.state.leagueStats as any).minimumPayrollEnabled === false) return;
  const minSalaryUSD = getMinSalaryUSD(ctx.state.leagueStats);
  for (const team of ctx.sortedAITeams) {
    const standardTarget = getStandardRosterTargetAfterMarketReservations(ctx.state, team.id, ctx.maxStandard);
    const existingStd = ctx.state.players.filter(p => p.tid === team.id && !isActiveTwoWay(p)).length;
    const signedStd = ctx.results.filter(r => r.teamId === team.id && !isActiveTwoWay(r)).length;
    let rosterSize = existingStd + signedStd;
    if (rosterSize >= standardTarget) continue;

    const profile = getTeamCapProfileFromState(ctx.state, team.id, ctx.thresholds as any);
    const roundSpentUSD = ctx.results
      .filter(result => result.teamId === team.id && !isActiveTwoWay(result))
      .reduce((sum, result) => sum + result.salaryUSD, 0);
    let effectivePayroll = profile.payrollUSD + roundSpentUSD;
    if (effectivePayroll >= (ctx.thresholds as any).minPayroll) continue;

    let continueLoop = true;
    while (effectivePayroll < (ctx.thresholds as any).minPayroll && rosterSize < standardTarget && ctx.pool.length > 0 && continueLoop) {
      continueLoop = false;
      const openSlots = standardTarget - rosterSize;
      const floorGap = (ctx.thresholds as any).minPayroll - effectivePayroll;
      const targetPerSlot = Math.max(minSalaryUSD, Math.round(floorGap / openSlots));

      const candidate = ctx.pool
        .filter(p => !isLoyalBlocked(p, team.id, ctx.currentYear))
        .filter(p => !isRecentWaiverByTeam(p, team.id, ctx.state.date))
        .map(p => {
          const limits = getContractLimits(p, ctx.state.leagueStats as any);
          const baseOfferRaw = computeContractOffer(p, ctx.state.leagueStats as any);
          const baseOffer = clampOfferForDate(baseOfferRaw, ctx.state.date, ctx.currentYear, ctx.state.leagueStats, getK2Ovr(p));
          const salaryUSD = Math.min(
            limits.maxSalaryUSD,
            Math.max(minSalaryUSD, Math.min(targetPerSlot, baseOffer.salaryUSD)),
          );
          return { player: p, offer: { ...baseOffer, salaryUSD } };
        })
        .filter(({ offer }) => offer.salaryUSD >= minSalaryUSD)
        .sort((a, b) => b.offer.salaryUSD - a.offer.salaryUSD)[0];

      if (!candidate) break;
      continueLoop = ctx.signPlayer(candidate.player, team, candidate.offer, null, 0, false, ctx.isCampInvite(candidate.player, candidate.offer));
      if (continueLoop) {
        rosterSize++;
        effectivePayroll += candidate.offer.salaryUSD;
      }
    }
  }
}
