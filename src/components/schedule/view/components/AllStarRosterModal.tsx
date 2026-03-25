import React from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { NBAPlayer } from '../../../../types';
import { getPlayerHeadshot, convertTo2KRating } from '../../../../utils/helpers';

const EAST_LOGO_URL = 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748';
const WEST_LOGO_URL = 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726';

interface AllStarRosterModalProps {
  tab: string;
  allStar: any;
  state: any;
  onClose: () => void;
  onGoToAllStar: () => void;
}

export const AllStarRosterModal: React.FC<AllStarRosterModalProps> = ({ tab, allStar, state, onClose, onGoToAllStar }) => {
  
  return (
    <div className="fixed inset-0 z-[200] flex 
                    items-center justify-center 
                    p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#111] border border-white/10 
                   rounded-[32px] w-full max-w-2xl 
                   max-h-[80vh] flex flex-col 
                   shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between 
                        p-6 border-b border-white/10 
                        shrink-0">
          <h3 className="text-xl font-black text-white 
                         uppercase tracking-tight">
            {tab === 'rising-stars' 
              ? 'Rising Stars Rosters'
              : tab === 'celebrity'
                ? 'Celebrity Game Rosters'
                : tab === 'all-star'
                  ? 'All-Star Rosters'
                  : 'Rosters'}
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToAllStar}
              className="text-xs text-indigo-400 
                         hover:text-indigo-300 
                         font-bold uppercase 
                         tracking-widest 
                         transition-colors"
            >
              Full Details ↗
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full 
                         hover:bg-white/10 
                         text-slate-400 
                         hover:text-white 
                         transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto p-6 
                        custom-scrollbar">
          
          {tab === 'rising-stars' && (() => {
            const roster = allStar?.risingStarsRoster ?? [];
            const teams = allStar?.risingStarsTeams ?? 
              ['Team USA', 'Team World'];
            const rookies = roster.filter(
              (p: any) => p.isRookie
            );
            const sophs = roster.filter(
              (p: any) => !p.isRookie
            );
            return (
              <div className="grid grid-cols-2 gap-6">
                {[
                  { label: teams[0], players: sophs, subtitle: 'Sophomores' },
                  { label: teams[1], players: rookies, subtitle: 'Rookies' },
                ].map(({ label, players, subtitle }) => (
                  <div key={label}>
                    <div className="flex flex-col mb-3 pb-2 border-b border-sky-900/30">
                      <div className="text-xs font-black text-white uppercase tracking-widest">
                        {label}
                      </div>
                      <div className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">
                        {subtitle}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {players.map((p: any) => (
                        <div key={p.playerId}
                             className="flex items-center 
                                        gap-3 p-2 
                                        rounded-xl 
                                        bg-slate-900/50">
                          <img
                            src={getPlayerHeadshot(p.playerId, p.nbaId)}
                            className="w-8 h-8 rounded-full 
                                       object-cover bg-slate-800"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(p.playerName)}&background=0369a1&color=fff`;
                            }}
                            referrerPolicy="no-referrer"
                            alt={p.playerName}
                          />
                          <div>
                            <div className="text-sm font-bold 
                                            text-white">
                              {p.playerName}
                            </div>
                            <div className="text-xs 
                                            text-slate-500">
                              {p.teamAbbrev} · {p.position}
                            </div>
                          </div>
                          {(() => {
                            const fullPlayer = state.players.find(
                              (np: NBAPlayer) => np.internalId === p.playerId
                            );
                            const rating = fullPlayer
                              ? convertTo2KRating(
                                  fullPlayer.overallRating,
                                  fullPlayer.hgt || 77
                                )
                              : null;
                            return rating ? (
                              <div className={`text-sm font-black font-mono shrink-0 ml-auto ${rating >= 90 ? 'text-amber-400' : rating >= 80 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {rating}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
          
          {tab === 'celebrity' && (() => {
            const roster = allStar?.celebrityRoster || 
              state.leagueStats?.celebrityRoster || [];
            const teams = allStar?.celebrityTeams ?? 
              ['Team 1', 'Team 2'];
            const team1 = roster.slice(0, 10);
            const team2 = roster.slice(10, 20);
            return (
              <div className="grid grid-cols-2 gap-6">
                {[
                  { label: teams[0], players: team1 },
                  { label: teams[1], players: team2 },
                ].map(({ label, players }) => (
                  <div key={label}>
                    <div className="text-xs font-black 
                                    text-fuchsia-400 
                                    uppercase tracking-widest 
                                    mb-3 pb-2 
                                    border-b border-fuchsia-900/30">
                      {label}
                    </div>
                    <div className="space-y-2">
                      {players.map((name: string, i: number) => (
                        <div key={i}
                             className="flex items-center 
                                        gap-3 p-2 rounded-xl 
                                        bg-slate-900/50">
                          <div className="w-8 h-8 rounded-full 
                                          bg-fuchsia-900/40 
                                          flex items-center 
                                          justify-center 
                                          text-xs font-bold 
                                          text-fuchsia-400">
                            {name.charAt(0)}
                          </div>
                          <span className="text-sm font-bold 
                                           text-white">
                            {name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
          
          {tab === 'all-star' && (() => {
            const roster = allStar?.roster ?? [];
            const east = roster.filter((p: any) => p.conference === 'East');
            const west = roster.filter((p: any) => p.conference === 'West');
            
            const renderConferenceRoster = (label: string, players: any[], logo: string) => {
              const starters = players.filter(p => p.isStarter);
              const reserves = players.filter(p => !p.isStarter);

              return (
                <div key={label}>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                    <img src={logo} className="w-5 h-5 object-contain" alt={label} />
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      {label}
                    </span>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Starters */}
                    <div>
                      <div className="text-[9px] font-black text-amber-500/60 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <span className="text-xs">★</span> Starters (Fan Vote)
                      </div>
                      <div className="space-y-2">
                        {starters.map((p: any) => (
                          <div key={p.playerId} className="flex items-center gap-3 p-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                            <img
                              src={`https://cdn.nba.com/headshots/nba/latest/260x190/${p.nbaId || p.playerId}.png`}
                              className="w-8 h-8 rounded-full object-cover bg-slate-800 border border-amber-500/20"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.playerName)}&background=D97706&color=fff`;
                              }}
                              referrerPolicy="no-referrer"
                              alt={p.playerName}
                            />
                            <div>
                              <div className="text-sm font-bold text-white">{p.playerName}</div>
                              <div className="text-xs text-slate-500">{p.teamAbbrev}</div>
                            </div>
                            {(() => {
                              const fullPlayer = state.players.find((np: NBAPlayer) => np.internalId === p.playerId);
                              const rating = fullPlayer ? convertTo2KRating(fullPlayer.overallRating, fullPlayer.ratings?.[fullPlayer.ratings.length - 1]?.hgt ?? 50) : null;
                              return rating ? (
                                <div className="text-sm font-black font-mono shrink-0 ml-auto text-amber-400">
                                  {rating}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reserves */}
                    <div>
                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                        Reserves (Coach Select)
                      </div>
                      <div className="space-y-2">
                        {reserves.map((p: any) => (
                          <div key={p.playerId} className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/50">
                            <img
                              src={`https://cdn.nba.com/headshots/nba/latest/260x190/${p.nbaId || p.playerId}.png`}
                              className="w-8 h-8 rounded-full object-cover bg-slate-800"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.playerName)}&background=334155&color=fff`;
                              }}
                              referrerPolicy="no-referrer"
                              alt={p.playerName}
                            />
                            <div>
                              <div className="text-sm font-bold text-white">{p.playerName}</div>
                              <div className="text-xs text-slate-500">{p.teamAbbrev}</div>
                            </div>
                            {(() => {
                              const fullPlayer = state.players.find((np: NBAPlayer) => np.internalId === p.playerId);
                              const rating = fullPlayer ? convertTo2KRating(fullPlayer.overallRating, fullPlayer.ratings?.[fullPlayer.ratings.length - 1]?.hgt ?? 50) : null;
                              return rating ? (
                                <div className="text-sm font-black font-mono shrink-0 ml-auto text-slate-400">
                                  {rating}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="grid grid-cols-2 gap-6">
                {renderConferenceRoster('Eastern Conference', east, EAST_LOGO_URL)}
                {renderConferenceRoster('Western Conference', west, WEST_LOGO_URL)}
              </div>
            );
          })()}
        </div>
      </motion.div>
    </div>
  );
};
