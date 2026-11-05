import { motion, useReducedMotion } from 'motion/react';

interface Point {
  x: number;
  y: number;
}

interface ContestBallProps {
  shooter: Point;
  isShooting?: boolean;
  hoop?: Point;
}

const PROGRESS = [0, 0.25, 0.5, 0.75, 1];

export const contestBallFlightFrames = (shooter: Point, hoop: Point) => ({
  x: PROGRESS.map(progress => shooter.x + (hoop.x - shooter.x) * progress),
  y: PROGRESS.map(progress => progress === 0
    ? shooter.y
    : progress === 1
      ? hoop.y
      : shooter.y + (hoop.y - shooter.y) * progress - Math.sin(progress * Math.PI) * 82),
});

export function ContestBall({
  shooter,
  isShooting = false,
  hoop = { x: 270, y: 40 },
}: ContestBallProps) {
  const reduceMotion = useReducedMotion();
  const flight = contestBallFlightFrames(shooter, hoop);
  const groundX = PROGRESS.map(progress => shooter.x + (hoop.x - shooter.x) * progress);
  const groundY = PROGRESS.map(progress => shooter.y + (hoop.y - shooter.y) * progress + 8);
  const x = reduceMotion ? shooter.x : isShooting ? flight.x : shooter.x;
  const y = reduceMotion ? shooter.y - 12 : isShooting ? flight.y : [shooter.y - 12, shooter.y + 2, shooter.y - 12];
  const transition = isShooting
    ? { duration: 0.9, ease: 'linear' as const, times: PROGRESS }
    : { duration: 0.65, ease: 'easeIn' as const, repeat: Infinity };

  return (
    <g aria-hidden="true" className="pointer-events-none" data-contest-ball>
      <motion.ellipse
        cx={shooter.x}
        cy={shooter.y + 8}
        rx="12"
        ry="5"
        fill="black"
        initial={false}
        animate={reduceMotion || !isShooting
          ? { opacity: 0.38 }
          : { cx: groundX, cy: groundY, opacity: [0.45, 0.08, 0.08, 0.16, 0.3], rx: [12, 8, 5, 8, 10], ry: [5, 3, 2, 3, 4] }}
        transition={isShooting ? { duration: 0.9, ease: 'linear', times: PROGRESS } : undefined}
      />
      <motion.g
        initial={false}
        animate={{ x, y, scale: reduceMotion ? 1 : isShooting ? [1, 1.28, 1] : [1, 0.94, 1] }}
        transition={reduceMotion ? { duration: 0 } : transition}
      >
        <circle r="9" fill="#f97316" stroke="#7c2d12" strokeWidth="2" />
        <circle r="6.4" fill="none" stroke="#7c2d12" strokeWidth="1" opacity="0.85" />
        <path d="M-8 0H8M0-8C-4-4-4 4 0 8M0-8C4-4 4 4 0 8" fill="none" stroke="#7c2d12" strokeWidth="1" opacity="0.85" />
      </motion.g>
    </g>
  );
}
