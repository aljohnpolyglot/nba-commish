import type { AllStarPlayer, AllStarVoteCount, GameState, NBAPlayer } from '../../types';
import { bucketRoster } from '../allStar/AllStarSelectionService';
import { getAllStarWeekendDates } from '../allStar/allStarWeekendDates';
import { convertTo2KRating, extractNbaId, extractTeamId, normalizeDate } from '../../utils/helpers';
import {
  selectExternalDunkContestants,
  selectExternalSkillsContestants,
  selectExternalThreePointContestants,
  type ExternalAllStarContestProfile,
} from '../externalLeague/allStarContestSelection';
import { isPbaRosterLocal } from './importManager';

const isGuard = (pos?: string) => pos === 'G' || pos === 'PG' || pos === 'SG';

const PBA_ALL_STAR_CONTEST_PROFILE: ExternalAllStarContestProfile = {
  guardSkillsBoost: 3,
  centerDunkPenalty: 4,
};

const isAllStarWeekendEventGame = (game: any): boolean =>
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

const isPbaAllStarWindowDate = (state: GameState, date?: string): boolean => {
  if (!date) return false;
  const dates = getAllStarWeekendDates(state.leagueStats.year, { uiMode: 'pba_isolated' });
  const value = normalizeDate(date);
  return value >= normalizeDate(dates.breakStart.toISOString()) && value <= normalizeDate(dates.breakEnd.toISOString());
};

export const emptyPbaAllStarState = (season: number) => ({
  season,
  votes: [],
  roster: [],
  startersAnnounced: false,
  reservesAnnounced: false,
  risingStarsAnnounced: false,
  celebrityAnnounced: false,
  shootingStarsAnnounced: false,
  skillsChallengeAnnounced: false,
  dunkContestAnnounced: false,
  threePointAnnounced: false,
  weekendComplete: false,
  gamesInjected: false,
  risingStarsRoster: undefined,
  risingStarsTeams: undefined,
  celebrityRoster: undefined,
  celebrityGameId: undefined,
  celebrityGameResult: undefined,
  dunkContestContestants: undefined,
  threePointContestants: undefined,
  skillsChallengeContestants: undefined,
  dunkContest: undefined,
  threePointContest: undefined,
  skillsChallenge: undefined,
  bracket: undefined,
  allStarGameId: undefined,
  gameMvp: undefined,
});

export const hasReachedPbaAllStarRosterAnnouncement = (state: GameState): boolean => {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return true;
  if (!state.date) return false;
  const dates = getAllStarWeekendDates(state.leagueStats.year, { uiMode: 'pba_isolated' });
  return normalizeDate(state.date) >= normalizeDate(dates.reservesAnnounced.toISOString());
};

export const hasReachedPbaAllStarContestAnnouncement = (state: GameState): boolean => {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return true;
  if (!state.date) return false;
  const dates = getAllStarWeekendDates(state.leagueStats.year, { uiMode: 'pba_isolated' });
  return normalizeDate(state.date) >= normalizeDate(dates.dunkContestAnnounced.toISOString());
};

export const hasReachedPbaAllStarWeekend = (state: GameState): boolean => {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return true;
  if (!state.date) return false;
  const dates = getAllStarWeekendDates(state.leagueStats.year, { uiMode: 'pba_isolated' });
  return normalizeDate(state.date) >= normalizeDate(dates.saturday.toISOString());
};

export function sanitizePbaAllStarForDate(state: GameState, allStar: any = state.allStar): any {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return allStar;
  const season = state.leagueStats.year;
  if (!hasReachedPbaAllStarRosterAnnouncement(state)) {
    return emptyPbaAllStarState(season);
  }
  if (!allStar) return allStar;
  if (!hasReachedPbaAllStarContestAnnouncement(state)) {
    return {
      ...allStar,
      risingStarsAnnounced: false,
      celebrityAnnounced: false,
      risingStarsRoster: undefined,
      risingStarsTeams: undefined,
      celebrityRoster: undefined,
      celebrityGameId: undefined,
      celebrityGameResult: undefined,
      dunkContestAnnounced: false,
      threePointAnnounced: false,
      skillsChallengeAnnounced: false,
      dunkContestContestants: undefined,
      threePointContestants: undefined,
      skillsChallengeContestants: undefined,
      dunkContest: undefined,
      threePointContest: undefined,
      skillsChallenge: undefined,
    };
  }
  return allStar;
}

const collectPbaAllStarEventIds = (state: GameState, allStar: any = state.allStar): Set<number> => {
  const ids = new Set<number>();
  if (Number.isFinite(Number(allStar?.allStarGameId))) ids.add(Number(allStar.allStarGameId));
  for (const game of allStar?.bracket?.games ?? []) {
    if (Number.isFinite(Number(game?.gid))) ids.add(Number(game.gid));
  }
  for (const game of state.schedule ?? []) {
    if (isAllStarWeekendEventGame(game) && isPbaAllStarWindowDate(state, game.date)) {
      ids.add(Number(game.gid));
    }
  }
  return ids;
};

const normalizeName = (value?: string): string => String(value ?? '').trim().toLowerCase();

const getPbaBracketFinal = (allStar: any): any | undefined => {
  const games = allStar?.bracket?.games ?? [];
  return games.find((game: any) => game?.round === 'final') ?? (games.length === 1 ? games[0] : undefined);
};

const pbaAllStarBoxMatchesFinal = (box: any, finalGame: any, allStar: any): boolean => {
  if (Number(box?.gameId) !== Number(finalGame?.gid)) return false;
  if (Number(box?.homeTeamId) !== Number(finalGame?.homeTid)) return false;
  if (Number(box?.awayTeamId) !== Number(finalGame?.awayTid)) return false;
  const homeName = allStar?.bracket?.teams?.find((team: any) => Number(team?.tid) === Number(finalGame?.homeTid))?.name;
  const awayName = allStar?.bracket?.teams?.find((team: any) => Number(team?.tid) === Number(finalGame?.awayTid))?.name;
  if (box?.homeTeamName && homeName && normalizeName(box.homeTeamName) !== normalizeName(homeName)) return false;
  if (box?.awayTeamName && awayName && normalizeName(box.awayTeamName) !== normalizeName(awayName)) return false;
  return Array.isArray(box?.homeStats) && box.homeStats.length > 0 && Array.isArray(box?.awayStats) && box.awayStats.length > 0;
};

const pbaTeams = (state: GameState): any[] =>
  ((state as any).nonNBATeams ?? [])
    .filter((team: any) => team?.league === 'PBA')
    .map((team: any) => ({ ...team, id: team.tid ?? team.id }));

const hasActivePbaImportContract = (player: NBAPlayer): boolean => {
  const contract = (player as any).pbaImportContract;
  return !!contract && contract.status !== 'released';
};

export const isPbaImportLike = (player: NBAPlayer): boolean =>
  !!(player as any).isImport ||
  !!(player as any).importConference ||
  hasActivePbaImportContract(player);

export const isPbaLocalAllStarEligible = (player: NBAPlayer, state: GameState): boolean => {
  const tids = new Set(pbaTeams(state).map(team => Number(team.id)));
  return tids.has(Number(player.tid)) &&
    player.status !== 'Retired' &&
    isPbaRosterLocal(player, state.leagueStats as any) &&
    !isPbaImportLike(player);
};

const pbaPlayers = (state: GameState, players: NBAPlayer[]): NBAPlayer[] => {
  const tids = new Set(pbaTeams(state).map(team => team.id));
  return players.filter(player =>
    tids.has(player.tid) &&
    isPbaLocalAllStarEligible(player, state)
  );
};

const allStarPlayerIdsAreLocal = (allStar: any, localIds: Set<string>): boolean => {
  const roster = allStar?.roster ?? [];
  if (!Array.isArray(roster) || roster.length === 0) return false;
  return roster.every((entry: any) => localIds.has(String(entry?.playerId ?? entry?.internalId ?? '')));
};

const contestantIdsAreLocal = (contestants: any, localIds: Set<string>): boolean => {
  if (!Array.isArray(contestants) || contestants.length === 0) return false;
  return contestants.every((entry: any) => localIds.has(String(entry?.playerId ?? entry?.internalId ?? '')));
};

const contestantNamesAreLocal = (contestants: any, localNames: Set<string>): boolean => {
  if (!Array.isArray(contestants) || contestants.length === 0) return false;
  return contestants.every((entry: any) => localNames.has(String(entry?.playerName ?? entry?.name ?? '').toLowerCase()));
};

const contestResultIsLocal = (result: any, localIds: Set<string>, localNames: Set<string>): boolean => {
  if (!result) return true;
  if (result.winnerId && !localIds.has(String(result.winnerId))) {
    const winnerName = String(result.winnerName ?? '').toLowerCase();
    if (!winnerName || !localNames.has(winnerName)) return false;
  }
  const contestants = result.contestants;
  if (!Array.isArray(contestants)) return true;
  return contestants.every((entry: any) => {
    const contestantId = String(entry?.playerId ?? entry?.internalId ?? '');
    if (contestantId && localIds.has(contestantId)) return true;
    const contestantName = String(entry?.playerName ?? entry?.name ?? '').toLowerCase();
    return !!contestantName && localNames.has(contestantName);
  });
};

export const isPbaAllStarStateLocal = (state: GameState, allStar: any = state.allStar): boolean => {
  const localPlayers = pbaPlayers(state, state.players ?? []);
  const localIds = new Set(localPlayers.map(player => player.internalId));
  const localNames = new Set(localPlayers.map(player => String(player.name ?? '').toLowerCase()).filter(Boolean));
  return allStarPlayerIdsAreLocal(allStar, localIds) &&
    (!allStar?.dunkContestAnnounced || contestantIdsAreLocal(allStar?.dunkContestContestants, localIds)) &&
    (!allStar?.threePointAnnounced || contestantIdsAreLocal(allStar?.threePointContestants, localIds)) &&
    (!allStar?.skillsChallengeAnnounced || contestantIdsAreLocal(allStar?.skillsChallengeContestants, localIds)) &&
    contestResultIsLocal(allStar?.dunkContest, localIds, localNames) &&
    contestResultIsLocal(allStar?.threePointContest, localIds, localNames) &&
    contestResultIsLocal(allStar?.skillsChallenge, localIds, localNames);
};

const playerOvr = (player: NBAPlayer): number =>
  convertTo2KRating(
    player.overallRating ?? player.ratings?.[player.ratings.length - 1]?.ovr ?? 50,
    player.ratings?.[player.ratings.length - 1]?.hgt ?? 50,
    player.ratings?.[player.ratings.length - 1]?.tp,
  );

const seasonScore = (player: NBAPlayer, season: number, teamWinPct: number): number => {
  const rows = (player.stats ?? []).filter((row: any) => row.season === season && !row.playoffs);
  const gp = rows.reduce((sum: number, row: any) => sum + (row.gp ?? 0), 0);
  if (gp <= 0) return (player.overallRating ?? 50) * 0.55 + teamWinPct * 4;
  const pts = rows.reduce((sum: number, row: any) => sum + (row.pts ?? 0), 0) / gp;
  const trb = rows.reduce((sum: number, row: any) => sum + (row.trb ?? (row.orb ?? 0) + (row.drb ?? 0)), 0) / gp;
  const ast = rows.reduce((sum: number, row: any) => sum + (row.ast ?? 0), 0) / gp;
  return pts * 0.8 + trb * 0.32 + ast * 0.38 + (player.overallRating ?? 50) * 0.35 + teamWinPct * 4;
};

export const buildPbaAllStarLeagueStats = (leagueStats: any) => ({
  ...leagueStats,
  allStarGameEnabled: true,
  allStarFormat: 'captains_draft',
  allStarTeams: 2,
  allStarMirrorLeagueRules: false,
  allStarGameFormat: 'timed',
  allStarQuarterLength: 12,
  allStarNumQuarters: 4,
  allStarOvertimeDuration: 5,
  risingStarsEnabled: false,
  celebrityGameEnabled: false,
  allStarDunkContest: true,
  allStarThreePointContest: true,
  allStarShootingStars: false,
  allStarSkillsChallenge: true,
  allStarHorse: false,
  allStarThroneEnabled: false,
  allStarOneOnOneEnabled: false,
});

export const buildPbaAllStarPatch = (
  state: GameState,
  players: NBAPlayer[],
): Pick<GameState, 'allStar' | 'players'> | null => {
  const teams = pbaTeams(state);
  if (teams.length === 0) return null;

  const teamByTid = new Map(teams.map(team => [team.id, team]));
  const standings = new Map(
    teams.map(team => {
      const wins = team.wins ?? team.w ?? team.won ?? 0;
      const losses = team.losses ?? team.l ?? team.lost ?? 0;
      const pct = wins + losses > 0 ? wins / (wins + losses) : 0.5;
      return [team.id, pct];
    }),
  );
  const season = state.leagueStats.year;
  const localPool = pbaPlayers(state, players);
  if ((state.allStar as any)?.weekendComplete && isPbaAllStarStateLocal({ ...state, players } as GameState, state.allStar)) {
    return { players, allStar: state.allStar as any };
  }
  const candidates = localPool
    .map(player => ({
      player,
      team: teamByTid.get(player.tid),
      score: seasonScore(player, season, standings.get(player.tid) ?? 0.5),
      ovr: playerOvr(player),
    }))
    .filter(entry => entry.team)
    .sort((a, b) => b.score - a.score || b.ovr - a.ovr);

  if (candidates.length < 10) return null;

  const poolSize = Math.min(24, candidates.length);
  const selected = candidates.slice(0, poolSize);
  const starterIds = new Set(selected.slice(0, Math.min(10, selected.length)).map(entry => entry.player.internalId));
  const roster: AllStarPlayer[] = selected.map(({ player, team, ovr }) => ({
    playerId: player.internalId,
    nbaId: extractNbaId(player.imgURL || '', player.name),
    playerName: player.name,
    teamAbbrev: team.abbrev ?? '',
    teamNbaId: extractTeamId(team.logoUrl || '', team.abbrev ?? ''),
    conference: '',
    isStarter: starterIds.has(player.internalId),
    position: player.pos ?? 'F',
    category: isGuard(player.pos) ? 'Guard' : 'Frontcourt',
    ovr,
  }));
  const votes: AllStarVoteCount[] = selected.map(({ player, team }, index) => ({
    playerId: player.internalId,
    nbaId: extractNbaId(player.imgURL || '', player.name),
    playerName: player.name,
    teamAbbrev: team.abbrev ?? '',
    teamNbaId: extractTeamId(team.logoUrl || '', team.abbrev ?? ''),
    conference: '',
    category: isGuard(player.pos) ? 'Guard' : 'Frontcourt',
    votes: (selected.length - index) * 100000,
  }));
  const bucketedRoster = bucketRoster(roster, players, votes, 'captains_draft', 2);
  const allStarIds = new Set(bucketedRoster.map(entry => entry.playerId));
  const playersWithAwards = players.map(player => {
    if (!allStarIds.has(player.internalId)) return player;
    if ((player.awards ?? []).some(award => award.type === 'All-Star' && award.season === season)) return player;
    return { ...player, awards: [...(player.awards ?? []), { type: 'All-Star', season }] };
  });

  return {
    players: playersWithAwards,
    allStar: {
      season,
      votes,
      roster: bucketedRoster,
      startersAnnounced: true,
      reservesAnnounced: true,
      risingStarsAnnounced: false,
      celebrityAnnounced: false,
      risingStarsRoster: undefined,
      risingStarsTeams: undefined,
      celebrityRoster: undefined,
      celebrityGameId: undefined,
      celebrityGameResult: undefined,
      shootingStarsAnnounced: false,
      skillsChallengeAnnounced: false,
      dunkContestAnnounced: false,
      threePointAnnounced: false,
      weekendComplete: false,
      gamesInjected: false,
      dunkContestContestants: undefined,
      threePointContestants: undefined,
      skillsChallengeContestants: undefined,
      dunkContest: undefined,
      threePointContest: undefined,
      skillsChallenge: undefined,
      bracket: undefined,
      allStarGameId: undefined,
      gameMvp: undefined,
    } as any,
  };
};

export const buildPbaContestPatch = (
  state: GameState,
  players: NBAPlayer[],
  allStar: any,
): any => {
  const pool = pbaPlayers(state, players);
  const localIds = new Set(pool.map(player => player.internalId));
  const localNames = new Set(pool.map(player => String(player.name ?? '').toLowerCase()).filter(Boolean));
  const existing = allStar ?? {};
  const keepDunk = existing.dunkContestAnnounced &&
    contestantIdsAreLocal(existing.dunkContestContestants, localIds) &&
    contestResultIsLocal(existing.dunkContest, localIds, localNames);
  const keepThree = existing.threePointAnnounced &&
    contestantIdsAreLocal(existing.threePointContestants, localIds) &&
    contestResultIsLocal(existing.threePointContest, localIds, localNames);
  const keepSkills = existing.skillsChallengeAnnounced &&
    contestantIdsAreLocal(existing.skillsChallengeContestants, localIds) &&
    contestResultIsLocal(existing.skillsChallenge, localIds, localNames);
  const baseAllStar = {
    season: state.leagueStats.year,
    votes: [],
    roster: [],
    startersAnnounced: false,
    reservesAnnounced: false,
    weekendComplete: false,
    ...existing,
    ...(!keepDunk ? { dunkContestAnnounced: false, dunkContestContestants: undefined, dunkContest: undefined } : {}),
    ...(!keepThree ? { threePointAnnounced: false, threePointContestants: undefined, threePointContest: undefined } : {}),
    ...(!keepSkills ? { skillsChallengeAnnounced: false, skillsChallengeContestants: undefined, skillsChallenge: undefined } : {}),
    ...(!keepDunk || !keepThree || !keepSkills ? { weekendComplete: false } : {}),
  };
  if (pool.length === 0) return baseAllStar;
  const dunkCount = state.leagueStats.allStarDunkContestPlayers ?? 4;
  const threePointCount = state.leagueStats.allStarThreePointContestPlayers ?? 8;
  const skillsCount = Math.min(30, Math.max(3, Math.round(state.leagueStats.allStarSkillsChallengeTeams ?? state.leagueStats.allStarSkillsChallengeTotalPlayers ?? 4)));
  return {
    ...baseAllStar,
    ...(!keepDunk ? {
      dunkContestContestants: selectExternalDunkContestants(pool, dunkCount, PBA_ALL_STAR_CONTEST_PROFILE),
      dunkContestAnnounced: true,
    } : {}),
    ...(!keepThree ? {
      threePointContestants: selectExternalThreePointContestants(pool, state.leagueStats.year, threePointCount, PBA_ALL_STAR_CONTEST_PROFILE),
      threePointAnnounced: true,
    } : {}),
    ...(!keepSkills ? {
      skillsChallengeContestants: selectExternalSkillsContestants(pool, skillsCount, PBA_ALL_STAR_CONTEST_PROFILE),
      skillsChallengeAnnounced: true,
    } : {}),
  };
};

export const pbaAllStarGameNeedsFullLengthRepair = (
  state: GameState,
  allStar: any = state.allStar,
): boolean => {
  if (!allStar?.weekendComplete) return false;
  const gameIds = collectPbaAllStarEventIds(state, allStar);
  const finalGame = getPbaBracketFinal(allStar);
  const scores: Array<{ homeScore: number; awayScore: number }> = [];

  for (const game of allStar?.bracket?.games ?? []) {
    if (game?.played && (game.round === 'final' || (allStar?.bracket?.games?.length ?? 0) === 1)) {
      scores.push({ homeScore: Number(game.homeScore ?? 0), awayScore: Number(game.awayScore ?? 0) });
    }
  }

  for (const box of state.boxScores ?? []) {
    const isPbaAllStarBox =
      gameIds.has(Number(box.gameId)) ||
      (!!(box as any).isAllStar && isPbaAllStarWindowDate(state, box.date));
    if (isPbaAllStarBox) {
      scores.push({ homeScore: Number(box.homeScore ?? 0), awayScore: Number(box.awayScore ?? 0) });
    }
  }

  if (scores.some(({ homeScore, awayScore }) => {
    const high = Math.max(homeScore, awayScore);
    return high > 0 && high < 60;
  })) {
    return true;
  }

  return !!(finalGame?.played && !(state.boxScores ?? []).some(box => pbaAllStarBoxMatchesFinal(box, finalGame, allStar)));
};

export const resetPbaAllStarGameForResim = (
  state: GameState,
  allStar: any = state.allStar,
): Pick<GameState, 'schedule' | 'boxScores' | 'allStar'> => {
  const gameIds = collectPbaAllStarEventIds(state, allStar);
  const schedule = (state.schedule ?? []).filter(game =>
    !(isAllStarWeekendEventGame(game) && (gameIds.has(Number(game.gid)) || isPbaAllStarWindowDate(state, game.date)))
  );
  const boxScores = (state.boxScores ?? []).filter(box =>
    !gameIds.has(Number(box.gameId)) &&
    !((box as any).isAllStar && isPbaAllStarWindowDate(state, box.date))
  );

  return {
    schedule,
    boxScores,
    allStar: {
      ...(allStar ?? {}),
      weekendComplete: false,
      gamesInjected: false,
      bracket: undefined,
      allStarGameId: undefined,
      gameMvp: undefined,
    } as any,
  };
};

export const stripUnsupportedPbaAllStarGames = (
  state: GameState,
  schedule: GameState['schedule'] = state.schedule,
): GameState['schedule'] =>
  (schedule ?? []).filter(game => {
    if (!game) return false;
    if (!isPbaAllStarWindowDate(state, game.date)) return true;
    return !game.isRisingStars && !game.isCelebrityGame;
  });

export const backfillPbaAllStarAwards = (
  state: GameState,
  players: NBAPlayer[],
  allStar: any,
): NBAPlayer[] => {
  const season = state.leagueStats.year;
  const entries: Array<{ internalId?: string; name?: string; type: string }> = [];
  if (allStar?.dunkContest?.winnerId || allStar?.dunkContest?.winnerName) {
    entries.push({ internalId: allStar.dunkContest.winnerId, name: allStar.dunkContest.winnerName, type: 'Slam Dunk Contest Winner' });
  }
  if (allStar?.threePointContest?.winnerId || allStar?.threePointContest?.winnerName) {
    entries.push({ internalId: allStar.threePointContest.winnerId, name: allStar.threePointContest.winnerName, type: 'Three-Point Contest Winner' });
  }
  if (allStar?.skillsChallenge?.winnerId || allStar?.skillsChallenge?.winnerName) {
    entries.push({ internalId: allStar.skillsChallenge.winnerId, name: allStar.skillsChallenge.winnerName, type: 'Skills Challenge Winner' });
  }
  if (allStar?.gameMvp?.name) {
    entries.push({ name: allStar.gameMvp.name, type: 'All-Star Game MVP' });
  }
  if (entries.length === 0) return players;

  return players.map(player => {
    const playerEntries = entries.filter(entry =>
      (entry.internalId && entry.internalId === player.internalId) ||
      (!entry.internalId && entry.name?.toLowerCase() === player.name.toLowerCase())
    );
    if (playerEntries.length === 0) return player;
    const awards = [...(player.awards ?? [])];
    for (const entry of playerEntries) {
      if (!awards.some(award => award.type === entry.type && award.season === season)) {
        awards.push({ type: entry.type, season });
      }
    }
    return { ...player, awards };
  });
};
