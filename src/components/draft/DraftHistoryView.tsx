/**
 * DraftHistoryView.tsx
 * Shows historical draft class results with year-by-year chevron navigation.
 * Extracted from DraftSimulatorView for standalone access.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import { ensureNonNBAFetched, getNonNBAGistData } from '../central/view/nonNBACache';
import { PlayerBioView } from '../central/view/PlayerBioView';
import type { NBAPlayer } from '../../types';

// Parse "2015 Round 2, Pick 5, Philadelphia Sixers" → { year, round, pick, team }
function parseBioDraftStr(s: string | undefined): { year: number; round: number; pick: number; team: string } | null {
  if (!s || s === 'Undrafted' || s === 'N/A' || s === '-') return null;
  const m = s.match(/(\d{4})\s+Round\s+(\d+)[,\s]+Pick\s+(\d+)[,\s]+(.+)/i);
  if (!m) return null;
  return { year: parseInt(m[1]), round: parseInt(m[2]), pick: parseInt(m[3]), team: m[4].trim() };
}

const BIO_LEAGUE_MAP: Record<string, string> = {
  Euroleague: 'Euroleague',
  'B-League': 'B-League',
  'G-League': 'G-League',
  Endesa: 'Endesa',
  'China CBA': 'China CBA',
  'NBL Australia': 'NBL Australia',
};

// POT estimator (BBGM formula) — must match PlayerBiosView exactly
const estimatePot = (rawOvr: number, hgt: number, tp: number | undefined, age: number): number => {
  const potBbgm = age >= 29 ? rawOvr : Math.max(rawOvr, Math.round(72.31428908571982 + (-2.33062761 * age) + (0.83308748 * rawOvr)));
  return convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), hgt, tp);
};

export const DraftHistoryView: React.FC = () => {
  const { state } = useGame();
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);

  // Load external bio gist caches
  const [nonNBACacheVer, setNonNBACacheVer] = useState(0);
  useEffect(() => {
    Promise.all(Object.values(BIO_LEAGUE_MAP).map(ensureNonNBAFetched))
      .then(() => setNonNBACacheVer(v => v + 1));
  }, []);

  const nbaTids = useMemo(() => new Set(state.teams.map(t => t.id)), [state.teams]);

  const availableDraftYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of state.players) {
      if (p.status === 'WNBA' || p.status === 'PBA') continue;
      const d = (p as any).draft;
      if (d?.year && d?.round && d?.pick) { years.add(Number(d.year)); continue; }
      const league = BIO_LEAGUE_MAP[p.status ?? ''];
      if (league) {
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) years.add(parsed.year);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [state.players, nonNBACacheVer]);

  const defaultViewYear = availableDraftYears[0] ?? (state.leagueStats?.year ?? 2026);
  const [viewDraftYear, setViewDraftYear] = useState<number>(defaultViewYear);

  useEffect(() => {
    if (availableDraftYears.length > 0 && !availableDraftYears.includes(viewDraftYear)) {
      setViewDraftYear(availableDraftYears[0]);
    }
  }, [availableDraftYears]);

  const draftClass = useMemo(() => {
    const candidates: any[] = [];
    for (const p of state.players) {
      if (p.status === 'WNBA' || p.status === 'PBA') continue;
      const d = (p as any).draft;
      let dYear  = d?.year  ? Number(d.year)  : null;
      let dRound = d?.round ? Number(d.round) : null;
      let dPick  = d?.pick  ? Number(d.pick)  : null;
      let bioDraftTeamName: string | undefined;
      if ((!dRound || !dPick) && BIO_LEAGUE_MAP[p.status ?? '']) {
        const league = BIO_LEAGUE_MAP[p.status ?? ''];
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) {
          dYear = parsed.year; dRound = parsed.round; dPick = parsed.pick;
          bioDraftTeamName = parsed.team;
        }
      }
      if (!dYear || dYear !== viewDraftYear) continue;
      if (!dRound || !dPick) continue;
      const isOnNBATeam = nbaTids.has(p.tid);
      const isExternalDrafted = !!BIO_LEAGUE_MAP[p.status ?? ''] && !!dRound && !!dPick;
      if (!isOnNBATeam && !isExternalDrafted) continue;
      candidates.push({ ...p, _draftRound: dRound, _draftPick: dPick, _bioDraftTeamName: bioDraftTeamName });
    }
    const bySlot = new Map<number, any>();
    for (const p of candidates) {
      const slot = (p._draftRound === 1 ? 0 : 30) + p._draftPick;
      const existing = bySlot.get(slot);
      if (!existing || (p.overallRating ?? 0) > (existing.overallRating ?? 0)) {
        bySlot.set(slot, p);
      }
    }
    return Array.from(bySlot.entries())
      .sort(([a], [b]) => a - b)
      .map(([slot, p]) => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        // Must match PlayerBiosView: prefer overallRating (updated by progression), fall back to ratings array
        const rawOvr = p.overallRating || lastRatings.ovr || 0;
        const simYear = state.leagueStats?.year ?? 2026;
        const age = p.born?.year ? simYear - p.born.year : (typeof p.age === 'number' ? p.age : 25);
        return { ...p, _slot: slot, displayOvr: convertTo2KRating(rawOvr, hgt, tp), displayPot: estimatePot(rawOvr, hgt, tp, age) };
      });
  }, [state.players, viewDraftYear, nbaTids, nonNBACacheVer]);

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="border-b border-[#333] pb-2 mb-4 flex items-center justify-between">
        <h4 className="text-xl font-black text-white uppercase tracking-tight">{viewDraftYear} NBA Draft Results</h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-white/30 uppercase">{draftClass.length} picks</span>
          {availableDraftYears.length > 1 && (
            <div className="flex items-center gap-1 bg-black/40 border border-[#333] rounded-md p-0.5">
              <button
                onClick={() => {
                  const idx = availableDraftYears.indexOf(viewDraftYear);
                  if (idx < availableDraftYears.length - 1) setViewDraftYear(availableDraftYears[idx + 1]);
                }}
                disabled={availableDraftYears.indexOf(viewDraftYear) === availableDraftYears.length - 1}
                className="p-1 text-white/50 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] font-black text-white/60 px-1">{viewDraftYear}</span>
              <button
                onClick={() => {
                  const idx = availableDraftYears.indexOf(viewDraftYear);
                  if (idx > 0) setViewDraftYear(availableDraftYears[idx - 1]);
                }}
                disabled={availableDraftYears.indexOf(viewDraftYear) === 0}
                className="p-1 text-white/50 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {draftClass.length === 0 ? (
        <div className="text-center text-white/40 py-12 text-sm">No draft data available for {viewDraftYear}.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {draftClass.map((player: any) => {
            let drafteeTeam = state.teams.find(t => t.id === player.draft?.tid);
            if (!drafteeTeam && player._bioDraftTeamName) {
              const needle = player._bioDraftTeamName.toLowerCase();
              drafteeTeam = state.teams.find(t =>
                needle.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(needle) ||
                needle.includes((t as any).region?.toLowerCase?.() ?? '')
              );
            }
            const currentNBATeam = state.teams.find(t => t.id === player.tid);
            const currentNonNBATeam = !currentNBATeam
              ? (state as any).nonNBATeams?.find((t: any) => t.tid === player.tid && t.league === player.status)
              : null;
            const currentTeamLogoUrl: string | undefined = currentNBATeam?.logoUrl ?? currentNonNBATeam?.imgURL;
            const currentTeamIsDraftee = currentNBATeam?.id === drafteeTeam?.id;
            const dRound = player._draftRound ?? player.draft?.round;
            const dPick  = player._draftPick  ?? player.draft?.pick;
            return (
              <div
                key={player.internalId}
                onClick={() => setViewingBioPlayer(player as NBAPlayer)}
                className="bg-[#1A1A1A] border border-[#333] rounded-sm flex h-16 overflow-hidden cursor-pointer hover:border-indigo-600/50 transition-colors"
              >
                <div className="w-10 bg-indigo-900/60 flex items-center justify-center shrink-0">
                  <span className="text-base font-black text-white">{String(player._slot).padStart(2, '0')}</span>
                </div>
                <div className="w-16 bg-[#111] relative shrink-0 overflow-hidden">
                  {(() => { const img = getPlayerImage(player); return img ? (
                    <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-black text-indigo-900">
                      {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  ); })()}
                </div>
                <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-black text-white text-sm truncate uppercase tracking-tight">{player.name}</p>
                    {BIO_LEAGUE_MAP[player.status ?? ''] && (
                      <span className="text-[8px] font-black text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap shrink-0">
                        {player.status}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-white/40 uppercase">
                    {player.pos} · OVR {player.displayOvr} | POT {player.displayPot} · {dRound === 1 ? 'R1' : 'R2'} #{dPick}
                  </div>
                </div>
                <div className="flex items-center shrink-0 border-l border-[#333] bg-black/20 px-1 gap-1">
                  {drafteeTeam?.logoUrl ? (
                    <img src={drafteeTeam.logoUrl} alt="" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-[9px] font-black text-white/20 w-7 text-center">{drafteeTeam?.abbrev ?? '—'}</span>
                  )}
                  {!currentTeamIsDraftee && currentTeamLogoUrl && (
                    <img src={currentTeamLogoUrl} alt="" className="w-7 h-7 object-contain opacity-60" referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
