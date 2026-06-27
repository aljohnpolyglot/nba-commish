/**
 * Debug cheats, GTA-style.
 *
 * Type a cheat code into the Free Agents search bar and press Enter.
 * Inspired by HESOYAM / ROCKETMAN / IAMHERE from San Andreas / V.
 *
 * Most cheats log to the console (F12 → Console) — that's by design. The
 * search bar just triggers the action; the output lives in DevTools.
 */

import type { GameState } from '../../types';
import { convertTo2KRating, normalizeDate } from '../helpers';
import { estimatePotentialBbgm } from '../playerRatings';
import { deriveLeagueStartYearFromHistory, explainJerseyRetirementCandidates } from '../../services/playerDevelopment/jerseyRetirementChecker';
import { resolveTeamStrategyProfile } from '../teamStrategy';
import { calcPlayerTV, calcPickTV, calcOvr2K } from '../../services/trade/tradeValueEngine';
import { DEFAULT_TRADABLE_PICK_SEASONS } from '../../services/draft/DraftPickGenerator';
import { effectiveRecord, getCapThresholds, getTeamPayrollUSD, getTeamDeadMoneyForSeason } from '../salaryUtils';
import { processSimulationResults } from '../../store/logic/turn/postProcessor';
import { ROSTER_URL } from '../../constants';
import { copyTextToClipboard, type CheatContext, type CheatResult } from './shared';
import { runFaAudit, runEconAudit } from './economyAuditCheats';
import { runSample12, runScoreProf, runPlayerDist } from './realisticSamplingCheats';
import { runTeamCheck, runLeaders, runDistShape } from './realisticSeasonShapeCheats';
import { runTiers, runAdvCheck, runBenchEff } from './realisticAdvancedCheats';
import { runPerSample } from './realisticPerCheats';
import { runSimBench } from './realisticBenchmarkLeagueCheats';
import { runPlayerBench } from './realisticBenchmarkPlayerCheats';
import { runSimLeaders, runSimTrace } from './realisticBenchmarkLeaderCheats';
import { runSpam, runWarp, runStuck, runPhaseDump, runGateScan, runWarpSlow } from './stressCheats';
import { resolveEffectiveTrainingPlan } from '../../services/training/trainingPlanResolver';
import { MinutesPlayedService } from '../../services/simulation/MinutesPlayedService';
import { resolveRotationPlan } from '../../services/simulation/rotationPlan';
import { KNOBS_DEFAULT } from '../../services/simulation/SimulatorKnobs';
import { deriveOfficialNbaRecords } from '../nbaOfficialRecords';
import { rebuildCupGroupStandingsFromSchedule } from '../../services/nbaCup/resolveGroupStage';
import { isFilipino } from '../../services/pba/importManager';
import { getPbaDraftPool, tunePbaDraftProspects } from '../../services/pba/draftRules';
import { logPbaLazySimAudit } from '../pbaLazySimDebug';
import { logBasketballUniverseAudit } from '../basketballUniverseAudit';

export type { CheatContext, CheatResult } from './shared';

// ─── Cheat registry ──────────────────────────────────────────────────────────

export const CHEAT_CODES = {
  FIXROOKIES: 'Fix bugged rookie contracts (contract.amount / contractYears inflated ×1M from pre-rollover draft)',
  HELP: 'List all cheat codes',
  KEYS: 'Alias for HELP',
  AUDIT: 'Run scripts/audit-economy-deep.js + audit-fa-status.js in console',
  FAAUDIT: 'Run scripts/audit-fa-status.js only',
  ECONAUDIT: 'Run scripts/audit-economy-deep.js only',
  QUOTA: 'Show IndexedDB storage usage',
  CLEARCACHE: 'Delete imageCache IndexedDB (frees ~100–200 MB)',
  SAVENOW: 'Force save bypassing quota modal (risky if storage full)',
  HEALALL: 'Heal all injured players on user team (GM mode)',
  STATE: 'Dump condensed state summary to console',
  PLAYERS: 'Player count by status (league distribution)',
  NUGROT: 'Rotation debug for Denver (or user team fallback): inputs, computed depth/order, allocated minutes, and Jokic row',
  FATIGUEAUDIT: 'Investigate trainingFatigue spikes. Logs league-wide 90+ fatigue outliers, your roster with MPG/training/recent game load, and the next/last 7 days of schedule + plans.',
  FATIGUEFIX: 'Emergency league fatigue repair: caps NBA roster fatigue to MPG-based sane values and logs before/after rows. Use after FATIGUEAUDIT.',
  FATIGUEFIXALL: 'Alias for FATIGUEFIX.',
  EUROAUDIT: 'Euro-isolated save audit: roster ids/statuses, external club roster counts, contaminated Euro box scores, NBA-state leaks.',
  EUROFIX: 'Euro-isolated save repair: normalize external player tids/statuses, clear NBA FA state, heal FIBA timing, purge contaminated Euro box scores and rebuild Euro season stats.',
  COPYTP: 'Copy current Player Stats rows with TP/FG ratings + 3PA context as TSV',
  NAMECHECK: 'Audit for country → name mismatch (USA names in Euroleague, etc.)',
  RETIRECHECK: 'List HOF retirees still aging past 95 without diedYear',
  EXPORTSAVE: 'Download current save as JSON to your Downloads folder',
  IMPORTSAVE: 'Load a save from a JSON file (choose file)',
  SAVETODISK: 'Pick a folder on your disk and save there (/basketcommisionersim/saves/)',
  LOADFROMDISK: 'Load a save from your picked folder',
  NUKE: 'Delete ALL IndexedDB data (with confirmation) — full reset',
  FAPOOL: 'FA pool K2 tier counts (90+/85+/80+/75+), by-league breakdown, top 20 players',
  GROWTH: 'Avg K2 OVR per age (18–35) + year-over-year delta — spots runaway progression',
  MIDSEASON: 'Signings > $10M dated Nov 1 onwards — surfaces mid-season mega-deal outliers',
  TWOWAYAGE: 'Two-way contract age distribution — should be dominated by ≤24yo / ≤2-YOS players',
  RESIGNS: 'Players with multiple "re-signed" entries in the same offseason — duplicate label bug check',
  PICKS: 'Draft pick inventory — picks per season, per-team ownership counts, missing-team detector',
  PBADRAFT: 'PBA draft-pool audit — logs current mock-draft visibility inputs, year buckets, Filipino filter matches, and blocked prospects',
  PBADRAFTFIX: 'Retune the current save’s Filipino draft prospects in place — rewrites age/OVR/POT for the already-seeded PBA class',
  PBA_TEST_LAZY_SIM: 'PBA lazy-sim audit — logs regular season, playoffs, finals, awards, imports, conference transitions, and missing checkpoints.',
  BASKETAUDIT: 'Read-only basketball universe sanity check — NBA schedule/playoffs, Euro competitions, PBA conferences, roster scopes.',
  SALARYAUDIT: 'Players with 3+ NBA seasons played but sparse/missing contractYears — tracks contract history gaps as sim progresses',
  JERSEYAUDIT: 'Jersey retirement audit — shows current candidates, pre-save retirees, and why each case was included or skipped',
  JERSEYRETIREMENT: 'Alias for JERSEYAUDIT',
  JERSEYRAWFIX: 'Repair missing historical stats[].jerseyNumber from the raw alexnoob BBGM roster, then reload the save',
  JERSEYHEAL: 'Repair raw jersey numbers, then apply any due/overdue automatic jersey retirements to the current save',
  STRATEGY: 'Per-team strategy profile (key/role/mode/weights) + executed trades with sender/receiver TVs',
  CUPDEBUG: 'NBA Cup state dump — groups, scheduled cup games, played count, knockout bracket, awards',
  CUPSIM: 'Sim-jump to Dec 17 to play out the entire Cup window (group stage → knockouts → awards)',
  CUPINJECT: 'Retroactively inject Cup group games into a save where groups exist but no Cup games were scheduled (recovers broken pre-fix saves)',
  SCHEDAUDIT: 'Schedule integrity audit — orphaned games, per-team GP vs 82, All-Star blackout casualties, asymmetric W/L',
  SCHEDFIX: 'Repair current-season 82-game schedule gaps: moves orphaned unplayed games to today and adds makeup games for teams scheduled below 82',
  FIXPOT: 'Clamp inflated POT on PBA (→50) and ChinaCBA (→54) players in the current save',
  APRON: 'List teams over the 2nd apron with cap status, live payroll, and dead-money load',
  DEADAUDIT: 'Per-team dead-money ranking (current-season hit + total remaining + entry count)',
  CLEARDEAD: 'Wipe ALL dead money on the user\'s team — emergency unstuck for snowballed saves',
  CLEARDEADALL: 'Wipe dead money on every AI team (preserves user team) — full league reset',
  RECENCY: 'List players signed in the last 30 days (verifies signedDate stamping + trim recency guard)',
  TX: 'Dump recent transactions (signings/waivers/trades/training-camp releases) + per-team dead-money entries — saves copy-pasting TransactionsView',
  SPAM: 'Spam-click ADVANCE_DAY 60×; logs date/phase delta per tick + flags stuck dates, unplayed past games, thrown errors. (For debugging Bug A / sim-skip)',
  WARP: 'Multiverse fast-forward 5 seasons via SIMULATE_TO_DATE jumps (training camp → opening → deadline → All-Star → playoffs → lottery → draft → FA → next camp). Logs phase mismatches, stuck FA markets, unplayed past games, broken gates per checkpoint. (For Bugs B/C/D/F)',
  STUCK: 'Diagnose current state for known stuck conditions — Bug D (FA "Resolves today" with no progress), Bug A (past-dated unplayed games), Bug F (phase vs date mismatch), Bug B (draftComplete drift), gate-bypass surfaces. Codex-friendly handoff dump.',
  PHASEDUMP: 'Dump current SimPhase, all key calendar dates (training camp, opening, deadline, All-Star, lottery, draft, FA start, moratorium end), and what PlayButton would offer right now. Cross-references getSimPhase() vs raw date.',
  GATESCAN: 'Inspect roster/draft gate state — pending action, last attempt, why each gate did/didn\'t fire. Useful when "Until X" silently does nothing.',
  WARPSLOW: 'Crawl forward in 7-day SIMULATE_TO_DATE hops with a 30s per-hop timeout. On stall, prints the exact start date, last advanced date, and a state snapshot — pinpoints which day the lazy sim hangs on.',
  SAMPLE12: 'Stratified 24-game box-score sample (6 low / 10 mid / 6 high / 1 blowout / 1 OT) for sim-realism audit. Per team-game: pts/FGA/eFG%/AST/AR/FTA-rate; computes pts↔eFG% and AR↔FG% correlations. Plain-text TSV in console (Ctrl+A, Ctrl+C) AND clipboard.',
  SCOREPROF: 'Score↔eFG% binned audit using ALL available NBA team-games (not just 24). Bins by score: <95 / 95-105 / 105-115 / 115-125 / 125+. Per bin: count, avg pts/FGA/eFG%/AR/FTrate, σ eFG%. Plus 10 worst pts↔eFG% inversions. Diagnoses score-profile decoupling architecturally.',
  PLAYERDIST: 'Per-player FGA/min and pts/min distribution audit on last 100 NBA games (~2400 player-rows). Bins by MIN: <5 / 5-15 / 15-25 / 25-35 / 35+. Per bucket: count, avg FGA/min, pts/min, eFG%, σ values. Flags hot/cold outliers + role-player vs star pacing pathologies.',
  TEAMCHECK: 'Per-team season averages vs NBA 2025-26 reference ranges. Outputs all 30 NBA teams: GP, W-L, PPG, OPP, FG%, 3P%, FT%, eFG%, FGA, AST, REB, TOV, PF. Sorted by PPG. Flags teams outside NBA real ranges. Pure NBA games only.',
  LEADERS: 'Top 10 league leaders in 8 categories (PPG, RPG, APG, SPG, BPG, FGA, 3PM, FT%) compared to NBA 2025-26 reference values (Jokic 27.7 PPG, Curry 5+ 3PM/g, etc.). Flags categories where sim leader exceeds NBA top or falls short. Min 10 GP filter.',
  DISTSHAPE: 'Distribution shape audit (qualifying players, ≥20 GP) vs NBA 2025-26 P10/P25/P50/P75/P90 percentiles. Categories: PPG, FGA/G, TS%, USG%. Flags percentile bands outside NBA reference (Gemini benchmark: PPG median 10.8, P90 26.4; TS% median .578, P90 .660; USG% median 18.5, P90 31.0).',
  TIERS: 'PPG tier counts vs NBA 2025-26: how many players at 30+, 28+, 26+, 24+, 22+, 20+, 18+, 15+, 12+, 10+ PPG (≥20 GP). Reveals talent distribution at each scoring tier — direct check against NBA reference (e.g. NBA has ~2 players at 30+, ~37 at 20+). Flags tiers under or over NBA count.',
  ADVCHECK: 'Consolidated advanced-stats audit: player top-5 in 8 metrics (PER, USG%, ORtg, DRtg, BPM, VORP, WS, WS/48) and team ORtg/DRtg/NetRtg/PACE — all vs NBA 2025-26 reference (Jokic PER 32.3, Wemby DRtg 101.0, etc.). Flags leaders outside NBA range. Single TSV dump.',
  BENCHEFF: 'Sixth-man / limited-min efficiency audit (14-26 mpg, ≥20 GP). Top 15 by PER with TS%/USG%/PPG/FGA-per-min/eFG%. Reveals mid-tier PER compression vs NBA real Tyler Herro/Norman Powell/Jordan Clarkson tier (PER 14-17, TS% .55-.62). NBA sixth-men maintain higher per-min efficiency despite limited touches.',
  PERSAMPLE: 'Random 30-player PER audit. For each player: stored season PER, minute-weighted recomputed PER from current season game samples, GP/MPG, and three recent game-PER entries. Shows whether season PER is stale/aggregated wrong or the underlying game PER is wrong.',
  RESTOREPER: 'Rebuild current-season PER and advanced season fields from saved boxScores. Repairs stale/bugged season advanced rows in older saves without resimming games.',
  HEALSTUCK: 'Heal stuck offseason — strips offseasonChecklist, faTagCounter, faTagsTotal, offseasonExitedYear from the newest save in IndexedDB and reloads. Use when the FA Tasks sidebar refuses to dismiss.',
  HISTORYHEAL: 'NBA season-history heal — rebuilds current-season All-NBA / All-Defensive / All-Rookie flat awards from Award Races, restores All-Star player awards from the live roster, removes stale composite current-season award blobs, and rewrites NBA team season W-L rows from played schedule.',
  SIMBENCH: 'Aggregate per-team-game stats from already-played NBA box scores and compare against 2026SimBenchmark.md league averages. Logs delta table (PPG, FG%, 3P%, eFG%, TS%, AST, REB, ORB, TOV, PF, PACE) + TSV to clipboard.',
  PLAYERBENCH: 'Aggregate per-player-game stats from already-played NBA box scores and compare against 2026SimBenchmark.md Part 5 (distribution shape: P10/P25/median/P75/P90) and Part 6 (positional averages PG/SG/SF/PF/C). TSV to clipboard.',
  SIMTRACE: 'Toggle realistic-engine possession trace. When ON, every possession of the next sim logs to console (zone, made/miss, shooter, assister, fouled, FT). Run again to turn OFF.',
  SIMLEADERS: 'Compare sim Top 10 in 8 categories (PPG/RPG/APG/SPG/BPG/3PM/3PA/FGA/FT%/FG%/eFG%/TS%) and team ranges (PPG/FG%/3P%/eFG%/ORtg/DRtg/PACE) against 2026SimBenchmark.md Part 2+3+4+5. Highlights gap between sim leader and NBA reference (Doncic 33.5, Wemby 4.0 BPG, Jokic 10.7 APG, Curry 4.6 3PM, etc.).',
} as const;

export type CheatCode = keyof typeof CHEAT_CODES;

// ─── Cheat handlers ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + (n / 1_000_000).toFixed(1) + 'M';
}

function normalizeRawPlayerName(name: any): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawPlayerKey(player: any): string {
  return `${normalizeRawPlayerName(player?.name)}|${player?.born?.year ?? ''}`;
}

function aggregateCurrentSeasonRegularStats(player: any, season: number): {
  gp: number;
  min: number;
  pts: number;
} {
  const rows = Array.isArray(player?.stats)
    ? player.stats.filter((s: any) => Number(s?.season) === season && !s?.playoffs)
    : [];
  return rows.reduce(
    (acc: { gp: number; min: number; pts: number }, row: any) => {
      acc.gp += Number(row?.gp ?? 0);
      acc.min += Number(row?.min ?? 0);
      acc.pts += Number(row?.pts ?? 0);
      return acc;
    },
    { gp: 0, min: 0, pts: 0 },
  );
}

function recentMpgForAudit(player: any, season: number): number {
  const agg = aggregateCurrentSeasonRegularStats(player, season);
  if (agg.gp > 0) return agg.min / agg.gp;
  const regularRows = Array.isArray(player?.stats)
    ? player.stats.filter((s: any) => !s?.playoffs)
    : [];
  const latest = regularRows[regularRows.length - 1];
  const gp = Number(latest?.gp ?? 0);
  return gp > 0 ? Number(latest?.min ?? 0) / gp : 0;
}

function runPbaDraftAudit(state: GameState): CheatResult {
  const uiMode = (state.leagueStats as any)?.uiMode;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const date = String(state.date ?? '');
  const draftComplete = !!(state as any).draftComplete;
  const selectedYear = draftComplete ? currentYear + 1 : currentYear;
  const allProspects = (state.players ?? []).filter((player: any) =>
    player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect',
  );
  const pbaProspects = allProspects.filter((player: any) => isFilipino(player));
  const visibleToMockDraft = getPbaDraftPool(pbaProspects as any, selectedYear, state.leagueStats);
  const yearBuckets = new Map<string, number>();
  for (const player of pbaProspects) {
    const rawDraftYear = (player as any).draft?.year;
    const key = rawDraftYear == null || rawDraftYear === '' ? 'missing' : String(rawDraftYear);
    yearBuckets.set(key, (yearBuckets.get(key) ?? 0) + 1);
  }
  const visibleRows = visibleToMockDraft.slice(0, 25).map((player: any) => ({
    name: player.name,
    status: player.status,
    tid: player.tid,
    draftYear: (player as any).draft?.year ?? 'missing',
    bornLoc: player.born?.loc ?? '',
    nationality: (player as any).nationality ?? (player as any).born?.country ?? '',
    ovr: player.overallRating ?? player.ratings?.[player.ratings.length - 1]?.ovr ?? '—',
    pot: player.ratings?.[player.ratings.length - 1]?.pot ?? '—',
  }));
  const blockedRows = allProspects
    .filter((player: any) => !isFilipino(player))
    .slice(0, 25)
    .map((player: any) => ({
      name: player.name,
      status: player.status,
      tid: player.tid,
      draftYear: (player as any).draft?.year ?? 'missing',
      bornLoc: player.born?.loc ?? '',
      nationality: (player as any).nationality ?? (player as any).born?.country ?? '',
    }));

  console.group('%c🇵🇭 PBADRAFT', 'color:#f59e0b;font-weight:bold');
  console.log({
    date,
    uiMode,
    currentYear,
    draftComplete,
    selectedYear,
    allProspectCount: allProspects.length,
    pbaProspectCount: pbaProspects.length,
    visibleToMockDraftCount: visibleToMockDraft.length,
  });
  console.log('PBA prospect draft.year buckets:');
  console.table(Array.from(yearBuckets.entries()).map(([draftYear, count]) => ({ draftYear, count })));
  console.log('Visible to mock draft right now:');
  console.table(visibleRows);
  if (blockedRows.length > 0) {
    console.log('Blocked by Filipino filter:');
    console.table(blockedRows);
  } else {
    console.log('No prospects blocked by Filipino filter.');
  }
  console.groupEnd();

  return {
    title: 'PBADRAFT',
    body: visibleToMockDraft.length > 0
      ? `${visibleToMockDraft.length} PBA prospect(s) are visible for ${selectedYear}. See console for the sample table.`
      : `No PBA prospects are visible for ${selectedYear}. See console for draft.year buckets and Filipino-filter blockers.`,
    ok: visibleToMockDraft.length > 0,
  };
}

async function runPbaDraftFix(ctx: CheatContext): Promise<CheatResult> {
  const live = getLive(ctx);
  if ((live.leagueStats as any)?.uiMode !== 'pba_isolated') {
    return { title: 'PBADRAFTFIX', body: 'This cheat only applies in PBA isolated mode.', ok: false };
  }

  const currentYear = live.leagueStats?.year ?? new Date().getFullYear();
  const before = (live.players ?? []).filter((player: any) =>
    (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') && isFilipino(player),
  );
  const tunedPlayers = tunePbaDraftProspects((live.players ?? []) as any, currentYear, live.leagueStats);
  const after = tunedPlayers.filter((player: any) =>
    (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') && isFilipino(player),
  );
  const beforeById = new Map(before.map((player: any) => [player.internalId, player]));
  const changedRows = after
    .map((player: any) => {
      const prev = beforeById.get(player.internalId);
      if (!prev) return null;
      const prevRating = prev.ratings?.[prev.ratings.length - 1];
      const nextRating = player.ratings?.[player.ratings.length - 1];
      const prevOvr = Number(prev.overallRating ?? prevRating?.ovr ?? 0);
      const nextOvr = Number(player.overallRating ?? nextRating?.ovr ?? 0);
      const prevPot = Number(prev.potential ?? prevRating?.pot ?? 0);
      const nextPot = Number(player.potential ?? nextRating?.pot ?? 0);
      const prevAge = Number(prev.age ?? 0);
      const nextAge = Number(player.age ?? 0);
      if (prevOvr === nextOvr && prevPot === nextPot && prevAge === nextAge) return null;
      return {
        name: player.name,
        draftYear: (player as any).draft?.year ?? 'missing',
        ageBefore: prevAge,
        ageAfter: nextAge,
        ovrBefore: prevOvr,
        ovrAfter: nextOvr,
        potBefore: prevPot,
        potAfter: nextPot,
      };
    })
    .filter(Boolean);

  await ctx.dispatchAction({ type: 'UPDATE_STATE', payload: { players: tunedPlayers } } as any);
  console.group('%c🛠️ PBADRAFTFIX', 'color:#22c55e;font-weight:bold');
  console.log(`Current year: ${currentYear} | Filipino prospects tuned: ${after.length} | changed rows: ${changedRows.length}`);
  if (changedRows.length > 0) console.table(changedRows.slice(0, 60));
  console.groupEnd();

  return {
    title: 'PBADRAFTFIX',
    body: changedRows.length > 0
      ? `Retuned ${changedRows.length} existing PBA draft prospect row(s). Reopen Mock Draft if it was already on screen.`
      : `No existing PBA draft prospects needed retuning. Total Filipino prospects checked: ${after.length}.`,
    ok: true,
  };
}

function runFatigueAudit(state: GameState): CheatResult {
  const today = normalizeDate(state.date);
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const teams = state.teams ?? [];
  const players = state.players ?? [];
  const schedule = state.schedule ?? [];
  const teamById = new Map(teams.map(team => [team.id, team] as const));
  const userTid = (state as any).userTeamId;
  const userTeam = typeof userTid === 'number' ? teamById.get(userTid) : undefined;

  const gamesByTeam = new Map<number, any[]>();
  for (const game of schedule) {
    for (const tid of [game.homeTid, game.awayTid]) {
      if (typeof tid !== 'number') continue;
      const list = gamesByTeam.get(tid);
      if (list) list.push(game);
      else gamesByTeam.set(tid, [game]);
    }
  }
  for (const games of gamesByTeam.values()) {
    games.sort((a: any, b: any) => String(a?.date ?? '').localeCompare(String(b?.date ?? '')));
  }

  const getRecentLoad = (tid: number) => {
    const games = gamesByTeam.get(tid) ?? [];
    const last7Start = new Date(today);
    last7Start.setDate(last7Start.getDate() - 6);
    const next7End = new Date(today);
    next7End.setDate(next7End.getDate() + 6);
    let recentGames = 0;
    let recentAwayGames = 0;
    let upcomingGames = 0;
    let upcomingAwayGames = 0;
    let lastGameDate = '';
    let nextGameDate = '';
    for (const game of games) {
      const iso = normalizeDate(String(game.date ?? ''));
      if (!iso) continue;
      const time = new Date(iso).getTime();
      const isAway = game.awayTid === tid;
      if (iso <= today) lastGameDate = iso;
      if (!nextGameDate && iso >= today && !game.played) nextGameDate = iso;
      if (time >= last7Start.getTime() && time <= new Date(today).getTime()) {
        recentGames++;
        if (isAway) recentAwayGames++;
      }
      if (time >= new Date(today).getTime() && time <= next7End.getTime() && !game.played) {
        upcomingGames++;
        if (isAway) upcomingAwayGames++;
      }
    }
    return { recentGames, recentAwayGames, upcomingGames, upcomingAwayGames, lastGameDate, nextGameDate };
  };

  const fatigueLeaders = players
    .filter((player: any) => player.tid >= 0 && player.tid < 100)
    .map((player: any) => {
      const team = teamById.get(player.tid);
      const fatigue = Math.round(Number(player.trainingFatigue ?? 0) * 10) / 10;
      const agg = aggregateCurrentSeasonRegularStats(player, season);
      return {
        player: player.name,
        team: team?.abbrev ?? `tid${player.tid}`,
        pos: player.position ?? player.pos ?? '—',
        fatigue,
        intensity: player.trainingIntensity ?? 'Normal',
        mpg: Number(recentMpgForAudit(player, season).toFixed(1)),
        gp: agg.gp,
        ppg: agg.gp > 0 ? Number((agg.pts / agg.gp).toFixed(1)) : 0,
        injured: Number((player as any).injury?.gamesRemaining ?? 0),
        status: (player as any).status ?? '—',
      };
    })
    .filter(row => row.fatigue >= 90)
    .sort((a, b) => b.fatigue - a.fatigue || b.mpg - a.mpg);

  console.group('%c🥵 FATIGUEAUDIT', 'color:#f97316;font-weight:bold');
  console.log(`today=${today} season=${season} userTeam=${userTeam?.abbrev ?? 'none'}`);
  console.log(`Players at 90+ fatigue: ${fatigueLeaders.length}`);
  if (fatigueLeaders.length > 0) console.table(fatigueLeaders.slice(0, 60));

  if (!userTeam) {
    console.groupEnd();
    return {
      title: 'FATIGUEAUDIT',
      body: `Logged ${fatigueLeaders.length} league-wide 90+ fatigue outliers. No user team found for roster drilldown.`,
      ok: true,
    };
  }

  const teamPlayers = players
    .filter((player: any) => player.tid === userTeam.id)
    .map((player: any) => {
      const fatigue = Number(player.trainingFatigue ?? 0);
      const agg = aggregateCurrentSeasonRegularStats(player, season);
      const load = getRecentLoad(userTeam.id);
      const hasGameToday = (gamesByTeam.get(userTeam.id) ?? []).some((game: any) => normalizeDate(String(game.date ?? '')) === today);
      const plan = resolveEffectiveTrainingPlan(userTeam as any, today);
      return {
        player: player.name,
        pos: player.position ?? player.pos ?? '—',
        fatigue: Number(fatigue.toFixed(1)),
        intensity: player.trainingIntensity ?? 'Normal',
        mpg: Number(recentMpgForAudit(player, season).toFixed(1)),
        gp: agg.gp,
        ppg: agg.gp > 0 ? Number((agg.pts / agg.gp).toFixed(1)) : 0,
        injured: Number((player as any).injury?.gamesRemaining ?? 0),
        todayGame: hasGameToday ? 'Y' : 'N',
        todayPlan: plan ? `${plan.paradigm}-${plan.intensity}` : 'none',
        last7Games: load.recentGames,
        last7Away: load.recentAwayGames,
        next7Games: load.upcomingGames,
        next7Away: load.upcomingAwayGames,
        lastGame: load.lastGameDate || '—',
        nextGame: load.nextGameDate || '—',
      };
    })
    .sort((a, b) => b.fatigue - a.fatigue || b.mpg - a.mpg);

  const teamGames = gamesByTeam.get(userTeam.id) ?? [];
  const scheduleWindow = teamGames
    .filter((game: any) => {
      const iso = normalizeDate(String(game.date ?? ''));
      if (!iso) return false;
      const diffDays = Math.round((new Date(iso).getTime() - new Date(today).getTime()) / 86_400_000);
      return diffDays >= -7 && diffDays <= 7;
    })
    .map((game: any) => {
      const iso = normalizeDate(String(game.date ?? ''));
      const isHome = game.homeTid === userTeam.id;
      const oppTid = isHome ? game.awayTid : game.homeTid;
      const opp = teamById.get(oppTid);
      const plan = resolveEffectiveTrainingPlan(userTeam as any, iso);
      return {
        date: iso,
        type: game.played ? 'played' : 'upcoming',
        site: isHome ? 'vs' : '@',
        opp: opp?.abbrev ?? `tid${oppTid}`,
        score: game.played ? `${game.awayScore}-${game.homeScore}` : '—',
        plan: plan ? `${plan.paradigm}-${plan.intensity}` : 'none',
      };
    });

  const suspicious = teamPlayers.filter(row => row.fatigue >= 95 && row.last7Games <= 3);
  console.log(`User roster: ${userTeam.abbrev}`);
  console.table(teamPlayers);
  console.log(`Schedule window (${userTeam.abbrev}, ${today} ± 7d)`);
  console.table(scheduleWindow);
  if (suspicious.length > 0) {
    console.warn('High-fatigue low-load cases:', suspicious.map(row => `${row.player} (${row.fatigue})`).join(', '));
  }
  console.groupEnd();

  return {
    title: 'FATIGUEAUDIT',
    body: `${fatigueLeaders.length} league-wide 90+ fatigue outliers logged. ${userTeam.abbrev} roster drilldown printed${suspicious.length > 0 ? `; ${suspicious.length} suspicious low-load cases flagged.` : '.'}`,
    ok: true,
  };
}

async function runFatigueFix(ctx: CheatContext): Promise<CheatResult> {
  const state = getLive(ctx);
  const userTid = (state as any).userTeamId;
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const teamById = new Map((state.teams ?? []).map(team => [team.id, team] as const));
  const userTeam = typeof userTid === 'number' ? teamById.get(userTid) : undefined;
  const rows: Array<{
    player: string;
    team: string;
    pos: string;
    mpg: number;
    before: number;
    after: number;
    injured: number;
    intensity: string;
  }> = [];
  let changed = 0;

  const patchedPlayers = (state.players ?? []).map((player: any) => {
    const team = teamById.get(player.tid);
    if (!team || player.tid < 0 || player.tid > 29) return player;
    if (player.status && player.status !== 'Active') return player;
    const before = Math.max(0, Math.min(100, Number(player.trainingFatigue ?? 0)));
    const mpg = recentMpgForAudit(player, season);
    const injured = Math.max(0, Number(player.injury?.gamesRemaining ?? 0));
    const cap =
      injured > 0 ? 18
      : mpg >= 34 ? 45
      : mpg >= 28 ? 38
      : mpg >= 20 ? 30
      : mpg >= 10 ? 22
      : 12;
    const after = Math.min(before, cap);
    rows.push({
      player: player.name,
      team: team.abbrev ?? String(player.tid),
      pos: player.position ?? player.pos ?? '-',
      mpg: Number(mpg.toFixed(1)),
      before: Number(before.toFixed(1)),
      after: Number(after.toFixed(1)),
      injured,
      intensity: player.trainingIntensity ?? 'Normal',
    });
    if (Math.abs(after - before) < 0.05) return player;
    changed++;
    return { ...player, trainingFatigue: after };
  });

  rows.sort((a, b) => b.before - a.before || b.mpg - a.mpg);
  const changedRows = rows.filter(row => Math.abs(row.before - row.after) >= 0.05);
  const userRows = userTeam ? rows.filter(row => row.team === userTeam.abbrev) : [];
  console.group('%c🧊 FATIGUEFIX', 'color:#38bdf8;font-weight:bold');
  console.log(`season=${season} changed=${changed} scanned=${rows.length}`);
  if (changedRows.length > 0) {
    console.log('Changed players, top 120 by previous fatigue:');
    console.table(changedRows.slice(0, 120));
  }
  if (userRows.length > 0) {
    console.log(`User roster after caps: ${userTeam?.abbrev ?? userTeam?.name}`);
    console.table(userRows);
  }
  console.groupEnd();

  if (changed > 0) {
    await ctx.dispatchAction({ type: 'UPDATE_STATE', payload: { players: patchedPlayers } } as any);
  }

  return {
    title: 'FATIGUEFIX',
    body: changed > 0
      ? `Capped fatigue for ${changed} NBA player${changed === 1 ? '' : 's'}. Before/after tables logged. Save to persist.`
      : 'NBA fatigue already within sane caps. Table logged.',
    ok: true,
  };
}

function rawStatKey(stat: any): string {
  return `${Number(stat?.season)}|${Number(stat?.tid)}|${stat?.playoffs ? 1 : 0}`;
}

function latestRawJerseyNumber(rawPlayer: any): string | undefined {
  const root = rawPlayer?.jerseyNumber;
  if (root !== undefined && root !== null && root !== '') return String(root);
  const rows = Array.isArray(rawPlayer?.stats) ? [...rawPlayer.stats] : [];
  rows.sort((a, b) => Number(b?.season ?? 0) - Number(a?.season ?? 0));
  const row = rows.find(s => s?.jerseyNumber !== undefined && s?.jerseyNumber !== null && s?.jerseyNumber !== '');
  return row ? String(row.jerseyNumber) : undefined;
}

async function hydrateJerseyNumbersFromRawRoster(state: GameState): Promise<{
  patched: GameState;
  matchedPlayers: number;
  statRowsPatched: number;
  rootNumbersPatched: number;
  missingRawPlayers: string[];
}> {
  const response = await fetch(ROSTER_URL);
  if (!response.ok) throw new Error(`Raw roster fetch failed: ${response.status}`);
  const data = await response.json();
  const rawPlayers = Array.isArray(data?.players) ? data.players : [];
  const byKey = new Map<string, any>();
  const byName = new Map<string, any[]>();

  for (const raw of rawPlayers) {
    byKey.set(rawPlayerKey(raw), raw);
    const name = normalizeRawPlayerName(raw?.name);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(raw);
    byName.set(name, list);
  }

  let matchedPlayers = 0;
  let statRowsPatched = 0;
  let rootNumbersPatched = 0;
  const missingRawPlayers: string[] = [];

  const patchedPlayers = (state.players ?? []).map((player: any) => {
    const name = normalizeRawPlayerName(player?.name);
    if (!name) return player;
    const raw = byKey.get(rawPlayerKey(player)) ?? (
      byName.get(name)?.length === 1 ? byName.get(name)![0] : undefined
    );
    if (!raw) {
      if (/^(chris paul|kevin love|klay thompson)$/i.test(name)) missingRawPlayers.push(player.name);
      return player;
    }

    const rawJerseysByStat = new Map<string, string>();
    for (const stat of raw.stats ?? []) {
      if (stat?.jerseyNumber === undefined || stat?.jerseyNumber === null || stat?.jerseyNumber === '') continue;
      rawJerseysByStat.set(rawStatKey(stat), String(stat.jerseyNumber));
    }

    let changed = false;
    const stats = Array.isArray(player.stats)
      ? player.stats.map((stat: any) => {
          if (stat?.jerseyNumber !== undefined && stat?.jerseyNumber !== null && stat?.jerseyNumber !== '') return stat;
          const rawNumber = rawJerseysByStat.get(rawStatKey(stat));
          if (!rawNumber) return stat;
          changed = true;
          statRowsPatched++;
          return { ...stat, jerseyNumber: rawNumber };
        })
      : player.stats;

    const rootNumber = latestRawJerseyNumber(raw);
    const shouldPatchRoot = rootNumber && (player.jerseyNumber === undefined || player.jerseyNumber === null || player.jerseyNumber === '');
    if (shouldPatchRoot) {
      changed = true;
      rootNumbersPatched++;
    }
    if (!changed) return player;
    matchedPlayers++;
    return {
      ...player,
      stats,
      ...(shouldPatchRoot ? { jerseyNumber: rootNumber } : {}),
    };
  });

  return {
    patched: { ...state, players: patchedPlayers },
    matchedPlayers,
    statRowsPatched,
    rootNumbersPatched,
    missingRawPlayers,
  };
}

function teamDisplayNameForJersey(team: any): string {
  const name = String(team?.name ?? '').trim();
  const region = String(team?.region ?? '').trim();
  if (!region) return name;
  return name.toLowerCase().startsWith(`${region.toLowerCase()} `) ? name : `${region} ${name}`.trim();
}

function jerseyForTeamFromRawStats(player: any, tid: number): string | undefined {
  const rows = [...(player?.stats ?? [])]
    .filter((s: any) => !s?.playoffs && Number(s?.tid) === tid && s?.jerseyNumber !== undefined && s?.jerseyNumber !== null && s?.jerseyNumber !== '')
    .sort((a: any, b: any) => Number(b?.season ?? 0) - Number(a?.season ?? 0));
  return rows[0]?.jerseyNumber !== undefined ? String(rows[0].jerseyNumber) : undefined;
}

function repairExistingRetiredJerseyNumbers(state: GameState): { patched: GameState; repaired: any[] } {
  const playerByInternalId = new Map(
    (state.players ?? [])
      .filter((p: any) => p.internalId)
      .map((p: any) => [String(p.internalId), p])
  );
  const playerByPid = new Map(
    (state.players ?? [])
      .filter((p: any) => p.pid !== undefined && p.pid !== null && String(p.pid).trim() !== '')
      .map((p: any) => [String(p.pid), p])
  );
  const playerByName = new Map(
    (state.players ?? [])
      .filter((p: any) => p.name)
      .map((p: any) => [String(p.name).trim().toLowerCase(), p])
  );
  const repaired: any[] = [];

  const teams = (state.teams ?? []).map((team: any) => {
    const existing = ((team as any).retiredJerseyNumbers ?? []) as any[];
    if (existing.length === 0) return team;

    let changed = false;
    const retiredJerseyNumbers = existing.map(record => {
      if (record?.number !== undefined && record?.number !== null && String(record.number).trim() !== '') return record;
      const playerId = record?.playerId !== undefined && record?.playerId !== null ? String(record.playerId).trim() : '';
      const pid = record?.pid !== undefined && record?.pid !== null ? String(record.pid).trim() : '';
      const text = record?.text !== undefined && record?.text !== null ? String(record.text).trim().toLowerCase() : '';
      const player = (playerId ? playerByInternalId.get(playerId) : undefined)
        ?? (pid ? playerByPid.get(pid) : undefined)
        ?? (text ? playerByName.get(text) : undefined);
      const number = jerseyForTeamFromRawStats(player, team.id);
      if (!player || !number) return record;

      changed = true;
      repaired.push({
        player: player.name,
        team: teamDisplayNameForJersey(team),
        teamId: team.id,
        number,
        previousNumber: record?.number,
      });
      return { ...record, number, text: record?.text ?? player.name };
    });

    return changed ? { ...team, retiredJerseyNumbers } : team;
  });

  return { patched: repaired.length > 0 ? ({ ...state, teams } as GameState) : state, repaired };
}

function applyDueJerseyRetirements(state: GameState): { patched: GameState; applied: any[] } {
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const leagueStartYear = deriveLeagueStartYearFromHistory(state.history, currentYear);
  const rows = explainJerseyRetirementCandidates(
    state.players,
    state.teams,
    currentYear,
    { leagueStartYear, previewFreshRetirees: true },
  ).filter(r =>
    r.outcome === 'candidate' &&
    r.number &&
    r.tier &&
    r.reason &&
    (r.scheduledYear ?? currentYear) <= currentYear
  );

  if (rows.length === 0) return { patched: state, applied: [] };

  const now = Date.now();
  const applied: any[] = [];
  const teams = state.teams.map((team: any) => {
    const due = rows.filter(r => r.teamId === team.id);
    if (due.length === 0) return team;
    const existing = ((team as any).retiredJerseyNumbers ?? []) as any[];
    const retiredNumbers = new Set(existing.map(j => String(j.number)));
    const additions: any[] = [];
    for (const row of due) {
      if (!row.number || retiredNumbers.has(String(row.number))) continue;
      retiredNumbers.add(String(row.number));
      const player = state.players.find(p => p.internalId === row.playerId);
      const record = {
        number: String(row.number),
        text: row.name,
        pid: (player as any)?.pid,
        playerId: row.playerId,
        seasonRetired: currentYear,
        teamId: team.id,
        reason: row.reason,
        tier: row.tier,
      };
      additions.push(record);
      applied.push({ ...row, teamName: teamDisplayNameForJersey(team) });
    }
    return additions.length > 0
      ? { ...team, retiredJerseyNumbers: [...existing, ...additions] }
      : team;
  });

  const news = applied.map((row, i) => ({
    id: `jersey-heal-${row.playerId}-${row.teamId}-${now}-${i}`,
    headline: `${row.teamName} Retire #${row.number} for ${row.name}`,
    content: `${row.teamName} have retired #${row.number} in honor of ${row.name}, recognizing ${row.seasonsWithTeam ?? 0} seasons and ${row.gamesWithTeam ?? 0} games with the franchise.`,
    date: state.date,
    type: 'transaction' as const,
    category: 'Transaction',
    isNew: true,
    read: false,
  }));
  const history = applied.map(row => ({
    text: `${row.teamName} retired #${row.number} in honor of ${row.name}.`,
    date: state.date,
    type: 'Jersey Retirement',
    playerIds: [row.playerId],
  }));

  return {
    patched: {
      ...state,
      teams,
      news: [...news, ...(state.news ?? [])],
      history: [...(state.history ?? []), ...history],
    } as GameState,
    applied,
  };
}

const EURO_ROSTER_STATUSES = new Set(['Euroleague', 'Endesa', 'PBA', 'B-League', 'China CBA', 'NBL Australia']);

function euroStatusForTid(tid: number): string | undefined {
  if (tid >= 1000 && tid < 2000) return 'Euroleague';
  if (tid >= 2000 && tid < 3000) return 'PBA';
  if (tid >= 4000 && tid < 5000) return 'B-League';
  if (tid >= 5000 && tid < 6000) return 'Endesa';
  if (tid >= 7000 && tid < 8000) return 'China CBA';
  if (tid >= 8000 && tid < 9000) return 'NBL Australia';
  return undefined;
}

function euroTidOffsetForStatus(status?: string): number | null {
  if (status === 'Euroleague') return 1000;
  if (status === 'PBA') return 2000;
  if (status === 'B-League') return 4000;
  if (status === 'Endesa') return 5000;
  if (status === 'China CBA') return 7000;
  if (status === 'NBL Australia') return 8000;
  return null;
}

function normalizeExternalTid(tid: number, status?: string): number {
  const offset = euroTidOffsetForStatus(status);
  if (offset != null && tid >= 0 && tid < 100) return tid + offset;
  return tid;
}

function externalTidAliases(tid: number): Set<number> {
  const aliases = new Set([tid]);
  const status = euroStatusForTid(tid);
  const offset = euroTidOffsetForStatus(status);
  if (offset != null) aliases.add(tid - offset);
  return aliases;
}

function originalExternalTidFromId(player: any): number | null {
  const id = String(player?.internalId ?? '');
  let match = id.match(/^endesa-(\d+)-/);
  if (match) return 5000 + Number(match[1]);
  match = id.match(/^pba-(\d+)-/);
  if (match) return 2000 + Number(match[1]);
  match = id.match(/^bleague-(\d+)-/);
  if (match) return 4000 + Number(match[1]);
  match = id.match(/^chinacba-(\d+)-/);
  if (match) return 7000 + Number(match[1]);
  match = id.match(/^nblauss-(\d+)-/);
  if (match) return 8000 + Number(match[1]);
  match = id.match(/^euro-.+-(1\d{3})$/);
  if (match) return Number(match[1]);
  return null;
}

function isExternalOriginPlayer(player: any): boolean {
  const id = String(player?.internalId ?? '');
  return (
    id.startsWith('endesa-') ||
    id.startsWith('euro-') ||
    id.startsWith('pba-') ||
    id.startsWith('bleague-') ||
    id.startsWith('chinacba-') ||
    id.startsWith('nblauss-') ||
    id.startsWith('ext-gen-')
  );
}

function isNbaOriginOnExternalRoster(player: any): boolean {
  const tid = Number(player?.tid);
  return tid >= 100 && EURO_ROSTER_STATUSES.has(player?.status) && !isExternalOriginPlayer(player);
}

function dateMs(value: any): number {
  const ms = new Date(value ?? '').getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function playerTidAtDate(player: any, date: string, transferActivity: any[]): number {
  const targetMs = dateMs(date);
  let tid = Number(player?.tid ?? -999);
  const playerId = player?.internalId;
  if (!playerId || targetMs <= 0) return normalizeExternalTid(tid, player?.status);
  const moves = transferActivity
    .filter(a => a?.playerId === playerId)
    .sort((a, b) => dateMs(b.date) - dateMs(a.date));
  for (const move of moves) {
    if (dateMs(move.date) > targetMs && typeof move.fromTid === 'number') tid = move.fromTid;
  }
  return normalizeExternalTid(tid, player?.status);
}

function findUnauthorizedUserIncomingTransfers(state: GameState): any[] {
  const userTid = Number((state as any).userTeamId);
  if (state.gameMode !== 'gm' || !Number.isFinite(userTid) || userTid < 100) return [];
  const bids = ((state as any).transferBids ?? []) as any[];
  const players = new Map(((state.players ?? []) as any[]).map(p => [p.internalId, p]));
  return (((state as any).transferActivity ?? []) as any[]).filter(activity => {
    if (Number(activity?.toTid) !== userTid) return false;
    const player = players.get(activity.playerId);
    if (!player || Number(player.tid) !== userTid) return false;
    return !bids.some(b =>
      b?.playerId === activity.playerId &&
      Number(b?.bidderTid) === userTid &&
      Number(b?.sellerTid) === Number(activity.fromTid) &&
      b?.status === 'accepted' &&
      b?.userInitiated === true
    );
  });
}

function buildEuroAudit(state: GameState) {
  const players = (state.players ?? []) as any[];
  const nonNBATeams = ((state as any).nonNBATeams ?? []) as any[];
  const transferActivity = ((state as any).transferActivity ?? []) as any[];
  const byId = new Map(players.map(p => [p.internalId, p]));
  const euroTeams = nonNBATeams.filter(t => ['Euroleague', 'Endesa'].includes(t.league));

  const legacyTidPlayers = players.filter(p =>
    EURO_ROSTER_STATUSES.has(p.status) &&
    Number(p.tid) >= 0 &&
    Number(p.tid) < 100
  );
  const statusMismatches = players.filter(p => {
    const expected = euroStatusForTid(Number(p.tid));
    return expected && p.status && EURO_ROSTER_STATUSES.has(p.status) && p.status !== expected;
  });
  const sourceTidDrifts = players.filter(p => {
    const sourceTid = originalExternalTidFromId(p);
    return sourceTid != null && normalizeExternalTid(Number(p.tid), p.status) !== sourceTid;
  });
  const nbaOriginExternalRosterPlayers = players.filter(isNbaOriginOnExternalRoster);

  const rosterRows = euroTeams.map(team => {
    const aliases = externalTidAliases(Number(team.tid));
    const roster = players.filter(p => {
      const normalizedTid = normalizeExternalTid(Number(p.tid), p.status);
      return normalizedTid === Number(team.tid) || aliases.has(Number(p.tid));
    });
    return {
      tid: team.tid,
      league: team.league,
      team: team.name,
      players: roster.length,
      top: roster
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
        .slice(0, 3)
        .map(p => p.name)
        .join(', '),
    };
  });

  const contaminatedBoxes: any[] = [];
  for (const box of ((state.boxScores ?? []) as any[])) {
    const isEuroBox =
      box?.competitionId ||
      box?.homeTeamId >= 100 ||
      box?.awayTeamId >= 100;
    if (!isEuroBox) continue;

    const inspectSide = (side: 'home' | 'away') => {
      const tid = Number(side === 'home' ? box.homeTeamId : box.awayTeamId);
      const aliases = externalTidAliases(tid);
      const stats = side === 'home' ? box.homeStats ?? [] : box.awayStats ?? [];
      const bad = stats.filter((s: any) => {
        const p = byId.get(s.playerId);
        if (!p) return true;
        const tidAtGame = playerTidAtDate(p, box.date, transferActivity);
        return !aliases.has(tidAtGame);
      });
      return bad;
    };

    const homeBad = inspectSide('home');
    const awayBad = inspectSide('away');
    if (homeBad.length || awayBad.length) {
      contaminatedBoxes.push({
        gameId: box.gameId,
        date: String(box.date).slice(0, 10),
        competitionId: box.competitionId ?? '',
        matchup: `${box.awayTeamId}@${box.homeTeamId}`,
        homeBad: homeBad.length,
        awayBad: awayBad.length,
        examples: [...homeBad, ...awayBad].slice(0, 5).map((s: any) => s.name ?? s.playerId).join(', '),
      });
    }
  }

  const nbaStateLeaks = {
    faMarkets: ((state as any).faBidding?.markets ?? []).length,
    pendingFAToasts: ((state as any).pendingFAToasts ?? []).length,
    pendingRFAOfferSheets: ((state as any).pendingRFAOfferSheets ?? []).length,
    pendingRFAMatchResolutions: ((state as any).pendingRFAMatchResolutions ?? []).length,
    twoWayExternalPlayers: players.filter(p => Number(p.tid) >= 100 && !!p.twoWay).length,
    nonGuaranteedExternalPlayers: players.filter(p => Number(p.tid) >= 100 && !!p.nonGuaranteed).length,
  };

  const unauthorizedUserIncomingTransfers = findUnauthorizedUserIncomingTransfers(state).map(activity => ({
    playerName: activity.playerName,
    playerId: activity.playerId,
    fromTid: activity.fromTid,
    toTid: activity.toTid,
    date: activity.date,
    feeEUR: activity.feeEUR,
  }));

  return {
    rosterRows,
    legacyTidPlayers,
    statusMismatches,
    sourceTidDrifts,
    nbaOriginExternalRosterPlayers,
    contaminatedBoxes,
    nbaStateLeaks,
    unauthorizedUserIncomingTransfers,
  };
}

function isExternalCompetitionBox(box: any): boolean {
  return !!box?.competitionId || Number(box?.homeTeamId) >= 100 || Number(box?.awayTeamId) >= 100;
}

function isEuroPlayerLike(player: any): boolean {
  const tid = Number(player?.tid);
  return tid >= 100 || EURO_ROSTER_STATUSES.has(player?.status);
}

function latestRating(p: any): any {
  return Array.isArray(p?.ratings) && p.ratings.length > 0 ? p.ratings[p.ratings.length - 1] : {};
}

function buildTpAuditRowsFromState(state: GameState) {
  const teamById = new Map((state.teams ?? []).map((t: any) => [t.id, t.abbrev ?? t.name]));
  const currentSeason = state.leagueStats?.year;

  return (state.players ?? [])
    .filter((p: any) => p && p.tid >= 0 && p.tid < 100)
    .map((p: any) => {
      const r = latestRating(p);
      const stats = (p.stats ?? [])
        .filter((s: any) => !s.playoffs && (currentSeason == null || s.season === currentSeason))
        .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0));
      const s = stats[0] ?? {};
      const gp = s.gp || 0;
      const tpa = s.tpa || 0;
      const fga = s.fga || 0;
      return {
        name: p.name ?? '',
        team: teamById.get(p.tid) ?? p.tid,
        pos: p.pos ?? '',
        age: p.age ?? '',
        ratingTp: r.tp ?? '',
        ratingFg: r.fg ?? '',
        ratingFt: r.ft ?? '',
        ratingIns: r.ins ?? '',
        ratingDnk: r.dnk ?? '',
        ratingHgt: r.hgt ?? '',
        ratingOiq: r.oiq ?? '',
        ratingDrb: r.drb ?? '',
        gp,
        mpg: gp > 0 ? (s.min ?? 0) / gp : 0,
        tpm: gp > 0 ? (s.tp ?? 0) / gp : 0,
        tpa: gp > 0 ? tpa / gp : 0,
        tpPct: tpa > 0 ? (s.tp ?? 0) / tpa : 0,
        fga: gp > 0 ? fga / gp : 0,
        threePAr: fga > 0 ? tpa / fga : 0,
        pts: gp > 0 ? (s.pts ?? 0) / gp : 0,
      };
    });
}

function formatTpAuditTsv(rows: any[]): string {
  const headers = [
    'name', 'team', 'pos', 'age',
    'ratingTp', 'ratingFg', 'ratingFt', 'ratingIns', 'ratingDnk', 'ratingHgt', 'ratingOiq', 'ratingDrb',
    'gp', 'mpg', 'tpm', 'tpa', 'tpPct', 'fga', 'threePAr', 'pts',
  ];
  const fmtCell = (key: string, value: any) => {
    if (typeof value !== 'number') return value ?? '';
    if (['gp', 'age', 'ratingTp', 'ratingFg', 'ratingFt', 'ratingIns', 'ratingDnk', 'ratingHgt', 'ratingOiq', 'ratingDrb'].includes(key)) {
      return Math.round(value);
    }
    return Number.isFinite(value) ? value.toFixed(3) : '';
  };

  return [
    headers.join('\t'),
    ...rows.map(row => headers.map(h => fmtCell(h, row[h])).join('\t')),
  ].join('\n');
}

async function runCheat(code: CheatCode, ctx: CheatContext): Promise<CheatResult> {
  const { state, dispatchAction, healPlayer } = ctx;

  switch (code) {
    case 'PBA_TEST_LAZY_SIM': {
      const live = getLive(ctx);
      if ((live.leagueStats as any)?.uiMode !== 'pba_isolated') {
        return { title: 'PBA_TEST_LAZY_SIM', body: 'Current save is not pba_isolated.', ok: false };
      }
      logPbaLazySimAudit(live, 'manual');
      return { title: 'PBA_TEST_LAZY_SIM', body: 'PBA lazy-sim audit printed to console.', ok: true };
    }
    case 'BASKETAUDIT': {
      logBasketballUniverseAudit(getLive(ctx), 'manual');
      return { title: 'BASKETAUDIT', body: 'Basketball universe sanity audit printed to console.', ok: true };
    }

    case 'HEALSTUCK': {
      // Strip offseason-checklist + FA-tag fields from the newest save's gzipped
      // blob in IndexedDB, then reload. Used when the Tasks sidebar refuses to
      // dismiss (e.g. user clicked "To Preseason" mid-FA and got stuck in a
      // re-mount loop, or saved mid-offseason in a buggy build).
      try {
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const req = indexedDB.open('keyval-store');
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
        const get = (k: string) => new Promise<any>((res, rej) => {
          const req = db.transaction('keyval', 'readonly').objectStore('keyval').get(k);
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
        const meta = await get('nba_commish_metadata');
        if (!Array.isArray(meta) || meta.length === 0) {
          return { title: 'HEALSTUCK', body: 'No saves found.', ok: false };
        }
        const newest = [...meta].sort((a: any, b: any) => b.dateSaved - a.dateSaved)[0];
        const raw = await get(newest.id);
        if (!raw?.data) {
          return { title: 'HEALSTUCK', body: 'Save format unrecognized.', ok: false };
        }
        const ds = new DecompressionStream('gzip');
        const dw = ds.writable.getWriter();
        dw.write(raw.data);
        dw.close();
        const decoded = await new Response(ds.readable).text();
        const s: any = JSON.parse(decoded);
        const had = !!(s.offseasonChecklist || s.faTagCounter != null || s.faTagsTotal != null || s.offseasonExitedYear != null);
        s.offseasonChecklist = undefined;
        s.faTagCounter = undefined;
        s.faTagsTotal = undefined;
        s.offseasonExitedYear = undefined;
        const cs = new CompressionStream('gzip');
        const cw = cs.writable.getWriter();
        cw.write(new TextEncoder().encode(JSON.stringify(s)));
        cw.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        await new Promise<void>((res, rej) => {
          const req = db.transaction('keyval', 'readwrite').objectStore('keyval').put({ __gz: true, data: buf }, newest.id);
          req.onsuccess = () => res();
          req.onerror = () => rej(req.error);
        });
        console.log(`[HEALSTUCK] cleared ${had ? 'offseason fields from' : 'no fields needed clearing in'} save ${newest.id}. Reloading…`);
        setTimeout(() => location.reload(), 200);
        return {
          title: 'HEALSTUCK',
          body: had
            ? 'Cleared offseasonChecklist + faTagCounter from newest save. Reloading…'
            : 'Save had no stuck offseason state. Reloading anyway.',
          ok: true,
        };
      } catch (err) {
        console.error('[HEALSTUCK] failed:', err);
        return { title: 'HEALSTUCK', body: `Failed: ${(err as Error).message ?? err}`, ok: false };
      }
    }

    case 'HISTORYHEAL': {
      if (state.leagueStats?.uiMode === 'euro_isolated' || state.leagueStats?.uiMode === 'pba_isolated') {
        return { title: 'HISTORYHEAL', body: 'This heal is for NBA-mode saves only.', ok: false };
      }
      try {
        const season = state.leagueStats?.year ?? new Date().getFullYear();
        const { AwardService } = await import('../../services/logic/AwardService');
        const races = AwardService.calculateAwardRaces(
          state.players,
          state.teams,
          season,
          state.staff,
          state.leagueStats.minGamesRequirement,
        );

        const teamAwardLabels = new Set([
          'All-NBA First Team',
          'All-NBA Second Team',
          'All-NBA Third Team',
          'All-Defensive First Team',
          'All-Defensive Second Team',
          'All-Rookie First Team',
          'All-Rookie Second Team',
        ]);
        const rebuiltTeamAwards: any[] = [];
        const pushTeamAwards = (label: string, team: any[]) => {
          for (const spot of team ?? []) {
            if (!spot?.player) continue;
            rebuiltTeamAwards.push({
              season,
              type: label,
              name: spot.player.name,
              pid: spot.player.internalId,
              tid: spot.team?.id,
            });
          }
        };
        pushTeamAwards('All-NBA First Team', races.allNBATeams.allNBA[0]);
        pushTeamAwards('All-NBA Second Team', races.allNBATeams.allNBA[1]);
        pushTeamAwards('All-NBA Third Team', races.allNBATeams.allNBA[2]);
        pushTeamAwards('All-Defensive First Team', races.allNBATeams.allDefense[0]);
        pushTeamAwards('All-Defensive Second Team', races.allNBATeams.allDefense[1]);
        pushTeamAwards('All-Rookie First Team', races.allNBATeams.allRookie[0]);
        pushTeamAwards('All-Rookie Second Team', races.allNBATeams.allRookie[1]);

        const filteredAwards = (state.historicalAwards ?? []).filter((award: any) => {
          if (Number(award?.season) !== season) return true;
          if (!award?.type) return false;
          return !teamAwardLabels.has(String(award.type));
        });

        const allStarIds = Array.from(new Set(
          ((state.allStar as any)?.roster ?? [])
            .map((entry: any) => entry?.playerId)
            .filter((value: any) => typeof value === 'string' && value.length > 0),
        ));
        const players = state.players.map((player: any) => {
          const nextAwards = [...(player.awards ?? [])].filter((award: any) => {
            if (Number(award?.season) !== season) return true;
            if (typeof award?.type !== 'string') return true;
            return !teamAwardLabels.has(award.type);
          });
          const rebuiltPlayerAwards = rebuiltTeamAwards
            .filter((award: any) => award.pid === player.internalId)
            .map((award: any) => ({ season, type: award.type }));
          const hasAllStar = nextAwards.some((award: any) => award.season === season && award.type === 'All-Star');
          if (allStarIds.includes(player.internalId) && !hasAllStar) {
            nextAwards.push({ season, type: 'All-Star' });
          }
          return { ...player, awards: [...nextAwards, ...rebuiltPlayerAwards] };
        });

        const recordMap = deriveOfficialNbaRecords(state.schedule, state.teams, season);
        const champTid = (state.playoffs as any)?.bracketComplete ? state.playoffs?.champion : undefined;
        const finalsSeries = (state.playoffs?.series ?? []).find((series: any) => series.round === 4);
        const runnerTid = champTid != null && finalsSeries
          ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
          : undefined;

        const teams = state.teams.map((team: any) => {
          if (typeof team?.id !== 'number' || team.id < 0 || team.id >= 100) return team;
          const rec = recordMap.get(team.id);
          const wins = rec?.totalWins ?? team.wins ?? 0;
          const losses = rec?.totalLosses ?? team.losses ?? 0;
          const seasons = Array.isArray(team.seasons) ? [...team.seasons] : [];
          const seasonIndex = seasons.findIndex((entry: any) => Number(entry?.season) === season);
          const prev = seasonIndex >= 0 ? seasons[seasonIndex] : {};
          const playoffRoundsWon = team.id === champTid
            ? 4
            : team.id === runnerTid
              ? 3
              : prev?.playoffRoundsWon;
          const nextSeasonRow = {
            ...prev,
            season,
            won: wins,
            lost: losses,
            wins,
            losses,
            playoffRoundsWon,
          };
          if (seasonIndex >= 0) seasons[seasonIndex] = nextSeasonRow;
          else seasons.push(nextSeasonRow);
          return {
            ...team,
            wins,
            losses,
            seasons,
          };
        });

        const patched = {
          ...state,
          historicalAwards: [...filteredAwards, ...rebuiltTeamAwards],
          players,
          teams,
        } as any;
        await dispatchAction({ type: 'LOAD_GAME', payload: patched } as any);
        console.group('%c🩹 HISTORYHEAL', 'color:#22c55e;font-weight:bold');
        console.log('Rebuilt team-award rows:', rebuiltTeamAwards.length);
        console.log('Stamped All-Star player awards from live roster:', allStarIds.length);
        console.log('Removed stale current-season composite/no-type history rows and rewrote NBA season rows from played schedule.');
        console.groupEnd();
        return {
          title: 'HISTORYHEAL',
          body: `Rebuilt ${rebuiltTeamAwards.length} All-NBA/Defense/Rookie rows, restored All-Star awards for ${allStarIds.length} roster entries, and rewrote current NBA team season records. Save to persist.`,
          ok: true,
        };
      } catch (err) {
        console.error('[HISTORYHEAL] failed:', err);
        return { title: 'HISTORYHEAL', body: `Failed: ${(err as Error).message ?? err}`, ok: false };
      }
    }

    case 'FIXROOKIES': {
      // Repair contracts created by the pre-rollover draft bug where minSalaryUSD
      // was multiplied by 1_000_000 a second time (minContract=950000 USD treated
      // as millions → salaryAmtUSD = 950 billion instead of 950K).
      // Signature: contract.rookie=true AND contract.amount > 50_000 (max legit rookie
      // in BBGM thousands is ~14_000 for the #1 overall pick).
      const MAX_LEGIT_BBGM = 50_000; // BBGM thousands = $50M — anything over this is bugged
      const bugged = state.players.filter(p => {
        const c = (p as any).contract;
        return c?.rookie && (c?.amount ?? 0) > MAX_LEGIT_BBGM;
      });
      if (bugged.length === 0) {
        return { title: 'FIXROOKIES', body: 'No bugged rookie contracts found.', ok: true };
      }
      const updatedPlayers = state.players.map(p => {
        const c = (p as any).contract;
        if (!c?.rookie || (c?.amount ?? 0) <= MAX_LEGIT_BBGM) return p;
        const fixedContract = { ...c, amount: Math.round(c.amount / 1_000_000) };
        const fixedCY = ((p as any).contractYears ?? []).map((cy: any) => ({
          ...cy,
          guaranteed: typeof cy.guaranteed === 'number' ? Math.round(cy.guaranteed / 1_000_000) : cy.guaranteed,
        }));
        return { ...p, contract: fixedContract, contractYears: fixedCY };
      });
      const patched = { ...state, players: updatedPlayers } as any;
      await dispatchAction({ type: 'LOAD_GAME', payload: patched } as any);
      console.log(`✅ FIXROOKIES: repaired ${bugged.length} rookie contracts`);
      return {
        title: 'FIXROOKIES done',
        body: `${bugged.length} contracts fixed. Save to persist.`,
        ok: true,
      };
    }

    case 'EUROAUDIT': {
      const audit = buildEuroAudit(state);
      console.group('%c🇪🇺 EUROAUDIT', 'color:#22d3ee;font-weight:bold');
      console.log('uiMode:', (state.leagueStats as any)?.uiMode);
      console.log('FIBA timing:', {
        quarterLength: (state.leagueStats as any)?.quarterLength,
        numQuarters: (state.leagueStats as any)?.numQuarters,
        currency: (state.leagueStats as any)?.currency,
      });
      console.log('NBA-state leaks:', audit.nbaStateLeaks);
      console.table(audit.rosterRows);
      if (audit.legacyTidPlayers.length > 0) {
        console.warn('Legacy external players using raw 0-99 tids:', audit.legacyTidPlayers.map((p: any) => ({
          name: p.name,
          tid: p.tid,
          status: p.status,
          normalizedTid: normalizeExternalTid(Number(p.tid), p.status),
        })));
      }
      if (audit.statusMismatches.length > 0) {
        console.warn('External tid/status mismatches:', audit.statusMismatches.map((p: any) => ({
          name: p.name,
          tid: p.tid,
          status: p.status,
          expected: euroStatusForTid(Number(p.tid)),
        })));
      }
      if (audit.sourceTidDrifts.length > 0) {
        console.warn('External players no longer on source roster tid:', audit.sourceTidDrifts.map((p: any) => ({
          name: p.name,
          tid: p.tid,
          status: p.status,
          sourceTid: originalExternalTidFromId(p),
        })));
      }
      if (audit.unauthorizedUserIncomingTransfers.length > 0) {
        console.warn('User-team incoming transfers without userInitiated accepted bid:', audit.unauthorizedUserIncomingTransfers);
        console.table(audit.unauthorizedUserIncomingTransfers);
      }
      if (audit.nbaOriginExternalRosterPlayers.length > 0) {
        console.warn('NBA-origin players sitting on Euro/Endesa rosters:', audit.nbaOriginExternalRosterPlayers.map((p: any) => ({
          name: p.name,
          tid: p.tid,
          status: p.status,
          internalId: p.internalId,
        })));
      }
      if (audit.contaminatedBoxes.length > 0) {
        console.warn('Contaminated Euro box scores: player lines do not belong to the game side tid.');
        console.table(audit.contaminatedBoxes);
      } else {
        console.log('No contaminated Euro box scores found.');
      }
      console.groupEnd();

      const issues =
        audit.legacyTidPlayers.length +
        audit.statusMismatches.length +
        audit.unauthorizedUserIncomingTransfers.length +
        audit.nbaOriginExternalRosterPlayers.length +
        audit.contaminatedBoxes.length +
        Object.values(audit.nbaStateLeaks).reduce((s: number, n: any) => s + Number(n || 0), 0);
      return {
        title: 'EUROAUDIT',
        body: `${issues} issue signal(s). ${audit.contaminatedBoxes.length} contaminated box score(s), ${audit.unauthorizedUserIncomingTransfers.length} unauthorized user incoming transfer(s), ${audit.nbaOriginExternalRosterPlayers.length} NBA-origin Euro roster player(s). See console.`,
        ok: issues === 0,
      };
    }

    case 'EUROFIX': {
      if ((state.leagueStats as any)?.uiMode !== 'euro_isolated') {
        return { title: 'EUROFIX', body: 'Current save is not euro_isolated; no changes made.', ok: false };
      }
      let normalizedTidCount = 0;
      let statusFixedCount = 0;
      let strippedFlags = 0;
      let revertedUnauthorizedTransfers = 0;
      let removedNbaOriginExternalPlayers = 0;
      const currentYear = (state.leagueStats as any)?.year ?? new Date().getFullYear();
      const unauthorizedIncoming = findUnauthorizedUserIncomingTransfers(state);
      const unauthorizedActivityIds = new Set(unauthorizedIncoming.map(a => a.id));
      const unauthorizedByPlayerId = new Map(unauthorizedIncoming.map(a => [a.playerId, a]));
      const nbaOriginExternalPlayerIds = new Set(
        ((state.players ?? []) as any[])
          .filter(isNbaOriginOnExternalRoster)
          .map(p => p.internalId)
      );
      const normalizedPlayers = (state.players ?? []).map((p: any) => {
        let next = p;
        const oldTid = Number(p.tid);
        const normalizedTid = normalizeExternalTid(oldTid, p.status);
        if (normalizedTid !== oldTid) {
          next = { ...next, tid: normalizedTid };
          normalizedTidCount++;
        }
        const expectedStatus = euroStatusForTid(Number(next.tid));
        if (expectedStatus && next.status !== expectedStatus) {
          next = { ...next, status: expectedStatus };
          statusFixedCount++;
        }
        if (Number(next.tid) >= 100 && (next.twoWay || next.nonGuaranteed)) {
          next = { ...next, twoWay: false, nonGuaranteed: false };
          strippedFlags++;
        }
        const unauthorized = unauthorizedByPlayerId.get(p.internalId);
        const userTid = Number((state as any).userTeamId);
        if (unauthorized && Number(next.tid) === userTid) {
          const fromTid = Number(unauthorized.fromTid);
          next = {
            ...next,
            tid: fromTid,
            ...(euroStatusForTid(fromTid) ? { status: euroStatusForTid(fromTid) as any } : {}),
          };
          revertedUnauthorizedTransfers++;
        }
        if (nbaOriginExternalPlayerIds.has(p.internalId)) {
          next = {
            ...next,
            tid: -1,
            status: 'Free Agent' as const,
            stats: Array.isArray(next.stats)
              ? next.stats.filter((row: any) => row?.season !== currentYear || row?.playoffs || Number(row?.tid) < 100)
              : next.stats,
          };
          removedNbaOriginExternalPlayers++;
        }
        return next;
      });
      const prunedTransferActivity = (((state as any).transferActivity ?? []) as any[])
        .filter(activity => !unauthorizedActivityIds.has(activity.id) && !nbaOriginExternalPlayerIds.has(activity.playerId));
      const prunedTransferBids = (((state as any).transferBids ?? []) as any[])
        .map(bid => (
          (unauthorizedByPlayerId.has(bid.playerId) || nbaOriginExternalPlayerIds.has(bid.playerId)) &&
          Number(bid.bidderTid) === Number((state as any).userTeamId) &&
          bid.userInitiated !== true
            ? { ...bid, status: 'withdrawn' as const }
            : bid
        ));
      const prunedHistory = ((state.history ?? []) as any[]).filter(entry => {
        if (entry?.type !== 'Transfer' || Number(entry?.tid) !== Number((state as any).userTeamId)) return true;
        const ids = new Set(entry.playerIds ?? []);
        return ![...unauthorizedByPlayerId.keys(), ...nbaOriginExternalPlayerIds].some(playerId => ids.has(playerId));
      });

      const prePatchAudit = buildEuroAudit({
        ...state,
        players: normalizedPlayers,
        transferActivity: prunedTransferActivity,
        transferBids: prunedTransferBids,
      } as any);
      const contaminatedGameIds = new Set(prePatchAudit.contaminatedBoxes.map((row: any) => row.gameId));
      for (const box of ((state.boxScores ?? []) as any[])) {
        if (!isExternalCompetitionBox(box)) continue;
        const usedRemovedPlayer = [...(box.homeStats ?? []), ...(box.awayStats ?? [])]
          .some((line: any) => nbaOriginExternalPlayerIds.has(line.playerId));
        if (usedRemovedPlayer) contaminatedGameIds.add(box.gameId);
      }
      let purgedBoxScores = 0;
      let resetScheduleGames = 0;
      const keptBoxScores = ((state.boxScores ?? []) as any[]).filter(box => {
        if (!contaminatedGameIds.has(box.gameId)) return true;
        purgedBoxScores++;
        return false;
      });
      const resetSchedule = ((state.schedule ?? []) as any[]).map(game => {
        if (!contaminatedGameIds.has(game.gid)) return game;
        resetScheduleGames++;
        return { ...game, played: false, homeScore: 0, awayScore: 0 };
      });
      const playersWithoutCurrentEuroRows = normalizedPlayers.map((p: any) => {
        if (!Array.isArray(p.stats) || !isEuroPlayerLike(p)) return p;
        return {
          ...p,
          stats: p.stats.filter((row: any) =>
            row?.season !== currentYear ||
            (Number(row?.tid) < 100 && !EURO_ROSTER_STATUSES.has(p.status))
          ),
        };
      });
      const remainingEuroBoxes = keptBoxScores.filter(isExternalCompetitionBox);
      const rebuiltPlayers = remainingEuroBoxes.length > 0
        ? processSimulationResults(
            remainingEuroBoxes,
            playersWithoutCurrentEuroRows,
            (state as any).draftPicks ?? [],
            resetSchedule as any,
            currentYear,
            (state as any).teams ?? [],
          ).updatedPlayers
        : playersWithoutCurrentEuroRows;

      const patched = {
        ...state,
        players: rebuiltPlayers,
        schedule: resetSchedule,
        boxScores: keptBoxScores,
        transferActivity: prunedTransferActivity,
        transferBids: prunedTransferBids,
        history: prunedHistory,
        leagueStats: {
          ...state.leagueStats,
          quarterLength: 10,
          numQuarters: 4,
          currency: 'EUR',
        },
        faBidding: { markets: [] },
        pendingFAToasts: [],
        pendingRFAOfferSheets: [],
        pendingRFAMatchResolutions: [],
      } as any;
      await dispatchAction({ type: 'LOAD_GAME', payload: patched } as any);

      const postAudit = buildEuroAudit(patched);
      console.group('%c🇪🇺 EUROFIX', 'color:#10b981;font-weight:bold');
      console.log({ normalizedTidCount, statusFixedCount, strippedFlags, revertedUnauthorizedTransfers, removedNbaOriginExternalPlayers, purgedBoxScores, resetScheduleGames, rebuiltEuroBoxes: remainingEuroBoxes.length });
      if (postAudit.contaminatedBoxes.length > 0) {
        console.warn('Remaining contaminated box scores need manual reset/resim or a targeted box-score purge:', postAudit.contaminatedBoxes);
      }
      console.groupEnd();
      return {
        title: 'EUROFIX done',
        body: `Normalized ${normalizedTidCount} tids, fixed ${statusFixedCount} statuses, reverted ${revertedUnauthorizedTransfers} unauthorized user transfers, removed ${removedNbaOriginExternalPlayers} NBA-origin Euro roster players, purged ${purgedBoxScores} bad boxscores, reset ${resetScheduleGames} games, rebuilt from ${remainingEuroBoxes.length} Euro boxes. Remaining contaminated boxes: ${postAudit.contaminatedBoxes.length}. Save to persist.`,
        ok: postAudit.contaminatedBoxes.length === 0 && postAudit.unauthorizedUserIncomingTransfers.length === 0 && postAudit.nbaOriginExternalRosterPlayers.length === 0,
      };
    }

    case 'RESTOREPER': {
      const currentYear = (state.leagueStats as any)?.year ?? new Date().getFullYear();
      const schedByGid = new Map((state.schedule ?? []).map((g: any) => [g.gid, g]));
      const statKey = (playerId: string, tid: number, playoffs: boolean) => `${playerId}|${tid}|${playoffs ? 1 : 0}`;
      const boxMap = new Map<string, any[]>();

      for (const box of (state.boxScores ?? []) as any[]) {
        if ((box.season ?? currentYear) !== currentYear) continue;
        if (box.homeTeamId < 0 || box.awayTeamId < 0) continue;
        const sched = schedByGid.get(box.gameId);
        const isPlayoff = sched?.isPlayoff === true;
        const isPlayIn = sched?.isPlayIn === true;
        const isPreseason = sched?.isPreseason === true;
        if (isPlayIn || isPreseason) continue;

        for (const s of (box.homeStats ?? [])) {
          const k = statKey(s.playerId, box.homeTeamId, isPlayoff);
          if (!boxMap.has(k)) boxMap.set(k, []);
          boxMap.get(k)!.push({ ...s, __gameId: box.gameId });
        }
        for (const s of (box.awayStats ?? [])) {
          const k = statKey(s.playerId, box.awayTeamId, isPlayoff);
          if (!boxMap.has(k)) boxMap.set(k, []);
          boxMap.get(k)!.push({ ...s, __gameId: box.gameId });
        }
      }

      let rebuiltRows = 0;
      let dedupedRows = 0;
      const updatedPlayers = state.players.map(p => {
        if (!(p as any).stats?.length) return p;
        let changed = false;
        const existingStats = (p as any).stats as any[];
        const preserved = existingStats.filter((row: any) => row.season !== currentYear);
        const currentRows = existingStats.filter((row: any) => row.season === currentYear);
        const grouped = new Map<string, any[]>();
        for (const row of currentRows) {
          const k = `${row.tid}|${row.playoffs ? 1 : 0}`;
          if (!grouped.has(k)) grouped.set(k, []);
          grouped.get(k)!.push(row);
        }
        const rebuiltCurrent: any[] = [];

        for (const rows of grouped.values()) {
          const row = rows[0];
          if (rows.length > 1) {
            dedupedRows += rows.length - 1;
            changed = true;
          }

          const playoffs = !!row.playoffs;
          const k = statKey((p as any).internalId, row.tid, playoffs);
          const rawLines = boxMap.get(k);
          const lines = rawLines
            ? (() => {
                const byGameId = new Map<any, any>();
                rawLines.forEach((line: any, idx: number) => {
                  const gid = line.__gameId ?? `no-gid-${idx}`;
                  if (!byGameId.has(gid)) byGameId.set(gid, line);
                });
                return Array.from(byGameId.values());
              })()
            : undefined;
          if (!lines?.length) {
            rebuiltCurrent.push(row);
            continue;
          }

          const next = { ...row };
          next.gp = 0; next.gs = 0; next.min = 0;
          next.fg = 0; next.fga = 0; next.tp = 0; next.tpa = 0; next.fp = 0; next.fpa = 0; next.ft = 0; next.fta = 0;
          next.orb = 0; next.drb = 0; next.trb = 0; next.ast = 0; next.stl = 0; next.blk = 0; next.tov = 0; next.pf = 0; next.pts = 0;
          next.pm = 0; next.ws = 0; next.ows = 0; next.dws = 0; next.vorp = 0; next.ewa = 0;
          next._perSum = 0; next._usgPctSum = 0; next._ortgSum = 0; next._drtgSum = 0; next._bpmSum = 0;
          next._obpmSum = 0; next._dbpmSum = 0; next._orbPctSum = 0; next._drbPctSum = 0; next._trbPctSum = 0;
          next._astPctSum = 0; next._stlPctSum = 0; next._blkPctSum = 0; next._tovPctSum = 0;

          for (const stat of lines) {
            next.gp += 1;
            next.gs += (stat.gs || 0);
            next.min += stat.min || 0;
            next.pts += stat.pts || 0;
            next.orb += stat.orb || 0;
            next.drb += stat.drb || 0;
            next.trb += stat.reb || ((stat.orb || 0) + (stat.drb || 0));
            next.ast += stat.ast || 0;
            next.stl += stat.stl || 0;
            next.blk += stat.blk || 0;
            next.tov += stat.tov || 0;
            next.pf += stat.pf || 0;
            next.fg += stat.fgm || 0;
            next.fga += stat.fga || 0;
            next.tp += stat.threePm || 0;
            next.tpa += stat.threePa || 0;
            next.fp += stat.fourPm || 0;
            next.fpa += stat.fourPa || 0;
            next.ft += stat.ftm || 0;
            next.fta += stat.fta || 0;
            next.pm += stat.pm || 0;
            next.ws += stat.ws || 0;
            next.ows += stat.ows || 0;
            next.dws += stat.dws || 0;
            next.vorp += stat.vorp || 0;
            next.ewa += stat.ewa || 0;
            next._perSum += stat.per || 0;
            next._usgPctSum += stat.usgPct || 0;
            next._ortgSum += stat.ortg || 0;
            next._drtgSum += stat.drtg || 0;
            next._bpmSum += stat.bpm || 0;
            next._obpmSum += stat.obpm || 0;
            next._dbpmSum += stat.dbpm || 0;
            next._orbPctSum += stat.orbPct || 0;
            next._drbPctSum += stat.drbPct || 0;
            next._trbPctSum += stat.trbPct || 0;
            next._astPctSum += stat.astPct || 0;
            next._stlPctSum += stat.stlPct || 0;
            next._blkPctSum += stat.blkPct || 0;
            next._tovPctSum += stat.tovPct || 0;
          }

          next.fgp = next.fga > 0 ? (next.fg / next.fga) * 100 : 0;
          next.tpp = next.tpa > 0 ? (next.tp / next.tpa) * 100 : 0;
          next.fpp = next.fpa > 0 ? (next.fp / next.fpa) * 100 : 0;
          next.ftp = next.fta > 0 ? (next.ft / next.fta) * 100 : 0;
          next.per = next.gp > 0 ? next._perSum / next.gp : 0;
          next.usgPct = next.gp > 0 ? next._usgPctSum / next.gp : 0;
          next.drtg = next.gp > 0 ? next._drtgSum / next.gp : 0;
          next.bpm = next.gp > 0 ? next._bpmSum / next.gp : 0;
          next.obpm = next.gp > 0 ? next._obpmSum / next.gp : 0;
          next.dbpm = next.gp > 0 ? next._dbpmSum / next.gp : 0;
          next.orbPct = next.gp > 0 ? next._orbPctSum / next.gp : 0;
          next.drbPct = next.gp > 0 ? next._drbPctSum / next.gp : 0;
          next.rebPct = next.gp > 0 ? next._trbPctSum / next.gp : 0;
          next.astPct = next.gp > 0 ? next._astPctSum / next.gp : 0;
          next.stlPct = next.gp > 0 ? next._stlPctSum / next.gp : 0;
          next.blkPct = next.gp > 0 ? next._blkPctSum / next.gp : 0;
          next.tovPct = next.gp > 0 ? next._tovPctSum / next.gp : 0;
          const tsDenom = 2 * (next.fga + 0.44 * next.fta);
          next.tsPct = tsDenom > 0 ? (next.pts / tsDenom) * 100 : 0;
          next.efgPct = next.fga > 0 ? ((next.fg + 0.5 * next.tp + (next.fp || 0)) / next.fga) * 100 : 0;
          const seasonPoss = next.fga + 0.44 * next.fta - next.orb + next.tov;
          next.ortg = seasonPoss > 0 ? (next.pts * 100) / seasonPoss : 0;

          rebuiltRows++;
          changed = true;
          rebuiltCurrent.push(next);
        }

        const stats = [...preserved, ...rebuiltCurrent];
        return changed ? { ...p, stats } : p;
      });

      if (rebuiltRows === 0) {
        return { title: 'RESTOREPER', body: `No current-season rows could be rebuilt from ${currentYear} boxScores.`, ok: false };
      }

      const patched = { ...state, players: updatedPlayers } as any;
      await dispatchAction({ type: 'LOAD_GAME', payload: patched } as any);
      console.log(`✅ RESTOREPER: rebuilt ${rebuiltRows} player season rows from boxScores (${currentYear}), removed ${dedupedRows} duplicate rows`);
      return { title: 'RESTOREPER', body: `Rebuilt ${rebuiltRows} current-season rows and removed ${dedupedRows} duplicate rows. Save to persist.`, ok: true };
    }

    case 'HELP':
    case 'KEYS': {
      console.group('🎮 Debug Cheats');
      Object.entries(CHEAT_CODES).forEach(([k, v]) => {
        console.log(`%c${k.padEnd(14)}%c ${v}`, 'color: #4ade80; font-weight: bold', 'color: inherit');
      });
      console.groupEnd();
      return {
        title: 'Cheats listed',
        body: `${Object.keys(CHEAT_CODES).length} cheats in console (F12)`,
        ok: true,
      };
    }

    case 'AUDIT': {
      console.group('🏀 Full Audit');
      await runEconAudit(state);
      await runFaAudit(state);
      console.groupEnd();
      return { title: 'Audit complete', body: 'See console', ok: true };
    }

    case 'FAAUDIT': {
      await runFaAudit(state);
      return { title: 'FA audit', body: 'See console', ok: true };
    }

    case 'ECONAUDIT': {
      await runEconAudit(state);
      return { title: 'Economy audit', body: 'See console', ok: true };
    }

    case 'QUOTA': {
      const est = await navigator.storage.estimate();
      const usage = ((est.usage ?? 0) / 1024 / 1024).toFixed(1);
      const quota = ((est.quota ?? 0) / 1024 / 1024).toFixed(0);
      const pct = est.quota ? (((est.usage ?? 0) / est.quota) * 100).toFixed(1) : '?';
      const msg = `${usage} MB / ${quota} MB (${pct}%)`;
      console.log(`💾 Storage: ${msg}`);
      return { title: 'Storage', body: msg, ok: true };
    }

    case 'CLEARCACHE': {
      const ok = window.confirm('Delete the player-portrait image cache? (~100–200 MB freed. Portraits re-download as needed.)');
      if (!ok) return { title: 'Canceled', body: '', ok: false };
      await new Promise<void>(res => {
        const req = indexedDB.deleteDatabase('imageCache');
        req.onsuccess = () => res();
        req.onerror = () => res();
        req.onblocked = () => res();
      });
      const est = await navigator.storage.estimate();
      const usage = ((est.usage ?? 0) / 1024 / 1024).toFixed(1);
      return { title: 'imageCache deleted', body: `Storage now ${usage} MB`, ok: true };
    }

    case 'SAVENOW': {
      const { SaveManager } = await import('../../services/SaveManager');
      try {
        // Delete imageCache FIRST to guarantee space, then save
        await new Promise<void>(res => {
          const req = indexedDB.deleteDatabase('imageCache');
          req.onsuccess = () => res();
          req.onerror = () => res();
          req.onblocked = () => res();
        });
        const saveId = (state as any).saveId ?? `nba_commish_${Date.now()}`;
        const name = (state as any).commissionerName ?? 'Emergency Save';
        await SaveManager.saveGame({ ...state, saveId } as any, name);
        console.log('✅ Forced save complete');
        return { title: 'Saved', body: 'Forced save bypass succeeded', ok: true };
      } catch (e: any) {
        console.error('Save failed:', e);
        return { title: 'Save failed', body: String(e?.message ?? e), ok: false };
      }
    }

    case 'HEALALL': {
      if (state.gameMode !== 'gm') {
        return { title: 'GM mode only', body: 'Heal-all only works in GM mode', ok: false };
      }
      const userTid = (state as any).userTeamId;
      const injured = state.players.filter(p => p.tid === userTid && (p as any).injury?.gamesRemaining > 0);
      if (injured.length === 0) {
        return { title: 'No injuries', body: 'Your team has no injured players', ok: true };
      }
      if (healPlayer) {
        injured.forEach(p => healPlayer(p.internalId));
      }
      return { title: 'Healed', body: `${injured.length} players restored`, ok: true };
    }

    case 'STATE': {
      const s: any = state;
      console.group('🏀 State Summary');
      console.log('Date:', s.date, '| Year:', s.leagueStats?.year);
      console.log('Mode:', s.gameMode, '| UserTid:', s.userTeamId);
      console.log('Players total:', s.players?.length);
      console.log('Teams:', s.teams?.length, '| Non-NBA teams:', s.nonNBATeams?.length);
      console.log('History entries:', s.history?.length);
      console.log('News items:', s.news?.length);
      const ls = s.leagueStats ?? {};
      console.log('Salary cap:', ls.salaryCap, '| Lux:', ls.luxuryPayroll, '| Min contract:', ls.minContractStaticAmount);
      console.groupEnd();
      return { title: 'State dumped', body: 'See console', ok: true };
    }

    case 'PLAYERS': {
      const counts: Record<string, number> = {};
      state.players.forEach(p => {
        const k = (p as any).status ?? 'undefined';
        counts[k] = (counts[k] || 0) + 1;
      });
      console.log('📊 Player distribution by status:');
      console.table(counts);
      return { title: 'Players counted', body: 'See console table', ok: true };
    }

    case 'NUGROT': {
      const season = state.leagueStats?.year ?? new Date().getFullYear();
      const den = state.teams.find(team => team.abbrev === 'DEN' || /denver nuggets/i.test(team.name));
      const userTid = (state as any).userTeamId;
      const team = den ?? (typeof userTid === 'number' ? state.teams.find(t => t.id === userTid) : undefined);
      if (!team) {
        return { title: 'NUGROT', body: 'No DEN team found and no user team fallback available.', ok: false };
      }

      const confTeams = state.teams
        .filter(t => t.conference === team.conference)
        .slice()
        .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
      const conferenceRank = Math.max(1, confTeams.findIndex(t => t.id === team.id) + 1 || 8);
      const leader = confTeams[0];
      const gbFromLeader = leader
        ? Math.max(0, ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2)
        : 0;
      const gamesRemaining = Math.max(0, 82 - ((team.wins ?? 0) + (team.losses ?? 0)));

      const rotationResult = MinutesPlayedService.getRotation(
        team as any,
        state.players as any,
        0,
        season,
        undefined,
        conferenceRank,
        gbFromLeader,
        gamesRemaining,
      );
      const allocation = MinutesPlayedService.allocateMinutes(
        rotationResult.players as any,
        season,
        0,
        0,
        rotationResult.starMpgTarget,
      );
      const resolvedPlan = resolveRotationPlan(
        team as any,
        state.players as any,
        season,
        KNOBS_DEFAULT,
        0,
        undefined,
      );

      const rows = rotationResult.players.map((p: any, idx: number) => {
        const rating = p.ratings?.[p.ratings.length - 1] ?? {};
        const k2 = convertTo2KRating(p.overallRating ?? rating.ovr ?? 50, rating.hgt ?? 50, rating.tp ?? 50);
        const seasonStats = (p.stats ?? []).find((s: any) => s.season === season && !s.playoffs);
        const gp = Number(seasonStats?.gp ?? 0);
        const mpg = gp > 0 ? Number(((seasonStats?.min ?? 0) / gp).toFixed(1)) : 0;
        const simIdx = resolvedPlan.rotation.findIndex((rp: any) => rp.internalId === p.internalId);
        const simTarget = simIdx >= 0 ? Number((resolvedPlan.minuteTargets[simIdx] ?? 0).toFixed(1)) : 0;
        return {
          slot: idx + 1,
          name: p.name,
          pos: p.pos ?? '—',
          starter: idx < 5 ? 'Y' : 'N',
          k2,
          ovrRaw: p.overallRating ?? rating.ovr ?? 0,
          endu: rating.endu ?? 50,
          injuryGames: p.injury?.gamesRemaining ?? 0,
          targetMin: Number((allocation.minutes[idx] ?? 0).toFixed(1)),
          simTargetMin: simTarget,
          seasonMpg: mpg,
          delta: Number(((allocation.minutes[idx] ?? 0) - mpg).toFixed(1)),
        };
      });

      const jokicRow = rows.find(r => /jokic/i.test(r.name));
      const valRow = rows.find(r => /valanciunas/i.test(r.name));
      console.group(`%cNUGROT ${team.abbrev} (${season})`, 'color:#f59e0b;font-weight:bold');
      console.log({
        team: `${team.name} (${team.abbrev})`,
        conferenceRank,
        gbFromLeader: Number(gbFromLeader.toFixed(1)),
        gamesRemaining,
        computedDepth: rotationResult.depth,
        starMpgTarget: Number(rotationResult.starMpgTarget.toFixed(1)),
        simPlanDepth: resolvedPlan.rotation.length,
        simPlanStarMpgTarget: Number(resolvedPlan.starMpgTarget.toFixed(1)),
      });
      console.table(rows);
      if (jokicRow) console.log('Jokic row:', JSON.stringify(jokicRow));
      if (valRow) console.log('Valanciunas row:', JSON.stringify(valRow));
      if (jokicRow && valRow) {
        const relation = jokicRow.targetMin >= valRow.targetMin ? 'OK' : 'WARN';
        console.log(`[NUGROT:${relation}] Jokic target ${jokicRow.targetMin} vs Val target ${valRow.targetMin}`);
      }

      const jokic = state.players.find((p: any) => /nikola jokic/i.test(p.name));
      if (jokic) {
        const denGames = (state.boxScores ?? [])
          .filter((b: any) => b.homeTeamId === team.id || b.awayTeamId === team.id)
          .filter((b: any) => (b.season ?? season) === season)
          .slice(-25);
        const jokicRecent = denGames.map((b: any) => {
          const line = [...(b.homeStats ?? []), ...(b.awayStats ?? [])]
            .find((s: any) => s.playerId === jokic.internalId);
          if (!line) return null;
          const teamScore = b.homeTeamId === team.id ? b.homeScore : b.awayScore;
          const oppScore = b.homeTeamId === team.id ? b.awayScore : b.homeScore;
          const diff = teamScore - oppScore;
          return {
            date: String(b.date ?? '').slice(0, 10),
            min: Number((line.min ?? 0).toFixed?.(1) ?? line.min ?? 0),
            pf: Number(line.pf ?? 0),
            pts: Number(line.pts ?? 0),
            reb: Number(line.reb ?? line.trb ?? 0),
            ast: Number(line.ast ?? 0),
            diff,
          };
        }).filter(Boolean) as Array<{ date: string; min: number; pf: number; pts: number; reb: number; ast: number; diff: number }>;
        const last10 = jokicRecent.slice(-10);
        if (last10.length > 0) {
          const avgMin = last10.reduce((sum, row) => sum + row.min, 0) / last10.length;
          console.log(`[NUGROT] Jokic last ${last10.length} games avg min: ${avgMin.toFixed(1)}`);
          console.table(last10);
        } else {
          console.log('[NUGROT] No Jokic lines found in recent DEN box scores.');
        }
      }
      console.groupEnd();

      return {
        title: 'NUGROT',
        body: `Logged ${team.abbrev} rotation + minute allocation to console. ${jokicRow ? `Jokic target ${jokicRow.targetMin} mpg=${jokicRow.seasonMpg}.` : ''}`,
        ok: true,
      };
    }

    case 'FATIGUEAUDIT': {
      return runFatigueAudit(state);
    }

    case 'FATIGUEFIX':
    case 'FATIGUEFIXALL': {
      return await runFatigueFix(ctx);
    }

    case 'COPYTP': {
      const playerStatsDebug = (window as any).__nbaPlayerStatsDebugRows;
      const rows = Array.isArray(playerStatsDebug?.rows) && playerStatsDebug.rows.length > 0
        ? playerStatsDebug.rows
        : buildTpAuditRowsFromState(state);
      const tsv = formatTpAuditTsv(rows);
      await copyTextToClipboard(tsv);

      console.group('COPYTP shooter audit');
      console.log(`Copied ${rows.length} rows as TSV`);
      if (playerStatsDebug?.context) console.log('PlayerStatsView context:', playerStatsDebug.context);
      console.table(rows.slice(0, 40));
      console.groupEnd();

      return {
        title: 'COPYTP copied',
        body: `${rows.length} player rows copied as TSV. Paste it into chat or a sheet.`,
        ok: true,
      };
    }

    case 'NAMECHECK': {
      // Flag players whose born.country / born.loc doesn't match naming convention
      // (rough heuristic: USA names on non-NBA non-G-League players)
      const offenders = state.players.filter(p => {
        const country = (p as any).born?.loc ?? (p as any).born?.country ?? '';
        const status = (p as any).status ?? '';
        const isExternal = ['Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'B-League', 'PBA'].includes(status);
        return isExternal && country === 'USA';
      });
      console.log(`🔎 USA-born players in non-G-League external leagues: ${offenders.length}`);
      if (offenders.length > 0) {
        console.table(offenders.slice(0, 20).map(p => ({
          name: p.name,
          league: (p as any).status,
          age: (p as any).age,
          ovr: p.overallRating,
          college: (p as any).college ?? '—',
        })));
      }
      return { title: 'Namecheck', body: `${offenders.length} flagged`, ok: true };
    }

    case 'RETIRECHECK': {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      const zombies = state.players.filter(p => {
        if ((p as any).status !== 'Retired') return false;
        if ((p as any).diedYear) return false;
        const age = currentYear - ((p as any).born?.year ?? 2000);
        return age > 95;
      });
      console.log(`🧟 Retired players past 95 without diedYear: ${zombies.length}`);
      if (zombies.length > 0) {
        console.table(zombies.slice(0, 20).map(p => ({
          name: p.name,
          age: currentYear - ((p as any).born?.year ?? 2000),
          hof: !!(p as any).hof,
        })));
      }
      return { title: 'Retirees checked', body: `${zombies.length} still aging`, ok: true };
    }

    case 'EXPORTSAVE': {
      // Download the current state as a JSON file via the browser
      try {
        const data = { ...state, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = (state as any).date ?? 'save';
        const safeName = String(dateStr).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.href = url;
        a.download = `basketcommish_${safeName}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { title: 'Exported', body: `${a.download} → Downloads folder`, ok: true };
      } catch (e: any) {
        return { title: 'Export failed', body: String(e?.message ?? e), ok: false };
      }
    }

    case 'IMPORTSAVE': {
      // Load a save from a JSON file the user picks
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        const file: File | null = await new Promise(res => {
          input.onchange = () => res(input.files?.[0] ?? null);
          input.click();
        });
        if (!file) return { title: 'Canceled', body: 'No file selected', ok: false };

        const text = await file.text();
        const loaded = JSON.parse(text);
        await dispatchAction({ type: 'LOAD_GAME', payload: loaded } as any);
        return { title: 'Imported', body: `Loaded ${file.name}`, ok: true };
      } catch (e: any) {
        return { title: 'Import failed', body: String(e?.message ?? e), ok: false };
      }
    }

    case 'SAVETODISK': {
      // File System Access API — picks a folder on disk, creates /basketcommisionersim/saves/, writes JSON
      if (!('showDirectoryPicker' in window)) {
        return {
          title: 'Not supported',
          body: 'File System Access API unavailable. Use Chrome / Edge. Fallback: use EXPORTSAVE.',
          ok: false,
        };
      }
      try {
        // @ts-ignore - showDirectoryPicker is not yet in TS lib.dom
        const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const appDir = await rootHandle.getDirectoryHandle('basketcommisionersim', { create: true });
        const savesDir = await appDir.getDirectoryHandle('saves', { create: true });

        const dateStr = String((state as any).date ?? 'save').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `save_${dateStr}_${Date.now()}.json`;
        const fileHandle = await savesDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2));
        await writable.close();

        // Persist the handle in IndexedDB so LOADFROMDISK can skip the picker
        try {
          const persistDb = await new Promise<IDBDatabase>((res, rej) => {
            const req = indexedDB.open('fs-handles', 1);
            req.onupgradeneeded = () => {
              if (!req.result.objectStoreNames.contains('handles')) req.result.createObjectStore('handles');
            };
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          await new Promise<void>(res => {
            const tx = persistDb.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(savesDir, 'savesDir');
            tx.oncomplete = () => res();
          });
        } catch { /* non-fatal */ }

        return { title: 'Saved to disk', body: `${fileName} → basketcommisionersim/saves/`, ok: true };
      } catch (e: any) {
        if (e?.name === 'AbortError') return { title: 'Canceled', body: '', ok: false };
        return { title: 'Save to disk failed', body: String(e?.message ?? e), ok: false };
      }
    }

    case 'LOADFROMDISK': {
      if (!('showOpenFilePicker' in window)) {
        return {
          title: 'Not supported',
          body: 'File System Access API unavailable. Use Chrome / Edge. Fallback: use IMPORTSAVE.',
          ok: false,
        };
      }
      try {
        // @ts-ignore - showOpenFilePicker is not yet in TS lib.dom
        const [fileHandle] = await window.showOpenFilePicker({
          types: [{ description: 'BasketCommish save', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
        const file = await fileHandle.getFile();
        const text = await file.text();
        const loaded = JSON.parse(text);
        await dispatchAction({ type: 'LOAD_GAME', payload: loaded } as any);
        return { title: 'Loaded', body: `From ${file.name}`, ok: true };
      } catch (e: any) {
        if (e?.name === 'AbortError') return { title: 'Canceled', body: '', ok: false };
        return { title: 'Load failed', body: String(e?.message ?? e), ok: false };
      }
    }

    case 'NUKE': {
      const ok = window.confirm('⚠️  NUKE ALL IndexedDB? This deletes:\n\n• Every save\n• imageCache\n• gist-cache\n• Everything\n\nThis cannot be undone.');
      if (!ok) return { title: 'Canceled', body: '', ok: false };
      const ok2 = window.confirm('⚠️  Are you SURE? Second confirmation required.');
      if (!ok2) return { title: 'Canceled', body: '', ok: false };

      const dbs = await (indexedDB as any).databases?.() ?? [];
      for (const db of dbs) {
        if (db.name) {
          await new Promise<void>(res => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = () => res();
            req.onerror = () => res();
            req.onblocked = () => res();
          });
          console.log(`🗑️  deleted ${db.name}`);
        }
      }
      return { title: 'Nuked', body: 'Reload page to reinitialize', ok: true };
    }

    case 'FAPOOL': {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      const INTL = new Set(['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);

      const fas = state.players.filter(p => {
        const s = (p as any).status ?? '';
        if (s === 'Retired' || (p as any).hof || p.tid === -100) return false;
        if (p.tid === -2 || s === 'Prospect' || s === 'Draft Prospect') return false;
        const isIntl = INTL.has(s);
        const isNBAFA = p.tid === -1 || s === 'Free Agent';
        if (!isIntl && !isNBAFA) return false;
        const age = (p as any).born?.year ? currentYear - (p as any).born.year : ((p as any).age ?? 99);
        return age >= 19;
      });

      const getK2 = (p: any): number => {
        const r = (p.ratings?.length ? p.ratings[p.ratings.length - 1] : null) ?? {};
        return convertTo2KRating(p.overallRating ?? r.ovr ?? 60, r.hgt ?? 50, r.tp ?? 50);
      };

      const tiers = { '90+': 0, '85+': 0, '80+': 0, '75+': 0, 'total': fas.length };
      fas.forEach(p => {
        const k2 = getK2(p);
        if (k2 >= 90) tiers['90+']++;
        if (k2 >= 85) tiers['85+']++;
        if (k2 >= 80) tiers['80+']++;
        if (k2 >= 75) tiers['75+']++;
      });

      const nbaCount = fas.filter(p => p.tid === -1 || (p as any).status === 'Free Agent').length;
      const intlCount = fas.filter(p => INTL.has((p as any).status ?? '')).length;

      const byLeague: Record<string, { count: number; avgK2: number; top: number }> = {};
      fas.forEach(p => {
        const league = (p.tid === -1 || (p as any).status === 'Free Agent') ? 'NBA FA' : ((p as any).status ?? 'Unknown');
        const k2 = getK2(p);
        if (!byLeague[league]) byLeague[league] = { count: 0, avgK2: 0, top: 0 };
        byLeague[league].count++;
        byLeague[league].avgK2 += k2;
        if (k2 > byLeague[league].top) byLeague[league].top = k2;
      });
      Object.values(byLeague).forEach(v => { v.avgK2 = Math.round(v.avgK2 / v.count); });

      const topFAs = fas
        .map(p => ({
          name: p.name,
          league: (p.tid === -1 || (p as any).status === 'Free Agent') ? 'NBA FA' : (p as any).status,
          k2: getK2(p),
          age: (p as any).born?.year ? currentYear - (p as any).born.year : ((p as any).age ?? 0),
        }))
        .sort((a, b) => b.k2 - a.k2)
        .slice(0, 20);

      const byNat: Record<string, number> = {};
      fas.forEach(p => {
        const loc = (p as any).born?.loc ?? (p as any).born?.country ?? 'Unknown';
        byNat[loc] = (byNat[loc] || 0) + 1;
      });
      const topNat = Object.fromEntries(Object.entries(byNat).sort((a, b) => b[1] - a[1]).slice(0, 15));

      console.group('🏀 FA Pool Debug');
      console.log(`Total: ${fas.length} | NBA FA: ${nbaCount} | International: ${intlCount}`);
      console.log('K2 tier counts:');
      console.table(tiers);
      console.log('By league (count / avgK2 / top):');
      console.table(byLeague);
      console.log('Top 20 by K2:');
      console.table(topFAs);
      console.log('Top 15 nationalities:');
      console.table(topNat);
      console.groupEnd();

      return {
        title: 'FA Pool',
        body: `${fas.length} total | K2 90+: ${tiers['90+']} | 85+: ${tiers['85+']} | 80+: ${tiers['80+']}`,
        ok: true,
      };
    }

    case 'GROWTH': {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      // All non-retired, non-prospect players with ratings history
      const candidates = state.players.filter(p => {
        const s = (p as any).status ?? '';
        if (s === 'Retired' || s === 'Draft Prospect' || s === 'Prospect') return false;
        if (p.tid === -100 || p.tid === -2) return false;
        const ratings = (p as any).ratings;
        return Array.isArray(ratings) && ratings.length >= 2;
      });

      // Build age → K2 samples bucket
      const byAge: Record<number, number[]> = {};
      candidates.forEach(p => {
        const ratings = (p as any).ratings as Array<{ season: number; ovr: number; hgt?: number; tp?: number }>;
        const birthYear = (p as any).born?.year ?? null;
        ratings.forEach(r => {
          if (!r || typeof r.ovr !== 'number') return;
          const age = birthYear ? r.season - birthYear : null;
          if (age == null || age < 18 || age > 38) return;
          const k2 = convertTo2KRating(r.ovr, r.hgt ?? 50, r.tp ?? 50);
          if (!byAge[age]) byAge[age] = [];
          byAge[age].push(k2);
        });
      });

      // Also compute per-player deltas (age N vs age N-1 for the SAME player)
      const deltaByAge: Record<number, number[]> = {};
      candidates.forEach(p => {
        const ratings = (p as any).ratings as Array<{ season: number; ovr: number; hgt?: number; tp?: number }>;
        const birthYear = (p as any).born?.year ?? null;
        if (!birthYear) return;
        const bySeasonMap = new Map<number, number>();
        ratings.forEach(r => {
          if (typeof r?.ovr === 'number') {
            bySeasonMap.set(r.season, convertTo2KRating(r.ovr, r.hgt ?? 50, r.tp ?? 50));
          }
        });
        bySeasonMap.forEach((k2, season) => {
          const prevK2 = bySeasonMap.get(season - 1);
          if (prevK2 == null) return;
          const age = season - birthYear;
          if (age < 18 || age > 38) return;
          if (!deltaByAge[age]) deltaByAge[age] = [];
          deltaByAge[age].push(k2 - prevK2);
        });
      });

      const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;

      const rows: Record<number, { n: number; avgK2: number; minK2: number; maxK2: number; avgDelta: string; pct90: number }> = {};
      const ages = Array.from(new Set([...Object.keys(byAge).map(Number), ...Object.keys(deltaByAge).map(Number)])).sort((a, b) => a - b);

      ages.forEach(age => {
        const samples = byAge[age] ?? [];
        const deltas = deltaByAge[age] ?? [];
        if (samples.length === 0) return;
        const sorted = [...samples].sort((a, b) => a - b);
        const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
        rows[age] = {
          n: samples.length,
          avgK2: Math.round(avg(samples)! * 10) / 10,
          minK2: Math.min(...samples),
          maxK2: Math.max(...samples),
          avgDelta: deltas.length ? (avg(deltas)! >= 0 ? '+' : '') + (avg(deltas)!).toFixed(1) : '—',
          pct90: p90,
        };
      });

      console.group('📈 Growth Audit — avg K2 per age + YoY delta');
      console.log(`Players sampled: ${candidates.length} | Season year: ${currentYear}`);
      console.table(rows);
      console.log('avgDelta = avg (K2 this age) − (K2 prev age) for same player');
      console.log('pct90 = 90th-percentile K2 at that age');
      console.groupEnd();

      // Quick summary for the alert
      const row22 = rows[22];
      const row25 = rows[25];
      const row28 = rows[28];
      const summary = [
        row22 ? `Age 22 avg K2: ${row22.avgK2} (Δ${row22.avgDelta})` : '',
        row25 ? `Age 25 avg K2: ${row25.avgK2} (Δ${row25.avgDelta})` : '',
        row28 ? `Age 28 avg K2: ${row28.avgK2} (Δ${row28.avgDelta})` : '',
      ].filter(Boolean).join('\n');

      return { title: 'Growth audit', body: summary || 'See console table', ok: true };
    }

    case 'MIDSEASON': {
      // Signings > $10M dated Nov 1 onwards — flag mid-season mega-deal regressions.
      const history = (state as any).history ?? [];
      // Match e.g. "$54M/4yr" or "$54M/4yr (player option)"
      const re = /\$(\d+(?:\.\d+)?)M\/(\d+)yr/;
      const offenders: Array<{ date: string; text: string; totalM: number; years: number }> = [];
      for (const h of history) {
        if (!h?.text || !h?.date) continue;
        const t = String(h.text);
        if (!t.includes('signs with') && !t.includes('has re-signed')) continue;
        const m = t.match(re);
        if (!m) continue;
        const totalM = parseFloat(m[1]);
        const years = parseInt(m[2], 10);
        const annualM = totalM / Math.max(1, years);
        if (annualM < 10) continue;
        const dt = new Date(h.date);
        if (isNaN(dt.getTime())) continue;
        const month = dt.getMonth() + 1;
        const day = dt.getDate();
        const isMidSeason = (month === 10 && day >= 22) || month === 11 || month === 12 ||
                            month === 1 || month === 2 || month === 3 || month === 4 || month === 5 ||
                            (month === 6 && day < 25);
        if (!isMidSeason) continue;
        offenders.push({ date: h.date, text: t.slice(0, 80), totalM, years });
      }
      offenders.sort((a, b) => b.totalM - a.totalM);
      console.group('💸 Mid-Season Mega Deals (>$10M, Nov 1+)');
      console.log(`Total flagged: ${offenders.length}`);
      console.table(offenders.slice(0, 30));
      console.groupEnd();
      return { title: 'Mid-season audit', body: `${offenders.length} mid-season >$10M deals — see console`, ok: true };
    }

    case 'TWOWAYAGE': {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      const twoWays = state.players.filter(p => !!(p as any).twoWay && p.tid >= 0);
      if (twoWays.length === 0) {
        return { title: 'No 2W players', body: 'Roster has no two-way contracts', ok: true };
      }
      const buckets: Record<string, number> = { '≤21': 0, '22-24': 0, '25-27': 0, '28-30': 0, '31+': 0 };
      let oldOffenders: Array<{ name: string; age: number; yos: number; team: number }> = [];
      twoWays.forEach(p => {
        const age = (p as any).born?.year ? currentYear - (p as any).born.year : ((p as any).age ?? 0);
        const yosFromStats = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
        const draftYr = (p as any).draft?.year;
        const yosFromDraft = (draftYr && currentYear > draftYr) ? currentYear - draftYr : 0;
        const yos = Math.max(yosFromStats, yosFromDraft);
        if (age <= 21) buckets['≤21']++;
        else if (age <= 24) buckets['22-24']++;
        else if (age <= 27) buckets['25-27']++;
        else if (age <= 30) buckets['28-30']++;
        else buckets['31+']++;
        if (age >= 25 && yos >= 3) {
          oldOffenders.push({ name: p.name, age, yos, team: p.tid });
        }
      });
      console.group('🤝 Two-Way Age Distribution');
      console.log(`Total 2W players: ${twoWays.length}`);
      console.table(buckets);
      if (oldOffenders.length > 0) {
        console.log(`Vets on 2W (age ≥ 25 AND YOS ≥ 3) — should not exist post-fix:`);
        console.table(oldOffenders.slice(0, 30));
      } else {
        console.log('✅ No vets on two-ways — gate is holding.');
      }
      console.groupEnd();
      return { title: '2W ages', body: `${twoWays.length} 2W | vet offenders: ${oldOffenders.length}`, ok: true };
    }

    case 'RESIGNS': {
      // Group "has re-signed" history entries by playerName + same offseason.
      // Flags >1 re-sign in same offseason (Aaron Bradshaw bug).
      const history = (state as any).history ?? [];
      const grouped: Record<string, Array<{ date: string; text: string }>> = {};
      for (const h of history) {
        if (!h?.text || !h?.date) continue;
        const t = String(h.text);
        if (!t.includes('has re-signed')) continue;
        const dt = new Date(h.date);
        if (isNaN(dt.getTime())) continue;
        // Offseason key — Jul N to Jun N+1 belong to N+1's "season" group.
        // Months 7-12 → year, months 1-6 → year-1.
        const m = dt.getMonth() + 1;
        const y = dt.getFullYear();
        const seasonKey = m >= 7 ? y : y - 1;
        const nameMatch = t.match(/^([^]+?) has re-signed/);
        const name = nameMatch ? nameMatch[1] : 'Unknown';
        const key = `${name}|${seasonKey}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ date: h.date, text: t.slice(0, 90) });
      }
      const dupes = Object.entries(grouped)
        .filter(([, arr]) => arr.length >= 2)
        .map(([key, arr]) => ({ key, count: arr.length, entries: arr }));
      console.group('🔁 Duplicate Re-Sign Audit');
      console.log(`Players with ≥2 "re-signed" in same offseason: ${dupes.length}`);
      dupes.slice(0, 20).forEach(d => {
        console.log(`%c${d.key} (${d.count}x)`, 'color: #f59e0b; font-weight: bold');
        console.table(d.entries);
      });
      if (dupes.length === 0) console.log('✅ No duplicate re-signs detected.');
      console.groupEnd();
      return { title: 'Re-sign audit', body: `${dupes.length} duplicate offenders — see console`, ok: true };
    }

    case 'PICKS': {
      const picks = (state as any).draftPicks ?? [];
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      const windowSize = (state.leagueStats as any)?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
      const draftComplete = !!(state as any).draftComplete;
      const minSeason = draftComplete ? currentYear + 1 : currentYear;
      const maxSeason = currentYear + windowSize;

      // Counts per season
      const bySeason: Record<number, { r1: number; r2: number; total: number; missing30: string }> = {};
      const nbaTeamIds = new Set(state.teams.filter(t => t.id >= 0 && t.id < 100).map(t => t.id));
      const numTeams = nbaTeamIds.size;

      picks.forEach((p: any) => {
        if (!bySeason[p.season]) bySeason[p.season] = { r1: 0, r2: 0, total: 0, missing30: '' };
        if (p.round === 1) bySeason[p.season].r1++;
        else if (p.round === 2) bySeason[p.season].r2++;
        bySeason[p.season].total++;
      });

      // For each season, find which originalTid teams are missing a pick
      const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);
      seasons.forEach(season => {
        const hasR1 = new Set(picks.filter((p: any) => p.season === season && p.round === 1).map((p: any) => p.originalTid));
        const hasR2 = new Set(picks.filter((p: any) => p.season === season && p.round === 2).map((p: any) => p.originalTid));
        const missingR1 = [...nbaTeamIds].filter(id => !hasR1.has(id));
        const missingR2 = [...nbaTeamIds].filter(id => !hasR2.has(id));
        const missing: string[] = [];
        if (missingR1.length) missing.push(`R1 missing: tid ${missingR1.join(',')}`);
        if (missingR2.length) missing.push(`R2 missing: tid ${missingR2.join(',')}`);
        bySeason[season].missing30 = missing.join(' | ') || '✓ all 30';
      });

      const totalPicks = picks.length;
      const tradablePicks = picks.filter((p: any) => p.season >= minSeason && p.season <= maxSeason).length;

      console.group('🎟️  Draft Pick Inventory');
      console.log(`Year: ${currentYear} | draftComplete: ${draftComplete} | window: ${minSeason}–${maxSeason} (${windowSize} seasons)`);
      console.log(`Total picks in state: ${totalPicks} | Tradable: ${tradablePicks} | NBA teams tracked: ${numTeams}`);
      console.log('Per-season breakdown:');
      console.table(bySeason);
      console.groupEnd();

      const missingSeasons = seasons.filter(s => bySeason[s].r1 < numTeams || bySeason[s].r2 < numTeams);
      return {
        title: 'Pick inventory',
        body: `${totalPicks} total | ${tradablePicks} tradable (${minSeason}–${maxSeason})${missingSeasons.length ? ` | ⚠ ${missingSeasons.length} seasons short` : ' | ✓ full'}`,
        ok: true,
      };
    }

    case 'PBADRAFT':
      return runPbaDraftAudit(state);
    case 'PBADRAFTFIX':
      return await runPbaDraftFix(ctx);

    case 'SALARYAUDIT': {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

      // NBA seasons played = non-playoff stat rows with gp > 0
      const nbaSeasonsPlayed = (p: any): number =>
        (p.stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) < 100).length;

      // contractYears[] coverage: how many calendar years are represented
      const cyCount = (p: any): number => (p.contractYears ?? []).length;

      // bbgm salaries[] — total entries and past-only count
      const salTotal = (p: any): number => (p.salaries ?? []).length;
      const salCount = (p: any): number =>
        (p.salaries ?? []).filter((s: any) => s.season < currentYear).length;

      // Only look at players with 3+ NBA seasons and an active contract
      const candidates = state.players.filter(p => {
        const s = (p as any).status ?? '';
        if (s === 'Retired' || s === 'Prospect' || s === 'Draft Prospect') return false;
        if (p.tid < 0 || p.tid >= 100) return false; // active NBA only
        return nbaSeasonsPlayed(p) >= 3;
      });

      // Flag: played >= 3 seasons but contractYears covers < half their tenure
      const flagged = candidates
        .map(p => {
          const seasons = nbaSeasonsPlayed(p);
          const cy = cyCount(p);
          const sal = salCount(p);
          const exp = (p as any).contract?.exp ?? 0;
          const firstCySeason = cy > 0
            ? Math.min(...(p as any).contractYears.map((e: any) => parseInt(e.season.split('-')[0], 10) + 1))
            : null;
          const gapYears = firstCySeason != null ? Math.max(0, firstCySeason - (currentYear - seasons + 1)) : seasons;
          return {
            name: p.name,
            tid: p.tid,
            seasonsPlayed: seasons,
            contractYearsCount: cy,
            firstCySeason: firstCySeason ?? '—',
            bbgmSalTotal: salTotal(p),
            bbgmSalHistoric: sal,
            contractExp: exp,
            missingYears: gapYears,
          };
        })
        .filter(r => r.missingYears > 0)
        .sort((a, b) => b.missingYears - a.missingYears);

      console.group(`💸 Salary History Audit — year ${currentYear}`);
      console.log(`Active NBA players with 3+ seasons: ${candidates.length}`);
      console.log(`Players with contractYears gap (pre-gist history missing): ${flagged.length}`);
      if (flagged.length > 0) {
        console.log('Top offenders (sorted by missingYears desc):');
        console.table(flagged.slice(0, 40));
      } else {
        console.log('✅ No gaps found — all veterans have full contractYears coverage.');
      }

      // Also surface players whose contractYears has only 1 entry (current season only)
      const singleEntry = candidates.filter(p => cyCount(p) === 1 && nbaSeasonsPlayed(p) >= 2);
      if (singleEntry.length > 0) {
        console.log(`Players with exactly 1 contractYears entry (should have more): ${singleEntry.length}`);
        console.table(singleEntry.slice(0, 20).map(p => ({
          name: p.name,
          seasons: nbaSeasonsPlayed(p),
          cy0: (p as any).contractYears?.[0]?.season ?? '—',
          exp: (p as any).contract?.exp,
          hasSalaries: (p as any).salaries?.length > 0,
        })));
      }
      console.groupEnd();

      return {
        title: 'Salary audit',
        body: `${flagged.length} players missing pre-gist salary history | ${singleEntry.length} with single-entry contractYears — see console`,
        ok: true,
      };
    }

    case 'JERSEYAUDIT':
    case 'JERSEYRETIREMENT': {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      const leagueStartYear = deriveLeagueStartYearFromHistory(state.history, currentYear);
      const rows = explainJerseyRetirementCandidates(
        state.players,
        state.teams,
        currentYear,
        { leagueStartYear, previewFreshRetirees: true },
      );

      const summary = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.outcome] = (acc[row.outcome] || 0) + 1;
        return acc;
      }, {});

      const candidates = rows.filter(r => r.outcome === 'candidate').slice(0, 50);
      const preSave = rows.filter(r => r.outcome === 'skip_pre_save_retiree').slice(0, 50);
      const notDue = rows.filter(r => r.outcome === 'skip_not_due').slice(0, 50);
      const freshRetireePreview = rows
        .filter(r => r.retiredYear === currentYear && (r.outcome === 'candidate' || r.outcome === 'skip_not_due'))
        .slice(0, 50);
      const issueSpotlight = rows.filter(r =>
        /^(Chris Paul|Kevin Love|Klay Thompson)$/i.test(r.name)
      );

      console.group('🎽 Jersey Retirement Audit');
      console.log(`Current year: ${currentYear} | League start year: ${leagueStartYear}`);
      console.log('Outcome summary:');
      console.table(summary);
      if (candidates.length > 0) {
        console.log('Active candidates due now:');
        console.table(candidates.map(r => ({
          player: r.name,
          team: r.teamName,
          number: r.number,
          retiredYear: r.retiredYear,
          scheduledYear: r.scheduledYear,
          score: r.score,
          seasons: r.seasonsWithTeam,
          gp: r.gamesWithTeam,
          allStars: r.allStarAppearances,
          championships: r.championships,
          tier: r.tier,
          reason: r.reason,
        })));
      }
      if (preSave.length > 0) {
        console.log('Pre-save retirees being excluded:');
        console.table(preSave.map(r => ({
          player: r.name,
          team: r.teamName,
          retiredYear: r.retiredYear,
          leagueStartYear,
        })));
      }
      if (notDue.length > 0) {
        console.log('Qualified but not due yet:');
        console.table(notDue.map(r => ({
          player: r.name,
          team: r.teamName,
          number: r.number,
          retiredYear: r.retiredYear,
          scheduledYear: r.scheduledYear,
          score: r.score,
          tier: r.tier,
        })));
      }
      if (freshRetireePreview.length > 0) {
        console.log('Fresh retiree jersey preview (retired this class, ceremony scheduled later):');
        console.table(freshRetireePreview.map(r => ({
          player: r.name,
          team: r.teamName,
          number: r.number,
          scheduledYear: r.scheduledYear,
          score: r.score,
          seasons: r.seasonsWithTeam,
          gp: r.gamesWithTeam,
          allStars: r.allStarAppearances,
          championships: r.championships,
          tier: r.tier,
          reason: r.reason,
          outcome: r.outcome,
        })));
      }
      if (issueSpotlight.length > 0) {
        console.log('Issue spotlight (CP3 / Kevin Love / Klay Thompson):');
        console.table(issueSpotlight.map(r => ({
          player: r.name,
          team: r.teamName,
          number: r.number,
          retiredYear: r.retiredYear,
          scheduledYear: r.scheduledYear,
          score: r.score,
          seasons: r.seasonsWithTeam,
          gp: r.gamesWithTeam,
          allStars: r.allStarAppearances,
          championships: r.championships,
          tier: r.tier,
          reason: r.reason,
          outcome: r.outcome,
        })));
      }
      console.groupEnd();

      return {
        title: 'Jersey audit',
        body: `${rows.filter(r => r.outcome === 'candidate').length} due now | ${freshRetireePreview.length} fresh retiree preview | ${rows.filter(r => r.outcome === 'skip_pre_save_retiree').length} pre-save retirees excluded`,
        ok: true,
      };
    }

    case 'JERSEYRAWFIX': {
      try {
        const result = await hydrateJerseyNumbersFromRawRoster(state);
        await dispatchAction({ type: 'LOAD_GAME', payload: result.patched } as any);
        console.group('🎽 JERSEYRAWFIX');
        console.log(`Matched players changed: ${result.matchedPlayers}`);
        console.log(`Patched stats[].jerseyNumber rows: ${result.statRowsPatched}`);
        console.log(`Patched player.jerseyNumber roots: ${result.rootNumbersPatched}`);
        if (result.missingRawPlayers.length > 0) console.warn('Raw roster misses spotlight players:', result.missingRawPlayers);
        console.groupEnd();
        return {
          title: 'JERSEYRAWFIX',
          body: `Patched ${result.statRowsPatched} stat jersey row(s), ${result.rootNumbersPatched} root jersey number(s). Save to persist.`,
          ok: true,
        };
      } catch (err: any) {
        console.error('[JERSEYRAWFIX] failed:', err);
        return { title: 'JERSEYRAWFIX failed', body: String(err?.message ?? err), ok: false };
      }
    }

    case 'JERSEYHEAL': {
      try {
        const raw = await hydrateJerseyNumbersFromRawRoster(state);
        const repaired = repairExistingRetiredJerseyNumbers(raw.patched);
        const healed = applyDueJerseyRetirements(repaired.patched);
        await dispatchAction({ type: 'LOAD_GAME', payload: healed.patched } as any);
        console.group('🎽 JERSEYHEAL');
        console.log(`Raw stat jersey rows patched: ${raw.statRowsPatched}`);
        console.log(`Raw root jersey numbers patched: ${raw.rootNumbersPatched}`);
        console.log(`Existing retired jersey records repaired: ${repaired.repaired.length}`);
        console.log(`Due jersey retirements applied: ${healed.applied.length}`);
        if (repaired.repaired.length > 0) {
          console.table(repaired.repaired);
        }
        if (healed.applied.length > 0) {
          console.table(healed.applied.map(r => ({
            player: r.name,
            team: r.teamName,
            number: r.number,
            scheduledYear: r.scheduledYear,
            score: r.score,
            tier: r.tier,
            reason: r.reason,
          })));
        }
        console.groupEnd();
        return {
          title: 'JERSEYHEAL',
          body: `Patched ${raw.statRowsPatched} raw jersey stat row(s), repaired ${repaired.repaired.length} existing record(s), applied ${healed.applied.length} due jersey retirement(s). Save to persist.`,
          ok: true,
        };
      } catch (err: any) {
        console.error('[JERSEYHEAL] failed:', err);
        return { title: 'JERSEYHEAL failed', body: String(err?.message ?? err), ok: false };
      }
    }

    case 'STRATEGY': {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      const nbaTeams = state.teams.filter(t => t.id >= 0 && t.id < 100);

      const stratById = new Map<number, ReturnType<typeof resolveTeamStrategyProfile>>();
      nbaTeams.forEach(t => {
        stratById.set(t.id, resolveTeamStrategyProfile({
          team: t,
          players: state.players,
          teams: state.teams,
          leagueStats: state.leagueStats,
          currentYear,
          gameMode: state.gameMode,
          userTeamId: (state as any).userTeamId,
        }));
      });

      const stratRows = nbaTeams.map(t => {
        const s = stratById.get(t.id)!;
        const roster = state.players.filter(p => p.tid === t.id && !(p as any).twoWay);
        const payrollM = roster.reduce((sum, p) => sum + (((p as any).contract?.amount ?? 0) * 1000), 0) / 1_000_000;
        return {
          abbrev: (t as any).abbrev ?? t.name,
          tid: t.id,
          key: s.key,
          role: s.outlook.role,
          mode: s.teamMode,
          buy: s.initiateBuyTrades ? '✓' : '',
          sell: s.initiateSellTrades ? '✓' : '',
          dump: s.initiateSalaryDumps ? '✓' : '',
          faAgg: s.freeAgentAggression.toFixed(2),
          curW: s.currentTalentWeight.toFixed(2),
          futW: s.futureTalentWeight.toFixed(2),
          fitW: s.fitWeight.toFixed(2),
          capW: s.capFlexWeight.toFixed(2),
          ageW: s.agePenaltyWeight.toFixed(2),
          maxAge: s.preferredFreeAgentMaxAge,
          maxYrs: s.preferredContractYears,
          payrollM: payrollM.toFixed(1),
          W: (t as any).wins ?? 0,
          L: (t as any).losses ?? 0,
        };
      }).sort((a, b) => a.key.localeCompare(b.key) || a.abbrev.localeCompare(b.abbrev));

      const teamById = new Map(nbaTeams.map(t => [t.id, t]));
      const playerById = new Map(state.players.map(p => [p.internalId, p]));
      const pickById = new Map((state.draftPicks ?? []).map((pk: any) => [pk.dpid, pk]));
      const executed = ((state as any).tradeProposals ?? []).filter((tp: any) => tp.status === 'executed');

      // Power ranks for pick valuation — same effectiveRecord ordering tradeFinderEngine uses.
      const powerRanks = new Map<number, number>();
      [...nbaTeams]
        .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
        .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses))
        .forEach(({ t }, i) => powerRanks.set(t.id, i + 1));

      const fmtAge = (p: any): number => p.age ?? (p.born?.year ? currentYear - p.born.year : 25);
      const tvOfPlayer = (p: any, mode: any) => Math.round(calcPlayerTV(p, mode, currentYear));
      const tvOfPick = (pk: any) => {
        const rank = powerRanks.get(pk.originalTid) ?? Math.ceil(nbaTeams.length / 2);
        return Math.round(calcPickTV(pk.round, rank, nbaTeams.length, Math.max(1, pk.season - currentYear)));
      };

      // Per-asset breakdown — one row per asset, valued in BOTH sides' modes so
      // mode asymmetry (rebuilder paying contender prices for an aging vet) jumps out.
      const assetRows: any[] = [];
      const tradeRows = executed.map((tp: any) => {
        const propTeam = teamById.get(tp.proposingTeamId);
        const recvTeam = teamById.get(tp.receivingTeamId);
        const propStrat = stratById.get(tp.proposingTeamId);
        const recvStrat = stratById.get(tp.receivingTeamId);
        const propMode = propStrat?.teamMode ?? 'rebuild';
        const recvMode = recvStrat?.teamMode ?? 'rebuild';
        const fromAbbrev = (propTeam as any)?.abbrev ?? `tid${tp.proposingTeamId}`;
        const toAbbrev = (recvTeam as any)?.abbrev ?? `tid${tp.receivingTeamId}`;

        const offered = (tp.playersOffered ?? []).map((id: string) => playerById.get(id)).filter(Boolean) as any[];
        const requested = (tp.playersRequested ?? []).map((id: string) => playerById.get(id)).filter(Boolean) as any[];
        const offeredPicks = (tp.picksOffered ?? []).map((id: number) => pickById.get(id)).filter(Boolean) as any[];
        const requestedPicks = (tp.picksRequested ?? []).map((id: number) => pickById.get(id)).filter(Boolean) as any[];

        const tradeId = `${tp.proposedDate} ${fromAbbrev}↔${toAbbrev}`;

        // Players going FROM proposer TO receiver — receiver evaluates in recvMode (asking price);
        // proposer is parting with them in propMode (sunk cost). Show both.
        for (const p of offered) {
          assetRows.push({
            trade: tradeId,
            side: `${fromAbbrev}→${toAbbrev}`,
            asset: p.name,
            kind: 'player',
            age: fmtAge(p),
            ovr: Math.round(calcOvr2K(p)),
            salaryM: Number(((p.contract?.amount ?? 0) / 1000).toFixed(1)),
            exp: p.contract?.exp ?? '—',
            tvSenderMode: tvOfPlayer(p, propMode),
            tvReceiverMode: tvOfPlayer(p, recvMode),
            senderMode: propMode,
            receiverMode: recvMode,
          });
        }
        for (const pk of offeredPicks) {
          const v = tvOfPick(pk);
          assetRows.push({
            trade: tradeId,
            side: `${fromAbbrev}→${toAbbrev}`,
            asset: `R${pk.round} ${pk.season} (orig ${(teamById.get(pk.originalTid) as any)?.abbrev ?? pk.originalTid})`,
            kind: 'pick',
            age: '—', ovr: '—', salaryM: '—', exp: '—',
            tvSenderMode: v,
            tvReceiverMode: v,
            senderMode: propMode,
            receiverMode: recvMode,
          });
        }
        for (const p of requested) {
          assetRows.push({
            trade: tradeId,
            side: `${toAbbrev}→${fromAbbrev}`,
            asset: p.name,
            kind: 'player',
            age: fmtAge(p),
            ovr: Math.round(calcOvr2K(p)),
            salaryM: Number(((p.contract?.amount ?? 0) / 1000).toFixed(1)),
            exp: p.contract?.exp ?? '—',
            tvSenderMode: tvOfPlayer(p, recvMode),
            tvReceiverMode: tvOfPlayer(p, propMode),
            senderMode: recvMode,
            receiverMode: propMode,
          });
        }
        for (const pk of requestedPicks) {
          const v = tvOfPick(pk);
          assetRows.push({
            trade: tradeId,
            side: `${toAbbrev}→${fromAbbrev}`,
            asset: `R${pk.round} ${pk.season} (orig ${(teamById.get(pk.originalTid) as any)?.abbrev ?? pk.originalTid})`,
            kind: 'pick',
            age: '—', ovr: '—', salaryM: '—', exp: '—',
            tvSenderMode: v,
            tvReceiverMode: v,
            senderMode: recvMode,
            receiverMode: propMode,
          });
        }

        // Aggregate TVs from EACH side's own mode (the perspective they use to accept).
        const sentTV = offered.reduce((s, p) => s + calcPlayerTV(p, propMode, currentYear), 0)
                     + offeredPicks.reduce((s, pk) => s + tvOfPick(pk), 0);
        const recvTV = requested.reduce((s, p) => s + calcPlayerTV(p, recvMode, currentYear), 0)
                     + requestedPicks.reduce((s, pk) => s + tvOfPick(pk), 0);
        // Cross-mode aggregate — what the opposing side THINKS they're getting.
        const sentTVrecvMode = offered.reduce((s, p) => s + calcPlayerTV(p, recvMode, currentYear), 0)
                             + offeredPicks.reduce((s, pk) => s + tvOfPick(pk), 0);
        const recvTVpropMode = requested.reduce((s, p) => s + calcPlayerTV(p, propMode, currentYear), 0)
                             + requestedPicks.reduce((s, pk) => s + tvOfPick(pk), 0);

        const fmtAssets = (players: any[], pickCount: number) => {
          const names = players.map(p => p.name).join(', ');
          const picks = pickCount > 0 ? ` +${pickCount}pk` : '';
          return (names || '(picks only)') + picks;
        };

        return {
          date: tp.proposedDate,
          from: fromAbbrev,
          fromKey: propStrat?.key ?? '?',
          fromMode: propMode,
          to: toAbbrev,
          toKey: recvStrat?.key ?? '?',
          toMode: recvMode,
          sent: fmtAssets(offered, offeredPicks.length),
          received: fmtAssets(requested, requestedPicks.length),
          sentTV: Math.round(sentTV),
          recvTV: Math.round(recvTV),
          delta: Math.round(recvTV - sentTV),
          // What the opposite side priced these baskets at — gap reveals mode asymmetry.
          sentTVxMode: Math.round(sentTVrecvMode),
          recvTVxMode: Math.round(recvTVpropMode),
          aiVsAi: tp.isAIvsAI ? '✓' : '',
        };
      }).sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

      console.group('🎯 Strategy + Trade Audit');
      console.log(`Year ${currentYear} | Teams: ${nbaTeams.length} | Executed trades: ${executed.length}`);
      console.log('Team strategy snapshot (sorted by key):');
      console.table(stratRows);
      if (tradeRows.length > 0) {
        console.log('Executed trades — TVs from each side\'s current teamMode (trade-time mode not preserved):');
        console.log('  sentTV/recvTV  = each side priced in OWN mode (the lens they used to accept)');
        console.log('  sentTVxMode   = sender\'s basket priced in RECEIVER\'s mode (what receiver thought they were paying for)');
        console.log('  recvTVxMode   = receiver\'s basket priced in SENDER\'s mode (what sender thought they were getting)');
        console.table(tradeRows);
        console.log('Per-asset breakdown — every player/pick valued in BOTH sides\' modes:');
        console.log('  tvSenderMode  = TV using donor team\'s mode  |  tvReceiverMode = TV using acquirer team\'s mode');
        console.log('  Big gaps (e.g. aging vet 80 in contend mode → 30 in rebuild mode) flag the asymmetry that lets bad trades slip through.');
        console.table(assetRows);
      } else {
        console.log('No executed trades in this save yet.');
      }
      console.groupEnd();

      return {
        title: 'Strategy audit',
        body: `${nbaTeams.length} strategies | ${executed.length} executed trades — see console`,
        ok: true,
      };
    }

    case 'CUPDEBUG': {
      const cup = (state as any).nbaCup;
      const sched = state.schedule ?? [];
      const cupGames = sched.filter((g: any) => g.isNBACup);
      const cupGroup = cupGames.filter((g: any) => g.nbaCupRound === 'group');
      const cupQF    = cupGames.filter((g: any) => g.nbaCupRound === 'QF');
      const cupSF    = cupGames.filter((g: any) => g.nbaCupRound === 'SF');
      const cupFinal = cupGames.filter((g: any) => g.nbaCupRound === 'Final');
      const playedAll = cupGames.filter((g: any) => g.played).length;

      console.group('🏆 NBA Cup Debug');
      console.log(`leagueStats.inSeasonTournament: ${state.leagueStats?.inSeasonTournament}`);
      console.log(`state.nbaCup exists: ${!!cup}`);
      if (cup) {
        console.log(`year: ${cup.year} | status: ${cup.status}`);
        console.log(`championTid: ${cup.championTid ?? '—'} | runnerUpTid: ${cup.runnerUpTid ?? '—'}`);
        console.log(`mvpPlayerId: ${cup.mvpPlayerId ?? '—'}`);
        console.log(`allTournamentTeam: ${cup.allTournamentTeam?.length ?? 0} entries`);
        if (cup.allTournamentTeam?.length) {
          console.table(cup.allTournamentTeam.map((e: any) => {
            const p = state.players.find(x => x.internalId === e.playerId);
            const t = state.teams.find(x => x.id === e.tid);
            return { player: p?.name ?? e.playerId, team: (t as any)?.abbrev ?? e.tid, pos: e.pos, mvp: e.isMvp ? '★' : '' };
          }));
        }
        console.log('Group standings:');
        cup.groups?.forEach((g: any) => {
          console.log(`  ${g.id}:`);
          console.table(g.standings.map((s: any) => {
            const t = state.teams.find(x => x.id === s.tid);
            return { team: (t as any)?.abbrev ?? s.tid, w: s.w, l: s.l, pf: s.pf, pa: s.pa, pd: s.pd, gp: s.gp };
          }));
        });
        console.log('Knockout bracket:');
        cup.knockout?.forEach((k: any, i: number) => {
          const t1 = state.teams.find(x => x.id === k.tid1);
          const t2 = state.teams.find(x => x.id === k.tid2);
          const w  = k.winnerTid != null ? state.teams.find(x => x.id === k.winnerTid) : null;
          console.log(`  [${i}] ${k.round}: ${(t1 as any)?.abbrev ?? k.tid1} vs ${(t2 as any)?.abbrev ?? k.tid2} → ${w ? (w as any).abbrev : '—'} (gid=${k.gameId ?? '—'}, countsTowardRecord=${k.countsTowardRecord})`);
        });
      }
      console.log('Schedule cup-game tally:');
      console.table({
        group: { total: cupGroup.length, played: cupGroup.filter((g: any) => g.played).length },
        QF:    { total: cupQF.length,    played: cupQF.filter((g: any) => g.played).length    },
        SF:    { total: cupSF.length,    played: cupSF.filter((g: any) => g.played).length    },
        Final: { total: cupFinal.length, played: cupFinal.filter((g: any) => g.played).length },
        TOTAL: { total: cupGames.length, played: playedAll },
      });
      if (cupGroup.length === 0) {
        console.warn('⚠ No cup-tagged group games in schedule! Group games were not injected. Check seasonRollover/autoResolvers/gameLogic schedule generation.');
      } else if (cupGroup.length !== 60) {
        console.warn(`⚠ Expected 60 group games, found ${cupGroup.length}. Some pairings failed to place on Cup Nights.`);
      }
      // Show first/last cup-game dates
      if (cupGames.length > 0) {
        const sorted = [...cupGames].sort((a: any, b: any) => a.date.localeCompare(b.date));
        console.log(`First cup game: ${sorted[0].date} | Last cup game: ${sorted[sorted.length - 1].date}`);
      }
      console.groupEnd();

      return {
        title: 'Cup debug',
        body: `${cup ? `Status: ${cup.status} | ` : 'no nbaCup state | '}Cup games: ${playedAll}/${cupGames.length}`,
        ok: true,
      };
    }

    case 'CUPINJECT': {
      // Recovery for saves where state.nbaCup.groups exist but no isNBACup games
      // were ever placed in state.schedule (the pre-saveId-fallback-fix bug).
      const cup = (state as any).nbaCup;
      if (!cup || !cup.groups?.length) {
        return { title: 'No Cup groups', body: 'state.nbaCup.groups is empty — cup never drew', ok: false };
      }
      const existing = state.schedule.filter((g: any) => g.isNBACup);
      if (existing.length > 0) {
        return { title: 'Already injected', body: `${existing.length} Cup games already in schedule. No-op.`, ok: false };
      }
      const seasonYr = state.leagueStats?.year ?? new Date().getFullYear();
      const prevYr = seasonYr - 1;

      // Build scheduledDates map from current schedule so we don't double-book
      const scheduledDates: Record<string, Set<number>> = {};
      for (const g of state.schedule as any[]) {
        const ds = String(g.date).split('T')[0];
        if (!scheduledDates[ds]) scheduledDates[ds] = new Set<number>();
        scheduledDates[ds].add(g.homeTid);
        scheduledDates[ds].add(g.awayTid);
      }

      const { injectCupGroupGames } = await import('../../services/nbaCup/scheduleInjector');
      const maxGid = Math.max(0, ...state.schedule.map((g: any) => g.gid));
      const result = injectCupGroupGames(
        [],
        maxGid + 1,
        cup.groups,
        (state as any).saveId || 'default',
        prevYr,
        scheduledDates,
        { excludeFromRecord: true },  // retro-injected: don't inflate the 82-game RS
      );
      const newCupGames = result.games;
      console.log(`⚡ Injected ${newCupGames.length} Cup-tagged games into existing schedule`);
      if (newCupGames.length === 0) {
        return { title: 'Nothing injected', body: 'All Cup Nights already booked solid. Try CUPDEBUG to inspect.', ok: false };
      }

      const newSchedule = [...state.schedule, ...newCupGames].sort(
        (a: any, b: any) => a.date.localeCompare(b.date),
      );

      // UPDATE_STATE just shallow-merges. LOAD_GAME runs heavy migrations
      // (contract repair / portrait scrub / external roster fixes) any of which
      // can mutate state in ways that wipe our schedule patch.
      await dispatchAction({ type: 'UPDATE_STATE', payload: { schedule: newSchedule } } as any);

      const firstDate = newCupGames[0]?.date?.split('T')[0];
      const lastDate  = newCupGames[newCupGames.length - 1]?.date?.split('T')[0];
      console.log(`✅ Schedule patched. ${newCupGames.length} games injected, ${firstDate} → ${lastDate}`);
      console.log('👉 Re-run CUPDEBUG to verify, then sim past Nov 4 (or CUPSIM — may need 2-3 runs to clear per-call sim cap).');
      return {
        title: 'Cup injected',
        body: `${newCupGames.length} games injected (${firstDate} → ${lastDate}). Run CUPDEBUG to verify.`,
        ok: true,
      };
    }

    case 'CUPSIM': {
      // Dispatch ONE SIMULATE_TO_DATE to Dec 17. SIMULATE_TO_DATE caps
      // daysToSimulate per call (30 with LLM, 90 without LLM @ gameSpeed≥8,
      // 180-365 at high gameSpeed without LLM). If today is months before Cup,
      // ONE dispatch won't reach the target — re-run CUPSIM until it does.
      const cup = (state as any).nbaCup;
      if (!cup) return { title: 'No Cup', body: 'state.nbaCup is undefined — sim past Aug 14 first so groups draw', ok: false };
      const seasonYr = state.leagueStats?.year ?? new Date().getFullYear();
      const targetDate = `${seasonYr - 1}-12-17`;
      const startDate = state.date.split('T')[0];
      if (startDate >= targetDate) return { title: 'Already past', body: `Today is ${startDate}, Cup window already closed`, ok: false };
      const dayDiff = Math.round((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86400000);
      console.log(`⚡ Sim-jumping from ${startDate} → ${targetDate} (${dayDiff} days)`);
      if (dayDiff > 90) {
        console.warn(`⚠ ${dayDiff} days exceeds typical per-call cap. May take 2-3 CUPSIM dispatches in a row to land. Disable LLM or set gameSpeed=10 to lift the cap.`);
      }
      await dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate } } as any);
      return {
        title: 'Cup sim dispatched',
        body: `Sim → ${targetDate}. ${dayDiff > 90 ? 'May need 2-3 reruns due to per-call sim cap. ' : ''}Re-run CUPDEBUG when done.`,
        ok: true,
      };
    }

    case 'SCHEDAUDIT': {
      const sched = state.schedule ?? [];
      const teams = state.teams ?? [];
      const today = state.date;
      const todayMs = new Date(today).getTime();
      const tname = (tid: number) => {
        const t = teams.find(x => x.id === tid) as any;
        return t ? (t.abbrev ?? t.name) : `tid${tid}`;
      };

      console.group(`🗓 Schedule Audit — ${today}`);

      // Type breakdown
      const types: Record<string, { played: number; unplayed: number }> = {};
      for (const g of sched as any[]) {
        const k = g.isAllStar ? 'allstar'
          : g.isRisingStars ? 'rising'
          : g.isPlayIn ? 'playin'
          : g.isPlayoff ? 'playoff'
          : g.isNBACup ? `cup_${g.nbaCupRound ?? '?'}`
          : g.isPreseason ? 'preseason'
          : 'reg';
        if (!types[k]) types[k] = { played: 0, unplayed: 0 };
        types[k][g.played ? 'played' : 'unplayed']++;
      }
      console.log('Game type breakdown:');
      console.table(types);

      // Orphans: past + unplayed regular-season-style games
      const orphans = (sched as any[]).filter(g =>
        !g.played
        && !g.isAllStar && !g.isRisingStars
        && !g.isPlayoff && !g.isPlayIn
        && new Date(g.date).getTime() < todayMs
      );
      console.log(`\nOrphaned past games: ${orphans.length}`);
      if (orphans.length) {
        console.table(orphans.slice(0, 30).map(g => ({
          gid: g.gid, date: String(g.date).split('T')[0],
          home: tname(g.homeTid ?? g.homeTeamId),
          away: tname(g.awayTid ?? g.awayTeamId),
          isCup: !!g.isNBACup, cupRound: g.nbaCupRound ?? '',
          isPre: !!g.isPreseason,
        })));
      }

      // All-Star blackout window check
      const ls: any = state.leagueStats ?? {};
      const breakStart = ls.allStarBreakStart ?? ls.allStarStart;
      const breakEnd   = ls.allStarBreakEnd   ?? ls.allStarEnd;
      console.log(`\nAll-Star window: ${breakStart ?? '?'} → ${breakEnd ?? '?'}`);
      if (breakStart && breakEnd) {
        const s = new Date(breakStart).getTime();
        const e = new Date(breakEnd).getTime();
        const inBreak = (sched as any[]).filter(g => {
          const t = new Date(g.date).getTime();
          return t >= s && t <= e
            && !g.isAllStar && !g.isRisingStars
            && !g.isPlayoff && !g.isPlayIn;
        });
        console.log(`  Reg-season games inside blackout: ${inBreak.length}`);
        if (inBreak.length) {
          console.table(inBreak.map(g => ({
            gid: g.gid, date: String(g.date).split('T')[0], played: g.played,
            home: tname(g.homeTid ?? g.homeTeamId),
            away: tname(g.awayTid ?? g.awayTeamId),
          })));
        }
      }

      // Per-team GP — count only games that should affect 82-game record
      // (regular season + Cup group; exclude Cup KO unless final, exclude playoffs/playin/preseason/allstar)
      const gp: Record<number, { abbr: string; w: number; l: number; sched: number; played: number; pastUnplayed: number }> = {};
      for (const t of teams as any[]) {
        gp[t.id] = { abbr: t.abbrev ?? t.name, w: t.wins ?? 0, l: t.losses ?? 0, sched: 0, played: 0, pastUnplayed: 0 };
      }
      for (const g of sched as any[]) {
        if (g.isAllStar || g.isRisingStars || g.isPlayoff || g.isPlayIn || g.isPreseason) continue;
        // Mirror simulationService: W/L is written iff !excludeFromRecord.
        // (countsTowardRecord lives on the KO entry, not the Game — relying on
        // it here gave false-positive "short" reports for QF/SF cup games.)
        if (g.excludeFromRecord) continue;
        const homeTid = g.homeTid ?? g.homeTeamId;
        const awayTid = g.awayTid ?? g.awayTeamId;
        for (const tid of [homeTid, awayTid]) {
          if (!gp[tid]) continue;
          gp[tid].sched++;
          if (g.played) gp[tid].played++;
          else if (new Date(g.date).getTime() < todayMs) gp[tid].pastUnplayed++;
        }
      }

      const rows = Object.values(gp).map(r => ({
        team: r.abbr, WL: r.w + r.l, sched: r.sched, played: r.played,
        pastUnplayed: r.pastUnplayed, delta82: (r.w + r.l) - 82,
      })).sort((a, b) => Math.abs(b.delta82) - Math.abs(a.delta82) || a.team.localeCompare(b.team));
      console.log('\nPer-team regular-season GP (sorted by |delta vs 82|):');
      console.table(rows);

      const totalWL = rows.reduce((a, r) => a + r.WL, 0);
      const expected = (teams.filter((t: any) => t.id >= 0 && t.id < 100).length) * 82;
      console.log(`\nLeague total W+L = ${totalWL}  (expected ${expected})`);
      console.log(`Missing team-results: ${expected - totalWL}  (= ${(expected - totalWL) / 2} missing games)`);

      const inconsistent = rows.filter(r => r.played !== r.WL);
      if (inconsistent.length) {
        console.log('\n⚠ Teams where played-count ≠ W+L (asymmetric stat write):');
        console.table(inconsistent);
      }

      console.groupEnd();
      const short = rows.filter(r => r.delta82 < 0).map(r => r.team);
      const long  = rows.filter(r => r.delta82 > 0).map(r => r.team);
      return {
        title: 'Schedule audit',
        body: `Missing ${(expected - totalWL) / 2} games. Short: ${short.join(',') || '—'} · Long: ${long.join(',') || '—'} · Orphans: ${orphans.length}`,
        ok: true,
      };
    }

    case 'SCHEDFIX': {
      const sched = state.schedule ?? [];
      const teams = (state.teams ?? []).filter((team: any) => team.id >= 0 && team.id < 100);
      const teamIds = new Set(teams.map((team: any) => team.id));
      const today = normalizeDate(state.date);
      const todayMs = new Date(`${today}T00:00:00Z`).getTime();
      const maxGid = Math.max(0, ...sched.map((game: any) => Number(game.gid ?? 0)));
      let nextGid = maxGid + 1;

      const isRecordGame = (game: any): boolean => {
        if (game.isAllStar || game.isRisingStars || game.isCelebrityGame || game.isExhibition) return false;
        if (game.isPlayoff || game.isPlayIn || game.isPreseason || game.excludeFromRecord) return false;
        const homeTid = game.homeTid ?? game.homeTeamId;
        const awayTid = game.awayTid ?? game.awayTeamId;
        return teamIds.has(homeTid) && teamIds.has(awayTid);
      };
      const gameDate = (game: any): string => normalizeDate(String(game.date ?? state.date));
      const addDays = (date: string, offset: number): string => {
        const d = new Date(`${date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().split('T')[0];
      };

      const orphanGids = new Set<number>();
      for (const game of sched as any[]) {
        if (!isRecordGame(game) || game.played) continue;
        if (new Date(`${gameDate(game)}T00:00:00Z`).getTime() < todayMs) {
          orphanGids.add(Number(game.gid));
        }
      }

      const busyByDate = new Map<string, Set<number>>();
      const stampBusy = (date: string, homeTid: number, awayTid: number) => {
        let set = busyByDate.get(date);
        if (!set) { set = new Set(); busyByDate.set(date, set); }
        set.add(homeTid);
        set.add(awayTid);
      };
      for (const game of sched as any[]) {
        if (!isRecordGame(game) || orphanGids.has(Number(game.gid))) continue;
        stampBusy(gameDate(game), game.homeTid ?? game.homeTeamId, game.awayTid ?? game.awayTeamId);
      }
      const pickSlot = (homeTid: number, awayTid: number): string => {
        for (let offset = 0; offset <= 21; offset++) {
          const date = addDays(today, offset);
          const busy = busyByDate.get(date);
          if (!busy?.has(homeTid) && !busy?.has(awayTid)) return date;
        }
        return today;
      };

      let movedOrphans = 0;
      let patchedSchedule = (sched as any[]).map(game => {
        if (!orphanGids.has(Number(game.gid))) return game;
        const homeTid = game.homeTid ?? game.homeTeamId;
        const awayTid = game.awayTid ?? game.awayTeamId;
        const slot = pickSlot(homeTid, awayTid);
        stampBusy(slot, homeTid, awayTid);
        movedOrphans++;
        return { ...game, date: new Date(`${slot}T20:00:00Z`).toISOString() };
      });

      const scheduledCounts = new Map<number, number>(teams.map((team: any) => [team.id, 0]));
      for (const game of patchedSchedule) {
        if (!isRecordGame(game)) continue;
        scheduledCounts.set(game.homeTid ?? game.homeTeamId, (scheduledCounts.get(game.homeTid ?? game.homeTeamId) ?? 0) + 1);
        scheduledCounts.set(game.awayTid ?? game.awayTeamId, (scheduledCounts.get(game.awayTid ?? game.awayTeamId) ?? 0) + 1);
      }

      const owed: number[] = [];
      for (const team of teams as any[]) {
        const missing = Math.max(0, 82 - (scheduledCounts.get(team.id) ?? 0));
        for (let i = 0; i < missing; i++) owed.push(team.id);
      }

      const newGames: any[] = [];
      while (owed.length >= 2) {
        const homeTid = owed.shift()!;
        const opponentIndex = owed.findIndex(tid => tid !== homeTid);
        if (opponentIndex < 0) break;
        const [awayTid] = owed.splice(opponentIndex, 1);
        const slot = pickSlot(homeTid, awayTid);
        stampBusy(slot, homeTid, awayTid);
        newGames.push({
          gid: nextGid++,
          homeTid,
          awayTid,
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: new Date(`${slot}T20:00:00Z`).toISOString(),
          isMakeupGame: true,
        });
      }

      if (movedOrphans === 0 && newGames.length === 0) {
        return { title: 'SCHEDFIX', body: 'No schedule repair needed: no orphaned games and every NBA team already has 82 scheduled record games.', ok: true };
      }

      patchedSchedule = [...patchedSchedule, ...newGames].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
      const nbaCup = (state as any).nbaCup
        ? rebuildCupGroupStandingsFromSchedule((state as any).nbaCup, patchedSchedule as any)
        : undefined;

      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          schedule: patchedSchedule,
          ...(nbaCup ? { nbaCup } : {}),
        },
      } as any);

      const rows = teams.map((team: any) => {
        const before = scheduledCounts.get(team.id) ?? 0;
        const added = newGames.filter(game => game.homeTid === team.id || game.awayTid === team.id).length;
        return { team: team.abbrev ?? team.name, before, added, after: before + added, wl: (team.wins ?? 0) + (team.losses ?? 0) };
      }).filter(row => row.added > 0 || row.wl < 82).sort((a, b) => a.after - b.after || a.team.localeCompare(b.team));
      console.group('🗓 SCHEDFIX');
      console.log(`Moved orphaned games: ${movedOrphans}`);
      console.log(`Added makeup games: ${newGames.length}`);
      if (newGames.length > 0) {
        console.table(newGames.map(game => ({
          gid: game.gid,
          date: String(game.date).split('T')[0],
          home: teams.find((team: any) => team.id === game.homeTid)?.abbrev ?? game.homeTid,
          away: teams.find((team: any) => team.id === game.awayTid)?.abbrev ?? game.awayTid,
        })));
      }
      if (rows.length > 0) console.table(rows);
      console.groupEnd();

      return {
        title: 'SCHEDFIX',
        body: `Moved ${movedOrphans} orphaned game${movedOrphans === 1 ? '' : 's'} and added ${newGames.length} makeup game${newGames.length === 1 ? '' : 's'}. Sim the new makeup dates, then run SCHEDAUDIT again.`,
        ok: true,
      };
    }

    case 'FIXPOT': {
      // Universal age-aware estimator clamped to selected league ceilings.
      const POT_CAP: Record<string, number> = { 'China CBA': 50 };
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      let patched = 0;
      const updatedPlayers = state.players.map((p: any) => {
        const cap = POT_CAP[p.status];
        if (cap === undefined) return p;
        if (!p.ratings?.[0]) return p;
        const ovr = p.overallRating ?? p.ratings[0].ovr ?? 40;
        const age = currentYear - (p.born?.year ?? currentYear - 25);
        const targetPot = Math.min(cap, estimatePotentialBbgm(ovr, age));
        if ((p.ratings[0].pot ?? 0) <= targetPot) return p;
        const newRatings = p.ratings.map((r: any, i: number) =>
          i === 0 ? { ...r, pot: targetPot } : r
        );
        patched++;
        return { ...p, ratings: newRatings };
      });
      if (patched === 0) {
        return { title: 'FIXPOT', body: 'No players needed patching — pots already capped.', ok: true };
      }
      const patchedState = { ...state, players: updatedPlayers } as any;
      await dispatchAction({ type: 'LOAD_GAME', payload: patchedState } as any);
      console.log(`✅ FIXPOT: clamped pot on ${patched} external players`);
      return { title: 'FIXPOT done', body: `${patched} players patched. Save to persist.`, ok: true };
    }

    case 'APRON': {
      const thresholds = getCapThresholds(state.leagueStats as any);
      const yr = state.leagueStats?.year ?? new Date().getFullYear();
      const rows = state.teams
        .filter(t => t.id >= 0 && t.id < 100)
        .map(t => {
          const live = state.players
            .filter(p => p.tid === t.id && !(p as any).twoWay)
            .reduce((s, p) => s + (p.contract?.amount || 0) * 1000, 0);
          const dead = getTeamDeadMoneyForSeason(t, yr);
          const total = live + dead;
          return { t, live, dead, total, overApron2: total - thresholds.secondApron };
        })
        .sort((a, b) => b.total - a.total);
      console.log('%c═══ APRON AUDIT ═══', 'color:#f43f5e;font-weight:bold');
      console.log(`Cap=${fmt(thresholds.salaryCap)} Tax=${fmt(thresholds.luxuryTax)} 1st=${fmt(thresholds.firstApron)} 2nd=${fmt(thresholds.secondApron)}`);
      console.table(rows.map(r => ({
        team: r.t.abbrev,
        total: fmt(r.total),
        live: fmt(r.live),
        dead: fmt(r.dead),
        deadPct: r.total > 0 ? `${((r.dead / r.total) * 100).toFixed(0)}%` : '0%',
        vs2ndApron: r.overApron2 > 0 ? `+${fmt(r.overApron2)}` : fmt(r.overApron2),
      })));
      const offenders = rows.filter(r => r.overApron2 > 0).length;
      return { title: 'APRON', body: `${offenders} team(s) over 2nd apron. See console for full table.`, ok: true };
    }

    case 'DEADAUDIT': {
      const yr = state.leagueStats?.year ?? new Date().getFullYear();
      const rows = state.teams
        .filter(t => t.id >= 0 && t.id < 100)
        .map(t => {
          const entries = (t.deadMoney ?? []).length;
          const thisSeason = getTeamDeadMoneyForSeason(t, yr);
          const totalRemaining = (t.deadMoney ?? []).reduce(
            (s, e) => s + e.remainingByYear.reduce((ss, y) => ss + y.amountUSD, 0),
            0,
          );
          return { t, entries, thisSeason, totalRemaining };
        })
        .filter(r => r.entries > 0)
        .sort((a, b) => b.thisSeason - a.thisSeason);
      console.log('%c═══ DEAD MONEY AUDIT ═══', 'color:#fb923c;font-weight:bold');
      console.table(rows.map(r => ({
        team: r.t.abbrev,
        entries: r.entries,
        thisSeason: fmt(r.thisSeason),
        totalRemaining: fmt(r.totalRemaining),
      })));
      const total = rows.reduce((s, r) => s + r.thisSeason, 0);
      return { title: 'DEADAUDIT', body: `${rows.length} teams carrying dead money. League total this season: ${fmt(total)}.`, ok: true };
    }

    case 'CLEARDEAD': {
      const userTid = (state as any).userTeamId;
      if (userTid == null || userTid < 0) {
        return { title: 'CLEARDEAD', body: 'No user team — use CLEARDEADALL or load a save first.', ok: false };
      }
      const userTeam = state.teams.find(t => t.id === userTid);
      if (!userTeam || !(userTeam.deadMoney?.length)) {
        return { title: 'CLEARDEAD', body: `${userTeam?.abbrev ?? 'User team'} has no dead money.`, ok: true };
      }
      const yr = state.leagueStats?.year ?? new Date().getFullYear();
      const wiped = getTeamDeadMoneyForSeason(userTeam, yr);
      const updatedTeams = state.teams.map(t => t.id === userTid ? { ...t, deadMoney: [] } : t);
      const patched = { ...state, teams: updatedTeams } as any;
      await dispatchAction({ type: 'LOAD_GAME', payload: patched } as any);
      console.log(`✅ CLEARDEAD: wiped ${userTeam.deadMoney.length} dead-money entries on ${userTeam.abbrev} (${fmt(wiped)} this season)`);
      return { title: 'CLEARDEAD done', body: `Wiped ${userTeam.deadMoney.length} entries (${fmt(wiped)} this season) on ${userTeam.abbrev}. Save to persist.`, ok: true };
    }

    case 'RECENCY': {
      const stateDateMs = state.date ? new Date(state.date).getTime() : Date.now();
      const ONE_DAY = 1000 * 60 * 60 * 24;
      const recent = state.players
        .filter(p => {
          const sd = (p as any).signedDate;
          if (!sd) return false;
          const days = (stateDateMs - new Date(sd).getTime()) / ONE_DAY;
          return days >= 0 && days < 30;
        })
        .map(p => {
          const sd = (p as any).signedDate;
          const days = Math.floor((stateDateMs - new Date(sd).getTime()) / ONE_DAY);
          const team = state.teams.find(t => t.id === p.tid);
          const annualUSD = (p.contract?.amount ?? 0) * 1000;
          const flag = (p as any).twoWay ? '2W' : (p as any).nonGuaranteed ? 'NG' : 'STD';
          return {
            player: p.name,
            team: team?.abbrev ?? '?',
            ovr: p.overallRating ?? 0,
            type: flag,
            annual: fmt(annualUSD),
            signed: sd,
            daysAgo: days,
          };
        })
        .sort((a, b) => a.daysAgo - b.daysAgo);
      console.log('%c═══ RECENT SIGNINGS (≤ 30 days) ═══', 'color:#22d3ee;font-weight:bold');
      if (recent.length === 0) {
        console.log('No recently-signed players found. Either no signings in last 30 days, or signedDate not yet stamped on this save.');
        return { title: 'RECENCY', body: 'No recent signings found. Sim a few days post-fix to populate.', ok: true };
      }
      console.table(recent);
      const guarded = recent.filter(r => r.type === 'STD').length;
      return { title: 'RECENCY', body: `${recent.length} recent signings; ${guarded} guaranteed (protected from trim).`, ok: true };
    }

    case 'TX': {
      const TX_TYPES = new Set([
        'Signing', 'Waiver', 'Trade', 'Training Camp Release',
        'NG Guaranteed', 'Re-sign', 'Released', 'Drafted', 'Retired',
        'Two-way Signing', 'Two-way Conversion', 'Promotion',
      ]);
      const teamByTid = new Map(state.teams.map(t => [t.id, t.abbrev] as const));
      const teamByName = new Map(state.teams.map(t => [t.name.toLowerCase(), t.abbrev] as const));
      const playerByTid = new Map<string, number>();
      state.players.forEach(p => playerByTid.set(p.internalId, p.tid));
      // Waiver/release entries strand the player at tid -1 by the time TX runs,
      // so playerByTid mis-attributes them as "tid-1". Prefer the explicit tid
      // stamped on the history record (forward-fix); fall back to parsing the
      // team name out of "...by the {Team Name}" for pre-fix records.
      const teamFromText = (text: string): string | undefined => {
        const m = /by the (.+?)$/.exec(text.trim());
        if (!m) return undefined;
        return teamByName.get(m[1].toLowerCase());
      };
      const history = (state.history ?? []) as any[];
      const txs = history
        .map((h, idx) => {
          if (typeof h === 'string') return null;
          if (!h || typeof h !== 'object') return null;
          if (h.type && !TX_TYPES.has(h.type)) return null;
          const pid = h.playerIds?.[0];
          const explicitTid: number | undefined = typeof h.tid === 'number' ? h.tid : undefined;
          const tidFromPlayer = pid != null ? playerByTid.get(pid) : undefined;
          const tid = explicitTid ?? tidFromPlayer;
          // tid -1 = current FA = mis-attribution for waiver entries; resolve via text.
          const teamFromTid = (tid != null && tid >= 0) ? teamByTid.get(tid) : undefined;
          const teamLabel = teamFromTid ?? teamFromText(h.text ?? '') ?? (tid != null ? `tid${tid}` : '—');
          return {
            idx,
            date: h.date ?? '',
            type: h.type ?? '?',
            team: teamLabel,
            text: h.text ?? '',
            commish: h.commissioner ? '✓' : '',
          };
        })
        .filter(Boolean) as Array<Record<string, any>>;
      const recent = txs.slice(-200).reverse();
      console.log(`%c═══ TRANSACTIONS (last ${recent.length} of ${txs.length}) ═══`, 'color:#a3e635;font-weight:bold');
      console.table(recent.map(({ idx, ...rest }) => rest));

      const yr = state.leagueStats?.year ?? new Date().getFullYear();
      const deadRows: Array<Record<string, any>> = [];
      state.teams
        .filter(t => t.id >= 0 && t.id < 100)
        .forEach(t => {
          (t.deadMoney ?? []).forEach(e => {
            const totalRemaining = e.remainingByYear.reduce((s, y) => s + y.amountUSD, 0);
            const thisYrEntry = e.remainingByYear.find(y => parseInt(y.season.split('-')[0], 10) + 1 === yr);
            deadRows.push({
              team: t.abbrev,
              player: e.playerName,
              waivedDate: e.waivedDate,
              stretched: e.stretched ? '✓' : '',
              thisYr: fmt(thisYrEntry?.amountUSD ?? 0),
              remaining: fmt(totalRemaining),
              years: e.remainingByYear.length,
              expOrig: e.originalExpYear,
            });
          });
        });
      deadRows.sort((a, b) => (b.waivedDate < a.waivedDate ? -1 : 1));
      console.log(`%c═══ DEAD MONEY ENTRIES (${deadRows.length} across all teams) ═══`, 'color:#fb923c;font-weight:bold');
      if (deadRows.length === 0) {
        console.log('No dead-money entries on any team. Clean save!');
      } else {
        console.table(deadRows);
      }

      return {
        title: 'TX',
        body: `Logged ${recent.length} recent transactions + ${deadRows.length} dead-money entries to console.`,
        ok: true,
      };
    }

    case 'CLEARDEADALL': {
      const userTid = (state as any).userTeamId;
      let teamsCleared = 0;
      let entriesCleared = 0;
      const updatedTeams = state.teams.map(t => {
        if (t.id === userTid) return t;
        if (!(t.deadMoney?.length)) return t;
        teamsCleared++;
        entriesCleared += t.deadMoney.length;
        return { ...t, deadMoney: [] };
      });
      if (teamsCleared === 0) {
        return { title: 'CLEARDEADALL', body: 'No AI teams have dead money.', ok: true };
      }
      const patched = { ...state, teams: updatedTeams } as any;
      await dispatchAction({ type: 'LOAD_GAME', payload: patched } as any);
      console.log(`✅ CLEARDEADALL: wiped ${entriesCleared} entries across ${teamsCleared} AI teams`);
      return { title: 'CLEARDEADALL done', body: `Wiped ${entriesCleared} entries across ${teamsCleared} AI teams. User team preserved. Save to persist.`, ok: true };
    }

    case 'SPAM':       return await runSpam(ctx);
    case 'WARP':       return await runWarp(ctx);
    case 'STUCK':      return runStuck(getLive(ctx));
    case 'PHASEDUMP':  return runPhaseDump(getLive(ctx));
    case 'GATESCAN':   return runGateScan(getLive(ctx));
    case 'WARPSLOW':   return await runWarpSlow(ctx);
    case 'SAMPLE12':   return await runSample12(getLive(ctx));
    case 'SCOREPROF':  return await runScoreProf(getLive(ctx));
    case 'PLAYERDIST': return await runPlayerDist(getLive(ctx));
    case 'TEAMCHECK':  return await runTeamCheck(getLive(ctx));
    case 'LEADERS':    return await runLeaders(getLive(ctx));
    case 'DISTSHAPE':  return await runDistShape(getLive(ctx));
    case 'TIERS':      return await runTiers(getLive(ctx));
    case 'ADVCHECK':   return await runAdvCheck(getLive(ctx));
    case 'BENCHEFF':   return await runBenchEff(getLive(ctx));
    case 'PERSAMPLE':  return await runPerSample(getLive(ctx));
    case 'SIMBENCH':   return await runSimBench(getLive(ctx));
    case 'PLAYERBENCH':return await runPlayerBench(getLive(ctx));
    case 'SIMTRACE':   return runSimTrace();
    case 'SIMLEADERS': return await runSimLeaders(getLive(ctx));

    default:
      return { title: 'Unknown cheat', body: `"${code}" not recognized — try HELP`, ok: false };
  }
}

function getLive(ctx: CheatContext): GameState {
  const fn = (window as any).__nbaGetLiveState as (() => GameState) | undefined;
  return fn ? fn() : ctx.state;
}

export function matchCheat(input: string): CheatCode | null {
  const normalized = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!(normalized in CHEAT_CODES)) return null;
  return normalized as CheatCode;
}

/**
 * Execute a cheat. Shows a native alert for user feedback.
 */
export async function triggerCheat(code: CheatCode, ctx: CheatContext): Promise<void> {
  console.log(`%c🎮 CHEAT: ${code}`, 'color: #f59e0b; font-weight: bold; font-size: 14px');
  const result = await runCheat(code, ctx);
  const icon = result.ok ? '✅' : '⚠️';
  alert(`${icon} ${result.title}\n\n${result.body}\n\n(Details: F12 console)`);
}

