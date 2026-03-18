import { MissType } from './ThreePointContestSim';

export const MADE_REGULAR = ['Good.','Money.','Yes.','Clean.','Wet.','Cash.','Pure.','Bottom of the net.','Butter.'];
export const MADE_MONEYBALL = ['MONEYBALL!!','The orange!!','Cash!!','CASHES IT!!','The orange is GOOD!!','Two more!!'];
export const MISS_REGULAR = ['No good.','Off.','Rimmed out.','Long.','Short.','Iron.','Bounces out.'];
export const MISS_MONEYBALL = ["Moneyball — no good.","Leaves the moneyball.","Orange one rattles out.","Can't cash it.","Two points on the rack."];

export const MISS_BY_TYPE: Record<MissType, string[]> = {
  airball: [
    'AIRBALL!!',
    "Doesn't even graze the rim.",
    'Complete airball — oh no.',
    'Not even close.',
    'Sails wide — airball.',
  ],
  backboard: [
    'Clangs off the backboard.',
    'Hits the side of the backboard.',
    'Way off — hits the board.',
    'Weird angle — off the backboard.',
    'Deflects off the glass.',
  ],
  front_rim: [
    'Hits the front iron.',
    'Smacks the front rim.',
    'Catches the front of the rim.',
    'Front rim — no good.',
    'Hits the lip — no.',
  ],
  back_rim: [
    'Long off the back rim.',
    'Too much — off the back iron.',
    'Clangs off the back of the rim.',
    'Long. Hits the back rim.',
    'Back iron — no good.',
  ],
  in_and_out: [
    'In and out!! Oh no.',
    'Rattles around — no good.',
    'Rolls around the rim — out!!',
    'Dances on the rim — won\'t fall.',
    'In and out. Agony.',
    'Looked good — rolls out.',
  ],
  left_right: [
    'Slides off to the left.',
    'Kicks right — no good.',
    'Off the side of the rim.',
    'Misses left.',
    'Drifts right — no good.',
  ],
  short: [
    'Short.',
    'Couldn\'t get there.',
    'Falls short.',
    'Short off the front.',
    'Not enough.',
    'Way short.',
  ],
};

export const MISS_MONEYBALL_BY_TYPE: Partial<Record<MissType, string[]>> = {
  in_and_out: [
    'The orange rattles out!! So close.',
    'Moneyball in and out — agony.',
    'TWO POINTS rattle out of the rim.',
    'The orange dances — won\'t fall.',
  ],
  front_rim: [
    'Moneyball — hits the front rim.',
    'The orange catches the iron.',
    'Front rim on the moneyball.',
  ],
  back_rim: [
    'Orange one — too long.',
    'Moneyball off the back rim.',
    'Long on the orange one.',
  ],
  short: [
    'Can\'t cash the moneyball.',
    'Moneyball — no good.',
    'Leaves the moneyball.',
    'Orange one falls short.',
  ],
  left_right: [
    'Orange one rattles out.',
    'Moneyball kicks off the side.',
    'Two points — off the rim.',
  ],
};

export const HOT_HAND_3 = [
  'He is DIALED IN.',
  'Locked in right now.',
  'Three in a row.',
  'Everything is going.',
];
export const HOT_HAND_4 = [
  'Can\'t miss. Four straight.',
  'FOUR IN A ROW!!',
  'The rack is on fire.',
  'Automatic. Every single one.',
];
export const HOT_HAND_5 = [
  'FIVE STRAIGHT!! Is this real??',
  'PERFECT THROUGH FIVE!!',
  'He has not missed. Not once.',
  'The crowd is going crazy.',
];
export const HOT_HAND_6_PLUS = [
  'SIX IN A ROW. UNBELIEVABLE.',
  'IS THIS REAL LIFE??',
  'He simply will not miss.',
  'The greatest rack we have ever seen.',
];
export const COLD_STREAK_3 = [
  'Struggling to find the bottom.',
  'Can\'t get one to fall.',
  'Three straight misses.',
  'A rough patch here.',
];
export const COLD_STREAK_4_PLUS = [
  'This rack is falling apart.',
  'Four misses in a row. Needs to settle.',
  'The pressure is getting to him.',
  'Everything is rattling out.',
];

export const CROWD_PERFECT_STATION = [
  'The crowd erupts.',
  'Pandemonium at the arena.',
  'The building is going crazy.',
  'Everyone on their feet.',
  'The place is ROCKING.',
];

export const CROWD_ZERO_STATION = [
  'Silence in the arena.',
  'The crowd goes quiet.',
  'You could hear a pin drop.',
  'Oh no. Zero from that station.',
  'Dead silence.',
];

export const CROWD_MONEYBALL_RACK_BIG = [
  'They are STANDING in the arena.',
  'The moneyball rack saves the day.',
  'HUGE moneyball rack — the crowd knows.',
  'Eight points!! The arena erupts.',
  'The orange balls are FLYING IN.',
];

export const CROWD_AIRBALL = [
  "Ohhh. The crowd lets him hear it.",
  'A groan from the crowd.',
  'The arena reacts — not kindly.',
  'Crowd noise for all the wrong reasons.',
];

export const CROWD_IN_AND_OUT = [
  'OHHHH. So close.',
  'The crowd feels that one.',
  'Agonizing. Right there.',
  'Everyone thought that was in.',
];

export const CROWD_HOT_RACK = [
  'The crowd is locked in with every shot.',
  'The arena is electric right now.',
  'Every make getting louder and louder.',
];

export const CROWD_FINALS_PRESSURE = [
  'Dead quiet. Everyone knows what\'s at stake.',
  'The tension in the building is real.',
  'Every shot matters now.',
  'The crowd holding its breath.',
];

export const STATION_DONE = [
  '[pts] at the [name].',
  '[pts] from the [name].',
  '[pts] there.',
  'Station [n]: [pts].',
];

export const HOT_STREAK = ['Locked in.','Can\'t miss.','Automatic.','Everything is falling.','The rack is on fire.'];
export const COLD_STREAK = ['Struggling.','Can\'t get one to fall.','Needs to settle.','Rough stretch here.'];

export const HIGH_SCORE = ['THAT IS A SERIOUS NUMBER.','[total]!! The bar has been SET!!','The other players just saw that.'];
export const GOOD_SCORE = ['[total] for [name]. Solid rack.','[name] puts up [total].'];

export const R1_HEADER = ['Eight shooters. One rack each. Let\'s go.','Round 1 — all eight contestants.','The three-point contest is underway.'];

export const FINALS_HEADER = ['[p1] and [p2] advance to the Finals!','The finalists: [p1] and [p2].','Two shooters left. One champion.'];
export const WINNER = ['[name] wins the three-point contest!!','[name] is your champion!!','CHAMPION: [name]!!'];

export const MONEYBALL_RACK_SETUP = [
  '[name] is going moneyball rack at the [station].',
  'All five moneyballs at the [station] for [name].',
  'The moneyball rack is at the [station].',
];
