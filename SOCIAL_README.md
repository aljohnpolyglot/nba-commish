# Social Feed System — NBA Commish Sim

This document covers every layer of the social feed: data sources, handle registry, template architecture, the `SocialEngine`, the `SocialContext`, all template files, and the `Charania` standalone builders. Read this before doing any social makeover work.

> **⚠️ LLM API Preference**: This app uses **Groq + Together AI workers only**. `@google/genai` and `process.env.GEMINI_API_KEY` are NOT used — any reference to them is legacy/broken. Always call `generateContentWithRetry` from `src/services/llm/utils/api.ts`. Chat → Groq Worker. Non-chat (social post generation, news, simulation) → Together AI Worker.

> **⚠️ Post Dating**: Shams injury posts and any social post tied to a specific game must use `result.date` (the game's date from `GameResult`), NOT `state.date` or `endDateString`. See `socialHandler.ts` and the README for the full dating rules.

---

## 1. High-Level Architecture

```
Game Results (GameResult[])
        │
        ▼
SocialEngine.generateDailyPosts()          ← called from socialHandler.ts each batch
        │
        ├── For each GameResult
        │       ├── Team contexts (home + away, no player)
        │       ├── Player contexts (sorted by gameScore desc)
        │       └── Injury contexts
        │
        └── For each context → processContext()
                │
                ├── Sort SOCIAL_TEMPLATES by priority desc
                ├── Per-game dedup guards (usedTemplateIds, handlePlayerUsed, handlePostCount)
                ├── LLM override: skip type='news' for shams/woj if LLM is ON
                ├── condition(ctx) check
                ├── Priority/probability roll (priority × multiplier > Math.random() × 100)
                ├── Standard token replacement  {{player}}, {{pts}}, {{team}}, etc.
                ├── template.resolve() for dynamic/computed posts
                └── Push SocialPost to posts[]
```

Transaction posts (signings, trades) bypass `SocialEngine` entirely — they are injected directly onto `result.newSocialPosts` from action handlers after `advanceDay()` returns.

---

## 2. Data Layer (`src/data/social/`)

### `handles.ts` — `SOCIAL_HANDLES`

The canonical registry of every account that can post. Each entry is a `SocialHandle`:

```ts
{
  id: string;       // used to match templates → 'statmuse', 'shams', 'bleacher_report'
  name: string;     // display name
  handle: string;   // without @, e.g. 'statmuse'
  avatarUrl?: string;
  description: string;
  verified: boolean;
}
```

**Categories in the registry:**

| Category | Handles |
|---|---|
| Official | `NBA`, `NBAPR` |
| News Breakers | `Shams`, `Woj` |
| Aggregators / Hype | `NBACentral`, `LegionHoops`, `BasketballForever`, `NBAonESPN`, `SportsCenter`, `BleacherReport`, `HoopCentral`, `StephenA`, `MarcStein`, `Underdog`, `Wob`, `Windhorst`, `NBATV`, `GilsArena` |
| Stats / Analysis | `StatMuse`, `BasketballRef` |
| Memes / Parody | `NBAMemes`, `NBACentel`, `RefWatcher` |

> **Note:** `handles.ts` (used by `SocialEngine`) and `handlers.ts` (legacy data file with different shape) are **two different files**. `SocialEngine` uses `handles.ts`. `handlers.ts` is an older format and is not actively consumed.

---

### `handlers.ts` — `TWITTER_HANDLERS` (legacy / unused in engine)

An older `TwitterHandler[]` array with `descriptions`, `category`, and `probability` fields. Not consumed by `SocialEngine`. May be used by LLM prompt builders or future features. **Do not delete** — check usages before touching.

---

### `statmuseImages.ts` — `STATMUSE_PLAYER_IMAGES`

Fetches a player image map from a GitHub Gist on session start via `fetchStatmuseData()`. The result is stored in `STATMUSE_PLAYER_IMAGES` (a `Record<string, string>`) and used by StatMuse templates to attach player portraits to stat posts.

```ts
fetchStatmuseData() → STATMUSE_PLAYER_IMAGES  // called once at app load
```

---

### `templates.ts` — Legacy re-export barrel (from `src/data/social/`)

Imports from `src/data/social/templates/` (note: separate from `src/services/social/templates/`). This barrel aggregates:

```
GAME_RESULT_TEMPLATES, BOX_SCORE_TEMPLATES, INSIDER_GAME_TEMPLATES,
STATMUSE_BOX_SCORE, LEGION_HOOPS_BOX_SCORE, SKIP_BAYLESS_INSIDER,
WOJ_INSIDER, SHAMS_INSIDER, PLAYER_FEAT_TEMPLATES, CULTURE_TEMPLATES,
WIN_STREAK_TEMPLATES, SHITPOST_TEMPLATES, BAD_GAME_TEMPLATES,
DEFENSIVE_MASTERCLASS_TEMPLATES, INJURY_TEMPLATES
```

> **Note:** The active engine uses templates from `src/services/social/templates/`, not this data folder. This `templates.ts` may be a legacy or partial duplicate. Verify before the makeover.

---

## 3. Service Layer (`src/services/social/`)

### `types.ts` — `SocialContext` and `SocialTemplate`

**`SocialContext`** — passed to every template's `condition`, `priority`, `template`, and `resolve`:

```ts
{
  game: GameResult          // score, OT count, homeTeamId, awayTeamId, gameId
  player?: NBAPlayer        // primary player subject (null for team-only posts)
  players: NBAPlayer[]      // all players in league
  team?: NBATeam            // primary team subject
  teams: NBATeam[]          // all teams
  opponent?: NBATeam        // opponent team
  stats?: PlayerGameStats   // pts, reb, ast, blk, stl, tov, fgm, fga, threePm, threePa, gameScore, min
  injury?: {                // present only in injury contexts
    playerId: string
    injuryType: string
    gamesRemaining: number
  }
  date?: string
  dayOfWeek?: string
}
```

**`SocialTemplate`** — the shape every template must match:

```ts
{
  id: string                                              // unique, used for dedup
  handle: string                                          // maps to SOCIAL_HANDLES[x].id
  template: string | ((ctx) => string)                    // static string or dynamic fn
  priority: number | ((ctx) => number)                    // 0–100, higher fires first
  condition: (ctx) => boolean                             // gate for this template
  resolve?: (template, ctx) => string | {                 // optional post-process
    content: string
    avatarUrl?: string
    mediaUrl?: string
    mediaBackgroundColor?: string
    data?: any
  }
  type?: 'statline' | 'highlight' | 'news' | 'meme' | 'general'
}
```

---

### `SocialEngine.ts`

The main post generator. Called once per batch by `socialHandler.ts`.

**Key behaviors:**

- Iterates all `GameResult[]`, builds 3 context passes per game: team (×2), players (sorted gameScore desc), injuries
- `processContext()` runs the sorted template list against each context
- **Dedup guards per game:**
  - `usedTemplateIds` — no template fires twice in the same game
  - `handlePlayerUsed` — same handle can't post about same player twice per game
  - `handlePostCount` — enforces `HANDLE_POST_CAPS` (see below)
- **LLM override:** if LLM is ON, templates with `type: 'news'` from `shams` or `woj` handles are skipped (LLM generates richer versions)
- **Multiplier:** for multi-day lazy sims, priority is divided by `daysToSimulate` to thin out posts
- **Token replacement:** standard tokens applied before `resolve()`:

| Token | Value |
|---|---|
| `{{player}}` / `{{PLAYER}}` | player name (title / upper case) |
| `{{team}}` / `{{TEAM}}` | team name |
| `{{team_handle}}` | team's Twitter handle |
| `{{opponent}}` / `{{OPPONENT}}` | opponent name |
| `{{opponent_handle}}` | opponent's Twitter handle |
| `{{pts}}`, `{{reb}}`, `{{ast}}`, `{{blk}}`, `{{stl}}`, `{{tov}}` | game stats |
| `{{fgm}}`, `{{fga}}`, `{{3pm}}`, `{{3pa}}` | shooting stats |
| `{{ot_suffix}}` | ` (OT)` / ` (2OT)` / empty |
| `{{ot_text}}` | ` in OT` / ` in 2OT` / empty |
| `{{winner_score}}`, `{{loser_score}}` | final scores |
| `{{city}}`, `{{arena}}` | home team city and arena name |
| `{{day}}` | day of week string |
| `{{age}}` | player age |
| `{{seasons}}` | career seasons count |
| `{{injury_type}}`, `{{games_missed}}` | injury context |

**`HANDLE_POST_CAPS`** — max posts per handle per game:

```ts
statmuse: 3,  bball_forever: 3,  legion_hoops: 3,
nba_central: 2,  hoop_central: 2,  bleacher_report: 3,
nba_official: 2,  underdog_nba: 4,  shams: 2,
nba_centel: 1,  nba_memes: 1
// everything else: DEFAULT_CAP = 2
```

---

### `SocialRegistry.ts`

Simple re-export: `export { SOCIAL_TEMPLATES } from './templates'`

---

### `helpers.ts` — Template utility functions

Used inside template files. Key exports:

| Function | Returns | Notes |
|---|---|---|
| `get2KRating(player)` | number (2K scale ~60–99) | converts BBGM overallRating |
| `calculateAge(player)` | number | uses `born.year`, fallback to `player.age` |
| `getRating(player, key)` | number | latest ratings entry for a key |
| `isRookie(player)` | bool | drafted 2025 |
| `isVeteran(player)` | bool | 10+ yrs experience or 32+ age |
| `isAllStar(player)` | bool | has All-Star award |
| `isRolePlayer(player)` | bool | 2K rating 75–82 |
| `isTripleDouble(stats)` | bool | 3+ double-digit categories |
| `isDoubleDouble(stats)` | bool | 2+ double-digit categories |
| `is5x5(stats)` | bool | 5+ in all 5 categories |
| `getGameScore(stats)` | number | Hollinger game score formula |
| `getStatlineString(stats)` | string | multiline e.g. `"30 PTS\n10 REB"` |
| `getCurrentSeasonStats(player)` | object | last element in `player.stats[]` |
| `getCareerHigh(player, key)` | number | max across all seasons |
| `isReigningChamp(team)` | bool | won 4 playoff rounds in 2025 |
| `getRandomUnstoppable()` | string | random hype phrase ("HIM.", "Cooking.", etc.) |
| `getRandomTime()` | string | random `m:ss` time string |

---

## 4. Template Files (`src/services/social/templates/`)

All templates are merged in `index.ts` → `SOCIAL_TEMPLATES[]` → consumed by `SocialEngine`.

### Active templates

| File | Export | Handle(s) | Typical post type |
|---|---|---|---|
| `statmuse.ts` | `STATMUSE_TEMPLATES` | `statmuse` | Stat lines, historical comparisons, career highs |
| `legionHoops.ts` | `LEGION_HOOPS_TEMPLATES` | `legion_hoops` | Hype posts, trade rumors, aggregator |
| `nbaCentral.ts` | `NBA_CENTRAL_TEMPLATES` | `nba_central` | News aggregation, quote posts |
| `nbaOfficial.ts` | `NBA_OFFICIAL_TEMPLATES` | `nba_official` | Official recaps, game wrap-ups |
| `bleacherReport.ts` | `BLEACHER_REPORT_TEMPLATES` | `bleacher_report` | Culture/hype posts |
| `nbaMemes.ts` | `NBA_MEMES_TEMPLATES` | `nba_memes` | Meme reactions to bad games / upsets |
| `nbaCentel.ts` | `NBA_CENTEL_TEMPLATES` | `nba_centel` | Parody/satire posts |
| `hoopCentral.ts` | `HOOP_CENTRAL_TEMPLATES` | `hoop_central` | Polls, RT/Like posts |
| `insiders.ts` | `INSIDER_TEMPLATES` | `shams`, `woj`, `marc_stein` | Injury news (type='news'), suppressed when LLM ON |
| `charania.ts` | `CHARANIA_TEMPLATES` | `shams` | Injury posts with full severity logic (see §5) |
| `basketballForever.ts` | `BASKETBALL_FOREVER_TEMPLATES` | `bball_forever` | Timeless basketball takes |
| `underdog.ts` | `UNDERDOG_NBA_TEMPLATES` | `underdog_nba` | Lineup alerts, injury updates |
| `personalities.ts` | `PERSONALITY_TEMPLATES` | `stephen_a`, `skip_bayless`, `kendrick_perkins`, etc. | Debate/hot-take posts |
| `wojnarowski.ts` | `WOJNAROWSKI_TEMPLATES` | `woj` | **Currently commented out** in index.ts |
| `aggregators.ts` | `AGGREGATOR_TEMPLATES` | various | **Currently commented out** in index.ts |

### Template priority guide

| Priority range | Meaning |
|---|---|
| 90–100 | Breaking news, season-ending injury (Shams top tier) |
| 70–89 | Notable injuries, star game performances |
| 50–69 | Solid performances, streak posts |
| 30–49 | Role player posts, culture posts |
| 10–29 | Memes, parody, filler |

---

## 5. Charania Templates (`charania.ts`) — The Two-Layer System

Shams posts work differently from all other templates because Shams has two distinct modes.

### Layer 1 — Injury templates (condition-based, game-driven)

`CHARANIA_TEMPLATES[]` — 7 templates evaluated by `SocialEngine` per injury context:

| Template ID | Condition | Priority |
|---|---|---|
| `shams_season_ending_star` | 2K ≥ 90, season-ending injury | 100 |
| `shams_long_term_star` | 2K ≥ 88, 25–59 games out | 95 |
| `shams_mid_term` | 2K ≥ 84, 8–24 games out | 90 |
| `shams_short_term` | 2K ≥ 84, 3–7 games out | 85 |
| `shams_day_to_day` | 2K ≥ 88, ≤ 2 games out | 80 |
| `shams_load_management` | 2K ≥ 90, Load Management type | 75 |
| `shams_rotation_player` | 2K 92–95, 5–20 games, 55% roll | 70 |

All 7 call `buildShamsPost(ctx)` which dynamically selects wording based on severity, injury type, adds season stats context (OVR ≥ 75/76/78), team record context (35% random chance), and injury-specific medical context.

**`gamesToTime(games)`** — converts game count to human language Shams-style:
- `≤ 2` → `"day-to-day"` ... `≥ 80` → `"the remainder of the season"`

**`getInjuryContext(type, games)`** — adds injury-specific medical sentence:
- ACL/Achilles → expected out rest of season + into next year
- Labrum (40+ games) → surgery likely
- Concussion → daily protocol
- Bone bruise → no structural damage
- etc.

### Layer 2 — Standalone builders (transaction-driven)

Called directly from action handlers, always fire regardless of LLM state:

**`buildShamsSigningPost(playerName, teamName, teamAbbrev, ovr, prevTeam?, prevLeague?, salary?)`**
- OVR ≥ 85 → "BREAKING: [Team] are signing [Player]"
- OVR ≥ 78 → "veteran [Player] has agreed"
- Below 78 → short abbrev format
- Adds salary string if ≥ $5M, adds previous team/league context

**`buildShamsTradePost(teamAName, teamAAbbrev, teamBName, teamBAbbrev, assetsToB[], assetsToA[])`**
- 4+ assets total → "BREAKING:", else "Sources:"
- 3 randomized format variants
- Called from `tradeActions.ts → handleExecutiveTrade`

---

## 6. Transaction Injection Pattern

Shams signing/trade posts are injected **after** `advanceDay()` returns, not through `SocialEngine`:

```ts
// In playerActions.ts / tradeActions.ts
const result = await advanceDay(...);

const content = buildShamsSigningPost(...);   // or buildShamsTradePost()
if (content) {
    result.newSocialPosts = [{
        id: `shams-signing-${Date.now()}`,
        author: 'Shams Charania',
        handle: '@ShamsCharania',
        content,
        date: state.date,
        likes: engagement.likes,
        retweets: engagement.retweets,
        source: 'TwitterX',
        isNew: true,
    }, ...(result.newSocialPosts || [])];
}
```

**Why inject after advanceDay?** The LLM-off early-return path in `simulation.ts` ignores `payload.announcements`, so anything injected before `advanceDay` may be lost. Post-return injection is always safe.

---

## 7. Feed Merge and Dedup

`socialHandler.ts` merges all post sources before writing to state:

1. LLM-generated posts (if LLM ON) — recalculates engagement
2. `SocialEngine.generateDailyPosts()` — template-driven
3. Shams injury posts (from `allSimResults.injuries`, OVR ≥ 70)
4. `generateLazySimNews()` — deterministic news items

Posts dedup against existing `state.socialFeed` by `id` before merge.

---

## 8. Photo Enrichment (`photoEnricher.ts`)

`photoEnricher.ts` and `gameImageGenerator.ts` attach media to posts (player portraits, stat cards). Called from `resolve()` in StatMuse templates to add `mediaUrl` and `mediaBackgroundColor`.

---

## 9. Key Files Quick Reference

| File | Role |
|---|---|
| `src/data/social/handles.ts` | Handle registry — `SOCIAL_HANDLES` |
| `src/data/social/handlers.ts` | Legacy `TWITTER_HANDLERS[]` array |
| `src/data/social/statmuseImages.ts` | Remote player image map fetch |
| `src/data/social/templates.ts` | Legacy template barrel (data folder) |
| `src/services/social/types.ts` | `SocialContext`, `SocialTemplate` interfaces |
| `src/services/social/SocialEngine.ts` | Post generator — template loop per game |
| `src/services/social/SocialRegistry.ts` | Re-exports `SOCIAL_TEMPLATES` |
| `src/services/social/helpers.ts` | Template utility functions |
| `src/services/social/photoEnricher.ts` | Media/image attachment for posts |
| `src/services/social/gameImageGenerator.ts` | Stat card image generation |
| `src/services/social/charaniaphotos.ts` | Fetches real Shams tweet photos from GitHub; `findShamsPhoto()` |
| `src/services/social/nbaMemesFetcher.ts` | Fetches real NBA memes from GitHub; `pickMemePost()` |
| `src/services/social/templates/index.ts` | Merges all template arrays |
| `src/services/social/templates/charania.ts` | Shams injury templates + standalone builders |
| `src/services/social/templates/statmuse.ts` | StatMuse stat line posts |
| `src/services/social/templates/insiders.ts` | Insider news templates (LLM-suppressed) |
| `src/services/social/templates/nbaMemes.ts` | **Empty** — game-context memes retired; real memes via `nbaMemesFetcher.ts` |
| `src/services/social/templates/personalities.ts` | Debate personality posts |
| `src/services/social/templates/underdog.ts` | Lineup/injury alerts |
| `src/store/logic/turn/socialHandler.ts` | Orchestrates merge + dedup per batch |
| `src/components/messages/ChatList.tsx` | Social feed UI |

---

## 10. Adding a New Template (Checklist)

1. Pick a `handle` id from `SOCIAL_HANDLES` (e.g., `'statmuse'`, `'bball_forever'`)
2. Write a `SocialTemplate` object:
   - Unique `id`
   - `condition(ctx)` — return false for all non-matching contexts (fast path)
   - `priority` — pick from the range table in §4
   - `template` — static string with `{{tokens}}` OR a function
   - `resolve` — only needed if you need dynamic content, media, or avatar override
   - `type` — set `'news'` if it should be suppressed when LLM is ON
3. Add to the correct file in `src/services/social/templates/`
4. Export and import in `index.ts`
5. Check `HANDLE_POST_CAPS` — if your handle posts a lot, add a cap entry

---

## 12. Charania Photo Helper (`charaniaphotos.ts`)

Fetches a pool of real Shams tweet photos from GitHub at app startup (same pattern as `statmuseImages.ts`). Called in `App.tsx` → `fetchCharaniaPhotos()`.

**`findShamsPhoto(playerName, teamName)`** — match order (NO fallback, returns null if nothing hits):

| Priority | Rule | Example |
|---|---|---|
| 1st | Last name + team | `"green" + "Warriors"` → Draymond, not Jalen Green |
| 2nd | Full player name | `"stephen curry"` |
| 3rd | Last name only | acceptable near-miss (user accepts Seth finding Stephen) |

When a match is found → photo always attached (`mediaUrl`) + real engagement numbers used. When no match → post is sent without a photo, never a random fallback.

**Data source:** `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/shamstweetsphotos`

---

## 13. NBA Memes Fetcher (`nbaMemesFetcher.ts`)

Fetches a pool of real `@NBAMemes` tweets from GitHub at app startup. Called in `App.tsx` → `fetchNBAMemes()`.

Game-context meme templates (`nbaMemes.ts`) are **retired** (empty array). Memes now fire independently of game results in `socialHandler.ts` via `pickMemePost(date)`.

**Frequency:**

| Period | Chance per sim day |
|---|---|
| Regular season / playoffs | ~28% (~2× per week) |
| Offseason (Jul 1 – Oct 23) | ~70% (high activity) |

- One meme per calendar day max
- Cycles through all memes before repeating
- Real engagement numbers (likes/reposts) from the JSON

**Data source:** `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbamemestweets`

---

## 14. HighlightGenerator (`src/services/simulation/HighlightGenerator.ts`)

Called at the end of every `_simulateGameOnce()` in `engine.ts`. Returns `GameHighlight[]` stored on `GameResult.highlights`.

**Phase 1:** generate + store only. **Phase 2 (future):** social templates + live commentary consume `highlights[]`.

### Highlight types

| Type | Badge / Source | Stored extra fields |
|---|---|---|
| `driving_dunk` | `Inside Scoring['Driving Dunk']` rating | — |
| `standing_dunk` | `Inside Scoring['Standing Dunk']` rating | — (NO posterize) |
| `posterizer` | Posterizer badge (driving dunk only) | `victimId`, `victimName` (opposing big) |
| `alley_oop` | Aerial Wizard badge (dunker) | `assisterId`, `assisterName` (passer) |
| `fastbreak_dunk` | team STL ≥ 3 + driving dunk roll | `assisterId`, `assisterName` (break starter) |
| `break_starter` | Break Starter badge + STL > 0 | `assisterId`, `assisterName` (finisher/receiver) |
| `layup_mixmaster` | Layup Mixmaster badge (non-dunk rim make) | — |
| `limitless_3` | Limitless Range badge + 3PM | `pts: 3` |
| `ankle_breaker` | Ankle Assassin badge (mid/post make) | `victimId`, `victimName` (opposing guard/wing) |
| `versatile_visionary` | Versatile Visionary badge + AST | `assisterId`, `assisterName` (recipient) |
| `tech_foul` | cosmetic — max-pf player in high-foul game | — |
| `timeout` | cosmetic — both teams, 4-7 per team | `description` |
| `coach_challenge` | cosmetic — ~15% per game | `description` (overturned/upheld) |

### How templates access highlights

```ts
// In any SocialTemplate condition/resolve:
const hl: any[] = (ctx.game as any).highlights ?? [];

// Find a specific event for the current player:
const posterizer = hl.find((h: any) => h.type === 'posterizer' && h.playerId === ctx.player?.internalId);

// Check if this player is a VICTIM:
const gotAnklesBroken = hl.some((h: any) => h.type === 'ankle_breaker' && h.victimId === ctx.player?.internalId);
```

### Template files using highlights

| File | Templates | What they consume |
|---|---|---|
| `bleacherReport.ts` | `br_poster`, `br_alley_oop`, `br_fastbreak`, `br_detonated` | posterizer (victim name), alley_oop (passer), fastbreak_dunk (starter) |
| `nbaCentel.ts` | `centel_tech`, `centel_posterized`, `centel_ankles` | tech_foul (T'd-up player), posterizer victim, ankle_breaker victim |

---

## 11. Adding a New Handle (Checklist)

1. Add to `SOCIAL_HANDLES` in `src/data/social/handles.ts` with a unique `id`
2. Optionally add to `HANDLE_POST_CAPS` in `SocialEngine.ts` if default cap (2) is wrong
3. Create a template file in `src/services/social/templates/` and import in `index.ts`
