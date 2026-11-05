import { useEffect, useRef } from 'react';

export function useFantasyDraftSessionSync<T>(session: T, onSessionChange?: (session: T) => void): void {
  const onSessionChangeRef = useRef(onSessionChange);

  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
  }, [onSessionChange]);

  useEffect(() => {
    onSessionChangeRef.current?.(session);
  }, [session]);
}
