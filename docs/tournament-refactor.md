# Tournament Engine Refactor — Spec / Roadmap

**Status:** plan / not started
**Owner:** TBD
**Last updated:** 2026-04-25
**Depends on:** `docs/nba-cup-implementation.md` (NBA Cup must ship first as the reference impl)

---

## 1. Why

NBA Cup is the first tournament we shipped. It works, but every piece is hardcoded to NBA: 30 teams, East/West conferences, Tue/Fri Cup Nights, in-season schedule weave, group IDs `'East-A' | ... | 'West-C'`. The moment we want **Summer League**, **FIBA World Cup**, or **Olympics**, we'd be either copy-pasting `nbaCup/` six times or rewriting half of it.

This doc is the refactor plan to make the tournament engine **format-agnostic**, with NBA Cup as the first preset and Summer League / FIBA / Olympics as future presets that reuse 80% of the code.

---

## 2. Reuse audit (what's reusable today vs. what's hardcoded)

### Reusable as-is
- **`drawGroups.ts`** — snake-assignment by tier. Works for any (teams, groupCount, perGroup) tuple.
- **`resolveGroupStage.ts`** — group-winner + wildcard ranking with W → H2H → PD → PF → seeded coin tiebreakers. Tournament-format-agnostic.
- **`advanceKnockoutBracket()`** — fills SF/Final from QF winners. Generic.
- **`updateCupStandings.ts`** — W/L/PF/PA/PD/GP accumulation. No NBA assumption.
- **`awards.ts`** — MVP + 5-man All-Tournament Team computed from box scores. Just needs award-type strings parameterized.
- **`seededRandom.ts`** — already format-agnostic.
- **View primitives** — `GroupTable`, `BracketDisplay`, `CupBracketLayout`, year-nav with sim/historical/gist modes. All reusable if the data adapter is swapped.

### Tightly coupled (refactor needed)
| Coupling | Where | Why it breaks for other tournaments |
|---|---|---|
| `NBACupGroup.id: 'East-A' \| ... \| 'West-C'` | `types.ts:31` | FIBA/Olympics has Group A/B/C/D, no conferences. Summer League uses pool numbers. |
| Tue/Fri "Cup Night" date logic | `scheduleInjector.ts:5-15` | Olympics is a single contiguous 16-day block. Summer League runs daily 10 days. |
| In-RS schedule weave | `gameScheduler.ts:172-178` + the whole "subtract-from-quota" plumbing | Standalone tournaments don't touch the RS schedule at all. |
| Team source = `state.teams` | everywhere | National teams need a separate registry. Summer League rosters are `rookies + non-roster invitees`. |
| `excludeFromRecord` flag | `types.ts:28` | Only meaningful for in-season tournaments. SL/Olympics never count. |
| 8-team KO bracket hardcoded | `resolveGroupStage.ts:96-124` | Olympics is 8-team KO from 12 group teams; FIBA WC is 16→8; SL has an 11-team bracket. |
| `T-Mobile Arena, Las Vegas` venue | `scheduleInjector.ts:122` | FIBA = wherever the host country chose. Olympics rotate. |
| Conference-balanced QF seeding | `resolveGroupStage.ts:107-114` | FIBA/Olympics don't have conferences. |
| Prize money $500k / $200k / ... | `awards.ts:115-120` | NBA-specific. Summer League pays nothing. Olympics pays nothing (medals only). |
| Rule toggle `inSeasonTournament` | `LeagueStats` | Each tournament needs its own toggle. |

---

## 3. Target architecture

### 3a. The tournament spec

A single `TournamentSpec` describes any tournament's shape:

```ts
// src/services/tournament/types.ts

export interface TournamentSpec {
  id: 'nba-cup' | 'summer-league' | 'fiba-world-cup' | 'fiba-eurobasket' | 'olympics';
  displayName: string;          // "NBA Cup", "Summer League", etc.

  // Group stage
  groupCount: number;           // 6 (NBA Cup) | 4 (FIBA) | 3 (Olympics) | 0 (no group, straight KO)
  teamsPerGroup: number;        // 5 | 4 | 4 | n/a
  groupGamesPerTeam: number;    // 4 (NBA Cup, plays 4 of 4 others) | 3 (FIBA round-robin)
  groupIdScheme: 'letter' | 'east-west-letter' | 'pool-number';
                                // letter: A/B/C/D (FIBA)
                                // east-west-letter: East-A/East-B/.../West-C (NBA Cup)
                                // pool-number: Pool 1/Pool 2 (Summer League)

  // Knockout
  knockoutSize: number;         // 8 (NBA Cup, Olympics) | 16 (FIBA WC second round) | 0 (no KO)
  knockoutAdvancePerGroup: number; // 1 (group winner only) | 2 (top 2) | 4 (FIBA top 2 + crossover)
  wildcardCount: number;        // 2 (NBA Cup, 1 per conf) | 0 (most others)

  // Schedule
  scheduleMode: 'in-season-weave' | 'standalone-block';
  // 'in-season-weave' → games inject into RS schedule (NBA Cup only)
  // 'standalone-block' → contiguous date block, doesn't touch other schedules
  scheduleWindow: {
    groupStart: string;         // "MM-DD"
    groupEnd: string;           // "MM-DD"
    knockoutStart: string;      // "MM-DD"
    knockoutEnd: string;        // "MM-DD"
  };
  scheduleSlotPattern?: 'tue-fri' | 'daily' | 'every-2-days';
                                // Only used for in-season-weave; standalone tournaments
                                // pack games sequentially.

  // Stats / record
  countsTowardRecord: {
    group: boolean;             // NBA Cup: true. SL/FIBA/Olympics: false.
    quarterfinal: boolean;      // NBA Cup: true. Others: false.
    semifinal: boolean;         // NBA Cup: true (recent rule). Others: false.
    final: boolean;             // NBA Cup: false. Others: false.
  };
  countsTowardStats: {          // separate from W/L — controls if box scores accumulate
    group: boolean;             // NBA Cup: true. SL: false. FIBA/Olympics: false.
    knockout: boolean;          // NBA Cup: true (except Final). Others: false.
  };

  // Teams
  teamSource: 'nba' | 'national' | 'summer-roster';
  // 'nba'           → state.teams[].id 0-29
  // 'national'      → state.nationalTeams[] (new registry)
  // 'summer-roster' → state.summerLeagueRosters[] (rookies + invitees per franchise)

  // Awards
  awards: {
    mvp: { type: string };                    // "NBA Cup MVP", "Summer League MVP", "FIBA WC MVP"
    allTournament: { type: string; size: number };
                                              // size 5 (NBA Cup, FIBA), size 0 (SL doesn't have one)
    champion: { type: string };               // "NBA Cup Champion", "Olympic Gold Medalist"
    runnerUp?: { type: string };              // "Olympic Silver Medalist", "FIBA Runner-Up"
    third?: { type: string };                 // "Olympic Bronze Medalist", "FIBA Third Place"
  };

  // Prize pool (optional)
  prizePool?: {
    enabled: boolean;            // default true; toggleable by commissioner
    perPlayerByFinish: { winner: number; runnerUp: number; semi: number; quarter: number };
  };

  // Rule toggle
  enabledFlag: keyof LeagueStats;  // 'inSeasonTournament' | 'summerLeagueEnabled' | 'fibaWorldCupEnabled' | 'olympicsEnabled'
}
```

### 3b. The tournament state

Replace `nbaCup: NBACupState` with a generic registry:

```ts
// src/types.ts (replaces NBACupState)

export interface TournamentGroup {
  id: string;                              // 'East-A' | 'A' | 'Pool 1' — driven by groupIdScheme
  conference?: 'East' | 'West';            // Only set when groupIdScheme === 'east-west-letter'
  teamIds: number[];
  standings: Array<{
    tid: number;
    w: number; l: number;
    pf: number; pa: number; pd: number;
    gp: number;
  }>;
}

export interface TournamentKnockoutGame {
  round: 'R32' | 'R16' | 'QF' | 'SF' | 'Final' | 'Bronze';
  bracketSlot: number;                     // 0-indexed slot for stable matchup pairing
  seed1: number; seed2: number;
  tid1: number; tid2: number;
  gameId?: number;
  winnerTid?: number;
  countsTowardRecord: boolean;
}

export interface TournamentInstance {
  specId: TournamentSpec['id'];
  year: number;                            // Year the tournament BELONGS to (NBA Cup 2025-26 → 2026)
  status: 'group' | 'knockout' | 'complete';
  groups: TournamentGroup[];
  wildcards: Record<string, number | null>; // 'East'/'West' for NBA Cup; '' for non-conference tournaments
  knockout: TournamentKnockoutGame[];
  championTid?: number;
  runnerUpTid?: number;
  thirdTid?: number;                       // Bronze medal (Olympics)
  mvpPlayerId?: string;
  allTournamentTeam?: Array<{ playerId: string; tid: number; pos: string; isMvp: boolean }>;
  prizePool?: { perPlayerByFinish: { winner: number; runnerUp: number; semi: number; quarter: number } };
}

// GameState changes:
//   nbaCup → tournaments: Record<TournamentSpec['id'], TournamentInstance>
//   nbaCupHistory → tournamentHistory: Record<TournamentSpec['id'], Record<number, TournamentInstance>>
//
// Game tag changes:
//   isNBACup → tournamentId?: TournamentSpec['id']
//   nbaCupRound → tournamentRound?: TournamentKnockoutGame['round'] | 'group'
//   nbaCupGroupId → tournamentGroupId?: string
```

### 3c. The tournament service (one engine, many specs)

```ts
// src/services/tournament/

drawGroups.ts          ← drawTournamentGroups(spec, teams, prevStandings, saveId, year)
scheduleInjector.ts    ← injectTournamentGames(spec, schedule, instance, ...)
                         ↳ branches on spec.scheduleMode
updateStandings.ts     ← applyTournamentResult(spec, instance, game, result)
                         ↳ generic — no NBA assumptions
resolveGroupStage.ts   ← resolveGroupStage(spec, instance, schedule, saveId)
                         ↳ generic seeding by spec.knockoutAdvancePerGroup + spec.wildcardCount
awards.ts              ← computeAwards(spec, instance, schedule, boxScores, players)
                         ↳ writes spec.awards.{mvp, allTournament, champion, ...} to player.awards
specs/
  nbaCup.ts            ← const NBA_CUP_SPEC: TournamentSpec = { ... }
  summerLeague.ts      ← const SUMMER_LEAGUE_SPEC: TournamentSpec = { ... }
  fibaWorldCup.ts      ← const FIBA_WORLD_CUP_SPEC: TournamentSpec = { ... }
  olympics.ts          ← const OLYMPICS_SPEC: TournamentSpec = { ... }
  index.ts             ← export const ALL_SPECS = [NBA_CUP_SPEC, SUMMER_LEAGUE_SPEC, ...]
```

### 3d. The view (one component, many tournaments)

```tsx
// src/components/central/view/tournament/

TournamentView.tsx            ← <TournamentView specId="nba-cup" />
                                ↳ replaces NBACupView entirely
GroupStandingsLayout.tsx      ← already exists (rename from CupGroupStandingsLayout)
BracketLayout.tsx             ← already exists (rename from CupBracketLayout)
HistoricalGistFetcher.tsx     ← per-tournament gist URL config
adapters/
  nbaCup.ts                   ← cupStateToViewData → tournamentStateToViewData (already generic-ish)
  wikiAdapter.ts              ← gist data → view data
```

### 3e. Sim hook (one entry point, all tournaments)

In `simulationHandler.ts`:

```ts
// BEFORE (current — NBA Cup specific)
if (stateWithSim.leagueStats.inSeasonTournament !== false && stateWithSim.nbaCup) {
  // ... NBA Cup result handling
}

// AFTER (multi-tournament)
for (const spec of ALL_SPECS) {
  if (!stateWithSim.leagueStats[spec.enabledFlag]) continue;
  const instance = stateWithSim.tournaments?.[spec.id];
  if (!instance) continue;
  stateWithSim = applyTournamentTick(spec, instance, stateWithSim, simPatch);
}
```

`applyTournamentTick` collapses all the per-game / phase-transition / awards logic that today lives inline in simulationHandler:322-380.

---

## 4. Migration path (PR sequence)

### PR 1 — Generic types (no behavior change)
- Add `TournamentSpec`, `TournamentInstance`, `TournamentGroup`, `TournamentKnockoutGame` to `types.ts`.
- Mark old `NBACupState` etc. as `@deprecated`, leave in place.
- No logic change; types coexist.

### PR 2 — Extract NBA Cup as a spec
- Create `src/services/tournament/specs/nbaCup.ts` containing `NBA_CUP_SPEC`.
- Generic engine functions (`drawTournamentGroups`, `applyTournamentResult`, etc.) wrap the existing NBA Cup ones, paramterized on the spec.
- NBA Cup pipeline still runs through the OLD `state.nbaCup` field — but internally it dispatches through the generic engine.

### PR 3 — State migration
- Add `state.tournaments[specId]` and `state.tournamentHistory[specId][year]`.
- `LOAD_GAME` migration: if `state.nbaCup` exists, copy to `state.tournaments['nba-cup']`.
- Read paths gradually flip from `state.nbaCup` → `state.tournaments['nba-cup']`.
- Old field stays for one release for safety, then deleted.

### PR 4 — Generic view
- `TournamentView` replaces `NBACupView`. Routes by `specId` prop.
- `MainContent.tsx` swaps `<NBACupView />` for `<TournamentView specId="nba-cup" />`.
- Visual output identical.

### PR 5 — First new tournament: Summer League
- New spec file `summerLeague.ts`.
- New rule toggle `summerLeagueEnabled` in `LeagueStats`.
- Schedule injection into July (post-draft, pre-FA-moratorium).
- Roster source: rookies + a small pool of `tid: -1` invitees.
- Awards: SL MVP only (no All-Tournament Team).
- New menu entry in central dashboard.

### PR 6 — FIBA infra (national teams)
- New `state.nationalTeams: NationalTeam[]` registry seeded from a gist (USA, Canada, France, etc.).
- New `player.nationality` field (already exists as `player.born.loc` — reuse).
- Roster selection: top N players per country by K2 OVR.
- Spec runs every 4 years (FIBA World Cup) or 4 years offset (EuroBasket).

### PR 7 — Olympics
- Reuses FIBA national team infra.
- 12 teams, 3 groups of 4, top 2 + best 2 third-placers → 8-team KO.
- Schedule: 16-day window every 4 years (summer of leap year, kind of).
- Awards: Gold/Silver/Bronze (use `championTid`/`runnerUpTid`/`thirdTid`).

---

## 5. Effort estimate

| Phase | Effort | Risk |
|---|---|---|
| PR 1-2 (types + NBA Cup as spec) | 1 day | Low — purely additive |
| PR 3 (state migration) | 1-2 days | Medium — LOAD_GAME backwards-compat |
| PR 4 (generic view) | 1 day | Low — rename + parameterize |
| PR 5 (Summer League) | 3-4 days | Low if PRs 1-4 are clean |
| PR 6 (FIBA national teams) | 1 week | High — new data model, new gists, player nationality refinement |
| PR 7 (Olympics) | 1.5 weeks | Medium — sits on PR 6, just a different spec + 4-year cadence |

**Total to all four tournaments: ~3-4 weeks engineering.**

**Worth-it threshold:**
- If shipping only Summer League → maybe skip the refactor; copy NBA Cup pattern as a one-off.
- If shipping ANY two of {Summer League, FIBA, Olympics} → do the refactor.
- If shipping all three → do the refactor immediately.

---

## 6. Out of scope (defer)

- WNBA Commissioner's Cup (same shape as NBA Cup, drop in as a spec later).
- G-League Showcase (mini tournament; same pattern).
- High school / college brackets (different ratings system entirely).
- Custom commissioner-defined tournaments (UI to design a spec on the fly — way later).

---

## 7. Open questions

1. **Player release for FIBA/Olympics** — when Team USA plays the World Cup in August, do their NBA players "leave" their NBA team? Probably just a flag `isInternationalDuty: true` for the tournament window with no real roster impact in v1.
2. **Stats bucketing** — do FIBA stats count toward player.stats[]? Probably no, but where do they go? New `player.fibaStats[]` array? Or just sit in box scores keyed by `tournamentId`?
3. **Historical gist for FIBA/Olympics** — Wikipedia has structured data for FIBA/Olympics tournaments. Reuse the wiki-fetcher pattern from NBA Cup, but each tournament needs its own gist URL + parser.
4. **National team roster updates** — do they refresh annually based on player progression? Yes — should re-pick top-N by K2 OVR before each tournament.
5. **Eligibility for naturalized players** — FIBA allows 1 naturalized player per country. Need a `naturalizedFor: countryCode` field. Defer to v2.

---
