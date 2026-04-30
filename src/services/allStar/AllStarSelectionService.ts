import { NBAPlayer, NBATeam, AllStarVoteCount, AllStarPlayer } from '../../types';
import { getAllStarWeekendDates } from './AllStarWeekendOrchestrator';
import { extractNbaId, extractTeamId, convertTo2KRating, getCountryFromLoc } from '../../utils/helpers';

// USA = East bucket, World = West bucket (keeps downstream sim/filter code unchanged)
export const isUsaPlayer = (p: NBAPlayer | undefined): boolean => {
  if (!p) return false;
  const country = getCountryFromLoc(p.born?.loc);
  return country === 'United States';
};

export const applyUsaWorldFormat = (
  roster: AllStarPlayer[],
  players: NBAPlayer[]
): AllStarPlayer[] => {
  const byId = new Map(players.map(p => [p.internalId, p]));
  return roster.map(r => ({
    ...r,
    conference: isUsaPlayer(byId.get(r.playerId)) ? 'East' : 'West',
  }));
};

// ── PR1: bucket dispatcher ────────────────────────────────────────────────
export type AllStarBucketKey = 'East' | 'West' | 'USA1' | 'USA2' | 'WORLD' | 'WORLD1' | 'WORLD2';

const ovrOf = (r: AllStarPlayer) => r.ovr ?? 0;

// Snake draft an ordered pool into N buckets. Bucket order rotates each round.
const snakeDraft = (pool: AllStarPlayer[], buckets: AllStarBucketKey[]): AllStarPlayer[] => {
  const sorted = [...pool].sort((a, b) => ovrOf(b) - ovrOf(a));
  const N = buckets.length;
  return sorted.map((p, i) => {
    const round = Math.floor(i / N);
    const idx = round % 2 === 0 ? i % N : N - 1 - (i % N);
    return { ...p, conference: buckets[idx] };
  });
};

const bucketCaptainsDraft = (
  roster: AllStarPlayer[],
  votes: AllStarVoteCount[]
): AllStarPlayer[] => {
  // Top-2 vote-getters that are actually on the roster become captains.
  const rosterIds = new Set(roster.map(r => r.playerId));
  const captains = votes
    .filter(v => rosterIds.has(v.playerId))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 2)
    .map(v => v.playerId);

  // Fallback when no votes (e.g. fresh sim) — take top-2 by OVR.
  if (captains.length < 2) {
    const fallback = [...roster].sort((a, b) => ovrOf(b) - ovrOf(a)).slice(0, 2).map(r => r.playerId);
    while (captains.length < 2 && fallback.length) captains.push(fallback.shift()!);
  }

  // Random captain assignment for variety.
  if (Math.random() < 0.5) captains.reverse();

  const result: AllStarPlayer[] = [];
  result.push({ ...roster.find(r => r.playerId === captains[0])!, conference: 'East', isCaptain: true } as any);
  result.push({ ...roster.find(r => r.playerId === captains[1])!, conference: 'West', isCaptain: true } as any);

  // Real LeBron-vs-Giannis captains draft does TWO separate snakes: starters first
  // (so each team ends 5-5 starters), then reserves. Snaking the whole pool by OVR
  // lets one captain hoard high-OVR starters → 4/6 imbalance.
  const remaining = roster.filter(r => !captains.includes(r.playerId));
  const remainingStarters = remaining.filter(r => r.isStarter);
  const remainingReserves = remaining.filter(r => !r.isStarter);
  result.push(...snakeDraft(remainingStarters, ['East', 'West']));
  result.push(...snakeDraft(remainingReserves, ['East', 'West']));
  return result;
};

const bucketUsaWorld = (
  roster: AllStarPlayer[],
  players: NBAPlayer[],
  teamCount: number
): AllStarPlayer[] => {
  const byId = new Map(players.map(p => [p.internalId, p]));
  const usa = roster.filter(r => isUsaPlayer(byId.get(r.playerId)));
  const world = roster.filter(r => !isUsaPlayer(byId.get(r.playerId)));

  if (teamCount === 2) {
    return [
      ...usa.map(r => ({ ...r, conference: 'East' as string })),
      ...world.map(r => ({ ...r, conference: 'West' as string })),
    ];
  }

  if (teamCount === 3) {
    // Top-up balance: WORLD needs ≥8, USA needs ≥16. If short, pull from the larger pool by lowest OVR.
    const usaSorted = [...usa].sort((a, b) => ovrOf(b) - ovrOf(a));
    const worldSorted = [...world].sort((a, b) => ovrOf(b) - ovrOf(a));
    while (worldSorted.length < 8 && usaSorted.length > 16) {
      worldSorted.push(usaSorted.pop()!);
    }
    while (usaSorted.length < 16 && worldSorted.length > 8) {
      usaSorted.push(worldSorted.pop()!);
    }
    const usaSplit = snakeDraft(usaSorted, ['USA1', 'USA2']);
    const worldTagged = worldSorted.map(r => ({ ...r, conference: 'WORLD' as string }));
    return [...usaSplit, ...worldTagged];
  }

  // teamCount === 4
  const usaSorted = [...usa].sort((a, b) => ovrOf(b) - ovrOf(a));
  const worldSorted = [...world].sort((a, b) => ovrOf(b) - ovrOf(a));
  // Aim for 12/12 USA/World; pull from larger side if needed.
  while (worldSorted.length < 12 && usaSorted.length > 12) worldSorted.push(usaSorted.pop()!);
  while (usaSorted.length < 12 && worldSorted.length > 12) usaSorted.push(worldSorted.pop()!);
  return [
    ...snakeDraft(usaSorted, ['USA1', 'USA2']),
    ...snakeDraft(worldSorted, ['WORLD1', 'WORLD2']),
  ];
};

/**
 * PR1 dispatcher — assigns bucket keys to each roster entry based on the
 * commissioner-configured All-Star format + team count. Bucket sim/UI is wired
 * in PR2/PR3.
 */
export const bucketRoster = (
  roster: AllStarPlayer[],
  players: NBAPlayer[],
  votes: AllStarVoteCount[],
  format: string | undefined,
  teamCount: number | undefined
): AllStarPlayer[] => {
  const fmt = format ?? 'east_vs_west';
  const tc = teamCount ?? 2;
  if (fmt === 'captains_draft') return bucketCaptainsDraft(roster, votes);
  if (fmt === 'usa_vs_world') return bucketUsaWorld(roster, players, tc);
  // east_vs_west / blacks_vs_whites / unknown — leave the East/West tags from
  // selectStarters/selectReserves untouched.
  return roster;
};

export const ALL_STAR_ASSETS = {
  eastLogo: 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748',
  westLogo: 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726',
  usaLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Flag_of_the_United_States.svg/200px-Flag_of_the_United_States.svg.png',
  worldLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Globe_icon.svg/200px-Globe_icon.svg.png',
  risingStarsLogo: 'https://static.wikia.nocookie.net/logopedia/images/c/c9/NBA_Rising_Stars_logo.png/revision/latest?cb=20220219191714',
  celebrityLogo: 'https://static.wikia.nocookie.net/logopedia/images/4/4e/NBA_All-Star_Celebrity_Game_logo.png/revision/latest?cb=20220219191738',
};

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
    
    // Calculate progress through voting period (0 to 1)
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
        
        // Base daily votes scaled to reach ~5M for top players over ~30 days
        // Top perfScore is around 30-40. 
        // 40 * 1.5 * 1.5 * 1.0 * 4000 * 30 = 10,800,000 (too high)
        // Let's use a base that results in ~150k per day for top stars
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
          // Initial "floor" votes if just starting, scaled by progress to avoid 20M starts
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
      
    // Cap logic: if we are at the end, ensure leader is around 3.5M
    // This is more of a scaling than a hard cap
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
    // Build a quick lookup for ovr by internalId
    const playerOvrMap = new Map<string, number>(
      players.map(p => [p.internalId, convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp)])
    );

    for (const conf of ['East', 'West'] as const) {
      const confVotes = votes
        .filter(v => v.conference === conf)
        .sort((a, b) => b.votes - a.votes);

      const pickedIds = new Set<string>();

      // FRONTCOURT — top 3 votes among F and C
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

      // GUARDS — top 2 votes among G only
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
    starters: AllStarPlayer[]
  ): AllStarPlayer[] {
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

      // 2 frontcourt reserves
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

      // 2 guard reserves
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

      // 3 wildcards — best remaining
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

  /** Coach legend pool for 4-team tournament, cycles by season. */
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

    // Rookie + sophomore eligible pool. Active NBA players first; the G-League
    // team pulls from `status === 'G-League'` since we no longer auto-assign
    // gLeagueAssigned (the flag is only present on legacy saves).
    const draftEligible = (p: NBAPlayer) =>
      (p.draft?.year === season - 1 || p.draft?.year === season - 2) &&
      !(p as any).externalLeague;
    const activePool = players
      .filter(p => p.status === 'Active' && draftEligible(p))
      .sort((a, b) => getScore(b) - getScore(a));

    // G-League pool: real-status G-League players (any draft year) sorted by OVR,
    // with legacy-flagged gLeagueAssigned and bottom-tier rookies as fallbacks
    // so the team is never empty even on rosters with no formal G-League assignees.
    const realGLeague = players
      .filter(p => p.status === 'G-League')
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
    const legacyAssigned = activePool.filter(p => (p as any).gLeagueAssigned === true);
    const gleaguePool = [...realGLeague, ...legacyAssigned].slice(0, 7);
    // Fallback: pad with bottom-tier rookies if still under the 7-deep target.
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

    // Snake draft into 3 NBA teams
    const t1: NBAPlayer[] = [], t2: NBAPlayer[] = [], t3: NBAPlayer[] = [];
    const slots = [t1, t2, t3, t3, t2, t1]; // snake: 1,2,3,3,2,1,1,2,3,...
    nbaPool.forEach((p, i) => {
      const round = Math.floor(i / 3);
      const pos = i % 3;
      const snakePos = round % 2 === 0 ? pos : 2 - pos;
      [t1, t2, t3][snakePos].push(p);
    });

    // Pick 3 coaches cycling by season
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

  /** Randomly split eligible RS pool into 2 or 4 equal teams. */
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
