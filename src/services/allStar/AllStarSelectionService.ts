import { NBAPlayer, NBATeam, AllStarVoteCount, AllStarPlayer, type LeagueStats } from '../../types';
import { getAllStarWeekendDates } from './allStarWeekendDates';
import { extractNbaId, extractTeamId, convertTo2KRating } from '../../utils/helpers';
import {
  getAllStarLegacyMultiplier,
  isCurrentNbaPlayer,
  isUsaPlayer,
} from './allStarSelectionHelpers';
import { recordSimulationPerf } from '../simulation/simulationPerfDebug';

type ReserveSelectionDiagnostics = {
  statRowsScanned: number;
  scoreCalculations: number;
};

let activeReserveSelectionDiagnostics: ReserveSelectionDiagnostics | undefined;
const perfNow = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();

function voteInflationForSeason(season: number): number {
  if (season < 1960) return 0.08;
  if (season < 1970) return 0.12;
  if (season < 1980) return 0.18;
  if (season < 1990) return 0.3;
  if (season < 2000) return 0.5;
  if (season < 2010) return 0.75;
  if (season < 2017) return 1.35;
  if (season < 2020) return 3.25;
  if (season < 2025) return 3.8;
  return Math.min(4.8, 4.0 + (season - 2025) * 0.08);
}

function votingEngagementForProgress(progress: number): number {
  const latePush = progress >= 0.7 ? 1 + (progress - 0.7) * 0.6 : 1;
  return 0.85 + progress * 0.24 * latePush;
}

export {
  ALL_STAR_ASSETS,
  applyUsaWorldFormat,
  bucketRoster,
  normalizeAllStarRoster,
  getAllStarPlayerEligibility,
  type AllStarBucketKey,
  isUsaPlayer,
} from './allStarSelectionHelpers';

const buildAllStarTeamBuckets = (
  teams: NBATeam[],
): Map<number, 'East' | 'West'> => {
  const hasTwoNamedBuckets = teams.some(team => team.conference === 'East') &&
    teams.some(team => team.conference === 'West');
  return new Map([...teams]
    .sort((left, right) => left.id - right.id)
    .map((team, index) => [
      team.id,
      hasTwoNamedBuckets ? (team.conference === 'West' ? 'West' : 'East') : (index % 2 === 0 ? 'East' : 'West'),
    ]));
};
export class AllStarSelectionService {
  static getReserveSelectionScore(player: NBAPlayer, team: NBATeam | undefined, season: number): number | null {
    let stat: NBAPlayer['stats'] extends Array<infer T> | undefined ? T | undefined : never;
    for (const row of player.stats ?? []) {
      if (activeReserveSelectionDiagnostics) activeReserveSelectionDiagnostics.statRowsScanned += 1;
      if (row.season === season && !row.playoffs) {
        stat = row;
        break;
      }
    }
    if (activeReserveSelectionDiagnostics) activeReserveSelectionDiagnostics.scoreCalculations += 1;
    if (!stat || !team) return null;
    const gp = stat.gp || 1;
    const winPct = (team.wins + team.losses) > 0
      ? team.wins / (team.wins + team.losses)
      : 0.5;
    return (
      (stat.pts / gp) * 0.7
      + ((stat.trb || (stat.orb || 0) + (stat.drb || 0)) / gp) * 0.25
      + (stat.ast / gp) * 0.35
      + (player.overallRating ?? 50) * 0.25
      + Math.min(3, stat.bpm ?? 0) * 0.5
      + winPct * 1.5
    );
  }

  private static getRisingStarsScore(player: NBAPlayer, season: number): number {
    const stat = player.stats?.find(s => s.season === season && !s.playoffs);
    if (!stat || stat.gp < 10) return (player.overallRating ?? 0) * 0.5;
    const gp = stat.gp;
    const ppg = stat.pts / gp;
    const rpg = (stat.trb || (stat.orb || 0) + (stat.drb || 0)) / gp;
    const apg = stat.ast / gp;
    return (player.overallRating ?? 0) * 0.4 + (ppg * 0.3) + (rpg * 0.15) + (apg * 0.15);
  }

  private static isRisingStarsEligible(player: NBAPlayer, season: number): boolean {
    return isCurrentNbaPlayer(player) && (player.draft?.year === season - 1 || player.draft?.year === season - 2);
  }

  static simulateVotingPeriod(
    players: NBAPlayer[],
    teams: NBATeam[],
    season: number,
    currentDate: Date,
    existingVotes: AllStarVoteCount[],
    days: number = 1,
    isEligiblePlayer: (player: NBAPlayer) => boolean = isCurrentNbaPlayer,
    leagueStats?: Pick<LeagueStats, 'uiMode' | 'leagueCalendar'>,
  ): AllStarVoteCount[] {
    const dates = getAllStarWeekendDates(season, leagueStats);
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
    const voteInflation = voteInflationForSeason(season);
    const engagement = votingEngagementForProgress(progress);
    const voteMap = new Map<string, AllStarVoteCount>(
      existingVotes.map(v => [v.playerId, { ...v }])
    );
    const teamBuckets = buildAllStarTeamBuckets(teams);
    players
      .filter(isEligiblePlayer)
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
        const starMult = getAllStarLegacyMultiplier(player, season);
        const variance = 0.9 + Math.random() * 0.20;
        const baseDaily = 3500 * voteInflation * engagement;
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
          const floorVotes = Math.round(perfScore * marketMult * starMult * 5000 * voteInflation * (progress + 0.1));
          voteMap.set(player.internalId, {
            playerId: player.internalId,
            nbaId,
            playerName: player.name,
            teamAbbrev: team.abbrev,
            teamNbaId,
            conference: teamBuckets.get(team.id) ?? 'East',
            category,
            votes: floorVotes + dailyVotes,
          });
        }
      });
    const results = Array.from(voteMap.values());
    return results.sort((a, b) => b.votes - a.votes);
  }
  static selectStarters(
    votes: AllStarVoteCount[],
    players: NBAPlayer[] = [],
    playersOnCourt = 5,
    isEligiblePlayer: (player: NBAPlayer) => boolean = isCurrentNbaPlayer,
  ): AllStarPlayer[] {
    const starters: AllStarPlayer[] = [];
    const starterTarget = Math.max(1, Math.round(playersOnCourt));
    const guardTarget = starterTarget === 1 ? 0 : Math.max(1, Math.round(starterTarget * 0.4));
    const frontcourtTarget = starterTarget === 1 ? 0 : starterTarget - guardTarget;
    const eligibleIds = new Set(players.filter(isEligiblePlayer).map(p => p.internalId));
    const playerOvrMap = new Map<string, number>(
      players.map(p => [p.internalId, convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp)])
    );
    for (const conf of ['East', 'West'] as const) {
      const confVotes = votes
        .filter(v => v.conference === conf && eligibleIds.has(v.playerId))
        .sort((a, b) => b.votes - a.votes);
      const pickedIds = new Set<string>();
      const frontcourt = confVotes.filter(v =>
        v.category === 'Frontcourt'
      );
      frontcourt.slice(0, frontcourtTarget).forEach(v => {
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
      guards.slice(0, guardTarget).forEach(v => {
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
      confVotes
        .filter(v => !pickedIds.has(v.playerId))
        .slice(0, Math.max(0, starterTarget - pickedIds.size))
        .forEach(v => {
          starters.push({
            playerId: v.playerId,
            nbaId: v.nbaId,
            playerName: v.playerName,
            teamAbbrev: v.teamAbbrev,
            teamNbaId: v.teamNbaId,
            conference: conf,
            position: v.category === 'Guard' ? 'G' : 'F',
            isStarter: true,
            category: v.category,
            ovr: playerOvrMap.get(v.playerId),
          });
          pickedIds.add(v.playerId);
        });
    }
    return starters;
  }
  static selectReserves(
    players: NBAPlayer[],
    teams: NBATeam[],
    season: number,
    starters: AllStarPlayer[],
    format?: string,
    teamCount?: number,
    playersOnCourt = 5,
    isEligiblePlayer: (player: NBAPlayer) => boolean = isCurrentNbaPlayer,
  ): AllStarPlayer[] {
    const diagnosticsStartedAt = perfNow();
    const priorDiagnostics = activeReserveSelectionDiagnostics;
    const diagnostics: ReserveSelectionDiagnostics = { statRowsScanned: 0, scoreCalculations: 0 };
    activeReserveSelectionDiagnostics = diagnostics;
    if (format === 'usa_vs_world') {
      const result = AllStarSelectionService.selectReservesUsaWorld(
        players, teams, season, starters, teamCount ?? 3, playersOnCourt, isEligiblePlayer
      );
      activeReserveSelectionDiagnostics = priorDiagnostics;
      recordSimulationPerf({
        engine: 'allstar-reserves-selection-forensics',
        format: 'usa_vs_world',
        playersScanned: players.length,
        teamsScanned: teams.length,
        statRowsScanned: diagnostics.statRowsScanned,
        scoreCalculations: diagnostics.scoreCalculations,
        candidatesRanked: diagnostics.scoreCalculations,
        reserves: result.length,
        totalMs: perfNow() - diagnosticsStartedAt,
      });
      return result;
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
    const teamBuckets = buildAllStarTeamBuckets(teams);
    const teamById = new Map<number, NBATeam>();
    for (const team of teams) {
      // Preserve Array.find's first-match behavior for malformed duplicate IDs.
      if (!teamById.has(team.id)) teamById.set(team.id, team);
    }
    const scoredByConference: Record<'East' | 'West', Array<{ player: NBAPlayer; score: number; team: NBATeam }>> = {
      East: [],
      West: [],
    };
    for (const player of players) {
      if (!isEligiblePlayer(player) || starterIds.has(player.internalId)) continue;
      const team = teamById.get(player.tid);
      if (!team) continue;
      const conference = teamBuckets.get(team.id);
      if (!conference) continue;
      const score = AllStarSelectionService.getReserveSelectionScore(player, team, season);
      if (score == null) continue;
      scoredByConference[conference].push({ player, score, team });
    }
    const starterCountByConference = { East: 0, West: 0 };
    for (const starter of starters) {
      if (starter.conference === 'East' || starter.conference === 'West') {
        starterCountByConference[starter.conference] += 1;
      }
    }
    for (const conf of ['East', 'West'] as const) {
      const starterCount = starterCountByConference[conf];
      const reserveTarget = Math.max(0, Math.max(12, playersOnCourt + 7) - starterCount);
      const frontcourtReserveTarget = Math.min(2, reserveTarget);
      const guardReserveTarget = Math.min(2, Math.max(0, reserveTarget - frontcourtReserveTarget));
      const sorted = scoredByConference[conf].sort(
        (a, b) => b.score - a.score
      );
      const pickedIds = new Set<string>();
      sorted.filter(s =>
        isFrontcourt(s.player.pos ?? '')
      ).slice(0, frontcourtReserveTarget).forEach(({ player, team }) => {
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
      ).slice(0, guardReserveTarget).forEach(({ player, team }) => {
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
      ).slice(0, Math.max(0, reserveTarget - pickedIds.size)).forEach(({ player, team }) => {
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
    activeReserveSelectionDiagnostics = priorDiagnostics;
    recordSimulationPerf({
      engine: 'allstar-reserves-selection-forensics',
      format: format ?? 'east_vs_west',
      playersScanned: players.length,
      teamsScanned: teams.length * 2,
      statRowsScanned: diagnostics.statRowsScanned,
      scoreCalculations: diagnostics.scoreCalculations,
      teamLookups: diagnostics.scoreCalculations,
      rankingsBuilt: 2,
      candidatesRanked: diagnostics.scoreCalculations,
      reserves: reserves.length,
      totalMs: perfNow() - diagnosticsStartedAt,
    });
    return reserves;
  }
  static selectReservesUsaWorld(
    players: NBAPlayer[],
    teams: NBATeam[],
    season: number,
    starters: AllStarPlayer[],
    teamCount: number,
    playersOnCourt = 5,
    isEligiblePlayer: (player: NBAPlayer) => boolean = isCurrentNbaPlayer,
  ): AllStarPlayer[] {
    const perTeam = teamCount === 2
      ? Math.max(12, playersOnCourt + 7)
      : Math.max(8, playersOnCourt + 3);
    const usaTeams   = teamCount >= 3 ? 2 : 1;
    const worldTeams = teamCount === 4 ? 2 : 1;
    const usaTotalTarget   = usaTeams * perTeam;
    const worldTotalTarget = worldTeams * perTeam;
    const byId = new Map(players.map(p => [p.internalId, p]));
    const usaStarters   = starters.filter(s => isUsaPlayer(byId.get(s.playerId))).length;
    const worldStarters = starters.length - usaStarters;
    const usaNeeded   = Math.max(0, usaTotalTarget   - usaStarters);
    const worldNeeded = Math.max(0, worldTotalTarget - worldStarters);
    const starterIds = new Set(starters.map(s => s.playerId));
    const scored = players
      .filter(p =>
        isEligiblePlayer(p) &&
        !starterIds.has(p.internalId)
      )
      .map(p => {
        const team = teams.find(t => t.id === p.tid);
        const score = AllStarSelectionService.getReserveSelectionScore(p, team, season);
        return score == null || !team ? null : { player: p, score, team };
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
    const rookies = players.filter(p =>
      isCurrentNbaPlayer(p) &&
      p.draft?.year === season - 1
    ).sort((a,b) =>
      AllStarSelectionService.getRisingStarsScore(b, season) - AllStarSelectionService.getRisingStarsScore(a, season)
    ).slice(0, 10);
    const sophs = players.filter(p =>
      isCurrentNbaPlayer(p) &&
      p.draft?.year === season - 2
    ).sort((a,b) =>
      AllStarSelectionService.getRisingStarsScore(b, season) - AllStarSelectionService.getRisingStarsScore(a, season)
    ).slice(0, 10);
    return { rookies, sophs };
  }

  static getRisingStarsUsaWorldRoster(
    players: NBAPlayer[],
    season: number
  ): { usa: NBAPlayer[], world: NBAPlayer[] } {
    const eligible = players
      .filter(player => AllStarSelectionService.isRisingStarsEligible(player, season))
      .sort((a, b) =>
        AllStarSelectionService.getRisingStarsScore(b, season) - AllStarSelectionService.getRisingStarsScore(a, season)
      );
    return {
      usa: eligible.filter(player => isUsaPlayer(player)).slice(0, 10),
      world: eligible.filter(player => !isUsaPlayer(player)).slice(0, 10),
    };
  }
  static getRisingStarsCaptainsDraftRoster(
    players: NBAPlayer[],
    season: number,
  ): [NBAPlayer[], NBAPlayer[]] {
    const eligible = players
      .filter(player => AllStarSelectionService.isRisingStarsEligible(player, season))
      .sort((left, right) => (
        AllStarSelectionService.getRisingStarsScore(right, season)
        - AllStarSelectionService.getRisingStarsScore(left, season)
      ))
      .slice(0, 20);
    const teams: [NBAPlayer[], NBAPlayer[]] = [[], []];
    eligible.forEach((player, index) => {
      const round = Math.floor(index / 2);
      const slot = round % 2 === 0 ? index % 2 : 1 - (index % 2);
      teams[slot].push(player);
    });
    return teams;
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
      .filter(p => isCurrentNbaPlayer(p) && draftEligible(p))
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
      isCurrentNbaPlayer(p) &&
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
