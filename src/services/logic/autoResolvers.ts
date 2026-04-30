import { GameState, NonNBATeam, NewsItem, DraftPick, NBACupState } from '../../types';
import { computeRookieSalaryUSD } from '../../utils/rookieContractUtils';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../../utils/jerseyUtils';
import { generateSchedule } from '../gameScheduler';
import { drawCupGroups } from '../nbaCup/drawGroups';
import { injectCupGroupGames } from '../nbaCup/scheduleInjector';
import { AwardService } from './AwardService';
import { NewsGenerator } from '../news/NewsGenerator';
import { LOTTERY_PRESETS } from '../../lib/lotteryPresets';
import { returnUndraftedToHomeLeague } from '../externalLeagueSustainer';
import { UNDRAFTED_OVR_CAP } from '../../constants';
import { getRolloverDate, toISODateString } from '../../utils/dateUtils';

// ── Schedule Generation (Aug 14) ──────────────────────────────────────────
export const autoGenerateSchedule = (state: GameState): Partial<GameState> => {
  // Only count games from the CURRENT season to avoid stale prior-season games
  // blocking regeneration after a season rollover.
  const year = state.leagueStats.year;
  const seasonStart = `${year - 1}-10-01`;
  const seasonEnd   = toISODateString(getRolloverDate(year, state.leagueStats as any, state.schedule as any));
  // Exclude isNBACup — Cup games can land in the schedule via self-heal paths
  // after rollover (before Aug 14). Without this exclusion, a Cup-only schedule
  // trips the "already generated" branch and preseason/regular-season never get
  // laid down for the new year.
  const hasRegularSeason = state.schedule.some(
    g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn && !(g as any).isNBACup && !(g as any).isCupTBD
         && g.date >= seasonStart && g.date <= seasonEnd
  );
  if (hasRegularSeason) {
    // Schedule already generated, but check if Cup games are missing — can happen
    // if the schedule was generated under an older codepath that didn't pass
    // cupGroups. Self-heal by retro-injecting Cup games into the existing schedule.
    if (state.leagueStats.inSeasonTournament !== false && state.nbaCup?.groups?.length) {
      const hasCupGames = state.schedule.some(g => (g as any).isNBACup);
      if (!hasCupGames) {
        console.log('[autoGenerateSchedule] Self-heal: schedule exists but no Cup games tagged → injecting now');
        const scheduledDates: Record<string, Set<number>> = {};
        for (const g of state.schedule as any[]) {
          const ds = String(g.date).split('T')[0];
          if (!scheduledDates[ds]) scheduledDates[ds] = new Set<number>();
          scheduledDates[ds].add(g.homeTid); scheduledDates[ds].add(g.awayTid);
        }
        const maxGid = Math.max(0, ...state.schedule.map(g => g.gid));
        // Retro-injected cup games: mark excludeFromRecord so the existing 82-game
        // RS schedule isn't inflated. (Fresh-save path keeps default false because
        // gameScheduler subtracts the conflicting RS game via preScheduledPairs.)
        const result = injectCupGroupGames([], maxGid + 1, state.nbaCup.groups, state.saveId || 'default', year - 1, scheduledDates, { excludeFromRecord: true });
        if (result.games.length > 0) {
          const merged = [...state.schedule, ...result.games].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          return { schedule: merged };
        }
      }
    }
    return {};
  }
  // Strip any old-season games that are no longer relevant
  const intlPreseasonGames = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
         && g.date >= seasonStart
  );
  // First-season fallback: nbaCup is only seeded at year-end rollover, so brand
  // new saves have no groups yet. Draw them inline here so Cup games make it
  // into the very first schedule.
  let nbaCupPatch: NBACupState | undefined;
  let cupGroups = (state.leagueStats.inSeasonTournament !== false) ? (state.nbaCup?.groups ?? []) : [];
  if (state.leagueStats.inSeasonTournament !== false && cupGroups.length === 0) {
    const prevStandings = state.teams.map(t => ({ tid: t.id, wins: t.wins, losses: t.losses }));
    cupGroups = drawCupGroups(state.teams, prevStandings, state.saveId ?? 'default', state.leagueStats.year);
    nbaCupPatch = {
      year: state.leagueStats.year,
      status: 'group',
      groups: cupGroups,
      wildcards: { East: null, West: null },
      knockout: [],
    };
  }
  let schedule = generateSchedule(
    state.teams,
    state.christmasGames,
    state.globalGames,
    state.leagueStats.numGamesDiv ?? null,
    state.leagueStats.numGamesConf ?? null,
    state.leagueStats.mediaRights,
    state.leagueStats.year,
    cupGroups.length > 0 ? cupGroups : undefined,
    state.saveId,
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
  return nbaCupPatch ? { schedule, nbaCup: nbaCupPatch } : { schedule };
};

// ── International Preseason Auto-Schedule (Aug 13) ────────────────────────
// Auto-picks 5 intl preseason games (2 Euroleague, 2 B-League, 1 PBA) if the
// commissioner hasn't scheduled any manually. NBA opponents are drawn from the
// top 5 teams by strength; non-NBA opponents are chosen from the top 5 in each
// league ranked by their players' average overall rating.
export const autoScheduleIntlPreseason = (state: GameState): Partial<GameState> => {
  const y1 = state.leagueStats.year - 1;
  const seasonStart = `${y1}-10-01`;
  // Skip if commissioner already scheduled intl preseason games THIS season
  const existingIntl = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
       && g.date >= seasonStart
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
    ['Euroleague',    `${y1}-10-02`],
    ['B-League',      `${y1}-10-04`],
    ['Euroleague',    `${y1}-10-07`],
    ['China CBA',     `${y1}-10-09`],
    ['B-League',      `${y1}-10-11`],
    ['NBL Australia', `${y1}-10-13`],
    ['PBA',           `${y1}-10-15`],
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
// Fires Aug 12 (before Aug 14 schedule generation). Guard: skip if commissioner already set them.
export const autoPickChristmasGames = (state: GameState): Partial<GameState> => {
  if (state.christmasGames && state.christmasGames.length > 0) return {};
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
// Fires Aug 13 (before Aug 14 schedule generation). Auto-picks 3 international
// regular-season games if the commissioner hasn't configured any.
export const autoPickGlobalGames = (state: GameState): Partial<GameState> => {
  if (state.globalGames && state.globalGames.length > 0) return {};
  const y = state.leagueStats.year;
  const y1 = y - 1;

  // Pick 3 top-strength teams, no repeats
  const sorted = [...state.teams].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const [t1, t2, t3, t4, t5, t6] = sorted;
  if (!t1 || !t2) return { globalGames: [] };

  const globalGames = [
    { homeTid: t1.id, awayTid: t2.id, date: `${y1}-11-08T00:00:00Z`, city: 'London',      country: 'UK' },
    { homeTid: t3?.id ?? t1.id, awayTid: t4?.id ?? t2.id, date: `${y1}-11-15T00:00:00Z`, city: 'Paris',       country: 'France' },
    { homeTid: t5?.id ?? t1.id, awayTid: t6?.id ?? t2.id, date: `${y1}-11-22T00:00:00Z`, city: 'Mexico City', country: 'Mexico' },
  ];

  return { globalGames };
};

// ── All-Star Voting ────────────────────────────────────────────────────────
export const autoSimVotes = async (state: GameState): Promise<Partial<GameState>> => {
  // Skip if votes already exist — preserves commissioner's rigged ghost votes.
  if ((state.allStar?.votes?.length ?? 0) > 0) return {};
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
  if (state.allStar?.startersAnnounced) return {};
  try {
    const { AllStarSelectionService, bucketRoster } = await import('../allStar/AllStarSelectionService');
    let starters = AllStarSelectionService.selectStarters(
      state.allStar?.votes ?? [],
      state.players
    );
    starters = bucketRoster(
      starters,
      state.players,
      state.allStar?.votes ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams
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
  // Skip if already announced — commissioner-added injury replacements live on
  // state.allStar.roster, and re-running this would duplicate reserves on top.
  if (state.allStar?.reservesAnnounced) return {};
  try {
    const { AllStarSelectionService, bucketRoster } = await import('../allStar/AllStarSelectionService');
    let reserves = AllStarSelectionService.selectReserves(
      state.players,
      state.teams,
      state.leagueStats.year,
      state.allStar?.roster ?? []
    );
    // Bucket the full 24-man pool together so captains_draft / usa_vs_world
    // re-balance starters + reserves uniformly.
    let fullRoster = [...(state.allStar?.roster ?? []), ...reserves];
    fullRoster = bucketRoster(
      fullRoster,
      state.players,
      state.allStar?.votes ?? [],
      state.leagueStats.allStarFormat,
      state.leagueStats.allStarTeams
    );

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
  // Respect commissioner's manual pick (DunkContestModal flips dunkContestAnnounced).
  if (state.allStar?.dunkContestAnnounced) return {};
  try {
    const { AllStarDunkContestSim } = await import('../allStar/AllStarDunkContestSim');
    const num = state.leagueStats.allStarDunkContestPlayers ?? 4;
    const contestants = AllStarDunkContestSim.selectContestants(state.players, num);
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
  // Respect commissioner's manual pick (ThreePointContestModal flips threePointAnnounced).
  if (state.allStar?.threePointAnnounced) return {};
  try {
    const { AllStarThreePointContestSim } = await import('../allStar/AllStarThreePointContestSim');
    const num = state.leagueStats.allStarThreePointContestPlayers ?? 8;
    const contestants = AllStarThreePointContestSim.selectContestants(
      state.players,
      state.leagueStats.year,
      num
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

// Writes dunk/3pt/ASG MVP awards to player.awards from existing allStar state.
// Idempotent — skips awards already present for the season.
function backfillAllStarAwards(state: GameState): Partial<GameState> {
  const allStarData = state.allStar as any;
  const year = state.leagueStats.year;

  const entries: Array<{ internalId?: string; name?: string; awardType: string }> = [];
  if (allStarData?.dunkContest?.winnerId || allStarData?.dunkContest?.winnerName)
    entries.push({ internalId: allStarData.dunkContest.winnerId, name: allStarData.dunkContest.winnerName, awardType: 'Slam Dunk Contest Winner' });
  if (allStarData?.threePointContest?.winnerId || allStarData?.threePointContest?.winnerName)
    entries.push({ internalId: allStarData.threePointContest.winnerId, name: allStarData.threePointContest.winnerName, awardType: 'Three-Point Contest Winner' });
  if (allStarData?.gameMvp?.name)
    entries.push({ name: allStarData.gameMvp.name, awardType: 'All-Star Game MVP' });

  if (entries.length === 0) return {};

  // Check if all awards already exist to avoid a needless players array rebuild
  const allPresent = entries.every(e =>
    state.players.some(p =>
      ((e.internalId && p.internalId === e.internalId) ||
       (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())) &&
      (p.awards ?? []).some(a => a.type === e.awardType && a.season === year)
    )
  );
  if (allPresent) return {};

  const updatedPlayers = state.players.map(p => {
    const entry = entries.find(e =>
      (e.internalId && p.internalId === e.internalId) ||
      (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())
    );
    if (!entry) return p;
    if ((p.awards ?? []).some(a => a.type === entry.awardType && a.season === year)) return p;
    return { ...p, awards: [...(p.awards ?? []), { type: entry.awardType, season: year }] };
  });
  return { players: updatedPlayers };
}

// ── All-Star Weekend (full sim) ────────────────────────────────────────────
export const autoSimAllStarWeekend = async (state: GameState): Promise<Partial<GameState>> => {
  // If already simmed, skip re-simulation but still backfill any missing awards
  // (e.g. saves from before the award-writing code was added).
  if ((state.allStar as any)?.weekendComplete) {
    return backfillAllStarAwards(state);
  }
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

        // Find a replacement that fits the injured player's bucket.
        //  - east_vs_west / blacks_vs_whites → match team conference (classic East/West)
        //  - captains_draft                  → best available (East/West buckets are arbitrary captain assignments)
        //  - usa_vs_world: USA1/USA2         → prefer USA-born candidate
        //  - usa_vs_world: WORLD/WORLD1/2    → prefer non-USA-born candidate
        const rosterIds = new Set(updatedRoster.map(r => r.playerId));
        const conf = rosterSpot.conference;
        const format = stateForSim.leagueStats?.allStarFormat ?? 'east_vs_west';
        const { getCountryFromLoc } = await import('../../utils/helpers');
        const bucketMatch = (p: any): boolean => {
          if (format === 'captains_draft') return true; // captain teams are arbitrary
          if (conf === 'East' || conf === 'West') {
            return stateForSim.teams.find(t => t.id === p.tid)?.conference === conf;
          }
          const country = getCountryFromLoc(p.born?.loc);
          const isUsa = country === 'United States';
          if (conf === 'USA1' || conf === 'USA2') return isUsa;
          if (conf === 'WORLD' || conf === 'WORLD1' || conf === 'WORLD2') return !isUsa;
          return true;
        };
        const INELIGIBLE_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
        const eligible = [...stateForSim.players].filter(p =>
          !rosterIds.has(p.internalId) &&
          (!p.injury || p.injury.gamesRemaining <= 0) &&
          !INELIGIBLE_STATUSES.has(p.status ?? '') &&
          p.tid >= 0  // exclude any external-league sentinel tids too
        );
        const preferred = eligible.filter(bucketMatch);
        const pool = preferred.length > 0 ? preferred : eligible; // fallback: any
        const candidate = pool.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0];

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
      const win = AllStarWeekendOrchestrator.getBreakWindowStrings(stateForSim.leagueStats.year);
      stateForSim = {
        ...stateForSim,
        schedule: newSchedule,
        leagueStats: {
          ...stateForSim.leagueStats,
          allStarBreakStart: win.breakStart,
          allStarBreakEnd: win.breakEnd,
        },
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

    // Write contest + ASG MVP awards to player records
    const year = state.leagueStats.year;
    const allStarData = patch.allStar as any;
    const awardEntries: Array<{ internalId?: string; name?: string; awardType: string }> = [];
    if (allStarData?.dunkContest?.winnerId)
      awardEntries.push({ internalId: allStarData.dunkContest.winnerId, name: allStarData.dunkContest.winnerName, awardType: 'Slam Dunk Contest Winner' });
    if (allStarData?.threePointContest?.winnerId)
      awardEntries.push({ internalId: allStarData.threePointContest.winnerId, name: allStarData.threePointContest.winnerName, awardType: 'Three-Point Contest Winner' });
    if (allStarData?.gameMvp?.name)
      awardEntries.push({ name: allStarData.gameMvp.name, awardType: 'All-Star Game MVP' });

    if (awardEntries.length > 0) {
      patch.players = state.players.map(p => {
        const entry = awardEntries.find(e =>
          (e.internalId && p.internalId === e.internalId) ||
          (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())
        );
        if (!entry) return p;
        if (p.awards?.some(a => a.type === entry.awardType && a.season === year)) return p;
        return { ...p, awards: [...(p.awards ?? []), { type: entry.awardType, season: year }] };
      });
    }

    // Per-round news headlines for multi-game brackets (RR / SF / Final).
    // For 2-team formats, the existing all_star_winner template already covers it,
    // so we skip per-round generation when only one bracket game played.
    const newNewsItems: NewsItem[] = [];
    const bracket = allStarData?.bracket;
    const playedBracketGames = (bracket?.games ?? []).filter((g: any) => g.played);
    if (bracket && playedBracketGames.length > 1) {
      for (const g of playedBracketGames) {
        const homeT = bracket.teams.find((t: any) => t.tid === g.homeTid);
        const awayT = bracket.teams.find((t: any) => t.tid === g.awayTid);
        if (!homeT || !awayT) continue;
        const homeWon = g.homeScore > g.awayScore;
        const winnerName = homeWon ? homeT.name : awayT.name;
        const loserName  = homeWon ? awayT.name : homeT.name;
        const winnerScore = Math.max(g.homeScore, g.awayScore);
        const loserScore  = Math.min(g.homeScore, g.awayScore);
        const roundLabel = g.round === 'final' ? 'Championship' : g.round === 'sf' ? 'Semifinal' : 'Round Robin';
        const news = NewsGenerator.generate(
          'all_star_bracket',
          state.date,
          {
            winner: winnerName,
            loser: loserName,
            roundLabel,
            homeScore: winnerScore,
            awayScore: loserScore,
            year,
            mvpName: g.mvpName ?? 'Top scorer',
            mvpPts: g.mvpPts ?? 0,
          }
        );
        if (news) newNewsItems.push(news);
      }
    }

    // Championship MVP headline (works for both bracket and classic formats).
    if (allStarData?.gameMvp?.name) {
      const finalGame = playedBracketGames.find((g: any) => g.round === 'final')
                     ?? playedBracketGames[playedBracketGames.length - 1];
      const mvpStats = (() => {
        if (!finalGame) return null;
        const box = patch.boxScores?.find((b: any) => b.gameId === finalGame.gid);
        if (!box) return null;
        const all = [...(box.homeStats ?? []), ...(box.awayStats ?? [])];
        return all.find((s: any) => s.name === allStarData.gameMvp.name) ?? null;
      })();
      const mvpNews = NewsGenerator.generate(
        'all_star_mvp',
        state.date,
        {
          playerName: allStarData.gameMvp.name,
          year,
          pts: mvpStats?.pts ?? 0,
          reb: mvpStats?.reb ?? 0,
          ast: mvpStats?.ast ?? 0,
          teamName: allStarData.gameMvp.team ?? '',
        }
      );
      if (mvpNews) newNewsItems.push(mvpNews);
    }

    if (newNewsItems.length > 0) {
      patch.news = [...newNewsItems, ...(state.news ?? [])].slice(0, 200);
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

// ── Hall of Fame Class Induction (Sept 6) ─────────────────────────────────
/**
 * Real-world HOF ceremony fires on Sept 6 of each in-game year. Pulls that
 * year's induction class from the external gist (fetchHOFData) and emits news
 * items. Idempotent — guarded by news-id presence so re-runs don't duplicate.
 *
 * Class year = state.leagueStats.year - 1 (e.g. season 2026 → Class of 2025).
 * Uses the same gist file the HallofFameView reads so both stay in sync.
 */
export const autoInductHOFClass = async (state: GameState): Promise<Partial<GameState>> => {
  const classYear = (state.leagueStats?.year ?? 2026) - 1;
  const idPrefix = `hof-class-${classYear}-`;
  const already = (state.news ?? []).some(n => (n as any).id?.startsWith(idPrefix));
  if (already) return {};

  try {
    const { fetchHOFData } = await import('../../data/HOFData');
    const all = await fetchHOFData();
    const classInductees = all.filter(p => p.inductionYear === classYear);
    if (classInductees.length === 0) return {};

    // Flip hof=true + hofInductionYear=<classYear> on matching in-game players.
    // This makes the gist authoritative for real-world HOFers (Howard, Melo,
    // etc.) whose source data either didn't flag them as HOF or has an older
    // retiredYear that would otherwise drag them into the wrong class.
    const normalizeName = (name: string) => (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const inducteeNameSet = new Set(classInductees.map(p => normalizeName(p.name)));
    const updatedPlayers = (state.players ?? []).map(p => {
      if (p.hofInductionYear) return p; // already inducted
      if (!inducteeNameSet.has(normalizeName(p.name))) return p;
      return { ...p, hof: true, hofInductionYear: classYear };
    });

    const names = classInductees.map(p => p.name).filter(Boolean);
    const date = state.date;

    const classItem = {
      id: `${idPrefix}${Date.now()}`,
      headline: `Class of ${classYear} Enshrined in the Hall of Fame`,
      content: `The Naismith Memorial Basketball Hall of Fame has formally inducted the Class of ${classYear}: ${names.join(', ')}.`,
      date,
      type: 'league' as const,
      isNew: true,
      read: false,
    } as any as NewsItem;

    const perInducteeItems = classInductees.slice(0, 10).map((p, i) => ({
      id: `${idPrefix}p-${i}-${Date.now()}`,
      headline: `${p.name} Inducted Into Hall of Fame`,
      content: `${p.name} has been formally enshrined as part of the Class of ${classYear}.`,
      date,
      type: 'player' as const,
      playerPortraitUrl: p.imgURL,
      isNew: true,
      read: false,
    } as any as NewsItem));

    const news = [classItem, ...perInducteeItems, ...(state.news ?? [])].slice(0, 200);
    return { players: updatedPlayers, news };
  } catch (err) {
    console.warn('[autoInductHOFClass] failed:', err);
    return {};
  }
};

// ── Rookie contract scale (mirrors DraftSimulatorView) ────────────────────

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

  const preset = LOTTERY_PRESETS[state.leagueStats?.draftType ?? 'nba2019'] ?? LOTTERY_PRESETS.nba2019;

  const sorted = [...state.teams]
    .filter(t => t.id > 0)
    .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)))
    .slice(0, Math.min(14, preset.chances.length));

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
  // Finals must finish before the draft runs — if draft day lands before Game 7, defer.
  // Return the sentinel so lazySimRunner retries this event next iteration.
  if (state.playoffs && !state.playoffs.bracketComplete) return { _deferred: true } as any;

  const season = state.leagueStats?.year ?? 2026;
  const guaranteedYrs = state.leagueStats?.rookieContractLength ?? 2;
  const teamOptEnabled: boolean = (state.leagueStats as any)?.rookieTeamOptionsEnabled ?? true;
  const teamOptYears: number = (state.leagueStats as any)?.rookieTeamOptionYears ?? 2;
  const restrictedFA: boolean = (state.leagueStats as any)?.rookieRestrictedFreeAgentEligibility ?? true;

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

  // Resolve traded picks: if a team traded away their pick, assign the slot to the new owner.
  const currentSeasonPicks = ((state.draftPicks ?? []) as DraftPick[]).filter(dp => dp.season === season);
  const r1TradedMap = new Map<number, number>(); // originalTid → currentOwnerTid (round 1)
  const r2TradedMap = new Map<number, number>(); // originalTid → currentOwnerTid (round 2)
  for (const dp of currentSeasonPicks) {
    if (dp.tid !== dp.originalTid) {
      if (dp.round === 1) r1TradedMap.set(dp.originalTid, dp.tid);
      else if (dp.round === 2) r2TradedMap.set(dp.originalTid, dp.tid);
    }
  }
  const resolvePickOwner = (team: typeof state.teams[0], round: number) => {
    const currentOwnerTid = (round === 1 ? r1TradedMap : r2TradedMap).get(team.id);
    if (currentOwnerTid !== undefined) {
      return state.teams.find(t => t.id === currentOwnerTid) ?? team;
    }
    return team;
  };
  const draftOrder = [
    ...r1Order.map(team => resolvePickOwner(team, 1)),
    ...r1Order.map(team => resolvePickOwner(team, 2)),
  ];

  // Available prospects for THIS season's draft class only (filter out future classes)
  const prospects = state.players
    .filter(p => {
      const isProspect = p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect';
      if (!isProspect) return false;
      if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
      const draftYear = (p as any).draft?.year;
      if (draftYear != null && Number(draftYear) !== season) return false;
      return true;
    })
    .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

  // Assign picks (best OVR available to each slot)
  const assignedIds = new Set<string>();
  const pickMap = new Map<number, { player: typeof state.players[0]; team: typeof state.teams[0] }>();

  // Honor any in-progress picks the user made in DraftSimulatorView before
  // advancing day. Without this, autoRunDraft would assign fresh prospects to
  // slots the user already filled, double-rostering teams.
  const activeDraftPicks: Record<number, any> = (state as any).activeDraftPicks ?? {};
  for (const [slotKey, savedPlayer] of Object.entries(activeDraftPicks)) {
    const slot = Number(slotKey);
    const team = draftOrder[slot - 1];
    if (!team || !savedPlayer?.internalId) continue;
    // Resolve to the live player record so contract/jersey logic below sees current data.
    const live = state.players.find(p => p.internalId === savedPlayer.internalId) ?? savedPlayer;
    pickMap.set(slot, { player: live, team });
    assignedIds.add(savedPlayer.internalId);
  }

  for (let slot = 1; slot <= draftOrder.length; slot++) {
    if (pickMap.has(slot)) continue; // user already filled this slot
    const team = draftOrder[slot - 1];
    const best = prospects.find(p => !assignedIds.has(p.internalId));
    if (!best) break;
    assignedIds.add(best.internalId);
    pickMap.set(slot, { player: best, team });
  }

  // Pre-compute jersey number assignments for all drafted players so same-team
  // conflicts within a single draft run are caught (e.g. picks 3 and 28 both go to same team).
  const teamRetiredNums = new Map<number, Set<string>>();
  const teamTakenNums = new Map<number, Set<string>>();
  for (const t of state.teams) {
    const retired = new Set<string>(
      ((t as any).retiredJerseyNumbers ?? []).map((j: any) => String(j.number))
    );
    teamRetiredNums.set(t.id, retired);
  }
  // Seed taken map with existing roster jersey numbers (before draft)
  for (const p of state.players) {
    if (p.tid >= 0 && p.jerseyNumber) {
      if (!teamTakenNums.has(p.tid)) teamTakenNums.set(p.tid, new Set());
      teamTakenNums.get(p.tid)!.add(String(p.jerseyNumber));
    }
  }
  // Pre-assign jersey numbers for each drafted player
  const draftJerseyAssignments = new Map<string, string>(); // internalId → jerseyNumber
  for (const [, { player, team }] of pickMap.entries()) {
    const retired = teamRetiredNums.get(team.id) ?? new Set<string>();
    const taken   = teamTakenNums.get(team.id)   ?? new Set<string>();
    const excluded = new Set([...retired, ...taken]);
    let num = player.jerseyNumber ? String(player.jerseyNumber) : '';
    if (!num || retired.has(num)) num = pickJerseyNumber(excluded);
    draftJerseyAssignments.set(player.internalId, num);
    if (!teamTakenNums.has(team.id)) teamTakenNums.set(team.id, new Set());
    teamTakenNums.get(team.id)!.add(num);
  }

  // Apply picks to players
  const undrafted: Array<{ name: string; id: string }> = [];
  const updatedPlayers = state.players.map(p => {
    for (const [slot, { player, team }] of pickMap.entries()) {
      if (player.internalId !== p.internalId) continue;
      const round = slot <= 30 ? 1 : 2;
      const pickInRound = slot <= 30 ? slot : slot - 30;
      const salaryAmount = computeRookieSalaryUSD(slot, state.leagueStats);
      // R1: guaranteed years + team option years; R2: always 2yr, no team options
      const baseYrs   = round === 1 ? guaranteedYrs : 2;
      const optionYrs = (round === 1 && teamOptEnabled) ? teamOptYears : 0;
      const totalYrs  = baseYrs + optionYrs;
      const r2NonGuaranteed = round === 2 && ((state.leagueStats as any)?.r2ContractsNonGuaranteed ?? true);
      // Seed per-season salary rows — see computeDraftPickFields in
      // DraftSimulatorView for rationale. Without this, PlayerBioContractTab's
      // Path B fallback drops rookie years before currentYear.
      const contractYears = Array.from({ length: totalYrs }, (_, i) => {
        const yr = season + i;
        return {
          season: `${yr}-${String(yr + 1).slice(-2)}`,
          guaranteed: Math.round(salaryAmount * Math.pow(1.05, i)),
          option: i >= baseYrs ? 'Team' : '',
        };
      });
      return {
        ...p,
        tid: team.id,
        status: 'Active' as const,
        jerseyNumber: draftJerseyAssignments.get(p.internalId) ?? p.jerseyNumber,
        ...(r2NonGuaranteed && { nonGuaranteed: true }),
        draft: { round, pick: pickInRound, year: season, tid: team.id, originalTid: team.id },
        // Stamp signing date so newly-drafted rookies are protected from trim
        // recency-cuts during the same offseason. Without this, a 21-man training
        // camp roster with 3 rookies on top of 21 vets would trim the rookies
        // alongside the vets in the very tick after the draft fires.
        signedDate: state.date,
        contract: {
          amount: salaryAmount / 1_000,
          exp: season + totalYrs,
          salaryDetails: [{ season, amount: salaryAmount }],
          ...(optionYrs > 0 && {
            hasTeamOption: true,
            teamOptionExp: season + baseYrs + 1,
          }),
          ...(round === 1 && restrictedFA && { restrictedFA: true }),
          rookie: true,
        },
        contractYears,
      };
    }
    // Undrafted current-year prospects → free agents (future classes stay as prospects)
    const draftYear = (p as any).draft?.year;
    const isCurrentClass = !draftYear || Number(draftYear) === season;
    if (isCurrentClass && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') && !assignedIds.has(p.internalId)) {
      undrafted.push({ name: p.name, id: p.internalId });
      // Fix 7: undrafted players cap at K2 80 (BBGM 56) — nobody K2 99 goes undrafted
      const clampedOvr = Math.min(p.overallRating ?? 99, UNDRAFTED_OVR_CAP);
      return {
        ...p,
        overallRating: clampedOvr,
        tid: -1 as const,
        status: 'Free Agent' as const,
        draft: { round: 0, pick: 0, year: season, tid: -1, originalTid: -1 },
      };
    }
    return p;
  });

  // ── Draft history entries ──────────────────────────────────────────────────
  const _ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const draftHistoryEntries: Array<{ text: string; date: string; type: string; playerIds: string[] }> = [];
  for (const [slot, { player, team }] of pickMap.entries()) {
    draftHistoryEntries.push({
      text: `The ${team.name} select ${player.name} as the ${_ordinal(slot)} overall pick of the ${season} NBA Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [player.internalId],
    });
  }
  for (const u of undrafted) {
    draftHistoryEntries.push({
      text: `${u.name} went undrafted in the ${season} NBA Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [u.id],
    });
  }

  // ── Two-way contract auto-assignment ──────────────────────────────────────
  // After the draft, each team may sign up to maxTwoWayPlayersPerTeam additional
  // players on two-way deals ($625K, don't count against 15-man standard cap).
  // Priority: undrafted FAs with lowest OVR (bubble / second-round fringe players).
  const TWO_WAY_SALARY_THOUSANDS = 625; // $625K in BBGM thousands convention
  const maxTwoWay = state.leagueStats?.maxTwoWayPlayersPerTeam ?? 2;
  const twoWayEnabled = state.leagueStats?.twoWayContractsEnabled ?? true;

  const draftedTeamIds = new Set(Array.from(pickMap.values()).map(({ team }) => team.id));
  let twoWayPlayers = normalizeTeamJerseyNumbers(updatedPlayers, state.teams, season, {
    history: state.history,
    targetTeamIds: draftedTeamIds,
  });

  if (twoWayEnabled && maxTwoWay > 0) {
    // Pool: low-OVR FAs only (fringe/bubble candidates, NOT established NBA players).
    // Ben Simmons (OVR 50+) should NOT be on a two-way — only true fringe players.
    // K2 < 72 threshold ensures established players sign regular contracts instead.
    const TWO_WAY_OVR_CAP = 45; // raw BBGM OVR cap — roughly K2 ~70
    // Age/YOS gate matches AIFreeAgentHandler Pass 2 — vets (age ≥ 30, or 25-29
    // with > 2 YOS) shouldn't end up on $0.6M two-ways. Real-player imports may
    // have stats[] entries without gp counts, so use draft.year as a YOS backup.
    const twoWayPool = twoWayPlayers
      .filter(p => p.tid === -1 && p.status === 'Free Agent' && (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
      .filter(p => {
        const age = p.born?.year ? season - p.born.year : (p.age ?? 99);
        if (age >= 30) return false;
        if (age <= 24) return true;
        const yosFromStats = ((p as any).stats ?? [])
          .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
        const draftYr = (p as any).draft?.year;
        const yosFromDraft = (draftYr && season > draftYr) ? season - draftYr : 0;
        const yos = Math.max(yosFromStats, yosFromDraft);
        return yos <= 2;
      })
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

    const twoWayHistoryEntries: Array<{ text: string; date: string; type: string; playerIds: string[] }> = [];
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
          playerIds: [p.internalId],
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
      return {
        players: normalizeTeamJerseyNumbers(twoWayPlayers, state.teams, season, {
          history: state.history,
          targetTeamIds: draftedTeamIds,
        }),
        draftComplete: true,
        draftPicks: (state.draftPicks ?? []).filter(p => p.season !== season),
        history: [...existingHistory, ...draftHistoryEntries, ...twoWayHistoryEntries],
      } as any;
    }
  }

  // Route undrafted international prospects back to their home league before
  // the Jul 1 FA window opens. US/Canada players stay as NBA FAs.
  const { players: playersAfterReturn, historyEntries: returnHistory } =
    returnUndraftedToHomeLeague(twoWayPlayers, season, state as any);

  const existingHistory: any[] = (state.history as any[]) ?? [];
  return {
    players: normalizeTeamJerseyNumbers(playersAfterReturn, state.teams, season, {
      history: state.history,
      targetTeamIds: draftedTeamIds,
    }),
    draftComplete: true,
    draftPicks: (state.draftPicks ?? []).filter(p => p.season !== season),
    history: [...existingHistory, ...draftHistoryEntries, ...returnHistory],
  } as any;
};
