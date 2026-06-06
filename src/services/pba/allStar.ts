import type { AllStarPlayer, AllStarVoteCount, GameState, NBAPlayer } from '../../types';
import { bucketRoster } from '../allStar/AllStarSelectionService';
import { AllStarDunkContestSim } from '../allStar/AllStarDunkContestSim';
import { AllStarSkillsChallengeSim } from '../allStar/AllStarSkillsChallengeSim';
import { AllStarThreePointContestSim } from '../allStar/AllStarThreePointContestSim';
import { convertTo2KRating, extractNbaId, extractTeamId } from '../../utils/helpers';

const isGuard = (pos?: string) => pos === 'G' || pos === 'PG' || pos === 'SG';

const pbaTeams = (state: GameState): any[] =>
  ((state as any).nonNBATeams ?? [])
    .filter((team: any) => team?.league === 'PBA')
    .map((team: any) => ({ ...team, id: team.tid ?? team.id }));

const pbaPlayers = (state: GameState, players: NBAPlayer[]): NBAPlayer[] => {
  const tids = new Set(pbaTeams(state).map(team => team.id));
  return players.filter(player => tids.has(player.tid) && player.status !== 'Retired');
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
  const candidates = pbaPlayers(state, players)
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
      ...(state.allStar ?? {}),
      season,
      votes,
      roster: bucketedRoster,
      startersAnnounced: true,
      reservesAnnounced: true,
      risingStarsAnnounced: false,
      celebrityAnnounced: false,
      shootingStarsAnnounced: false,
      skillsChallengeAnnounced: false,
      dunkContestAnnounced: false,
      threePointAnnounced: false,
      weekendComplete: false,
    } as any,
  };
};

export const buildPbaContestPatch = (
  state: GameState,
  players: NBAPlayer[],
  allStar: any,
): any => {
  const pool = pbaPlayers(state, players);
  if (pool.length === 0) return allStar;
  const dunkCount = state.leagueStats.allStarDunkContestPlayers ?? 4;
  const threePointCount = state.leagueStats.allStarThreePointContestPlayers ?? 8;
  const skillsCount = Math.min(30, Math.max(3, Math.round(state.leagueStats.allStarSkillsChallengeTeams ?? state.leagueStats.allStarSkillsChallengeTotalPlayers ?? 4)));
  return {
    ...allStar,
    ...(!allStar?.dunkContestAnnounced ? {
      dunkContestContestants: AllStarDunkContestSim.selectContestants(pool, dunkCount),
      dunkContestAnnounced: true,
    } : {}),
    ...(!allStar?.threePointAnnounced ? {
      threePointContestants: AllStarThreePointContestSim.selectContestants(pool, state.leagueStats.year, threePointCount),
      threePointAnnounced: true,
    } : {}),
    ...(!allStar?.skillsChallengeAnnounced ? {
      skillsChallengeContestants: AllStarSkillsChallengeSim.selectContestants(pool, state.leagueStats.year, skillsCount),
      skillsChallengeAnnounced: true,
    } : {}),
  };
};

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
