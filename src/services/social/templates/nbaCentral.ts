import { SocialTemplate, SocialContext } from '../types';
import { isRolePlayer, isTripleDouble, isDoubleDouble, getCurrentSeasonStats, calculateAge, isAllStar, get2KRating } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// NBA CENTRAL — debate-first, stats-second aggregator
// Posts high-volume, provocative takes. Always ends with a hook.
// Fires on good AND bad performances — that's the brand.
// ─────────────────────────────────────────────────────────────────────────────

/** Weighted random pick */
function pick<T extends { weight: number }>(arr: T[]): T {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of arr) { r -= item.weight; if (r <= 0) return item; }
    return arr[arr.length - 1];
}

// ── INTROS ────────────────────────────────────────────────────────────────────
// Each intro reads differently — varies by context, not random flat pool
function getNBACIntro(ctx: SocialContext): string {
    const name    = ctx.player?.name ?? 'Unknown';
    const oppName = ctx.opponent?.name ?? 'tonight\'s opponent';
    const s       = ctx.stats;

    if (!s) return `${name} tonight:`;

    // Bad game intros
    if (s.fga > 14 && s.fgm / s.fga < 0.35) return `${name} struggled tonight:`;
    if (s.tov >= 6) return `${name} had a rough one:`;
    if (s.pts < 12 && s.min > 25) return `${name} was quiet tonight:`;

    // Good game intros
    if (s.pts >= 40) return `${name} was DIFFERENT tonight:`;
    if (isTripleDouble(s)) return `${name} with the triple-double:`;
    if (ctx.opponent) return `${name} vs the ${oppName}:`;

    const pool = [
        `${name} tonight:`,
        `Look at ${name}:`,
        `${name} went crazy:`,
        `What a performance from ${name}:`,
        `${name} was unstoppable:`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── STAT BLOCK ────────────────────────────────────────────────────────────────
// NBACentral shows the full line — they're not selective like StatMuse
function buildNBACStatBlock(s: any): string {
    if (!s) return '';
    const lines: string[] = [`${s.pts} PTS`];
    if (s.reb >= 4)    lines.push(`${s.reb} REB`);
    if (s.ast >= 3)    lines.push(`${s.ast} AST`);
    if (s.stl >= 2)    lines.push(`${s.stl} STL`);
    if (s.blk >= 2)    lines.push(`${s.blk} BLK`);
    if (s.threePm >= 3) lines.push(`${s.threePm} 3PM`);
    // FG only if notable
    if (s.fga >= 10 && (s.fgm / s.fga < 0.35 || s.fgm / s.fga > 0.60)) {
        lines.push(`${s.fgm}/${s.fga} FG`);
    }
    return lines.join('\n');
}

// ── OUTROS ───────────────────────────────────────────────────────────────────
// NBACentral lives for debate — "Thoughts?" / "MVP?" / "Trade him?"
// Each outro has a real condition so it only fires when earned

interface OutroOpt { text: string; condition: (ctx: SocialContext) => boolean; weight: number; }

const NBAC_OUTROS: OutroOpt[] = [
    // Debate closers (bread and butter)
    { text: 'Thoughts? 🤔',          condition: (c) => (c.stats?.pts ?? 0) >= 18, weight: 6 },
    { text: '🔥',                    condition: (c) => (c.stats?.pts ?? 0) >= 25, weight: 4 },
    { text: '👀',                    condition: () => true, weight: 3 },

    // Performance-based
    { text: 'Best player in the league?',   condition: (c) => (c.stats?.pts ?? 0) >= 38, weight: 4 },
    { text: 'Top 5?',                       condition: (c) => (c.stats?.pts ?? 0) >= 32, weight: 4 },
    { text: 'MVP?',                         condition: (c) => (c.stats?.pts ?? 0) >= 30 && isAllStar(c.player), weight: 4 },
    { text: 'Future MVP.',                  condition: (c) => calculateAge(c.player) <= 23 && (c.stats?.pts ?? 0) >= 25, weight: 4 },
    { text: 'He has arrived.',              condition: (c) => calculateAge(c.player) <= 23 && (c.stats?.pts ?? 0) >= 25, weight: 3 },
    { text: 'Build around him.',            condition: (c) => (c.stats?.pts ?? 0) >= 30 && calculateAge(c.player) <= 25, weight: 3 },
    { text: 'Best contract in the NBA?',    condition: (c) => (c.stats?.pts ?? 0) >= 28 && !isAllStar(c.player), weight: 3 },
    { text: 'Underrated?',                  condition: (c) => (c.stats?.pts ?? 0) >= 25 && !isAllStar(c.player), weight: 3 },

    // Position-specific
    { text: 'Best PG in the league?',       condition: (c) => c.player?.pos === 'PG' && (c.stats?.pts ?? 0) >= 28, weight: 3 },
    { text: 'Best Center in the league?',   condition: (c) => c.player?.pos === 'C' && (c.stats?.pts ?? 0) >= 25, weight: 3 },

    // Bad game debate closers
    { text: 'Overrated?',                   condition: (c) => (c.stats?.fga ?? 0) > 14 && ((c.stats?.fgm ?? 0) / (c.stats?.fga ?? 1)) < 0.35, weight: 5 },
    { text: 'Worst contract in the NBA?',   condition: (c) => (c.stats?.pts ?? 0) < 10 && (c.stats?.min ?? 0) > 28, weight: 4 },
    { text: 'Trade him?',                   condition: (c) => (c.stats?.pts ?? 0) < 12 && (c.stats?.tov ?? 0) >= 4 && (c.stats?.min ?? 0) > 25, weight: 4 },
    { text: 'Is this team built wrong?',    condition: (c) => (c.stats?.pts ?? 0) < 15 && (c.stats?.tov ?? 0) >= 5, weight: 3 },
];

function getNBACOutro(ctx: SocialContext): string {
    const valid = NBAC_OUTROS.filter(o => o.condition(ctx));
    if (!valid.length) return '👀';
    return pick(valid).text;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const NBA_CENTRAL_TEMPLATES: SocialTemplate[] = [

    // ── MAIN DYNAMIC ─────────────────────────────────────────────────────────
    // Fires on good games (25+) AND genuinely bad games — that's NBACentral
    {
        id: 'nbac_dynamic',
        handle: 'nba_central',
        template: 'DYNAMIC',
        priority: (ctx: SocialContext) => {
            if (!ctx.stats) return 0;
            const s = ctx.stats;
            let p = 35;
            if (s.pts >= 40) p += 45;
            else if (s.pts >= 30) p += 28;
            else if (s.pts >= 25) p += 15;
            // Controversy bias — bad shooting night or high TOV
            if (s.fga > 14 && s.fgm / s.fga < 0.35) p += 35;
            if (s.tov >= 6) p += 25;
            if (isTripleDouble(s)) p += 20;
            return Math.min(p, 95);
        },
        type: 'statline',
        // Good games 25+ OR genuinely bad games (high usage, low efficiency)
        condition: (ctx: SocialContext) => {
            const s = ctx.stats;
            if (!s) return false;
            const isBadGame = s.fga > 14 && s.fgm / s.fga < 0.35 && s.min > 25;
            const isGoodGame = s.pts >= 25;
            return isBadGame || isGoodGame;
        },
        resolve: (_: string, ctx: SocialContext) => ({
            content: [
                getNBACIntro(ctx),
                '',
                buildNBACStatBlock(ctx.stats),
                '',
                getNBACOutro(ctx),
            ].join('\n'),
        }),
    },

    // ── DISASTER SHOOTING NIGHT ───────────────────────────────────────────────
    {
        id: 'nbac_disaster',
        handle: 'nba_central',
        template: 'DYNAMIC',
        priority: 82,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.fga > 12 && ctx.stats.fgm / ctx.stats.fga < 0.30 && ctx.stats.min > 25),
        resolve: (_: string, ctx: SocialContext) => {
            const s = ctx.stats;
            return {
                content: [
                    `${ctx.player?.name} struggled heavily tonight:`,
                    '',
                    `${s.pts} PTS`,
                    `${s.fgm}/${s.fga} FG 😬`,
                    s.tov >= 3 ? `${s.tov} TOV` : null,
                    '',
                    s.tov >= 5 ? 'Trade him?' : 'Overrated?',
                ].filter(Boolean).join('\n'),
            };
        },
    },

    // ── SEASON STATS CARD ─────────────────────────────────────────────────────
    // NBACentral loves the "X this season" format for underrated players
    {
        id: 'nbac_season_stats',
        handle: 'nba_central',
        template: 'DYNAMIC',
        priority: 78,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.player && isRolePlayer(ctx.player) && ctx.stats?.pts >= 15 && Math.random() < 0.12),
        resolve: (_: string, ctx: SocialContext) => {
            const season = getCurrentSeasonStats(ctx.player);
            if (!season) return { content: '' };

            const gp  = season.gp || 1;
            const ppg = (season.pts / gp).toFixed(1);
            const rpg = ((season.trb ?? (season.orb ?? 0) + (season.drb ?? 0)) / gp).toFixed(1);
            const apg = (season.ast / gp).toFixed(1);
            const fgp = (season.fgp || 0).toFixed(1);
            const tpp = (season.tpp || 0).toFixed(1);

            return {
                content: [
                    `${ctx.player?.name} this season:`,
                    '',
                    `${ppg} PPG`,
                    `${rpg} RPG`,
                    `${apg} APG`,
                    `${fgp}% FG`,
                    tpp !== '0.0' ? `${tpp}% 3PT` : null,
                    '',
                    `${ctx.team?.name} got a steal.`,
                ].filter(Boolean).join('\n'),
            };
        },
    },

    // ── MONSTER LINE (record alert) ───────────────────────────────────────────
    {
        id: 'nbac_monster_line',
        handle: 'nba_central',
        template: 'DYNAMIC',
        priority: (ctx: SocialContext) => ctx.stats?.threePm >= 12 ? 100 : 91,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && (ctx.stats.pts >= 50 || ctx.stats.threePm >= 8)),
        resolve: (_: string, ctx: SocialContext) => {
            const pName  = ctx.player?.name?.toUpperCase() ?? 'UNKNOWN';
            const st     = ctx.stats;
            const pts    = st.pts;
            const tpm    = st.threePm;
            const fgPct  = ((st.fgm / st.fga) * 100).toFixed(0);
            const record = tpm >= 12;
            const g      = ctx.game;
            const homeTeamObj = ctx.teams?.find((t: any) => t.id === g?.homeTeamId);
            const awayTeamObj = ctx.teams?.find((t: any) => t.id === g?.awayTeamId);

            return {
                content: [
                    record ? 'RECORD ALERT 🚨' : null,
                    '',
                    `${pName} TONIGHT:`,
                    '',
                    `${pts} POINTS`,
                    tpm >= 5 ? `${tpm} 3PM${record ? ' (NBA RECORD 🔥)' : ''}` : null,
                    `${fgPct}% FG`,
                    '',
                    '(Via @realapp)',
                ].filter(Boolean).join('\n'),
                data: {
                    playerName: ctx.player?.name,
                    teamColor: (ctx.team as any)?.colors?.[0] ?? '#1d428a',
                    teamLogoUrl: ctx.team?.logoUrl,
                    stats: {
                        pts: st.pts, reb: st.reb, ast: st.ast,
                        fgm: st.fgm, fga: st.fga,
                        fgPct: st.fga > 0 ? Number(fgPct) : null,
                        threePm: st.threePm, threePa: st.threePa,
                        stl: st.stl, blk: st.blk, tov: st.tov, min: st.min,
                    },
                    homeTeam: homeTeamObj ? { abbrev: homeTeamObj.abbrev, logoUrl: homeTeamObj.logoUrl, score: g?.homeScore } : undefined,
                    awayTeam: awayTeamObj ? { abbrev: awayTeamObj.abbrev, logoUrl: awayTeamObj.logoUrl, score: g?.awayScore } : undefined,
                    isOT: g?.isOT,
                },
            };
        },
    },

    // ── SURVIVE THRILLER ─────────────────────────────────────────────────────
    {
        id: 'nbac_survive_thriller',
        handle: 'nba_central',
        template: 'DYNAMIC',
        priority: 88,
        type: 'general',
        condition: (ctx: SocialContext) =>
            !!(ctx.game && !ctx.player && ctx.game.winnerId === ctx.team?.id && ctx.game.lead <= 3),
        resolve: (_: string, ctx: SocialContext) => {
            const winName = ctx.teams?.find((t: any) => t.id === ctx.game.winnerId)?.name ?? 'The team';
            const oppName = ctx.opponent?.name ?? 'the opponent';
            return {
                content: `The ${winName} survive a thriller against the ${oppName}! 🔥`,
            };
        },
    },

    // ── INJURY ────────────────────────────────────────────────────────────────
    {
        id: 'nbac_injury',
        handle: 'nba_central',
        template: 'DYNAMIC',
        priority: 85,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) > 83
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => {
            const games   = ctx.injury.gamesRemaining;
            const isLong  = games >= 60;
            const timeStr = games <= 2 ? 'a few games'
                : games <= 7  ? 'approximately a week'
                : games <= 14 ? 'approximately two weeks'
                : games <= 22 ? 'about a month'
                : games <= 35 ? '4-to-6 weeks'
                : isLong      ? 'the rest of the season'
                : 'multiple months';

            return {
                content: [
                    `Brutal news for the ${ctx.team?.name}.`,
                    '',
                    `${ctx.player?.name} is expected to miss ${timeStr} due to a ${ctx.injury.injuryType}.`,
                    '',
                    isLong ? 'Season over.' : 'Tough blow.',
                ].join('\n'),
            };
        },
    },

    // ── LOAD MANAGEMENT ──────────────────────────────────────────────────────
    {
        id: 'nbac_load_management',
        handle: 'nba_central',
        template: 'DYNAMIC',
        priority: 65,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player && ctx.injury.injuryType === 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => ({
            content: `${ctx.player?.name} is OUT tonight vs the ${ctx.opponent?.name} for load management.`,
        }),
    },
];