import { GameState, NonNBATeam, NewsItem } from '../../types';
import { generateSchedule } from '../gameScheduler';
import { AwardService } from './AwardService';
import { NewsGenerator } from '../news/NewsGenerator';

// ── Schedule Generation (Aug 14) ──────────────────────────────────────────
export const autoGenerateSchedule = (state: GameState): Partial<GameState> => {
  const hasRegularSeason = state.schedule.some(
    g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn
  );
  if (hasRegularSeason) return {}; // already generated, skip
  const intlPreseasonGames = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
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

  // Schedule: 2 Euroleague (Oct 2, Oct 8), 2 B-League/Japan (Oct 5, Oct 11), 1 PBA (Oct 14)
  const plan: [NonNBATeam['league'], string][] = [
    ['Euroleague', '2025-10-02'],
    ['B-League',   '2025-10-05'],
    ['Euroleague', '2025-10-08'],
    ['B-League',   '2025-10-11'],
    ['PBA',        '2025-10-14'],
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
        }
      });

      // All-Defensive 1st / 2nd teams
      const allDefNames = ['All-Defensive First Team', 'All-Defensive Second Team'] as const;
      allDefense.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allDefNames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
        }
      });

      // All-Rookie 1st / 2nd teams
      const allRookieNames = ['All-Rookie First Team', 'All-Rookie Second Team'] as const;
      allRookie.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allRookieNames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
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
