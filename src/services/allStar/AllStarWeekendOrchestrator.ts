import { NBAPlayer, NBATeam, GameState, GameResult } from '../../types';
import { AllStarCelebrityGameSim } from './AllStarCelebrityGameSim';
import { AllStarDunkContestSim } from './AllStarDunkContestSim';
import { AllStarThreePointContestSim } from './AllStarThreePointContestSim';
import { AllStarShootingStarsSim } from './AllStarShootingStarsSim';
import { AllStarSkillsChallengeSim } from './AllStarSkillsChallengeSim';
import { AllStarHorseSim } from './AllStarHorseSim';
import { AllStarOneOnOneSim } from './AllStarOneOnOneSim';
import { AllStarSelectionService, ALL_STAR_ASSETS } from './AllStarSelectionService';
import { simulateGames } from '../simulationService';
import { resolveSeasonDate } from '../../utils/dateUtils';
import { resolveExhibitionRules } from './exhibitionRules';
export { getExhibitionQL, resolveExhibitionRules } from './exhibitionRules';

/**
 * All-Star Sunday — 3rd Sunday of February of the given season year.
 * Uses resolveSeasonDate so the weekend always lands on real weekdays.
 */
export function getAllStarSunday(year: number): Date {
  return resolveSeasonDate(year, 2, 3, 'Sun', 0);
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
  // Derive the weekend days by offsetting from Sunday — all guaranteed to be real weekdays.
  const shift = (base: Date, days: number) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + days);
    return d;
  };
  const friday = shift(allStarSunday, -2);
  const saturday = shift(allStarSunday, -1);
  const breakStart = shift(allStarSunday, -3); // Thu — blackout starts
  const breakEnd = shift(allStarSunday, 1);    // Mon
  const regularResumes = shift(allStarSunday, 2); // Tue
  // Announcement dates anchored to All-Star Sunday so they always land on the
  // intended weekday regardless of which calendar day Sunday falls on.
  // NBA pattern: starters announced on a Thu, reserves on the following Thu, etc.
  const startersAnnounced   = shift(allStarSunday, -25); // Thu, 3.5 wks before
  const reservesAnnounced   = shift(allStarSunday, -18); // Thu, 2.5 wks before
  const celebrityAnnounced  = shift(allStarSunday, -18); // Thu, 2.5 wks before
  const risingStarsAnnounced = shift(allStarSunday, -11); // Thu, 1.5 wks before
  const dunkContestAnnounced = shift(allStarSunday, -10); // Fri, week before
  const threePointAnnounced  = shift(allStarSunday, -9);  // Sat, week before
  // Voting window — starts mid-December (prior year), ends Thu 4+ weeks before weekend.
  const votingStart = resolveSeasonDate(year, 12, 3, 'Mon', -1); // 3rd Mon of Dec prior yr
  const votingEnd = shift(startersAnnounced, -7); // Thu 1 wk before starters reveal
  
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

// ── Bracket scaffolding (PR2) ─────────────────────────────────────────────
// Reserved gids on Sunday:
//   2-team final-only:                        90001
//   3-team round-robin:    90094, 90095, 90096 (RR) + 90099 (championship)
//   4-team knockout:       90091, 90092       (SFs) + 90099 (final)
// Tids reserved for All-Star bracket teams: -1, -2, -10, -11, -12.
// (-3..-8 are taken by Rising Stars / Celebrity / Dunk / 3PT.)

export interface BracketTeam {
  tid: number;
  bucketKey: string;
  name: string;
  abbrev: string;
  logoUrl: string;
}

export interface BracketLayout {
  teams: BracketTeam[];
  initialGames: { gid: number; homeTid: number; awayTid: number; round: 'rr' | 'sf' | 'final' }[];
  format: string;
  teamCount: number;
}

const EAST_LOGO  = ALL_STAR_ASSETS.eastLogo;
const WEST_LOGO  = ALL_STAR_ASSETS.westLogo;
const USA_LOGO   = ALL_STAR_ASSETS.usaLogo;
const WORLD_LOGO = ALL_STAR_ASSETS.worldLogo;

const captainLastName = (roster: any[], bucketKey: string): string | null => {
  const cap = roster?.find(r => r.conference === bucketKey && r.isCaptain);
  if (!cap?.playerName) return null;
  const parts = String(cap.playerName).split(' ');
  return parts[parts.length - 1];
};

export function buildBracketLayout(leagueStats: any, roster: any[] = []): BracketLayout {
  const format = leagueStats?.allStarFormat ?? 'east_vs_west';
  const teamCount = leagueStats?.allStarTeams ?? 2;

  // 2-team formats — single game, gid 90001
  if (format === 'east_vs_west' || format === 'blacks_vs_whites' || teamCount === 2) {
    const isCaptains = format === 'captains_draft';
    const isUsa = format === 'usa_vs_world';
    const homeName = isCaptains
      ? `Team ${captainLastName(roster, 'East') ?? 'A'}`
      : isUsa ? 'Team USA' : 'Eastern All-Stars';
    const awayName = isCaptains
      ? `Team ${captainLastName(roster, 'West') ?? 'B'}`
      : isUsa ? 'Team World' : 'Western All-Stars';
    const homeAbbrev = isCaptains ? 'CAP1' : isUsa ? 'USA' : 'EAST';
    const awayAbbrev = isCaptains ? 'CAP2' : isUsa ? 'WORLD' : 'WEST';
    return {
      format, teamCount: 2,
      teams: [
        { tid: -1, bucketKey: 'East', name: homeName, abbrev: homeAbbrev, logoUrl: isUsa ? USA_LOGO : EAST_LOGO },
        { tid: -2, bucketKey: 'West', name: awayName, abbrev: awayAbbrev, logoUrl: isUsa ? WORLD_LOGO : WEST_LOGO },
      ],
      initialGames: [{ gid: 90001, homeTid: -1, awayTid: -2, round: 'final' }],
    };
  }

  // 3-team format: real 2026 NBA tournament order — Game 1 fixed (Stars vs World).
  // Games 2 & 3 inject dynamically: Stripes plays Winner-of-Game-1 first, then Loser.
  if (format === 'usa_vs_world' && teamCount === 3) {
    return {
      format, teamCount: 3,
      teams: [
        { tid: -1,  bucketKey: 'USA1',  name: 'USA Stars',   abbrev: 'STAR', logoUrl: USA_LOGO },
        { tid: -2,  bucketKey: 'USA2',  name: 'USA Stripes', abbrev: 'STRP', logoUrl: USA_LOGO },
        { tid: -10, bucketKey: 'WORLD', name: 'Team World',  abbrev: 'WLD',  logoUrl: WORLD_LOGO },
      ],
      initialGames: [
        { gid: 90094, homeTid: -1, awayTid: -10, round: 'rr' }, // Game 1: Stars vs World
      ],
    };
  }

  // 4-team knockout (USA Stars/Stripes vs World A/B)
  if (teamCount === 4) {
    return {
      format, teamCount: 4,
      teams: [
        { tid: -1,  bucketKey: 'USA1',   name: 'USA Stars',   abbrev: 'STAR', logoUrl: USA_LOGO },
        { tid: -2,  bucketKey: 'USA2',   name: 'USA Stripes', abbrev: 'STRP', logoUrl: USA_LOGO },
        { tid: -10, bucketKey: 'WORLD1', name: 'World A',     abbrev: 'WLDA', logoUrl: WORLD_LOGO },
        { tid: -11, bucketKey: 'WORLD2', name: 'World B',     abbrev: 'WLDB', logoUrl: WORLD_LOGO },
      ],
      initialGames: [
        { gid: 90091, homeTid: -1,  awayTid: -11, round: 'sf' }, // Stars vs World B
        { gid: 90092, homeTid: -2,  awayTid: -10, round: 'sf' }, // Stripes vs World A
      ],
    };
  }

  // Fallback to classic
  return {
    format: 'east_vs_west', teamCount: 2,
    teams: [
      { tid: -1, bucketKey: 'East', name: 'Eastern All-Stars', abbrev: 'EAST', logoUrl: EAST_LOGO },
      { tid: -2, bucketKey: 'West', name: 'Western All-Stars', abbrev: 'WEST', logoUrl: WEST_LOGO },
    ],
    initialGames: [{ gid: 90001, homeTid: -1, awayTid: -2, round: 'final' }],
  };
}

export class AllStarWeekendOrchestrator {
  /** Convenience: returns the YYYY-MM-DD bracket of the regular-season blackout window. */
  static getBreakWindowStrings(year: number): { breakStart: string; breakEnd: string; regularResumes: string } {
    const dates = getAllStarWeekendDates(year);
    const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    return {
      breakStart: ymd(dates.breakStart),
      breakEnd: ymd(dates.breakEnd),
      regularResumes: ymd(dates.regularResumes),
    };
  }

  static injectAllStarGames(schedule: any[], teams: any[], year: number, roster: any[], leagueStats: any) {
    const dates = getAllStarWeekendDates(year);
    const rsFormat = leagueStats.risingStarsFormat ?? '4team_tournament';
    const rsIsTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team';

    // For 4-team tournament formats inject two SF games upfront; the final (91099) is dynamic.
    // For all other formats inject the single classic game (90000).
    const risingStarsGames: any[] = rsIsTournament
      ? [
          { gid: 91001, homeTid: -13, awayTid: -16, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true },
          { gid: 91002, homeTid: -14, awayTid: -15, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true },
        ]
      : [
          { gid: 90000, homeTid: -3, awayTid: -4, homeScore: 0, awayScore: 0, played: false, date: toNoonUTC(dates.risingStars), isRisingStars: true, isExhibition: true },
        ];

    // Build the bracket games for this format/teamCount. Returns 1-3 games up front;
    // championship (gid 90099) is injected dynamically once group-stage results are known.
    const bracketLayout = buildBracketLayout(leagueStats, roster);
    const allStarBracketGames = bracketLayout.initialGames.map(g => ({
      ...g,
      date: toNoonUTC(dates.allStarGame),
      isAllStar: true,
      isExhibition: true,
      played: false,
      homeScore: 0,
      awayScore: 0,
    }));

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

    const newGames: any[] = [];
    if (leagueStats.risingStarsEnabled !== false) newGames.push(...risingStarsGames);
    if (leagueStats.allStarGameEnabled !== false) newGames.push(...allStarBracketGames);
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
    const markPlayed = (s: any[]) => s.map(g => g.gid === 90003 ? { ...g, played: true } : g);

    if (state.leagueStats.allStarDunkContest === false) return { allStar: newAllStarState };
    if ((allStar as any).dunkContest?.complete) return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };

    let contestants: NBAPlayer[];

    if (allStar.dunkContestContestants?.length) {
      contestants = allStar.dunkContestContestants
        .map(c => players.find(p => p.internalId === c.internalId))
        .filter((p): p is NBAPlayer => p !== undefined);
      console.log(`[DunkContest] Using pre-announced contestants:`, contestants.map(p => p.name).join(', '));
    } else {
      const numDunkContestants = state.leagueStats.allStarDunkContestPlayers ?? 4;
      contestants = AllStarDunkContestSim.selectContestants(players, numDunkContestants);
      // Write back so tab shows them even before weekend runs
      newAllStarState.dunkContestContestants = contestants;
      console.log(`[DunkContest] Auto-selected ${numDunkContestants}:`, contestants.map(p => p.name).join(', '));
    }

    if (contestants.length < 2) {
      console.warn('[DunkContest] Not enough contestants, skipping');
      return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
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

    return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
  }

  static simulateThreePointContest(state: GameState): Partial<GameState> {
    const allStar = state.allStar!;
    const players = state.players;
    const newAllStarState: any = { ...allStar };
    const markPlayed = (s: any[]) => s.map(g => g.gid === 90004 ? { ...g, played: true } : g);

    if (state.leagueStats.allStarThreePointContest !== false && !(allStar as any).threePointContest?.complete) {
      let contestants: NBAPlayer[];
      
      if (allStar.threePointContestants?.length) {
        contestants = allStar.threePointContestants
          .map(c => players.find(p => p.internalId === (c.internalId || (c as any).playerId)))
          .filter((p): p is NBAPlayer => p !== undefined);
      } else {
        const numThreeContestants = state.leagueStats.allStarThreePointContestPlayers ?? 8;
        contestants = AllStarThreePointContestSim.selectContestants(players, state.leagueStats.year, numThreeContestants);
        newAllStarState.threePointContestants = contestants;
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

    return { allStar: newAllStarState, schedule: markPlayed(state.schedule) };
  }

  static simulateShootingStars(state: GameState): Partial<GameState> {
    const allStar = state.allStar!;
    const ls = state.leagueStats;
    const newAllStarState: any = { ...allStar };
    if (ls.allStarShootingStars !== true) return { allStar: newAllStarState };
    if ((allStar as any).shootingStars?.complete) return { allStar: newAllStarState };

    const totalPlayers = ls.allStarShootingStarsTotalPlayers ?? 12;
    const teamCount   = ls.allStarShootingStarsTeams ?? 3;
    const perTeam     = ls.allStarShootingStarsPlayersPerTeam ?? 3;
    const contestants = AllStarShootingStarsSim.selectContestants(state.players, ls.year, totalPlayers);
    if (contestants.length < teamCount * perTeam) return { allStar: newAllStarState };

    const result = AllStarShootingStarsSim.simulate(contestants, teamCount, perTeam);
    newAllStarState.shootingStars = {
      teams: result.teams,
      winnerTeamId: result.winnerTeamId,
      winnerLabel: result.winnerLabel,
      complete: true,
    };
    return { allStar: newAllStarState };
  }

  static simulateSkillsChallenge(state: GameState): Partial<GameState> {
    const allStar = state.allStar!;
    const ls = state.leagueStats;
    const newAllStarState: any = { ...allStar };
    if (ls.allStarSkillsChallenge !== true) return { allStar: newAllStarState };
    if ((allStar as any).skillsChallenge?.complete) return { allStar: newAllStarState };

    const total = ls.allStarSkillsChallengeTotalPlayers ?? 8;
    const contestants = AllStarSkillsChallengeSim.selectContestants(state.players, ls.year, total);
    if (contestants.length < 2) return { allStar: newAllStarState };

    const result = AllStarSkillsChallengeSim.simulate(contestants);
    newAllStarState.skillsChallenge = {
      contestants: result.contestants,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      complete: true,
    };
    return { allStar: newAllStarState };
  }

  static simulateHorseTournament(state: GameState): Partial<GameState> {
    const allStar = state.allStar!;
    const ls = state.leagueStats;
    const newAllStarState: any = { ...allStar };
    if (ls.allStarHorse !== true) return { allStar: newAllStarState };
    if ((allStar as any).horseTournament?.complete) return { allStar: newAllStarState };

    const n = ls.allStarHorseParticipants ?? 8;
    const contestants = AllStarHorseSim.selectContestants(state.players, ls.year, n);
    if (contestants.length < 2) return { allStar: newAllStarState };

    const result = AllStarHorseSim.simulate(contestants);
    newAllStarState.horseTournament = {
      bracket: result.bracket,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      complete: true,
    };
    return { allStar: newAllStarState };
  }

  static simulateOneOnOneTournament(state: GameState): Partial<GameState> {
    const allStar = state.allStar!;
    const ls = state.leagueStats;
    const newAllStarState: any = { ...allStar };
    if (ls.allStarOneOnOneEnabled !== true) return { allStar: newAllStarState };
    if ((allStar as any).oneOnOneTournament?.complete) return { allStar: newAllStarState };

    const n = ls.allStarOneOnOneParticipants ?? 8;
    const contestants = AllStarOneOnOneSim.selectContestants(state.players, ls.year, n);
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

  static async simulateRisingStars(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const ls = state.leagueStats;
    const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(state.players, ls.year);

    const rsRules = resolveExhibitionRules(ls, 'risingStars');

    const teamNames = allStar.risingStarsTeams || ['Team Rookies', 'Team Sophs'];
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
      logoUrl: EAST_LOGO,
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
      logoUrl: WEST_LOGO,
    };

    const { results } = await simulateGames(
      [fakeTeam1, fakeTeam2] as any,
      [...sophs.map(p => ({ ...p, tid: -3 })), ...rookies.map(p => ({ ...p, tid: -4 }))] as any,
      [game],
      state.date,
      99, // high approval — exhibition scoring
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      ls.year,
      rsRules
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
      awayTeamName,
      homeTeamAbbrev: fakeTeam1.abbrev,
      awayTeamAbbrev: fakeTeam2.abbrev,
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

  /** Scale raw sim scores so the winner exactly hits targetScore. */
  private static scaleToTarget(home: number, away: number, target: number): [number, number] {
    const winner = Math.max(home, away);
    if (winner <= 0) return [target, Math.round(target * 0.8)];
    const loser = Math.min(home, away);
    const scaledLoser = Math.min(Math.round(loser * target / winner), target - 1);
    return home >= away ? [target, scaledLoser] : [scaledLoser, target];
  }

  /**
   * Rising Stars 4-team tournament sim.
   * Formats: '4team_tournament' (legend-coached NBA teams + G League)
   *          'random_4team' (randomly split eligible pool into 4 teams)
   * GIDs: 91001/91002 (SFs, injected at schedule-gen), 91099 (Final, dynamic).
   * SF target score: 40. Final target score: 25.
   */
  static async simulateRisingStarsBracket(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const ls = state.leagueStats;
    const rsFormat = ls.risingStarsFormat ?? '4team_tournament';
    const season = ls.year;

    // Build 4 team descriptors + player pools
    let teamDescriptors: Array<{ tid: number; name: string; abbrev: string; coachName: string; isGLeague: boolean }>;
    let playerPools: NBAPlayer[][];

    if (rsFormat === 'random_4team') {
      const teams = AllStarSelectionService.getRandomRisingStarsRoster(state.players, season, 4);
      teamDescriptors = [
        { tid: -13, name: 'Team Blue',   abbrev: 'BLU', coachName: '', isGLeague: false },
        { tid: -14, name: 'Team Red',    abbrev: 'RED', coachName: '', isGLeague: false },
        { tid: -15, name: 'Team Green',  abbrev: 'GRN', coachName: '', isGLeague: false },
        { tid: -16, name: 'Team Gold',   abbrev: 'GLD', coachName: '', isGLeague: false },
      ];
      playerPools = teams;
    } else {
      const { nbaTeams, gLeaguePlayers, coaches, teamNames, teamAbbrevs } =
        AllStarSelectionService.get4TeamRisingStarsRoster(state.players, season);
      teamDescriptors = [
        { tid: -13, name: teamNames[0], abbrev: teamAbbrevs[0], coachName: coaches[0], isGLeague: false },
        { tid: -14, name: teamNames[1], abbrev: teamAbbrevs[1], coachName: coaches[1], isGLeague: false },
        { tid: -15, name: teamNames[2], abbrev: teamAbbrevs[2], coachName: coaches[2], isGLeague: false },
        { tid: -16, name: teamNames[3], abbrev: teamAbbrevs[3], coachName: coaches[3], isGLeague: true  },
      ];
      playerPools = [...nbaTeams, gLeaguePlayers];
    }

    const rsRules = resolveExhibitionRules(ls, 'risingStars');

    const fakeTeams = teamDescriptors.map(t => ({
      id: t.tid, name: t.name, abbrev: t.abbrev,
      conference: 'East', strength: 80, wins: 0, losses: 0, pop: 5000000,
    }));
    const allPlayers = teamDescriptors.flatMap((t, i) =>
      (playerPools[i] ?? []).map(p => ({ ...p, tid: t.tid }))
    );

    // Seed or recover bracket state. Store playerIds per team so the View Rosters
    // modal + RisingStarsView can render the correct 4-team rosters (the player
    // pool is otherwise only computed during sim and lost afterward).
    const existing = (allStar as any).risingStarsBracket;
    let bracketState: any = existing && existing.format === rsFormat
      ? existing
      : {
          format: rsFormat,
          teams: teamDescriptors.map((t, i) => ({
            ...t,
            wins: 0, losses: 0, pf: 0, pa: 0,
            playerIds: (playerPools[i] ?? []).map(p => p.internalId),
          })),
          games: [
            { gid: 91001, homeTid: -13, awayTid: -16, round: 'sf', targetScore: 40, played: false, homeScore: 0, awayScore: 0 },
            { gid: 91002, homeTid: -14, awayTid: -15, round: 'sf', targetScore: 40, played: false, homeScore: 0, awayScore: 0 },
          ],
          championshipGid: undefined as number | undefined,
          complete: false,
        };
    // Heal pre-fix saves: if we recovered a bracket without playerIds, backfill them now.
    if (bracketState.teams?.some((t: any) => !Array.isArray(t.playerIds) || t.playerIds.length === 0)) {
      bracketState.teams = bracketState.teams.map((t: any, i: number) => ({
        ...t,
        playerIds: t.playerIds && t.playerIds.length > 0 ? t.playerIds : (playerPools[i] ?? []).map(p => p.internalId),
      }));
    }

    let updatedSchedule = [...state.schedule];
    const newBoxScores: any[] = [];

    const simOne = async (gid: number, homeTid: number, awayTid: number, targetScore: number) => {
      const game = {
        gid, homeTid, awayTid,
        homeScore: 0, awayScore: 0, played: false,
        date: toNoonUTC(new Date(state.date)),
        isRisingStars: true, isExhibition: true,
      };
      const { results } = await simulateGames(
        fakeTeams as any,
        allPlayers as any,
        [game],
        state.date,
        99,
        undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined,
        season,
        rsRules
      );
      const raw = results[0];
      if (!raw) return null;

      const [scaledHome, scaledAway] = this.scaleToTarget(raw.homeScore, raw.awayScore, targetScore);
      // Scale quarter scores by the same ratio so the box-score T column matches the
      // scoreboard total (target-mode otherwise leaves raw 140-pt quarters with a 33-pt total).
      const scaleQuarters = (qs: number[] | undefined, raw: number, scaled: number): number[] => {
        if (!qs || qs.length === 0 || raw <= 0) return qs ?? [];
        const ratio = scaled / raw;
        const scaledArr = qs.map(q => Math.max(0, Math.round(q * ratio)));
        const drift = scaled - scaledArr.reduce((a, b) => a + b, 0);
        if (scaledArr.length > 0) scaledArr[scaledArr.length - 1] = Math.max(0, scaledArr[scaledArr.length - 1] + drift);
        return scaledArr;
      };
      const result: any = { ...raw, homeScore: scaledHome, awayScore: scaledAway };
      if (raw.quarterScores) {
        result.quarterScores = {
          home: scaleQuarters(raw.quarterScores.home, raw.homeScore, scaledHome),
          away: scaleQuarters(raw.quarterScores.away, raw.awayScore, scaledAway),
        };
      }

      const homeDesc = teamDescriptors.find(t => t.tid === homeTid);
      const awayDesc = teamDescriptors.find(t => t.tid === awayTid);
      if (homeDesc) { (result as any).homeTeamName = homeDesc.name; (result as any).homeTeamAbbrev = homeDesc.abbrev; }
      if (awayDesc) { (result as any).awayTeamName = awayDesc.name; (result as any).awayTeamAbbrev = awayDesc.abbrev; }

      updatedSchedule = updatedSchedule.map(g =>
        g.gid === gid ? { ...g, played: true, homeScore: scaledHome, awayScore: scaledAway } : g
      );

      const hi = bracketState.teams.findIndex((t: any) => t.tid === homeTid);
      const ai = bracketState.teams.findIndex((t: any) => t.tid === awayTid);
      if (hi >= 0 && ai >= 0) {
        bracketState.teams[hi].pf += scaledHome; bracketState.teams[hi].pa += scaledAway;
        bracketState.teams[ai].pf += scaledAway; bracketState.teams[ai].pa += scaledHome;
        if (scaledHome > scaledAway) { bracketState.teams[hi].wins++; bracketState.teams[ai].losses++; }
        else                          { bracketState.teams[ai].wins++; bracketState.teams[hi].losses++; }
      }

      const topScorer = [
        ...(result.homeStats || []).map((s: any) => ({ ...s, _tname: homeDesc?.name ?? 'home' })),
        ...(result.awayStats  || []).map((s: any) => ({ ...s, _tname: awayDesc?.name ?? 'away' })),
      ].sort((a: any, b: any) => (b.pts || 0) - (a.pts || 0))[0];

      const gIdx = bracketState.games.findIndex((g: any) => g.gid === gid);
      const gameEntry = { gid, homeTid, awayTid, round: gid === 91099 ? 'final' : 'sf', targetScore, played: true, homeScore: scaledHome, awayScore: scaledAway,
        ...(topScorer ? { mvpName: topScorer.name, mvpTeam: topScorer._tname, mvpPts: topScorer.pts || 0 } : {}),
      };
      if (gIdx >= 0) bracketState.games[gIdx] = gameEntry;
      else bracketState.games.push(gameEntry);

      newBoxScores.push(result);
      return result;
    };

    // Simulate unplayed SFs
    for (const g of bracketState.games.filter((g: any) => g.round === 'sf' && !g.played)) {
      await simOne(g.gid, g.homeTid, g.awayTid, 40);
    }

    // Inject + sim final (91099) if not yet present
    const finalAlready = bracketState.games.find((g: any) => g.round === 'final');
    if (!finalAlready) {
      const sfs = bracketState.games.filter((g: any) => g.round === 'sf' && g.played);
      const winners = sfs.map((g: any) => g.homeScore > g.awayScore ? g.homeTid : g.awayTid);
      if (winners.length >= 2) {
        const [homeTid, awayTid] = winners;
        const finalGame = {
          gid: 91099, homeTid, awayTid,
          homeScore: 0, awayScore: 0, played: false,
          date: toNoonUTC(new Date(state.date)),
          isRisingStars: true, isRisingStarsChampionship: true, isExhibition: true,
        };
        updatedSchedule = [...updatedSchedule, finalGame].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        bracketState.games.push({ gid: 91099, homeTid, awayTid, round: 'final', targetScore: 25, played: false, homeScore: 0, awayScore: 0 });
        bracketState.championshipGid = 91099;
        await simOne(91099, homeTid, awayTid, 25);
      }
    } else if (!finalAlready.played) {
      await simOne(finalAlready.gid, finalAlready.homeTid, finalAlready.awayTid, 25);
    }

    bracketState.complete = !!(bracketState.games.find((g: any) => g.round === 'final' && g.played));

    // Extract MVP from Final
    let risingStarsMvp: { name: string; team: string; pts: number } | undefined;
    const finalEntry = bracketState.games.find((g: any) => g.round === 'final' && g.played);
    if (finalEntry?.mvpName) {
      risingStarsMvp = { name: finalEntry.mvpName, team: finalEntry.mvpTeam ?? '', pts: finalEntry.mvpPts ?? 0 };
    }

    return {
      schedule: updatedSchedule,
      boxScores: [...(state.boxScores || []), ...newBoxScores],
      allStar: {
        ...allStar,
        risingStarsGameId: 91099,
        risingStarsBracket: bracketState,
        ...(risingStarsMvp ? { risingStarsMvp } : {}),
      },
    };
  }

  /**
   * PR2: bracket-aware All-Star sim. Sims all unplayed bracket games for today
   * sequentially, tracks records on state.allStar.bracket, then dynamically
   * injects + sims the championship/final once the group stage completes.
   */
  static async simulateAllStarBracket(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const layout = buildBracketLayout(state.leagueStats, allStar.roster ?? []);

    // Build fake teams + per-bucket player pools.
    const fakeTeams = layout.teams.map(t => ({
      id: t.tid, name: t.name, abbrev: t.abbrev, conference: t.tid === -2 ? 'West' : 'East',
      strength: 90, wins: 0, losses: 0, pop: 8000000, logoUrl: t.logoUrl,
    }));
    // Build playerId→bucketKey index once so the per-bucket pool is O(P), not O(P × R).
    const bucketByPlayerId = new Map<string, string>();
    for (const r of allStar.roster) bucketByPlayerId.set(r.playerId, r.conference);
    const playersByBucket = new Map<string, any[]>();
    for (const t of layout.teams) playersByBucket.set(t.bucketKey, []);
    for (const p of state.players) {
      const bucketKey = bucketByPlayerId.get(p.internalId);
      if (!bucketKey) continue;
      const team = layout.teams.find(t => t.bucketKey === bucketKey);
      if (!team) continue;
      playersByBucket.get(bucketKey)!.push({ ...p, tid: team.tid });
    }
    const allBucketPlayers = layout.teams.flatMap(t => playersByBucket.get(t.bucketKey) ?? []);
    const tidToBucket = new Map(layout.teams.map(t => [t.tid, t.bucketKey]));
    const layoutTeamByTid = new Map(layout.teams.map(t => [t.tid, t]));

    // Recover or seed bracket state.
    const existing = (allStar as any).bracket;
    let bracketState: any = existing && existing.format === layout.format && existing.teamCount === layout.teamCount
      ? existing
      : {
          format: layout.format,
          teamCount: layout.teamCount,
          teams: layout.teams.map(t => ({ tid: t.tid, name: t.name, abbrev: t.abbrev, logoUrl: t.logoUrl, wins: 0, losses: 0, pf: 0, pa: 0 })),
          games: layout.initialGames.map(g => ({ ...g, played: false, homeScore: 0, awayScore: 0 })),
          championshipGid: undefined as number | undefined,
          complete: false,
        };

    let updatedSchedule = [...state.schedule];
    const newBoxScores: GameResult[] = [];
    const allStarStatsAccum: any[] = [];

    const simOne = async (gid: number, homeTid: number, awayTid: number) => {
      const game = {
        gid, homeTid, awayTid,
        homeScore: 0, awayScore: 0, played: false,
        date: toNoonUTC(new Date(state.date)),
        isAllStar: true, isExhibition: true,
      };
      // Real 2026 NBA All-Star tournament games are 12 minutes total (not 4 × 12).
      // The sim engine runs 4 fixed quarters, so quarterLength=3 → 4×3=12 min.
      const ls = state.leagueStats;
      const allStarRules = resolveExhibitionRules(ls, 'allStar');
      const { results } = await simulateGames(
        fakeTeams as any,
        allBucketPlayers as any,
        [game],
        state.date,
        99, // max approval — high scoring
        undefined,
        undefined, // allStar
        undefined, // homeOverridePlayers
        undefined, // awayOverridePlayers
        undefined, // riggedForTid
        undefined, // clubDebuffs
        undefined, // currentHeadToHead
        undefined, // otlEnabled
        ls.year,                    // season
        allStarRules
      );
      const result = results[0];
      if (!result) return null;

      // Overwrite generic team names with bracket-team names.
      const homeBracketTeam = layoutTeamByTid.get(homeTid);
      const awayBracketTeam = layoutTeamByTid.get(awayTid);
      if (homeBracketTeam) { (result as any).homeTeamName = homeBracketTeam.name; (result as any).homeTeamAbbrev = homeBracketTeam.abbrev; }
      if (awayBracketTeam) { (result as any).awayTeamName = awayBracketTeam.name; (result as any).awayTeamAbbrev = awayBracketTeam.abbrev; }

      updatedSchedule = updatedSchedule.map(g =>
        g.gid === gid ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g
      );

      // Update records.
      const homeIdx = bracketState.teams.findIndex((t: any) => t.tid === homeTid);
      const awayIdx = bracketState.teams.findIndex((t: any) => t.tid === awayTid);
      if (homeIdx >= 0 && awayIdx >= 0) {
        bracketState.teams[homeIdx].pf += result.homeScore;
        bracketState.teams[homeIdx].pa += result.awayScore;
        bracketState.teams[awayIdx].pf += result.awayScore;
        bracketState.teams[awayIdx].pa += result.homeScore;
        if (result.homeScore > result.awayScore) {
          bracketState.teams[homeIdx].wins += 1;
          bracketState.teams[awayIdx].losses += 1;
        } else {
          bracketState.teams[awayIdx].wins += 1;
          bracketState.teams[homeIdx].losses += 1;
        }
      }
      const gameStats = [
        ...(result.homeStats || []).map((s: any) => ({ ...s, _team: tidToBucket.get(homeTid) ?? 'home' })),
        ...(result.awayStats || []).map((s: any) => ({ ...s, _team: tidToBucket.get(awayTid) ?? 'away' })),
      ];
      const topScorer = gameStats.sort((a: any, b: any) => (b.pts || 0) - (a.pts || 0))[0];
      const mvpFields = topScorer
        ? { mvpName: topScorer.name, mvpTeam: topScorer._team, mvpPts: topScorer.pts || 0 }
        : {};
      const gIdx = bracketState.games.findIndex((g: any) => g.gid === gid);
      if (gIdx >= 0) {
        bracketState.games[gIdx] = { ...bracketState.games[gIdx], played: true, homeScore: result.homeScore, awayScore: result.awayScore, ...mvpFields };
      } else {
        bracketState.games.push({ gid, homeTid, awayTid, round: 'final', played: true, homeScore: result.homeScore, awayScore: result.awayScore, ...mvpFields });
      }
      newBoxScores.push(result);
      allStarStatsAccum.push(
        ...(result.homeStats || []).map((s: any) => ({ ...s, team: tidToBucket.get(homeTid) ?? 'home' })),
        ...(result.awayStats || []).map((s: any) => ({ ...s, team: tidToBucket.get(awayTid) ?? 'away' })),
      );
      return result;
    };

    // 1. Run any unplayed group-stage / SF games on the schedule.
    //    For 3-team usa_vs_world, also dynamically inject Game 2 (Stripes vs Winner)
    //    and Game 3 (Stripes vs Loser) after Game 1 sims.
    const isThreeTeamUsaWorld = layout.format === 'usa_vs_world' && layout.teamCount === 3;
    const groupGames = bracketState.games.filter((g: any) => !g.played && g.round !== 'final');
    for (const g of groupGames) {
      await simOne(g.gid, g.homeTid, g.awayTid);
    }

    // After Game 1 (Stars vs World) finishes for 3-team mode, inject Games 2 & 3.
    if (isThreeTeamUsaWorld) {
      const stripesTid = -2;
      const game1 = bracketState.games.find((g: any) => g.gid === 90094 && g.played);
      const hasGame2 = bracketState.games.some((g: any) => g.gid === 90095);
      if (game1 && !hasGame2) {
        const winnerTid = game1.homeScore > game1.awayScore ? game1.homeTid : game1.awayTid;
        const loserTid  = game1.homeScore > game1.awayScore ? game1.awayTid : game1.homeTid;
        const buildGame = (gid: number, oppTid: number) => ({
          gid, homeTid: stripesTid, awayTid: oppTid, round: 'rr' as const,
          played: false, homeScore: 0, awayScore: 0,
          date: toNoonUTC(new Date(state.date)),
          isAllStar: true, isExhibition: true,
        });
        const game2 = buildGame(90095, winnerTid); // Stripes vs Winner
        const game3 = buildGame(90096, loserTid);  // Stripes vs Loser
        updatedSchedule = [...updatedSchedule, game2, game3].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        bracketState.games.push(
          { gid: 90095, homeTid: stripesTid, awayTid: winnerTid, round: 'rr', played: false, homeScore: 0, awayScore: 0 },
          { gid: 90096, homeTid: stripesTid, awayTid: loserTid,  round: 'rr', played: false, homeScore: 0, awayScore: 0 },
        );
        await simOne(90095, stripesTid, winnerTid);
        await simOne(90096, stripesTid, loserTid);
      }
    }

    // 2. If a championship slot exists, run it; otherwise build it.
    const finalAlready = bracketState.games.find((g: any) => g.round === 'final');

    if (!finalAlready) {
      // Need to derive finalists.
      let homeTid: number | null = null;
      let awayTid: number | null = null;

      if (layout.format === 'usa_vs_world' && layout.teamCount === 3) {
        // Top-2 by wins, tiebreak: head-to-head, then point diff, then coin flip.
        const ranked = [...bracketState.teams].sort((a: any, b: any) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          const diff = (b.pf - b.pa) - (a.pf - a.pa);
          if (diff !== 0) return diff;
          return Math.random() - 0.5;
        });
        homeTid = ranked[0].tid;
        awayTid = ranked[1].tid;
      } else if (layout.teamCount === 4) {
        // SF winners advance.
        const sfs = bracketState.games.filter((g: any) => g.round === 'sf' && g.played);
        const winners = sfs.map((g: any) => g.homeScore > g.awayScore ? g.homeTid : g.awayTid);
        homeTid = winners[0] ?? null;
        awayTid = winners[1] ?? null;
      }

      if (homeTid != null && awayTid != null) {
        const finalGid = 90099;
        const finalGame = {
          gid: finalGid, homeTid, awayTid,
          homeScore: 0, awayScore: 0, played: false,
          date: toNoonUTC(new Date(state.date)),
          isAllStar: true, isAllStarChampionship: true, isExhibition: true,
        };
        // Insert into schedule so daily card renders it.
        updatedSchedule = [...updatedSchedule, finalGame].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        bracketState.games.push({ gid: finalGid, homeTid, awayTid, round: 'final', played: false, homeScore: 0, awayScore: 0 });
        await simOne(finalGid, homeTid, awayTid);
      }
    } else if (!finalAlready.played) {
      await simOne(finalAlready.gid, finalAlready.homeTid, finalAlready.awayTid);
    }

    // Mark complete + pick MVP from championship game (or single 2-team game).
    const finalGame = bracketState.games.find((g: any) => g.round === 'final' && g.played);
    bracketState.complete = !!finalGame;

    let gameMvp: { name: string; team: string } | undefined;
    if (finalGame) {
      const finalResult = newBoxScores.find(b => b.gameId === finalGame.gid);
      if (finalResult) {
        const finalStats = [
          ...(finalResult.homeStats || []).map((s: any) => ({ ...s, team: tidToBucket.get(finalGame.homeTid) ?? 'home' })),
          ...(finalResult.awayStats || []).map((s: any) => ({ ...s, team: tidToBucket.get(finalGame.awayTid) ?? 'away' })),
        ];
        const top = finalStats.sort((a: any, b: any) => (b.pts || 0) - (a.pts || 0))[0];
        if (top) gameMvp = { name: top.name, team: top.team };
      }
    }

    return {
      schedule: updatedSchedule,
      boxScores: [...(state.boxScores || []), ...newBoxScores],
      allStar: {
        ...allStar,
        // Keep allStarGameId set to the deciding game so legacy UI lookups still resolve.
        allStarGameId: finalGame?.gid ?? (allStar as any).allStarGameId,
        bracket: bracketState,
        ...(gameMvp ? { gameMvp } : {}),
      },
    };
  }

  /** @deprecated kept for back-compat — delegates to the bracket sim. */
  static async simulateAllStarGame(state: GameState): Promise<Partial<GameState>> {
    return this.simulateAllStarBracket(state);
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
      
      const rsFormat = currentState.leagueStats.risingStarsFormat ?? '4team_tournament';
      const rsIsTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team';
      const rsUpdate = rsIsTournament
        ? await this.simulateRisingStarsBracket(currentState)
        : await this.simulateRisingStars(currentState);
      if (rsUpdate.boxScores) {
        const newBox = rsUpdate.boxScores.filter(nb => !accumulatedBoxScores.some(ab => ab.gameId === nb.gameId));
        accumulatedBoxScores.push(...newBox);
      }
      currentState = { ...currentState, ...rsUpdate, boxScores: accumulatedBoxScores };
    }
    
    // Saturday: Dunk, 3PT, satellite events
    if (isSaturday) {
      const dunkUpdate = this.simulateDunkContest(currentState);
      currentState = { ...currentState, ...dunkUpdate };

      const threeUpdate = this.simulateThreePointContest(currentState);
      currentState = { ...currentState, ...threeUpdate };

      const ssUpdate = this.simulateShootingStars(currentState);
      currentState = { ...currentState, ...ssUpdate };

      const skillsUpdate = this.simulateSkillsChallenge(currentState);
      currentState = { ...currentState, ...skillsUpdate };

      const horseUpdate = this.simulateHorseTournament(currentState);
      currentState = { ...currentState, ...horseUpdate };

      const oneOnOneUpdate = this.simulateOneOnOneTournament(currentState);
      currentState = { ...currentState, ...oneOnOneUpdate };
    }
    
    // Sunday: All-Star Game
    if (isSunday) {
      const asgUpdate = await this.simulateAllStarBracket(currentState);
      if (asgUpdate.boxScores) {
        const newBox = asgUpdate.boxScores.filter(nb => !accumulatedBoxScores.some(ab => ab.gameId === nb.gameId));
        accumulatedBoxScores.push(...newBox);
      }
      currentState = { ...currentState, ...asgUpdate, boxScores: accumulatedBoxScores };
    }
       if (!currentState.allStar) return {};
    const weekendComplete =
      !!(currentState.allStar as any).bracket?.complete ||
      !!(currentState.allStar as any).risingStarsBracket?.complete ||
      currentState.allStar.allStarGameId !== undefined;

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
