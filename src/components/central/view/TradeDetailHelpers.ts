import { NBAPlayer } from '../../../types';
import { convertTo2KRating } from '../../../utils/helpers';
import { ParsedTrade, TradeSide } from './TradeDetailTypes';

export function splitPlayersPicks(raw: string): TradeSide {
  const tokens = raw
    .split(/\s+\+\s+|,/)
    .map(s => s.trim())
    .filter(Boolean);

  const playerNames: string[] = [];
  const pickStrs: string[] = [];
  const cashStrs: string[] = [];

  for (const rawToken of tokens) {
    const token = rawToken.replace(/^(?:a|an)\s+/i, '').trim();
    const isCash = /\$/.test(token) && /cash/i.test(token);
    const isPick = /\b(1st|2nd)\s+(Rd|Round)\b/i.test(token) || /\bRound\s*[12]\b/i.test(token) || /\bR[12]\b/i.test(token);
    if (isCash) {
      cashStrs.push(token);
    } else if (isPick) {
      pickStrs.push(token);
    } else {
      const cleanName = token.replace(/\s*\(\d+\s*OVR\)\s*$/i, '').trim();
      if (cleanName) playerNames.push(cleanName);
    }
  }

  return { playerNames, pickStrs, cashStrs };
}

export function parseTrade(text: string): ParsedTrade | null {
  const body = text.replace(/^TRADE:\s*/i, '').trim();

  const forcedTrade = body.match(/forced a trade between the (.+?)\s+and\s+(.+?),\s+overriding[^.]*\.\s+(.+?)\s+are headed to\s+\S+?;\s+(.+?)\s+to\s+\S+?\.\s/i);
  if (forcedTrade) {
    return {
      teamAName: forcedTrade[1].trim(),
      teamBName: forcedTrade[2].trim(),
      aReceived: splitPlayersPicks(forcedTrade[4].trim()),
      bReceived: splitPlayersPicks(forcedTrade[3].trim()),
    };
  }

  const finalizedTrade = body.match(/^A trade has been finalized between the (.+?)\s+and\s+(.+?)\.\s+(.+?)\s+have been moved to the \S+?,\s+while\s+(.+?)\s+have been sent to the \S+?\.?$/i);
  if (finalizedTrade) {
    return {
      teamAName: finalizedTrade[1].trim(),
      teamBName: finalizedTrade[2].trim(),
      aReceived: splitPlayersPicks(finalizedTrade[4].trim()),
      bReceived: splitPlayersPicks(finalizedTrade[3].trim()),
    };
  }

  const completionTrade = body.match(/^(.+?)\s+and\s+(.+?)\s+complete a trade\.\s+\S+\s+receive:\s+(.+?)\.\s+\S+\s+receive:\s+(.+?)\.?$/i);
  if (completionTrade) {
    return {
      teamAName: completionTrade[1].trim(),
      teamBName: completionTrade[2].trim(),
      aReceived: splitPlayersPicks(completionTrade[4].trim()),
      bReceived: splitPlayersPicks(completionTrade[3].trim()),
    };
  }

  const picksOnlyTrade = body.match(/^(.+?)\s+and\s+(.+?)\s+exchange picks/i);
  if (picksOnlyTrade) {
    const exchanged = { playerNames: [], pickStrs: ['(picks exchanged)'], cashStrs: [] };
    return {
      teamAName: picksOnlyTrade[1].trim(),
      teamBName: picksOnlyTrade[2].trim(),
      aReceived: exchanged,
      bReceived: exchanged,
    };
  }

  const receivesTrade = body.match(/^(.+?)\s+receives\s+(.+?)\s+from\s+(.+)$/i);
  if (receivesTrade) {
    return {
      teamAName: receivesTrade[1].trim(),
      teamBName: receivesTrade[3].trim().replace(/\.$/, ''),
      aReceived: splitPlayersPicks(receivesTrade[2].trim()),
      bReceived: { playerNames: [], pickStrs: [], cashStrs: [] },
    };
  }

  const sendForTrade = body.match(/^(.+?)\s+sends\s+(.+?)\s+to\s+(.+?)\s+for\s+(.+)$/i);
  if (sendForTrade) {
    return {
      teamAName: sendForTrade[1].trim(),
      teamBName: sendForTrade[3].trim().replace(/\.$/, ''),
      aReceived: splitPlayersPicks(sendForTrade[4].trim().replace(/\.$/, '')),
      bReceived: splitPlayersPicks(sendForTrade[2].trim()),
    };
  }

  const sendTrade = body.match(/^(.+?)\s+sends\s+(.+?)\s+to\s+(.+)$/i);
  if (sendTrade) {
    const teamBRest = sendTrade[3].trim().replace(/\.$/, '');
    const plusIndex = teamBRest.indexOf(' + ');
    const teamBName = plusIndex !== -1 ? teamBRest.slice(0, plusIndex).trim() : teamBRest;
    const extraPicksRaw = plusIndex !== -1 ? teamBRest.slice(plusIndex + 3).trim() : '';
    const extraPicks = extraPicksRaw ? extraPicksRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const bReceived = splitPlayersPicks(sendTrade[2].trim());
    bReceived.pickStrs.push(...extraPicks);
    return {
      teamAName: sendTrade[1].trim(),
      teamBName,
      aReceived: { playerNames: [], pickStrs: [], cashStrs: [] },
      bReceived,
    };
  }

  return null;
}

export function getHistoricalOvr2K(player: NBAPlayer, tradeDateMs: number): number {
  const rating = player.ratings?.[player.ratings.length - 1];
  const height = rating?.hgt ?? 50;
  const tendencyProfile = rating?.tp;
  const timeline = player.ovrTimeline;
  if (!timeline || timeline.length === 0) {
    return convertTo2KRating(player.overallRating ?? rating?.ovr ?? 50, height, tendencyProfile);
  }
  let bestOvr = timeline[0].ovr;
  for (const entry of timeline) {
    if (new Date(entry.date).getTime() <= tradeDateMs) bestOvr = entry.ovr;
  }
  return convertTo2KRating(bestOvr, height, tendencyProfile);
}

export function getPostTradeWS(player: NBAPlayer, tradeYear: number): { ws: number; tids: Set<number> } {
  const tids = new Set<number>();
  let ws = 0;
  for (const seasonStat of (player.stats ?? [])) {
    if ((seasonStat.season ?? 0) < tradeYear) continue;
    if ((seasonStat.gp ?? 0) <= 0) continue;
    ws += (seasonStat as { ws?: number }).ws ?? 0;
    if (typeof seasonStat.tid === 'number' && seasonStat.tid >= 0) tids.add(seasonStat.tid);
  }
  return { ws, tids };
}

export function getHistoricalPot2K(player: NBAPlayer, tradeDateMs: number, tradeYear: number): number {
  const rating = player.ratings?.[player.ratings.length - 1];
  const height = rating?.hgt ?? 50;
  const tendencyProfile = rating?.tp;
  const timeline = player.ovrTimeline;
  let bbgmOvr: number;
  if (!timeline || timeline.length === 0) {
    bbgmOvr = player.overallRating ?? rating?.ovr ?? 50;
  } else {
    bbgmOvr = timeline[0].ovr;
    for (const entry of timeline) {
      if (new Date(entry.date).getTime() <= tradeDateMs) bbgmOvr = entry.ovr;
    }
  }
  const age = player.born?.year ? tradeYear - player.born.year : 26;
  const potBbgm = age >= 29 ? bbgmOvr : Math.max(bbgmOvr, Math.round(72.314 + (-2.331 * age) + (0.833 * bbgmOvr)));
  return convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), height, tendencyProfile);
}

export function ovrColor(ovr: number): string {
  if (ovr >= 90) return 'text-amber-400';
  if (ovr >= 85) return 'text-emerald-400';
  if (ovr >= 80) return 'text-blue-400';
  return 'text-slate-400';
}

export function ovrBgColor(ovr: number): string {
  if (ovr >= 90) return 'bg-amber-500/20 border-amber-500/30 text-amber-300';
  if (ovr >= 85) return 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300';
  if (ovr >= 80) return 'bg-blue-500/20 border-blue-500/30 text-blue-300';
  return 'bg-slate-700/50 border-slate-600/30 text-slate-300';
}
