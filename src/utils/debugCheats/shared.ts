import type { GameState } from '../../types';

export interface CheatContext {
  state: GameState;
  dispatchAction: (action: any) => Promise<void> | void;
  healPlayer?: (playerId: string) => void;
}

export interface CheatResult {
  title: string;
  body: string;
  ok: boolean;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
