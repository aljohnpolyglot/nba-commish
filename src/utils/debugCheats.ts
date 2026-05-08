/**
 * Debug cheats, GTA-style.
 *
 * Type a cheat code into the Free Agents search bar and press Enter.
 * Inspired by HESOYAM / ROCKETMAN / IAMHERE from San Andreas / V.
 *
 * Most cheats log to the console (F12 → Console) — that's by design. The
 * search bar just triggers the action; the output lives in DevTools.
 */

import type { GameState } from '../types';
import { convertTo2KRating, normalizeDate } from './helpers';
import { estimatePotentialBbgm } from './playerRatings';
import { deriveLeagueStartYearFromHistory, explainJerseyRetirementCandidates } from '../services/playerDevelopment/jerseyRetirementChecker';
import { resolveTeamStrategyProfile } from './teamStrategy';
import { calcPlayerTV, calcPickTV, calcOvr2K } from '../services/trade/tradeValueEngine';
import { DEFAULT_TRADABLE_PICK_SEASONS } from '../services/draft/DraftPickGenerator';
import { effectiveRecord, getCapThresholds, getTeamPayrollUSD, getTeamDeadMoneyForSeason } from './salaryUtils';

export interface CheatContext {
  state: GameState;
  dispatchAction: (action: any) => Promise<void> | void;
  healPlayer?: (playerId: string) => void;
}

export interface CheatResult {
  title: string;
  body: string;
  ok: boolean;
}

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
  SALARYAUDIT: 'Players with 3+ NBA seasons played but sparse/missing contractYears — tracks contract history gaps as sim progresses',
  JERSEYAUDIT: 'Jersey retirement audit — shows current candidates, pre-save retirees, and why each case was included or skipped',
  JERSEYRETIREMENT: 'Alias for JERSEYAUDIT',
  STRATEGY: 'Per-team strategy profile (key/role/mode/weights) + executed trades with sender/receiver TVs',
  CUPDEBUG: 'NBA Cup state dump — groups, scheduled cup games, played count, knockout bracket, awards',
  CUPSIM: 'Sim-jump to Dec 17 to play out the entire Cup window (group stage → knockouts → awards)',
  CUPINJECT: 'Retroactively inject Cup group games into a save where groups exist but no Cup games were scheduled (recovers broken pre-fix saves)',
  SCHEDAUDIT: 'Schedule integrity audit — orphaned games, per-team GP vs 82, All-Star blackout casualties, asymmetric W/L',
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
} as const;

export type CheatCode = keyof typeof CHEAT_CODES;

// ─── Cheat handlers ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + (n / 1_000_000).toFixed(1) + 'M';
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
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
      const { SaveManager } = await import('../services/SaveManager');
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
      const rows = explainJerseyRetirementCandidates(state.players, state.teams, currentYear, { leagueStartYear });

      const summary = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.outcome] = (acc[row.outcome] || 0) + 1;
        return acc;
      }, {});

      const candidates = rows.filter(r => r.outcome === 'candidate').slice(0, 50);
      const preSave = rows.filter(r => r.outcome === 'skip_pre_save_retiree').slice(0, 50);
      const notDue = rows.filter(r => r.outcome === 'skip_not_due').slice(0, 50);

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
      console.groupEnd();

      return {
        title: 'Jersey audit',
        body: `${rows.filter(r => r.outcome === 'candidate').length} due now | ${rows.filter(r => r.outcome === 'skip_pre_save_retiree').length} pre-save retirees excluded`,
        ok: true,
      };
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

      const { injectCupGroupGames } = await import('../services/nbaCup/scheduleInjector');
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

    case 'FIXPOT': {
      // Universal age-aware estimator clamped to league ovr ceiling. Old players
      // get pot=ovr (no NBA-tier headroom); young players keep growth room up to
      // their league cap. PBA cap 46, ChinaCBA cap 50 (raw BBGM).
      const POT_CAP: Record<string, number> = { PBA: 46, 'China CBA': 50 };
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

    default:
      return { title: 'Unknown cheat', body: `"${code}" not recognized — try HELP`, ok: false };
  }
}

// ─── Multiverse / sim-stress harness ─────────────────────────────────────────
//
// Goal: surface "where does the sim break" without playing through 5 seasons by hand.
// Every cheat below logs a structured handoff to console so a hand-off to Codex
// (TODO.md Sessions 42/43/44) has a frozen snapshot of phase/date/gate/error state.

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
  return {
    date: todayNorm,
    year: (s as any).leagueStats?.year,
    draftComplete: (s as any).draftComplete,
    schedLen: sched.length,
    unplayedPast: unplayedPast.length,
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
async function runSpam(ctx: CheatContext): Promise<CheatResult> {
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
async function runWarp(ctx: CheatContext): Promise<CheatResult> {
  const SEASONS = 5;
  const cap = captureErrors();
  cap.install();
  console.group(`%c🌌 WARP — ${SEASONS} season multiverse`, 'color:#a78bfa;font-weight:bold');
  const start = snapshot(getLive(ctx));
  console.log('start:', start);

  // Lazy-load date utils to avoid bloating cheat module imports up-top.
  const dt = await import('./dateUtils');
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
async function runWarpSlow(ctx: CheatContext): Promise<CheatResult> {
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
function runStuck(state: GameState): CheatResult {
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
async function runPhaseDump(state: GameState): Promise<CheatResult> {
  const dt = await import('./dateUtils');
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
  console.log('TIP: cross-reference today against the date table above. If today is past a milestone but PlayButton still offers "Until X", phase detection drifted.');
  console.groupEnd();
  return { title: 'PHASEDUMP', body: `today=${today} year=${year} — see console table`, ok: true };
}

// GATESCAN ────────────────────────────────────────────────────────────────────
function runGateScan(state: GameState): CheatResult {
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

// SAMPLE12 ────────────────────────────────────────────────────────────────────
// Stratified 24-game audit for sim-realism: 6 low / 10 mid / 6 high / 1 blowout / 1 OT.
// 48 team-game datapoints → correlations between Score, eFG%, FGA, AST/FGM.
// Pathologies surface as: pts↔eFG% correlation < 0.6, FGA spread > 30, AR > 0.65 in brick-fests.
// Output is plain TSV in the console (no nested arrays/objects) — Ctrl+A inside the
// SAMPLE12 group, Ctrl+C copies the entire dump as flat text.
async function runSample12(state: GameState): Promise<CheatResult> {
  const TARGET_GAMES = 24;
  const STRATA = { low: 6, mid: 10, high: 6, blowout: 1, ot: 1 };

  // Filter to PURE NBA REGULAR-SEASON games. Preseason / international / intra-squad
  // games run on alternate Knobs (KNOBS_BLEAGUE/EUROLEAGUE/PBA, paceMultiplier 0.82–1.05)
  // which legitimately produce 60–105 FGA — they're NOT pathologies but they inflate σ
  // and mask real NBA-side bugs.
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity) return false;
    if (g.isPreseason) return false;
    if (!Array.isArray(g.homeStats) || !Array.isArray(g.awayStats)) return false;
    if (g.homeStats.length === 0 || g.awayStats.length === 0) return false;
    // Non-NBA team IDs: tid >= 100 → G-League, Euroleague (tid+1000), ChinaCBA/NBL (tid+7000/+8000)
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    // Intra-squad scrimmages — same team on both sides
    if (g.homeTeamId === g.awayTeamId) return false;
    return true;
  });

  if (boxes.length < TARGET_GAMES) {
    return { title: 'SAMPLE12', body: `Only ${boxes.length} regular box scores available — need ≥${TARGET_GAMES}. Sim more games first.`, ok: false };
  }

  // Tag each game by total score + flags
  const tagged = boxes.map((g: any) => {
    const total = (g.homeScore ?? 0) + (g.awayScore ?? 0);
    const margin = Math.abs((g.homeScore ?? 0) - (g.awayScore ?? 0));
    return {
      game: g,
      total,
      margin,
      isOT: !!g.isOT,
      bucket:
        total < 205 ? 'LOW'  :
        total < 235 ? 'MID'  :
                      'HIGH',
    };
  });

  // Pick by stratum, newest first within each stratum
  const sortRecent = (a: any, b: any) => String(b.game.date).localeCompare(String(a.game.date));
  const lows  = tagged.filter(t => t.bucket === 'LOW').sort(sortRecent);
  const mids  = tagged.filter(t => t.bucket === 'MID').sort(sortRecent);
  const highs = tagged.filter(t => t.bucket === 'HIGH').sort(sortRecent);
  const blow  = tagged.filter(t => t.margin >= 25).sort(sortRecent);
  const ots   = tagged.filter(t => t.isOT).sort(sortRecent);

  const picked = new Set<number>();
  const take = (pool: any[], n: number) => {
    const out: any[] = [];
    for (const t of pool) {
      if (out.length >= n) break;
      if (picked.has(t.game.gameId)) continue;
      picked.add(t.game.gameId);
      out.push(t);
    }
    return out;
  };

  const sample = [
    ...take(lows,  STRATA.low),
    ...take(mids,  STRATA.mid),
    ...take(highs, STRATA.high),
    ...take(blow,  STRATA.blowout),
    ...take(ots,   STRATA.ot),
  ];

  // Backfill if any stratum was empty (e.g. no OT in season)
  if (sample.length < TARGET_GAMES) {
    const remaining = tagged.filter(t => !picked.has(t.game.gameId)).sort(sortRecent);
    for (const t of remaining) {
      if (sample.length >= TARGET_GAMES) break;
      picked.add(t.game.gameId);
      sample.push(t);
    }
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  // Per team-game row
  type Row = {
    date: string; matchup: string; team: string; bucket: string; ot: string;
    pts: number; fga: number; fgm: number; fgPct: number;
    threePm: number; threePa: number;
    ftm: number; fta: number;
    ast: number; orb: number; tov: number;
    eFG: number; AR: number; FTrate: number;
  };

  const rowsRaw: Row[] = [];
  const buildRow = (g: any, lines: any[], teamTid: number, oppTid: number, score: number, bucket: string): Row => {
    const sum = (k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
    const fga = sum('fga'), fgm = sum('fgm');
    const t3a = sum('threePa'), t3m = sum('threePm');
    const fta = sum('fta'), ftm = sum('ftm');
    const ast = sum('ast'), orb = sum('orb'), tov = sum('tov');
    return {
      date: String(g.date).slice(0, 10),
      matchup: `${abbrev(teamTid)} vs ${abbrev(oppTid)}`,
      team: abbrev(teamTid),
      bucket,
      ot: g.isOT ? `OT${g.otCount ?? 1}` : '—',
      pts: score, fga, fgm, fgPct: fga > 0 ? +(fgm / fga * 100).toFixed(1) : 0,
      threePm: t3m, threePa: t3a,
      ftm, fta,
      ast, orb, tov,
      eFG: fga > 0 ? +(((fgm + 0.5 * t3m) / fga) * 100).toFixed(1) : 0,
      AR:  fgm > 0 ? +(ast / fgm).toFixed(3) : 0,
      FTrate: fga > 0 ? +(fta / fga).toFixed(3) : 0,
    };
  };

  for (const t of sample) {
    const g = t.game;
    rowsRaw.push(buildRow(g, g.homeStats, g.homeTeamId, g.awayTeamId, g.homeScore, t.bucket));
    rowsRaw.push(buildRow(g, g.awayStats, g.awayTeamId, g.homeTeamId, g.awayScore, t.bucket));
  }

  // ── Correlations + sanity stats ────────────────────────────────────────────
  const pearson = (xs: number[], ys: number[]) => {
    const n = xs.length;
    if (n < 2) return 0;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return dx > 0 && dy > 0 ? +(num / Math.sqrt(dx * dy)).toFixed(3) : 0;
  };
  const mean   = (xs: number[]) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 0;
  const stdev  = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
    return +Math.sqrt(v).toFixed(2);
  };
  const minMax = (xs: number[]) => xs.length ? `${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)}` : '—';

  const ptsArr = rowsRaw.map(r => r.pts);
  const fgaArr = rowsRaw.map(r => r.fga);
  const efgArr = rowsRaw.map(r => r.eFG);
  const fgpArr = rowsRaw.map(r => r.fgPct);
  const arArr  = rowsRaw.map(r => r.AR);
  const astArr = rowsRaw.map(r => r.ast);
  const ftrArr = rowsRaw.map(r => r.FTrate);

  const corrPtsEFG = pearson(ptsArr, efgArr);
  const corrPtsFGA = pearson(ptsArr, fgaArr);
  const corrARFGP  = pearson(arArr, fgpArr);
  const corrEFGFGA = pearson(efgArr, fgaArr);

  const summary = {
    'Pearson(pts, eFG%)':    `${corrPtsEFG}  (NBA expect ≥0.70 → high score should track high efficiency)`,
    'Pearson(pts, FGA)':     `${corrPtsFGA}  (NBA expect ~0.30 — pts driven by efficiency, not volume)`,
    'Pearson(AR, FG%)':      `${corrARFGP}  (NBA expect mildly +; brick-fests should have lower AR)`,
    'Pearson(eFG%, FGA)':    `${corrEFGFGA}  (NBA expect ~0 or slightly negative)`,
    'pts mean / σ / range':  `${mean(ptsArr)} / ${stdev(ptsArr)} / ${minMax(ptsArr)}  (NBA: ~114 / ~12 / 90–135)`,
    'FGA mean / σ / range':  `${mean(fgaArr)} / ${stdev(fgaArr)} / ${minMax(fgaArr)}  (NBA: ~89 / ~5 / 78–100)`,
    'eFG% mean / σ':         `${mean(efgArr)} / ${stdev(efgArr)}  (NBA: ~53.5 / ~4)`,
    'AR mean / range':       `${mean(arArr)} / ${minMax(arArr.map(x => x * 100))}  (NBA: ~0.58 / 50–65)`,
    'AST mean / σ':          `${mean(astArr)} / ${stdev(astArr)}  (NBA: ~26 / ~4)`,
    'FTrate mean / σ':       `${mean(ftrArr)} / ${stdev(ftrArr)}  (NBA: ~0.24 / ~0.05)`,
  };

  // Pathology flags
  const flags: string[] = [];
  if (corrPtsEFG < 0.55) flags.push(`🔴 pts↔eFG% corr ${corrPtsEFG} < 0.55 → score-roll & profile-roll decoupled (the "131 on 39%" / "99 on 56%" bug)`);
  if (corrPtsFGA > 0.60) flags.push(`🟡 pts↔FGA corr ${corrPtsFGA} > 0.60 → pts driven by volume not efficiency (real NBA: ~0.30)`);
  if (corrARFGP < 0.05)  flags.push(`🟡 AR↔FG% corr ${corrARFGP} ≈ 0 → assists not coupled to makes (brick-fest still gets full assists)`);
  const fgaSpread = Math.max(...fgaArr) - Math.min(...fgaArr);
  if (fgaSpread > 30)    flags.push(`🟡 FGA spread ${fgaSpread} > 30 → volume too volatile (real NBA: ~22)`);
  const arMean = arArr.reduce((a, b) => a + b, 0) / arArr.length;
  if (arMean > 0.64)     flags.push(`🟡 AR mean ${arMean.toFixed(3)} > 0.64 → league-wide assist inflation (real NBA: ~0.58)`);

  // Single flat TSV block — no nested arrays/objects in console.
  // Ctrl+A inside the console window then Ctrl+C copies everything as plain text.
  const cols: (keyof Row)[] = ['date', 'matchup', 'team', 'bucket', 'ot', 'pts', 'fga', 'fgm', 'fgPct', 'eFG', 'threePm', 'threePa', 'ftm', 'fta', 'FTrate', 'ast', 'AR', 'orb', 'tov'];
  const lines: string[] = [];
  lines.push(`SAMPLE12 — sim realism audit`);
  lines.push(`Sampled ${sample.length} games / ${rowsRaw.length} team-rows from ${boxes.length} available box scores.`);
  lines.push(`Strata: ${STRATA.low} low / ${STRATA.mid} mid / ${STRATA.high} high / ${STRATA.blowout} blowout / ${STRATA.ot} OT (backfill if empty).`);
  lines.push('');
  lines.push('=== ROWS ===');
  lines.push(cols.join('\t'));
  rowsRaw.forEach(r => lines.push(cols.map(c => r[c]).join('\t')));
  lines.push('');
  lines.push('=== SUMMARY ===');
  lines.push('METRIC\tVALUE\tNBA_EXPECT');
  lines.push(`Pearson(pts,eFG%)\t${corrPtsEFG}\t>=0.70`);
  lines.push(`Pearson(pts,FGA)\t${corrPtsFGA}\t~0.30`);
  lines.push(`Pearson(AR,FG%)\t${corrARFGP}\tmildly +`);
  lines.push(`Pearson(eFG%,FGA)\t${corrEFGFGA}\t~0`);
  lines.push(`pts mean / sigma / range\t${mean(ptsArr)} / ${stdev(ptsArr)} / ${minMax(ptsArr)}\t~114 / ~12 / 90-135`);
  lines.push(`FGA mean / sigma / range\t${mean(fgaArr)} / ${stdev(fgaArr)} / ${minMax(fgaArr)}\t~89 / ~5 / 78-100`);
  lines.push(`eFG% mean / sigma\t${mean(efgArr)} / ${stdev(efgArr)}\t~53.5 / ~4`);
  lines.push(`AR mean\t${mean(arArr)}\t~0.58`);
  lines.push(`AST mean / sigma\t${mean(astArr)} / ${stdev(astArr)}\t~26 / ~4`);
  lines.push(`FTrate mean / sigma\t${mean(ftrArr)} / ${stdev(ftrArr)}\t~0.30 (2025-26 NBA) / ~0.05`);
  lines.push('');
  lines.push('=== FLAGS ===');
  if (flags.length === 0) {
    lines.push('No pathology flags raised — sim looks calibrated.');
  } else {
    flags.forEach(f => lines.push(f));
  }

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);

  const headline = flags.length === 0
    ? `Sample healthy. ${rowsRaw.length} rows + summary in console (also clipboard).`
    : `${flags.length} pathology flag${flags.length === 1 ? '' : 's'}. ${rowsRaw.length} rows in console (also clipboard).`;
  return { title: 'SAMPLE12', body: headline, ok: flags.length === 0 };
}

// SCOREPROF ───────────────────────────────────────────────────────────────────
// Score↔eFG% binned audit on the FULL NBA box score corpus (not just 24 games).
// Goal: pinpoint architectural decoupling — does score increase as efficiency
// increases the way NBA games do? In real NBA, the higher pts buckets should
// have monotonically higher eFG%. If 95-105 bucket has eFG% ~50 and 125+ bucket
// has eFG% ~52 (~2pp gap), that's NBA-realistic. If 115-125 bucket has eFG% LOWER
// than 95-105 bucket, the score↔profile decoupling bug is structural, not noise.
async function runScoreProf(state: GameState): Promise<CheatResult> {
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats) &&
           g.homeStats.length > 0 && g.awayStats.length > 0;
  });

  if (boxes.length < 30) {
    return { title: 'SCOREPROF', body: `Only ${boxes.length} NBA boxes — need ≥30. Sim more.`, ok: false };
  }

  type R = { pts: number; fga: number; fgm: number; t3m: number; ast: number; fta: number };
  const buildRow = (lines: any[], score: number): R => {
    const sum = (k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
    return { pts: score, fga: sum('fga'), fgm: sum('fgm'), t3m: sum('threePm'), ast: sum('ast'), fta: sum('fta') };
  };
  const rows: R[] = [];
  for (const g of boxes) {
    rows.push(buildRow((g as any).homeStats, (g as any).homeScore));
    rows.push(buildRow((g as any).awayStats, (g as any).awayScore));
  }

  const efg = (r: R) => r.fga > 0 ? ((r.fgm + 0.5 * r.t3m) / r.fga) * 100 : 0;
  const fgPct = (r: R) => r.fga > 0 ? (r.fgm / r.fga) * 100 : 0;
  const ar = (r: R) => r.fgm > 0 ? r.ast / r.fgm : 0;
  const ftRate = (r: R) => r.fga > 0 ? r.fta / r.fga : 0;

  const bins = [
    { name: '<95',     lo: 0,   hi: 95,  rows: [] as R[] },
    { name: '95-105',  lo: 95,  hi: 105, rows: [] as R[] },
    { name: '105-115', lo: 105, hi: 115, rows: [] as R[] },
    { name: '115-125', lo: 115, hi: 125, rows: [] as R[] },
    { name: '125+',    lo: 125, hi: 999, rows: [] as R[] },
  ];
  rows.forEach(r => {
    const b = bins.find(b => r.pts >= b.lo && r.pts < b.hi);
    if (b) b.rows.push(r);
  });

  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const stdev = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  };

  // Pearson on full corpus
  const ptsArr = rows.map(r => r.pts);
  const efgArr = rows.map(r => efg(r));
  const fgaArr = rows.map(r => r.fga);
  const arArr = rows.map(r => ar(r));
  const fgPctArr = rows.map(r => fgPct(r));
  const pearson = (xs: number[], ys: number[]) => {
    const n = xs.length;
    if (n < 2) return 0;
    const mx = mean(xs), my = mean(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };

  const corrPtsEfg = pearson(ptsArr, efgArr);
  const corrPtsFga = pearson(ptsArr, fgaArr);
  const corrArFgp = pearson(arArr, fgPctArr);

  // Worst inversions: high pts + low eFG% (or vice versa)
  const inversions = rows
    .map((r, i) => ({ r, i, score: r.pts - efg(r) * 1.8 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const lines: string[] = [];
  lines.push(`SCOREPROF — score↔efficiency architectural audit`);
  lines.push(`Corpus: ${rows.length} team-games from ${boxes.length} NBA box scores.`);
  lines.push('');
  lines.push('=== BINS ===');
  lines.push('bucket\tcount\tpts_avg\tFGA_avg\teFG%_avg\teFG%_sigma\tFG%_avg\tAR_avg\tFTrate_avg');
  bins.forEach(b => {
    if (b.rows.length === 0) {
      lines.push(`${b.name}\t0\t-\t-\t-\t-\t-\t-\t-`);
      return;
    }
    const efgs = b.rows.map(efg);
    lines.push([
      b.name,
      b.rows.length,
      mean(b.rows.map(r => r.pts)).toFixed(1),
      mean(b.rows.map(r => r.fga)).toFixed(1),
      mean(efgs).toFixed(2),
      stdev(efgs).toFixed(2),
      mean(b.rows.map(fgPct)).toFixed(2),
      mean(b.rows.map(ar)).toFixed(3),
      mean(b.rows.map(ftRate)).toFixed(3),
    ].join('\t'));
  });
  lines.push('');
  lines.push('=== CORRELATIONS (full corpus) ===');
  lines.push(`Pearson(pts,eFG%)\t${corrPtsEfg.toFixed(3)}\tNBA expect ~0.65-0.75 (efficiency drives score)`);
  lines.push(`Pearson(pts,FGA)\t${corrPtsFga.toFixed(3)}\tNBA expect ~0.20-0.30 (volume secondary)`);
  lines.push(`Pearson(AR,FG%)\t${corrArFgp.toFixed(3)}\tNBA expect ~0.10-0.30 (mild positive)`);
  lines.push('');
  lines.push('=== WORST 8 INVERSIONS (high pts on low eFG%) ===');
  lines.push('pts\tFGA\tFGM\teFG%\tFG%\tAR\tFTrate');
  inversions.forEach(({ r }) => {
    lines.push([r.pts, r.fga, r.fgm, efg(r).toFixed(1), fgPct(r).toFixed(1), ar(r).toFixed(2), ftRate(r).toFixed(2)].join('\t'));
  });
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  // Monotonicity check — eFG% should rise with score
  const meanEfgs = bins.filter(b => b.rows.length > 0).map(b => ({ name: b.name, m: mean(b.rows.map(efg)), n: b.rows.length }));
  let monotonic = true;
  for (let i = 1; i < meanEfgs.length; i++) {
    if (meanEfgs[i].m < meanEfgs[i - 1].m - 0.5) {
      monotonic = false;
      lines.push(`🔴 NON-MONOTONIC: ${meanEfgs[i - 1].name} eFG% ${meanEfgs[i - 1].m.toFixed(2)} > ${meanEfgs[i].name} eFG% ${meanEfgs[i].m.toFixed(2)} → score-profile decoupled`);
    }
  }
  if (monotonic) lines.push(`✅ MONOTONIC: eFG% rises with score across all populated bins.`);
  if (corrPtsEfg < 0.50) lines.push(`🔴 pts↔eFG% corr ${corrPtsEfg.toFixed(3)} < 0.50 → strong decoupling (large-N evidence)`);
  else if (corrPtsEfg < 0.60) lines.push(`🟡 pts↔eFG% corr ${corrPtsEfg.toFixed(3)} < 0.60 → mild decoupling`);
  else lines.push(`✅ pts↔eFG% corr ${corrPtsEfg.toFixed(3)} → NBA-aligned`);

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'SCOREPROF', body: `Audited ${rows.length} team-games. Console + clipboard.`, ok: corrPtsEfg >= 0.55 };
}

// PLAYERDIST ──────────────────────────────────────────────────────────────────
// Per-player FGA/min and pts/min distribution on last 100 NBA games. Reveals
// the FGA-volatility architecture bug: hot teams collapse to 62 FGA because
// twoPa = twoPm/pct2 reverse-engineers attempts from makes. Per-minute volume
// rates should be ~0.40 FGA/min and ~0.55 pts/min across all min buckets.
// If high-min starters show FGA/min < 0.30, hot-team-collapse is structural.
async function runPlayerDist(state: GameState): Promise<CheatResult> {
  const NUM_GAMES = 100;
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });
  if (boxes.length < 20) {
    return { title: 'PLAYERDIST', body: `Only ${boxes.length} NBA boxes — need ≥20.`, ok: false };
  }
  const recent = [...boxes].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, NUM_GAMES);

  // Pull all player-game lines
  type PR = { name: string; min: number; pts: number; fga: number; fgm: number; t3m: number; t3a: number; fta: number; ftm: number; ast: number; eFG: number; fgaPerMin: number; ptsPerMin: number };
  const playerRows: PR[] = [];
  for (const g of recent) {
    const lines = [...((g as any).homeStats ?? []), ...((g as any).awayStats ?? [])];
    for (const p of lines) {
      const min = Number(p.min ?? 0);
      if (min < 0.5) continue; // skip DNPs / 0-min lines
      playerRows.push({
        name: String(p.name ?? '?'),
        min,
        pts: p.pts ?? 0,
        fga: p.fga ?? 0,
        fgm: p.fgm ?? 0,
        t3m: p.threePm ?? 0,
        t3a: p.threePa ?? 0,
        fta: p.fta ?? 0,
        ftm: p.ftm ?? 0,
        ast: p.ast ?? 0,
        eFG: p.fga > 0 ? ((p.fgm + 0.5 * p.threePm) / p.fga) * 100 : 0,
        fgaPerMin: min > 0 ? p.fga / min : 0,
        ptsPerMin: min > 0 ? p.pts / min : 0,
      });
    }
  }

  const minBuckets = [
    { name: '<5',     lo: 0,  hi: 5,  rows: [] as PR[] },
    { name: '5-15',   lo: 5,  hi: 15, rows: [] as PR[] },
    { name: '15-25',  lo: 15, hi: 25, rows: [] as PR[] },
    { name: '25-35',  lo: 25, hi: 35, rows: [] as PR[] },
    { name: '35+',    lo: 35, hi: 99, rows: [] as PR[] },
  ];
  playerRows.forEach(r => {
    const b = minBuckets.find(b => r.min >= b.lo && r.min < b.hi);
    if (b) b.rows.push(r);
  });

  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const stdev = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  };

  const lines: string[] = [];
  lines.push(`PLAYERDIST — per-player game distribution audit`);
  lines.push(`Sample: ${playerRows.length} player-game-rows from ${recent.length} most recent NBA games.`);
  lines.push('');
  lines.push('=== MIN BUCKETS ===');
  lines.push('bucket\tcount\tFGA/min_avg\tFGA/min_sigma\tpts/min_avg\tpts/min_sigma\teFG%_avg\teFG%_sigma\tFGA_avg\tpts_avg');
  minBuckets.forEach(b => {
    if (b.rows.length === 0) { lines.push(`${b.name}\t0\t-\t-\t-\t-\t-\t-\t-\t-`); return; }
    const fgaPm = b.rows.map(r => r.fgaPerMin);
    const ptsPm = b.rows.map(r => r.ptsPerMin);
    const efgs = b.rows.filter(r => r.fga > 0).map(r => r.eFG);
    lines.push([
      b.name, b.rows.length,
      mean(fgaPm).toFixed(3), stdev(fgaPm).toFixed(3),
      mean(ptsPm).toFixed(3), stdev(ptsPm).toFixed(3),
      efgs.length > 0 ? mean(efgs).toFixed(2) : '-',
      efgs.length > 0 ? stdev(efgs).toFixed(2) : '-',
      mean(b.rows.map(r => r.fga)).toFixed(1),
      mean(b.rows.map(r => r.pts)).toFixed(1),
    ].join('\t'));
  });
  lines.push('');
  lines.push('NBA expect: FGA/min ~0.40 across all buckets. pts/min ~0.55. eFG% ~53.5 ±5.');
  lines.push('');

  // Outliers: starters (25+ min) with weird FGA/min
  const starters = playerRows.filter(r => r.min >= 25);
  const hotChuck = starters.filter(r => r.fgaPerMin > 0.65).sort((a, b) => b.fgaPerMin - a.fgaPerMin).slice(0, 5);
  const coldDef = starters.filter(r => r.fgaPerMin < 0.25 && r.min >= 25).sort((a, b) => a.fgaPerMin - b.fgaPerMin).slice(0, 5);
  const explosionGames = playerRows.filter(r => r.pts >= 40).sort((a, b) => b.pts - a.pts).slice(0, 8);
  const brickGames = playerRows.filter(r => r.fga >= 15 && r.eFG < 35 && r.min >= 20).sort((a, b) => a.eFG - b.eFG).slice(0, 5);

  lines.push('=== HOT CHUCKERS (25+ min, FGA/min > 0.65) — NBA cap ~0.55 ===');
  lines.push('name\tmin\tFGA\tFGM\teFG%\tpts\tFGA/min');
  hotChuck.forEach(r => lines.push([r.name, r.min.toFixed(1), r.fga, r.fgm, r.eFG.toFixed(1), r.pts, r.fgaPerMin.toFixed(2)].join('\t')));
  lines.push('');
  lines.push('=== DEFER OUTLIERS (25+ min, FGA/min < 0.25) — NBA floor ~0.20 ===');
  lines.push('name\tmin\tFGA\tFGM\teFG%\tpts\tFGA/min');
  coldDef.forEach(r => lines.push([r.name, r.min.toFixed(1), r.fga, r.fgm, r.eFG.toFixed(1), r.pts, r.fgaPerMin.toFixed(2)].join('\t')));
  lines.push('');
  lines.push('=== TOP EXPLOSION GAMES (≥40 pts) ===');
  lines.push('name\tmin\tpts\tFGA\tFGM\teFG%');
  explosionGames.forEach(r => lines.push([r.name, r.min.toFixed(1), r.pts, r.fga, r.fgm, r.eFG.toFixed(1)].join('\t')));
  lines.push('');
  lines.push('=== BRICK GAMES (15+ FGA, eFG<35%) ===');
  lines.push('name\tmin\tFGA\tFGM\teFG%\tpts');
  brickGames.forEach(r => lines.push([r.name, r.min.toFixed(1), r.fga, r.fgm, r.eFG.toFixed(1), r.pts].join('\t')));
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  // Hot-team-collapse check: 35+ min bucket should have FGA/min in [0.35, 0.50]
  const top = minBuckets.find(b => b.name === '35+');
  if (top && top.rows.length > 5) {
    const fgaPm = mean(top.rows.map(r => r.fgaPerMin));
    if (fgaPm < 0.30) lines.push(`🔴 35+ min FGA/min ${fgaPm.toFixed(3)} < 0.30 → starter volume collapsing (hot-team architectural bug)`);
    else if (fgaPm > 0.50) lines.push(`🟡 35+ min FGA/min ${fgaPm.toFixed(3)} > 0.50 → starters chuck too much`);
    else lines.push(`✅ 35+ min FGA/min ${fgaPm.toFixed(3)} in NBA range [0.35-0.50]`);
  }
  if (hotChuck.length > 5) lines.push(`🟡 ${hotChuck.length} starter-games with FGA/min > 0.65 — chucker pathology`);
  if (coldDef.length > 5) lines.push(`🟡 ${coldDef.length} starter-games with FGA/min < 0.25 — DEFER pathology`);

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'PLAYERDIST', body: `${playerRows.length} player-rows audited. Console + clipboard.`, ok: true };
}

// TEAMCHECK ───────────────────────────────────────────────────────────────────
// Per-team season averages compared to NBA 2025-26 reference ranges. Iterates
// all NBA-only box scores per team, computes per-game averages, sorts by PPG,
// flags outliers. NBA real 2025-26 ranges (median teams):
//   PPG 113-120, OPP 111-117, FG% .455-.490, 3P% .345-.380, FT% .770-.825
//   eFG% .520-.560, FGA 86-92, AST 24-28, REB 42-46, TOV 12-15, PF 19-22
async function runTeamCheck(state: GameState): Promise<CheatResult> {
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });
  if (boxes.length < 30) {
    return { title: 'TEAMCHECK', body: `Only ${boxes.length} NBA boxes — need ≥30.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  type TR = {
    tid: number; abbrev: string; gp: number; w: number; l: number;
    pts: number; opp: number; fga: number; fgm: number; t3m: number; t3a: number;
    fta: number; ftm: number; ast: number; reb: number; orb: number;
    stl: number; blk: number; tov: number; pf: number;
  };
  const teamMap = new Map<number, TR>();
  const ensure = (tid: number): TR => {
    if (!teamMap.has(tid)) {
      teamMap.set(tid, { tid, abbrev: abbrev(tid), gp: 0, w: 0, l: 0, pts: 0, opp: 0, fga: 0, fgm: 0, t3m: 0, t3a: 0, fta: 0, ftm: 0, ast: 0, reb: 0, orb: 0, stl: 0, blk: 0, tov: 0, pf: 0 });
    }
    return teamMap.get(tid)!;
  };

  const sumLines = (lines: any[], k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
  for (const g of boxes) {
    const home = ensure((g as any).homeTeamId);
    const away = ensure((g as any).awayTeamId);
    home.gp++; away.gp++;
    const homeWins = (g as any).homeScore > (g as any).awayScore;
    if (homeWins) { home.w++; away.l++; } else { home.l++; away.w++; }
    home.pts += (g as any).homeScore; home.opp += (g as any).awayScore;
    away.pts += (g as any).awayScore; away.opp += (g as any).homeScore;
    const hs = (g as any).homeStats, as = (g as any).awayStats;
    home.fga += sumLines(hs, 'fga'); home.fgm += sumLines(hs, 'fgm');
    home.t3m += sumLines(hs, 'threePm'); home.t3a += sumLines(hs, 'threePa');
    home.ftm += sumLines(hs, 'ftm'); home.fta += sumLines(hs, 'fta');
    home.ast += sumLines(hs, 'ast'); home.reb += sumLines(hs, 'reb'); home.orb += sumLines(hs, 'orb');
    home.stl += sumLines(hs, 'stl'); home.blk += sumLines(hs, 'blk');
    home.tov += sumLines(hs, 'tov'); home.pf += sumLines(hs, 'pf');
    away.fga += sumLines(as, 'fga'); away.fgm += sumLines(as, 'fgm');
    away.t3m += sumLines(as, 'threePm'); away.t3a += sumLines(as, 'threePa');
    away.ftm += sumLines(as, 'ftm'); away.fta += sumLines(as, 'fta');
    away.ast += sumLines(as, 'ast'); away.reb += sumLines(as, 'reb'); away.orb += sumLines(as, 'orb');
    away.stl += sumLines(as, 'stl'); away.blk += sumLines(as, 'blk');
    away.tov += sumLines(as, 'tov'); away.pf += sumLines(as, 'pf');
  }

  const rows = Array.from(teamMap.values()).filter(t => t.gp > 0).sort((a, b) => (b.pts / b.gp) - (a.pts / a.gp));
  const fmtPct = (n: number, d: number) => d > 0 ? (n / d * 100).toFixed(1) : '-';
  const fmtPg = (n: number, d: number) => d > 0 ? (n / d).toFixed(1) : '-';

  // NBA 2025-26 reference ranges (exact values from Gemini benchmark dump 2026-03-13).
  // PPG 105.9-122.1 (DEN top, BKN bottom). FG% .448-.491. 3P% .330-.392. FT% .740-.820
  // (GSW top, MIL bottom). eFG% .510-.588. ORtg 108.84-122.63. DRtg 107.89-122.84.
  // PACE 94-101.5. REB 39.8-47.2. League means: PPG 115.6, FGA 89.1, FG% 47.1, 3P% 36.0,
  // FT% 78.3, eFG% 54.6, AST 26.7, REB 43.8, TOV 14.5, PF 19.9.
  const NBA_RANGES = {
    PPG:  [105.9, 122.1], FG_PCT: [44.8, 49.1], TP_PCT: [33.0, 39.2], FT_PCT: [74.0, 82.0],
    eFG:  [51.0, 58.8], FGA: [85, 92], AST: [22, 30], REB: [39.8, 47.2], TOV: [11, 16], PF: [17, 22],
  };
  const flagOut = (val: number, range: [number, number]) => val < range[0] || val > range[1];

  const lines: string[] = [];
  lines.push(`TEAMCHECK — per-team season averages vs NBA 2025-26 reference`);
  lines.push(`Scope: ${rows.length} teams, ${boxes.length} NBA box scores. Sorted by PPG.`);
  lines.push('');
  lines.push('=== TEAMS ===');
  lines.push('rank\tteam\tGP\tW-L\tPPG\tOPP\tMOV\tFG%\t3P%\tFT%\teFG%\tFGA\t3PA\tFTA\tAST\tREB\tORB\tSTL\tBLK\tTOV\tPF');
  rows.forEach((t, i) => {
    const ppg = t.pts / t.gp, opp = t.opp / t.gp;
    const efg = t.fga > 0 ? (t.fgm + 0.5 * t.t3m) / t.fga * 100 : 0;
    lines.push([
      i + 1, t.abbrev, t.gp, `${t.w}-${t.l}`,
      ppg.toFixed(1), opp.toFixed(1), (ppg - opp).toFixed(1),
      fmtPct(t.fgm, t.fga), fmtPct(t.t3m, t.t3a), fmtPct(t.ftm, t.fta),
      efg.toFixed(1),
      fmtPg(t.fga, t.gp), fmtPg(t.t3a, t.gp), fmtPg(t.fta, t.gp),
      fmtPg(t.ast, t.gp), fmtPg(t.reb, t.gp), fmtPg(t.orb, t.gp),
      fmtPg(t.stl, t.gp), fmtPg(t.blk, t.gp), fmtPg(t.tov, t.gp), fmtPg(t.pf, t.gp),
    ].join('\t'));
  });
  lines.push('');

  // League means
  const totalGp = rows.reduce((s, t) => s + t.gp, 0) || 1;
  const lgPts = rows.reduce((s, t) => s + t.pts, 0) / totalGp;
  const lgFga = rows.reduce((s, t) => s + t.fga, 0) / totalGp;
  const lgFgm = rows.reduce((s, t) => s + t.fgm, 0);
  const lgFgaTotal = rows.reduce((s, t) => s + t.fga, 0);
  const lgT3m = rows.reduce((s, t) => s + t.t3m, 0);
  const lgT3a = rows.reduce((s, t) => s + t.t3a, 0);
  const lgFtm = rows.reduce((s, t) => s + t.ftm, 0);
  const lgFta = rows.reduce((s, t) => s + t.fta, 0);
  const lgAst = rows.reduce((s, t) => s + t.ast, 0) / totalGp;
  const lgReb = rows.reduce((s, t) => s + t.reb, 0) / totalGp;
  const lgPf = rows.reduce((s, t) => s + t.pf, 0) / totalGp;
  const lgTov = rows.reduce((s, t) => s + t.tov, 0) / totalGp;
  const lgEfg = lgFgaTotal > 0 ? (lgFgm + 0.5 * lgT3m) / lgFgaTotal * 100 : 0;

  lines.push('=== LEAGUE AVERAGES vs NBA REAL ===');
  lines.push('METRIC\tSIM\tNBA_RANGE\tSTATUS');
  const checkLg = (name: string, v: number, range: [number, number]) => {
    const ok = v >= range[0] && v <= range[1];
    lines.push(`${name}\t${v.toFixed(1)}\t${range[0]}–${range[1]}\t${ok ? '✓' : (v < range[0] ? '🔴 LOW' : '🔴 HIGH')}`);
  };
  // League-mean targets ±2 around exact 2025-26 NBA mean (Gemini benchmark)
  checkLg('PPG',    lgPts, [113, 118]);   // NBA 115.6
  checkLg('FGA',    lgFga, [87, 92]);     // NBA 89.1
  checkLg('FG%',    lgFgaTotal > 0 ? lgFgm / lgFgaTotal * 100 : 0, [45.5, 48.5]);  // NBA 47.1
  checkLg('3P%',    lgT3a > 0 ? lgT3m / lgT3a * 100 : 0, [34.5, 37.5]);            // NBA 36.0
  checkLg('FT%',    lgFta > 0 ? lgFtm / lgFta * 100 : 0, [76.5, 80.0]);            // NBA 78.3
  checkLg('eFG%',   lgEfg, [53.0, 56.0]); // NBA 54.6
  checkLg('AST',    lgAst, [25, 28]);     // NBA 26.7
  checkLg('REB',    lgReb, [42, 46]);     // NBA 43.8
  checkLg('TOV',    lgTov, [13.5, 15.5]); // NBA 14.5
  checkLg('PF',     lgPf,  [18.5, 21.5]); // NBA 19.9
  lines.push('');

  // Outliers
  lines.push('=== TEAM OUTLIERS (outside NBA range) ===');
  const outliers: string[] = [];
  rows.forEach(t => {
    const ppg = t.pts / t.gp, opp = t.opp / t.gp;
    const fgPct = t.fga > 0 ? t.fgm / t.fga * 100 : 0;
    const t3Pct = t.t3a > 0 ? t.t3m / t.t3a * 100 : 0;
    const efg = t.fga > 0 ? (t.fgm + 0.5 * t.t3m) / t.fga * 100 : 0;
    if (flagOut(ppg, NBA_RANGES.PPG as [number, number])) outliers.push(`${t.abbrev}: PPG ${ppg.toFixed(1)} (NBA ${NBA_RANGES.PPG.join('-')})`);
    if (flagOut(fgPct, NBA_RANGES.FG_PCT as [number, number])) outliers.push(`${t.abbrev}: FG% ${fgPct.toFixed(1)} (NBA ${NBA_RANGES.FG_PCT.join('-')})`);
    if (flagOut(t3Pct, NBA_RANGES.TP_PCT as [number, number])) outliers.push(`${t.abbrev}: 3P% ${t3Pct.toFixed(1)} (NBA ${NBA_RANGES.TP_PCT.join('-')})`);
    if (flagOut(efg, NBA_RANGES.eFG as [number, number])) outliers.push(`${t.abbrev}: eFG% ${efg.toFixed(1)} (NBA ${NBA_RANGES.eFG.join('-')})`);
  });
  if (outliers.length === 0) lines.push('✅ No team outside NBA reference ranges.');
  else outliers.slice(0, 30).forEach(o => lines.push('  • ' + o));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'TEAMCHECK', body: `${rows.length} teams audited. ${outliers.length} outlier flag(s). Console + clipboard.`, ok: outliers.length < 10 };
}

// LEADERS ─────────────────────────────────────────────────────────────────────
// Top 10 league leaders in 8 categories vs NBA 2025-26 reference values.
// Filters NBA active players only (tid 0-99) with minimum games played.
async function runLeaders(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 10;

  type PR = {
    name: string; tid: number; gp: number; min: number;
    pts: number; reb: number; ast: number; stl: number; blk: number;
    fga: number; fgm: number; t3m: number; t3a: number; ft: number; fta: number; tov: number;
  };
  const players: PR[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const seasonStats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (seasonStats.length === 0) continue;
    const s = seasonStats[seasonStats.length - 1];
    if ((s.gp ?? 0) < MIN_GP) continue;
    players.push({
      name: p.name,
      tid: p.tid,
      gp: s.gp,
      min: s.min ?? 0,
      pts: s.pts ?? 0,
      reb: s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0)),
      ast: s.ast ?? 0,
      stl: s.stl ?? 0,
      blk: s.blk ?? 0,
      fga: s.fga ?? 0,
      fgm: s.fg ?? 0,
      t3m: s.tp ?? 0,
      t3a: s.tpa ?? 0,
      ft: s.ft ?? 0,
      fta: s.fta ?? 0,
      tov: s.tov ?? 0,
    });
  }

  if (players.length < 30) {
    return { title: 'LEADERS', body: `Only ${players.length} NBA players with ≥${MIN_GP} GP. Sim more.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  // NBA 2025-26 reference (exact top-1 / top-10 from Gemini benchmark, 2026-03-13)
  const NBA_REF = {
    PPG:    { top1: 33.5, top10: 26.0, real_leader: 'Doncic 33.5, SGA 31.1, Edwards 28.8' },
    RPG:    { top1: 12.9, top10: 9.0,  real_leader: 'Jokic 12.9, KAT 11.9, Clingan 11.6, Wemby 11.5' },
    APG:    { top1: 10.7, top10: 7.1,  real_leader: 'Jokic 10.7, Cunningham 9.9, Doncic 8.3' },
    SPG:    { top1: 2.1,  top10: 1.7,  real_leader: 'Wallace 2.1, Daniels 2.0, Ausar 2.0' },
    BPG:    { top1: 4.0,  top10: 1.7,  real_leader: 'Wemby 4.0, Holmgren 2.8, Clingan 2.7' },
    FGA:    { top1: 22.8, top10: 19.9, real_leader: 'Doncic 22.8, SGA 22.4, Brown 21.7' },
    TPM:    { top1: 4.6,  top10: 3.1,  real_leader: 'Curry 4.6, Doncic 4.1, Mitchell 3.8' },
    FT_PCT: { top1: 92.1, top10: 84.2, real_leader: 'Curry .921, Irving .908, Durant .902' },
  };

  const lines: string[] = [];
  lines.push(`LEADERS — top 10 league leaders vs NBA 2025-26 reference (≥${MIN_GP} GP)`);
  lines.push(`Scope: ${players.length} qualifying NBA players, season ${currentYear}.`);
  lines.push('');

  const showTop = (label: string, scoreFn: (p: PR) => number, fmt: (n: number) => string, ref: { top1: number; top10: number; real_leader: string }) => {
    const sorted = [...players].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, 10);
    if (sorted.length === 0) return;
    lines.push(`=== ${label} (NBA top-1: ${ref.top1}, top-10: ${ref.top10} | ${ref.real_leader}) ===`);
    lines.push('rank\tname\tteam\tGP\tvalue');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${fmt(scoreFn(p))}`));
    const top1 = scoreFn(sorted[0]);
    const top10 = scoreFn(sorted[sorted.length - 1]);
    const flag1 = top1 > ref.top1 * 1.15 ? '🔴 over NBA top' : top1 < ref.top1 * 0.85 ? '🔴 under NBA top' : '✓';
    const flag10 = top10 > ref.top10 * 1.15 ? '🟡 top-10 high' : top10 < ref.top10 * 0.85 ? '🟡 top-10 low' : '✓';
    lines.push(`status\ttop1=${fmt(top1)} ${flag1}\ttop10=${fmt(top10)} ${flag10}`);
    lines.push('');
  };

  showTop('PPG',  p => p.gp > 0 ? p.pts / p.gp : 0, n => n.toFixed(1), NBA_REF.PPG);
  showTop('RPG',  p => p.gp > 0 ? p.reb / p.gp : 0, n => n.toFixed(1), NBA_REF.RPG);
  showTop('APG',  p => p.gp > 0 ? p.ast / p.gp : 0, n => n.toFixed(1), NBA_REF.APG);
  showTop('SPG',  p => p.gp > 0 ? p.stl / p.gp : 0, n => n.toFixed(2), NBA_REF.SPG);
  showTop('BPG',  p => p.gp > 0 ? p.blk / p.gp : 0, n => n.toFixed(2), NBA_REF.BPG);
  showTop('FGA/G', p => p.gp > 0 ? p.fga / p.gp : 0, n => n.toFixed(1), NBA_REF.FGA);
  showTop('3PM/G', p => p.gp > 0 ? p.t3m / p.gp : 0, n => n.toFixed(2), NBA_REF.TPM);
  // FT% — require at least 50 FTA total to qualify
  const ftCandidates = players.filter(p => p.fta >= 50);
  if (ftCandidates.length > 0) {
    const sorted = [...ftCandidates].sort((a, b) => (b.ft / b.fta) - (a.ft / a.fta)).slice(0, 10);
    lines.push(`=== FT% (≥50 FTA, NBA top-1: ${NBA_REF.FT_PCT.top1}%, top-10: ${NBA_REF.FT_PCT.top10}% | ${NBA_REF.FT_PCT.real_leader}) ===`);
    lines.push('rank\tname\tteam\tFTM-FTA\tFT%');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.ft}-${p.fta}\t${(p.ft / p.fta * 100).toFixed(1)}`));
    const top1ft = (sorted[0].ft / sorted[0].fta) * 100;
    const flag = top1ft > NBA_REF.FT_PCT.top1 * 1.05 ? '🔴 over NBA' : top1ft < NBA_REF.FT_PCT.top1 * 0.92 ? '🔴 under NBA' : '✓';
    lines.push(`status\ttop1=${top1ft.toFixed(1)}% ${flag}`);
    lines.push('');
  }

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'LEADERS', body: `Top-10 leaderboards (${players.length} eligible players). Console + clipboard.`, ok: true };
}

// DISTSHAPE ───────────────────────────────────────────────────────────────────
// Per-player season distribution audit on percentile bands (P10/P25/P50/P75/P90)
// vs NBA 2025-26 reference (Gemini benchmark dump). Reveals whether the talent
// curve in the sim matches NBA — e.g. P90 PPG should be ~26.4 (NBA elite tier),
// P10 should be ~4.5 (deep-bench scrubs). Detects "compressed" or "stretched"
// score distributions that mean-checks miss.
async function runDistShape(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;

  type PR = { name: string; gp: number; min: number; pts: number; fga: number; fgm: number; t3m: number; t3a: number; ft: number; fta: number; tov: number; ast: number; reb: number };
  const players: PR[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const stats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (stats.length === 0) continue;
    const s = stats[stats.length - 1];
    if ((s.gp ?? 0) < MIN_GP) continue;
    players.push({
      name: p.name,
      gp: s.gp,
      min: s.min ?? 0,
      pts: s.pts ?? 0, fga: s.fga ?? 0, fgm: s.fg ?? 0,
      t3m: s.tp ?? 0, t3a: s.tpa ?? 0,
      ft: s.ft ?? 0, fta: s.fta ?? 0,
      tov: s.tov ?? 0, ast: s.ast ?? 0, reb: s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0)),
    });
  }

  if (players.length < 50) {
    return { title: 'DISTSHAPE', body: `Only ${players.length} players with ≥${MIN_GP} GP — need ≥50.`, ok: false };
  }

  const percentile = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  };
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  // NBA 2025-26 reference distribution (from Gemini benchmark, qualifying ≥20 GP)
  const NBA_DIST = {
    PPG:   { mean: 12.6, P10: 4.5,  P25: 7.5,  P50: 10.8, P75: 18.2, P90: 26.4 },
    FGA:   { mean: 9.7,  P10: 3.8,  P25: 6.2,  P50: 8.5,  P75: 14.5, P90: 20.2 },
    TSpct: { mean: 58.2, P10: 51.0, P25: 54.5, P50: 57.8, P75: 61.5, P90: 66.0 },
    USGpct: { mean: 20.0, P10: 12.5, P25: 15.0, P50: 18.5, P75: 24.5, P90: 31.0 },
  };

  // Per-player metric calculations
  const ppg = players.map(p => p.gp > 0 ? p.pts / p.gp : 0);
  const fgaPg = players.map(p => p.gp > 0 ? p.fga / p.gp : 0);
  // True Shooting %: pts / (2 × (FGA + 0.44 × FTA)) × 100
  const ts = players.map(p => {
    const denom = 2 * (p.fga + 0.44 * p.fta);
    return denom > 0 ? (p.pts / denom) * 100 : 0;
  });
  // Usage estimate: ((FGA + 0.44 × FTA + TOV) × team_min) / (player_min × team_FGA + ...)
  // Simplified: we approximate USG% from per-player rate — not exact but a useful proxy
  const usg = players.map(p => {
    if (p.min <= 0) return 0;
    const minPg = p.min / p.gp;
    if (minPg <= 0) return 0;
    const possessionsPg = (p.fga + 0.44 * p.fta + p.tov) / p.gp;
    // Approximation: NBA team has ~98 possessions over 240 min → ~0.40 poss/min on court
    return (possessionsPg / (minPg * 0.40)) * 100 * 0.20; // scaled to NBA-realistic range
  });

  const lines: string[] = [];
  lines.push(`DISTSHAPE — per-player distribution vs NBA 2025-26 percentiles (≥${MIN_GP} GP)`);
  lines.push(`Sample: ${players.length} qualifying NBA players, season ${currentYear}.`);
  lines.push('');

  const showDist = (label: string, vals: number[], ref: { mean: number; P10: number; P25: number; P50: number; P75: number; P90: number }, fmt: (n: number) => string) => {
    const simMean = mean(vals);
    const p = (q: number) => percentile(vals, q);
    lines.push(`=== ${label} ===`);
    lines.push('PERCENTILE\tSIM\tNBA\tDELTA\tFLAG');
    const rows: { name: string; sim: number; nba: number }[] = [
      { name: 'mean', sim: simMean, nba: ref.mean },
      { name: 'P10',  sim: p(10),   nba: ref.P10 },
      { name: 'P25',  sim: p(25),   nba: ref.P25 },
      { name: 'P50',  sim: p(50),   nba: ref.P50 },
      { name: 'P75',  sim: p(75),   nba: ref.P75 },
      { name: 'P90',  sim: p(90),   nba: ref.P90 },
    ];
    rows.forEach(r => {
      const delta = r.sim - r.nba;
      const flag = Math.abs(delta) / r.nba > 0.15 ? '🔴' : Math.abs(delta) / r.nba > 0.08 ? '🟡' : '✅';
      lines.push(`${r.name}\t${fmt(r.sim)}\t${fmt(r.nba)}\t${delta >= 0 ? '+' : ''}${fmt(delta)}\t${flag}`);
    });
    lines.push('');
  };

  showDist('PPG',  ppg,   NBA_DIST.PPG,   n => n.toFixed(1));
  showDist('FGA/G', fgaPg, NBA_DIST.FGA,   n => n.toFixed(1));
  showDist('TS%',  ts,    NBA_DIST.TSpct, n => n.toFixed(1));
  showDist('USG%', usg,   NBA_DIST.USGpct, n => n.toFixed(1));

  // Diagnostic
  const diags: string[] = [];
  const ppgSpread = percentile(ppg, 90) - percentile(ppg, 10);
  const ppgSpreadNba = NBA_DIST.PPG.P90 - NBA_DIST.PPG.P10;
  if (Math.abs(ppgSpread - ppgSpreadNba) / ppgSpreadNba > 0.15) {
    diags.push(`🔴 PPG spread P90-P10 = ${ppgSpread.toFixed(1)} (NBA ${ppgSpreadNba.toFixed(1)}) → ${ppgSpread > ppgSpreadNba ? 'too stretched' : 'too compressed'} talent curve`);
  }
  const tsTop = percentile(ts, 90);
  if (tsTop > NBA_DIST.TSpct.P90 * 1.05) diags.push(`🟡 TS% P90 ${tsTop.toFixed(1)} > NBA ${NBA_DIST.TSpct.P90.toFixed(1)} → elite efficiency too generous`);
  if (tsTop < NBA_DIST.TSpct.P90 * 0.92) diags.push(`🟡 TS% P90 ${tsTop.toFixed(1)} < NBA ${NBA_DIST.TSpct.P90.toFixed(1)} → elite efficiency too low`);

  lines.push('=== DIAGNOSTIC ===');
  if (diags.length === 0) lines.push('✅ Distribution shape matches NBA reference within ±15%.');
  else diags.forEach(d => lines.push('  ' + d));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'DISTSHAPE', body: `${players.length} players audited. Console + clipboard.`, ok: diags.length === 0 };
}

// TIERS ───────────────────────────────────────────────────────────────────────
// PPG tier counts (≥20 GP) vs NBA 2025-26 reference. Direct check at each scoring
// tier: 30+, 28+, 26+, 24+, 22+, 20+, 18+, 15+, 12+, 10+ PPG. Reveals whether the
// talent ladder matches NBA real distribution. NBA reference (Gemini benchmark):
//   30+: ~2 (Doncic, SGA)        20+: ~37
//   28+: ~5                       18+: ~52
//   26+: ~10 (top10 floor)        15+: ~78
//   24+: ~17                      12+: ~115
//   22+: ~25                      10+: ~150
async function runTiers(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;

  type PR = { name: string; tid: number; gp: number; pts: number };
  const players: PR[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const stats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (stats.length === 0) continue;
    const s = stats[stats.length - 1];
    if ((s.gp ?? 0) < MIN_GP) continue;
    players.push({ name: p.name, tid: p.tid, gp: s.gp, pts: s.pts ?? 0 });
  }

  if (players.length < 50) {
    return { title: 'TIERS', body: `Only ${players.length} players with ≥${MIN_GP} GP — need ≥50.`, ok: false };
  }

  // Compute PPG and sort
  const withPpg = players.map(p => ({ ...p, ppg: p.gp > 0 ? p.pts / p.gp : 0 }));
  withPpg.sort((a, b) => b.ppg - a.ppg);

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  // NBA 2025-26 tier reference (Gemini benchmark)
  const tiers = [
    { thr: 30, nba: 2,   tol: 1 },
    { thr: 28, nba: 5,   tol: 2 },
    { thr: 26, nba: 10,  tol: 3 },
    { thr: 24, nba: 17,  tol: 4 },
    { thr: 22, nba: 25,  tol: 5 },
    { thr: 20, nba: 37,  tol: 6 },
    { thr: 18, nba: 52,  tol: 8 },
    { thr: 15, nba: 78,  tol: 10 },
    { thr: 12, nba: 115, tol: 15 },
    { thr: 10, nba: 150, tol: 20 },
  ];

  const lines: string[] = [];
  lines.push(`TIERS — PPG tier counts vs NBA 2025-26 (≥${MIN_GP} GP)`);
  lines.push(`Sample: ${withPpg.length} qualifying NBA players, season ${currentYear}.`);
  lines.push('');
  lines.push('=== TIER COUNTS ===');
  lines.push('THRESHOLD\tSIM_COUNT\tNBA_COUNT\tDELTA\tFLAG');
  tiers.forEach(t => {
    const count = withPpg.filter(p => p.ppg >= t.thr).length;
    const delta = count - t.nba;
    const flag = Math.abs(delta) <= t.tol ? '✅' : delta < 0 ? '🔴 UNDER' : '🟡 OVER';
    lines.push(`${t.thr}+ PPG\t${count}\t${t.nba}\t${delta >= 0 ? '+' : ''}${delta}\t${flag}`);
  });
  lines.push('');

  // Show tier-boundary players (rank around each NBA threshold count)
  lines.push('=== PLAYERS NEAR EACH TIER BOUNDARY ===');
  lines.push('TIER\tRANK\tPLAYER\tTEAM\tGP\tPPG');
  tiers.forEach(t => {
    if (t.nba < 1 || t.nba > withPpg.length) return;
    // Show player at rank = NBA-expected count (i.e., where the NBA "last player at this tier" sits in our sim)
    const idx = Math.min(t.nba - 1, withPpg.length - 1);
    const p = withPpg[idx];
    lines.push(`${t.thr}+\t#${idx + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${p.ppg.toFixed(1)}`);
  });
  lines.push('');

  // Diagnostic
  const lines30 = withPpg.filter(p => p.ppg >= 30).length;
  const lines20 = withPpg.filter(p => p.ppg >= 20).length;
  const lines15 = withPpg.filter(p => p.ppg >= 15).length;
  lines.push('=== DIAGNOSTIC ===');
  if (Math.abs(lines30 - 2) > 2) lines.push(`🟡 30+ PPG: ${lines30} (NBA ~2) — ${lines30 > 2 ? 'too many elite scorers' : 'no elite scorers'}`);
  if (Math.abs(lines20 - 37) > 6) lines.push(`🔴 20+ PPG: ${lines20} (NBA ~37) — ${lines20 < 37 ? 'star tier compressed (mid-tier scorers missing)' : 'star tier inflated'}`);
  if (Math.abs(lines15 - 78) > 10) lines.push(`🟡 15+ PPG: ${lines15} (NBA ~78) — ${lines15 < 78 ? 'second-tier scorers compressed' : 'too many secondary scorers'}`);

  const matchCount = tiers.filter(t => {
    const c = withPpg.filter(p => p.ppg >= t.thr).length;
    return Math.abs(c - t.nba) <= t.tol;
  }).length;
  lines.push(`Tiers within NBA tolerance: ${matchCount} / ${tiers.length}`);
  if (matchCount === tiers.length) lines.push('✅ Talent ladder fully NBA-aligned.');
  else if (matchCount >= 7) lines.push('🟢 Talent ladder mostly NBA-aligned.');
  else if (matchCount >= 4) lines.push('🟡 Talent ladder partially aligned — mid-tier off.');
  else lines.push('🔴 Talent ladder significantly compressed/stretched vs NBA.');

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'TIERS', body: `${withPpg.length} players. ${matchCount}/${tiers.length} tiers within NBA tolerance.`, ok: matchCount >= 7 };
}

// ADVCHECK ────────────────────────────────────────────────────────────────────
// Consolidated advanced-stats audit: player top-5 in 8 metrics + team-level
// ORtg/DRtg/NetRtg/PACE, all vs NBA 2025-26 reference (Gemini benchmark).
//
// Trade-aggregation: a player traded mid-season has multiple stats[] entries
// (one per team-stint). We sum cumulatives (GP, MIN, PTS, WS, VORP) and
// minute-weight-average rate stats (PER, USG%, ORtg, DRtg, BPM, TS%, WS/48)
// across all stints. Without this, a traded player would show only their
// last-team stint stats — Durant-DET + Durant-HOU split would mask the real
// season totals and skew the leaderboard.
async function runAdvCheck(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;

  type AggP = {
    name: string; tid: number;
    gp: number; min: number; pts: number; fga: number; fgm: number;
    t3m: number; t3a: number; ft: number; fta: number;
    ast: number; reb: number; stl: number; blk: number; tov: number;
    ws: number; ows: number; dws: number; vorp: number; ewa: number;
    per: number; usg: number; ortg: number; drtg: number;
    bpm: number; obpm: number; dbpm: number; ts: number; ws48: number;
  };

  const players: AggP[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const seasonStats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (seasonStats.length === 0) continue;

    // Aggregate cumulatives + minute-weight averages across all team-stints
    let gp = 0, min = 0, pts = 0, fga = 0, fgm = 0, t3m = 0, t3a = 0;
    let ft = 0, fta = 0, ast = 0, reb = 0, stl = 0, blk = 0, tov = 0;
    let ws = 0, ows = 0, dws = 0, vorp = 0, ewa = 0;
    let perW = 0, usgW = 0, ortgW = 0, drtgW = 0;
    let bpmW = 0, obpmW = 0, dbpmW = 0, tsW = 0, ws48W = 0;
    let weightMin = 0;
    for (const s of seasonStats) {
      const m = s.min ?? 0;
      gp += s.gp ?? 0; min += m; pts += s.pts ?? 0;
      fga += s.fga ?? 0; fgm += s.fg ?? 0;
      t3m += s.tp ?? 0; t3a += s.tpa ?? 0;
      ft += s.ft ?? 0; fta += s.fta ?? 0;
      ast += s.ast ?? 0;
      reb += s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0));
      stl += s.stl ?? 0; blk += s.blk ?? 0; tov += s.tov ?? 0;
      ws += s.ws ?? 0; ows += s.ows ?? 0; dws += s.dws ?? 0; vorp += s.vorp ?? 0;
      ewa += s.ewa ?? 0;
      if (m > 0) {
        perW += (s.per ?? 0) * m;
        usgW += (s.usgPct ?? 0) * m;
        ortgW += (s.ortg ?? 0) * m;
        drtgW += (s.drtg ?? 0) * m;
        bpmW += (s.bpm ?? 0) * m;
        obpmW += (s.obpm ?? 0) * m;
        dbpmW += (s.dbpm ?? 0) * m;
        tsW += (s.tsPct ?? 0) * m;
        // Field naming inconsistency: advancedstats.ts writes `wsPer48`, type interface
        // declares `ws48?`. Read both, fall back to computed (ws × 48 / min). Without
        // the fallback every player showed 0.000 WS/48 in the leaderboard.
        const stintWs48 = s.ws48 ?? (s as any).wsPer48 ?? ((s.ws ?? 0) * 48 / Math.max(1, m));
        ws48W += stintWs48 * m;
        weightMin += m;
      }
    }

    if (gp < MIN_GP) continue;

    const div = (n: number, d: number) => d > 0 ? n / d : 0;
    players.push({
      name: p.name, tid: p.tid,
      gp, min, pts, fga, fgm, t3m, t3a, ft, fta, ast, reb, stl, blk, tov,
      ws, ows, dws, vorp, ewa,
      per: div(perW, weightMin),
      usg: div(usgW, weightMin),
      ortg: div(ortgW, weightMin),
      drtg: div(drtgW, weightMin),
      bpm: div(bpmW, weightMin),
      obpm: div(obpmW, weightMin),
      dbpm: div(dbpmW, weightMin),
      ts: div(tsW, weightMin),
      ws48: div(ws48W, weightMin),
    });
  }

  if (players.length < 30) {
    return { title: 'ADVCHECK', body: `Only ${players.length} players with ≥${MIN_GP} GP — need ≥30.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  // ── Player Top-5 helper
  const lines: string[] = [];
  lines.push(`ADVCHECK — Advanced Stats vs NBA 2025-26 reference`);
  lines.push(`Sample: ${players.length} qualifying NBA players (≥${MIN_GP} GP, trade-aggregated). Season ${currentYear}.`);
  lines.push('');

  type RefT = { top1: number; top5: number; leaders: string };
  const showTop = (label: string, scoreFn: (p: AggP) => number, fmt: (n: number) => string, ref: RefT, ascending = false) => {
    const sorted = [...players].sort((a, b) => ascending ? scoreFn(a) - scoreFn(b) : scoreFn(b) - scoreFn(a)).slice(0, 5);
    lines.push(`=== ${label} (NBA top-1: ${ref.top1}, top-5: ${ref.top5} | ${ref.leaders}) ===`);
    lines.push('rank\tname\tteam\tGP\tvalue');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${fmt(scoreFn(p))}`));
    const top1 = scoreFn(sorted[0]);
    const tolerance = ref.top1 * 0.15;
    const flag1 = ascending
      ? (top1 < ref.top1 - tolerance ? '🔴 too good' : top1 > ref.top1 + tolerance ? '🔴 worse than NBA top' : '✓')
      : (top1 > ref.top1 * 1.15 ? '🔴 over NBA' : top1 < ref.top1 * 0.85 ? '🔴 under NBA' : '✓');
    lines.push(`status\ttop1=${fmt(top1)} ${flag1}`);
    lines.push('');
  };

  // NBA 2025-26 reference (Gemini benchmark, 2026-03-13)
  showTop('PER', p => p.per, n => n.toFixed(1), { top1: 32.3, top5: 22.0, leaders: 'Jokic 32.3, SGA 30.8, Doncic 27.9' });
  showTop('USG%', p => p.usg, n => n.toFixed(1), { top1: 38.1, top5: 29.4, leaders: 'Doncic 38.1, J.Brown 36.2, Jokic 30.4' });
  // ORtg/DRtg leaderboards filter to ≥1500 total min — NBA Rate Stat qualification.
  // Without this filter, backup bigs with high efficiency but low usage (DeAndre Jordan,
  // Hartenstein, Duren) flooded the top — they have great per-100 numbers but never
  // run plays. Real NBA top ORtg is always high-volume stars (Jokic, SGA, Durant).
  const RATE_MIN_MIN = 1500;
  const rateQualifying = players.filter(p => p.min >= RATE_MIN_MIN);
  const showTopRate = (label: string, scoreFn: (p: AggP) => number, fmt: (n: number) => string, ref: RefT, ascending = false) => {
    const sorted = [...rateQualifying].sort((a, b) => ascending ? scoreFn(a) - scoreFn(b) : scoreFn(b) - scoreFn(a)).slice(0, 5);
    if (sorted.length === 0) { lines.push(`=== ${label} === (no players ≥${RATE_MIN_MIN} min)`); lines.push(''); return; }
    lines.push(`=== ${label} (≥${RATE_MIN_MIN} min, NBA top-1: ${ref.top1}, top-5: ${ref.top5} | ${ref.leaders}) ===`);
    lines.push('rank\tname\tteam\tGP\tmin\tvalue');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${p.min.toFixed(0)}\t${fmt(scoreFn(p))}`));
    const top1 = scoreFn(sorted[0]);
    const flag1 = ascending
      ? (top1 < ref.top1 * 0.95 ? '🔴 too good' : top1 > ref.top1 * 1.10 ? '🔴 worse than NBA' : '✓')
      : (top1 > ref.top1 * 1.15 ? '🔴 over NBA' : top1 < ref.top1 * 0.85 ? '🔴 under NBA' : '✓');
    lines.push(`status\ttop1=${fmt(top1)} ${flag1}`);
    lines.push('');
  };
  showTopRate('ORtg', p => p.ortg, n => n.toFixed(1), { top1: 126, top5: 120, leaders: 'Jokic 126, SGA 125, Durant 124' });
  showTopRate('DRtg (lower=better)', p => p.drtg, n => n.toFixed(1), { top1: 101.0, top5: 107.1, leaders: 'Wemby 101, Holmgren 104.5, Gobert 105.8' }, true);
  showTop('BPM', p => p.bpm, n => n.toFixed(1), { top1: 14.2, top5: 5.1, leaders: 'Jokic 14.2, SGA 11.7, Doncic 9.3' });
  showTop('VORP', p => p.vorp, n => n.toFixed(1), { top1: 9.2, top5: 4.7, leaders: 'Jokic 9.2, SGA 7.8, Doncic 6.6' });
  showTop('EWA', p => p.ewa, n => n.toFixed(1), { top1: 22, top5: 14, leaders: 'Jokic ~22, SGA ~18, Doncic ~15 (Hollinger MVP-tier 22-30)' });
  showTop('WS', p => p.ws, n => n.toFixed(1), { top1: 15.2, top5: 9.5, leaders: 'SGA 15.2, Jokic 14.9, Durant 10.7' });
  showTop('WS/48', p => p.ws48, n => n.toFixed(3), { top1: 0.316, top5: 0.180, leaders: 'Jokic .316, SGA .295, Doncic .199' });

  // ── Team Advanced (ORtg / DRtg / NetRtg / PACE)
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });

  type TR = { tid: number; gp: number; pts: number; opp: number; fga: number; fta: number; tov: number; orb: number };
  const teamMap = new Map<number, TR>();
  const ensure = (tid: number): TR => {
    if (!teamMap.has(tid)) teamMap.set(tid, { tid, gp: 0, pts: 0, opp: 0, fga: 0, fta: 0, tov: 0, orb: 0 });
    return teamMap.get(tid)!;
  };
  const sumLines = (lines: any[], k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
  for (const g of boxes) {
    const home = ensure((g as any).homeTeamId);
    const away = ensure((g as any).awayTeamId);
    home.gp++; away.gp++;
    home.pts += (g as any).homeScore; home.opp += (g as any).awayScore;
    away.pts += (g as any).awayScore; away.opp += (g as any).homeScore;
    const hs = (g as any).homeStats, as = (g as any).awayStats;
    home.fga += sumLines(hs, 'fga'); home.fta += sumLines(hs, 'fta');
    home.tov += sumLines(hs, 'tov'); home.orb += sumLines(hs, 'orb');
    away.fga += sumLines(as, 'fga'); away.fta += sumLines(as, 'fta');
    away.tov += sumLines(as, 'tov'); away.orb += sumLines(as, 'orb');
  }

  // Possessions estimate: FGA + 0.44 × FTA + TOV - ORB (NBA standard formula)
  // Per-100 ratings: pts × 100 / poss
  // Filter sub-teams with <5 GP (e.g. All-Star sub-teams T-5/T-6 polluted rankings with
  // ORtg 134.8 and PACE 21.5 — single 1-game appearances).
  // PACE_CORRECTION 0.965×: NBA's listed PACE (~98) is ~4% below the raw box-derived
  // possessions (~102) because NBA averages with the opponent's possessions (paired-team
  // formula). Without correction, ORtg/DRtg league means land at ~112 vs NBA 115.6.
  const PACE_CORRECTION = 0.965;
  const teamRows = Array.from(teamMap.values()).filter(t => t.gp >= 5).map(t => {
    const possPg = ((t.fga + 0.44 * t.fta + t.tov - t.orb) / t.gp) * PACE_CORRECTION;
    const ortg = possPg > 0 ? (t.pts / t.gp / possPg) * 100 : 0;
    const drtg = possPg > 0 ? (t.opp / t.gp / possPg) * 100 : 0;
    return {
      tid: t.tid, abbrev: abbrev(t.tid), gp: t.gp,
      ppg: t.pts / t.gp, opp: t.opp / t.gp,
      ortg, drtg, netrtg: ortg - drtg, pace: possPg,
    };
  });

  // Best ORtg (highest), best DRtg (lowest), best NetRtg (highest), pace range
  const bestOrtg = [...teamRows].sort((a, b) => b.ortg - a.ortg);
  const bestDrtg = [...teamRows].sort((a, b) => a.drtg - b.drtg);  // lower is better
  const bestNet = [...teamRows].sort((a, b) => b.netrtg - a.netrtg);
  const paceSorted = [...teamRows].sort((a, b) => b.pace - a.pace);

  lines.push('=== TEAM ADVANCED ===');
  lines.push('METRIC\tSIM_TOP_TEAM\tSIM_VALUE\tNBA_TOP\tSIM_BOT_TEAM\tSIM_VALUE\tNBA_BOT');
  lines.push(`ORtg\t${bestOrtg[0].abbrev}\t${bestOrtg[0].ortg.toFixed(1)}\t122.63 (DEN)\t${bestOrtg[bestOrtg.length-1].abbrev}\t${bestOrtg[bestOrtg.length-1].ortg.toFixed(1)}\t108.84 (BKN)`);
  lines.push(`DRtg\t${bestDrtg[0].abbrev}\t${bestDrtg[0].drtg.toFixed(1)}\t107.89 (OKC)\t${bestDrtg[bestDrtg.length-1].abbrev}\t${bestDrtg[bestDrtg.length-1].drtg.toFixed(1)}\t122.84 (WAS)`);
  lines.push(`NetRtg\t${bestNet[0].abbrev}\t${bestNet[0].netrtg >= 0 ? '+' : ''}${bestNet[0].netrtg.toFixed(1)}\t-\t${bestNet[bestNet.length-1].abbrev}\t${bestNet[bestNet.length-1].netrtg >= 0 ? '+' : ''}${bestNet[bestNet.length-1].netrtg.toFixed(1)}\t-`);
  lines.push(`PACE\t${paceSorted[0].abbrev}\t${paceSorted[0].pace.toFixed(1)}\t101.5 (IND)\t${paceSorted[paceSorted.length-1].abbrev}\t${paceSorted[paceSorted.length-1].pace.toFixed(1)}\t94.0 (PHI)`);

  // League means
  const lgOrtg = teamRows.reduce((s, t) => s + t.ortg, 0) / teamRows.length;
  const lgDrtg = teamRows.reduce((s, t) => s + t.drtg, 0) / teamRows.length;
  const lgPace = teamRows.reduce((s, t) => s + t.pace, 0) / teamRows.length;
  lines.push('');
  lines.push('=== LEAGUE MEAN ADVANCED ===');
  lines.push('METRIC\tSIM\tNBA\tSTATUS');
  const checkLg = (name: string, v: number, nba: number, tol: number) => {
    const ok = Math.abs(v - nba) <= tol;
    lines.push(`${name}\t${v.toFixed(1)}\t${nba}\t${ok ? '✓' : v > nba ? '🟡 HIGH' : '🟡 LOW'}`);
  };
  checkLg('ORtg', lgOrtg, 115.6, 2);
  checkLg('DRtg', lgDrtg, 115.6, 2);
  checkLg('PACE', lgPace, 98.2, 2);

  // Diagnostic
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  const diags: string[] = [];
  // DRtg architectural sanity check
  const simDrtgTop = bestDrtg[0].drtg;
  if (simDrtgTop < 95) diags.push(`🔴 Top DRtg ${simDrtgTop.toFixed(1)} < 95 — DRtg too low (defense over-buffed)`);
  if (simDrtgTop > 110) diags.push(`🔴 Top DRtg ${simDrtgTop.toFixed(1)} > 110 — no elite defense (DRtg compressed)`);
  // ORtg sanity
  const simOrtgTop = bestOrtg[0].ortg;
  if (simOrtgTop < 115) diags.push(`🟡 Top ORtg ${simOrtgTop.toFixed(1)} < 115 — top offense weak`);
  if (simOrtgTop > 130) diags.push(`🟡 Top ORtg ${simOrtgTop.toFixed(1)} > 130 — top offense over-buffed`);
  // PACE sanity
  if (lgPace < 95) diags.push(`🟡 League PACE ${lgPace.toFixed(1)} < 95 — too slow`);
  if (lgPace > 102) diags.push(`🟡 League PACE ${lgPace.toFixed(1)} > 102 — too fast`);

  if (diags.length === 0) lines.push('✅ Team advanced metrics in NBA range.');
  else diags.forEach(d => lines.push('  ' + d));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'ADVCHECK', body: `${players.length} players + ${teamRows.length} teams audited. Console + clipboard.`, ok: diags.length === 0 };
}

// BENCHEFF ────────────────────────────────────────────────────────────────────
// Sixth-man / limited-min efficiency audit. Surfaces "unrecognized gems" — bench
// players with high PER per minute. NBA real has ~30-50 league-wide sixth-men
// (14-26 mpg) with PER ≥13. Our sim's pattern: PER strongly correlates with MPG
// (low-min → low PER, high-min → high PER), so few bench gems are visible.
async function runBenchEff(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;
  const MIN_MPG_LO = 14;
  const MIN_MPG_HI = 26;

  type AggP = {
    name: string; tid: number; gp: number; gs: number; min: number; mpg: number;
    pts: number; fga: number; fgm: number; t3m: number;
    ft: number; fta: number; tov: number; ast: number;
    per: number; ts: number; usg: number; bpm: number; ws48: number;
    fgaPerMin: number; ppg: number; eFG: number;
  };

  const players: AggP[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const seasonStats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (seasonStats.length === 0) continue;

    let gp = 0, gs = 0, min = 0, pts = 0, fga = 0, fgm = 0, t3m = 0;
    let ft = 0, fta = 0, ast = 0, tov = 0;
    let perW = 0, tsW = 0, usgW = 0, bpmW = 0, ws48W = 0;
    let weightMin = 0;
    for (const s of seasonStats) {
      const m = s.min ?? 0;
      gp += s.gp ?? 0; min += m;
      gs += s.gs ?? 0;
      pts += s.pts ?? 0; fga += s.fga ?? 0; fgm += s.fg ?? 0;
      t3m += s.tp ?? 0; ft += s.ft ?? 0; fta += s.fta ?? 0;
      ast += s.ast ?? 0; tov += s.tov ?? 0;
      if (m > 0) {
        perW += (s.per ?? 0) * m;
        tsW += (s.tsPct ?? 0) * m;
        usgW += (s.usgPct ?? 0) * m;
        bpmW += (s.bpm ?? 0) * m;
        ws48W += (s.ws48 ?? (s as any).wsPer48 ?? ((s.ws ?? 0) * 48 / Math.max(1, m))) * m;
        weightMin += m;
      }
    }
    if (gp < MIN_GP) continue;
    const mpg = min / gp;
    if (mpg < MIN_MPG_LO || mpg > MIN_MPG_HI) continue;

    const div = (n: number, d: number) => d > 0 ? n / d : 0;
    players.push({
      name: p.name, tid: p.tid, gp, gs, min, mpg,
      pts, fga, fgm, t3m, ft, fta, tov, ast,
      per: div(perW, weightMin),
      ts: div(tsW, weightMin),
      usg: div(usgW, weightMin),
      bpm: div(bpmW, weightMin),
      ws48: div(ws48W, weightMin),
      fgaPerMin: div(fga, min),
      ppg: div(pts, gp),
      eFG: fga > 0 ? ((fgm + 0.5 * t3m) / fga) * 100 : 0,
    });
  }

  if (players.length < 30) {
    return { title: 'BENCHEFF', body: `Only ${players.length} sixth-men found (${MIN_MPG_LO}-${MIN_MPG_HI} mpg, ≥${MIN_GP} GP) — need ≥30.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;
  const isBench = (p: AggP) => p.gs < Math.max(10, p.gp * 0.4);

  // Top 15 sixth-men by PER
  const sorted = [...players].sort((a, b) => b.per - a.per);
  const top15 = sorted.slice(0, 15);

  const lines: string[] = [];
  lines.push(`BENCHEFF — Sixth-man efficiency audit (${MIN_MPG_LO}-${MIN_MPG_HI} mpg, ≥${MIN_GP} GP, trade-aggregated)`);
  lines.push(`Sample: ${players.length} sixth-men in season ${currentYear}.`);
  lines.push(`NBA real reference (2025-26): Herro 16 PER, Powell 17, Clarkson 15, Carrington 14 (PER 13-17 typical for top sixth-men).`);
  lines.push('');
  lines.push('=== TOP 15 BY PER ===');
  lines.push('rank\tname\tteam\tGP\tGS\tmpg\tPPG\tPER\tTS%\tUSG%\teFG%\tFGA/min\tBPM\tWS/48\trole');
  top15.forEach((p, i) => lines.push([
    i + 1, p.name, abbrev(p.tid), p.gp,
    p.gs,
    p.mpg.toFixed(1), p.ppg.toFixed(1),
    p.per.toFixed(1), p.ts.toFixed(3), p.usg.toFixed(1),
    p.eFG.toFixed(1), p.fgaPerMin.toFixed(2),
    p.bpm.toFixed(1), p.ws48.toFixed(3),
    isBench(p) ? 'BENCH' : 'STARTERISH',
  ].join('\t')));
  lines.push('');

  // Diagnostic: PER tier distribution among sixth-men
  const tier17 = players.filter(p => p.per >= 17).length;
  const tier15 = players.filter(p => p.per >= 15 && p.per < 17).length;
  const tier13 = players.filter(p => p.per >= 13 && p.per < 15).length;
  const tier10 = players.filter(p => p.per >= 10 && p.per < 13).length;
  const tier05 = players.filter(p => p.per >= 5 && p.per < 10).length;
  const tierNeg = players.filter(p => p.per < 5).length;

  lines.push('=== PER TIER DISTRIBUTION ===');
  lines.push('TIER\tSIM_COUNT\tNBA_EXPECT\tFLAG');
  const checkTier = (label: string, c: number, expect: number, tol: number) => {
    const flag = Math.abs(c - expect) <= tol ? '✓' : c > expect ? '🟡 OVER' : '🔴 UNDER';
    lines.push(`${label}\t${c}\t${expect}\t${flag}`);
  };
  checkTier('PER ≥17 (elite gems)', tier17, 8, 4);
  checkTier('PER 15-17 (strong sixth-man)', tier15, 18, 6);
  checkTier('PER 13-15 (solid rotation)', tier13, 30, 8);
  checkTier('PER 10-13 (regular role)', tier10, 40, 10);
  checkTier('PER 5-10 (marginal)', tier05, 25, 8);
  checkTier('PER <5 (truly bad / negative)', tierNeg, 8, 5);
  lines.push('');

  // Diagnostic findings
  const diags: string[] = [];
  if (tier17 < 4) diags.push(`🔴 Only ${tier17} sixth-men with PER ≥17 (NBA: ~8) — elite gems suppressed`);
  if (tier15 + tier17 < 18) diags.push(`🔴 Only ${tier15 + tier17} sixth-men with PER ≥15 (NBA: ~26) — high-tier compression`);
  if (tierNeg > 18) diags.push(`🟡 ${tierNeg} sixth-men with PER <5 (NBA: ~8) — too many negative-PER role players`);

  // Per-min PER check — gems can have high PER/min despite low MPG
  const gemCandidates = players.filter(p => p.mpg < 22 && p.per >= 13 && isBench(p));
  lines.push(`=== POTENTIAL GEMS (bench, mpg <22, PER ≥13) — ${gemCandidates.length} found (NBA real: ~15-25) ===`);
  if (gemCandidates.length === 0) {
    lines.push('🔴 NO bench gems found — every high-PER player is high-mpg starter (PER tied to minutes)');
  } else {
    lines.push('name\tteam\tGP\tGS\tmpg\tPPG\tPER\tTS%\tUSG%');
    gemCandidates
      .sort((a, b) => b.per - a.per)
      .slice(0, 10)
      .forEach(p => lines.push(`${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${p.gs}\t${p.mpg.toFixed(1)}\t${p.ppg.toFixed(1)}\t${p.per.toFixed(1)}\t${p.ts.toFixed(3)}\t${p.usg.toFixed(1)}`));
  }
  lines.push('');

  const teamRows = teams
    .filter((t: any) => typeof t.id === 'number' && t.id >= 0 && t.id < 100)
    .map((t: any) => {
      const teamPlayers = players.filter(p => p.tid === t.id);
      const benchPlayers = teamPlayers.filter(isBench);
      const bench10 = benchPlayers.filter(p => p.per >= 10).length;
      const bench13 = benchPlayers.filter(p => p.per >= 13).length;
      const starter10 = teamPlayers.filter(p => !isBench(p) && p.per >= 10).length;
      const topBench = [...benchPlayers].sort((a, b) => b.per - a.per)[0];
      return {
        tid: t.id,
        team: abbrev(t.id),
        benchCount: benchPlayers.length,
        bench10,
        bench13,
        starter10,
        topBenchName: topBench?.name ?? '-',
        topBenchPer: topBench ? topBench.per : -99,
        topBenchMpg: topBench?.mpg ?? 0,
      };
    })
    .filter(r => r.benchCount > 0)
    .sort((a, b) => b.bench13 - a.bench13 || b.bench10 - a.bench10 || b.topBenchPer - a.topBenchPer);

  lines.push('=== TEAM BENCH GEM SCAN ===');
  lines.push('team\tbenchPlayers\tbenchPER10+\tbenchPER13+\tstarterPER10+\ttopBench\ttopBenchPER\ttopBenchMPG');
  teamRows.forEach(r => lines.push([
    r.team,
    r.benchCount,
    r.bench10,
    r.bench13,
    r.starter10,
    r.topBenchName,
    r.topBenchPer >= 0 ? r.topBenchPer.toFixed(1) : '-',
    r.topBenchMpg.toFixed(1),
  ].join('\t')));
  lines.push('');

  const deadBenchTeams = teamRows.filter(r => r.bench13 === 0);
  const richBenchTeams = teamRows.filter(r => r.bench13 >= 2);
  if (deadBenchTeams.length > Math.round(teamRows.length * 0.65)) {
    diags.push(`🔴 ${deadBenchTeams.length}/${teamRows.length} teams have zero bench PER ≥13 players — no hidden gems`);
  }
  if (richBenchTeams.length < 4) {
    diags.push(`🟡 Only ${richBenchTeams.length} teams have 2+ bench PER ≥13 players — bench quality too top-heavy`);
  }

  lines.push('=== DIAGNOSTIC ===');
  if (diags.length === 0) lines.push('✅ Sixth-man PER distribution NBA-aligned.');
  else diags.forEach(d => lines.push('  ' + d));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'BENCHEFF', body: `${players.length} sixth-men, ${gemCandidates.length} bench gems, ${deadBenchTeams.length} teams with zero bench PER 13+. Console + clipboard.`, ok: diags.length === 0 };
}

// PERSAMPLE ───────────────────────────────────────────────────────────────────
// Random 30-player audit for stored season PER vs minute-weighted recompute
// from the underlying per-game samples in the current season.
async function runPerSample(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  type Row = {
    name: string;
    team: string;
    gp: number;
    gs: number;
    mpg: number;
    seasonPer: number;
    recomputedPer: number;
    diff: number;
    minTotal: number;
    sampleGames: string;
  };

  const rows: Row[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const stats = ((p as any).stats as any[] | undefined ?? [])
      .filter(s => s.season === currentYear && !s.playoffs && s.tid === p.tid);
    if (stats.length === 0) continue;

    let gp = 0;
    let gs = 0;
    let minTotal = 0;
    let weightedPerSum = 0;
    const gameSamples: Array<{ min: number; per: number }> = [];

    for (const s of stats) {
      const statGp = s.gp ?? 0;
      const statGs = s.gs ?? 0;
      const statMin = s.min ?? 0;
      const statPer = s.per ?? 0;
      gp += statGp;
      gs += statGs;
      minTotal += statMin;
      weightedPerSum += statPer * statMin;

      const minPerGame = statGp > 0 ? statMin / statGp : 0;
      for (let i = 0; i < statGp; i++) {
        gameSamples.push({ min: minPerGame, per: statPer });
      }
    }

    if (gp <= 0 || minTotal <= 0) continue;
    const seasonStat = stats[0];
    const seasonPer = seasonStat.per ?? 0;
    const recomputedPer = weightedPerSum / minTotal;
    const shuffledSamples = [...gameSamples].slice(-3).map(g => `${g.per.toFixed(1)}@${g.min.toFixed(1)}m`).join(' | ');

    rows.push({
      name: p.name,
      team: abbrev(p.tid),
      gp,
      gs,
      mpg: minTotal / gp,
      seasonPer,
      recomputedPer,
      diff: seasonPer - recomputedPer,
      minTotal,
      sampleGames: shuffledSamples || '-',
    });
  }

  if (rows.length < 30) {
    return { title: 'PERSAMPLE', body: `Only ${rows.length} eligible players found in ${currentYear}.`, ok: false };
  }

  const shuffled = [...rows];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sample = shuffled.slice(0, 30).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const bad = sample.filter(r => Math.abs(r.diff) >= 1.5).length;

  const lines: string[] = [];
  lines.push(`PERSAMPLE — random 30-player PER audit for season ${currentYear}`);
  lines.push('season PER = currently stored value on player.stats row');
  lines.push('recomputed PER = minute-weighted recompute from the current season stat rows');
  lines.push('');
  lines.push('name\tteam\tGP\tGS\tMPG\tstoredPER\trecomputedPER\tdiff\tminTotal\trecentGameSamples');
  sample.forEach(r => lines.push([
    r.name,
    r.team,
    r.gp,
    r.gs,
    r.mpg.toFixed(1),
    r.seasonPer.toFixed(2),
    r.recomputedPer.toFixed(2),
    r.diff >= 0 ? `+${r.diff.toFixed(2)}` : r.diff.toFixed(2),
    r.minTotal.toFixed(1),
    r.sampleGames,
  ].join('\t')));
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  if (bad === 0) {
    lines.push('✅ Sample shows stored PER closely matches minute-weighted recompute.');
  } else {
    lines.push(`⚠️ ${bad}/30 sampled players differ by at least 1.5 PER — stale save or bad season aggregation likely.`);
  }

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return {
    title: 'PERSAMPLE',
    body: `30 random players dumped. ${bad} with |diff| >= 1.5. Console + clipboard.`,
    ok: bad === 0,
  };
}

// ─── Entry: detect + trigger ─────────────────────────────────────────────────

/**
 * Try to match an input to a cheat code. Case-insensitive, trimmed, ignores spaces.
 * Returns the matched CheatCode, or null if no match.
 */
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

// ─── Audit helpers — route to existing scripts/audit-*.js ────────────────────

async function runFaAudit(state: GameState) {
  const P = state.players;
  console.group('📋 FA Status Audit');

  const statusCounts: Record<string, number> = {};
  P.forEach(p => { statusCounts[(p as any).status ?? 'undefined'] = (statusCounts[(p as any).status ?? 'undefined'] || 0) + 1; });
  console.log('status distribution:');
  console.table(statusCounts);

  const tidMinus1 = P.filter(p => p.tid === -1);
  const byStatusAtTidNeg1: Record<string, number> = {};
  tidMinus1.forEach(p => { byStatusAtTidNeg1[(p as any).status ?? 'undefined'] = (byStatusAtTidNeg1[(p as any).status ?? 'undefined'] || 0) + 1; });
  console.log(`tid === -1 breakdown (${tidMinus1.length}):`);
  console.table(byStatusAtTidNeg1);

  const strictFA = P.filter(p => p.tid === -1 && (p as any).status === 'Free Agent');
  const looseFA = P.filter(p => p.tid < 0 && ['Free Agent', 'FreeAgent'].includes((p as any).status));
  console.log(`FA counts: strict=${strictFA.length} loose=${looseFA.length}`);

  if (strictFA.length > 0) {
    const buckets = { '85+': 0, '75-84': 0, '65-74': 0, '55-64': 0, '<55': 0 };
    strictFA.forEach(p => {
      const o = p.overallRating || 0;
      if (o >= 85) buckets['85+']++;
      else if (o >= 75) buckets['75-84']++;
      else if (o >= 65) buckets['65-74']++;
      else if (o >= 55) buckets['55-64']++;
      else buckets['<55']++;
    });
    console.log('OVR distribution:');
    console.table(buckets);
  }
  console.groupEnd();
}

async function runEconAudit(state: GameState) {
  console.group('💰 Economy Audit');
  const ls = state.leagueStats;
  const cap = ls.salaryCap || 0;
  const floorPct = (ls as any).minimumPayrollPercentage ?? 90;
  const floor = cap * (floorPct / 100);
  const userTid = state.gameMode === 'gm' ? (state as any).userTeamId : -999;

  const teamRows = state.teams.filter(t => t.id !== userTid).map(t => {
    const onTeam = state.players.filter(p => p.tid === t.id);
    const standard = onTeam.filter(p => !(p as any).twoWay);
    const twoWay = onTeam.filter(p => (p as any).twoWay);
    const payroll = onTeam.reduce((s, p) => s + (((p as any).contract?.amount || 0) * 1000), 0);
    return { abbrev: (t as any).abbrev ?? t.name, std: `${standard.length}/15`, tw: `${twoWay.length}/3`, payroll: fmt(payroll) };
  });

  console.log(`Cap: ${fmt(cap)} | Floor: ${fmt(floor)} (${floorPct}%)`);
  console.table(teamRows.slice(0, 30));
  console.groupEnd();
}
