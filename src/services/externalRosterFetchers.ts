import { NBAPlayer, NonNBATeam } from '../types';
import { LEAGUE_MULTIPLIERS } from './logic/leagueOvr';
import { estimatePotentialBbgm } from '../utils/playerRatings';
import { getLastAttendedSchool } from '../utils/educationUtils';
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
import { createPortraitUsageSet } from '../utils/newgenPortrait';
import { readJsonResponse } from './utils/jsonResponse';
import { fetchBundledHistoricalExternalRoster } from './historicalExternalRosterFetcher';
import { getSourceCoverageThrough, inferSourceRetirement } from './retirement/sourceRetirement';
import {
  applyExternalPortraitCatalog,
  getCachedExternalPortraitForName,
  loadExternalPortraitCatalog,
} from './externalPortraitCatalog';
import {
  applyExternalTeamLogoCatalog,
  loadExternalTeamLogoCatalog,
} from './externalTeamLogoCatalog';

export { fetchEuroleagueRoster } from './euroleagueRosterFetcher';
export { fetchHistoricalGLeagueRoster as fetchGLeagueRoster } from './gleagueRosterFetcher';

async function readOptionalJson<T>(response: Response | null, label: string, fallback: T): Promise<T> {
  if (!response?.ok) return fallback;
  try {
    return await readJsonResponse<T>(response, label);
  } catch (error) {
    console.warn(`${label} unavailable:`, error);
    return fallback;
  }
}

export const fetchPBARoster = async (economy: PBAEconomyConfig): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching PBA roster...');
  try {
    const [response, portraitCatalog] = await Promise.all([
      fetch('https://gist.githubusercontent.com/aljohnpolyglot/71f4e519775d0cbeb806397a8696fc8f/raw/1d921d6e8346c73f66efe0425d74bedae4e25cb3/PBA_Roster_Complete_2025'),
      loadExternalPortraitCatalog('PBA').catch(() => new Map()),
    ]);
    if (!response.ok) {
      console.error('Failed to fetch PBA roster');
      return { players: [], teams: [] };
    }
    const data = await readJsonResponse<any>(response, 'Current PBA roster');
    const players: NBAPlayer[] = [];
    const teams: NonNBATeam[] = [];
    const usedStaffPortraitUrls = createPortraitUsageSet();

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
        teams.push(attachPbaStaffToTeam(team, new Date().getFullYear(), usedStaffPortraitUrls));
      });
    }

    const sourceList = Array.isArray(data) ? data : (data.players || []);
    const sourceCoverageThrough = getSourceCoverageThrough({
      players: sourceList,
      teams: data.teams ?? [],
    });
    console.log(`RosterService: PBA Source list has ${sourceList.length} entries.`);

    let skippedBlank = 0;
    let skippedNoName = 0;

    if (Array.isArray(sourceList)) {
      sourceList.forEach((item: any) => {
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
        const sourcePortrait = resolveImgURL(item.imgURL);
        const fallbackPortrait = getCachedExternalPortraitForName('PBA', playerName)
          ?? getPbaRosterPortrait(playerName);
        if (!sourcePortrait && !fallbackPortrait) {
          skippedBlank++;
          return;
        }

        if (playerName && item.ratings) {
          const sourceRetirement = inferSourceRetirement(item, {
            branchCutoffYear: new Date().getFullYear(),
            sourceCoverageThrough,
          });
          const pbaAge = (new Date().getFullYear()) - (item.born?.year ?? 1995);
          const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS.PBA, 0.85)
            .map((scaled, index) => {
              const rowOvr = computeLeagueOvr(item.ratings?.[index], 'PBA');
              return {
                ...scaled,
                ovr: rowOvr,
                pot: Math.min(46, estimatePotentialBbgm(
                  rowOvr,
                  pbaAge,
                  Math.round(40 * LEAGUE_MULTIPLIERS.PBA),
                )),
                pbaCanonicalLeagueRating: true,
              };
            });
          const pbaOvr = computeLeagueOvr(item.ratings?.[0], 'PBA');
          const pbaPotential = Number(scaledRatings[0]?.pot ?? pbaOvr);
          players.push({
            internalId: `pba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
            tid: sourceRetirement ? -3 : item.tid !== undefined ? item.tid + 2000 : -1,
            name: playerName,
            overallRating: pbaOvr,
            potential: pbaPotential,
            ratings: scaledRatings,
            stats: item.stats || [],
            imgURL: sourcePortrait ?? fallbackPortrait,
            pos: item.pos || 'GF',
            hgt: item.hgt,
            weight: item.weight,
            born: item.born,
            draft: item.draft,
            college: getLastAttendedSchool(item.college) ?? undefined,
            contract: sourceRetirement ? undefined : normalizeImportedPBAContract(item.contract, pbaOvr, economy, {
              internalId: `pba-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
              name: playerName,
              tid: item.tid !== undefined ? item.tid + 2000 : -1,
              born: item.born,
              stats: item.stats || [],
            }),
            injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
            status: sourceRetirement ? 'Retired' : 'PBA',
            retiredYear: sourceRetirement?.retiredYear,
            sourceRetirement: sourceRetirement ?? undefined,
            pbaLocalEligible: !sourceRetirement,
            hof: false,
            jerseyNumber: extractJerseyNumber(item),
          } as NBAPlayer);
        } else {
          skippedNoName++;
        }
      });
    }

    const hydratedPlayers = applyExternalPortraitCatalog(players, 'PBA', portraitCatalog, new Date().getFullYear());
    console.log(`RosterService: Successfully processed ${hydratedPlayers.length} PBA players and ${teams.length} teams. (Skipped ${skippedBlank} blank faces, ${skippedNoName} invalid/no-name)`);
    return { players: hydratedPlayers, teams };
  } catch (error) {
    console.error('Error fetching PBA roster:', error);
    return { players: [], teams: [] };
  }
};

export const fetchWNBARoster = async (requestedSeason?: number): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching WNBA roster...');
  try {
    return await fetchBundledHistoricalExternalRoster({
      league: 'WNBA',
      tidOffset: 3000,
      internalIdPrefix: 'wnba',
      competitionId: 'wnba',
      historyPath: '/data/external/wnba/wnba-2026-bbgm.json',
      historyLabel: 'Bundled WNBA 1997 through 2026 history',
      currentRosterUrl: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/wnbaratings',
      currentRosterLabel: 'Current WNBA roster',
      bioUrl: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/wnbabio1',
      countryIso2: 'US',
    }, requestedSeason);
  } catch (error) {
    console.error('Error fetching WNBA roster:', error);
    return { players: [], teams: [] };
  }
};

const normalizeBLeagueSourceName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const B_LEAGUE_ORIGINAL_TEAM_ALIASES: Record<string, string> = {
  aishinseahorses: 'seahorsesmikawa',
  hitachisunrockers: 'sunrockersshibuya',
  linktochigibrex: 'utsunomiyautsunomiya',
  shigalakestars: 'shigalakes',
  toyotaalvark: 'alvarktokyo',
};

export const fetchBLeagueRoster = async (requestedSeason?: number): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching B-League roster...');
  if (requestedSeason != null) {
    try {
      return await fetchBundledHistoricalExternalRoster({
        league: 'B-League',
        tidOffset: 4000,
        internalIdPrefix: 'bleague',
        competitionId: 'bleague',
        historyPath: '/data/external/bleague/japanese-bleague-2026-bbgm.json',
        historyLabel: 'Bundled B.League 2016-17 through 2025-26 history',
        currentRosterUrl: 'https://gist.githubusercontent.com/aljohnpolyglot/d15d468522ee6709ce2a10394a47c329/raw/72e7df921daffea43889135396b6ac5af6ad8393/bleaguejapanbbgm',
        currentRosterLabel: 'Current B.League roster',
        bioUrl: 'https://gist.githubusercontent.com/aljohnpolyglot/0ffa999888dac89005a31b6f1b41b0ba/raw/bleaguebio',
        countryIso2: 'JP',
        teamAliases: B_LEAGUE_ORIGINAL_TEAM_ALIASES,
      }, requestedSeason);
    } catch (error) {
      console.error('Error fetching historical B-League roster:', error);
      return { players: [], teams: [] };
    }
  }
  try {
    const BLEAGUE_BIO_GIST = 'https://gist.githubusercontent.com/aljohnpolyglot/0ffa999888dac89005a31b6f1b41b0ba/raw/bleaguebio';
    const [historyRes, response, bioRes, teamLogoCatalog, portraitCatalog] = await Promise.all([
      fetch('/data/external/bleague/japanese-bleague-2026-bbgm.json').catch(() => null),
      fetch('https://gist.githubusercontent.com/aljohnpolyglot/d15d468522ee6709ce2a10394a47c329/raw/72e7df921daffea43889135396b6ac5af6ad8393/bleaguejapanbbgm').catch(() => null),
      fetch(BLEAGUE_BIO_GIST).catch(() => null),
      loadExternalTeamLogoCatalog('B-League', 2026).catch(() => new Map()),
      loadExternalPortraitCatalog('B-League', 2026).catch(() => new Map()),
    ]);
    if (!historyRes?.ok && !response?.ok) {
      console.error('Failed to fetch B-League roster');
      return { players: [], teams: [] };
    }
    const originalData = response?.ok
      ? await readJsonResponse<any>(response, 'Current B.League roster')
      : { players: [], teams: [] };
    const historicalData = await readOptionalJson<any | null>(
      historyRes,
      'Bundled B.League 2016-17 through 2025-26 history',
      null,
    );
    const data = historicalData?.players?.length ? historicalData : originalData;

    const bioMap = new Map<string, any>();
    if (bioRes?.ok) {
      try {
        const bioArr = await readOptionalJson<any[]>(bioRes, 'B.League biography source', []);
        (Array.isArray(bioArr) ? bioArr : (bioArr as any).players ?? [])
          .forEach((b: any) => {
            if (b.name) bioMap.set(normalizeBLeagueSourceName(b.name), b);
          });
      } catch {}
    }

    const players: NBAPlayer[] = [];
    const teams: NonNBATeam[] = [];
    const originalPlayers = Array.isArray(originalData)
      ? originalData
      : originalData.players ?? [];
    const originalPlayerMap = new Map<string, any>();
    originalPlayers.forEach((player: any) => {
      const name = player.name
        ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
      if (name) originalPlayerMap.set(normalizeBLeagueSourceName(name), player);
    });
    const originalTeams = Array.isArray(originalData.teams) ? originalData.teams : [];
    const originalTeamMap = new Map<string, any>();
    originalTeams.forEach((team: any) => {
      const name = `${team.region ?? ''} ${team.name ?? ''}`.trim();
      if (name) originalTeamMap.set(normalizeBLeagueSourceName(name), team);
    });
    const sourceTidToCanonicalTid = new Map<number, number>();
    let nextTeamTid = Math.max(-1, ...originalTeams.map((team: any) => Number(team.tid) || 0)) + 1;

    if (data.teams && Array.isArray(data.teams)) {
      data.teams.forEach((t: any) => {
        const sourceName = `${t.region ?? ''} ${t.name ?? ''}`.trim();
        const normalizedName = normalizeBLeagueSourceName(sourceName);
        const originalName = B_LEAGUE_ORIGINAL_TEAM_ALIASES[normalizedName] ?? normalizedName;
        const originalTeam = originalTeamMap.get(originalName);
        const canonicalSourceTid = originalTeam?.tid ?? nextTeamTid++;
        sourceTidToCanonicalTid.set(Number(t.tid), canonicalSourceTid);
        teams.push({
          tid: canonicalSourceTid + 4000,
          cid: t.cid,
          did: t.did,
          region: t.region,
          name: t.name,
          abbrev: t.abbrev,
          pop: t.pop || 1.0,
          stadiumCapacity: t.stadiumCapacity,
          imgURL: originalTeam?.imgURL || t.imgURL,
          colors: t.colors,
          league: 'B-League',
          realgmTeamId: t.realgmTeamId,
          seasons: t.seasons,
        });
      });
    }

    const sourceList = Array.isArray(data) ? data : (data.players || []);
    const sourceCoverageThrough = getSourceCoverageThrough({
      players: sourceList,
      teams: data.teams ?? [],
    });
    if (Array.isArray(sourceList)) {
      sourceList.forEach((item: any) => {
        let playerName = item.name;
        if (!playerName) {
          if (item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
          else if (item.lastName) playerName = item.lastName;
          else if (item.firstName) playerName = item.firstName;
        }

        if (playerName && item.ratings) {
          const nameKey = normalizeBLeagueSourceName(playerName);
          const bio = bioMap.get(nameKey);
          const originalPlayer = originalPlayerMap.get(nameKey);
          const ratings = [...(item.ratings || [])].sort(
            (left: any, right: any) => Number(left.season ?? 0) - Number(right.season ?? 0),
          );
          const latestRatings = ratings[ratings.length - 1];
          const scaledRatings = scaleRatings(ratings, LEAGUE_MULTIPLIERS['B-League']);
          const sourceTid = Number(item.tid);
          const sourceRetirement = inferSourceRetirement(item, {
            branchCutoffYear: new Date().getFullYear(),
            sourceCoverageThrough,
          });
          const retired = !!sourceRetirement;
          const canonicalTid = sourceTid >= 0
            ? (sourceTidToCanonicalTid.get(sourceTid) ?? sourceTid) + 4000
            : retired ? -100 : -1;
          const stats = (item.stats || []).map((row: any) => ({
            ...row,
            tid: Number(row.tid) >= 0
              ? (sourceTidToCanonicalTid.get(Number(row.tid)) ?? Number(row.tid)) + 4000
              : row.tid,
            competitionId: row.competitionId ?? 'bleague',
          }));
          players.push({
            internalId: `bleague-realgm-${item.pid ?? `${sourceTid}-${nameKey}-${item.born?.year || '0'}`}`,
            tid: canonicalTid,
            name: playerName,
            overallRating: computeLeagueOvr(latestRatings, 'B-League'),
            ratings: scaledRatings,
            stats,
            imgURL: resolveImgURL(originalPlayer?.imgURL, bio?.image)
              ?? resolveImgURL(item.imgURL),
            pos: item.pos || 'GF',
            hgt: item.hgt > 100 ? Math.round(item.hgt / 2.54) : item.hgt,
            weight: item.weight,
            born: item.born,
            nationality: item.born?.loc,
            draft: item.draft,
            college: item.college,
            contract: retired ? undefined : item.contract,
            awards: item.awards || [],
            injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
            status: retired ? 'Retired' : 'B-League',
            retiredYear: sourceRetirement?.retiredYear,
            sourceRetirement: sourceRetirement ?? undefined,
            hof: false,
            jerseyNumber: extractJerseyNumber(item),
          });
        }
      });
    }

    const hydratedTeams = applyExternalTeamLogoCatalog(teams, 'B-League', teamLogoCatalog, 2026);
    const hydratedPlayers = applyExternalPortraitCatalog(players, 'B-League', portraitCatalog, 2026);
    console.log(`RosterService: Successfully processed ${hydratedPlayers.length} B-League players and ${hydratedTeams.length} teams.`);
    return { players: hydratedPlayers, teams: hydratedTeams };
  } catch (error) {
    console.error('Error fetching B-League roster:', error);
    return { players: [], teams: [] };
  }
};

export const fetchEndesaRoster = async (): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching Endesa (Liga ACB) roster...');
  try {
    const [ratingsRes, bioRes, portraitCatalog] = await Promise.all([
      fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/ligaendesabbgmjson'),
      fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/ligaendesabio'),
      loadExternalPortraitCatalog('Endesa').catch(() => new Map()),
    ]);
    if (!ratingsRes.ok) { console.error('Failed to fetch Endesa ratings'); return { players: [], teams: [] }; }

    const ratingsData = await readJsonResponse<any>(ratingsRes, 'Liga Endesa ratings');
    const bioArr = await readOptionalJson<any[]>(bioRes, 'Liga Endesa biography source', []);

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
    const sourceCoverageThrough = getSourceCoverageThrough({
      players: sourceList,
      teams: ratingsData.teams ?? [],
    });
    sourceList.forEach((item: any) => {
      let playerName = item.name;
      if (!playerName && item.firstName && item.lastName) playerName = `${item.firstName} ${item.lastName}`;
      if (!playerName || !item.ratings) return;

      const age = item.born?.year ? currentYear - item.born.year : 99;
      if (age < 19) return;

      const bio = bioMap.get(playerName.toLowerCase());
      const sourceRetirement = inferSourceRetirement(item, {
        branchCutoffYear: currentYear,
        sourceCoverageThrough,
      });
      const scaledRatings = scaleRatings(item.ratings || [], LEAGUE_MULTIPLIERS.Endesa);
      players.push({
        internalId: `endesa-${item.tid}-${playerName.replace(/\s+/g, '')}-${item.born?.year || '0'}`,
        tid: sourceRetirement ? -3 : item.tid !== undefined ? item.tid + 5000 : -1,
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
        contract: sourceRetirement ? undefined : item.contract,
        injury: item.injury || { type: 'Healthy', gamesRemaining: 0 },
        status: sourceRetirement ? 'Retired' : 'Endesa',
        retiredYear: sourceRetirement?.retiredYear,
        sourceRetirement: sourceRetirement ?? undefined,
        hof: false,
        jerseyNumber: extractJerseyNumber(item),
      });
    });

    const hydratedPlayers = applyExternalPortraitCatalog(players, 'Endesa', portraitCatalog, currentYear);
    console.log(`RosterService: Successfully processed ${hydratedPlayers.length} Endesa players and ${teams.length} teams.`);
    return { players: hydratedPlayers, teams };
  } catch (error) {
    console.error('Error fetching Endesa roster:', error);
    return { players: [], teams: [] };
  }
};

const CHINA_CBA_TEAM_ALIASES: Record<string, string> = {
  beijingbeikong: 'beikongroyalfighters',
  beijingshougang: 'beijingducks',
  fujian: 'fujiansbsxunxingsturgeons',
  guangdongdongguan: 'guangdongsoutherntigers',
  guangzhouloonglions: 'guangzhoulonglions',
  jiangsukendia: 'jiangsudragons',
  jilinnortheast: 'jilinnortheasttigers',
  liaoning: 'liaoningleopards',
  nanjingtongximonkeyking: 'nanjingtongximonkeykings',
  ningborockets: 'ningborockets',
  qingdao: 'qingdaoeagles',
  shandong: 'shandongshandong',
  shanghaidongfang: 'shanghaisharks',
  shanxizhongyu: 'shanxishanxi',
  shenzhen: 'shenzhenaviators',
  sichuanbluewhales: 'sichuanbluewhales',
  tianjinronggang: 'tianjinpioneers',
  xinjiangguanghui: 'xinjiangflyingtigers',
  zhejiangchouzhou: 'zhejianggoldenbulls',
  zhejiangguangsha: 'zhejianglions',
};

const NBL_AUSTRALIA_TEAM_ALIASES: Record<string, string> = {
  adelaide: 'adelaide36ers',
  brisbane: 'brisbanebullets',
  cairns: 'cairnstaipans',
  illawarra: 'illawarrahawks',
  melbourne: 'melbourneunited',
  newzealand: 'newzealandbreakers',
  perth: 'perthwildcats',
  southeastmelbourne: 'southeastmelbournephoenix',
  sydney: 'sydneykings',
  tasmania: 'tasmaniajackjumpers',
};

export const fetchChinaCBARoster = async (
  requestedSeason?: number,
  tidOffset: number = 7000,
): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching China CBA roster...');
  try {
    const roster = await fetchBundledHistoricalExternalRoster({
      league: 'China CBA',
      tidOffset,
      internalIdPrefix: 'chinacba',
      competitionId: 'chinacba',
      historyPath: '/data/external/china-cba/chinese-cba-2026-bbgm.json',
      historyLabel: 'Bundled China CBA 2011-12 through 2025-26 history',
      currentRosterUrl: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/chinesecbaratings',
      currentRosterLabel: 'Current China CBA roster',
      bioUrl: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/chinacbabio',
      countryIso2: 'CN',
      teamAliases: CHINA_CBA_TEAM_ALIASES,
      latestPotentialCap: 46,
    }, requestedSeason);
    console.log(`RosterService: Successfully processed ${roster.players.length} China CBA players and ${roster.teams.length} teams.`);
    return roster;
  } catch (error) {
    console.error('Error fetching China CBA roster:', error);
    return { players: [], teams: [] };
  }
};

export const fetchNBLAustraliaRoster = async (
  requestedSeason?: number,
  tidOffset: number = 8000,
): Promise<{ players: NBAPlayer[], teams: NonNBATeam[] }> => {
  console.log('RosterService: Fetching NBL Australia roster...');
  try {
    const roster = await fetchBundledHistoricalExternalRoster({
      league: 'NBL Australia',
      tidOffset,
      internalIdPrefix: 'nblauss',
      competitionId: 'nblaustralia',
      historyPath: '/data/external/nbl-australia/australian-nbl-2026-bbgm.json',
      historyLabel: 'Bundled NBL Australia 2011-12 through 2025-26 history',
      currentRosterUrl: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nblaustraliaratings',
      currentRosterLabel: 'Current NBL Australia roster',
      bioUrl: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nblaustraliabio',
      countryIso2: 'AU',
      teamAliases: NBL_AUSTRALIA_TEAM_ALIASES,
    }, requestedSeason);
    console.log(`RosterService: Successfully processed ${roster.players.length} NBL Australia players and ${roster.teams.length} teams.`);
    return roster;
  } catch (error) {
    console.error('Error fetching NBL Australia roster:', error);
    return { players: [], teams: [] };
  }
};
