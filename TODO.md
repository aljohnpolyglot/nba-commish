# NBA Commish — Outstanding Tasks

## High Priority

### All-Star Replacement (Seasonal)
Currently: shows All-Star roster with per-player swap button → triggers candidate picker.
- The replacement updates the roster in state but does **not** yet announce it as a proper league event (no news/social post generated).
- Consider adding a `REPLACE_ALL_STAR` dispatch action that also injects a news item + social post.
- Sidebar badge (NavigationMenu) for injured All-Stars still references `hasInjuredAllStars` logic — verify badge count is correct after Task 6 redesign.

### Playoff Roster Move (originally "Task 13")
During playoffs, if a key player on a playoff team is injured, the commissioner should be able to:
- Sign a free agent on an emergency contract to that team's roster
- Or promote a two-way/G-League player
- Gate: playoffs active + injured player on a clinched team (≥ OVR 80 preferred)
- Similar modal pattern: left = injured playoff players, right = free agents sorted by OVR
- Dispatch: `SIGN_FREE_AGENT` action with `teamId` and `playerId`
- Add as a seasonal card (deadline = end of current playoff round)

### 2K Data — Gist Reliability
Defense2KService and badgeService (and DunkContestModal) all fetch from gist URLs at runtime.
- Risk: gist goes down or rate-limits → silent failures
- Consider caching fetched data in localStorage with a TTL (e.g., 24h) so subsequent loads don't re-fetch
- Do NOT bundle as local JSON (too large, wastes context tokens)

## Medium Priority

### Trade Proposals — AI Acceptance Logic
- AI teams currently accept/reject trades too uniformly
- Consider factoring in team record, playoff position, and player age curves

### Draft Lottery UI
- Needs real ping-pong ball simulation animation
- Current implementation is functional but visually flat

### League News — Streak Snapped Category
- `streak_snapped` news templates are in place
- Verify the `prevTeams` argument is correctly passed through all sim paths (lazy sim + social handler)

### Social Feed — Thread Reply Deduplication
- Fixed the `''` key bug in this session
- Monitor for any edge cases where LLM returns duplicate reply IDs

## Low Priority / Backlog

### Commish Store — New Items
- Add "Expansion Team" purchase option (placeholder for future feature)
- Add "All-Star Game Format Change" item (3-team, HORSE bracket, etc.)

### PlayerBioView — Historical Data Tab
- Default tab is now "Historical Data" — confirm this feels right in prod
- Consider adding a sparkline chart for season-over-season PPG/RPG/APG

### Broadcasting View
- `broadcastingBadge` currently shows `!` if media rights not locked before season start
- After season starts the badge disappears — intended? Or should it persist until locked?

### Preseason International Games
- Modal exists and dispatches correctly
- Not yet surfaced on the schedule view for preseason dates
- Games may not simulate correctly if `KNOBS_PRESEASON` is not applied

---

*Last updated: 2026-03-28*
