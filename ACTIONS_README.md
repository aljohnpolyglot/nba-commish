# Actions System — Commissioner's Playbook

This document covers every action available to the Commissioner, how they work in-game, how to add new ones, and the full technical pipeline.

---

## Quick Reference: All Actions

### Executive Actions
| ID | Title | Cost | Benefit |
|---|---|---|---|
| `PUBLIC_ANNOUNCEMENT` | Public Announcement | None | +Authority / +Clarity |
| `FINE_PERSON` | Levy Fine | None | +League Funds / +Discipline |
| `SUSPEND_PERSON` | Suspend Personnel | -Approval (Target Group) | +Authority / +League Integrity |
| `DRUG_TEST` | Mandatory Drug Test | -Player Approval / -Union Trust | +Legacy (Tough on Crime) |
| `EXPANSION_DRAFT` | League Expansion | -$500M League Funds | +++Revenue / ++Legacy |
| `ENDORSE_HOF` | Endorse for Hall of Fame | None | +Legacy / +Relationship |
| `EXECUTIVE_TRADE` | Executive Trade | -Legacy / -Owner Approval | Total Roster Control |
| `SIGN_FREE_AGENT` | Force Sign Free Agent | None (Covert) | Roster Control |
| `WAIVE_PLAYER` | Waive Player | -Player Approval | Roster Control |
| `FIRE_PERSONNEL` | Fire Personnel | -Approval (Target's Peer Group) | +Authority |

### Season Actions
| ID | Title | Cost | Benefit |
|---|---|---|---|
| `CELEBRITY_ROSTER` | Celebrity Game Roster | None | ++Viewership / ++Social Buzz |
| `GLOBAL_GAMES` | Global Games Cities | -$100k League Funds per City | +++Global Revenue |
| `INVITE_PERFORMANCE` | Invite Performance | -League Funds (varies) | ++Viewership / +Media Coverage |
| `SET_CHRISTMAS_GAMES` | Set Christmas Day Games | None | +++Viewership / ++Revenue |
| `ADD_PRESEASON_INTERNATIONAL` | International Preseason | -$10k Personal Wealth | ++Diplomacy / ++Scouting |

### Personal Actions
| ID | Title | Cost | Benefit |
|---|---|---|---|
| `TRANSFER_FUNDS` | Transfer Funds | None | Financial Flexibility |
| `INVITE_DINNER` | Host Private Dinner | -$50k Personal Wealth | +Approval (All Guests) |
| `INVITE_MOVIE` | Invite to Movie | -$10k Personal Wealth | +Player / Staff Approval |
| `GIVE_MONEY` | Disburse Funds | -Personal Wealth | +++Approval (Target) |
| `TRAVEL` | Travel | -$20k Personal Wealth | +Legacy / +Approval |
| `VISIT_NON_NBA` | Visit Non-NBA Team | -$10k Personal Wealth | ++Diplomacy / +Scouting |
| `CONTACT_PERSON` | Direct Message | None | +Influence / +Relationship |
| `GO_TO_CLUB` | Go to Club | -$20k Personal Wealth | +Social Presence |

### Covert Actions
| ID | Title | Cost | Benefit |
|---|---|---|---|
| `HYPNOTIZE` | Hypnotize | None (Covert) / +Suspicion Risk | Total Behavioral Control |
| `SABOTAGE_PLAYER` | Sabotage Player | None (Covert) / High Detection Risk | Targeted Roster Disruption |
| `BRIBE_PERSON` | Offer Bribe | -Personal Wealth / Criminal Risk | ++Influence / +Outcome |
| `LEAK_SCANDAL` | Leak Scandal | -Legacy (if attributed) | +Viewership / -Target Reputation |
| `RIG_LOTTERY` | Fix the Lottery | -Legacy (Catastrophic if exposed) | Total Draft Control |

---

## Detailed Action Descriptions

### Executive

**PUBLIC_ANNOUNCEMENT**
Bypass team PR filters and speak directly to the world. Issue official league communications about trades, policy changes, fines, or landmark moments. Your words carry the full weight of the commissioner's office.

**FINE_PERSON**
Issue a formal monetary fine to any player, coach, or team for conduct detrimental to the league. Fine amounts can range from minor disciplinary actions to franchise-shaking penalties. All fines flow directly to league operational funds.

**SUSPEND_PERSON**
Issue an immediate suspension without pay to any player, coach, or GM. Suspended personnel miss games and face heavy media scrutiny. Extended suspensions damage trust with player associations — use with documented justification.

**DRUG_TEST**
Order a "randomly selected" drug test for any individual in the league. A positive result triggers an automatic suspension and potential career-altering scandal. A clean test still draws suspicion from the union. Use sparingly — this is a loaded weapon.

**EXPANSION_DRAFT**
Authorize new NBA franchises in selected cities. Each new team participates in a dedicated expansion draft, pulling talent from existing rosters. A historic decision that permanently reshapes the competitive landscape and grows league-wide revenue — but dilutes star power across the board. One-time action.

**ENDORSE_HOF**
Formally endorse a retired player for induction into the Basketball Hall of Fame. Your endorsement carries significant institutional weight and can fast-track a legacy. You may endorse multiple players across your tenure. This is your gift to basketball history.

**EXECUTIVE_TRADE**
Exercise commissioner authority to force a trade between any two teams, bypassing GM approval and salary cap restrictions. Comparable to the Adam Silver override. Owners will not forget this — and neither will the public. Use only when the league's competitive balance demands it.

**SIGN_FREE_AGENT**
Compel a specific team to sign a free agent — including international players from Euroleague, PBA, or the B-League — at minimum contract terms. The transaction appears as a standard team move in the wire. Useful for steering talent to struggling franchises or setting up future moves.

**WAIVE_PLAYER**
Force a team to immediately release a specific player onto the waiver wire. The player clears waivers and enters free agency within 48 hours. Powerful for breaking up roster logjams — but the affected team's front office will remember who issued the order.

**FIRE_PERSONNEL**
Immediately terminate a GM, Head Coach, Team Owner, or Referee. They are stripped of credentials and removed from any active role. This sends a clear message to the entire league about the standards you expect — but will trigger sharp backlash from their colleagues and allies.

---

### Season

**CELEBRITY_ROSTER**
Hand-pick the celebrities, athletes, and influencers participating in the All-Star Saturday Celebrity Game. Strategic casting — pairing viral internet personalities with A-list actors — can dramatically spike viewership and set social media ablaze before the main event. One-time per season; must be set before All-Star Weekend.

**GLOBAL_GAMES**
Select up to several international cities to host regular season NBA games this year. Each international game unlocks new sponsorship markets, international media rights, and growing overseas fan bases. Must be set before the season begins.

**INVITE_PERFORMANCE**
Book world-class artists for halftime shows, All-Star opening ceremonies, or Christmas Day spectacles. The right act can make a game culturally unmissable. Some artists demand premium fees — but a legendary performance can generate millions in incremental viewership revenue.

**SET_CHRISTMAS_GAMES**
Personally curate the NBA's marquee Christmas Day matchups — the highest-rated regular season broadcast window of the year. Stack marquee rivalries, superstar matchups, and marquee markets to maximize national ratings. This decision sets the tone for the entire second half of the season. Must be set before games begin.

**ADD_PRESEASON_INTERNATIONAL**
Schedule a preseason exhibition game against an elite international club — Euroleague powerhouses, PBA champions, or B-League top seeds. These games build diplomatic bridges, open scouting pipelines, and generate significant goodwill in basketball-hungry overseas markets. Must be arranged before regular season tipoff.

---

### Personal

**TRANSFER_FUNDS**
Shift capital between your personal wealth account and the league's operational treasury. Use this to inject cash when the league faces a budget shortfall, or to extract profits when finances are healthy. No transaction is ever publicly disclosed.

**INVITE_DINNER**
Host an exclusive private dinner for up to 100 guests from across the basketball world — team owners, GMs, star players, WNBA athletes, or media executives. A carefully composed guest list can mend fractured relationships, forge key alliances, and generate enormous personal goodwill.

**INVITE_MOVIE**
Reserve an entire private cinema for an exclusive screening. A low-key but effective bonding experience — particularly valued by players who want access without the formal pressure of league events. Great for building off-the-record trust with key influencers.

**GIVE_MONEY**
Discreetly transfer personal funds to any individual in the basketball ecosystem — performance bonuses, charitable gifts, or informal "appreciation" payments. Recipients experience a significant approval boost. No questions asked, no public record.

**TRAVEL**
Embark on a domestic or international trip for business or pleasure. Visit a city, attach an official reason (scouting, diplomacy, community outreach), and invite guests to join. International travel boosts global presence and opens doors to conversations that can't happen over a video call.

**VISIT_NON_NBA**
Fly out to visit an international or alternative league club — Euroleague contenders, PBA powerhouses, B-League teams, or WNBA franchises. Build diplomatic bridges, personally scout foreign talent, and signal the NBA's commitment to global basketball. These visits often precede major international signings.

**CONTACT_PERSON**
Send a personal message to anyone in the basketball world — active players, retired legends, coaches, GMs, owners, WNBA stars, or Hall of Fame icons. A direct line from the commissioner's desk carries enormous weight.

**GO_TO_CLUB**
Hit one of the USA's top nightlife venues for a night out. You may run into players, agents, celebrities, or journalists in an informal setting where conversations flow freely. A rare chance to build street-level credibility — though your public image could catch some heat.

---

### Covert

**HYPNOTIZE**
Deploy a shadowy network of psychological influence to compel a target — player, coach, or executive — to perform a specific action without any traceable link back to you. Success rate is high, but strange behavioral patterns can attract attention.

**SABOTAGE_PLAYER**
Arrange for a player to suffer a "natural" injury that sidelines them for a defined period. The team's medical staff will handle the public narrative. Extremely difficult to trace. Extremely dangerous if discovered. Reserve for rivals who threaten the league's competitive balance.

**BRIBE_PERSON**
Discreetly deliver a financial incentive to a player, coach, official, or media figure in exchange for a specific outcome. Illegal under any jurisdiction — but extraordinarily effective. If exposed, the consequences are career-ending. If buried, the results speak for themselves.

**LEAK_SCANDAL**
Anonymously surface damaging personal or professional information about a target. Fed through trusted media intermediaries, the story takes on a life of its own. Hijacks the news cycle, redirects heat away from the league, and can permanently damage an enemy's reputation.

**RIG_LOTTERY**
Manipulate the NBA Draft Lottery outcome to deliver the #1 pick to the team of your choosing. Opens a minified lottery table showing all pool teams with their exact top-pick odds — select one team, confirm, and the result is written permanently to state. The Draft Lottery watch view will show it as already finalized; `autoRunLottery` (May 14) skips if a result is already set. Disabled after the lottery has already run. A "Rig Lottery" button also appears directly in the Draft Lottery view (commissioner mode only, pre-draw only). If this ever leaks, your legacy burns.

---

## How the LLM Reacts to Actions

When **LLM mode is enabled** (`Settings → Enable LLM`), every call to `advanceDay()` sends a full prompt to the model. The action itself is serialised as `JSON.stringify(action)` and injected under **"User Action Taken"** in the prompt.

### The `outcomeText` contract
Set `action.payload.outcomeText` to a factual sentence describing what happened before calling `advanceDay`. The LLM uses this as context — it writes news, social posts, and emails reacting to this event. Without it, the LLM improvises (and may hallucinate).

```ts
// ✅ LLM will narrate this event
payload.outcomeText = `Commissioner fined LeBron James $500,000 for conduct detrimental to the league.`;

// ✅ Add isSpecificEvent: true for STRICT MODE — LLM focuses entirely on this single event
payload.isSpecificEvent = true;

// ❌ No outcomeText — LLM guesses what happened
```

**Known issue (Mar 2026)**: When LLM enabled, the model sometimes echoes `outcomeText` verbatim rather than enriching it. Root cause: system prompt calls it "ABSOLUTE SOURCE OF TRUTH". Fix tracked in `README.md > Pending Work` — requires renaming to `eventHint` and updating `system.ts`.

### When LLM is OFF
`advanceDay` falls back gracefully:
1. If `payload.outcomeText` is set → used verbatim for history
2. If games were played → game-count summary
3. Otherwise → `"The day has passed with standard league activities."`

The **game simulation is full-fidelity in both modes** — stats, trades, schedule all work the same. Only narrative flavor differs.

### Actions that always go to LLM (when enabled)
Any `dispatchAction` not in the immediate-handler list in `GameContext.tsx` flows through `processTurn` → `advanceDay` → LLM. This includes all custom actions, `ADVANCE_DAY`, and actions from `AssetActionModal` (GIFT / DEPLOY).

### PersonSelectorModal — actionType eligibility
`PersonSelectorModal` looks up eligibility from `PERSON_ACTION_MAP` in `src/data/personActionDefs.ts`. Always pass a registered `actionType`. Key types:

| actionType | Who appears |
|---|---|
| `general` | Players + staff + league office (RealStern invite/gift) |
| `dinner` | Players + staff + league office (no refs — removed Mar 2026) |
| `movie` | Players + staff (no refs, no league office) |
| `give_money` | Players + staff + teams |
| `fine` / `bribe` | Players + staff + refs |
| `suspension` | Active NBA players only |

`general` is registered via `GENERAL_ACTION_DEF` at the bottom of `personActionDefs.ts`. Without it only players appear.

---

## Technical Pipeline: Adding a New Action

### Step 1 — `src/components/actions/view/actionConfig.ts`
Add the action object to the appropriate category (`executive`, `season`, `personal`, or `covert`).
- **id**: Unique string identifier (e.g., `WAIVE_PLAYER`)
- **title / description / cost / benefit**: UI display text — be descriptive
- **icon**: Import from `lucide-react`; type must be `LucideIcon`
- **disabled?**: Optional condition to grey out the button
- **onClick**: Trigger the appropriate modal via `callbacks.*`

All action items conform to the `ActionItem` interface exported from this file.

### Step 2 — `src/components/modals/PersonSelectorModal.tsx`
If your action requires selecting a person:
- Add the new action type to the `actionType` union definition
- Update the filtering logic to restrict which players/staff appear

### Step 3 — `src/components/actions/view/ActionModalsRenderer.tsx`
- Add title mapping for the new action type so the modal header is correct
- Wire up the modal component if a custom UI is needed

### Step 4 — `src/components/actions/view/ActionsView.tsx`
- Update `handlePersonSelected` to map `modals.modalType` to the internal `actionType`
- Add the action type to the allowed list inside `handleAction`

### Step 5 — Backend Logic
| File | Purpose |
|---|---|
| `src/store/logic/turn/preProcessor.ts` | Alter rosters/stats before simulation runs |
| `src/store/logic/actions/playerActions.ts` | Core logic handler for the action |
| `src/store/logic/actionProcessor.ts` | Register action type → handler mapping |
| `src/services/logic/outcomeDecider.ts` | Define impact on approval ratings / league stats |

### Step 6 — LLM Context (optional)
If the action should appear in AI-generated news or social posts, add context handling in:
- `src/services/llm/prompts/context.ts`
- `src/services/llm/generators/simulation.ts`

### Step 7 — History / Transactions wire-up (REQUIRED for all roster moves)
Every action that moves a player or changes personnel **must** set `action.payload.outcomeText` to a human-readable summary. This string is stored in `state.history` and shown in the **Transactions** tab.

The format convention is:
- **Signing:** `"The [Team Name] have signed [Player Name]."`
- **Trade:** `"A trade has been finalized between the [Team A] and [Team B]. [Assets A] have been moved to [Team B abbrev], while [Assets B] have been sent to [Team A abbrev]."`
- **Waiver:** `"[Player Name] has been waived by the [Team Name]."`
- **Generic day pass fallback** (`src/services/llm/generators/simulation.ts` line ~125): when LLM is disabled and no `outcomeText` is provided, the history receives a game-count summary if games were played, or `"The day has passed with standard league activities."` as a last resort. **To avoid the generic fallback, always set `payload.outcomeText` in your action handler before calling `advanceDay`.**

### Step 8 — Social post for roster moves (optional but recommended)
For signings and trades, call the Charania builders directly from your action handler so a tweet fires even when LLM is disabled:
```ts
import { buildShamsSigningPost, buildShamsTradePost } from '../../../services/social/templates/charania';
```
See `src/store/logic/actions/playerActions.ts` (signing) and `tradeActions.ts` (trade) for the pattern.

### Step 9 — Add the action type to `ActionType` (REQUIRED for all new actions)

Every new action needs its type string in `src/types.ts`:
```ts
export type ActionType = '...' | 'YOUR_NEW_ACTION';
```

**Special immediate-action pattern** (no day advance): if your action only mutates state without advancing game time (e.g. purchasing an item, toggling a setting), handle it in `GameContext.tsx` before the `processTurn` call:
```ts
if (action.type === 'YOUR_IMMEDIATE_ACTION') {
  setState(prev => ({ ...prev, /* mutation */ }));
  return; // <-- never reaches processTurn
}
```

---

## Commish Store — Asset Action Integration

`src/components/central/view/CommishStore.tsx` — accessible via sidebar under **Personal → Commish Store**.

### Asset lifecycle

| Action | Day advance? | Wealth change | LLM sees it? |
|---|---|---|---|
| **BUY** | ❌ No | −purchase price | ❌ |
| **SELL** | ❌ No | +70% refund | ❌ |
| **DISCARD** | ❌ No | None | ❌ |
| **GIFT** | ✅ Yes | None | ✅ (via `outcomeText`) |
| **DEPLOY** | ✅ Yes | None | ✅ (via `outcomeText`) |

### How BUY works (no day advance)
`STORE_PURCHASE` is handled as an immediate action in `GameContext.tsx`:
```ts
if (action.type === 'STORE_PURCHASE') {
  setState(prev => ({
    ...prev,
    stats: { ...prev.stats, personalWealth: prev.stats.personalWealth - amountMillion }
  }));
  return;
}
```
Pass negative `amountMillion` to refund (SELL).

### How GIFT/DEPLOY advance the day with LLM context
Both dispatch `ADVANCE_DAY` with `payload.outcomeText` set so the LLM narrates the event:
```ts
dispatchAction({
  type: 'ADVANCE_DAY',
  payload: {
    outcomeText: `Commissioner gifted ${qty}x "${product.title}" to ${recipientName}.`
  }
});
```
The LLM sees `JSON.stringify(action)` in the prompt — the `outcomeText` becomes the source-of-truth narrative.

### `AssetActionModal` — `src/components/modals/AssetActionModal.tsx`
Standalone component extracted from `CommishStore`. Props:
```ts
{ asset, onClose, onRemoveAsset: (asset, qty) => void }
```
Internal view states: `'menu' | 'gift_select' | 'deploy_input'`
- `gift_select`: renders `PersonSelectorModal` with `actionType="give_money"`
- `deploy_input`: textarea → on submit dispatches `ADVANCE_DAY` with LLM context

---

## Notes on International Actions

`VISIT_NON_NBA` and `ADD_PRESEASON_INTERNATIONAL` both interact with the three external leagues:
- **PBA** (Philippine Basketball Association) — `player.status === 'PBA'`, tid offset +200
- **Euroleague** — `player.status === 'Euroleague'`, tid offset +100
- **B-League** (Japan) — `player.status === 'B-League'`, tid offset +300

Stats and bio for these players are fetched lazily from gist JSON files via `nonNBACache.ts` and shown in the player bio view under "Professional Career Report". No NBA.com proxy is used for non-NBA players.

The `SIGN_FREE_AGENT` (Force Sign) action supports signing international players directly onto NBA rosters.
