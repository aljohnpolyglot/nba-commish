import { NBAPlayer, NonNBATeam } from '../types';
import { calculateEuroleagueOverall } from './logic/EuroleagueSigningLogic';
import { calculatePBAOverall } from './logic/PBASigningLogic';
import { calculateBLeagueOverall } from './logic/BLeagueSigningLogic';

export const fetchEuroleagueRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    // ... existing Euroleague logic ...
    console.log("RosterService: Fetching Euroleague roster...");
    try {
        const response = await fetch('https://gist.githubusercontent.com/aljohnpolyglot/7ec945dd1258cfb914cd0f5f1e420100/raw/375f3a731a3eb2a0eda1b1ff9941f610d98df8ad/Euroleague_Roster_2025');
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

                // Rename Euroleague Devin Booker to his full name to avoid confusion with NBA player
                if (playerName === 'Devin Booker') {
                    console.log(`🏀 DEBUG: Renaming Euroleague Devin Booker (born ${item.born?.year}) → "Devin Rydale Booker"`);
                    playerName = 'Devin Rydale Booker';
                }

                // Check if it's a player object (has name/constructed name, ratings)
                if (playerName && item.ratings) { 
                     const player: NBAPlayer = {
                        // STEP 2: Use the 'euro-' prefix + tid to make his ID totally unique
                        internalId: `euro-${playerName.replace(/\s+/g, '')}-${item.tid + 100}`,
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
        const response = await fetch('https://gist.githubusercontent.com/aljohnpolyglot/71f4e519775d0cbeb806397a8696fc8f/raw/1d921d6e8346c73f66efe0425d74bedae4e25cb3/PBA_Roster_Complete_2025');
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
        
        const url = 'https://gist.githubusercontent.com/aljohnpolyglot/cbad21a4f937711896aed7c75d7a9616/raw/993c01df1529bbbf72b98632ab8d01c0fd022dd7/WNBA_Roster_2025';
        
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

export const fetchBLeagueRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    console.log("RosterService: Fetching B-League roster...");
    try {
        const response = await fetch('https://gist.githubusercontent.com/aljohnpolyglot/d15d468522ee6709ce2a10394a47c329/raw/72e7df921daffea43889135396b6ac5af6ad8393/bleaguejapanbbgm');
        if (!response.ok) {
            console.error('Failed to fetch B-League roster');
            return { players: [], teams: [] };
        }
        const data = await response.json();

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        if (data.teams && Array.isArray(data.teams)) {
            data.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 400,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'B-League'
                });
            });
        }

        const sourceList = Array.isArray(data) ? data : (data.players || []);

        const scaleTo85 = (val: number | undefined) => (val !== undefined ? Math.round(val * 0.85) : val);

        if (Array.isArray(sourceList)) {
            sourceList.forEach((item: any) => {
                let playerName = item.name;
                if (!playerName) {
                    if (item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
                    else if (item.lastName) playerName = item.lastName;
                    else if (item.firstName) playerName = item.firstName;
                }

                if (playerName && item.ratings) {
                    const scaledRatings = item.ratings.map((r: any) => ({
                        ...r,
                        stre: scaleTo85(r.stre),
                        spd: scaleTo85(r.spd),
                        jmp: scaleTo85(r.jmp),
                        endu: scaleTo85(r.endu),
                        ins: scaleTo85(r.ins),
                        dnk: scaleTo85(r.dnk),
                        ft: scaleTo85(r.ft),
                        fg: scaleTo85(r.fg),
                        tp: scaleTo85(r.tp),
                        oiq: scaleTo85(r.oiq),
                        diq: scaleTo85(r.diq),
                        drb: scaleTo85(r.drb),
                        pss: scaleTo85(r.pss),
                        reb: scaleTo85(r.reb),
                    }));

                    const player: NBAPlayer = {
                        internalId: `bleague-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                        tid: item.tid !== undefined ? item.tid + 400 : -1,
                        name: playerName,
                        overallRating: calculateBLeagueOverall(scaledRatings[0]),
                        ratings: scaledRatings,
                        stats: item.stats || [],
                        imgURL: item.imgURL && item.imgURL.trim() !== '' ? item.imgURL : undefined,
                        pos: item.pos || 'GF',
                        hgt: item.hgt ? Math.round(item.hgt / 2.54) : item.hgt,
                        weight: item.weight,
                        born: item.born,
                        contract: item.contract,
                        injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                        status: 'B-League',
                        hof: false,
                        jerseyNumber: item.stats && item.stats.length > 0 ? String(item.stats[item.stats.length - 1].jerseyNumber || '') : undefined
                    };
                    players.push(player);
                }
            });
        }
        console.log(`RosterService: Successfully processed ${players.length} B-League players and ${teams.length} teams.`);
        return { players, teams };
    } catch (error) {
        console.error('Error fetching B-League roster:', error);
        return { players: [], teams: [] };
    }
};
