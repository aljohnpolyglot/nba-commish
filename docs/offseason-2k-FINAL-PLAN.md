# Offseason 2K-Style — FINAL IMPLEMENTATION PLAN

> Reading order: this doc supersedes v1/v2. They were design exploration; this is what we build.
> Companion docs: `offseason-2k-spec.md` (deutsch screenshot mapping), `offseason-2k-spec-v2.md` (codebase reuse audit).

---

## What we discovered after auditing the codebase

The original v1 spec assumed we'd build ~7 new screens. After auditing, **95% of the engine + ~70% of the UI already exists.** The work is mostly *exposure* and *gating*, not building.

### Already built (verified in audit)

| Capability | File | Lines | Status |
|---|---|---|---|
| Offseason orchestrator (single source of truth for phase) | `services/offseason/offseasonState.ts` | 204 | ✅ S1-5 |
| Per-day plan dispatcher | `services/offseason/offseasonPlan.ts` | 266 | ✅ S1-5 |
| 5-pass AI free agency engine | `services/AIFreeAgentHandler.ts` | 2228 | ✅ |
| Bird Rights re-signing | `services/AIFreeAgentHandler.ts:runAIBirdRightsResigns` | — | ✅ |
| Mid-season AI extensions (Oct-Feb) | `simulationHandler.ts:876-960` | — | ✅ |
| Daily FA market ticker | `services/faMarketTicker.ts` | — | ✅ |
| RFA Match window + 2nd-apron auto-decline | `faMarketTicker.ts:485, 680, 714` | — | ✅ |
| RFA Match decision toast (Match/Decline buttons) | `ToastNotifier.tsx:440-485` | — | ✅ |
| User RFA pending-state hold | `faMarketTicker.ts:698` | — | ✅ |
| FA negotiation modal (full CBA) | `SigningModal.tsx` | 1894 | ✅ |
| FA dashboard + scouting + cap ticker + auto-bid | `TeamIntelFreeAgency.tsx` | 980 | ✅ |
| Player option auto-decisions (currently AI-only for GM) | `seasonRollover.ts §0a` | — | ✅ engine |
| Team option auto-decisions (currently AI-only for GM) | `seasonRollover.ts §0b` | — | ✅ engine |
| Rookie contract seeding | `autoResolvers.autoRunDraft` + `rookieContractUtils` | — | ✅ |
| Draft full UI | `DraftSimulatorView.tsx` | 1457 | ✅ |
| Draft Lottery UI | `DraftLotteryView` + `useDraftEventGate` | — | ✅ |
| Training Camp UI | `TeamTraining/` subsystem | — | ✅ |
| Lazy-sim with `assistantGM=true` (AI handles user team) | `lazySimRunner.ts:404, 406` | — | ✅ |
| EconomyTab — 50+ CBA toggles all wired | `EconomyTab.tsx` | 743 | ✅ |
| `pendingOptionToasts` for GM option decisions | `ToastNotifier.tsx:184-193` + `seasonRollover` emit | — | ✅ |
| Composite-key event dedup that survives rollover | `lazySimRunner.ts:436, 510-523` | — | ✅ |

### Net-new code required (the actual build list)

1. `state.offseasonChecklist` slice + `OFFSEASON_*` reducer cases
2. `OffseasonAufgabenView.tsx` — the AUFGABEN sidebar (~200 lines)
3. `OffseasonOptionsModalStack.tsx` — modal stack for player/team options (~150 lines)
4. `OffseasonQOModalStack.tsx` — modal stack for qualifying offers (~120 lines)
5. `OffseasonRookieContractsModalStack.tsx` — modal stack for rookie deals (~120 lines)
6. **Modify** `seasonRollover.ts §0a/§0b` — emit pending decisions for GM team instead of auto-deciding (~50 line patch)
7. **Modify** `TeamIntelFreeAgency.tsx` — add prominent `Negotiate` button + Tag X/13 footer (~80 line patch)
8. New header phase badge `OffseasonPhaseBadge.tsx` — replaces date when `state.offseasonPhase !== 'inSeason'` (~80 lines)
9. **Modify** `TeamOfficeView.tsx` — add `offseason` tab (only visible when `offseasonPhase !== 'inSeason'`) (~10 line patch)
10. New `state.faTagCounter` + `OFFSEASON_ADVANCE_FA_TAG` reducer (~60 lines)
11. New `OffseasonNextActionButton.tsx` — context-aware header CTA (~120 lines)
12. **Modify** `App.tsx`, `ScheduleView.tsx`, `FreeAgentsView.tsx`, `NBACentral.tsx`, `RealStern.tsx` — gate day-advance UI behind `offseasonPhase === 'inSeason'` (~30 line patch total)

**Total new code: ~990 lines. Total modified: ~170 lines.** That's a 5-session sprint, not a 3-month rewrite.

---

## The 6 phases in build order

> Each phase = one session = one PR. Ship to master after each.

### Phase 0 — Polish (one short session, blocks nothing if skipped)

**Goal:** Validate Sessions 1-5 orchestrator works under real save data. No code unless drift appears.

**Tasks:**
- 0.1 Open save in browser, sim from championship → opening night
- 0.2 Filter console for `[OSPLAN] DRIFT` and `[OSPLAN] SHADOW-DRIFT`
- 0.3 If any warnings: investigate the named callsite, fix, re-run
- 0.4 If clean: ship a "Sessions 1-5 validated" CHANGELOG entry

**Exit criterion:** Zero drift warnings during a full offseason play-through.

---

### Phase A — Foundation slice + AUFGABEN sidebar

**Goal:** New offseason tab in TeamOffice with checklist sidebar. Existing phases (Lottery, Draft, Camp) wire to checklist rows. Header swap.

**Code:**

```ts
// types.ts additions
export type OffseasonChecklistRow =
  | 'draftLottery'
  | 'options'
  | 'qualifyingOffers'
  | 'myFAs'
  | 'draft'
  | 'rookieContracts'
  | 'freeAgency'
  | 'trainingCamp';

export interface OffseasonChecklist {
  [K in OffseasonChecklistRow]: 'pending' | 'in-progress' | 'done' | 'skipped';
}

// On GameState
offseasonPhase: OffseasonPhase;            // promoted from derivation
offseasonChecklist?: OffseasonChecklist;    // optional → default all 'pending'
```

```ts
// New reducer cases
case 'OFFSEASON_ENTER_PHASE':       // mark row in-progress + navigate
case 'OFFSEASON_COMPLETE_PHASE':    // mark row done + advance to next
case 'OFFSEASON_SKIP_PHASE':        // mark skipped, run AI auto-resolve
case 'OFFSEASON_AUTO_RESOLVE_ALL':  // calls lazySimRunner with assistantGM=true
                                    // and target=openingNightStr
```

**Files:**

- New: `src/components/offseason/OffseasonAufgabenView.tsx` (the sidebar + sandbox host)
- New: `src/components/offseason/OffseasonPhaseBadge.tsx` (header replacement during offseason)
- Modify: `src/components/central/view/TeamOffice/TeamOfficeView.tsx` — add `offseason` tab
- Modify: `src/store/GameContext.tsx` — add 4 reducer cases (~80 lines)
- Modify: `src/types.ts` — add `OffseasonChecklist` interface

**Wire existing phases:**
- DRAFT LOTTERY row → `setCurrentView('Draft Lottery')` + auto-checkmark when `state.draftLotteryResult`
- DRAFT row → `setCurrentView('Draft Board')` + auto-checkmark when `state.draftComplete`
- TRAINING CAMP row → `setCurrentView('Training Center')` + auto-checkmark when training week done

**Header logic:**
```tsx
// In top header area
{state.offseasonPhase === 'inSeason'
  ? <span>{formatGameDateShort(state.date)}</span>
  : <OffseasonPhaseBadge phase={state.offseasonPhase} tag={state.faTagCounter} />}
```

**Auto-resolve & Skip button on each row** dispatches `OFFSEASON_SKIP_PHASE` which runs the corresponding AI logic (`seasonRollover` for options, `autoRunDraft` for draft, etc.) for the user team.

**Top-of-sidebar `⚡ Auto-resolve entire offseason` button** dispatches `OFFSEASON_AUTO_RESOLVE_ALL` which calls existing `runLazySim(state, openingNightStr, ..., { assistantGM: true })`. Zero new sim logic needed — `assistantGM` mode (`lazySimRunner.ts:404`) already auto-handles every user-team transaction.

**Validation:** Open offseason, see sidebar, click DRAFT LOTTERY → existing view opens, returns checked. Click ⚡ Auto-resolve → sim races through to opening night. Phase header reads `OFFSEASON · DRAFT LOTTERY` etc.

---

### Phase B — Modal stacks for Options + QO + Rookies

**Goal:** Three modal stacks replace AI auto-decisions for GM team.

**The pattern (shared across all 3 stacks):**

```tsx
function OffseasonOptionsModalStack() {
  const { state, dispatchAction } = useGame();
  const queue = state.pendingOptionDecisions ?? [];
  const [idx, setIdx] = useState(0);
  if (queue.length === 0) return null;
  const current = queue[idx];

  const handleDecide = (action: 'accept' | 'decline') => {
    dispatchAction({ type: 'RESOLVE_OPTION_DECISION', payload: { ...current, action } });
    if (idx < queue.length - 1) setIdx(idx + 1);
    else dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { phase: 'options' } });
  };
  const handleSkipRest = () => {
    dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { phase: 'options' } });
  };

  return <PlayerDecisionModal player={current.player} ... onDecide={handleDecide} onSkipRest={handleSkipRest} />;
}
```

**Modify** `seasonRollover.ts §0a` (player options):
```ts
// Before — auto-decides:
if (currentAmountUSD >= offer.salaryUSD * 0.9) {
  playerOptInIds.add(p.internalId);  // AUTO-DECIDE
  ...
}

// After — for GM team, queue decision instead:
if (isGM && p.tid === userTid) {
  pendingOptionDecisions.push({
    type: 'player-option', playerId: p.internalId,
    recommendedAction: currentAmountUSD >= offer.salaryUSD * 0.9 ? 'accept' : 'decline',
    reason: `Current $${(currentAmountUSD/1e6).toFixed(1)}M vs market $${(offer.salaryUSD/1e6).toFixed(1)}M`,
  });
} else if (currentAmountUSD >= offer.salaryUSD * 0.9) {
  playerOptInIds.add(p.internalId);
  // ... existing auto-decide path
}
```

Same pattern for §0b (team options) and rookie contract acceptance after `autoRunDraft`.

**Files:**

- New: `src/components/offseason/OffseasonOptionsModalStack.tsx`
- New: `src/components/offseason/OffseasonQOModalStack.tsx`
- New: `src/components/offseason/OffseasonRookieContractsModalStack.tsx`
- New: `src/components/offseason/PlayerDecisionModal.tsx` (shared template, hero card layout per Bilder #1/#5/#8)
- New: `src/utils/qualifyingOfferUtils.ts` — `isRFAEligible()`, `getQualifyingOfferAmount()`
- Modify: `src/services/logic/seasonRollover.ts` — split GM-team branch in §0a/§0b
- Modify: `src/services/logic/autoResolvers.ts:autoRunDraft` — emit pending rookie contracts for user team

**Validation:** Hit Jun 30 in GM mode → option modal stack opens before rollover continues. Decide each one. Stack closes → checkmark fills → next phase available.

---

### Phase C — Free Agency sandbox + Tag system

**Goal:** Promote `TeamIntelFreeAgency` to AUFGABEN row. Add Tag X/13 footer. Add `Negotiate` button. Wire `OFFSEASON_ADVANCE_FA_TAG`.

**Tag advance reducer:**
```ts
case 'OFFSEASON_ADVANCE_FA_TAG': {
  const total = state.faTagsTotal ?? 13;
  const daysPerTag = Math.floor(62 / total);  // ~5 days each
  // Use existing lazySimRunner — it already knows how to fire tickFAMarkets,
  // runAIFreeAgencyRound, applyBirdRightsResignsPass via the orchestrator
  const targetDate = addDays(state.date, daysPerTag);
  return runLazySim(state, targetDate, ..., {
    assistantGM: false,  // user is actively playing, not auto-skipping
    onProgress: noop,
    mode: 'silent',
  }).then(({ state: nextState }) => ({
    ...nextState,
    faTagCounter: (state.faTagCounter ?? 0) + 1,
  }));
}
```

**Critical insight:** the Tag advance is just a 5-day lazy sim. The orchestrator already drives all the right dispatches. We don't write new FA logic — we just expose a button that triggers a 5-day skip with a counter increment.

**Skip moratorium auto-magically:**
```ts
// When entering FA phase
case 'OFFSEASON_ENTER_PHASE' with phase==='freeAgency': {
  const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(state.date, ...);
  if (state.date < moratoriumEnd) {
    // Lazy-sim straight to first legal signing day
    return runLazySim(state, toISODateString(moratoriumEnd), ..., { assistantGM: false });
  }
  return { ...state, faTagCounter: 1 };
}
```

User never sees moratorium. Tag 1 = first day signings are legal.

**Files:**

- Modify: `src/components/central/view/TeamOffice/pages/TeamIntelFreeAgency.tsx` — add row-level `Negotiate` button (opens SigningModal directly, not via quick-actions)
- New: `src/components/offseason/FATagFooter.tsx` — sticky footer with Tag X/13 + "Tag beenden" button
- Modify: `src/store/GameContext.tsx` — add `OFFSEASON_ADVANCE_FA_TAG` and `OFFSEASON_ENTER_PHASE` (FA branch)
- Modify: `src/types.ts` — add `faTagCounter`, `faTagsTotal` to GameState

**RFA flow** — already wired end-to-end. No code, just verify:
1. User submits offer to another team's RFA via SigningModal (existing path)
2. `tickFAMarkets` next Tag detects pending offer
3. AI prior team's `canMatch` decision runs (existing 2nd-apron gate)
4. Outcome toast appears via `RFAOfferToast` (existing component)

**Validation:** Enter FA phase → land on Jul 7 (skipped moratorium silently) → Tag 1/13 → submit offer to RFA → click Tag beenden → 5 days advance → outcome toast appears with Match/Decline result. Cap header decrements live.

---

### Phase D — Polish + delete dead code

**Goal:** Cleanup pass after all phases work end-to-end.

**Tasks:**

- D.1 Hide PlayButton during offseason (replace with "Enter Phase" CTA from current row)
- D.2 Add `[ Auto-resolve & Skip ]` button to each AUFGABEN row
- D.3 Add confirmation modal to `⚡ Auto-resolve entire offseason`
- D.4 TransactionsView filter chips: All / FA / Trades / Re-signings
- D.5 Delete `isInFreeAgencyWindow`, `isInPostDeadlinePreFAWindow`, `isDraftBlockedByUnresolvedPlayoffs` once nothing reads them
- D.6 Remove POLISH-C TODO from memory once `getCurrentOffseasonEffectiveFAStart` audit done
- D.7 Update CLAUDE.md with the new offseason phase model
- D.8 CHANGELOG entry summarizing the full 2K refactor

**Validation:** Full offseason play-through with stopwatch. Compare to pre-refactor: same time = win (UX win, no perf regression). Should actually be faster since dead-zone days collapse into 1-click skips.

---

## State diagram

```
inSeason (regular season + playoffs)
   │ Finals ends → state.playoffs.bracketComplete
   ▼
preDraft (lottery → draft day)
   │ DRAFT LOTTERY row → DraftLotteryView → checkmark
   │ DRAFT row → DraftSimulatorView → checkmark
   ▼
postDraft (draft+1 → Jun 30)
   │ ROOKIE CONTRACTS modal stack → checkmark
   │ TEAM/PLAYER OPTIONS modal stack → checkmark (also fires §0a/§0b)
   │ QUALIFYING OFFERS modal stack → checkmark
   │ MY FREE AGENTS view (info-only, auto-checks)
   │ → seasonRollover fires (Jun 30, behind the scenes)
   ▼
moratorium (Jul 1 → Jul 6)
   │ Skipped automatically when user enters FREE AGENCY row
   ▼
openFA (Jul 7 → Sep 30)
   │ FREE AGENCY row → TeamIntelFreeAgency + FATagFooter
   │ Tag 1/13 → Tag 13/13 → checkmark
   ▼
preCamp (Oct 1 → opening night)
   │ TRAINING CAMP row → TrainingCenterView → checkmark
   │ ZU NÄCHSTER SAISON VORRÜCKEN → exits offseason mode
   ▼
inSeason (next year)
```

The **AUFGABEN sidebar visibility** = `state.offseasonPhase !== 'inSeason'`. As soon as user clicks "Advance to Next Season" the sidebar disappears, header swaps back to date, PlayButton reappears.

---

## The three FA surfaces — how they coexist

> User raised this: `FreeAgentsView` (global, league-wide) is **always visible** and lets you submit offers year-round. So what does the new offseason FA UI ACTUALLY do differently?

### Surface 1 — `FreeAgentsView.tsx` (866 lines, global, year-round)

Lives at top-level `Players → Free Agents` tab. Always visible. Shows entire FA pool with country/pool/team filters. Uses `usePlayerQuickActions` for Sign/View Offers actions. **Already has moratorium gating** (`FreeAgentsView:71`) and the FA heads-up modal.

**Audience:** anyone browsing players, including non-GM commissioners.
**Stays unchanged.** Always available.

### Surface 2 — `TeamIntelFreeAgency.tsx` (980 lines, GM-focused, year-round-but-most-useful-in-summer)

Lives at `TeamOffice → Team Intel → Free Agency`. GM scouting tool — Cap Ticker + Shortlist + Live Bid Tracker + Top Free Agents drawer. Has Auto-bid All, Pursue/Bump per-row buttons.

**Audience:** the GM strategically planning their roster.
**Stays unchanged.** Always available from TeamOffice.

### Surface 3 — `OffseasonAufgabenView` → FREE AGENCY row (NEW, GM-only, offseason-only)

The new sandbox. Wraps `TeamIntelFreeAgency` with:
- `FATagFooter` (Tag X/13 progress + "Tag beenden" button)
- Larger / more prominent Negotiate button on each FA row
- Auto-skip moratorium on entry
- Checkbox completes when user clicks "Done with FA" or hits Tag 13/13

**Audience:** the GM who wants the focused 2K-style step-through.
**Disappears when offseason ends.**

### Why three is the right number, not redundant

| Need | Surface |
|---|---|
| "I want to see who's available" (browsing) | Surface 1 (`FreeAgentsView`) |
| "I'm scouting / shortlisting / tracking my bids over time" | Surface 2 (`TeamIntelFreeAgency`) |
| "It's offseason and I want the structured step-through experience" | Surface 3 (offseason wrapper around Surface 2) |

**Recommendation in offseason mode:** Surface 3 is the highlighted CTA in the AUFGABEN sidebar. But Surface 1 and 2 stay reachable via normal navigation — power users who hate the wizard UI can ignore the sidebar entirely.

### What changes in the BASE views during offseason

Almost nothing — that's the point. Only:
- Both views show a small `OFFSEASON · TAG X/13` badge in their header (consistency cue)
- `FreeAgentsView`'s "Sim Day" button hidden during offseason (doesn't make sense — calendar is Tag-driven)

### The "Negotiate" button addition (Phase C)

Right now in Surface 2 (`TeamIntelFreeAgency`), to actually open SigningModal you must:
1. Click row → opens quick-actions menu
2. Click "Sign Free Agent" → opens SigningModal

User correctly identified this is too deep. **Phase C adds a prominent `Negotiate` button next to ★ Shortlist** — direct path to SigningModal. Available in BOTH Surface 2 and Surface 3 (same component, same fix benefits both).

---

## During offseason: hide ALL day-advance UI + auto-navigate to current task

> User confirmed both ideas. Critical UX rule: **calendar-day controls disappear, the only "next" action is "advance current offseason task" or "auto-resolve & skip phase".**

### Hide list (during offseason — `state.offseasonPhase !== 'inSeason'`)

| Component | Where | What to hide |
|---|---|---|
| **PlayButton** | `App.tsx:191, 196` (header, twice) | Replace with `OffseasonNextActionButton` (text varies by current phase) |
| **ScheduleView "Sim Day"** | `ScheduleView.tsx:93, 262, 486, 508` | Hide entire button + grey out the calendar grid (no games to schedule in offseason anyway) |
| **FreeAgentsView "Sim Day"** | `FreeAgentsView.tsx:494, 530` | Hide — Tag advance happens via offseason wrapper instead |
| **NBACentral "Sim & Watch" button** | `NBACentral.tsx:418, 435` | Hide — no games to watch in offseason (only preseason exhibition during preCamp) |
| **RealStern ADVANCE_DAY buttons** | `RealStern.tsx:205, 220` | Hide — RealStern is mostly in-season interactive content |

The pattern is `state.offseasonPhase !== 'inSeason'` → hide. One conditional in each component.

### What replaces PlayButton: `OffseasonNextActionButton`

A single context-aware CTA in the header. Text + icon change based on `currentRow` of the checklist:

| Current phase row | Button label | Action |
|---|---|---|
| Draft Lottery (pending) | `▶ Watch Draft Lottery` | Navigate to DraftLotteryView |
| Draft Lottery (in-progress) | `View Lottery Result` | Navigate to DraftLotteryView |
| Options (pending) | `▶ Decide Team/Player Options` | Open OffseasonOptionsModalStack |
| Options (in-progress) | `Resume Options (3 left)` | Re-open at next pending decision |
| Qualifying Offers (pending) | `▶ Submit Qualifying Offers` | Open QO modal stack |
| My Free Agents (pending) | `▶ Review Departing FAs` | Navigate to MyFreeAgentsView, then auto-check |
| Draft (pending) | `▶ Run NBA Draft` | Navigate to DraftSimulatorView |
| Rookie Contracts (pending) | `▶ Sign N Rookies` | Open Rookie Contracts modal stack |
| Free Agency (pending) | `▶ Enter Free Agency` | Navigate to OffseasonAufgabenView FA tab |
| Free Agency (in-progress) | `▶ Tag X/13 — End Day` | Dispatch `OFFSEASON_ADVANCE_FA_TAG` |
| Training Camp (pending) | `▶ Open Training Camp` | Navigate to TrainingCenterView |
| All done | `▶ Advance to Next Season` | Dispatch `OFFSEASON_EXIT` → opening night |

**Crucial:** clicking the CTA also auto-navigates to the right view if the user is elsewhere. So even if user is on TradeFinderView, clicking the header CTA jumps them to the FA dashboard at Tag X/13. **The CTA is the only "what's next" the user needs.**

### Auto-navigation on phase entry

When user enters a phase row (from sidebar or CTA click), auto-navigate:

```ts
case 'OFFSEASON_ENTER_PHASE': {
  const phaseToView: Record<OffseasonChecklistRow, Tab> = {
    draftLottery: 'Draft Lottery',
    options: 'Team Office',     // modal stack opens on top
    qualifyingOffers: 'Team Office',
    myFAs: 'Team Office',
    draft: 'Draft Board',
    rookieContracts: 'Team Office',
    freeAgency: 'Team Office',  // routes to TeamIntel → Free Agency tab
    trainingCamp: 'Training Center',
  };
  setCurrentView(phaseToView[action.payload.phase]);
  return { ...state, offseasonChecklist: { ...state.offseasonChecklist, [action.payload.phase]: 'in-progress' } };
}
```

This solves the user's question: **"wirdst du in offseaosntask gefuhrt?"** (will you be guided into the offseason task?) — **Yes, automatically.** Click the header CTA or sidebar row → land on the right view → modal stack opens if applicable.

### What if the user navigates AWAY mid-phase?

Free navigation stays intact. They can still go to TradeFinderView, browse other teams, check stats, etc. The header CTA persists everywhere with phase-appropriate text — one click brings them back.

### What about the AUFGABEN sidebar — is it always shown?

Two configurations:
- **Default (mobile + desktop):** sidebar collapses to a single header pill `📋 Offseason Tasks (3/8)`. Click → opens sheet/sidebar with full list.
- **Wide-desktop in TeamOffice:** full sidebar visible permanently as left rail (matching the screenshot).

Either way the **CTA in the header is the primary action.** Sidebar is the "show me all phases" overflow menu.

---

## What "auto-resolve everything" means concretely

The `⚡ Auto-resolve entire offseason` button at the top of AUFGABEN dispatches:

```ts
dispatchAction({ type: 'OFFSEASON_AUTO_RESOLVE_ALL' });
```

Reducer:
```ts
case 'OFFSEASON_AUTO_RESOLVE_ALL': {
  const openingNight = toISODateString(getOpeningNightDate(state.leagueStats.year));
  // Existing function — handles every offseason event including:
  //   - lottery (autoRunLottery)
  //   - draft (autoRunDraft)
  //   - rollover (applySeasonRollover via orchestrator)
  //   - FA passes (runAIFreeAgencyRound via orchestrator)
  //   - Bird Rights (applyBirdRightsResignsPass via orchestrator)
  //   - external routing (routeUnsignedPlayers via orchestrator)
  //   - HOF induction (autoInductHOFClass)
  // assistantGM=true → AI handles user team for re-signings, signings, options
  return runLazySim(state, openingNight, onProgress, { assistantGM: true });
}
```

**Zero new logic.** Every required dispatch is already in `lazySimRunner` and the orchestrator. The button is a 5-line wrapper.

---

## Risk register

| Risk | Mitigation |
|---|---|
| `pendingOptionDecisions` stale after save/load | LOAD_GAME healing in GameContext clears the queue if `state.offseasonPhase === 'inSeason'` |
| User in FA phase, accidentally hits regular PlayButton | Hide PlayButton during offseason (Phase D.1) |
| RFA pending market → user closes browser → reopens → modal already dismissed | Re-show on next render via `pendingRFAOfferSheets` (existing mechanism) |
| AI signs everyone before user can react | Already mitigated — `tickFAMarkets` only fires bids on Tag advances in new model, and existing `userInterrupted` flag (lazySimRunner:1081) breaks the loop on user-affecting RFA events |
| User wants to switch back to calendar UX | Add commissioner setting `useClassicOffseasonUI: boolean` — bypass AUFGABEN entirely. Defer to D.X. |
| Year-2 still buggy | POLISH-C audit catches `getCurrentOffseasonEffectiveFAStart` year drift before Phase A |

---

## Estimate

| Phase | Sessions | Lines added | Lines modified |
|---|---|---|---|
| 0 — Polish/Validate | 0.5 | 0 (best case) | 0 |
| A — Foundation + sidebar | 1 | ~360 | ~30 |
| B — Modal stacks | 1 | ~390 | ~80 |
| C — FA sandbox + Tag | 1 | ~140 | ~80 |
| D — Polish + cleanup | 0.5 | ~50 | ~50 |
| **Total** | **4 sessions** | **~940** | **~240** |

Compare to v1 estimate of "3 sessions, ~7 new screens." We landed close on session count but with **70% less code** because audit found existing reusable parts.

---

## What we explicitly DON'T build

- White House Visit (defer — flavor only)
- Personnel Signings / Staff Signings (defer — no staff system yet)
- Pre-Draft Workouts (defer — combine already in `playerGen`)
- Hard cap tracking (`team.hardCapForSeason`) — separate refactor, not blocking
- Composite "promise" system in negotiation (no-trade clauses, role promises) — defer
- Free agency Tag-count commissioner override — Phase D.X if asked
- Trade Hub during offseason — already accessible from TeamOffice, no special handling needed

---

## Ship criteria per phase

| Phase | Ship when |
|---|---|
| 0 | Console clean during full offseason play-through |
| A | Sidebar appears post-Finals, all 8 rows visible, 3 wired phases (Lottery/Draft/Camp) check off correctly |
| B | All 3 modal stacks open at right time, decisions persist, "Skip rest" works |
| C | Tag 1/13 → 13/13 progresses, FA signings happen on Tag advances, RFA Match toasts fire |
| D | PlayButton hidden during offseason, no `[OSPLAN] DRIFT` warnings in production save |

---

## TL;DR for the next session

We're not building from scratch. We're **wiring existing pieces** into a 2K-style checklist UI. The orchestrator (Sessions 1-5) is the engine, `assistantGM` mode of `lazySimRunner` is the auto-resolve, `TeamIntelFreeAgency` is the FA dashboard, `SigningModal` is the negotiation, `RFAOfferToast` is the Match/Decline flow.

**4 sessions, ~940 new lines, ~240 modified lines. Start with Phase 0 validation.**
