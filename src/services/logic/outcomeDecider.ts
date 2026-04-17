import { GameState, NBAPlayer, NBATeam } from "../../types";
import { PlayerService } from "../data/PlayerService";

export interface StatChanges {
    morale: number;
    revenue: number;
    viewership: number;
    legacy: number;
    publicApproval: number;
    ownerApproval: number;
    playerApproval: number;
}

// Logarithmic money impact: bigger amounts matter more, but with diminishing returns
function moneyImpact(amount: number, scale: number = 1): number {
    if (!amount || amount <= 0) return 0;
    return Math.round(Math.log10(Math.max(1, amount / 1000) + 1) * scale * 10) / 10;
}

// Logarithmic duration impact: longer suspensions scale up but diminish
function durationImpact(days: number, scale: number = 1): number {
    if (!days || days <= 0) return 0;
    return Math.round(Math.log2(Math.max(1, days) + 1) * scale * 10) / 10;
}

// Add variance to an outcome value (±fraction of value)
function vary(val: number, fraction: number = 0.2): number {
    const delta = val * fraction * (Math.random() * 2 - 1);
    return Math.round((val + delta) * 10) / 10;
}

export const calculateOutcome = (
    actionType: string,
    payload: any,
    state: GameState
): StatChanges => {
    const changes: StatChanges = {
        morale: 0,
        revenue: 0,
        viewership: 0,
        legacy: 0,
        publicApproval: 0,
        ownerApproval: 0,
        playerApproval: 0,
    };

    switch (actionType) {
        case 'SIGN_FREE_AGENT': {
            const playerService = new PlayerService(state.players);
            const player = playerService.getPlayerById(payload.playerId);
            if (player && player.overallRating >= 55) {
                if (player.born?.loc.includes('Philippines')) {
                    changes.revenue = 1.5;
                }
                if (player.overallRating >= 65) { // BBGM 65+ = All-Star caliber — signing notable player boosts viewership
                    changes.viewership = vary(2, 0.3);
                    changes.publicApproval = vary(3, 0.3);
                }
            }
            break;
        }

        case 'FORCE_TRADE': {
            const isSuperstar = payload.playerOverall >= 68; // BBGM 68+ = franchise/All-Star tier (force-trading these causes bigger backlash)
            changes.morale = isSuperstar ? -10 : vary(-4, 0.3);
            changes.playerApproval = isSuperstar ? vary(-5, 0.3) : vary(-2, 0.3);
            break;
        }

        case 'ADJUST_FINANCIALS':
            if (payload.type === 'LUXURY_TAX') {
                changes.ownerApproval = payload.increase ? -15 : 15;
            } else if (payload.type === 'CAP_INCREASE') {
                changes.playerApproval = payload.increase ? 10 : -10;
                changes.morale = payload.increase ? 5 : -5;
            }
            break;

        case 'SUSPEND_PLAYER': {
            const dur = durationImpact(payload.duration || 3, 1.5);
            changes.morale = -vary(dur, 0.2);
            changes.playerApproval = -vary(dur * 0.8, 0.2);
            changes.publicApproval = vary(dur * 0.4, 0.3);
            break;
        }

        case 'FINE_PERSON': {
            const impact = moneyImpact(payload.amount || 50000, 1);
            changes.playerApproval = -vary(impact * 0.5, 0.2);
            changes.revenue = vary(impact * 0.3, 0.3);
            changes.publicApproval = vary(impact * 0.2, 0.4);
            break;
        }

        case 'BRIBE_PERSON': {
            const impact = moneyImpact(payload.amount || 100000, 1.5);
            changes.ownerApproval = vary(impact * 0.6, 0.3);
            changes.publicApproval = -vary(impact * 0.2, 0.4); // risk of scandal
            break;
        }

        case 'GIVE_MONEY': {
            const impact = moneyImpact(payload.amount || 50000, 1);
            changes.playerApproval = vary(impact * 0.8, 0.3);
            changes.morale = vary(impact * 0.4, 0.3);
            changes.legacy = vary(impact * 0.1, 0.5);
            break;
        }

        case 'DRUG_TEST_PERSON':
            changes.playerApproval = vary(-2, 0.4);
            changes.publicApproval = vary(1, 0.5);
            break;

        case 'SABOTAGE_PLAYER':
            changes.morale = vary(-8, 0.3);
            changes.playerApproval = vary(-6, 0.3);
            changes.publicApproval = -vary(3, 0.4); // if found out
            break;

        case 'LEAK_SCANDAL':
            changes.publicApproval = vary(-5, 0.4);
            changes.viewership = vary(3, 0.4);
            changes.legacy = -vary(2, 0.5);
            break;

        case 'GO_TO_CLUB': {
            changes.publicApproval = vary(1, 0.5);
            changes.morale = vary(2, 0.4);
            break;
        }

        case 'HYPNOTIZE':
            changes.playerApproval = vary(3, 0.4);
            changes.morale = vary(4, 0.3);
            break;

        case 'INVITE_DINNER': {
            const isHighProfile = payload.isHighProfile || (payload.count && payload.count > 3);
            changes.playerApproval = isHighProfile ? vary(5, 0.3) : vary(2, 0.4);
            changes.morale = isHighProfile ? vary(3, 0.3) : vary(1, 0.4);
            break;
        }

        case 'TRANSFER_FUNDS': {
            const impact = moneyImpact(payload.amount || 100000, 1.2);
            changes.ownerApproval = vary(impact * 0.5, 0.3);
            changes.legacy = vary(impact * 0.2, 0.5);
            break;
        }

        case 'INVITE_PERFORMANCE':
            changes.revenue = payload.isHighProfile ? vary(10, 0.3) : vary(2, 0.5);
            changes.viewership = payload.isHighProfile ? vary(3, 0.3) : vary(0.5, 0.5);
            break;

        case 'TRAVEL':
            changes.publicApproval = vary(3, 0.3);
            changes.legacy = vary(1, 0.5);
            break;

        case 'GLOBAL_GAMES':
            changes.revenue = vary(10, 0.2);
            changes.legacy = vary(5, 0.3);
            changes.viewership = vary(2, 0.3);
            break;

        case 'RIG_LOTTERY':
            changes.publicApproval = -20;
            changes.ownerApproval = 20;
            break;

        case 'HYPNOTIC_BROADCAST':
            changes.publicApproval = vary(10, 0.3);
            changes.legacy = vary(5, 0.3);
            break;
    }

    return changes;
};
