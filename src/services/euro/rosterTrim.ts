import type { GameState, NBAPlayer, NonNBATeam } from '../../types';
import { appendPlayerTransaction } from '../../utils/playerBirdRights';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { isOnRoster } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { filterTransferMarketTeams } from '../transfer/marketEligibility';

type OpeningRosterTrimOptions = {
  rosterLimit: number;
  sourceSeason: number;
  retainWithSourceClub?: boolean;
};

function latestOverall(player: NBAPlayer, sourceSeason: number): number {
  const rating = [...(player.ratings ?? [])]
    .filter(row => Number(row.season ?? sourceSeason) <= sourceSeason)
    .sort((left, right) => Number(right.season ?? 0) - Number(left.season ?? 0))[0];
  return Number(player.overallRating ?? rating?.ovr ?? 0);
}

function reserveAtSourceClub(player: NBAPlayer, team: NonNBATeam, sourceSeason: number): NBAPlayer {
  const bornYear = Number(player.born?.year ?? 0);
  const sourceAge = bornYear > 0 ? sourceSeason - bornYear : Number(player.age ?? 99);
  const youngInternational = sourceAge >= 16 && sourceAge <= 21;
  const currentDraftYear = sourceSeason + 1;
  const savedDraftYear = Number(player.draft?.year ?? 0);
  const futureDraftYear = youngInternational
    ? Math.max(currentDraftYear, bornYear + 22)
    : savedDraftYear;
  const hasSavedDraftResult = Number(player.draft?.round ?? 0) > 0 && Number(player.draft?.pick ?? 0) > 0;
  const draft = youngInternational && !hasSavedDraftResult
    ? {
        ...player.draft,
        year: savedDraftYear >= currentDraftYear ? savedDraftYear : futureDraftYear,
        tid: -1,
        originalTid: -1,
        round: 0,
        pick: 0,
      }
    : player.draft;
  return {
    ...player,
    tid: team.tid,
    status: team.league as NBAPlayer['status'],
    euroReservePlayer: true,
    euroAcademyPlayer: youngInternational || player.euroAcademyPlayer,
    promotedFromAcademy: youngInternational ? false : player.promotedFromAcademy,
    draft,
    preDraftClub: {
      ...(player.preDraftClub ?? {}),
      name: getTeamFullName(team),
      tid: team.tid,
      logoUrl: team.imgURL,
      colors: team.colors,
      competitionId: String(player.preDraftClub?.competitionId ?? team.league ?? ''),
      season: Number(player.preDraftClub?.season ?? currentDraftYear),
      rosterBucket: youngInternational ? 'academy' : player.preDraftClub?.rosterBucket ?? 'senior',
    },
  } as NBAPlayer;
}

export function restoreNbaExternalSourceReserves(
  players: NBAPlayer[],
  teams: NonNBATeam[],
  currentDraftYear: number,
): NBAPlayer[] {
  const teamsByTid = new Map(teams.map(team => [Number(team.tid), team]));
  let changed = false;
  const restored = players.map(player => {
    const currentAge = currentDraftYear - Number(player.born?.year ?? currentDraftYear - 99);
    if (
      player.tid !== -1
      || player.status !== 'Free Agent'
      || !player.euroMarketSalaryStatus
      || !player.internalId.includes('-realgm-')
      || currentAge < 16
      || currentAge > 28
      || (player.transactions ?? []).some(transaction => ['waive', 'release', 'transfer'].includes(String(transaction.type ?? '').toLowerCase()))
    ) return player;
    const latestSourceStat = [...(player.stats ?? [])]
      .filter(stat => !stat.playoffs && Number(stat.tid) >= 100)
      .sort((left, right) => Number(right.season ?? 0) - Number(left.season ?? 0))[0];
    const preDraftTeam = player.preDraftClub?.tid != null
      ? teamsByTid.get(Number(player.preDraftClub.tid))
      : undefined;
    const currentTeam = latestSourceStat ? teamsByTid.get(Number(latestSourceStat.tid)) : undefined;
    const historicalTeam = latestSourceStat
      ? {
          tid: Number(latestSourceStat.tid),
          region: '',
          name: String((latestSourceStat as any).teamName ?? (latestSourceStat as any).abbrev ?? 'International Club'),
          abbrev: String((latestSourceStat as any).teamAbbrev ?? (latestSourceStat as any).abbrev ?? ''),
          league: String(player.euroMarketSalaryStatus),
          imgURL: (latestSourceStat as any).teamLogoUrl,
        } as NonNBATeam
      : undefined;
    const team = preDraftTeam ?? currentTeam ?? historicalTeam;
    if (!team) return player;
    changed = true;
    return reserveAtSourceClub(player, team, currentDraftYear - 1);
  });
  return changed ? restored : players;
}

export function trimEuroOpeningRosters(
  players: NBAPlayer[],
  teams: NonNBATeam[],
  options: OpeningRosterTrimOptions,
): NBAPlayer[] {
  const limit = Math.max(1, Math.floor(options.rosterLimit));
  const teamIds = new Set(teams.map(team => Number(team.tid)));
  const releasedIds = new Set<string>();

  for (const tid of teamIds) {
    const roster = players.filter(player => Number(player.tid) === tid && isOnRoster(player));
    if (roster.length <= limit) continue;
    const keepIds = new Set(roster
      .sort((left, right) => (
        latestOverall(right, options.sourceSeason) - latestOverall(left, options.sourceSeason)
        || Number(right.potential ?? 0) - Number(left.potential ?? 0)
        || left.name.localeCompare(right.name)
        || left.internalId.localeCompare(right.internalId)
      ))
      .slice(0, limit)
      .map(player => player.internalId));
    roster.forEach(player => {
      if (!keepIds.has(player.internalId)) releasedIds.add(player.internalId);
    });
  }

  if (releasedIds.size === 0) return players;
  const teamsByTid = new Map(teams.map(team => [Number(team.tid), team]));
  return players.map(player => {
    if (!releasedIds.has(player.internalId)) return player;
    const sourceTeam = teamsByTid.get(Number(player.tid));
    if (options.retainWithSourceClub && sourceTeam) {
      return reserveAtSourceClub(player, sourceTeam, options.sourceSeason);
    }
    return {
      ...player,
      tid: -1,
      status: 'Free Agent' as const,
      euroMarketSalaryStatus: player.euroMarketSalaryStatus ?? player.status,
      contract: undefined,
      contractYears: undefined,
    };
  });
}

export function trimEuroOversizedRosters(
  state: Pick<GameState, 'date' | 'gameMode' | 'history' | 'leagueStats' | 'nonNBATeams' | 'userTeamId'>,
  players: NBAPlayer[],
): { players: NBAPlayer[]; history: GameState['history']; trimmed: string[] } {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return { players, history: [], trimmed: [] };
  const limit = getStandardRosterLimit(state.leagueStats);
  const protectedTid = state.gameMode === 'gm' ? state.userTeamId : undefined;
  const released = new Map<string, { tid: number; teamName: string }>();
  const season = Number(state.leagueStats.year);

  for (const team of filterTransferMarketTeams(state.nonNBATeams ?? [])) {
    if (team.tid === protectedTid) continue;
    const roster = players.filter(player => Number(player.tid) === team.tid && isOnRoster(player));
    const excess = roster.length - limit;
    if (excess <= 0) continue;
    roster
      .sort((left, right) => (
        latestOverall(left, season) - latestOverall(right, season)
        || Number(left.potential ?? 0) - Number(right.potential ?? 0)
        || right.name.localeCompare(left.name)
        || right.internalId.localeCompare(left.internalId)
      ))
      .slice(0, excess)
      .forEach(player => released.set(player.internalId, { tid: team.tid, teamName: getTeamFullName(team) }));
  }

  if (released.size === 0) return { players, history: [], trimmed: [] };
  return {
    players: players.map(player => released.has(player.internalId)
      ? {
          ...player,
          tid: -1,
          status: 'Free Agent' as const,
          euroMarketSalaryStatus: player.euroMarketSalaryStatus ?? player.status,
          contract: undefined,
          contractYears: undefined,
          transactions: appendPlayerTransaction(player, { season, tid: -1, type: 'waive' }),
        }
      : player),
    history: [...released].map(([playerId, info]) => ({
      text: `${players.find(player => player.internalId === playerId)?.name ?? 'Player'} waived by ${info.teamName}`,
      date: state.date,
      type: 'Waiver',
      playerIds: [playerId],
      tid: info.tid,
      league: 'Euro',
    })) as GameState['history'],
    trimmed: [...released.keys()],
  };
}
