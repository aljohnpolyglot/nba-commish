import { GameState, UserAction, NBAPlayer as Player, DraftPick } from '../../../types';
import { executeForcedTrade, executeExecutiveTrade } from '../../../services/tradeService';
import { generateTPEsFromTrade } from '../../../utils/tradeExceptionUtils';

export const preProcessAction = async (state: GameState, action: UserAction): Promise<{ stateForSim: GameState, executiveTradeTransaction?: any }> => {
    let stateForSim = state;
    let executiveTradeTransaction = null;

    if (action.type === 'SABOTAGE_PLAYER') {
        const { contacts, reason, duration } = action.payload;
        const games = parseInt(duration) || 0;
        const playerIds = new Set(contacts.map((p: any) => {
            const id = p.id || p.internalId;
            return typeof id === 'string' ? id.replace('player-', '') : id;
        }));
        stateForSim = {
            ...state,
            players: state.players.map(p => 
                playerIds.has(p.internalId) 
                    ? { ...p, injury: { type: reason, gamesRemaining: games } } 
                    : p
            )
        };
    } else if (action.type === 'SUSPEND_PLAYER') {
        const { contacts, reason, duration } = action.payload;
        const games = parseInt(duration) || 0;
        const playerIds = new Set(contacts.map((p: any) => {
            const id = p.id || p.internalId;
            return typeof id === 'string' ? id.replace('player-', '') : id;
        }));
        stateForSim = {
            ...state,
            players: state.players.map(p => 
                playerIds.has(p.internalId) 
                    ? { ...p, suspension: { reason, gamesRemaining: games } } 
                    : p
            )
        };
    } else if (action.type === 'SIGN_FREE_AGENT') {
        stateForSim = {
            ...state,
            players: state.players.map(p => 
                p.internalId === action.payload.playerId ? { ...p, tid: action.payload.teamId, status: 'Active' } : p
            )
        };
    } else if (action.type === 'EXECUTIVE_TRADE') {
        const tradeResult = executeExecutiveTrade(action.payload, state.players, state.teams, state.draftPicks);
        executiveTradeTransaction = tradeResult.transaction;

        let p = [...state.players];
        let d = [...state.draftPicks];

        Object.entries(tradeResult.transaction.teams).forEach(([sourceTidStr, assets]) => {
            const teamAssets = assets as { playersSent: Player[], picksSent: DraftPick[] };
            const destTidStr = Object.keys(tradeResult.transaction.teams).find(id => id !== sourceTidStr);
            if (destTidStr) {
                const destTid = parseInt(destTidStr);
                teamAssets.playersSent.forEach(ps => {
                    p = p.map(player => player.internalId === ps.internalId ? { ...player, tid: destTid } : player);
                });
                teamAssets.picksSent.forEach(pick => {
                    d = d.map(dp => dp.dpid === pick.dpid ? { ...dp, tid: destTid } : dp);
                });
            }
        });
        // Generate TPEs for over-cap teams that sent more salary than they received.
        // Skip when commissioner force-overrides cap rules — those are extra-legal anyway.
        const tpeEnabled = state.leagueStats?.tradeExceptionsEnabled !== false;
        const isForced = !!action.payload?.commissionerForced;
        const teams = (tpeEnabled && !isForced)
            ? generateTPEsFromTrade(tradeResult.transaction, state.teams, state.players, state.leagueStats, state.date)
            : state.teams;
        stateForSim = { ...state, players: p, draftPicks: d, teams };
    } else if (action.type === 'FORCE_TRADE') {
        const tradeResult = await executeForcedTrade(action.payload, state.players, state.teams, state.draftPicks);
        if (tradeResult.transaction) {
            let p = [...state.players];
            let d = [...state.draftPicks];
            
            Object.entries(tradeResult.transaction.teams).forEach(([sourceTidStr, assets]) => {
                const teamAssets = assets as { playersSent: Player[], picksSent: DraftPick[] };
                const destTidStr = Object.keys(tradeResult.transaction.teams).find(id => id !== sourceTidStr);
                if (destTidStr) {
                    const destTid = parseInt(destTidStr);
                    teamAssets.playersSent.forEach(ps => {
                        p = p.map(player => player.internalId === ps.internalId ? { ...player, tid: destTid } : player);
                    });
                    teamAssets.picksSent.forEach(pick => {
                        d = d.map(dp => dp.dpid === pick.dpid ? { ...dp, tid: destTid } : dp);
                    });
                }
            });
            stateForSim = { ...state, players: p, draftPicks: d };
        }
    }

    return { stateForSim, executiveTradeTransaction };
};
