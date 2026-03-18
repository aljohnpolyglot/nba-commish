import { SocialPost, GameState } from "../../../types";
import { convertTo2KRating } from "../../../utils/helpers";

export const generateSocialThreadPrompt = (originalPost: SocialPost, state: GameState): string => {
    const gamePhase = state.date ? `Date: ${state.date}` : '';
    
    let context = "";
    if (originalPost.data) {
        const d = originalPost.data;
        if (d.type === 'GameResult' && d.result) {
            context += `\nContext: Game Result\nWinner: ${d.winner.name} (${d.result.winnerScore})\nLoser: ${d.loser.name} (${d.result.loserScore})\nTop Performer: ${d.topPerformer.name} (${d.topPerformer.pts} PTS, ${d.topPerformer.reb} REB, ${d.topPerformer.ast} AST)\n`;
            
            // Add injury context for the teams involved
            const homeInjured = state.players.filter(p => p.tid === d.result.homeTeamId && p.injury && p.injury.gamesRemaining > 0);
            const awayInjured = state.players.filter(p => p.tid === d.result.awayTeamId && p.injury && p.injury.gamesRemaining > 0);
            
            if (homeInjured.length > 0) {
                context += `Injuries (${d.winner.id === d.result.homeTeamId ? d.winner.name : d.loser.name}): ${homeInjured.map(p => `${p.name} (${p.injury.type})`).join(', ')}\n`;
            }
            if (awayInjured.length > 0) {
                context += `Injuries (${d.winner.id === d.result.awayTeamId ? d.winner.name : d.loser.name}): ${awayInjured.map(p => `${p.name} (${p.injury.type})`).join(', ')}\n`;
            }

            // Add Full Box Score
            const formatBox = (stats: any[]) => stats.map(s => `${s.name}: ${s.pts}P/${s.reb}R/${s.ast}A/${s.stl}S/${s.blk}B (${s.fgm}/${s.fga} FG, ${s.threePm}/${s.threePa} 3PT)`).join('\n');
            const winnerStats = d.winner.id === d.result.homeTeamId ? d.result.homeStats : d.result.awayStats;
            const loserStats = d.winner.id === d.result.homeTeamId ? d.result.awayStats : d.result.homeStats;

            context += `\n${d.winner.name} Box Score:\n${formatBox(winnerStats)}\n`;
            context += `\n${d.loser.name} Box Score:\n${formatBox(loserStats)}\n`;

        } else if (d.type === 'PlayerFeat' && d.player) {
            const p = d.player;
            const rating = convertTo2KRating(p.overallRating || 0, p.hgt || 50);
            // User Request: "everyone spamming contracts... remove that!"
            // Removed contract string from context.
            // User Request: "feed formation of the whole stats and ovrl which are internal data it is up to them how they use that"
            context += `\nContext: Player Feat\nPlayer: ${p.name} (Pos: ${p.pos}, Age: ${p.age}, Skill Level/2K Rating: ${rating})\nStats: ${d.stats.pts} PTS, ${d.stats.reb} REB, ${d.stats.ast} AST\n`;
        } else if (d.type === 'Random' && d.player) {
             const p = d.player;
             const rating = convertTo2KRating(p.overallRating || 0, p.hgt || 50);
             context += `\nContext: General Discussion\nPlayer: ${p.name} (Pos: ${p.pos}, Age: ${p.age}, Skill Level/2K Rating: ${rating})\nTeam: ${d.team?.name}\n`;
        }
    }

    // Add standings context (top 3 seeds per conference)
    const getWinPct = (t: any) => t.wins / (t.wins + t.losses || 1);
    const east = state.teams.filter(t => t.conference === 'East').sort((a, b) => getWinPct(b) - getWinPct(a)).slice(0, 3);
    const west = state.teams.filter(t => t.conference === 'West').sort((a, b) => getWinPct(b) - getWinPct(a)).slice(0, 3);
    
    const standings = `\nStandings Snapshot:\nEast: ${east.map(t => `${t.abbrev} (${t.wins}-${t.losses})`).join(', ')}\nWest: ${west.map(t => `${t.abbrev} (${t.wins}-${t.losses})`).join(', ')}`;

    return `
  The user clicked on a social media post to see the replies.
  
  Current Date: ${state.date}
  Commissioner: ${state.commissionerName}
  ${standings}
  ${context}

  Original Post:
  Author: ${originalPost.author} (@${originalPost.handle})
  Content: "${originalPost.content}"
  Source: ${originalPost.source}

  Generate 3-5 realistic, funny, or toxic replies from NBA fans, bots, or other players.
  The tone should match NBA Twitter/Reddit culture (memes, overreactions, stanning, hating).
  
  CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS:
  1. You MUST use the provided context as the ABSOLUTE SOURCE OF TRUTH.
  2. DO NOT invent, hallucinate, or assume any trades, signings, injuries, or roster moves that are not explicitly stated in the context or the original post.
  3. If a player is mentioned, use their current team from the context. DO NOT place them on a different team or invent rumors about them moving unless the original post is about a trade rumor.
  4. If the original post is about a specific game or event, the replies MUST react to that exact event with the exact same details. Do not create conflicting reports.
  5. Use the provided context (stats, standings, age) to make the replies specific and relevant.
  6. If a player had a bad game, roast them. If they had a great game, glaze them.
  7. NEVER mention numerical ratings (e.g., "80-rated", "71 OIQ") or "gamified" terminology in the output. Use descriptive language instead.
  `;
};
