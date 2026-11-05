import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Info, Trophy } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  EuroAwardService,
  type EuroAllTeamSpot,
  type EuroAwardCandidate,
  type EuroCoachCandidate,
} from '../../services/logic/EuroAwardService';
import type { CompetitionAwardKind } from '../../services/competition/types';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import {
  matchesBoxScoreSeason,
  matchesScheduleSeason,
} from '../../services/competition/competitionSeasonState';
import { filterAwardsToVisibleTimeline } from '../../utils/awardHistory';
import { getOwnTeamId } from '../../utils/helpers';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { buildCompetitionSeasonPlayers } from '../central/view/playerStatsBoxScoreMaps';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { RankedPersonCard, StatPills } from '../shared/ui';
import {
  buildEuroAwardOptions,
  euroAwardDescription,
} from './euroAwardRacePresentation';
import { AwardTrophyArtwork, useAwardTrophyCatalog } from '../shared/AwardTrophyArtwork';
import { resolveAwardTrophyPhoto } from '../../services/awards/awardTrophyPhotos';

type CompetitionTrack = 'euroleague' | 'domestic';

const isPostRegularPhase = (phase?: string): boolean => {
  const normalized = String(phase ?? '').toLowerCase();
  return ['play-in', 'qf', 'quarterfinal', 'sf', 'semifinal', 'final'].includes(normalized);
};

const competitionRoundStart = (season: number, month: number, day: number): number =>
  Date.UTC(month >= 9 ? season - 1 : season, month - 1, day);

interface EuroAwardRacesViewProps {
  forcedCompetition?: string;
}

export const EuroAwardRacesView: React.FC<EuroAwardRacesViewProps> = ({ forcedCompetition }) => {
  const { state, navigateToPlayer } = useGame();
  const season = state.leagueStats.year;
  const ownTid = getOwnTeamId(state);
  const domesticCompetitionId = forcedCompetition && forcedCompetition !== 'euroleague'
    ? forcedCompetition
    : state.euroPrimaryCompetitionId ?? 'endesa';
  const euroleagueSpec = state.activeCompetitions?.find(entry => entry.id === 'euroleague');
  const domesticSpec = state.activeCompetitions?.find(entry => entry.id === domesticCompetitionId);
  const [track, setTrack] = useState<CompetitionTrack>(
    forcedCompetition === 'euroleague' ? 'euroleague' : forcedCompetition ? 'domestic' : 'euroleague',
  );
  const [selectedKinds, setSelectedKinds] = useState<Record<CompetitionTrack, CompetitionAwardKind>>({
    euroleague: 'mvp',
    domestic: 'mvp',
  });
  const trophyCatalog = useAwardTrophyCatalog(true);

  useEffect(() => {
    if (forcedCompetition) {
      setTrack(forcedCompetition === 'euroleague' ? 'euroleague' : 'domestic');
    }
  }, [forcedCompetition]);

  const euroleagueTeamIds = useMemo(
    () => new Set(euroleagueSpec ? selectCompetitionTeamTids(euroleagueSpec, state) : []),
    [euroleagueSpec, state],
  );
  const domesticTeamIds = useMemo(
    () => new Set(domesticSpec ? selectCompetitionTeamTids(domesticSpec, state) : []),
    [domesticSpec, state],
  );
  const euroleaguePlayers = useMemo(
    () => buildCompetitionSeasonPlayers(state, 'euroleague', euroleagueTeamIds),
    [euroleagueTeamIds, state.boxScores, season, state.nbaCup, state.nbaCupHistory, state.players, state.playoffs, state.schedule],
  );
  const domesticPlayers = useMemo(
    () => buildCompetitionSeasonPlayers(state, domesticCompetitionId, domesticTeamIds),
    [domesticCompetitionId, domesticTeamIds, state.boxScores, season, state.nbaCup, state.nbaCupHistory, state.players, state.playoffs, state.schedule],
  );
  const euroleagueRaces = useMemo(() => EuroAwardService.calculateEuroleagueRaces(
    euroleaguePlayers,
    state.teams,
    state.nonNBATeams ?? [],
    season,
    state.staff,
    undefined,
    state.boxScores ?? [],
    euroleagueTeamIds,
  ), [euroleaguePlayers, euroleagueTeamIds, season, state.boxScores, state.nonNBATeams, state.staff, state.teams]);
  const domesticRaces = useMemo(() => EuroAwardService.calculateDomesticRaces(
    domesticPlayers,
    state.teams,
    state.nonNBATeams ?? [],
    season,
    domesticCompetitionId,
    domesticTeamIds,
    state.staff,
    undefined,
    state.boxScores ?? [],
  ), [domesticCompetitionId, domesticPlayers, domesticTeamIds, season, state.boxScores, state.nonNBATeams, state.staff, state.teams]);

  const euroleagueOptions = useMemo(
    () => buildEuroAwardOptions(euroleagueSpec, season),
    [euroleagueSpec, season],
  );
  const domesticOptions = useMemo(
    () => buildEuroAwardOptions(domesticSpec, season),
    [domesticSpec, season],
  );
  const options = track === 'euroleague' ? euroleagueOptions : domesticOptions;
  const selectedOption = options.find(option => option.kind === selectedKinds[track]) ?? options[0];
  const selectedSpec = track === 'euroleague' ? euroleagueSpec : domesticSpec;
  const selectedCompetitionId = selectedSpec?.id ?? (track === 'euroleague' ? 'euroleague' : domesticCompetitionId);
  const selectedDisplayName = selectedSpec?.displayName ?? 'European competition';
  const selectedTrophy = selectedOption ? resolveAwardTrophyPhoto(trophyCatalog, {
    awardType: selectedOption.title,
    namespace: 'euro',
    competitionId: selectedCompetitionId,
    competitionName: selectedDisplayName,
  }) : undefined;

  useEffect(() => {
    if (!selectedOption && options.length === 0) return;
    if (selectedOption?.kind !== selectedKinds[track]) {
      setSelectedKinds(current => ({ ...current, [track]: selectedOption.kind }));
    }
  }, [options, selectedKinds, selectedOption, track]);

  const competitionSamples = useMemo(() => {
    const hasSample = (id: string) => (state.boxScores ?? []).some(game =>
      game.competitionId === id
      && game.season === season
      && !isPostRegularPhase(game.competitionPhase),
    );
    return {
      euroleague: hasSample('euroleague'),
      domestic: hasSample(domesticCompetitionId),
    };
  }, [domesticCompetitionId, season, state.boxScores]);

  const competitionHistory = state.competitionHistory ?? {};
  const competitionWindow = useMemo(() => {
    const firstRound = selectedSpec?.playoffFormat?.rounds?.[0];
    const dateMs = state.date ? new Date(state.date).getTime() : 0;
    const calendarGate = firstRound
      ? dateMs >= competitionRoundStart(season, firstRound.start.month, firstRound.start.day)
      : false;
    const postRegularGames = (state.schedule ?? []).some(game =>
      game.competitionId === selectedCompetitionId
      && matchesScheduleSeason(game, season)
      && isPostRegularPhase(game.competitionPhase),
    ) || (state.boxScores ?? []).some(game =>
      game.competitionId === selectedCompetitionId
      && matchesBoxScoreSeason(game, season)
      && isPostRegularPhase(game.competitionPhase),
    );
    const savedHistory = (competitionHistory[selectedCompetitionId] ?? []) as Array<{
      season?: number;
      championTid?: number;
    }>;
    const resolved = savedHistory.some(entry =>
      entry.season === season && entry.championTid != null,
    );
    return calendarGate || postRegularGames || resolved;
  }, [competitionHistory, season, selectedCompetitionId, selectedSpec, state.boxScores, state.date, state.schedule]);

  const seasonAwards = filterAwardsToVisibleTimeline(state.historicalAwards ?? [], season)
    .filter(award => award.season === season && award.competitionId === selectedCompetitionId);
  const announced = !!selectedOption && selectedOption.entries.some(entry =>
    seasonAwards.some(award => award.type === entry.type),
  );
  const finalized = announced || competitionWindow;
  const seasonNotStarted = !competitionSamples[track];

  const playerCandidates = (kind: CompetitionAwardKind): EuroAwardCandidate[] => {
    if (track === 'euroleague') {
      const raceMap: Partial<Record<CompetitionAwardKind, EuroAwardCandidate[]>> = {
        mvp: euroleagueRaces.mvp,
        defender: euroleagueRaces.defender,
        youngPlayer: euroleagueRaces.risingStar,
        topScorer: euroleagueRaces.topScorer,
      };
      return raceMap[kind] ?? [];
    }
    const raceMap: Partial<Record<CompetitionAwardKind, EuroAwardCandidate[]>> = {
      mvp: domesticRaces.mvp,
      defender: domesticRaces.defender,
      sixthMan: domesticRaces.sixthMan,
      mostImproved: domesticRaces.mostImproved,
      youngPlayer: domesticRaces.bestYoungPlayer,
      topScorer: domesticRaces.topScorer,
      assistLeader: domesticRaces.topAssister,
      offensivePlayer: domesticRaces.offensivePlayer,
      efficiencyPlayer: domesticRaces.efficiencyPlayer,
      spectacularPlayer: domesticRaces.spectacularPlayer,
      popularPlayer: domesticRaces.popularPlayer,
    };
    return raceMap[kind] ?? [];
  };

  const renderEmpty = (message: string) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );

  const renderPlayerCards = (candidates: EuroAwardCandidate[]) => candidates.length === 0
    ? renderEmpty(seasonNotStarted ? 'The race opens after the first competition games.' : 'No eligible candidates yet.')
    : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnimatePresence mode="wait">
          {candidates.map((candidate, index) => {
            const teamSnapshot = getHistoricalTeamSnapshot(candidate.team, season);
            const rebounds = candidate.stats.trb
              || (candidate.stats as { reb?: number }).reb
              || (candidate.stats.orb || 0) + (candidate.stats.drb || 0);
            return (
              <div
                key={candidate.player.internalId}
                className={ownTid === candidate.player.tid ? 'rounded-xl ring-2 ring-indigo-500/50' : ''}
              >
                <RankedPersonCard
                  rank={index + 1}
                  portraitUrl={candidate.player.imgURL}
                  face={candidate.player.face}
                  name={candidate.player.name}
                  badge={candidate.player.pos}
                  subtitle={`${getTeamFullName(teamSnapshot)} · ${candidate.team.wins}-${candidate.team.losses}`}
                  teamLogoUrl={teamSnapshot.logoUrl}
                  stats={[
                    { label: 'PTS', val: (candidate.stats.pts / candidate.stats.gp).toFixed(1) },
                    { label: 'REB', val: (rebounds / candidate.stats.gp).toFixed(1) },
                    { label: 'AST', val: (candidate.stats.ast / candidate.stats.gp).toFixed(1) },
                  ]}
                  odds={finalized ? undefined : candidate.odds}
                  accentColor="indigo"
                  animDelay={index * 0.05}
                  onClick={() => navigateToPlayer(candidate.player)}
                />
              </div>
            );
          })}
        </AnimatePresence>
      </div>
    );

  const renderStaff = (candidates: EuroCoachCandidate[], roleLabel: string) => candidates.length === 0
    ? renderEmpty(seasonNotStarted ? `The ${roleLabel} race opens after the first competition games.` : `No eligible ${roleLabel}s yet.`)
    : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {candidates.map((candidate, index) => {
          const teamSnapshot = getHistoricalTeamSnapshot(candidate.team, season);
          return (
            <RankedPersonCard
              key={`${candidate.coachName}-${candidate.team.id}`}
              rank={index + 1}
              portraitUrl={candidate.portraitUrl}
              face={candidate.face}
              name={candidate.coachName}
              subtitle={`${getTeamFullName(teamSnapshot)} · ${candidate.wins}–${candidate.losses}`}
              teamLogoUrl={teamSnapshot.logoUrl}
              odds={finalized ? undefined : candidate.odds}
              accentColor="teal"
              animDelay={index * 0.05}
            />
          );
        })}
      </div>
    );

  const renderSelectionTeams = (teams: EuroAllTeamSpot[][], headings: string[]) => (
    <div>
      {teams.map((team, teamIndex) => team.length > 0 && (
        <section key={headings[teamIndex] ?? teamIndex} className="mb-6">
          <h4 className={`mb-3 text-xs font-black uppercase tracking-[0.2em] ${teamIndex === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
            {headings[teamIndex] ?? `Selection ${teamIndex + 1}`}
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((spot, spotIndex) => {
              const teamSnapshot = getHistoricalTeamSnapshot(spot.team, season);
              return (
                <motion.button
                  type="button"
                  key={spot.player.internalId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (teamIndex * 5 + spotIndex) * 0.04 }}
                  onClick={() => navigateToPlayer(spot.player)}
                  className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    ownTid === spot.player.tid
                      ? 'border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/15'
                      : 'border-slate-800 bg-slate-900 hover:border-indigo-500/40 hover:bg-slate-800'
                  }`}
                >
                  <PlayerPortrait
                    imgUrl={spot.player.imgURL}
                    face={spot.player.face}
                    playerName={spot.player.name}
                    teamLogoUrl={teamSnapshot.logoUrl}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white group-hover:text-indigo-400">{spot.player.name}</p>
                    <p className="text-[10px] text-slate-500">{spot.pos} · {teamSnapshot.abbrev}</p>
                  </div>
                  <StatPills stats={[{ label: 'PTS', val: (spot.stats.pts / spot.stats.gp).toFixed(1) }]} />
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  const content = (() => {
    if (!selectedOption) {
      return renderEmpty('This competition has no individual regular-season award program for this season.');
    }
    if (selectedOption.kind === 'coach') {
      return renderStaff(track === 'euroleague' ? euroleagueRaces.coy : domesticRaces.bestCoach, 'coach');
    }
    if (selectedOption.kind === 'allLeague') {
      const teams = track === 'euroleague' ? euroleagueRaces.allEuroLeague : domesticRaces.bestFive;
      const visibleTeams = teams.slice(0, selectedOption.entries.length);
      return renderSelectionTeams(visibleTeams, selectedOption.entries.map(entry => entry.type));
    }
    return renderPlayerCards(playerCandidates(selectedOption.kind));
  })();

  const viewTitle = forcedCompetition
    ? `${selectedDisplayName} Awards`
    : 'European Awards';
  const viewSubtitle = forcedCompetition
    ? `${selectedDisplayName} honors and live award races.`
    : `EuroLeague and ${domesticSpec?.displayName ?? 'domestic league'} honors in separate competition tracks.`;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/50 p-4 md:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="flex items-center gap-3 text-2xl font-black uppercase tracking-tighter text-white md:text-3xl">
                <Trophy className="text-yellow-500" size={32} />
                {viewTitle}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{viewSubtitle}</p>
            </div>
            {!forcedCompetition && euroleagueSpec && domesticSpec && (
              <div className="flex gap-0.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => setTrack('euroleague')}
                  className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-wider ${
                    track === 'euroleague' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
                  }`}
                >
                  {euroleagueSpec.shortName || 'EuroLeague'}
                </button>
                <button
                  type="button"
                  onClick={() => setTrack('domestic')}
                  className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-wider ${
                    track === 'domestic' ? 'bg-red-500 text-white' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
                  }`}
                >
                  {domesticSpec.shortName || 'Domestic'}
                </button>
              </div>
            )}
          </div>
          {options.length > 0 && (
            <div className="flex gap-0.5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-1 no-scrollbar">
              {options.map(option => (
                <button
                  type="button"
                  key={option.kind}
                  onClick={() => setSelectedKinds(current => ({ ...current, [track]: option.kind }))}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                    selectedOption?.kind === option.kind
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
                  }`}
                >
                  {option.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar md:p-6">
        <div className="mx-auto max-w-6xl">
          {selectedOption && (
            <motion.div
              key={`${track}-${selectedOption.kind}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-center gap-4"
            >
              <AwardTrophyArtwork
                src={selectedTrophy?.trophy}
                alt={`${selectedOption.title} trophy`}
                className="h-20 w-16 shrink-0"
                fallback={null}
              />
              <div>
                <h3 className="text-xl font-bold text-white md:text-2xl">{selectedOption.title}</h3>
                <p className="text-sm text-slate-400">{euroAwardDescription(selectedOption.kind, selectedDisplayName)}</p>
              </div>
              <span className={`ml-auto hidden text-xs font-bold uppercase tracking-widest md:block ${finalized ? 'text-amber-400' : 'text-indigo-400'}`}>
                {finalized ? 'Finalized' : 'Projection'}
              </span>
            </motion.div>
          )}

          {content}

          <div className="mt-12 flex items-start gap-3 rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
            <Info size={18} className="mt-0.5 shrink-0 text-slate-600" />
            <p className="text-xs leading-relaxed text-slate-600">
              {finalized
                ? 'This board is no longer a live race after the competition reaches its postseason or writes its awards.'
                : 'These projections use competition-only production and team results. Each league shows only the honors active in that season.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
