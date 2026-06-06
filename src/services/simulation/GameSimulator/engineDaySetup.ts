import { Game, LeagueStats, NBATeam as Team, NBAPlayer as Player } from '../../../types';
import { getLockedStrategy } from '../../../store/coachStrategyLockStore';
import { resolveExhibitionRules } from '../../allStar/exhibitionRules';
import { getFourPointDistance } from '../../../utils/ruleFlags';
import {
  KNOBS_ALL_STAR,
  KNOBS_BLEAGUE,
  KNOBS_CELEBRITY,
  KNOBS_EURO_CLUB_COMPETITION,
  KNOBS_EUROLEAGUE,
  KNOBS_PBA,
  KNOBS_PRESEASON,
  KNOBS_RISING_STARS,
  SimulatorKnobs,
} from '../SimulatorKnobs';

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
  'WNBA',
  'Euroleague',
  'PBA',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
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

function externalCompetitionKnobsForTid(tid: number, leagueStats?: Partial<LeagueStats>): SimulatorKnobs {
  const isEuroClubCompetition = (tid >= 1000 && tid < 2000) || (tid >= 5000 && tid < 6000);
  if (isEuroClubCompetition) {
    return KNOBS_EURO_CLUB_COMPETITION;
  }
  const isPbaTeam = tid >= 2000 && tid < 3000;
  const fourPointAvailable = isPbaTeam ? (leagueStats?.fourPointLine ?? true) : undefined;
  return {
    ...externalKnobsForTid(tid),
    quarterLength: leagueStats?.quarterLength ?? 12,
    numQuarters: leagueStats?.numQuarters ?? 4,
    ...(isPbaTeam
      ? {
          fourPointAvailable,
          fourPointRateMult: fourPointAvailable ? Math.max(0.55, Math.min(1.25, Math.pow(27 / Math.max(23, getFourPointDistance(leagueStats)), 0.75))) : 0,
          fourPointEfficiencyMult: fourPointAvailable ? Math.max(0.68, Math.min(1.12, Math.pow(27 / Math.max(23, getFourPointDistance(leagueStats)), 0.55))) : 1,
        }
      : {}),
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

function buildNonNBATeam(tid: number, players: Player[]): { team: Team; roster: Player[] } | null {
  const candidateTids = new Set(externalRosterCandidates(tid));
  const expectedStatuses = externalStatusesForTid(tid);
  const clubPlayers = players.filter(player => {
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
    name: `Club ${tid}`,
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
    return (allStar.celebrityRoster || []).filter((player: any) => player.team === 'Shannon');
  }
  const roster = game.isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);
  const rosterIds = new Set(
    game.isRisingStars
      ? roster.slice(0, 10).map((player: any) => player.playerId)
      : roster.filter((player: any) => player.conference === 'East').map((player: any) => player.playerId)
  );
  return players.filter(player => rosterIds.has(player.internalId));
}

function resolveAwayAllStarOverride(game: Game, allStar: any, players: Player[]): Player[] | undefined {
  if (!allStar) return undefined;
  if (game.isCelebrityGame) {
    return (allStar.celebrityRoster || []).filter((player: any) => player.team === 'StephenA');
  }
  const roster = game.isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);
  const rosterIds = new Set(
    game.isRisingStars
      ? roster.slice(10, 20).map((player: any) => player.playerId)
      : roster.filter((player: any) => player.conference === 'West').map((player: any) => player.playerId)
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
}: ResolveDayGameSetupArgs): ResolveDayGameSetupResult {
  let home = teams.find(team => team.id === game.homeTid);
  let away = teams.find(team => team.id === game.awayTid);
  let homeOverride = homeOverridePlayers;
  let awayOverride = awayOverridePlayers;

  if (!home && game.homeTid < 0) {
    const teamName = game.homeTid === -1 ? 'East All-Stars' :
      game.homeTid === -3 ? 'Team USA' :
        game.homeTid === -5 ? 'Team Shannon' : 'All-Stars';
    home = { id: game.homeTid, name: teamName } as any;
    if (!homeOverride) homeOverride = resolveHomeAllStarOverride(game, allStar, players);
    homeOverride = fillAllStarRoster(homeOverride, awayOverride, players, game.isCelebrityGame);
  }

  if (!away && game.awayTid < 0) {
    const teamName = game.awayTid === -2 ? 'West All-Stars' :
      game.awayTid === -4 ? 'Team World' :
        game.awayTid === -6 ? 'Team Stephen A' : 'All-Stars';
    away = { id: game.awayTid, name: teamName } as any;
    if (!awayOverride) awayOverride = resolveAwayAllStarOverride(game, allStar, players);
    awayOverride = fillAllStarRoster(awayOverride, homeOverride, players, game.isCelebrityGame);
  }

  if (!home && game.homeTid >= 100) {
    const result = buildNonNBATeam(game.homeTid, players);
    if (result) {
      home = result.team;
      if (!homeOverride) homeOverride = result.roster;
    }
  }
  if (!away && game.awayTid >= 100) {
    const result = buildNonNBATeam(game.awayTid, players);
    if (result) {
      away = result.team;
      if (!awayOverride) awayOverride = result.roster;
    }
  }

  if (!home || !away) {
    return { home, away, homeOverride, awayOverride };
  }

  if (game.homeTid === game.awayTid && !homeOverride && !awayOverride) {
    const roster = players
      .filter(player => player.tid === game.homeTid && (!player.injury || player.injury.gamesRemaining <= 0))
      .sort(() => Math.random() - 0.5);
    const mid = Math.floor(roster.length / 2);
    homeOverride = roster.slice(0, mid);
    awayOverride = roster.slice(mid);
  }

  let homeKnobs: SimulatorKnobs;
  let awayKnobs: SimulatorKnobs;

  if (game.isCelebrityGame) {
    homeKnobs = awayKnobs = { ...KNOBS_CELEBRITY, ...resolveExhibitionRules(leagueStats ?? {}, 'celebrity') };
  } else if (game.isRisingStars) {
    homeKnobs = awayKnobs = { ...KNOBS_RISING_STARS, ...resolveExhibitionRules(leagueStats ?? {}, 'risingStars') };
  } else if (game.isAllStar) {
    homeKnobs = awayKnobs = { ...KNOBS_ALL_STAR, ...resolveExhibitionRules(leagueStats ?? {}, 'allStar') };
  } else if (game.isPreseason && (game.homeTid >= 100 || game.awayTid >= 100)) {
    const intlTid = game.homeTid >= 100 ? game.homeTid : game.awayTid;
    const isHomeIntl = game.homeTid >= 100;
    const intlKnobs = externalKnobsForTid(intlTid);
    homeKnobs = isHomeIntl ? intlKnobs : KNOBS_PRESEASON;
    awayKnobs = isHomeIntl ? KNOBS_PRESEASON : intlKnobs;
  } else if (game.competitionId || game.homeTid >= 100 || game.awayTid >= 100) {
    homeKnobs = game.homeTid >= 100 ? externalCompetitionKnobsForTid(game.homeTid, leagueStats) : leagueBaseKnobs;
    awayKnobs = game.awayTid >= 100 ? externalCompetitionKnobsForTid(game.awayTid, leagueStats) : leagueBaseKnobs;
  } else {
    const homeCtx = standingsCtx.get(home.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
    const awayCtx = standingsCtx.get(away.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
    if (game.isPlayIn || game.isPlayoff) {
      const homePtiPo = Math.round(((getLockedStrategy(home.id)?.sliders.ptiPlayoffs ?? 40) / 100) * 4);
      const awayPtiPo = Math.round(((getLockedStrategy(away.id)?.sliders.ptiPlayoffs ?? 40) / 100) * 4);
      homeKnobs = { ...leagueBaseKnobs, ...homeCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true, playThroughInjuries: homePtiPo };
      awayKnobs = { ...leagueBaseKnobs, ...awayCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true, playThroughInjuries: awayPtiPo };
      homeOverride = (homeOverride ?? players.filter(player => player.tid === home.id)).filter(player => !(player as any).twoWay);
      awayOverride = (awayOverride ?? players.filter(player => player.tid === away.id)).filter(player => !(player as any).twoWay);
    } else {
      const homePtiReg = Math.round(((getLockedStrategy(home.id)?.sliders.ptiRegular ?? 0) / 100) * 4);
      const awayPtiReg = Math.round(((getLockedStrategy(away.id)?.sliders.ptiRegular ?? 0) / 100) * 4);
      homeKnobs = { ...leagueBaseKnobs, ...homeCtx, playThroughInjuries: homePtiReg };
      awayKnobs = { ...leagueBaseKnobs, ...awayCtx, playThroughInjuries: awayPtiReg };
    }
  }

  const gameLevelOverrides: Partial<SimulatorKnobs> = {};
  if (game.gameFormat) gameLevelOverrides.gameFormat = game.gameFormat;
  if (typeof game.targetScore === 'number') gameLevelOverrides.targetScore = game.targetScore;
  if (Object.keys(gameLevelOverrides).length > 0) {
    homeKnobs = { ...homeKnobs, ...gameLevelOverrides };
    awayKnobs = { ...awayKnobs, ...gameLevelOverrides };
  }

  return { home, away, homeOverride, awayOverride, homeKnobs, awayKnobs };
}
