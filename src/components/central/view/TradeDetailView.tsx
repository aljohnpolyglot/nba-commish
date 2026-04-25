import React, { useMemo, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRightLeft, Calendar, AlertCircle } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer } from '../../../types';
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
 * Split a raw segment like "LeBron James, Anthony Davis + 2027 1st Rd (OKC), 2029 2nd Rd (GSW)"
 * into { playerNames, pickStrs }.
 * The first ` + ` separates the player CSV from the picks CSV.
 * Remaining ` + ` tokens are additional picks.
 */
function splitPlayersPicks(raw: string): TradeSide {
  const parts = raw.split(' + ');
  const playerNames = parts[0]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const pickStrs = parts.slice(1).flatMap(s =>
    s.split(',').map(p => p.trim()).filter(Boolean)
  );

  return { playerNames, pickStrs };
}

function parseTrade(text: string): ParsedTrade | null {
  // Strip leading "TRADE: " prefix if present
  const body = text.replace(/^TRADE:\s*/i, '').trim();

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
      aReceived: { playerNames: [], pickStrs: ['(picks exchanged)'] },
      bReceived: { playerNames: [], pickStrs: ['(picks exchanged)'] },
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
      aReceived: { playerNames: [], pickStrs: [] },
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
  onClick: (p: NBAPlayer) => void;
}

const PlayerReceivedCard: React.FC<PlayerCardProps> = ({ player, currentYear, tradeDateMs, tradeYear, onClick }) => {
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
  const isR1 = /1st\s*Rd/i.test(pickStr) || /\bR1\b/i.test(pickStr) || /round\s*1/i.test(pickStr);
  const isR2 = /2nd\s*Rd/i.test(pickStr) || /\bR2\b/i.test(pickStr) || /round\s*2/i.test(pickStr);
  const hasRound = isR1 || isR2;
  const origMatch = pickStr.match(/\(([A-Z]{2,4})\)/);
  const origAbbrev = origMatch ? origMatch[1] : null;
  const origTeam = origAbbrev ? state.teams.find(t => t.abbrev === origAbbrev) : null;
  const isOwnPick = !!receivingTeamAbbrev && !!origAbbrev && origAbbrev === receivingTeamAbbrev;

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
          {season ?? ''} {isR1 ? '1ST' : '2ND'} ROUND
        </div>
        {!isOwnPick && origTeam && (
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Via {origTeam.region} {origTeam.name}
          </div>
        )}
      </div>

      {/* Round badge */}
      <div className={cn(
        "text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0",
        isR1 ? "bg-indigo-900/50 text-indigo-300" : "bg-slate-800 text-slate-500"
      )}>
        {isR1 ? '1st' : '2nd'}
      </div>

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
  const [activeLegIdx, setActiveLegIdx] = useState(0);

  // For multi-team trades, swap which leg we're viewing while keeping same shell
  const allLegs: TradeEntry[] = legs && legs.length > 0 ? [entry, ...legs] : [];
  const isMultiTeam = allLegs.length >= 2;
  const activeEntry = isMultiTeam ? allLegs[activeLegIdx] : entry;

  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  // Trade date info for historical ratings
  const { tradeDateMs, tradeYear } = useMemo(() => {
    try {
      const d = new Date(activeEntry.date);
      const ms = isNaN(d.getTime()) ? Date.now() : d.getTime();
      const month = d.getMonth() + 1;
      const yr = isNaN(d.getTime()) ? currentYear : (month >= 7 ? d.getFullYear() + 1 : d.getFullYear());
      return { tradeDateMs: ms, tradeYear: yr };
    } catch {
      return { tradeDateMs: Date.now(), tradeYear: currentYear };
    }
  }, [activeEntry.date, currentYear]);

  const parsed = useMemo(() => parseTrade(activeEntry.text), [activeEntry.text]);

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

  // If viewing a player bio, show that
  if (viewingPlayer) {
    return (
      <PlayerBioView
        player={viewingPlayer}
        onBack={() => setViewingPlayer(null)}
      />
    );
  }

  if (!parsed) {
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
          <p className="text-slate-600 text-sm text-center max-w-lg">{activeEntry.text}</p>
        </div>
      </div>
    );
  }

  const { teamAName, teamBName, aReceived, bReceived } = parsed;
  const teamA = resolveTeam(teamAName);
  const teamB = resolveTeam(teamBName);

  const aPlayers = aReceived.playerNames.map(resolvePlayer).filter((p): p is NBAPlayer => p !== null);
  const bPlayers = bReceived.playerNames.map(resolvePlayer).filter((p): p is NBAPlayer => p !== null);

  // Trade analysis — use historical OVR at time of trade
  const aAvg = aPlayers.length > 0
    ? aPlayers.reduce((s, p) => s + getHistoricalOvr2K(p, tradeDateMs), 0) / aPlayers.length
    : null;
  const bAvg = bPlayers.length > 0
    ? bPlayers.reduce((s, p) => s + getHistoricalOvr2K(p, tradeDateMs), 0) / bPlayers.length
    : null;

  const teamARecord = teamA ? teamRecordAtDate(teamA.id) : '0-0';
  const teamBRecord = teamB ? teamRecordAtDate(teamB.id) : '0-0';

  const showAnalysis = aAvg !== null && bAvg !== null;
  const diff = showAnalysis ? aAvg! - bAvg! : 0;
  const verdict =
    Math.abs(diff) < 2
      ? 'Even Trade'
      : diff > 0
      ? `${teamAName} Win`
      : `${teamBName} Win`;

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

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-4xl mx-auto">
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
                  {isMultiTeam
                    ? `${allLegs.length}-Team Trade`
                    : teamA && teamB
                      ? `${teamA.abbrev} ↔ ${teamB.abbrev} Trade Details`
                      : 'Trade Details'}
                </h2>
                {seasonLabel && (
                  <span className="text-[11px] text-slate-500 font-medium">{seasonLabel}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showAnalysis && (
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                  Math.abs(diff) < 2
                    ? 'bg-slate-700/50 border-slate-600/50 text-slate-300'
                    : diff > 0
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                }`}>
                  {verdict}
                </span>
              )}
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
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Multi-leg tab bar */}
          {isMultiTeam && (
            <div className="flex gap-2 flex-wrap">
              {allLegs.map((leg, i) => {
                // Grab the first team name from this leg's text
                const legTeam = state.teams.find(t => (leg.text || '').includes(t.name));
                return (
                  <button
                    key={i}
                    onClick={() => setActiveLegIdx(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      activeLegIdx === i
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                        : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {(legTeam as any)?.logoUrl && (
                      <img src={(legTeam as any).logoUrl} alt="" className="w-4 h-4 object-contain"
                        referrerPolicy="no-referrer"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    Leg {i + 1}
                  </button>
                );
              })}
            </div>
          )}

          {/* Trade raw text */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-5 py-4">
            <p className="text-slate-300 text-sm leading-relaxed">{activeEntry.text}</p>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* Team A column */}
            <TeamColumn
              teamName={teamAName}
              record={teamARecord}
              team={teamA}
              received={aReceived}
              players={aPlayers}
              tradeDateMs={tradeDateMs}
              tradeYear={tradeYear}
              currentYear={currentYear}
              onPlayerClick={setViewingPlayer}
            />

            {/* Divider */}
            <div className="hidden sm:flex flex-col items-center justify-center pt-10 gap-2">
              <ArrowRightLeft size={22} className="text-blue-400 opacity-60" />
            </div>

            {/* Team B column */}
            <TeamColumn
              teamName={teamBName}
              record={teamBRecord}
              team={teamB}
              received={bReceived}
              players={bPlayers}
              tradeDateMs={tradeDateMs}
              tradeYear={tradeYear}
              currentYear={currentYear}
              onPlayerClick={setViewingPlayer}
            />
          </div>

          {/* Trade Analysis */}
          {showAnalysis && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">
                Trade Analysis (Ratings at time of trade)
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  {teamA?.logoUrl && (
                    <img src={teamA.logoUrl} alt="" className="w-5 h-5 object-contain opacity-80"
                      referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  <span className="font-semibold text-white">{teamAName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{teamARecord}</span>
                  <span className={`font-black text-base ${ovrColor(Math.round(aAvg!))}`}>
                    {aAvg!.toFixed(1)}
                  </span>
                </div>

                <span className={`font-black text-lg ${
                  Math.abs(diff) < 2 ? 'text-slate-500' : diff > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {Math.abs(diff) < 2 ? '=' : diff > 0 ? '>' : '<'}
                </span>

                <div className="flex items-center gap-2">
                  {teamB?.logoUrl && (
                    <img src={teamB.logoUrl} alt="" className="w-5 h-5 object-contain opacity-80"
                      referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  <span className="font-semibold text-white">{teamBName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{teamBRecord}</span>
                  <span className={`font-black text-base ${ovrColor(Math.round(bAvg!))}`}>
                    {bAvg!.toFixed(1)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">
                Based on K2 OVR at time of trade. Picks not included in rating calculation.
              </p>
            </div>
          )}

        </div>
      </div>
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
  onPlayerClick,
}) => {
  const logoUrl = (team as any)?.logoUrl;
  const teamColor = (team as any)?.colors?.[0];
  const isEmpty = players.length === 0 && received.pickStrs.length === 0;

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
          </>
        )}
      </div>
    </div>
  );
};
