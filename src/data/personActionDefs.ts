export type {
  PersonActionDef,
  PersonEligibility,
  StaffType,
} from './personActionCore';
export {
  isPersonnelEligible,
  isPlayerEligible,
} from './personActionCore';
export {
  GENERAL_ACTION_DEF,
  PERSON_ACTION_DEFS,
} from './personActionRegistry';

import type { PersonActionDef } from './personActionCore';
import { GENERAL_ACTION_DEF, PERSON_ACTION_DEFS } from './personActionRegistry';

export const PERSON_ACTION_MAP = new Map<string, PersonActionDef>(
  [...PERSON_ACTION_DEFS, GENERAL_ACTION_DEF].map((def) => [def.id, def]),
);
