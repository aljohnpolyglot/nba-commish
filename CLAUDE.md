# CLAUDE.md

## Communication
**Language: German (Deutsch).** All responses from Claude should be in German.

## Project
NBA Commissioner / GM simulator. React + TypeScript + Vite. Save persistence via `idb-keyval` in IndexedDB.

## Multi-season economy pipeline

The signing/cap system runs in this **execution order** inside `src/services/AIFreeAgentHandler.ts → runAIFreeAgencyRound`:

1. **Pass 1** — best-fit signings (cap space + MLE for top FAs)
2. **Pass 2** — two-way contracts (≤60 BBGM OVR fringe FAs) — **runs before fill** so the salary-ASC sort in Pass 4 doesn't vacuum the pool
3. **Pass 3** — non-guaranteed training camp (preseason only, Jul 1 – Oct 21)
4. **Pass 4** — minimum-roster enforcement (fill to 15-man, last-resort min-deal)
5. **Pass 5** — minimum-payroll floor enforcement (only helps teams with open roster slots)

**Critical:** if you reorder these passes, the two-way pool starves. Pass 4 sorts by salary ASC, which prefers the lowest-OVR FAs — exactly the players Pass 2 needs.

## Economy audit scripts

Two browser-console scripts validate fixes against a real save (`scripts/`):

- **`audit-economy.js`** — quick health check: rosters, two-ways, payroll floor, mega-contracts, lingering supermax flags. Paste in DevTools, auto-runs on newest save.
- **`audit-economy-deep.js`** — investigation script: FA pool by OVR bucket, per-team avg salary, under-rostered team transaction logs, floor-clearing forecast.

Both auto-load the newest save from IndexedDB via `keyval-store`. To target a specific save: `await auditEconomy('nba_commish_save_<id>')`.

## Known unfixed economy issues

- **Pass 5 can't help full rosters.** Teams at 15/15 with cheap deals (e.g. Phoenix $46M / 15 players) need NBA-style **shortfall distribution** — bonus payments to existing players, not new signings. Function not yet written. Should fire from `seasonRollover.ts` at year-end.
- **`playerCurrentSeason` derives from `player.stats` MAX year, not `state.leagueStats.year`.** Stale for retired/revived players. In `salaryUtils.ts`.

## Unit gotchas

- `contract.amount` — BBGM **thousands** (e.g. 12000 = $12M). Multiply ×1000 for USD.
- `minContractStaticAmount` — **millions** (e.g. 1.273). Multiply ×1,000,000 for USD.
- `overallRating` — **BBGM scale** (40–85). Use `convertTo2KRating` to compare against K2 (60–99).
- `yearsOfService` — `player.stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).length`. Not `age - 22`.

## Debugging save-state bugs — STOP and ask first

For every data-corruption / contract / FA-pool / roster / Bird-Rights / mood / trade bug, **STOP after stating the suspected mechanism. Ask the user to paste the DevTools snippet below and wait for the output before reading more code.** Code reads without the actual save state are guesswork — the `releaseDeclinedExtensionPlayer` fix only landed because the user pulled `{tid: -1, contract.exp: 2028, contractYears[14] valid}` straight out of the save, which contradicted the player-option theory I'd been chasing. Don't repeat that — ask up-front.

### Save format (critical — saves are GZIPPED)

- IndexedDB database: `keyval-store`, object store: `keyval`
- Save IDs follow pattern `nba_commish_<timestamp>_<id>` (e.g. `nba_commish_1778078108571_mvnxqj`)
- Metadata index key: `nba_commish_metadata` → array of `{ id, name, dateSaved, gameDate, commissionerName, day }`
- **Save value is `{ __gz: true, data: ArrayBuffer }` — gzipped JSON.** Reading it raw shows `{__gz, data}` with no `players` field. You must `DecompressionStream('gzip')` it first.
- `state` is **NOT** a global. Reading from IDB + decompressing is the only console path.

See `src/services/SaveManager.ts` for the canonical compress/decompress helpers, and `scripts/audit-economy.js` for the audit-script pattern (older audit scripts predate the gzip wrapper — check before reusing).

### Standard snippet — load newest save and inspect a player

```js
// F12 → Console → paste, edit the LASTNAME:
(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('keyval-store');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const get = k => new Promise((res, rej) => {
    const r = db.transaction('keyval','readonly').objectStore('keyval').get(k);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const meta = await get('nba_commish_metadata');
  const newest = [...meta].sort((a,b) => b.dateSaved - a.dateSaved)[0];
  const raw = await get(newest.id);
  // ── Gunzip ─────────────────────────────────────
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter();
  w.write(raw.data); w.close();
  const state = JSON.parse(await new Response(ds.readable).text());
  // ── Inspect ────────────────────────────────────
  const p = state.players.find(p => p.name.includes('LASTNAME'));
  console.log({
    tid: p.tid, status: p.status,
    contract: p.contract, contractYears: p.contractYears,
    yearsWithTeam: p.yearsWithTeam, hasBirdRights: p.hasBirdRights,
    draftYear: p.draft?.year,
  });
  window.__lastSaveState = state; // keep around for follow-ups
})();
```

After running once, `window.__lastSaveState` is hot — follow-ups can skip the IDB+gunzip dance and just read `__lastSaveState.players.find(...)` directly.

**Console usage note:** paste the JavaScript block only. Do not paste surrounding prose like "Then run:" or quoted assistant text, or DevTools will throw a syntax error before the snippet executes.

### Adjust the destructure to the bug

- **Stats / Bird Rights / yearsOfService**: dump `p.stats` (full array — check for missing seasons or `playoffs:true` rows without matching regular row)
- **Trades**: `p.transactions`, plus `state.history.filter(h => h.text?.includes('PLAYER NAME'))`
- **Moods**: `p.moodTraits`, `p.morale`, `p.roleStability`
- **Cap / payroll**: dump the team's full roster (`state.players.filter(p => p.tid === TEAM_ID)` then map salaries)
- **FA pool**: `state.players.filter(p => p.tid === -1 && p.status === 'Free Agent')` — count + top-OVR sample
- **Schedule (mid-season trade verification)**: `state.schedule.filter(g => g.played && g.season === Y && (g.homeTeamId === T || g.awayTeamId === T))`

**Inspect the actual save state, don't infer it from UI screenshots.** UI components have their own filters that can hide or transform fields; only the raw state is authoritative.

## TODO.md is the working backlog

Always read `TODO.md` first. The MULTI-SEASON ECONOMY section tracks what's been fixed, what's open, and any newly-discovered bugs from audit runs.

## Don't

- Don't add error handling/fallbacks for impossible scenarios (see global instructions).
- Don't write multi-paragraph docstrings — one short line max.
- Don't auto-run trim/cut logic without checking for the **family-ties protection** (`hasFamilyOnRoster`) — siblings/relatives are untouchable in nepotism passes.
