import type { NBATeam } from '../../types';
import type { AnnualLedger } from '../../types/tycoon';

const MAX_HISTORY = 10;

/**
 * Pushes a fresh ledger into team.tycoon.ledgerHistory (FIFO max 10),
 * updates cashOnHand by profit, recomputes 3-year FFP rolling deficit.
 */
export function snapshot(team: NBATeam, ledger: AnnualLedger): void {
  const t = team.tycoon;
  if (!t) return;

  ledger.cashOnHandEnd = t.cashOnHand + ledger.profit;

  t.ledgerHistory.push(ledger);
  if (t.ledgerHistory.length > MAX_HISTORY) t.ledgerHistory.shift();

  t.cashOnHand = ledger.cashOnHandEnd;
  t.ffpRollingDeficit = t.ledgerHistory
    .slice(-3)
    .reduce((sum, l) => sum + Math.min(l.profit, 0), 0);
}

export function getCurrentSeasonLedgerPreview(team: NBATeam): AnnualLedger | null {
  if (!team.tycoon) return null;
  return team.tycoon.ledgerHistory[team.tycoon.ledgerHistory.length - 1] ?? null;
}
