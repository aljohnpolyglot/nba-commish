import { useEffect, useId, useRef, useState } from 'react';
import { AnimatedSkeletonPose } from '../types';
import { isRealFaceConfig, MyFace } from './MyFace';

interface AnimatedPlayerSkeletonProps {
  speed: number;
  delay: number;
  isCaptain: boolean;
  isMuse?: boolean;
  primaryColor: string;
  secondaryColor: string;
  poseSequence: AnimatedSkeletonPose[];
  portraitUrl?: string;
  face?: unknown;
  initials: string;
  jerseyNumber: string;
  sashText?: string;
  paused?: boolean;
  currentTimeMs?: number;
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
  isMuse = false,
  primaryColor,
  secondaryColor,
  poseSequence,
  portraitUrl,
  face,
  initials,
  jerseyNumber,
  sashText,
  paused = false,
  currentTimeMs,
}: AnimatedPlayerSkeletonProps) {
  const clipId = `animated-player-head-${useId().replaceAll(':', '')}`;
  const [imgError, setImgError] = useState(false);
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
    let accumulatedTime = 0;
    let lastNow = performance.now();

    const animate = (now: number) => {
      if (!paused) {
        const delta = (now - lastNow) / 1000;
        accumulatedTime += delta;
      }
      lastNow = now;

      let elapsed: number;
      if (currentTimeMs !== undefined) {
        elapsed = Math.max(0, (currentTimeMs / 1000) * speed - delay);
      } else {
        elapsed = Math.max(0, accumulatedTime * speed - delay);
      }

      const beat = elapsed / 0.5;
      const currentBeat = Math.floor(beat);
      const sequenceLength = poseSequence.length || 1;
      const index1 = currentBeat % sequenceLength;
      const index2 = (currentBeat + 1) % sequenceLength;
      const eased = (beat % 1) ** 2 * (3 - 2 * (beat % 1));
      const current = poseSequence[index1] || poseSequence[0];
      const next = poseSequence[index2] || poseSequence[0];
      const value = interpolate(current, next, eased);

      value.headRot += value.torsoRot * 0.6 + Math.sin(elapsed * 4) * 5;
      value.headX += Math.sin(elapsed * 8) * 2;
      value.headY += Math.abs(Math.sin(elapsed * 6)) * 3;
      if (isCaptain) {
        value.rootY -= 6;
        value.rootX += Math.sin(elapsed * 2) * 6;
      }
      if (isMuse) {
        value.headY -= 2;
        value.rootY += Math.sin(elapsed * 3) * 3;
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
  }, [delay, isCaptain, isMuse, poseSequence, speed, paused, currentTimeMs]);

  const bodySkin = isMuse ? '#ffdbac' : '#ffccaa';
  const shirtColor = isMuse ? primaryColor : primaryColor;

  return (
    <svg viewBox="0 0 100 160" className="h-full w-full overflow-visible drop-shadow-xl">
      <defs>
        <clipPath id={clipId}><circle cx="50" cy="25" r="22" /></clipPath>
      </defs>
      <g ref={rootRef}>
        {/* Left Leg */}
        <g ref={legLRef}>
          <line x1="40" y1="90" x2="40" y2="120" stroke={shirtColor} strokeWidth={isMuse ? "9" : "12"} strokeLinecap="round" />
          <g ref={lowerLegLRef}>
            <line x1="40" y1="120" x2="40" y2="135" stroke={bodySkin} strokeWidth="7" strokeLinecap="round" />
            <line x1="40" y1="135" x2="40" y2="150" stroke="#fff" strokeWidth={isMuse ? "6" : "8"} strokeLinecap="round" />
            <rect x="32" y="145" width="16" height="8" rx="3" fill={isMuse ? secondaryColor : "#111"} />
          </g>
        </g>
        {/* Right Leg */}
        <g ref={legRRef}>
          <line x1="60" y1="90" x2="60" y2="120" stroke={shirtColor} strokeWidth={isMuse ? "9" : "12"} strokeLinecap="round" />
          <g ref={lowerLegRRef}>
            <line x1="60" y1="120" x2="60" y2="135" stroke={bodySkin} strokeWidth="7" strokeLinecap="round" />
            <line x1="60" y1="135" x2="60" y2="150" stroke="#fff" strokeWidth={isMuse ? "6" : "8"} strokeLinecap="round" />
            <rect x="52" y="145" width="16" height="8" rx="3" fill={isMuse ? secondaryColor : "#111"} />
          </g>
        </g>
        {/* Torso & Upper Body */}
        <g ref={torsoRef}>
          {isMuse ? (
            /* Elegant Dress/Gown for Team Muse */
            <g>
              <path d="M 32 50 Q 50 45 68 50 L 72 95 Q 50 102 28 95 Z" fill={primaryColor} stroke={secondaryColor} strokeWidth="1.5" />
              {/* Muse Sash */}
              <line x1="33" y1="50" x2="67" y2="92" stroke="#ffffff" strokeWidth="6" opacity="0.95" />
              <line x1="33" y1="50" x2="67" y2="92" stroke="#eab308" strokeWidth="1.5" />
            </g>
          ) : (
            /* Basketball Jersey */
            <g>
              <line x1="35" y1="55" x2="65" y2="55" stroke={primaryColor} strokeWidth="18" strokeLinecap="round" />
              <line x1="50" y1="90" x2="50" y2="55" stroke={primaryColor} strokeWidth="24" strokeLinecap="round" />
              <line x1="50" y1="88" x2="50" y2="52" stroke={secondaryColor} strokeWidth="14" strokeLinecap="round" opacity="0.45" />
              <text x="50" y="77" fill="#fff" fontSize="16" fontWeight="bold" textAnchor="middle">{jerseyNumber}</text>
            </g>
          )}

          {/* Left Arm */}
          <g ref={armLRef}>
            <line x1="30" y1="55" x2="30" y2="85" stroke={bodySkin} strokeWidth="8" strokeLinecap="round" />
            <g ref={lowerArmLRef}>
              <line x1="30" y1="85" x2="30" y2="110" stroke={bodySkin} strokeWidth="7" strokeLinecap="round" />
              <circle cx="30" cy="110" r="5.5" fill={bodySkin} />
            </g>
          </g>
          {/* Right Arm */}
          <g ref={armRRef}>
            <line x1="70" y1="55" x2="70" y2="85" stroke={bodySkin} strokeWidth="8" strokeLinecap="round" />
            <g ref={lowerArmRRef}>
              <line x1="70" y1="85" x2="70" y2="110" stroke={bodySkin} strokeWidth="7" strokeLinecap="round" />
              <circle cx="70" cy="110" r="5.5" fill={bodySkin} />
            </g>
          </g>
          {/* Head */}
          <g ref={headRef}>
            <circle cx="50" cy="25" r="24" fill="#172033" stroke={primaryColor} strokeWidth="2" />
            <foreignObject x="26" y="1" width="48" height="48" clipPath={`url(#${clipId})`}>
              <div className="h-full w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                {portraitUrl && !imgError ? (
                  <img
                    src={portraitUrl}
                    alt={initials}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover object-top"
                    onError={() => setImgError(true)}
                  />
                ) : isRealFaceConfig(face) ? (
                  <MyFace face={face} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <span className="text-white font-black text-xs">{initials}</span>
                )}
              </div>
            </foreignObject>

            {/* Crowns and Captain badge */}
            {isCaptain && (
              <g transform="translate(0, -5)">
                <path d="M 38 0 L 44 -14 L 50 -6 L 56 -14 L 62 0 Z" fill="#eab308" stroke="#000" strokeWidth="1" />
                <circle cx="50" cy="-6" r="2" fill="#ef4444" />
              </g>
            )}
            {isMuse && (
              <g transform="translate(0, -6)">
                <path d="M 40 0 L 45 -12 L 50 -4 L 55 -12 L 60 0 Z" fill="#f43f5e" stroke="#fff" strokeWidth="1" />
                <circle cx="50" cy="-14" r="2.5" fill="#fef08a" />
              </g>
            )}
          </g>
        </g>
      </g>
    </svg>
  );
}
