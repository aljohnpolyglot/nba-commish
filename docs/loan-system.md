# NBA Loan System — Design Doc

**Status:** design-only, not implemented. Greenfield feature.
**Scope:** NBA-only. External leagues (Euro/CBA/NBL/WNBA) out of scope for v1.
**Updated:** 2026-04-28

---

## 0. The whole thing in one sentence

Teams can rent each other's players during the regular season for cash, but a loaned player is **playoff-ineligible for both teams** that season.

That keystone rule does ~80% of the regulatory work. Everything else is logistics.

---

## 1. Rules (the CBA-style text — ~200 words)

1. **Consent.** A team may temporarily loan a player to another team during the regular season, subject to player consent.
2. **Playoff ineligibility.** Once loaned, the player is ineligible for postseason play with **either** team that season (sender or borrower).
3. **Contract stays home.** Loaned player's contract and full cap hit remain with the sender. Borrower pays a negotiated **loan fee** (cash, owner-to-owner, off-cap) plus a **5% loan bonus** to the player.
4. **Length.** Min 14 days, max = end of regular season. Available from opening night through last day of regular season — no artificial start deadline.
5. **Slot caps.** 2 outgoing + 2 incoming per team per season. Two-way contracts exempt.
6. **Roster mechanics.** Loan-out occupies a roster slot; sender may sign replacements normally up to 15 active. When the loaned player returns, sender has 48h to waive someone (standard dead-money rules). Borrower carries injury liability during the window. Season-ending injuries auto-terminate the loan.

---

## 2. Why playoff ineligibility is the keystone

| Abuse vector | Why it dies |
|---|---|
| Star rentals for a title run | Star is useless when it actually matters |
| Seeding manipulation | Self-defeating — your borrowed help vanishes in playoffs |
| Favor economies / debt-trading | Can't owe a debt for an asset that disappears at the worst time |
| Load-management exploits | Player ineligible for sender's playoffs too |
| Tank schemes | Tanking team is *genuinely* worse without the player; no manipulation needed |

Bird rights handle FA poaching naturally — sender can always outbid in summer. No extra rule.

---

## 3. Cap mechanics (Option A — pure simplicity)

- **Sender:** keeps 100% of annual cap hit. Receives loan fee in cash (off-cap, off-books).
- **Borrower:** loan fee + 5% player bonus + insurance premium, all **above-cap expenses**. Cap status (apron, hard cap, lux) does **not** restrict ability to borrow.
- **No in-window cap relief, no future cap exceptions.** Cash is the entire compensation.

> "Borrower rents the present. Sender owns the future."

| | Borrower | Sender |
|---|---|---|
| Player's services this window | ✅ | ❌ |
| Cap hit | ❌ | ✅ |
| Bird rights / future contract | ❌ | ✅ |
| In-loan medical (day-to-day, mid-term) | ✅ | ❌ |
| Long-term / season-ending medical | ❌ | ✅ |
| Cash | Pays | Receives |

---

## 4. Loan fees — unregulated

No fee schedule. No tier system. No league-office approval. **GMs negotiate.** Cash, pick swaps, conditional bonuses, swap-loans, side handshakes — all permitted. Market discovers prices over years; fleecings are content.

---

## 5. Injury handoff

| Scenario | Who handles |
|---|---|
| Day-to-day (sprain, soreness) | Borrower's medical staff. Player returns when healthy, finishes window. |
| Mid-term (2–6 weeks, returns within window) | Borrower rehabs. Otherwise borrowers would dump every tweak back on senders. |
| Season-ending (ACL, etc.) | **Loan auto-terminates on diagnosis.** Player flies home; sender owns long-term rehab. Sender owns the player's future contract — they own the future health. |

**No re-borrowing once terminated.** Prevents borrowers from "pausing" loans during meaningless games. A new loan can be negotiated but counts against season slot caps.

---

## 6. Roster display

```
TEAM: Boston Celtics
─────────────────────
Standard:    15/15
Two-Way:      3/3
Loan In:      2/2
Loan Out:     0/2
```

Public, transparent. New column on Spotrac/BR. League-wide loan tracker page.

---

## 7. Calendar

- **Oct–Jan:** quiet. Mostly development loans + early injury replacements.
- **Late Jan / early Feb:** **Loan SZN begins.** Standings clarify, play-in race tightens.
- **Feb–Mar:** bulk activity. Operates **in parallel** with the Feb trade deadline — two distinct asset markets (permanent vs temporary).
- **Mid-April:** play-in stacks up. Four temporary superteams collide. Loans end at regular-season close.
- **Playoffs:** pure rosters. Borrowed players ineligible.
- **June:** off-season. No carryover except sender's Bird rights (unchanged).

---

## 8. Implementation plan (sim-side)

### 8a. Schema additions (`src/types.ts`)

- `Player.loanState?: { senderTid: number; borrowerTid: number; startDate: string; endDate: string; feeUSD: number; bonusUSD: number; playoffIneligibleSeason: number }` — single source of truth on the player object. Null = not on loan.
- `Player.playoffIneligibleSeasons?: number[]` — accumulated across career; checked by playoff seeding/roster eligibility. Persists after loan ends so a Feb-loaned player can't suit up in April.
- `state.loans: Loan[]` — league-wide registry for the tracker UI + season-slot accounting (mirrors per-player flag, but keeps fee/terms after expiry for history).
- Per-team counters (`loanInCount`, `loanOutCount`) — **derived** from `state.loans`, not stored. Same pattern as `team.players` doesn't exist (README §State Model).
- **`tid` semantics:** loaned player's `tid` flips to **borrower** during the window (so existing `state.players.filter(p => p.tid === team.tid)` queries Just Work for rosters, sim, box scores). `loanState.senderTid` is the only handle on the "true home." Cap-hit accounting reads `loanState.senderTid` first, falls back to `tid`.

### 8b. Economy settings (`leagueStats.economy` + EconomyTab)

Following the EconomyTab.tsx pattern — every loan rule is a toggleable league setting so commissioners can disable the system entirely or relax limits:

```ts
loanSystemEnabled: boolean              // master toggle, default true
loanMinDays: number                     // default 14
loanMaxOutgoingPerTeam: number          // default 2
loanMaxIncomingPerTeam: number          // default 2
loanPlayerBonusPct: number              // default 5 (% of prorated salary)
loanWaiveWindowHours: number            // default 48 (return → forced roster move)
loanPlayoffIneligibilityEnabled: boolean // default true — the keystone, but toggleable for sandbox
loanTwoWayExempt: boolean               // default true
```

New section in `EconomyTab.tsx` between "Trade Exceptions" and "Dead Money & Waivers" — same `bg-slate-800/40 ... rounded-3xl` card style, `Coins`/`HeartPulse`-style lucide icon, sliders for the numerics, and italic NBA-default footnotes ("NBA proposal: 14 days min").

### 8c. Action surface

New reducer actions in `src/store/logic/actions/loanActions.ts` (new file, mirrors `tradeActions.ts`):
- `PROPOSE_LOAN` — borrower → sender; payload includes negotiated fee, length, optional pick-swap.
- `ACCEPT_LOAN` / `REJECT_LOAN` — sender side, plus consent check on player (mood/agent gate, reuse trade-veto infra).
- `EXECUTE_LOAN` — flips `tid` to borrower, writes `loanState`, sets `playoffIneligibleSeasons`, transfers cash, logs `state.history` entry.
- `RETURN_LOAN` — natural expiry, end of regular season, or manual recall. Restores `tid` to `senderTid`, opens 48h waive window if sender is at 15/15.
- `TERMINATE_LOAN_SEASON_ENDING` — fired from injury handler when season-ending diagnosis is set; same as RETURN_LOAN but skips the 48h waive grace (sender expected this body back).

### 8d. Files likely touched

- `src/store/logic/actions/loanActions.ts` — **new.**
- `src/services/AITradeHandler.ts` — extend for AI-side loan proposals (separate channel from trades, reuses GM-attribute scoring).
- `src/services/logic/seasonRollover.ts` — clear active `loanState`, reset season slot counters, archive `state.loans` to a history bucket. **Do NOT clear `playoffIneligibleSeasons`** — it's career-cumulative for trivia/UI.
- `src/services/logic/simulationRunner.ts` + `lazySimRunner.ts` — playoff-roster-build gate must filter `playoffIneligibleSeasons.includes(currentYear)`. Per README §Simulation Engine, both paths share `runLazySim` so single edit point.
- `src/services/logic/autoResolvers.ts` — daily tick: auto-return loans on their `endDate`, fire RETURN_LOAN.
- `src/components/modals/` — new `LoanProposalModal.tsx` (mirrors `TradeMachineModal.tsx`) + `LoanReturnModal.tsx` (the 48h waive UI).
- `src/components/central/view/LoanTrackerView.tsx` — **new** league-wide loan board, plumb through `MainContent.tsx` tab routing + `NavigationMenu.tsx`.
- `src/components/central/view/TeamOffice/pages/LoanBlock.tsx` — **new** page, mirrors `TradingBlock.tsx`. GM-mode: read-only on non-own teams (same gate as TradingBlock per README Session 25).
- Roster summary chips — every place that renders `15/15` (StandingsTable, TeamOffice/Home, NBACentral) extends to show the new 4-line block. Grep for `maxStandardPlayersPerTeam` to find them.
- `src/components/commissioner/rules/view/EconomyTab.tsx` — new "Player Loans" section + the props/setters above wired into `RulesView` parent.

### 8e. Save-scoped considerations

Loans live in `GameState`, so they ride `state.saveId` automatically — no extra save-scoping work needed (per README §Persistence). Only watch out: if we add a per-save UI preference like "hide expired loans in tracker," that goes through the `gameplanStore` pattern, not a global localStorage key.

### 8f. Rating / unit gotchas

- Cash fee stored in **USD** (not BBGM thousands). Avoid the `contract.amount × 1000` mistake — loan fees are owner-to-owner, never touch the contract object.
- Player consent thresholds use **K2 scale** for AI consent logic ("stars more likely to refuse low-fee loans"), per CLAUDE.md unit gotchas.
- 5% loan bonus computed off **prorated USD salary**, not contract.amount. Use `salaryUtils.getCurrentSeasonSalaryUSD(player)`.

### 8g. AI behavior (later phase)

GM AI loan logic mirrors trade AI but with simpler value math:
- **Tankers (sender bias):** willing senders for cash. Use `gm.spending` and team standing.
- **Contenders / bubble (borrower bias):** target rotation help. Gate on injury holes + standings position. Late Jan onward.
- **Star loans:** AI almost never loans top-3-on-roster (the playoff-ineligibility cost is real even for tankers — they'd rather keep the player marketable for trade).

---

## 9. Sim/UI integration touch points (from README §Common Pitfalls)

- **`tid` flip:** keep this the only mutation. Box scores, schedule, sim engine all read `state.players.filter(p => p.tid === team.tid)` — flipping `tid` keeps every existing query honest with zero engine edits.
- **External leagues out of scope:** loan proposals must reject any player with `tid >= 100` or `tid >= 1000`. Bird rights / FIBA buyout pipelines are unrelated and would tangle.
- **Free Agents / Prospects:** `tid === -1` (FA) and `tid === -2` (prospect) cannot be loaned — must be on a team.
- **Transaction history:** every loan event writes to `state.history[]` with a new `'LOAN_OUT' | 'LOAN_IN' | 'LOAN_RETURN' | 'LOAN_TERMINATED'` type. TransactionsView gets new filter chips.
- **News feed:** EXECUTE_LOAN fires a `state.news[]` item; AI-initiated loans during "Loan SZN" (late Jan onward) get a Shams/Woj-flavored social post via `services/social/`.

---

## 10. Open questions

1. **Player-consent model.** New mood gate, or piggyback on existing trade-veto/no-trade-clause infrastructure? Trade infrastructure is closer fit (player can refuse).
2. **G-League interaction.** If a borrowed player gets sent to *the borrower's* G-League affiliate, who pays? Default: borrower (they have control during the window).
3. **Rookie-scale + super-max eligibility.** Loaning interrupts continuous service-time? Default: **no** — service time accrues with sender; loan is invisible to CBA service-time math.
4. **Two-way exemption details.** "Exempt from slot caps" is clear; but can a 2W player be loaned at all, or is the existing 2W call-up structure already covering this? Default: **2W players cannot be loaned** (would be redundant).
5. **AI–AI loan auto-execution cadence.** Daily tick like trades, or weekly?
6. **Loan-out and trade in the same window.** If a player is on loan, can sender trade them mid-window? Default: **no** — must recall (terminate) first, costs slot.

---

## 11. Phased rollout

1. **Phase 1 — Schema + manual GM flow.** User can propose/accept loans against AI; AI evaluates with simple cash-only valuation. Playoff ineligibility enforced. No AI-initiated loans.
2. **Phase 2 — AI-initiated loans.** AI tankers and contenders propose loans on their own ticks. Loan tracker view live.
3. **Phase 3 — Polish.** Conditional fees, pick-swap loan compensation, loan-bidding (multiple borrowers competing for one player), broadcast/news flavor (Shams/Woj loan tweets).

---

## 12. The vibe

Started with 8+ rules, eligibility tiers, trade cooldowns, age restrictions, guarantee rules, fee schedules, and start deadlines. Stress-tested everything down to: **one keystone rule + one economic engine + a few logistics rules + GMs being GMs.**

Solves tanking, develops young players, saves veteran careers, makes the play-in must-watch TV, exposes GM skill in real time, and adds a new strategic dimension to the regular season — without compromising playoff competitive integrity.
