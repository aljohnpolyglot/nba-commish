// Centralized league-type-aware label resolution.
// Modded leagues use NBA branding (real-NBA mod). Fictional leagues use neutral
// labels so the base UI stays IP-clean. Any new user-visible string that differs
// between modes goes here, not hardcoded in components.

import { useGame } from '../store/GameContext';

type LeagueType = 'fictional' | 'modded' | undefined;

export interface LeagueLabels {
  cupShort: string;        // "NBA Cup" | "In-Season Cup"  — tab labels, badges
  cupLong: string;         // "NBA Cup" | "In-Season Tournament"  — page headers
  central: string;         // "NBA Central" | "League Central"
  finals: string;          // "NBA Finals" | "League Finals"
  draft: string;           // "NBA Draft" | "Draft Night"
  draftLottery: string;    // "NBA Draft Lottery" | "Draft Lottery"
  leagueOffice: string;    // "NBA League Office" | "League Office"
  officials: string;       // "NBA Officials" | "League Officials"
  referee: string;         // "NBA Referee" | "League Referee"
  official: string;        // "NBA Official" | "League Official"
  leaguePass: string;      // "NBA League Pass" | "League Pass"
  injuriesTitle: string;   // "NBA Injuries" | "League Injuries"
  leagueHQ: string;        // "NBA HQ" | "League HQ"
  mediaRights: string;     // "NBA Media Rights" | "League Media Rights"
  appTitle: string;        // app loading screen
  leagueTeam: string;      // "NBA Team" | "League Team" — destination picker
  finalsHalftime: string;  // "NBA Finals Halftime Show" | "Finals Halftime Show"
  cupChampion: string;     // "NBA Cup Champion" | "In-Season Cup Champion"
  cupMVP: string;          // "NBA Cup MVP" | "In-Season Tournament MVP"
}

export function getLeagueLabels(leagueType: LeagueType): LeagueLabels {
  const isFictional = leagueType === 'fictional';
  return isFictional
    ? {
        cupShort:       'In-Season Cup',
        cupLong:        'In-Season Tournament',
        central:        'League Central',
        finals:         'League Finals',
        draft:          'Draft Night',
        draftLottery:   'Draft Lottery',
        leagueOffice:   'League Office',
        officials:      'League Officials',
        referee:        'League Referee',
        official:       'League Official',
        leaguePass:     'League Pass',
        injuriesTitle: 'League Injuries',
        leagueHQ:       'League HQ',
        mediaRights:    'League Media Rights',
        appTitle:       'Basketball Commissioner Simulator',
        leagueTeam:     'League Team',
        finalsHalftime:'Finals Halftime Show',
        cupChampion:    'In-Season Cup Champion',
        cupMVP:         'In-Season Tournament MVP',
      }
    : {
        cupShort:       'NBA Cup',
        cupLong:        'NBA Cup',
        central:        'NBA Central',
        finals:         'NBA Finals',
        draft:          'NBA Draft',
        draftLottery:   'NBA Draft Lottery',
        leagueOffice:   'NBA League Office',
        officials:      'NBA Officials',
        referee:        'NBA Referee',
        official:       'NBA Official',
        leaguePass:     'NBA League Pass',
        injuriesTitle:  'NBA Injuries',
        leagueHQ:       'NBA HQ',
        mediaRights:    'NBA Media Rights',
        appTitle:       'NBA Commissioner Simulator',
        leagueTeam:     'NBA Team',
        finalsHalftime: 'NBA Finals Halftime Show',
        cupChampion:    'NBA Cup Champion',
        cupMVP:         'NBA Cup MVP',
      };
}

/** React hook — read leagueType from GameContext and return resolved labels.
 * Also checks pendingStartPayload so the loading screen shows the right title
 * before LOAD_GAME / START_GAME completes. */
export function useLeagueLabels(): LeagueLabels {
  const { state } = useGame();
  const uiMode = state?.leagueStats?.uiMode ?? state?.pendingStartPayload?.uiMode;
  if (uiMode === 'pba_isolated') {
    return {
      cupShort: 'PBA Cup',
      cupLong: 'PBA Cup',
      central: 'PBA Central',
      finals: 'PBA Finals',
      draft: 'PBA Draft',
      draftLottery: 'Draft Order',
      leagueOffice: 'PBA Office',
      officials: 'PBA Officials',
      referee: 'PBA Referee',
      official: 'PBA Official',
      leaguePass: 'PBA Pass',
      injuriesTitle: 'PBA Injuries',
      leagueHQ: 'PBA HQ',
      mediaRights: 'PBA Media Rights',
      appTitle: 'FilipinoBasketCommissionerSim',
      leagueTeam: 'PBA Team',
      finalsHalftime: 'PBA Finals Halftime Show',
      cupChampion: 'Conference Champion',
      cupMVP: 'Conference MVP',
    };
  }
  if (uiMode === 'euro_isolated') {
    return {
      cupShort: 'Cup',
      cupLong: 'Cup',
      central: 'Club Central',
      finals: 'League Finals',
      draft: 'Draft',
      draftLottery: 'Draft Order',
      leagueOffice: 'League Office',
      officials: 'League Officials',
      referee: 'League Referee',
      official: 'League Official',
      leaguePass: 'League Pass',
      injuriesTitle: 'League Injuries',
      leagueHQ: 'League HQ',
      mediaRights: 'League Media Rights',
      appTitle: 'Basketball Commissioner Simulator',
      leagueTeam: 'Club',
      finalsHalftime: 'Finals Halftime Show',
      cupChampion: 'Cup Champion',
      cupMVP: 'Cup MVP',
    };
  }
  const leagueType = state?.leagueType ?? state?.pendingStartPayload?.leagueType;
  return getLeagueLabels(leagueType);
}
