import { SocialTemplate, SocialContext } from '../types';
import { getCurrentSeasonStats, calculateAge, get2KRating } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// GAMES → HUMAN TIME CONVERTER
// Real Shams never says "X games" — he says "two weeks" / "a month" / "rest of season"
// ─────────────────────────────────────────────────────────────────────────────

function gamesToTime(games: number, remainingInSeason?: number): string {
    if (games <= 0)   return 'day-to-day';
    if (games === 1)  return 'one game';
    if (games === 2)  return 'the next two games';
    if (games <= 4)   return 'approximately a week';
    if (games <= 7)   return '1-to-2 weeks';
    if (games <= 10)  return 'at least two weeks';
    if (games <= 14)  return 'approximately two weeks';
    if (games <= 18)  return '2-to-4 weeks';
    if (games <= 22)  return 'approximately one month';
    if (games <= 28)  return '4-to-6 weeks';
    if (games <= 35)  return '6-to-8 weeks';
    if (games <= 45)  return 'approximately two months';
    if (games <= 55)  return 'multiple months';
    if (games <= 65)  return 'at least three months';
    // Season-ending threshold — if remaining games is close, call it
    if (remainingInSeason && games >= remainingInSeason * 0.85) return 'the remainder of the season';
    if (games >= 80)  return 'the remainder of the season';
    return 'significant time';
}

function gamesToTimeShort(games: number): string {
    if (games <= 0)   return 'day-to-day';
    if (games <= 2)   return 'a few days';
    if (games <= 5)   return 'a week';
    if (games <= 10)  return 'about two weeks';
    if (games <= 14)  return 'two weeks';
    if (games <= 22)  return 'a month';
    if (games <= 35)  return '4-to-6 weeks';
    if (games <= 55)  return 'multiple months';
    return 'the rest of the season';
}

function isSeasonEnding(games: number): boolean {
    return games >= 60;
}

function isMajorInjury(games: number): boolean {
    return games >= 25;
}

// ─────────────────────────────────────────────────────────────────────────────
// INJURY SEVERITY CLASSIFIER
// Determines the "story" of the injury for template selection
// ─────────────────────────────────────────────────────────────────────────────

type InjurySeverity = 'day_to_day' | 'short_term' | 'mid_term' | 'long_term' | 'season_ending';

function getSeverity(games: number): InjurySeverity {
    if (games <= 2)  return 'day_to_day';
    if (games <= 7)  return 'short_term';
    if (games <= 22) return 'mid_term';
    if (games <= 55) return 'long_term';
    return 'season_ending';
}

// ─────────────────────────────────────────────────────────────────────────────
// INJURY TYPE → TONE ADAPTER
// Some injuries have known implications Shams always contextualizes
// ─────────────────────────────────────────────────────────────────────────────

function getInjuryContext(injuryType: string, games: number): string | null {
    const type = injuryType.toLowerCase();
    if (type.includes('acl') || type.includes('achilles'))
        return 'He is expected to miss the remainder of the season and into next year.';
    if (type.includes('labrum') && games >= 40)
        return 'Surgery is likely required, and a full recovery timeline is expected to stretch into next season.';
    if (type.includes('herniated disc'))
        return 'Tests will determine if surgery is necessary.';
    if (type.includes('bone bruise'))
        return 'Best-case scenario as tests show no structural damage.';
    if (type.includes('concussion'))
        return 'He will be evaluated daily under league protocol.';
    if (type.includes('load management') || type.includes('rest'))
        return null; // handled separately
    if (type.includes('fracture') && games >= 20)
        return 'Surgery has been scheduled and he will be re-evaluated after the procedure.';
    if (type.includes('sprain') && games <= 5)
        return 'He will be evaluated daily and is considered day-to-day.';
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASON STATS CONTEXT
// Shams often includes what the player was averaging — pulled from real data
// ─────────────────────────────────────────────────────────────────────────────

function getSeasonContext(ctx: SocialContext): string | null {
    const player = ctx.player;
    if (!player) return null;
    const season = getCurrentSeasonStats(player);
    if (!season) return null;

    const gp = season.gp || 1;
    const pts = (season.pts || 0) / gp;
    const reb = ((season.trb ?? (season.orb ?? 0) + (season.drb ?? 0)) || 0) / gp;
    const ast = (season.ast || 0) / gp;

    if (!pts || pts < 12) return null;

    const parts: string[] = [];
    if (pts >= 15) parts.push(`${pts.toFixed(1)} points`);
    if (reb >= 7)  parts.push(`${reb.toFixed(1)} rebounds`);
    if (ast >= 5)  parts.push(`${ast.toFixed(1)} assists`);

    if (parts.length === 0) return null;
    if (parts.length === 1) return `He was averaging ${parts[0]} per game this season.`;
    if (parts.length === 2) return `He had been averaging ${parts[0]} and ${parts[1]} per game.`;
    return `He had been averaging ${parts[0]}, ${parts[1]} and ${parts[2]} per game.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM RECORD CONTEXT
// "Kings are 3-6 without Sabonis" style lines
// ─────────────────────────────────────────────────────────────────────────────

function getTeamRecordContext(ctx: SocialContext): string | null {
    const team = ctx.team;
    if (!team || team.wins == null || team.losses == null) return null;
    if (Math.random() > 0.35) return null; // only include sometimes
    return `${team.name} are ${team.wins}-${team.losses} on the season.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE ATTRIBUTION
// Real Shams rotates between these
// ─────────────────────────────────────────────────────────────────────────────

const SOURCES = [
    'sources tell ESPN.',
    'sources tell me.',
    'sources tell ESPN and @Stadium.',
    'per sources.',
    'sources say.',
    'sources tell me and @BannedMacMahon.',
];

function getSource(): string {
    return SOURCES[Math.floor(Math.random() * SOURCES.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TEMPLATE BUILDER
// Single function that reads all context and produces the right Shams post
// ─────────────────────────────────────────────────────────────────────────────

function buildShamsPost(ctx: SocialContext): string {
    const { player, team, injury } = ctx;
    if (!player || !injury) return '';

    const name       = player.name;
    const teamName   = team?.name ?? 'The team';
    const injType    = injury.injuryType;
    const games      = injury.gamesRemaining;
    const ovr        = player.overallRating ?? 50;
    const severity   = getSeverity(games);
    const timeStr    = gamesToTime(games);
    const src        = getSource();
    const injCtx     = getInjuryContext(injType, games);
    const seasonCtx  = ovr >= 75 ? getSeasonContext(ctx) : null;
    const teamCtx    = getTeamRecordContext(ctx);

    // ── LOAD MANAGEMENT ──────────────────────────────────────────────────────
    if (injType === 'Load Management') {
        const opponentName = ctx.opponent?.name ?? 'tonight\'s opponent';
        const lmVariants = [
            `${teamName} star ${name} is resting tonight vs. the ${opponentName} for load management, ${src}`,
            `${name} will sit out tonight against the ${opponentName} for rest, ${src}`,
            `${teamName} is holding ${name} out tonight for load management purposes, per the team.`,
        ];
        return lmVariants[Math.floor(Math.random() * lmVariants.length)];
    }

    // ── DAY-TO-DAY / MINOR ───────────────────────────────────────────────────
    if (severity === 'day_to_day') {
        const dayToDayVariants = [
            `${teamName}'s ${name} is listed as day-to-day with a ${injType} and is expected to be re-evaluated before tomorrow's game, ${src}`,
            `${name} sustained a ${injType} and will be evaluated daily, ${src} He is not expected to miss significant time.`,
            `${teamName} has listed ${name} as questionable with a ${injType}. He will be a game-time decision, per the team.`,
        ];
        return dayToDayVariants[Math.floor(Math.random() * dayToDayVariants.length)];
    }

    // ── SHORT TERM (1-2 weeks) ───────────────────────────────────────────────
    if (severity === 'short_term') {
        const parts: string[] = [];

        const shortVariants = [
            `${teamName}'s ${name} will miss ${timeStr} with a ${injType}, ${src}`,
            `${name} has been diagnosed with a ${injType} and is expected to miss ${timeStr}, ${src}`,
            `An MRI confirmed a ${injType} for ${name}. He is expected to miss ${timeStr}, ${src}`,
        ];
        parts.push(shortVariants[Math.floor(Math.random() * shortVariants.length)]);
        if (injCtx) parts.push(injCtx);
        if (seasonCtx && ovr >= 78) parts.push(seasonCtx);
        return parts.join(' ');
    }

    // ── MID TERM (2-6 weeks) ─────────────────────────────────────────────────
    if (severity === 'mid_term') {
        const parts: string[] = [];

        const midVariants = [
            `${teamName} star ${name} will miss ${timeStr} with a ${injType}, ${src}`,
            `Sources: ${name} has sustained a ${injType} and will be sidelined for ${timeStr}.`,
            `${name} is expected to miss ${timeStr} after an MRI confirmed a ${injType}, ${src}`,
            `${teamName} guard/forward ${name} has been diagnosed with a ${injType} and will miss ${timeStr}, ${src}`,
        ];
        parts.push(midVariants[Math.floor(Math.random() * midVariants.length)]);
        if (injCtx) parts.push(injCtx);
        if (seasonCtx && ovr >= 76) parts.push(seasonCtx);
        if (teamCtx) parts.push(teamCtx);
        return parts.join(' ');
    }

    // ── LONG TERM (1.5 - 3+ months) ─────────────────────────────────────────
    if (severity === 'long_term') {
        const parts: string[] = [];

        const longVariants = [
            `${teamName} star ${name} will miss ${timeStr} with a ${injType}, ${src} A significant blow to ${teamName}'s outlook.`,
            `Sources: ${name} has sustained a ${injType} and is expected to be sidelined for ${timeStr}. The ${teamName} will be without one of their key contributors.`,
            `${name} suffered a ${injType} and will miss ${timeStr}, ${src}`,
        ];
        parts.push(longVariants[Math.floor(Math.random() * longVariants.length)]);
        if (injCtx) parts.push(injCtx);
        if (seasonCtx) parts.push(seasonCtx);
        if (teamCtx) parts.push(teamCtx);
        return parts.join(' ');
    }

    // ── SEASON ENDING ────────────────────────────────────────────────────────
    const seasonEndVariants = [
        `BREAKING: ${teamName} star ${name} has suffered a ${injType} and will miss the remainder of the season, ${src} A devastating blow for ${teamName}.`,
        `Sources: ${name} will undergo surgery to address a ${injType} and is expected to miss the rest of the season — and potentially time into next year.`,
        `A massive blow: ${name}'s season is over. An MRI confirmed a ${injType} that will require surgery and an extended recovery. ${src}`,
        `${name} is officially out for the season with a ${injType}. The ${teamName} star will target a return for next season, ${src}`,
        `The landscape of the ${teamName}'s season has shifted. ${name} will not return this year after sustaining a ${injType}, ${src}`,
    ];

    const parts: string[] = [];
    parts.push(seasonEndVariants[Math.floor(Math.random() * seasonEndVariants.length)]);
    if (injCtx) parts.push(injCtx);
    if (seasonCtx) parts.push(seasonCtx);

    return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// FREE AGENT SIGNING POST BUILDER
// Standalone — call from playerActions when LLM is off
// ─────────────────────────────────────────────────────────────────────────────

export function buildShamsSigningPost(
    playerName: string,
    teamName: string,
    teamAbbrev: string,
    overallRating: number,
    prevTeamName?: string | null,
    prevLeague?: string | null,
    salary?: number // thousands of dollars (BBGM units)
): string {
    const src = getSource();
    const salaryStr = salary && salary >= 5000
        ? ` on a $${(salary / 1000).toFixed(1)}M deal`
        : '';
    const intlLeagues = ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'WNBA'];
    const isReturn = prevLeague && intlLeagues.includes(prevLeague);
    const prevStr = isReturn
        ? ` He is returning to the NBA after playing in the ${prevLeague}.`
        : prevTeamName
            ? ` He was previously with the ${prevTeamName}.`
            : prevLeague && prevLeague !== 'Free Agent'
                ? ` He was most recently in the ${prevLeague}.`
                : '';
    const isStar = overallRating >= 85;
    const isVet = overallRating >= 76;

    if (isStar) {
        const variants = [
            `Sources: ${playerName} is signing with the ${teamName}${salaryStr}, ${src}${prevStr}`,
            `BREAKING: ${teamName} are signing ${playerName}${salaryStr}, ${src}${prevStr}`,
            `${playerName} is heading to the ${teamName}${salaryStr}, ${src}${prevStr}`,
        ];
        return variants[Math.floor(Math.random() * variants.length)];
    }
    if (isVet) {
        const variants = [
            `${teamName} are signing veteran ${playerName}${salaryStr}, ${src}${prevStr}`,
            `${playerName} has agreed to a deal with the ${teamName}${salaryStr}, ${src}${prevStr}`,
            `Sources: ${teamAbbrev} finalizing a deal with ${playerName}${salaryStr}, ${src}${prevStr}`,
        ];
        return variants[Math.floor(Math.random() * variants.length)];
    }
    // Role player — still include context
    const variants = [
        `${teamName} are signing ${playerName}${salaryStr}, ${src}${prevStr}`,
        `Sources: ${teamAbbrev} are adding ${playerName}${salaryStr} to their roster, ${src}${prevStr}`,
    ];
    return variants[Math.floor(Math.random() * variants.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADE POST BUILDER
// Standalone — call from tradeActions when LLM is off
// ─────────────────────────────────────────────────────────────────────────────

export function buildShamsTradePost(
    teamAName: string,
    teamAAbbrev: string,
    teamBName: string,
    teamBAbbrev: string,
    assetsToB: string[],   // names of players/picks going to teamB
    assetsToA: string[]    // names of players/picks going to teamA
): string {
    const src = getSource();
    const toBStr = assetsToB.join(', ') || 'future considerations';
    const toAStr = assetsToA.join(', ') || 'future considerations';

    const isMajor = assetsToB.length + assetsToA.length >= 4;
    const prefix = isMajor ? 'BREAKING: ' : 'Sources: ';

    const variants = [
        `${prefix}The ${teamAName} are trading ${toBStr} to the ${teamBName} in exchange for ${toAStr}, ${src}`,
        `${prefix}${teamAName}–${teamBName} trade: ${teamAAbbrev} sends ${toBStr} to ${teamBAbbrev} for ${toAStr}, ${src}`,
        `${prefix}A deal has been struck between the ${teamAName} and ${teamBName}. ${toBStr} head to ${teamBAbbrev}; ${toAStr} go to ${teamAAbbrev}, ${src}`,
    ];
    return variants[Math.floor(Math.random() * variants.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export const CHARANIA_TEMPLATES: SocialTemplate[] = [

    // ── SEASON-ENDING (STAR) ─────────────────────────────────────────────────
    {
        id: 'shams_season_ending_star',
        handle: 'shams',
        template: 'DYNAMIC',
        priority: 100,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) >= 90
                && isSeasonEnding(ctx.injury.gamesRemaining)
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => ({
            content: buildShamsPost(ctx),
        }),
    },

    // ── LONG-TERM (STAR) ─────────────────────────────────────────────────────
    {
        id: 'shams_long_term_star',
        handle: 'shams',
        template: 'DYNAMIC',
        priority: 95,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) >= 88
                && isMajorInjury(ctx.injury.gamesRemaining)
                && !isSeasonEnding(ctx.injury.gamesRemaining)
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => ({
            content: buildShamsPost(ctx),
        }),
    },

    // ── MID-TERM (ANY NOTABLE PLAYER) ───────────────────────────────────────
    {
        id: 'shams_mid_term',
        handle: 'shams',
        template: 'DYNAMIC',
        priority: 90,
        type: 'news',
        condition: (ctx: SocialContext) => {
            if (!ctx.injury || !ctx.player) return false;
            const games = ctx.injury.gamesRemaining;
            return get2KRating(ctx.player) >= 84
                && games >= 8
                && games <= 24
                && ctx.injury.injuryType !== 'Load Management';
        },
        resolve: (_: string, ctx: SocialContext) => ({
            content: buildShamsPost(ctx),
        }),
    },

    // ── SHORT-TERM (ANY NOTABLE PLAYER) ─────────────────────────────────────
    {
        id: 'shams_short_term',
        handle: 'shams',
        template: 'DYNAMIC',
        priority: 85,
        type: 'news',
        condition: (ctx: SocialContext) => {
            if (!ctx.injury || !ctx.player) return false;
            const games = ctx.injury.gamesRemaining;
            return get2KRating(ctx.player) >= 84
                && games >= 3
                && games <= 7
                && ctx.injury.injuryType !== 'Load Management';
        },
        resolve: (_: string, ctx: SocialContext) => ({
            content: buildShamsPost(ctx),
        }),
    },

    // ── DAY-TO-DAY (STAR ONLY) ───────────────────────────────────────────────
    {
        id: 'shams_day_to_day',
        handle: 'shams',
        template: 'DYNAMIC',
        priority: 80,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) >= 88
                && ctx.injury.gamesRemaining <= 2
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => ({
            content: buildShamsPost(ctx),
        }),
    },

    // ── LOAD MANAGEMENT ──────────────────────────────────────────────────────
    {
        id: 'shams_load_management',
        handle: 'shams',
        template: 'DYNAMIC',
        priority: 75,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) >= 90
                && ctx.injury.injuryType === 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => ({
            content: buildShamsPost(ctx),
        }),
    },

    // ── MULTI-PLAYER INJURY NOTE (rare, flavour) ─────────────────────────────
    // Fires when player is a second or third rotation piece with short-term injury
    {
        id: 'shams_rotation_player',
        handle: 'shams',
        template: 'DYNAMIC',
        priority: 70,
        type: 'news',
        condition: (ctx: SocialContext) => {
            if (!ctx.injury || !ctx.player) return false;
            const ovr2k = get2KRating(ctx.player);
            const games = ctx.injury.gamesRemaining;
            return ovr2k >= 92 && ovr2k < 96 && games >= 5 && games <= 20
                && ctx.injury.injuryType !== 'Load Management'
                && Math.random() < 0.55; // only fires ~55% of the time for role players
        },
        resolve: (_: string, ctx: SocialContext) => ({
            content: buildShamsPost(ctx),
        }),
    },
];

export { buildShamsPost };