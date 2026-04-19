# NBA Commish — TODO (updated 2026-04-19, session 26)

---

## BUGS — Active

### Indiana Pacers 33-man roster — trim not catching up
After the 2026-04-19 two-way promotion fix, most teams landed at 15/15 + 3/3 2W, but IND shows **33/15** in LeagueFinancesView (with several other teams 1–4 over: BKN 19, TOR 18, DAL 17, CHI/PHI 16). Trim runs every 14 days Oct–Feb so a trade flurry takes months to grind down. Also CHA holds 5/3 2W even with cap space (promotion should have caught it). Investigate: (a) why IND's count is so extreme — double-counting bug (G-League flag, international status leak) or genuine multi-trade overflow, (b) whether to raise per-cycle trim cap, (c) why CHA's 2W excess isn't promoting.

---

## FEATURES — Pending

### Sign-to-Standard action for two-way players (Commissioner + GM)
Add a distinct **Sign (Guaranteed)** action that converts a two-way to a standard contract without waiving first — mirrors `autoPromoteTwoWayExcess` in `AIFreeAgentHandler.ts`. Available in PlayerActionsModal / usePlayerQuickActions when: `player.twoWay === true` AND team has `standard < 15` AND cap allows. Visible to commissioner (any team) and GM (own team only).

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for the **main sidebar** `DraftScoutingView`:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

### External-league roster repopulation at rollover
Nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

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
