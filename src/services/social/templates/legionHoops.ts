import { SocialTemplate, SocialContext } from '../types';
import { getRating, getRandomTime, isTripleDouble, isDoubleDouble, calculateAge, isRookie, get2KRating } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// LEGION HOOPS — hype-first, breaking news style, clutch moments
// Known for: "BREAKING:", "UPDATE:", "Strictly bag work.", clutch clock posts
// Key fix: BREAKING only fires on actually breaking situations
// ─────────────────────────────────────────────────────────────────────────────

function pick<T extends { weight: number }>(arr: T[]): T {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of arr) { r -= item.weight; if (r <= 0) return item; }
    return arr[arr.length - 1];
}

// ── INTRO — context-aware, BREAKING only when deserved ───────────────────────
function getLHIntro(ctx: SocialContext): string {
    const name    = ctx.player?.name ?? 'Unknown';
    const oppName = ctx.opponent?.name ?? 'the opponent';
    const s       = ctx.stats;

    // BREAKING only for genuinely elite performances
    if (s?.pts >= 45)                          return `BREAKING: ${name} just dropped ${s.pts}:`;
    if (isTripleDouble(s) && s?.pts >= 30)     return `BREAKING: ${name} just went off:`;
    if (s?.pts >= 35 && s?.stl >= 4)           return `BREAKING: ${name} just went off:`;

    // UPDATE for notable but not historic
    if (s?.pts >= 30 && s?.pts < 45)           return `UPDATE: ${name} tonight:`;
    if (isTripleDouble(s))                     return `UPDATE: ${name} tonight:`;
    if (isDoubleDouble(s) && s?.pts >= 25)     return `UPDATE: ${name} tonight:`;

    // Standard intros for everything else
    if (ctx.opponent)                          return `${name} vs the ${oppName}:`;
    const pool = [
        `${name} tonight:`,
        `${name} was UNREAL tonight:`,
        `Incredible performance from ${name}:`,
        `Look at this statline from ${name}:`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── STAT BLOCK ───────────────────────────────────────────────────────────────
// LegionHoops shows the main stats — cleaner than BasketballForever's dump
function buildLHStatBlock(s: any): string {
    if (!s) return '';
    const lines: string[] = [`${s.pts} PTS`];
    if (s.reb >= 6)    lines.push(`${s.reb} REB`);
    if (s.ast >= 5)    lines.push(`${s.ast} AST`);
    if (s.stl >= 2)    lines.push(`${s.stl} STL`);
    if (s.blk >= 2)    lines.push(`${s.blk} BLK`);
    if (s.threePm >= 4) lines.push(`${s.threePm} 3PM`);
    return lines.join('\n');
}

// ── OUTROS ───────────────────────────────────────────────────────────────────
interface OutroOpt { text: string; condition: (ctx: SocialContext) => boolean; weight: number; }

const LH_OUTROS: OutroOpt[] = [
    { text: 'Wow.',             condition: () => true, weight: 4 },
    { text: 'Incredible.',      condition: () => true, weight: 4 },
    { text: 'Unreal.',          condition: () => true, weight: 3 },
    { text: 'He is special.',   condition: () => true, weight: 3 },
    { text: 'What a performance.', condition: () => true, weight: 3 },
    { text: 'Dominance.',       condition: (c) => (c.stats?.pts ?? 0) >= 30, weight: 4 },
    { text: 'MVP level.',       condition: (c) => (c.stats?.pts ?? 0) >= 32, weight: 3 },
    { text: 'Best PG in the league?', condition: (c) => c.player?.pos === 'PG' && (c.stats?.pts ?? 0) >= 28, weight: 3 },
    { text: 'Best Center in the league?', condition: (c) => c.player?.pos === 'C' && (c.stats?.pts ?? 0) >= 25, weight: 3 },
    { text: 'Rookie of the Year?', condition: (c) => isRookie(c.player) && (c.stats?.pts ?? 0) >= 20, weight: 5 },
    { text: 'Clutch.',          condition: (c) => (c.game?.lead ?? 99) <= 5 && c.game?.winnerId === c.team?.id, weight: 5 },
    { text: 'Triple-double.',   condition: (c) => isTripleDouble(c.stats), weight: 6 },
    { text: 'Put some respect on his name.', condition: (c) => (c.stats?.pts ?? 0) >= 28 && !c.player?.awards?.length, weight: 3 },
];

function getLHOutro(ctx: SocialContext): string {
    const valid = LH_OUTROS.filter(o => o.condition(ctx));
    if (!valid.length) return 'Wow.';
    return pick(valid).text;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const LEGION_HOOPS_TEMPLATES: SocialTemplate[] = [

    // ── MAIN DYNAMIC ─────────────────────────────────────────────────────────
    {
        id: 'lh_dynamic',
        handle: 'legion_hoops',
        template: 'DYNAMIC',
        priority: (ctx: SocialContext) => {
            if (!ctx.stats) return 0;
            const s = ctx.stats;
            let p = 35;
            if (s.pts >= 45) p += 55;
            else if (s.pts >= 35) p += 35;
            else if (s.pts >= 28) p += 18;
            if (ctx.game?.isOT) p += 20;
            if (isTripleDouble(s)) p += 22;
            return Math.min(p, 95);
        },
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && ctx.stats.pts >= 22),
        resolve: (_: string, ctx: SocialContext) => ({
            content: [
                getLHIntro(ctx),
                '',
                buildLHStatBlock(ctx.stats),
                '',
                getLHOutro(ctx),
            ].join('\n'),
        }),
    },

    // ── CLUTCH MOMENT ─────────────────────────────────────────────────────────
    // This is the best LegionHoops template — the clock countdown
    {
        id: 'lh_clutch',
        handle: 'legion_hoops',
        template: 'DYNAMIC',
        priority: 96,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats
                && ctx.stats.pts >= 22
                && (ctx.game?.lead ?? 99) <= 4
                && ctx.game?.winnerId === ctx.team?.id
                && !ctx.game?.gameWinner?.isWalkoff), // walkoff has its own template
        resolve: (_: string, ctx: SocialContext) => ({
            content: [
                'CLUTCH. 🔥',
                '',
                `${ctx.player?.name} with the huge bucket to put the ${ctx.team?.name} up late!`,
                '',
                `${getRandomTime()} remaining.`,
            ].join('\n'),
        }),
    },

    // ── BAG WORK ─────────────────────────────────────────────────────────────
    // Fixed: raised threshold to 32+ so it's actually elite
    {
        id: 'lh_bag_work',
        handle: 'legion_hoops',
        template: 'DYNAMIC',
        priority: 85,
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && ctx.stats.pts >= 32),
        resolve: (_: string, ctx: SocialContext) => {
            const s = ctx.stats;
            const g = ctx.game;
            const homeTeamObj = ctx.teams?.find((t: any) => t.id === g?.homeTeamId);
            const awayTeamObj = ctx.teams?.find((t: any) => t.id === g?.awayTeamId);
            return {
                content: [
                    `${ctx.player?.name} was in his bag tonight:`,
                    '',
                    `${s.pts} PTS`,
                    s.reb >= 6 ? `${s.reb} REB` : null,
                    s.ast >= 5 ? `${s.ast} AST` : null,
                    s.threePm >= 4 ? `${s.threePm} 3PM` : null,
                    '',
                    'Strictly bag work. (via @realapp)',
                ].filter(Boolean).join('\n'),
                data: {
                    playerName: ctx.player?.name,
                    teamColor: (ctx.team as any)?.colors?.[0] ?? '#1d428a',
                    teamLogoUrl: ctx.team?.logoUrl,
                    stats: {
                        pts: s.pts, reb: s.reb, ast: s.ast,
                        fgm: s.fgm, fga: s.fga,
                        fgPct: s.fga > 0 ? Number(((s.fgm / s.fga) * 100).toFixed(0)) : null,
                        threePm: s.threePm, threePa: s.threePa,
                        stl: s.stl, blk: s.blk, tov: s.tov, min: s.min,
                    },
                    homeTeam: homeTeamObj ? { abbrev: homeTeamObj.abbrev, logoUrl: homeTeamObj.logoUrl, score: g?.homeScore } : undefined,
                    awayTeam: awayTeamObj ? { abbrev: awayTeamObj.abbrev, logoUrl: awayTeamObj.logoUrl, score: g?.awayScore } : undefined,
                    isOT: g?.isOT,
                },
            };
        },
    },

    // ── WALKOFF CALL ─────────────────────────────────────────────────────────
    {
        id: 'lh_walkoff',
        handle: 'legion_hoops',
        template: 'DYNAMIC',
        priority: 98,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.game?.gameWinner?.isWalkoff &&
               ctx.game?.gameWinner?.playerId === ctx.player?.internalId),
        resolve: (_: string, ctx: SocialContext) => {
            const name = ctx.player?.name ?? 'Unknown';
            const shotType = ctx.game.gameWinner?.shotType;
            const shotLabel = shotType === 'clutch_3' ? 'THREE' : 'BUCKET';
            const teamName  = ctx.teams?.find((t: any) => t.id === ctx.game.winnerId)?.name ?? 'The team';
            return {
                content: [
                    `CLUTCH. 🔥`,
                    '',
                    `${name} with the game-winning ${shotLabel} to put the ${teamName} up!`,
                    '',
                    `${getRandomTime()} remaining.`,
                ].join('\n'),
            };
        },
    },

    // ── ROOKIE SPOTLIGHT ─────────────────────────────────────────────────────
    {
        id: 'lh_rookie',
        handle: 'legion_hoops',
        template: 'DYNAMIC',
        priority: 84,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.player && isRookie(ctx.player) && ctx.stats && ctx.stats.pts >= 22),
        resolve: (_: string, ctx: SocialContext) => {
            const s   = ctx.stats;
            const age = calculateAge(ctx.player);
            return {
                content: [
                    `BREAKING: ${ctx.player?.name} (${age}) just went off:`,
                    '',
                    buildLHStatBlock(s),
                    '',
                    'Rookie of the Year?',
                ].join('\n'),
            };
        },
    },

    // ── INJURY ────────────────────────────────────────────────────────────────
    {
        id: 'lh_injury',
        handle: 'legion_hoops',
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
                : games <= 35  ? '4-to-6 weeks'
                : games >= 60  ? 'the rest of the season'
                : 'multiple months';
            return {
                content: `UPDATE: ${ctx.player?.name} has suffered a ${ctx.injury.injuryType} and is expected to miss ${timeStr}.`,
            };
        },
    },
];