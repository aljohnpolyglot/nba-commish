import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, ChevronLeft, ChevronRight, Eye, FastForward, Play, SkipForward } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getOwnTeamId, normalizeDate } from '../../utils/helpers';
import { resolveCompetitionSeason } from '../../services/competition/competitionResolver';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { dateForCompetitionSeason, matchesScheduleSeason } from '../../services/competition/competitionSeasonState';
import { BracketColumn } from '../playoffs/bracket/BracketColumn';
import { SeriesCard } from '../playoffs/bracket/SeriesCard';
import { SeriesDetailPanel } from '../playoffs/detail/SeriesDetailPanel';
import type { PlayoffSeries, PlayoffBracket, NBATeam, Game, GameResult } from '../../types';
import type { CompetitionKnockoutMatch } from '../../services/competition/competitionResolver';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { CompetitionGroupStandings } from './CompetitionGroupStandings';
import {
  countCompetitionSeriesWins,
  matchesCompetitionSeason,
  maxDateString,
  PHASE_FOR_ROUND,
  ROUND_NUMBER,
} from './competitionBracketUtils';

interface Props { specId: string; }
export const CompetitionBracketView: React.FC<Props> = ({ specId }) => {
  const { state, dispatchAction } = useGame();
  const ownTid = getOwnTeamId(state);
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
        matchesScheduleSeason(game, season) &&
        ((game.homeTid === m.highSeedTid && game.awayTid === m.lowSeedTid) ||
          (game.homeTid === m.lowSeedTid && game.awayTid === m.highSeedTid)),
      )
      .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)) || a.gid - b.gid);
    const counts = countCompetitionSeriesWins(m, spec, spec.id, phase, state.boxScores as GameResult[], season, seriesGames);
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
    (state.schedule as Game[]).some(game =>
      game.competitionId === spec.id && game.competitionPhase === phase && matchesScheduleSeason(game, season)
    ) ||
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
  const scheduledMatchesForRound = (
    phase: 'qf' | 'sf' | 'final',
    round: CompetitionKnockoutMatch['round'],
  ): CompetitionKnockoutMatch[] => {
    const grouped = new Map<string, Game[]>();
    for (const game of state.schedule as Game[]) {
      if (game.competitionId !== spec.id || game.competitionPhase !== phase || !matchesScheduleSeason(game, season)) continue;
      const key = [game.homeTid, game.awayTid].sort((left, right) => left - right).join(':');
      grouped.set(key, [...(grouped.get(key) ?? []), game]);
    }
    return [...grouped.values()].map(games => {
      const first = games[0];
      const homeSeed = resolution.standings.find(row => row.tid === first.homeTid)?.seed ?? Number.MAX_SAFE_INTEGER;
      const awaySeed = resolution.standings.find(row => row.tid === first.awayTid)?.seed ?? Number.MAX_SAFE_INTEGER;
      const highSeedTid = homeSeed <= awaySeed ? first.homeTid : first.awayTid;
      const lowSeedTid = highSeedTid === first.homeTid ? first.awayTid : first.homeTid;
      return {
        round,
        highSeedTid,
        lowSeedTid,
        winnerTid: highSeedTid,
        loserTid: lowSeedTid,
        bestOf: Math.max(1, games.length),
      };
    });
  };
  const resolvedQfMatches = resolution.knockoutMatches.filter(m => m.round === 'quarterfinal');
  const resolvedSfMatches = resolution.knockoutMatches.filter(m => m.round === 'semifinal');
  const resolvedFinalMatch = resolution.knockoutMatches.find(m => m.round === 'final');
  const qfMatches = resolvedQfMatches.length > 0 ? resolvedQfMatches : scheduledMatchesForRound('qf', 'quarterfinal');
  const sfMatches = resolvedSfMatches.length > 0 ? resolvedSfMatches : scheduledMatchesForRound('sf', 'semifinal');
  const finalMatch = resolvedFinalMatch ?? scheduledMatchesForRound('final', 'final')[0];
  const qfSeries = hasPhaseMaterialized('qf') && playInComplete ? qfMatches.map(buildSeries) : [];
  const qfComplete = qfMatches.length === 0
    || (qfSeries.length === qfMatches.length && qfSeries.every(series => series.status === 'complete'));
  const sfSeries = qfComplete && hasPhaseMaterialized('sf') ? sfMatches.map(buildSeries) : [];
  const sfComplete = sfSeries.length === sfMatches.length && sfSeries.length > 0 && sfSeries.every(series => series.status === 'complete');
  const finalSeries = sfComplete && hasPhaseMaterialized('final') && finalMatch ? buildSeries(finalMatch, 0) : null;

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
  const groupCount = Math.max(1, Number(spec.groupCount ?? 1));
  const hasGroupStage = groupCount > 1;
  const qualifierCount = qfMatches.length > 0 ? 8 : 4;
  const bracketPendingCopy = hasGroupStage
    ? 'The Final Four bracket appears when the group stage is complete.'
    : spec.format === 'regular-league'
      ? 'The playoff bracket appears when the regular season is complete.'
      : spec.qualificationRule === 'domestic-titleholders'
        ? 'The bracket appears when the titleholder field is confirmed.'
        : 'The bracket appears when the tournament field is confirmed.';

  const compUnplayedGames = (state.schedule as Game[])
    .filter(g =>
      g.competitionId === spec.id &&
      matchesScheduleSeason(g, season) &&
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

  const simTo = (targetIsoOrDate: string, stopBefore = false) => {
    const targetDate = normalizeDate(targetIsoOrDate);
    dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: targetDate < today ? today : targetDate, ...(stopBefore ? { stopBefore: true } : {}) },
    } as any);
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
            <SimButton onClick={() => nextActionDate && simTo(nextActionDate, true)} disabled={!nextActionDate} icon={Eye}>
              Watch Next Game
            </SimButton>
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

      {hasGroupStage && (
        <CompetitionGroupStandings
          groupCount={groupCount}
          seedTids={seedTids}
          standings={resolution.standings}
          teams={teams}
          qualifierCount={qualifierCount}
          accentColor={accent}
          ownTid={ownTid}
          spec={spec}
          season={season}
          games={state.boxScores as GameResult[]}
        />
      )}

      {noKnockoutYet ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-12 text-center">
          <Trophy className="w-10 h-10 mx-auto text-slate-700 mb-3" />
          <div className="text-sm font-bold text-slate-400">{bracketPendingCopy}</div>
          <div className="mt-1 text-xs text-slate-600">Qualified clubs and actual game winners determine every next round.</div>
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
                  ownTid={ownTid}
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
                  ownTid={ownTid}
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
                  ownTid={ownTid}
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
                      ownTid={ownTid}
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
