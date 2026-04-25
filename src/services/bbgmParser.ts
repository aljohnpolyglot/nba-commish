import { NBATeam, NBAPlayer } from '../types';
import JSONParserText from '../utils/JSONParserText';
import { calculateTeamStrength } from '../utils/playerRatings';

function extractJerseyNumber(player: { jerseyNumber?: string | number; stats?: Array<{ jerseyNumber?: string | number }> }): string | undefined {
    const latestStats = player.stats && player.stats.length > 0 ? player.stats[player.stats.length - 1] : undefined;
    const raw = latestStats?.jerseyNumber ?? player.jerseyNumber;
    return raw === undefined || raw === null || raw === '' ? undefined : String(raw);
}

export const fetchAndParseBBGMData = async () => {
    try {
        const response = await fetch('https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json');
        const text = await response.text();
        
        const parser = new JSONParserText(() => {});
        parser.write(text);
        const jsonData = parser.value;

        // 1. Parse Teams
        const teams: NBATeam[] = jsonData.teams
            .filter((t: any) => t.tid >= 0 && t.tid < 30) // Only keep the 30 active NBA teams
            .map((t: any) => ({
                id: t.tid,
                name: `${t.region} ${t.name}`,
                abbrev: t.abbrev,
                conference: t.cid === 0 ? 'East' : 'West',
                wins: 0,
                losses: 0,
                strength: 50, // Default, will calculate
                logoUrl: `https://a.espncdn.com/i/teamlogos/nba/500/${t.abbrev.toLowerCase()}.png`
            }));

        // 2. Parse Players
        const players: NBAPlayer[] = jsonData.players
            .filter((p: any) => p.tid >= -2) // Include prospects (tid: -2) and free agents (tid: -1)
            .map((p: any) => {
                // Get the most recent ratings object
                const latestRating = p.ratings && p.ratings.length > 0 ? p.ratings[p.ratings.length - 1] : { ins: 50, dnk: 50, fg: 50, tp: 50, spd: 50, jmp: 50, endu: 50, ovr: 50 }; 
                
                // Use BBGM's overall if available, otherwise fallback to custom formula
                let overallRating = latestRating.ovr;
                if (overallRating === undefined) {
                    const scoring = (latestRating.ins + latestRating.dnk + latestRating.fg + latestRating.tp) / 4;
                    const athleticism = (latestRating.spd + latestRating.jmp + latestRating.endu) / 3;
                    overallRating = Math.round((scoring * 0.5) + (athleticism * 0.5));
                }

                // Name parsing logic
                let fullName = 'Unknown Player';
                if (p.name) {
                    fullName = p.name.replace(/\./g, '');
                } else if (p.firstName || p.lastName) {
                    fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim().replace(/\./g, '');
                }

                // Determine status
                let status: 'Active' | 'Prospect' | 'Free Agent' | 'Retired' = 'Active';
                if (p.tid === -1) status = 'Free Agent';
                else if (p.tid === -2) status = 'Prospect';
                else if (p.tid < -2) status = 'Retired';

                const jerseyNumber = extractJerseyNumber(p);

                // Map BBGM award types to internal format
                const BBGM_AWARD_MAP: Record<string, string> = {
                  mvp:            'Most Valuable Player',
                  dpoy:           'Defensive Player of the Year',
                  roy:            'Rookie of the Year',
                  smoy:           'Sixth Man of the Year',
                  mip:            'Most Improved Player',
                  champion:       'NBA Champion',
                  finals_mvp:     'Finals MVP',
                  allstar:        'All-Star',
                  // some BBGM exports use these casings
                  MVP:            'Most Valuable Player',
                  DPOY:           'Defensive Player of the Year',
                  ROY:            'Rookie of the Year',
                  SMOY:           'Sixth Man of the Year',
                  MIP:            'Most Improved Player',
                };
                const awards = (p.awards ?? []).map((a: any) => ({
                  season: a.season,
                  type: BBGM_AWARD_MAP[a.type] ?? a.type,
                }));

                return {
                    internalId: `bbgm-${fullName.replace(/\s+/g, '')}-${p.pid ?? p.tid ?? '0'}`,
                    tid: p.tid,
                    name: fullName,
                    overallRating: overallRating,
                    ratings: p.ratings || [],
                    stats: p.stats || [],
                    imgURL: p.imgURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`,
                    injury: p.injury || { type: 'Healthy', gamesRemaining: 0 },
                    status: status,
                    jerseyNumber,
                    awards: awards.length > 0 ? awards : undefined,
                };
            });

        // 3. Calculate Team Strength
        teams.forEach(team => {
            team.strength = calculateTeamStrength(team.id, players);
        });

        return { teams, players };
    } catch (error) {
        console.error("Failed to fetch BBGM data:", error);
        return { teams: [], players: [] };
    }
};
