# Events Pipeline — NBA Commish Sim

This document maps the full lifecycle of every event that generates social posts and/or news items, from commissioner action to displayed feed. Use it whenever you add a new action, a new social template, or a new news category.

---

## 1. High-Level Flow

```
Commissioner Action (user click)
        │
        ▼
  action handler (playerActions.ts / tradeActions.ts / etc.)
        │  builds outcomeText, calls generateFreeAgentSigningReactions (LLM optional)
        │  injects Shams post + news item BEFORE returning
        ▼
  advanceDay() → simulation.ts  (llm.ts entrypoint)
        │  LLM ON  → generates narrative, newSocialPosts, newEmails, newNews
        │  LLM OFF → returns outcomeText passthrough immediately
        ▼
  result object  { players, newSocialPosts, newNews, newEmails, … }
        │
        ▼
  simulationHandler.ts  (multi-day sim loop)
        │  calls handleSocialAndNews() per batch
        ▼
  socialHandler.ts
        │  ① recalculates engagement on LLM social posts
        │  ② SocialEngine.generateDailyPosts() — template-driven game posts
        │  ③ Shams injury posts (from allSimResults.injuries)
        │  ④ generateLazySimNews() — deterministic news from game stats
        │  merges + deduplicates against existing state
        ▼
  gameLogic.ts  (state reducer)
        │  appends uniqueNewPosts → state.socialFeed
        │  appends uniqueNewNews  → state.news
        │  appends newEmails      → state.emails
        ▼
  UI Components
        NewsFeed.tsx  ←  state.news
        ChatList.tsx  ←  state.socialFeed
        TransactionsView.tsx  ←  state.transactions / state.leagueHistory
```

---

## 2. Firing Rules

| Source | When it fires | LLM required? |
|---|---|---|
| Action handler Shams post (signing/trade) | Every signing / trade, always | No |
| Action handler news item (signing/trade) | Every signing / trade, always | No |
| `generateFreeAgentSigningReactions` | On `SIGN_FREE_AGENT` | Yes (graceful no-op if off) |
| `advanceDay` LLM narrative | Every action | Yes |
| `SocialEngine.generateDailyPosts` | Every sim batch with games | No |
| Shams injury posts in `socialHandler.ts` | Per injury in allSimResults, OVR ≥ 70 | No |
| `generateLazySimNews` | Every sim batch | No |

---

## 3. Adding a New Commissioner Action

Follow these steps every time you add a new action type (e.g., `EXTEND_CONTRACT`, `FINE_PLAYER`):

### Step 1 — Create the action handler

Add `handleXxx` to `src/store/logic/actions/yourActions.ts`:

```ts
export const handleXxx = async (state, action, simResults, recentDMs) => {
    const outcomeText = `...describe what happened in plain English...`;

    const result = await advanceDay(state, {
        type: 'YOUR_ACTION_TYPE',
        payload: { outcomeText, ...action.payload }
    } as any, [], simResults, state.pendingHypnosis || [], recentDMs);

    // ← your state mutations go here (patch result.players, result.staff, etc.)

    return result;
};
```

### Step 2 — Wire it in `gameLogic.ts`

In the main `switch (action.type)` block, call your handler and spread the result.

### Step 3 — Update `simulation.ts` "standard league activities" fallback

`src/services/llm/generators/simulation.ts` reads `action.payload.outcomeText` in the LLM-off path. Always set `outcomeText` in your payload so the fallback message is meaningful instead of "The day has passed with standard league activities."

### Step 4 — Add social posts (optional but recommended for significant actions)

```ts
// After advanceDay() returns — always inject onto result directly
const shamsContent = buildShamsXxxPost(...);
if (shamsContent) {
    const engagement = calculateSocialEngagement('@ShamsCharania', shamsContent, relevantOvr);
    result.newSocialPosts = [{
        id: `shams-xxx-${Date.now()}`,
        author: 'Shams Charania',
        handle: '@ShamsCharania',
        content: shamsContent,
        date: state.date,
        likes: engagement.likes,
        retweets: engagement.retweets,
        source: 'TwitterX',
        isNew: true,
    }, ...(result.newSocialPosts || [])];
}
```

**Critical:** Inject onto `result.newSocialPosts` AFTER `advanceDay()` returns. Do NOT rely on `payload.announcements` for LLM-off reliability — the early-return path in `simulation.ts` ignores `payload.announcements`.

### Step 5 — Add a news item (optional but recommended)

```ts
// After advanceDay() returns
const newsItem = NewsGenerator.generate('your_category', state.date, {
    playerName: '...', teamName: '...',  // match the template's {vars}
}, teamLogoUrl);
if (newsItem) result.newNews = [newsItem, ...(result.newNews || [])];
```

### Step 6 — Add the news category + templates

In `src/services/news/newsTemplates.ts`:

1. Add `'your_category'` to the `NewsCategory` union type.
2. Add a `NewsTemplate` object to `NEWS_TEMPLATES`:

```ts
{
  category: 'your_category',
  headlines: [
    'Template with {playerName} and {teamName}',
    '...',
  ],
  contents: [
    'Longer body text with {playerName} signed by the {teamName}...',
    '...',
  ],
}
```

`NewsGenerator.generate(category, date, vars, image?)` picks a random headline + content and interpolates `{varName}` tokens.

### Step 7 — Wire transaction history

Set `outcomeText` in your payload using one of these formats so `TransactionsView` can parse the team/player and show the ribbon + portrait:

- Signing: `"The {teamName} have signed free agent {playerName}."`
- Trade: `"A trade has been finalized between the {teamAName} and {teamBName}. {assets} have been moved to {teamBAbbrev}, while {assets} have been sent to {teamAAbbrev}."`
- Waive: `"The NBA has officially waived {playerName} from {teamName}."`
- Suspend: `"The NBA has suspended {playerName} for N games."`

Transactions are stored in `state.leagueHistory` / `state.transactions`. `TransactionsView` reads them and strips names from `entry.text` to look up team/player portraits.

### Step 8 — Wire Charania template (if applicable)

In `src/services/social/templates/charania.ts`:

- Add a standalone builder: `buildShamsXxxPost(...)` that returns `string | null`.
- For recurring game-driven posts (injuries, performances), add a `SocialTemplate` to the condition-based array evaluated by `buildShamsPost(ctx)`.

---

## 4. Adding a New Social Template (game-driven)

Game-driven posts fire via `SocialEngine.generateDailyPosts()` which evaluates `SOCIAL_TEMPLATES` from `src/services/social/SocialRegistry.ts`.

Each template has:
```ts
{
  id: 'unique-template-id',
  handles: ['statmuse', 'bleacher_report'],  // from SOCIAL_HANDLES
  condition: (ctx: SocialContext) => boolean,
  generate: (ctx: SocialContext) => string | null,
  minOvr?: number,   // skip low-rated players
  weight?: number,   // higher = more likely (default 1)
}
```

`SocialContext` contains:
- `game: GameResult` — score, OT, homeTeamId, awayTeamId
- `stats: PlayerGameStats | null` — per-player stats (pts, reb, ast, stl, blk, min, fgm, fga, tpm, tpa, etc.)
- `player: NBAPlayer | null`
- `team: NBATeam`
- `opponent: NBATeam`
- `date: string`
- `players: NBAPlayer[]` — full roster
- `teams: NBATeam[]` — all teams

**Handle caps** are enforced per game in `SocialEngine` via `HANDLE_POST_CAPS`. Default cap is 2 posts per handle per game.

---

## 5. News Feed vs. Social Feed

| Field | Goes to | Displayed in |
|---|---|---|
| `result.newNews` | `state.news` | `NewsFeed.tsx` (headline cards) |
| `result.newSocialPosts` | `state.socialFeed` | `ChatList.tsx` / social tab |
| `result.newEmails` | `state.emails` | Inbox |

Both feeds dedup against existing IDs before merging — no duplicates across sim batches.

---

## 6. Deterministic News Categories (no LLM needed)

| Category | Trigger | Template vars |
|---|---|---|
| `batch_recap` | Top gameScore performer each batch | `playerName, teamName, pts, reb, ast` |
| `preseason_recap` | Same, during preseason | same |
| `win_streak` | Team streak hits 5, 8, or 12 | `teamName, streakCount` |
| `lose_streak` | Team streak hits 5, 8, or 12 | `teamName, streakCount` |
| `monster_performance` | 40+ pts (80% chance) | `playerName, teamName, opponentName, statValue, statType` |
| `preseason_performance` | Same, during preseason | same |
| `triple_double` | 10/10/10 (60% chance) | `playerName, teamName, pts, reb, ast` |
| `major_injury` | OVR 75+, 20+ games out | `playerName, teamName, injuryType, duration` |
| `coach_hot_seat` | Team W% < 40%, 15+ games played (40% chance per batch) | `teamName, teamCity` |
| `trade_rumor` | Bad team has OVR 78+ star (40% chance per batch) | `playerName, teamName` |
| `milestone` | (manual / LLM only for now) | `playerName, teamName, milestoneValue, milestoneType` |
| `signing_confirmed` | Every `SIGN_FREE_AGENT` action | `playerName, teamName` |
| `trade_confirmed` | Every `EXECUTIVE_TRADE` action | `teamAName, teamBName, assetsToB, assetsToA` |

---

## 7. Charania Templates

`src/services/social/templates/charania.ts` has two layers:

### Layer 1 — Condition-based (game events, injury)
`buildShamsPost(ctx: SocialContext): string | null`

Evaluated by `socialHandler.ts` for each injury in `allSimResults`. Picks the first matching template condition (e.g., injury type, OVR threshold).

### Layer 2 — Standalone builders (transactions)
Called directly from action handlers, fire regardless of LLM state:

| Function | Called from | Purpose |
|---|---|---|
| `buildShamsSigningPost(playerName, teamName, teamAbbrev, ovr, prevTeam?, prevLeague?)` | `playerActions.ts → handleSignFreeAgent` | FA signing announcement |
| `buildShamsTradePost(teamAName, teamAAbbrev, teamBName, teamBAbbrev, assetsToB[], assetsToA[])` | `tradeActions.ts → handleExecutiveTrade` | Trade announcement |

Both return `string | null`. Null means "not newsworthy enough" (e.g., very low OVR signing). The caller checks for null before building the post.

---

## 8. Key Files Quick Reference

| File | Role |
|---|---|
| `src/store/logic/actions/playerActions.ts` | Signing, waive, suspend, drug test, sabotage handlers |
| `src/store/logic/actions/tradeActions.ts` | Executive trade, force trade handlers |
| `src/store/logic/turn/simulationHandler.ts` | Multi-day sim loop; calls `handleSocialAndNews` |
| `src/store/logic/turn/socialHandler.ts` | Merges LLM posts + SocialEngine + Shams injuries + lazy news |
| `src/services/social/SocialEngine.ts` | Template-driven game posts per game result |
| `src/services/social/SocialRegistry.ts` | Exports `SOCIAL_TEMPLATES[]` |
| `src/services/social/templates/charania.ts` | Shams post builders (injury + transaction) |
| `src/services/news/NewsGenerator.ts` | `NewsGenerator.generate(category, date, vars, image?)` |
| `src/services/news/newsTemplates.ts` | `NewsCategory` union + `NEWS_TEMPLATES[]` |
| `src/services/news/lazySimNewsGenerator.ts` | Deterministic news from game batch (streaks, stars, drama) |
| `src/services/llm/generators/simulation.ts` | LLM-off fallback; reads `payload.outcomeText` |
| `src/components/central/view/TransactionsView.tsx` | Reads `state.leagueHistory`; parses text for team/player |
| `src/components/messages/ChatList.tsx` | Social feed display |
