import { Bet, BetLeg, GameResult } from '../../types';

/**
 * Pure function — resolves pending bets against a batch of game results.
 * Model A: wager was deducted at placement, so netChange = potentialPayout - wager on win, 0 on loss.
 *
 * DNP rule: if a player's ID appears in result.playerDNPs OR is absent from all stats arrays,
 * the leg stays pending (null) — never marked lost.
 *
 * Parlay rule: every leg must resolve in this batch; if any returns null the whole parlay stays pending.
 */
export function resolveBets(
  bets: Bet[],
  results: GameResult[]
): { updatedBets: Bet[]; netChange: number } {
  if (!bets.length || !results.length) return { updatedBets: bets, netChange: 0 };

  const resultMap = new Map<number, GameResult>(results.map(r => [r.gameId, r]));

  let netChange = 0;

  const updatedBets = bets.map(bet => {
    if (bet.status !== 'pending') return bet;

    const legResults = bet.legs.map(leg => resolveLeg(leg, resultMap));

    // Any null → at least one game/player not in this batch → keep pending
    if (legResults.some(lr => lr === null)) return bet;

    const won = legResults.every(lr => lr === true);

    if (won) {
      netChange += bet.potentialPayout - bet.wager;
      return { ...bet, status: 'won' as const };
    } else {
      return { ...bet, status: 'lost' as const };
    }
  });

  return { updatedBets, netChange };
}

/**
 * Returns true (win), false (loss), or null (unresolved/DNP/game not in batch).
 */
function resolveLeg(
  leg: BetLeg,
  resultMap: Map<number, GameResult>
): boolean | null {
  const { condition, gameId, playerId, description } = leg;

  // ── Player prop conditions ────────────────────────────────────────────────
  if (playerId !== undefined) {
    // Find the game result that has this player in its stat lines
    let stat: any = null;
    let matchedResult: GameResult | null = null;

    for (const r of resultMap.values()) {
      const found =
        r.homeStats.find(s => s.playerId === playerId) ||
        r.awayStats.find(s => s.playerId === playerId);
      if (found) {
        stat = found;
        matchedResult = r;
        break;
      }
    }

    if (!matchedResult) return null; // player's game not simulated yet

    // DNP: listed explicitly or absent from stats (treat absence as DNP)
    if (matchedResult.playerDNPs?.[playerId]) return null;
    if (!stat) return null;

    const reb = stat.reb || (stat.orb + stat.drb);
    const line = parseLine(description);
    if (line === null) return null;

    switch (condition) {
      case 'pts_over':  return stat.pts > line;
      case 'pts_under': return stat.pts < line;
      case 'reb_over':  return reb > line;
      case 'reb_under': return reb < line;
      case 'ast_over':  return stat.ast > line;
      case 'ast_under': return stat.ast < line;
      case 'pra_over':  return (stat.pts + reb + stat.ast) > line;
      case 'pra_under': return (stat.pts + reb + stat.ast) < line;
      default:          return null;
    }
  }

  // ── Game-based conditions ─────────────────────────────────────────────────
  if (gameId !== undefined) {
    const result = resultMap.get(gameId);
    if (!result) return null; // game not in this sim batch

    switch (condition) {
      case 'home_win':
        return result.winnerId === result.homeTeamId;
      case 'away_win':
        return result.winnerId === result.awayTeamId;

      case 'home_spread': {
        const spread = parseLine(description);
        if (spread === null) return null;
        return (result.homeScore - result.awayScore) + spread > 0;
      }
      case 'away_spread': {
        const spread = parseLine(description);
        if (spread === null) return null;
        return (result.awayScore - result.homeScore) + spread > 0;
      }

      case 'over': {
        const line = parseLine(description);
        if (line === null) return null;
        return (result.homeScore + result.awayScore) > line;
      }
      case 'under': {
        const line = parseLine(description);
        if (line === null) return null;
        return (result.homeScore + result.awayScore) < line;
      }

      case 'home_team_total_over': {
        const line = parseLine(description);
        if (line === null) return null;
        return result.homeScore > line;
      }
      case 'home_team_total_under': {
        const line = parseLine(description);
        if (line === null) return null;
        return result.homeScore < line;
      }
      case 'away_team_total_over': {
        const line = parseLine(description);
        if (line === null) return null;
        return result.awayScore > line;
      }
      case 'away_team_total_under': {
        const line = parseLine(description);
        if (line === null) return null;
        return result.awayScore < line;
      }

      default:
        return null;
    }
  }

  return null;
}

/**
 * Extract the numeric line from a bet description.
 *
 * Handles:
 *   "Over 220.5 pts"              → 220.5
 *   "Under 110.5 pts"             → 110.5
 *   "LeBron James Over 25.5 PTS"  → 25.5
 *   "BOS Team Total Over 110.5"   → 110.5
 *   "LAL -3.5"                    → -3.5
 *   "BOS +3.5"                    → 3.5
 */
function parseLine(description: string): number | null {
  // Over/Under keyword: grab the number that follows
  const ouMatch = description.match(/(?:over|under)\s+([\d.]+)/i);
  if (ouMatch) return parseFloat(ouMatch[1]);

  // Spread: signed number after whitespace (e.g. "LAL -3.5" or "BOS +3.5")
  const spreadMatch = description.match(/\s([+-]?\d+\.?\d*)(?:\s|$)/);
  if (spreadMatch) return parseFloat(spreadMatch[1]);

  return null;
}
