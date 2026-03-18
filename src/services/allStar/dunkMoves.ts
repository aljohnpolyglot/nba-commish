export interface DunkMove {
  id: string;
  name: string;
  displayName: string;
  tier: 1 | 2 | 3 | 4 | 5;
  difficulty: number;        // 1-30 scale
  scoreFloor: number;        // minimum score on clean first attempt
  scoreCeiling: number;      // maximum possible score
  tossCompatibility: string[]; // which toss types make sense with this move
  obstacleBonus: number;     // ceiling boost when performed over an obstacle
  approachBonus: number;     // ceiling boost when performed from FT line or further
  description: string;
}

export const DUNK_MOVES: DunkMove[] = [
  // ── TIER 1: BASIC POWER ──────────────────────────────────────────────────
  {
    id: 'two_hand',
    name: 'Two-Handed Flush',
    displayName: 'TWO-HANDED FLUSH',
    tier: 1,
    difficulty: 2,
    scoreFloor: 30,
    scoreCeiling: 38,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass'],
    obstacleBonus: 1,
    approachBonus: 1,
    description: "A fundamental two-handed flush with maximum rim-rattling power."
  },
  {
    id: 'one_hand',
    name: 'One-Handed Slam',
    displayName: 'ONE-HANDED SLAM',
    tier: 1,
    difficulty: 3,
    scoreFloor: 32,
    scoreCeiling: 40,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass'],
    obstacleBonus: 1,
    approachBonus: 1,
    description: "High-flying one-handed reach with full arm extension."
  },
  {
    id: 'tomahawk',
    name: 'Tomahawk',
    displayName: 'TOMAHAWK',
    tier: 1,
    difficulty: 5,
    scoreFloor: 34,
    scoreCeiling: 42,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass', 'self_glass'],
    obstacleBonus: 2,
    approachBonus: 2,
    description: "Bringing the ball way back behind the head for a violent finish."
  },
  {
    id: 'reverse',
    name: 'Reverse Dunk',
    displayName: 'REVERSE DUNK',
    tier: 1,
    difficulty: 6,
    scoreFloor: 35,
    scoreCeiling: 43,
    tossCompatibility: ['none', 'self_lob', 'off_backboard'],
    obstacleBonus: 2,
    approachBonus: 1,
    description: "A smooth 180-degree turn finishing on the opposite side of the rim."
  },
  {
    id: 'rim_grazer',
    name: 'Rim Grazer',
    displayName: 'RIM GRAZER',
    tier: 1,
    difficulty: 1,
    scoreFloor: 28,
    scoreCeiling: 35,
    tossCompatibility: ['none'],
    obstacleBonus: 0,
    approachBonus: 0,
    description: "A low-altitude but clean finish, emphasizing finesse over power."
  },
  {
    id: 'back_scratcher',
    name: 'Back Scratcher',
    displayName: 'BACK SCRATCHER',
    tier: 1,
    difficulty: 4,
    scoreFloor: 33,
    scoreCeiling: 41,
    tossCompatibility: ['none', 'self_lob'],
    obstacleBonus: 1,
    approachBonus: 1,
    description: "An exaggerated tomahawk where the ball nearly touches the shoulder blades."
  },

  // ── TIER 2: ACROBATIC CLASS ──────────────────────────────────────────────
  {
    id: 'windmill',
    name: 'Windmill',
    displayName: 'WINDMILL',
    tier: 2,
    difficulty: 10,
    scoreFloor: 38,
    scoreCeiling: 45,
    tossCompatibility: ['none', 'self_lob', 'self_glass', 'teammate_alley', 'off_backboard'],
    obstacleBonus: 3,
    approachBonus: 2,
    description: "The classic circular arm motion, a staple of every great dunker."
  },
  {
    id: 'cradle',
    name: 'Cradle Dunk',
    displayName: 'CRADLE DUNK',
    tier: 2,
    difficulty: 11,
    scoreFloor: 39,
    scoreCeiling: 45,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass'],
    obstacleBonus: 2,
    approachBonus: 2,
    description: "Tucking the ball into the crook of the elbow before the flush."
  },
  {
    id: 'double_clutch',
    name: 'Double Clutch',
    displayName: 'DOUBLE CLUTCH',
    tier: 2,
    difficulty: 9,
    scoreFloor: 37,
    scoreCeiling: 44,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass'],
    obstacleBonus: 2,
    approachBonus: 2,
    description: "Bringing the ball down to the waist and back up mid-air to avoid the rim."
  },
  {
    id: 'side_windmill',
    name: 'Side Windmill',
    displayName: 'SIDE WINDMILL',
    tier: 2,
    difficulty: 12,
    scoreFloor: 40,
    scoreCeiling: 46,
    tossCompatibility: ['none', 'self_lob', 'off_backboard'],
    obstacleBonus: 3,
    approachBonus: 2,
    description: "A windmill performed with a lateral approach for extra hang time."
  },
  {
    id: 'leaner',
    name: 'The Leaner',
    displayName: 'THE LEANER',
    tier: 2,
    difficulty: 8,
    scoreFloor: 36,
    scoreCeiling: 43,
    tossCompatibility: ['none', 'self_lob'],
    obstacleBonus: 1,
    approachBonus: 3,
    description: "Jumping from the side and leaning the body horizontally toward the hoop."
  },
  {
    id: 'front_windmill',
    name: 'Front Windmill',
    displayName: 'FRONT WINDMILL',
    tier: 2,
    difficulty: 13,
    scoreFloor: 41,
    scoreCeiling: 46,
    tossCompatibility: ['none', 'self_lob', 'teammate_alley'],
    obstacleBonus: 3,
    approachBonus: 2,
    description: "A windmill performed while facing the rim directly, requiring elite vertical."
  },

  // ── TIER 3: ELITE CLASS ──────────────────────────────────────────────────
  {
    id: 'three_sixty',
    name: '360° Spin',
    displayName: '360° SPIN',
    tier: 3,
    difficulty: 16,
    scoreFloor: 42,
    scoreCeiling: 48,
    tossCompatibility: ['none', 'self_lob', 'self_glass', 'teammate_alley', 'off_backboard'],
    obstacleBonus: 4,
    approachBonus: 2,
    description: "A full rotation in the air before slamming it home."
  },
  {
    id: 'elbow_hang',
    name: 'Elbow Hang',
    displayName: 'ELBOW HANG',
    tier: 3,
    difficulty: 18,
    scoreFloor: 44,
    scoreCeiling: 49,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass'],
    obstacleBonus: 3,
    approachBonus: 1,
    description: "Sticking the entire forearm through the rim and hanging by the elbow."
  },
  {
    id: 'behind_the_back',
    name: 'Behind the Back',
    displayName: 'BEHIND THE BACK',
    tier: 3,
    difficulty: 17,
    scoreFloor: 43,
    scoreCeiling: 48,
    tossCompatibility: ['none', 'self_lob', 'self_glass', 'teammate_pass'],
    obstacleBonus: 3,
    approachBonus: 2,
    description: "Wrapping the ball around the waist behind the back mid-flight."
  },
  {
    id: 'super_scoop',
    name: 'Super Scoop',
    displayName: 'SUPER SCOOP',
    tier: 3,
    difficulty: 15,
    scoreFloor: 41,
    scoreCeiling: 47,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass'],
    obstacleBonus: 2,
    approachBonus: 3,
    description: "An underhand scoop from below the knees all the way to the rim."
  },
  {
    id: 'wrong_way_360',
    name: 'Wrong-Way 360°',
    displayName: 'WRONG-WAY 360°',
    tier: 3,
    difficulty: 19,
    scoreFloor: 45,
    scoreCeiling: 49,
    tossCompatibility: ['none', 'self_lob', 'off_backboard'],
    obstacleBonus: 4,
    approachBonus: 2,
    description: "Rotating against the natural direction of the jump for maximum difficulty."
  },
  {
    id: 'self_alley_reverse',
    name: 'Self-Alley Reverse',
    displayName: 'SELF-ALLEY REVERSE',
    tier: 3,
    difficulty: 16,
    scoreFloor: 42,
    scoreCeiling: 48,
    tossCompatibility: ['self_lob', 'self_glass', 'off_backboard'],
    obstacleBonus: 3,
    approachBonus: 2,
    description: "Throwing a high lob to oneself and finishing with a reverse flush."
  },

  // ── TIER 4: SIGNATURE CLASS ──────────────────────────────────────────────
  {
    id: 'eastbay',
    name: 'Eastbay Funk',
    displayName: 'EASTBAY FUNK',
    tier: 4,
    difficulty: 22,
    scoreFloor: 46,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'self_glass', 'teammate_alley', 'off_backboard', 'btl_toss'],
    obstacleBonus: 5,
    approachBonus: 4,
    description: "The iconic between-the-legs dunk, popularized by the greats."
  },
  {
    id: 'under_legs',
    name: 'Under Both Legs',
    displayName: 'UNDER BOTH LEGS',
    tier: 4,
    difficulty: 24,
    scoreFloor: 47,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'teammate_alley', 'off_backboard'],
    obstacleBonus: 5,
    approachBonus: 3,
    description: "Threading the ball under both legs in a figure-eight motion."
  },
  {
    id: 'soccer_flip',
    name: 'Soccer Flip',
    displayName: 'SOCCER FLIP',
    tier: 4,
    difficulty: 23,
    scoreFloor: 46,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob'],
    obstacleBonus: 4,
    approachBonus: 3,
    description: "Using a soccer-style flip-throw as the assist for a massive finish."
  },
  {
    id: 'spinning_honey',
    name: 'Spinning Honey Dip',
    displayName: 'SPINNING HONEY DIP',
    tier: 4,
    difficulty: 25,
    scoreFloor: 48,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'off_backboard'],
    obstacleBonus: 4,
    approachBonus: 2,
    description: "A 360 rotation ending with the elbow-hang 'honey dip' finish."
  },
  {
    id: 'windmill_switch',
    name: 'Windmill Switch',
    displayName: 'WINDMILL SWITCH',
    tier: 4,
    difficulty: 21,
    scoreFloor: 45,
    scoreCeiling: 49,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass', 'off_backboard'],
    obstacleBonus: 3,
    approachBonus: 3,
    description: "Starting a windmill with one hand and switching to the other mid-air."
  },
  {
    id: 'three_sixty_windmill',
    name: '360° Windmill',
    displayName: '360° WINDMILL',
    tier: 4,
    difficulty: 24,
    scoreFloor: 47,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'self_glass', 'teammate_alley', 'off_backboard'],
    obstacleBonus: 5,
    approachBonus: 3,
    description: "Combining a full 360 rotation with a powerful windmill motion."
  },

  // ── TIER 5: LEGENDARY CLASS ──────────────────────────────────────────────
  {
    id: 'scorpion',
    name: 'The Scorpion',
    displayName: 'THE SCORPION',
    tier: 5,
    difficulty: 27,
    scoreFloor: 49,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass'],
    obstacleBonus: 5,
    approachBonus: 4,
    description: "Arching the back mid-air like a scorpion before a double-clutch finish."
  },
  {
    id: 'lost_and_found',
    name: 'Lost and Found',
    displayName: 'LOST AND FOUND',
    tier: 5,
    difficulty: 28,
    scoreFloor: 49,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass', 'off_backboard'],
    obstacleBonus: 5,
    approachBonus: 3,
    description: "Releasing the ball entirely mid-air and catching it again before the flush."
  },
  {
    id: 'the_540',
    name: 'The 540°',
    displayName: 'THE 540°',
    tier: 5,
    difficulty: 29,
    scoreFloor: 50,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'off_backboard'],
    obstacleBonus: 6,
    approachBonus: 4,
    description: "One and a half full rotations in the air. Defying the laws of physics."
  },
  {
    id: 'btl_btb',
    name: 'BTL to Behind-the-Back',
    displayName: 'BTL TO BEHIND-THE-BACK',
    tier: 5,
    difficulty: 29,
    scoreFloor: 50,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass', 'off_backboard'],
    obstacleBonus: 6,
    approachBonus: 3,
    description: "Between the legs followed immediately by a behind the back wrap."
  },
  {
    id: 'rivera_360_btb_btl',
    name: 'Rivera 360 BTB BTL',
    displayName: '360° BTB TO BTL',
    tier: 5,
    difficulty: 30,
    scoreFloor: 50,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'teammate_pass', 'off_backboard'],
    obstacleBonus: 7,
    approachBonus: 4,
    description: "Isaiah Rivera's signature triple-move masterpiece."
  },
  {
    id: 'rivera_kamikaze',
    name: 'The Kamikaze',
    displayName: 'THE KAMIKAZE',
    tier: 5,
    difficulty: 26,
    scoreFloor: 49,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob'],
    obstacleBonus: 5,
    approachBonus: 5,
    description: "A long-distance dive with extreme ball manipulation."
  },
  {
    id: 'rivera_double_btl',
    name: 'Double Between the Legs',
    displayName: 'DOUBLE BETWEEN THE LEGS',
    tier: 5,
    difficulty: 28,
    scoreFloor: 50,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'off_backboard', 'btl_toss'],
    obstacleBonus: 6,
    approachBonus: 4,
    description: "Passing the ball under both legs twice in a single jump."
  },
  {
    id: 'double_spin',
    name: 'Double Spin 720°',
    displayName: 'DOUBLE SPIN 720°',
    tier: 5,
    difficulty: 30,
    scoreFloor: 50,
    scoreCeiling: 50,
    tossCompatibility: ['none', 'self_lob', 'off_backboard'],
    obstacleBonus: 7,
    approachBonus: 5,
    description: "Two full 360-degree rotations. A move once thought impossible."
  }
];
