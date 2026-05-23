// Bridge: re-export K2 functions from main app
export { calculateK2, K2_CATS } from '../../../../../../services/simulation/convert2kAttributes';
export type { K2Data } from '../../../../../../services/simulation/convert2kAttributes';
export { convertTo2KRating } from '../../../../../../utils/helpers';
export { getSystemProficiency } from '../../../../../../utils/coachSliders';
export { calculateOverallFromRating } from '../../../../../../store/playerRatingStore';
