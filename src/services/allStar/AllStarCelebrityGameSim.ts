import { GameState, GameResult } from '../../types';
import { generateContentWithRetry } from '../llm/utils/api';
import { fetchRatedCelebrities, fetchRatedCelebritiesForYear, RatedCelebrity } from '../../data/celebrities';
import { simulateGames } from '../simulationService';
import { SettingsManager } from '../SettingsManager';
import { buildExhibitionLeagueStats } from './exhibitionRules';

export const getCelebrityRosterNames = (state: GameState): string[] => {
  const [teamOne, teamTwo] = getCelebrityRosterTeams(state);
  const names = [...teamOne, ...teamTwo];
  if (names.length >= 2) return names;
  return [];
};

export const getCelebrityRosterTeams = (state: GameState): [string[], string[]] => {
  const teamDetails = (state.allStar as any)?.celebrityTeamDetails;
  if (Array.isArray(teamDetails) && teamDetails.length >= 2) {
    const teamOne = Array.isArray(teamDetails[0]?.roster) ? teamDetails[0].roster.filter(Boolean) : [];
    const teamTwo = Array.isArray(teamDetails[1]?.roster) ? teamDetails[1].roster.filter(Boolean) : [];
    if (teamOne.length > 0 && teamTwo.length > 0) return [teamOne, teamTwo];
  }

  const roster = state.allStar?.celebrityRoster || state.leagueStats.celebrityRoster;
  if (!roster || roster.length < 2) return [[], []];
  const splitIndex = roster.length === 20 ? 10 : Math.ceil(roster.length / 2);
  return [roster.slice(0, splitIndex), roster.slice(splitIndex)];
};

export const getCelebrityTeamNames = (state: GameState): [string, string] => {
  const teamDetails = (state.allStar as any)?.celebrityTeamDetails;
  const rawNames = Array.isArray(teamDetails) && teamDetails.length >= 2
    ? [teamDetails[0]?.name, teamDetails[1]?.name]
    : state.allStar?.celebrityTeams || [];
  const home = rawNames[0]?.trim() || 'Celebrity Home';
  const away = rawNames[1]?.trim() || 'Celebrity Away';
  return [home, away];
};

const getCelebrityTeamAbbrev = (name: string, fallback: string): string => {
  const parts = name.trim().split(/\s+/);
  return (parts[1] || parts[0] || fallback).substring(0, 3).toUpperCase();
};

export class AllStarCelebrityGameSim {
  static async simulateCelebrityGame(state: GameState): Promise<GameResult> {
    const rosterNames = getCelebrityRosterNames(state);
    const [teamOne, teamTwo] = getCelebrityRosterTeams(state);
    
    if (teamOne.length === 0 || teamTwo.length === 0 || rosterNames.length < 2) {
      throw new Error("Celebrity roster not fully set.");
    }

    const savedProfiles = state.allStar?.celebrityRosterProfiles ?? [];
    const savedProfileNames = new Set(savedProfiles.map(profile => profile.name.toLowerCase()));
    const needsCatalog = rosterNames.some(name => !savedProfileNames.has(name.toLowerCase()));
    const catalog = needsCatalog
      ? state.leagueType === 'fictional'
        ? await fetchRatedCelebritiesForYear(state.leagueStats.year, 'fictional')
        : await fetchRatedCelebrities()
      : [];
    const ratedMap = new Map(catalog.map(celebrity => [celebrity.name.toLowerCase(), celebrity]));
    for (const profile of savedProfiles) ratedMap.set(profile.name.toLowerCase(), profile);
    
    const allRated = rosterNames.every(name => 
      ratedMap.has(name.toLowerCase())
    );
    
    const llmEnabled = SettingsManager.getSettings().enableLLM;

    if (allRated) {
      return await this.simulateCelebrityWithGameSim(rosterNames, ratedMap, state);
    } else if (state.leagueType === 'fictional' || state.leagueStats.celebrityRosterAutoSelected || !llmEnabled) {
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
      return await this.simulateCelebrityWithGameSim(rosterNames, fallbackRatedMap, state);
    } else {
      // Some picks from 1000+ CSV — use LLM
      try {
        return await this.simulateCelebrityWithLLM(rosterNames, state);
      } catch (error) {
        console.error('Celebrity Game LLM simulation failed; using local fallback.', error);
        return this.fallbackCelebResult(state);
      }
    }
  }

  static async simulateCelebrityWithGameSim(
    rosterNames: string[],
    ratedMap: Map<string, RatedCelebrity>,
    state: GameState
  ): Promise<GameResult> {
    const [team1Names, team2Names] = getCelebrityRosterTeams(state);

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
        imgURL: r.imgUrl,
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

    const [homeTeamName, awayTeamName] = getCelebrityTeamNames(state);
    const threePointAvailable = state.leagueStats?.threePointLineEnabled !== false;

    const fakeTeam1 = { 
      id: -5, 
      name: homeTeamName, 
      strength: 30,
      conference: 'East',
      wins: 0, losses: 0,
      abbrev: getCelebrityTeamAbbrev(homeTeamName, 'SHAN')
    };
    const fakeTeam2 = { 
      id: -6, 
      name: awayTeamName,
      strength: 30,
      conference: 'West', 
      wins: 0, losses: 0,
      abbrev: getCelebrityTeamAbbrev(awayTeamName, 'SAS')
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

    const simResult = await simulateGames(
      [fakeTeam1, fakeTeam2] as any,
      [...team1Players, ...team2Players] as any,
      [fakeGame] as any,
      state.date,
      50,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      state.leagueStats.year,
      buildExhibitionLeagueStats(state.leagueStats, 'celebrity')
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
    const teamNames = getCelebrityTeamNames(state);
    const [teamOne, teamTwo] = getCelebrityRosterTeams(state);
    const threePointAvailable = state.leagueStats?.threePointLineEnabled !== false;
    const buildStats = (names: string[], score: number, team: number) => {
      const rows = names.map((name, index) => {
        const pts = Math.max(0, Math.floor(score / Math.max(1, names.length)) + (index < score % Math.max(1, names.length) ? 1 : 0));
        const threePm = threePointAvailable && pts >= 6 && index % 4 === 0 ? 1 : 0;
        const fgm = Math.max(0, Math.floor((pts - threePm * 3) / 2));
        const ftm = Math.max(0, pts - fgm * 2 - threePm * 3);
        return {
          name,
          playerId: name,
          team,
          min: 18,
          pts,
          reb: Math.max(1, (index * 2) % 7),
          ast: index % 5,
          stl: index % 3 === 0 ? 1 : 0,
          blk: index % 7 === 0 ? 1 : 0,
          tov: index % 4,
          fgm,
          fga: fgm + 2,
          threePm,
          threePa: threePointAvailable ? threePm + 1 : 0,
          ftm,
          fta: ftm + (ftm > 0 ? 1 : 0),
        };
      });
      const drift = score - rows.reduce((sum, row) => sum + row.pts, 0);
      if (rows[0] && drift !== 0) rows[0].pts += drift;
      return rows;
    };
    const homeStats = buildStats(teamOne, 50, 1);
    const awayStats = buildStats(teamTwo, 48, 2);
    const mvpName = [...homeStats, ...awayStats].sort((a, b) => b.pts - a.pts)[0]?.name ?? 'Unknown';
    return {
      gameId: 90002,
      homeTeamId: -5,
      awayTeamId: -6,
      homeScore: 50,
      awayScore: 48,
      homeStats,
      awayStats,
      mvpName,
      homeTeamName: teamNames[0],
      awayTeamName: teamNames[1],
      date: state.date,
      season: state.leagueStats.year,
      isCelebrityGame: true
    } as any;
  }

  static async simulateCelebrityWithLLM(rosterNames: string[], state: GameState): Promise<GameResult> {
    const [team1, team2] = getCelebrityRosterTeams(state);

    const [homeTeamName, awayTeamName] = getCelebrityTeamNames(state);
    const threePointAvailable = state.leagueStats?.threePointLineEnabled !== false;

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
      ${threePointAvailable ? '' : '- No three-point line is active: every player must have threePm = 0 and threePa = 0'}
      
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
    const normalizeRow = (row: any, team: number) => {
      if (threePointAvailable) return { ...row, team, playerId: row.name };
      const pts = Math.max(0, Math.round(Number(row?.pts ?? 0)));
      const requestedFtm = Math.max(0, Math.round(Number(row?.ftm ?? 0)));
      const twoMade = Math.max(0, Math.floor((pts - requestedFtm) / 2));
      const ftm = Math.max(0, pts - twoMade * 2);
      return {
        ...row,
        team,
        playerId: row.name,
        pts,
        fgm: twoMade,
        fga: Math.max(twoMade, Math.round(Number(row?.fga ?? twoMade))),
        threePm: 0,
        threePa: 0,
        ftm,
        fta: Math.max(ftm, Math.round(Number(row?.fta ?? ftm))),
      };
    };

    return {
      gameId: 90002,
      homeTeamId: -5,
      awayTeamId: -6,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      homeStats: (Array.isArray(result.homeStats) ? result.homeStats : []).map((s: any) => normalizeRow(s, 1)),
      awayStats: (Array.isArray(result.awayStats) ? result.awayStats : []).map((s: any) => normalizeRow(s, 2)),
      mvpName: result.mvpName,
      homeTeamName: homeTeamName,
      awayTeamName: awayTeamName,
      date: state.date,
      season: state.leagueStats.year,
      isCelebrityGame: true
    } as any;
  }
}
