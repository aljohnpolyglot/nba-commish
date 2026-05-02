import { GameState, NBATeam, NBAPlayer as Player, Game } from '../../../types';
import { simulateDayGames } from '../../../services/logic/simulationRunner';
import { applyCupResult } from '../../../services/nbaCup/updateCupStandings';
import { resolveCupGroupStage, advanceKnockoutBracket } from '../../../services/nbaCup/resolveGroupStage';
import { buildKnockoutGames, trimAndPairReplacements, hasCupTBDPlaceholders, materializeTBDSlots } from '../../../services/nbaCup/scheduleInjector';
import { computeCupAwards, applyPrizePool, applyCupAwardsToPlayers } from '../../../services/nbaCup/awards';
import { injectCupGroupGames } from '../../../services/nbaCup/scheduleInjector';
import { calculateTeamStrength, clearTeamStrengthCache } from '../../../utils/playerRatings';
import { normalizeDate, convertTo2KRating, calculateSocialEngagement } from '../../../utils/helpers';
import { addGameDays, compareGameDates, formatGameDateShort, getCurrentOffseasonEffectiveFAStart, getTradeDeadlineDate, isInMoratorium, parseGameDate, toISODateString } from '../../../utils/dateUtils';
import { PlayoffGenerator } from '../../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../../services/playoffs/PlayoffAdvancer';
import { applyDailyProgression, applySeasonalBreakouts } from '../../../services/playerDevelopment/ProgressionEngine';
import { markLightningStrikes, resolveLightningStrikes } from '../../../services/playerDevelopment/seasonalBreakouts';
import { markFatherTimeInjections, resolveFatherTimeInjections, applyMiddleClassBoosts } from '../../../services/playerDevelopment/washedAlgorithm';
import { markBustLottery, resolveBustLottery } from '../../../services/playerDevelopment/bustLottery';
import { generateAIDayTradeProposals, executeAITrade } from '../../../services/AITradeHandler';
import { runAIFreeAgencyRound, runAIMidSeasonExtensions, runAISeasonEndExtensions, autoTrimOversizedRosters, autoPromoteTwoWayExcess, runAIMleUpgradeSwaps, runAIBirdRightsResigns } from '../../../services/AIFreeAgentHandler';
import { tickFAMarkets } from '../../../services/faMarketTicker';
import { routeUnsignedPlayers } from '../../../services/externalSigningRouter';
import { formatExternalSalary } from '../../../constants';
import { applySeasonRollover, shouldFireRollover } from '../../../services/logic/seasonRollover';
import { getActiveUserBidMarketPlayerIds } from '../../../services/freeAgencyBidding';
import { computeTradeEligibleDate } from '../../../utils/signingMoratorium';
import { SettingsManager } from '../../../services/SettingsManager';
import { markTrainingCampShuffle, resolveTrainingCampChanges } from '../../../services/playerDevelopment/trainingCampShuffle';
import { buildShamsTransactionPost } from '../../../services/social/templates/charania';
import { findShamsPhoto } from '../../../services/social/charaniaphotos';
import { normalizeTeamJerseyNumbers } from '../../../utils/jerseyUtils';
import { buildStretchedSchedule, getTeamDeadMoneyForSeason, seasonLabelToYear } from '../../../utils/salaryUtils';
import { isNbaCupEnabled } from '../../../utils/ruleFlags';

const updateTeamStrengths = (teams: NBATeam[], players: Player[]): NBATeam[] => {
    return teams.map(team => ({
        ...team,
        strength: calculateTeamStrength(team.id, players)
    }));
};

const releaseDeclinedExtensionPlayer = (player: Player, currentYear: number): Player => {
    if ((player.contract?.exp ?? currentYear + 1) !== currentYear) {
        return { ...player, midSeasonExtensionDeclined: true } as any;
    }
    return {
        ...player,
        tid: -1,
        status: 'Free Agent' as any,
        midSeasonExtensionDeclined: true,
        twoWay: undefined,
        nonGuaranteed: false,
        gLeagueAssigned: false,
        signedDate: undefined,
        tradeEligibleDate: undefined,
        yearsWithTeam: 0,
    } as any;
};

function applyBirdRightsResignsPass(stateWithSim: GameState): GameState {
    const rawBirdResigns = runAIBirdRightsResigns(stateWithSim);
    // Drop any re-sign for a player with an open user-bid market (last-line guard).
    const userMarketIds = new Set(
        (stateWithSim.faBidding?.markets ?? [])
            .filter((m: any) => !m.resolved && m.bids?.some((b: any) => b.isUserBid && b.status === 'active'))
            .map((m: any) => m.playerId),
    );
    const birdResigns = rawBirdResigns.filter(r => {
        if (userMarketIds.has(r.playerId)) {
            console.error(`[FA-LEAK-GUARD] Dropped Bird-rights re-sign of ${r.playerName} → ${r.teamName} — user has an open bid.`);
            return false;
        }
        return true;
    });
    const firstYear = stateWithSim.leagueStats?.year ?? 2026;
    if (birdResigns.length === 0) {
        return {
            ...stateWithSim,
            leagueStats: { ...(stateWithSim.leagueStats as any), birdRightsResignPassYear: firstYear } as any,
        };
    }

    const currentDay = stateWithSim.day ?? 0;
    const decisionDay = currentDay + 3;
    const markets = [...(stateWithSim.faBidding?.markets ?? [])] as any[];

    for (const r of birdResigns) {
        const team = stateWithSim.teams.find(t => t.id === r.teamId);
        const bid = {
            id: `bird-${r.playerId}-${r.teamId}-${firstYear}`,
            playerId: r.playerId,
            teamId: r.teamId,
            teamName: r.teamName,
            teamLogoUrl: team?.logoUrl,
            salaryUSD: r.salaryUSD,
            years: r.years,
            option: r.hasPlayerOption ? 'PLAYER' : 'NONE',
            isUserBid: false,
            submittedDay: currentDay,
            expiresDay: decisionDay,
            status: 'active',
        };
        const idx = markets.findIndex((m: any) => m.playerId === r.playerId && !m.resolved);
        if (idx >= 0) {
            const existing = markets[idx];
            const hasBid = (existing.bids ?? []).some((b: any) => b.id === bid.id || (b.teamId === r.teamId && b.status === 'active'));
            markets[idx] = {
                ...existing,
                bids: hasBid ? existing.bids : [...(existing.bids ?? []), bid],
                decidesOnDay: Math.max(existing.decidesOnDay ?? decisionDay, decisionDay),
                openedDay: existing.openedDay ?? currentDay,
                openedDate: existing.openedDate ?? stateWithSim.date,
                season: existing.season ?? firstYear,
            };
        } else {
            markets.push({
                playerId: r.playerId,
                playerName: r.playerName,
                bids: [bid],
                decidesOnDay: decisionDay,
                resolved: false,
                season: firstYear,
                openedDay: currentDay,
                openedDate: stateWithSim.date,
            });
        }
    }

    console.log(`[BirdRights] Queued ${birdResigns.length} incumbent re-sign bids into FA markets.`);
    return {
        ...stateWithSim,
        faBidding: { markets: markets as any },
        leagueStats: { ...(stateWithSim.leagueStats as any), birdRightsResignPassYear: firstYear } as any,
    };
}

const normalizeReservedJerseys = (state: GameState, teamIds: Iterable<number>): GameState => {
    const ids = Array.from(new Set(Array.from(teamIds).filter((id): id is number => id >= 0)));
    if (ids.length === 0) return state;
    return {
        ...state,
        players: normalizeTeamJerseyNumbers(state.players as any, state.teams as any, state.leagueStats?.year ?? 2026, {
            history: state.history,
            targetTeamIds: ids,
        }) as any,
    };
};

/** Bracket generation + play-in/round injection, mirroring gameLogic.ts playoff block. */
function applyPlayoffLogic(stateWithSim: GameState, dayResults: any[], numGamesPerRound: number[]): GameState {
    let playoffs = stateWithSim.playoffs;
    let schedule = stateWithSim.schedule;
    const dateNorm = normalizeDate(stateWithSim.date);

    const seasonYear = stateWithSim.leagueStats?.year ?? 2026;
    const playoffStartDateStr = `${seasonYear}-04-13`;
    const playInStartDateStr  = `${seasonYear}-04-15`;

    // 1. Generate bracket on April 13 of the current season year
    if (!playoffs && dateNorm >= playoffStartDateStr) {
        playoffs = PlayoffGenerator.generateBracket(
            stateWithSim.teams,
            stateWithSim.leagueStats.year,
            numGamesPerRound,
            stateWithSim.leagueStats.playIn !== false,
        );
    }

    // 2. Inject play-in games into schedule
    if (playoffs && !playoffs.gamesInjected) {
        const playInStart = new Date(`${playInStartDateStr}T00:00:00Z`);
        const maxGid = Math.max(0, ...schedule.map(g => g.gid));
        const playInGames = PlayoffGenerator.injectPlayInGames(playoffs.playInGames, playInStart, maxGid);
        schedule = [...schedule, ...playInGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        playoffs = { ...playoffs, gamesInjected: true };
    }

    // 3. Advance bracket from today's play-in/playoff results
    if (playoffs && (dayResults.length > 0 || (playoffs.playInComplete && !playoffs.round1Injected))) {
        const playoffResults = dayResults.filter(r => {
            const g = schedule.find(sg => sg.gid === r.gameId);
            return g && (g.isPlayoff || g.isPlayIn);
        });
        if (playoffResults.length > 0 || (playoffs.playInComplete && !playoffs.round1Injected)) {
            const { bracket: newBracket, newGames } = PlayoffAdvancer.advance(playoffs, playoffResults, schedule, numGamesPerRound);
            playoffs = newBracket;
            if (newGames.length > 0) {
                schedule = [...schedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            }
        }
    }

    // 4. Inject loser play-in games when teams become known
    if (playoffs) {
        for (const pig of playoffs.playInGames) {
            if (pig.gameType === 'loserGame' && pig.team1Tid !== -1 && pig.team2Tid !== -1 && !pig.gameId) {
                const maxGid = Math.max(0, ...schedule.map(g => g.gid));
                const playInStart = new Date(`${playInStartDateStr}T00:00:00Z`);
                const dayOffset = pig.conference === 'East' ? 3 : 4;
                const gameDate = addGameDays(playInStart, dayOffset);
                const newGid = maxGid + 1;
                const loserGame: Game = {
                    gid: newGid,
                    homeTid: pig.team1Tid,
                    awayTid: pig.team2Tid,
                    homeScore: 0,
                    awayScore: 0,
                    played: false,
                    date: gameDate.toISOString(),
                    isPlayIn: true,
                    isPlayoff: false,
                    playoffSeriesId: pig.id,
                };
                schedule = [...schedule, loserGame].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                playoffs = {
                    ...playoffs,
                    playInGames: playoffs.playInGames.map(p => p.id === pig.id ? { ...p, gameId: newGid } : p),
                };
            }
        }
    }

    if (playoffs === stateWithSim.playoffs && schedule === stateWithSim.schedule) return stateWithSim;
    return { ...stateWithSim, playoffs, schedule };
}

export const runSimulation = async (state: GameState, daysToSimulate: number, action?: any, onGame?: (result: any) => void) => {
    let stateWithSim = { ...state };

    // Forward-healing normalize: pre-migration saves (or any save that bypassed
    // LOAD_GAME) can carry the 'FreeAgent' (no-space) legacy typo on hundreds of
    // players, making them invisible to every FA signing filter (which compares
    // against 'Free Agent' with a space). One-pass O(n) rewrite per sim batch.
    let hadFreeAgentTypo = false;
    stateWithSim.players = stateWithSim.players.map(p => {
        if ((p as any).status === 'FreeAgent') {
            hadFreeAgentTypo = true;
            return { ...p, status: 'Free Agent' as const };
        }
        return p;
    });
    if (hadFreeAgentTypo) {
        console.log(`[Sim] Normalized 'FreeAgent' → 'Free Agent' on stale player records.`);
    }

    // Clear cache at start of simulation batch
    clearTeamStrengthCache();

    // Pre-calculate strengths once for the batch
    stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);

    let allSimResults: any[] = [];
    let lastDaySimResults: any[] = [];
    const perDayResults: Array<{ date: string; results: any[] }> = [];
    // Set when faMarketTicker reports a user-facing FA event (bid accepted/rejected,
    // RFA offer sheet to decide). Used to break the day loop at end-of-day so the
    // toast/modal fires at the resolution moment instead of after a 7-day batch.
    let userInterrupted = false;

    const effectiveRiggedForTid: number | undefined = action?.payload?.riggedForTid ?? undefined;
    const numGamesPerRound: number[] = state.leagueStats.numGamesPlayoffSeries ?? [7, 7, 7, 7];

    for (let i = 0; i < daysToSimulate; i++) {
        // Advance date FIRST (except on iteration 0 — start from current date)
        if (i > 0) {
            const currentNorm = normalizeDate(stateWithSim.date);
            const nextDate = new Date(`${currentNorm}T00:00:00Z`);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            stateWithSim.date = nextDate.toLocaleDateString('en-US', {
                timeZone: 'UTC',
                month: 'short', day: 'numeric', year: 'numeric'
            });
            stateWithSim.day += 1;
        }

        // Apply playoff/play-in bracket logic before simulating this day's games
        // so that injected play-in/playoff games are in the schedule when simulateDayGames runs.
        stateWithSim = applyPlayoffLogic(stateWithSim, [], numGamesPerRound);

        const simDateNorm = normalizeDate(stateWithSim.date);
        const [, simMonth, simDayNum] = simDateNorm.split('-').map(Number);

        const watchedResult = i === 0 ? action?.payload?.watchedGameResult : undefined;

        // Snapshot user team's pre-sim elimination status
        const preSimUserTeam = stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined
            ? stateWithSim.teams.find(t => t.id === stateWithSim.userTeamId)
            : undefined;

        const simPatch = await simulateDayGames(stateWithSim, watchedResult, effectiveRiggedForTid, onGame);

        const postSimUserTeam = preSimUserTeam
            ? simPatch.teams.find(t => t.id === stateWithSim.userTeamId)
            : undefined;
        const justEliminated = preSimUserTeam?.clinchedPlayoffs !== 'o' && postSimUserTeam?.clinchedPlayoffs === 'o';

        // Collect injury toasts for user team (accumulates across multi-day sim)
        const newInjToasts = (stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined)
            ? simPatch.results
                .flatMap((r: any) => r.injuries ?? [])
                .filter((inj: any) => inj.teamId === stateWithSim.userTeamId && inj.injuryType !== 'Load Management')
                .map((inj: any) => {
                    const player = stateWithSim.players.find(p => p.name === inj.playerName);
                    const team = stateWithSim.teams.find(t => t.id === inj.teamId);
                    return {
                        playerName: inj.playerName,
                        injuryType: inj.injuryType,
                        gamesRemaining: inj.gamesRemaining,
                        pos: (player as any)?.pos ?? '',
                        teamName: team?.name ?? '',
                    };
                })
            : [];

        // Push coach message for star player injuries (>10 games out)
        if (newInjToasts.length > 0) {
            for (const inj of newInjToasts) {
                if (inj.gamesRemaining > 10) {
                    const player = stateWithSim.players.find(p => p.name === inj.playerName);
                    const isAllStar = (player as any)?.allStar;
                    const starTag = isAllStar ? ' one of our guys' : '';
                    const msg = `Tough break—lost ${inj.playerName} for ${inj.gamesRemaining} games (${inj.injuryType}). We might need to hit the market to fill that gap.`;
                    stateWithSim = pushCoachMessage(stateWithSim, msg);
                }
            }
        }

        // Collect feat toasts: own-team GmSc > 30, league-wide GmSc > 50 (trigger only — rendered as narrative card)
        const newFeatToasts: { playerName: string; teamName: string; oppName: string; homeScore: number; awayScore: number; isHome: boolean; won: boolean; pts: number; reb: number; ast: number; isOwnTeam: boolean }[] = [];
        const userTid = stateWithSim.userTeamId;
        for (const r of simPatch.results) {
            if (r.isAllStar || r.isRisingStars) continue;
            const homeTeam = stateWithSim.teams.find(t => t.id === r.homeTeamId);
            const awayTeam = stateWithSim.teams.find(t => t.id === r.awayTeamId);
            const homeWon = (r.homeScore ?? 0) > (r.awayScore ?? 0);
            const sides: { stats: any[]; teamId: number; isHome: boolean; teamName: string; oppName: string; won: boolean }[] = [
                { stats: r.homeStats ?? [], teamId: r.homeTeamId, isHome: true,  teamName: homeTeam?.name ?? '', oppName: awayTeam?.name ?? '', won: homeWon },
                { stats: r.awayStats ?? [], teamId: r.awayTeamId, isHome: false, teamName: awayTeam?.name ?? '', oppName: homeTeam?.name ?? '', won: !homeWon },
            ];
            for (const { stats, teamId, isHome, teamName, oppName, won } of sides) {
                const isOwnTeamSide = stateWithSim.gameMode === 'gm' && teamId === userTid;
                for (const stat of stats) {
                    const gmSc = stat.gameScore ?? 0;
                    const passes = (isOwnTeamSide && gmSc > 30) || (!isOwnTeamSide && gmSc > 50);
                    if (!passes) continue;
                    const pts = stat.pts ?? 0;
                    const reb = stat.reb ?? stat.trb ?? ((stat.orb ?? 0) + (stat.drb ?? 0));
                    const ast = stat.ast ?? 0;
                    newFeatToasts.push({
                        playerName: stat.name, teamName, oppName,
                        homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0,
                        isHome, won, pts, reb, ast,
                        isOwnTeam: isOwnTeamSide,
                    });
                }
            }
        }

        // Track single-game franchise records from sim (per team, per category)
        {
            const statDefs = [
                { cat: 'Points',               key: 'PTS',  get: (s: any) => s.pts ?? 0 },
                { cat: 'Rebounds',             key: 'REB',  get: (s: any) => s.reb ?? s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0)) },
                { cat: 'Assists',              key: 'AST',  get: (s: any) => s.ast ?? 0 },
                { cat: 'Steals',               key: 'STL',  get: (s: any) => s.stl ?? 0 },
                { cat: 'Blocks',               key: 'BLK',  get: (s: any) => s.blk ?? 0 },
                { cat: 'Three-Pointers Made',  key: '3PM',  get: (s: any) => s.threePm ?? 0 },
                { cat: 'Field Goals Made',     key: 'FGM',  get: (s: any) => s.fgm ?? 0 },
                { cat: 'Free Throws Made',     key: 'FTM',  get: (s: any) => s.ftm ?? 0 },
                { cat: 'Turnovers',            key: 'TOV',  get: (s: any) => s.tov ?? 0 },
                { cat: 'Offensive Rebounds',   key: 'OREB', get: (s: any) => s.orb ?? 0 },
                { cat: 'Defensive Rebounds',   key: 'DREB', get: (s: any) => s.drb ?? 0 },
            ];
            const updatedSimRecords: any[] = [...(stateWithSim.simFranchiseRecords ?? [])];
            for (const r of simPatch.results) {
                if ((r.homeTeamId ?? 0) < 0 || (r.awayTeamId ?? 0) < 0) continue;
                const schedGame = stateWithSim.schedule?.find((g: any) => g.gid === r.gameId);
                const isPlayoff = schedGame?.isPlayoff === true;
                const gameDate: string = r.date ?? stateWithSim.date ?? '';
                const rSides = [
                    { stats: r.homeStats ?? [], teamId: r.homeTeamId, oppId: r.awayTeamId },
                    { stats: r.awayStats ?? [], teamId: r.awayTeamId, oppId: r.homeTeamId },
                ];
                for (const { stats, teamId, oppId } of rSides) {
                    const team = stateWithSim.teams.find((t: any) => t.id === teamId);
                    const opp = stateWithSim.teams.find((t: any) => t.id === oppId);
                    if (!team) continue;
                    for (const stat of stats) {
                        for (const { cat, key, get } of statDefs) {
                            const val = get(stat);
                            if (val <= 0) continue;
                            const idx = updatedSimRecords.findIndex(
                                (rec: any) => rec.tid === teamId && rec.category === cat && rec.isPlayoff === isPlayoff,
                            );
                            if (idx === -1 || val > updatedSimRecords[idx].value) {
                                const rec: any = {
                                    tid: teamId, category: cat, isPlayoff, value: val,
                                    NAME: stat.name ?? '', DATE: gameDate,
                                    OPP: opp?.abbrev ?? '', TM: team.abbrev ?? '',
                                    SearchCategory: cat, [key]: String(val),
                                };
                                if (idx === -1) updatedSimRecords.push(rec);
                                else updatedSimRecords[idx] = rec;
                            }
                        }
                    }
                }
            }
            if (updatedSimRecords.length !== (stateWithSim.simFranchiseRecords ?? []).length ||
                updatedSimRecords.some((r, i) => r !== (stateWithSim.simFranchiseRecords ?? [])[i])) {
                stateWithSim = { ...stateWithSim, simFranchiseRecords: updatedSimRecords };
            }
        }

        // Check roster compliance: if still over 15 during regular season, send coach message
        if (stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined) {
            const isRegularSeason = (simMonth === 10 && simDayNum >= 24) || (simMonth >= 11) || (simMonth <= 3);
            if (isRegularSeason) {
                const maxStd = stateWithSim.leagueStats?.maxStandardPlayersPerTeam ?? 15;
                const userRoster = stateWithSim.players.filter(p =>
                    p.tid === stateWithSim.userTeamId && !(p as any).twoWay && p.status === 'Active'
                );
                if (userRoster.length > maxStd) {
                    const excess = userRoster.length - maxStd;
                    const msg = `Boss, we're still over 15 standard players (${userRoster.length} total). We can't sim the regular season like this—need to cut ${excess} player(s).`;
                    stateWithSim = pushCoachMessage(stateWithSim, msg);
                }
            }
        }

        // ── Self-heal: catch saves where Cup groups exist but no Cup games tagged ─
        // Fires once per sim tick, idempotent. Recovers any save that missed the
        // Cup-injection codepath at schedule generation time.
        // Precondition: only self-heal when a real RS schedule already exists.
        // Without this, after Y2 rollover (schedule=[], nbaCup.groups reseeded)
        // we'd inject Cup games into the empty schedule, which then trips the
        // Aug-14 generator's "regular season already exists" guard and the new
        // season never gets a real schedule.
        const hasRegularSeasonGamesSelfHeal = simPatch.schedule.some(
          g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn && !(g as any).isNBACup && !(g as any).isCupTBD
        );
        if (
          hasRegularSeasonGamesSelfHeal &&
          isNbaCupEnabled(stateWithSim.leagueStats) &&
          stateWithSim.nbaCup?.groups?.length &&
          !simPatch.schedule.some(g => (g as any).isNBACup)
        ) {
          const scheduledDates: Record<string, Set<number>> = {};
          for (const g of simPatch.schedule as any[]) {
            const ds = String(g.date).split('T')[0];
            if (!scheduledDates[ds]) scheduledDates[ds] = new Set<number>();
            scheduledDates[ds].add(g.homeTid); scheduledDates[ds].add(g.awayTid);
          }
          const maxGid = Math.max(0, ...simPatch.schedule.map(g => g.gid));
          const prevYr = stateWithSim.leagueStats.year - 1;
          const result = injectCupGroupGames(
            [], maxGid + 1, stateWithSim.nbaCup.groups,
            stateWithSim.saveId || 'default', prevYr, scheduledDates,
            { excludeFromRecord: true },  // retro-injected: don't inflate the 82-game RS
          );
          if (result.games.length > 0) {
            console.log(`[simulationHandler] Self-heal: injected ${result.games.length} Cup games`);
            simPatch.schedule = [...simPatch.schedule, ...result.games].sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            );
          }
        }

        // ── NBA Cup standings + phase transitions ────────────────────────────
        if (isNbaCupEnabled(stateWithSim.leagueStats) && stateWithSim.nbaCup && simPatch.results.length > 0) {
            let cup = stateWithSim.nbaCup;
            let schedule = simPatch.schedule;

            for (const res of simPatch.results) {
                const game = schedule.find(g => g.gid === res.gameId);
                if (!game?.isNBACup) continue;
                const updated = applyCupResult(cup, game, res);
                if (updated) cup = updated;
            }

            // Check group stage completion
            if (cup.status === 'group') {
                const totalGroupGames = cup.groups.length * 10; // C(5,2)=10 per group
                const playedGroupGames = schedule.filter(g => g.isNBACup && g.nbaCupRound === 'group' && g.played).length;
                if (playedGroupGames >= totalGroupGames) {
                    cup = resolveCupGroupStage(cup, schedule, stateWithSim.saveId ?? 'default', stateWithSim.teams);
                    const prevYr = stateWithSim.leagueStats.year - 1;
                    const qfMatchups = cup.knockout
                        .filter(k => k.round === 'QF' && k.tid1 >= 0 && k.tid2 >= 0)
                        .map(k => ({ tid1: k.tid1, tid2: k.tid2 }));
                    const qfTeams = qfMatchups.flatMap(m => [m.tid1, m.tid2]);

                    if (hasCupTBDPlaceholders(schedule)) {
                        // New-saves path: convert pre-baked Dec 9-11 TBD slots
                        // into real QF games (advancers) and paired RS games
                        // (non-advancers). No trimming needed — every team
                        // already has exactly 81 RS pre-baked + 1 TBD slot.
                        // Switch SF to bonus-only (matching real NBA) so the
                        // later buildKnockoutGames call tags SF as excludeFromRecord.
                        for (const ko of cup.knockout) {
                            if (ko.round === 'SF') ko.countsTowardRecord = false;
                        }
                        const koSet = new Set(qfTeams);
                        const allTids = stateWithSim.teams.filter(t => t.id >= 0 && t.id < 100).map(t => t.id);
                        const nonKOTeams = allTids.filter(t => !koSet.has(t));
                        const startGid = Math.max(0, ...schedule.map(g => g.gid)) + 1;
                        const r = materializeTBDSlots(
                            schedule, qfMatchups, nonKOTeams, prevYr,
                            stateWithSim.saveId ?? 'default', startGid,
                        );
                        schedule = r.schedule;
                        for (const ko of cup.knockout) {
                            if (ko.round !== 'QF' || ko.tid1 < 0 || ko.tid2 < 0) continue;
                            const key = `${Math.min(ko.tid1, ko.tid2)}-${Math.max(ko.tid1, ko.tid2)}`;
                            const gid = r.qfGameIds.get(key);
                            if (gid !== undefined) ko.gameId = gid;
                        }
                    } else {
                        // Legacy saves: original post-hoc trim+swap path.
                        const maxGid = Math.max(0, ...schedule.map(g => g.gid));
                        const newGames = buildKnockoutGames(cup.knockout, maxGid, prevYr);
                        schedule = [...schedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        for (const ng of newGames) {
                            const ko = cup.knockout.find(k => k.round === ng.nbaCupRound && k.gameId === undefined && ng.homeTid === k.tid1);
                            if (ko) ko.gameId = ng.gid;
                        }
                        if (qfTeams.length > 0) {
                            const nextGid = Math.max(0, ...schedule.map(g => g.gid)) + 1;
                            const r = trimAndPairReplacements(schedule, qfTeams, `${prevYr}-12-09`, nextGid);
                            schedule = r.schedule;
                        }
                    }
                }
            }

            // After QFs, advance bracket (fill SF/Final tids)
            if (cup.status === 'knockout') {
                cup = advanceKnockoutBracket(cup);
                // If new SF/Final slots just got teams, inject those games
                const newKOGames: Game[] = [];
                // Compute a running maxGid across the loop — each call to
                // buildKnockoutGames re-derives gid from `existingMaxGid + 1`,
                // so without bumping the running max each iteration we'd hand
                // the same gid to every injected SF/Final game. That was the
                // root cause of "Final: OKC vs OKC" — two SFs got the same
                // gid, applyKnockoutResult set both winnerTids to the same
                // team, and the Final inherited that team on both sides.
                let runningMaxGid = Math.max(0, ...schedule.map(g => g.gid));
                const prevYr = stateWithSim.leagueStats.year - 1;
                for (const ko of cup.knockout) {
                    if (ko.tid1 >= 0 && ko.tid2 >= 0 && !ko.gameId) {
                        const injected = buildKnockoutGames([ko], runningMaxGid, prevYr);
                        if (injected[0]) {
                            newKOGames.push(...injected);
                            ko.gameId = injected[0].gid;
                            runningMaxGid = injected[0].gid;
                        }
                    }
                }
                if (newKOGames.length > 0) {
                    schedule = [...schedule, ...newKOGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    // SF/Final policy:
                    //   New saves: SF was already flipped to countsTowardRecord:false
                    //   at group-resolve time, so SF games came in tagged
                    //   excludeFromRecord. No trim needed.
                    //   Legacy saves: original "trim 1 RS + swap" for SF so
                    //   in-flight seasons stay at 82-W/L.
                    const sfJustInjected = newKOGames
                        .filter((g: any) => g.nbaCupRound === 'SF' && !g.excludeFromRecord)
                        .flatMap((g: any) => [g.homeTid, g.awayTid]);
                    if (sfJustInjected.length > 0) {
                        const nextGid = Math.max(0, ...schedule.map(g => g.gid)) + 1;
                        const r = trimAndPairReplacements(schedule, sfJustInjected, `${prevYr}-12-13`, nextGid);
                        schedule = r.schedule;
                    }
                }
            }

            // Final completed — compute awards + write them to player.awards
            let cupPlayersPatch: Player[] | null = null;
            if (cup.status === 'complete' && !cup.mvpPlayerId) {
                cup = computeCupAwards(cup, schedule, stateWithSim.boxScores ?? [], stateWithSim.players);
                cup = applyPrizePool(cup, stateWithSim.leagueStats.cupPrizePoolEnabled !== false);
                cupPlayersPatch = applyCupAwardsToPlayers(cup, stateWithSim.players);
            }

            stateWithSim = { ...stateWithSim, nbaCup: cup, schedule, ...(cupPlayersPatch ? { players: cupPlayersPatch } : {}) };
            simPatch.schedule = schedule;
        }

        stateWithSim = {
            ...stateWithSim,
            teams: simPatch.teams,
            schedule: simPatch.schedule,
            ...(simPatch.headToHead ? { headToHead: simPatch.headToHead } : {}),
            ...(justEliminated ? { pendingElimToast: true } : {}),
            ...(newInjToasts.length > 0 ? { pendingInjuryToasts: [...(stateWithSim.pendingInjuryToasts ?? []), ...newInjToasts] } : {}),
            ...(newFeatToasts.length > 0 ? { pendingFeatToasts: [...(stateWithSim.pendingFeatToasts ?? []), ...newFeatToasts] } : {}),
        };

        allSimResults.push(...simPatch.results);
        perDayResults.push({ date: stateWithSim.date, results: simPatch.results });

        if (i === daysToSimulate - 1) {
            lastDaySimResults = simPatch.results;
        }

        // Advance playoff bracket after today's results (handles play-in advancement + round injection)
        if (simPatch.results.length > 0) {
            stateWithSim = applyPlayoffLogic(stateWithSim, simPatch.results, numGamesPerRound);
        }

        // Seasonal events — fire once on Oct 1 (preseason) each year
        // Breakouts, late bloomers, bust accelerations — BBGM-style draft unpredictability
        const simDateForEvents = normalizeDate(stateWithSim.date);
        const seasonStartDate = `${stateWithSim.leagueStats.year - 1}-10-01`;
        if (simDateForEvents === seasonStartDate) {
            const { players: playersWithEvents, events } = applySeasonalBreakouts(
                stateWithSim.players,
                stateWithSim.leagueStats.year,
                stateWithSim.saveId ?? 'default',
            );
            stateWithSim = { ...stateWithSim, players: playersWithEvents };
            if (events.length > 0) {
                const eventNews = events.map(e => ({
                    id: `seasonal-${e.playerId}-${stateWithSim.leagueStats.year}`,
                    headline: e.type === 'breakout'
                        ? `${e.playerName} Turns Heads in Training Camp with Breakout ${e.attr.toUpperCase()} Improvement`
                        : e.type === 'late_bloomer'
                        ? `${e.playerName} Showing Surprising Development Heading Into Season`
                        : `Concerns Emerge Around ${e.playerName}'s ${e.attr.toUpperCase()} in Camp`,
                    content: e.type === 'breakout'
                        ? `${e.playerName} has shown significant improvement in ${e.attr} (+${e.delta}) during the offseason. Could be a steal.`
                        : e.type === 'late_bloomer'
                        ? `At ${stateWithSim.players.find(p => p.internalId === e.playerId)?.age ?? '??'}, ${e.playerName} is reportedly showing improved ${e.attr} (+${e.delta}). Late bloomers do exist.`
                        : `${e.playerName}'s ${e.attr} has regressed (${e.delta}) heading into camp. High expectations may need to be tempered.`,
                    date: stateWithSim.date,
                    type: 'player' as const,
                    isNew: true,
                    read: false,
                }));
                stateWithSim = {
                    ...stateWithSim,
                    news: [...eventNews, ...(stateWithSim.news ?? [])].slice(0, 200),
                };
            }
        }

        // ── Season Preview unlock (Oct 1) ────────────────────────────────────────
        // Show Season Preview when training camp opens. Rosters are finalized:
        // cuts, FA signings, and external routing are done.
        const prePreseasonDate = `${stateWithSim.leagueStats.year - 1}-10-01`;
        if (simDateForEvents === prePreseasonDate) {
            if (stateWithSim.seasonPreviewDismissed && (stateWithSim.seasonHistory ?? []).length > 0) {
                stateWithSim = { ...stateWithSim, seasonPreviewDismissed: false };
            }

            // ── LOYAL graceful retirement (end of training camp window) ──────────
            // LOYAL players 30+ with 3+ YOS who reached Oct 1 unsigned (prior team
            // didn't re-sign them) retire rather than join another franchise.
            {
                const retireYear = stateWithSim.leagueStats.year;
                const protectedFAMarketPlayerIds = getActiveUserBidMarketPlayerIds(stateWithSim);
                const loyalRetirees: Player[] = [];
                const loyalRetiredPlayers = stateWithSim.players.map(p => {
                    if (p.tid >= 0) return p;
                    if ((p as any).status !== 'Free Agent') return p;
                    if (protectedFAMarketPlayerIds.has(p.internalId)) return p;
                    if ((p as any).diedYear) return p;
                    const traits: string[] = (p as any).moodTraits ?? [];
                    if (!traits.includes('LOYAL')) return p;
                    const age = p.born?.year ? retireYear - p.born.year : (p.age ?? 0);
                    if (age < 30) return p;
                    const yearsOfService = ((p as any).stats ?? [])
                        .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
                    if (yearsOfService < 3) return p;
                    // Determine prior team name for the retirement message
                    const txns: Array<{ season: number; tid: number }> = (p as any).transactions ?? [];
                    const priorTidFromTxn = txns.length > 0
                        ? [...txns].sort((a, b) => b.season - a.season).find(t => t.tid >= 0 && t.tid <= 29)?.tid ?? -1
                        : -1;
                    const statsTid = ((p as any).stats ?? [])
                        .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
                        .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))[0]?.tid ?? -1;
                    const priorTid = priorTidFromTxn >= 0 ? priorTidFromTxn : statsTid;
                    if (priorTid < 0) return p; // no prior NBA team — not eligible for this gate
                    loyalRetirees.push(p);
                    return {
                        ...p,
                        status: 'Retired' as const,
                        tid: -1,
                        retiredYear: retireYear,
                        contract: undefined,
                    } as any;
                });
                if (loyalRetirees.length > 0) {
                    stateWithSim = { ...stateWithSim, players: loyalRetiredPlayers };
                    const loyalRetireHistory = loyalRetirees.map(p => {
                        const txns2: Array<{ season: number; tid: number }> = (p as any).transactions ?? [];
                        const priorTid2 = txns2.length > 0
                            ? [...txns2].sort((a, b) => b.season - a.season).find(t => t.tid >= 0 && t.tid <= 29)?.tid ?? -1
                            : ((p as any).stats ?? [])
                                .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
                                .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))[0]?.tid ?? -1;
                        const priorTeamName2 = stateWithSim.teams.find(t => t.id === priorTid2)?.name ?? 'their former team';
                        return {
                            text: `${p.name} has retired rather than sign with another team — a career ${priorTeamName2}.`,
                            date: stateWithSim.date,
                            type: 'Retirement',
                            playerIds: [p.internalId],
                        };
                    });
                    const loyalRetireNews = loyalRetirees.slice(0, 3).map((p, i) => {
                        const txns3: Array<{ season: number; tid: number }> = (p as any).transactions ?? [];
                        const priorTid3 = txns3.length > 0
                            ? [...txns3].sort((a, b) => b.season - a.season).find(t => t.tid >= 0 && t.tid <= 29)?.tid ?? -1
                            : ((p as any).stats ?? [])
                                .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
                                .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))[0]?.tid ?? -1;
                        const priorTeamName3 = stateWithSim.teams.find(t => t.id === priorTid3)?.name ?? 'their former team';
                        return {
                            id: `loyal-retire-${p.internalId}-${Date.now()}-${i}`,
                            headline: `${p.name} Retires a ${priorTeamName3}`,
                            content: `${p.name} has announced retirement rather than sign with another franchise. A loyal servant to the ${priorTeamName3}.`,
                            date: stateWithSim.date,
                            type: 'roster' as const,
                            isNew: true,
                            read: false,
                        };
                    });
                    stateWithSim = {
                        ...stateWithSim,
                        news: [...loyalRetireNews, ...(stateWithSim.news ?? [])].slice(0, 200),
                        history: [...(stateWithSim.history ?? []), ...loyalRetireHistory],
                    };
                }
            }

            // ── External league routing (end of summer FA window) ─────────────────
            // Any remaining unsigned NBA-caliber FAs are routed to Euroleague/G-League/PBA.
            const protectedFAMarketPlayerIds = getActiveUserBidMarketPlayerIds(stateWithSim);
            const { results: routedResults, players: routedPlayers } = routeUnsignedPlayers(stateWithSim, {
                protectedPlayerIds: protectedFAMarketPlayerIds,
            });
            if (routedResults.length > 0) {
                stateWithSim = { ...stateWithSim, players: routedPlayers };
                const routingNews = routedResults.slice(0, 5).map((r, i) => {
                    const isDomestic = r.league === 'G-League';
                    const salaryStr = r.salaryUSD ? formatExternalSalary(r.salaryUSD, r.league) + '/yr' : '';
                    return {
                        id: `ext-route-${r.playerId}-${Date.now()}-${i}`,
                        headline: `${r.playerName} Signs ${isDomestic ? 'with' : 'Overseas with'} ${r.teamName}`,
                        content: `Unable to land an NBA deal, ${r.playerName} has signed with ${r.teamName} in the ${r.league}${salaryStr ? ' for ' + salaryStr : ''}.`,
                        date: stateWithSim.date,
                        type: 'roster' as const,
                        isNew: true,
                        read: false,
                    };
                });
                const routingHistory = routedResults.map(r => {
                    const isDomestic = r.league === 'G-League';
                    const salaryStr = r.salaryUSD ? formatExternalSalary(r.salaryUSD, r.league) + '/yr' : '';
                    return {
                        text: `${r.playerName} signs ${isDomestic ? 'with' : 'overseas with'} ${r.teamName} (${r.league})${salaryStr ? ': ' + salaryStr : ''}.`,
                        date: stateWithSim.date,
                        type: 'Signing',
                        league: r.league,
                        playerIds: [r.playerId],
                    };
                });
                stateWithSim = {
                    ...stateWithSim,
                    news: [...routingNews, ...(stateWithSim.news ?? [])].slice(0, 200),
                    history: [...(stateWithSim.history ?? []), ...routingHistory],
                };
            }
        }

        // ── Training Camp (Oct 1) ─────────────────────────────────────────────────
        // Mark lightning strikes (60 young players, spread across season) + Father Time (50 vets, spread Mar 15 → May 1)
        // + Middle-class boosts batch 0 (15 players aged 25-29, immediate, silent)
        const trainingCampDate = `${stateWithSim.leagueStats.year - 1}-10-01`;
        if (simDateForEvents === trainingCampDate) {
            const currentYear = stateWithSim.leagueStats.year;

            // Mark lightning strikes — dates spread Oct 1 → Apr 1, resolve silently daily
            const { players: p1 } = markLightningStrikes(
                stateWithSim.players, currentYear,
                trainingCampDate, `${currentYear}-04-01`,
                stateWithSim.saveId ?? 'default',
            );
            stateWithSim = { ...stateWithSim, players: p1 };

            // Father Time injections — decline locked in, resolves across a window
            // Spread due dates Mar 15 → May 1 so declines don't all hit on the same day.
            // markFatherTimeInjections assigns each player a per-player seeded due date in that window.
            const ftWindowStart = `${currentYear}-03-15`;
            const ftWindowEnd   = `${currentYear}-05-01`;
            const { players: p2 } = markFatherTimeInjections(
                stateWithSim.players, currentYear,
                trainingCampDate, ftWindowEnd,
                stateWithSim.saveId ?? 'default',
                ftWindowStart,
            );
            stateWithSim = { ...stateWithSim, players: p2 };

            // Middle-class prime boosts batch 0 — immediate, silent
            const { players: p3 } = applyMiddleClassBoosts(stateWithSim.players, currentYear, 0, stateWithSim.saveId ?? 'default');
            stateWithSim = { ...stateWithSim, players: p3 };

            // Bust lottery — sophomore slumps, unfulfilled potential, contract hangovers
            const { players: pBust } = markBustLottery(
                stateWithSim.players, currentYear,
                trainingCampDate, `${currentYear}-04-01`,
                stateWithSim.saveId ?? 'default',
            );
            stateWithSim = { ...stateWithSim, players: pBust };

            // Training camp shuffle — 1/3 progress, 1/3 stale, 1/3 regress
            // Gradual: due dates spread Oct 1 → Oct 23 (pre-tipoff)
            const campEnd = `${currentYear - 1}-10-23`;
            const { players: pCamp } = markTrainingCampShuffle(
                stateWithSim.players, currentYear,
                trainingCampDate, campEnd,
                stateWithSim.saveId ?? 'default',
            );
            stateWithSim = { ...stateWithSim, players: pCamp };
        }

        // ── Post All-Star (Feb 17) ────────────────────────────────────────────────
        // Middle-class boosts batch 1 (15 more players aged 25-29, immediate, silent)
        const postAsbDate = `${stateWithSim.leagueStats.year}-02-17`;
        if (simDateForEvents === postAsbDate) {
            const { players: p4 } = applyMiddleClassBoosts(
                stateWithSim.players, stateWithSim.leagueStats.year, 1, stateWithSim.saveId ?? 'default',
            );
            stateWithSim = { ...stateWithSim, players: p4 };
        }

        // ── Daily: resolve lightning strikes + Father Time injections (silent) ────
        {
            const currentYear = stateWithSim.leagueStats.year;

            const { players: p5 } = resolveLightningStrikes(stateWithSim.players, simDateForEvents, currentYear);
            stateWithSim = { ...stateWithSim, players: p5 };

            const { players: p6 } = resolveFatherTimeInjections(stateWithSim.players, simDateForEvents, currentYear);
            stateWithSim = { ...stateWithSim, players: p6 };

            const { players: p7 } = resolveBustLottery(stateWithSim.players, simDateForEvents, currentYear);
            stateWithSim = { ...stateWithSim, players: p7 };

            // Training camp shuffle — resolve pending camp boosts whose dueDate <= today
            const { players: pCampResolve } = resolveTrainingCampChanges(stateWithSim.players, simDateForEvents, currentYear);
            stateWithSim = { ...stateWithSim, players: pCampResolve };
        }

        // Daily player progression — stagnates during playoffs
        const isPlayoffDay = !!(stateWithSim.playoffs && !stateWithSim.playoffs.bracketComplete);
        stateWithSim = {
            ...stateWithSim,
            players: applyDailyProgression(
                stateWithSim.players,
                isPlayoffDay,
                stateWithSim.date,
                stateWithSim.leagueStats.year,
            ),
        };

        // Mid-season extensions — every 14 days Oct–Feb (before trade deadline)
        // Players expiring this summer get offered extensions based on mood.
        const [, extMonth] = normalizeDate(stateWithSim.date).split('-').map(Number);
        const isExtensionWindow = extMonth >= 10 || extMonth <= 2; // Oct–Feb
        if (!isPlayoffDay && isExtensionWindow && stateWithSim.day % 14 === 0) {
            const extensions = runAIMidSeasonExtensions(stateWithSim);
            if (extensions.length > 0) {
                const acceptedIds  = new Set(extensions.filter(e => !e.declined).map(e => e.playerId));
                const declinedIds  = new Set(extensions.filter(e => e.declined).map(e => e.playerId));
                const extMap       = new Map(extensions.map(e => [e.playerId, e]));

                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p => {
                        if (acceptedIds.has(p.internalId)) {
                            const ext = extMap.get(p.internalId)!;
                            // Extension kicks in the season AFTER the current one — the player
                            // is still playing out his existing deal this year. Using
                            // leagueStats.year (= current season) would overwrite THIS year's
                            // salary with the new annual amount, which is what caused re-signings
                            // to retroactively inflate the current-season payroll.
                            const extBaseYear = (stateWithSim.leagueStats?.year ?? 2026) + 1;
                            const extContractYears = Array.from({ length: ext.newYears ?? 1 }, (_, i) => {
                                const yr = extBaseYear + i;
                                return {
                                    season: `${yr - 1}-${String(yr).slice(-2)}`,
                                    guaranteed: Math.round(ext.newAmount * 1_000_000 * Math.pow(1.05, i)),
                                    option: (i === (ext.newYears ?? 1) - 1 && ext.hasPlayerOption) ? 'Player' : '',
                                };
                            });
                            // Keep current-season and earlier contractYears untouched — the
                            // extension only writes new entries for currentYear+1 onward.
                            const existingThroughCurrent = ((p as any).contractYears ?? []).filter((cy: any) => {
                                const yr = seasonLabelToYear(cy.season);
                                return yr < extBaseYear;
                            });
                            return {
                                ...p,
                                // Preserve current-season contract.amount — only exp advances.
                                contract: { ...p.contract, exp: ext.newExp },
                                contractYears: [...existingThroughCurrent, ...extContractYears],
                                // An extension is a standard deal by definition — clear any
                                // lingering two-way flag so the player counts against the 15-man
                                // roster and future promotions don't pick them up again.
                                twoWay: false,
                            };
                        }
                        if (declinedIds.has(p.internalId)) {
                            return releaseDeclinedExtensionPlayer(p, stateWithSim.leagueStats?.year ?? 2026);
                        }
                        return p;
                    }),
                };

                // Log extensions to history — stagger dates across the 14-day window
                // so they don't all show as the same day in TransactionsView.
                const baseDate = parseGameDate(stateWithSim.date);
                const extHistoryEntries = extensions.filter(e => !e.declined).map((e, idx) => {
                    const totalM = Math.round(e.newAmount * (e.newYears ?? 1));
                    const optTag = e.hasPlayerOption ? ' (player option)' : '';
                    // Seed offset per player (0–13 days) so each signing has a unique date
                    let playerSeed = 0;
                    for (let ci = 0; ci < e.playerId.length; ci++) playerSeed += e.playerId.charCodeAt(ci);
                    const dayOffset = playerSeed % 14;
                    const entryDate = addGameDays(baseDate, -dayOffset);
                    const dateStr = formatGameDateShort(entryDate);
                    return {
                        text: `${e.playerName} has re-signed with the ${e.teamName}: $${totalM}M/${e.newYears ?? 1}yr${optTag}${e.contractLabel ? ` (${e.contractLabel})` : ''}`,
                        date: dateStr,
                        type: 'Signing',
                        playerIds: [e.playerId],
                        tid: e.teamId,
                    };
                });
                // Shams posts for notable extensions (K2 ≥ 78)
                const shamsExtPosts: any[] = [];
                for (const e of extensions.filter(ex => !ex.declined)) {
                    const player = stateWithSim.players.find(p => p.internalId === e.playerId);
                    if (!player) continue;
                    const lr = (player as any).ratings?.[(player as any).ratings?.length - 1];
                    const k2 = convertTo2KRating(player.overallRating ?? 0, lr?.hgt ?? 50, lr?.tp);
                    if (k2 < 78) continue;
                    const content = buildShamsTransactionPost({
                        type: 'extension',
                        playerName: e.playerName,
                        teamName: e.teamName,
                        amount: e.newAmount,
                        years: e.newYears ?? 1,
                        hasPlayerOption: e.hasPlayerOption,
                    });
                    if (!content) continue;
                    const engagement = calculateSocialEngagement('@ShamsCharania', content, player.overallRating);
                    shamsExtPosts.push({
                        id: `shams-ext-${e.playerId}-${Date.now()}-${Math.random()}`,
                        author: 'Shams Charania', handle: '@ShamsCharania', content,
                        date: new Date(stateWithSim.date).toISOString(),
                        likes: engagement.likes, retweets: engagement.retweets,
                        source: 'TwitterX' as const, isNew: true,
                        playerPortraitUrl: player.imgURL,
                    });
                }
                if (extHistoryEntries.length > 0 || shamsExtPosts.length > 0) {
                    stateWithSim = {
                        ...stateWithSim,
                        history: [...(stateWithSim.history ?? []), ...extHistoryEntries],
                        socialFeed: shamsExtPosts.length > 0
                            ? [...shamsExtPosts, ...(stateWithSim.socialFeed ?? [])].slice(0, 500)
                            : (stateWithSim.socialFeed ?? []),
                    };
                }
            }
        }

        // Season-end extensions — May–June (after awards, before rollover)
        // Rotation+ players on AI teams with expiring contracts get a last-chance offer.
        const isSeasonEndExtWindow = extMonth === 5 || extMonth === 6;
        if (!isPlayoffDay && isSeasonEndExtWindow && stateWithSim.day % 7 === 0) {
            const endExts = runAISeasonEndExtensions(stateWithSim);
            if (endExts.length > 0) {
                const acceptedEE = new Set(endExts.filter(e => !e.declined).map(e => e.playerId));
                const declinedEE = new Set(endExts.filter(e => e.declined).map(e => e.playerId));
                const eeMap      = new Map(endExts.map(e => [e.playerId, e]));
                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p => {
                        if (acceptedEE.has(p.internalId)) {
                            const ext = eeMap.get(p.internalId)!;
                            // May/Jun window — player's current deal expires at end of this
                            // season. Extension starts NEXT season so current-year salary and
                            // the corresponding contractYears entry stay put.
                            const eeBaseYear = (stateWithSim.leagueStats?.year ?? 2026) + 1;
                            const eeContractYears = Array.from({ length: ext.newYears ?? 1 }, (_, i) => {
                                const yr = eeBaseYear + i;
                                return {
                                    season: `${yr - 1}-${String(yr).slice(-2)}`,
                                    guaranteed: Math.round(ext.newAmount * 1_000_000 * Math.pow(1.05, i)),
                                    option: (i === (ext.newYears ?? 1) - 1 && ext.hasPlayerOption) ? 'Player' : '',
                                };
                            });
                            const existingThroughCurrent = ((p as any).contractYears ?? []).filter((cy: any) => {
                                const yr = seasonLabelToYear(cy.season);
                                return yr < eeBaseYear;
                            });
                            return {
                                ...p,
                                contract: { ...p.contract, exp: ext.newExp },
                                contractYears: [...existingThroughCurrent, ...eeContractYears],
                            };
                        }
                        if (declinedEE.has(p.internalId)) return releaseDeclinedExtensionPlayer(p, stateWithSim.leagueStats?.year ?? 2026);
                        return p;
                    }),
                };
                const eeHistoryEntries = endExts.filter(e => !e.declined).map(e => {
                    const totalM = Math.round(e.newAmount * (e.newYears ?? 1));
                    const optTag = e.hasPlayerOption ? ' (player option)' : '';
                    return { text: `${e.playerName} re-signs with ${e.teamName} before free agency: $${totalM}M/${e.newYears ?? 1}yr${optTag}${e.contractLabel ? ` (${e.contractLabel})` : ''}`, date: stateWithSim.date, type: 'Signing', playerIds: [e.playerId], tid: e.teamId };
                });
                if (eeHistoryEntries.length > 0) {
                    stateWithSim = { ...stateWithSim, history: [...(stateWithSim.history ?? []), ...eeHistoryEntries] };
                }
            }
        }

        // AI trade proposals — frequency increases as trade deadline approaches
        const simDateForTrades = normalizeDate(stateWithSim.date);
        const tradeDeadline = toISODateString(getTradeDeadlineDate(stateWithSim.leagueStats?.year ?? 2026, stateWithSim.leagueStats));
        const beforeTradeDeadline = simDateForTrades <= tradeDeadline;
        if (!isPlayoffDay && beforeTradeDeadline) {
            const daysToDeadline = (new Date(tradeDeadline).getTime() - new Date(simDateForTrades).getTime()) / 86_400_000;
            // Frequency: final week → every 3 days, 2 weeks out → every 7 days, normal → every 14 days
            // aiTradeFrequency slider: 0=off (freq=999), 50=default, 100=double (freq halved)
            const freqSlider = SettingsManager.getSettings().aiTradeFrequency ?? 50;
            const freqMult = freqSlider <= 0 ? 999 : Math.max(0.5, 1.5 - freqSlider / 100);
            const tradeFreq = Math.round((daysToDeadline <= 7 ? 3 : daysToDeadline <= 14 ? 7 : 14) * freqMult);
            if (stateWithSim.day % tradeFreq === 0) {
                const newProposals = generateAIDayTradeProposals(stateWithSim);
                if (newProposals.length > 0) {
                    stateWithSim = {
                        ...stateWithSim,
                        tradeProposals: [
                            ...(stateWithSim.tradeProposals ?? []),
                            ...newProposals,
                        ],
                    };
                }
            }
        }

        // Execute accepted AI-vs-AI proposals (max 2 per sim day to avoid roster chaos)
        if (!isPlayoffDay) {
            const pendingAITrades = (stateWithSim.tradeProposals ?? []).filter(
                p => p.isAIvsAI && p.status === 'accepted'
            );
            for (const proposal of pendingAITrades.slice(0, 2)) {
                const patch = executeAITrade(proposal, stateWithSim);
                stateWithSim = { ...stateWithSim, ...patch };
            }
        }

        // Season rollover — fires once when sim date crosses June 30 of the current season year
        // (day before free agency opens July 1).
        // e.g. season 2026: fires at 2026-06-30 → year becomes 2027, contracts expire, cap inflates.
        // Guard: year increment inside applySeasonRollover prevents double-firing.
        const simDateForRollover = normalizeDate(stateWithSim.date);
        if (shouldFireRollover(stateWithSim, simDateForRollover)) {
            const rolloverPatch = applySeasonRollover(stateWithSim);
            stateWithSim = { ...stateWithSim, ...rolloverPatch };
            // Re-compute strengths after roster changes from contract expiry
            stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);

            // Bird Rights re-signs are deferred until after the FA moratorium.
            // Rollover is June 30, so resolving them here creates pre-FA/tampering
            // transactions and can silently jump active user bids.
            const birdResigns: ReturnType<typeof runAIBirdRightsResigns> = [];
            if (birdResigns.length > 0) {
                const firstYear = stateWithSim.leagueStats?.year ?? 2026;
                const birdResignMap = new Map(birdResigns.map(r => [r.playerId, r] as const));
                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p => {
                        const r = birdResignMap.get(p.internalId);
                        if (!r) return p;
                        const newContract = {
                            amount: Math.round(r.salaryUSD / 1_000),
                            exp: firstYear + r.years - 1,
                            hasPlayerOption: r.hasPlayerOption,
                        };
                        const newContractYears = Array.from({ length: r.years }, (_, i) => {
                            const yr = firstYear + i;
                            return {
                                season: `${yr - 1}-${String(yr).slice(-2)}`,
                                guaranteed: Math.round(r.salaryUSD * Math.pow(1.05, i)),
                                option: (i === r.years - 1 && r.hasPlayerOption) ? 'Player' : '',
                            };
                        });
                        const histYears = ((p as any).contractYears ?? []).filter((cy: any) => {
                            const yr = seasonLabelToYear(cy.season);
                            return yr < firstYear;
                        });
                        const prevSalaryUSDFirstYear = (Number((p as any).contract?.amount) || 0) * 1_000;
                        return {
                            ...p,
                            tid: r.teamId,
                            status: 'Active' as const,
                            contract: newContract,
                            contractYears: [...histYears, ...newContractYears],
                            signedDate: stateWithSim.date,          // trim recency guard
                            tradeEligibleDate: computeTradeEligibleDate({
                                signingDate: stateWithSim.date,
                                contractYears: r.years,
                                salaryUSDFirstYear: r.salaryUSD,
                                prevSalaryUSDFirstYear,
                                usedBirdRights: true,
                                isReSign: true,
                                leagueStats: stateWithSim.leagueStats as any,
                            }),
                            yearsWithTeam: 1,                       // re-sign — fresh tenure on new deal
                            hasBirdRights: false,                   // consumed by re-sign
                            midSeasonExtensionDeclined: undefined,  // clear for next season
                            birdRightsResignedThisYear: firstYear,  // protects from trim for the season — see canCut
                        };
                    }),
                };
                // History entries (one per re-sign) — landing on the rollover date.
                const birdHistory = birdResigns.map(r => {
                    const totalM = Math.round((r.salaryUSD / 1_000_000) * r.years);
                    const optTag = r.hasPlayerOption ? ' (player option)' : '';
                    const supTag = r.isSupermax ? ' (Supermax)' : '';
                    return {
                        text: `${r.playerName} re-signs with the ${r.teamName} via Bird Rights: $${totalM}M/${r.years}yr${optTag}${supTag}`,
                        date: stateWithSim.date,
                        type: 'Signing',
                        playerIds: [r.playerId],
                        tid: r.teamId,
                    };
                });
                stateWithSim = {
                    ...stateWithSim,
                    history: [...(stateWithSim.history ?? []), ...birdHistory] as any,
                };
                console.log(`[BirdRights] Pass 0 resigned ${birdResigns.length} players via Bird Rights premium.`);
            }
        }

        // AI free agency — FA pool stays open July 1 → Feb 28 (March 1 = playoff eligibility deadline).
        // Frequency tapers like real NBA:
        //   Jul  1–15:  every day     (signing frenzy — moratorium lifts Jul 6)
        //   Jul 16–31:  every 2 days  (major deals wrapping up)
        //   August:     every 4 days  (role players / vets min)
        //   September:  every 7 days  (camp invites, stragglers)
        //   Oct–Feb:    every 14 days (occasional vet-minimum / waiver wire pickups)
        // Summer FA: July–Sep; In-season FA: Oct–Feb (month ≥10 or month ≤2); stop at March 1
        const isSummerFAWindow = simMonth >= 7 && simMonth <= 9;
        const effectiveFAStart = isSummerFAWindow
            ? toISODateString(getCurrentOffseasonEffectiveFAStart(stateWithSim.date, stateWithSim.leagueStats as any, stateWithSim.schedule as any))
            : '';
        const summerFAOpen = isSummerFAWindow && compareGameDates(stateWithSim.date, effectiveFAStart) >= 0;
        const isFreeAgencySeason = summerFAOpen || simMonth >= 10 || simMonth <= 2;
        const isRegularSeason = (simMonth >= 10 && simMonth <= 12) || (simMonth >= 1 && simMonth <= 4);
        const moratoriumActiveForDay = isFreeAgencySeason
            ? isInMoratorium(stateWithSim.date, stateWithSim.leagueStats?.year ?? 2026, stateWithSim.leagueStats as any, stateWithSim.schedule as any)
            : false;

        // Incumbent Bird Rights signings should not land on rollover/Jun 30 or
        // during the moratorium. They resolve once the market can actually sign.
        if (
            isFreeAgencySeason &&
            simMonth === 7 &&
            !moratoriumActiveForDay &&
            (stateWithSim.leagueStats as any)?.birdRightsResignPassYear !== (stateWithSim.leagueStats?.year ?? 2026)
        ) {
            stateWithSim = applyBirdRightsResignsPass(stateWithSim);
            stateWithSim = normalizeReservedJerseys(
                stateWithSim,
                stateWithSim.players.filter(p => (p as any).birdRightsResignedThisYear === (stateWithSim.leagueStats?.year ?? 2026)).map(p => p.tid),
            );
        }

        // G-League auto-assignment used to run every 7 days and stash every 0-GP
        // standard player — that compounded into IND's 36-man roster by mid-Feb
        // because the trim excluded gLeagueAssigned from the 15-man count. In the
        // real NBA, G-League assignment is mostly a two-way mechanic; standard
        // players who don't play just sit on the bench or get waived. Since this
        // sim doesn't simulate G-League games, we removed the auto-demotion
        // entirely — over-roster teams are now handled by autoTrimOversizedRosters,
        // which waives excess standard players straight to the FA pool.
        //
        // Legacy cleanup: any player still flagged gLeagueAssigned=true from a
        // previous save gets the flag cleared here so they re-enter the normal
        // roster count (and the trim will cut them if the team is over 15).
        if (isRegularSeason && stateWithSim.day % 7 === 0) {
            const stillFlagged = stateWithSim.players.some(p => (p as any).gLeagueAssigned);
            if (stillFlagged) {
                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p =>
                        (p as any).gLeagueAssigned ? { ...p, gLeagueAssigned: false } : p
                    ),
                };
            }
        }
        // All of July runs daily so a user's Sim Day always lands on a round
        // day during peak FA activity. Aug-Sep ramp down (most starters signed
        // by then), in-season is two-week cadence (vet minimums, waiver pickups).
        const faFrequency = simMonth === 7 ? 1
                          : simMonth === 8 && simDayNum <= 15 ? 2
                          : simMonth === 8 ? 4
                          : simMonth === 9 ? 7
                          : 14; // Oct–Feb in-season
        // Immediate refill: if any AI team fell below the league roster minimum
        // (usually from a just-executed salary-dump trade), bypass the FA schedule
        // and fire the round so Pass 2 signs minimum-contract FAs to fill the gap.
        const minRosterSetting = stateWithSim.leagueStats?.minPlayersPerTeam ?? 14;
        const anyTeamUnderMinRoster = stateWithSim.teams.some(t => {
            const count = stateWithSim.players.filter(p => p.tid === t.id && !(p as any).twoWay).length;
            return count < minRosterSetting;
        });
        // ── FA bidding market tick (daily during FA season) ──────────────────
        // Resolves expired markets first, then opens new ones for notable FAs.
        // Runs every sim day during FA so decidesOnDay hits land on the right day
        // even when the main signing round isn't firing (e.g. a `faFrequency===2`
        // day with no forced signings). The existing round is a distinct pipeline
        // for lower-tier FAs and roster-minimum fills.
        if (isFreeAgencySeason) {
            const tick = tickFAMarkets(stateWithSim);
            const previousResolvedMarketIds = new Set(
                (stateWithSim.faBidding?.markets ?? [])
                    .filter((market: any) => market.resolved)
                    .map((market: any) => market.playerId)
            );
            const previousMarketByPlayerId = new Map(
                (stateWithSim.faBidding?.markets ?? []).map((market: any) => [market.playerId, market])
            );
            const hasMarketChanges =
                tick.playerMutations.size > 0 ||
                tick.historyEntries.length > 0 ||
                tick.newsItems.length > 0 ||
                tick.socialPosts.length > 0 ||
                !!tick.leagueStats ||
                tick.userBidResolutions.length > 0 ||
                tick.updatedMarkets.length !== (stateWithSim.faBidding?.markets?.length ?? 0) ||
                tick.updatedMarkets.some((market: any) => {
                    const prevMarket: any = previousMarketByPlayerId.get(market.playerId);
                    if (!prevMarket) return true;
                    if (prevMarket.decidesOnDay !== market.decidesOnDay) return true;
                    if ((prevMarket.bids?.length ?? 0) !== (market.bids?.length ?? 0)) return true;
                    const prevBidSig = (prevMarket.bids ?? []).map((b: any) => `${b.id}:${b.status}:${b.expiresDay}`).join('|');
                    const nextBidSig = (market.bids ?? []).map((b: any) => `${b.id}:${b.status}:${b.expiresDay}`).join('|');
                    if (prevBidSig !== nextBidSig) return true;
                    const prevActiveUser = (prevMarket.bids ?? []).find((b: any) => b.isUserBid && b.status === 'active');
                    const nextActiveUser = (market.bids ?? []).find((b: any) => b.isUserBid && b.status === 'active');
                    return (prevActiveUser?.expiresDay ?? null) !== (nextActiveUser?.expiresDay ?? null);
                }) ||
                tick.updatedMarkets.some((market: any) => market.resolved && !previousResolvedMarketIds.has(market.playerId));
            if (hasMarketChanges) {
                stateWithSim = {
                    ...stateWithSim,
                    players: tick.playerMutations.size > 0
                        ? stateWithSim.players.map(p => {
                            const mut = tick.playerMutations.get(p.internalId);
                            return mut ? ({ ...p, ...mut } as Player) : p;
                        })
                        : stateWithSim.players,
                    history: tick.historyEntries.length > 0
                        ? [...(stateWithSim.history ?? []), ...tick.historyEntries] as any
                        : stateWithSim.history,
                    news: tick.newsItems.length > 0
                        ? [...tick.newsItems, ...(stateWithSim.news ?? [])] as any
                        : stateWithSim.news,
                    socialFeed: tick.socialPosts.length > 0
                        ? [...tick.socialPosts, ...(stateWithSim.socialFeed ?? [])] as any
                        : stateWithSim.socialFeed,
                    faBidding: { markets: tick.updatedMarkets as any },
                    ...(tick.leagueStats ? { leagueStats: tick.leagueStats as any } : {}),
                    ...(tick.userBidResolutions.length > 0 ? {
                        pendingFAToasts: [
                            ...(stateWithSim.pendingFAToasts ?? []),
                            ...tick.userBidResolutions,
                        ],
                    } : {}),
                    // RFA offer-sheet inbox for the user (Match/Decline toast)
                    ...((tick as any).rfaOfferSheets?.length > 0 ? {
                        pendingRFAOfferSheets: [
                            ...((stateWithSim as any).pendingRFAOfferSheets ?? []),
                            ...(tick as any).rfaOfferSheets,
                        ],
                    } : {}),
                    // RFA match resolution outcomes — pop result toasts when user is involved
                    ...((tick as any).rfaMatchResolutions?.filter((r: any) => r.userInvolved).length > 0 ? {
                        pendingRFAMatchResolutions: [
                            ...((stateWithSim as any).pendingRFAMatchResolutions ?? []),
                            ...(tick as any).rfaMatchResolutions.filter((r: any) => r.userInvolved),
                        ],
                    } : {}),
                };
                if (tick.signedPlayerIds.size > 0) {
                    console.log(`[FAMarketTick] Resolved ${tick.signedPlayerIds.size} market signings on ${stateWithSim.date}`);
                }
                if (tick.signedPlayerIds.size > 0 || tick.playerMutations.size > 0) {
                    const affectedTeamIds = Array.from(tick.playerMutations.values())
                        .map((mut: any) => Number(mut?.tid))
                        .filter((tid: number) => tid >= 0);
                    stateWithSim = normalizeReservedJerseys(stateWithSim, affectedTeamIds);
                }
            }
            // Capture the interrupt flag whether or not hasMarketChanges fired —
            // userBidResolutions feed into hasMarketChanges already, but defensive.
            if (tick.shouldStopSim) userInterrupted = true;
        }

        // AI FA round (and the auto-trim/promotion/MLE-swap that runs alongside it)
        // must respect the Jul 1-6 moratorium — no NBA signings during that window
        // except the Bird-Rights pass which is handled separately above. Without
        // this gate, AI was signing players to non-prior teams on Jul 2-3 while
        // the user's bids sat unresolved, producing the "Lopez/Saric/Hauser
        // disappeared during moratorium" leak.
        if (isFreeAgencySeason && !moratoriumActiveForDay && (stateWithSim.day % faFrequency === 0 || anyTeamUnderMinRoster)) {
            // Step 1: Two-way → standard promotion (first line of defense).
            // If a team has <15 standard AND >3 two-way, promote the best excess
            // two-ways to 1-year min standard deals so they open a 2W slot and
            // fill a standard seat without waiving anyone. Runs BEFORE trim.
            const promotions = autoPromoteTwoWayExcess(stateWithSim, simMonth);
            if (promotions.length > 0) {
                const promotionMap = new Map(promotions.map(pr => [pr.playerId, pr] as const));
                const firstYear = stateWithSim.leagueStats?.year ?? 2026;
                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p => {
                        const pr = promotionMap.get(p.internalId);
                        if (!pr) return p;
                        // Fresh 1-year standard contract at market value. Old contract
                        // is discarded — mirrors real NBA (waived/released → new signing).
                        const newContract = {
                            amount: Math.round(pr.newSalaryUSD / 1_000), // BBGM thousands
                            exp: pr.contractExp,
                            hasPlayerOption: false,
                        };
                        const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => {
                            const yr = seasonLabelToYear(cy.season);
                            return yr < firstYear;
                        });
                        const newContractYears = [{
                            season: `${firstYear - 1}-${String(firstYear).slice(-2)}`,
                            guaranteed: pr.newSalaryUSD,
                            option: '',
                        }];
                        return {
                            ...p,
                            twoWay: false,
                            contract: newContract,
                            contractYears: [...historicalYears, ...newContractYears],
                        } as any;
                    }),
                    history: [
                        ...(stateWithSim.history ?? []),
                        ...promotions.map(pr => ({
                            text: `${pr.playerName} has been promoted from two-way to a standard contract by the ${pr.teamName}: $${(pr.newSalaryUSD / 1_000_000).toFixed(1)}M/1yr`,
                            date: stateWithSim.date,
                            type: 'Signing',
                            playerIds: [pr.playerId],
                            tid: pr.teamId,
                        })),
                    ],
                };
                console.log(`[TwoWayPromotion] Applied ${promotions.length} promotions`);
            }

            // Step 2: Trim teams still over the roster limit (e.g. trade overflow)
            // Pass simMonth+simDayNum so the trimmer uses the training camp limit during Jul–Oct 21
            console.log(`[RosterTrim] Calling autoTrimOversizedRosters: simMonth=${simMonth}, date=${stateWithSim.date}, day=${stateWithSim.day}`);
            const waivers = autoTrimOversizedRosters(stateWithSim, simMonth, simDayNum);
            console.log(`[RosterTrim] Month=${simMonth}, trimmed=${waivers.length} players`);
            if (waivers.length > 0) {
                const waiverInfo = new Map(waivers.map(w => [w.playerId, w] as const));
                // Every cut is a straight waive to the FA pool. Preseason camp
                // cuts used to get stashed in G-League, but (1) this sim doesn't
                // simulate G-League games and (2) the stash piled up into 30+
                // man rosters because the flag hid them from the roster count.
                // Two-way cuts also clear the twoWay flag so they don't keep a
                // 2W cap slot on the way out.
                // Dead money: AI-driven waives of GUARANTEED contracts must obey the
                // same rules as user waives. NG / two-way trims = free release. Build
                // per-team dead money entries so cap math stays honest after AI cuts.
                const lsForDeadMoney = stateWithSim.leagueStats as any;
                const deadMoneyEnabled = lsForDeadMoney.deadMoneyEnabled ?? true;
                // Stretch settings sourced from EconomyTab (state.leagueStats). When the
                // commissioner toggles stretch off or tunes the multiplier / cap, AI waives
                // honor the same rules user waives do. Without this, AI cuts always booked
                // straight-line dead money — a single $25M/yr × 3yr waive landed as $76M
                // dead instead of ~$11M/yr stretched.
                const stretchEnabled: boolean = lsForDeadMoney.stretchProvisionEnabled ?? true;
                const stretchMult: number = lsForDeadMoney.stretchProvisionMultiplier ?? 2;
                const stretchedCapPct: number = lsForDeadMoney.stretchedDeadMoneyCapPct ?? 15;
                const salaryCapUSD: number = lsForDeadMoney.salaryCap ?? 140_000_000;
                // Threshold for when stretching is worthwhile: contract ≥ 6% of cap AND
                // multi-year remaining. Pre-fix at 4% (~$6M) too many small contracts got
                // stretched 5yrs (Ziaire Williams, Day'Ron Sharpe, Taylor Hendricks all on
                // ~$5M/yr deals stretched to 5yrs of $2.5M dead). Real-NBA stretches are
                // rare and reserved for $15M+ contracts the team massively regrets — bump
                // to 6% (~$9M) so only meaningful waives drag the tail.
                const stretchAmountFloorUSD = salaryCapUSD * 0.06;
                const currentSeasonYear: number = lsForDeadMoney.year ?? new Date(stateWithSim.date ?? Date.now()).getUTCFullYear();
                const teamDeadMoneyAdds = new Map<number, import('../../../types').DeadMoneyEntry[]>();
                // Dead-money tracking floor: skip rounding-noise entries below $50K.
                // NG/partial-guaranteed tail years often produce $40-80K residuals that
                // display as "$0.0M" and bloat the audit table.
                const DEAD_MONEY_FLOOR_USD = 50_000;
                if (deadMoneyEnabled) {
                    waivers.forEach(w => {
                        if (w.wasNonGuaranteed) return;
                        const playerRecord: any = stateWithSim.players.find(p => p.internalId === w.playerId);
                        if (!playerRecord || (playerRecord as any).twoWay) return;
                        const cy: Array<{ season: string; guaranteed: number; option?: string }> =
                            Array.isArray(playerRecord.contractYears) ? playerRecord.contractYears : [];
                        const remaining = cy
                            .filter(y => {
                                const option = String(y.option ?? '').toLowerCase();
                                return seasonLabelToYear(y.season) >= currentSeasonYear && option !== 'team' && option !== 'player';
                            })
                            // Drop sub-floor entries — NG contracts (guaranteed:0) and partial-
                            // guaranteed tail years shouldn't generate dead money slots.
                            .filter(y => (y.guaranteed ?? 0) >= DEAD_MONEY_FLOOR_USD)
                            .map(y => ({ season: y.season, amountUSD: y.guaranteed }));
                        const signedAt = playerRecord.signedDate ? new Date(playerRecord.signedDate).getTime() : NaN;
                        const waivedAt = stateWithSim.date ? new Date(stateWithSim.date).getTime() : NaN;
                        const freshSignedMissingYears = Number.isFinite(signedAt) && Number.isFinite(waivedAt)
                            && (waivedAt - signedAt) >= 0
                            && (waivedAt - signedAt) / 86_400_000 < 120;
                        if (remaining.length === 0 && playerRecord.contract?.amount && !freshSignedMissingYears) {
                            const exp = playerRecord.contract.exp ?? currentSeasonYear;
                            const amountUSD = (playerRecord.contract.amount || 0) * 1_000;
                            if (amountUSD >= DEAD_MONEY_FLOOR_USD) {
                                for (let yr = currentSeasonYear; yr <= exp; yr++) {
                                    remaining.push({ season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD });
                                }
                            }
                        }
                        if (remaining.length === 0) return;
                        const totalDeadUSD = remaining.reduce((s, y) => s + y.amountUSD, 0);
                        if (totalDeadUSD < DEAD_MONEY_FLOOR_USD) return;

                        // Decide stretch on a per-waive basis. Stretch is only useful when
                        // there's >1 yr of guarantees AND the annual hit is meaningful;
                        // also obey the per-team stretched-dead-money ceiling.
                        const teamRecord = stateWithSim.teams.find(t => t.id === w.teamId);
                        const totalRemainingUSD = remaining.reduce((s, y) => s + y.amountUSD, 0);
                        const annualUSD = totalRemainingUSD / remaining.length;
                        const yearsLeft = remaining.length;
                        let useStretch = false;
                        if (stretchEnabled && yearsLeft > 1 && annualUSD >= stretchAmountFloorUSD) {
                            // Stretched-dead-money ceiling (NBA = 15% of cap). Project the
                            // post-stretch annual hit against the team's existing stretched
                            // load for the upcoming year and skip stretching if it would
                            // breach the ceiling.
                            const stretchYears = yearsLeft * stretchMult + 1;
                            const stretchedAnnualUSD = totalRemainingUSD / stretchYears;
                            const existingStretchedNextYear = (teamRecord?.deadMoney ?? [])
                                .filter(e => e.stretched)
                                .reduce((s, e) => {
                                    const hit = e.remainingByYear.find(y => seasonLabelToYear(y.season) === currentSeasonYear);
                                    return s + (hit?.amountUSD ?? 0);
                                }, 0);
                            const ceilingUSD = salaryCapUSD * (stretchedCapPct / 100);
                            if (existingStretchedNextYear + stretchedAnnualUSD <= ceilingUSD) {
                                useStretch = true;
                            }
                        }
                        const finalSchedule = useStretch
                            ? buildStretchedSchedule(remaining, stretchMult)
                            : remaining;

                        const entry: import('../../../types').DeadMoneyEntry = {
                            playerId: w.playerId,
                            playerName: w.playerName,
                            remainingByYear: finalSchedule,
                            stretched: useStretch,
                            waivedDate: stateWithSim.date ?? '',
                            originalExpYear: playerRecord.contract?.exp ?? currentSeasonYear,
                        };
                        const existing = teamDeadMoneyAdds.get(w.teamId) ?? [];
                        existing.push(entry);
                        teamDeadMoneyAdds.set(w.teamId, existing);
                    });
                }
                const userTidForWaiveNews = stateWithSim.gameMode === 'gm' ? (stateWithSim.userTeamId ?? -999) : -999;
                const isOffseasonWaiveWindow = simMonth >= 7 && (simMonth <= 9 || (simMonth === 10 && simDayNum <= 21));
                const highOvrWaiveNews = isOffseasonWaiveWindow
                    ? waivers.flatMap(w => {
                        if (w.teamId === userTidForWaiveNews) return [];
                        const playerRecord: any = stateWithSim.players.find(p => p.internalId === w.playerId);
                        if (!playerRecord) return [];
                        const lastRating = playerRecord.ratings?.[playerRecord.ratings.length - 1];
                        const k2 = convertTo2KRating(
                            playerRecord.overallRating ?? lastRating?.ovr ?? 60,
                            lastRating?.hgt ?? 50,
                            lastRating?.tp ?? 50,
                        );
                        if (k2 < 80) return [];
                        return [{
                            id: `waive-fit-${w.playerId}-${stateWithSim.date}`,
                            headline: `${w.teamName} Parts Ways with ${w.playerName}`,
                            content: `${w.teamName} parts ways with ${w.playerName} — front office cites system fit.`,
                            date: stateWithSim.date,
                            type: 'transaction',
                            read: false,
                            isNew: true,
                        }];
                    })
                    : [];
                stateWithSim = {
                    ...stateWithSim,
                    teams: teamDeadMoneyAdds.size > 0
                        ? stateWithSim.teams.map(t => {
                            const adds = teamDeadMoneyAdds.get(t.id);
                            if (!adds) return t;
                            return { ...t, deadMoney: [...(t.deadMoney ?? []), ...adds] };
                        })
                        : stateWithSim.teams,
                    players: stateWithSim.players.map(p => {
                        const w = waiverInfo.get(p.internalId);
                        if (!w) return p;
                        // Canonical FA status is 'Free Agent' (with space) — the signing
                        // filters in AIFreeAgentHandler / faMarketTicker compare against it.
                        // Writing 'FreeAgent' here made trimmed players invisible to the FA pool.
                        const base = {
                            ...p,
                            tid: -1,
                            status: 'Free Agent' as const,
                            twoWay: undefined,
                            nonGuaranteed: false,
                            gLeagueAssigned: false,
                            mleSignedVia: undefined,
                            hasBirdRights: false,
                            superMaxEligible: false,
                            yearsWithTeam: 0,
                            // 90-day re-sign cooldown: AI passes refuse to re-sign someone
                            // their own team just waived (prevents Bufkin/Hall/Bassey churn).
                            recentlyWaivedBy: w.teamId,
                            recentlyWaivedDate: stateWithSim.date,
                            // Clear any stale signedDate from the prior signing so the
                            // post-signing trim guard doesn't refuse a re-sign elsewhere.
                            signedDate: undefined,
                            tradeEligibleDate: undefined,
                        };
                        return base as unknown as Player;
                    }),
                    history: [
                        ...(stateWithSim.history ?? []),
                        ...waivers.map(w => {
                            const trainingCampRelease = w.wasNonGuaranteed && w.reason === 'trainingCampExcess';
                            return {
                                text: trainingCampRelease
                                    ? `${w.playerName} released from training camp by the ${w.teamName}`
                                    : w.wasNonGuaranteed
                                        ? `${w.playerName} released by the ${w.teamName} (non-guaranteed)`
                                        : `${w.playerName} waived by the ${w.teamName}`,
                                date: stateWithSim.date,
                                type: trainingCampRelease ? 'Training Camp Release' : 'Waiver',
                                playerIds: [w.playerId],
                                // Stamp tid explicitly: by the time TX/UI reads this, the player's tid is -1.
                                tid: w.teamId,
                            };
                        }),
                    ],
                    news: highOvrWaiveNews.length > 0
                        ? [...highOvrWaiveNews, ...(stateWithSim.news ?? [])].slice(0, 200) as any
                        : stateWithSim.news,
                };
            }
            // AI early NG → guaranteed conversion: per-team once during reg-season, locks in keepers (OVR ≥ 50).
            if ((simMonth === 10 && simDayNum >= 22) || simMonth === 11 || simMonth === 12 || (simMonth === 1 && simDayNum < 10)) {
                const userTid = stateWithSim.gameMode === 'gm' ? stateWithSim.userTeamId ?? -999 : -999;
                const ngKeepers = stateWithSim.players.filter(p =>
                    !!(p as any).nonGuaranteed
                    && p.tid != null && p.tid >= 0
                    && p.tid !== userTid
                    && (p.overallRating ?? 0) >= 50
                );
                if (ngKeepers.length > 0) {
                    const keeperIds = new Set(ngKeepers.map(p => p.internalId));
                    stateWithSim = {
                        ...stateWithSim,
                        players: stateWithSim.players.map(p =>
                            keeperIds.has(p.internalId)
                                ? { ...p, nonGuaranteed: undefined }
                                : p
                        ),
                        history: [
                            ...(stateWithSim.history ?? []),
                            ...ngKeepers.map(p => ({
                                text: `${p.name}'s contract guaranteed early by the ${stateWithSim.teams.find(t => t.id === p.tid)?.name ?? 'team'}`,
                                date: stateWithSim.date,
                                type: 'NG Guaranteed',
                                playerIds: [p.internalId],
                            })),
                        ],
                    };
                }
            }

            // Jan 10: auto-guarantee all non-guaranteed contracts still on a roster
            if (simMonth === 1 && simDayNum === 10) {
                const ngToGuarantee = stateWithSim.players.filter(
                    p => !!(p as any).nonGuaranteed && p.tid != null && p.tid >= 0
                );
                if (ngToGuarantee.length > 0) {
                    stateWithSim = {
                        ...stateWithSim,
                        players: stateWithSim.players.map(p =>
                            (p as any).nonGuaranteed && p.tid != null && p.tid >= 0
                                ? { ...p, nonGuaranteed: undefined }
                                : p
                        ),
                        history: [
                            ...(stateWithSim.history ?? []),
                            ...ngToGuarantee.map(p => ({
                                text: `${p.name}'s contract guaranteed by the ${stateWithSim.teams.find(t => t.id === p.tid)?.name ?? 'team'} (January 10 deadline)`,
                                date: stateWithSim.date,
                                type: 'NG Guaranteed',
                                playerIds: [p.internalId],
                            })),
                        ],
                    };

                    // GM mode: push coach message confirming guarantees
                    const userTeamNGs = ngToGuarantee.filter(p => p.tid === stateWithSim.userTeamId);
                    if (userTeamNGs.length > 0) {
                        const playerList = userTeamNGs.map(p => p.name).join(', ');
                        const coachMsg = `Boss, just a heads up—${playerList} just became guaranteed on the Jan 10 deadline. Now locked in for the rest of the season.`;
                        stateWithSim = pushCoachMessage(stateWithSim, coachMsg);
                    }
                }
            }

            // Trade deadline approaching (Feb 6 — 3 days before would be Feb 3)
            if (simMonth === 2 && simDayNum === 3) {
                stateWithSim = pushCoachMessage(stateWithSim, `Boss, trade deadline is in 3 days. This is our last window—let me know if you want to make any moves.`);
            }

            // Last week of regular season (Mar 30 — Apr 6): playoff lock-in reminder
            if ((simMonth === 3 && simDayNum >= 30) || (simMonth === 4 && simDayNum <= 6)) {
                // Check if we haven't already sent this message
                const hasPrevPlayoffMsg = (stateWithSim.chats || []).some(c =>
                    c.messages.some(m => m.text.includes('lock in our playoff'))
                );
                if (!hasPrevPlayoffMsg) {
                    const twoWayCount = stateWithSim.players.filter(p =>
                        p.tid === stateWithSim.userTeamId && (p as any).twoWay && p.status === 'Active'
                    ).length;
                    const ngCount = stateWithSim.players.filter(p =>
                        p.tid === stateWithSim.userTeamId && (p as any).nonGuaranteed && p.status === 'Active'
                    ).length;

                    let msg = `Boss, we need to finalize our playoff roster. `;
                    if (ngCount > 0) {
                        msg += `We've got ${ngCount} non-guaranteed player(s) who should be locked in before postseason. `;
                    }
                    if (twoWayCount > 0) {
                        msg += `Also, our two-way guys can't play in the playoffs—we should convert or release them before game 1.`;
                    } else if (ngCount === 0) {
                        msg += `Let's make sure we're ready for the playoffs.`;
                    }
                    stateWithSim = pushCoachMessage(stateWithSim, msg);
                }
            }

            const rawSignings = runAIFreeAgencyRound(stateWithSim);
            // Last-line defense: drop any signing for a player who has an open
            // user-bid market. The handler's pool filter and signPlayer guard
            // both check marketPendingIds, but we re-check here against the
            // LIVE state.faBidding so a stale snapshot inside the handler can
            // never silently overwrite a user bid. Logs the leak for debugging.
            const allUserMarkets = (stateWithSim.faBidding?.markets ?? [])
                .filter((m: any) => m.bids?.some((b: any) => b.isUserBid));
            const userMarketIds = new Set(
                allUserMarkets
                    .filter((m: any) => !m.resolved && m.bids?.some((b: any) => b.isUserBid && b.status === 'active'))
                    .map((m: any) => m.playerId),
            );
            // Diagnostic dump — runs only when there are signings AND any user
            // markets exist, so we can see whether the leak was a missing
            // market entry vs a status-change race.
            if (rawSignings.length > 0 && allUserMarkets.length > 0) {
                console.log(
                    `[FA-DIAG] FA round produced ${rawSignings.length} signings. User has ${allUserMarkets.length} bid markets. Active-user-bid IDs:`,
                    [...userMarketIds],
                );
                for (const m of allUserMarkets) {
                    const userBid = m.bids?.find((b: any) => b.isUserBid);
                    console.log(`[FA-DIAG]   market for ${m.playerName ?? m.playerId}: resolved=${m.resolved}, userBidStatus=${userBid?.status}, decidesOnDay=${m.decidesOnDay}`);
                }
                for (const s of rawSignings) {
                    if (allUserMarkets.some((m: any) => m.playerId === s.playerId)) {
                        console.error(`[FA-DIAG]   ⚠️ AI signing of ${s.playerName} → ${s.teamName} matches a user market (resolved or not). Investigate why.`);
                    }
                }
            }
            // Dedup by playerId — defensive guard against multi-pass collisions
            // (e.g., Pass 1 best-fit + Pass 5 floor both signing the same FA in
            // one round). Without this, history logs both signings even though
            // only the first mutation actually lands on the player. Caused the
            // "Gary Harris signs CHA + MIA same day Oct 12" double-sign bug.
            const seenSignIds = new Set<string>();
            const signings = rawSignings.filter(s => {
                if (userMarketIds.has(s.playerId)) {
                    console.error(`[FA-LEAK-GUARD] Dropped AI signing of ${s.playerName} → ${s.teamName} — user has an open bid. runAIFreeAgencyRound's pool snapshot was stale.`);
                    return false;
                }
                if (seenSignIds.has(s.playerId)) return false;
                seenSignIds.add(s.playerId);
                return true;
            });
            if (signings.length > 0) {
                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p => {
                        const signing = signings.find(s => s.playerId === p.internalId);
                        if (!signing) return p;
                        // Apply contract from the offer — amount in thousands (BBGM convention)
                        const newContract = {
                            amount: Math.round(signing.salaryUSD / 1_000),
                            exp: signing.contractExp,
                            hasPlayerOption: signing.hasPlayerOption,
                        };
                        // Build contractYears[] so PlayerBioContractTab shows the new deal correctly.
                        // Preserve past seasons from existing contractYears[] (gist historical data)
                        // and replace only current + future years with the new deal.
                        const firstYear = stateWithSim.leagueStats?.year ?? 2026;
                        const newContractYears = Array.from({ length: signing.contractYears }, (_, i) => {
                            const yr = firstYear + i;
                            const annualAmt = Math.round(signing.salaryUSD * Math.pow(1.05, i));
                            return {
                                season: `${yr - 1}-${String(yr).slice(-2)}`,
                                // NG contracts have zero guaranteed money — waiving costs nothing.
                                guaranteed: (signing as any).nonGuaranteed ? 0 : annualAmt,
                                option: (i === signing.contractYears - 1 && signing.hasPlayerOption) ? 'Player' : '',
                            };
                        });
                        const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => {
                            const yr = seasonLabelToYear(cy.season);
                            return yr < firstYear;
                        });
                        // Mark playoff ineligible if signed on/after March 1 (cosmetic flag)
                        const isAfterMarchDeadline = simMonth === 3 && simDayNum >= 1 || simMonth > 3;
                        const isReSign = (p as any).tid === signing.teamId;
                        const prevSalaryUSDFirstYear = (Number((p as any).contract?.amount) || 0) * 1_000;
                        const minUSD = ((stateWithSim.leagueStats?.minContractStaticAmount as number | undefined) ?? 1.273) * 1_000_000;
                        const isMin = signing.salaryUSD <= minUSD * 1.01;
                        return {
                            ...p,
                            tid: signing.teamId,
                            status: 'Active' as const,
                            contract: newContract,
                            contractYears: [...historicalYears, ...newContractYears],
                            playoffEligible: isAfterMarchDeadline ? false : undefined,
                            // Stamp signing date so autoTrimOversizedRosters can refuse to cut
                            // recently signed guaranteed players. Without this guard the AI
                            // signs Slawson-tier fringe FAs on Day N then waives them on Day N+1
                            // when a trade absorbs an extra player — every cycle books dead money.
                            signedDate: stateWithSim.date,
                            tradeEligibleDate: computeTradeEligibleDate({
                                signingDate: stateWithSim.date,
                                contractYears: signing.contractYears,
                                salaryUSDFirstYear: signing.salaryUSD,
                                prevSalaryUSDFirstYear,
                                usedBirdRights: isReSign,
                                isReSign,
                                isMinimum: isMin,
                                isTwoWay: !!(signing as any).twoWay,
                                leagueStats: stateWithSim.leagueStats as any,
                            }),
                            // Preserve two-way / non-guaranteed flags from AI signing passes
                            ...((signing as any).twoWay ? { twoWay: true } : {}),
                            ...((signing as any).nonGuaranteed ? { nonGuaranteed: true } : {}),
                            // Track MLE signing type so TeamFinancesView can color MLE contract cells
                            ...(signing.mleTypeUsed ? { mleSignedVia: signing.mleTypeUsed } : {}),
                        };
                    }),
                };
                // Log FA signings on the actual sim date. Backdating these made
                // post-July signings appear as Jun 30 transactions, which looked
                // like tampering and made bid-resolution bugs impossible to read.
                const faDateStr = formatGameDateShort(stateWithSim.date);
                const faIsoDate = parseGameDate(stateWithSim.date).toISOString().slice(0, 10);
                const faHistoryEntries = signings.map(s => {
                    const annualM = Math.round(s.salaryUSD / 100_000) / 10;
                    const totalRaw = annualM * (s.contractYears ?? 1);
                    // Show $0.6M not $1M for sub-million deals
                    const totalStr = totalRaw < 1 ? totalRaw.toFixed(1) : Math.round(totalRaw).toString();
                    const optTag  = s.hasPlayerOption ? ' (player option)' : '';
                    const twoWayTag = (s as any).twoWay ? ' (two-way)' : '';
                    const ngTag = (s as any).nonGuaranteed ? ' (non-guaranteed)' : '';
                    return {
                        text: `${s.playerName} signs with the ${s.teamName}: $${totalStr}M/${s.contractYears ?? 1}yr${optTag}${twoWayTag}${ngTag}`,
                        date: faDateStr,
                        type: 'Signing',
                        playerIds: [s.playerId],
                        tid: s.teamId,
                    };
                });
                // Generate news items for all signings
                const faNewsItems = signings
                    .map(s => {
                        const annualM = Math.round(s.salaryUSD / 100_000) / 10;
                        const totalM  = Math.round(annualM * (s.contractYears ?? 1));
                        const optTag  = s.hasPlayerOption ? ' (player option)' : '';
                        const isMax   = annualM >= 30;
                        const headline = isMax
                            ? `${s.playerName} Lands Max Deal with ${s.teamName}`
                            : `${s.playerName} Signs with ${s.teamName}`;
                        const content = `${s.playerName} has agreed to a ${s.contractYears ?? 1}-year, $${totalM}M deal with the ${s.teamName}${optTag}. ${isMax ? 'Sources: Shams Charania.' : 'Sources: Adrian Wojnarowski.'}`;
                        return {
                            id: `fa-signing-${s.playerId}-${faIsoDate}`,
                            headline,
                            content,
                            date: faIsoDate,
                            type: 'transaction',
                            read: false,
                            isNew: true,
                        };
                    });
                // Update leagueStats.mleUsage for any MLE signings this round
                const mleSignings = signings.filter(s => s.mleTypeUsed);
                let updatedMleUsage = { ...((stateWithSim.leagueStats as any).mleUsage ?? {}) };
                for (const s of mleSignings) {
                    if (!s.mleTypeUsed) continue;
                    const prev = updatedMleUsage[s.teamId];
                    updatedMleUsage[s.teamId] = {
                        type: s.mleTypeUsed,
                        usedUSD: (prev?.usedUSD ?? 0) + (s.mleAmountUSD ?? s.salaryUSD),
                    };
                }
                // Generate Shams social posts for notable signings (K2 ≥ 78)
                const shamsFATransactions: any[] = [];
                for (const s of signings) {
                    const player = stateWithSim.players.find(p => p.internalId === s.playerId);
                    if (!player) continue;
                    const lr = (player as any).ratings?.[(player as any).ratings?.length - 1];
                    const k2 = convertTo2KRating(player.overallRating ?? 0, lr?.hgt ?? 50, lr?.tp);
                    if (k2 < 78) continue; // only notable players
                    const annualM = Math.round(s.salaryUSD / 100_000) / 10;
                    const content = buildShamsTransactionPost({
                        type: 'signing',
                        playerName: s.playerName,
                        teamName: s.teamName,
                        amount: annualM,
                        years: s.contractYears ?? 1,
                        hasPlayerOption: s.hasPlayerOption,
                    });
                    if (!content) continue;
                    const engagement = calculateSocialEngagement('@ShamsCharania', content, player.overallRating);
                    const shamsPhoto = findShamsPhoto(player.name, s.teamName);
                    shamsFATransactions.push({
                        id: `shams-fa-${s.playerId}-${Date.now()}-${Math.random()}`,
                        author: 'Shams Charania',
                        handle: '@ShamsCharania',
                        content,
                        date: new Date(stateWithSim.date).toISOString(),
                        likes: engagement.likes,
                        retweets: engagement.retweets,
                        source: 'TwitterX' as const,
                        isNew: true,
                        playerPortraitUrl: player.imgURL,
                        ...(shamsPhoto ? { mediaUrl: shamsPhoto.image_url } : {}),
                    });
                }
                stateWithSim = {
                    ...stateWithSim,
                    leagueStats: mleSignings.length > 0
                        ? { ...stateWithSim.leagueStats, mleUsage: updatedMleUsage }
                        : stateWithSim.leagueStats,
                    history: [...(stateWithSim.history ?? []), ...faHistoryEntries],
                    news: faNewsItems.length > 0 ? [...faNewsItems, ...(stateWithSim.news ?? [])] : (stateWithSim.news ?? []),
                    socialFeed: shamsFATransactions.length > 0
                        ? [...shamsFATransactions, ...(stateWithSim.socialFeed ?? [])].slice(0, 500)
                        : (stateWithSim.socialFeed ?? []),
                };
                stateWithSim = normalizeReservedJerseys(stateWithSim, signings.map(s => s.teamId));
            }

            // MLE upgrade swaps: over-cap teams sign a better FA via MLE and waive their weakest guaranteed player (once/month per team, seeded day)
            // Dedup by signed playerId — claimedFAIds inside the function guards within one call,
            // but this outer dedup is a safety net if the same FA somehow appears in two swap results.
            const rawMleSwaps = runAIMleUpgradeSwaps(stateWithSim, simMonth, simDayNum);
            // Last-line guard: drop any MLE swap whose target has an open user-bid market.
            const mleUserMarketIds = new Set(
                (stateWithSim.faBidding?.markets ?? [])
                    .filter((m: any) => !m.resolved && m.bids?.some((b: any) => b.isUserBid && b.status === 'active'))
                    .map((m: any) => m.playerId),
            );
            const seenMleSignIds = new Set<string>();
            const mleSwaps = rawMleSwaps.filter(sw => {
                if (mleUserMarketIds.has(sw.sign.playerId)) {
                    console.error(`[FA-LEAK-GUARD] Dropped MLE swap signing of ${sw.sign.playerName} → ${sw.sign.teamName} — user has an open bid.`);
                    return false;
                }
                if (seenMleSignIds.has(sw.sign.playerId)) return false;
                seenMleSignIds.add(sw.sign.playerId);
                return true;
            });
            if (mleSwaps.length > 0) {
                const swapDateStr = formatGameDateShort(stateWithSim.date);
                let updatedPlayers = [...stateWithSim.players];
                const swapHistory: any[] = [];
                let swapMleUsage = { ...((stateWithSim.leagueStats as any).mleUsage ?? {}) };

                for (const swap of mleSwaps) {
                    const { sign: s, waive: w } = swap;
                    // Apply signing
                    updatedPlayers = updatedPlayers.map(p => {
                        if (p.internalId !== s.playerId) return p;
                        const firstYear = stateWithSim.leagueStats?.year ?? 2026;
                        const newContractYears = Array.from({ length: s.contractYears }, (_, i) => ({
                            season: `${firstYear + i - 1}-${String(firstYear + i).slice(-2)}`,
                            guaranteed: Math.round(s.salaryUSD * Math.pow(1.05, i)),
                            option: (i === s.contractYears - 1 && s.hasPlayerOption) ? 'Player' : '',
                        }));
                        const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => {
                            const yr = seasonLabelToYear(cy.season);
                            return yr < firstYear;
                        });
                        return {
                            ...p,
                            tid: s.teamId,
                            status: 'Active' as const,
                            contract: { amount: Math.round(s.salaryUSD / 1_000), exp: s.contractExp, hasPlayerOption: s.hasPlayerOption },
                            contractYears: [...historicalYears, ...newContractYears],
                            signedDate: stateWithSim.date,         // trim recency guard
                            tradeEligibleDate: computeTradeEligibleDate({
                                signingDate: stateWithSim.date,
                                contractYears: s.contractYears,
                                salaryUSDFirstYear: s.salaryUSD,
                                isReSign: false,
                                leagueStats: stateWithSim.leagueStats as any,
                            }),
                            mleSignedVia: s.mleTypeUsed,
                        };
                    });
                    // Apply waiver (release to FA). Keep contract.amount for salary-history
                    // display; clear team-tied flags so FA pipeline treats them as clean.
                    updatedPlayers = updatedPlayers.map(p => {
                        if (p.internalId !== w.playerId) return p;
                        return {
                            ...p,
                            tid: -1,
                            status: 'Free Agent' as const,
                            twoWay: undefined,
                            nonGuaranteed: false,
                            gLeagueAssigned: false,
                            mleSignedVia: undefined,
                            hasBirdRights: false,
                            superMaxEligible: false,
                            yearsWithTeam: 0,
                            recentlyWaivedBy: w.teamId,
                            recentlyWaivedDate: stateWithSim.date,
                            signedDate: undefined,
                            tradeEligibleDate: undefined,
                        };
                    });
                    // History entries
                    const annualM = Math.round(s.salaryUSD / 100_000) / 10;
                    const totalM = Math.round(annualM * (s.contractYears ?? 1));
                    swapHistory.push(
                        { text: `${s.playerName} signs with the ${s.teamName}: $${totalM}M/${s.contractYears ?? 1}yr (MLE)`, date: swapDateStr, type: 'Signing', playerIds: [s.playerId], tid: s.teamId },
                        { text: `${w.playerName} waived by the ${w.teamName}`, date: swapDateStr, type: 'Waiver', playerIds: [w.playerId], tid: w.teamId },
                    );
                    // Track MLE usage
                    const prev = swapMleUsage[s.teamId];
                    swapMleUsage[s.teamId] = { type: s.mleTypeUsed, usedUSD: (prev?.usedUSD ?? 0) + (s.mleAmountUSD ?? s.salaryUSD) };
                }
                stateWithSim = {
                    ...stateWithSim,
                    players: updatedPlayers,
                    history: [...(stateWithSim.history ?? []), ...swapHistory],
                    leagueStats: { ...stateWithSim.leagueStats, mleUsage: swapMleUsage },
                };
                stateWithSim = normalizeReservedJerseys(stateWithSim, mleSwaps.map(s => s.sign.teamId));
            }
        }

        // End-of-day: if a user-facing FA event fired this tick, stop the batch
        // so the toast/modal lands at the resolution moment. The day's full
        // pipeline (games, trim, AI signings, etc.) has completed, so state is
        // coherent — next sim resumes on day+1.
        if (userInterrupted) break;
    }

    return { stateWithSim, allSimResults, lastDaySimResults, perDayResults, userInterrupted };
};

/**
 * Push a templated coach message to the user's chat list (GM mode only).
 * Creates or updates a chat with the team's head coach.
 */
function pushCoachMessage(state: GameState, messageText: string): GameState {
  if (state.gameMode !== 'gm' || !state.userTeamId) return state;

  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  const coach = state.staff?.coaches.find(c => c.team === userTeam?.name);

  if (!coach) return state;

  const newChats = [...(state.chats || [])];
  let chatIndex = newChats.findIndex(
    c => c.participants.includes('commissioner') && c.participants.includes(coach.name)
  );

  const gameDate = parseGameDate(state.date);
  const timestamp = gameDate.toISOString();

  const coachMessage = {
    id: `msg-${Date.now()}`,
    senderId: coach.name,
    senderName: coach.name,
    text: messageText,
    timestamp,
    read: false,
    seen: false,
    type: 'text' as const,
  };

  if (chatIndex === -1) {
    // Create new chat
    const newChat = {
      id: `chat-coach-${state.date}`,
      participants: ['commissioner', coach.name],
      participantDetails: [
        { id: 'commissioner', name: state.commissionerName, role: 'Commissioner' },
        { id: coach.name, name: coach.name, role: 'Coach', avatarUrl: coach.playerPortraitUrl },
      ],
      messages: [coachMessage],
      lastMessage: coachMessage,
      unreadCount: 1,
      isTyping: false,
    };
    newChats.unshift(newChat);
  } else {
    // Add to existing chat
    const chat = { ...newChats[chatIndex] };
    chat.messages = [...chat.messages, coachMessage];
    chat.lastMessage = coachMessage;
    chat.unreadCount = (chat.unreadCount ?? 0) + 1;
    newChats.splice(chatIndex, 1);
    newChats.unshift(chat);
  }

  return { ...state, chats: newChats };
}
