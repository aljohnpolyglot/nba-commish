import { EXTERNAL_CURRENCY, isExternalLeagueStatus } from '../../constants';
import type {
  BackgroundLeagueSeason,
  BackgroundRosterEntry,
  BackgroundUniverseState,
  NBAPlayer,
  NBATeam,
  NonNBATeam,
} from '../../types';
import { unpackBackgroundIdentities } from './backgroundIdentityRows';
import { deriveBackgroundSeasonRoster } from './backgroundRosterContinuity';
import { getBackgroundSeasonTeams } from './backgroundTeamRows';
import { unpackBackgroundTransactions } from './backgroundTransactionRows';
import { resolveCanonicalPersonId, withCanonicalPersonIdentity } from '../../utils/playerIdentity';

type UniverseTeam = NBATeam | NonNBATeam;

export interface BackgroundNativeTransitionResult {
  players: NBAPlayer[];
  universe?: BackgroundUniverseState;
  promotedTeamCount: number;
  createdPlayerCount: number;
  releasedPlayerCount: number;
}

function teamId(team: UniverseTeam): number {
  return 'tid' in team ? team.tid : team.id;
}

function rosterStatus(team: UniverseTeam): NBAPlayer['status'] {
  if (teamId(team) < 100) return 'Active';
  const league = String('league' in team ? team.league ?? '' : '');
  return isExternalLeagueStatus(league) ? league as NBAPlayer['status'] : 'Active';
}

function latestSeasonForTeam(
  universe: BackgroundUniverseState,
  tid: number,
  currentSeason: number,
): BackgroundLeagueSeason | undefined {
  return universe.seasons
    .filter(season => season.season < currentSeason && getBackgroundSeasonTeams(season).some(team => team.tid === tid))
    .sort((left, right) => right.season - left.season || left.leagueId.localeCompare(right.leagueId))[0];
}

function upsertRating(player: NBAPlayer, entry: BackgroundRosterEntry, currentSeason: number): NBAPlayer['ratings'] {
  const ratings = [...(player.ratings ?? [])];
  const existingIndex = ratings.findIndex(rating => Number(rating?.season) === currentSeason);
  const base = existingIndex >= 0
    ? ratings[existingIndex]
    : [...ratings].sort((left, right) => Number(right?.season ?? 0) - Number(left?.season ?? 0))[0] ?? {};
  const next = { ...base, season: currentSeason, ovr: entry.rating, pot: entry.potential };
  if (existingIndex >= 0) ratings[existingIndex] = next;
  else ratings.push(next);
  return ratings.sort((left, right) => Number(left?.season ?? 0) - Number(right?.season ?? 0));
}

function nativeContract(entry: BackgroundRosterEntry): NBAPlayer['contract'] {
  const rate = Object.values(EXTERNAL_CURRENCY)
    .find(currency => currency.code === entry.contractCurrency)?.rate ?? 1;
  return {
    amount: Math.max(1, Math.round(entry.contractAmount / rate / 1_000)),
    exp: entry.contractExpires,
  };
}

export function reconcileBackgroundNativeTeams(params: {
  players: NBAPlayer[];
  universe?: BackgroundUniverseState;
  promotedTids: number[];
  teams: UniverseTeam[];
  currentSeason: number;
}): BackgroundNativeTransitionResult {
  const { players, universe, currentSeason } = params;
  if (!universe || params.promotedTids.length === 0) {
    return { players, universe, promotedTeamCount: 0, createdPlayerCount: 0, releasedPlayerCount: 0 };
  }

  const teamByTid = new Map(params.teams.map(team => [teamId(team), team]));
  const hydratedKeys = new Set(
    universe.version === 2
      ? (universe.nativeHydrations ?? []).map(row => `${row[0]}:${row[1]}:${row[2]}`)
      : [],
  );
  const targets = params.promotedTids
    .map(tid => {
      const team = teamByTid.get(tid);
      const season = latestSeasonForTeam(universe, tid, currentSeason);
      if (!team || !season || season.season !== currentSeason - 1) return null;
      if (hydratedKeys.has(`${tid}:${season.season}:${currentSeason}`)) return null;
      return {
        tid,
        team,
        season,
        roster: deriveBackgroundSeasonRoster(season).filter(entry => entry.tid === tid),
      };
    })
    .filter((target): target is NonNullable<typeof target> => target != null && target.roster.length > 0)
    .sort((left, right) => left.tid - right.tid);
  if (targets.length === 0) {
    return { players, universe, promotedTeamCount: 0, createdPlayerCount: 0, releasedPlayerCount: 0 };
  }

  const identityById = new Map(
    universe.version === 2
      ? unpackBackgroundIdentities(universe.identities).map(identity => [identity.playerId, identity])
      : [],
  );
  const draftByPlayer = new Map<string, { year: number; tid: number; pick?: number }>();
  for (const season of [...universe.seasons].sort((left, right) => left.season - right.season)) {
    for (const transaction of unpackBackgroundTransactions(season.transactions)) {
      if (transaction.type !== 'draft' || transaction.tid == null || draftByPlayer.has(transaction.playerId)) continue;
      draftByPlayer.set(transaction.playerId, {
        year: season.season,
        tid: transaction.tid,
        pick: transaction.pick,
      });
    }
  }

  const targetByTid = new Map(targets.map(target => [target.tid, target]));
  const rosterByPlayer = new Map<string, { entry: BackgroundRosterEntry; team: UniverseTeam }>();
  for (const target of targets) {
    for (const entry of target.roster) rosterByPlayer.set(entry.playerId, { entry, team: target.team });
  }

  let releasedPlayerCount = 0;
  const existingIds = new Set(players.map(player => player.internalId));
  const existingPersonIds = new Set(players.map(player => resolveCanonicalPersonId(player)));
  const nextPlayers = players.map(player => {
    const rosterTarget = rosterByPlayer.get(player.internalId);
    if (rosterTarget) {
      const { entry, team } = rosterTarget;
      return withCanonicalPersonIdentity({
        ...player,
        tid: entry.tid,
        overallRating: entry.rating,
        potential: entry.potential,
        ratings: upsertRating(player, entry, currentSeason),
        contract: nativeContract(entry),
        status: rosterStatus(team),
      });
    }
    const priorTarget = targetByTid.get(player.tid);
    if (!priorTarget) return player;
    releasedPlayerCount += 1;
    return withCanonicalPersonIdentity({ ...player, tid: -1, status: 'Free Agent' as const });
  });

  let createdPlayerCount = 0;
  for (const target of targets) {
    for (const entry of target.roster) {
      if (existingIds.has(entry.playerId)) continue;
      const identity = identityById.get(entry.playerId);
      const personId = identity?.personId ?? `person:runtime:${entry.playerId.toLowerCase()}`;
      if (existingPersonIds.has(personId)) continue;
      const draft = draftByPlayer.get(entry.playerId);
      nextPlayers.push(withCanonicalPersonIdentity({
        internalId: entry.playerId,
        personId,
        tid: entry.tid,
        name: identity?.name ?? entry.playerId,
        overallRating: entry.rating,
        potential: entry.potential,
        ratings: [{ season: currentSeason, ovr: entry.rating, pot: entry.potential }],
        stats: [],
        pos: identity?.pos ?? 'G',
        age: identity?.bornYear == null ? undefined : Math.max(16, currentSeason - identity.bornYear),
        born: identity?.bornYear == null
          ? undefined
          : { year: identity.bornYear, loc: identity.nationality ?? 'International' },
        nationality: identity?.nationality,
        draft,
        transactions: draft ? [{ season: draft.year, tid: draft.tid, type: 'draft', pickNum: draft.pick }] : undefined,
        contract: nativeContract(entry),
        injury: { type: 'Healthy', gamesRemaining: 0 },
        status: rosterStatus(target.team),
      } as NBAPlayer));
      existingIds.add(entry.playerId);
      existingPersonIds.add(personId);
      createdPlayerCount += 1;
    }
  }

  return {
    players: nextPlayers,
    universe: universe.version === 2
      ? {
          ...universe,
          nativeHydrations: [
            ...(universe.nativeHydrations ?? []),
            ...targets.map(target => [target.tid, target.season.season, currentSeason] as [number, number, number]),
          ].sort((left, right) => left[2] - right[2] || left[0] - right[0] || left[1] - right[1]),
        }
      : universe,
    promotedTeamCount: targets.length,
    createdPlayerCount,
    releasedPlayerCount,
  };
}
