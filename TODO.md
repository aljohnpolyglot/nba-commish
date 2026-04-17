# NBA Commish — TODO (updated 2026-04-17, session 22)

---

## ACTIVE — Verify on New Save

- **Retirements** — formula rewritten + born.year age across ALL progression. Verify players retire properly.
- **Progression balance** — all 6 dev files now use born.year age. Verify young players don't hit 90+ OVR en masse.
- **Broadcasting cap** — mediaRights inflated at rollover, BroadcastingView reads leagueStats.salaryCap. Verify alignment.
- **Stale ages** — 9 UI components fixed to use simYear. Verify ages correct everywhere.

---

## BUGS — Remaining

### Player option timing off by 1 year
**Symptom:** Drummond accepts player option Jul 1 2026 then signs with Knicks Sep 2026 as a free agent. The option acceptance should lock him for the upcoming season but he's becoming a FA anyway.
**Root cause:** The player option check uses `contract.exp === currentYear` where `currentYear` is the season ending. If the option is for 2025-26 (exp=2026) and rollover fires at Jun 30 2026, `exp === currentYear` is true → but the option should EXTEND to 2026-27. The opt-in should set `contract.exp += 1`.
**Files:** `seasonRollover.ts` (player option block ~line 50)

### Transaction amounts showing $1M instead of actual (e.g. $600K)
**Symptom:** Two-way and minimum signings show "$1M/1yr" in TransactionsView instead of "$0.6M/1yr" or "$625K/1yr".
**Fix:** The rounding `Math.round(annualM)` rounds $0.6M → $1M. Use `annualM.toFixed(1)` or handle sub-$1M amounts.
**Files:** `simulationHandler.ts` (FA signing history text generation)

### ~~CRITICAL: Over-cap teams can't sign anyone — MLE-aware FA logic~~ ✅ FIXED
**Symptom:** 22/30 teams over cap can't sign FAs. They should use MLE.
**Fix:** In `AIFreeAgentHandler.ts`: if no cap space, check `getMLEAvailability()`, search FA pool for players ≤ MLE amount. If < 15 regular, prioritize regular signings. If 15 regular but < 3 two-way, sign two-way.
**Files:** `AIFreeAgentHandler.ts`

### NBA Finals Game 7 never simulates
**Symptom:** Finals stuck at 3-3. Game 7 never scheduled.
**Files:** `PlayoffAdvancer.ts`, `simulationHandler.ts`

### Playoff "Sim Round" button buggy
**Symptom:** Triggers jumpstart modal. Doesn't respect series length.
**Files:** `PlayoffView.tsx`

### Rookie contract length not matching Economy tab
**Symptom:** Some rookies get 1-year contracts instead of configured 2+2.
**Files:** `DraftSimulatorView.tsx`, `autoResolvers.ts`

### 2026 draft class disappearing from Draft History
**Symptom:** Some picks missing. FA draftees now included but contract length may cause early expiry.
**Files:** `DraftHistoryView.tsx`, `DraftSimulatorView.tsx`, `autoResolvers.ts`

### COY still shows "OKC Coach"
**Status:** Agent fixed case-insensitive lookup. Still showing placeholder — staff data may not load coaches.
**Debug:** Log `state.staff.coaches` at rollover.
**Files:** `AwardService.ts`, `staffService.ts`

### Team options + supermax not activating
**Symptom:** Rollover shows "0 team opts". Sim-generated contracts may not have `hasTeamOption` set.
**Files:** `seasonRollover.ts`, `salaryUtils.ts`

### Roster trimming (season 2+)
Verify `autoTrimOversizedRosters` fires correctly.

---

## BUGS — UI (Lower Priority)

### News cards missing player photos
Attach `imageUrl: player.imgURL` to news objects.

### PlayerStatsView historical: show ALL players who played for team
Filter by `stats[].tid` not `player.tid`. Show ring/All-Star badges.

### Start Date timeline UI
Reverted to 1 season. Manual date input for multi-season jumps.

---

## FEATURES — Next Priority

### AI trade: contending teams protect K2 80+ players
### Dead money / ghost contracts (Luol Deng rule)
### BroadcastingView auto-inflation (inflate broadcaster offers)
### Image caching (Performance setting)

---

## FUTURE / BACKLOG

### Live Trade Debug UI (GM Dashboard)
### External League Economy (constants ready in `constants.ts`)
### Career highs tracking for PlayerBioView

---

## SEPARATE DEVELOPMENTS (Accounts)

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

## FIXED ✅ (Session 22 — 60+ items)

**Architecture:**
- §1 UNIFIED SIMULATION ENGINE — `runLazySim` single engine for ALL multi-day advances
- ADVANCE_DAY event date-match — `>=` fires on exact day
- Simulate-to-Date always overlay — progress screen for all skips
- `computeAge()` helper created in `helpers.ts` — canonical age calculation

**Age System (ROOT CAUSE FIX):**
- ALL 6 progression files use `born.year` age (was using stale `player.age` from BBGM load)
- 9 UI components fixed to use `simYear - born.year`
- ProgressionEngine, seasonalBreakouts, washedAlgorithm, bustLottery, retirementChecker, trainingCampShuffle
- PlayerCard, FreeAgentCard, UniversalPlayerSearcher, PlayerRatingsModal, PlayerStatsView, etc.

**Retirement:**
- Formula rewritten for BBGM scale (65+ = All-Star immune through 37, proper age scaling)
- born.year age fallback (was defaulting to 0 → nobody hit 34+ threshold)
- Debug logging: `[Retirement] player (age X, OVR Y) — prob Z%, roll W → RETIRED/SURVIVED`

**Rollover:**
- Team W-L reset + archive to team.seasons[]
- Team streak reset
- July games guard (batch=1 near Jun 30)
- Award Races offseason screen
- Broadcasting cap: mediaRights inflated at rollover, display reads leagueStats.salaryCap
- Season Preview → Oct 1, rank-based tiers, O/U only
- Player options date → Jul 1
- Career OVR snapshot (ovrHistory[])
- Playoff archival (state.historicalPlayoffs[year])
- PlayoffView: BracketLayout for ALL views (live, historical, empty)

**Features:**
- F2-F7: signing cards, training camp cut, FAME trait, G-League filters, Draft History, Stats tab
- Training camp shuffle (1/3 progress/stale/regress)
- Shams transaction tweets
- MLE column in Cap Overview
- Draft picks in TransactionsView (purple Trophy icon)
- Standings year chevron (box score derived)
- League Leaders + Statistical Feats year chevrons
- Game log playoff/play-in labels (PLF/PI)
- Progression dark colors (ensureVisibleColor)

**Bug fixes:**
- AI contractYears sync (3 paths + history preservation)
- ImageGen guard (enableLLM)
- POT mismatch (overallRating + born.year)
- Minutes cap (reg ~40-42, playoffs ~44-46 + isPlayoffs knob)
- G-League DNP (allSimResults GP + trade grace period)
- B-League signing (fallback chain)
- COMPETITOR morale (effectiveRecord)
- PBA preseason (per-team knobs)
- Social feed perf (removed JSON.stringify cascade)
- Two-way OVR cap (≤45)
- Double team name fix
- Nick Smith Jr. dedup (normName strips Jr/Sr/II/III/IV)
- COY case-insensitive lookup
- Save isolation (unique saveId)
- Vet age gate (36+ K2<72 skip routing)
- bioCache hardcoded age removed
- storyGenerator crash (injury null guard)
- Draft R?P? defensive display
- Twitter avatar fallback

## FIXED ✅ (Sessions 8–21)

146+ items. See git history and session memory files.

*Last updated: 2026-04-17 (session 22)*
