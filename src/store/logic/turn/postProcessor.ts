import { NBAPlayer as Player, DraftPick, Game, LeagueStats, NBATeam } from '../../../types';
import { applyMajorInjuryStatChanges } from '../../../services/simulation/InjurySystem';
import { getTeamMedicalGameplayEffects } from '../../../services/staff/staffGameplayEffects';
import { getTeamTravelGameplayEffects } from '../../../services/tycoon/travelGameplayEffects';
import { getSponsorEffectMultiplier } from '../../../services/tycoon/sponsorPerkEngine';
import {
    ADVANCED_STAT_FORMULA_VERSION,
    calculateIndividualOrtg,
    getCalibratedEwa,
    getCalibratedPer,
} from '../../../utils/advancedStatCalibration';
import {
    areWnbaDevelopmentalContractsEnabled,
    getWnbaDevelopmentalGameLimit,
    isWnbaDevelopmentalContract,
} from '../../../services/wnba/developmentalContracts';

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

const prepareAdvancedAccumulator = (stat: any) => {
    const needsMigration = Number(stat._advancedStatVersion ?? 0) < ADVANCED_STAT_FORMULA_VERSION;
    if (needsMigration) {
        const migratedPer = getCalibratedPer(stat);
        const migratedEwa = getCalibratedEwa(stat);
        stat.per = migratedPer;
        stat.ewa = migratedEwa;
        stat._perSum = stat.per * Number(stat.gp ?? 0);
        stat._perMinuteSum = stat.per * Number(stat.min ?? 0);
        const minutes = Number(stat.min ?? 0);
        for (const [sumKey, valueKey] of [
            ['_usgPctSum', 'usgPct'], ['_ortgSum', 'ortg'], ['_drtgSum', 'drtg'],
            ['_bpmSum', 'bpm'], ['_obpmSum', 'obpm'], ['_dbpmSum', 'dbpm'],
            ['_orbPctSum', 'orbPct'], ['_drbPctSum', 'drbPct'], ['_trbPctSum', 'rebPct'],
            ['_astPctSum', 'astPct'], ['_stlPctSum', 'stlPct'], ['_blkPctSum', 'blkPct'],
            ['_tovPctSum', 'tovPct'],
        ] as const) stat[sumKey] = Number(stat[valueKey] ?? 0) * minutes;
    }
    if (stat._perSum === undefined) stat._perSum = Number(stat.per ?? 0) * Number(stat.gp ?? 0);
    if (stat._perMinuteSum === undefined) stat._perMinuteSum = Number(stat.per ?? 0) * Number(stat.min ?? 0);
    stat._advancedStatVersion = ADVANCED_STAT_FORMULA_VERSION;
};

const calibratedGamePer = (stat: any) => {
    return getCalibratedPer(stat);
};

export const processSimulationResults = (
    allSimResults: any[],
    players: Player[],
    draftPicks: DraftPick[],
    schedule?: Game[],
    seasonYear?: number,
    teams?: NBATeam[],
    leagueStats?: Partial<LeagueStats>,
) => {
    const currentSeasonYear = seasonYear ?? new Date().getFullYear();
    let updatedPlayers = [...players];
    let updatedDraftPicks = [...draftPicks];

    const playerStatsMap = new Map<string, any>();
    const playoffStatsMap = new Map<string, any>();
    const developmentalAppearances = new Map<string, Set<number>>();
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

        if (
            areWnbaDevelopmentalContractsEnabled(leagueStats)
            && !isPreseasonGame
            && !excludeFromRecord
        ) {
            [...(res.homeStats ?? []), ...(res.awayStats ?? [])].forEach((stat: any) => {
                if (Number(stat.min ?? 0) <= 0) return;
                const player = updatedPlayers.find(candidate => candidate.internalId === stat.playerId);
                if (!isWnbaDevelopmentalContract(player, leagueStats)) return;
                const gameIds = developmentalAppearances.get(stat.playerId) ?? new Set<number>();
                gameIds.add(Number(res.gameId));
                developmentalAppearances.set(stat.playerId, gameIds);
            });
        }

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
                    gameWinners: (stat.gameWinners ?? 0) + (res.gameWinner?.playerId === stat.playerId ? 1 : 0),
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
                    gameWinners: (stat.gameWinners ?? 0) + (res.gameWinner?.playerId === stat.playerId ? 1 : 0),
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
                        orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, q4Pts: 0, q4Reb: 0, q4Ast: 0, gameWinners: 0, per: 0,
                        pm: 0, tsPct: 0, efgPct: 0, usgPct: 0, ortg: 0, drtg: 0, bpm: 0, ws: 0, vorp: 0,
                        ows: 0, dws: 0, obpm: 0, dbpm: 0, ewa: 0,
                        orbPct: 0, drbPct: 0, rebPct: 0, astPct: 0, stlPct: 0, blkPct: 0, tovPct: 0,
                        _advancedStatVersion: ADVANCED_STAT_FORMULA_VERSION,
                        _perSum: 0, _perMinuteSum: 0, _usgPctSum: 0, _ortgSum: 0, _drtgSum: 0, _bpmSum: 0,
                        _obpmSum: 0, _dbpmSum: 0, _orbPctSum: 0, _drbPctSum: 0, _trbPctSum: 0,
                        _astPctSum: 0, _stlPctSum: 0, _blkPctSum: 0, _tovPctSum: 0,
                    };
                    stats.push(seasonStat);
                    seasonStatIndex = stats.length - 1;
                } else {
                    seasonStat = { ...stats[seasonStatIndex] };
                    if (split.competitionId && !seasonStat.competitionId) seasonStat.competitionId = split.competitionId;
                    if (split.competitionPhase && !seasonStat.competitionPhase) seasonStat.competitionPhase = split.competitionPhase;
                    prepareAdvancedAccumulator(seasonStat);
                    const minutes = Number(seasonStat.min ?? 0);
                    if (seasonStat._usgPctSum === undefined) seasonStat._usgPctSum = (seasonStat.usgPct || 0) * minutes;
                    if (seasonStat._ortgSum === undefined) seasonStat._ortgSum = (seasonStat.ortg || 0) * minutes;
                    if (seasonStat._drtgSum === undefined) seasonStat._drtgSum = (seasonStat.drtg || 0) * minutes;
                    if (seasonStat._bpmSum === undefined) seasonStat._bpmSum = (seasonStat.bpm || 0) * minutes;
                    if (seasonStat._obpmSum === undefined) seasonStat._obpmSum = (seasonStat.obpm || 0) * minutes;
                    if (seasonStat._dbpmSum === undefined) seasonStat._dbpmSum = (seasonStat.dbpm || 0) * minutes;
                    if (seasonStat._orbPctSum === undefined) seasonStat._orbPctSum = (seasonStat.orbPct || 0) * minutes;
                    if (seasonStat._drbPctSum === undefined) seasonStat._drbPctSum = (seasonStat.drbPct || 0) * minutes;
                    if (seasonStat._trbPctSum === undefined) seasonStat._trbPctSum = (seasonStat.rebPct || 0) * minutes;
                    if (seasonStat._astPctSum === undefined) seasonStat._astPctSum = (seasonStat.astPct || 0) * minutes;
                    if (seasonStat._stlPctSum === undefined) seasonStat._stlPctSum = (seasonStat.stlPct || 0) * minutes;
                    if (seasonStat._blkPctSum === undefined) seasonStat._blkPctSum = (seasonStat.blkPct || 0) * minutes;
                    if (seasonStat._tovPctSum === undefined) seasonStat._tovPctSum = (seasonStat.tovPct || 0) * minutes;
                }

                split.stats.forEach((stat: any) => {
                    seasonStat.gp += 1;
                    seasonStat.gs += (stat.gs || 0);
                    seasonStat.min += stat.min;
                    seasonStat.pts += stat.pts;
                    seasonStat.q4Pts = (seasonStat.q4Pts || 0) + (stat.q4Pts || 0);
                    seasonStat.q4Reb = (seasonStat.q4Reb || 0) + (stat.q4Reb || 0);
                    seasonStat.q4Ast = (seasonStat.q4Ast || 0) + (stat.q4Ast || 0);
                    seasonStat.gameWinners = (seasonStat.gameWinners || 0) + (stat.gameWinners || 0);
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
                    seasonStat.deflections = (seasonStat.deflections || 0) + (stat.deflections || 0);
                    seasonStat.chargesDrawn = (seasonStat.chargesDrawn || 0) + (stat.chargesDrawn || 0);
                    seasonStat.ft += stat.ftm;
                    seasonStat.fta += stat.fta;

                    seasonStat.pm   = (seasonStat.pm   || 0) + (stat.pm   || 0);
                    seasonStat.ws   = (seasonStat.ws   || 0) + (stat.ws   || 0);
                    seasonStat.ows  = (seasonStat.ows  || 0) + (stat.ows  || 0);
                    seasonStat.dws  = (seasonStat.dws  || 0) + (stat.dws  || 0);
                    seasonStat.vorp = (seasonStat.vorp || 0) + (stat.vorp || 0);
                    seasonStat.ewa  = (seasonStat.ewa  || 0) + (stat.ewa  || 0);

                    const gamePer = calibratedGamePer(stat);
                    seasonStat._perSum += gamePer;
                    seasonStat._perMinuteSum += gamePer * Number(stat.min ?? 0);
                    const advancedMinutes = Number(stat.min ?? 0);
                    seasonStat._usgPctSum += (stat.usgPct || 0) * advancedMinutes;
                    seasonStat._ortgSum   += (stat.ortg   || 0) * advancedMinutes;
                    seasonStat._drtgSum   += (stat.drtg   || 0) * advancedMinutes;
                    seasonStat._bpmSum    += (stat.bpm    || 0) * advancedMinutes;
                    seasonStat._obpmSum   = (seasonStat._obpmSum   || 0) + (stat.obpm   || 0) * advancedMinutes;
                    seasonStat._dbpmSum   = (seasonStat._dbpmSum   || 0) + (stat.dbpm   || 0) * advancedMinutes;
                    seasonStat._orbPctSum = (seasonStat._orbPctSum || 0) + (stat.orbPct || 0) * advancedMinutes;
                    seasonStat._drbPctSum = (seasonStat._drbPctSum || 0) + (stat.drbPct || 0) * advancedMinutes;
                    seasonStat._trbPctSum = (seasonStat._trbPctSum || 0) + (stat.trbPct || 0) * advancedMinutes;
                    seasonStat._astPctSum = (seasonStat._astPctSum || 0) + (stat.astPct || 0) * advancedMinutes;
                    seasonStat._stlPctSum = (seasonStat._stlPctSum || 0) + (stat.stlPct || 0) * advancedMinutes;
                    seasonStat._blkPctSum = (seasonStat._blkPctSum || 0) + (stat.blkPct || 0) * advancedMinutes;
                    seasonStat._tovPctSum = (seasonStat._tovPctSum || 0) + (stat.tovPct || 0) * advancedMinutes;
                });

                // Update percentages and averages
                seasonStat.fgp = seasonStat.fga > 0 ? (seasonStat.fg / seasonStat.fga) * 100 : 0;
                seasonStat.tpp = seasonStat.tpa > 0 ? (seasonStat.tp / seasonStat.tpa) * 100 : 0;
                seasonStat.fpp = seasonStat.fpa > 0 ? (seasonStat.fp / seasonStat.fpa) * 100 : 0;
                seasonStat.ftp = seasonStat.fta > 0 ? (seasonStat.ft / seasonStat.fta) * 100 : 0;

                if (seasonStat.gp > 0) {
                    seasonStat.per = seasonStat.min > 0
                        ? seasonStat._perMinuteSum / seasonStat.min
                        : seasonStat._perSum / seasonStat.gp;
                    const advancedMinutes = seasonStat.min || 1;
                    seasonStat.usgPct = seasonStat._usgPctSum / advancedMinutes;
                    seasonStat.drtg   = seasonStat._drtgSum   / advancedMinutes;
                    seasonStat.bpm    = seasonStat._bpmSum    / advancedMinutes;
                    seasonStat.obpm   = seasonStat._obpmSum   / advancedMinutes;
                    seasonStat.dbpm   = seasonStat._dbpmSum   / advancedMinutes;
                    seasonStat.orbPct = seasonStat._orbPctSum / advancedMinutes;
                    seasonStat.drbPct = seasonStat._drbPctSum / advancedMinutes;
                    seasonStat.rebPct = seasonStat._trbPctSum / advancedMinutes;
                    seasonStat.astPct = seasonStat._astPctSum / advancedMinutes;
                    seasonStat.stlPct = seasonStat._stlPctSum / advancedMinutes;
                    seasonStat.blkPct = seasonStat._blkPctSum / advancedMinutes;
                    seasonStat.tovPct = seasonStat._tovPctSum / advancedMinutes;

                    // Recalculate season-wide TS%, eFG%, and ORtg
                    const tsDenom = 2 * (seasonStat.fga + 0.44 * seasonStat.fta);
                    seasonStat.tsPct = tsDenom > 0 ? (seasonStat.pts / tsDenom) * 100 : 0;
                    seasonStat.efgPct = seasonStat.fga > 0 ? ((seasonStat.fg + 0.5 * seasonStat.tp + (seasonStat.fp || 0)) / seasonStat.fga) * 100 : 0;

                    seasonStat.ortg = calculateIndividualOrtg(seasonStat);
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
                        orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, q4Pts: 0, q4Reb: 0, q4Ast: 0, gameWinners: 0, per: 0,
                        pm: 0, tsPct: 0, efgPct: 0, usgPct: 0, ortg: 0, drtg: 0, bpm: 0, ws: 0, vorp: 0,
                        ows: 0, dws: 0, obpm: 0, dbpm: 0, ewa: 0,
                        orbPct: 0, drbPct: 0, rebPct: 0, astPct: 0, stlPct: 0, blkPct: 0, tovPct: 0,
                        _advancedStatVersion: ADVANCED_STAT_FORMULA_VERSION,
                        _perSum: 0, _perMinuteSum: 0, _usgPctSum: 0, _ortgSum: 0, _drtgSum: 0, _bpmSum: 0,
                        _obpmSum: 0, _dbpmSum: 0, _orbPctSum: 0, _drbPctSum: 0, _trbPctSum: 0,
                        _astPctSum: 0, _stlPctSum: 0, _blkPctSum: 0, _tovPctSum: 0,
                    };
                    stats.push(seasonStat);
                    statIndex = stats.length - 1;
                } else {
                    seasonStat = { ...stats[statIndex] };
                    if (split.competitionId && !seasonStat.competitionId) seasonStat.competitionId = split.competitionId;
                    if (split.competitionPhase && !seasonStat.competitionPhase) seasonStat.competitionPhase = split.competitionPhase;
                    prepareAdvancedAccumulator(seasonStat);
                    const minutes = Number(seasonStat.min ?? 0);
                    if (seasonStat._usgPctSum === undefined) seasonStat._usgPctSum = (seasonStat.usgPct || 0) * minutes;
                    if (seasonStat._ortgSum === undefined) seasonStat._ortgSum = (seasonStat.ortg || 0) * minutes;
                    if (seasonStat._drtgSum === undefined) seasonStat._drtgSum = (seasonStat.drtg || 0) * minutes;
                    if (seasonStat._bpmSum === undefined) seasonStat._bpmSum = (seasonStat.bpm || 0) * minutes;
                    if (seasonStat._obpmSum === undefined) seasonStat._obpmSum = (seasonStat.obpm || 0) * minutes;
                    if (seasonStat._dbpmSum === undefined) seasonStat._dbpmSum = (seasonStat.dbpm || 0) * minutes;
                    if (seasonStat._orbPctSum === undefined) seasonStat._orbPctSum = (seasonStat.orbPct || 0) * minutes;
                    if (seasonStat._drbPctSum === undefined) seasonStat._drbPctSum = (seasonStat.drbPct || 0) * minutes;
                    if (seasonStat._trbPctSum === undefined) seasonStat._trbPctSum = (seasonStat.rebPct || 0) * minutes;
                    if (seasonStat._astPctSum === undefined) seasonStat._astPctSum = (seasonStat.astPct || 0) * minutes;
                    if (seasonStat._stlPctSum === undefined) seasonStat._stlPctSum = (seasonStat.stlPct || 0) * minutes;
                    if (seasonStat._blkPctSum === undefined) seasonStat._blkPctSum = (seasonStat.blkPct || 0) * minutes;
                    if (seasonStat._tovPctSum === undefined) seasonStat._tovPctSum = (seasonStat.tovPct || 0) * minutes;
                }

                split.stats.forEach((stat: any) => {
                    seasonStat.gp += 1;
                    seasonStat.gs += (stat.gs || 0);
                    seasonStat.min += stat.min;
                    seasonStat.pts += stat.pts;
                    seasonStat.q4Pts = (seasonStat.q4Pts || 0) + (stat.q4Pts || 0);
                    seasonStat.q4Reb = (seasonStat.q4Reb || 0) + (stat.q4Reb || 0);
                    seasonStat.q4Ast = (seasonStat.q4Ast || 0) + (stat.q4Ast || 0);
                    seasonStat.gameWinners = (seasonStat.gameWinners || 0) + (stat.gameWinners || 0);
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
                    seasonStat.deflections = (seasonStat.deflections || 0) + (stat.deflections || 0);
                    seasonStat.chargesDrawn = (seasonStat.chargesDrawn || 0) + (stat.chargesDrawn || 0);
                    seasonStat.ft += stat.ftm;
                    seasonStat.fta += stat.fta;
                    seasonStat.pm   = (seasonStat.pm   || 0) + (stat.pm   || 0);
                    seasonStat.ws   = (seasonStat.ws   || 0) + (stat.ws   || 0);
                    seasonStat.ows  = (seasonStat.ows  || 0) + (stat.ows  || 0);
                    seasonStat.dws  = (seasonStat.dws  || 0) + (stat.dws  || 0);
                    seasonStat.vorp = (seasonStat.vorp || 0) + (stat.vorp || 0);
                    seasonStat.ewa  = (seasonStat.ewa  || 0) + (stat.ewa  || 0);
                    const gamePer = calibratedGamePer(stat);
                    seasonStat._perSum += gamePer;
                    seasonStat._perMinuteSum += gamePer * Number(stat.min ?? 0);
                    const advancedMinutes = Number(stat.min ?? 0);
                    seasonStat._usgPctSum += (stat.usgPct || 0) * advancedMinutes;
                    seasonStat._ortgSum   += (stat.ortg   || 0) * advancedMinutes;
                    seasonStat._drtgSum   += (stat.drtg   || 0) * advancedMinutes;
                    seasonStat._bpmSum    += (stat.bpm    || 0) * advancedMinutes;
                    seasonStat._obpmSum   = (seasonStat._obpmSum   || 0) + (stat.obpm   || 0) * advancedMinutes;
                    seasonStat._dbpmSum   = (seasonStat._dbpmSum   || 0) + (stat.dbpm   || 0) * advancedMinutes;
                    seasonStat._orbPctSum = (seasonStat._orbPctSum || 0) + (stat.orbPct || 0) * advancedMinutes;
                    seasonStat._drbPctSum = (seasonStat._drbPctSum || 0) + (stat.drbPct || 0) * advancedMinutes;
                    seasonStat._trbPctSum = (seasonStat._trbPctSum || 0) + (stat.trbPct || 0) * advancedMinutes;
                    seasonStat._astPctSum = (seasonStat._astPctSum || 0) + (stat.astPct || 0) * advancedMinutes;
                    seasonStat._stlPctSum = (seasonStat._stlPctSum || 0) + (stat.stlPct || 0) * advancedMinutes;
                    seasonStat._blkPctSum = (seasonStat._blkPctSum || 0) + (stat.blkPct || 0) * advancedMinutes;
                    seasonStat._tovPctSum = (seasonStat._tovPctSum || 0) + (stat.tovPct || 0) * advancedMinutes;
                });

                seasonStat.fgp = seasonStat.fga > 0 ? (seasonStat.fg / seasonStat.fga) * 100 : 0;
                seasonStat.tpp = seasonStat.tpa > 0 ? (seasonStat.tp / seasonStat.tpa) * 100 : 0;
                seasonStat.fpp = seasonStat.fpa > 0 ? (seasonStat.fp / seasonStat.fpa) * 100 : 0;
                seasonStat.ftp = seasonStat.fta > 0 ? (seasonStat.ft / seasonStat.fta) * 100 : 0;

                if (seasonStat.gp > 0) {
                    seasonStat.per = seasonStat.min > 0
                        ? seasonStat._perMinuteSum / seasonStat.min
                        : seasonStat._perSum / seasonStat.gp;
                    const advancedMinutes = seasonStat.min || 1;
                    seasonStat.usgPct = seasonStat._usgPctSum / advancedMinutes;
                    seasonStat.drtg   = seasonStat._drtgSum   / advancedMinutes;
                    seasonStat.bpm    = seasonStat._bpmSum    / advancedMinutes;
                    seasonStat.obpm   = seasonStat._obpmSum   / advancedMinutes;
                    seasonStat.dbpm   = seasonStat._dbpmSum   / advancedMinutes;
                    seasonStat.orbPct = seasonStat._orbPctSum / advancedMinutes;
                    seasonStat.drbPct = seasonStat._drbPctSum / advancedMinutes;
                    seasonStat.rebPct = seasonStat._trbPctSum / advancedMinutes;
                    seasonStat.astPct = seasonStat._astPctSum / advancedMinutes;
                    seasonStat.stlPct = seasonStat._stlPctSum / advancedMinutes;
                    seasonStat.blkPct = seasonStat._blkPctSum / advancedMinutes;
                    seasonStat.tovPct = seasonStat._tovPctSum / advancedMinutes;
                    const tsDenom = 2 * (seasonStat.fga + 0.44 * seasonStat.fta);
                    seasonStat.tsPct = tsDenom > 0 ? (seasonStat.pts / tsDenom) * 100 : 0;
                    seasonStat.efgPct = seasonStat.fga > 0 ? ((seasonStat.fg + 0.5 * seasonStat.tp + (seasonStat.fp || 0)) / seasonStat.fga) * 100 : 0;
                    seasonStat.ortg = calculateIndividualOrtg(seasonStat);
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

    if (developmentalAppearances.size > 0) {
        const gameLimit = getWnbaDevelopmentalGameLimit(leagueStats);
        updatedPlayers = updatedPlayers.map(player => {
            const appearances = developmentalAppearances.get(player.internalId)?.size ?? 0;
            if (appearances <= 0) return player;
            return {
                ...player,
                developmentalGamesPlayed: Math.min(
                    gameLimit,
                    Math.max(0, Number(player.developmentalGamesPlayed ?? 0)) + appearances,
                ),
            };
        });
    }

    const recoveries: { playerName: string; teamName: string; pos: string; tid: number }[] = [];
    const teamById = new Map<number, NBATeam>();
    for (const team of teams ?? []) teamById.set(team.id, team);

    const resolveRecoveryStep = (player: Player, gamesPlayed: number): number => {
        const team = teamById.get(player.tid);
        const recoveryMultiplier = team
            ? getTeamMedicalGameplayEffects(team as any).recoveryMultiplier
                * getSponsorEffectMultiplier((team as any).tycoon, currentSeasonYear, 'injuryRecoverySpeed')
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

    const automaticSuspensions = new Map<string, { games: number; reason: string }>();
    for (const result of allSimResults) {
        for (const ejection of result.ejections ?? []) {
            const games = Math.max(0, Math.round(Number(ejection.suspensionGames ?? 0)));
            if (games <= 0) continue;
            const reason = ejection.reason === 'red_card'
                ? 'Red Card'
                : ejection.reason === 'fighting'
                    ? 'Fighting Ejection'
                    : ejection.reason === 'flagrant_2'
                        ? 'Flagrant 2 Ejection'
                        : ejection.reason === 'flagrant_1'
                            ? 'Flagrant 1 Ejection'
                            : 'Technical Foul Ejection';
            const current = automaticSuspensions.get(ejection.playerId);
            if (!current || games > current.games) {
                automaticSuspensions.set(ejection.playerId, { games, reason });
            }
        }
    }
    if (automaticSuspensions.size > 0) {
        updatedPlayers = updatedPlayers.map(player => {
            const automatic = automaticSuspensions.get(player.internalId);
            if (!automatic) return player;
            const currentGames = player.suspension?.gamesRemaining ?? 0;
            if (currentGames >= automatic.games) return player;
            return {
                ...player,
                suspension: {
                    reason: automatic.reason,
                    gamesRemaining: automatic.games,
                },
            };
        });
    }

    return { updatedPlayers, updatedDraftPicks, recoveries };
};
