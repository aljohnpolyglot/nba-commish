import React from 'react';
import { useReducedMotion } from 'motion/react';

interface AnimatedIntegerProps {
  value: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const AnimatedInteger: React.FC<AnimatedIntegerProps> = ({
  value,
  from = 0,
  duration = 850,
  prefix = '',
  suffix = '',
  className,
}) => {
  const reduceMotion = useReducedMotion();
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const start = Number.isFinite(from) ? Math.round(from) : 0;
  const [shown, setShown] = React.useState(reduceMotion ? target : start);

  React.useEffect(() => {
    if (reduceMotion || duration <= 0 || start === target) {
      setShown(target);
      return;
    }
    setShown(start);
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(start + (target - start) * eased));
      if (progress < 1) frame = globalThis.requestAnimationFrame(tick);
    };
    frame = globalThis.requestAnimationFrame(tick);
    return () => globalThis.cancelAnimationFrame(frame);
  }, [duration, reduceMotion, start, target]);

  return <span className={`tabular-nums ${className ?? ''}`}>{prefix}{shown}{suffix}</span>;
};
