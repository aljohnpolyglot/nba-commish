import { ROSTER_URL, EXTRA_RETIRED_PLAYERS_URL } from '../constants';
import type { NBAGMRosterData, NBAPlayer as Player, NBATeam as Team, DraftPick, NBAGMPlayer, GamePhase } from '../types';
import JSONParserText from '../utils/JSONParserText';
import { calculatePlayerOverallForYear, calculateTeamStrength } from '../utils/playerRatings';

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


export const getRosterData = (startYear: number, startPhase: GamePhase): Promise<{ players: Player[], teams: Team[], teamNameMap: Map<string, Team>, availableYears: number[], draftPicks: DraftPick[] }> => {
    return new Promise((resolve, reject) => {
        console.log(`RosterService: Fetching MASTER roster to process for ${startYear}...`);
        
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
                            let name = p.name;
                            if (!name && p.firstName && p.lastName) name = `${p.firstName} ${p.lastName}`;
                            return name?.toLowerCase();
                        }));

                        // Merge extra retired players who aren't in the main roster
                        const mergedPlayersRaw = [...(data.players || [])];
                        let mergedCount = 0;
                        extraRetiredRaw.forEach((p: any) => {
                            let name = p.name;
                            if (!name && p.firstName && p.lastName) name = `${p.firstName} ${p.lastName}`;
                            if (name && !existingPlayerNames.has(name.toLowerCase())) {
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

                            return {
                                ...p,
                                name: playerName,
                                contract: p.contract || { amount: 0, exp: startYear - 1 },
                                injury: p.injury || { type: 'Healthy', gamesRemaining: 0 },
                                tid: isProspect ? -1 : (isRetired ? -3 : teamInfo.tid),
                                internalId: crypto.randomUUID(),
                                overallRating: calculatePlayerOverallForYear(p, startYear),
                                status: isProspect ? 'Prospect' : (isRetired ? 'Retired' : (teamInfo.tid === -1 ? 'Free Agent' : 'Active')),
                                diedYear: p.diedYear,
                                hof: p.hof,
                                jerseyNumber
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
                                conference: t.cid === 0 ? 'East' : 'West',
                                cid: typeof t.cid === 'number' ? t.cid : (t.cid === 0 ? 0 : 1),
                                did: typeof t.did === 'number' ? t.did : 0,
                                strength: 0,
                                wins: 0,
                                losses: 0,
                                logoUrl: t.imgURLSmall,
                                colors: t.colors,
                                streak: { type: 'W', count: 0 },
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
                        
                        console.log(`RosterService: Successfully processed ${processedPlayers.length} players and ${processedTeams.length} teams for the ${startYear} season.`);
                        resolve({ players: processedPlayers, teams: processedTeams, teamNameMap, availableYears, draftPicks });
                    } else {
                       parser.write(decoder.decode(value, { stream: true }));
                       push();
                    }
                }).catch(err => reject(err));
            };
            push();
        }).catch(err => reject(err));
    });
};
