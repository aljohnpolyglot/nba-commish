import React from 'react';
import type { NBATeam } from '../../types';
import { getTeamNickname } from '../../utils/teamNames';

type Props = {
  team: NBATeam;
};

export const FranchiseCenterCourt: React.FC<Props> = ({ team }) => {
  const primary = team.colors?.find(color => /^#[0-9a-f]{6}$/i.test(color)) ?? '#1e3a8a';
  const gradientId = `franchise-paint-${team.id}`;
  return (
    <g
      id="center-basketball-hardwood"
      transform="translate(1614, 1418.5) rotate(-90) scale(0.97) translate(-270.71, -454.96)"
    >
      <defs>
        <linearGradient id="franchise-court-wood" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ebdcc3" />
          <stop offset="50%" stopColor="#dec29b" />
          <stop offset="100%" stopColor="#c7a475" />
        </linearGradient>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={primary} stopOpacity="0.72" />
          <stop offset="100%" stopColor={primary} stopOpacity="0.92" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="541.42" height="909.92" rx="6" fill="#0f172a" stroke={primary} strokeWidth="9" />
      <rect x="28.35" y="28.35" width="484.72" height="853.23" rx="4" fill="url(#franchise-court-wood)" stroke="#b88c5a" strokeWidth="3" />

      <g fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="56.69" y="56.69" width="428.04" height="796.54" />
        <line x1="56.69" y1="454.96" x2="484.73" y2="454.96" />
        <circle cx="270.71" cy="454.96" r="51.02" />

        <line x1="83.6" y1="58.11" x2="83.6" y2="143.29" />
        <line x1="456.28" y1="58.11" x2="456.28" y2="143.29" />
        <path d="M 83.6 143.29 C 83.6 280, 456.28 280, 456.28 143.29" />
        <line x1="83.7" y1="852.48" x2="83.7" y2="767.3" />
        <line x1="456.38" y1="852.48" x2="456.38" y2="767.3" />
        <path d="M 83.7 767.3 C 83.7 630, 456.38 630, 456.38 767.3" />

        <rect x="201.29" y="56.69" width="138.89" height="165.97" fill={`url(#${gradientId})`} />
        <path d="M 201.29 222.66 A 69.44 69.44 0 0 0 340.18 222.66" />
        <path d="M 233.79 102.79 A 36.84 36.84 0 0 1 307.47 102.79" strokeWidth="2" />
        <rect x="201.29" y="686.51" width="138.89" height="165.97" fill={`url(#${gradientId})`} />
        <path d="M 201.29 686.51 A 69.44 69.44 0 0 1 340.18 686.51" />
        <path d="M 233.9 807.79 A 36.84 36.84 0 0 0 307.57 807.79" strokeWidth="2" />

        <line x1="198.35" y1="107.76" x2="201.29" y2="107.76" />
        <line x1="340.18" y1="107.76" x2="343.12" y2="107.76" />
        <line x1="198.35" y1="133.29" x2="201.29" y2="133.29" />
        <line x1="340.18" y1="133.29" x2="343.12" y2="133.29" />
        <line x1="198.35" y1="168.76" x2="201.29" y2="168.76" />
        <line x1="340.18" y1="168.76" x2="343.12" y2="168.76" />
        <line x1="198.46" y1="801.41" x2="201.29" y2="801.41" />
        <line x1="340.18" y1="801.41" x2="343.12" y2="801.41" />
        <line x1="198.46" y1="765.95" x2="201.29" y2="765.95" />
        <line x1="340.18" y1="765.95" x2="343.12" y2="765.95" />
        <line x1="198.46" y1="714.88" x2="201.29" y2="714.88" />
        <line x1="340.18" y1="714.88" x2="343.12" y2="714.88" />
      </g>

      <g transform="rotate(90, 270.71, 454.96)">
        {team.logoUrl ? (
          <image
            href={team.logoUrl}
            x="215.71"
            y="399.96"
            width="110"
            height="110"
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <text
            x="270.71"
            y="462"
            fill="#ffffff"
            fontSize="20"
            fontWeight="900"
            textAnchor="middle"
            style={{ fontFamily: 'system-ui, sans-serif', letterSpacing: '1px' }}
          >
            {getTeamNickname(team).toUpperCase()}
          </text>
        )}
      </g>
    </g>
  );
};
