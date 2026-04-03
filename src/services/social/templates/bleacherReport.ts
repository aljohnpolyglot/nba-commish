import { SocialTemplate, SocialContext } from '../types';
import { getRating, isReigningChamp, calculateAge, getGameScore, get2KRating } from '../helpers';
import { convertTo2KRating } from '../../../utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// BLEACHER REPORT — highlight-first, lists/rankings, all-caps energy
// Best templates: br_detonated, br_mock_draft, br_mvp_ladder, br_scary_duos,
//                br_league_pass — all kept, just bug-fixed
// ─────────────────────────────────────────────────────────────────────────────

/** Games → human time for injury posts */
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

/** Look up team name from ctx.teams by id */
function teamName(ctx: SocialContext, tid: number): string {
    return ctx.teams?.find((t: any) => t.id === tid)?.name ?? 'Unknown';
}

export const BLEACHER_REPORT_TEMPLATES: SocialTemplate[] = [

    // ── WILD FINISH ───────────────────────────────────────────────────────────
    {
        id: 'br_wild',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 85,
        type: 'general',
        condition: (ctx: SocialContext) => {
            const margin = Math.abs(ctx.game.homeScore - ctx.game.awayScore);
            return margin <= 4 && (ctx.game.homeScore > 120 || ctx.game.awayScore > 120);
        },
        resolve: (_: string, ctx: SocialContext) => ({
            content: `${teamName(ctx, ctx.game.winnerId)} wins a WILD one! 🔥`,
        }),
    },

    // ── LEADS WIN — fixed: PTS/REB/AST order, threshold raised to 28 ─────────
    {
        id: 'br_leads_win',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 93,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.pts >= 28 && ctx.game?.winnerId === ctx.team?.id),
        resolve: (_: string, ctx: SocialContext) => {
            const s       = ctx.stats;
            const name    = (ctx.player?.name ?? '').toUpperCase();
            const team    = (ctx.team?.name ?? '').toUpperCase();
            const opp     = (ctx.opponent?.name ?? '').toUpperCase();
            // Only include REB/AST if meaningful
            const rebLine = s.reb >= 5  ? `\n${s.reb} REB` : '';
            const astLine = s.ast >= 4  ? `\n${s.ast} AST` : '';
            const tpmLine = s.threePm >= 4 ? `\n${s.threePm} 3PM` : '';
            return {
                content: `${name} LEADS ${team} IN WIN VS. ${opp} 😤🔥\n\n${s.pts} PTS${rebLine}${astLine}${tpmLine}\n${s.fgm}-${s.fga} FG`,
            };
        },
    },

    // ── GAVE ALL (loss performance) — fixed: no zero-stat dumps, no bad pronoun ─
    {
        id: 'br_gave_all',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 88,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.pts >= 35 && ctx.game?.winnerId !== ctx.team?.id),
        resolve: (_: string, ctx: SocialContext) => {
            const s     = ctx.stats;
            const name  = ctx.player?.name ?? 'Unknown';
            const team  = ctx.team?.name ?? 'the team';
            const lines = [
                `${s.pts} PTS`,
                s.reb >= 5 ? `${s.reb} REB`  : null,
                s.ast >= 4 ? `${s.ast} AST`  : null,
                `${s.fgm}-${s.fga} FG`,
                s.threePm >= 3 ? `${s.threePm}-${s.threePa} 3FG` : null,
            ].filter(Boolean).join('\n');
            return {
                content: `${lines}\n\n${name} gave his all for the ${team} tonight 👏`,
            };
        },
    },

    // ── UNIFIED BUZZER BEATER — replaces the 3 overlapping ones ──────────────
    // Now reads from game.gameWinner like every other handle does
    {
        id: 'br_buzzer_beater',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 100,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.game?.gameWinner?.isWalkoff),
        resolve: (_: string, ctx: SocialContext) => {
            const gw      = ctx.game.gameWinner;
            const nameUp  = (gw?.playerName ?? '').toUpperCase();
            const isOT    = ctx.game.isOT;
            const otCount = ctx.game.otCount ?? 1;
            const otLabel = otCount >= 2 ? `${otCount}OT` : 'OT';

            const variants = isOT ? [
                `${nameUp} OT BUZZER BEATER FOR THE WIN 🔥🔥\n\n(via @NBA)`,
                `${nameUp} AT THE BUZZER IN ${otLabel} FOR THE WIN!!!! 🚨`,
            ] : [
                `${nameUp} AT THE BUZZER FOR THE WIN!!!! 🚨`,
                `${nameUp} AT THE BUZZER FOR THE WIN!!! 🚨`,
            ];

            return {
                content: variants[Math.floor(Math.random() * variants.length)],
            };
        },
    },

    // ── BLOCK + OOP ───────────────────────────────────────────────────────────
    {
        id: 'br_block_oop',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 92,
        type: 'highlight',
        condition: (ctx: SocialContext) => {
            if (!ctx.player || !ctx.stats) return false;
            const blk = getRating(ctx.player, 'blk');
            const dnk = getRating(ctx.player, 'dnk');
            const hgt = (ctx.player as any).hgt ?? 50;
            const jmp = getRating(ctx.player, 'jmp');
            return blk > 60 && dnk > 60 && hgt > 50 && jmp > 50 && ctx.stats.blk >= 1;
        },
        resolve: (_: string, ctx: SocialContext) => {
            const oppStats = ctx.game.homeTeamId === ctx.opponent?.id
                ? ctx.game.homeStats : ctx.game.awayStats;
            const oppPlayer = oppStats[Math.floor(Math.random() * oppStats.length)];
            return {
                content: `${ctx.player?.name} BLOCKED ${oppPlayer?.name ?? 'his opponent'} then CAUGHT THE OOP on the other end 😱`,
            };
        },
    },

    // ── POSTERIZER — fires on actual posterizer highlight, uses victim name ──────
    {
        id: 'br_poster',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 96,
        type: 'highlight',
        condition: (ctx: SocialContext) => {
            if (!ctx.player) return false;
            const hl: any[] = (ctx.game as any).highlights ?? [];
            return hl.some((h: any) => h.type === 'posterizer' && h.playerId === ctx.player!.internalId);
        },
        resolve: (_: string, ctx: SocialContext) => {
            const hl: any[]  = (ctx.game as any).highlights ?? [];
            const pid         = ctx.player?.internalId;
            const event       = hl.find((h: any) => h.type === 'posterizer' && h.playerId === pid);
            const name        = ctx.player?.name ?? 'Unknown';
            const victim      = event?.victimName as string | undefined;
            const victimUp    = victim?.toUpperCase() ?? 'THE DEFENDER';
            const nameUp      = name.toUpperCase();
            const variants = victim ? [
                `${nameUp} JUST PUT ${victimUp} ON A POSTER 😱💥📸`,
                `${nameUp} DETONATED ON ${victimUp} WITH NO REGARD FOR HUMAN LIFE 😭💀`,
                `Hang it in the Louvre.\n\n${nameUp} POSTERIZED ${victimUp}. 🖼️🔥`,
                `${victim} will never be the same. ${nameUp} cooked him. 💀`,
                `R.I.P. ${victim}. ${nameUp} went right at him. 😭`,
            ] : [
                `This ${name} poster doesn't even look real ✌️😭`,
                `${nameUp} JUST CAUGHT A BODY 💀📸`,
                `Hang it in the Louvre. ${name} is different. 🖼️🔥`,
                `${nameUp} WITH NO REGARD FOR HUMAN LIFE 😭💥`,
            ];
            return { content: variants[Math.floor(Math.random() * variants.length)] };
        },
    },

    // ── ALLEY-OOP ─────────────────────────────────────────────────────────────
    {
        id: 'br_alley_oop',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 94,
        type: 'highlight',
        condition: (ctx: SocialContext) => {
            if (!ctx.player) return false;
            const hl: any[] = (ctx.game as any).highlights ?? [];
            return hl.some((h: any) => h.type === 'alley_oop' && h.playerId === ctx.player!.internalId);
        },
        resolve: (_: string, ctx: SocialContext) => {
            const hl: any[] = (ctx.game as any).highlights ?? [];
            const pid        = ctx.player?.internalId;
            const event      = hl.find((h: any) => h.type === 'alley_oop' && h.playerId === pid);
            const nameUp     = (ctx.player?.name ?? '').toUpperCase();
            const passer     = event?.assisterName as string | undefined;
            const passerUp   = passer?.toUpperCase();
            const variants = passer ? [
                `${passerUp} ➡️ ${nameUp} FOR THE LOB 😱🔥\n\nThe crowd just erupted.`,
                `${nameUp} CAUGHT THE OOP 🤯\n\n${passer} with the perfect lob.`,
                `${passerUp} FINDS ${nameUp} ABOVE THE RIM 🔥`,
                `THE LOB CONNECTION 😱\n\n${passer} → ${ctx.player?.name}`,
            ] : [
                `${nameUp} CAUGHT THE OOP 😱🔥`,
                `${nameUp} ABOVE THE RIM 🤯 THE CROWD HAS LOST IT`,
                `SOMEBODY FOUND ${nameUp} FOR THE LOB 🔥`,
            ];
            return { content: variants[Math.floor(Math.random() * variants.length)] };
        },
    },

    // ── FAST BREAK DUNK ───────────────────────────────────────────────────────
    {
        id: 'br_fastbreak',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 91,
        type: 'highlight',
        condition: (ctx: SocialContext) => {
            if (!ctx.player) return false;
            const hl: any[] = (ctx.game as any).highlights ?? [];
            return hl.some((h: any) => h.type === 'fastbreak_dunk' && h.playerId === ctx.player!.internalId);
        },
        resolve: (_: string, ctx: SocialContext) => {
            const hl: any[]  = (ctx.game as any).highlights ?? [];
            const pid         = ctx.player?.internalId;
            const event       = hl.find((h: any) => h.type === 'fastbreak_dunk' && h.playerId === pid);
            const nameUp      = (ctx.player?.name ?? '').toUpperCase();
            const starter     = event?.assisterName as string | undefined;
            const isSelf      = starter === ctx.player?.name;
            const variants = (starter && !isSelf) ? [
                `${starter.toUpperCase()} STARTS THE BREAK ➡️ ${nameUp} FINISHES 💨🔥`,
                `TRANSITION DUNK 🏃‍♂️💨\n\n${starter} with the steal, ${ctx.player?.name} with the finish.`,
                `${nameUp} IN THE OPEN FLOOR — NOBODY STOPPING HIM 😤`,
            ] : [
                `${nameUp} STEAL AND SCORE 💨🔥`,
                `${nameUp} ON THE FASTBREAK — GOOD NIGHT 😱`,
                `${nameUp} TOOK IT THE DISTANCE 🏃‍♂️🔥`,
            ];
            return { content: variants[Math.floor(Math.random() * variants.length)] };
        },
    },

    // ── DETONATED / GENERIC DUNK (fallback when no highlight data) ────────────
    {
        id: 'br_detonated',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 88,
        type: 'highlight',
        condition: (ctx: SocialContext) => {
            if (!ctx.player || !ctx.stats) return false;
            // Only fire if no specific dunk highlight already covered this player
            const hl: any[] = (ctx.game as any).highlights ?? [];
            const pid = ctx.player.internalId;
            const hasSpecific = hl.some((h: any) =>
                ['posterizer', 'alley_oop', 'fastbreak_dunk'].includes(h.type) && h.playerId === pid
            );
            if (hasSpecific) return false;
            const drb = getRating(ctx.player, 'drb');
            const spd = getRating(ctx.player, 'spd');
            const dnk = getRating(ctx.player, 'dnk');
            return drb > 65 && spd > 65 && dnk > 70 && ctx.stats.pts > 20;
        },
        resolve: (_: string, ctx: SocialContext) => {
            const nameUp = (ctx.player?.name ?? '').toUpperCase();
            const variants = [
                `${nameUp} JUST DETONATED ON THE DEFENSE 😱💥`,
                `${nameUp} PUT SOMEONE ON A POSTER 📸💀`,
                `OH MY GOODNESS ${nameUp} 🤯🔥`,
                `${nameUp} WITH NO REGARD FOR HUMAN LIFE 😭`,
            ];
            return { content: variants[Math.floor(Math.random() * variants.length)] };
        },
    },

    // ── CLUTCH DAGGER ─────────────────────────────────────────────────────────
    {
        id: 'br_clutch_dagger',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 94,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.pts >= 28 && (ctx.game?.lead ?? 99) <= 4 && ctx.game?.winnerId === ctx.team?.id),
        resolve: (_: string, ctx: SocialContext) => ({
            content: `"THIS IS WHAT THE F--K I DO!" 🗣️\n\n${ctx.player?.name} was HYPE after hitting the clutch dagger 😤🔥`,
        }),
    },

    // ── TOOK DOWN CHAMPS ─────────────────────────────────────────────────────
    {
        id: 'br_took_down_champs',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 96,
        type: 'statline',
        condition: (ctx: SocialContext) =>
            !!(ctx.stats && ctx.stats.pts >= 25
                && ctx.game?.winnerId === ctx.team?.id
                && isReigningChamp(ctx.opponent)),
        resolve: (_: string, ctx: SocialContext) => ({
            content: `${(ctx.player?.name ?? '').toUpperCase()} DROPS ${ctx.stats.pts} TO LEAD THE ${(ctx.team?.name ?? '').toUpperCase()} TO THE WIN 🔥\n\nTook down the reigning champs 😤`,
        }),
    },

    // ── BEST AT EVERY AGE ─────────────────────────────────────────────────────
    {
        id: 'br_best_at_age',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 10,
        type: 'general',
        condition: (ctx: SocialContext) => !!(Math.random() < 0.01 && ctx.players?.length),
        resolve: (_: string, ctx: SocialContext) => {
            const getBestAtAge = (age: number, fallback: string) => {
                if (!ctx.players) return fallback;
                const atAge = ctx.players
                    .filter((p: any) => calculateAge(p) === age && p.status !== 'Retired')
                    .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
                return atAge[0]?.name ?? fallback;
            };
            return {
                content: [
                    'BEST NBA PLAYER AT EVERY AGE 🔥',
                    '',
                    `- Age 21: ${getBestAtAge(21, 'Victor Wembanyama')}`,
                    `- Age 25: ${getBestAtAge(25, 'Luka Dončić')}`,
                    `- Age 30: ${getBestAtAge(30, 'Nikola Jokić')}`,
                    `- Age 35: ${getBestAtAge(35, 'Stephen Curry')}`,
                    `- Age 40: ${getBestAtAge(40, 'LeBron James')}`,
                    '',
                    'Full list here ➡️: https://bleacherreport.com/articles/best-nba-player-every-age',
                ].join('\n'),
            };
        },
    },

    // ── MVP LADDER ────────────────────────────────────────────────────────────
    {
        id: 'br_mvp_ladder',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 85,
        type: 'general',
        condition: (ctx: SocialContext) => {
            const date = new Date(ctx.date);
            const isAfterDec1 = (date.getMonth() === 11 && date.getFullYear() === 2025) || date.getFullYear() >= 2026;
            return isAfterDec1 && Math.random() < 0.05 && !!ctx.players;
        },
        resolve: (_: string, ctx: SocialContext) => {
            if (!ctx.players) return { content: '' };

            const candidates = ctx.players
                .filter((p: any) => get2KRating(p) >= 88 && p.status !== 'Retired')
                .sort((a: any, b: any) => {
                    const aTeam = ctx.teams?.find((t: any) => t.id === a.tid);
                    const bTeam = ctx.teams?.find((t: any) => t.id === b.tid);
                    const getMvpScore = (p: any, team: any) => {
                        if (!p.stats?.length) return (p.overallRating ?? 0) / 4;
                        const s = p.stats[p.stats.length - 1];
                        const avgGS = getGameScore(s) / (s.gp || 1);
                        const totalGames = (team?.wins + team?.losses) || 1;
                        const winPct = (team?.wins ?? 0) / totalGames;
                        return avgGS * (1 + winPct) * (s.gp / totalGames);
                    };
                    return getMvpScore(b, bTeam) - getMvpScore(a, aTeam);
                })
                .slice(0, 5);

            if (candidates.length < 5) return { content: '' };

            return {
                content: [
                    'NBA MVP LADDER 🏆',
                    '',
                    `1. ${candidates[0].name}`,
                    `2. ${candidates[1].name}`,
                    `3. ${candidates[2].name}`,
                    `4. ${candidates[3].name}`,
                    `5. ${candidates[4].name}`,
                    '',
                    'Who you got? 👇',
                ].join('\n'),
            };
        },
    },

    // ── SCARY DUOS ────────────────────────────────────────────────────────────
    {
        id: 'br_scary_duos',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 80,
        type: 'general',
        condition: (ctx: SocialContext) => {
            const date = new Date(ctx.date);
            const isAfterDec1 = date.getMonth() >= 11 || date.getFullYear() > 2025;
            return isAfterDec1 && Math.random() < 0.02 && !!ctx.players && !!ctx.teams;
        },
        resolve: (_: string, ctx: SocialContext) => {
            if (!ctx.players || !ctx.teams) return { content: '' };

            const teamDuos: { team: string; duo: string; score: number }[] = [];

            ctx.teams.forEach((team: any) => {
                const teamPlayers = ctx.players!.filter(
                    (p: any) => p.tid === team.id && p.status !== 'Retired' && p.tid >= 0
                );
                if (teamPlayers.length < 2) return;

                teamPlayers.sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
                const p1_2k = convertTo2KRating(teamPlayers[0].overallRating ?? 0, teamPlayers[0].ratings?.[teamPlayers[0].ratings.length-1]?.hgt ?? 50, teamPlayers[0].ratings?.[teamPlayers[0].ratings.length-1]?.tp);
                const p2_2k = convertTo2KRating(teamPlayers[1].overallRating ?? 0, teamPlayers[1].ratings?.[teamPlayers[1].ratings.length-1]?.hgt ?? 50, teamPlayers[1].ratings?.[teamPlayers[1].ratings.length-1]?.tp);
                const avg2k = (p1_2k + p2_2k) / 2;

                if (avg2k < 87) return;

                const getProd = (p: any) => {
                    if (!p.stats?.length) return 0;
                    const s = p.stats[p.stats.length - 1];
                    const totalGames = (team.wins + team.losses) || 1;
                    return (getGameScore(s) / (s.gp || 1)) * (s.gp / totalGames);
                };

                teamDuos.push({
                    team: team.name,
                    duo: `${teamPlayers[0].name} & ${teamPlayers[1].name}`,
                    score: avg2k + getProd(teamPlayers[0]) + getProd(teamPlayers[1]) + (Math.random() * 2 - 1),
                });
            });

            const topDuos = teamDuos.sort((a, b) => b.score - a.score).slice(0, 3);
            if (topDuos.length < 3) return { content: '' };

            return {
                content: [
                    'THE SCARIEST DUOS IN THE LEAGUE 😤🔥',
                    '',
                    `- ${topDuos[0].team}: ${topDuos[0].duo}`,
                    `- ${topDuos[1].team}: ${topDuos[1].duo}`,
                    `- ${topDuos[2].team}: ${topDuos[2].duo}`,
                    '',
                    'League is in trouble. 😱',
                ].join('\n'),
            };
        },
    },

    // ── MOCK DRAFT ────────────────────────────────────────────────────────────
    {
        id: 'br_mock_draft',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 80,
        type: 'general',
        condition: (ctx: SocialContext) => {
            const date = new Date(ctx.date);
            const isAfterJan1 = date.getMonth() >= 0 && date.getFullYear() >= 2026;
            return isAfterJan1 && Math.random() < 0.05 && !!ctx.players;
        },
        resolve: (_: string, ctx: SocialContext) => {
            if (!ctx.players || !ctx.teams) return { content: '' };

            const prospects = ctx.players.filter(
                (p: any) => p.status === 'Draft Prospect' || p.status === 'Prospect'
            );
            if (prospects.length < 5) return { content: '' };

            const ranked = prospects.sort((a: any, b: any) => {
                const aVal = (a.overallRating ?? 0) + (Math.random() * 10 - 5);
                const bVal = (b.overallRating ?? 0) + (Math.random() * 10 - 5);
                return bVal - aVal;
            });

            const bottomTeams = [...ctx.teams].sort((a: any, b: any) => (b.losses ?? 0) - (a.losses ?? 0));
            if (bottomTeams.length < 5) return { content: '' };

            return {
                content: [
                    'WAY-TOO-EARLY 2026 MOCK DRAFT 🔥',
                    '',
                    `1. ${bottomTeams[0].name}: ${ranked[0].name}`,
                    `2. ${bottomTeams[1].name}: ${ranked[1].name}`,
                    `3. ${bottomTeams[2].name}: ${ranked[2].name}`,
                    `4. ${bottomTeams[3].name}: ${ranked[3].name}`,
                    `5. ${bottomTeams[4].name}: ${ranked[4].name}`,
                    '',
                    'FULL: https://bleacherreport.com/articles/2026-nba-mock-draft',
                ].join('\n'),
            };
        },
    },

    // ── LEAGUE PASS ALERT ─────────────────────────────────────────────────────
    {
        id: 'br_league_pass',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 90,
        type: 'general',
        condition: (ctx: SocialContext) => {
            if (!ctx.team || !ctx.opponent || !ctx.teams) return false;
            const t1Games = ctx.team.wins + ctx.team.losses;
            const t2Games = ctx.opponent.wins + ctx.opponent.losses;
            if (t1Games < 10 || t2Games < 10) return false;

            const sorted = [...ctx.teams].sort((a: any, b: any) => {
                const ap = a.wins / (a.wins + a.losses || 1);
                const bp = b.wins / (b.wins + b.losses || 1);
                return bp - ap;
            });
            const top6 = sorted.slice(0, 6).map((t: any) => t.id);
            return top6.includes(ctx.team.id) && top6.includes(ctx.opponent.id) && Math.random() < 0.2;
        },
        resolve: (_: string, ctx: SocialContext) => ({
            content: `LEAGUE PASS ALERT 🚨\n\n${ctx.team?.name} vs ${ctx.opponent?.name} tonight is going to be a movie. 🍿🎬`,
        }),
    },

    // ── INJURY ────────────────────────────────────────────────────────────────
    // Fixed: human time instead of raw game count
    {
        id: 'br_injury',
        handle: 'bleacher_report',
        template: 'DYNAMIC',
        priority: 85,
        type: 'news',
        condition: (ctx: SocialContext) =>
            !!(ctx.injury && ctx.player
                && get2KRating(ctx.player) > 83
                && ctx.injury.injuryType !== 'Load Management'),
        resolve: (_: string, ctx: SocialContext) => ({
            content: `Hate to see it. 💔\n\n${ctx.player?.name} is expected to miss ${gamesToTime(ctx.injury.gamesRemaining)} with a ${ctx.injury.injuryType}.`,
        }),
    },
];