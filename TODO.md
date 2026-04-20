# NBA Commish — TODO (updated 2026-04-20, session 29)

---

## SESSION 29 — PARALLEL WORK QUEUE (2026-04-20)

**Five agent terminals + this orchestrator terminal.** No shared files between queues. When prompted "you are Agent #N", read only your own section and do items in order.

> **Rebalance history:** Started as 1 gameplay agent (9 items, too heavy) → split to 4 → split again to 5. Final shape: each agent gets 2–7 small-to-medium items in a single domain.

---

### THIS TERMINAL (orchestrator) — Traded draft picks bug

**TP.1 Traded picks not being read by Draft Lottery**
When teams trade their future first-round picks, the Draft Lottery UI still shows the original team owning those picks. Verify that `DraftLotteryView` (or wherever the lottery simulation runs) uses `pick.tid` (current owner) vs `pick.originalTid` correctly, and that the pick list sourced for the lottery includes traded picks.

**TP.2 Traded picks not used in DraftSimulator**
When the draft actually runs, DraftSimulator is assigning picks to the original team, not the current holder. Check that DraftSimulator reads `pick.tid` for pick ownership and that the draft ordering/assignment respects traded picks. Cross-reference with `memory/project_draft_picks_schema.md` (DraftPick schema: dpid / tid / originalTid / season / round).

---

### Agent #1 — Critical trade bug + ASG rotation (2 items)

**A1.1 [CRITICAL] Finalize Deal button triggers next-day sim + game ticker (GM mode)** ✅
Clicking the confirm/finalize button in the trade review/confirm modal is firing the simulate-day handler and opening the game ticker. Likely an event bubbling issue or a shared action handler. Look at `TradeReviewModal` / `TradeConfirmModal` / `TradeHub` — make sure the confirm click does ONLY the trade execution, no `simDay` / `advanceDay` side-effect. Stop propagation, separate handlers.
Fix: `processTurn` in `gameLogic.ts` now treats EXECUTIVE_TRADE / FORCE_TRADE as instant — `daysToSimulate=0`, `daysToAdvance=0`, `day` stays at `state.day`. No `runSimulation` games, no `onSimComplete` callback, `lastSimResults`/`tickerSimResults` stay empty, and the GM-mode LoadingOverlay gate (`if (gameMode==='gm' && !hasTicker) return null`) keeps the ticker closed.

**A1.2 All-Star Weekend rotation only plays 10 players**
The ASG rotation pipeline is treating it like a regular-season game (10-man rotation). Real ASG uses all 12 roster spots with even-ish minutes. Route ASG through an event-specific rotation generator that includes all 12.

---

### Agent #2 — Sim UX infrastructure (2 items)

**A2.1 Lazy sim overlay — inaccurate start % + always says "Inducting Hall of Fame class"**
The overlay progress % does not reflect the actual starting point when the user jumps from a non-default date, and the status text is hardcoded to "Inducting Hall of Fame class" regardless of the current sim stage. Find the overlay component (likely `LazySimOverlay` / `SimProgressOverlay`) — progress should be `(currentDay - startDay) / (endDay - startDay)`, and the status text should switch based on date (preseason / reg season / All-Star / playoffs / offseason / draft / HOF).

**A2.2 Game ticker — reveal games as they complete, not at batch end**
Currently the game ticker modal waits for the entire batch of sim games to complete before displaying anything, which looks like a freeze on longer sims. Stream results in as each game finishes — first game should appear in the ticker the moment its sim returns. Look at batch sim dispatcher and the ticker modal's state updates.

---

### Agent #3 — Mobile polish + small UI copy (7 items)

**A3.1 NBA Central — mobile fix**
Overall mobile layout for NBA Central is broken / cut off. Audit responsive styles and fix container/overflow/typography at mobile breakpoints. Start at `NBACentralView` (or whatever the NBA Central container is) and trace down.

**A3.2 League Transactions — mobile filter stack + dense trade-description cards** *(see screenshots #1, #4, #6 from prior turn)*
Two problems on the League Transactions page on mobile:
1. Each filter (League / Transaction Type / Team / Month) renders as a full-width row, consuming ~60% of the viewport before any content shows. Compact to a 2×2 grid on mobile, or collapse to a single "Filters" accordion / pill group that expands on tap.
2. Each trade-description card (e.g., the Wizards/Pacers/Grizzlies/OKC trades shown) eats 8–10 lines of vertical text. Either (a) clamp to ~3 lines with a "Show more" expander, or (b) shorten the wording (drop full team names → tricodes, drop "have been moved/sent to" → arrows). Also the card's right blue border appears slightly clipped — verify horizontal padding.

**A3.3 Trade detail modal — remove "THEN" projection column** *(see screenshot #3 from prior turn)*
Trade detail rows currently show a right-side `79 / 2028 / THEN` column (projected OVR in N years). The main row already has OVR + POT + age + salary, which is sufficient. Remove the THEN column entirely (on both mobile and desktop) — it's visual noise and the user has flagged it as redundant.

**A3.4 Player row display — add POT next to OVR + age**
Currently some rows show OVR + age (e.g., `88 27y`). Add POT between them: `88 95 27y`. Apply to the shared row display used in rosters / bio / trade / etc. — find the row helper rather than patching each view. *(Note: trade detail modal and Draft Results already have the OVR/POT format per screenshots #3, #4, #5 — confirm it's applied everywhere else too.)*

**A3.5 PowerRankings — "Last Week" + "Preseason" jump columns missing on mobile**
The PowerRankings table hides the Last Week and Preseason jump columns on mobile. Add them back (either in the mobile layout or via a more compact column variant).

**A3.6 PlayerSigningModal — mobile scroll + general mobile issues**
PlayerSigningModal still isn't scrollable on mobile (already-known issue) and has other mobile layout problems — tabs may overflow, contract breakdown may clip. Do a full mobile pass on the modal: scroll container, tab overflow, content sizing.

**A3.7 Team page → MOVES tab — transaction cards horizontally overflow + clip on mobile** *(see screenshot #2 from prior turn)*
On a team's MOVES tab (e.g., Houston Rockets → MOVES), transaction cards extend past the viewport on both sides. Visible text is clipped: "by the", "ith the", "6M/1yr", "signed kets:". The cards need a mobile-responsive width (full-width with padding, no fixed/min width forcing horizontal overflow) and the inner text must wrap rather than truncate to the side.

---

### Agent #4 — Social feed + Drag-drop + Team Intel (4 items)

**A4.1 Twitter / Social Feed (Home tab) — mobile scroll broken + NBA image posts not triggering image+boxscore overlay**
On the Home tab (mobile), the social feed cannot scroll past the initial posts and no new posts load. Additionally, NBA image posts (the ones that should open the full-image + box-score overlay) aren't triggering the overlay on mobile. Fix both: scroll container overflow on mobile + tap handler wiring for the image+boxscore overlay. Files: `HomeView` / `SocialFeedView` / image-overlay modal component.

**A4.2 Ideal Rotations — add drag-and-drop parity with GamePlan**
Ideal Rotations view currently uses click-to-swap (or similar non-drag UI). GamePlan has drag-and-drop slot assignment — bring IdealRotation to 1:1 parity. Reuse GamePlan's drag handlers / dnd kit wiring. Files: `IdealRotationView` + reuse from `GamePlanView`.

**A4.3 Team Intel narratives must match trading block + untouchables flags**
Team Intel's written narratives ("could look to move X") sometimes reference players that aren't actually on the trading block OR list untouchables as movable. The narrative generator must read the same flags the gameplan/trading-block UI writes. Files: `TeamIntelView` narrative section + wherever `tradingBlock` / `untouchables` are persisted.

**A4.4 Team Intel lineup — auto-rename positions like GamePlan (PosNameOVR format)**
Team Intel lineup currently shows raw position labels (PG/SG/SF/PF/C). GamePlan and System Proficiency auto-rename based on depth context (e.g., "GF", "F", "6TH" for bench). Apply the same rename helper to the Team Intel lineup display. Target format: `PosName OVR` row, e.g. `GF F. Wagner 88`, `GF A. Black 80`, `PF P. Banchero 92`, `C B. Adebayo 86`, `C W. Carter Jr. 79`, `6TH T. da Silva 79`.

---

### Agent #5 — Team Office / Team page UI (2 items)

**A5.1 Team status dropdown (GM mode manual override)**
Right now "Rebuilding / Retooling / Contending / Win-Now" status on the Team view is inferred automatically from record+age. In GM mode, expose a dropdown so the user can manually set their team's status. UI narratives, trade-outlook gates, and AI handlers that currently read the computed status should respect the manual override when `gameMode === 'gm'`. Add a `manualTeamStatus?: TeamStatus` field on the user team and fall back to computed when unset.

**A5.2 New tab: Depth Chart in Team Office**
Add a new "Depth Chart" tab to Team Office (opposing-GM view), since the Coaching tab isn't visible to non-owner GMs. Show starters by position + bench with player portraits + OVR. Reuse the starter-extraction logic from GamePlan / IdealRotation. Files: `TeamOfficeView` (new tab) + new `TeamOfficeDepthChartTab` component.

---

## BUGS — Active (pre-session 29 backlog)

### Schedule generator — unrealistic long homestands/road trips
Revealed by the new GM-mode calendar tiles (home=blue vs away=red) — the 2K-style visualization makes clear that `generateSchedule` in `src/services/gameScheduler.ts` is producing 5–7 game homestands and 5–7 game road trips in a row for every team. Real NBA schedule caps homestands/road trips at ~5 games and alternates them much more often. Fix the round-robin distribution to interleave H/A games per team with a max-consecutive constraint (e.g. ≤4 same-type in a row, target ~3).

---

## FEATURES — Backlog (low priority)

### Calendar — 2K-style event tiles (non-game days)
GM-mode calendar now renders opponent logos + home/away tint + W/L scores for user-team games (reg season, play-in, playoffs), and keeps the All-Star weekend logo. Remaining "game time" / off-day events to surface in the same tile style (GM mode only, falls back to commissioner dots):
- **NBA Draft** (Jun 25) — Draft logo tile
- **Draft Lottery** (May 14) — Lottery logo or Ping-Pong icon tile
- **Draft Combine** — combine banner tile
- **Trade Deadline** — deadline icon tile (clock/flag)
- **Free Agency open / moratorium / close** — FA icon tile
- **Training Camp open** (Oct 1) — camp tile
- **Preseason games** — preseason tile (distinct tint from reg-season)
- **Schedule release / preview unlock** (Oct 1) — tile linking to Season Preview
- **Play-in Tournament start** — tile
- **Finals game day** — gold trim variant of playoff tile
- **Exhibition / global games** — country flag + city tile
Reuse CalendarView tile structure; the 2K ref shows clipboard icon for off-days but we can do better (league logo, event icon, etc.).

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for the **main sidebar** `DraftScoutingView`:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

### External-league roster repopulation at rollover
Nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

- **Dead money / ghost contracts (Luol Deng rule)** — waived-player stretch across multiple years.

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

Session-by-session fixed lists now live in [`NEW_FEATURES.md`](./NEW_FEATURES.md) and [`CHANGELOG.md`](./CHANGELOG.md). Read those before assuming an item is still open.

*Last updated: 2026-04-19 (session 26)*
