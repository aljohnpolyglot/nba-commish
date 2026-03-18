import { NBAPlayer as Player, DraftPick, Game } from '../../../types';

export const processSimulationResults = (
    allSimResults: any[],
    players: Player[],
    draftPicks: DraftPick[],
    schedule?: Game[]
) => {
    let updatedPlayers = [...players];
    let updatedDraftPicks = [...draftPicks];

    const playerStatsMap = new Map<string, any>();
    const playoffStatsMap = new Map<string, any>();
    allSimResults.forEach(res => {
        // Skip exhibition games — All-Star, Rising Stars,
        // Celebrity Game all have negative team IDs
        // Adding their stats would inflate season numbers
        if (res.homeTeamId < 0 || res.awayTeamId < 0) return;

        if (res.injuries) {
            res.injuries.forEach((injury: any) => {
                updatedPlayers = updatedPlayers.map(p =>
                    p.internalId === injury.playerId
                        ? { ...p, injury: { type: injury.injuryType, gamesRemaining: injury.gamesRemaining } }
                        : p
                );
            });
        }

        // Identify game type via schedule lookup
        const schedGame = schedule?.find(g => g.gid === res.gameId);
        const isPlayoffGame = schedGame?.isPlayoff === true;
        const isPlayInGame = schedGame?.isPlayIn === true;
        const isPreseasonGame = schedGame?.isPreseason === true;

        // Route stats: regular → playerStatsMap, playoff → playoffStatsMap, play-in/preseason → skip
        if (!isPlayoffGame && !isPlayInGame && !isPreseasonGame) {
            [...res.homeStats, ...res.awayStats].forEach(stat => {
                if (!playerStatsMap.has(stat.playerId)) {
                    playerStatsMap.set(stat.playerId, []);
                }
                playerStatsMap.get(stat.playerId).push(stat);
            });
        } else if (isPlayoffGame) {
            [...res.homeStats, ...res.awayStats].forEach(stat => {
                if (!playoffStatsMap.has(stat.playerId)) {
                    playoffStatsMap.set(stat.playerId, []);
                }
                playoffStatsMap.get(stat.playerId).push(stat);
            });
        }
    });

    if (playerStatsMap.size > 0) {
        updatedPlayers = updatedPlayers.map(p => {
            const gameStats = playerStatsMap.get(p.internalId);
            if (!gameStats) return p;

            const stats = [...(p.stats || [])];
            const currentSeason = 2026;
            let seasonStatIndex = stats.findIndex(s => s.season === currentSeason && !s.playoffs);
            
            let seasonStat: any;
            if (seasonStatIndex === -1) {
                seasonStat = {
                    season: currentSeason,
                    tid: p.tid,
                    gp: 0, gs: 0, min: 0, fg: 0, fga: 0, fgp: 0, tp: 0, tpa: 0, tpp: 0, ft: 0, fta: 0, ftp: 0,
                    orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, per: 0,
                    pm: 0, tsPct: 0, efgPct: 0, usgPct: 0, ortg: 0, drtg: 0, bpm: 0, ws: 0, vorp: 0,
                    _perSum: 0, _usgPctSum: 0, _ortgSum: 0, _drtgSum: 0, _bpmSum: 0
                };
                stats.push(seasonStat);
                seasonStatIndex = stats.length - 1;
            } else {
                seasonStat = { ...stats[seasonStatIndex] };
                // Initialize sums if they don't exist
                if (seasonStat._perSum === undefined) seasonStat._perSum = (seasonStat.per || 0) * seasonStat.gp;
                if (seasonStat._usgPctSum === undefined) seasonStat._usgPctSum = (seasonStat.usgPct || 0) * seasonStat.gp;
                if (seasonStat._ortgSum === undefined) seasonStat._ortgSum = (seasonStat.ortg || 0) * seasonStat.gp;
                if (seasonStat._drtgSum === undefined) seasonStat._drtgSum = (seasonStat.drtg || 0) * seasonStat.gp;
                if (seasonStat._bpmSum === undefined) seasonStat._bpmSum = (seasonStat.bpm || 0) * seasonStat.gp;
            }

            gameStats.forEach((stat: any) => {
                seasonStat.gp += 1;
                seasonStat.gs += (stat.gs || 0);
                seasonStat.min += stat.min;
                seasonStat.pts += stat.pts;
                seasonStat.trb += (stat.reb || (stat.orb || 0) + (stat.drb || 0));
                seasonStat.orb += (stat.orb || 0);
                seasonStat.drb += (stat.drb || 0);
                seasonStat.ast += stat.ast;
                seasonStat.stl += stat.stl;
                seasonStat.blk += stat.blk;
                seasonStat.tov += stat.tov;
                seasonStat.pf += stat.pf || 0;
                seasonStat.fg += stat.fgm;
                seasonStat.fga += stat.fga;
                seasonStat.tp += stat.threePm;
                seasonStat.tpa += stat.threePa;
                seasonStat.ft += stat.ftm;
                seasonStat.fta += stat.fta;
                
                // Advanced stats
                seasonStat.pm = (seasonStat.pm || 0) + (stat.pm || 0);
                seasonStat.ws = (seasonStat.ws || 0) + (stat.ws || 0);
                seasonStat.ows = (seasonStat.ows || 0) + (stat.ows || 0);
                seasonStat.dws = (seasonStat.dws || 0) + (stat.dws || 0);
                seasonStat.vorp = (seasonStat.vorp || 0) + (stat.vorp || 0);
                
                seasonStat._perSum += (stat.per || 0);
                seasonStat._usgPctSum += (stat.usgPct || 0);
                seasonStat._ortgSum += (stat.ortg || 0);
                seasonStat._drtgSum += (stat.drtg || 0);
                seasonStat._bpmSum += (stat.bpm || 0);
            });
            
            // Update percentages and averages
            seasonStat.fgp = seasonStat.fga > 0 ? (seasonStat.fg / seasonStat.fga) * 100 : 0;
            seasonStat.tpp = seasonStat.tpa > 0 ? (seasonStat.tp / seasonStat.tpa) * 100 : 0;
            seasonStat.ftp = seasonStat.fta > 0 ? (seasonStat.ft / seasonStat.fta) * 100 : 0;

            if (seasonStat.gp > 0) {
                seasonStat.per = seasonStat._perSum / seasonStat.gp;
                seasonStat.usgPct = seasonStat._usgPctSum / seasonStat.gp;
                seasonStat.drtg = seasonStat._drtgSum / seasonStat.gp;
                seasonStat.bpm = seasonStat._bpmSum / seasonStat.gp;
                
                // Recalculate season-wide TS%, eFG%, and ORtg
                const tsDenom = 2 * (seasonStat.fga + 0.44 * seasonStat.fta);
                seasonStat.tsPct = tsDenom > 0 ? (seasonStat.pts / tsDenom) * 100 : 0;
                seasonStat.efgPct = seasonStat.fga > 0 ? ((seasonStat.fg + 0.5 * seasonStat.tp) / seasonStat.fga) * 100 : 0;
                
                const seasonPoss = seasonStat.fga + 0.44 * seasonStat.fta - seasonStat.orb + seasonStat.tov;
                seasonStat.ortg = seasonPoss > 0 ? (seasonStat.pts * 100) / seasonPoss : 0;
            }

            stats[seasonStatIndex] = seasonStat;
            return { ...p, stats };
        });
    }

    // ── Playoff stats accumulation ──────────────────────────────────────────
    if (playoffStatsMap.size > 0) {
        updatedPlayers = updatedPlayers.map(p => {
            const gameStats = playoffStatsMap.get(p.internalId);
            if (!gameStats) return p;

            const stats = [...(p.stats || [])];
            const currentSeason = 2026;
            let statIndex = stats.findIndex(s => s.season === currentSeason && s.playoffs === true);

            let seasonStat: any;
            if (statIndex === -1) {
                seasonStat = {
                    season: currentSeason,
                    playoffs: true,
                    tid: p.tid,
                    gp: 0, gs: 0, min: 0, fg: 0, fga: 0, fgp: 0, tp: 0, tpa: 0, tpp: 0, ft: 0, fta: 0, ftp: 0,
                    orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, per: 0,
                    pm: 0, tsPct: 0, efgPct: 0, usgPct: 0, ortg: 0, drtg: 0, bpm: 0, ws: 0, vorp: 0,
                    _perSum: 0, _usgPctSum: 0, _ortgSum: 0, _drtgSum: 0, _bpmSum: 0
                };
                stats.push(seasonStat);
                statIndex = stats.length - 1;
            } else {
                seasonStat = { ...stats[statIndex] };
                if (seasonStat._perSum === undefined) seasonStat._perSum = (seasonStat.per || 0) * seasonStat.gp;
                if (seasonStat._usgPctSum === undefined) seasonStat._usgPctSum = (seasonStat.usgPct || 0) * seasonStat.gp;
                if (seasonStat._ortgSum === undefined) seasonStat._ortgSum = (seasonStat.ortg || 0) * seasonStat.gp;
                if (seasonStat._drtgSum === undefined) seasonStat._drtgSum = (seasonStat.drtg || 0) * seasonStat.gp;
                if (seasonStat._bpmSum === undefined) seasonStat._bpmSum = (seasonStat.bpm || 0) * seasonStat.gp;
            }

            gameStats.forEach((stat: any) => {
                seasonStat.gp += 1;
                seasonStat.gs += (stat.gs || 0);
                seasonStat.min += stat.min;
                seasonStat.pts += stat.pts;
                seasonStat.trb += (stat.reb || (stat.orb || 0) + (stat.drb || 0));
                seasonStat.orb += (stat.orb || 0);
                seasonStat.drb += (stat.drb || 0);
                seasonStat.ast += stat.ast;
                seasonStat.stl += stat.stl;
                seasonStat.blk += stat.blk;
                seasonStat.tov += stat.tov;
                seasonStat.pf += stat.pf || 0;
                seasonStat.fg += stat.fgm;
                seasonStat.fga += stat.fga;
                seasonStat.tp += stat.threePm;
                seasonStat.tpa += stat.threePa;
                seasonStat.ft += stat.ftm;
                seasonStat.fta += stat.fta;
                seasonStat.pm = (seasonStat.pm || 0) + (stat.pm || 0);
                seasonStat.ws = (seasonStat.ws || 0) + (stat.ws || 0);
                seasonStat.vorp = (seasonStat.vorp || 0) + (stat.vorp || 0);
                seasonStat._perSum += (stat.per || 0);
                seasonStat._usgPctSum += (stat.usgPct || 0);
                seasonStat._ortgSum += (stat.ortg || 0);
                seasonStat._drtgSum += (stat.drtg || 0);
                seasonStat._bpmSum += (stat.bpm || 0);
            });

            seasonStat.fgp = seasonStat.fga > 0 ? (seasonStat.fg / seasonStat.fga) * 100 : 0;
            seasonStat.tpp = seasonStat.tpa > 0 ? (seasonStat.tp / seasonStat.tpa) * 100 : 0;
            seasonStat.ftp = seasonStat.fta > 0 ? (seasonStat.ft / seasonStat.fta) * 100 : 0;

            if (seasonStat.gp > 0) {
                seasonStat.per = seasonStat._perSum / seasonStat.gp;
                seasonStat.usgPct = seasonStat._usgPctSum / seasonStat.gp;
                seasonStat.drtg = seasonStat._drtgSum / seasonStat.gp;
                seasonStat.bpm = seasonStat._bpmSum / seasonStat.gp;
                const tsDenom = 2 * (seasonStat.fga + 0.44 * seasonStat.fta);
                seasonStat.tsPct = tsDenom > 0 ? (seasonStat.pts / tsDenom) * 100 : 0;
                seasonStat.efgPct = seasonStat.fga > 0 ? ((seasonStat.fg + 0.5 * seasonStat.tp) / seasonStat.fga) * 100 : 0;
                const seasonPoss = seasonStat.fga + 0.44 * seasonStat.fta - seasonStat.orb + seasonStat.tov;
                seasonStat.ortg = seasonPoss > 0 ? (seasonStat.pts * 100) / seasonPoss : 0;
            }

            stats[statIndex] = seasonStat;
            return { ...p, stats };
        });
    }

    // Decrement injury and suspension games remaining for players whose teams played today
    const teamGamesPlayed = new Map<number, number>();
    allSimResults.forEach(res => {
        if (res.homeTeamId < 0 || res.awayTeamId < 0) return;
        teamGamesPlayed.set(res.homeTeamId, (teamGamesPlayed.get(res.homeTeamId) || 0) + 1);
        teamGamesPlayed.set(res.awayTeamId, (teamGamesPlayed.get(res.awayTeamId) || 0) + 1);
    });

    updatedPlayers = updatedPlayers.map(p => {
        let updated = { ...p };
        let changed = false;
        const gamesPlayed = teamGamesPlayed.get(p.tid) || 0;

        if (gamesPlayed > 0) {
            if (p.injury && p.injury.gamesRemaining > 0) {
                updated.injury = { ...p.injury, gamesRemaining: Math.max(0, p.injury.gamesRemaining - gamesPlayed) };
                if (updated.injury.gamesRemaining === 0) delete updated.injury;
                changed = true;
            }

            if (p.suspension && p.suspension.gamesRemaining > 0) {
                updated.suspension = { ...p.suspension, gamesRemaining: Math.max(0, p.suspension.gamesRemaining - gamesPlayed) };
                if (updated.suspension.gamesRemaining === 0) delete updated.suspension;
                changed = true;
            }
        }

        return changed ? updated : p;
    });

    return { updatedPlayers, updatedDraftPicks };
};
