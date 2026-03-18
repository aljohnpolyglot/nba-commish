import { NBAPlayer, NBATeam, AllStarVoteCount, AllStarPlayer } from '../../types';
import { getAllStarWeekendDates } from './AllStarWeekendOrchestrator';
import { extractNbaId, extractTeamId, convertTo2KRating } from '../../utils/helpers';

export const ALL_STAR_ASSETS = {
  eastLogo: 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748',
  westLogo: 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726',
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
      players.map(p => [p.internalId, convertTo2KRating(p.overallRating ?? 50, (p as any).hgt ?? 77)])
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
            (stat.pts / gp) * 0.8 +
            ((stat.trb || (stat.orb||0)+(stat.drb||0)) / gp) * 0.3 +
            (stat.ast / gp) * 0.4 +
            (stat.bpm ?? 0) * 1.2 +
            winPct * 3;
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
          ovr: convertTo2KRating(player.overallRating ?? 50, (player as any).hgt ?? 77),
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
          ovr: convertTo2KRating(player.overallRating ?? 50, (player as any).hgt ?? 77),
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
          ovr: convertTo2KRating(player.overallRating ?? 50, (player as any).hgt ?? 77),
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
}
