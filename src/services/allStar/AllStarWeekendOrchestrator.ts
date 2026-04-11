import { NBAPlayer, NBATeam, GameState, GameResult } from '../../types';
import { AllStarCelebrityGameSim } from './AllStarCelebrityGameSim';
import { AllStarDunkContestSim } from './AllStarDunkContestSim';
import { AllStarThreePointContestSim } from './AllStarThreePointContestSim';
import { AllStarSelectionService } from './AllStarSelectionService';
import { simulateGames } from '../simulationService';

export function getAllStarSunday(year: number): Date {
  // Use UTC to avoid timezone-dependent date shifts
  const feb1 = new Date(Date.UTC(year, 1, 1));
  const dayOfWeek = feb1.getUTCDay(); // 0=Sun
  const firstSunday = new Date(feb1);
  firstSunday.setUTCDate(1 + ((7 - dayOfWeek) % 7));
  const thirdSunday = new Date(firstSunday);
  thirdSunday.setUTCDate(firstSunday.getUTCDate() + 14);
  return thirdSunday;
}

const toNoonUTC = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1)
    .padStart(2, '0');
  const day = String(d.getDate())
    .padStart(2, '0');
  return `${year}-${month}-${day}T12:00:00.000Z`;
};

export function getAllStarWeekendDates(year: number): {
  votingStart: Date;
  votingEnd: Date;
  startersAnnounced: Date;
  reservesAnnounced: Date;
  risingStarsAnnounced: Date;
  celebrityAnnounced: Date;
  dunkContestAnnounced: Date;
  threePointAnnounced: Date;
  breakStart: Date;
  risingStars: Date;
  celebrityGame: Date;
  saturday: Date;
  allStarGame: Date;
  breakEnd: Date;
  regularResumes: Date;
} {
  const allStarSunday = getAllStarSunday(year);
  const friday = new Date(allStarSunday);
  friday.setUTCDate(allStarSunday.getUTCDate() - 2);
  const saturday = new Date(allStarSunday);
  saturday.setUTCDate(allStarSunday.getUTCDate() - 1);
  // breakStart = Thursday (day before Rising Stars) so Feb 12 is also blacked out
  // and games are redistributed away from the day before All-Star break.
  const breakStart = new Date(allStarSunday);
  breakStart.setUTCDate(allStarSunday.getUTCDate() - 3); // Thu (one day before Friday Rising Stars)
  const breakEnd = new Date(allStarSunday);
  breakEnd.setUTCDate(allStarSunday.getUTCDate() + 1);
  const regularResumes = new Date(allStarSunday);
  regularResumes.setUTCDate(allStarSunday.getUTCDate() + 2);
  const votingStart = new Date(year - 1, 11, 17);
  const votingEnd = new Date(year, 0, 14);
  const startersAnnounced = new Date(year, 0, 22);
  const reservesAnnounced = new Date(year, 0, 29);
  const risingStarsAnnounced = new Date(year, 1, 1);
  const celebrityAnnounced = new Date(year, 0, 29);
  const dunkContestAnnounced = new Date(year, 1, 5);
  const threePointAnnounced = new Date(year, 1, 8);
  
  return {
    votingStart,
    votingEnd,
    startersAnnounced,
    reservesAnnounced,
    risingStarsAnnounced,
    celebrityAnnounced,
    dunkContestAnnounced,
    threePointAnnounced,
    breakStart,
    risingStars: friday,
    celebrityGame: friday,
    saturday,
    allStarGame: allStarSunday,
    breakEnd,
    regularResumes,
  };
}

export const ALL_STAR_DATES = getAllStarWeekendDates(2026);

export class AllStarWeekendOrchestrator {
  static injectAllStarGames(schedule: any[], teams: any[], year: number, roster: any[], leagueStats: any) {
    const dates = getAllStarWeekendDates(year);
    
    const risingStarsGame = {
      gid: 90000,
      homeTid: -3, // Team USA
      awayTid: -4, // Team World
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: toNoonUTC(dates.risingStars),
      isRisingStars: true,
      isExhibition: true
    };

    const allStarGame = {
      gid: 90001,
      homeTid: -1, // East
      awayTid: -2, // West
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: toNoonUTC(dates.allStarGame),
      isAllStar: true,
      isExhibition: true
    };

    const celebrityGame = {
      gid: 90002,
      homeTid: -5,
      awayTid: -6,
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: toNoonUTC(dates.risingStars),
      isCelebrityGame: true,
      isExhibition: true
    };

    const dunkContest = {
      gid: 90003,
      homeTid: -7,
      awayTid: -7,
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: toNoonUTC(dates.saturday),
      isDunkContest: true,
      isExhibition: true
    };

    const threePointContest = {
      gid: 90004,
      homeTid: -8,
      awayTid: -8,
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: toNoonUTC(dates.saturday),
      isThreePointContest: true,
      isExhibition: true
    };

    // No filtering needed — generateSchedule
    // already avoided these dates.
    // Just add the All-Star special games.
    const filtered = schedule;

    const newGames = [];
    if (leagueStats.risingStarsEnabled !== false) newGames.push(risingStarsGame);
    if (leagueStats.allStarGameEnabled !== false) newGames.push(allStarGame);
    if (leagueStats.celebrityGameEnabled) newGames.push(celebrityGame);
    if (leagueStats.allStarDunkContest !== false) newGames.push(dunkContest);
    if (leagueStats.allStarThreePointContest !== false) newGames.push(threePointContest);

    return [
      ...filtered,
      ...newGames
    ].sort((a, b) => 
      new Date(a.date).getTime() - 
      new Date(b.date).getTime()
    );
  }

  static async simulateCelebrityGame(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const newAllStarState: any = { ...allStar };
    const newBoxScores: GameResult[] = [];
    let updatedSchedule = [...state.schedule];

    try {
      const celebResult = await AllStarCelebrityGameSim.simulateCelebrityGame(state);
      updatedSchedule = updatedSchedule.map(g =>
        g.gid === 90002
          ? { ...g, played: true,
              homeScore: celebResult.homeScore,
              awayScore: celebResult.awayScore }
          : g
      );
      newBoxScores.push(celebResult);
      newAllStarState.celebrityGameId = 90002;
      newAllStarState.celebrityGameResult = celebResult;
    } catch (e) {
      console.error("Failed to simulate celebrity game", e);
    }

    return {
      schedule: updatedSchedule,
      boxScores: [
        ...(state.boxScores ?? []),
        ...newBoxScores
      ],
      allStar: newAllStarState,
    };
  }

  static simulateDunkContest(state: GameState): Partial<GameState> {
    const allStar = state.allStar!;
    const players = state.players;
    const newAllStarState: any = { ...allStar };

    if (state.leagueStats.allStarDunkContest === false) return { allStar: newAllStarState };
    if ((allStar as any).dunkContest?.complete) return { allStar: newAllStarState };

    let contestants: NBAPlayer[];

    if (allStar.dunkContestContestants?.length) {
      contestants = allStar.dunkContestContestants
        .map(c => players.find(p => p.internalId === c.internalId))
        .filter((p): p is NBAPlayer => p !== undefined);
      console.log(`[DunkContest] Using pre-announced contestants:`, contestants.map(p => p.name).join(', '));
    } else {
      contestants = AllStarDunkContestSim.selectContestants(players);
      // Write back so tab shows them even before weekend runs
      newAllStarState.dunkContestContestants = contestants;
      console.log(`[DunkContest] Auto-selected:`, contestants.map(p => p.name).join(', '));
    }

    if (contestants.length < 2) {
      console.warn('[DunkContest] Not enough contestants, skipping');
      return { allStar: newAllStarState };
    }

    const result = AllStarDunkContestSim.simulate(contestants);

    newAllStarState.dunkContest = {
      round1: result.round1,
      round2: result.round2,
      contestants: contestants.map(p => {
        const r1 = result.round1.find(r => r.playerId === p.internalId);
        const r2 = result.round2.find(r => r.playerId === p.internalId);
        return {
          playerId: p.internalId,
          playerName: p.name,
          round1Score: r1?.totalScore ?? 0,
          round2Score: r2?.totalScore ?? null,
          isWinner: result.winnerId === p.internalId,
          dunkTypes: [
            ...(r1?.dunks.map(d => d.move) ?? []),
            ...(r2?.dunks.map(d => d.move) ?? []),
          ],
        };
      }),
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      mvpDunk: result.mvpDunk,
      log: result.log,
      complete: true,
    };

    return { allStar: newAllStarState };
  }

  static simulateThreePointContest(state: GameState): Partial<GameState> {
    const allStar = state.allStar!;
    const players = state.players;
    const newAllStarState: any = { ...allStar };

    if (state.leagueStats.allStarThreePointContest !== false && !(allStar as any).threePointContest?.complete) {
      let contestants: NBAPlayer[];
      
      if (allStar.threePointContestants?.length) {
        contestants = allStar.threePointContestants
          .map(c => players.find(p => p.internalId === (c.internalId || (c as any).playerId)))
          .filter((p): p is NBAPlayer => p !== undefined);
      } else {
        contestants = AllStarThreePointContestSim.selectContestants(players, state.leagueStats.year);
      }

      if (contestants.length >= 3) {
        const result = AllStarThreePointContestSim.simulate(contestants, state.leagueStats.year);
        newAllStarState.threePointContest = {
          contestants: contestants.map(p => {
            const r1 = result.round1.find(r => r.playerId === p.internalId);
            const fin = result.finals.find(r => r.playerId === p.internalId);
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

    return { allStar: newAllStarState };
  }

  static async simulateRisingStars(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(state.players, state.leagueStats.year);
    
    const teamNames = allStar.risingStarsTeams || ['Team USA', 'Team World'];
    const homeTeamName = teamNames[0];
    const awayTeamName = teamNames[1];

    const game = {
      gid: 90000,
      homeTid: -3, // Team 1
      awayTid: -4, // Team 2
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: toNoonUTC(new Date(state.date)),
      isRisingStars: true,
      isExhibition: true
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
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Eastern_Conference_%28NBA%29_logo.svg/200px-Eastern_Conference_%28NBA%29_logo.svg.png'
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
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Western_Conference_%28NBA%29_logo.svg/200px-Western_Conference_%28NBA%29_logo.svg.png'
    };

    const { results } = simulateGames(
      [fakeTeam1, fakeTeam2] as any,
      [...sophs.map(p => ({ ...p, tid: -3 })), ...rookies.map(p => ({ ...p, tid: -4 }))] as any,
      [game],
      state.date,
      state.stats.playerApproval,
      undefined,
      undefined,
      undefined,
      undefined
    );

    const result = results[0];
    if (!result) {
      // Fallback
      return {
        allStar: {
          ...allStar,
          risingStarsGameId: 90000
        }
      };
    }

    const finalResult = {
      ...result,
      homeTeamName,
      awayTeamName
    };

    const updatedSchedule = state.schedule.map(g => 
      g.gid === 90000 ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g
    );

    return {
      schedule: updatedSchedule,
      boxScores: [
        ...(state.boxScores || []),
        finalResult
      ],
      allStar: {
        ...allStar,
        risingStarsGameId: 90000
      }
    };
  }

  static async simulateAllStarGame(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const eastPlayers = state.players.filter(p => allStar.roster.some(r => r.playerId === p.internalId && r.conference === 'East'));
    const westPlayers = state.players.filter(p => allStar.roster.some(r => r.playerId === p.internalId && r.conference === 'West'));

    const game = {
      gid: 90001,
      homeTid: -1, // East
      awayTid: -2, // West
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: toNoonUTC(new Date(state.date)),
      isAllStar: true,
      isExhibition: true
    };

    const fakeEastTeam = {
      id: -1,
      name: 'Eastern All-Stars',
      abbrev: 'EAST',
      conference: 'East',
      strength: 90,
      wins: 0,
      losses: 0,
      pop: 8000000,
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Eastern_Conference_%28NBA%29_logo.svg/200px-Eastern_Conference_%28NBA%29_logo.svg.png'
    };
    const fakeWestTeam = {
      id: -2,
      name: 'Western All-Stars',
      abbrev: 'WEST',
      conference: 'West',
      strength: 90,
      wins: 0,
      losses: 0,
      pop: 8000000,
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Western_Conference_%28NBA%29_logo.svg/200px-Western_Conference_%28NBA%29_logo.svg.png'
    };
    const allStarPlayers = [
      ...eastPlayers.map(p => ({ ...p, tid: -1 })),
      ...westPlayers.map(p => ({ ...p, tid: -2 })),
    ];

    const { results } = simulateGames(
      [fakeEastTeam, fakeWestTeam] as any,
      allStarPlayers as any,
      [game],
      state.date,
      99, // max approval = high scoring
      undefined
    );

    const result = results[0];
    if (!result) return {};

    const updatedSchedule = state.schedule.map(g => 
      g.gid === 90001 ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g
    );

    return {
      schedule: updatedSchedule,
      boxScores: [
        ...(state.boxScores || []),
        result
      ],
      allStar: {
        ...allStar,
        allStarGameId: 90001,
      }
    };
  }

  static async simulateWeekend(
    state: GameState,
    simFlags?: { friday: boolean; saturday: boolean; sunday: boolean }
  ): Promise<Partial<GameState>> {
    if (!state.allStar) return {};

    let currentState = { ...state };
    let accumulatedBoxScores = [...(state.boxScores || [])];

    // Default to simulating all days if no flags provided
    const isFriday = simFlags ? simFlags.friday : true;
    const isSaturday = simFlags ? simFlags.saturday : true;
    const isSunday = simFlags ? simFlags.sunday : true;

    // Friday: Celebrity Game & Rising Stars
    if (isFriday) {
      const celebUpdate = await this.simulateCelebrityGame(currentState);
      if (celebUpdate.boxScores) {
        const newBox = celebUpdate.boxScores.filter(nb => !accumulatedBoxScores.some(ab => ab.gameId === nb.gameId));
        accumulatedBoxScores.push(...newBox);
      }
      currentState = { ...currentState, ...celebUpdate, boxScores: accumulatedBoxScores };
      
      const rsUpdate = await this.simulateRisingStars(currentState);
      if (rsUpdate.boxScores) {
        const newBox = rsUpdate.boxScores.filter(nb => !accumulatedBoxScores.some(ab => ab.gameId === nb.gameId));
        accumulatedBoxScores.push(...newBox);
      }
      currentState = { ...currentState, ...rsUpdate, boxScores: accumulatedBoxScores };
    }
    
    // Saturday: Dunk & 3PT
    if (isSaturday) {
      const dunkUpdate = this.simulateDunkContest(currentState);
      currentState = { ...currentState, ...dunkUpdate };
      
      const threeUpdate = this.simulateThreePointContest(currentState);
      currentState = { ...currentState, ...threeUpdate };
    }
    
    // Sunday: All-Star Game
    if (isSunday) {
      const asgUpdate = await this.simulateAllStarGame(currentState);
      if (asgUpdate.boxScores) {
        const newBox = asgUpdate.boxScores.filter(nb => !accumulatedBoxScores.some(ab => ab.gameId === nb.gameId));
        accumulatedBoxScores.push(...newBox);
      }
      currentState = { ...currentState, ...asgUpdate, boxScores: accumulatedBoxScores };
    }
       if (!currentState.allStar) return {};
    const weekendComplete = currentState.allStar.allStarGameId !== undefined;

    return {
      schedule: currentState.schedule,
      boxScores: accumulatedBoxScores,
      allStar: {
        ...currentState.allStar,
        weekendComplete
      }
    };
  }
}
