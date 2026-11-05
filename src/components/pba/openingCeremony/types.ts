export interface AnimatedSkeletonPose {
  rootX: number;
  rootY: number;
  rootRot: number;
  torsoRot: number;
  headX: number;
  headY: number;
  headRot: number;
  armLRot: number;
  lowerArmLRot: number;
  armRRot: number;
  lowerArmRRot: number;
  legLRot: number;
  lowerLegLRot: number;
  legRRot: number;
  lowerLegRRot: number;
}

export interface FaceConfig {
  skinTone: string; // hex color e.g. '#f5c396'
  hairStyle: 'short' | 'curly' | 'afro' | 'fade' | 'long' | 'bun' | 'ponytail' | 'bald';
  hairColor: string;
  eyeType: 'normal' | 'happy' | 'determined' | 'star';
  facialHair?: 'none' | 'beard' | 'goatee' | 'stubble';
  headband?: boolean;
  headbandColor?: string;
  glasses?: boolean;
}

export interface PBAPlayer {
  id: string;
  name: string;
  spokenName?: string;
  jerseyNumber: string;
  position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
  isCaptain: boolean;
  portraitUrl?: string;
  face?: FaceConfig;
  initials: string;
  height?: string;
  college?: string;
}

export interface PBAMuse {
  id: string;
  name: string;
  spokenName?: string;
  title: string;
  portraitUrl?: string;
  face?: FaceConfig;
  sashText: string;
  dressColor: string;
  accentColor: string;
}

export interface PBATeam {
  id: string;
  name: string;
  spokenName?: string;
  shortName: string;
  nickname: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  championships: number;
  governor: string;
  headCoach: string;
  muse?: PBAMuse;
  players: PBAPlayer[];
  chant: string;
  introDescription: string;
}

export type CeremonyPlaybackState =
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'error';

export type ArenaLighting = 'stadium' | 'spotlight' | 'fiesta' | 'gold' | 'neon';
export type ViewMode = 'parade' | 'stage' | 'customizer';

export type AnnouncementPhase = 'opener' | 'team' | 'muse' | 'captain' | 'closer' | 'idle';

export interface CeremonyEvent {
  startMs: number;
  endMs: number;
  phase: AnnouncementPhase;
  caption: string;
  ttsText?: string;
}

export interface PreparedTeamCeremony {
  teamId: string;
  audioUrl: string;
  durationMs: number;
  timeline: CeremonyEvent[];
}
