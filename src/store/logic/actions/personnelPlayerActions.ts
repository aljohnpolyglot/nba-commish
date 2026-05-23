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


export const handleFirePersonnel = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };

    const person = contacts[0];
    const outcomeText = `${person.name} (${person.title}) has been fired by the NBA Commissioner.`;
    const storySeed = `${person.name}, ${person.title} for ${person.organization}, has been abruptly fired by the Commissioner. The basketball world reacts.`;

    const result = await advanceDay(stateWithSim, {
        type: 'FIRE_PERSONNEL',
        payload: { outcomeText, contacts }
    } as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Update staff state: mark as unemployed
    if (result.staff || stateWithSim.staff) {
        const staff = result.staff || { ...stateWithSim.staff };
        const markUnemployed = (list: any[]) =>
            list.map((s: any) => s.name === person.name ? { ...s, team: 'Unemployed', teamId: -99 } : s);

        result.staff = {
            ...staff,
            gms: markUnemployed(staff.gms || []),
            coaches: markUnemployed(staff.coaches || []),
            owners: markUnemployed(staff.owners || []),
        };
    }

    const currentYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    const orgKey = normalizePersonnelKey(person.organization);
    const targetTeam = [
        ...(result.teams || stateWithSim.teams || []),
        ...((result as any).nonNBATeams || (stateWithSim as any).nonNBATeams || []),
    ].find((team: any) => teamOrganizationKeys(team).includes(orgKey));

    if (targetTeam?.tycoon?.staffMembers?.length) {
        const targetTid = targetTeam.id ?? targetTeam.tid;
        const leagueId = inferEuroStaffLeagueId(targetTid);
        const normalizedRole = normalizeStaffPoolRole(person.title);
        const isNBA = targetTid >= 0 && targetTid < 100;
        let updatedTeams = [...(result.teams || stateWithSim.teams || [])];
        let updatedNonNBATeams = [...((result as any).nonNBATeams || (stateWithSim as any).nonNBATeams || [])];
        let updatedStaffFreeAgents = [...((result as any).staffFreeAgents || stateWithSim.staffFreeAgents || [])];
        const teamCollection = isNBA ? updatedTeams : updatedNonNBATeams;
        const teamIndex = teamCollection.findIndex((team: any) => (team.id ?? team.tid) === targetTid);

        if (teamIndex >= 0) {
            const team = teamCollection[teamIndex];
            const staffMembers = [...(team.tycoon?.staffMembers ?? [])];
            const staffIndex = staffMembers.findIndex((member: any) => {
                const memberRole = normalizeStaffPoolRole(member.role ?? member.position ?? member.jobTitle);
                return normalizePersonnelKey(member.name) === normalizePersonnelKey(person.name)
                    || (normalizedRole && memberRole === normalizedRole);
            });

            if (staffIndex >= 0) {
                const firedMember = staffMembers[staffIndex];
                const firedRole = String(firedMember.role ?? person.title ?? normalizedRole).trim();
                staffMembers.splice(staffIndex, 1);
                updatedStaffFreeAgents.push(
                    toStaffFreeAgent(
                        firedMember,
                        leagueId,
                        `staff-fired-${targetTid}-${firedRole.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(firedMember.name ?? 'staff').replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`,
                    ),
                );

                const shouldAutofill = stateWithSim.gameMode !== 'gm' || targetTid !== stateWithSim.userTeamId;
                const firedRoles = [...(team.tycoon?.firedStaffRoles ?? [])];
                if (!shouldAutofill && !firedRoles.includes(firedRole)) firedRoles.push(firedRole);
                let hiredReplacement: any = null;

                if (shouldAutofill) {
                    const stockedPool = ensureStaffPoolDepth(
                        {
                            ...stateWithSim,
                            teams: updatedTeams,
                            nonNBATeams: updatedNonNBATeams,
                            staffFreeAgents: updatedStaffFreeAgents,
                        } as GameState,
                        leagueId,
                    );
                    updatedStaffFreeAgents = [...(stockedPool.staffFreeAgents ?? updatedStaffFreeAgents)];
                    const replacementRole = normalizeStaffPoolRole(firedRole);
                    const replacementIndex = updatedStaffFreeAgents.findIndex((member: any) => {
                        const memberRole = normalizeStaffPoolRole(member.position ?? member.jobTitle ?? member.role);
                        if (memberRole !== replacementRole) return false;
                        if (member.leagueId && member.leagueId !== leagueId) return false;
                        if (leagueId === 'nba') {
                            const nationality = normalizePersonnelKey(member.nationality);
                            return !nationality || nationality === 'usa' || nationality === 'united states';
                        }
                        return true;
                    });

                    if (replacementIndex >= 0) {
                        const [replacement] = updatedStaffFreeAgents.splice(replacementIndex, 1);
                        hiredReplacement = {
                            ...replacement,
                            role: firedRole,
                            team: getTeamFullName(team),
                            teamLogoUrl: team.logoUrl ?? team.imgURL,
                            position: replacement.position ?? replacement.jobTitle ?? normalizeStaffPoolRole(firedRole),
                            jobTitle: replacement.jobTitle ?? replacement.position ?? normalizeStaffPoolRole(firedRole),
                            contractYears: Math.max(1, Number(replacement.contractYears ?? (firedRole === 'Head Coach' ? 3 : 2))),
                            hiredYear: currentYear,
                            yearsWithTeam: 0,
                        };
                    } else if (isNBA) {
                        hiredReplacement = buildGeneratedNBAStaffForRole(team as any, firedRole, currentYear, 'commissioner-fire');
                    }
                }

                if (hiredReplacement) {
                    staffMembers.push(hiredReplacement);
                    if (result.staff?.coaches?.length && normalizeStaffPoolRole(firedRole) === 'Head Coach') {
                        result.staff = {
                            ...result.staff,
                            coaches: result.staff.coaches.map((coach: any) =>
                                normalizePersonnelKey(coach.name) === normalizePersonnelKey(person.name)
                                    ? {
                                        ...coach,
                                        name: hiredReplacement.name,
                                        team: getTeamFullName(team),
                                        position: 'Head Coach',
                                        jobTitle: 'Head Coach',
                                        playerPortraitUrl: hiredReplacement.playerPortraitUrl ?? coach.playerPortraitUrl,
                                        teamLogoUrl: team.logoUrl ?? team.imgURL ?? coach.teamLogoUrl,
                                    }
                                    : coach,
                            ),
                        };
                    }
                    result.history = [
                        ...(result.history || stateWithSim.history || []),
                        {
                            text: `${getTeamFullName(team)} hired ${hiredReplacement.name} as ${firedRole}.`,
                            date: stateWithSim.date,
                            type: 'Personnel',
                            tid: targetTid,
                        },
                    ];
                }

                teamCollection[teamIndex] = {
                    ...team,
                    tycoon: {
                        ...(team.tycoon ?? {}),
                        staffMembers,
                        firedStaffRoles: hiredReplacement
                            ? firedRoles.filter((role: string) => role !== firedRole)
                            : firedRoles,
                    },
                };

                if (isNBA) result.teams = updatedTeams;
                else (result as any).nonNBATeams = updatedNonNBATeams;
                (result as any).staffFreeAgents = updatedStaffFreeAgents;
            }
        }
    }

    result.statChanges = result.statChanges || {};
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) - 3;

    // Always add a League News item for the firing (fires even when LLM is off)
    const fireNewsItem = {
        id: `fire-news-${Date.now()}`,
        headline: `${person.name} Fired`,
        content: `The Commissioner has fired ${person.name} (${person.title}) from ${person.organization}. The basketball world reacts to the sudden front-office shakeup.`,
        date: stateWithSim.date,
        isNew: true,
        newsType: 'daily' as const,
    };
    result.newNews = [fireNewsItem, ...(result.newNews || [])];

    return result;
};

