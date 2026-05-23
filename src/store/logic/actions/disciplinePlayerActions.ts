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

export const handleSuspendPlayer = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason, duration } = action.payload;
    const players = contacts || (action.payload.player ? [action.payload.player] : []);
    if (players.length === 0) return { isProcessing: false };

    const games = parseInt(duration) || 0;
    const playerNames = players.map((p: any) => p.name).join(', ');
    const outcomeText = `The NBA has suspended ${playerNames} for ${games} games. Reason: ${reason}.`;
    const suspendSeed = `BREAKING: The NBA Commissioner just handed ${playerNames} a ${games}-game suspension. Reason: ${reason}. ` +
        `@ShamsCharania breaks it with a detailed tweet covering the incident, the severity of the punishment, and the league's stance. ` +
        `Then generate: one outraged fan defending ${playerNames.split(',')[0]} ("${games} games is way too much"), ` +
        `one fan saying they deserved it or even worse, ` +
        `one analyst debating whether the punishment fits the crime or sets a dangerous precedent, ` +
        `and a reaction from an NBPA rep or player agent questioning the Commissioner's judgment. ` +
        `Make it feel like a real NBA controversy — specific, heated takes.`;

    const outcome = calculateOutcome('SUSPEND_PLAYER', action.payload, stateWithSim);

    const result = await advanceDay(stateWithSim, {
        type: 'SUSPEND_PLAYER',
        payload: {
            outcomeText,
            players,
            reason,
            games
        }
    } as any, [suspendSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    
    // Update player suspension in state
    const playerIds = new Set(players.map((p: any) => p.id || p.internalId));
    result.players = (result.players || stateWithSim.players).map(p => 
        playerIds.has(p.internalId) 
            ? { ...p, suspension: { reason, gamesRemaining: games } } 
            : p
    );

    return result;
};

export const handleDrugTestPerson = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };
    
    const player = contacts[0];
    const outcome = calculateOutcome('DRUG_TEST_PERSON', action.payload, stateWithSim);
    
    // Randomly decide if they fail or pass based on some logic or just random
    const failed = Math.random() < 0.3; // 30% chance of failing for now
    const games = failed ? Math.floor(Math.random() * 10) + 5 : 0;

    let outcomeText = `Mandatory Drug Test for ${player.name}. Reason: ${reason}. Results: Negative (Passed).`;
    if (failed) {
        outcomeText = `Mandatory Drug Test for ${player.name}. Reason: ${reason}. Results: Positive (Failed). The league has suspended them for ${games} games.`;
    }

    const drugTestSeed = failed
        ? `BREAKING: ${player.name} has tested positive in an NBA-mandated drug test. They will be suspended ${games} games. Reason cited: ${reason}. ` +
          `@ShamsCharania breaks it. Then: one shocked fan reacting ("no way, not ${player.name.split(' ')[0]}"), ` +
          `one fan who's not surprised or has a hot take, one analyst on what this means for their team's season, ` +
          `and a response from the player's camp or agent denying or acknowledging the situation.`
        : `The NBA Commissioner ordered a mandatory drug test on ${player.name}. Reason: ${reason}. Results came back CLEAN — negative. ` +
          `Generate: one reporter noting the test was ordered and the result, fans reacting to the Commissioner ordering the test ` +
          `(some suspicious of why they were singled out, some defending the process), ` +
          `and one take questioning whether the Commissioner's use of drug testing is becoming a power move. ` +
          `Make it feel real — people are paying attention to who gets tested and why.`;

    const result = await advanceDay(stateWithSim, {
        type: 'DRUG_TEST_PERSON',
        payload: {
            outcomeText,
            player,
            reason,
            failed,
            games
        }
    } as any, [drugTestSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    
    if (failed) {
        // Update player suspension in state
        result.players = (result.players || stateWithSim.players).map(p => 
            p.internalId === (player.internalId || player.id)
                ? { ...p, suspension: { reason: `Failed Drug Test: ${reason}`, gamesRemaining: games } } 
                : p
        );
    }

    return result;
};


export const handleSabotagePlayer = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason, duration } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };
    
    const games = parseInt(duration) || 0;
    const playerNames = contacts.map((p: any) => p.name).join(', ');
    
    const outcomeText = `Covert Action: Sabotaged ${playerNames}. They will be sidelined for ${games} games.`;
    
    // Inject narrative for LLM to interpret next day
    const storySeed = `URGENT NARRATIVE INJECTION: ${playerNames} ${contacts.length > 1 ? 'have' : 'has'} suffered a ${reason}. The media and fans should react as if this happened naturally during practice or a game. They will be out for ${games} games.`;

    const result = await advanceDay(stateWithSim, {
        type: 'SABOTAGE_PLAYER',
        payload: {
            outcomeText,
            contacts,
            reason,
            games
        }
    } as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Update player injury in state
    const playerIds = new Set(contacts.map((p: any) => p.id || p.internalId));
    result.players = (result.players || stateWithSim.players).map(p => 
        playerIds.has(p.internalId) 
            ? { ...p, injury: { type: reason, gamesRemaining: games } } 
            : p
    );

    return result;
};
