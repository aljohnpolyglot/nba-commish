# GM Mode — Implementation Guide

GM Mode turns the NBA Commissioner Simulator into a single-team General Manager experience. The user manages ONE team (roster, trades, free agency, draft) while the commissioner AI runs the league.

---

## Architecture: Mode Toggle

```
state.gameMode: 'commissioner' | 'gm'
state.userTeamId: number  // only set in GM mode — the team the user manages
```

Add `gameMode` and `userTeamId` to `GameState` in `src/types.ts`. Default: `'commissioner'`. Selected at game start (`CommissionerSetup.tsx` or a new `GMSetup.tsx`).

**Also in Game Settings modal** (`src/components/modals/SettingsModal.tsx`) — add a Gameplay tab toggle so users can switch modes anytime. When switching to GM mode, prompt for team selection. When switching back to commissioner, clear `userTeamId`.

All mode-gating uses a single check:
```typescript
const isGM = state.gameMode === 'gm';
```

---

## What Changes in GM Mode

### Sidebar (`src/components/sidebar/NavigationMenu.tsx`)

| Commissioner Mode | GM Mode | Action |
|---|---|---|
| Command Center (Schedule + Actions) | Schedule only | Hide "Actions" tab |
| Seasonal Actions | Hidden | Entire group hidden |
| Events (Commissioner Diary) | Hidden | Commissioner-only |
| Commish Store | Hidden | Commissioner-only |
| Legacy (Approvals/Viewership/Finances) | Hidden | Commissioner-only |
| Analytics (League History, Team History) | Keep | GM needs analytics |
| League (Standings, Leaders, Awards, Stats) | Keep | GM needs league data |
| Team Office | Keep + **default home** | GM's primary workspace |
| Trade Finder / Trade Machine | Keep | Core GM tool |
| Free Agents | Keep + **enhanced** | New FA signing modal |
| Draft | Keep | Core GM tool |
| Sportsbook | Keep (optional) | Fun feature |
| Social / Inbox / Chat | Hidden (for now) | Future: GM gets trade proposals via inbox |

**Implementation:** Wrap hidden sidebar groups in `{!isGM && (...)}`. Keep it simple.

### Main Content (`src/components/layout/MainContent.tsx`)

Default tab in GM mode: `'team-office'` instead of `'schedule'`.

### Player Actions Modal (`src/components/modals/PlayerActionsModal.tsx`)

| Commissioner Action | GM Mode | Why |
|---|---|---|
| Fine | Hidden | Commissioner power |
| Suspend | Hidden | Commissioner power |
| Drug Test | Hidden | Commissioner power |
| Sabotage | Hidden | Commissioner power |
| Hypnosis | Hidden | Commissioner power |
| Endorse HOF | Hidden | Commissioner power |
| Leak Scandal | Hidden | Commissioner power |
| Waive | **Keep** | GM can waive players |
| Give Money/Gifts | Hidden | Commissioner personal wealth |
| Dinner/Movie/Club | Hidden | Commissioner social |
| Trade | **Keep** | Core GM action |
| Sign (FA) | **Keep + enhanced** | New FA modal |

**Implementation:** Filter `actionConfig` items by a `gmVisible: boolean` flag, or wrap in `isGM` checks.

### Trade System

**Current behavior (Commissioner):** User proposes any trade, it executes immediately (commissioner power).

**GM Mode changes:**
1. **Lock team dropdown** to `state.userTeamId` — user can only trade FROM their own team
2. **AI response** — after proposing a trade, show accept/reject message from the other team's GM
3. Use existing `getTradeOutlook` + `valueChange` logic to determine if the AI accepts
4. Trade proposals go through `state.tradeProposals[]` pipeline instead of instant execution

**Key files:**
- `src/components/modals/TradeMachineModal.tsx` — lock Team A to `userTeamId`
- `src/components/central/view/TradeFinderView.tsx` — lock `selectedTid` to `userTeamId`
- `src/services/AITradeHandler.ts` — `evaluateTradeProposal(proposal)` returns accept/reject + reason

### Free Agency — New Signing Modal

**Current:** `SignFreeAgentModal.tsx` is a simple commissioner tool (instant sign, minimum contract).

**GM Mode needs a full FA signing modal:**
- Player card with OVR, age, stats
- **Contract offer builder:**
  - Years slider (1-5)
  - Annual salary input (with cap space shown)
  - Player option toggle (final year)
  - Team option toggle (final year)
- **Value meter** — shows likelihood player accepts based on:
  - Market value from `computeContractOffer()` in `salaryUtils.ts`
  - Team desirability (wins, market size, role)
  - Competing offers (other teams' interest)
- **Cap space display** — remaining cap, MLE availability, min contract available
- Accept/reject response from the player (probability-based)

**Key files to create/modify:**
- `src/components/modals/GMSignFreeAgentModal.tsx` — new modal
- `src/services/salaryUtils.ts` — `computeContractOffer()` already exists
- `src/services/AIFreeAgentHandler.ts` — `getMLEAvailability()`, `getTeamCapProfile()`

### Inbox / Chat / Messaging

**For now:** Hidden in GM mode. Messaging is commissioner-flavored (DMs from players, owner emails).

**Future integration:**
- GM receives trade proposals from AI teams via inbox
- Agent offers and contract negotiations via chat
- Scout reports and draft intel via email
- Coach rotation suggestions

---

## Implementation Order (Recommended)

### Phase 1: Mode Toggle + Sidebar Gating
1. Add `gameMode` + `userTeamId` to `GameState` (`types.ts`)
2. Add mode selection to game setup flow
3. Gate sidebar items in `NavigationMenu.tsx`
4. Gate player actions in `PlayerActionsModal.tsx`
5. Set default tab to `'team-office'` in GM mode

### Phase 2: Trade System
1. Lock TradeMachine Team A to `userTeamId`
2. Lock TradeFinder `selectedTid` to `userTeamId`
3. Add trade evaluation logic (`evaluateTradeProposal`)
4. Show accept/reject UI with GM name + reason

### Phase 3: Free Agency Modal
1. Create `GMSignFreeAgentModal.tsx`
2. Wire contract offer builder (years, salary, options)
3. Add acceptance probability display
4. Wire cap space / MLE checks
5. Connect to `AIFreeAgentHandler` evaluation logic

### Phase 3.5: Draft Enhancements
1. **"Sim One Pick" button** — when auto-draft is paused, simulates just the current pick (AI selects)
2. **"Sim to My Pick" button** — auto-drafts all picks until the user's team is on the clock
3. Both require `DraftSimulatorView.tsx` changes — add buttons to the draft control bar
4. Logic: iterate `autoRunDraft` one pick at a time, stopping at `userTeamId`

### Phase 4: Messaging (Future)
1. Re-enable inbox in GM mode with GM-flavored messages
2. Trade proposal notifications
3. Agent negotiation threads

---

## Common Pitfalls

- **`state.teams[0]` is NOT always the user's team** — in commissioner mode the user has no team. In GM mode, always use `state.userTeamId` to find the user's team.
- **`playerActions.ts` assumes commissioner context** — many actions reference `state.stats.personalWealth`, `state.stats.leagueFunds`. GM mode actions should not touch these.
- **Trade execution path differs** — commissioner executes instantly via `handleExecutiveTrade`. GM mode should route through `tradeProposals[]` and require AI approval.
- **Don't create a separate state tree** — GM mode shares the same `GameState`. Just gate UI visibility and action routing based on `gameMode`.
- **AI teams include the user's team in commissioner mode** — `sortedAITeams` in `AIFreeAgentHandler` filters `t.id !== userTeamId`. In commissioner mode, `userTeamId` is undefined, so all teams are AI. In GM mode, the user's team is excluded from AI actions.

---

## File Reference

| Area | File | What to Change |
|---|---|---|
| State | `src/types.ts` | Add `gameMode`, `userTeamId` to `GameState` |
| Setup | `src/components/commissioner/CommissionerSetup.tsx` | Mode selection UI |
| Sidebar | `src/components/sidebar/NavigationMenu.tsx` | `isGM` gating |
| Main | `src/components/layout/MainContent.tsx` | Default tab routing |
| Actions | `src/components/modals/PlayerActionsModal.tsx` | Filter commissioner actions |
| Trade | `src/components/modals/TradeMachineModal.tsx` | Lock Team A |
| Trade | `src/components/central/view/TradeFinderView.tsx` | Lock selectedTid |
| FA | `src/components/modals/GMSignFreeAgentModal.tsx` | New modal (create) |
| Salary | `src/services/salaryUtils.ts` | Reuse `computeContractOffer` |
| Cap | `src/services/AIFreeAgentHandler.ts` | Reuse cap/MLE checks |
| AI Trade | `src/services/AITradeHandler.ts` | Add `evaluateTradeProposal` |
