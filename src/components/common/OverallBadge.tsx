import React from 'react';

interface OverallBadgeProps {
  ovr: number;
  className?: string;
  size?: 'sm' | 'md';
}

export const OverallBadge: React.FC<OverallBadgeProps> = ({ ovr, className = "", size = 'md' }) => {
  const getColors = (rating: number) => {
    if (rating >= 97) return 'bg-gradient-to-br from-rose-600 to-rose-800 text-white border-rose-400 shadow-rose-900/50';
    if (rating >= 90) return 'bg-gradient-to-br from-amber-400 to-amber-600 text-white border-amber-200 shadow-amber-900/50';
    if (rating >= 80) return 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-slate-900 border-yellow-100 shadow-yellow-900/30';
    if (rating >= 70) return 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 border-slate-50 shadow-slate-900/20';
    return 'bg-gradient-to-br from-orange-700 to-orange-900 text-orange-100 border-orange-500 shadow-orange-900/40';
  };

  const sizeClasses = {
    sm: 'w-7 h-7 text-[11px]',
    md: 'w-9 h-9 text-[13px]'
  };

  return (
    <div className={`
      ${sizeClasses[size]} 
      ${getColors(ovr)} 
      rounded-full flex items-center justify-center font-black border-2 shadow-lg shrink-0
      transform hover:scale-110 transition-transform cursor-default
      ${className}
    `}>
      {ovr}
    </div>
  );
};
