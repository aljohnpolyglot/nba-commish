import type { GameState, NBAPlayer, NBATeam, DraftPick, TradeProposal } from '../types';
import { getCapThresholds, effectiveRecord } from '../utils/salaryUtils';
import { isUntouchable, isRecentlySignedLocked, computeLeaguePerAvg, type TVContext } from './trade/tradeValueEngine';
import { AwardService } from './logic/AwardService';
import type { TeamMode } from './trade/tradeValueEngine';
import { generateAITradeProposal, generatePickOnlyProposal } from './trade/tradeFinderEngine';
import { resolveTeamStrategyProfile, tradeRoleToTeamMode } from '../utils/teamStrategy';
import { SettingsManager } from './SettingsManager';
import { getMinTradableSeason, getTradablePicks, getMaxTradableSeason, DEFAULT_TRADABLE_PICK_SEASONS } from './draft/DraftPickGenerator';
import { buildClassStrengthMap, buildFullDraftSlotMap, formatPickLabel } from './draft/draftClassStrength';
import { getGMAttributes, getGMName, tradeInitiateProb, pickHoardResistance } from './staff/gmAttributes';
import { validateStepienRule } from './trade/stepienRule';
import { validateCBATradeRules } from '../utils/cbaTradeRules';
import { daysBetweenGameDates, isInPostDeadlinePreFAWindow, parseGameDate, toISODateString } from '../utils/dateUtils';
export { executeAITrade } from './AITradeExecution';

/** Players traded within the last 60 days — not eligible to be traded again. */
function recentlyTradedPlayerIds(state: GameState): Set<string> {
  const cutoff = new Date(parseGameDate(state.date).getTime() - 60 * 24 * 60 * 60 * 1000);
  const cutoffStr = toISODateString(cutoff);
  const traded = new Set<string>();
  for (const rawEntry of (state.history ?? [])) {
    const entry = rawEntry as any;
    if (!entry || entry.type !== 'Trade') continue;
    if (entry.date < cutoffStr) continue;
    // Extract player internalIds from the history text — history stores them as playerIds
    const ids: string[] = (entry as any).playerIds ?? [];
    for (const id of ids) traded.add(id);
  }
  // Also check pending/accepted proposals not yet executed
  for (const p of (state.tradeProposals ?? [])) {
    if (p.status !== 'accepted' && p.status !== 'pending') continue;
    for (const id of [...(p.playersOffered ?? []), ...(p.playersRequested ?? [])]) traded.add(id);
  }
  return traded;
}

export function generateAIDayTradeProposals(state: GameState): TradeProposal[] {
  if (!SettingsManager.getSettings().allowAITrades) return [];

  const proposals: TradeProposal[] = [];
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  // In GM mode, exclude the user's team from AI trade proposals. In commissioner mode every team is AI,
  // and userTeamId may still be the remembered "last managed" franchise across mode switches.
  // assistantGMActive does NOT bypass the user-team guard. Auto-Resolve was
  // grinding the user's rebuild — auto-trading future picks + auto-signing bums.
  // The flag means "sim through phases without prompting", not "delegate the team".
  const userTeamId = (state.gameMode === 'gm') ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const thresholds = getCapThresholds(state.leagueStats as any);
  const stepienOn = state.leagueStats?.stepienRuleEnabled !== false;
  const tradablePickWindow = state.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  const isPostDeadlinePreFA = isInPostDeadlinePreFAWindow(state.date, currentYear, state.leagueStats as any);
  const recentlySignedLockMs = {
    currentDate: state.date ?? '',
    leagueStats: state.leagueStats as any,
  };
  const allDraftPicks = state.draftPicks ?? [];
  const stepienOk = (tidA: number, tidB: number, dpidsFromA: number[], dpidsFromB: number[]): boolean => {
    if (!stepienOn) return true;
    if (dpidsFromA.length === 0 && dpidsFromB.length === 0) return true;
    const fromA = allDraftPicks.filter(p => dpidsFromA.includes(p.dpid));
    const fromB = allDraftPicks.filter(p => dpidsFromB.includes(p.dpid));
    return validateStepienRule(allDraftPicks, currentYear, tradablePickWindow, tidA, tidB, fromA, fromB).ok;
  };

  // Effective standings still matter for auto strategy resolution.
  // effectiveRecord falls back to last season when < 10 games played (offseason/preseason)
  const eastTeams = state.teams.filter(t => t.conference === 'East').map(t => ({ t, rec: effectiveRecord(t, currentYear) })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
  const westTeams = state.teams.filter(t => t.conference === 'West').map(t => ({ t, rec: effectiveRecord(t, currentYear) })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
  const confStandings = new Map<number, { confRank: number; gbFromLeader: number }>();
  for (const confTeams of [eastTeams, westTeams]) {
    const leader = confTeams[0];
    const leaderWins = leader?.rec.wins ?? 0;
    const leaderLosses = leader?.rec.losses ?? 0;
    confTeams.forEach(({ t, rec }, i) => {
      const gb = ((leaderWins - rec.wins) + (rec.losses - leaderLosses)) / 2;
      confStandings.set(t.id, { confRank: i + 1, gbFromLeader: Math.max(0, gb) });
    });
  }

  const strategyByTeam = new Map<number, ReturnType<typeof resolveTeamStrategyProfile>>();
  const getStrategy = (team: NBATeam) => {
    const cached = strategyByTeam.get(team.id);
    if (cached) return cached;
    const next = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    strategyByTeam.set(team.id, next);
    return next;
  };

  // Franchise-timeline anchor: teams whose best player is ≤ 25 and not in playoffs
  // are developing and should not initiate as buyers
  const getOvr = (p: NBAPlayer): number => {
    const lastRating = (p as any).ratings?.[(p as any).ratings?.length - 1];
    return p.overallRating ?? lastRating?.ovr ?? 60;
  };
  const isBuildingAroundYouth = (t: NBATeam): boolean => {
    const strategy = getStrategy(t);
    const standings = confStandings.get(t.id);
    if (!standings || standings.confRank <= 6) return false; // playoff teams always OK
    if (strategy.key === 'development' || strategy.key === 'rebuilding') return true;
    const roster = state.players.filter(p => p.tid === t.id);
    const starPlayer = roster.sort((a, b) => getOvr(b) - getOvr(a))[0];
    if (!starPlayer) return false;
    const starAge = (starPlayer as any).age ?? ((starPlayer as any).born?.year ? currentYear - (starPlayer as any).born.year : 27);
    return starAge <= 25 && getOvr(starPlayer) >= 65;
  };

  const buyerTeams = state.teams.filter(t =>
    t.id !== userTeamId &&
    getStrategy(t).initiateBuyTrades &&
    !isBuildingAroundYouth(t)
  );
  const sellerTeams = state.teams.filter(t =>
    t.id !== userTeamId &&
    (getStrategy(t).initiateSellTrades || !getStrategy(t).initiateBuyTrades)
  );

  if (buyerTeams.length === 0 || sellerTeams.length === 0) return [];

  const recentlyTraded = recentlyTradedPlayerIds(state);
  const reservedTeams = new Set<number>();
  const reservedAssetIds = new Set<string>();

  // ── Main proposal loop: delegate to tradeFinderEngine ─────────────────────
  // Share the exact matching logic TradeFinderView uses so AI-AI proposals get
  // the same variety (star+pick packages, 2-for-1 returns, absorb/dump variants,
  // untouchable unlocks on monster offers) instead of the old rigid
  // "one player + picks" shape that made every AI deal read like a salary dump.
  const teamsList = state.teams.filter(t => t.id > 0 && t.id < 100);
  const powerRanks = new Map<number, number>();
  [...teamsList]
    .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
    .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses))
    .forEach(({ t }, i) => powerRanks.set(t.id, i + 1));

  const teamOutlooksMap = new Map<number, { role: string }>();
  for (const t of teamsList) teamOutlooksMap.set(t.id, { role: getStrategy(t).outlook.role });

  // Pre-filter recently-traded players from the engine's view so it never
  // re-proposes a player who just moved.
  const enginePlayers = state.players.filter(p => !recentlyTraded.has(p.internalId));

  const minTradableSeason = getMinTradableSeason(state);
  const tradablePicks = getTradablePicks(state);
  const classStrengthByYear = buildClassStrengthMap(state.players, currentYear, currentYear, getMaxTradableSeason(state));
  const lotterySlotByTid = buildFullDraftSlotMap((state as any).draftLotteryResult, state.teams);

  // MVP-race rank — flag franchise-altering candidates so the engine treats top-30
  // MVP players as untouchable (top-10 globally, top-30 for contenders) and gives
  // a TV premium so the buyer must actually pay franchise-tier compensation.
  const mvpTop = AwardService.calculateMVPRankings(state.players, state.teams, currentYear, 30);
  const mvpRank = new Map<string, number>();
  mvpTop.forEach((c, i) => mvpRank.set(c.player.internalId, i + 1));
  const month = state.date ? new Date(state.date).getMonth() + 1 : 0;
  const isRegularSeason = (month >= 10 && month <= 12) || (month >= 1 && month <= 4);
  const tvContext: TVContext = {
    leaguePerAvg: isRegularSeason ? computeLeaguePerAvg(state.players, currentYear) : 15,
    isRegularSeason,
    mvpRank,
  };

  // Sort buyers by GM trade_aggression (desc) so aggressive GMs get first crack
  // at today's proposal slots; passive GMs rarely initiate.
  const buyerTeamsByAgg = [...buyerTeams]
    .map(t => ({ team: t, agg: getGMAttributes(state, t.id).trade_aggression }))
    .sort((a, b) => b.agg - a.agg);

  let count = 0;
  for (const { team: buyerTeam, agg: buyerAgg } of buyerTeamsByAgg) {
    if (count >= 2) break; // max 2 proposals per day
    if (reservedTeams.has(buyerTeam.id)) continue;

    // Aggression gate: low-aggression GMs skip their turn probabilistically
    if (Math.random() > tradeInitiateProb(buyerAgg)) continue;

    for (const sellerTeam of sellerTeams) {
      if (sellerTeam.id === buyerTeam.id) continue;
      if (reservedTeams.has(sellerTeam.id)) continue;
      const proposal = generateAITradeProposal({
        buyerTid: buyerTeam.id,
        sellerTid: sellerTeam.id,
        players: enginePlayers,
        teams: teamsList,
        draftPicks: tradablePicks,
        currentYear,
        minTradableSeason,
        powerRanks,
        teamOutlooks: teamOutlooksMap,
        tvContext,
        classStrengthByYear,
        lotterySlotByTid,
        stepienEnabled: stepienOn,
        tradablePickWindow,
        isPostDeadlinePreFA,
        recentlySignedLockMs,
      });
      if (!proposal) continue;

      const playersOffered: string[] = [];
      const picksOffered: number[] = [];
      for (const it of proposal.buyerGives) {
        if (it.type === 'player' && it.player) playersOffered.push(it.player.internalId);
        else if (it.type === 'pick' && it.pick) picksOffered.push(it.pick.dpid);
      }
      const playersRequested: string[] = [];
      const picksRequested: number[] = [];
      for (const it of proposal.sellerGives) {
        if (it.type === 'player' && it.player) playersRequested.push(it.player.internalId);
        else if (it.type === 'pick' && it.pick) picksRequested.push(it.pick.dpid);
      }
      // Sanity: both sides must have at least one asset (engine guarantees this
      // but guard anyway against empty baskets sneaking through).
      if (playersOffered.length + picksOffered.length === 0) continue;
      if (playersRequested.length + picksRequested.length === 0) continue;
      const proposalAssetIds = [
        ...playersOffered,
        ...playersRequested,
        ...picksOffered.map(String),
        ...picksRequested.map(String),
      ];
      if (proposalAssetIds.some(id => reservedAssetIds.has(id))) continue;

      // scouting_focus: pick-hoarders are reluctant to ship picks out. Each outgoing
      // pick rolls against the buyer's hoard resistance; if any rolls fail, the GM
      // walks away from a deal that bleeds draft capital.
      const buyerHoard = pickHoardResistance(getGMAttributes(state, buyerTeam.id).scouting_focus);
      if (buyerHoard > 0 && picksOffered.some(() => Math.random() < buyerHoard)) continue;

      const cba = validateCBATradeRules({
        teamAId: buyerTeam.id,
        teamBId: sellerTeam.id,
        teamAPlayers: proposal.buyerGives.filter(it => it.type === 'player' && !!it.player).map(it => it.player!),
        teamBPlayers: proposal.sellerGives.filter(it => it.type === 'player' && !!it.player).map(it => it.player!),
        teamAPicks: proposal.buyerGives.filter(it => it.type === 'pick' && !!it.pick).map(it => it.pick!),
        teamBPicks: proposal.sellerGives.filter(it => it.type === 'pick' && !!it.pick).map(it => it.pick!),
        teams: state.teams,
        players: state.players,
        leagueStats: state.leagueStats,
        currentDate: state.date,
        currentYear,
      });
      if (!cba.ok) continue;
      if (!stepienOk(buyerTeam.id, sellerTeam.id, picksOffered, picksRequested)) continue;

      proposals.push({
        id: `ai-trade-${buyerTeam.id}-${sellerTeam.id}-${Date.now()}`,
        proposingTeamId: buyerTeam.id,
        receivingTeamId: sellerTeam.id,
        proposingGMName: getGMName(state, buyerTeam.id),
        playersOffered,
        playersRequested,
        picksOffered,
        picksRequested,
        proposedDate: state.date,
        status: 'accepted',
        isAIvsAI: true,
      });
      reservedTeams.add(buyerTeam.id);
      reservedTeams.add(sellerTeam.id);
      proposalAssetIds.forEach(id => reservedAssetIds.add(id));
      count++;
      break;
    }
  }

  // ── Salary dump loop ──────────────────────────────────────────────────────────
  // Rebuilding team dumps an expiring/overpaid player + pick to a cap-space team.
  // Only fires if we haven't already generated 2 proposals above.
  if (count < 2) {
    // Sorted DESC by cap room — biggest cap-space teams absorb dumps first instead
    // of the iteration-order team always winning the find().
    const capUSD = thresholds.salaryCap ?? 136_000_000;
    const capSpaceTeams = state.teams
      .map(t => {
        const payrollUSD = state.players
          .filter(p => p.tid === t.id)
          .reduce((s, p) => s + (p.contract?.amount ?? 0), 0) * 1000;
        return { team: t, capRoom: capUSD - payrollUSD };
      })
      .filter(({ team, capRoom }) => team.id !== userTeamId && capRoom > capUSD * 0.15)
      .sort((a, b) => b.capRoom - a.capRoom)
      .map(({ team }) => team);

    // Same aggression-sort as the main loop so the most active GMs dump first.
    const sellerTeamsByAgg = [...sellerTeams]
      .filter(t => getStrategy(t).initiateSalaryDumps)
      .map(t => ({ team: t, agg: getGMAttributes(state, t.id).trade_aggression }))
      .sort((a, b) => b.agg - a.agg);

    for (const { team: sellerTeam, agg: sellerAgg } of sellerTeamsByAgg) {
      if (count >= 2) break;
      if (reservedTeams.has(sellerTeam.id)) continue;
      // Never dump from youth-rebuild teams — they're building around young talent
      if (isBuildingAroundYouth(sellerTeam)) continue;
      // Low-aggression GMs are reluctant to initiate salary dumps
      if (Math.random() > tradeInitiateProb(sellerAgg)) continue;

      const sellerRoster = state.players.filter(p => p.tid === sellerTeam.id);

      // Find the worst-value expiring contract on this team (dump candidate)
      // Use isUntouchable to protect key players, then filter for expiring salary.
      // Walking expirings (post-deadline pre-FA) are useless to absorb — skip.
      const dumpSellerMode: TeamMode = getStrategy(sellerTeam).teamMode;
      const dumpCandidate = sellerRoster
        .filter(p => {
          if (recentlyTraded.has(p.internalId)) return false;
          if (isUntouchable(p, dumpSellerMode, currentYear, mvpRank)) return false;
          if (isPostDeadlinePreFA && (p.contract?.exp ?? currentYear + 5) <= currentYear) return false;
          if (isRecentlySignedLocked(p, recentlySignedLockMs.currentDate, recentlySignedLockMs.leagueStats)) return false;
          const exp = p.contract?.exp ?? (currentYear + 2);
          return exp <= currentYear + 1 && (p.contract?.amount ?? 0) > 10_000;
        })
        .sort((a, b) => (b.contract?.amount ?? 0) - (a.contract?.amount ?? 0))[0]; // biggest expiring salary

      if (!dumpCandidate) continue;

      // Find a cap-space team willing to absorb it (gets nothing but cap flexibility)
      const absorber = capSpaceTeams.find(t => t.id !== sellerTeam.id && !reservedTeams.has(t.id));
      if (!absorber) continue;

      // Seller attaches a 2nd-round pick to sweeten the dump
      const sellerPicks = tradablePicks.filter(pk =>
        pk.tid === sellerTeam.id && pk.round === 2
      );
      if (sellerPicks.length === 0) continue; // no picks to attach = no dump deal

      // scouting_focus: pick-hoarding sellers refuse to include the sweetener,
      // which kills the dump (no sweetener = absorber has no reason to take it on).
      const sellerHoard = pickHoardResistance(getGMAttributes(state, sellerTeam.id).scouting_focus);
      if (sellerHoard > 0 && Math.random() < sellerHoard) continue;

      const dumpPick = sellerPicks[0];
      if (reservedAssetIds.has(dumpCandidate.internalId) || reservedAssetIds.has(String(dumpPick.dpid))) continue;
      const dumpSalary = dumpCandidate.contract?.amount ?? 0;
      const absorberPayroll = state.players
        .filter(p => p.tid === absorber.id)
        .reduce((s, p) => s + (p.contract?.amount ?? 0), 0);

      // Absorber gets the player's salary — make sure it fits under the cap.
      // Both payroll and dumpSalary are BBGM thousands; salaryCap is USD.
      if ((absorberPayroll + dumpSalary) * 1000 > (thresholds.salaryCap ?? 136_000_000) * 1.1) continue;

      if (!stepienOk(sellerTeam.id, absorber.id, [dumpPick.dpid], [])) continue;
      const cbaDump = validateCBATradeRules({
        teamAId: sellerTeam.id,
        teamBId: absorber.id,
        teamAPlayers: [dumpCandidate],
        teamBPlayers: [],
        teamAPicks: [dumpPick],
        teamBPicks: [],
        teams: state.teams,
        players: state.players,
        leagueStats: state.leagueStats,
        currentDate: state.date,
        currentYear,
      });
      if (!cbaDump.ok) continue;

      proposals.push({
        id: `ai-dump-${sellerTeam.id}-${absorber.id}-${Date.now()}`,
        proposingTeamId: sellerTeam.id,
        receivingTeamId: absorber.id,
        proposingGMName: getGMName(state, sellerTeam.id),
        playersOffered: [dumpCandidate.internalId],
        playersRequested: [],
        picksOffered: [dumpPick.dpid], // seller attaches a pick to move the salary
        picksRequested: [],
        proposedDate: state.date,
        status: 'accepted',
        isAIvsAI: true,
      });
      reservedTeams.add(sellerTeam.id);
      reservedTeams.add(absorber.id);
      reservedAssetIds.add(dumpCandidate.internalId);
      reservedAssetIds.add(String(dumpPick.dpid));
      count++;
    }
  }

  // ── Pick-restructure pass ─────────────────────────────────────────────────
  // Pure pick-for-pick (and pick-for-cash) proposals — buyer = contender,
  // seller = rebuilder. Generates ~1 per cycle on average so league-wide
  // ~2-4 pick-only trades land per season. Skips if 2 player trades already done.
  if (count < 2 && Math.random() < 0.6) {
    const contendBuyers = buyerTeamsByAgg.filter(({ team }) =>
      !reservedTeams.has(team.id) && tradeRoleToTeamMode(getStrategy(team).outlook.role) === 'contend',
    );
    const rebuildSellers = sellerTeams.filter(t =>
      !reservedTeams.has(t.id) && t.id !== userTeamId
      && (tradeRoleToTeamMode(getStrategy(t).outlook.role) === 'rebuild'
       || tradeRoleToTeamMode(getStrategy(t).outlook.role) === 'presti'),
    );
    outer: for (const { team: buyer } of contendBuyers) {
      for (const seller of rebuildSellers) {
        if (seller.id === buyer.id) continue;
        if (reservedTeams.has(seller.id)) continue;
        const buyerCashAvail = Math.max(0, 7_500_000 - ((buyer as any).cashUsedInTrades ?? 0));
        const sellerCashAvail = Math.max(0, 7_500_000 - ((seller as any).cashUsedInTrades ?? 0));
        const proposal = generatePickOnlyProposal({
          buyerTid: buyer.id, sellerTid: seller.id,
          teams: teamsList, draftPicks: tradablePicks, currentYear,
          minTradableSeason, powerRanks, teamOutlooks: teamOutlooksMap,
          classStrengthByYear, lotterySlotByTid,
          buyerCashAvailableUSD: buyerCashAvail,
          sellerCashAvailableUSD: sellerCashAvail,
          stepienEnabled: stepienOn,
          tradablePickWindow,
        });
        if (!proposal) continue;
        const picksOff = proposal.buyerGives.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid);
        const picksReq = proposal.sellerGives.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid);
        const cashOut = proposal.cashFromBuyerUSD ?? 0;
        const cashIn = proposal.cashFromSellerUSD ?? 0;
        if (picksOff.length + picksReq.length === 0 && cashOut + cashIn === 0) continue;
        if (!stepienOk(buyer.id, seller.id, picksOff, picksReq)) continue;
        const cba = validateCBATradeRules({
          teamAId: buyer.id,
          teamBId: seller.id,
          teamAPlayers: [],
          teamBPlayers: [],
          teamAPicks: proposal.buyerGives.filter(it => it.type === 'pick' && !!it.pick).map(it => it.pick!),
          teamBPicks: proposal.sellerGives.filter(it => it.type === 'pick' && !!it.pick).map(it => it.pick!),
          teamACashUSD: cashOut,
          teamBCashUSD: cashIn,
          teams: state.teams,
          players: state.players,
          leagueStats: state.leagueStats,
          currentDate: state.date,
          currentYear,
        });
        if (!cba.ok) continue;
        proposals.push({
          id: `ai-pickonly-${buyer.id}-${seller.id}-${Date.now()}`,
          proposingTeamId: buyer.id,
          receivingTeamId: seller.id,
          proposingGMName: getGMName(state, buyer.id),
          playersOffered: [],
          playersRequested: [],
          picksOffered: picksOff,
          picksRequested: picksReq,
          cashOfferedUSD: cashOut > 0 ? cashOut : undefined,
          cashRequestedUSD: cashIn > 0 ? cashIn : undefined,
          proposedDate: state.date,
          status: 'accepted',
          isAIvsAI: true,
        });
        reservedTeams.add(buyer.id);
        reservedTeams.add(seller.id);
        count++;
        break outer;
      }
    }
  }

  return proposals;
}


/**
 * Process pending proposals: expire stale, auto-resolve AI-vs-AI.
 */
export function processAITradeProposals(
  existing: TradeProposal[],
  currentDate: string,
): TradeProposal[] {
  return existing.map(p => {
    if (p.status !== 'pending') return p;

    const diffDays = daysBetweenGameDates(p.proposedDate, currentDate);
    if (diffDays > 7) return { ...p, status: 'expired' as const };
    if (p.isAIvsAI) return { ...p, status: 'accepted' as const };

    return p;
  });
}
