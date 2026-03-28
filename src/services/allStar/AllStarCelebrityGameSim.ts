import { GameState, GameResult } from '../../types';
import { generateContentWithRetry } from '../llm/utils/api';
import { fetchRatedCelebrities, RatedCelebrity } from '../../data/celebrities';
import { simulateGames } from '../simulationService';
import { SettingsManager } from '../SettingsManager';

export const getCelebrityRosterNames = (state: GameState): string[] => {
  const roster = state.allStar?.celebrityRoster || state.leagueStats.celebrityRoster;
  if (roster && roster.length === 20) {
    return roster;
  }
  return [];
};

export class AllStarCelebrityGameSim {
  static async simulateCelebrityGame(state: GameState): Promise<GameResult> {
    const rosterNames = getCelebrityRosterNames(state);
    
    if (rosterNames.length < 20) {
      throw new Error("Celebrity roster not fully set.");
    }

    const rated = await fetchRatedCelebrities();
    
    // Check if all picks have ratings
    const ratedMap = new Map(
      rated.map(c => [c.name.toLowerCase(), c])
    );
    
    const allRated = rosterNames.every(name => 
      ratedMap.has(name.toLowerCase())
    );
    
    const llmEnabled = SettingsManager.getSettings().enableLLM;

    if (allRated || state.leagueStats.celebrityRosterAutoSelected) {
      // ALL picks are from rated pool — use GameSim
      return this.simulateCelebrityWithGameSim(rosterNames, ratedMap, state);
    } else if (!llmEnabled) {
      // LLM off — fill unrated personas with rock-bottom attributes and use GameSim
      const fallbackRatedMap = new Map(ratedMap);
      for (const name of rosterNames) {
        if (!fallbackRatedMap.has(name.toLowerCase())) {
          fallbackRatedMap.set(name.toLowerCase(), {
            name,
            type: 'celebrity',
            hgt: 20, stre: 20, spd: 20, jmp: 20, endu: 20,
            ins: 20, dnk: 20, ft: 20, fg: 20, tp: 20,
            diq: 20, oiq: 20, drb: 20, pss: 20, reb: 20,
          } as RatedCelebrity);
        }
      }
      return this.simulateCelebrityWithGameSim(rosterNames, fallbackRatedMap, state);
    } else {
      // Some picks from 1000+ CSV — use LLM
      return this.simulateCelebrityWithLLM(rosterNames, state);
    }
  }

  static simulateCelebrityWithGameSim(
    rosterNames: string[],
    ratedMap: Map<string, RatedCelebrity>,
    state: GameState
  ): GameResult {
    // Split into two teams of 10
    const team1Names = rosterNames.slice(0, 10);
    const team2Names = rosterNames.slice(10, 20);

    const toFakePlayer = (name: string, tid: number, index: number) => {
      const r = ratedMap.get(name.toLowerCase());
      if (!r) return null;
      
      return {
        internalId: `celeb-${tid}-${index}`,
        name: r.name,
        tid,
        hgt: r.hgt,
        overallRating: Math.round(
          (r.ins + r.fg + r.tp + r.dnk + r.drb + r.pss) / 6
        ),
        pos: r.hgt > 60 ? 'C' : r.hgt > 45 ? 'F' : 'G',
        age: 30,
        ratings: [{
          ...r,
          ovr: Math.round(
            (r.ins + r.fg + r.tp + r.dnk + r.drb + r.pss) / 6
          ),
          pot: 40,
        }],
        injury: { type: 'Healthy', gamesRemaining: 0 },
        stats: [],
        status: 'Active',
      };
    };

    const team1Players = team1Names.map((n, i) => toFakePlayer(n, -5, i)).filter(Boolean);
    const team2Players = team2Names.map((n, i) => toFakePlayer(n, -6, i)).filter(Boolean);

    const teamNames = state.allStar?.celebrityTeams || ['Team Shannon', 'Team Stephen A'];
    const homeTeamName = teamNames[0];
    const awayTeamName = teamNames[1];

    const fakeTeam1 = { 
      id: -5, 
      name: homeTeamName, 
      strength: 30,
      conference: 'East',
      wins: 0, losses: 0,
      abbrev: homeTeamName.split(' ')[1]?.substring(0, 3).toUpperCase() || 'SHAN'
    };
    const fakeTeam2 = { 
      id: -6, 
      name: awayTeamName,
      strength: 30,
      conference: 'West', 
      wins: 0, losses: 0,
      abbrev: awayTeamName.split(' ')[1]?.substring(0, 3).toUpperCase() || 'SAS'
    };

    const fakeGame = {
      gid: 90002,
      homeTid: -5,
      awayTid: -6,
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: state.date,
      isExhibition: true,
      isCelebrityGame: true,
    };

    const simResult = simulateGames(
      [fakeTeam1, fakeTeam2] as any,
      [...team1Players, ...team2Players] as any,
      [fakeGame] as any,
      state.date,
      50,
      undefined
    );

    const result = simResult.results[0];
    if (!result) return this.fallbackCelebResult(state);

    return {
      ...result,
      gameId: 90002,
      isCelebrityGame: true,
      homeTeamName,
      awayTeamName,
      homeStats: result.homeStats.map(s => ({ ...s, name: s.name, team: 1 })),
      awayStats: result.awayStats.map(s => ({ ...s, name: s.name, team: 2 })),
      mvpName: [...result.homeStats, ...result.awayStats]
        .sort((a, b) => b.pts - a.pts)[0]?.name ?? 'Unknown',
    } as any;
  }

  static fallbackCelebResult(state: GameState): GameResult {
    const teamNames = state.allStar?.celebrityTeams || ['Team Shannon', 'Team Stephen A'];
    return {
      homeTeamId: -5,
      awayTeamId: -6,
      homeScore: 50,
      awayScore: 48,
      homeStats: [],
      awayStats: [],
      mvpName: 'Unknown',
      homeTeamName: teamNames[0],
      awayTeamName: teamNames[1],
      isCelebrityGame: true
    } as any;
  }

  static async simulateCelebrityWithLLM(rosterNames: string[], state: GameState): Promise<GameResult> {
    const team1 = rosterNames.slice(0, 10);
    const team2 = rosterNames.slice(10, 20);

    const teamNames = state.allStar?.celebrityTeams || ['Team Shannon', 'Team Stephen A'];
    const homeTeamName = teamNames[0];
    const awayTeamName = teamNames[1];

    const prompt = `
      You are simulating the NBA All-Star Celebrity Game box score.
      
      Team 1 (home): ${homeTeamName} - Players: ${team1.join(', ')}
      Team 2 (away): ${awayTeamName} - Players: ${team2.join(', ')}
      
      Generate realistic stats for EACH of these specific people based on their known real-world athletic ability.
      Some can actually play (athletes from other sports), most cannot.
      
      Rules:
      - Final score 50-75 pts per team
      - Individual scores 0-18 pts
      - Athletes from other sports score more
      - Musicians/actors shoot poorly
      - One player is the standout MVP
      - Stats must add up correctly (fgm*2 + threePm + ftm = pts)
      
      Return ONLY valid JSON, no markdown:
      {
        "homeScore": 68,
        "awayScore": 61,
        "mvpName": "exact name from roster",
        "homeStats": [
          {
            "name": "exact name from Team 1",
            "pts": 0,
            "reb": 0,
            "ast": 0,
            "stl": 0,
            "blk": 0,
            "tov": 0,
            "fgm": 0,
            "fga": 0,
            "threePm": 0,
            "threePa": 0,
            "ftm": 0,
            "fta": 0,
            "min": 18
          }
        ],
        "awayStats": [
          // same shape for Team 2 players
        ]
      }
    `;

    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });
    const result = JSON.parse(response.text || '{}');

    return {
      homeTeamId: -5,
      awayTeamId: -6,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      homeStats: result.homeStats.map((s: any) => ({ ...s, team: 1, playerId: s.name })),
      awayStats: result.awayStats.map((s: any) => ({ ...s, team: 2, playerId: s.name })),
      mvpName: result.mvpName,
      homeTeamName: homeTeamName,
      awayTeamName: awayTeamName,
      isCelebrityGame: true
    } as any;
  }
}
