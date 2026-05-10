import { GameState, HistoricalStatPoint, NBAPlayer as Player, DraftPick, LazySimProgress } from '../../types';
import { generateInitialContent } from '../../services/llm/llm';
import { getRosterData, getHistoricalAwards } from '../../services/rosterService';
import { generateFictionalLeague } from '../../services/fictionalLeagueGenerator';
import { generateFictionalStaff, generateFictionalReferees } from '../../services/fictionalStaffGenerator';
import { setRefereeData } from '../../data/photos/referees';
import type { LeagueType, ModdedLeagueBase, EuropeMarket } from '../../components/setup/LeagueTypeSelector';
import { EURO_ISOLATED_DEFAULTS, INITIAL_LEAGUE_STATS } from '../../constants';
import { getSeasonSimStartDate } from '../../utils/dateUtils';
import { DEFAULT_MEDIA_RIGHTS } from '../../utils/broadcastingUtils';
import { fetchEuroleagueRoster, fetchWNBARoster, fetchPBARoster, fetchBLeagueRoster, fetchGLeagueRoster, fetchEndesaRoster, fetchChinaCBARoster, fetchNBLAustraliaRoster } from '../../services/externalRosterService';
import { generateFictionalExternalLeagues } from '../../services/fictionalExternalLeagues';
import { EXTERNAL_SALARY_SCALE } from '../../constants';
import { convertTo2KRating } from '../../utils/helpers';
import { loadNameData } from '../../data/nameDataFetcher';
import { enforceExternalMinRoster } from '../../services/externalLeagueSustainer';
import { SPAIN_COMPETITIONS } from '../../data/templates/spain/competitions';

import { calculateSocialEngagement } from '../../utils/helpers';
import { generateFuturePicks, DEFAULT_TRADABLE_PICK_SEASONS } from '../../services/draft/DraftPickGenerator';

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

export const handleStartGame = async (payload: StartGamePayload): Promise<Partial<GameState>> => {
    const { name: commissionerName } = payload;
    const isFictional = payload.leagueType === 'fictional';
    const isEuropeModded = payload.leagueType === 'modded' && payload.moddedLeagueBase === 'europe';
    const isSpainEurope = isEuropeModded && payload.europeMarket === 'spain';
    // Kick off name-data fetch early — it runs in parallel with roster loads and
    // is done by the time we need to synthesize the first draft-class top-up.
    const nameDataPromise = loadNameData();

    // Fictional path: generate locally, skip every network roster call. External
    // leagues stay empty — fictional mode is NBA-only.
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

    const historicalAwardsData = isFictional ? fictionalHistoricalAwards : await getHistoricalAwards();

    // External rosters — fictional mode generates 8 fake leagues locally; otherwise fetch.
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
            // Seeded RNG so the same fictionalLeagueSeed yields the same external rosters.
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
            fetchPBARoster(),
            fetchBLeagueRoster(),
            fetchEndesaRoster(),
            fetchGLeagueRoster(),
            fetchChinaCBARoster(),
            fetchNBLAustraliaRoster(),
        ]);

    // Normalize name for dedup: lowercase + strip dots (handles "L.J." vs "LJ", "Jr." vs "Jr")
    // Also strip generational suffixes so "Nick Smith Jr." matches "Nick Smith"
    const normName = (name: string) =>
        name.toLowerCase()
            .replace(/\./g, '')
            .replace(/\b(jr|sr|ii|iii|iv)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

    // Euroleague beats Endesa for overlapping players (Real Madrid, Barcelona, etc.)
    const euroNames = new Set(euroPlayers.map(p => normName(p.name)));
    const uniqueEuroPlayers = euroPlayers
        .map(p => ({ ...p, status: p.status || 'Euroleague' as const }));

    // Euroleague/PBA/B-League names filter raw NBA data (they're true non-NBA players).
    // G-League and Endesa are NOT included here — NBA is always the source of truth for those.
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

    // G-League: NBA takes priority — drop any G-League player whose name is already in NBA
    // Uses normName so "L.J. Cryer" matches "LJ Cryer" etc.
    const uniqueGLeaguePlayers = gleaguePlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: 'G-League' as const }));

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
        .map(p => ({ ...p, status: 'Endesa' as const }));

    const uniquePBAPlayers = pbaPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: p.status || 'PBA' as const }));

    const uniqueBLeaguePlayers = bleaguePlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: p.status || 'B-League' as const }));

    const uniqueChinaPlayers = chinaPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: 'China CBA' as const }));

    const uniqueNBLAusPlayers = nblAusPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: 'NBL Australia' as const }));

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

    // Synthesize contracts for external-league players whose source gist didn't provide one.
    // Without this, Euroleague/PBA/B-League/etc. guys have no contract.exp → never become FAs,
    // transaction feed stays empty for those leagues, and PlayerBioContractTab shows blank.
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

        // Seeded year-offset so not every player expires the same season.
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

    // Sync contract.amount to the active sim season from contractYears[].
    // getRosterData(2025, ...) pins contract.amount to the 2024-25 entry, but
    // INITIAL_LEAGUE_STATS.year = 2026 means the sim starts in 2025-26 (Aug 2025 =
    // new league year). Without this resync, every post-Jul 1 trade in Year 1 uses
    // last season's salary until the Jun 30 2026 rollover. Mirrors the LOAD_GAME
    // sync in GameContext so fresh-start and load-save behave identically.
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
    const allPlayers = initialExternalFillers.length > 0
        ? [...players, ...initialExternalFillers]
        : players;

    // Draft-class top-up runs at rollover only. Prefetch the current-year
    // scouting gist in the background so DraftScoutingView renders instantly on
    // first open instead of showing a "Loading Draft Board..." spinner. Errors
    // are tolerated — DraftScoutingView still has its own lazy fetch path.
    import('../../services/draftScoutingGist')
      .then(m => m.prefetchDraftScouting(INITIAL_LEAGUE_STATS.year))
      .catch(() => {});
    // Name data is still warmed in the background so rollover has it ready.
    nameDataPromise.catch(() => {}); // fire-and-forget; errors tolerable

    if (allPlayers.some(p => p.name.toLowerCase() === 'devin booker')) {
        console.log("🏀 DEV1N B00K3R 1S L0AD3D! 🏀");
    }

    // Staff loaded lazily after game init (see GameContext idle effect)
    const emptyStaff = { owners: [], gms: [], coaches: [], leagueOffice: [] };

    // Schedule is intentionally empty at start — generated on Aug 14 (Schedule Release Day)
    // so the commissioner has Aug 6-13 to configure Christmas, Global Games, and Intl Preseason.
    const schedule: any[] = [];
    const startDateFormatted = getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });

    // Generate Initial Content via AI (based on Aug 6 — the simulation start point)
    let initialContent: any = { newEmails: [], newNews: [], newSocialPosts: [] };
    if (!payload.skipLLM) {
        initialContent = await generateInitialContent(startDateFormatted, commissionerName, allPlayers, teams, emptyStaff);
    } else {
        // Mode-aware welcome content: GM hires get a team-specific "X hired by Y as General Manager" post.
        const isGM = payload.gameMode === 'gm';
        const userTeam = isGM && typeof payload.userTeamId === 'number'
            ? teams.find(t => t.id === payload.userTeamId)
            : undefined;
        const teamLabel = userTeam ? userTeam.name : 'the league';
        const leagueName = isFictional ? 'The League' : 'NBA';
        const officialHandle = isFictional ? 'TheLeagueOfficial' : 'nba';
        const officialAuthor = isFictional ? 'The League' : 'NBA';

        initialContent = {
            newEmails: [{
                sender: isGM ? `${userTeam?.name ?? 'Your Team'} Front Office` : 'League Office',
                senderRole: isGM ? 'Owner' : 'Operations',
                subject: isGM ? 'Welcome Aboard' : 'Schedule Generation Approaching',
                body: isGM
                    ? `${commissionerName}, welcome to the ${teamLabel}. We're signing you to a five-year contract as General Manager. Build us something special.`
                    : `Commissioner ${commissionerName}, the league schedule will be generated on August 14. You have until then to set Christmas Day matchups, Global Games, and International Preseason games.`,
                playerPortraitUrl: userTeam?.logoUrl ?? 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png',
            }],
            newNews: [{
                headline: isGM
                    ? `${userTeam?.name ?? `${leagueName} Team`} Hires ${commissionerName} as General Manager`
                    : 'League Awaits Schedule Release',
                content: isGM
                    ? `The ${teamLabel} have named ${commissionerName} their new General Manager on a five-year contract. The front office cited his vision for roster construction and player development.`
                    : `With the schedule release set for August 14, fans and teams are eagerly anticipating the announcement of Christmas Day and Global Games. Commissioner ${commissionerName} has officially taken office.`,
                type: 'league',
            }],
            newSocialPosts: [{
                author: officialAuthor,
                handle: officialHandle,
                content: isGM
                    ? `BREAKING: The ${teamLabel} have hired ${commissionerName} as their new General Manager. Five-year contract. 📝`
                    : `Welcome to the new era of ${leagueName}. Commissioner ${commissionerName} is officially on the job! 🏀`,
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

    // All-Star Initialization (none needed at Aug 12 — voting hasn't started)
    const initialAllStar = null;

    // Extend draft pick window to cover all tradable future seasons from day 1.
    // BBGM data only includes current + next year; generateFuturePicks adds the rest.
    const nbaNBATeams = teams.filter((t: any) => t.id >= 0 && t.id < 100);
    const initYear = INITIAL_LEAGUE_STATS.year;
    const initWindowSize = INITIAL_LEAGUE_STATS.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
    const initialDraftPicks = isEuropeModded
        ? []
        : generateFuturePicks(draftPicks, nbaNBATeams as any, initYear, initWindowSize);

    // Fictional leagues seed staff + refs locally (skips the modded gist fetch).
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
        activeCompetitions: isSpainEurope ? SPAIN_COMPETITIONS : [],
        players: allPlayers,
        draftPicks: initialDraftPicks,
        staff: initialStaff,
        schedule,
        inbox: initialInbox,
        news: initialNews,
        socialFeed: initialSocial,
        historicalStats: [initialHistoricalPoint],
         historicalAwards: (() => {
            // Seed from team.seasons (playoffRoundsWon===4 = champion) — authoritative source for real-world history
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
            // Merge with any BBGM awards data (dedup by season+tid+type)
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
            ...INITIAL_LEAGUE_STATS,
            ...(isSpainEurope ? EURO_ISOLATED_DEFAULTS : {}),
            mediaRights: DEFAULT_MEDIA_RIGHTS,
            draftType: isEuropeModded ? 'no_draft' : INITIAL_LEAGUE_STATS.draftType,
            tradableDraftPickSeasons: isEuropeModded ? 0 : INITIAL_LEAGUE_STATS.tradableDraftPickSeasons,
            stepienRuleEnabled: isEuropeModded ? false : INITIAL_LEAGUE_STATS.stepienRuleEnabled,
            rookieScaleType: isEuropeModded ? 'none' : INITIAL_LEAGUE_STATS.rookieScaleType,
        },
    };

    // ── Lazy sim: jump to chosen start date ───────────────────────────────────
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
            // stopBefore: true — land on opening night with games unplayed.
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
