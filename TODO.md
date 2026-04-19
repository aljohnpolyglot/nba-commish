# NBA Commish — TODO (updated 2026-04-19, session 26)

---

## BUGS — Active

### Schedule generator — unrealistic long homestands/road trips
Revealed by the new GM-mode calendar tiles (home=blue vs away=red) — the 2K-style visualization makes clear that `generateSchedule` in `src/services/gameScheduler.ts` is producing 5–7 game homestands and 5–7 game road trips in a row for every team. Real NBA schedule caps homestands/road trips at ~5 games and alternates them much more often. Fix the round-robin distribution to interleave H/A games per team with a max-consecutive constraint (e.g. ≤4 same-type in a row, target ~3).

---

## FEATURES — Backlog (low priority)

### Calendar — 2K-style event tiles (non-game days)
GM-mode calendar now renders opponent logos + home/away tint + W/L scores for user-team games (reg season, play-in, playoffs), and keeps the All-Star weekend logo. Remaining "game time" / off-day events to surface in the same tile style (GM mode only, falls back to commissioner dots):
- **NBA Draft** (Jun 25) — Draft logo tile
- **Draft Lottery** (May 14) — Lottery logo or Ping-Pong icon tile
- **Draft Combine** — combine banner tile
- **Trade Deadline** — deadline icon tile (clock/flag)
- **Free Agency open / moratorium / close** — FA icon tile
- **Training Camp open** (Oct 1) — camp tile
- **Preseason games** — preseason tile (distinct tint from reg-season)
- **Schedule release / preview unlock** (Oct 1) — tile linking to Season Preview
- **Play-in Tournament start** — tile
- **Finals game day** — gold trim variant of playoff tile
- **Exhibition / global games** — country flag + city tile
Reuse CalendarView tile structure; the 2K ref shows clipboard icon for off-days but we can do better (league logo, event icon, etc.).

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for the **main sidebar** `DraftScoutingView`:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

### External-league roster repopulation at rollover
Nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

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
