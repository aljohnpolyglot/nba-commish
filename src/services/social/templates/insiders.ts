import { SocialTemplate } from '../types';

export const INSIDER_TEMPLATES: SocialTemplate[] = [
    {
        id: 'windhorst_speculation',
        handle: 'windhorst',
        template: "Now why would the {{team}} do that? ☝️🤨\n\nSomething is going on in {{city}}.",
        priority: 70,
        condition: (ctx) => !ctx.player && ctx.game.winnerId !== ctx.team?.id && ctx.game.lead > 20
    }
];
