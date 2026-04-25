import { NBAPlayer, NonNBATeam } from '../types';
import {
  LEAGUE_MULTIPLIERS,
  calculateLeagueOverall,
} from './logic/leagueOvr';
import { estimatePotentialBbgm } from '../utils/playerRatings';

/** Returns true if the URL is ProBallers' "no photo" placeholder. Treat as missing. */
function isDefaultProballers(url: string | undefined): boolean {
  return !!url && url.includes('head-par-defaut');
}

/** Returns the imgURL from ProBallers ratings gist, treating the default placeholder as absent. */
function resolveImgURL(itemUrl: string | undefined, bioImage?: string): string | undefined {
  const ratingsPng = itemUrl && itemUrl.trim() !== '' && !isDefaultProballers(itemUrl) ? itemUrl : undefined;
  const bioImg = bioImage && bioImage.trim() !== '' && !isDefaultProballers(bioImage) ? bioImage : undefined;
  return ratingsPng ?? bioImg;
}

function extractJerseyNumber(player: { jerseyNumber?: string | number; stats?: Array<{ jerseyNumber?: string | number }> }): string | undefined {
  const latestStats = player.stats && player.stats.length > 0 ? player.stats[player.stats.length - 1] : undefined;
  const raw = latestStats?.jerseyNumber ?? player.jerseyNumber;
  return raw === undefined || raw === null || raw === '' ? undefined : String(raw);
}

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
    console.log('RosterService: Fetching Euroleague roster (euroleagueratings + euroleaguebio)...');
    try {
        const BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/';
        const [ratingsRes, bioRes] = await Promise.all([
            fetch(BASE + 'euroleagueratings'),
            fetch(BASE + 'euroleaguebio'),
        ]);
        if (!ratingsRes.ok) {
            console.error('Failed to fetch Euroleague ratings');
            return { players: [], teams: [] };
        }

        const data = await ratingsRes.json();
        const bioArr: any[] = bioRes.ok ? await bioRes.json() : [];

        const bioMap = new Map<string, any>();
        bioArr.forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        if (data.teams && Array.isArray(data.teams)) {
            data.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 1000,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'Euroleague',
                });
            });
        }

        const sourceList = Array.isArray(data) ? data : (data.players || []);
        sourceList.forEach((item: any) => {
            let playerName = item.name;
            if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
            if (!playerName) return;
            if (!item.ratings) return;

            // Rename any Euroleague Devin Booker to avoid collision with NBA player
            if (playerName === 'Devin Booker') playerName = 'Devin Rydale Booker';

            const bio = bioMap.get(playerName.toLowerCase());
            const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['Euroleague']);
            const player: NBAPlayer = {
                internalId: `euro-${playerName.replace(/\s+/g, '')}-${(item.tid ?? 0) + 1000}`,
                tid: item.tid !== undefined ? item.tid + 1000 : -1,
                name: playerName,
                overallRating: computeLeagueOvr(item.ratings?.[0], 'Euroleague'),
                ratings: scaledRatings,
                stats: item.stats || [],
                imgURL: resolveImgURL(item.imgURL, bio?.image),
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
                jerseyNumber: extractJerseyNumber(item),
            };
            players.push(player);
        });

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
                        const pbaOvr = computeLeagueOvr(item.ratings?.[0], 'PBA');
                        if (scaledRatings[0]) {
                          // Universal age-aware estimator (29+ → pot=ovr, younger → growth headroom)
                          // clamped to PBA's BBGM ovr ceiling (46). Top young prospects land
                          // around 2K display 70-71, veterans show pot=ovr — matches PBA reality.
                          const pbaAge = (new Date().getFullYear()) - (item.born?.year ?? 1995);
                          scaledRatings[0].pot = Math.min(46, estimatePotentialBbgm(pbaOvr, pbaAge));
                        }
                     const player: NBAPlayer = {
                        internalId: `pba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                        tid: item.tid !== undefined ? item.tid + 2000 : -1, // Offset PBA by 2000
                        name: playerName,
                        overallRating: pbaOvr,
                        ratings: scaledRatings,
                        stats: item.stats || [],
                        imgURL: resolveImgURL(item.imgURL),
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
                        jerseyNumber: extractJerseyNumber(item)
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
    console.log("RosterService: Fetching WNBA roster (wnbaratings + wnbabio1 + wnbabio2)...");
    try {
        const BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/';
        const [ratingsRes, bio1Res, bio2Res] = await Promise.all([
            fetch(BASE + 'wnbaratings'),
            fetch(BASE + 'wnbabio1'),
            fetch(BASE + 'wnbabio2'),
        ]);
        if (!ratingsRes.ok) {
            console.error('Failed to fetch WNBA ratings');
            return { players: [], teams: [] };
        }

        const ratingsData = await ratingsRes.json();
        const bio1Arr: any[] = bio1Res.ok ? await bio1Res.json() : [];
        const bio2Arr: any[] = bio2Res.ok ? await bio2Res.json() : [];

        // Build bio lookup: bio1 is primary, bio2 fills gaps
        const bioMap = new Map<string, any>();
        [...bio2Arr, ...bio1Arr].forEach((b: any) => {
            if (b.name) bioMap.set(b.name.toLowerCase(), b);
        });

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        if (ratingsData.teams && Array.isArray(ratingsData.teams)) {
            ratingsData.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 3000,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'WNBA',
                });
            });
        }

        const sourceList: any[] = Array.isArray(ratingsData) ? ratingsData : (ratingsData.players || []);
        sourceList.forEach((item: any, index: number) => {
            let playerName = item.name;
            if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
            if (!playerName) return;
            if (!item.ratings) return;

            const bio = bioMap.get(playerName.toLowerCase());
            const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['WNBA'] ?? 1.0);

            const player: NBAPlayer = {
                internalId: `wnba-${item.tid ?? index}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                tid: item.tid !== undefined ? item.tid + 3000 : -100,
                name: playerName,
                overallRating: computeLeagueOvr(item.ratings?.[0], 'WNBA'),
                ratings: scaledRatings,
                stats: item.stats || [],
                imgURL: resolveImgURL(item.imgURL, bio?.image),
                pos: item.pos || 'GF',
                hgt: item.hgt,
                weight: item.weight,
                born: item.born,
                draft: item.draft,
                contract: item.contract,
                injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                status: 'WNBA',
                hof: false,
                jerseyNumber: extractJerseyNumber(item),
            };
            players.push(player);
        });

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
        // B-League bio uses a gist URL (not the nba-store-data repo) because the B-League
        // bio data was created as a gist BEFORE the repo existed. All other leagues use the repo.
        const BLEAGUE_BIO_GIST = 'https://gist.githubusercontent.com/aljohnpolyglot/0ffa999888dac89005a31b6f1b41b0ba/raw/bleaguebio';
        const [response, bioRes] = await Promise.all([
            fetch('https://gist.githubusercontent.com/aljohnpolyglot/d15d468522ee6709ce2a10394a47c329/raw/72e7df921daffea43889135396b6ac5af6ad8393/bleaguejapanbbgm'),
            fetch(BLEAGUE_BIO_GIST).catch(() => null),
        ]);
        if (!response.ok) {
            console.error('Failed to fetch B-League roster');
            return { players: [], teams: [] };
        }
        const data = await response.json();

        // Build bio lookup for portrait fallback
        const bioMap = new Map<string, any>();
        if (bioRes?.ok) {
            try {
                const bioArr: any[] = await bioRes.json();
                (Array.isArray(bioArr) ? bioArr : (bioArr as any).players ?? [])
                    .forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });
            } catch (_) {}
        }

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
                    const bio = bioMap.get(playerName.toLowerCase());
                    const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['B-League']);
                    const player: NBAPlayer = {
                        internalId: `bleague-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                        tid: item.tid !== undefined ? item.tid + 4000 : -1, // Offset B-League by 4000
                        name: playerName,
                        overallRating: computeLeagueOvr(item.ratings?.[0], 'B-League'),
                        ratings: scaledRatings,
                        stats: item.stats || [],
                        imgURL: resolveImgURL(item.imgURL, bio?.image),
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
                        jerseyNumber: extractJerseyNumber(item)
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
                imgURL: resolveImgURL(item.imgURL, bio?.image),
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
                jerseyNumber: extractJerseyNumber(item),
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
                imgURL: resolveImgURL(item.imgURL, bio?.image),
                pos: item.pos || 'GF',
                hgt: item.hgt,
                weight: item.weight,
                born: item.born,
                draft: item.draft,
                contract: item.contract,
                injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                status: 'Endesa',
                hof: false,
                jerseyNumber: extractJerseyNumber(item),
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

export const fetchChinaCBARoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    console.log('RosterService: Fetching China CBA roster...');
    try {
        const BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/';
        const [ratingsRes, bioRes] = await Promise.all([
            fetch(BASE + 'chinesecbaratings'),
            fetch(BASE + 'chinacbabio'),
        ]);
        if (!ratingsRes.ok) { console.error('Failed to fetch China CBA ratings'); return { players: [], teams: [] }; }

        const ratingsData = await ratingsRes.json();
        const bioArr: any[] = bioRes.ok ? await bioRes.json() : [];

        const bioMap = new Map<string, any>();
        bioArr.forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        if (ratingsData.teams && Array.isArray(ratingsData.teams)) {
            ratingsData.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 7000,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'China CBA',
                });
            });
        }

        const sourceList: any[] = Array.isArray(ratingsData) ? ratingsData : (ratingsData.players || []);
        sourceList.forEach((item: any) => {
            let playerName = item.name;
            if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
            if (!playerName) return;
            if (!item.ratings) return;

            const bio = bioMap.get(playerName.toLowerCase());
            const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['China CBA']);
            const cbaOvr = computeLeagueOvr(item.ratings?.[0], 'China CBA');
            if (scaledRatings[0]) {
              // ChinaCBA gets slightly more headroom than PBA (raw 46 → display ~71)
              // — CBA does occasionally produce NBA-caliber players (Yao, Wang Zhizhi).
              const cbaAge = (new Date().getFullYear()) - (item.born?.year ?? 1995);
              scaledRatings[0].pot = Math.min(46, estimatePotentialBbgm(cbaOvr, cbaAge));
            }
            const player: NBAPlayer = {
                internalId: `chinacba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                tid: item.tid !== undefined ? item.tid + 7000 : -1,
                name: playerName,
                overallRating: cbaOvr,
                ratings: scaledRatings,
                stats: item.stats || [],
                imgURL: resolveImgURL(item.imgURL, bio?.image),
                pos: item.pos || 'GF',
                hgt: item.hgt,
                weight: item.weight,
                born: item.born,
                draft: item.draft,
                contract: item.contract,
                injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                status: 'China CBA',
                hof: false,
                jerseyNumber: extractJerseyNumber(item),
            };
            players.push(player);
        });

        console.log(`RosterService: Successfully processed ${players.length} China CBA players and ${teams.length} teams.`);
        return { players, teams };
    } catch (error) {
        console.error('Error fetching China CBA roster:', error);
        return { players: [], teams: [] };
    }
};

export const fetchNBLAustraliaRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
    console.log('RosterService: Fetching NBL Australia roster...');
    try {
        const BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/';
        const [ratingsRes, bioRes] = await Promise.all([
            fetch(BASE + 'nblaustraliaratings'),
            fetch(BASE + 'nblaustraliabio'),
        ]);
        if (!ratingsRes.ok) { console.error('Failed to fetch NBL Australia ratings'); return { players: [], teams: [] }; }

        const ratingsData = await ratingsRes.json();
        const bioArr: any[] = bioRes.ok ? await bioRes.json() : [];

        const bioMap = new Map<string, any>();
        bioArr.forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });

        const players: NBAPlayer[] = [];
        const teams: NonNBATeam[] = [];

        if (ratingsData.teams && Array.isArray(ratingsData.teams)) {
            ratingsData.teams.forEach((t: any) => {
                teams.push({
                    tid: t.tid + 8000,
                    cid: t.cid,
                    did: t.did,
                    region: t.region,
                    name: t.name,
                    abbrev: t.abbrev,
                    pop: t.pop || 1.0,
                    stadiumCapacity: t.stadiumCapacity,
                    imgURL: t.imgURL,
                    colors: t.colors,
                    league: 'NBL Australia',
                });
            });
        }

        const sourceList: any[] = Array.isArray(ratingsData) ? ratingsData : (ratingsData.players || []);
        sourceList.forEach((item: any) => {
            let playerName = item.name;
            if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
            if (!playerName) return;
            if (!item.ratings) return;

            const bio = bioMap.get(playerName.toLowerCase());
            const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['NBL Australia']);
            const player: NBAPlayer = {
                internalId: `nblauss-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
                tid: item.tid !== undefined ? item.tid + 8000 : -1,
                name: playerName,
                overallRating: computeLeagueOvr(item.ratings?.[0], 'NBL Australia'),
                ratings: scaledRatings,
                stats: item.stats || [],
                imgURL: resolveImgURL(item.imgURL, bio?.image),
                pos: item.pos || 'GF',
                hgt: item.hgt,
                weight: item.weight,
                born: item.born,
                draft: item.draft,
                contract: item.contract,
                injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
                status: 'NBL Australia',
                hof: false,
                jerseyNumber: extractJerseyNumber(item),
            };
            players.push(player);
        });

        console.log(`RosterService: Successfully processed ${players.length} NBL Australia players and ${teams.length} teams.`);
        return { players, teams };
    } catch (error) {
        console.error('Error fetching NBL Australia roster:', error);
        return { players: [], teams: [] };
    }
};
