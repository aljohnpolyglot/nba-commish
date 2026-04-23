import React, { useState, useEffect } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MyFace, isRealFaceConfig } from './MyFace';
import { convertTo2KRating } from '../../utils/helpers';

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
  /** facesjs face descriptor — rendered when imgUrl is absent. Only generated prospects carry this. */
  face?: any;
}

/**
 * Reusable player portrait with:
 *  - circular player photo
 *  - team logo badge (top-left)
 *  - OVR rating badge (bottom-right)
 *  - optional incoming-trade arrow badge (bottom-left)
 *
 * Canonical player headshot / facesjs renderer.
 * Use this instead of duplicating img/MyFace/initials fallback logic in view files.
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
  face,
}) => {
  const px = `${size}px`;
  const badgeSize = Math.round(size * 0.5);  // team logo badge ~50% of portrait

  // Fallback: BBGM/ProBallers portrait → initials avatar (no NBA CDN fallback — those are passport-style headshots)
  const [imgSrc, setImgSrc] = useState<string | null>(imgUrl ?? null);

  // Reset when the imgUrl prop changes (e.g. navigating between players without unmount)
  useEffect(() => {
    setImgSrc(imgUrl ?? null);
  }, [imgUrl]);

  const handleImgError = () => {
    setImgSrc(null);
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
      ) : isRealFaceConfig(face) ? (
        // Prospect-only: facesjs cartoon via shared MyFace wrapper.
        // MyFace enforces facesjs's required 2:3 aspect ratio — we just give it a tall container
        // and center-crop to the circular clip so it still reads as a portrait thumbnail.
        <div className="rounded-full bg-slate-700 border-2 border-slate-600 overflow-hidden w-full h-full relative">
          <div className="absolute left-1/2 top-1/2" style={{ width: size * 0.85, height: size * 1.275, transform: 'translate(-50%, -50%)' }}>
            <MyFace face={face} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
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
