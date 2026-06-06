import { useEffect, useState } from 'react';

type CoachingWelcomeTab = 'GAMEPLAN' | 'IDEAL' | 'SYSTEM' | 'COACHING' | 'PREFERENCES' | 'STAFF';

const STORAGE_PREFIX = 'coaching-tab-welcome-seen-v1::';
const WELCOME_TABS: CoachingWelcomeTab[] = ['GAMEPLAN', 'IDEAL', 'SYSTEM', 'COACHING', 'PREFERENCES', 'STAFF'];

function storageKey(saveId: string, tab: CoachingWelcomeTab) {
  return `${STORAGE_PREFIX}${saveId}::${tab}`;
}

function hasSeen(saveId: string, tab: CoachingWelcomeTab): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(storageKey(saveId, tab)) === '1';
  } catch {
    return true;
  }
}

function markSeen(saveId: string, tab: CoachingWelcomeTab): void {
  try {
    window.localStorage.setItem(storageKey(saveId, tab), '1');
  } catch {
    // ignore
  }
}

export function useCoachingTabWelcome(saveId: string | undefined | null, activeTab: string) {
  const scopedSaveId = saveId && saveId.length > 0 ? saveId : 'default';
  const [closedThisSession, setClosedThisSession] = useState<Record<CoachingWelcomeTab, boolean>>({
    GAMEPLAN: false,
    IDEAL: false,
    SYSTEM: false,
    COACHING: false,
    PREFERENCES: false,
    STAFF: false,
  });
  const [seenPermanently, setSeenPermanently] = useState<Record<CoachingWelcomeTab, boolean>>({
    GAMEPLAN: true,
    IDEAL: true,
    SYSTEM: true,
    COACHING: true,
    PREFERENCES: true,
    STAFF: true,
  });

  useEffect(() => {
    setSeenPermanently({
      GAMEPLAN: hasSeen(scopedSaveId, 'GAMEPLAN'),
      IDEAL: hasSeen(scopedSaveId, 'IDEAL'),
      SYSTEM: hasSeen(scopedSaveId, 'SYSTEM'),
      COACHING: hasSeen(scopedSaveId, 'COACHING'),
      PREFERENCES: hasSeen(scopedSaveId, 'PREFERENCES'),
      STAFF: hasSeen(scopedSaveId, 'STAFF'),
    });
    setClosedThisSession({
      GAMEPLAN: false,
      IDEAL: false,
      SYSTEM: false,
      COACHING: false,
      PREFERENCES: false,
      STAFF: false,
    });
  }, [scopedSaveId]);

  const currentTab: CoachingWelcomeTab | null = WELCOME_TABS.includes(activeTab as CoachingWelcomeTab)
    ? (activeTab as CoachingWelcomeTab)
    : null;

  const open = !!currentTab && !seenPermanently[currentTab] && !closedThisSession[currentTab];

  const close = () => {
    if (!currentTab) return;
    setClosedThisSession(prev => ({ ...prev, [currentTab]: true }));
  };

  const dontShowAgain = () => {
    if (!currentTab) return;
    markSeen(scopedSaveId, currentTab);
    setSeenPermanently(prev => ({ ...prev, [currentTab]: true }));
    setClosedThisSession(prev => ({ ...prev, [currentTab]: true }));
  };

  return { open, currentTab, close, dontShowAgain };
}
