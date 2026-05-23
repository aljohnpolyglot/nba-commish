import type { GameState } from '../../types';
import { normalizeDate } from '../helpers';
import { getUnresolvedEuroSeasonCompetitionIds } from '../../services/competition/competitionResolver';
import type { CheatContext, CheatResult } from './shared';

function getLive(ctx: CheatContext): GameState {
  const fn = (window as any).__nbaGetLiveState as (() => GameState) | undefined;
  return fn ? fn() : ctx.state;
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

interface ErrCapture {
  errors: string[];
  unhandled: string[];
  install: () => void;
  restore: () => void;
}

function captureErrors(): ErrCapture {
  const errors: string[] = [];
  const unhandled: string[] = [];
  const origErr = window.onerror;
  const origRej = window.onunhandledrejection;
  const origConsole = console.error;
  return {
    errors,
    unhandled,
    install() {
      window.onerror = (msg, src, line, col, err) => {
        errors.push(`${msg} @ ${src}:${line}:${col} ${err?.stack ?? ''}`.slice(0, 800));
        return false;
      };
      window.onunhandledrejection = (e: any) => {
        unhandled.push(String(e?.reason?.stack ?? e?.reason ?? e).slice(0, 800));
      };
      console.error = (...args: any[]) => {
        try { errors.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 600)); } catch { /* ignore */ }
        origConsole.apply(console, args);
      };
    },
    restore() {
      window.onerror = origErr;
      window.onunhandledrejection = origRej;
      console.error = origConsole;
    },
  };
}

function snapshot(s: GameState) {
  const sched: any[] = (s as any).schedule ?? [];
  const today = (s as any).date;
  const todayNorm = normalizeDate(String(today)); // YYYY-MM-DD
  const unplayedPast = sched.filter((g: any) => !g.played && g.date && normalizeDate(String(g.date)) < todayNorm);
  const fa = ((s as any).faBidding?.markets ?? []) as any[];
  const stuckMarkets = fa.filter(m => !m.resolved && (m.daysToDecide ?? 99) <= 0);
  const unresolvedEuroSeasonCompetitions = getUnresolvedEuroSeasonCompetitionIds(s as any);
  return {
    date: todayNorm,
    year: (s as any).leagueStats?.year,
    draftComplete: (s as any).draftComplete,
    schedLen: sched.length,
    unplayedPast: unplayedPast.length,
    unresolvedEuroSeasonCompetitions,
    faMarkets: fa.length,
    stuckMarkets: stuckMarkets.length,
    historyLen: (s as any).history?.length ?? 0,
    newsLen: (s as any).news?.length ?? 0,
    pendingFAToasts: ((s as any).pendingFAToasts ?? []).length,
    playoffSeries: ((s as any).playoffs?.series ?? []).length,
  };
}

async function dispatchSafe(ctx: CheatContext, action: any, capture: ErrCapture): Promise<string | null> {
  try {
    await ctx.dispatchAction(action);
    return null;
  } catch (e: any) {
    const msg = String(e?.stack ?? e?.message ?? e).slice(0, 600);
    capture.errors.push(`dispatch threw: ${msg}`);
    return msg;
  }
}

// SPAM ────────────────────────────────────────────────────────────────────────
export async function runSpam(ctx: CheatContext): Promise<CheatResult> {
  const N = 60;
  const cap = captureErrors();
  cap.install();
  console.group(`%c🔁 SPAM ×${N}  (ADVANCE_DAY)`, 'color:#f59e0b;font-weight:bold');
  const before = snapshot(getLive(ctx));
  console.log('start:', before);

  const ticks: any[] = [];
  let stuckCount = 0;
  let prevDate = before.date;

  for (let i = 0; i < N; i++) {
    const beforeS = snapshot(getLive(ctx));
    const err = await dispatchSafe(ctx, { type: 'ADVANCE_DAY' }, cap);
    await sleep(20);
    const afterS = snapshot(getLive(ctx));
    const dateDelta = afterS.date === beforeS.date
      ? 'STUCK'
      : (normalizeDate(afterS.date) > normalizeDate(beforeS.date) ? 'ok' : 'BACKWARD?!');
    if (dateDelta === 'STUCK') stuckCount++;
    const row = {
      i,
      from: beforeS.date,
      to: afterS.date,
      delta: dateDelta,
      schedDelta: afterS.schedLen - beforeS.schedLen,
      unplayedPast: afterS.unplayedPast,
      faMarkets: afterS.faMarkets,
      stuckMarkets: afterS.stuckMarkets,
      err: err ? err.slice(0, 80) : '',
    };
    ticks.push(row);
    if (err) {
      console.error('💥 stop-on-error at tick', i);
      break;
    }
    if (dateDelta === 'STUCK' && stuckCount >= 5) {
      console.warn('⛔ stop after 5 consecutive stuck ticks');
      break;
    }
    prevDate = afterS.date;
  }
  void prevDate;

  cap.restore();
  console.table(ticks);
  console.log('errors:', cap.errors);
  console.log('unhandled rejections:', cap.unhandled);
  const after = snapshot(getLive(ctx));
  console.log('end:', after);
  console.groupEnd();

  return {
    title: 'SPAM done',
    body: `${ticks.length} ticks · ${stuckCount} stuck · ${cap.errors.length} errors · ${cap.unhandled.length} unhandled. See console.`,
    ok: cap.errors.length === 0 && stuckCount === 0,
  };
}

// WARP ────────────────────────────────────────────────────────────────────────
export async function runWarp(ctx: CheatContext): Promise<CheatResult> {
  const SEASONS = 5;
  const cap = captureErrors();
  cap.install();
  console.group(`%c🌌 WARP — ${SEASONS} season multiverse`, 'color:#a78bfa;font-weight:bold');
  const start = snapshot(getLive(ctx));
  console.log('start:', start);

  // Lazy-load date utils to avoid bloating cheat module imports up-top.
  const dt = await import('../dateUtils');
  const checkpoints: any[] = [];

  for (let s = 0; s < SEASONS; s++) {
    const live = getLive(ctx);
    const ls = (live as any).leagueStats ?? {};
    const year: number = ls.year ?? new Date(String((live as any).date)).getUTCFullYear();
    const stops: Array<{ label: string; date: string; through?: boolean }> = [
      { label: 'training-camp',  date: dt.toISODateString(dt.getTrainingCampDate(year, ls)) },
      { label: 'opening-night',  date: dt.toISODateString(dt.getOpeningNightDate(year)) },
      { label: 'trade-deadline', date: dt.toISODateString(dt.getTradeDeadlineDate(year, ls)) },
      { label: 'all-star',       date: dt.toISODateString(dt.getAllStarWeekendStartDate(year, ls)) },
      { label: 'lottery',        date: dt.toISODateString(dt.getDraftLotteryDate(year, ls)) },
      { label: 'draft',          date: dt.toISODateString(dt.getDraftDate(year, ls)) },
      { label: 'fa-start',       date: dt.toISODateString(dt.getFreeAgencyStartDate(year, ls)) },
      { label: `next-camp(${year + 1})`, date: dt.toISODateString(dt.getTrainingCampDate(year + 1, ls)), through: true },
    ];

    for (const stop of stops) {
      const beforeS = snapshot(getLive(ctx));
      const t0 = performance.now();
      const err = await dispatchSafe(ctx, {
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: stop.date, stopBefore: !stop.through },
      }, cap);
      await sleep(40);
      const afterS = snapshot(getLive(ctx));
      const ms = Math.round(performance.now() - t0);
      const advanced = afterS.date !== beforeS.date;
      const overshoot = normalizeDate(afterS.date) > stop.date;
      const undershoot = !stop.through && normalizeDate(afterS.date) < stop.date && advanced === false;
      const row = {
        season: s + 1,
        target: `${stop.label}@${stop.date}`,
        landed: afterS.date,
        advanced,
        overshoot,
        undershoot,
        unplayedPast: afterS.unplayedPast,
        stuckMarkets: afterS.stuckMarkets,
        faMarkets: afterS.faMarkets,
        ms,
        err: err ? err.slice(0, 80) : '',
      };
      checkpoints.push(row);
      if (err) {
        console.error('💥 WARP halted at', row);
        cap.restore();
        console.table(checkpoints);
        console.log('errors:', cap.errors);
        console.log('unhandled:', cap.unhandled);
        console.groupEnd();
        return { title: 'WARP halted', body: `Stopped season ${s + 1} @ ${stop.label}. See console.`, ok: false };
      }
    }
  }

  cap.restore();
  console.table(checkpoints);
  console.log('errors:', cap.errors);
  console.log('unhandled:', cap.unhandled);
  const end = snapshot(getLive(ctx));
  console.log('end:', end);
  console.groupEnd();

  const stuckCount = checkpoints.filter(c => c.undershoot || c.stuckMarkets > 0 || c.unplayedPast > 0).length;
  return {
    title: 'WARP complete',
    body: `${SEASONS} seasons · ${checkpoints.length} checkpoints · ${stuckCount} suspect · ${cap.errors.length} errors. See console.`,
    ok: cap.errors.length === 0 && stuckCount === 0,
  };
}

// WARPSLOW ────────────────────────────────────────────────────────────────────
// Crawls forward in tiny 7-day hops with a per-hop watchdog. On hang, the watchdog
// fires *while* dispatchAction is still pending — we can't actually cancel the
// in-flight sim (no abort signal in the action pipeline), but we CAN log the
// stall point + snapshot from the watchdog timer, then halt before issuing
// further hops. The user can then F5 and inspect.
export async function runWarpSlow(ctx: CheatContext): Promise<CheatResult> {
  const STEP_DAYS = 7;
  const MAX_HOPS = 60;             // ~14 months of crawl ceiling
  const HOP_TIMEOUT_MS = 30_000;
  const cap = captureErrors();
  cap.install();
  console.group('%c🐢 WARPSLOW — 7-day hops, 30s watchdog', 'color:#fb7185;font-weight:bold');

  const addDays = (raw: string, days: number) => {
    const norm = normalizeDate(raw);  // 'Jul 1, 2029' → '2029-07-01'
    const d = new Date(`${norm}T00:00:00Z`);
    if (isNaN(d.getTime())) throw new Error(`addDays: cannot parse "${raw}" (norm="${norm}")`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const rows: any[] = [];
  let stalled = false;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const beforeS = snapshot(getLive(ctx));
    const target = addDays(beforeS.date, STEP_DAYS);

    let watchdogFired = false;
    let lastSnapshotAtTimeout: any = null;
    const watchdog = setTimeout(() => {
      watchdogFired = true;
      lastSnapshotAtTimeout = snapshot(getLive(ctx));
      console.error(`⏱ HOP ${hop} TIMEOUT after ${HOP_TIMEOUT_MS}ms`);
      console.error(`   started at: ${beforeS.date}`);
      console.error(`   target:     ${target}`);
      console.error(`   live now:   ${lastSnapshotAtTimeout.date}`);
      console.error(`   advanced:   ${lastSnapshotAtTimeout.date !== beforeS.date ? `YES → ${lastSnapshotAtTimeout.date}` : 'NO — sim hung on day 1 of hop'}`);
      console.error(`   schedLen:   ${lastSnapshotAtTimeout.schedLen} (was ${beforeS.schedLen}, delta ${lastSnapshotAtTimeout.schedLen - beforeS.schedLen})`);
      console.error(`   faMarkets:  ${lastSnapshotAtTimeout.faMarkets} (stuck=${lastSnapshotAtTimeout.stuckMarkets})`);
      console.error(`   unplayedPast: ${lastSnapshotAtTimeout.unplayedPast}`);
    }, HOP_TIMEOUT_MS);

    const t0 = performance.now();
    const err = await dispatchSafe(ctx, {
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: target, stopBefore: false },
    }, cap);
    clearTimeout(watchdog);
    await sleep(50);
    const ms = Math.round(performance.now() - t0);
    const afterS = snapshot(getLive(ctx));
    const advancedDays = afterS.date === beforeS.date ? 0
      : Math.round((Date.parse(normalizeDate(afterS.date) + 'T00:00:00Z') - Date.parse(normalizeDate(beforeS.date) + 'T00:00:00Z')) / 86_400_000);

    const row = {
      hop,
      from: beforeS.date,
      target,
      landed: afterS.date,
      advancedDays,
      ms,
      timedOut: watchdogFired,
      schedDelta: afterS.schedLen - beforeS.schedLen,
      stuckMarkets: afterS.stuckMarkets,
      faMarkets: afterS.faMarkets,
      err: err ? err.slice(0, 80) : '',
    };
    rows.push(row);
    console.log(`hop ${hop}: ${beforeS.date} → ${afterS.date} (${ms}ms${watchdogFired ? ' ⚠️TIMEOUT' : ''})`);

    if (err || watchdogFired) {
      stalled = true;
      break;
    }
    if (advancedDays === 0) {
      console.warn(`⛔ hop ${hop}: zero advance from ${beforeS.date} — halting`);
      stalled = true;
      break;
    }
  }

  cap.restore();
  console.table(rows);
  console.log('errors:', cap.errors);
  console.log('unhandled:', cap.unhandled);
  console.groupEnd();

  return {
    title: stalled ? 'WARPSLOW stalled' : 'WARPSLOW done',
    body: `${rows.length} hops · ${cap.errors.length} errors · stall=${stalled}. See console.`,
    ok: !stalled && cap.errors.length === 0,
  };
}

// STUCK ───────────────────────────────────────────────────────────────────────
export function runStuck(state: GameState): CheatResult {
  console.group('%c🩺 STUCK diagnostic', 'color:#f43f5e;font-weight:bold');
  const findings: string[] = [];
  const s: any = state;
  const today = String(s.date);
  const todayShort = normalizeDate(today);  // 'Jul 1, 2029' → '2029-07-01'

  // Bug D — FA market stuck
  const fa = (s.faBidding?.markets ?? []) as any[];
  const stuckMarkets = fa.filter(m => !m.resolved && (m.daysToDecide ?? 99) <= 0);
  if (stuckMarkets.length) {
    findings.push(`Bug D: ${stuckMarkets.length} FA markets at "Resolves today" with daysToDecide<=0 (no progress)`);
    console.table(stuckMarkets.map(m => ({
      playerId: m.playerId, days: m.daysToDecide, bids: (m.bids ?? []).length,
      hasUserBid: (m.bids ?? []).some((b: any) => b.isUserBid), resolved: m.resolved,
    })));
  }

  // Bug A — past-dated unplayed games (bucketed so exhibitions / orphan playoff slots
  // don't get conflated with real reg-season skips).
  const sched = (s.schedule ?? []) as any[];
  const unplayed = sched.filter(g => !g.played && g.date && normalizeDate(String(g.date)) < todayShort);
  if (unplayed.length) {
    const cat = (g: any) => {
      if (g.isExhibition || g.isDunkContest || g.isThreePointContest || g.isRisingStars || g.isCelebrityGame) return 'all-star/exhibition';
      if (g.isPlayoffs || g.playoffs || (g.gid >= 400000 && g.gid < 500000)) return 'playoff-slot (likely unused — series ended early)';
      if (g.isPlayIn) return 'play-in';
      if (g.isCup) return 'cup';
      return 'regular-season (REAL skip)';
    };
    const buckets: Record<string, number> = {};
    unplayed.forEach(g => { const k = cat(g); buckets[k] = (buckets[k] ?? 0) + 1; });
    findings.push(`Bug A: ${unplayed.length} unplayed games dated before today (${todayShort}). Bucketed:`);
    Object.entries(buckets).forEach(([k, v]) => findings.push(`     · ${v} ${k}`));
    console.log('unplayed-past breakdown:'); console.table(buckets);
    console.table(unplayed.slice(0, 12).map(g => ({
      gid: g.gid, date: String(g.date).slice(0, 10), home: g.homeTid, away: g.awayTid, bucket: cat(g),
    })));
  }

  // Bug B — draftComplete drift
  if (s.draftComplete && (s.draftPicks ?? []).some((p: any) => p.season === s.leagueStats?.year && !p.playerSelected)) {
    findings.push('Bug B candidate: draftComplete=true but draftPicks for current year still have unselected slots');
  }

  // Bug F — phase vs date heuristic
  // Reuse the same phase logic shape as PlayButton without importing UI.
  try {
    const ls = s.leagueStats ?? {};
    const year: number = ls.year ?? new Date(today).getUTCFullYear();
    const cur = new Date(today);
    // Best-effort: if July and getCurrentOffseasonFAStart says we're past FA start, expect 'free-agency'.
    const month = cur.getUTCMonth() + 1;
    if (month === 7 || month === 8) {
      findings.push(`Bug F probe: today=${todayShort}, year=${year}, month=${month}. Verify PlayButton shows free-agency phase (One day / One week / Until preseason). If it shows "Until free agency" instead, that's Bug F.`);
    }
  } catch { /* ignore */ }

  const unresolvedEuroSeasonCompetitions = getUnresolvedEuroSeasonCompetitionIds(s as any);
  if (unresolvedEuroSeasonCompetitions.length > 0 && s.offseasonChecklist) {
    findings.push(`Euro playoff bug: offseasonChecklist is mounted while unresolved season competitions remain: ${unresolvedEuroSeasonCompetitions.join(', ')}`);
  } else if (unresolvedEuroSeasonCompetitions.length > 0) {
    findings.push(`Euro postseason active: unresolved season competitions remain: ${unresolvedEuroSeasonCompetitions.join(', ')}`);
  }

  // Pending FA toasts pipeline
  const toasts = (s.pendingFAToasts ?? []).length;
  console.log('pendingFAToasts queued:', toasts);

  // Markets summary
  console.log(`FA markets total=${fa.length}, resolved=${fa.filter(m => m.resolved).length}, stuck=${stuckMarkets.length}`);

  if (findings.length === 0) {
    findings.push('No known stuck conditions detected. Run SPAM or WARP to provoke them.');
  }
  console.log('Findings:');
  findings.forEach(f => console.log('  •', f));
  console.groupEnd();

  return { title: 'STUCK diagnostic', body: findings.join('\n'), ok: stuckMarkets.length === 0 && unplayed.length === 0 };
}

// PHASEDUMP ───────────────────────────────────────────────────────────────────
export async function runPhaseDump(state: GameState): Promise<CheatResult> {
  const dt = await import('../dateUtils');
  const s: any = state;
  const ls = s.leagueStats ?? {};
  const today = String(s.date);
  const year: number = ls.year ?? new Date(today).getUTCFullYear();

  const dates = {
    today,
    year,
    trainingCamp: dt.toISODateString(dt.getTrainingCampDate(year, ls)),
    openingNight: dt.toISODateString(dt.getOpeningNightDate(year)),
    tradeDeadline: dt.toISODateString(dt.getTradeDeadlineDate(year, ls)),
    allStar: dt.toISODateString(dt.getAllStarWeekendStartDate(year, ls)),
    lottery: dt.toISODateString(dt.getDraftLotteryDate(year, ls)),
    draft: dt.toISODateString(dt.getDraftDate(year, ls)),
    faStart: dt.toISODateString(dt.getFreeAgencyStartDate(year, ls)),
    moratoriumEnd: dt.toISODateString(dt.getFreeAgencyMoratoriumEndDate(year, ls)),
    rolloverDate: dt.toISODateString(dt.getRolloverDate(year, ls)),
  };
  console.group('%c📅 PHASEDUMP', 'color:#22d3ee;font-weight:bold');
  console.table(dates);
  console.log('draftComplete:', s.draftComplete);
  console.log('schedule entries:', (s.schedule ?? []).length);
  console.log('playoff series:', (s.playoffs?.series ?? []).length);
  console.log('faBidding markets:', (s.faBidding?.markets ?? []).length);
  console.log('unresolved Euro season competitions:', getUnresolvedEuroSeasonCompetitionIds(s as any));
  console.log('TIP: cross-reference today against the date table above. If today is past a milestone but PlayButton still offers "Until X", phase detection drifted.');
  console.groupEnd();
  return { title: 'PHASEDUMP', body: `today=${today} year=${year} — see console table`, ok: true };
}

// GATESCAN ────────────────────────────────────────────────────────────────────
export function runGateScan(state: GameState): CheatResult {
  const s: any = state;
  console.group('%c🚪 GATESCAN', 'color:#84cc16;font-weight:bold');
  console.log('userTeamId:', s.userTeamId, '| gameMode:', s.gameMode);

  if (s.gameMode === 'gm' && typeof s.userTeamId === 'number') {
    const userPlayers = s.players.filter((p: any) => p.tid === s.userTeamId);
    const standard = userPlayers.filter((p: any) => !p.twoWay);
    const twoWay = userPlayers.filter((p: any) => p.twoWay);
    console.log(`User roster: ${standard.length}/15 standard, ${twoWay.length}/3 two-way`);
    if (standard.length < 13) console.warn('⚠️ Below 13 standard — rosterGate should be blocking sim. If "Until X" advances anyway, gate is bypassed.');
    if (standard.length > 15) console.warn('⚠️ Over 15 standard — rosterGate should be blocking. Likely Bug: trim not running before sim.');
  }

  console.log('draftComplete:', s.draftComplete);
  const draftYear = s.leagueStats?.year;
  const currentDraftPicks = (s.draftPicks ?? []).filter((p: any) => p.season === draftYear);
  const unselected = currentDraftPicks.filter((p: any) => !p.playerSelected);
  console.log(`Draft picks for ${draftYear}: ${currentDraftPicks.length} total, ${unselected.length} unselected.`);
  if (unselected.length > 0 && s.draftComplete) {
    console.warn('⚠️ draftComplete=true but unselected picks remain — draft gate flag drift (Bug B candidate).');
  }
  console.log('TIP: Open the "Watch/Auto-sim" modal manually to verify the draft gate fires when you click "Until draft" from PlayButton.');
  console.groupEnd();
  return { title: 'GATESCAN', body: 'Gate state dumped to console.', ok: true };
}
