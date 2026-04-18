/**
 * AITradeHandler.ts
 *
 * Autonomous AI-vs-AI trade logic.
 * Spec: multiseason_todo.md §2
 */

import type { GameState, NBAPlayer, NBATeam, DraftPick, TradeProposal } from '../types';
import { getCapThresholds, getTradeOutlook, effectiveRecord, topNAvgK2, getTeamCapProfile } from '../utils/salaryUtils';
import { calcOvr2K, calcPlayerTV, isUntouchable, isSalaryLegal } from './trade/tradeValueEngine';
import type { TeamMode } from './trade/tradeValueEngine';
import { generateAITradeProposal } from './trade/tradeFinderEngine';
import { SettingsManager } from './SettingsManager';

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

/** Look up the real GM name for a team from state.staff, falling back to a generic label. */
function getGMName(state: GameState, teamId: number): string {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return 'AI GM';
  const teamName = team.name.toLowerCase();
  const teamCity = (team.region ?? team.name).toLowerCase();
  const gms: any[] = (state as any).staff?.gms ?? [];
  const gm = gms.find(g => {
    const pos = (g.position ?? g.team ?? '').toLowerCase();
    return pos.includes(teamName) || pos.includes(teamCity) || pos.includes(team.abbrev?.toLowerCase() ?? '');
  });
  return gm?.name ?? `${team.name} GM`;
}

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
  const userTeamId = (state as any).userTeamId ?? state.teams[0]?.id;
  const thresholds = getCapThresholds(state.leagueStats as any);

  // Compute conference standings so getTradeOutlook can use confRank + GB
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

  const getOutlook = (t: NBATeam) => {
    const standings = confStandings.get(t.id);
    const rec = effectiveRecord(t, currentYear);
    const starAvg = topNAvgK2(state.players, t.id, 3);
    return getTradeOutlook(
      state.players.filter(p => p.tid === t.id).reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000_000), 0),
      rec.wins,
      rec.losses,
      state.players.filter(p => p.tid === t.id && ((p.contract?.exp ?? 0) <= currentYear)).length,
      thresholds,
      standings?.confRank,
      standings?.gbFromLeader,
      starAvg,
    );
  };

  // Franchise-timeline anchor: teams whose best player is ≤ 25 and not in playoffs
  // are developing and should not initiate as buyers
  const getOvr = (p: NBAPlayer): number => {
    const lastRating = (p as any).ratings?.[(p as any).ratings?.length - 1];
    return p.overallRating ?? lastRating?.ovr ?? 60;
  };
  const isBuildingAroundYouth = (t: NBATeam): boolean => {
    const standings = confStandings.get(t.id);
    if (!standings || standings.confRank <= 6) return false; // playoff teams always OK
    const roster = state.players.filter(p => p.tid === t.id);
    const starPlayer = roster.sort((a, b) => getOvr(b) - getOvr(a))[0];
    if (!starPlayer) return false;
    const starAge = (starPlayer as any).age ?? ((starPlayer as any).born?.year ? currentYear - (starPlayer as any).born.year : 27);
    return starAge <= 25 && getOvr(starPlayer) >= 65;
  };

  const buyerTeams = state.teams.filter(t =>
    t.id !== userTeamId &&
    ['buyer', 'heavy_buyer'].includes(getOutlook(t).role) &&
    !isBuildingAroundYouth(t)
  );
  const sellerTeams = state.teams.filter(t => t.id !== userTeamId && !['buyer', 'heavy_buyer'].includes(getOutlook(t).role));

  if (buyerTeams.length === 0 || sellerTeams.length === 0) return [];

  const recentlyTraded = recentlyTradedPlayerIds(state);
  const getRawK2 = (p: NBAPlayer) => calcOvr2K(p);

  /** TV mode for a team: buyers contend, sellers rebuild */
  const teamMode = (t: NBATeam): TeamMode =>
    ['buyer', 'heavy_buyer'].includes(getOutlook(t).role) ? 'contend' : 'rebuild';

  // Precompute normalized month string (used in pick eligibility checks)
  const normDate = state.date ? (() => {
    try { const d = new Date(state.date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; } catch { return `${currentYear}-01`; }
  })() : `${currentYear}-01`;

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
  for (const t of teamsList) teamOutlooksMap.set(t.id, { role: getOutlook(t).role });

  // Pre-filter recently-traded players from the engine's view so it never
  // re-proposes a player who just moved.
  const enginePlayers = state.players.filter(p => !recentlyTraded.has(p.internalId));

  const [, normMonthStr] = normDate.split('-');
  const normMonth = parseInt(normMonthStr, 10);
  // After March 1 the current draft has happened — picks for currentYear are
  // no longer tradable. Matches TradeMachineModal's minTradableSeason gate.
  const minTradableSeason = normMonth >= 3 ? currentYear + 1 : currentYear;

  let count = 0;
  for (const buyerTeam of buyerTeams) {
    if (count >= 2) break; // max 2 proposals per day

    for (const sellerTeam of sellerTeams) {
      if (sellerTeam.id === buyerTeam.id) continue;
      const proposal = generateAITradeProposal({
        buyerTid: buyerTeam.id,
        sellerTid: sellerTeam.id,
        players: enginePlayers,
        teams: teamsList,
        draftPicks: state.draftPicks ?? [],
        currentYear,
        minTradableSeason,
        powerRanks,
        teamOutlooks: teamOutlooksMap,
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

      // CBA 125% salary rule — when both sides send players the engine's match
      // variant doesn't pre-filter salary, so enforce it here before accepting.
      // Cap-absorb (one side all-picks) uses cap-space logic; skip the 125% gate
      // for those so legit absorption trades aren't thrown out.
      const buyerSalary = proposal.buyerGives
        .filter(it => it.type === 'player')
        .reduce((s, it) => s + (it.player?.contract?.amount ?? 0), 0);
      const sellerSalary = proposal.sellerGives
        .filter(it => it.type === 'player')
        .reduce((s, it) => s + (it.player?.contract?.amount ?? 0), 0);
      const bothHavePlayers = buyerSalary > 0 && sellerSalary > 0;
      if (bothHavePlayers && !isSalaryLegal(buyerSalary, sellerSalary)) continue;
      // Picks-only receiving side needs cap room to absorb the incoming salary
      // (same rule TradeMachineModal enforces for user trades).
      if (!bothHavePlayers && (buyerSalary + sellerSalary) > 0) {
        const absorberTid = buyerSalary === 0 ? buyerTeam.id : sellerTeam.id;
        const absorberTeam = state.teams.find(t => t.id === absorberTid);
        const incomingSalary = buyerSalary === 0 ? sellerSalary : buyerSalary;
        if (absorberTeam) {
          const capK = getTeamCapProfile(
            state.players, absorberTid,
            (absorberTeam as any).wins ?? 0, (absorberTeam as any).losses ?? 0,
            thresholds,
          ).capSpaceUSD / 1000;
          if (incomingSalary > capK + 100) continue;
        }
      }

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

    for (const sellerTeam of sellerTeams) {
      if (count >= 2) break;
      // Never dump from youth-rebuild teams — they're building around young talent
      if (isBuildingAroundYouth(sellerTeam)) continue;

      const sellerRoster = state.players.filter(p => p.tid === sellerTeam.id);

      // Find the worst-value expiring contract on this team (dump candidate)
      // Use isUntouchable to protect key players, then filter for expiring salary
      const dumpSellerMode: TeamMode = getOutlook(sellerTeam).role === 'rebuilding' ? 'presti'
        : ['buyer', 'heavy_buyer'].includes(getOutlook(sellerTeam).role) ? 'contend' : 'rebuild';
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
      const absorber = capSpaceTeams.find(t => t.id !== sellerTeam.id);
      if (!absorber) continue;

      // Seller attaches a 2nd-round pick to sweeten the dump
      const sellerPicks = (state.draftPicks ?? []).filter(pk =>
        pk.tid === sellerTeam.id && pk.round === 2 &&
        !(pk.season <= currentYear && parseInt(normDate.split('-')[1] || '1', 10) >= 3)
      );
      if (sellerPicks.length === 0) continue; // no picks to attach = no dump deal

      const dumpPick = sellerPicks[0];
      const dumpSalary = dumpCandidate.contract?.amount ?? 0;
      const absorberPayroll = state.players
        .filter(p => p.tid === absorber.id)
        .reduce((s, p) => s + (p.contract?.amount ?? 0), 0);

      // Absorber gets the player's salary — make sure it fits under the cap
      if (absorberPayroll + dumpSalary > (thresholds.salaryCap ?? 136_000) * 1.1) continue;

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
      count++;
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

export function executeAITrade(proposal: TradeProposal, state: GameState): Partial<GameState> {
  const {
    proposingTeamId, receivingTeamId,
    playersOffered, playersRequested,
    picksOffered, picksRequested,
  } = proposal;

  const proposingTeam = state.teams.find(t => t.id === proposingTeamId);
  const receivingTeam = state.teams.find(t => t.id === receivingTeamId);

  if (!proposingTeam || !receivingTeam) return {};

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

  const formatPickDesc = (dpid: number): string => {
    const pk = state.draftPicks.find(p => p.dpid === dpid);
    if (!pk) return 'pick';
    const origTeam = state.teams.find(t => t.id === pk.originalTid);
    const roundStr = pk.round === 1 ? '1st Rd' : '2nd Rd';
    return `${pk.season} ${roundStr} (${origTeam?.abbrev ?? '?'})`;
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

  const historyText = sentAssets && recvAssets
    ? `TRADE: ${proposingTeam.name} sends ${sentAssets} to ${receivingTeam.name} for ${recvAssets}.`
    : sentAssets
      ? `TRADE: ${proposingTeam.name} sends ${sentAssets} to ${receivingTeam.name}.`
      : recvAssets
        ? `TRADE: ${proposingTeam.name} receives ${recvAssets} from ${receivingTeam.name}.`
        : `TRADE: ${proposingTeam.name} and ${receivingTeam.name} exchange picks.`;

  const historyEntry = {
    text: historyText,
    date: state.date,
    type: 'Trade' as const,
    playerIds: [...playersOffered, ...playersRequested],
  };

  return {
    players: updatedPlayers,
    draftPicks: updatedPicks,
    history: [...(state.history ?? []), historyEntry as any],
    tradeProposals: (state.tradeProposals ?? []).map(p =>
      p.id === proposal.id ? { ...p, status: 'executed' as const } : p
    ),
  };
}
