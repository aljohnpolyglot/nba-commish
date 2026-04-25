# NBA Commish — TODO

**Session 27 (2026-04-25)** — Massive FA-pipeline realism pass: mid-season market cooldown, K2 ≥ 70 threshold, Bird Rights Pass 0 + bid-pool whitelist, RFA matching offer-sheets, Free Agency scouting tab, + 6 hotfixes (2W vets, clamping, dedup, date gates). [Full details in CHANGELOG.md](./CHANGELOG.md).

**Session 26 (2026-04-24)** — Prompt J (external-league ecosystem sustainer) + Prompt K (fetch resilience + storage quota). [Details in CHANGELOG.md](./CHANGELOG.md).

**Session 25 (2026-04-24)** — 11-bug economy sweep. [Details in CHANGELOG.md](./CHANGELOG.md).

---

## BUGS — Open

- **AI trade evaluator overpays / accepts pick-bombs** — observed in 2025-26 sim:
  - **Sep 30, 2025**: LAL sends Hachimura + Vanderbilt + Kennard + **4 picks** (2026 1st, 2027 1st, 2027 2nd, 2028 1st) to LAC for **Kawhi Leonard** alone (34yo, K2 87, $50M/yr expiring 2031). Aspirational — paying 4 picks for an aging high-salary star is the real-NBA "win-now trap". Probably defensible per the value engine but should warn contender GMs OR cap pick count.
  - **Dec 9, 2025**: LAL sends Smart + Kleber + **4 picks** (2028 2nd, 2029 1st+2nd, 2030 1st) to ATL for **Corey Kispert** alone. Kispert is a fringe rotation guy (K2 ~75) — 4 picks + 2 vets for him is wildly lopsided. Smoking gun for AI trade engine.
  - Pattern: AI receiving team accepts any +TV bundle regardless of asset mix, AND the sending team's `findOffers` doesn't cap picks-per-trade. Both teams in both trades are AI-controlled — no human vetoed.
  - Investigate: `tradeFinderEngine.ts` `calcPickTV` vs `calcPlayerTV` weighting, `findOffers` pick-sweetener cap, hard cap of 2 picks max per trade unless gap >= massive threshold, AI seller acceptance threshold (probably accepts any +TV regardless of asset type), `getTradeOutlook` for the sending team's mode awareness.

- **Real-player contract history truncated** — gist-fetched real players (e.g., SGA — career earnings $58.9M shown only for 2030-31, no transactions on record). Real-life contract history isn't seeded into `contractYears[]` from the gist data, so PlayerBio Salaries tab shows only the current season. Investigate: `realPlayerDataFetcher.ts` + bbgmParser flow, decide whether to seed historical `contractYears` from the gist `salaries` array on initial player creation.

- **EconomyTab settings UI for RFA + signing-difficulty** — RFA matching shipped with hardcoded defaults (matching ON, 2-day window, auto-decline 2nd apron ON). Three `leagueStats` settings need UI rows on EconomyTab: `rfaMatchingEnabled`, `rfaMatchWindowDays`, `rfaAutoDeclineOver2ndApron`. Held off to coordinate with the parallel signing-difficulty agent's `useRulesState` changes — wire both in same pass.

- **Audit vs UI FA count mismatch** — `audit-economy-deep.js` strict filter (`p.status === 'Free Agent'`) misses the 833 `'FreeAgent'` legacy-typo players. Forward-healing fix in `simulationHandler.runSimulation` normalizes on next sim tick. LOAD_GAME migration normalizes on next load. Diagnostic snippet at `scripts/audit-fa-status.js`.

- **Retired players with `tid: -1`** — 17-21 retirees stuck in FA pool sentinel instead of dedicated retired-tid. Cosmetic — FA pipeline filters by `status === 'Free Agent'` so they don't actually leak into bidding, but TWOWAYAGE / FAPOOL audits show them. Cleanup: backfill `tid: -100` (or whatever sentinel) in LOAD_GAME for `status === 'Retired'` players.

---

## DELEGATION PROPS — Order matters

**Order: save → M (ecosystem, SHIPPED S26) → I (FA pipeline, SHIPPED S27) → L (bidding-war refactor, PR1+RFA+UI shipped S27, PR2-PR4 + PR6 still queued)**

Prompt L remaining:
- **PR2** — escalation rounds (Round 1/2/3 parallel bid window, sealed re-bids)
- **PR3** — resolution formula upgrade (`legacyMult`, `championshipMult`, `moodMult`, Bird-Rights tiebreak before RNG)
- **PR4** — gut sequential pipeline (Pass 1 → Bird-Rights re-sign only, Pass 4 candidate filter restricted to K2 < 70 || market-unsigned)
- **PR6** — LOAD_GAME save migration for new schema

Design doc with all 8 Open Questions resolved at [`docs/bidding-war-refactor.md`](./docs/bidding-war-refactor.md).

---

<details>
<summary><strong>Prompt L — Bidding war refactor (DESIGN DOC SHIPPED — see `docs/bidding-war-refactor.md`)</strong></summary>

**Status:** design delivered. Review below. Implementation blocked on user answering the 8 Open Questions.

**Doc location:** [`docs/bidding-war-refactor.md`](./docs/bidding-war-refactor.md)

**My quick calls on the Open Questions (for user discussion, not final):**

1. **Stagger vs flood Jul 1** → stagger across Jul 1–3. Narrative reason (biggest stars Jul 1, role players Jul 2–3) + performance reason (avoid 300-market tick burst). Low downside.
2. **Escalation rounds** → 3. Extra round is meaningful for mid-market dynamics; 2 rounds can feel thin when user's bidding against sophisticated AI.
3. **Tie-break sans Bird Rights** → seeded random. Desirability secondary feels arbitrary; random with fixed seed is honest and replayable.
4. **Retract vs escalate-only** → escalate-only in Round 2/3 (teams commit to their Round 1 floor). Bids can still be invalidated by the daily cap-recheck (edge case #7), which covers the salary-dump-mid-market scenario without giving teams a "nah take it back" button.
5. **Shortlist auto-queue default** → ON for new saves, with a Settings toggle. Power users flip off; new GMs benefit from the handholding.
6. **Shortlist size cap** → 15. Roughly matches a team's offseason realistic target list.
7. **Escalation visibility to AI** → sealed. Team B re-evaluates based on market value delta, not visible Round-1 Team-A bid. Closer to real NBA info asymmetry + prevents exploits.
8. **Shams escalation tweets** → off by default, per-tier setting (can enable for K2 ≥ 90 only). Default-off because 300 markets × 3 escalation rounds = feed spam.

**Implementation order (when green-lit):** PR1 → PR2 → PR3 → PR4 → PR5 → PR6.  
Ship one at a time, resim between each, confirm no regression in FA pool metrics.

**Blocked until:** user approval of Open Questions 1–8. See [`docs/bidding-war-refactor.md`](./docs/bidding-war-refactor.md) for full design doc.

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
