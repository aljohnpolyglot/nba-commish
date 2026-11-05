import type {
  BackgroundAward,
  BackgroundLeagueSeason,
  BackgroundPlayerSeason,
  BackgroundRecord,
  GameState,
  NBAGMStat,
  NBAPlayer,
} from '../../types';
import { EXTERNAL_LEAGUE_STATUSES } from '../../constants';
import { unpackBackgroundIdentities } from './backgroundIdentityRows';
import { getBackgroundSeasonPlayers } from './backgroundPlayerRows';
import { getBackgroundSeasonTeams } from './backgroundTeamRows';
import { unpackBackgroundTransactions } from './backgroundTransactionRows';

function toStat(row: BackgroundPlayerSeason, season: number, leagueId: string): NBAGMStat {
  const fga = Math.max(1, row.pts / Math.max(0.55, row.fgPct * 2.15));
  const fg = fga * row.fgPct;
  const tpa = Math.max(0, fga * 0.32);
  const tp = tpa * row.tpPct;
  const fta = Math.max(0, row.pts * 0.22);
  const ft = fta * row.ftPct;
  const orb = row.reb * 0.28;
  const drb = row.reb - orb;
  const ewa = Math.round(Math.max(-1.5, (row.per - 11) * row.min * row.gp / 4050) * 100) / 100;
  return {
    season,
    tid: row.tid,
    gp: row.gp,
    gs: row.min >= 24 ? row.gp : 0,
    min: row.min,
    fg,
    fga,
    fgp: row.fgPct,
    tp,
    tpa,
    tpp: row.tpPct,
    ft,
    fta,
    ftp: row.ftPct,
    orb,
    drb,
    trb: row.reb,
    ast: row.ast,
    stl: row.stl,
    blk: row.blk,
    tov: row.tov,
    pf: 2.1,
    pts: row.pts,
    per: row.per,
    ewa,
    playoffs: false,
    competitionId: `background:${leagueId}`,
  };
}

export function getBackgroundStatsByPlayer(state: Pick<GameState, 'backgroundUniverse'>): Map<string, NBAGMStat[]> {
  const result = new Map<string, NBAGMStat[]>();
  for (const leagueSeason of state.backgroundUniverse?.seasons ?? []) {
    for (const row of getBackgroundSeasonPlayers(leagueSeason)) {
      const stats = result.get(row.playerId) ?? [];
      stats.push(toStat(row, leagueSeason.season, leagueSeason.leagueId));
      result.set(row.playerId, stats);
    }
  }
  for (const stats of result.values()) stats.sort((left, right) => left.season - right.season || left.tid - right.tid);
  return result;
}

export function getBackgroundStatsForPlayer(
  state: Pick<GameState, 'backgroundUniverse'>,
  playerId: string,
): NBAGMStat[] {
  const result: NBAGMStat[] = [];
  for (const leagueSeason of state.backgroundUniverse?.seasons ?? []) {
    const row = getBackgroundSeasonPlayers(leagueSeason).find(player => player.playerId === playerId);
    if (row) result.push(toStat(row, leagueSeason.season, leagueSeason.leagueId));
  }
  return result.sort((left, right) => left.season - right.season || left.tid - right.tid);
}

function statusForBackgroundLeague(leagueId: string): NBAPlayer['status'] {
  const normalized = leagueId.trim().toLowerCase();
  return EXTERNAL_LEAGUE_STATUSES.find(status => status.toLowerCase() === normalized) as NBAPlayer['status'];
}

export function getBackgroundGeneratedPlayers(
  state: Pick<GameState, 'backgroundUniverse'>,
  leagueId?: string,
): NBAPlayer[] {
  const universe = state.backgroundUniverse;
  if (!universe || universe.version !== 2) return [];
  const normalizedLeagueId = leagueId?.trim().toLowerCase();
  const identities = new Map(unpackBackgroundIdentities(universe.identities)
    .filter(identity => identity.generated)
    .map(identity => [identity.playerId, identity]));
  const statsByPlayer = getBackgroundStatsByPlayer(state);
  const seasonsByPlayer = new Map<string, Array<{ leagueId: string; season: number; tid: number; rating: number }>>();
  const draftByPlayer = new Map<string, { year: number; tid: number; pick?: number }>();
  const retirementByPlayer = new Map<string, number>();

  for (const season of universe.seasons) {
    if (normalizedLeagueId && season.leagueId.trim().toLowerCase() !== normalizedLeagueId) continue;
    for (const row of getBackgroundSeasonPlayers(season)) {
      if (!identities.has(row.playerId)) continue;
      const rows = seasonsByPlayer.get(row.playerId) ?? [];
      rows.push({ leagueId: season.leagueId, season: season.season, tid: row.tid, rating: row.rating });
      seasonsByPlayer.set(row.playerId, rows);
    }
    for (const transaction of unpackBackgroundTransactions(season.transactions)) {
      if (!identities.has(transaction.playerId)) continue;
      if (transaction.type === 'draft' && transaction.tid != null && !draftByPlayer.has(transaction.playerId)) {
        draftByPlayer.set(transaction.playerId, { year: season.season, tid: transaction.tid, pick: transaction.pick });
      }
      if (transaction.type === 'retirement') retirementByPlayer.set(transaction.playerId, season.season);
    }
  }

  const players: NBAPlayer[] = [];
  for (const identity of identities.values()) {
    const seasonRows = (seasonsByPlayer.get(identity.playerId) ?? [])
      .sort((left, right) => left.season - right.season || left.tid - right.tid);
    const latest = seasonRows[seasonRows.length - 1];
    if (!latest) continue;
    const retirementYear = retirementByPlayer.get(identity.playerId);
    players.push({
      internalId: identity.playerId,
      personId: identity.personId,
      tid: retirementYear == null ? latest.tid : -1,
      name: identity.name,
      overallRating: latest.rating,
      potential: latest.rating,
      ratings: seasonRows.map(row => ({ season: row.season, ovr: row.rating, pot: row.rating })),
      stats: statsByPlayer.get(identity.playerId) ?? [],
      pos: identity.pos,
      age: identity.bornYear == null ? undefined : Math.max(16, latest.season - identity.bornYear),
      born: identity.bornYear == null
        ? undefined
        : { year: identity.bornYear, loc: identity.nationality ?? 'International' },
      nationality: identity.nationality,
      draft: draftByPlayer.get(identity.playerId),
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: retirementYear == null ? statusForBackgroundLeague(latest.leagueId) : 'Retired',
      retiredYear: retirementYear,
    });
  }
  return players.sort((left, right) => left.name.localeCompare(right.name) || left.internalId.localeCompare(right.internalId));
}

export function getBackgroundLeagueSeasons(state: Pick<GameState, 'backgroundUniverse'>, leagueId: string) {
  const normalizedLeagueId = leagueId.trim().toLowerCase();
  return (state.backgroundUniverse?.seasons ?? [])
    .filter(entry => entry.leagueId.trim().toLowerCase() === normalizedLeagueId)
    .sort((left, right) => right.season - left.season);
}

export interface BackgroundTeamHistoryRow {
  leagueId: string;
  season: number;
  source: BackgroundLeagueSeason['source'];
  won: number;
  lost: number;
  seed: number;
  strength: number;
  isChampion: boolean;
  isRunnerUp: boolean;
  awards: BackgroundAward[];
  records: BackgroundRecord[];
}

export function getBackgroundLeagueHistory(
  state: Pick<GameState, 'backgroundUniverse'>,
  leagueId: string,
): BackgroundLeagueSeason[] {
  return getBackgroundLeagueSeasons(state, leagueId);
}

export function getBackgroundLeagueIds(
  state: Pick<GameState, 'backgroundUniverse'>,
): string[] {
  const byNormalizedId = new Map<string, string>();
  for (const entry of state.backgroundUniverse?.seasons ?? []) {
    const leagueId = entry.leagueId.trim();
    if (!leagueId) continue;
    const normalized = leagueId.toLowerCase();
    if (!byNormalizedId.has(normalized)) byNormalizedId.set(normalized, leagueId);
  }
  return [...byNormalizedId.values()].sort((left, right) => left.localeCompare(right));
}

export function getBackgroundTeamHistory(
  state: Pick<GameState, 'backgroundUniverse'>,
  tid: number,
): BackgroundTeamHistoryRow[] {
  const result: BackgroundTeamHistoryRow[] = [];
  for (const leagueSeason of state.backgroundUniverse?.seasons ?? []) {
    const team = getBackgroundSeasonTeams(leagueSeason).find(entry => entry.tid === tid);
    if (!team) continue;
    result.push({
      leagueId: leagueSeason.leagueId,
      season: leagueSeason.season,
      source: leagueSeason.source,
      won: team.won,
      lost: team.lost,
      seed: team.seed,
      strength: team.strength,
      isChampion: leagueSeason.championTid === tid,
      isRunnerUp: leagueSeason.runnerUpTid === tid,
      awards: leagueSeason.awards.filter(award => award.tid === tid),
      records: leagueSeason.records.filter(record => record.tid === tid),
    });
  }
  return result.sort((left, right) => right.season - left.season || left.leagueId.localeCompare(right.leagueId));
}

export function mergeBackgroundStatsIntoPlayers(
  players: NBAPlayer[],
  state: Pick<GameState, 'backgroundUniverse'>,
): NBAPlayer[] {
  const backgroundByPlayer = getBackgroundStatsByPlayer(state);
  return players.map(player => {
    const backgroundStats = backgroundByPlayer.get(player.internalId);
    if (!backgroundStats?.length) return player;
    const existing = player.stats ?? [];
    const existingKeys = new Set(existing.map(row => (
      `${Number(row.season)}:${Number(row.tid)}:${String(row.competitionId ?? '')}`
    )));
    const additions = backgroundStats.filter(row => !existingKeys.has(
      `${Number(row.season)}:${Number(row.tid)}:${String(row.competitionId ?? '')}`,
    ));
    if (!additions.length) return player;
    return {
      ...player,
      stats: [...existing, ...additions]
        .sort((left, right) => Number(left.season) - Number(right.season)
          || Number(left.tid) - Number(right.tid)
          || String(left.competitionId ?? '').localeCompare(String(right.competitionId ?? ''))),
    };
  });
}
