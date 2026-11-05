import type { HistoricalAward, NBAGMStat, NBAPlayer, NonNBATeam } from '../../types';
import { getSpainTeamPopulationOverride } from '../../data/templates/spain/teamPopulations';
import { LEAGUE_MULTIPLIERS } from '../logic/leagueOvr';
import { computeLeagueOvr, extractJerseyNumber, scaleRatings } from '../externalRosterService.shared';
import { estimatePotentialBbgm } from '../../utils/playerRatings';
import { normalizeEndesaTeam } from '../../utils/endesaTeams';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { getTeamFullName } from '../../utils/teamNames';
import { getSourceCoverageThrough, inferSourceRetirement } from '../retirement/sourceRetirement';
import { ENDESA_HISTORICAL_CATALOG, endesaStartYearToSourceSeason } from './catalog';
import { cleanHistoricalEndesaPlayerName, historicalEndesaIdentityKey } from './identity';
import { loadHistoricalEndesaSource } from './loader';
import { getEndesaRegularSeasonRows, selectCanonicalEndesaRegularSeasonRow } from './statRows';
import { getEuroYouthAgeOverallBbgm } from '../euroScouting/prospectRatings';
import { GENERATED_EXTERNAL_SCALE_ATTRS } from '../externalLeague/externalLeagueIdentity';
import type {
  EndesaMasterSource,
  EndesaSourceAwardPlayer,
  EndesaSourcePlayer,
  EndesaSourceRating,
  EndesaSourceStat,
  EndesaSourceTeam,
  HistoricalEndesaPlayerSourceMeta,
} from './types';

export interface HistoricalEndesaRosterResult {
  players: NBAPlayer[];
  teams: NonNBATeam[];
  historicalAwards: HistoricalAward[];
  sourceSeason: number;
  sourceVersion: string;
}

const teamTid = (rawTid: number): number => rawTid + ENDESA_HISTORICAL_CATALOG.teamTidOffset;

const pct = (made = 0, attempts = 0): number => attempts > 0 ? (made / attempts) * 100 : 0;

function mapStat(stat: EndesaSourceStat): NBAGMStat {
  const fg = Number(stat.fg ?? 0);
  const fga = Number(stat.fga ?? 0);
  const tp = Number(stat.tp ?? 0);
  const tpa = Number(stat.tpa ?? 0);
  const ft = Number(stat.ft ?? 0);
  const fta = Number(stat.fta ?? 0);
  const orb = Number(stat.orb ?? 0);
  const drb = Number(stat.drb ?? 0);
  return {
    season: stat.season,
    tid: teamTid(stat.tid),
    gp: Number(stat.gp ?? 0),
    gs: Number(stat.gs ?? 0),
    min: Number(stat.min ?? 0),
    fg,
    fga,
    fgp: pct(fg, fga),
    tp,
    tpa,
    tpp: pct(tp, tpa),
    ft,
    fta,
    ftp: pct(ft, fta),
    orb,
    drb,
    trb: orb + drb,
    ast: Number(stat.ast ?? 0),
    stl: Number(stat.stl ?? 0),
    blk: Number(stat.blk ?? 0),
    tov: Number(stat.tov ?? 0),
    pf: Number(stat.pf ?? 0),
    pts: Number(stat.pts ?? 0),
    per: Number(stat.per ?? 0),
    ewa: Number(stat.ewa ?? 0),
    ortg: Number(stat.ortg ?? 0),
    drtg: Number(stat.drtg ?? 0),
    obpm: Number(stat.obpm ?? 0),
    dbpm: Number(stat.dbpm ?? 0),
    vorp: Number(stat.vorp ?? 0),
    playoffs: stat.playoffs === true,
    jerseyNumber: stat.jerseyNumber,
    competitionId: 'endesa',
  };
}

function regularSeasonRows(player: EndesaSourcePlayer, sourceSeason?: number): EndesaSourceStat[] {
  return getEndesaRegularSeasonRows(player, sourceSeason);
}

function currentStatRow(player: EndesaSourcePlayer, sourceSeason: number): EndesaSourceStat | null {
  return selectCanonicalEndesaRegularSeasonRow(player, sourceSeason);
}

function compareSeasonParticipants(
  left: { identityKey: string; stat: EndesaSourceStat },
  right: { identityKey: string; stat: EndesaSourceStat },
): number {
  return Number(right.stat.gp ?? 0) - Number(left.stat.gp ?? 0)
    || Number(right.stat.min ?? 0) - Number(left.stat.min ?? 0)
    || Number(right.stat.gs ?? 0) - Number(left.stat.gs ?? 0)
    || left.identityKey.localeCompare(right.identityKey);
}

export function selectHistoricalEndesaActiveRosterIdentityKeys(
  source: EndesaMasterSource,
  sourceSeason: number,
  rosterLimit = getStandardRosterLimit(),
): Set<string> {
  const participantsByTid = new Map<number, Array<{ identityKey: string; stat: EndesaSourceStat }>>();
  const archiveBoundarySeason = endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.firstStartYear);
  for (const player of source.players) {
    const stat = currentStatRow(player, sourceSeason);
    if (!stat) continue;
    const debutSeason = regularSeasonRows(player).reduce<number | null>((first, row) => (
      first == null || row.season < first ? row.season : first
    ), null);
    const debutAge = debutSeason != null && player.born?.year ? debutSeason - player.born.year : null;
    if (sourceSeason > archiveBoundarySeason && debutSeason === sourceSeason && debutAge != null && debutAge >= 23) continue;
    const participants = participantsByTid.get(stat.tid) ?? [];
    participants.push({
      identityKey: historicalEndesaIdentityKey(player.name, player.born?.year),
      stat,
    });
    participantsByTid.set(stat.tid, participants);
  }
  return new Set(
    [...participantsByTid.values()].flatMap(participants => participants
      .sort(compareSeasonParticipants)
      .slice(0, Math.max(0, rosterLimit))
      .map(participant => participant.identityKey)),
  );
}

export function compareHistoricalEndesaMappedPlayersForSeason(
  left: NBAPlayer,
  right: NBAPlayer,
  sourceSeason: number,
): number {
  const row = (player: NBAPlayer) => (player.stats ?? []).find(stat => (
    stat.season === sourceSeason
    && stat.playoffs !== true
    && stat.tid === player.tid
    && stat.competitionId === 'endesa'
  ));
  const leftStat = row(left);
  const rightStat = row(right);
  return Number(rightStat?.gp ?? 0) - Number(leftStat?.gp ?? 0)
    || Number(rightStat?.min ?? 0) - Number(leftStat?.min ?? 0)
    || Number(rightStat?.gs ?? 0) - Number(leftStat?.gs ?? 0)
    || left.internalId.localeCompare(right.internalId);
}

function activeRating(player: EndesaSourcePlayer, sourceSeason: number): EndesaSourceRating | null {
  return [...(player.ratings ?? [])]
    .filter(rating => rating.season <= sourceSeason)
    .sort((left, right) => right.season - left.season)[0] ?? null;
}

function sourceReturnSeasons(player: EndesaSourcePlayer): number[] {
  const seasons = [...new Set(regularSeasonRows(player).map(row => row.season))].sort((a, b) => a - b);
  if (seasons.length < 2) return [];
  return seasons.filter((season, index) => index > 0 && season > seasons[index - 1] + 1);
}

export function getHistoricalEndesaDebutAge(player: EndesaSourcePlayer): number | null {
  const debutSeason = regularSeasonRows(player).reduce<number | null>((first, row) => (
    first == null || row.season < first ? row.season : first
  ), null);
  return debutSeason != null && player.born?.year ? debutSeason - player.born.year : null;
}

export function getHistoricalEndesaPlayerSourceMeta(player: EndesaSourcePlayer, sourceSeason: number): HistoricalEndesaPlayerSourceMeta | null {
  const debutSeason = regularSeasonRows(player).reduce<number | null>((first, row) => (
    first == null || row.season < first ? row.season : first
  ), null);
  const first = debutSeason == null ? null : selectCanonicalEndesaRegularSeasonRow(player, debutSeason);
  const current = currentStatRow(player, sourceSeason);
  if (!first || !current) return null;
  const identityKey = historicalEndesaIdentityKey(player.name, player.born?.year);
  return {
    identityKey,
    debutSeason: first.season,
    sourceSeason,
    sourceTeamTid: teamTid(current.tid),
    draftYear: player.draft?.year,
    draftRound: player.draft?.round,
    draftPick: player.draft?.pick,
    returnSeasons: sourceReturnSeasons(player),
  };
}

export function mapHistoricalEndesaPlayer(player: EndesaSourcePlayer, sourceSeason: number): NBAPlayer | null {
  const stat = currentStatRow(player, sourceSeason);
  const rating = activeRating(player, sourceSeason);
  const sourceMeta = getHistoricalEndesaPlayerSourceMeta(player, sourceSeason);
  if (!stat || !rating || !sourceMeta) return null;
  const name = cleanHistoricalEndesaPlayerName(player.name);
  const ratings = scaleRatings(
    (player.ratings ?? []).filter(row => row.season <= sourceSeason),
    LEAGUE_MULTIPLIERS.Endesa,
  );
  const overallRating = computeLeagueOvr(rating, 'Endesa');
  const age = player.born?.year ? sourceSeason - player.born.year : 25;
  const mappedStats = (player.stats ?? []).filter(row => row.season <= sourceSeason).map(mapStat);
  return {
    internalId: `endesa-history:${sourceMeta.identityKey}`,
    tid: teamTid(stat.tid),
    name,
    overallRating,
    potential: estimatePotentialBbgm(overallRating, age),
    ratings,
    stats: mappedStats,
    imgURL: player.imgURL,
    pos: player.pos ?? 'GF',
    age,
    hgt: player.hgt,
    weight: player.weight,
    born: player.born?.year ? { year: player.born.year, loc: player.born.loc ?? '' } : undefined,
    draft: player.draft?.year ? {
      year: player.draft.year,
      tid: -1,
      round: player.draft.round,
      pick: player.draft.pick,
      originalTid: -1,
    } : undefined,
    college: player.college,
    injury: {
      type: player.injury?.type ?? 'Healthy',
      gamesRemaining: Number(player.injury?.gamesRemaining ?? 0),
    },
    status: 'Endesa',
    hof: false,
    jerseyNumber: extractJerseyNumber({ stats: mappedStats }),
    historicalEndesaSource: sourceMeta,
  };
}

export function mapHistoricalEndesaRetiredPlayer(
  player: EndesaSourcePlayer,
  sourceSeason: number,
  sourceCoverageThrough = sourceSeason - 1,
): NBAPlayer | null {
  const retirement = inferSourceRetirement(player, {
    branchCutoffYear: sourceSeason - 1,
    sourceCoverageThrough,
    confirmThroughSourceCoverage: true,
  });
  const retiredYear = retirement?.retiredYear ?? 0;
  const bornYear = Number(player.born?.year ?? 0);
  const age = bornYear > 0 ? sourceSeason - bornYear : 0;
  if (!Number.isInteger(retiredYear) || retiredYear <= 0 || retiredYear >= sourceSeason || age <= 32) return null;
  const stat = [...regularSeasonRows(player, sourceSeason - 1)]
    .sort((left, right) => right.season - left.season || Number(right.gp ?? 0) - Number(left.gp ?? 0))[0];
  const rating = activeRating(player, sourceSeason - 1);
  if (!stat || !rating) return null;
  const identityKey = historicalEndesaIdentityKey(player.name, player.born?.year);
  const debutSeason = regularSeasonRows(player).reduce<number | null>((first, row) => (
    first == null || row.season < first ? row.season : first
  ), null);
  if (debutSeason == null) return null;
  const ratings = scaleRatings(
    (player.ratings ?? []).filter(row => row.season < sourceSeason),
    LEAGUE_MULTIPLIERS.Endesa,
  );
  const overallRating = computeLeagueOvr(rating, 'Endesa');
  const stats = (player.stats ?? []).filter(row => row.season < sourceSeason).map(mapStat);
  return {
    internalId: `endesa-history:${identityKey}`,
    tid: -3,
    name: cleanHistoricalEndesaPlayerName(player.name),
    overallRating,
    potential: overallRating,
    ratings,
    stats,
    imgURL: player.imgURL,
    pos: player.pos ?? 'GF',
    age,
    hgt: player.hgt,
    weight: player.weight,
    born: { year: bornYear, loc: player.born?.loc ?? '' },
    draft: player.draft?.year ? {
      year: player.draft.year,
      tid: -1,
      round: player.draft.round,
      pick: player.draft.pick,
      originalTid: -1,
    } : undefined,
    college: player.college,
    injury: { type: 'Healthy', gamesRemaining: 0 },
    status: 'Retired',
    retiredYear,
    sourceRetirement: retirement ?? undefined,
    hof: false,
    awards: (player.awards ?? [])
      .filter(award => Number(award.season) < sourceSeason && !!award.type)
      .map(award => ({
        season: Number(award.season),
        type: String(award.type),
        competitionId: 'endesa',
        uiMode: 'euro_isolated',
      })),
    jerseyNumber: extractJerseyNumber({ stats }),
    historicalEndesaSource: {
      identityKey,
      debutSeason,
      sourceSeason,
      sourceTeamTid: teamTid(stat.tid),
      draftYear: player.draft?.year,
      draftRound: player.draft?.round,
      draftPick: player.draft?.pick,
      returnSeasons: sourceReturnSeasons(player),
    },
  };
}

export function mapHistoricalEndesaFutureProspect(
  player: EndesaSourcePlayer,
  sourceSeason: number,
  targetTid: number,
): NBAPlayer | null {
  const debutSeason = regularSeasonRows(player).reduce<number | null>((first, row) => (
    first == null || row.season < first ? row.season : first
  ), null);
  const debut = debutSeason == null ? null : selectCanonicalEndesaRegularSeasonRow(player, debutSeason);
  const rating = [...(player.ratings ?? [])].sort((left, right) => left.season - right.season)[0];
  if (!debut || !rating || debut.season <= sourceSeason || !player.born?.year) return null;
  if ((getHistoricalEndesaDebutAge(player) ?? 0) >= 23) return null;
  const age = sourceSeason - player.born.year;
  if (age < 14 || age > 18) return null;
  const identityKey = historicalEndesaIdentityKey(player.name, player.born.year);
  const debutAge = debut.season - player.born.year;
  const debutOverall = computeLeagueOvr(rating, 'Endesa');
  const ageDevelopmentGap = getEuroYouthAgeOverallBbgm(debutAge) - getEuroYouthAgeOverallBbgm(age);
  const overallRating = Math.max(20, debutOverall - Math.max(0, ageDevelopmentGap));
  const developmentScale = overallRating / Math.max(1, debutOverall);
  const ratings = scaleRatings([rating], LEAGUE_MULTIPLIERS.Endesa).map(row => {
    const projected = { ...row, season: sourceSeason, ovr: overallRating };
    for (const attribute of GENERATED_EXTERNAL_SCALE_ATTRS) {
      projected[attribute] = Math.max(1, Math.round(Number(projected[attribute] ?? 50) * developmentScale));
    }
    return projected;
  });
  return {
    internalId: `endesa-history:${identityKey}`,
    tid: targetTid,
    name: cleanHistoricalEndesaPlayerName(player.name),
    overallRating,
    potential: estimatePotentialBbgm(overallRating, age),
    ratings,
    stats: [],
    imgURL: player.imgURL,
    pos: player.pos ?? 'GF',
    age,
    hgt: player.hgt,
    weight: player.weight,
    born: { year: player.born.year, loc: player.born.loc ?? '' },
    draft: player.draft?.year ? {
      year: player.draft.year,
      tid: -1,
      round: player.draft.round,
      pick: player.draft.pick,
      originalTid: -1,
    } : undefined,
    college: player.college,
    injury: { type: 'Healthy', gamesRemaining: 0 },
    status: 'Endesa',
    hof: false,
    historicalEndesaSource: {
      identityKey,
      debutSeason: debut.season,
      sourceSeason,
      sourceTeamTid: teamTid(debut.tid),
      draftYear: player.draft?.year,
      draftRound: player.draft?.round,
      draftPick: player.draft?.pick,
      returnSeasons: sourceReturnSeasons(player),
    },
  };
}

export function getHistoricalEndesaPlayerCountry(player: EndesaSourcePlayer): string {
  const location = String(player.born?.loc ?? '').trim();
  if (!location) return '';
  return location.split(',').at(-1)?.trim() ?? location;
}

function mapTeam(team: EndesaSourceTeam, sourceSeason: number): NonNBATeam | null {
  const season = (team.seasons ?? []).find(row => row.season === sourceSeason)
    ?? [...(team.seasons ?? [])].sort((left, right) => (
      Math.abs(left.season - sourceSeason) - Math.abs(right.season - sourceSeason)
      || left.season - right.season
    ))[0];
  const previousSeason = (team.seasons ?? []).find(row => row.season === sourceSeason - 1);
  if (!season) return null;
  const mapped = normalizeEndesaTeam({
    tid: teamTid(team.tid),
    cid: team.cid,
    did: team.did,
    region: team.region,
    name: team.name,
    abbrev: team.abbrev,
    pop: season.pop ?? team.pop ?? getSpainTeamPopulationOverride(team.region, team.name) ?? 1,
    stadiumCapacity: season.stadiumCapacity ?? team.stadiumCapacity,
    imgURL: season.imgURLSmall ?? season.imgURL ?? team.imgURLSmall ?? team.imgURL,
    colors: team.colors,
    wins: 0,
    losses: 0,
    previousSeasonWins: previousSeason?.won ?? 0,
    previousSeasonLosses: previousSeason?.lost ?? 0,
    league: 'Endesa' as const,
  });
  return mapped;
}

function awardPlayer(value: EndesaSourceAwardPlayer | undefined, sourceSeason: number, type: string): HistoricalAward | null {
  if (!value?.name) return null;
  return {
    season: sourceSeason,
    type,
    name: cleanHistoricalEndesaPlayerName(value.name),
    tid: typeof value.tid === 'number' && value.tid >= 0 ? teamTid(value.tid) : undefined,
    uiMode: 'euro_isolated',
    competitionId: 'endesa',
    source: 'historical-endesa',
  };
}

function buildHistoricalAwards(source: EndesaMasterSource, cutoffSeason: number): HistoricalAward[] {
  const rows: HistoricalAward[] = [];
  for (const team of source.teams) {
    for (const season of team.seasons ?? []) {
      if (season.season > cutoffSeason || (season.playoffRoundsWon !== 3 && season.playoffRoundsWon !== 2)) continue;
      const mappedTeam = mapTeam(team, season.season);
      if (!mappedTeam) continue;
      rows.push({
        season: season.season,
        type: season.playoffRoundsWon === 3 ? 'Champion' : 'Runner Up',
        name: getTeamFullName(mappedTeam),
        tid: mappedTeam.tid,
        uiMode: 'euro_isolated',
        competitionId: 'endesa',
        source: 'historical-endesa',
      });
    }
  }
  for (const season of source.awards ?? []) {
    if (season.season > cutoffSeason) continue;
    for (const [value, type] of [
      [season.mvp, 'MVP'],
      [season.finalsMvp, 'Finals MVP'],
      [season.roy, 'Best Young Player'],
      [season.scoringLeader, 'Scoring Leader'],
    ] as const) {
      const mapped = awardPlayer(value, season.season, type);
      if (mapped) rows.push(mapped);
    }
    const bestFive = (season.allLeague ?? []).find(team => /first/i.test(String(team.title ?? '')))?.players ?? [];
    for (const player of bestFive) {
      const mapped = awardPlayer(player, season.season, 'Liga ACB Best Five');
      if (mapped) rows.push(mapped);
    }
  }
  const playerAwardTypes: Record<string, string> = {
    'Most Valuable Player': 'MVP',
    'Finals MVP': 'Finals MVP',
    'Rookie of the Year': 'Best Young Player',
    'League Scoring Leader': 'Scoring Leader',
    'Defensive Player of the Year': 'Defensive Player of the Year',
  };
  for (const player of source.players) {
    for (const award of player.awards ?? []) {
      const season = Number(award.season ?? 0);
      const type = playerAwardTypes[String(award.type ?? '')];
      if (!type || season <= 0 || season > cutoffSeason) continue;
      const stat = currentStatRow(player, season);
      const mapped = awardPlayer({ name: player.name, tid: stat?.tid }, season, type);
      if (mapped) rows.push(mapped);
    }
  }
  for (const team of source.teams) {
    for (const season of team.seasons ?? []) {
      if (season.season > cutoffSeason) continue;
      const note = String(season.note ?? '').toLowerCase();
      const type = note === 'champion' ? 'Champion' : note === 'runner-up' ? 'Runner Up' : null;
      if (!type) continue;
      rows.push({
        season: season.season,
        type,
        name: [team.region, team.name].filter(Boolean).join(' '),
        tid: teamTid(team.tid),
        team: [team.region, team.name].filter(Boolean).join(' '),
        uiMode: 'euro_isolated',
        competitionId: 'endesa',
        source: 'historical-endesa',
      });
    }
  }
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = `${row.season}:${row.type}:${row.tid ?? ''}:${row.name ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildHistoricalEndesaSeasonTeamsFromSource(
  source: EndesaMasterSource,
  sourceSeason: number,
): NonNBATeam[] {
  const rosterPlayersByTeam = new Map<number, Set<string>>();
  for (const player of source.players) {
    const identityKey = historicalEndesaIdentityKey(player.name, player.born?.year);
    const stat = selectCanonicalEndesaRegularSeasonRow(player, sourceSeason);
    if (!stat) continue;
    const roster = rosterPlayersByTeam.get(stat.tid) ?? new Set<string>();
    roster.add(identityKey);
    rosterPlayersByTeam.set(stat.tid, roster);
  }
  const playableTeamTids = new Set(
    [...rosterPlayersByTeam.entries()]
      .filter(([, roster]) => roster.size >= 8)
      .map(([tid]) => tid),
  );
  return source.teams
    .filter(team => playableTeamTids.has(team.tid))
    .map(team => mapTeam(team, sourceSeason))
    .filter((team): team is NonNBATeam => team !== null)
    .sort((left, right) => left.tid - right.tid);
}

export function buildHistoricalEndesaRosterFromSource(source: EndesaMasterSource, startYear: number): HistoricalEndesaRosterResult {
  const sourceSeason = endesaStartYearToSourceSeason(startYear);
  const sourceCoverageThrough = getSourceCoverageThrough(source);
  const teams = buildHistoricalEndesaSeasonTeamsFromSource(source, sourceSeason);
  const activeTeamIds = new Set(teams.map(team => team.tid));
  const activeRosterIdentityKeys = selectHistoricalEndesaActiveRosterIdentityKeys(source, sourceSeason);
  const players = source.players
    .map(sourcePlayer => {
      const player = mapHistoricalEndesaPlayer(sourcePlayer, sourceSeason);
      const debutAge = getHistoricalEndesaDebutAge(sourcePlayer);
      if (!player) return player;
      const identityKey = player.historicalEndesaSource?.identityKey;
      const archiveBoundarySeason = endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.firstStartYear);
      const adultDebut = sourceSeason > archiveBoundarySeason
        && player.historicalEndesaSource?.debutSeason === sourceSeason
        && debutAge != null
        && debutAge >= 23;
      if (!adultDebut && identityKey && activeRosterIdentityKeys.has(identityKey)) return player;
      return { ...player, tid: -1, status: 'Free Agent' as const };
    })
    .filter((player): player is NBAPlayer => player !== null && (player.tid === -1 || activeTeamIds.has(player.tid)));
  const activeIdentities = new Set(players.map(player => player.historicalEndesaSource?.identityKey).filter((key): key is string => !!key));
  const retiredPlayers = source.players
    .map(sourcePlayer => mapHistoricalEndesaRetiredPlayer(sourcePlayer, sourceSeason, sourceCoverageThrough))
    .filter((player): player is NBAPlayer => !!player && !activeIdentities.has(player.historicalEndesaSource?.identityKey ?? ''));
  return {
    players: [...players, ...retiredPlayers],
    teams,
    historicalAwards: buildHistoricalAwards(source, sourceSeason - 1),
    sourceSeason,
    sourceVersion: ENDESA_HISTORICAL_CATALOG.sourceVersion,
  };
}

export async function buildHistoricalEndesaRoster(startYear: number): Promise<HistoricalEndesaRosterResult> {
  const source = await loadHistoricalEndesaSource();
  return buildHistoricalEndesaRosterFromSource(source, startYear);
}
