export interface SequentialPortraitFolder {
  prefix: string;
  max: number;
  excluded?: readonly number[];
}

export interface RangePortraitFolder {
  path: string;
  prefix: string;
  first: number;
  last: number;
}

export const REGEN_WOMEN_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-wf/refs/heads/main';
export const REGEN_STAFF_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-staff/refs/heads/main';
export const REGEN_HAIR_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/playerfaces_regen_replacements/hair';

export const REGEN_HAIR_FOLDERS: Record<'black' | 'asian' | 'white', readonly RangePortraitFolder[]> = {
  black: [
    { path: 'afro/long', prefix: 'black_', first: 3001, last: 3011 },
    { path: 'afro/long', prefix: 'blonde_', first: 3001, last: 3001 },
    { path: 'afro/long', prefix: 'darkbrown_', first: 3001, last: 3003 },
    { path: 'afro/medium', prefix: 'black_', first: 3001, last: 3023 },
    { path: 'afro/medium', prefix: 'blonde_', first: 3001, last: 3001 },
    { path: 'afro/medium', prefix: 'darkbrown_', first: 3001, last: 3006 },
    { path: 'afro/short', prefix: 'bald_', first: 3001, last: 3023 },
    { path: 'afro/short', prefix: 'black_', first: 3001, last: 3067 },
    { path: 'afro/short', prefix: 'blond_', first: 3001, last: 3007 },
    { path: 'afro/short', prefix: 'darkbrown_', first: 3001, last: 3011 },
    { path: 'afro/short', prefix: 'lightbrown_', first: 3001, last: 3001 },
    { path: 'afro/short', prefix: 'red_', first: 3001, last: 3001 },
  ],
  asian: [
    { path: 'asian/long', prefix: 'black_', first: 3001, last: 3008 },
    { path: 'asian/long', prefix: 'darkbrown_', first: 3001, last: 3009 },
    { path: 'asian/medium', prefix: 'black_', first: 3001, last: 3029 },
    { path: 'asian/medium', prefix: 'darkbrown_', first: 3001, last: 3028 },
    { path: 'asian/short', prefix: 'black_', first: 3001, last: 3032 },
    { path: 'asian/short', prefix: 'darkbrown_', first: 3001, last: 3015 },
  ],
  white: [
    { path: 'euro/long', prefix: 'black_', first: 3001, last: 3015 },
    { path: 'euro/long', prefix: 'blonde_', first: 3001, last: 3011 },
    { path: 'euro/long', prefix: 'darkbrown_', first: 3001, last: 3015 },
    { path: 'euro/long', prefix: 'grey_', first: 3001, last: 3002 },
    { path: 'euro/long', prefix: 'lightbrown_', first: 3001, last: 3014 },
    { path: 'euro/long', prefix: 'red_', first: 3001, last: 3003 },
    { path: 'euro/medium', prefix: 'black_', first: 3001, last: 3024 },
    { path: 'euro/medium', prefix: 'blonde_', first: 3001, last: 3022 },
    { path: 'euro/medium', prefix: 'darkbrown_', first: 3001, last: 3027 },
    { path: 'euro/medium', prefix: 'grey_', first: 3001, last: 3004 },
    { path: 'euro/medium', prefix: 'lightbrown_', first: 3001, last: 3025 },
    { path: 'euro/medium', prefix: 'red_', first: 3001, last: 3007 },
    { path: 'euro/short', prefix: 'bald_', first: 3001, last: 3022 },
    { path: 'euro/short', prefix: 'black_', first: 3001, last: 3043 },
    { path: 'euro/short', prefix: 'blonde_', first: 3001, last: 3047 },
    { path: 'euro/short', prefix: 'darkbrown_', first: 3001, last: 3062 },
    { path: 'euro/short', prefix: 'grey_', first: 3001, last: 3015 },
  ],
};

export const REGEN_WOMEN_FOLDERS: Record<string, SequentialPortraitFolder> = {
  African: { prefix: 'WF1African', max: 1000 },
  Australia: { prefix: 'WF1Australia', max: 1000 },
  CaucasianNA: { prefix: 'WF1CaucasianNA', max: 989 },
  China: { prefix: 'WF2China', max: 933 },
  Denmark: { prefix: 'WF1Denmark', max: 914 },
  England: { prefix: 'WF1England', max: 1000 },
  France: { prefix: 'WF1France', max: 1000 },
  Germany: { prefix: 'WF1Germany', max: 1000 },
  Italy: { prefix: 'WF1Italy', max: 1000 },
  Japan: { prefix: 'WF1Japan', max: 1000 },
  Korea: { prefix: 'WF2Korea', max: 908 },
  Maghreb: { prefix: 'WF2Maghreb', max: 687 },
  Norway: { prefix: 'WF1Norway', max: 902 },
  Spain: { prefix: 'WF1Spain', max: 1000 },
  Sweden: { prefix: 'WF1Sweden', max: 1000 },
  WestSlavic: { prefix: 'WF1WestSlavic', max: 1000 },
};

export const REGEN_STAFF_FOLDERS: Record<string, Partial<Record<'male' | 'female', SequentialPortraitFolder>>> = {
  African: {
    male: { prefix: 'African', max: 1000 },
    female: { prefix: 'African', max: 464 },
  },
  Armenian: { male: { prefix: 'SP1Armenian', max: 272 } },
  Brazil: {
    male: { prefix: 'Brazil', max: 1002, excluded: [100, 930] },
    female: { prefix: 'Brazil', max: 171 },
  },
  CaucasianNA: {
    male: { prefix: 'CaucasianNA', max: 457 },
    female: { prefix: 'CaucasianNA', max: 175 },
  },
  CentralAfrica: { male: { prefix: 'SP1Centralafrica', max: 447 } },
  China: {
    male: { prefix: 'China', max: 286 },
    female: { prefix: 'China', max: 140 },
  },
  EasternEurope: {
    male: { prefix: 'EasternEurope', max: 506 },
    female: { prefix: 'EasternEurope', max: 148 },
  },
  Japan: {
    male: { prefix: 'Japan', max: 299 },
    female: { prefix: 'Japan', max: 135 },
  },
  Korea: {
    male: { prefix: 'Korea', max: 298 },
    female: { prefix: 'Korea', max: 152 },
  },
  LatinAmerica: {
    male: { prefix: 'LatinAmerica', max: 1000 },
    female: { prefix: 'LatinAmerica', max: 242 },
  },
  Maghreb: { male: { prefix: 'SP1Maghreb', max: 423 } },
  MiddleEast: {
    male: { prefix: 'MiddleEast', max: 631 },
    female: { prefix: 'MiddleEast', max: 81 },
  },
  NorthCentralEurope: {
    male: { prefix: 'NorthCentralEurope', max: 1000 },
    female: { prefix: 'NorthCentralEurope', max: 188 },
  },
  NorthWestEurope: {
    male: { prefix: 'NorthWestEurope', max: 1000 },
    female: { prefix: 'NorthWestEurope', max: 174 },
  },
  SEA: {
    male: { prefix: 'SEA', max: 392 },
    female: { prefix: 'SEA', max: 79 },
  },
  Scandinavian: { male: { prefix: 'SP1Scandinavian', max: 753 } },
  SouthEurope: {
    male: { prefix: 'SouthEurope', max: 896 },
    female: { prefix: 'SouthEurope', max: 211 },
  },
  SouthWestEurope: {
    male: { prefix: 'SouthWestEurope', max: 1000 },
    female: { prefix: 'SouthWestEurope', max: 280 },
  },
};
