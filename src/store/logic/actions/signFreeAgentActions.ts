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
import { getTeamFullName } from '../../../utils/teamNames';
import { buildGeneratedNBAStaffForRole } from '../../../services/staff/nbaRealStaffSeed';
import { ensureStaffPoolDepth, inferEuroStaffLeagueId, normalizeStaffPoolRole, toStaffFreeAgent } from '../../../services/euro/staffPool';

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
    const { playerId, teamId, playerName, teamName, salary, years: negotiatedYears, option, twoWay: signedAsTwoWay, nonGuaranteed: signedAsNG, mleType: signedMleType } = action.payload;
    const player = stateWithSim.players.find(p => p.internalId === playerId);
    const team = stateWithSim.teams.find(t => t.id === teamId)
        ?? ((stateWithSim as any).nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === teamId);
    
    console.log('[handleSignFreeAgent] entry', {
        playerId, teamId, playerName, teamName,
        foundPlayer: !!player, foundTeam: !!team,
        playerTid: player?.tid, playerStatus: player?.status,
        uiMode: stateWithSim.leagueStats?.uiMode,
        gameMode: stateWithSim.gameMode,
        userTeamId: (stateWithSim as any).userTeamId,
    });
    if (!player || !team) {
        console.warn('[handleSignFreeAgent] aborting — player or team not found');
        return { isProcessing: false };
    }

    const MIN_CONTRACT_USD = 1_300_000;
    const leagueYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    const baseSalaryUSD = typeof salary === 'number' && salary > 0 ? salary : MIN_CONTRACT_USD;
    const isEuroMode = stateWithSim.leagueStats?.uiMode === 'euro_isolated';
    if (stateWithSim.gameMode === 'gm' && player.tid === -1 && player.status === 'Free Agent' && stateWithSim.date) {
        // Gate the pre-FA blackout — Jun 30 → Jul 1 sliver where the rollover
        // hasn't run yet. Anything past this Jul 1 (or before, mid-season)
        // is fine: the FA pool is permanently signable once FA has opened
        // for the current season.
        //
        // Old impl used getCurrentOffseasonEffectiveFAStart which rolls
        // forward to NEXT year's Jul 1 after Oct 1 — that wrongly blocked
        // every Oct-May signing as "pre-FA". AI signings bypassed this
        // gate via faMarketTicker so the user was the only one stuck.
        const currentDate = parseGameDate(stateWithSim.date);
        const thisSeasonFAStart = getFreeAgencyStartDate(currentDate.getUTCFullYear(), stateWithSim.leagueStats as any);
        // Only block if we're between Jan 1 and the FA start of THIS calendar
        // year — i.e. the actual pre-FA period leading into the offseason.
        const thisYearStart = new Date(Date.UTC(currentDate.getUTCFullYear(), 0, 1));
        const inPreFABlackout = currentDate >= thisYearStart && currentDate < thisSeasonFAStart;
        if (inPreFABlackout) {
            console.warn(`[SIGN_FREE_AGENT] Blocked pre-FA offer: ${player.name} to ${team.name}`);
            return { isProcessing: false };
        }
    }
    const isResignAction = player.tid === teamId;
    const priorNbaTid = getPriorNbaTid(player as any);
    const ownTeamBirdRights = (isResignAction || priorNbaTid === teamId) && hasBirdRights(player as any);
    const signedAsGuaranteed = !signedAsTwoWay && !signedAsNG;
    const thresholds = getCapThresholds(stateWithSim.leagueStats as any);
    const teamPayroll = getTeamPayrollUSD(stateWithSim.players as any, teamId, team as any, leagueYear);
    // Re-sign deals start NEXT season — comparing year-1 of the new contract
    // against current-year payroll counts $$ already on expiring books, which
    // silently blocks legitimate signings (e.g., Kennard re-sign blocked even
    // though his old $11M and other expirings roll off before the new deal hits).
    const newDealStartYear = isResignAction ? leagueYear + 1 : leagueYear;
    const committedAtStartYear = stateWithSim.players
        .filter((p: any) =>
            p.tid === teamId &&
            !p.twoWay &&
            (p.contract?.exp ?? newDealStartYear) >= newDealStartYear &&
            !(isResignAction && p.internalId === playerId)
        )
        .reduce((sum: number, p: any) => sum + contractToUSD(p.contract?.amount || 0), 0);
    const projectedPayroll = committedAtStartYear + baseSalaryUSD;
    const mle = getMLEAvailability(teamId, teamPayroll, baseSalaryUSD, thresholds, stateWithSim.leagueStats as any);
    const hasRequestedValidMLE = !!signedMleType && !mle.blocked && signedMleType === mle.type && baseSalaryUSD <= mle.available;
    // Defense-in-depth: client claimed an MLE tier but salary exceeds that tier.
    // The Khris Middleton case — modal auto-stamped non_taxpayer MLE on a $33.3M
    // signing because contract was guaranteed; this gate refuses the signing
    // server-side regardless of the client claim.
    if (!isEuroMode && signedMleType && (mle.blocked || baseSalaryUSD > mle.available)) {
        console.warn(`[SIGN_FREE_AGENT] Blocked: claimed ${signedMleType} MLE but salary $${(baseSalaryUSD/1e6).toFixed(1)}M exceeds available $${(mle.available/1e6).toFixed(1)}M`);
        return { isProcessing: false };
    }
    // NBA Minimum Player Salary Exception (CBA Article VII §6): any team can
    // sign a player at the league min regardless of cap status. Without this
    // gate, an over-cap team with a depleted roster couldn't even sign a min
    // body to fill an open slot — physically impossible in real NBA.
    const minSalaryUSD = getContractLimits(player as any, stateWithSim.leagueStats as any).minSalaryUSD;
    const isMinContract = baseSalaryUSD <= minSalaryUSD * 1.05;
    if (!isEuroMode && signedAsGuaranteed && !ownTeamBirdRights && projectedPayroll > thresholds.salaryCap && !hasRequestedValidMLE && !isMinContract) {
        console.warn(`[SIGN_FREE_AGENT] Blocked illegal over-cap signing: ${player.name} to ${team.name}`);
        return { isProcessing: false };
    }

    if (player.status !== 'Active' && player.status !== 'Free Agent' && !['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '')) {
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

        const reactions = await generateFreeAgentSigningReactions(player as any, team as any, previousTeamName, previousLeague, stateWithSim);
        
        const outcome = calculateOutcome('SIGN_FREE_AGENT', { playerId: player?.internalId }, stateWithSim);
        
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
        const llmEnabled = SettingsManager.getSettings().enableLLM;
        const shamsContent = !llmEnabled ? buildShamsSigningPost(
            player.name,
            team.name,
            team.abbrev,
            player.overallRating ?? 60,
            previousTeamName,
            previousLeague
        ) : null;
        if (shamsContent) {
            const insider = getInsiderHandle(stateWithSim.leagueType);
            const shamsEngagement = calculateSocialEngagement(insider.atHandle, shamsContent, player?.overallRating);
            newSocial.unshift({
                id: `shams-sign-${Date.now()}`,
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
        const totalYears = typeof negotiatedYears === 'number' && negotiatedYears > 0 ? negotiatedYears : 1;
        const hasOption = option === 'PLAYER' || option === 'TEAM';
        const totalSeasons = hasOption ? totalYears + 1 : totalYears;
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
                option: isOptionYear ? (option === 'PLAYER' ? 'player' : 'team') : '',
            };
        });
        // Preserve historical (past + prior in-flight) contractYears entries so
        // PlayerBioContractTab keeps showing the player's existing salary history
        // after a re-sign. Filter out any entries for seasons the new deal covers
        // so the new terms win.
        const priorContractYears: Array<{ season: string; guaranteed: number; option?: string }> =
          Array.isArray(existingPlayerForMerge?.contractYears) ? existingPlayerForMerge.contractYears : [];
        const newSeasonSet = new Set(negotiatedContractYears.map(cy => cy.season));
        const historicalContractYears = priorContractYears.filter(cy => !newSeasonSet.has(cy.season));
        const mergedContractYears = [
            ...historicalContractYears,
            ...negotiatedContractYears,
        ].sort((a, b) => a.season.localeCompare(b.season));

        const returnContext = previousLeague && ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(previousLeague)
            ? ` ${playerName} is returning to the NBA after playing in the ${previousLeague}.`
            : previousTeamName
                ? ` ${playerName} was previously with the ${previousTeamName}.`
                : '';

        // Match AI signing/re-signing template so the transaction log + news
        // get full contract details (salary, years, option, contract type).
        const annualM = Math.round(baseSalaryUSD / 100_000) / 10;
        const totalRaw = annualM * totalYears;
        const totalStr = totalRaw < 1 ? totalRaw.toFixed(1) : Math.round(totalRaw).toString();
        const optTag = option === 'PLAYER' ? ' (player option)' : option === 'TEAM' ? ' (team option)' : '';
        const twoWayTag = signedAsTwoWay ? ' (two-way)' : '';
        const ngTag = signedAsNG ? ' (non-guaranteed)' : '';
        const mleTag = signedMleType && !signedAsTwoWay && !signedAsNG
            ? (signedMleType === 'taxpayer' ? ' (taxpayer MLE)' : signedMleType === 'room' ? ' (room MLE)' : ' (MLE)')
            : '';
        const contractDetails = `: $${totalStr}M/${totalYears}yr${optTag}${twoWayTag}${ngTag}${mleTag}`;
        const treatAsResignText = isResignAction && !signedMleType;
        const signingOutcomeText = treatAsResignText
            ? `${playerName} re-signs with ${teamName}${contractDetails}`
            : `${playerName} signs with the ${teamName}${contractDetails}${returnContext}`;

        const signingSeed = `BREAKING SIGNING: The ${teamName} have signed ${playerName}.${returnContext} ` +
            `REQUIRED: @ShamsCharania MUST break this in a detailed tweet — name the team, the player, any context (returning from abroad, veteran presence, etc.), and what he brings. ` +
            `Then generate 3-4 varied fan and analyst reactions. ` +
            `Do NOT write two identical Shams tweets. One detailed Shams tweet, then fan/analyst reactions only.`;

        const prevSalaryUSDFirstYear = (Number(existingPlayerForMerge?.contract?.amount) || 0) * 1_000;
        const tradeEligibleDate = computeTradeEligibleDate({
            signingDate: stateWithSim.date,
            contractYears: totalYears,
            salaryUSDFirstYear: baseSalaryUSD,
            prevSalaryUSDFirstYear,
            usedBirdRights: isResignAction,
            isReSign: isResignAction,
            isMinimum: baseSalaryUSD <= MIN_CONTRACT_USD * 1.01,
            isTwoWay: !!signedAsTwoWay,
            leagueStats: stateWithSim.leagueStats as any,
        });

        const result = await advanceDay(stateWithSim, {
            type: 'SIGN_FREE_AGENT',
            payload: {
                outcomeText: signingOutcomeText,
                playerId,
                teamId,
            }
        } as any, [signingSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

        // Force correct contract amount — LLM generates wrong units
        // Update the player directly in result.players if present
        if (result.players) {
            result.players = result.players.map((p: any) =>
                p.internalId === playerId
                    ? clearWaiverMarkers({
                        ...p,
                        tid: teamId,
                        status: 'Active',
                        contract: {
                            amount: contractAmountThousands,
                            exp: expYear,
                            rookie: false
                        },
                        contractYears: mergedContractYears,
                        // Stamp signing date so autoTrimOversizedRosters won't waive
                        // a guaranteed player soon after signing — breaks the
                        // sign→cut→stretch dead-money snowball.
                        signedDate: stateWithSim.date,
                        tradeEligibleDate,
                        // Explicitly set/clear twoWay per the signing decision —
                        // otherwise a player who was previously on a two-way deal
                        // keeps the flag via `...p`, so even a GUARANTEED re-signing
                        // ships as a two-way contract.
                        twoWay: !!signedAsTwoWay,
                        nonGuaranteed: !!signedAsNG,
                        // Stamp MLE source so TeamFinancesView can color the
                        // contract cell and leagueStats.mleUsage below accounts
                        // for the draw.
                        ...(signedMleType ? { mleSignedVia: signedMleType } : {}),
                    })
                    : p
            );
        } else {
            // Patch directly onto stateWithSim players via result
            result.players = stateWithSim.players.map((p: any) =>
                p.internalId === playerId
                    ? clearWaiverMarkers({
                        ...p,
                        tid: teamId,
                        status: 'Active',
                        contract: {
                            amount: contractAmountThousands,
                            exp: expYear,
                            rookie: false
                        },
                        contractYears: mergedContractYears,
                        // Stamp signing date so autoTrimOversizedRosters won't waive
                        // a guaranteed player soon after signing — breaks the
                        // sign→cut→stretch dead-money snowball.
                        signedDate: stateWithSim.date,
                        tradeEligibleDate,
                        // Explicitly set/clear twoWay per the signing decision —
                        // otherwise a player who was previously on a two-way deal
                        // keeps the flag via `...p`, so even a GUARANTEED re-signing
                        // ships as a two-way contract.
                        twoWay: !!signedAsTwoWay,
                        nonGuaranteed: !!signedAsNG,
                        // Stamp MLE source so TeamFinancesView can color the
                        // contract cell and leagueStats.mleUsage below accounts
                        // for the draw.
                        ...(signedMleType ? { mleSignedVia: signedMleType } : {}),
                    })
                    : p
            );
        }

        // Update leagueStats.mleUsage so the FreeAgents MLE chip + future
        // getMLEAvailability checks reflect what this team has already spent.
        // Each team stores { type, usedUSD } — subsequent signings using the
        // same MLE type stack the usedUSD; signings on a different type are
        // blocked by getMLEAvailability's priorType guard.
        if (signedMleType) {
            const prevLS: any = result.leagueStats ?? stateWithSim.leagueStats;
            const prevUsage = (prevLS?.mleUsage ?? {}) as Record<number, { type: string; usedUSD: number }>;
            const prior = prevUsage[teamId];
            const stackedUSD = prior?.type === signedMleType ? (prior.usedUSD ?? 0) + baseSalaryUSD : baseSalaryUSD;
            result.leagueStats = {
                ...(prevLS ?? {}),
                mleUsage: {
                    ...prevUsage,
                    [teamId]: { type: signedMleType, usedUSD: stackedUSD },
                },
            };
        }

        // Auto news item for the signing (fires regardless of LLM). Override
        // the generic template so the headline + content carry the full
        // contract details — matches the AI-signing news style.
        const signingNewsItem = NewsGenerator.generate('signing_confirmed', stateWithSim.date, {
            playerName: player.name,
            teamName: team.name,
        }, team.logoUrl);
        if (signingNewsItem) {
            const verbHeadline = treatAsResignText ? 'Re-Signs With' : 'Signs With';
            (signingNewsItem as any).headline = `${player.name} ${verbHeadline} ${team.name} — $${totalStr}M/${totalYears}yr${optTag}${twoWayTag}${ngTag}${mleTag}`;
            (signingNewsItem as any).content = `${signingOutcomeText}. The ${totalYears}-year deal carries an annual value of $${annualM.toFixed(1)}M${optTag ? `, with a${optTag.startsWith(' (player') ? ' player' : ' team'} option in the final year` : ''}.`;
            newNews.unshift(signingNewsItem);
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
        
        return result;
    }
};

