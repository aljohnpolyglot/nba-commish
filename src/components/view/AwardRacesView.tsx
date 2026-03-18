import React, { useState, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { AwardService, AwardCandidate } from '../../services/logic/AwardService';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, TrendingUp, User, Target, Zap, Star, ChevronRight, Info } from 'lucide-react';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { NBAPlayer } from '../../types';

export const AwardRacesView: React.FC = () => {
  const { state } = useGame();
  const [selectedAward, setSelectedAward] = useState<keyof ReturnType<typeof AwardService.calculateAwardRaces>>('mvp');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  const races = useMemo(() => {
    return AwardService.calculateAwardRaces(state.players, state.teams, state.leagueStats.year);
  }, [state.players, state.teams, state.leagueStats.year]);

  const awardLabels = {
    mvp: { title: 'Most Valuable Player', icon: <Star className="text-yellow-400" />, desc: 'The best player in the league' },
    dpoy: { title: 'Defensive Player of the Year', icon: <Target className="text-blue-400" />, desc: 'The most impactful defender' },
    roty: { title: 'Rookie of the Year', icon: <Zap className="text-emerald-400" />, desc: 'Top performing newcomer' },
    smoy: { title: 'Sixth Man of the Year', icon: <TrendingUp className="text-purple-400" />, desc: 'Best player off the bench' },
    mip: { title: 'Most Improved Player', icon: <Zap className="text-orange-400" />, desc: 'Player with the biggest jump' },
  };

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  const currentCandidates = races[selectedAward];

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
          
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
            {(Object.keys(awardLabels) as Array<keyof typeof awardLabels>).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedAward(key)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  selectedAward === key 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                }`}
              >
                {key}
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
              {React.cloneElement(awardLabels[selectedAward].icon as React.ReactElement, { size: 32 })}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">{awardLabels[selectedAward].title}</h3>
              <p className="text-slate-400">{awardLabels[selectedAward].desc}</p>
            </div>
            <div className="ml-auto hidden md:block">
              <div className="text-right">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Favorite</span>
                <div className="text-xl font-black text-white">{currentCandidates[0]?.player.name}</div>
              </div>
            </div>
          </motion.div>

          {/* Candidates Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence mode="wait">
              {currentCandidates.map((candidate, index) => (
                <motion.div
                  key={candidate.player.internalId}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setViewingPlayer(candidate.player)}
                  className="group relative bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 transition-all cursor-pointer flex items-center gap-4"
                >
                  {/* Rank */}
                  <div className="w-8 text-center font-black text-slate-700 group-hover:text-indigo-500 transition-colors">
                    {index + 1}
                  </div>

                  {/* Player Image */}
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

                  {/* Info */}
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
                    
                    {/* Mini Stats */}
                    <div className="flex gap-3 mt-2">
                      <div className="text-[10px] uppercase tracking-tighter">
                        <span className="text-slate-500">PTS</span>
                        <div className="font-bold text-slate-300">{(candidate.stats.pts / candidate.stats.gp).toFixed(1)}</div>
                      </div>
                      <div className="text-[10px] uppercase tracking-tighter">
                        <span className="text-slate-500">REB</span>
                        <div className="font-bold text-slate-300">{((candidate.stats.trb || (candidate.stats as any).reb || (candidate.stats.orb || 0) + (candidate.stats.drb || 0)) / candidate.stats.gp).toFixed(1)}</div>
                      </div>
                      <div className="text-[10px] uppercase tracking-tighter">
                        <span className="text-slate-500">AST</span>
                        <div className="font-bold text-slate-300">{(candidate.stats.ast / candidate.stats.gp).toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Odds Display */}
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

          {/* Disclaimer */}
          <div className="mt-12 p-4 rounded-xl bg-slate-900/30 border border-slate-800/50 flex items-start gap-3">
            <Info size={18} className="text-slate-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Odds are calculated based on a proprietary algorithm considering individual performance, team success, and historical award trends. 
              These are for simulation purposes only and do not represent real-world betting markets. 
              The leader is currently the heavy favorite based on current trajectory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
