import { convertTo2KRating } from '../../utils/helpers';

/** Convert a player's BBGM overallRating to 2K scale (same formula the player searcher uses) */
export const get2KRating = (player: any): number => {
    if (!player) return 60;
    return convertTo2KRating(player.overallRating ?? 50, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp);
};

export const calculateAge = (player: any) => {
    const birthYear = player.born?.year;
    if (!birthYear) return player.age || 25; // Fallback
    return 2026 - birthYear;
};

export const getRating = (player: any, key: string) => {
    const latest = player.ratings[player.ratings.length - 1];
    return latest ? latest[key] : 50;
};

export const isRookie = (player: any) => {
    // In Basketball GM, if the current season is 2026, 
    // players drafted in 2025 are rookies.
    return player.draft?.year === 2025;
};

export const isVeteran = (player: any) => {
    // Players with 10+ years of experience or 32+ years old
    const experience = 2026 - (player.draft?.year || 2020);
    const age = 2026 - (player.born?.year || 1990);
    return experience >= 10 || age >= 32;
};

export const isAllStar = (player: any) => {
    return player.awards?.some((a: any) => a.type === 'All-Star');
};

export const isRolePlayer = (player: any) => {
    const ovr2k = get2KRating(player);
    return ovr2k >= 75 && ovr2k <= 82;
};

export const getCareerHigh = (player: any, key: string) => {
    if (!player.stats || player.stats.length === 0) return 0;
    const maxKey = `${key}Max`;
    let max = 0;
    for (const s of player.stats) {
        if (s[maxKey] !== undefined) {
            max = Math.max(max, s[maxKey]);
        } else if (s[key] !== undefined) {
            max = Math.max(max, s[key]);
        }
    }
    return max;
};

export const isReigningChamp = (team: any) => {
    if (!team.seasons || team.seasons.length === 0) return false;
    const lastSeason = team.seasons.find((s: any) => s.season === 2025);
    return lastSeason && lastSeason.playoffRoundsWon === 4;
};

export const isTripleDouble = (stats: any) => {
    if (!stats) return false;
    const doubleDigits = [stats.pts, stats.reb, stats.ast, stats.stl, stats.blk].filter(v => v >= 10).length;
    return doubleDigits >= 3;
};

export const isDoubleDouble = (stats: any) => {
    if (!stats) return false;
    const doubleDigits = [stats.pts, stats.reb, stats.ast, stats.stl, stats.blk].filter(v => v >= 10).length;
    return doubleDigits >= 2;
};

export const getGameScore = (stats: any) => {
    if (!stats) return 0;
    // Standard Game Score formula: PTS + 0.4 * FG - 0.7 * FGA - 0.4 * (FTA - FT) + 0.7 * ORB + 0.3 * DRB + STL + 0.7 * AST + 0.7 * BLK - 0.4 * PF - TOV
    return (
        stats.pts +
        0.4 * stats.fg -
        0.7 * stats.fga -
        0.4 * (stats.fta - stats.ft) +
        0.7 * stats.orb +
        0.3 * stats.drb +
        stats.stl +
        0.7 * stats.ast +
        0.7 * stats.blk -
        0.4 * stats.pf -
        stats.tov
    );
};

export const is5x5 = (stats: any) => {
    if (!stats) return false;
    return stats.pts >= 5 && stats.reb >= 5 && stats.ast >= 5 && stats.stl >= 5 && stats.blk >= 5;
};

export const getStatlineString = (stats: any) => {
    if (!stats) return '';
    const parts = [];
    parts.push(`${stats.pts} PTS`);
    parts.push(`${stats.reb} REB`);
    parts.push(`${stats.ast} AST`);
    if (stats.stl >= 3) parts.push(`${stats.stl} STL`);
    if (stats.blk >= 3) parts.push(`${stats.blk} BLK`);
    if (stats.threePm >= 3) parts.push(`${stats.threePm} 3PM`);
    return parts.join('\n');
};

const UNSTOPPABLE_VARIATIONS = [
    "Unstoppable.",
    "Different breed.",
    "In the zone.",
    "Pure dominance.",
    "On another level.",
    "HIM.",
    "Cooking.",
    "Automatic.",
    "Video game numbers.",
    "Special."
];

export const getRandomUnstoppable = () => UNSTOPPABLE_VARIATIONS[Math.floor(Math.random() * UNSTOPPABLE_VARIATIONS.length)];

export const getRandomTime = () => {
    const mins = Math.floor(Math.random() * 2);
    const secs = Math.floor(Math.random() * 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

export const getCurrentSeasonStats = (player: any) => {
    if (!player.stats || player.stats.length === 0) return null;
    // Assuming the last entry is the current season
    return player.stats[player.stats.length - 1];
};
