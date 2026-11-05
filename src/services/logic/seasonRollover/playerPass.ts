import { type GameState, type NBAPlayer } from '../../../types';
import { runRetirementChecks, runFarewellTourChecks, type RetireeRecord, type FarewellRecord, type MortalityRecord, type RetirementRunDiagnostics } from '../../playerDevelopment/retirementChecker';
import { runHOFChecks, runPbaHOFChecks, type HOFInduction } from '../../playerDevelopment/hofChecker';
import { runJerseyRetirementChecks, type JerseyRetirementRecord } from '../../playerDevelopment/jerseyRetirementChecker';
import { computeContractOffer, formatContractTotalUSD, getContractLimits, isSupermaxAwardQualified } from '../../../utils/salaryUtils';
import { computeAge } from '../../../utils/helpers';
import { resolvePotentialBbgm } from '../../../utils/playerRatings';
import { computeMoodScore } from '../../../utils/mood/moodScore';
import type { MoodTrait } from '../../../utils/mood/moodTypes';
import { SettingsManager } from '../../SettingsManager';
import { ensureDraftClasses } from '../../draftClassFiller';
import { potEstimator, type GeneratedPlayerGender } from '../../genDraftPlayers';
import { normalizeFictionalPositionLabel } from '../../../utils/positionUtils';
import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../../../data/euroBasketballSources';
import { retireExternalLeaguePlayers, repopulateExternalLeagues, enforceExternalMinRoster } from '../../externalLeagueSustainer';
import { runExternalFreeAgency } from '../../externalFreeAgency';
import { getActiveUserBidMarketPlayerIds } from '../../freeAgencyBidding';
import { resolveSeasonRolloverOptionDecisions, type PendingOptionToast } from './optionDecisions';
import { buildRetireeStaffCandidate, computeStaffProbability } from '../../../utils/staffprobability';
import { buildPbaCollegePoolFromSource } from '../../pba/collegeSources';
import { getPbaDraftClassTargetSize, tunePbaDraftProspects } from '../../pba/draftRules';
import { getUpcomingPbaDraftYears } from '../../pba/draftCalendar';
import { isPbaRosterLocal } from '../../pba/importManager';
import { withNbaBackgroundEconomy } from '../../freeAgency/aiFreeAgencyHelpers';
import { isHistoricalNbaStart } from '../../../data/historicalNbaSeasons';
import { buildCachedZengmHistoricalDraftProspects } from '../../zengmHistoricalRoster';
import { buildHistoricalRetiredPlayerStaffCandidates } from '../../staff/historicalCoachPool';
import { normalizeContractOptionKind } from '../../../utils/contractTypes';
import { EXTERNAL_LEAGUE_STATUSES } from '../../../constants';
import { isPlayerInLeagueScope } from '../../../utils/playerLeagueScope';
import { applyGeneratedFamilyLineages, getFamilyLineageEventsForYear, type FamilyLineageEvent } from '../../playerFamilyLineage';
import { syncPlayerContractAmountForSeason } from '../../../utils/contractSeasonSync';
import {
  consumeTeamOptionContractYear,
  getNextPendingTeamOptionYear,
  getRookieScaleExitYear,
  resolveOffseasonContractDecision,
} from '../../freeAgency/offseasonContractDecision';
import { getDisplayOverall } from '../../../store/playerRatingStore';
type HistoryEntry = NonNullable<GameState['history']>[number];
type StaffFreeAgent = NonNullable<GameState['staffFreeAgents']>[number];
function isHistoricalRealPlayer(player: NBAPlayer): boolean {
  return typeof (player as any).srID === 'string' || typeof (player as any).slug === 'string';
}
interface OptionExtension {
  newExp: number;
  newYears: number;
  annualUSD: number;
  hasPlayerOption: boolean;
  label: string;
  contractYears: Array<{ season: string; guaranteed: number; option: string }>;
  amountThousands: number;
}
export interface SeasonRolloverPlayerPassArgs {
  state: GameState;
  currentYear: number;
  nextYear: number;
  leagueStartYear: number;
  optionDateStr: string;
  nextLeagueStats?: GameState['leagueStats'];
  externalLeagueLifecycleEnabled?: boolean;
  computeBirdRightsForRollover: (
    player: NBAPlayer,
    leagueStats: GameState['leagueStats'],
    yearsCompleted: number,
  ) => boolean;
}
export interface SeasonRolloverPlayerPassResult {
  playersFinalized: NBAPlayer[];
  teamsAfterJerseyRetirements: NonNullable<GameState['teams']>;
  expiredIds: Set<string>;
  preservedUserBidMarkets: NonNullable<NonNullable<GameState['faBidding']>['markets']>;
  pendingOptionToasts: PendingOptionToast[];
  playerOptionNews: string[];
  teamOptionNews: string[];
  playerOptionHistory: HistoryEntry[];
  optionExtHistory: HistoryEntry[];
  extRetireHistory: HistoryEntry[];
  extFAHistory: HistoryEntry[];
  newRetirees: RetireeRecord[];
  newRetireeStaffCandidates: StaffFreeAgent[];
  newFarewells: FarewellRecord[];
  newInductees: HOFInduction[];
  newJerseyRetirements: JerseyRetirementRecord[];
  deaths: MortalityRecord[];
  familyLineageEvents: FamilyLineageEvent[];
  optionExtensionsCount: number;
  teamOptionExercisedCount: number;
  teamOptionDeclinedCount: number;
  retirementDiagnostics: RetirementRunDiagnostics;
}

export function applyAIQualifyingOfferDecisions(
  players: NBAPlayer[],
  state: GameState,
  completedSeason: number,
): NBAPlayer[] {
  const uiMode = String(state.leagueStats?.uiMode ?? 'nba');
  if (uiMode !== 'nba' && uiMode !== 'fictional') return players;
  const userManagedTeamId = state.gameMode === 'gm' ? Number(state.userTeamId) : Number.NaN;
  const decisionState = { ...state, players };

  return players.map(player => {
    const decision = resolveOffseasonContractDecision(player, decisionState, completedSeason);
    if (
      (decision.kind !== 'ROOKIE_EXIT_RFA_QO' && decision.kind !== 'RFA_QO_DUE')
      || decision.teamId === undefined
      || decision.teamId === userManagedTeamId
      || !player.contract
    ) {
      return player;
    }
    const submit = getDisplayOverall(player) >= 70;
    return {
      ...player,
      contract: {
        ...player.contract,
        restrictedFA: submit || undefined,
        isRestrictedFA: submit || undefined,
        qualifyingOfferSubmitted: submit,
        qualifyingOfferSkipped: !submit,
      },
    };
  });
}

export function runSeasonRolloverPlayerPass({
  state,
  currentYear,
  nextYear,
  leagueStartYear,
  optionDateStr,
  nextLeagueStats,
  externalLeagueLifecycleEnabled = state.leagueType !== 'fictional',
  computeBirdRightsForRollover,
}: SeasonRolloverPlayerPassArgs): SeasonRolloverPlayerPassResult {
  const economyState = withNbaBackgroundEconomy({
    ...state,
    leagueStats: nextLeagueStats ?? state.leagueStats,
  });
  const economyLeagueStats = economyState.leagueStats;
  const {
    playerOptOutIds,
    playerOptInIds,
    teamOptionExercisedIds,
    teamOptionDeclinedIds,
    playerOptionNews,
    teamOptionNews,
    playerOptionHistory,
    pendingOptionToasts,
  } = resolveSeasonRolloverOptionDecisions({
    state,
    currentYear,
    nextYear,
    optionDateStr,
    leagueStats: economyLeagueStats,
  });
  const optionExtensions = new Map<string, OptionExtension>();
  const optionExtHistory: HistoryEntry[] = [];
  for (const p of state.players) {
    if (!teamOptionExercisedIds.has(p.internalId)) continue;
    const optionEndYear = getNextPendingTeamOptionYear(p, currentYear);
    const rookieScaleExitYear = getRookieScaleExitYear(p, state);
    if (optionEndYear === undefined || rookieScaleExitYear === undefined || optionEndYear !== rookieScaleExitYear) continue;
    const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    if (yearsOfService < 3 || yearsOfService > 4) continue;
    const team = state.teams.find(t => t.id === p.tid);
    if (!team) continue;
    const playerForExt = { ...p, hasBirdRights: true } as NBAPlayer;
    const limits = getContractLimits(playerForExt, economyLeagueStats as any);
    if (!limits.isRookieExtEligible && !limits.isSupermaxEligible) continue;
    const traits: MoodTrait[] = (p as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(player => player.tid === p.tid);
    const { score: moodScore } = computeMoodScore(p, team, state.date, false, false, false, teamPlayers, currentYear);
    const offer = computeContractOffer(playerForExt, economyLeagueStats as any, traits, moodScore);
    const recentAwards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
    const hasFoundationalAward = recentAwards.some(award => award.season >= currentYear - 2 && /mvp|all.nba/i.test(award.type));
    const wins = (team as any).wins ?? 0;
    const losses = (team as any).losses ?? 0;
    const winPct = wins + losses > 0 ? wins / (wins + losses) : 0.5;
    let basePct: number;
    if (traits.includes('LOYAL')) basePct = 0.97;
    else if (hasFoundationalAward) basePct = 0.95;
    else if (moodScore >= 2) basePct = 0.9;
    else if (moodScore >= -2) basePct = 0.78;
    else basePct = 0.5;
    if (traits.includes('COMPETITOR') && winPct < 0.4 && (p.overallRating ?? 0) >= 60) {
      basePct = Math.min(basePct, 0.45);
    }
    let seed = 0;
    for (let i = 0; i < p.internalId.length; i++) seed += p.internalId.charCodeAt(i);
    seed += currentYear * 97;
    const roll = Math.abs((Math.sin(seed) * 10000) % 1);
    if (roll >= basePct) continue;
    const extBaseYear = (p.contract?.exp ?? currentYear) + 1;
    const extYears = offer.years;
    const annualUSD = offer.salaryUSD;
    const extContractYears = Array.from({ length: extYears }, (_, i) => {
      const year = extBaseYear + i;
      return {
        season: `${year - 1}-${String(year).slice(-2)}`,
        guaranteed: Math.round(annualUSD * Math.pow(1.05, i)),
        option: i === extYears - 1 && offer.hasPlayerOption ? 'Player' : '',
      };
    });
    const label = limits.isSupermaxEligible ? 'Supermax' : limits.rookieRoseQualified ? 'Rose Rule' : 'Rookie Ext';
    optionExtensions.set(p.internalId, {
      newExp: extBaseYear + extYears - 1,
      newYears: extYears,
      annualUSD,
      hasPlayerOption: offer.hasPlayerOption,
      label,
      contractYears: extContractYears,
      amountThousands: Math.round(annualUSD / 1_000),
    });
    const totalValue = formatContractTotalUSD(annualUSD, extYears);
    const optTag = offer.hasPlayerOption ? ' (player option)' : '';
    optionExtHistory.push({
      text: `${p.name} has signed a rookie extension with the ${team.name}: ${totalValue}/${extYears}yr${optTag} (${label})`,
      date: optionDateStr,
      type: 'Signing',
      playerIds: [p.internalId],
      tid: team.id,
    } as unknown as HistoryEntry);
  }
  const nextSeasonStr = `${nextYear - 1}-${String(nextYear).slice(-2)}`;
  const optionSeasonStr = `${currentYear}-${String(nextYear).slice(-2)}`;
  const SANE_GUARANTEED_USD = 250_000_000;
  const SANE_AMOUNT_THOUSANDS = 250_000;
  const syncedContractAmount = (p: NBAPlayer): number | undefined => {
    const contractYears = (p as any).contractYears as Array<{ season: string; guaranteed: number }> | undefined;
    if (!contractYears) return undefined;
    const entry = contractYears.find(cy => cy.season === nextSeasonStr);
    if (!entry || entry.guaranteed <= 0 || entry.guaranteed > SANE_GUARANTEED_USD) return undefined;
    const synced = Math.round(entry.guaranteed / 1000);
    if (synced <= 0 || synced > SANE_AMOUNT_THOUSANDS) return undefined;
    return synced;
  };
  const optionSalaryUSD = (p: NBAPlayer): number => {
    const contractYears = (p as any).contractYears as Array<{ season?: string; guaranteed?: number; option?: string }> | undefined;
    const entry = Array.isArray(contractYears)
      ? contractYears.find(cy => cy.season === `${currentYear}-${String(nextYear).slice(-2)}` && normalizeContractOptionKind(cy.option) !== 'none')
      : undefined;
    const guaranteed = Number(entry?.guaranteed ?? 0);
    return guaranteed > 0 ? guaranteed : (p.contract?.amount ?? 0) * 1_000;
  };
  const expiredIds = new Set<string>();
  const externalExpiredIds = new Set<string>();
  const hasCompletedCurrentSeasonService = (player: NBAPlayer): boolean => (
    (player.stats ?? []).some(row => (
      !row.playoffs
      && Number(row.season) === currentYear
      && Number(row.gp ?? 0) > 0
    ))
  );
  const isUnplayedCurrentDraftRookie = (player: NBAPlayer): boolean => (
    player.contract?.rookie === true
    && Number(player.draft?.year) === currentYear
    && !hasCompletedCurrentSeasonService(player)
  );
  const yearsWithTeamAfterCompletedSeason = (player: NBAPlayer): number => (
    isUnplayedCurrentDraftRookie(player)
      ? Math.max(0, Number((player as NBAPlayer & { yearsWithTeam?: number }).yearsWithTeam ?? 0))
      : Math.max(0, Number((player as NBAPlayer & { yearsWithTeam?: number }).yearsWithTeam ?? 0)) + 1
  );
  const updatedPlayers: NBAPlayer[] = state.players.map(player => {
    let p = player;
    if (p.overallRating && p.tid !== -2 && !(p as any).diedYear) {
      const existing = (p as any).ovrHistory ?? [];
      if (!existing.some((entry: any) => entry.season === currentYear)) {
        p = { ...p, ovrHistory: [...existing, { season: currentYear, ovr: p.overallRating }] } as any;
      }
    }
    if (
      p.tid !== -2 &&
      !(p as any).diedYear &&
      (p as any).status !== 'Retired' &&
      p.ratings &&
      p.ratings.length > 0 &&
      typeof p.age === 'number'
    ) {
      const ratingsArr = p.ratings as any[];
      const currentYearIndex = ratingsArr.findIndex(rating => rating?.season === currentYear);
      const ratingIndex = currentYearIndex !== -1 ? currentYearIndex : ratingsArr.length - 1;
      const lastRating = ratingsArr[ratingIndex];
      const currentOvr = lastRating?.ovr ?? p.overallRating ?? 60;
      const priorPot = lastRating?.pot ?? currentOvr;
      const ageForPot = computeAge(p, currentYear);
      const realPlayer = isHistoricalRealPlayer(p);
      const pbaTunedDraftPlayer = state.leagueStats?.uiMode === 'pba_isolated' &&
        String((p as any).pbaDraftTunedVersion ?? '').startsWith('pba-draft-');
      const targetPot = realPlayer
        ? resolvePotentialBbgm(currentOvr, ageForPot, undefined)
        : potEstimator(currentOvr, ageForPot);
      const blend = ageForPot <= 22 ? 0.25 : ageForPot <= 27 ? 0.4 : 0.6;
      const blended = Math.round(priorPot + (targetPot - priorPot) * blend);
      const clampedByStep = Math.max(priorPot - 3, Math.min(priorPot + 3, blended));
      const potFloor = realPlayer && ageForPot < 29 ? Math.max(currentOvr, targetPot) : currentOvr - 5;
      const newPot = Math.min(99, Math.max(potFloor, clampedByStep));
      if (!pbaTunedDraftPlayer && newPot !== priorPot) {
        const nextRatings = ratingsArr.map((rating, idx) => idx === ratingIndex ? { ...rating, pot: newPot } : rating);
        p = { ...p, ratings: nextRatings } as NBAPlayer;
      }
    }
    if ((p as any).diedYear) return p;
    if (p.tid === -2) return p;
    const externalLeagues = EXTERNAL_LEAGUE_STATUSES;
    if ((p as any).status === 'Retired' || !p.contract || p.tid < 0) {
      return typeof p.age === 'number' ? ({ ...p, age: p.age + 1 } as NBAPlayer) : p;
    }
    if (externalLeagues.includes((p as any).status ?? '') || p.tid >= 100) {
      const bumpedAge = typeof p.age === 'number' ? p.age + 1 : p.age;
      const externalLeagueStatus = (p as any).status ?? '';
      const contractExpired = (p.contract?.exp ?? 0) <= currentYear;
      const isPbaImportDeal = externalLeagueStatus === 'PBA' && ((p as any).isImport || (p as any).importConference || (p as any).pbaImportContract);
      const isPbaIsolatedLocalDeal = state.leagueStats?.uiMode === 'pba_isolated' &&
        externalLeagueStatus === 'PBA' &&
        isPbaRosterLocal(p, state.leagueStats as any);
      if (contractExpired) {
        if (isPbaImportDeal) {
          return {
            ...p,
            age: bumpedAge,
            tid: -1,
            status: 'Free Agent' as const,
            euroMarketSalaryStatus: state.leagueStats?.uiMode === 'euro_isolated'
              ? externalLeagueStatus
              : p.euroMarketSalaryStatus,
            yearsWithTeam: 0,
            isImport: undefined,
            importConference: undefined,
            importTeamId: undefined,
            pbaImportContract: {
              ...((p as any).pbaImportContract ?? {}),
              status: 'released',
              releaseDate: state.date,
            },
            contract: undefined,
          } as any;
        }
        if (isPbaIsolatedLocalDeal) {
          return {
            ...p,
            age: bumpedAge,
            tid: -1,
            status: 'Free Agent' as const,
            euroMarketSalaryStatus: state.leagueStats?.uiMode === 'euro_isolated'
              ? externalLeagueStatus
              : p.euroMarketSalaryStatus,
            yearsWithTeam: 0,
            twoWay: undefined,
            nonGuaranteed: false,
            gLeagueAssigned: false,
            midSeasonExtensionDeclined: undefined,
            signedDate: undefined,
            tradeEligibleDate: undefined,
            pbaPreviousTid: p.tid,
            contract: { ...p.contract, hasPlayerOption: false, hasTeamOption: false },
          } as any;
        }
        const ovrForFlip = p.overallRating ?? 0;
        const flipThresholdByLeague: Record<string, number> = {
          Euroleague: 44,
          Endesa: 46,
          'NBL Australia': 50,
          'China CBA': 55,
          'B-League': 62,
          PBA: 62,
          'G-League': 40,
        };
        const nbaFlipThreshold = flipThresholdByLeague[externalLeagueStatus] ?? 50;
        const isWNBA = externalLeagueStatus === 'WNBA';
        if (!isWNBA && ovrForFlip >= nbaFlipThreshold) {
          expiredIds.add(p.internalId);
          return {
            ...p,
            age: bumpedAge,
            tid: -1,
            status: 'Free Agent' as const,
            euroMarketSalaryStatus: state.leagueStats?.uiMode === 'euro_isolated'
              ? externalLeagueStatus
              : p.euroMarketSalaryStatus,
            yearsWithTeam: 0,
            twoWay: undefined,
            nonGuaranteed: false,
            gLeagueAssigned: false,
            midSeasonExtensionDeclined: undefined,
            contract: { ...p.contract, hasPlayerOption: false },
          } as any;
        }
        externalExpiredIds.add(p.internalId);
        return {
          ...p,
          age: bumpedAge,
          contract: {
            ...p.contract,
            exp: currentYear + (ovrForFlip >= 40 ? 2 : 1),
            amount: Math.max(p.contract?.amount ?? 0, 1),
            hasPlayerOption: false,
          },
          yearsWithTeam: yearsWithTeamAfterCompletedSeason(p),
        } as any;
      }
      if (isPbaIsolatedLocalDeal) {
        const nextAmount = syncedContractAmount(p);
        return {
          ...p,
          age: bumpedAge,
          yearsWithTeam: yearsWithTeamAfterCompletedSeason(p),
          contract: {
            ...p.contract,
            ...(nextAmount ? { amount: nextAmount } : {}),
          },
        } as any;
      }
      return typeof p.age === 'number' ? ({ ...p, age: p.age + 1 } as NBAPlayer) : p;
    }
    const contractExp = p.contract.exp ?? 0;
    const newAge = typeof p.age === 'number' ? p.age + 1 : p.age;
    if ((state.leagueStats as any)?.uiMode === 'pba_isolated' && p.tid >= 0 && p.tid < 100) {
      const nextAmount = syncedContractAmount(p);
      const yearsWithTeam = yearsWithTeamAfterCompletedSeason(p);
      return {
        ...p,
        age: newAge,
        yearsWithTeam,
        midSeasonExtensionDeclined: undefined,
        contract: {
          ...p.contract,
          exp: Math.max(p.contract.exp ?? nextYear, nextYear),
          hasPlayerOption: false,
          hasTeamOption: false,
          ...(nextAmount ? { amount: nextAmount } : {}),
        },
      } as any;
    }
    if (playerOptInIds.has(p.internalId)) {
      const nextAmount = syncedContractAmount(p) ?? Math.round(optionSalaryUSD(p) / 1_000);
      const yearsWithTeam = yearsWithTeamAfterCompletedSeason(p);
      const hasBirdRights = computeBirdRightsForRollover(p, economyLeagueStats, yearsWithTeam);
      return {
        ...p,
        age: newAge,
        yearsWithTeam,
        hasBirdRights,
        midSeasonExtensionDeclined: undefined,
        contract: {
          ...p.contract,
          hasPlayerOption: false,
          ...(nextAmount ? { amount: nextAmount } : {}),
        },
        contractYears: Array.isArray((p as any).contractYears)
          ? (p as any).contractYears.map((cy: any) =>
              cy.season === optionSeasonStr && normalizeContractOptionKind(cy.option) === 'player'
                ? { ...cy, option: '' }
                : cy,
            )
          : (p as any).contractYears,
      } as any;
    }
    if (teamOptionDeclinedIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      const isRFA = !!(p as any).contract?.restrictedFA;
      const yearsCompleted = yearsWithTeamAfterCompletedSeason(p);
      const resolvedOptionYear = getNextPendingTeamOptionYear(p, currentYear - 1) ?? nextYear;
      const optionResolved = consumeTeamOptionContractYear(p, resolvedOptionYear, 'decline');
      return {
        ...optionResolved,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        hasBirdRights: computeBirdRightsForRollover(p, economyLeagueStats, yearsCompleted),
        midSeasonExtensionDeclined: undefined,
        declinedTeamOptionByTid: p.tid,
        declinedTeamOptionSeasonYear: resolvedOptionYear,
        declinedTeamOptionSalaryUSD: optionSalaryUSD(p),
        offseasonDecisionTeamId: p.tid,
        offseasonDecisionSeason: currentYear,
        contract: {
          ...optionResolved.contract!,
          restrictedFA: isRFA,
          isRestrictedFA: isRFA,
          qualifyingOfferSubmitted: false,
          qualifyingOfferSkipped: false,
        },
      } as any;
    }
    if (teamOptionExercisedIds.has(p.internalId)) {
      const resolvedOptionYear = getNextPendingTeamOptionYear(p, currentYear - 1) ?? nextYear;
      const optionResolved = consumeTeamOptionContractYear(p, resolvedOptionYear, 'exercise');
      const nextAmount = syncedContractAmount(p);
      const yearsWithTeam = yearsWithTeamAfterCompletedSeason(p);
      const hasBirdRights = computeBirdRightsForRollover(p, economyLeagueStats, yearsWithTeam);
      const supermaxEnabled = economyLeagueStats.supermaxEnabled ?? true;
      const supermaxMinYears = (economyLeagueStats as any).supermaxMinYears ?? 8;
      const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
      const awards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
      const superMaxEligible = supermaxEnabled && hasBirdRights &&
        isSupermaxAwardQualified(awards, currentYear, yearsOfService, supermaxMinYears);
      const extension = optionExtensions.get(p.internalId);
      if (extension) {
        const keepExistingThrough = p.contract?.exp ?? currentYear;
        const existingThroughCurrent = (optionResolved.contractYears ?? []).filter(cy => {
          const year = parseInt(cy.season.split('-')[0], 10) + 1;
          return year <= keepExistingThrough;
        });
        return {
          ...optionResolved,
          age: newAge,
          yearsWithTeam,
          hasBirdRights,
          superMaxEligible,
          midSeasonExtensionDeclined: undefined,
          contract: {
            ...optionResolved.contract!,
            exp: extension.newExp,
            ...(nextAmount ? { amount: nextAmount } : {}),
          },
          contractYears: [...existingThroughCurrent, ...extension.contractYears],
        } as any;
      }
      return {
        ...optionResolved,
        age: newAge,
        yearsWithTeam,
        hasBirdRights,
        superMaxEligible,
        midSeasonExtensionDeclined: undefined,
        contract: {
          ...optionResolved.contract!,
          ...(nextAmount ? { amount: nextAmount } : {}),
        },
      } as any;
    }
    if (contractExp <= currentYear || playerOptOutIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      const yearsCompleted = yearsWithTeamAfterCompletedSeason(p);
      const rookieScaleExitYear = getRookieScaleExitYear(p, state);
      const isRookieScaleExit = rookieScaleExitYear === currentYear;
      const isRestrictedFA = isRookieScaleExit && !!p.contract.restrictedFA;
      return {
        ...p,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        hasBirdRights: computeBirdRightsForRollover(p, economyLeagueStats, yearsCompleted),
        birdRightsTeamId: p.tid,
        birdRightsSeason: currentYear,
        offseasonDecisionTeamId: p.tid,
        offseasonDecisionSeason: currentYear,
        midSeasonExtensionDeclined: undefined,
        twoWay: undefined,
        playoffEligible: undefined,
        contract: {
          ...p.contract,
          hasPlayerOption: false,
          hasTeamOption: undefined,
          teamOptionExp: undefined,
          rookie: isRookieScaleExit ? undefined : p.contract.rookie,
          restrictedFA: isRestrictedFA || undefined,
          isRestrictedFA: isRestrictedFA || undefined,
          qualifyingOfferSubmitted: isRestrictedFA ? false : undefined,
          qualifyingOfferSkipped: isRestrictedFA ? false : undefined,
        },
      } as any;
    }
    const yearsWithTeam = yearsWithTeamAfterCompletedSeason(p);
    const hasBirdRights = computeBirdRightsForRollover(p, economyLeagueStats, yearsWithTeam);
    const supermaxEnabled = economyLeagueStats.supermaxEnabled ?? true;
    const supermaxMinYears = (economyLeagueStats as any).supermaxMinYears ?? 8;
    const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    const awards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
    const superMaxEligible = supermaxEnabled && hasBirdRights &&
      isSupermaxAwardQualified(awards, currentYear, yearsOfService, supermaxMinYears);
    const nextAmount = syncedContractAmount(p);
    const rookieScaleExitYear = getRookieScaleExitYear(p, state);
    const rookieExtensionActivated = rookieScaleExitYear !== undefined
      && currentYear >= rookieScaleExitYear
      && contractExp > rookieScaleExitYear;
    return {
      ...p,
      age: newAge,
      yearsWithTeam,
      hasBirdRights,
      superMaxEligible,
      midSeasonExtensionDeclined: undefined,
      ...(nextAmount || rookieExtensionActivated ? {
        contract: {
          ...p.contract,
          ...(nextAmount ? { amount: nextAmount } : {}),
          ...(rookieExtensionActivated ? {
            rookie: undefined,
            restrictedFA: undefined,
            isRestrictedFA: undefined,
            hasTeamOption: undefined,
            teamOptionExp: undefined,
            qualifyingOfferSubmitted: undefined,
            qualifyingOfferSkipped: undefined,
          } : {}),
        },
      } : {}),
    } as any;
  });
  const preservedUserBidMarkets = ((state as any).faBidding?.markets ?? [])
    .filter((market: any) =>
      !market.resolved &&
      expiredIds.has(market.playerId) &&
      (market.bids ?? []).some((bid: any) => bid.isUserBid && bid.status === 'active')
    )
    .map((market: any) => {
      const decisionDay = Math.max(market.decidesOnDay ?? ((state.day ?? 0) + 4), (state.day ?? 0) + 4);
      return {
        ...market,
        season: nextYear,
        decidesOnDay: decisionDay,
        openedDay: market.openedDay ?? state.day,
        openedDate: market.openedDate ?? state.date,
        bids: (market.bids ?? []).map((bid: any) =>
          bid.status === 'active'
            ? { ...bid, expiresDay: Math.max(bid.expiresDay ?? decisionDay, decisionDay) }
            : bid,
        ),
      };
    });
  const playersAfterAIQualifyingOffers = applyAIQualifyingOfferDecisions(
    updatedPlayers,
    { ...state, leagueStats: economyLeagueStats },
    currentYear,
  );
  const pbaLifecyclePlayerIds = state.leagueStats?.uiMode === 'pba_isolated'
    ? new Set(state.players.map(player => player.internalId))
    : new Set<string>();
  const { players: playersAfterExtFA, historyEntries: extFAHistory } = externalLeagueLifecycleEnabled
    ? runExternalFreeAgency(
      { ...state, players: playersAfterAIQualifyingOffers } as any,
      externalExpiredIds,
      currentYear,
    )
    : { players: playersAfterAIQualifyingOffers, historyEntries: [] };
  const externalRetirementInput = state.leagueStats?.uiMode === 'pba_isolated'
    ? playersAfterExtFA.map(player =>
        pbaLifecyclePlayerIds.has(player.internalId) && player.status !== 'Retired' && player.tid !== -2
          ? { ...player, status: 'PBA' as const }
          : player,
      )
    : playersAfterExtFA;
  const {
    players: rawPlayersAfterExtRetire,
    retirees: extRetirees,
    historyEntries: extRetireHistory,
  } = externalLeagueLifecycleEnabled
    ? retireExternalLeaguePlayers(externalRetirementInput, currentYear, state.date, state)
    : { players: playersAfterExtFA, retirees: [], historyEntries: [] };
  const pbaRetiredIds = new Set(extRetirees.filter(record => record.league === 'PBA').map(record => record.player.internalId));
  const preRetirementById = new Map(playersAfterExtFA.map(player => [player.internalId, player]));
  const playersAfterExtRetire = state.leagueStats?.uiMode === 'pba_isolated'
    ? rawPlayersAfterExtRetire.map(player =>
        pbaRetiredIds.has(player.internalId) ? player : preRetirementById.get(player.internalId) ?? player,
      )
    : rawPlayersAfterExtRetire;
  const protectedFAMarketPlayerIds = getActiveUserBidMarketPlayerIds(state);
  const unplayedCurrentDraftRookieIds = new Set(
    playersAfterExtRetire
      .filter(isUnplayedCurrentDraftRookie)
      .map(player => player.internalId),
  );
  const standardPlayerScope = state.leagueStats?.uiMode === 'nba' || !state.leagueStats?.uiMode
    ? (state.leagueType === 'fictional' ? 'fictional' : 'nba')
    : null;
  const standardTeamIds = new Set(
    (state.teams ?? []).map(team => Number(team.id)).filter(Number.isFinite),
  );
  const outOfScopePlayerIds = new Set(
    playersAfterExtRetire
      .filter(player => !standardPlayerScope || !isPlayerInLeagueScope(player, standardPlayerScope, standardTeamIds))
      .map(player => player.internalId),
  );
  const standardRetirementExcludedIds = new Set([
    ...pbaLifecyclePlayerIds,
    ...unplayedCurrentDraftRookieIds,
    ...outOfScopePlayerIds,
  ]);
  const retirementResult = state.leagueStats?.uiMode === 'pba_isolated'
    ? {
        players: playersAfterExtRetire,
        newRetirees: [] as RetireeRecord[],
        diagnostics: { playersScanned: 0, evaluated: 0, eligible: 0, selected: 0, persisted: 0 },
      }
    : runRetirementChecks(
        playersAfterExtRetire,
        currentYear,
        {
          protectedPlayerIds: protectedFAMarketPlayerIds,
          excludedPlayerIds: standardRetirementExcludedIds,
        },
      );
  const { players: playersAfterRetire, newRetirees: standardRetirees } = retirementResult;
  const euroLeagueStatuses = new Set([
    EUROLEAGUE_2026_SOURCE.leagueStatus,
    ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
    'Endesa',
    'EuroCup',
  ]);
  const scopedExternalRetirees = state.leagueStats?.uiMode === 'pba_isolated'
    ? extRetirees.filter(record => record.league === 'PBA')
    : state.leagueStats?.uiMode === 'euro_isolated'
      ? extRetirees.filter(record => euroLeagueStatuses.has(record.league))
      : [];
  const externalRetireesForReview: RetireeRecord[] = scopedExternalRetirees
        .map(record => {
          const rows = (record.player.stats ?? []).filter((row: any) => !row.playoffs);
          const careerGP = rows.reduce((sum: number, row: any) => sum + Number(row.gp ?? 0), 0);
          const careerPts = rows.reduce((sum: number, row: any) => sum + Number(row.pts ?? 0), 0);
          const careerReb = rows.reduce((sum: number, row: any) => sum + Number(row.trb ?? (row.orb ?? 0) + (row.drb ?? 0)), 0);
          const careerAst = rows.reduce((sum: number, row: any) => sum + Number(row.ast ?? 0), 0);
          const allStarAppearances = (record.player.awards ?? []).filter(award => award.type === 'All-Star').length;
          const championships = (record.player.awards ?? []).filter(award => /Champion|Won Championship/i.test(award.type)).length;
          return {
            playerId: record.player.internalId,
            name: record.player.name,
            age: computeAge(record.player, currentYear),
            ovr: record.player.overallRating ?? 0,
            allStarAppearances,
            championships,
            careerGP: Math.max(record.careerGP, careerGP),
            careerPts,
            careerReb,
            careerAst,
            isLegend: allStarAppearances >= 5,
          };
        });
  const newRetirees = [...standardRetirees, ...externalRetireesForReview]
    .filter((record, index, all) => all.findIndex(candidate => candidate.playerId === record.playerId) === index);
  const newRetireeIds = new Set(newRetirees.map(record => record.playerId));
  const playersAfterLeaderBadges = playersAfterRetire.map(player => {
    if (!newRetireeIds.has(player.internalId)) return player;
    if (computeStaffProbability(player).staffJoinChance <= 40) return player;
    if (player.personalityBadges?.includes('leader')) return player;
    return {
      ...player,
      personalityBadges: [...(player.personalityBadges ?? []), 'leader'],
    } as NBAPlayer;
  });
  const retiredPlayersById = new Map(playersAfterLeaderBadges.map(player => [player.internalId, player]));
  const shouldUseHistoricalCoachPool = state.leagueType === 'modded' &&
    state.moddedLeagueBase === 'nba' &&
    (!state.leagueStats?.uiMode || state.leagueStats.uiMode === 'nba');
  const historicalRetiredStaff = shouldUseHistoricalCoachPool
    ? buildHistoricalRetiredPlayerStaffCandidates(
        state,
        playersAfterLeaderBadges,
        currentYear,
        state.staffFreeAgents ?? [],
      )
    : { candidates: [] as StaffFreeAgent[], joinedPlayers: [] as Array<{ playerId: string; role: string }> };
  const historicalJoinedRoleByPlayerId = new Map(
    historicalRetiredStaff.joinedPlayers.map(joined => [joined.playerId, joined.role]),
  );
  const probabilisticRetireeStaffCandidates = newRetirees
    .map(record => retiredPlayersById.get(record.playerId))
    .filter((player): player is NBAPlayer => !!player)
    .filter(player => !historicalJoinedRoleByPlayerId.has(player.internalId))
    .map(player => buildRetireeStaffCandidate(player, currentYear))
    .filter((candidate): candidate is StaffFreeAgent => !!candidate);
  const newRetireeStaffCandidates = [
    ...historicalRetiredStaff.candidates,
    ...probabilisticRetireeStaffCandidates,
  ];
  const staffJoinedByPlayerId = new Map(newRetireeStaffCandidates.map(candidate => [candidate.sourcePlayerId, candidate]));
  const playersAfterStaffRolls = staffJoinedByPlayerId.size > 0 || historicalJoinedRoleByPlayerId.size > 0
    ? playersAfterLeaderBadges.map(player => {
        const candidate = staffJoinedByPlayerId.get(player.internalId);
        const historicalRole = historicalJoinedRoleByPlayerId.get(player.internalId);
        return candidate || historicalRole
          ? {
              ...player,
              postCareerStaffJoined: true,
              postCareerStaffRole: candidate?.role ?? candidate?.position ?? candidate?.jobTitle ?? historicalRole ?? 'Staff',
              postCareerStaffYear: currentYear,
            } as NBAPlayer
          : player;
      })
    : playersAfterLeaderBadges;
  const { players: playersWithFarewells, newFarewells } = state.leagueStats?.uiMode === 'pba_isolated'
    ? { players: playersAfterStaffRolls, newFarewells: [] as FarewellRecord[] }
    : runFarewellTourChecks(playersAfterStaffRolls, currentYear, {
        excludedPlayerIds: standardRetirementExcludedIds,
      });
  const hofThreshold = SettingsManager.getSettings().hofWSThreshold ?? 50;
  const naismithLeague = state.leagueStats?.uiMode === 'wnba_isolated' || state.moddedLeagueBase === 'wnba'
    ? 'WNBA'
    : 'NBA';
  const nbaHofResult = state.leagueStats?.uiMode === 'pba_isolated' || state.gameMode !== 'gm'
    ? { players: playersWithFarewells, newInductees: [] as HOFInduction[] }
    : runHOFChecks(playersWithFarewells, currentYear, hofThreshold, naismithLeague);
  const pbaHofResult = state.leagueStats?.uiMode === 'pba_isolated'
    ? runPbaHOFChecks(nbaHofResult.players, currentYear)
    : { players: nbaHofResult.players, newInductees: [] as HOFInduction[] };
  const playersAfterHOF = pbaHofResult.players;
  const newInductees = [...nbaHofResult.newInductees, ...pbaHofResult.newInductees];
  const { teams: teamsAfterJerseyRetirements, newRetirements: newJerseyRetirements } =
    runJerseyRetirementChecks(playersAfterHOF, state.teams, currentYear, { leagueStartYear });
  const deaths: MortalityRecord[] = [];
  const portraitMode = 'regen_pack';
  const pbaCollegePool = state.leagueStats?.uiMode === 'pba_isolated'
    ? buildPbaCollegePoolFromSource(playersAfterHOF)
    : undefined;
  const fictionalGender: GeneratedPlayerGender = state.leagueStats.fictionalPlayerPool === 'womens'
    ? 'female'
    : state.leagueStats.fictionalPlayerPool === 'mixed'
      ? 'mixed'
      : 'male';
  const fictionalNationalityFrequencies = Object.fromEntries(
    (state.leagueStats.fictionalNationalityFrequencies ?? [])
      .filter(entry => entry.frequency > 0)
      .map(entry => [entry.country, entry.frequency]),
  );
  const generatedDraftContext = state.leagueType === 'fictional'
    || state.leagueStats?.uiMode === 'wnba_isolated'
    ? {
      gender: fictionalGender,
      targetClassSize: state.leagueStats?.uiMode === 'wnba_isolated'
        ? Math.max(48, state.teams.filter(team => team.id >= 0 && team.id < 100).length * 3 + 9)
        : Math.max(80, state.teams.filter(team => team.id >= 0 && team.id < 100).length * 2 + 20),
      nationalityFrequencies: Object.keys(fictionalNationalityFrequencies).length > 0
        ? fictionalNationalityFrequencies
        : undefined,
      suppressRealWorldOrigin: true,
      playerScope: state.leagueStats?.uiMode === 'wnba_isolated' ? 'wnba' as const : 'fictional' as const,
    }
    : state.moddedLeagueBase === 'nba' && state.leagueStats?.uiMode !== 'euro_isolated'
      ? { playerScope: 'nba' as const }
      : undefined;
  const historicalDraftAdds =
    state.leagueType === 'modded' &&
    state.moddedLeagueBase === 'nba' &&
    isHistoricalNbaStart(Number(state.nbaStartYear ?? 0))
      ? buildCachedZengmHistoricalDraftProspects(nextYear, playersAfterHOF)
      : [];
  const playersBeforeFill = historicalDraftAdds.length > 0
    ? [...playersAfterHOF, ...historicalDraftAdds]
    : playersAfterHOF;
  const fillResult = ensureDraftClasses(
    playersBeforeFill,
    nextYear,
    economyLeagueStats.draftEligibilityRule,
    portraitMode,
    pbaCollegePool
      ? {
        collegePool: pbaCollegePool,
        nationalityOverride: 'Philippines',
        forceCollegePath: true,
        talentProfile: 'pba',
        targetClassSize: getPbaDraftClassTargetSize(
          state.nonNBATeams.filter(team => team.league === 'PBA').length,
        ),
        draftYears: getUpcomingPbaDraftYears(nextYear),
      }
    : generatedDraftContext,
  );
  const draftClassAdditions = state.leagueType === 'fictional'
    ? fillResult.additions.map(player => ({
        ...player,
        pos: normalizeFictionalPositionLabel(player.pos, player.hgt),
        sourceInjuryProfileDisabled: true,
      }))
    : fillResult.additions;
  const familyScope = state.leagueStats?.uiMode === 'euro_isolated'
    ? 'euro'
    : state.leagueStats?.uiMode === 'pba_isolated'
      ? 'pba'
      : state.leagueType === 'fictional' ? 'fictional' : 'nba';
  const familyLineages = applyGeneratedFamilyLineages(
        playersBeforeFill,
        draftClassAdditions,
        nextYear,
        familyScope,
        state.leagueType === 'modded'
          && state.moddedLeagueBase === 'nba'
          && isHistoricalNbaStart(Number(state.nbaStartYear ?? 0))
          ? Number(state.nbaStartYear)
          : undefined,
      );
  const playersWithYouth = familyLineages.players;
  const tunedPlayersWithYouth = state.leagueStats?.uiMode === 'pba_isolated'
    ? tunePbaDraftProspects(playersWithYouth as any, nextYear, state.leagueStats)
    : playersWithYouth;
  const { additions: extRepopPlayers } = externalLeagueLifecycleEnabled
    ? repopulateExternalLeagues(
      { ...state, players: tunedPlayersWithYouth } as any,
      extRetirees,
      currentYear,
      nextYear,
    )
    : { additions: [] };
  const postRepopPlayers = extRepopPlayers.length > 0
    ? [...tunedPlayersWithYouth, ...extRepopPlayers]
    : tunedPlayersWithYouth;
  const { additions: safetyPlayers } = externalLeagueLifecycleEnabled
    ? enforceExternalMinRoster(
      { ...state, players: postRepopPlayers } as any,
      nextYear,
    )
    : { additions: [] };
  const playersBeforeContractSync = safetyPlayers.length > 0
    ? [...postRepopPlayers, ...safetyPlayers]
    : postRepopPlayers;
  const playersFinalized = playersBeforeContractSync.map(player =>
    syncPlayerContractAmountForSeason(player, nextYear),
  );
  const familyLineageEvents = getFamilyLineageEventsForYear(playersFinalized, nextYear, familyScope);
  return {
    playersFinalized,
    teamsAfterJerseyRetirements,
    expiredIds,
    preservedUserBidMarkets,
    pendingOptionToasts,
    playerOptionNews,
    teamOptionNews,
    playerOptionHistory,
    optionExtHistory,
    extRetireHistory: state.leagueStats?.uiMode === 'pba_isolated' ? [] : extRetireHistory,
    extFAHistory,
    newRetirees,
    newRetireeStaffCandidates,
    newFarewells,
    newInductees,
    newJerseyRetirements,
    deaths,
    familyLineageEvents,
    optionExtensionsCount: optionExtensions.size,
    teamOptionExercisedCount: teamOptionExercisedIds.size,
    teamOptionDeclinedCount: teamOptionDeclinedIds.size,
    retirementDiagnostics: retirementResult.diagnostics,
  };
}
