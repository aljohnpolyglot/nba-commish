import type { GameState } from '../../types';
import { ENDESA_HISTORICAL_CATALOG, getEndesaHistoricalEconomyFactor } from './catalog';
import type { HistoricalEndesaBroadcastMeeting, HistoricalEndesaBroadcastRow } from './types';

const tierWeight: Record<string, number> = { S: 1.5, A: 1.25, B: 1.08, C: 0.94, D: 0.82 };

const teamId = (team: any): number => Number(team.id ?? team.tid);

const endesaTeams = (state: GameState): any[] => {
  const byId = new Map<number, any>();
  for (const team of [...state.teams, ...state.nonNBATeams]) {
    if ((team as any).league !== 'Endesa' || (team as any).endesaRelegated === true) continue;
    byId.set(teamId(team), team);
  }
  return [...byId.values()];
};

const distributePool = (pool: number, weights: number[]): number[] => {
  const totalWeight = weights.reduce((sum, value) => sum + Math.max(0, value), 0) || weights.length;
  const rows = weights.map(weight => Math.round(pool * Math.max(0, weight) / totalWeight));
  if (rows.length > 0) rows[0] += pool - rows.reduce((sum, value) => sum + value, 0);
  return rows;
};

const resolveTotalPool = (state: GameState, season: number): number => {
  const prior = [...(state.historicalEndesa?.broadcastMeetings ?? [])]
    .filter(meeting => meeting.season < season && meeting.booked)
    .sort((left, right) => right.season - left.season)[0];
  if (prior) {
    const inflation = state.leagueStats.inflationEnabled === false
      ? 0
      : Number(state.leagueStats.inflationAverage ?? 2.5) / 100;
    return Math.round(prior.totalPoolEUR * (1 + inflation));
  }
  return Math.round(ENDESA_HISTORICAL_CATALOG.broadcastBasePoolEUR * getEndesaHistoricalEconomyFactor(season));
};

export function buildEndesaBroadcastDistribution(state: GameState): HistoricalEndesaBroadcastMeeting {
  const season = state.leagueStats.year;
  const existing = (state.historicalEndesa?.broadcastMeetings ?? []).find(meeting => meeting.season === season);
  if (existing) return existing;
  const teams = endesaTeams(state);
  const totalPoolEUR = resolveTotalPool(state, season);
  const equalPoolEUR = Math.round(totalPoolEUR * 0.4);
  const performancePoolEUR = Math.round(totalPoolEUR * 0.3);
  const commercialPoolEUR = totalPoolEUR - equalPoolEUR - performancePoolEUR;
  const equal = distributePool(equalPoolEUR, teams.map(() => 1));
  const performance = distributePool(performancePoolEUR, teams.map(team => {
    const wins = Number(team.previousSeasonWins ?? team.wins ?? 0);
    const losses = Number(team.previousSeasonLosses ?? team.losses ?? 0);
    const games = wins + losses;
    return games > 0 ? 0.35 + Math.pow(wins / games, 2) * 2.4 : tierWeight[team.tycoon?.tier ?? 'D'];
  }));
  const commercial = distributePool(commercialPoolEUR, teams.map(team => {
    const population = Math.max(0.25, Number(team.pop ?? 1));
    return Math.sqrt(population) * (tierWeight[team.tycoon?.tier ?? 'D'] ?? 1);
  }));
  const priorRows = new Map<number, number>();
  for (const meeting of state.historicalEndesa?.broadcastMeetings ?? []) {
    if (!meeting.booked || meeting.season >= season) continue;
    for (const row of meeting.rows) priorRows.set(row.teamId, row.totalEUR);
  }
  const rows: HistoricalEndesaBroadcastRow[] = teams.map((team, index) => ({
    teamId: teamId(team),
    equalShareEUR: equal[index] ?? 0,
    performanceShareEUR: performance[index] ?? 0,
    commercialShareEUR: commercial[index] ?? 0,
    totalEUR: (equal[index] ?? 0) + (performance[index] ?? 0) + (commercial[index] ?? 0),
    previousTotalEUR: priorRows.get(teamId(team)),
  })).sort((left, right) => right.totalEUR - left.totalEUR);
  return {
    id: `endesa-broadcast:${season}`,
    season,
    totalPoolEUR,
    equalPoolEUR,
    performancePoolEUR,
    commercialPoolEUR,
    rows,
    booked: false,
  };
}

export function bookEndesaBroadcastDistribution(state: GameState): GameState {
  const historical = state.historicalEndesa;
  if (!historical) return state;
  const meeting = buildEndesaBroadcastDistribution(state);
  if (meeting.booked) return state;
  const rowByTeam = new Map(meeting.rows.map(row => [row.teamId, row]));
  const bookTeam = (team: any) => {
    const row = rowByTeam.get(teamId(team));
    if (!row || !team.tycoon) return team;
    const receipts = team.tycoon.broadcastReceipts ?? [];
    if (receipts.some((receipt: any) => receipt.id === meeting.id)) return team;
    return {
      ...team,
      tycoon: {
        ...team.tycoon,
        cashOnHand: Number(team.tycoon.cashOnHand ?? 0) + row.totalEUR,
        broadcastReceipts: [...receipts, {
          id: meeting.id,
          year: meeting.season,
          totalPoolEUR: meeting.totalPoolEUR,
          equalShareEUR: row.equalShareEUR,
          performanceShareEUR: row.performanceShareEUR,
          commercialShareEUR: row.commercialShareEUR,
          totalEUR: row.totalEUR,
        }],
      },
    };
  };
  const bookedMeeting = { ...meeting, booked: true };
  return {
    ...state,
    teams: state.teams.map(bookTeam),
    nonNBATeams: state.nonNBATeams.map(bookTeam),
    historicalEndesa: {
      ...historical,
      broadcastMeetings: [
        ...(historical.broadcastMeetings ?? []).filter(existing => existing.season !== meeting.season),
        bookedMeeting,
      ],
    },
  };
}
