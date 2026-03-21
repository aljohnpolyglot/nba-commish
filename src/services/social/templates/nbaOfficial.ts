import { SocialTemplate, SocialContext } from '../types';
import { isTripleDouble, isDoubleDouble, is5x5, getCurrentSeasonStats } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Games → human time (reused from Shams for injury updates) */
function gamesToTime(games: number): string {
    if (games <= 0)  return 'day-to-day';
    if (games <= 2)  return 'the next two games';
    if (games <= 7)  return 'approximately one week';
    if (games <= 14) return 'approximately two weeks';
    if (games <= 22) return 'approximately one month';
    if (games <= 35) return '4-to-6 weeks';
    if (games <= 55) return 'multiple months';
    return 'the remainder of the season';
}

/** OT suffix: " (OT)" / " (2OT)" / " (3OT)" */
function otSuffix(ctx: SocialContext): string {
    if (!ctx.game?.isOT) return '';
    const count = ctx.game.otCount ?? 1;
    if (count === 1) return ' (OT)';
    return ` (${count}OT)`;
}

/** Top performer from the winning team */
function getTopPerformer(ctx: SocialContext) {
    if (!ctx.game) return null;
    const winnerId = ctx.game.winnerId;
    const winnerStats = ctx.game.homeTeamId === winnerId
        ? ctx.game.homeStats
        : ctx.game.awayStats;
    if (!winnerStats?.length) return null;
    return [...winnerStats].sort((a, b) => b.gameScore - a.gameScore)[0];
}

/** Find player object by id */
function findPlayer(ctx: SocialContext, playerId: string) {
    return ctx.players?.find((p: any) => p.internalId === playerId) ?? null;
}

/** Format a statline for NBA official style: "26 PTS | 11 REB | 8 AST" */
function formatStatline(s: any, short = false): string {
    if (!s) return '';
    const parts: string[] = [];
    parts.push(`${s.pts} PTS`);
    if (s.reb >= (short ? 8 : 6))  parts.push(`${s.reb} REB`);
    if (s.ast >= (short ? 6 : 5))  parts.push(`${s.ast} AST`);
    if (s.stl >= 3) parts.push(`${s.stl} STL`);
    if (s.blk >= 3) parts.push(`${s.blk} BLK`);
    if (s.threePm >= 4) parts.push(`${s.threePm} 3PM`);
    return parts.join(' | ');
}

/** Look up a team name from ctx.teams by id */
function teamName(ctx: SocialContext, tid: number): string {
    return ctx.teams?.find((t: any) => t.id === tid)?.name ?? 'Unknown';
}

/** Winner/loser scores in correct order */
function scores(ctx: SocialContext): { winner: number; loser: number; winName: string; loseName: string } {
    const g = ctx.game;
    if (!g) return { winner: 0, loser: 0, winName: '', loseName: '' };
    const homeWon = g.homeScore > g.awayScore;
    const homeName = teamName(ctx, g.homeTeamId);
    const awayName = teamName(ctx, g.awayTeamId);
    return {
        winner:   homeWon ? g.homeScore : g.awayScore,
        loser:    homeWon ? g.awayScore : g.homeScore,
        winName:  homeWon ? homeName    : awayName,
        loseName: homeWon ? awayName    : homeName,
    };
}

/** Relevant hashtag(s) for the game */
function getHashtags(ctx: SocialContext): string {
    const tags = ['#NBA'];
    if (ctx.team?.abbrev) tags.push(`#${ctx.team.abbrev}`);
    return tags.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD DATA BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildStatCardData(ctx: SocialContext): any | null {
    const s = ctx.stats;
    const p = ctx.player;
    const g = ctx.game;
    if (!s || !p || !g) return null;

    const homeTeam = ctx.teams?.find((t: any) => t.id === g.homeTeamId);
    const awayTeam = ctx.teams?.find((t: any) => t.id === g.awayTeamId);
    if (!homeTeam || !awayTeam) return null;

    const playerTeamId = (g.homeStats || []).find((st: any) => st.playerId === p.internalId)
        ? g.homeTeamId : g.awayTeamId;

    const statPills: string[] = [`${s.pts} PTS`];
    if (s.reb  >= 5)  statPills.push(`${s.reb} REB`);
    if (s.ast  >= 4)  statPills.push(`${s.ast} AST`);
    if (s.stl  >= 2)  statPills.push(`${s.stl} STL`);
    if (s.blk  >= 2)  statPills.push(`${s.blk} BLK`);
    if (s.threePm >= 3) statPills.push(`${s.threePm} 3PM`);
    if (s.fga  >= 8)  statPills.push(`${s.fgm}/${s.fga} FG`);

    return {
        type        : 'stat_card',
        playerName  : p.name,
        playerTeamId,
        statPills,
        homeTeam    : {
            name    : homeTeam.name,
            abbrev  : homeTeam.abbrev,
            logoUrl : homeTeam.logoUrl ?? '',
            score   : g.homeScore ?? 0,
            color   : (homeTeam as any).colors?.[0] ?? '#1d428a',
        },
        awayTeam    : {
            name    : awayTeam.name,
            abbrev  : awayTeam.abbrev,
            logoUrl : awayTeam.logoUrl ?? '',
            score   : g.awayScore ?? 0,
            color   : (awayTeam as any).colors?.[0] ?? '#c8102e',
        },
        winnerId    : g.winnerId,
        isOT        : g.isOT   ?? false,
        otCount     : g.otCount ?? 1,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const NBA_OFFICIAL_TEMPLATES: SocialTemplate[] = [

    // ── STANDARD FINAL RECAP ─────────────────────────────────────────────────
    // The core bread-and-butter post after every game
    {
        id: 'nba_final_recap',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 100,
        type: 'general',
        condition: (ctx: SocialContext) => !!(ctx.game && !ctx.player),
        resolve: (_: string, ctx: SocialContext) => {
            const { winner, loser, winName, loseName } = scores(ctx);
            const ot = otSuffix(ctx);
            const topStat = getTopPerformer(ctx);
            const topPlayer = topStat ? findPlayer(ctx, topStat.playerId) : null;
            const statline = topStat ? formatStatline(topStat) : '';
            const tags = getHashtags(ctx);

            const recapVariants = [
                `FINAL${ot}: ${winName} def. ${loseName}, ${winner}-${loser}\n\n${topPlayer?.name ?? 'Top performer'}: ${statline}\n\n${tags}`,
                `${winName} take down the ${loseName}, ${winner}-${loser}${ot}.\n\n${topPlayer?.name ?? ''}: ${statline}\n\n${tags}`,
                `${winner}-${loser}${ot} | FINAL\n\n${winName} get the W behind ${topPlayer?.name ?? 'their star'}'s ${statline}.\n\n${tags}`,
            ];

            return {
                content: recapVariants[Math.floor(Math.random() * recapVariants.length)],
                data: buildStatCardData(ctx),
            };
        },
    },

    // ── BUZZER BEATER / WALKOFF ───────────────────────────────────────────────
    {
        id: 'nba_buzzer_beater',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 100,
        type: 'general',
        condition: (ctx: SocialContext) =>
            !!(ctx.game?.gameWinner?.isWalkoff),
        resolve: (_: string, ctx: SocialContext) => {
            const gw       = ctx.game.gameWinner;
            const name     = gw?.playerName ?? 'UNKNOWN';
            const nameUp   = name.toUpperCase();
            const { winner, loser, winName } = scores(ctx);
            const ot       = otSuffix(ctx);
            const tags     = getHashtags(ctx);
            const shotType = gw?.shotType;

            const shotLabel =
                shotType === 'clutch_3'  ? 'BURIES THE THREE AT THE BUZZER'
              : shotType === 'clutch_2'  ? 'HITS THE GAME-WINNER'
              : shotType === 'clutch_ft' ? 'HITS THE GO-AHEAD FREE THROWS'
              : 'BURIES THE BUZZER BEATER';

            const variants = [
                `${nameUp} ${shotLabel}! 🚨\n\n${winName} win ${winner}-${loser}${ot}!\n\n${tags}`,
                `WHAT A FINISH! ${name} with the game-winner as the buzzer sounds! 🔥\n\n${winName} ${winner}, ${loser.toString()}-point loss for the visitors${ot}.\n\n${tags}`,
                `‼️ ${nameUp} AT THE BUZZER ‼️\n\n${winner}-${loser}${ot} | FINAL\n\n${tags}`,
            ];

            return {
                content: variants[Math.floor(Math.random() * variants.length)],
                data: buildStatCardData(ctx),
            };
        },
    },

    // ── OVERTIME THRILLER ─────────────────────────────────────────────────────
    {
        id: 'nba_overtime',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 97,
        type: 'general',
        condition: (ctx: SocialContext) =>
            !!(ctx.game?.isOT && !ctx.game?.gameWinner?.isWalkoff),
        resolve: (_: string, ctx: SocialContext) => {
            const { winner, loser, winName, loseName } = scores(ctx);
            const ot   = otSuffix(ctx);
            const tags = getHashtags(ctx);
            const topStat   = getTopPerformer(ctx);
            const topPlayer = topStat ? findPlayer(ctx, topStat.playerId) : null;
            const statline  = topStat ? formatStatline(topStat) : '';
            const otLabel   = ctx.game.otCount >= 2 ? `${ctx.game.otCount}OT` : 'OT';

            const variants = [
                `${otLabel} THRILLER 🔥\n\n${winName} edge the ${loseName}, ${winner}-${loser}!\n\n${topPlayer?.name ?? ''}: ${statline}\n\n${tags}`,
                `${winner}-${loser} | FINAL (${otLabel})\n\n${winName} survive in overtime behind ${topPlayer?.name ?? 'their stars'}.\n\n${topPlayer?.name ?? ''}: ${statline}\n\n${tags}`,
            ];

            return {
                content: variants[Math.floor(Math.random() * variants.length)],
                data: buildStatCardData(ctx),
            };
        },
    },

    // ── 50-POINT GAME ─────────────────────────────────────────────────────────
    {
        id: 'nba_fifty_points',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 100,
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && ctx.stats.pts >= 50),
        resolve: (_: string, ctx: SocialContext) => {
            const s    = ctx.stats;
            const name = ctx.player?.name ?? 'Unknown';
            const tags = getHashtags(ctx);

            const variants = [
                `${s.pts} POINTS. ${name.toUpperCase()} IS DIFFERENT. 🔥\n\n${formatStatline(s)}\n\n${tags}`,
                `${name} goes off for ${s.pts} points tonight. 💥\n\n${formatStatline(s)}\n\n${tags}`,
                `${s.pts}. ${name}. Tonight. 🚨\n\n${formatStatline(s)}\n\n${tags}`,
            ];

            return { content: variants[Math.floor(Math.random() * variants.length)], data: buildStatCardData(ctx) };
        },
    },

    // ── TRIPLE-DOUBLE ─────────────────────────────────────────────────────────
    {
        id: 'nba_triple_double',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 95,
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && isTripleDouble(ctx.stats)),
        resolve: (_: string, ctx: SocialContext) => {
            const s    = ctx.stats;
            const name = ctx.player?.name ?? 'Unknown';
            const tags = getHashtags(ctx);

            // Which three categories hit 10+
            const ddCats = [
                s.pts  >= 10 ? `${s.pts} PTS`  : null,
                s.reb  >= 10 ? `${s.reb} REB`  : null,
                s.ast  >= 10 ? `${s.ast} AST`  : null,
                s.stl  >= 10 ? `${s.stl} STL`  : null,
                s.blk  >= 10 ? `${s.blk} BLK`  : null,
            ].filter(Boolean).join(' | ');

            const variants = [
                `${name} records the triple-double! 📊\n\n${ddCats}\n\n${tags}`,
                `TRIPLE-DOUBLE for ${name.toUpperCase()} 💪\n\n${ddCats}\n\n${tags}`,
                `${name} does it all tonight.\n\n${ddCats}\n\n${tags}`,
            ];

            return { content: variants[Math.floor(Math.random() * variants.length)], data: buildStatCardData(ctx) };
        },
    },

    // ── 5×5 ───────────────────────────────────────────────────────────────────
    {
        id: 'nba_5x5',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 100,
        type: 'statline',
        condition: (ctx: SocialContext) => !!(ctx.stats && is5x5(ctx.stats)),
        resolve: (_: string, ctx: SocialContext) => {
            const s    = ctx.stats;
            const name = ctx.player?.name ?? 'Unknown';
            const tags = getHashtags(ctx);
            return {
                content: `HISTORIC PERFORMANCE from ${name.toUpperCase()} 🔥\n\n${s.pts} PTS | ${s.reb} REB | ${s.ast} AST | ${s.stl} STL | ${s.blk} BLK\n\nThe 5×5. One of the rarest stat lines in NBA history.\n\n${tags}`,
                data: buildStatCardData(ctx),
            };
        },
    },

    // ── PERFECT SHOOTING GAME ────────────────────────────────────────────────
    {
        id: 'nba_perfect_shooting',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 98,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.fga >= 8 && ctx.stats.fgm === ctx.stats.fga && ctx.stats.pts >= 20),
        resolve: (_: string, ctx: SocialContext) => {
            const s    = ctx.stats;
            const name = ctx.player?.name ?? 'Unknown';
            const tags = getHashtags(ctx);
            return {
                content: `${name} goes ${s.fgm}-for-${s.fga} from the field tonight. 🎯\n\n${s.pts} PTS | ${s.fgm}/${s.fga} FG\n\nPERFECT.\n\n${tags}`,
                data: buildStatCardData(ctx),
            };
        },
    },

    // ── BLOWOUT WIN ───────────────────────────────────────────────────────────
    {
        id: 'nba_blowout',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 88,
        type: 'general',
        condition: (ctx: SocialContext) =>
            !!(ctx.game && ctx.game.lead >= 25 && !ctx.player),
        resolve: (_: string, ctx: SocialContext) => {
            const { winner, loser, winName } = scores(ctx);
            const margin    = winner - loser;
            const topStat   = getTopPerformer(ctx);
            const topPlayer = topStat ? findPlayer(ctx, topStat.playerId) : null;
            const statline  = topStat ? formatStatline(topStat, true) : '';
            const tags      = getHashtags(ctx);

            return {
                content: `${winName} in dominant fashion tonight — winning by ${margin}.\n\n${winner}-${loser} | FINAL\n\n${topPlayer?.name ?? ''}: ${statline}\n\n${tags}`,
                data: buildStatCardData(ctx),
            };
        },
    },

    // ── CLOSE GAME / 1-POSSESSION FINISH ─────────────────────────────────────
    {
        id: 'nba_close_game',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 90,
        type: 'general',
        condition: (ctx: SocialContext) =>
            !!(ctx.game && ctx.game.lead <= 3 && !ctx.game?.gameWinner?.isWalkoff && !ctx.game?.isOT && !ctx.player),
        resolve: (_: string, ctx: SocialContext) => {
            const { winner, loser, winName, loseName } = scores(ctx);
            const tags = getHashtags(ctx);

            const variants = [
                `What a game! ${winName} hold off the ${loseName}, ${winner}-${loser}. 😤\n\n${tags}`,
                `DOWN TO THE WIRE. ${winName} escape with the win, ${winner}-${loser}.\n\n${tags}`,
                `${winner}-${loser} | FINAL\n\n${winName} survive in a close one. 🔥\n\n${tags}`,
            ];

            return {
                content: variants[Math.floor(Math.random() * variants.length)],
                data: buildStatCardData(ctx),
            };
        },
    },

    // ── QUARTER SCORE HIGHLIGHT (halftime / after big quarter) ───────────────
    {
        id: 'nba_quarter_explosion',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 85,
        type: 'statline',
        condition: (ctx: SocialContext) => {
            // Fire if player has an elite statline and the game had a wild quarter score
            const qs = ctx.game?.quarterScores;
            if (!qs) return false;
            const maxHome = Math.max(...qs.home);
            const maxAway = Math.max(...qs.away);
            return (maxHome >= 40 || maxAway >= 40) && !!(ctx.stats && ctx.stats.pts >= 25);
        },
        resolve: (_: string, ctx: SocialContext) => {
            const qs       = ctx.game.quarterScores;
            const maxQ     = Math.max(...qs.home, ...qs.away);
            const qNum     = [...qs.home, ...qs.away].indexOf(maxQ) % 4 + 1;
            const qLabel   = ['1st', '2nd', '3rd', '4th'][qNum - 1] ?? `Q${qNum}`;
            const name     = ctx.player?.name ?? '';
            const tags     = getHashtags(ctx);

            return {
                content: `${maxQ} points in the ${qLabel} quarter. The NBA is something else. 🔥\n\n${name}: ${formatStatline(ctx.stats)}\n\n${tags}`,
            };
        },
    },

    // ── INJURY UPDATE ─────────────────────────────────────────────────────────
    // Official team/NBA injury update — shorter and more formal than Shams
    {
        id: 'nba_injury_update',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 95,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && ctx.player.overallRating >= 82
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => {
            const name    = ctx.player?.name ?? 'Unknown';
            const team    = ctx.team?.name ?? 'The team';
            const inj     = ctx.injury.injuryType;
            const games   = ctx.injury.gamesRemaining;
            const timeStr = gamesToTime(games);
            const isLong  = games >= 60;

            const variants = [
                `Injury Update: ${name} (${inj}) is expected to miss ${timeStr}.`,
                `${team} announces ${name} will miss ${timeStr} with a ${inj}.`,
                `${name} is officially out ${timeStr} with a ${inj}${isLong ? '. We wish him a full and speedy recovery.' : '.'}`,
            ];

            return {
                content: variants[Math.floor(Math.random() * variants.length)],
            };
        },
    },

    // ── ALL-STAR GAME FINAL ───────────────────────────────────────────────────
    {
        id: 'nba_allstar_final',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 100,
        type: 'general',
        condition: (ctx: SocialContext) => !!(ctx.game?.isAllStar && !ctx.player),
        resolve: (_: string, ctx: SocialContext) => {
            const { winner, loser } = scores(ctx);
            const topStat   = getTopPerformer(ctx);
            const topPlayer = topStat ? findPlayer(ctx, topStat.playerId) : null;
            const mvp       = topPlayer?.name ?? 'Unknown';
            const tags      = '#NBA #NBAAllStar';

            return {
                content: `FINAL: ${winner}-${loser} at the #NBAAllStar Game! 🌟\n\nAll-Star Game MVP: ${mvp}\n\n${topPlayer?.name ?? ''}: ${topStat ? formatStatline(topStat) : ''}\n\n${tags}`,
            };
        },
    },

    // ── RISING STARS FINAL ───────────────────────────────────────────────────
    {
        id: 'nba_rising_stars',
        handle: 'nba_official',
        template: 'DYNAMIC',
        priority: 98,
        type: 'general',
        condition: (ctx: SocialContext) => !!(ctx.game?.isRisingStars && !ctx.player),
        resolve: (_: string, ctx: SocialContext) => {
            const { winner, loser } = scores(ctx);
            const topStat   = getTopPerformer(ctx);
            const topPlayer = topStat ? findPlayer(ctx, topStat.playerId) : null;
            const tags      = '#NBAAllStar #RisingStars';

            return {
                content: `FINAL: Rising Stars — ${winner}-${loser} 🌟\n\nThe future of the NBA is bright.\n\n${topPlayer?.name ?? ''}: ${topStat ? formatStatline(topStat) : ''}\n\n${tags}`,
            };
        },
    },
];