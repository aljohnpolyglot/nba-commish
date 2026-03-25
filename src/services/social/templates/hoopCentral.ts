import { SocialTemplate, SocialContext } from '../types';
import { isTripleDouble, isDoubleDouble, isAllStar, calculateAge, isRookie, get2KRating } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// HOOP CENTRAL — clean, short takes, basketball-first voice
// Known for: "X was in his bag", "What a game", short punchy outros
// Key fix: variety in intros/outros, not just rotating through same 3 phrases
// ─────────────────────────────────────────────────────────────────────────────

function pick<T extends { weight: number }>(arr: T[]): T {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of arr) { r -= item.weight; if (r <= 0) return item; }
    return arr[arr.length - 1];
}

// ── INTRO ─────────────────────────────────────────────────────────────────────
// HC uses short, punchy intros — never more than one line
function getHCIntro(ctx: SocialContext): string {
    const name    = ctx.player?.name ?? 'Unknown';
    const oppName = ctx.opponent?.name ?? 'the opponent';
    const s       = ctx.stats;

    if (s?.pts >= 45)          return `${name} was something else tonight:`;
    if (s?.pts >= 38)          return `${name} went to work:`;
    if (isTripleDouble(s))     return `What a game from ${name}:`;
    if (s?.blk >= 5 || s?.stl >= 4) return `${name} locked it down:`;
    if (ctx.opponent)          return `${name} vs the ${oppName}:`;

    const pool = [
        `${name} tonight:`,
        `${name} was in his bag:`,
        `What a game from ${name}:`,
        `${name} led the way for the ${ctx.team?.name}:`,
        `${name} went off:`,
        `${name} was cooking:`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── STAT BLOCK ────────────────────────────────────────────────────────────────
// HC stat block — selective, only the highlights
function buildHCStatBlock(s: any): string {
    if (!s) return '';
    const lines: string[] = [`${s.pts} PTS`];
    if (s.reb >= 7)    lines.push(`${s.reb} REB`);
    if (s.ast >= 6)    lines.push(`${s.ast} AST`);
    if (s.stl >= 3)    lines.push(`${s.stl} STL`);
    if (s.blk >= 3)    lines.push(`${s.blk} BLK`);
    if (s.threePm >= 4) lines.push(`${s.threePm} 3PM`);
    // FG for high efficiency or big nights
    if (s.pts >= 30 && s.fga >= 10) lines.push(`${s.fgm}/${s.fga} FG`);
    return lines.join('\n');
}

// ── OUTROS ───────────────────────────────────────────────────────────────────
// Each outro has a specific condition — not just generic filler
interface OutroOpt { text: string; condition: (ctx: SocialContext) => boolean; weight: number; }

const HC_OUTROS: OutroOpt[] = [
    // Generic (lowest weight — last resort)
    { text: 'Hooper.',      condition: () => true, weight: 3 },
    { text: 'Bucket.',      condition: () => true, weight: 3 },
    { text: 'He\'s like that.', condition: () => true, weight: 3 },

    // Performance-specific
    { text: 'Tough.',           condition: (c) => (c.stats?.pts ?? 0) >= 25, weight: 5 },
    { text: 'Special.',         condition: (c) => (c.stats?.pts ?? 0) >= 28, weight: 4 },
    { text: 'Elite.',           condition: (c) => isAllStar(c.player) && (c.stats?.pts ?? 0) >= 25, weight: 4 },
    { text: 'Unstoppable.',     condition: (c) => (c.stats?.pts ?? 0) >= 35, weight: 5 },
    { text: 'Best player on the floor.', condition: (c) => (c.stats?.pts ?? 0) >= 32, weight: 4 },
    { text: 'Top 10 player?',   condition: (c) => (c.stats?.pts ?? 0) >= 36, weight: 3 },

    // Efficiency
    { text: 'Efficient.',       condition: (c) => !!(c.stats?.fga > 0 && c.stats.fgm / c.stats.fga > 0.60 && c.stats.pts >= 22), weight: 5 },
    { text: 'Couldn\'t miss.',  condition: (c) => !!(c.stats?.fga >= 8 && c.stats?.fgm / c.stats?.fga >= 0.65), weight: 4 },

    // Milestones
    { text: 'Triple-double machine.', condition: (c) => isTripleDouble(c.stats), weight: 6 },
    { text: 'Double-double machine.', condition: (c) => isDoubleDouble(c.stats) && !isTripleDouble(c.stats), weight: 4 },

    // Context
    { text: 'Clutch.',         condition: (c) => (c.game?.lead ?? 99) <= 5 && c.game?.winnerId === c.team?.id, weight: 5 },
    { text: 'Rookie of the Year?', condition: (c) => isRookie(c.player) && (c.stats?.pts ?? 0) >= 20, weight: 5 },
    { text: 'DPOY?',           condition: (c) => (c.stats?.stl ?? 0) >= 4 || (c.stats?.blk ?? 0) >= 5, weight: 5 },

    // Defense
    { text: 'Locked in on both ends.', condition: (c) => (c.stats?.pts ?? 0) >= 22 && ((c.stats?.stl ?? 0) >= 3 || (c.stats?.blk ?? 0) >= 3), weight: 4 },
];

function getHCOutro(ctx: SocialContext): string {
    const valid = HC_OUTROS.filter(o => o.condition(ctx));
    if (!valid.length) return 'Hooper.';
    return pick(valid).text;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const HOOP_CENTRAL_TEMPLATES: SocialTemplate[] = [

    // ── MAIN DYNAMIC ─────────────────────────────────────────────────────────
    {
        id: 'hc_dynamic',
        handle: 'hoop_central',
        template: 'DYNAMIC',
        priority: (ctx: SocialContext) => {
            if (!ctx.stats) return 0;
            const s = ctx.stats;
            let p = 30;
            if (s.pts >= 40) p += 50;
            else if (s.pts >= 32) p += 30;
            else if (s.pts >= 25) p += 18;
            if (s.pts >= 25 && s.fgm / s.fga > 0.55) p += 15;
            return Math.min(p, 95);
        },
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && ctx.stats.pts >= 22),
        resolve: (_: string, ctx: SocialContext) => ({
            content: [
                getHCIntro(ctx),
                '',
                buildHCStatBlock(ctx.stats),
                '',
                getHCOutro(ctx),
            ].join('\n'),
        }),
    },

    // ── ONE-LINER BAG POST ────────────────────────────────────────────────────
    // "X was in his bag tonight. Y PTS." — the signature HC format
    // Distinct from the full stat block version — fires as a standalone hype post
    {
        id: 'hc_bag_oneliner',
        handle: 'hoop_central',
        template: 'DYNAMIC',
        priority: 78,
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && ctx.stats.pts >= 30),
        resolve: (_: string, ctx: SocialContext) => {
            const name = ctx.player?.name ?? 'Unknown';
            const pts  = ctx.stats.pts;
            const variants = [
                `${name} was in his bag tonight. ${pts} PTS.`,
                `${name} was cooking. ${pts} PTS.`,
                `${name} went to work. ${pts} PTS.`,
                `${name} was unstoppable. ${pts} PTS.`,
                `${name} put on a show. ${pts} PTS.`,
            ];
            return {
                content: variants[Math.floor(Math.random() * variants.length)],
            };
        },
    },

    // ── DOMINANT DOUBLE-DOUBLE ────────────────────────────────────────────────
    {
        id: 'hc_dominant_dd',
        handle: 'hoop_central',
        template: 'DYNAMIC',
        priority: 82,
        type: 'statline',
        condition: (ctx: SocialContext) => {
            const s = ctx.stats;
            return !!(s && isDoubleDouble(s) && s.pts >= 22 && s.reb >= 10);
        },
        resolve: (_: string, ctx: SocialContext) => {
            const s    = ctx.stats;
            const name = ctx.player?.name ?? 'Unknown';
            return {
                content: [
                    `${name} tonight:`,
                    '',
                    `${s.pts} PTS`,
                    `${s.reb} REB`,
                    s.ast >= 5 ? `${s.ast} AST` : null,
                    s.blk >= 3 ? `${s.blk} BLK` : null,
                    '',
                    'Double-double machine.',
                ].filter(Boolean).join('\n'),
            };
        },
    },

    // ── INJURY ────────────────────────────────────────────────────────────────
    {
        id: 'hc_injury',
        handle: 'hoop_central',
        template: 'DYNAMIC',
        priority: 85,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) > 83
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
                content: `Damn. ${ctx.player?.name} is expected to miss ${timeStr} with a ${ctx.injury.injuryType}. Get well soon 🙏`,
            };
        },
    },

    // ── LOAD MANAGEMENT ──────────────────────────────────────────────────────
    {
        id: 'hc_load_management',
        handle: 'hoop_central',
        template: 'DYNAMIC',
        priority: 65,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player && ctx.injury.injuryType === 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => ({
            content: `${ctx.player?.name} is resting tonight vs the ${ctx.opponent?.name}.`,
        }),
    },
];