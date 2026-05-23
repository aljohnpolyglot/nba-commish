import { Game, GameResult, GameState, NBAPlayer } from '../../types';
import { simulateGames } from '../simulationService';
import { AllStarSelectionService } from './AllStarSelectionService';
import {
  ALL_STAR_DATES,
  buildBracketLayout,
  getBreakWindowStrings,
  getAllStarSunday,
  getAllStarWeekendDates,
  toNoonUTC,
} from './allStarWeekendDates';
import {
  announceThrone,
  injectAllStarGames,
  simulateCelebrityGame,
  simulateDunkContest,
  simulateHorseTournament,
  simulateOneOnOneTournament,
  simulateRisingStars,
  simulateShootingStars,
  simulateSkillsChallenge,
  simulateThreePointContest,
  simulateThroneTournament,
} from './allStarWeekendEvents';
import { simulateWeekendCore } from './allStarWeekendSimulation';
import { resolveExhibitionRules } from './exhibitionRules';

export { getExhibitionQL, resolveExhibitionRules } from './exhibitionRules';
export { ALL_STAR_DATES, buildBracketLayout, getAllStarSunday, getAllStarWeekendDates, getBreakWindowStrings } from './allStarWeekendDates';

export class AllStarWeekendOrchestrator {
  static getBreakWindowStrings = getBreakWindowStrings;
  static injectAllStarGames = injectAllStarGames;
  static simulateCelebrityGame = simulateCelebrityGame;
  static simulateDunkContest = simulateDunkContest;
  static simulateThreePointContest = simulateThreePointContest;
  static simulateShootingStars = simulateShootingStars;
  static simulateSkillsChallenge = simulateSkillsChallenge;
  static simulateHorseTournament = simulateHorseTournament;
  static announceThrone = announceThrone;
  static simulateThroneTournament = simulateThroneTournament;
  static simulateOneOnOneTournament = simulateOneOnOneTournament;
  static simulateRisingStars = simulateRisingStars;

  private static scaleToTarget(home: number, away: number, target: number): [number, number] {
    const winner = Math.max(home, away);
    if (winner <= 0) return [target, Math.round(target * 0.8)];
    const loser = Math.min(home, away);
    const scaledLoser = Math.min(Math.round((loser * target) / winner), target - 1);
    return home >= away ? [target, scaledLoser] : [scaledLoser, target];
  }

  static async simulateRisingStarsBracket(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const leagueStats = state.leagueStats;
    const rsFormat = leagueStats.risingStarsFormat ?? '4team_tournament';
    const season = leagueStats.year;

    let teamDescriptors: Array<{ tid: number; name: string; abbrev: string; coachName: string; isGLeague: boolean }>;
    let playerPools: NBAPlayer[][];

    if (rsFormat === 'random_4team') {
      const teams = AllStarSelectionService.getRandomRisingStarsRoster(state.players, season, 4);
      teamDescriptors = [
        { tid: -13, name: 'Team Blue', abbrev: 'BLU', coachName: '', isGLeague: false },
        { tid: -14, name: 'Team Red', abbrev: 'RED', coachName: '', isGLeague: false },
        { tid: -15, name: 'Team Green', abbrev: 'GRN', coachName: '', isGLeague: false },
        { tid: -16, name: 'Team Gold', abbrev: 'GLD', coachName: '', isGLeague: false },
      ];
      playerPools = teams;
    } else {
      const { nbaTeams, gLeaguePlayers, coaches, teamNames, teamAbbrevs } =
        AllStarSelectionService.get4TeamRisingStarsRoster(state.players, season);
      teamDescriptors = [
        { tid: -13, name: teamNames[0], abbrev: teamAbbrevs[0], coachName: coaches[0], isGLeague: false },
        { tid: -14, name: teamNames[1], abbrev: teamAbbrevs[1], coachName: coaches[1], isGLeague: false },
        { tid: -15, name: teamNames[2], abbrev: teamAbbrevs[2], coachName: coaches[2], isGLeague: false },
        { tid: -16, name: teamNames[3], abbrev: teamAbbrevs[3], coachName: coaches[3], isGLeague: true },
      ];
      playerPools = [...nbaTeams, gLeaguePlayers];
    }

    const rsRules = resolveExhibitionRules(leagueStats, 'risingStars');
    const fakeTeams = teamDescriptors.map((t) => ({
      id: t.tid,
      name: t.name,
      abbrev: t.abbrev,
      conference: 'East',
      strength: 80,
      wins: 0,
      losses: 0,
      pop: 5000000,
    }));
    const allPlayers = teamDescriptors.flatMap((t, i) => (playerPools[i] ?? []).map((p) => ({ ...p, tid: t.tid })));

    const existing = (allStar as any).risingStarsBracket;
    let bracketState: any = existing && existing.format === rsFormat
      ? existing
      : {
          format: rsFormat,
          teams: teamDescriptors.map((t, i) => ({
            ...t,
            wins: 0,
            losses: 0,
            pf: 0,
            pa: 0,
            playerIds: (playerPools[i] ?? []).map((p) => p.internalId),
          })),
          games: [
            { gid: 91001, homeTid: -13, awayTid: -16, round: 'sf', targetScore: 40, played: false, homeScore: 0, awayScore: 0 },
            { gid: 91002, homeTid: -14, awayTid: -15, round: 'sf', targetScore: 40, played: false, homeScore: 0, awayScore: 0 },
          ],
          championshipGid: undefined as number | undefined,
          complete: false,
        };

    if (bracketState.teams?.some((t: any) => !Array.isArray(t.playerIds) || t.playerIds.length === 0)) {
      bracketState.teams = bracketState.teams.map((t: any, i: number) => ({
        ...t,
        playerIds: t.playerIds && t.playerIds.length > 0 ? t.playerIds : (playerPools[i] ?? []).map((p) => p.internalId),
      }));
    }

    let updatedSchedule = [...state.schedule];
    const newBoxScores: any[] = [];

    const simOne = async (gid: number, homeTid: number, awayTid: number, targetScore: number) => {
      const game: Game = {
        gid,
        homeTid,
        awayTid,
        homeScore: 0,
        awayScore: 0,
        played: false,
        date: toNoonUTC(new Date(state.date)),
        isRisingStars: true,
        isExhibition: true,
        gameFormat: 'target_score',
        targetScore,
      };
      const { results } = await simulateGames(
        fakeTeams as any,
        allPlayers as any,
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
        season,
        rsRules,
      );
      const raw = results[0];
      if (!raw) return null;

      const [scaledHome, scaledAway] = this.scaleToTarget(raw.homeScore, raw.awayScore, targetScore);
      const scaleQuarters = (qs: number[] | undefined, rawScore: number, scaledScore: number): number[] => {
        if (!qs || qs.length === 0 || rawScore <= 0) return qs ?? [];
        const ratio = scaledScore / rawScore;
        const scaledArr = qs.map((q) => Math.max(0, Math.round(q * ratio)));
        const drift = scaledScore - scaledArr.reduce((a, b) => a + b, 0);
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

      const homeDesc = teamDescriptors.find((t) => t.tid === homeTid);
      const awayDesc = teamDescriptors.find((t) => t.tid === awayTid);
      if (homeDesc) { (result as any).homeTeamName = homeDesc.name; (result as any).homeTeamAbbrev = homeDesc.abbrev; }
      if (awayDesc) { (result as any).awayTeamName = awayDesc.name; (result as any).awayTeamAbbrev = awayDesc.abbrev; }

      updatedSchedule = updatedSchedule.map((g) => (g.gid === gid ? { ...g, played: true, homeScore: scaledHome, awayScore: scaledAway } : g));

      const hi = bracketState.teams.findIndex((t: any) => t.tid === homeTid);
      const ai = bracketState.teams.findIndex((t: any) => t.tid === awayTid);
      if (hi >= 0 && ai >= 0) {
        bracketState.teams[hi].pf += scaledHome;
        bracketState.teams[hi].pa += scaledAway;
        bracketState.teams[ai].pf += scaledAway;
        bracketState.teams[ai].pa += scaledHome;
        if (scaledHome > scaledAway) {
          bracketState.teams[hi].wins++;
          bracketState.teams[ai].losses++;
        } else {
          bracketState.teams[ai].wins++;
          bracketState.teams[hi].losses++;
        }
      }

      const topScorer = [
        ...(result.homeStats || []).map((s: any) => ({ ...s, _tname: homeDesc?.name ?? 'home' })),
        ...(result.awayStats || []).map((s: any) => ({ ...s, _tname: awayDesc?.name ?? 'away' })),
      ].sort((a: any, b: any) => (b.pts || 0) - (a.pts || 0))[0];

      const gIdx = bracketState.games.findIndex((g: any) => g.gid === gid);
      const gameEntry = {
        gid,
        homeTid,
        awayTid,
        round: gid === 91099 ? 'final' : 'sf',
        targetScore,
        played: true,
        homeScore: scaledHome,
        awayScore: scaledAway,
        ...(topScorer ? { mvpName: topScorer.name, mvpTeam: topScorer._tname, mvpPts: topScorer.pts || 0 } : {}),
      };
      if (gIdx >= 0) bracketState.games[gIdx] = gameEntry;
      else bracketState.games.push(gameEntry);

      newBoxScores.push(result);
      return result;
    };

    for (const g of bracketState.games.filter((g: any) => g.round === 'sf' && !g.played)) {
      await simOne(g.gid, g.homeTid, g.awayTid, 40);
    }

    const finalAlready = bracketState.games.find((g: any) => g.round === 'final');
    if (!finalAlready) {
      const sfs = bracketState.games.filter((g: any) => g.round === 'sf' && g.played);
      const winners = sfs.map((g: any) => (g.homeScore > g.awayScore ? g.homeTid : g.awayTid));
      if (winners.length >= 2) {
        const [homeTid, awayTid] = winners;
        const finalGame: Game = {
          gid: 91099,
          homeTid,
          awayTid,
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: toNoonUTC(new Date(state.date)),
          isRisingStars: true,
          isRisingStarsChampionship: true,
          isExhibition: true,
          gameFormat: 'target_score',
          targetScore: 25,
        };
        updatedSchedule = [...updatedSchedule, finalGame].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        bracketState.games.push({ gid: 91099, homeTid, awayTid, round: 'final', targetScore: 25, played: false, homeScore: 0, awayScore: 0 });
        bracketState.championshipGid = 91099;
        await simOne(91099, homeTid, awayTid, 25);
      }
    } else if (!finalAlready.played) {
      await simOne(finalAlready.gid, finalAlready.homeTid, finalAlready.awayTid, 25);
    }

    bracketState.complete = !!bracketState.games.find((g: any) => g.round === 'final' && g.played);

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

  static async simulateAllStarBracket(state: GameState): Promise<Partial<GameState>> {
    const allStar = state.allStar!;
    const layout = buildBracketLayout(state.leagueStats, allStar.roster ?? []);
    const fakeTeams = layout.teams.map((t) => ({
      id: t.tid,
      name: t.name,
      abbrev: t.abbrev,
      conference: t.tid === -2 ? 'West' : 'East',
      strength: 90,
      wins: 0,
      losses: 0,
      pop: 8000000,
      logoUrl: t.logoUrl,
    }));
    const bucketByPlayerId = new Map<string, string>();
    for (const r of allStar.roster) bucketByPlayerId.set(r.playerId, r.conference);
    const playersByBucket = new Map<string, any[]>();
    for (const t of layout.teams) playersByBucket.set(t.bucketKey, []);
    for (const p of state.players) {
      const bucketKey = bucketByPlayerId.get(p.internalId);
      if (!bucketKey) continue;
      const team = layout.teams.find((t) => t.bucketKey === bucketKey);
      if (!team) continue;
      playersByBucket.get(bucketKey)!.push({ ...p, tid: team.tid });
    }
    const allBucketPlayers = layout.teams.flatMap((t) => playersByBucket.get(t.bucketKey) ?? []);
    const tidToBucket = new Map(layout.teams.map((t) => [t.tid, t.bucketKey]));
    const layoutTeamByTid = new Map(layout.teams.map((t) => [t.tid, t]));

    const existing = (allStar as any).bracket;
    let bracketState: any = existing && existing.format === layout.format && existing.teamCount === layout.teamCount
      ? existing
      : {
          format: layout.format,
          teamCount: layout.teamCount,
          teams: layout.teams.map((t) => ({ tid: t.tid, name: t.name, abbrev: t.abbrev, logoUrl: t.logoUrl, wins: 0, losses: 0, pf: 0, pa: 0 })),
          games: layout.initialGames.map((g) => ({ ...g, played: false, homeScore: 0, awayScore: 0 })),
          championshipGid: undefined as number | undefined,
          complete: false,
        };

    let updatedSchedule = [...state.schedule];
    const newBoxScores: GameResult[] = [];
    const leagueStats = state.leagueStats;
    const allStarRules = resolveExhibitionRules(leagueStats, 'allStar');

    const simOne = async (gid: number, homeTid: number, awayTid: number) => {
      const game: Game = {
        gid,
        homeTid,
        awayTid,
        homeScore: 0,
        awayScore: 0,
        played: false,
        date: toNoonUTC(new Date(state.date)),
        isAllStar: true,
        isExhibition: true,
        ...(allStarRules.gameFormat !== 'timed'
          ? {
              gameFormat: allStarRules.gameFormat,
              targetScore: allStarRules.gameFormat === 'target_score' ? allStarRules.targetScore : undefined,
            }
          : {}),
      };
      const { results } = await simulateGames(
        fakeTeams as any,
        allBucketPlayers as any,
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
        allStarRules,
      );
      const result = results[0];
      if (!result) return null;

      const homeBracketTeam = layoutTeamByTid.get(homeTid);
      const awayBracketTeam = layoutTeamByTid.get(awayTid);
      if (homeBracketTeam) { (result as any).homeTeamName = homeBracketTeam.name; (result as any).homeTeamAbbrev = homeBracketTeam.abbrev; }
      if (awayBracketTeam) { (result as any).awayTeamName = awayBracketTeam.name; (result as any).awayTeamAbbrev = awayBracketTeam.abbrev; }

      updatedSchedule = updatedSchedule.map((g) => (g.gid === gid ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g));

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
      const mvpFields = topScorer ? { mvpName: topScorer.name, mvpTeam: topScorer._team, mvpPts: topScorer.pts || 0 } : {};
      const gIdx = bracketState.games.findIndex((g: any) => g.gid === gid);
      if (gIdx >= 0) {
        bracketState.games[gIdx] = { ...bracketState.games[gIdx], played: true, homeScore: result.homeScore, awayScore: result.awayScore, ...mvpFields };
      } else {
        bracketState.games.push({ gid, homeTid, awayTid, round: 'final', played: true, homeScore: result.homeScore, awayScore: result.awayScore, ...mvpFields });
      }

      newBoxScores.push(result);
      return result;
    };

    const isThreeTeamUsaWorld = layout.format === 'usa_vs_world' && layout.teamCount === 3;
    const groupGames = bracketState.games.filter((g: any) => !g.played && g.round !== 'final');
    for (const g of groupGames) {
      await simOne(g.gid, g.homeTid, g.awayTid);
    }

    if (isThreeTeamUsaWorld) {
      const stripesTid = -2;
      const game1 = bracketState.games.find((g: any) => g.gid === 90094 && g.played);
      const hasGame2 = bracketState.games.some((g: any) => g.gid === 90095);
      if (game1 && !hasGame2) {
        const winnerTid = game1.homeScore > game1.awayScore ? game1.homeTid : game1.awayTid;
        const loserTid = game1.homeScore > game1.awayScore ? game1.awayTid : game1.homeTid;
        const buildGame = (gid: number, oppTid: number): Game => ({
          gid,
          homeTid: stripesTid,
          awayTid: oppTid,
          played: false,
          homeScore: 0,
          awayScore: 0,
          date: toNoonUTC(new Date(state.date)),
          isAllStar: true,
          isExhibition: true,
          ...(allStarRules.gameFormat !== 'timed'
            ? {
                gameFormat: allStarRules.gameFormat,
                targetScore: allStarRules.gameFormat === 'target_score' ? allStarRules.targetScore : undefined,
              }
            : {}),
        });
        const game2 = buildGame(90095, winnerTid);
        const game3 = buildGame(90096, loserTid);
        updatedSchedule = [...updatedSchedule, game2, game3].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        bracketState.games.push(
          { gid: 90095, homeTid: stripesTid, awayTid: winnerTid, round: 'rr', played: false, homeScore: 0, awayScore: 0 },
          { gid: 90096, homeTid: stripesTid, awayTid: loserTid, round: 'rr', played: false, homeScore: 0, awayScore: 0 },
        );
        await simOne(90095, stripesTid, winnerTid);
        await simOne(90096, stripesTid, loserTid);
      }
    }

    const finalAlready = bracketState.games.find((g: any) => g.round === 'final');
    if (!finalAlready) {
      let homeTid: number | null = null;
      let awayTid: number | null = null;

      if (layout.format === 'usa_vs_world' && layout.teamCount === 3) {
        const ranked = [...bracketState.teams].sort((a: any, b: any) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          const diff = (b.pf - b.pa) - (a.pf - a.pa);
          if (diff !== 0) return diff;
          return Math.random() - 0.5;
        });
        homeTid = ranked[0].tid;
        awayTid = ranked[1].tid;
      } else if (layout.teamCount === 4) {
        const sfs = bracketState.games.filter((g: any) => g.round === 'sf' && g.played);
        const winners = sfs.map((g: any) => (g.homeScore > g.awayScore ? g.homeTid : g.awayTid));
        homeTid = winners[0] ?? null;
        awayTid = winners[1] ?? null;
      }

      if (homeTid != null && awayTid != null) {
        const finalGid = 90099;
        const finalGame: Game = {
          gid: finalGid,
          homeTid,
          awayTid,
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: toNoonUTC(new Date(state.date)),
          isAllStar: true,
          isAllStarChampionship: true,
          isExhibition: true,
          ...(allStarRules.gameFormat !== 'timed'
            ? {
                gameFormat: allStarRules.gameFormat,
                targetScore: allStarRules.gameFormat === 'target_score' ? allStarRules.targetScore : undefined,
              }
            : {}),
        };
        updatedSchedule = [...updatedSchedule, finalGame].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        bracketState.games.push({ gid: finalGid, homeTid, awayTid, round: 'final', played: false, homeScore: 0, awayScore: 0 });
        await simOne(finalGid, homeTid, awayTid);
      }
    } else if (!finalAlready.played) {
      await simOne(finalAlready.gid, finalAlready.homeTid, finalAlready.awayTid);
    }

    const finalGame = bracketState.games.find((g: any) => g.round === 'final' && g.played);
    bracketState.complete = !!finalGame;

    let gameMvp: { name: string; team: string } | undefined;
    if (finalGame) {
      const finalResult = newBoxScores.find((b) => b.gameId === finalGame.gid);
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
        allStarGameId: finalGame?.gid ?? (allStar as any).allStarGameId,
        bracket: bracketState,
        ...(gameMvp ? { gameMvp } : {}),
      },
    };
  }

  static async simulateAllStarGame(state: GameState): Promise<Partial<GameState>> {
    return this.simulateAllStarBracket(state);
  }

  static async simulateWeekend(
    state: GameState,
    simFlags?: { friday: boolean; saturday: boolean; sunday: boolean },
  ): Promise<Partial<GameState>> {
    return simulateWeekendCore(state, simFlags, this);
  }
}
