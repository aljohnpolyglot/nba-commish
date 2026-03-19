import type { StaffData, NBAPlayer as Player, NBATeam as Team } from '../types';
import { getCoachPhoto, getOwnerPhoto, fetchCoachData, fetchOwnerPhotos } from '../data/photos';

// The URL for your hosted staff data
const STAFF_DATA_URL = 'https://api.npoint.io/5a5cf15aa97cfe207457';

// The data as it comes from the API
interface RawStaffMember {
  name: string;
  team?: string;
  jobTitle?: string;
}

// The data after we've added our own properties
interface EnrichedStaffMember extends RawStaffMember {
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
}

// This function enriches a staff member with a player portrait or a team logo.
const enrichStaffMember = (
  staffMember: RawStaffMember,
  allPlayers: Player[],
  teamNameMap: Map<string, Team>
): EnrichedStaffMember => {
  // FIX: Create an object of the correct type.
  const enriched: EnrichedStaffMember = { ...staffMember };
  
  // 0. Check for explicit coach or owner image override
  const coachPhoto = getCoachPhoto(staffMember.name);
  if (coachPhoto) { enriched.playerPortraitUrl = coachPhoto; return enriched; }

  const ownerPhoto = getOwnerPhoto(staffMember.name);
  if (ownerPhoto) { enriched.playerPortraitUrl = ownerPhoto; return enriched; }

  // 1. RealGM Image Pattern (First line of defense)
  // Pattern: https://basketball.realgm.com/images/nba/4.2/profiles/photos/2006/LastName_FirstName.jpg
  const nameParts = staffMember.name.split(' ');
  if (nameParts.length >= 2) {
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      // Remove any periods from the name parts (e.g., "J.B." -> "JB" or keep them? User examples don't show dots)
      // User examples: Gores_Tom, Dolan_James. 
      // We will use the raw parts for now as per the user's pattern discovery.
      enriched.playerPortraitUrl = `https://basketball.realgm.com/images/nba/4.2/profiles/photos/2006/${lastName}_${firstName}.jpg`;
  }

  // 2. Prioritize finding a player portrait (Fallback if no image set yet)
  if (!enriched.playerPortraitUrl) {
    const playerRecord = allPlayers.find(p => p.name.toLowerCase() === staffMember.name.toLowerCase());
    if (playerRecord) {
      enriched.playerPortraitUrl = playerRecord.imgURL;
    }
  }

  // 2. If no player portrait, and they have a team, find the team logo as a fallback
  if (!enriched.playerPortraitUrl && staffMember.team) {
    const teamRecord = teamNameMap.get(staffMember.team.toLowerCase());
    if (teamRecord) {
      enriched.teamLogoUrl = teamRecord.logoUrl;
    }
  }

  return enriched;
};


// The main exported function to get and process all staff data.
export const getStaffData = async (
  allPlayers: Player[],
  teamNameMap: Map<string, Team>
): Promise<StaffData> => {
    try {
        await Promise.all([fetchCoachData(), fetchOwnerPhotos()]);
        const response = await fetch(STAFF_DATA_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // FIX: Add the explicit type `RawStaffMember` to each parameter in the map.
        const enrichedOwners = (data.owners || []).map((owner: RawStaffMember) => 
          enrichStaffMember(owner, allPlayers, teamNameMap)
        );
        
        const enrichedGms = (data.gms || []).map((gm: RawStaffMember) => {
          const enriched = enrichStaffMember(gm, allPlayers, teamNameMap);
          // Manual correction for Dallas GM
          if (enriched.team?.toLowerCase() === 'mavericks' || enriched.team?.toLowerCase() === 'dallas mavericks') {
            enriched.name = 'Michael Finley';
            enriched.jobTitle = 'General Manager';
          }
          return enriched;
        });

        const enrichedCoaches = (data.coaches || []).map((coach: RawStaffMember) => 
          enrichStaffMember(coach, allPlayers, teamNameMap)
        );
        
        const enrichedLeagueOffice = (data.leagueOffice || []).map((lo: RawStaffMember) => 
          enrichStaffMember(lo, allPlayers, teamNameMap)
        );

        return {
            owners: enrichedOwners,
            gms: enrichedGms,
            coaches: enrichedCoaches,
            leagueOffice: enrichedLeagueOffice,
        };

    } catch (error) {
        console.error('Failed to fetch and process staff data:', error);
        // Return an empty structure on failure
        return {
            owners: [],
            gms: [],
            coaches: [],
            leagueOffice: [],
        };
    }
};
