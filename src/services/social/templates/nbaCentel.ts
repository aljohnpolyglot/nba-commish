import { SocialTemplate } from '../types';
import { getRating, get2KRating } from '../helpers';

export const NBA_CENTEL_TEMPLATES: SocialTemplate[] = [
    {
        id: 'centel_fake_quote',
        handle: 'nba_centel',
        template: "{{player}} on his performance: 'I just wanted to get some cardio in.'",
        priority: 70,
        condition: (ctx) => {
            return ctx.stats && ctx.stats.min > 25 && ctx.stats.pts < 5 && ctx.stats.reb < 3 && ctx.stats.ast < 3;
        }
    },
    {
        id: 'centel_heated',
        
        handle: 'nba_centel',
        template: (ctx) => {
            const coaches = ["Mike Brown", "Steve Kerr", "Gregg Popovich", "Erik Spoelstra", "Nick Nurse"];
            const coach = coaches[Math.floor(Math.random() * coaches.length)];
            const variations = [
                `${coach} was HEATED after the refs didn’t call {{player}}’s 3rd foul. 😳`,
                `${coach} had to be held back after that no-call on {{player}}. 😡`,
                `${coach} just threw his clipboard at the bench after {{player}} got away with that. 💀`,
                `The refs are letting {{player}} get away with murder tonight. ${coach} is losing it. 😭`
            ];
            return variations[Math.floor(Math.random() * variations.length)];
        },
        priority: 40,
        condition: (ctx) => {
            return !!(ctx.stats && ctx.stats.pts > 10 && Math.random() < 0.02);
        }
    },
    {
        id: 'centel_football',
        handle: 'nba_centel',
        template: (ctx) => {
            const variations = [
                "{{player}} with the FOOTBALL PLAY 🔥",
                "{{player}} out here playing middle linebacker 😭",
                "Is {{player}} auditioning for the NFL? 💀",
                "{{player}} just tackled him. No whistle. 😳"
            ];
            return variations[Math.floor(Math.random() * variations.length)];
        },
        priority: 45,
        condition: (ctx) => {
            if (!ctx.player) return false;
            const stre = getRating(ctx.player, 'stre');
            return stre > 70 && Math.random() < 0.03;
        }
    },
    {
        id: 'centel_injury_fake',
        handle: 'nba_centel',
        template: "BREAKING: {{player}} has suffered a broken heart and will miss the remainder of the season. 💔",
        priority: 60,
        condition: (ctx) => !!ctx.injury && !!ctx.player && get2KRating(ctx.player) > 88 && Math.random() < 0.2
    }
];
