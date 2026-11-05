import { SUMMER_LEAGUE_HISTORY_SEEDS, type SummerLeagueHistorySeed } from '../../data/summerLeagueHistory';
import type { GameState } from '../../types';
import type { FibaSourcePlayer } from '../fiba/types';
import { normalizeFibaPersonName } from '../fiba/countryIdentity';
import {
  buildSummerLeagueArchivePlayer,
  findSummerLeagueArchivePlayer,
} from './playerArchive';
import { canonicalSummerLeagueTeamName } from './teamIdentity';
import type {
  SummerLeagueHistoryEntry,
  SummerLeagueSourceGame,
  SummerLeagueSourceBracket,
  SummerLeagueSourceStat,
  SummerLeagueSourceTeam,
  SummerLeagueStanding,
  SummerLeagueTournamentState,
} from './types';

interface SourceAwardPlayer {
  name?: string;
}

interface SourceAwardTeam {
  title?: string;
  players?: SourceAwardPlayer[];
}

interface SourceAwardRow {
  season?: number;
  mvp?: SourceAwardPlayer;
  allLeague?: SourceAwardTeam[];
}

interface SourceArchive {
  awards?: SourceAwardRow[];
  players?: FibaSourcePlayer[];
}

interface SourceSeason {
  year?: number;
  games?: SummerLeagueSourceGame[];
  teams?: SummerLeagueSourceTeam[];
  standings?: SummerLeagueStanding[];
  stats?: SummerLeagueSourceStat[];
  bracket?: SummerLeagueSourceBracket;
}

interface SourceGameArchive {
  seasons?: SourceSeason[];
}

interface CompetitionEntity {
  sourceName?: string;
}

interface CompetitionAwardWinner {
  person?: CompetitionEntity;
}

interface CompetitionAward {
  awardKey?: string;
  status?: string;
  winners?: CompetitionAwardWinner[];
}

interface CompetitionSeason {
  season?: number;
  champion?: CompetitionEntity;
  runnerUp?: CompetitionEntity;
  awards?: CompetitionAward[];
}

interface CompetitionArchive {
  schemaVersion?: number;
  competitionKey?: string;
  seasons?: CompetitionSeason[];
}

const entityName = (entity?: CompetitionEntity): string | null => {
  const name = String(entity?.sourceName ?? '').trim();
  return name || null;
};

export function mergeSummerLeagueHistorySeeds(
  archive: CompetitionArchive,
): SummerLeagueHistorySeed[] {
  const rows = new Map(SUMMER_LEAGUE_HISTORY_SEEDS.map(row => [row.year, row]));
  if (archive.schemaVersion !== 1 || archive.competitionKey !== 'summer-league') return [...rows.values()];
  for (const season of archive.seasons ?? []) {
    const year = Number(season.season);
    if (!Number.isFinite(year)) continue;
    const existing = rows.get(year);
    const finalsMvp = (season.awards ?? [])
      .find(award => award.awardKey === 'finals-mvp' && award.status === 'awarded')
      ?.winners?.map(winner => entityName(winner.person)).find(Boolean) ?? null;
    rows.set(year, {
      year,
      champion: entityName(season.champion) ?? existing?.champion ?? null,
      runnerUp: entityName(season.runnerUp) ?? existing?.runnerUp ?? null,
      championshipMvp: finalsMvp ?? existing?.championshipMvp ?? null,
      mvp: existing?.mvp ?? null,
    });
  }
  return [...rows.values()].sort((left, right) => right.year - left.year);
}

function safeSourceGame(game: SummerLeagueSourceGame): SummerLeagueSourceGame | null {
  if (
    !game?.id
    || !game.date
    || !game.homeTeamName
    || !game.awayTeamName
  ) return null;
  let boxScoreUrl: string | undefined;
  if (game.boxScoreUrl) {
    try {
      const parsed = new URL(game.boxScoreUrl);
      if (
        ['http:', 'https:'].includes(parsed.protocol)
        && (
          parsed.hostname === 'nba.com'
          || parsed.hostname.endsWith('.nba.com')
          || parsed.hostname === 'basketball.realgm.com'
          || parsed.hostname === 'espn.com'
          || parsed.hostname.endsWith('.espn.com')
        )
      ) boxScoreUrl = parsed.href;
    } catch {
      boxScoreUrl = undefined;
    }
  }
  return {
    ...game,
    homeTeamName: canonicalSummerLeagueTeamName(game.homeTeamName),
    awayTeamName: canonicalSummerLeagueTeamName(game.awayTeamName),
    homeScore: Number.isFinite(game.homeScore) ? Number(game.homeScore) : null,
    awayScore: Number.isFinite(game.awayScore) ? Number(game.awayScore) : null,
    boxScoreUrl,
  };
}

function sourceAge(value: unknown, year: number): number | null {
  const age = Number(value);
  if (!Number.isFinite(age)) return null;
  if (age >= 14 && age <= 50) return Math.round(age);
  const fromNegativeBirthYear = year + age;
  if (age < 0 && fromNegativeBirthYear >= 14 && fromNegativeBirthYear <= 50) {
    return Math.round(fromNegativeBirthYear);
  }
  const fromBirthYear = year - age;
  if (age > 100 && fromBirthYear >= 14 && fromBirthYear <= 50) {
    return Math.round(fromBirthYear);
  }
  return null;
}

function sourceBirthYear(value: unknown, year: number): number | null {
  const birthYear = Number(value);
  return Number.isFinite(birthYear) && birthYear >= year - 50 && birthYear <= year - 14
    ? Math.round(birthYear)
    : null;
}

function hydrateSourceSeason(
  season: SourceSeason,
  playersByName: ReadonlyMap<string, readonly FibaSourcePlayer[]>,
) {
  const year = Number(season.year);
  const bioPlayers = new Map<string, ReturnType<typeof buildSummerLeagueArchivePlayer>>();
  const bioBySource = new Map<FibaSourcePlayer, ReturnType<typeof buildSummerLeagueArchivePlayer>>();
  const resolveBio = (name: string, birthYear?: number | null) => {
    const source = findSummerLeagueArchivePlayer(playersByName, name, birthYear);
    if (!source) return undefined;
    const bio = bioBySource.get(source) ?? buildSummerLeagueArchivePlayer(source, year);
    bioBySource.set(source, bio);
    bioPlayers.set(bio.internalId, bio);
    return bio;
  };
  const hydratedTeams = (season.teams ?? []).map(team => ({
    ...team,
    name: canonicalSummerLeagueTeamName(team.name),
    roster: (team.roster ?? []).map(player => {
      const birthYear = sourceBirthYear(player.birthYear, year);
      return {
        ...player,
        birthYear,
        bioPlayer: resolveBio(player.name, birthYear),
      };
    }),
  }));
  const teamGroups = new Map<string, typeof hydratedTeams>();
  for (const team of hydratedTeams) {
    const name = canonicalSummerLeagueTeamName(team.name).toLowerCase();
    teamGroups.set(name, [...(teamGroups.get(name) ?? []), team]);
  }
  const teamIdAliases = new Map<string, string>();
  const teams = [...teamGroups.values()].map(group => {
    const base = [...group].sort((left, right) =>
      right.roster.length - left.roster.length
      || Number(Boolean(right.abbrev)) - Number(Boolean(left.abbrev))
      || left.id.localeCompare(right.id),
    )[0];
    for (const team of group) teamIdAliases.set(team.id, base.id);
    return base;
  });
  const standingTotals = new Map<string, Omit<SummerLeagueStanding, 'rank'>>();
  for (const row of season.standings ?? []) {
    const teamId = teamIdAliases.get(row.teamId) ?? row.teamId;
    const current = standingTotals.get(teamId) ?? {
      teamId,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
    };
    current.played += Number(row.played ?? 0);
    current.wins += Number(row.wins ?? 0);
    current.losses += Number(row.losses ?? 0);
    current.pointsFor += Number(row.pointsFor ?? 0);
    current.pointsAgainst += Number(row.pointsAgainst ?? 0);
    current.pointDifference = current.pointsFor - current.pointsAgainst;
    standingTotals.set(teamId, current);
  }
  const standings = [...standingTotals.values()]
    .sort((left, right) =>
      right.wins - left.wins
      || left.losses - right.losses
      || right.pointDifference - left.pointDifference
      || right.pointsFor - left.pointsFor
      || left.teamId.localeCompare(right.teamId),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const standingByTeam = new Map(standings.map(row => [row.teamId, row]));
  const teamsWithRecords = teams.map(team => {
    const standing = standingByTeam.get(team.id);
    return standing
      ? {
          ...team,
          rank: standing.rank,
          wins: standing.wins,
          losses: standing.losses,
          played: standing.played,
          winPct: standing.played > 0 ? standing.wins / standing.played : null,
        }
      : team;
  });
  const stats = (season.stats ?? []).map(row => {
    const bioPlayer = resolveBio(row.name);
    return {
      ...row,
      playerId: bioPlayer?.internalId ?? row.playerId,
      age: sourceAge(row.age, year),
    };
  });
  const bracket = season.bracket
    ? {
        semifinals: (season.bracket.semifinals ?? []).map(game => ({
          ...game,
          homeTeamName: canonicalSummerLeagueTeamName(game.homeTeamName),
          awayTeamName: canonicalSummerLeagueTeamName(game.awayTeamName),
        })),
        finals: (season.bracket.finals ?? []).map(game => ({
          ...game,
          homeTeamName: canonicalSummerLeagueTeamName(game.homeTeamName),
          awayTeamName: canonicalSummerLeagueTeamName(game.awayTeamName),
        })),
      }
    : undefined;
  return {
    games: (season.games ?? []).flatMap(game => {
      const safe = safeSourceGame(game);
      return safe ? [safe] : [];
    }),
    teams: teamsWithRecords,
    standings,
    stats,
    sourcePlayers: [...bioPlayers.values()],
    bracket,
  };
}

function savedPlayerName(
  tournament: SummerLeagueTournamentState,
  playerId: string | undefined,
): string | null {
  if (!playerId) return null;
  return tournament.teams
    .flatMap(team => [...team.players, ...team.reserves])
    .find(player => player.savePlayerId === playerId || player.id === playerId)?.name ?? null;
}

function savedEntry(tournament: SummerLeagueTournamentState): SummerLeagueHistoryEntry | undefined {
  if (!tournament.result) return undefined;
  const champion = tournament.teams.find(team => team.id === tournament.result?.championTeamId);
  const runnerUp = tournament.teams.find(team => team.id === tournament.result?.runnerUpTeamId);
  const awards = tournament.result.awards;
  return {
    year: tournament.year,
    champion: champion?.name ?? null,
    runnerUp: runnerUp?.name ?? null,
    championshipMvp: savedPlayerName(tournament, awards.championshipMvpPlayerId),
    mvp: savedPlayerName(tournament, awards.mvpPlayerId),
    firstTeam: awards.firstTeamPlayerIds.flatMap(id => {
      const name = savedPlayerName(tournament, id);
      return name ? [name] : [];
    }),
    secondTeam: awards.secondTeamPlayerIds.flatMap(id => {
      const name = savedPlayerName(tournament, id);
      return name ? [name] : [];
    }),
    source: 'save',
    tournament,
  };
}

export function summerLeagueSourceCutoff(state: GameState): number {
  if (state.leagueType === 'fictional') return 0;
  const branchYear = Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear ?? state.leagueStats.year);
  const start = String(state.pendingStartPayload?.startDate ?? '');
  if (start) return start >= `${branchYear}-07-31` ? branchYear : branchYear - 1;
  return state.nbaGmStartMode === 'fixed_preseason' ? branchYear : branchYear - 1;
}

export async function loadSummerLeagueHistory(
  state: GameState,
): Promise<SummerLeagueHistoryEntry[]> {
  const cutoff = summerLeagueSourceCutoff(state);
  let source: SourceArchive = {};
  let sourceGames: SourceGameArchive = {};
  let competitionArchive: CompetitionArchive = {};
  if (cutoff >= 2006) {
    const [awardResponse, historyResponse, competitionResponse] = await Promise.all([
      fetch('/data/external/summer-league/nba-summer-league-2026-bbgm.json'),
      fetch('/data/summer-league-history/source-history.normalized.json'),
      fetch('/data/historical/competitions/summer-league.json'),
    ]);
    if (!awardResponse.ok || !historyResponse.ok || !competitionResponse.ok) {
      throw new Error(`Summer League history failed to load (${awardResponse.status}/${historyResponse.status}/${competitionResponse.status}).`);
    }
    [source, sourceGames, competitionArchive] = await Promise.all([
      awardResponse.json() as Promise<SourceArchive>,
      historyResponse.json() as Promise<SourceGameArchive>,
      competitionResponse.json() as Promise<CompetitionArchive>,
    ]);
    if (!Array.isArray(sourceGames.seasons)) {
      throw new Error('Summer League history has an invalid season archive.');
    }
  }
  const awardByYear = new Map((source.awards ?? []).map(row => [Number(row.season), row]));
  const sourcePlayersByName = new Map<string, FibaSourcePlayer[]>();
  for (const player of source.players ?? []) {
    const name = normalizeFibaPersonName(player.name);
    sourcePlayersByName.set(name, [...(sourcePlayersByName.get(name) ?? []), player]);
  }
  const sourceHistoryByYear = new Map((sourceGames.seasons ?? []).map(season => [
    Number(season.year),
    hydrateSourceSeason(season, sourcePlayersByName),
  ]));
  const historical = mergeSummerLeagueHistorySeeds(competitionArchive)
    .filter(row => row.year <= cutoff)
    .map((row): SummerLeagueHistoryEntry => {
      const awards = awardByYear.get(row.year);
      const tournamentEra = row.year >= 2013;
      const firstTeam = awards?.allLeague?.find(team => team.title === 'First Team')?.players ?? [];
      const secondTeam = awards?.allLeague?.find(team => team.title === 'Second Team')?.players ?? [];
      const sourceSeason = sourceHistoryByYear.get(row.year);
      return {
        ...row,
        champion: tournamentEra && row.champion ? canonicalSummerLeagueTeamName(row.champion) : null,
        runnerUp: tournamentEra && row.runnerUp ? canonicalSummerLeagueTeamName(row.runnerUp) : null,
        championshipMvp: tournamentEra ? row.championshipMvp : null,
        mvp: row.mvp || awards?.mvp?.name || null,
        firstTeam: firstTeam.flatMap(player => player.name ? [player.name] : []).slice(0, 7),
        secondTeam: secondTeam.flatMap(player => player.name ? [player.name] : []).slice(0, 7),
        source: 'historical',
        sourceGames: sourceSeason?.games,
        sourceTeams: sourceSeason?.teams,
        sourceStandings: sourceSeason?.standings,
        sourceStats: sourceSeason?.stats,
        sourcePlayers: sourceSeason?.sourcePlayers,
        sourceBracket: sourceSeason?.bracket,
      };
    });
  const saved = [...(state.summerLeagueHistory ?? []), state.summerLeagueTournament]
    .filter((entry): entry is SummerLeagueTournamentState =>
      !!entry && !!entry.result && ['complete', 'reviewed'].includes(entry.status),
    )
    .flatMap(entry => {
      const row = savedEntry(entry);
      return row ? [row] : [];
    });
  return [...new Map([...historical, ...saved].map(row => [row.year, row])).values()]
    .sort((left, right) => right.year - left.year);
}
