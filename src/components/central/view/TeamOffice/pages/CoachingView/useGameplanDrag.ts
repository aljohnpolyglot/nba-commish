import React, { useEffect, useRef, useState } from 'react';

interface UseGameplanDragArgs {
  canEdit: boolean;
  handleTap: (id: string) => void;
  performSwap: (sourceId: string, targetId: string) => void;
}

export function useGameplanDrag({ canEdit, handleTap, performSwap }: UseGameplanDragArgs) {
  const dragThreshold = 8;
  const [drag, setDrag] = useState<null | {
    id: string;
    source: 'starter' | 'rotation';
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    active: boolean;
  }>(null);
  const dragRef = useRef(drag);
  const suppressNextClick = useRef(false);
  const handleTapRef = useRef(handleTap);
  const performSwapRef = useRef(performSwap);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    handleTapRef.current = handleTap;
    performSwapRef.current = performSwap;
  }, [handleTap, performSwap]);

  const onCardPointerDown = (id: string, source: 'starter' | 'rotation') => (e: React.PointerEvent) => {
    if (!canEdit || (e.button !== undefined && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest('input, button, [data-no-drag]')) return;
    setDrag({ id, source, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false });
  };

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: PointerEvent) => {
      const currentDrag = dragRef.current;
      if (!currentDrag) return;
      const dx = e.clientX - currentDrag.startX;
      const dy = e.clientY - currentDrag.startY;
      const active = currentDrag.active || Math.hypot(dx, dy) > dragThreshold;
      setDrag({ ...currentDrag, dx, dy, active });
      if (active) e.preventDefault();
    };
    const finish = (e: PointerEvent) => {
      const currentDrag = dragRef.current;
      if (!currentDrag) {
        setDrag(null);
        return;
      }
      if (!currentDrag.active) {
        suppressNextClick.current = true;
        handleTapRef.current(currentDrag.id);
        setDrag(null);
        window.setTimeout(() => {
          suppressNextClick.current = false;
        }, 500);
        return;
      }
      const dropTarget = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.(
        '[data-player-id]',
      ) as HTMLElement | null;
      const targetId = dropTarget?.getAttribute('data-player-id');
      suppressNextClick.current = true;
      if (targetId && targetId !== currentDrag.id) performSwapRef.current(currentDrag.id, targetId);
      setDrag(null);
      window.setTimeout(() => {
        suppressNextClick.current = false;
      }, 500);
    };
    const cancel = () => {
      setDrag(null);
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drag]);

  const dragStyle = (id: string, source: 'starter' | 'rotation') => {
    if (!drag || drag.id !== id || drag.source !== source || !drag.active) return undefined;
    return {
      transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(1.06)`,
      zIndex: 50,
      opacity: 0.92,
      boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
      transition: 'none',
      pointerEvents: 'none',
    } satisfies React.CSSProperties;
  };

  const handleCardClick = (id: string) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (!drag) handleTap(id);
  };

  return { drag, onCardPointerDown, dragStyle, handleCardClick };
}
