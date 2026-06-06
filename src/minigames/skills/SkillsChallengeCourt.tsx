import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SkillStation } from '../shared/liveContestTypes';

interface SkillsChallengeCourtProps {
  activeCompetitorPos?: { x: number; y: number };
  completedStations: number;
  locations: SkillStation[];
  isCompeting?: boolean;
  className?: string;
  toastFeedback?: { text: string; type: 'MAKE' | 'MISS'; id: number } | null;
}

const SPOT_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#ef4444', '#a855f7', '#22c55e', '#ec4899'];

const Pentagon = ({ cx, cy, fill = '#22c55e' }: { cx: number; cy: number; fill?: string }) => (
  <polygon points={`${cx},${cy - 16} ${cx + 15},${cy - 5} ${cx + 9},${cy + 13} ${cx - 9},${cy + 13} ${cx - 15},${cy - 5}`} fill={fill} />
);

export const SkillsChallengeCourt: React.FC<SkillsChallengeCourtProps> = ({
  activeCompetitorPos,
  completedStations,
  locations,
  isCompeting,
  className = '',
  toastFeedback,
}) => (
  <div className={`relative overflow-hidden rounded-xl border border-[#1e1e2d] bg-[#0d0d12] shadow-[0_0_40px_rgba(0,0,0,0.8)] ${className}`}>
    <svg viewBox="0 0 500 940" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <rect width="500" height="940" fill="#0d0d12" />
      <rect x="190" y="0" width="120" height="190" fill="#14141e" />
      <circle cx="250" cy="190" r="60" fill="#14141e" />
      <rect x="190" y="750" width="120" height="190" fill="#14141e" />
      <circle cx="250" cy="750" r="60" fill="#14141e" />
      <rect width="500" height="940" fill="url(#skills-wood-pattern)" opacity="0.03" />
      <defs>
        <pattern id="skills-wood-pattern" width="20" height="80" patternUnits="userSpaceOnUse">
          <rect width="20" height="80" fill="none" stroke="#fff" strokeWidth="0.5" />
        </pattern>
      </defs>

      <g stroke="#ffffff" fill="none" strokeWidth="2" className="opacity-30">
        <rect x="0" y="0" width="500" height="940" />
        <path d="M0,470h500" />
        <circle cx="250" cy="470" r="60" />
        <path d="M190,0v190" />
        <path d="M310,0v190" />
        <path d="M190,190h120" />
        <circle cx="250" cy="190" r="60" />
        <path d="M 30 0 v 140 A 237.5 237.5 0 0 0 470 140 v -140" />
        <path d="M190,940v-190" />
        <path d="M310,940v-190" />
        <path d="M190,750h120" />
        <circle cx="250" cy="750" r="60" />
        <path d="M 30 940 v -140 A 237.5 237.5 0 0 1 470 800 v 140" />
      </g>

      <path d="M230,20h40v10h-40z" fill="#f97316" stroke="none" opacity="0.8" />
      <circle cx="250" cy="40" r="10" stroke="#f97316" strokeWidth="3" fill="none" />
      <path d="M230,910h40v10h-40z" fill="#f97316" stroke="none" opacity="0.8" />
      <circle cx="250" cy="890" r="10" stroke="#f97316" strokeWidth="3" fill="none" />

      <Pentagon cx={350} cy={700} />
      <Pentagon cx={420} cy={550} />
      <Pentagon cx={350} cy={400} />
      <Pentagon cx={150} cy={350} />
      <Pentagon cx={80} cy={500} />
      <Pentagon cx={150} cy={650} />
      <rect x="440" y="210" width="15" height="50" fill="#3b82f6" transform="rotate(-15 440 210)" />
      <line x1="380" y1="240" x2="440" y2="240" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" opacity="0.5" />
      <rect x="50" y="720" width="15" height="50" fill="#3b82f6" transform="rotate(15 50 720)" />
      <line x1="100" y1="760" x2="55" y2="745" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" opacity="0.5" />

      {locations.length > 0 && (
        <path
          d={`M ${locations.flatMap(loc => loc.path ? [...loc.path.map(point => `${point.x},${point.y}`), `${loc.x},${loc.y}`] : [`${loc.x},${loc.y}`]).join(' L ')}`}
          stroke="#c2410c"
          strokeWidth="4"
          strokeDasharray="12 12"
          fill="none"
          opacity="0.6"
        />
      )}

      {locations.map((loc, index) => {
        const isNext = index === completedStations;
        const isDone = index < completedStations;
        const color = SPOT_COLORS[index % SPOT_COLORS.length];
        return (
          <g key={`${loc.type}-${index}`}>
            <motion.circle
              cx={loc.x}
              cy={loc.y}
              r="30"
              fill="none"
              stroke={color}
              strokeWidth="2"
              initial={false}
              animate={{ scale: isNext ? [1, 1.3, 1] : 1, opacity: isNext ? 0.8 : isDone ? 0.2 : 0.1 }}
              transition={{ duration: 1.5, repeat: isNext ? Infinity : 0 }}
            />
            <circle cx={loc.x} cy={loc.y} r="10" fill={color} opacity={isNext || isDone ? 1 : 0.4} />
            <text
              x={loc.x}
              y={loc.y + (loc.type === 'DRIBBLE_OUT' || loc.type === 'DRIBBLE_BACK' ? -22 : 25)}
              textAnchor="middle"
              fontSize="12"
              fill={isNext ? color : '#888'}
              className="select-none font-sans font-bold uppercase tracking-widest drop-shadow-md"
            >
              {loc.label}
            </text>
          </g>
        );
      })}

      <AnimatePresence>
        {activeCompetitorPos && (
          <g transform={`translate(${activeCompetitorPos.x} ${activeCompetitorPos.y})`}>
            {isCompeting && (
              <motion.circle r="35" fill="#ffffff" opacity="0.3" animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 0.8, repeat: Infinity }} />
            )}
            <ellipse rx="12" ry="6" fill="black" opacity="0.6" transform="translate(0, 16)" />
            <motion.circle r="14" fill="#ffffff" stroke="#000" strokeWidth="3" animate={isCompeting ? { scale: [1, 1.2, 1], y: [0, -15, 0] } : {}} />

            <AnimatePresence mode="wait">
              {toastFeedback && (
                <motion.g
                  key={toastFeedback.id}
                  initial={{ opacity: 0, y: -25, scale: 0.8 }}
                  animate={{ opacity: 1, y: -45, scale: 1 }}
                  exit={{ opacity: 0, y: -65, scale: 0.9 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <rect x="-35" y="-12" width="70" height="22" rx="8" fill={toastFeedback.type === 'MAKE' ? '#22c55e' : '#ef4444'} stroke="#ffffff" strokeWidth="1.5" className="drop-shadow-lg" />
                  <text textAnchor="middle" y="3" fontSize="9" fill="#ffffff" fontWeight="900" className="select-none font-sans font-black uppercase tracking-wider">
                    {toastFeedback.text}
                  </text>
                </motion.g>
              )}
            </AnimatePresence>
          </g>
        )}
      </AnimatePresence>
    </svg>
  </div>
);
