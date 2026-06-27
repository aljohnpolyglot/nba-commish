import { NBAPlayer as Player, DraftPick, Game, NBATeam } from '../../../types';
import { applyMajorInjuryStatChanges } from '../../../services/simulation/InjurySystem';
import { getTeamMedicalGameplayEffects } from '../../../services/staff/staffGameplayEffects';
import { getTeamTravelGameplayEffects } from '../../../services/tycoon/travelGameplayEffects';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

const dedupeSeasonStats = (stats: any[]) => {
    const grouped = new Map<string, any[]>();
    for (const row of stats) {
        const key = `${row.season}|${row.tid}|${row.playoffs ? 1 : 0}|${row.competitionId ?? ''}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(row);
    }
    return Array.from(grouped.values()).map(rows =>
        rows.reduce((best, row) => ((row?.gp ?? 0) > (best?.gp ?? 0) ? row : best), rows[0])
    );
};

const dedupeGameLines = (gameStats: any[]) => {
    const byGameId = new Map<any, any>();
    for (const stat of gameStats) {
        const gid = stat.__gameId;
        if (gid === undefined || gid === null) {
            const fallbackKey = `no-gid-${byGameId.size}`;
            if (!byGameId.has(fallbackKey)) byGameId.set(fallbackKey, stat);
            continue;
        }
        if (!byGameId.has(gid)) byGameId.set(gid, stat);
    }
    return Array.from(byGameId.values());
};

const groupByStatSplit = (gameStats: any[]) => {
    const grouped = new Map<string, { competitionId?: string; competitionPhase?: string; tid?: number; stats: any[] }>();
    for (const stat of gameStats) {
        const competitionId = stat.__competitionId ? String(stat.__competitionId) : undefined;
        const competitionPhase = stat.__competitionPhase ? String(stat.__competitionPhase) : undefined;
        const tid = Number.isFinite(Number(stat.__tid)) ? Number(stat.__tid) : undefined;
        const key = `${competitionId ?? ''}|${tid ?? ''}`;
        const entry = grouped.get(key) ?? { competitionId, competitionPhase, tid, stats: [] };
        entry.stats.push(stat);
        grouped.set(key, entry);
    }
    return Array.from(grouped.values());
};

export const processSimulationResults = (
    allSimResults: any[],
    players: Player[],
    draftPicks: DraftPick[],
    schedule?: Game[],
    seasonYear?: number,
    teams?: NBATeam[],
) => {
    const currentSeasonYear = seasonYear ?? new Date().getFullYear();
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
                updatedPlayers = updatedPlayers.map(p => {
                    if (p.internalId !== injury.playerId) return p;
                    const updated = {
                        ...p,
                        injury: {
                            type: injury.injuryType,
                            gamesRemaining: injury.gamesRemaining,
                            ...(injury.startDate ? { startDate: injury.startDate } : {}),
                            ...(injury.origin    ? { origin:    injury.origin    } : {}),
                        },
                    };
                    // Apply permanent stat changes for major injuries (e.g. ACL, Achilles).
                    // statChanges is only present on major injuries (>= 15 games).
                    if (injury.statChanges) {
                        // Deep-clone ratings so we don't mutate the original array reference
                        updated.ratings = updated.ratings ? updated.ratings.map((r: any) => ({ ...r })) : [];
                        applyMajorInjuryStatChanges(updated, (updated.stats?.[updated.stats.length - 1]?.season ?? 2025), injury.statChanges);
                    }
                    return updated;
                });
            });
        }

        // Identify game type via schedule lookup
        const schedGame = schedule?.find(g => g.gid === res.gameId);
        const competitionPhase = schedGame?.competitionPhase;
        const competitionId = String(schedGame?.competitionId ?? '').toLowerCase();
        const isCompetitionPlayIn = competitionPhase === 'play-in';
        const isCompetitionPlayoff = competitionPhase === 'qf' || competitionPhase === 'sf' || competitionPhase === 'final';
        const treatCompetitionPlayInAsPlayoffs = isCompetitionPlayIn && competitionId === 'euroleague';
        const isPlayoffGame = schedGame?.isPlayoff === true || res.isPlayoff === true || isCompetitionPlayoff || treatCompetitionPlayInAsPlayoffs;
        const isPlayInGame = !treatCompetitionPlayInAsPlayoffs && (schedGame?.isPlayIn === true || res.isPlayIn === true || isCompetitionPlayIn);
        const isPreseasonGame = schedGame?.isPreseason === true || res.isPreseason === true;
        const excludeFromRecord = (schedGame as any)?.excludeFromRecord === true || res.excludeFromRecord === true;

        // Route stats: regular → playerStatsMap, playoff → playoffStatsMap, play-in/preseason → skip
        if (!isPlayoffGame && !isPlayInGame && !isPreseasonGame && !excludeFromRecord) {
            [
                { tid: res.homeTeamId, stats: res.homeStats ?? [] },
                { tid: res.awayTeamId, stats: res.awayStats ?? [] },
            ].forEach(side => side.stats.forEach((stat: any) => {
                if (!playerStatsMap.has(stat.playerId)) {
                    playerStatsMap.set(stat.playerId, []);
                }
                playerStatsMap.get(stat.playerId).push({
                    ...stat,
                    __gameId: res.gameId,
                    __tid: side.tid,
                    __competitionId: competitionId || undefined,
                    __competitionPhase: competitionPhase || undefined,
                });
            }));
        } else if (isPlayoffGame) {
            [
                { tid: res.homeTeamId, stats: res.homeStats ?? [] },
                { tid: res.awayTeamId, stats: res.awayStats ?? [] },
            ].forEach(side => side.stats.forEach((stat: any) => {
                if (!playoffStatsMap.has(stat.playerId)) {
                    playoffStatsMap.set(stat.playerId, []);
                }
                playoffStatsMap.get(stat.playerId).push({
                    ...stat,
                    __gameId: res.gameId,
                    __tid: side.tid,
                    __competitionId: competitionId || undefined,
                    __competitionPhase: competitionPhase || undefined,
                });
            }));
        }
    });

    if (playerStatsMap.size > 0) {
        updatedPlayers = updatedPlayers.map(p => {
            const rawGameStats = playerStatsMap.get(p.internalId);
            const gameStats = rawGameStats ? dedupeGameLines(rawGameStats) : undefined;
            if (!gameStats) return p;

            const stats = dedupeSeasonStats([...(p.stats || [])]);
            const currentSeason = currentSeasonYear;
            for (const split of groupByStatSplit(gameStats)) {
                const rowTid = split.tid ?? p.tid;
                const competitionKey = split.competitionId ?? '';
                // Match tid too so traded players get separate rows per team (BBRef-style split)
                let seasonStatIndex = stats.findIndex(s =>
                    s.season === currentSeason &&
                    !s.playoffs &&
                    s.tid === rowTid &&
                    String(s.competitionId ?? '') === competitionKey
                );

                let seasonStat: any;
                if (seasonStatIndex === -1) {
                    seasonStat = {
                        season: currentSeason,
                        tid: rowTid,
                        ...(split.competitionId ? { competitionId: split.competitionId } : {}),
                        ...(split.competitionPhase ? { competitionPhase: split.competitionPhase } : {}),
                        gp: 0, gs: 0, min: 0, fg: 0, fga: 0, fgp: 0, tp: 0, tpa: 0, tpp: 0, fp: 0, fpa: 0, fpp: 0, ft: 0, fta: 0, ftp: 0,
                        orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, per: 0,
                        pm: 0, tsPct: 0, efgPct: 0, usgPct: 0, ortg: 0, drtg: 0, bpm: 0, ws: 0, vorp: 0,
                        ows: 0, dws: 0, obpm: 0, dbpm: 0, ewa: 0,
                        orbPct: 0, drbPct: 0, rebPct: 0, astPct: 0, stlPct: 0, blkPct: 0, tovPct: 0,
                        _perSum: 0, _usgPctSum: 0, _ortgSum: 0, _drtgSum: 0, _bpmSum: 0,
                        _obpmSum: 0, _dbpmSum: 0, _orbPctSum: 0, _drbPctSum: 0, _trbPctSum: 0,
                        _astPctSum: 0, _stlPctSum: 0, _blkPctSum: 0, _tovPctSum: 0,
                    };
                    stats.push(seasonStat);
                    seasonStatIndex = stats.length - 1;
                } else {
                    seasonStat = { ...stats[seasonStatIndex] };
                    if (split.competitionId && !seasonStat.competitionId) seasonStat.competitionId = split.competitionId;
                    if (split.competitionPhase && !seasonStat.competitionPhase) seasonStat.competitionPhase = split.competitionPhase;
                    if (seasonStat._perSum === undefined) seasonStat._perSum = (seasonStat.per || 0) * seasonStat.gp;
                    if (seasonStat._usgPctSum === undefined) seasonStat._usgPctSum = (seasonStat.usgPct || 0) * seasonStat.gp;
                    if (seasonStat._ortgSum === undefined) seasonStat._ortgSum = (seasonStat.ortg || 0) * seasonStat.gp;
                    if (seasonStat._drtgSum === undefined) seasonStat._drtgSum = (seasonStat.drtg || 0) * seasonStat.gp;
                    if (seasonStat._bpmSum === undefined) seasonStat._bpmSum = (seasonStat.bpm || 0) * seasonStat.gp;
                    if (seasonStat._obpmSum === undefined) seasonStat._obpmSum = (seasonStat.obpm || 0) * seasonStat.gp;
                    if (seasonStat._dbpmSum === undefined) seasonStat._dbpmSum = (seasonStat.dbpm || 0) * seasonStat.gp;
                    if (seasonStat._orbPctSum === undefined) seasonStat._orbPctSum = (seasonStat.orbPct || 0) * seasonStat.gp;
                    if (seasonStat._drbPctSum === undefined) seasonStat._drbPctSum = (seasonStat.drbPct || 0) * seasonStat.gp;
                    if (seasonStat._trbPctSum === undefined) seasonStat._trbPctSum = (seasonStat.rebPct || 0) * seasonStat.gp;
                    if (seasonStat._astPctSum === undefined) seasonStat._astPctSum = (seasonStat.astPct || 0) * seasonStat.gp;
                    if (seasonStat._stlPctSum === undefined) seasonStat._stlPctSum = (seasonStat.stlPct || 0) * seasonStat.gp;
                    if (seasonStat._blkPctSum === undefined) seasonStat._blkPctSum = (seasonStat.blkPct || 0) * seasonStat.gp;
                    if (seasonStat._tovPctSum === undefined) seasonStat._tovPctSum = (seasonStat.tovPct || 0) * seasonStat.gp;
                }

                split.stats.forEach((stat: any) => {
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
                    seasonStat.fp = (seasonStat.fp || 0) + (stat.fourPm || 0);
                    seasonStat.fpa = (seasonStat.fpa || 0) + (stat.fourPa || 0);
                    seasonStat.dunks = (seasonStat.dunks || 0) + (stat.dunks || 0);
                    seasonStat.techs = (seasonStat.techs || 0) + (stat.techs || 0);
                    seasonStat.ft += stat.ftm;
                    seasonStat.fta += stat.fta;

                    seasonStat.pm   = (seasonStat.pm   || 0) + (stat.pm   || 0);
                    seasonStat.ws   = (seasonStat.ws   || 0) + (stat.ws   || 0);
                    seasonStat.ows  = (seasonStat.ows  || 0) + (stat.ows  || 0);
                    seasonStat.dws  = (seasonStat.dws  || 0) + (stat.dws  || 0);
                    seasonStat.vorp = (seasonStat.vorp || 0) + (stat.vorp || 0);
                    seasonStat.ewa  = (seasonStat.ewa  || 0) + (stat.ewa  || 0);

                    seasonStat._perSum    += (stat.per    || 0);
                    seasonStat._usgPctSum += (stat.usgPct || 0);
                    seasonStat._ortgSum   += (stat.ortg   || 0);
                    seasonStat._drtgSum   += (stat.drtg   || 0);
                    seasonStat._bpmSum    += (stat.bpm    || 0);
                    seasonStat._obpmSum   = (seasonStat._obpmSum   || 0) + (stat.obpm   || 0);
                    seasonStat._dbpmSum   = (seasonStat._dbpmSum   || 0) + (stat.dbpm   || 0);
                    seasonStat._orbPctSum = (seasonStat._orbPctSum || 0) + (stat.orbPct || 0);
                    seasonStat._drbPctSum = (seasonStat._drbPctSum || 0) + (stat.drbPct || 0);
                    seasonStat._trbPctSum = (seasonStat._trbPctSum || 0) + (stat.trbPct || 0);
                    seasonStat._astPctSum = (seasonStat._astPctSum || 0) + (stat.astPct || 0);
                    seasonStat._stlPctSum = (seasonStat._stlPctSum || 0) + (stat.stlPct || 0);
                    seasonStat._blkPctSum = (seasonStat._blkPctSum || 0) + (stat.blkPct || 0);
                    seasonStat._tovPctSum = (seasonStat._tovPctSum || 0) + (stat.tovPct || 0);
                });

                // Update percentages and averages
                seasonStat.fgp = seasonStat.fga > 0 ? (seasonStat.fg / seasonStat.fga) * 100 : 0;
                seasonStat.tpp = seasonStat.tpa > 0 ? (seasonStat.tp / seasonStat.tpa) * 100 : 0;
                seasonStat.fpp = seasonStat.fpa > 0 ? (seasonStat.fp / seasonStat.fpa) * 100 : 0;
                seasonStat.ftp = seasonStat.fta > 0 ? (seasonStat.ft / seasonStat.fta) * 100 : 0;

                if (seasonStat.gp > 0) {
                    seasonStat.per    = seasonStat._perSum    / seasonStat.gp;
                    seasonStat.usgPct = seasonStat._usgPctSum / seasonStat.gp;
                    seasonStat.drtg   = seasonStat._drtgSum   / seasonStat.gp;
                    seasonStat.bpm    = seasonStat._bpmSum    / seasonStat.gp;
                    seasonStat.obpm   = seasonStat._obpmSum   / seasonStat.gp;
                    seasonStat.dbpm   = seasonStat._dbpmSum   / seasonStat.gp;
                    seasonStat.orbPct = seasonStat._orbPctSum / seasonStat.gp;
                    seasonStat.drbPct = seasonStat._drbPctSum / seasonStat.gp;
                    seasonStat.rebPct = seasonStat._trbPctSum / seasonStat.gp;
                    seasonStat.astPct = seasonStat._astPctSum / seasonStat.gp;
                    seasonStat.stlPct = seasonStat._stlPctSum / seasonStat.gp;
                    seasonStat.blkPct = seasonStat._blkPctSum / seasonStat.gp;
                    seasonStat.tovPct = seasonStat._tovPctSum / seasonStat.gp;

                    // Recalculate season-wide TS%, eFG%, and ORtg
                    const tsDenom = 2 * (seasonStat.fga + 0.44 * seasonStat.fta);
                    seasonStat.tsPct = tsDenom > 0 ? (seasonStat.pts / tsDenom) * 100 : 0;
                    seasonStat.efgPct = seasonStat.fga > 0 ? ((seasonStat.fg + 0.5 * seasonStat.tp + (seasonStat.fp || 0)) / seasonStat.fga) * 100 : 0;

                    const seasonPoss = seasonStat.fga + 0.44 * seasonStat.fta - seasonStat.orb + seasonStat.tov;
                    seasonStat.ortg = seasonPoss > 0 ? (seasonStat.pts * 100) / seasonPoss : 0;
                }

                stats[seasonStatIndex] = seasonStat;
            }
            return { ...p, stats };
        });
    }

    // ── Playoff stats accumulation ──────────────────────────────────────────
    if (playoffStatsMap.size > 0) {
        updatedPlayers = updatedPlayers.map(p => {
            const rawGameStats = playoffStatsMap.get(p.internalId);
            const gameStats = rawGameStats ? dedupeGameLines(rawGameStats) : undefined;
            if (!gameStats) return p;

            const stats = dedupeSeasonStats([...(p.stats || [])]);
            const currentSeason = currentSeasonYear;
            for (const split of groupByStatSplit(gameStats)) {
                const rowTid = split.tid ?? p.tid;
                const competitionKey = split.competitionId ?? '';
                // Match tid too so traded players get separate playoff rows per team
                let statIndex = stats.findIndex(s =>
                    s.season === currentSeason &&
                    s.playoffs === true &&
                    s.tid === rowTid &&
                    String(s.competitionId ?? '') === competitionKey
                );

                let seasonStat: any;
                if (statIndex === -1) {
                    seasonStat = {
                        season: currentSeason,
                        playoffs: true,
                        tid: rowTid,
                        ...(split.competitionId ? { competitionId: split.competitionId } : {}),
                        ...(split.competitionPhase ? { competitionPhase: split.competitionPhase } : {}),
                        gp: 0, gs: 0, min: 0, fg: 0, fga: 0, fgp: 0, tp: 0, tpa: 0, tpp: 0, fp: 0, fpa: 0, fpp: 0, ft: 0, fta: 0, ftp: 0,
                        orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, per: 0,
                        pm: 0, tsPct: 0, efgPct: 0, usgPct: 0, ortg: 0, drtg: 0, bpm: 0, ws: 0, vorp: 0,
                        ows: 0, dws: 0, obpm: 0, dbpm: 0, ewa: 0,
                        orbPct: 0, drbPct: 0, rebPct: 0, astPct: 0, stlPct: 0, blkPct: 0, tovPct: 0,
                        _perSum: 0, _usgPctSum: 0, _ortgSum: 0, _drtgSum: 0, _bpmSum: 0,
                        _obpmSum: 0, _dbpmSum: 0, _orbPctSum: 0, _drbPctSum: 0, _trbPctSum: 0,
                        _astPctSum: 0, _stlPctSum: 0, _blkPctSum: 0, _tovPctSum: 0,
                    };
                    stats.push(seasonStat);
                    statIndex = stats.length - 1;
                } else {
                    seasonStat = { ...stats[statIndex] };
                    if (split.competitionId && !seasonStat.competitionId) seasonStat.competitionId = split.competitionId;
                    if (split.competitionPhase && !seasonStat.competitionPhase) seasonStat.competitionPhase = split.competitionPhase;
                    if (seasonStat._perSum === undefined) seasonStat._perSum = (seasonStat.per || 0) * seasonStat.gp;
                    if (seasonStat._usgPctSum === undefined) seasonStat._usgPctSum = (seasonStat.usgPct || 0) * seasonStat.gp;
                    if (seasonStat._ortgSum === undefined) seasonStat._ortgSum = (seasonStat.ortg || 0) * seasonStat.gp;
                    if (seasonStat._drtgSum === undefined) seasonStat._drtgSum = (seasonStat.drtg || 0) * seasonStat.gp;
                    if (seasonStat._bpmSum === undefined) seasonStat._bpmSum = (seasonStat.bpm || 0) * seasonStat.gp;
                    if (seasonStat._obpmSum === undefined) seasonStat._obpmSum = (seasonStat.obpm || 0) * seasonStat.gp;
                    if (seasonStat._dbpmSum === undefined) seasonStat._dbpmSum = (seasonStat.dbpm || 0) * seasonStat.gp;
                    if (seasonStat._orbPctSum === undefined) seasonStat._orbPctSum = (seasonStat.orbPct || 0) * seasonStat.gp;
                    if (seasonStat._drbPctSum === undefined) seasonStat._drbPctSum = (seasonStat.drbPct || 0) * seasonStat.gp;
                    if (seasonStat._trbPctSum === undefined) seasonStat._trbPctSum = (seasonStat.rebPct || 0) * seasonStat.gp;
                    if (seasonStat._astPctSum === undefined) seasonStat._astPctSum = (seasonStat.astPct || 0) * seasonStat.gp;
                    if (seasonStat._stlPctSum === undefined) seasonStat._stlPctSum = (seasonStat.stlPct || 0) * seasonStat.gp;
                    if (seasonStat._blkPctSum === undefined) seasonStat._blkPctSum = (seasonStat.blkPct || 0) * seasonStat.gp;
                    if (seasonStat._tovPctSum === undefined) seasonStat._tovPctSum = (seasonStat.tovPct || 0) * seasonStat.gp;
                }

                split.stats.forEach((stat: any) => {
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
                    seasonStat.fp = (seasonStat.fp || 0) + (stat.fourPm || 0);
                    seasonStat.fpa = (seasonStat.fpa || 0) + (stat.fourPa || 0);
                    seasonStat.dunks = (seasonStat.dunks || 0) + (stat.dunks || 0);
                    seasonStat.techs = (seasonStat.techs || 0) + (stat.techs || 0);
                    seasonStat.ft += stat.ftm;
                    seasonStat.fta += stat.fta;
                    seasonStat.pm   = (seasonStat.pm   || 0) + (stat.pm   || 0);
                    seasonStat.ws   = (seasonStat.ws   || 0) + (stat.ws   || 0);
                    seasonStat.ows  = (seasonStat.ows  || 0) + (stat.ows  || 0);
                    seasonStat.dws  = (seasonStat.dws  || 0) + (stat.dws  || 0);
                    seasonStat.vorp = (seasonStat.vorp || 0) + (stat.vorp || 0);
                    seasonStat.ewa  = (seasonStat.ewa  || 0) + (stat.ewa  || 0);
                    seasonStat._perSum    += (stat.per    || 0);
                    seasonStat._usgPctSum += (stat.usgPct || 0);
                    seasonStat._ortgSum   += (stat.ortg   || 0);
                    seasonStat._drtgSum   += (stat.drtg   || 0);
                    seasonStat._bpmSum    += (stat.bpm    || 0);
                    seasonStat._obpmSum   = (seasonStat._obpmSum   || 0) + (stat.obpm   || 0);
                    seasonStat._dbpmSum   = (seasonStat._dbpmSum   || 0) + (stat.dbpm   || 0);
                    seasonStat._orbPctSum = (seasonStat._orbPctSum || 0) + (stat.orbPct || 0);
                    seasonStat._drbPctSum = (seasonStat._drbPctSum || 0) + (stat.drbPct || 0);
                    seasonStat._trbPctSum = (seasonStat._trbPctSum || 0) + (stat.trbPct || 0);
                    seasonStat._astPctSum = (seasonStat._astPctSum || 0) + (stat.astPct || 0);
                    seasonStat._stlPctSum = (seasonStat._stlPctSum || 0) + (stat.stlPct || 0);
                    seasonStat._blkPctSum = (seasonStat._blkPctSum || 0) + (stat.blkPct || 0);
                    seasonStat._tovPctSum = (seasonStat._tovPctSum || 0) + (stat.tovPct || 0);
                });

                seasonStat.fgp = seasonStat.fga > 0 ? (seasonStat.fg / seasonStat.fga) * 100 : 0;
                seasonStat.tpp = seasonStat.tpa > 0 ? (seasonStat.tp / seasonStat.tpa) * 100 : 0;
                seasonStat.fpp = seasonStat.fpa > 0 ? (seasonStat.fp / seasonStat.fpa) * 100 : 0;
                seasonStat.ftp = seasonStat.fta > 0 ? (seasonStat.ft / seasonStat.fta) * 100 : 0;

                if (seasonStat.gp > 0) {
                    seasonStat.per    = seasonStat._perSum    / seasonStat.gp;
                    seasonStat.usgPct = seasonStat._usgPctSum / seasonStat.gp;
                    seasonStat.drtg   = seasonStat._drtgSum   / seasonStat.gp;
                    seasonStat.bpm    = seasonStat._bpmSum    / seasonStat.gp;
                    seasonStat.obpm   = seasonStat._obpmSum   / seasonStat.gp;
                    seasonStat.dbpm   = seasonStat._dbpmSum   / seasonStat.gp;
                    seasonStat.orbPct = seasonStat._orbPctSum / seasonStat.gp;
                    seasonStat.drbPct = seasonStat._drbPctSum / seasonStat.gp;
                    seasonStat.rebPct = seasonStat._trbPctSum / seasonStat.gp;
                    seasonStat.astPct = seasonStat._astPctSum / seasonStat.gp;
                    seasonStat.stlPct = seasonStat._stlPctSum / seasonStat.gp;
                    seasonStat.blkPct = seasonStat._blkPctSum / seasonStat.gp;
                    seasonStat.tovPct = seasonStat._tovPctSum / seasonStat.gp;
                    const tsDenom = 2 * (seasonStat.fga + 0.44 * seasonStat.fta);
                    seasonStat.tsPct = tsDenom > 0 ? (seasonStat.pts / tsDenom) * 100 : 0;
                    seasonStat.efgPct = seasonStat.fga > 0 ? ((seasonStat.fg + 0.5 * seasonStat.tp + (seasonStat.fp || 0)) / seasonStat.fga) * 100 : 0;
                    const seasonPoss = seasonStat.fga + 0.44 * seasonStat.fta - seasonStat.orb + seasonStat.tov;
                    seasonStat.ortg = seasonPoss > 0 ? (seasonStat.pts * 100) / seasonPoss : 0;
                }

                stats[statIndex] = seasonStat;
            }
            return { ...p, stats };
        });
    }

    // Decrement injury and suspension games remaining for players whose teams played today
    const teamGamesPlayed = new Map<number, number>();
    const awayFatigueUnits = new Map<number, number>();
    const awayMinutesPlayed = new Map<string, number>();
    allSimResults.forEach(res => {
        if (res.homeTeamId < 0 || res.awayTeamId < 0) return;
        const schedGame = schedule?.find(g => g.gid === res.gameId);
        const isPreseasonGame = schedGame?.isPreseason === true || res.isPreseason === true;
        const isExhibitionGame = schedGame?.isExhibition === true || res.isExhibition === true;
        const awayFatigueWeight = isExhibitionGame ? 0.1 : isPreseasonGame ? 0.2 : 1;
        teamGamesPlayed.set(res.homeTeamId, (teamGamesPlayed.get(res.homeTeamId) || 0) + 1);
        teamGamesPlayed.set(res.awayTeamId, (teamGamesPlayed.get(res.awayTeamId) || 0) + 1);
        awayFatigueUnits.set(res.awayTeamId, (awayFatigueUnits.get(res.awayTeamId) || 0) + awayFatigueWeight);
        for (const stat of res.awayStats ?? []) {
            awayMinutesPlayed.set(
                stat.playerId,
                (awayMinutesPlayed.get(stat.playerId) || 0) + Number(stat.min ?? 0) * awayFatigueWeight,
            );
        }
    });

    const recoveries: { playerName: string; teamName: string; pos: string; tid: number }[] = [];
    const teamById = new Map<number, NBATeam>();
    for (const team of teams ?? []) teamById.set(team.id, team);

    const resolveRecoveryStep = (player: Player, gamesPlayed: number): number => {
        const team = teamById.get(player.tid);
        const recoveryMultiplier = team
            ? getTeamMedicalGameplayEffects(team as any).recoveryMultiplier
            : 1;
        const scaled = gamesPlayed * recoveryMultiplier;
        const whole = Math.floor(scaled);
        const remainder = scaled - whole;
        return whole + (Math.random() < remainder ? 1 : 0);
    };

    updatedPlayers = updatedPlayers.map(p => {
        let updated = { ...p };
        let changed = false;
        const gamesPlayed = teamGamesPlayed.get(p.tid) || 0;

        if (gamesPlayed > 0) {
            if (p.injury && p.injury.gamesRemaining > 0) {
                const recoveryStep = resolveRecoveryStep(p, gamesPlayed);
                updated.injury = { ...p.injury, gamesRemaining: Math.max(0, p.injury.gamesRemaining - recoveryStep) };
                if (updated.injury.gamesRemaining === 0) {
                    delete updated.injury;
                    recoveries.push({ playerName: p.name, teamName: '', pos: (p as any).pos ?? '', tid: p.tid });
                }
                changed = true;
            }

            if (p.suspension && p.suspension.gamesRemaining > 0) {
                updated.suspension = { ...p.suspension, gamesRemaining: Math.max(0, p.suspension.gamesRemaining - gamesPlayed) };
                if (updated.suspension.gamesRemaining === 0) delete updated.suspension;
                changed = true;
            }

            const awayUnits = awayFatigueUnits.get(p.tid) || 0;
            if (awayUnits > 0 && (p.injury?.gamesRemaining ?? 0) <= 0) {
                const team = teamById.get(p.tid);
                const travel = getTeamTravelGameplayEffects(team as any);
                const totalAwayMinutes = awayMinutesPlayed.get(p.internalId) || 0;
                if (totalAwayMinutes <= 0) return changed ? updated : p;
                const averageAwayMinutes = totalAwayMinutes / awayUnits;
                const fatigueLoad = 0.45 + Math.min(1.15, averageAwayMinutes / 28);
                const fatigueGain = fatigueLoad * awayUnits * travel.roadTripFatigueDelta;
                const currentFatigue = Number((p as any).trainingFatigue ?? 0);
                const nextFatigue = clamp(currentFatigue + fatigueGain, 0, 100);
                if (Math.abs(nextFatigue - currentFatigue) > 0.01) {
                    (updated as any).trainingFatigue = nextFatigue;
                    changed = true;
                }
            }
        }

        return changed ? updated : p;
    });

    return { updatedPlayers, updatedDraftPicks, recoveries };
};
