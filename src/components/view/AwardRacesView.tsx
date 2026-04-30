import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../store/GameContext';
import { AwardService, AwardCandidate, CoachCandidate, AllNBASpot } from '../../services/logic/AwardService';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, TrendingUp, Target, Zap, Star, Info, Users, UserCheck } from 'lucide-react';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { NBAPlayer } from '../../types';
import { fetchCoachData, getCoachPhoto } from '../../data/photos/coaches';
import { RankedPersonCard, StatPills } from '../shared/ui';
import { getOwnTeamId } from '../../utils/helpers';

type AwardTab = 'mvp' | 'dpoy' | 'roty' | 'smoy' | 'mip' | 'coy' | 'allNBA';

export const AwardRacesView: React.FC = () => {
  const { state } = useGame();
  const ownTid = getOwnTeamId(state);
  const [selectedAward, setSelectedAward] = useState<AwardTab>('mvp');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [coachPhotosLoaded, setCoachPhotosLoaded] = useState(false);

  // Per-award "announced" flags — each award is announced on its own date
  const seasonAwards = (state.historicalAwards ?? []).filter(a => a.season === state.leagueStats.year);
  const announcedMap: Record<AwardTab, boolean> = {
    coy:    seasonAwards.some(a => a.type === 'COY'),
    smoy:   seasonAwards.some(a => a.type === 'SMOY'),
    mip:    seasonAwards.some(a => a.type === 'MIP'),
    dpoy:   seasonAwards.some(a => a.type === 'DPOY'),
    roty:   seasonAwards.some(a => a.type === 'ROY'),
    allNBA: seasonAwards.some(a => a.type === 'All-NBA First Team'),
    mvp:    seasonAwards.some(a => a.type === 'MVP'),
  };
  const awardsAnnounced = announcedMap[selectedAward];

  useEffect(() => {
    fetchCoachData().then(() => setCoachPhotosLoaded(true));
  }, []);

  const races = useMemo(() => {
    return AwardService.calculateAwardRaces(
      state.players, state.teams, state.leagueStats.year, state.staff,
      state.leagueStats.minGamesRequirement
    );
  }, [state.players, state.teams, state.leagueStats.year, state.staff, state.leagueStats.minGamesRequirement]);

  const awardLabels: Record<AwardTab, { title: string; icon: React.ReactElement; desc: string }> = {
    mvp:    { title: 'Most Valuable Player',         icon: <Star className="text-yellow-400" />,   desc: 'The best player in the league' },
    dpoy:   { title: 'Defensive Player of the Year', icon: <Target className="text-blue-400" />,   desc: 'The most impactful defender' },
    roty:   { title: 'Rookie of the Year',           icon: <Zap className="text-emerald-400" />,   desc: 'Top performing newcomer' },
    smoy:   { title: 'Sixth Man of the Year',        icon: <TrendingUp className="text-purple-400" />, desc: 'Best player off the bench' },
    mip:    { title: 'Most Improved Player',         icon: <Zap className="text-orange-400" />,    desc: 'Player with the biggest jump' },
    coy:    { title: 'Coach of the Year',            icon: <UserCheck className="text-teal-400" />, desc: 'Best coaching job this season' },
    allNBA: { title: 'All-NBA / All-Defense / All-Rookie', icon: <Users className="text-indigo-400" />, desc: '1st, 2nd & 3rd teams + Defense + Rookie' },
  };

  // Don't show award projections before the season starts (0 games played)
  const totalGP = state.teams.reduce((sum, t) => sum + (t.wins ?? 0) + (t.losses ?? 0), 0);
  const seasonNotStarted = totalGP === 0;

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  // ─── All-NBA team renderer ─────────────────────────────────────────────────

  const AllNBASection: React.FC<{ label: string; color: string; teams: AllNBASpot[][] }> = ({ label, color, teams }) => (
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
              return (
              <motion.div
                key={spot.player.internalId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (ti * 5 + si) * 0.04 }}
                onClick={() => setViewingPlayer(spot.player)}
                className={`group flex items-center gap-3 border rounded-xl p-3 cursor-pointer transition-all ${
                  isOwn
                    ? 'bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/40 hover:border-indigo-500/60'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-indigo-500/40'
                }`}
              >
                <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                  <img
                    src={spot.player.imgURL || `https://picsum.photos/seed/${spot.player.name}/80/80`}
                    alt={spot.player.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-white rounded-tl-md p-0.5">
                    <img src={spot.team.logoUrl} alt="" className="w-full h-full object-contain" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-xs truncate group-hover:text-indigo-400 transition-colors">{spot.player.name}</p>
                  <p className="text-[10px] text-slate-500">{spot.pos} · {spot.team.abbrev}</p>
                  <p className="text-[10px] text-slate-600">{spot.team.wins}–{spot.team.losses}</p>
                </div>
                <StatPills
                  stats={[
                    { label: 'PPG', val: (spot.stats.pts / spot.stats.gp).toFixed(1) },
                    { label: 'RPG', val: ((spot.stats.trb || (spot.stats.orb || 0) + (spot.stats.drb || 0)) / spot.stats.gp).toFixed(1) },
                    { label: 'APG', val: (spot.stats.ast / spot.stats.gp).toFixed(1) },
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

  const CoYList = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {races.coy.map((c: CoachCandidate, i) => (
        <RankedPersonCard
          key={`${c.coachName}-${c.team.id}`}
          rank={i + 1}
          portraitUrl={getCoachPhoto(c.coachName) || undefined}
          name={c.coachName}
          subtitle={`${c.team.name} · ${c.wins}–${c.losses}`}
          teamLogoUrl={c.team.logoUrl}
          metaLine={{
            text: `${c.improvement > 0 ? `+${c.improvement}` : c.improvement < 0 ? `${c.improvement}` : '±0'} wins vs last season`,
            color: c.improvement > 0 ? 'text-emerald-400' : c.improvement < 0 ? 'text-red-400' : 'text-slate-500',
          }}
          odds={c.odds}
          accentColor="teal"
          animDelay={i * 0.05}
        />
      ))}
    </div>
  );

  // ─── Award dates (informational bar) ──────────────────────────────────────

  const AWARD_DATES: Record<string, string> = {
    coy:    'Apr 19',
    smoy:   'Apr 22',
    mip:    'Apr 25',
    dpoy:   'Apr 28',
    roty:   'May  2',
    allNBA: 'May  7',
    mvp:    'May 21',
  };

  if (seasonNotStarted) {
    return (
      <div className="h-full flex flex-col bg-slate-950 items-center justify-center gap-4 p-12 text-center">
        <Trophy className="text-slate-700" size={48} />
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Award Races</h2>
        <p className="text-slate-500 text-sm max-w-md">Award projections will be available once the {state.leagueStats.year - 1}-{String(state.leagueStats.year).slice(-2)} regular season begins and players accumulate stats.</p>
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
            {(Object.keys(awardLabels) as AwardTab[]).map((key) => (
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
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              {React.cloneElement(awardLabels[selectedAward].icon, { size: 32 } as any)}
            </div>
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
                    : (races[selectedAward as Exclude<typeof selectedAward, 'coy' | 'allNBA'>] as AwardCandidate[])[0]?.player.name}
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
              <AllNBASection
                label="All-NBA Teams"
                color="text-yellow-400"
                teams={[...races.allNBATeams.allNBA]}
              />
              <AllNBASection
                label="All-Defensive Teams"
                color="text-blue-400"
                teams={[...races.allNBATeams.allDefense]}
              />
              <AllNBASection
                label="All-Rookie Teams"
                color="text-emerald-400"
                teams={[...races.allNBATeams.allRookie]}
              />
            </div>
          ) : selectedAward === 'coy' ? (
            <CoYList />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AnimatePresence mode="wait">
                {(races[selectedAward] as AwardCandidate[]).map((candidate, index) => {
                  const isOwn = ownTid !== null && candidate.player.tid === ownTid;
                  return (
                  <div
                    key={candidate.player.internalId}
                    className={isOwn ? 'ring-2 ring-indigo-500/50 rounded-xl' : ''}
                  >
                    <RankedPersonCard
                      rank={index + 1}
                      portraitUrl={candidate.player.imgURL || `https://picsum.photos/seed/${candidate.player.name}/200/200`}
                      name={candidate.player.name}
                      badge={candidate.player.pos}
                      subtitle={`${candidate.team.name} · ${candidate.team.wins}-${candidate.team.losses}`}
                      teamLogoUrl={candidate.team.logoUrl}
                      stats={[
                        { label: 'PTS', val: (candidate.stats.pts / candidate.stats.gp).toFixed(1) },
                        { label: 'REB', val: ((candidate.stats.trb || (candidate.stats as any).reb || (candidate.stats.orb || 0) + (candidate.stats.drb || 0)) / candidate.stats.gp).toFixed(1) },
                        { label: 'AST', val: (candidate.stats.ast / candidate.stats.gp).toFixed(1) },
                      ]}
                      odds={candidate.odds}
                      accentColor="indigo"
                      animDelay={index * 0.05}
                      onClick={() => setViewingPlayer(candidate.player)}
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
              Odds are calculated based on a proprietary algorithm considering individual performance, team success, and historical award trends.
              Award announcement dates shown are approximate. These are for simulation purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
