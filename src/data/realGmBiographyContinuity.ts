export interface RealGmBiographyContinuityRecord {
  sourceId: string;
  name: string;
  profileUrl: string;
  position?: string;
  heightInches?: number;
  weightPounds?: number;
  birthDate?: string;
  hometown?: string;
  nationality?: string;
  draftYear?: number;
  draftStatus?: string;
  preDraftTeam?: string;
  college?: string;
  highSchool?: string;
  agent?: string;
}

const RECORDS: Record<string, RealGmBiographyContinuityRecord> = {
  '680': {
    sourceId: '680',
    name: 'Jamario Moon',
    profileUrl: 'https://basketball.realgm.com/player/Jamario-Moon/Summary/680',
    position: 'F',
    heightInches: 80,
    weightPounds: 205,
    birthDate: '1980-06-13',
    hometown: 'Goodwater, Alabama',
    nationality: 'United States',
    draftYear: 2001,
    draftStatus: '2001 Undrafted',
    preDraftTeam: 'Meridian (So)',
    college: 'Meridian',
    highSchool: 'Coosa Central High School (Rockford, Alabama)',
    agent: 'Chris Patrick',
  },
  '3453': {
    sourceId: '3453',
    name: 'Michael Fey',
    profileUrl: 'https://basketball.realgm.com/player/Michael-Fey/Summary/3453',
    position: 'C',
    heightInches: 84,
    weightPounds: 270,
    birthDate: '1983-05-29',
    hometown: 'Seattle, Washington',
    nationality: 'United States',
    draftYear: 2006,
    draftStatus: '2006 Undrafted',
    preDraftTeam: 'UCLA (Sr)',
    college: 'UCLA',
    highSchool: 'Capital High School (Olympia, Washington)',
  },
};

export function getRealGmBiographyContinuityRecord(sourceId: unknown): RealGmBiographyContinuityRecord | undefined {
  return RECORDS[String(sourceId ?? '').trim()];
}
