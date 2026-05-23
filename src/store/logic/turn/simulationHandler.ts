import { GameState, NBAPlayer as Player } from '../../../types';
import { simulateDayGames } from '../../../services/logic/simulationRunner';
import { injectCupGroupGames } from '../../../services/nbaCup/scheduleInjector';
import { clearTeamStrengthCache } from '../../../utils/playerRatings';
import { normalizeDate } from '../../../utils/helpers';
import { getTradeDeadlineDate, toISODateString } from '../../../utils/dateUtils';
import { generateAIDayTradeProposals, executeAITrade } from '../../../services/AITradeHandler';
import { tickTransferMarket } from '../../../services/transfer/transferMarketTicker';
import { applySeasonRollover } from '../../../services/logic/seasonRollover';
import { SettingsManager } from '../../../services/SettingsManager';
import { isNbaCupEnabled } from '../../../utils/ruleFlags';
import { getOffseasonDayPlan } from '../../../services/offseason/offseasonPlan';
import { injectCompetitionPostseasonGames } from '../../../services/competition/competitionResolver';
import { repairCompetitionSchedules } from '../../../services/competition/competitionScheduler';
import { pushCoachMessage } from './simulation/coachMessages';
import { applyAIFreeAgencyPass } from './simulation/aiFreeAgencyPass';
import { applyBirdRightsResignsPass } from './simulation/birdRightsPass';
import { applyCupSimulationPass } from './simulation/cupPass';
import { applyCompetitionProgression, applySimPatchState, dateSimulationResults } from './simulation/dayResults';
import { applyFAMarketTickPass, applyJan10GuaranteesPass, clearLegacyGLeagueAssignments } from './simulation/freeAgencyMarketPass';
import { applyPlayoffLogic, normalizeReservedJerseys, updateTeamStrengths } from './simulation/playoffPipeline';
import { applySeasonCalendarPasses } from './simulation/seasonCalendarPasses';

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
        stateWithSim = {
            ...stateWithSim,
            schedule: repairCompetitionSchedules(
                stateWithSim,
                stateWithSim.activeCompetitions ?? [],
                stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
            ),
        };
        stateWithSim = {
            ...stateWithSim,
            schedule: injectCompetitionPostseasonGames(
                stateWithSim,
                stateWithSim.activeCompetitions ?? [],
                stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
            ),
        };

        const simDateNorm = normalizeDate(stateWithSim.date);
        const [, simMonth, simDayNum] = simDateNorm.split('-').map(Number);

        const watchedResult = i === 0 ? action?.payload?.watchedGameResult : undefined;

        // Snapshot user team's pre-sim elimination status
        const preSimUserTeam = stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined
            ? stateWithSim.teams.find(t => t.id === stateWithSim.userTeamId)
            : undefined;

        let simPatch = await simulateDayGames(stateWithSim, watchedResult, effectiveRiggedForTid, onGame);

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
        ({ stateWithSim, simPatch } = applyCupSimulationPass(stateWithSim, simPatch));

        stateWithSim = applySimPatchState(stateWithSim, simPatch, justEliminated, newInjToasts, newFeatToasts);

        const datedSimResults = dateSimulationResults(stateWithSim, simPatch.results);

        allSimResults.push(...datedSimResults);
        perDayResults.push({ date: stateWithSim.date, results: datedSimResults });

        if (i === daysToSimulate - 1) {
            lastDaySimResults = datedSimResults;
        }

        // Advance playoff bracket after today's results (handles play-in advancement + round injection)
        if (datedSimResults.length > 0) {
            stateWithSim = applyPlayoffLogic(stateWithSim, datedSimResults, numGamesPerRound);
            stateWithSim = applyCompetitionProgression(
                stateWithSim,
                allSimResults,
                stateWithSim.activeCompetitions ?? [],
                stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
            );
        }

        const { stateWithSim: calendarState, simDateNorm: simDateForEvents, isPlayoffDay } =
            applySeasonCalendarPasses(stateWithSim);
        stateWithSim = calendarState;

        // AI trade proposals — frequency increases as trade deadline approaches
        const simDateForTrades = normalizeDate(stateWithSim.date);
        const tradeDeadline = toISODateString(getTradeDeadlineDate(stateWithSim.leagueStats?.year ?? new Date().getFullYear(), stateWithSim.leagueStats));
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

        // ── Offseason orchestrator (Sessions 3-4 — plan is AUTHORITATIVE) ──
        // The plan owns all four offseason dispatch decisions: rollover,
        // tickFAMarkets, runAIFAPass, runBirdRightsPass. Date arithmetic, the
        // moratorium check, and the FA frequency taper all live in
        // src/services/offseason/offseasonPlan.ts. Per-function drift warnings
        // (Session 1) still fire if a non-orchestrator caller invokes one of
        // these in the wrong phase.
        const offseasonPlan = getOffseasonDayPlan(stateWithSim);

        // Season rollover — fires once at the postDraft → moratorium boundary.
        // Year increment inside applySeasonRollover acts as the idempotency guard.
        if (offseasonPlan.actions.rollover === 'fire') {
            console.log(`[OSPLAN] simulationHandler.rollover fire date=${stateWithSim.date}`);
            const rolloverPatch = applySeasonRollover(stateWithSim);
            stateWithSim = { ...stateWithSim, ...rolloverPatch };
            // Re-compute strengths after roster changes from contract expiry
            stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);

            // (Historical note: an inline Bird Rights pass used to fire here on
            // rollover day, but it was disabled because rollover lands on Jun 30
            // — pre-moratorium — and would create tampering signings that jump
            // active user bids. Bird Rights now fires via the orchestrator's
            // runBirdRightsPass action on the first post-moratorium day.)
        }

        // AI free agency — FA pool stays open July 1 → Feb 28 (March 1 = playoff eligibility deadline).
        // Frequency tapers like real NBA:
        //   Jul  1–15:  every day     (signing frenzy — moratorium lifts Jul 6)
        //   Jul 16–31:  every 2 days  (major deals wrapping up)
        //   August:     every 4 days  (role players / vets min)
        //   September:  every 7 days  (camp invites, stragglers)
        //   Oct–Feb:    every 14 days (occasional vet-minimum / waiver wire pickups)
        // The summer-FA window detection, moratorium check, and frequency tapering
        // all live in offseasonPlan.ts now (Session 3). The only var still needed
        // here is `isRegularSeason`, used for the G-League cleanup loop below.
        const isRegularSeason = (simMonth >= 10 && simMonth <= 12) || (simMonth >= 1 && simMonth <= 4);

        // Incumbent Bird Rights signings should not land on rollover/Jun 30 or
        // during the moratorium. They resolve once the market can actually sign.
        // Plan-authoritative since Session 3.
        if (offseasonPlan.actions.runBirdRightsPass === 'fire') {
            console.log(`[OSPLAN] simulationHandler.runBirdRightsPass fire date=${stateWithSim.date}`);
            stateWithSim = applyBirdRightsResignsPass(stateWithSim);
            stateWithSim = normalizeReservedJerseys(
                stateWithSim,
                stateWithSim.players.filter(p => (p as any).birdRightsResignedThisYear === (stateWithSim.leagueStats?.year ?? new Date().getFullYear())).map(p => p.tid),
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
        stateWithSim = clearLegacyGLeagueAssignments(stateWithSim, isRegularSeason);
        if (offseasonPlan.actions.tickFAMarkets === 'fire') {
            const faTickPass = applyFAMarketTickPass(stateWithSim);
            stateWithSim = faTickPass.stateWithSim;
            if (faTickPass.userInterrupted) userInterrupted = true;
        }
        stateWithSim = applyJan10GuaranteesPass(stateWithSim, simMonth, simDayNum);
        stateWithSim = applyAIFreeAgencyPass(stateWithSim, offseasonPlan, simMonth, simDayNum);

        // Euro Transfer Market: daily tick (AI listings/bids/accepts).
        // Safe to run in NBA mode too — transferListings array would be empty —
        // but gate on euro_isolated for clarity + perf.
        if (stateWithSim.leagueStats?.uiMode === 'euro_isolated') {
            const tmTick = tickTransferMarket(stateWithSim);
            stateWithSim = {
                ...stateWithSim,
                transferListings: tmTick.transferListings,
                transferBids: tmTick.transferBids,
                transferActivity: tmTick.transferActivity,
                players: tmTick.players,
                teams: tmTick.teams,
                nonNBATeams: tmTick.nonNBATeams,
                ...(tmTick.historyEntries.length > 0 ? {
                    history: [...(stateWithSim.history ?? []), ...tmTick.historyEntries] as any,
                } : {}),
                ...(tmTick.userBidResolutions.length > 0 ? {
                    pendingTransferToasts: [
                        ...(stateWithSim.pendingTransferToasts ?? []),
                        ...tmTick.userBidResolutions,
                    ],
                } : {}),
            };
        }

        // End-of-day: if a user-facing FA event fired this tick, stop the batch
        // so the toast/modal lands at the resolution moment. The day's full
        // pipeline (games, trim, AI signings, etc.) has completed, so state is
        // coherent — next sim resumes on day+1.
        if (userInterrupted) break;
    }

    return { stateWithSim, allSimResults, lastDaySimResults, perDayResults, userInterrupted };
};
