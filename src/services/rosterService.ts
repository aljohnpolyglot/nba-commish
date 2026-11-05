
import { ROSTER_URL, EXTRA_RETIRED_PLAYERS_URL, CONTRACTS_URL } from '../constants';
import type { NBAGMRosterData, NBAPlayer as Player, NBATeam as Team, DraftPick, NBAGMPlayer, GamePhase } from '../types';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../utils/jerseyUtils';
import JSONParserText from '../utils/JSONParserText';
import { calculatePlayerOverallForYear, calculateTeamStrength } from '../utils/playerRatings';
import { getTeamFullName } from '../utils/teamNames';
import { getHistoricalNbaRosterSource } from '../data/historicalNbaRosterSources';
import { isHistoricalNbaStart } from '../data/historicalNbaSeasons';
import { STATIC_NBA_TEAMS, staticNbaTeamLogo } from '../data/staticNbaTeams';
import {
  applyZengmHistoricalContracts,
  buildZengmHistoricalDraftProspects,
  buildZengmHistoricalRosterResult,
  buildZengmIncomingDraftedPlayers,
} from './zengmHistoricalRoster';
import {
  extractJerseyNumber,
  findTeamInfoForSeason,
  normalizeBBGMStat,
  stampInitialInjury,
} from './rosterServiceHelpers';
import { resolvePersistentPlayerImage } from '../utils/playerImage';
import { hasTwoWayContractMarker, normalizeContractOptionKind } from '../utils/contractTypes';
import { getHistoricalNbaClutchAwards } from '../data/historicalNbaClutchAwards';
import { getHistoricalNbaExtraAwards } from '../data/historicalNbaExtraAwards';
import { assertJsonResponse, readJsonResponse } from './utils/jsonResponse';
import { getExplicitSourceRetiredYear, inferSourceRetirement } from './retirement/sourceRetirement';
import { flattenHistoricalAwards } from './bbgmParser';
import { normalizeModernNbaDivisionAssignments } from '../utils/modernNbaTeamStructure';


// ── Contract override helpers ─────────────────────────────────────────────────

type ContractEntry = { season: string; option?: string; guaranteed: number; type?: string; contractType?: string };
type ContractsJSON = Record<string, ContractEntry[]>;

/** Normalize a player name for loose matching: lowercase, no periods, no suffixes. */
function normalizeContractName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalContractOption(entry: ContractEntry): '' | 'Player' | 'Team' | 'Two-Way' | 'Non-Guaranteed' {
  const kind = normalizeContractOptionKind(entry.option ?? entry.type ?? entry.contractType);
  if (kind === 'player') return 'Player';
  if (kind === 'team') return 'Team';
  if (kind === 'twoWay') return 'Two-Way';
  if (kind === 'nonGuaranteed') return 'Non-Guaranteed';
  return '';
}

const LATEST_LOGO_ABBREV_ALIASES: Record<string, string> = {
  GS: 'GSW',
  SA: 'SAS',
  NYC: 'NYK',
  PHO: 'PHX',
  BRK: 'BKN',
  NJN: 'BKN',
  NOH: 'NOP',
  NOK: 'NOP',
  NOL: 'NOP',
  CHO: 'CHA',
  CHH: 'CHA',
  SEA: 'OKC',
  VAN: 'MEM',
  WSB: 'WAS',
  KCK: 'SAC',
  CIN: 'SAC',
  ROC: 'SAC',
  SDC: 'LAC',
  BUF: 'LAC',
  SYR: 'PHI',
  PHW: 'GSW',
  MPL: 'LAL',
  STL: 'ATL',
};

function latestNbaLogoForAbbrev(abbrev?: string): string | undefined {
  const rawAbbrev = String(abbrev ?? '').toUpperCase();
  const staticAbbrev = LATEST_LOGO_ABBREV_ALIASES[rawAbbrev] ?? rawAbbrev;
  const staticTeam = STATIC_NBA_TEAMS.find(team => team.abbrev === staticAbbrev);
  return staticTeam ? staticNbaTeamLogo(staticTeam) : undefined;
}

function resolveNbaTeamLogo(abbrev: string | undefined, rawLogo?: string): string | undefined {
  const logo = String(rawLogo ?? '').trim();
  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo;
  return latestNbaLogoForAbbrev(abbrev);
}

function buildTeamIdentitySeasons(team: any): Team['identitySeasons'] {
  return (team?.seasons ?? [])
    .map((season: any) => {
      const seasonYear = Number(season?.season);
      if (!Number.isFinite(seasonYear)) return null;
      return {
        season: seasonYear,
        abbrev: season.abbrev ?? team?.abbrev,
        region: season.region ?? team?.region ?? '',
        name: season.name ?? team?.name ?? '',
        imgURL: season.imgURL,
        imgURLSmall: season.imgURLSmall,
        logoUrl: season.logoUrl,
        teamLogoUrl: season.teamLogoUrl,
        colors: season.colors ?? team?.colors,
      };
    })
    .filter((row: any): row is NonNullable<Team['identitySeasons']>[number] => Boolean(row));
}

function inferRawHofInductionYear(player: any): number | undefined {
  const directYear = Number(player?.hofInductionYear ?? 0);
  if (directYear > 0) return directYear;
  const hofAward = (player?.awards ?? []).find((award: any) => {
    const type = String(award?.type ?? '').toLowerCase();
    return type.includes('inducted into the hall of fame') || type === 'hall of fame';
  });
  const awardYear = Number(hofAward?.season ?? 0);
  return awardYear > 0 ? awardYear : undefined;
}

type NormalizedAward = { season: number; type: string };

function normalizeRosterAwardType(rawType: unknown): string {
  const trimmed = String(rawType ?? '')
    .replace(/\([^)]*\)/g, '')
    .replace(/^\s*\d+x\s+/i, '')
    .trim();
  const normalized = trimmed.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  const compact = normalized.replace(/\s+/g, '');
  if (!normalized) return '';
  if (normalized === 'mvp') return 'Most Valuable Player';
  if (normalized === 'dpoy') return 'Defensive Player of the Year';
  if (normalized === 'roy') return 'Rookie of the Year';
  if (normalized === 'smoy') return 'Sixth Man of the Year';
  if (normalized === 'mip') return 'Most Improved Player';
  if (normalized === 'champion' || normalized === 'nba champion' || normalized === 'won championship') return 'Champion';
  if (normalized === 'finals mvp') return 'Finals MVP';
  if (compact === 'allstar') return 'All-Star';
  if (compact === 'allstarmvp') return 'All-Star MVP';
  if (normalized === 'slam dunk contest winner' || normalized === 'slam dunk winner') return 'Slam Dunk Contest Winner';
  if (normalized === 'league scoring leader' || normalized === 'scoring leader' || normalized === 'scoring title') return 'League Scoring Leader';
  if (normalized === 'first team all league') return 'All-NBA First Team';
  if (normalized === 'second team all league') return 'All-NBA Second Team';
  if (normalized === 'third team all league') return 'All-NBA Third Team';
  if (normalized === 'first team all defensive') return 'All-Defensive First Team';
  if (normalized === 'second team all defensive') return 'All-Defensive Second Team';
  return trimmed;
}

function expandAwardYearToken(token: string): number[] {
  const cleaned = token.trim().replace(/[–—]/g, '-');
  const range = cleaned.match(/^(\d{4})\s*-\s*(\d{2,4})$/);
  if (range) {
    const start = Number(range[1]);
    const rawEnd = String(range[2]);
    const end = rawEnd.length === 2 ? Math.floor(start / 100) * 100 + Number(rawEnd) : Number(rawEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 80) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }
  const single = cleaned.match(/\d{4}/);
  return single ? [Number(single[0])] : [];
}

function extractAwardSeasons(rawAward: unknown): number[] {
  if (rawAward && typeof rawAward === 'object') {
    const award = rawAward as any;
    if (Array.isArray(award.seasons)) {
      return award.seasons.flatMap((season: any) => {
        const value = Number(season);
        return Number.isFinite(value) ? [value] : expandAwardYearToken(String(season ?? ''));
      });
    }
    const directSeason = Number(award.season ?? award.year);
    if (Number.isFinite(directSeason)) return [directSeason];
    const rawSeason = award.season ?? award.year;
    if (rawSeason !== undefined && rawSeason !== null) return expandAwardYearToken(String(rawSeason));
  }

  const text = String(rawAward ?? '');
  const match = text.match(/\(([^)]*)\)/);
  if (!match) return [];
  return match[1].split(',').flatMap(expandAwardYearToken);
}

function normalizeRawPlayerAwards(rawAwards: unknown, seasonEndYear: number): NormalizedAward[] | undefined {
  if (!Array.isArray(rawAwards)) return rawAwards as any;
  const awards: NormalizedAward[] = [];
  const seen = new Set<string>();
  for (const rawAward of rawAwards) {
    const rawType = typeof rawAward === 'string'
      ? rawAward
      : (rawAward as any)?.type ?? (rawAward as any)?.award ?? (rawAward as any)?.name;
    const type = normalizeRosterAwardType(rawType);
    if (!type) continue;
    for (const season of extractAwardSeasons(rawAward)) {
      if (!Number.isFinite(season) || season >= seasonEndYear) continue;
      const key = `${season}:${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      awards.push({ season, type });
    }
  }
  return awards.length > 0 ? awards : undefined;
}

/**
 * Overlay real-world contract data from HoopsHype gist onto BBGM-parsed players.
 *
 * Rules (per gist docs):
 *  - Duplicate season rows → use highest guaranteed value
 *  - current season = "${startYear}-${String(startYear + 1).slice(-2)}"
 *  - contract.amount stored in BBGM thousands (55224526 → 55224)
 *  - exp = parseInt(lastSeason.split('-')[0]) + 1  (e.g. "2027-28" → 2028)
 *  - hasPlayerOption / hasTeamOption from the LAST contracted season's option field
 */
function applyContractOverrides(players: Player[], contractsData: ContractsJSON, startYear: number): Player[] {
  const currentSeasonStr = `${startYear}-${String(startYear + 1).slice(-2)}`;

  // Build normalized-name → entries map
  const contractMap = new Map<string, ContractEntry[]>();
  for (const [name, entries] of Object.entries(contractsData)) {
    if (!Array.isArray(entries)) continue;
    const key = normalizeContractName(name);
    const seasonBest = new Map<string, ContractEntry>();
    for (const e of entries) {
      const prev = seasonBest.get(e.season);
      if (!prev) {
        seasonBest.set(e.season, e);
        continue;
      }
      const positiveAmounts = [prev.guaranteed, e.guaranteed].filter(amount => amount > 0);
      const guaranteed = positiveAmounts.length > 0 ? Math.min(...positiveAmounts) : 0;
      const optionSource = canonicalContractOption(e) ? e : prev;
      const amountSource = e.guaranteed === guaranteed ? e : prev;
      seasonBest.set(e.season, {
        ...amountSource,
        guaranteed,
        option: optionSource.option,
        type: optionSource.type,
        contractType: optionSource.contractType,
      });
    }
    contractMap.set(key, Array.from(seasonBest.values()).sort((a, b) => a.season.localeCompare(b.season)));
  }

  return players.map(player => {
    const key = normalizeContractName(player.name);
    const entries = contractMap.get(key);
    if (!entries || entries.length === 0) {
      // No gist match — seed contractYears from contract.amount so the Salaries tab
      // never truncates as the sim advances. Without this, Path B in PlayerBioContractTab
      // renders currentYear→exp, which shrinks to 1 row by the final season.
      const amt = (player as any).contract?.amount;
      const exp = (player as any).contract?.exp;
      if (amt && exp && amt > 0 && exp >= startYear) {
        const salaryUSD = amt * 1_000;
        const fallbackYears = Array.from({ length: exp - startYear + 1 }, (_, i) => {
          const yr = startYear + i;
          return {
            season: `${yr - 1}-${String(yr).slice(-2)}`,
            guaranteed: Math.round(salaryUSD * Math.pow(1.05, i)),
            option: '',
          };
        });
        return { ...player, contractYears: fallbackYears } as any;
      }
      return player;
    }

    // Store ALL contract years for PlayerBioContractTab display (real per-season amounts).
    // If an option year has blank salary (guaranteed===0), estimate from prior year + ~5% escalator.
    const contractYears = entries.map((e, idx) => {
      const option = canonicalContractOption(e);
      let guaranteed = e.guaranteed;
      if (guaranteed <= 0 && (option === 'Team' || option === 'Player')) {
        // Walk backwards to find last known salary, then apply ~5% compounded escalator
        let base = 0;
        let stepsBack = 0;
        for (let j = idx - 1; j >= 0; j--) {
          if (entries[j].guaranteed > 0) { base = entries[j].guaranteed; stepsBack = idx - j; break; }
        }
        if (base > 0) {
          guaranteed = Math.round(base * Math.pow(1.05, stepsBack));
        }
      }
      return { season: e.season, guaranteed, option };
    });

    // Current season salary (for cap engine)
    const currentEntry = entries.find(e => e.season === currentSeasonStr);
    if (!currentEntry || currentEntry.guaranteed <= 0) {
      // No active current-season contract, but still store years for bio display
      return { ...player, contractYears };
    }

    // All seasons from current onward (contract duration for exp computation)
    const futureEntries = entries.filter(e => e.season >= currentSeasonStr);
    if (futureEntries.length === 0) return { ...player, contractYears };

    const lastEntry = futureEntries[futureEntries.length - 1];
    // exp year: first part of last season string + 1  ("2027-28" → 2027+1=2028)
    const expYear = parseInt(lastEntry.season.split('-')[0], 10) + 1;

    const lastOptionKind = normalizeContractOptionKind(lastEntry.option ?? lastEntry.type ?? lastEntry.contractType);
    const currentOptionKind = normalizeContractOptionKind(currentEntry.option ?? currentEntry.type ?? currentEntry.contractType);
    const hasPlayerOption = lastOptionKind === 'player';
    const hasTeamOption = lastOptionKind === 'team';
    const isTwoWay = currentOptionKind === 'twoWay' || futureEntries.some(entry => normalizeContractOptionKind(entry.option ?? entry.type ?? entry.contractType) === 'twoWay');
    const isNonGuaranteed = currentOptionKind === 'nonGuaranteed';

    return {
      ...player,
      contractYears,  // real per-season amounts for display
      twoWay: isTwoWay || (player as any).twoWay || undefined,
      nonGuaranteed: isNonGuaranteed || (player as any).nonGuaranteed || undefined,
      contract: {
        ...(player.contract ?? {}),
        amount: Math.round(currentEntry.guaranteed / 1000), // BBGM thousands
        exp: expYear,
        ...(isTwoWay ? { type: 'TWO_WAY' } : {}),
        hasPlayerOption: hasPlayerOption || undefined,
        hasTeamOption:   hasTeamOption   || undefined,
        // teamOptionExp must match expYear so seasonRollover's teamOptExp !== nextYear guard fires
        teamOptionExp:   hasTeamOption ? expYear : undefined,
      },
    };
  });
}

export type RosterResult = {
  players: Player[];
  teams: Team[];
  teamNameMap: Map<string, Team>;
  availableYears: number[];
  draftPicks: DraftPick[];
  supported: boolean;
};
const ROSTER_CACHE_LIMIT = 3;
const rosterCache = new Map<string, Promise<RosterResult>>();

function cacheRosterPromise(key: string, promise: Promise<RosterResult>): Promise<RosterResult> {
    const cachedPromise = promise.catch(error => {
        rosterCache.delete(key);
        throw error;
    });
    rosterCache.set(key, cachedPromise);
    while (rosterCache.size > ROSTER_CACHE_LIMIT) {
        const oldestKey = rosterCache.keys().next().value;
        if (oldestKey) rosterCache.delete(oldestKey);
    }
    return cachedPromise;
}

/** Kicks off the roster fetch without waiting. Safe to call multiple times — memoized by (year,phase). */
export const prewarmRoster = (startYear: number = 2025, startPhase: GamePhase = 'Opening Week'): Promise<RosterResult> => {
  return getRosterData(startYear, startPhase);
};

const rosterBranchStart = (startYear: number, startPhase: GamePhase, explicit?: string): number | string => {
    if (explicit) return explicit;
    if (startPhase === 'Preseason' || startPhase === 'Training Camp') return `${startYear}-09-01`;
    if (startPhase === 'Opening Week' || startPhase.startsWith('Regular Season')) return `${startYear}-10-01`;
    return startYear;
};

export const getRosterData = (startYear: number, startPhase: GamePhase, branchDate?: string): Promise<RosterResult> => {
    const rosterSource = getHistoricalNbaRosterSource(startYear);
    const branchStart = rosterBranchStart(startYear, startPhase, branchDate);
    const cacheKey = `${startYear}:${startPhase}:${branchStart}:${rosterSource?.url ?? 'zengm-reconstructed'}`;
    const cachedRoster = rosterCache.get(cacheKey);
    if (cachedRoster) {
        rosterCache.delete(cacheKey);
        rosterCache.set(cacheKey, cachedRoster);
        return cachedRoster;
    }
    const contractsPromise = startYear >= 2025
        ? fetch(CONTRACTS_URL)
            .then(res => readJsonResponse<ContractsJSON>(res, 'NBA contract source'))
            .catch(() => ({} as ContractsJSON))
        : Promise.resolve({} as ContractsJSON);
    if (!rosterSource) {
        const reconstructedPromise = Promise.all([
            buildZengmHistoricalRosterResult(startYear, branchStart),
            contractsPromise,
        ]).then(([result, contractsData]) => ({
            ...result,
            players: applyContractOverrides(result.players, contractsData, startYear),
        }));
        return cacheRosterPromise(cacheKey, reconstructedPromise);
    }
    const promise = new Promise<RosterResult>((resolve, reject) => {
        console.log(`RosterService: Fetching ${rosterSource.label} roster to process for ${startYear}...`);
        const seasonEndYear = startYear + 1;
        
        // Fetch extra retired players in parallel
        const extraRetiredPromise = fetch(EXTRA_RETIRED_PLAYERS_URL)
            .then(res => {
                console.log(`RosterService: Extra retired players fetch status: ${res.status}`);
                return readJsonResponse<any>(res, 'NBA extra retired-player source');
            })
            .then(data => {
                console.log("RosterService: Extra retired players data keys:", Object.keys(data));
                const players = data.players || (Array.isArray(data) ? data : []);
                console.log(`RosterService: Received ${players.length} raw extra players from npoint.`);
                
                if (players.length > 0) {
                    console.log("RosterService: First 10 extra players sample:");
                    players.slice(0, 10).forEach(p => {
                        const pName = p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
                        console.log(` - ${pName}: tid=${p.tid}, retiredYear=${p.retiredYear}, diedYear=${p.diedYear}`);
                    });
                }

                const filtered = players.filter((p: any) => {
                    // Only take retired players or HOF
                    const retiredYear = getExplicitSourceRetiredYear(p);
                    const isRetired = p.tid === -3 || (retiredYear !== null && retiredYear <= startYear);
                    // Exclude deceased players
                    const isDeceased = p.diedYear && p.diedYear < startYear;
                    return isRetired && !isDeceased;
                });
                console.log(`RosterService: Filtered down to ${filtered.length} extra retired players.`);
                return filtered;
            })
            .catch(err => {
                console.warn("RosterService: Failed to fetch extra retired players:", err);
                return [];
            });

        let data: NBAGMRosterData;
        const parser = new JSONParserText((parsedJson) => {
            data = parsedJson;
        });

        fetch(rosterSource.url).then(response => {
            assertJsonResponse(response, rosterSource.label);
            if (!response.body) throw new Error(`${rosterSource.label} returned no readable body.`);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let firstContentChunk = true;

            const push = () => {
                reader.read().then(async ({ done, value }) => {
                    if (done) {
                        if (!data) throw new Error("Parsing finished but no data was generated.");

                        const extraRetiredRaw = await extraRetiredPromise;
                        
                        // Create a map of existing players to avoid duplicates
                        const existingPlayerNames = new Set((data.players || []).map(p => {
                            let name = p.name || `${p.firstName || ''} ${p.lastName || ''}`;
                            if (name.toLowerCase().includes('booker')) {
                                console.log(`🏀 DEBUG: NBA Roster has ${name} (tid: ${p.tid}) → will be in existingPlayerNames`);
                            }
                            return name?.toLowerCase();
                        }));

                        // Players that CAN have duplicates: same name but different tid/league
                        const ALLOW_DUPLICATE_NAMES = new Set(['devin booker']);

                        // Merge extra retired players who aren't in the main roster
                        const mergedPlayersRaw = [...(data.players || [])];
                        let mergedCount = 0;
                        extraRetiredRaw.forEach((p: any) => {
                            let name = p.name || `${p.firstName || ''} ${p.lastName || ''}`;
                            const nameLower = name?.toLowerCase();
                            
                            if (name.toLowerCase().includes('booker')) {
                                const inExisting = existingPlayerNames.has(nameLower);
                                const isAllowedDuplicate = ALLOW_DUPLICATE_NAMES.has(nameLower);
                                console.log(`🏀 DEBUG: Extra Retired ${name} (tid: ${p.tid}) → inExisting: ${inExisting}, isAllowedDuplicate: ${isAllowedDuplicate}`);
                            }
                            
                            // STEP 5: If it's Devin Booker, ALWAYS allow him through
                            if (name && (!existingPlayerNames.has(nameLower) || ALLOW_DUPLICATE_NAMES.has(nameLower))) {
                                if (name.toLowerCase().includes('booker')) {
                                    console.log(`✅ DEBUG: MERGING ${name} (tid: ${p.tid}) into roster!`);
                                }
                                mergedPlayersRaw.push(p);
                                mergedCount++;
                            }
                        });
                        console.log(`RosterService: Merged ${mergedCount} new retired players into the main roster.`);
                        const normalizedPlayersRaw = mergedPlayersRaw.map((player: any) => {
                            const sourceRetirement = inferSourceRetirement(player, {
                                branchCutoffYear: startYear,
                                sourceCoverageThrough: startYear,
                            });
                            if (!sourceRetirement) return player;
                            return {
                                ...player,
                                retiredYear: sourceRetirement.retiredYear,
                                sourceRetirement,
                            };
                        });

                        const processedPlayers: Player[] = normalizedPlayersRaw
                        .filter(p => {
                            const draftYear = Number(p.draft?.year ?? 0);
                            if (startYear < 2025 && draftYear > seasonEndYear) return false;

                            // Don't filter out players if they are future prospects (>= catches current-year draft class)
                            const isProspect = p.draft && p.draft.year >= startYear && p.draft.year <= seasonEndYear && p.tid < 0;
                            if (isProspect) return true;
                            
                            // Don't filter out Hall of Famers (tid: -3)
                            if (p.tid === -3) return true;

                            // Only filter if they retired before the current year and aren't HOF
                            if (p.retiredYear && p.retiredYear < startYear && p.tid !== -3) return false;
                            
                            // Exclude deceased players
                            if (p.diedYear && p.diedYear < startYear) return false;

                            return true;
                        }) 
                        .map((p): Player | null => {
                            if (!p) return null;

                            // Handle players with firstName/lastName instead of name
                            let playerName = p.name;
                            if (!playerName && p.firstName && p.lastName) {
                                playerName = `${p.firstName} ${p.lastName}`;
                            }

                            // STEP 3: Ensure the NBA Booker (tid < 100) stays as "Devin Booker"
                            // Only rename to full name if his tid is in the Euroleague range (1000-1999)
                            if (playerName === "Devin Booker" && p.tid >= 1000 && p.tid < 2000) {
                                console.log(`🏀 DEBUG: Renaming main roster Devin Booker (tid: ${p.tid}) → "Devin Rydale Booker"`);
                                playerName = "Devin Rydale Booker";
                            }

                            if (!playerName) {
                                return null;
                            }

                            // If no ratings, but it's a prospect, give them a default rating or calculate from latest
                            if (!p.ratings || p.ratings.length === 0) {
                                if (p.draft && p.draft.year >= startYear && p.tid < 0) {
                                    // Keep them as a prospect
                                } else if (p.tid === -3) {
                                    // Keep HOF even without ratings (though they usually have them)
                                } else {
                                    return null;
                                }
                            }

                            const teamInfo = findTeamInfoForSeason(p, startYear, startPhase);
                            // teamInfo.tid < 0 guards against already-drafted BBGM players being demoted to prospect
                            const isProspect = p.draft && p.draft.year >= startYear && p.draft.year <= seasonEndYear && teamInfo.tid < 0;
                            const explicitRetiredYear = getExplicitSourceRetiredYear(p);
                            const isRetired = !!(p as any).sourceRetirement
                              || (p.tid === -3 && explicitRetiredYear === null && teamInfo.tid < 0);
                            const visibleStats = (p.stats || [])
                                .filter((stat: any) => Number(stat.season ?? seasonEndYear) < seasonEndYear)
                                .map(normalizeBBGMStat);
                            const visibleAwards = normalizeRawPlayerAwards((p as any).awards, seasonEndYear);
                            const rawHofInductionYear = inferRawHofInductionYear(p);
                            const scheduledHofInductionYear = isHistoricalNbaStart(startYear)
                                ? undefined
                                : rawHofInductionYear && rawHofInductionYear >= seasonEndYear
                                    ? rawHofInductionYear
                                    : (p as any).scheduledHofInductionYear;
                            const visibleTransactions = Array.isArray((p as any).transactions)
                                ? (p as any).transactions.filter((transaction: any) => Number(transaction.season ?? startYear) <= startYear)
                                : (p as any).transactions;
                            const ratingHistory = (p.ratings ?? []).filter((rating: any) => Number(rating.season ?? seasonEndYear) <= seasonEndYear);
                            const visibleRatings = ratingHistory.length > 0 || !isProspect ? ratingHistory : p.ratings;
                            const jerseyNumber = extractJerseyNumber({ ...p, stats: visibleStats });

                            const contractAmount = Number(p.contract?.amount ?? 0);
                            const explicitTwoWay = hasTwoWayContractMarker(p as any);
                            const draftInfo = p.draft as (typeof p.draft & { round?: number; pick?: number }) | undefined;
                            const draftYear = Number(draftInfo?.year);
                            const draftRound = Number(draftInfo?.round ?? 0);
                            const draftPick = Number(draftInfo?.pick ?? 0);
                            const recentDraft = Number.isFinite(draftYear) && startYear - draftYear >= 0 && startYear - draftYear < 2;
                            const twoWayDraftPath = draftRound === 2 || (draftRound <= 0 && draftPick <= 0);
                            const inferredTwoWay = startYear >= 2017
                              && recentDraft
                              && twoWayDraftPath
                              && contractAmount > 0
                              && contractAmount <= 1000
                              && !(p as any).nonGuaranteed;
                            const isTwoWay =
                              !isProspect
                              && !isRetired
                              && teamInfo.tid >= 0
                              && (explicitTwoWay || inferredTwoWay);
                            const portraitPlayer = {
                                ...p,
                                name: playerName,
                                srID: p.srID ?? (p as any).slug,
                                slug: (p as any).slug ?? p.srID,
                                status: isProspect ? 'Prospect' : (isRetired ? 'Retired' : (teamInfo.tid === -1 ? 'Free Agent' : 'Active')),
                            } as any;
                            return {
                                ...p,
                                name: playerName,
                                contract: p.contract || { amount: 0, exp: startYear - 1 },
                                injury: stampInitialInjury(p.injury),
                                tid: isProspect ? -2 : (isRetired ? -3 : teamInfo.tid),
                                // STEP 4: Stable ID based on name + birth year (not tid, which changes on trades)
                                // nba-DevinBooker-1996  euro-LukaKrajnc-2001
                                internalId: `${p.tid < 100 ? 'nba' : 'euro'}-${playerName.replace(/\s+/g, '')}-${(p as any).born?.year ?? Math.abs(p.tid)}`,
                                srID: p.srID ?? (p as any).slug,
                                slug: (p as any).slug ?? p.srID,
                                overallRating: calculatePlayerOverallForYear(p, seasonEndYear),
                                status: portraitPlayer.status,
                                diedYear: p.diedYear,
                                hof: p.hof,
                                jerseyNumber,
                                imgURL: resolvePersistentPlayerImage(portraitPlayer),
                                ratings: visibleRatings,
                                awards: visibleAwards,
                                transactions: visibleTransactions,
                                scheduledHofInductionYear,
                                twoWay: isTwoWay || undefined,
                                ...(isTwoWay ? { contract: { ...(p.contract ?? { amount: 0, exp: startYear - 1 }), type: 'TWO_WAY' } } : {}),
                                stats: visibleStats,
                            } as any;
                        })
                        .filter((p): p is Player => p !== null);  

                        const activeTeamsData = (data.teams || [])
                            .filter(team => {
                                const teamId = Number(team?.tid);
                                return team?.disabled !== true && Number.isInteger(teamId) && teamId >= 0;
                            })
                            .map(t => ({
                                team: t,
                                seasonData: t.seasons?.find((s: any) => s.season === seasonEndYear)
                                    ?? t.seasons?.find((s: any) => s.season === startYear)
                                    ?? t,
                            }));
                        const importedTeams: Team[] = activeTeamsData.map(({ team: t, seasonData }) => {
                            const region = seasonData.region || t.region || '';
                            const name = seasonData.name || t.name || '';
                            const abbrev = seasonData.abbrev || t.abbrev;
                            const cid = typeof seasonData.cid === 'number'
                              ? seasonData.cid
                              : typeof t.cid === 'number' ? t.cid : 0;
                            const did = typeof seasonData.did === 'number'
                              ? seasonData.did
                              : typeof t.did === 'number' ? t.did : 0;
                            return {
                                id: t.tid,
                                name: getTeamFullName({ region, name, abbrev }),
                                abbrev,
                                region,
                                conference: cid === 0 ? 'East' : 'West',
                                cid,
                                did,
                                strength: 0,
                                wins: 0,
                                losses: 0,
                                pop: seasonData.pop ?? (t as any).pop ?? 0,
                                logoUrl: resolveNbaTeamLogo(abbrev, seasonData.imgURLSmall ?? t.imgURLSmall ?? t.imgURL),
                                colors: seasonData.colors ?? t.colors,
                                streak: { type: 'W', count: 0 },
                                // Preserved for TeamHistoryView — essential for franchise season records
                                seasons: (t.seasons ?? [])
                                  .filter((s: any) => Number(s.season ?? seasonEndYear) < seasonEndYear)
                                  .map((s: any) => ({
                                    season: s.season,
                                    won: s.won ?? 0,
                                    lost: s.lost ?? 0,
                                    playoffRoundsWon: s.playoffRoundsWon ?? -1,
                                    pop: Number.isFinite(Number(s.pop)) ? Number(s.pop) : undefined,
                                    abbrev: s.abbrev ?? t.abbrev,
                                    region: s.region ?? t.region ?? '',
                                    name: s.name ?? t.name ?? '',
                                    imgURLSmall: s.imgURLSmall,
                                    imgURL: s.imgURL,
                                    logoUrl: s.logoUrl,
                                    teamLogoUrl: s.teamLogoUrl,
                                    colors: s.colors ?? t.colors,
                                  })),
                                identitySeasons: buildTeamIdentitySeasons(t),
                                retiredJerseyNumbers: t.retiredJerseyNumbers ?? [],
                            };
                        });

                        const processedTeams = normalizeModernNbaDivisionAssignments(importedTeams, seasonEndYear);

                        processedTeams.forEach(team => {
                           team.strength = calculateTeamStrength(team.id, processedPlayers);
                        });

                        const teamNameMap = new Map<string, Team>(processedTeams.map(t => [t.name.toLowerCase(), t]));
                        
                        const allSeasons = new Set<number>();
                        data.teams.forEach(team => {
                            if (team.seasons) {
                                team.seasons.forEach((season: any) => allSeasons.add(season.season));
                            }
                        });
                        const availableYears = Array.from(allSeasons).sort((a, b) => b - a);

                        const draftPicks = (data.draftPicks || []).filter(p => p.season >= seasonEndYear);
                        
                        const incomingDraftedPlayers = rosterSource.strategy === 'alexnoob_post_draft_hybrid'
                            ? await buildZengmIncomingDraftedPlayers(startYear, processedTeams, processedPlayers)
                            : [];
                        const incomingIds = new Set(incomingDraftedPlayers.map(player => player.internalId));
                        const playersWithIncomingDrafted = incomingDraftedPlayers.length > 0
                            ? [...processedPlayers.filter(player => !incomingIds.has(player.internalId)), ...incomingDraftedPlayers]
                            : processedPlayers;
                        const zengmDraftProspects = isHistoricalNbaStart(startYear)
                            ? await buildZengmHistoricalDraftProspects(startYear, playersWithIncomingDrafted)
                            : [];
                        const playersWithHistoricalDrafts = zengmDraftProspects.length > 0
                            ? [...playersWithIncomingDrafted, ...zengmDraftProspects]
                            : playersWithIncomingDrafted;
                        const playersWithHistoricalContracts = isHistoricalNbaStart(startYear)
                            ? await applyZengmHistoricalContracts(playersWithHistoricalDrafts, startYear)
                            : playersWithHistoricalDrafts;

                        const contractsData: ContractsJSON = await contractsPromise;
                        const finalPlayers = startYear >= 2025
                            ? applyContractOverrides(playersWithHistoricalContracts, contractsData, startYear)
                            : playersWithHistoricalContracts;

                        // Fill missing jersey numbers (BBGM prospects have no stats yet → extractJerseyNumber → undefined)
                        const retiredByTid = new Map<number, Set<string>>();
                        for (const team of processedTeams) {
                            const nums = new Set<string>();
                            for (const j of (team as any).retiredJerseyNumbers ?? []) {
                                if (j.number != null) nums.add(String(j.number));
                            }
                            retiredByTid.set(team.id, nums);
                        }
                        const takenByTid = new Map<number, Set<string>>();
                        for (const p of finalPlayers) {
                            if ((p as any).tid >= 0 && (p as any).jerseyNumber) {
                                const tid: number = (p as any).tid;
                                if (!takenByTid.has(tid)) takenByTid.set(tid, new Set());
                                takenByTid.get(tid)!.add(String((p as any).jerseyNumber));
                            }
                        }
                        const readyPlayers = finalPlayers.map((p: any) => {
                            if (p.jerseyNumber) return p;
                            const tid: number = p.tid ?? -1;
                            const retired = tid >= 0 ? (retiredByTid.get(tid) ?? new Set<string>()) : new Set<string>();
                            const taken  = tid >= 0 ? (takenByTid.get(tid)  ?? new Set<string>()) : new Set<string>();
                            const num = pickJerseyNumber(new Set([...retired, ...taken]));
                            if (tid >= 0) {
                                if (!takenByTid.has(tid)) takenByTid.set(tid, new Set());
                                takenByTid.get(tid)!.add(num);
                            }
                            return { ...p, jerseyNumber: num };
                        });

                        const normalizedPlayers = normalizeTeamJerseyNumbers(readyPlayers as any, processedTeams as any, startYear, {
                          leagueStartYear: startYear,
                        });

                        console.log(`RosterService: Successfully processed ${normalizedPlayers.length} players and ${processedTeams.length} teams for the ${startYear} season.`);
                        resolve({ players: normalizedPlayers, teams: processedTeams, teamNameMap, availableYears, draftPicks, supported: true });
                    } else {
                       const chunk = decoder.decode(value, { stream: true });
                       if (firstContentChunk && chunk.trimStart()) {
                         firstContentChunk = false;
                         if (chunk.trimStart().startsWith('<')) {
                           throw new Error(`${rosterSource.label} returned the app page instead of JSON. Check the data file path or deployment assets.`);
                         }
                       }
                       parser.write(chunk);
                       push();
                    }
                }).catch(err => reject(err));
            };
            push();
        }).catch(err => reject(err));
    });
    return cacheRosterPromise(cacheKey, promise);
};
export const getHistoricalAwards = async (): Promise<any[]> => {
    const clutchAwards = getHistoricalNbaClutchAwards();
    const extraAwards = getHistoricalNbaExtraAwards();
    try {
        const response = await fetch(ROSTER_URL);
        const data = await readJsonResponse<any>(response, 'NBA historical awards source');
        const raw: any[] = data.awards || [];
        return [...flattenHistoricalAwards(raw, STATIC_NBA_TEAMS), ...clutchAwards, ...extraAwards];
    } catch (err) {
        console.warn("RosterService: Failed to fetch historical awards:", err);
        return [...clutchAwards, ...extraAwards];
    }
};  
