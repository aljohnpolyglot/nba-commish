import { GameResult, GameState, NBAPlayer } from '../../types';
import { simulateGames } from '../simulationService';
import { AllStarCelebrityGameSim } from './AllStarCelebrityGameSim';
import { AllStarDunkContestSim } from './AllStarDunkContestSim';
import type { JudgeCandidate } from './judges';
import { AllStarHorseSim } from './AllStarHorseSim';
import { AllStarSelectionService } from './AllStarSelectionService';
import {
  getLeagueFormerPlayerCaptainCandidates,
  resolveFormerPlayerCaptains,
} from './captainPool';
import { getAllStarPlayerEligibility, isCurrentNbaPlayer } from './allStarSelectionHelpers';
import {
  AllStarShootingStarsSim,
  shouldUseCrossLeagueShootingStarsFormat,
} from './AllStarShootingStarsSim';
import { AllStarSkillsChallengeSim } from './AllStarSkillsChallengeSim';
import { AllStarThreePointContestSim } from './AllStarThreePointContestSim';
import {
  selectExternalDunkContestants,
  selectExternalSkillsContestants,
  selectExternalThreePointContestants,
} from '../externalLeague/allStarContestSelection';
import { getActiveLeagueTeams } from '../../utils/teamLookup';
import { resolveActiveHeadCoach } from '../staff/activeStaffContracts';
import { resolveHeadCoachMember } from '../staff/coachNameResolver';
import {
  buildPbaAllStarLeagueStats,
  buildPbaAllStarPatch,
  buildPbaContestPatch,
  isPbaAllStarStateLocal,
  isPbaAllStarWeekendPending,
  isPbaImportLike,
} from '../pba/allStar';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDanceContestEnabled,
  isDunkContestEnabled,
  isRisingStarsEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
} from './allStarEventAvailability';
import { simulateDanceContest as runDanceContest } from '../pba/danceContest';
import { buildExhibitionLeagueStats, resolveExhibitionRules } from './exhibitionRules';
import { snapshotAllStarParticipants } from './allStarDeterminism';
import { announceThroneField, simulateThroneTournament as simulateThroneTournamentImpl } from './throneOrchestrator';
import { ALL_STAR_WEEKEND_LOGOS, buildBracketLayout, getAllStarWeekendDates, getBreakWindowStrings, toNoonUTC } from './allStarWeekendDates';
import { normalizeDate } from '../../utils/helpers';

const isInjectedAllStarWeekendGame = (game: any): boolean =>
  !!(
    game?.isAllStar ||
    game?.isRisingStars ||
    game?.isCelebrityGame ||
    game?.isDunkContest ||
    game?.isThreePointContest ||
    game?.isShootingStars ||
    game?.isSkillsChallenge ||
    game?.isHorseContest ||
    game?.isThroneEvent
  );

const PBA_CONTEST_PROFILE = {
  guardSkillsBoost: 3,
  centerDunkPenalty: 4,
};

const isPbaContestPlayer = (player: NBAPlayer): boolean =>
  Number(player.tid) >= 2000 &&
  Number(player.tid) < 3000 &&
  player.status !== 'Retired' &&
  !isPbaImportLike(player);

const isContestPlayerEligible = (player: NBAPlayer, leagueStats: any, teams?: Array<{ id: number }>): boolean =>
  leagueStats?.uiMode === 'pba_isolated'
    ? isPbaContestPlayer(player)
    : getAllStarPlayerEligibility(leagueStats, teams)(player);

export function injectAllStarGames(schedule: any[], teams: any[], year: number, roster: any[], leagueStats: any, players: NBAPlayer[] = []) {
  const dates = getAllStarWeekendDates(year, leagueStats);
  const rsFormat = leagueStats.risingStarsFormat ?? '4team_tournament';
  const rsIsTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team';
  const allStarRules = resolveExhibitionRules(leagueStats, 'allStar');
  const isPbaIsolated = leagueStats?.uiMode === 'pba_isolated';
  const allStarGameEnabled = isAllStarGameEnabled(leagueStats);
  const host = leagueStats.allStarHosts?.find((entry: any) => entry.year === year);
  const hostDetails = {
    ...(host?.city ? { city: host.city } : {}),
    ...(host?.arena ? { venue: host.arena } : {}),
  };
  void teams;

  const risingStarsGames: any[] = rsIsTournament
    ? [
        { gid: 91001, homeTid: -13, awayTid: -16, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true, gameFormat: 'target_score', targetScore: 40, ...hostDetails },
        { gid: 91002, homeTid: -14, awayTid: -15, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true, gameFormat: 'target_score', targetScore: 40, ...hostDetails },
      ]
    : [
        { gid: 90000, homeTid: -3, awayTid: -4, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true, ...hostDetails },
      ];

  const bracketLayout = buildBracketLayout(leagueStats, roster, players);
  const allStarBracketGames = bracketLayout.initialGames.map((g) => ({
    ...g,
    date: toNoonUTC(dates.allStarGame),
    isAllStar: true,
    isExhibition: true,
    ...hostDetails,
    played: false,
    homeScore: 0,
    awayScore: 0,
    ...(allStarRules.gameFormat !== 'timed'
      ? {
          gameFormat: allStarRules.gameFormat,
          targetScore: allStarRules.gameFormat === 'target_score' ? allStarRules.targetScore : undefined,
        }
      : {}),
  }));

  const celebrityGame = { gid: 90002, homeTid: -5, awayTid: -6, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isCelebrityGame: true, isExhibition: true, ...hostDetails };
  const dunkContest = { gid: 90003, homeTid: -7, awayTid: -7, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isDunkContest: true, isExhibition: true, ...hostDetails };
  const threePointContest = { gid: 90004, homeTid: -8, awayTid: -8, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isThreePointContest: true, isExhibition: true, ...hostDetails };
  const throneEvent = { gid: 90005, homeTid: -9, awayTid: -9, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isThroneEvent: true, isExhibition: true, ...hostDetails };
  const shootingStars = { gid: 90006, homeTid: -10, awayTid: -10, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isShootingStars: true, isExhibition: true, ...hostDetails };
  const skillsChallenge = { gid: 90007, homeTid: -11, awayTid: -11, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isSkillsChallenge: true, isExhibition: true, ...hostDetails };
  const horse = { gid: 90008, homeTid: -12, awayTid: -12, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isHorseContest: true, isExhibition: true, ...hostDetails };

  const newGames: any[] = [];
  if (isRisingStarsEnabled(leagueStats)) newGames.push(...risingStarsGames);
  if (allStarGameEnabled) newGames.push(...allStarBracketGames);
  if (isCelebrityGameEnabled(leagueStats)) newGames.push(celebrityGame);
  if (isDunkContestEnabled(leagueStats)) newGames.push(dunkContest);
  if (isThreePointContestEnabled(leagueStats)) newGames.push(threePointContest);
  if (isShootingStarsEnabled(leagueStats)) newGames.push(shootingStars);
  if (isSkillsChallengeEnabled(leagueStats)) newGames.push(skillsChallenge);
  if (allStarGameEnabled && leagueStats.allStarHorse === true) newGames.push(horse);
  if (allStarGameEnabled && leagueStats.allStarThroneEnabled === true) newGames.push(throneEvent);

  const injectedGids = new Set(newGames.map((g) => g.gid));
  const cleanedSchedule = schedule.filter((game) => {
    if (injectedGids.has(game.gid)) return false;
    if (!game.played && isInjectedAllStarWeekendGame(game)) return false;
    if (!isPbaIsolated) return true;
    if (!isInjectedAllStarWeekendGame(game)) return true;
    return !game.isRisingStars && !game.isCelebrityGame;
  });

  return [...cleanedSchedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function prepareAllStarWeekendForWatch(state: GameState): GameState {
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  if (state.leagueStats?.uiMode === 'euro_isolated' || state.allStar?.weekendComplete) return state;
  if (isPba && !isPbaAllStarWeekendPending(state)) return state;
  const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
  const currentDate = normalizeDate(state.date);
  if (currentDate < normalizeDate(dates.breakStart.toISOString()) || currentDate > normalizeDate(dates.breakEnd.toISOString())) return state;

  let preparedState = state;
  if (isPba) {
    const leagueStats = buildPbaAllStarLeagueStats(state.leagueStats);
    const pbaState = { ...state, leagueStats } as GameState;
    const selectionPatch = state.allStar?.reservesAnnounced && isPbaAllStarStateLocal(pbaState, state.allStar)
      ? null
      : buildPbaAllStarPatch(pbaState, state.players);
    const players = selectionPatch?.players ?? state.players;
    const selectedAllStar = selectionPatch?.allStar ?? state.allStar;
    if (!selectedAllStar?.reservesAnnounced) return state;
    preparedState = {
      ...state,
      leagueStats,
      players,
      allStar: buildPbaContestPatch(
        { ...pbaState, players, allStar: selectedAllStar } as GameState,
        players,
        selectedAllStar,
      ),
    };
  }

  if (!preparedState.allStar) return state;
  const hasWeekendGame = preparedState.schedule.some(game => isInjectedAllStarWeekendGame(game));
  if (hasWeekendGame) {
    return preparedState.allStar.gamesInjected
      ? preparedState
      : { ...preparedState, allStar: { ...preparedState.allStar, gamesInjected: true } };
  }
  const schedule = injectAllStarGames(
    preparedState.schedule,
    isPba
      ? (preparedState.nonNBATeams ?? []).filter(team => team.league === 'PBA').map(team => ({ ...team, id: team.tid }))
      : preparedState.teams,
    preparedState.leagueStats.year,
    preparedState.allStar.roster ?? [],
    preparedState.leagueStats,
    preparedState.players,
  );
  const { breakStart, breakEnd } = getBreakWindowStrings(preparedState.leagueStats.year, preparedState.leagueStats);
  return {
    ...preparedState,
    schedule,
    leagueStats: { ...preparedState.leagueStats, allStarBreakStart: breakStart, allStarBreakEnd: breakEnd },
    allStar: { ...preparedState.allStar, gamesInjected: true },
  };
}

export async function simulateCelebrityGame(state: GameState): Promise<Partial<GameState>> {
  const allStar = state.allStar!;
  const newAllStarState: any = { ...allStar };
  const newBoxScores: GameResult[] = [];
  let updatedSchedule = [...state.schedule];
  const hasBoxStats = (box: any): boolean => (box?.homeStats?.length ?? 0) > 0 || (box?.awayStats?.length ?? 0) > 0;

  if (allStar.celebrityGameResult && allStar.celebrityGameId != null) {
    return {
      schedule: updatedSchedule.map(game => game.gid === allStar.celebrityGameId ? { ...game, played: true } : game),
      boxScores: state.boxScores,
      allStar: newAllStarState,
    };
  }

  try {
    const celebResult = await AllStarCelebrityGameSim.simulateCelebrityGame(state);
    updatedSchedule = updatedSchedule.map((g) =>
      g.gid === 90002 ? { ...g, played: true, homeScore: celebResult.homeScore, awayScore: celebResult.awayScore } : g,
    );
    newBoxScores.push(celebResult);
    newAllStarState.celebrityGameId = 90002;
    newAllStarState.celebrityGameResult = celebResult;
  } catch (e) {
    console.error('Failed to simulate celebrity game', e);
  }

  return {
    schedule: updatedSchedule,
    boxScores: [
      ...(state.boxScores ?? []).filter((box: any) =>
        !newBoxScores.some((next: any) => Number((next as any).gameId) === Number(box.gameId)) || hasBoxStats(box),
      ),
      ...newBoxScores,
    ],
    allStar: newAllStarState,
  };
}

export function simulateDanceContest(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  if (!isDanceContestEnabled(state.leagueStats) || allStar.danceContest?.complete) {
    return { allStar: { ...allStar } };
  }
  const danceContest = runDanceContest(allStar.roster ?? []);
  return danceContest
    ? { allStar: { ...allStar, danceContest } }
    : { allStar: { ...allStar } };
}

export const buildDunkJudgePool = (state: GameState, eligiblePlayers: NBAPlayer[]): JudgeCandidate[] => {
  const activeIds = new Set(eligiblePlayers.map(player => player.internalId));
  const wnba = state.leagueStats.uiMode === 'wnba_isolated';
  const pba = state.leagueStats.uiMode === 'pba_isolated';
  const retired = [...state.players, ...(state.historicalPeople ?? [])].filter(player => {
    if (activeIds.has(player.internalId) || (player.status !== 'Retired' && !player.retiredYear && !player.hof)) return false;
    if (wnba) return player.gender === 'female' || String((player as any).league ?? '').toUpperCase() === 'WNBA';
    if (pba) return player.status === 'PBA' || String((player as any).league ?? '').toUpperCase() === 'PBA';
    return player.gender !== 'female' && !['WNBA', 'PBA'].includes(String((player as any).league ?? '').toUpperCase());
  });
  const coaches = getActiveLeagueTeams(state)
    .map(team => resolveActiveHeadCoach(team, state.leagueStats.year) ?? resolveHeadCoachMember(team, state.staff))
    .filter((coach, index, all) => coach && all.findIndex(candidate => candidate?.name === coach.name) === index);
  return [
    ...retired.map(player => ({
      id: player.internalId,
      name: player.name,
      role: player.awards?.some(award => /dunk contest winner/i.test(award.type)) ? 'Past winner' as const : 'Retired player' as const,
      imgURL: player.imgURL,
      priority: player.awards?.some(award => /dunk contest winner/i.test(award.type)) ? 0 : 2,
    })),
    ...coaches.map((coach, index) => ({
      id: coach.id ?? `coach-${index}-${coach.name}`,
      name: coach.name,
      role: 'Coach' as const,
      imgURL: coach.playerPortraitUrl,
      priority: 1,
    })),
    ...eligiblePlayers.map(player => ({
      id: player.internalId,
      name: player.name,
      role: 'Active player' as const,
      imgURL: player.imgURL,
      priority: 3,
    })),
  ];
};

export function simulateDunkContest(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const players = state.players;
  const eligiblePlayers = players.filter(player => isContestPlayerEligible(player, state.leagueStats, state.teams));
  const pbaMode = state.leagueStats?.uiMode === 'pba_isolated';
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90003 ? { ...g, played: true } : g));
  const numDunkContestants = Math.max(4, state.leagueStats.allStarDunkContestPlayers ?? 4);

  if (!isDunkContestEnabled(state.leagueStats)) return { allStar: newAllStarState };
  if ((allStar as any).dunkContest?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  let contestants: NBAPlayer[];
  if (allStar.dunkContestContestants?.length) {
    contestants = allStar.dunkContestContestants
      .map((c) => players.find((p) => p.internalId === (c.internalId || (c as any).playerId)))
      .filter((p): p is NBAPlayer => p !== undefined && isContestPlayerEligible(p, state.leagueStats, state.teams));
  } else {
    contestants = pbaMode
      ? selectExternalDunkContestants(eligiblePlayers, numDunkContestants, PBA_CONTEST_PROFILE)
      : AllStarDunkContestSim.selectContestants(players, numDunkContestants);
    newAllStarState.dunkContestContestants = contestants;
  }
  if (contestants.length < Math.min(4, eligiblePlayers.length)) {
    contestants = pbaMode
      ? selectExternalDunkContestants(eligiblePlayers, numDunkContestants, PBA_CONTEST_PROFILE)
      : AllStarDunkContestSim.selectContestants(players, numDunkContestants);
  }
  newAllStarState.dunkContestContestants = allStar.dunkContestContestants?.length
    ? allStar.dunkContestContestants
    : snapshotAllStarParticipants(contestants);

  if (contestants.length < 2) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  const result = AllStarDunkContestSim.simulate(contestants, buildDunkJudgePool(state, eligiblePlayers));
  const winnerPlayer = contestants.find((p) =>
    p.internalId === result.winnerId || p.name === result.winnerId || p.name === result.winnerName,
  );
  const normalizedWinnerId = winnerPlayer?.internalId ?? result.winnerId;
  const normalizedWinnerName = winnerPlayer?.name ?? result.winnerName;
  newAllStarState.dunkContest = {
    round1: result.round1,
    round2: result.round2,
    contestants: contestants.map((p) => {
      const r1 = result.round1.find((r) => r.playerId === p.internalId);
      const r2 = result.round2.find((r) => r.playerId === p.internalId);
      return {
        playerId: p.internalId,
        playerName: p.name,
        round1Score: r1?.totalScore ?? 0,
        round2Score: r2?.totalScore ?? null,
        isWinner: normalizedWinnerId === p.internalId,
        dunkTypes: [...(r1?.dunks.map((d) => d.move) ?? []), ...(r2?.dunks.map((d) => d.move) ?? [])],
      };
    }),
    winnerId: normalizedWinnerId,
    winnerName: normalizedWinnerName,
    mvpDunk: result.mvpDunk,
    log: result.log,
    judges: result.judges,
    complete: true,
  };

  return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
}

export function simulateThreePointContest(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const players = state.players;
  const eligiblePlayers = players.filter(player => isContestPlayerEligible(player, state.leagueStats, state.teams));
  const externalMode = state.leagueStats?.uiMode === 'pba_isolated' || state.leagueStats?.uiMode === 'wnba_isolated';
  const selectionProfile = state.leagueStats?.uiMode === 'pba_isolated' ? PBA_CONTEST_PROFILE : {};
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90004 ? { ...g, played: true } : g));

  if (!isThreePointContestEnabled(state.leagueStats)) return { allStar: newAllStarState };
  if ((allStar as any).threePointContest?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  let contestants: NBAPlayer[];
  if (allStar.threePointContestants?.length) {
    contestants = allStar.threePointContestants
      .map((c) => players.find((p) => p.internalId === (c.internalId || (c as any).playerId)))
      .filter((p): p is NBAPlayer => p !== undefined && isContestPlayerEligible(p, state.leagueStats, state.teams));
  } else {
    const numThreeContestants = state.leagueStats.allStarThreePointContestPlayers ?? 8;
    contestants = externalMode
      ? selectExternalThreePointContestants(eligiblePlayers, state.leagueStats.year, numThreeContestants, selectionProfile)
      : AllStarThreePointContestSim.selectContestants(players, state.leagueStats.year, numThreeContestants);
    newAllStarState.threePointContestants = contestants;
  }
  if (contestants.length < 3) {
    const numThreeContestants = state.leagueStats.allStarThreePointContestPlayers ?? 8;
    contestants = externalMode
      ? selectExternalThreePointContestants(eligiblePlayers, state.leagueStats.year, numThreeContestants, selectionProfile)
      : AllStarThreePointContestSim.selectContestants(players, state.leagueStats.year, numThreeContestants);
  }
  newAllStarState.threePointContestants = allStar.threePointContestants?.length
    ? allStar.threePointContestants
    : snapshotAllStarParticipants(contestants);

  if (contestants.length >= 3) {
    const result = AllStarThreePointContestSim.simulate(contestants, state.leagueStats.year);
    newAllStarState.threePointContest = {
      contestants: contestants.map((p) => {
        const r1 = result.round1.find((r) => r.playerId === p.internalId);
        const fin = result.finals.find((r) => r.playerId === p.internalId);
        return {
          playerId: p.internalId,
          playerName: p.name,
          round1Score: r1?.score ?? 0,
          finalScore: fin?.score ?? null,
          isWinner: result.winnerId === p.internalId,
        };
      }),
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      log: result.log,
      complete: true,
    };
  }

  return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
}

export function simulateShootingStars(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const leagueStats = state.leagueStats;
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90006 ? { ...g, played: true } : g));
  if (!isShootingStarsEnabled(leagueStats)) return { allStar: newAllStarState };
  if ((allStar as any).shootingStars?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  const teamLimit = Math.min(30, Math.max(2, Math.round(leagueStats.allStarShootingStarsTeams ?? Math.round((leagueStats.allStarShootingStarsTotalPlayers ?? 12) / 3))));
  const totalPlayers = teamLimit * 3;
  const perTeam = 3;
  const hostCity = leagueStats.allStarHosts?.find((host: any) => host.year === leagueStats.year)?.city;
  const contestants = ((allStar as any).shootingStarsContestants?.length
    ? (allStar as any).shootingStarsContestants
        .map((c: any) => state.players.find((p) => p.internalId === (c.internalId || c.playerId)))
        .filter((p: NBAPlayer | undefined): p is NBAPlayer => p !== undefined)
    : AllStarShootingStarsSim.selectContestants(
        state.players,
        leagueStats.year,
        totalPlayers,
        state.teams,
        state.nonNBATeams ?? [],
        hostCity,
        shouldUseCrossLeagueShootingStarsFormat(state),
      ));
  newAllStarState.shootingStarsContestants = (allStar as any).shootingStarsContestants?.length
    ? (allStar as any).shootingStarsContestants
    : snapshotAllStarParticipants(contestants);
  newAllStarState.shootingStarsAnnounced = contestants.length > 0;
  const teamCount = Math.floor(contestants.length / perTeam);
  if (teamCount < 2 || contestants.length < teamCount * perTeam) return { allStar: newAllStarState };

  const result = AllStarShootingStarsSim.simulate(contestants, teamCount, perTeam, state.teams, leagueStats.year);
  newAllStarState.shootingStars = {
    teams: result.teams,
    winnerTeamId: result.winnerTeamId,
    winnerLabel: result.winnerLabel,
    log: result.log,
    runs: result.runs,
    complete: true,
  };
  return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
}

export function simulateSkillsChallenge(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const leagueStats = state.leagueStats;
  const eligiblePlayers = state.players.filter(player => isContestPlayerEligible(player, leagueStats, state.teams));
  const externalMode = leagueStats?.uiMode === 'pba_isolated' || leagueStats?.uiMode === 'wnba_isolated';
  const selectionProfile = leagueStats?.uiMode === 'pba_isolated' ? PBA_CONTEST_PROFILE : {};
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90007 ? { ...g, played: true } : g));
  if (leagueStats.allStarSkillsChallenge !== true) return { allStar: newAllStarState };
  if ((allStar as any).skillsChallenge?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  const total = Math.min(30, Math.max(3, Math.round(leagueStats.allStarSkillsChallengeTeams ?? leagueStats.allStarSkillsChallengeTotalPlayers ?? 4)));
  const contestants = ((allStar as any).skillsChallengeContestants?.length
    ? (allStar as any).skillsChallengeContestants
        .map((c: any) => state.players.find((p) => p.internalId === (c.internalId || c.playerId)))
        .filter((p: NBAPlayer | undefined): p is NBAPlayer => p !== undefined && isContestPlayerEligible(p, leagueStats, state.teams))
    : externalMode
      ? selectExternalSkillsContestants(eligiblePlayers, total, selectionProfile)
      : AllStarSkillsChallengeSim.selectContestants(state.players, leagueStats.year, total));
  if (contestants.length < 2) {
    newAllStarState.skillsChallengeContestants = externalMode
      ? selectExternalSkillsContestants(eligiblePlayers, total, selectionProfile)
      : AllStarSkillsChallengeSim.selectContestants(state.players, leagueStats.year, total);
  }
  const finalContestants = newAllStarState.skillsChallengeContestants ?? contestants;
  newAllStarState.skillsChallengeContestants = (allStar as any).skillsChallengeContestants?.length
    ? (allStar as any).skillsChallengeContestants
    : snapshotAllStarParticipants(finalContestants);
  newAllStarState.skillsChallengeAnnounced = finalContestants.length > 0;
  if (finalContestants.length < 2) return { allStar: newAllStarState };

  const result = AllStarSkillsChallengeSim.simulate(finalContestants);
  newAllStarState.skillsChallenge = {
    contestants: result.contestants,
    winnerId: result.winnerId,
    winnerName: result.winnerName,
    log: result.log,
    runs: result.runs,
    complete: true,
  };
  return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
}

export function simulateHorseTournament(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const leagueStats = state.leagueStats;
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90008 ? { ...g, played: true } : g));
  if (leagueStats.allStarHorse !== true) return { allStar: newAllStarState };
  if ((allStar as any).horseTournament?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  const participantCount = Math.min(10, Math.max(3, Math.round(leagueStats.allStarHorseParticipants ?? 3)));
  const contestants = ((allStar as any).horseContestants?.length
    ? (allStar as any).horseContestants
        .map((c: any) => state.players.find((p) => p.internalId === (c.internalId || c.playerId)))
        .filter((p: NBAPlayer | undefined): p is NBAPlayer => p !== undefined && isCurrentNbaPlayer(p))
    : AllStarHorseSim.selectContestants(state.players, leagueStats.year, participantCount, state.teams));
  const finalContestants = contestants.length >= 3
    ? contestants
    : AllStarHorseSim.selectContestants(state.players, leagueStats.year, participantCount, state.teams);
  newAllStarState.horseContestants = (allStar as any).horseContestants?.length
    ? (allStar as any).horseContestants
    : snapshotAllStarParticipants(finalContestants);
  newAllStarState.horseAnnounced = finalContestants.length > 0;
  if (finalContestants.length < 3) return { allStar: newAllStarState };

  const result = AllStarHorseSim.simulate(finalContestants, {
    noPlayerRepeat: leagueStats.allStarHorseNoPlayerRepeat === true,
    noGlobalRepeat: leagueStats.allStarHorseNoGlobalRepeat === true,
  });
  newAllStarState.horseTournament = {
    contestants: result.contestants,
    attempts: result.attempts,
    winnerId: result.winnerId,
    winnerName: result.winnerName,
    log: result.log,
    complete: true,
  };
  return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
}

export function announceThrone(state: GameState): Partial<GameState> {
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneAnnounced) return {};
  return announceThroneField(state);
}

export function simulateThroneTournament(state: GameState): Partial<GameState> {
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  const patch = simulateThroneTournamentImpl(state);
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90005 ? { ...g, played: true } : g));
  return { ...patch, schedule: markPlayed(state.schedule) };
}

export async function simulateRisingStars(state: GameState): Promise<Partial<GameState>> {
  const allStar = state.allStar!;
  const leagueStats = state.leagueStats;
  const isUsaWorld = leagueStats.risingStarsFormat === 'usa_vs_world';
  const isCaptainsDraft = leagueStats.risingStarsFormat === 'captains_draft';
  const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(state.players, leagueStats.year);
  const { usa, world } = isUsaWorld
    ? AllStarSelectionService.getRisingStarsUsaWorldRoster(state.players, leagueStats.year)
    : { usa: [], world: [] };
  const draftedTeams = isCaptainsDraft
    ? AllStarSelectionService.getRisingStarsCaptainsDraftRoster(state.players, leagueStats.year)
    : [[], []];
  const currentPlayersById = new Map(state.players.map(player => [player.internalId, player]));
  const storedCaptainOne = (allStar.risingStarsRoster ?? [])
    .filter(player => player.risingStarsTeam === 'Captain 1')
    .flatMap(player => currentPlayersById.get(player.playerId) ?? []);
  const storedCaptainTwo = (allStar.risingStarsRoster ?? [])
    .filter(player => player.risingStarsTeam === 'Captain 2')
    .flatMap(player => currentPlayersById.get(player.playerId) ?? []);
  const homePlayers = isUsaWorld
    ? usa
    : isCaptainsDraft
      ? (storedCaptainOne.length > 0 ? storedCaptainOne : draftedTeams[0])
      : sophs;
  const awayPlayers = isUsaWorld
    ? world
    : isCaptainsDraft
      ? (storedCaptainTwo.length > 0 ? storedCaptainTwo : draftedTeams[1])
      : rookies;
  const formerPlayerCaptains = isCaptainsDraft
    ? resolveFormerPlayerCaptains(
        leagueStats.risingStarsLegendCaptainIds,
        getLeagueFormerPlayerCaptainCandidates(state.players, state.teams, leagueStats),
      )
    : [];
  const rsRules = buildExhibitionLeagueStats(leagueStats, 'risingStars');
  const teamNameAt = (index: number, fallback: string) => {
    const value = Array.isArray(allStar.risingStarsTeams) ? allStar.risingStarsTeams[index] : undefined;
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  };
  const teamAbbrev = (name: string, fallback: string) => {
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    return (parts[1] ?? parts[0])?.substring(0, 3).toUpperCase() || fallback;
  };
  const homeTeamName = teamNameAt(0, isUsaWorld ? 'Team USA' : isCaptainsDraft ? 'Team 1' : 'Team Sophomores');
  const awayTeamName = teamNameAt(1, isUsaWorld ? 'Team World' : isCaptainsDraft ? 'Team 2' : 'Team Rookies');
  const hasBoxStats = (box: any): boolean => (box?.homeStats?.length ?? 0) > 0 || (box?.awayStats?.length ?? 0) > 0;

  const game = {
    gid: 90000,
    homeTid: -3,
    awayTid: -4,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: toNoonUTC(new Date(state.date)),
    isRisingStars: true,
    isExhibition: true,
  };

  const fakeTeam1 = {
    id: -3,
    name: homeTeamName,
    abbrev: teamAbbrev(homeTeamName, 'USA'),
    conference: 'East',
    strength: 75,
    wins: 0,
    losses: 0,
    pop: 5000000,
    logoUrl: isUsaWorld
      ? ALL_STAR_WEEKEND_LOGOS.usa
      : isCaptainsDraft
        ? formerPlayerCaptains[0]?.imgURL
        : ALL_STAR_WEEKEND_LOGOS.east,
  };
  const fakeTeam2 = {
    id: -4,
    name: awayTeamName,
    abbrev: teamAbbrev(awayTeamName, 'WLD'),
    conference: 'West',
    strength: 75,
    wins: 0,
    losses: 0,
    pop: 5000000,
    logoUrl: isUsaWorld
      ? ALL_STAR_WEEKEND_LOGOS.world
      : isCaptainsDraft
        ? formerPlayerCaptains[1]?.imgURL
        : ALL_STAR_WEEKEND_LOGOS.west,
  };

  const { results } = await simulateGames(
    [fakeTeam1, fakeTeam2] as any,
    [...homePlayers.map((p) => ({ ...p, tid: -3 })), ...awayPlayers.map((p) => ({ ...p, tid: -4 }))] as any,
    [game],
    state.date,
    99,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    leagueStats.year,
    rsRules,
  );

  const result = results[0];
  if (!result) {
    return {
      allStar: {
        ...allStar,
        risingStarsGameId: 90000,
      },
    };
  }

  const gameStats = [
    ...(result.homeStats || []).map((stat: any) => ({ ...stat, team: homeTeamName })),
    ...(result.awayStats || []).map((stat: any) => ({ ...stat, team: awayTeamName })),
  ];
  const topScorer = gameStats.sort((a: any, b: any) => (b.pts || 0) - (a.pts || 0))[0];

  const finalResult = {
    ...result,
    homeTeamName,
    awayTeamName,
    homeTeamAbbrev: fakeTeam1.abbrev,
    awayTeamAbbrev: fakeTeam2.abbrev,
    ...(topScorer ? { mvpName: topScorer.name } : {}),
  };

  return {
    schedule: state.schedule.map((g) => (g.gid === 90000 ? {
      ...g,
      played: true,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winnerId: result.winnerId,
      tiebreaker: result.tiebreaker,
    } : g)),
    boxScores: [
      ...(state.boxScores || []).filter((box: any) => Number(box.gameId) !== 90000 || hasBoxStats(box)),
      finalResult,
    ],
    allStar: {
      ...allStar,
      risingStarsGameId: 90000,
      ...(topScorer ? {
        risingStarsMvp: {
          playerId: topScorer.playerId,
          name: topScorer.name,
          team: topScorer.team,
          pts: topScorer.pts || 0,
        },
      } : {}),
    },
  };
}
