export type FictionalHistoryMode = 'brand_new' | 'established';
export type FictionalPlayerPool = 'mens' | 'womens' | 'mixed';
export type OpeningRosterMode = 'current' | 'fantasy_draft';
export type FictionalRosterMode = OpeningRosterMode;

export interface FictionalNationalityFrequency {
  country: string;
  frequency: number;
}

export interface FictionalStartupTeamDef {
  tid: number;
  region: string;
  name: string;
  abbrev: string;
  colors: [string, string, string];
  pop: number;
  conference: string;
  conferenceName?: string;
  cid: number;
  did: number;
  divisionName?: string;
  stadiumCapacity?: number;
  imgURL?: string;
  imgURLSmall?: string;
  wordmarkURL?: string;
  jerseyType?: string;
}
