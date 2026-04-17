// Mood trait keys — 8 total, 4 core personality types (DIVA/LOYAL/MERCENARY/COMPETITOR)
// inspired by BBGM's F/L/$/W, plus 3 drama modifiers, plus FAME.
export type MoodTrait =
  | 'DIVA'         // F — fame/PT focused; playing-time component 2×
  | 'LOYAL'        // L — team loyalty; slower mood decay, commish rel +1 always
  | 'MERCENARY'    // $ — money driven; contract component 2×
  | 'COMPETITOR'   // W — winning obsessed; win-delta 2×, rebuilding adds −2
  | 'VOLATILE'     // negative components 1.5×; mood swings faster
  | 'AMBASSADOR'   // commish relationship +1; drama probability halved
  | 'DRAMA_MAGNET' // drama probability doubled; severity always escalates
  | 'FAME';        // market-size bonus doubled (High+4, Mid+2 instead of +2/+1)

// Mutually exclusive pairs — never assign both from the same pair
export const TRAIT_EXCLUSIONS: [MoodTrait, MoodTrait][] = [
  ['LOYAL', 'MERCENARY'],
  ['AMBASSADOR', 'DRAMA_MAGNET'],
  ['DIVA', 'AMBASSADOR'],
];

export interface MoodComponents {
  playingTime: number;    // −3 to +3
  teamSuccess: number;    // −3 to +5 (COMPETITOR can reach +5)
  contractSatisfaction: number; // −2 to +2
  commishRelationship: number;  // −2 to +2
  roleStability: number;  // −1.5 to +0.5
  marketSize: number;     // −2 to +4 (High+2/Mid+1/Low+0; FAME doubles; DIVA/MERC extra)
  noise: number;          // −1 to +1 (seeded)
}
