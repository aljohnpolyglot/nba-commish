import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShotLocation } from '../shared/liveContestTypes';

interface ShootingStarsCourtProps {
  activeShooterPos?: { x: number; y: number };
  activeShooterIdx?: number;
  completedShots: number;
  locations: ShotLocation[];
  isShooting?: boolean;
  className?: string;
}

const SPOT_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#ef4444'];

export const ShootingStarsCourt: React.FC<ShootingStarsCourtProps> = ({
  activeShooterPos,
  activeShooterIdx = 0,
  completedShots,
  locations,
  isShooting,
  className = '',
}) => (
  <div className={`relative overflow-hidden rounded-xl border border-[#1e1e2d] bg-[#0d0d12] shadow-[0_0_40px_rgba(0,0,0,0.8)] ${className}`}>
    <svg viewBox="0 0 540 530" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <rect width="540" height="530" fill="#0d0d12" />
      <rect x="210" y="17" width="120" height="190" fill="#14141e" />
      <circle cx="270" cy="207" r="60" fill="#14141e" />
      <rect width="540" height="530" fill="url(#ss-wood-pattern)" opacity="0.03" />
      <defs>
        <pattern id="ss-wood-pattern" width="20" height="80" patternUnits="userSpaceOnUse">
          <rect width="20" height="80" fill="none" stroke="#fff" strokeWidth="0.5" />
        </pattern>
      </defs>

      <g stroke="#ffffff" fill="none" strokeWidth="2" className="opacity-30">
        <rect x="20" y="17" width="500" height="470" />
        <path d="M490,17v113" />
        <path d="M50,17v113" />
        <path d="M330,17v190" />
        <path d="M210,17v190" />
        <path d="M330,207H210" />
        <path d="M 50 130 A 237.5 237.5 0 0 0 490 130" />
        <circle cx="270" cy="207" r="60" />
        <path d="M20,487h500" />
        <circle cx="270" cy="487" r="60" />
      </g>

      <path d="M250,17h40v15h-40z" fill="#f97316" stroke="none" opacity="0.8" />
      <circle cx="270" cy="40" r="12" stroke="#f97316" strokeWidth="3" fill="none" />

      <path
        d={`M${locations[0]?.x},${locations[0]?.y} L${locations[1]?.x},${locations[1]?.y} L${locations[2]?.x},${locations[2]?.y} L${locations[3]?.x},${locations[3]?.y}`}
        stroke="#ffffff"
        strokeWidth="2"
        strokeDasharray="8 8"
        fill="none"
        opacity="0.15"
      />

      {locations.map((loc, index) => {
        const isNext = index === completedShots;
        const isDone = index < completedShots;
        const color = SPOT_COLORS[index % SPOT_COLORS.length];
        return (
          <g key={loc.type}>
            <motion.circle
              cx={loc.x}
              cy={loc.y}
              r="25"
              fill="none"
              stroke={color}
              strokeWidth="2"
              initial={false}
              animate={{ scale: isNext ? [1, 1.2, 1] : 1, opacity: isNext ? 0.8 : isDone ? 0.2 : 0.1 }}
              transition={{ duration: 1.5, repeat: isNext ? Infinity : 0 }}
            />
            <circle cx={loc.x} cy={loc.y} r="8" fill={color} opacity={isNext || isDone ? 1 : 0.3} />
            <text x={loc.x} y={loc.y + 45} textAnchor="middle" fontSize="12" fill={isNext ? color : '#666'} className="select-none font-sans font-black uppercase tracking-widest">
              {loc.label}
            </text>
            <text x={loc.x} y={loc.y - 15} textAnchor="middle" fontSize="24" fill={isNext ? color : '#333'} className="select-none font-sans font-black">
              {index + 1}
            </text>
          </g>
        );
      })}

      <AnimatePresence>
        {activeShooterPos && (
          <motion.g
            initial={false}
            animate={{ x: activeShooterPos.x, y: activeShooterPos.y }}
            transition={{ type: 'spring', stiffness: 40, damping: 12 }}
          >
            {isShooting && (
              <motion.circle
                r="30"
                fill={SPOT_COLORS[completedShots % SPOT_COLORS.length]}
                opacity="0.3"
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
            <ellipse rx="10" ry="5" fill="black" opacity="0.6" transform="translate(0, 15)" />
            <motion.circle
              r="12"
              fill={isShooting ? SPOT_COLORS[completedShots % SPOT_COLORS.length] : '#ffffff'}
              stroke="#000"
              strokeWidth="3"
              animate={isShooting ? { scale: [1, 1.2, 1], y: [0, -20, 0] } : {}}
            />
            <text y="-18" textAnchor="middle" fontSize="12" fontWeight="900" fill="white" className="select-none tracking-tighter drop-shadow-md">
              P{activeShooterIdx + 1}
            </text>
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  </div>
);
