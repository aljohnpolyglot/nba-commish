import type { GameState, NBAPlayer, NonNBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { computeExternalSalaryUSD } from '../externalFreeAgency';
import { EURO_PLAYER_WAGE_SCALE } from '../euro/payrollScale';
import { migrateTeamTycoon } from '../tycoon/migrate';
import { ENDESA_HISTORICAL_CATALOG, getEndesaHistoricalEconomyFactor } from './catalog';
import { historicalEndesaIdentityKey } from './identity';
import {
  buildHistoricalEndesaSeasonTeamsFromSource,
  compareHistoricalEndesaMappedPlayersForSeason,
  getHistoricalEndesaDebutAge,
  mapHistoricalEndesaPlayer,
} from './seasonBuilder';
import type { EndesaMasterSource } from './types';
import { rebuildEuroLeagueAssemblyMeetingWithDomesticTransition } from '../euro/leagueAssembly';

const withDebutContract = (player: NBAPlayer, season: number, salaryCap: number): NBAPlayer => {
  const salaryUSD = Math.round(
    computeExternalSalaryUSD('Endesa', player.overallRating ?? 45, salaryCap) * EURO_PLAYER_WAGE_SCALE,
  );
  return {
    ...player,
    contract: { amount: Math.round(salaryUSD / 1_000), exp: season + 2 },
  };
};

const seedPromotedClubEconomy = (team: NonNBATeam, season: number): NonNBATeam => {
  const next = { ...team } as NonNBATeam & { tycoon?: any };
  const scale = getEndesaHistoricalEconomyFactor(season);
  migrateTeamTycoon(next as any, season, scale);
  const tycoon = next.tycoon;
  if (!tycoon) return next;
  return next;
};

const mergeDeterministicRating = (player: NBAPlayer, sourcePlayer: NBAPlayer, season: number): NBAPlayer => {
  const sourceRating = sourcePlayer.ratings?.find(rating => rating.season === season)
    ?? sourcePlayer.ratings?.[sourcePlayer.ratings.length - 1];
  if (!sourceRating) return player;
  const ratings = [...(player.ratings ?? []).filter(rating => rating.season !== sourceRating.season), sourceRating]
    .sort((left, right) => left.season - right.season);
  return {
    ...player,
    ratings,
    overallRating: sourcePlayer.overallRating,
    potential: sourcePlayer.potential,
    historicalEndesaSource: player.historicalEndesaSource
      ? { ...player.historicalEndesaSource, sourceSeason: season }
      : sourcePlayer.historicalEndesaSource,
  };
};

export function advanceHistoricalEndesaSeason(state: GameState, source: EndesaMasterSource): GameState {
  const historical = state.historicalEndesa;
  const season = state.leagueStats.year;
  if (!historical || (historical.materializedSeasons ?? []).includes(season)) return state;
  const previousEndesaTids = state.euroCompetitionTeamTids?.endesa
    ?? state.nonNBATeams.filter(team => team.league === 'Endesa' && team.endesaRelegated !== true).map(team => team.tid);

  const sourceByIdentity = new Map(source.players.map(player => [
    historicalEndesaIdentityKey(player.name, player.born?.year),
    player,
  ]));
  const claimed = new Set(historical.claimedIdentityKeys ?? []);
  const reserved = new Set(historical.reservedIdentityKeys ?? []);
  const returned = new Set(historical.returnedIdentityKeys ?? []);
  const draftDepartureByIdentity = new Map((historical.draftDepartures ?? []).map(player => [
    player.historicalEndesaSource?.identityKey ?? player.internalId,
    player,
  ]));
  const rosterLimit = getStandardRosterLimit(state.leagueStats);
  const existing = new Set([
    ...state.players.map(player => player.historicalEndesaSource?.identityKey).filter((key): key is string => !!key),
    ...(state.euroScouting?.academyPlayers ?? []).map(player => player.historicalEndesaSource?.identityKey).filter((key): key is string => !!key),
  ]);
  let players = state.players.map(player => {
    const identityKey = player.historicalEndesaSource?.identityKey;
    const raw = identityKey ? sourceByIdentity.get(identityKey) : undefined;
    const draftYear = Number(player.historicalEndesaSource?.draftYear ?? 0);
    if (!raw || draftYear <= 0 || season > draftYear) return player;
    const sourcePlayer = mapHistoricalEndesaPlayer(raw, season);
    return sourcePlayer ? mergeDeterministicRating(player, sourcePlayer, season) : player;
  });

  let nonNBATeams = state.nonNBATeams;
  let membershipChanged = false;
  const clubMovements = [...(historical.clubMovements ?? [])];
  const movementHistory: NonNullable<GameState['history']> = [];
  const finalHistoricalSourceSeason = ENDESA_HISTORICAL_CATALOG.latestStartYear + 1;
  const hasDormantEndesaClub = nonNBATeams.some(team => team.league === 'Endesa' && team.endesaRelegated === true);
  if (season <= finalHistoricalSourceSeason || hasDormantEndesaClub) {
    const movementSourceSeason = Math.min(season, finalHistoricalSourceSeason);
    const allEndesa = nonNBATeams.filter(team => team.league === 'Endesa');
    const currentEndesa = allEndesa.filter(team => team.endesaRelegated !== true);
    const dormantEndesa = allEndesa.filter(team => team.endesaRelegated === true);
    const currentTeamIds = new Set(currentEndesa.map(team => team.tid));
    const sourceTeams = buildHistoricalEndesaSeasonTeamsFromSource(source, movementSourceSeason);
    const sourceTeamById = new Map(sourceTeams.map(team => [team.tid, team]));
    const dormantTeamById = new Map(dormantEndesa.map(team => [team.tid, team]));
    const candidateTeams = new Map<number, NonNBATeam>();
    for (const team of sourceTeams) {
      if (!currentTeamIds.has(team.tid)) candidateTeams.set(team.tid, dormantTeamById.get(team.tid) ?? team);
    }
    for (const team of dormantEndesa) candidateTeams.set(team.tid, team);
    const mappedSourcePlayers = source.players
      .filter(raw => (getHistoricalEndesaDebutAge(raw) ?? 0) < 23)
      .map(raw => mapHistoricalEndesaPlayer(raw, movementSourceSeason))
      .filter((player): player is NBAPlayer => !!player);
    const candidateBundles = [...candidateTeams.values()]
      .map(team => {
        const sourceTeam = sourceTeamById.get(team.tid);
        const retainedRoster = players.filter(player => player.tid === team.tid && player.status !== 'Retired').length;
        const entrants = sourceTeam ? mappedSourcePlayers.filter(player => (
          player.tid === team.tid
          && !!player.historicalEndesaSource
          && !existing.has(player.historicalEndesaSource.identityKey)
          && !claimed.has(player.historicalEndesaSource.identityKey)
          && !reserved.has(player.historicalEndesaSource.identityKey)
        ))
          .sort((left, right) => compareHistoricalEndesaMappedPlayersForSeason(left, right, movementSourceSeason))
          .slice(0, Math.max(0, rosterLimit - retainedRoster)) : [];
        return { team, entrants, retainedRoster, existingClub: dormantTeamById.has(team.tid) };
      })
      .filter(bundle => bundle.retainedRoster + bundle.entrants.length >= 8)
      .sort((left, right) => (
        Number(right.team.tid === state.userTeamId && right.existingClub) - Number(left.team.tid === state.userTeamId && left.existingClub)
        || Number(left.team.endesaRelegatedSeason ?? Number.MAX_SAFE_INTEGER) - Number(right.team.endesaRelegatedSeason ?? Number.MAX_SAFE_INTEGER)
        || (right.retainedRoster + right.entrants.length) - (left.retainedRoster + left.entrants.length)
        || left.team.tid - right.team.tid
      ))
      .slice(0, 2);
    const relegationCandidates = [...currentEndesa]
      .sort((left: any, right: any) => (
        Number(right.lastEndesaFinish ?? 0) - Number(left.lastEndesaFinish ?? 0)
        || Number(right.losses ?? 0) - Number(left.losses ?? 0)
        || right.tid - left.tid
      ));
    const movementCount = Math.min(candidateBundles.length, relegationCandidates.length);
    const promotions = candidateBundles.slice(0, movementCount);
    const relegations = relegationCandidates.slice(0, movementCount);
    if (movementCount > 0) {
      membershipChanged = true;
      const relegatedIds = new Set(relegations.map(team => team.tid));
      const promotedTeams = promotions.map(bundle => bundle.existingClub
        ? { ...bundle.team, endesaRelegated: false, endesaRelegatedSeason: undefined }
        : seedPromotedClubEconomy(bundle.team, season));
      const promotedById = new Map(promotedTeams.map(team => [team.tid, team]));
      nonNBATeams = nonNBATeams.map(team => {
        const promoted = promotedById.get(team.tid);
        if (promoted) return promoted;
        if (!relegatedIds.has(team.tid)) return team;
        return { ...team, endesaRelegated: true, endesaRelegatedSeason: season };
      });
      const knownIds = new Set(nonNBATeams.map(team => team.tid));
      nonNBATeams = [...nonNBATeams, ...promotedTeams.filter(team => !knownIds.has(team.tid))];
      for (let index = 0; index < movementCount; index += 1) {
        const promoted = promotions[index];
        const relegated = relegations[index];
        for (const entrant of promoted.entrants) {
          const identityKey = entrant.historicalEndesaSource!.identityKey;
          players.push(withDebutContract(entrant, season, state.leagueStats.salaryCap));
          existing.add(identityKey);
        }
        clubMovements.push({
          season,
          promotedTeamId: promoted.team.tid,
          relegatedTeamId: relegated.tid,
        });
        movementHistory.push({
          text: `${getTeamFullName(promoted.team)} joined Liga Endesa as ${getTeamFullName(relegated)} left the top division.`,
          date: state.date,
          type: 'League Event',
          league: 'euro',
          eventType: 'club-promotion',
          teamIds: [promoted.team.tid, relegated.tid],
          ...(state.euroPrimaryCompetitionId ? { sourceIds: { competitionId: state.euroPrimaryCompetitionId } } : {}),
        });
      }
    }
  }
  const teamIds = new Set([
    ...state.teams.filter(team => (team as any).league === 'Endesa').map(team => team.id),
    ...nonNBATeams.filter(team => team.league === 'Endesa').map(team => team.tid),
  ]);
  const rosterCounts = new Map<number, number>();
  for (const player of players) {
    if (player.tid < 0 || player.status === 'Retired') continue;
    rosterCounts.set(player.tid, (rosterCounts.get(player.tid) ?? 0) + 1);
  }

  for (const raw of source.players) {
    const identityKey = historicalEndesaIdentityKey(raw.name, raw.born?.year);
    const mapped = mapHistoricalEndesaPlayer(raw, season);
    if (!mapped?.historicalEndesaSource) continue;
    const meta = mapped.historicalEndesaSource;
    if (reserved.has(identityKey) && meta.returnSeasons.includes(season) && !returned.has(identityKey) && !existing.has(identityKey)) {
      const departure = draftDepartureByIdentity.get(identityKey);
      const returningPlayer = departure ? {
        ...mapped,
        ...departure,
        age: mapped.age,
        stats: mapped.stats,
        tid: -1,
        status: 'Free Agent' as const,
        euroAcademyPlayer: undefined,
        academyTeamId: undefined,
        academyJoinedDate: undefined,
        academyJoinedDay: undefined,
        academyLastProgressDay: undefined,
        historicalEndesaSource: {
          ...departure.historicalEndesaSource!,
          ...meta,
          sourceSeason: season,
        },
      } : { ...mapped, tid: -1, status: 'Free Agent' as const };
      players.push(withDebutContract(returningPlayer, season, state.leagueStats.salaryCap));
      existing.add(identityKey);
      returned.add(identityKey);
      continue;
    }
    if (meta.debutSeason !== season || existing.has(identityKey) || claimed.has(identityKey) || reserved.has(identityKey)) continue;
    const debutAge = getHistoricalEndesaDebutAge(raw);
    if (debutAge != null && debutAge >= 23) {
      players.push(withDebutContract({ ...mapped, tid: -1, status: 'Free Agent' }, season, state.leagueStats.salaryCap));
      existing.add(identityKey);
      continue;
    }
    const sourceTid = meta.sourceTeamTid;
    const hasSourceTeam = teamIds.has(sourceTid) && (rosterCounts.get(sourceTid) ?? 0) < rosterLimit;
    players.push(withDebutContract({
      ...mapped,
      tid: hasSourceTeam ? sourceTid : -1,
      status: hasSourceTeam ? 'Endesa' : 'Free Agent',
    }, season, state.leagueStats.salaryCap));
    if (hasSourceTeam) rosterCounts.set(sourceTid, (rosterCounts.get(sourceTid) ?? 0) + 1);
    existing.add(identityKey);
  }

  const materializedIdentityKeys = new Set([
    ...players.map(player => player.historicalEndesaSource?.identityKey).filter((key): key is string => !!key),
    ...(state.euroScouting?.academyPlayers ?? []).map(player => player.historicalEndesaSource?.identityKey).filter((key): key is string => !!key),
  ]);
  const euroScouting = state.euroScouting ? {
    ...state.euroScouting,
    assignments: state.euroScouting.assignments.map(assignment => ({
      ...assignment,
      prospects: assignment.prospects.filter(prospect => {
        const identityKey = prospect.historicalEndesaSource?.identityKey;
        return !identityKey
          || assignment.assignedProspectIds.includes(prospect.internalId)
          || !materializedIdentityKeys.has(identityKey);
      }),
    })),
  } : state.euroScouting;
  const activeEndesaTids = nonNBATeams
    .filter(team => team.league === 'Endesa' && team.endesaRelegated !== true)
    .map(team => team.tid);
  const euroCompetitionTeamTids = {
    ...(state.euroCompetitionTeamTids ?? {}),
    endesa: activeEndesaTids,
  };

  return {
    ...state,
    players,
    nonNBATeams,
    euroCompetitionTeamTids,
    ...(membershipChanged
      ? { pendingGovernorsBoardMeeting: rebuildEuroLeagueAssemblyMeetingWithDomesticTransition(
          { ...state, nonNBATeams },
          euroCompetitionTeamTids,
          season,
          { competitionId: 'endesa', previousTids: previousEndesaTids, nextTids: activeEndesaTids },
        ) }
      : {}),
    euroScouting,
    history: [...(state.history ?? []), ...movementHistory],
    historicalEndesa: {
      ...historical,
      sourceSeason: season,
      materializedSeasons: [...(historical.materializedSeasons ?? []), season],
      returnedIdentityKeys: [...returned],
      clubMovements,
    },
  };
}
