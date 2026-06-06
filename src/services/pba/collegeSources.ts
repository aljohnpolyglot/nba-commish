import type { NBAPlayer } from '../../types';
import fallbackDraftArchive from '../../data/pba_draft_all_rows_single.json';
import { PHILIPPINE_COLLEGE_POOL } from '../../data/philippineCollegePool';
import { normalizePbaSchoolClubTeam } from './pbaDraftArchive';

const COLLEGE_KEYS = ['college', 'school', 'almaMater', 'alma_mater', 'university'];

const cleanCollege = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return normalizePbaSchoolClubTeam(value).trim().replace(/\s+/g, ' ');
};

const addCollege = (pool: Record<string, number>, value: unknown) => {
  const college = cleanCollege(value);
  if (!college) return;
  pool[college] = (pool[college] ?? 0) + 1;
};

const addCollegeFromObject = (pool: Record<string, number>, source: unknown) => {
  if (!source || typeof source !== 'object') return;
  const record = source as Record<string, unknown>;
  for (const key of COLLEGE_KEYS) addCollege(pool, record[key]);
};

type RawPbaDraftArchive = {
  rows?: Array<{
    school_club_team?: string;
  }>;
};

const buildPoolFromDraftArchive = (): Record<string, number> => {
  const pool: Record<string, number> = {};
  const rows = (fallbackDraftArchive as RawPbaDraftArchive)?.rows ?? [];
  for (const row of rows) {
    addCollege(pool, row.school_club_team);
  }
  return pool;
};

export function buildPbaCollegePoolFromSource(players: NBAPlayer[]): Record<string, number> {
  const pool: Record<string, number> = {};
  for (const player of players) {
    if ((player as any).status !== 'PBA' && !(player as any).pbaLocalEligible) continue;
    addCollegeFromObject(pool, player);
  }
  if (Object.keys(pool).length > 0) return pool;

  const archivePool = buildPoolFromDraftArchive();
  return Object.keys(archivePool).length > 0 ? archivePool : PHILIPPINE_COLLEGE_POOL;
}
