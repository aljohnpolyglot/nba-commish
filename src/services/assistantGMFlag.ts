let _active = false;
export const setAssistantGMActive = (v: boolean) => { _active = v; };
export const isAssistantGMActive = () => _active;

type AssistantGMDraftEvent = 'lottery' | 'draft';
let _authorizedDraftEvent: { type: AssistantGMDraftEvent; date: string } | null = null;

export const authorizeAssistantGMDraftEvent = (type: AssistantGMDraftEvent, date: string) => {
  _authorizedDraftEvent = { type, date };
};

export const isAssistantGMDraftEventAuthorized = (type: AssistantGMDraftEvent, date: string): boolean => (
  _authorizedDraftEvent?.type === type && _authorizedDraftEvent.date === date
);

export const consumeAssistantGMDraftEvent = (type: AssistantGMDraftEvent, date: string): boolean => {
  if (!isAssistantGMDraftEventAuthorized(type, date)) return false;
  _authorizedDraftEvent = null;
  return true;
};

export const clearAssistantGMDraftEventAuthorization = () => {
  _authorizedDraftEvent = null;
};

export const shouldPauseForManualDraftEvent = (
  gameMode: string | undefined,
  _assistantGM: boolean,
  eventAuthorized: boolean,
): boolean => (gameMode === 'gm' || gameMode === 'commissioner') && !eventAuthorized;
