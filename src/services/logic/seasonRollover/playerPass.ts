import { type GameState, type NBAPlayer } from '../../../types';
import { runRetirementChecks, runFarewellTourChecks, type RetireeRecord, type FarewellRecord, type MortalityRecord } from '../../playerDevelopment/retirementChecker';
import { runHOFChecks, runPbaHOFChecks, type HOFInduction } from '../../playerDevelopment/hofChecker';
import { runJerseyRetirementChecks, type JerseyRetirementRecord } from '../../playerDevelopment/jerseyRetirementChecker';
import { computeContractOffer, formatContractTotalUSD, getContractLimits, isSupermaxAwardQualified } from '../../../utils/salaryUtils';
import { computeMoodScore } from '../../../utils/mood/moodScore';
import type { MoodTrait } from '../../../utils/mood/moodTypes';
import { SettingsManager } from '../../SettingsManager';
import { ensureDraftClasses } from '../../draftClassFiller';
import { potEstimator } from '../../genDraftPlayers';
import { retireExternalLeaguePlayers, repopulateExternalLeagues, enforceExternalMinRoster } from '../../externalLeagueSustainer';
import { runExternalFreeAgency } from '../../externalFreeAgency';
import { getActiveUserBidMarketPlayerIds } from '../../freeAgencyBidding';
import { resolveSeasonRolloverOptionDecisions, type PendingOptionToast } from './optionDecisions';
import { buildRetireeStaffCandidate } from '../../../utils/staffprobability';
import { buildPbaCollegePoolFromSource } from '../../pba/collegeSources';
import { tunePbaDraftProspects } from '../../pba/draftRules';
import { withNbaBackgroundEconomy } from '../../freeAgency/aiFreeAgencyHelpers';
type HistoryEntry = NonNullable<GameState['history']>[number];
type StaffFreeAgent = NonNullable<GameState['staffFreeAgents']>[number];
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
  optionExtensionsCount: number;
  teamOptionExercisedCount: number;
  teamOptionDeclinedCount: number;
}
export function runSeasonRolloverPlayerPass({
  state,
  currentYear,
  nextYear,
  leagueStartYear,
  optionDateStr,
  computeBirdRightsForRollover,
}: SeasonRolloverPlayerPassArgs): SeasonRolloverPlayerPassResult {
  const economyState = withNbaBackgroundEconomy(state);
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
      date: `Jun 30, ${currentYear}`,
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
      ? contractYears.find(cy => cy.season === `${currentYear}-${String(nextYear).slice(-2)}` && (cy.option ?? '').toLowerCase().includes('player'))
      : undefined;
    const guaranteed = Number(entry?.guaranteed ?? 0);
    return guaranteed > 0 ? guaranteed : (p.contract?.amount ?? 0) * 1_000;
  };
  const expiredIds = new Set<string>();
  const externalExpiredIds = new Set<string>();
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
      const targetPot = potEstimator(currentOvr, p.age);
      const blend = p.age <= 22 ? 0.25 : p.age <= 27 ? 0.4 : 0.6;
      const blended = Math.round(priorPot + (targetPot - priorPot) * blend);
      const clampedByStep = Math.max(priorPot - 3, Math.min(priorPot + 3, blended));
      const newPot = Math.min(99, Math.max(currentOvr - 5, clampedByStep));
      if (newPot !== priorPot) {
        const nextRatings = ratingsArr.map((rating, idx) => idx === ratingIndex ? { ...rating, pot: newPot } : rating);
        p = { ...p, ratings: nextRatings } as NBAPlayer;
      }
    }
    if ((p as any).diedYear) return p;
    if (p.tid === -2) return p;
    const externalLeagues = ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];
    if ((p as any).status === 'Retired' || !p.contract || p.tid < 0) {
      return typeof p.age === 'number' ? ({ ...p, age: p.age + 1 } as NBAPlayer) : p;
    }
    if (externalLeagues.includes((p as any).status ?? '') || p.tid >= 100) {
      const bumpedAge = typeof p.age === 'number' ? p.age + 1 : p.age;
      const externalLeagueStatus = (p as any).status ?? '';
      const isMensExternal = externalLeagueStatus !== 'WNBA' && (externalLeagues.includes(externalLeagueStatus) || p.tid >= 100);
      const declareThresholdByLeague: Record<string, number> = {
        Euroleague: 40,
        Endesa: 42,
        'NBL Australia': 45,
        'China CBA': 48,
        'B-League': 52,
        PBA: 55,
        'G-League': 35,
      };
      const declareThreshold = declareThresholdByLeague[externalLeagueStatus] ?? 50;
      if (isMensExternal && typeof bumpedAge === 'number' && bumpedAge === 19 && (p.overallRating ?? 0) >= declareThreshold) {
        return {
          ...p,
          age: bumpedAge,
          tid: -2,
          status: 'Draft Prospect' as const,
          yearsWithTeam: 0,
          twoWay: undefined,
          nonGuaranteed: false,
          gLeagueAssigned: false,
          contract: undefined,
          contractYears: [],
          draft: { ...(p as any).draft, year: nextYear },
        } as any;
      }
      const contractExpired = (p.contract?.exp ?? 0) <= currentYear;
      const isPbaImportDeal = externalLeagueStatus === 'PBA' && ((p as any).isImport || (p as any).importConference || (p as any).pbaImportContract);
      if (contractExpired) {
        if (isPbaImportDeal) {
          return {
            ...p,
            age: bumpedAge,
            tid: -1,
            status: 'Free Agent' as const,
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
          yearsWithTeam: ((p as any).yearsWithTeam ?? 0) + 1,
        } as any;
      }
      return typeof p.age === 'number' ? ({ ...p, age: p.age + 1 } as NBAPlayer) : p;
    }
    const contractExp = p.contract.exp ?? 0;
    const newAge = typeof p.age === 'number' ? p.age + 1 : p.age;
    if ((state.leagueStats as any)?.uiMode === 'pba_isolated' && p.tid >= 0 && p.tid < 100) {
      const nextAmount = syncedContractAmount(p);
      const yearsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
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
      const yearsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
      const hasBirdRights = computeBirdRightsForRollover(p, state.leagueStats, yearsWithTeam);
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
              cy.season === optionSeasonStr && (cy.option ?? '').toLowerCase().includes('player')
                ? { ...cy, option: '' }
                : cy,
            )
          : (p as any).contractYears,
      } as any;
    }
    if (teamOptionDeclinedIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      const isRFA = !!(p as any).contract?.restrictedFA;
      const yearsCompleted = ((p as any).yearsWithTeam ?? 0) + 1;
      return {
        ...p,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        hasBirdRights: computeBirdRightsForRollover(p, state.leagueStats, yearsCompleted),
        midSeasonExtensionDeclined: undefined,
        declinedTeamOptionByTid: p.tid,
        declinedTeamOptionSeasonYear: nextYear,
        declinedTeamOptionSalaryUSD: optionSalaryUSD(p),
        contract: { ...p.contract, hasTeamOption: false, restrictedFA: isRFA, isRestrictedFA: isRFA },
      } as any;
    }
    if (teamOptionExercisedIds.has(p.internalId)) {
      const nextAmount = syncedContractAmount(p);
      const yearsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
      const hasBirdRights = computeBirdRightsForRollover(p, state.leagueStats, yearsWithTeam);
      const supermaxEnabled = state.leagueStats.supermaxEnabled ?? true;
      const supermaxMinYears = (state.leagueStats as any).supermaxMinYears ?? 8;
      const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
      const awards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
      const superMaxEligible = supermaxEnabled && hasBirdRights &&
        isSupermaxAwardQualified(awards, currentYear, yearsOfService, supermaxMinYears);
      const extension = optionExtensions.get(p.internalId);
      if (extension) {
        const keepExistingThrough = p.contract?.exp ?? currentYear;
        const existingThroughCurrent = ((p as any).contractYears ?? []).filter((cy: any) => {
          const year = parseInt(cy.season.split('-')[0], 10) + 1;
          return year <= keepExistingThrough;
        });
        return {
          ...p,
          age: newAge,
          yearsWithTeam,
          hasBirdRights,
          superMaxEligible,
          midSeasonExtensionDeclined: undefined,
          contract: {
            ...p.contract,
            hasTeamOption: false,
            teamOptionExp: undefined,
            exp: extension.newExp,
            ...(nextAmount ? { amount: nextAmount } : {}),
          },
          contractYears: [...existingThroughCurrent, ...extension.contractYears],
        } as any;
      }
      return {
        ...p,
        age: newAge,
        yearsWithTeam,
        hasBirdRights,
        superMaxEligible,
        midSeasonExtensionDeclined: undefined,
        contract: {
          ...p.contract,
          hasTeamOption: false,
          teamOptionExp: undefined,
          ...(nextAmount ? { amount: nextAmount } : {}),
        },
      } as any;
    }
    if (contractExp <= currentYear || playerOptOutIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      const yearsCompleted = ((p as any).yearsWithTeam ?? 0) + 1;
      return {
        ...p,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        hasBirdRights: computeBirdRightsForRollover(p, state.leagueStats, yearsCompleted),
        midSeasonExtensionDeclined: undefined,
        twoWay: undefined,
        playoffEligible: undefined,
        contract: { ...p.contract, hasPlayerOption: false },
      } as any;
    }
    const yearsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
    const hasBirdRights = computeBirdRightsForRollover(p, state.leagueStats, yearsWithTeam);
    const supermaxEnabled = state.leagueStats.supermaxEnabled ?? true;
    const supermaxMinYears = (state.leagueStats as any).supermaxMinYears ?? 8;
    const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    const awards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
    const superMaxEligible = supermaxEnabled && hasBirdRights &&
      isSupermaxAwardQualified(awards, currentYear, yearsOfService, supermaxMinYears);
    const nextAmount = syncedContractAmount(p);
    return {
      ...p,
      age: newAge,
      yearsWithTeam,
      hasBirdRights,
      superMaxEligible,
      midSeasonExtensionDeclined: undefined,
      ...(nextAmount ? { contract: { ...p.contract, amount: nextAmount } } : {}),
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
  const { players: playersAfterExtFA, historyEntries: extFAHistory } = runExternalFreeAgency(
    { ...state, players: updatedPlayers } as any,
    externalExpiredIds,
    currentYear,
  );
  const {
    players: playersAfterExtRetire,
    retirees: extRetirees,
    historyEntries: extRetireHistory,
  } = retireExternalLeaguePlayers(playersAfterExtFA, currentYear, state.date ?? `Jun 30, ${currentYear}`, state);
  const protectedFAMarketPlayerIds = getActiveUserBidMarketPlayerIds(state);
  const { players: playersAfterRetire, newRetirees } = runRetirementChecks(
    playersAfterExtRetire,
    currentYear,
    { protectedPlayerIds: protectedFAMarketPlayerIds },
  );
  const retiredPlayersById = new Map(playersAfterRetire.map(player => [player.internalId, player]));
  const newRetireeStaffCandidates = newRetirees
    .map(record => retiredPlayersById.get(record.playerId))
    .filter((player): player is NBAPlayer => !!player)
    .map(player => buildRetireeStaffCandidate(player, currentYear))
    .filter((candidate): candidate is StaffFreeAgent => !!candidate);
  const staffJoinedByPlayerId = new Map(newRetireeStaffCandidates.map(candidate => [candidate.sourcePlayerId, candidate]));
  const playersAfterStaffRolls = staffJoinedByPlayerId.size > 0
    ? playersAfterRetire.map(player => {
        const candidate = staffJoinedByPlayerId.get(player.internalId);
        return candidate
          ? {
              ...player,
              postCareerStaffJoined: true,
              postCareerStaffRole: candidate.role ?? candidate.position ?? candidate.jobTitle ?? 'Staff',
              postCareerStaffYear: currentYear,
            } as NBAPlayer
          : player;
      })
    : playersAfterRetire;
  const { players: playersWithFarewells, newFarewells } = runFarewellTourChecks(playersAfterStaffRolls, currentYear);
  const hofThreshold = SettingsManager.getSettings().hofWSThreshold ?? 50;
  const nbaHofResult = runHOFChecks(playersWithFarewells, currentYear, hofThreshold);
  const pbaHofResult = state.leagueStats?.uiMode === 'pba_isolated'
    ? runPbaHOFChecks(nbaHofResult.players, currentYear)
    : { players: nbaHofResult.players, newInductees: [] as HOFInduction[] };
  const playersAfterHOF = pbaHofResult.players;
  const newInductees = [...nbaHofResult.newInductees, ...pbaHofResult.newInductees];
  const { teams: teamsAfterJerseyRetirements, newRetirements: newJerseyRetirements } =
    runJerseyRetirementChecks(playersAfterHOF, state.teams, currentYear, { leagueStartYear });
  const deaths: MortalityRecord[] = [];
  const portraitMode = state.leagueType === 'fictional' ? 'facesjs_only' : 'regen_pack';
  const pbaCollegePool = state.leagueStats?.uiMode === 'pba_isolated'
    ? buildPbaCollegePoolFromSource(playersAfterHOF)
    : undefined;
  const fillResult = ensureDraftClasses(
    playersAfterHOF,
    nextYear,
    state.leagueStats.draftEligibilityRule,
    portraitMode,
    pbaCollegePool
      ? {
          collegePool: pbaCollegePool,
          nationalityOverride: 'Philippines',
          forceCollegePath: true,
        }
      : undefined,
  );
  const playersWithYouth = fillResult.additions.length > 0
    ? [...playersAfterHOF, ...fillResult.additions]
    : playersAfterHOF;
  const tunedPlayersWithYouth = state.leagueStats?.uiMode === 'pba_isolated'
    ? tunePbaDraftProspects(playersWithYouth as any, nextYear, state.leagueStats)
    : playersWithYouth;
  const { additions: extRepopPlayers } = repopulateExternalLeagues(
    { ...state, players: tunedPlayersWithYouth } as any,
    extRetirees,
    currentYear,
    nextYear,
  );
  const postRepopPlayers = extRepopPlayers.length > 0
    ? [...tunedPlayersWithYouth, ...extRepopPlayers]
    : tunedPlayersWithYouth;
  const { additions: safetyPlayers } = enforceExternalMinRoster(
    { ...state, players: postRepopPlayers } as any,
    nextYear,
  );
  const playersFinalized = safetyPlayers.length > 0
    ? [...postRepopPlayers, ...safetyPlayers]
    : postRepopPlayers;
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
    extRetireHistory,
    extFAHistory,
    newRetirees,
    newRetireeStaffCandidates,
    newFarewells,
    newInductees,
    newJerseyRetirements,
    deaths,
    optionExtensionsCount: optionExtensions.size,
    teamOptionExercisedCount: teamOptionExercisedIds.size,
    teamOptionDeclinedCount: teamOptionDeclinedIds.size,
  };
}
