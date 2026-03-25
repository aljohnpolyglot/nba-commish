import { SocialTemplate, SocialContext } from '../types';
import { get2KRating } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// UNDERDOG NBA — pure utility, injury status & lineup alerts
// Voice: terse, no punctuation drama, no emojis, factual
// Format: "Player (injury) status for Day." or "Lineup alert: Team will start..."
//
// Real patterns observed:
//   "Nick Richards (back) listed available to play Monday."
//   "Craig Porter Jr. (groin) expected to miss around 1-3 weeks."
//   "Jarrett Allen (knee) listed out for Tuesday."
//   "Bam Adebayo (calf) listed questionable for Tuesday."
//   "Lineup alert: Hawks will start Daniels, McCollum, ..."
// ─────────────────────────────────────────────────────────────────────────────

/** Games → Underdog-style time string */
function gamesToUnderdogTime(games: number): string {
    if (games <= 0)  return 'game-time decision';
    if (games === 1) return '1 game';
    if (games <= 3)  return 'around 1-3 games';
    if (games <= 5)  return 'around 1 week';
    if (games <= 10) return 'at least 2 weeks';
    if (games <= 14) return 'around 2-3 weeks';
    if (games <= 20) return 'around 3-4 weeks';
    if (games <= 28) return 'around 4-6 weeks';
    if (games <= 40) return 'at least 6 weeks';
    if (games <= 55) return 'multiple months';
    return 'the remainder of the season';
}

/** Day label — Underdog always says the day, not a date */
function getDayLabel(): string {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[Math.floor(Math.random() * days.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const UNDERDOG_NBA_TEMPLATES: SocialTemplate[] = [

    // ── RULED OUT ─────────────────────────────────────────────────────────────
    // "Jarrett Allen (knee) listed out for Tuesday."
    {
        id: 'underdog_ruled_out',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 92,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && ctx.injury.gamesRemaining >= 1
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => {
            const name  = ctx.player?.name ?? 'Unknown';
            const inj   = ctx.injury.injuryType.toLowerCase();
            const day   = getDayLabel();
            return {
                content: `${name} (${inj}) ruled out ${day}.`,
            };
        },
    },

    // ── QUESTIONABLE ─────────────────────────────────────────────────────────
    // "Bam Adebayo (calf) listed questionable for Tuesday."
    // Fires for borderline injuries (1-3 games) at a roll gate
    {
        id: 'underdog_questionable',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 88,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && ctx.injury.gamesRemaining >= 1
                && ctx.injury.gamesRemaining <= 4
                && Math.random() < 0.45),
        resolve: (_: string, ctx: SocialContext) => {
            const name = ctx.player?.name ?? 'Unknown';
            const inj  = ctx.injury.injuryType.toLowerCase();
            const day  = getDayLabel();
            return {
                content: `${name} (${inj}) listed questionable for ${day}.`,
            };
        },
    },

    // ── AVAILABLE TO PLAY ─────────────────────────────────────────────────────
    // "Nick Richards (back) listed available to play Monday."
    // Fires when a player is returning from injury (gamesRemaining just hit 0)
    {
        id: 'underdog_available',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 85,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && ctx.injury.gamesRemaining === 0
                && get2KRating(ctx.player) >= 94
                && Math.random() < 0.55),
        resolve: (_: string, ctx: SocialContext) => {
            const name = ctx.player?.name ?? 'Unknown';
            const inj  = ctx.injury.injuryType.toLowerCase();
            const day  = getDayLabel();
            return {
                content: `${name} (${inj}) listed available to play ${day}.`,
            };
        },
    },

    // ── NOT ON INJURY REPORT ──────────────────────────────────────────────────
    // "Russell Westbrook (foot) not on injury report for Tuesday."
    // Fires for notable players fully cleared
    {
        id: 'underdog_cleared',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 80,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && ctx.injury.gamesRemaining === 0
                && get2KRating(ctx.player) >= 90
                && Math.random() < 0.35),
        resolve: (_: string, ctx: SocialContext) => {
            const name = ctx.player?.name ?? 'Unknown';
            const inj  = ctx.injury.injuryType.toLowerCase();
            const day  = getDayLabel();
            return {
                content: `${name} (${inj}) not on injury report for ${day}.`,
            };
        },
    },

    // ── EXPECTED MISS TIME ────────────────────────────────────────────────────
    // "Craig Porter Jr. (groin) expected to miss around 1-3 weeks."
    // Mid-term injuries — more info than just "ruled out"
    {
        id: 'underdog_miss_time',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 90,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && ctx.injury.gamesRemaining >= 5
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => {
            const name     = ctx.player?.name ?? 'Unknown';
            const inj      = ctx.injury.injuryType.toLowerCase();
            const timeStr  = gamesToUnderdogTime(ctx.injury.gamesRemaining);
            const games    = ctx.injury.gamesRemaining;

            // Long-term injuries get "at least X more games" phrasing
            const phrase = games >= 15
                ? `expected to miss ${timeStr}.`
                : `expected to miss around ${timeStr}.`;

            return {
                content: `${name} (${inj}) ${phrase}`,
            };
        },
    },

    // ── LOAD MANAGEMENT / REST ────────────────────────────────────────────────
    // "Klay Thompson (rest) ruled out Monday."
    // "Draymond Green (injury management) listed available to play Monday."
    {
        id: 'underdog_rest',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 78,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && ctx.injury.injuryType === 'Load Management'
                && get2KRating(ctx.player) >= 98),
        resolve: (_: string, ctx: SocialContext) => {
            const name = ctx.player?.name ?? 'Unknown';
            const day  = getDayLabel();
            // Split between "rest" and "injury management" label
            const label = Math.random() < 0.6 ? 'rest' : 'injury management';
            return {
                content: `${name} (${label}) ruled out ${day}.`,
            };
        },
    },

    // ── STATUS ALERT (post-game injury update) ────────────────────────────────
    // "Status alert: Drew Eubanks (patellar tendinitis) is expected to miss 10 games."
    // Fires after game — for role players too (lower OVR threshold)
    {
        id: 'underdog_status_alert',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 86,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) >= 90
                && ctx.injury.gamesRemaining >= 2
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => {
            const name    = ctx.player?.name ?? 'Unknown';
            const inj     = ctx.injury.injuryType;
            const games   = ctx.injury.gamesRemaining;
            // Underdog uses raw game count in "Status alert" posts specifically
            // (this is their DFS-audience format — they want the exact number)
            const gameStr = games === 1 ? '1 game' : `${games} games`;
            return {
                content: `Status alert: ${name} (${inj}) is expected to miss ${gameStr}, per sources.`,
            };
        },
    },

    // ── LINEUP ALERT ─────────────────────────────────────────────────────────
    // "Lineup alert: Hawks will start Daniels, McCollum, Alexander-Walker, Johnson, Okongwu on Monday."
    // Uses the starter data from the game
    {
        id: 'underdog_lineup_alert',
        handle: 'underdog_nba',
        template: 'DYNAMIC',
        priority: 82,
        type: 'news',
        condition: (ctx: SocialContext) => {
            // Fire for notable teams or if a star is sitting
            if (!ctx.team || !ctx.game) return false;
            return !ctx.player && Math.random() < 0.40;
        },
        resolve: (_: string, ctx: SocialContext) => {
            const teamName = ctx.team?.name ?? 'The team';
            const day      = getDayLabel();

            // Pull starters from the game stats (gs === 1)
            const teamStats = ctx.game.homeTeamId === ctx.team?.id
                ? ctx.game.homeStats
                : ctx.game.awayStats;

            const starters = teamStats
                ?.filter((s: any) => s.gs === 1)
                .map((s: any) => {
                    // Last name only — Underdog style
                    const parts = (s.name ?? '').split(' ');
                    return parts.length > 1 ? parts[parts.length - 1] : s.name;
                })
                .slice(0, 5) ?? [];

            if (starters.length < 5) return { content: '' };

            return {
                content: `Lineup alert: ${teamName} will start ${starters.join(', ')} on ${day}.`,
            };
        },
    },
];