# NBA Commish — TODO (updated 2026-04-17, session 22)

---

## ACTIVE — Verify on Next Playthrough

- **TeamFinancesView timeline rollover** — likely auto-resolved by session 21. Verify columns shift.
- **ContractYears history preservation** — fixed session 22. Verify on NEW save.
- **July games after rollover** — batch=1 near Jun 30 + yearAdvanced safeSchedule guard added. Verify no ghost games.
- **Retirements in season 2+** — code is wired (`retirementChecker` called at rollover). Verify players actually retire.

---

## BUGS — Season 2+ Rollover Issues

### G-League trade grace period ✅ FIXED
`yearsWithTeam === 0 && teamGP < 14` guard prevents immediate assign/recall loop for traded players.

### Standings / NBA Central stale W-L after rollover
**Root cause:** If July games leak past rollover, W-L accumulates on zeroed teams. Also `effectiveRecord()` fallback shows last season when `gp=0`.
**Fix:** Standings should show raw `team.wins/losses`. `effectiveRecord` only for morale/trade outlook.

### Two-way contract distribution (season 2+)
Some teams get 4+ two-way, others get 0. Needs: (1) respect `maxTwoWayPlayersPerTeam`, (2) ensure every team gets 1-2 at training camp.

### Roster trimming (season 2+)
Verify `autoTrimOversizedRosters` fires in preseason (21 limit) and regular season (15 limit) for season 2+.

### Historical playoff bracket not saved for completed season
**Symptom:** After rollover, PlayoffView shows "No bracket data for 2025-26" even though the 2025-26 playoffs were completed. The historical bracket gist only has real NBA data (1946-2025), not sim-generated seasons.
**Root cause:** `lazySimRunner.ts` writes `seasonHistory` entry on `bracketComplete`, but the actual playoff bracket data (`state.playoffs.series[]`) is cleared at rollover. The `HistoricalPlayoffBracket` component fetches from gist, which doesn't have sim-generated data.
**Fix:** At rollover, archive `state.playoffs` (series, champion, bracket) to `state.historicalPlayoffs: Record<number, PlayoffBracket>`. `HistoricalPlayoffBracket` should check `state.historicalPlayoffs[year]` first, then fall back to gist.
**Files:** `seasonRollover.ts` (archive playoffs before clearing), `HistoricalPlayoffBracket.tsx` (check state first)

### Power Rankings View rollover
Shows stale W-L columns after rollover. Add `totalGP === 0` guard → show preseason-only OVR rankings.

---

## BUGS — UI

### League Leaders View — season year chevron
Add `<2026>` year chevron. Filter leaders by season. **Files:** `LeagueLeadersView.tsx`

### Statistical Feats View — season year chevron
Add `<2026>` year chevron. Filter feats by season. **Files:** `StatisticalFeatsView.tsx`

### External league players losing portraits after routing
NBA players routed to G-League/PBA lose ProBallers portrait. LOAD_GAME migration may strip imgURL on status change. **Fix:** Don't touch `imgURL` for players with ProBallers URLs regardless of status.

### News cards missing player photos
Transaction news (signings, player options) show blank image. Attach `imageUrl: player.imgURL` to news objects.

---

## FEATURES — Next Priority

### AI trade: contending teams protect K2 80+ players
Bump protection from K2 78 → 80. Sort tradeable players K2 ascending (worst first) when building packages.

### Dead money / ghost contracts (Luol Deng rule)
Waived players' remaining guaranteed salary counts against cap. `deadContracts[]` on team state. Gray dashed row in TeamFinancesView.

### MLE remaining column in Cap Overview
Add column next to Payroll in `LeagueFinancesView.tsx`.

### BroadcastingView auto-inflation
Cap should grow automatically at rollover even if commissioner doesn't touch BroadcastingView.

### Image caching (Performance setting)
Cache player portraits in localStorage/IndexedDB. Default ON. `SettingsModal.tsx` Performance tab.

---

## FUTURE / BACKLOG

### Live Trade Debug UI (GM Dashboard)
- **Trading Block** — mood ≤ −3 players, toggleable `onTradingBlock` flag
- **Team Needs** — 30 teams × 5 positions heatmap
- **Untouchables** — `player.untouchable` flag; AI never proposes them

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

## FIXED ✅ (Session 22 — 30+ items)

- **§1 UNIFIED SIMULATION ENGINE** — `runLazySim` single engine for ALL multi-day advances
- **ADVANCE_DAY event date-match** — `>=` so events fire on exact day
- **Simulate-to-Date always overlay** — progress screen for all skips (batchSize 1 vs 7)
- **Season Preview** — Oct 1 trigger, rank-based tiers, double name fix, W-L→O/U only, nav date-gated
- **F2-F7** — signing cards clickable, training camp cut, FAME trait, G-League filters, Draft History View, Stats tab upgraded
- **AI contractYears sync** — all 3 signing paths + history preservation
- **ImageGen guard** — checks enableLLM
- **POT mismatch** — overallRating + born.year age
- **Minutes cap** — reg ~40-42, playoffs ~44-46 with jitter + isPlayoffs knob
- **G-League DNP** — reads GP from allSimResults + trade grace period
- **B-League signing** — fallback chain fix
- **COMPETITOR morale** — effectiveRecord for offseason
- **Draft R?P?** — defensive display fallback
- **PBA preseason** — per-team knobs (NBA vs intl)
- **Twitter avatar** — post feed fallback
- **Shams transactions** — buildShamsTransactionPost for signings/extensions
- **Social feed perf** — removed JSON.stringify cascade + SET_FEED dispatch
- **Team W-L reset** — rollover now zeros wins/losses + archives to team.seasons[]
- **Team streak reset** — prevents "rock bottom" news after rollover
- **July games guard** — batch=1 near Jun 30 + yearAdvanced safeSchedule
- **Award Races offseason** — "season hasn't started" screen
- **PlayoffView** — shows last year's historical bracket when no active playoffs
- **Progression dark colors** — ensureVisibleColor() luminance check
- **Career OVR snapshot** — ovrHistory[] at rollover, chart reads it
- **Player options date** — Jul 1 so they show in new season TransactionsView
- **Player option history** — seasonRollover writes playerOptionHistory + news

## FIXED ✅ (Sessions 8–21)

146+ items. See git history and session memory files.

*Last updated: 2026-04-17 (session 22)*
