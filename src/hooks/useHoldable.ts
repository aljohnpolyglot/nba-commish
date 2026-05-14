import React from 'react';

/**
 * Press-and-hold accelerating stepper. Click fires once; long press fires
 * repeatedly with gentle acceleration (160ms → 40ms). Lifted from SigningModal
 * so other UIs (Transfer Market, etc.) can reuse it.
 */
export function useHoldable(callback: () => void, disabled: boolean) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = React.useRef(160);
  const isHoldingRef = React.useRef(false);

  const run = React.useCallback(() => {
    if (disabled) return;
    isHoldingRef.current = true;
    callback();
    speedRef.current = Math.max(40, speedRef.current * 0.88);
    timerRef.current = setTimeout(run, speedRef.current);
  }, [callback, disabled]);

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    isHoldingRef.current = false;
    speedRef.current = 160;
    timerRef.current = setTimeout(run, 350);
  }, [disabled, run]);

  const onPointerUpOrLeave = React.useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onClick = React.useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    if (isHoldingRef.current) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      callback();
    }
  }, [callback, disabled]);

  return {
    onPointerDown,
    onPointerUp: onPointerUpOrLeave,
    onPointerCancel: onPointerUpOrLeave,
    onClick,
  };
}
