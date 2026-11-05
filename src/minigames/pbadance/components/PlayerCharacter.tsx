import React, { useEffect, useRef, useState } from 'react';
import { Pose } from '../types';

interface PlayerCharacterProps {
  speed: number;
  delay: number;
  isCaptain: boolean;
  team: 'NORTH' | 'SOUTH';
  playerId: number;
  poseSequence: Pose[];
  portraitUrl: string;
  jerseyNumber: string;
  primaryColor?: string;
  secondaryColor?: string;
  initials?: string;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const interpolatePose = (poseA: Pose, poseB: Pose, t: number): Pose => ({
  rootX: lerp(poseA.rootX, poseB.rootX, t),
  rootY: lerp(poseA.rootY, poseB.rootY, t),
  rootRot: lerp(poseA.rootRot, poseB.rootRot, t),
  torsoRot: lerp(poseA.torsoRot, poseB.torsoRot, t),
  headX: lerp(poseA.headX, poseB.headX, t),
  headY: lerp(poseA.headY, poseB.headY, t),
  headRot: lerp(poseA.headRot, poseB.headRot, t),
  armLRot: lerp(poseA.armLRot, poseB.armLRot, t),
  lArmLRot: lerp(poseA.lArmLRot, poseB.lArmLRot, t),
  armRRot: lerp(poseA.armRRot, poseB.armRRot, t),
  lArmRRot: lerp(poseA.lArmRRot, poseB.lArmRRot, t),
  legLRot: lerp(poseA.legLRot, poseB.legLRot, t),
  lLegLRot: lerp(poseA.lLegLRot, poseB.lLegLRot, t),
  legRRot: lerp(poseA.legRRot, poseB.legRRot, t),
  lLegRRot: lerp(poseA.lLegRRot, poseB.lLegRRot, t),
});

export default function PlayerCharacter({
  speed, delay, isCaptain, team, playerId, poseSequence, portraitUrl, jerseyNumber,
  primaryColor, secondaryColor, initials
}: PlayerCharacterProps) {
  const rootRef = useRef<SVGGElement>(null);
  const torsoRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const armLRef = useRef<SVGGElement>(null);
  const lArmLRef = useRef<SVGGElement>(null);
  const armRRef = useRef<SVGGElement>(null);
  const lArmRRef = useRef<SVGGElement>(null);
  const legLRef = useRef<SVGGElement>(null);
  const lLegLRef = useRef<SVGGElement>(null);
  const legRRef = useRef<SVGGElement>(null);
  const lLegRRef = useRef<SVGGElement>(null);
  const [portraitFailed, setPortraitFailed] = useState(false);

  useEffect(() => {
    setPortraitFailed(false);
  }, [portraitUrl]);

  useEffect(() => {
    let reqId: number;
    const startTime = performance.now();
    const beatDuration = 0.5; // 0.5 seconds per pose (beat)
    
    const animate = (now: number) => {
      // elapsed time in seconds, affected by speed and delay
      const elapsed = Math.max(0, ((now - startTime) / 1000) * speed - delay);
      
      const currentBeatFloat = elapsed / beatDuration;
      const currentBeat = Math.floor(currentBeatFloat);
      const nextBeat = currentBeat + 1;
      
      let t = currentBeatFloat - currentBeat;
      // Smoothstep easing for fluid transitions between poses
      t = t * t * (3 - 2 * t);

      // Clamp to sequence length so it stops at the final pose
      const poseIdx1 = Math.min(currentBeat, poseSequence.length - 1);
      const poseIdx2 = Math.min(nextBeat, poseSequence.length - 1);

      const poseA = poseSequence[poseIdx1];
      const poseB = poseSequence[poseIdx2];

      const s = interpolatePose(poseA, poseB, t);

      // Add a small amount of continuous procedural wobble
      s.headRot += s.torsoRot * 0.6 + Math.sin(elapsed * 4) * 5;
      s.headX += Math.sin(elapsed * 8) * 2;
      s.headY += Math.abs(Math.sin(elapsed * 6)) * 3;
      
      if (isCaptain) {
         s.rootY -= 10; // Captain stands out
         s.rootX += Math.sin(elapsed * 2) * 10;
      }

      // Apply transforms
      if (rootRef.current) rootRef.current.setAttribute('transform', `translate(${s.rootX}, ${s.rootY}) rotate(${s.rootRot}, 50, 90)`);
      if (torsoRef.current) torsoRef.current.setAttribute('transform', `rotate(${s.torsoRot}, 50, 90)`);
      if (headRef.current) headRef.current.setAttribute('transform', `translate(${s.headX}, ${s.headY}) rotate(${s.headRot}, 50, 45)`);
      if (armLRef.current) armLRef.current.setAttribute('transform', `rotate(${s.armLRot}, 30, 55)`);
      if (lArmLRef.current) lArmLRef.current.setAttribute('transform', `rotate(${s.lArmLRot}, 30, 85)`);
      if (armRRef.current) armRRef.current.setAttribute('transform', `rotate(${s.armRRot}, 70, 55)`);
      if (lArmRRef.current) lArmRRef.current.setAttribute('transform', `rotate(${s.lArmRRot}, 70, 85)`);
      if (legLRef.current) legLRef.current.setAttribute('transform', `rotate(${s.legLRot}, 40, 90)`);
      if (lLegLRef.current) lLegLRef.current.setAttribute('transform', `rotate(${s.lLegLRot}, 40, 120)`);
      if (legRRef.current) legRRef.current.setAttribute('transform', `rotate(${s.legRRot}, 60, 90)`);
      if (lLegRRef.current) lLegRRef.current.setAttribute('transform', `rotate(${s.lLegRRot}, 60, 120)`);

      reqId = requestAnimationFrame(animate);
    };

    reqId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(reqId);
  }, [speed, delay, isCaptain, poseSequence]);

  const teamColor = primaryColor ?? (team === 'NORTH' ? '#3b82f6' : '#f97316');
  const jerseyAccent = secondaryColor ?? '#ffffff';

  return (
    <svg viewBox="0 0 100 160" className="w-full h-full overflow-visible drop-shadow-xl">
      <defs>
        <clipPath id={`head-clip-${team}-${playerId}`}>
          <circle cx="50" cy="25" r="22" />
        </clipPath>
      </defs>
      <g ref={rootRef}>
        {/* Left Leg */}
        <g ref={legLRef}>
          <line x1="40" y1="90" x2="40" y2="120" stroke={teamColor} strokeWidth="12" strokeLinecap="round"/>
          <g ref={lLegLRef}>
            <line x1="40" y1="120" x2="40" y2="135" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round"/>
            <line x1="40" y1="135" x2="40" y2="150" stroke="#fff" strokeWidth="8" strokeLinecap="round"/>
            <rect x="32" y="145" width="16" height="8" rx="3" fill="#111"/>
            <path d="M 32 150 L 48 150 L 48 153 L 32 153 Z" fill="#ddd"/>
          </g>
        </g>
        
        {/* Right Leg */}
        <g ref={legRRef}>
          <line x1="60" y1="90" x2="60" y2="120" stroke={teamColor} strokeWidth="12" strokeLinecap="round"/>
          <g ref={lLegRRef}>
            <line x1="60" y1="120" x2="60" y2="135" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round"/>
            <line x1="60" y1="135" x2="60" y2="150" stroke="#fff" strokeWidth="8" strokeLinecap="round"/>
            <rect x="52" y="145" width="16" height="8" rx="3" fill="#111"/>
            <path d="M 52 150 L 68 150 L 68 153 L 52 153 Z" fill="#ddd"/>
          </g>
        </g>

        {/* Torso & Head & Arms */}
        <g ref={torsoRef}>
          {/* Shoulders */}
          <line x1="35" y1="55" x2="65" y2="55" stroke={teamColor} strokeWidth="18" strokeLinecap="round"/>
          
          {/* Torso body */}
          <line x1="50" y1="90" x2="50" y2="55" stroke={teamColor} strokeWidth="24" strokeLinecap="round"/>
          {/* Jersey Stripe */}
          <line x1="50" y1="88" x2="50" y2="52" stroke={jerseyAccent} strokeOpacity="0.28" strokeWidth="14" strokeLinecap="round"/>
          <text x="50" y="77" fill="#fff" fontSize="16" fontWeight="bold" textAnchor="middle">{jerseyNumber}</text>
          
          {/* Left Arm */}
          <g ref={armLRef}>
            <line x1="30" y1="55" x2="30" y2="85" stroke="#ffccaa" strokeWidth="8" strokeLinecap="round"/>
            <g ref={lArmLRef}>
              <line x1="30" y1="85" x2="30" y2="110" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round"/>
              <circle cx="30" cy="110" r="5.5" fill="#ffccaa"/>
            </g>
          </g>
          
          {/* Right Arm */}
          <g ref={armRRef}>
            <line x1="70" y1="55" x2="70" y2="85" stroke="#ffccaa" strokeWidth="8" strokeLinecap="round"/>
            <g ref={lArmRRef}>
              <line x1="70" y1="85" x2="70" y2="110" stroke="#ffccaa" strokeWidth="7" strokeLinecap="round"/>
              <circle cx="70" cy="110" r="5.5" fill="#ffccaa"/>
            </g>
          </g>
          
          {/* Head with PNG portrait replacement */}
          <g ref={headRef}>
            {portraitUrl && !portraitFailed ? (
              <image
                href={portraitUrl}
                x="26"
                y="1"
                width="48"
                height="48"
                clipPath={`url(#head-clip-${team}-${playerId})`}
                onError={() => setPortraitFailed(true)}
              />
            ) : (
              <>
                <circle cx="50" cy="25" r="24" fill="#222" stroke={teamColor} strokeWidth="2"/>
                <text x="50" y="31" fill="#fff" fontSize="14" fontWeight="bold" textAnchor="middle">{initials}</text>
              </>
            )}
            {isCaptain && <path d="M 40 -5 L 50 -20 L 60 -5 Z" fill="#eab308" stroke="#000" strokeWidth="1" />}
          </g>
        </g>
      </g>
    </svg>
  );
}
