import fallbackArchive from '../../data/pba_draft_all_rows_single.json';

const PBA_DRAFT_ARCHIVE_URLS = [
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pbadraftdata',
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pba_draft_all_rows_single.json',
] as const;

type RawPbaDraftArchive = {
  rows?: RawPbaDraftRow[];
};

type RawPbaDraftRow = {
  draft_page?: string;
  draft_year_or_season?: string;
  round?: string;
  pick?: string;
  player?: string;
  pos?: string;
  country_of_birth?: string;
  team?: string;
  school_club_team?: string;
};

export type PbaDraftArchiveRow = {
  draftPage: string;
  draftLabel: string;
  draftYear: number;
  round: number | null;
  pick: number | null;
  overallPick: number;
  playerName: string;
  normalizedPlayerName: string;
  pos: string;
  countryOfBirth: string;
  draftedTeam: string;
  schoolClubTeam: string;
};

let cachedRows: PbaDraftArchiveRow[] | null = null;
let pendingFetch: Promise<PbaDraftArchiveRow[]> | null = null;

const scrubWikiText = (value: string | undefined): string => {
  if (!value) return '';
  return value
    .replace(/\.mw-parser-output[\s\S]*$/i, '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/#/g, '')
    .replace(/^\*+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const cleanPlayerName = (value: string | undefined): string => scrubWikiText(value);

const cleanTeamName = (value: string | undefined): string =>
  scrubWikiText(value)
    .replace(/\s*\((?:from|via)[^)]+\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

export const normalizePbaSchoolClubTeam = (value: string | undefined): string => {
  const cleaned = scrubWikiText(value);
  if (!cleaned) return '';
  const primary = cleaned
    .split('/')
    .map(part => part.trim())
    .find(Boolean);
  return primary ?? cleaned;
};

const normalizeLookupName = (value: string | undefined): string =>
  cleanPlayerName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();

const parseDraftYear = (label: string | undefined): number | null => {
  if (!label) return null;
  const directYear = label.match(/\b(19|20)\d{2}\b/);
  if (directYear) return Number(directYear[0]);

  const seasonNumber = label.match(/season\s+(\d+)\s+draft/i);
  if (seasonNumber) return 1975 + Number(seasonNumber[1]);

  return null;
};

const parseOptionalInt = (value: string | undefined): number | null => {
  const cleaned = scrubWikiText(value);
  if (!cleaned) return null;
  const match = cleaned.match(/\d+/);
  return match ? Number(match[0]) : null;
};

function normalizeArchiveRows(archive: RawPbaDraftArchive): PbaDraftArchiveRow[] {
  const rows = archive.rows ?? [];
  const normalized = rows
    .map((row, index) => {
      const draftYear = parseDraftYear(row.draft_year_or_season);
      const playerName = cleanPlayerName(row.player);
      const pick = parseOptionalInt(row.pick);

      if (!draftYear || !playerName || pick == null) {
        return null;
      }

      return {
        draftPage: row.draft_page?.trim() ?? '',
        draftLabel: scrubWikiText(row.draft_year_or_season) || `${draftYear} PBA Draft`,
        draftYear,
        round: parseOptionalInt(row.round),
        pick,
        overallPick: index + 1,
        playerName,
        normalizedPlayerName: normalizeLookupName(playerName),
        pos: scrubWikiText(row.pos) || '—',
        countryOfBirth: scrubWikiText(row.country_of_birth) || '—',
        draftedTeam: cleanTeamName(row.team) || 'PBA Team',
        schoolClubTeam: normalizePbaSchoolClubTeam(row.school_club_team) || '—',
      } satisfies PbaDraftArchiveRow;
    })
    .filter((row): row is PbaDraftArchiveRow => row != null);

  const yearCounts = new Map<number, number>();
  return normalized.map(row => {
    const count = (yearCounts.get(row.draftYear) ?? 0) + 1;
    yearCounts.set(row.draftYear, count);
    return {
      ...row,
      overallPick: count,
    };
  });
}

cachedRows = normalizeArchiveRows(fallbackArchive as RawPbaDraftArchive);

export const getCachedPbaDraftArchive = (): PbaDraftArchiveRow[] => cachedRows ?? [];

export const findPbaDraftRowsByYear = (draftYear: number): PbaDraftArchiveRow[] =>
  getCachedPbaDraftArchive().filter(row => row.draftYear === draftYear);

export const normalizePbaDraftPlayerName = (name: string): string => normalizeLookupName(name);

export async function ensurePbaDraftArchive(): Promise<PbaDraftArchiveRow[]> {
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    for (const url of PBA_DRAFT_ARCHIVE_URLS) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }
        const archive = await response.json() as RawPbaDraftArchive;
        cachedRows = normalizeArchiveRows(archive);
        if (cachedRows.length > 0) {
          return cachedRows;
        }
      } catch {
        continue;
      }
    }
    return cachedRows ?? [];
  })().finally(() => {
      pendingFetch = null;
    });

  return pendingFetch;
}
