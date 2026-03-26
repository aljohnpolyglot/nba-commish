# Actions System README

This document outlines the process for adding new executive actions to the game.

## Adding a New Action

To add a new action, follow these steps:

### 1. Configure the Action (`src/components/actions/view/actionConfig.ts`)
Add the action object to the appropriate category (`executive`, `season`, `personal`, or `covert`).
- **id**: Unique identifier (e.g., `WAIVE_PLAYER`).
- **title/description**: UI display text.
- **icon**: Import from `lucide-react`.
- **onClick**: Trigger the appropriate modal (e.g., `callbacks.openPersonSelector('waive')`).

### 2. Update Person Selector (`src/components/modals/PersonSelectorModal.tsx`)
If your action requires selecting a person:
- Add the new action type to the `actionType` union definition.
- Update the filtering logic if you need to restrict which players/staff appear (e.g., only active players).

### 3. Update Modal Renderer (`src/components/actions/view/ActionModalsRenderer.tsx`)
- Add the title mapping for your new action type so the modal header is correct.

### 4. Handle Action Dispatch (`src/components/actions/view/ActionsView.tsx`)
- Update `handlePersonSelected` to map your `modals.modalType` to the internal `actionType`.
- Add your action type to the allowed list in `handleAction`.

### 5. Backend Logic
- **Pre-processing (`src/store/logic/turn/preProcessor.ts`)**: If the action alters rosters or stats before simulation, add it here.
- **Action Handler (`src/store/logic/actions/playerActions.ts` or similar)**: Create the function to handle the logic of the action.
- **Action Processor (`src/store/logic/actionProcessor.ts`)**: Register the action type and its handler.
- **Outcome Decider (`src/services/logic/outcomeDecider.ts`)**: Define the impact on league stats and approval ratings.

## Implemented Actions

### Executive Actions
- **PUBLIC_ANNOUNCEMENT**: Bypass the media and speak directly to the world. Announce trades, fines, or new eras.
- **FINE_PERSON**: Issue a monetary fine to a player, coach, or team for conduct detrimental to the league.
- **SUSPEND_PERSON**: Issue an immediate suspension to a player, coach, or GM. Requires justification.
- **DRUG_TEST**: Target ANYONE for a 'random' drug test. High chance of suspension or scandal.
- **EXPANSION_DRAFT**: Select new cities to grant NBA franchises. Increases league footprint but dilutes talent.
- **ENDORSE_HOF**: Endorse a retired player for the Hall of Fame.
- **EXECUTIVE_TRADE**: Force a trade between any two teams. Bypass GM approval and salary cap restrictions.
- **SIGN_FREE_AGENT**: Force a team to sign a specific free agent to a minimum contract.
- **WAIVE_PLAYER**: Force a team to waive a specific player (Players only).
- **FIRE_PERSONNEL**: Terminate the contract of a GM, Coach, Owner, or Referee (Staff/Officials only).

### Season Actions
- **CELEBRITY_ROSTER**: Hand-pick the celebrities and influencers for the All-Star Celebrity Game.
- **GLOBAL_GAMES**: Select the international cities that will host regular season games this year.
- **INVITE_PERFORMANCE**: Book artists for halftime shows, national anthems, or special ceremonies.
- **SET_CHRISTMAS_GAMES**: Hand-pick the matchups for the NBA's biggest regular season showcase.
- **ADD_PRESEASON_INTERNATIONAL**: Schedule a preseason game against a top international club.

### Personal Actions
- **TRANSFER_FUNDS**: Move money between your personal wealth and the league's operational funds.
- **INVITE_DINNER**: Host a lavish private dinner for up to 100 guests.
- **INVITE_MOVIE**: Rent out a theater for a private screening.
- **GIVE_MONEY**: Disburse funds to anyone in the league for any reason.
- **TRAVEL**: Travel to a domestic or international city for business or pleasure.
- **VISIT_NON_NBA**: Travel to international or other league teams for scouting and diplomacy.
- **CONTACT_PERSON**: Reach out to anyone in the basketball world via Direct Message.
- **GO_TO_CLUB**: Visit a top nightclub in the USA.

### Covert Actions
- **HYPNOTIZE**: Influence a target to perform any action without direct attribution.
- **SABOTAGE_PLAYER**: Quietly ensure a player is sidelined with an injury.
- **BRIBE_PERSON**: Quietly offer money to influence a player, coach, or official.
- **LEAK_SCANDAL**: Target a specific player to anonymously leak a scandal about.
- **RIG_LOTTERY**: Ensure the worst team gets the #1 pick... or whoever pays the most.
