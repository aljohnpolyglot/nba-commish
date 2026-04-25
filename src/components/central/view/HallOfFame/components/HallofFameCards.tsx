import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Trophy, Star, MapPin } from 'lucide-react';
import type { HOFInductee } from './HOFSection';
import { HOF_FIRST_BALLOT_WAIT_YEARS, HOF_BORDERLINE_WAIT_YEARS } from '../../../../../services/playerDevelopment/hofChecker';

interface HOFCardProps {
  inductee: HOFInductee;
  onClick?: (inductee: HOFInductee) => void;
}

const HOFCard: React.FC<HOFCardProps> = ({ inductee, onClick }) => {
  const { player, inductionYear } = inductee;
  const awards = player.awards ?? [];

  const championships = awards.filter(a => a.type === 'Won Championship' || a.type === 'Champion').length;
  const mvps = awards.filter(a => a.type === 'Most Valuable Player').length;
  const allStars = awards.filter(a => a.type === 'All-Star').length;
  const allLeagues = awards.filter(a => a.type.includes('All-League')).length;
  const dpoys = awards.filter(a => a.type === 'Defensive Player of the Year').length;
  const allDefense = awards.filter(a => a.type.includes('All-Defensive')).length;
  const finalsMVPs = awards.filter(a => a.type === 'Finals MVP').length;
  const firstBallot = player.retiredYear ? inductionYear === player.retiredYear + HOF_FIRST_BALLOT_WAIT_YEARS : false;
  const borderline = player.retiredYear ? inductionYear >= player.retiredYear + HOF_BORDERLINE_WAIT_YEARS : false;

  // Group awards for hover reveal
  const groupedAwards = useMemo(() => {
    const counts: Record<string, number[]> = {};
    awards.forEach(a => {
      if (!counts[a.type]) counts[a.type] = [];
      counts[a.type].push(a.season);
    });
    return Object.entries(counts).map(([type, seasons]) => {
      const count = seasons.length;
      const label = count > 1 ? `${count}× ${type}` : `${seasons[0]} ${type}`;
      return { label, type, count };
    }).sort((a, b) => b.count - a.count);
  }, [awards]);

  const statsToShow = useMemo(() => {
    const all = [
      { label: 'Championships', value: championships },
      { label: 'MVPs', value: mvps },
      { label: 'Finals MVPs', value: finalsMVPs },
      { label: 'All-Stars', value: allStars },
      { label: 'All-League', value: allLeagues },
      { label: 'DPOY', value: dpoys },
      { label: 'All-Defense', value: allDefense },
    ].filter(s => s.value > 0);
    return all.slice(0, 3);
  }, [championships, mvps, finalsMVPs, allStars, allLeagues, dpoys, allDefense]);

  const eyebrow = useMemo(() => {
    const parts = [];
    if (championships > 0) parts.push(`${championships}× Champion`);
    if (mvps > 0) parts.push(`${mvps}× MVP`);
    if (allStars > 0) parts.push(`${allStars}× All-Star`);
    if (dpoys > 0) parts.push(`${dpoys}× DPOY`);
    return parts.slice(0, 2).join(' • ');
  }, [championships, mvps, allStars, dpoys]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(inductee)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(inductee);
        }
      }}
      className="group relative overflow-hidden rounded-xl border border-yellow-500/20 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-4 transition-all duration-500 hover:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 md:p-6"
    >
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-500/5 blur-3xl transition-all group-hover:bg-yellow-500/10" />

      <div className="relative flex flex-row gap-4 md:gap-6">
        {/* Portrait */}
        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-800 md:h-56 md:w-48">
          {player.imgURL ? (
            <img
              src={player.imgURL}
              alt={player.name}
              className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-110"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-600">
              <Star size={48} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-2 flex items-center gap-2 md:bottom-3 md:left-3">
            {player.pos && (
              <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-yellow-400 md:text-[10px]">
                {player.pos}
              </span>
            )}
            {firstBallot && (
              <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-black md:text-[10px]">
                1st Ballot
              </span>
            )}
            {!firstBallot && borderline && (
              <span className="rounded bg-rose-300 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-black md:text-[10px]">
                Borderline
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                {eyebrow && (
                  <span className="mb-0.5 truncate text-[8px] font-bold uppercase tracking-[0.2em] text-yellow-400 md:mb-1 md:text-[10px]">
                    {eyebrow}
                  </span>
                )}
                <h3 className="truncate font-display text-lg font-bold text-white transition-all duration-300 group-hover:bg-gradient-to-r group-hover:from-yellow-300 group-hover:via-yellow-500 group-hover:to-yellow-700 group-hover:bg-clip-text group-hover:text-transparent md:text-3xl">
                  {player.name}
                </h3>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="font-serif text-[8px] italic text-yellow-500/60 md:text-sm">Inducted</span>
                <span className="font-display text-base font-bold text-yellow-400 md:text-2xl">{inductionYear}</span>
                <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500 md:text-[10px]">
                  View Bio
                </span>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 md:mt-4 md:text-sm">
              {player.born?.loc && (
                <div className="flex items-center gap-1">
                  <MapPin size={10} className="text-yellow-500/40 md:h-3 md:w-3" />
                  <span className="max-w-[80px] truncate md:max-w-none">{player.born.loc}</span>
                </div>
              )}
              {player.draft?.year && (
                <div className="flex items-center gap-1">
                  <Trophy size={10} className="text-yellow-500/40 md:h-3 md:w-3" />
                  <span>Drafted {player.draft.year}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          {statsToShow.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 md:mt-6 md:gap-4 md:pt-5">
              {statsToShow.map((stat, i) => (
                <div key={i} className="flex flex-col">
                  <span className="truncate text-[7px] font-bold uppercase tracking-widest text-slate-500 md:text-[10px]">{stat.label}</span>
                  <span className="font-display text-sm font-semibold text-white md:text-xl">{stat.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hover reveal — full award list */}
      <div className="mt-4 max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-60">
        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          {groupedAwards.slice(0, 12).map((award, i) => (
            <span
              key={i}
              className="rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1 text-[10px] font-medium text-slate-400"
            >
              {award.label}
            </span>
          ))}
          {groupedAwards.length > 12 && (
            <span className="px-2 py-1 text-[10px] italic text-slate-500">
              +{groupedAwards.length - 12} more
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default HOFCard;
