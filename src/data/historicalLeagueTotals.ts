import { normalizeLeaderNameKey, parseStatVal } from './franchiseService';

const TOTAL_FIELDS = [
  'GP', 'GS', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK',
  'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA', 'OREB', 'DREB', 'TOV', 'PF',
] as const;

function playerKey(row: Record<string, unknown>): string {
  return normalizeLeaderNameKey(String(row.NAME ?? ''));
}

function bestRowsByPlayer(rows: Record<string, any>[]): Map<string, Record<string, any>> {
  const byPlayer = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const key = playerKey(row);
    if (!key) continue;
    const existing = byPlayer.get(key);
    if (!existing || parseStatVal(row.GP) > parseStatVal(existing.GP)) byPlayer.set(key, row);
  }
  return byPlayer;
}

function addCareerRows(source: Record<string, any>, branch: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = {
    ...source,
    NAME: source.NAME ?? branch.NAME,
    _live: true,
    _sourceHistorical: true,
    _ws: Number(source._ws ?? 0) + Number(branch._ws ?? 0),
  };
  for (const field of TOTAL_FIELDS) {
    merged[field] = String(Math.round(parseStatVal(source[field]) + parseStatVal(branch[field])));
  }
  return merged;
}

export function mergeHistoricalLeagueTotals(
  sourceTotals: Record<string, any>[],
  allSavedTotals: Record<string, any>[],
  branchSavedTotals: Record<string, any>[],
): Record<string, any>[] {
  const sourceByPlayer = bestRowsByPlayer(sourceTotals);
  const allSavedByPlayer = bestRowsByPlayer(allSavedTotals);
  const branchSavedByPlayer = bestRowsByPlayer(branchSavedTotals);
  const keys = new Set([...sourceByPlayer.keys(), ...allSavedByPlayer.keys()]);

  return Array.from(keys, key => {
    const source = sourceByPlayer.get(key);
    if (!source) return allSavedByPlayer.get(key)!;
    const branch = branchSavedByPlayer.get(key);
    return branch ? addCareerRows(source, branch) : source;
  });
}
