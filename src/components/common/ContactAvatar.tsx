import React, { useState, useEffect, useRef } from 'react';

interface ContactAvatarProps {
  name: string;
  portraitUrl?: string;
  teamLogoUrl?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

export const ContactAvatar: React.FC<ContactAvatarProps> = ({
  name,
  portraitUrl,
  teamLogoUrl,
  className = "",
  size = 'md'
}) => {
  const [retryCount, setRetryCount] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRetryCount(0);
    setImgFailed(false);
  }, [portraitUrl, teamLogoUrl, name]);

  useEffect(() => {
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, []);

  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-12 h-12 text-sm'
  };

  const containerClasses = `rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden bg-slate-800 text-slate-400 ${sizeClasses[size]} ${className}`;

  const hasValidPortrait = portraitUrl && portraitUrl.trim().length > 0 && !imgFailed;

  const handleImgError = () => {
    if (retryCount < MAX_RETRIES) {
      retryTimer.current = setTimeout(() => {
        setRetryCount(c => c + 1);
      }, RETRY_DELAY_MS);
    } else {
      setImgFailed(true);
    }
  };

  if (hasValidPortrait) {
    return (
      <div className={containerClasses}>
        <img
          key={`${portraitUrl}-${retryCount}`}
          src={portraitUrl}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={handleImgError}
        />
      </div>
    );
  }

  // Fallback to team logo if available
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
