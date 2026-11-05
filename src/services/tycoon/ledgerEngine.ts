import type { NBATeam } from '../../types';
import type { AnnualLedger } from '../../types/tycoon';

const MAX_HISTORY = 10;

export function snapshot(team: NBATeam, ledger: AnnualLedger): void {
  const t = team.tycoon;
  if (!t) return;
  const history = Array.isArray(t.ledgerHistory) ? t.ledgerHistory : (t.ledgerHistory = []);

  ledger.cashOnHandEnd = t.cashOnHand;

  history.push(ledger);
  if (history.length > MAX_HISTORY) history.shift();

  t.ffpRollingDeficit = history
    .slice(-3)
    .reduce((sum, l) => sum + Math.min(l.profit, 0), 0);
}

export function getCurrentSeasonLedgerPreview(team: NBATeam): AnnualLedger | null {
  const history = team.tycoon?.ledgerHistory;
  if (!Array.isArray(history) || history.length === 0) return null;
  return history.at(-1) ?? null;
}
