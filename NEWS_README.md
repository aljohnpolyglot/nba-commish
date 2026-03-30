# News Feed System — NBA Commish Sim

This document covers the full news pipeline: the `NewsItem` type, `NewsGenerator`, `newsTemplates`, `lazySimNewsGenerator`, `NewsFeed.tsx`, photo enrichment, and all knowledge gaps to resolve before a makeover.

---

## 1. High-Level Flow

```
Game batch simulates
        │
        ▼
generateLazySimNews()         ← called from socialHandler.ts per batch (LLM OFF)
        │                       called from lazySimRunner.ts per lazy-sim batch
        │  Reads: teams[], players[], GameResult[], currentDate, reportedInjuries
        │  Emits: NewsItem[]
        ▼
socialHandler.ts / simulationHandler.ts
        │  merges into result.newNews
        ▼
gameLogic.ts (state reducer)
        │  appends uniqueNewNews → state.news[]
        ▼
NewsFeed.tsx
        │  reads state.news
        │  splits into: Daily News tab | Period Recaps tab (newsType filter)
        │  renders LazyNewsCard per item — lazy photo enrichment on scroll
        ▼
photoEnricher.enrichNewsWithPhoto()
        │  tries Imagn photo match by team/player name from headline+content
        │  fallback 1: playerPortraitUrl (BBGM portrait from player.imgURL)
        │  fallback 2: item.image (team logo, used immediately — no enrichment needed)
```

**LLM ON path:** `advanceDay()` returns `result.newNews` from the LLM JSON response directly — same merge pipeline, different source.

---

## 2. `NewsItem` Type (`src/types.ts:461`)

```ts
interface NewsItem {
  id: string;
  headline: string;
  content: string;
  date: string;
  image?: string;               // Team logo or static image — used immediately, no Imagn
  playerPortraitUrl?: string;   // BBGM portrait — last-resort fallback after Imagn attempt
  isNew?: boolean;
  newsType?: 'daily' | 'weekly'; // controls which tab the item appears in
}
```

**`newsType` rules:**
- `'weekly'` → Period Recaps tab: `batch_recap`, `preseason_recap`
- `'daily'` (default) → Daily News tab: everything else
- Fallback: `NewsGenerator` defaults `batch_recap` / `preseason_recap` to `'weekly'`, all other categories to `'daily'`
- `newsType` can be overridden by passing it as the 5th arg to `NewsGenerator.generate(..., newsType)`

**Photo field distinction — CRITICAL:**
- `image` = team logo or already-resolved static URL → used **immediately** by `LazyNewsCard`, no enrichment call
- `playerPortraitUrl` = BBGM player portrait → triggers `enrichNewsWithPhoto()` first, falls back to portrait if Imagn returns nothing
- Never set both `image` and `playerPortraitUrl` on the same item — the enricher uses `image && !playerPortraitUrl` as a fast-path skip

---

## 3. `NewsGenerator` (`src/services/news/NewsGenerator.ts`)

A static class. One public method:

```ts
NewsGenerator.generate(
  category: NewsCategory,
  dateString: string,
  vars: Record<string, string | number>,
  image?: string,           // goes to NewsItem.image
  newsType?: 'daily' | 'weekly'
): NewsItem | null
```

Behavior:
1. Looks up `NEWS_TEMPLATES` by `category` — returns `null` if category not found
2. Samples a random `headline` and `content` from the template's arrays
3. Interpolates `{varName}` tokens — e.g. `{playerName}`, `{teamName}`, `{pts}`
4. Assigns `newsType`: uses the override if provided, otherwise defaults based on category
5. Generates a unique `id`: `news-{category}-{Date.now()}-{random 4-digit}`

---

## 4. `NewsCategory` + Template Variables (`src/services/news/newsTemplates.ts`)

### Full category list

| Category | Typical trigger | `newsType` | Template vars |
|---|---|---|---|
| `win_streak` | Team W streak hits 5 or 7 | `daily` | `teamName`, `streakCount` |
| `long_win_streak` | Team W streak hits 10 or 14 | `daily` | `teamName`, `streakCount` |
| `streak_snapped` | Team had ≥5 W streak, now on L | `daily` | `teamName`, `streakCount` |
| `lose_streak` | Team L streak hits threshold | `daily` | `teamName`, `streakCount` |
| `monster_performance` | Player ≥40 pts (80% chance) | `daily` | `playerName`, `teamName`, `opponentName`, `statValue`, `statType` |
| `preseason_performance` | Same, during preseason | `daily` | same |
| `triple_double` | 10/10/10 (60% chance) | `daily` | `playerName`, `teamName`, `pts`, `reb`, `ast` |
| `major_injury` | 2K OVR ≥75, ≥20 games out | `daily` | `playerName`, `teamName`, `injuryType`, `duration` |
| `trade_rumor` | Bad team (W%<40%, ≥15 GP) has star (2K≥78), 40% chance | `daily` | `playerName`, `teamName` |
| `coach_hot_seat` | Same bad team, coin flip vs. trade_rumor | `daily` | `teamName`, `teamCity` |
| `milestone` | Manual / LLM only | `daily` | `playerName`, `teamName`, `milestoneValue`, `milestoneType` |
| `signing_confirmed` | Every `SIGN_FREE_AGENT` action | `daily` | `playerName`, `teamName` |
| `trade_confirmed` | Every `EXECUTIVE_TRADE` action | `daily` | `teamAName`, `teamBName`, `assetsToB`, `assetsToA` |
| `batch_recap` | Top gameScore performer each 7-day batch | **`weekly`** | `playerName`, `teamName`, `pts`, `reb`, `ast` |
| `preseason_recap` | Same, during preseason | **`weekly`** | same |
| `all_star_winner` | All-Star Game result | `daily` | `conference`, `year`, `homeScore`, `awayScore`, `losingConf`, `city` |
| `all_star_mvp` | All-Star Game MVP | `daily` | `playerName`, `year`, `pts`, `reb`, `ast`, `teamName` |
| `playoff_series_win` | Series clinched | `daily` | `teamName`, `opponentName`, `gamesCount` |
| `playoff_elimination` | Series lost | `daily` | `teamName`, `opponentName`, `gamesCount`, `teamCity` |
| `nba_champion` | Finals won | `daily` | `teamName`, `year`, `gamesCount`, `opponentName`, `teamCity` |
| `finals_mvp` | Finals MVP | `daily` | `playerName`, `year`, `pts`, `teamName`, `teamCity` |

### Template format

```ts
{
  category: 'win_streak',
  headlines: [
    'Unstoppable! {teamName} Extend Streak to {streakCount}',
    // 3-4 variants
  ],
  contents: [
    'The {teamName} continued their absolute tear... {streakCount}th consecutive victory.',
    // 3-4 variants
  ],
}
```

---

## 5. `lazySimNewsGenerator` — The 5 Passes

`generateLazySimNews(teams, players, allSimResults, currentDate, reportedInjuries, skipInjuries?, prevTeams?)` runs 5 sequential passes:

### Pass 1 — Batch Recap (always fires)
- Collects all stat lines from all games in the batch
- Sorts by `gameScore` desc, picks the single top performer
- Generates `batch_recap` (or `preseason_recap` if before Oct 24, 2025)
- Stores player portrait via `withPortrait()` → `item.playerPortraitUrl`
- Always produces at least 1 item even in off-days

### Pass 2 — Win/Lose Streaks
- Checks `team.streak` for every team
- Only fires at exactly `[5, 7, 10, 14]` game thresholds (not every game)
- Win streak 5 or 7 → `win_streak`; win streak 10 or 14 → `long_win_streak`
- Lose streak at thresholds → `lose_streak`
- Team logo stored as `item.image` (no Imagn needed, used immediately)

### Pass 2b — Streak Snapped (requires `prevTeams`)
- Compares `prevTeams[x].streak` vs `teams[x].streak`
- If a team had W streak ≥5 and is now on an L → fires `streak_snapped`
- `prevTeams` is passed from `lazySimRunner.ts` and `socialHandler.ts`
- **Knowledge gap:** if `prevTeams` is not passed (it's optional), this pass silently does nothing

### Pass 3 — Monster Performances & Triple Doubles
- Iterates every game, every stat line on both sides
- ≥40 pts → `monster_performance` or `preseason_performance` (80% probability)
- 10/10/10 → `triple_double` (60% probability, only if 40pt check didn't fire)
- Player portrait via `withPortrait()`
- Team/opponent guaranteed correct (no guessing — explicit home/away split)

### Pass 4 — Major Injuries
- **Only runs when `skipInjuries = false`** — in regular gameplay `socialHandler` passes `skipInjuries=true` to avoid duplicating Shams injury posts
- Fires for `player.injury.gamesRemaining >= 20` AND 2K OVR ≥75
- Deduped by `reportedInjuries` Set (`playerId-injuryType` key)
- Generates `major_injury` with human-readable duration from `gamesToTime()`
- After Pass 4, function **returns early** regardless of Pass 5

### Pass 5 — Drama (Bad Teams)
- Only runs if NOT skipped by Pass 4 early return
- 40% chance per batch, only if a bad team exists (W% < 40%, ≥15 games played)
- 50/50 split: `coach_hot_seat` (team logo) vs `trade_rumor` (star portrait)
- **Knowledge gap:** Pass 5 is unreachable when `skipInjuries=true` (Pass 4 always returns early)

### Fallback — Standings Note
- Fires only if passes 1–5 produced zero items (extremely rare)
- Hardcoded standings snapshot: East leader vs West leader with W-L records
- Uses `newsType: 'weekly' as any` — the type cast suggests this was added quickly

---

## 6. `NewsFeed.tsx` — Component Anatomy

### Tabs

```tsx
const dailyNews = state.news.filter(n => !n.newsType || n.newsType === 'daily');
const weeklyNews = state.news.filter(n => n.newsType === 'weekly');
```

- **Daily News** tab: signings, trades, monster games, injuries, streaks, drama
- **Period Recaps** tab: batch recaps (7-day summaries, weekly summaries)

### `LazyNewsCard`

Each card:
1. Mounts with a `useInView(0.05)` observer — enrichment fires only on scroll
2. On first visible frame: calls `enrichNewsWithPhoto(item, gameLookup)`
3. While waiting: shows a shimmer placeholder (`animate-pulse` div)
4. On resolution: sets `resolvedImage` state → renders `<img>`
5. On image error: falls back to `playerPortraitUrl`, then hides the image slot entirely

Photo slot: `lg:w-80 h-64 lg:h-auto` — left panel on desktop, top panel on mobile.

### `useGameLookup()`

Builds a `Map<gameId, GamePhotoInfo>` from `state.boxScores`. Contains:
```ts
{
  homeTeam: NBATeam,
  awayTeam: NBATeam,
  topPlayers: { name: string; gameScore: number }[],  // top 10 by gameScore
  date: string,
}
```
Used by `enrichNewsWithPhoto` to match player names in the headline/content against players who actually played.

### Current card design

```
┌─────────────────────────────────────────────────────┐
│ [IMAGE 320px wide]  │  Breaking News  •  {date}     │
│ [lazy Imagn photo]  │                               │
│ [shimmer on load]   │  {headline h3, 3xl font}      │
│                     │  "{content, italic}"          │
│                     │  ─────────────────────────── │
│                     │  ↗ High Impact  Read Full →  │
└─────────────────────────────────────────────────────┘
```

**Design notes / makeover targets:**
- All cards say "Breaking News" — no category badge differentiation
- All cards say "High Impact Event" regardless of content importance
- "Read Full Report →" button does nothing (no modal behind it)
- Bookmark and Share buttons are visible on hover but non-functional
- `content` is always wrapped in `"..."` (italic) — looks like a quote even for factual recaps
- `rounded-[3rem]` = very aggressive rounding, consistent with the app's design language

---

## 7. Photo Enrichment for News (`photoEnricher.enrichNewsWithPhoto`)

News enrichment is separate from social post enrichment. Key differences:

| | Social posts | News items |
|---|---|---|
| Player match | `post.data.playerName` (explicit) | Parse headline + content text |
| Game match | `post.data.gameId` (explicit) | Fuzzy match by team name in text |
| Timeout | None (no hard timeout) | 4 second timeout to avoid blocking scroll |
| Fallback | Portrait then AI gen | Portrait then first game photo |
| Allow list | `hc_` and `nba_` templates only | All news items (no allow-list filter) |

**Enrichment pipeline for a news item:**
1. Check `resolvedPosts` cache — if already resolved, return cached value
2. If `image` exists and no `playerPortraitUrl` → static asset, return `image` immediately
3. Scan all `gameLookup` entries, score each game by team name and player name mentions
4. If best score = 0 → return `playerPortraitUrl` or null
5. `fetchForGame(bestGameInfo)` with 4-second race timeout
6. Cross-reference topPlayers vs text — find matching player, pick best action photo
7. Fallback: first photo from the best matched game
8. Final fallback: `playerPortraitUrl`

---

## 8. `gamesToTime()` — Duplicate Implementation

Both `lazySimNewsGenerator.ts` and `charania.ts` define their own `gamesToTime()` with **identical logic**. This is a known duplication:

```
lazySimNewsGenerator.ts:gamesToTime()  ←── identical ──→  charania.ts:gamesToTime()
```

**Knowledge gap:** Should be extracted to a shared utility (`src/utils/injuryUtils.ts` or `src/services/news/injuryUtils.ts`) and imported by both. Currently any fix to one doesn't update the other.

---

## 9. Knowledge Gaps & Open Questions

These are things that are **not currently documented or implemented** — important to know before the makeover:

### 9.1 — News category badge
**Gap:** Every card renders `"Breaking News"` hardcoded. There is no mapping from `NewsCategory` → display label/color. A makeover should add a category → badge color map.

Suggested mapping:
```ts
const CATEGORY_META: Record<NewsCategory, { label: string; color: string }> = {
  win_streak: { label: 'Win Streak', color: 'emerald' },
  long_win_streak: { label: 'Historic Run', color: 'emerald' },
  lose_streak: { label: 'Losing Streak', color: 'red' },
  streak_snapped: { label: 'Streak Snapped', color: 'amber' },
  monster_performance: { label: 'Monster Game', color: 'indigo' },
  triple_double: { label: 'Triple Double', color: 'indigo' },
  major_injury: { label: 'Injury Report', color: 'red' },
  signing_confirmed: { label: 'Signing', color: 'sky' },
  trade_confirmed: { label: 'Trade', color: 'violet' },
  trade_rumor: { label: 'Rumor', color: 'amber' },
  coach_hot_seat: { label: 'Hot Seat', color: 'orange' },
  batch_recap: { label: 'Period Recap', color: 'slate' },
  playoff_series_win: { label: 'Playoffs', color: 'yellow' },
  nba_champion: { label: 'CHAMPION', color: 'yellow' },
  // ...
}
```

### 9.2 — Category not stored on `NewsItem`
**Gap:** `NewsItem` has no `category` field. The category is baked into the `id` string (`news-{category}-{ts}`) but not surfaced as a first-class field. Parsing it back from the ID is brittle.

**Before makeover:** Add `category?: NewsCategory` to `NewsItem` in `types.ts` and set it in `NewsGenerator.generate()`.

### 9.3 — "Read Full Report" is a dead button
**Gap:** The "Read Full Report →" CTA in every card has no click handler and no modal behind it. Either remove it or wire a `NewsDetailModal`.

### 9.4 — Bookmark and Share are visual-only
**Gap:** The Bookmark and Share buttons in `LazyNewsCard` have no state, no handler, no persistence. Either wire them or remove before the makeover so they don't confuse users.

### 9.5 — Drama pass unreachable during regular gameplay
**Gap:** In `generateLazySimNews`, Pass 5 (Drama) runs after an early `return` at the end of Pass 4:
```ts
if (skipInjuries) return news;
// ...injuries...
// ── 5. DRAMA — runs here
```
In regular gameplay, `socialHandler.ts` passes `skipInjuries=true`. This means **drama news (trade rumors + coaching hot seat) never fires in regular gameplay.** Only fires in lazy sim (multi-day advance) where `skipInjuries=false`.

**Fix candidate:** Move the early return AFTER Pass 5, or pass `skipInjuries` only to the injury loop itself.

### 9.6 — No dedup on news items (unlike social posts)
**Gap:** Social posts dedup by `id` before merge. News items in `socialHandler.ts` / `simulationHandler.ts` are also deduped by `id` — but `NewsGenerator` generates `id: news-{category}-{Date.now()}-{random}`. Two news items for the same event (same category, same day) would get different IDs and both appear in the feed.

For transaction news specifically (`signing_confirmed`, `trade_confirmed`), each action only fires the generator once, so no dup in practice. But for batch runs, `batch_recap` fires once per batch call — still safe.

### 9.7 — `'weekly' as any` type cast in fallback standings
In the fallback standings snippet (Pass 5 fallback):
```ts
newsType: 'weekly' as any,
```
The `as any` indicates the `NewsItem` type didn't have `newsType` when this fallback was added. It should be cleaned up to `newsType: 'weekly' as 'weekly'` or just `newsType: 'weekly'`.

### 9.8 — `playoff_series_win`, `playoff_elimination`, `nba_champion`, `finals_mvp` templates exist but no generator calls them
**Gap:** These 4 templates exist in `newsTemplates.ts` but there is no code in `lazySimNewsGenerator.ts` or any action handler that calls `NewsGenerator.generate('playoff_series_win', ...)`. They exist purely as future scaffolding.

**Before wiring:** these need callers in `PlayoffGenerator.ts` or `gameLogic.ts` when series results are finalized.

### 9.9 — `all_star_winner` and `all_star_mvp` caller location
These ARE wired — called from `AllStarWeekendOrchestrator.ts`. But they're not documented in the generator's source file. Confirm they pass the right `vars` before the makeover.

### 9.10 — `photoEnricher` cache never cleared between news sessions
`resolvedPosts` map in `photoEnricher.ts` persists for the entire page session. `clearPhotoEnricherCache()` is exported but only called explicitly (e.g. when starting a new simulation). If a news item's ID stays the same between two different game states, the cached photo (or null) from the first session will be returned for the new state.

---

## 10. Key Files Quick Reference

| File | Role |
|---|---|
| `src/components/NewsFeed.tsx` | Main news UI — two tabs, `LazyNewsCard`, `useGameLookup` |
| `src/services/news/NewsGenerator.ts` | Static generator — category → random template → interpolated `NewsItem` |
| `src/services/news/newsTemplates.ts` | `NewsCategory` union + `NEWS_TEMPLATES[]` (21 categories, 4 templates each) |
| `src/services/news/lazySimNewsGenerator.ts` | Deterministic news from game batch (5 passes) |
| `src/services/social/photoEnricher.ts` | `enrichNewsWithPhoto()` — lazy Imagn enrichment per news item |
| `src/types.ts:461` | `NewsItem` interface definition |
| `src/store/logic/turn/socialHandler.ts` | Calls `generateLazySimNews(skipInjuries=true)` per real-day batch |
| `src/store/logic/turn/simulationHandler.ts` | Calls `generateLazySimNews(skipInjuries=false)` per lazy-sim batch |
| `src/services/allStar/AllStarWeekendOrchestrator.ts` | Calls `NewsGenerator.generate('all_star_winner')` + `('all_star_mvp')` |

---

## 11. Adding a New News Category (Checklist)

1. Add the category string to the `NewsCategory` union in `newsTemplates.ts`
2. Add a `NewsTemplate` entry to `NEWS_TEMPLATES[]` with 3–5 `headlines[]` and `contents[]` variants
3. Add `{varName}` tokens in templates — match exactly what you'll pass as `vars`
4. Call `NewsGenerator.generate('your_category', state.date, { ...vars }, image?, newsType?)` from the appropriate place
5. Attach photo:
   - Team-level news → pass `team.logoUrl` as `image` arg (shown immediately)
   - Player-level news → do NOT pass `image`; instead call `withPortrait(item, player.imgURL)` after generation to set `playerPortraitUrl`
6. Inject onto `result.newNews` (not `result.newSocialPosts`)
7. **Optional (recommended):** Add `category` field to `NewsItem` in `types.ts` and set it in `NewsGenerator` so the UI can badge it correctly

---

## 12. Adding a New `lazySimNewsGenerator` Pass (Checklist)

1. Add pass inside `generateLazySimNews` body
2. Follow `withPortrait(item, player.imgURL)` pattern for player-linked news
3. Use team logo as `image` arg directly for team-linked news
4. If your pass should not fire during regular gameplay, add it BEFORE the `if (skipInjuries) return news;` guard
5. If your pass needs historical comparison (like streak_snapped), add a new optional arg to the function signature and update callers in `socialHandler.ts` and `simulationHandler.ts`
