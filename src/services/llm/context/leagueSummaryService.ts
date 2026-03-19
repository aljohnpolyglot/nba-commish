import { NBATeam, NBAPlayer, GameResult } from '../../../types';
import { AwardService } from '../../logic/AwardService';
import { SettingsManager } from '../../SettingsManager';

export const generateLeagueSummaryContext = (
    teams: NBATeam[],
    rawPlayers: NBAPlayer[],
    recentGames: GameResult[]
): string => {
    // Strip legends, retired, and non-NBA players before building any LLM context
    const players = rawPlayers.filter(p =>
        p &&
        !p.diedYear &&
        !p.hof &&
        p.tid !== -2 &&
        p.status !== 'Retired' &&
        p.status !== 'Draft Prospect' &&
        p.status !== 'Prospect'
    );

    const ctxScale = SettingsManager.getContextScale(); // 0.3 – 1.0

    let context = "--- LEAGUE SUMMARY ---\n\n";

    // 1. All Standings
    const east = teams.filter(t => t.conference === 'East').sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const west = teams.filter(t => t.conference === 'West').sort((a, b) => b.wins - a.wins || a.losses - b.losses);

    context += "East Standings:\n";
    east.forEach((t, i) => context += `${i + 1}. ${t.name} (${t.wins}-${t.losses})\n`);
    context += "\nWest Standings:\n";
    west.forEach((t, i) => context += `${i + 1}. ${t.name} (${t.wins}-${t.losses})\n`);

    // 2. Notable Streaks
    const winStreaks = teams.filter(t => t.streak && t.streak.type === 'W' && t.streak.count >= 3).sort((a, b) => (b.streak?.count || 0) - (a.streak?.count || 0));
    const loseStreaks = teams.filter(t => t.streak && t.streak.type === 'L' && t.streak.count >= 3).sort((a, b) => (b.streak?.count || 0) - (a.streak?.count || 0));

    if (winStreaks.length > 0 || loseStreaks.length > 0) {
        context += "\nNotable Streaks:\n";
        winStreaks.slice(0, 5).forEach(t => context += `${t.name}: ${t.streak?.count}W\n`);
        loseStreaks.slice(0, 5).forEach(t => context += `${t.name}: ${t.streak?.count}L\n`);
    }

    // 3. League Leaders (Top 10 Points, Rebounds, Assists)
    const currentSeason = 2026;
    const playerStats = players.map(p => {
        const stat = p.stats?.find(s => s.season === currentSeason && !s.playoffs);
        if (!stat || stat.gp === 0) return null;
        return {
            name: p.name,
            team: teams.find(t => t.id === p.tid)?.abbrev || 'FA',
            gp: stat.gp,
            ppg: stat.pts / stat.gp,
            rpg: (stat.trb || (stat.orb || 0) + (stat.drb || 0)) / stat.gp,
            apg: stat.ast / stat.gp
        };
    }).filter(p => p !== null && p.gp >= 3) as any[];

    if (playerStats.length > 0) {
        context += "\nLeague Leaders (Top 10):\n";

        const leadersCount = Math.max(3, Math.round(10 * ctxScale));
        const ptsLeaders = [...playerStats].sort((a, b) => b.ppg - a.ppg).slice(0, leadersCount);
        context += `PTS: ${ptsLeaders.map(p => `${p.name} (${p.ppg.toFixed(1)})`).join(', ')}\n`;

        const rebLeaders = [...playerStats].sort((a, b) => b.rpg - a.rpg).slice(0, leadersCount);
        context += `REB: ${rebLeaders.map(p => `${p.name} (${p.rpg.toFixed(1)})`).join(', ')}\n`;

        const astLeaders = [...playerStats].sort((a, b) => b.apg - a.apg).slice(0, leadersCount);
        context += `AST: ${astLeaders.map(p => `${p.name} (${p.apg.toFixed(1)})`).join(', ')}\n`;
    }

    // 4. Recent Notable Performances & Bad Games (from recentGames)
    const days = recentGames && recentGames.length > 0 ? new Set(recentGames.map(g => g.date)).size : 1;
    if (recentGames && recentGames.length > 0) {
        const notablePerformances: string[] = [];
        const badPerformances: string[] = [];
        
        recentGames.forEach(game => {
            const homeTeam = teams.find(t => t.id === game.homeTeamId);
            const awayTeam = teams.find(t => t.id === game.awayTeamId);
            
            const allStats = [
                ...game.homeStats.map(s => ({ ...s, team: homeTeam, opp: awayTeam })), 
                ...game.awayStats.map(s => ({ ...s, team: awayTeam, opp: homeTeam }))
            ];
            
            allStats.forEach(stat => {
                const player = players.find(p => p.internalId === stat.playerId);
                const overall = player?.overallRating || 0;
                
                // Crazy Box Scores (Game Score >= 25 or 40+ pts or 15+ reb or 15+ ast or triple double)
                const isTripleDouble = (stat.pts >= 10 ? 1 : 0) + (stat.reb >= 10 ? 1 : 0) + (stat.ast >= 10 ? 1 : 0) + (stat.stl >= 10 ? 1 : 0) + (stat.blk >= 10 ? 1 : 0) >= 3;
                
                if (stat.gameScore >= 25 || stat.pts >= 40 || stat.reb >= 15 || stat.ast >= 15 || isTripleDouble) {
                    let desc = `${stat.name} (${stat.team?.abbrev}) vs ${stat.opp?.abbrev} on ${game.date}: ${stat.pts} PTS, ${stat.reb} REB, ${stat.ast} AST, GameScore: ${stat.gameScore.toFixed(1)}`;
                    if (isTripleDouble) desc += " (Triple-Double)";
                    notablePerformances.push(desc);
                }
                
                // Bad games from high overall guys (Overall >= 85, Game Score <= 10 or FG% <= 30% with 10+ FGA)
                if (overall >= 85 && stat.min > 15) {
                    const fgPct = stat.fga > 0 ? (stat.fgm / stat.fga) * 100 : 0;
                    if (stat.gameScore <= 10 || (stat.fga >= 10 && fgPct <= 30)) {
                        badPerformances.push(`${stat.name} (${stat.team?.abbrev}, OVR: ${overall}) vs ${stat.opp?.abbrev} on ${game.date}: ${stat.pts} PTS, ${stat.fgm}/${stat.fga} FG, GameScore: ${stat.gameScore.toFixed(1)}`);
                    }
                }
            });
        });

        if (notablePerformances.length > 0) {
            context += "\nRecent Crazy Box Scores:\n";
            const notableCap = Math.max(2, Math.round(Math.min(8 * days, 40) * ctxScale));
            notablePerformances.slice(-notableCap).forEach(p => context += `- ${p}\n`);
        }

        if (badPerformances.length > 0) {
            context += "\nRecent Bad Games from Stars:\n";
            const badCap = Math.max(1, Math.round(Math.min(5 * days, 25) * ctxScale));
            badPerformances.slice(-badCap).forEach(p => context += `- ${p}\n`);
        }
    }
    
    // 5. Rumors for Bad Teams
    const badTeams = teams.filter(t => t.wins + t.losses >= 10 && (t.wins / (t.wins + t.losses)) <= 0.35);
    if (badTeams.length > 0) {
        context += "\nRumor Mill (Struggling Teams):\n";
        badTeams.forEach(t => {
            context += `- ${t.name} (${t.wins}-${t.losses}): Fans are restless, coach on the hot seat, star players might request trades.\n`;
        });
    }

    // 6. Top Players in the League (count scales with context depth)
    const topCount = Math.max(5, Math.round(30 * ctxScale));
    const top100 = [...players].sort((a, b) => b.overallRating - a.overallRating).slice(0, topCount);
    context += `\nTop ${topCount} Players in the League:\n`;
    top100.forEach((p, i) => {
        const team = teams.find(t => t.id === p.tid)?.abbrev || 'FA';
        context += `${i + 1}. ${p.name} (${team}, OVR: ${p.overallRating})\n`;
    });
    
    // 7. Injured Players (Top 20 by Overall)
    const injuredPlayers = players.filter(p => p.injury && p.injury.gamesRemaining > 0)
        .sort((a, b) => b.overallRating - a.overallRating)
        .slice(0, 20);
        
    if (injuredPlayers.length > 0) {
        context += "\nTop 20 Injured Players:\n";
        injuredPlayers.forEach(p => {
            const team = teams.find(t => t.id === p.tid)?.abbrev || 'FA';
            context += `- ${p.name} (${team}, OVR: ${p.overallRating}): ${p.injury.type} (${p.injury.gamesRemaining} games remaining)\n`;
        });
    }

    try {
        const races = AwardService.calculateAwardRaces(players, teams, currentSeason);
        if (races.mvp.length > 0) {
            context += "\nAward Races:\n";
            context += `MVP: ${races.mvp.slice(0, 3).map(c => `${c.player.name} (${c.odds})`).join(', ')}\n`;
            context += `DPOY: ${races.dpoy.slice(0, 3).map(c => `${c.player.name} (${c.odds})`).join(', ')}\n`;
            context += `ROTY: ${races.roty.slice(0, 3).map(c => `${c.player.name} (${c.odds})`).join(', ')}\n`;
            context += `6MOY: ${races.smoy.slice(0, 3).map(c => `${c.player.name} (${c.odds})`).join(', ')}\n`;
            context += `MIP: ${races.mip.slice(0, 3).map(c => `${c.player.name} (${c.odds})`).join(', ')}\n`;
        }
    } catch (e) {
        // Award races are non-critical, don't crash the sim
    }

    context += "\n----------------------\n";
    return context;
};
