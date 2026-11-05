import { getStatValue, normalizeLeaderNameKey, parseStatVal } from '../../../data/franchiseService';

const RECORD_CATEGORY_ALIASES: Record<string, string> = {
  PTS: 'Points',
  POINT: 'Points',
  POINTS: 'Points',
  REB: 'Rebounds',
  TRB: 'Rebounds',
  REBOUND: 'Rebounds',
  REBOUNDS: 'Rebounds',
  AST: 'Assists',
  ASSIST: 'Assists',
  ASSISTS: 'Assists',
  BLK: 'Blocks',
  BLOCK: 'Blocks',
  BLOCKS: 'Blocks',
  STL: 'Steals',
  STEAL: 'Steals',
  STEALS: 'Steals',
  FGM: 'Field Goals Made',
  FIELDGOALMADE: 'Field Goals Made',
  FIELDGOALSMADE: 'Field Goals Made',
  FGA: 'Field Goals Attempted',
  FIELDGOALATTEMPTED: 'Field Goals Attempted',
  FIELDGOALSATTEMPTED: 'Field Goals Attempted',
  '3PM': 'Three-Pointers Made',
  THREESMADE: 'Three-Pointers Made',
  THREEPOINTERMADE: 'Three-Pointers Made',
  THREEPOINTERSMADE: 'Three-Pointers Made',
  '3PA': 'Three-Pointers Attempted',
  THREEPOINTERATTEMPTED: 'Three-Pointers Attempted',
  THREEPOINTERSATTEMPTED: 'Three-Pointers Attempted',
  FTM: 'Free Throws Made',
  FREETHROWMADE: 'Free Throws Made',
  FREETHROWSMADE: 'Free Throws Made',
  FTA: 'Free Throws Attempted',
  FREETHROWATTEMPTED: 'Free Throws Attempted',
  FREETHROWSATTEMPTED: 'Free Throws Attempted',
  OREB: 'Offensive Rebounds',
  ORB: 'Offensive Rebounds',
  OFFENSIVEREBOUNDS: 'Offensive Rebounds',
  DREB: 'Defensive Rebounds',
  DRB: 'Defensive Rebounds',
  DEFENSIVEREBOUNDS: 'Defensive Rebounds',
  TOV: 'Turnovers',
  TURNOVER: 'Turnovers',
  TURNOVERS: 'Turnovers',
  PF: 'Personal Fouls',
  PERSONALFOUL: 'Personal Fouls',
  PERSONALFOULS: 'Personal Fouls',
  MIN: 'Minutes Played',
  MINUTES: 'Minutes Played',
  MINUTESPLAYED: 'Minutes Played',
};

export function canonicalTeamHistoryRecordCategory(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const key = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return RECORD_CATEGORY_ALIASES[key] ?? raw;
}

export function teamHistoryRecordIdentity(record: Record<string, unknown>, category: string): string {
  return [
    category,
    normalizeLeaderNameKey(String(record.NAME ?? '')),
    String(record.DATE ?? '').trim().toLowerCase(),
    String(record.OPP ?? '').trim().toLowerCase(),
    String(parseStatVal(getStatValue(record, category))),
  ].join('|');
}

function recordSeason(record: Record<string, unknown>): number | null {
  const explicit = Number(record.season ?? record.SEASON);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const dateText = String(record.DATE ?? '').trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCMonth() >= 9 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
}

function isExactGameRecord(record: Record<string, unknown>): boolean {
  const date = String(record.DATE ?? '').trim();
  return /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(date)
    && String(record.OPP ?? '').trim() !== '';
}

function recordSummaryIdentity(record: Record<string, unknown>, category: string): string {
  return [
    category,
    normalizeLeaderNameKey(String(record.NAME ?? '')),
    String(recordSeason(record) ?? String(record.DATE ?? '').trim().toLowerCase()),
    String(parseStatVal(getStatValue(record, category))),
  ].join('|');
}

export function dedupeTeamHistoryRecords(
  records: Record<string, any>[],
  category: string,
): Record<string, any>[] {
  const ordered = records
    .map((record, index) => ({ record, index, exact: isExactGameRecord(record) }))
    .sort((left, right) => (
      parseStatVal(getStatValue(right.record, category)) - parseStatVal(getStatValue(left.record, category))
      || Number(right.exact) - Number(left.exact)
      || left.index - right.index
    ));
  const exactSeen = new Set<string>();
  const exactSummarySeen = new Set<string>();
  const summarySeen = new Set<string>();
  const result: Record<string, any>[] = [];
  for (const { record, exact } of ordered) {
    const summaryIdentity = recordSummaryIdentity(record, category);
    if (exact) {
      const exactIdentity = teamHistoryRecordIdentity(record, category);
      if (exactSeen.has(exactIdentity)) continue;
      exactSeen.add(exactIdentity);
      exactSummarySeen.add(summaryIdentity);
      result.push(record);
      continue;
    }
    if (exactSummarySeen.has(summaryIdentity) || summarySeen.has(summaryIdentity)) continue;
    summarySeen.add(summaryIdentity);
    result.push(record);
  }
  return result;
}
