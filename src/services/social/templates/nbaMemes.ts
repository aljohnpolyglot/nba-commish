import { SocialTemplate } from '../types';
import { get2KRating } from '../helpers';

export const NBA_MEMES_TEMPLATES: SocialTemplate[] = [
    {
        id: 'memes_brick',
        handle: 'nba_memes',
        template: "{{player}} tonight... 🧱",
        priority: 75,
        condition: (ctx) => {
             return ctx.stats && ctx.stats.fga > 8 && (ctx.stats.fgm / ctx.stats.fga) < 0.25;
        }
    },
    {
        id: 'memes_standings',
        handle: 'nba_memes',
        template: "{{team}} fans checking the standings like: 👀",
        priority: 70,
        condition: (ctx) => {
            return !!(ctx.team && ctx.team.streak && ctx.team.streak.type === 'W' && ctx.team.streak.count >= 3);
        }
    },
    {
        id: 'fan_reaction',
        handle: 'nba_memes',
        template: (ctx) => {
            const variations = [
                "{{team}} fans tonight: \n\n🥳🥳🥳",
                "{{team}} fans eating good tonight 🍽️",
                "Current mood for {{team}} fans: 📈📈📈",
                "{{team}} fans sleeping peacefully tonight 😴"
            ];
            return variations[Math.floor(Math.random() * variations.length)];
        },
        priority: 30, // Lowered from 60
        condition: (ctx) => !!(ctx.team && ctx.game.winnerId === ctx.team.id && ctx.game.lead > 15)
    },
    {
        id: 'fan_disappointment',
        handle: 'nba_memes',
        template: "{{player}} drops {{pts}} and we still lose. Classic. At least the Commish got to see how much we need a secondary scorer in person. Help wanted in {{city}}! #{{team_handle}}",
        priority: 85,
        condition: (ctx) => ctx.stats && ctx.stats.pts >= 25 && ctx.game.winnerId !== ctx.team?.id && ctx.game.homeTeamId === ctx.team?.id,
    },
    {
        id: 'memes_injury',
        handle: 'nba_memes',
        template: "{{team}} fans seeing {{player}} go down with a {{injury_type}}: \n\n🤡🤡🤡",
        priority: 70,
        condition: (ctx) => !!ctx.injury && !!ctx.player && get2KRating(ctx.player) > 88
    }
];
