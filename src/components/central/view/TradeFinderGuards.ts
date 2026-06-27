import type { NBAPlayer } from '../../../types';
import { isPbaConferenceImport } from '../../../services/trade/tradeFinderShared';

export function isPbaImportTradeLocked(player: NBAPlayer, pbaMode: boolean): boolean {
  if (!pbaMode) return false;
  return isPbaConferenceImport(player);
}
