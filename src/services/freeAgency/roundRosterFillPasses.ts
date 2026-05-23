import { computeContractOffer, getContractLimits, getMLEAvailability, getTeamCapProfileFromState } from '../../utils/salaryUtils';
import { clampOfferForDate, getK2Ovr, getMinSalaryUSD, isLoyalBlocked, isRecentWaiverByTeam, isTwoWayOriginEligible, playerAge } from './aiFreeAgencyHelpers';
import type { FreeAgencyRoundContext } from './roundShared';

export function runTwoWayAndCampPasses(
  ctx: FreeAgencyRoundContext,
  isPreseasonWindow: boolean,
  maxCampRoster: number,
) {
  const maxTwoWay = ctx.state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;
  const twoWayEnabled = (ctx.state.leagueStats as any).twoWayContractsEnabled ?? true;
  const TWO_WAY_OVR_CAP = 60;
  const TWO_WAY_SALARY_USD = 625_000;

  if (twoWayEnabled && maxTwoWay > 0) {
    for (const team of ctx.sortedAITeams) {
      if (isPreseasonWindow) {
        const totalOnTeam = ctx.state.players.filter(p => p.tid === team.id).length;
        const totalSigned = ctx.results.filter(r => r.teamId === team.id).length;
        if (totalOnTeam + totalSigned >= maxCampRoster) continue;
      }

      const existingTwoWay = ctx.state.players.filter(p => p.tid === team.id && !!(p as any).twoWay).length;
      const signedTwoWay = ctx.results.filter(r => r.teamId === team.id && !!(r as any).twoWay).length;
      const slotsAvailable = maxTwoWay - (existingTwoWay + signedTwoWay);
      if (slotsAvailable <= 0) continue;

      const twoWayCandidates = ctx.pool
        .filter(p => (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
        .filter(p => isTwoWayOriginEligible(p))
        .filter(p => {
          const age = playerAge(p, ctx.currentYear);
          if (age >= 30) return false;
          if (age <= 24) return true;
          const yosFromStats = ((p as any).stats ?? [])
            .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
          const draftYr = (p as any).draft?.year;
          const yosFromDraft = (draftYr && ctx.currentYear > draftYr) ? ctx.currentYear - draftYr : 0;
          return Math.max(yosFromStats, yosFromDraft) <= 2;
        })
        .filter(p => !isLoyalBlocked(p, team.id, ctx.currentYear))
        .filter(p => !isRecentWaiverByTeam(p, team.id, ctx.state.date))
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

      let filled = 0;
      for (const candidate of twoWayCandidates) {
        if (filled >= slotsAvailable) break;
        ctx.signPlayer(
          candidate,
          team,
          { salaryUSD: TWO_WAY_SALARY_USD, years: 1, hasPlayerOption: false },
          null,
          0,
          true,
        );
        filled++;
      }
    }
  }

  if (!isPreseasonWindow) return;

  const NG_OVR_CAP = 50;
  const minSalaryUSDPreseason = getMinSalaryUSD(ctx.state.leagueStats);
  const seasonCap = ctx.thresholds.salaryCap ?? 140_000_000;
  const NG_CAP_PCT_BY_OVR: Array<{ maxOvr: number; pct: number }> = [
    { maxOvr: 50, pct: 0.009 },
    { maxOvr: 55, pct: 0.011 },
    { maxOvr: 60, pct: 0.014 },
    { maxOvr: 65, pct: 0.019 },
    { maxOvr: 70, pct: 0.024 },
    { maxOvr: 75, pct: 0.029 },
    { maxOvr: 99, pct: 0.034 },
  ];
  const ngFillTarget = Math.min(maxCampRoster, ctx.maxStandard + 3);

  for (const team of ctx.sortedAITeams) {
    const totalCamp = ctx.state.players.filter(p => p.tid === team.id).length
      + ctx.results.filter(r => r.teamId === team.id).length;
    if (totalCamp >= ngFillTarget) continue;

    const ngSlots = ngFillTarget - totalCamp;
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
      ctx.signPlayer(
        candidate,
        team,
        { salaryUSD: ngSalaryUSD, years: 1, hasPlayerOption: false },
        null,
        0,
        false,
        true,
      );
      filled++;
    }
  }
}

export function runRosterCompletionPasses(ctx: FreeAgencyRoundContext) {
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
    const fillTarget = ctx.maxStandard;
    const alreadySigned = () => ctx.results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
    const computeRosterSize = () =>
      ctx.state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length + alreadySigned();
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
      const nearFullBias = rosterSize >= 13;
      const minSalaryUSDForBias = getMinSalaryUSD(ctx.state.leagueStats);
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
        .map(({ player, offer }) => nearFullBias
          ? { player, offer: { ...offer, salaryUSD: Math.min(offer.salaryUSD, minSalaryUSDForBias * 2), years: 1 } }
          : { player, offer })
        .sort((a, b) => (b.player.overallRating ?? 0) - (a.player.overallRating ?? 0) || a.offer.salaryUSD - b.offer.salaryUSD);

      const roundSpentUSD = ctx.results.filter(r => r.teamId === team.id).reduce((s, r) => s + r.salaryUSD, 0);
      const effectiveCapSpace = profile.capSpaceUSD - roundSpentUSD;
      const effectivePayroll = profile.payrollUSD + roundSpentUSD;

      for (const { player, offer } of candidates) {
        if (offer.salaryUSD <= effectiveCapSpace + 2_000_000) {
          ctx.signPlayer(player, team, offer, null, 0, false, ctx.isCampInvite(player, offer));
          signedThisIteration = true;
          rosterSize = computeRosterSize();
          break;
        }
        capRejects++;

        const mleAvail = getMLEAvailability(team.id, effectivePayroll, offer.salaryUSD, ctx.thresholds as any, effectiveLS as any);
        if (!mleAvail.blocked && mleAvail.type && offer.salaryUSD <= mleAvail.available) {
          const prevUsed = localEntry?.usedUSD ?? 0;
          ctx.localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
          ctx.signPlayer(player, team, offer, mleAvail.type, offer.salaryUSD, false, ctx.isCampInvite(player, offer));
          signedThisIteration = true;
          rosterSize = computeRosterSize();
          break;
        }
        mleRejects++;
      }

      if (!signedThisIteration && ctx.pool.length > 0 && rosterSize < fillTarget) {
        const minSalaryUSD = getMinSalaryUSD(ctx.state.leagueStats);
        const minDealCandidate = ctx.pool
          .filter(p => !isLoyalBlocked(p, team.id, ctx.currentYear))
          .filter(p => !isRecentWaiverByTeam(p, team.id, ctx.state.date))
          .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0))[0];
        if (minDealCandidate) {
          const minDealOffer = { salaryUSD: minSalaryUSD, years: 1, hasPlayerOption: false };
          ctx.signPlayer(
            minDealCandidate,
            team,
            minDealOffer,
            null,
            0,
            false,
            ctx.isCampInvite(minDealCandidate, minDealOffer),
          );
          signedThisIteration = true;
          forcedMinDeal = true;
          rosterSize = computeRosterSize();
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
    console.log(`[Pass4] ${ctx.state.date} — ${pass4Diag.length} teams processed, ${underFilled.length} still below fillTarget after pass`);
    console.table(pass4Diag);
    if (underFilled.length > 0) {
      console.log('[Pass4] Teams still under target after Pass 4:', underFilled.map(d =>
        `${d.team} ${d.endRoster}/${d.fillTarget} (${d.stopReason})`).join(' · '));
    }
  }

  if ((ctx.state.leagueStats as any).minimumPayrollEnabled === false) return;
  const minSalaryUSD = getMinSalaryUSD(ctx.state.leagueStats);
  for (const team of ctx.sortedAITeams) {
    const existingStd = ctx.state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length;
    const signedStd = ctx.results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
    let rosterSize = existingStd + signedStd;
    if (rosterSize >= ctx.maxStandard) continue;

    const profile = getTeamCapProfileFromState(ctx.state, team.id, ctx.thresholds as any);
    const roundSpentUSD = ctx.results.filter(r => r.teamId === team.id).reduce((s, r) => s + r.salaryUSD, 0);
    let effectivePayroll = profile.payrollUSD + roundSpentUSD;
    if (effectivePayroll >= (ctx.thresholds as any).minPayroll) continue;

    let continueLoop = true;
    while (effectivePayroll < (ctx.thresholds as any).minPayroll && rosterSize < ctx.maxStandard && ctx.pool.length > 0 && continueLoop) {
      continueLoop = false;
      const openSlots = ctx.maxStandard - rosterSize;
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
      ctx.signPlayer(candidate.player, team, candidate.offer, null, 0, false, ctx.isCampInvite(candidate.player, candidate.offer));
      continueLoop = true;
      rosterSize++;
      effectivePayroll += candidate.offer.salaryUSD;
    }
  }
}
