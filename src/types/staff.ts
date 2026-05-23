export interface StaffMember {
  name: string;
  team?: string;
  position?: string;
  jobTitle?: string;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  nationality?: string;
  bornYear?: number;
  careerStartYear?: number;
  yearsWithTeam?: number;
  isPlaceholder?: boolean;
  face?: any;
  staffImageId?: number;
  leagueId?: string;
  reputation?: number;
  id?: string;
  contractYears?: number;
}

export interface StaffData {
  owners: StaffMember[];
  gms: StaffMember[];
  coaches: StaffMember[];
  leagueOffice: StaffMember[];
  referees?: { id: string; name: string; slug?: string }[];
}
