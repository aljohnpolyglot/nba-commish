import type { GameState } from '../../types';
import {
  computeContractOffer,
  contractToUSD,
  getCapThresholds,
  getContractLimits,
  getTeamHardCapUSD,
} from '../../utils/salaryUtils';
import { resolveBirdRightsForTeam } from '../../utils/playerBirdRights';
import { convertTo2KRating } from '../../utils/helpers';
import { getStandardRosterLimit, getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { isTwoWayContract } from '../../utils/contractTypes';
import { SettingsManager } from '../SettingsManager';
import { computeMoodScore } from '../../utils/mood/moodScore';
import type { MoodTrait } from '../../utils/mood/moodTypes';
import { isFutureDraftClassPlayer, isUnavailableInternationalTournamentPlayer } from '../../utils/prospectUtils';
import { resolveTeamStrategyProfile } from '../../utils/teamStrategy';
import { getOffseasonState, logOffseasonDrift } from '../offseason/offseasonState';
import {
  birdRightsSeed,
  getActiveFAMarketPlayerIds,
  playerAge,
  resolveUserTeamId,
} from './aiFreeAgencyHelpers';
import type { BirdRightsResignResult } from './passTypes';
import {
  isReSignDecision,
  resolveOffseasonContractDecision,
} from './offseasonContractDecision';
import { isFranchiseCareerLoyaltyActive } from '../../utils/franchiseCareerLoyalty';

export interface AIBirdRightsDecisionCandidate {
  player: GameState['players'][number];
  teamId: number;
}

export function getAIBirdRightsDecisionCandidates(state: GameState): AIBirdRightsDecisionCandidate[] {
  const currentYear = state.leagueStats.year;
  const marketPendingIds = getActiveFAMarketPlayerIds(state);
  return state.players
    .filter(player => player.tid === -1
      && player.status === 'Free Agent'
      && !isUnavailableInternationalTournamentPlayer(player))
    .filter(player => !marketPendingIds.has(player.internalId))
    .filter(player => !isFutureDraftClassPlayer(player, currentYear))
    .map(player => ({ player, decision: resolveOffseasonContractDecision(player, state) }))
    .filter(({ decision }) => isReSignDecision(decision.kind) && decision.teamId !== undefined)
    .map(({ player, decision }) => ({ player, teamId: decision.teamId! }));
}

export function runAIBirdRightsResignsPass(state: GameState): BirdRightsResignResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];
  if (state.leagueStats?.birdRightsEnabled === false) return [];

  if (state.date) {
    const offseasonState = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any);
    logOffseasonDrift(
      'AIFreeAgentHandler.runAIBirdRightsResigns',
      ['birdRights', 'openFA', 'preCamp'],
      offseasonState.phase,
      `date=${offseasonState.dateStr}`,
    );
  }

  const currentYear = state.leagueStats.year;
  const userTeamId = resolveUserTeamId(state);
  const thresholds = getCapThresholds(state.leagueStats as any);
  const maxStandard = getStandardRosterLimit(state.leagueStats as any);
  const twoWayRosterActive = getTwoWayRosterLimit(state.leagueStats as any) > 0;
  const isActiveTwoWay = (player: any): boolean =>
    twoWayRosterActive && isTwoWayContract(player, state.leagueStats);
  const marketPendingIds = getActiveFAMarketPlayerIds(state);
  const results: BirdRightsResignResult[] = [];
  const signedByTeam = new Map<number, number>();
  const spentByTeamUSD = new Map<number, number>();
  const minContractYearsRaw = Number((state.leagueStats as any).minContractLength ?? 1);
  const minContractYears = Number.isFinite(minContractYearsRaw) ? Math.max(1, minContractYearsRaw) : 1;
  const maxBirdYearsRaw = Number(
    (state.leagueStats as any).maxContractLengthBird ??
    (state.leagueStats as any).maxContractLengthStandard ??
    5,
  );
  const maxBirdYears = Math.max(
    minContractYears,
    Number.isFinite(maxBirdYearsRaw) ? maxBirdYearsRaw : 5,
  );

  const candidates = getAIBirdRightsDecisionCandidates(state);

  for (const { player, teamId: decisionTeamId } of candidates) {
    const protectedCareer = isFranchiseCareerLoyaltyActive(player);
    const priorTid = decisionTeamId;
    if (priorTid < 0 || priorTid === userTeamId) continue;
    if (!resolveBirdRightsForTeam(player, priorTid, currentYear)) continue;
    const priorTeam = state.teams.find(team => team.id === priorTid);
    if (!priorTeam) continue;

    const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
    const k2 = convertTo2KRating(player.overallRating ?? 60, lastRating?.hgt ?? 50, lastRating?.tp ?? 50);
    if (!protectedCareer && k2 < 75) continue;

    const existingStandard = state.players.filter(entry => entry.tid === priorTid && !isActiveTwoWay(entry)).length;
    const signedThisPass = signedByTeam.get(priorTid) ?? 0;
    if (existingStandard + signedThisPass >= maxStandard) continue;

    const payrollBase = state.players
      .filter(entry => entry.tid === priorTid && !isActiveTwoWay(entry))
      .reduce((sum, entry) => sum + contractToUSD(entry.contract?.amount ?? 0), 0);
    const inPassSpend = spentByTeamUSD.get(priorTid) ?? 0;
    const payroll = payrollBase + inPassSpend;
    if (thresholds.secondApron && payroll >= thresholds.secondApron) continue;

    const strategy = resolveTeamStrategyProfile({
      team: priorTeam,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    const age = playerAge(player, currentYear);
    if (
      !protectedCareer &&
      (strategy.key === 'rebuilding' || strategy.key === 'development' || strategy.key === 'cap_clearing') &&
      (age > 25 || k2 < 78)
    ) {
      continue;
    }

    const playerForBird = { ...player, hasBirdRights: true } as typeof player;
    const baseOffer = computeContractOffer(playerForBird, state.leagueStats as any);
    const limits = getContractLimits(playerForBird, state.leagueStats as any);
    const isSupermax = limits.isSupermaxEligible;
    const premiumSalary = Math.min(
      Math.round(isSupermax ? limits.maxSalaryUSD : baseOffer.salaryUSD * 1.10),
      Math.round(limits.maxSalaryUSD),
    );
    const offerYears = isSupermax
      ? maxBirdYears
      : Math.max(minContractYears, Math.min(baseOffer.years, maxBirdYears));

    if (thresholds.secondApron > 0 && payroll + premiumSalary > thresholds.secondApron * 1.25) continue;
    if (payroll + premiumSalary > getTeamHardCapUSD(state.leagueStats, thresholds, priorTid, currentYear)) continue;

    const traits: MoodTrait[] = (player as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(entry => entry.tid === priorTid);
    const { score: moodScore } = computeMoodScore(player, priorTeam, state.date, false, false, false, teamPlayers);
    if (!protectedCareer && moodScore < -2 && !traits.includes('LOYAL')) continue;

    let basePct = 0.85;
    if (traits.includes('LOYAL')) basePct = 0.95;
    else if (traits.includes('MERCENARY')) basePct = 0.65;
    if (!protectedCareer && birdRightsSeed(player.internalId, currentYear) >= basePct) continue;

    if (marketPendingIds.has(player.internalId)) {
      console.error(
        `[AI-FA] BLOCKED: ${priorTeam.name} tried to Bird-rights re-sign ${player.name} but a FA bid market is open. ` +
        `Pool filter missed this — investigate runAIBirdRightsResigns snapshot timing.`,
      );
      continue;
    }

    results.push({
      playerId: player.internalId,
      playerName: player.name,
      teamId: priorTid,
      teamName: priorTeam.name,
      salaryUSD: premiumSalary,
      years: offerYears,
      hasPlayerOption: baseOffer.hasPlayerOption,
      isSupermax,
      annualRaisePct: isSupermax ? 0.08 : 0.05,
    });
    signedByTeam.set(priorTid, signedThisPass + 1);
    spentByTeamUSD.set(priorTid, inPassSpend + premiumSalary);
  }

  return results;
}
