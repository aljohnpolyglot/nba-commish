import { NBAPlayer, NBATeam, AllStarVoteCount, AllStarPlayer } from '../../types';
import { getAllStarWeekendDates } from './AllStarWeekendOrchestrator';
import { extractNbaId, extractTeamId, convertTo2KRating } from '../../utils/helpers';
import { isUsaPlayer } from './allStarSelectionHelpers';
export {
  ALL_STAR_ASSETS,
  applyUsaWorldFormat,
  bucketRoster,
  type AllStarBucketKey,
  isUsaPlayer,
} from './allStarSelectionHelpers';
export class AllStarSelectionService {
  static simulateVotingPeriod(
    players: NBAPlayer[],
    teams: NBATeam[],
    season: number,
    currentDate: Date,
    existingVotes: AllStarVoteCount[],
    days: number = 1
  ): AllStarVoteCount[] {
    const dates = getAllStarWeekendDates(season);
    if (currentDate < dates.votingStart) {
      return [];
    }
    const totalDuration = dates.votingEnd.getTime() - dates.votingStart.getTime();
    const elapsed = currentDate.getTime() - dates.votingStart.getTime();
    const progress = Math.min(1, Math.max(0, elapsed / totalDuration));
    const bonusDays = [
      new Date(season - 1, 11, 21),
      new Date(season - 1, 11, 25),
      new Date(season - 1, 11, 30),
      new Date(season, 0, 7),
      new Date(season, 0, 14),
    ];
    const isBonusDay = bonusDays.some(d => d.toDateString() === currentDate.toDateString());
    const voteMult = (isBonusDay ? 3.0 : 1.0) * days;
    const voteMap = new Map<string, AllStarVoteCount>(
      existingVotes.map(v => [v.playerId, { ...v }])
    );
    players
      .filter(p => p.status === 'Active' && p.tid >= 0)
      .forEach(player => {
        const stat = player.stats?.find(s => s.season === season && !s.playoffs);
        const team = teams.find(t => t.id === player.tid);
        if (!stat || !team || stat.gp < 5) return;
        const gp = stat.gp || 1;
        const ppg = stat.pts / gp;
        const rpg = (stat.trb || (stat.orb || 0) + (stat.drb || 0)) / gp;
        const apg = stat.ast / gp;
        const pop = team.pop ?? 2000000;
        const marketMult = 0.6 + Math.min(1.4, (pop / 8000000) * 1.4);
        const perfScore = ppg * 1.0 + rpg * 0.3 + apg * 0.4;
        const pastAllStars = player.awards?.filter(a => a.type === 'All-Star').length ?? 0;
        const starMult = 1 + (pastAllStars * 0.05);
        const variance = 0.9 + Math.random() * 0.20;
        const baseDaily = 3500; 
        const dailyVotes = Math.round(perfScore * marketMult * starMult * variance * baseDaily * voteMult);
        const category: 'Guard' | 'Frontcourt' = (player.pos === 'G' || player.pos === 'PG' || player.pos === 'SG') ? 'Guard' : 'Frontcourt';
        const nbaId = extractNbaId(player.imgURL || "", player.name);
        const teamNbaId = extractTeamId(team.logoUrl || "", team.abbrev);
        const existing = voteMap.get(player.internalId);
        if (existing) {
          existing.votes += dailyVotes;
          existing.nbaId = nbaId;
          existing.teamNbaId = teamNbaId;
        } else {
          const floorVotes = Math.round(perfScore * marketMult * starMult * 5000 * (progress + 0.1));
          voteMap.set(player.internalId, {
            playerId: player.internalId,
            nbaId,
            playerName: player.name,
            teamAbbrev: team.abbrev,
            teamNbaId,
            conference: team.conference as 'East' | 'West',
            category,
            votes: floorVotes + dailyVotes,
          });
        }
      });
    let results = Array.from(voteMap.values());
    if (progress > 0.9) {
      const maxVotes = Math.max(...results.map(r => r.votes));
      if (maxVotes > 5000000) {
        const scale = 3500000 / maxVotes;
        results = results.map(r => ({ ...r, votes: Math.round(r.votes * scale) }));
      }
    }
    return results.sort((a, b) => b.votes - a.votes);
  }
  static selectStarters(
    votes: AllStarVoteCount[],
    players: NBAPlayer[] = []
  ): AllStarPlayer[] {
    const starters: AllStarPlayer[] = [];
    const playerOvrMap = new Map<string, number>(
      players.map(p => [p.internalId, convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp)])
    );
    for (const conf of ['East', 'West'] as const) {
      const confVotes = votes
        .filter(v => v.conference === conf)
        .sort((a, b) => b.votes - a.votes);
      const pickedIds = new Set<string>();
      const frontcourt = confVotes.filter(v =>
        v.category === 'Frontcourt'
      );
      frontcourt.slice(0, 3).forEach(v => {
        starters.push({
          playerId: v.playerId,
          nbaId: v.nbaId,
          playerName: v.playerName,
          teamAbbrev: v.teamAbbrev,
          teamNbaId: v.teamNbaId,
          conference: conf,
          position: 'F',
          isStarter: true,
          category: 'Frontcourt',
          ovr: playerOvrMap.get(v.playerId),
        });
        pickedIds.add(v.playerId);
      });
      const guards = confVotes.filter(v =>
        v.category === 'Guard' &&
        !pickedIds.has(v.playerId)
      );
      guards.slice(0, 2).forEach(v => {
        starters.push({
          playerId: v.playerId,
          nbaId: v.nbaId,
          playerName: v.playerName,
          teamAbbrev: v.teamAbbrev,
          teamNbaId: v.teamNbaId,
          conference: conf,
          position: 'G',
          isStarter: true,
          category: 'Guard',
          ovr: playerOvrMap.get(v.playerId),
        });
        pickedIds.add(v.playerId);
      });
    }
    return starters; // 10 total
  }
  static selectReserves(
    players: NBAPlayer[],
    teams: NBATeam[],
    season: number,
    starters: AllStarPlayer[],
    format?: string,
    teamCount?: number
  ): AllStarPlayer[] {
    if (format === 'usa_vs_world') {
      return AllStarSelectionService.selectReservesUsaWorld(
        players, teams, season, starters, teamCount ?? 3
      );
    }
    const starterIds = new Set(
      starters.map(s => s.playerId)
    );
    const reserves: AllStarPlayer[] = [];
    const isFrontcourt = (pos: string) =>
      pos === 'C' || pos === 'F' ||
      pos === 'PF' || pos === 'SF';
    const isGuard = (pos: string) =>
      pos === 'G' || pos === 'PG' || pos === 'SG';
    for (const conf of ['East', 'West'] as const) {
      const confTeamIds = new Set(
        teams.filter(t => t.conference === conf)
             .map(t => t.id)
      );
      const scored = players
        .filter(p => 
          p.status === 'Active' &&
          confTeamIds.has(p.tid) &&
          !starterIds.has(p.internalId)
        )
        .map(p => {
          const stat = p.stats?.find(
            s => s.season === season && !s.playoffs
          );
          const team = teams.find(t => t.id === p.tid);
          if (!stat || !team) return null;
          const gp = stat.gp || 1;
          const winPct = (team.wins + team.losses) > 0
            ? team.wins / (team.wins + team.losses)
            : 0.5;
         const score =
        (stat.pts / gp) * 0.7 +
        ((stat.trb || (stat.orb || 0) + (stat.drb || 0)) / gp) * 0.25 +
        (stat.ast / gp) * 0.35 +
        (p.overallRating ?? 50) * 0.25 +
        Math.min(3, stat.bpm ?? 0) * 0.5 +
        winPct * 1.5;
      return { player: p, score, team };
      })
        .filter(Boolean) as any[];
      const sorted = scored.sort(
        (a, b) => b.score - a.score
      );
      const pickedIds = new Set<string>();
      sorted.filter(s =>
        isFrontcourt(s.player.pos ?? '')
      ).slice(0, 2).forEach(({ player, team }) => {
        reserves.push({
          playerId: player.internalId,
          nbaId: extractNbaId(player.imgURL || "", player.name),
          playerName: player.name,
          teamAbbrev: team.abbrev,
          teamNbaId: extractTeamId(team.logoUrl || "", team.abbrev),
          conference: conf,
          position: player.pos ?? 'F',
          isStarter: false,
          category: 'Frontcourt',
          ovr: convertTo2KRating(player.overallRating ?? 50, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp),
        });
        pickedIds.add(player.internalId);
      });
      sorted.filter(s =>
        isGuard(s.player.pos ?? '') &&
        !pickedIds.has(s.player.internalId)
      ).slice(0, 2).forEach(({ player, team }) => {
        reserves.push({
          playerId: player.internalId,
          nbaId: extractNbaId(player.imgURL || "", player.name),
          playerName: player.name,
          teamAbbrev: team.abbrev,
          teamNbaId: extractTeamId(team.logoUrl || "", team.abbrev),
          conference: conf,
          position: player.pos ?? 'G',
          isStarter: false,
          category: 'Guard',
          ovr: convertTo2KRating(player.overallRating ?? 50, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp),
        });
        pickedIds.add(player.internalId);
      });
      sorted.filter(s =>
        !pickedIds.has(s.player.internalId)
      ).slice(0, 3).forEach(({ player, team }) => {
        reserves.push({
          playerId: player.internalId,
          nbaId: extractNbaId(player.imgURL || "", player.name),
          playerName: player.name,
          teamAbbrev: team.abbrev,
          teamNbaId: extractTeamId(team.logoUrl || "", team.abbrev),
          conference: conf,
          position: player.pos ?? 'F',
          isStarter: false,
          category: isGuard(player.pos ?? '') ? 'Guard' : 'Frontcourt',
          ovr: convertTo2KRating(player.overallRating ?? 50, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp),
        });
        pickedIds.add(player.internalId);
      });
    }
    return reserves; // 14 total reserves
  }
  static selectReservesUsaWorld(
    players: NBAPlayer[],
    teams: NBATeam[],
    season: number,
    starters: AllStarPlayer[],
    teamCount: number
  ): AllStarPlayer[] {
    const PER_TEAM = 8;
    const usaTeams   = teamCount >= 3 ? 2 : 1;
    const worldTeams = teamCount === 4 ? 2 : 1;
    const usaTotalTarget   = teamCount === 2 ? 12 : usaTeams   * PER_TEAM;
    const worldTotalTarget = teamCount === 2 ? 12 : worldTeams * PER_TEAM;
    const byId = new Map(players.map(p => [p.internalId, p]));
    const usaStarters   = starters.filter(s => isUsaPlayer(byId.get(s.playerId))).length;
    const worldStarters = starters.length - usaStarters;
    const usaNeeded   = Math.max(0, usaTotalTarget   - usaStarters);
    const worldNeeded = Math.max(0, worldTotalTarget - worldStarters);
    const starterIds = new Set(starters.map(s => s.playerId));
    const scored = players
      .filter(p =>
        p.status === 'Active' &&
        (p.tid ?? -1) >= 0 &&
        !starterIds.has(p.internalId)
      )
      .map(p => {
        const stat = p.stats?.find(s => s.season === season && !s.playoffs);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team) return null;
        const gp = stat.gp || 1;
        const winPct = (team.wins + team.losses) > 0 ? team.wins / (team.wins + team.losses) : 0.5;
        const score =
          (stat.pts / gp) * 0.7 +
          (((stat.trb || (stat.orb || 0) + (stat.drb || 0))) / gp) * 0.25 +
          (stat.ast / gp) * 0.35 +
          (p.overallRating ?? 50) * 0.25 +
          Math.min(3, stat.bpm ?? 0) * 0.5 +
          winPct * 1.5;
        return { player: p, score, team };
      })
      .filter(Boolean) as Array<{ player: NBAPlayer; score: number; team: NBATeam }>;
    scored.sort((a, b) => b.score - a.score);
    const usaPool   = scored.filter(s => isUsaPlayer(s.player));
    const worldPool = scored.filter(s => !isUsaPlayer(s.player));
    const isGuard = (pos: string) => pos === 'G' || pos === 'PG' || pos === 'SG';
    const buildEntry = ({ player, team }: { player: NBAPlayer; team: NBATeam }, conf: string): AllStarPlayer => ({
      playerId: player.internalId,
      nbaId: extractNbaId(player.imgURL || '', player.name),
      playerName: player.name,
      teamAbbrev: team.abbrev,
      teamNbaId: extractTeamId(team.logoUrl || '', team.abbrev),
      conference: conf as any,
      position: player.pos ?? 'F',
      isStarter: false,
      category: isGuard(player.pos ?? '') ? 'Guard' : 'Frontcourt',
      ovr: convertTo2KRating(
        player.overallRating ?? 50,
        player.ratings?.[player.ratings.length - 1]?.hgt ?? 50,
        player.ratings?.[player.ratings.length - 1]?.tp
      ),
    });
    return [
      ...usaPool.slice(0, usaNeeded).map(s => buildEntry(s, 'East')),
      ...worldPool.slice(0, worldNeeded).map(s => buildEntry(s, 'West')),
    ];
  }
  static getRisingStarsRoster(
    players: NBAPlayer[],
    season: number
  ): { rookies: NBAPlayer[], sophs: NBAPlayer[] } {
    const getScore = (p: NBAPlayer) => {
      const stat = p.stats?.find(s => s.season === season && !s.playoffs);
      if (!stat || stat.gp < 10) return (p.overallRating ?? 0) * 0.5;
      const gp = stat.gp;
      const ppg = stat.pts / gp;
      const rpg = (stat.trb || (stat.orb || 0) + (stat.drb || 0)) / gp;
      const apg = stat.ast / gp;
      return (p.overallRating ?? 0) * 0.4 + (ppg * 0.3) + (rpg * 0.15) + (apg * 0.15);
    };
    const rookies = players.filter(p =>
      p.status === 'Active' &&
      p.draft?.year === season - 1
    ).sort((a,b) =>
      getScore(b) - getScore(a)
    ).slice(0, 10);
    const sophs = players.filter(p =>
      p.status === 'Active' &&
      p.draft?.year === season - 2
    ).sort((a,b) =>
      getScore(b) - getScore(a)
    ).slice(0, 10);
    return { rookies, sophs };
  }
  private static readonly RS_COACH_POOL = [
    { first: 'Carmelo', last: 'Anthony',  abbrev: 'MLO' },
    { first: 'Tracy',   last: 'McGrady',  abbrev: 'TMC' },
    { first: 'Vince',   last: 'Carter',   abbrev: 'VIN' },
    { first: 'Deron',   last: 'Williams', abbrev: 'DWL' },
    { first: 'Pau',     last: 'Gasol',    abbrev: 'GSL' },
    { first: 'Joakim',  last: 'Noah',     abbrev: 'NOH' },
    { first: 'Jalen',   last: 'Rose',     abbrev: 'RSE' },
    { first: 'Jason',   last: 'Terry',    abbrev: 'TRY' },
  ];
  private static readonly RS_GLEAGUE_COACHES = [
    'Austin Rivers', 'Jeremy Lin', 'Jason Terry', 'Detlef Schrempf',
  ];
  static get4TeamRisingStarsRoster(players: NBAPlayer[], season: number): {
    nbaTeams: [NBAPlayer[], NBAPlayer[], NBAPlayer[]];
    gLeaguePlayers: NBAPlayer[];
    coaches: string[];
    teamNames: string[];
    teamAbbrevs: string[];
  } {
    const getScore = (p: NBAPlayer) => {
      const stat = p.stats?.find(s => s.season === season && !s.playoffs);
      if (!stat || stat.gp < 10) return (p.overallRating ?? 0) * 0.5;
      const gp = stat.gp;
      const ppg = stat.pts / gp;
      const rpg = (stat.trb || (stat.orb || 0) + (stat.drb || 0)) / gp;
      const apg = stat.ast / gp;
      return (p.overallRating ?? 0) * 0.4 + (ppg * 0.3) + (rpg * 0.15) + (apg * 0.15);
    };
    const draftEligible = (p: NBAPlayer) =>
      (p.draft?.year === season - 1 || p.draft?.year === season - 2) &&
      !(p as any).externalLeague;
    const activePool = players
      .filter(p => p.status === 'Active' && draftEligible(p))
      .sort((a, b) => getScore(b) - getScore(a));
    const realGLeague = players
      .filter(p => p.status === 'G-League')
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
    const legacyAssigned = activePool.filter(p => (p as any).gLeagueAssigned === true);
    const gleaguePool = [...realGLeague, ...legacyAssigned].slice(0, 7);
    if (gleaguePool.length < 7) {
      const taken = new Set(gleaguePool.map(p => p.internalId));
      const fillers = activePool
        .filter(p => !taken.has(p.internalId))
        .slice(-21)
        .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0))
        .slice(0, 7 - gleaguePool.length);
      gleaguePool.push(...fillers);
    }
    const gleagueIds = new Set(gleaguePool.map(p => p.internalId));
    const nbaPool = activePool.filter(p => !gleagueIds.has(p.internalId)).slice(0, 21);
    const t1: NBAPlayer[] = [], t2: NBAPlayer[] = [], t3: NBAPlayer[] = [];
    const slots = [t1, t2, t3, t3, t2, t1]; // snake: 1,2,3,3,2,1,1,2,3,...
    nbaPool.forEach((p, i) => {
      const round = Math.floor(i / 3);
      const pos = i % 3;
      const snakePos = round % 2 === 0 ? pos : 2 - pos;
      [t1, t2, t3][snakePos].push(p);
    });
    const pool = this.RS_COACH_POOL;
    const offset = season % pool.length;
    const coaches3 = [
      pool[offset % pool.length],
      pool[(offset + 1) % pool.length],
      pool[(offset + 2) % pool.length],
    ];
    const gLeagueCoach = this.RS_GLEAGUE_COACHES[season % this.RS_GLEAGUE_COACHES.length];
    return {
      nbaTeams: [t1, t2, t3],
      gLeaguePlayers: gleaguePool,
      coaches: [
        `${coaches3[0].first} ${coaches3[0].last}`,
        `${coaches3[1].first} ${coaches3[1].last}`,
        `${coaches3[2].first} ${coaches3[2].last}`,
        gLeagueCoach,
      ],
      teamNames: [
        `Team ${coaches3[0].first}`,
        `Team ${coaches3[1].first}`,
        `Team ${coaches3[2].first}`,
        'G League',
      ],
      teamAbbrevs: [coaches3[0].abbrev, coaches3[1].abbrev, coaches3[2].abbrev, 'GGL'],
    };
  }
  static getRandomRisingStarsRoster(players: NBAPlayer[], season: number, teamCount: 2 | 4): NBAPlayer[][] {
    const eligible = players.filter(p =>
      p.status === 'Active' &&
      (p.draft?.year === season - 1 || p.draft?.year === season - 2) &&
      !(p as any).externalLeague
    ).sort(() => Math.random() - 0.5);
    const perTeam = teamCount === 4 ? 7 : 10;
    const pool = eligible.slice(0, perTeam * teamCount);
    const teams: NBAPlayer[][] = Array.from({ length: teamCount }, () => []);
    pool.forEach((p, i) => teams[i % teamCount].push(p));
    return teams;
  }
}
