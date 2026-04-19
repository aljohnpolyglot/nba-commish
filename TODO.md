# NBA Commish — TODO (updated 2026-04-19, session 26)

---

## BUGS — Active

### Indiana Pacers 33-man roster — trim not catching up
After the 2026-04-19 two-way promotion fix, most teams landed at 15/15 + 3/3 2W, but IND shows **33/15** in LeagueFinancesView (with several other teams 1–4 over: BKN 19, TOR 18, DAL 17, CHI/PHI 16). Trim runs every 14 days Oct–Feb so a trade flurry takes months to grind down. Also CHA holds 5/3 2W even with cap space (promotion should have caught it). Investigate: (a) why IND's count is so extreme — is it a double-counting bug (G-League flag, international status leak) or genuine multi-trade overflow, (b) whether to raise per-cycle trim cap, (c) why CHA's 2W excess isn't promoting.

---

## FEATURES — Pending

### Sign-to-Standard action for two-way players (Commissioner + GM)
Currently the only action on a 2W player is **Re-sign** (which goes through the standard re-sign flow). Add a distinct **Sign (Guaranteed)** action that converts the two-way to a standard contract without waiving first — mirrors the auto-promotion the AI now does (`autoPromoteTwoWayExcess` in `AIFreeAgentHandler.ts`). Should be available in PlayerActionsModal / usePlayerQuickActions when: `player.twoWay === true` AND team has `standard < 15` AND cap allows. Visible to commissioner (any team) and GM (own team only).

### Nepotism / family ties system
Brothers on same team (Antetokounmpo, Ball, Holiday, etc.) should: (1) never appear on trading block together, (2) get morale boost from playing with family. Use `rosterService` relatives data. Thanasis/Alex shouldn't be trade-block candidates if Giannis is untouchable. Wire into `isOnTradingBlock()` + `computeMoodScore()`.

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for the **main sidebar** `DraftScoutingView`:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

Wire the same 70/30 engine that powers the Team Office tab.

### External-league roster repopulation at rollover
`generateDraftClass` supports path mix (College / Europe / G-League / Endesa / NBL / B-League), but nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. First-ballot is just a display label. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

### Scoring Option biases → Sim engine (follow-up for Coaching Preferences)
Helper `getScoringOptionBiases(baselineOrder, override)` in `scoringOptionsStore.ts:90` is ready. Returns `Map<internalId, { ptsMult, effMult }>`. **Not yet wired into the sim.** To complete:
1. Add `scoringBiases?: Map<string, { ptsMult: number; effMult: number }>` as optional param on `generateStatsForTeam` (`src/services/simulation/StatGenerator/initial.ts`).
2. In `engine.ts` call site: build via `getScoringOptionBiases(baselineOrder, getScoringOptions(teamId))`. Baseline = roster sorted by `usage*overall` (CoachingView:136).
3. Apply multiplicatively: `gamePlan.ptsMult[i] *= bias.ptsMult` at `initial.ts:172`; `gamePlan.effMult[i] *= bias.effMult` at `initial.ts:383,395`.

---

## FEATURES — Backlog

Full aspirational list lives in [`NEW_FEATURES.md`](./NEW_FEATURES.md). Still open:

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
