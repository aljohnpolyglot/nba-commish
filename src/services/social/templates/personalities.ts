import { SocialTemplate } from '../types';

export const PERSONALITY_TEMPLATES: SocialTemplate[] = [

    {
        id: 'stephen_a_rant',
        handle: 'stephen_a',
        template: "I am AGHAST! I am DISMAYED! The {{team}} losing like this in {{city}} is BLASPHEMOUS! {{player}} should be ASHAMED of that performance! 😤",
        priority: 70,
        condition: (ctx) => ctx.stats && ctx.stats.pts < 15 && ctx.stats.fga > 15 && ctx.game.winnerId !== ctx.team?.id
    }
];
