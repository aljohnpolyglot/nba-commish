/**
 * draftAdvisor.ts
 * Pure scoring helpers powering both:
 *  - DraftSimulatorView's CompactAdvisorBoardPanel (sidebar big board)
 *  - DraftScoutingView's mock-draft projection (60 picks across all teams)
 *
 * Pulled out so both surfaces share the same value+fit math — otherwise the
 * mock-draft view silently drifts from the in-draft Advisor's recommendations.
 */

import type { NBAPlayer, NBATeam } from '../types';
import { calcOvr2K, calcPot2K, type TeamMode } from './trade/tradeValueEngine';
import {
  getTradeOutlook, effectiveRecord, getCapThresholds, topNAvgK2,
  resolveManualOutlook, type CapThresholds,
} from '../utils/salaryUtils';

// ── Position bucket helpers (Guard / Forward / Center) ──────────────────────

export type PositionBucket = 'Guard' | 'Forward' | 'Center';

export function posBucketFor(pos: string | undefined): PositionBucket {
  const p = pos ?? 'F';
  if (p.includes('G') || p === 'PG' || p === 'SG') return 'Guard';
  if (p.includes('C') || p === 'FC') return 'Center';
  return 'Forward';
}

// ── Team mode resolution ────────────────────────────────────────────────────

export interface ResolveTeamModeArgs {
  team: NBATeam;
  allTeams: NBATeam[];
  allPlayers: NBAPlayer[];
  leagueStats: any;
  thresholds: CapThresholds;
  gameMode: 'gm' | 'commissioner';
  userTeamId: number | null;
  currentYear: number;
}

export function resolveTeamMode(args: ResolveTeamModeArgs): TeamMode {
  const { team, allTeams, allPlayers, leagueStats, thresholds, gameMode, userTeamId, currentYear } = args;
  const manual = resolveManualOutlook(team, gameMode, userTeamId);
  if (manual) {
    if (manual.role === 'heavy_buyer' || manual.role === 'buyer') return 'contend';
    if (manual.role === 'rebuilding') return 'presti';
    return 'rebuild';
  }
  const payroll = allPlayers
    .filter(p => p.tid === team.id)
    .reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000), 0);
  const rec = effectiveRecord(team, currentYear);
  const confTeams = allTeams
    .filter(t => t.conference === team.conference)
    .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
    .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
  const idx = confTeams.findIndex(c => c.t.id === team.id);
  const confRank = idx >= 0 ? idx + 1 : 15;
  const leader = confTeams[0];
  const gb = Math.max(0, ((leader?.rec.wins ?? 0) - rec.wins + rec.losses - (leader?.rec.losses ?? 0)) / 2);
  const starAvg = topNAvgK2(allPlayers, team.id, 3);
  const expiringCount = allPlayers.filter(p =>
    p.tid === team.id && (p.contract?.exp ?? 0) <= currentYear).length;
  const outlook = getTradeOutlook(payroll, rec.wins, rec.losses, expiringCount,
    thresholds, confRank, gb, starAvg);
  if (outlook.role === 'heavy_buyer' || outlook.role === 'buyer') return 'contend';
  if (outlook.role === 'rebuilding') return 'presti';
  return 'rebuild';
}

// ── Weak positions ──────────────────────────────────────────────────────────

export function computeWeakPositions(
  teamId: number,
  allPlayers: NBAPlayer[],
): PositionBucket[] {
  const roster = allPlayers.filter(p => p.tid === teamId && p.status === 'Active');
  const groups: Record<PositionBucket, number[]> = { Guard: [], Forward: [], Center: [] };
  for (const p of roster) {
    groups[posBucketFor(p.pos)].push(calcOvr2K(p));
  }
  return (Object.entries(groups) as [PositionBucket, number[]][])
    .map(([pos, vals]) => ({
      pos,
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      count: vals.length,
    }))
    .filter(n => n.avg < 82 || n.count < 2)
    .map(n => n.pos);
}

// ── Per-prospect score (70/30 value + fit, mode-weighted) ───────────────────

export function scoreProspectForTeam(
  prospect: NBAPlayer,
  teamMode: TeamMode,
  weakPositions: PositionBucket[],
  currentYear: number,
): number {
  const ovr = calcOvr2K(prospect);
  const pot = calcPot2K(prospect, currentYear);
  const valuePart = teamMode === 'contend'
    ? ovr * 1.4 + pot * 0.6
    : teamMode === 'presti'
    ? ovr * 0.5 + pot * 1.5
    : ovr * 0.6 + pot * 1.4;
  const fitBonus = weakPositions.includes(posBucketFor(prospect.pos)) ? 15 : 0;
  return valuePart * 0.7 + (valuePart * 0.3 + fitBonus);
}

// ── Mock-draft projection ───────────────────────────────────────────────────

export interface MockDraftSlot {
  pick: number;
  team: any; // resolved team (current owner if pick is traded; carries _originalTid/_traded meta)
  prospect: NBAPlayer | null;
}

export interface BuildMockDraftArgs {
  prospects: NBAPlayer[];     // current draft class only (filtered by viewYear)
  draftOrder: any[];          // resolved owner per slot — same shape DraftSimulatorView builds
  allTeams: NBATeam[];
  allPlayers: NBAPlayer[];
  leagueStats: any;
  thresholds: CapThresholds;
  gameMode: 'gm' | 'commissioner';
  userTeamId: number | null;
  currentYear: number;
}

/**
 * Walk the draft order and project the most-likely pick per slot using each
 * team's mode (contend/rebuild/presti) and weak-position fit. Prospects are
 * consumed once chosen; if the pool runs out, remaining slots come back null.
 */
export function buildMockDraft(args: BuildMockDraftArgs): MockDraftSlot[] {
  const {
    prospects, draftOrder, allTeams, allPlayers, leagueStats, thresholds,
    gameMode, userTeamId, currentYear,
  } = args;

  const remaining = new Map<string | number, NBAPlayer>(
    prospects.map(p => [p.internalId, p]),
  );

  const result: MockDraftSlot[] = [];
  for (let i = 0; i < draftOrder.length; i++) {
    const slotTeam = draftOrder[i];
    if (!slotTeam || remaining.size === 0) {
      result.push({ pick: i + 1, team: slotTeam, prospect: null });
      continue;
    }

    // Resolve mode — use the slot's CURRENT owner (post-trade), so a tanking
    // team that traded the pick to a contender draft-fits to the contender.
    const teamMode = resolveTeamMode({
      team: slotTeam,
      allTeams,
      allPlayers,
      leagueStats,
      thresholds,
      gameMode,
      userTeamId,
      currentYear,
    });
    const weak = computeWeakPositions(slotTeam.id, allPlayers);

    // Best remaining prospect by score
    let bestId: string | number | null = null;
    let bestScore = -Infinity;
    for (const [id, p] of remaining) {
      const score = scoreProspectForTeam(p, teamMode, weak, currentYear);
      if (score > bestScore) { bestScore = score; bestId = id; }
    }

    if (bestId !== null) {
      const chosen = remaining.get(bestId)!;
      remaining.delete(bestId);
      result.push({ pick: i + 1, team: slotTeam, prospect: chosen });
    } else {
      result.push({ pick: i + 1, team: slotTeam, prospect: null });
    }
  }
  return result;
}

// Re-export the types other consumers need
export { getCapThresholds };
