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
import { convertTo2KRating } from './helpers';
import { estimatePotentialBbgm } from './playerRatings';
import { deriveLeagueStartYearFromHistory, explainJerseyRetirementCandidates } from '../services/playerDevelopment/jerseyRetirementChecker';
import { resolveTeamStrategyProfile } from './teamStrategy';
import { calcPlayerTV, calcPickTV, calcOvr2K } from '../services/trade/tradeValueEngine';
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
} as const;

export type CheatCode = keyof typeof CHEAT_CODES;

// ─── Cheat handlers ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + (n / 1_000_000).toFixed(1) + 'M';
}

async function runCheat(code: CheatCode, ctx: CheatContext): Promise<CheatResult> {
  const { state, dispatchAction, healPlayer } = ctx;

  switch (code) {
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
      const currentYear = state.leagueStats?.year ?? 2026;
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
      const windowSize = (state.leagueStats as any)?.tradableDraftPickSeasons ?? 7;
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
      const currentYear = state.leagueStats?.year ?? 2026;
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
      const seasonYr = state.leagueStats?.year ?? 2026;
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
      const seasonYr = state.leagueStats?.year ?? 2026;
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

    default:
      return { title: 'Unknown cheat', body: `"${code}" not recognized — try HELP`, ok: false };
  }
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
