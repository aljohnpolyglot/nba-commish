# NBA Commish — TODO (updated 2026-04-18, post session 25)

---

## BUGS — Active

### Nepotism / family ties system
Brothers on same team (Antetokounmpo, Ball, Holiday, etc.) should: (1) never appear on trading block together, (2) get morale boost from playing with family. Use `rosterService` relatives data. Thanasis/Alex shouldn't be trade-block candidates if Giannis is untouchable. Wire into `isOnTradingBlock()` + `computeMoodScore()`.

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for the **main sidebar** `DraftScoutingView`:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

Wire the same 70/30 engine that powers the Team Office tab.

### External-league roster repopulation at rollover
`generateDraftClass` supports path mix (College / Europe / G-League / Endesa / NBL / B-League), but nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.



### HALL OF FAME RESOLVE
currently everyone waits the same 3 seasons regardless of first-ballot vs regular. First-ballot is just a display label ("they'd go in the instant they're eligible"). Could diff it   
  later (e.g. first-ballot = 1 year, regular = 3, borderline = 5)
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

*Last updated: 2026-04-18 (post session 25)*
