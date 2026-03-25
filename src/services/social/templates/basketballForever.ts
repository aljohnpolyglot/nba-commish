import { SocialTemplate, SocialContext } from '../types';
import { getRating, isRookie, isAllStar, getCareerHigh, isTripleDouble, calculateAge, get2KRating } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// BASKETBALL FOREVER — hype heavy, emoji-rich, wins-focused
// Known for: "X drops Y PTS as team gets the WIN 🥶", "FLIES for the JAM 😤"
// Key fixes: bf_goes_off no longer dumps 0-stat categories,
//            bf_statline_win threshold raised, stat order PTS/REB/AST
// ─────────────────────────────────────────────────────────────────────────────

function pick<T extends { weight: number }>(arr: T[]): T {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of arr) { r -= item.weight; if (r <= 0) return item; }
    return arr[arr.length - 1];
}

// ── STAT BLOCK — BF style: "X drops Y PTS, Z REB, W AST" ────────────────────
// Only lists the meaningful categories — no "0 BLK" or "0 STL"
function buildBFDropLine(s: any): string {
    if (!s) return '';
    const parts: string[] = [`${s.pts} PTS`];
    if (s.reb >= 5)    parts.push(`${s.reb} REB`);
    if (s.ast >= 4)    parts.push(`${s.ast} AST`);
    if (s.stl >= 3)    parts.push(`${s.stl} STL`);
    if (s.blk >= 3)    parts.push(`${s.blk} BLK`);
    if (s.threePm >= 4) parts.push(`${s.threePm} 3PM`);
    return parts.join(', ');
}

// Full block version for multi-line posts
function buildBFStatBlock(s: any): string {
    if (!s) return '';
    const lines: string[] = [`${s.pts} PTS`];
    if (s.reb >= 5)     lines.push(`${s.reb} REB`);
    if (s.ast >= 4)     lines.push(`${s.ast} AST`);
    if (s.stl >= 3)     lines.push(`${s.stl} STL`);
    if (s.blk >= 3)     lines.push(`${s.blk} BLK`);
    if (s.threePm >= 4) lines.push(`${s.threePm} 3PM`);
    if (s.fga >= 10)    lines.push(`${s.fgm}/${s.fga} FG`);
    return lines.join('\n');
}

// ── INTROS ────────────────────────────────────────────────────────────────────
function getBFIntro(ctx: SocialContext): string {
    const name    = ctx.player?.name ?? 'Unknown';
    const oppName = ctx.opponent?.name ?? 'the opponent';
    const s       = ctx.stats;

    if (s?.pts >= 45)              return `${name} went NUCLEAR tonight:`;
    if (isTripleDouble(s))         return `${name} doing ${name} things:`;
    if (s?.pts >= 35)              return `${name} was UNSTOPPABLE vs the ${oppName}:`;
    if (s?.blk >= 4 && s?.pts >= 20) return `MASTERCLASS from ${name}:`;

    const pool = [
        `${name} went CRAZY tonight:`,
        `${name} was in his BAG tonight:`,
        `Another day, another ${name} takeover:`,
        `This statline from ${name} is absurd:`,
        `${name} put the team on his back:`,
        `Don't look now, but ${name} is COOKING:`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── OUTROS ───────────────────────────────────────────────────────────────────
interface OutroOpt { text: string; condition: (ctx: SocialContext) => boolean; weight: number; }

const BF_OUTROS: OutroOpt[] = [
    { text: 'Tough. 😤',            condition: () => true, weight: 5 },
    { text: 'Unreal. 🤯',           condition: () => true, weight: 4 },
    { text: 'Different breed. 🐕',  condition: () => true, weight: 3 },
    { text: 'Respect. 🫡',          condition: () => true, weight: 3 },
    { text: 'He is HIM. 🔥',        condition: (c) => (c.stats?.pts ?? 0) >= 32, weight: 4 },
    { text: 'Scary hours. ⏰',       condition: (c) => (c.stats?.pts ?? 0) >= 38, weight: 3 },
    { text: 'League him. 🗣️',       condition: (c) => (c.stats?.pts ?? 0) >= 42, weight: 2 },
    { text: 'Too easy for him. 🤷‍♂️', condition: (c) => !!(c.stats?.fga > 0 && c.stats.fgm / c.stats.fga > 0.55), weight: 4 },
    { text: 'Give him the MVP trophy already. 🏆', condition: (c) => (c.stats?.pts ?? 0) >= 42 && isAllStar(c.player), weight: 3 },
    { text: 'Rookie of the Year loading... ⏳', condition: (c) => isRookie(c.player), weight: 6 },
    { text: 'He\'s only getting started. 📈', condition: (c) => calculateAge(c.player) < 24, weight: 3 },
    { text: 'Triple-double machine. 🤖', condition: (c) => isTripleDouble(c.stats), weight: 6 },
    { text: 'Clutch gene activated. 🧬', condition: (c) => (c.game?.lead ?? 99) <= 3 && c.game?.winnerId === c.team?.id, weight: 5 },
    { text: 'Statement game. 🗣️',    condition: (c) => (c.stats?.pts ?? 0) >= 32 && c.game?.winnerId === c.team?.id, weight: 3 },
    { text: 'Pure dominance. 🦍',    condition: (c) => (c.stats?.reb ?? 0) >= 15 || (c.stats?.blk ?? 0) >= 4, weight: 3 },
];

function getBFOutro(ctx: SocialContext): string {
    const valid = BF_OUTROS.filter(o => o.condition(ctx));
    if (!valid.length) return 'Tough. 😤';
    return pick(valid).text;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const BASKETBALL_FOREVER_TEMPLATES: SocialTemplate[] = [

    // ── MAIN DYNAMIC ─────────────────────────────────────────────────────────
    {
        id: 'bf_dynamic',
        handle: 'bball_forever',
        template: 'DYNAMIC',
        priority: (ctx: SocialContext) => {
            if (!ctx.stats) return 0;
            const s = ctx.stats;
            let p = 40;
            if (s.pts >= 50) p += 60;
            else if (s.pts >= 40) p += 40;
            else if (s.pts >= 30) p += 20;
            const dnk = ctx.player ? getRating(ctx.player, 'dnk') : 50;
            if (dnk > 80 && s.pts >= 20) p += 15;
            if ((ctx.game?.lead ?? 99) <= 3 && ctx.game?.winnerId === ctx.team?.id) p += 25;
            return Math.min(p, 100);
        },
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && ctx.stats.pts >= 22),
        resolve: (_: string, ctx: SocialContext) => ({
            content: [
                getBFIntro(ctx),
                '',
                buildBFStatBlock(ctx.stats),
                '',
                getBFOutro(ctx),
            ].join('\n'),
        }),
    },

    // ── WIN RECAP — "X drops Y PTS as team get the WIN 🥶" ───────────────────
    // Fixed threshold: 30+ only, and stat line only shows meaningful cats
    {
        id: 'bf_statline_win',
        handle: 'bball_forever',
        template: 'DYNAMIC',
        priority: 88,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.pts >= 30 && ctx.game?.winnerId === ctx.team?.id),
        resolve: (_: string, ctx: SocialContext) => {
            const s       = ctx.stats;
            const name    = ctx.player?.name ?? 'Unknown';
            const teamName = ctx.team?.name ?? 'the team';
            const oppName  = ctx.opponent?.name ?? 'the opponent';
            const dropLine = buildBFDropLine(s);
            return {
                content: `${name} drops ${dropLine} as the ${teamName} get the WIN over the ${oppName} 🥶`,
            };
        },
    },

    // ── ELITE PERFORMANCE (40+) — multi-line hype ────────────────────────────
    // Fixed: only shows stats that actually happened (no 0-stat dumps)
    {
        id: 'bf_goes_off',
        handle: 'bball_forever',
        template: 'DYNAMIC',
        priority: 94,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.pts >= 40 && ctx.game?.winnerId === ctx.team?.id),
        resolve: (_: string, ctx: SocialContext) => {
            const s       = ctx.stats;
            const name    = ctx.player?.name ?? 'Unknown';
            const teamName = ctx.team?.name ?? 'the team';
            const oppName  = ctx.opponent?.name ?? 'the opponent';
            const dropLine = buildBFDropLine(s);
            return {
                content: `${name} GOES OFF for ${dropLine} as the ${teamName} get the WIN over the ${oppName} 🐺`,
            };
        },
    },

    // ── DUNK / JAM POST ───────────────────────────────────────────────────────
    {
        id: 'bf_jam',
        handle: 'bball_forever',
        template: 'DYNAMIC',
        priority: 82,
        type: 'highlight',
        condition: (ctx: SocialContext) => {
            if (!ctx.player || !ctx.stats) return false;
            const dnk = getRating(ctx.player, 'dnk');
            const jmp = getRating(ctx.player, 'jmp');
            return dnk > 62 && jmp > 62 && ctx.stats.pts > 15;
        },
        resolve: (_: string, ctx: SocialContext) => ({
            content: `${ctx.player?.name} FLIES for the JAM 😤`,
        }),
    },

    // ── WIN STREAK ────────────────────────────────────────────────────────────
    {
        id: 'bf_win_streak',
        handle: 'bball_forever',
        template: 'DYNAMIC',
        priority: 86,
        type: 'general',
        condition: (ctx: SocialContext) =>
            !!(ctx.team?.streak?.type === 'W' && (ctx.team?.streak?.count ?? 0) >= 5),
        resolve: (_: string, ctx: SocialContext) => {
            const count = ctx.team?.streak?.count ?? 0;
            return {
                content: `The ${ctx.team?.name} have won ${count} of their last ${count + 1} games 📈`,
            };
        },
    },

    // ── CAREER HIGH ───────────────────────────────────────────────────────────
    {
        id: 'bf_career_high',
        handle: 'bball_forever',
        template: 'DYNAMIC',
        priority: 98,
        type: 'statline',
        condition: (ctx: SocialContext) => {
            if (!ctx.player || !ctx.stats) return false;
            const prevHigh = getCareerHigh(ctx.player, 'pts');
            return ctx.stats.pts > prevHigh && ctx.stats.pts >= 30;
        },
        resolve: (_: string, ctx: SocialContext) => {
            const s   = ctx.stats;
            const age = calculateAge(ctx.player);
            return {
                content: [
                    `CAREER HIGH for ${ctx.player?.name}! 📈`,
                    '',
                    buildBFStatBlock(s),
                    '',
                    `He is only ${age} years old. Scared yet? 😤`,
                ].join('\n'),
            };
        },
    },

    // ── INJURY ────────────────────────────────────────────────────────────────
    {
        id: 'bf_injury',
        handle: 'bball_forever',
        template: 'DYNAMIC',
        priority: 90,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) > 88
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => {
            const games   = ctx.injury.gamesRemaining;
            const timeStr = games <= 2  ? 'a few games'
                : games <= 7   ? 'approximately a week'
                : games <= 14  ? 'approximately two weeks'
                : games <= 22  ? 'about a month'
                : games >= 60  ? 'the rest of the season'
                : 'multiple months';
            return {
                content: `BREAKING: ${ctx.player?.name} is expected to miss ${timeStr} with a ${ctx.injury.injuryType} 🤕\n\nHuge blow for the ${ctx.team?.name}. How will they cope without him? 🤔`,
            };
        },
    },
];