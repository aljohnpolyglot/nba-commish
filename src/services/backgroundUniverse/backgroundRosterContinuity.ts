import type {
  BackgroundContractCurrency,
  BackgroundLeagueSeason,
  BackgroundPlayerIdentity,
  BackgroundRosterEntry,
  BackgroundTransaction,
  NBAPlayer,
} from '../../types';
import { getBackgroundSeasonPlayers } from './backgroundPlayerRows';
import { unpackBackgroundTransactions } from './backgroundTransactionRows';
import { getBackgroundSeasonTeams } from './backgroundTeamRows';
import { resolveCanonicalPersonId } from '../../utils/playerIdentity';

const TARGET_ROSTER_SIZE = 8;

export function backgroundHashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number, precision = 1): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

function currencyForLeague(leagueId: string): BackgroundContractCurrency {
  const key = leagueId.toLowerCase();
  if (key.includes('pba')) return 'PHP';
  if (key.includes('japan') || key.includes('b-league')) return 'JPY';
  if (key.includes('china') || key.includes('cba')) return 'CNY';
  if (key.includes('australia') || key === 'nbl') return 'AUD';
  if (key === 'nba' || key === 'wnba' || key.includes('g-league')) return 'USD';
  return 'EUR';
}

function contractAmount(leagueId: string, rating: number): number {
  const currency = currencyForLeague(leagueId);
  const ceilings: Record<BackgroundContractCurrency, number> = {
    USD: leagueId.toLowerCase() === 'wnba' ? 250_000 : 48_000_000,
    EUR: 5_000_000,
    PHP: 25_000_000,
    JPY: 120_000_000,
    CNY: 12_000_000,
    AUD: 1_200_000,
  };
  const floors: Record<BackgroundContractCurrency, number> = {
    USD: leagueId.toLowerCase() === 'wnba' ? 70_000 : 500_000,
    EUR: 80_000,
    PHP: 600_000,
    JPY: 4_000_000,
    CNY: 250_000,
    AUD: 70_000,
  };
  const share = clamp((rating - 38) / 52, 0, 1) ** 1.7;
  const raw = floors[currency] + (ceilings[currency] - floors[currency]) * share;
  const increment = currency === 'JPY' || currency === 'PHP' ? 10_000 : 1_000;
  return Math.round(raw / increment) * increment;
}

function playerIdentity(player: NBAPlayer): BackgroundPlayerIdentity {
  return {
    playerId: player.internalId,
    personId: resolveCanonicalPersonId(player),
    name: player.name,
    bornYear: Number.isFinite(Number(player.born?.year)) ? Number(player.born?.year) : undefined,
    nationality: player.nationality ?? player.born?.loc,
    pos: String(player.pos ?? 'G'),
    generated: false,
  };
}

function entryFromNative(player: NBAPlayer, leagueId: string, season: number): BackgroundRosterEntry {
  const rating = round(clamp(Number(player.overallRating ?? 50), 25, 95));
  const potential = round(clamp(Number(player.potential ?? rating), rating, 99));
  const contractExp = Number(player.contract?.exp);
  const contractExpires = Number.isFinite(contractExp) && contractExp >= season
    ? contractExp
    : season + 1 + Math.floor(backgroundHashUnit(`${leagueId}:${season}:${player.internalId}:term`) * 3);
  return {
    playerId: player.internalId,
    tid: player.tid,
    rating,
    potential,
    rookieSeason: Number.isFinite(Number(player.draft?.year)) ? Number(player.draft?.year) : season,
    contractAmount: contractAmount(leagueId, rating),
    contractCurrency: currencyForLeague(leagueId),
    contractExpires,
  };
}

function ageOf(identity: BackgroundPlayerIdentity | undefined, season: number): number {
  return identity?.bornYear == null ? 27 : clamp(season - identity.bornYear, 16, 60);
}

function progressEntry(
  entry: BackgroundRosterEntry,
  identity: BackgroundPlayerIdentity | undefined,
  leagueId: string,
  season: number,
): BackgroundRosterEntry {
  const age = ageOf(identity, season);
  const ageCurve = age <= 23 ? 0.8 : age <= 27 ? 0.35 : age <= 30 ? 0 : age <= 34 ? -0.55 : -1.15;
  const variance = (backgroundHashUnit(`${leagueId}:${season}:${entry.playerId}:development`) - 0.5) * 1.2;
  const rating = round(clamp(entry.rating + ageCurve + variance, 25, 95));
  const potential = round(clamp(Math.max(rating, entry.potential + Math.min(0, ageCurve * 0.7)), rating, 99));
  return {
    ...entry,
    rating,
    potential,
    contractAmount: contractAmount(leagueId, rating),
    contractCurrency: currencyForLeague(leagueId),
  };
}

function shouldRetire(
  entry: BackgroundRosterEntry,
  identity: BackgroundPlayerIdentity | undefined,
  leagueId: string,
  season: number,
): boolean {
  const age = ageOf(identity, season);
  if (age >= 43) return true;
  if (age < 34) return false;
  const ageRisk = Math.max(0, age - 34) * 0.075;
  const ratingRisk = Math.max(0, 58 - entry.rating) * 0.018;
  return backgroundHashUnit(`${leagueId}:${season}:${entry.playerId}:retirement`) < clamp(ageRisk + ratingRisk, 0, 0.95);
}

function buildNameBanks(players: NBAPlayer[], identities: Iterable<BackgroundPlayerIdentity>) {
  const names = [...players.map(player => player.name), ...[...identities].map(identity => identity.name)]
    .map(name => name.trim().split(/\s+/))
    .filter(parts => parts.length >= 2);
  const first = [...new Set(names.map(parts => parts[0]).filter(Boolean))];
  const last = [...new Set(names.map(parts => parts[parts.length - 1]).filter(Boolean))];
  return {
    first: first.length ? first : ['Alex', 'Jordan', 'Kai', 'Mateo', 'Sam'],
    last: last.length ? last : ['Santos', 'Martin', 'Garcia', 'Lee', 'Silva'],
  };
}

function generatedIdentity(
  leagueId: string,
  season: number,
  pick: number,
  banks: ReturnType<typeof buildNameBanks>,
  nationalities: string[],
  usedNames: Set<string>,
): BackgroundPlayerIdentity {
  const playerId = `background:${leagueId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${season}:${pick}`;
  const first = banks.first[Math.floor(backgroundHashUnit(`${playerId}:first`) * banks.first.length)];
  const last = banks.last[Math.floor(backgroundHashUnit(`${playerId}:last`) * banks.last.length)];
  let name = `${first} ${last}`;
  if (usedNames.has(name.toLowerCase())) name = `${name} ${pick}`;
  usedNames.add(name.toLowerCase());
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  return {
    playerId,
    personId: `person:runtime:${playerId}`,
    name,
    bornYear: season - 19 - Math.floor(backgroundHashUnit(`${playerId}:age`) * 4),
    nationality: nationalities[Math.floor(backgroundHashUnit(`${playerId}:country`) * nationalities.length)],
    pos: positions[(pick - 1) % positions.length],
    generated: true,
  };
}

function previousRoster(previous: BackgroundLeagueSeason, leagueId: string): BackgroundRosterEntry[] {
  if (previous.roster?.length) return previous.roster.map(entry => ({ ...entry }));
  return getBackgroundSeasonPlayers(previous).map(row => ({
    playerId: row.playerId,
    tid: row.tid,
    rating: row.rating,
    potential: row.rating,
    rookieSeason: previous.season,
    contractAmount: contractAmount(leagueId, row.rating),
    contractCurrency: currencyForLeague(leagueId),
    contractExpires: previous.season + Math.floor(backgroundHashUnit(`${row.playerId}:${previous.season}:contract-cycle`) * 4),
  }));
}

export function deriveBackgroundSeasonRoster(
  season: BackgroundLeagueSeason,
  leagueId = season.leagueId,
): BackgroundRosterEntry[] {
  if (season.roster?.length) return season.roster.map(entry => ({ ...entry }));
  const drafted = new Set(
    unpackBackgroundTransactions(season.transactions)
      .filter(transaction => transaction.type === 'draft')
      .map(transaction => transaction.playerId),
  );
  return getBackgroundSeasonPlayers(season).map(row => ({
    playerId: row.playerId,
    tid: row.tid,
    rating: row.rating,
    potential: round(clamp(row.rating + backgroundHashUnit(`${row.playerId}:potential`) * 12, row.rating, 99)),
    rookieSeason: drafted.has(row.playerId) ? season.season : season.season - 1,
    contractAmount: contractAmount(leagueId, row.rating),
    contractCurrency: currencyForLeague(leagueId),
    contractExpires: season.season + 1 + Math.floor(backgroundHashUnit(`${row.playerId}:${season.season}:display-term`) * 4),
  }));
}

export function deriveBackgroundSeasonTransactions(
  season: BackgroundLeagueSeason,
  previous?: BackgroundLeagueSeason,
): BackgroundTransaction[] {
  const result = unpackBackgroundTransactions(season.transactions);
  if (!previous) return result;
  const previousByPlayer = new Map(getBackgroundSeasonPlayers(previous).map(row => [row.playerId, row]));
  const explicitSignings = new Set(
    result
      .filter(transaction => transaction.type === 'signing')
      .map(transaction => `${transaction.playerId}:${transaction.fromTid}:${transaction.toTid}`),
  );
  for (const row of getBackgroundSeasonPlayers(season)) {
    const prior = previousByPlayer.get(row.playerId);
    if (!prior || prior.tid === row.tid) continue;
    const key = `${row.playerId}:${prior.tid}:${row.tid}`;
    if (explicitSignings.has(key)) continue;
    result.push({ type: 'signing', playerId: row.playerId, fromTid: prior.tid, toTid: row.tid });
  }
  return result.sort((left, right) => left.type.localeCompare(right.type) || left.playerId.localeCompare(right.playerId));
}

export interface BackgroundRosterContinuityResult {
  roster: BackgroundRosterEntry[];
  identities: BackgroundPlayerIdentity[];
  transactions: BackgroundTransaction[];
}

function persistedIdentities(identities: Iterable<BackgroundPlayerIdentity>): BackgroundPlayerIdentity[] {
  return [...identities]
    .filter(identity => identity.generated)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
}

export function buildBackgroundRosterContinuity(params: {
  leagueId: string;
  season: number;
  teamTids: number[];
  nativePlayers: NBAPlayer[];
  previous?: BackgroundLeagueSeason;
  knownIdentities: BackgroundPlayerIdentity[];
}): BackgroundRosterContinuityResult {
  const { leagueId, season, teamTids, nativePlayers, previous } = params;
  const identityById = new Map(params.knownIdentities.map(identity => [identity.playerId, identity]));
  for (const player of nativePlayers) identityById.set(player.internalId, playerIdentity(player));
  if (!previous) {
    const roster = teamTids.flatMap(tid => nativePlayers
      .filter(player => player.tid === tid)
      .sort((left, right) => Number(right.overallRating) - Number(left.overallRating) || left.internalId.localeCompare(right.internalId))
      .slice(0, TARGET_ROSTER_SIZE)
      .map(player => entryFromNative(player, leagueId, season)));
    return {
      roster: roster.sort((left, right) => left.tid - right.tid || left.playerId.localeCompare(right.playerId)),
      identities: persistedIdentities(identityById.values()),
      transactions: [],
    };
  }

  const transactions: BackgroundTransaction[] = [];
  const priorRoster = previousRoster(previous, leagueId);
  const progressed = priorRoster
    .map(entry => progressEntry(entry, identityById.get(entry.playerId), leagueId, season));
  const available: BackgroundRosterEntry[] = [];
  const byTeam = new Map(teamTids.map(tid => [tid, [] as BackgroundRosterEntry[]]));
  for (const entry of progressed) {
    if (shouldRetire(entry, identityById.get(entry.playerId), leagueId, season)) {
      transactions.push({ type: 'retirement', playerId: entry.playerId, tid: entry.tid });
    } else if (entry.contractExpires < season) {
      available.push(entry);
    } else if (byTeam.has(entry.tid)) {
      byTeam.get(entry.tid)?.push(entry);
    }
  }

  const priorTeamTids = new Set(priorRoster.map(entry => entry.tid));
  const progressedIds = new Set(progressed.map(entry => entry.playerId));
  for (const tid of teamTids.filter(teamTid => !priorTeamTids.has(teamTid))) {
    const nativeRoster = nativePlayers
      .filter(player => player.tid === tid && !progressedIds.has(player.internalId))
      .sort((left, right) => Number(right.overallRating) - Number(left.overallRating) || left.internalId.localeCompare(right.internalId))
      .slice(0, TARGET_ROSTER_SIZE)
      .map(player => entryFromNative(player, leagueId, season));
    byTeam.set(tid, nativeRoster);
  }

  available.sort((left, right) => right.rating - left.rating || left.playerId.localeCompare(right.playerId));
  for (const entry of available) {
    const destination = [...byTeam.entries()]
      .filter(([, roster]) => roster.length < TARGET_ROSTER_SIZE)
      .sort((left, right) => left[1].length - right[1].length
        || left[1].reduce((sum, player) => sum + player.rating, 0) - right[1].reduce((sum, player) => sum + player.rating, 0)
        || left[0] - right[0])[0]?.[0];
    if (destination == null) continue;
    const fromTid = entry.tid;
    const term = 1 + Math.floor(backgroundHashUnit(`${leagueId}:${season}:${entry.playerId}:new-term`) * 4);
    const signed = { ...entry, tid: destination, contractExpires: season + term };
    byTeam.get(destination)?.push(signed);
    if (fromTid !== destination) transactions.push({ type: 'signing', playerId: entry.playerId, fromTid, toTid: destination });
  }

  const leagueIdentityIds = new Set([
    ...nativePlayers.map(player => player.internalId),
    ...progressed.map(entry => entry.playerId),
  ]);
  const leagueIdentities = [...identityById.values()].filter(identity => leagueIdentityIds.has(identity.playerId));
  const banks = buildNameBanks(nativePlayers, leagueIdentities);
  const nationalities = [...new Set(leagueIdentities.map(identity => identity.nationality).filter((value): value is string => !!value))];
  if (!nationalities.length) nationalities.push('International');
  const usedNames = new Set([...identityById.values()].map(identity => identity.name.toLowerCase()));
  const previousTeams = getBackgroundSeasonTeams(previous);
  const draftOrder = [...teamTids].sort((left, right) => {
    const leftSeed = previousTeams.find(team => team.tid === left)?.seed ?? 0;
    const rightSeed = previousTeams.find(team => team.tid === right)?.seed ?? 0;
    return rightSeed - leftSeed || left - right;
  });
  const picksNeeded = Math.max(teamTids.length, [...byTeam.values()].reduce((sum, roster) => sum + Math.max(0, TARGET_ROSTER_SIZE - roster.length), 0));
  for (let pick = 1; pick <= picksNeeded; pick += 1) {
    const tid = draftOrder[(pick - 1) % draftOrder.length];
    const roster = byTeam.get(tid) ?? [];
    if (roster.length >= TARGET_ROSTER_SIZE) {
      roster.sort((left, right) => right.rating - left.rating || left.playerId.localeCompare(right.playerId));
      roster.pop();
    }
    const identity = generatedIdentity(leagueId, season, pick, banks, nationalities, usedNames);
    identityById.set(identity.playerId, identity);
    const rating = round(42 + backgroundHashUnit(`${identity.playerId}:rating`) * 20);
    const potential = round(clamp(rating + 4 + backgroundHashUnit(`${identity.playerId}:potential`) * 15, rating, 92));
    roster.push({
      playerId: identity.playerId,
      tid,
      rating,
      potential,
      rookieSeason: season,
      contractAmount: contractAmount(leagueId, rating),
      contractCurrency: currencyForLeague(leagueId),
      contractExpires: season + 2 + Math.floor(backgroundHashUnit(`${identity.playerId}:term`) * 3),
    });
    byTeam.set(tid, roster);
    transactions.push({ type: 'draft', playerId: identity.playerId, tid, pick });
  }

  const roster = [...byTeam.values()].flatMap(entries => entries)
    .sort((left, right) => left.tid - right.tid || left.playerId.localeCompare(right.playerId));
  return {
    roster,
    identities: persistedIdentities(identityById.values()),
    transactions: transactions.sort((left, right) => left.type.localeCompare(right.type) || left.playerId.localeCompare(right.playerId)),
  };
}
