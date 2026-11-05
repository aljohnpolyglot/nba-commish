import { GameState, UserAction, NBAPlayer as Player, DraftPick } from '../../../types';
import { executeForcedTrade, executeExecutiveTrade } from '../../../services/tradeService';
import { buildFullDraftSlotMap } from '../../../services/draft/draftClassStrength';
import { generateTPEsFromTrade } from '../../../utils/tradeExceptionUtils';
import { applyTradeToPlayer } from '../../../utils/playerBirdRights';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { validateCBATradeRules, type CBATradeValidationResult } from '../../../utils/cbaTradeRules';
import { consumeBiannualException, recordTeamCapSpaceUse } from '../../../utils/salaryUtils';
import { isEurostashPlayer, transferEurostashRights } from '../../../services/freeAgency/eurostashRights';

export const preProcessAction = async (
    state: GameState,
    action: UserAction,
): Promise<{ stateForSim: GameState; executiveTradeTransaction?: any; actionBlockReason?: string }> => {
    let stateForSim = state;
    let executiveTradeTransaction = null;
    const currentSeason = state.leagueStats?.year ?? new Date().getFullYear();

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
    } else if (action.type === 'EXECUTIVE_TRADE') {
        const _ptCurrentYear = state.leagueStats?.year ?? new Date().getFullYear();
        const knownTeams = [
            ...state.teams,
            ...((state.nonNBATeams ?? [])
                .map(t => resolveAnyTeam(t.tid, state.teams, state.nonNBATeams ?? []))
                .filter((t): t is NonNullable<ReturnType<typeof resolveAnyTeam>> => t !== null)
                .filter(t => !state.teams.some(nba => nba.id === t.id))),
        ];
        const _ptLotterySlots = buildFullDraftSlotMap((state as any).draftLotteryResult, knownTeams);
        const isForced = !!action.payload?.commissionerForced;
        const nbaCapTrade = state.leagueStats.uiMode !== 'pba_isolated'
            && state.leagueStats.uiMode !== 'euro_isolated'
            && state.teams.some(team => team.id === action.payload.teamAId)
            && state.teams.some(team => team.id === action.payload.teamBId);
        let cbaValidation: CBATradeValidationResult | undefined;
        if (!isForced && nbaCapTrade) {
            cbaValidation = validateCBATradeRules({
                teamAId: action.payload.teamAId,
                teamBId: action.payload.teamBId,
                teamAPlayers: state.players.filter(player => action.payload.teamAPlayers.includes(player.internalId)),
                teamBPlayers: state.players.filter(player => action.payload.teamBPlayers.includes(player.internalId)),
                teamAPicks: state.draftPicks.filter(pick => (action.payload.teamAPicks ?? []).includes(pick.dpid)),
                teamBPicks: state.draftPicks.filter(pick => (action.payload.teamBPicks ?? []).includes(pick.dpid)),
                teamACashUSD: action.payload.teamACashUSD ?? 0,
                teamBCashUSD: action.payload.teamBCashUSD ?? 0,
                teams: state.teams,
                players: state.players,
                leagueStats: state.leagueStats,
                currentDate: state.date,
                currentYear: _ptCurrentYear,
            });
            if (!cbaValidation.ok) {
                return {
                    stateForSim: state,
                    actionBlockReason: cbaValidation.reason ?? 'Trade violates current cap rules.',
                };
            }
        }
        const tradeResult = executeExecutiveTrade(
            action.payload,
            state.players,
            knownTeams,
            state.draftPicks,
            _ptCurrentYear,
            _ptLotterySlots,
            state.leagueType,
            state.date,
            state.leagueStats?.uiMode,
        );
        executiveTradeTransaction = tradeResult.transaction;

        let p = [...state.players];
        let d = [...state.draftPicks];

        Object.entries(tradeResult.transaction.teams).forEach(([sourceTidStr, assets]) => {
            const teamAssets = assets as { playersSent: Player[], picksSent: DraftPick[] };
            const destTidStr = Object.keys(tradeResult.transaction.teams).find(id => id !== sourceTidStr);
            if (destTidStr) {
                const destTid = parseInt(destTidStr);
                teamAssets.playersSent.forEach(ps => {
                    p = p.map(player => player.internalId === ps.internalId
                        ? isEurostashPlayer(player)
                            ? transferEurostashRights(player, destTid)
                            : applyTradeToPlayer(player, destTid, currentSeason, 0)
                        : player);
                });
                teamAssets.picksSent.forEach(pick => {
                    d = d.map(dp => dp.dpid === pick.dpid ? { ...dp, tid: destTid } : dp);
                });
            }
        });
        // Generate TPEs for over-cap teams that sent more salary than they received.
        // Skip when commissioner force-overrides cap rules — those are extra-legal anyway.
        const tpeEnabled = state.leagueStats?.tradeExceptionsEnabled !== false;
        let teams = (tpeEnabled && !isForced)
            ? generateTPEsFromTrade(tradeResult.transaction, state.teams, state.players, state.leagueStats, state.date)
            : state.teams;
        // Cash considerations: increment cashUsedInTrades on senders. Resets at season rollover.
        const cashByTid = new Map<number, number>();
        Object.entries(tradeResult.transaction.teams).forEach(([tidStr, assets]) => {
            const cash = (assets as any).cashSentUSD ?? 0;
            if (cash > 0) cashByTid.set(parseInt(tidStr), cash);
        });
        if (cashByTid.size > 0) {
            teams = teams.map(t => {
                const sent = cashByTid.get(t.id);
                if (!sent) return t;
                return { ...t, cashUsedInTrades: (t.cashUsedInTrades ?? 0) + sent };
            });
        }
        let leagueStats = state.leagueStats;
        if (cbaValidation?.teamABaeUsedUSD) {
            leagueStats = consumeBiannualException(leagueStats, {
                teamId: action.payload.teamAId,
                amountUSD: cbaValidation.teamABaeUsedUSD,
                season: currentSeason,
                currentDate: state.date,
            });
        }
        if (cbaValidation?.teamBBaeUsedUSD) {
            leagueStats = consumeBiannualException(leagueStats, {
                teamId: action.payload.teamBId,
                amountUSD: cbaValidation.teamBBaeUsedUSD,
                season: currentSeason,
                currentDate: state.date,
            });
        }
        if (cbaValidation?.teamACapRoomUsedUSD) {
            leagueStats = recordTeamCapSpaceUse(leagueStats, action.payload.teamAId, currentSeason);
        }
        if (cbaValidation?.teamBCapRoomUsedUSD) {
            leagueStats = recordTeamCapSpaceUse(leagueStats, action.payload.teamBId, currentSeason);
        }
        stateForSim = { ...state, players: p, draftPicks: d, teams, leagueStats };
    } else if (action.type === 'FORCE_TRADE') {
        const tradeResult = await executeForcedTrade(
            action.payload,
            state.players,
            state.teams,
            state.draftPicks,
            state.leagueType,
            state.date,
            state.leagueStats?.year,
            state.leagueStats?.uiMode,
        );
        if (tradeResult.transaction) {
            let p = [...state.players];
            let d = [...state.draftPicks];
            
            Object.entries(tradeResult.transaction.teams).forEach(([sourceTidStr, assets]) => {
                const teamAssets = assets as { playersSent: Player[], picksSent: DraftPick[] };
                const destTidStr = Object.keys(tradeResult.transaction.teams).find(id => id !== sourceTidStr);
                if (destTidStr) {
                    const destTid = parseInt(destTidStr);
                    teamAssets.playersSent.forEach(ps => {
                        p = p.map(player => player.internalId === ps.internalId
                            ? applyTradeToPlayer(player, destTid, currentSeason, 0)
                            : player);
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
