# NBA Commish — TODO (updated 2026-04-17, session 22)

---

## ACTIVE — Verify on Next Playthrough

- **Retirements** — retirement formula rewritten to use raw BBGM OVR (was inflated by 2K conversion). Verify players now retire.
- **ContractYears history** — fixed session 22. Verify on NEW save.
- **July games** — batch=1 near Jun 30 + yearAdvanced guard. Verify no ghost games.
- **Roster trimming** — verify `autoTrimOversizedRosters` fires in season 2+.

---

## BUGS — Remaining

### Start Date timeline UI broken for multi-season
**Symptom:** Timeline squished — 4 years (2025-2029) crammed into 1600px designed for 1 year. Labels overlap, zones don't loop per season.
**Fix:** Scale `TRACK_WIDTH` proportionally to day range, or loop the timeline per-season with year labels. The zone colors (offseason/early/mid/late) should repeat each season.
**Files:** `StartDateTimeline.tsx`, `keyDates.ts`

### NBA Finals Game 7 never simulates
**Symptom:** Finals series stuck at 3-3 ("SERIES IN PROGRESS") — Game 7 never gets scheduled/simulated. May be a schedule conflict or the PlayoffAdvancer not injecting Game 7 for the Finals round.
**Files:** `PlayoffAdvancer.ts` (game injection for round 4), `simulationHandler.ts` (playoff logic)

### Playoff "Sim Round" button buggy
**Symptom:** Sim Round in PlayoffView header triggers the jumpstart commissioner setup modal. Also doesn't respect series length — should sim until Game 7 resolves (if exists) or Game 4 (if sweep).
**Fix:** Check what action `handleSimulateRound` dispatches. It may be dispatching wrong action type. Also: sim should advance to furthest unplayed game date in the current round.
**Files:** `PlayoffView.tsx` (sim round handler)

### PlayerStatsView historical: show ALL players who played for team that season
**Symptom:** When viewing historical season stats for a team (e.g. CHI 2026-27 Playoffs), only currently rostered players show. Traded/released players who played that season are missing.
**Fix:** Filter by `stats[].tid === teamId && stats[].season === selectedYear` instead of `player.tid === teamId`. Players still on the team get normal styling; former players get dimmed/italic.
**Files:** `PlayerStatsView.tsx` (historical season filter)
Also: show 🏆 ring icon and ⭐ All-Star badge next to player name if they won a championship or made All-Star that season (read from `player.awards[]`).

### Broadcasting salary cap doesn't match leagueStats cap after inflation
**Symptom:** BroadcastingView shows $154M but leagueStats.salaryCap is $164M after inflation. They don't align.
**Root cause:** Inflation is applied at rollover to `leagueStats.salaryCap` but BroadcastingView derives cap from its own formula (`totalRev / 14.3 × 154.6`). These are independent calculations.
**Fix:** Either (1) BroadcastingView reads `leagueStats.salaryCap` instead of computing its own, or (2) apply inflation to the broadcasting revenue inputs so the derived cap matches.
**Files:** `BroadcastingView.tsx`, `seasonRollover.ts` (inflation), `inflationUtils.ts`

### Team options + supermax not activating in season 2+
**Symptom:** Rollover shows "0 team opts exercised / 0 team opts declined". Team options and supermax eligibility may not be checked correctly for sim-generated contracts.
**Files:** `seasonRollover.ts` (team option block), `salaryUtils.ts` (supermax eligibility)

### COY still shows "OKC Coach" after fix
**Symptom:** Agent fixed case-insensitive lookup but COY still shows placeholder. The staff gist data may not have coaches loaded, or the coach field names don't match.
**Debug:** Check if `state.staff.coaches` is populated. Log the coach lookup in AwardService.
**Files:** `AwardService.ts`, `staffService.ts`

### Progression system too aggressive — too many 90+ OVR young players
**Symptom:** Every U22 player reaches 90+ OVR. Lightning strikes + daily progression + training camp shuffle compound.
**Fix:** Audit all progression systems. Net progression should be ~zero-sum across the league (gains ≈ declines). May need to reduce `calcBaseChange` for ages 19-22, reduce training camp shuffle deltas, or add regression systems for overperformers.
**Files:** `ProgressionEngine.ts`, `trainingCampShuffle.ts`, `seasonalBreakouts.ts`, `washedAlgorithm.ts`

### Youth progression too aggressive
**Symptom:** Every player under 22 reaches 90+ OVR — 5 Derrick Rose/Luka/Wemby-tier players in one draft class. The training camp shuffle + seasonal breakouts + daily progression compound too much for young players.
**Fix:** Review `ProgressionEngine.ts` age brackets — `calcBaseChange` for ages 19-22 may be too generous. Also verify `trainingCampShuffle` progress bucket delta (+2 to +4 per attr × 14 attrs = up to +56 total) isn't too much.
**Files:** `ProgressionEngine.ts`, `trainingCampShuffle.ts`, `seasonalBreakouts.ts`

---

## RECENTLY FIXED (Session 22 Agents)

- **~~Retirement bug~~** ✅ — `retireProb()` was using 2K-inflated OVR (raw 67 → 2K 90 = "never retire"). Rewritten to use raw BBGM OVR directly. Age 45+ auto-retire, 43-44 high chance but LeBron-tier (OVR 70+) can survive.
- **~~bioCache hardcoded age~~** ✅ — removed `SIM_DATE = new Date("2026-01-08")`, now accepts `simYear` param from `state.leagueStats.year`
- **~~Nick Smith Jr. dedup~~** ✅ — `normName` strips Jr/Sr/II/III/IV suffixes. All external league dedup filters now use `normName()` consistently.
- **~~COY "SAS Coach"~~** ✅ — case-insensitive coach lookup in AwardService
- **~~Save isolation~~** ✅ — `saveId` now includes `Date.now() + random suffix`. Each save gets unique seed.
- **~~Draft History missing FAs~~** ✅ — includes `tid === -1` players with valid draft data
- **~~Draft picks in TransactionsView~~** ✅ — `'Draft'` type with purple Trophy icon, ordinal suffix ("1st overall pick"), filter option added
- **~~Portrait preservation~~** ✅ — confirmed LOAD_GAME doesn't strip ProBallers URLs (was already correct)

---

## FEATURES — Next Priority

### AI trade: contending teams protect K2 80+ players
### Dead money / ghost contracts (Luol Deng rule)
### BroadcastingView auto-inflation
### Image caching (Performance setting)

---

## FUTURE / BACKLOG

### Live Trade Debug UI (GM Dashboard)
### External League Economy (constants ready in `constants.ts`, see `NEW_FEATURES.md`)
### Career highs tracking for PlayerBioView
### News cards player photos

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

## FIXED ✅ (Session 22 — 45+ items)

See git history. Highlights: unified sim engine, training camp shuffle, playoff bracket archival, year chevrons on all views, two-way OVR cap, MLE column, standings from box scores, career progression chart, Shams transaction tweets, social feed perf, rollover team reset, and more.

*Last updated: 2026-04-17 (session 22)*
