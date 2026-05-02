import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart2 } from 'lucide-react';
import { NBAPlayer } from '../../types';
import { PlayerHoverCard } from './PlayerHoverCard';
import { PlayerHoverCardK2 } from './PlayerHoverCardK2';
import { SettingsManager } from '../../services/SettingsManager';

interface Props {
  player: NBAPlayer;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const PlayerNameWithHover: React.FC<Props> = ({ player, children, className, onClick }) => {
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFrom = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const centerX = r.left + r.width / 2;
    const x = Math.min(Math.max(132, centerX), window.innerWidth - 132);
    setPos({ x, y: window.innerHeight / 2, above: false });
  }, []);

  const hide = useCallback(() => {
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    setPos(null);
  }, []);

  // Desktop: hover on the name
  const onMouseEnter = useCallback(() => showFrom(nameRef.current), [showFrom]);
  const onMouseLeave = useCallback(hide, [hide]);

  // Mobile: tap the icon button
  const onIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (pos) { hide(); return; }
    showFrom(iconRef.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(hide, 3000);
  }, [pos, showFrom, hide]);

  // Dismiss on outside click/touch
  useEffect(() => {
    if (!pos) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (iconRef.current?.contains(target) || nameRef.current?.contains(target)) return;
      hide();
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [pos, hide]);

  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  return (
    <>
      <span ref={nameRef} className={className} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {children}
      </span>
      {/* Stats icon — only visible on touch/mobile devices */}
      <button
        ref={iconRef}
        onClick={onIconClick}
        className="md:hidden inline-flex items-center justify-center ml-1 text-slate-500 hover:text-slate-300 align-middle"
        style={{ lineHeight: 0 }}
        tabIndex={-1}
        aria-label="View player stats"
      >
        <BarChart2 size={10} />
      </button>
      {pos && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {SettingsManager.getSettings().tooltipStyle === 'simple'
            ? <PlayerHoverCard player={player} />
            : <PlayerHoverCardK2 player={player} />}
        </div>,
        document.body,
      )}
    </>
  );
};
