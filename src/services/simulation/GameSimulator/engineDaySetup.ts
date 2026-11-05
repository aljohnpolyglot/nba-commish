import { Game, LeagueStats, NBATeam as Team, NBAPlayer as Player } from '../../../types';
import { getSimulationLockedStrategy as getLockedStrategy } from '../simulationRealmContext';
import { resolveExhibitionRules } from '../../allStar/exhibitionRules';
import { getFourPointDistance } from '../../../utils/ruleFlags';
import { getTwoWayRosterLimit } from '../../../utils/rosterLimits';
import { isTwoWayContract } from '../../../utils/contractTypes';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalGameLimit,
  isWnbaDevelopmentalContract,
} from '../../wnba/developmentalContracts';
import {
  KNOBS_ALL_STAR,
  KNOBS_BLEAGUE,
  KNOBS_CELEBRITY,
  KNOBS_EURO_CLUB_COMPETITION,
  KNOBS_EURO_FRIENDLY,
  KNOBS_EUROLEAGUE,
  KNOBS_PBA,
  KNOBS_PRESEASON,
  KNOBS_RISING_STARS,
  KNOBS_WNBA,
  SimulatorKnobs,
} from '../SimulatorKnobs';
import { EXTERNAL_LEAGUE_STATUSES } from '../../../constants';
import { withDeterministicRandom } from '../deterministicRandom';
import { buildBracketLayout } from '../../allStar/allStarWeekendDates';
import { resolveAllStarExhibitionTeamLogo } from '../../allStar/allStarEventAssets';
import { getLeagueFormerPlayerCaptainCandidates, resolveFormerPlayerCaptains } from '../../allStar/captainPool';
import { getPlayerImage } from '../../../utils/playerImage';

export interface StandingsContext {
  conferenceRank: number;
  gbFromLeader: number;
  gamesRemaining: number;
}

interface ResolveDayGameSetupArgs {
  game: Game;
  teams: Team[];
  players: Player[];
  standingsCtx: Map<number, StandingsContext>;
  leagueBaseKnobs: SimulatorKnobs;
  leagueStats?: Partial<LeagueStats>;
  allStar?: any;
  homeOverridePlayers?: Player[];
  awayOverridePlayers?: Player[];
  simulationSeed?: string;
}

interface ResolveDayGameSetupResult {
  home?: Team;
  away?: Team;
  homeOverride?: Player[];
  awayOverride?: Player[];
  homeKnobs?: SimulatorKnobs;
  awayKnobs?: SimulatorKnobs;
}

const INELIGIBLE_ALL_STAR_FILLER_STATUSES = new Set([
  'Retired',
  ...EXTERNAL_LEAGUE_STATUSES,
]);

export function buildStandingsContext(teams: Team[]): Map<number, StandingsContext> {
  const ctx = new Map<number, StandingsContext>();

  for (const conf of ['East', 'West'] as const) {
    const confTeams = teams
      .filter(team => team.conference === conf)
      .sort((a, b) => {
        const aPct = a.wins / Math.max(1, a.wins + a.losses);
        const bPct = b.wins / Math.max(1, b.wins + b.losses);
        return bPct - aPct || b.wins - a.wins;
      });

    const leader = confTeams[0];
    confTeams.forEach((team, index) => {
      const gb = leader
        ? Math.max(0, ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2)
        : 0;
      ctx.set(team.id, {
        conferenceRank: index + 1,
        gbFromLeader: gb,
        gamesRemaining: Math.max(0, 82 - (team.wins + team.losses)),
      });
    });
  }

  return ctx;
}

function externalKnobsForTid(tid: number): SimulatorKnobs {
  if (tid >= 1000 && tid < 2000) return KNOBS_EUROLEAGUE;
  if (tid >= 5000 && tid < 6000) return KNOBS_EUROLEAGUE;
  if (tid >= 2000 && tid < 3000) return KNOBS_PBA;
  if (tid >= 4000 && tid < 5000) return KNOBS_BLEAGUE;
  if (tid >= 7000 && tid < 9000) return KNOBS_BLEAGUE;
  return KNOBS_BLEAGUE;
}

export function buildPbaCompetitionKnobs(
  leagueBaseKnobs: SimulatorKnobs,
  leagueStats?: Partial<LeagueStats>,
): SimulatorKnobs {
  const fourPointAvailable = leagueStats?.fourPointLine ?? true;
  return {
    ...leagueBaseKnobs,
    ...KNOBS_PBA,
    quarterLength: leagueStats?.quarterLength ?? leagueBaseKnobs.quarterLength ?? 12,
    numQuarters: leagueStats?.numQuarters ?? leagueBaseKnobs.numQuarters ?? 4,
    shotClockSeconds: leagueBaseKnobs.shotClockSeconds,
    threePointAvailable: leagueBaseKnobs.threePointAvailable && KNOBS_PBA.threePointAvailable,
    threePointRateMult: (leagueBaseKnobs.threePointRateMult ?? 1) * (KNOBS_PBA.threePointRateMult ?? 1),
    threePointEfficiencyMult: (leagueBaseKnobs.threePointEfficiencyMult ?? 1) * (KNOBS_PBA.threePointEfficiencyMult ?? 1),
    twoPointEfficiencyMult: (leagueBaseKnobs.twoPointEfficiencyMult ?? 1) * (KNOBS_PBA.twoPointEfficiencyMult ?? 1),
    paceMultiplier: (leagueBaseKnobs.paceMultiplier ?? 1) * (KNOBS_PBA.paceMultiplier ?? 1),
    efficiencyMultiplier: (leagueBaseKnobs.efficiencyMultiplier ?? 1) * (KNOBS_PBA.efficiencyMultiplier ?? 1),
    rimRateMult: (leagueBaseKnobs.rimRateMult ?? 1) * (KNOBS_PBA.rimRateMult ?? 1),
    lowPostRateMult: (leagueBaseKnobs.lowPostRateMult ?? 1) * (KNOBS_PBA.lowPostRateMult ?? 1),
    midRangeRateMult: (leagueBaseKnobs.midRangeRateMult ?? 1) * (KNOBS_PBA.midRangeRateMult ?? 1),
    interiorEffMult: (leagueBaseKnobs.interiorEffMult ?? 1) * (KNOBS_PBA.interiorEffMult ?? 1),
    blockRateMult: (leagueBaseKnobs.blockRateMult ?? 1) * (KNOBS_PBA.blockRateMult ?? 1),
    stealRateMult: (leagueBaseKnobs.stealRateMult ?? 1) * (KNOBS_PBA.stealRateMult ?? 1),
    orbRateMult: (leagueBaseKnobs.orbRateMult ?? 1) * (KNOBS_PBA.orbRateMult ?? 1),
    assistRateMult: (leagueBaseKnobs.assistRateMult ?? 1) * (KNOBS_PBA.assistRateMult ?? 1),
    assistDistributionExponent: KNOBS_PBA.assistDistributionExponent,
    reboundDistributionExponent: KNOBS_PBA.reboundDistributionExponent,
    tovMult: (leagueBaseKnobs.tovMult ?? 1) * (KNOBS_PBA.tovMult ?? 1),
    ftRateMult: (leagueBaseKnobs.ftRateMult ?? 1) * (KNOBS_PBA.ftRateMult ?? 1),
    ftEfficiencyMult: (leagueBaseKnobs.ftEfficiencyMult ?? 1) * (KNOBS_PBA.ftEfficiencyMult ?? 1),
    eraCoachingBias: leagueBaseKnobs.eraCoachingBias ?? KNOBS_PBA.eraCoachingBias,
    fourPointAvailable,
    fourPointRateMult: fourPointAvailable ? Math.max(0.55, Math.min(1.25, Math.pow(27 / Math.max(23, getFourPointDistance(leagueStats)), 0.75))) * (KNOBS_PBA.fourPointRateMult ?? 1) : 0,
    fourPointEfficiencyMult: fourPointAvailable ? Math.max(0.68, Math.min(1.12, Math.pow(27 / Math.max(23, getFourPointDistance(leagueStats)), 0.55))) * (KNOBS_PBA.fourPointEfficiencyMult ?? 1) : 1,
  };
}

export function buildWnbaCompetitionKnobs(
  leagueBaseKnobs: SimulatorKnobs,
): SimulatorKnobs {
  return {
    ...leagueBaseKnobs,
    engineCalibration: KNOBS_WNBA.engineCalibration,
  };
}

function enforceLeagueThreePointAvailability(
  knobs: SimulatorKnobs,
  leagueBaseKnobs: SimulatorKnobs,
  leagueStats?: Partial<LeagueStats>,
): SimulatorKnobs {
  const threePointAvailable =
    leagueStats?.threePointLineEnabled !== false &&
    leagueBaseKnobs.threePointAvailable !== false &&
    knobs.threePointAvailable !== false;

  if (threePointAvailable) return { ...knobs, threePointAvailable: true };
  return { ...knobs, threePointAvailable: false, threePointRateMult: 0 };
}

function buildExhibitionKnobs(
  leagueBaseKnobs: SimulatorKnobs,
  eventKnobs: SimulatorKnobs,
  leagueStats: Partial<LeagueStats> | undefined,
  eventType: 'celebrity' | 'risingStars' | 'allStar',
): SimulatorKnobs {
  return enforceLeagueThreePointAvailability(
    { ...leagueBaseKnobs, ...eventKnobs, ...resolveExhibitionRules(leagueStats ?? {}, eventType) },
    leagueBaseKnobs,
    leagueStats,
  );
}

function externalCompetitionKnobsForTid(
  tid: number,
  leagueBaseKnobs: SimulatorKnobs,
  leagueStats?: Partial<LeagueStats>,
): SimulatorKnobs {
  if (leagueStats?.uiMode === 'euro_isolated') return KNOBS_EURO_CLUB_COMPETITION;
  const isEuroClubCompetition = (tid >= 1000 && tid < 2000) || (tid >= 5000 && tid < 6000);
  if (isEuroClubCompetition) {
    return KNOBS_EURO_CLUB_COMPETITION;
  }
  const isPbaTeam = tid >= 2000 && tid < 3000;
  if (isPbaTeam) {
    return buildPbaCompetitionKnobs(leagueBaseKnobs, leagueStats);
  }
  return {
    ...externalKnobsForTid(tid),
    quarterLength: leagueStats?.quarterLength ?? 12,
    numQuarters: leagueStats?.numQuarters ?? 4,
  };
}

function externalRosterCandidates(tid: number): number[] {
  const ids = [tid];
  if (tid >= 1000 && tid < 2000) ids.push(tid - 1000);
  if (tid >= 1000 && tid < 2000) ids.push(tid + 4000);
  if (tid >= 2000 && tid < 3000) ids.push(tid - 2000);
  if (tid >= 4000 && tid < 5000) ids.push(tid - 4000);
  if (tid >= 5000 && tid < 6000) ids.push(tid - 5000);
  if (tid >= 5000 && tid < 6000) ids.push(tid - 4000);
  if (tid >= 7000 && tid < 8000) ids.push(tid - 7000);
  if (tid >= 8000 && tid < 9000) ids.push(tid - 8000);
  return ids;
}

function externalStatusesForTid(tid: number): Set<string> {
  if (tid >= 1000 && tid < 2000) return new Set(['Euroleague', 'Endesa']);
  if (tid >= 5000 && tid < 6000) return new Set(['Endesa', 'Euroleague']);
  if (tid >= 2000 && tid < 3000) return new Set(['PBA']);
  if (tid >= 4000 && tid < 5000) return new Set(['B-League']);
  if (tid >= 7000 && tid < 8000) return new Set(['China CBA']);
  if (tid >= 8000 && tid < 9000) return new Set(['NBL Australia']);
  return new Set();
}

function buildNonNBATeam(
  tid: number,
  players: Player[],
  showcasePlayerIds?: readonly string[],
  showcaseName?: string,
  allowRosterAliases = true,
): { team: Team; roster: Player[] } | null {
  const showcaseIds = new Set(showcasePlayerIds ?? []);
  const showcaseRoster = showcaseIds.size > 0
    ? players.filter(player => showcaseIds.has(player.internalId))
    : [];
  const candidateTids = new Set(allowRosterAliases ? externalRosterCandidates(tid) : [tid]);
  const expectedStatuses = externalStatusesForTid(tid);
  const clubPlayers = showcaseRoster.length > 0 ? showcaseRoster : players.filter(player => {
    const playerTid = Number((player as any).tid);
    if (!candidateTids.has(playerTid)) return false;
    if (playerTid === tid) return true;
    if (expectedStatuses.size === 0) return true;
    return expectedStatuses.has((player as any).status ?? '');
  });
  if (clubPlayers.length === 0) return null;
  const sorted = [...clubPlayers].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  const top8 = sorted.slice(0, 8);
  const computedStr = top8.length > 0
    ? top8.reduce((sum, player) => sum + (player.overallRating ?? 50), 0) / top8.length
    : 50;
  const synTeam: Team = {
    id: tid,
    name: showcaseName || `Club ${tid}`,
    abbrev: `C${tid}`,
    conference: 'West',
    did: 0,
    wins: 0,
    losses: 0,
    strength: computedStr,
  } as any;
  return { team: synTeam, roster: clubPlayers };
}

function fillAllStarRoster(
  roster: Player[] | undefined,
  otherRoster: Player[] | undefined,
  players: Player[],
  isCelebrityGame?: boolean
): Player[] | undefined {
  if (!roster || roster.length >= 8 || isCelebrityGame) return roster;
  const usedIds = new Set([...(roster || []), ...(otherRoster || [])].map(player => player.internalId));
  const fillers = players
    .filter(player =>
      !usedIds.has(player.internalId) &&
      (player as any).status === 'Active' &&
      (player as any).tid >= 0 &&
      (player as any).tid < 100 &&
      !INELIGIBLE_ALL_STAR_FILLER_STATUSES.has((player as any).status ?? '') &&
      ((player as any).injury?.gamesRemaining ?? 0) === 0
    )
    .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  while (roster.length < 12 && fillers.length > 0) roster.push(fillers.shift()!);
  return roster;
}

function resolveHomeAllStarOverride(game: Game, allStar: any, players: Player[]): Player[] | undefined {
  if (!allStar) return undefined;
  if (game.isCelebrityGame) {
    return (allStar.celebrityRoster || []).slice(0, 10);
  }
  const roster = game.isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);
  const rosterIds = new Set(
    game.isRisingStars
      ? roster
          .filter((player: any) => (
            player.risingStarsTeam === 'Captain 1'
            || player.risingStarsTeam === 'USA'
            || (!player.risingStarsTeam && !player.isRookie)
          ))
          .map((player: any) => player.playerId)
      : roster.filter((player: any) => player.conference === 'East' && !player.isInjuredDNP).map((player: any) => player.playerId)
  );
  return players.filter(player => rosterIds.has(player.internalId));
}

function resolveAwayAllStarOverride(game: Game, allStar: any, players: Player[]): Player[] | undefined {
  if (!allStar) return undefined;
  if (game.isCelebrityGame) {
    return (allStar.celebrityRoster || []).slice(10, 20);
  }
  const roster = game.isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);
  const rosterIds = new Set(
    game.isRisingStars
      ? roster
          .filter((player: any) => (
            player.risingStarsTeam === 'Captain 2'
            || player.risingStarsTeam === 'World'
            || (!player.risingStarsTeam && player.isRookie)
          ))
          .map((player: any) => player.playerId)
      : roster.filter((player: any) => player.conference === 'West' && !player.isInjuredDNP).map((player: any) => player.playerId)
  );
  return players.filter(player => rosterIds.has(player.internalId));
}

export function resolveDayGameSetup({
  game,
  teams,
  players,
  standingsCtx,
  leagueBaseKnobs,
  leagueStats,
  allStar,
  homeOverridePlayers,
  awayOverridePlayers,
  simulationSeed,
}: ResolveDayGameSetupArgs): ResolveDayGameSetupResult {
  const regularLeagueKnobs = leagueStats?.uiMode === 'wnba_isolated'
    ? buildWnbaCompetitionKnobs(leagueBaseKnobs)
    : leagueBaseKnobs;
  let home = teams.find(team => team.id === game.homeTid);
  let away = teams.find(team => team.id === game.awayTid);
  let homeOverride = homeOverridePlayers;
  let awayOverride = awayOverridePlayers;

  const bracketTeams = game.isAllStar
    ? buildBracketLayout(leagueStats, allStar?.roster ?? [], players).teams
    : [];
  const risingStarsCaptains = game.isRisingStars && leagueStats?.risingStarsFormat === 'captains_draft'
    ? resolveFormerPlayerCaptains(
        leagueStats.risingStarsLegendCaptainIds,
        getLeagueFormerPlayerCaptainCandidates(players, teams, leagueStats),
      )
    : [];
  const resolvedExhibitionTeam = (tid: number, fallbackName: string, captainIndex?: number): Team => {
    const bracketTeam = bracketTeams.find(team => team.tid === tid);
    const name = bracketTeam?.name ?? fallbackName;
    const captain = captainIndex == null ? undefined : risingStarsCaptains[captainIndex];
    const captainLogo = captain ? getPlayerImage(captain) : undefined;
    return {
      id: tid,
      name,
      abbrev: bracketTeam?.abbrev ?? name.replace(/^Team\s+/i, '').slice(0, 8).toUpperCase(),
      logoUrl: captainLogo ?? bracketTeam?.logoUrl ?? resolveAllStarExhibitionTeamLogo({
        tid,
        teamName: name,
        season: Number(leagueStats?.year ?? game.season ?? new Date(game.date).getUTCFullYear()),
        useNbaConferenceLogos: leagueStats?.uiMode === 'nba',
        bracketTeams,
      }),
      conference: tid % 2 === 0 ? 'West' : 'East',
      wins: 0,
      losses: 0,
      strength: 75,
    } as Team;
  };

  if (!home && game.homeTid < 0) {
    const teamName = game.homeTid === -1 ? 'East All-Stars' :
      game.homeTid === -3 ? (allStar?.risingStarsTeams?.[0] ?? 'Rising Stars') :
        game.homeTid === -5 ? (allStar?.celebrityTeams?.[0] ?? 'Team Spotlight') : 'All-Stars';
    home = resolvedExhibitionTeam(game.homeTid, teamName, game.isRisingStars ? 0 : undefined);
    if (!homeOverride) homeOverride = resolveHomeAllStarOverride(game, allStar, players);
    homeOverride = fillAllStarRoster(homeOverride, awayOverride, players, game.isCelebrityGame);
    if (game.isCelebrityGame) home = { ...home, logoUrl: getPlayerImage(homeOverride[0]) ?? home.logoUrl };
  }

  if (!away && game.awayTid < 0) {
    const teamName = game.awayTid === -2 ? 'West All-Stars' :
      game.awayTid === -4 ? (allStar?.risingStarsTeams?.[1] ?? 'Rising Stars') :
        game.awayTid === -6 ? (allStar?.celebrityTeams?.[1] ?? 'Team Prime') : 'All-Stars';
    away = resolvedExhibitionTeam(game.awayTid, teamName, game.isRisingStars ? 1 : undefined);
    if (!awayOverride) awayOverride = resolveAwayAllStarOverride(game, allStar, players);
    awayOverride = fillAllStarRoster(awayOverride, homeOverride, players, game.isCelebrityGame);
    if (game.isCelebrityGame) away = { ...away, logoUrl: getPlayerImage(awayOverride[0]) ?? away.logoUrl };
  }

  if (!home && game.homeTid >= 100) {
    const result = buildNonNBATeam(
      game.homeTid,
      players,
      game.internationalShowcasePlayerIds,
      game.internationalShowcaseName,
      leagueStats?.uiMode !== 'euro_isolated',
    );
    if (result) {
      home = result.team;
      if (!homeOverride) homeOverride = result.roster;
    }
  }
  if (!away && game.awayTid >= 100) {
    const result = buildNonNBATeam(
      game.awayTid,
      players,
      game.internationalShowcasePlayerIds,
      game.internationalShowcaseName,
      leagueStats?.uiMode !== 'euro_isolated',
    );
    if (result) {
      away = result.team;
      if (!awayOverride) awayOverride = result.roster;
    }
  }

  if (!home || !away) {
    return { home, away, homeOverride, awayOverride };
  }

  if (game.homeTid === game.awayTid && !homeOverride && !awayOverride) {
    const roster = withDeterministicRandom(
      [simulationSeed ?? 'game', game.gid, game.date, leagueStats?.year ?? '', 'same-team-roster-split'].join(':'),
      () => players
        .filter(player => player.tid === game.homeTid && (!player.injury || player.injury.gamesRemaining <= 0))
        .sort(() => Math.random() - 0.5),
    );
    const mid = Math.floor(roster.length / 2);
    homeOverride = roster.slice(0, mid);
    awayOverride = roster.slice(mid);
  }

  const developmentalContractsActive = areWnbaDevelopmentalContractsEnabled(leagueStats);
  if (
    developmentalContractsActive
    && !game.isPreseason
    && !game.isAllStar
    && !game.isRisingStars
    && !game.isCelebrityGame
  ) {
    const gameLimit = getWnbaDevelopmentalGameLimit(leagueStats);
    const eligible = (player: Player) => !isWnbaDevelopmentalContract(player, leagueStats)
      || Number(player.developmentalGamesPlayed ?? 0) < gameLimit;
    homeOverride = (homeOverride ?? players.filter(player => player.tid === home!.id)).filter(eligible);
    awayOverride = (awayOverride ?? players.filter(player => player.tid === away!.id)).filter(eligible);
  }

  let homeKnobs: SimulatorKnobs;
  let awayKnobs: SimulatorKnobs;

  if (game.isCelebrityGame) {
    homeKnobs = awayKnobs = buildExhibitionKnobs(leagueBaseKnobs, KNOBS_CELEBRITY, leagueStats, 'celebrity');
  } else if (game.isRisingStars) {
    homeKnobs = awayKnobs = buildExhibitionKnobs(leagueBaseKnobs, KNOBS_RISING_STARS, leagueStats, 'risingStars');
  } else if (game.isAllStar) {
    homeKnobs = awayKnobs = buildExhibitionKnobs(leagueBaseKnobs, KNOBS_ALL_STAR, leagueStats, 'allStar');
  } else if (game.euroFriendly) {
    homeKnobs = awayKnobs = KNOBS_EURO_FRIENDLY;
  } else if (game.isPreseason && (game.homeTid >= 100 || game.awayTid >= 100)) {
    const intlTid = game.homeTid >= 100 ? game.homeTid : game.awayTid;
    const isHomeIntl = game.homeTid >= 100;
    const intlKnobs = externalKnobsForTid(intlTid);
    homeKnobs = isHomeIntl ? intlKnobs : KNOBS_PRESEASON;
    awayKnobs = isHomeIntl ? KNOBS_PRESEASON : intlKnobs;
  } else if (game.competitionId || game.homeTid >= 100 || game.awayTid >= 100) {
    homeKnobs = game.homeTid >= 100 ? externalCompetitionKnobsForTid(game.homeTid, leagueBaseKnobs, leagueStats) : leagueBaseKnobs;
    awayKnobs = game.awayTid >= 100 ? externalCompetitionKnobsForTid(game.awayTid, leagueBaseKnobs, leagueStats) : leagueBaseKnobs;
  } else {
    const homeCtx = standingsCtx.get(home.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
    const awayCtx = standingsCtx.get(away.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
    if (game.isPlayIn || game.isPlayoff) {
      const homePtiPo = Math.round(((getLockedStrategy(home.id)?.sliders.ptiPlayoffs ?? 40) / 100) * 4);
      const awayPtiPo = Math.round(((getLockedStrategy(away.id)?.sliders.ptiPlayoffs ?? 40) / 100) * 4);
      homeKnobs = { ...regularLeagueKnobs, ...homeCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true, playThroughInjuries: homePtiPo };
      awayKnobs = { ...regularLeagueKnobs, ...awayCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true, playThroughInjuries: awayPtiPo };
      const twoWayActive = getTwoWayRosterLimit(leagueStats) > 0;
      const isActiveTwoWay = (player: Player) => twoWayActive
        && !developmentalContractsActive
        && isTwoWayContract(player, leagueStats);
      homeOverride = (homeOverride ?? players.filter(player => player.tid === home.id)).filter(player => !isActiveTwoWay(player));
      awayOverride = (awayOverride ?? players.filter(player => player.tid === away.id)).filter(player => !isActiveTwoWay(player));
    } else {
      const homePtiReg = Math.round(((getLockedStrategy(home.id)?.sliders.ptiRegular ?? 0) / 100) * 4);
      const awayPtiReg = Math.round(((getLockedStrategy(away.id)?.sliders.ptiRegular ?? 0) / 100) * 4);
      homeKnobs = { ...regularLeagueKnobs, ...homeCtx, playThroughInjuries: homePtiReg };
      awayKnobs = { ...regularLeagueKnobs, ...awayCtx, playThroughInjuries: awayPtiReg };
    }
  }

  const gameLevelOverrides: Partial<SimulatorKnobs> = {};
  if (game.gameFormat) gameLevelOverrides.gameFormat = game.gameFormat;
  if (typeof game.targetScore === 'number') gameLevelOverrides.targetScore = game.targetScore;
  if (Object.keys(gameLevelOverrides).length > 0) {
    homeKnobs = { ...homeKnobs, ...gameLevelOverrides };
    awayKnobs = { ...awayKnobs, ...gameLevelOverrides };
  }

  homeKnobs = { ...homeKnobs, playersOnCourt: leagueBaseKnobs.playersOnCourt };
  awayKnobs = { ...awayKnobs, playersOnCourt: leagueBaseKnobs.playersOnCourt };

  return { home, away, homeOverride, awayOverride, homeKnobs, awayKnobs };
}
