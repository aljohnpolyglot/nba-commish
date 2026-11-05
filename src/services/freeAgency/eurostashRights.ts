import type { GameState, NBAPlayer, NonNBATeam } from '../../types';
import { isExternalLeaguePlayer } from '../../utils/playerLeagueScope';
import { stripLiveContractAfterWaive } from '../../utils/contractCleanup';
import { isTransferMarketEligibleTeam } from '../transfer/marketEligibility';

const NBA_TEAM_ID_FALLBACK = new Set(Array.from({ length: 30 }, (_, id) => id));

function isAttachedToExternalClub(player: NBAPlayer): boolean {
  const tid = Number(player.tid);
  return isExternalLeaguePlayer(player)
    && isTransferMarketEligibleTeam({ tid, league: player.status });
}

export function boostEurostashRightsInterest(
  interest: number,
  player: NBAPlayer,
  teamId: number,
  nbaTeamIds?: ReadonlySet<number>,
): number {
  return getEurostashRightsTid(player, nbaTeamIds) === teamId ? interest + 25 : interest;
}

/** Returns the NBA franchise that owns an external player's draft rights. */
export function getEurostashRightsTid(
  player: NBAPlayer,
  nbaTeamIds: ReadonlySet<number> = NBA_TEAM_ID_FALLBACK,
): number | null {
  if (!isAttachedToExternalClub(player)) return null;
  const draft = player.draft;
  if (!draft || draft.year == null || !Number.isFinite(Number(draft.year))) return null;
  if (draft.tid != null) {
    const currentRights = Number(draft.tid);
    if (Number.isInteger(currentRights) && nbaTeamIds.has(currentRights)) return currentRights;
  }
  if (draft.originalTid != null) {
    const originalRights = Number(draft.originalTid);
    if (Number.isInteger(originalRights) && nbaTeamIds.has(originalRights)) return originalRights;
  }
  const detectedRights = Number(player.euroStashRightsTid);
  return Number.isInteger(detectedRights) && nbaTeamIds.has(detectedRights) ? detectedRights : null;
}

export function isEurostashPlayer(player: NBAPlayer, nbaTeamIds?: ReadonlySet<number>): boolean {
  return getEurostashRightsTid(player, nbaTeamIds) != null;
}

export function canNbaTeamSignEurostashPlayer(
  player: NBAPlayer,
  teamId: number,
  nbaTeamIds?: ReadonlySet<number>,
): boolean {
  const rightsTid = getEurostashRightsTid(player, nbaTeamIds);
  return rightsTid == null || rightsTid === teamId;
}

export function getTradeAssetOwnerTid(player: NBAPlayer): number {
  return getEurostashRightsTid(player) ?? player.tid;
}

export function isTradeAssetOwnedBy(player: NBAPlayer, teamId: number): boolean {
  return getTradeAssetOwnerTid(player) === teamId;
}

export function getTradeAssetsForTeam(
  players: NBAPlayer[],
  teamId: number,
  playersByTeam?: Map<number, NBAPlayer[]>,
): NBAPlayer[] {
  const roster = playersByTeam?.get(teamId) ?? players.filter(player => player.tid === teamId);
  return [...roster, ...players.filter(player => player.tid !== teamId && getEurostashRightsTid(player) === teamId)];
}

export function transferEurostashRights(player: NBAPlayer, nextRightsTid: number): NBAPlayer {
  if (!isEurostashPlayer(player)) return player;
  return {
    ...player,
    euroStashRightsTid: nextRightsTid,
    draft: player.draft ? { ...player.draft, tid: nextRightsTid } : player.draft,
  };
}

export type EurostashEligibility = {
  eligible: boolean;
  club: NonNBATeam | null;
  reason?: string;
};

export function getEurostashEligibility(state: GameState, player: NBAPlayer): EurostashEligibility {
  const clubTid = Number(player.preDraftClub?.tid);
  const canonicalClubTid = Number(state.clubAliasMap?.[clubTid] ?? clubTid);
  const club = Number.isInteger(clubTid)
    ? (state.nonNBATeams ?? []).find(team => team.tid === canonicalClubTid) ?? null
    : null;
  if (state.gameMode !== 'gm' || state.leagueType !== 'modded' || (state.moddedLeagueBase ?? 'nba') !== 'nba' || state.leagueStats?.uiMode !== 'nba') {
    return { eligible: false, club, reason: 'Eurostash is available only to NBA general managers.' };
  }
  if (player.tid !== state.userTeamId || player.status !== 'Active') {
    return { eligible: false, club, reason: 'The player must be on your active NBA roster.' };
  }
  if (!player.draft || Number(player.draft.year) !== Number(state.leagueStats.year)) {
    return { eligible: false, club, reason: 'Only rookies from the current draft can be Eurostashed.' };
  }
  if (!club || !isTransferMarketEligibleTeam(club)) {
    return { eligible: false, club: null, reason: 'A verified European pre-draft club is required.' };
  }
  const nbaTeamIds = new Set(state.teams.map(team => team.id));
  const nbaGames = (player.stats ?? []).reduce((sum, stat) => (
    nbaTeamIds.has(Number(stat.tid)) ? sum + Math.max(0, Number(stat.gp) || 0) : sum
  ), 0);
  if (nbaGames > 0) return { eligible: false, club, reason: 'Players with NBA appearances cannot be Eurostashed.' };
  return { eligible: true, club };
}

export function eurostashPlayer(state: GameState, playerId: string): GameState {
  const player = state.players.find(candidate => candidate.internalId === playerId);
  if (!player) return state;
  const eligibility = getEurostashEligibility(state, player);
  if (!eligibility.eligible || !eligibility.club || state.userTeamId == null) return state;
  const season = Number(state.leagueStats.year);
  const club = eligibility.club;
  const stashed = stripLiveContractAfterWaive(player, season);
  const updated: NBAPlayer = {
    ...stashed,
    tid: club.tid,
    status: club.league as NBAPlayer['status'],
    euroStashRightsTid: state.userTeamId,
    draft: { ...player.draft!, tid: state.userTeamId },
    nonGuaranteed: false,
    twoWay: false,
    signedDate: undefined,
    tradeEligibleDate: undefined,
    transactions: [
      ...(player.transactions ?? []),
      { season, tid: club.tid, type: 'Eurostash', date: state.date, competitionId: club.league },
    ],
  };
  const text = `${player.name} was Eurostashed with ${club.name}; the NBA club retained his draft rights.`;
  return {
    ...state,
    players: state.players.map(candidate => candidate.internalId === playerId ? updated : candidate),
    history: [...state.history, { text, date: state.date, type: 'Eurostash', playerIds: [playerId], tid: state.userTeamId }],
  };
}
