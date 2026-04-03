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
    },

    // ── TECHNICAL FOUL — fires when the highlight generator recorded a tech ────
    {
        id: 'centel_tech',
        handle: 'nba_centel',
        template: 'DYNAMIC',
        priority: 75,
        type: 'highlight' as any,
        condition: (ctx) => {
            if (!ctx.player) return false;
            const hl: any[] = (ctx.game as any).highlights ?? [];
            return hl.some((h: any) => h.type === 'tech_foul' && h.playerId === ctx.player!.internalId);
        },
        resolve: (_: string, ctx: any) => {
            const name     = ctx.player?.name ?? 'Unknown';
            const variants = [
                `BREAKING: ${name} has been assessed a technical foul for "excessive celebration." The league office will review. 🧐`,
                `${name} just got a T. The ref looked personally offended. 😭`,
              
                `BREAKING: ${name} has been flagged for "visually disagreeing with an official" per league sources. 👀`,
                `${name} said something to the ref and now we're all paying for it. 💀`,
            ];
            return { content: variants[Math.floor(Math.random() * variants.length)] };
        },
    },

    // ── POSTERIZED REACTION — defender's perspective ─────────────────────────
    {
        id: 'centel_posterized',
        handle: 'nba_centel',
        template: 'DYNAMIC',
        priority: 82,
        type: 'highlight' as any,
        condition: (ctx) => {
            if (!ctx.player) return false;
            const hl: any[] = (ctx.game as any).highlights ?? [];
            // Fire for the VICTIM — find any posterizer where victimId matches this player
            return hl.some((h: any) => h.type === 'posterizer' && h.victimId === ctx.player!.internalId);
        },
        resolve: (_: string, ctx: any) => {
            const hl: any[]  = (ctx.game as any).highlights ?? [];
            const victim      = ctx.player?.name ?? 'Unknown';
            const event       = hl.find((h: any) => h.type === 'posterizer' && h.victimId === ctx.player?.internalId);
            const dunker      = event?.playerName ?? 'Someone';
            const variants = [
                `BREAKING: ${victim} has officially been put in a poster. Prayers up. 🙏`,
                `${victim} said he "didn't feel the contact." We all saw the contact, ${victim}. 😭`,
                `BREAKING: ${victim} is requesting a trade after what just happened. Sources say he hasn't looked at his phone since. 💀`,
                `${victim} tried to take a charge on ${dunker}. Results: catastrophic. 😭📸`,
                `${dunker} just sent ${victim} to the highlight reel and not in a good way. 💀`,
            ];
            return { content: variants[Math.floor(Math.random() * variants.length)] };
        },
    },

    // ── ANKLE BREAKER VICTIM REACTION ────────────────────────────────────────
    {
        id: 'centel_ankles',
        handle: 'nba_centel',
        template: 'DYNAMIC',
        priority: 78,
        type: 'highlight' as any,
        condition: (ctx) => {
            if (!ctx.player) return false;
            const hl: any[] = (ctx.game as any).highlights ?? [];
            return hl.some((h: any) => h.type === 'ankle_breaker' && h.victimId === ctx.player!.internalId);
        },
        resolve: (_: string, ctx: any) => {
            const hl: any[]  = (ctx.game as any).highlights ?? [];
            const event       = hl.find((h: any) => h.type === 'ankle_breaker' && h.victimId === ctx.player?.internalId);
            const victim      = ctx.player?.name ?? 'Unknown';
            const attacker    = event?.playerName ?? 'Someone';
            const variants = [
                `BREAKING: ${victim}'s ankles are currently listed as "questionable" for the rest of the season. 😭`,
                `${attacker} just cooked ${victim}'s ankles in front of everyone. The refs had to stop the game to locate ${victim}'s dignity. 💀`,
                `${victim} has been placed in the NBA's ankle protection program. Details to follow. 🙏`,
                `BREAKING: ${victim} has filed a police report against ${attacker} for breaking and entering (his ankles). 😭`,
            ];
            return { content: variants[Math.floor(Math.random() * variants.length)] };
        },
    },
];
