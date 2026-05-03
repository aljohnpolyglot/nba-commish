# Offseason 2K-Style Spec — v2 (Detailed Roadmap)

> Updates v1 with: orchestrator audit, modal-vs-fullscreen decision, date-display strategy, lazy-sim escape hatch, codebase reuse map (SigningModal / TeamOffice / TeamTraining / DraftSimulatorView / ToastNotifier).

---

## 0. Executive answer to "is the orchestrator done?"

**Backend orchestrator (Sessions 1-5) = COMPLETE for behavior parity.** All offseason dispatch decisions now flow through `getOffseasonDayPlan(state)`. No subsystem can disagree about "what fires today." `[OSPLAN]` tag covers every callsite.

**But three polish items remain BEFORE we layer the 2K UI on top.** These are the "polishing/cleaning" the user mentioned:

### 0.1  POLISH-A — Validate with a real play-through
**Problem:** Sessions 3-5 swapped authority from inline gates to the plan, but no one has played a save through the swap. We don't actually know if any subsystem disagrees with the plan in practice.
**Fix:** Single play-through from championship → next season opening. Watch console for `[OSPLAN] DRIFT` and `[OSPLAN] SHADOW-DRIFT`. Each warning = a real bug to fix before the UI work begins.
**Effort:** 30 minutes of sim + zero code if no warnings. Hours if warnings appear.

### 0.2  POLISH-B — Promote `state.phase` to a stored field
**Problem:** Today every consumer recomputes `getOffseasonState(state.date, ...)` per render. If the user changes the FA start date in commissioner settings mid-game, ALL date math re-derives from raw bits. Cheap but error-prone — and the future 2K UI will need an `enterPhase()` event hook to trigger transition animations.
**Fix:** Add `state.offseasonPhase: OffseasonPhase` to GameState. Set in reducer when calendar crosses a boundary. `getOffseasonState` becomes a thin wrapper for migrations.
**Effort:** 1 session. Required for Session A below.

### 0.3  POLISH-C — Year-convention audit on `getCurrentOffseasonEffectiveFAStart`
**Problem:** Documented in `memory/project_fa_year_convention_bug.md`. After rollover increments `ls.year`, this helper might compute next year's FA start instead of current. Calendar-year-derived helpers have edge cases.
**Fix:** Add a `lsYear` parameter (optional) to make caller intent explicit. Audit all call sites.
**Effort:** Half session.

**Sequence:** POLISH-A → POLISH-B → POLISH-C → Session A (Foundation). The 2K UI sits on top of all three.

---

## 1. The architectural shift in one diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                     CURRENT (calendar-driven)                       │
│                                                                     │
│  PlayButton  →  Advance day   →  simulationHandler  →  state++      │
│      ▲                                                              │
│      │ user feels stuck, sees July 1, 2, 3 with nothing happening   │
│                                                                     │
│ ─────────────────────────────────────────────────────────────────── │
│                                                                     │
│                     NEW (event-driven, 2K style)                    │
│                                                                     │
│  Header:  "OFFSEASON · Free Agency · Tag 5/13"                      │
│                                                                     │
│  ┌───────────────────────┐   ┌────────────────────────────┐        │
│  │ AUFGABEN sidebar       │   │ Active phase sandbox view   │        │
│  │ ☑ Draft Lottery        │   │ ┌────────────────────────┐ │        │
│  │ ☑ Team/Player Options  │   │ │ Free Agency dashboard  │ │        │
│  │ ☑ Qualifying Offers    │   │ │ Hero card + offer list │ │        │
│  │ ☑ Draft                │   │ │                        │ │        │
│  │ ☑ Rookie Contracts     │   │ │ [Tag beenden]          │ │        │
│  │ ▶ Free Agency          │   │ └────────────────────────┘ │        │
│  │ ☐ Training Camp        │   │                            │        │
│  │ ☐ Advance Season       │   │ Toasts: RFA Match popup    │        │
│  └───────────────────────┘   └────────────────────────────┘        │
│           │                              │                          │
│           └──────────────┬───────────────┘                          │
│                          ▼                                          │
│              getOffseasonDayPlan (Sessions 1-5)                     │
│              ↓                                                       │
│              tickFAMarkets · runAIFA · runBirdRights · rollover     │
└────────────────────────────────────────────────────────────────────┘
```

The orchestrator from S1-5 is the engine. The 2K UI is the dashboard that owns when the engine ticks.

---

## 2. The date-display question — answered

> User: "und das ddatum wird (OFFSEASON SEIN?) oder vllcht nur baer mussen wir dates und rfa wird in einem one sotp show in transaction view als datum.. oder mein idea ist ai teams kann mehr datum haben aber als gm wir haben schon ein possibel datum rfas oder mathcing su machen???"

**Decision: split the calendar into two layers.**

### Layer 1 — "Internal calendar" (engine truth)
- `state.date` keeps ticking exactly as today (`Jul 5, 2026`).
- AI teams sign players on **specific calendar days** for natural news flow.
- TransactionsView, History, news ticker all keep date-stamps.
- Contract math, age, draft year — all use this.

### Layer 2 — "GM-facing calendar" (user UX)
- Header during offseason shows: **`OFFSEASON · [PHASE NAME] · Tag X/13`**
- Raw date hidden behind a tooltip on the badge ("Show real date").
- Phase transitions are the **only** thing the GM has to track.
- All decisions are date-anchored INTERNALLY but presented to the GM as **modals/toasts when relevant**, not "you must decide on day X."

### Why this is the right split
- AI teams getting a multi-day FA negotiation = realism (Mitchell signs Tag 1, Bradley signs Tag 8).
- GM getting a single decision point per RFA = quality of life (Match popup appears when needed, not "go look at the market").
- Transaction log preserves dates so historians (year-end recap, Hall of Fame, contract timelines) all work unchanged.

### Concrete mapping
| Where | Shows | Example |
|---|---|---|
| Top header (offseason) | Phase + Tag counter | `OFFSEASON · FREE AGENCY · TAG 5/13` |
| Top header (regular season) | Calendar date | `Mar 14, 2027` |
| Toast/Modal for RFA Match | "expires in N days" | "Pacers must decide within 3 days" |
| TransactionsView | Calendar date stamps | `Jul 8, 2026 · Lakers sign Caruso` |
| Player history | Calendar date | `Jul 8, 2026 — signed by Lakers, $7M/2yr` |
| Rolling news ticker | Date + headline | `Jul 8 — Caruso signs with Lakers` |

---

## 3. Modal vs full-screen per phase

> User: "und playeroptionend in der game as modals sind"

Right call. Some phases benefit from immersive full-screen treatment, others should fire as modals over the existing game UI so the GM never feels trapped.

| Phase | Modal or Full-Screen | Reason |
|---|---|---|
| Draft Lottery | **Full-screen** (existing) | Cinematic, one-time per year |
| Team/Player Options | **MODAL stack** | Per-player decision, low cognitive load, decide on the fly |
| Qualifying Offers | **MODAL stack** | Same — single yes/no per RFA |
| My Free Agents | **Sidebar list** (read-only) | Just orientation, lives next to roster |
| Draft | **Full-screen** (existing DraftSimulatorView) | Long, multi-pick session |
| Rookie Contracts | **MODAL stack** | One per drafted rookie |
| Free Agency | **Full-screen sandbox** | Long, complex, has its own market view |
| Training Camp | **Full-screen** (existing TrainingCenterView) | Drill assignment is involved |

**Modal stack pattern** for the lightweight phases:
- Phase row in AUFGABEN starts the stack.
- Each player needing a decision opens as a modal.
- After decision: modal closes, next opens automatically.
- "Skip rest" button at top → AI auto-decides remaining + closes phase.
- After last decision: phase row gets checkmark, sidebar advances to next.

---

## 4. The "lazy GM" escape hatch

> User: "die pahse oder diese hardcoded date wird stoppen .aber gleichzeitig kann ein lazysim machen??"

Yes — every phase has TWO entry points:

```
┌──────────────────────────────────────────────────┐
│ [Phase Name]                                      │
│ Description of what this phase does...            │
│                                                   │
│ [ Enter Phase ]    [ Auto-resolve & Skip ]       │
└──────────────────────────────────────────────────┘
```

- **Enter Phase** — opens the sandbox (modal stack or full-screen view), GM makes decisions.
- **Auto-resolve & Skip** — runs the existing AI logic (`seasonRollover` for options/QOs, `autoRunDraft` for draft, `runAIFreeAgencyRound` for FA, etc.) for the user's team too, then advances to next phase.

This is **not new logic** — every AI team already auto-resolves these phases today. The escape hatch just lets the GM tag along with the AI fast-forward.

For users who want a **completely automatic offseason** (e.g. focused on a contending team, doesn't care about the rebuild), there's a single button at the top of the AUFGABEN sidebar:

```
┌──────────────────────────────────────┐
│ [ ⚡ Auto-resolve entire offseason ] │
└──────────────────────────────────────┘
```

Internally this just runs the existing `lazySimRunner` with target = `openingNightStr`. The orchestrator from S1-5 already handles every offseason decision in lazy-sim mode. Zero new code.

---

## 5. Codebase reuse map (what we already have)

### 5.0  `TeamIntelFreeAgency.tsx` (980 lines) — IS the FA dashboard ✅

**Found during audit.** This component already implements ~95% of what v1's spec called "FreeAgencyView (new, ~400 lines)." It lives at `TeamOffice → Team Intel → Free Agency` and ships:

- **Cap Ticker row** — Cap Space / MLE Available / Shortlist Commit / Room After Shortlist (color-coded red/amber/emerald)
- **My Shortlist** panel — up to 15 user-curated FAs, persisted on `tradingBlockStore.faShortlistIds`, survives mode-switch GM ↔ Commissioner
- **Auto-bid All** button — submits competitive bids on every shortlisted FA in one click (handles "beat top by 5%" logic)
- **Per-row Pursue / Bump** buttons — one-click bid submission from shortlist
- **Live Bid Tracker** — every market involving a shortlisted FA OR a market where user has bid; shows top bid + your bid + decision label + moratorium-aware "Resolves after moratorium ({date})" text
- **Top Free Agents drawer** — full sortable table: Name · Team · Pos · Age · K2 · POT · MPG · PTS · REB · AST · PER · **Type (RFA/UFA)** · **Bird** · **Offers count** · Asking · ★ shortlist toggle
- **Tier filters** — All / 90+ / 80-89 / 70-79 / Under 25
- **"Your prior player" highlight** — amber background + left-border for FAs who last played for you (the ones you have Bird Rights on)
- **Moratorium heads-up modal** — first-time FA-window education with "Through moratorium" guidance
- **Click any row** → `quick.openFor(p)` → opens quick-action menu → "Sign FA" → opens `SigningModal` for full negotiation

#### Why the user feels "FA view is buggy / can't sign"
The Sign path exists but is **3 clicks deep**:
1. Click row → opens transient quick-action menu
2. Click "Sign Free Agent" in menu → opens SigningModal
3. Negotiate + Submit

The prominent buttons (Pursue / Bump / Auto-bid All) bypass negotiation by submitting at computed market value. Users wanting custom years/option/salary either don't realize they need to go through quick-actions, or hit the auto-bid path and wonder where the negotiation went.

#### Plan revision: don't build, ELEVATE
- Drop "build new FreeAgencyView" from the build list.
- Promote `TeamIntelFreeAgency` to its own AUFGABEN row.
- Add a prominent **`Negotiate`** button on each table row that opens SigningModal directly, bypassing the quick-action menu.
- Add the **`FREE AGENCY · TAG X/13`** sticky footer to this view during the FA phase.
- The "buggy" feeling disappears once the Negotiate button is right next to ★ Shortlist.

### 5.1  `SigningModal.tsx` (1894 lines) — REUSE 100%

The modal we already use for individual signings. **Already supports the FA negotiation flow** the spec needs.

Key existing capabilities:
- Tabs: `NEGOTIATION` / `MORALE` / `CONTRACT` / `FINANCES` / `OFFERS`
- `onSubmitBid` callback for FA market mode (vs immediate `onSign` for direct deal)
- Cap math live: `getMLEAvailability`, `getCapThresholds`, `getTeamPayrollUSD`
- Bird Rights detection: `hasBirdRights`
- Moratorium gate: `isInMoratorium`
- Mood-driven willingness: `classifyResignIntent`

**Plan:** Use UNCHANGED for FA phase. Open per FA the GM clicks. The FA dashboard wraps it with the offer list, cap header, position counts.

### 5.2  `TeamOfficeView.tsx` (145 lines) — ADD ONE TAB

Already has 8 tabs (`gm` / `coaching` / `depth` / `intel` / `needs` / `trading` / `picks` / `scouting`). Add a 9th: `offseason`, only visible when `state.offseasonPhase !== 'inSeason'`.

The "AUFGABEN sidebar + sandbox" lives inside the new `offseason` tab. TeamOffice is the natural home — it's where the GM already manages everything. No new top-level navigation needed.

### 5.3  `DraftSimulatorView.tsx` (1457 lines) — REUSE 100%

The draft phase = open this view. Already has full draft simulation + commissioner-mode controls + auto-fill for AI teams. Just a `setCurrentView('Draft Board')` from the AUFGABEN row.

### 5.4  `TeamTraining/` (full subsystem) — REUSE 100%

Camp phase = open `TrainingCenterView`. Drills, programs, mentor pairings — all built. Just navigate.

### 5.5  `ToastNotifier.tsx` — `RFAOfferToast` ALREADY INTERACTIVE

Lines 440-485: the `RFAOfferToast` subcomponent has Match/Decline buttons that dispatch `MATCH_RFA_OFFER` / `DECLINE_RFA_OFFER`. **The interactive RFA decision flow is already wired.** We just need to make sure these toasts fire reliably during the FA phase Tag advances.

`pendingOptionToasts` (lines 184-193) — option decisions already emit GM-facing toasts via `season-rollover`. We change the GM-mode branch to **emit the toast BEFORE auto-deciding**, then wait for user input.

### 5.6  EconomyTab settings — read these instead of hardcoding

`commissioner/rules/view/EconomyTab.tsx` exposes 50+ economy toggles, all wired into `state.leagueStats`. The 2K UI MUST read from these instead of hardcoding NBA defaults so commissioner-mode customizations work:

| Phase | Settings to read | Why |
|---|---|---|
| Header / Tag counter | `faStartMonth`, `faStartDay`, `faMoratoriumDays` | FA start date is configurable (could be Jul 6 in a custom save) |
| FA dashboard "ROSTER N/M" | `maxStandardPlayersPerTeam` | Default 15, but commissioner can set 12 or 20 |
| Training Camp roster cap | `maxTrainingCampRoster` (default 21) | Already wired in `AIFreeAgentHandler:595, 1191` |
| RFA Match window | `rfaMatchWindowDays` (default 2) | Already wired in `faMarketTicker:485` |
| RFA auto-decline | `rfaAutoDeclineOver2ndApron` (default true) | Already wired in `faMarketTicker:680` |
| MLE remaining display | `roomMleAmount`, `nonTaxpayerMleAmount`, `taxpayerMleAmount`, `biannualAmount` | Used in cap math + finance dashboard |
| Two-way slots | `maxTwoWayPlayersPerTeam`, `twoWayContractsEnabled` | Toggle + cap on UI |
| 10-day deals (in-season) | `tenDayContractsEnabled` | Hide button in offseason |
| Trade deadline date | `tradeDeadlineMonth/Ordinal/DayOfWeek` | Used by `getTradeDeadlineDate` |
| Stretch provision | `stretchProvisionEnabled`, `stretchProvisionMultiplier` | For waive flow during offseason |
| Dead money guarantee deadline | `ngGuaranteeDeadlineMonth/Day` | NG players' guarantee date |
| Post-signing moratorium | `postSigningMoratoriumEnabled` | Already wired in `tradeValueEngine`, `cbaTradeRules`, `signingMoratorium` |

**Practical rule:** never write `??` defaults for these in 2K UI components. Always go through `state.leagueStats.X` so commissioner saves with custom rules just work.

### 5.7  `AIFreeAgentHandler.ts` (2228 lines) — the 5-pass AI engine

`runAIFreeAgencyRound` runs **once per Tag** in our new model. It already executes a deterministic 5-pass sequence (documented critically in `CLAUDE.md`):

| Pass | What | Order matters because |
|---|---|---|
| 1 | Best-fit signings (cap space + MLE for top FAs) | Allocates premium FAs first |
| 2 | Two-way contracts (≤60 BBGM OVR fringe FAs) | Must run BEFORE Pass 4's salary-ASC sort vacuums them |
| 3 | Non-guaranteed training camp (preseason only Jul 1 – Oct 21) | Slots 16-21 only available in summer |
| 4 | Minimum-roster enforcement (fill to 15-man) | Last-resort min-deal sweep |
| 5 | Minimum-payroll floor (only helps teams with open roster slots) | Final cleanup |

**Tag advance implementation:**
```ts
function advanceFATag(state: GameState): Partial<GameState> {
  // 1. Advance internal calendar by floor(faWindowDays / faTagsTotal)
  const daysPerTag = Math.floor(62 / state.faTagsTotal);  // ~5 days
  // ... advance state.date by daysPerTag, looping per-day so daily ticks fire
  for (let d = 0; d < daysPerTag; d++) {
    state = tickFAMarkets(state);          // resolves due bids
    state = runAIFreeAgencyRound(state);   // 5-pass AI signings (only on legal days)
    if (isFirstPostMoratoriumDay(state)) {
      state = applyBirdRightsResignsPass(state);
    }
  }
  // 2. Increment FA tag counter
  return { ...state, faTagCounter: state.faTagCounter + 1 };
}
```

**No changes to AIFreeAgentHandler internals required.** The 5-pass logic stays identical — we only change WHEN it fires (Tag-driven instead of day-driven).

### 5.8  Mid-season extensions — SEPARATE SYSTEM

> User: "btw die andere.. mathc other extend..."

Important clarification: **mid-season contract extensions are NOT part of the offseason flow.** They live in `simulationHandler.ts:876-960` and `runAIMidSeasonExtensions`. They fire **Oct → Feb** for players whose contract expires the upcoming summer.

For the GM, mid-season extension offers should appear as toasts during regular season (already do, via `pendingOptionToasts` extended). Don't conflate with offseason re-signing.

| When | What | Where |
|---|---|---|
| Oct–Feb | Mid-season extensions | `simulationHandler.runAIMidSeasonExtensions` (existing) |
| Jun 30 (rollover) | Player option / Team option decisions | `seasonRollover.ts §0a/§0b` (existing) |
| Jul 1–13 (FA tags) | Bird Rights re-signs + open market | `applyBirdRightsResignsPass` + FA market (existing) |

---

## 6. Per-phase implementation detail

### 6.1  Draft Lottery (existing, just wire)

**Status:** ✅ Done. `DraftLotteryView` already triggered by `useDraftEventGate`.
**Change:** AUFGABEN row routes to the existing view. Auto-checkmark when `state.draftLotteryResult` is set.

### 6.2  Team/Player Options (MODAL stack — NEW UI, existing logic)

**Existing logic** (`seasonRollover.ts §0a/§0b`):
- AI auto-decides player options (opt in if current pay ≥ 90% market)
- AI auto-decides team options (exercise if player OVR ≥ 50 BBGM)
- GM teams get the same auto-treatment today, **emits toast retroactively**

**New for GM:**
- Before rollover fires for the GM team's expiring players, raise a **decision modal stack**.
- One modal per player option / team option. Modal shows:
  - Hero card (portrait, age, position, OVR, mood)
  - Current contract terms
  - "Accept" / "Decline" with dollar comparison
  - Player option: "Player wants X · Market would pay Y" → auto-recommend
  - Team option: "Player worth $X this year · Cap impact Y" → cap impact preview
- "Skip rest" button → AI defaults applied to remaining

**State changes:**
```ts
// New ephemeral state slice (cleared after phase completes)
state.pendingOfferDecisions: {
  playerId: string;
  type: 'player-option' | 'team-option';
  recommendedAction: 'accept' | 'decline';
  reason: string;
}[]
```

**Component:** `OffseasonOptionsModalStack.tsx` (new, ~200 lines).

### 6.3  Qualifying Offers (MODAL stack)

**Existing logic:** None for QO submission flow yet. RFA flag (`restrictedFA`) exists on contract.

**New for GM:**
- Modal stack of all RFA-eligible expiring rookies on user team.
- Each shows: hero card, projected QO amount (from `getQualifyingOfferAmount` — to be added), projected market value.
- "Submit QO" / "Skip (let walk as UFA)" toggle.
- Default: submit for any K2 ≥ 70 player.

**Functions to add:**
```ts
function isRFAEligible(p: NBAPlayer, ls: LeagueStats): boolean {
  // Rookie scale contract just expired + restrictedFAEligibilityYears not exceeded
}
function getQualifyingOfferAmount(p: NBAPlayer, ls: LeagueStats): number {
  // Per CBA: scale based on draft slot for first-rounders, league min for others
}
```

**Component:** `OffseasonQOModalStack.tsx` (~150 lines).

### 6.4  My Free Agents (sidebar info — read-only)

**No decisions, just visibility.** Lives as a sub-section of the AUFGABEN sandbox or the existing TeamOffice "Team Intel" tab.

Status calculation:
```ts
function expiringFAStatus(p: NBAPlayer): 'expired' | 'will-not' | 'test-market' {
  if ((p.mood?.score ?? 50) < 30) return 'will-not';
  if ((p.mood?.competitive ?? 0) > 70 && (p.mood?.score ?? 50) < 60) return 'test-market';
  return 'expired';
}
```

**Component:** `OffseasonMyFAsView.tsx` (~80 lines, read-only).

### 6.5  Draft (existing, just wire)

**Status:** ✅ Done.
**Change:** AUFGABEN row routes to `DraftSimulatorView`. Auto-checkmark when `state.draftComplete`.

### 6.6  Rookie Contracts (MODAL stack)

**Existing logic:** Auto-seeded by `autoRunDraft` and `computeRookieSalaryUSD`. Currently no GM decision point.

**New for GM:**
- After draft completes, modal stack opens for each user-team rookie.
- Each shows: hero card, draft slot, scale amount (years/$), team option years.
- Default action: Accept. "Decline" releases rookie to UFA pool (rare, but possible per real CBA).

**Component:** `OffseasonRookieContractsModalStack.tsx` (~120 lines).

### 6.7  Free Agency (FULL-SCREEN sandbox — the heart of this refactor)

#### 6.7a  FA Dashboard (`FreeAgencyView.tsx` — new, ~400 lines)

```
┌─ TEAM OFFICE / OFFSEASON / FREE AGENCY ─────────────────────────┐
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ PHILADELPHIA 76ERS                                        │    │
│ │                                                            │    │
│ │   ROSTER 8/15    CAP $33.5M     MLE LEFT $2.79M           │    │
│ │                                                            │    │
│ │   PG 2/2  SG 2/2  SF 1/2  PF 2/2  C 1/2                   │    │
│ └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│ ┌─ Available Free Agents ────────────┐  ┌─ Your Activity ────┐  │
│ │ Filter: [UFA] [RFA] [All Pos]       │  │ ACCEPTED OFFERS    │  │
│ │ Sort: [Interest] [OVR] [Asking]     │  │                     │  │
│ │                                      │  │ E.Turner           │  │
│ │ P.George   RFA  91  $20M/4yr  1bid  │  │ 4yr / $19.6M  Match│  │
│ │ D.Cousins  RFA  84  $14M/4yr  2bid  │  │                     │  │
│ │ A.Bradley  RFA  81  $5M/3yr   1bid  │  │ A.Bradley          │  │
│ │ M.Gortat   UFA  78  $7M/2yr   0bid  │  │ 3yr / $17.5M Vertrag│  │
│ │ C.Butler   UFA  78  $4M/2yr   1bid  │  │                     │  │
│ │ ... more rows                       │  │ PENDING DECISIONS  │  │
│ │                                      │  │ — none —            │  │
│ │ [click row → opens SigningModal]    │  │                     │  │
│ └─────────────────────────────────────┘  └────────────────────┘  │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │  FREE AGENCY · TAG 5/13            [⏭ Tag beenden]         │    │
│ └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**Tag system:**
- `state.faTagCounter: number` (1..13)
- `state.faTagsTotal: number` (default 13, configurable)
- "Tag beenden" advances calendar by `floor(62 / 13) ≈ 5 days` and runs:
  - `tickFAMarkets` (resolves due bids)
  - `runAIFreeAgencyRound` (AI signing wave)
  - `applyBirdRightsResignsPass` if first post-moratorium tag
  - All RFA Match popups fire as toasts

**Skip moratorium auto-magically:**
- Tag 1 starts on `moratoriumEndStr` (the first legal signing day, July 7 by default).
- Internally we skip to that date when entering the FA phase.
- The GM never sees "moratorium active, signings disabled."

**Click an FA row** → opens existing `SigningModal` with `onSubmitBid` wired. The modal posts a bid to the FA market; result resolves on a future Tag.

#### 6.7b  RFA Match flow (existing toast, just plumbed correctly)

When user submits an offer to another team's RFA:
1. `tickFAMarkets` on next Tag advance triggers `pendingRFAOfferSheets` for the prior team.
2. AI prior team evaluates `canMatchOfferSheet()` (NEW check, see §7 below).
3. If can match → `MATCH_RFA_OFFER` → user gets `rfa-matched` toast on Tag complete.
4. If can't match → `DECLINE_RFA_OFFER` → user gets `rfa-not-matched` toast on Tag complete.

**When the user's RFA gets an offer from another team:**
- `pendingRFAOfferSheets` populated with the offer.
- Existing `RFAOfferToast` (already in `ToastNotifier:440-485`) fires with Match/Decline buttons.
- User clicks Match → contract converts to home team's books (Bird Rights).
- User clicks Decline → player walks.

**Already wired**, just needs the FA phase to be the trigger.

### 6.8  Training Camp (existing, just wire)

**Status:** ✅ Done. `TrainingCenterView` is full-featured.
**Change:** AUFGABEN row navigates. "Skip" auto-assigns balanced drills.

### 6.9  Advance Season

Final row. Confirms all phases done → exits offseason mode → back to regular `Calendar` view → opening night.

---

## 7. Salary-matching gate for RFA Match — ALREADY IMPLEMENTED ✅

> Original v2 plan: "build `canMatchOfferSheet()` from scratch."
> **Reality after reading EconomyTab + faMarketTicker.ts: it already exists.**

The `EconomyTab.tsx` exposes three RFA-related toggles, and they're all wired:

| Setting | EconomyTab line | Wiring location | Default |
|---|---|---|---|
| `rfaMatchingEnabled` | 173 | `utils/ruleFlags.ts:15` | true |
| `rfaMatchWindowDays` | 175 | `faMarketTicker.ts:485` | 2 |
| `rfaAutoDeclineOver2ndApron` | 177 | `faMarketTicker.ts:680, 714` | true |

The 2nd-apron auto-decline gate is fully implemented (`faMarketTicker.ts:710-726`):

```ts
// AI match decision
const overSecondApron = rfaThresholds.secondApron != null
  && priorPayroll >= rfaThresholds.secondApron;
if (autoDeclineOver2nd && overSecondApron) {
  willMatch = false;        // can't match — would breach 2nd apron
} else {
  // Seeded RNG — same player + season → same outcome on replay
  const matchPct = k2 >= 85 ? 0.85 : k2 >= 80 ? 0.70 : 0.55;
  willMatch = roll < matchPct;
}
```

**User-team RFA flow is also wired** (`faMarketTicker.ts:698`):
```ts
// User prior team — wait for explicit action
// (handled in GameContext reducer via MATCH_RFA_OFFER / DECLINE_RFA_OFFER)
if (priorTid === userTeamIdRFA) continue;
```

This means when the user is the prior team, the market just sits in `pendingMatch` state until the `RFAOfferToast` (already in `ToastNotifier:440-485`) dispatches one of the actions. The whole interactive Match flow is **already end-to-end functional** — we just have to make sure the FA dashboard surfaces these pending markets visibly.

### What this actually means for the spec
- **No new files.** Drop `cbaRFAMatchRules.ts` from the build list.
- **Surface, don't build.** The FA dashboard's "PENDING DECISIONS" panel just reads `state.faBidding.markets.filter(m => m.pendingMatch && m.pendingMatchPriorTid === userTeamId)`.
- **The hard-cap edge case (Bird + hard cap)** is the only thing missing — but `team.hardCapForSeason` doesn't exist in our schema yet, so this is a separate refactor (TODO P2 #9 from CBA audit). Defer.

---

## 8. State changes summary

### New state slice
```ts
// On GameState
offseasonPhase: OffseasonPhase;          // POLISH-B — promoted from derivation
offseasonChecklist: {                     // Session A
  draftLottery: 'pending' | 'in-progress' | 'done';
  whiteHouseVisit: 'pending' | 'done' | 'skipped';
  staffSignings: 'pending' | 'done' | 'skipped';
  options: 'pending' | 'in-progress' | 'done';
  qualifyingOffers: 'pending' | 'in-progress' | 'done';
  myFAs: 'pending' | 'done';              // info-only, auto-completes
  preDraftWorkouts: 'pending' | 'done' | 'skipped';
  draft: 'pending' | 'in-progress' | 'done';
  rookieContracts: 'pending' | 'in-progress' | 'done';
  freeAgency: 'pending' | 'in-progress' | 'done';
  trainingCamp: 'pending' | 'in-progress' | 'done';
};
faTagCounter: number;                     // 1..13 during FA phase
faTagsTotal: number;                      // 13 default
pendingOfferDecisions: Array<{...}>;     // Modal stack queue (options/QO/rookies)
```

### Existing state we reuse
```ts
pendingFAToasts                           // Existing
pendingRFAOfferSheets                     // Existing — Match/Decline modal queue
pendingRFAMatchResolutions                // Existing — outcome toasts
pendingOptionToasts                       // Existing — extend to fire BEFORE auto-decision
```

### Reducer additions
```ts
| { type: 'OFFSEASON_ENTER_PHASE'; payload: { phase: keyof OffseasonChecklist } }
| { type: 'OFFSEASON_COMPLETE_PHASE'; payload: { phase: keyof OffseasonChecklist } }
| { type: 'OFFSEASON_AUTO_RESOLVE_PHASE'; payload: { phase: keyof OffseasonChecklist } }
| { type: 'OFFSEASON_ADVANCE_FA_TAG' }
| { type: 'OFFSEASON_AUTO_RESOLVE_ALL' }  // The big lazy-sim button
```

---

## 9. Implementation order (revised, 5 sessions)

### POLISH (sessions before A)
- **POLISH-A** — play-through validation (~30min, code if drift warnings appear)
- **POLISH-B** — `state.offseasonPhase` stored field (~1 session)
- **POLISH-C** — `getCurrentOffseasonEffectiveFAStart` audit (~half session)

### Session A — Foundation
- New `state.offseasonChecklist` slice + reducer cases
- `OffseasonAufgabenView.tsx` — sidebar + auto-resolve button
- New `offseason` tab in `TeamOfficeView`
- Header swap: regular date ↔ "OFFSEASON · PHASE · TAG X/13"
- Wire EXISTING phases (Draft Lottery, Draft, Training Camp) to checklist rows

### Session B — Modal-stack phases
- `OffseasonOptionsModalStack.tsx` (player + team options)
- `OffseasonQOModalStack.tsx` (qualifying offers)
- `OffseasonRookieContractsModalStack.tsx` (rookie deals)
- `OffseasonMyFAsView.tsx` (read-only)
- Modify `seasonRollover.ts §0a/§0b` to emit pending decisions for GM team instead of auto-deciding

### Session C — Free Agency sandbox
- `FreeAgencyView.tsx` dashboard (cap header + FA list + your activity)
- `state.faTagCounter` + tag-advance reducer
- "Tag beenden" button = advances calendar + runs FA passes
- Wire existing `SigningModal` for FA negotiation (pass `onSubmitBid`)
- RFA Match popup wiring (toast already exists)

### Session D — Polish + lazy-sim
- `canMatchOfferSheet()` CBA gate
- `OFFSEASON_AUTO_RESOLVE_ALL` reducer → uses lazySimRunner targeting opening night
- TransactionsView: filter to "FA only" / "Trades only" / "All" buttons
- Hide `PlayButton` during offseason (show "Enter Phase" instead)

---

## 10. What this kills (bug-by-bug)

| Bug | Why it goes away |
|---|---|
| "Stuck until free agency, nothing moving" | No more dead calendar days — phase checklist drives advance |
| "Not all FAs are there on July 1" | FA pool snapshot taken at FA phase ENTRY, after rollover + options + QO complete |
| "Watch Draft missing" | Draft phase row is always clickable; can't be missed |
| "Date mismatch between PlayButton and dispatcher" | PlayButton hidden in offseason; phase advance drives time |
| "MLE doesn't decrement" (S50 fix) | VERBLEIBENDE MLE in FA dashboard makes wrong values immediately visible |
| Year-2 buggy because `ls.year` and calendar diverge | Header shows phase, not date — `ls.year` is the only year that matters |
| Date drift between subsystems (S1-5 hunted) | Phases atomic-transition; daily races impossible |
| Mid-season extension confused with offseason re-sign | Different phases, clearly separated; mid-season stays in regular calendar |

---

## 11. Open questions (for the user to decide)

1. **Trades during offseason** — keep the Trade Hub button always available? (Probably yes — 2K does too, in a separate menu.)
2. **Should AUFGABEN sidebar persist into regular season?** — I lean no. It only appears between championship + opening night. Disappears after "Advance Season" is clicked.
3. **Configurable Tag count?** — Default 13, but commissioner could tune to 7 (faster) or 20 (slower)?
4. **What happens if user closes browser mid-FA?** — `state.faTagCounter` persists. Reload lands on same Tag with same pending decisions.
5. **Should `OFFSEASON_AUTO_RESOLVE_ALL` need confirmation?** — Probably yes ("This will auto-resolve all your FA decisions. Continue?").

---

## TL;DR

- **Backend orchestrator (S1-5) = done.** Three small polish items remain (validate, promote `state.phase`, audit FA-start helper).
- **2K UI sits on top.** New `offseason` tab in `TeamOfficeView` with AUFGABEN sidebar. Each row is a phase.
- **Date-display split:** internal calendar still ticks for engine truth, GM-facing header shows `OFFSEASON · PHASE · TAG X/13`.
- **Modal vs full-screen:** options/QO/rookies = modal stacks (lightweight); draft/FA/training = full-screen sandboxes.
- **Lazy-sim escape hatch:** every phase has "Auto-resolve & Skip"; one button auto-resolves entire offseason.
- **100% reuse** of `SigningModal`, `DraftSimulatorView`, `TrainingCenterView`, `RFAOfferToast`, `pendingOptionToasts`. Only NEW code: AUFGABEN sidebar, 3 modal stacks, FA dashboard.
- **5 sessions:** POLISH (A,B,C) → Foundation (A) → Modals (B) → FA Sandbox (C) → Polish + Lazy-Sim (D).
