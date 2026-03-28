import { NBAPlayer, NBATeam, StaffData } from "../../../types";
import { convertTo2KRating, formatHeight } from "../../../utils/helpers";

export const generateTradeContext = (
    players: NBAPlayer[],
    teams: NBATeam[],
    staff: StaffData,
    teamAId: number,
    teamBId: number,
    commissionerName: string = "The Commissioner"
): string => {
    const teamA = teams.find(t => t.id === teamAId);
    const teamB = teams.find(t => t.id === teamBId);

    if (!teamA || !teamB) return generateLeagueContext(players, teams, staff, commissionerName);

    const getTeamRoster = (tid: number) => {
        return players
            .filter(p => p && p.tid === tid && p.status === 'Active')
            .sort((a, b) => (b?.overallRating || 0) - (a?.overallRating || 0))
            .map(p => {
                const age = p.born?.year ? new Date().getFullYear() - p.born.year : 25;
                const rating2k = convertTo2KRating(p.overallRating || 0);
                const height = p.hgt ? formatHeight(p.hgt) : 'Unknown';
                return `  - ${p.name} #${p.jerseyNumber || '?'} (${p.pos}, ${height}, Age: ${age}, Rating: ${rating2k})`;
            })
            .join('\n');
    };

    const getTeamStaff = (teamName: string) => {
        const owner = staff.owners.find(o => o.team?.toLowerCase() === teamName?.toLowerCase());
        const gm = staff.gms.find(g => g.team?.toLowerCase() === teamName?.toLowerCase());
        const coach = staff.coaches.find(c => c.team?.toLowerCase() === teamName?.toLowerCase());
        return `Owner: ${owner?.name || 'Unknown'}, GM: ${gm?.name || 'Unknown'}, Coach: ${coach?.name || 'Unknown'}`;
    };

    const getWinPct = (t: NBATeam) => t.wins / (t.wins + t.losses || 1);
    const east = teams.filter(t => t.conference === 'East').sort((a, b) => getWinPct(b) - getWinPct(a));
    const west = teams.filter(t => t.conference === 'West').sort((a, b) => getWinPct(b) - getWinPct(a));
    
    const getStandingsRank = (t: NBATeam) => {
        const conf = t.conference === 'East' ? east : west;
        const rank = conf.findIndex(team => team.id === t.id) + 1;
        return `${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} in ${t.conference}`;
    };

    return `
CURRENT LEAGUE CONTEXT (TRADE SPECIFIC - IGNORE ALL REAL-WORLD DATA):
COMMISSIONER: ${commissionerName}

TEAM 1: ${teamA.name} (${teamA.abbrev})
Standings: ${teamA.wins}-${teamA.losses} (${getStandingsRank(teamA)})
Leadership: ${getTeamStaff(teamA.name)}
Current Roster (Post-Trade):
${getTeamRoster(teamA.id)}

TEAM 2: ${teamB.name} (${teamB.abbrev})
Standings: ${teamB.wins}-${teamB.losses} (${getStandingsRank(teamB)})
Leadership: ${getTeamStaff(teamB.name)}
Current Roster (Post-Trade):
${getTeamRoster(teamB.id)}
`;
};

export const generateLeagueContext = (
    players: NBAPlayer[],
    teams: NBATeam[],
    staff: StaffData,
    commissionerName: string = "The Commissioner"
): string => {
    const topPlayers = players
        .filter(p =>
            p &&
            p.name &&
            p.status !== 'WNBA' &&
            p.status !== 'Euroleague' &&
            p.status !== 'PBA' &&
            p.status !== 'B-League' &&
            p.status !== 'Retired' &&
            p.status !== 'Draft Prospect' &&
            p.status !== 'Prospect' &&
            p.tid !== -3 &&
            p.tid !== -100 &&
            p.tid !== -2 &&       // exclude historical draft pool
            !p.diedYear &&        // exclude deceased legends
            !p.hof                // exclude retired HOF legends
        )
        .sort((a, b) => (b?.overallRating || 0) - (a?.overallRating || 0))
        .slice(0, 50)
        .map(p => {
            const team = teams.find(t => t.id === p.tid);
            const age = p.born?.year ? new Date().getFullYear() - p.born.year : 25;
            const rating2k = convertTo2KRating(p.overallRating || 0);
            const height = p.hgt ? formatHeight(p.hgt) : 'Unknown';
            return `${p.name} #${p.jerseyNumber || '?'} (${p.pos}, ${height}, ${team ? team.abbrev : 'FA'}, Age: ${age}, Rating: ${rating2k})`;
        })
        .join('\n');

    const teamContext = teams.map(t => {
        const owner = staff.owners.find(o => o.team?.toLowerCase() === t.name?.toLowerCase());
        const gm = staff.gms.find(g => g.team?.toLowerCase() === t.name?.toLowerCase());
        const coach = staff.coaches.find(c => c.team?.toLowerCase() === t.name?.toLowerCase());
        return `${t.name} (${t.abbrev}): Owner: ${owner?.name || 'Unknown'}, GM: ${gm?.name || 'Unknown'}, Coach: ${coach?.name || 'Unknown'}`;
    }).join('\n');

    return `
CURRENT LEAGUE CONTEXT (IGNORE ALL REAL-WORLD DATA):
COMMISSIONER: ${commissionerName}

TOP PLAYERS:
${topPlayers}

TEAM LEADERSHIP (OWNERS, GMS, COACHES):
${teamContext}
`;
};

export const generateChristmasContext = (
    players: NBAPlayer[],
    teams: NBATeam[],
    christmasGames: { homeTid: number; awayTid: number }[]
): string => {
    if (!christmasGames || christmasGames.length === 0) return "";

    const getTeamDetails = (tid: number) => {
        const team = teams.find(t => t.id === tid);
        if (!team) return "Unknown Team";

        const roster = players
            .filter(p => p && p.tid === tid && p.status === 'Active')
            .sort((a, b) => (b?.overallRating || 0) - (a?.overallRating || 0))
            .slice(0, 8) // Top 8 players for context
            .map(p => {
                const age = p.born?.year ? new Date().getFullYear() - p.born.year : 25;
                const rating2k = convertTo2KRating(p.overallRating || 0);
                return `    - ${p.name} (${p.pos}, Age: ${age}, OVR: ${rating2k})`;
            })
            .join('\n');

        return `${team.name} (${team.abbrev}) - Strength: ${team.strength}\n  Roster Highlights:\n${roster}`;
    };

    const gamesContext = christmasGames.map((g, i) => {
        return `GAME ${i + 1}:\nAWAY: ${getTeamDetails(g.awayTid)}\nHOME: ${getTeamDetails(g.homeTid)}`;
    }).join('\n\n');

    return `
CHRISTMAS DAY SHOWCASE CONTEXT:
The following marquee matchups have been scheduled for Christmas Day. Use this detailed roster and team strength information to provide deep analysis and hype in the news and social media.

${gamesContext}
`;
};
