import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'training-center-welcome-seen-v1::';

function storageKey(saveId: string) {
  return `${STORAGE_PREFIX}${saveId}`;
}

export function hasSeenTrainingCenterWelcome(saveId: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(storageKey(saveId)) === '1';
  } catch {
    return true;
  }
}

export function markTrainingCenterWelcomeSeen(saveId: string): void {
  try {
    window.localStorage.setItem(storageKey(saveId), '1');
  } catch {
    // ignore
  }
}

export function useTrainingCenterWelcome(saveId: string | undefined | null) {
  const scopedSaveId = saveId && saveId.length > 0 ? saveId : 'default';
  const [seenPermanently, setSeenPermanently] = useState(true);
  const [closedThisSession, setClosedThisSession] = useState(false);

  useEffect(() => {
    const seen = hasSeenTrainingCenterWelcome(scopedSaveId);
    setSeenPermanently(seen);
    setClosedThisSession(false);
  }, [scopedSaveId]);

  const close = () => {
    setClosedThisSession(true);
  };

  const dontShowAgain = () => {
    markTrainingCenterWelcomeSeen(scopedSaveId);
    setSeenPermanently(true);
    setClosedThisSession(true);
  };

  return { open: !seenPermanently && !closedThisSession, close, dontShowAgain };
}
