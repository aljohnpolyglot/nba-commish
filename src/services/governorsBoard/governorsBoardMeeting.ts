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
import { getRisingStarsEventLabel } from '../allStar/allStarEventAvailability';
import { AWARD_REGISTRY } from '../awards/AwardRegistry';
import { getAwardSettingActive, getAwardUIMode } from '../awards/awardEraProgression';

export const GOVERNORS_BOARD_RULE_FIELDS: Array<{ key: keyof LeagueStats; label: string }> = [
  { key: 'salaryCapEnabled', label: 'Salary cap' },
  { key: 'salaryCapType', label: 'Cap model' },
  { key: 'salaryCap', label: 'Salary cap amount' },
  { key: 'minimumPayrollEnabled', label: 'Minimum payroll' },
  { key: 'luxuryTaxEnabled', label: 'Luxury tax' },
  { key: 'apronsEnabled', label: 'Aprons' },
  { key: 'numberOfAprons', label: 'Apron count' },
  { key: 'twoWayContractsEnabled', label: 'Two-way contracts' },
  { key: 'maxTwoWayPlayersPerTeam', label: 'Two-way slots' },
  { key: 'nonGuaranteedContractsEnabled', label: 'Non-guaranteed contracts' },
  { key: 'minContractType', label: 'Minimum salary model' },
  { key: 'minContractStaticAmount', label: 'Minimum salary floor' },
  { key: 'maxContractType', label: 'Maximum salary model' },
  { key: 'maxContractStaticPercentage', label: 'Maximum salary percent' },
  { key: 'supermaxEnabled', label: 'Supermax eligibility' },
  { key: 'supermaxPercentage', label: 'Supermax percent' },
  { key: 'rookieExtEnabled', label: 'Rookie extensions' },
  { key: 'rookieExtPct', label: 'Rookie extension percent' },
  { key: 'rookieExtRosePct', label: 'Rookie award extension percent' },
  { key: 'birdRightsEnabled', label: 'Bird rights' },
  { key: 'maxContractLengthStandard', label: 'Standard max length' },
  { key: 'maxContractLengthBird', label: 'Bird max length' },
  { key: 'playerOptionsEnabled', label: 'Player options' },
  { key: 'rookieScaleType', label: 'Rookie scale' },
  { key: 'rookieContractLength', label: 'Rookie guaranteed years' },
  { key: 'rookieTeamOptionsEnabled', label: 'Rookie team options' },
  { key: 'rookieTeamOptionYears', label: 'Rookie option years' },
  { key: 'rookieRestrictedFreeAgentEligibility', label: 'Rookie restricted free agency' },
  { key: 'mleEnabled', label: 'Mid-level exception' },
  { key: 'biannualEnabled', label: 'Bi-annual exception' },
  { key: 'playIn', label: 'Play-In Tournament' },
  { key: 'playInFormat', label: 'Play-In format' },
  { key: 'inSeasonTournament', label: 'NBA Cup' },
  { key: 'summerLeagueEnabled', label: 'Summer League' },
  { key: 'summerLeagueTournamentEnabled', label: 'Summer League championship' },
  { key: 'gamesPerSeason', label: 'Regular season games' },
  { key: 'jerseyPatchProgramEnabled', label: 'Jersey patch program' },
  { key: 'gameFormat', label: 'Game format' },
  { key: 'gameTargetScore', label: 'Target score' },
  { key: 'quarterLength', label: 'Period length' },
  { key: 'numQuarters', label: 'Period count' },
  { key: 'overtimeEnabled', label: 'Overtime' },
  { key: 'overtimeType', label: 'Overtime format' },
  { key: 'startOfPossessionMethod', label: 'Opening possession' },
  { key: 'shotClockEnabled', label: 'Shot clock' },
  { key: 'shotClockValue', label: 'Shot clock duration' },
  { key: 'shotClockResetOffensiveRebound', label: 'Offensive rebound shot-clock reset' },
  { key: 'maxPlayersOnCourt', label: 'Players on court' },
  { key: 'fieldGoalValue', label: 'Field-goal value' },
  { key: 'dunkValue', label: 'Dunk value' },
  { key: 'freeThrowsEnabled', label: 'Free throws' },
  { key: 'threePointLineEnabled', label: '3-point line' },
  { key: 'threePointLineDistance', label: '3-point line distance' },
  { key: 'fourPointLine', label: '4-point line' },
  { key: 'fourPointLineDistance', label: '4-point line distance' },
  { key: 'noDribbleRule', label: 'No-dribble rule' },
  { key: 'dribbleRule', label: 'Dribbling rule' },
  { key: 'madeBasketRestart', label: 'Made-basket restart' },
  { key: 'teamFoulPenalty', label: 'Team-foul penalty threshold' },
  { key: 'teamFoulPenaltyMode', label: 'Team-foul penalty' },
  { key: 'teamFoulPenaltyPoints', label: 'Team-foul penalty points' },
  { key: 'temporaryDisqualificationFoulLimit', label: 'Temporary disqualification foul limit' },
  { key: 'temporaryDisqualificationUntilNextScore', label: 'Temporary disqualification duration' },
  { key: 'temporaryDisqualificationAllowsSubstitute', label: 'Temporary disqualification replacement' },
  { key: 'foulOutLimit', label: 'Permanent foul-out limit' },
  { key: 'homeCourtAdvantage', label: 'Home-court advantage' },
  { key: 'travelingEnabled', label: 'Traveling violation' },
  { key: 'doubleDribbleEnabled', label: 'Double-dribble violation' },
  { key: 'outOfBoundsEnabled', label: 'Out-of-bounds rule' },
  { key: 'inboundTimerEnabled', label: 'Inbound timer' },
  { key: 'inboundTimerValue', label: 'Inbound timer duration' },
  { key: 'ballWeight', label: 'Ball weight' },
  { key: 'backcourtTimerEnabled', label: 'Backcourt timer' },
  { key: 'backcourtTimerValue', label: 'Backcourt timer duration' },
  { key: 'backcourtViolationEnabled', label: 'Backcourt violation' },
  { key: 'offensiveThreeSecondEnabled', label: 'Offensive 3 seconds' },
  { key: 'handcheckingEnabled', label: 'Hand-checking' },
  { key: 'illegalZoneDefenseEnabled', label: 'Illegal defense' },
  { key: 'defensiveThreeSecondEnabled', label: 'Defensive 3 seconds' },
  { key: 'backToBasketTimerEnabled', label: 'Back-to-basket timer' },
  { key: 'goaltendingEnabled', label: 'Goaltending' },
  { key: 'coachChallenges', label: 'Coach challenges' },
  { key: 'maxCoachChallenges', label: 'Maximum coach challenges' },
  { key: 'challengeReimbursed', label: 'Successful challenge reimbursement' },
  { key: 'maxTimeouts', label: 'Team timeouts' },
  { key: 'clutchTimeoutLimit', label: 'Late-game timeout limit' },
  { key: 'minGamesRequirement', label: 'Award games minimum' },
  { key: 'allStarGameEnabled', label: 'All-Star Game' },
  { key: 'allStarFormat', label: 'All-Star roster format' },
  { key: 'allStarGameFormat', label: 'All-Star game format' },
  { key: 'allStarMirrorLeagueRules', label: 'All-Star league-rule mirror' },
  { key: 'allStarQuarterLength', label: 'All-Star quarter length' },
  { key: 'allStarNumQuarters', label: 'All-Star quarter count' },
  { key: 'allStarOvertimeDuration', label: 'All-Star overtime duration' },
  { key: 'allStarGameTargetScore', label: 'All-Star target score' },
  { key: 'risingStarsEnabled', label: 'Rookie/Rising Stars event' },
  { key: 'risingStarsFormat', label: 'Rookie/Rising Stars format' },
  { key: 'risingStarsMirrorLeagueRules', label: 'Rookie/Rising Stars league-rule mirror' },
  { key: 'risingStarsQuarterLength', label: 'Rookie/Rising Stars quarter length' },
  { key: 'risingStarsNumQuarters', label: 'Rookie/Rising Stars quarter count' },
  { key: 'risingStarsOvertimeDuration', label: 'Rookie/Rising Stars overtime duration' },
  { key: 'celebrityGameEnabled', label: 'Celebrity Game' },
  { key: 'allStarDunkContest', label: 'Dunk Contest' },
  { key: 'allStarDanceContestEnabled', label: 'Dance Contest' },
  { key: 'allStarThreePointContest', label: '3-Point Contest' },
  { key: 'allStarShootingStars', label: 'Shooting Stars' },
  { key: 'allStarSkillsChallenge', label: 'Skills Challenge' },
  { key: 'allStarHorse', label: 'H-O-R-S-E' },
  { key: 'allStarThroneEnabled', label: 'Throne Tournament' },
];

function normalizeComparable(value: unknown): string | number | boolean | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 1000) / 1000;
  }
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  return value == null ? null : String(value);
}

function buildRuleChanges(previous: LeagueStats, next: LeagueStats): GovernorsBoardRuleChange[] {
  return GOVERNORS_BOARD_RULE_FIELDS
    .map(({ key, label }) => {
      const before = normalizeComparable(previous[key]);
      const after = normalizeComparable(next[key]);
      return before === after ? null : { key: String(key), label, previous: before, next: after };
    })
    .filter((change): change is GovernorsBoardRuleChange => Boolean(change));
}

function buildTeamChanges(previousTeams: NBATeam[], nextTeams: NBATeam[]): GovernorsBoardTeamChange[] {
  const previousById = new Map(previousTeams.map(team => [team.id, team]));
  const colorsChanged = (a?: string[], b?: string[]) => {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    return left.length !== right.length || left.some((color, index) => color !== right[index]);
  };
  return nextTeams
    .map(team => {
      const previous = previousById.get(team.id);
      if (!previous) return null;
      const changed =
        previous.name !== team.name ||
        previous.region !== team.region ||
        previous.abbrev !== team.abbrev ||
        previous.logoUrl !== team.logoUrl ||
        colorsChanged(previous.colors, team.colors);
      if (!changed) return null;
      const change: GovernorsBoardTeamChange = {
        teamId: team.id,
        previousRegion: previous.region,
        nextRegion: team.region,
        previousName: previous.name,
        nextName: team.name,
        previousAbbrev: previous.abbrev,
        nextAbbrev: team.abbrev,
        previousLogoUrl: previous.logoUrl,
        nextLogoUrl: team.logoUrl,
        previousColors: previous.colors,
        nextColors: team.colors,
      };
      return change;
    })
    .filter((change): change is GovernorsBoardTeamChange => Boolean(change));
}

function awardName(leagueStats: LeagueStats, awardId: string): string {
  const definition = AWARD_REGISTRY.find(award => award.id === awardId);
  if (!definition) return awardId;
  const mode = getAwardUIMode(leagueStats);
  return leagueStats.awardSettings?.customNames?.[awardId]
    ?? definition.brandedAs?.[mode]?.name
    ?? definition.name;
}

function buildAwardChanges(
  previous: LeagueStats,
  next: LeagueStats,
  effectiveSeason: number,
): GovernorsBoardAwardChange[] {
  return AWARD_REGISTRY.flatMap(definition => {
    const previousActive = getAwardSettingActive(previous, definition.id, Number(previous.year));
    const active = getAwardSettingActive(next, definition.id, Number(next.year ?? effectiveSeason));
    const previousName = awardName(previous, definition.id);
    const name = awardName(next, definition.id);
    if (previousActive === active && previousName === name) return [];
    const commissionerOverride = definition.id in (next.awardSettingsCommissionerOverrides ?? {});
    return [{
      awardId: definition.id,
      name,
      ...(previousName !== name ? { previousName } : {}),
      effectiveSeason,
      ...(definition.introducedSeason !== undefined
        ? { introducedSeason: definition.introducedSeason }
        : {}),
      previousActive,
      active,
      source: commissionerOverride ? 'commissioner' as const : 'era' as const,
    }];
  });
}

function boolChanged(previous: LeagueStats, next: LeagueStats, key: keyof LeagueStats): boolean {
  return normalizeComparable(previous[key]) !== normalizeComparable(next[key]);
}

function valueChanged(previous: LeagueStats, next: LeagueStats, key: keyof LeagueStats): boolean {
  return normalizeComparable(previous[key]) !== normalizeComparable(next[key]);
}

function buildMajorUpdates(previous: LeagueStats, next: LeagueStats): GovernorsBoardMajorUpdate[] {
  const updates: GovernorsBoardMajorUpdate[] = [];
  const push = (
    key: string,
    title: string,
    summary: string,
    previousValue?: string | number | boolean | null,
    nextValue?: string | number | boolean | null,
  ) => {
    updates.push({ key, title, summary, previous: previousValue, next: nextValue });
  };

  if (boolChanged(previous, next, 'playIn')) {
    const enabled = next.playIn === true;
    const bubbleFormat = next.playInFormat === 'bubble_8_9';
    push(
      'playIn',
      'Postseason Format',
      enabled
        ? bubbleFormat
          ? 'Bubble 8/9 Play-In added before the first round.'
          : 'Play-In Tournament added before the first round.'
        : 'Play-In Tournament removed from the postseason path.',
      normalizeComparable(previous.playIn),
      normalizeComparable(next.playIn),
    );
  } else if (next.playIn === true && valueChanged(previous, next, 'playInFormat')) {
    push(
      'playInFormat',
      'Postseason Format',
      next.playInFormat === 'bubble_8_9'
        ? 'Bubble 8/9 Play-In adopted for the postseason path.'
        : 'Modern 7-10 Play-In Tournament adopted for the postseason path.',
      normalizeComparable(previous.playInFormat),
      normalizeComparable(next.playInFormat),
    );
  }

  if (boolChanged(previous, next, 'inSeasonTournament')) {
    const enabled = next.inSeasonTournament === true;
    push(
      'inSeasonTournament',
      'Midseason Competition',
      enabled ? 'NBA Cup added to the regular-season calendar.' : 'NBA Cup removed from the regular-season calendar.',
      normalizeComparable(previous.inSeasonTournament),
      normalizeComparable(next.inSeasonTournament),
    );
  }

  if (
    boolChanged(previous, next, 'summerLeagueEnabled')
    || boolChanged(previous, next, 'summerLeagueTournamentEnabled')
  ) {
    const enabled = next.summerLeagueEnabled === true;
    push(
      'summerLeague',
      'Summer League',
      enabled
        ? 'The annual July Summer League begins with preliminary games, a championship final, and tournament honors.'
        : 'Summer League has been removed from the July calendar.',
      normalizeComparable(previous.summerLeagueEnabled),
      normalizeComparable(next.summerLeagueEnabled),
    );
  }

  if (valueChanged(previous, next, 'gamesPerSeason')) {
    const games = Number(next.gamesPerSeason ?? 82);
    push(
      'gamesPerSeason',
      'Season Length',
      Number.isFinite(games) ? `${games}-game regular season adopted.` : 'Regular-season length updated.',
      normalizeComparable(previous.gamesPerSeason),
      normalizeComparable(next.gamesPerSeason),
    );
  }

  if (boolChanged(previous, next, 'threePointLineEnabled') || valueChanged(previous, next, 'threePointLineDistance')) {
    const enabled = next.threePointLineEnabled !== false;
    const distance = Number(next.threePointLineDistance ?? 0);
    const distanceLabel = enabled && distance > 0 ? ` at ${distance} ft` : '';
    push(
      'threePointLine',
      '3-Point Line',
      enabled ? `3-point line active${distanceLabel}.` : '3-point line removed from league games.',
      normalizeComparable(previous.threePointLineEnabled),
      normalizeComparable(next.threePointLineEnabled),
    );
  }

  if (boolChanged(previous, next, 'fourPointLine') || valueChanged(previous, next, 'fourPointLineDistance')) {
    const enabled = next.fourPointLine === true;
    const distance = Number(next.fourPointLineDistance ?? 27);
    push(
      'fourPointLine',
      '4-Point Line',
      enabled
        ? `The ${distance}-foot 4-point line enters PBA games for the coming season.`
        : 'The 4-point line is not part of league games for the coming season.',
      normalizeComparable(previous.fourPointLine),
      normalizeComparable(next.fourPointLine),
    );
  }

  if (boolChanged(previous, next, 'handcheckingEnabled')) {
    const enabled = next.handcheckingEnabled === true;
    push(
      'handcheckingEnabled',
      'Perimeter Contact',
      enabled ? 'Hand-checking allowed on the perimeter.' : 'Hand-checking restricted on the perimeter.',
      normalizeComparable(previous.handcheckingEnabled),
      normalizeComparable(next.handcheckingEnabled),
    );
  }

  const defensiveKeys: Array<keyof LeagueStats> = ['illegalZoneDefenseEnabled', 'defensiveThreeSecondEnabled', 'backToBasketTimerEnabled'];
  if (defensiveKeys.some(key => boolChanged(previous, next, key))) {
    const active = [
      next.illegalZoneDefenseEnabled ? 'illegal-defense enforcement' : null,
      next.defensiveThreeSecondEnabled ? 'defensive 3 seconds' : null,
      next.backToBasketTimerEnabled ? 'back-to-basket timer' : null,
    ].filter(Boolean);
    push(
      'defensiveRules',
      'Defensive Rules',
      active.length > 0 ? `Defensive package updated: ${active.join(', ')}.` : 'Defensive package loosened for the new season.',
    );
  }

  if (valueChanged(previous, next, 'minGamesRequirement')) {
    push(
      'minGamesRequirement',
      'Awards Eligibility',
      Number(next.minGamesRequirement ?? 0) > 0
        ? `${next.minGamesRequirement}-game minimum added for major awards.`
        : 'Minimum games requirement removed for major awards.',
      normalizeComparable(previous.minGamesRequirement),
      normalizeComparable(next.minGamesRequirement),
    );
  }

  const allStarEvents: Array<{ key: keyof LeagueStats; label: string }> = [
    { key: 'allStarGameEnabled', label: 'All-Star Game' },
    { key: 'risingStarsEnabled', label: getRisingStarsEventLabel(next) },
    { key: 'celebrityGameEnabled', label: 'Celebrity Game' },
    { key: 'allStarDunkContest', label: 'Dunk Contest' },
    { key: 'allStarDanceContestEnabled', label: 'Dance Contest' },
    { key: 'allStarThreePointContest', label: '3-Point Contest' },
    { key: 'allStarShootingStars', label: 'Shooting Stars' },
    { key: 'allStarSkillsChallenge', label: 'Skills Challenge' },
    { key: 'allStarHorse', label: 'H-O-R-S-E' },
    { key: 'allStarThroneEnabled', label: 'Throne Tournament' },
  ];
  for (const event of allStarEvents) {
    if (!boolChanged(previous, next, event.key)) continue;
    const enabled = next[event.key] === true;
    push(
      `allStar-${String(event.key)}`,
      'All-Star Weekend',
      `${event.label} ${enabled ? 'added to' : 'removed from'} All-Star Weekend.`,
      normalizeComparable(previous[event.key]),
      normalizeComparable(next[event.key]),
    );
  }

  const previousRisingStarsLabel = getRisingStarsEventLabel(previous);
  const nextRisingStarsLabel = getRisingStarsEventLabel(next);
  if (previousRisingStarsLabel !== nextRisingStarsLabel || valueChanged(previous, next, 'risingStarsFormat')) {
    const renamed = previousRisingStarsLabel !== nextRisingStarsLabel
      ? `${previousRisingStarsLabel} renamed ${nextRisingStarsLabel}`
      : `${nextRisingStarsLabel} format updated`;
    push(
      'risingStarsLifecycle',
      'All-Star Weekend',
      `${renamed} for the coming season.`,
      previousRisingStarsLabel,
      nextRisingStarsLabel,
    );
  }

  return updates;
}

export function buildGovernorsBoardMeeting(args: {
  state: Pick<GameState, 'date' | 'leagueStats' | 'teams'>;
  nextLeagueStats: LeagueStats;
  nextTeams: NBATeam[];
  season: number;
}): GovernorsBoardMeeting | null {
  const ruleChanges = buildRuleChanges(args.state.leagueStats, args.nextLeagueStats);
  const teamChanges = buildTeamChanges(args.state.teams, args.nextTeams);
  const majorUpdates = buildMajorUpdates(args.state.leagueStats, args.nextLeagueStats);
  const awardChanges = buildAwardChanges(args.state.leagueStats, args.nextLeagueStats, args.season);
  if (
    ruleChanges.length === 0
    && teamChanges.length === 0
    && majorUpdates.length === 0
    && awardChanges.length === 0
  ) return null;
  return {
    season: args.season,
    generatedAt: args.state.date,
    ruleChanges,
    teamChanges,
    majorUpdates,
    awardChanges,
  };
}
