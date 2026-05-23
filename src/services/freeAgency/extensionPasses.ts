import type { GameState, NBAPlayer, NBATeam } from '../../types';
import {
  computeContractOffer,
  getContractLimits,
} from '../../utils/salaryUtils';
import { SettingsManager } from '../SettingsManager';
import { computeMoodScore } from '../../utils/mood/moodScore';
import type { MoodTrait } from '../../utils/mood/moodTypes';
import { getGMAttributes, clampSpendOffer } from '../staff/gmAttributes';
import { resolveTeamStrategyProfile } from '../../utils/teamStrategy';
import {
  getK2Ovr,
  pickContractLabel,
  playerAge,
} from './aiFreeAgencyHelpers';
import type { ExtensionResult } from './passTypes';

function getUserTeamId(state: GameState): number {
  return state.gameMode === 'gm' ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
}

function shouldDeclineForTeamDirection(
  team: NBATeam,
  player: NBAPlayer,
  state: GameState,
  currentYear: number,
): boolean {
  const strategy = resolveTeamStrategyProfile({
    team,
    players: state.players,
    teams: state.teams,
    leagueStats: state.leagueStats,
    currentYear,
    gameMode: state.gameMode,
    userTeamId: (state as any).userTeamId,
  });
  const age = playerAge(player, currentYear);
  const k2 = getK2Ovr(player);
  return (
    (strategy.key === 'rebuilding' || strategy.key === 'development' || strategy.key === 'cap_clearing') &&
    (age > 25 || k2 < 78)
  );
}

function buildDeclinedResult(
  player: NBAPlayer,
  teamName: string,
  currentYear: number,
): ExtensionResult {
  return {
    playerId: player.internalId,
    teamId: player.tid,
    playerName: player.name,
    teamName,
    newAmount: 0,
    newExp: currentYear,
    newYears: 0,
    hasPlayerOption: false,
    declined: true,
  };
}

function getEligibleExpiringPlayers(
  state: GameState,
  currentYear: number,
  userTeamId: number,
  minimumOverall?: number,
): NBAPlayer[] {
  return state.players.filter(player => {
    if (!player.contract) return false;
    if (player.contract.exp !== currentYear) return false;
    if (player.tid <= 0 || player.tid === userTeamId) return false;
    if ((player as any).status === 'Retired') return false;
    if ((player as any).midSeasonExtensionDeclined) return false;
    if (((player as any).yearsWithTeam ?? 0) < 1) return false;
    if (minimumOverall !== undefined && (player.overallRating ?? 0) < minimumOverall) return false;
    return true;
  });
}

function buildMidSeasonAcceptedResult(
  player: NBAPlayer,
  teamName: string,
  state: GameState,
  currentYear: number,
  traits: MoodTrait[],
  score: number,
): ExtensionResult {
  const playerForExtension = { ...player, hasBirdRights: true } as typeof player;
  const baseOffer = computeContractOffer(playerForExtension, state.leagueStats as any, traits, score);
  const limits = getContractLimits(playerForExtension, state.leagueStats as any);
  const extensionOffer = {
    ...baseOffer,
    salaryUSD: clampSpendOffer(baseOffer.salaryUSD, getGMAttributes(state, player.tid).spending, limits.maxSalaryUSD),
  };

  return {
    playerId: player.internalId,
    teamId: player.tid,
    playerName: player.name,
    teamName,
    newAmount: Math.round(extensionOffer.salaryUSD / 100_000) / 10,
    newExp: currentYear + extensionOffer.years,
    newYears: extensionOffer.years,
    hasPlayerOption: extensionOffer.hasPlayerOption,
    declined: false,
    contractLabel: pickContractLabel(limits),
  };
}

function buildSeasonEndAcceptedResult(
  player: NBAPlayer,
  teamName: string,
  state: GameState,
  currentYear: number,
  traits: MoodTrait[],
  score: number,
): ExtensionResult {
  const playerForExtension = { ...player, hasBirdRights: true } as typeof player;
  const baseOffer = computeContractOffer(playerForExtension, state.leagueStats as any, traits, score);
  const limits = getContractLimits(playerForExtension, state.leagueStats as any);
  const extensionOffer = {
    ...baseOffer,
    salaryUSD: clampSpendOffer(baseOffer.salaryUSD, getGMAttributes(state, player.tid).spending, limits.maxSalaryUSD),
  };

  return {
    playerId: player.internalId,
    teamId: player.tid,
    playerName: player.name,
    teamName,
    newAmount: Math.round(extensionOffer.salaryUSD / 100_000) / 10,
    newExp: currentYear + extensionOffer.years,
    newYears: extensionOffer.years,
    hasPlayerOption: extensionOffer.hasPlayerOption,
    declined: false,
    contractLabel: pickContractLabel(limits),
  };
}

function rollMidSeasonAcceptance(playerId: string, currentYear: number): number {
  let seed = 0;
  for (let index = 0; index < playerId.length; index++) seed += playerId.charCodeAt(index);
  seed += currentYear * 31;
  const roll = (Math.sin(seed) * 10000) % 1;
  return roll > 0 ? Math.abs(roll) - Math.floor(Math.abs(roll)) : 1;
}

function rollSeasonEndAcceptance(playerId: string, currentYear: number): number {
  let seed = 0;
  for (let index = 0; index < playerId.length; index++) seed += playerId.charCodeAt(index);
  seed += (currentYear + 7) * 53;
  return Math.abs((Math.sin(seed) * 10000) % 1);
}

export function runAIMidSeasonExtensionsPass(state: GameState): ExtensionResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const currentYear = state.leagueStats.year;
  const userTeamId = getUserTeamId(state);
  const expiringPlayers = getEligibleExpiringPlayers(state, currentYear, userTeamId);
  if (expiringPlayers.length === 0) return [];

  const results: ExtensionResult[] = [];

  for (const player of expiringPlayers) {
    const team = state.teams.find(entry => entry.id === player.tid);
    if (!team) continue;

    if (shouldDeclineForTeamDirection(team, player, state, currentYear)) {
      results.push(buildDeclinedResult(player, team.name, currentYear));
      continue;
    }

    const traits: MoodTrait[] = (player as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(entry => entry.tid === player.tid);
    const { score } = computeMoodScore(player, team, state.date, false, false, false, teamPlayers);

    let basePct: number;
    if (traits.includes('LOYAL')) basePct = 0.90;
    else if (score >= 6) basePct = 0.80;
    else if (score >= 2) basePct = 0.60;
    else if (score >= -2) basePct = 0.35;
    else basePct = 0.10;

    const gamesPlayed = (team.wins ?? 0) + (team.losses ?? 0);
    const winPct = gamesPlayed > 0 ? (team.wins ?? 0) / gamesPlayed : 0.5;
    if (traits.includes('COMPETITOR') && winPct < 0.40 && (player.overallRating ?? 0) >= 60) {
      basePct = Math.min(basePct, 0.10);
    }

    const accepted = rollMidSeasonAcceptance(player.internalId, currentYear) < basePct;
    if (!accepted) {
      const declined = buildDeclinedResult(player, team.name, currentYear);
      declined.contractLabel = undefined;
      results.push(declined);
      continue;
    }

    results.push(buildMidSeasonAcceptedResult(player, team.name, state, currentYear, traits, score));
  }

  return results;
}

export function runAISeasonEndExtensionsPass(state: GameState): ExtensionResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const currentYear = state.leagueStats.year;
  const userTeamId = getUserTeamId(state);
  const expiringPlayers = getEligibleExpiringPlayers(state, currentYear, userTeamId, 47);
  if (expiringPlayers.length === 0) return [];

  const results: ExtensionResult[] = [];

  for (const player of expiringPlayers) {
    const team = state.teams.find(entry => entry.id === player.tid);
    if (!team) continue;

    if (shouldDeclineForTeamDirection(team, player, state, currentYear)) {
      results.push(buildDeclinedResult(player, team.name, currentYear));
      continue;
    }

    const traits: MoodTrait[] = (player as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(entry => entry.tid === player.tid);
    const { score } = computeMoodScore(player, team, state.date, false, false, false, teamPlayers);

    let basePct: number;
    if (traits.includes('LOYAL')) basePct = 0.95;
    else if (score >= 4) basePct = 0.85;
    else if (score >= 0) basePct = 0.70;
    else if (score >= -3) basePct = 0.45;
    else basePct = 0.15;

    if (traits.includes('COMPETITOR')) {
      const gamesPlayed = (team.wins ?? 0) + (team.losses ?? 0);
      const winPct = gamesPlayed > 0 ? (team.wins ?? 0) / gamesPlayed : 0.5;
      if (winPct < 0.45 && (player.overallRating ?? 0) >= 62) {
        basePct = Math.min(basePct, 0.20);
      }
    }

    const accepted = rollSeasonEndAcceptance(player.internalId, currentYear) < basePct;
    if (!accepted) {
      const declined = buildDeclinedResult(player, team.name, currentYear);
      declined.contractLabel = undefined;
      results.push(declined);
      continue;
    }

    results.push(buildSeasonEndAcceptedResult(player, team.name, state, currentYear, traits, score));
  }

  return results;
}
