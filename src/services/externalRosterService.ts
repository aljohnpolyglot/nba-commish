import { NBAPlayer, NonNBATeam } from '../types';
import { calculateEuroleagueOverall } from './logic/EuroleagueSigningLogic';
import { calculatePBAOverall } from './logic/PBASigningLogic';

export const fetchEuroleagueRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    // ... existing Euroleague logic ...
    console.log("RosterService: Fetching Euroleague roster...");
    try {
        const response = await fetch('https://api.npoint.io/3b2b7b634b26a02d1e72');
        if (!response.ok) {
            console.error('Failed to fetch Euroleague roster');
            return { players: [], teams: [] };
        }
        const data = await response.json();
        
        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];
        
        // Parse Teams if available
        if (data.teams && Array.isArray(data.teams)) {
            data.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 100, // Offset Euroleague by 100
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'Euroleague'
                });
            });
        }

        // The data might be an object with a 'players' array (standard BBGM export)
        // or just an array (if it was a raw list).
        // Based on user input, it's an object with "players": [...]
        
        const sourceList = Array.isArray(data) ? data : (data.players || []);

        if (Array.isArray(sourceList)) {
            sourceList.forEach((item: any) => {
                // Construct name if missing
                let playerName = item.name;
                if (!playerName && item.firstName && item.lastName) {
                    playerName = `${item.firstName} ${item.lastName}`;
                }

                // Check if it's a player object (has name/constructed name, ratings)
                if (playerName && item.ratings) { 
                     const player: NBAPlayer = {
                        internalId: `euro-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                        tid: item.tid !== undefined ? item.tid + 100 : -1, // Offset Euroleague by 100
                        name: playerName,
                        overallRating: calculateEuroleagueOverall(item.ratings?.[0]), // Use new helper
                        ratings: item.ratings || [],
                        stats: item.stats || [],
                        imgURL: item.imgURL && item.imgURL.trim() !== '' ? item.imgURL : undefined, // Handle empty string
                        pos: item.pos || 'GF',
                        hgt: item.hgt,
                        weight: item.weight,
                        born: item.born,
                        contract: item.contract,
                        injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                        status: 'Euroleague',
                        hof: false,
                        jerseyNumber: item.stats && item.stats.length > 0 ? String(item.stats[item.stats.length - 1].jerseyNumber || '') : undefined
                    };
                    players.push(player);
                }
            });
        }
        console.log(`RosterService: Successfully processed ${players.length} Euroleague players and ${teams.length} teams.`);
        return { players, teams };
    } catch (error) {
        console.error('Error fetching Euroleague roster:', error);
        return { players: [], teams: [] };
    }
};

export const fetchPBARoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    console.log("RosterService: Fetching PBA roster...");
    try {
        const response = await fetch('https://bbgm-pba-2026-preseason.tiiny.site/BBGM_PBA_2026_preseason.json');
        if (!response.ok) {
            console.error('Failed to fetch PBA roster');
            return { players: [], teams: [] };
        }
        const data = await response.json();
        
        // console.log("RosterService: PBA Data Keys:", Object.keys(data));

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        // Parse Teams if available
        if (data.teams && Array.isArray(data.teams)) {
            data.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 200, // Offset PBA by 200
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'PBA'
                });
            });
        }
        
        // The data is an object with a 'players' property: { "version": 69, "meta": ..., "players": [...] }
        const sourceList = Array.isArray(data) ? data : (data.players || []);
        
        console.log(`RosterService: PBA Source list has ${sourceList.length} entries.`);

        let skippedBlank = 0;
        let skippedNoName = 0;

        if (Array.isArray(sourceList)) {
            sourceList.forEach((item: any) => {
                // Filter out blank faces and empty imgURL
                const imgURL = item.imgURL;
                if (!imgURL || typeof imgURL !== 'string' || imgURL.trim() === "" || imgURL === "/img/blank-face.png" || imgURL.includes("blank-face")) {
                    skippedBlank++;
                    return;
                }

                // Construct name if missing
                let playerName = item.name;
                if (!playerName) {
                    if (item.firstName && item.lastName) {
                        playerName = `${item.firstName} ${item.lastName}`;
                    } else if (item.lastName) {
                        playerName = item.lastName;
                    } else if (item.firstName) {
                        playerName = item.firstName;
                    }
                }

                // Check if it's a player object (has name/constructed name, ratings)
                if (playerName && item.ratings) { 
                     const player: NBAPlayer = {
                        internalId: `pba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                        tid: item.tid !== undefined ? item.tid + 200 : -1, // Offset PBA by 200
                        name: playerName,
                        overallRating: calculatePBAOverall(item.ratings?.[0]), // Use PBA helper
                        ratings: item.ratings || [],
                        stats: item.stats || [],
                        imgURL: item.imgURL && item.imgURL.trim() !== '' ? item.imgURL : undefined, // Handle empty string
                        pos: item.pos || 'GF',
                        hgt: item.hgt,
                        weight: item.weight,
                        born: item.born,
                        contract: item.contract,
                        injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                        status: 'PBA',
                        hof: false,
                        jerseyNumber: item.stats && item.stats.length > 0 ? String(item.stats[item.stats.length - 1].jerseyNumber || '') : undefined
                    };
                    players.push(player);
                } else {
                    skippedNoName++;
                }
            });
        }
        console.log(`RosterService: Successfully processed ${players.length} PBA players and ${teams.length} teams. (Skipped ${skippedBlank} blank faces, ${skippedNoName} invalid/no-name)`);
        return { players, teams };
    } catch (error) {
        console.error('Error fetching PBA roster:', error);
        return { players: [], teams: [] };
    }
};

export const fetchWNBARoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    // ... existing WNBA logic ...
    console.log("RosterService: Fetching WNBA roster...");
    try {
        // Since we can't easily hit dropbox from client without CORS issues potentially, 
        // we'll try. If it fails, we might need a proxy or the user to provide a different URL.
        // However, the user provided it, so let's try.
        // Actually, dropbox 'dl=0' usually shows a page. 'dl=1' downloads. 
        // The user provided link has `dl=0`. I should probably change it to `dl=1` or `raw=1` for direct JSON.
        // User link: https://dl.dropboxusercontent.com/scl/fi/0wrm1ivgz90bzt9j0mypq/2024-WNBA-Roster.json?rlkey=2slrtptypwssawgzktrxhbaoz&st=swzo3zs8&dl=0
        
        const url = 'https://dl.dropboxusercontent.com/scl/fi/0wrm1ivgz90bzt9j0mypq/2024-WNBA-Roster.json?rlkey=2slrtptypwssawgzktrxhbaoz&st=swzo3zs8&dl=1';
        
        const response = await fetch(url);
        if (!response.ok) {
             console.error('Failed to fetch WNBA roster');
             return { players: [], teams: [] };
        }
        const data = await response.json();
        
        // Structure: { version: 60, meta: { name: "WNBA" }, players: [...] }
        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        // Parse Teams if available
        if (data.teams && Array.isArray(data.teams)) {
            data.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 300, // Offset WNBA by 300
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'WNBA'
                });
            });
        }
        
        if (data.players && Array.isArray(data.players)) {
            data.players.forEach((item: any, index: number) => {
                const player: NBAPlayer = {
                    internalId: `wnba-${index}-${item.firstName}-${item.lastName}`,
                    tid: item.tid !== undefined ? item.tid + 300 : -100, // Offset WNBA by 300
                    name: `${item.firstName} ${item.lastName}`,
                    overallRating: item.ratings?.[0]?.ovr || 70, 
                    ratings: item.ratings || [],
                    stats: [],
                    imgURL: item.imgURL,
                    pos: item.pos || 'GF',
                    hgt: item.hgt,
                    weight: item.weight,
                    born: item.born,
                    contract: item.contract,
                    injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                    status: 'WNBA',
                    hof: false,
                    jerseyNumber: item.stats && item.stats.length > 0 ? String(item.stats[item.stats.length - 1].jerseyNumber || '') : undefined
                };
                players.push(player);
            });
        }
        console.log(`RosterService: Successfully processed ${players.length} WNBA players and ${teams.length} teams.`);
        return { players, teams };

    } catch (error) {
        console.error('Error fetching WNBA roster:', error);
        return { players: [], teams: [] };
    }
};
