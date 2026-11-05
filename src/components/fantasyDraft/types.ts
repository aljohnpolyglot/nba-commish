export interface Player {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  position: 'PG' | 'SG' | 'SF' | 'PF' | 'C' | string;
  displayPos: string; // e.g. "PG/SG", "G/F"
  age: number;
  heightFeetInches: string; // e.g. 6'8"
  heightInches: number;
  weight?: number; // lbs e.g. 215
  jerseyNumber?: number; // e.g. 23
  teamName: string;
  teamAbbrev: string;
  teamId: number;
  conference: 'Eastern' | 'Western';
  division?: string; // e.g. "Atlantic", "Pacific", "Central", "Southeast", "Northwest", "Southwest"
  draftYear?: number;
  draftPick?: string; // e.g. "Round 1, Pick 3 (#3)"
  draftTeamAbbrev?: string; // e.g. "IND"
  nationality?: string; // e.g. "St. Louis, MO" or "Giresun, Turkey"
  college?: string; // e.g. "Duke"
  formerTeams?: string[]; // e.g. ["TOR", "SAS", "CHI"]
  ovr: number;
  nativeOvr: number;
  displayOvr: number;
  pot: number;
  headshotUrl?: string;
}

export type SlotPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C' | `B${number}` | `D${number}`;

export interface DraftSlot {
  id: number;
  slotPosition: SlotPosition;
  label: string; // "Starting Point Guard", "Bench 1", etc.
  player: Player | null;
}

export type PackTier = 'STAR' | 'STANDARD';

export type ClueType =
  | 'POSITION'
  | 'AGE'
  | 'HEIGHT'
  | 'WEIGHT'
  | 'CONFERENCE'
  | 'DIVISION'
  | 'TEAM'
  | 'DRAFT_YEAR'
  | 'NATIONALITY'
  | 'COLLEGE'
  | 'DRAFT_PICK'
  | 'DRAFT_TEAM'
  | 'FORMER_TEAM'
  | 'JERSEY_NUMBER';

export interface ClueItem {
  type: ClueType;
  label: string;
  value: string;
}

export interface MysteryCardClues {
  exposedClues: ClueItem[];
}

export interface CardOption {
  id: string;
  player: Player;
  clues: MysteryCardClues;
}

export type OrdinaryDraftType = 'FIXED' | 'SNAKE' | 'RANDOM';

export type DraftMode = 'ORDINARY' | 'BLIND_PACK' | 'BRIEFCASE' | 'WHEEL_OF_TEAMS' | 'BUDGET';

export type DraftStage =
  | 'TEAM_SELECTION'
  | 'MODE_SELECTION'
  | 'ORDER_REVIEW'
  | 'PACK_UNOPENED'
  | 'PACK_OPENING'
  | 'CARDS_DISPLAYED'
  | 'CARD_SELECTED_REVEALING'
  | 'MISSED_CARDS_SHOWN'
  | 'BRIEFCASES_DISPLAYED'
  | 'BRIEFCASE_OPENING'
  | 'PLAYER_REVEALED'
  | 'ALL_CASES_REVEALED'
  | 'BUDGET_MARKET'
  | 'ORDINARY_MARKET'
  | 'DRAFT_COMPLETE';

export function getEligiblePositions(pos: string): SlotPosition[] {
  const n = pos.toUpperCase().replace(/[\s\/-]/g, '');
  
  if (n === 'PG') return ['PG'];
  if (n === 'SG') return ['SG'];
  if (n === 'SF') return ['SF'];
  if (n === 'PF') return ['PF'];
  if (n === 'C') return ['C'];
  
  if (n === 'G') return ['PG', 'SG'];
  if (n === 'F') return ['SF', 'PF'];
  
  if (n === 'GF' || n === 'FG') return ['SG', 'SF'];
  if (n === 'FC' || n === 'CF') return ['PF', 'C'];
  
  if (n === 'PGSG' || n === 'SGPG') return ['PG', 'SG'];
  if (n === 'SGSF' || n === 'SFSG') return ['SG', 'SF'];
  if (n === 'SFPF' || n === 'PFSF') return ['SF', 'PF'];
  if (n === 'PFC' || n === 'CPF') return ['PF', 'C'];

  const slots: SlotPosition[] = [];
  if (n.includes('PG')) slots.push('PG');
  if (n.includes('SG')) slots.push('SG');
  if (n.includes('SF')) slots.push('SF');
  if (n.includes('PF')) slots.push('PF');
  if (n.includes('C')) slots.push('C');
  
  if (slots.length > 0) return slots;
  
  if (n.includes('G')) {
    if (!slots.includes('PG')) slots.push('PG');
    if (!slots.includes('SG')) slots.push('SG');
  }
  if (n.includes('F')) {
    if (!slots.includes('SF')) slots.push('SF');
    if (!slots.includes('PF')) slots.push('PF');
  }
  
  return slots;
}

export function getResolvedOvr(player: Player): number {
  return player.displayOvr ?? player.ovr;
}
