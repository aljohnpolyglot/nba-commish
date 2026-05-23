import { SocialTemplate } from '../types';
import {
    isAllStar,
    isDoubleDouble,
    is5x5,
    isRookie,
    isTripleDouble,
    calculateAge,
    getCurrentSeasonStats,
    getStatlineString,
    get2KRating,
} from '../helpers';
import {
    buildStatmuseStatBlock,
    createDynamicStatmuseTemplate,
    getContextualStatmuseOutro,
    getStatmuseHistoricalHook,
    resolveStatmuseMedia,
} from './statmuseShared';

function getContextStats(ctx: Parameters<NonNullable<SocialTemplate['condition']>>[0]) {
    if (ctx.stats) return ctx.stats;
    const playerId = ctx.player?.internalId;
    if (!playerId) return null;
    return [...(ctx.game?.homeStats ?? []), ...(ctx.game?.awayStats ?? [])]
        .find(stat => stat.playerId === playerId) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIFIC TEMPLATES — each fires only when the story is genuinely there
// ─────────────────────────────────────────────────────────────────────────────

export const STATMUSE_TEMPLATES: SocialTemplate[] = [

    // ── DYNAMIC (main) ───────────────────────────────────────────────────────
    createDynamicStatmuseTemplate(),

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
            const hook = getStatmuseHistoricalHook(ctx);
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
                ...resolveStatmuseMedia(ctx),
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
            const hook = getStatmuseHistoricalHook(ctx);
            const outro = getContextualStatmuseOutro(ctx);
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
                ...resolveStatmuseMedia(ctx),
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
                ...resolveStatmuseMedia(ctx),
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
            const hook = getStatmuseHistoricalHook(ctx);
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
                ...resolveStatmuseMedia(ctx),
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
            !!(getContextStats(ctx) &&
               ctx.game?.gameWinner?.isWalkoff &&
               ctx.game?.gameWinner?.playerId === ctx.player?.internalId),
        resolve: (_, ctx) => {
            const s = getContextStats(ctx);
            if (!s) {
                return {
                    content: `${ctx.player?.name ?? 'Unknown'} hit the buzzer beater.`,
                    ...resolveStatmuseMedia(ctx),
                };
            }
            const gw = ctx.game.gameWinner;
            const shotLabel =
                gw?.shotType === 'clutch_3' ? 'game-winning three'
              : gw?.shotType === 'clutch_2' ? 'game-winning bucket'
              : 'buzzer beater';
            const hook = getStatmuseHistoricalHook(ctx);
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
                ...resolveStatmuseMedia(ctx),
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
                ...resolveStatmuseMedia(ctx),
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
            const hook = getStatmuseHistoricalHook(ctx);
            const sb = buildStatmuseStatBlock(ctx);
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
                ...resolveStatmuseMedia(ctx),
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
            const sb = buildStatmuseStatBlock(ctx);
            const hook = getStatmuseHistoricalHook(ctx);
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
                ...resolveStatmuseMedia(ctx),
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
                ...resolveStatmuseMedia(ctx),
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
            const hook = getStatmuseHistoricalHook(ctx);
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
                ...resolveStatmuseMedia(ctx),
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
                ...resolveStatmuseMedia(ctx),
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
                ...resolveStatmuseMedia(ctx),
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
                buildStatmuseStatBlock(ctx),
                '',
                'Most underrated player in the league.',
            ].join('\n'),
            ...resolveStatmuseMedia(ctx),
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
                ...resolveStatmuseMedia(ctx),
            };
        },
    },
];
