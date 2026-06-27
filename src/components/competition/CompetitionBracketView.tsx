import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, ChevronLeft, ChevronRight, FastForward, Play, SkipForward } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import { resolveCompetitionSeason } from '../../services/competition/competitionResolver';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { dateForCompetitionSeason, matchesBoxScoreSeason } from '../../services/competition/competitionSeasonState';
import { competitionSeasonForBox } from '../../services/pba/competitionGames';
import { BracketColumn } from '../playoffs/bracket/BracketColumn';
import { SeriesCard } from '../playoffs/bracket/SeriesCard';
import { SeriesDetailPanel } from '../playoffs/detail/SeriesDetailPanel';
import type { PlayoffSeries, PlayoffBracket, NBATeam, Game, GameResult } from '../../types';
import type { CompetitionKnockoutMatch } from '../../services/competition/competitionResolver';
import type { CompetitionSpec } from '../../services/competition/types';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';

interface Props {
  specId: string;
}

const ROUND_NUMBER: Record<CompetitionKnockoutMatch['round'], 1 | 2 | 3 | 4> = {
  'play-in': 1,
  'quarterfinal': 2,
  'semifinal': 3,
  'final': 4,
};

const PHASE_FOR_ROUND: Record<CompetitionKnockoutMatch['round'], 'play-in' | 'qf' | 'sf' | 'final'> = {
  'play-in': 'play-in',
  'quarterfinal': 'qf',
  'semifinal': 'sf',
  'final': 'final',
};

const matchesCompetitionSeason = (game: GameResult, spec: CompetitionSpec, season: number): boolean => {
  if (spec.id.startsWith('pba-')) {
    return competitionSeasonForBox(spec as any, game) === season;
  }
  return matchesBoxScoreSeason(game, season);
};

const maxDateString = (dates: Array<string | null | undefined>): string | null =>
  dates
    .filter((date): date is string => !!date)
    .map(normalizeDate)
    .sort()
    .at(-1) ?? null;

const countWins = (
  match: CompetitionKnockoutMatch,
  spec: CompetitionSpec,
  competitionId: string,
  phase: 'play-in' | 'qf' | 'sf' | 'final',
  boxScores: GameResult[],
  season: number,
  seriesGames: Game[],
): { high: number; low: number; complete: boolean; winnerTid?: number } => {
  let high = 0;
  let low = 0;
  const maxGames = match.maxGames ?? match.bestOf;
  const addWinner = (winner: number) => {
    if (winner === match.highSeedTid) high++;
    else if (winner === match.lowSeedTid) low++;
  };
  const currentWinner = () => {
    const highNeeded = match.higherSeedWinsNeeded ?? Math.ceil(match.bestOf / 2);
    const lowNeeded = match.lowerSeedWinsNeeded ?? Math.ceil(match.bestOf / 2);
    return low >= lowNeeded
      ? match.lowSeedTid
      : high >= highNeeded
        ? match.highSeedTid
        : undefined;
  };

  let countedGames = 0;
  for (const scheduledGame of seriesGames) {
    const game = findBoxScoreForGame(boxScores, scheduledGame.gid, scheduledGame.date, {
      homeTid: scheduledGame.homeTid,
      awayTid: scheduledGame.awayTid,
    });
    if (!game) continue;
    if (game.competitionId !== competitionId || game.competitionPhase !== phase) continue;
    if (!matchesCompetitionSeason(game, spec, season)) continue;
    const winner = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
    addWinner(winner);
    countedGames++;
    if (countedGames >= maxGames || currentWinner() != null) break;
  }

  if (countedGames === 0) {
    const fallbackGames = boxScores
      .filter(game =>
        game.competitionId === competitionId &&
        game.competitionPhase === phase &&
        matchesCompetitionSeason(game, spec, season) &&
        ((game.homeTeamId === match.highSeedTid && game.awayTeamId === match.lowSeedTid) ||
          (game.homeTeamId === match.lowSeedTid && game.awayTeamId === match.highSeedTid)),
      )
      .sort((a: any, b: any) =>
        normalizeDate(a.date ?? '').localeCompare(normalizeDate(b.date ?? '')) ||
        Number(a.gameId ?? a.gid ?? 0) - Number(b.gameId ?? b.gid ?? 0),
      );
    for (const game of fallbackGames.slice(0, maxGames)) {
      const winner = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
      addWinner(winner);
      if (currentWinner() != null) break;
    }
  }

  const winnerTid = currentWinner();
  const complete = winnerTid != null;
  return { high, low, complete, winnerTid };
};

export const CompetitionBracketView: React.FC<Props> = ({ specId }) => {
  const { state, dispatchAction } = useGame();
  const spec = state.activeCompetitions?.find(c => c.id === specId);
  const rawSeason = state.leagueStats?.year ?? new Date().getFullYear();
  const preparedPbaSeason = Number((state.leagueStats as any)?.pbaYearEndRolloverPreparedSeason);
  const season = spec?.id?.startsWith('pba-') &&
    state.leagueStats?.uiMode === 'pba_isolated' &&
    (state.leagueStats as any)?.pbaConferencePhase === 'offseason' &&
    Number.isFinite(preparedPbaSeason)
    ? preparedPbaSeason
    : rawSeason;

  const seedTids = useMemo(() => (spec ? selectCompetitionTeamTids(spec, state) : []), [spec, state]);

  const resolution = useMemo(() => {
    if (!spec) return null;
    return resolveCompetitionSeason(spec, state.boxScores as GameResult[], season, seedTids);
  }, [spec, state.boxScores, season, seedTids]);

  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedGameIdx, setSelectedGameIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = normalizeDate(state.date);

  if (!spec) {
    return (
      <div className="p-8 text-slate-500 text-sm">
        Competition not active in this save.
      </div>
    );
  }

  if (!resolution) {
    return (
      <div className="p-8 text-slate-500 text-sm">
        Bracket will appear once enough games have been played.
      </div>
    );
  }

  const buildSeries = (m: CompetitionKnockoutMatch, idx: number): PlayoffSeries => {
    const phase = PHASE_FOR_ROUND[m.round];
    const high = resolution!.standings.find(s => s.tid === m.highSeedTid);
    const low = resolution!.standings.find(s => s.tid === m.lowSeedTid);
    const seriesGames = (state.schedule as Game[])
      .filter(game =>
        game.competitionId === spec.id &&
        game.competitionPhase === phase &&
        ((game.homeTid === m.highSeedTid && game.awayTid === m.lowSeedTid) ||
          (game.homeTid === m.lowSeedTid && game.awayTid === m.highSeedTid)),
      )
      .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)) || a.gid - b.gid);
    const counts = countWins(m, spec, spec.id, phase, state.boxScores as GameResult[], season, seriesGames);
    return {
      id: `${spec.id}-${m.round}-${idx}`,
      round: ROUND_NUMBER[m.round],
      conference: m.round === 'final' ? 'Finals' : 'East',
      higherSeedTid: m.highSeedTid,
      lowerSeedTid: m.lowSeedTid,
      higherSeed: high?.seed ?? 0,
      lowerSeed: low?.seed ?? 0,
      higherSeedWins: counts.high,
      lowerSeedWins: counts.low,
      gamesNeeded: Math.ceil(m.bestOf / 2),
      winnerId: counts.winnerTid,
      gameIds: seriesGames.map(game => game.gid),
      status: counts.complete ? 'complete' : (counts.high + counts.low > 0 ? 'active' : 'pending'),
    };
  };

  const hasPhaseMaterialized = (phase: 'play-in' | 'qf' | 'sf' | 'final'): boolean =>
    (state.schedule as Game[]).some(game => game.competitionId === spec.id && game.competitionPhase === phase) ||
    (state.boxScores as GameResult[]).some(game =>
      game.competitionId === spec.id &&
      game.competitionPhase === phase &&
      matchesCompetitionSeason(game, spec, season)
    );

  const anyPhaseMaterialized =
    hasPhaseMaterialized('play-in') ||
    hasPhaseMaterialized('qf') ||
    hasPhaseMaterialized('sf') ||
    hasPhaseMaterialized('final');

  const playInSeriesRaw = hasPhaseMaterialized('play-in') ? resolution.playInMatches.map(buildSeries) : [];
  const playInComplete = spec.id !== 'euroleague' ||
    (playInSeriesRaw.length === resolution.playInMatches.length && playInSeriesRaw.every(series => series.status === 'complete'));
  const playInSeries = playInSeriesRaw;
  const qfMatches = resolution.knockoutMatches.filter(m => m.round === 'quarterfinal');
  const sfMatches = resolution.knockoutMatches.filter(m => m.round === 'semifinal');
  const finalMatch = resolution.knockoutMatches.find(m => m.round === 'final');
  const qfSeries = hasPhaseMaterialized('qf') && playInComplete ? qfMatches.map(buildSeries) : [];
  const qfComplete = qfSeries.length === qfMatches.length && qfSeries.length > 0 && qfSeries.every(series => series.status === 'complete');
  const showBracketPath = qfSeries.length > 0;
  const sfSeries = showBracketPath && hasPhaseMaterialized('sf') ? sfMatches.map(buildSeries) : [];
  const sfComplete = sfSeries.length === sfMatches.length && sfSeries.length > 0 && sfSeries.every(series => series.status === 'complete');
  const finalSeries = showBracketPath && hasPhaseMaterialized('final') && finalMatch ? buildSeries(finalMatch, 0) : null;

  const allSeries: PlayoffSeries[] = [...playInSeries, ...qfSeries, ...sfSeries, ...(finalSeries ? [finalSeries] : [])];

  const externalTeamsAsNBA: NBATeam[] = (state.nonNBATeams ?? []).map(t => ({
    id: t.tid,
    name: (t as any).name,
    region: (t as any).region ?? '',
    abbrev: (t as any).abbrev ?? '',
    cid: (t as any).cid ?? 0,
    did: (t as any).did ?? 0,
    logoUrl: getResolvedTeamLogoUrl(t),
    colors: (t as any).colors,
    wins: 0,
    losses: 0,
  } as unknown as NBATeam));
  const teams: NBATeam[] = [...state.teams, ...externalTeamsAsNBA];

  const fakeBracket = { series: allSeries, playInGames: [], status: 'knockout' } as unknown as PlayoffBracket;
  const scheduleForBracket = (() => {
    const seriesByGameId = new Map<number, { id: string; gameNumber: number }>();
    allSeries.forEach(series => {
      series.gameIds.forEach((gid, index) => {
        seriesByGameId.set(gid, { id: series.id, gameNumber: index + 1 });
      });
    });
    return (state.schedule as Game[]).map(game => {
      const series = seriesByGameId.get(game.gid);
      if (!series) return game;
      return {
        ...game,
        playoffSeriesId: series.id,
        playoffGameNumber: series.gameNumber,
      };
    });
  })();

  const accent = spec.accentColor ?? '#fb923c';
  const validChampionTid = finalSeries?.status === 'complete' ? finalSeries.winnerId : undefined;
  const championStanding = validChampionTid != null && resolution.championTid === validChampionTid
    ? resolution.standings.find(s => s.tid === resolution.championTid)
    : undefined;
  const championTeam = championStanding ? teams.find(t => t.id === championStanding.tid) : undefined;

  const handleSeriesClick = (id: string) => {
    setSelectedSeriesId(id);
    const series = allSeries.find(entry => entry.id === id);
    const playedCount = series?.gameIds.filter(gid => state.schedule.some(game => game.gid === gid && game.played)).length ?? 0;
    setSelectedGameIdx(Math.max(0, playedCount - 1));
  };
  const noKnockoutYet = !anyPhaseMaterialized;

  const compUnplayedGames = (state.schedule as Game[])
    .filter(g =>
      g.competitionId === spec.id &&
      !g.played &&
      ['play-in', 'qf', 'sf', 'final'].includes(String((g as any).competitionPhase))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextCompGame = compUnplayedGames[0];
  const roundDate = (phases: string[], edge: 'start' | 'end'): string | null => {
    const round = spec.playoffFormat?.rounds.find(r => phases.includes(r.phase));
    const date = round?.[edge];
    if (!date) return null;
    return dateForCompetitionSeason(spec, season, date.month, date.day).slice(0, 10);
  };
  const fallbackActivePhase: 'play-in' | 'qf' | 'sf' | 'final' | null =
    playInSeries.length > 0 && !playInComplete ? 'play-in' :
    qfSeries.length > 0 && !qfComplete ? 'qf' :
    sfSeries.length > 0 && !sfComplete ? 'sf' :
    sfComplete && finalSeries && !finalSeries.winnerId ? 'final' :
    null;
  const fallbackRoundStartDate = fallbackActivePhase === 'play-in'
    ? (() => {
        const qfStart = roundDate(['qf', 'quarterfinals'], 'start');
        if (!qfStart) return null;
        const d = new Date(`${qfStart}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 8);
        return d.toISOString().slice(0, 10);
      })()
    : fallbackActivePhase === 'qf'
      ? roundDate(['qf', 'quarterfinals'], 'start')
      : fallbackActivePhase === 'sf'
        ? roundDate(['sf', 'semifinals', 'final-four'], 'start')
        : fallbackActivePhase === 'final'
          ? roundDate(['final', 'final-four'], 'start')
          : null;
  const fallbackRoundEndDate = fallbackActivePhase === 'play-in'
    ? (() => {
        const start = fallbackRoundStartDate;
        if (!start) return null;
        const d = new Date(`${start}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 2);
        return d.toISOString().slice(0, 10);
      })()
    : fallbackActivePhase === 'qf'
      ? roundDate(['qf', 'quarterfinals'], 'end')
      : fallbackActivePhase === 'sf'
        ? roundDate(['sf', 'semifinals', 'final-four'], 'end')
        : fallbackActivePhase === 'final'
          ? roundDate(['final', 'final-four'], 'end')
          : null;
  const nextActionDate = nextCompGame?.date ?? fallbackRoundStartDate;

  const roundEndDate = (() => {
    if (!nextCompGame) return fallbackRoundEndDate;
    const phase = (nextCompGame as any).competitionPhase;
    if (!phase) return nextCompGame.date;
    const sameRound = compUnplayedGames.filter(g => (g as any).competitionPhase === phase);
    return sameRound[sameRound.length - 1]?.date ?? nextCompGame.date;
  })();

  const lastPlayoffDate = maxDateString([
    compUnplayedGames[compUnplayedGames.length - 1]?.date,
    roundDate(['final', 'final-four'], 'end'),
    fallbackRoundEndDate,
  ]);

  const simTo = (targetIsoOrDate: string) => {
    const targetDate = normalizeDate(targetIsoOrDate);
    dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: targetDate < today ? today : targetDate } } as any);
  };
  const simToChampion = () => {
    if (!lastPlayoffDate) return;
    simTo(lastPlayoffDate);
  };
  const simSelectedSeriesGame = () => {
    const series = allSeries.find(entry => entry.id === selectedSeriesId);
    const nextGame = series?.gameIds
      .map(gid => scheduleForBracket.find(game => game.gid === gid))
      .find((game): game is Game => !!game && !game.played);
    if (nextGame) simTo(nextGame.date);
  };
  const simOneDay = () => dispatchAction({ type: 'ADVANCE_DAY' } as any);

  const SimButton: React.FC<{ onClick: () => void; disabled?: boolean; icon: any; children: React.ReactNode }> =
    ({ onClick, disabled, icon: Icon, children }) => (
      <button
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Icon className="w-3.5 h-3.5" />
        {children}
      </button>
    );

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const target = direction === 'left' ? scrollLeft - clientWidth / 2 : scrollLeft + clientWidth / 2;
      scrollRef.current.scrollTo({ left: target, behavior: 'smooth' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div
        className="rounded-3xl border border-slate-800 bg-slate-950 p-5"
        style={{ boxShadow: `inset 0 1px 0 ${accent}55` }}
      >
        <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accent }}>
          {spec.shortName}
        </div>
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white mt-1">
          {spec.displayName} · Bracket
        </h1>
        {championTeam && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-widest">
            <Trophy className="w-4 h-4" /> Champion · {getTeamFullName(championTeam)}
          </div>
        )}
        {!championTeam && anyPhaseMaterialized && (
          <div className="mt-4 flex flex-wrap gap-2">
            <SimButton onClick={simOneDay} icon={Play}>Sim 1 Day</SimButton>
            <SimButton onClick={() => nextActionDate && simTo(nextActionDate)} disabled={!nextActionDate} icon={SkipForward}>
              Sim Next Game
            </SimButton>
            <SimButton onClick={() => roundEndDate && simTo(roundEndDate)} disabled={!roundEndDate} icon={FastForward}>
              Sim Round
            </SimButton>
            {lastPlayoffDate && (
              <SimButton onClick={simToChampion} icon={Trophy}>
                Sim to Champion
              </SimButton>
            )}
          </div>
        )}
      </div>

      {noKnockoutYet ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-12 text-center">
          <Trophy className="w-10 h-10 mx-auto text-slate-700 mb-3" />
          <div className="text-sm font-bold text-slate-400">Bracket is set after the regular season ends.</div>
          <div className="text-xs text-slate-600 mt-1">
            Standings → seeds → knockout games will appear here automatically.
          </div>
        </div>
      ) : (
        <div className="relative w-full">
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded-full backdrop-blur-sm border border-slate-600 shadow-lg hidden md:block"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded-full backdrop-blur-sm border border-slate-600 shadow-lg hidden md:block"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div
            ref={scrollRef}
            className="w-full overflow-x-auto pb-8 custom-scrollbar px-4 md:px-12"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="min-w-max mx-auto flex items-stretch gap-6 py-4">
              {playInSeries.length > 0 && (
                <BracketColumn
                  label="Play-In"
                  labelColor="text-slate-400"
                  seriesIds={playInSeries.map(s => s.id)}
                  playoffs={fakeBracket}
                  teams={teams}
                  schedule={scheduleForBracket}
                  stateDate={state.date}
                  onSeriesClick={handleSeriesClick}
                  selectedSeriesId={selectedSeriesId}
                  justify="space-between"
                  baseDelay={0.1}
                />
              )}
              {qfSeries.length > 0 && (
                <BracketColumn
                  label="Quarterfinals"
                  labelColor="text-slate-300"
                  seriesIds={qfSeries.map(s => s.id)}
                  playoffs={fakeBracket}
                  teams={teams}
                  schedule={scheduleForBracket}
                  stateDate={state.date}
                  onSeriesClick={handleSeriesClick}
                  selectedSeriesId={selectedSeriesId}
                  justify="space-between"
                  baseDelay={0.2}
                />
              )}
              {sfSeries.length > 0 && (
                <BracketColumn
                  label="Semifinals"
                  labelColor="text-slate-300"
                  seriesIds={sfSeries.map(s => s.id)}
                  playoffs={fakeBracket}
                  teams={teams}
                  schedule={scheduleForBracket}
                  stateDate={state.date}
                  onSeriesClick={handleSeriesClick}
                  selectedSeriesId={selectedSeriesId}
                  justify="space-around"
                  baseDelay={0.35}
                />
              )}
              {finalSeries && (
                <div className="flex flex-col justify-center px-4 relative shrink-0">
                  <h3 className="text-center text-[10px] font-bold tracking-[0.2em] uppercase text-amber-400/80 mb-3">
                    Final
                  </h3>
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1.0, type: 'spring' }}
                    className="absolute -top-4 left-1/2 -translate-x-1/2"
                  >
                    <Trophy className="w-8 h-8 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
                  </motion.div>
                  {finalSeries ? (
                    <SeriesCard
                      series={finalSeries}
                      teams={teams}
                      schedule={scheduleForBracket}
                      stateDate={state.date}
                      isSelected={selectedSeriesId === finalSeries.id}
                      onClick={() => handleSeriesClick(finalSeries.id)}
                      label="Final TBD"
                      delay={0.55}
                    />
                  ) : (
                    <div className="flex items-center justify-center bg-white/[0.02] border border-dashed border-amber-500/20 rounded-xl w-48 min-h-[80px]">
                      <span className="text-amber-900 text-[10px] font-bold">TBD</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedSeriesId && (
        <SeriesDetailPanel
          seriesId={selectedSeriesId}
          playoffs={fakeBracket}
          teams={teams}
          schedule={scheduleForBracket}
          players={state.players}
          boxScores={state.boxScores as GameResult[]}
          currentSeason={season}
          stateDate={state.date}
          selectedGameIdx={selectedGameIdx}
          onGameIdxChange={setSelectedGameIdx}
          onSimGame={simSelectedSeriesGame}
          onSimRound={() => roundEndDate && simTo(roundEndDate)}
          onSimPlayoffs={simToChampion}
          onClose={() => setSelectedSeriesId(null)}
          isProcessing={state.isProcessing}
          competitionLabel={spec.shortName}
          roundLabels={{ 1: 'Play-In', 2: 'Quarterfinals', 3: 'Semifinals', 4: 'Final' }}
        />
      )}
    </div>
  );
};
