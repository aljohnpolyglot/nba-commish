import { SocialTemplate } from '../types';

export const PERSONALITY_TEMPLATES: SocialTemplate[] = [
    {
        id: 'underdog_lineup',
        handle: 'underdog_nba',
        template: "Lineup alert: {{player}} ({{pts}} PTS) was the focal point for the {{team}} tonight. Final: {{winner_score}}-{{loser_score}}.",
        priority: 20, // Lowered significantly
        condition: (ctx) => !!(ctx.stats && ctx.stats.pts >= 20 && Math.random() < 0.1)
    },
    {
        id: 'underdog_injury',
        handle: 'underdog_nba',
        template: "Status alert: {{player}} ({{injury_type}}) is expected to miss {{games_missed}} games, per sources.",
        priority: 100,
        condition: (ctx) => !!ctx.injury && !!ctx.player
    },
    {
        id: 'stephen_a_rant',
        handle: 'stephen_a',
        template: "I am AGHAST! I am DISMAYED! The {{team}} losing like this in {{city}} is BLASPHEMOUS! {{player}} should be ASHAMED of that performance! 😤",
        priority: 70,
        condition: (ctx) => ctx.stats && ctx.stats.pts < 15 && ctx.stats.fga > 15 && ctx.game.winnerId !== ctx.team?.id
    }
];
