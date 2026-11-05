import type { NBAPlayer } from '../types';
import { EXTERNAL_LEAGUE_STATUSES } from '../constants';
import { isUnavailableInternationalTournamentPlayer } from './prospectUtils';

export const EXTERNAL_PLAYER_STATUSES = new Set(EXTERNAL_LEAGUE_STATUSES);

export type PlayerLeagueScope = 'nba' | 'wnba' | 'pba' | 'euro' | 'fictional';

const GENERIC_POOL_STATUSES = new Set(['Active', 'Free Agent', 'Draft Prospect', 'Prospect', 'Retired']);
const EXTERNAL_ID_PREFIX = /^(?:euro|eurocup|endesa|pba|wnba|bleague|gleague|chinacba|cba|nblauss|nbl|german|french|greek|israeli|italian|lithuanian|turkish|vtb|adriatic|ext-gen)-/i;
const NBA_ID_PREFIX = /^(?:nba|hist|native|zengm|community|gen)-/i;
const PBA_ID_PREFIX = /^(?:pba|pbaimport)-/i;
const EURO_ID_PREFIX = /^(?:euro|eurocup|endesa|german|french|greek|israeli|italian|lithuanian|turkish|vtb|adriatic)-/i;

function hasTeamFootprint(player: NBAPlayer, teamIds: ReadonlySet<number>): boolean {
  if (teamIds.has(Number(player.tid))) return true;
  if (teamIds.has(Number(player.draft?.tid)) || teamIds.has(Number(player.draft?.originalTid))) return true;
  if ((player.stats ?? []).some(stat => teamIds.has(Number(stat.tid)))) return true;
  return (player.transactions ?? []).some(transaction => teamIds.has(Number(transaction.tid)));
}

function isPbaIdentity(player: NBAPlayer): boolean {
  return PBA_ID_PREFIX.test(String(player.internalId ?? ''))
    || !!player.historicalPbaSource
    || (player as any).pbaLocalEligible === true
    || (player as any).historicalPbaDraftProspect === true
    || typeof (player as any).pbaDraftSource === 'string'
    || (player as any).pbaDraftRatingsSource === 'historical-pba-roster'
    || String((player as any).pbaDraftTunedVersion ?? '').startsWith('pba-draft-')
    || String((player as any).retiredFromLeague ?? '') === 'PBA'
    || String((player as any).hofLeague ?? '') === 'PBA';
}

function isEuroIdentity(player: NBAPlayer): boolean {
  const label = `${String(player.status ?? '')} ${String((player as any).league ?? '')} ${String((player as any).euroMarketSalaryStatus ?? '')}`.toLowerCase();
  return EURO_ID_PREFIX.test(String(player.internalId ?? ''))
    || !!player.historicalEndesaSource
    || !!player.euroAcademyPlayer
    || /euro|endesa|acb|serie a|bbl|betclic|lnb|france|italy|germany|greece|turkey|lithuania|israel|vtb|aba|adriatic/.test(label);
}

function hasExternalOriginIdentity(player: NBAPlayer): boolean {
  return isWnbaPlayerIdentity(player, false)
    || isPbaIdentity(player)
    || isEuroIdentity(player)
    || EXTERNAL_PLAYER_STATUSES.has(String(player.status ?? ''))
    || Number(player.tid) >= 100
    || Number(player.draft?.tid) >= 100
    || Number(player.draft?.originalTid) >= 100
    || EXTERNAL_ID_PREFIX.test(String(player.internalId ?? ''))
    || (player.stats ?? []).some(stat => Number(stat.tid) >= 100);
}

export function isWnbaPlayerIdentity(player: NBAPlayer, includeGender = true): boolean {
  const labels = `${String(player.status ?? '')} ${String((player as any).league ?? '')} ${String((player as any).retiredFromLeague ?? '')}`.toLowerCase();
  return /(?:^|\s)wnba(?:$|\s)/.test(labels)
    || /^wnba[-_:]/i.test(String(player.internalId ?? ''))
    || (player.stats ?? []).some(stat => String(stat.competitionId ?? '').toLowerCase().startsWith('wnba'))
    || (includeGender && player.gender === 'female');
}

export function isPlayerInLeagueScope(
  player: NBAPlayer,
  scope: PlayerLeagueScope,
  activeTeamIds: ReadonlySet<number>,
): boolean {
  if (isUnavailableInternationalTournamentPlayer(player)) return false;
  const tid = Number(player.tid);
  const status = String(player.status ?? '');
  const onActiveTeam = activeTeamIds.has(tid);
  const genericPoolPlayer = tid < 0 && GENERIC_POOL_STATUSES.has(status);
  const wnbaIdentity = isWnbaPlayerIdentity(player);

  if (scope === 'pba') {
    if (onActiveTeam) return true;
    if (tid >= 0) return false;
    return isPbaIdentity(player) || hasTeamFootprint(player, activeTeamIds);
  }

  if (scope === 'euro') {
    if (onActiveTeam) return true;
    if (tid >= 0) return false;
    return isEuroIdentity(player) && (genericPoolPlayer || hasTeamFootprint(player, activeTeamIds));
  }

  if (scope === 'wnba') {
    if (onActiveTeam) return wnbaIdentity;
    if (tid >= 0) return false;
    return genericPoolPlayer && wnbaIdentity;
  }
  if (scope === 'nba' && tid < 0 && (status === 'Draft Prospect' || status === 'Prospect' || status === 'Free Agent')) {
    return !wnbaIdentity && !isPbaIdentity(player) && !isEuroIdentity(player);
  }

  const explicitExternal = EXTERNAL_PLAYER_STATUSES.has(status)
    || tid >= 100
    || !!player.historicalPbaSource
    || !!player.historicalEndesaSource
    || EXTERNAL_ID_PREFIX.test(String(player.internalId ?? ''));

  if (onActiveTeam) return !explicitExternal;
  if (tid >= 0) return false;
  if (explicitExternal) return false;

  if (scope === 'fictional') return genericPoolPlayer && !wnbaIdentity && !isPbaIdentity(player) && !isEuroIdentity(player);
  if (status !== 'Retired') return false;
  return NBA_ID_PREFIX.test(String(player.internalId ?? '')) || hasTeamFootprint(player, activeTeamIds);
}

export function isExternalLeaguePlayer(player: NBAPlayer): boolean {
  if (isWnbaPlayerIdentity(player, false)) return true;
  if (EXTERNAL_PLAYER_STATUSES.has(String(player.status ?? ''))) return true;
  if (Number(player.tid) >= 100) return true;
  if (Number(player.draft?.tid) >= 100 || Number(player.draft?.originalTid) >= 100) return true;
  return (player.stats ?? []).some(stat => Number(stat.tid) >= 100);
}

export function hasExplicitNbaDraftDeclaration(player: NBAPlayer, draftYear: number): boolean {
  if (Number(player.draft?.year ?? draftYear) !== draftYear) return false;
  if ((player.transactions ?? []).some(transaction =>
    transaction.type === 'draftDeclaration' && Number(transaction.season) === draftYear)) {
    return true;
  }
  return player.preDraftClub?.draftSelection === 'source'
    || player.preDraftClub?.draftSelection === 'projection';
}

export function isDraftProspectEligibleForScope(
  player: NBAPlayer,
  scope: Extract<PlayerLeagueScope, 'nba' | 'wnba' | 'fictional'>,
  draftYear: number,
): boolean {
  const isProspect = player.tid === -2 || player.status === 'Prospect' || player.status === 'Draft Prospect';
  if (!isProspect) return false;
  const eligibleYear = player.draft?.eligibleYear ?? player.draft?.year;
  if (eligibleYear != null && Number(eligibleYear) !== draftYear) return false;
  if (player.draft?.leagueId) return player.draft.leagueId === scope;

  if (scope === 'wnba') return isWnbaPlayerIdentity(player);

  const sourcedWnbaIdentity = isWnbaPlayerIdentity(player, false);
  if (scope === 'fictional') {
    return !sourcedWnbaIdentity && !hasExternalOriginIdentity(player);
  }

  if (isWnbaPlayerIdentity(player)) return false;
  if (!hasExternalOriginIdentity(player)) return true;
  return hasExplicitNbaDraftDeclaration(player, draftYear);
}
