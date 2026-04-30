# All-Star Weekend Overhaul — Plan

**Status: PR1 + PR2 + PR3 + PR4 COMPLETE (Apr 28–29 2026). Bucket logic, bracket sim, multi-game UI, per-round news, satellite-event sim foundations all wired. Per-event UI surfaces still TBD (tracked in NEW_FEATURES.md).**

Goal: make the **All-Star Game Format** + **Number of Teams** rules in `commissioner/rules/AllStarTab` actually drive the simulation. Previously both were persisted to `leagueStats` but the orchestrator only knew East-vs-West (2 teams). After this overhaul:

| Format             | Teams | Real-life analog                  | Bracket                                     |
|--------------------|-------|-----------------------------------|---------------------------------------------|
| `east_vs_west`     | 2     | Classic ASG                       | 1 game                                      |
| `captains_draft`   | 2     | LeBron vs Giannis era             | 1 game (rosters drafted by top-2 vote-getters) |
| `usa_vs_world`     | 3     | **2026 LA format**                | 3-team round robin (4 games), top-2 → final |
| `usa_vs_world`     | 4     | extended variant                  | 4-team knockout (2 SF + final)              |
| `blacks_vs_whites` | 2     | satire                            | 1 game                                      |

## Key data-model additions

- `allStar.bracket`: `{ teams: AllStarTeam[]; games: AllStarGame[]; championshipGid?: number; complete: boolean }`
  - `AllStarTeam`: `{ id: -1|-2|-3|-4; name; abbrev; logoUrl; captainPlayerId?; wins; losses; pointsFor; pointsAgainst }`
  - `AllStarGame`: `{ gid; homeTid; awayTid; round: 'rr'|'sf'|'final'; played; homeScore; awayScore; targetScore? }`
- Reuse existing `AllStarPlayer.conference` field — we widen the union to `'East'|'West'|'USA1'|'USA2'|'WORLD'|'A'|'B'|'C'|'D'` (string-typed bucket key, no schema explosion).
- `leagueStats.allStarFormat` already exists; `leagueStats.allStarTeams` already exists. No new settings.

## Roster bucketing rules (where each player ends up)

Run **after** `selectStarters` + `selectReserves` complete (24-player pool):

- **east_vs_west / blacks_vs_whites** → existing logic, untouched.
- **captains_draft** (2 teams) → top-2 vote-getters become captains (one per team). Remaining 22 players get **alternately drafted** (snake) by `displayOvr` desc, captain order randomized for variety.
- **usa_vs_world, teams=3** → split USA-born vs World-born first. Then split USA pool in half by `displayOvr` snake into **USA Stars** + **USA Stripes**; World stays as **Team World**. If USA < 16 or World < 8, top-up by drafting `displayOvr` from the smaller bucket.
- **usa_vs_world, teams=4** → USA into 2 groups (Stars/Stripes), World into 2 groups (World A/World B). Same balancing fallback.

Helper centralized in `AllStarSelectionService.bucketRoster(roster, players, format, teamCount)`.

## Bracket / schedule injection

Replace the single `allStarGame` injection in `AllStarWeekendOrchestrator.injectAllStarGames` with `buildBracket(format, teamCount, asSundayDate)` that returns one or more games:

- **2 teams** → 1 game on All-Star Sunday (gid 90001), `targetScore` from existing custom rules.
- **3 teams round-robin** → 4 games:
  - Sunday early window: A-vs-B, A-vs-C, B-vs-C (12-min halves, target ~40 like NBA Cup-of-Champions style or league-rule mirror).
  - Sunday late window: top-2-by-record → **Championship** (gid 90099). Tiebreaker: head-to-head → point diff → coin flip.
- **4 teams knockout** → SF1 (gid 90091), SF2 (gid 90092) earlier in day; Final (gid 90099). Losers don't play a 3rd-place game.

Game gids stay in the 90000-99 reserved band so existing All-Star detection (`g.isAllStar`) keeps working. Championship games get `g.isAllStarChampionship = true`.

## Current implementation wiring (as of Apr 28)

**Bucket dispatch:**
- Called from `autoResolvers.autoRunDraft` + `gameLogic.ts` wherever `selectReserves` completes
- Roster + votes passed to `bucketRoster(roster, players, votes, format, teamCount)`
- Returns roster with `conference` field updated to bucket keys (e.g. 'USA1', 'WORLD', 'East', 'West')

**Schedule injection:**
- `AllStarWeekendOrchestrator.injectAllStarGames` calls `buildBracketLayout(leagueStats, roster)`
- Returns 1–4 game definitions; spreads them into Sunday schedule
- gid reserved: 90001 (2-team final), 90094–90096 (3-team RR), 90091–90092 (4-team SF), 90099 (any final)

**Sim pipeline:**
- `simulateAllStarBracket(state)` called on All-Star Sunday from `simulateWeekend`
- Loops through unplayed bracket games; sims each sequentially via `simulateGames`
- Builds fake teams from `BracketLayout.teams`; per-bucket player pools from roster + conference tags
- After RR/SF complete, derives finalists (3-team: top-2 by W-L/tiebreak; 4-team: SF winners)
- Injects championship game (gid 90099) into schedule + sims immediately
- Stores bracket state in `allStar.bracket` with final records/scores
- MVP extracted from championship box score (2-team: from the only game)

## Sim wiring details (legacy reference)

Old reference (pre-PR2):
- `simulateAllStarGame` becomes `simulateAllStarBracket(state)`:
  1. Find all unplayed games with `isAllStar` on today's date.
  2. Sim them sequentially via `simulateGames` using the bucket-derived fake teams.
  3. Update `bracket.teams` records after each game.
  4. If `format=usa_vs_world&teams=3` and 3 round-robin games are done, schedule the championship (insert into schedule + sim) before returning.
  5. MVP picked from championship box score (or single game in 2-team modes).

## UI changes

### Commissioner Rules — `AllStarGameSection.tsx`
- Already exists: format dropdown + teams slider. Add a small **format → valid teams** matrix so picking `east_vs_west` snaps `teams=2`, `usa_vs_world` defaults to 3, etc. Disable invalid combos.
- Show a 2-line preview block: "Bracket: 3-team round robin → top 2 advance to final. 4 games total."

### Schedule Day View — `AllStarDayView.tsx`
- When `state.allStar.bracket` has >1 game and selected date is All-Star Sunday, render a **mini-bracket card**: 3 (or 4) team logos with W-L records, each round-robin matchup as its own row with score/`Watch` button, then a championship slot below ("vs winner of group" until decided).
- Today's existing single-game card stays for 2-team formats.

### Rosters — `AllStarView.tsx` / `AllStarOverview.tsx`
- Replace hard-coded "East/West" tabs with `bracket.teams.map(t => <Tab name={t.name}>)`.
- For captains_draft: badge captains with a "C" star.
- For usa_vs_world: small flag emoji per player (🇺🇸 / 🌍).

### Schedule list / calendar
- Calendar tile for All-Star Sunday shows event count badge ("4 games") for round-robin formats.

---

## PR breakdown

### ✅ PR 1 — Bucket logic + captains draft (DONE)
- ✅ `AllStarSelectionService.ts`: `bucketRoster` dispatcher + all 4 format handlers
  - `bucketCaptainsDraft`: top-2 vote-getters become captains, remaining 22 snake-drafted by displayOvr
  - `bucketUsaWorld`: splits roster by birthplace, then 2/3/4-team buckets w/ top-up balance
  - `snakeDraft`: generic alternating draft by descending OVR
- ✅ `applyUsaWorldFormat` re-exposed (East=USA / West=World for backward-compat)
- ✅ Rosters now tagged with conference=bucket (e.g. 'USA1', 'WORLD2', 'East', 'West')

### ✅ PR 2 — Bracket schedule + sim (DONE)
- ✅ `buildBracketLayout` in `AllStarWeekendOrchestrator` — format/teamCount → bracket definition
  - Returns `BracketTeam[]` + `initialGames[]` (RR seeds or SF pairings)
  - Injects 1–4 games on Sunday (gid 90001, 90094–90096, 90091–90092, 90099)
- ✅ `injectAllStarGames` wired to call `buildBracketLayout`, spreads results into schedule
- ✅ `simulateAllStarBracket` (renamed from `simulateAllStarGame`):
  - Sims all unplayed RR/SF games sequentially
  - Tracks team records (wins/losses/pf/pa) on `state.allStar.bracket`
  - Dynamically injects + sims championship (gid 90099) after group stage
  - MVP from final-game box score (not aggregate)
  - Stores results in `allStar.bracket` state, persisted across loads
- ✅ `simulateAllStarGame` kept as deprecated alias to `simulateAllStarBracket`

### ✅ PR 3 — Day-view bracket card + roster tabs (DONE)
- ✅ `AllStarDayView` multi-game bracket card
  - Renders each RR/SF/final matchup as a card (lines 341–383)
  - Shows team names from `bracket.teams` + W-L records
  - Score / "Watch" / "Box Score" buttons wired
  - Championship games highlighted with amber border (`isAllStarChampionship` flag)
  - ✅ Team logos rendered from `bracket.teams[].logoUrl` (Session 31)
- ✅ `AllStarRoster.tsx` dynamic team tabs (Session 30)
  - Hard-coded East/West replaced with `bracket.teams` map
  - Captain Crown badge for `isCaptain` players
  - 🇺🇸/🌍 flag emoji on starter cards + reserve rows for usa_vs_world
- ✅ Calendar tile event-count badge (Session 31)
  - `CalendarView.tsx` shows "{N} games" pill when `games.filter(isAllStarGame).length > 1`

### ✅ PR 4 — Polish (DONE Session 30–31)
- ✅ Format ⇄ teams snap-validation in `AllStarGameSection`
- ✅ News headlines per round (`all_star_bracket` + `all_star_mvp` templates wired in `autoSimAllStarWeekend`, Session 31)
- ✅ `AllStarHistoryView` multi-game support — BRACKET badge + RR record line under score for multi-game seasons (Session 31)

### ✅ PR 5 — Multi-game polish (Session 31)
- ✅ Per-game MVPs stored on `bracket.games[].mvpName/mvpTeam/mvpPts`
- ✅ `AllStarRoster` renders "Per-Game MVPs" panel for multi-game brackets
- ✅ `bracket.teams[].logoUrl` plumbed through `simulateAllStarBracket`
- ✅ Pre-existing TS errors fixed (`AllStarTab` prop names; `AllStarGameSection` possession-method pass-through with local stub state)

### 🔄 PR 6 — Satellite events one-by-one (FOUNDATIONS LAID, per-event UI TBD)
See **"Satellite events one-by-one buildout"** in `NEW_FEATURES.md` for the full per-event roadmap.

Foundations shipped Session 31:
- ✅ Sim services: `AllStarShootingStarsSim`, `AllStarSkillsChallengeSim`, `AllStarHorseSim`, `AllStarOneOnOneSim`
- ✅ Result types added to `AllStarState` in `types.ts`
- ✅ Orchestrator `simulateWeekend` runs all four on Saturday
- ✅ Rules UI toggles unstubbed in `AllStarEventsSection`

Per-event work remaining (user to ship one-by-one):
- ⬜ DayView result cards (Saturday tile shows nothing for these yet)
- ⬜ News headlines per event (no `all_star_*_winner` templates wired)
- ⬜ Dedicated detail/log views (no equivalent to dunk-contest UI)
- ⬜ Awards write-back (winners not yet pushed into `player.awards`)
- ⬜ Selection-time announcements (no "contestants announced" date plumbing like dunk/3PT)

---

## Session 30 summary (Apr 28 2026)

**What shipped (PR1+PR2):**
- ✅ Full bucket dispatcher (`bucketRoster`) with all 4 format handlers (captains_draft, usa_vs_world 2/3/4)
- ✅ Multi-game bracket layout generation (`buildBracketLayout`) for RR/SF/final pairings
- ✅ Dynamic championship injection after group-stage completion
- ✅ Bracket state persistence in `allStar.bracket` with team records + game results
- ✅ Multi-game card rendering in `AllStarDayView` (lines 341–383)
- ✅ Conference field reuse for bucket keys (East/West/USA1/USA2/WORLD/WORLD1/WORLD2)
- ✅ `isCaptain` flag on roster entries for captains_draft mode

**What shipped (PR3 — UI + data fixes):**
- ✅ `AllStarRoster.tsx` — dynamic team panels driven by buckets present on roster
- ✅ Captain "C" badge (purple Crown icon) for `isCaptain` players
- ✅ 🇺🇸/🌍 flag emoji on player rows (starter cards + reserve rows) for `usa_vs_world`
- ✅ Captains_draft labels: "Team {LastName}" using captain surname
- ✅ AllStarRoster final-score card uses bracket team names (no more hardcoded East/West)
- ✅ `AllStarGameSection` format ⇄ teams snap-validation (only `usa_vs_world` allows 3/4)
- ✅ Format/teams freeze after starters announce (Jan 22) → unlocks at Aug 14 schedule init
- ✅ Lock banner: "Edits apply to {nextYear} season" when `startersAnnounced === true`

**What shipped (PR4 — fixes & polish):**
- ✅ Real 2026 NBA tournament order: Game 1 = Stars vs World, Games 2/3 dynamically inject Stripes vs Winner/Loser
- ✅ Bucket-aware injury replacement (`autoResolvers.ts`):
  - East/West → match team conference (legacy)
  - USA1/USA2 → prefer USA-born candidate
  - WORLD/WORLD1/WORLD2 → prefer non-USA-born candidate
  - Falls back to best-available if bucket pool is empty
- ✅ Box score team names: `simulateAllStarBracket` overwrites `homeTeamName`/`awayTeamName` from `bracket.teams[]` so box scores read "USA Stars vs Team World" not "Eastern All-Stars vs Exhibition Team"
- ✅ Dunk Contest participant count wired (`allStarDunkContestPlayers` → `selectContestants(players, num)`) at both call sites (orchestrator + autoResolvers)
- ✅ 3PT Contest participant count wired (`allStarThreePointContestPlayers` → `selectContestants(players, year, num)`) at both call sites
- ✅ Added `bracket?` field to `AllStarState` type so `state.allStar.bracket` is type-safe

**Type check:**
- ✅ All my changes type-clean
- ⚠️ Pre-existing `setNumQuarters` error in AllStarTab.tsx (not from this work — confirmed via stash)

**Known accepted quirks:**
- 3-team usa_vs_world: when USA pool < 16 or World pool < 8, top-up logic borrows from the larger side. So a deep-international era can have ~2 World stars assigned to USA buckets. User signed off ("crazy world talent tho... that's okay idc").

**Out of scope (still future):**
- Real satellite events per-event UI surface (sim foundations done Session 31; tracked in NEW_FEATURES.md as "Satellite events one-by-one buildout")

---

## Rising Stars Challenge (🔄 TODO — PR 5)

**2026 NBA Format (Intuit Dome, Feb 13):**
- **4-team mini-tournament**: 3 NBA Rookie/Sophomore teams + 1 G League team
- **Semifinals**: Two games to **40 points** (first to reach/exceed wins)
- **Championship**: Winners play final to **25 points** (first to reach/exceed wins)
- **Coaches**: Carmelo Anthony, Tracy McGrady, Vince Carter (G League team coached by Austin Rivers)
- **Teams**: Team Vince (led by 2025 #3 pick), Team Melo, Team T-Mac, Team Austin (G League)
- **MVP**: Selected from championship game winner (e.g. VJ Edgecombe for 2026)

### Implementation tasks:
- **Data model**: `allStar.risingStars` bracket (similar to main ASG bracket, but 4-team only)
  - `RisingStarsTeam`: `{ id; name; abbrev; coachName; rookieSoph: Player[] }`
  - `RisingStarsGame`: `{ gid; homeTid; awayTid; round: 'sf'|'final'; targetScore: 40|25; played; homeScore; awayScore }`
- **Roster pool**: Eligible rookies/sophomores (age ≤ 22 at draft OR drafted in last 2 seasons) + G League callup squad
- **gid reservation**: 91001–91002 (SF), 91099 (championship)
- **UI**: Calendar badge ("Rising Stars", Feb 13), DayView 4-game card, bracket modal with target-score labels
- **League setting**: `risingStarsFormat` (`'disabled'|'4team'|'custom'`) with toggleable `risingStarsEliminationEndings` (true = SF losers sit out; false = all 4 play round-robin)
- **Sim**: `simulateRisingStarsBracket(state)` — same pipeline as All-Star, but target-score logic for 40/25

---

## Out of scope (future)
- Per-event UI surfaces for satellite events (sim foundations + rules toggles shipped Session 31; per-event DayView/news/awards tracked in NEW_FEATURES.md).
- ~~Voting *by team bucket*~~ — **explicitly skipped**: real NBA still votes East/West and shuffles to buckets at announce time, so this matches reality.
- ~~Captain veto powers / live-draft UI~~ — **explicitly skipped**: real captain "draft" is just snake-by-OVR after vote results, no live picks needed.
