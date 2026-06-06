import type { NBAPlayer } from '../../types';
import rawPbaAwards from '../../data/pba_all_awards_all_tables.json';
import rawPbaAwardWinners from '../../data/pba_award_winners (3).json';

export interface PbaConferenceAward {
  season: number;
  conference: 'philippine' | 'commissioners' | 'governors';
  teamId: number;
  teamName: string;
  finalsMvpId?: string;
  finalsMvpName?: string;
  bestPlayerId?: string;
  bestPlayerName?: string;
  bestImportId?: string;
  bestImportName?: string;
}

export interface PbaHistoricalAward {
  season: number;
  type: string;
  name?: string;
  team?: string;
  conference?: string;
  pid?: string;
  tid?: number;
  source?: string;
}

type AwardCell = { text?: string };
type AwardRow = Record<string, AwardCell | undefined>;
type AwardWinnerRow = {
  award_name?: string;
  year?: string;
  winner?: string;
  notes?: string;
  raw_cells?: string;
};

const PBA_AWARD_PAGE_TO_TYPE: Record<string, string> = {
  'All-Star Game MVP': 'All-Star Game MVP',
  'Rookie of the Year': 'Rookie of the Year',
  'Most Valuable Player': 'Most Valuable Player',
  'Most Improved Player': 'Most Improved Player',
  'Samboy Lim Sportsmanship award': 'Sportsmanship Award',
  'Coach of the Year': 'Coach of the Year',
  'Baby Dalupan': 'Baby Dalupan Award',
  'Executive of the Year': 'Executive of the Year',
  'Defensive Player of the Year': 'Defensive Player of the Year',
  'Order of Merit': 'Order of Merit',
  'Scoring Champion': 'Scoring Champion',
  'Comeback Player of the Year': 'Comeback Player of the Year',
  'Bogs Adornado': 'Bogs Adornado Award',
  'Mr. Quality Minutes': 'Mr. Quality Minutes',
  'Ramon Fernandez Finals Most Valuable Player': 'Finals MVP',
  'Best Player of the Conference': 'Best Player of the Conference',
  'Bobby Parks Best Import the Conference': 'Best Import of the Conference',
};

const WINNER_KEYS = ['Player', 'Best Player', 'Best Import', 'MVP (PBA team)', 'Coach', 'Executive', 'Winning team', 'Champion', 'Runner-up'];
let cachedPbaHistoricalAwards: PbaHistoricalAward[] | null = null;

const text = (row: AwardRow, key: string): string => String(row?.[key]?.text ?? '').trim();

const cleanName = (value: string): string =>
  value
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\*+$/g, '')
    .replace(/\^+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const extractTeamFromNotes = (notes: string): string =>
  cleanName(notes.match(/team:\s*([^;]+)/i)?.[1] ?? '');

const parseRawCells = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(cell => String(cell ?? ''));
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(cell => String(cell ?? '')) : [];
  } catch {
    return [];
  }
};

const normalizeName = (value: string): string =>
  cleanName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const seasonToYear = (value: string): number | null => {
  const raw = value.replace(/[^\d\-–]/g, '');
  const match = raw.match(/^(\d{4})(?:[–-](\d{2,4}))?$/);
  if (!match) {
    const year = Number(value.match(/\d{4}/)?.[0]);
    return Number.isFinite(year) ? year : null;
  }
  const start = Number(match[1]);
  if (!match[2]) return start;
  const end = match[2].length === 2
    ? Math.floor(start / 100) * 100 + Number(match[2])
    : Number(match[2]);
  return end;
};

function extractRows(pageName: string, rows: AwardRow[]): PbaHistoricalAward[] {
  const type = PBA_AWARD_PAGE_TO_TYPE[pageName] ?? pageName;
  const awards: PbaHistoricalAward[] = [];

  for (const row of rows) {
    const season = seasonToYear(text(row, 'Season') || text(row, 'Year'));
    if (!season) continue;
    const conference = cleanName(text(row, 'Conference') || text(row, 'Conference finals') || text(row, 'Details'));

    if (pageName === 'Jun Bernardino Trophy') {
      const winner = cleanName(text(row, 'Winning team'));
      if (winner) awards.push({ season, type: 'Champion', name: winner, team: winner, conference, source: pageName });
      continue;
    }

    if (pageName === "PBA Commissioner's Cup" || pageName === "PBA Governors' Cup") {
      const champion = cleanName(text(row, 'Champion'));
      const runnerUp = cleanName(text(row, 'Runner-up'));
      if (champion) awards.push({ season, type: 'Champion', name: champion, team: champion, conference, source: pageName });
      if (runnerUp) awards.push({ season, type: 'Runner Up', name: runnerUp, team: runnerUp, conference, source: pageName });
      continue;
    }

    const winnerKey = WINNER_KEYS.find(key => cleanName(text(row, key)).length > 0);
    if (!winnerKey) continue;
    const name = cleanName(text(row, winnerKey));
    if (!name) continue;

    awards.push({
      season,
      type,
      name,
      team: cleanName(text(row, 'Team') || text(row, 'Winning team')),
      conference,
      source: pageName,
    });
  }

  return awards;
}

function extractTeamHonorAwards(rows: AwardWinnerRow[]): PbaHistoricalAward[] {
  const awards: PbaHistoricalAward[] = [];

  for (const row of rows) {
    const pageName = String(row.award_name ?? '');
    if (!['PBA Mythical Team', 'PBA All-Defensive Team', 'PBA All-Rookie Team'].includes(pageName)) continue;

    const season = seasonToYear(String(row.year ?? ''));
    if (!season || season < 1900) continue;
    const cells = parseRawCells(row.raw_cells);

    if (pageName === 'PBA Mythical Team') {
      const firstName = cleanName(cells[2] ?? '');
      const firstTeam = cleanName(cells[3] ?? '');
      const secondName = cleanName(cells[4] ?? '');
      const secondTeam = cleanName(cells[5] ?? '');
      if (firstName) awards.push({ season, type: 'PBA Mythical First Team', name: firstName, team: firstTeam, source: pageName });
      if (secondName) awards.push({ season, type: 'PBA Mythical Second Team', name: secondName, team: secondTeam, source: pageName });
      continue;
    }

    const name = cleanName(String(row.winner ?? cells[2] ?? ''));
    if (!name) continue;
    const team = cleanName(cells[3] ?? '') || extractTeamFromNotes(String(row.notes ?? ''));
    awards.push({ season, type: pageName, name, team, source: pageName });
  }

  return awards;
}

export function buildPbaHistoricalAwards(maxSeasonExclusive?: number): PbaHistoricalAward[] {
  if (cachedPbaHistoricalAwards) {
    return maxSeasonExclusive == null
      ? cachedPbaHistoricalAwards
      : cachedPbaHistoricalAwards.filter(award => award.season < maxSeasonExclusive);
  }

  const awards: PbaHistoricalAward[] = [];
  for (const page of ((rawPbaAwards as any).awards ?? [])) {
    const rows = (page.tables ?? []).flatMap((table: any) => table.rows ?? []) as AwardRow[];
    awards.push(...extractRows(String(page.awardName ?? ''), rows));
  }
  awards.push(...extractTeamHonorAwards((rawPbaAwardWinners as AwardWinnerRow[]) ?? []));

  const seen = new Set<string>();
  cachedPbaHistoricalAwards = awards.filter((award) => {
    const key = `${award.season}|${award.type}|${normalizeName(award.name ?? '')}|${normalizeName(award.team ?? '')}|${normalizeName(award.conference ?? '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return maxSeasonExclusive == null
    ? cachedPbaHistoricalAwards
    : cachedPbaHistoricalAwards.filter(award => award.season < maxSeasonExclusive);
}

export function applyPbaAwardsToPlayers(players: NBAPlayer[], awards = buildPbaHistoricalAwards()): NBAPlayer[] {
  const byName = new Map<string, NBAPlayer>();
  for (const player of players) byName.set(normalizeName(player.name), player);

  const additions = new Map<string, Array<{ season: number; type: string }>>();
  for (const award of awards) {
    if (!award.name) continue;
    const player = byName.get(normalizeName(award.name));
    if (!player) continue;
    if (!additions.has(player.internalId)) additions.set(player.internalId, []);
    additions.get(player.internalId)!.push({ season: award.season, type: award.type });
  }

  return players.map(player => {
    const extra = additions.get(player.internalId) ?? [];
    if (extra.length === 0) return player;
    const seen = new Set((player.awards ?? []).map(award => `${award.season}|${award.type}`));
    const merged = [...(player.awards ?? [])];
    for (const award of extra) {
      const key = `${award.season}|${award.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(award);
    }
    return { ...player, awards: merged };
  });
}

export function computeConferenceBestPlayer(
  players: NBAPlayer[],
  pbaTeamTids: Set<number>,
): { id: string; name: string } | null {
  let best: NBAPlayer | null = null;
  let bestPpg = 0;
  for (const p of players) {
    if (!pbaTeamTids.has(p.tid)) continue;
    const stats = p.stats?.[p.stats.length - 1];
    if (!stats || !stats.gp) continue;
    const ppg = (stats.pts ?? 0) / stats.gp;
    if (ppg > bestPpg) {
      bestPpg = ppg;
      best = p;
    }
  }
  return best ? { id: best.internalId, name: best.name } : null;
}

export function computeConferenceBestImport(
  players: NBAPlayer[],
  pbaTeamTids: Set<number>,
): { id: string; name: string } | null {
  let best: NBAPlayer | null = null;
  let bestPpg = 0;
  for (const p of players) {
    if (!pbaTeamTids.has(p.tid)) continue;
    if (!(p as any).isImport) continue;
    const stats = p.stats?.[p.stats.length - 1];
    if (!stats || !stats.gp) continue;
    const ppg = (stats.pts ?? 0) / stats.gp;
    if (ppg > bestPpg) {
      bestPpg = ppg;
      best = p;
    }
  }
  return best ? { id: best.internalId, name: best.name } : null;
}

export function computeSeasonMVP(
  players: NBAPlayer[],
  pbaTeamTids: Set<number>,
): { id: string; name: string } | null {
  return computeConferenceBestPlayer(players, pbaTeamTids);
}
