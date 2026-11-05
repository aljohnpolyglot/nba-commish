import type { NBAPlayer } from '../../types';
import { buildFibaCountryPools } from './buildCountryPools';
import { loadFibaHistoricalRoster } from './fibaRosterLoader';
import { selectFibaNationalRoster } from './selectNationalRoster';
import { mergeFibaHistoricalPlayerAwards } from './mergeHistoricalPlayerAwards';
import { normalizeFibaPersonName } from './countryIdentity';
import type {
  FibaHistoricalRoster,
  FibaSelectedPlayer,
  InternationalTournamentState,
  PreparedFibaNationalTeams,
} from './types';

export interface PrepareFibaNationalTeamsOptions {
  year: number;
  minimumPlayablePlayers: number;
  branchCutoffYear: number;
  savePlayers: readonly NBAPlayer[];
  countryFilter?: (country: string) => boolean;
}

export function activateSelectedFibaFreeAgents<T extends { players: FibaSelectedPlayer[]; reserves: FibaSelectedPlayer[] }>(
  players: readonly NBAPlayer[],
  rosters: readonly T[],
  roster: FibaHistoricalRoster,
  year: number,
  historyCutoffYear: number = year - 1,
): { players: NBAPlayer[]; rosters: T[] } {
  const nextPlayers = [...players];
  const byIdentity = new Map(nextPlayers.map(player => [
    `${normalizeFibaPersonName(player.name)}|${player.born?.year ?? ''}`,
    player,
  ]));
  const playersByName = new Map<string, NBAPlayer[]>();
  for (const player of nextPlayers) {
    const key = normalizeFibaPersonName(player.name);
    playersByName.set(key, [...(playersByName.get(key) ?? []), player]);
  }
  const sourceByName = new Map<string, typeof roster.players>();
  for (const source of roster.players) {
    const key = normalizeFibaPersonName(source.name);
    const matches = sourceByName.get(key);
    if (matches) matches.push(source);
    else sourceByName.set(key, [source]);
  }
  const activatedIds = new Map<string, string>();
  const teamsByTid = new Map(roster.teams.map(team => [team.tid, team]));
  const historicalStats = (source: FibaHistoricalRoster['players'][number] | undefined) => (source?.stats ?? [])
    .filter(stat => Number(stat.season ?? Infinity) <= historyCutoffYear && Number((stat as any).gp ?? 0) > 0)
    .map(stat => {
      const sourceTid = Number(stat.tid ?? source?.tid ?? -1);
      const team = teamsByTid.get(sourceTid);
      return {
        ...stat,
        tid: sourceTid >= 0 ? 900_000 + sourceTid : -1,
        abbrev: team?.abbrev,
        teamAbbrev: team?.abbrev,
        teamName: team?.region,
        teamLogoUrl: team?.imgURL,
        competitionId: 'fiba-national-team',
        league: 'FIBA',
        _seasonLabel: `${stat.season} International`,
        _source: 'fiba-history',
      };
    });
  const mergeHistory = (player: NBAPlayer, source: FibaHistoricalRoster['players'][number] | undefined): NBAPlayer => {
    const additions = historicalStats(source);
    if (additions.length === 0) return player;
    const stats = [...(player.stats ?? [])];
    const keys = new Set(stats.map(stat => `${stat.season}|${stat.tid}|${stat.playoffs ? 1 : 0}|${String((stat as any).competitionId ?? '')}`));
    for (const stat of additions) {
      const key = `${stat.season}|${stat.tid}|${stat.playoffs ? 1 : 0}|${stat.competitionId}`;
      if (!keys.has(key)) {
        stats.push(stat as any);
        keys.add(key);
      }
    }
    return stats.length === (player.stats?.length ?? 0) ? player : { ...player, stats };
  };

  for (const selected of rosters.flatMap(team => [...team.players, ...team.reserves])) {
    if (selected.birthYear && year - selected.birthYear < 19) continue;
    const sourceMatches = sourceByName.get(normalizeFibaPersonName(selected.archivePlayerName ?? selected.name)) ?? [];
    const exactSources = sourceMatches
      .filter(source => !selected.birthYear || !source.born?.year || source.born.year === selected.birthYear);
    const source = exactSources.length === 1
      ? exactSources[0]
      : sourceMatches.length === 1 ? sourceMatches[0] : undefined;
    const identityKey = `${normalizeFibaPersonName(selected.name)}|${selected.birthYear ?? ''}`;
    const exactExisting = selected.savePlayerId
      ? nextPlayers.find(player => player.internalId === selected.savePlayerId)
      : byIdentity.get(identityKey);
    const nameMatches = (playersByName.get(normalizeFibaPersonName(selected.name)) ?? [])
      .filter(player => !selected.birthYear || !player.born?.year || Math.abs(player.born.year - selected.birthYear) <= 3);
    const existing = exactExisting ?? (nameMatches.length === 1 ? nameMatches[0] : undefined);
    if (existing) {
      const hydrated = mergeHistory(existing, source);
      if (hydrated !== existing) {
        const index = nextPlayers.findIndex(player => player.internalId === existing.internalId);
        if (index >= 0) nextPlayers[index] = hydrated;
        byIdentity.set(identityKey, hydrated);
      }
      activatedIds.set(selected.id, hydrated.internalId);
      continue;
    }
    const internalId = `fiba-fa:${normalizeFibaPersonName(selected.name)}:${selected.birthYear ?? year}`;
    const player = {
      internalId,
      tid: -1,
      name: selected.name,
      overallRating: selected.strength,
      potential: selected.strength,
      ratings: [
        ...(source?.ratings ?? []).filter(rating => Number(rating.season ?? Infinity) <= historyCutoffYear).map(rating => ({ ...rating })),
        ...(selected.rating && Number(selected.rating.season ?? year) > historyCutoffYear
          ? [{ ...selected.rating, season: year }]
          : []),
      ],
      stats: historicalStats(source) as any,
      imgURL: source?.imgURL,
      pos: selected.position,
      hgt: source?.hgt,
      weight: source?.weight,
      born: selected.birthYear ? { year: selected.birthYear, loc: source?.born?.loc ?? selected.country } : undefined,
      college: source?.college,
      jerseyNumber: selected.jerseyNumber,
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'International',
      internationalTournamentOnly: true,
      nationality: selected.country,
    } as NBAPlayer;
    nextPlayers.push(player);
    byIdentity.set(identityKey, player);
    playersByName.set(normalizeFibaPersonName(player.name), [
      ...(playersByName.get(normalizeFibaPersonName(player.name)) ?? []),
      player,
    ]);
    activatedIds.set(selected.id, internalId);
  }

  const bindPlayer = <T extends { id: string; savePlayerId?: string }>(player: T): T => {
    const savePlayerId = player.savePlayerId ?? activatedIds.get(player.id);
    return savePlayerId ? { ...player, savePlayerId } : player;
  };
  return {
    players: nextPlayers,
    rosters: rosters.map(team => ({
      ...team,
      players: team.players.map(bindPlayer),
      reserves: team.reserves.map(bindPlayer),
    })),
  };
}

export async function activateInternationalTournamentFreeAgents(
  players: readonly NBAPlayer[],
  tournament: InternationalTournamentState,
  branchCutoffYear: number,
): Promise<{ players: NBAPlayer[]; tournament: InternationalTournamentState }> {
  const year = tournament.playedYear ?? tournament.year;
  const teamsWithoutUnder19s = tournament.teams.map(team => {
    const eligiblePlayers = team.players.filter(player => !player.birthYear || year - player.birthYear >= 19);
    const eligibleReserves = team.reserves.filter(player => !player.birthYear || year - player.birthYear >= 19);
    const promotions = eligibleReserves.slice(0, Math.max(0, team.players.length - eligiblePlayers.length));
    const promotedIds = new Set(promotions.map(player => player.id));
    return {
      ...team,
      players: [...eligiblePlayers, ...promotions],
      reserves: eligibleReserves.filter(player => !promotedIds.has(player.id)),
    };
  });
  const loaded = await loadFibaHistoricalRoster();
  const activated = activateSelectedFibaFreeAgents(players, teamsWithoutUnder19s, loaded.roster, year, branchCutoffYear);
  const awardMerge = mergeFibaHistoricalPlayerAwards(activated.players, loaded.roster, branchCutoffYear);
  return {
    players: awardMerge.players,
    tournament: { ...tournament, teams: activated.rosters },
  };
}

export async function prepareFibaNationalTeams(
  options: PrepareFibaNationalTeamsOptions,
): Promise<PreparedFibaNationalTeams> {
  const loaded = await loadFibaHistoricalRoster();
  const awardMerge = mergeFibaHistoricalPlayerAwards(
    options.savePlayers,
    loaded.roster,
    options.branchCutoffYear,
  );
  const built = buildFibaCountryPools(loaded.roster, awardMerge.players, options.year);
  const eligiblePools = options.countryFilter
    ? built.pools.filter(pool => options.countryFilter?.(pool.country))
    : built.pools;
  const selected = eligiblePools.map(pool =>
    selectFibaNationalRoster(pool, options.minimumPlayablePlayers),
  );
  const activated = activateSelectedFibaFreeAgents(
    awardMerge.players,
    selected,
    loaded.roster,
    options.year,
    options.branchCutoffYear,
  );
  const finalAwards = mergeFibaHistoricalPlayerAwards(
    activated.players,
    loaded.roster,
    options.branchCutoffYear,
  );

  return {
    year: options.year,
    rosters: activated.rosters.filter(roster => roster.isPlayable),
    unplayableCountries: activated.rosters.filter(roster => !roster.isPlayable),
    savePlayersWithHistoricalAwards: finalAwards.players,
    sourceDiagnostics: loaded.diagnostics,
    poolDiagnostics: built.diagnostics,
    awardDiagnostics: awardMerge.diagnostics,
  };
}
