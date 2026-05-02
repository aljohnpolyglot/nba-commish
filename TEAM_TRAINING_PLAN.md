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
