# Free Agency Year Convention

Session 38 chose Option A for the `getFreeAgencyStartDate` convention split.

`getFreeAgencyStartDate(seasonYear, stats)` remains the raw calendar-year helper. Existing trade-value callers that already compensate with `currentYear - 1/currentYear` keep their behavior and should not be changed unless the project deliberately adopts Option B later.

Current save-date surfaces must use the new helpers:

- `getCurrentOffseasonFAStart(currentDate, stats)`
- `getCurrentOffseasonFAMoratoriumEnd(currentDate, stats)`

Those helpers resolve the FA window from the UTC calendar year of the current save date. This is the correct path after Jun 30 rollover, because `leagueStats.year` already points at the upcoming season while the active July-September free-agency window still belongs to the current calendar year.

Intentional legacy/raw callers as of Session 38:

- `src/services/AITradeHandler.ts`
- `src/components/modals/TradeMachineModal.tsx`
- `src/components/central/view/TradeFinderView.tsx`

If Option B is ever adopted, flip `getFreeAgencyStartDate` to season-end-year semantics and remove the manual compensation in those trade pipelines in the same patch.
