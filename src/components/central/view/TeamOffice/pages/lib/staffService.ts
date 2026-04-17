// Bridge: coach photos + slugs from the real source
export {
  fetchCoachData,
  getCoachPhoto,
  getAllCoaches,
} from '../../../../../../data/photos/coaches';
export type { CoachData } from '../../../../../../data/photos/coaches';

// Staff data (owners/gms/coaches/league office enrichment)
export { getStaffData, getCoachAssistants } from '../../../../../../services/staffService';

// Extended coach data (bios, 2K profiles, contracts)
export {
  getCoachBio,
  getNBA2KCoach,
  getTeamStaff,
  getCoachContract,
  fetchCoachData as fetchCoachExtendedData,
} from '../../../../../../services/staffService';
export type {
  NBA2KCoachData,
  CoachContractData,
} from '../../../../../../services/staffService';
