import { GameResult } from '../simulation/StatGenerator';
import { NBAPlayer, NBATeam } from '../../types';

export interface SocialContext {
    game: GameResult;
    player?: NBAPlayer; // The primary subject
    players: NBAPlayer[]; // All players in the league
    team?: NBATeam;     // The primary team subject
    teams: NBATeam[];   // All teams in the league
    opponent?: NBATeam; // The opponent
    stats?: any;        // Specific stats for the game
    injury?: any;       // Specific injury event
    date?: string;
    dayOfWeek?: string;
}

export interface SocialTemplate {
    id: string;
    handle: string; // e.g., 'nba_official', 'statmuse'
    template: string | ((ctx: SocialContext) => string);
    priority: number | ((ctx: SocialContext) => number); // Higher = more likely to show if multiple trigger
    condition: (ctx: SocialContext) => boolean;
    resolve?: (template: string, ctx: SocialContext) => string | { content: string; avatarUrl?: string; mediaUrl?: string; mediaBackgroundColor?: string; data?: any }; // Optional custom resolver
    type?: 'statline' | 'highlight' | 'news' | 'meme' | 'general'; // Category of the tweet
}
