import React, { useEffect, useState } from 'react';

export default function Confetti() {
  const [pieces, setPieces] = useState<Array<{ id: number; left: string; delay: string; color: string; duration: string }>>([]);

  useEffect(() => {
    const colors = ['#3b82f6', '#f97316', '#eab308', '#ec4899', '#a855f7'];
    const newPieces = Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 2}s`,
      duration: `${Math.random() * 2 + 2}s`,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute top-[-20px] w-3 h-6 rounded-sm animate-confetti-fall"
          style={{
            left: p.left,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            transform: `rotate(${Math.random() * 360}deg)`
          }}
        />
      ))}
    </div>
  );
}
