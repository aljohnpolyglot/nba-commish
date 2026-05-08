# Team Training — Cleared

Session 50 completed the remaining Team Training wire-in from the old brainstorm plan.

## Shipped Status

- [x] Phase 1 — module integration and canon type wiring.
- [x] Phase 2 — game-state persistence, Training Center route, real roster/team adapters.
- [x] Phase 2.5 — proficiency unification, scheduler polish, ISO training calendar, read-only GM browsing.
- [x] Phase 3 — Funnel Model, mentor multipliers, strength-to-weight loop, daily familiarity/fatigue ticks.
- [x] Phase 3.5 — Training Center now reuses the canonical Schedule `CalendarView` and `DayView`, with `TrainingDayOverlay` badges for `team.trainingCalendar[iso]`.
- [x] Phase 4 — sim multipliers wired: system familiarity, selected-system proficiency boost, defensive aura, fatigue performance debuff, and fatigue injury-risk multiplier.

## Notes

- The former brainstorm consolidation from `docs/training.md`, `docs/mentorship.md`, schedule docs, modal comments, and TeamTraining harness notes has been consumed and removed from this file.
- `src/TeamTraining/components/ScheduleView.tsx` remains as a legacy standalone component for the old module surface, but production Training Center no longer imports it.
- Coach-fire Clean Slate is still intentionally parked until a coach-fire mechanic exists. The callable hook already exists as `resetTeamFamiliarity(teams, teamId)`.

## Verification

- `npm run lint` passed after the Session 50 code changes.
- `npm run build` passed after the Session 50 code changes.

## Guiding Principle for Schedule Redesign (2026-05-03)

**Team training builds Team System Proficiency. It does NOT touch individual K2 ratings.**

Individual progression is already handled separately by Personal Training / Individual Focus (per `docs/training.md` §1). The Training Schedule view exists purely to drive **system familiarity / proficiency** for the offensive and defensive sets the team runs.

What this means for the schedule UI work:
- Every session type in the schedule (Shootaround, Team System, Study Film, Strength, Conditioning, Drill X, etc.) maps its "training effect" onto **team-level meters** — System, Fitness, Chemistry, Offense, Defense — NOT onto a player's K2 stats.
- A "Drill: Ballhandling" picker that shows `+3 Ball Security, +3 Passing` is a **team-system descriptor** ("running this drill makes our team execute ballhandling-heavy sets better"), not a per-player attribute boost. We will display it with team-system framing, not individual stat-line framing.
- Default for every team (incl. AI) = **Balanced**. AI teams do not auto-pick offensive/defensive specialties. The user is the only one who sets a paradigm.
- The "Trade Penalty / Clean Slate" rule from `docs/training.md` §2 (familiarity → 0 on trade or coach fire) still applies. Schedule redesign does not change that hook.

Anything that affects individual K2 ratings stays inside Personal Training / Individual Focus surfaces (mentorship, dev focus, individual intensity). The Schedule view's job is the team-system layer only.

## Future Updates — Defensive Systems & Team Chemistry

Currently the System Practice picker only covers offensive sets. Future work to mirror the same pattern on the defensive side and add team chemistry as a trainable axis:

### Defensive System Library (parallel to offensive systems)
- **Man-to-Man** (base — every team always has at least baseline familiarity)
- **2-3 Zone**, **3-2 Zone**, **1-3-1 Zone**
- **Box-and-One**, **Triangle-and-Two** (junk defenses)
- **Switch Everything** (modern small-ball coverage)
- **Drop Coverage** (ball-screen scheme)
- **Hedge / Show**, **Ice / Down**, **Blitz / Trap** (ball-screen variants)
- **Full-Court Press**, **Half-Court Trap**

### How it should work
- Same UX as offensive systems: each team picks **up to 5 defensive systems** to drill daily.
- Each session contributes to the defensive system's familiarity meter the same way offensive system practice does.
- **Defensive Aura scaling:** the higher the team's familiarity in its **most-practiced** defensive system, the stronger the defensive aura multiplier in sim. Spreading across all 5 evenly produces a flatter aura than concentrating on 1–2 sets — rewards specialization the way real NBA defenses build identity.
- **Trade / coach-fire Clean Slate** rule from `docs/training.md` §2 applies identically to defensive familiarity (drops to 0 on team change or system change).

### Team Chemistry (new trainable meter)
Currently chemistry is implicit in mood/morale. Lift it into a first-class trainable axis on the schedule:
- Sessions that drive chemistry: **Team Bonding**, **Study Film**, **Light Practice**, low-intensity **Team System** sessions.
- Sessions that do *not* (or even erode it slightly under fatigue): **High-Intensity Conditioning**, **Strength H**, repeated **Full Training** with no rest.
- Chemistry meter feeds the existing morale/role-stability system as a small multiplier on team-level cohesion (not individual mood scores).
- Display chemistry alongside System / Fitness / Offense / Defense in the Training Effects panel (B3 from the redesign plan).

### Conditioning as a Regression Fighter (NOT a stat booster)
Same OP-proof philosophy as mentorship — but for the physical column instead of the skill column:
- **Conditioning sessions can NEVER raise** Speed, Vertical, Strength, or Endurance. The player's K2 physical ratings stay read-only from the conditioning surface.
- What conditioning DOES is **slow age-related decay** — a multiplier on the regression curve, not on the rating itself. A 30-year-old who skips conditioning loses physicals faster than a 30-year-old who drills it daily; both still decline.
- Aligns with `docs/training.md` §3:
  - U-23: trace gains allowed (small genetic-ceiling-bounded uptick).
  - Prime (24–28): pure maintenance — flatten the decay slope.
  - Vets (29+): conditioning is the only thing keeping decline from accelerating; skipping it speeds joint degradation.
- This is why conditioning never feels "OP" — it has no upside ceiling, only a downside floor. Same flavor as mentorship: a corrective force, not a power-up.
- UI implication: conditioning meters in the Training Effects panel show "Decay Resistance" or "Wear Resistance," not "+SPD / +STR" deltas. Framing matters — keep the read-only-stats invariant visible in the copy.

### Out of scope for current redesign
These are deferred to a follow-up session. The current Tier A redesign delivers the offensive-side parity already in place; defensive systems + chemistry + conditioning-as-decay-fighter hook into the same schedule + session-effect plumbing once Tier A ships.
