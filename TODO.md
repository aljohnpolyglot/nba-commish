# NBA Commish — TODO (updated 2026-04-19, session 26)

---

## FEATURES — Backlog (low priority)

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for the **main sidebar** `DraftScoutingView`:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

### External-league roster repopulation at rollover
Nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

- **Dead money / ghost contracts (Luol Deng rule)** — waived-player stretch across multiple years.

- **Play-through injuries — full system wire-up** — `playThroughInjuries` knob currently defaults to `0` everywhere so all injured players sit out regardless. Full system already exists in `playThroughInjuriesFactor.ts` + `minutesRestrictionFactor`:
  - Level 1 (1–3 games): ~28 min, -2.5% perf → "Questionable / Day-to-Day"
  - Level 2 (4–7 games): ~24 min, -5% perf → minutes restriction
  - Level 3 (8–14 games): ~19 min, -7.5% perf → heavily monitored
  - Level 4 (15+ games): ~14 min, -10% perf → gutting it out
  - **Playoffs**: set knob to `4` (all severity levels can play through) — grit/playoff toughness
  - **Regular season**: set knob to `2` (only mild/moderate injuries play through, rest guys out)
  - Makes `playoff_injury_game` "Questionable/Day-to-Day" news framing accurate.

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
