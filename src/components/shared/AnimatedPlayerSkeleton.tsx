import { useEffect, useId, useRef } from 'react';
import { isRealFaceConfig, MyFace } from './MyFace';

export interface AnimatedSkeletonPose {
  rootX: number;
  rootY: number;
  rootRot: number;
  torsoRot: number;
  headX: number;
  headY: number;
  headRot: number;
  armLRot: number;
  lowerArmLRot: number;
  armRRot: number;
  lowerArmRRot: number;
  legLRot: number;
  lowerLegLRot: number;
  legRRot: number;
  lowerLegRRot: number;
}

interface AnimatedPlayerSkeletonProps {
  speed: number;
  delay: number;
  isCaptain: boolean;
  primaryColor: string;
  secondaryColor: string;
  poseSequence: AnimatedSkeletonPose[];
  portraitUrl?: string;
  face?: unknown;
  initials: string;
  jerseyNumber: string;
}

const lerp = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;

const interpolate = (
  from: AnimatedSkeletonPose,
  to: AnimatedSkeletonPose,
  progress: number,
): AnimatedSkeletonPose => ({
  rootX: lerp(from.rootX, to.rootX, progress),
  rootY: lerp(from.rootY, to.rootY, progress),
  rootRot: lerp(from.rootRot, to.rootRot, progress),
  torsoRot: lerp(from.torsoRot, to.torsoRot, progress),
  headX: lerp(from.headX, to.headX, progress),
  headY: lerp(from.headY, to.headY, progress),
  headRot: lerp(from.headRot, to.headRot, progress),
  armLRot: lerp(from.armLRot, to.armLRot, progress),
  lowerArmLRot: lerp(from.lowerArmLRot, to.lowerArmLRot, progress),
  armRRot: lerp(from.armRRot, to.armRRot, progress),
  lowerArmRRot: lerp(from.lowerArmRRot, to.lowerArmRRot, progress),
  legLRot: lerp(from.legLRot, to.legLRot, progress),
  lowerLegLRot: lerp(from.lowerLegLRot, to.lowerLegLRot, progress),
  legRRot: lerp(from.legRRot, to.legRRot, progress),
  lowerLegRRot: lerp(from.lowerLegRRot, to.lowerLegRRot, progress),
});

export function AnimatedPlayerSkeleton({
  speed,
  delay,
  isCaptain,
  primaryColor,
  secondaryColor,
  poseSequence,
  portraitUrl,
  face,
  initials,
  jerseyNumber,
}: AnimatedPlayerSkeletonProps) {
  const clipId = `animated-player-head-${useId().replaceAll(':', '')}`;
  const rootRef = useRef<SVGGElement>(null);
  const torsoRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const armLRef = useRef<SVGGElement>(null);
  const lowerArmLRef = useRef<SVGGElement>(null);
  const armRRef = useRef<SVGGElement>(null);
  const lowerArmRRef = useRef<SVGGElement>(null);
  const legLRef = useRef<SVGGElement>(null);
  const lowerLegLRef = useRef<SVGGElement>(null);
  const legRRef = useRef<SVGGElement>(null);
  const lowerLegRRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let animationFrame = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.max(0, ((now - startedAt) / 1000) * speed - delay);
      const beat = elapsed / 0.5;
      const currentBeat = Math.floor(beat);
      const eased = (beat - currentBeat) ** 2 * (3 - 2 * (beat - currentBeat));
      const current = poseSequence[Math.min(currentBeat, poseSequence.length - 1)];
      const next = poseSequence[Math.min(currentBeat + 1, poseSequence.length - 1)];
      const value = interpolate(current, next, eased);

      value.headRot += value.torsoRot * 0.6 + Math.sin(elapsed * 4) * 5;
      value.headX += Math.sin(elapsed * 8) * 2;
      value.headY += Math.abs(Math.sin(elapsed * 6)) * 3;
      if (isCaptain) {
        value.rootY -= 10;
        value.rootX += Math.sin(elapsed * 2) * 10;
      }

      rootRef.current?.setAttribute('transform', `translate(${value.rootX}, ${value.rootY}) rotate(${value.rootRot}, 50, 90)`);
      torsoRef.current?.setAttribute('transform', `rotate(${value.torsoRot}, 50, 90)`);
      headRef.current?.setAttribute('transform', `translate(${value.headX}, ${value.headY}) rotate(${value.headRot}, 50, 45)`);
      armLRef.current?.setAttribute('transform', `rotate(${value.armLRot}, 30, 55)`);
      lowerArmLRef.current?.setAttribute('transform', `rotate(${value.lowerArmLRot}, 30, 85)`);
      armRRef.current?.setAttribute('transform', `rotate(${value.armRRot}, 70, 55)`);
      lowerArmRRef.current?.setAttribute('transform', `rotate(${value.lowerArmRRot}, 70, 85)`);
      legLRef.current?.setAttribute('transform', `rotate(${value.legLRot}, 40, 90)`);
      lowerLegLRef.current?.setAttribute('transform', `rotate(${value.lowerLegLRot}, 40, 120)`);
      legRRef.current?.setAttribute('transform', `rotate(${value.legRRot}, 60, 90)`);
      lowerLegRRef.current?.setAttribute('transform', `rotate(${value.lowerLegRRot}, 60, 120)`);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [delay, isCaptain, poseSequence, speed]);

  return (
    <svg viewBox="0 0 100 160" className="h-full w-full overflow-visible drop-shadow-xl">
      <defs>
        <clipPath id={clipId}><circle cx="50" cy="25" r="22" /></clipPath>
      </defs>
      <g ref={rootRef}>
        <g ref={legLRef}>
          <line x1="40" y1="90" x2="40" y2="120" stroke={primaryColor} strokeWidth="12" strokeLinecap="round" />
          <g ref={lowerLegLRef}>
            <line x1="40" y1="120" x2="40" y2="135" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round" />
            <line x1="40" y1="135" x2="40" y2="150" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
            <rect x="32" y="145" width="16" height="8" rx="3" fill="#111" />
          </g>
        </g>
        <g ref={legRRef}>
          <line x1="60" y1="90" x2="60" y2="120" stroke={primaryColor} strokeWidth="12" strokeLinecap="round" />
          <g ref={lowerLegRRef}>
            <line x1="60" y1="120" x2="60" y2="135" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round" />
            <line x1="60" y1="135" x2="60" y2="150" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
            <rect x="52" y="145" width="16" height="8" rx="3" fill="#111" />
          </g>
        </g>
        <g ref={torsoRef}>
          <line x1="35" y1="55" x2="65" y2="55" stroke={primaryColor} strokeWidth="18" strokeLinecap="round" />
          <line x1="50" y1="90" x2="50" y2="55" stroke={primaryColor} strokeWidth="24" strokeLinecap="round" />
          <line x1="50" y1="88" x2="50" y2="52" stroke={secondaryColor} strokeWidth="14" strokeLinecap="round" opacity="0.45" />
          <text x="50" y="77" fill="#fff" fontSize="16" fontWeight="bold" textAnchor="middle">{jerseyNumber}</text>
          <g ref={armLRef}>
            <line x1="30" y1="55" x2="30" y2="85" stroke="#ffccaa" strokeWidth="8" strokeLinecap="round" />
            <g ref={lowerArmLRef}>
              <line x1="30" y1="85" x2="30" y2="110" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round" />
              <circle cx="30" cy="110" r="5.5" fill="#ffccaa" />
            </g>
          </g>
          <g ref={armRRef}>
            <line x1="70" y1="55" x2="70" y2="85" stroke="#ffccaa" strokeWidth="8" strokeLinecap="round" />
            <g ref={lowerArmRRef}>
              <line x1="70" y1="85" x2="70" y2="110" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round" />
              <circle cx="70" cy="110" r="5.5" fill="#ffccaa" />
            </g>
          </g>
          <g ref={headRef}>
            <circle cx="50" cy="25" r="24" fill="#172033" stroke={primaryColor} strokeWidth="2" />
            {portraitUrl ? (
              <image href={portraitUrl} x="26" y="1" width="48" height="48" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
            ) : isRealFaceConfig(face) ? (
              <foreignObject x="26" y="1" width="48" height="48" clipPath={`url(#${clipId})`}>
                <div className="h-full w-full overflow-hidden bg-slate-800">
                  <MyFace face={face} style={{ width: '100%', height: '100%' }} />
                </div>
              </foreignObject>
            ) : (
              <text x="50" y="31" fill="#fff" fontSize="14" fontWeight="900" textAnchor="middle">{initials}</text>
            )}
            {isCaptain && <path d="M 40 -5 L 50 -20 L 60 -5 Z" fill="#eab308" stroke="#000" strokeWidth="1" />}
          </g>
        </g>
      </g>
    </svg>
  );
}
