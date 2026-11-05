import type { GameState, GovernorsBoardMeeting, NBATeam, NonNBATeam } from '../../types';
import { advanceAwardSettingsForSeason } from '../awards/awardEraProgression';
import { buildGovernorsBoardMeeting } from '../governorsBoard/governorsBoardMeeting';
import { getHistoricalPbaRuleOverrides } from './historicalCatalog';
import { getNextPbaSeasonKey } from './historyConfig';
import { getHistoricalPbaTeamIdentitySnapshot, type HistoricalPbaState } from './historicalTypes';

function asBoardTeam(team: NonNBATeam, season: number, historical?: HistoricalPbaState): NBATeam {
  const snapshot = getHistoricalPbaTeamIdentitySnapshot(historical, team.tid, season);
  return {
    id: team.tid,
    region: snapshot?.region ?? team.region,
    name: snapshot?.name ?? team.name,
    abbrev: snapshot?.abbrev ?? team.abbrev ?? 'PBA',
    conference: 'PBA',
    colors: snapshot?.colors ?? team.colors,
    logoUrl: snapshot?.imgURL ?? team.imgURL,
    pop: team.pop,
    stadiumCapacity: team.stadiumCapacity,
    wins: 0,
    losses: 0,
    strength: 50,
  };
}

export function buildPbaGovernorsBoardMeeting(state: GameState): GovernorsBoardMeeting {
  const preparedSeason = Number((state.leagueStats as any).pbaYearEndRolloverPreparedSeason);
  const currentSeason = Number.isFinite(preparedSeason) && state.leagueStats.year === preparedSeason + 1
    ? preparedSeason
    : state.leagueStats.year;
  const nextSeason = getNextPbaSeasonKey(currentSeason);
  const pbaTeams = state.nonNBATeams.filter(team => team.league === 'PBA');
  const currentTeams = pbaTeams.map(team => asBoardTeam(team, currentSeason, state.historicalPba));
  const nextTeams = pbaTeams.map(team => asBoardTeam(team, nextSeason, state.historicalPba));
  const currentLeagueStats = {
    ...state.leagueStats,
    ...getHistoricalPbaRuleOverrides(currentSeason),
    year: currentSeason,
  };
  const nextLeagueStats = advanceAwardSettingsForSeason({
    ...currentLeagueStats,
    ...getHistoricalPbaRuleOverrides(nextSeason),
    year: nextSeason,
  }, nextSeason);
  const base = buildGovernorsBoardMeeting({
    state: { date: state.date, leagueStats: currentLeagueStats, teams: currentTeams },
    nextLeagueStats,
    nextTeams,
    season: nextSeason,
  });
  const currentIds = new Set(currentTeams.map(team => team.id));
  const expansionChanges = (state.historicalPba?.teamIdentityTimeline ?? [])
    .filter(snapshot => snapshot.season === nextSeason && !currentIds.has(snapshot.tid))
    .filter((snapshot, index, rows) => rows.findIndex(row => row.tid === snapshot.tid) === index)
    .map(snapshot => ({
      teamId: snapshot.tid,
      nextRegion: snapshot.region,
      nextName: snapshot.name,
      nextAbbrev: snapshot.abbrev,
      nextLogoUrl: snapshot.imgURL,
      nextColors: snapshot.colors,
    }));
  const expansionDecision = state.expansionSchedule?.league === 'pba'
    && state.expansionSchedule.year === nextSeason
    ? state.expansionBidDecisions?.[state.expansionSchedule.year]
    : undefined;
  const approvedExpansionTeams = expansionDecision?.status === 'accepted'
    ? state.expansionSchedule?.teams.filter(team => expansionDecision.teamAbbrevs.includes(team.abbrev)) ?? []
    : [];
  return {
    kind: 'governors-board',
    season: nextSeason,
    generatedAt: state.date,
    ruleChanges: base?.ruleChanges ?? [],
    awardChanges: base?.awardChanges ?? [],
    teamChanges: [...(base?.teamChanges ?? []), ...expansionChanges],
    venueChanges: base?.venueChanges ?? [],
    majorUpdates: [
      ...(base?.majorUpdates ?? []),
      ...(approvedExpansionTeams.length > 0
        ? [{
            key: `pba-expansion-${nextSeason}`,
            title: 'Expansion Approved',
            summary: `${approvedExpansionTeams.map(team => `${team.region} ${team.name}`).join(' and ')} will join the PBA for Season ${nextSeason}.`,
          }]
        : []),
    ],
  };
}

export function ensurePbaGovernorsBoardMeeting(state: GameState): GameState {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return state;
  const status = state.offseasonChecklist?.governorsBoardMeeting;
  if (status !== 'pending' && status !== 'in-progress') return state;
  if (state.pendingGovernorsBoardMeeting?.kind === 'governors-board') return state;
  return {
    ...state,
    pendingGovernorsBoardMeeting: buildPbaGovernorsBoardMeeting(state),
  };
}
