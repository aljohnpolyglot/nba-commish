import { GameState, NBATeam, NBAPlayer as Player, Game } from '../../../types';
import { simulateDayGames } from '../../../services/logic/simulationRunner';
import { calculateTeamStrength, clearTeamStrengthCache } from '../../../utils/playerRatings';
import { normalizeDate, convertTo2KRating, calculateSocialEngagement } from '../../../utils/helpers';
import { PlayoffGenerator } from '../../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../../services/playoffs/PlayoffAdvancer';
import { applyDailyProgression, applySeasonalBreakouts } from '../../../services/playerDevelopment/ProgressionEngine';
import { markLightningStrikes, resolveLightningStrikes } from '../../../services/playerDevelopment/seasonalBreakouts';
import { markFatherTimeInjections, resolveFatherTimeInjections, applyMiddleClassBoosts } from '../../../services/playerDevelopment/washedAlgorithm';
import { markBustLottery, resolveBustLottery } from '../../../services/playerDevelopment/bustLottery';
import { generateAIDayTradeProposals, executeAITrade } from '../../../services/AITradeHandler';
import { runAIFreeAgencyRound, runAIMidSeasonExtensions, runAISeasonEndExtensions, autoTrimOversizedRosters } from '../../../services/AIFreeAgentHandler';
import { routeUnsignedPlayers } from '../../../services/externalSigningRouter';
import { formatExternalSalary } from '../../../constants';
import { applySeasonRollover, shouldFireRollover } from '../../../services/logic/seasonRollover';
import { SettingsManager } from '../../../services/SettingsManager';
import { markTrainingCampShuffle, resolveTrainingCampChanges } from '../../../services/playerDevelopment/trainingCampShuffle';
import { buildShamsTransactionPost } from '../../../services/social/templates/charania';
import { findShamsPhoto } from '../../../services/social/charaniaphotos';

const updateTeamStrengths = (teams: NBATeam[], players: Player[]): NBATeam[] => {
    return teams.map(team => ({
        ...team,
        strength: calculateTeamStrength(team.id, players)
    }));
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
        playoffs = PlayoffGenerator.generateBracket(stateWithSim.teams, stateWithSim.leagueStats.year, numGamesPerRound);
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
    if (playoffs && dayResults.length > 0) {
        const playoffResults = dayResults.filter(r => {
            const g = schedule.find(sg => sg.gid === r.gameId);
            return g && (g.isPlayoff || g.isPlayIn);
        });
        if (playoffResults.length > 0) {
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
                const gameDate = new Date(playInStart);
                gameDate.setDate(gameDate.getDate() + dayOffset);
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

export const runSimulation = (state: GameState, daysToSimulate: number, action?: any) => {
    let stateWithSim = { ...state };

    // Clear cache at start of simulation batch
    clearTeamStrengthCache();

    // Pre-calculate strengths once for the batch
    stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);

    let allSimResults: any[] = [];
    let lastDaySimResults: any[] = [];
    const perDayResults: Array<{ date: string; results: any[] }> = [];

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

        const watchedResult = i === 0 ? action?.payload?.watchedGameResult : undefined;
        const simPatch = simulateDayGames(stateWithSim, watchedResult, effectiveRiggedForTid);

        stateWithSim = {
            ...stateWithSim,
            teams: simPatch.teams,
            schedule: simPatch.schedule,
            ...(simPatch.headToHead ? { headToHead: simPatch.headToHead } : {})
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

            // ── External league routing (end of summer FA window) ─────────────────
            // Any remaining unsigned NBA-caliber FAs are routed to Euroleague/G-League/PBA.
            const { results: routedResults, players: routedPlayers } = routeUnsignedPlayers(stateWithSim);
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
                            const extBaseYear = stateWithSim.leagueStats?.year ?? 2026;
                            const extContractYears = Array.from({ length: ext.newYears ?? 1 }, (_, i) => {
                                const yr = extBaseYear + i;
                                return {
                                    season: `${yr - 1}-${String(yr).slice(-2)}`,
                                    guaranteed: Math.round(ext.newAmount * 1_000_000 * Math.pow(1.05, i)),
                                    option: (i === (ext.newYears ?? 1) - 1 && ext.hasPlayerOption) ? 'Player' : '',
                                };
                            });
                            // Preserve historical contractYears (past seasons) and replace current+future
                            const existingPast = ((p as any).contractYears ?? []).filter((cy: any) => {
                                const yr = parseInt(cy.season.split('-')[0], 10) + 1;
                                return yr < extBaseYear;
                            });
                            return {
                                ...p,
                                contract: { ...p.contract, amount: Math.round(ext.newAmount * 1_000), exp: ext.newExp },
                                contractYears: [...existingPast, ...extContractYears],
                            };
                        }
                        if (declinedIds.has(p.internalId)) {
                            return { ...p, midSeasonExtensionDeclined: true } as any;
                        }
                        return p;
                    }),
                };

                // Log extensions to history — stagger dates across the 14-day window
                // so they don't all show as the same day in TransactionsView.
                const baseDate = new Date(stateWithSim.date);
                const extHistoryEntries = extensions.filter(e => !e.declined).map((e, idx) => {
                    const totalM = Math.round(e.newAmount * (e.newYears ?? 1));
                    const optTag = e.hasPlayerOption ? ' (player option)' : '';
                    // Seed offset per player (0–13 days) so each signing has a unique date
                    let playerSeed = 0;
                    for (let ci = 0; ci < e.playerId.length; ci++) playerSeed += e.playerId.charCodeAt(ci);
                    const dayOffset = playerSeed % 14;
                    const entryDate = new Date(baseDate);
                    entryDate.setDate(entryDate.getDate() - dayOffset);
                    const dateStr = entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return {
                        text: `${e.playerName} has re-signed with the ${e.teamName}: $${totalM}M/${e.newYears ?? 1}yr${optTag}`,
                        date: dateStr,
                        type: 'Signing',
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
                            const eeBaseYear = stateWithSim.leagueStats?.year ?? 2026;
                            const eeContractYears = Array.from({ length: ext.newYears ?? 1 }, (_, i) => {
                                const yr = eeBaseYear + i;
                                return {
                                    season: `${yr - 1}-${String(yr).slice(-2)}`,
                                    guaranteed: Math.round(ext.newAmount * 1_000_000 * Math.pow(1.05, i)),
                                    option: (i === (ext.newYears ?? 1) - 1 && ext.hasPlayerOption) ? 'Player' : '',
                                };
                            });
                            const existingPast = ((p as any).contractYears ?? []).filter((cy: any) => {
                                const yr = parseInt(cy.season.split('-')[0], 10) + 1;
                                return yr < eeBaseYear;
                            });
                            return {
                                ...p,
                                contract: { ...p.contract, amount: Math.round(ext.newAmount * 1_000), exp: ext.newExp },
                                contractYears: [...existingPast, ...eeContractYears],
                            };
                        }
                        if (declinedEE.has(p.internalId)) return { ...p, midSeasonExtensionDeclined: true } as any;
                        return p;
                    }),
                };
                const eeHistoryEntries = endExts.filter(e => !e.declined).map(e => {
                    const totalM = Math.round(e.newAmount * (e.newYears ?? 1));
                    const optTag = e.hasPlayerOption ? ' (player option)' : '';
                    return { text: `${e.playerName} re-signs with ${e.teamName} before free agency: $${totalM}M/${e.newYears ?? 1}yr${optTag}`, date: stateWithSim.date, type: 'Signing' };
                });
                if (eeHistoryEntries.length > 0) {
                    stateWithSim = { ...stateWithSim, history: [...(stateWithSim.history ?? []), ...eeHistoryEntries] };
                }
            }
        }

        // AI trade proposals — frequency increases as trade deadline approaches
        const simDateForTrades = normalizeDate(stateWithSim.date);
        const tradeDeadline = `${stateWithSim.leagueStats?.year ?? 2026}-02-15`;
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
        }

        // AI free agency — FA pool stays open July 1 → Feb 28 (March 1 = playoff eligibility deadline).
        // Frequency tapers like real NBA:
        //   Jul  1–15:  every day     (signing frenzy — moratorium lifts Jul 6)
        //   Jul 16–31:  every 2 days  (major deals wrapping up)
        //   August:     every 4 days  (role players / vets min)
        //   September:  every 7 days  (camp invites, stragglers)
        //   Oct–Feb:    every 14 days (occasional vet-minimum / waiver wire pickups)
        const simDateNorm = normalizeDate(stateWithSim.date);
        const [, simMonth, simDayNum] = simDateNorm.split('-').map(Number);
        // Summer FA: July–Sep; In-season FA: Oct–Feb (month ≥10 or month ≤2); stop at March 1
        const isFreeAgencySeason = (simMonth >= 7 && simMonth <= 9) || simMonth >= 10 || simMonth <= 2;
        const isRegularSeason = (simMonth >= 10 && simMonth <= 12) || (simMonth >= 1 && simMonth <= 4);

        // G-League auto-assignment: every 7 days during regular season
        // Players with 0 GP on teams that have played 15+ games get assigned to G-League
        if (isRegularSeason && stateWithSim.day % 7 === 0) {
            const currentYear = stateWithSim.leagueStats.year;
            const userTeamId = stateWithSim.teams[0]?.id;
            // Build a set of playerIds who appeared in any sim result this batch
            // (p.stats[] isn't updated until postProcessor, so we count from allSimResults)
            const playersWithGPThisBatch = new Set<string>();
            for (const r of allSimResults) {
                for (const s of [...(r.homeStats ?? []), ...(r.awayStats ?? [])]) {
                    if (s.playerId && s.min > 0) playersWithGPThisBatch.add(s.playerId);
                }
            }
            const glAssigned: string[] = [];
            const glReturned: string[] = [];
            const glUpdatedPlayers = stateWithSim.players.map(p => {
                if (p.tid === userTeamId || p.tid < 0 || p.tid >= 100) return p;
                if ((p as any).twoWay || (p as any).injury?.gamesRemaining > 0) return p;
                // Never G-League assign quality players — only fringe/end-of-bench guys
                const _r = (p as any).ratings?.[(p as any).ratings?.length - 1];
                const _k2 = 0.88 * (p.overallRating ?? 60) + 31 + ((_r?.hgt ?? 50) > 70 ? 2 : 0);
                if (_k2 >= 78) return p;
                const teamGP = (stateWithSim.teams.find(t => t.id === p.tid)?.wins ?? 0) +
                               (stateWithSim.teams.find(t => t.id === p.tid)?.losses ?? 0);
                // Grace period: don't G-League assign players who just joined via trade/signing
                // yearsWithTeam=0 means they're new to the team; wait until team has 14+ GP
                if ((p as any).yearsWithTeam === 0 && teamGP < 14) return p;
                // Check both stored stats AND this batch's sim results for GP
                const storedGP = ((p.stats ?? []) as any[]).find(
                    (s: any) => s.season === currentYear && !s.playoffs
                )?.gp ?? 0;
                const hasPlayedThisBatch = playersWithGPThisBatch.has(p.internalId);
                const playerGP = storedGP + (hasPlayedThisBatch ? 1 : 0);
                // If team has played 15+ games and this player has 0 GP → G-League
                if (teamGP >= 15 && playerGP === 0 && !(p as any).gLeagueAssigned) {
                    glAssigned.push(p.name);
                    return { ...p, gLeagueAssigned: true, gLeagueParentTid: p.tid };
                }
                // If player now has GP and was G-League assigned → return to active roster
                if ((p as any).gLeagueAssigned && playerGP > 0) {
                    glReturned.push(p.name);
                    return { ...p, gLeagueAssigned: false };
                }
                return p;
            });
            if (glAssigned.length > 0 || glReturned.length > 0) {
                stateWithSim = {
                    ...stateWithSim,
                    players: glUpdatedPlayers,
                    history: [
                        ...(stateWithSim.history ?? []),
                        ...glAssigned.map(name => ({ text: `${name} assigned to G-League affiliate`, date: stateWithSim.date, type: 'G-League Assignment' })),
                        ...glReturned.map(name => ({ text: `${name} recalled from G-League`, date: stateWithSim.date, type: 'G-League Callup' })),
                    ],
                };
            }
        }
        const faFrequency = simMonth === 7 && simDayNum <= 15 ? 1
                          : simMonth === 7 ? 2
                          : simMonth === 8 ? 4
                          : simMonth === 9 ? 7
                          : 14; // Oct–Feb in-season
        if (isFreeAgencySeason && stateWithSim.day % faFrequency === 0) {
            // Trim teams that exceeded the roster limit (e.g. due to trades or draft)
            // Pass simMonth so the trimmer uses the training camp limit during Jul–Sep
            console.log(`[RosterTrim] Calling autoTrimOversizedRosters: simMonth=${simMonth}, date=${stateWithSim.date}, day=${stateWithSim.day}`);
            const waivers = autoTrimOversizedRosters(stateWithSim, simMonth);
            console.log(`[RosterTrim] Month=${simMonth}, trimmed=${waivers.length} players`);
            if (waivers.length > 0) {
                const waiverIds = new Set(waivers.map(w => w.playerId));
                // October+ = regular season roster cut: release training camp players to FA pool
                // July–Sep = preseason period: assign to G-League affiliate (stays on roster count)
                const isTrainingCampCut = simMonth >= 10;
                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p => {
                        if (!waiverIds.has(p.internalId)) return p;
                        if (isTrainingCampCut) {
                            // Released from training camp — becomes free agent
                            return { ...p, tid: -1, status: 'FreeAgent' as const, gLeagueAssigned: false } as unknown as Player;
                        }
                        // Preseason overflow — send to G-League affiliate
                        return { ...p, gLeagueAssigned: true };
                    }),
                    history: [
                        ...(stateWithSim.history ?? []),
                        ...waivers.map(w => isTrainingCampCut
                            ? { text: `${w.playerName} released from training camp by the ${w.teamName}`, date: stateWithSim.date, type: 'Training Camp Release' }
                            : { text: `${w.playerName} assigned to G-League affiliate by the ${w.teamName}`, date: stateWithSim.date, type: 'G-League Assignment' }
                        ),
                    ],
                };
            }
            const signings = runAIFreeAgencyRound(stateWithSim);
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
                                guaranteed: annualAmt,
                                option: (i === signing.contractYears - 1 && signing.hasPlayerOption) ? 'Player' : '',
                            };
                        });
                        const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => {
                            const yr = parseInt(cy.season.split('-')[0], 10) + 1;
                            return yr < firstYear;
                        });
                        // Mark playoff ineligible if signed on/after March 1 (cosmetic flag)
                        const isAfterMarchDeadline = simMonth === 3 && simDayNum >= 1 || simMonth > 3;
                        return {
                            ...p,
                            tid: signing.teamId,
                            status: 'Active' as const,
                            contract: newContract,
                            contractYears: [...historicalYears, ...newContractYears],
                            playoffEligible: isAfterMarchDeadline ? false : undefined,
                            // Preserve two-way flag from Pass 3 signing — these players don't count against the 15-man roster
                            ...((signing as any).twoWay ? { twoWay: true } : {}),
                            // Track MLE signing type so TeamFinancesView can color MLE contract cells
                            ...(signing.mleTypeUsed ? { mleSignedVia: signing.mleTypeUsed } : {}),
                        };
                    }),
                };
                // Log FA signings to history — stagger dates within current window
                const faBaseDate = new Date(stateWithSim.date);
                const faHistoryEntries = signings.map(s => {
                    const annualM = Math.round(s.salaryUSD / 100_000) / 10;
                    const totalRaw = annualM * (s.contractYears ?? 1);
                    // Show $0.6M not $1M for sub-million deals
                    const totalStr = totalRaw < 1 ? totalRaw.toFixed(1) : Math.round(totalRaw).toString();
                    const optTag  = s.hasPlayerOption ? ' (player option)' : '';
                    let pSeed = 0;
                    for (let ci = 0; ci < s.playerId.length; ci++) pSeed += s.playerId.charCodeAt(ci);
                    const dayOff = pSeed % 5;
                    const eDate = new Date(faBaseDate);
                    eDate.setDate(eDate.getDate() - dayOff);
                    const dateStr = eDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return {
                        text: `${s.playerName} signs with the ${s.teamName}: $${totalStr}M/${s.contractYears ?? 1}yr${optTag}`,
                        date: dateStr,
                        type: 'Signing',
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
                        let pSeed = 0;
                        for (let ci = 0; ci < s.playerId.length; ci++) pSeed += s.playerId.charCodeAt(ci);
                        const dayOff = pSeed % 5;
                        const eDate = new Date(faBaseDate);
                        eDate.setDate(eDate.getDate() - dayOff);
                        return {
                            id: `fa-signing-${s.playerId}-${eDate.toISOString().slice(0, 10)}`,
                            headline,
                            content,
                            date: eDate.toISOString().slice(0, 10),
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
            }
        }
    }

    return { stateWithSim, allSimResults, lastDaySimResults, perDayResults };
};
