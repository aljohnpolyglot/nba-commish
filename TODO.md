# NBA Commish — TODO (updated 2026-04-17, session 22)

---

## ACTIVE — Verify on New Save

- **Retirements** — formula rewritten + born.year age. Verify proper retirement rates.
- **Progression balance** — all 6 dev files use born.year. Verify no more 90+ OVR inflation.
- **Player/team options** — timing fixed to `nextYear`. Verify options fire correctly.
- **MLE signings** — 3-pass system. Verify over-cap teams sign FAs via MLE.
- **Rookie contracts** — autoRunDraft sets hasTeamOption + teamOptionExp. Verify 2+2 deals.
- **Broadcasting cap** — mediaRights inflated. Verify cap alignment.
- **Two-way cap** — Pass 3 checks existing count. Verify max respected.
- **Finals Game 7** — lazy sim loop fixed. Verify series complete.

---

## BUGS — Remaining

### MLE contract cells in TeamFinancesView
Legend added (cyan). Need `player.mleSignedVia` tracked at signing for cell coloring.

### COY still shows "OKC Coach"
Agent broadened matching. May need staff data load verification. Debug logs added.

### Inflation editor in Game Settings (BBGM-style)
Add Min/Max/Avg/StdDev % inputs to Economy tab. Values already in leagueStats.

### BroadcastingView still shows $154.6M static
Agent fixed read-only display. Verify on new save. May need further broadcaster offer inflation.

---

## BUGS — UI

### Team records not passed to League History view
**Symptom:** League History best records section doesn't show sim-generated season records. Only shows historical data.
**Fix:** At rollover, `team.seasons[]` is archived (done session 22). League History view needs to read from `team.seasons[]` for best records display.
**Files:** `LeagueHistoryView.tsx` or `LeagueHistoryDetailView.tsx`

### News cards missing player photos
### PlayerStatsView historical: show ALL players + ring/All-Star badges
### Start Date timeline: reverted to 1 season, manual date for multi-season

---

## FEATURES — Next Priority

### AI trade: contending teams protect K2 80+ players
### Dead money / ghost contracts (Luol Deng rule)
### Image caching (Performance setting)

---

## FUTURE / BACKLOG

### Live Trade Debug UI (GM Dashboard)
### External League Economy (constants in `constants.ts`)
### Career highs tracking
### DraftClassGenerator for 2029+ seasons

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

## FIXED ✅ (Session 22 — 70+ items)

**Root cause: Age system** — ALL progression + UI used stale `player.age`. Now uses `born.year`. `computeAge()` helper created.

**Retirement** — BBGM-scale thresholds, born.year fallback, debug logging.

**Options** — player/team options check `nextYear` (gist labels option on the season it applies to). `autoRunDraft` sets hasTeamOption/teamOptionExp/restrictedFA.

**Simulation** — unified engine (runLazySim), ADVANCE_DAY `>=`, Finals G7 fix (sim target day), overlay for all sim-to-date.

**Economy** — MLE 3-pass FA signing, MLE column in Cap Overview, broadcasting cap inflated at rollover, save isolation (unique saveId).

**Draft** — draft picks in TransactionsView, Draft History includes FAs, rookie contracts match Economy tab, Nick Smith Jr. dedup.

**UI** — year chevrons (Standings, League Leaders, Statistical Feats), playoff bracket (BracketLayout everywhere), Award Races offseason, Power Rankings preseason, game log PLF/PI labels, progression dark colors, career OVR snapshot, training camp shuffle, Shams transactions, social feed perf, Season Preview Oct 1.

**Rollover** — team W-L reset, streak reset, July games guard, player options Jul 1 date, bioCache age, vet age gate, two-way OVR cap, double team name, B-League bio gist URL, transaction amounts (sub-$1M), storyGenerator crash, COY case-insensitive, roster trim logging.

**Plus 146+ items from sessions 8–21.**

*Last updated: 2026-04-17 (session 22)*
