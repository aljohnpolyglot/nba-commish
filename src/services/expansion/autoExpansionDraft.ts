import type { GameState, NBAPlayer, NBATeam, NonNBATeam } from '../../types';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { isPbaRosterLocal } from '../pba/importManager';
import { generateFuturePicksForTeamIds } from '../draft/DraftPickGenerator';
import {
  getExpansionLeague,
  getPrimaryDraftRounds,
  isPrimaryExpansionRosterPlayer,
} from './expansionLeagueScope';
import { appendUniqueExpansionDraftHistory, buildExpansionDraftHistoryEntry } from './expansionDraftHistory';

const playerScore = (player: NBAPlayer, season: number) => {
  const yearsLeft = Math.max(0, Number(player.contract?.exp ?? season) - season);
  return Number(player.overallRating ?? 0) + Math.min(15, Math.max(0, (yearsLeft - 1) * 5)) - (yearsLeft === 0 ? 20 : 0);
};

export function autoResolveExpansionDraft(state: GameState): Partial<GameState> {
  const schedule = state.expansionSchedule;
  const expansionLeague = getExpansionLeague(schedule);
  const isPbaExpansion = expansionLeague === 'pba';
  const isWnbaExpansion = expansionLeague === 'wnba';
  const existingTeams = isPbaExpansion
    ? state.nonNBATeams.filter(team => team.league === 'PBA')
    : state.teams;
  const existingByAbbrev = new Map<string, NBATeam | NonNBATeam>(
    existingTeams.map(team => [String(team.abbrev ?? '').toUpperCase(), team] as const),
  );
  const nextTid = isPbaExpansion
    ? existingTeams.reduce((max, team) => Math.max(max, Number('tid' in team ? team.tid : team.id)), 1999) + 1
    : isWnbaExpansion
      ? Math.max(26, state.teams.reduce((max, team) => Math.max(max, team.id), -1)) + 1
      : state.teams.reduce((max, team) => Math.max(max, team.id), -1) + 1;
  const candidateSpecs = schedule?.teams
    .filter(spec => !existingByAbbrev.has(spec.abbrev.toUpperCase())) ?? [];
  const createdPbaTeams: NonNBATeam[] = isPbaExpansion
    ? candidateSpecs.map((spec, index) => ({
          tid: nextTid + index,
          cid: 0,
          did: 0,
          name: spec.name,
          abbrev: spec.abbrev,
          region: spec.region,
          pop: spec.pop,
          stadiumCapacity: spec.stadiumCapacity,
          colors: spec.colors,
          imgURL: getResolvedTeamLogoUrl({ ...spec, logoUrl: spec.imgURL }),
          league: 'PBA' as const,
          seasons: [],
        }))
    : [];
  const createdNbaTeams: NBATeam[] = !isPbaExpansion
    ? candidateSpecs.map((spec, index) => ({
          id: nextTid + index,
          tid: nextTid + index,
          name: `${spec.region} ${spec.name}`,
          abbrev: spec.abbrev,
          region: spec.region,
          conference: spec.conference,
          cid: spec.cid,
          did: spec.did,
          wins: 0,
          losses: 0,
          strength: 50,
          pop: spec.pop,
          stadiumCapacity: spec.stadiumCapacity,
          colors: spec.colors,
          logoUrl: getResolvedTeamLogoUrl({ ...spec, logoUrl: spec.imgURL }),
        }))
    : [];
  const createdByAbbrev = new Map<string, NBATeam | NonNBATeam>([
    ...createdPbaTeams.map(team => [String(team.abbrev), team] as const),
    ...createdNbaTeams.map(team => [team.abbrev, team] as const),
  ]);
  const teams = isPbaExpansion ? state.teams : [
    ...state.teams.map(team => {
      const move = schedule?.realignment?.[team.id];
      return move ? { ...team, conference: move.conference, cid: move.cid, did: move.did } : team;
    }),
    ...createdNbaTeams,
  ];
  const nonNBATeams = isPbaExpansion
    ? [...state.nonNBATeams, ...createdPbaTeams]
    : state.nonNBATeams;
  const expansionTids = state.expansionTeamIds?.length
    ? state.expansionTeamIds
    : schedule?.teams.flatMap(spec => {
        const team = existingByAbbrev.get(spec.abbrev.toUpperCase()) ?? createdByAbbrev.get(spec.abbrev);
        if (!team) return [];
        return [Number('tid' in team ? team.tid : team.id)];
      }) ?? [];
  if (expansionTids.length === 0) return {};
  const season = state.leagueStats.year;
  const settings = state.expansionProtectionSettings ?? {
    perTeamLimit: 8,
    maxDraftedPerTeam: 2,
    picksPerExpansionTeam: 14,
  };
  const picksPerTeam = settings.picksPerExpansionTeam;
  const maxPerTeam = settings.maxDraftedPerTeam;
  const sourceTeams = isPbaExpansion
    ? state.nonNBATeams.filter(team => team.league === 'PBA')
    : state.teams;
  const sourceTeamIds = new Set(sourceTeams.map(team => Number('tid' in team ? team.tid : team.id)));
  const eligible = new Set(state.expansionEligiblePlayers ?? sourceTeams.flatMap(team => {
    const teamId = Number('tid' in team ? team.tid : team.id);
    return state.players
      .filter(player =>
        player.tid === teamId
        && (isPbaExpansion
          ? player.status === 'PBA' && isPbaRosterLocal(player, state.leagueStats)
          : isPrimaryExpansionRosterPlayer(player, sourceTeamIds, expansionLeague))
      )
      .sort((left, right) => playerScore(right, season) - playerScore(left, season))
      .slice(settings.perTeamLimit)
      .map(player => player.internalId);
  }));
  const activePbaTeamIds = new Set(
    state.nonNBATeams.filter(team => team.league === 'PBA').map(team => team.tid),
  );
  const pool = state.players
    .filter(player =>
      eligible.has(player.internalId)
      && (isPbaExpansion
        ? activePbaTeamIds.has(player.tid)
          && player.status === 'PBA'
          && isPbaRosterLocal(player, state.leagueStats)
        : isPrimaryExpansionRosterPlayer(player, sourceTeamIds, expansionLeague))
    )
    .sort((left, right) => playerScore(right, season) - playerScore(left, season));
  const selected = new Map<string, { expansionTid: number; pick: number; originalTid: number }>();
  const draftedPerTeam = new Map<number, number>();
  let pick = 1;
  for (let round = 0; round < picksPerTeam; round += 1) {
    for (const expansionTid of expansionTids) {
      const candidate = pool.find(player =>
        !selected.has(player.internalId)
        && (draftedPerTeam.get(player.tid) ?? 0) < maxPerTeam
      );
      if (!candidate) continue;
      selected.set(candidate.internalId, { expansionTid, pick, originalTid: candidate.tid });
      draftedPerTeam.set(candidate.tid, (draftedPerTeam.get(candidate.tid) ?? 0) + 1);
      pick += 1;
    }
  }
  const players = state.players.map(player => {
    const selection = selected.get(player.internalId);
    if (!selection) return player;
    return {
      ...player,
      tid: selection.expansionTid,
      transactions: [
        ...(player.transactions ?? []).filter(transaction =>
          !(transaction.type === 'expansion-draft' && transaction.season === season)
        ),
        {
          season,
          tid: selection.expansionTid,
          type: 'expansion-draft',
          phase: 0,
          pickNum: selection.pick,
          originalTid: selection.originalTid,
          date: state.date,
        },
      ],
    };
  });
  const history = appendUniqueExpansionDraftHistory(
    state.history,
    [...selected.entries()].flatMap(([playerId, selection]) => {
      const player = state.players.find(candidate => candidate.internalId === playerId);
      return player ? [buildExpansionDraftHistoryEntry({
        state: { ...state, teams, nonNBATeams },
        player,
        tid: selection.expansionTid,
        pick: selection.pick,
        season,
      })] : [];
    }),
  );
  return {
    teams,
    nonNBATeams,
    draftPicks: isPbaExpansion && createdPbaTeams.length > 0
      ? generateFuturePicksForTeamIds(
          state.draftPicks,
          createdPbaTeams.map(team => team.tid),
          season,
          state.leagueStats.tradableDraftPickSeasons,
          2,
          true,
        )
      : createdNbaTeams.length > 0
        ? generateFuturePicksForTeamIds(
            state.draftPicks,
            createdNbaTeams.map(team => team.id),
            season,
            state.leagueStats.tradableDraftPickSeasons,
            getPrimaryDraftRounds(expansionLeague),
            true,
          )
        : state.draftPicks,
    players,
    history,
    expansionSchedule: undefined,
    expansionProtectionSettings: undefined,
    expansionDraftProtections: undefined,
    expansionEligiblePlayers: undefined,
    expansionTeamIds: undefined,
    activeExpansionDraftPicks: undefined,
    leagueStats: isPbaExpansion
      ? {
          ...state.leagueStats,
          pbaExpansionCompletedYears: Array.from(new Set([
            ...(state.leagueStats.pbaExpansionCompletedYears ?? []),
            Number(schedule?.year),
          ].filter(Number.isFinite))),
        }
      : isWnbaExpansion
        ? {
            ...state.leagueStats,
            wnbaExpansionCompletedYears: Array.from(new Set([
              ...(state.leagueStats.wnbaExpansionCompletedYears ?? []),
              Number(schedule?.year),
            ].filter(Number.isFinite))),
          }
        : { ...state.leagueStats, hasExpanded: true },
    offseasonChecklist: state.offseasonChecklist
      ? { ...state.offseasonChecklist, expansionDraft: 'done' }
      : state.offseasonChecklist,
  };
}
