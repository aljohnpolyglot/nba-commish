import React, { useState, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { AwardService, AwardCandidate, CoachCandidate, AllNBASpot } from '../../services/logic/AwardService';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, TrendingUp, Target, Zap, Star, ChevronRight, Info, Shield, Users, UserCheck } from 'lucide-react';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { NBAPlayer } from '../../types';

type AwardTab = 'mvp' | 'dpoy' | 'roty' | 'smoy' | 'mip' | 'coy' | 'allNBA';

export const AwardRacesView: React.FC = () => {
  const { state } = useGame();
  const [selectedAward, setSelectedAward] = useState<AwardTab>('mvp');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  const races = useMemo(() => {
    return AwardService.calculateAwardRaces(
      state.players, state.teams, state.leagueStats.year, state.staff
    );
  }, [state.players, state.teams, state.leagueStats.year, state.staff]);

  const awardLabels: Record<AwardTab, { title: string; icon: React.ReactElement; desc: string }> = {
    mvp:    { title: 'Most Valuable Player',         icon: <Star className="text-yellow-400" />,   desc: 'The best player in the league' },
    dpoy:   { title: 'Defensive Player of the Year', icon: <Target className="text-blue-400" />,   desc: 'The most impactful defender' },
    roty:   { title: 'Rookie of the Year',           icon: <Zap className="text-emerald-400" />,   desc: 'Top performing newcomer' },
    smoy:   { title: 'Sixth Man of the Year',        icon: <TrendingUp className="text-purple-400" />, desc: 'Best player off the bench' },
    mip:    { title: 'Most Improved Player',         icon: <Zap className="text-orange-400" />,    desc: 'Player with the biggest jump' },
    coy:    { title: 'Coach of the Year',            icon: <UserCheck className="text-teal-400" />, desc: 'Best coaching job this season' },
    allNBA: { title: 'All-NBA / All-Defense / All-Rookie', icon: <Users className="text-indigo-400" />, desc: '1st, 2nd & 3rd teams + Defense + Rookie' },
  };

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
            {team.map((spot, si) => (
              <motion.div
                key={spot.player.internalId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (ti * 5 + si) * 0.04 }}
                onClick={() => setViewingPlayer(spot.player)}
                className="group flex items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-3 cursor-pointer transition-all"
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
                </div>
                <div className="text-[10px] text-slate-500 font-mono text-right">
                  <div className="text-slate-300 font-bold">{(spot.stats.pts / spot.stats.gp).toFixed(1)}</div>
                  <div>PPG</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // ─── CoY renderer ─────────────────────────────────────────────────────────

  const CoYList = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {races.coy.map((c: CoachCandidate, i) => (
        <motion.div
          key={`${c.coachName}-${c.team.id}`}
          initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4"
        >
          <div className="w-8 text-center font-black text-slate-700 group-hover:text-teal-500 transition-colors">{i + 1}</div>
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            {c.team.logoUrl
              ? <img src={c.team.logoUrl} alt={c.team.abbrev} className="w-10 h-10 object-contain" />
              : <UserCheck size={24} className="text-slate-500" />}
          </div>
          <div className="flex-1">
            <p className="font-bold text-white">{c.coachName}</p>
            <p className="text-xs text-slate-500">{c.team.name} · {c.wins}–{c.losses}</p>
            <p className={`text-[10px] font-bold mt-1 ${c.improvement > 0 ? 'text-emerald-400' : c.improvement < 0 ? 'text-red-400' : 'text-slate-500'}`}>
              {c.improvement > 0 ? `+${c.improvement}` : c.improvement < 0 ? `${c.improvement}` : '±0'} wins vs last season
            </p>
          </div>
          <div className="text-right pr-2">
            <div className={`text-lg font-black tracking-tighter ${i === 0 ? 'text-teal-400' : 'text-white'}`}>{c.odds}</div>
            <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Odds</div>
          </div>
        </motion.div>
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
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Favorite</span>
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
                {(races[selectedAward] as AwardCandidate[]).map((candidate, index) => (
                  <motion.div
                    key={candidate.player.internalId}
                    initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => setViewingPlayer(candidate.player)}
                    className="group relative bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 transition-all cursor-pointer flex items-center gap-4"
                  >
                    <div className="w-8 text-center font-black text-slate-700 group-hover:text-indigo-500 transition-colors">
                      {index + 1}
                    </div>
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
                      <img
                        src={candidate.player.imgURL || `https://picsum.photos/seed/${candidate.player.name}/200/200`}
                        alt={candidate.player.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute bottom-0 right-0 w-6 h-6 bg-white rounded-tl-lg p-1">
                        <img src={candidate.team.logoUrl} alt={candidate.team.abbrev} className="w-full h-full object-contain" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white group-hover:text-indigo-400 transition-colors">{candidate.player.name}</h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                          {candidate.player.pos}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{candidate.team.name}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        <span>{candidate.team.wins}-{candidate.team.losses}</span>
                      </div>
                      <div className="flex gap-3 mt-2">
                        {[
                          { label: 'PTS', val: (candidate.stats.pts / candidate.stats.gp).toFixed(1) },
                          { label: 'REB', val: ((candidate.stats.trb || (candidate.stats as any).reb || (candidate.stats.orb || 0) + (candidate.stats.drb || 0)) / candidate.stats.gp).toFixed(1) },
                          { label: 'AST', val: (candidate.stats.ast / candidate.stats.gp).toFixed(1) },
                        ].map(({ label, val }) => (
                          <div key={label} className="text-[10px] uppercase tracking-tighter">
                            <span className="text-slate-500">{label}</span>
                            <div className="font-bold text-slate-300">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-right pr-2">
                      <div className={`text-lg font-black tracking-tighter ${index === 0 ? 'text-indigo-400' : 'text-white'}`}>
                        {candidate.odds}
                      </div>
                      <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Odds</div>
                    </div>
                    <ChevronRight size={16} className="text-slate-700 group-hover:text-indigo-500 transition-colors" />
                  </motion.div>
                ))}
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
