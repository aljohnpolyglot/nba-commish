import React, { useMemo, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRightLeft, Calendar, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer, NBATeam } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import { calcOvr2K, calcPot2K, getPotColor } from '../../../services/trade/tradeValueEngine';
import { convertTo2KRating } from '../../../utils/helpers';
import { cn } from '../../../lib/utils';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeEntry {
  text: string;
  date: string;
}

interface Props {
  entry: TradeEntry;
  /** Additional legs for multi-team trades (3-team, etc.) */
  legs?: TradeEntry[];
  onBack: () => void;
}

interface TradeSide {
  playerNames: string[];
  pickStrs: string[];
  cashStrs: string[];
}

interface ParsedTrade {
  teamAName: string;
  teamBName: string;
  /** What Team A received (from Team B) */
  aReceived: TradeSide;
  /** What Team B received (from Team A) */
  bReceived: TradeSide;
}

// ─── Text parser ──────────────────────────────────────────────────────────────

/**
 * Split a raw segment into { playerNames, pickStrs, cashStrs } by classifying
 * each comma- or +-separated token. Handles all generator formats:
 *  - "Player Name" (AITradeHandler)
 *  - "Player Name (88 OVR)" (tradeService)
 *  - "2026 1st Rd (DAL)" / "2026 1st Round (DAL)" / "a 2026 Round 1 pick"
 *  - "$2.7M cash"
 */
function splitPlayersPicks(raw: string): TradeSide {
  const tokens = raw
    .split(/\s+\+\s+|,/)
    .map(s => s.trim())
    .filter(Boolean);

  const playerNames: string[] = [];
  const pickStrs: string[] = [];
  const cashStrs: string[] = [];

  for (const rawTok of tokens) {
    // tradeService createTradeAction builds "for a 2026 Round 1 pick." — strip
    // the leading "a "/"an " article so the pick token reads cleanly.
    const tok = rawTok.replace(/^(?:a|an)\s+/i, '').trim();
    const isCash = /\$/.test(tok) && /cash/i.test(tok);
    // Pick formats from formatPickLabel cover short ("1st Rd (SAS)") — no year —
    // and long ("2026 1st Round (SAS)") forms. Detect the round signature directly
    // rather than requiring a year, otherwise short-form picks get classified as players.
    const isPick =
      /\b(1st|2nd)\s+(Rd|Round)\b/i.test(tok) ||
      /\bRound\s*[12]\b/i.test(tok) ||
      /\bR[12]\b/i.test(tok);
    if (isCash) {
      cashStrs.push(tok);
    } else if (isPick) {
      pickStrs.push(tok);
    } else {
      // tradeService appends "(NN OVR)" to player names — strip it so
      // resolvePlayer can match against state.players by clean name.
      const cleanName = tok.replace(/\s*\(\d+\s*OVR\)\s*$/i, '').trim();
      if (cleanName) playerNames.push(cleanName);
    }
  }

  return { playerNames, pickStrs, cashStrs };
}

function parseTrade(text: string): ParsedTrade | null {
  // Strip leading "TRADE: " prefix if present
  const body = text.replace(/^TRADE:\s*/i, '').trim();

  // Format 6: commissioner-forced narrative (tradeActions fallback)
  // "Commissioner X has forced a trade between the TEAM_A and TEAM_B,
  //  overriding league cap rules. ASSETS_A are headed to ABBR_B; ASSETS_B to ABBR_A. ..."
  const f6 = body.match(/forced a trade between the (.+?)\s+and\s+(.+?),\s+overriding[^.]*\.\s+(.+?)\s+are headed to\s+\S+?;\s+(.+?)\s+to\s+\S+?\.\s/i);
  if (f6) {
    const teamAName = f6[1].trim();
    const teamBName = f6[2].trim();
    const sentFromA = f6[3].trim(); // A → B
    const sentFromB = f6[4].trim(); // B → A
    return {
      teamAName,
      teamBName,
      aReceived: splitPlayersPicks(sentFromB),
      bReceived: splitPlayersPicks(sentFromA),
    };
  }

  // Format 4: executive-trade narrative
  // "A trade has been finalized between the TEAM_A and TEAM_B. ASSETS_A have been
  //  moved to the ABBREV_B, while ASSETS_B have been sent to the ABBREV_A."
  const f4 = body.match(/^A trade has been finalized between the (.+?)\s+and\s+(.+?)\.\s+(.+?)\s+have been moved to the \S+?,\s+while\s+(.+?)\s+have been sent to the \S+?\.?$/i);
  if (f4) {
    const teamAName = f4[1].trim();
    const teamBName = f4[2].trim();
    const sentFromA = f4[3].trim(); // A → B
    const sentFromB = f4[4].trim(); // B → A
    return {
      teamAName,
      teamBName,
      aReceived: splitPlayersPicks(sentFromB),
      bReceived: splitPlayersPicks(sentFromA),
    };
  }

  // Format 5: fallback executive-trade narrative (LLM empty-response variant)
  // "TEAM_A and TEAM_B complete a trade. ABBREV_B receive: ASSETS_A. ABBREV_A receive: ASSETS_B."
  const f5 = body.match(/^(.+?)\s+and\s+(.+?)\s+complete a trade\.\s+\S+\s+receive:\s+(.+?)\.\s+\S+\s+receive:\s+(.+?)\.?$/i);
  if (f5) {
    return {
      teamAName: f5[1].trim(),
      teamBName: f5[2].trim(),
      aReceived: splitPlayersPicks(f5[4].trim()),
      bReceived: splitPlayersPicks(f5[3].trim()),
    };
  }

  // Format 3: "Team A and Team B exchange picks."
  const f3 = body.match(/^(.+?)\s+and\s+(.+?)\s+exchange picks/i);
  if (f3) {
    return {
      teamAName: f3[1].trim(),
      teamBName: f3[2].trim(),
      aReceived: { playerNames: [], pickStrs: ['(picks exchanged)'], cashStrs: [] },
      bReceived: { playerNames: [], pickStrs: ['(picks exchanged)'], cashStrs: [] },
    };
  }

  // Format 7 (AITradeHandler one-sided receipt):
  //   "Team A receives ASSETS from Team B."
  // Mirror of Format 2 (one-sided send) — proposer gets the assets, receiver gives nothing back.
  const f7 = body.match(/^(.+?)\s+receives\s+(.+?)\s+from\s+(.+)$/i);
  if (f7) {
    const teamAName = f7[1].trim();
    const recvRaw = f7[2].trim();
    const teamBName = f7[3].trim().replace(/\.$/, '');
    return {
      teamAName,
      teamBName,
      aReceived: splitPlayersPicks(recvRaw),
      bReceived: { playerNames: [], pickStrs: [], cashStrs: [] },
    };
  }

  // Format 1: "Team A sends P1, P2 to Team B for P3 + pick1, pick2."
  const f1 = body.match(/^(.+?)\s+sends\s+(.+?)\s+to\s+(.+?)\s+for\s+(.+)$/i);
  if (f1) {
    const teamAName = f1[1].trim();
    const sentRaw = f1[2].trim();
    const teamBName = f1[3].trim().replace(/\.$/, '');
    const forRaw = f1[4].trim().replace(/\.$/, '');

    const bReceived = splitPlayersPicks(sentRaw);
    const aReceived = splitPlayersPicks(forRaw);

    return { teamAName, teamBName, aReceived, bReceived };
  }

  // Format 2: "Team A sends P1 to Team B + pick1, pick2."
  const f2 = body.match(/^(.+?)\s+sends\s+(.+?)\s+to\s+(.+)$/i);
  if (f2) {
    const teamAName = f2[1].trim();
    const sentRaw = f2[2].trim();
    const teamBRest = f2[3].trim().replace(/\.$/, '');

    // "Team B + pick1, pick2" — split at first " + "
    const plusIdx = teamBRest.indexOf(' + ');
    let teamBName: string;
    let extraPicksRaw: string;
    if (plusIdx !== -1) {
      teamBName = teamBRest.slice(0, plusIdx).trim();
      extraPicksRaw = teamBRest.slice(plusIdx + 3).trim();
    } else {
      teamBName = teamBRest;
      extraPicksRaw = '';
    }

    const extraPicks = extraPicksRaw
      ? extraPicksRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const bReceived = splitPlayersPicks(sentRaw);
    // extraPicks from "Team B + pick1, pick2" syntax are additional picks BKN receives
    bReceived.pickStrs.push(...extraPicks);

    return {
      teamAName,
      teamBName,
      aReceived: { playerNames: [], pickStrs: [], cashStrs: [] },
      bReceived,
    };
  }

  return null;
}

// ─── Historical rating helpers ────────────────────────────────────────────────

/** Get K2 OVR as it was on/before tradeDateMs using ovrTimeline. */
function getHistoricalOvr2K(player: NBAPlayer, tradeDateMs: number): number {
  const r = player.ratings?.[player.ratings.length - 1];
  const hgt = r?.hgt ?? 50;
  const tp = r?.tp;
  const timeline = player.ovrTimeline;
  if (!timeline || timeline.length === 0) {
    return convertTo2KRating(player.overallRating ?? r?.ovr ?? 50, hgt, tp);
  }
  let bestOvr = timeline[0].ovr;
  for (const entry of timeline) {
    if (new Date(entry.date).getTime() <= tradeDateMs) bestOvr = entry.ovr;
  }
  return convertTo2KRating(bestOvr, hgt, tp);
}

/**
 * Sum a player's Win Shares from the trade onward (season ≥ tradeYear).
 * Returns total WS plus the set of team IDs they accrued WS with post-trade,
 * so the UI can label "all with ABBR" vs listing multiple teams.
 */
function getPostTradeWS(player: NBAPlayer, tradeYear: number): { ws: number; tids: Set<number> } {
  const tids = new Set<number>();
  let ws = 0;
  for (const s of (player.stats ?? [])) {
    if ((s.season ?? 0) < tradeYear) continue;
    if ((s.gp ?? 0) <= 0) continue;
    ws += (s as any).ws ?? 0;
    if (typeof s.tid === 'number' && s.tid >= 0) tids.add(s.tid);
  }
  return { ws, tids };
}

/** Get K2 POT as it would have been at the trade date. */
function getHistoricalPot2K(player: NBAPlayer, tradeDateMs: number, tradeYear: number): number {
  const r = player.ratings?.[player.ratings.length - 1];
  const hgt = r?.hgt ?? 50;
  const tp = r?.tp;
  const timeline = player.ovrTimeline;
  let bbgmOvr: number;
  if (!timeline || timeline.length === 0) {
    bbgmOvr = player.overallRating ?? r?.ovr ?? 50;
  } else {
    bbgmOvr = timeline[0].ovr;
    for (const entry of timeline) {
      if (new Date(entry.date).getTime() <= tradeDateMs) bbgmOvr = entry.ovr;
    }
  }
  const age = player.born?.year ? tradeYear - player.born.year : 26;
  const potBbgm = age >= 29
    ? bbgmOvr
    : Math.max(bbgmOvr, Math.round(72.314 + (-2.331 * age) + (0.833 * bbgmOvr)));
  return convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), hgt, tp);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ovrColor(ovr: number): string {
  if (ovr >= 90) return 'text-amber-400';
  if (ovr >= 85) return 'text-emerald-400';
  if (ovr >= 80) return 'text-blue-400';
  return 'text-slate-400';
}

function ovrBgColor(ovr: number): string {
  if (ovr >= 90) return 'bg-amber-500/20 border-amber-500/30 text-amber-300';
  if (ovr >= 85) return 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300';
  if (ovr >= 80) return 'bg-blue-500/20 border-blue-500/30 text-blue-300';
  return 'bg-slate-700/50 border-slate-600/30 text-slate-300';
}

interface PlayerCardProps {
  player: NBAPlayer;
  currentYear: number;
  tradeDateMs: number;
  tradeYear: number;
  receivingTeam: NBATeam | null;
  teams: NBATeam[];
  onClick: (p: NBAPlayer) => void;
}

const PlayerReceivedCard: React.FC<PlayerCardProps> = ({ player, currentYear, tradeDateMs, tradeYear, receivingTeam, teams, onClick }) => {
  const historicalOvr = getHistoricalOvr2K(player, tradeDateMs);
  const historicalPot = getHistoricalPot2K(player, tradeDateMs, tradeYear);
  const currentOvr = calcOvr2K(player);
  const currentPot = calcPot2K(player, currentYear);
  const ovrChanged = Math.abs(currentOvr - historicalOvr) >= 1;
  const ageAtTrade = player.born?.year ? tradeYear - player.born.year : (player.age ?? 0);
  const salary = player.contract?.amount ?? 0;
  const salaryM = salary > 0 ? `$${(salary / 1000).toFixed(1)}M` : 'N/A';
  const expYear = player.contract?.exp;
  const injured = (player.injury?.gamesRemaining ?? 0) > 0;

  // Post-trade WS + team-list label ("all with ORL" or "with ORL, BOS")
  const { ws: postWS, tids: postTids } = getPostTradeWS(player, tradeYear);
  const tidList = Array.from(postTids);
  const recvTid = receivingTeam?.id;
  const onlyOnReceiving = tidList.length === 1 && tidList[0] === recvTid;
  const wsTeamLabel = (() => {
    if (tidList.length === 0) return '—';
    const abbrevs = tidList
      .map(tid => teams.find(t => t.id === tid)?.abbrev ?? '?')
      .filter(a => a !== '?');
    if (abbrevs.length === 0) return '—';
    return onlyOnReceiving ? `all with ${abbrevs[0]}` : `with ${abbrevs.join(', ')}`;
  })();

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/80 cursor-pointer transition-all"
      onClick={() => onClick(player)}
    >
      {/* Portrait */}
      <div className="relative shrink-0">
        <PlayerPortrait
          imgUrl={player.imgURL}
          face={(player as any).face}
          playerName={player.name}
          size={48}
        />
        {injured && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-slate-900" title="Injured" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {player.pos && (
            <span className="text-[9px] font-bold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded uppercase tracking-wider">
              {player.pos}
            </span>
          )}
          <span className="text-sm font-semibold text-white truncate">{player.name}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className={`font-bold ${ovrColor(historicalOvr)}`}>{historicalOvr} OVR</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{historicalPot} POT</span>
          <span className="text-slate-600">·</span>
          <span>{ageAtTrade}y</span>
          <span className="text-slate-600">·</span>
          <span>{salaryM}</span>
          {expYear && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">Exp {expYear}</span>
            </>
          )}
        </div>
        {ovrChanged && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 mt-0.5">
            <span>now:</span>
            <span className={ovrColor(currentOvr)}>{currentOvr}</span>
            <span className="text-slate-700">·</span>
            <span className={getPotColor(currentPot)}>{currentPot}</span>
          </div>
        )}
        <div className="text-[10px] text-slate-500 mt-1">
          <span className="font-bold text-slate-300">{postWS.toFixed(1)}</span>
          <span className="text-slate-500"> WS after trade</span>
          <span className="text-slate-600"> ({wsTeamLabel})</span>
        </div>
      </div>

    </div>
  );
};

interface PickRowProps {
  pickStr: string;
  receivingTeamAbbrev?: string;
}

const PickRow: React.FC<PickRowProps> = ({ pickStr, receivingTeamAbbrev }) => {
  const { state } = useGame();

  const seasonMatch = pickStr.match(/(\d{4})/);
  const season = seasonMatch ? parseInt(seasonMatch[1], 10) : null;
  // formatPickLabel emits both "1st Rd" (short) and "1st Round" (long), so match
  // the ordinal as a standalone word and accept either suffix.
  const isR1 = /\b1st\b/i.test(pickStr) || /\bR1\b/i.test(pickStr) || /round\s*1\b/i.test(pickStr);
  const isR2 = /\b2nd\b/i.test(pickStr) || /\bR2\b/i.test(pickStr) || /round\s*2\b/i.test(pickStr);
  const hasRound = isR1 || isR2;
  const origMatch = pickStr.match(/\(([A-Z]{2,4})\)/);
  const origAbbrev = origMatch ? origMatch[1] : null;
  const origTeam = origAbbrev ? state.teams.find(t => t.abbrev === origAbbrev) : null;
  const isOwnPick = !!receivingTeamAbbrev && !!origAbbrev && origAbbrev === receivingTeamAbbrev;

  // If this pick has already been used in a draft, find the resolved player.
  // DraftSimulatorView/finalizeDraft seeds player.draft = { year, round, pick, tid, originalTid }
  // on every drafted prospect, so we can match year + round + originalTid here.
  const resolvedPlayer = useMemo(() => {
    if (!season || !hasRound || !origTeam) return null;
    const round = isR1 ? 1 : 2;
    return state.players.find(p => {
      const d = (p as any).draft;
      return d && Number(d.year) === season && Number(d.round) === round && Number(d.originalTid) === origTeam.id;
    }) ?? null;
  }, [state.players, season, isR1, hasRound, origTeam]);

  // Fallback for unparseable entries like "(picks exchanged)"
  if (!season && !hasRound) {
    return (
      <div className="flex items-center gap-4 p-3 rounded-xl border-2 bg-slate-900/50 border-slate-800">
        <span className="text-sm text-slate-300 font-medium">{pickStr}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 rounded-xl border-2 transition-all",
        isOwnPick
          ? "bg-slate-900/50 border-slate-800"
          : "bg-blue-600/10 border-blue-500/50"
      )}
    >
      {/* Original team logo */}
      <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
        {origTeam?.logoUrl ? (
          <img src={origTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-[9px] font-black text-slate-400">{origAbbrev ?? '?'}</span>
        )}
      </div>

      {/* Pick info */}
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-black text-white uppercase tracking-tight">
          {season ?? ''} {isR1 ? '1ST' : isR2 ? '2ND' : ''} ROUND
          {resolvedPlayer?.draft?.pick && (
            <span className="ml-1.5 text-[10px] font-bold text-slate-500">
              #{(resolvedPlayer as any).draft.pick}
            </span>
          )}
        </div>
        {!isOwnPick && origTeam && (
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Via {origTeam.region} {origTeam.name}
          </div>
        )}
        {resolvedPlayer && (
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5 truncate">
            became {resolvedPlayer.name}
          </div>
        )}
      </div>

      {/* Round badge */}
      {hasRound && (
        <div className={cn(
          "text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0",
          isR1 ? "bg-indigo-900/50 text-indigo-300" : "bg-slate-800 text-slate-500"
        )}>
          {isR1 ? '1st' : '2nd'}
        </div>
      )}

      {/* Acquired badge */}
      {!isOwnPick && (
        <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] flex-shrink-0" />
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const TradeDetailView: React.FC<Props> = ({ entry, legs, onBack }) => {
  const { state } = useGame();
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  // For multi-team trades, allLegs holds every parsed leg; columns render per-team
  const allLegs: TradeEntry[] = legs && legs.length > 0 ? [entry, ...legs] : [];
  const isMultiTeam = allLegs.length >= 2;

  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  // Trade date info for historical ratings — use the original entry date
  const { tradeDateMs, tradeYear } = useMemo(() => {
    try {
      const d = new Date(entry.date);
      const ms = isNaN(d.getTime()) ? Date.now() : d.getTime();
      const month = d.getMonth() + 1;
      const yr = isNaN(d.getTime()) ? currentYear : (month >= 7 ? d.getFullYear() + 1 : d.getFullYear());
      return { tradeDateMs: ms, tradeYear: yr };
    } catch {
      return { tradeDateMs: Date.now(), tradeYear: currentYear };
    }
  }, [entry.date, currentYear]);

  // Aggregate per-team assets across all legs for multi-team display
  const multiTeamReceived = useMemo(() => {
    if (!isMultiTeam) return null;
    const byTeam = new Map<string, TradeSide>();
    const ensure = (name: string): TradeSide => {
      let s = byTeam.get(name);
      if (!s) { s = { playerNames: [], pickStrs: [], cashStrs: [] }; byTeam.set(name, s); }
      return s;
    };
    for (const leg of allLegs) {
      const p = parseTrade(leg.text);
      if (!p) continue;
      const a = ensure(p.teamAName);
      a.playerNames.push(...p.aReceived.playerNames);
      a.pickStrs.push(...p.aReceived.pickStrs);
      a.cashStrs.push(...p.aReceived.cashStrs);
      const b = ensure(p.teamBName);
      b.playerNames.push(...p.bReceived.playerNames);
      b.pickStrs.push(...p.bReceived.pickStrs);
      b.cashStrs.push(...p.bReceived.cashStrs);
    }
    // Dedupe per team
    for (const side of byTeam.values()) {
      side.playerNames = Array.from(new Set(side.playerNames));
      side.pickStrs = Array.from(new Set(side.pickStrs));
      side.cashStrs = Array.from(new Set(side.cashStrs));
    }
    return byTeam;
  }, [isMultiTeam, allLegs]);

  const parsed = useMemo(() => parseTrade(entry.text), [entry.text]);

  // Resolve player objects by name
  const resolvePlayer = useCallback((name: string): NBAPlayer | null =>
    state.players.find(p => p.name.toLowerCase() === name.toLowerCase()) ?? null,
  [state.players]);

  // Resolve team by name
  const resolveTeam = useCallback((name: string) =>
    state.teams.find(t => t.name.toLowerCase() === name.toLowerCase()) ?? null,
  [state.teams]);

  /** W-L record at the time of the trade — count played games up to tradeDateMs */
  const teamRecordAtDate = useCallback((teamId: number): string => {
    let w = 0, l = 0;
    for (const g of state.schedule) {
      if (!g.played || g.isPreseason || g.isAllStar || g.isExhibition) continue;
      if (new Date(g.date).getTime() > tradeDateMs) continue;
      if (g.homeTid === teamId) { g.homeScore > g.awayScore ? w++ : l++; }
      else if (g.awayTid === teamId) { g.awayScore > g.homeScore ? w++ : l++; }
    }
    return `${w}-${l}`;
  }, [state.schedule, tradeDateMs]);

  // Build per-team data for rendering (works for both 2-team and N-team trades)
  type TeamSlot = {
    name: string;
    team: ReturnType<typeof resolveTeam>;
    received: TradeSide;
    players: NBAPlayer[];
    avgOvr: number | null;
    record: string;
  };

  const teamSlots: TeamSlot[] = useMemo(() => {
    const buildSlot = (name: string, received: TradeSide): TeamSlot => {
      const team = resolveTeam(name);
      const players = received.playerNames.map(resolvePlayer).filter((p): p is NBAPlayer => p !== null);
      const avgOvr = players.length > 0
        ? players.reduce((s, p) => s + getHistoricalOvr2K(p, tradeDateMs), 0) / players.length
        : null;
      const record = team ? teamRecordAtDate(team.id) : '0-0';
      return { name, team, received, players, avgOvr, record };
    };

    if (multiTeamReceived && multiTeamReceived.size >= 2) {
      return Array.from(multiTeamReceived.entries()).map(([name, side]) => buildSlot(name, side));
    }
    if (parsed) {
      return [
        buildSlot(parsed.teamAName, parsed.aReceived),
        buildSlot(parsed.teamBName, parsed.bReceived),
      ];
    }
    return [];
  }, [multiTeamReceived, parsed, resolveTeam, resolvePlayer, tradeDateMs, teamRecordAtDate]);

  // If viewing a player bio, show that
  if (viewingPlayer) {
    return (
      <PlayerBioView
        player={viewingPlayer}
        onBack={() => setViewingPlayer(null)}
      />
    );
  }

  if (teamSlots.length === 0) {
    return (
      <div className="flex flex-col h-full bg-slate-950 text-slate-200">
        <div className="p-4 sm:p-8 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Back to Transactions</span>
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <AlertCircle size={40} className="text-slate-600" />
          <p className="text-slate-400 text-center">Could not parse trade details.</p>
          <p className="text-slate-600 text-sm text-center max-w-lg">{entry.text}</p>
        </div>
      </div>
    );
  }

  const headerTitle = isMultiTeam
    ? `${teamSlots.length}-Team Trade`
    : teamSlots.length === 2 && teamSlots[0].team && teamSlots[1].team
      ? `${(teamSlots[0].team as any).abbrev} ↔ ${(teamSlots[1].team as any).abbrev} Trade Details`
      : 'Trade Details';

  // Trade analysis: for 2-team show A vs B, for N-team rank teams by avg OVR received
  const slotsWithAvg = teamSlots.filter(s => s.avgOvr !== null);
  const showAnalysis = slotsWithAvg.length >= 2;
  let twoTeamDiff = 0;
  let twoTeamVerdict = '';
  if (showAnalysis && teamSlots.length === 2) {
    twoTeamDiff = (teamSlots[0].avgOvr ?? 0) - (teamSlots[1].avgOvr ?? 0);
    twoTeamVerdict =
      Math.abs(twoTeamDiff) < 2
        ? 'Even Trade'
        : twoTeamDiff > 0
        ? `${teamSlots[0].name} Win`
        : `${teamSlots[1].name} Win`;
  }
  const winnerName = showAnalysis && isMultiTeam
    ? slotsWithAvg.slice().sort((a, b) => (b.avgOvr ?? 0) - (a.avgOvr ?? 0))[0].name
    : '';

  const seasonLabel = (() => {
    try {
      const d = new Date(entry.date);
      const month = d.getMonth() + 1;
      const yr = month >= 7 ? d.getFullYear() + 1 : d.getFullYear();
      return `${yr - 1}–${String(yr).slice(2)} Season`;
    } catch {
      return '';
    }
  })();

  // 2-team trade keeps a centered max-w container; 3+ teams use a wider container
  // since the column strip scrolls horizontally inside it for any extra teams.
  const containerWidth = teamSlots.length >= 3 ? 'max-w-6xl' : 'max-w-4xl';
  const gridClass = 'grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-start';

  const verdictBadge = showAnalysis && teamSlots.length === 2 ? (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
      Math.abs(twoTeamDiff) < 2
        ? 'bg-slate-700/50 border-slate-600/50 text-slate-300'
        : twoTeamDiff > 0
        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
        : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
    }`}>
      {twoTeamVerdict}
    </span>
  ) : showAnalysis && winnerName ? (
    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
      {winnerName} Wins
    </span>
  ) : null;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-900/50">
        <div className={`${containerWidth} mx-auto`}>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Back to Transactions</span>
          </button>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center">
                <ArrowRightLeft size={18} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wide">
                  {headerTitle}
                </h2>
                {seasonLabel && (
                  <span className="text-[11px] text-slate-500 font-medium">{seasonLabel}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {verdictBadge}
              <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                <Calendar size={12} />
                <span>{entry.date}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className={`${containerWidth} mx-auto space-y-6`}>

          {/* Trade raw text — show all legs for multi-team */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-5 py-4 space-y-2">
            {(isMultiTeam ? allLegs : [entry]).map((leg, i) => (
              <p key={i} className="text-slate-300 text-sm leading-relaxed">
                {isMultiTeam && (
                  <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider mr-2">Leg {i + 1}</span>
                )}
                {leg.text}
              </p>
            ))}
          </div>

          {/* N-column team layout — 2-team uses centered grid w/ arrow divider;
              3+ teams use a horizontally scrollable flex strip so 3/4/5/N columns
              never overflow the page. Each column gets a min width so cards
              stay readable. */}
          {teamSlots.length === 2 ? (
            <div className={gridClass}>
              {teamSlots.map((slot, i) => (
                <React.Fragment key={i}>
                  <TeamColumn
                    teamName={slot.name}
                    record={slot.record}
                    team={slot.team}
                    received={slot.received}
                    players={slot.players}
                    tradeDateMs={tradeDateMs}
                    tradeYear={tradeYear}
                    currentYear={currentYear}
                    teams={state.teams}
                    onPlayerClick={setViewingPlayer}
                  />
                  {i === 0 && (
                    <div className="hidden sm:flex flex-col items-center justify-center pt-10 gap-2">
                      <ArrowRightLeft size={22} className="text-blue-400 opacity-60" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto custom-scrollbar pb-2">
              <div className="flex gap-4 items-start min-w-min">
                {teamSlots.map((slot, i) => (
                  <div key={i} className="w-[320px] sm:w-[360px] shrink-0">
                    <TeamColumn
                      teamName={slot.name}
                      record={slot.record}
                      team={slot.team}
                      received={slot.received}
                      players={slot.players}
                      tradeDateMs={tradeDateMs}
                      tradeYear={tradeYear}
                      currentYear={currentYear}
                      teams={state.teams}
                      onPlayerClick={setViewingPlayer}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend charts */}
          <TradeTrendCharts
            teamSlots={teamSlots.map(s => ({
              team: s.team as NBATeam | null,
              players: s.players,
            }))}
            tradeYear={tradeYear}
          />

        </div>
      </div>
    </div>
  );
};

// ─── Trend charts ────────────────────────────────────────────────────────────

interface TradeTrendChartsProps {
  teamSlots: { team: NBATeam | null; players: NBAPlayer[] }[];
  tradeYear: number;
}

const CHART_COLORS = ['#60a5fa', '#fb923c', '#a78bfa', '#34d399'];

const TradeTrendCharts: React.FC<TradeTrendChartsProps> = ({ teamSlots, tradeYear }) => {
  const slots = teamSlots.filter(s => s.team !== null) as { team: NBATeam; players: NBAPlayer[] }[];
  if (slots.length < 2) return null;

  // Year window: 2 years before trade → 5 years after
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = tradeYear - 1; y <= tradeYear + 5; y++) arr.push(y);
    return arr;
  }, [tradeYear]);

  // 1) Team winning percentages
  const winPctData = useMemo(() => years.map(y => {
    const row: Record<string, number | string> = { season: y };
    for (const slot of slots) {
      const seasonRec = (slot.team.seasons ?? []).find(s => s.season === y);
      if (seasonRec) {
        const total = seasonRec.won + seasonRec.lost;
        if (total > 0) row[slot.team.abbrev] = +(seasonRec.won / total).toFixed(3);
      } else if (y === tradeYear) {
        // Use the live team record for the in-progress season
        const total = slot.team.wins + slot.team.losses;
        if (total > 0) row[slot.team.abbrev] = +(slot.team.wins / total).toFixed(3);
      }
    }
    return row;
  }), [years, slots, tradeYear]);

  // 2) WS by assets received (TOTAL — across any team they played for that season)
  const wsTotalData = useMemo(() => years.map(y => {
    const row: Record<string, number | string> = { season: y };
    for (const slot of slots) {
      let sum = 0;
      for (const p of slot.players) {
        for (const s of (p.stats ?? [])) {
          if ((s.season ?? 0) === y && (s.gp ?? 0) > 0) sum += (s as any).ws ?? 0;
        }
      }
      if (sum > 0) row[slot.team.abbrev] = +sum.toFixed(2);
    }
    return row;
  }), [years, slots]);

  // 3) WS by assets received (WITH the receiving team only)
  const wsWithTeamData = useMemo(() => years.map(y => {
    const row: Record<string, number | string> = { season: y };
    for (const slot of slots) {
      let sum = 0;
      for (const p of slot.players) {
        for (const s of (p.stats ?? [])) {
          if ((s.season ?? 0) === y && (s.gp ?? 0) > 0 && s.tid === slot.team.id) {
            sum += (s as any).ws ?? 0;
          }
        }
      }
      if (sum > 0) row[slot.team.abbrev] = +sum.toFixed(2);
    }
    return row;
  }), [years, slots]);

  const teamColors = new Map<string, string>();
  slots.forEach((s, i) => teamColors.set(s.team.abbrev, s.team.colors?.[0] ?? CHART_COLORS[i % CHART_COLORS.length]));

  const renderChart = (title: string, data: typeof winPctData, yFmt: (v: number) => string, baseline?: number) => (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center">{title}</h4>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="season"
              stroke="#475569"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              tick={{ fontWeight: 'bold' }}
            />
            <YAxis
              stroke="#475569"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tick={{ fontWeight: 'bold' }}
              tickFormatter={yFmt}
              width={45}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#cbd5e1', fontWeight: 700 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, fontWeight: 700 }}
              iconType="line"
            />
            {baseline !== undefined && (
              <ReferenceLine y={baseline} stroke="#475569" strokeDasharray="4 4" />
            )}
            <ReferenceLine
              x={tradeYear}
              stroke="#fb7185"
              strokeDasharray="3 3"
              label={{ value: 'Trade', position: 'top', fill: '#fb7185', fontSize: 10, fontWeight: 700 }}
            />
            {slots.map(slot => (
              <Line
                key={slot.team.abbrev}
                type="monotone"
                dataKey={slot.team.abbrev}
                stroke={teamColors.get(slot.team.abbrev)}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 1 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {renderChart('Team winning percentages before and after the trade', winPctData, v => v.toFixed(3).replace(/^0/, ''), 0.5)}
      {renderChart('WS by assets received in trade (total)', wsTotalData, v => v.toFixed(1))}
      {renderChart('WS by assets received in trade (with team)', wsWithTeamData, v => v.toFixed(1))}
    </div>
  );
};

// ─── Team Column ──────────────────────────────────────────────────────────────

interface TeamColumnProps {
  teamName: string;
  record: string;
  team: ReturnType<typeof Array.prototype.find> | null;
  received: TradeSide;
  players: NBAPlayer[];
  tradeDateMs: number;
  tradeYear: number;
  currentYear: number;
  teams: NBATeam[];
  onPlayerClick: (p: NBAPlayer) => void;
}

const TeamColumn: React.FC<TeamColumnProps> = ({
  teamName,
  record,
  team,
  received,
  players,
  tradeDateMs,
  tradeYear,
  currentYear,
  teams,
  onPlayerClick,
}) => {
  const logoUrl = (team as any)?.logoUrl;
  const teamColor = (team as any)?.colors?.[0];
  const isEmpty = players.length === 0
    && received.pickStrs.length === 0
    && received.cashStrs.length === 0
    && received.playerNames.length === 0;
  const totalPostWS = players.reduce((acc, p) => acc + getPostTradeWS(p, tradeYear).ws, 0);

  return (
    <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden">
      {/* Team header */}
      <div
        className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-3"
        style={teamColor ? { borderLeftColor: teamColor, borderLeftWidth: 3 } : undefined}
      >
        {logoUrl && (
          <img src={logoUrl} alt={teamName} className="w-8 h-8 object-contain opacity-90 shrink-0"
            referrerPolicy="no-referrer"
            onError={e => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Received</div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-white truncate">{teamName}</div>
            <div className="text-[10px] font-mono text-slate-500 shrink-0">{record}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {isEmpty ? (
          <p className="text-center text-slate-600 text-xs py-4 italic">Nothing received</p>
        ) : (
          <>
            {/* Player cards */}
            {players.map(p => (
              <PlayerReceivedCard
                key={p.internalId}
                player={p}
                tradeDateMs={tradeDateMs}
                tradeYear={tradeYear}
                currentYear={currentYear}
                receivingTeam={team as NBATeam | null}
                teams={teams}
                onClick={onPlayerClick}
              />
            ))}

            {/* Unknown player names (not in state) */}
            {received.playerNames
              .filter(name => !players.some(p => p.name.toLowerCase() === name.toLowerCase()))
              .map((name, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                  <div className="w-12 h-12 rounded-full bg-slate-700/50 border-2 border-slate-600/40 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                    {name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-300 truncate">{name}</div>
                    <div className="text-[11px] text-slate-500">Player data unavailable</div>
                  </div>
                </div>
              ))}

            {/* Pick rows */}
            {received.pickStrs.map((pick, i) => (
              <PickRow key={i} pickStr={pick} receivingTeamAbbrev={(team as any)?.abbrev} />
            ))}

            {/* Cash rows */}
            {received.cashStrs.map((cash, i) => (
              <div
                key={`cash-${i}`}
                className="flex items-center gap-3 p-3 rounded-xl border-2 bg-emerald-600/10 border-emerald-500/40"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-black text-emerald-300 shrink-0">
                  $
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-white uppercase tracking-tight">{cash}</div>
                  <div className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest">Cash Considerations</div>
                </div>
              </div>
            ))}

            {/* Team total WS footer */}
            {players.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 uppercase tracking-wider font-bold">Total WS after trade</span>
                <span className="font-black text-white">{totalPostWS.toFixed(1)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
