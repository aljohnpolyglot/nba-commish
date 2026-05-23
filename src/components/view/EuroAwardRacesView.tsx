/**
 * EuroAwardRacesView — Euroleague + Liga ACB award races, rendered when
 * `isEuroIsolatedMode(state)` is true. Uses EuroAwardService for race
 * calculations; mirrors the NBA AwardRacesView visual style.
 *
 * Two parallel competition tracks ("Euroleague" / "Liga ACB") with their
 * own award tab set. Switch competition via the top toggle.
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Target, Star, Info, Users, UserCheck, Sparkles, Award, BarChart3 } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { EuroAwardService, EuroAwardCandidate, EuroCoachCandidate, EuroAllTeamSpot } from '../../services/logic/EuroAwardService';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { RankedPersonCard, StatPills } from '../shared/ui';
import { getOwnTeamId } from '../../utils/helpers';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { NBAPlayer } from '../../types';

type EuroleagueTab = 'mvp' | 'defender' | 'risingStar' | 'topScorer' | 'coy' | 'allEL';
type EndesaTab = 'mvp' | 'bestYoung' | 'topScorer' | 'topRebounder' | 'topAssister' | 'pirLeader' | 'bestCoach';
type Competition = 'euroleague' | 'endesa';

const isPostRegularPhase = (phase?: string): boolean => {
  const normalized = String(phase ?? '').toLowerCase();
  return normalized === 'play-in'
    || normalized === 'qf'
    || normalized === 'quarterfinal'
    || normalized === 'sf'
    || normalized === 'semifinal'
    || normalized === 'final';
};

const competitionRoundStart = (season: number, month: number, day: number): number =>
  Date.UTC(month >= 9 ? season - 1 : season, month - 1, day);

interface EuroAwardRacesViewProps {
  forcedCompetition?: Competition;
}

const STORED_TYPES = {
  euroleague: {
    mvp: 'Euroleague MVP',
    defender: 'Euroleague Best Defender',
    risingStar: 'Euroleague Rising Star',
    topScorer: 'Alphonso Ford Top Scorer',
    coy: 'Alexander Gomelskiy COY',
    allEL: 'All-EuroLeague First Team',
  } as Record<EuroleagueTab, string>,
  endesa: {
    mvp: 'Liga ACB MVP',
    bestYoung: 'Liga ACB Best Young Player',
    topScorer: 'Liga ACB Top Scorer',
    topRebounder: 'Liga ACB Rebound Leader',
    topAssister: 'Liga ACB Assist Leader',
    pirLeader: 'Liga ACB PIR Leader',
    bestCoach: 'Liga ACB Best Coach',
  } as Record<EndesaTab, string>,
};

export const EuroAwardRacesView: React.FC<EuroAwardRacesViewProps> = ({ forcedCompetition }) => {
  const { state } = useGame();
  const ownTid = getOwnTeamId(state);
  const [competition, setCompetition] = useState<Competition>(forcedCompetition ?? 'euroleague');
  const [elTab, setELTab] = useState<EuroleagueTab>('mvp');
  const [endesaTab, setEndesaTab] = useState<EndesaTab>('mvp');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  React.useEffect(() => {
    if (!forcedCompetition) return;
    setCompetition(forcedCompetition);
  }, [forcedCompetition]);

  const seasonAwards = (state.historicalAwards ?? []).filter(a => a.season === state.leagueStats.year);
  const competitionHistory = ((state as any).competitionHistory ?? {}) as Record<string, Array<{ season: number; championTid?: number | null }>>;

  const euroleagueRaces = useMemo(() => EuroAwardService.calculateEuroleagueRaces(
    state.players, state.teams, state.nonNBATeams ?? [], state.leagueStats.year, state.staff, undefined, state.boxScores ?? [],
  ), [state.players, state.teams, state.nonNBATeams, state.leagueStats.year, state.staff, state.boxScores]);

  const endesaRaces = useMemo(() => EuroAwardService.calculateEndesaRaces(
    state.players, state.teams, state.nonNBATeams ?? [], state.leagueStats.year, state.staff, undefined, state.boxScores ?? [],
  ), [state.players, state.teams, state.nonNBATeams, state.leagueStats.year, state.staff, state.boxScores]);

  const totalGP = state.teams.reduce((sum, t) => sum + (t.wins ?? 0) + (t.losses ?? 0), 0);
  const seasonNotStarted = totalGP === 0;

  const competitionWindow = useMemo(() => {
    const buildWindow = (id: Competition) => {
      const currentSeason = state.leagueStats.year;
      const spec = state.activeCompetitions?.find((entry: any) => entry.id === id);
      const firstPostRegularRound = spec?.playoffFormat?.rounds?.[0];
      const dateMs = state.date ? new Date(state.date).getTime() : 0;
      const calendarGate = firstPostRegularRound
        ? dateMs >= competitionRoundStart(currentSeason, firstPostRegularRound.start.month, firstPostRegularRound.start.day)
        : false;
      const postRegularGames = [
        ...(state.schedule ?? []),
        ...(state.boxScores ?? []),
      ].some((game: any) =>
        game.competitionId === id &&
        (
          game.season === currentSeason ||
          (typeof game.season !== 'number' && String(game.date ?? '').includes(String(currentSeason)))
        ) &&
        isPostRegularPhase(game.competitionPhase),
      );
      const resolvedSeason = (competitionHistory[id] ?? []).some(entry =>
        entry.season === currentSeason && entry.championTid != null,
      );
      return {
        calendarGate,
        postRegularGames,
        resolvedSeason,
        regularSeasonAwardsFinalized: calendarGate || postRegularGames || resolvedSeason,
      };
    };
    return {
      euroleague: buildWindow('euroleague'),
      endesa: buildWindow('endesa'),
    };
  }, [state.schedule, state.boxScores, state.leagueStats.year, competitionHistory]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  // ─── Tab metadata ────────────────────────────────────────────────────────

  const euroleagueLabels: Record<EuroleagueTab, { title: string; icon: React.ReactElement; desc: string }> = {
    mvp:        { title: 'Regular Season MVP',          icon: <Star className="text-yellow-400" />,        desc: 'Best player of the EuroLeague regular season' },
    defender:   { title: 'Best Defender Trophy',         icon: <Target className="text-blue-400" />,        desc: 'Most impactful defender across the season' },
    risingStar: { title: 'Rising Star Award',            icon: <Sparkles className="text-purple-400" />,    desc: 'Top performer under the age of 23' },
    topScorer:  { title: 'Alphonso Ford Top Scorer',     icon: <BarChart3 className="text-orange-400" />,   desc: 'Highest points-per-game leader' },
    coy:        { title: 'Alexander Gomelskiy COY',      icon: <UserCheck className="text-teal-400" />,     desc: 'Coach of the Year' },
    allEL:      { title: 'All-EuroLeague Teams',         icon: <Users className="text-indigo-400" />,       desc: 'First & Second Team selections' },
  };
  const endesaLabels: Record<EndesaTab, { title: string; icon: React.ReactElement; desc: string }> = {
    mvp:           { title: 'Regular Season MVP',     icon: <Star className="text-yellow-400" />,      desc: 'MVP of the Liga ACB regular season' },
    bestYoung:     { title: 'Best Young Player',      icon: <Sparkles className="text-purple-400" />,  desc: 'Top performer under the age of 22' },
    topScorer:     { title: 'Top Scorer',             icon: <BarChart3 className="text-orange-400" />, desc: 'Highest points-per-game leader' },
    topRebounder:  { title: 'Rebound Leader',         icon: <BarChart3 className="text-amber-400" />,  desc: 'Highest rebounds-per-game leader' },
    topAssister:   { title: 'Assist Leader',          icon: <BarChart3 className="text-sky-400" />,    desc: 'Highest assists-per-game leader' },
    pirLeader:     { title: 'PIR Leader',             icon: <Award className="text-pink-400" />,       desc: 'Performance Index Rating leader' },
    bestCoach:     { title: 'Best Coach',             icon: <UserCheck className="text-teal-400" />,   desc: 'Best Coach award' },
  };

  if (seasonNotStarted) {
    return (
      <div className="h-full flex flex-col bg-slate-950 items-center justify-center gap-4 p-12 text-center">
        <Trophy className="text-slate-700" size={48} />
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Award Races</h2>
        <p className="text-slate-500 text-sm max-w-md">
          Award projections will be available once Liga Endesa and EuroLeague games are underway and players have built a real stat sample.
        </p>
      </div>
    );
  }

  const selectedRaces = competition === 'euroleague' ? euroleagueRaces : endesaRaces;
  const selectedTab = competition === 'euroleague' ? elTab : endesaTab;
  const selectedLabel = competition === 'euroleague'
    ? euroleagueLabels[elTab]
    : endesaLabels[endesaTab];
  const announced = seasonAwards.some(a => a.type === (competition === 'euroleague'
    ? STORED_TYPES.euroleague[elTab]
    : STORED_TYPES.endesa[endesaTab]));
  const phaseFinalized = competition === 'euroleague'
    ? competitionWindow.euroleague.regularSeasonAwardsFinalized
    : competitionWindow.endesa.regularSeasonAwardsFinalized;
  const finalized = announced || phaseFinalized;
  const viewTitle = forcedCompetition === 'euroleague'
    ? 'EuroLeague Awards'
    : forcedCompetition === 'endesa'
      ? 'Liga ACB Awards'
      : 'European Awards';
  const viewSubtitle = forcedCompetition === 'euroleague'
    ? 'Regular-season honors, coaching awards, and All-EuroLeague selections.'
    : forcedCompetition === 'endesa'
      ? 'Regular-season honors and Liga ACB award results.'
      : 'EuroLeague + Liga ACB award races and results.';

  // ─── Renderers ───────────────────────────────────────────────────────────

  const renderPlayerCards = (candidates: EuroAwardCandidate[]) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <AnimatePresence mode="wait">
        {candidates.map((c, idx) => {
          const isOwn = ownTid !== null && c.player.tid === ownTid;
          return (
            <div key={c.player.internalId} className={isOwn ? 'ring-2 ring-indigo-500/50 rounded-xl' : ''}>
              <RankedPersonCard
                rank={idx + 1}
                portraitUrl={c.player.imgURL}
                face={(c.player as any).face}
                name={c.player.name}
                badge={c.player.pos}
                subtitle={`${c.team.name} · ${c.team.wins}-${c.team.losses}`}
                teamLogoUrl={c.team.logoUrl}
                stats={[
                  { label: 'PTS', val: (c.stats.pts / c.stats.gp).toFixed(1) },
                  { label: 'REB', val: ((c.stats.trb || (c.stats as any).reb || (c.stats.orb || 0) + (c.stats.drb || 0)) / c.stats.gp).toFixed(1) },
                  { label: 'AST', val: (c.stats.ast / c.stats.gp).toFixed(1) },
                ]}
                odds={finalized ? undefined : c.odds}
                accentColor="indigo"
                animDelay={idx * 0.05}
                onClick={() => setViewingPlayer(c.player)}
              />
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  const renderCoaches = (candidates: EuroCoachCandidate[]) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {candidates.map((c, i) => (
        <RankedPersonCard
          key={`${c.coachName}-${c.team.id}`}
          rank={i + 1}
          name={c.coachName}
          subtitle={`${c.team.name} · ${c.wins}–${c.losses}`}
          teamLogoUrl={c.team.logoUrl}
          metaLine={{
            text: `${c.improvement > 0 ? `+${c.improvement}` : c.improvement < 0 ? `${c.improvement}` : '±0'} wins vs last season`,
            color: c.improvement > 0 ? 'text-emerald-400' : c.improvement < 0 ? 'text-red-400' : 'text-slate-500',
          }}
          odds={finalized ? undefined : c.odds}
          accentColor="teal"
          animDelay={i * 0.05}
        />
      ))}
    </div>
  );

  const renderAllELTeams = (teams: [EuroAllTeamSpot[], EuroAllTeamSpot[]]) => (
    <div>
      {teams.map((team, ti) => (
        <div key={ti} className="mb-6">
          <h4 className={`text-xs font-black uppercase tracking-[0.2em] mb-3 ${ti === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
            All-EuroLeague {ti === 0 ? 'First Team' : 'Second Team'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {team.map((spot, si) => {
              const isOwn = ownTid !== null && spot.player.tid === ownTid;
              return (
                <motion.div
                  key={spot.player.internalId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (ti * 5 + si) * 0.04 }}
                  onClick={() => setViewingPlayer(spot.player)}
                  className={`group flex items-center gap-3 border rounded-xl p-3 cursor-pointer transition-all ${
                    isOwn
                      ? 'bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/40'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-indigo-500/40'
                  }`}
                >
                  <PlayerPortrait
                    imgUrl={spot.player.imgURL}
                    face={(spot.player as any).face}
                    playerName={spot.player.name}
                    teamLogoUrl={spot.team.logoUrl}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-xs truncate group-hover:text-indigo-400 transition-colors">{spot.player.name}</p>
                    <p className="text-[10px] text-slate-500">{spot.pos} · {spot.team.abbrev}</p>
                  </div>
                  <StatPills
                    stats={[
                      { label: 'PTS', val: (spot.stats.pts / spot.stats.gp).toFixed(1) },
                      { label: 'REB', val: ((spot.stats.trb || (spot.stats as any).reb || (spot.stats.orb || 0) + (spot.stats.drb || 0)) / spot.stats.gp).toFixed(1) },
                      { label: 'AST', val: (spot.stats.ast / spot.stats.gp).toFixed(1) },
                    ]}
                    size="xs"
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const content = (() => {
    if (competition === 'euroleague') {
      if (elTab === 'allEL') return renderAllELTeams(euroleagueRaces.allEuroLeague);
      if (elTab === 'coy') return renderCoaches(euroleagueRaces.coy);
      return renderPlayerCards((euroleagueRaces as any)[elTab]);
    }
    if (endesaTab === 'bestCoach') return renderCoaches(endesaRaces.bestCoach);
    return renderPlayerCards((endesaRaces as any)[endesaTab]);
  })();

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-slate-900/50 border-b border-slate-800">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                <Trophy className="text-yellow-500" size={32} />
                {viewTitle}
              </h2>
              <p className="text-slate-400 text-sm mt-1">{viewSubtitle}</p>
            </div>

            {/* Competition toggle */}
            {!forcedCompetition && (
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-0.5">
                <button
                  onClick={() => setCompetition('euroleague')}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    competition === 'euroleague'
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  EuroLeague
                </button>
                <button
                  onClick={() => setCompetition('endesa')}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    competition === 'endesa'
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  Liga ACB
                </button>
              </div>
            )}
          </div>

          {/* Award tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar gap-0.5">
            {(competition === 'euroleague'
              ? Object.entries(euroleagueLabels)
              : Object.entries(endesaLabels)
            ).map(([key, info]) => {
              const isActive = competition === 'euroleague' ? elTab === key : endesaTab === key;
              return (
                <button
                  key={key}
                  onClick={() => competition === 'euroleague' ? setELTab(key as EuroleagueTab) : setEndesaTab(key as EndesaTab)}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  {(info as any).title}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
          <motion.div
            key={`${competition}-${selectedTab}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/20 flex items-center gap-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              {React.cloneElement(selectedLabel.icon, { size: 32 } as any)}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">{selectedLabel.title}</h3>
              <p className="text-slate-400">{selectedLabel.desc}</p>
            </div>
            <div className="ml-auto hidden md:flex flex-col items-end gap-1">
              <span className={`text-xs font-bold uppercase tracking-widest ${finalized ? 'text-amber-400' : 'text-indigo-400'}`}>
                {finalized ? 'Finalized' : 'Projection'}
              </span>
            </div>
          </motion.div>

          {content}

          <div className="mt-12 p-4 rounded-xl bg-slate-900/30 border border-slate-800/50 flex items-start gap-3">
            <Info size={18} className="text-slate-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              {finalized
                ? 'This board is no longer treated as a live race. Once the competition moves into play-in or playoffs, regular-season Euro awards lock to the finished result window.'
                : 'These are live regular-season projections built from individual production, team success, PIR, and award-specific voting signals.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
