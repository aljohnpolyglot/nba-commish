import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { StatPills, StatPill } from './StatPills';
import { OddsBadge } from './OddsBadge';
import { PlayerPortrait } from '../PlayerPortrait';

interface RankedPersonCardProps {
  rank: number;
  /** Portrait image URL */
  portraitUrl?: string;
  /** facesjs face descriptor for generated prospects */
  face?: any;
  name: string;
  /** Secondary line: position, team, record, etc. */
  subtitle?: string;
  /** Optional pill text next to name (e.g. position abbreviation) */
  badge?: string;
  /** Team logo URL shown as badge in portrait corner */
  teamLogoUrl?: string;
  stats?: StatPill[];
  /** Extra text below subtitle (e.g. "+4 wins vs last season") */
  metaLine?: { text: string; color?: string };
  odds?: string;
  /** Accent colour for rank number, hover border, odds badge */
  accentColor?: 'indigo' | 'teal' | 'amber' | 'emerald' | 'rose' | 'violet' | 'sky';
  /** Stagger delay multiplier for motion animation */
  animDelay?: number;
  onClick?: () => void;
  className?: string;
}

const ACCENT_HOVER: Record<NonNullable<RankedPersonCardProps['accentColor']>, string> = {
  indigo:  'hover:border-indigo-500/50 group-hover:text-indigo-400',
  teal:    'hover:border-teal-500/30   group-hover:text-teal-400',
  amber:   'hover:border-amber-500/30  group-hover:text-amber-400',
  emerald: 'hover:border-emerald-500/30 group-hover:text-emerald-400',
  rose:    'hover:border-rose-500/30   group-hover:text-rose-400',
  violet:  'hover:border-violet-500/30 group-hover:text-violet-400',
  sky:     'hover:border-sky-500/30    group-hover:text-sky-400',
};
const ACCENT_RANK: Record<NonNullable<RankedPersonCardProps['accentColor']>, string> = {
  indigo:  'group-hover:text-indigo-500',
  teal:    'group-hover:text-teal-500',
  amber:   'group-hover:text-amber-500',
  emerald: 'group-hover:text-emerald-500',
  rose:    'group-hover:text-rose-500',
  violet:  'group-hover:text-violet-500',
  sky:     'group-hover:text-sky-500',
};

/**
 * Leaderboard row card: rank number + portrait with team-logo badge + name/subtitle + stats row + odds badge.
 * Used in award races (MVP, DPOY, CoY, etc.) and All-NBA tables.
 *
 * @example
 * <RankedPersonCard
 *   rank={1}
 *   portraitUrl={player.imgURL}
 *   name={player.name}
 *   subtitle={`${team.name} · ${team.wins}-${team.losses}`}
 *   badge={player.pos}
 *   teamLogoUrl={team.logoUrl}
 *   stats={[{ label: 'PTS', val: '28.3' }, { label: 'REB', val: '7.1' }, { label: 'AST', val: '5.9' }]}
 *   odds="+120"
 *   accentColor="indigo"
 *   animDelay={0}
 *   onClick={() => setViewingPlayer(player)}
 * />
 */
export const RankedPersonCard: React.FC<RankedPersonCardProps> = ({
  rank,
  portraitUrl,
  face,
  name,
  subtitle,
  badge,
  teamLogoUrl,
  stats,
  metaLine,
  odds,
  accentColor = 'indigo',
  animDelay = 0,
  onClick,
  className = '',
}) => {
  const hoverBorder = ACCENT_HOVER[accentColor];
  const rankHover   = ACCENT_RANK[accentColor];

  return (
    <motion.div
      initial={{ opacity: 0, x: rank % 2 === 0 ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: animDelay }}
      onClick={onClick}
      className={`group relative bg-slate-900 hover:bg-slate-800 border border-slate-800 ${hoverBorder} rounded-2xl p-4 flex items-center gap-4 transition-all ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Rank */}
      <div className={`w-8 text-center font-black text-slate-700 ${rankHover} transition-colors shrink-0`}>
        {rank}
      </div>

      {/* Portrait */}
      <PlayerPortrait
        imgUrl={portraitUrl}
        face={face}
        playerName={name}
        teamLogoUrl={teamLogoUrl}
        size={64}
      />

      {/* Name + subtitle + stats */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className={`font-bold text-white transition-colors ${ACCENT_HOVER[accentColor].split(' ')[1]}`}>
            {name}
          </h4>
          {badge && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        {metaLine && (
          <p className={`text-[10px] font-bold mt-1 ${metaLine.color ?? 'text-slate-500'}`}>{metaLine.text}</p>
        )}
        {stats && stats.length > 0 && <StatPills stats={stats} className="mt-2" />}
      </div>

      {/* Odds */}
      {odds && <OddsBadge odds={odds} highlight={rank === 1} accentColor={accentColor} className="pr-1" />}

      {/* Chevron (only if clickable) */}
      {onClick && (
        <ChevronRight size={16} className={`text-slate-700 transition-colors ${ACCENT_RANK[accentColor]}`} />
      )}
    </motion.div>
  );
};
