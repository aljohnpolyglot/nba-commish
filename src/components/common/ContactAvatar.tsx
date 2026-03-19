import React, { useState, useEffect } from 'react';

interface ContactAvatarProps {
  name: string;
  portraitUrl?: string;
  teamLogoUrl?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Module-level cache — string = verified URL, null = failed, undefined = not tried
const imgCache = new Map<string, string | null>();

const tryLoad = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(url);
    img.onerror = reject;
    img.src = url;
  });

export const ContactAvatar: React.FC<ContactAvatarProps> = ({
  name,
  portraitUrl,
  teamLogoUrl,
  className = "",
  size = 'md'
}) => {
  // resolvedSrc: undefined = still resolving, null = all failed, string = use this
  const [resolvedSrc, setResolvedSrc] = useState<string | null | undefined>(() => {
    if (!portraitUrl) return null;
    const cached = imgCache.get(portraitUrl);
    return cached !== undefined ? cached : undefined;
  });

  useEffect(() => {
    if (!portraitUrl) { setResolvedSrc(null); return; }

    const cached = imgCache.get(portraitUrl);
    if (cached !== undefined) { setResolvedSrc(cached); return; }

    // Still resolving — start preload
    setResolvedSrc(undefined);
    tryLoad(portraitUrl)
      .then(url => { imgCache.set(portraitUrl, url); setResolvedSrc(url); })
      .catch(() => { imgCache.set(portraitUrl, null); setResolvedSrc(null); });
  }, [portraitUrl]);

  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-12 h-12 text-sm'
  };

  const containerClasses = `rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden bg-slate-800 text-slate-400 ${sizeClasses[size]} ${className}`;

  if (resolvedSrc) {
    return (
      <div className={containerClasses}>
        <img
          src={resolvedSrc}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // Fallback to team logo if portrait failed or still loading
  if (teamLogoUrl && teamLogoUrl.trim().length > 0) {
    return (
      <div className={containerClasses}>
        <img
          src={teamLogoUrl}
          alt="Team Logo"
          className="w-full h-full object-contain p-1"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // Final fallback to initials
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={containerClasses}>
      {initials}
    </div>
  );
};
