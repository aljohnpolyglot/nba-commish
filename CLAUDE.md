# CLAUDE.md

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

## TODO.md is the working backlog

Always read `TODO.md` first. The MULTI-SEASON ECONOMY section tracks what's been fixed, what's open, and any newly-discovered bugs from audit runs.

## Don't

- Don't add error handling/fallbacks for impossible scenarios (see global instructions).
- Don't write multi-paragraph docstrings — one short line max.
- Don't auto-run trim/cut logic without checking for the **family-ties protection** (`hasFamilyOnRoster`) — siblings/relatives are untouchable in nepotism passes.
