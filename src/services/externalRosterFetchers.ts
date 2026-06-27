import { NBAPlayer, NonNBATeam } from '../types';
import { LEAGUE_MULTIPLIERS } from './logic/leagueOvr';
import { estimatePotentialBbgm } from '../utils/playerRatings';
import { getSpainTeamPopulationOverride } from '../data/templates/spain/teamPopulations';
import { normalizeEndesaTeam } from '../utils/endesaTeams';
import {
  computeLeagueOvr,
  extractJerseyNumber,
  normalizeImportedPBAContract,
  PBAEconomyConfig,
  resolveImgURL,
  scaleRatings,
} from './externalRosterService.shared';
import { attachPbaStaffToTeam } from './pba/staffSources';
import { getPbaRosterPortrait } from './pba/portraits';

export const fetchEuroleagueRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching Euroleague roster (euroleagueratings + euroleaguebio + teamdata)...');
  try {
    const BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/';
    const EURO_TEAMS_GIST = 'https://gist.githubusercontent.com/aljohnpolyglot/7ec945dd1258cfb914cd0f5f1e420100/raw';
    const [ratingsRes, bioRes, teamDataRes] = await Promise.all([
      fetch(BASE + 'euroleagueratings'),
      fetch(BASE + 'euroleaguebio'),
      fetch(EURO_TEAMS_GIST),
    ]);
    if (!ratingsRes.ok) {
      console.error('Failed to fetch Euroleague ratings');
      return { players: [], teams: [] };
    }

    const data = await ratingsRes.json();
    const bioArr: any[] = bioRes.ok ? await bioRes.json() : [];

    const teamExtras = new Map<number, any>();
    if (teamDataRes.ok) {
      try {
        const td = await teamDataRes.json();
        (td.teams || []).forEach((t: any) => {
          if (t.tid !== undefined) teamExtras.set(t.tid, t);
        });
      } catch {}
    }

    const bioMap = new Map<string, any>();
    bioArr.forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });

    const players: NBAPlayer[] = [];
    const teams: NonNBATeam[] = [];

    if (data.teams && Array.isArray(data.teams)) {
      data.teams.forEach((t: any) => {
        const extra = teamExtras.get(t.tid);
        const overridePop = getSpainTeamPopulationOverride(t.region || extra?.region, t.name || extra?.name);
        teams.push({
          tid: t.tid + 1000,
          cid: t.cid ?? extra?.cid,
          did: t.did ?? extra?.did,
          region: t.region || extra?.region,
          name: t.name || extra?.name,
          abbrev: t.abbrev || extra?.abbrev,
          pop: (t.pop && t.pop !== 1.0 ? t.pop : null) ?? (extra?.pop && extra.pop !== 1.0 ? extra.pop : null) ?? overridePop ?? t.pop ?? extra?.pop ?? 1.0,
          stadiumCapacity: t.stadiumCapacity || extra?.stadiumCapacity,
          imgURL: t.imgURL || extra?.imgURL,
          colors: t.colors || extra?.colors,
          league: 'Euroleague',
        });
      });
    } else if (teamExtras.size > 0) {
      teamExtras.forEach((t) => {
        if (t.disabled) return;
        const overridePop = getSpainTeamPopulationOverride(t.region, t.name);
        teams.push({
          tid: t.tid + 1000,
          cid: t.cid,
          did: t.did,
          region: t.region,
          name: t.name,
          abbrev: t.abbrev,
          pop: (t.pop && t.pop !== 1.0 ? t.pop : null) ?? overridePop ?? t.pop ?? 1.0,
          stadiumCapacity: t.stadiumCapacity,
          imgURL: t.imgURL || t.logoUrl || t.teamLogo,
          colors: t.colors,
          league: 'Euroleague',
        });
      });
    }

    const sourceList = Array.isArray(data) ? data : (data.players || []);
    sourceList.forEach((item: any) => {
      let playerName = item.name;
      if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
      if (!playerName || !item.ratings) return;
      if (playerName === 'Devin Booker') playerName = 'Devin Rydale Booker';

      const bio = bioMap.get(playerName.toLowerCase());
      const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS.Euroleague);
      players.push({
        internalId: `euro-${playerName.replace(/\s+/g, '')}-${(item.tid ?? 0) + 1000}`,
        tid: item.tid !== undefined ? item.tid + 1000 : -1,
        name: playerName,
        overallRating: computeLeagueOvr(item.ratings?.[0], 'Euroleague'),
        ratings: scaledRatings,
        stats: item.stats || [],
        imgURL: resolveImgURL(item.imgURL, bio?.image),
        pos: item.pos || 'GF',
        hgt: item.hgt,
        weight: item.weight || bio?.weight,
        born: item.born || bio?.born,
        draft: item.draft,
        college: item.college || bio?.college,
        contract: item.contract,
        injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
        status: 'Euroleague',
        hof: false,
        jerseyNumber: extractJerseyNumber(item) ?? (bio ? extractJerseyNumber(bio) : undefined),
      });
    });

    console.log(`RosterService: Successfully processed ${players.length} Euroleague players and ${teams.length} teams.`);
    return { players, teams };
  } catch (error) {
    console.error('Error fetching Euroleague roster:', error);
    return { players: [], teams: [] };
  }
};

export const fetchPBARoster = async (economy: PBAEconomyConfig): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching PBA roster...');
  try {
    const response = await fetch('https://gist.githubusercontent.com/aljohnpolyglot/71f4e519775d0cbeb806397a8696fc8f/raw/1d921d6e8346c73f66efe0425d74bedae4e25cb3/PBA_Roster_Complete_2025');
    if (!response.ok) {
      console.error('Failed to fetch PBA roster');
      return { players: [], teams: [] };
    }
    const data = await response.json();
    const players: NBAPlayer[] = [];
    const teams: NonNBATeam[] = [];

    if (data.teams && Array.isArray(data.teams)) {
      data.teams.forEach((t: any) => {
        const team = {
          tid: t.tid + 2000,
          cid: t.cid,
          did: t.did,
          region: t.region,
          name: t.name,
          abbrev: t.abbrev,
          pop: t.pop || 1.0,
          stadiumCapacity: t.stadiumCapacity,
          imgURL: t.imgURL || t.logoUrl || t.teamLogo,
          colors: t.colors,
          league: 'PBA',
        };
        teams.push(attachPbaStaffToTeam(team, new Date().getFullYear()));
      });
    }

    const sourceList = Array.isArray(data) ? data : (data.players || []);
    console.log(`RosterService: PBA Source list has ${sourceList.length} entries.`);

    let skippedBlank = 0;
    let skippedNoName = 0;

    if (Array.isArray(sourceList)) {
      sourceList.forEach((item: any) => {
        const imgURL = item.imgURL;
        if (!imgURL || typeof imgURL !== 'string' || imgURL.trim() === '' || imgURL === '/img/blank-face.png' || imgURL.includes('blank-face')) {
          skippedBlank++;
          return;
        }

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

        if (playerName && item.ratings) {
          const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS.PBA, 0.85);
          const pbaOvr = computeLeagueOvr(item.ratings?.[0], 'PBA');
          if (scaledRatings[0]) {
            const pbaAge = (new Date().getFullYear()) - (item.born?.year ?? 1995);
            scaledRatings[0].pot = Math.min(46, estimatePotentialBbgm(pbaOvr, pbaAge));
          }
          players.push({
            internalId: `pba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
            tid: item.tid !== undefined ? item.tid + 2000 : -1,
            name: playerName,
            overallRating: pbaOvr,
            ratings: scaledRatings,
            stats: item.stats || [],
            imgURL: resolveImgURL(item.imgURL) ?? getPbaRosterPortrait(playerName),
            pos: item.pos || 'GF',
            hgt: item.hgt,
            weight: item.weight,
            born: item.born,
            draft: item.draft,
            college: item.college,
            contract: normalizeImportedPBAContract(item.contract, pbaOvr, economy, {
              internalId: `pba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
              name: playerName,
              tid: item.tid !== undefined ? item.tid + 2000 : -1,
              born: item.born,
              stats: item.stats || [],
            }),
            injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
            status: 'PBA',
            pbaLocalEligible: true,
            hof: false,
            jerseyNumber: extractJerseyNumber(item),
          } as NBAPlayer);
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
  console.log('RosterService: Fetching WNBA roster (wnbaratings + wnbabio1 + wnbabio2)...');
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
      if (!playerName || !item.ratings) return;

      const bio = bioMap.get(playerName.toLowerCase());
      const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS.WNBA ?? 1.0);
      players.push({
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
      });
    });

    console.log(`RosterService: Successfully processed ${players.length} WNBA players and ${teams.length} teams.`);
    return { players, teams };
  } catch (error) {
    console.error('Error fetching WNBA roster:', error);
    return { players: [], teams: [] };
  }
};

export const fetchBLeagueRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching B-League roster...');
  try {
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

    const bioMap = new Map<string, any>();
    if (bioRes?.ok) {
      try {
        const bioArr: any[] = await bioRes.json();
        (Array.isArray(bioArr) ? bioArr : (bioArr as any).players ?? [])
          .forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });
      } catch {}
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
          league: 'B-League',
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
          players.push({
            internalId: `bleague-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
            tid: item.tid !== undefined ? item.tid + 4000 : -1,
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
            jerseyNumber: extractJerseyNumber(item),
          });
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

    const affiliateMap = new Map<string, string>();
    const allTeamsJson: any[] = [
      ...(teamsJson.nba_g_league_teams?.eastern_conference ?? []),
      ...(teamsJson.nba_g_league_teams?.western_conference ?? []),
    ];
    allTeamsJson.forEach((t: any) => {
      if (t.team && t.nba_affiliate) affiliateMap.set(t.team.toLowerCase(), t.nba_affiliate);
    });

    const bioMap = new Map<string, any>();
    bioArr.forEach((b: any) => { if (b.name) bioMap.set(b.name.toLowerCase(), b); });

    const players: NBAPlayer[] = [];
    const teams: NonNBATeam[] = [];

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

    const sourceList: any[] = Array.isArray(ratingsData) ? ratingsData : (ratingsData.players || []);
    sourceList.forEach((item: any) => {
      let playerName = item.name;
      if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
      if (!playerName || !item.ratings) return;

      const bio = bioMap.get(playerName.toLowerCase());
      const isTwoWay = !!(bio?.nba_status && bio.nba_status.toLowerCase().includes('two-way'));
      const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['G-League']);
      players.push({
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
      });
    });

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
        const overridePop = getSpainTeamPopulationOverride(t.region, t.name);
        teams.push(normalizeEndesaTeam({
          tid: t.tid + 5000,
          cid: t.cid,
          did: t.did,
          region: t.region,
          name: t.name,
          abbrev: t.abbrev,
          pop: (t.pop && t.pop !== 1.0 ? t.pop : null) ?? overridePop ?? t.pop ?? 1.0,
          stadiumCapacity: t.stadiumCapacity,
          imgURL: t.imgURL,
          colors: t.colors,
          league: 'Endesa',
        }));
      });
    }

    const sourceList: any[] = Array.isArray(ratingsData) ? ratingsData : (ratingsData.players || []);
    sourceList.forEach((item: any) => {
      let playerName = item.name;
      if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
      if (!playerName || !item.ratings) return;

      const age = item.born?.year ? currentYear - item.born.year : 99;
      if (age < 19) return;

      const bio = bioMap.get(playerName.toLowerCase());
      const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS.Endesa);
      players.push({
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
      });
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
      if (!playerName || !item.ratings) return;

      const bio = bioMap.get(playerName.toLowerCase());
      const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['China CBA']);
      const cbaOvr = computeLeagueOvr(item.ratings?.[0], 'China CBA');
      if (scaledRatings[0]) {
        const cbaAge = (new Date().getFullYear()) - (item.born?.year ?? 1995);
        scaledRatings[0].pot = Math.min(46, estimatePotentialBbgm(cbaOvr, cbaAge));
      }
      players.push({
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
      });
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
      if (!playerName || !item.ratings) return;

      const bio = bioMap.get(playerName.toLowerCase());
      const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS['NBL Australia']);
      players.push({
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
      });
    });

    console.log(`RosterService: Successfully processed ${players.length} NBL Australia players and ${teams.length} teams.`);
    return { players, teams };
  } catch (error) {
    console.error('Error fetching NBL Australia roster:', error);
    return { players: [], teams: [] };
  }
};
