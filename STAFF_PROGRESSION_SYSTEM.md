# Staff Progression System

## Core Formula

Staff progression is earned from environment, not tenure.

`Staff Growth = Team Success + Mentorship + Organization Bonus`

## Inputs

### 1) Team Success
- Regular season wins
- Playoff success
- Championship bonus

### 2) Mentorship
- Head coach overall rating drives knowledge transfer
- Better head coaches accelerate staff development
- Elite head coaches produce stronger downstream growth

### 3) Organization Bonus
- Franchise-culture bonus for elite organizations
- Initial examples:
  - Spurs
  - Heat
  - Warriors
- Extendable to additional clubs with strong development culture

## Explicit Non-Factor

- No automatic progression from experience/years alone
- Tenure without strong environment should not generate meaningful growth

## Behavioral Targets

- 25-year assistant on a weak team with poor head coach: minimal growth
- Rookie assistant on a dynasty under elite head coach: major growth

## Staff Potential Archetypes

Not all staff should develop equally.

- Some staff are high-ceiling and can become elite
- Some staff are stunted/low-ceiling and plateau early
- Add per-staff progression profile that modulates yearly growth:
  - `ceiling`
  - `growthRate`
  - `volatility`

## International Staff Routing

When NBA staff are unhired, they should be eligible to coach in other leagues (and vice versa), with regional preference.

Examples:
- Spanish staff can route to Spain/Euro contexts
- NBA-unhired staff can enter international pools based on fit

Suggested controls:
- League preference weights per staff member
- Nationality/culture affinity bonus
- Market-demand modifier per league

## Implementation Guardrails

- Keep progression transparent and deterministic enough for debugging
- Avoid age-only or years-only inflation
- Make environment the dominant driver
- Preserve league-specific realism for staff mobility

