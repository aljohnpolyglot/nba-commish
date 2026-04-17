//delete this because this is laready from shared.

import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { convertTo2KRating } from '../lib/k2Engine';

export interface PlayerPortraitProps {
  imgUrl?: string;
  teamLogoUrl?: string;
  overallRating?: number;
  /** Player ratings array — used to apply tp elite bonus to the OVR badge */
  ratings?: any[];
  /** Portrait diameter in px (default 48) */
  size?: number;
  /** Show the incoming arrow badge (blue, bottom-left) */
  isIncoming?: boolean;
  /** Custom badge content instead of OVR number */
  ovrLabel?: string;
}

/**
 * Reusable player portrait with:
 *  - circular player photo
 *  - team logo badge (top-left)
 *  - OVR rating badge (bottom-right)
 *  - optional incoming-trade arrow badge (bottom-left)
 *
 * Used in TradeMachineModal PlayerRow and anywhere else a
 * portrait-with-badges treatment is needed.
 */
export const PlayerPortrait: React.FC<PlayerPortraitProps> = ({
  imgUrl,
  teamLogoUrl,
  overallRating,
  ratings,
  size = 48,
  isIncoming = false,
  ovrLabel,
}) => {
  const px = `${size}px`;
  const badgeSize = Math.round(size * 0.5);  // team logo badge ~50% of portrait
  const ovrSize = Math.round(size * 0.5);     // OVR badge

  return (
    <div className="relative flex-shrink-0" style={{ width: px, height: px }}>
      {/* Player photo */}
      <img
        src={imgUrl}
        alt=""
        className="rounded-full object-cover bg-slate-800 border-2 border-slate-700 group-hover:border-slate-500 transition-colors w-full h-full"
        referrerPolicy="no-referrer"
      />

      {/* Team logo — top-left */}
      {teamLogoUrl && (
        <div
          className="absolute -top-1 -left-1 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center p-0.5 shadow-xl z-10"
          style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }}
        >
          <img src={teamLogoUrl} alt="" className="w-full h-full object-contain" />
        </div>
      )}

      {/* Incoming trade indicator — bottom-left (replaces team logo slot on that side) */}
      {isIncoming && (
        <div className="absolute -bottom-1 -left-1 bg-indigo-500 rounded-full p-1 border-2 border-slate-900 shadow-lg z-10">
          <ArrowLeftRight size={8} className="text-white" strokeWidth={3} />
        </div>
      )}

      {/* OVR badge — bottom-right */}
      {overallRating !== undefined && (
        <div className="absolute -bottom-1 -right-1 bg-slate-950 border-2 border-slate-800 rounded-lg px-1.5 py-0.5 shadow-lg z-10">
          <span className="text-[9px] font-black text-white italic">
            {ovrLabel ?? convertTo2KRating(overallRating ?? 0, ratings?.[ratings.length - 1]?.hgt ?? 50, ratings?.[ratings.length - 1]?.tp)}
          </span>
        </div>
      )}
    </div>
  );
};
