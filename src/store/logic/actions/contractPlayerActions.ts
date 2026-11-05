import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { generateFreeAgentSigningReactions } from '../../../services/llm/services/freeAgentService';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { buildShamsSigningPost } from '../../../services/social/templates/charania';
import { getInsiderHandle } from '../../../data/social/handles';
import { NewsGenerator } from '../../../services/news/NewsGenerator';
import { SettingsManager } from '../../../services/SettingsManager';
import { normalizeTeamJerseyNumbers } from '../../../utils/jerseyUtils';
import { buildStretchedSchedule, contractToUSD, getCapThresholds, getContractLimits, getMLEAvailability, getTeamPayrollUSD, hasBirdRights, seasonLabelToYear } from '../../../utils/salaryUtils';
import { computeTradeEligibleDate } from '../../../utils/signingMoratorium';
import { getFreeAgencyStartDate, parseGameDate } from '../../../utils/dateUtils';
import { clearWaiverMarkers, stripLiveContractAfterWaive } from '../../../utils/contractCleanup';
import { isTwoWayContract, normalizeContractOptionKind, withPlayerContractType } from '../../../utils/contractTypes';
import { appendPlayerTransaction } from '../../../utils/playerBirdRights';
import { getTeamFullName } from '../../../utils/teamNames';
import { getTwoWayRosterLimit } from '../../../utils/rosterLimits';
import { isDeadMoneyEnabled, isStretchProvisionEnabled } from '../../../utils/ruleFlags';
import { tunePbaDraftProspects } from '../../../services/pba/draftRules';
import {
    consumeTeamOptionContractYear,
    getCompletedContractDecisionSeason,
    resolveOffseasonContractDecision,
} from '../../../services/freeAgency/offseasonContractDecision';
import {
    areWnbaDevelopmentalContractsEnabled,
    getWnbaDevelopmentalBaseStipendUSD,
    getWnbaDevelopmentalContractLabel,
    isWnbaDevelopmentalServiceEligible,
} from '../../../services/wnba/developmentalContracts';

export const handleWaivePlayer = async (stateWithSim: GameState, action: UserAction, _simResults: any[], _recentDMs: any[]) => {
    const { contacts, stretch } = action.payload as { contacts: any[]; stretch?: boolean };
    console.log('[handleWaivePlayer] entry', { contacts, stretch });
    if (!contacts || contacts.length === 0) {
        console.warn('[handleWaivePlayer] BAILING — no contacts');
        return { isProcessing: false };
    }

    const player = contacts[0];
    const playerRecord = stateWithSim.players.find((p: any) => p.internalId === (player.id || player.internalId)) as any;
    const team = playerRecord ? stateWithSim.teams.find(t => t.id === playerRecord.tid) : undefined;
    const rawTeamName = team ? getTeamFullName(team) : (player.organization || '');
    const hasConcreteTeamName = rawTeamName.trim().length > 0 && rawTeamName.trim().toLowerCase() !== 'their team';
    const releaseLead = hasConcreteTeamName
        ? `${rawTeamName} has ${releaseVerbPlaceholder()}`
        : `A team has ${releaseVerbPlaceholder()}`;
    console.log('[handleWaivePlayer] resolved', {
        lookupId: player.id || player.internalId,
        playerFound: !!playerRecord,
        playerName: playerRecord?.name,
        playerTid: playerRecord?.tid,
        playerStatus: playerRecord?.status,
        ng: !!playerRecord?.nonGuaranteed,
        tw: !!playerRecord?.twoWay,
        teamFound: !!team,
        teamName: rawTeamName,
    });

    // ─── Dead money calculation ───────────────────────────────────────────
    // Compute remaining guaranteed obligation from contractYears. NG contracts
    // before the auto-guarantee deadline = free release. Otherwise stretch is
    // optional (spreads over 2N+1 years, configurable). Two-way contracts
    // never produce dead money — $625K is min-day-rate paid only for days on
    // roster, real-NBA convention.
    const ls = stateWithSim.leagueStats as any;
    const pbaIsolated = ls.uiMode === 'pba_isolated';
    const wasPbaImport = pbaIsolated && !!playerRecord && (
        playerRecord.isImport === true
        || playerRecord.pbaImportContract
        || String(playerRecord.contract?.type ?? '').toUpperCase() === 'PBA_IMPORT'
    );
    const deadMoneyEnabled = !pbaIsolated && isDeadMoneyEnabled(ls);
    const twoWayContractsActive = !pbaIsolated && getTwoWayRosterLimit(ls) > 0;
    const nonGuaranteedContractsActive = !pbaIsolated && ls.nonGuaranteedContractsEnabled !== false;
    const wasNG = nonGuaranteedContractsActive && !!playerRecord?.nonGuaranteed;
    const wasTwoWay = twoWayContractsActive && isTwoWayContract(playerRecord, ls);
    const currentSeasonYear: number = ls.year ?? new Date(stateWithSim.date ?? Date.now()).getUTCFullYear();
    const pbaTunedReleasePlayer = pbaIsolated
        ? tunePbaDraftProspects(stateWithSim.players as any, currentSeasonYear, stateWithSim.leagueStats).find((p: any) => p.internalId === (player.id || player.internalId))
        : undefined;
    // If nonGuaranteed flag is still set the Jan-10 auto-guarantee hasn't fired,
    // meaning the contract was never locked in — release is always free.
    const ngFreeRelease = !pbaIsolated && wasNG;

    let updatedTeams = stateWithSim.teams;
    let deadMoneyAdded: import('../../../types').DeadMoneyEntry | null = null;

    const DEAD_MONEY_FLOOR_USD = 50_000;
    if (deadMoneyEnabled && !wasTwoWay && !ngFreeRelease && playerRecord && team) {
        const allContractYears: Array<{ season: string; guaranteed: number; option?: string }> =
            Array.isArray(playerRecord.contractYears) ? playerRecord.contractYears : [];
        // Only future obligations — past seasons are already paid out.
        const remaining = allContractYears
            .filter(cy => {
                const yr = parseInt(cy.season.split('-')[0], 10) + 1;
                const option = String(cy.option ?? '').toLowerCase();
                return yr >= currentSeasonYear && option !== 'team' && option !== 'player';
            })
            // Drop sub-floor years — NG/partial-guaranteed tails shouldn't generate dead money.
            .filter(cy => (cy.guaranteed ?? 0) >= DEAD_MONEY_FLOOR_USD)
            .map(cy => ({ season: cy.season, amountUSD: cy.guaranteed }));
        const signedAt = playerRecord.signedDate ? new Date(playerRecord.signedDate).getTime() : NaN;
        const waivedAt = stateWithSim.date ? new Date(stateWithSim.date).getTime() : NaN;
        const freshSignedMissingYears = Number.isFinite(signedAt) && Number.isFinite(waivedAt)
            && (waivedAt - signedAt) >= 0
            && (waivedAt - signedAt) / 86_400_000 < 120;
        if (remaining.length === 0 && playerRecord.contract?.amount && !freshSignedMissingYears) {
            // Fallback: legacy player without contractYears — use flat contract.amount × years to exp.
            const exp = playerRecord.contract.exp ?? currentSeasonYear;
            const amountUSD = (playerRecord.contract.amount || 0) * 1_000;
            if (amountUSD >= DEAD_MONEY_FLOOR_USD) {
                for (let yr = currentSeasonYear; yr <= exp; yr++) {
                    remaining.push({ season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD });
                }
            }
        }
        const totalDeadUSD = remaining.reduce((s, y) => s + y.amountUSD, 0);
        if (remaining.length > 0 && totalDeadUSD >= DEAD_MONEY_FLOOR_USD) {
            const stretchEnabled = isStretchProvisionEnabled(ls);
            const wantStretch = !!stretch && stretchEnabled;
            const stretchMult = ls.stretchProvisionMultiplier ?? 2;
            const finalSchedule = wantStretch
                ? buildStretchedSchedule(remaining, stretchMult)
                : remaining;
            deadMoneyAdded = {
                playerId: playerRecord.internalId,
                playerName: playerRecord.name,
                remainingByYear: finalSchedule,
                stretched: wantStretch,
                waivedDate: stateWithSim.date ?? new Date().toISOString().slice(0, 10),
                originalExpYear: playerRecord.contract?.exp ?? currentSeasonYear,
            };
            updatedTeams = stateWithSim.teams.map(t =>
                t.id === team.id
                    ? { ...t, deadMoney: [...(t.deadMoney ?? []), deadMoneyAdded!] }
                    : t,
            );
        }
    }

    // ─── Player record update ─────────────────────────────────────────────
    // Clear ALL future contract obligations from the player's record. The dead
    // money lives on team.deadMoney now — leaving p.contract / p.contractYears
    // pointed at the OLD team's deal causes the next signing team to inherit
    // ghost player-options and inflated salaries (Khris Middleton case: Mavs
    // $33.3M player option survived through waive, then re-stamped under the
    // new team in PlayerBio renders).
    const players = stateWithSim.players.map((p: any) => {
        if (p.internalId !== (player.id || player.internalId)) return p;
        const normalizedPlayer = pbaTunedReleasePlayer
            ? {
                ...p,
                pos: pbaTunedReleasePlayer.pos,
                overallRating: pbaTunedReleasePlayer.overallRating,
                potential: pbaTunedReleasePlayer.potential,
                ratings: pbaTunedReleasePlayer.ratings,
                ovrHistory: (pbaTunedReleasePlayer as any).ovrHistory ?? (p as any).ovrHistory,
                ovrTimeline: (pbaTunedReleasePlayer as any).ovrTimeline ?? (p as any).ovrTimeline,
                pbaDraftTunedVersion: (pbaTunedReleasePlayer as any).pbaDraftTunedVersion ?? (p as any).pbaDraftTunedVersion,
            }
            : p;
        const pbaImportRelease = wasPbaImport
            ? {
                isImport: undefined,
                importConference: undefined,
                importTeamId: undefined,
                pbaImportContract: normalizedPlayer.pbaImportContract
                    ? { ...normalizedPlayer.pbaImportContract, status: 'released', releaseDate: stateWithSim.date }
                    : undefined,
            }
            : {};
        return {
            ...stripLiveContractAfterWaive(normalizedPlayer, currentSeasonYear),
            ...pbaImportRelease,
            tid: -1,
            status: 'Free Agent',
            twoWay: undefined,
            developmentalContract: undefined,
            developmentalGamesPlayed: undefined,
            developmentalContractSeason: undefined,
            nonGuaranteed: false,
            gLeagueAssigned: false,
            mleSignedVia: undefined,
            baeSignedVia: undefined,
            hasBirdRights: false,
            yearsWithTeam: 0,
            transactions: appendPlayerTransaction(p, { season: currentSeasonYear, tid: -1, type: 'waive' }),
            recentlyWaivedBy: team?.id,
            recentlyWaivedDate: stateWithSim.date,
            signedDate: undefined,
            tradeEligibleDate: undefined,
        };
    });

    const deadMoneyThisSeason = deadMoneyAdded
        ? (deadMoneyAdded.remainingByYear.find(y => seasonLabelToYear(y.season) === currentSeasonYear)?.amountUSD ?? 0)
        : 0;
    const totalDead = deadMoneyAdded?.remainingByYear.reduce((s, y) => s + y.amountUSD, 0) ?? 0;

    // Verb choice mirrors how the move would actually be reported:
    // - Two-way release / NG pre-deadline release: "released" (no dead money)
    // - Guaranteed waive: "waived" (with or without stretch — that detail lives in finances UI, not the headline)
    const releaseVerb = (pbaIsolated || wasTwoWay || ngFreeRelease) ? 'released' : 'waived';
    const releaseSuffix = pbaIsolated
        ? ''
        : wasTwoWay
        ? ` from his ${getWnbaDevelopmentalContractLabel(ls).toLowerCase()} contract`
        : ngFreeRelease
            ? ' (non-guaranteed)'
            : '';

    // News card stays detailed — finance fans want the dollar context.
    const stretchTag = deadMoneyAdded?.stretched
        ? ` Payment stretched over ${deadMoneyAdded.remainingByYear.length} seasons (~$${(deadMoneyThisSeason / 1_000_000).toFixed(1)}M/yr).`
        : '';
    const newsDeadTag = totalDead > 0
        ? ` Dead money: $${(totalDead / 1_000_000).toFixed(1)}M total ($${(deadMoneyThisSeason / 1_000_000).toFixed(1)}M this season).${stretchTag}`
        : ngFreeRelease && !pbaIsolated
            ? ' Contract was non-guaranteed — no dead money.'
            : '';

    const waiveNewsItem = {
        id: `waive-news-${Date.now()}`,
        headline: `${player.name} ${releaseVerb === 'waived' ? 'Waived' : 'Released'}`,
        content: `${releaseLead.replace(releaseVerbPlaceholder(), releaseVerb)} ${player.name}${releaseSuffix}.${newsDeadTag} ${player.name} is now a free agent.`,
        date: stateWithSim.date,
        isNew: true,
        image: team?.logoUrl,
        newsType: 'daily' as const,
    };

    // History entry text — gameLogic.ts:876 picks this up and stamps type 'Waive'.
    // NBA.com style: short and clean. No salary numbers in the transactions feed —
    // those belong on the team finances page.
    const outcomeText = hasConcreteTeamName
        ? `${player.name} ${releaseVerb} by ${rawTeamName}${releaseSuffix}.`
        : `${player.name} ${releaseVerb} by a team${releaseSuffix}.`;

    const updatedPlayer = players.find((p: any) => p.internalId === (player.id || player.internalId));
    console.log('[handleWaivePlayer] returning', {
        playerName: playerRecord?.name,
        updatedTid: updatedPlayer?.tid,
        updatedStatus: updatedPlayer?.status,
        deadMoneyAdded: !!deadMoneyAdded,
        outcomeText,
    });

    return {
        players,
        teams: updatedTeams,
        newNews: [waiveNewsItem],
        outcomeText,
        statChanges: { playerApproval: -2 },
        isProcessing: false,
    };
};

function releaseVerbPlaceholder(): string {
    return '__RELEASE_VERB__';
}

export const handleExerciseTeamOption = async (stateWithSim: GameState, action: UserAction) => {
    const { playerId } = action.payload;
    const player = stateWithSim.players.find((p: any) => p.internalId === playerId) as any;
    if (!player) return { isProcessing: false };
    const team = stateWithSim.teams.find(t => t.id === player.tid);
    const completedSeason = getCompletedContractDecisionSeason(stateWithSim);
    const decision = resolveOffseasonContractDecision(player, stateWithSim, completedSeason);
    if (decision.kind !== 'ROOKIE_TEAM_OPTION_DUE' && decision.kind !== 'TEAM_OPTION_DUE') {
        return { isProcessing: false };
    }
    const optionSeasonExp = Number(decision.optionEndYear ?? 0);
    if (!Number.isFinite(optionSeasonExp) || optionSeasonExp <= 0) return { isProcessing: false };
    const minimumExp = optionSeasonExp || ((stateWithSim.leagueStats?.year ?? 0) + 1);
    const exercisedExp = Math.max(Number(player.contract?.exp ?? 0), minimumExp);
    const optionResolved = consumeTeamOptionContractYear(player, optionSeasonExp, 'exercise');

    const players = stateWithSim.players.map((p: any) =>
        p.internalId === playerId
            ? {
                ...optionResolved,
                contract: {
                    ...optionResolved.contract,
                    exp: exercisedExp,
                },
            }
            : p
    );

    return {
        players,
        outcomeText: `The ${team?.name ?? 'team'} exercised their team option on ${player.name}.`,
        isProcessing: false,
    };
};

export const handleDeclineTeamOption = async (stateWithSim: GameState, action: UserAction) => {
    const { playerId } = action.payload;
    const player = stateWithSim.players.find((p: any) => p.internalId === playerId) as any;
    if (!player) return { isProcessing: false };
    const team = stateWithSim.teams.find(t => t.id === player.tid);

    const priorContractYears = Array.isArray(player.contractYears) ? player.contractYears : [];
    const completedSeason = getCompletedContractDecisionSeason(stateWithSim);
    const decision = resolveOffseasonContractDecision(player, stateWithSim, completedSeason);
    if (decision.kind !== 'ROOKIE_TEAM_OPTION_DUE' && decision.kind !== 'TEAM_OPTION_DUE') {
        return { isProcessing: false };
    }
    const declinedOptionYear = Number(decision.optionEndYear ?? 0);
    if (!Number.isFinite(declinedOptionYear) || declinedOptionYear <= 0) return { isProcessing: false };
    const declinedOptionRow = priorContractYears.find((cy: any) => {
        const start = parseInt(String(cy.season ?? '').split('-')[0], 10);
        return Number.isFinite(start) && start + 1 === declinedOptionYear;
    }) ?? priorContractYears[priorContractYears.length - 1];
    const declinedOptionSalaryUSD = Number(declinedOptionRow?.guaranteed ?? 0);
    const optionResolved = consumeTeamOptionContractYear(player, declinedOptionYear, 'decline');

    const players = stateWithSim.players.map((p: any) =>
        p.internalId === playerId
            ? {
                ...optionResolved,
                tid: -1,
                status: 'Free Agent',
                contract: {
                    ...optionResolved.contract,
                    qualifyingOfferSubmitted: false,
                    qualifyingOfferSkipped: false,
                },
                twoWay: undefined,
                developmentalContract: undefined,
                developmentalGamesPlayed: undefined,
                developmentalContractSeason: undefined,
                nonGuaranteed: false,
                hasBirdRights: player.hasBirdRights,
                birdRightsTeamId: player.hasBirdRights ? player.tid : player.birdRightsTeamId,
                birdRightsSeason: player.hasBirdRights ? completedSeason : player.birdRightsSeason,
                yearsWithTeam: 0,
                offseasonDecisionTeamId: player.tid,
                offseasonDecisionSeason: completedSeason,
                transactions: appendPlayerTransaction(p, { season: stateWithSim.leagueStats?.year ?? declinedOptionYear, tid: -1, type: 'freeAgent' }),
                declinedTeamOptionByTid: player.tid,
                declinedTeamOptionSeasonYear: declinedOptionYear,
                declinedTeamOptionSalaryUSD: declinedOptionSalaryUSD,
            }
            : p
    );

    return {
        players,
        outcomeText: `The ${team?.name ?? 'team'} declined their team option on ${player.name}. ${player.name} is now a free agent.`,
        isProcessing: false,
    };
};

/**
 * Convert a non-guaranteed contract on the fly.
 *  - to:'GUARANTEED' just clears the `nonGuaranteed` flag (existing salary stays).
 *  - to:'TWO_WAY' collapses the deal to a 1-year, $625K two-way (real-NBA scale).
 * Mirrors the configured automatic-guarantee path but lets the user pull the trigger
 * any time before the deadline.
 */
export const handleConvertContractType = async (stateWithSim: GameState, action: UserAction) => {
    const { playerId, to } = action.payload as { playerId: string; to: 'GUARANTEED' | 'TWO_WAY' };
    const player = stateWithSim.players.find((p: any) => p.internalId === playerId) as any;
    if (stateWithSim.leagueStats?.nonGuaranteedContractsEnabled === false) return { isProcessing: false };
    if (!player || !(player as any).nonGuaranteed) return { isProcessing: false };
    const team = stateWithSim.teams.find(t => t.id === player.tid);
    const teamName = team?.name ?? 'team';

    let players: any[];
    let outcomeText: string;
    if (to === 'GUARANTEED') {
        // Treat NG → guaranteed as a fresh signing for trim recency purposes —
        // the guaranteed-contract clock starts now, so the trim grace applies.
        const ngTradeEligibleDate = computeTradeEligibleDate({
            signingDate: stateWithSim.date,
            contractYears: 1,
            salaryUSDFirstYear: (Number((player as any).contract?.amount) || 0) * 1_000,
            isReSign: true,
            usedBirdRights: false,
            leagueStats: stateWithSim.leagueStats as any,
        });
        players = stateWithSim.players.map((p: any) =>
            p.internalId === playerId
                ? { ...withPlayerContractType(p, 'guaranteed'), signedDate: stateWithSim.date, tradeEligibleDate: ngTradeEligibleDate }
                : p
        );
        outcomeText = `${player.name}'s contract was guaranteed by the ${teamName}.`;
    } else {
        const maxTwoWay = getTwoWayRosterLimit(stateWithSim.leagueStats as any);
        const twoWayCount = stateWithSim.players.filter((p: any) => p.tid === player.tid && isTwoWayContract(p, stateWithSim.leagueStats)).length;
        if (maxTwoWay <= 0 || twoWayCount >= maxTwoWay) {
            return { isProcessing: false };
        }
        const developmental = areWnbaDevelopmentalContractsEnabled(stateWithSim.leagueStats);
        const leagueYear = stateWithSim.leagueStats?.year ?? new Date().getUTCFullYear();
        if (developmental && !isWnbaDevelopmentalServiceEligible(player, leagueYear, stateWithSim.leagueStats)) {
            return { isProcessing: false };
        }
        // Two-way scale: $625K, 1 year. Replace current-season contractYears entry,
        // preserve any historical (pre-current-season) salary rows.
        const TWO_WAY_USD = developmental
            ? getWnbaDevelopmentalBaseStipendUSD(stateWithSim.leagueStats)
            : 625_000;
        const TWO_WAY_THOUSANDS = Math.round(TWO_WAY_USD / 1_000);
        const seasonLabel = `${leagueYear - 1}-${String(leagueYear).slice(-2)}`;
        const priorYears: Array<{ season: string; guaranteed: number; option?: string }> =
            Array.isArray(player.contractYears) ? player.contractYears : [];
        const historical = priorYears.filter(cy => {
            const yr = parseInt(cy.season.split('-')[0], 10) + 1;
            return yr < leagueYear;
        });
        const newContractYears = [
            ...historical,
            { season: seasonLabel, guaranteed: TWO_WAY_USD, option: developmental ? 'Developmental' : 'Two-Way' },
        ];
        players = stateWithSim.players.map((p: any) =>
            p.internalId === playerId
                ? withPlayerContractType({
                    ...p,
                    nonGuaranteed: undefined,
                    contract: { ...(p.contract ?? {}), amount: TWO_WAY_THOUSANDS, exp: leagueYear, type: developmental ? 'DEVELOPMENTAL' : 'TWO_WAY' },
                    contractYears: newContractYears,
                }, 'twoWay', stateWithSim.leagueStats)
                : p
        );
        outcomeText = `${player.name} was converted to a ${getWnbaDevelopmentalContractLabel(stateWithSim.leagueStats).toLowerCase()} contract by the ${teamName}.`;
    }

    const historyEntry = {
        text: outcomeText,
        date: stateWithSim.date,
        type: to === 'GUARANTEED' ? 'NG Guaranteed' : `NG → ${getWnbaDevelopmentalContractLabel(stateWithSim.leagueStats)}`,
        playerIds: [playerId],
    };

    return {
        players,
        history: [...(stateWithSim.history ?? []), historyEntry],
        outcomeText,
        isProcessing: false,
    };
};

