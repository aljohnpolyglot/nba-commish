import React from 'react';

const LoadingSpinner: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'text-indigo-500' }) => {
  return (
    <div 
      className={`animate-spin rounded-full border-2 border-t-transparent ${color}`}
      style={{ width: size, height: size }}
    />
  );
};

export default LoadingSpinner;
