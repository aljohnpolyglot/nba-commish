import { SocialContext, SocialTemplate } from '../types';
import {
    calculateAge,
    get2KRating,
    getCareerHigh,
    getCurrentSeasonStats,
    getRating,
    is5x5,
    isAllStar,
    isDoubleDouble,
    isRookie,
    isTripleDouble,
    isVeteran,
} from '../helpers';
import { STATMUSE_PLAYER_IMAGES } from '../../../data/social/statmuseImages';

const getStatmuseImage = (playerName: string): string | null => {
    if (!playerName) return null;
    if (STATMUSE_PLAYER_IMAGES[playerName]) return STATMUSE_PLAYER_IMAGES[playerName];
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normalizedInput = norm(playerName);
    for (const key in STATMUSE_PLAYER_IMAGES) {
        if (norm(key) === normalizedInput) return STATMUSE_PLAYER_IMAGES[key];
    }
    return null;
};

export const resolveStatmuseMedia = (ctx: SocialContext) => ({
    mediaUrl: ctx.player ? getStatmuseImage(ctx.player.name) ?? undefined : undefined,
    mediaBackgroundColor: ctx.team?.colors?.[0] ?? '#1a1a2e',
});

function weightedPick<T extends { weight: number }>(arr: T[]): T {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of arr) {
        r -= item.weight;
        if (r <= 0) return item;
    }
    return arr[arr.length - 1];
}

export function buildStatmuseStatBlock(ctx: SocialContext): string {
    const s = ctx.stats;
    if (!s) return '';
    const lines: string[] = [];
    lines.push(`${s.pts} PTS`);
    const fgPct = s.fga > 0 ? s.fgm / s.fga : 0;
    if (s.fga >= 8) {
        lines.push(`${s.fgm}/${s.fga} FG${fgPct >= 0.6 ? ' 🔥' : ''}`);
    }
    if (s.threePm >= 4) lines.push(`${s.threePm}/${s.threePa} 3PT`);
    else if (s.threePm >= 3 && s.pts >= 30) lines.push(`${s.threePm} 3PT`);
    const hgt = ctx.player ? getRating(ctx.player, 'hgt') : 76;
    const rebThreshold = hgt > 78 ? 10 : hgt > 74 ? 8 : 6;
    if (s.reb >= rebThreshold) lines.push(`${s.reb} REB`);
    if (s.ast >= 7) lines.push(`${s.ast} AST`);
    else if (s.ast >= 5 && isTripleDouble(s)) lines.push(`${s.ast} AST`);
    if (s.stl >= 3) lines.push(`${s.stl} STL`);
    if (s.blk >= 3) lines.push(`${s.blk} BLK`);
    if (s.tsPct && s.tsPct >= 0.72 && s.pts >= 25 && s.fga >= 10) {
        lines.push(`${(s.tsPct * 100).toFixed(0)}% TS`);
    }
    return lines.join('\n');
}

function getContextualIntro(ctx: SocialContext): string {
    const { player, team, opponent, stats, game } = ctx;
    const name = player?.name ?? 'Unknown';
    const oppName = opponent?.name ?? 'the opponent';
    const isWin = game?.winnerId === team?.id;
    const isClose = (game?.lead ?? 99) <= 5;
    const isOT = game?.isOT;
    const age = player ? calculateAge(player) : 25;

    if (game?.isAllStar) return `${name} in the All-Star Game:`;
    if (isOT && isWin && (stats?.pts ?? 0) >= 20) return `${name} in overtime:`;
    if (isClose && isWin && (stats?.pts ?? 0) >= 25) return `${name} willed them to the win:`;
    if (isClose && isWin) return `${name} in the clutch:`;
    if ((game?.lead ?? 0) >= 20 && isWin && (stats?.pts ?? 0) >= 30) return `${name} put on a show:`;
    if (isRookie(player) && (stats?.pts ?? 0) >= 25) return `The ${age}-year-old rookie:`;
    if (isVeteran(player) && age >= 35 && (stats?.pts ?? 0) >= 22) return `${name} at ${age} years old:`;
    if (opponent) return `${name} vs. the ${oppName}:`;

    const fallbacks = [
        `${name} tonight:`,
        `${name} went off:`,
        `${name} masterclass:`,
        `${name} in the ${isWin ? 'win' : 'loss'}:`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

interface OutroOption {
    text: string;
    condition: (ctx: SocialContext) => boolean;
    weight: number;
}

const OUTROS: OutroOption[] = [
    { text: 'Muse.', condition: () => true, weight: 2 },
    { text: 'Special.', condition: () => true, weight: 2 },
    { text: 'Couldn\'t miss.', condition: (c) => c.stats?.fga > 0 && c.stats.fgm / c.stats.fga >= 0.65 && c.stats.fga >= 8, weight: 5 },
    { text: 'Efficient.', condition: (c) => !!(c.stats?.tsPct && c.stats.tsPct >= 0.65 && c.stats.pts >= 20), weight: 4 },
    { text: 'Perfect game.', condition: (c) => c.stats?.fga >= 5 && c.stats?.fgm === c.stats?.fga, weight: 9 },
    { text: 'Bucket.', condition: (c) => (c.stats?.pts ?? 0) >= 28 && (c.stats?.pts ?? 0) < 40, weight: 4 },
    { text: 'Elite.', condition: (c) => c.player != null && get2KRating(c.player) >= 94 && (c.stats?.pts ?? 0) >= 25, weight: 3 },
    { text: 'Him.', condition: (c) => c.player != null && get2KRating(c.player) >= 98 && (c.stats?.pts ?? 0) >= 30, weight: 3 },
    { text: 'Unstoppable.', condition: (c) => (c.stats?.pts ?? 0) >= 40, weight: 5 },
    { text: 'Video game numbers.', condition: (c) => (c.stats?.pts ?? 0) >= 45, weight: 5 },
    { text: 'Nuclear.', condition: (c) => (c.stats?.pts ?? 0) >= 50, weight: 6 },
    { text: 'Best player on the planet?', condition: (c) => (c.stats?.pts ?? 0) >= 50, weight: 4 },
    { text: 'Clutch.', condition: (c) => (c.game?.lead ?? 99) <= 5 && c.game?.winnerId === c.team?.id, weight: 6 },
    { text: 'When it mattered.', condition: (c) => (c.game?.lead ?? 99) <= 3 && c.game?.winnerId === c.team?.id && (c.stats?.pts ?? 0) >= 25, weight: 5 },
    { text: 'OT hero.', condition: (c) => !!c.game?.isOT && c.game?.winnerId === c.team?.id && (c.stats?.pts ?? 0) >= 20, weight: 7 },
    { text: 'Carried them.', condition: (c) => (c.stats?.pts ?? 0) >= 35 && c.game?.winnerId === c.team?.id, weight: 4 },
    { text: 'Not enough.', condition: (c) => (c.stats?.pts ?? 0) >= 35 && c.game?.winnerId !== c.team?.id, weight: 6 },
    { text: 'They still lost.', condition: (c) => (c.stats?.pts ?? 0) >= 42 && c.game?.winnerId !== c.team?.id, weight: 7 },
    { text: 'MVP?', condition: (c) => (c.stats?.pts ?? 0) >= 38 && isAllStar(c.player), weight: 4 },
    { text: 'MVP conversation.', condition: (c) => (c.stats?.pts ?? 0) >= 30 && isAllStar(c.player), weight: 3 },
    { text: 'Top 5 player?', condition: (c) => (c.stats?.pts ?? 0) >= 42 && isAllStar(c.player), weight: 3 },
    { text: 'Rookie of the Year?', condition: (c) => isRookie(c.player) && (c.stats?.pts ?? 0) >= 20, weight: 7 },
    { text: 'Generational.', condition: (c) => isRookie(c.player) && (c.stats?.pts ?? 0) >= 28, weight: 6 },
    { text: 'DPOY conversation.', condition: (c) => (c.stats?.stl ?? 0) >= 4 || (c.stats?.blk ?? 0) >= 5, weight: 6 },
    { text: 'Still got it.', condition: (c) => isVeteran(c.player) && calculateAge(c.player) >= 35 && (c.stats?.pts ?? 0) >= 20, weight: 6 },
    { text: 'Most underrated in the league.', condition: (c) => !isAllStar(c.player) && (c.stats?.pts ?? 0) >= 28, weight: 4 },
    { text: 'Best contract in basketball.', condition: (c) => !isAllStar(c.player) && (c.stats?.pts ?? 0) >= 25 && c.player != null && get2KRating(c.player) >= 88, weight: 3 },
    { text: 'Does everything.', condition: (c) => isTripleDouble(c.stats) && (c.stats?.blk ?? 0) >= 2 && (c.stats?.stl ?? 0) >= 2, weight: 6 },
    { text: '5×5. Rare.', condition: (c) => is5x5(c.stats), weight: 10 },
    { text: 'Don\'t leave him open.', condition: (c) => (c.stats?.threePm ?? 0) >= 6, weight: 5 },
    { text: '3-point barrage.', condition: (c) => (c.stats?.threePm ?? 0) >= 8, weight: 6 },
    { text: 'Locked in on both ends.', condition: (c) => (c.stats?.pts ?? 0) >= 25 && ((c.stats?.stl ?? 0) >= 3 || (c.stats?.blk ?? 0) >= 3), weight: 5 },
];

export function getContextualStatmuseOutro(ctx: SocialContext): string {
    const valid = OUTROS.filter((o) => o.condition(ctx));
    if (!valid.length) return 'Muse.';
    const picked = weightedPick(valid);
    if (picked.text === 'Still got it.' && ctx.player?.draft?.year) {
        const years = 2026 - ctx.player.draft.year;
        return `Year ${years}. Still.`;
    }
    return picked.text;
}

export function getStatmuseHistoricalHook(ctx: SocialContext): string | null {
    const { player, stats } = ctx;
    if (!player || !stats) return null;

    const careerHighPts = getCareerHigh(player, 'pts');
    const careerHighReb = getCareerHigh(player, 'trb');
    const careerHighAst = getCareerHigh(player, 'ast');
    const season = getCurrentSeasonStats(player);

    if (careerHighPts > 0 && stats.pts > careerHighPts) {
        return `New career high. ${stats.pts} points — surpassing his previous best of ${careerHighPts}.`;
    }
    if (careerHighPts >= 30 && stats.pts === careerHighPts) {
        return `Ties his career high with ${stats.pts} points.`;
    }
    if (careerHighReb > 0 && stats.reb > careerHighReb && stats.reb >= 14) {
        return `New career high in rebounds — ${stats.reb}.`;
    }
    if (careerHighAst > 0 && stats.ast > careerHighAst && stats.ast >= 12) {
        return `Career high in assists — ${stats.ast} dimes.`;
    }
    if (season) {
        const avgPts = season.pts || 0;
        if (avgPts > 0 && stats.pts >= avgPts * 1.9 && stats.pts >= 35) {
            return `He's averaging ${avgPts.toFixed(1)} PPG this season. Not tonight.`;
        }
        if (avgPts > 0 && stats.pts >= avgPts * 1.6 && stats.pts >= 40) {
            return `Season average: ${avgPts.toFixed(1)} PPG. Put that aside.`;
        }
    }
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

export const createDynamicStatmuseTemplate = (): SocialTemplate => ({
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
        const intro = getContextualIntro(ctx);
        const statBlock = buildStatmuseStatBlock(ctx);
        const outro = getContextualStatmuseOutro(ctx);
        const hook = getStatmuseHistoricalHook(ctx);
        const parts = [intro, '', statBlock, ''];
        if (hook) parts.push(hook, '');
        parts.push(outro);
        return { content: parts.join('\n'), ...resolveStatmuseMedia(ctx) };
    },
});
