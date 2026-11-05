import type { ExpansionTeamSpec, GameState } from '../../types';

export const WNBA_EXPANSION_PROTECTION_SETTINGS = {
  perTeamLimit: 6,
  maxDraftedPerTeam: 1,
  picksPerExpansionTeam: 12,
} as const;

type WnbaExpansionPlan = {
  year: number;
  team: ExpansionTeamSpec;
};

export const WNBA_EXPANSION_PLANS: readonly WnbaExpansionPlan[] = [
  {
    year: 2028,
    team: {
      region: 'Cleveland',
      name: 'WNBA',
      abbrev: 'CLE',
      pop: 3.7,
      stadiumCapacity: 19_432,
      colors: ['#010111', '#E04C20', '#A9A9A9'],
      imgURL: 'https://static.wikia.nocookie.net/logopedia/images/b/b5/WNBA_Cleveland_logo.png/revision/latest?cb=20250716041856',
      conference: 'East',
      cid: 0,
      did: 0,
      lat: 41.4993,
      lng: -81.6944,
      reclaimsHistoryFromTid: 16,
    },
  },
  {
    year: 2029,
    team: {
      region: 'Detroit',
      name: 'WNBA',
      abbrev: 'DET',
      pop: 4.3,
      stadiumCapacity: 20_332,
      colors: ['#000000', '#F05020', '#262626'],
      imgURL: 'https://static.wikia.nocookie.net/logopedia/images/7/7f/WNBA_Detroit_logo.png/revision/latest?cb=20250716042312',
      conference: 'East',
      cid: 0,
      did: 0,
      lat: 42.3314,
      lng: -83.0458,
      reclaimsHistoryFromTid: 17,
    },
  },
  {
    year: 2030,
    team: {
      region: 'Philadelphia',
      name: 'WNBA',
      abbrev: 'PHI',
      pop: 6.2,
      stadiumCapacity: 21_000,
      colors: ['#010000', '#9E513C', '#C4C4C4'],
      imgURL: 'https://static.wikia.nocookie.net/logopedia/images/8/87/WNBA_Philadelphia_Logo.png/revision/latest?cb=20250716042649',
      conference: 'East',
      cid: 0,
      did: 0,
      lat: 39.9526,
      lng: -75.1652,
    },
  },
] as const;

export function buildNextWnbaExpansionSchedule(
  state: Pick<GameState, 'teams' | 'leagueStats'>,
): GameState['expansionSchedule'] | null {
  if (state.leagueStats.uiMode !== 'wnba_isolated') return null;
  const completed = new Set(state.leagueStats.wnbaExpansionCompletedYears ?? []);
  const activeAbbrevs = new Set(state.teams.map(team => team.abbrev.toUpperCase()));
  const next = WNBA_EXPANSION_PLANS.find(plan => (
    !completed.has(plan.year)
    && !activeAbbrevs.has(plan.team.abbrev)
  ));
  if (!next) return null;
  return {
    year: next.year,
    league: 'wnba',
    teams: [{ ...next.team, colors: [...next.team.colors] as [string, string, string] }],
    realignment: {},
  };
}
