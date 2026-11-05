# CLAUDE.md

## Communication
**Language: German (Deutsch).** All responses from Claude should be in German.

## STOP — How this user works (READ FIRST, OVERRIDES EVERYTHING BELOW)

**This project has plan files in `plans/` and `docs/superpowers/plans/`. When the user says "continue", "weiter", "resume", "mach weiter", or points to TODO.md / a plan file:**

1. **Read the plan file.**
2. **Pick the next open item.**
3. **Write the code. Commit.**
4. **Repeat.**

That is the whole workflow. No `AskUserQuestion`. No skill loading. No "subagent-driven-development". No 32-task tracker. No spec-review + quality-review subagents per file. No "let me brainstorm first". **No ceremony.**

If you feel the urge to invoke `superpowers:*` skills or dispatch reviewer subagents, **stop.** The user wrote the plan and wants direct implementation without unnecessary process overhead.

**Hard rules:**
- NEVER `git reset --hard` when there is uncommitted work. Use `git revert <commit>` or cherry-pick. The user works in a heavily-dirty worktree on purpose; reset destroys their progress.
- Test files are allowed and encouraged when they validate meaningful calculations, simulations, state transitions, persistence, gameplay actions, or regressions. Do not add tests solely to inflate counts.
- Keep small helpers cohesive; a dedicated test file is appropriate when it protects meaningful behavior or a regression, even if the helper itself is short.
- NEVER bundle "parallel WIP" into a commit unless the user explicitly says so in *this* session — past approval doesn't carry over.
- Autonomously run the relevant dev server, lint, type check, build, tests, audits, simulations, and local browser automation required by the policy below. Do not wait for the user to request normal repository-scoped verification.
- **Performance maxxing** = make an existing workflow materially faster and more responsive while preserving the same gameplay result, deterministic ordering, state semantics, source fidelity, and visible output. It means optimization, caching, indexing, batching, lazy hydration, and cooperative rendering—not deleting work or changing results. Progress UI uses real milestones or heartbeats and never advances ahead of completed work.
- Test and diagnostic files are permitted, including temporary failing regression tests while investigating. Keep reusable harnesses in clear test paths and leave generated saves, logs, screenshots, browser profiles, and benchmark output untracked unless intentionally maintained by the repository.
- Treat every user-named prototype/source folder as a read-only canonical reference, never as a second workspace to copy wholesale into this repo. Port only files demonstrably consumed by the main app and place them directly in established `src/`, `public/`, or canonical data paths. Never import nested `.gitignore`, `.env*`, API keys/tokens, AI Studio metadata/assets, prototype README, package manifests/locks, TypeScript/Vite/build config, `index.html`, duplicate app shells, duplicate runtime assets, or one-off helpers. Before handoff, audit the intake tree for nested app scaffolds, secret patterns, duplicate assets, and disposable scripts. Never print a discovered token again; redact it from documentation and leave secrets only in the existing local gitignored environment.
- BEFORE writing a new file, grep the codebase for the symbol/feature. If it already exists, extend it instead of duplicating.
- This game already has extensive shared helpers, utils, fetchers, and canonical data sources. Before adding any helper, mapping, lookup, or static dataset, search for and reuse the existing path. Never create parallel nationality/frequency, flag, team-name, logo, rating, date, roster-source, or league-settings logic when the game already provides it.
- **Existing UI first; do not overengineer.** Before creating a modal, panel, form, confirmation step, or task-specific workflow, find the equivalent live GM/game surface and route into it. Commissioner/offseason tasks are normally portals plus saved completion state, not replacement implementations. Keep the existing player-card actions, signing modal, draft view, league-history detail, governors-board meeting, settings screen, and other mature flows unchanged unless the user explicitly requests a redesign.
- When a task opens an existing destination, put task guidance and `Mark Done` on that destination page. Do not wrap the destination in a duplicate task modal, make the user click a second `Open ...` button, or invent a parallel "commissioner override/placement/review" mechanism.
- Never put implementation instructions in visible copy. Labels such as `chevrons only`, `workflow`, `resolver`, `oversight`, `portal`, `override path`, or similar developer notes belong in source/docs, not the game UI.
- Resolve player countries, country filters, and FIBA eligibility through the shared player-nationality parser. Never expose raw values such as `Albania / Turkey`, `Moldova / Ukraine`, or `Malaga, Spain` as one country option; dual nationality remains two filterable countries and birthplace strings contribute only their canonical country.
- Offseason UI copy must read like player-facing game text, not internal pipeline/dev-tool wording. Avoid labels like "Offseason Flow", "Phase", "task resolver", or other implementation language when the user will see it.
- Never expose hidden systems or internal mechanics in player-facing UI copy or normal user summaries. Avoid phrases like `exact internals`, `fuzz`, `fog`, `scout read`, `hidden formula`, `weight`, `band`, `roll`, `RNG`, `computed estimate`, or similar implementation disclosures unless the user explicitly asks for debugging/technical detail.
- Never describe visible UI in terms of data plumbing or merge mechanics. Player-facing copy must not say things like "loaded from gist", "blended with your save", "synced from archive", "written into history", "ingested", or similar provenance/process language. The UI should say what the screen means in basketball terms, not how the app assembled it.
- Multi-year/historical NBA starts are what-if branches, not a replay connection to real NBA history after the selected start date. After the branch, UI, AI-GM, Draft, Awards, HOF, Retired Jerseys, Records, contracts, and team achievements must not show or use later real-life outcomes, real draft positions, or hindsight provenance; only history completed before the start is visible.
- Trade history for AI, GM, and Commissioner trades uses saved structured movements (`transactionId`, canonical date, from/to team IDs, player IDs, draft-pick snapshots, and cash) as the source of truth. Free text is presentation and Social/News input only; Transaction filters, grouping, and Trade Details must not depend on its wording. Pick snapshots retain year, round, and original team so the eventual drafted player can be resolved.
- Signing and re-signing history mirrors the Player Movement envelope (type/date/description, team/player ID and slug, sort fields) and stores contract snapshot, length/type/option, contract years, salary stints, and `salaryReflected`. Player state and that structure are canonical. Factual Transactions state only the movement and contract terms; return/former-league/`previously with` storylines belong exclusively to Social/News and must never feed Transaction copy, parsers, or gameplay state. International tournament identities may become ordinary free agents. Only a verified future canonical draft class protects that person as a Draft Prospect until the class year; a legacy repair restores the draft year but never imports the later real-world pick or destination team.
- Historical NBA source priority: native/branch-safe data is the baseline for simulation, contracts, active rosters, and post-start outcomes. Richer full-file community roster data should still be used as cutoff-safe enrichment for pre-branch history surfaces when it is more detailed: prospect/player portraits, explicit retired jerseys, team seasons/playoff labels, franchise leader totals, source-only retired-player rows, and dated team identity. Do not replace branch results with later real-life facts, but do not drop richer pre-branch details just because the native row is sparse.
- Never show BBGM/internal ratings in visible UI. If a user-facing surface displays an OVR/rating number, it must be on the K2/2K scale; internal scales may only appear in explicit debug tooling or technical discussion the user asked for.
- Scouted player ratings must use the same canonical helpers from `src/utils/scoutingFuzz.ts` across every GM-facing surface. Free Agency market/Team Intel, Player Ratings, progression, Player Bio, and comparable OVR/POT views must not drift between scouted and exact K2 values or render raw ratings directly; player-facing copy must not name the internal variance.
- PBA/external OVR rule: real/imported PBA roster ratings are league-multiplier scaled like Euroleague, not repaired with `EXTERNAL_LEAGUE_OVR_CAP`. `ratings[].ovr` on external players may be raw/source-like; the canonical league-scaled OVR is `player.overallRating` from `computeLeagueOvr()` in `src/services/externalRosterService.shared.ts`, using `LEAGUE_MULTIPLIERS`. Never fix PBA display/import inflation by applying `EXTERNAL_LEAGUE_OVR_CAP.PBA` as a UI or real-roster cap; the known regression is many PBA players collapsing to 71 K2/2K. If PBA looks correct in Euro/external mode but wrong in PBA-isolated mode, inspect `fetchPBARoster`, `computeLeagueOvr`, `getDisplayOverall`/`getScoutedDisplayOverall`, and status/TID mapping before changing caps.
- Multi-league saves are a core use case. NBA, PBA, Euroleague, WNBA, and other leagues may coexist in the same save; fixes must preserve league buckets by `league`, `status`, TID ranges, `competitionId`/`uiMode`, and lifecycle state. Never repair one active league by overwriting, clearing, regenerating, or silently mutating another league's `players`, `teams`, `nonNBATeams`, awards, schedules, standings, playoffs, free agency, or rollover state.
- Start every fix with a mode blast-radius audit: classify each touched path as league-scoped or shared, then inspect its callers across NBA, WNBA, PBA, Europe, college, fictional, historical/modern, and GM/Commissioner/Career flows. A change to shared state, lifecycle, simulation, schedules, player identity, portraits, ratings, history, draft, offseason, or save/load is never complete after testing only the reported mode. Run the affected mode, NBA baseline, at least one other external mode, fictional, and both GM/Commissioner roles when role branching exists. A league-scoped fix needs a negative isolation test proving an unaffected mode or background-league bucket is unchanged. State the executed mode matrix in the handoff; untested modes remain `Verification pending` and must not be described as bug-free.
- Fictional leagues have their own generated fictional logos and branding. Logo fixes for historical NBA, PBA, or modded real-world modes must be mode-scoped and must never globally replace fictional-team logos with NBA, BBGM, historical, or external-league assets.
- Mobile first. Every new or edited UI surface must work on narrow phone widths before desktop polish: no clipped modals, no fixed desktop grids on mobile, no hidden overflow without a usable vertical scroll path, and no horizontal-only table layouts unless a mobile card/list fallback also exists.
- NEVER hardcode gameplay/economy settings (salary cap, contract scales, league toggles, commissioner-configurable rules). Read them from `leagueStats`, setup payload/state, or commissioner settings flow.
- Fine controls always reuse the Signing/Euro negotiation pattern: start at a native recommended amount, adjust only through mobile-safe left/right chevrons, allow increases without an artificial gameplay cap, and never render a freely editable amount input. Persist a numeric amount and derive the recommendation from league-/era-appropriate save facts without exposing an internal formula in the UI.
- Youth-Academy-/Discovery-/Scouting-Karten rendern Positionen immer über `normalizePositionLabel()` aus `src/utils/positionUtils.ts`. Keine rohen Source-Kombinationen oder lokalen String-Replacements: `SF/PF` wird `F`, `PF/C` wird `FC`; reine Positionen wie `C` bleiben erhalten.
- Youth Academy ownership is not senior promotion. Unpromoted academy players must remain outside `isOnRoster`, Depth Chart, rotation, senior payroll/stats, and game eligibility even when academy ownership internally uses the club TID.
- Historical/what-if starts never import stats or awards from the active real-world season. An October 2015 start treats 2015/16 as branch state and may import only history completed through 2014/15; active Stats and Leaders read played branch box scores and all visible numeric outputs must remain finite.
- GM-mode Staff chat is role-scoped and shared across NBA, Euro, PBA, and fictional modes. Every saved member of the managed club's Staff must be selectable and receive only job-appropriate saved facts: medical Staff get current/branch injury reports, Academy Staff get assigned youth plus visible evaluations/focus/report provenance, coaches get senior-team context, and Regional Scouts get only their own mission availability/history/reports. Do not use generic courtesy replies for supported factual questions, leak hidden ratings or another Scout's work, or let generated text mutate gameplay state.
- Bug/feature lists and rolling master plans give every item an explicit honest status using the existing audit convention: `Fixed (worktree)`, `Partial`, `Open`, or `Verification pending`. `Fixed` never implies browser verification, commit, or shipment. Whenever status changes, synchronize the master plan/audit with `TODO.md`, `CHANGELOG.md`, and `README.md` when operating state changes.
- Every new feature, revamp, audit, handoff, or plan Markdown file must include a concrete acceptance checklist from its first revision. Each item records `Fixed (worktree)`, `Partial`, `Open`, or `Verification pending`, the authoritative source/data path, and missing evidence. Narrative-only plans and one blanket `Fixed` status at the end are not acceptable; maintain the checklist during every implementation pass.

## Lossless TODO / Changelog Reconciliation (Mandatory)

Cleaning `TODO.md`, an audit, handoff, or rolling master plan is a **semantic documentation migration**, never a text-cleanup exercise. Both invariants must hold:

> Everything in `TODO.md` still requires a concrete action.

> Every genuinely unfinished requirement from the original source survives with its current status and unique acceptance criteria.

For every cleanup or reconciliation pass:

- Inspect `git status` and create timestamped backups of every Markdown file that may change before writing. Preserve unrelated user/developer changes.
- Read the complete original/pre-cleanup backlog, the current cleanup target, `NEW_FEATURES.md`, and the relevant full `CHANGELOG.md` chronology. If the original source is missing or inaccessible, do not declare the shortened file authoritative; report the missing source as a blocker.
- Treat `CHANGELOG.md` as chronological evidence, not a keyword status dictionary. Later sessions may close or narrow earlier `Open`/`Partial` statements. `Fixed (worktree)` does not prove browser, save/reload, shipment, or commit acceptance unless that evidence is explicitly present.
- Before editing, build a requirement ledger. Give every substantive requirement a stable manual identity, original section/session, current semantic status, evidence, destination (`TODO`, `NEW_FEATURES`, or `CHANGELOG/already archived`), and whether the current cleanup preserved, merged, reclassified, or lost it. The final count of unresolved requirements without a disposition must be **0**.
- Determine status from the complete sentence and surrounding context, never merely from `[x]`, `[ ]`, `Fixed`, `Open`, `Partial`, `pending`, `deferred`, `verification`, or similar tokens. Search may locate candidates; regexes, parsers, keyword classifiers, migration scripts, and mass replacements must never decide semantic status.
- Assign each requirement exactly one semantic disposition: `Active Open`, `Partial`, `Verification only`, `Completed`, `Deferred/Future`, `External/User dependency`, or `Mixed`. When evidence is genuinely ambiguous, keep the concrete item open and visibly mark the uncertainty; never silently delete it.
- Split mixed entries by meaning. Confirm or concisely add the completed implementation in the changelog, retain a missing source/decision as Open/Dependency, and retain only the exact outstanding acceptance as Verification.
- A missing dataset, asset, credential, license path, or user approval is `Open / blocked dependency`, never `Verification pending`. An implemented foundation does not satisfy the missing dependency.
- Use `Verification pending` only when implementation actually exists. Each checkbox must be one coherent, independently completable acceptance package. Never compress unrelated systems, modes, or product boundaries into vague mega-checkboxes.
- Consolidate duplicates only when they represent the same remaining work. Preserve every unique exact-save path, Desktop/390×844, IndexedDB, Offline/404, Fast/Realistic, GM/Commissioner, cutoff, year boundary, league-isolation, negative-fixture, and concrete-source criterion.
- Remove a historical session dump from `TODO.md` when no action remains. If one subrequirement remains, keep only today's actionable remainder and required acceptance; completed history belongs in `CHANGELOG.md`.
- `NEW_FEATURES.md` is not a dumping ground. Genuine `Deferred`, future, and documentation-only ideas stay there. Work explicitly confirmed as `Priority Open`, an active to-do, or a real `Partial` implementation boundary remains granularly visible in `TODO.md`, even when its detailed specification also lives in `NEW_FEATURES.md`.
- A broad full-game, cross-mode, or QA item never subsumes a concrete open implementation requirement. Implementation and acceptance remain separate requirement identities.
- Before handoff, reread the final TODO top to bottom, reread changed changelog/new-feature portions, and inspect the final diff against both backups and the original source. Relocate every original Open/Partial/Dependency/Missing-Evidence candidate and manually verify its context against the ledger.
- Report original→rejected-cleanup→final lines/sections; Open, Partial, Verification, Deferred, Completed, and Dependency counts; mixed splits; duplicate consolidations; restored and status-corrected requirements; and `unresolved without disposition = 0`. Do not claim builds or tests for a Markdown-only pass.
- Do not create a permanent cleanup engine for these documents. Remove rejected temporary cleaners/previews after preserving any useful evidence; semantic review remains model/human reasoning.

## Autonomous Testing and Full-Game Validation Policy

### Resource Policy

The user is now on a 5× plan. Token conservation is no longer a development objective.

Prioritize:

1. Correctness
2. Comprehensive testing
3. Regression prevention
4. Save-file integrity
5. Performance and bottleneck detection
6. Reliable long-term simulation
7. Clear diagnostics

Do not reduce testing depth merely to save tokens or computation. Use as much context and analysis as reasonably necessary to understand interconnected systems before modifying them.

Avoid wasteful repetition, but never sacrifice correctness or validation for token savings.

### Test Files Are Allowed

Test files are explicitly allowed in the repository again.

This includes, but is not limited to:

- `*.test.ts`
- `*.spec.ts`
- integration tests
- simulation tests
- regression tests
- smoke tests
- browser automation tests
- headless gameplay tests
- save/load tests
- performance benchmarks
- temporary diagnostic tests

A red or failing `test.ts` file is allowed while actively diagnosing a problem. Do not delete a useful failing test merely because it exposes an existing bug.

### Ambiguous Bug Fixes: Test First

When a reported bug has more than one plausible cause, its intended behavior differs by mode, or the screenshot alone does not prove which state transition is wrong, prioritize a focused `*.test.ts`, exact-save audit, or diagnostic harness before changing production code. The test must reproduce the disputed behavior and state the expected mode-specific invariant. Only patch production code after the evidence identifies the failing rule; keep the regression test afterward. Do not make speculative direct fixes to ambiguous offseason ordering, hydration, simulation, staff, draft, calendar, or multi-league state.

One shallow happy-path assertion is not enough when the disputed rule varies by mode, league, era, class size, calendar, or persisted state. Add counterexamples and boundary cases that would fail under the plausible wrong implementations, exercise the real dispatcher/service path where practical, and include exact-save or save/reload evidence whenever persistence is part of the report. GM and Commissioner flows are distinct products: test their task order, blockers, auto-resolution, and completion semantics separately, and allow their ordering to differ when their responsibilities require it.

Tests should ultimately pass before a task is considered complete unless the failure documents a verified pre-existing issue that cannot safely be fixed within the current task. In that case, clearly report it.

Do not create meaningless tests only to increase test counts. Focus on calculations, simulations, state transitions, persistence, gameplay actions, and regressions.

### Existing Audit and Cheat Utilities

The repository contains cheat codes, audit commands, debug utilities, or validation tools intended for development.

Use them proactively.

Run relevant audit tools after major changes and during full-game simulations. Do not wait for the user to request an audit explicitly.

Prefer existing project utilities over duplicating their behavior. Extend them when necessary.

Audit results must be treated as real failures when they reveal:

- invalid standings
- broken schedules
- corrupted rosters
- duplicate IDs
- missing entities
- invalid finances
- impossible statistics
- failed offseason transitions
- broken save/load behavior
- inaccessible gameplay actions
- stalled simulation phases
- uncaught errors
- `NaN`
- `Infinity`
- required `undefined` or `null` values

### Permission Policy

Assume approval for normal repository-scoped development operations, including:

- reading repository files
- editing repository files
- creating tests
- creating diagnostic scripts
- running tests
- running builds
- running type checks
- running linters
- starting the local development server
- using local browser automation
- creating temporary local save files
- running simulations
- running existing audit and cheat utilities
- profiling CPU time and memory
- inspecting logs
- taking local screenshots
- resetting disposable test saves
- creating Git diffs and repository-scoped backups

Do not repeatedly ask permission for these normal operations.

This approval does not include destructive system-wide actions, deleting unrelated user files, publishing externally, modifying external accounts, exposing secrets, or making irreversible remote changes.

### Headless Full-Game Simulation

Before the user manually plays a newly implemented or significantly modified system, attempt to validate it automatically.

Create and maintain a reusable headless full-game simulation harness capable of playing the game without manual interaction.

The harness should use the real game systems wherever practical rather than replacing them with simplified mock logic.

It must be able to:

- create a new league
- select a team
- navigate required setup screens
- advance dates
- simulate individual games
- simulate days
- simulate weeks
- simulate complete regular seasons
- simulate playoffs
- process awards
- process offseason tasks
- complete drafts
- complete free agency
- complete transfers where applicable
- process contracts
- process retirements
- process league transitions
- save the game
- reload the save
- continue into the next season
- repeat for multiple seasons

Use deterministic random seeds whenever the game supports them. Always include the seed in failure reports so the failure can be reproduced.

### Required Modes

Run headless validation across every currently supported game mode, including:

- NBA mode
- WNBA mode
- European mode
- PBA mode
- college mode when available
- commissioner mode when available
- general manager mode when available
- career mode when available
- fictional leagues when available
- historical leagues
- modern leagues

Do not assume that success in NBA mode proves that another mode works.

Do not close a shared-path bug from a single-mode regression test. Record the touched mode gates and run the cross-mode matrix defined above; mode-scoped fixes still require a negative isolation assertion.

Each mode should have at least one smoke simulation. Important or recently modified modes should receive deeper multi-season simulations.

### Historical Eras

Test all materially different eras and rulesets.

At minimum, sample:

- earliest supported historical start
- pre-modern era
- expansion-era save
- salary-cap transition era where applicable
- modern era
- latest supported season
- future fictional continuation

Where the game changes rules, team counts, playoff formats, schedules, finances, contracts, competitions, or presentation by era, test both sides of the transition.

Test saves that cross important historical transition years rather than testing only isolated starting seasons.

### European Mode Coverage

European mode testing must include, where implemented:

- domestic regular season
- domestic standings
- domestic playoffs
- promotion and relegation
- EuroLeague participation
- EuroCup participation
- continental qualification
- licensing decisions
- invitations
- transfer windows
- player transfers
- registration rules
- domestic and continental schedule interaction
- budget and payroll behavior
- offseason transitions
- multi-season continuity

Check that domestic and continental games do not create invalid schedule overlap or impossible progression states.

### PBA Mode Coverage

PBA mode testing must include, where implemented:

- conference transitions
- import selection
- team movement
- trades
- standings
- playoffs
- offseason events
- commissioner actions
- PBA-specific special events
- mode-specific finances
- multi-season continuation

### Gameplay and Clickable UI Validation

Headless testing must not be limited to direct function calls.

Use browser automation for important user-facing workflows. Interact with the actual application by clicking buttons, selecting options, opening modals, submitting forms, navigating tabs, and advancing the game.

Validate that:

- visible buttons are clickable
- buttons perform the expected action
- disabled buttons are disabled for a valid reason
- modals open and close
- forms submit correctly
- navigation does not become trapped
- required tasks can be completed
- offseason task lists advance
- no permanent loading state appears
- no invisible overlay blocks interaction
- no uncaught browser error occurs
- no important action requires an undocumented manual workaround

Prefer stable semantic selectors such as roles, labels, accessible names, and test IDs. Avoid fragile selectors based only on visual position or generated class names.

### Game Simulator, Play-by-Play, and Match Resolution

Treat the game simulator screen and match engine as gameplay-integrity systems, not visual polish. Validate both `Fast` and `Realistic` simulator paths wherever the mode supports them, including games opened from the schedule, live simulation, pause/resume, speed controls, skip-to-end, and completed-game navigation.

Validate that:

- the visible clock, period, possession, score, team identity, lineups, and player state match the canonical game state
- play-by-play events are chronological, readable, attributed to the correct player and team, and produce the displayed score change exactly once
- made and missed shots, free throws, fouls, turnovers, rebounds, assists, substitutions, timeouts, injuries, ejections, and other supported events update box scores and team totals correctly
- substitutions obey eligibility and lineup rules and do not duplicate, lose, or activate invalid players
- period boundaries, halftime, end-of-regulation, finalization, and postgame navigation occur once and cannot leave the game stuck
- a tied regulation game enters the correct overtime procedure instead of ending, skipping ahead, or corrupting the score
- single and multiple overtime periods use the correct mode-/era-specific duration, reset rules, possession state, foul handling, and clock behavior
- shootouts or other special tiebreak procedures run only in modes and competitions whose rules require them, use eligible participants, resolve the tie exactly once, and persist the official result without contaminating regulation or overtime statistics
- modes without a shootout never enter one accidentally
- the final score, winner, standings result, schedule row, box score, player statistics, team statistics, records, finances, news, and saved/reloaded game state all agree
- replaying, reopening, saving, or reloading a completed game does not apply its result or statistics twice
- simulator controls remain clickable and no overlay, animation, loading state, stale event queue, or uncaught error traps the user

Test regulation finishes, close games, blowouts, tied regulation, one overtime, multiple overtimes, and every implemented special ending with deterministic seeds when possible. Any mismatch among play-by-play, visible simulator state, canonical result, standings, or persisted statistics is a real failure.

### Standings Validation

After schedule generation and after every major season phase, verify:

- wins and losses match completed games
- total team games are correct
- standings ordering follows the correct rules
- ties and tiebreakers resolve correctly
- playoff qualification matches standings
- no team receives duplicate games
- no required game is missing
- home and away totals are valid where applicable
- conference and division totals are valid
- points-for and points-against totals match game results
- postseason results do not contaminate regular-season standings
- continental and domestic standings remain separate where required

### Financial Validation

Check finances throughout the season and offseason.

Validate:

- cash balances
- revenue
- expenses
- payroll
- salary-cap calculations
- luxury-tax calculations
- contract values
- transfer fees
- signing bonuses
- staff costs
- facility costs
- scouting costs
- competition revenue
- prize money
- owner or commissioner budgets where applicable

Fail on:

- unexpected negative values
- `NaN`
- `Infinity`
- unexplained money creation
- unexplained money destruction
- duplicate payment
- missing payment
- incorrect currency handling
- broken rollover between seasons

Allow legitimate negative balances only when the game rules explicitly support them.

### Roster and Entity Validation

Regularly validate:

- unique player IDs
- unique team IDs
- unique game IDs
- unique contract IDs where applicable
- every active player belongs to a valid team or valid free-agent pool
- no player appears on multiple active rosters
- roster sizes follow mode rules
- retired players are not active
- released players are removed correctly
- transferred players change registration correctly
- team references point to existing teams
- competition references point to existing competitions
- no orphaned records remain after deletion, relocation, promotion, relegation, or defunct-team processing

### Statistical Validation

Check that:

- team totals match player totals where expected
- player games played do not exceed team games without a valid reason
- minutes and possessions remain valid
- percentages use valid denominators
- league leaders are selected from eligible players
- awards use valid candidates
- historical records update once
- playoff statistics remain separated when required
- no stat becomes `NaN`, `Infinity`, or an impossible negative value

Use tolerances for floating-point calculations where exact equality is inappropriate.

### Offseason Validation

Exercise every available offseason task.

Detect:

- tasks that cannot be completed
- tasks that disappear prematurely
- tasks that remain permanently incomplete
- circular dependencies between tasks
- buttons that do nothing
- repeated dialogs
- invalid task ordering
- missing required data
- failed year advancement
- corrupted contracts
- incomplete drafts
- incomplete free agency
- broken promotion or relegation
- broken licensing or invitation decisions
- incorrect roster reset
- schedule generation failure
- save corruption after offseason completion

Measure how long each offseason phase takes and identify unusually slow tasks.

### Save and Reload Validation

At important checkpoints:

1. Save the game.
2. Reload the written save.
3. Validate entity counts.
4. Validate team and player assignments.
5. Validate current date and season phase.
6. Validate standings and schedule state.
7. Continue simulation from the reloaded save.

Do not treat successful serialization alone as proof of correctness.

Check that the reloaded state is functionally equivalent to the state before saving.

Use timestamped backups before overwriting important development saves.

### Performance and Bottleneck Detection

Profile full-season and multi-season simulations.

Measure at least:

- league creation
- schedule generation
- one simulated game
- one simulated day
- one simulated week
- full regular season
- playoff simulation
- awards processing
- each offseason task
- draft processing
- free agency
- transfer processing
- save serialization
- save reload
- next-season initialization

Report:

- total elapsed time
- slowest phases
- unusually slow games or dates
- repeated expensive functions
- excessive database or storage activity
- long main-thread blocking
- memory growth
- possible memory leaks
- increasing simulation time across seasons

Do not optimize blindly. First reproduce and measure the bottleneck.

### Crash and Failure Reporting

On failure, preserve as much reproducible context as possible.

Report:

- mode
- starting year
- current season
- current date
- season phase
- team controlled
- random seed
- most recent user or automated action
- failing test name
- stack trace
- browser console errors
- relevant entity IDs
- relevant save-file path
- recent simulation log
- timing data
- memory data when available

Save a minimal failing reproduction when practical.

Fail fast on structural corruption, but preserve diagnostic information before stopping the affected run.

### Multi-Season Stress Testing

After a detailed one-season test passes, run multi-season stress tests.

Use multiple modes, eras, teams, and deterministic seeds.

The goal is to expose failures that appear only after:

- repeated offseason transitions
- long contract histories
- repeated drafts
- repeated expansion or contraction
- promotion and relegation cycles
- historical rule transitions
- large statistical histories
- accumulating news or transaction records
- save/load repetition
- player retirement and regeneration
- team defunction or relocation
- continental competition qualification changes

Run a bounded smoke batch first so obvious failures are reported quickly.

After the bounded batch passes, the test harness may continue running seasons repeatedly while the active development session remains open, until:

- the user explicitly says to stop
- the process is manually interrupted
- a critical reproducible failure is found
- the configured safety limit is reached
- the environment terminates the process

Do not claim to continue testing after the active process or coding session has ended.

The continuous runner must periodically write progress and checkpoint reports rather than remaining silent.

### Recommended Continuous Test Matrix

Rotate through combinations such as:

- NBA modern
- NBA historical
- NBA earliest supported era
- WNBA modern
- European domestic-only
- European domestic plus continental competition
- PBA
- fictional league
- expansion or contraction scenario
- promotion and relegation scenario
- different controlled teams
- different random seeds

Do not run only the same league repeatedly.

### Completion Standard

A feature is not complete merely because it compiles or renders once.

Before reporting completion, run the relevant combination of:

- parser or syntax validation
- lint
- type check
- focused unit tests
- integration tests
- headless gameplay test
- full-season smoke simulation
- save/reload validation
- audit utilities
- production build

For changes affecting simulation, finances, standings, scheduling, contracts, saves, offseason progression, or cross-mode logic, a full-season headless test is expected whenever technically feasible.

For broad engine changes, run at least one multi-season simulation.

Clearly distinguish:

- tests that passed
- tests that failed
- tests that were not run
- limitations of the test environment
- pre-existing failures
- newly introduced failures

Never state that everything works when only a narrow path was tested.

### Repository Discipline

Keep the headless test harness reusable and separate from production gameplay code where practical.

Do not leave uncontrolled infinite loops in normal application startup.

Continuous simulation must require an explicit test or development command.

Do not commit generated saves, large logs, screenshots, browser profiles, benchmark output, raw audit files, or temporary reports unless the repository intentionally tracks them.

Add appropriate generated test artifacts to `.gitignore` when needed.

Do not weaken production validation merely to make a test pass.

Fix the underlying bug instead of changing assertions to accept invalid behavior.

## Workflow: AskUserQuestion only when truly needed

The `AskUserQuestion` rule in this section applies ONLY to genuinely novel architecture work where the plan file is silent. If the plan file or TODO answers the question, skip the prompt.

These bugs have shipped multiple times across sessions. Before writing code, scan this list and check whether your change is about to repeat one of them.

1. **Team name rendering — ALWAYS use the canonical helper.**

   `NBATeam.name` is **inconsistent**:
   - Real NBA teams: `name = "Houston Rockets"` (already contains region)
   - Expansion/legacy/some-imports: `name = "Blue Chips"` (nickname only)

   **Naive options both fail:**
   - `team.name` alone → "Blue Chips" with no city in expansion case
   - `${team.region} ${team.name}` → "Houston Houston Rockets" / "Miami Miami Heat" / "Golden State Golden State Warriors" in normal case

   **Always use** `getTeamFullName(team)` from `src/utils/teamNames.ts`. It checks `name.startsWith(region + ' ')` — returns name as-is when prefix already there, otherwise prefixes. Same module exposes `getTeamNickname(team)` for the inverse.

   ```ts
   import { getTeamFullName } from '../utils/teamNames';
   <h2>{getTeamFullName(team)}</h2>          // "Houston Rockets" or "Las Vegas Blue Chips"
   ```

   **Defense at write-side too:** when constructing a new team object (e.g. in `APPLY_EXPANSION_REALIGNMENT` reducer), set `name: \`${spec.region} ${spec.name}\`` so downstream code that uses `team.name` directly still gets a sane string.

   **Never** write `${team.region} ${team.name}` inline. Cite this rule in any PR review where you see the pattern.

   This also applies to **stored/result labels**, minigame/live-contest builders, history rows, option labels, and news snippets. Do not "just build a label" with `region + name`; if the source is an NBA/league team object, resolve through `getTeamFullName(team)` first. The recurring symptom is `Boston Boston Celtics` / `Los Angeles Los Angeles Lakers` in All-Star and contest summaries.

2. **`p.tid >= 0` is NOT the NBA-only filter.**
   External leagues use offsets: Euroleague +1000, PBA +2000, **WNBA +3000**, B-League +4000, Endesa +5000, G-League +6000, CBA +7000, NBL +8000. Correct filter is `p.tid >= 0 && p.tid < 100`. Add a `status`-not-in-(WNBA/Euroleague/…) check as defense-in-depth. Symptom: A'ja Wilson appears in NBA pools.

3. **`player.age` is unreliable — ALWAYS use `computeAge(player, simYear)` from `src/utils/helpers.ts`.**
   BBGM rosters set `born.year` consistently but not `age`. The helper handles `born.year` → `simYear - born.year`, falls back to `player.age`, then 25. Never inline the formula — use the helper so the fallback chain stays in one place. `simYear` comes from `state.leagueStats?.year`.

4. **Family-Lock: `relatives.length > 0` ≠ "has family on this roster".**
   `player.relatives` lists ALL known kin league-wide (BBGM-pid based, doesn't match our `internalId`). Use `hasFamilyOnRoster(player, roster)` from `utils/familyTies.ts` — it matches by name within the given roster. Symptom: Aaron Holiday locked on Houston because Justin Holiday is in the league elsewhere.

5. **BBGM logo URLs (don't guess, use the verified paths).**
   - **Primary:** `https://play.basketball-gm.com/img/logos-primary/{ABBREV}.svg` (200 direct)
   - **Secondary/alt:** `https://play.basketball-gm.com/img/logos-secondary/{ABBREV}.svg` (200 direct)
   - Convenience redirect: `/img/logos/{ABBREV}.png` → 302 → primary.svg
   - All abbrevs incl. SEA, LV, VAN, BUF, KC, SD, PIT, BAL, STL, MXC, HAR, ANA work.
   - When probing URLs always use `curl -I -L` (follow redirects). A bare HEAD on the redirect path returned 302 with no body and I incorrectly read that as "doesn't exist". When the user says "BBGM has it", they're right — keep probing patterns.

6. **`p.born.year` migration drift.** Old saves have `age` set but not `born.year`. Always `??`-chain: `born?.year ? leagueYear - born.year : (player.age ?? null)`.

7. **Don't assume Action-Tab is reachable in GM-Mode.**
   `Actions` is commissioner-only. Navigation via `OFFSEASON_ROW_TAB[row] = 'Actions'` lands the GM in nothing. Open the relevant Modal directly from the GM context (e.g. inside `OffseasonAufgabenSidebar`) instead.

8. **`OffseasonChecklistRow` exhaustive switches.**
   Every new Row in `OFFSEASON_ROW_ORDER` (e.g. `expansionDraft`) needs a `case` in `getStepConfirmSpec()` and any other exhaustive `switch (row)`. Missing case = `undefined` returned = silent click that does nothing.

9. **Don't cap searchable lists with `slice(0, 60)` for "perf".**
   205 logos × 1 lazy `<img>` = trivial. Cap killed UX (user couldn't find Hartford/Vancouver). Use `loading="lazy"` instead.

10. **Auto-Seed effects need a persistent seed-flag, not just an existence-check.**
    If you seed `state.expansionSchedule` and the user cancels, your existence-check (`!schedule`) re-fires and seeds again. Persist `auto<feature>Seeded: true` in `leagueStats` and check that flag.

11. **Offseason Aufgaben regressions — do not repeat these.**
    - Never compare raw `state.date` display strings to ISO dates. Always normalize with `normalizeDate()` or parse with `parseGameDate()` before comparisons. Symptom: `Jul 7, 2026 >= 2026-09-29` lexically evaluates wrong and skips Free Agency.
    - `faTagCounter > 0` means Free Agency is active. Do not mark `freeAgency` skipped before training camp; reducers and UI recovery must force it back to `in-progress`.
    - Timed footers (`Day 1/13`, transfer-window `Day 1/x`) should use a generic **Next Task** action, not "To Training Camp". It must stop at the next unresolved offseason task before camp.
    - Retired Players and Hall of Fame must stay visible in the NBA offseason checklist. The row click can simulate to its event date, but the row itself must not be hidden as a "grand reveal".
    - Retired/HOF views must derive the visible class year from the current calendar date in offseason, not blindly from `leagueStats.year - 1`.
    - My Free Agents should only reopen before FA opens. Never reopen it once phase is `moratorium`, `birdRights`, `openFA`, or `preCamp`.
    - Assistant GM must not bypass CBA. No-Bird/no-cap asking-price rows count as resolved blockers, are excluded from assistant offers, and should recompute only if cap clears before FA.
    - Expansion Draft row appears only when `expansionSchedule.year === leagueStats.year`; future expansions live in the pin, not as a skipped task row.

12. **CRITICAL: retired-jersey/player matching must never match blank IDs.**
    - Never compare `String(record.pid ?? '') === String(player.pid ?? '')` or equivalent. If both sides are missing, every old retired-jersey record matches every player on that team.
    - Same rule for `playerId`: only compare when both sides are non-empty.
    - Safe fallback is exact `record.text === player.name` only when the retired-jersey record explicitly has a player name.
    - Symptom: `JERSEYAUDIT` shows Chris Paul/Klay/Kevin Love as `skip_existing` with wrong historical team numbers and impossible `scheduledYear` values like 1967/1979/2000.
    - Raw alexnoob jersey fields live in `players[].stats[].jerseyNumber`; use those raw fields, not hardcoded fallback maps.

13. **Competition KPIs must respect qualification.**
    In competition detail views (for example EuroLeague), only render team-specific KPI/Outlook/Pressure widgets when the user team is actually part of that competition. If the team is not qualified, hide those widgets instead of showing placeholder percentages (like 46% qualification) that imply participation.

## Project

## Project
NBA Commissioner / GM simulator. React + TypeScript + Vite. Save persistence via `idb-keyval` in IndexedDB.

## Multi-season economy pipeline

The signing/cap system runs in this **execution order** inside `src/services/AIFreeAgentHandler.ts → runAIFreeAgencyRound`:

1. **Pass 1** — best-fit signings (cap space + MLE for top FAs)
2. **Pass 2** — two-way contracts (≤60 BBGM OVR fringe FAs) — **runs before fill** so the salary-ASC sort in Pass 4 doesn't vacuum the pool
3. **Pass 3** — non-guaranteed training camp (preseason only, Jul 1 – Oct 21)
4. **Pass 4** — minimum-roster enforcement (fill to 15-man, last-resort min-deal)
5. **Pass 5** — minimum-payroll floor enforcement (only helps teams with open roster slots)

**Critical:** if you reorder these passes, the two-way pool starves. Pass 4 sorts by salary ASC, which prefers the lowest-OVR FAs — exactly the players Pass 2 needs.

## Economy audit scripts

## Debug cheat entrypoint

`src/utils/debugCheats.ts` is the first place to inspect for in-app repro/diagnostics. When a TODO bug mentions PlayButton, phase drift, offseason, Euro mode, or stuck simulation state, check existing cheats (`STUCK`, `PHASEDUMP`, `EUROAUDIT`, `WARP`, `WARPSLOW`) and extend them with targeted output before guessing from UI symptoms.

Use `debugCheats` to narrow the failing phase/state first, then read the implicated paths and every dependency needed for reliable cross-system analysis. Do not artificially limit context when correctness or regression prevention requires a broader audit.

For PBA season/conference bugs, do not build save-repair or migration cheats unless the user explicitly asks for one. Resimulate fresh saves automatically; prioritize diagnostics (`PBASEASON`), reproducible tests, and forward fixes in the calendar, draft, import, award, All-Star, and conference lifecycle paths.

For every gameplay pass and bug-fix session, a bug is sufficiently fixed without a legacy-save healer when the forward fix prevents new games, or games continued through the corrected path, from producing the bad state and the real affected path has focused plus headless/Playwright verification. Supplied old saves may remain read-only diagnostic or reproduction evidence; do not add a load healer, migration, or reload-compatibility path solely to make them self-repair. Save/reload of state produced after the fix may still be tested, but it is not a reason to rewrite legacy state and is not a blanket acceptance requirement. Build a healer or migration only when persistence/reload is itself the reported bug or the user explicitly requests one.

Browser-console scripts validate fixes against a real save (`scripts/`):

- **`audit-economy.js`** — quick health check: rosters, two-ways, payroll floor, mega-contracts, lingering supermax flags. Paste in DevTools, auto-runs on newest save.
- **`audit-economy-deep.js`** — investigation script: FA pool by OVR bucket, per-team avg salary, under-rostered team transaction logs, floor-clearing forecast.
- **`audit-historical-nba.js`** — gzip-aware historical NBA read-only audit: rule flags, POT bounds, Play-In state, All-Star/Rising Stars event state, waivers, offseason order, awards, and standings.

Both auto-load the newest save from IndexedDB via `keyval-store`. To target a specific save: `await auditEconomy('nba_commish_save_<id>')`.

## Economy closeout

- **Minimum-payroll shortfall fixed in worktree.** Full standard rosters below the configured floor receive an exact one-time player distribution in the completed team-season record during rollover. It does not change contracts or external-league buckets.
- **Contract-season drift fixed in worktree.** Contract offers and limits use `leagueStats.year` first and only fall back to the latest player-stat season when no valid league year exists.

## Unit gotchas

- `contract.amount` — BBGM **thousands** (e.g. 12000 = $12M). Multiply ×1000 for USD.
- `minContractStaticAmount` — **millions** (e.g. 1.273). Multiply ×1,000,000 for USD.
- `overallRating` — **BBGM scale** (40–85). Use `convertTo2KRating` to compare against K2 (60–99).
- `yearsOfService` — `player.stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).length`. Not `age - 22`.

## Debugging save-state bugs

For data-corruption, contract, FA-pool, roster, Bird-Rights, mood, or trade bugs, inspect local or provided saves autonomously through `SaveManager`, the audit utilities, or the headless harness whenever possible. Preserve the exact save and diagnostic context before mutation. If the required user save is not locally accessible and its raw state is necessary to reproduce the issue, ask for the full DevTools output below instead of inferring state from screenshots.

**Critical ordering rule:** Always provide the full IndexedDB + gzip load snippet first. Never begin with a snippet that assumes `window.__lastSaveState` already exists. `window.__lastSaveState` is only valid after the user has successfully run the full load snippet in the current browser tab.

### Save format (critical — saves are GZIPPED)

- IndexedDB database: `keyval-store`, object store: `keyval`
- Save IDs follow pattern `nba_commish_<timestamp>_<id>` (e.g. `nba_commish_1778078108571_mvnxqj`)
- Metadata index key: `nba_commish_metadata` → array of `{ id, name, dateSaved, gameDate, commissionerName, day }`
- **Save value is `{ __gz: true, data: ArrayBuffer }` — gzipped JSON.** Reading it raw shows `{__gz, data}` with no `players` field. You must `DecompressionStream('gzip')` it first.
- `state` is **NOT** a global. `window.__lastSaveState` is also **NOT** guaranteed. Reading from IDB + decompressing is the first console path for every new save-debugging exchange.

See `src/services/SaveManager.ts` for the canonical compress/decompress helpers, and `scripts/audit-economy.js` for the audit-script pattern (older audit scripts predate the gzip wrapper — check before reusing).

### Standard snippet — load newest save and inspect a player

```js
// F12 → Console → paste, edit the LASTNAME:
(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('keyval-store');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const get = k => new Promise((res, rej) => {
    const r = db.transaction('keyval','readonly').objectStore('keyval').get(k);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const meta = await get('nba_commish_metadata');
  const newest = [...meta].sort((a,b) => b.dateSaved - a.dateSaved)[0];
  const raw = await get(newest.id);
  // ── Gunzip ─────────────────────────────────────
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter();
  w.write(raw.data); w.close();
  const state = JSON.parse(await new Response(ds.readable).text());
  // ── Inspect ────────────────────────────────────
  const p = state.players.find(p => p.name.includes('LASTNAME'));
  console.log({
    tid: p.tid, status: p.status,
    contract: p.contract, contractYears: p.contractYears,
    yearsWithTeam: p.yearsWithTeam, hasBirdRights: p.hasBirdRights,
    draftYear: p.draft?.year,
  });
  window.__lastSaveState = state; // keep around for follow-ups
})();
```

Only after this snippet has printed successfully in the same tab, `window.__lastSaveState` is hot. Follow-ups may then use `__lastSaveState.players.find(...)`; if the user reports `Cannot read properties of undefined (reading 'players')`, immediately give the full load snippet again.

**Console usage note:** paste the JavaScript block only. Do not paste surrounding prose like "Then run:" or quoted assistant text, or DevTools will throw a syntax error before the snippet executes.

### Adjust the destructure to the bug

- **Stats / Bird Rights / yearsOfService**: dump `p.stats` (full array — check for missing seasons or `playoffs:true` rows without matching regular row)
- **Trades**: `p.transactions`, plus `state.history.filter(h => h.text?.includes('PLAYER NAME'))`
- **Moods**: `p.moodTraits`, `p.morale`, `p.roleStability`
- **Cap / payroll**: dump the team's full roster (`state.players.filter(p => p.tid === TEAM_ID)` then map salaries)
- **FA pool**: `state.players.filter(p => p.tid === -1 && p.status === 'Free Agent')` — count + top-OVR sample
- **Schedule (mid-season trade verification)**: `state.schedule.filter(g => g.played && g.season === Y && (g.homeTeamId === T || g.awayTeamId === T))`

**Inspect the actual save state, don't infer it from UI screenshots.** UI components have their own filters that can hide or transform fields; only the raw state is authoritative.

## TODO.md is the working backlog

Always read `TODO.md` first. The MULTI-SEASON ECONOMY section tracks what's been fixed, what's open, and any newly-discovered bugs from audit runs.

## Don't

- Don't add error handling/fallbacks for impossible scenarios (see global instructions).
- Don't write multi-paragraph docstrings — one short line max.
- Enforce the hand-written file-size rule: keep files under 500 lines where practical, keep new files below that cap by default, and split growing legacy files instead of expanding them further unless there is a clear reason not to.
- Don't auto-run trim/cut logic without checking for the **family-ties protection** (`hasFamilyOnRoster`) — siblings/relatives are untouchable in nepotism passes.
