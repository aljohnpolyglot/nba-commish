# Feature Plan: Start Simulation from Any NBA Season

## Goal
Let the user pick any season (e.g. 1984-85 Showtime Lakers era, 1996-97 Jordan Bulls, 1986-87 Bird Celtics) as the starting point for their simulation, with historically accurate rosters, salaries, and ratings.

---

## Data Sources (already available)

| Source | What it provides | Key |
|--------|-----------------|-----|
| `real-player-data.basketball.json` (ZenGM) | `bios` (birth, college, draft, height, weight), `ratings` per season, `stats` per season, `awards`, `relatives` | srID (bref slug) |
| `player-photos.json` (alexnoob) | Portrait URLs for historical players | srID |
| BBGM alexnoob rosters (per-year JSONs) | Full BBGM roster objects with ratings + contracts per season | Already fetched for 2025-26 |
| `nbaregularfranchiserecords` gist | Team season records | team abbrev / name |
| `nbacareerfranchiseleaders2` gist | Career leaders per franchise | player name |

---

## Required Steps

### Step 1 — Year Picker UI
- Add a "Start New Season" modal with a dropdown: `1946-47 → 2025-26`
- Filter to seasons that have BBGM roster coverage (alexnoob has files for most years back to ~1976)
- Display a preview card: champion, MVP, notable players for the chosen year

### Step 2 — Load historical BBGM roster for the year
- alexnoob publishes per-year roster files at:
  `https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/{YEAR}-{YEAR+1}.NBA.Roster.json`
- Change `ROSTER_URL` constant to be dynamic based on `startYear`
- `rosterService.ts::getRosterData(year, phase)` already accepts `year` — just pass the chosen year

### Step 3 — Salary cap era handling
- Salary cap varied: ~$3.6M (1984), ~$17M (1996), ~$53M (2012), ~$99M (2016-17)
- Store a `HISTORICAL_CAP_TABLE: Record<number, number>` in `constants.ts`
- Scale contract amounts proportionally when displaying (show "era-adjusted" label)
- Or: use raw historical values from the BBGM roster (they are already era-accurate)

### Step 4 — Historical team branding
- Team names/cities changed over time (e.g. Seattle SuperSonics → OKC Thunder, NJ Nets → Brooklyn)
- BBGM roster JSON includes per-season `region` and `name` in `team.seasons[year]` — already handled by `rosterService.ts` line 441-445
- logos: `staticNbaTeams.ts` may need era-specific overrides for defunct/relocated teams

### Step 5 — Player ratings mapped to the sim's K2 system
- ZenGM `ratings` section has per-season skill ratings (spd, jmp, str, endu, ins, outs, dnk, ft, fg, tp, blk, stl, drb, pss, reb) in BBGM scale (0-100)
- These map directly to `calculatePlayerOverallForYear()` in `playerRatings.ts`
- Already works — `rosterService.ts` calls it with the chosen `startYear`

### Step 6 — Draft classes for future years
- `DraftPickGenerator.ts` generates synthetic draft classes
- For historical starts, classes for years already played (< startYear) should be seeded from ZenGM `bios.draftYear` / `bios.draftRound` data
- Future years (> startYear) remain synthetically generated as today

### Step 7 — ZenGM bio enrichment at historical start
- On historical game start, call `ensureBiosLoaded()` (already in `realPlayerDataFetcher.ts`)
- Populate `player.born.loc`, `player.hgt`, `player.weight`, `player.college` from `getBioBySlug(player.srID)` for any missing fields
- Portraits: `ensurePhotosLoaded()` already fires → portraits resolved for all historical players

### Step 8 — Historical awards pre-population
- `getHistoricalAwards()` already loads the BBGM awards JSON — this covers all seasons
- For the chosen start year, filter `historicalAwards` to only seasons ≤ startYear to show correct "pre-sim" records

### Step 9 — TeamHistoryView retroactive data
- Career leaders gist only covers modern era; older seasons may not be in the gist
- Short-term: ZenGM `stats` section could backfill career leaders for historical players
- Long-term: generate a pre-sim career stats snapshot from ZenGM `stats` at game start

### Step 10 — UI Polish
- Show "Simulating in [YEAR] era" badge in the header
- Adjust salary display to show both raw era amount and modern-equivalent
- Adapt "Hall of Fame" eligibility logic to use `player.retiredYear < startYear`

---

## Feasibility Assessment

| Component | Effort | Blocker? |
|-----------|--------|---------|
| Dynamic roster URL by year | Low | No — rosterService already parameterized |
| Historical salary cap table | Low | No — add constants |
| Team branding overrides | Medium | Need defunct-team logo assets |
| K2 ratings for historical players | None | Already works via BBGM roster |
| ZenGM bio enrichment | None | Done via realPlayerDataFetcher.ts |
| Draft class seeding | Medium | Needs ZenGM draft data integration |
| Career leaders backfill | High | Need ZenGM stats parsing pass |
| Salary cap era UI labels | Low | Cosmetic |

---

## Quick Start (Minimum Viable Version)
1. Add year picker to new-game modal
2. Make `ROSTER_URL` dynamic: `${BASE}/master/${year}-${year+1}.NBA.Roster.json`
3. Pass chosen year to `getRosterData(year, 'Opening Week')`
4. Call `ensureBiosLoaded()` at init to backfill missing bio fields
5. Ship — portraits and basic bio work immediately via realPlayerDataFetcher

The full historical experience (salary era, retroactive career stats, defunct teams) can be layered on iteratively.

---

## Files to Touch (MVP)
- `src/constants.ts` — make `ROSTER_URL` a function `getRosterUrl(year)`
- `src/store/logic/initialization.ts` — pass chosen year through to getRosterData
- `src/components/shared/NewGameModal.tsx` (or equivalent) — year picker UI
- `src/data/realPlayerDataFetcher.ts` — already ready, no changes needed
