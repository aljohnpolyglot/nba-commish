# Plan — Phase 2: EuroLeague / Endesa Team Playable in GM Mode

> **Scope of this plan:** make a non-NBA club (`tid >= 1000`) controllable as the user's GM team, with all single-team views working.
> **Explicit non-goals here:** EuroLeague/Endesa schedule generation (→ Phase 4), competition-aware standings/labels (→ Phase 3), Trade Machine cross-league (→ Phase 3 followup).
> Delete this file when Slice 5 closes out. Phase 1 plan must be finished first.

## Goal

A user can start a save in Spain modded-Europe mode, pick Real Madrid (or any Endesa / Euroleague club) as their team, and use Team Office, Coaching, Training Center, Free Agency, and Player Bio without crashes — even though the player schedule remains NBA-anchored for now.

## Acceptance Criteria

- [ ] **AC-1** Setup → Modded → Europe → Spain → Real Madrid → Start: save commits with `state.userTeamId === <Real Madrid Endesa tid>` (5012 today), `state.gameMode === 'gm'`, `state.leagueStats.draftType === 'no_draft'`.
- [ ] **AC-2** Team Office tab opens to a populated Real Madrid header (logo, name, roster count > 0). Sub-tabs (Roster, Depth Chart, Contracts, Trading, Picks, Scouting) render without throwing.
- [ ] **AC-3** Coaching Hub tab loads a defense gameplan, defender-detail, and rival-gameplan store keyed to Real Madrid's tid; saving a change persists across reload.
- [ ] **AC-4** Training Center tab generates a calendar for Real Madrid's roster; daily-plan auto-scheduler runs without filtering them out as non-NBA.
- [ ] **AC-5** A Real Madrid GM can sign a free agent (Euroleague-tagged or NBA-tagged) via Free Agents view + SigningModal without the AIFreeAgentHandler loyalty gate filtering them silently.
- [ ] **AC-6** PlayerBioView opens for any Real Madrid player without missing-team-name fallback in the header.

## Pre-Existing Work (confirmed via research)

- `CommissionerSetup.tsx:56-107` already maps Endesa NonNBATeam → NBATeam-shape for the picker on Spain path.
- `getOwnTeamId(state)` in `src/utils/helpers.ts:15-17` is tid-agnostic — no NBA range gate.
- TeamOfficeView routing accepts any numeric `teamId`.
- `resolveTeam(tid)` helper in `ScheduleView.tsx` already merges `state.teams` + `state.nonNBATeams` + negative IDs.
- `Endesa` modded path auto-applies `draftType: 'no_draft'` (Phase 1 unblock).
- Phase 1 self-heal ensures the offseason gate closes for these saves.

## Known Coupling Hot Spots (must touch)

From research agent's "Tier" ranking:

| Tier | File | Issue |
|---|---|---|
| Low | `TrainingCenterView.tsx` | TrainingFranchisePicker may filter `tid < 30`; needs nonNBATeams fallback |
| Low | `Coaching*Store` (defenseGameplanStore et al.) | Verify keys are `${saveId}:${tid}` — no NBA gate |
| Med | `AIFreeAgentHandler.ts` | `getLoyalPriorTid()` filters `tid >= 0 && tid <= 29` — bypass for non-NBA user teams |
| Med | TeamOffice sub-pages | Several read `state.teams.find(t => t.id === userTeamId)` — must fall back to `state.nonNBATeams` |
| Low | PlayerBioView header | Confirm team name resolves via `resolveTeam` not `state.teams` directly |

## Slices

Each slice mergeable independently. RED (find broken state), GREEN (fix), REFACTOR.

### ✓ Slice 1 — `resolveAnyTeam(tid, teams, nonNBATeams)` helper

- **Status:** SHIPPED.
- **What landed:** New file `src/utils/teamLookup.ts` exporting `resolveAnyTeam` + `isNonNBATid`. Logic mirrors the inline version that was in ScheduleView, plus carries through `pop`, `region`, `colors`, `stadiumCapacity` from NonNBATeam into the NBATeam stub. ScheduleView re-imports the helper, drops the local duplicate.
- **Type-check:** clean.

### ◐ Slice 2 — Team Office sub-pages use `resolveAnyTeam` (mostly shipped)

- **Status:** Critical path shipped; only lower-priority Trade Hub follow-up remains.
- **What landed:** TeamOfficeView (entry), TeamOfficeRosterView (default GM tab), TeamOfficeDepthChartTab, GeneralManager, TeamIntel, TeamOfficeCoachRosterView, TeamIntelFreeAgency, TeamIntelExpiring — all now resolve the viewed team via `resolveAnyTeam`. The TeamIntel / FA selector modals also now receive wrapped non-NBA team metadata so logos + abbrevs still render when the selected player pool is outside `state.teams`.
- **Follow-up files** (same pattern, low individual risk):
  - `pages/TradingBlock.tsx:46`
  - **Skipped intentionally:** `DraftScouting.tsx`, `DraftPicks.tsx` — these views shouldn't be reachable for `no_draft` saves anyway (Phase 1 hides the draft sidebar rows).
- **AC-2:** Stronger now: default landing tab, Depth, Intel, Expiring, Free Agency, and Coach Roster no longer depend on NBA-only team lookup.

### ✓ Slice 7 — `getActiveLeagueTeams(state)` for league-aware pickers

- **Status:** SHIPPED. Triggered by user report "team picker im alles sind immer nba".
- **Root cause:** Every "browse all teams" picker iterates `state.teams` directly. That list is NBA-only by design. Non-NBA GMs (Endesa Real Madrid) see NBA teams in pickers instead of their own league.
- **What landed:** New `getActiveLeagueTeams(state)` helper in `teamLookup.ts` — returns NBA teams for NBA users / commissioner mode, returns the user's league teams (mapped to NBATeam stubs) for non-NBA users. Patched: TeamOffice/Home.tsx (the franchise grid), CoachingPage (`processedTeams` iteration). `gmAttributes.findGMForTeam` and `getGMName` now use `resolveAnyTeam` so Real Madrid GM lookups don't return null.
- **What landed afterwards:** `TrainingFranchisePicker` now also consumes `getActiveLeagueTeams(state)` and `isOnRoster(player)`, so commissioner-side training browsing no longer hardcodes the NBA list or drops Endesa/Euroleague roster counts.
- **Follow-ups deliberately not patched here:**
  - Standings, PowerRankings, TeamStats, LeagueLeaders — these derive from `state.boxScores` which only has NBA games. Swapping the team list would just yield empty rows; the real fix is Phase 4 schedule generation for non-NBA leagues.
  - Trade Machine team dropdown — Endesa GM trading with NBA is out of scope until cross-league rules are designed.
  - TrainingFranchisePicker — closed out after the original slice note; no longer NBA-only.

### ✓ Slice 8 — Synthetic staff fallback for non-NBA teams

- **Status:** SHIPPED (helper module). Triggered by user note "und helper wenn kein coach existiert und anders... neueu files was auch immer".
- **What landed:** New file `src/services/staff/staffFallback.ts` exporting `makePlaceholderGM(team)` + `makePlaceholderCoach(team)`. Deterministic seeded jitter on attributes (each placeholder feels distinct). NOT auto-injected into `state.staff` — consumers call them on-demand when their existing lookup returns null. Avoids save bloat and keeps the pattern aligned with how fictional league does it.
- **Wired-up consumers so far:** none beyond `gmAttributes` already gracefully falling back to `DEFAULT_GM_ATTRIBUTES`. When the user reports a specific "no coach"/"no GM" UI gap in browser, swap that consumer to use `makePlaceholderGM`/`makePlaceholderCoach`. Build the fallback wiring lazily as gaps surface — speculative auto-injection would touch too many call sites blindly.

### ✓ Slice 6 — `isOnRoster(player)` helper unblocks non-NBA roster rendering

- **Status:** SHIPPED. Triggered by user report "kein roster" when opening Real Madrid in GM mode.
- **Root cause:** ~22 sites in Team Office / Coaching filter rosters via `p.status === 'Active'`. NBA players have status `'Active'`; international-league players have `'Endesa'`, `'Euroleague'`, etc. So every roster table for a non-NBA user team rendered as empty.
- **What landed:** New `isOnRoster(player)` in `teamLookup.ts` — returns true for `'Active'` plus all 8 international league tags. Patched: TeamOfficeRosterView, TeamOfficeDepthChartTab, GeneralManager, TeamIntel, CoachingPage, CoachingView/{IdealRotationTab, GameplanTab, DefenseTab}. Same edit pattern: import + replace_all.
- **Follow-up files** (same pattern, not patched yet — fix on report): TeamNeeds, Home (NBA-only roster preview, lower priority).

### ✓ Slice 3 — Coaching Hub + Training Center resolve non-NBA tids

- **Status:** SHIPPED.
- **What landed:**
  - `CoachingHubView.tsx:14` — `resolveAnyTeam` for `currentTeam`.
  - `TrainingCenterView.tsx:206` — same, plus inline note that NonNBATeam stubs lack a `trainingCalendar` slot (persistence won't work yet — Phase 2 follow-up).
  - `TrainingFranchisePicker.tsx:16` — same lookup so the user-team card renders at the top of the picker for non-NBA GMs.
- **What landed afterwards:** `TrainingCenterView` now scopes `trainingTeams` and league-wide comparison rosters through `getActiveLeagueTeams(state)`, filters roster rows via `isOnRoster(player)`, includes non-NBA teams in the schedule lookup map, and hides the top-right franchise dropdown entirely in GM mode so a Spain/Endesa user no longer gets bounced back to an NBA-only selector.
- **AC-3 status:** Coaching Hub renders Real Madrid header + roster. Defense gameplan store keys by `${saveId}:${tid}` (audited via `saveScopedMapStore.ts`), no NBA gate, so persistence should already work — confirm in Slice 5 browser walkthrough.
- **AC-4 status:** Training Center renders a calendar for Real Madrid players. **Known gap:** saving a daily plan dispatches against `state.teams[i].trainingCalendar` which doesn't exist for non-NBA teams; persistence is a deferred follow-up. View is at least non-crashing.

### ⊘ Slice 4 — Free Agency loyalty gate (DROPPED for MVP)

- **Why dropped:** Audit showed `getLoyalPriorTid` / `isPlayerLoyalToPriorTeam` are called *only* from `AIFreeAgentHandler.runAIFreeAgencyRound` (AI teams making signings). User-manual signing dispatches `SIGN_FREE_AGENT` and never enters this path. Real Madrid GM signing a player is therefore unaffected by the loyalty gate.
- **When to revisit:** Phase 4+ when EuroLeague AI teams run their own FA rounds — at that point the gate will need branching (NBA loyalty for NBA prior teams, EuroLeague loyalty for EuroLeague prior teams).
- **AC-5 still needs verification** in browser, but doesn't require code change here.

### Slice 5 — Browser smoke test (deferred to user)

- **One sentence:** Walk a fresh Spain modded-Europe save end-to-end and check off AC-1 through AC-6 in this file.
- **Path:** `npm run dev` → New Save → Modded → Europe → Spain → Real Madrid → tour all five hub tabs → sign one FA → open one PlayerBio.
- **AC:** All AC items checked. Plan file deletable.
- **Owner:** User. After confirming, delete this plan and remove `plans/` if empty.

## Risks & Open Questions

- **Risk:** Some sub-page may have a hard NBA assumption that's not surfaced by research. Mitigation: when Slice 2 finds one, add it as a follow-up note; don't widen the slice.
- **Open:** Should Slice 1's helper live in `helpers.ts` or its own module? Decide when porting ScheduleView.
- **Open:** Does Endesa setup actually finish today, or is it stuck somewhere upstream of this plan? Slice 1 of *this* plan implicitly verifies this — if Setup fails, that becomes a new prerequisite slice.

## Process Reminder

For every slice that ships code: open a PR, request approval, get explicit commit ack before merging. No skipping verification.
