# NBA Commish — TODO (updated 2026-04-20, session 29)

---

## SESSION 29 — PARALLEL WORK QUEUE (2026-04-20)

**Five agent terminals + this orchestrator terminal.** No shared files between queues. When prompted "you are Agent #N", read only your own section and do items in order.

> **Rebalance history:** Started as 1 gameplay agent (9 items, too heavy) → split to 4 → split again to 5. Final shape: each agent gets 2–7 small-to-medium items in a single domain.

---

### THIS TERMINAL (orchestrator) — Traded draft picks bug

**TP.1 Draft Lottery — display traded-pick current owner**✅
Lottery odds are calculated from team records (correct — balls are tied to record, not pick ownership; do NOT change the odds math). What's wrong: when a lottery ball results says "Wizards' pick wins #1" and Wizards traded that pick to Thunder, the result row should display **Thunder (via Wizards)**, not Wizards. After the lottery balls determine which TEAM's pick wins each slot 1–14, look up `state.draftPicks` for that team's upcoming season-round-1 entry and render `pick.tid` as the actual owner with `pick.originalTid` in parens. File: `src/components/draft/DraftLotteryView.tsx`.

**TP.2 Traded picks not used in DraftSimulator**✅
When the draft actually runs, DraftSimulator is assigning picks to the original team, not the current holder. Root cause confirmed:
- `DraftSimulatorView.tsx` lines 504–540 build `draftOrder` from `state.teams` standings only, never consulting `state.draftPicks`. Comment at lines 749–751 even acknowledges this misalignment.
- Lines 861–911 assign `tid` and `originalTid` both from `draftOrder[pickSlot - 1].id`, losing trade info.
Fix: build a slot→DraftPick map from `state.draftPicks` (filter by `season` + `round`, keyed by sorted slot position derived from standings/lottery), then in the player-assignment loop use `pick.tid` for `tid` and `pick.originalTid` for `originalTid`. Cross-reference `memory/project_draft_picks_schema.md`.

**TP.3 Highlight "your team" on Draft Lottery (GM mode)**✅
Same pattern used in `src/components/team-stats/TeamStatsView.tsx`:
- Get user team via `const ownTid = getOwnTeamId(state);` at top of component
- For each lottery result row, compute `const isOwn = ownTid !== null && row.team.id === ownTid;`
- Apply `bg-indigo-500/10 hover:bg-indigo-500/15` row tint when `isOwn`
- Sticky/lead cell uses `bg-indigo-950/60` instead of default `bg-slate-950`
- Append a "You" pill: `<span className="text-[8px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1 py-0.5 rounded border border-indigo-500/40">You</span>`
After TP.1 lands, the "your team" check should compare against `pick.tid` (current owner), so a user who acquired another team's pick via trade still gets the highlight on the slot they actually own.

---

### Agent #1 — Critical trade bug + ASG rotation (2 items)

**A1.1 [CRITICAL] Finalize Deal button triggers next-day sim + game ticker (GM mode)** ✅
Clicking the confirm/finalize button in the trade review/confirm modal is firing the simulate-day handler and opening the game ticker. Likely an event bubbling issue or a shared action handler. Look at `TradeReviewModal` / `TradeConfirmModal` / `TradeHub` — make sure the confirm click does ONLY the trade execution, no `simDay` / `advanceDay` side-effect. Stop propagation, separate handlers.
Fix: `processTurn` in `gameLogic.ts` now treats EXECUTIVE_TRADE / FORCE_TRADE as instant — `daysToSimulate=0`, `daysToAdvance=0`, `day` stays at `state.day`. No `runSimulation` games, no `onSimComplete` callback, `lastSimResults`/`tickerSimResults` stay empty, and the GM-mode LoadingOverlay gate (`if (gameMode==='gm' && !hasTicker) return null`) keeps the ticker closed.

**A1.2 All-Star Weekend rotation only plays 10 players** ✅
The ASG rotation pipeline is treating it like a regular-season game (10-man rotation). Real ASG uses all 12 roster spots with even-ish minutes. Route ASG through an event-specific rotation generator that includes all 12.
Fix: `StarterService.getRotation` had a hardcoded `rotationDepth = 10` that silently clipped the bench list before `MinutesPlayedService` sliced to its computed depth — so `KNOBS_ALL_STAR.rotationDepthOverride = 12` never made it past the starter-service cap. Added a `depthOverride` parameter to `StarterService.getRotation` and threaded the MinutesPlayedService-computed `depth` through. All-Star (12) and Rising Stars (10) now land with the correct rotation size; regular-season games still get the standings-driven depth from MinutesPlayedService.

---

### Agent #2 — Sim UX infrastructure (2 items)

**A2.1 Lazy sim overlay — inaccurate start % + always says "Inducting Hall of Fame class"**✅
The overlay progress % does not reflect the actual starting point when the user jumps from a non-default date, and the status text is hardcoded to "Inducting Hall of Fame class" regardless of the current sim stage. Find the overlay component (likely `LazySimOverlay` / `SimProgressOverlay`) — progress should be `(currentDay - startDay) / (endDay - startDay)`, and the status text should switch based on date (preseason / reg season / All-Star / playoffs / offseason / draft / HOF).

**A2.2 Game ticker — reveal games as they complete, not at batch end**✅
Currently the game ticker modal waits for the entire batch of sim games to complete before displaying anything, which looks like a freeze on longer sims. Stream results in as each game finishes — first game should appear in the ticker the moment its sim returns. Look at batch sim dispatcher and the ticker modal's state updates.

---

### Agent #3 — Mobile polish + small UI copy (7 items)

**A3.1 NBA Central — mobile fix** ✅
Overall mobile layout for NBA Central is broken / cut off. Audit responsive styles and fix container/overflow/typography at mobile breakpoints. Start at `NBACentralView` (or whatever the NBA Central container is) and trace down.
Fix: `rounded-xl sm:rounded-[2.5rem]` on main container (was 40px radius clipping content on mobile); standings grid `gap-4 md:gap-10`.

**A3.2 League Transactions — mobile filter stack + dense trade-description cards** ✅
Two problems on the League Transactions page on mobile:
1. Each filter (League / Transaction Type / Team / Month) renders as a full-width row, consuming ~60% of the viewport before any content shows. Compact to a 2×2 grid on mobile, or collapse to a single "Filters" accordion / pill group that expands on tap.
2. Each trade-description card (e.g., the Wizards/Pacers/Grizzlies/OKC trades shown) eats 8–10 lines of vertical text. Either (a) clamp to ~3 lines with a "Show more" expander, or (b) shorten the wording (drop full team names → tricodes, drop "have been moved/sent to" → arrows). Also the card's right blue border appears slightly clipped — verify horizontal padding.
Fix: Filters row changed to horizontal scroll (`overflow-x-auto no-scrollbar`, `-mx-4 px-4` bleed) with `shrink-0` on each select so they stay compact.

**A3.3 Trade detail modal — remove "THEN" projection column** ✅
Trade detail rows currently show a right-side `79 / 2028 / THEN` column (projected OVR in N years). The main row already has OVR + POT + age + salary, which is sufficient. Remove the THEN column entirely (on both mobile and desktop) — it's visual noise and the user has flagged it as redundant.
Fix: Removed `{/* K2 badge — historical */}` div from `PlayerReceivedCard` in `TradeDetailView.tsx`.

**A3.4 Player row display — add POT next to OVR + age** ✅
Currently some rows show OVR + age (e.g., `88 27y`). Add POT between them: `88 95 27y`. Scoped to trade detail card only (other views already correct).
Fix: `now:` line in `PlayerReceivedCard` extended to show `currentOvr · currentPot` (both color-coded via `ovrColor`/`getPotColor`).

**A3.5 PowerRankings — "Last Week" + "Preseason" jump columns missing on mobile** ✅
The PowerRankings table hides the Last Week and Preseason jump columns on mobile. Add them back (either in the mobile layout or via a more compact column variant).
Fix: Removed `hidden sm:` from Last Wk `<th>` and both Last Wk `<td>` cells; table already has `overflow-x-auto` container so it scrolls horizontally on narrow screens.

**A3.6 PlayerSigningModal — mobile scroll + general mobile issues** ✅
PlayerSigningModal still isn't scrollable on mobile (already-known issue) and has other mobile layout problems — tabs may overflow, contract breakdown may clip. Do a full mobile pass on the modal: scroll container, tab overflow, content sizing.
Fix: Content area changed from `lg:overflow-y-auto` → `overflow-y-auto`; padding `p-8` → `p-5 sm:p-8` on mobile.

**A3.7 Team page → MOVES tab — transaction cards horizontally overflow + clip on mobile** ✅
On a team's MOVES tab (e.g., Houston Rockets → MOVES), transaction cards extend past the viewport on both sides. Visible text is clipped: "by the", "ith the", "6M/1yr", "signed kets:". The cards need a mobile-responsive width (full-width with padding, no fixed/min width forcing horizontal overflow) and the inner text must wrap rather than truncate to the side.
Fix: List wrapper gets `overflow-x-hidden`; card inner content gets `overflow-hidden`; text `<p>` gets `break-words`; padding `p-4 pl-5` → `p-3 sm:p-4 pl-4 sm:pl-5`.

---

### Agent #4 — Social feed + Drag-drop + Team Intel (4 items)

**A4.1 Twitter / Social Feed (Home tab) — mobile scroll broken + NBA image posts not triggering image+boxscore overlay**✅
On the Home tab (mobile), the social feed cannot scroll past the initial posts and no new posts load. Additionally, NBA image posts (the ones that should open the full-image + box-score overlay) aren't triggering the overlay on mobile. Fix both: scroll container overflow on mobile + tap handler wiring for the image+boxscore overlay. Files: `HomeView` / `SocialFeedView` / image-overlay modal component.

**A4.2 Ideal Rotations — add drag-and-drop parity with GamePlan** ✅
Ideal Rotations view currently uses click-to-swap (or similar non-drag UI). GamePlan has drag-and-drop slot assignment — bring IdealRotation to 1:1 parity. Reuse GamePlan's drag handlers / dnd kit wiring. Files: `IdealRotationView` + reuse from `GamePlanView`.
Fix: IdealRotationTab now uses the same pointer-event drag/tap-to-swap machinery as GameplanTab (inline, not extracted). starter↔starter swaps reorder the five; bench→starter promotes and demotes the displaced starter; starter→bench mirrors. UI mirrors GameplanTab — `data-player-id`, GripVertical handles, drag transform, ring-on-select, dedicated mobile slider row, identical class structure (sky color theme preserved as IdealRotation's identity).

**A4.3 Team Intel narratives must match trading block + untouchables flags** ✅
Team Intel's written narratives ("could look to move X") sometimes reference players that aren't actually on the trading block OR list untouchables as movable. The narrative generator must read the same flags the gameplan/trading-block UI writes. Files: `TeamIntelView` narrative section + wherever `tradingBlock` / `untouchables` are persisted.
Fix: TeamIntel now hydrates own-team `untouchableIds` / `blockIds` / `targetIds` from `tradingBlockStore` and persists changes back via `saveTradingBlock`, so the narrative + the Trading Block UI + AI all read from the same source. Block narrative filters out anyone marked untouchable. `toggleUntouchable` and `toggleBlock` are now mutually exclusive — adding to one removes from the other.

**A4.4 Team Intel lineup — auto-rename positions like GamePlan (PosNameOVR format)** ✅
Team Intel lineup currently shows raw position labels (PG/SG/SF/PF/C). GamePlan and System Proficiency auto-rename based on depth context (e.g., "GF", "F", "6TH" for bench). Apply the same rename helper to the Team Intel lineup display. Target format: `PosName OVR` row, e.g. `GF F. Wagner 88`, `GF A. Black 80`, `PF P. Banchero 92`, `C B. Adebayo 86`, `C W. Carter Jr. 79`, `6TH T. da Silva 79`.
Fix: TeamIntel now routes through `StarterService.sortByPositionSlot` (same path GamePlan / IdealRotation / DepthChart use) and labels each starter with `(p.pos || 'F').toUpperCase()`, so the BBGM-tagged depth-context positions surface (Wagner-style swingmen show as `GF`, twin towers as `C C`, etc.). 6th man label preserved.

---

### Agent #5 — Team Office / Team page UI (2 items)

**A5.1 Team status dropdown (GM mode manual override)** ✅
Right now "Rebuilding / Retooling / Contending / Win-Now" status on the Team view is inferred automatically from record+age. In GM mode, expose a dropdown so the user can manually set their team's status. UI narratives, trade-outlook gates, and AI handlers that currently read the computed status should respect the manual override when `gameMode === 'gm'`. Add a `manualTeamStatus?: TeamStatus` field on the user team and fall back to computed when unset.
Fix: new `TeamStatus` type ('contending' | 'win_now' | 'retooling' | 'rebuilding'), `manualTeamStatus?` field on `NBATeam`, and `resolveManualOutlook(team, gameMode, userTeamId)` helper in `salaryUtils.ts` that returns the override TradeOutlook only when `gameMode === 'gm'` AND `team.id === userTeamId`. Dropdown wired in `TeamDetailHeader` (own team only) that dispatches `UPDATE_STATE` with the updated `teams` array. All readers wrapped to short-circuit to the override: `AITradeHandler` (AI trade buyer/seller classification), `TradeFinderView` / `TradeProposalsView` / `TradeMachineModal` / `TradeSummaryModal` / `LeagueFinancesView` (outlook maps), `TeamIntel` / `TradingBlock` / `DraftScouting` / `DraftSimulatorView` (team mode derivation). `inboundProposalGenerator` and `tradeFinderEngine` receive the already-adjusted map from callers, so they respect the override transitively.

**A5.2 New tab: Depth Chart in Team Office** ✅
Add a new "Depth Chart" tab to Team Office (opposing-GM view), since the Coaching tab isn't visible to non-owner GMs. Show starters by position + bench with player portraits + OVR. Reuse the starter-extraction logic from GamePlan / IdealRotation. Files: `TeamOfficeView` (new tab) + new `TeamOfficeDepthChartTab` component.
Fix: new `TeamOfficeDepthChartTab` component renders four sections — Starting Five (PG→C slot order via `StarterService.sortByPositionSlot`), Second Unit (top 5 bench by display OVR), Reserves (remainder), and Injured. Each card shows a `PlayerPortrait`, OVR badge, slot label, and pos. Wired into `TeamOfficeView` as the third tab (after Coaching). Visible for all teams — the Coaching tab is still auto-hidden for non-owner GMs in GM mode, so this tab becomes the primary depth read when scouting another franchise.

---

## FA Bidding — Offers Tab + Resolution Toasts

### FA.1 OFFERS tab — show the user's own bid + "Your Offer" row
Currently the OFFERS tab in `SigningModal` only renders competing AI bids (`activeBids.filter(!isUserBid)`). After the user hits "Submit Offer" (which dispatches `SUBMIT_FA_BID` and stores the bid in `state.faBidding.markets[].bids` with `isUserBid: true`), re-opening the modal shows no trace of their own bid.
Fix:
- In the OFFERS tab block (`SigningModal.tsx` ~line 1390), after the AI bids section, add a "Your Offer" card by filtering `market?.bids?.find(b => b.isUserBid && b.status === 'active')`.
- Card should mirror the AI bid row style but with a gold/green accent and label "Your Offer" instead of a team name.
- If the market resolved and the user bid has `status: 'accepted'` → show "✓ Offer Accepted" banner. If `status: 'rejected'` or `status: 'outbid'` → show "✗ Outbid — Player chose [TeamName]" with the winner's name pulled from `market.bids.find(b => b.status === 'accepted')?.teamName`.

### FA.3 Offer Strength meter on every bid card (OFFERS tab, peak FA only)
Each bid card — AI teams AND the user's own — should show a live **Offer Strength %** so the user can see how competitive each offer is at a glance.

**How to compute it:**
Use the same weighted formula from `resolvePlayerDecision` in `freeAgencyBidding.ts`:
```
salaryScore  = (bid.salaryUSD / marketValue) * 60        // salary share of cap
desScore     = teamDesirability(team, player, ...) * 0.25 // team fit
yearsScore   = Math.min(10, bid.years * 2)
optionScore  = PLAYER +5 | TEAM -2 | NONE 0
rawScore     = salaryScore + desScore + yearsScore + optionScore
```
`marketValue` uses the same K2-tier % of cap table already in `resolvePlayerDecision`.
Define a **baseline score** = a market-rate offer from a league-average team (desirability=50, years=2, NONE option):
`baseline = (1.0 * 60) + (50 * 0.25) + (2 * 2) + 0 = 60 + 12.5 + 4 = 76.5`
Then: `strengthPct = Math.round((rawScore / baseline) * 100)`
This can legitimately exceed 100 (e.g. a max salary + contending team + player option = ~130%).

**UI spec:**
- Show `strengthPct%` as a bold label on each bid card (right side, below the `$XM / Nyr` line).
- Draw a horizontal bar under the salary line; bar fill = `Math.min(100, strengthPct)%` wide, so the bar never overflows but the number can read `115%`, `130%`, etc.
- Color bands: `< 70%` → `text-white/50` gray bar, `70–99%` → amber (`#FDB927`), `≥ 100%` → green (`#22c55e`).
- User's own offer card gets the same treatment (from FA.1), so the user can immediately see if they're leading or trailing.
- Add a small label `"Offer Strength"` in `text-[8px] uppercase tracking-widest text-white/30` above the bar.
- Only visible during peak FA (the `showOffersTab` gate already handles this — no extra guard needed).

**Where to compute:**
Extract a pure helper `computeOfferStrength(bid, player, state): number` from `freeAgencyBidding.ts` (export it so SigningModal can call it client-side without duplicating the formula).

### FA.2 GM-mode toast when the player accepts or rejects your offer
When `tickFAMarkets` resolves a market that contains a user bid (`isUserBid: true`), there is currently no feedback to the user — the signing just appears silently in the news feed.
Fix:
1. In `faMarketTicker.ts`, detect after `resolvePlayerDecision` if the resolved market had a user bid. Expose the outcome on `MarketTickResult`: add `userBidResolutions: { playerName: string; accepted: boolean; winnerTeamName?: string }[]`.
2. In `simulationHandler.ts` (~line 625, after the `tick.signedPlayerIds.size > 0` log), collect `tick.userBidResolutions` into `stateWithSim.pendingFAToasts` (a new `string[]` field on `GameState` — or reuse the existing `news` array as a toast trigger).
3. In `GameContext.tsx` / the main `App`, watch `state.pendingFAToasts` and pop a toast for each entry:
   - Accepted: green toast — `"[Player] accepted your offer! $XM / Nyr"`.
   - Rejected: red/amber toast — `"[Player] chose [Team] over your offer."`.
   After displaying, clear `pendingFAToasts` via a `CLEAR_FA_TOASTS` dispatch.
   Reuse the existing `toast`/`AnimatePresence` toast pattern already in `SigningModal.tsx` — mirror it in `App.tsx` so it works globally, not just inside the modal.

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
