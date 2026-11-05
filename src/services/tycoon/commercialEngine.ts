import type { NBAPlayer } from '../../types';
import type {
  CommercialMatchdayRecord,
  CommercialPlayerShirtSale,
  TycoonState,
} from '../../types/tycoon';
import type { MatchdayCommercialOutcome } from './budgetEngine';
import { isOnRoster } from '../../utils/teamLookup';

interface BuildCommercialRecordInput {
  gid: number;
  season: number;
  date: string;
  competitionId?: string;
  opponentTid: number;
  opponentName: string;
  capacity: number;
  outcome: MatchdayCommercialOutcome;
  players: NBAPlayer[];
  teamId: number;
  economyIndex: number;
}

export interface CommercialPlayerSummary extends CommercialPlayerShirtSale {
  share: number;
}

export interface CommercialSeasonSnapshot {
  records: CommercialMatchdayRecord[];
  totalCommercialRevenueEUR: number;
  gateRevenueEUR: number;
  foodRevenueEUR: number;
  drinkRevenueEUR: number;
  matchdayRevenueEUR: number;
  merchandiseGrossRevenueEUR: number;
  merchandiseDistributionCostEUR: number;
  merchandiseRevenueEUR: number;
  clubMediaRevenueEUR: number;
  attendance: number;
  averageAttendance: number;
  playerShirtSales: CommercialPlayerSummary[];
}

function buildPlayerShirtSales(
  players: NBAPlayer[],
  teamId: number,
  merchandiseGrossRevenueEUR: number,
  economyIndex: number,
): CommercialPlayerShirtSale[] {
  const roster = players
    .filter(player => player.tid === teamId && isOnRoster(player))
    .map(player => ({
      player,
      weight: Math.max(1, Number(player.overallRating ?? 0) - 30) ** 2,
    }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 8);
  const totalWeight = roster.reduce((sum, row) => sum + row.weight, 0);
  if (roster.length === 0 || totalWeight <= 0) return [];
  const shirtRevenue = Math.max(0, merchandiseGrossRevenueEUR * 0.65);
  const shirtPrice = Math.max(20, 75 * Math.max(0.05, economyIndex));
  return roster.map(({ player, weight }) => {
    const revenueEUR = Math.round(shirtRevenue * weight / totalWeight);
    return {
      playerId: String(player.internalId),
      playerName: player.name,
      units: Math.max(0, Math.round(revenueEUR / shirtPrice)),
      revenueEUR,
    };
  });
}

export function buildCommercialMatchdayRecord(
  input: BuildCommercialRecordInput,
): CommercialMatchdayRecord {
  const gameId = `${input.competitionId ?? 'friendly'}:${input.gid}`;
  return {
    gameId,
    gid: input.gid,
    season: input.season,
    date: input.date.slice(0, 10),
    competitionId: input.competitionId,
    opponentTid: input.opponentTid,
    opponentName: input.opponentName,
    attendance: input.outcome.attendance,
    capacity: Math.max(0, Math.round(input.capacity)),
    ticketPriceEUR: input.outcome.ticketPriceEUR,
    gateRevenueEUR: input.outcome.gateRevenueEUR,
    foodRevenueEUR: input.outcome.foodRevenueEUR,
    drinkRevenueEUR: input.outcome.drinkRevenueEUR,
    matchdayRevenueEUR: input.outcome.revenueEUR,
    merchandiseGrossRevenueEUR: input.outcome.merchandiseGrossRevenueEUR,
    merchandiseDistributionCostEUR: input.outcome.merchandiseDistributionCostEUR,
    merchandiseRevenueEUR: input.outcome.merchandiseRevenueEUR,
    clubMediaRevenueEUR: input.outcome.clubMediaRevenueEUR,
    playerShirtSales: buildPlayerShirtSales(
      input.players,
      input.teamId,
      input.outcome.merchandiseGrossRevenueEUR,
      input.economyIndex,
    ),
  };
}

export function upsertCommercialMatchday(
  tycoon: TycoonState,
  record: CommercialMatchdayRecord,
): void {
  const prior = tycoon.commercialMatchdays ?? [];
  tycoon.commercialMatchdays = [
    ...prior.filter(existing => existing.gameId !== record.gameId),
    record,
  ]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-500);
}

export function getCommercialSeasonSnapshot(
  tycoon: TycoonState,
  season: number,
): CommercialSeasonSnapshot {
  const records = (tycoon.commercialMatchdays ?? [])
    .filter(record => record.season === season)
    .sort((left, right) => right.date.localeCompare(left.date));
  const sum = (selector: (record: CommercialMatchdayRecord) => number) => records
    .reduce((total, record) => total + Math.max(0, Number(selector(record) ?? 0)), 0);
  const merchandiseGrossRevenueEUR = sum(record => record.merchandiseGrossRevenueEUR);
  const playerMap = new Map<string, CommercialPlayerShirtSale>();
  for (const record of records) {
    for (const sale of record.playerShirtSales ?? []) {
      const existing = playerMap.get(sale.playerId);
      playerMap.set(sale.playerId, {
        playerId: sale.playerId,
        playerName: sale.playerName,
        units: (existing?.units ?? 0) + sale.units,
        revenueEUR: (existing?.revenueEUR ?? 0) + sale.revenueEUR,
      });
    }
  }
  const playerShirtSales = [...playerMap.values()]
    .sort((left, right) => right.revenueEUR - left.revenueEUR)
    .map(row => ({
      ...row,
      share: merchandiseGrossRevenueEUR > 0 ? row.revenueEUR / merchandiseGrossRevenueEUR : 0,
    }));
  const matchdayRevenueEUR = sum(record => record.matchdayRevenueEUR);
  const merchandiseRevenueEUR = sum(record => record.merchandiseRevenueEUR);
  const clubMediaRevenueEUR = sum(record => record.clubMediaRevenueEUR);
  const attendance = sum(record => record.attendance);
  return {
    records,
    totalCommercialRevenueEUR: matchdayRevenueEUR + merchandiseRevenueEUR + clubMediaRevenueEUR,
    gateRevenueEUR: sum(record => record.gateRevenueEUR),
    foodRevenueEUR: sum(record => record.foodRevenueEUR),
    drinkRevenueEUR: sum(record => record.drinkRevenueEUR),
    matchdayRevenueEUR,
    merchandiseGrossRevenueEUR,
    merchandiseDistributionCostEUR: sum(record => record.merchandiseDistributionCostEUR),
    merchandiseRevenueEUR,
    clubMediaRevenueEUR,
    attendance,
    averageAttendance: records.length > 0 ? Math.round(attendance / records.length) : 0,
    playerShirtSales,
  };
}
