import type { StaffData, NBAPlayer as Player, NBATeam as Team } from '../types';

// The URL for your hosted staff data
const STAFF_DATA_URL = 'https://api.npoint.io/5a5cf15aa97cfe207457';

const COACH_IMAGES: Record<string, string> = {
    "Joe Mazzulla": "https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-JoeMazzulla_2025.jpg",
    "Jordi Fernandez": "https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-JordiFernandez_2025.jpg",
    "Mike Brown": "https://nbacoaches.com/wp-content/uploads/2025/07/NBCA-headcoach-MikeBrown_2025.jpg",
    "Nick Nurse": "https://nbacoaches.com/wp-content/uploads/2023/05/Untitled-design-52.png",
    "Darko Rajaković": "https://nbacoaches.com/wp-content/uploads/2023/06/Untitled-design-67.png",
    "Billy Donovan": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-BillyDonovan-2.jpg",
    "Kenny Atkinson": "https://nbacoaches.com/wp-content/uploads/2025/12/AtkinsonHeadshot-300x300.png",
    "J.B. Bickerstaff": "https://nbacoaches.com/wp-content/uploads/2024/07/Bickerstaff.png",
    "Rick Carlisle": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-RickCarlisle.jpg",
    "Doc Rivers": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-DocRivers.jpg",
    "Quin Snyder": "https://nbacoaches.com/wp-content/uploads/2023/02/NBCA-HeadCoach-QuinSnyder.jpg",
    "Charles Lee": "https://nbacoaches.com/wp-content/uploads/2024/05/CHARLES-LEE-2.png",
    "Erik Spoelstra": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-ErikSpoelstra.jpg",
    "Jamahl Mosley": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-JamahlMosley.jpg",
    "Brian Keefe": "https://nbacoaches.com/wp-content/uploads/2024/01/Untitled-design-86.png",
    "David Adelman": "https://nbacoaches.com/wp-content/uploads/2025/05/NBCA-HeadCoach-DavidAdelman.jpg",
    "Chris Finch": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-ChrisFinch.jpg",
    "Mark Daigneault": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-MarkDaigneault.jpg",
    "Chauncey Billups": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-ChaunceyBilllups.jpg",
    "Will Hardy": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-WillHardy.jpg",
    "Steve Kerr": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-SteveKerr.jpg",
    "Tyronn Lue": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-TyronnLue.jpg",
    "JJ Redick": "https://nbacoaches.com/wp-content/uploads/2024/06/JJ-Redick-1.png",
    "Jordan Ott": "https://nbacoaches.com/wp-content/uploads/2025/12/OttHeadshot.png",
    "Doug Christie": "https://nbacoaches.com/wp-content/uploads/2025/05/NBCA-HeadCoach-dougchristie.jpg",
    "Jason Kidd": "https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-JasonKidd.jpg",
    "Ime Udoka": "https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-ImeUdoka_2025.jpg",
    "Tuomas Iisalo": "https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-Iisalo_2025.jpg",
    "Mitch Johnson": "https://nbacoaches.com/wp-content/uploads/2025/05/NBCA-HeadCoach-mitchjohnson.jpg",
    "James Borrego": "https://static.wikia.nocookie.net/nba2k/images/8/87/James_Borrego.png/revision/latest?cb=20240504154838"
};

const OWNER_IMAGES: Record<string, string> = {
    "Tony Ressler": "https://imageio.forbes.com/specials-images/imageserve/59d5204431358e542c035670/0x0.jpg?format=jpg&crop=1053,1053,x164,y65,safe&height=416&width=416&fit=bounds",
    "Marc Lore": "https://imageio.forbes.com/specials-images/imageserve/61685375d087090f4887090f/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds",
    "Steve Ballmer": "https://imageio.forbes.com/specials-images/imageserve/62d6f03769e31b54d502512c/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds",
    "Jerry Reinsdorf": "https://imageio.forbes.com/specials-images/imageserve/59d51f7231358e542c03550e/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds",
    "Jeanie Buss": "https://imageio.forbes.com/specials-images/imageserve/59d51f9e31358e542c03555f/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds",
    "Joe Lacob": "https://imageio.forbes.com/specials-images/imageserve/59d51f8a31358e542c03553d/0x0.jpg?format=jpg&crop=1000,1000,x0,y0,safe&height=416&width=416&fit=bounds"
};

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
  if (COACH_IMAGES[staffMember.name]) {
      enriched.playerPortraitUrl = COACH_IMAGES[staffMember.name];
      return enriched;
  }
  if (OWNER_IMAGES[staffMember.name]) {
      enriched.playerPortraitUrl = OWNER_IMAGES[staffMember.name];
      return enriched;
  }

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
