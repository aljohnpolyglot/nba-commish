# NBA Commish — TODO

**Session 27 (2026-04-25)** — Massive FA-pipeline realism pass: mid-season market cooldown, K2 ≥ 70 threshold, Bird Rights Pass 0 + bid-pool whitelist, RFA matching offer-sheets, Free Agency scouting tab, + 6 hotfixes (2W vets, clamping, dedup, date gates). [Full details in CHANGELOG.md](./CHANGELOG.md).

**Session 26 (2026-04-24)** — Prompt J (external-league ecosystem sustainer) + Prompt K (fetch resilience + storage quota). [Details in CHANGELOG.md](./CHANGELOG.md).

**Session 25 (2026-04-24)** — 11-bug economy sweep. [Details in CHANGELOG.md](./CHANGELOG.md).

---

## BUGS — Open

- **EconomyTab settings UI for RFA + signing-difficulty** — RFA matching shipped with hardcoded defaults (matching ON, 2-day window, auto-decline 2nd apron ON). Three `leagueStats` settings need UI rows on EconomyTab: `rfaMatchingEnabled`, `rfaMatchWindowDays`, `rfaAutoDeclineOver2ndApron`. Held off to coordinate with the parallel signing-difficulty agent's `useRulesState` changes — wire both in same pass.

- **Audit vs UI FA count mismatch** — `audit-economy-deep.js` strict filter (`p.status === 'Free Agent'`) misses the 833 `'FreeAgent'` legacy-typo players. Forward-healing fix in `simulationHandler.runSimulation` normalizes on next sim tick. LOAD_GAME migration normalizes on next load. Diagnostic snippet at `scripts/audit-fa-status.js`.

---

## Prompt L — Bidding-war refactor (QUEUED)

**Status:** Design doc complete with all 8 Open Questions answered. PR1 (K2 ≥ 70 threshold + cap cleanup) shipped in Session 27. Remaining PR2–PR4 + PR6 queued pending user final approval.

**Full design doc:** [`docs/bidding-war-refactor.md`](./docs/bidding-war-refactor.md) (§1-8: current state, proposed architecture, data structures, resolution formula, edge cases, UX, tradeoffs, migration plan + resolved Open Questions)

---

## KNOWLEDGE GAPS — Hardcoded Jun 30 assumptions

Revisit when rollover date becomes dynamic:

- **`constants.ts:381-383` PHASE table** — `[6, 21]` Lottery, `[6, 25]` Draft. Coarse phase-label bucketing only; breaks if playoff rounds push finals into July.
- **`seasonRollover.ts:731-735` `shouldFireRollover`** — hardcodes Jun 30. With extra playoff rounds, finals end July but rollover fires mid-finals.
- **`DraftPickGenerator.ts`** — "Rollover (Jun 30) resets `draftComplete`" comment carries same assumption.

---

## FEATURES — Backlog (low priority)

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab has 70/30 value/fit scoring. Remaining:
1. Show projected team at each slot (mock draft)
2. Weight POT for young players in player comparisons, not just current OVR

### Dual-affiliation academy prospects (Luka-Real-Madrid model)
Pre-assign `draft.year` at generation for youth academy players so they're simultaneously at their youth club AND in a future draft class. Real Luka Doncic at 16 was playing Real Madrid senior AND everyone knew he was declaring 2018 — sim could model that.

Implementation:
- At generateProspect for academy youth: `player.draft.year = currentYear + (19 - age)`
- No Jun 30 status flip needed (currently Prompt C auto-declares at 19)
- Rollover just checks `draft.year === currentYear` → move to draft pool that year
- DraftScouting can surface prospects 1-4 years out with their club attached: "Alejandro Garcia — Real Madrid Youth → declares 2032"
- Enables scouting mechanic expansion (commit scouting budget to follow a prospect's development years ahead)

Preserves Prompt C's `<19` progression freeze (no change there). Replaces the status-flip mechanism with a pre-committed draft year.

### Dead money / ghost contracts (Luol Deng rule)
Waived-player stretch across multiple years. Currently waive zeros team-side contract obligation entirely.

### Top-3 star trade override (topNAvgK2)
From session 16 plan — not yet active. Teams with top-3 average K2 ≥ X should have trade-willingness override relaxed.

### WNBA contract expiry + FA pipeline
WNBA contracts never expire (explicitly guarded in the external-unstick fix so they don't leak into NBA pool). Needs a separate WNBA-specific FA pipeline.

### DraftPicks.tsx — lottery-odds context
`src/components/central/view/TeamOffice/pages/DraftPicks.tsx` shows pick inventory (round + season) but no awareness of active lottery system. No pick-value estimate shown.

---

## SEPARATE DEVELOPMENTS

| Project | Account |
|---------|---------|
| Draft Lottery / Draft | princealjohnmogatas@gmail.com |
| Coaching | lemakicatta@gmail.com |
| GrubHub | mogatas.princealjohn.05082003@gmail.com |
| FranchiseHub | lemakicatta@gmail.com |
| Restaurants gist | https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbarestaurantsdata |
| Hall of Fame UI | princealjohnmogatas@gmail.com |
| Team Office | mogatas.princealjohn.05082003@gmail.com |

---

## History

Session-by-session fixed lists live in [`NEW_FEATURES.md`](./NEW_FEATURES.md) and [`CHANGELOG.md`](./CHANGELOG.md). Read those before assuming an item is still open.
