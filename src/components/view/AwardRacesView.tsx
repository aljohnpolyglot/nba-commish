import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../store/GameContext';
import { useHubScope } from '../../hooks/useHubScope';
import { AwardService, AwardCandidate, CoachCandidate, AllNBASpot } from '../../services/logic/AwardService';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Trophy } from 'lucide-react';
import { NBAPlayer } from '../../types';
import { resolveHeadCoachMember } from '../../services/staff/coachNameResolver';
import { RankedPersonCard, StatPills } from '../shared/ui';
import { getOwnTeamId } from '../../utils/helpers';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { filterAwardsToVisibleTimeline } from '../../utils/awardHistory';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { ensureStaffPhotoData, resolveCoachPortrait } from '../../store/staffPhotoStore';
import { loadNbaEraPortraitCatalog } from '../../services/nbaEraPortraitCatalog';
import { computeRaces, resolveAwardsForState } from '../../services/awards/AwardEngine';
import { addGameDays } from '../../utils/dateUtils';
import { formatLeagueSeasonLabel, getLeagueCalendarDates } from '../../services/leagueCalendar';
import { getPlayerImage } from '../../utils/playerImage';
import { getExactStat, getTrb } from '../../services/logic/AwardServiceShared';
import { AwardTrophyArtwork, useAwardTrophyCatalog } from '../shared/AwardTrophyArtwork';
import { resolveAwardTrophyPhoto, type AwardTrophyNamespace } from '../../services/awards/awardTrophyPhotos';
import { nbaAwardRaceTrophy } from './awardRaceTrophyAssets';
import { getCalibratedPer } from '../../utils/advancedStatCalibration';

type AwardTab =
  | 'mvp' | 'dpoy' | 'roty' | 'smoy' | 'clutch' | 'mip' | 'coy' | 'allNBA'
  | 'ibm' | 'comeback' | 'ironman' | 'sidekick' | 'young' | 'playoffMvp'
  | 'lvp' | 'performance' | 'consistency' | 'sharpshooter' | 'twoWay';

const getDraftPickMeta = (player: NBAPlayer): string | null => {
  const draft = player.draft;
  if (!draft?.round || !draft?.pick) return null;
  return `Draft: R${draft.round}, Pick ${draft.pick}`;
};

export const AwardRacesView: React.FC = () => {
  const { state, navigateToPlayer } = useGame();
  const isFictional = state.leagueType === 'fictional';
  const ownTid = getOwnTeamId(state);
  const { teams: scopedTeams, players: scopedPlayers } = useHubScope();
  const [selectedAward, setSelectedAward] = useState<AwardTab>('mvp');
  const [staffPhotosReady, setStaffPhotosReady] = useState(false);
  const trophyNamespace: AwardTrophyNamespace | undefined = state.leagueType !== 'modded'
    ? undefined
    : state.leagueStats.uiMode === 'euro_isolated'
      ? 'euro'
      : state.leagueStats.uiMode === 'wnba_isolated'
        ? 'wnba'
        : state.leagueStats.uiMode === 'pba_isolated'
          ? undefined
          : state.moddedLeagueBase === 'nba' || state.moddedLeagueBase == null
            ? 'nba'
            : 'basketball';
  const trophyCatalog = useAwardTrophyCatalog(!!trophyNamespace);

  // Per-award "announced" flags — each award is announced on its own date
  const seasonAwards = filterAwardsToVisibleTimeline(state.historicalAwards ?? [], state.leagueStats.year)
    .filter(a => a.season === state.leagueStats.year);
  const announcedMap: Record<AwardTab, boolean> = {
    coy:    seasonAwards.some(a => a.type === 'COY'),
    smoy:   seasonAwards.some(a => a.type === 'SMOY'),
    clutch: seasonAwards.some(a => a.type === 'Clutch Player of the Year'),
    mip:    seasonAwards.some(a => a.type === 'MIP'),
    dpoy:   seasonAwards.some(a => a.type === 'DPOY'),
    roty:   seasonAwards.some(a => a.type === 'ROY'),
    allNBA: seasonAwards.some(a => a.type === 'All-NBA First Team' || a.type === 'All-League First Team'),
    mvp:    seasonAwards.some(a => a.type === 'MVP'),
    ibm: seasonAwards.some(a => a.type === 'IBM Award'),
    comeback: seasonAwards.some(a => a.type === 'Comeback Player of the Year'),
    ironman: seasonAwards.some(a => a.type === 'Ironman Award'),
    sidekick: seasonAwards.some(a => a.type === 'Sidekick of the Year'),
    young: seasonAwards.some(a => a.type === 'Young Player of the Year'),
    playoffMvp: seasonAwards.some(a => a.type === 'Playoff MVP'),
    lvp: seasonAwards.some(a => a.type === 'Least Valuable Player'),
    performance: seasonAwards.some(a => a.type === 'Performance of the Year'),
    consistency: seasonAwards.some(a => a.type === 'Mr. Consistency'),
    sharpshooter: seasonAwards.some(a => a.type === 'Sharpshooter of the Year'),
    twoWay: seasonAwards.some(a => a.type === 'Two-Way Player of the Year'),
  };
  const awardsAnnounced = announcedMap[selectedAward];

  useEffect(() => {
    const historicalNba = state.leagueType === 'modded'
      && (state.moddedLeagueBase ?? 'nba') === 'nba';
    void Promise.allSettled([
      ensureStaffPhotoData(),
      ...(historicalNba ? [loadNbaEraPortraitCatalog()] : []),
    ]).then(() => setStaffPhotosReady(true));
  }, [state.leagueType, state.moddedLeagueBase]);

  const races = useMemo(() => {
    const legacy = AwardService.calculateAwardRaces(
      scopedPlayers, scopedTeams, state.leagueStats.year, state.staff,
      state.leagueStats.minGamesRequirement, 10, state.leagueStats.uiMode
    );
    return {
      ...legacy,
      clutch: computeRaces(state as any, 'clutch-player') as AwardCandidate[],
      ibm: computeRaces(state as any, 'ibm-award') as AwardCandidate[],
      comeback: computeRaces(state as any, 'comeback-player') as AwardCandidate[],
      ironman: computeRaces(state as any, 'ironman-award') as AwardCandidate[],
      sidekick: computeRaces(state as any, 'sidekick-award') as AwardCandidate[],
      young: computeRaces(state as any, 'nba-young-player') as AwardCandidate[],
      playoffMvp: computeRaces(state as any, 'playoff-mvp') as AwardCandidate[],
      lvp: computeRaces(state as any, 'least-valuable-player') as AwardCandidate[],
      performance: computeRaces(state as any, 'performance-of-the-year') as AwardCandidate[],
      consistency: computeRaces(state as any, 'mr-consistency') as AwardCandidate[],
      sharpshooter: computeRaces(state as any, 'sharpshooter-of-the-year') as AwardCandidate[],
      twoWay: computeRaces(state as any, 'two-way-player-of-the-year') as AwardCandidate[],
    };
  }, [scopedPlayers, scopedTeams, state, state.leagueStats.year, state.staff, state.leagueStats.minGamesRequirement]);

  const awardLabels: Record<AwardTab, { title: string; desc: string }> = {
    mvp:    { title: 'Most Valuable Player',         desc: 'The best player in the league' },
    dpoy:   { title: 'Defensive Player of the Year', desc: 'The most impactful defender' },
    roty:   { title: 'Rookie of the Year',           desc: 'Top performing newcomer' },
    smoy:   { title: 'Sixth Man of the Year',        desc: 'Best player off the bench' },
    clutch: { title: 'Clutch Player of the Year',    desc: 'Best fourth-quarter performer' },
    mip:    { title: 'Most Improved Player',         desc: 'Player with the biggest jump' },
    coy:    { title: 'Coach of the Year',            desc: 'Best coaching job this season' },
    allNBA: { title: `${isFictional ? 'All-League' : 'All-NBA'} / All-Defense / All-Rookie`, desc: '1st, 2nd & 3rd teams + Defense + Rookie' },
    ibm: { title: 'IBM Award', desc: 'Best statistical contribution to team success' },
    comeback: { title: 'Comeback Player of the Year', desc: 'Strongest return after injury, absence or decline' },
    ironman: { title: 'Ironman Award', desc: 'Full-season availability with minutes as the tiebreaker' },
    sidekick: { title: 'Sidekick of the Year', desc: 'Best second option on a team' },
    young: { title: 'Young Player of the Year', desc: 'Best season by an age-23-or-younger player' },
    playoffMvp: { title: 'Playoff MVP', desc: 'Best performer across a deep postseason run' },
    lvp: { title: 'Least Valuable Player', desc: 'Lowest-impact regular rotation player above the eligibility cutoff' },
    performance: { title: 'Performance of the Year', desc: 'Best single-game performance, with a small boost for the biggest moments' },
    consistency: { title: 'Mr. Consistency', desc: 'Elite PER sustained across a full 65-game body of work' },
    sharpshooter: { title: 'Sharpshooter of the Year', desc: 'Elite three-point accuracy backed by real shooting volume' },
    twoWay: { title: 'Two-Way Player of the Year', desc: 'The strongest balance of offensive production and defensive impact' },
  };

  const selectedTrophy = trophyNamespace ? resolveAwardTrophyPhoto(trophyCatalog, {
    awardType: awardLabels[selectedAward].title,
    namespace: trophyNamespace,
  }) : undefined;

  const enabledAwards = new Map(resolveAwardsForState(state as any).map(award => [award.id, award.enabled]));
  const tabAwardIds: Record<AwardTab, string[]> = {
    mvp: ['mvp'], dpoy: ['dpoy'], roty: ['roy'], smoy: ['smoy'], clutch: ['clutch-player'],
    mip: ['mip'], coy: ['coy'], allNBA: ['all-league', 'all-defensive', 'all-rookie'],
    ibm: ['ibm-award'], comeback: ['comeback-player'], ironman: ['ironman-award'],
    sidekick: ['sidekick-award'], young: ['nba-young-player'], playoffMvp: ['playoff-mvp'],
    lvp: ['least-valuable-player'], performance: ['performance-of-the-year'], consistency: ['mr-consistency'],
    sharpshooter: ['sharpshooter-of-the-year'], twoWay: ['two-way-player-of-the-year'],
  };
  const visibleAwardTabs = (Object.keys(awardLabels) as AwardTab[])
    .filter(tab => tabAwardIds[tab].some(id => enabledAwards.get(id)))
    .filter(tab => tab !== 'playoffMvp' || races.playoffMvp.length > 0 || announcedMap.playoffMvp);

  useEffect(() => {
    if (!visibleAwardTabs.includes(selectedAward) && visibleAwardTabs[0]) setSelectedAward(visibleAwardTabs[0]);
  }, [selectedAward, visibleAwardTabs.join('|')]);

  // Don't show award projections before the season starts (0 games played)
  const totalGP = scopedTeams.reduce((sum, t) => sum + (t.wins ?? 0) + (t.losses ?? 0), 0);
  const seasonNotStarted = totalGP === 0;

  if (visibleAwardTabs.length === 0) {
    return (
      <div className="h-full flex flex-col bg-slate-950 items-center justify-center gap-4 p-12 text-center">
        <Trophy className="text-slate-700" size={48} />
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Awards Disabled</h2>
        <p className="text-slate-500 text-sm max-w-md">The Commissioner has not enabled any league awards for this season.</p>
      </div>
    );
  }

  // ─── All-NBA team renderer ─────────────────────────────────────────────────

  const renderAllNBASection = ({ label, color, teams, defensive = false, rookie = false }: { label: string; color: string; teams: AllNBASpot[][]; defensive?: boolean; rookie?: boolean }) => (
    <div className="mb-8">
      <h4 className={`text-xs font-black uppercase tracking-[0.2em] mb-3 ${color}`}>{label}</h4>
      {teams.map((team, ti) => (
        <div key={ti} className="mb-4">
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-2">
            {ti === 0 ? '1st Team' : ti === 1 ? '2nd Team' : '3rd Team'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {team.map((spot, si) => {
              const isOwn = ownTid !== null && spot.player.tid === ownTid;
              const teamSnapshot = getHistoricalTeamSnapshot(spot.team, state.leagueStats.year);
              return (
              <motion.div
                key={spot.player.internalId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (ti * 5 + si) * 0.04 }}
                onClick={() => navigateToPlayer(spot.player)}
                className={`group flex items-center gap-3 border rounded-xl p-3 cursor-pointer transition-all ${
                  isOwn
                    ? 'bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/40 hover:border-indigo-500/60'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-indigo-500/40'
                }`}
              >
                <PlayerPortrait
                  imgUrl={getPlayerImage(spot.player)}
                  face={(spot.player as any).face}
                  playerName={spot.player.name}
                  teamLogoUrl={teamSnapshot.logoUrl}
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-xs truncate group-hover:text-indigo-400 transition-colors"><PlayerNameWithHover player={spot.player}>{spot.player.name}</PlayerNameWithHover></p>
                  <p className="text-[10px] text-slate-500">{spot.pos} · {teamSnapshot.abbrev}</p>
                  <p className="text-[10px] text-slate-600">{spot.team.wins}–{spot.team.losses}</p>
                  {rookie && <p className="text-[10px] font-bold text-emerald-400/80">{getDraftPickMeta(spot.player) ?? 'Draft: Undrafted'}</p>}
                </div>
                <StatPills
                  stats={[
                    ...(defensive ? [
                      { label: 'STL', val: (spot.stats.stl / spot.stats.gp).toFixed(1) },
                      { label: 'BLK', val: (spot.stats.blk / spot.stats.gp).toFixed(1) },
                      { label: 'DRtg', val: Number(spot.stats.drtg) > 0 ? Number(spot.stats.drtg).toFixed(1) : '—' },
                    ] : [
                      { label: 'PPG', val: (spot.stats.pts / spot.stats.gp).toFixed(1) },
                      { label: 'RPG', val: (getTrb(spot.stats) / spot.stats.gp).toFixed(1) },
                      { label: 'APG', val: (spot.stats.ast / spot.stats.gp).toFixed(1) },
                    ]),
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

  // ─── CoY renderer ─────────────────────────────────────────────────────────

  const renderCoYList = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {races.coy.map((c: CoachCandidate, i) => {
        const teamSnapshot = getHistoricalTeamSnapshot(c.team, state.leagueStats.year);
        const headCoachMember = resolveHeadCoachMember(c.team, state.staff);
        const portraitUrl = resolveCoachPortrait(
          c.coachName,
          staffPhotosReady ? headCoachMember?.playerPortraitUrl : undefined,
        );
        const isWinner = awardsAnnounced && i === 0;
        return (
          <RankedPersonCard
            key={`${c.coachName}-${c.team.id}`}
            rank={i + 1}
            portraitUrl={portraitUrl}
            disableNameFallback
            name={c.coachName}
            subtitle={`${getTeamFullName(teamSnapshot)} · ${c.wins}–${c.losses}`}
            teamLogoUrl={teamSnapshot.logoUrl}
            odds={c.odds}
            accentColor={isWinner ? 'amber' : 'teal'}
            animDelay={i * 0.05}
            className={isWinner ? '!border-amber-400/80 !bg-amber-500/10 ring-1 ring-amber-300/30 shadow-[0_10px_32px_rgba(245,158,11,0.24)]' : ''}
          />
        );
      })}
    </div>
  );

  // ─── Award dates (informational bar) ──────────────────────────────────────

  const awardCalendar = getLeagueCalendarDates(state.leagueStats.year, state.leagueStats);
  const compactDate = (date: Date) => date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const awardDate = (offset: number) => compactDate(addGameDays(awardCalendar.regularSeasonEnd, offset));
  const AWARD_DATES: Record<string, string> = {
    coy: awardDate(7),
    smoy: awardDate(10),
    clutch: awardDate(11),
    mip: awardDate(13),
    dpoy: awardDate(16),
    roty: awardDate(20),
    allNBA: awardDate(25),
    mvp: awardDate(39),
    ibm: awardDate(38),
    comeback: awardDate(36),
    ironman: awardDate(31),
    sidekick: awardDate(34),
    young: awardDate(29),
    playoffMvp: compactDate(addGameDays(awardCalendar.rollover, -6)),
    lvp: awardDate(28),
    performance: awardDate(29),
    consistency: awardDate(30),
    sharpshooter: awardDate(31),
    twoWay: awardDate(32),
  };

  if (seasonNotStarted) {
    return (
      <div className="h-full flex flex-col bg-slate-950 items-center justify-center gap-4 p-12 text-center">
        <Trophy className="text-slate-700" size={48} />
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Award Races</h2>
        <p className="text-slate-500 text-sm max-w-md">Award projections will be available once the {formatLeagueSeasonLabel(state.leagueStats.year, state.leagueStats)} regular season begins and players accumulate stats.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-slate-900/50 border-b border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <Trophy className="text-yellow-500" size={32} />
              Award Races & Odds
            </h2>
            <p className="text-slate-400 text-sm mt-1">Live betting-style odds for the league's top honors</p>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar gap-0.5">
            {visibleAwardTabs.map((key) => (
              <button
                key={key}
                onClick={() => setSelectedAward(key)}
                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex flex-col items-center gap-0.5 ${
                  selectedAward === key
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                }`}
              >
                <span>{key.toUpperCase()}</span>
                <span className={`text-[8px] font-bold ${selectedAward === key ? 'text-indigo-200' : 'text-slate-700'}`}>
                  {AWARD_DATES[key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
          {/* Award Info Card */}
          <motion.div
            key={selectedAward}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/20 flex items-center gap-6"
          >
            <AwardTrophyArtwork
              src={selectedTrophy?.trophy}
              alt={`${awardLabels[selectedAward].title} trophy`}
              className="h-20 w-16 shrink-0"
              fallback={isFictional
                ? <img src={nbaAwardRaceTrophy(selectedAward)} alt="" className="h-full w-full object-contain" />
                : null}
            />
            <div>
              <h3 className="text-2xl font-bold text-white">{awardLabels[selectedAward].title}</h3>
              <p className="text-slate-400">{awardLabels[selectedAward].desc}</p>
            </div>
            {selectedAward !== 'allNBA' && (
              <div className="ml-auto hidden md:block text-right">
                <span className={`text-xs font-bold uppercase tracking-widest ${awardsAnnounced ? 'text-amber-400' : 'text-indigo-400'}`}>
                  {awardsAnnounced ? 'Winner' : 'Projected Winner'}
                </span>
                <div className="text-xl font-black text-white">
                  {selectedAward === 'coy'
                    ? races.coy[0]?.coachName
                    : (races[selectedAward as Exclude<typeof selectedAward, 'coy' | 'allNBA'>] as AwardCandidate[])[0]?.player?.name}
                </div>
              </div>
            )}
            <div className="ml-auto hidden md:flex flex-col items-end gap-1">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Announced</span>
              <span className="text-lg font-black text-slate-300">{AWARD_DATES[selectedAward]}</span>
            </div>
          </motion.div>

          {/* Content depends on tab type */}
          {selectedAward === 'allNBA' ? (
            <div>
              {enabledAwards.get('all-league') && renderAllNBASection({ label: isFictional ? 'All-League Teams' : 'All-NBA Teams', color: 'text-yellow-400', teams: [...races.allNBATeams.allNBA] })}
              {enabledAwards.get('all-defensive') && renderAllNBASection({ label: 'All-Defensive Teams', color: 'text-blue-400', teams: [...races.allNBATeams.allDefense], defensive: true })}
              {enabledAwards.get('all-rookie') && renderAllNBASection({ label: 'All-Rookie Teams', color: 'text-emerald-400', teams: [...races.allNBATeams.allRookie], rookie: true })}
            </div>
          ) : selectedAward === 'coy' ? (
            renderCoYList()
          ) : selectedAward === 'performance' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AnimatePresence mode="wait">
                {(races.performance as any[]).map((candidate, index) => {
                  const game = candidate.game;
                  const teamSnapshot = getHistoricalTeamSnapshot(candidate.team, state.leagueStats.year);
                  const opponentSnapshot = getHistoricalTeamSnapshot(game.opponent, state.leagueStats.year);
                  const context = [
                    game.isPlayoff ? 'Playoffs' : null,
                    game.isEliminationGame ? 'Elimination game' : null,
                    game.isGameWinner ? 'Game-winner' : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <div key={`${candidate.player.internalId}-${game.gameId}`} data-testid="performance-award-candidate">
                      <RankedPersonCard
                        rank={index + 1}
                        portraitUrl={getPlayerImage(candidate.player)}
                        face={candidate.player.face}
                        name={candidate.player.name}
                        nameContent={<PlayerNameWithHover player={candidate.player}>{candidate.player.name}</PlayerNameWithHover>}
                        badge={candidate.player.pos}
                        subtitle={`${getTeamFullName(teamSnapshot)} · ${game.won ? 'W' : 'L'} vs ${getTeamFullName(opponentSnapshot)} · ${new Date(`${game.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`}
                        teamLogoUrl={teamSnapshot.logoUrl}
                        stats={[
                          { label: 'PTS', val: String(game.stats.pts) },
                          { label: 'REB', val: String(game.stats.reb) },
                          { label: 'AST', val: String(game.stats.ast) },
                          { label: 'Game Score', val: Number(game.stats.gameScore).toFixed(1) },
                        ]}
                        odds={candidate.odds}
                        accentColor="amber"
                        metaLine={context ? { text: context, color: 'text-amber-400/80' } : undefined}
                        animDelay={index * 0.05}
                        onClick={() => navigateToPlayer(candidate.player)}
                      />
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AnimatePresence mode="wait">
                {(races[selectedAward] as AwardCandidate[]).map((candidate, index) => {
                  const isOwn = ownTid !== null && candidate.player.tid === ownTid;
                  const isWinner = awardsAnnounced && index === 0;
                  const teamSnapshot = getHistoricalTeamSnapshot(candidate.team, state.leagueStats.year);
                  const previousStat = selectedAward === 'mip'
                    ? getExactStat(candidate.player.stats, state.leagueStats.year - 1)
                    : undefined;
                  const previousGp = previousStat?.gp || 1;
                  return (
                  <div
                    key={candidate.player.internalId}
                    className={isOwn && !isWinner ? 'ring-2 ring-indigo-500/50 rounded-xl' : ''}
                  >
                    <RankedPersonCard
                      rank={index + 1}
                      portraitUrl={getPlayerImage(candidate.player)}
                      face={(candidate.player as any).face}
                      name={candidate.player.name}
                      nameContent={<PlayerNameWithHover player={candidate.player}>{candidate.player.name}</PlayerNameWithHover>}
                      badge={candidate.player.pos}
                      subtitle={`${getTeamFullName(teamSnapshot)} · ${candidate.team.wins}-${candidate.team.losses}`}
                      teamLogoUrl={teamSnapshot.logoUrl}
                      stats={selectedAward === 'dpoy' || selectedAward === 'twoWay' ? [
                        { label: 'STL', val: (candidate.stats.stl / candidate.stats.gp).toFixed(1) },
                        { label: 'BLK', val: (candidate.stats.blk / candidate.stats.gp).toFixed(1) },
                        { label: 'DRtg', val: Number(candidate.stats.drtg) > 0 ? Number(candidate.stats.drtg).toFixed(1) : '—' },
                        ...(selectedAward === 'twoWay' ? [{ label: 'PTS', val: (candidate.stats.pts / candidate.stats.gp).toFixed(1) }] : []),
                      ] : selectedAward === 'lvp' || selectedAward === 'consistency' ? [
                        { label: 'PER', val: getCalibratedPer(candidate.stats).toFixed(1) },
                        { label: 'GP', val: String(candidate.stats.gp) },
                        { label: 'MPG', val: (candidate.stats.min / candidate.stats.gp).toFixed(1) },
                      ] : selectedAward === 'sharpshooter' ? [
                        { label: '3P%', val: `${(Number(candidate.stats.tpp ?? 0) * (Number(candidate.stats.tpp ?? 0) > 1 ? 1 : 100)).toFixed(1)}%` },
                        { label: '3PM', val: (candidate.stats.tp / candidate.stats.gp).toFixed(1) },
                        { label: '3PA', val: (candidate.stats.tpa / candidate.stats.gp).toFixed(1) },
                      ] : [
                        { label: selectedAward === 'clutch' ? 'Q4 PPG' : 'PTS', val: selectedAward === 'clutch' ? (((candidate.stats as any).q4Pts ?? 0) / candidate.stats.gp).toFixed(1) : (candidate.stats.pts / candidate.stats.gp).toFixed(1) },
                        { label: selectedAward === 'clutch' ? 'Q4 REB' : 'REB', val: selectedAward === 'clutch' ? (((candidate.stats as any).q4Reb ?? 0) / candidate.stats.gp).toFixed(1) : ((candidate.stats.trb || (candidate.stats as any).reb || (candidate.stats.orb || 0) + (candidate.stats.drb || 0)) / candidate.stats.gp).toFixed(1) },
                        { label: selectedAward === 'clutch' ? 'Q4 AST' : 'AST', val: selectedAward === 'clutch' ? (((candidate.stats as any).q4Ast ?? 0) / candidate.stats.gp).toFixed(1) : (candidate.stats.ast / candidate.stats.gp).toFixed(1) },
                        ...(selectedAward === 'clutch' ? [{ label: 'GW', val: String((candidate.stats as any).gameWinners ?? 0) }] : []),
                      ]}
                      odds={candidate.odds}
                      accentColor={isWinner ? 'amber' : 'indigo'}
                      className={isWinner ? '!border-amber-400/80 !bg-amber-500/10 ring-1 ring-amber-300/30 shadow-[0_10px_32px_rgba(245,158,11,0.24)]' : ''}
                      metaLine={selectedAward === 'roty'
                        ? { text: getDraftPickMeta(candidate.player) ?? 'Draft: Undrafted', color: 'text-emerald-400/80' }
                        : selectedAward === 'mip' && previousStat
                          ? {
                            text: `Last season · ${(previousStat.pts / previousGp).toFixed(1)} PTS · ${(getTrb(previousStat) / previousGp).toFixed(1)} REB · ${(previousStat.ast / previousGp).toFixed(1)} AST`,
                            color: 'text-emerald-400/80',
                          }
                        : undefined}
                      animDelay={index * 0.05}
                      onClick={() => navigateToPlayer(candidate.player)}
                    />
                  </div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-12 p-4 rounded-xl bg-slate-900/30 border border-slate-800/50 flex items-start gap-3">
            <Info size={18} className="text-slate-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Projections update as the season progresses. Award announcement dates shown are approximate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
