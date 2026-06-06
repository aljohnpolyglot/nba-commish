import { AnimatePresence, motion } from 'motion/react';
import type { HorseShot } from '../../services/allStar/AllStarHorseSim';

interface HorseCourtProps {
  activeShooterPos?: { x: number; y: number };
  activeShooterIdx?: number;
  currentShot?: HorseShot | null;
  locations: HorseShot[];
  isShooting?: boolean;
  className?: string;
}

const SHOT_COLOR = '#f97316';

export default function HorseCourt({
  activeShooterPos,
  activeShooterIdx,
  currentShot,
  locations,
  isShooting,
  className = '',
}: HorseCourtProps) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-[#1e1e2d] bg-[#0d0d12] shadow-[0_0_40px_rgba(0,0,0,0.8)] ${className}`}>
      <svg viewBox="0 0 540 530" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <rect width="540" height="530" fill="#0d0d12" />
        <rect x="210" y="17" width="120" height="190" fill="#14141e" />
        <circle cx="270" cy="207" r="60" fill="#14141e" />
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

        {locations.map(loc => {
          const isActive = currentShot?.id === loc.id;
          return (
            <g key={loc.id}>
              <motion.circle
                cx={loc.x}
                cy={loc.y}
                r={isActive ? '25' : '10'}
                fill="none"
                stroke={isActive ? SHOT_COLOR : '#444'}
                strokeWidth="2"
                initial={false}
                animate={{ scale: isActive ? [1, 1.2, 1] : 1, opacity: isActive ? 0.8 : 0.2 }}
                transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
              />
              <circle cx={loc.x} cy={loc.y} r="6" fill={isActive ? SHOT_COLOR : '#444'} opacity={isActive ? 1 : 0.3} />
              {isActive && (
                <text x={loc.x} y={loc.y + 45} textAnchor="middle" fontSize="10" fill={SHOT_COLOR} className="select-none font-sans font-black uppercase tracking-widest">
                  {loc.label}
                </text>
              )}
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
                  fill={SHOT_COLOR}
                  opacity="0.3"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              <ellipse rx="10" ry="5" fill="black" opacity="0.6" transform="translate(0, 15)" />
              <motion.circle
                r="12"
                fill={isShooting ? SHOT_COLOR : '#ffffff'}
                stroke="#000"
                strokeWidth="3"
                animate={isShooting ? { scale: [1, 1.2, 1], y: [0, -20, 0] } : {}}
              />
              <text y="-18" textAnchor="middle" fontSize="12" fontWeight="black" fill="white" className="select-none tracking-tighter drop-shadow-md">
                P{activeShooterIdx !== undefined ? activeShooterIdx + 1 : ''}
              </text>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    </div>
  );
}
