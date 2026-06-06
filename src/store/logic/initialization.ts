import { GameState, HistoricalStatPoint, NBAPlayer as Player, DraftPick, LazySimProgress } from '../../types';
import { generateInitialContent } from '../../services/llm/llm';
import { getRosterData, getHistoricalAwards } from '../../services/rosterService';
import { generateFictionalLeague } from '../../services/fictionalLeagueGenerator';
import { generateFictionalStaff, generateFictionalReferees } from '../../services/fictionalStaffGenerator';
import { setRefereeData } from '../../data/photos/referees';
import type { LeagueType, ModdedLeagueBase, EuropeMarket } from '../../components/setup/LeagueTypeSelector';
import { EURO_ISOLATED_DEFAULTS, INITIAL_LEAGUE_STATS, PBA_ISOLATED_DEFAULTS } from '../../constants';
import { getSeasonSimStartDate } from '../../utils/dateUtils';
import { DEFAULT_MEDIA_RIGHTS } from '../../utils/broadcastingUtils';
import { fetchEuroleagueRoster, fetchWNBARoster, fetchPBARoster, fetchBLeagueRoster, fetchGLeagueRoster, fetchEndesaRoster, fetchChinaCBARoster, fetchNBLAustraliaRoster, getPBARosterEconomyConfig } from '../../services/externalRosterService';
import { generateFictionalExternalLeagues } from '../../services/fictionalExternalLeagues';
import { EXTERNAL_SALARY_SCALE } from '../../constants';
import { convertTo2KRating } from '../../utils/helpers';
import { loadNameData } from '../../data/nameDataFetcher';
import { enforceExternalMinRoster } from '../../services/externalLeagueSustainer';
import { SPAIN_COMPETITIONS } from '../../data/templates/spain/competitions';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { calculateSocialEngagement } from '../../utils/helpers';
import { generateFuturePicks, generateFuturePicksForTeamIds, DEFAULT_TRADABLE_PICK_SEASONS } from '../../services/draft/DraftPickGenerator';
import { applyPbaAwardsToPlayers, buildPbaHistoricalAwards } from '../../services/pba/awards';
import { ensureDraftClasses } from '../../services/draftClassFiller';
import { buildPbaCollegePoolFromSource } from '../../services/pba/collegeSources';
import { tunePbaDraftProspects } from '../../services/pba/draftRules';
interface StartGamePayload {
    name: string;
    startScenario?: string;
    skipLLM?: boolean;
    startDate?: string;
    jumpRequired?: boolean;
    onProgress?: (progress: LazySimProgress) => void;
    gameMode?: 'commissioner' | 'gm';
    userTeamId?: number;
    assistantGM?: boolean;
    leagueType?: LeagueType;
    moddedLeagueBase?: ModdedLeagueBase;
    europeMarket?: EuropeMarket;
    fictionalLeagueSeed?: number;
}
const EMPTY_ROSTER = { players: [], teams: [] };
const normalizeClubKey = (region?: string | null, name?: string | null) =>
    `${region ?? ''} ${name ?? ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
const hasRealDisplayName = (value?: string | null): boolean => {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 && !/^\d+$/.test(trimmed);
};
const resolveCommissionerDisplayName = (value?: string | null): string =>
    hasRealDisplayName(value) ? String(value).trim() : 'the new front-office lead';
const resolveTeamNewsSubject = (teamName?: string | null, leagueName?: string): string =>
    hasRealDisplayName(teamName) ? String(teamName).trim() : `${leagueName ?? 'League'} Team`;
const resolveTeamNewsObject = (teamName?: string | null): string =>
    hasRealDisplayName(teamName) ? String(teamName).trim() : 'the club';
const mergePlayerStats = (primaryStats: any[] | undefined, historyStats: any[] | undefined) => {
    const merged = [...(primaryStats ?? []), ...(historyStats ?? [])];
    const byKey = new Map<string, any>();
    for (const row of merged) {
        if (!row) continue;
        const key = `${row.season ?? 0}|${row.tid ?? -999}|${row.playoffs ? 1 : 0}`;
        const existing = byKey.get(key);
        if (!existing || (row.gp ?? 0) > (existing.gp ?? 0)) {
            byKey.set(key, row);
        }
    }
    return Array.from(byKey.values()).sort((a, b) =>
        (a.season - b.season) ||
        ((a.playoffs ? 1 : 0) - (b.playoffs ? 1 : 0)) ||
        ((a.tid ?? 0) - (b.tid ?? 0))
    );
};
const mergeSeasonAwards = (primaryAwards: any[] | undefined, historyAwards: any[] | undefined) => {
    const merged = [...(primaryAwards ?? []), ...(historyAwards ?? [])];
    const seen = new Set<string>();
    return merged.filter(award => {
        const key = `${award?.season ?? 0}|${award?.type ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
const mergeTransactions = (primaryTransactions: any[] | undefined, historyTransactions: any[] | undefined) => {
    const merged = [...(primaryTransactions ?? []), ...(historyTransactions ?? [])];
    const seen = new Set<string>();
    return merged.filter(tx => {
        const key = `${tx?.season ?? 0}|${tx?.tid ?? -999}|${tx?.type ?? ''}|${tx?.phase ?? ''}|${tx?.pickNum ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
const mergeMainRosterCareer = (player: any, legacyMainRosterPlayer?: any) => {
    if (!legacyMainRosterPlayer) return player;
    return {
        ...legacyMainRosterPlayer,
        ...player,
        born: player.born ?? legacyMainRosterPlayer.born,
        college: player.college ?? legacyMainRosterPlayer.college,
        draft: player.draft ?? legacyMainRosterPlayer.draft,
        awards: mergeSeasonAwards(player.awards, legacyMainRosterPlayer.awards),
        transactions: mergeTransactions(player.transactions, legacyMainRosterPlayer.transactions),
        stats: mergePlayerStats(player.stats, legacyMainRosterPlayer.stats),
    };
};
export const handleStartGame = async (payload: StartGamePayload): Promise<Partial<GameState>> => {
    const { name: commissionerName } = payload;
    const isFictional = payload.leagueType === 'fictional';
    const isEuropeModded = payload.leagueType === 'modded' && payload.moddedLeagueBase === 'europe';
    const isPbaModded = payload.leagueType === 'modded' && payload.moddedLeagueBase === 'philippines';
    const isSpainEurope = isEuropeModded && payload.europeMarket === 'spain';
    const initialLeagueStats = {
        ...INITIAL_LEAGUE_STATS,
        ...(isSpainEurope ? EURO_ISOLATED_DEFAULTS : {}),
        ...(isPbaModded ? PBA_ISOLATED_DEFAULTS : {}),
        mediaRights: DEFAULT_MEDIA_RIGHTS,
        draftType: isEuropeModded ? 'no_draft' : INITIAL_LEAGUE_STATS.draftType,
        tradableDraftPickSeasons: isEuropeModded ? 0 : INITIAL_LEAGUE_STATS.tradableDraftPickSeasons,
        stepienRuleEnabled: isEuropeModded ? false : INITIAL_LEAGUE_STATS.stepienRuleEnabled,
        rookieScaleType: isEuropeModded ? 'none' : INITIAL_LEAGUE_STATS.rookieScaleType,
    };
    const nameDataPromise = loadNameData();
    let teams: any[], rawNbaPlayers: any[], draftPicks: DraftPick[];
    let fictionalHistoricalAwards: any[] = [];
    if (isFictional) {
        const fic = generateFictionalLeague(INITIAL_LEAGUE_STATS.year, payload.fictionalLeagueSeed);
        teams = fic.teams;
        rawNbaPlayers = fic.players;
        draftPicks = [];
        fictionalHistoricalAwards = fic.historicalAwards;
    } else {
        const data = await getRosterData(2025, 'Opening Week');
        teams = data.teams;
        rawNbaPlayers = data.players;
        draftPicks = data.draftPicks;
    }
    const historicalAwardsData = isFictional
        ? fictionalHistoricalAwards
        : isPbaModded
          ? buildPbaHistoricalAwards(initialLeagueStats.year)
          : await getHistoricalAwards();
    const [
        { players: euroPlayers,    teams: euroTeams },
        { players: wnbaPlayers,    teams: wnbaTeams },
        { players: pbaPlayers,     teams: pbaTeams },
        { players: bleaguePlayers, teams: bleagueTeams },
        { players: endesaPlayers,  teams: endesaTeams },
        { players: gleaguePlayers, teams: gleagueTeams },
        { players: chinaPlayers,   teams: chinaTeams },
        { players: nblAusPlayers,  teams: nblAusTeams },
    ] = isFictional
        ? (() => {
            let t = (payload.fictionalLeagueSeed ?? Date.now()) >>> 0;
            const rng = () => {
                t += 0x6D2B79F5;
                let r = Math.imul(t ^ (t >>> 15), 1 | t);
                r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
                return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
            };
            const ex = generateFictionalExternalLeagues(INITIAL_LEAGUE_STATS.year, rng);
            return [ex.euroleague, ex.wnba, ex.pba, ex.bleague, ex.endesa, ex.gleague, ex.chinaCBA, ex.nblAus];
          })()
        : await Promise.all([
            fetchEuroleagueRoster(),
            fetchWNBARoster(),
            fetchPBARoster(getPBARosterEconomyConfig(
                isPbaModded ? initialLeagueStats : INITIAL_LEAGUE_STATS,
                isPbaModded ? 'pba_isolated' : 'external',
            )),
            fetchBLeagueRoster(),
            fetchEndesaRoster(),
            fetchGLeagueRoster(),
            fetchChinaCBARoster(),
            fetchNBLAustraliaRoster(),
        ]);
    const normName = (name: string) =>
        name.toLowerCase()
            .replace(/\./g, '')
            .replace(/\b(jr|sr|ii|iii|iv)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    const rawNbaByName = new Map<string, any>();
    rawNbaPlayers.forEach(player => {
        const key = normName(player.name);
        const existing = rawNbaByName.get(key);
        const existingScore = (existing?.stats?.length ?? 0) + (existing?.awards?.length ?? 0);
        const incomingScore = (player?.stats?.length ?? 0) + (player?.awards?.length ?? 0);
        if (!existing || incomingScore > existingScore) rawNbaByName.set(key, player);
    });
    const euroNames = new Set(euroPlayers.map(p => normName(p.name)));
    const uniqueEuroPlayers = euroPlayers
        .map(p => mergeMainRosterCareer(
            { ...p, status: p.status || 'Euroleague' as const },
            rawNbaByName.get(normName(p.name)),
        ));
    const externalNames = new Set([
        ...uniqueEuroPlayers.map(p => normName(p.name)),
        ...wnbaPlayers.map(p => normName(p.name)),
        ...pbaPlayers.map(p => normName(p.name)),
        ...bleaguePlayers.map(p => normName(p.name)),
        ...chinaPlayers.map(p => normName(p.name)),
        ...nblAusPlayers.map(p => normName(p.name)),
    ]);
    const nbaPlayers = rawNbaPlayers.filter(p => {
        if (externalNames.has(normName(p.name))) return false;
        if (['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')) return false;
        return true;
    });
    const existingNbaNames = new Set(nbaPlayers.map(p => normName(p.name)));
    const endesaTeamsByClub = new Map(endesaTeams.map(team => [normalizeClubKey(team.region, team.name), team] as const));
    const clubAliasMap: Record<number, number> = {};
    const mergedEuroTeamTids = new Set<number>();
    if (isSpainEurope) {
        euroTeams.forEach(team => {
            const canonicalTeam = endesaTeamsByClub.get(normalizeClubKey(team.region, team.name));
            if (!canonicalTeam) return;
            clubAliasMap[team.tid] = canonicalTeam.tid;
            mergedEuroTeamTids.add(team.tid);
        });
    }
    const uniqueGLeaguePlayers = gleaguePlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => mergeMainRosterCareer(
            { ...p, status: 'G-League' as const },
            rawNbaByName.get(normName(p.name)),
        ));
    const filteredEuroTeams = isSpainEurope
        ? euroTeams.filter(team => !mergedEuroTeamTids.has(team.tid))
        : euroTeams;
    const shadowedEndesaClubTids = new Set(Object.values(clubAliasMap));
    const uniqueEndesaPlayers = endesaPlayers
        .filter(p =>
            (!isSpainEurope || !shadowedEndesaClubTids.has(p.tid)) &&
            !existingNbaNames.has(normName(p.name)) &&
            (!isSpainEurope || !euroNames.has(normName(p.name)))
        )
        .map(p => mergeMainRosterCareer(
            { ...p, status: 'Endesa' as const },
            rawNbaByName.get(normName(p.name)),
        ));
    const uniquePBAPlayers = pbaPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => mergeMainRosterCareer(
            { ...p, status: p.status || 'PBA' as const },
            rawNbaByName.get(normName(p.name)),
        ));
    const uniqueBLeaguePlayers = bleaguePlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => mergeMainRosterCareer(
            { ...p, status: p.status || 'B-League' as const },
            rawNbaByName.get(normName(p.name)),
        ));
    const uniqueChinaPlayers = chinaPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => mergeMainRosterCareer(
            { ...p, status: 'China CBA' as const },
            rawNbaByName.get(normName(p.name)),
        ));
    const uniqueNBLAusPlayers = nblAusPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => mergeMainRosterCareer(
            { ...p, status: 'NBL Australia' as const },
            rawNbaByName.get(normName(p.name)),
        ));
    const players = [
        ...nbaPlayers,
        ...uniqueEuroPlayers.map(p => ({
            ...p,
            tid: clubAliasMap[p.tid] ?? p.tid,
        })),
        ...uniquePBAPlayers,
        ...uniqueBLeaguePlayers,
        ...uniqueEndesaPlayers,
        ...uniqueGLeaguePlayers,
        ...wnbaPlayers,
        ...uniqueChinaPlayers,
        ...uniqueNBLAusPlayers,
    ];
    const startYear = INITIAL_LEAGUE_STATS.year;
    const salaryCap = INITIAL_LEAGUE_STATS.salaryCap;
    const EXTERNAL = new Set(['Euroleague', 'Endesa', 'PBA', 'B-League', 'G-League', 'China CBA', 'NBL Australia']);
    for (let i = 0; i < players.length; i++) {
        const p: any = players[i];
        if (!EXTERNAL.has(p.status)) continue;
        const hasAmount = p.contract?.amount && p.contract.amount > 0;
        const hasExp    = typeof p.contract?.exp === 'number' && p.contract.exp >= startYear;
        if (hasAmount && hasExp) continue;
        const scale = EXTERNAL_SALARY_SCALE[p.status];
        if (!scale) continue;
        const lastR = p.ratings?.[p.ratings.length - 1];
        const hgt   = lastR?.hgt ?? 50;
        const k2    = convertTo2KRating(p.overallRating ?? lastR?.ovr ?? 60, hgt, lastR?.tp);
        const ovrNorm = Math.min(1, Math.max(0, (k2 - 55) / 30));
        const salaryUSD = Math.round(salaryCap * (scale.minPct + ovrNorm * (scale.maxPct - scale.minPct)));
        const years = k2 >= 78 ? 3 : k2 >= 70 ? 2 : 1;
        const expYear = startYear + years - 1;
        let seed = 0;
        for (let ci = 0; ci < (p.internalId ?? '').length; ci++) seed += p.internalId.charCodeAt(ci);
        const offset = (seed % 3); // 0, 1, or 2 extra seasons
        const finalExp = expYear + offset;
        const contractYears = Array.from({ length: finalExp - startYear + 1 }).map((_, yi) => {
            const season = `${startYear + yi - 1}-${String(startYear + yi).slice(-2)}`;
            const escalated = Math.round(salaryUSD * Math.pow(1.04, yi));
            return { season, guaranteed: escalated, option: '' };
        });
        players[i] = {
            ...p,
            contract: {
                ...(p.contract ?? {}),
                amount: Math.round(salaryUSD / 1_000), // BBGM thousands
                exp: finalExp,
            },
            contractYears,
        } as any;
    }
    const initSeasonStr = `${startYear - 1}-${String(startYear).slice(-2)}`;
    const SANE_GUARANTEED_USD_INIT = 250_000_000;
    const SANE_AMOUNT_THOUSANDS_INIT = 250_000;
    for (let i = 0; i < players.length; i++) {
        const p: any = players[i];
        if (!p.contract || !Array.isArray(p.contractYears)) continue;
        const entry = p.contractYears.find((cy: any) => cy.season === initSeasonStr);
        if (!entry || entry.guaranteed <= 0 || entry.guaranteed > SANE_GUARANTEED_USD_INIT) continue;
        const synced = Math.round(entry.guaranteed / 1000);
        if (synced <= 0 || synced > SANE_AMOUNT_THOUSANDS_INIT) continue;
        if (synced === p.contract.amount) continue;
        players[i] = { ...p, contract: { ...p.contract, amount: synced } };
    }
    const initialNonNBATeams = [...filteredEuroTeams, ...pbaTeams, ...wnbaTeams, ...bleagueTeams, ...endesaTeams, ...gleagueTeams, ...chinaTeams, ...nblAusTeams];
    const { additions: initialExternalFillers } = enforceExternalMinRoster({
        players,
        nonNBATeams: initialNonNBATeams,
        leagueStats: {
            ...INITIAL_LEAGUE_STATS,
            mediaRights: DEFAULT_MEDIA_RIGHTS,
        } as any,
    } as any, startYear);
    const allPlayersBase = initialExternalFillers.length > 0
        ? [...players, ...initialExternalFillers]
        : players;
    const pbaDraftFill = isPbaModded
        ? ensureDraftClasses(
            allPlayersBase as any,
            startYear,
            initialLeagueStats.draftEligibilityRule,
            'regen_pack',
            {
                collegePool: buildPbaCollegePoolFromSource(allPlayersBase as any),
                nationalityOverride: 'Philippines',
                forceCollegePath: true,
            },
          )
        : { additions: [], generatedByYear: {} };
    const playersWithPbaDraftProspects = pbaDraftFill.additions.length > 0
        ? [...allPlayersBase, ...pbaDraftFill.additions]
        : allPlayersBase;
    const tunedPlayersWithPbaDraftProspects = isPbaModded
        ? tunePbaDraftProspects(playersWithPbaDraftProspects as any, startYear, initialLeagueStats)
        : playersWithPbaDraftProspects;
    const allPlayers = isPbaModded ? applyPbaAwardsToPlayers(tunedPlayersWithPbaDraftProspects, historicalAwardsData) : tunedPlayersWithPbaDraftProspects;
    if (!isPbaModded) {
      import('../../services/draftScoutingGist')
        .then(m => m.prefetchDraftScouting(INITIAL_LEAGUE_STATS.year))
        .catch(() => {});
    }
    nameDataPromise.catch(() => {}); // fire-and-forget; errors tolerable
    if (allPlayers.some(p => p.name.toLowerCase() === 'devin booker')) {
        console.log("🏀 DEV1N B00K3R 1S L0AD3D! 🏀");
    }
    const emptyStaff = { owners: [], gms: [], coaches: [], leagueOffice: [] };
    const schedule: any[] = [];
    const startDateFormatted = getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    let initialContent: any = { newEmails: [], newNews: [], newSocialPosts: [] };
    if (!payload.skipLLM) {
        initialContent = await generateInitialContent(startDateFormatted, commissionerName, allPlayers, teams, emptyStaff);
    } else {
        const isGM = payload.gameMode === 'gm';
        const userTeam = isGM && typeof payload.userTeamId === 'number'
            ? teams.find(t => t.id === payload.userTeamId)
            : undefined;
        const commissionerDisplayName = resolveCommissionerDisplayName(commissionerName);
        const leagueName = isFictional ? 'The League' : 'NBA';
        const teamLabel = resolveTeamNewsObject(userTeam?.name);
        const teamHeadlineLabel = resolveTeamNewsSubject(userTeam?.name, leagueName);
        const officialHandle = isFictional ? 'TheLeagueOfficial' : 'nba';
        const officialAuthor = isFictional ? 'The League' : 'NBA';
        initialContent = {
            newEmails: [{
                sender: isGM ? `${userTeam?.name ?? 'Your Team'} Front Office` : 'League Office',
                senderRole: isGM ? 'Owner' : 'Operations',
                subject: isGM ? 'Welcome Aboard' : 'Schedule Generation Approaching',
                body: isGM
                    ? `${commissionerDisplayName}, welcome to ${teamLabel}. We're signing you to a five-year contract as General Manager. Build us something special.`
                    : `Commissioner ${commissionerDisplayName}, the league schedule will be generated on August 14. You have until then to set Christmas Day matchups, Global Games, and International Preseason games.`,
                playerPortraitUrl: userTeam?.logoUrl ?? 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png',
            }],
            newNews: [{
                headline: isGM
                    ? `${teamHeadlineLabel} Hires ${commissionerDisplayName} as General Manager`
                    : 'League Awaits Schedule Release',
                content: isGM
                    ? `${teamHeadlineLabel} has named ${commissionerDisplayName} its new General Manager on a five-year contract. The front office cited ${commissionerDisplayName === 'the new front-office lead' ? 'the hire’s' : 'their'} vision for roster construction and player development.`
                    : `With the schedule release set for August 14, fans and teams are eagerly anticipating the announcement of Christmas Day and Global Games. Commissioner ${commissionerDisplayName} has officially taken office.`,
                type: 'league',
            }],
            newSocialPosts: [{
                author: officialAuthor,
                handle: officialHandle,
                content: isGM
                    ? `BREAKING: ${teamHeadlineLabel} has hired ${commissionerDisplayName} as its new General Manager. Five-year contract. 📝`
                    : `Welcome to the new era of ${leagueName}. Commissioner ${commissionerDisplayName} is officially on the job! 🏀`,
                source: 'TwitterX',
            }],
        };
    }
    const initialInbox = (initialContent.newEmails || []).map((e: any, i: number) => {
        let teamLogoUrl = e.teamLogoUrl;
        if (!teamLogoUrl) {
            const team = teams.find(t =>
                (e.sender && e.sender.toLowerCase().includes(t.name.toLowerCase())) ||
                (e.senderRole && e.senderRole.toLowerCase().includes(t.name.toLowerCase())) ||
                (e.organization && e.organization.toLowerCase().includes(t.name.toLowerCase()))
            );
            if (team) teamLogoUrl = team.logoUrl;
        }
        return {
            ...e,
            id: `init-email-${i}`,
            read: false,
            replied: false,
            date: startDateFormatted,
            teamLogoUrl
        };
    });
    const initialNews = (initialContent.newNews || []).map((n: any, i: number) => ({
        ...n,
        id: `init-news-${i}`,
        date: startDateFormatted,
        isNew: true
    }));
    const initialSocial = (initialContent.newSocialPosts || []).map((s: any, i: number) => {
        const engagement = calculateSocialEngagement(s.handle, s.content);
        return {
            ...s,
            id: `init-social-${i}`,
            date: startDateFormatted,
            likes: engagement.likes,
            retweets: engagement.retweets,
        };
    });
    const initialHistoricalPoint: HistoricalStatPoint = {
        date: startDateFormatted,
        publicApproval: 48,
        ownerApproval: 55,
        playerApproval: 45,
        legacy: 0,
        revenue: INITIAL_LEAGUE_STATS.revenue,
        viewership: INITIAL_LEAGUE_STATS.viewership,
    };
    console.log("=== ROSTER INITIALIZATION DEBUG ===");
    console.log(`NBA: ${nbaPlayers.length} players, ${teams.length} teams`);
    console.log(`WNBA: ${wnbaPlayers.length} players, ${wnbaTeams.length} teams`);
    console.log(`Euroleague: ${euroPlayers.length} players, ${filteredEuroTeams.length} teams`);
    console.log(`PBA: ${pbaPlayers.length} players, ${pbaTeams.length} teams`);
    console.log(`B-League: ${bleaguePlayers.length} players, ${bleagueTeams.length} teams`);
    console.log(`G-League: ${gleaguePlayers.length} players, ${gleagueTeams.length} teams`);
    console.log(`Endesa: ${uniqueEndesaPlayers.length} players, ${endesaTeams.length} teams`);
    console.log(`China CBA: ${chinaPlayers.length} players, ${chinaTeams.length} teams`);
    console.log(`NBL Australia: ${nblAusPlayers.length} players, ${nblAusTeams.length} teams`);
    console.log(`Generated External Fillers: ${initialExternalFillers.length}`);
    console.log(`Total Players: ${allPlayers.length}`);
    console.log("====================================");
    const initialAllStar = null;
    const nbaNBATeams = teams.filter((t: any) => t.id >= 0 && t.id < 100);
    const initYear = INITIAL_LEAGUE_STATS.year;
    const initWindowSize = INITIAL_LEAGUE_STATS.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
    const initialDraftPicks = isEuropeModded
        ? []
        : (() => {
            const withNba = generateFuturePicks(draftPicks, nbaNBATeams as any, initYear, initWindowSize);
            if (!isPbaModded) return withNba;
            const pbaTeamIds = (initialNonNBATeams ?? []).filter((team: any) => team.league === 'PBA').map((team: any) => team.tid);
            return generateFuturePicksForTeamIds(withNba, pbaTeamIds, initYear, initWindowSize, 2);
          })();
    let initialStaff: any = null;
    if (isFictional) {
        const nameDataResolved = await nameDataPromise;
        const fictionalRefs = generateFictionalReferees(nameDataResolved, 36);
        setRefereeData(fictionalRefs);
        initialStaff = { ...generateFictionalStaff(teams, nameDataResolved), referees: fictionalRefs };
    }
    const statePatch: Partial<GameState> = {
        commissionerName,
        teams,
        nonNBATeams: initialNonNBATeams,
        clubAliasMap,
        activeCompetitions: isSpainEurope ? SPAIN_COMPETITIONS : isPbaModded ? PBA_COMPETITIONS : [],
        players: allPlayers,
        draftPicks: initialDraftPicks,
        staff: initialStaff,
        schedule,
        inbox: initialInbox,
        news: initialNews,
        socialFeed: initialSocial,
        historicalStats: [initialHistoricalPoint],
        historicalAwards: (() => {
            if (isPbaModded) {
                const key = (a: any) => `${a.season}-${a.type}-${String(a.name ?? '')}-${String(a.team ?? '')}-${String(a.conference ?? '')}`;
                const seen = new Set<string>();
                return historicalAwardsData.filter((a: any) => {
                    const k = key(a);
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
            }
            const fromSeasons: any[] = [];
            for (const team of teams as any[]) {
                for (const s of team.seasons ?? []) {
                    if (s.playoffRoundsWon === 4) {
                        fromSeasons.push({ season: s.season, type: 'Champion', name: team.name, tid: team.id });
                    } else if (s.playoffRoundsWon === 3) {
                        fromSeasons.push({ season: s.season, type: 'Runner Up', name: team.name, tid: team.id });
                    }
                }
            }
            const key = (a: any) => `${a.season}-${a.tid}-${a.type}`;
            const seen = new Set(fromSeasons.map(key));
            const merged = [...fromSeasons];
            for (const a of historicalAwardsData) {
                if (!seen.has(key(a))) merged.push(a);
            }
            return merged;
        })(),
        followedHandles: isFictional
            ? ['TheLeagueOfficial', 'KowalskiESPN', 'TariqHassan', 'statmuse']
            : ['nba', 'wojespn', 'ShamsCharania', 'statmuse'],
        history: [{ text: `${commissionerName} took office as the new ${isFictional ? 'League' : 'NBA'} Commissioner.`, date: startDateFormatted || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), type: 'League Event' } as any],
        isDataLoaded: true,
        isProcessing: false,
        date: startDateFormatted,
        day: 1,
        saveId: `nba_commish_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        gameMode: payload.gameMode ?? 'commissioner',
        userTeamId: payload.userTeamId,
        leagueType: payload.leagueType ?? 'modded',
        moddedLeagueBase: payload.leagueType === 'modded' ? (payload.moddedLeagueBase ?? 'nba') : undefined,
        europeMarket: payload.leagueType === 'modded' ? payload.europeMarket : undefined,
        allStar: initialAllStar as any,
        leagueStats: {
            ...initialLeagueStats,
        },
    };
    const defaultSimStart = getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year).toISOString().slice(0, 10);
    if (payload.jumpRequired && payload.startDate && payload.startDate > defaultSimStart) {
        const { runLazySim } = await import('../../services/logic/lazySimRunner');
        const { initialState } = await import('../initialState');
        const fullInitialState = {
            ...initialState,
            ...statePatch,
        } as GameState;
        const lazyResult = await runLazySim(
            fullInitialState,
            payload.startDate,
            payload.onProgress,
            { assistantGM: payload.assistantGM ?? false, stopBefore: true }
        );
        return {
            ...lazyResult.state,
            isProcessing: false,
            isDataLoaded: true,
        };
    }
    return statePatch;
};
