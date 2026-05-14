# Codex `/goal` Handoff — Euro Mode Wrap-Up

> Paste the prompt block at the bottom into Codex CLI via `/goal`. The user is going to sleep — Codex should run independently until **all stopping conditions** are met.

## Context Codex Needs to Read FIRST

Before writing a single line of code, Codex must read in this order:

1. **`README.md`** — project overview + setup commands
2. **`CLAUDE.md`** — project rules (German communication, AskUserQuestion before non-trivial slices, UI-internals stay internal, etc.). Critical-mistakes-list ist load-bearing.
3. **`package.json`** — npm scripts for type-check + tests
4. **`plans/euro-medical-dynamic-tier.md`** — the locked-in v2 plan with all ACs (M-series Medical, C-series Cash-Gate, S-series Min-Salary)
5. **`TODO.md`** — current backlog, especially `NEXT SESSION` block
6. **`CHANGELOG.md`** Session 60+ entries — what's shipped, what regression-baseline looks like
7. **Memory at** `C:\Users\user-MSI\.claude\projects\C--Users-user-MSI-Downloads-nba-commish\memory\`:
   - `MEMORY.md` — index of all memory entries
   - `project_euro_bankruptcy_progression.md` — bankruptcy-as-progression philosophy (locked design)
   - `feedback_ui_internals.md` — never expose raw multipliers in UI
   - `feedback_planning_workflow.md` — vertical-slice plans, AC sign-off
   - `feedback_tooltip_style.md` — tooltip writing conventions
   - `project_euro_*.md` — older Euro context if relevant
8. Already-shipped code Codex must NOT regress:
   - `src/components/central/view/FrontOfficeView.tsx`
   - `src/services/tycoon/sponsorshipEngine.ts`
   - `src/services/tycoon/budgetEngine.ts`
   - `src/components/tycoon/SponsorshipCard.tsx` + `SponsorshipNegotiationModal.tsx` + `MedicalCard.tsx` + `TravelLogisticsCard.tsx`
   - `src/services/tycoon/medicalEngine.ts` + `migrate.ts`

## What's Already Done (Phase 1 — do NOT redo)

- **AC-S1, AC-S5** Euro-mode salary handling landed in `src/utils/salaryUtils.ts:945-965` (new isEuroMode branch — Min: $290K USD default, MAX: $100M soft-ceiling = effectively uncapped per user design) and `src/services/AIFreeAgentHandler.ts:1175-1182` (`getMinSalaryUSD` Euro-mode branch).
- **AC-S2** `euroMinSalaryUSD: 290_000`, `euroMaxSalaryUSD: 5_400_000`, `euroleagueBRL: 10_900_000` added to `EURO_ISOLATED_DEFAULTS` in `src/constants.ts` and `LeagueStats` type in `src/types.ts:300-308`. **Note:** `euroMaxSalaryUSD` is now only used as a Commissioner-Settings "soft target" — `getContractLimits` ignores it and uses 100M ceiling (uncapped) per the bankruptcy-as-progression locked design.

## ⚠️ CRITICAL CONSTRAINTS (read before any code)

These apply to ALL goals, override anything else:

1. **FM Lite, NOT full FM.** Keep scope tight — implement *only* what's in the AC list. Don't add staff hiring chains, contract negotiation drama, multi-year sponsorship bidding wars, or other FM-deep features unless explicitly listed. The goal is a *playable, user-friendly* slice — not Football-Manager parity.

2. **DO NOT break NBA mode.** Every change must be gated on `uiMode === 'euro_isolated'`. Before declaring Phase 2/3 done, load an existing NBA save and verify: trades work, FA signings work, draft works, salary cap UI displays correctly, MIN/MAX in SigningModal still reads from `minContractStaticAmount`. A regression in NBA mode is a STOP condition — write `BLOCKED.md` immediately.

3. **Read these BEFORE touching code (in addition to plan files):**
   - `README.md` at repo root — project overview + setup
   - `package.json` — npm scripts for build/test
   - Any docs in `plans/*.md` referenced by name in this goal

4. **Calendar coordination: NBA and Euro/Endesa run on SEPARATE rules.**
   - NBA: Oct preseason → Apr regular-season end → Jun Finals → Jul FA → Sep training camp
   - Euro: Sep 14 training camp → Sep 28 Endesa start → midweek Euroleague + weekend Endesa → May Final-Four → Jun Endesa Playoffs → Jul-Aug short offseason
   - They share calendar infrastructure (`seasonRollover.ts`, `OffseasonChecklistRow`, `simulationHandler`) but use league-specific dates from `EURO_ISOLATED_DEFAULTS` and `nonNBATeams`.
   - **DO NOT** introduce logic that assumes NBA calendar in Euro paths or vice-versa. Every date math in Euro mode reads from `leagueStats.uiMode === 'euro_isolated'` branch.
   - If you touch a calendar/rollover function, search for `uiMode` references to confirm both paths still work.

5. **User must not get lost.** Every new UI surface must:
   - Have a clear "← Back" or breadcrumb path
   - Be reachable from existing navigation (don't bury features in modal-of-modal)
   - Have a one-sentence prose description at the top (e.g. "Adjust hotel and flight preferences for the upcoming season")
   - Use existing visual language (cards with `rounded-2xl border border-slate-800`, headers with `text-xs font-bold uppercase tracking-widest`, etc.)
   - NO new top-level routes without adding the sidebar entry in `NavigationMenu.tsx`

6. **NO MAX-CONTRACT in Euro mode.** Already coded — `SigningModal` MAX = $100M ceiling (UI shows ~€92M slider top). User can offer Mike James €50M if they want. Bankruptcy is the cap. **DO NOT re-add a max cap as part of "polish" or "realism" — it was explicitly vetoed.**

7. **Design North Star: BBGM × FM × FIFA Hybrid.** User-Quote: *"denk als ob ddu bist ein game tester oder youtuber und ja alles musst sinnn macht... user friendly aber kompliziert"*. For every screen, every modal, every interaction, ask:
   - **BBGM-lens** (sim depth): Does the underlying math still feel authentic? Are the numbers grounded in real basketball/finance reality? Would a sim-nerd respect it?
   - **FM-lens** (management depth): Does the decision matter? Are there trade-offs? Is there a clear cause-effect chain (this signing → that cash drain → that mood shift → that performance dip)?
   - **FIFA-lens** (polish + feel-good UX): Is the click satisfying? Does it look good? Is the feedback immediate and clear? Would this look good in a YouTube highlight reel?
   - **Game-tester lens**: Could a new user navigate this without confusion? Is there a "huh?" moment? A missing back-button? An unexplained number? Fix it.
   - **YouTuber lens**: Would this scene make a good "look at this!" moment? Is the drama legible? Does failure feel narratively meaningful (bankruptcy = real stakes, not just a number going red)?

   Concrete heuristics:
   - Every new screen: would I understand it in 5 seconds? if not, add a 1-line subtitle
   - Every new number: is it labeled with prose (no raw multipliers)? does it have a color cue (🟢🟡🔴)?
   - Every new modal: does dismissing it feel safe (no surprise destruction)?
   - Every new feature: does it create a story moment (LeBron-to-Madrid, bankruptcy game-over, Wilkins-effect promotion)?
   - Complexity is OK — but only when layered (easy to start, deep to master). NEVER dumb things down to hide complexity; surface it gracefully.

   Codex should self-audit each completed Goal against these lenses before marking it done in PROGRESS.md. If any lens fails, iterate before claiming completion.

Codex starts from **AC-S3 + AC-S4** (Commissioner Settings UI for Euro overrides) and continues through Phase 2 + Phase 3 + extras.

## 🎨 NORTH-STAR UI MOCKUPS

> **The user dropped TWELVE polished FM-style mockups as design targets. Codex MUST view each image with its image-reading tool BEFORE writing any UI code for the corresponding Goal. The textual descriptions below are a fallback only — the images are the authoritative spec.**

**Files (Codex must open ALL TWELVE with image-view tool before starting Goal 0):**
- `public/img/ui/frontofficeviewui.png` — Front Office Overview tab (Goal 0)
- `public/img/ui/sponsorsviewui.png` — Front Office Sponsorships sub-tab (Goal 0 sub-nav + Goal 18 entry point)
- `public/img/ui/facilitiesviewui.png` — Front Office Facilities sub-tab (Goal 0 sub-nav)
- `public/img/ui/financesviewui.png` — Front Office Finances sub-tab (Goal 0 sub-nav + Goal 11)
- `public/img/ui/staffviewui.png` — Front Office Staff sub-tab + side panel (Goal 15)
- `public/img/ui/staffsigningui.png` — Staff Signing Detail-Modal with negotiation sliders (Goal 15 sub-flow)
- `public/img/ui/scheduleview.png` — Schedule Hub All-Competitions landing (Goal 9)
- `public/img/ui/calendar view.png` — Schedule Hub Monthly Calendar tab (Goal 9)
- `public/img/ui/euroleagueschedule.png` — Schedule Hub Competition-Detail drilldown (Goal 9)
- `public/img/ui/travellogisticsview.png` — Travel & Logistics Full-Page (Goal 9b)
- `public/img/ui/medicalview.png` — Medical & Recovery Full-Page (Goal 2 — upgrades existing MedicalCard to dedicated route)
- `public/img/ui/sponsornegotiation.png` — Deep Sponsor-Negotiation Modal (Goal 18 — replaces existing SponsorshipNegotiationModal)

### 🚨 MANDATORY IMAGE-VIEW PROTOCOL

**Before implementing ANY of Goals 0, 2, 9, 9b, 11, 15, 18:**
1. Use your image-reading tool (Read/view on PNG files works in Codex CLI) to actually LOAD and INSPECT the relevant mockup file from disk
2. After viewing, write a short "What I observed" note in PROGRESS.md — list 5-8 concrete UI elements you saw (colors, layout, components, copy text). This proves you actually viewed it.
3. Cross-reference your observations against the textual description in this file. If they conflict → trust the image. If you couldn't load the image, write `BLOCKED.md` and STOP — do not implement UI from text-only spec.
4. Match the mockup's:
   - **Color palette** (dark-slate cards, specific accent hues per section — verify them, don't guess)
   - **Layout grid** (column counts, card sizes, sidebar widths)
   - **Typography hierarchy** (header sizes, label tracking, monospace tabular nums)
   - **Visual elements** (Sankey diagram shape, donut chart styling, gauge variants, attribute-bar height/spacing, badge shapes)
   - **Copy tone** (German preferred, but UI labels match mockup language for that section)

**Why this is non-negotiable:** Text-from-mockup is lossy. The mockups encode aesthetic decisions (gradient direction, exact spacing, icon-vs-label balance) that no description captures. Building from text alone produces "looks vaguely like FM but worse" output — the user will reject it.

**Visual language shared across all twelve mockups:**
- Dark-slate background (`bg-slate-950` page, `bg-slate-900/70` cards), `border-slate-800` borders, `rounded-2xl` corners
- Accent color per section (amber for tier/board, emerald for revenue/positive, rose for expenses/negative, indigo for navigation, purple for star-power)
- Soft glows on key CTAs and active elements
- Prose labels everywhere (e.g. "Strong Global Brand", "Excellent Fit", "Elite Performance Lab") — NO raw multipliers in user-facing UI
- Attribute bars: thin horizontal, 6-8px tall, colored fill on slate background
- KPI cards: large number top, label small caps tracking, delta with arrow icon + percentage
- Action buttons: rectangular, font-black uppercase tracking-widest, accent border + hover-state
- Modals: full-screen overlay on `bg-black/80 backdrop-blur-md`, primary card with accent-border

### Front Office Overview layout (frontofficeviewui.png):

**Layout described (Codex should examine the PNG before designing any new screen):**
- Left sidebar: brand header + nav rail with icons (Overview / Sponsorships / Finances / Facilities / Staff / Board Goals / Reports) + user-club card at bottom (logo + tier + Cash on Hand + Reputation)
- Header: club logo + name + tier badge, Season selector pill, STAR POWER stat card (multiplier + ⭐⭐⭐⭐⭐), View-Ledger CTA button
- KPI row (5 cards): Total Revenue / Total Expenses / Projected Profit / Year-End Cash / Profit Margin — each with delta vs last season + sparkline OR radial gauge
- **Sankey diagram** central: revenue sources (Matchday / Sponsorships / TV / Prize) flow into central Profit node, out to expense buckets (Wages / Staff / Facility / Travel / Medical / Finance Costs)
- Sponsorship Portfolio: 8-card grid with brand logos, slot label, value, grade badge (A/B/B+)
- Ticket Pricing card: slider + estimated matchday revenue + tip line
- Medical & Recovery card: budget number + health-outlook gauge with prose label
- Travel & Logistics card: preference badge (BALANCED/PREMIUM/ECONOMY) + away-game counts + Manage CTA
- Ledger History: stacked-bar chart (Revenue green / Expenses red / Profit line yellow) over 5 seasons + key-stat tiles (5Y Profit, Best/Worst Season)
- All cards use dark-slate background, accent colors per category, soft glows, rounded-2xl

### Sponsorships Sub-Tab layout (sponsorsviewui.png):
- **Header**: "SPONSORSHIPS" title + subtitle "Manage your partnerships and maximize revenue" + KPI row (Total Sponsor Income €X.XXM, Active Deals X/8, Avg Brand Match ⭐ rating, Net Schedule €X.XXM)
- **Brand-Strength meter** at top of main column: prose label like "Strong Global Brand" / "Regional Reach" / "Local Presence" with score bar (derived from `starPower` + `cityPrestige` + recent success + Tier)
- **SPONSORSHIP PORTFOLIO** 8-card grid (8 slots from `ALL_SLOTS` in `types/tycoon.ts`):
  - Each card: Brand logo placeholder (sponsor name on accent-colored hexagon if no logo asset), slot name (Kit / Front / Back / Sleeve / Shorts / Arena / Digital / Court), value/yr, years remaining, status-dot (green=active, amber=expiring ≤1yr, red=expired), grade badge (A+/A/B+/B/C from `value / TIER_BASE[tier].sponsorshipFloor[slot]`)
  - Click card → highlights it → right-panel switches to that sponsor's details
- **AVAILABLE SLOT** placeholder card (+ icon, "No deal in this slot — Browse Market") for any slot with `sponsorship === null`
- **SPONSORSHIP INSIGHTS** panel: 2-3 prose bullets generated from analysis:
  - If a deal's value < 70% of market floor → "Your {slot} deal is below market for your performance level"
  - If 2+ slots expiring same year → "Multiple deals expiring next season — start negotiating now"
  - If star roster + small sponsor → "Your star power isn't reflected in sponsor revenue yet"
- **DEALS EXPIRING SOON** table — sortable rows of upcoming expirations (yearsRemaining ≤ 2):
  - Columns: Sponsor logo+name | Slot | Value/Year | Expires (Year-Month) | Action button (Renew Now / Negotiate / View)
- **Right column — SELECTED SPONSOR panel** (defaults to top revenue or last-clicked):
  - Large brand logo + name
  - "Sign Until {year} · {N} Years" status pill
  - **DEAL BREAKDOWN** donut chart (Recharts PieChart) with center total: slices for Base Value, Signing Bonus (amortized over years), Performance Bonus pool
  - **PERFORMANCE CLAUSES** progress bars showing each clause's payout potential vs achieved
  - **NEXT ACTIONS** buttons: "Negotiate Early" (opens Goal 9 modal), "Activation Schedule" (future), "View Brand Profile" (future)
- **"Find New Sponsors"** primary CTA button — opens market browser for unfilled slots

### Facilities Sub-Tab layout (facilitiesviewui.png):
- **Header**: "FACILITIES" title + subtitle "Manage and upgrade your club's infrastructure and facilities" + KPI row (Total Upkeep €X.XXM, ROI rating, Club rating ⭐)
- **Main column — 6-Card Facilities Grid** (2 rows × 3 cols). Each facility card has: name header, large numeric Rating (60-99) in top-right corner, 4-6 sub-attribute progress bars, "View Details" link footer:
  - **TRAINING CENTER** — Strength Training / Conditioning / Skill Development / Practice Court Quality / Recovery Pool. Maps to existing `tycoon.facilities.trainingCenter.level`
  - **MEDICAL & RECOVERY CENTER** — Recovery Tech / Physio Quality / Diagnostics / Rehab Equipment / Cryo & Hyperbaric. **NEW** — composite read from `medicalBudget` (Goal 2) + `headPhysio` staff attrs (Goal 15) + `headOfSportsScience` staff attrs. No new facility level field needed; rating derived from these inputs.
  - **YOUTH ACADEMY** — Talent ID / Coaching Pipeline / Boarding Quality / Education / Pathway Stats. Maps to existing `tycoon.facilities.academy.level`
  - **ANALYTICS LAB** — Data Quality / Video Tools / Opponent Prep / Stat Models / Realtime Dashboards. **NEW** — composite from `headOfAnalytics` staff attrs (Goal 15) + small `analyticsBudget` slider field on tycoon (default €100K). If staff not hired → low rating.
  - **ARENA & FAN EXPERIENCE** — Capacity / Premium Seats / Concessions / Atmosphere / Media Facilities. Maps to existing `tycoon.facilities.stadium.level` + `.capacity`
  - **TRAVEL & LOGISTICS HUB** — Fleet Quality / Hotel Tier / Flight Tier / Recovery on Road / Travel Time Optimization. **NEW** — composite from existing `tycoon.travel` tiers (already exists from prior sponsorship phase)
- **Right column — OPERATIONAL INSIGHTS panel**:
  - 4-5 bullet items derived from facility ratings: "Training capacity at 88%" (use levels), "Recovery time 12% above league avg", "Youth academy attracting more prospects this cycle", "Stadium capacity needs expansion"
  - **FACILITY MASTERPLAN** section: multi-phase upgrade roadmap. Each pending upgrade in `facilities.{key}.upgradePending` renders as a row with stage name, estimated cost, completion year, "View Masterplan" link CTA
- **Center-Bottom — CLUB PERFORMANCE Radar Chart** (Recharts `RadarChart`):
  - Axes: Stadium Experience / Player Development / Sponsorship Appeal / Brand Visibility / Recovery & Health / Analytics Edge (6 axes matching the 6 facilities)
  - Center labeled "CLUB SUCCESS"
  - Each axis-value derived from corresponding facility rating + small modifier from related staff/sponsor presence
  - Visual: filled polygon on dark-slate background with accent gradient
- **Footer Action Row** (button strip): Upgrade Facility (opens facility-upgrade modal — reuse existing pattern from current tycoon code), View Blueprints (future placeholder), Hire Architects (future placeholder, shows "Coming Soon"), Compare League Average (small comparison modal), Infrastructure Report (text summary modal)
- **NEW state fields** (add to TycoonState):
  - `analyticsBudget?: number` (€50K – €500K range, default €100K — small slider on the Analytics card's detail view, can wait to Goal 11 polish)
  - Computed `medicalCenterRating`, `analyticsLabRating`, `travelHubRating` helpers in `medicalEngine`/`staffEngine`/`travelEngine` — pure functions
- **MIGRATION**: existing saves keep their current facility levels; new derived ratings compute on-the-fly. No data loss.

### Staff page layout (staffviewui.png):
- **Header**: "STAFF" title + Tier-Badge, Subtitle "Manage your coaching, performance and support team", Season-pill, KPIs row (Total Staff X/15, Annual Cost €X.XXM, ⭐⭐⭐⭐⭐ Avg Skill, Open Roles count)
- **Left/Main column — Two grouped sections:**
  - **COACHING & PERFORMANCE** (4-col grid): Head Coach / Assistant Coach / Head of Sports Science / Head Physio. Each card: portrait avatar, name (with PERSONALITY pill below e.g. "ELITE", "RISING"), age, contract years remaining, 5 attribute mini-bars (Offense/Defense/Tactics/Development/Conditioning), signature-trait pills, click-to-detail
  - **SCOUTING & ANALYTICS** (3-col grid): Chief Scout / Head of Analytics / Open Position placeholder cards (with + icon and "Hire Coach" CTA)
  - Footer row: Staff Directory link, "Hire Staff Member" primary CTA
- **Right column — HIRE STAFF MEMBER panel** (collapsible):
  - Tabs: Candidates / Filters / Compare
  - **Select Role** Tab-Strip — 6 roles matching `StaffRole` in `src/TeamTraining/types.ts`:
    Head Coach / Assistant Coach / Head of Sports Science / Head Physio / Chief Scout / Head of Analytics
  - **Role Focus** prose paragraph explaining what this role does
  - **Key Attributes** section: 4-5 most-relevant attribute bars (e.g. Head Coach → Tactics / Man Management / Motivating / Discipline)
  - **Soft Skills** section: 4-5 secondary attribute bars
  - **Budget Information**: Recommended Salary Range, Available Budget
  - "Find Candidates" CTA → opens candidate-list modal
- Sidebar shows user-club card + Cash on Hand (live-updating) + Reputation rating

### Staff Signing Detail-Modal layout (staffsigningui.png):
Triggered when user clicks a candidate from the right-side panel in staffviewui.png. Full-screen 3-column modal:
- **Top bar**: "NEW STAFF SIGNING" title, 3 tabs (Profile / Offer / Review), Available Budget shown top-right
- **Left column — SELECTED ROLE & TOP CANDIDATES**:
  - Role badge with Key-Attribute mini-pills
  - Scrollable list of 5 top candidates (portrait + name + role + €cost), selected one highlighted
  - "See All Candidates" link at bottom
- **Center column — CANDIDATE PROFILE**:
  - Portrait, name, role, ⭐ Class rating, Experience years, age, hometown
  - **Personality quote/philosophy** — prose generated from attributes (see `staffFallback.ts` for any existing snippets, otherwise template-based: high `manManagement` + low `levelOfDiscipline` → "calming approach", high `motivating` + high `determination` → "fiery competitor", etc.)
  - **Attributes grid** (15 attrs from `StaffAttributes`): horizontal bars grouped Technical / Mental / Personal
  - **Coaching Philosophy** bullets (template-derived: top-3 attrs → bullet sentences)
  - **Career History** timeline — for v1 use synthetic 3-4 fake past clubs from `fictionalStaffGenerator.ts` if not already there
  - **Past Teams** logo strip (placeholder logos)
  - **Scout Report** prose paragraph (template-based, no LLM in v1)
  - **FIT WITH YOUR CLUB** meter (0-100%) — algorithm: compare staff's strongest attributes vs club's playstyle/tier; output % + 2-3 bullet reasons (e.g. "Excellent for development-focused Tier C clubs", "Could clash with veteran-heavy roster")
- **Right column — NEGOTIATION panel**:
  - Tip-hint box on first open ("Tip: longer contracts unlock higher signing bonuses but lock you in")
  - **CONTRACT TERMS** (3 sliders matching mockup):
    - Salary slider (€X.XXM, candidate-specific min/max range)
    - Contract Length slider (1-5 years)
    - Signing Bonus slider (€0 — Length-dependent max)
  - **PERFORMANCE BONUSES** checklist (optional toggleable clauses): "Endesa Top-4 +€100K", "Euroleague QF +€200K", "Develop 2 youth starters +€150K"
  - **CLASS** Rating shows what tier of staff you're offering (Elite / Strong / Adequate / Underwhelming) based on salary-vs-market
  - **PACKAGE PREVIEW** at bottom: Base Salary / Contract Length / Total Bonus / TOTAL PACKAGE big-number
  - Action buttons: "Reset Offer" + "Submit Binding Offer →"
- **Negotiation feedback**: as sliders move, candidate-mood-indicator updates in prose (matching Goal 9 sponsor-negotiation pattern). Lowball → candidate walks away or counter-demand; Premium → instant accept; Fair → accept with conditions.
- **Accept flow**: confirms → adds StaffMember to `team.staffing[role]`, ledger `expenses.staff` updates, news-feed event ("Xavi Pascual joins as Head Coach on a 4-year deal worth €2.75M"), boardConfidence shift if salary above budget

### Finances Sub-Tab layout (financesviewui.png):
- **Header**: "FINANCES" title + subtitle "Full financial overview and budget management", Season-pill, Tier-Badge
- **KPI row (4 cards)**: Total Revenue Projected (€X.XXM, ↑/↓ delta), Total Expenses Projected, Projected Profit, Profit Margin (radial gauge with % center)
- **BUDGET OVERVIEW** strip: total budget €X.XXM headline + segmented progress bar (Wages / Staff / Facility / Travel / Medical / Finance-Costs) colored slices with legend
- **Center — large detailed Sankey diagram**: "WHERE THE MONEY COMES FROM & GOES" — more granular than Overview tab's mini Sankey. Revenue nodes (Matchday / Sponsorships [split per slot] / TV / Prize / Misc) flow into central Profit node, out to Expense buckets. Hover shows exact € amount per flow.
- **FINANCIAL PERFORMANCE 5-Year Bar Chart**: Recharts ComposedChart — green bars = Revenue, red bars = Expenses, yellow line overlay = Profit. X-axis = season year, tabular Y-axis labels in millions
- **KEY FINANCIAL METRICS** list (left/center): Total 5Y Profit, Best Season (year + €), Worst Season, Avg Margin %, Cash Trend prose label ("Steady growth" / "Volatile" / "Concerning decline")
- **Right column — two donuts stacked**:
  - **REVENUE BREAKDOWN** PieChart: Matchday / Sponsorships / TV / Prize / Other — center shows TOTAL REV
  - **EXPENSE BREAKDOWN** PieChart: Wages / Staff / Facility / Travel / Medical / Finance — center shows TOTAL EXP
- **CASH FLOW table**: 6-row table — Month / Inflow / Outflow / Net / Cumulative — last 6 months from `tycoon.ledgerHistory` granular entries
- **UPCOMING PAYMENTS** section: next 5 scheduled outflows (next payslip €X due in Yd, monthly facility upkeep, sponsor signing-bonus payouts, prize-money due-dates)
- **FINANCIAL ALERTS** panel: 0-3 bullets generated from state — "Cash projected to dip below €2M by January", "Sponsorship gap: 2 unfilled slots cost ~€800K/yr", "Wage bill +12% vs last season"
- **Footer CTA**: "View Full Financial Report →" (opens read-only spreadsheet view from Goal 11)
- All copy in German per project rule. NO raw multipliers / scores — only EUR amounts + descriptive labels.

### Schedule Hub — All-Competitions landing (scheduleview.png):
- **Header**: "SCHEDULE" title + subtitle "View fixtures, results and standings across all competitions", Season-pill + Calendar-View CTA top-right
- **Top stats strip (4-5 competition cards)**: Liga Endesa (current standing position + record + form W7), Euroleague (position + record + form), Copa del Rey (qualification badge: Qualified / Round-of-16 / etc.), Supercopa, "Other Competitions" mini placeholder
- **Tab navigation**: Overview / Fixtures / Standings / Stats / Other
- **Mini April 2026 calendar widget** (compact month grid with game-dots in cells, color-coded per competition)
- **UPCOMING FIXTURES table**: Date / Opponent (with team-logo) / Competition / Venue / Time / Status — sortable. 8-10 next games visible.
- **LIGA ENDESA STANDINGS** mini-table (right side): top 8 teams, user-team row highlighted
- **Bottom KPI row**: Future Congestion gauge (color-coded with prose label "Light" / "Manageable" / "Heavy"), Travel Days (number + km), Squad Fitness % gauge, Next Fixtures countdown
- **CUP COMPETITIONS** side panel: list of cup commitments with "Next Round" date + opponent
- Uses dark-slate cards, accent colors per competition (Endesa = orange, Euroleague = amber/gold, Copa = red)

### Schedule Hub — Monthly Calendar view (calendar view.png):
- Triggered by Calendar-View CTA from All-Competitions landing
- **Header**: "SCHEDULE" + subtitle "Calendar view across all competitions" + Future Congestion pill ("Medium" / "Heavy") + Squad Ready pill ("Healthy" / "Tired")
- **Tab strip**: Overview / Fixtures / Calendar (active) / Euroleague / Copa del Rey / Supercopa / Other
- **Month selector**: April 2026 ◄ ► — with day-of-week column headers (MON–SUN)
- **Main calendar grid**: 6 rows × 7 columns. Each day-cell contains:
  - Date number top-left
  - Game-cards for that day: home/away indicator, opponent-logo + 3-letter abbrev, competition-color stripe (left edge), score-badge if played (W 88-71 in green / L 76-81 in red), "TODAY" badge for current date
  - Training-label on non-game days ("Training" muted text)
  - Recovery-label on rest days
- **Right rail (3 stacked panels)**:
  - **UPCOMING FIXTURES** — next 4 games scrollable list with countdown
  - **COMPETITION FILTER** — checkboxes (Liga Endesa, Euroleague, Copa del Rey, Cup Games, Domestic Cup, View All EL Fixtures CTA)
  - **MINI CALENDAR** — 2-month-mini view (Mar/May) for jumping forward/back
- **Footer KPI row**: Future Outlook, Budget Period (small €€€ chart), Rest Days count, Travel KMs total
- **"Full Calendar View"** primary CTA at bottom-right
- **Day-cell click**: opens game-detail popover (preview if upcoming, box-score if played)

### Schedule Hub — Competition Detail drilldown (euroleagueschedule.png):
- Triggered by clicking a competition card in All-Competitions landing OR "View All EL Fixtures" link
- **Header**: "EUROLEAGUE" title + subtitle "View fixtures, results and standings for the Turkish Airlines Euroleague" + "← Back to All Competitions" link top-right + Future Congestion + Squad Ready pills
- **Top stat row (3 cards)**: League Position (2nd, 17-5, .773, Form W4 with last-5-games dots), QUALIFICATION status panel (Qualified / Playoff Race / Eliminated — with prose explanation "Top-8 guaranteed; ranked 2nd with 8 games left"), NEXT MATCH big card (Real Madrid vs Olympiacos Piraeus + venue + date + countdown timer + "Match Preview" CTA)
- **Tab strip**: Overview (active) / Fixtures / Standings / Stats / Players
- **FIXTURES & RESULTS** main list (table): Date / Opponent (logo+name) / Venue (home/away icon) / Score (color-coded W/L badge) / Status. Filters: All Games / Played / Upcoming. ~10 rows visible with scroll.
- **Right rail — EUROLEAGUE STANDINGS** full table: rank / team / W-L / form / streak — user team highlighted, color-coded zones (top-8 = green qualified, 9-16 = neutral, bottom = red eliminated)
- **Bottom row (4 panels)**:
  - **TEAM PERFORMANCE** — radial-gauge KPIs: PPG / OPP-PPG / NET RTG + a small 5-game trend sparkline
  - **TOP PERFORMERS** — top 3 players this competition (portrait, name, stat-line "21.4 PPG / 5.2 RPG / 4.1 APG"), "View Player Stats →" CTA
  - **KEY STATS** — bullet list (3PT%, FT%, AST/TO, REB margin) with rank pill ("Top 3" / "Bottom 5") next to each
  - **EUROLEAGUE INFO** — competition meta: format explanation, prize-money tiers, regular-season end date, "Competition Rules" link
- All in dark-slate visual language with Euroleague-amber accent color throughout

### Travel & Logistics Full-Page layout (travellogisticsview.png):
- Triggered when user clicks "Manage" on the small Travel card from Front Office Overview (replaces the current cramped TravelLogisticsCard for full-page UX)
- **Header**: "TRAVEL & LOGISTICS" title + subtitle "Configure your team travel experience" + Tier-badge ("STAR QUALITY TIER ★★★ Standard") + Annual Cost stat ("€X.XXM") + "See Preferences" CTA top-right
- **Travel-Class selector strip**: Economy / Standard (active) / Premium / Luxury — 4 horizontal pills with star ratings + cost-per-trip difference shown beneath each
- **Main grid — 3 large cards** (Hotels / Planes / Buses):
  - Each card has a HERO IMAGE (placeholder: brand asset path `public/img/travel/{type}_{tier}.jpg` — Codex creates folder with SVG-placeholders if missing): "Radisson Blu Hotel", "Airbus A321neo (Charter)", "Luxury Coach"
  - Star rating row (★★★★☆ 3.5)
  - "SELECTED" pill (active selection)
  - **KEY FEATURES** bullet list (3-4 items): "Free Cancellation", "Recovery Pool", "Premium Lounge Access", etc.
  - **COST PER TRIP** big number + currency
  - **TOTAL DAYS** secondary stat
  - "View All Hotels/Planes/Buses" link footer
- **Bottom — TRAVEL SUMMARY** strip: 4 stat tiles (Total Hotel Cost €X / Total Flight Cost €X / Total Bus Cost €X / Grand Total €X.XXM)
- **Footer CTA row**: "Confirm & Save" primary button (saves new tier selection → updates `tycoon.travel.{hotels,planes,buses}.tier` + persists)
- **Sub-tabs at top of page** (under header): Hotels / Planes / Buses / Travel History / Preferences — first three switch the focused card to a deep-detail view (compare all 4 tiers side-by-side, see calendar of upcoming trips per tier)
- Hooks into Goal 17 (Survival-Mode): if `cashOnHand < threshold`, Premium/Luxury tier pills lock with red lock-icon + tooltip "Cash too low — survival mode forces ≤ Standard tier"

### Medical & Recovery Full-Page layout (medicalview.png):
- Triggered by clicking "MEDICAL & RECOVERY CENTER" card on the Facilities route OR by clicking "Manage →" on the compact MedicalCard on Overview
- Becomes the FULL home for medical UX (replaces the cramped MedicalCard for budget editing; compact card stays on Overview as a summary tile)
- **Header**: "MEDICAL & RECOVERY" title + heart-icon + subtitle "Invest in your medical department to reduce injuries and speed up recovery" + Annual Budget big-number top-right with delta-pill (+8% vs last season)
- **Left column — STAFF QUALITY large card**:
  - Big radial gauge (0–100 score, fed by `medicalQuality(team) × 100`)
  - Prose label below gauge: "Elite" / "Strong" / "Solid" / "Below Average" / "Skeleton" — driven by `medicalQualityLabel()`
  - One-line prose summary ("World-class medical team and recovery infrastructure")
  - 5-month trend dot-bar (last 5 data points from ledgerHistory's medical line — or synthetic until enough history exists)
- **Center — IMPACT ON SQUAD** 5-stat horizontal row (icons + values):
  - Injury Frequency: −X% (derived from quality × 0.30 cap — show as percentage but NEVER show the raw multiplier)
  - Recovery Time: −X% (quality × 0.15 cap)
  - Training Tolerance: +X% (small fitness/conditioning bonus when staff quality high)
  - Player Availability: +X% (composite from frequency + recovery)
  - Player Morale: +X% (small mood buff tied to feeling-cared-for, hooks Goal 16 morale system)
  - Each tile: icon, value with arrow, label below in small caps
- **Center-Top — HERO PHOTO** placeholder: futuristic medical/recovery facility image (use SVG-placeholder with accent border + "MEDICAL FACILITY" text if no asset). Codex: create `public/img/facilities/medical_hero.svg` if missing
- **Right column — MEDICAL FACILITIES** sub-section list (8 items, each with quality-badge):
  - Physiotherapy Suites — Elite / Advanced / Standard / Basic
  - Recovery Room — Elite / Advanced / Standard / Basic
  - Cryotherapy — Elite / Advanced / Standard / Basic
  - Strength & Conditioning — Elite / Advanced / Standard / Basic
  - Sleep & Nutrition Lab — Elite / Advanced / Standard / Basic
  - Biomechanics Lab — Elite / Advanced / Standard / Basic
  - Altitude Chamber — Elite / Advanced / Standard / Basic
  - MRI & Diagnostics — Elite / Advanced / Standard / Basic
  - **Each facility's tier is DERIVED from total budget bucket + staff attrs**, not separately editable. Composite formula: `getFacilityTier(budget, slot, staffAttrs)` returns the badge label. Higher total budget unlocks more facilities at higher tiers.
  - Badge colors: Elite = emerald, Advanced = sky/indigo, Standard = amber, Basic = slate
- **Bottom — ANNUAL INVESTMENT slider** (wide full-width):
  - Range €100K (Skeleton) ↔ €15.20M (World Class) — reuse `MEDICAL_BUDGET_MIN_EUR` / `MEDICAL_BUDGET_MAX_EUR` (extend max to €15.2M to match mockup)
  - Current Budget marker in middle with €X.XXM tooltip
  - 3 labeled stops underneath: "€3.5M Skeleton" / "Current Budget" / "€15.20M World Class"
  - Prose paragraph below: "Annual investment covers: medical staff, physios, sport scientists, recovery equipment, nutritionists, diagnostics and rehabilitation programs"
- **IMPORTANT NOTE** card (right-bottom):
  - Warning-style accent border (amber/orange)
  - Copy: "Season-ending injuries (ACL, Achilles, etc.) are not affected by investment level — only frequency and recovery time of lesser injuries"
- **Footer CTA**: "View Medical Report →" (right-aligned) — opens read-only report modal with per-player injury history this season + comparison to league average. v1 can be a placeholder ("Medical Report coming soon") if time-budget tight.
- Hooks: same handler as existing MedicalCard (`handleMedicalBudgetChange` in Overview parent) — extracted/shared via context or prop-drilling. The slider on this page and the compact card on Overview MUST stay in sync (both edit the same `tycoon.medicalBudget` field).
- NEW helpers to add to `medicalEngine.ts`:
  - `getFacilityTier(budget, facilityKey, staffAttrs?) → 'Elite' | 'Advanced' | 'Standard' | 'Basic'`
  - `getImpactStats(quality) → { injuryFreqDelta, recoveryDelta, trainingTolDelta, availabilityDelta, moraleDelta }` — returns labeled percentages, NOT raw multipliers
  - Bump `MEDICAL_BUDGET_MAX_EUR` from €10M to €15.2M to match mockup max

### Sponsor-Negotiation Modal layout (sponsornegotiation.png):
Triggered when user clicks "Negotiate" on a Sponsorship slot (from Sponsorships route or from a sponsor's compact card on Overview). Full-screen 3-column modal:
- **Top bar**: "SPONSORSHIP NEGOTIATIONS" title + subtitle "Secure the best partners. Strong brands build loyalty." Right side: club's Brand Value stat, Global Appeal pill, Active Deals counter, ⭐ Reputation rating, Season pill.
- **Left column — SPONSOR SLOTS rail** (vertical list of all 8 slots):
  - Each row: brand logo + slot name (Kit/Sleeve/Back/Shorts/Training/Court/Stadium/Practice) + value/yr + "Expires {year}" footer
  - Current selection highlighted with accent border
  - Click another slot → switches the center column to that slot's negotiation context (allows quick re-anchoring without closing modal)
  - Slots with no deal show "Browse Market →" placeholder card
- **Center column — NEGOTIATING WITH SPONSOR card** (the live negotiation surface):
  - "NEGOTIATING WITH SPONSOR" eyebrow header
  - **Brand panel**: large brand logo + product render (jersey/court/sleeve visual) — Codex: use SVG placeholder `public/img/sponsors/{brand}.svg`, fallback to wordmark-on-hexagon if asset missing
  - **Brand prose**: one-paragraph description from `sponsor.personalityProse` (template-derived from `sponsor.industry` + `sponsor.archetype` — Premium/Local/Gambling/Tech as defined in Goal 18)
  - **OFFER DETAILS** numeric strip: Total Value (€X.XM), Contract Length (X Years), Signing Bonus (€X.XM), Delta-pill (+/-X% vs current/asking)
  - **Two paired sliders** in middle row:
    - **SPONSOR REQUEST** (left) — what the sponsor is asking for: annual value + signing bonus min/max
    - **SPONSOR INTEREST** (right) — sponsor's preferred contract length + bonus tolerance — moves the underlying interest-gauge below
  - **Performance Quality / Competitive radial gauge** (large 83% in mockup) — composite score that maps to mood-feedback in words:
    - ≥80 = "Premium offer — they'd jump on it" (emerald)
    - 60–79 = "Competitive — likely to accept" (sky)
    - 40–59 = "Borderline — sponsor mulls" (amber)
    - 20–39 = "Lowball — sponsor looks offended" (orange)
    - <20 = "Insulting — walk-away risk" (rose)
    - The numeric % shown is OK because it's a composite *competitive-fit* score (not an internal multiplier); always paired with the prose label
  - **NEGOTIATION STANCE 3-pill selector**: Conservative / Balanced (default) / Aggressive — each with icon. Stance modifies:
    - Conservative → smaller value but better likelihood, sponsor mood stays neutral
    - Balanced → standard offer, neutral mood
    - Aggressive → bigger asking, mood drops faster, but unlocks higher upside if accepted
  - **ACCEPT OFFER** (emerald primary) + **DECLINE OFFER** (rose secondary) CTAs bottom
  - **2 Counter-Versuche** counter: small "Attempts left: 2" pill under CTAs — decrements per submit; when 0 sponsor walks (existing Goal 18 logic)
- **Right column** (3 stacked panels):
  - **BRAND IMPACT** list (4-5 items with progress bars): Brand Reach (Worldwide/Regional/Local prose), Global Appeal, Social Reach, Brand Image, etc. — driven by `sponsor.archetype` + region tags. Visualizes WHY this sponsor matters beyond €€€.
  - **CURRENT vs NEW DEAL** side-by-side comparison:
    - 4 rows: Annual Value | Contract Length | Signing Bonus | Performance Bonus
    - Each row shows old value + arrow + new value + delta pill
    - Color-coded green if better, rose if worse
    - Hidden if there is no current deal (new slot signing)
  - **PARTNERSHIP HISTORY** mini-timeline:
    - Prose at top: "Strong relationship with this brand. Continuing this collaboration is recommended." (or "First-time partnership" / "Past disputes — proceed carefully" depending on history state)
    - Horizontal bar-chart timeline: year markers (e.g. 2022 / 2023 / 2024 / 2025 / 2026) with payout bars colored per renewal vs original-signing vs penalty
    - Only renders if `sponsor.relationshipHistory` exists (new field on Sponsor); skip panel for first-time partnerships
- **Negotiation feedback (live updates)** as sliders move:
  - Center gauge re-computes Competitive % every drag
  - Mood-label updates in real-time (no submit needed)
  - If user pushes too far → sponsor "leaves the room" animation; Decline CTA becomes "Walk Away" red and Accept disabled
- **Submit flow**: Accept → success animation, updates `team.tycoon.sponsorships[slot]`, news event "Adidas extends Madrid kit deal — €15.5M / 4 years", ledger updates Sponsor-Bonus row, modal closes
- **Auto-fire trigger** (existing Goal 18 logic): yearsRemaining ≤ 1 → modal pre-pops in Offseason-Aufgaben list; must address before advancing or default-decline penalty (sponsor leaves)
- All copy in German per project rule. NO raw multipliers exposed — only € amounts, % composite scores (paired with prose), and descriptive labels.

### Apply this style language to ALL new UI in Goals 0-18
Sponsor-Negotiation Modal, Cash-Indicator chip, Finance-Recap Modal, Board-Promises panel, Press-Conferences interface, Player-Demand events, etc. should match this visual identity (dark-slate cards, accent colors per category, no raw multipliers, prose labels everywhere). Attribute bars use the same compact horizontal-bar pattern as in staffviewui.png across all attribute displays.

**Implementation note**: Recharts is already imported and supports Sankey, RadialBarChart, ComposedChart — use them. Brand logos in `public/img/sponsors/` (Codex: check if folder exists, otherwise use SVG placeholders with brand-name text + accent border).

## Goals (in execution order)

### Goal 0: Sidebar-Architektur + Front Office UI Redesign per Mockup — IMPLEMENT FIRST
> User dropped 10 mockups. The mockup-sidebar (visible in every screenshot's left rail) **REPLACES** the current single "Front Office" entry with multiple individual sidebar routes under MY TEAM.

#### Sidebar Architecture Change (Euro+GM mode only)

**Current state:** MY TEAM sidebar group has a single "Front Office" entry which then has sub-tabs internally.

**New state (per mockups):** MY TEAM sidebar group gets these INDIVIDUAL entries, each its own route:
- **Overview** → existing `FrontOfficeView` tab content (frontofficeviewui.png) — landing
- **Finances** → new sub-route matching `financesviewui.png` (was Front Office sub-tab in old plan)
- **Sponsorships** → new sub-route matching `sponsorsviewui.png`
- **Travel** → new sub-route matching `travellogisticsview.png` (Goal 9b)
- **Staff** → new sub-route matching `staffviewui.png` (Goal 15)
- **Facilities** → new sub-route matching `facilitiesviewui.png`
- **Scouting** → new sub-route (Goal 12 scouting fuzz lives here)
- **Schedule** → existing route (Goal 9 redesign)

**Explicitly EXCLUDED from this restructuring** (per user-direction):
- **Settings** → do NOT add as new sidebar entry; existing Settings stays where it is
- **Reports** → do NOT add (deferred — `reports-futureimplemented.png` is a future-only mockup)
- **Youth Academy** → do NOT add as standalone sidebar entry; it remains a card on Facilities page (composite rating) until a future dedicated view
- **Training** → existing TrainingCenterView concept stays unchanged — do NOT duplicate or replace
- **Squad View** → not listed in mockup sidebar but EXISTING SquadView stays where it currently is — do NOT remove

**Mockup-sidebar = visual reference; what's listed above = the actual implementation list. Anything in the mockup-sidebar that's not in the implementation list above must NOT be added.**

#### Implementation Files
- `src/components/sidebar/NavigationMenu.tsx` (or wherever MY TEAM group is rendered) — add new routes under MY TEAM, gated on `uiMode === 'euro_isolated' && gameMode === 'gm'`. NBA mode keeps current sidebar untouched.
- Old single "Front Office" route → becomes the "Overview" route (rename internally; URL/key changes to `myteam/overview` or similar)
- New components (one per route): `src/components/myteam/OverviewView.tsx`, `FinancesView.tsx`, `SponsorshipsView.tsx`, `TravelView.tsx`, `StaffView.tsx`, `FacilitiesView.tsx`, `ScoutingView.tsx` (or co-locate under `src/components/myteam/` — folder structure picks whichever matches existing routing convention)
- Each new view has the FM-style header (Tier badge, season pill, KPI row, subtitle) per mockup visual language
- Each view shares the user-club card at sidebar bottom (logo + Tier + Cash on Hand + Reputation — live-updating from `tycoon`)

#### Overview Layout (frontofficeviewui.png — landing page)
- Sankey diagram component: `src/components/tycoon/CashFlowSankey.tsx` — uses `recharts.Sankey`, reads from `ledger.revenue` + `ledger.expenses`
- KPI Row component: `src/components/tycoon/FinancialSnapshot.tsx` — 5 cards with delta vs last season + sparklines (use existing `tycoon.ledgerHistory`, "first season" fallback if <2 entries)
- Star-Power card: re-uses `computeStarPower(state.players, userTeamId).boost` — shows as multiplier with ⭐ rating; click opens explanation popover
- Sponsorship Portfolio compact-grid (8 cards, condensed version — full layout lives on Sponsorships route). Grade derived from `value / TIER_BASE[tier].sponsorshipFloor[slot]`: ≥1.5 = A+, ≥1.2 = A, ≥0.9 = B+, ≥0.6 = B, <0.6 = C. Show as colored hexagon badge.
- Smaller cards (Ticket Pricing, Medical, Travel) live at the bottom in 3-col grid — each with "→ Manage" CTA that navigates to the full Sponsorships/Travel route
- Ledger History stacked-bar chart: reuse Recharts BarChart with `ledgerHistory` data
- All copy in German (user preference) — but technical labels (REVENUE, EXPENSES, SANKEY) can stay English for brevity
- Existing functionality NOT lost: all current controls (ticket slider, medical slider, sponsor-negotiate, travel) stay functional — they just live on their respective dedicated routes now
- Mobile fallback: stack vertically, sidebar becomes top-bar
- **NBA mode unchanged** — this whole redesign is only for `uiMode === 'euro_isolated'`

#### Sidebar Cash-Indicator integration
Cash-chip (Goal 4 + Goal 10) appears inline next to each MY TEAM entry's parent group header, NOT next to each child entry — keeps the sidebar uncluttered. Color-coded as before (green/yellow/red).

### Goal 1: Euro Commissioner Settings Modal (AC-S3, AC-S4)
- Extend `src/components/commissioner/rules/view/EconomyContractsSection.tsx` with a new section "Euro Mode Salaries" that is **only visible when `uiMode === 'euro_isolated'`**
- Fields: euroMinSalaryUSD slider (€50K – €1M displayed in EUR), euroMaxSalaryUSD slider (€500K – €10M), euroleagueBRL slider (€5M – €20M)
- Wire to `useRulesState.ts` (mirror existing prop pattern: `setEuroMinSalary`, `setEuroMaxSalary`, `setEuroleagueBRL`)
- SigningModal MIN/MAX bounds in `src/components/modals/SigningModal/SigningModal.tsx` must reflect these overrides (already do via `getContractLimits` — verify Year 1 shows ~€266K – €5M instead of €1.06M – €14.52M)
- **Verify:** open a Euro save, click Sign FA, confirm MIN = ~€266K and MAX = ~€5M

### Goal 2: Medical Budget Slice A (AC-M1 through AC-M7) — **Compact UI shipped; Codex extends to Full-Page (medicalview.png) + INJURY HOOKS**

**Already shipped before sleep (do NOT redo):**
- `src/types/tycoon.ts` — `medicalBudget?: number` field on TycoonState + `medical: number` on AnnualLedger.expenses
- `src/services/tycoon/medicalEngine.ts` — `medicalQuality()`, `defaultMedicalBudgetForTier()`, `medicalQualityLabel()`, `medicalImpactSummary()`, `MEDICAL_BUDGET_MIN_EUR`, `MEDICAL_BUDGET_MAX_EUR`
- `src/services/tycoon/budgetEngine.ts` — `expenses.medical` line added, included in profit calc
- `src/services/tycoon/migrate.ts` — backfills `medicalBudget = defaultMedicalBudgetForTier(tier)` on existing saves + new
- `src/components/tycoon/MedicalCard.tsx` — slider, quality bar with prose label, impact summary, no raw multipliers
- `src/components/central/view/FrontOfficeView.tsx` — MedicalCard mounted in right column (stack with TravelLogistics), `handleMedicalBudgetChange` mutation handler, ledger Annual Projection "Medical & Recovery" line wired

**Remaining for Codex:**
- **(A) Medical Full-Page View (NEW from medicalview.png — replaces full edit-UX of compact card):**
  - New file: `src/components/tycoon/MedicalFullPage.tsx` — matches `public/img/ui/medicalview.png` exactly
  - Becomes the target of "Manage →" CTA on the compact MedicalCard (which stays on Overview as a summary tile) AND the click target of "MEDICAL & RECOVERY CENTER" card on Facilities route
  - Renders STAFF QUALITY large radial-gauge + IMPACT ON SQUAD 5-stat row + hero photo + MEDICAL FACILITIES badge-list (8 items with derived tier badges) + ANNUAL INVESTMENT wide slider + IMPORTANT NOTE warning card + "View Medical Report" CTA
  - Slider value MUST sync with the compact MedicalCard's slider (both edit the same `tycoon.medicalBudget`)
  - Extend `medicalEngine.ts` with `getFacilityTier(budget, key, staffAttrs?)` and `getImpactStats(quality)` helpers
  - Bump `MEDICAL_BUDGET_MAX_EUR` from €10M → €15.2M (match mockup's "€15.20M World Class" stop)
- **(B) INJURY HOOKS (already-planned):**
  - `src/services/simulation/InjurySystem.ts` — accept `medicalQuality` arg, apply `injuryRate *= (1 - q × 0.30)` and `gamesRemaining *= (1 - q × 0.15)` (skip for `isSeasonEnding`)
  - `src/services/simulation/GameSimulator/engine.ts` + `RealisticEngine.ts` — pass per-team quality into `checkInjuries`
- **(C) Routing/integration:**
  - Add new MY TEAM sub-route (Goal 0 sidebar restructure) or render MedicalFullPage as nested-tab on Facilities route — picks whichever matches the new sidebar architecture decided in Goal 0
  - `src/components/central/view/TeamFinancesViewDetailed.tsx` — render `<MedicalCard readOnly>` summary tile only (full editing happens on the Medical route)
- **Verify:** in a Euro save, set Medical Budget to €5M on the Full-Page, sim a season. Compare injury count to baseline (€500K). Expect 20–30% fewer injuries and ~15% shorter recoveries on non-season-ending. STAFF QUALITY gauge updates live as slider moves. Facility-tier badges update live (€500K = mostly Basic; €15M = mostly Elite).

### Goal 3: Cash-Gate / Sponsor-Floor (AC-C1 through AC-C6, including GAME OVER)
- Follow plan §"Design — Slice B: Cash-Gate" exactly
- New helpers:
  - `projectYearEndCash(team, plannedSpend)` in `budgetEngine.ts`
  - `sponsorFloor(team, slot)` in `sponsorshipEngine.ts` — replaces the bare `TIER_BASE[t.tier].sponsorshipFloor[slot]` lookup
  - **CRITICAL:** Calibrate so S-tier Madrid Year-1 offers stay within 5% of pre-change values. Use the formula `baseFloor × (1 + 0.10×(stadiumLevel-1) + 0.15×successScore + 0.20×cityPrestige)`. Verify with `scripts/test-tycoon-sponsor.ts`.
- SigningModal banner: 🟡 *"Owner concerned — this contract pushes you €X.XM into the red"* with `[Sign anyway]` / `[Cancel]` (German wording: *"Owner besorgt — dieser Vertrag bringt €X.XM Defizit"*). Override applies `boardConfidence -= 10`.
- AI cash-block: `AIFreeAgentHandler.ts` — `projectedYearEndCash(team, offer.salaryUSD) < 0` → skip offer.
- **AC-C6 GAME OVER + Choose-Next-Team** (NEW from user message tonight):
  - Trigger in `seasonRollover.ts`: if `team.tycoon.cashOnHand < 0` AND `userTeamId === team.id` AND `gameMode === 'gm'` AND `uiMode === 'euro_isolated'` → set offseason task `BANKRUPTCY_CHOOSE_TEAM`
  - New component: `src/components/tycoon/BankruptcyChooseTeamModal.tsx`
    - Lists all other Euro teams (state.teams + state.nonNBATeams, exclude bankrupt one)
    - Sorted by `cityPrestige` descending
    - User clicks a team → dispatch `SET_USER_TEAM_ID` to new tid, mark old team `aiManaged: true`
    - Add news event: *"Río Breogán filed for bankruptcy — you've been hired as GM of {new team}"*
  - Add to `OffseasonChecklistRow` enum + `OFFSEASON_ROW_ORDER` + `getStepConfirmSpec` exhaustive switch (see CLAUDE.md mistake #8)
- **Verify:** in a Euro save, blow the budget on €60M of wages, year-end → bankruptcy modal fires → pick new team → continue managing.

### Goal 4: Always-Visible Cash Indicator (NEW from user tonight)
- User wants `cashOnHand` visible on **every screen** in Euro mode, not just Front Office
- Add a small status bar / chip in the top navigation that shows: `💰 €X.XM` for the user's team
- File: `src/components/sidebar/NavigationMenu.tsx` or `src/components/layout/Header.tsx` — find the existing top status bar pattern
- Only visible when `gameMode === 'gm'` AND `uiMode === 'euro_isolated'`
- Color: green if positive, yellow if < 1M, red if negative
- Click → opens Front Office view
- **Verify:** indicator updates after any sponsor signing, payday, facility upgrade

### Goal 5: Bi-Weekly Payslips (NEW from user tonight — IMPLEMENT)
- Every 14 calendar days in Euro mode: deduct each team's `annual_wages / 26` from `tycoon.cashOnHand`
- File: extend `src/services/logic/turn/postProcessor.ts` or `simulationHandler.ts` — wherever the day-tick fires
- Use `state.calendar.lastPayslipDate` (new field) to track last payslip; fire when `currentDate - lastPayslipDate >= 14`
- Log each payslip to `tycoon.ledgerHistory` as a granular transaction (or to a new lighter `tycoon.recentPayslips: Array<{date, amount}>` capped at 12 entries)
- News-feed event when `cashOnHand < 1_000_000`: *"⚠️ Cash reserves running low — €X.XM remaining"*
- News-feed event when `cashOnHand < 0`: trigger immediate offseason-style BANKRUPTCY_CHOOSE_TEAM (or at next month-end, whichever is cleaner)
- **NBA mode**: do NOT add payslips. NBA salaries continue via existing year-end `seasonRollover` path
- **UX**: Front Office gets a "Next Payslip" countdown ("Next payday: 8 days · €1.2M due")
- **Verify:** in Euro save, sign €60M of wages over 5 teams, sim 6 months, expect at least one team to hit cash-low warning and ideally one mid-season bankruptcy event

### Goal 6: Finance-Outcome-Modal nach Sim-Blocks (NEW from user tonight — IMPLEMENT)
- User-Idee: nach jedem mehrtägigen Sim-Block (Advance Week, Sim-to-Next-Game, Sim-to-Date) erscheint ein Outcome-Modal mit Finance-Recap für die simulierte Periode
- Pattern-Vorlage: existing Commissioner-Mode Recap-Modal (post-game outcome screen). Reuse visual language, neuen Inhalt.
- **Fires when:** Sim-Block ≥ 3 Tage in Euro-Mode + GM-Mode (nicht bei Single-Day-Advance, sonst spam)
- **Content (Cash In / Cash Out grouped):**
  - In: Matchday-Gate (X home games), TV-Pro-Rata, Sponsor-Payments (per slot, only those that fired this period), Prize-Money (Endesa/EL pos)
  - Out: Payslips (X payslips × €Y), Travel (per away game), Facility-Ops monthly tick, Medical-Budget monthly tick
  - Net: Cash-Delta, Current Cash on Hand mit Color-Indicator 🟢🟡🔴, "Next payday in X days · €Y due"
- **Dismissibility:**
  - `[OK]` — close modal
  - `[Don't show again this month]` — sets `state.uiPrefs.suppressFinanceRecapUntil: <date+30d>`
  - `[Always show]` — opens prefs panel
- **Settings toggle:** in same Euro-Commissioner-Settings section as min-salary — checkbox "Finance Recap nach Sim" (default ON)
- **Files:**
  - `src/components/tycoon/FinanceRecapModal.tsx` — **new**
  - `src/services/tycoon/financeRecapBuilder.ts` — **new** (aggregates ledger-deltas over a date range)
  - `src/store/logic/turn/postProcessor.ts` or wherever Sim-Block-End fires — trigger modal-open dispatch
  - `src/types.ts` — `uiPrefs: { suppressFinanceRecapUntil?: string; financeRecapEnabled?: boolean }`
- **DO NOT:** show raw multiplier deltas, percentages of cap, or "score" values. Pure cash numbers + descriptive bullets (UI-internals rule).
- **Verify:** Euro save, Sim-to-Next-Game over 14 days → modal fires once with breakdown. Sim again over 2 days → no modal (too short). Toggle off in settings → no modal even on long sims.

### Goal 7: Offseason-Aufgaben + Play-Button UX-Polish (NEW from user tonight — IMPLEMENT)
- User-Quote: *"macht bitte offseason aufgabe un playbutton phases noch besser .bitte.. denk an user an bitte"*
- Three concrete improvements (all gated to GM-mode + Euro for v1, NBA stays as-is):

**(a) Euro-relevante Offseason-Rows nur anzeigen**
  - NBA hat: `draftLottery`, `draft`, `options`, `qualifyingOffers`, `myFAs`, `rookieContracts`, `freeAgency`, `expansionDraft`, `trainingCamp`
  - Euro braucht: `options` (player/team options ja, falls Vertrag das zulässt), `myFAs`, `freeAgency`, `trainingCamp`. **NICHT:** `draftLottery`, `draft`, `rookieContracts`, `expansionDraft`
  - File: `OFFSEASON_ROW_ORDER` filter on `uiMode === 'euro_isolated'` in `src/services/logic/offseasonChecklist.ts` (or wherever it lives)
  - **DO NOT** delete the rows from the enum — just filter them out per-uiMode. NBA mode must show all rows unchanged.

**(b) Play-Button-Clarity**
  - Currently: button says "Advance" with no preview of what's next
  - New: button label shows next phase + 1-line preview:
    - *"➡ Sign Your Free Agents · 12 offers waiting"*
    - *"➡ Training Camp Begins · Roster locks Sep 14"*
    - *"➡ Pre-season Friendlies · 6 games to play"*
  - Hover-Tooltip: longer description, what'll happen, est. duration
  - File: extend `OffseasonAufgabenSidebar.tsx` or `OffseasonChecklist*` component — find the current Play-Button render
  - For in-season Advance-Day button: same pattern, label shows what's between now and next sim-stop ("➡ Sim to Game Day · Real Madrid vs Barcelona, 3 days")

**(c) Progress-Indicator**
  - Above the Play-Button: "Phase 3 of 5 · Free Agency" with thin progress bar
  - In Euro mode: count only relevant rows
  - Tap on indicator → opens collapsible list of all phases mit Status (✓ done · → current · □ pending)

**(d) Phase-Complete Confirmation Copy**
  - Current: jargon-heavy ("OFFSEASON_COMPLETE_PHASE freeAgency")
  - New: prose, German, neutral tone — *"Free Agency abgeschlossen — 4 neue Verträge, €12M neue Salary-Bürde. Weiter zum Training Camp?"*
  - Use existing `getStepConfirmSpec()` (CLAUDE.md mistake #8) — extend each case with Euro-friendly copy

**Verify:**
- Euro save Offseason: only see Options / My FAs / Free Agency / Training Camp. No Draft Lottery, no Rookie Contracts.
- Click Play-Button on Free Agency phase: label says "➡ Sign Your Free Agents · X offers waiting" matching count from `state.freeAgentOffers`
- Progress indicator shows "Phase 3 of 4 · Free Agency"
- NBA save Offseason untouched — all original rows visible, no UI regressions

### Goal 8: Calendar-Skip Bug (Euro Preseason→Season) — IMPLEMENT
- **User-Report 2026-05-12**: *"warum to preseason und season immer noch mich zum oct 24 gefuhrt und es hat zu viel games geskippt wtf"*
- Bug: lazy-sim hat Oct 24 als preseason-end hardcoded (`lazySimRunner.ts:452` getPhaseLabel + likely `faMarketTicker.ts:41` isPostPreseason + others). Euro mode hat Endesa-Start Sep 28 → Spiele Sep 28 – Oct 23 werden auto-played statt User-Choice
- **Fix:** Helper-Funktion `getRegularSeasonStartDate(state)` in `dateUtils.ts`:
  - NBA → `${y}-10-21` (status quo)
  - Euro → first scheduled game's date from `state.schedule.filter(g => g.competitionId !== 'preseason' && g.season === y)[0].date` OR fall back to `${y}-09-28`
- Refactor all `10-21` / `10-22` / `10-24` hardcodes to read from this helper
- Lazy-sim stopBefore-target for "Sim to Season" must respect Euro start date, not NBA's
- **Verify:** Euro save mid-preseason → click Sim-to-Season-Start → lands on Sep 27 (day before first game), not Oct 23. Preseason games count correctly.

### Goal 9: Schedule Hub Redesign — IMPLEMENT
> **User dropped 3 polished Schedule mockups (May 13). This Goal replaces the previous Sponsor-Negotiation Modal entry at this slot — that work is now deferred to Goal 18 (still required, just after the Schedule rebuild).**

**Mockups to view BEFORE coding** (image-view tool, write observations to PROGRESS.md):
- `public/img/ui/scheduleview.png` — All-Competitions landing
- `public/img/ui/calendar view.png` — Monthly Calendar tab
- `public/img/ui/euroleagueschedule.png` — Competition-Detail drilldown

**Scope:** Rebuild the existing `ScheduleView` to match the 3-tab FM-style layout (All Competitions / Calendar / Competition-Detail). Files involved:
- `src/components/central/view/ScheduleView.tsx` (or wherever current schedule renders — search for `schedule` route)
- New: `src/components/schedule/ScheduleAllCompetitions.tsx`, `src/components/schedule/ScheduleCalendarView.tsx`, `src/components/schedule/CompetitionDetailView.tsx`
- Shared: `src/components/schedule/UpcomingFixturesList.tsx`, `src/components/schedule/CompetitionStandingsMini.tsx` (reuse if existing helpers exist for standings)

**Tab 1 — All Competitions landing (`scheduleview.png`):**
- 4-5 competition stat cards top (Liga Endesa, Euroleague, Copa del Rey, Supercopa, Other) — derived from `state.schedule` filter per competitionId + `getStandingsForCompetition(state, compId)` helper
- Tab strip: Overview / Fixtures / Standings / Stats / Other — Overview default
- Mini calendar widget (current month) with game-dot indicators per day
- Upcoming Fixtures table (next 8-10 games) — sortable by date/competition
- Liga Endesa Standings mini-table right side, user-team highlighted
- Bottom KPI row: Future Congestion gauge, Travel Days, Squad Fitness %, Next Fixtures countdown
- Cup Competitions side panel

**Tab 2 — Monthly Calendar (`calendar view.png`):**
- Full 6×7 calendar grid for selected month with month-selector arrows
- Each day-cell shows game cards (logo+abbrev+competition-color-stripe+score-if-played), training/recovery labels on off-days, "TODAY" badge
- Right rail: Upcoming Fixtures + Competition Filter checkboxes + Mini Calendar (prev/next month thumbnails)
- Footer KPIs: Future Outlook / Budget Period mini-chart / Rest Days / Travel KMs
- Day-cell click opens game-detail popover (preview if upcoming, box-score-modal if played — REUSE existing BoxScoreModal with season-aware gameId lookup, see CLAUDE.md mistake #11)
- Competition filter checkboxes toggle visibility of game-cards per competition

**Tab 3 — Competition Detail drilldown (`euroleagueschedule.png`):**
- Triggered by clicking a competition card on Tab 1 OR by selecting a competition tab inline
- Header has "← Back to All Competitions" breadcrumb (CLAUDE.md rule: every screen needs back-path)
- 3 stat cards: League Position (rank + record + form W4 with last-5 dots) / Qualification status / Next Match preview card
- Tab strip: Overview / Fixtures / Standings / Stats / Players
- Fixtures & Results main list with date/opponent/venue/score
- Right rail: full Euroleague Standings with color-coded zones (qualified/neutral/eliminated)
- Bottom: Team Performance radial gauges, Top Performers (3 players + portrait + stat-line), Key Stats with rank pills, Euroleague Info meta-panel
- Wire to ALL competitions (Endesa, Euroleague, Copa, Supercopa) — pass competitionId prop

**Helpers to create (or reuse if already in codebase):**
- `getStandingsForCompetition(state, competitionId, season)` — returns sorted standings rows per league
- `getFormString(team, season, competitionId, lastN=5)` — returns "W-W-L-W-W" array for dot rendering
- `getNextMatch(state, teamId, competitionId?)` — returns next unplayed schedule row
- `getCompetitionMeta(competitionId)` — name, accent color, season-format prose, prize-money tier
- `getCompetitionCalendar(state, month, year)` — returns Map<dateString, GameRow[]> for calendar grid
- `getFutureCongestion(state, teamId, lookaheadDays=30)` — count of games / travel km projected → maps to "Light/Medium/Heavy" + 🟢🟡🔴 gauge

**Constraints (CLAUDE.md):**
- All UI copy in German
- NO raw multipliers — descriptive labels only
- Use `getTeamFullName(team)` for any team text
- BoxScore lookups must filter on `(gameId, season)` to avoid season-collision (mistake #11)
- Gate all new layout behind `uiMode === 'euro_isolated'` — NBA mode keeps its current ScheduleView untouched

**Verify:**
- Open a Euro save mid-season (Madrid Year-1, January) → Schedule tab landing shows all 4 competitions with current position/record
- Switch to Calendar tab → April month grid shows all April games with correct competition colors
- Click a played game → BoxScoreModal opens with correct season's data (not a collided previous-season gid)
- Click "Euroleague" competition card → drills into Competition Detail with Real Madrid 2nd place, last-5 form dots correct
- Back button returns to All Competitions landing
- NBA save: open Schedule tab → still shows the unchanged NBA layout

### Goal 9b: Travel & Logistics Full-Page — IMPLEMENT
> **User dropped `public/img/ui/travellogisticsview.png` (May 13). The existing `TravelLogisticsCard` becomes a compact summary on Front Office Overview; clicking "Manage" opens this new full-page route.**

**Mockup to view BEFORE coding:** `public/img/ui/travellogisticsview.png`

**Scope:**
- New file: `src/components/tycoon/TravelLogisticsFullPage.tsx` — rendered as a dedicated route inside Front Office sub-nav (or as a modal full-screen overlay; pick whichever matches existing route structure best)
- Existing `TravelLogisticsCard.tsx` stays as the compact card on Overview (just add "Manage →" CTA that opens the full page)
- New asset folder: `public/img/travel/` — Codex creates SVG-placeholders for hotel/plane/bus visuals (one per tier × 3 categories = 12 SVGs). Use brand-neutral wordmark + accent-border. Real images can be swapped in later.

**Layout (match mockup):**
- Header: "TRAVEL & LOGISTICS" + subtitle + Tier-Badge + Annual Cost + "See Preferences" CTA
- Travel-Class selector strip: Economy / Standard / Premium / Luxury (4 horizontal pills, star ratings, cost-per-trip beneath)
- 3-column main grid: Hotels / Planes / Buses cards with hero-image, star-rating, "SELECTED" pill, Key Features bullets, Cost-Per-Trip, Total Days, "View All" link
- Bottom Travel Summary: 4 stat tiles (Total Hotel Cost / Flight / Bus / Grand Total)
- Footer: "Confirm & Save" CTA → dispatches travel-tier mutation
- Sub-tabs (Hotels / Planes / Buses / Travel History / Preferences) — first three open deep-detail compare view (4 tiers side-by-side)

**Survival-Mode coupling (Goal 17 hook):**
- If `tycoon.cashOnHand < SURVIVAL_THRESHOLD_EUR` (defined alongside Goal 17 thresholds), Premium and Luxury tier pills render with a red lock-icon + tooltip "Cash too low — survival mode forces ≤ Standard tier"
- Read-only display when locked; user must improve cash before unlocking upgrades

**State changes:**
- Confirm `tycoon.travel.hotels.tier`, `.planes.tier`, `.buses.tier` exist (likely already do from prior Travel work — verify in `types/tycoon.ts`)
- If not yet present, extend `TycoonState` accordingly and add migration in `migrate.ts`
- Persist tier selections; recompute annual travel cost into `budgetEngine.expenses.travel`

**Verify:**
- Open Euro save → Front Office Overview → "Manage" on Travel card opens full page
- Pick Premium for Hotels, save → Annual Travel cost in Front Office Overview ledger increases accordingly
- Sim a quarter → ledger expenses.travel reflects new tier
- Force cashOnHand < threshold → reload Travel page → Premium/Luxury locked with prose tooltip
- NBA mode: route does not exist (or shows a "Not available in NBA mode" placeholder)

### Goal 10: Sidebar Cash-Indicator + Personal Finance Sub-Tab — IMPLEMENT
- **User-Quote**: *"und sidebar. finances sind visibel Finances Personal €12.91M.. und genau mehr team finane sgraph spreadshit simualtor shit fm.."*
- **(a) Personal/Cash visibility in main sidebar (Euro+GM mode):**
  - Under MY TEAM group, the existing Front Office row should show *"€12.91M cash"* inline next to the label
  - Color-coded text (green/yellow/red per cashOnHand)
  - Updates live on every state change
- **(b) Top-nav cash-chip (also Goal 4):**
  - already covered in Goal 4 — combine implementation with this Goal
- **(c) "Personal" tab within Front Office:**
  - Separate from team-level metrics
  - Shows: GM contract details (salary, years, performance bonus terms), GM reputation, recent personal bonuses/penalties earned from team performance
  - Light-weight first pass — full GM-career-mode is future scope

### Goal 11: Team Finance Graph + Spreadsheet View — IMPLEMENT
- User wants: *"genau mehr team finane sgraph spreadshit simualtor shit fm"*
- Build on existing `TeamFinancesViewDetailed.tsx` — it's already the read-only ledger. Extend with:
  - **Cash-on-Hand line chart** over `tycoon.ledgerHistory` (Recharts already imported — `LineChart` from recharts)
  - **Revenue-vs-Expense stacked-area chart** showing Year-over-Year trend
  - **Sponsorship-by-Slot breakdown** as horizontal bar chart (kit / sleeve / back / shorts / training / court / stadium / practice)
  - **Sortable spreadsheet table** of all yearly ledger entries — columns: Year, Matchday, Sponsorship, TV, Prize, Total Rev, Wages, Staff, Facility, Travel, Medical, Total Exp, Profit, Cash End. Click column = sort
  - **Export-to-CSV button** for the spreadsheet (user can pull into Excel)
- **FM-vibe**: graphs at top, spreadsheet below, filters on the side (Year range, competition)
- Reuse existing visual language. NO raw multipliers visible — only EUR/USD amounts + percentages
- Add to navigation: existing "Team Finances" route + new sub-tabs (Overview / Graphs / Spreadsheet)

### Goal 12 (was B1): Scouting Fuzz — IMPLEMENT (promoted from Optional, user-locked priority)
- Non-own roster ratings shown as fuzzed values; noise band shrinks per team's scouting investment
- File: `src/utils/scoutingFuzz.ts` — `getDisplayRating(player, viewerTid, scoutInvestmentTier)`. Own roster bypasses fuzz.
- Wire into: PlayerBio (when viewing opponent player), Free-Agent list, Trade-Finder previews, Scouting view
- Noise model: ±N where N = `clamp(15 - scoutInvestment * 0.000003, 2, 15)`. €5M scouting investment → ±2 noise. €0 → ±15.
- **Reuse BBGM `player.ratings.fuzz` field if compatible.** Otherwise derived display value.
- Add a `scoutingInvestment` budget slider in Front Office (next to Medical) — Euro-mode only

### Goal 13 (was B2): Loan System — IMPLEMENT (promoted)
- Lend young/fringe player to another club for 1 season; wage-split, original club retains contract ownership, auto-return year-end
- New `state.players[i].loan?: { fromTid, toTid, returnSeason, wageSplit }`
- UI: Team Office → Roster → "Loan Out" + "Loan In" tabs. Available pool = all players with `loan.toTid === userTeamId` for incoming, all loaned-out players for outgoing
- Wage-split: User can negotiate 50/50, 70/30, 100/0 splits — affects loanee club's signing willingness
- Roster math: loaned-out player counts on loanee's roster + cap, off-books for original club for the season
- Auto-return in `seasonRollover.ts` — player snaps back to `fromTid` with contract intact, contract year continues

### Goal 14 (was B5): Board Promises + Confidence — IMPLEMENT (promoted)
- Season-start dialog: Board offers promise targets ("Top-4 Endesa", "Quarter-Final Euroleague", "Develop a Homegrown Star")
- User picks 1-2 promises + commits. Outcome resolved at year-end.
- `tycoon.boardConfidence` already exists (0-100, default 60) — wire actual consequences:
  - **Confidence 80+**: Budget requests +25% likely to pass. Sponsor offers +5% better. Owner-mood-icon: 🟢 Trusting
  - **Confidence 40-79**: Status quo. Icon 🟡 Watching
  - **Confidence <40**: Budget requests blocked. Override-signings cost double mood-hit. Icon 🔴 Furious. Two missed promises in row → board sacking event (separate from bankruptcy game-over — just news event + temporary "On The Hot Seat" badge for v1, full sacking flow deferred to future)
- UI: Front Office gets "Board" sub-section showing current confidence + active promises with progress bars
- News-feed events on year-end: promise-resolved (success/fail with consequences narrated)

### Goal 15 (NEW from user tonight): Staff Hiring Market — IMPLEMENT
- **User-Quote**: *"okay wir konne nschon head coach hiring, assistant coaches hiren warum nicht?? welche staffss?? okay wir konnen ads schon loll.. macht es wir haben schon das konzept somewhere in der datei"*
- **EXISTING infrastructure to USE (do NOT reinvent):**
  - `src/TeamTraining/types.ts` — defines `StaffRole`, `StaffAttributes` (15 attrs incl. offense/defense/tactics/development/conditioning/manManagement/physiotherapy/sportsScience/judgingPlayerAbility/etc.), `StaffMember` (id, name, role, attributes, salary, contractLength), and `Staffing` (headCoach, assistantCoaches[], headOfSportsScience, headPhysio, chiefScout, headOfAnalytics)
  - `src/services/fictionalStaffGenerator.ts` — generator for new staff candidates
  - `src/services/staffService.ts` — staff data layer
  - `src/services/staff/staffFallback.ts` — synthetic placeholders
- **Plumb the existing Staffing struct onto `team.tycoon.staffing` (or `team.staffing` league-agnostic) in Euro mode and wire effects:**
  - `headCoach` → already partially wired via Coaching system (TrainingCenterView)
  - `assistantCoaches[]` → depth bonus, scheme familiarity speedup
  - `headOfSportsScience` + `headPhysio` → stack with Medical Budget — physiotherapy attr reduces recovery further, sportsScience attr reduces injury rate by attr-weighted bonus on top of medicalQuality
  - `chiefScout` → pairs with Scouting Fuzz Goal 12 — judgingPlayerAbility/Potential attrs reduce fuzz band further
  - `headOfAnalytics` → small opponent-prep bonus (game-strategy)
- **Staff portraits → reuse facesjs (BBGM faces library, already in repo).** Wrapper at `src/components/shared/MyFace.tsx` (`facesjs` v5 already in `package.json`). For each `StaffMember` generate a face descriptor on creation (same generator pattern used for `genDraftPlayers.ts` — adapt for adult/older age ranges since staff are 30–65, not draftees). Store the face descriptor on the StaffMember record (`face: FaceConfig` field). Render via `<MyFace face={staff.face} colors={teamColors} />`. **DO NOT** create static portrait assets — faces.js renders deterministically from the descriptor.
  - Add `face?: FaceConfig` to `StaffMember` type in `src/TeamTraining/types.ts`
  - Backfill existing StaffMembers in migration: if `face === undefined`, call generator (use older-age multiplier for hair-grey/wrinkles/beards consistent with role e.g. older for Chief Scout, younger for Analytics)
  - **Why faces.js:** consistent visual language with player portraits, deterministic, zero asset-pipeline cost, regenerates correctly on save reload, scales to any number of generated staff candidates
- UI: NEW "Staff" route under MY TEAM (Goal 0 sidebar restructure) — **MUST match `public/img/ui/staffviewui.png` layout exactly**
  - Header KPIs: Total Staff X/15, Annual Cost €X.XXM, Avg Skill ⭐ rating, Open Roles count
  - COACHING & PERFORMANCE 4-col grid: Head Coach / Assistant Coach / Head of Sports Science / Head Physio cards (portrait, name, personality pill, age, contract years, 5 attribute mini-bars, signature-trait pills)
  - SCOUTING & ANALYTICS 3-col grid: Chief Scout / Head of Analytics / Open Position placeholders with + Hire CTA
  - Right-side collapsible HIRE STAFF MEMBER panel — Candidates/Filters/Compare tabs, Role-tab-strip (6 roles), Role-Focus paragraph, Key-Attributes + Soft-Skills bars, Budget Information, Find-Candidates CTA
  - Click a candidate → opens **Staff Signing Detail-Modal** matching `public/img/ui/staffsigningui.png` (see NORTH-STAR UI MOCKUPS section above for full layout spec). Negotiation sliders + fit-meter + scout report. Submit → updates `team.staffing` + boardConfidence + ledger `expenses.staff`
- Hiring above current staffWages budget → boardConfidence -5 (ties Goal 14)
- Free-agent staff pool regenerates at season-end (cycling, age them, fire some, generate new)
- AI teams: auto-fill Staffing with tier-default attribute spread; user-only sees hiring UI

### Goal 16 (NEW from user tonight): Player Drama + Press Conferences — IMPLEMENT (upgrade existing morale generator)
- **User-Quote**: *"3.. habe nwir shcon morale generator im game.. musst geupgradet sein"*
- Build on existing morale system (`moodTraits`, `morale`, `roleStability` on player records, `MoraleGenerator` in services if exists)
- **Demand-Event triggers (auto-fire in news feed):**
  - Star after MVP-tier season (K2 80+ regular season) → demands re-negotiation +20% within 30 days
  - Bench player after 5+ consecutive DNPs → demands minutes OR trade request → if ignored, mood crashes -20
  - Loaned player called up after strong loan stint → demands first-team role
  - Older vet (age 33+) after sub-par season → considers retirement, asks for one final "respect" deal
- **User responses**: Accept / Decline / Counter-Offer / Promise-for-Later
- **Press Conferences** (light implementation):
  - After big games (win streak ≥5 OR vs marquee opponent OR loss ≥20pts) → press snippet in news feed
  - After signings/firings/major moves → press reaction
  - User can pick tone: "Calm / Aggressive / Honest / Praise-the-Team" — each shifts:
    - Player Trust (calm → +1, aggressive → -2)
    - Public Reputation (honest → +1, aggressive → +2 for fans)
    - Board Confidence (varies)
- **Hotel-mood coupling**: when Goal 12 (hotel/flight tier) lands, demands fire more frequently if travel-tier is below 3-star (Survival-Mode brainstorm reference)
- DO NOT remove or break the existing morale system — extend it

### Goal 17: Hotel-Mood + Survival-Mode Death-Spiral (FUTURE — brainstorm-only)
- User mentioned: *"players kann nicht mit eine 1 star hotel team bleiben"* + *"gameplay wie, okay wir sind nah von bankruptcy, mussen wir economy class sitzen und 1 star hotel haben genauso loll"*
- Two coupled mechanics:

**Mechanic A: Hotel/Flight → Player Mood**
  - Low travel-tier (Bus/2-star hotel/economy flights) hits player morale, especially stars (K2 ≥ 75)
  - Brainstorm: who cares (stars > role players), how much (mood -1 per away game in low-tier?), thresholds (1-star hotel → complaint event after N trips?), interaction with `roleStability`/`moodTraits`

**Mechanic B: Forced Downgrade on Low Cash (Survival Mode)**
  - When `cashOnHand < N` (threshold TBD, maybe €2M or 1 monthly payslip), TravelLogistics tiers AUTO-DOWNGRADE
  - User sees red banner: *"⚠️ Survival mode — €X.XM cash forces economy class + 1-star hotel. Upgrade once cash recovers."*
  - Tier sliders become locked in low position with override forbidden
  - Combines with Mechanic A: forced downgrade → mood crash → performance drop → less prize money → cash stays low → DEATH SPIRAL
  - Recovery: improve cash above threshold → sliders unlock → can re-upgrade
  - Sponsor-disclosure: travel sponsor (if signed) can buffer this — "Flight Sponsor: Iberia covers flights" overrides forced economy

- **Codex action:** create `plans/euro-hotel-mood.md` with a brainstormed AC list for BOTH mechanics. Do NOT code this — leave for user review next session.
- Brainstorm output structure: Mechanic A ACs, Mechanic B ACs, threshold calibration suggestions, interaction matrix (what happens if both fire), UI hooks (where to surface the survival banner)

### Goal 18: Deep Sponsor-Negotiation Modal — IMPLEMENT (was Goal 9, demoted in priority but still required)
> **Mockup to view BEFORE coding (mandatory image-view): `public/img/ui/sponsornegotiation.png`. Match its 3-column layout, Competitive radial gauge, NEGOTIATION STANCE pill selector, BRAND IMPACT + CURRENT-vs-NEW + PARTNERSHIP HISTORY right column EXACTLY. Full textual layout spec is in the "Sponsor-Negotiation Modal layout (sponsornegotiation.png)" section above.**

- User locked design: **Deep mode** (Multi-Klausel + Sponsor-Persönlichkeiten + Commitment-Bets)
- Replace current single-offer SponsorshipNegotiationModal with negotiation UI per mockup:
  - **Years slider** [1y, 2y, 3y, 4y] — different sponsor archetypes prefer different commitments
  - **Annual Value slider** with Sponsor-Mood-Feedback in Worten (no raw multipliers): *"Lowball — BBVA looks offended"* / *"Fair deal"* / *"Premium offer — they'd jump on it"*
  - **Signing Bonus slider** (€0 – computed-max). Longer years unlock higher signing bonuses (Sponsor wants stability)
  - **Performance-Bonus toggle** (optional Wager): "+€300K/yr if EL Final Four" — accepting reduces base value by ~15% but adds upside
  - **Conflict warnings**: if existing kit-sponsor is beer brand, court-sponsor offer from competing beer brand shows "⚠️ Conflict — kit sponsor will renegotiate down €X"
  - **Sponsor Personalities** seeded per `sponsor.industry`:
    - Premium brands (Adidas, Emirates, BBVA): pay top market but demand S-tier results clauses
    - Local banks / municipal: lowball, accept any deal
    - Gambling: pay 50% premium but block future family-friendly sponsors (forward-flag for Phase-3 conflicts)
    - Tech: long-term-focused (prefer 4y), pay premium for marquee NBA-import on roster
  - **2 Counter-Versuche** then sponsor walks away (Negotiate-Button disabled until next offseason for that slot)
- **Commitment Philosophy (locked tonight):**
  - Short deals (1-2y) = low Base, low Signing-Bonus, but flexibility for re-negotiate-up if you perform next season
  - Long deals (3-4y) = higher Base + bigger Signing-Bonus, but locked-in if Inflation rises OR you perform amazingly (Sponsor enjoys the cheap deal at your expense)
  - **Always a bet** — every choice has trade-offs
- **Triggers:**
  - User-initiated: existing Negotiate-Button (status quo, just deeper)
  - **Auto-fire on expiring**: yearsRemaining ≤ 1 → appears in Offseason-Aufgaben list (must address or default-decline penalty)
- **Layout per `sponsornegotiation.png` (must-match elements):**
  - **3-column layout** — left SPONSOR SLOTS rail (8 slots, click-to-switch context), center NEGOTIATING WITH SPONSOR card, right BRAND IMPACT + CURRENT-vs-NEW + PARTNERSHIP HISTORY panels
  - **NEGOTIATION STANCE 3-pill selector** (Conservative / Balanced / Aggressive) — affects sponsor mood-decay rate + upside cap. Default = Balanced.
  - **Competitive % radial gauge** centered — composite competitive-fit score (paired with prose label "Premium offer" / "Competitive" / "Borderline" / "Lowball" / "Insulting")
  - **BRAND IMPACT panel** — 4-5 progress bars (Brand Reach / Global Appeal / Social Reach / Brand Image) explaining the *value-beyond-€€€* of this sponsor. Drives renewal-likelihood, foreign-market multiplier hooks, and prose narration on club events.
  - **CURRENT vs NEW DEAL** 4-row comparison table (Annual Value / Contract Length / Signing Bonus / Performance Bonus) with delta pills. Hidden for first-time signings.
  - **PARTNERSHIP HISTORY** timeline — bar chart with year markers. Requires new field `sponsor.relationshipHistory?: Array<{year, value, eventType: 'sign'|'renew'|'dispute'}>`. Skip panel when no history.
  - **Brand panel** — big logo + product render (Codex creates `public/img/sponsors/{brand}.svg` placeholders if missing)
- **Files:**
  - Replace `src/components/tycoon/SponsorshipNegotiationModal.tsx` content
  - Extend `sponsorshipEngine.ts` with:
    - `evaluateOffer(sponsor, offer, stance) → { competitiveScore: 0-100, moodLabel: string, willAccept: boolean }`
    - `computeBrandImpact(sponsor, team) → { reach: 'Worldwide'|'Regional'|'Local', globalAppeal, socialReach, brandImage }`
  - Add `sponsor.personality` + `sponsor.archetype` to seed pool in `migrate.ts`
  - Extend Sponsor type in `types/tycoon.ts` with `relationshipHistory?`, `personality?`, `archetype?`, `personalityProse?`

## Style & Quality Bar

- **All UI copy in German** (this is the user's language — see `CLAUDE.md`)
- **No raw multipliers in UI** — describe outcomes in words ("Elite performance lab — league-best recovery times", not "0.85 medical quality")
- **No emojis in code** unless user explicitly asks. Status icons (💰 🟢🟡🔴) for UI are OK
- **Use `getTeamFullName(team)`** for any team display — never `${team.region} ${team.name}`
- **Use the season-aware boxScore lookup** (gameId + season) — see CLAUDE.md mistake #11
- **Don't break existing tests** — run `scripts/test-tycoon-sponsor.ts` after each phase, must still pass

## Verifiable Stopping Conditions

Codex stops when ALL of these are true:

- [ ] `pnpm run build` or equivalent type-check passes with zero new errors
- [ ] `scripts/test-tycoon-sponsor.ts` runs and reports all assertions pass
- [ ] All AC-S, AC-M, AC-C checkboxes from `plans/euro-medical-dynamic-tier.md` are checked off in a separate `plans/euro-medical-dynamic-tier-PROGRESS.md` file with file-paths + line-numbers of each implementation
- [ ] `plans/euro-hotel-mood.md` exists with brainstormed AC list (no code)
- [ ] `TODO.md` "NEXT SESSION" block updated: Phase 1+2+3 marked as shipped, hotel-mood listed as next slice
- [ ] `CHANGELOG.md` has a new entry summarizing the work
- [ ] A short progress log at the top of `plans/euro-medical-dynamic-tier-PROGRESS.md` lists each checkpoint Codex completed with timestamps

If Codex gets stuck on a design ambiguity, it should:
1. Re-read the related plan section
2. Check existing memory for hints (`project_euro_bankruptcy_progression.md` is authoritative)
3. **NOT ask the user** (user is sleeping) — make the most conservative choice that doesn't break existing behavior, log the decision in the progress file, and continue
4. If a decision is truly destructive (data loss, save corruption risk), **stop and write `BLOCKED.md`** describing the question

## What Codex Must NOT Do

- Don't introduce `prestigeScore` or tier-promotion mechanic — it was explicitly killed (see memory)
- Don't scale NBA contracts down by /3 or /8 in Euro mode — user vetoed wage-scaling
- Don't surface raw `medicalQuality` floats, `boardConfidence` 0-100 numbers, or sponsor multiplier factors in any UI
- Don't auto-commit or push — user reviews work in the morning
- Don't run `git reset --hard`, `--force` push, or any destructive git ops

---

# ─────────────────────────────────────────────────────────────────
# THE PROMPT (paste this into Codex CLI after `/goal`)
# ─────────────────────────────────────────────────────────────────

```
/goal Wrap up the Euro Mode tycoon system to an FM-Lite playable state. Design north star: BBGM × FM × FIFA hybrid — sim depth, management depth, satisfying polish. **CRITICAL: BEFORE any UI implementation, USE YOUR IMAGE-VIEW TOOL to open ALL TWELVE mockups: public/img/ui/frontofficeviewui.png, public/img/ui/sponsorsviewui.png, public/img/ui/facilitiesviewui.png, public/img/ui/financesviewui.png, public/img/ui/staffviewui.png, public/img/ui/staffsigningui.png, public/img/ui/scheduleview.png, public/img/ui/calendar view.png, public/img/ui/euroleagueschedule.png, public/img/ui/travellogisticsview.png, public/img/ui/medicalview.png, public/img/ui/sponsornegotiation.png. Write a "What I observed" note in PROGRESS.md after viewing each, listing 5-8 concrete UI elements (colors, layout, components, copy). Text descriptions are FALLBACK ONLY — images are authoritative. If you cannot load an image, write BLOCKED.md and STOP — do NOT build UI from text alone.** Think like a game-tester and YouTuber for every screen. User-friendly BUT complex (layered, not dumbed-down). Read README.md, CLAUDE.md, plans/euro-medical-dynamic-tier.md, plans/codex-overnight-goal.md (ESPECIALLY the CRITICAL CONSTRAINTS and NORTH-STAR UI MOCKUP sections), TODO.md, CHANGELOG.md recent sessions, all memory files, and inspect src/TeamTraining/types.ts (Staffing infrastructure already exists — use it for Goal 15) BEFORE writing any code. NBA mode must keep working — every change gated on uiMode === 'euro_isolated'. NBA and Euro calendars run on separate rules. NO max contract in Euro mode (user design — vetoed). User must not get lost — every new screen needs a back-button, a one-sentence subtitle, and match the mockup's visual language. Then execute Goal 0 (Front Office UI Redesign per mockup) FIRST, then Goals 1–17 from plans/codex-overnight-goal.md in order:

(0) Sidebar-Architektur + Front Office UI Redesign per public/img/ui/frontofficeviewui.png — REPLACE the single MY TEAM "Front Office" sidebar entry (Euro+GM only) with INDIVIDUAL sidebar routes: Overview / Finances / Sponsorships / Travel / Staff / Facilities / Scouting. EXCLUDE: Settings, Reports, Youth Academy (NOT added). KEEP existing: Training (existing concept), Squad View, Schedule. Overview route = landing page with Sankey + KPI sparklines + 8-card Sponsorship Portfolio (compact) + Ledger History 5Y stacked-bar. Each smaller card has "→ Manage" CTA to its dedicated route. Match dark-slate visual language. NBA mode untouched.

(1) Commissioner Settings UI — extend EconomyContractsSection with a Euro-Mode-Salaries section (visible only when uiMode === 'euro_isolated'), wire to useRulesState, verify SigningModal now shows €266K min / €5M max instead of €1.06M / €14.52M.

(2) Medical Budget — compact MedicalCard already shipped on Overview; Codex extends to FULL-PAGE per public/img/ui/medicalview.png (STAFF QUALITY radial gauge + IMPACT ON SQUAD 5-stat row + MEDICAL FACILITIES 8-badge list with derived tiers + ANNUAL INVESTMENT wide slider €100K→€15.2M + IMPORTANT NOTE warning + View-Medical-Report CTA). Bump MEDICAL_BUDGET_MAX_EUR to €15.2M. New helpers: getFacilityTier(budget, key) + getImpactStats(quality). Sync slider with Overview compact card. Plumb medicalQuality through InjurySystem (rate × (1 − q×0.30), gamesRemaining × (1 − q×0.15) except season-ending). NBA mode untouched.

(3) Cash-Gate + Sponsor-Floor + GAME OVER — projectYearEndCash helper, SigningModal banner with override + boardConfidence hit, AI hard block, replace sponsor TIER_BASE floor with sponsorFloor(team, slot) formula calibrated so Madrid Year-1 stays within 5% of pre-change, BANKRUPTCY_CHOOSE_TEAM offseason modal that lets the user pick a new Euro team to manage after bankruptcy.

(4) Always-visible cash indicator — small chip in top nav, green/yellow/red, only in Euro GM mode, click → Front Office.

(5) Bi-weekly payslips — deduct wages from cashOnHand every 14 calendar days in Euro mode, log to ledger, news event on low-cash + mid-season bankruptcy. NBA mode untouched. Next-payslip countdown in Front Office.

(6) Finance-Outcome-Modal — after Sim-Blocks ≥3 days in Euro/GM mode, show Cash-In / Cash-Out / Net / Cash-on-Hand / Next-Payday breakdown. Like Commissioner game-recap but for finances. Dismissible with "Don't show again this month" + settings toggle. Files: FinanceRecapModal.tsx, financeRecapBuilder.ts, postProcessor hook.

(7) Offseason + Play-Button UX-Polish — in Euro mode hide NBA-only rows (draftLottery/draft/rookieContracts/expansionDraft), Play-Button label shows what's next ("➡ Sign Your Free Agents · 12 offers waiting"), progress indicator "Phase 3 of 4", German prose confirmation copy. NBA mode unchanged.

(8) Calendar-Skip Bug — getRegularSeasonStartDate(state) helper, NBA → Oct 21, Euro → first scheduled game (Sep 28 fallback). Refactor all 10-21/10-22/10-24 hardcodes. Sim-to-Season in Euro lands Sep 27, not Oct 23.

(9) Schedule Hub Redesign per public/img/ui/scheduleview.png + calendar view.png + euroleagueschedule.png — 3-tab layout (All Competitions / Calendar / Competition Detail). All-Comps landing with competition stat-cards + mini-cal + Upcoming Fixtures + Standings mini. Monthly Calendar grid with game-cards per day + filter checkboxes + right-rail (Upcoming/Filter/MiniCal). Competition Detail drilldown with Standings + Next Match + Team Performance gauges + Top Performers + Key Stats. BoxScore lookups must filter on (gameId, season). NBA mode untouched.

(9b) Travel & Logistics Full-Page per public/img/ui/travellogisticsview.png — 4-tier class selector (Economy/Standard/Premium/Luxury), 3-card grid (Hotels/Planes/Buses) with hero-image + star rating + Key Features + Cost-Per-Trip, Travel Summary 4 tiles, Confirm & Save CTA. Survival-Mode lock-icon on Premium/Luxury when cash low (Goal 17 hook). Existing TravelLogisticsCard becomes Overview-summary with Manage → CTA.

(10) Sidebar Cash-Indicator + Personal Finance tab — €X.XM inline next to Front Office sidebar entry, color-coded, plus "Personal" sub-tab in Front Office for GM contract/reputation/bonuses.

(11) Team Finance Graphs + Spreadsheet — Recharts LineChart for cashOnHand history, stacked-area for revenue-vs-expense, horizontal-bar for sponsorship-by-slot, sortable yearly ledger spreadsheet + CSV export, sub-tabs Overview/Graphs/Spreadsheet on existing TeamFinancesView.

(12) Scouting Fuzz — non-own ratings show fuzz-band, shrinks per scoutingInvestment slider in Front Office. (was B1, promoted)

(13) Loan System — loan-out/loan-in 1-season, wage-split, auto-return. (was B2, promoted)

(14) Board Promises + Confidence — season-start commitments, boardConfidence wired to budget approvals + sponsor offers + 🟢🟡🔴 owner-mood icon, "On The Hot Seat" badge after 2 missed promises. (was B5, promoted)

(15) Staff Hiring Market — extend existing state.staff with salary/contract/available, support Head Coach + Assistants + S&C + Physio + Scouts + Analytics, UI on new MY TEAM → Staff sidebar route. **Staff portraits MUST reuse facesjs (already in repo, MyFace wrapper at src/components/shared/MyFace.tsx). Add face descriptor field to StaffMember type. Backfill existing staff in migration. NO static portrait assets.**

(16) Player Drama + Press Conferences — upgrade existing morale generator with demand-events (MVP-renegotiate / Bench-DNP-revolt / Loan-callup / Vet-retirement-respect-deal) + tonal press-conference responses that shift Trust/Reputation/Board.

(17) Brainstorm-only — create plans/euro-hotel-mood.md with AC list for BOTH (a) hotel/flight → player mood, AND (b) low-cash forces auto-downgrade to economy/1-star creating a death-spiral (mood crash → worse performance → less prize money → cash stays low). Do NOT code this.

(18) Deep Sponsor-Negotiation Modal per public/img/ui/sponsornegotiation.png — 3-column layout: SPONSOR SLOTS rail (8 slots, click-to-switch) / NEGOTIATING WITH SPONSOR center card (brand panel + offer details + paired Sponsor-Request/Sponsor-Interest sliders + Competitive % radial gauge with prose label + NEGOTIATION STANCE 3-pill Conservative/Balanced/Aggressive + Accept/Decline CTAs + 2 Counter-Versuche counter) / right column (BRAND IMPACT progress bars + CURRENT-vs-NEW 4-row diff + PARTNERSHIP HISTORY bar-timeline). Years + Value + Signing-Bonus sliders, Performance-Bonus wager, Sponsor-Personalities (Adidas premium, Local bank lowballs, Gambling +50% but blocks family-friendly), auto-fire on expiring sponsors in offseason list. Was previously Goal 9; demoted because Schedule Hub Redesign took priority — still required.

If runtime budget remains after Goals 1-17, tackle OPTIONAL BONUS GOALS below in order. Stop when stopping conditions met OR when remaining time forces a fresh-context check (write PROGRESS.md update and BLOCKED.md if any).

OPTIONAL BONUS GOALS (if budget remains AFTER 1-17 are done — NOT required to stop):
- **B3** Buyout Clauses (Euro-style): contracts optionally carry `buyoutClauseUSD`; any rival club can pay it unilaterally to sign player.
- **B6** Installment Transfer Payments: 40/30/30 split for buyouts/transfers, P&L recognises year-by-year.
- **B7** Contract Amortisation: 5-year €25M deal spreads as €5M/year on the P&L for FFP purposes (separate from cash paid).
- **B8** Foreign Affiliates: cheap "establish affiliation" action, small boost to sponsor renewal foreign-market multiplier.

DEFERRED TO FUTURE (do NOT implement tonight even if runtime remains):
- **F1** Bonus-sweetened Contracts (appearance/win/championship — user explicitly said "ist fur zukunft features")
- **F2** Relegation Endesa → LEB Oro
- **F3** Board-Sacking failure-mode (separate from bankruptcy)
- **F4** Ownership-Change failure-mode
- **F5** GM-Career-Reputation-Persistence (user picked "Fresh start — Option 1 einfacher zu sein")

Each B-goal is independent — implement only if Goals 1-17 are 100% done. NEVER cut corners on 1-17 to start a B-goal.

Self-audit each Goal through 5 lenses before marking complete (BBGM-sim-depth / FM-management-depth / FIFA-polish / Game-tester-clarity / YouTuber-drama). Iterate if any lens fails.

Validate after each phase: `pnpm run build` clean, `scripts/test-tycoon-sponsor.ts` passing, NBA save still loads + plays correctly. Track progress in plans/euro-medical-dynamic-tier-PROGRESS.md with timestamps + file:line citations + a "lens audit" mini-table for each goal. Update TODO.md and CHANGELOG.md when done.

Stopping conditions are listed in plans/codex-overnight-goal.md "Verifiable Stopping Conditions". User is asleep — do not ask questions, make conservative choices, log decisions, only stop with BLOCKED.md if a choice would risk data loss. All UI copy in German. No raw multipliers in UI. Do not introduce tier-promotion or wage-scaling — both vetoed by user, see memory project_euro_bankruptcy_progression.

Work in checkpoints, test after each, keep going until all stopping conditions are met.
```
