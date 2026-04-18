import { ROSTER_URL, EXTRA_RETIRED_PLAYERS_URL, CONTRACTS_URL } from '../constants';
import type { NBAGMRosterData, NBAPlayer as Player, NBATeam as Team, DraftPick, NBAGMPlayer, GamePhase } from '../types';
import JSONParserText from '../utils/JSONParserText';
import { calculatePlayerOverallForYear, calculateTeamStrength } from '../utils/playerRatings';

/**
 * Normalize BBGM stat field names to the game's NBAGMStat field names.
 * alexnoob roster uses short names (orbp, drbp, trbp, astp, stlp, blkp, usgp)
 * while the engine uses camelCase (orbPct, drbPct, rebPct, astPct, stlPct, blkPct, usgPct).
 */
/** Extract a number from either a single number or a single-element array (BBGM stores game highs as arrays). */
const arrFirst = (v: any): number =>
  Array.isArray(v) ? (typeof v[0] === 'number' ? v[0] : 0) : (typeof v === 'number' ? v : 0);

function normalizeBBGMStat(s: any): any {
  return {
    ...s,
    // ── Percentage fields (BBGM short names → game camelCase) ──────────────
    orbPct:  s.orbPct  ?? s.orbp,
    drbPct:  s.drbPct  ?? s.drbp,
    rebPct:  s.rebPct  ?? s.trbp,    // TRB%
    astPct:  s.astPct  ?? s.astp,
    stlPct:  s.stlPct  ?? s.stlp,
    blkPct:  s.blkPct  ?? s.blkp,
    tovPct:  s.tovPct  ?? s.tovp,
    usgPct:  s.usgPct  ?? s.usgp,
    // tsPct may be absent; leave undefined so PlayerBioStatsHistory computes it
    tsPct:   s.tsPct,
    per:     s.per,
    ortg:    s.ortg,
    drtg:    s.drtg,
    obpm:    s.obpm,
    dbpm:    s.dbpm,
    bpm:     s.bpm   ?? ((s.obpm ?? 0) + (s.dbpm ?? 0)),
    ows:     s.ows,
    dws:     s.dws,
    ws:      s.ws    ?? ((s.ows ?? 0) + (s.dws ?? 0)),
    vorp:    s.vorp,
    ewa:     s.ewa,
    dd:      s.dd,
    td:      s.td,
    // ── Game highs: BBGM stores as single-element arrays, flatten to numbers ─
    // Prefixed _gh_ so PlayerBioStatsHistory can read them as fallback
    _ghMin:  arrFirst(s.minMax),
    _ghFgm:  arrFirst(s.fgMax),
    _ghFga:  arrFirst(s.fgaMax),
    _ghTpm:  arrFirst(s.tpMax),
    _ghTpa:  arrFirst(s.tpaMax),
    _ghTwom: arrFirst(s['2pMax']),
    _ghTwoa: arrFirst(s['2paMax']),
    _ghFtm:  arrFirst(s.ftMax),
    _ghFta:  arrFirst(s.ftaMax),
    _ghOrb:  arrFirst(s.orbMax),
    _ghDrb:  arrFirst(s.drbMax),
    _ghTrb:  arrFirst(s.trbMax ?? s.rebMax),
    _ghAst:  arrFirst(s.astMax),
    _ghStl:  arrFirst(s.stlMax),
    _ghBlk:  arrFirst(s.blkMax),
    _ghBa:   arrFirst(s.baMax),
    _ghTov:  arrFirst(s.tovMax),
    _ghPf:   arrFirst(s.pfMax),
    _ghPts:  arrFirst(s.ptsMax),
    _ghPm:   arrFirst(s.pmMax),
    _ghGmSc: arrFirst(s.gmscMax),
  };
}

const findTeamInfoForSeason = (player: NBAGMPlayer, startYear: number, startPhase: GamePhase): { tid: number } => {
    if (startYear === 2025) {
        return { tid: player.tid };
    }

    let finalTid = -1; 

    if (!player.ratings || player.ratings.length === 0) {
        return { tid: -1 };
    }

    const sortedTransactions = (player.transactions || []).sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return (a.phase || 0) - (b.phase || 0);
    });

    const historicalTransactions = sortedTransactions.filter(t => t.season < startYear);

    if (historicalTransactions.length > 0) {
        finalTid = historicalTransactions[historicalTransactions.length - 1].tid;
    } 
    else if (player.draft && player.draft.year && player.draft.year < startYear) {
        finalTid = player.draft.tid;
    } else {
        finalTid = player.tid;
    }
    
    const isPostRegularSeason = 
        startPhase === 'Playoffs (Round 1)' || 
        startPhase === 'Playoffs (Round 2)' || 
        startPhase === 'Conference Finals' || 
        startPhase === 'NBA Finals' || 
        startPhase === 'Offseason' || 
        startPhase === 'Draft' || 
        startPhase === 'Draft Lottery' ||
        startPhase === 'Free Agency';
    if (isPostRegularSeason) {
        const startYearTransactions = sortedTransactions.filter(t => t.season === startYear);
        for (const trans of startYearTransactions) {
            finalTid = trans.tid;
        }
    } else {
        // For Regular Season, we need to check if there are any transactions in the current year
        // If so, the latest one is the current team.
        const startYearTransactions = sortedTransactions.filter(t => t.season === startYear);
        if (startYearTransactions.length > 0) {
             finalTid = startYearTransactions[startYearTransactions.length - 1].tid;
        }
    }

    const latestRatingYear = player.ratings[player.ratings.length - 1].season;
    if (startYear > latestRatingYear + 5) { 
        return { tid: -1 };
    }

    return { tid: finalTid };
};


// ── Contract override helpers ─────────────────────────────────────────────────

type ContractEntry = { season: string; option: string; guaranteed: number };
type ContractsJSON = Record<string, ContractEntry[]>;

/** Normalize a player name for loose matching: lowercase, no periods, no suffixes. */
function normalizeContractName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Overlay real-world contract data from HoopsHype gist onto BBGM-parsed players.
 *
 * Rules (per gist docs):
 *  - Duplicate season rows → use highest guaranteed value
 *  - current season = "${startYear-1}-${String(startYear).slice(-2)}" (e.g. "2025-26" when startYear=2026)
 *  - contract.amount stored in BBGM thousands (55224526 → 55224)
 *  - exp = parseInt(lastSeason.split('-')[0]) + 1  (e.g. "2027-28" → 2028)
 *  - hasPlayerOption / hasTeamOption from the LAST contracted season's option field
 */
function applyContractOverrides(players: Player[], contractsData: ContractsJSON, startYear: number): Player[] {
  const currentSeasonStr = `${startYear - 1}-${String(startYear).slice(-2)}`;

  // Build normalized-name → entries map
  const contractMap = new Map<string, ContractEntry[]>();
  for (const [name, entries] of Object.entries(contractsData)) {
    if (!Array.isArray(entries)) continue;
    const key = normalizeContractName(name);
    // Deduplicate by season: keep LOWEST guaranteed per season.
    // Duplicate rows for the same season are buyout remnants (the inflated number
    // is the pre-buyout salary; the lower number is the actual cap hit after buyout).
    const seasonBest = new Map<string, ContractEntry>();
    for (const e of entries) {
      const prev = seasonBest.get(e.season);
      if (!prev || e.guaranteed < prev.guaranteed) seasonBest.set(e.season, e);
    }
    contractMap.set(key, Array.from(seasonBest.values()).sort((a, b) => a.season.localeCompare(b.season)));
  }

  return players.map(player => {
    const key = normalizeContractName(player.name);
    const entries = contractMap.get(key);
    if (!entries || entries.length === 0) return player;

    // Store ALL contract years for PlayerBioContractTab display (real per-season amounts).
    // If an option year has blank salary (guaranteed===0), estimate from prior year + ~5% escalator.
    const contractYears = entries.map((e, idx) => {
      let guaranteed = e.guaranteed;
      if (guaranteed <= 0 && (e.option === 'Team' || e.option === 'Player')) {
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
      return { season: e.season, guaranteed, option: e.option };
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

    const hasPlayerOption = lastEntry.option === 'Player';
    const hasTeamOption   = lastEntry.option === 'Team';

    return {
      ...player,
      contractYears,  // real per-season amounts for display
      contract: {
        ...(player.contract ?? {}),
        amount: Math.round(currentEntry.guaranteed / 1000), // BBGM thousands
        exp: expYear,
        hasPlayerOption: hasPlayerOption || undefined,
        hasTeamOption:   hasTeamOption   || undefined,
      },
    };
  });
}

type RosterResult = { players: Player[], teams: Team[], teamNameMap: Map<string, Team>, availableYears: number[], draftPicks: DraftPick[] };
let _rosterCache: { key: string; promise: Promise<RosterResult> } | null = null;

/** Kicks off the roster fetch without waiting. Safe to call multiple times — memoized by (year,phase). */
export const prewarmRoster = (startYear: number = 2025, startPhase: GamePhase = 'Opening Week'): Promise<RosterResult> => {
  return getRosterData(startYear, startPhase);
};

export const getRosterData = (startYear: number, startPhase: GamePhase): Promise<RosterResult> => {
    const cacheKey = `${startYear}:${startPhase}`;
    if (_rosterCache && _rosterCache.key === cacheKey) return _rosterCache.promise;
    const promise = new Promise<RosterResult>((resolve, reject) => {
        console.log(`RosterService: Fetching MASTER roster to process for ${startYear}...`);
        
        // Fetch contracts data in parallel
        const contractsPromise = fetch(CONTRACTS_URL)
            .then(res => res.json())
            .catch(() => ({} as ContractsJSON));

        // Fetch extra retired players in parallel
        const extraRetiredPromise = fetch(EXTRA_RETIRED_PLAYERS_URL)
            .then(res => {
                console.log(`RosterService: Extra retired players fetch status: ${res.status}`);
                return res.json();
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
                    const isRetired = p.tid === -3 || (p.retiredYear && p.retiredYear < startYear);
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

        fetch(ROSTER_URL).then(response => {
            if (!response.ok || !response.body) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

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

                        const processedPlayers: Player[] = mergedPlayersRaw
                        .filter(p => {
                            // Don't filter out players if they are future prospects
                            const isProspect = p.draft && p.draft.year > startYear;
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
                                if (p.draft && p.draft.year > startYear) {
                                    // Keep them as a prospect
                                } else if (p.tid === -3) {
                                    // Keep HOF even without ratings (though they usually have them)
                                } else {
                                    return null;
                                }
                            }

                            const teamInfo = findTeamInfoForSeason(p, startYear, startPhase);
                            const isProspect = p.draft && p.draft.year > startYear;
                            const isRetired = p.tid === -3 || (p.retiredYear && p.retiredYear < startYear);
                            
                            // Extract jersey number from latest stats entry
                            let jerseyNumber = undefined;
                            if (p.stats && p.stats.length > 0) {
                                const latestStats = p.stats[p.stats.length - 1];
                                if (latestStats.jerseyNumber) {
                                    jerseyNumber = String(latestStats.jerseyNumber);
                                }
                            }

                            // Detect two-way contracts at initialization — BBGM stores two-way salary as 625 (thousands = $625K)
                            // Use < 800 threshold for grace (some may be slightly above exact 625)
                            // Mark immediately so roster-trim logic doesn't count them against the 15-man standard cap
                            const isTwoWay = !isProspect && !isRetired && (p.contract?.amount ?? 0) > 0 && (p.contract?.amount ?? 9999) < 800 && teamInfo.tid >= 0;
                            return {
                                ...p,
                                name: playerName,
                                contract: p.contract || { amount: 0, exp: startYear - 1 },
                                injury: p.injury || { type: 'Healthy', gamesRemaining: 0 },
                                tid: isProspect ? -1 : (isRetired ? -3 : teamInfo.tid),
                                // STEP 4: Stable ID based on name + birth year (not tid, which changes on trades)
                                // nba-DevinBooker-1996  euro-LukaKrajnc-2001
                                internalId: `${p.tid < 100 ? 'nba' : 'euro'}-${playerName.replace(/\s+/g, '')}-${(p as any).born?.year ?? Math.abs(p.tid)}`,
                                overallRating: calculatePlayerOverallForYear(p, startYear),
                                status: isProspect ? 'Prospect' : (isRetired ? 'Retired' : (teamInfo.tid === -1 ? 'Free Agent' : 'Active')),
                                diedYear: p.diedYear,
                                hof: p.hof,
                                jerseyNumber,
                                twoWay: isTwoWay || undefined,
                                // Normalize BBGM short stat field names → game field names
                                stats: (p.stats || []).map(normalizeBBGMStat),
                            } as any;
                        })
                        .filter((p): p is Player => p !== null);  

                        const activeTeamsData = (data.teams || []).filter(t => 
                            !t.disabled && t.seasons.some((s: any) => s.season === startYear)
                        );
                        const processedTeams: Team[] = activeTeamsData.map(t => {
                            const seasonData = t.seasons.find((s: any) => s.season === startYear)!;
                            return {
                                id: t.tid,
                                name: `${seasonData.region || t.region} ${seasonData.name || t.name}`,
                                abbrev: seasonData.abbrev || t.abbrev,
                                region: seasonData.region || t.region || '',
                                conference: t.cid === 0 ? 'East' : 'West',
                                cid: typeof t.cid === 'number' ? t.cid : (t.cid === 0 ? 0 : 1),
                                did: typeof t.did === 'number' ? t.did : 0,
                                strength: 0,
                                wins: 0,
                                losses: 0,
                                logoUrl: t.imgURLSmall,
                                colors: t.colors,
                                streak: { type: 'W', count: 0 },
                                // Preserved for TeamHistoryView — essential for franchise season records
                                seasons: (t.seasons ?? []).map((s: any) => ({
                                    season: s.season,
                                    won: s.won ?? 0,
                                    lost: s.lost ?? 0,
                                    playoffRoundsWon: s.playoffRoundsWon ?? -1,
                                    imgURLSmall: s.imgURLSmall,
                                })),
                                retiredJerseyNumbers: t.retiredJerseyNumbers ?? [],
                            };
                        });

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

                        const draftPicks = (data.draftPicks || []).filter(p => p.season >= startYear);
                        
                        const contractsData: ContractsJSON = await contractsPromise;
                        const finalPlayers = applyContractOverrides(processedPlayers, contractsData, startYear);
                        console.log(`RosterService: Successfully processed ${finalPlayers.length} players and ${processedTeams.length} teams for the ${startYear} season.`);
                        resolve({ players: finalPlayers, teams: processedTeams, teamNameMap, availableYears, draftPicks });
                    } else {
                       parser.write(decoder.decode(value, { stream: true }));
                       push();
                    }
                }).catch(err => reject(err));
            };
            push();
        }).catch(err => reject(err));
    });
    _rosterCache = { key: cacheKey, promise };
    return promise;
};
export const getHistoricalAwards = async (): Promise<any[]> => {
    try {
        const response = await fetch(ROSTER_URL);
        const data = await response.json();
        // BBGM stores history in the 'awards' property
        return data.awards || [];
    } catch (err) {
        console.warn("RosterService: Failed to fetch historical awards:", err);
        return [];
    }
};  