export interface DunkMove {
  id: string;
  name: string;
  displayName: string;
  difficulty: number; // 0-100
  ceiling: number; // max judge score 0-50
  category: 'power' | 'acrobatic' | 'creative' | 'legendary';
  reqJmp: number;
  reqDnk: number;
  description: string; // broadcast flavor text AFTER reveal
}

export const DUNK_MOVES: DunkMove[] = [
  // ── STANDARD ──────────────────────────────────
  { id: 'two_hand', name: 'Two-Handed Flush', displayName: 'TWO-HANDED FLUSH', difficulty: 0, ceiling: 38, category: 'power', reqJmp: 0, reqDnk: 0, description: 'Classic power dunk — sends a message.' },
  { id: 'one_hand', name: 'One-Handed Slam', displayName: 'ONE-HANDED SLAM', difficulty: 5, ceiling: 42, category: 'power', reqJmp: 30, reqDnk: 30, description: 'One arm, all conviction.' },
  { id: 'tomahawk', name: 'Tomahawk', displayName: 'TOMAHAWK', difficulty: 8, ceiling: 44, category: 'power', reqJmp: 50, reqDnk: 50, description: 'Drawn back over the head, hammered through the iron.' },
  { id: 'reverse', name: 'Reverse Dunk', displayName: 'REVERSE', difficulty: 10, ceiling: 44, category: 'acrobatic', reqJmp: 55, reqDnk: 55, description: 'Turned away from the basket — finishes backward.' },
  // ── ACROBATIC ─────────────────────────────────
  { id: 'windmill', name: 'Windmill', displayName: 'WINDMILL', difficulty: 15, ceiling: 46, category: 'acrobatic', reqJmp: 65, reqDnk: 65, description: 'Arm swings in a full circle — pure hang time.' },
  { id: 'cradle', name: 'Cradle Dunk', displayName: 'CRADLE', difficulty: 16, ceiling: 46, category: 'acrobatic', reqJmp: 72, reqDnk: 72, description: 'Cradled against the body, one hand tucked — then thrown home.' },
  { id: 'three_sixty', name: '360° Dunk', displayName: '360°', difficulty: 18, ceiling: 48, category: 'acrobatic', reqJmp: 70, reqDnk: 70, description: 'Full rotation in the air. One full spin. Two points.' },
  { id: 'between_legs', name: 'Between the Legs', displayName: 'BETWEEN THE LEGS', difficulty: 20, ceiling: 50, category: 'legendary', reqJmp: 75, reqDnk: 75, description: 'Passed between the knees while airborne. The crowd has lost it.' },
  { id: 'elbow_hang', name: 'Elbow Hang', displayName: 'ELBOW HANG', difficulty: 22, ceiling: 50, category: 'legendary', reqJmp: 80, reqDnk: 80, description: 'Hangs off the elbow — pure showmanship.' },
  { id: 'eastbay', name: 'Eastbay (FT Line)', displayName: 'EASTBAY', difficulty: 22, ceiling: 50, category: 'legendary', reqJmp: 90, reqDnk: 90, description: 'Between the legs — from the free throw line. Vince Carter territory.' },
  { id: 'under_legs', name: 'Under Both Legs', displayName: 'UNDER BOTH LEGS', difficulty: 25, ceiling: 50, category: 'legendary', reqJmp: 85, reqDnk: 85, description: 'Ball passes under both knees mid-flight. Physics-defying.' },
  // ── CREATIVE / SHOWMAN ────────────────────────
  { id: 'double_spin', name: 'Double Spin', displayName: 'DOUBLE SPIN', difficulty: 20, ceiling: 48, category: 'creative', reqJmp: 78, reqDnk: 75, description: 'Two complete rotations before the slam.' },
  { id: 'spinning_honey', name: 'Spinning Honey Dip', displayName: 'SPINNING HONEY DIP', difficulty: 23, ceiling: 50, category: 'legendary', reqJmp: 82, reqDnk: 80, description: 'Spinning 360 into the honey dip finish — pure theater.' },
  { id: 'wrong_way_360', name: 'Wrong-Way 360', displayName: 'WRONG-WAY 360°', difficulty: 21, ceiling: 48, category: 'creative', reqJmp: 76, reqDnk: 74, description: 'Spinning the wrong direction — catches everyone off guard.' },
  { id: 'behind_the_back', name: 'Behind the Back', displayName: 'BEHIND THE BACK', difficulty: 19, ceiling: 48, category: 'creative', reqJmp: 74, reqDnk: 72, description: 'Ball transferred behind the back at the peak.' },
  { id: 'hot_potato', name: 'The Hot Potato', displayName: 'HOT POTATO', difficulty: 17, ceiling: 46, category: 'creative', reqJmp: 70, reqDnk: 68, description: 'Ball juggled between hands on the way up — looks impossible.' },
  { id: 'fist_bump_wmill', name: 'Fist Bump Windmill', displayName: 'FIST BUMP WINDMILL', difficulty: 18, ceiling: 46, category: 'creative', reqJmp: 72, reqDnk: 70, description: 'Windmill into a fist bump celebration before even landing.' },
  { id: 'soccer_flip', name: 'Swinging Soccer Flip', displayName: 'SOCCER FLIP', difficulty: 22, ceiling: 50, category: 'legendary', reqJmp: 80, reqDnk: 78, description: 'Overhead soccer-kick style approach into the slam.' },
  { id: 'tap_catch_glass', name: 'Tap & Catch Off Glass', displayName: 'TAP AND CATCH', difficulty: 16, ceiling: 44, category: 'creative', reqJmp: 68, reqDnk: 65, description: 'Taps it off the glass, catches it in stride, slams it home.' },
  { id: 'under_legs_rev', name: 'Under-Legs Reverse Spin', displayName: 'UNDER-LEGS REVERSE SPIN', difficulty: 24, ceiling: 50, category: 'legendary', reqJmp: 84, reqDnk: 82, description: 'Between the legs AND a reverse spin. Two signature moves in one.' },
  { id: 'super_scoop', name: 'Super Smooth Scoop', displayName: 'SUPER SMOOTH SCOOP', difficulty: 14, ceiling: 44, category: 'creative', reqJmp: 65, reqDnk: 62, description: 'Silky scoop release at the apex — barely broke a sweat.' },
  // ── SIGNATURE LEGENDARY (KILGANON/RIVERA) ─────
  { id: 'scorpion', name: 'The Scorpion', displayName: 'SCORPION', difficulty: 26, ceiling: 50, category: 'legendary', reqJmp: 95, reqDnk: 95, description: 'Reaches back behind the head for a reverse scorpion finish. Lethal.' },
  { id: 'lost_and_found', name: 'Lost and Found', displayName: 'LOST AND FOUND', difficulty: 27, ceiling: 50, category: 'legendary', reqJmp: 96, reqDnk: 96, description: 'A mid-air hand-off to himself that defies the laws of physics.' },
  { id: 'the_540', name: 'The 540', displayName: '540° SLAM', difficulty: 28, ceiling: 50, category: 'legendary', reqJmp: 98, reqDnk: 98, description: 'One and a half rotations. The room is spinning.' },
  { id: 'btl_btb', name: 'BTL to Behind the Back', displayName: 'BTL TO BTB', difficulty: 29, ceiling: 50, category: 'legendary', reqJmp: 97, reqDnk: 97, description: 'Between the legs into a behind-the-back transfer. Pure wizardry.' },
  { id: 'rivera_360_btb_btl', name: '360 BTB to BTL', displayName: '360 BTB BTL', difficulty: 30, ceiling: 50, category: 'legendary', reqJmp: 99, reqDnk: 99, description: '360 spin, behind the back, then through the legs. Impossible.' },
  { id: 'rivera_kamikaze', name: 'The Kamikaze', displayName: 'KAMIKAZE', difficulty: 25, ceiling: 49, category: 'legendary', reqJmp: 94, reqDnk: 94, description: 'A violent, high-altitude assault on the rim.' },
  { id: 'rivera_double_btl', name: 'Double Between the Legs', displayName: 'DOUBLE BTL', difficulty: 28, ceiling: 50, category: 'legendary', reqJmp: 97, reqDnk: 97, description: 'Twice through the legs in one jump. He stayed in the air forever.' },
];

export const TOSS_TYPES = [
  { id: 'none', name: 'Standard', difficulty: 0 },
  { id: 'self_toss', name: 'Self Alley-Oop', difficulty: 5 },
  { id: 'off_board', name: 'Off the Backboard', difficulty: 10 },
  { id: 'behind_back', name: 'Behind-the-Back Toss', difficulty: 8 },
  { id: 'btl_toss', name: 'Between-the-Legs Toss', difficulty: 15 },
  { id: 'half_court', name: 'Half-Court Self-Toss', difficulty: 18 },
];

export const LAUNCH_SPOTS = [
  { id: 'at_rim', name: 'At the Rim', difficulty: 0 },
  { id: 'short', name: 'Short Distance', difficulty: 3 },
  { id: 'free_throw', name: 'the Free Throw Line', difficulty: 8 },
  { id: 'beyond_ft', name: 'well Beyond the FT Line', difficulty: 15 },
];

// ── CONTESTANTS ───────────────────────────────────────────────────────────────
export interface Contestant {
  nbaId: string;
  name: string;
  shortName: string;
  number: string;
  team: string;
  teamColor: string;
  imgURL: string;
  ratings: { jmp: number; dnk: number; spd: number }[];
  awards: { season: number; type: string }[];
  pos: string;
  age: number;
  archetype: 'powerhouse' | 'acrobat' | 'showman' | 'legend';
  archetypeDesc: string;
  intro: string; // broadcast intro line
}

export const CONTESTANTS: Contestant[] = [
  {
    nbaId: 'edwards',
    name: 'Anthony Edwards',
    shortName: 'ANT',
    number: '5',
    team: 'Minnesota Timberwolves',
    teamColor: '#236192',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630162.png',
    ratings: [{ jmp: 88, dnk: 90, spd: 90 }],
    awards: [],
    pos: 'G',
    age: 24,
    archetype: 'powerhouse',
    archetypeDesc: 'Raw explosion. Pure power.',
    intro: 'The most electric athlete in the NBA right now.',
  },
  {
    nbaId: 'gordon',
    name: 'Aaron Gordon',
    shortName: 'AG',
    number: '50',
    team: 'Denver Nuggets',
    teamColor: '#FEC524',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203932.png',
    ratings: [{ jmp: 92, dnk: 94, spd: 82 }],
    awards: [{ season: 2023, type: "Slam Dunk Contest Winner" }],
    pos: 'F',
    age: 30,
    archetype: 'legend',
    archetypeDesc: "The people's champion. Robbed twice.",
    intro: "The man who should have won this twice. He's back.",
  },
  {
    nbaId: 'mcclung',
    name: 'Mac McClung',
    shortName: 'MAC',
    number: '0',
    team: 'Osceola Magic',
    teamColor: '#0077C0',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630644.png',
    ratings: [{ jmp: 85, dnk: 88, spd: 88 }],
    awards: [{ season: 2024, type: "Slam Dunk Contest Winner" }],
    pos: 'G',
    age: 26,
    archetype: 'showman',
    archetypeDesc: "Defending champion. Won't be denied.",
    intro: 'The reigning champion. Came here to defend his crown.',
  },
  {
    nbaId: 'toppin',
    name: 'Obi Toppin',
    shortName: 'OBI',
    number: '1',
    team: 'Indiana Pacers',
    teamColor: '#002D62',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630167.png',
    ratings: [{ jmp: 87, dnk: 85, spd: 80 }],
    awards: [{ season: 2022, type: "Slam Dunk Contest Winner" }],
    pos: 'F',
    age: 28,
    archetype: 'acrobat',
    archetypeDesc: 'Creative flair. Every dunk is a statement.',
    intro: 'Highlight reel on legs. Every attempt is a painting.',
  },
];
