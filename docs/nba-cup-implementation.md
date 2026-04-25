# NBA Cup (In-Season Tournament) — Implementation Spec

**Status:** spec / ready for implementation
**Owner:** TBD (handing off to codex)
**Last updated:** 2026-04-25

---

## 1. What exists today

- `src/components/central/view/NBACupView.tsx` — display-only viewer that fetches `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbacupdata` (Wikipedia-scraped gist), renders past-year groups/brackets/All-Tournament Team via `transformWikiData()`. No connection to `state.schedule`, `state.teams`, or `state.boxScores`. `getTeamLogo` does fuzzy name-matching, not `tid`-based.
- `leagueStats.inSeasonTournament` — already exists as a boolean rule (default `true`). Wired through `useRulesState.ts`, surfaced in `FormatTab.tsx`. **All Cup pipeline code below MUST short-circuit when this is `false`.**
- No state slice, no schedule tagging, no sim hook.

The display component is reusable as the bracket/group render layer once we feed it live data instead of wiki JSON.

---

## 2. Real-world NBA Cup format (2023–present)

| Rule | Detail |
|---|---|
| Teams | All 30 |
| Groups | 6 groups of 5 (3 East, 3 West), re-drawn yearly by prior-season record tiers |
| Group stage | 4 games per team, ~Nov/Dec Tuesdays + Fridays ("Cup Nights") |
| Group games count toward RS | Yes |
| Advance | Winner of each group (6) + 1 wildcard per conference (2) = **8 KO teams** |
| Knockout | QF at home of higher seed; SF & Final at T-Mobile Arena, Las Vegas |
| KO games count toward RS | QF = yes. **SF & Final = no.** |
| Tiebreakers | Group W → H2H → point differential → points scored → seeded coin flip |
| Prize money | ~$500k winner / $200k runner-up / $100k SF / $50k QF per roster spot |
| Awards | Cup Champion (team), Cup MVP (player), All-Tournament Team (5 players) |

---

## 3. State model additions

```ts
// src/types.ts

export interface NBACupGroup {
  id: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  conference: 'East' | 'West';
  teamIds: number[];   // 5 tids
  standings: Array<{
    tid: number;
    w: number; l: number;
    pf: number; pa: number; pd: number;
    gp: number;
  }>;
}

export interface NBACupKnockoutGame {
  round: 'QF' | 'SF' | 'Final';
  seed1: number;       // 1–4 within conference for QF, 1–2 for SF
  seed2: number;
  tid1: number;
  tid2: number;
  gameId?: number;     // gid from state.schedule once scheduled
  winnerTid?: number;
  countsTowardRecord: boolean;   // true for QF only
}

export interface NBACupState {
  year: number;                  // regular-season year (Cup played in Nov/Dec of prevYear)
  status: 'group' | 'knockout' | 'complete';
  groups: NBACupGroup[];
  wildcards: { East: number | null; West: number | null };
  knockout: NBACupKnockoutGame[]; // QF(4) + SF(2) + Final(1) = 7
  championTid?: number;
  runnerUpTid?: number;
  mvpPlayerId?: string;
  allTournamentTeam?: Array<{ playerId: string; tid: number; pos: string; isMvp: boolean }>;
  prizePool?: {                  // present only if commissioner enabled prize pool (see §12)
    perPlayerByFinish: { winner: number; runnerUp: number; semi: number; quarter: number };
  };
}

// Extend Game (no schema break; all optional):
export interface Game {
  // ...existing fields
  isNBACup?: boolean;
  nbaCupRound?: 'group' | 'QF' | 'SF' | 'Final';
  nbaCupGroupId?: NBACupGroup['id'];
  excludeFromRecord?: boolean;   // SF/Final — sim writes box but skips team W/L
}

// Extend GameState:
//   nbaCup?: NBACupState;
//   nbaCupHistory?: Record<number, NBACupState>;
```

**Why a new `excludeFromRecord` flag (not `isExhibition`):** `simulationService.ts:91` short-circuits ALL stat writes for `isExhibition` games. SF/Final need box scores preserved (for MVP calc + history) but must skip W/L. Distinct flag avoids overloading.

---

## 4. Integration pipeline

### 4a. Group draw — at `seasonRollover.ts` finish, before schedule build

New file: `src/services/nbaCup/drawGroups.ts`

```ts
export function drawCupGroups(
  teams: NBATeam[],
  prevSeasonStandings: Standing[],
  saveId: string,
  cupYear: number,
): NBACupGroup[]
```

**Algorithm (matches real NBA, 3 groups × 5 teams per conference):**
1. Split 30 teams into East (15) and West (15) by conference.
2. Within each conference, rank by prior-season record.
3. Form 5 tiers of 3 teams each (top 3, next 3, …, bottom 3).
4. Snake-assign with seeded RNG: each of the 3 groups gets exactly one team from each tier.
5. Return `NBACupGroup[]` with empty `standings` arrays.

**Year 0 fallback:** at new-game init there's no prior-season record. Use current-roster average BBGM OVR as the tiering proxy. Document inline.

**Determinism:** seed = `hash(saveId + cupYear)`. No `Math.random()` anywhere in the draw.

### 4b. Schedule injection — mirror Christmas/Global Games pre-fill

`gameScheduler.ts` already has the pattern: pre-fill specific games BEFORE the matchup loop, then `preScheduledPairs` counts them so the main loop subtracts from each pair's quota. Cup group games slot into the same pipe.

**Insertion point:** after the global-games pre-fill block (`if (globalGames && globalGames.length > 0)`), BEFORE the `preScheduledPairs` Map build.

**Algorithm:**

```ts
if (state.leagueStats.inSeasonTournament && cupGroups?.length) {
  const cupNights = getCupNightDates(prevYr); // Tue+Fri in Nov 4 → Dec 2 window, ~8 slots
  const pairings  = buildCupPairings(cupGroups); // 60 matchups: 10 per group × 6 groups

  for (const { tid1, tid2, groupId } of pairings) {
    for (const night of shuffledCupNights(cupNights, `cup_night_${saveId}_${prevYr}_${tid1}_${tid2}`)) {
      const dateStr = night.toISOString().split('T')[0];
      if (!isTeamFree(dateStr, tid1, tid2)) continue;
      markScheduled(dateStr, tid1, tid2);
      const homeTid = pickHomeAwayDeterministic(tid1, tid2, groupId);
      games.push({
        gid: gameId++,
        homeTid, awayTid: homeTid === tid1 ? tid2 : tid1,
        homeScore: 0, awayScore: 0, played: false,
        date: night.toISOString(),
        isNBACup: true,
        nbaCupRound: 'group',
        nbaCupGroupId: groupId,
      });
      break;
    }
  }
}
```

The existing `preScheduledPairs` loop already filters `!g.isPreseason` → Cup games auto-count → main loop subtracts from each pair's quota. **Zero-effort quota correction.**

**Quota math:**
- 5 teams × round-robin = 10 intra-group games × 6 groups = 60 Cup group games.
- 82-game schedule already includes those 10 intra-group pairs as part of `conferenceGames ?? 3`. Cup takes 1 of the 3; base loop schedules the remaining 2 normally.
- Net: 60 games tagged Cup, 0 games added/removed. Schedule stays 82/team.

**Edge cases:**
- "Cup Nights" must spread 60 games so no single night exceeds ~12. Seeded shuffle of pairings before placement.
- **Use seeded RNG, not `Math.random()`.** `gameScheduler.ts` currently uses raw `Math.random()` in 5+ spots (preseason pairing, segment offsets, H/A flips). The Cup injector MUST use a `seededRandom('cup_…')` helper for replay stability.
- The H/A streak fixer (post-process pass after `games.sort(...)`) runs over ALL games. That's fine — Cup games are just RS games with extra tags. **But:** extend the swap guard to skip swaps on Cup games where flipping would invert the group's designated home seed.

### 4c. Live standings updates

Hook into box-score finalization. New file: `src/services/nbaCup/updateCupStandings.ts`:

```ts
export function applyCupResult(state: GameState, game: Game, box: GameResult): GameState
```

- Match `game.isNBACup && game.nbaCupRound === 'group'` → locate group → increment W/L/PF/PA/PD/GP for both teams.
- Match `nbaCupRound ∈ {QF, SF, Final}` → set `state.nbaCup.knockout[i].winnerTid`.
- Called from the same place that updates `state.teams[].wins/losses` after a sim, BEFORE the W/L write (so the SF/Final skip can short-circuit).

### 4d. Group-stage closeout & bracket build

When all 60 group games played → `resolveCupGroupStage(state)`:

1. Compute group winners with strict tiebreak: W → H2H → PD → PF → seeded coin (`cup_tiebreak_${groupId}_${year}`). Group is round-robin, so H2H is trivially the result of the single meeting.
2. Compute wildcard per conference (best non-winner across that conf's 3 groups, same tiebreakers).
3. Seed KO bracket 1–4 within each conference by group-stage record.
4. QF: E1 vs E4, E2 vs E3, W1 vs W4, W2 vs W3.
5. Schedule QF games Dec 9–11 at higher seed's arena, SF Dec 13, Final Dec 16. SF + Final synthesized with `venue: 'T-Mobile Arena, Las Vegas'`, `excludeFromRecord: true`.
6. Set `state.nbaCup.status = 'knockout'`.

### 4e. Championship & awards

After Final plays:
- `championTid`, `runnerUpTid` set.
- **MVP pick** — top scorer in KO games with weighting `avgPts × 0.4 + avgReb × 0.25 + avgAst × 0.25 + (isChampion ? 5 : 0)` among top 10 KO performers. Seeded `cup_mvp_${year}`.
- **All-Tournament Team** — top 5 by same formula, PG/SG/SF/PF/C slotted by `primaryPos`, ties broken with `cup_all_team_${year}`.
- **Prize money** — only if `state.leagueStats.cupPrizePoolEnabled === true` (see §12). When disabled, the cup money implicitly rolls into the league's general revenue → standard inflation pass picks it up.
- Write `HistoryEntry`: `"{Team} wins the {year} NBA Cup — {MVP} named MVP"`.
- News item + social posts via existing pipelines.

### 4f. Rollover — archive, don't "clear"

The Cup ends mid-December. By the Jun 30 rollover it's been at `status: 'complete'` for ~6 months. There's no "active Cup to clear." Rollover does:

1. **Archive** — `state.nbaCupHistory[state.nbaCup.year] = state.nbaCup`, so the Cup view's past-sim mode (§5 Mode B) can find it next season.
2. **Overwrite** — `drawCupGroups(teams, prevSeasonStandings, saveId, newYear)` replaces `state.nbaCup` with a fresh group-stage state.
3. **Inject** — §4b runs as part of the same rollover → schedule-release flow.

`status: 'complete'` is the correct resting state from December → June; the Cup tab keeps showing "Denver won the 2025–26 NBA Cup" for the rest of the season. Don't archive on Final-played.

**Defensive:** if rollover fires with `status !== 'complete'` (shouldn't happen — Cup finishes Dec, rollover is Jun 30), log a warning, archive as-is, proceed with new draw.

---

## 5. UI refactor of `NBACupView.tsx` — mirror `PlayoffView`

`PlayoffView.tsx` already solves the "live sim + past sim runs + pre-sim historical gist" problem we need. The mapping:

| PlayoffView concept | Cup equivalent |
|---|---|
| `viewYear` state + ± chevron, clamped `[1984, year]` | Same |
| `isHistorical = viewYear !== year` | Same |
| Mode A (current): reads `state.playoffs` | Reads `state.nbaCup` |
| Mode B (past sim): reads `state.historicalPlayoffs[viewYear]` | Reads `state.nbaCupHistory[viewYear]` |
| Mode C (pre-sim historical): `<HistoricalPlayoffBracket>` fetches wiki gist | `<HistoricalNBACupData>` wraps existing gist fetcher |
| Sim buttons gated on `!isHistorical` | Same |
| Year label `{viewYear-1}–{slice(-2)}` (2024–25 style) | Same — Cup is named by the season it occurs IN |

### Skeleton

```tsx
export const NBACupView: React.FC = () => {
  const { state } = useGame();
  const year = state.leagueStats.year;
  const [viewYear, setViewYear] = useState(year);
  const isHistorical = viewYear !== year;

  const currentCup = state.nbaCup ?? null;
  const pastSimCup = state.nbaCupHistory?.[viewYear] ?? null;

  return (
    <div className="h-full flex flex-col bg-[#050505] text-white overflow-hidden">
      <HeaderWithYearChevron
        viewYear={viewYear}
        onNav={d => setViewYear(y => Math.max(1984, Math.min(year, y + d)))}
        showSimButtons={!isHistorical}
        cupStatus={currentCup?.status}
      />
      <div className="flex-1 overflow-y-auto">
        {!isHistorical && currentCup && (
          <>
            <CupGroupStandingsLayout cup={currentCup} teams={state.teams} />
            {currentCup.status !== 'group' && (
              <CupBracketLayout cup={currentCup} teams={state.teams} schedule={state.schedule} />
            )}
          </>
        )}
        {!isHistorical && !currentCup && <CupEmptyState year={year} />}
        {isHistorical && pastSimCup && (
          <>
            <CupGroupStandingsLayout cup={pastSimCup} teams={state.teams} />
            <CupBracketLayout cup={pastSimCup} teams={state.teams} schedule={[]} />
          </>
        )}
        {isHistorical && !pastSimCup && <HistoricalNBACupData viewYear={viewYear} />}
      </div>
    </div>
  );
};
```

### What moves vs. what stays

- **Move** the wiki fetcher (current `useEffect` + `transformWikiData`) into `<HistoricalNBACupData>`. It only runs when `isHistorical && !pastSimCup` — i.e., real-NBA-history years before this save's `initYear`.
- **Keep** `GroupTable`, `MatchCard`, `BracketDisplay`, `PrizePool`, `SummaryCard` as render primitives.
- **New adapter** `src/components/central/view/nbaCupAdapter.ts`:
  ```ts
  export function cupStateToViewData(cup: NBACupState, teams: NBATeam[]): NBACupYearData;
  export function wikiYearToViewData(wiki: WikiYearData): NBACupYearData;
  ```
  Both produce the same `NBACupYearData` shape. Live state flows through the first, gist data through the second.

### Display fixes

- `getTeamLogo` currently uses a hardcoded CDN ID map. Switch to `teams.find(t => t.tid === tid)?.logoURL` first, fall back to CDN only when missing. Copy `getTeamForGame(tid, state.teams)` from `PlayoffView`.
- LIVE badge when `!isHistorical && currentCup?.status !== 'complete'`, mirroring PlayoffView's "Begins April 14" / "Conf. Finals" / "Complete" subtitle pattern.
- Group tables live-update for free via React re-render on `state.nbaCup` mutation.
- Prize-pool block reads from `cup.prizePool`. **If `prizePool` is undefined (toggle off — see §12), render a "Cup Bonuses Off" badge instead** and skip the section.

### Sim buttons (parallel to PlayoffView)

Show only when `!isHistorical`:

| Button | When | Action |
|---|---|---|
| Sim Cup Night | group stage, today is a Cup Night | `SIMULATE_TO_DATE → end of today` |
| Sim Group Stage | `cup.status === 'group'` | `SIMULATE_TO_DATE → last group game date` |
| Sim Cup Final | `cup.status === 'knockout'` | `SIMULATE_TO_DATE → final date` |
| Watch Cup Final | Final game is today | Reuse `GameSimulatorScreen` like `PlayoffView` does |
| Sim Next User Game | GM mode + user team alive in Cup | Mirror `myNextPlayoffGame` pattern |

All funnel through `rosterGate.attempt(...)` + `withLotteryGuard(...)` — copy from PlayoffView.

### What NOT to port

- Draft Lottery warning modal (Cup runs Nov/Dec, never overlaps May lottery).
- Series-detail panel (Cup is single-elimination; click → lightweight box-score modal instead).
- Play-In distinction (group stage replaces it conceptually).

---

## 5b. Sim ⇄ Gist merge pattern (per `LeagueHistoryView` + `PlayoffView`)

Both `LeagueHistoryView.tsx` and `PlayoffView.tsx` already implement the exact merge we need: **sim state takes precedence, gist fills the gaps, and tallies are deduped across both sources.** Don't reinvent — copy these patterns directly.

### Per-year resolution (from `PlayoffView.tsx:293-318`)

For a single year:
1. **Sim hit?** `state.historicalPlayoffs?.[viewYear]` populated → render from state, full sim bracket.
2. **No sim hit?** Fall through to `<HistoricalPlayoffBracket viewYear={viewYear} />` which fetches from the wiki gist.

Cup equivalent for `NBACupView`:
```tsx
const simCup  = state.nbaCupHistory?.[viewYear];
const showSim = !!simCup;
return showSim
  ? <CupBracketLayout cup={simCup} teams={state.teams} schedule={[]} />
  : <HistoricalNBACupData viewYear={viewYear} />;
```

That's it. Same structure, different data shape.

### Cumulative tallies (from `LeagueHistoryView.tsx:164-197`)

For "Cup titles by team" / "MVP count by player" / similar cumulative views, build `Map<id, Set<year>>` from BOTH sources:

```ts
const cupChampYearsByTeamId = new Map<number, Set<number>>();

// Source 1: sim history (autoritative for years user has played through)
for (const [yr, cup] of Object.entries(state.nbaCupHistory ?? {})) {
  if (cup.championTid == null) continue;
  if (!cupChampYearsByTeamId.has(cup.championTid)) cupChampYearsByTeamId.set(cup.championTid, new Set());
  cupChampYearsByTeamId.get(cup.championTid)!.add(Number(yr));
}

// Source 2: wiki gist (covers 2023, 2024, 2025… real NBA data, deduped by year)
for (const [yr, wikiYear] of getAllCachedCupSeasons().entries()) {
  if (!wikiYear.champion?.name) continue;
  const team = matchTeamByWikiName(wikiYear.champion.name, state.teams);
  if (!team) continue;
  if (!cupChampYearsByTeamId.has(team.id)) cupChampYearsByTeamId.set(team.id, new Set());
  cupChampYearsByTeamId.get(team.id)!.add(yr);
}
```

Sets dedupe automatically when both sources cover the same year (sim wins implicitly because it's iterated first; either way the year only counts once).

**For this to work cleanly, the gist fetcher needs a `getAllCachedCupSeasons()` accessor** (mirror `brefFetcher.getAllCachedSeasons()`) that returns every cached year, not just the batch window.

### Where this lives

- `src/data/nbaCupGistFetcher.ts` (NEW) — port `brefFetcher`'s `useBRefSeasonsBatch` + `getAllCachedSeasons` shape for the cup gist. Gives us batch-fetching + a full-cache accessor.
- `src/components/central/view/HistoricalNBACupData.tsx` (NEW) — wraps the fetcher, returns the same `NBACupYearData` shape via `wikiYearToViewData()` from §5's adapter.
- `NBACupView.tsx` — orchestrates the per-year fallthrough above.
- `LeagueHistoryView.tsx` — extend the row to add a "Cup Champ" column merging both sources via `cupChampYearsByTeamId` (optional v2, but the data plumbing is free once §6 is done).

---

## 6. Files to create / modify

### New
- `src/services/nbaCup/drawGroups.ts`
- `src/services/nbaCup/scheduleInjector.ts`
- `src/services/nbaCup/updateCupStandings.ts`
- `src/services/nbaCup/resolveGroupStage.ts`
- `src/services/nbaCup/resolveKnockout.ts`
- `src/services/nbaCup/awards.ts`
- `src/components/central/view/nbaCupAdapter.ts`
- `src/data/nbaCupGistFetcher.ts` — port `brefFetcher` shape for the cup gist (§5b).
- `src/components/central/view/HistoricalNBACupData.tsx` — Mode-C wrapper.

### Modify
- `src/types.ts` — add Cup types, extend `Game` (+ `excludeFromRecord`) and `GameState`, add `cupPrizePoolEnabled` to `LeagueStats`.
- `src/services/gameScheduler.ts` — call schedule injector after global-games pre-fill, gated on `inSeasonTournament`.
- `src/services/logic/seasonRollover.ts` — archive to `nbaCupHistory`, redraw, re-inject.
- `src/services/simulationService.ts` (and any other box-score finalization spot) — call `applyCupResult` BEFORE the existing W/L write; skip W/L when `excludeFromRecord`.
- `src/store/GameContext.tsx` — `LOAD_GAME` migration: tolerate missing `nbaCup` / `nbaCupHistory` on old saves (leave undefined).
- `src/components/central/view/NBACupView.tsx` — adapter + live state read (Modes A/B/C); per-year sim/gist fallthrough (§5b).
- `src/components/commissioner/rules/view/EconomyTab.tsx` + `useRulesState.ts` + `TabsContent.tsx` — add Cup Prize Pool toggle (§12).
- `src/components/schedule/view/components/CalendarView.tsx` — Cup tile cascade (§11b).
- `src/components/schedule/view/components/DayView.tsx` — Cup card eyebrow + amber border + chip (§11b).
- `src/components/central/view/LeagueHistoryView.tsx` — optional v2: add Cup-champ column merging sim + gist (§5b).

---

## 7. Execution order (per game inside `runSimulation`)

Critical: Cup result hook runs BEFORE the regular-season W/L update so we can tag SF/Final and skip the RS write.

```
box-score finalized
  ↓
applyCupResult(state, game, box)         ← updates cup standings or KO winner
  ↓
if (game.excludeFromRecord) return       ← SF/Final skip RS W/L
  ↓
team.wins++ / losses++
  ↓
if (game.isNBACup) check phase transitions:
  - all 60 group games played?  → resolveCupGroupStage()
  - all 4 QF complete?          → scheduleSFFinal()
  - Final complete?             → awards + (no archive yet — happens at Jun 30 rollover)
```

---

## 8. Deterministic replay

Every randomness point uses a seeded RNG so `lazySimRunner` replays produce identical results:

| Point | Seed |
|---|---|
| Group draw | `cup_draw_${saveId}_${year}` |
| Cup Night placement | `cup_night_${saveId}_${year}_${tid1}_${tid2}` |
| Wildcard tiebreak coin | `cup_wildcard_${conf}_${year}` |
| Group winner tiebreak coin | `cup_tiebreak_${groupId}_${year}` |
| MVP tied performance | `cup_mvp_${year}` |
| All-Tournament positional slotting | `cup_all_team_${year}` |

**No `Math.random()` in the Cup pipeline.**

---

## 9. Edge cases & open questions

1. **Schedule-release point.** IRL the Cup draw is in Oct, but our schedule is built at Jun 30 rollover. Do (b): build Cup into the schedule at rollover. No mid-season schedule mutation.

2. **Year 0 prior-season record.** Use current-roster avg OVR as tier proxy. Documented in §4a.

3. **SF/Final stat handling.** Use new `excludeFromRecord` flag, not `isExhibition`. Box scores preserved (for MVP calc + history); team W/L skipped.

4. **Tiebreakers.** W → H2H → PD → PF → seeded coin. Document strictly in `resolveGroupStage.ts`.

5. **Player availability / load management.** Inherit existing injury/heal system for v1. Later: `restLikelihoodCupGames` GM attribute.

6. **Broadcaster tagging.** Cup Nights → TNT/Prime. Extend `broadcaster` field during injection.

7. **Prize pool & GM-mode finance.** When `cupPrizePoolEnabled` is on, prize money lands in team finance reports for the year of the Cup. When off, it doesn't exist — money rolls into general league inflation. See §12.

8. **UI "current round" badge.** Drive off `state.nbaCup.status` + today's date vs. group-game dates.

9. **Historical backfill.** Optional one-shot importer that writes the wiki gist into `nbaCupHistory` for 2023/2024/2025 immersion. Gate behind a settings toggle. Defer to v2.

10. **Playoffs conflict.** None — Cup finishes Dec, Playoffs start April.

11. **`inSeasonTournament` rule-toggle off.** Pipeline must short-circuit:
    - `drawCupGroups` not called at rollover.
    - `scheduleInjector` not called.
    - `applyCupResult` is a no-op (defensive — should never see a Cup-tagged game if upstream skipped).
    - `NBACupView` renders an "In-Season Tournament disabled" empty state instead of Mode A.

---

## 10. Suggested PR sequence

1. **PR1** — Types + `LOAD_GAME` migration. Add `NBACupState`/`Group`/`KO` types, extend `Game`/`GameState`, add `excludeFromRecord`, add `cupPrizePoolEnabled` to `LeagueStats`. No logic. Ships safely.
2. **PR2** — Group draw. `drawGroups.ts` + deterministic-output unit test. Called from rollover; groups appear in state but no schedule injection yet.
3. **PR3** — Schedule injection. `scheduleInjector.ts`. Tag 60 games `isNBACup: true`. Gated on `inSeasonTournament`. No sim impact yet.
4. **PR4** — Live standings. `applyCupResult` wired into box-score finalization. Group tab of NBACupView reads state. Cup becomes visible in-game.
5. **PR5** — Knockout. Group close, bracket build, QF schedule, SF/Final synth, `excludeFromRecord` W/L skip.
6. **PR6** — Awards + history archive. MVP, All-Tournament, rollover archive. History tab reads `nbaCupHistory`.
7. **PR7** — Schedule view tagging (§11b). `CalendarView` cascade + `DayView` card chip/eyebrow/border. Pure UI, ships safely off PR3 onwards.
8. **PR8** — Gist fetcher + Mode C historical (§5b). `nbaCupGistFetcher.ts`, `HistoricalNBACupData`, year-fallthrough wired in `NBACupView`.
9. **PR9** — Prize pool toggle + economy tie-in (§12). Defer-able if scope blows up — when off, system behaves identically to PR6 except no prize money lines.
10. **PR10** — Polish: broadcaster tagging, sim-button parity, LIVE badge, empty states, optional `LeagueHistoryView` Cup column.

Each PR is independently shippable.

---

## 11. Out of scope for v1

- Trophy presentation cutscene / LLM narrative (layer on later via existing social/news pipelines).
- Separate "Cup stats" view (group games count as RS → stats flow naturally).
- Historical backfill importer (defer; see §9.9).
- Cup-specific morale boost (existing championship-mood system covers it with lower weight).
- G-League / overseas cup equivalents.
- Player rest-likelihood Cup attribute (defer to GM attribute pass).

---

## 11b. Schedule-view tagging (`DayView` + `CalendarView`)

Cup games are tagged in `state.schedule` with `isNBACup: true` + `nbaCupRound`. The schedule views must surface that.

### `CalendarView.tsx` — tile decoration

Pattern: the file already maintains a strict cascade of mutually-exclusive flags (`isAllStarWeekend`, `hasFinals`, `showPlayoff`, `showPlayIn`, `isTradeDeadline`, …) where each tile renders the highest-priority match. Cup slots into that cascade.

**Add three new flags near line 145–151** (where `hasPlayoff`, `hasPreseason`, etc. are computed):

```ts
const hasCupGroup     = games.some((g: Game) => g.isNBACup && g.nbaCupRound === 'group');
const hasCupKO        = games.some((g: Game) => g.isNBACup && (g.nbaCupRound === 'QF' || g.nbaCupRound === 'SF'));
const hasCupFinal     = games.some((g: Game) => g.isNBACup && g.nbaCupRound === 'Final');
```

**Insert a Cup tile block in the cascade.** Recommended priority — Cup Final ranks just below NBA Finals and above generic Playoff; group/KO Cup nights rank above Trade Deadline / Lottery / etc.:

```tsx
{/* Cup Final — golden star variant */}
{!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && hasCupFinal && (
  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
    <Trophy size={22} className="md:w-7 md:h-7 text-amber-300/80" strokeWidth={1.5} fill="currentColor" />
    <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-amber-300/80">Cup Final</span>
  </div>
)}

{/* Cup KO (QF/SF) */}
{!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !hasCupFinal && hasCupKO && (
  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
    <Trophy size={20} className="md:w-6 md:h-6 text-orange-300/70" strokeWidth={1.5} />
    <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Cup KO</span>
  </div>
)}

{/* Cup Night (group stage) */}
{!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !hasCupFinal && !hasCupKO && hasCupGroup && (
  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
    <span className="text-[16px] md:text-[20px] opacity-50">🏆</span>
    <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Cup Night</span>
  </div>
)}
```

**Threading the new conditions through the cascade:** every existing tile-block below Cup must add `&& !hasCupGroup && !hasCupKO && !hasCupFinal` to its guard chain (matching the project's existing pattern of long `!a && !b && …` chains). Yes it's verbose; the file already does this for Trade Deadline / Lottery / Combine / etc.

**GM-mode rich cell:** when the user team is on the floor that night (`hasRichGM` branch around line 191+), keep the user-team logo treatment but add a small Cup badge in the corner so the user knows it's a Cup game, not a regular RS night. Pattern: existing `isUserPlayoff` tag adds an indigo Trophy chip; mirror that with an amber Cup chip when `userGame.isNBACup`.

### `DayView.tsx` — game card decoration

Pattern: cards already inject icons/labels for `isPlayoff`, `isPlayIn`, `isAllStar`, `isIntlPreseason`. Cup parallels.

**Around line 460** (the `border` color cascade), extend so Cup games get an amber tint:

```tsx
className={`bg-[#111] hover:border-white/10 ${
  game.isPlayoff || game.isPlayIn ? 'border-indigo-500/20'
  : game.isNBACup ? 'border-amber-500/30'
  : isIntlPreseason ? 'border-emerald-500/20'
  : 'border-white/5'
}`}
```

**Around line 464** (the small "Scheduled / Final / Intl Preseason" eyebrow), add a Cup branch:

```tsx
{isIntraSquad ? 'Scrimmage'
  : game.isNBACup ? (
      game.nbaCupRound === 'Final' ? 'Cup Final · Las Vegas'
      : game.nbaCupRound === 'SF'   ? 'Cup Semifinal · Las Vegas'
      : game.nbaCupRound === 'QF'   ? 'Cup Quarterfinal'
      :                                `Cup Night · Group ${game.nbaCupGroupId}`
    )
  : isIntlPreseason ? (game.played ? 'Intl Preseason · Final' : `Intl Preseason${(game as any).city ? ` · ${(game as any).city}` : ''}`)
  : game.played ? /* …existing Final/OT logic… */
  : 'Scheduled'}
```

**Around line 479** (where the Playoff logo chip renders), add a parallel Cup logo/icon:

```tsx
{game.isNBACup && (
  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
    <Trophy size={10} className="text-amber-400" />
    <span className="text-[8px] font-black uppercase tracking-widest text-amber-300">
      NBA Cup
    </span>
  </div>
)}
```

(Use a real NBA Cup logo URL once available; fall back to the Trophy icon in the meantime. Same fallback pattern the file uses for the Playoffs logo.)

**Sorting.** `DayView` already groups by `isAllStar` / `isPlayoff`. Cup Final (Dec 16) and SF (Dec 13) should sort to the top of their day's list (mirror the playoff prioritization). Group-stage Cup games sort like normal RS games — they ARE RS games, just tagged.

### Optional — broadcaster tagging during injection

Real Cup Nights are TNT/Prime. In `scheduleInjector.ts`, set `broadcaster: 'tnt'` (or `'prime'` for half the nights) and `broadcasterName: 'TNT'` on cup-tagged games. The existing broadcaster chip in `DayView` will pick it up for free.

---

## 12. Commissioner toggles (NEW)

Two rule flags govern the Cup. Both live in `LeagueStats` and are surfaced through `useRulesState.ts`:

### 12a. `inSeasonTournament` — already exists

- Lives on `state.leagueStats.inSeasonTournament` (default `true`).
- UI toggle in `FormatTab.tsx`.
- **All Cup pipeline code MUST gate on this.** When `false`: no draw, no schedule injection, NBACupView renders disabled empty state.

### 12b. `cupPrizePoolEnabled` — NEW (this spec)

- Lives on `state.leagueStats.cupPrizePoolEnabled` (default `true`).
- UI toggle in `EconomyTab.tsx` — add a new section just below Trade Exceptions, above Transaction Calendar.
- Gates whether the Cup distributes player prize money. When `false`, the prize pool dollars implicitly fold into general league revenue → handled by the standard `inflationEnabled` pass at rollover. No special routing needed; the money just doesn't leave the league.

**Behavioral matrix:**

| `cupPrizePoolEnabled` | Effect at Final |
|---|---|
| `true`  | `state.nbaCup.prizePool` populated, per-player payouts written to team finance reports (winner $500k / runner-up $200k / SF $100k / QF $50k per roster spot, defaults). |
| `false` | `state.nbaCup.prizePool` left `undefined`. No payouts. Cup view shows "Cup Bonuses Off" badge in place of prize block. Standard inflation handles league economy. |

**Where to add the UI in `EconomyTab.tsx`:**

```tsx
{/* Cup Prize Pool — between Trade Exceptions and Transaction Calendar */}
<div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
  <div className="flex items-center gap-2">
    <Trophy size={16} className="text-amber-400" />
    <h2 className="text-lg font-black text-white uppercase tracking-tight">NBA Cup Prize Pool</h2>
  </div>
  <label className="flex items-center justify-between cursor-pointer">
    <div className="flex flex-col">
      <span className="text-[11px] font-bold text-white">Distribute Cup Prize Money</span>
      <span className="text-[9px] text-slate-500">
        When on, Cup champions/finalists/semis/quarters earn per-player bonuses
        (~$500k / $200k / $100k / $50k). When off, money rolls into normal league inflation.
      </span>
    </div>
    <div className={`relative w-10 h-5 rounded-full transition-colors ${props.cupPrizePoolEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      <input
        type="checkbox"
        checked={props.cupPrizePoolEnabled}
        onChange={e => props.setCupPrizePoolEnabled(e.target.checked)}
        className="sr-only"
      />
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.cupPrizePoolEnabled ? 'translate-x-5' : ''}`} />
    </div>
  </label>
  {!props.inSeasonTournament && (
    <p className="text-[9px] text-amber-500/70 italic">
      In-Season Tournament is currently disabled — this setting has no effect.
    </p>
  )}
</div>
```

Wire props through `EconomyTabProps` (`cupPrizePoolEnabled: boolean` + `setCupPrizePoolEnabled`), `useRulesState.ts` (state pair, dirty-check, change-message, save-payload, reset), and the parent `TabsContent.tsx`. Pattern is identical to `tradeExceptionsEnabled`.
