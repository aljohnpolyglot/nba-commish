import { computeContractOffer } from '../../../../../utils/salaryUtils';
import { getDisplayAge, getDisplayOverall } from '../../../../../store/playerRatingStore';
import { getDisplayPotential } from '../../../../../utils/playerRatings';
import type { NBAPlayer, NBATeam, NonNBATeam } from '../../../../../types';

export interface AutoBidSummary {
  submitted: number;
  skipped: number;
}

export interface FreeAgencyBid {
  teamId: number;
  salaryUSD: number;
  years: number;
  option?: 'NONE' | 'PLAYER' | 'TEAM';
  status: string;
  isUserBid?: boolean;
}

export interface FreeAgencyMarket {
  playerId: string;
  bids: FreeAgencyBid[];
  resolved?: boolean;
  decidesOnDay: number;
}

export interface TrackedMarketRow {
  market: FreeAgencyMarket;
  player: NBAPlayer | undefined;
  top: FreeAgencyBid | undefined;
  userBid: FreeAgencyBid | undefined;
  daysToDecide: number;
  decisionLabel: string;
}

export interface TopFreeAgentRow {
  player: NBAPlayer;
  k2: number;
  age: number;
}

export interface LastSeasonPergame {
  pts: number;
  reb: number;
  ast: number;
  per: number;
  gp: number;
  mp: number;
}

export type TierFilter = 'all' | '90+' | '80-89' | '70-79' | 'u25';

export interface SortConfig {
  col: string;
  dir: 'asc' | 'desc';
}

export type ResolvedTeam = NBATeam | NonNBATeam;

export const SHORTLIST_CAP = 15;

export function getK2Ovr(player: NBAPlayer): number {
  return getDisplayOverall(player);
}

export function getLastSeasonPergame(player: NBAPlayer): LastSeasonPergame | null {
  const stats = ((player as any).stats ?? []) as Array<any>;
  const last = stats.filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0).slice(-1)[0];
  if (!last) return null;
  const gp = last.gp ?? 0;
  if (gp <= 0) return null;
  return {
    pts: (last.pts ?? 0) / gp,
    reb: ((last.orb ?? 0) + (last.drb ?? 0)) / gp || (last.trb ?? 0) / gp,
    ast: (last.ast ?? 0) / gp,
    per: last.per ?? 0,
    mp: (last.min ?? 0) / gp,
    gp,
  };
}

export function fmt1(value: number): string {
  return Number.isFinite(value) && value > 0 ? value.toFixed(1) : '—';
}

export function isPlayerRFA(player: NBAPlayer): boolean {
  const contract = (player as any).contract;
  if (contract?.isRestrictedFA || contract?.restrictedFA) return true;
  if (contract?.rookie && (player as any).draft?.round === 1) return true;
  return false;
}

export function getLastTeamTid(player: NBAPlayer): number {
  const transactions: Array<{ season: number; tid: number }> = (player as any).transactions ?? [];
  if (transactions.length > 0) {
    const latest = [...transactions].reverse().find(txn => txn.tid >= 0 && txn.tid <= 29);
    if (latest) return latest.tid;
  }

  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const nbaStats = stats.filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0 && (stat.tid ?? -1) >= 0 && (stat.tid ?? -1) <= 29);
  if (nbaStats.length === 0) return -1;
  const maxSeason = Math.max(...nbaStats.map(stat => stat.season ?? 0));
  const forMaxSeason = nbaStats.filter(stat => (stat.season ?? 0) === maxSeason);
  const latest = forMaxSeason[forMaxSeason.length - 1];
  return latest ? (latest.tid ?? -1) : -1;
}

export function getResolvedTeamLogoUrl(team: ResolvedTeam | null | undefined): string | undefined {
  if (!team) return undefined;
  return 'logoUrl' in team ? team.logoUrl : undefined;
}

export function hasBirdRightsResolved(player: NBAPlayer): boolean {
  if ((player as any).hasBirdRights === true) return true;
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const sorted = stats
    .filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0 && (stat.tid ?? -1) >= 0 && (stat.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
  if (sorted.length < 3) return false;
  const lastTid = sorted[0].tid;
  let consecutive = 0;
  for (const stat of sorted) {
    if (stat.tid === lastTid) consecutive++;
    else break;
  }
  return consecutive >= 3;
}

export function fmtUSD(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

export function sortTopFreeAgents(
  rows: TopFreeAgentRow[],
  sortConfig: SortConfig,
  currentYear: number,
  leagueStats: unknown,
): TopFreeAgentRow[] {
  return [...rows].sort((a, b) => {
    let aValue: string | number = 0;
    let bValue: string | number = 0;

    switch (sortConfig.col) {
      case 'name':
        aValue = a.player.name;
        bValue = b.player.name;
        break;
      case 'age':
        aValue = a.age;
        bValue = b.age;
        break;
      case 'k2':
        aValue = a.k2;
        bValue = b.k2;
        break;
      case 'pot':
        aValue = getDisplayPotential(a.player, currentYear);
        bValue = getDisplayPotential(b.player, currentYear);
        break;
      case 'mp':
        aValue = getLastSeasonPergame(a.player)?.mp ?? 0;
        bValue = getLastSeasonPergame(b.player)?.mp ?? 0;
        break;
      case 'pos':
        aValue = a.player.pos ?? '';
        bValue = b.player.pos ?? '';
        break;
      case 'pts':
        aValue = getLastSeasonPergame(a.player)?.pts ?? 0;
        bValue = getLastSeasonPergame(b.player)?.pts ?? 0;
        break;
      case 'reb':
        aValue = getLastSeasonPergame(a.player)?.reb ?? 0;
        bValue = getLastSeasonPergame(b.player)?.reb ?? 0;
        break;
      case 'ast':
        aValue = getLastSeasonPergame(a.player)?.ast ?? 0;
        bValue = getLastSeasonPergame(b.player)?.ast ?? 0;
        break;
      case 'per':
        aValue = getLastSeasonPergame(a.player)?.per ?? 0;
        bValue = getLastSeasonPergame(b.player)?.per ?? 0;
        break;
      case 'asking': {
        const offerA = computeContractOffer(a.player, leagueStats as any);
        const offerB = computeContractOffer(b.player, leagueStats as any);
        aValue = offerA.salaryUSD * offerA.years;
        bValue = offerB.salaryUSD * offerB.years;
        break;
      }
      default:
        aValue = a.k2;
        bValue = b.k2;
        break;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortConfig.dir === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    const diff = Number(aValue) - Number(bValue);
    return sortConfig.dir === 'asc' ? diff : -diff;
  });
}

export function filterTopFreeAgents(
  players: NBAPlayer[],
  tierFilter: TierFilter,
  currentYear: number,
): TopFreeAgentRow[] {
  return players
    .map(player => ({ player, k2: getK2Ovr(player), age: getDisplayAge(player, currentYear) }))
    .filter(row => {
      if (tierFilter === '90+') return row.k2 >= 90;
      if (tierFilter === '80-89') return row.k2 >= 80 && row.k2 < 90;
      if (tierFilter === '70-79') return row.k2 >= 70 && row.k2 < 80;
      if (tierFilter === 'u25') return row.age < 25;
      return true;
    });
}
