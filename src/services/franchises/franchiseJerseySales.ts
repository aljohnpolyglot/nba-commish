import type { GameState, NBAGMStat, NBAPlayer, NBATeam } from '../../types';
import { getSimulationSeed } from '../saveIdentity';
import { convertTo2KRating } from '../../utils/helpers';
import { isOnRoster } from '../../utils/teamLookup';
import { getTrb } from '../logic/AwardServiceShared';
import {
  getAllStarLegacyMultiplier,
  getAllStarSelectionCount,
} from '../allStar/allStarSelectionHelpers';
import { isFranchiseExperienceAvailable } from './franchiseState';
import {
  franchiseSeed,
  getFranchiseMarketFactor,
  getFranchisePerformanceFactor,
} from './franchiseMath';

const PLAYER_SEASON_CAP = 3_000_000;

export interface FranchiseJerseySaleEstimate {
  player: NBAPlayer;
  units: number;
  share: number;
  jerseyNumber: string;
}

export interface FranchiseJerseySalesSnapshot {
  season: number;
  totalUnits: number;
  rows: FranchiseJerseySaleEstimate[];
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const getRegularSeasonStat = (
  player: NBAPlayer,
  season: number,
  teamId?: number,
): NBAGMStat | undefined => {
  const rows = (player.stats ?? []).filter(stat => stat.season === season && !stat.playoffs);
  const exactRows = teamId == null ? rows : rows.filter(stat => stat.tid === teamId);
  const candidates = exactRows.length > 0 ? exactRows : teamId == null ? rows : [];
  return candidates.reduce<NBAGMStat | undefined>(
    (best, row) => !best || row.gp > best.gp ? row : best,
    undefined,
  );
};

const getPlayerK2 = (player: NBAPlayer) => {
  const latest = player.ratings?.[player.ratings.length - 1];
  return convertTo2KRating(
    Number(latest?.ovr ?? player.overallRating ?? 0),
    Number(latest?.hgt ?? 50),
    Number(latest?.tp ?? 50),
  );
};

const isLeagueMvpAward = (type: string) => {
  const label = type.toLowerCase();
  return label === 'mvp'
    || (label.includes('most valuable player')
      && !label.includes('finals')
      && !label.includes('all-star')
      && !label.includes('all star'));
};

const matchesSeasonHistoryPlayer = (
  player: NBAPlayer,
  playerId: string | undefined,
  playerName: string | undefined,
) => {
  const ids = [player.internalId, player.nbaId].filter(Boolean).map(String);
  return (playerId != null && ids.includes(String(playerId)))
    || (playerName != null && player.name === playerName);
};

const getPlayoffDepth = (state: GameState, teamId: number, season: number) => {
  const seasonHistory = state.seasonHistory?.find(row => row.year === season);
  if (seasonHistory?.championTid === teamId) return { round: 4, champion: true };
  const bracket = state.playoffs?.season === season ? state.playoffs : undefined;
  const round = Math.max(
    seasonHistory?.runnerUpTid === teamId ? 4 : 0,
    ...(bracket?.series ?? [])
      .filter(series => series.higherSeedTid === teamId || series.lowerSeedTid === teamId)
      .map(series => series.round),
  );
  return {
    round,
    champion: bracket?.champion === teamId,
  };
};

const normalizeJerseyNumber = (value: string | number | undefined) =>
  value == null ? '' : String(value).trim();

const roundUnits = (value: number) => {
  const interval = value >= 100_000 ? 1_000 : 100;
  return Math.min(PLAYER_SEASON_CAP, Math.max(0, Math.round(value / interval) * interval));
};

export function getFranchiseJerseySalesSnapshot(
  state: GameState,
  team: NBATeam,
): FranchiseJerseySalesSnapshot {
  const season = state.leagueStats.year;
  const empty = { season, totalUnits: 0, rows: [] };
  if (!isFranchiseExperienceAvailable(state)) return empty;

  const roster = state.players.filter(player => player.tid === team.id && isOnRoster(player));
  const currentStats = roster
    .map(player => getRegularSeasonStat(player, season, team.id))
    .filter((stat): stat is NBAGMStat => stat != null && stat.gp > 0);
  const gamesPlayed = currentStats.reduce((most, stat) => Math.max(most, stat.gp), 0);
  if (gamesPlayed === 0) return empty;

  const scheduledRegularGames = state.schedule.filter(game =>
    (game.homeTid === team.id || game.awayTid === team.id)
    && !game.isPreseason
    && !game.isPlayoff
    && !game.isPlayIn
    && !game.isAllStar
    && !game.isExhibition,
  ).length;
  const configuredGames = Number(state.leagueStats.gamesPerSeason);
  const seasonLength = Number.isFinite(configuredGames) && configuredGames > 0
    ? configuredGames
    : Math.max(gamesPlayed, scheduledRegularGames);
  const seasonProgress = clamp01(gamesPlayed / Math.max(1, seasonLength));
  const marketFactor = getFranchiseMarketFactor(team);
  const teamPerformanceFactor = getFranchisePerformanceFactor(team);
  const teamGames = Math.max(1, Number(team.wins ?? 0) + Number(team.losses ?? 0));
  const teamWinRate = Number(team.wins ?? 0) / teamGames;
  const playoff = getPlayoffDepth(state, team.id, season);
  const seasonHistory = state.seasonHistory?.find(row => row.year === season);

  const estimates = roster.map(player => {
    const currentStat = getRegularSeasonStat(player, season, team.id);
    const previousStat = getRegularSeasonStat(player, season - 1);
    const gp = Math.max(1, Number(currentStat?.gp ?? 0));
    const ppg = Number(currentStat?.pts ?? 0) / gp;
    const apg = Number(currentStat?.ast ?? 0) / gp;
    const rpg = Number(currentStat ? getTrb(currentStat) : 0) / gp;
    const k2 = getPlayerK2(player);
    const starLevel = clamp01((k2 - 68) / 28);
    const productionLevel = currentStat
      ? clamp01((ppg + apg * 0.65 + rpg * 0.35 - 8) / 30)
      : 0;
    const performanceLevel = Math.max(starLevel * 0.45, productionLevel);
    const eligibleAwards = (player.awards ?? []).filter(award => award.season <= season);
    const mvpCount = eligibleAwards.filter(award => isLeagueMvpAward(award.type)).length;
    const allStarCount = getAllStarSelectionCount(player, season);
    const allNbaCount = eligibleAwards.filter(award => /all[- ]nba/i.test(award.type)).length;
    const titleCount = eligibleAwards.filter(award => /champion/i.test(award.type)).length;
    const savedPopularity = Number((player as NBAPlayer & { popularity?: number }).popularity);
    const normalizedSavedPopularity = Number.isFinite(savedPopularity)
      ? clamp01(savedPopularity > 1 ? savedPopularity / 100 : savedPopularity)
      : 0;
    const careerPopularity = clamp01(
      0.12
      + starLevel * 0.42
      + Math.min(0.35, mvpCount * 0.18 + allStarCount * 0.025 + allNbaCount * 0.02 + titleCount * 0.015),
    );
    const allStarLegacyLevel = clamp01(allStarCount / 10);
    const popularityLevel = Math.max(normalizedSavedPopularity, careerPopularity, allStarLegacyLevel);
    const allStarLegacyDemand = 260_000
      * allStarLegacyLevel ** 1.35
      * getAllStarLegacyMultiplier(player, season);
    const currentSeasonMvp = matchesSeasonHistoryPlayer(
      player,
      seasonHistory?.mvpPid,
      seasonHistory?.mvp,
    ) || (player.awards ?? []).some(award =>
      award.season === season && isLeagueMvpAward(award.type)
    );
    const mvpLevelPerformance = currentSeasonMvp || (
      currentStat != null
      && currentStat.gp >= Math.max(8, Math.round(seasonLength * 0.2))
      && starLevel >= 0.82
      && performanceLevel >= 0.82
      && teamWinRate >= 0.58
    );
    const finalsMvp = matchesSeasonHistoryPlayer(
      player,
      seasonHistory?.finalsMvpPid,
      seasonHistory?.finalsMvp,
    );
    const arrival = (player.transactions ?? []).some(transaction => {
      const type = String(transaction.type ?? '').toLowerCase();
      return transaction.season === season
        && transaction.tid === team.id
        && ['trade', 'freeagent', 'free_agent', 'signing', 'expansion-draft'].includes(type);
    });
    const blockbusterArrival = arrival && starLevel >= 0.78;
    const rookieArrival = player.draft?.year === season - 1;
    const currentNumber = normalizeJerseyNumber(currentStat?.jerseyNumber ?? player.jerseyNumber);
    const priorNumber = normalizeJerseyNumber(previousStat?.jerseyNumber);
    const newNumber = currentNumber !== '' && priorNumber !== '' && currentNumber !== priorNumber;
    const comeback = previousStat != null
      && previousStat.gp <= Math.max(8, Math.round(seasonLength * 0.2))
      && Number(currentStat?.gp ?? 0) >= Math.max(12, Math.round(seasonLength * 0.35))
      && starLevel >= 0.72;

    const noveltyBoost = Math.min(
      0.36,
      (rookieArrival ? 0.12 : 0)
      + (blockbusterArrival ? 0.2 : 0)
      + (newNumber ? 0.08 : 0)
      + (comeback ? 0.12 : 0),
    );
    const playoffBoost = playoff.champion
      ? 0.42
      : playoff.round >= 4
        ? 0.26
        : playoff.round >= 3
          ? 0.14
          : playoff.round >= 2
            ? 0.06
            : 0;
    const comboCount = [
      popularityLevel >= 0.82,
      marketFactor >= 1.35,
      mvpLevelPerformance,
      playoff.round >= 3 || playoff.champion,
      noveltyBoost >= 0.18,
    ].filter(Boolean).length;
    const combinationMultiplier = comboCount >= 5
      ? 1.55
      : comboCount === 4
        ? 1.25
        : comboCount === 3
          ? 1.08
          : 1;
    const annualDemand = (
      12_000
      + 160_000 * starLevel ** 1.7
      + 180_000 * performanceLevel ** 1.6
      + 190_000 * popularityLevel ** 1.7
      + allStarLegacyDemand
    ) * marketFactor
      * (0.85 + clamp01((teamPerformanceFactor - 0.72) / 0.63) * 0.25);
    const seed = franchiseSeed(`${getSimulationSeed(state)}:${season}:${player.internalId}`);
    const stableVariation = 0.96 + (seed % 801) / 10_000;
    const units = roundUnits(
      annualDemand
      * (1 + noveltyBoost + playoffBoost + (mvpLevelPerformance ? 0.16 : 0) + (finalsMvp ? 0.08 : 0))
      * combinationMultiplier
      * stableVariation
      * seasonProgress,
    );
    return { player, units, share: 0, jerseyNumber: currentNumber };
  }).filter(row => row.units > 0);

  const totalUnits = estimates.reduce((sum, row) => sum + row.units, 0);
  const rows = estimates
    .sort((left, right) => right.units - left.units || left.player.name.localeCompare(right.player.name))
    .map(row => ({
      ...row,
      share: totalUnits > 0 ? row.units / totalUnits : 0,
    }));

  return { season, totalUnits, rows };
}
