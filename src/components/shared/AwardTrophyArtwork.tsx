import React, { useEffect, useState } from 'react';
import {
  getCachedAwardTrophyCatalog,
  loadAwardTrophyCatalog,
  type AwardTrophyPhoto,
} from '../../services/awards/awardTrophyPhotos';

export function useAwardTrophyCatalog(enabled: boolean): AwardTrophyPhoto[] {
  const [catalog, setCatalog] = useState<AwardTrophyPhoto[]>(() => enabled ? getCachedAwardTrophyCatalog() : []);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setCatalog([]);
      return () => { active = false; };
    }
    loadAwardTrophyCatalog().then(entries => {
      if (active) setCatalog(entries);
    });
    return () => { active = false; };
  }, [enabled]);

  return catalog;
}

export const AwardTrophyArtwork: React.FC<{
  src?: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallback: React.ReactNode;
}> = ({ src, alt, className = '', style, fallback }) => (
  <div className={`relative flex items-center justify-center ${className}`} style={style}>
    {fallback}
    {src && (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-contain"
        onError={event => event.currentTarget.remove()}
      />
    )}
  </div>
);
