import { useState } from 'react';
import { PBATeam } from '../types';

interface TeamLogoSvgProps {
  team: PBATeam;
  size?: number;
  className?: string;
}

export function TeamLogoSvg({ team, size = 64, className = '' }: TeamLogoSvgProps) {
  const [imgError, setImgError] = useState(false);
  const { primaryColor, secondaryColor, shortName, logoUrl } = team;

  if (logoUrl && !imgError) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`relative flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      >
        <img
          src={logoUrl}
          alt={team.name}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain drop-shadow-md transition-transform hover:scale-105"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center shrink-0 ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full drop-shadow-md transition-transform hover:scale-105"
      >
        <defs>
          <linearGradient id={`grad-${team.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
          <filter id={`glow-${team.id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Shield Outer */}
        <path
          d="M 50 5 L 90 20 L 80 75 L 50 95 L 20 75 L 10 20 Z"
          fill={`url(#grad-${team.id})`}
          stroke="#ffffff"
          strokeWidth="3.5"
        />

        {/* Inner Shield border */}
        <path
          d="M 50 12 L 82 24 L 73 70 L 50 87 L 27 70 L 18 24 Z"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
          opacity="0.6"
        />

        {/* Center Basketball emblem */}
        <g transform="translate(50, 42)">
          <circle cx="0" cy="0" r="18" fill={secondaryColor} stroke="#ffffff" strokeWidth="2" />
          <path d="M -18 0 L 18 0" stroke="#ffffff" strokeWidth="1.5" />
          <path d="M 0 -18 L 0 18" stroke="#ffffff" strokeWidth="1.5" />
          <path d="M -12 -12 Q 0 0 -12 12" stroke="#ffffff" strokeWidth="1.5" fill="none" />
          <path d="M 12 -12 Q 0 0 12 12" stroke="#ffffff" strokeWidth="1.5" fill="none" />
        </g>

        {/* Stars */}
        <path d="M 30 22 L 32 26 L 36 26 L 33 29 L 34 33 L 30 31 L 26 33 L 27 29 L 24 26 L 28 26 Z" fill="#facc15" />
        <path d="M 70 22 L 72 26 L 76 26 L 73 29 L 74 33 L 70 31 L 66 33 L 67 29 L 64 26 L 68 26 Z" fill="#facc15" />

        {/* Short Title text */}
        <text
          x="50"
          y="78"
          fill="#ffffff"
          fontSize="11"
          fontWeight="900"
          textAnchor="middle"
          style={{ letterSpacing: '0.5px' }}
        >
          {(shortName || 'PBA').toUpperCase().slice(0, 8)}
        </text>
      </svg>
    </div>
  );
}
