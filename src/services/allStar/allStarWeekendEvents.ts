import { GameResult, GameState, NBAPlayer } from '../../types';
import { simulateGames } from '../simulationService';
import { AllStarCelebrityGameSim } from './AllStarCelebrityGameSim';
import { AllStarDunkContestSim } from './AllStarDunkContestSim';
import { AllStarHorseSim } from './AllStarHorseSim';
import { AllStarOneOnOneSim } from './AllStarOneOnOneSim';
import { AllStarSelectionService } from './AllStarSelectionService';
import { AllStarShootingStarsSim } from './AllStarShootingStarsSim';
import { AllStarSkillsChallengeSim } from './AllStarSkillsChallengeSim';
import { AllStarThreePointContestSim } from './AllStarThreePointContestSim';
import { resolveExhibitionRules } from './exhibitionRules';
import { announceThroneField, simulateThroneTournament as simulateThroneTournamentImpl } from './throneOrchestrator';
import { ALL_STAR_WEEKEND_LOGOS, buildBracketLayout, getAllStarWeekendDates, toNoonUTC } from './allStarWeekendDates';

export function injectAllStarGames(schedule: any[], teams: any[], year: number, roster: any[], leagueStats: any) {
  const dates = getAllStarWeekendDates(year, leagueStats);
  const rsFormat = leagueStats.risingStarsFormat ?? '4team_tournament';
  const rsIsTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team';
  const allStarRules = resolveExhibitionRules(leagueStats, 'allStar');
  void teams;

  const risingStarsGames: any[] = rsIsTournament
    ? [
        { gid: 91001, homeTid: -13, awayTid: -16, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true, gameFormat: 'target_score', targetScore: 40 },
        { gid: 91002, homeTid: -14, awayTid: -15, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true, gameFormat: 'target_score', targetScore: 40 },
      ]
    : [
        { gid: 90000, homeTid: -3, awayTid: -4, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true },
      ];

  const bracketLayout = buildBracketLayout(leagueStats, roster);
  const allStarBracketGames = bracketLayout.initialGames.map((g) => ({
    ...g,
    date: toNoonUTC(dates.allStarGame),
    isAllStar: true,
    isExhibition: true,
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

  const celebrityGame = { gid: 90002, homeTid: -5, awayTid: -6, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isCelebrityGame: true, isExhibition: true };
  const dunkContest = { gid: 90003, homeTid: -7, awayTid: -7, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isDunkContest: true, isExhibition: true };
  const threePointContest = { gid: 90004, homeTid: -8, awayTid: -8, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isThreePointContest: true, isExhibition: true };
  const throneEvent = { gid: 90005, homeTid: -9, awayTid: -9, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isThroneEvent: true, isExhibition: true };
  const shootingStars = { gid: 90006, homeTid: -10, awayTid: -10, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isShootingStars: true, isExhibition: true };
  const skillsChallenge = { gid: 90007, homeTid: -11, awayTid: -11, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isSkillsChallenge: true, isExhibition: true };
  const horse = { gid: 90008, homeTid: -12, awayTid: -12, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.saturday), isHorseContest: true, isExhibition: true };

  const newGames: any[] = [];
  if (leagueStats.risingStarsEnabled !== false) newGames.push(...risingStarsGames);
  if (leagueStats.allStarGameEnabled !== false) newGames.push(...allStarBracketGames);
  if (leagueStats.celebrityGameEnabled) newGames.push(celebrityGame);
  if (leagueStats.allStarDunkContest !== false) newGames.push(dunkContest);
  if (leagueStats.allStarThreePointContest !== false) newGames.push(threePointContest);
  if (leagueStats.allStarShootingStars !== false) newGames.push(shootingStars);
  if (leagueStats.allStarSkillsChallenge === true) newGames.push(skillsChallenge);
  if (leagueStats.allStarHorse === true) newGames.push(horse);
  if (leagueStats.allStarThroneEnabled === true) newGames.push(throneEvent);

  return [...schedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function simulateCelebrityGame(state: GameState): Promise<Partial<GameState>> {
  const allStar = state.allStar!;
  const newAllStarState: any = { ...allStar };
  const newBoxScores: GameResult[] = [];
  let updatedSchedule = [...state.schedule];

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
    boxScores: [...(state.boxScores ?? []), ...newBoxScores],
    allStar: newAllStarState,
  };
}

export function simulateDunkContest(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const players = state.players;
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90003 ? { ...g, played: true } : g));

  if (state.leagueStats.allStarDunkContest === false) return { allStar: newAllStarState };
  if ((allStar as any).dunkContest?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  let contestants: NBAPlayer[];
  if (allStar.dunkContestContestants?.length) {
    contestants = allStar.dunkContestContestants
      .map((c) => players.find((p) => p.internalId === c.internalId))
      .filter((p): p is NBAPlayer => p !== undefined);
  } else {
    const numDunkContestants = state.leagueStats.allStarDunkContestPlayers ?? 4;
    contestants = AllStarDunkContestSim.selectContestants(players, numDunkContestants);
    newAllStarState.dunkContestContestants = contestants;
  }

  if (contestants.length < 2) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  const result = AllStarDunkContestSim.simulate(contestants);
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
        isWinner: result.winnerId === p.internalId,
        dunkTypes: [...(r1?.dunks.map((d) => d.move) ?? []), ...(r2?.dunks.map((d) => d.move) ?? [])],
      };
    }),
    winnerId: result.winnerId,
    winnerName: result.winnerName,
    mvpDunk: result.mvpDunk,
    log: result.log,
    complete: true,
  };

  return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
}

export function simulateThreePointContest(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const players = state.players;
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90004 ? { ...g, played: true } : g));

  if (state.leagueStats.allStarThreePointContest !== false && !(allStar as any).threePointContest?.complete) {
    let contestants: NBAPlayer[];
    if (allStar.threePointContestants?.length) {
      contestants = allStar.threePointContestants
        .map((c) => players.find((p) => p.internalId === (c.internalId || (c as any).playerId)))
        .filter((p): p is NBAPlayer => p !== undefined);
    } else {
      const numThreeContestants = state.leagueStats.allStarThreePointContestPlayers ?? 8;
      contestants = AllStarThreePointContestSim.selectContestants(players, state.leagueStats.year, numThreeContestants);
      newAllStarState.threePointContestants = contestants;
    }

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
  }

  return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
}

export function simulateShootingStars(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const leagueStats = state.leagueStats;
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90006 ? { ...g, played: true } : g));
  if (leagueStats.allStarShootingStars === false) return { allStar: newAllStarState };
  if ((allStar as any).shootingStars?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  const teamLimit = Math.min(30, Math.max(2, Math.round(leagueStats.allStarShootingStarsTeams ?? Math.round((leagueStats.allStarShootingStarsTotalPlayers ?? 12) / 3))));
  const totalPlayers = teamLimit * 3;
  const perTeam = 3;
  const hostCity = leagueStats.allStarHosts?.find((host: any) => host.year === leagueStats.year)?.city;
  const contestants = ((allStar as any).shootingStarsContestants?.length
    ? (allStar as any).shootingStarsContestants
        .map((c: any) => state.players.find((p) => p.internalId === (c.internalId || c.playerId)))
        .filter((p: NBAPlayer | undefined): p is NBAPlayer => p !== undefined)
    : AllStarShootingStarsSim.selectContestants(state.players, leagueStats.year, totalPlayers, state.teams, state.nonNBATeams ?? [], hostCity));
  newAllStarState.shootingStarsContestants = contestants;
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
  const newAllStarState: any = { ...allStar };
  const markPlayed = (schedule: any[]) => schedule.map((g) => (g.gid === 90007 ? { ...g, played: true } : g));
  if (leagueStats.allStarSkillsChallenge !== true) return { allStar: newAllStarState };
  if ((allStar as any).skillsChallenge?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

  const total = Math.min(30, Math.max(3, Math.round(leagueStats.allStarSkillsChallengeTeams ?? leagueStats.allStarSkillsChallengeTotalPlayers ?? 4)));
  const contestants = ((allStar as any).skillsChallengeContestants?.length
    ? (allStar as any).skillsChallengeContestants
        .map((c: any) => state.players.find((p) => p.internalId === (c.internalId || c.playerId)))
        .filter((p: NBAPlayer | undefined): p is NBAPlayer => p !== undefined)
    : AllStarSkillsChallengeSim.selectContestants(state.players, leagueStats.year, total));
  newAllStarState.skillsChallengeContestants = contestants;
  newAllStarState.skillsChallengeAnnounced = contestants.length > 0;
  if (contestants.length < 2) return { allStar: newAllStarState };

  const result = AllStarSkillsChallengeSim.simulate(contestants);
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
        .filter((p: NBAPlayer | undefined): p is NBAPlayer => p !== undefined)
    : AllStarHorseSim.selectContestants(state.players, leagueStats.year, participantCount, state.teams));
  newAllStarState.horseContestants = contestants;
  newAllStarState.horseAnnounced = contestants.length > 0;
  if (contestants.length < 3) return { allStar: newAllStarState };

  const result = AllStarHorseSim.simulate(contestants, {
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

export function simulateOneOnOneTournament(state: GameState): Partial<GameState> {
  const allStar = state.allStar!;
  const leagueStats = state.leagueStats;
  const newAllStarState: any = { ...allStar };
  if (leagueStats.allStarOneOnOneEnabled !== true) return { allStar: newAllStarState };
  if ((allStar as any).oneOnOneTournament?.complete) return { allStar: newAllStarState };

  const participantCount = leagueStats.allStarOneOnOneParticipants ?? 8;
  const contestants = AllStarOneOnOneSim.selectContestants(state.players, leagueStats.year, participantCount);
  if (contestants.length < 2) return { allStar: newAllStarState };

  const result = AllStarOneOnOneSim.simulate(contestants);
  newAllStarState.oneOnOneTournament = {
    bracket: result.bracket,
    winnerId: result.winnerId,
    winnerName: result.winnerName,
    complete: true,
  };
  return { allStar: newAllStarState };
}

export async function simulateRisingStars(state: GameState): Promise<Partial<GameState>> {
  const allStar = state.allStar!;
  const leagueStats = state.leagueStats;
  const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(state.players, leagueStats.year);
  const rsRules = resolveExhibitionRules(leagueStats, 'risingStars');
  const teamNames = allStar.risingStarsTeams || ['Team Rookies', 'Team Sophs'];
  const homeTeamName = teamNames[0];
  const awayTeamName = teamNames[1];

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
    abbrev: homeTeamName.split(' ')[1]?.substring(0, 3).toUpperCase() || 'USA',
    conference: 'East',
    strength: 75,
    wins: 0,
    losses: 0,
    pop: 5000000,
    logoUrl: ALL_STAR_WEEKEND_LOGOS.east,
  };
  const fakeTeam2 = {
    id: -4,
    name: awayTeamName,
    abbrev: awayTeamName.split(' ')[1]?.substring(0, 3).toUpperCase() || 'WLD',
    conference: 'West',
    strength: 75,
    wins: 0,
    losses: 0,
    pop: 5000000,
    logoUrl: ALL_STAR_WEEKEND_LOGOS.west,
  };

  const { results } = await simulateGames(
    [fakeTeam1, fakeTeam2] as any,
    [...sophs.map((p) => ({ ...p, tid: -3 })), ...rookies.map((p) => ({ ...p, tid: -4 }))] as any,
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

  const finalResult = {
    ...result,
    homeTeamName,
    awayTeamName,
    homeTeamAbbrev: fakeTeam1.abbrev,
    awayTeamAbbrev: fakeTeam2.abbrev,
  };

  return {
    schedule: state.schedule.map((g) => (g.gid === 90000 ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g)),
    boxScores: [...(state.boxScores || []), finalResult],
    allStar: {
      ...allStar,
      risingStarsGameId: 90000,
    },
  };
}
