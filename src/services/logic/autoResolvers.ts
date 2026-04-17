import { GameState, NonNBATeam, NewsItem } from '../../types';
import { generateSchedule } from '../gameScheduler';
import { AwardService } from './AwardService';
import { NewsGenerator } from '../news/NewsGenerator';

// ── Schedule Generation (Aug 14) ──────────────────────────────────────────
export const autoGenerateSchedule = (state: GameState): Partial<GameState> => {
  // Only count games from the CURRENT season to avoid stale prior-season games
  // blocking regeneration after a season rollover.
  const year = state.leagueStats.year;
  const seasonStart = `${year - 1}-10-01`;
  const seasonEnd   = `${year}-06-30`;
  const hasRegularSeason = state.schedule.some(
    g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn
         && g.date >= seasonStart && g.date <= seasonEnd
  );
  if (hasRegularSeason) return {}; // already generated, skip
  // Strip any old-season games that are no longer relevant
  const intlPreseasonGames = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
         && g.date >= seasonStart
  );
  let schedule = generateSchedule(
    state.teams,
    state.christmasGames,
    state.globalGames,
    state.leagueStats.numGamesDiv ?? null,
    state.leagueStats.numGamesConf ?? null,
    state.leagueStats.mediaRights,
    state.leagueStats.year
  );
  if (intlPreseasonGames.length > 0) {
    // Re-gid intl games to start after the freshly generated schedule's max gid
    // so they never collide with regular/preseason game gids (which start from 0)
    const maxGid = Math.max(0, ...schedule.map(g => g.gid));
    const renumbered = intlPreseasonGames.map((g, i) => ({ ...g, gid: maxGid + 1 + i }));
    schedule = [...schedule, ...renumbered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }
  return { schedule };
};

// ── International Preseason Auto-Schedule (Aug 13) ────────────────────────
// Auto-picks 5 intl preseason games (2 Euroleague, 2 B-League, 1 PBA) if the
// commissioner hasn't scheduled any manually. NBA opponents are drawn from the
// top 5 teams by strength; non-NBA opponents are chosen from the top 5 in each
// league ranked by their players' average overall rating.
export const autoScheduleIntlPreseason = (state: GameState): Partial<GameState> => {
  // Skip if commissioner already scheduled intl preseason games
  const existingIntl = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
  );
  if (existingIntl.length > 0) return {};

  const nonNBATeams: NonNBATeam[] = (state as any).nonNBATeams ?? [];
  if (nonNBATeams.length === 0) return {};

  // Compute non-NBA team strength from player average rating
  const playersByTid = new Map<number, number[]>();
  state.players.forEach(p => {
    if (!playersByTid.has(p.tid)) playersByTid.set(p.tid, []);
    playersByTid.get(p.tid)!.push(p.overallRating ?? 70);
  });
  const teamStrength = (tid: number) => {
    const ratings = playersByTid.get(tid);
    if (!ratings || ratings.length === 0) return 0;
    return ratings.reduce((s, r) => s + r, 0) / ratings.length;
  };

  // NBA opponents: pick randomly from top 5 by strength, no repeats
  const sortedNBA = [...state.teams].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const usedNBA = new Set<number>();
  const pickNBA = () => {
    const pool = sortedNBA.filter(t => !usedNBA.has(t.id)).slice(0, 5);
    if (pool.length === 0) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedNBA.add(pick.id);
    return pick;
  };

  // Non-NBA opponents: pick randomly from top 5 by player strength, no repeats
  // Require at least 9 players so the sim can field a proper rotation
  const playerCount = (tid: number) => playersByTid.get(tid)?.length ?? 0;
  const usedNonNBA = new Set<number>();
  const pickNonNBA = (league: NonNBATeam['league']) => {
    const pool = nonNBATeams
      .filter(t => t.league === league && !usedNonNBA.has(t.tid) && playerCount(t.tid) >= 8)
      .sort((a, b) => teamStrength(b.tid) - teamStrength(a.tid))
      .slice(0, 5);
    if (pool.length === 0) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedNonNBA.add(pick.tid);
    return pick;
  };

  let gid = Math.max(0, ...state.schedule.map(g => g.gid)) + 1;
  const makeGame = (nba: any, nonNBA: NonNBATeam, date: string) => ({
    gid: gid++,
    homeTid: nba.id,
    awayTid: nonNBA.tid,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: new Date(`${date}T00:00:00Z`).toISOString(),
    isPreseason: true,
    city: nonNBA.region || 'International',
    country: nonNBA.league,
  });

  // Schedule: 2 Euroleague, 2 B-League, 1 PBA, 1 China CBA, 1 NBL Australia (all within Oct 1–15 preseason window)
  const plan: [NonNBATeam['league'], string][] = [
    ['Euroleague',   '2025-10-02'],
    ['B-League',     '2025-10-04'],
    ['Euroleague',   '2025-10-07'],
    ['China CBA',     '2025-10-09'],
    ['B-League',     '2025-10-11'],
    ['NBL Australia', '2025-10-13'],
    ['PBA',          '2025-10-15'],
  ];

  const newGames: any[] = [];
  for (const [league, date] of plan) {
    const nonNBA = pickNonNBA(league);
    const nba = pickNBA();
    if (nonNBA && nba) newGames.push(makeGame(nba, nonNBA, date));
  }

  if (newGames.length === 0) return {};

  const schedule = [...state.schedule, ...newGames].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return { schedule };
};

// ── Christmas Games ────────────────────────────────────────────────────────
export const autoPickChristmasGames = (state: GameState): Partial<GameState> => {
  const east = [...state.teams]
    .filter(t => t.conference === 'East')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 5);
  const west = [...state.teams]
    .filter(t => t.conference === 'West')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 5);

  const games = east.slice(0, 5).map((eTeam, i) => ({
    homeTid: i % 2 === 0 ? eTeam.id : west[i]?.id ?? eTeam.id,
    awayTid: i % 2 === 0 ? west[i]?.id ?? eTeam.id : eTeam.id,
  }));

  return { christmasGames: games };
};

// ── Global Games ───────────────────────────────────────────────────────────
export const autoPickGlobalGames = (state: GameState): Partial<GameState> => {
  // Don't overwrite games the commissioner already configured
  if (state.globalGames && state.globalGames.length > 0) return {};
  return { globalGames: [] };
};

// ── All-Star Voting ────────────────────────────────────────────────────────
export const autoSimVotes = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { getAllStarWeekendDates } = await import('../allStar/AllStarWeekendOrchestrator');
    const { AllStarSelectionService } = await import('../allStar/AllStarSelectionService');
    const dates = getAllStarWeekendDates(state.leagueStats.year);

    const votes = AllStarSelectionService.simulateVotingPeriod(
      state.players,
      state.teams,
      state.leagueStats.year,
      dates.votingEnd,
      [],
      28
    );

    return {
      allStar: {
        season: state.leagueStats.year,
        startersAnnounced: false,
        reservesAnnounced: false,
        roster: [],
        weekendComplete: false,
        ...(state.allStar ?? {}),
        votes,
      } as any,
    };
  } catch (err) {
    console.warn('autoSimVotes failed:', err);
    return {};
  }
};

// ── All-Star Starters ──────────────────────────────────────────────────────
export const autoAnnounceStarters = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarSelectionService } = await import('../allStar/AllStarSelectionService');
    const starters = AllStarSelectionService.selectStarters(
      state.allStar?.votes ?? [],
      state.players
    );
    return {
      allStar: {
        ...(state.allStar as any),
        roster: starters,
        startersAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoAnnounceStarters failed:', err);
    return {};
  }
};

// ── All-Star Reserves + Rising Stars + Celebrity ───────────────────────────
export const autoAnnounceReserves = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarSelectionService } = await import('../allStar/AllStarSelectionService');
    const reserves = AllStarSelectionService.selectReserves(
      state.players,
      state.teams,
      state.leagueStats.year,
      state.allStar?.roster ?? []
    );
    const fullRoster = [...(state.allStar?.roster ?? []), ...reserves];

    // Write All-Star selection to player.awards (idempotent: skip if already present)
    const season = state.leagueStats.year;
    const allStarIds = new Set(fullRoster.map((r: any) => r.playerId));
    const playersWithAllStar = state.players.map(p => {
      if (!allStarIds.has(p.internalId)) return p;
      const already = (p.awards ?? []).some(a => a.season === season && a.type === 'All-Star');
      if (already) return p;
      return { ...p, awards: [...(p.awards ?? []), { season, type: 'All-Star' }] };
    });

    let risingStarsRoster: any[] = [];
    try {
      const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(
        state.players,
        state.leagueStats.year
      );
      const getCategory = (pos: string) =>
        pos === 'G' || pos === 'PG' || pos === 'SG' ? 'Guard' : 'Frontcourt';
      risingStarsRoster = [...rookies, ...sophs].map(p => {
        const team = state.teams.find(t => t.id === p.tid);
        return {
          playerId: p.internalId,
          playerName: p.name,
          teamAbbrev: team?.abbrev ?? '',
          conference: team?.conference ?? '',
          isStarter: true,
          position: p.pos ?? 'F',
          category: getCategory(p.pos ?? 'F'),
          isRookie: rookies.includes(p),
          nbaId: (p as any).nbaId,
          imgURL: (p as any).imgURL,
        };
      });
    } catch (e) {
      console.warn('Rising Stars auto-select failed:', e);
    }

    let celebrityRoster: string[] = [];
    try {
      const { fetchRatedCelebrities } = await import('../../data/celebrities');
      const celebs = await fetchRatedCelebrities();
      celebrityRoster = [...celebs].sort(() => Math.random() - 0.5).slice(0, 20).map((c: any) => c.name);
    } catch (e) {
      console.warn('Celebrity roster auto-select failed:', e);
    }

    const broadcasters = ['Shannon', 'Stephen A', 'Chuck', 'Shaq', 'Kenny', 'Ernie'];
    const shuffled = [...broadcasters].sort(() => Math.random() - 0.5);

    return {
      players: playersWithAllStar,
      allStar: {
        ...(state.allStar as any),
        roster: fullRoster,
        reservesAnnounced: true,
        risingStarsRoster,
        risingStarsAnnounced: true,
        risingStarsTeams: [`Team ${shuffled[0]}`, `Team ${shuffled[1]}`],
        celebrityAnnounced: true,
        celebrityRoster,
        celebrityTeams: [`Team ${shuffled[2]}`, `Team ${shuffled[3]}`],
      },
    };
  } catch (err) {
    console.warn('autoAnnounceReserves failed:', err);
    return {};
  }
};

// ── Dunk Contest Contestants ───────────────────────────────────────────────
export const autoSelectDunkContestants = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarDunkContestSim } = await import('../allStar/AllStarDunkContestSim');
    const contestants = AllStarDunkContestSim.selectContestants(state.players);
    return {
      allStar: {
        ...(state.allStar as any),
        dunkContestContestants: contestants,
        dunkContestAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoSelectDunkContestants failed:', err);
    return {};
  }
};

// ── 3-Point Contest Contestants ────────────────────────────────────────────
export const autoSelectThreePointContestants = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarThreePointContestSim } = await import('../allStar/AllStarThreePointContestSim');
    const contestants = AllStarThreePointContestSim.selectContestants(
      state.players,
      state.leagueStats.year
    );
    return {
      allStar: {
        ...(state.allStar as any),
        threePointContestants: contestants,
        threePointAnnounced: true,
      },
    };
  } catch (err) {
    console.warn('autoSelectThreePointContestants failed:', err);
    return {};
  }
};

// ── All-Star Weekend (full sim) ────────────────────────────────────────────
export const autoSimAllStarWeekend = async (state: GameState): Promise<Partial<GameState>> => {
  try {
    const { AllStarWeekendOrchestrator, getAllStarWeekendDates } = await import('../allStar/AllStarWeekendOrchestrator');

    let stateForSim = state;

    // Auto-replace injured All-Stars before simulating the weekend
    if (stateForSim.allStar?.roster && stateForSim.allStar.roster.length > 0) {
      const updatedRoster = [...stateForSim.allStar.roster];
      let rosterChanged = false;

      for (const rosterSpot of updatedRoster) {
        if (rosterSpot.isInjuredDNP) continue; // already marked DNP

        // Find if this All-Star is currently injured
        const player = stateForSim.players.find(p => p.internalId === rosterSpot.playerId);
        if (!player?.injury || player.injury.gamesRemaining <= 0) continue;

        // Mark as DNP
        rosterSpot.isInjuredDNP = true;
        rosterChanged = true;

        // Find a replacement from the same conference who isn't already in the roster
        const rosterIds = new Set(updatedRoster.map(r => r.playerId));
        const conf = rosterSpot.conference;
        const candidate = [...stateForSim.players]
          .filter(p =>
            !rosterIds.has(p.internalId) &&
            (!p.injury || p.injury.gamesRemaining <= 0) &&
            stateForSim.teams.find(t => t.id === p.tid)?.conference === conf
          )
          .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0];

        if (candidate) {
          const candidateTeam = stateForSim.teams.find(t => t.id === candidate.tid);
          updatedRoster.push({
            playerId: candidate.internalId,
            playerName: candidate.name,
            teamAbbrev: candidateTeam?.abbrev ?? '',
            nbaId: null,
            teamNbaId: null,
            conference: conf,
            isStarter: false,
            position: candidate.pos ?? 'F',
            category: (candidate.pos?.includes('G') ? 'Guard' : 'Frontcourt') as 'Guard' | 'Frontcourt',
            ovr: candidate.overallRating,
            isInjuryReplacement: true,
            injuredPlayerId: rosterSpot.playerId,
          });
        }
      }

      if (rosterChanged) {
        stateForSim = {
          ...stateForSim,
          allStar: { ...stateForSim.allStar, roster: updatedRoster },
        };
      }
    }

    if (!(stateForSim.allStar as any)?.gamesInjected) {
      const newSchedule = AllStarWeekendOrchestrator.injectAllStarGames(
        stateForSim.schedule,
        stateForSim.teams,
        stateForSim.leagueStats.year,
        stateForSim.allStar?.roster ?? [],
        stateForSim.leagueStats
      );
      stateForSim = {
        ...stateForSim,
        schedule: newSchedule,
        allStar: { ...(stateForSim.allStar as any), gamesInjected: true },
      };
    }

    const patch = await AllStarWeekendOrchestrator.simulateWeekend(stateForSim, {
      friday: true,
      saturday: true,
      sunday: true,
    });

    // Carry forward the updated roster with injury replacements applied
    if (patch.allStar) {
      patch.allStar = { ...(patch.allStar as any), roster: stateForSim.allStar?.roster ?? (patch.allStar as any).roster };
    }

    return patch;
  } catch (err) {
    console.warn('autoSimAllStarWeekend failed:', err);
    return {};
  }
};

// ── Season Award Announcements — staggered by real NBA dates ─────────────────
// Each award is announced on its own date. The resolver checks if that specific
// award is already stored before running, so re-fires are safe.
//
// COY    Apr 19   SMOY   Apr 22   MIP    Apr 25
// DPOY   Apr 28   ROY    May 2    All-NBA May 7    MVP    May 21

type AwardKey = 'COY' | 'SMOY' | 'MIP' | 'DPOY' | 'ROY' | 'All-NBA' | 'MVP';

const PLAYER_AWARD_TYPE_MAP: Record<string, string> = {
  MVP:  'Most Valuable Player',
  DPOY: 'Defensive Player of the Year',
  ROY:  'Rookie of the Year',
  SMOY: 'Sixth Man of the Year',
  MIP:  'Most Improved Player',
};

function announceAward(state: GameState, key: AwardKey): Partial<GameState> {
  const season = state.leagueStats.year;
  const existing = (state.historicalAwards ?? []).filter(a => a.season === season);

  // Idempotency guard — map award key to the stored type name
  const storedType = key === 'All-NBA' ? 'All-NBA First Team' : key;
  if (existing.some(a => a.type === storedType)) return {};

  try {
    const races = AwardService.calculateAwardRaces(
      state.players, state.teams, season, state.staff, state.leagueStats.minGamesRequirement
    );

    const date = state.date;
    const newAwards: import('../../types').HistoricalAward[] = [];
    const newsItems: NewsItem[] = [];
    let updatedPlayers = state.players;

    const addPlayerAward = (type: string, pid: string) => {
      const normalType = PLAYER_AWARD_TYPE_MAP[type] ?? type;
      updatedPlayers = updatedPlayers.map(p =>
        p.internalId === pid
          ? { ...p, awards: [...(p.awards ?? []), { season, type: normalType }] }
          : p
      );
    };

    if (key === 'COY') {
      const coy = races.coy[0];
      if (!coy) return {};
      newAwards.push({ season, type: 'COY', name: coy.coachName, tid: coy.team.id });
      const item = NewsGenerator.generate('award_coy', date, {
        coachName: coy.coachName, teamName: coy.team.name, year: season,
        wins: coy.wins, losses: coy.losses,
      }, coy.team.logoUrl);
      if (item) newsItems.push(item);
    }

    else if (key === 'SMOY') {
      const smoy = races.smoy[0];
      if (!smoy) return {};
      newAwards.push({ season, type: 'SMOY', name: smoy.player.name, pid: smoy.player.internalId, tid: smoy.team.id });
      addPlayerAward('SMOY', smoy.player.internalId);
      const gp = smoy.stats.gp || 1;
      const item = NewsGenerator.generate('award_smoy', date, {
        playerName: smoy.player.name, teamName: smoy.team.name, year: season,
        pts: (smoy.stats.pts / gp).toFixed(1),
      }, smoy.player.imgURL);
      if (item) { item.playerPortraitUrl = smoy.player.imgURL; newsItems.push(item); }
    }

    else if (key === 'MIP') {
      const mip = races.mip[0];
      if (!mip) return {};
      newAwards.push({ season, type: 'MIP', name: mip.player.name, pid: mip.player.internalId, tid: mip.team.id });
      addPlayerAward('MIP', mip.player.internalId);
      const gp = mip.stats.gp || 1;
      const item = NewsGenerator.generate('award_mip', date, {
        playerName: mip.player.name, teamName: mip.team.name, year: season,
        pts: (mip.stats.pts / gp).toFixed(1),
      }, mip.player.imgURL);
      if (item) { item.playerPortraitUrl = mip.player.imgURL; newsItems.push(item); }
    }

    else if (key === 'DPOY') {
      const dpoy = races.dpoy[0];
      if (!dpoy) return {};
      newAwards.push({ season, type: 'DPOY', name: dpoy.player.name, pid: dpoy.player.internalId, tid: dpoy.team.id });
      addPlayerAward('DPOY', dpoy.player.internalId);
      const item = NewsGenerator.generate('award_dpoy', date, {
        playerName: dpoy.player.name, teamName: dpoy.team.name, year: season,
      }, dpoy.player.imgURL);
      if (item) { item.playerPortraitUrl = dpoy.player.imgURL; newsItems.push(item); }
    }

    else if (key === 'ROY') {
      const roty = races.roty[0];
      if (!roty) return {};
      newAwards.push({ season, type: 'ROY', name: roty.player.name, pid: roty.player.internalId, tid: roty.team.id });
      addPlayerAward('ROY', roty.player.internalId);
      const gp = roty.stats.gp || 1;
      const item = NewsGenerator.generate('award_roty', date, {
        playerName: roty.player.name, teamName: roty.team.name, year: season,
        pts: (roty.stats.pts / gp).toFixed(1),
        reb: ((roty.stats.trb ?? 0) / gp).toFixed(1),
        ast: (roty.stats.ast / gp).toFixed(1),
      }, roty.player.imgURL);
      if (item) { item.playerPortraitUrl = roty.player.imgURL; newsItems.push(item); }
    }

    else if (key === 'All-NBA') {
      const { allNBA, allDefense, allRookie } = races.allNBATeams;
      if (!allNBA[0]?.length) return {};

      // All-NBA 1st / 2nd / 3rd teams
      const allNBANames = ['All-NBA First Team', 'All-NBA Second Team', 'All-NBA Third Team'] as const;
      allNBA.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allNBANames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
          addPlayerAward(allNBANames[i], spot.player.internalId);
        }
      });

      // All-Defensive 1st / 2nd teams
      const allDefNames = ['All-Defensive First Team', 'All-Defensive Second Team'] as const;
      allDefense.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allDefNames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
          addPlayerAward(allDefNames[i], spot.player.internalId);
        }
      });

      // All-Rookie 1st / 2nd teams
      const allRookieNames = ['All-Rookie First Team', 'All-Rookie Second Team'] as const;
      allRookie.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allRookieNames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
          addPlayerAward(allRookieNames[i], spot.player.internalId);
        }
      });

      const top = allNBA[0][0];
      const item = NewsGenerator.generate('award_allnba', date, {
        playerName: top.player.name, teamName: top.team.name, year: season,
      }, top.player.imgURL);
      if (item) { item.playerPortraitUrl = top.player.imgURL; newsItems.push(item); }
    }

    else if (key === 'MVP') {
      const mvp = races.mvp[0];
      if (!mvp) return {};
      newAwards.push({ season, type: 'MVP', name: mvp.player.name, pid: mvp.player.internalId, tid: mvp.team.id });
      addPlayerAward('MVP', mvp.player.internalId);
      const gp = mvp.stats.gp || 1;
      const item = NewsGenerator.generate('award_mvp', date, {
        playerName: mvp.player.name, teamName: mvp.team.name, year: season,
        pts: (mvp.stats.pts / gp).toFixed(1),
        reb: ((mvp.stats.trb ?? 0) / gp).toFixed(1),
        ast: (mvp.stats.ast / gp).toFixed(1),
      }, mvp.player.imgURL);
      if (item) { item.playerPortraitUrl = mvp.player.imgURL; newsItems.push(item); }
    }

    return {
      players: updatedPlayers,
      historicalAwards: [...(state.historicalAwards ?? []), ...newAwards],
      news: newsItems.length > 0
        ? [...newsItems, ...(state.news ?? [])].slice(0, 200)
        : state.news,
    };
  } catch (err) {
    console.warn(`announceAward(${key}) failed:`, err);
    return {};
  }
}

export const autoAnnounceCOY    = (s: GameState) => announceAward(s, 'COY');
export const autoAnnounceSMOY   = (s: GameState) => announceAward(s, 'SMOY');
export const autoAnnounceMIP    = (s: GameState) => announceAward(s, 'MIP');
export const autoAnnounceDPOY   = (s: GameState) => announceAward(s, 'DPOY');
export const autoAnnounceROY    = (s: GameState) => announceAward(s, 'ROY');
export const autoAnnounceAllNBA = (s: GameState) => announceAward(s, 'All-NBA');
export const autoAnnounceMVP    = (s: GameState) => announceAward(s, 'MVP');

/** @deprecated — kept for callers that haven't migrated; now a no-op since awards are staggered. */
export const autoAnnounceAwards = (_state: GameState): Partial<GameState> => ({});

// ── Rookie contract scale (mirrors DraftSimulatorView) ────────────────────
const _rookieScale = [
  10.1, 9.5, 9.0, 8.5, 7.9, 7.4, 6.9, 6.5, 6.1, 5.7,
  5.4, 5.1, 4.8, 4.5, 4.3, 4.1, 3.9, 3.7, 3.6, 3.4,
  3.3, 3.2, 3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.5, 2.4,
];
const _getRookieAmount = (slot: number): number => {
  if (slot <= 30) return (_rookieScale[slot - 1] ?? 2.4) * 1_000_000;
  const r2Frac = (slot - 31) / 29;
  return Math.round((1_800_000 - r2Frac * 530_000) / 1000) * 1000;
};

// ── Draft Lottery presets (mirrors DraftLotteryView LOTTERY_PRESETS) ──────
const _LOTTERY_PRESETS: Record<string, { chances: number[]; numToPick: number; total: number }> = {
  nba2019: { chances: [140,140,140,125,105,90,75,60,45,30,20,15,10,5], numToPick: 4, total: 1000 },
  nba1994: { chances: [250,199,156,119,88,63,43,28,17,11,8,7,6,5], numToPick: 3, total: 1000 },
  nba1990: { chances: [11,10,9,8,7,6,5,4,3,2,1], numToPick: 3, total: 66 },
  nba1987: { chances: [36,30,25,20,15,10,8,7,6,5,4,3,2,1], numToPick: 7, total: 172 },
  nba1985: { chances: [1,1,1,1,1,1,1], numToPick: 1, total: 7 },
  nba1966: { chances: [1,1], numToPick: 1, total: 2 },
  nhl2021: { chances: [185,135,115,95,85,75,65,60,50,35,30,25,20,5], numToPick: 2, total: 985 },
  nhl2017: { chances: [185,135,115,95,85,75,65,60,50,35,30,25,20,5], numToPick: 3, total: 985 },
  mlb2022: { chances: [165,165,165,130,110,100,90,76,65,50,40,30,10,4], numToPick: 6, total: 1200 },
};

function _runWeightedLottery<T extends { originalSeed: number }>(
  teams: T[],
  chances: number[],
  numToPick: number
): { pick: number; team: T; change: number }[] {
  const results: { pick: number; team: T; change: number }[] = [];
  const drawnSeeds = new Set<number>();
  const actual = Math.min(numToPick, teams.length);

  for (let i = 1; i <= actual; i++) {
    const avail = teams.filter(t => !drawnSeeds.has(t.originalSeed));
    const totalW = avail.reduce((s, t) => s + (chances[t.originalSeed - 1] ?? 0), 0);
    if (!totalW) break;
    let rnd = Math.random() * totalW;
    let winner = avail[0];
    for (const t of avail) {
      rnd -= chances[t.originalSeed - 1] ?? 0;
      if (rnd <= 0) { winner = t; break; }
    }
    drawnSeeds.add(winner.originalSeed);
    results.push({ pick: i, team: winner, change: winner.originalSeed - i });
  }

  // Fill remaining picks in standing order
  teams
    .filter(t => !drawnSeeds.has(t.originalSeed))
    .sort((a, b) => a.originalSeed - b.originalSeed)
    .forEach((t, idx) => results.push({ pick: idx + actual + 1, team: t, change: t.originalSeed - (idx + actual + 1) }));

  return results;
}

// ── Auto Draft Lottery (May 14) ───────────────────────────────────────────
/** Runs the draft lottery automatically and saves results to state.draftLotteryResult.
 *  Skips if lottery has already been run this season. */
export const autoRunLottery = (state: GameState): Partial<GameState> => {
  if ((state as any).draftLotteryResult) return {}; // already run

  const preset = _LOTTERY_PRESETS[state.leagueStats?.draftType ?? 'nba2019'] ?? _LOTTERY_PRESETS.nba2019;

  const sorted = [...state.teams]
    .filter(t => t.id > 0)
    .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)))
    .slice(0, 14);

  const lotteryTeams = sorted.map((t, i) => {
    const chance = preset.chances[i] ?? 0;
    const gp = t.wins + t.losses;
    const winPct = gp > 0 ? (t.wins / gp).toFixed(3) : '.000';
    return {
      id: String(t.id),
      tid: t.id,
      name: t.name,
      city: (t as any).region ?? t.name,
      logoUrl: (t as any).logoUrl ?? '',
      record: `${t.wins}-${t.losses}`,
      winPct,
      odds1st: parseFloat(((chance / preset.total) * 100).toFixed(1)),
      oddsTop4: parseFloat(((chance / preset.total) * 100 * preset.numToPick).toFixed(1)),
      color: (t as any).colors?.[0] ?? '#333333',
      originalSeed: i + 1,
    };
  });

  const draftLotteryResult = _runWeightedLottery(lotteryTeams, preset.chances, preset.numToPick);
  return { draftLotteryResult } as any;
};

// ── Auto Draft (June 26) ──────────────────────────────────────────────────
/** Auto-executes the NBA Draft: assigns top-OVR prospect to each pick slot.
 *  Commissioner-run drafts take precedence (skips if draftComplete is already true). */
export const autoRunDraft = (state: GameState): Partial<GameState> => {
  if ((state as any).draftComplete) return {}; // commissioner already ran the draft

  const season = state.leagueStats?.year ?? 2026;
  const rookieScaleType = state.leagueStats?.rookieScaleType ?? 'dynamic';
  const guaranteedYrs = state.leagueStats?.rookieContractLength ?? 2;
  const teamOptEnabled: boolean = (state.leagueStats as any)?.rookieTeamOptionsEnabled ?? true;
  const teamOptYears: number = (state.leagueStats as any)?.rookieTeamOptionYears ?? 2;
  const restrictedFA: boolean = (state.leagueStats as any)?.rookieRestrictedFreeAgentEligibility ?? true;
  const staticRookieAmt = ((state.leagueStats as any)?.rookieScaleStaticAmount ?? 3) * 1_000_000;

  const EXTERNAL_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);

  // Draft order: use lottery results for picks 1-14, playoff teams for 15-30 (mirrors DraftSimulatorView)
  const allSortedByRecord = [...state.teams]
    .filter(t => t.id > 0)
    .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)));

  const lotteryResults: any[] = state.draftLotteryResult ?? [];
  let r1Order: typeof allSortedByRecord;

  if (lotteryResults.length >= 14) {
    const lotteryTids = new Set(lotteryResults.map((r: any) => r.team?.tid ?? r.tid));
    const lotteryPicks = [...lotteryResults]
      .sort((a: any, b: any) => a.pickNumber - b.pickNumber)
      .map((r: any) => state.teams.find(t => t.id === (r.team?.tid ?? r.tid)))
      .filter(Boolean) as typeof allSortedByRecord;
    const playoffTeams = allSortedByRecord
      .filter(t => !lotteryTids.has(t.id))
      .reverse(); // best record picks last
    r1Order = [...lotteryPicks, ...playoffTeams];
  } else {
    // No lottery result — fall back to standings order (worst record first)
    r1Order = allSortedByRecord;
  }

  const draftOrder = [...r1Order, ...r1Order];

  // Available prospects for THIS season's draft class only (filter out future classes)
  const prospects = state.players
    .filter(p => {
      const isProspect = p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect';
      if (!isProspect) return false;
      if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
      const draftYear = (p as any).draft?.year;
      if (draftYear && Number(draftYear) !== season) return false;
      return true;
    })
    .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

  // Assign picks (best OVR available to each slot)
  const assignedIds = new Set<string>();
  const pickMap = new Map<number, { player: typeof state.players[0]; team: typeof state.teams[0] }>();

  for (let slot = 1; slot <= draftOrder.length; slot++) {
    const team = draftOrder[slot - 1];
    const best = prospects.find(p => !assignedIds.has(p.internalId));
    if (!best) break;
    assignedIds.add(best.internalId);
    pickMap.set(slot, { player: best, team });
  }

  // Apply picks to players
  const updatedPlayers = state.players.map(p => {
    for (const [slot, { player, team }] of pickMap.entries()) {
      if (player.internalId !== p.internalId) continue;
      const round = slot <= 30 ? 1 : 2;
      const pickInRound = slot <= 30 ? slot : slot - 30;
      const salaryAmount = rookieScaleType === 'static' ? staticRookieAmt : _getRookieAmount(slot);
      // R1: guaranteed years + team option years; R2: always 2yr, no team options
      const baseYrs   = round === 1 ? guaranteedYrs : 2;
      const optionYrs = (round === 1 && teamOptEnabled) ? teamOptYears : 0;
      const totalYrs  = baseYrs + optionYrs;
      return {
        ...p,
        tid: team.id,
        status: 'Active' as const,
        draft: { round, pick: pickInRound, year: season, tid: team.id, originalTid: team.id },
        contract: {
          amount: salaryAmount / 1_000,
          exp: season + totalYrs - 1,
          salaryDetails: [{ season, amount: salaryAmount }],
          // Team option and RFA metadata (mirrors finalizeDraft in DraftSimulatorView)
          ...(optionYrs > 0 && {
            hasTeamOption: true,
            teamOptionExp: season + baseYrs, // option kicks in after guaranteed years (decision summer before this season)
          }),
          ...(round === 1 && restrictedFA && { restrictedFA: true }),
          rookie: true,
        },
      };
    }
    // Undrafted current-year prospects → free agents (future classes stay as prospects)
    const draftYear = (p as any).draft?.year;
    const isCurrentClass = !draftYear || Number(draftYear) === season;
    if (isCurrentClass && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') && !assignedIds.has(p.internalId)) {
      return { ...p, tid: -1 as const, status: 'Free Agent' as const };
    }
    return p;
  });

  // ── Draft history entries ──────────────────────────────────────────────────
  const _ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const draftHistoryEntries: Array<{ text: string; date: string; type: string }> = [];
  for (const [slot, { player, team }] of pickMap.entries()) {
    draftHistoryEntries.push({
      text: `The ${team.name} select ${player.name} as the ${_ordinal(slot)} overall pick of the ${season} NBA Draft.`,
      date: state.date,
      type: 'Draft',
    });
  }

  // ── Two-way contract auto-assignment ──────────────────────────────────────
  // After the draft, each team may sign up to maxTwoWayPlayersPerTeam additional
  // players on two-way deals ($625K, don't count against 15-man standard cap).
  // Priority: undrafted FAs with lowest OVR (bubble / second-round fringe players).
  const TWO_WAY_SALARY_THOUSANDS = 625; // $625K in BBGM thousands convention
  const maxTwoWay = state.leagueStats?.maxTwoWayPlayersPerTeam ?? 2;
  const twoWayEnabled = state.leagueStats?.twoWayContractsEnabled ?? true;

  let twoWayPlayers = [...updatedPlayers];

  if (twoWayEnabled && maxTwoWay > 0) {
    // Pool: low-OVR FAs only (fringe/bubble candidates, NOT established NBA players).
    // Ben Simmons (OVR 50+) should NOT be on a two-way — only true fringe players.
    // K2 < 72 threshold ensures established players sign regular contracts instead.
    const TWO_WAY_OVR_CAP = 45; // raw BBGM OVR cap — roughly K2 ~70
    const twoWayPool = twoWayPlayers
      .filter(p => p.tid === -1 && p.status === 'Free Agent' && (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
      .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));

    const twoWayAssignments = new Map<string, number>(); // internalId → teamId
    // Track per-team two-way count as we assign
    const twoWayCountByTeam = new Map<number, number>();

    // One pass: give each team up to maxTwoWay candidates from the pool
    for (const team of state.teams.filter(t => t.id > 0)) {
      const standardCount = twoWayPlayers.filter(p => p.tid === team.id && !(p as any).twoWay).length;
      if (standardCount < 1) continue; // only teams that received drafted players

      let given = twoWayCountByTeam.get(team.id) ?? 0;
      for (const candidate of twoWayPool) {
        if (given >= maxTwoWay) break;
        if (twoWayAssignments.has(candidate.internalId)) continue;
        twoWayAssignments.set(candidate.internalId, team.id);
        given++;
        twoWayCountByTeam.set(team.id, given);
      }
    }

    const twoWayHistoryEntries: Array<{ text: string; date: string; type: string }> = [];
    if (twoWayAssignments.size > 0) {
      twoWayPlayers = twoWayPlayers.map(p => {
        const teamId = twoWayAssignments.get(p.internalId);
        if (teamId === undefined) return p;
        const team = state.teams.find(t => t.id === teamId);
        // team.name already includes the city (e.g. "Indiana Pacers") — don't prepend region
        const teamName = team?.name ?? `Team ${teamId}`;
        twoWayHistoryEntries.push({
          text: `${p.name} signed a two-way contract with the ${teamName}.`,
          date: state.date ?? `Jul 1, ${season}`,
          type: 'Signing',
        });
        return {
          ...p,
          tid: teamId,
          status: 'Active' as const,
          twoWay: true,
          contract: { amount: TWO_WAY_SALARY_THOUSANDS, exp: season },
        };
      });
    }
    if (twoWayHistoryEntries.length > 0) {
      const existingHistory: any[] = (state.history as any[]) ?? [];
      return { players: twoWayPlayers, draftComplete: true, history: [...existingHistory, ...draftHistoryEntries, ...twoWayHistoryEntries] } as any;
    }
  }

  const existingHistory: any[] = (state.history as any[]) ?? [];
  return { players: twoWayPlayers, draftComplete: true, history: [...existingHistory, ...draftHistoryEntries] } as any;
};
