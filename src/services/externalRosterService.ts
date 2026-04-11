import { NBAPlayer, NonNBATeam } from '../types';
import {
  LEAGUE_MULTIPLIERS,
  calculateLeagueOverall,
} from './logic/leagueOvr';

// Attributes that are physical/skill-ceiling and must never be scaled.
// hgt = physical measurement.
// ft = free-throw skill — shooting form doesn't change by league strength;
//      real international leagues often brick FTs at realistic rates regardless of level.
// ovr/pot/fuzz/injuryIndex/skills/jerseyNumber = metadata.
const ATTR_SKIP = new Set(['hgt', 'ft', 'season', 'ovr', 'pot', 'fuzz', 'injuryIndex', 'skills', 'jerseyNumber']);

/**
 * Pre-scale all non-physical numeric attributes in a ratings array by the
 * league multiplier. Stored once at fetch so every downstream consumer
 * (sim, AI eval, trade logic, display) gets the correct values automatically.
 * `hgt` is skipped by default; pass `hgtMult` to also scale height (e.g. PBA).
 */
function scaleRatings(ratings: any[], mult: number, hgtMult?: number): any[] {
  if (!ratings.length) return ratings;
  return ratings.map(r => {
    const out: any = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'number') {
        out[k] = v;
      } else if (k === 'hgt') {
        out[k] = hgtMult ? Math.round((v as number) * hgtMult) : v;
      } else if (ATTR_SKIP.has(k)) {
        out[k] = v;
      } else {
        out[k] = mult < 1.0 ? Math.round((v as number) * mult) : v;
      }
    }
    return out;
  });
}

/**
 * Compute overallRating from source data for a given league.
 *
 * Two strategies, chosen per-league:
 *
 *  A) srcOvr × mult  — uses BBGM's position-aware `ovr` field directly.
 *     Best when the source export has meaningful per-player diversity in its
 *     `ovr` values (G-League, Endesa, Euroleague, B-League sources all do).
 *     Falls back to calcRawOvr if srcOvr is missing.
 *
 *  B) calcRawOvr × mult — recomputes OVR from individual attributes.
 *     Used for PBA whose BBGM export has a flat/uniform `ovr` field (~122 for
 *     every player); calcRawOvr at least captures whatever attr diversity exists.
 *     TODO: swap PBA to srcOvr once the 2026 hand-crafted roster lands.
 *
 * Always pass the original item.ratings[0] (BEFORE scaleRatings is called) so
 * the absolute height bonus in calcRawOvr fires correctly on full-size values.
 */
function computeLeagueOvr(rawRatings: any, league: string): number {
  const mult = LEAGUE_MULTIPLIERS[league] ?? 1.0;

  // PBA source has flat ovr (~122 for all players) — skip srcOvr, use attr formula
  if (league === 'PBA') {
    return calculateLeagueOverall(rawRatings, league);
  }

  // All other leagues: prefer BBGM's own per-player ovr for better diversity
  const srcOvr = rawRatings?.ovr;
  if (srcOvr && srcOvr > 0 && srcOvr <= 100) {
    return Math.round(Math.max(10, srcOvr * mult));
  }

  // Fallback: attr-based formula (e.g. missing ovr field)
  return calculateLeagueOverall(rawRatings, league);
}

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
                    tid: t.tid + 1000, // Offset Euroleague by 1000 (avoids collision with PBA/WNBA/B-League)
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
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
                        const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['Euroleague']);
                     const player: NBAPlayer = {
                        // STEP 2: Use the 'euro-' prefix + tid to make his ID totally unique
                        internalId: `euro-${playerName.replace(/\s+/g, '')}-${item.tid + 1000}`,
                        tid: item.tid !== undefined ? item.tid + 1000 : -1, // Offset Euroleague by 1000
                        name: playerName,
                        overallRating: computeLeagueOvr(item.ratings?.[0], 'Euroleague'),
                        ratings: scaledRatings,
                        stats: item.stats || [],
                        imgURL: item.imgURL && item.imgURL.trim() !== '' ? item.imgURL : undefined, // Handle empty string
                        pos: item.pos || 'GF',
                        hgt: item.hgt,
                        weight: item.weight,
                        born: item.born,
                        draft: item.draft,
                        college: item.college,
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
                    tid: t.tid + 2000, // Offset PBA by 2000 (avoids collision with Euroleague's 1000-1297 range)
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
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
                        // TODO: updated 2026 PBA roster pending — swap URL when ready.
                        // hgtMult 0.85: PBA source heights are inflated vs NBA scale,
                        // nerf them so players don't get undeserved hgt boosts in 2K OVR.
                        // OVR: PBA BBGM export has flat `ovr` ~122 for all players (out of the
                        // normal 0-100 range), so srcOvr path is skipped in computeLeagueOvr.
                        // calcRawOvr also produces uniform results (~66 2K) because the source
                        // attrs are auto-generated without meaningful per-player variance.
                        // Diversity will improve once the hand-crafted 2026 PBA roster lands.
                        const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['PBA'], 0.85);
                     const player: NBAPlayer = {
                        internalId: `pba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                        tid: item.tid !== undefined ? item.tid + 2000 : -1, // Offset PBA by 2000
                        name: playerName,
                        overallRating: computeLeagueOvr(item.ratings?.[0], 'PBA'),
                        ratings: scaledRatings,
                        stats: item.stats || [],
                        imgURL: item.imgURL && item.imgURL.trim() !== '' ? item.imgURL : undefined, // Handle empty string
                        pos: item.pos || 'GF',
                        hgt: item.hgt,
                        weight: item.weight,
                        born: item.born,
                        draft: item.draft,
                        college: item.college,
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
                    tid: t.tid + 3000, // Offset WNBA by 3000
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
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
                    tid: item.tid !== undefined ? item.tid + 3000 : -100, // Offset WNBA by 3000
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
                    tid: t.tid + 4000,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'B-League'
                });
            });
        }

        const sourceList = Array.isArray(data) ? data : (data.players || []);

        if (Array.isArray(sourceList)) {
            sourceList.forEach((item: any) => {
                let playerName = item.name;
                if (!playerName) {
                    if (item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
                    else if (item.lastName) playerName = item.lastName;
                    else if (item.firstName) playerName = item.firstName;
                }

                if (playerName && item.ratings) {
                    const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['B-League']);
                    const player: NBAPlayer = {
                        internalId: `bleague-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                        tid: item.tid !== undefined ? item.tid + 4000 : -1, // Offset B-League by 4000
                        name: playerName,
                        overallRating: computeLeagueOvr(item.ratings?.[0], 'B-League'),
                        ratings: scaledRatings,
                        stats: item.stats || [],
                        imgURL: item.imgURL && item.imgURL.trim() !== '' ? item.imgURL : undefined,
                        pos: item.pos || 'GF',
                        hgt: item.hgt ? Math.round(item.hgt / 2.54) : item.hgt,
                        weight: item.weight,
                        born: item.born,
                        draft: item.draft,
                        college: item.college,
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

export const fetchGLeagueRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    console.log('RosterService: Fetching G-League roster...');
    try {
        const [ratingsRes, bioRes, teamsRes] = await Promise.all([
            fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/gleagueratings'),
            fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/gleaguebio'),
            fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/gleagueteams'),
        ]);
        if (!ratingsRes.ok) { console.error('Failed to fetch G-League ratings'); return { players: [], teams: [] }; }

        const ratingsData = await ratingsRes.json();
        const bioArr: any[] = bioRes.ok ? await bioRes.json() : [];
        const teamsJson: any = teamsRes.ok ? await teamsRes.json() : {};

        // Build sister-city map: G-League full team name → NBA affiliate
        const affiliateMap = new Map<string, string>();
        const allTeamsJson: any[] = [
            ...(teamsJson.nba_g_league_teams?.eastern_conference ?? []),
            ...(teamsJson.nba_g_league_teams?.western_conference ?? []),
        ];
        allTeamsJson.forEach((t: any) => {
            if (t.team && t.nba_affiliate) affiliateMap.set(t.team.toLowerCase(), t.nba_affiliate);
        });

        // Build bio lookup by name
        const bioMap = new Map<string, any>();
        bioArr.forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        // Teams
        if (ratingsData.teams && Array.isArray(ratingsData.teams)) {
            ratingsData.teams.forEach((t: any) => {
                const fullName = `${t.region} ${t.name}`;
                const nbaAffiliate = affiliateMap.get(fullName.toLowerCase());
                teams.push({
                    tid: t.tid + 6000,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'G-League',
                    nbaAffiliate,
                });
            });
        }

        // Players
        const sourceList: any[] = Array.isArray(ratingsData) ? ratingsData : (ratingsData.players || []);
        sourceList.forEach((item: any) => {
            let playerName = item.name;
            if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
            if (!playerName) return;
            if (!item.ratings) return;

            const bio = bioMap.get(playerName.toLowerCase());
            const isTwoWay = !!(bio?.nba_status && bio.nba_status.toLowerCase().includes('two-way'));

            const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['G-League']);
            const player: NBAPlayer = {
                internalId: `gleague-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                tid: item.tid !== undefined ? item.tid + 6000 : -1,
                name: playerName,
                overallRating: computeLeagueOvr(item.ratings?.[0], 'G-League'),
                ratings: scaledRatings,
                stats: item.stats || [],
                imgURL: bio?.image && bio.image.trim() !== '' ? bio.image : (item.imgURL || undefined),
                pos: item.pos || 'GF',
                hgt: item.hgt,
                weight: item.weight,
                born: item.born,
                draft: item.draft,
                contract: item.contract,
                injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                status: 'G-League',
                twoWayCandidate: isTwoWay || undefined,
                hof: false,
                jerseyNumber: item.stats?.length > 0 ? String(item.stats[item.stats.length - 1].jerseyNumber || '') : undefined,
            };
            players.push(player);
        });

        // Bottom-3 OVR per team (age < 32) → twoWayCandidate
        const currentYear = new Date().getFullYear();
        const byTeam = new Map<number, NBAPlayer[]>();
        players.forEach(p => {
            if (!byTeam.has(p.tid)) byTeam.set(p.tid, []);
            byTeam.get(p.tid)!.push(p);
        });
        byTeam.forEach(roster => {
            const eligible = roster
                .filter(p => {
                    const age = p.born?.year ? currentYear - p.born.year : 99;
                    return age < 32;
                })
                .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));
            eligible.slice(0, 3).forEach(p => { p.twoWayCandidate = true; });
        });

        console.log(`RosterService: Successfully processed ${players.length} G-League players and ${teams.length} teams.`);
        return { players, teams };
    } catch (error) {
        console.error('Error fetching G-League roster:', error);
        return { players: [], teams: [] };
    }
};

export const fetchEndesaRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    console.log('RosterService: Fetching Endesa (Liga ACB) roster...');
    try {
        const [ratingsRes, bioRes] = await Promise.all([
            fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/ligaendesabbgmjson'),
            fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/ligaendesabio'),
        ]);
        if (!ratingsRes.ok) { console.error('Failed to fetch Endesa ratings'); return { players: [], teams: [] }; }

        const ratingsData = await ratingsRes.json();
        const bioArr: any[] = bioRes.ok ? await bioRes.json() : [];

        const bioMap = new Map<string, any>();
        bioArr.forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];
        const currentYear = new Date().getFullYear();

        if (ratingsData.teams && Array.isArray(ratingsData.teams)) {
            ratingsData.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 5000,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'Endesa',
                });
            });
        }

        const sourceList: any[] = Array.isArray(ratingsData) ? ratingsData : (ratingsData.players || []);
        sourceList.forEach((item: any) => {
            let playerName = item.name;
            if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
            if (!playerName) return;
            if (!item.ratings) return;

            // Hide very young prospects (age < 19)
            const age = item.born?.year ? currentYear - item.born.year : 99;
            if (age < 19) return;

            const bio = bioMap.get(playerName.toLowerCase());

            const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['Endesa']);
            const player: NBAPlayer = {
                internalId: `endesa-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                tid: item.tid !== undefined ? item.tid + 5000 : -1,
                name: playerName,
                overallRating: computeLeagueOvr(item.ratings?.[0], 'Endesa'),
                ratings: scaledRatings,
                stats: item.stats || [],
                imgURL: bio?.image && bio.image.trim() !== '' ? bio.image : (item.imgURL || undefined),
                pos: item.pos || 'GF',
                hgt: item.hgt,
                weight: item.weight,
                born: item.born,
                draft: item.draft,
                contract: item.contract,
                injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                status: 'Endesa',
                hof: false,
                jerseyNumber: item.stats?.length > 0 ? String(item.stats[item.stats.length - 1].jerseyNumber || '') : undefined,
            };
            players.push(player);
        });

        console.log(`RosterService: Successfully processed ${players.length} Endesa players and ${teams.length} teams.`);
        return { players, teams };
    } catch (error) {
        console.error('Error fetching Endesa roster:', error);
        return { players: [], teams: [] };
    }
};
