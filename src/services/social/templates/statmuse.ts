import { SocialTemplate, SocialContext } from '../types';
import {
    isRookie, isVeteran, isAllStar, isTripleDouble, isDoubleDouble,
    calculateAge, getCareerHigh, getCurrentSeasonStats, getRating,
    is5x5, getStatlineString, get2KRating
} from '../helpers';
import { STATMUSE_PLAYER_IMAGES } from '../../../data/social/statmuseImages';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const getStatmuseImage = (playerName: string): string | null => {
    if (!playerName) return null;
    if (STATMUSE_PLAYER_IMAGES[playerName]) return STATMUSE_PLAYER_IMAGES[playerName];
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const ni = norm(playerName);
    for (const key in STATMUSE_PLAYER_IMAGES) {
        if (norm(key) === ni) return STATMUSE_PLAYER_IMAGES[key];
    }
    return null;
};

const resolveMedia = (ctx: SocialContext) => ({
    mediaUrl: ctx.player ? getStatmuseImage(ctx.player.name) ?? undefined : undefined,
    mediaBackgroundColor: ctx.team?.colors?.[0] ?? '#1a1a2e',
});

/** Weighted random pick */
function weightedPick<T extends { weight: number }>(arr: T[]): T {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of arr) { r -= item.weight; if (r <= 0) return item; }
    return arr[arr.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART STAT BLOCK
// Only surfaces numbers that are genuinely impressive for this game
// ─────────────────────────────────────────────────────────────────────────────

function buildStatBlock(ctx: SocialContext): string {
    const s = ctx.stats;
    if (!s) return '';
    const lines: string[] = [];

    lines.push(`${s.pts} PTS`);

    // FG line — only if notable efficiency or volume
    const fgPct = s.fga > 0 ? s.fgm / s.fga : 0;
    if (s.fga >= 8) {
        lines.push(`${s.fgm}/${s.fga} FG${fgPct >= 0.60 ? ' 🔥' : ''}`);
    }

    // 3PT — only if 4+ made, or 3+ made in a 30-point game
    if (s.threePm >= 4) lines.push(`${s.threePm}/${s.threePa} 3PT`);
    else if (s.threePm >= 3 && s.pts >= 30) lines.push(`${s.threePm} 3PT`);

    // Rebounds — scale threshold by position proxy
    const hgt = ctx.player ? getRating(ctx.player, 'hgt') : 76;
    const rebThreshold = hgt > 78 ? 10 : hgt > 74 ? 8 : 6;
    if (s.reb >= rebThreshold) lines.push(`${s.reb} REB`);

    // AST
    if (s.ast >= 7) lines.push(`${s.ast} AST`);
    else if (s.ast >= 5 && isTripleDouble(s)) lines.push(`${s.ast} AST`);

    // STL / BLK — only if elite
    if (s.stl >= 3) lines.push(`${s.stl} STL`);
    if (s.blk >= 3) lines.push(`${s.blk} BLK`);

    // TS% — only if high volume + exceptional efficiency
    if (s.tsPct && s.tsPct >= 0.72 && s.pts >= 25 && s.fga >= 10) {
        lines.push(`${(s.tsPct * 100).toFixed(0)}% TS`);
    }

    return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-REACTIVE INTRO
// Reads the actual story of the game before picking a line
// ─────────────────────────────────────────────────────────────────────────────

function getContextualIntro(ctx: SocialContext): string {
    const { player, team, opponent, stats, game } = ctx;
    const name    = player?.name ?? 'Unknown';
    const oppName = opponent?.name ?? 'the opponent';
    const isWin   = game?.winnerId === team?.id;
    const isClose = (game?.lead ?? 99) <= 5;
    const isOT    = game?.isOT;
    const age     = player ? calculateAge(player) : 25;

    if (game?.isAllStar)                          return `${name} in the All-Star Game:`;
    if (isOT && isWin && (stats?.pts ?? 0) >= 20) return `${name} in overtime:`;
    if (isClose && isWin && (stats?.pts ?? 0) >= 25) return `${name} willed them to the win:`;
    if (isClose && isWin)                         return `${name} in the clutch:`;
    if ((game?.lead ?? 0) >= 20 && isWin && (stats?.pts ?? 0) >= 30)
                                                   return `${name} put on a show:`;
    if (isRookie(player) && (stats?.pts ?? 0) >= 25) return `The ${age}-year-old rookie:`;
    if (isVeteran(player) && age >= 35 && (stats?.pts ?? 0) >= 22)
                                                   return `${name} at ${age} years old:`;
    if (opponent)                                  return `${name} vs. the ${oppName}:`;

    const fallbacks = [
        `${name} tonight:`,
        `${name} went off:`,
        `${name} masterclass:`,
        `${name} in the ${isWin ? 'win' : 'loss'}:`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-REACTIVE OUTRO
// Each outro only fires when earned — no more "MVP?" on 20-pt garbage time
// ─────────────────────────────────────────────────────────────────────────────

interface OutroOption { text: string; condition: (ctx: SocialContext) => boolean; weight: number; }

const OUTROS: OutroOption[] = [
    // Universal (low weight — last resort)
    { text: 'Muse.',    condition: () => true, weight: 2 },
    { text: 'Special.', condition: () => true, weight: 2 },

    // Efficiency
    { text: 'Couldn\'t miss.',      condition: (c) => c.stats?.fga > 0 && c.stats.fgm / c.stats.fga >= 0.65 && c.stats.fga >= 8, weight: 5 },
    { text: 'Efficient.',           condition: (c) => !!(c.stats?.tsPct && c.stats.tsPct >= 0.65 && c.stats.pts >= 20), weight: 4 },
    { text: 'Perfect game.',        condition: (c) => c.stats?.fga >= 5 && c.stats?.fgm === c.stats?.fga, weight: 9 },

    // Volume scoring tiers
    { text: 'Bucket.',              condition: (c) => (c.stats?.pts ?? 0) >= 28 && (c.stats?.pts ?? 0) < 40, weight: 4 },
    { text: 'Elite.',               condition: (c) => c.player != null && get2KRating(c.player) >= 94 && (c.stats?.pts ?? 0) >= 25, weight: 3 },
    { text: 'Him.',                 condition: (c) => c.player != null && get2KRating(c.player) >= 98 && (c.stats?.pts ?? 0) >= 30, weight: 3 },
    { text: 'Unstoppable.',         condition: (c) => (c.stats?.pts ?? 0) >= 40, weight: 5 },
    { text: 'Video game numbers.',  condition: (c) => (c.stats?.pts ?? 0) >= 45, weight: 5 },
    { text: 'Nuclear.',             condition: (c) => (c.stats?.pts ?? 0) >= 50, weight: 6 },
    { text: 'Best player on the planet?', condition: (c) => (c.stats?.pts ?? 0) >= 50, weight: 4 },

    // Game situation
    { text: 'Clutch.',              condition: (c) => (c.game?.lead ?? 99) <= 5 && c.game?.winnerId === c.team?.id, weight: 6 },
    { text: 'When it mattered.',    condition: (c) => (c.game?.lead ?? 99) <= 3 && c.game?.winnerId === c.team?.id && (c.stats?.pts ?? 0) >= 25, weight: 5 },
    { text: 'OT hero.',             condition: (c) => !!c.game?.isOT && c.game?.winnerId === c.team?.id && (c.stats?.pts ?? 0) >= 20, weight: 7 },
    { text: 'Carried them.',        condition: (c) => (c.stats?.pts ?? 0) >= 35 && c.game?.winnerId === c.team?.id, weight: 4 },
    { text: 'Not enough.',          condition: (c) => (c.stats?.pts ?? 0) >= 35 && c.game?.winnerId !== c.team?.id, weight: 6 },
    { text: 'They still lost.',     condition: (c) => (c.stats?.pts ?? 0) >= 42 && c.game?.winnerId !== c.team?.id, weight: 7 },

    // Awards / recognition
    { text: 'MVP?',                 condition: (c) => (c.stats?.pts ?? 0) >= 38 && isAllStar(c.player), weight: 4 },
    { text: 'MVP conversation.',    condition: (c) => (c.stats?.pts ?? 0) >= 30 && isAllStar(c.player), weight: 3 },
    { text: 'Top 5 player?',        condition: (c) => (c.stats?.pts ?? 0) >= 42 && isAllStar(c.player), weight: 3 },
    { text: 'Rookie of the Year?',  condition: (c) => isRookie(c.player) && (c.stats?.pts ?? 0) >= 20, weight: 7 },
    { text: 'Generational.',        condition: (c) => isRookie(c.player) && (c.stats?.pts ?? 0) >= 28, weight: 6 },
    { text: 'DPOY conversation.',   condition: (c) => (c.stats?.stl ?? 0) >= 4 || (c.stats?.blk ?? 0) >= 5, weight: 6 },

    // Veteran / underrated
    { text: 'Still got it.',        condition: (c) => isVeteran(c.player) && calculateAge(c.player) >= 35 && (c.stats?.pts ?? 0) >= 20, weight: 6 },
    { text: 'Most underrated in the league.', condition: (c) => !isAllStar(c.player) && (c.stats?.pts ?? 0) >= 28, weight: 4 },
    { text: 'Best contract in basketball.', condition: (c) => !isAllStar(c.player) && (c.stats?.pts ?? 0) >= 25 && c.player != null && get2KRating(c.player) >= 88, weight: 3 },

    // Milestone
    { text: 'Does everything.',     condition: (c) => isTripleDouble(c.stats) && (c.stats?.blk ?? 0) >= 2 && (c.stats?.stl ?? 0) >= 2, weight: 6 },
    { text: '5×5. Rare.',           condition: (c) => is5x5(c.stats), weight: 10 },
    { text: 'Don\'t leave him open.', condition: (c) => (c.stats?.threePm ?? 0) >= 6, weight: 5 },
    { text: '3-point barrage.',     condition: (c) => (c.stats?.threePm ?? 0) >= 8, weight: 6 },
    { text: 'Locked in on both ends.', condition: (c) => (c.stats?.pts ?? 0) >= 25 && ((c.stats?.stl ?? 0) >= 3 || (c.stats?.blk ?? 0) >= 3), weight: 5 },
];

function getContextualOutro(ctx: SocialContext): string {
    const valid = OUTROS.filter(o => o.condition(ctx));
    if (!valid.length) return 'Muse.';
    const picked = weightedPick(valid);

    // Dynamic outro: "Year X. Still."
    if (picked.text === 'Still got it.' && ctx.player?.draft?.year) {
        const years = 2026 - ctx.player.draft.year;
        return `Year ${years}. Still.`;
    }
    return picked.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL HOOK
// Pulls from actual player career/season data — no fabricated facts
// ─────────────────────────────────────────────────────────────────────────────

function getHistoricalHook(ctx: SocialContext): string | null {
    const { player, stats } = ctx;
    if (!player || !stats) return null;

    const careerHighPts = getCareerHigh(player, 'pts');
    const careerHighReb = getCareerHigh(player, 'trb');
    const careerHighAst = getCareerHigh(player, 'ast');
    const season        = getCurrentSeasonStats(player);

    // New career high — points
    if (careerHighPts > 0 && stats.pts > careerHighPts) {
        return `New career high. ${stats.pts} points — surpassing his previous best of ${careerHighPts}.`;
    }

    // Tied career high — points (only if 30+, otherwise not noteworthy)
    if (careerHighPts >= 30 && stats.pts === careerHighPts) {
        return `Ties his career high with ${stats.pts} points.`;
    }

    // New career high — rebounds
    if (careerHighReb > 0 && stats.reb > careerHighReb && stats.reb >= 14) {
        return `New career high in rebounds — ${stats.reb}.`;
    }

    // New career high — assists
    if (careerHighAst > 0 && stats.ast > careerHighAst && stats.ast >= 12) {
        return `Career high in assists — ${stats.ast} dimes.`;
    }

    // vs season average — only if wildly above it
    if (season) {
        const avgPts = season.pts || 0;
        if (avgPts > 0 && stats.pts >= avgPts * 1.9 && stats.pts >= 35) {
            return `He's averaging ${avgPts.toFixed(1)} PPG this season. Not tonight.`;
        }
        if (avgPts > 0 && stats.pts >= avgPts * 1.6 && stats.pts >= 40) {
            return `Season average: ${avgPts.toFixed(1)} PPG. Put that aside.`;
        }
    }

    // Career triple-double count
    if (isTripleDouble(stats) && player.stats?.length) {
        const tdCount = player.stats.reduce((count: number, s: any) => {
            const cats = [
                (s.ptsMax ?? s.pts ?? 0) >= 10,
                (s.rebMax ?? s.trb ?? 0) >= 10,
                (s.astMax ?? s.ast ?? 0) >= 10,
            ].filter(Boolean).length;
            return count + (cats >= 3 ? 1 : 0);
        }, 0);
        if (tdCount <= 5) {
            const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
            return `His ${ordinals[tdCount] ?? `${tdCount + 1}th`} triple-double of this season.`;
        }
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE DYNAMIC TEMPLATE — main workhorse
// ─────────────────────────────────────────────────────────────────────────────

const createDynamicTemplate = (): SocialTemplate => ({
    id: 'statmuse_dynamic',
    handle: 'statmuse',
    template: 'DYNAMIC',
    priority: (ctx: SocialContext) => {
        if (!ctx.stats) return 0;
        const s = ctx.stats;
        let p = 40;
        if (s.pts >= 50) p += 55;
        else if (s.pts >= 40) p += 40;
        else if (s.pts >= 35) p += 25;
        else if (s.pts >= 30) p += 15;
        else if (s.pts >= 25) p += 8;
        if (isTripleDouble(s)) p += 25;
        else if (isDoubleDouble(s)) p += 8;
        if ((s.stl ?? 0) >= 5 || (s.blk ?? 0) >= 5) p += 18;
        if (is5x5(s)) p += 35;
        if (ctx.game?.isOT && ctx.game?.winnerId === ctx.team?.id) p += 10;
        return Math.min(p, 100);
    },
    type: 'statline',
    condition: (ctx: SocialContext) => !!(ctx.stats && ctx.stats.pts >= 18),
    resolve: (_: string, ctx: SocialContext) => {
        const intro     = getContextualIntro(ctx);
        const statBlock = buildStatBlock(ctx);
        const outro     = getContextualOutro(ctx);
        const hook      = getHistoricalHook(ctx);

        const parts = [intro, '', statBlock, ''];
        if (hook) parts.push(hook, '');
        parts.push(outro);

        return { content: parts.join('\n'), ...resolveMedia(ctx) };
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// SPECIFIC TEMPLATES — each fires only when the story is genuinely there
// ─────────────────────────────────────────────────────────────────────────────

export const STATMUSE_TEMPLATES: SocialTemplate[] = [

    // ── DYNAMIC (main) ───────────────────────────────────────────────────────
    createDynamicTemplate(),

    // ── PERFECT SHOOTING GAME ────────────────────────────────────────────────
    {
        id: 'sm_perfect_shooting',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 100,
        type: 'statline',
        condition: (ctx) =>
            !!(ctx.stats && ctx.stats.fga >= 6 && ctx.stats.fgm === ctx.stats.fga && ctx.stats.pts >= 15),
        resolve: (_, ctx) => {
            const s = ctx.stats;
            const hook = getHistoricalHook(ctx);
            return {
                content: [
                    `${ctx.player?.name} tonight:`,
                    '',
                    `${s.pts} PTS`,
                    `${s.fgm}/${s.fga} FG`,
                    s.threePm > 0 ? `${s.threePm}/${s.threePa} 3PT` : null,
                    s.ftm > 0    ? `${s.ftm}/${s.fta} FT`           : null,
                    '',
                    hook ?? 'Perfect.',
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── TRIPLE-DOUBLE ─────────────────────────────────────────────────────────
    {
        id: 'sm_triple_double',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 95,
        type: 'statline',
        condition: (ctx) => !!(ctx.stats && isTripleDouble(ctx.stats)),
        resolve: (_, ctx) => {
            const s = ctx.stats;
            const hook  = getHistoricalHook(ctx);
            const outro = getContextualOutro(ctx);
            const ddCats = [
                s.pts  >= 10 ? `${s.pts} PTS`  : null,
                s.reb  >= 10 ? `${s.reb} REB`  : null,
                s.ast  >= 10 ? `${s.ast} AST`  : null,
                s.stl  >= 10 ? `${s.stl} STL`  : null,
                s.blk  >= 10 ? `${s.blk} BLK`  : null,
            ].filter(Boolean);

            return {
                content: [
                    `${ctx.player?.name} triple-double:`,
                    '',
                    ...ddCats,
                    s.fga >= 8 ? `${s.fgm}/${s.fga} FG` : null,
                    '',
                    hook ?? outro,
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── 5×5 ───────────────────────────────────────────────────────────────────
    {
        id: 'sm_5x5',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 100,
        type: 'statline',
        condition: (ctx) => !!(ctx.stats && is5x5(ctx.stats)),
        resolve: (_, ctx) => {
            const s = ctx.stats;
            return {
                content: [
                    `${ctx.player?.name} just recorded a 5×5:`,
                    '',
                    `${s.pts} PTS`,
                    `${s.reb} REB`,
                    `${s.ast} AST`,
                    `${s.stl} STL`,
                    `${s.blk} BLK`,
                    '',
                    'One of the rarest stat lines in basketball.',
                ].join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── 50-POINT GAME ─────────────────────────────────────────────────────────
    {
        id: 'sm_fifty',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 100,
        type: 'statline',
        condition: (ctx) => !!(ctx.stats && ctx.stats.pts >= 50),
        resolve: (_, ctx) => {
            const s    = ctx.stats;
            const hook = getHistoricalHook(ctx);
            const isCareerHigh = hook?.includes('career high');
            return {
                content: [
                    `${ctx.player?.name} just dropped ${s.pts}.`,
                    '',
                    `${s.pts} PTS`,
                    `${s.fgm}/${s.fga} FG`,
                    s.threePm >= 3 ? `${s.threePm}/${s.threePa} 3PT` : null,
                    s.reb >= 6    ? `${s.reb} REB`                   : null,
                    s.ast >= 5    ? `${s.ast} AST`                   : null,
                    '',
                    isCareerHigh ? hook : (hook ?? 'Best player on the planet?'),
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── CLUTCH WALKOFF / BUZZER BEATER ───────────────────────────────────────
    {
        id: 'sm_walkoff',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 98,
        type: 'statline',
        condition: (ctx) =>
            !!(ctx.game?.gameWinner?.isWalkoff &&
               ctx.game?.gameWinner?.playerId === ctx.player?.internalId),
        resolve: (_, ctx) => {
            const s  = ctx.stats;
            const gw = ctx.game.gameWinner;
            const shotLabel =
                gw?.shotType === 'clutch_3' ? 'game-winning three'
              : gw?.shotType === 'clutch_2' ? 'game-winning bucket'
              : 'buzzer beater';
            const hook = getHistoricalHook(ctx);
            return {
                content: [
                    `${ctx.player?.name} hit the ${shotLabel}.`,
                    '',
                    `${s.pts} PTS`,
                    `${s.fgm}/${s.fga} FG`,
                    s.ast >= 5 ? `${s.ast} AST` : null,
                    '',
                    hook ?? 'Clutch.',
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── DEFENSIVE MONSTER ────────────────────────────────────────────────────
    {
        id: 'sm_defensive_monster',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 88,
        type: 'statline',
        condition: (ctx) => !!(ctx.stats &&
            (ctx.stats.blk >= 5 || ctx.stats.stl >= 5 ||
            (ctx.stats.blk >= 3 && ctx.stats.stl >= 3))),
        resolve: (_, ctx) => {
            const s = ctx.stats;
            const isPure = s.pts < 15;
            return {
                content: [
                    isPure ? `${ctx.player?.name} locked it down:` : `${ctx.player?.name} on both ends:`,
                    '',
                    s.blk >= 3 ? `${s.blk} BLK` : null,
                    s.stl >= 3 ? `${s.stl} STL` : null,
                    s.reb >= 8 ? `${s.reb} REB` : null,
                    s.pts >= 10 ? `${s.pts} PTS` : null,
                    '',
                    isPure ? 'Defensive Player of the Year?' : 'DPOY conversation.',
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── ROOKIE BREAKOUT ───────────────────────────────────────────────────────
    {
        id: 'sm_rookie',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 87,
        type: 'statline',
        condition: (ctx) =>
            !!(ctx.player && isRookie(ctx.player) && ctx.stats && ctx.stats.pts >= 20),
        resolve: (_, ctx) => {
            const age  = calculateAge(ctx.player);
            const hook = getHistoricalHook(ctx);
            const sb   = buildStatBlock(ctx);
            const intros = [
                `The ${age}-year-old rookie:`,
                `${ctx.player?.name} rookie night:`,
                `${ctx.player?.name} at ${age}:`,
                `The future arrived:`,
            ];
            const outros = ['Rookie of the Year?', 'Generational.', 'The future is here.', 'Special.'];
            return {
                content: [
                    intros[Math.floor(Math.random() * intros.length)],
                    '',
                    sb,
                    '',
                    hook ?? outros[Math.floor(Math.random() * outros.length)],
                ].join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── VETERAN THROWBACK ─────────────────────────────────────────────────────
    // Fixed: removed the broken overallRating < 75 condition
    {
        id: 'sm_veteran',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 82,
        type: 'statline',
        condition: (ctx) => {
            if (!ctx.player || !ctx.stats) return false;
            const age = calculateAge(ctx.player);
            return age >= 33 && isAllStar(ctx.player) && ctx.stats.pts >= 18;
        },
        resolve: (_, ctx) => {
            const age      = calculateAge(ctx.player);
            const yearsIn  = 2026 - (ctx.player?.draft?.year ?? 2010);
            const sb       = buildStatBlock(ctx);
            const hook     = getHistoricalHook(ctx);
            const intros   = [
                `Vintage ${ctx.player?.name}:`,
                `${ctx.player?.name} turning back the clock:`,
                `${ctx.player?.name} at ${age} years old:`,
                `${ctx.player?.name} still has it:`,
            ];
            return {
                content: [
                    intros[Math.floor(Math.random() * intros.length)],
                    '',
                    sb,
                    '',
                    hook ?? `Year ${yearsIn}. Still.`,
                ].join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── EFFICIENCY SHOWCASE ───────────────────────────────────────────────────
    {
        id: 'sm_efficient',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 78,
        type: 'statline',
        condition: (ctx) => {
            const s = ctx.stats;
            if (!s || s.fga < 8 || s.pts < 22) return false;
            return s.fgm / s.fga >= 0.65 || (!!s.tsPct && s.tsPct >= 0.72);
        },
        resolve: (_, ctx) => {
            const s      = ctx.stats;
            const fgPct  = ((s.fgm / s.fga) * 100).toFixed(0);
            const tsPct  = s.tsPct ? `${(s.tsPct * 100).toFixed(0)}% TS` : null;
            return {
                content: [
                    `${ctx.player?.name} — maximum efficiency:`,
                    '',
                    `${s.pts} PTS`,
                    `${s.fgm}/${s.fga} FG (${fgPct}%)`,
                    tsPct,
                    s.threePm >= 3 ? `${s.threePm}/${s.threePa} 3PT` : null,
                    '',
                    'Couldn\'t miss.',
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── TRIPLE-THREAT (near triple-double) ───────────────────────────────────
    {
        id: 'sm_triple_threat',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 85,
        type: 'statline',
        condition: (ctx) => {
            const s = ctx.stats;
            return !!(s && s.pts >= 25 && s.reb >= 8 && s.ast >= 7 && !isTripleDouble(s));
        },
        resolve: (_, ctx) => {
            const s    = ctx.stats;
            const hook = getHistoricalHook(ctx);
            return {
                content: [
                    `${ctx.player?.name} doing it all:`,
                    '',
                    `${s.pts} PTS`,
                    `${s.reb} REB`,
                    `${s.ast} AST`,
                    s.fga >= 8 ? `${s.fgm}/${s.fga} FG` : null,
                    '',
                    hook ?? 'Complete player.',
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── 3-POINT BARRAGE ───────────────────────────────────────────────────────
    {
        id: 'sm_sharpshooting',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 80,
        type: 'statline',
        condition: (ctx) => !!(ctx.stats && ctx.stats.threePm >= 6 && ctx.stats.pts >= 24),
        resolve: (_, ctx) => {
            const s   = ctx.stats;
            const pct = s.threePa > 0 ? ((s.threePm / s.threePa) * 100).toFixed(0) : '—';
            return {
                content: [
                    `${ctx.player?.name} from deep:`,
                    '',
                    `${s.pts} PTS`,
                    `${s.threePm}/${s.threePa} 3PT (${pct}%)`,
                    s.fga >= 8 ? `${s.fgm}/${s.fga} FG` : null,
                    '',
                    s.threePm >= 8 ? '3-point barrage.' : 'Don\'t leave him open.',
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── ALL-STAR GAME ─────────────────────────────────────────────────────────
    {
        id: 'sm_allstar',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 85,
        type: 'statline',
        condition: (ctx) => !!(ctx.game?.isAllStar && ctx.stats && ctx.stats.pts >= 20),
        resolve: (_, ctx) => {
            const s = ctx.stats;
            return {
                content: [
                    `${ctx.player?.name} in the All-Star Game:`,
                    '',
                    `${s.pts} PTS`,
                    s.ast    >= 6 ? `${s.ast} AST`    : null,
                    s.threePm >= 4 ? `${s.threePm} 3PM` : null,
                    s.reb    >= 8 ? `${s.reb} REB`    : null,
                    '',
                    'All-Star MVP?',
                ].filter(Boolean).join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },

    // ── QUIET DOUBLE-DOUBLE (unsung hero) ────────────────────────────────────
    {
        id: 'sm_quiet_dd',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 65,
        type: 'statline',
        condition: (ctx) => {
            const s = ctx.stats;
            return !!(s && isDoubleDouble(s) && !isTripleDouble(s)
                && s.pts >= 15 && s.pts < 25 && !isAllStar(ctx.player));
        },
        resolve: (_, ctx) => ({
            content: [
                `${ctx.player?.name} quietly:`,
                '',
                buildStatBlock(ctx),
                '',
                'Most underrated player in the league.',
            ].join('\n'),
            ...resolveMedia(ctx),
        }),
    },

    // ── INJURY (high-profile player) ─────────────────────────────────────────
    {
        id: 'sm_injury',
        handle: 'statmuse',
        template: 'DYNAMIC',
        priority: 90,
        type: 'news',
        condition: (ctx) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) >= 86
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_, ctx) => {
            const season = getCurrentSeasonStats(ctx.player);
            const ppg    = season?.pts?.toFixed(1)  ?? '—';
            const rpg    = season ? ((season.trb ?? (season.orb ?? 0) + (season.drb ?? 0))).toFixed(1) : '—';
            const apg    = season?.ast?.toFixed(1)  ?? '—';
            const games  = ctx.injury.gamesRemaining;
            return {
                content: [
                    `${ctx.player?.name} is out ${games > 0 ? `${games} game${games !== 1 ? 's' : ''}` : 'indefinitely'} with a ${ctx.injury.injuryType}.`,
                    '',
                    'He was averaging:',
                    '',
                    `${ppg} PPG`,
                    `${rpg} RPG`,
                    `${apg} APG`,
                    '',
                    games >= 30 ? 'Season over?' : 'Tough loss.',
                ].join('\n'),
                ...resolveMedia(ctx),
            };
        },
    },
];