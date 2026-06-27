import type { GameResult, GameState, HistoricalAward, NBAPlayer, NBATeam } from '../../types';
import rawPbaAwards from '../../data/pba_all_awards_all_tables.json';
import rawPbaAwardWinners from '../../data/pba_award_winners (3).json';
import { AwardService } from '../logic/AwardService';
import { assignOdds } from '../logic/AwardServiceShared';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { isPbaRosterLocal } from './importManager';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { isPbaRegularPhase, makeCountedPbaRegularBoxSet, pbaBoxIdentity, selectCountedPbaRegularBoxScores } from './competitionGames';
import { findPbaDraftRowsByYear, normalizePbaDraftPlayerName } from './pbaDraftArchive';

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
  competitionId?: string;
  uiMode?: string;
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

const isNonWinnerNote = (value: string): boolean => {
  const key = cleanName(value).toLowerCase();
  return (
    key.includes('no tournament') ||
    key.includes('not held') ||
    key.includes('cancelled') ||
    key.includes('canceled') ||
    key.includes('pandemic') ||
    key.includes('fiba world cup') ||
    key.includes('asian games')
  );
};

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
      if (winner && !isNonWinnerNote(winner)) awards.push({ season, type: 'Champion', name: winner, team: winner, conference, source: pageName });
      continue;
    }

    if (pageName === "PBA Commissioner's Cup" || pageName === "PBA Governors' Cup") {
      const champion = cleanName(text(row, 'Champion'));
      const runnerUp = cleanName(text(row, 'Runner-up'));
      if (champion && !isNonWinnerNote(champion)) awards.push({ season, type: 'Champion', name: champion, team: champion, conference, source: pageName });
      if (runnerUp && !isNonWinnerNote(runnerUp)) awards.push({ season, type: 'Runner Up', name: runnerUp, team: runnerUp, conference, source: pageName });
      continue;
    }

    const winnerKey = WINNER_KEYS.find(key => cleanName(text(row, key)).length > 0);
    if (!winnerKey) continue;
    const name = cleanName(text(row, winnerKey));
    if (!name || isNonWinnerNote(name)) continue;

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
  cachedPbaHistoricalAwards = awards.map(award => ({
    ...award,
    competitionId: award.competitionId ?? 'pba',
    uiMode: award.uiMode ?? 'pba_isolated',
  })).filter((award) => {
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

type LivePbaConference = 'philippine' | 'commissioners' | 'governors';

const LIVE_PBA_COMPETITION_IDS = ['pba-philippine-cup', 'pba-commissioners-cup', 'pba-governors-cup'];
const pbaCompetitionById = new Map(PBA_COMPETITIONS.map(spec => [spec.id, spec]));

type PbaSeasonLine = {
  gp: number;
  gs: number;
  min: number;
  pts: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
};

type LivePbaAwardPatch = Partial<GameState> & {
  conferenceAwardMeta?: {
    finalsMvpId?: string;
    finalsMvpName?: string;
    bestPlayerId?: string;
    bestPlayerName?: string;
    bestImportId?: string;
    bestImportName?: string;
  };
};

const PBA_CONFERENCE_LABEL: Record<LivePbaConference, string> = {
  philippine: 'Philippine Cup',
  commissioners: "Commissioner's Cup",
  governors: "Governors' Cup",
};

const isRegularCompetitionPhase = (phase: unknown): boolean => {
  const key = String(phase ?? '').toLowerCase();
  return !key || key === 'group' || key === 'regular' || key === 'league' || key.startsWith('r');
};

const getPlayerStatName = (stat: any): string => String(stat?.name ?? stat?.playerName ?? '').trim();

const emptyPbaLine = (): PbaSeasonLine => ({
  gp: 0,
  gs: 0,
  min: 0,
  pts: 0,
  trb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
});

const addPbaLine = (target: PbaSeasonLine, source: Partial<PbaSeasonLine>) => {
  target.gp += Number(source.gp ?? 0);
  target.gs += Number(source.gs ?? 0);
  target.min += Number(source.min ?? 0);
  target.pts += Number(source.pts ?? 0);
  target.trb += Number(source.trb ?? 0);
  target.ast += Number(source.ast ?? 0);
  target.stl += Number(source.stl ?? 0);
  target.blk += Number(source.blk ?? 0);
  target.tov += Number(source.tov ?? 0);
};

const pbaLineScore = (line: PbaSeasonLine): number => {
  const gp = Math.max(line.gp, 1);
  const ppg = line.pts / gp;
  const rpg = line.trb / gp;
  const apg = line.ast / gp;
  const spg = line.stl / gp;
  const bpg = line.blk / gp;
  const tov = line.tov / gp;
  const mpg = line.min / gp;
  return ppg + rpg * 0.7 + apg * 0.85 + spg * 1.6 + bpg * 1.5 - tov * 0.45 + mpg * 0.08;
};

function pbaTeamIds(state: GameState): Set<number> {
  return new Set(
    (state.nonNBATeams ?? [])
      .filter((team: any) => team?.league === 'PBA')
      .map((team: any) => Number(team.tid ?? team.id))
      .filter(Number.isFinite),
  );
}

function pbaPlayers(state: GameState, tids = pbaTeamIds(state)): NBAPlayer[] {
  return (state.players ?? []).filter(player =>
    player.status === 'PBA' ||
    (Number(player.tid) >= 2000 && Number(player.tid) < 2100) ||
    tids.has(Number(player.tid)),
  );
}

function pbaTeamsWithRecords(state: GameState, competitionId: string, season: number): NBATeam[] {
  const teams = [...pbaTeamIds(state)]
    .map(tid => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
    .filter((team): team is NBATeam => !!team);
  const records = new Map(teams.map(team => [team.id, { wins: 0, losses: 0 }]));
  const spec = pbaCompetitionById.get(competitionId);
  const boxes = spec
    ? selectCountedPbaRegularBoxScores(state.boxScores ?? [], spec, season)
    : (state.boxScores ?? []).filter((box: any) =>
        box.competitionId === competitionId &&
        Number(box.season ?? season) === Number(season) &&
        isRegularCompetitionPhase(box.competitionPhase),
      );
  for (const box of boxes) {
    const home = records.get(Number((box as any).homeTeamId));
    const away = records.get(Number((box as any).awayTeamId));
    if (!home || !away) continue;
    const homeWon = Number((box as any).homeScore ?? 0) > Number((box as any).awayScore ?? 0);
    home.wins += homeWon ? 1 : 0;
    home.losses += homeWon ? 0 : 1;
    away.wins += homeWon ? 0 : 1;
    away.losses += homeWon ? 1 : 0;
  }
  return teams.map(team => {
    const record = records.get(team.id);
    return record ? { ...team, wins: record.wins, losses: record.losses } : team;
  });
}

function competitionScoreLeaders(
  state: GameState,
  competitionId: string,
  season: number,
  filter?: (player: NBAPlayer) => boolean,
): Array<{ player: NBAPlayer; tid: number; score: number }> {
  const totals = new Map<string, { pts: number; reb: number; ast: number; stl: number; blk: number; games: number; tid: number }>();
  const spec = pbaCompetitionById.get(competitionId);
  const countedRegularBoxes = spec ? makeCountedPbaRegularBoxSet(state.boxScores ?? [], [spec], season) : null;
  const allRows = (state.boxScores ?? [])
    .filter((box: any) =>
      box.competitionId === competitionId &&
      Number(box.season ?? season) === Number(season) &&
      (!countedRegularBoxes || !isPbaRegularPhase(box.competitionPhase) || countedRegularBoxes.has(pbaBoxIdentity(box)))
    )
    .flatMap((box: GameResult) => [
      ...(box.homeStats ?? []).map(stat => ({ stat, tid: box.homeTeamId })),
      ...(box.awayStats ?? []).map(stat => ({ stat, tid: box.awayTeamId })),
    ]);
  for (const { stat, tid } of allRows) {
    const pid = String((stat as any).playerId ?? '');
    if (!pid) continue;
    const row = totals.get(pid) ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, games: 0, tid };
    row.pts += Number((stat as any).pts ?? 0);
    row.reb += Number((stat as any).reb ?? (stat as any).trb ?? 0);
    row.ast += Number((stat as any).ast ?? 0);
    row.stl += Number((stat as any).stl ?? 0);
    row.blk += Number((stat as any).blk ?? 0);
    row.games += Number((stat as any).min ?? 0) > 0 || Number((stat as any).pts ?? 0) > 0 ? 1 : 0;
    row.tid = tid;
    totals.set(pid, row);
  }
  return [...totals.entries()]
    .map(([pid, total]) => {
      const player = state.players.find(p => p.internalId === pid);
      if (!player || (filter && !filter(player))) return null;
      const gp = Math.max(total.games, 1);
      const score = (total.pts / gp) * 1.2 + (total.reb / gp) * 0.45 + (total.ast / gp) * 0.55 + (total.stl / gp) * 1.3 + (total.blk / gp) * 1.1;
      return { player, tid: total.tid, score };
    })
    .filter((entry): entry is { player: NBAPlayer; tid: number; score: number } => !!entry)
    .sort((a, b) => b.score - a.score);
}

function pbaSeasonScoreLeaders(
  state: GameState,
  season: number,
  filter?: (player: NBAPlayer) => boolean,
): Array<{ player: NBAPlayer; score: number }> {
  const byPlayer = new Map<string, { player: NBAPlayer; score: number; rows: number }>();
  for (const competitionId of LIVE_PBA_COMPETITION_IDS) {
    for (const row of competitionScoreLeaders(state, competitionId, season, filter)) {
      const current = byPlayer.get(row.player.internalId) ?? { player: row.player, score: 0, rows: 0 };
      current.score += row.score;
      current.rows += 1;
      byPlayer.set(row.player.internalId, current);
    }
  }
  return [...byPlayer.values()]
    .map(row => ({ player: row.player, score: row.score / Math.max(row.rows, 1) }))
    .sort((a, b) => b.score - a.score);
}

function pbaBoxScoreLinesByPlayer(state: GameState, season: number): Map<string, PbaSeasonLine> {
  const lines = new Map<string, PbaSeasonLine>();
  const countedRegularBoxes = makeCountedPbaRegularBoxSet(state.boxScores ?? [], PBA_COMPETITIONS, season);
  for (const box of state.boxScores ?? []) {
    if (!String((box as any).competitionId ?? '').startsWith('pba-')) continue;
    if (Number((box as any).season ?? season) !== Number(season)) continue;
    if (isPbaRegularPhase((box as any).competitionPhase) && !countedRegularBoxes.has(pbaBoxIdentity(box))) continue;
    const stats = [...((box as any).homeStats ?? []), ...((box as any).awayStats ?? [])];
    for (const stat of stats) {
      const pid = String(stat?.playerId ?? '');
      if (!pid) continue;
      const minutes = Number(stat?.min ?? 0);
      const rebounds = Number(stat?.reb ?? stat?.trb ?? (Number(stat?.orb ?? 0) + Number(stat?.drb ?? 0)));
      const played = minutes > 0 || Number(stat?.pts ?? 0) > 0 || rebounds > 0 || Number(stat?.ast ?? 0) > 0;
      if (!played) continue;
      const line = lines.get(pid) ?? emptyPbaLine();
      addPbaLine(line, {
        gp: 1,
        gs: Number(stat?.gs ?? stat?.started ?? 0) ? 1 : 0,
        min: minutes,
        pts: Number(stat?.pts ?? 0),
        trb: rebounds,
        ast: Number(stat?.ast ?? 0),
        stl: Number(stat?.stl ?? 0),
        blk: Number(stat?.blk ?? 0),
        tov: Number(stat?.tov ?? stat?.to ?? 0),
      });
      lines.set(pid, line);
    }
  }
  return lines;
}

function pbaStatLineFromPlayerStats(player: NBAPlayer, season: number, pbaTids: Set<number>): PbaSeasonLine | null {
  const line = emptyPbaLine();
  for (const stat of player.stats ?? []) {
    if (stat.playoffs || Number(stat.season) !== Number(season)) continue;
    const tid = Number(stat.tid);
    if (!pbaTids.has(tid) && (tid < 2000 || tid >= 2100)) continue;
    addPbaLine(line, {
      gp: Number(stat.gp ?? 0),
      gs: Number(stat.gs ?? 0),
      min: Number(stat.min ?? 0),
      pts: Number(stat.pts ?? 0),
      trb: Number(stat.trb ?? (stat as any).reb ?? ((stat.orb ?? 0) + (stat.drb ?? 0))),
      ast: Number(stat.ast ?? 0),
      stl: Number(stat.stl ?? 0),
      blk: Number(stat.blk ?? 0),
      tov: Number(stat.tov ?? 0),
    });
  }
  return line.gp > 0 ? line : null;
}

function pbaSeasonLineForPlayer(
  state: GameState,
  player: NBAPlayer,
  season: number,
  boxLines: Map<string, PbaSeasonLine>,
  pbaTids: Set<number>,
): PbaSeasonLine | null {
  const boxLine = boxLines.get(player.internalId);
  if (boxLine && boxLine.gp > 0) return boxLine;
  return pbaStatLineFromPlayerStats(player, season, pbaTids);
}

export function getPbaMostImprovedCandidates(
  state: GameState,
  players: NBAPlayer[],
  teams: NBATeam[],
  season: number,
  options: { live?: boolean } = {},
) {
  const pbaTids = pbaTeamIds(state);
  const currentBoxLines = pbaBoxScoreLinesByPlayer(state, season);
  const previousBoxLines = pbaBoxScoreLinesByPlayer(state, season - 1);
  const currentLines = players
    .map(player => pbaSeasonLineForPlayer(state, player, season, currentBoxLines, pbaTids))
    .filter((line): line is PbaSeasonLine => !!line);
  const maxCurrentGp = Math.max(...currentLines.map(line => line.gp), 0);
  const minCurrentGp = options.live ? 1 : Math.max(6, Math.floor(Math.max(maxCurrentGp, 18) * 0.35));
  const minPreviousGp = options.live ? 1 : Math.max(4, Math.floor(minCurrentGp * 0.5));
  const minImprovement = options.live ? 0.75 : 3;

  const candidates = players
    .map(player => {
      if (!isPbaLocalAwardEligible(player, state.leagueStats)) return null;
      if (isPbaRookieForSeason(state, player, season)) return null;
      const team = teams.find(entry => Number(entry.id) === Number(player.tid));
      if (!team) return null;
      const current = pbaSeasonLineForPlayer(state, player, season, currentBoxLines, pbaTids);
      const previous = pbaSeasonLineForPlayer(state, player, season - 1, previousBoxLines, pbaTids);
      if (!current || current.gp < minCurrentGp) return null;
      if (!previous && !options.live) return null;
      if (previous && previous.gp < minPreviousGp) return null;

      const currentValue = pbaLineScore(current);
      const ratingBaseline = clampPbaImprovementBaseline(Number(player.overallRating ?? 32));
      const previousValue = previous ? pbaLineScore(previous) : ratingBaseline;
      const currentMpg = current.min / Math.max(current.gp, 1);
      const previousMpg = previous ? previous.min / Math.max(previous.gp, 1) : Math.max(8, currentMpg - 7);
      const currentPpg = current.pts / Math.max(current.gp, 1);
      const improvement = currentValue - previousValue;
      if (improvement < minImprovement) return null;
      if (options.live ? (currentPpg < 3 && currentValue < 6) : (currentPpg < 7 && currentValue < 12)) return null;
      if (previous && previousValue > 24) return null;

      const usageJump = Math.max(0, Math.min(currentMpg - previousMpg, 14));
      const relativeJump = Math.min(1.75, currentValue / Math.max(previousValue, 5));
      const score = improvement * 7 + usageJump * 0.9 + (relativeJump - 1) * 12;
      return { player, team, score, odds: '', stats: { ...current, season, tid: player.tid, playoffs: false } };
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return assignOdds(candidates as any);
}

function clampPbaImprovementBaseline(overallRating: number): number {
  if (!Number.isFinite(overallRating)) return 9;
  return Math.max(6, Math.min(16, overallRating * 0.32));
}

export function isPbaRookieForSeason(state: GameState, player: NBAPlayer, season: number): boolean {
  const targetSeason = Number(season);
  const draft = (player as any).draft;
  const draftYear = Number(draft?.year ?? (player as any).draftYear ?? (player as any).rookieYear);
  const hasDraftSlot = Number(draft?.round) > 0 && Number(draft?.pick) > 0;
  const isSimDraftRookie = hasDraftSlot && Number.isFinite(draftYear) && draftYear + 1 === targetSeason;
  const playerName = normalizePbaDraftPlayerName(player.name);
  const isInitialRosterRookie = findPbaDraftRowsByYear(targetSeason - 1)
    .some(row => row.normalizedPlayerName === playerName);
  if (!isSimDraftRookie && !isInitialRosterRookie) return false;

  const statRows = (player.stats ?? []).filter((row: any) =>
    !row.playoffs &&
    Number.isFinite(Number(row.season)) &&
    Number(row.tid) >= 2000 &&
    Number(row.tid) < 2100,
  );
  const statSeasons = statRows.map((row: any) => Number(row.season));
  const boxSeasons = (state.boxScores ?? [])
    .filter((box: any) => String(box.competitionId ?? '').startsWith('pba-'))
    .filter((box: any) => [
      ...((box as any).homeStats ?? []),
      ...((box as any).awayStats ?? []),
    ].some((stat: any) => String(stat.playerId ?? '') === player.internalId))
    .map((box: any) => Number(box.season ?? season))
    .filter(Number.isFinite);
  const seasons = [...statSeasons, ...boxSeasons];
  if (seasons.length === 0) {
    return true;
  }
  return Math.min(...seasons) === targetSeason;
}

function isPbaLocalAwardEligible(player: NBAPlayer, leagueStats: GameState['leagueStats']): boolean {
  const contract = (player as any).pbaImportContract;
  return isPbaRosterLocal(player, leagueStats as any) &&
    !(player as any).isImport &&
    !(player as any).importConference &&
    !(contract && contract.status !== 'released');
}

function finalsMvpForCompetition(
  state: GameState,
  competitionId: string,
  season: number,
  championTid: number,
  isEligible?: (player: NBAPlayer) => boolean,
): NBAPlayer | null {
  const totals = new Map<string, { score: number; games: number }>();
  for (const box of state.boxScores ?? []) {
    if ((box as any).competitionId !== competitionId || (box as any).competitionPhase !== 'final') continue;
    if (Number((box as any).season ?? season) !== Number(season)) continue;
    const stats = Number((box as any).homeTeamId) === championTid
      ? (box as any).homeStats ?? []
      : Number((box as any).awayTeamId) === championTid
        ? (box as any).awayStats ?? []
        : [];
    for (const stat of stats) {
      const pid = String(stat.playerId ?? '');
      if (!pid) continue;
      const row = totals.get(pid) ?? { score: 0, games: 0 };
      row.score += Number(stat.gameScore ?? 0) || (Number(stat.pts ?? 0) + Number((stat as any).reb ?? 0) * 0.7 + Number(stat.ast ?? 0) * 0.7);
      row.games += 1;
      totals.set(pid, row);
    }
  }
  const playersById = new Map(state.players.map(player => [player.internalId, player]));
  const winnerId = [...totals.entries()]
    .filter(([playerId]) => {
      const player = playersById.get(playerId);
      return !!player && (!isEligible || isEligible(player));
    })
    .sort((a, b) => (b[1].score / Math.max(b[1].games, 1)) - (a[1].score / Math.max(a[1].games, 1)))[0]?.[0];
  return winnerId ? playersById.get(winnerId) ?? null : null;
}

function addPlayerAward(players: NBAPlayer[], award: HistoricalAward): NBAPlayer[] {
  if (!award.pid) return players;
  return players.map(player => {
    if (player.internalId !== award.pid) return player;
    const exists = (player.awards ?? []).some(row => Number(row.season) === Number(award.season) && row.type === award.type);
    return exists ? player : { ...player, awards: [...(player.awards ?? []), { season: award.season, type: award.type }] };
  });
}

function mergePbaAwards(existing: HistoricalAward[], awards: HistoricalAward[]): HistoricalAward[] {
  const seen = new Set(existing.map(award =>
    `${award.season}|${award.type}|${award.pid ?? ''}|${award.tid ?? ''}|${award.name ?? ''}|${award.conference ?? ''}|${award.competitionId ?? ''}`,
  ));
  const merged = [...existing];
  for (const award of awards) {
    const key = `${award.season}|${award.type}|${award.pid ?? ''}|${award.tid ?? ''}|${award.name ?? ''}|${award.conference ?? ''}|${award.competitionId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(award);
  }
  return merged;
}

function pbaAward(season: number, competitionId: string, conference: LivePbaConference | undefined, type: string, payload: Partial<HistoricalAward>): HistoricalAward {
  return {
    season,
    type,
    name: payload.name ?? '',
    pid: payload.pid,
    tid: payload.tid,
    team: payload.team,
    conference: conference ? PBA_CONFERENCE_LABEL[conference] : undefined,
    competitionId,
    source: 'PBA',
    uiMode: 'pba_isolated',
  };
}

export function healPbaAwardsFromConferenceChampions(
  existing: HistoricalAward[] = [],
  champions: any[] = [],
): HistoricalAward[] {
  const competitionByConference: Record<LivePbaConference, string> = {
    philippine: 'pba-philippine-cup',
    commissioners: 'pba-commissioners-cup',
    governors: 'pba-governors-cup',
  };
  const awards: HistoricalAward[] = [];
  for (const entry of champions) {
    const conference = entry?.conference as LivePbaConference | undefined;
    const competitionId = conference ? competitionByConference[conference] : undefined;
    const season = Number(entry?.season);
    if (!competitionId || !Number.isFinite(season)) continue;
    if (entry.teamId != null && entry.teamName) {
      awards.push(pbaAward(season, competitionId, conference, 'Champion', {
        name: entry.teamName,
        team: entry.teamName,
        tid: Number(entry.teamId),
      }));
    }
    if (entry.finalsMvpId && entry.finalsMvpName) {
      awards.push(pbaAward(season, competitionId, conference, 'Finals MVP', {
        name: entry.finalsMvpName,
        pid: entry.finalsMvpId,
        tid: Number(entry.teamId),
      }));
    }
    if (entry.bestPlayerId && entry.bestPlayerName) {
      awards.push(pbaAward(season, competitionId, conference, 'Best Player of the Conference', {
        name: entry.bestPlayerName,
        pid: entry.bestPlayerId,
        tid: Number(entry.teamId),
      }));
    }
    if (entry.bestImportId && entry.bestImportName) {
      awards.push(pbaAward(season, competitionId, conference, 'Best Import of the Conference', {
        name: entry.bestImportName,
        pid: entry.bestImportId,
        tid: Number(entry.teamId),
      }));
    }
  }
  return mergePbaAwards(existing, awards);
}

export function buildPbaLiveAwardPatch(
  state: GameState,
  conference: LivePbaConference,
  competitionId: string,
  championTid: number,
  runnerUpTid?: number | null,
): LivePbaAwardPatch {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return {};
  const season = (state.leagueStats as any)?.year ?? new Date().getFullYear();
  const existing = state.historicalAwards ?? [];
  const champion = resolveAnyTeam(championTid, state.teams, state.nonNBATeams ?? []);
  const runnerUp = runnerUpTid != null ? resolveAnyTeam(runnerUpTid, state.teams, state.nonNBATeams ?? []) : null;
  const localEligible = (player: NBAPlayer) => isPbaLocalAwardEligible(player, state.leagueStats);
  const bestPlayer = competitionScoreLeaders(state, competitionId, season, localEligible)[0]?.player ?? null;
  const bestImport = conference === 'philippine'
    ? null
    : competitionScoreLeaders(state, competitionId, season, player => !!(player as any).isImport)[0]?.player ?? null;
  const finalsMvp = finalsMvpForCompetition(state, competitionId, season, championTid, localEligible) ?? bestPlayer;
  const awards: HistoricalAward[] = [];
  if (champion) awards.push(pbaAward(season, competitionId, conference, 'Champion', { name: getTeamFullName(champion), team: getTeamFullName(champion), tid: championTid }));
  if (runnerUp) awards.push(pbaAward(season, competitionId, conference, 'Runner Up', { name: getTeamFullName(runnerUp), team: getTeamFullName(runnerUp), tid: runnerUpTid ?? undefined }));
  if (finalsMvp) awards.push(pbaAward(season, competitionId, conference, 'Finals MVP', { name: finalsMvp.name, pid: finalsMvp.internalId, tid: finalsMvp.tid }));
  if (bestPlayer) awards.push(pbaAward(season, competitionId, conference, 'Best Player of the Conference', { name: bestPlayer.name, pid: bestPlayer.internalId, tid: bestPlayer.tid }));
  if (bestImport) awards.push(pbaAward(season, competitionId, conference, 'Best Import of the Conference', { name: bestImport.name, pid: bestImport.internalId, tid: bestImport.tid }));
  let players = state.players;
  for (const award of awards) players = addPlayerAward(players, award);
  return {
    players,
    historicalAwards: mergePbaAwards(existing, awards),
    conferenceAwardMeta: {
      finalsMvpId: finalsMvp?.internalId,
      finalsMvpName: finalsMvp?.name,
      bestPlayerId: bestPlayer?.internalId,
      bestPlayerName: bestPlayer?.name,
      bestImportId: bestImport?.internalId,
      bestImportName: bestImport?.name,
    },
  };
}

export function buildPbaSeasonAwardPatch(state: GameState): Partial<GameState> {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return {};
  const season = (state.leagueStats as any)?.year ?? new Date().getFullYear();
  const teams = pbaTeamsWithRecords(state, 'pba-governors-cup', season);
  const players = pbaPlayers(state).filter(player => isPbaLocalAwardEligible(player, state.leagueStats));
  if (players.length === 0 || teams.length === 0) return {};
  const races = AwardService.calculateAwardRaces(players, teams, season, state.staff, state.leagueStats?.minGamesRequirement);
  const existing = state.historicalAwards ?? [];
  const awards: HistoricalAward[] = [];
  const addCandidate = (type: string, candidate: any) => {
    const player = candidate?.player;
    if (!player) return;
    awards.push(pbaAward(season, 'pba', undefined, type, { name: player.name, pid: player.internalId, tid: player.tid }));
  };
  const rookieLeaders = pbaSeasonScoreLeaders(
    state,
    season,
    player => isPbaLocalAwardEligible(player, state.leagueStats) && isPbaRookieForSeason(state, player, season),
  );
  const rookieFromLive = rookieLeaders[0];
  const rookieFromRace = races.roty.find(row => row.player && isPbaRookieForSeason(state, row.player, season));
  const mostImproved = getPbaMostImprovedCandidates(state, players, teams, season)[0]
    ?? races.mip.find(row => row.player && isPbaLocalAwardEligible(row.player, state.leagueStats));
  addCandidate('Most Valuable Player', races.mvp[0]);
  addCandidate('Rookie of the Year', rookieFromLive ? { player: rookieFromLive.player } : rookieFromRace);
  addCandidate('Most Improved Player', mostImproved);
  addCandidate('Defensive Player of the Year', races.dpoy[0]);
  addCandidate('Mr. Quality Minutes', races.smoy[0] ?? races.mvp.find(row => (row.stats?.gs ?? 0) <= (row.stats?.gp ?? 0) / 2));
  addCandidate('Scoring Champion', [...players]
    .map(player => {
      const stat = player.stats?.find(row => Number(row.season) === Number(season) && !row.playoffs && (row.gp ?? 0) > 0);
      return stat ? { player, score: (stat.pts ?? 0) / Math.max(stat.gp ?? 1, 1) } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)[0]);
  const coy = races.coy[0];
  if (coy?.coachName) awards.push(pbaAward(season, 'pba', undefined, 'Coach of the Year', { name: coy.coachName, tid: coy.team?.id }));
  races.allNBATeams.allNBA[0]?.forEach(spot => awards.push(pbaAward(season, 'pba', undefined, 'PBA Mythical First Team', { name: spot.player.name, pid: spot.player.internalId, tid: spot.player.tid })));
  races.allNBATeams.allNBA[1]?.forEach(spot => awards.push(pbaAward(season, 'pba', undefined, 'PBA Mythical Second Team', { name: spot.player.name, pid: spot.player.internalId, tid: spot.player.tid })));
  races.allNBATeams.allDefense[0]?.forEach(spot => awards.push(pbaAward(season, 'pba', undefined, 'PBA All-Defensive Team', { name: spot.player.name, pid: spot.player.internalId, tid: spot.player.tid })));
  rookieLeaders.slice(0, 5).forEach(row => awards.push(pbaAward(season, 'pba', undefined, 'PBA All-Rookie Team', { name: row.player.name, pid: row.player.internalId, tid: row.player.tid })));
  let nextPlayers = state.players;
  for (const award of awards) nextPlayers = addPlayerAward(nextPlayers, award);
  return {
    players: nextPlayers,
    historicalAwards: mergePbaAwards(existing, awards),
  };
}
