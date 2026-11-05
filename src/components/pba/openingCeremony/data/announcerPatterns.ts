import { AnnouncerClipKey } from './announcerClips';

/**
 * Announcer Patterns configuration for PBA Opening Ceremony.
 * 
 * NOTE: Once in-game, team captain is now available using the same logic used for mentorship EXP.
 * WAV audio connectors will NEVER use "accompanied by" for team captains.
 * "Accompanied by" is reserved for team muses ("accompaniedByTeamMuse"),
 * whereas team captains use "and team captain", "together with team captain", or "alongside team captain" immediately.
 */
export type DynamicAnnouncementField = 'teamName' | 'museName' | 'captainName';

export type AnnouncementSegment =
  | {
      type: 'audio';
      clip: AnnouncerClipKey;
      gapAfterMs?: number;
    }
  | {
      type: 'nativeTts';
      field: DynamicAnnouncementField;
      gapAfterMs?: number;
    }
  | {
      type: 'pause';
      durationMs: number;
    };

export interface AnnouncerPattern {
  id: string;
  name: string;
  segments: AnnouncementSegment[];
  formatText: (values: { teamName: string; museName: string; captainName: string }) => string;
}

export const ANNOUNCER_PATTERNS: AnnouncerPattern[] = [
  // PATTERN 1
  {
    id: 'pattern-1',
    name: 'Standard Grand Entrance',
    segments: [
      { type: 'audio', clip: 'ladiesAndGentlemen', gapAfterMs: 40 },
      { type: 'audio', clip: 'nowEnteringTheHardwood', gapAfterMs: 50 },
      { type: 'nativeTts', field: 'teamName', gapAfterMs: 80 },
      { type: 'audio', clip: 'ledByTeamMuse', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'museName', gapAfterMs: 80 },
      { type: 'audio', clip: 'andTeamCaptain', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'captainName', gapAfterMs: 100 },
      { type: 'audio', clip: 'thunderousPbaWelcome', gapAfterMs: 250 },
    ],
    formatText: (v) =>
      `Ladies and gentlemen, now entering the hardwood, ${v.teamName}! Led by team muse ${v.museName} and team captain ${v.captainName}! Give them a thunderous PBA welcome!`,
  },
  // PATTERN 2
  {
    id: 'pattern-2',
    name: 'High Energy Fanfare',
    segments: [
      { type: 'audio', clip: 'pbaFansMakeSomeNoise', gapAfterMs: 50 },
      { type: 'nativeTts', field: 'teamName', gapAfterMs: 80 },
      { type: 'audio', clip: 'accompaniedByTeamMuse', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'museName', gapAfterMs: 80 },
      { type: 'audio', clip: 'alongsideTeamCaptain', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'captainName', gapAfterMs: 100 },
      { type: 'audio', clip: 'letTheArenaHearYou', gapAfterMs: 250 },
    ],
    formatText: (v) =>
      `PBA fans, make some noise for ${v.teamName}! Accompanied by team muse ${v.museName} alongside team captain ${v.captainName}! Let the arena hear you!`,
  },
  // PATTERN 3
  {
    id: 'pattern-3',
    name: 'Tunnel Arrival',
    segments: [
      { type: 'audio', clip: 'directFromTheTeamTunnel', gapAfterMs: 40 },
      { type: 'audio', clip: 'welcomeTheMighty', gapAfterMs: 50 },
      { type: 'nativeTts', field: 'teamName', gapAfterMs: 80 },
      { type: 'audio', clip: 'featuringTeamMuse', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'museName', gapAfterMs: 80 },
      { type: 'audio', clip: 'togetherWithTeamCaptain', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'captainName', gapAfterMs: 100 },
      { type: 'audio', clip: 'makeSomeNoise', gapAfterMs: 250 },
    ],
    formatText: (v) =>
      `Direct from the team tunnel, welcome the mighty ${v.teamName}! Featuring team muse ${v.museName} together with team captain ${v.captainName}! Make some noise!`,
  },
  // PATTERN 4
  {
    id: 'pattern-4',
    name: 'Electrified Floor',
    segments: [
      { type: 'audio', clip: 'theCourtIsElectrified', gapAfterMs: 50 },
      { type: 'nativeTts', field: 'teamName', gapAfterMs: 80 },
      { type: 'audio', clip: 'ledByTeamMuse', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'museName', gapAfterMs: 80 },
      { type: 'audio', clip: 'andTeamCaptain', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'captainName', gapAfterMs: 100 },
      { type: 'audio', clip: 'theFloorIsTheirs', gapAfterMs: 250 },
    ],
    formatText: (v) =>
      `The court is electrified for ${v.teamName}! Led by team muse ${v.museName} and team captain ${v.captainName}! The floor is theirs!`,
  },
  // PATTERN 5
  {
    id: 'pattern-5',
    name: 'Grand Parade Spotlight',
    segments: [
      { type: 'audio', clip: 'steppingOntoTheMainCourt', gapAfterMs: 50 },
      { type: 'nativeTts', field: 'teamName', gapAfterMs: 80 },
      { type: 'audio', clip: 'accompaniedByTeamMuse', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'museName', gapAfterMs: 80 },
      { type: 'audio', clip: 'alongsideTeamCaptain', gapAfterMs: 60 },
      { type: 'nativeTts', field: 'captainName', gapAfterMs: 100 },
      { type: 'audio', clip: 'welcomeToTheGrandParade', gapAfterMs: 250 },
    ],
    formatText: (v) =>
      `Stepping onto the main court, ${v.teamName}! Accompanied by team muse ${v.museName} alongside team captain ${v.captainName}! Welcome to the grand parade!`,
  },
];
