# Offseason 2K-Style Spec — Sandboxed Phase Checklist

> Source: NBA 2K MyGM "Offseason-Aufgaben" (Offseason Tasks) screenshots, May 3 2026.
> Zweck: Replace our buggy day-by-day calendar advance with a **sandboxed phase checklist** modeled exactly on 2K's MyGM. Calendar still ticks underneath, but the user only ever sees the phase-relevant UI.

---

## 0. The core insight (warum machen wir das überhaupt?)

> "now i know why madden and 2k and fifa transfer windows have different ui or different system vs calendar year cuz it iis an entirely different sport lol"

**Calendar-year UX is wrong for team-management sports.** In real life, a GM's offseason isn't "advance one day at a time and watch news." It's a **task list** — decide options, qualify RFAs, run draft, sign rookies, work the FA market — each with its own screen, deadline, and resolution.

2K solved this by making the offseason a **wizard-style checklist** with a sandbox per phase. The simulated calendar still runs (it has to, because contracts have years), but the user never sees July 2 vs July 3 — they see "Free Agency Tag 2/13" and a market screen.

This spec describes 2K's flow, what we already have, what's missing, and the implementation order.

---

## 1. The Offseason Task List (AUFGABEN)

Bild #2 / #7 / #16 show the master sidebar that anchors the whole offseason. From `Association → Offseason-Aufgaben`:

```
☐ DRAFTLOTTERIE                    Draft Lottery
☐ BESUCH IM WEISSEN HAUS           White House Visit (champ-only flavor)         [FUTURE]
☐ PERSONALVERPFLICHTUNGEN          Staff Signings                                 [FUTURE — no staff in sim yet]
☐ TEAM-/SPIELEROPTIONEN            Team / Player Options
☐ QUALIFYING OFFERS                RFA QO submissions
☐ MEINE FREE AGENTS                My Free Agents (status of expiring roster)
☐ PRE-DRAFT-WORKOUTS               Workouts                                       [FUTURE — combine already in playerGen]
☐ NBA-DRAFT                        Draft
☐ ROOKIE-VERPFLICHTUNGEN           Rookie Contracts (sign drafted rookies)
☐ FREE AGENCY                      Open market
☐ TRAININGSLAGER                   Training Camp
☐ ZU NÄCHSTER SAISON VORRÜCKEN     Advance to Next Season
```

Each row is a **gate**: checkbox left-side, phase title + description right-side. User clicks a row → enters that phase's sandboxed UI → completes it → checkbox fills → next row unlocks.

**Right-pane description on hover** — example for `TEAM-/SPIELEROPTIONEN` (Bild #2):
> "Team/Spieleroptionen-Phase: Entscheide, welche Teamoptionen du annehmen möchtest und welche nicht."

**Right-pane description for `ROOKIE-VERPFLICHTUNGEN`** (Bild #7):
> "Während der Rookie-Verpflichtungsphase verpflichtest du die von dir gedrafteten Rookies durch ihre ersten NBA-Verträge."

The list is the **single source of truth** for "where am I in the offseason." No more guessing from `state.date`.

---

## 2. Per-phase UI breakdown (with screenshot map)

### 2.1  DRAFTLOTTERIE (Bild #2 sidebar, plus our existing `DraftLotteryView`)

- **Status today:** ✅ Already implemented (`DraftLotteryView`, `useDraftEventGate`).
- **2K UX:** Click row → cinematic lottery (or instant skip) → result locked → checkbox.
- **Action needed:** Wire the existing view into the new task list as a row instead of a date-triggered modal.

### 2.2  BESUCH IM WEISSEN HAUS (Bild #2)

- **Status today:** ❌ Not implemented.
- **2K UX:** Champion only. Cosmetic flavor screen, photo + brief news. Auto-checkmark for non-champions.
- **Action needed:** Defer — flavor only, low ROI. Add as future news item attached to championship banner.

### 2.3  PERSONALVERPFLICHTUNGEN (Bild #2)

- **Status today:** ❌ No staff system in the sim yet (no coach contracts that expire).
- **2K UX:** Coach + assistant + scout signings. Each has a contract that expires.
- **Action needed:** Defer until staff system exists. Auto-skip for now.

### 2.4  TEAM-/SPIELEROPTIONEN (Bilder #1, #3, #4)

- **Status today:** ⚠️ Logic exists in `seasonRollover.ts §0a/§0b` (`playerOptInIds`, `teamOptionDeclinedIds`, `teamOptionExercisedIds`) but it auto-decides everything during rollover. No user-facing decision UI.

- **2K UX (Bild #1 — single-player view):**
  - Hero card top: portrait + name + jersey# + position + age + height + **Moral** + **FA-Art** (Restricted/Unrestricted) + **Vertrag** (current contract years/$) + **Option** type (Team, X J. / Spieler, X J.)
  - Roster table bottom: shows the rest of your roster with attribute deltas (PIZ, PVA, PER-D, POST-D, HNDL, REB, IQ) + arrows showing rating up/down trends. Used for context: "do I still need this guy or do my younger players cover his role?"
  - Footer buttons: `ANNEHMEN` (Accept option) / `ABLEHNEN` (Decline option).

- **2K UX (Bild #3 — your team's option summary):**
  - Compact table: Name · WTG · GEH(alt) · OPTION · STATUS
  - STATUS column = `Annehmen` (pending decision) / `Angenommen` (accepted) / `Abgelehnt` (declined)
  - Player options auto-show as `Angenommen` once player decides (player AI auto-decides in 2K, just like our current rollover does).

- **2K UX (Bild #4 — league-wide recap):**
  - After you complete YOUR options, you see what every other team did: top stars list with team · salary · option type · status. Useful for context before FA opens (e.g. "Wade picked up his option, so I won't try to sign him").

- **Action needed:**
  1. New `TeamPlayerOptionsView.tsx` (sandbox screen).
  2. Reads expiring contracts with `hasTeamOption || hasPlayerOption` from `state.players` filtered to user team.
  3. Per-row Accept/Decline button → writes to a new `state.pendingOptionDecisions` map (so we don't mutate contracts until phase complete).
  4. "Complete phase" button: applies all decisions via existing `seasonRollover` logic but with the user's choices instead of AI defaults.
  5. League-wide recap subview: shows AI teams' decisions (already auto-resolved by `seasonRollover` for non-user teams).

### 2.5  QUALIFYING OFFERS (Bild #5)

- **Status today:** ⚠️ RFA logic exists (`restrictedFA`, `qualifyingOffer` flags scattered), but no submission UI.

- **2K UX (Bild #5):**
  - Hero card top: same player layout as options, but Option field shows `-` and Vertrag is `0 J. | $0` (contract expired). FA-Art is `UNEINGESCHR.` (Unrestricted) or `EINGESCHRÄNKT` (Restricted).
  - Bottom table: per-player single row showing `SPIELERNAME · ANGEBOT (1 Jahr / $X Mio.) · STATUS`.
  - STATUS = `Qualifying Offer abgegeben` (QO submitted).
  - User picks RFA-eligible expiring players from roster → submits QO → player becomes RFA at FA opening.

- **Action needed:**
  1. New `QualifyingOffersView.tsx`.
  2. Filter `state.players` to user team's expiring rookies eligible for RFA (years-of-service threshold from `restrictedFAEligibilityYears` setting).
  3. Per-row "Submit QO" toggle.
  4. Auto-compute QO amount per `getQualifyingOfferAmount()` (already exists somewhere or needs adding).
  5. On phase complete: write `restrictedFA: true` + `qualifyingOfferSubmitted: true` flags so FA market knows to allow Match later.

### 2.6  MEINE FREE AGENTS (Bild #6)

- **Status today:** ⚠️ Players become FAs during rollover but no consolidated "your FAs" view.

- **2K UX (Bild #6):**
  - Hero card: same template (selected player). Notable: FA-Art shows `UNEINGESCHR.` or `EINGESCHRÄNKT`, Vertrag `0 J. | $0`.
  - Table columns: NAME · POS · WTG · **BIRD** (Ja/Nein — Bird Rights flag) · **STATUS** · attribute columns
  - STATUS values:
    - `Abgelaufen` (Expired — open to all teams, you can still re-sign with Bird Rights)
    - `Will nicht` (Doesn't want to re-sign — relationship/morale broken)
    - `FA testen` (Wants to test the market — won't accept your offer until they shop around)
  - This is **read-only orientation** — shows you what's leaving so you can plan.

- **Action needed:**
  1. New `MyFreeAgentsView.tsx`.
  2. Filter `state.players` to `tid === userTeam && contract.exp <= currentYear`.
  3. STATUS derivation:
     - Bird=Ja → `Abgelaufen`
     - Mood < 30 → `Will nicht`
     - Mood 30–60 + competitive → `FA testen`
     - Mood ≥ 60 + Bird → `Abgelaufen` (will re-sign easily)
  4. Read-only, just an info screen. No actions.

### 2.7  PRE-DRAFT-WORKOUTS (Bild #2)

- **Status today:** ❌ Not implemented; `playerGen` already produces combine-style ratings.
- **Action needed:** Defer. Could surface combine numbers in a table later. Auto-skip.

### 2.8  NBA-DRAFT (Bild #2)

- **Status today:** ✅ Fully implemented (`DraftSimulatorView`).
- **2K UX:** Click row → enters Draft Board → user picks → completes → checkmark.
- **Action needed:** Wire existing view to the task row gate.

### 2.9  ROOKIE-VERPFLICHTUNGEN (Bilder #7, #8)

- **Status today:** ⚠️ Rookie contracts auto-seeded in `autoRunDraft` + `DraftSimulatorView.computeDraftPickFields` + `rookieContractUtils.ts`. No user-facing accept/decline screen.

- **2K UX (Bild #8):**
  - Hero card: rookie portrait + name + age + height + ratings + **Vertrag K.A.** (no contract yet) + **FA-Art UNEINGESCHR.**
  - Bottom table: SPIELERNAME · RUNDE · PICK · ANGEBOT (years/$) · STATUS
    - Example: Kostas Niniadis · 1 · 6 · 2 JAHRE/$5,22 Mio. · Annehmen
    - Brent Wagner · 2 · 4 · 1 JAHR/$734 Tsd. · Annehmen
  - STATUS toggles between `Annehmen` (Accept slot offer) / `Ablehnen` (Decline → rookie becomes UFA / re-enters next draft).

- **Action needed:**
  1. New `RookieContractsView.tsx`.
  2. Reads `state.players` filtered to `draft.year === currentYear && tid === userTeam`.
  3. Reuses `computeRookieSalaryUSD()` to display offer amount.
  4. Per-row Accept/Decline button (default Accept).
  5. On phase complete: applies decisions. Declined rookies → `tid = -1`, `status = 'Free Agent'`, redrafted-eligible flag.

### 2.10  FREE AGENCY (Bilder #9, #10, #11, #12, #13, #14, #15)

**This is the big one. The whole reason for this refactor.**

#### 2.10a  FA dashboard (Bild #9 — header / #15 — mid-FA)

```
┌─────────────────────────────────────────────────────────┐
│           PHILADELPHIA 76ERS                             │
│                                                          │
│   NBA GESAMT     GEHALTSSPIELRAUM   VERBLEIBENDE MLE    │
│      8/12         $33,59 MIO.         $2,79 MIO.        │
│                                                          │
│   PG    SG    SF    PF    C                              │
│   2/2   2/2   1/2   2/2   1/2                            │
│                                                          │
│  ──────────── AKZEPTIERTE ANGEBOTE ────────────         │
│  NAME       WTG   ANGEBOT       STATUS  OPTION  NTK    │
│  E.Turner   77   4 JAHRE/$19,57 Mio.  Match    -    K.A.│
│                                                          │
│  ───────────────────────────────────────                │
│           FREE AGENCY - TAG 8/13                         │
└─────────────────────────────────────────────────────────┘
```

Critical UX elements:
- **NBA GESAMT N/M** — total roster count (8 of 12 max, in 2K12-era; we use 15).
- **GEHALTSSPIELRAUM** — cap space remaining.
- **VERBLEIBENDE MLE** — remaining MLE after current signings (this DOES decrement live, which is exactly the fix we made in S50).
- **Position counts** — yellow numbers when under-filled. Visual roster-construction guide.
- **AKZEPTIERTE ANGEBOTE** — list of your signings this FA cycle (each row: name, rating, contract, status, option, no-trade clause).
- **FREE AGENCY - TAG X/13** — the **day counter**. FA isn't a calendar window in the UI. It's a 13-step ticker. Each "tag" advance = AI signs a wave + your accepted signings finalize + RFA matches resolve + FA pool refreshes.

> **The crucial design choice**: the user never sees July 1 vs July 8. They see "Tag 1/13." Internally we still tick the calendar (so contracts compute correctly), but the UI is a sandbox with its own counter.

#### 2.10b  FA list view (Bild #10)

- Hero card top: selected FA (Caron Butler in screenshot).
- Table: NAME · **FA-ART** (RFA / UFA) · **ANGEBOTE** (number of offers received) · **BIRD** (do you have Bird? Ja/Nein) · WTG + attribute columns.
- Sort: by interest (RFA with offers > UFA without). User clicks a row → opens negotiation screen.

#### 2.10c  FA negotiation screen (Bild #11)

```
┌──────────────────────────────────────────────────────────┐
│         PAUL GEORGE   NR.24    SG/SF                      │
│  [portrait]  ALTER 24  GRÖSSE 81"                         │
│              MORAL ZUFRIEDEN  FA-ART EINGESCHRÄNKT        │
│              VERTRAG K.A.     OPTION K.A.                 │
│                                                           │
│  ──────────── INTERESSE ────────────                     │
│  ████████████░░░░░░  (gradient bar)                      │
│                                                           │
│             GEHALT     TEAM     GEH.-GRENZE              │
│  GESAMT  $68,53 Mio.   2014-15  $16,05M  $43,20M $17,54M │
│  TYP     Nach (+4,5%)  2015-16  $16,77M  $19,44M $43,42M │
│  JAHRE       4         2016-17  $17,49M  $17,49M $47,56M │
│  OPTION       -        2017-18  $18,22M  $18,22M $49,12M │
│  KEIN TRADE  K.A.                                         │
│  ROLLE       Star                                         │
│                                                           │
│            [VERTRAG UNTERZEICHNEN]                        │
└──────────────────────────────────────────────────────────┘
```

Negotiation knobs:
- **GESAMT** — total contract value (auto-computed from years × annual).
- **TYP** — escalation curve: `Nach (+4,5%)` (raises) / `Vor` (declines) / flat.
- **JAHRE** — 1–5 (or whatever max length).
- **OPTION** — none / Player Option last year / Team Option last year.
- **KEIN TRADE** — No-Trade Clause (only available to vets at supermax-equivalent).
- **ROLLE** — promised role (Star / Starter / 6th Man / Rotation / Bench).

Year-by-year breakdown table on right shows GEHALT (offer amount), TEAM (team's current cap commitment for that year), GEH.-GRENZE (cap limit per year — projected cap rises annually).

**INTERESSE** bar = real-time interest level. Filled = offer competitive. Empty = player will reject.

#### 2.10d  RFA Match notification (Bilder #12, #14)

```
┌────────────────────────────────────────────────────────┐
│  PHILADELPHIA 76ERS                                     │
│                                                         │
│  Die Pacers haben entschieden, mit dem Angebot          │
│  mitzuziehen, dass du Paul George angeboten hast.       │
│                                                         │
│              [Leer  OK]                                 │
└────────────────────────────────────────────────────────┘
```

When user signs an RFA, prior team has Match window. 2K resolves this with a popup — "Pacers matched your offer for Paul George" or "Pacers passed, George signs with you."

**The key salary-matching subtlety:**
> "und eben mit salary mathcing wenn einem rfa ist bei einme team genommen"

When prior team Matches:
- If they're under cap → straight match.
- If they're over cap → they need a TPE / can use their **own Bird Rights** to exceed cap (this is the real CBA rule).
- If they have **no salary-matching tool** available → they cannot match, even if they wanted to.

Today's `runAIBirdRightsResigns` doesn't model the Match cap-room check. Need to add an "Is the prior team capable of matching this offer?" gate before showing the Match popup.

#### 2.10e  Accepted offers tracker (Bild #13)

After each Tag advance, accepted signings appear in the AKZEPTIERTE ANGEBOTE list with STATUS:
- `Vertrag` — signed, in the books.
- `Match` — submitted to prior team for RFA Match decision.
- `Wartend` — waiting on player decision (player shopping multiple offers).

#### Action needed for FA phase:
1. New `FreeAgencyView.tsx` wrapping the existing FA market UI.
2. **TAG counter** stored on `state.faBidding.fadayCounter` (1..13). Each tick advances the calendar by `(julyDays / 13)` but presents as Tag X/13.
3. Skip moratorium auto-magically — UI never shows "moratorium active, signings disabled." Tag 1 = first legal signing day.
4. Reuse `tickFAMarkets`, `runAIFreeAgencyRound`, `applyBirdRightsResignsPass` — but only fire on Tag advances, not on raw calendar days.
5. RFA Match popup wired through `pendingRFAOfferSheets` + `pendingRFAMatchResolutions` (already in state).
6. Live cap header — recomputes after every signing.
7. "Skip to end of FA" button = auto-advance all 13 Tage with AI fills.

### 2.11  TRAININGSLAGER (Bild #2)

- **Status today:** ✅ Training system fully built (`TeamTraining/` + `TrainingCenterView`).

- **2K UX:** Click row → enter Training Camp screen → assign drills/programs to players → "Done" → checkmark.

- **Action needed:**
  1. Surface existing `TrainingCenterView` as the phase sandbox.
  2. "Complete training camp" advances calendar from camp open (Oct 1) to opening night.

### 2.12  ZU NÄCHSTER SAISON VORRÜCKEN (Bild #2)

- Final row. Click → confirms all phases done → loads regular-season UI.
- This is the **handshake** that exits offseason mode and returns to the calendar UI.

---

## 3. The "Tag X/Y" counter pattern

> "scahu mal an tag in der oder mit der zeit welcher tag ist heute drunter"

Bild #15 shows it: **"FREE AGENCY - TAG 8/13"** in the footer. This is the entire trick that makes 2K's offseason feel coherent.

### Why it works

- Real calendar: July 1 → August 31 = 62 days. Lots of dead air.
- 2K compresses into **13 Tage** of meaningful FA activity.
- Each Tag = 1 user-driven advance:
  - User submits offers / negotiates
  - Click "Tag beenden" (End Day)
  - Calendar internally advances `~5 days` (62 / 13)
  - AI fires: signing wave + RFA matches + FA pool refresh
  - Wave summary popup: "12 Spieler signed. 3 RFAs matched. Stars X, Y, Z still on market."

### Generalize the pattern

| Phase | Tag-Counter? | Internal Days | Tage shown |
|---|---|---|---|
| Team/Player Options | No (instant) | 1 day | n/a |
| Qualifying Offers | No (instant) | 1 day | n/a |
| Draft | No (instant via existing view) | 1 day | n/a |
| Rookie Contracts | No (instant) | 1 day | n/a |
| **Free Agency** | **YES — Tag 1/13** | ~62 days | 13 |
| Training Camp | Could — Tag 1/14 | ~21 days | 14 (one per camp drill day) |

Only FA + Training Camp benefit from the Tag system because both have meaningful daily decisions. Everything else is instant.

---

## 4. Mapping to current codebase

### What we already have (just needs surface UI)

| 2K Phase | Existing implementation |
|---|---|
| Draft Lottery | `DraftLotteryView`, `useDraftEventGate` |
| Team/Player Options | `seasonRollover.ts §0a/§0b` (auto-decisions for AI) |
| Qualifying Offers | `restrictedFA` flag exists; QO amount calc TBD |
| My Free Agents | Filter by tid + contract.exp |
| Draft | `DraftSimulatorView` |
| Rookie Contracts | `computeRookieSalaryUSD`, `autoRunDraft` |
| Free Agency market | `faMarketTicker`, `AIFreeAgentHandler`, FA bidding modal |
| RFA Match | `pendingRFAOfferSheets`, `pendingRFAMatchResolutions` |
| Training Camp | `TeamTraining/` + `TrainingCenterView` |
| Season Rollover | `seasonRollover.ts` |

### What's net-new

1. `OffseasonAufgabenView.tsx` — the master checklist sidebar (Bilder #2/#7/#16).
2. `TeamPlayerOptionsView.tsx` — sandbox screen for §2.4.
3. `QualifyingOffersView.tsx` — sandbox screen for §2.5.
4. `MyFreeAgentsView.tsx` — read-only info for §2.6.
5. `RookieContractsView.tsx` — accept/decline rookies §2.9.
6. `FreeAgencyView.tsx` — wraps existing FA UI with Tag counter §2.10.
7. `OffseasonPhaseStore` — state slice tracking which checkboxes are filled, current phase, `pendingOptionDecisions`, `pendingQOSubmissions`, `faTagCounter`.
8. **Salary-matching gate** in `runAIBirdRightsResigns` for RFA Match capability check (§2.10d).

### What gets demoted

- Calendar-based PlayButton becomes read-only during offseason (or hidden).
- `ADVANCE_DAY` action gated during offseason (only Tag advances move time forward).
- `lazySimRunner` for offseason → only fires when user clicks "Skip to next phase" or "Tag beenden."

---

## 5. Implementation order (3 sessions)

### Session A — Foundation + Options + QO (smallest possible vertical slice)

1. New `state.offseasonChecklist` slice with phase enum + completed-flags.
2. `OffseasonAufgabenView` skeleton with all 12 rows (most show "Coming soon").
3. Wire DRAFTLOTTERIE row → existing view (already works).
4. `TeamPlayerOptionsView` — accept/decline UI for §2.4.
5. `QualifyingOffersView` — submit QOs UI for §2.5.
6. `MyFreeAgentsView` — read-only info screen for §2.6.

Validation: enter offseason, do options + QO + view FAs, exit. Calendar still ticks underneath.

### Session B — Draft + Rookies sandbox

7. Wire NBA-DRAFT row → existing DraftSimulatorView.
8. New `RookieContractsView` for §2.9.
9. Auto-skip BESUCH IM WEISSEN HAUS / PERSONALVERPFLICHTUNGEN / PRE-DRAFT-WORKOUTS rows.

Validation: complete draft + sign all rookies through the sandbox.

### Session C — Free Agency sandbox + Training Camp (the big one)

10. New `FreeAgencyView` with Tag 1/13 counter.
11. Refactor `tickFAMarkets` to fire on Tag advance instead of daily.
12. RFA Match capability gate (§2.10d salary-matching).
13. Wire TRAININGSLAGER row → existing `TrainingCenterView`.
14. ZU NÄCHSTER SAISON VORRÜCKEN exits offseason mode.

Validation: full offseason from championship → opening night, no calendar visible to user.

---

## 6. Why this kills our current bugs

| Current bug | Why this fixes it |
|---|---|
| "Stuck until free agency, nothing moving" | No more dead calendar days — user is in active phase UI throughout offseason |
| "Not all FAs are there on July 1" | FA pool snapshot taken at FA phase entry, after rollover + options + QOs all complete |
| "Watch Draft missing" | Draft phase row is always clickable until checked; user can't "miss" it |
| "MLE doesn't decrement" (already fixed S50) | VERBLEIBENDE MLE in dashboard makes wrong values immediately visible |
| Year-2 buggy because `ls.year` and calendar diverge | Phase checklist makes calendar invisible — `ls.year` is the only year |
| Date drift between subsystems (Sessions 1-5 [OSPLAN] DRIFT chase) | Phases atomic-transition; no daily race conditions |

---

## 7. The salary-matching subtlety (RFA Match)

> "und eben mit salary mathcing wenn einem rfa ist bei einme team genommen"

When user signs an RFA from another team, the prior team has 48-hour Match window. Today's `runAIBirdRightsResigns` always re-signs Bird-eligible players regardless of cap. That's wrong for the Match scenario.

**Real CBA rule for Match:**
1. Prior team has Bird Rights on the player.
2. They can match using Bird (exceed cap).
3. **BUT** they must absorb the 1st-year salary into their cap structure.
4. If matching pushes them over the **second apron** AND they have hard-cap triggers active → they CANNOT match.

**Implementation:**
```ts
function canMatchOfferSheet(team: Team, offer: OfferSheet, players: Player[]): boolean {
  // Bird Rights bypasses the cap entirely for the prior team
  if (player.hasBirdRights) {
    // BUT respect hard cap if team has triggered one
    if (team.hardCapForSeason?.applied) {
      const projectedPayroll = computePayrollWithMatch(team, offer);
      return projectedPayroll <= team.hardCapForSeason.ceiling;
    }
    return true;  // Bird + no hard cap = always can match
  }
  // No Bird Rights → must use cap room
  const capRoom = team.salaryCap - team.payroll;
  return offer.firstYearSalary <= capRoom;
}
```

Wire this into the Match popup (§2.10d) — only show "Pacers matched" if `canMatchOfferSheet()` returns true; otherwise auto-show "Pacers passed, you got him."

---

## 8. UI design language (matching 2K's screenshots)

To stay coherent with the screenshots:

- **Hero player card** template (used in Bilder #1, #3, #4, #5, #6, #8, #11) — portrait left, name centered with team color stripe, stat bullets right (ALTER, GRÖSSE, MORAL, FA-ART, GEWICHT, ERSCHÖPFUNG, VERTRAG, OPTION). Reuse our existing `PlayerHeroCard` component (already exists for `PlayerBioView`).

- **Sidebar checklist** (Bilder #2, #7, #16) — left rail, fixed width ~280px, rows with checkboxes, current phase highlighted yellow/orange. Reuse existing `LeftRail` pattern from `Commissioner Settings`.

- **Tag counter footer** (Bild #15) — sticky bottom bar, yellow text on dark, centered. New component.

- **Yellow/orange accent** for current phase + counts under threshold — matches our existing `text-yellow-400` / `text-amber-500` classes.

- **Notification popup** (Bilder #12, #14) — centered modal, dark gradient, single OK button. Reuse `Modal` component.

---

## 9. Deferred / future-only items

- BESUCH IM WEISSEN HAUS — flavor only, defer to news system enhancement.
- PERSONALVERPFLICHTUNGEN — needs full staff system first.
- PRE-DRAFT-WORKOUTS — combine already in `playerGen`; surface later as scouting view.
- Composite "promise" system (no-trade, role) — model in negotiation screen but only enforce mood penalties later.

---

## 10. Open questions

1. **Trades during offseason** — 2K allows them through a separate menu. Do we keep TradeMachine open during offseason phases? Probably yes, as a separate sidebar item.

2. **Lazy sim during offseason** — what happens if user clicks "skip entire offseason"? Should auto-resolve every phase with AI defaults (existing `seasonRollover` + `runAIFreeAgencyRound` defaults).

3. **Multi-season offseason** — when user advances to next season, does the checklist reset cleanly? Yes, all completed flags wipe at first day of new league year.

4. **Save/load mid-phase** — `state.offseasonChecklist` persists. Mid-FA save lands user back at Tag X with same offers pending. Test thoroughly.

---

## TL;DR

- 2K's offseason = **task list checklist** (Bild #2/#7/#16) with **sandboxed sub-screens** for each phase.
- Calendar still ticks underneath, but UI never shows raw dates during offseason — instead shows phase names and **"FREE AGENCY - TAG X/13"** style counters.
- Each phase has its own polished UI (hero card + table + actions) — already half-built in our codebase.
- Implementation: 3 sessions (Foundation/Options/QO → Draft/Rookies → FA/Training).
- Kills the "stuck", "missing FAs", "buggy July 1" cluster of bugs by making the dead-zone problem **structurally impossible** — there are no dead zones anymore, just phases.
