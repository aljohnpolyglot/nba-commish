import type {
  GameState,
  GovernorsBoardAwardChange,
  GovernorsBoardMajorUpdate,
  GovernorsBoardMeeting,
  GovernorsBoardRuleChange,
  GovernorsBoardTeamChange,
  LeagueStats,
  NBATeam,
} from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import {
  buildAnnualCupPrizePoolProposal,
  findCupPrizePool,
} from '../governorsBoard/cupPrizePool';
import { buildGovernorsBoardMeeting } from '../governorsBoard/governorsBoardMeeting';
import {
  applyWnbaIdentityToTeam,
  applyWnbaRuleSnapshot,
  getWnbaActiveTeamIds,
  getWnbaTeamIdentity,
} from './history';
import type { WnbaLeagueEvent, WnbaTeamIdentitySnapshot } from './types';

const WNBA_LEAGUE_ID = 'wnba';
const WNBA_CUP_ID = 'wnba-commissioners-cup';

export interface BuildWnbaGovernorsBoardMeetingArgs {
  state: GameState;
  season?: number;
  nextLeagueStats?: LeagueStats;
  nextTeams?: NBATeam[];
  inflationPercent?: number;
}

function sourceCutoffSeason(state: GameState): number {
  const sourceSeason = Number(state.historicalWnba?.sourceSeason);
  const branchSeason = Number(state.wnbaStartYear ?? state.leagueStats.year);
  if (!Number.isFinite(sourceSeason)) return -Infinity;
  return Number.isFinite(branchSeason) ? Math.min(sourceSeason, branchSeason) : sourceSeason;
}

function fullName(region: string, name: string): string {
  return getTeamFullName({ region, name });
}

function teamFromIdentity(identity: WnbaTeamIdentitySnapshot, fallback?: NBATeam): NBATeam {
  return {
    ...(fallback ?? {}),
    id: identity.tid,
    region: identity.region,
    name: fullName(identity.region, identity.name),
    abbrev: identity.abbrev,
    conference: identity.cid === 0 ? 'East' : 'West',
    cid: identity.cid,
    did: identity.did,
    wins: fallback?.wins ?? 0,
    losses: fallback?.losses ?? 0,
    strength: fallback?.strength ?? 50,
    logoUrl: identity.imgURL ?? fallback?.logoUrl,
    colors: identity.colors ?? fallback?.colors,
  };
}

function buildHistoricalTeams(state: GameState, season: number): NBATeam[] {
  const history = state.historicalWnba;
  const activeIds = getWnbaActiveTeamIds(history, season);
  if (activeIds.length === 0) return state.teams.map(team => ({ ...team }));
  const candidates = [...state.teams, ...(state.teamArchive ?? []), ...(state.prevTeams ?? [])];
  const byId = new Map(candidates.map(team => [team.id, team]));
  return activeIds.flatMap(tid => {
    const identity = getWnbaTeamIdentity(history, tid, season);
    if (!identity) return [];
    return [teamFromIdentity(identity, byId.get(tid))];
  });
}

function replaceCupName(value: string): string {
  return value.replaceAll('NBA Cup', "Commissioner's Cup");
}

function brandRuleChanges(changes: GovernorsBoardRuleChange[]): GovernorsBoardRuleChange[] {
  return changes.map(change => ({
    ...change,
    label: change.key === 'inSeasonTournament'
      ? "Commissioner's Cup"
      : replaceCupName(change.label),
  }));
}

function buildPostseasonRuleChanges(previous: LeagueStats, next: LeagueStats): GovernorsBoardRuleChange[] {
  const changes: GovernorsBoardRuleChange[] = [];
  const push = (key: string, label: string, before: string | number, after: string | number) => {
    if (before !== after) changes.push({ key, label, previous: before, next: after });
  };
  push(
    'numPlayoffTeams',
    'Playoff teams',
    Number(previous.numPlayoffTeams ?? 8),
    Number(next.numPlayoffTeams ?? 8),
  );
  push(
    'numPlayoffByes',
    'First-round byes',
    Number(previous.numPlayoffByes ?? 0),
    Number(next.numPlayoffByes ?? 0),
  );
  push(
    'numGamesPlayoffSeries',
    'Playoff series lengths',
    (previous.numGamesPlayoffSeries ?? []).join('-'),
    (next.numGamesPlayoffSeries ?? []).join('-'),
  );
  return changes;
}

function brandAwardChanges(changes: GovernorsBoardAwardChange[]): GovernorsBoardAwardChange[] {
  return changes.map(change => ({
    ...change,
    name: replaceCupName(change.name),
    ...(change.previousName ? { previousName: replaceCupName(change.previousName) } : {}),
  }));
}

function explicitAwardChanges(
  changes: GovernorsBoardAwardChange[],
  previous: LeagueStats,
  next: LeagueStats,
): GovernorsBoardAwardChange[] {
  return changes.filter(change => {
    const previousEnabled = previous.awardSettings?.enabled?.[change.awardId];
    const nextEnabled = next.awardSettings?.enabled?.[change.awardId];
    const previousName = previous.awardSettings?.customNames?.[change.awardId];
    const nextName = next.awardSettings?.customNames?.[change.awardId];
    return previousEnabled !== nextEnabled || previousName !== nextName;
  });
}

function brandMajorUpdates(updates: GovernorsBoardMajorUpdate[]): GovernorsBoardMajorUpdate[] {
  return updates.map(update => ({
    ...update,
    title: replaceCupName(update.title),
    summary: replaceCupName(update.summary),
  }));
}

function eventTeamChange(state: GameState, event: WnbaLeagueEvent): GovernorsBoardTeamChange | null {
  const history = state.historicalWnba;
  const previous = event.fromTid == null
    ? undefined
    : getWnbaTeamIdentity(history, event.fromTid, event.season - 1);
  const next = event.toTid == null
    ? undefined
    : history?.identityTimeline.find(snapshot => snapshot.tid === event.toTid && snapshot.season === event.season)
      ?? getWnbaTeamIdentity(history, event.toTid, event.season);
  if (!previous && !next) return null;
  return {
    teamId: next?.tid ?? previous!.tid,
    ...(previous ? {
      previousRegion: previous.region,
      previousName: fullName(previous.region, previous.name),
      previousAbbrev: previous.abbrev,
      previousLogoUrl: previous.imgURL,
      previousColors: previous.colors,
    } : {}),
    ...(next ? {
      nextRegion: next.region,
      nextName: fullName(next.region, next.name),
      nextAbbrev: next.abbrev,
      nextLogoUrl: next.imgURL,
      nextColors: next.colors,
    } : {}),
  };
}

function scheduledExpansionChanges(
  state: GameState,
  season: number,
): { teamChanges: GovernorsBoardTeamChange[]; majorUpdates: GovernorsBoardMajorUpdate[] } {
  const schedule = state.expansionSchedule;
  if (schedule?.league !== 'wnba' || schedule.year !== season) {
    return { teamChanges: [], majorUpdates: [] };
  }
  const decision = state.expansionBidDecisions?.[season];
  if (!decision || decision.league !== 'wnba') return { teamChanges: [], majorUpdates: [] };
  const approved = decision.status === 'accepted'
    ? schedule.teams.filter(team => decision.teamAbbrevs.includes(team.abbrev))
    : [];
  const teamChanges = approved.map((team, index) => ({
    teamId: state.expansionTeamIds?.[index] ?? 30_000 + (season * 10) + index,
    nextRegion: team.region,
    nextName: fullName(team.region, team.name),
    nextAbbrev: team.abbrev,
    nextLogoUrl: team.imgURL,
    nextColors: [...team.colors],
  }));
  const teamNames = approved.map(team => fullName(team.region, team.name));
  const majorUpdates: GovernorsBoardMajorUpdate[] = [{
    key: `wnba-expansion-decision-${season}`,
    title: decision.status === 'accepted' ? 'Expansion Approved' : 'Expansion Applications Declined',
    summary: decision.status === 'accepted'
      ? `${teamNames.join(' and ')} will join the WNBA for the ${season} season.`
      : `The WNBA will retain its current membership for the ${season} season.`,
  }];
  return { teamChanges, majorUpdates };
}

function uniqueTeamChanges(changes: GovernorsBoardTeamChange[]): GovernorsBoardTeamChange[] {
  const seen = new Set<string>();
  return changes.filter(change => {
    const key = [
      change.teamId,
      change.previousAbbrev ?? '',
      change.nextAbbrev ?? '',
      change.previousName ?? '',
      change.nextName ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildWnbaGovernorsBoardMeeting(
  args: BuildWnbaGovernorsBoardMeetingArgs,
): GovernorsBoardMeeting {
  const { state } = args;
  const currentSeason = Number(state.leagueStats.year);
  const season = args.season ?? currentSeason + 1;
  const sourceEligible = season <= sourceCutoffSeason(state);
  const suppliedNextStats = args.nextLeagueStats ?? { ...state.leagueStats, year: season };
  const nextLeagueStats = sourceEligible
    ? applyWnbaRuleSnapshot(suppliedNextStats, season, state.wnbaKnowledgeCutoffDate)
    : { ...suppliedNextStats, year: season };
  const currentTeams = sourceEligible
    ? state.teams.map(team => applyWnbaIdentityToTeam(team, state.historicalWnba, currentSeason))
    : state.teams;
  const nextTeams = args.nextTeams
    ?? (sourceEligible ? buildHistoricalTeams(state, season) : state.teams.map(team => ({ ...team })));
  const base = buildGovernorsBoardMeeting({
    state: { date: state.date, leagueStats: state.leagueStats, teams: currentTeams },
    nextLeagueStats,
    nextTeams,
    season,
  });
  const sourceEvents = sourceEligible
    ? (state.historicalWnba?.events ?? []).filter(event => event.season === season)
    : [];
  const historicalTeamChanges = sourceEvents
    .map(event => eventTeamChange(state, event))
    .filter((change): change is GovernorsBoardTeamChange => change !== null);
  const historicalUpdates = sourceEvents.map(event => ({
    key: event.id,
    title: event.title,
    summary: event.summary,
  }));
  const expansion = scheduledExpansionChanges(state, season);
  const pool = findCupPrizePool(state.cupPrizePools ?? [], WNBA_LEAGUE_ID, WNBA_CUP_ID);
  const inflationPercent = args.inflationPercent
    ?? (state.leagueStats.inflationEnabled === false ? 0 : Number(state.leagueStats.inflationAverage ?? 2.5));
  const cupPrizePoolProposal = nextLeagueStats.inSeasonTournament === true
    && pool?.enabled === true
    && pool.effectiveSeason <= season
    && !pool.history.some(entry => entry.season === season)
    ? buildAnnualCupPrizePoolProposal(pool, season, inflationPercent)
    : null;

  return {
    kind: 'governors-board',
    season,
    generatedAt: state.date,
    ruleChanges: brandRuleChanges([
      ...(base?.ruleChanges ?? []),
      ...buildPostseasonRuleChanges(state.leagueStats, nextLeagueStats),
    ]),
    awardChanges: brandAwardChanges(explicitAwardChanges(
      base?.awardChanges ?? [],
      state.leagueStats,
      nextLeagueStats,
    )),
    teamChanges: uniqueTeamChanges([
      ...(base?.teamChanges ?? []),
      ...historicalTeamChanges,
      ...expansion.teamChanges,
    ]),
    venueChanges: base?.venueChanges ?? [],
    majorUpdates: [
      ...brandMajorUpdates(base?.majorUpdates ?? []),
      ...historicalUpdates,
      ...expansion.majorUpdates,
    ],
    ...(cupPrizePoolProposal ? { cupPrizePoolProposal } : {}),
  };
}
