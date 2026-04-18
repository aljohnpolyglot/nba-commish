export interface Player {
  name?: string;
  firstName?: string;
  lastName?: string;
  tid: number;
  pos: string;
  hgt: number;
  weight: number;
  imgURL?: string;
  born: {
    year: number;
    loc: string;
  };
  draft: {
    year: number;
    pick: number;
  };
  hof?: boolean;
  retiredYear?: number;
  awards?: {
    season: number;
    type: string;
  }[];
}

export interface HOFInductee {
  year: string;
  name: string;
  position: string;
}

export interface ProcessedHOFPlayer extends Player {
  name: string; // Ensure name is always present in processed data
  inductionYear: number;
}

export async function fetchHOFData(): Promise<ProcessedHOFPlayer[]> {
  try {
    const rosterUrl = 'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json';
    const hofUrl = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbahalloffame';
    const missingUrl = 'https://api.npoint.io/d94bdfeeecf4246b481d';
    const heavyUrl = 'https://raw.githubusercontent.com/zengm-games/zengm/refs/heads/master/data/real-player-data.basketball.json';

    const [rosterRes, hofRes, missingRes, heavyRes] = await Promise.all([
      fetch(rosterUrl),
      fetch(hofUrl),
      fetch(missingUrl),
      fetch(heavyUrl)
    ]);

    if (!rosterRes.ok || !hofRes.ok || !missingRes.ok || !heavyRes.ok) {
      throw new Error('Failed to fetch data from one or more sources');
    }

    const rosterData = await rosterRes.json();
    const hofListData = await hofRes.json();
    const missingData = await missingRes.json();
    const heavyData = await heavyRes.json();

    console.log('Data sources fetched successfully.');

    const players: Player[] = rosterData?.players || [];
    const missingPlayers: Player[] = Array.isArray(missingData) ? missingData : (missingData?.players || []);
    const heavyPlayers: Player[] = heavyData?.players || [];
    
    // Combine players and remove duplicates based on name
    const combinedPlayersMap = new Map<string, Player>();
    
    const processPlayer = (p: Player, source: string) => {
      // Construct name if missing but first/last are present
      let fullName = p.name?.trim();
      if (!fullName && p.firstName && p.lastName) {
        fullName = `${p.firstName.trim()} ${p.lastName.trim()}`;
      }
      
      if (!fullName) return;

      if (combinedPlayersMap.has(fullName)) {
        const existing = combinedPlayersMap.get(fullName)!;
        // Merge awards
        if (p.awards) {
          existing.awards = [...(existing.awards || []), ...p.awards];
          // Remove duplicate awards for the same season and type
          const uniqueAwards = new Map<string, { season: number; type: string }>();
          existing.awards.forEach(a => uniqueAwards.set(`${a.season}-${a.type}`, a));
          existing.awards = Array.from(uniqueAwards.values());
        }
        // Update HOF status if found
        if (!existing.hof && p.hof) existing.hof = p.hof;
        // Update image if existing is missing
        if (!existing.imgURL && p.imgURL) existing.imgURL = p.imgURL;
      } else {
        combinedPlayersMap.set(fullName, { ...p, name: fullName });
      }
    };

    players.forEach(p => processPlayer(p, 'roster'));
    missingPlayers.forEach(p => processPlayer(p, 'npoint'));
    heavyPlayers.forEach(p => processPlayer(p, 'heavy'));

    const allPlayers = Array.from(combinedPlayersMap.values());
    console.log(`Total combined players: ${allPlayers.length}`);

    const hofItems: HOFInductee[] = Array.isArray(hofListData) ? hofListData : (hofListData?.data || []);

    // Helper to normalize names for better matching
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    // Create a map from the HOF gist
    const hofGistMap = new Map<string, number>();
    const matchedHofNames = new Set<string>();

    hofItems.forEach(item => {
      if (item && item.name && item.year) {
        hofGistMap.set(normalize(item.name), parseInt(item.year));
      }
    });

    const processedPlayers: ProcessedHOFPlayer[] = allPlayers
      .map(p => {
        if (!p || !p.name) return null;

        const normalizedName = normalize(p.name);

        // 1. Try to find induction year in player's awards first
        const hofAward = p.awards?.find(a => 
          a.type.toLowerCase().includes('inducted into the hall of fame') ||
          a.type.toLowerCase() === 'hall of fame'
        );
        
        let inductionYear = hofAward ? hofAward.season : 0;

        // 2. If not in awards, check the HOF gist map
        if (inductionYear === 0) {
          inductionYear = hofGistMap.get(normalizedName) || 0;
        }

        // Track matches for logging missing ones later
        if (inductionYear > 0 || p.hof) {
          matchedHofNames.add(normalizedName);
        }

        // Only include if we found an induction year or they are explicitly marked as HOF
        if (inductionYear > 0 || p.hof) {
          return {
            ...p,
            name: p.name, // Guaranteed by processPlayer
            inductionYear: inductionYear || (p.retiredYear ? p.retiredYear + 5 : 0)
          };
        }

        return null;
      })
      .filter((p): p is ProcessedHOFPlayer => p !== null)
      .sort((a, b) => b.inductionYear - a.inductionYear);

    // Log players from the HOF list that were NOT found in the player data
    const missingInPlayerData = hofItems.filter(item => !matchedHofNames.has(normalize(item.name)));
    if (missingInPlayerData.length > 0) {
      console.group('HOF Inductees missing in Player Data:');
      console.table(missingInPlayerData.map(m => ({ Name: m.name, Year: m.year })));
      console.groupEnd();
    }

    return processedPlayers;
  } catch (error) {
    console.error('Error fetching HOF data:', error);
    return [];
  }
}
