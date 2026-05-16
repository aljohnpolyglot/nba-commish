# CLAUDE.md

## Communication
**Language: German (Deutsch).** All responses from Claude should be in German.

## STOP — How this user works (READ FIRST, OVERRIDES EVERYTHING BELOW)

**This project has plan files in `plans/` and `docs/superpowers/plans/`. When the user says "continue", "weiter", "resume", "mach weiter", or points to TODO.md / a plan file:**

1. **Read the plan file.**
2. **Pick the next open item.**
3. **Write the code. Commit.**
4. **Repeat.**

That is the whole workflow. No `AskUserQuestion`. No skill loading. No "subagent-driven-development". No 32-task tracker. No spec-review + quality-review subagents per file. No "let me brainstorm first". **No ceremony.**

If you feel the urge to invoke `superpowers:*` skills or dispatch reviewer subagents, **stop.** The user has explicitly said this wastes their time and tokens. They wrote the plan, they want the code.

**Hard rules:**
- NEVER `git reset --hard` when there is uncommitted work. Use `git revert <commit>` or cherry-pick. The user works in a heavily-dirty worktree on purpose; reset destroys their progress.
- NEVER create test files for trivial helpers (5-line switches, 18-line type adapters). This is a game project, not a library.
- NEVER split a 20-line helper into its own file + `__tests__/` folder unless the helper is genuinely reused in 3+ places.
- NEVER bundle "parallel WIP" into a commit unless the user explicitly says so in *this* session — past approval doesn't carry over.
- BEFORE writing a new file, grep the codebase for the symbol/feature. If it already exists, extend it instead of duplicating.

The `AskUserQuestion` rule in the next section applies ONLY to genuinely novel architecture work where the plan file is silent. If the plan file or TODO answers the question, skip the prompt.

## Workflow: AskUserQuestion only when truly needed

These bugs have shipped multiple times across sessions. Before writing code, scan this list and check whether your change is about to repeat one of them.

1. **Team name rendering — ALWAYS use the canonical helper.**

   `NBATeam.name` is **inconsistent**:
   - Real NBA teams: `name = "Houston Rockets"` (already contains region)
   - Expansion/legacy/some-imports: `name = "Blue Chips"` (nickname only)

   **Naive options both fail:**
   - `team.name` alone → "Blue Chips" with no city in expansion case
   - `${team.region} ${team.name}` → "Houston Houston Rockets" / "Miami Miami Heat" / "Golden State Golden State Warriors" in normal case

   **Always use** `getTeamFullName(team)` from `src/utils/teamNames.ts`. It checks `name.startsWith(region + ' ')` — returns name as-is when prefix already there, otherwise prefixes. Same module exposes `getTeamNickname(team)` for the inverse.

   ```ts
   import { getTeamFullName } from '../utils/teamNames';
   <h2>{getTeamFullName(team)}</h2>          // "Houston Rockets" or "Las Vegas Blue Chips"
   ```

   **Defense at write-side too:** when constructing a new team object (e.g. in `APPLY_EXPANSION_REALIGNMENT` reducer), set `name: \`${spec.region} ${spec.name}\`` so downstream code that uses `team.name` directly still gets a sane string.

   **Never** write `${team.region} ${team.name}` inline. Cite this rule in any PR review where you see the pattern.

2. **`p.tid >= 0` is NOT the NBA-only filter.**
   External leagues use offsets: Euroleague +1000, PBA +2000, **WNBA +3000**, B-League +4000, Endesa +5000, G-League +6000, CBA +7000, NBL +8000. Correct filter is `p.tid >= 0 && p.tid < 100`. Add a `status`-not-in-(WNBA/Euroleague/…) check as defense-in-depth. Symptom: A'ja Wilson appears in NBA pools.

3. **`player.age` is unreliable — ALWAYS use `computeAge(player, simYear)` from `src/utils/helpers.ts`.**
   BBGM rosters set `born.year` consistently but not `age`. The helper handles `born.year` → `simYear - born.year`, falls back to `player.age`, then 25. Never inline the formula — use the helper so the fallback chain stays in one place. `simYear` comes from `state.leagueStats?.year`.

4. **Family-Lock: `relatives.length > 0` ≠ "has family on this roster".**
   `player.relatives` lists ALL known kin league-wide (BBGM-pid based, doesn't match our `internalId`). Use `hasFamilyOnRoster(player, roster)` from `utils/familyTies.ts` — it matches by name within the given roster. Symptom: Aaron Holiday locked on Houston because Justin Holiday is in the league elsewhere.

5. **BBGM logo URLs (don't guess, use the verified paths).**
   - **Primary:** `https://play.basketball-gm.com/img/logos-primary/{ABBREV}.svg` (200 direct)
   - **Secondary/alt:** `https://play.basketball-gm.com/img/logos-secondary/{ABBREV}.svg` (200 direct)
   - Convenience redirect: `/img/logos/{ABBREV}.png` → 302 → primary.svg
   - All abbrevs incl. SEA, LV, VAN, BUF, KC, SD, PIT, BAL, STL, MXC, HAR, ANA work.
   - When probing URLs always use `curl -I -L` (follow redirects). A bare HEAD on the redirect path returned 302 with no body and I incorrectly read that as "doesn't exist". When the user says "BBGM has it", they're right — keep probing patterns.

6. **`p.born.year` migration drift.** Old saves have `age` set but not `born.year`. Always `??`-chain: `born?.year ? leagueYear - born.year : (player.age ?? null)`.

7. **Don't assume Action-Tab is reachable in GM-Mode.**
   `Actions` is commissioner-only. Navigation via `OFFSEASON_ROW_TAB[row] = 'Actions'` lands the GM in nothing. Open the relevant Modal directly from the GM context (e.g. inside `OffseasonAufgabenSidebar`) instead.

8. **`OffseasonChecklistRow` exhaustive switches.**
   Every new Row in `OFFSEASON_ROW_ORDER` (e.g. `expansionDraft`) needs a `case` in `getStepConfirmSpec()` and any other exhaustive `switch (row)`. Missing case = `undefined` returned = silent click that does nothing.

9. **Don't cap searchable lists with `slice(0, 60)` for "perf".**
   205 logos × 1 lazy `<img>` = trivial. Cap killed UX (user couldn't find Hartford/Vancouver). Use `loading="lazy"` instead.

10. **Auto-Seed effects need a persistent seed-flag, not just an existence-check.**
    If you seed `state.expansionSchedule` and the user cancels, your existence-check (`!schedule`) re-fires and seeds again. Persist `auto<feature>Seeded: true` in `leagueStats` and check that flag.

## Project

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
