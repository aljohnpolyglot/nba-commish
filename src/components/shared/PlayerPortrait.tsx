import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { convertTo2KRating, extractNbaId, hdPortrait } from '../../utils/helpers';

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
  /** Player name — used for initials fallback */
  playerName?: string;
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
  playerName,
}) => {
  const px = `${size}px`;
  const badgeSize = Math.round(size * 0.5);  // team logo badge ~50% of portrait

  // Fallback chain: BBGM portrait → NBA HD CDN → initials avatar
  const [imgSrc, setImgSrc] = useState<string | null>(imgUrl ?? null);
  const [fallbackLevel, setFallbackLevel] = useState(0);

  const handleImgError = () => {
    if (fallbackLevel === 0) {
      // Try NBA HD CDN
      const nbaId = extractNbaId(imgUrl ?? '', playerName);
      if (nbaId) {
        setImgSrc(hdPortrait(nbaId));
        setFallbackLevel(1);
        return;
      }
    }
    // Give up — show initials
    setImgSrc(null);
    setFallbackLevel(2);
  };

  const initials = playerName
    ? playerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="relative flex-shrink-0" style={{ width: px, height: px }}>
      {/* Player photo */}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={playerName ?? ''}
          className="rounded-full object-cover bg-slate-800 border-2 border-slate-700 group-hover:border-slate-500 transition-colors w-full h-full"
          referrerPolicy="no-referrer"
          onError={handleImgError}
        />
      ) : (
        <div
          className="rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center w-full h-full"
          style={{ fontSize: `${Math.round(size * 0.33)}px` }}
        >
          <span className="font-black text-slate-300">{initials}</span>
        </div>
      )}

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
