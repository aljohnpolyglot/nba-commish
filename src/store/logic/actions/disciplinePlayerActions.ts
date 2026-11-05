import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { generateFreeAgentSigningReactions } from '../../../services/llm/services/freeAgentService';
import { calculateSocialEngagement, getLeagueCurrencyCode } from '../../../utils/helpers';
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
import { resolveMatchingDisciplineCases } from '../../../services/disciplineInbox';
import { appendPlayerDisciplineRecord } from '../../../services/playerDisciplineHistory';
import { resolveAnyTeam } from '../../../utils/teamLookup';

const markStaffUnavailable = (
    staff: GameState['staff'],
    names: Set<string>,
    games: number,
    reason: string,
) => {
    if (!staff || games <= 0) return staff;
    const mark = (people: any[] | undefined) => (people ?? []).map(person =>
        names.has(String(person.name ?? '').trim())
            ? { ...person, unavailableGames: games, unavailableReason: reason }
            : person
    );
    return {
        ...staff,
        owners: mark(staff.owners),
        gms: mark(staff.gms),
        coaches: mark(staff.coaches),
        leagueOffice: mark(staff.leagueOffice),
        referees: mark(staff.referees),
    };
};

export const handleSuspendPlayer = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const {
        contacts,
        reason,
        duration,
        fineAmount,
        amount,
        sourceIncidentId,
        disciplineTemplateId,
        disciplineTemplateName,
    } = action.payload;
    const players = contacts || (action.payload.player ? [action.payload.player] : []);
    if (players.length === 0) return { isProcessing: false };

    const games = parseInt(duration) || 0;
    const fineAmountUSD = Math.max(0, Number(fineAmount ?? amount) || 0);
    const combinedDiscipline = fineAmountUSD > 0;
    const playerNames = players.map((p: any) => p.name).join(', ');
    const formattedFine = combinedDiscipline
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: getLeagueCurrencyCode(stateWithSim.leagueStats),
            maximumFractionDigits: 0,
        }).format(fineAmountUSD)
        : '';
    const outcomeText = combinedDiscipline
        ? `The league has fined ${playerNames} ${formattedFine} and suspended them for ${games} games. Reason: ${reason}.`
        : `The league has suspended ${playerNames} for ${games} games. Reason: ${reason}.`;
    const outcome = calculateOutcome('SUSPEND_PLAYER', action.payload, stateWithSim);
    const fineOutcome = combinedDiscipline
        ? calculateOutcome('FINE_PERSON', { ...action.payload, amount: fineAmountUSD }, stateWithSim)
        : null;
    const playerIds = new Set<string>(
        players.map((p: any) => String(p.id || p.internalId || '')).filter(Boolean),
    );
    const personNames = new Set<string>(players.map((person: any) => String(person.name ?? '').trim()).filter(Boolean));
    const currencyCode = getLeagueCurrencyCode(stateWithSim.leagueStats);
    const recordSeed = sourceIncidentId
        ?? `${stateWithSim.day}-${stateWithSim.history?.length ?? 0}-${disciplineTemplateId ?? 'custom'}`;
    const updatedPlayers = stateWithSim.players.map(p => {
        if (!playerIds.has(p.internalId)) return p;
        return appendPlayerDisciplineRecord(
            { ...p, suspension: { reason, gamesRemaining: games } },
            {
                id: `discipline-${recordSeed}-${p.internalId}`,
                date: stateWithSim.date,
                season: stateWithSim.leagueStats.year,
                action: combinedDiscipline ? 'fine_and_suspension' : 'suspension',
                amount: combinedDiscipline ? fineAmountUSD : undefined,
                currencyCode: combinedDiscipline ? currencyCode : undefined,
                games,
                reason,
                authority: stateWithSim.gameMode === 'gm' ? 'team' : 'league',
                templateId: disciplineTemplateId,
                templateName: disciplineTemplateName,
                tid: p.tid,
                source: 'game',
            },
        );
    });
    const pendingDisciplineToasts = updatedPlayers
        .filter(player => playerIds.has(player.internalId))
        .map(player => {
            const team = resolveAnyTeam(player.tid, stateWithSim.teams, stateWithSim.nonNBATeams ?? []);
            return {
                playerName: player.name,
                teamName: team ? getTeamFullName(team) : 'League Office',
                pos: player.pos,
                action: combinedDiscipline ? 'fine_and_suspension' as const : 'suspension' as const,
                amount: combinedDiscipline ? fineAmountUSD : undefined,
                currencyCode: combinedDiscipline ? currencyCode : undefined,
                games,
                reason,
                templateId: disciplineTemplateId,
                templateName: disciplineTemplateName,
            };
        });
    return {
        outcomeText,
        players: updatedPlayers,
        pendingDisciplineToasts,
        staff: markStaffUnavailable(stateWithSim.staff, personNames, games, reason),
        inbox: resolveMatchingDisciplineCases(
            stateWithSim.inbox,
            [...playerIds],
            combinedDiscipline ? 'fine_and_suspension' : 'suspension',
            stateWithSim.date,
            combinedDiscipline ? fineAmountUSD : undefined,
            games,
        ),
        statChanges: {
            publicApproval: (outcome.publicApproval || 0) + (fineOutcome?.publicApproval || 0),
            ownerApproval: (outcome.ownerApproval || 0) + (fineOutcome?.ownerApproval || 0),
            playerApproval: (outcome.playerApproval || 0) + (fineOutcome?.playerApproval || 0),
        },
        newNews: [{
            id: `suspension-${stateWithSim.day}-${[...playerIds].join('-')}`,
            headline: combinedDiscipline ? 'League Announces Fine and Suspension' : 'League Announces Suspension',
            content: outcomeText,
            date: stateWithSim.date,
            type: 'league',
            read: false,
        }],
    };
};

export const handleDrugTestPerson = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };
    
    const player = contacts[0];
    const outcome = calculateOutcome('DRUG_TEST_PERSON', action.payload, stateWithSim);
    const playerId = player.internalId || player.id;
    const matchingCase = stateWithSim.inbox.find(email =>
        email.action?.type === 'discipline-case'
        && email.action.status === 'open'
        && email.action.playerIds.includes(playerId),
    );
    const confirmedPeds = matchingCase?.action?.type === 'discipline-case' && matchingCase.action.incidentType === 'peds';
    const failed = confirmedPeds || Math.random() < 0.12;
    const games = failed
        ? confirmedPeds && matchingCase?.action?.type === 'discipline-case'
            ? matchingCase.action.recommendedGames
            : Math.floor(Math.random() * 10) + 5
        : 0;

    let outcomeText = `Mandatory Drug Test for ${player.name}. Reason: ${reason}. Results: Negative (Passed).`;
    if (failed) {
        outcomeText = `Mandatory Drug Test for ${player.name}. Reason: ${reason}. Results: Positive (Failed). The league has suspended them for ${games} games.`;
    }

    const updatedPlayers = failed
        ? stateWithSim.players.map(p =>
            p.internalId === playerId
                ? { ...p, suspension: { reason: `Failed Drug Test: ${reason}`, gamesRemaining: games } } 
                : p
        )
        : stateWithSim.players;
    const personNames = new Set<string>([String(player.name ?? '').trim()].filter(Boolean));
    return {
        outcomeText,
        players: updatedPlayers,
        staff: failed
            ? markStaffUnavailable(stateWithSim.staff, personNames, games, `Failed Drug Test: ${reason}`)
            : stateWithSim.staff,
        inbox: resolveMatchingDisciplineCases(stateWithSim.inbox, [playerId], 'drug_test', stateWithSim.date, undefined, games || undefined),
        statChanges: {
            publicApproval: outcome.publicApproval || 0,
            playerApproval: outcome.playerApproval || 0,
        },
        newNews: [{
            id: `drug-test-${stateWithSim.day}-${playerId}`,
            headline: failed ? 'Player Tests Positive for Banned Substance' : 'Mandatory Drug Test Returns Negative',
            content: outcomeText,
            date: stateWithSim.date,
            type: 'league',
            read: false,
        }],
    };
};


export const handleSabotagePlayer = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason, duration } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };
    
    const games = parseInt(duration) || 0;
    const playerNames = contacts.map((p: any) => p.name).join(', ');
    
    const outcomeText = `Covert Action: Sabotaged ${playerNames}. They will be sidelined for ${games} games.`;
    
    const playerIds = new Set<string>(
        contacts.map((p: any) => String(p.id || p.internalId || '')).filter(Boolean),
    );
    const personNames = new Set<string>(
        contacts.map((person: any) => String(person.name ?? '').trim()).filter(Boolean),
    );
    const players = stateWithSim.players.map(p =>
        playerIds.has(p.internalId) 
            ? { ...p, injury: { type: reason, gamesRemaining: games } } 
            : p
    );
    return {
        outcomeText,
        players,
        staff: markStaffUnavailable(stateWithSim.staff, personNames, games, reason),
        newNews: [{
            id: `player-unavailable-${stateWithSim.day}-${[...playerIds].join('-')}`,
            headline: `${playerNames} Sidelined`,
            content: `${playerNames} will miss approximately ${games} games with ${reason}.`,
            date: stateWithSim.date,
            type: 'league',
            read: false,
        }],
    };
};
