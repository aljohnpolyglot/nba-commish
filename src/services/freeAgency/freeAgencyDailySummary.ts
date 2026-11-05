import type {
  FreeAgencyDailyDecision,
  FreeAgencyDailySummary,
  GameState,
  NBAPlayer,
} from '../../types';
import { getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../utils/scoutingFuzz';
import { getRFAPriorTid } from '../freeAgencyBidding';
import { getTeamFullName } from '../../utils/teamNames';
import { normalizeDate } from '../../utils/helpers';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { seasonLabelToYear } from '../../utils/salaryUtils';
import { resolvePersistentPlayerImage } from '../../utils/playerImage';

function getUserTargetIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  const season = Number(state.leagueStats?.year);
  for (const market of state.faBidding?.markets ?? []) {
    if (market.season != null && Number(market.season) !== season) continue;
    if (market.bids?.some(bid => bid.isUserBid)) ids.add(market.playerId);
  }
  if (Number(state.pbaLocalFreeAgency?.season) === season) {
    for (const market of state.pbaLocalFreeAgency?.markets ?? []) {
      if (market.bids?.some(bid => bid.isUserBid)) ids.add(market.playerId);
    }
  }
  return ids;
}

function getPreviousTeamId(player: NBAPlayer, state: GameState): number | undefined {
  const pbaTid = Number((player as any).pbaPreviousTid);
  if (Number.isFinite(pbaTid) && pbaTid >= 0) return pbaTid;
  const historicalTids = [
    ...((player as any).transactions ?? []).map((entry: any) => ({
      tid: Number(entry.tid),
      season: Number(entry.season ?? 0),
    })),
    ...(player.stats ?? []).filter(entry => !entry.playoffs && (entry.gp ?? 0) > 0).map(entry => ({
      tid: Number(entry.tid),
      season: Number(entry.season ?? 0),
    })),
  ]
    .filter(entry =>
      entry.tid >= 0
      && !!resolveAnyTeam(entry.tid, state.teams, state.nonNBATeams ?? [])
    )
    .sort((left, right) => right.season - left.season);
  if (historicalTids[0]) return historicalTids[0].tid;
  const nbaTid = getRFAPriorTid(player);
  return nbaTid >= 0 ? nbaTid : undefined;
}

function getTeamSnapshot(state: GameState, teamId: number | undefined, year: number) {
  if (teamId == null || teamId < 0) {
    return { name: 'Free Agent', logo: undefined };
  }
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  return {
    name: team ? getTeamFullName(team) : 'Unknown Team',
    logo: team ? getResolvedTeamLogoUrl(team, year) : undefined,
  };
}

function getContractSnapshot(player: NBAPlayer, year: number): { total: number; years: number } {
  const futureYears = (player.contractYears ?? []).filter(entry => {
    const season = seasonLabelToYear(String(entry.season));
    return Number.isFinite(season) && season >= year;
  });
  if (futureYears.length > 0) {
    const guaranteedTotal = futureYears.reduce(
      (sum, entry) => sum + Math.max(0, Number(entry.guaranteed ?? 0)),
      0,
    );
    return {
      total: guaranteedTotal > 0
        ? guaranteedTotal
        : Math.max(0, Number(player.contract?.amount ?? 0) * 1_000 * futureYears.length),
      years: futureYears.length,
    };
  }
  const years = Math.max(1, Number(player.contract?.exp ?? year) - year + 1);
  return {
    total: Math.max(0, Number(player.contract?.amount ?? 0) * 1_000 * years),
    years,
  };
}

function getContractType(player: NBAPlayer): FreeAgencyDailyDecision['contractType'] {
  if ((player as any).developmentalContract) return 'developmental';
  if ((player as any).twoWay) return 'two-way';
  if ((player as any).nonGuaranteed) return 'non-guaranteed';
  return 'guaranteed';
}

function getContractOption(player: NBAPlayer, year: number): FreeAgencyDailyDecision['option'] {
  const option = (player.contractYears ?? [])
    .filter(entry => seasonLabelToYear(String(entry.season)) >= year)
    .map(entry => String(entry.option ?? '').toLowerCase())
    .find(value => value === 'player' || value === 'team');
  return option === 'player' ? 'PLAYER' : option === 'team' ? 'TEAM' : 'NONE';
}

function didSignToday(before: NBAPlayer, after: NBAPlayer, date: string): boolean {
  if (after.tid < 0 || !after.signedDate) return false;
  if (normalizeDate(after.signedDate) !== normalizeDate(date)) return false;
  return before.tid !== after.tid
    || before.status === 'Free Agent'
    || !!(before as any).pbaLocalEligible;
}

function getAcceptedAspireDeal(state: GameState, playerId: string) {
  const market = state.faBidding?.markets?.find(candidate => candidate.playerId === playerId);
  return market?.bids?.find(bid => bid.isUserBid && bid.status === 'accepted')?.aspireSideDeal;
}

export function buildFreeAgencyDailySummary(
  before: GameState,
  after: GameState,
  day: number,
  totalDays: number,
): FreeAgencyDailySummary {
  const beforeById = new Map(before.players.map(player => [player.internalId, player]));
  const targetIds = new Set([...getUserTargetIds(before), ...getUserTargetIds(after)]);
  const year = after.leagueStats?.year ?? new Date().getUTCFullYear();
  const currency = after.leagueStats?.uiMode === 'pba_isolated'
    ? String(after.leagueStats?.currency ?? 'PHP')
    : 'USD';
  const decisions: FreeAgencyDailyDecision[] = [];

  for (const player of after.players) {
    const previousPlayer = beforeById.get(player.internalId);
    if (!previousPlayer || !didSignToday(previousPlayer, player, after.date)) continue;
    const previousTeamId = getPreviousTeamId(previousPlayer, before);
    const previousTeam = getTeamSnapshot(before, previousTeamId, year);
    const newTeam = getTeamSnapshot(after, player.tid, year);
    const contract = getContractSnapshot(player, year);
    const isUserTarget = targetIds.has(player.internalId);
    decisions.push({
      playerId: player.internalId,
      playerName: player.name,
      playerImage: resolvePersistentPlayerImage(player, { portraitSeason: year })
        ?? resolvePersistentPlayerImage(previousPlayer, { portraitSeason: year }),
      playerFace: player.face,
      position: player.pos ?? '—',
      overall: getScoutedDisplayOverall(after, player, year),
      potential: getScoutedDisplayPotential(after, player, year, year),
      previousTeamId,
      previousTeamName: previousTeam.name,
      previousTeamLogo: previousTeam.logo,
      newTeamId: player.tid,
      newTeamName: newTeam.name,
      newTeamLogo: newTeam.logo,
      status: previousTeamId === player.tid
        ? 're-signed'
        : player.tid === after.userTeamId && after.gameMode === 'gm'
          ? 'signed-with-you'
          : 'signed-elsewhere',
      contractTotalUSD: contract.total,
      contractYears: contract.years,
      contractType: getContractType(player),
      option: getContractOption(player, year),
      aspireSideDeal: getAcceptedAspireDeal(after, player.internalId),
      currency,
      isUserTarget,
    });
  }

  decisions.sort((left, right) =>
    Number(right.isUserTarget) - Number(left.isUserTarget)
    || right.overall - left.overall
    || left.playerName.localeCompare(right.playerName)
  );

  return { day, totalDays, date: after.date, decisions };
}

export function buildManualSigningConfirmation(
  before: GameState,
  after: GameState,
  input: {
    playerId: string;
    salaryUSD: number;
    contractYears: number;
    contractType: NonNullable<FreeAgencyDailyDecision['contractType']>;
    option: NonNullable<FreeAgencyDailyDecision['option']>;
    isResigning: boolean;
    day: number;
    totalDays: number;
  },
): FreeAgencyDailySummary | undefined {
  const player = after.players.find(candidate => candidate.internalId === input.playerId);
  const previousPlayer = before.players.find(candidate => candidate.internalId === input.playerId);
  if (!player || !previousPlayer) return undefined;
  const year = after.leagueStats?.year ?? new Date().getUTCFullYear();
  const previousTeamId = input.isResigning ? previousPlayer.tid : getPreviousTeamId(previousPlayer, before);
  const previousTeam = getTeamSnapshot(before, previousTeamId, year);
  const newTeam = getTeamSnapshot(after, player.tid, year);
  const currency = after.leagueStats?.uiMode === 'pba_isolated'
    ? String(after.leagueStats?.currency ?? 'PHP')
    : after.leagueStats?.uiMode === 'euro_isolated'
      ? String(after.leagueStats?.currency ?? 'EUR')
      : 'USD';
  return {
    day: input.day,
    totalDays: input.totalDays,
    date: after.date,
    signingConfirmation: true,
    decisions: [{
      playerId: player.internalId,
      playerName: player.name,
      playerImage: resolvePersistentPlayerImage(player, { portraitSeason: year })
        ?? resolvePersistentPlayerImage(previousPlayer, { portraitSeason: year }),
      playerFace: player.face,
      position: player.pos ?? '—',
      overall: getScoutedDisplayOverall(after, player, year),
      potential: getScoutedDisplayPotential(after, player, year, year),
      previousTeamId,
      previousTeamName: previousTeam.name,
      previousTeamLogo: previousTeam.logo,
      newTeamId: player.tid,
      newTeamName: newTeam.name,
      newTeamLogo: newTeam.logo,
      status: input.isResigning ? 're-signed' : player.tid === after.userTeamId && after.gameMode === 'gm' ? 'signed-with-you' : 'signed-elsewhere',
      contractTotalUSD: input.salaryUSD * input.contractYears,
      contractYears: input.contractYears,
      contractType: input.contractType,
      option: input.option,
      currency,
      isUserTarget: true,
    }],
  };
}

export function mergeFreeAgencySummaries(
  previous: FreeAgencyDailySummary | undefined,
  next: FreeAgencyDailySummary,
  combined: boolean,
): FreeAgencyDailySummary {
  if (!combined) return next;
  if (!previous) return { ...next, combined: true };
  const decisions = new Map(previous.decisions.map(decision => [decision.playerId, decision]));
  next.decisions.forEach(decision => decisions.set(decision.playerId, decision));
  return {
    ...next,
    decisions: [...decisions.values()].sort((left, right) =>
      Number(right.isUserTarget) - Number(left.isUserTarget)
      || right.overall - left.overall
      || left.playerName.localeCompare(right.playerName)
    ),
    combined: true,
  };
}
