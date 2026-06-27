import React from 'react';

export function FieldSvg({ className }: { className?: string }) {
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%">
    <rect width="800" height="500" fill="#9bc66c" />
    <circle cx="400" cy="250" r="230" fill="none" stroke="#fff" stroke-width="4" />
    <circle cx="400" cy="250" r="140" fill="none" stroke="#dddbce" stroke-width="2" />
    <path d="M 400 20 L 400 480" stroke="#fff" stroke-width="4" stroke-dasharray="10 10" />
    <path d="M 20 250 L 780 250" stroke="#fff" stroke-width="4" />
    
    <path d="M300 250 L 500 50 L 500 450 Z" fill="rgba(255,255,255,0.1)" stroke="#fff" stroke-width="2" />

    <text x="750" y="240" fill="#fff" font-family="sans-serif" font-size="20">FIELD</text>
  </svg>`;
  return <div className={className} dangerouslySetInnerHTML={{ __html: content }} />;
}
