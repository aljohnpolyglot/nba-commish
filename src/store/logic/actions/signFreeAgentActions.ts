import { GameState, UserAction } from '../../../types';
import { EXTERNAL_LEAGUE_STATUSES, EXTERNAL_MENS_LEAGUE_STATUSES, formatExternalSalary } from '../../../constants';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { generateFreeAgentSigningReactions } from '../../../services/llm/services/freeAgentService';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { buildShamsSigningPost } from '../../../services/social/templates/charania';
import { getInsiderHandle } from '../../../data/social/handles';
import { NewsGenerator } from '../../../services/news/NewsGenerator';
import { SettingsManager } from '../../../services/SettingsManager';
import { normalizeTeamJerseyNumbers } from '../../../utils/jerseyUtils';
import {
    buildStretchedSchedule,
    consumeBiannualException,
    contractToUSD,
    formatContractTotalUSD,
    getBiannualExceptionAvailability,
    getCapThresholds,
    getContractLimits,
    getMLEAvailability,
    getTeamHardCapUSD,
    getTeamPayrollUSD,
    hasBirdRights,
    recordTeamCapSpaceUse,
    seasonLabelToYear,
} from '../../../utils/salaryUtils';
import { computeTradeEligibleDate } from '../../../utils/signingMoratorium';
import { isInPreFreeAgencyBlackout, parseGameDate } from '../../../utils/dateUtils';
import { clearWaiverMarkers } from '../../../utils/contractCleanup';
import { isTwoWayContract } from '../../../utils/contractTypes';
import { appendPlayerTransaction } from '../../../utils/playerBirdRights';
import { mergePlayerSalaries } from '../../../utils/playerCareerMerge';
import { getTeamFullName } from '../../../utils/teamNames';
import { getTwoWayRosterLimit } from '../../../utils/rosterLimits';
import { isTwitterAvailable } from '../../../utils/mediaTimeline';
import {
    buildPbaImportContractMetadata,
    canSignInCurrentPbaWindow,
    clampPbaImportOfferSalary,
    getActiveImport,
    getEffectivePbaConference,
    getPbaImportContractLabel,
    isPbaImportForTeam,
} from '../../../services/pba/importManager';
import { tunePbaDraftProspects } from '../../../services/pba/draftRules';
import { postClubTransaction } from '../../../services/tycoon/clubFinance';
import { isEuroFreeAgentAvailable } from '../../../services/euro/historicalNbaMarket';
import { getEuroSeniorRosterSigningGate } from '../../../services/freeAgency/euroRosterSigningGate';
import { PBA_PLAYER_ECONOMY_VERSION } from '../../../services/pba/historicalEconomy';
import {
    consumeSponsorSigningPerk,
    getAvailableSigningSponsorPerks,
} from '../../../services/tycoon/sponsorPerkEngine';
import type { SponsorSigningPerkGrant } from '../../../types/tycoon';
import {
    areWnbaDevelopmentalContractsEnabled,
    getWnbaDevelopmentalBaseStipendUSD,
    isWnbaDevelopmentalServiceEligible,
} from '../../../services/wnba/developmentalContracts';
import { getNbaYearsOfService } from '../../../utils/playerExperience';
import { canNbaTeamSignEurostashPlayer, getEurostashRightsTid } from '../../../services/freeAgency/eurostashRights';
import {
    buildAspireInvestigationEmail,
    forfeitTeamDraftPicks,
    getAspireBrands,
    getAspirePenaltyPickCount,
    getAspireRisk,
    getAspireRoll,
    isAspireSigningEligible,
    type AspireSideDeal,
} from '../../../services/aspireSideDeals';
import { buildManualSigningConfirmation } from '../../../services/freeAgency/freeAgencyDailySummary';
import { getCentralFreeAgencyDays } from '../../../services/freeAgency/freeAgencyDecisionTiming';
import { isUnavailableInternationalTournamentPlayer } from '../../../utils/prospectUtils';

const PLAYER_EXTERNAL_LEAGUES: readonly string[] = EXTERNAL_MENS_LEAGUE_STATUSES;
const TARGET_EXTERNAL_LEAGUES: readonly string[] = EXTERNAL_LEAGUE_STATUSES;

function isLeagueLabel(value: string | undefined | null, labels: readonly string[]): boolean {
    return labels.includes(String(value ?? ''));
}

function debitTycoonCashForTeam<T extends any>(
    teams: T[] | undefined,
    teamId: number,
    amount: number,
    input: { sourceId: string; date: string; season: number; label: string; category: 'transfer' | 'wages'; playerId?: string },
): { teams: T[] | undefined; changed: boolean } {
    if (!Array.isArray(teams) || amount <= 0) return { teams, changed: false };
    let changed = false;
    const next = teams.map((team: any) => {
        const id = Number(team?.id ?? team?.tid);
        if (id !== teamId || !team?.tycoon) return team;
        changed = true;
        const tycoon = { ...team.tycoon, transactions: [...(team.tycoon.transactions ?? [])] };
        postClubTransaction(tycoon, {
            ...input,
            amountEUR: -amount,
        });
        return {
            ...team,
            tycoon,
        };
    });
    return { teams: changed ? next : teams, changed };
}

function consumeSigningPerkForTeam<T extends any>(
    teams: T[] | undefined,
    teamId: number,
    request: SponsorSigningPerkGrant | undefined,
    season: number,
    annualSalaryEUR: number,
): { teams: T[] | undefined; grant?: SponsorSigningPerkGrant } {
    if (!Array.isArray(teams) || !request) return { teams };
    let grant: SponsorSigningPerkGrant | undefined;
    const next = teams.map((team: any) => {
        if (grant || Number(team?.id ?? team?.tid) !== teamId || !team?.tycoon) return team;
        const tycoon = {
            ...team.tycoon,
            sponsorPerkUsage: [...(team.tycoon.sponsorPerkUsage ?? [])].map((usage: any) => ({ ...usage })),
        };
        grant = consumeSponsorSigningPerk(
            tycoon,
            season,
            request.sponsor,
            request.perkId,
            'player',
            annualSalaryEUR,
        );
        return grant ? { ...team, tycoon } : team;
    });
    return { teams: grant ? next : teams, grant };
}

function getPriorNbaTid(player: any): number {
    const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = player?.stats ?? [];
    const sorted = stats
        .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
        .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
    return sorted[0]?.tid ?? -1;
}

function normalizePersonnelKey(value: string | undefined | null): string {
    return String(value ?? '').trim().toLowerCase();
}

function teamOrganizationKeys(team: any): string[] {
    const region = String(team?.region ?? '').trim();
    const name = String(team?.name ?? '').trim();
    const fullName = String(getTeamFullName(team) ?? '').trim();
    return [
        name,
        fullName,
        region && name ? `${region} ${name}` : '',
        team?.abbrev,
        team?.teamName,
    ]
        .map(v => normalizePersonnelKey(v))
        .filter(Boolean);
}

export const handleSignFreeAgent = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const {
        playerId,
        teamId,
        playerName,
        teamName,
        salary,
        years: negotiatedYears,
        option,
        twoWay: signedAsTwoWay,
        nonGuaranteed: signedAsNG,
        mleType: signedMleType,
        useBiannualException: requestedBae,
        teamBuyoutContribUSD,
        signingBonusEUR,
        sponsorSigningPerk: requestedSponsorSigningPerk,
        aspireSideDeal: requestedAspireSideDeal,
        rosterComplianceAutoFill,
        automatedNativeSigning,
    } = action.payload;
    const nativeOnlySigning = rosterComplianceAutoFill === true || automatedNativeSigning === true;
    const player = stateWithSim.players.find(p => p.internalId === playerId);
    const team = stateWithSim.teams.find(t => t.id === teamId)
        ?? ((stateWithSim as any).nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === teamId);
    
    if (!nativeOnlySigning) {
        console.log('[handleSignFreeAgent] entry', {
            playerId, teamId, playerName, teamName,
            foundPlayer: !!player, foundTeam: !!team,
            playerTid: player?.tid, playerStatus: player?.status,
            uiMode: stateWithSim.leagueStats?.uiMode,
            gameMode: stateWithSim.gameMode,
            userTeamId: (stateWithSim as any).userTeamId,
        });
    }
    if (!player || !team) {
        console.warn('[handleSignFreeAgent] aborting — player or team not found');
        return { isProcessing: false };
    }

    const isEuroMode = stateWithSim.leagueStats?.uiMode === 'euro_isolated';
    const isPbaMode = stateWithSim.leagueStats?.uiMode === 'pba_isolated';
    const isResignAction = player.tid === teamId;
    if (isEuroMode && !isResignAction && !isEuroFreeAgentAvailable(stateWithSim, player)) {
        console.warn(`[SIGN_FREE_AGENT] Blocked attached Euro player: ${player.name} (${player.tid}/${player.status})`);
        return { isProcessing: false };
    }
    if (isUnavailableInternationalTournamentPlayer(player)) {
        console.warn(`[SIGN_FREE_AGENT] Blocked tournament-only player: ${player.name}`);
        return { isProcessing: false };
    }
    if (isEuroMode && !isResignAction) {
        const euroRoster = getEuroSeniorRosterSigningGate(stateWithSim.players, teamId, stateWithSim.leagueStats);
        if (euroRoster.full) {
            console.warn(`[SIGN_FREE_AGENT] Blocked full Euro senior roster: ${player.name} to ${team.name} (${euroRoster.standardCount}/${euroRoster.maxStandard})`);
            return {
                isProcessing: false,
                lastOutcome: `Roster full (${euroRoster.standardCount}/${euroRoster.maxStandard}). Waive or transfer a senior player before signing ${player.name}.`,
            };
        }
    }
    const leagueYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    let aspireSideDeal: AspireSideDeal | undefined;
    if (requestedAspireSideDeal && isAspireSigningEligible(stateWithSim, teamId)) {
        const amountUSD = Math.max(0, Math.round(Number(requestedAspireSideDeal.amountUSD ?? 0) / 50_000) * 50_000);
        const sponsor = String(requestedAspireSideDeal.sponsor ?? '');
        const validSponsor = getAspireBrands(leagueYear).some(brand => brand.name === sponsor);
        if (!validSponsor || amountUSD <= 0 || amountUSD > Number(stateWithSim.stats?.personalWealth ?? 0) * 1_000_000) {
            return { isProcessing: false, lastOutcome: 'The ASPIRE agreement could not be funded.' };
        }
        aspireSideDeal = {
            sponsor,
            amountUSD,
            risk: getAspireRisk(amountUSD, Math.max(Number(salary ?? 0), Number(requestedAspireSideDeal.riskBasisUSD ?? 0))),
            roll: getAspireRoll(stateWithSim, playerId, sponsor, amountUSD),
            riskBasisUSD: Math.max(Number(salary ?? 0), Number(requestedAspireSideDeal.riskBasisUSD ?? 0)),
        };
        action.payload.aspireSideDeal = aspireSideDeal;
    } else {
        action.payload.aspireSideDeal = undefined;
    }
    const isNativeNbaSigning = stateWithSim.leagueStats?.uiMode === 'nba'
        && stateWithSim.teams.some(candidate => candidate.id === teamId);
    const nbaTeamIds = new Set(stateWithSim.teams.map(candidate => Number(candidate.id)));
    if (isNativeNbaSigning && !canNbaTeamSignEurostashPlayer(
        player,
        teamId,
        nbaTeamIds,
    )) {
        const rightsTid = getEurostashRightsTid(player, nbaTeamIds);
        const rightsTeam = stateWithSim.teams.find(candidate => candidate.id === rightsTid);
        console.warn(`[SIGN_FREE_AGENT] Blocked Eurostash player without draft rights: ${player.name} to ${team.name}`);
        return {
            isProcessing: false,
            lastOutcome: `${player.name} remains under ${rightsTeam ? getTeamFullName(rightsTeam) : 'the drafting team'}'s NBA draft rights.`,
        };
    }
    const existingNbaRookieSeason = Number(player.nbaRookieSeason);
    const nbaRookieSeason = isNativeNbaSigning && getNbaYearsOfService(player, leagueYear) === 0
        ? (Number.isFinite(existingNbaRookieSeason) && existingNbaRookieSeason > 0 ? existingNbaRookieSeason : leagueYear)
        : (Number.isFinite(existingNbaRookieSeason) && existingNbaRookieSeason > 0 ? existingNbaRookieSeason : undefined);
    let baseSalaryUSD = typeof salary === 'number' && salary > 0 ? salary : 1_300_000;
    const pbaTunedSigningPlayer = isPbaMode
        ? tunePbaDraftProspects(stateWithSim.players as any, leagueYear, stateWithSim.leagueStats).find(p => p.internalId === playerId)
        : undefined;
    const applyPbaSigningTune = (p: any) => pbaTunedSigningPlayer && p.internalId === playerId
        ? {
            ...p,
            pos: pbaTunedSigningPlayer.pos,
            overallRating: pbaTunedSigningPlayer.overallRating,
            potential: pbaTunedSigningPlayer.potential,
            ratings: pbaTunedSigningPlayer.ratings,
            ovrHistory: (pbaTunedSigningPlayer as any).ovrHistory ?? (p as any).ovrHistory,
            ovrTimeline: (pbaTunedSigningPlayer as any).ovrTimeline ?? (p as any).ovrTimeline,
            pbaDraftTunedVersion: (pbaTunedSigningPlayer as any).pbaDraftTunedVersion ?? (p as any).pbaDraftTunedVersion,
        }
        : p;
    const playerForSigning = pbaTunedSigningPlayer ?? player;
    const isPbaTeam = isPbaMode && String((team as any).league ?? '') === 'PBA';
    const targetExternalLeague = isLeagueLabel((team as any).league, TARGET_EXTERNAL_LEAGUES)
        ? String((team as any).league)
        : null;
    const signedPlayerStatus = isPbaTeam
        ? 'PBA'
        : stateWithSim.leagueStats?.uiMode === 'wnba_isolated'
            ? 'WNBA'
            : targetExternalLeague ?? 'Active';
    const teamBuyoutContributionUSD = isEuroMode && targetExternalLeague
        ? Math.max(0, Math.round(Number(teamBuyoutContribUSD ?? 0)))
        : 0;
    const playerSigningBonusEUR = isEuroMode && targetExternalLeague
        ? Math.max(0, Math.round(Number(signingBonusEUR ?? 0) / 5_000) * 5_000)
        : 0;
    let sponsorSigningPerk: SponsorSigningPerkGrant | undefined;
    const pbaConference = getEffectivePbaConference(stateWithSim.leagueStats as any);
    const effectiveMleType = !isEuroMode && !isPbaMode ? signedMleType : null;
    const effectiveBae = !isEuroMode && !isPbaMode && requestedBae === true;
    const maxTwoWay = getTwoWayRosterLimit(stateWithSim.leagueStats as any);
    const twoWayContractsActive = !isEuroMode && !isPbaMode && maxTwoWay > 0;
    const signedAsDevelopmental = !!signedAsTwoWay
        && areWnbaDevelopmentalContractsEnabled(stateWithSim.leagueStats);
    const isActiveTwoWay = (p: any) => twoWayContractsActive && isTwoWayContract(p, stateWithSim.leagueStats);
    if (signedAsTwoWay) {
        const twoWayCount = stateWithSim.players.filter((p: any) => p.tid === teamId && isActiveTwoWay(p)).length;
        if (!twoWayContractsActive || twoWayCount >= maxTwoWay) {
            console.warn(`[SIGN_FREE_AGENT] Blocked two-way signing while two-way contracts are unavailable/full: ${player.name} to ${team.name}`);
            return { isProcessing: false };
        }
        if (signedAsDevelopmental && !isWnbaDevelopmentalServiceEligible(playerForSigning as any, leagueYear, stateWithSim.leagueStats)) {
            console.warn(`[SIGN_FREE_AGENT] Blocked developmental signing for ineligible service time: ${player.name}`);
            return { isProcessing: false };
        }
        if (signedAsDevelopmental) {
            baseSalaryUSD = getWnbaDevelopmentalBaseStipendUSD(stateWithSim.leagueStats);
        }
    }
    if (signedAsNG && stateWithSim.leagueStats?.nonGuaranteedContractsEnabled === false) {
        console.warn(`[SIGN_FREE_AGENT] Blocked non-guaranteed signing while non-guaranteed contracts are disabled: ${player.name} to ${team.name}`);
        return { isProcessing: false };
    }
    const isPbaImportSigning = isPbaTeam && isPbaImportForTeam(playerForSigning as any, teamId, pbaConference, stateWithSim.leagueStats as any);
    const activePbaImport = isPbaImportSigning
        ? getActiveImport(stateWithSim.players as any, teamId)
        : undefined;
    const replacedPbaImport = activePbaImport?.internalId === playerId ? undefined : activePbaImport;
    const pbaImportReplacementCount = replacedPbaImport
        ? Number((replacedPbaImport as any).pbaImportContract?.replacementsUsed ?? 0) + 1
        : 0;
    if (isPbaTeam) {
        const pbaGate = canSignInCurrentPbaWindow(playerForSigning as any, teamId, stateWithSim as any);
        if (!pbaGate.allowed) {
            console.warn(`[SIGN_FREE_AGENT] Blocked PBA signing: ${pbaGate.reason}`);
            return { isProcessing: false };
        }
        if (isPbaImportSigning) {
            baseSalaryUSD = clampPbaImportOfferSalary(
                typeof salary === 'number' ? salary : 0,
                playerForSigning as any,
                stateWithSim.leagueStats as any,
                pbaConference,
            );
        }
    }
    if (!isPbaMode && stateWithSim.gameMode === 'gm' && player.tid === -1 && player.status === 'Free Agent' && stateWithSim.date) {
        const currentDate = parseGameDate(stateWithSim.date);
        const seasonYear = stateWithSim.leagueStats.year ?? currentDate.getUTCFullYear();
        const inPreFABlackout = isInPreFreeAgencyBlackout(
            currentDate,
            seasonYear,
            stateWithSim.leagueStats as any,
            stateWithSim.schedule as any,
        );
        if (inPreFABlackout) {
            console.warn(`[SIGN_FREE_AGENT] Blocked pre-FA offer: ${player.name} to ${team.name}`);
            return { isProcessing: false };
        }
    }
    const priorNbaTid = getPriorNbaTid(playerForSigning as any);
    const ownTeamBirdRights = stateWithSim.leagueStats?.birdRightsEnabled !== false && (isResignAction || priorNbaTid === teamId) && hasBirdRights(playerForSigning as any);
    const signedAsGuaranteed = !signedAsTwoWay && !signedAsNG;
    const thresholds = getCapThresholds(stateWithSim.leagueStats as any);
    const teamPayroll = getTeamPayrollUSD(stateWithSim.players as any, teamId, team as any, leagueYear, stateWithSim.leagueStats as any);
    const contractLimits = getContractLimits(playerForSigning as any, stateWithSim.leagueStats as any);
    if (!signedAsTwoWay && !isPbaImportSigning) {
        baseSalaryUSD = Math.min(
            contractLimits.maxSalaryUSD,
            Math.max(contractLimits.minSalaryUSD, baseSalaryUSD),
        );
    }
    if (isEuroMode && team.tycoon && requestedSponsorSigningPerk) {
        const choice = getAvailableSigningSponsorPerks(team.tycoon, leagueYear, 'player', baseSalaryUSD)
            .find(entry => (
                entry.sponsor === requestedSponsorSigningPerk.sponsor
                && entry.perk.id === requestedSponsorSigningPerk.perkId
            ));
        if (choice) {
            sponsorSigningPerk = {
                sponsor: choice.sponsor,
                perkId: choice.perk.id,
                label: choice.perk.label,
                season: leagueYear,
                equivalentAnnualValueEUR: choice.equivalentAnnualValueEUR,
            };
        }
    }
    const maxYears = ownTeamBirdRights
        ? (stateWithSim.leagueStats?.maxContractLengthBird ?? stateWithSim.leagueStats?.maxContractLengthStandard ?? 5)
        : (stateWithSim.leagueStats?.maxContractLengthStandard ?? 5);
    const minYears = stateWithSim.leagueStats?.minContractLength ?? 1;
    const requestedYears = typeof negotiatedYears === 'number' && negotiatedYears > 0 ? negotiatedYears : 1;
    const totalYears = isPbaImportSigning || signedAsDevelopmental
        ? 1
        : Math.max(minYears, Math.min(maxYears, Math.floor(requestedYears)));
    const finalOption = isPbaImportSigning || signedAsDevelopmental || (option === 'PLAYER' && stateWithSim.leagueStats?.playerOptionsEnabled === false)
        ? 'NONE'
        : option;
    const hasOption = finalOption === 'PLAYER' || finalOption === 'TEAM';
    const totalSeasons = hasOption ? totalYears + 1 : totalYears;
    // Re-sign deals start NEXT season — comparing year-1 of the new contract
    // against current-year payroll counts $$ already on expiring books, which
    // silently blocks legitimate signings (e.g., Kennard re-sign blocked even
    // though his old $11M and other expirings roll off before the new deal hits).
    const newDealStartYear = isResignAction ? leagueYear + 1 : leagueYear;
    const committedAtStartYear = stateWithSim.players
        .filter((p: any) =>
            p.tid === teamId &&
            !isActiveTwoWay(p) &&
            (p.contract?.exp ?? newDealStartYear) >= newDealStartYear &&
            !(isResignAction && p.internalId === playerId)
        )
        .reduce((sum: number, p: any) => sum + contractToUSD(p.contract?.amount || 0), 0);
    const projectedPayroll = committedAtStartYear + baseSalaryUSD;
    const mle = getMLEAvailability(teamId, teamPayroll, baseSalaryUSD, thresholds, stateWithSim.leagueStats as any);
    const hasRequestedValidMLE = !!effectiveMleType && !mle.blocked && effectiveMleType === mle.type && baseSalaryUSD <= mle.available;
    const bae = getBiannualExceptionAvailability({
        teamId,
        payrollUSD: teamPayroll,
        signingUSD: baseSalaryUSD,
        contractSeasons: totalSeasons,
        acquisitionType: 'signing',
        season: leagueYear,
        currentDate: stateWithSim.date,
        schedule: stateWithSim.schedule,
        thresholds,
        leagueStats: stateWithSim.leagueStats,
    });
    const hasRequestedValidBae = effectiveBae && !bae.blocked;
    if (effectiveBae && effectiveMleType) {
        console.warn('[SIGN_FREE_AGENT] Blocked contract assigned to both the MLE and BAE.');
        return { isProcessing: false };
    }
    if (effectiveBae && isResignAction) {
        console.warn('[SIGN_FREE_AGENT] Blocked BAE use on an extension/re-sign transaction.');
        return { isProcessing: false };
    }
    if (effectiveBae && bae.blocked) {
        console.warn(`[SIGN_FREE_AGENT] Blocked invalid BAE use: ${bae.reason}`);
        return { isProcessing: false };
    }
    // Defense-in-depth: client claimed an MLE tier but salary exceeds that tier.
    // The Khris Middleton case — modal auto-stamped non_taxpayer MLE on a $33.3M
    // signing because contract was guaranteed; this gate refuses the signing
    // server-side regardless of the client claim.
    if (effectiveMleType && (mle.blocked || baseSalaryUSD > mle.available)) {
        console.warn(`[SIGN_FREE_AGENT] Blocked: claimed ${signedMleType} MLE but salary $${(baseSalaryUSD/1e6).toFixed(1)}M exceeds available $${(mle.available/1e6).toFixed(1)}M`);
        return { isProcessing: false };
    }
    // NBA Minimum Player Salary Exception (CBA Article VII §6): any team can
    // sign a player at the league min regardless of cap status. Without this
    // gate, an over-cap team with a depleted roster couldn't even sign a min
    // body to fill an open slot — physically impossible in real NBA.
    const minSalaryUSD = contractLimits.minSalaryUSD;
    const isMinContract = baseSalaryUSD <= minSalaryUSD * 1.05;
    const hardCapUSD = getTeamHardCapUSD(
        stateWithSim.leagueStats,
        thresholds,
        teamId,
        leagueYear,
    );
    if (!isResignAction && projectedPayroll > hardCapUSD) {
        console.warn(`[SIGN_FREE_AGENT] Blocked signing above the team's hard cap: ${player.name} to ${team.name}`);
        return { isProcessing: false };
    }
    if (!isEuroMode && !isPbaMode && signedAsGuaranteed && !ownTeamBirdRights && projectedPayroll > thresholds.salaryCap && !hasRequestedValidMLE && !hasRequestedValidBae && !isMinContract) {
        console.warn(`[SIGN_FREE_AGENT] Blocked illegal over-cap signing: ${player.name} to ${team.name}`);
        return { isProcessing: false };
    }

    if (playerForSigning.status !== 'Active' && playerForSigning.status !== 'Free Agent' && !isLeagueLabel(playerForSigning.status, PLAYER_EXTERNAL_LEAGUES)) {
        return { isProcessing: false };
    } else {
        const gmPlayer = player as any;
        const previousTeamId = gmPlayer?.transactions && gmPlayer.transactions.length > 0 
            ? gmPlayer.transactions[gmPlayer.transactions.length - 1].tid 
            : null;
        const previousTeam = previousTeamId ? stateWithSim.teams.find(t => t.id === previousTeamId) : null;
        const previousTeamName = previousTeam ? previousTeam.name : null;
        // Map player status to meaningful league label for the LLM prompt
        const statusToLeague: Record<string, string> = {
            'Euroleague': 'Euroleague',
            'PBA': 'PBA (Philippine Basketball Association)',
            'B-League': 'Japan B.League',
            'WNBA': 'WNBA',
            'G-League': 'NBA G League',
            'Endesa': 'Liga ACB (Spain)',
            'Free Agent': previousTeamName ? 'NBA (previously unsigned)' : 'Free Agency',
            'Active': previousTeamName ? 'NBA' : 'Free Agency',
        };
        const previousLeague = statusToLeague[player?.status || ''] ?? player?.status ?? null;

        const reactions = nativeOnlySigning
            ? { newEmails: [], newNews: [], newSocialPosts: [] }
            : await generateFreeAgentSigningReactions(player as any, team as any, previousTeamName, previousLeague, stateWithSim);

        const outcome = nativeOnlySigning
            ? { revenue: 0, viewership: 0 }
            : calculateOutcome('SIGN_FREE_AGENT', { playerId: player?.internalId }, stateWithSim);
        
        const newEmails = (reactions.newEmails || []).map((e: any, i: number) => ({
            ...e,
            id: `react-email-${Date.now()}-${i}`,
            read: false,
            replied: false,
            date: stateWithSim.date,
        }));

        const newNews = (reactions.newNews || []).map((n: any, i: number) => ({
            ...n,
            id: `react-news-${Date.now()}-${i}`,
            date: stateWithSim.date,
        }));

        const newSocial = (reactions.newSocialPosts || []).map((s: any, i: number) => {
            const engagement = calculateSocialEngagement(s.handle, s.content, player?.overallRating);
            return {
                ...s,
                id: `react-social-${Date.now()}-${i}`,
                date: stateWithSim.date,
                likes: engagement.likes,
                retweets: engagement.retweets,
                isNew: true
            };
        });

        // Auto Charania post — only when LLM is off (LLM generates its own Shams post)
        const llmEnabled = nativeOnlySigning ? false : SettingsManager.getSettings().enableLLM;
        const shamsContent = !nativeOnlySigning && !llmEnabled && !isPbaImportSigning ? buildShamsSigningPost(
            player.name,
            team.name,
            team.abbrev,
            player.overallRating ?? 60,
            previousTeamName,
            previousLeague,
            Math.round(baseSalaryUSD / 1_000),
            stateWithSim.leagueStats?.uiMode === 'pba_isolated' ? 'pba' : 'nba',
        ) : null;
        if (shamsContent && isTwitterAvailable(stateWithSim.date, stateWithSim.leagueStats?.year)) {
            const insider = getInsiderHandle(stateWithSim.leagueType, stateWithSim.date, stateWithSim.leagueStats?.year, stateWithSim.leagueStats?.uiMode);
            const shamsEngagement = calculateSocialEngagement(insider.atHandle, shamsContent, player?.overallRating);
            newSocial.unshift({
                id: `insider-sign-${Date.now()}`,
                author: insider.name,
                handle: insider.atHandle,
                content: shamsContent,
                date: stateWithSim.date,
                likes: shamsEngagement.likes,
                retweets: shamsEngagement.retweets,
                playerPortraitUrl: player.imgURL,
                source: 'TwitterX',
                isNew: true,
            } as any);
        }

        // Contract terms — honor negotiated salary/years when provided,
        // otherwise fall back to min contract.
        const existingPlayerForMerge: any = stateWithSim.players.find(p => p.internalId === playerId);
        // Re-signs (player already on this team) start next season; fresh FA signings start current season.
        const signYear = isResignAction ? leagueYear + 1 : leagueYear;
        // BBGM stores contract.amount in thousands of USD; also use the final guaranteed year as exp.
        const newDealAmountThousands = Math.round(baseSalaryUSD / 1_000);
        const expYear = signYear + totalSeasons - 1;
        // Re-signs start NEXT season — keep the existing current-season salary in
        // contract.amount so trade engines (CBA matching, TV) don't price the
        // player off a deal he isn't earning yet. Falls through to the new amount
        // when the player has no live current-year salary (offseason FA-status
        // re-sign, fresh signing, etc.).
        const existingAmountThousands = Number(existingPlayerForMerge?.contract?.amount) || 0;
        const contractAmountThousands = isResignAction && existingAmountThousands > 0
            ? existingAmountThousands
            : newDealAmountThousands;
        const negotiatedContractYears = Array.from({ length: totalSeasons }).map((_, i) => {
            const seasonYear = signYear + i;
            const escalated = Math.round(baseSalaryUSD * Math.pow(1.05, i));
            const isOptionYear = hasOption && i === totalSeasons - 1;
            return {
                season: `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
                // NG contracts have zero guaranteed money — waiving them costs nothing.
                guaranteed: signedAsNG ? 0 : escalated,
                option: signedAsDevelopmental ? 'developmental' : signedAsTwoWay ? 'twoWay' : isOptionYear ? (finalOption === 'PLAYER' ? 'player' : 'team') : '',
                ...(i === 0 && playerSigningBonusEUR > 0 ? { signingBonusEUR: playerSigningBonusEUR } : {}),
                ...(i === 0 && sponsorSigningPerk ? { sponsorSigningPerk } : {}),
                ...(isPbaImportSigning ? { type: 'pba_import', conference: pbaConference } : {}),
                ...(isPbaImportSigning ? { teamId } : {}),
            };
        });
        // Preserve historical (past + prior in-flight) contractYears entries so
        // PlayerBioContractTab keeps showing the player's existing salary history
        // after a re-sign. Filter out any entries for seasons the new deal covers
        // so the new terms win.
        const priorContractYears: Array<{ season: string; guaranteed: number; option?: string }> =
          Array.isArray(existingPlayerForMerge?.contractYears) ? existingPlayerForMerge.contractYears : [];
        const newSeasonSet = new Set(negotiatedContractYears.map(cy => cy.season));
        const historicalContractYears = priorContractYears.filter((cy: any) => {
            if (!isResignAction && !isPbaImportSigning && seasonLabelToYear(cy.season) >= signYear) return false;
            if (!newSeasonSet.has(cy.season)) return true;
            if (!isPbaImportSigning) return false;
            return !(
                cy.type === 'pba_import'
                && cy.conference === pbaConference
                && Number(cy.teamId ?? teamId) === teamId
            );
        });
        const mergedContractYears = [
            ...historicalContractYears,
            ...negotiatedContractYears,
        ].sort((a, b) => a.season.localeCompare(b.season));
        const negotiatedSalaryStints = negotiatedContractYears.map((cy: any) => ({
            season: seasonLabelToYear(cy.season),
            amount: Math.round((Number(cy.guaranteed) > 0 ? Number(cy.guaranteed) : baseSalaryUSD) / 1_000),
            tid: teamId,
            teamAbbrev: String((team as any).abbrev ?? '').trim() || undefined,
            league: isPbaTeam ? 'PBA' : targetExternalLeague,
            option: cy.option || undefined,
            ...(isPbaImportSigning ? { conference: pbaConference, type: 'pba_import' } : {}),
        }));
        const priorSalaryStints = Array.isArray(existingPlayerForMerge?.salaries)
            ? existingPlayerForMerge.salaries.filter((row: any) => (
                isResignAction
                || isPbaImportSigning
                || Number(row?.season) < signYear
            ))
            : existingPlayerForMerge?.salaries;

        const returnContext = previousLeague && isLeagueLabel(previousLeague, PLAYER_EXTERNAL_LEAGUES)
            ? targetExternalLeague
                ? ` ${playerName} was playing in the ${previousLeague}.`
                : ` ${playerName} is returning to the NBA after playing in the ${previousLeague}.`
            : previousTeamName
                ? ` ${playerName} was previously with the ${previousTeamName}.`
                : '';

        // Match AI signing/re-signing template so the transaction log + news
        // get full contract details (salary, years, option, contract type).
        const optTag = finalOption === 'PLAYER' ? ' (player option)' : finalOption === 'TEAM' ? ' (team option)' : '';
        const twoWayTag = signedAsDevelopmental ? ' (developmental)' : signedAsTwoWay ? ' (two-way)' : '';
        const ngTag = signedAsNG ? ' (non-guaranteed)' : '';
        const mleTag = effectiveMleType && !signedAsTwoWay && !signedAsNG
            ? (effectiveMleType === 'taxpayer' ? ' (taxpayer MLE)' : effectiveMleType === 'room' ? ' (room MLE)' : ' (MLE)')
            : '';
        const baeTag = effectiveBae && !signedAsTwoWay && !signedAsNG ? ' (bi-annual exception)' : '';
        const signingBonusTag = playerSigningBonusEUR > 0
            ? ` + ${formatExternalSalary(playerSigningBonusEUR, targetExternalLeague ?? 'Euroleague')} signing bonus`
            : '';
        const formattedDealAmount = isPbaImportSigning
            ? formatExternalSalary(baseSalaryUSD, 'PBA')
            : targetExternalLeague
                ? formatExternalSalary(baseSalaryUSD, targetExternalLeague)
                : formatContractTotalUSD(baseSalaryUSD, totalYears);
        const pbaConferenceDisplay = pbaConference === 'commissioners'
            ? "Commissioner's Cup"
            : pbaConference === 'governors'
                ? "Governors' Cup"
                : 'Philippine Cup';
        const contractDetails = isPbaImportSigning
            ? `: ${formattedDealAmount} ${getPbaImportContractLabel(pbaConference)}`
            : `: ${formattedDealAmount}/${totalYears}yr${optTag}${twoWayTag}${ngTag}${mleTag}${baeTag}${signingBonusTag}`;
        const treatAsResignText = isResignAction && !effectiveMleType;
        const signingOutcomeText = isPbaImportSigning
            ? `${playerName} signed as ${teamName} import for the ${leagueYear} ${pbaConferenceDisplay}: ${formattedDealAmount}`
            : treatAsResignText
                ? `${playerName} re-signs with ${teamName}${contractDetails}`
                : `${playerName} signs with the ${teamName}${contractDetails}`;

        const signingInsider = getInsiderHandle(stateWithSim.leagueType, stateWithSim.date, stateWithSim.leagueStats?.year, stateWithSim.leagueStats?.uiMode);
        const signingSeed = `BREAKING SIGNING: The ${teamName} have signed ${playerName}.${returnContext} ` +
            `REQUIRED: ${signingInsider.atHandle} MUST break this in a detailed tweet — name the team, the player, any context (returning from abroad, veteran presence, etc.), and what he brings. ` +
            `Then generate 3-4 varied fan and analyst reactions. ` +
            `Do NOT write two identical insider tweets. One detailed insider tweet, then fan/analyst reactions only.`;

        const prevSalaryUSDFirstYear = (Number(existingPlayerForMerge?.contract?.amount) || 0) * 1_000;
        const tradeEligibleDate = computeTradeEligibleDate({
            signingDate: stateWithSim.date,
            contractYears: totalYears,
            salaryUSDFirstYear: baseSalaryUSD,
            prevSalaryUSDFirstYear,
            usedBirdRights: isResignAction,
            isReSign: isResignAction,
            isMinimum: baseSalaryUSD <= minSalaryUSD * 1.01,
            isTwoWay: !!signedAsTwoWay,
            leagueStats: stateWithSim.leagueStats as any,
        });

        const result = await advanceDay(stateWithSim, {
            type: 'SIGN_FREE_AGENT',
            payload: {
                outcomeText: signingOutcomeText,
                playerId,
                teamId,
                nativeOnly: nativeOnlySigning,
            }
        } as any, [signingSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

        if (sponsorSigningPerk) {
            const nonNbaPerk = consumeSigningPerkForTeam(
                (result as any).nonNBATeams ?? (stateWithSim as any).nonNBATeams,
                teamId,
                sponsorSigningPerk,
                leagueYear,
                baseSalaryUSD,
            );
            if (nonNbaPerk.grant) {
                (result as any).nonNBATeams = nonNbaPerk.teams;
            } else {
                const nbaPerk = consumeSigningPerkForTeam(
                    (result as any).teams ?? (stateWithSim as any).teams,
                    teamId,
                    sponsorSigningPerk,
                    leagueYear,
                    baseSalaryUSD,
                );
                if (nbaPerk.grant) (result as any).teams = nbaPerk.teams;
            }
        }

        // Force correct contract amount — LLM generates wrong units
        // Update the player directly in result.players if present
        if (result.players) {
            result.players = result.players.map((p: any) => {
                if (isPbaImportSigning && replacedPbaImport && p.internalId === replacedPbaImport.internalId) {
                    const previousMeta = (p as any).pbaImportContract ?? buildPbaImportContractMetadata(teamId, pbaConference, stateWithSim.date);
                    const reserveAllowed = Number(previousMeta.replacementsUsed ?? 0) === 0;
                    return reserveAllowed
                        ? {
                            ...p,
                            tid: -1,
                            status: 'PBA Import Reserve',
                            importTeamId: teamId,
                            importConference: pbaConference,
                            isImport: true,
                            pbaImportContract: {
                                ...previousMeta,
                                status: 'reserve',
                                reserveDate: stateWithSim.date,
                                replacementsUsed: pbaImportReplacementCount,
                            },
                        }
                        : {
                            ...p,
                            tid: -1,
                            status: 'Free Agent',
                            isImport: undefined,
                            importConference: undefined,
                            importTeamId: undefined,
                            pbaImportContract: {
                                ...previousMeta,
                                status: 'released',
                                releaseDate: stateWithSim.date,
                                replacementsUsed: pbaImportReplacementCount,
                            },
                        };
                }
                return p.internalId === playerId
                    ? clearWaiverMarkers({
                        ...applyPbaSigningTune(p),
                        tid: teamId,
                        status: signedPlayerStatus,
                        contract: {
                            amount: contractAmountThousands,
                            exp: expYear,
                            rookie: nbaRookieSeason === signYear,
                            ...(playerSigningBonusEUR > 0 ? { signingBonusEUR: playerSigningBonusEUR } : {}),
                            ...(sponsorSigningPerk ? { sponsorSigningPerk } : {}),
                            ...(aspireSideDeal ? { aspireSideDeal } : {}),
                            ...(signedAsTwoWay ? { type: signedAsDevelopmental ? 'DEVELOPMENTAL' : 'TWO_WAY' } : {}),
                            ...(isPbaImportSigning ? { type: 'PBA_IMPORT' } : {}),
                            ...(isPbaTeam ? {
                                pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
                                pbaSalarySource: isPbaImportSigning ? 'import' : 'free_agent',
                            } : {}),
                        },
                        ...(nbaRookieSeason ? { nbaRookieSeason } : {}),
                        contractYears: mergedContractYears,
                        salaries: mergePlayerSalaries(negotiatedSalaryStints, priorSalaryStints),
                        // Stamp signing date so autoTrimOversizedRosters won't waive
                        // a guaranteed player soon after signing — breaks the
                        // sign→cut→stretch dead-money snowball.
                        signedDate: stateWithSim.date,
                        tradeEligibleDate,
                        transactions: appendPlayerTransaction(p, { season: signYear, tid: teamId, type: 'freeAgent' }),
                        // Explicitly set/clear twoWay per the signing decision —
                        // otherwise a player who was previously on a two-way deal
                        // keeps the flag via `...p`, so even a GUARANTEED re-signing
                        // ships as a two-way contract.
                        twoWay: !!signedAsTwoWay && !signedAsDevelopmental,
                        developmentalContract: signedAsDevelopmental || undefined,
                        developmentalGamesPlayed: signedAsDevelopmental ? 0 : undefined,
                        developmentalContractSeason: signedAsDevelopmental ? signYear : undefined,
                        nonGuaranteed: !!signedAsNG,
                        offseasonDecisionTeamId: undefined,
                        offseasonDecisionSeason: undefined,
                        declinedTeamOptionByTid: undefined,
                        declinedTeamOptionSeasonYear: undefined,
                        declinedTeamOptionSalaryUSD: undefined,
                        ...(isPbaImportSigning ? {
                            isImport: true,
                            importConference: pbaConference,
                            importTeamId: teamId,
                            pbaImportContract: buildPbaImportContractMetadata(teamId, pbaConference, stateWithSim.date, pbaImportReplacementCount),
                            pbaImportHistory: [
                                ...(((p as any).pbaImportHistory ?? []) as any[]),
                                { season: leagueYear, conference: pbaConference, teamId, signedDate: stateWithSim.date },
                            ],
                        } : {
                            isImport: undefined,
                            importConference: undefined,
                            importTeamId: undefined,
                            pbaImportContract: undefined,
                        }),
                        // Stamp MLE source so TeamFinancesView can color the
                        // contract cell and leagueStats.mleUsage below accounts
                        // for the draw.
                        mleSignedVia: effectiveMleType ?? undefined,
                        baeSignedVia: effectiveBae || undefined,
                    })
                    : p;
            });
        } else {
            // Patch directly onto stateWithSim players via result
            result.players = stateWithSim.players.map((p: any) => {
                if (isPbaImportSigning && replacedPbaImport && p.internalId === replacedPbaImport.internalId) {
                    const previousMeta = (p as any).pbaImportContract ?? buildPbaImportContractMetadata(teamId, pbaConference, stateWithSim.date);
                    const reserveAllowed = Number(previousMeta.replacementsUsed ?? 0) === 0;
                    return reserveAllowed
                        ? {
                            ...p,
                            tid: -1,
                            status: 'PBA Import Reserve',
                            importTeamId: teamId,
                            importConference: pbaConference,
                            isImport: true,
                            pbaImportContract: {
                                ...previousMeta,
                                status: 'reserve',
                                reserveDate: stateWithSim.date,
                                replacementsUsed: pbaImportReplacementCount,
                            },
                        }
                        : {
                            ...p,
                            tid: -1,
                            status: 'Free Agent',
                            isImport: undefined,
                            importConference: undefined,
                            importTeamId: undefined,
                            pbaImportContract: {
                                ...previousMeta,
                                status: 'released',
                                releaseDate: stateWithSim.date,
                                replacementsUsed: pbaImportReplacementCount,
                            },
                        };
                }
                return p.internalId === playerId
                    ? clearWaiverMarkers({
                        ...applyPbaSigningTune(p),
                        tid: teamId,
                        status: signedPlayerStatus,
                        contract: {
                            amount: contractAmountThousands,
                            exp: expYear,
                            rookie: nbaRookieSeason === signYear,
                            ...(playerSigningBonusEUR > 0 ? { signingBonusEUR: playerSigningBonusEUR } : {}),
                            ...(sponsorSigningPerk ? { sponsorSigningPerk } : {}),
                            ...(aspireSideDeal ? { aspireSideDeal } : {}),
                            ...(signedAsTwoWay ? { type: signedAsDevelopmental ? 'DEVELOPMENTAL' : 'TWO_WAY' } : {}),
                            ...(isPbaImportSigning ? { type: 'PBA_IMPORT' } : {}),
                            ...(isPbaTeam ? {
                                pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
                                pbaSalarySource: isPbaImportSigning ? 'import' : 'free_agent',
                            } : {}),
                        },
                        ...(nbaRookieSeason ? { nbaRookieSeason } : {}),
                        contractYears: mergedContractYears,
                        salaries: mergePlayerSalaries(negotiatedSalaryStints, priorSalaryStints),
                        // Stamp signing date so autoTrimOversizedRosters won't waive
                        // a guaranteed player soon after signing — breaks the
                        // sign→cut→stretch dead-money snowball.
                        signedDate: stateWithSim.date,
                        tradeEligibleDate,
                        transactions: appendPlayerTransaction(p, { season: signYear, tid: teamId, type: 'freeAgent' }),
                        // Explicitly set/clear twoWay per the signing decision —
                        // otherwise a player who was previously on a two-way deal
                        // keeps the flag via `...p`, so even a GUARANTEED re-signing
                        // ships as a two-way contract.
                        twoWay: !!signedAsTwoWay && !signedAsDevelopmental,
                        developmentalContract: signedAsDevelopmental || undefined,
                        developmentalGamesPlayed: signedAsDevelopmental ? 0 : undefined,
                        developmentalContractSeason: signedAsDevelopmental ? signYear : undefined,
                        nonGuaranteed: !!signedAsNG,
                        offseasonDecisionTeamId: undefined,
                        offseasonDecisionSeason: undefined,
                        declinedTeamOptionByTid: undefined,
                        declinedTeamOptionSeasonYear: undefined,
                        declinedTeamOptionSalaryUSD: undefined,
                        ...(isPbaImportSigning ? {
                            isImport: true,
                            importConference: pbaConference,
                            importTeamId: teamId,
                            pbaImportContract: buildPbaImportContractMetadata(teamId, pbaConference, stateWithSim.date, pbaImportReplacementCount),
                            pbaImportHistory: [
                                ...(((p as any).pbaImportHistory ?? []) as any[]),
                                { season: leagueYear, conference: pbaConference, teamId, signedDate: stateWithSim.date },
                            ],
                        } : {
                            isImport: undefined,
                            importConference: undefined,
                            importTeamId: undefined,
                            pbaImportContract: undefined,
                        }),
                        // Stamp MLE source so TeamFinancesView can color the
                        // contract cell and leagueStats.mleUsage below accounts
                        // for the draw.
                        mleSignedVia: effectiveMleType ?? undefined,
                        baeSignedVia: effectiveBae || undefined,
                    })
                    : p;
            });
        }

        // Update leagueStats.mleUsage so the FreeAgents MLE chip + future
        // getMLEAvailability checks reflect what this team has already spent.
        // Each team stores { type, usedUSD } — subsequent signings using the
        // same MLE type stack the usedUSD; signings on a different type are
        // blocked by getMLEAvailability's priorType guard.
        let updatedLeagueStats = result.leagueStats ?? stateWithSim.leagueStats;
        if (effectiveBae) {
            updatedLeagueStats = consumeBiannualException(updatedLeagueStats, {
                teamId,
                amountUSD: baseSalaryUSD,
                season: leagueYear,
                currentDate: stateWithSim.date,
            });
        } else if (
            !isResignAction &&
            !effectiveMleType &&
            teamPayroll < thresholds.salaryCap
        ) {
            updatedLeagueStats = recordTeamCapSpaceUse(updatedLeagueStats, teamId, leagueYear);
        }
        if (effectiveMleType) {
            const prevLS: any = updatedLeagueStats;
            const prevUsage = (prevLS?.mleUsage ?? {}) as Record<number, { type: string; usedUSD: number }>;
            const prior = prevUsage[teamId];
            const stackedUSD = prior?.type === effectiveMleType ? (prior.usedUSD ?? 0) + baseSalaryUSD : baseSalaryUSD;
            updatedLeagueStats = {
                ...(prevLS ?? {}),
                mleUsage: {
                    ...prevUsage,
                    [teamId]: { type: effectiveMleType, usedUSD: stackedUSD },
                },
            };
        }
        result.leagueStats = updatedLeagueStats;

        if (teamBuyoutContributionUSD > 0) {
            const buyoutTransaction = {
                sourceId: `free-agent-buyout:${teamId}:${player.internalId ?? player.name}:${stateWithSim.leagueStats.year}`,
                date: String(stateWithSim.date),
                season: stateWithSim.leagueStats.year,
                label: `${player.name} buyout contribution`,
                category: 'transfer' as const,
                playerId: player.internalId,
            };
            const nonNbaDebit = debitTycoonCashForTeam(
                (result as any).nonNBATeams ?? (stateWithSim as any).nonNBATeams,
                teamId,
                teamBuyoutContributionUSD,
                buyoutTransaction,
            );
            if (nonNbaDebit.changed) (result as any).nonNBATeams = nonNbaDebit.teams;

            const nbaDebit = debitTycoonCashForTeam(
                (result as any).teams ?? (stateWithSim as any).teams,
                teamId,
                teamBuyoutContributionUSD,
                buyoutTransaction,
            );
            if (nbaDebit.changed) (result as any).teams = nbaDebit.teams;
        }

        if (playerSigningBonusEUR > 0) {
            const signingBonusTransaction = {
                sourceId: `player-signing-bonus:${teamId}:${player.internalId ?? player.name}:${stateWithSim.date}`,
                date: String(stateWithSim.date),
                season: stateWithSim.leagueStats.year,
                label: `${player.name} signing bonus`,
                category: 'wages' as const,
                playerId: player.internalId,
            };
            const nonNbaDebit = debitTycoonCashForTeam(
                (result as any).nonNBATeams ?? (stateWithSim as any).nonNBATeams,
                teamId,
                playerSigningBonusEUR,
                signingBonusTransaction,
            );
            if (nonNbaDebit.changed) (result as any).nonNBATeams = nonNbaDebit.teams;

            const nbaDebit = debitTycoonCashForTeam(
                (result as any).teams ?? (stateWithSim as any).teams,
                teamId,
                playerSigningBonusEUR,
                signingBonusTransaction,
            );
            if (nbaDebit.changed) (result as any).teams = nbaDebit.teams;
        }

        // Auto news item for the signing (fires regardless of LLM). Override
        // the generic template so the headline + content carry the full
        // contract details — matches the AI-signing news style.
        const signingNewsItem = nativeOnlySigning
            ? null
            : NewsGenerator.generate('signing_confirmed', stateWithSim.date, {
                playerName: player.name,
                teamName: team.name,
            }, (team as any).logoUrl ?? (team as any).imgURL);
        if (signingNewsItem) {
            const verbHeadline = treatAsResignText ? 'Re-Signs With' : 'Signs With';
            (signingNewsItem as any).headline = isPbaImportSigning
                ? `${player.name} Signs as ${team.name} Import`
                : `${player.name} ${verbHeadline} ${team.name} — ${formattedDealAmount}/${totalYears}yr${optTag}${twoWayTag}${ngTag}${mleTag}`;
            (signingNewsItem as any).content = isPbaImportSigning
                ? `${signingOutcomeText}. The reinforcement is signed for the current PBA conference and can be replaced only under PBA import rules.`
                : `${signingOutcomeText}. The ${totalYears}-year deal is worth ${formattedDealAmount}${optTag ? `, with a${optTag.startsWith(' (player') ? ' player' : ' team'} option in the final year` : ''}.`;
            newNews.unshift(signingNewsItem);
        }

        if (aspireSideDeal && aspireSideDeal.roll <= aspireSideDeal.risk) {
            const requestedPickCount = getAspirePenaltyPickCount(aspireSideDeal.risk);
            const penaltyBase = {
                ...stateWithSim,
                draftPicks: result.draftPicks ?? stateWithSim.draftPicks,
                history: result.history ?? stateWithSim.history,
            } as GameState;
            const penalized = forfeitTeamDraftPicks(
                penaltyBase,
                teamId,
                requestedPickCount,
                `Undisclosed ${aspireSideDeal.sponsor} agreement connected to ${playerName}`,
            );
            const remainingIds = new Set(penalized.draftPicks.map(pick => pick.dpid));
            const forfeitedPickIds = penaltyBase.draftPicks
                .filter(pick => !remainingIds.has(pick.dpid))
                .map(pick => pick.dpid);
            result.draftPicks = penalized.draftPicks;
            result.history = penalized.history;
            newEmails.unshift(buildAspireInvestigationEmail({
                state: penaltyBase,
                teamId,
                playerId,
                playerName,
                sponsor: aspireSideDeal.sponsor,
                amountUSD: aspireSideDeal.amountUSD,
                risk: aspireSideDeal.risk,
                resolvedPickIds: forfeitedPickIds,
            }));
        }

        result.newEmails = [...newEmails, ...(result.newEmails || [])];
        result.newNews = [...newNews, ...(result.newNews || [])];
        result.newSocialPosts = [...newSocial, ...(result.newSocialPosts || [])];
        result.consequence = result.consequence || {};
        result.consequence.statChanges = result.consequence.statChanges || {};
        result.consequence.statChanges.revenue = (result.consequence.statChanges.revenue || 0) + (outcome.revenue || 0);
        result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
        result.players = normalizeTeamJerseyNumbers((result.players || stateWithSim.players) as any, stateWithSim.teams as any, stateWithSim.leagueStats?.year ?? new Date().getFullYear(), {
            history: stateWithSim.history,
            targetTeamIds: [teamId],
        }) as any;
        const signedPlayer = result.players.find((candidate: any) => candidate.internalId === playerId);
        if (signedPlayer?.contract) {
            const movementSlug = (value: unknown) => String(value ?? '')
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            (result as any).contractTransaction = {
                transactionType: 'Signing',
                transactionDate: stateWithSim.date,
                transactionDescription: signingOutcomeText,
                playerId,
                playerSlug: movementSlug((player as any).slug ?? (player as any).srID ?? player.name),
                teamId,
                teamSlug: movementSlug((team as any).slug ?? (team as any).abbrev ?? team.name),
                additionalSort: 0,
                groupSort: `Signing ${playerId}`,
                originalIndex: stateWithSim.history?.length ?? 0,
                salaryReflected: true,
                contractLength: totalSeasons,
                salaryUSD: baseSalaryUSD,
                totalValueUSD: negotiatedSalaryStints.reduce((sum, row) => sum + Number(row.amount ?? 0) * 1_000, 0),
                option: finalOption,
                contractType: isPbaImportSigning ? 'pba-import'
                    : signedAsDevelopmental ? 'developmental'
                    : signedAsTwoWay ? 'two-way'
                    : signedAsNG ? 'non-guaranteed'
                    : 'guaranteed',
                isExtension: isResignAction,
                contract: { ...signedPlayer.contract },
                contractYears: negotiatedContractYears.map(year => ({ ...year })),
                salaries: negotiatedSalaryStints.map(year => ({ ...year })),
            };
        }
        if (action.payload?.showFreeAgencySummary === true) {
            result.pendingFreeAgencySummary = buildManualSigningConfirmation(
                stateWithSim,
                { ...stateWithSim, ...result, players: result.players } as GameState,
                {
                    playerId,
                    salaryUSD: baseSalaryUSD,
                    contractYears: totalSeasons,
                    contractType: signedAsDevelopmental ? 'developmental' : signedAsTwoWay ? 'two-way' : signedAsNG ? 'non-guaranteed' : 'guaranteed',
                    option: finalOption,
                    isResigning: isResignAction,
                    day: Math.max(1, Number(stateWithSim.faTagCounter ?? 1)),
                    totalDays: getCentralFreeAgencyDays(stateWithSim),
                },
            );
        }
        
        return result;
    }
};

