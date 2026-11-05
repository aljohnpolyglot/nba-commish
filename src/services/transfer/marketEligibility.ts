import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../../data/euroBasketballSources';

export interface TransferMarketLeague {
  name: string;
  leagueId: string;
  leagueStatus: string;
  minTid: number;
  maxTid: number;
}

type TransferMarketTeam = {
  tid?: number;
  id?: number;
  league?: string;
  status?: string;
};

const catalogLeagues = [EUROLEAGUE_2026_SOURCE, ...EURO_BASKETBALL_SOURCE_ARCHIVES]
  .map(source => ({
    name: source.displayName,
    leagueId: source.leagueId,
    leagueStatus: source.leagueStatus,
    minTid: source.teamTidOffset,
    maxTid: source.teamTidOffset + 999,
  }));

export const TRANSFER_MARKET_LEAGUES: readonly TransferMarketLeague[] = [
  ...catalogLeagues,
  {
    name: 'Liga Endesa',
    leagueId: 'endesa',
    leagueStatus: 'Endesa',
    minTid: 5000,
    maxTid: 5999,
  },
];

const normalize = (value?: string): string => String(value ?? '').trim().toLowerCase();

function leagueFromLabel(value?: string): TransferMarketLeague | null {
  const label = normalize(value);
  if (!label) return null;
  return TRANSFER_MARKET_LEAGUES.find(league => (
    [league.name, league.leagueId, league.leagueStatus].some(candidate => normalize(candidate) === label)
  )) ?? null;
}

export function getTransferMarketLeague(tid: number, team?: TransferMarketTeam | null): TransferMarketLeague | null {
  const explicit = leagueFromLabel(team?.league) ?? leagueFromLabel(team?.status);
  if (explicit) return explicit;
  if (normalize(team?.league) || normalize(team?.status)) return null;
  if (typeof tid !== 'number' || tid < 0) return null;
  return TRANSFER_MARKET_LEAGUES.find(league => tid >= league.minTid && tid <= league.maxTid) ?? null;
}

export function isTransferMarketEligibleTid(tid: number): boolean {
  return getTransferMarketLeague(tid) != null;
}

export function isTransferMarketEligibleTeam(team: TransferMarketTeam | null | undefined): boolean {
  if (!team) return false;
  const tid = Number(team.tid ?? team.id ?? -1);
  return getTransferMarketLeague(tid, team) != null;
}

export function filterTransferMarketTeams<T extends TransferMarketTeam>(teams: T[]): T[] {
  return teams.filter(isTransferMarketEligibleTeam);
}
