# NBA Commish — TODO

---

## ✅ SHIPPED — CBA / Apron Rules Audit (EconomyTab.tsx)

**Status:** P0 + P1 CBA / apron audit shipped and verified with `npm run build`. P2 remains deferred.

### Scope (do these in order)

**P0 — Critical block (the apron sliders are cosmetic without these). Ship together; they share infrastructure.**

1. **Apron-tiered salary-matching ratios** — 125% / 110% / 100% based on post-trade cap state of each side.
2. **MLE tier gating** — Room / NT / Tax / None based on apron position. 2nd-apron teams lose all MLE access.
3. **Cash-in-trade gating** — 2nd-apron teams cannot send cash.
4. **No salary aggregation over 2nd apron** — must be 1-out-1-in or per-incoming-matched.

**P1 — High priority. Ship after P0 if build still passes.**

5. **Sign-and-trade acquisition gate (1st apron)** — receiving via S&T hard-caps at 1st apron.
6. **Pick-freeze 7 years out (2nd apron)** — 7th-year 1st becomes un-tradeable while over 2nd.
7. **TPE provenance gating (2nd apron)** — 2nd-apron teams can't use TPEs from prior years / S&T / aggregation.

**Defer (out of scope for this session):**
- #8 Mid-season waiver-claim block — no waiver-claim flow exists yet
- #9 Hard-cap triggers — large refactor, do after #5 lands
- #10–#12 P2 polish — separate session

### Detailed spec for each item

The full acceptance spec for each item is in this file at **"## QUEUED — Full CBA / apron rules audit (EconomyTab.tsx)"** (~line 200+). Each item has:
- *CBA:* the rule in real NBA terms
- *Current:* what the code does today
- *Fix:* the exact code change + UI plumbing

Read those bullets before starting each item. They include file paths and the exact setting names to add.

### Settings schema additions (`src/types.ts` LeagueStats)

Add these fields with defaults. UI plumbing follows the existing `EconomyTab.tsx` pattern (see `useRulesState.ts` for the get/set + draft-state hookup). Only add a setting if the corresponding fix touches it:

```ts
// Salary-matching ratios (P0 #1)
tradeMatchingRatioUnder?: number;       // default 1.25
tradeMatchingRatioOver1st?: number;     // default 1.10
tradeMatchingRatioOver2nd?: number;     // default 1.00

// Cash gating (P0 #3)
restrictCashSendOver2ndApron?: boolean; // default true

// Aggregation gating (P0 #4)
restrictAggregationOver2ndApron?: boolean; // default true

// S&T gating (P1 #5)
restrictSignAndTradeAcquisitionOver1stApron?: boolean; // default true

// 7-year pick freeze (P1 #6)
freezePickAt2ndApron?: boolean;         // default true

// TPE provenance (P1 #7)
restrictTPEProvenanceOver2ndApron?: boolean; // default true
```

### Trade validator integration

The shared validator lives in `src/services/trade/tradeFinderEngine.ts` and `src/components/modals/TradeMachineModal.tsx`. Both call salary-leg checks and a final acceptance gate. Each P0/P1 item adds one or more rejection branches keyed off the **post-trade** cap state of each side.

For "post-trade cap state": project each side's payroll AFTER the swap (subtract outgoing salaries, add incoming) and bucket into `under_cap | over_cap | over_tax | over_1st | over_2nd`. Use this bucket to pick the matching ratio (#1) and gate the other restrictions (#2–#7).

A helper like `getApronBucketAfterTrade(team, leg, leagueStats)` will be reused by every item — write it once.

### MLE allocation refactor (#2)

`getMLEAvailability()` already exists (referenced in CLAUDE.md). Branch it on team payroll vs aprons:

| Cap state | Available MLE |
|-----------|---------------|
| Under cap | Room MLE only |
| Over cap, under tax | NT MLE |
| Tax-payer (over tax, under 1st apron) | NT MLE |
| Between 1st & 2nd apron | Taxpayer MLE only |
| Over 2nd apron | NONE |

`AIFreeAgentHandler.ts` Pass 1 then naturally picks the right tier — no separate logic needed.

### TPE provenance schema (#7)

Find the TPE store via grep `TradePlayerException` or `traded.*exception`. Add to TPE objects:

```ts
{
  vintage: number;     // seasonYear when this TPE was created
  source: 'plain' | 'aggregation' | 'sign-and-trade';
}
```

When a 2nd-apron team tries to use a TPE in a trade, check both `vintage < currentYear` (prior-year TPE) and `source !== 'plain'` — refuse if either.

### Pick-freeze logic (#6)

In trade validator, when an offering team is over 2nd apron AND `freezePickAt2ndApron === true`:
- Compute the 7th future year: `currentYear + 7`
- Refuse the trade if any pick in the offering basket has `season === currentYear + 7` AND `round === 1`

### EconomyTab UI restructure

Per the audit's "Suggested EconomyTab UI restructure" section:
- **Split Aprons** out of Finances into its own card
- Add **Apron-Tied Restrictions** card directly below it grouping #1, #2, #4, #6
- Cash-in-trade (#3) and S&T (#5) belong inside the existing **Trade Exceptions** card
- BAE/MLE gating (#2) collapses into existing **Contracts** section as inline eyebrows showing "Available to: ____ teams"

### Acceptance criteria

1. `npm run build` passes
2. `EconomyTab` shows the new settings with NBA-default values pre-populated
3. Trade validator rejects with clear reason text:
   - "Over 2nd apron — salary must match 1.00× outgoing"
   - "Over 2nd apron — cash sends not allowed"
   - "Over 2nd apron — cannot aggregate contracts in this trade"
   - "Over 1st apron — cannot acquire via sign-and-trade"
   - "Over 2nd apron — 2033 1st-round pick is frozen"
   - "Over 2nd apron — this TPE was created via aggregation, can't be used"
4. AI trade builder respects the same gates (no AI-AI trade slips past these rules)
5. Default behavior matches real-NBA 2023 CBA (defaults documented above)
6. Each setting has a commissioner toggle so leagues can opt out for relaxed simulation

### Investigation hooks

- `src/components/commissioner/rules/view/EconomyTab.tsx` — UI surface for all settings
- `src/components/commissioner/rules/view/useRulesState.ts` — settings state plumbing (~line 188 has the existing maxStandard pattern to mirror)
- `src/services/trade/tradeFinderEngine.ts` — `generateCounterOffers`, `evaluateTradeAcceptance` (validator gates land here)
- `src/components/modals/TradeMachineModal.tsx` — user-facing trade validator (line 391 calls evaluateTradeAcceptance, mirror gates here)
- `src/services/AITradeHandler.ts` — `validateAITradeExecution` (~line 476) is the AI-AI gate
- `src/utils/salaryUtils.ts` — `getMLEAvailability`, `getCapThresholds` (cap-state helpers; add the apron-bucket helper here)
- `src/types.ts` — LeagueStats type for new settings

### Implementation order recommendation

1. Write `getApronBucketAfterTrade()` helper in `salaryUtils.ts` first — every P0/P1 item uses it
2. Add settings schema to `types.ts` + `useRulesState.ts` (no UI yet, just state)
3. Ship P0 #1 (matching ratios) — simplest, validates the bucket helper
4. Ship P0 #3 (cash gate) — trivial after #1
5. Ship P0 #2 (MLE tier gating) — `getMLEAvailability()` branch
6. Ship P0 #4 (aggregation) — slightly trickier (needs leg-by-leg analysis)
7. Run `npm run build` — confirm green
8. Add EconomyTab UI cards — P0 settings exposed
9. P1 items #5 → #6 → #7 in order
10. Final `npm run build` + manual smoke test on a fresh save

### Don't break

- The existing `evaluateTradeAcceptance` dead-money cost gate (Session 32) — leave it intact, it's orthogonal
- The Session 36 3-pick salary-dump cap — leave intact, doesn't conflict
- The `apronsEnabled` master toggle — every new gate should respect `apronsEnabled !== false` so leagues can disable apron gameplay entirely

---

Recent sessions (full notes in [CHANGELOG.md](./CHANGELOG.md)):
- **Session 36 (2026-04-30)** — Codex one-shot economy cleanup: 60-day guaranteed-signing grace; MLE swaps respect grace; trim force-cut fallback unblocks 19/15 deadlock; salary-dump 3-pick compensation cap; faMarketTicker K2 70-74 → NG camp invites; FA bidding 90-day cooldown mirror; `inferStrategyKey` no-record fallback moved BEFORE buyer/seller branches (the keystone — strategy now correctly resolves to 'rebuilding' for BKN-class teams in summer FA so all Session 34 rebuilder gates actually fire)
- **Session 35 (2026-04-30)** — `inferStrategyKey` offseason fallback: roster-quality-based rebuild inference when wins+losses < 5 (no record yet) — fixes BKN-class teams misclassified 'neutral' in summer FA so my Session 34 rebuilder gates can actually fire
- **Session 34 (2026-04-30)** — Rebuilder discipline: extension/Bird-Rights/Pass1 refuse non-young-core (age>25 OR K2<78) for rebuilding/development/cap_clearing teams; canCut star protection (OVR≥75 never cut, fixes Coby White $12.9M waive bug); recent-waiver cooldown 30→90 days (no waive→re-sign-at-5×-salary cycle); stretch threshold 4%→6% of cap (no 5yr stretches on small contracts); runAIMleUpgradeSwaps protections
- **Session 33 (2026-04-30)** — canCut adds rookie / pre-camp-OVR / Bird-Rights-resign protections (BKN $44M Konan/Traore/Powell/Saraf rookie-cut snowball solved); Pass 3 NG fill target 21 → 18 so camp ends with NBA-realistic depth not 21-man bloat
- **Session 32 (2026-04-30)** — Mid-season date clamp (mid-tier → 1yr post-Oct 21, K2≥80 → 2yr cap), trade evaluator dead-money projection penalty kills UTA/MIN/LAC absorption snowballs, Huerter contract-bleed bug logged for further trace
- **Session 31 (2026-04-30)** — AI-GM financial discipline: Pass 1 always caps at 15 standard, marginal-upgrade + position-saturation + length-aversion gates, widened isCampInvite (cap-relative tiers), TX cheat waiver tid fix
- **Session 30 (2026-04-28)** — All-Star Weekend overhaul: bucket logic, bracket sim, multi-format UI (see ALL-STAR section below)
- **Session 29 (2026-04-27)** — Pick-only trades + cash considerations (schema, AI, GM modal, summary, rollover)
- **Session 28 (2026-04-26/27)** — Cup schedule integrity, FGA volume rebuild v3, Re-sign UX
- **Session 27 (2026-04-25)** — FA-pipeline realism pass (mid-season cooldown, K2 ≥ 70, Bird Rights, RFA matching)
- **Session 26 (2026-04-24)** — External-league sustainer + fetch resilience + storage quota
- **Session 25 (2026-04-24)** — 11-bug economy sweep

---

## SHIPPED (uncommitted) — Rising Stars Multi-Format Overhaul (PR 5)

**Formats shipped:** `rookies_vs_sophomores` (classic) · `usa_vs_world` · `4team_tournament` (2022+ NBA — 3 legend-coached NBA teams + G League, SFs→40, Final→25) · `random_4team` · `random_2team`. Commissioner UI: format picker + Elimination Endings toggle + per-RS quarter-length slider (1–12 min, bypassed by Mirror League Rules).

**Files changed:** `types.ts` (risingStarsBracket + risingStarsMvp + risingStarsQuarterLength + risingStarsEliminationEndings) · `AllStarSelectionService.ts` (get4TeamRisingStarsRoster + getRandomRisingStarsRoster) · `AllStarWeekendOrchestrator.ts` (injectAllStarGames RS branch, simulateRisingStarsBracket, scaleToTarget helper, simulateWeekend routing) · `RisingStarsSection.tsx` · `AllStarTab.tsx` · `useRulesState.ts` · `TabsContent.tsx` · `AllStarDayView.tsx` (tournament bracket cards) · `AllStarHistoryView.tsx` (RS MVP column).

**GIDs:** 91001/91002 (SFs, static) · 91099 (Final, dynamic). Legacy 90000 still used for non-tournament formats.

### Data model additions (`src/types.ts`)

Add to `AllStarState`:
```ts
risingStarsBracket?: {
  format: '4team_tournament';
  teams: Array<{
    tid: number;           // -13 to -16 (distinct from main ASG -1..-12)
    name: string;          // "Team Melo", "Team T-Mac", etc.
    abbrev: string;        // "MLO", "TMC", etc.
    coachName: string;     // "Carmelo Anthony"
    isGLeague: boolean;
    wins: number; losses: number; pf: number; pa: number;
  }>;
  games: Array<{
    gid: number;           // 91001/91002 (SFs), 91099 (Final)
    homeTid: number; awayTid: number;
    round: 'sf' | 'final';
    targetScore: 40 | 25;
    played: boolean; homeScore: number; awayScore: number;
  }>;
  championshipGid?: number;   // 91099 when injected
  complete: boolean;
};
risingStarsMvp?: { name: string; team: string; pts: number };
```

Add to commissioner settings (around line 531):
- `risingStarsFormat` gains `'4team_tournament'` as a valid value
- `risingStarsEliminationEndings?: boolean` — SF losers sit out final (true) vs all 4 play round-robin (false); default true

### File-by-file plan

**Step 1 — `src/types.ts`**
- Add `risingStarsBracket` + `risingStarsMvp` to `AllStarState` (above the existing `bracket` field).
- Add `'4team_tournament'` doc comment next to `risingStarsFormat`.
- Add `risingStarsEliminationEndings?: boolean` to commissioner settings (~line 534).

**Step 2 — `AllStarSelectionService.ts`**
Add `static get4TeamRisingStarsRoster(players, year)`:
- NBA eligible pool: `draft.year === year-1` (rookies) OR `draft.year === year-2` (sophs), age ≤ 23, not in external league
- G League pool: `gLeagueAssigned === true` within same age range (top 7 by perf score)
- Perf score: `ovr * 0.4 + ppg * 0.3 + rpg * 0.15 + apg * 0.15` (same as existing `getRisingStarsRoster`)
- Top 21 NBA players → snake-draft into 3 equal teams of 7 (team1 picks 1/6/7/12/13/18/19, team2 picks 2/5/8/11/14/17/20, team3 picks 3/4/9/10/15/16/21)
- Coach legend pool cycles by `(year % coachPool.length)`:
  ```
  [
    { coach: 'Carmelo Anthony', abbrev: 'MLO' },
    { coach: 'Tracy McGrady',   abbrev: 'TMC' },
    { coach: 'Vince Carter',    abbrev: 'VIN' },
  ]
  ```
  Team names: `"Team ${lastName}"` (e.g. "Team Anthony" → "Team Melo" — use first name variant)
  G League coach: `'Austin Rivers'` (constant)
- Returns `{ nbaTeams: [players7[], players7[], players7[]], gLeaguePlayers: players7[], coaches: string[] }`

**Step 3 — `AllStarWeekendOrchestrator.ts`**

*`injectAllStarGames()` changes:*
- When `leagueStats.risingStarsEnabled && risingStarsFormat === '4team_tournament'`: inject gids **91001** and **91002** (SF games, Friday) instead of gid 90000. Do NOT inject gid 91099 (Final) — it's dynamic.
- Keep gid 90000 injection only when format is NOT `'4team_tournament'`.

*New `static async simulateRisingStarsBracket(state)`:*
```
Pattern: same as simulateAllStarBracket but smaller.

1. Call get4TeamRisingStarsRoster() → 4 player pools
2. Build 4 fake teams (tid -13 to -16):
     -13 Team A (NBA team 1), -14 Team B (NBA team 2),
     -15 Team C (NBA team 3), -16 Team D (G League)
3. Determine SF matchups:
     SF1 (91001): team -13 (home) vs team -16 (G League, away)  ← strongest vs G League
     SF2 (91002): team -14 (home) vs team -15 (away)
4. Simulate SF1 + SF2 with simulateGames() (quarterLength: 3, 4 qtrs)
   Post-sim score-scale: scaleToTarget(homeScore, awayScore, 40)
     → winner = 40, loser = round(loserRaw * 40 / winnerRaw), clamped ≥ 1
5. If risingStarsEliminationEndings (default true):
     Final participants = SF winners
   Else (round-robin future TODO):
     Final participants = top 2 by pf-pa
6. Inject gid 91099 (Final, same Friday date) into schedule
7. Simulate gid 91099, scale to target 25
8. Extract MVP from Final box score (top scorer on winning team)
9. Update allStar.risingStarsBracket (teams records, games results, complete: true)
10. Update allStar.risingStarsMvp
```

*`simulateWeekend()` changes:*
- Friday branch: if `risingStarsFormat === '4team_tournament'` → call `simulateRisingStarsBracket` instead of `simulateRisingStars`

**Step 4 — `RisingStarsSection.tsx`**
- Add `{ value: '4team_tournament', label: '4-Team Tournament (2022+ format)' }` to `formats` array
- When `'4team_tournament'` selected:
  - Description: "3 NBA rookie/sophomore teams + 1 G League team. Semifinals to 40 pts, Final to 25 pts."
  - Show `risingStarsEliminationEndings` toggle: "Elimination endings" (SF losers sit out)
- Pass new props `risingStarsEliminationEndings` / `setRisingStarsEliminationEndings` from `AllStarTab` → `RisingStarsSection`

**Step 5 — `AllStarDayView.tsx`**
- When `state.allStar.risingStarsBracket` exists (4-team format):
  - Replace the single Rising Stars game card with 3 bracket cards: SF1, SF2, Final
  - Each card shows: round label ("SEMIFINAL" / "FINAL"), target score badge ("First to 40" / "First to 25"), teams + scores
  - Show `risingStarsMvp` on the Final card post-game
  - Keep existing `isRisingStars` card for non-4-team formats (backward compat)
- Gids 91001/91002/91099 need `isRisingStars: true` flag so the AllStarDayView Friday section picks them up

**Step 6 — `AllStarHistoryView.tsx`**
- When `savedState.allStar.risingStarsBracket` present: render RS bracket recap (SF results + Final result + MVP)
- Reuse the bracket card pattern from the main ASG multi-game recap (already supports multi-game from PR3)

### GID reservation summary

| GID | Event | Day |
|-----|-------|-----|
| 90000 | RS single game (classic 2-team) | Friday |
| 91001 | RS SF1 (4-team) | Friday |
| 91002 | RS SF2 (4-team) | Friday |
| 91099 | RS Final (4-team, dynamic) | Friday |

### Score-scaling helper (inline in Orchestrator)
```ts
function scaleToTarget(home: number, away: number, target: number): [number, number] {
  const winner = Math.max(home, away);
  const loser  = Math.min(home, away);
  const scaled = Math.round(loser * target / winner);
  return home >= away
    ? [target, Math.min(scaled, target - 1)]
    : [Math.min(scaled, target - 1), target];
}
```

### Not in scope (deferred)
- Round-robin format (all 4 teams play each other, top-2 to Final) — wired via `risingStarsEliminationEndings: false` but sim logic deferred
- Live coach-name customization in Commissioner UI (use legend pool rotation for now)
- Real Elam ending in GameSim engine (GameStructureSection.tsx already notes this as TODO)

---

## QUEUED — All-Star cosmetic polish

Secondary polish, not blocking (satellite event UI surfaces moved to NEW_FEATURES.md):

**SHIPPED (uncommitted):**
- ✓ **AllStarHistoryView multi-game support** — bracket recap (RR records) + badge now render
- ✓ **Calendar tile event-count badge** — shows "{N} games" pill on All-Star Sunday for multi-game formats
- ✓ **Multi-game bracket card team logos** — per-matchup cards now show team logos + W-L records

**Remaining:**
- **Champion box-score MVP highlight in roster view** — currently only the final-game MVP shows; could surface RR-stage standout performances.
- **Voting by team bucket** — currently still by conference; bucket assignment is announce-time only (no fan vote per USA Stars vs Stripes).
- **Captain veto / live-draft UI** — captain pick order is auto-generated by snake; no commissioner-controlled live draft.
- **Pre-existing TS errors in AllStarGameSection / AllStarTab** (`setNumQuarters`, `startOfPossessionMethod`/`possessionPattern` props mismatch) — confirmed pre-existing on master via stash; orthogonal to this work, but worth a quick cleanup pass.

---

## QUEUED — Pick-only trades follow-ups (deferred from Session 29)

Core pick-only + cash plumbing landed in Session 29. Still open:

- **"Better-of" / "worse-of" pick-swap rights** — schema field on `DraftPick` (or a new `PickSwap` join entity), evaluation at draft time.
- **`DraftPick.protection` field** — rendering in the modal + evaluation (e.g. "top-4 protected, conveys in 2028").
- **Trade Finder "picks only" filter chip** — UI toggle to surface only pick-for-pick / pick-for-cash counter-offers.
- **Luxury tax integration** — currently `cashUsedInTrades` is bookkept but not yet rolled into a team's reported tax bill. NBA reality: cash sent counts AGAINST the sender's luxury tax computation.

---

## QUEUED — Full CBA / apron rules audit (EconomyTab.tsx)

Audit of `src/components/commissioner/rules/view/EconomyTab.tsx` against the 2023 NBA CBA. Goal: make the Economy tab a literal CBA control surface — every apron-tied restriction toggleable + tunable.

**What EconomyTab currently exposes for aprons:** `apronsEnabled`, `numberOfAprons`, `firstApronPercentage`, `secondApronPercentage`, plus `roomMleAmount` / `nonTaxpayerMleAmount` / `taxpayerMleAmount` as raw numbers. The aprons exist as numeric thresholds but **none of the CBA restrictions that the apron is supposed to *trigger* are exposed or gated** in trade/MLE/waiver flows.

### Criticality × difficulty matrix

| # | Restriction | Apron | Criticality | Difficulty |
|---|-------------|-------|-------------|------------|
| 1 | Salary-matching ratio tightens (125% → 110% over 1st, 100% over 2nd) | 1st + 2nd | **P0** | 🟢 Easy |
| 2 | MLE tier gating (room / non-tax / tax / none) by team cap state | 1st + 2nd | **P0** | 🟢 Easy |
| 3 | No cash sent in trades when over 2nd apron | 2nd | **P0** | 🟢 Easy |
| 4 | No salary aggregation in trades over 2nd apron | 2nd | **P0** | 🟡 Medium |
| 5 | No sign-and-trade *acquisition* over 1st apron (hard-caps acquirer at 1st) | 1st | **P1** | 🟡 Medium |
| 6 | 7-years-out 1st-round pick frozen over 2nd apron | 2nd | **P1** | 🟢 Easy |
| 7 | No use of TPEs from prior year / aggregation / S&T over 2nd apron | 2nd | **P1** | 🟡 Medium |
| 8 | Mid-season waiver-claim block (player with salary > NT-MLE) over 1st apron | 1st | **P1** | 🟡 Medium |
| 9 | Hard-cap triggers (taxpayer-MLE use, S&T receipt, aggregation, BAE use) | tier-specific | **P1** | 🟡 Medium |
| 10 | 3-of-5 in 2nd apron → 1st-round pick relegated to end of round | 2nd | **P2** | 🔴 Hard |
| 11 | Bi-annual exception (BAE) — already a setting, not gated by apron | 1st blocks BAE | **P2** | 🟢 Easy |
| 12 | Stretch-provision ban over 2nd apron in same trade where TPE is created | 2nd | **P2** | 🟡 Medium |

---

### P0 — Critical (the apron sliders are cosmetic without these)

**1. Apron-tiered salary-matching ratios.**
- *CBA:* 125% + $250K under tax / 110% over 1st apron / **100% (1.0×) over 2nd apron**.
- *Current:* No salary-matching ratio is exposed in `EconomyTab` at all — it's hardcoded in trade-validation logic. Search for the constant in `src/services/trade*` / `src/components/modals/TradeMachineModal.tsx`.
- *Fix:* Add three settings (`tradeMatchingRatioUnder`, `tradeMatchingRatioOver1st`, `tradeMatchingRatioOver2nd`) with NBA defaults 1.25 / 1.10 / 1.00, plumb into the trade validator, key the lookup off the *post-trade* cap state of each side. UI: a 3-row block under the existing apron card.

**2. MLE tier gating.**
- *CBA:* Room teams (under cap) get Room MLE only; non-taxpayer teams get NT-MLE; taxpayer-tier (between aprons) gets only Taxpayer MLE; **2nd-apron teams lose all MLE access**.
- *Current:* All three MLE amounts are inputs, but allocation logic doesn't gate by team's apron state. `AIFreeAgentHandler.ts` Pass 1 picks "the MLE" without tier check.
- *Fix:* In `getMLEAvailability()` (referenced in CLAUDE.md), branch on team payroll vs aprons. EconomyTab UI: under each MLE row, show "Available to: ____ teams" eyebrow.

**3. Cash-in-trade gating.**
- *CBA:* 2nd-apron teams cannot **send** cash. (Receiving still OK.)
- *Current:* Session 29 added `cashUsedInTrades` bookkeeping but no apron gate. TODO line 37 already flags the lux-tax integration miss; this is the same code path.
- *Fix:* In trade-build validator, if sender's projected post-trade salary ≥ 2nd apron, block any positive `cashSent`. UI: add a "Cash Restrictions" toggle row inside the existing **Trade Exceptions** card.

**4. No salary aggregation over 2nd apron.**
- *CBA:* 2nd-apron teams cannot combine 2+ player contracts in a trade to acquire a single player whose incoming salary exceeds either outgoing salary alone.
- *Current:* Trade builder allows arbitrary multi-out / single-in aggregation regardless of cap state.
- *Fix:* In trade validator, when team is over 2nd apron, require either (a) 1-out-1-in matching or (b) every incoming contract individually matches a single outgoing contract within the relevant ratio. UI: toggle inside Trade Exceptions card — `restrictAggregationOver2ndApron`.

---

### P1 — High (real NBA flavor missing)

**5. Sign-and-trade acquisition gate (1st apron).**
- *CBA:* Receiving a player via S&T hard-caps the acquiring team at the 1st apron for the rest of the season. Practically: 1st-apron teams can't do it.
- *Current:* No S&T flag in trade objects. All trades treated identically.
- *Fix:* Add `isSignAndTrade: boolean` to trade payload; commissioner/AI trade builder sets when one side of the trade is a same-day FA signing. Validator: block if acquirer's projected salary ≥ 1st apron. UI: in Trade Exceptions card, new sub-section "Sign-and-Trade".

**6. Pick-freeze 7 years out (2nd apron).**
- *CBA:* While over 2nd apron, the 1st-round pick **7 years in the future** is frozen (un-tradeable).
- *Current:* `tradableDraftPickSeasons` slider (1–7) is global, not apron-gated. Stepien Rule toggle exists but is consecutive-year-only.
- *Fix:* Add `freezePickAt2ndApron: boolean` toggle. When true, the trade validator computes the 7th-year pick at trade time and rejects if the offering team is over 2nd apron. UI: add toggle inside the **Draft Picks** card, right under Stepien.

**7. TPE provenance gating (2nd apron).**
- *CBA:* 2nd-apron teams cannot use TPEs created (a) in prior years, (b) from S&T receipt, or (c) from aggregation.
- *Current:* No `provenance` / `vintage` field on TPE objects (whatever store TPEs live in — find via grep `TradePlayerException` / `traded.*exception`).
- *Fix:* Add `{ vintage: seasonYear, source: 'plain' | 'aggregation' | 'sign-and-trade' }` to the TPE schema; gate use by apron at trade time.

**8. Mid-season waiver-claim block (1st apron).**
- *CBA:* 1st-apron teams cannot claim a player off waivers if that player's pre-waive salary exceeded the NT-MLE.
- *Current:* No waiver-claim flow surface (waivers go straight to FA pool currently per `simulationHandler.ts`). The "Year-Round Regular Season FA" toggle is the closest thing.
- *Fix:* When the waiver-claim flow lands, add this gate. **Defer until waiver claims become a real flow** — currently non-blocking.

**9. Hard-cap triggers.**
- *CBA:* Using the taxpayer MLE / receiving an S&T / aggregating salaries / using BAE all impose a hard cap at the 1st (or 2nd) apron for the season.
- *Current:* Hard cap doesn't exist as a concept. Teams are simply over/under aprons by raw payroll.
- *Fix:* Add per-team `hardCapForSeason: { applied: true, ceiling: <apronAmount>, reason: 'used-tax-mle' | ... }` flag, set when any of the trigger actions fire. Validator: every subsequent signing/trade checks the ceiling. UI: **Hard Cap Triggers** section in EconomyTab listing the four triggers with toggles for which ones are enforced.

---

### P2 — Polish / long-term

**10. 3-of-5 second-apron pick relegation.**
- *CBA:* If a team is over the 2nd apron in 3 of any 5 consecutive seasons, their 1st-round pick that year is moved to the end of the round.
- *Current:* No multi-year apron history is persisted on team objects.
- *Fix:* Add `team.apronHistory: { season, over1st, over2nd }[]` updated each `seasonRollover`. Draft generator checks the rolling 5-year window; if 3+ over-2nd, append `relegatedToEndOfRound: true` on that team's R1 pick. UI: a per-team status badge in `DraftPicks.tsx` and a master toggle in EconomyTab.
- *Hard* because of the persistence work + the draft-order rewrite. Not urgent.

**11. BAE gated by 1st apron.**
- *CBA:* Bi-annual exception cannot be used by teams over the 1st apron.
- *Current:* `biannualEnabled` / `biannualAmount` are inputs but free-for-all.
- *Fix:* In MLE/BAE allocation, gate by 1st-apron status. UI: same eyebrow treatment as MLE tier rows.

**12. Stretch-provision interaction with TPEs.**
- *CBA:* Stretching a contract over the 2nd apron has special rules (cannot create a TPE from the stretched portion, etc.).
- *Current:* `stretchProvisionEnabled` + `stretchProvisionMultiplier` + `stretchedDeadMoneyCapPct` exist as a self-contained block — no apron interaction.
- *Fix:* When a 2nd-apron team waives-and-stretches, suppress TPE generation for that release. Small block of code in waive handler.

---

### Suggested EconomyTab UI restructure

Today the card order is: Finances → Teams → Contracts → Rookies → Draft Picks → Trade Exceptions → Dead Money → RFA → Calendar.

Proposed: split the **Aprons** out of Finances into its own card, and add a new **Apron-Tied Restrictions** card directly underneath it grouping items 1, 2, 4, 6, 9 above. Cash-in-trade (item 3) and S&T (item 5) belong inside the existing Trade Exceptions card. BAE/MLE gating (items 2, 11) collapses into the existing Contracts section as inline eyebrows.

Implementation order recommendation: P0 items (#1–#4) ship together as one block — they share the same "given a team's apron state, what can they do" infrastructure. Then P1 items #5–#7. Defer #8 (waivers don't exist yet), #9 (large refactor), and all P2.

---

## SHIPPED — Pick-only trades (no-player-required swaps) — Session 29 (2026-04-27)

Real-NBA pick swaps and cash considerations now flow through schema, AI, GM modal, summary, history, and season rollover. See CHANGELOG Session 29 for the file-by-file landing list.

---

## BUGS — Open

### Other open

(Session 31, 2026-04-30: Pass 1 snowball fixed via roster-aware preseason cap + GM discipline gates + widened isCampInvite. TX cheat tid-1 fixed. Audit FA filter already shipped.)

(Session 32, 2026-04-30: Date clamp tightened (mid-tier post-Oct 21 → 1yr only, Jan-onwards → 1yr regardless of K2). Trade evaluator now penalizes deals that force >$25M projected dead money via post-trade trim — kills UTA-Markkanen $36M, MIN-Naz Reid $43M, LAC-Kawhi $26M absorption snowballs.)

- **Huerter $18M-from-$5M-contract bug — UNRESOLVED.** Save Feb 1 2026: Kevin Huerter signed LAL Jan 28 for $5M/2yr (TX text confirms), traded LAL→DET→BKN, BKN waived Feb 1 → dead money entry shows `thisYr $18M, remaining $18M, years 1, expOrig 2026`. Dead-money calc inferred entirely from `contract.amount` × yrs (the contractYears fallback at `simulationHandler.ts:1241-1247`), suggesting **his `contractYears` was empty at waive time and `contract.amount` was 18000 (= $18M) with `contract.exp` 2026** — i.e., his pre-LAL contract somehow survived the Jan 28 LAL signing. Hypotheses to test:
  - The AI signing mutation at `simulationHandler.ts:1489-1506` was applied to the right player but a subsequent trade-step overwrite blew it away. Trade `applyTransaction` only changes `tid` (`gameLogic.ts:212`) and `executeAITrade` only changes `tid + yearsWithTeam` (`AITradeHandler.ts:602-606`), so neither should clear contractYears. But `runAIFreeAgencyRound` may have generated TWO signings (dedup at `simulationHandler.ts:1452` keeps the first) — was Huerter signed twice in different passes with different terms?
  - faMarketTicker (K2 ≥ 92 path) uses a different mutation path at `faMarketTicker.ts:268-282` — does Huerter's K2 cross the threshold so he goes through the ticker?
  - **Diagnostic next step:** add a `console.warn` in the AI signing path that logs when `prev.contract.amount` differs from `newContract.amount` by > 50% — captures any path that's writing the wrong amount. Or trace one save in DevTools: pick a recently-signed player, check `player.contract.amount` and `player.contractYears` directly.



### FGA v3 known gaps (Session 28)

- **60+ pt outliers unreachable.** EXPLOSION ceiling caps at `1.15 + ovr/100 × 0.80` ≈ 1.91× for OVR 95. Need separate "VOLUME EXPLOSION" archetype gated on `ins`/`stre`/`tp>85`.
- **Pure 3PT specialist nights (0 2PA).** No archetype produces "100% 3PT shot diet." `shotDietShift` maxes at +0.20. <1% of games.
- **fgaFloor over-volumes ultra-quiet blowout games.** Reaves Nov 11 `1/2, 22 min, +17` — current floor (~9 FGA) prevents this. Could add blowout-aware floor reduction (`lead > 15 && winning → halve floor`).
- **Reduce floor coefficient 0.40 → 0.30?** Would allow 6-7 FGA bench cameos while still floor=10.5 at 35 min. Pending user call.

---

## KNOWLEDGE GAPS — Hardcoded Jun 30 assumptions

Revisit when rollover date becomes dynamic:

- **`constants.ts:381-383` PHASE table** — `[6, 21]` Lottery, `[6, 25]` Draft. Coarse phase-label bucketing only; breaks if playoff rounds push finals into July.
- **`seasonRollover.ts:731-735` `shouldFireRollover`** — hardcodes Jun 30. With extra playoff rounds, finals end July but rollover fires mid-finals.
- **`DraftPickGenerator.ts`** — "Rollover (Jun 30) resets `draftComplete`" comment carries same assumption.

---

## FEATURES — Backlog (low priority)

### PlayerComparison K2 & season overhaul
Enhance `PlayerComparisonView.tsx` to:
- Add season selector at top (defaults to current year, shows all detected seasons like PlayerStatsView)
- Replace manual search modal with `PlayerSelectorGrid` for all selectable players (non-retired + draft prospects with tid=-2)
- Show K2 attributes breakdown (6 categories: OS, AT, IS, PL, DF, RB) with collapsible sub-attributes using `calculateK2`, `K2_CATS`, etc. from `convert2kAttributes`
- Add season-specific stats comparison pane below K2 (draw from player.stats[] for that season)
- Fix header layout and copy to match new flow

### Dual-affiliation academy prospects (Luka-Real-Madrid model)
Pre-assign `draft.year` at generation for youth academy players so they're simultaneously at their youth club AND in a future draft class. Real Luka at 16 was playing Real Madrid senior AND everyone knew he was declaring 2018.

Implementation:
- At generateProspect for academy youth: `player.draft.year = currentYear + (19 - age)`
- No Jun 30 status flip needed (currently Prompt C auto-declares at 19)
- Rollover just checks `draft.year === currentYear` → move to draft pool that year
- DraftScouting can surface prospects 1-4 years out with their club attached
- Enables scouting mechanic expansion (commit scouting budget to follow a prospect's development years ahead)

Preserves Prompt C's `<19` progression freeze. Replaces the status-flip mechanism with a pre-committed draft year.

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
