/**
 * tradeFinderEngine.ts — Unified trade offer generation.
 *
 * Used by BOTH TradeFinderView (UI) and AITradeHandler (background AI-AI trades).
 * Single source of truth for all trade logic: player matching, pick sweeteners,
 * untouchable protection, salary matching, ratio thresholds.
 */

import type { NBAPlayer, NBATeam, DraftPick, LeagueStats } from '../../types';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, getPickTV, type PickValueContext,
  calcCashTV, CASH_TRADE_CAP_USD,
  isUntouchable, isYoungContenderCore, isOnTradingBlock, isSalaryLegal, isWalkingExpiring, isRecentlySignedLocked, type TeamMode,
  getTradeGapTolerance, getTradeOvershootMargin, getTradeRatioThreshold, getTradeValueFloor, type TVContext,
} from './tradeValueEngine';
import { DEFAULT_TRADABLE_PICK_SEASONS } from '../draft/DraftPickGenerator';
import { effectiveRecord, seasonLabelToYear, contractToUSD } from '../../utils/salaryUtils';
import { tradeRoleToTeamMode } from '../../utils/teamStrategy';
import { formatPickLabel } from '../draft/draftClassStrength';

export const EXTERNAL = new Set(['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'Draft Prospect', 'Prospect']);

export function isTradeExcludedStatus(status: string | undefined, allowPbaRoster = false): boolean {
  if (allowPbaRoster && status === 'PBA') return false;
  return EXTERNAL.has(status ?? '');
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TradeOfferItem {
  id: string;
  type: 'player' | 'pick' | 'absorb';
  label: string;
  val: number;
  player?: NBAPlayer;
  pick?: DraftPick;
  ovr?: number;
  pot?: number;
}

export interface TradeOffer {
  tid: number;
  items: TradeOfferItem[];
  totalVal: number;
  /** 'match' = closest-value player swap (default); 'dump' = low-value vet + pick hoard;
   *  'absorb' = cap-space team takes the contract for future flexibility (no return). */
  variant?: 'match' | 'dump' | 'absorb';
}

export interface FindOffersInput {
  /** The team offering assets */
  fromTid: number;
  /** Total trade value of assets being offered */
  offerValue: number;
  /** IDs of players/picks already in the offer basket (don't reuse) */
  usedIds: Set<string>;
  /** All players in the game */
  players: NBAPlayer[];
  /** All teams */
  teams: NBATeam[];
  /** All draft picks */
  draftPicks: DraftPick[];
  /** Current season year */
  currentYear: number;
  /** Minimum tradeable draft season (filters completed drafts) */
  minTradableSeason: number;
  /** Power rank per team (tid → rank, 1=best) */
  powerRanks: Map<number, number>;
  /** Trade outlook per team (tid → { role }) */
  teamOutlooks: Map<number, { role: string }>;
  /** Optional: only generate offers from specific teams */
  targetTids?: number[];
  /** Optional: in-season PER context (league avg + regular-season flag). When
   * present, TV is marginally adjusted by each player's current-season PER. */
  tvContext?: TVContext;
  /** Optional: per-team cap space in thousands (negative = over cap). Enables the
   * 'absorb' salary-dump variant when a team has enough room to take the outgoing
   * contract without matching salary back. */
  capSpaces?: Map<number, number>;
  /** Optional GM-mode trade difficulty 0-100 (50 = default).
   *  Applied as a TV bias on the target `gap`: higher difficulty = AI returns less. */
  tradeDifficulty?: number;
  /** When set, untouchable / young-core filters are SKIPPED for this team's roster.
   *  Used in reverse-mode-star-chasing: AI demands user's core for an elite target. */
  bypassUntouchablesForTid?: number;
  /** When true, the reverse-mode loyalty-lifer block is bypassed — user has
   *  overridden the owner's "don't trade our lifer" warning. */
  allowLifers?: boolean;
  /** When true, PBA status is treated as tradeable instead of external. */
  allowPbaRoster?: boolean;
  /** Optional: season → class-strength multiplier (0.75-1.30). Scales pick TV
   *  based on upcoming draft class quality. See draftClassStrength.ts. */
  classStrengthByYear?: Map<number, number>;
  /** Optional: tid → actual lottery slot (1-14) for currentYear draft. When
   *  present, current-year R1 picks get priced off the KNOWN slot instead of
   *  power-rank projection — critical for June draft-day trades. */
  lotterySlotByTid?: Map<number, number>;
  /** When true, filter out 1st-round picks whose inclusion would leave the
   *  donor team with no 1st in two consecutive future drafts. Without this,
   *  the assembled basket gets rejected wholesale by the Stepien post-validator
   *  in AITradeHandler instead of falling back to a 2nd or alt-year 1st. */
  stepienEnabled?: boolean;
  /** Trade window (years) used by the Stepien check. Mirrors leagueStats.tradableDraftPickSeasons (default 7). */
  tradablePickWindow?: number;
  /** True when current date is between trade deadline (exclusive) and FA start
   *  (exclusive). In that window expiring contracts are walking — they have no
   *  trade value and should be filtered out of all candidate pools. */
  isPostDeadlinePreFA?: boolean;
  /** Pre-computed timestamps for the recently-signed lock check. When provided,
   *  players signed this league year are filtered from all candidate pools —
   *  same mechanic as walking expirings but for freshly inked deals. */
  recentlySignedLockMs?: { currentDate: string; leagueStats?: LeagueStats };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function roleToMode(role: string): TeamMode {
  return tradeRoleToTeamMode(role);
}

/**
 * Power-rank teams (1 = best) using effectiveRecord so offseason 0-0 falls back
 * to last season. In-season leans on win pct; offseason on roster strength.
 * Used by BOTH TradeFinderView and TradeMachineModal so pick values line up.
 */
export function teamPowerRanks(teams: NBATeam[], currentYear: number): Map<number, number> {
  const sorted = [...teams].sort((a, b) => {
    const recA = effectiveRecord(a, currentYear);
    const recB = effectiveRecord(b, currentYear);
    const wpA = (recA.wins + recA.losses) > 0 ? recA.wins / (recA.wins + recA.losses) : 0.5;
    const wpB = (recB.wins + recB.losses) > 0 ? recB.wins / (recB.wins + recB.losses) : 0.5;
    const scoreA = wpA * 0.6 + ((a as any).strength ?? 50) / 100 * 0.4;
    const scoreB = wpB * 0.6 + ((b as any).strength ?? 50) / 100 * 0.4;
    return scoreB - scoreA;
  });
  const map = new Map<number, number>();
  sorted.forEach((t, i) => map.set(t.id, i + 1));
  return map;
}

