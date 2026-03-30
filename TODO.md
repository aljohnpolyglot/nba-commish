# NBA Commish — Outstanding Tasks

## Session 2026-03-31

### CRITICAL BUGS

- [x] **Leave game bug — simulates another set of games when clicking Leave**
  - **File:** `src/components/central/view/NBACentral.tsx` (line 390–394)
  - **Bug:** `onClose` handler calls `ADVANCE_DAY` without first recording the watched game via `RECORD_WATCHED_GAME`. The game remains unplayed, so `ADVANCE_DAY` re-simulates it producing a duplicate result.
  - **Fix:** Simulate the game silently first (`GameSimulator.simulateGame`), dispatch `RECORD_WATCHED_GAME`, then `ADVANCE_DAY` with `watchedGameResult`.
  - **Status:** ✅ DONE

- [x] **PlayerBioView — Oct 24 (opening night) games tagged as preseason in gamelog**
  - **File:** `src/components/central/view/PlayerBioView.tsx` (line 195–196)
  - **Bug:** DNP-row `isPreseason` check is `schedGame?.isPreseason === true || date < OPENING_NIGHT_MS`. No date guard on the first clause, so any Oct-24 game whose schedule entry has `isPreseason: true` gets misflagged.
  - **Fix:** Wrap both clauses under a `gameMs < OPENING_NIGHT_MS` guard, matching the played-game logic above.
  - **Status:** ✅ DONE

### SPORTSBOOK

- [x] **My Bets — team logo on ML/spread/O-U bet cards**
  - **File:** `src/components/central/view/SportsBookView.tsx` (~line 601)
  - **Bug/Request:** Only single-leg player props show a portrait. Team-type bets (moneyline, spread, over/under) show nothing.
  - **Fix:** Detect team-based bet via `leg.condition` (away_win / home_win / *_spread / *_team_total_*). Find the relevant team via `leg.gameId` + schedule. Render team logo.
  - **Status:** ✅ DONE

- [x] **My Bets — "Biggest Lost" highlight card**
  - **File:** `src/components/central/view/SportsBookView.tsx`
  - **Request:** Show a prominent card that surfaces the user's single biggest losing bet.
  - **Status:** ✅ DONE

- [x] **My Bets — pagination (no more pruning)**
  - Already implemented (BETS_PER_PAGE = 20, prev/next). ✅ Already working.

### PLAYER BIO VIEW

- [ ] **Traded player gamelog — DNP rows may show incorrect team**
  - **File:** `src/components/central/view/PlayerBioView.tsx`
  - **Status:** TODO

### MOBILE FIXES

- [ ] **Broadcasting view mobile**
  - `src/components/operations/BroadcastingView.tsx`
  - **Status:** TODO

- [x] **Commish Store + Real Stern mobile header**
  - **CommishStore:** `xs:hidden`/`xs:inline` → `sm:hidden`/`sm:inline` (xs is not a Tailwind breakpoint)
  - **RealStern:** Long raw number → `formatWealth()` helper giving "$1.20M" / "$1.23B" format
  - **Status:** ✅ DONE

- [x] **Trade Machine modal mobile compatibility**
  - Made wrapper scrollable, action bar sticky on mobile, columns have min-height, removed fixed h-[85vh]
  - **Status:** ✅ DONE

- [x] **League Transactions view mobile**
  - Header: `p-8` → `p-4 sm:p-8`, `text-3xl` → `text-xl sm:text-3xl`, search input full-width on mobile
  - **Status:** ✅ DONE

- [x] **Free Agents view mobile**
  - Header icon/text/padding scaled down for mobile
  - **Status:** ✅ DONE

- [x] **Statistical Feats header + filters mobile**
  - Header padding, font sizes, filter gaps all scaled with sm: breakpoints; summary box counts/labels also scaled
  - **Status:** ✅ DONE

### TRADE MACHINE

- [x] **Salary cap validation — trades showing valid even with cap mismatch**
  - **File:** `src/components/modals/TradeMachineModal.tsx` (line 158–165)
  - **Bug:** `maxA = teamASalary * 1.25 + 100000` — the `100000` is in the same unit as contracts (thousands of dollars), so it adds a $100 **billion** buffer, meaning salary mismatch is almost never detected
  - **Fix:** `+ 100` (100 thousands = $100K, the correct NBA trade exception buffer)
  - **Status:** ✅ DONE

### EMAIL SYSTEM

- [x] **Elton Brand / Steve Ballmer duplicate topic spam**
  - **File:** `src/store/logic/turn/communicationHandler.ts` (line 136–138)
  - **Bug:** Deduplication only checked by email `id` (always unique via Date.now()), so same sender + same subject emails were never filtered
  - **Fix:** Added sender+subject key dedup set, skipping new emails where that key already exists in inbox
  - **Status:** ✅ DONE

- [x] **LLM email replies — okay to not reply, stop generating repetitive follow-ups**
  - **File:** `src/services/llm/prompts/simulation.ts` (email generation section)
  - **Fix:** Added explicit instructions: 0 emails is fine, no repetitive follow-ups from same sender/topic, thread-aware replies must answer specific questions, "silence is okay"
  - **Status:** ✅ DONE

### WATCH GAME LIVE

- [ ] **Show injured/DNP players with 0 min + reason (mirror box score modal)**
  - `src/components/shared/GameSimulatorScreen.tsx`
  - **Status:** TODO

### MISC

- [x] **Clicking league news crashes game**
  - **File:** `src/components/NewsFeed.tsx` (line 159–160)
  - **Bug:** `state.news.filter(...)` throws if `state.news` is undefined in older save states
  - **Fix:** Changed to `(state.news || []).filter(...)`
  - **Status:** ✅ DONE

- [x] **Trades/FA not triggering LLM call — no reactions, generic outcome text**
  - **Files:** `src/services/llm/services/freeAgentService.ts`, `src/store/logic/actions/tradeActions.ts`, `src/store/logic/actions/playerActions.ts`
  - **Bug 1:** `generateFreeAgentSigningReactions` used bare `JSON.parse(text)` — if LLM returned JSON in markdown code blocks or truncated it, parse failed silently → empty reactions.
  - **Bug 2:** `advanceDay` for trades/signings passed `storySeeds = []` and included raw `transaction`/`announcements` objects in the payload (noise in the prompt). Without story seeds the LLM had no instruction to generate trade/signing-specific social reactions.
  - **Fix:** (1) Added `cleanLLMJson` + `repairTruncatedJson` logic to FA service. (2) Added explicit story seeds for EXECUTIVE_TRADE, FORCE_TRADE, and SIGN_FREE_AGENT that instruct the LLM to generate insider tweets and fan reactions. (3) Stripped noisy `transaction`/`announcements` from the payload.
  - **Status:** ✅ DONE

- [x] **Commissioner's diary — trade actions missing / format wrong**
  - **Files:** `src/store/logic/gameLogic.ts`, `src/components/central/view/LeagueEvent.tsx`
  - **Bug:** All history entries typed as `'League Event'`; diary filter excluded entries with words like "traded"/"signed"; no icons for Trade/Signing/Waive/Suspension.
  - **Fix:** History type now set per action (`EXECUTIVE_TRADE`→'Trade', `SIGN_FREE_AGENT`→'Signing', etc.). Diary always shows typed commissioner actions; added icons for all transaction types; filter uses `entry.type` instead of fragile text-regex.
  - **Status:** ✅ DONE

---

## Backlog (pre-session)

### Preseason International Games
- Modal exists and dispatches correctly
- Not yet surfaced on the schedule view for preseason dates
- Games may not simulate correctly if `KNOBS_PRESEASON` is not applied

---

*Last updated: 2026-03-31*
