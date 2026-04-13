# NBA Commish — New Feature Ideas

> These are aspirational features that are NOT blocking multi-season. Log them here, prioritize when the multi-season loop is stable.

---

## Player Development

- **Position archetypes** — preset buttons in rating edit mode: "3&D Wing", "Pass-First PG", etc. Fills in recommended rating ranges per position
- **HOF Hall of Fame** — trigger `hofActions.ts` check on retired players; badge/banner in PlayerBioView for HOF inductees

---

## Power Rankings View

- Dedicated Power Rankings view (isolated, not part of Season Preview)
- Tier list format (Contenders / Fringe Playoff / Lottery / Rebuilding)
- Team OVR bars + win/loss record
- Trend arrows (rising/falling based on last 10 games)
- Commissioner's Pick widget — user can drag teams up/down to set manual power rank override

---

## Retirement Ceremony View

- Dedicated view for players announcing retirement this offseason
- Shows career stats, awards, all-star appearances
- Legend retirees (5+ All-Star) get a full tribute card with portrait + quote
- Linked from sidebar nav when `retirementAnnouncements.length > 0`
- User can "send a message" (cosmetic; generates a news item)
- `retirement_legend` news card type with portrait + career stats block

---

## Contract / Cap Features

- **Player option tracking** — `hasPlayerOption: boolean` on contract. At rollover: AI opts in if `marketValue > contractAmount × 0.9`, opts out if better market exists
- **Team option tracking** — `hasTeamOption: boolean`. AI picks up options if OVR still starter-level (≥ 75)
- **Qualifying offers** — for restricted FAs (rookies on 4yr deals): team must tender QO to maintain matching rights. Auto-decline if rebuilding
- **Stretch provision** — waived player's salary split over 2×remaining years; displayed in TeamFinancesViewDetailed
- **Trade exception** — TPE generated when receiving fewer salary in a trade. Expires after 1 year. Currently not tracked
- **Buyout market** — midseason, teams buy out bad vets; bought-out players enter FA with 50% salary guaranteed
- **Two-way contract expansion** — track as distinct contract type with 45-game NBA limit
- **G-League call-up** — `G-League` status player → call up mid-season; sets tid, status='Active', keeps same contract
- **Salary arbitration** — young players (years 2-4) who outperform their rookie deal can request arb, forces extension offer + news
- **AI end-of-season max/supermax extensions** — AI teams offer max/supermax extensions after awards are set (late May/June)

---

## UI / UX

- **Season Preview power rankings** — show projected OVR ranking for all 30 teams at season start (if ever built, do as standalone Power Rankings view)
- **CareerStats snapshot in PlayerBioView** — retired players show career averages (computeCareerStats already exists in playerRatings.ts)
- **DraftLotteryView "Sim Lottery" → "Start Lottery"** — cosmetic button rename

---

## External Leagues

- **Endesa roster gist** — upload roster + connect `fetchEndesa()` (tid offset TBD)
- **G-League roster gist** — upload + connect; `calculateGLeagueOverall()` (cap ~75, multiplier ~0.720)
- **`externalSigningRouter.ts`** — routes unsigned Oct 1 FAs to Euroleague/G-League/PBA based on OVR
- **DraftClassGenerator.ts** — generate 60 players per season for 2029+ when prospects run out

---

## Season History / Legacy

- **`prominent retirement_legend` news card** — dedicated news card type with photo, career stats, tribute text for 5+ All-Star retirees (news exists, card styling doesn't)
- **Transactions log partition guard** — confirm rollover does NOT clear `state.history[]` (currently safe — rollover doesn't touch history)
