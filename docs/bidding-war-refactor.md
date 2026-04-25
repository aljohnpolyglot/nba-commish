# Bidding War Refactor — Design Doc

**Status:** design-only, first pass. Do not implement until the Open Questions are resolved.
**Scope:** NBA free agency — external leagues untouched.
**Updated:** 2026-04-25 — reflects Session 27 (Prompt I) changes that landed mid-season cooldown, length cap, resolution stagger, and bid decay.

---

## 0. What Session 27 already shipped (and what this refactor builds on)

Prompt I (Session 27) added defensive lifecycle controls inside the *existing*
single-round market design. Any refactor here must preserve these or replace
them deliberately:

- **Late-season open gate** (`faMarketTicker.ts:25-50, 282-340`) — after Oct 21, only K2 ≥ 92 superstars can open new markets. Pre-refactor this was unconditional. The PR1 threshold drop (K2 ≥ 80 → ≥ 70) needs to layer this gate per *date phase*, not per market.
- **Mid-season length cap** — Oct 22+ contracts cap at 2yr, post-deadline at 1yr (when `postDeadlineMultiYearContracts` is OFF — rulebook respected via `dateUtils.canSignMultiYear`). PR2 escalation rounds inherit the same cap.
- **Resolution stagger** (`MAX_MARKETS_RESOLVING_PER_DAY = 10`) — when more than 10 markets resolve within +3 days, push new opens further out. Prevents the offseason-end signing-burst that PR1 would otherwise amplify (lower threshold = more open markets = more burst risk).
- **Mid-season bid decay** (`freeAgencyBidding.ts:241-262`) — `generateAIBids` salary pct multiplier by date: late-Oct/Nov/Dec ×0.55, Jan ×0.35, Feb-Jun ×0.20. PR3's resolution formula upgrade should preserve this date-aware pricing OR move the decay into the `marketValue` baseline of `resolvePlayerDecision`.

**Implication for the refactor**: the "mid-season market is broken" problem this doc was originally framed around (rebuilders never seeing stars, mid-tier donut hole) was largely a *symptom of inflated talent post-Prompt-M*. Post-M + post-I, the FA pool is realistic and the existing pipeline mostly works. PR1-3 are still valuable for parallel-bidding UX, but the urgency dropped — promote PR1/PR2 to "polish" rather than "fix."

---

## 1. Current state

### 1a. Market lifecycle (today)

Markets live in `state.faBidding.markets: FreeAgentMarket[]` (`freeAgencyBidding.ts:36-42`). Two entry points:

- **AI bids** open via `tickFAMarkets` daily during the FA window, called once per sim day from `simulationHandler.ts:843`.
- **User bids** open via the `SUBMIT_FA_BID` reducer (`GameContext.tsx:412-467`), which lazily creates a market if none exists yet with a hardcoded 4-day window.

**Open gate** (`faMarketTicker.ts:25-50, 283-340`):
```
MARKET_K2_THRESHOLD            = 80
LATE_SEASON_K2_THRESHOLD       = 92    // post-Oct 21 (Session 27)
MAX_NEW_MARKETS_PER_DAY        = 6     // sorted by K2 desc, top 6 unassigned FAs
MAX_MARKETS_RESOLVING_PER_DAY  = 10    // stagger guard (Session 27)
```
Plus `isPostPreseason(stateDate)` helper drives the K2 floor + length cap (`maxYearsThisTick`: pre-Oct 21 = ∞, post-Oct 21 = 2, post-deadline + setting OFF = 1).

**Bid generation** (`freeAgencyBidding.ts:187-285`):
- Eligibility filter: team must have cap space ≥ minSalary OR payroll < luxury tax (MLE-eligible) — `226-223`.
- Top `maxBids*2 = 6` candidates ranked by `teamDesirability` — `224-227`.
- Salary = `cap * pct(K2 tier)` with random jitter (`232-240`), scaled by GM spending attribute (`249-251`), clamped to cap/MLE room (`253-264`). Fallbacks: take MLE if over cap + under tax, else partial cap, else skip.
- **Date decay** (Session 27, `241-262`): salary pct × 0.55 (late Oct + Nov + Dec) | × 0.35 (Jan) | × 0.20 (Feb-Jun). Applied AFTER tier + desirability multipliers, BEFORE GM spending clamp.
- Years: K2 ≥ 85 → 2–4 yr; K2 75–84 → 1–3 yr; else 1–2 yr (`265`). Subject to `maxYearsThisTick` cap from `tickFAMarkets`.
- Player option: only on K2 ≥ 88 and years ≥ 3 (`266`).
- Decision window: `state.day + 3..5` (`279`). Market `decidesOnDay = max(bid.expiresDay)` + stagger overflow days (`faMarketTicker.ts:309-321`).

**Resolution** (`freeAgencyBidding.ts:291-335`): weighted sum
```
salary 60% + desirability 25% + years 10% + option 5% + teamHistoryBonus
```
with `teamHistoryBonus` = continuity (1.5/yr, +6 if same team, cap 10) + championship (6/title, cap 18) from `getBidTeamHistory` (`106-143`). Highest score wins; ties unbroken.

**Cleanup** inside `tickFAMarkets` after applying mutations:
- `221-256` — withdraw bids from teams that committed enough new payroll this tick to bust cap+MLE.
- `258-274` — close LOYAL markets where prior team isn't bidding (gate at `43-54`).

**Close/apply**: winner gets `tid`, `contract`, `contractYears[]` rebuilt with 5% escalator (`faMarketTicker.ts:123-132`); `joinedNewTeam` resets `yearsWithTeam: 0, hasBirdRights: false` (`143`). News, Shams post (K2 ≥ 78 only — `192`), `HistoryEntry` with `playerIds` (`168`, per Session 25 Prompt D), and a GM toast if the market had a user bid (`153-163`).

### 1b. Sequential pipeline (today)

`runAIFreeAgencyRound` (`AIFreeAgentHandler.ts:178`) runs on `faFrequency` days or whenever a team drops below `minPlayersPerTeam` (`simulationHandler.ts:882`). It skips players in active markets via `marketPendingIds` (`AIFreeAgentHandler.ts:189-196`).

Team order: `state.teams` sorted by wins desc, user team excluded (`199-201`).

```
K2 ≥ 80 FA ──► faMarketTicker (parallel-ish bids, multi-day resolve)
                    │
                    └─ skipped in runAIFreeAgencyRound via marketPendingIds
K2 < 80 FA ──► runAIFreeAgencyRound
                    │
                    ├─ Pass 1: best-fit fill loop, cap+MLE, wins-desc team order   (246-313)
                    ├─ Pass 2: two-way, OVR ≤ 60, $625k, 1yr, before fill          (326-376)
                    ├─ Pass 3: non-guaranteed camp, Jul–Oct 21 only, 60% of market (378-417)
                    ├─ Pass 4: min-roster fill to 15, best-OVR-then-cheapest       (419-597)
                    │          inner-loop min-exception fallback                   (543-556)
                    └─ Pass 5: min-payroll floor, needs open slots                 (599-668)
```

**Pool shrinkage** in Pass 1: `signPlayer` deletes the FA from the working `pool` (`243`), so by team #29 every cap-rich team has already scooped their best-fit. Pass 4 sees a picked-over pool.

**LOYAL gate** (`isLoyalBlocked`, `46-63`) applies in all five passes + `runAIMleUpgradeSwaps`.

### 1c. User-vs-AI bidding (today)

- `SigningModal` has an **"OFFERS" tab** (`SigningModal.tsx:64`) that renders current market bids with a normalized offer-strength bar using `computeOfferStrength` (`freeAgencyBidding.ts:342-368`, rendered at `SigningModal.tsx:1541-1543`).
- User bid mode activates when the caller wires `onSubmitBid`, user is in GM mode, player is FA, and market exists OR `isPeakFA` (`SigningModal.tsx:347`). Submit posts a competing bid; resolution is owned by the ticker.
- Only one active user bid per player (`GameContext.tsx:447-453` — filter out prior user bid, append new).
- Resolution banners (`SigningModal.tsx:1613-1627`): accepted ✓ or outbid ✗ with the winner's team.

### 1d. Known gaps

- **Bidding-war pipeline split** — K2 ≥ 80 gets markets (max 6/day); K2 70–79 rotation players go silently through `runAIFreeAgencyRound`. Mid-tier FAs never see multiple suitors.
- **Throttle** — 6 new markets/day means ~300+ K2 70+ FAs can't all use the ticker even if the threshold drops. CLAUDE.md flags this explicitly.
- **Pool shrinkage** — Pass 1's wins-desc sort + in-place pool mutation means rebuilders never get a crack at stars.
- **Pass 4 "last-resort min-deal"** signs the *lowest-OVR* available (`AIFreeAgentHandler.ts:547`) — dumpster mode, not market.
- **Hardcoded economy** in `faMarketTicker.ts:226-228` — `luxTax = cap × 1.18`, `mleUSD = cap × 0.085` instead of `getCapThresholds()` / `getMLEAvailability()` (also in CLAUDE.md "Known unfixed").
- **No escalation** — AI bids are fire-and-forget; once placed, a bidder never raises to stay in it.
- **No backwards-compat** — existing `faBidding.markets` entries carry `decidesOnDay`, `bids`, `resolved`; nothing else. A refactor that adds fields needs a LOAD_GAME migration (same pattern as Session 25 `'Free Agent'` cleanup).

---

## 2. Proposed architecture

### 2a. Invariant shift

Every FA with K2 ≥ 70 opens a market. Pass 1 of `runAIFreeAgencyRound` becomes **Bird Rights re-sign only** (Prompt I Fix #1). Passes 2, 3, 5 are unchanged. Pass 4 is now a post-market mop-up that only considers K2 < 70 FAs plus any K2 ≥ 70 whose market closed with zero accepted bids.

```
FA pool
  │
  ├─ K2 ≥ 70  ────► faMarketTicker (parallel markets, staged)
  │                     │
  │                     ├─ unresolved → Pass 4 mop-up after market window
  │                     └─ resolved   → player signed, market closed
  │
  └─ K2 < 70  ────► Pass 4 (roster fill, min-exception)

Pass 1 (Bird Rights re-sign only) runs BEFORE market open on Jul 1.
Pass 2 (two-way), Pass 3 (NG), Pass 5 (floor) unchanged.
```

### 2b. Market lifecycle — staged 5-day window

```
Day 0: Jul 1 (or the day player becomes FA mid-season)
       → open market, invite teams, collect Round 1 bids
Day 1: Round 1 closes, bids visible to their authors (sealed to rivals)
Day 2: Round 2 — teams may escalate (re-bid higher) or hold
Day 3: Round 3 — final escalation window; teams still in it get one last raise
Day 4: Resolution day — winner selected, market closed

Shorter windows for role players (K2 70-77): 3 days total (open, escalate, resolve).
Longer for superstars (K2 ≥ 90): 7 days (gives marquee free-agency narrative room).
```

Team-interest gathering, escalation re-bids, and resolution all live in `tickFAMarkets`. No multi-module dispatch.

### 2c. Stagger vs. flood on Jul 1

Open markets in waves to avoid a 300-market burst blocking a single tick: seeded by `seededRandom(market_${playerId}_${currentYear})` buckets across Jul 1–Jul 3. Stars (K2 ≥ 90) always open Jul 1. Midseason FAs (waiver, option decline, trade-out) open immediately.

---

## 3. Data structures

Existing shape (`freeAgencyBidding.ts:36-42`) extends to:

```ts
interface FreeAgentMarket {
  playerId: string;
  playerName: string;
  openedOnDay: number;          // NEW: tie for calculating stage
  decidesOnDay: number;
  stageDays: number;            // NEW: 3 | 5 | 7 depending on tier
  bids: FreeAgentBid[];         // bid versions appended, not replaced
  resolved: boolean;
  unsignedReason?: 'no_bidders' | 'loyal_block' | 'all_withdrawn';  // NEW
}

interface FreeAgentBid {
  // existing fields unchanged
  round: 1 | 2 | 3;             // NEW: escalation round the bid was placed in
  supersededBy?: string;        // NEW: bid id that raised this one (same team)
}
```

Performance notes:
- Markets indexed by `playerId`. Daily tick over markets is O(M) where M ≤ open market count (~300 peak, ~30 steady-state).
- Bid evaluation per tick is O(M × T) where T = teams bidding on that market (≤ 30, realistically 3–8). Worst case 300 × 8 = 2400 bid recomputes/day. Fine.
- Store a Map `teamsActive: Map<playerId, Set<teamId>>` computed once per tick to short-circuit "did this team already bid Round N?" lookups.

No new top-level state field — we keep `state.faBidding.markets` and add fields inside the existing shape. LOAD_GAME migration fills defaults for saves pre-refactor.

---

## 4. Resolution formula

**Score per active bid** at resolution:

```
baseScore   = (salaryUSD * years) / marketValueTotal  × 60     // $ dominates
desScore    = teamDesirability(team, player)           × 0.25
yearsBonus  = min(10, years * 2)
optionBonus = +5 (PLAYER), −2 (TEAM), 0 (NONE)
historyBonus = getBidTeamHistory().totalBonus                  // unchanged
legacyMult  = 1.15 if team has Bird Rights with player else 1.0
championshipMult = 1.05 if contender (topThreeAvgK2 ≥ 88)
                OR  1.05 if team.pop ≥ 7 (big market)
                capped at 1.08 if both
moodMult    = playerMoodForTeam(player, team, state)            // 0..2, reused from AIFreeAgentHandler.ts:67-89
```

**Final**: `raw = (baseScore + desScore + yearsBonus + optionBonus + historyBonus) × legacyMult × championshipMult × moodMult`.

**Tie-break**: `seededRandom(`market_${playerId}_${currentYear}`)`. Bird Rights first if one bidder has them and another doesn't — this runs BEFORE RNG.

**LOYAL override** (unchanged): if player has `LOYAL` + age ≥ 30 + 3+ YOS and prior team has a bid, only prior team's bid is considered. If prior team absent, market closes unsigned (`faMarketTicker.ts:258-274`).

**Cap-space recheck at resolution**: a bid can turn stale if the team spent their cap on someone else mid-window. `tickFAMarkets.1b` (`221-256`) already handles this — extend it to run every day, not just on signings, to kill truly phantom bids.

---

## 5. Edge cases

| # | Case | Handling |
|---|------|----------|
| 1 | Zero bids collected | Market closes `resolved: true, unsignedReason: 'no_bidders'`. Player enters Pass 4 mop-up pool next sim day. |
| 2 | All bids withdrawn (cap exhaustion) | Same as #1, `unsignedReason: 'all_withdrawn'`. |
| 3 | LOYAL with no prior-team bid | `unsignedReason: 'loyal_block'`. Player stays FA, retries next Jul 1 or retires (Oct 1 hook, Session 25). |
| 4 | Player waived mid-market | Market is on a FA. Waive creates a FA — if one already has a market open, append rather than create. Tracked by `playerId` uniqueness. |
| 5 | Trade during market window | Markets live on `playerId`, not team. A sign-and-trade is out of scope; if player gets traded between teams while in a market, the market closes `resolved: true` with no signing (the bids referenced old cap states). |
| 6 | User quits/GM loses connection | SUBMIT_FA_BID has already written to state; resolution runs on sim tick whether or not user is attending. Their last submitted bid stands. Toast queues via `pendingFAToasts` (`simulationHandler.ts:869-874`) already in place. |
| 7 | Cap-space mismatch at resolution | Recheck on resolution day: if team has Bird Rights, bid stands. If MLE-eligible and bid ≤ MLE, bid stands. Otherwise mark that bid withdrawn and re-score from remaining actives. |
| 8 | Star retires mid-market | Retirement fires from `retirementChecker.ts`. If player status becomes 'Retired' while market is open, resolution loop at `faMarketTicker.ts:100-102` already closes the market as resolved with no signing. Same path covers death. |
| 9 | User submits after resolution | SUBMIT_FA_BID should fail if market `resolved === true`. Currently it appends silently. Add guard. |
| 10 | Player already signed via Bird Rights (Pass 1 now) | Pass 1 runs BEFORE Jul 1 market opens. `isFreeAgent` check at market-open time (`faMarketTicker.ts:284`) already excludes signed players. |

---

## 6. GM / Commish UX

### 6a. GM mode

- **Shortlist** surfaced in Signings tab: AI auto-queues K2 70+ FAs matching user's roster need (positional gap × budget). User can raise/lower bid, drop, add off-shortlist target.
- **SigningModal OFFERS tab** (`SigningModal.tsx:1516-1634`) is the existing bidding UI. Extend to show Round column and stage label ("Round 2 — escalation window open"). Keep normalized offer-strength bar (`computeOfferStrength`, unchanged formula).
- **Resolution toast** via existing `pendingFAToasts` pipeline (`simulationHandler.ts:869-874`) with the accept/outbid banners already implemented.
- **Cap enforcement identical to AI**: user can't submit a bid that exceeds their cap+MLE room at submission time. `computeContractOffer` pricing unchanged — this is about validation, not offer generation. Error message at modal submit: "This offer exceeds your cap by $X — waive or trade first."

### 6b. Commissioner mode

- No personal bidding (`gameMode === 'gm'` gates the `onSubmitBid` wiring in `SigningModal.tsx:347`). Already correct.
- League-wide market activity: daily news items per notable resolution (already emitted at `faMarketTicker.ts:180-188`). For commissioner, add a "live markets" news strand on escalation days summarizing top 3 most-contested markets.

### 6c. Narrative emission

One Shams tweet per K2 ≥ 78 resolution (`faMarketTicker.ts:192-218`, unchanged). Suppress mid-window escalation tweets by default to avoid feed noise — opt-in setting.

---

## 7. Tradeoff decisions

- **T1. Market duration**: variable (3/5/7 days by tier). Role players don't deserve 5 days of waiting; stars need room for narrative.
- **T2. Single vs escalation**: escalation (up to 3 rounds). Real NBA has multiple suitor rounds; single-round markets look inert when user isn't bidding.
- **T3. Information asymmetry**: AI teams bid blind (sealed); user sees all competing bids via the OFFERS tab. Asymmetric by design — real NBA is nominally blind but GM sim UX demands visibility. Already how it works; preserve.
- **T4. User cap enforcement**: enforced same as AI. See 6a.
- **T5. Shams frequency**: one per K2 ≥ 78 resolution; optional escalation tweets off by default.
- **T6. Save migration**: reset open markets on first load post-refactor. Preserving mid-flight markets with new schema risks stale bids at wrong rounds. Closed markets stay historical.

---

## 8. Migration plan (PR chain)

Each PR is independently shippable and reversible.

**PR1 — Threshold lower: K2 ≥ 80 → K2 ≥ 70**
- *Change*: `MARKET_K2_THRESHOLD = 70` (`faMarketTicker.ts:25`). Raise `MAX_NEW_MARKETS_PER_DAY` to 30 for Jul 1–3, revert to 6 after.
- *Also*: replace hardcoded `luxTax / mleUSD` in `faMarketTicker.ts:226-228` with `getCapThresholds()` + `getMLEAvailability()`.
- *Note (Session 27)*: with the threshold drop, `MAX_MARKETS_RESOLVING_PER_DAY = 10` will start firing the stagger overflow logic regularly during Jul 1-3. That's correct behavior — markets queue across days instead of dumping on one resolution day. May need to bump to 20 for the offseason burst window.
- *Accept*: audit a Jul 1 sim — K2 70–79 FAs have markets; rebuilders get at least one offer on 10+ stars.
- *Rollback*: revert constant.

**PR2 — Parallel bid collection with escalation rounds**
- *Change*: add `round`, `openedOnDay`, `stageDays` to market/bid schemas. Daily tick runs Round 2/3 passes: teams with active bids evaluate whether they're behind and up their offer (bounded by cap + spending attribute + maxSalary).
- *Accept*: a K2 88 FA opened Jul 1 collects ≥ 3 bids from ≥ 2 teams with escalation visible in OFFERS tab.
- *Rollback*: gate via feature flag.

**PR3 — Resolution formula upgrade**
- *Change*: `resolvePlayerDecision` (`freeAgencyBidding.ts:291-335`) gains `legacyMult`, `championshipMult`, `moodMult`; LOYAL and Bird-Rights tiebreak applied before RNG tie-break. `computeContractOffer` unchanged.
- *Note (Session 27)*: the date-decay multiplier currently lives in `generateAIBids` (the bid-creation path). When `resolvePlayerDecision` recomputes `marketValue` for score normalization (line 308), it does NOT apply the same decay — so a December bid scored against a full-cap-pct baseline reads as a "low offer" even when it's correctly sized for the season phase. PR3 should mirror the date-decay table in `marketValue` computation OR migrate the decay into `resolvePlayerDecision`.
- *Accept*: deterministic unit test on 3 hand-crafted markets — prior-team bid at ≤ 10% discount wins, big market wins at tie.
- *Rollback*: feature flag swaps old/new resolver.

**PR4 — Gut the sequential pipeline**
- *Change*: Pass 1 → Bird Rights re-sign only (`runAIFreeAgencyRound`, `AIFreeAgentHandler.ts:246-313`). Pass 4 candidate filter restricted to `K2 < 70 || market-unsigned`. Passes 2/3/5 unchanged.
- *Accept*: after one full FA cycle, every team at 15/15; no Pass 4 "last-resort lowest-OVR" logs for K2 70+ FAs.
- *Rollback*: revert Pass 1/4 filters.

**PR5 — GM-UX integration**
- *Change*: Shortlist in Signings tab; stage labels in OFFERS tab; SUBMIT_FA_BID guard vs. resolved markets.
- *Accept*: user can raise a bid during escalation; stale markets refuse new bids.
- *Rollback*: UI-only revert.

**PR6 — Save migration**
- *Change*: LOAD_GAME migration drops pre-refactor open markets, keeps resolved. Add defaults for new fields.
- *Accept*: old save loads clean, no console errors; first Jul 1 after load rebuilds markets from scratch.
- *Rollback*: migration is forward-only — tag the save version so a user on PR6 can't reopen on PR5 without a re-roll.

---

## 9. Open questions for user — RESOLVED 2026-04-25 (except #8)

1. **Stagger vs flood on Jul 1** → ✅ **Stagger across Jul 1–3.** Seeded buckets by `playerId`. K2 ≥ 90 always opens Jul 1.
2. **Escalation rounds** → ✅ **3 rounds.**
3. **Tie-break (no Bird Rights)** → ✅ **Seeded random** via `seededRandom('market_${playerId}_${currentYear}')`.
4. **Market commitments (retract vs escalate)** → ✅ **Escalate-only** in Round 2/3. Bids can still be auto-invalidated by daily cap-recheck (Edge case #7) — covers the salary-dump-mid-market scenario.
5. **User shortlist auto-queue opt-in** → ✅ **ON by default**, with a Settings toggle to disable.
6. **Shortlist size cap** → ✅ **15.** Roughly an offseason realistic target list.
7. **Escalation visibility to AI** → ✅ **Sealed.** Team B re-evaluates based on market value delta, not the visible Round-1 Team-A bid.
8. **Shams escalation tweets** → 🔶 **Deferred** — keep current Shams firing on resolution only (no escalation tweets) until user revisits. Re-open this question when narrative density needs tuning post-PR2.

---

*Cite check*: every factual claim about current behavior carries a `file:line` reference. Every proposed change is a delta on a cited location. No code in this doc — implementation follows Open-Questions answers.
