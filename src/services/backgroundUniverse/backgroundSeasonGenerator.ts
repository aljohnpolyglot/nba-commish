import type {
  BackgroundAward,
  BackgroundLeagueSeason,
  BackgroundPlayerIdentity,
  BackgroundPlayerSeason,
  BackgroundRecord,
  BackgroundUniverseState,
  GameState,
  NBAPlayer,
  NBATeam,
  NonNBATeam,
} from '../../types';
import {
  backgroundHashUnit,
  buildBackgroundRosterContinuity,
} from './backgroundRosterContinuity';
import {
  getBackgroundSeasonPlayers,
  packBackgroundPlayerRows,
} from './backgroundPlayerRows';
import {
  packBackgroundIdentities,
  unpackBackgroundIdentities,
} from './backgroundIdentityRows';
import { packBackgroundTransactions } from './backgroundTransactionRows';
import { packBackgroundTeamRows } from './backgroundTeamRows';

type UniverseTeam = (NBATeam | NonNBATeam) & { id?: number; tid?: number; league?: string };

const round = (value: number, precision = 1): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function teamId(team: UniverseTeam): number {
  const tid = Number(team.tid);
  return Number.isFinite(tid) ? tid : Number(team.id);
}

function normalizeLeagueId(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return normalized || 'NBA';
}

function teamLeague(team: UniverseTeam): string {
  return normalizeLeagueId(team.league);
}

export function getActiveNativeTeamIds(state: GameState): Set<number> {
  const tids = new Set<number>();
  const uiMode = state.leagueStats?.uiMode;
  if (uiMode === 'pba_isolated') {
    for (const team of state.nonNBATeams ?? []) if (team.league === 'PBA') tids.add(team.tid);
  } else if (uiMode === 'euro_isolated') {
    for (const values of Object.values(state.euroCompetitionTeamTids ?? {})) {
      for (const tid of values) tids.add(Number(tid));
    }
    if (state.userTeamId != null) tids.add(state.userTeamId);
  } else {
    for (const team of state.teams ?? []) tids.add(team.id);
  }
  for (const game of state.schedule ?? []) {
    const homeTid = Number((game as unknown as { homeTid?: number; homeTeamId?: number }).homeTid
      ?? (game as unknown as { homeTeamId?: number }).homeTeamId);
    const awayTid = Number((game as unknown as { awayTid?: number; awayTeamId?: number }).awayTid
      ?? (game as unknown as { awayTeamId?: number }).awayTeamId);
    if (Number.isFinite(homeTid)) tids.add(homeTid);
    if (Number.isFinite(awayTid)) tids.add(awayTid);
  }
  return tids;
}

function playerAge(player: NBAPlayer, season: number): number {
  const bornYear = Number(player.born?.year);
  if (Number.isFinite(bornYear)) return clamp(season - bornYear, 16, 55);
  return clamp(Number(player.age ?? 26), 16, 55);
}

function teamStrength(roster: NBAPlayer[], previousByPlayer: Map<string, BackgroundPlayerSeason>, season: number): number {
  const ratings = roster
    .map(player => round(clamp(Number(player.overallRating ?? previousByPlayer.get(player.internalId)?.rating ?? 50), 25, 95), 1))
    .sort((left, right) => right - left)
    .slice(0, 10);
  return round(ratings.reduce((sum, value) => sum + value, 0) / Math.max(1, ratings.length), 2);
}

function buildStandings(
  leagueId: string,
  teams: UniverseTeam[],
  rosters: Map<number, NBAPlayer[]>,
  previousByPlayer: Map<string, BackgroundPlayerSeason>,
  season: number,
) {
  const records = teams.map(team => ({
    tid: teamId(team),
    won: 0,
    lost: 0,
    strength: teamStrength(rosters.get(teamId(team)) ?? [], previousByPlayer, season),
  }));
  const meetings = records.length <= 12 ? 3 : records.length <= 20 ? 2 : 2;
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      for (let meeting = 0; meeting < meetings; meeting += 1) {
        const a = records[left];
        const b = records[right];
        const edge = (a.strength - b.strength) / 16;
        const aWins = backgroundHashUnit(`${leagueId}:${season}:${a.tid}:${b.tid}:${meeting}`) < clamp(0.5 + edge, 0.08, 0.92);
        if (aWins) {
          a.won += 1;
          b.lost += 1;
        } else {
          b.won += 1;
          a.lost += 1;
        }
      }
    }
  }
  return records
    .sort((left, right) => right.won - left.won || right.strength - left.strength || left.tid - right.tid)
    .map((record, index) => ({ ...record, seed: index + 1 }));
}

function leagueScoringBase(leagueId: string): number {
  const key = leagueId.toLowerCase();
  if (key === 'nba' || key === 'g-league') return 112;
  if (key === 'wnba') return 83;
  if (key === 'pba') return 101;
  return 82;
}

function buildPlayerRows(
  leagueId: string,
  standings: ReturnType<typeof buildStandings>,
  rosters: Map<number, NBAPlayer[]>,
  previousByPlayer: Map<string, BackgroundPlayerSeason>,
  season: number,
): BackgroundPlayerSeason[] {
  const result: BackgroundPlayerSeason[] = [];
  for (const team of standings) {
    const roster = [...(rosters.get(team.tid) ?? [])]
      .filter(player => !player.diedYear && playerAge(player, season) <= 44)
      .sort((left, right) => (
        Number(right.overallRating ?? previousByPlayer.get(right.internalId)?.rating ?? 50)
        - Number(left.overallRating ?? previousByPlayer.get(left.internalId)?.rating ?? 50)
      ))
      .slice(0, 8);
    if (roster.length < 5) continue;
    const ratings = roster.map(player => round(clamp(Number(player.overallRating ?? previousByPlayer.get(player.internalId)?.rating ?? 50), 25, 95), 1));
    const minuteWeights = ratings.map((rating, index) => Math.max(4, rating - 32 - index * 0.7));
    const weightTotal = minuteWeights.reduce((sum, value) => sum + value, 0);
    const scoringWeights = ratings.map((rating, index) => Math.max(1, (rating - 35) ** 1.25 * (1 - index * 0.025)));
    const scoringTotal = scoringWeights.reduce((sum, value) => sum + value, 0);
    roster.forEach((player, index) => {
      const rating = ratings[index];
      const age = playerAge(player, season);
      const health = clamp(0.82 + backgroundHashUnit(`${player.internalId}:${season}:health`) * 0.18 - Math.max(0, age - 32) * 0.012, 0.48, 1);
      const teamGames = team.won + team.lost;
      const gp = Math.max(1, Math.round(teamGames * health));
      const min = round(clamp(240 * minuteWeights[index] / weightTotal, 7, 37), 1);
      const pos = String(player.pos ?? '').toUpperCase();
      const big = pos.includes('C') || pos.includes('F');
      const guard = pos.includes('G');
      const scoring = leagueScoringBase(leagueId) * scoringWeights[index] / scoringTotal;
      const pts = round(clamp(scoring, 1.2, 36), 1);
      const reb = round(clamp((big ? 3.2 : 1.6) + min * (big ? 0.17 : 0.08) + (rating - 50) * 0.035, 0.5, 15), 1);
      const ast = round(clamp((guard ? 1.8 : 0.6) + min * (guard ? 0.12 : 0.045) + (rating - 50) * 0.025, 0.3, 12), 1);
      const stl = round(clamp(0.35 + min * 0.025 + (rating - 50) * 0.008, 0.2, 3), 1);
      const blk = round(clamp((big ? 0.45 : 0.08) + min * (big ? 0.025 : 0.006) + (rating - 50) * 0.006, 0, 4), 1);
      const tov = round(clamp(0.45 + pts * 0.055 + ast * 0.14, 0.3, 5), 1);
      const fgPct = round(clamp(0.41 + (rating - 50) * 0.0021 + (big ? 0.035 : 0), 0.36, 0.68), 3);
      const tpPct = round(clamp(0.30 + (rating - 50) * 0.0018 + (guard ? 0.025 : 0), 0.22, 0.48), 3);
      const ftPct = round(clamp(0.66 + (rating - 45) * 0.0035 - (big ? 0.025 : 0), 0.48, 0.94), 3);
      const roleBonus = (min - 24) * 0.12;
      const per = round(clamp(15 + (rating - team.strength) * 0.48 + roleBonus, 4.5, 35), 1);
      result.push({
        playerId: player.internalId,
        tid: team.tid,
        rating,
        gp,
        min,
        pts,
        reb,
        ast,
        stl,
        blk,
        tov,
        fgPct,
        tpPct,
        ftPct,
        per,
      });
    });
  }
  return result.sort((left, right) => left.tid - right.tid || left.playerId.localeCompare(right.playerId));
}

function leader(players: BackgroundPlayerSeason[], value: (player: BackgroundPlayerSeason) => number) {
  return [...players].filter(player => player.gp > 0).sort((left, right) => value(right) - value(left))[0];
}

function buildAwards(
  players: BackgroundPlayerSeason[],
  previous: Map<string, BackgroundPlayerSeason>,
  rookieIds: Set<string>,
): BackgroundAward[] {
  const candidates: Array<[BackgroundAward['type'], BackgroundPlayerSeason | undefined]> = [
    ['MVP', leader(players, player => player.per * player.gp)],
    ['DPOY', leader(players, player => (player.stl * 1.8 + player.blk * 2.3 + player.reb * 0.35) * player.gp)],
    ['ROY', leader(players.filter(player => rookieIds.has(player.playerId)), player => player.per * player.gp)],
    ['SMOY', leader(players.filter(player => player.min < 24), player => player.per * player.gp)],
    ['MIP', leader(players.filter(player => previous.has(player.playerId)), player => player.per - (previous.get(player.playerId)?.per ?? player.per))],
  ];
  const used = new Set<string>();
  return candidates.flatMap(([type, player]) => {
    if (!player) return [];
    if (used.has(`${type}:${player.playerId}`)) return [];
    used.add(`${type}:${player.playerId}`);
    return [{ type, playerId: player.playerId, tid: player.tid }];
  });
}

function buildRecords(players: BackgroundPlayerSeason[]): BackgroundRecord[] {
  const specs: Array<[BackgroundRecord['type'], (player: BackgroundPlayerSeason) => number]> = [
    ['PTS', player => player.pts],
    ['REB', player => player.reb],
    ['AST', player => player.ast],
    ['STL', player => player.stl],
    ['BLK', player => player.blk],
    ['PER', player => player.per],
  ];
  return specs.flatMap(([type, read]) => {
    const player = leader(players, read);
    return player ? [{ type, playerId: player.playerId, tid: player.tid, value: read(player) }] : [];
  });
}

function buildLeagueSeason(
  state: GameState,
  leagueId: string,
  teams: UniverseTeam[],
  season: number,
  previous: BackgroundLeagueSeason | undefined,
  knownIdentities: BackgroundPlayerIdentity[],
): { snapshot: BackgroundLeagueSeason; identities: BackgroundPlayerIdentity[] } | null {
  const teamTids = new Set(teams.map(teamId));
  const nativePlayers = (state.players ?? []).filter(player => teamTids.has(player.tid));
  const continuity = buildBackgroundRosterContinuity({
    leagueId,
    season,
    teamTids: [...teamTids],
    nativePlayers,
    previous,
    knownIdentities,
  });
  const identityById = new Map(continuity.identities.map(identity => [identity.playerId, identity]));
  const nativeById = new Map(nativePlayers.map(player => [player.internalId, player]));
  const rosters = new Map<number, NBAPlayer[]>();
  for (const entry of continuity.roster) {
    const native = nativeById.get(entry.playerId);
    const identity = identityById.get(entry.playerId);
    const player: NBAPlayer = native
      ? { ...native, tid: entry.tid, overallRating: entry.rating, potential: entry.potential }
      : {
          internalId: entry.playerId,
          tid: entry.tid,
          name: identity?.name ?? entry.playerId,
          overallRating: entry.rating,
          potential: entry.potential,
          ratings: [],
          pos: identity?.pos ?? 'G',
          born: { year: identity?.bornYear ?? season - 22, loc: identity?.nationality ?? 'International' },
          nationality: identity?.nationality,
          injury: { type: 'Healthy', gamesRemaining: 0 },
          status: 'Free Agent',
        };
    const roster = rosters.get(entry.tid) ?? [];
    roster.push(player);
    rosters.set(entry.tid, roster);
  }
  const playableTeams = teams.filter(team => (rosters.get(teamId(team))?.length ?? 0) >= 5);
  if (playableTeams.length < 2) return null;
  const previousByPlayer = new Map(
    previous ? getBackgroundSeasonPlayers(previous).map(player => [player.playerId, player]) : [],
  );
  const rookieIds = new Set(continuity.roster.filter(entry => entry.rookieSeason === season).map(entry => entry.playerId));
  const standings = buildStandings(leagueId, playableTeams, rosters, previousByPlayer, season);
  const players = buildPlayerRows(leagueId, standings, rosters, previousByPlayer, season);
  const postseason = [...standings].sort((left, right) => (
    right.strength + backgroundHashUnit(`${leagueId}:${season}:${right.tid}:playoffs`) * 8
    - left.strength - backgroundHashUnit(`${leagueId}:${season}:${left.tid}:playoffs`) * 8
  ));
  return {
    snapshot: {
      leagueId,
      season,
      seed: `${leagueId}:${season}:background-v2`,
      source: 'simulated',
      championTid: postseason[0]?.tid,
      runnerUpTid: postseason[1]?.tid,
      teams: packBackgroundTeamRows(standings),
      players: packBackgroundPlayerRows(players),
      awards: buildAwards(players, previousByPlayer, rookieIds),
      records: buildRecords(players),
      transactions: packBackgroundTransactions(
        continuity.transactions.filter(transaction => transaction.type !== 'signing'),
      ),
    },
    identities: continuity.identities,
  };
}

export function advanceBackgroundUniverse(state: GameState, season: number): BackgroundUniverseState {
  const current = state.backgroundUniverse
    ? state.backgroundUniverse
    : { version: 2 as const, generatedThroughSeason: season - 1, seasons: [], identities: [] };
  const existingKeys = new Set(current.seasons.map(entry => `${entry.leagueId}:${entry.season}`));
  const activeTids = getActiveNativeTeamIds(state);
  const buckets = new Map<string, UniverseTeam[]>();
  for (const team of [...(state.teams ?? []), ...(state.nonNBATeams ?? [])] as UniverseTeam[]) {
    const tid = teamId(team);
    if (!Number.isFinite(tid) || activeTids.has(tid)) continue;
    const leagueId = teamLeague(team);
    const teams = buckets.get(leagueId) ?? [];
    teams.push(team);
    buckets.set(leagueId, teams);
  }
  const additions: BackgroundLeagueSeason[] = [];
  const identityById = new Map(
    (current.version === 2 ? unpackBackgroundIdentities(current.identities) : [])
      .map(identity => [identity.playerId, identity]),
  );
  for (const [leagueId, teams] of [...buckets].sort(([left], [right]) => left.localeCompare(right))) {
    if (existingKeys.has(`${leagueId}:${season}`)) continue;
    const previous = current.seasons
      .filter(entry => entry.leagueId === leagueId && entry.season < season)
      .sort((left, right) => right.season - left.season)[0];
    const generated = buildLeagueSeason(state, leagueId, teams, season, previous, [...identityById.values()]);
    if (!generated) continue;
    additions.push(generated.snapshot);
    for (const identity of generated.identities) identityById.set(identity.playerId, identity);
  }
  return {
    version: 2,
    generatedThroughSeason: Math.max(current.generatedThroughSeason, season),
    seasons: [
      ...current.seasons.map(({ roster: _legacyRoster, ...entry }) => entry),
      ...additions,
    ]
      .sort((left, right) => left.season - right.season || left.leagueId.localeCompare(right.leagueId)),
    identities: packBackgroundIdentities(
      [...identityById.values()].sort((left, right) => left.playerId.localeCompare(right.playerId)),
    ),
    ...(current.version === 2 && current.nativeHydrations?.length
      ? { nativeHydrations: current.nativeHydrations }
      : {}),
  };
}
