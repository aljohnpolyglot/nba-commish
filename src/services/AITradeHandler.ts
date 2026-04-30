/**
 * AITradeHandler.ts
 *
 * Autonomous AI-vs-AI trade logic.
 * Spec: multiseason_todo.md §2
 */

import type { GameState, NBAPlayer, NBATeam, DraftPick, TradeProposal } from '../types';
import { getCapThresholds, effectiveRecord } from '../utils/salaryUtils';
import { calcOvr2K, calcPlayerTV, isUntouchable } from './trade/tradeValueEngine';
import { isAssistantGMActive } from './assistantGMFlag';
import type { TeamMode } from './trade/tradeValueEngine';
import { generateAITradeProposal, generatePickOnlyProposal } from './trade/tradeFinderEngine';
import { CASH_TRADE_CAP_USD } from './trade/tradeValueEngine';
import { resolveTeamStrategyProfile, tradeRoleToTeamMode } from '../utils/teamStrategy';
import { SettingsManager } from './SettingsManager';
import { getMinTradableSeason, getTradablePicks, getMaxTradableSeason } from './draft/DraftPickGenerator';
import { buildClassStrengthMap, buildFullDraftSlotMap, formatPickLabel } from './draft/draftClassStrength';
import { getGMAttributes, getGMName, tradeInitiateProb, pickHoardResistance } from './staff/gmAttributes';
import { generateTPEsFromTrade } from '../utils/tradeExceptionUtils';
import { validateStepienRule } from './trade/stepienRule';
import { validateCBATradeRules } from '../utils/cbaTradeRules';

// ── §2d: Pick values ──────────────────────────────────────────────────────────

function pickValue(_pick: DraftPick): number {
  return 45; // default mid first round; future: derive from lottery odds
}

/** Sweetener value for gap-filling: conservative estimates so we don't over-value picks. */
function sweetenerPickValue(pk: DraftPick): number {
  return pk.round === 1 ? 30 : 14;
}

/** TV for a side (players + picks) from a team's perspective. */
function sideTV(players: NBAPlayer[], picks: DraftPick[], mode: TeamMode, currentYear: number): number {
  return players.reduce((s, p) => s + calcPlayerTV(p, mode, currentYear), 0)
    + picks.reduce((s, pk) => s + pickValue(pk), 0);
}

// ── §2e: Proposal loop ────────────────────────────────────────────────────────


/** Players traded within the last 60 days — not eligible to be traded again. */
function recentlyTradedPlayerIds(state: GameState): Set<string> {
  const cutoff = new Date(state.date);
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().split('T')[0];
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
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const thresholds = getCapThresholds(state.leagueStats as any);
  const stepienOn = state.leagueStats?.stepienRuleEnabled !== false;
  const tradablePickWindow = state.leagueStats?.tradableDraftPickSeasons ?? 7;
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
  const getRawK2 = (p: NBAPlayer) => calcOvr2K(p);

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
        classStrengthByYear,
        lotterySlotByTid,
        stepienEnabled: stepienOn,
        tradablePickWindow,
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
      if (buyerHoard > 0 && picksOffered.length > 0) {
        let vetoed = false;
        for (let i = 0; i < picksOffered.length; i++) {
          if (Math.random() < buyerHoard) { vetoed = true; break; }
        }
        if (vetoed) continue;
      }

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
    const capSpaceTeams = state.teams.filter(t => {
      if (t.id === userTeamId) return false;
      const payroll = state.players
        .filter(p => p.tid === t.id)
        .reduce((s, p) => s + (p.contract?.amount ?? 0), 0);
      return payroll * 1000 < (thresholds.salaryCap ?? 136_000_000) * 0.85; // >15% below cap
    });

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
      // Use isUntouchable to protect key players, then filter for expiring salary
      const dumpSellerMode: TeamMode = getStrategy(sellerTeam).teamMode;
      const dumpCandidate = sellerRoster
        .filter(p => {
          if (recentlyTraded.has(p.internalId)) return false;
          if (isUntouchable(p, dumpSellerMode, currentYear)) return false;
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

      // Absorber gets the player's salary — make sure it fits under the cap
      if (absorberPayroll + dumpSalary > (thresholds.salaryCap ?? 136_000) * 1.1) continue;

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

    const diffDays = (new Date(currentDate).getTime() - new Date(p.proposedDate).getTime()) / 86_400_000;
    if (diffDays > 7) return { ...p, status: 'expired' as const };
    if (p.isAIvsAI) return { ...p, status: 'accepted' as const };

    return p;
  });
}

// ── §2f: Execute AI-vs-AI trade ───────────────────────────────────────────────

function validateAITradeExecution(
  proposal: TradeProposal,
  state: GameState,
): { ok: true } | { ok: false; reason: string } {
  const {
    proposingTeamId,
    receivingTeamId,
    playersOffered,
    playersRequested,
    picksOffered,
    picksRequested,
  } = proposal;

  const dupPlayer = playersOffered.some(id => playersRequested.includes(id));
  const dupPick = picksOffered.some(id => picksRequested.includes(id));
  if (dupPlayer || dupPick) {
    return { ok: false, reason: 'AI trade failed revalidation: duplicate asset listed on both sides.' };
  }

  const offeredPlayers = state.players.filter(p => playersOffered.includes(p.internalId));
  const requestedPlayers = state.players.filter(p => playersRequested.includes(p.internalId));
  const offeredPicksState = state.draftPicks.filter(pk => picksOffered.includes(pk.dpid));
  const requestedPicksState = state.draftPicks.filter(pk => picksRequested.includes(pk.dpid));

  if (
    offeredPlayers.length !== playersOffered.length ||
    requestedPlayers.length !== playersRequested.length ||
    offeredPicksState.length !== picksOffered.length ||
    requestedPicksState.length !== picksRequested.length
  ) {
    return { ok: false, reason: 'AI trade failed revalidation: one or more assets no longer exist.' };
  }

  if (offeredPlayers.some(p => p.tid !== proposingTeamId) || offeredPicksState.some(pk => pk.tid !== proposingTeamId)) {
    return { ok: false, reason: 'AI trade failed revalidation: proposing team no longer owns all outgoing assets.' };
  }
  if (requestedPlayers.some(p => p.tid !== receivingTeamId) || requestedPicksState.some(pk => pk.tid !== receivingTeamId)) {
    return { ok: false, reason: 'AI trade failed revalidation: receiving team no longer owns all outgoing assets.' };
  }

  if (state.leagueStats?.stepienRuleEnabled !== false && (offeredPicksState.length > 0 || requestedPicksState.length > 0)) {
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const tradablePickWindow = state.leagueStats?.tradableDraftPickSeasons ?? 7;
    const stepien = validateStepienRule(state.draftPicks ?? [], currentYear, tradablePickWindow, proposingTeamId, receivingTeamId, offeredPicksState, requestedPicksState);
    if (!stepien.ok) {
      return { ok: false, reason: `AI trade failed revalidation: ${stepien.reason}` };
    }
  }

  // Empty asset basket is OK only if compensated by cash on the same side.
  // (Variant B: 2nd-round dump for cash — receiver gives nothing back, gets cash.)
  const cashFromProposer = proposal.cashOfferedUSD ?? 0;
  const cashFromReceiver = proposal.cashRequestedUSD ?? 0;
  if (playersOffered.length + picksOffered.length === 0 && cashFromProposer === 0) {
    return { ok: false, reason: 'AI trade failed revalidation: proposer side empty.' };
  }
  if (playersRequested.length + picksRequested.length === 0 && cashFromReceiver === 0) {
    return { ok: false, reason: 'AI trade failed revalidation: receiver side empty.' };
  }
  // Cash cap: each team's cumulative cashUsedInTrades + this trade ≤ $7.5M.
  const proposingTeamCashUsed = (state.teams.find(t => t.id === proposingTeamId) as any)?.cashUsedInTrades ?? 0;
  const receivingTeamCashUsed = (state.teams.find(t => t.id === receivingTeamId) as any)?.cashUsedInTrades ?? 0;
  if (proposingTeamCashUsed + cashFromProposer > 7_500_000 + 1) {
    return { ok: false, reason: 'AI trade failed revalidation: proposer cash cap.' };
  }
  if (receivingTeamCashUsed + cashFromReceiver > 7_500_000 + 1) {
    return { ok: false, reason: 'AI trade failed revalidation: receiver cash cap.' };
  }

  const cba = validateCBATradeRules({
    teamAId: proposingTeamId,
    teamBId: receivingTeamId,
    teamAPlayers: offeredPlayers,
    teamBPlayers: requestedPlayers,
    teamAPicks: offeredPicksState,
    teamBPicks: requestedPicksState,
    teamACashUSD: cashFromProposer,
    teamBCashUSD: cashFromReceiver,
    teams: state.teams,
    players: state.players,
    leagueStats: state.leagueStats,
    currentDate: state.date,
    currentYear: state.leagueStats?.year ?? new Date().getFullYear(),
    teamAReceivesSignAndTrade: proposal.isSignAndTrade === true,
    teamBReceivesSignAndTrade: proposal.isSignAndTrade === true,
  });
  if (!cba.ok) {
    return { ok: false, reason: `AI trade failed revalidation: ${cba.reason}` };
  }

  return { ok: true };
}

export function executeAITrade(proposal: TradeProposal, state: GameState): Partial<GameState> {
  const {
    proposingTeamId, receivingTeamId,
    playersOffered, playersRequested,
    picksOffered, picksRequested,
  } = proposal;

  const proposingTeam = state.teams.find(t => t.id === proposingTeamId);
  const receivingTeam = state.teams.find(t => t.id === receivingTeamId);

  if (!proposingTeam || !receivingTeam) return {};

  const validation = validateAITradeExecution(proposal, state);
  if (validation.ok === false) {
    return {
      tradeProposals: (state.tradeProposals ?? []).map(p =>
        p.id === proposal.id
          ? { ...p, status: 'rejected' as const, tradeText: validation.reason }
          : p
      ),
    };
  }

  // Move players
  const updatedPlayers = state.players.map(p => {
    if (playersOffered.includes(p.internalId)) return { ...p, tid: receivingTeamId, yearsWithTeam: 0 };
    if (playersRequested.includes(p.internalId)) return { ...p, tid: proposingTeamId, yearsWithTeam: 0 };
    return p;
  });

  // Transfer picks
  const updatedPicks = state.draftPicks.map(pk => {
    if (picksOffered.includes(pk.dpid)) return { ...pk, tid: receivingTeamId };
    if (picksRequested.includes(pk.dpid)) return { ...pk, tid: proposingTeamId };
    return pk;
  });

  // Build history entry
  const offeredNames = playersOffered.map(id => state.players.find(p => p.internalId === id)?.name).filter(Boolean);
  const requestedNames = playersRequested.map(id => state.players.find(p => p.internalId === id)?.name).filter(Boolean);

  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const lotterySlotByTid = buildFullDraftSlotMap((state as any).draftLotteryResult, state.teams);
  const formatPickDesc = (dpid: number): string => {
    const pk = state.draftPicks.find(p => p.dpid === dpid);
    if (!pk) return 'pick';
    const origTeam = state.teams.find(t => t.id === pk.originalTid);
    return `${formatPickLabel(pk, currentYear, lotterySlotByTid, false)} (${origTeam?.abbrev ?? '?'})`;
  };
  // Keep each side's picks with that side's players so direction is unambiguous:
  // everything before "to {receivingTeam}" flows TO the receiver; everything
  // after "for" flows BACK to the proposer. Previously both pick lists were
  // lumped after the requested-players clause, making it read as if picks
  // going OUT to the receiver were coming BACK to the proposer.
  const offeredPicks = picksOffered.map(formatPickDesc);
  const requestedPicks = picksRequested.map(formatPickDesc);
  const joinAssets = (players: string[], picks: string[]): string => {
    if (players.length === 0 && picks.length === 0) return '';
    if (picks.length === 0) return players.join(', ');
    if (players.length === 0) return picks.join(', ');
    return `${players.join(', ')} + ${picks.join(', ')}`;
  };
  const sentAssets = joinAssets(offeredNames as string[], offeredPicks);
  const recvAssets = joinAssets(requestedNames as string[], requestedPicks);

  const cashOut = proposal.cashOfferedUSD ?? 0;
  const cashIn = proposal.cashRequestedUSD ?? 0;
  const fmtCash = (usd: number) => `$${(usd / 1_000_000).toFixed(1)}M`;
  const sentWithCash = cashOut > 0 ? (sentAssets ? `${sentAssets} + ${fmtCash(cashOut)} cash` : `${fmtCash(cashOut)} cash`) : sentAssets;
  const recvWithCash = cashIn > 0 ? (recvAssets ? `${recvAssets} + ${fmtCash(cashIn)} cash` : `${fmtCash(cashIn)} cash`) : recvAssets;

  const historyText = sentWithCash && recvWithCash
    ? `TRADE: ${proposingTeam.name} sends ${sentWithCash} to ${receivingTeam.name} for ${recvWithCash}.`
    : sentWithCash
      ? `TRADE: ${proposingTeam.name} sends ${sentWithCash} to ${receivingTeam.name}.`
      : recvWithCash
        ? `TRADE: ${proposingTeam.name} receives ${recvWithCash} from ${receivingTeam.name}.`
        : `TRADE: ${proposingTeam.name} and ${receivingTeam.name} exchange picks.`;

  const historyEntry = {
    text: historyText,
    date: state.date,
    type: 'Trade' as const,
    playerIds: [...playersOffered, ...playersRequested],
    tid: proposingTeamId,
  };

  // Generate TPEs (over-cap senders only).
  const tpeEnabled = state.leagueStats?.tradeExceptionsEnabled !== false;
  let updatedTeams = state.teams;
  if (tpeEnabled) {
    const sentByProp = state.players.filter(p => playersOffered.includes(p.internalId));
    const sentByRecv = state.players.filter(p => playersRequested.includes(p.internalId));
    const txnForTPE = {
      teams: {
        [proposingTeamId]: { playersSent: sentByProp, picksSent: [] as DraftPick[] },
        [receivingTeamId]: { playersSent: sentByRecv, picksSent: [] as DraftPick[] },
      },
    };
    updatedTeams = generateTPEsFromTrade(txnForTPE, state.teams, state.players, state.leagueStats, state.date);
  }

  // Apply cash bookkeeping (sender's cashUsedInTrades counter increments).
  if (cashOut > 0 || cashIn > 0) {
    updatedTeams = updatedTeams.map(t => {
      if (t.id === proposingTeamId && cashOut > 0) {
        return { ...t, cashUsedInTrades: (t.cashUsedInTrades ?? 0) + cashOut };
      }
      if (t.id === receivingTeamId && cashIn > 0) {
        return { ...t, cashUsedInTrades: (t.cashUsedInTrades ?? 0) + cashIn };
      }
      return t;
    });
  }

  return {
    players: updatedPlayers,
    draftPicks: updatedPicks,
    teams: updatedTeams,
    history: [...(state.history ?? []), historyEntry],
    tradeProposals: (state.tradeProposals ?? []).map(p =>
      p.id === proposal.id ? { ...p, status: 'executed' as const } : p
    ),
  };
}
