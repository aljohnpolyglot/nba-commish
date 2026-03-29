import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

export type PersonCardType = 'coach' | 'gm' | 'owner' | 'referee' | 'league_office' | 'player';

interface PersonCardProps {
  name: string;
  /** Portrait image URL — falls back to teamLogoUrl, then initials bubble */
  portraitUrl?: string;
  jobTitle?: string;
  team?: string;
  teamLogoUrl?: string;
  /** Optional extra metadata line */
  meta?: string;
  /** Optional badge overlay (e.g. jersey number for refs) */
  cornerBadge?: string;
  /** Type pill shown in footer */
  type?: PersonCardType;
  onClick?: () => void;
  className?: string;
}

const TYPE_COLORS: Record<PersonCardType, string> = {
  referee:       'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  coach:         'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  gm:            'text-amber-400 bg-amber-500/10 border-amber-500/20',
  owner:         'text-rose-400 bg-rose-500/10 border-rose-500/20',
  league_office: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  player:        'text-sky-400 bg-sky-500/10 border-sky-500/20',
};

const TYPE_LABELS: Record<PersonCardType, string> = {
  referee:       'Official',
  coach:         'Coach',
  gm:            'GM',
  owner:         'Owner',
  league_office: 'Executive',
  player:        'Player',
};

/**
 * Personnel grid card — portrait + name + job title + team + optional type pill.
 * Mirrors the PersonnelCard pattern in LeagueOfficeSearcher but as a reusable shared component.
 *
 * @example
 * <PersonCard
 *   name="Erik Spoelstra"
 *   jobTitle="Head Coach"
 *   team="Miami Heat"
 *   teamLogoUrl={team.logoUrl}
 *   type="coach"
 *   onClick={() => openModal(coach)}
 * />
 */
export const PersonCard: React.FC<PersonCardProps> = ({
  name,
  portraitUrl,
  jobTitle,
  team,
  teamLogoUrl,
  meta,
  cornerBadge,
  type,
  onClick,
  className = '',
}) => {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative bg-slate-900/40 border border-slate-800 hover:border-indigo-500/40 rounded-3xl p-4 overflow-hidden ${onClick ? 'cursor-pointer' : ''} transition-all ${className}`}
    >
      {/* Glow blob */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full -mr-8 -mt-8 group-hover:bg-indigo-500/10 transition-all" />

      <div className="flex gap-4 items-center relative z-10">
        {/* Portrait */}
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0">
          {portraitUrl ? (
            <img
              src={portraitUrl}
              alt={name}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (teamLogoUrl) { img.src = teamLogoUrl; img.className = 'w-10 h-10 m-3 object-contain'; }
              }}
            />
          ) : teamLogoUrl ? (
            <img
              src={teamLogoUrl}
              alt={team ?? ''}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-10 h-10 m-3 object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-black text-sm">
              {initials}
            </div>
          )}
          {cornerBadge && (
            <div className="absolute bottom-0 right-0 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-tl-lg leading-none">
              {cornerBadge}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white truncate group-hover:text-indigo-400 transition-colors">
            {name}
          </h4>
          {jobTitle && (
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{jobTitle}</p>
          )}
          {team && (
            <p className="text-[10px] font-bold text-slate-600 mt-1 truncate">{team}</p>
          )}
          {meta && (
            <p className="text-[10px] text-slate-600 mt-0.5 truncate">{meta}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      {(type || onClick) && (
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between relative z-10">
          {type ? (
            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${TYPE_COLORS[type]}`}>
              {TYPE_LABELS[type]}
            </span>
          ) : <span />}
          {onClick && (
            <ChevronRight size={13} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
          )}
        </div>
      )}
    </motion.div>
  );
};
