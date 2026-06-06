export interface StaffMember {
  name: string;
  team?: string;
  position?: string;
  jobTitle?: string;
  role?: string;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  nationality?: string;
  bornYear?: number;
  careerStartYear?: number;
  yearsWithTeam?: number;
  isPlaceholder?: boolean;
  attributeSeed?: number;
  attributeProfile?: 'default' | 'nba';
  attributeOverrides?: Partial<import('../TeamTraining/types').StaffAttributes>;
  face?: any;
  staffImageId?: number;
  leagueId?: string;
  reputation?: number;
  id?: string;
  contractYears?: number;
  sourcePlayerId?: string;
  source?: string;
  staffJoinChance?: number;
  staffArchetype?: string;
  motivationType?: import('../services/staff/staffRetirement').StaffMotivationType;
  healthDurability?: number;
  stressTolerance?: number;
  diedYear?: number;
  diedDate?: string;
  deathCause?: string;
  deathType?: 'natural' | 'tragic';
  deathCheckDate?: string;
  retiredYear?: number;
  retiredDate?: string;
  retirementReason?: import('../services/staff/staffRetirement').StaffRetirementReason;
  retirementReasonLabel?: string;
}

export interface StaffData {
  owners: StaffMember[];
  gms: StaffMember[];
  coaches: StaffMember[];
  leagueOffice: StaffMember[];
  referees?: { id: string; name: string; slug?: string }[];
}
