import React from 'react';
import { motion } from 'motion/react';
import { NBAPlayer, NonNBATeam } from '../../../types';
import { convertTo2KRating, getCountryFromLoc, getCountryCode } from '../../../utils/helpers';
import { getPlayerImage } from '../../central/view/bioCache';

const LEAGUE_LOGOS: Record<string, string> = {
  PBA: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/93/Philippine_Basketball_Association_logo.svg/200px-Philippine_Basketball_Association_logo.svg.png',
  Euroleague: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b7/EuroLeague_logo.svg/200px-EuroLeague_logo.svg.png',
  'B-League': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmjuA28r8Wi0G12PZR5iGIk8X2sMvjOgyyXw&s',
  'G-League': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/NBA_G_League_logo.svg/200px-NBA_G_League_logo.svg.png',
  Endesa: 'https://r2.thesportsdb.com/images/media/league/badge/9i99ii1549879285.png',
};

interface FreeAgentCardProps {
  player: NBAPlayer;
  nonNBATeams?: NonNBATeam[];
  onClick: (player: NBAPlayer) => void;
}

export const FreeAgentCard: React.FC<FreeAgentCardProps> = ({ player, nonNBATeams = [], onClick }) => {
  const currentYear = new Date().getFullYear();
  const age = player.born?.year ? currentYear - player.born.year : player.age || 0;
  const ovr = convertTo2KRating(player.overallRating, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp);
  const country = getCountryFromLoc(player.born?.loc);
  const countryCode = getCountryCode(country);

  const isNBA = !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '');
  const nonNBATeam = !isNBA ? nonNBATeams.find(t => t.tid === player.tid && t.league === player.status) : null;
  const teamLogo = nonNBATeam?.imgURL || null;
  const leagueLogo = player.status ? LEAGUE_LOGOS[player.status] || null : null;

  let orgLabel = 'Free Agent';
  if (nonNBATeam) {
    // BBGM stores region + name separately — combine them for full team name
    orgLabel = nonNBATeam.region
      ? `${nonNBATeam.region} ${nonNBATeam.name}`.trim()
      : nonNBATeam.name;
  } else if (['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '')) {
    orgLabel = player.status!;
  }

  const isInjured = player.injury && player.injury.type !== 'Healthy' && player.injury.gamesRemaining > 0;
  const isSuspended = player.suspension && player.suspension.gamesRemaining > 0;
  const isAvailable = !isInjured && !isSuspended;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-slate-900/40 border ${isAvailable ? 'border-slate-800/50' : 'border-rose-500/30'} rounded-3xl overflow-hidden hover:border-indigo-500/50 transition-all group relative cursor-pointer`}
      onClick={() => onClick(player)}
    >
      {!isAvailable && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-rose-500/50 z-20" />
      )}
      <div className="p-4">
        <div className="flex items-center gap-4 relative z-10">
          <div className="relative flex-shrink-0">
            <div className={`w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border ${isAvailable ? 'border-slate-700' : 'border-rose-500/50'} flex items-center justify-center`}>
              {getPlayerImage(player) ? (
                <img
                  src={getPlayerImage(player)}
                  alt={player.name}
                  loading="lazy"
                  className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${!isAvailable ? 'grayscale-[0.5]' : ''}`}
                  referrerPolicy="no-referrer"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span className="text-xl font-black text-slate-500">{player.name[0]}</span>
              )}
            </div>
            {/* OVR Badge — matches PlayerCard.tsx style */}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-slate-950 rounded-full flex items-center justify-center border-2 border-slate-800">
              <span className="text-[10px] font-black text-white">{ovr}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <h4 className="text-sm font-bold text-white truncate group-hover:text-indigo-400 transition-colors leading-tight">
                {player.name}
              </h4>
              {!isAvailable && (
                <span className="text-[8px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase tracking-tighter whitespace-nowrap flex-shrink-0">
                  {isInjured ? `OUT` : 'SUSP'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{player.pos}</span>
              <span className="text-[10px] text-slate-600">•</span>
              <span className="text-[10px] font-bold text-slate-500">{age}y</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {countryCode && (
                <img
                  src={`https://flagcdn.com/w20/${countryCode}.png`}
                  alt=""
                  loading="lazy"
                  className="w-3 h-2 object-cover rounded-[1px] flex-shrink-0"
                />
              )}
              {teamLogo && (
                <img
                  src={teamLogo}
                  alt=""
                  loading="lazy"
                  className="w-3.5 h-3.5 object-contain flex-shrink-0"
                  onError={e => e.currentTarget.style.display = 'none'}
                />
              )}
              <span className="text-[10px] font-medium text-slate-500 truncate">{orgLabel}</span>
            </div>
          </div>
          {leagueLogo && (
            <div className="flex-shrink-0 ml-1">
              <img
                src={leagueLogo}
                alt={player.status || ''}
                loading="lazy"
                className="w-7 h-7 object-contain opacity-60 group-hover:opacity-100 transition-opacity"
                onError={e => e.currentTarget.style.display = 'none'}
              />
            </div>
          )}
        </div>
      </div>
      {/* Accent Glow */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-indigo-500/10 transition-all" />
    </motion.div>
  );
};
