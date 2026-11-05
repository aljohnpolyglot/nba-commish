export type Team = 'NORTH' | 'SOUTH';
export type DanceStyle = 'Synchronized' | 'Hip-Hop' | 'Novelty' | 'Awkward' | 'Energetic' | 'Captain Solo' | 'Basketball' | 'Viral Dance';
export type SongMood = 'Hype' | 'Chill' | 'Intense' | 'Goofy' | 'Epic';
export type Formation = 
  | 'V-Shape' 
  | 'Circle' 
  | 'Lines' 
  | 'Diamond' 
  | 'Scattered' 
  | 'Arrowhead' 
  | 'Staggered' 
  | 'W-Shape' 
  | 'Box-Grid' 
  | 'Starburst' 
  | 'Pyramid' 
  | 'ZigZag' 
  | 'Semicircle';

export type Ending = 'Pose' | 'Point to Sky' | 'High Five' | 'Bow' | 'Kneel';

export interface Pose {
  rootX: number; rootY: number; rootRot: number;
  torsoRot: number;
  headX: number; headY: number; headRot: number;
  armLRot: number; lArmLRot: number;
  armRRot: number; lArmRRot: number;
  legLRot: number; lLegLRot: number;
  legRRot: number; lLegRRot: number;
}

export interface PlayerAnim {
  id: number;
  speed: number;
  delay: number;
  rotation: number;
  isCaptain: boolean;
  portraitUrl: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface Routine {
  style: DanceStyle;
  mood: SongMood;
  formation: Formation;
  formationSequence: Formation[];
  ending: Ending;
  players: PlayerAnim[];
  poseSequence: Pose[];
}

export interface Scores {
  entertainment: number;
  synchronization: number;
  creativity: number;
  crowdAppeal: number;
  finalScore: number;
}

export interface TeamData {
  team: Team;
  name: string;
  routine: Routine;
  scores: Scores;
}
