# NBA Commish — TODO (updated 2026-04-17, session 23)

---

## ACTIVE — Verify on New Save

- **Retirements** — legendMult applied to ALL tiers + user All-Star clamps. Verify LeBron/Curry survive past 2026.
- **Two-way contracts** — twoWay flag transferred, maxTwoWay=3, OVR cap=52. Verify 15+3 rosters.
- **Rookie team options** — teamOptionExp fixed (was off-by-1). Verify no instant decline after draft.
- **Player option chronology** — options Jun 29, FA Jun 30+. Verify correct order in TransactionsView.
- **Draft pick trading** — completed picks filtered. Verify no past-draft picks tradeable.
- **Playoff game log** — per-game opening night. Verify no PLF as PRE.
- **Image caching** — IndexedDB auto-download, default ON. Verify cache works.
- **External league economy** — contracts generated at routing. Verify salary in PlayerBio.
- **Exhibition stale scores** — pruned at rollover. Verify clean All-Star Weekend in season 2.
- **MLE tracking** — `mleSignedVia` now saved on player. Verify TeamFinancesView can color cells.
- **COY coach name** — staff lookup fix (agent). Verify real coach name shows.
- **Dashboard salary cap** — reads live `leagueStats.salaryCap`. Verify updates after rollover.
- **League History best records** — reads from `team.seasons[]`. Verify sim seasons show.
- **News card photos** — player portraits on news cards. Verify photos render.
- **PlayerStatsView historical** — shows all players + ring/All-Star badges.

---

## BUGS — Remaining

### CRITICAL: Injured players get tid changed to G-League — breaks game log + creates fake transactions
Root cause: roster trim sends injured players to G-League by changing `player.tid` to the affiliate. This causes: (1) NBA games vanish from game log during assignment, (2) fake "assigned to G-League" transactions for stars like Paul George, (3) game log rank resets when player returns, (4) box score shows them on the team but game log doesn't.
**Fix:** Don't change `tid` for injured players. Use `gLeagueAssigned: true` flag only (already exists). Game log checks `player.tid` which stays as the NBA team → DNP entries show correctly. Guard: never G-League assign K2 >= 78 players.
**Files:** `simulationHandler.ts` (roster trim / G-League assignment block), `PlayerBioGameLogTab.tsx` (already works if tid stays correct)

### StarterService produces wrong lineups (Tatum benched for Pritchard)
Role-first slot filling skips high-OVR players when their classified role doesn't match open slots. Fix: start top-5 by OVR, THEN assign positions by best fit. Affects TeamIntel lineup, WatchGamePreviewModal, and sim engine.
**Files:** `StarterService.ts`

### Nepotism / family ties system
Brothers on same team (Antetokounmpo, Ball, Holiday, etc.) should: (1) never appear on trading block together, (2) get morale boost from playing with family. Use `rosterService` relatives data to detect family ties. Thanasis/Alex shouldn't be trade block candidates if Giannis is untouchable — they're package deals. Wire into `isOnTradingBlock()` + `computeMoodScore()`.

### Draft Scouting: projected team per pick slot + player comparisons use POT not just OVR
Mock draft should show which team is projected at each slot. Player comparison tool (if exists) should weight POT for young players, not just current OVR. DraftScouting tab already has the 70/30 value/fit scoring — wire it into the main sidebar DraftScoutingView as well.

### Unify AI trades with TradeFinder engine
Extract `findOffers` core logic from `TradeFinderView.tsx` into `src/services/trade/tradeFinderEngine.ts`. Both TradeFinder UI and `AITradeHandler` should call the same engine. Delete duplicate trade generation code in AITradeHandler. One source of truth for all trades.
**Files:** `TradeFinderView.tsx`, `AITradeHandler.ts`, new `tradeFinderEngine.ts`

### All-Star Weekend dates use static dates instead of day-of-week resolvers
Need `resolveSeasonDate()`-style helpers so All-Star Sunday = Sunday, Saturday = Saturday.
**Files:** `dateUtils.ts`, `autoResolvers.ts` / `lazySimRunner.ts`

### Inflation editor in Game Settings modal
Add Min/Max/Avg/StdDev % inputs to `SettingsModal.tsx`. Values already in leagueStats.

### Start Date timeline: reverted to 1 season, manual date for multi-season

---

## FEATURES — Next Priority

### GM Mode (see `GM_MODE_README.md`)
Phase 1: mode toggle + sidebar gating + player action filtering + settings toggle
Phase 2: trade system (lock to user team, AI accept/reject)
Phase 3: FA signing modal (contract builder, value meter, cap display)
Phase 3.5: Draft — "Sim One Pick" + "Sim to My Pick" buttons

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

## FIXED — Session 23 (12+ items)

Retirement legendMult, two-way contracts (3 bugs), rookie team option off-by-1, player option chronology, draft pick trade filter, playoff game log PRE fix, G-League "overseas" label, image caching (IndexedDB), exhibition stale scores pruned, dead PlayoffView chevron removed, external league economy (contracts + salaries), mobile pagination + All-Star box score clickable, MLE tracking, COY coach name, Dashboard salary cap, League History records, news photos, PlayerStats historical.

## FIXED — Session 22 (70+ items)

Age system rewrite (born.year), retirement BBGM thresholds, player/team options nextYear, unified sim engine (runLazySim), MLE 3-pass, draft picks in TransactionsView, year chevrons, playoff bracket, rollover W-L reset, and 50+ more.

**Full history:** See `CHANGELOG.md` and `README_OLD.md`

*Last updated: 2026-04-17 (session 23)*
