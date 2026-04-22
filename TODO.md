# NBA Commish — TODO

## FIXED — Session 2026-04-22

- ✅ **Lazy sim draft pick ownership** (`autoResolvers.ts`) — Drafted slots now correctly resolve to the *current owner* of the pick, not the original team. Adds `r1TradedMap`/`r2TradedMap` from `state.draftPicks` and a `resolvePickOwner()` helper that swaps in the trade recipient before building `draftOrder`.

- ✅ **Jump start simulates to X instead of X-1** (`initialization.ts`) — Added `stopBefore: true` to the `lazySimTo()` call in `handleStartGame`, so pick-a-date on game start now lands with that day's games still unplayed (same behavior as "Simulate To Date" from the schedule).

- ✅ **Mobile player selector modal header cutoff** (`TeamIntel.tsx`, `TradingBlock.tsx`) — Changed `max-h-[92vh]` → `max-h-[92dvh]`. On iOS, `vh` includes browser chrome in measurement, pushing the header (Done button) above the visible area. `dvh` always measures the actual visible viewport.

- ✅ **SigningModal unscrollable on mobile** (`SigningModal.tsx`) — Three-part fix:
  1. Backdrop: `overflow-y-auto` → `overflow-hidden` (pointer-events-none meant touch-scrolling was always broken anyway)
  2. Inner modal: `min-h-screen` → `h-[100dvh]` — gives the flex chain a real fixed height on mobile, which makes `flex-1 overflow-y-auto` inside actually scroll instead of expanding infinitely
  3. Middle flex container: `overflow-visible` → `overflow-hidden` — was breaking the scroll chain; desktop already had `lg:overflow-hidden`

- ✅ **SigningModal year display off by +1** (`SigningModal.tsx`) — Cap projection rows were displaying `row.year–{row.year+1}` but `row.year` was already the season end year. Fixed to `{row.year - 1}–{String(row.year).slice(-2)}`.

- ✅ **Minimum roster gate blocking FA signings** (`useRosterComplianceGate.tsx`) — The `< minRoster` guard was firing year-round. Now only enforces during regular season OR while the user's team is still in playoffs. Training camp / offseason (Jul–Oct 21) and post-elimination are unrestricted.

- ✅ **Team option showing "Unknown" in PlayerBioView** — Two-part fix:
  - `PlayerBioContractTab.tsx`: added `lastKnownTeamName` fallback — when a season has no stat entry (cut/FA mid-contract), it now reuses the most recently known team name instead of falling back to "Unknown".
  - `rosterService.ts` (`applyContractOverrides`): added `teamOptionExp: hasTeamOption ? expYear : undefined` so the `seasonRollover` team-option guard (`teamOptExp !== nextYear`) fires correctly.

- ✅ **TeamDetailView tab bar horizontal overflow on mobile** (`TeamDetailView.tsx`) — Tab container now has `overflow-x-auto [scrollbar:hidden]` and every button has `shrink-0` so the Moves tab (added after Stats) doesn't wrap or get clipped.

- ✅ **MLE signings picking up draft prospects** (`rosterService.ts`, `AIFreeAgentHandler.ts`, `faMarketTicker.ts`) — Fixed `> startYear` → `>= startYear` for current-year prospect classification, plus runtime guards in FA pool filters to exclude players with `draft.year >= currentYear`.

- ✅ **DayView mobile layout** (`DayView.tsx`) — Outer div changed from `flex-1` to `min-h-full`. `flex-1` was constraining the container to the parent's leftover height and clipping the overflow; `min-h-full` lets the game grid grow naturally and the parent `overflow-y-auto` wrapper in ScheduleView handles the scroll.

- ✅ **Resign blocked when roster full** (`SigningModal.tsx:596`) — The roster-full preflight was blocking re-signings even though they don't add roster slots (player is already on team). Changed condition from `if (roster.totalFull && !rosterFullOverridden)` to `if (roster.totalFull && !rosterFullOverridden && !isResign)` so re-signings always go through.

---

## BUGS — Active / High Priority

- **Double draft dates on calendar** — ✅ FIXED. `getDraftDate()` returned Jun 25 but both `lazySimRunner.ts` and `gameLogic.ts` hardcoded Jun 26 as the execution date, so `draftDayStr2` was added as a band-aid to mark both days visually. Removed `draftDayStr2` from CalendarView and aligned sim execution to Jun 25 in both lazySimRunner and gameLogic.

- **Gameplan rotation minutes drift off 240 after major transactions ✅** — After a trade or signing that changes the active roster, the saved gameplan's `minuteOverrides` can total 241+ (rounding from the old player set survives into the new one). The seeding effect re-seeds from the saved plan without re-normalizing, so the total stays off. Reproduce: trade away a rotation player mid-season, open Gameplan tab — total shows 241. Fix: normalize the seeded total to 240 in the seeding `useEffect`, same way `resetToAuto` does.

---

## BUGS — Cosmetic

- **Statistical feats overwrite team records** — When a sim feat fires it should *merge* with the gist team history, not overwrite the existing high value.✅

---

## FEATURES — Backlog (low priority)

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for **DraftScoutingView**:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

### External-league roster repopulation at rollover
Nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

### Dead money / ghost contracts (Luol Deng rule)
Waived-player stretch across multiple years.

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