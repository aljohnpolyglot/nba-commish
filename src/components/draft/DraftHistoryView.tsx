/**
 * DraftHistoryView.tsx
 * Shows historical draft class results with year-by-year chevron navigation.
 * Extracted from DraftSimulatorView for standalone access.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getDisplayOverall, getDisplayPotential } from '../../store/playerRatingStore';
import { getPlayerImage } from '../central/view/bioCache';
import { MyFace, isRealFaceConfig } from '../shared/MyFace';
import { ensureNonNBAFetched, getNonNBAGistData } from '../central/view/nonNBACache';
import { PlayerBioView } from '../central/view/PlayerBioView';
import type { NBAPlayer } from '../../types';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import {
  ensurePbaDraftArchive,
  findPbaDraftRowsByYear,
  getCachedPbaDraftArchive,
  normalizePbaDraftPlayerName,
} from '../../services/pba/pbaDraftArchive';

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

const DraftTeamBadge: React.FC<{
  logoUrl?: string;
  alt: string;
  fallback: string;
  dimmed?: boolean;
}> = ({ logoUrl, alt, fallback, dimmed = false }) => {
  const [failed, setFailed] = useState(false);
  const safeFallback = fallback?.trim() || '—';

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!logoUrl || failed) {
    return (
      <span className={`text-[9px] font-black w-7 text-center ${dimmed ? 'text-white/30' : 'text-white/20'}`}>
        {safeFallback}
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      className={`w-7 h-7 object-contain ${dimmed ? 'opacity-60' : ''}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
};

export const DraftHistoryView: React.FC = () => {
  const { state } = useGame();
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const pbaMode = isPbaIsolatedMode(state);
  const nonNBATeams = (state as any).nonNBATeams ?? [];

  // Load external bio gist caches
  const [nonNBACacheVer, setNonNBACacheVer] = useState(0);
  const [pbaDraftArchiveVer, setPbaDraftArchiveVer] = useState(0);
  useEffect(() => {
    Promise.all(Object.values(BIO_LEAGUE_MAP).map(ensureNonNBAFetched))
      .then(() => setNonNBACacheVer(v => v + 1));
  }, []);
  useEffect(() => {
    if (!pbaMode) return;
    ensurePbaDraftArchive().then(() => setPbaDraftArchiveVer(v => v + 1));
  }, [pbaMode]);

  const nbaTids = useMemo(() => new Set(state.teams.map(t => t.id)), [state.teams]);
  const pbaTids = useMemo(
    () => new Set(nonNBATeams.filter((team: any) => team.league === 'PBA').map((team: any) => Number(team.tid ?? team.id))),
    [nonNBATeams],
  );
  const activeDraftTids = pbaMode ? pbaTids : nbaTids;
  const teamsPerRound = pbaMode ? (pbaTids.size || 12) : 30;
  const draftLabel = pbaMode ? 'PBA Draft' : 'NBA Draft';
  const pbaArchiveRows = useMemo(() => getCachedPbaDraftArchive(), [pbaDraftArchiveVer]);
  const playersByPbaName = useMemo(() => {
    const byName = new Map<string, NBAPlayer[]>();
    for (const player of state.players) {
      const key = normalizePbaDraftPlayerName(player.name);
      if (!key) continue;
      const list = byName.get(key) ?? [];
      list.push(player);
      byName.set(key, list);
    }
    return byName;
  }, [state.players]);

  const resolvePbaPlayerMatch = (normalizedName: string, draftYear: number) => {
    const matches = playersByPbaName.get(normalizedName) ?? [];
    if (matches.length <= 1) return matches[0] ?? null;
    return [...matches].sort((a, b) => {
      const aYear = Number((a as any).draft?.year ?? 0);
      const bYear = Number((b as any).draft?.year ?? 0);
      const aExact = aYear === draftYear ? 1 : 0;
      const bExact = bYear === draftYear ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      const aPba = a.status === 'PBA' ? 1 : 0;
      const bPba = b.status === 'PBA' ? 1 : 0;
      if (aPba !== bPba) return bPba - aPba;
      return ((b.stats?.length ?? 0) - (a.stats?.length ?? 0));
    })[0] ?? null;
  };

  const availableDraftYears = useMemo(() => {
    const years = new Set<number>();
    if (pbaMode && pbaArchiveRows.length > 0) {
      for (const row of pbaArchiveRows) years.add(row.draftYear);
    }
    for (const p of state.players) {
      const d = (p as any).draft;
      const draftTid = Number(d?.tid);
      const isPbaDraft = p.status === 'PBA' || pbaTids.has(p.tid) || pbaTids.has(draftTid);
      if (p.status === 'WNBA') continue;
      if (pbaMode && !isPbaDraft) continue;
      if (!pbaMode && isPbaDraft) continue;
      if (d?.year && d?.round && d?.pick) { years.add(Number(d.year)); continue; }
      const league = !pbaMode ? BIO_LEAGUE_MAP[p.status ?? ''] : undefined;
      if (league) {
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) years.add(parsed.year);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [nonNBACacheVer, pbaArchiveRows, pbaMode, pbaTids, state.players]);

  const defaultViewYear = availableDraftYears[0] ?? (state.leagueStats?.year ?? new Date().getFullYear());
  const [viewDraftYear, setViewDraftYear] = useState<number>(defaultViewYear);
  const pbaArchiveRowsForYear = useMemo(
    () => pbaMode ? findPbaDraftRowsByYear(viewDraftYear) : [],
    [pbaMode, viewDraftYear, pbaDraftArchiveVer],
  );

  useEffect(() => {
    if (availableDraftYears.length > 0 && !availableDraftYears.includes(viewDraftYear)) {
      setViewDraftYear(availableDraftYears[0]);
    }
  }, [availableDraftYears]);

  const draftClass = useMemo(() => {
    if (pbaMode && pbaArchiveRowsForYear.length > 0) {
      return pbaArchiveRowsForYear.map(row => {
        const matchedPlayer = resolvePbaPlayerMatch(row.normalizedPlayerName, row.draftYear);
        if (!matchedPlayer) {
          return {
            ...row,
            _slot: row.overallPick,
            _draftRound: row.round,
            _draftPick: row.pick,
            _matchedPlayer: null,
            _cardKey: `${row.draftYear}-${row.overallPick}-${row.normalizedPlayerName}`,
            displayOvr: null,
            displayPot: null,
          };
        }

        const simYear = state.leagueStats?.year ?? new Date().getFullYear();
        return {
          ...row,
          ...matchedPlayer,
          _slot: row.overallPick,
          _draftRound: row.round,
          _draftPick: row.pick,
          _matchedPlayer: matchedPlayer,
          _cardKey: matchedPlayer.internalId,
          _pbaDraftTeamName: row.draftedTeam,
          displayOvr: getDisplayOverall(matchedPlayer),
          displayPot: getDisplayPotential(matchedPlayer, simYear),
        };
      });
    }

    const candidates: any[] = [];
    for (const p of state.players) {
      const d = (p as any).draft;
      const draftTid = Number(d?.tid);
      const isPbaDraft = p.status === 'PBA' || pbaTids.has(p.tid) || pbaTids.has(draftTid);
      if (p.status === 'WNBA') continue;
      if (pbaMode && !isPbaDraft) continue;
      if (!pbaMode && isPbaDraft) continue;
      let dYear  = d?.year  ? Number(d.year)  : null;
      let dRound = d?.round ? Number(d.round) : null;
      let dPick  = d?.pick  ? Number(d.pick)  : null;
      let bioDraftTeamName: string | undefined;
      if (!pbaMode && (!dRound || !dPick) && BIO_LEAGUE_MAP[p.status ?? '']) {
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
      const isOnActiveTeam = activeDraftTids.has(p.tid);
      const isExternalDrafted = !pbaMode && !!BIO_LEAGUE_MAP[p.status ?? ''] && !!dRound && !!dPick;
      const isFreeAgentDraftee = p.tid === -1 && dYear === viewDraftYear && !!dRound && !!dPick;
      if (!isOnActiveTeam && !isExternalDrafted && !isFreeAgentDraftee) continue;
      candidates.push({ ...p, _draftRound: dRound, _draftPick: dPick, _bioDraftTeamName: bioDraftTeamName });
    }
    const bySlot = new Map<number, any>();
    for (const p of candidates) {
      const slot = ((p._draftRound - 1) * teamsPerRound) + p._draftPick;
      const existing = bySlot.get(slot);
      if (!existing || (p.overallRating ?? 0) > (existing.overallRating ?? 0)) {
        bySlot.set(slot, p);
      }
    }
    return Array.from(bySlot.entries())
      .sort(([a], [b]) => a - b)
      .map(([slot, p]) => {
        const simYear = state.leagueStats?.year ?? new Date().getFullYear();
        return { ...p, _slot: slot, displayOvr: getDisplayOverall(p), displayPot: getDisplayPotential(p, simYear) };
      });
  }, [activeDraftTids, pbaArchiveRowsForYear, pbaMode, pbaTids, state.leagueStats?.year, state.players, teamsPerRound, viewDraftYear, nonNBACacheVer]);

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
        <h4 className="text-xl font-black text-white uppercase tracking-tight">{viewDraftYear} {draftLabel} Results</h4>
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
            const matchedPlayer = player._matchedPlayer ?? player;
            let drafteeTeam = resolveAnyTeam(Number(player.draft?.tid), state.teams, nonNBATeams);
            if (pbaMode && player._pbaDraftTeamName) {
              const needle = String(player._pbaDraftTeamName).toLowerCase();
              drafteeTeam = nonNBATeams.find((team: any) =>
                team.league === 'PBA' && (
                  needle.includes(String(team.name ?? '').toLowerCase()) ||
                  String(team.name ?? '').toLowerCase().includes(needle) ||
                  needle.includes(String(team.region ?? '').toLowerCase())
                )
              ) ?? drafteeTeam;
            }
            if (!drafteeTeam && player._bioDraftTeamName) {
              const needle = player._bioDraftTeamName.toLowerCase();
              drafteeTeam = state.teams.find(t =>
                needle.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(needle) ||
                needle.includes((t as any).region?.toLowerCase?.() ?? '')
              ) ?? null;
            }
            const currentTeam = resolveAnyTeam(Number(matchedPlayer.tid), state.teams, nonNBATeams);
            const currentTeamLogoUrl: string | undefined = currentTeam?.logoUrl ?? (currentTeam as any)?.imgURL;
            const currentTeamIsDraftee = currentTeam?.id === drafteeTeam?.id;
            const dRound = player._draftRound ?? player.draft?.round;
            const dPick  = player._draftPick  ?? player.draft?.pick;
            const canOpenBio = !!player._matchedPlayer || !!player.internalId;
            return (
              <div
                key={player._cardKey ?? player.internalId}
                onClick={() => canOpenBio && setViewingBioPlayer(matchedPlayer as NBAPlayer)}
                className={`bg-[#1A1A1A] border border-[#333] rounded-sm flex h-16 overflow-hidden transition-colors ${
                  canOpenBio ? 'cursor-pointer hover:border-indigo-600/50' : ''
                }`}
              >
                <div className="w-10 bg-indigo-900/60 flex items-center justify-center shrink-0">
                  <span className="text-base font-black text-white">{String(player._slot).padStart(2, '0')}</span>
                </div>
                <div className="w-16 bg-[#111] relative shrink-0 overflow-hidden">
                  {(() => {
                    const img = getPlayerImage(matchedPlayer);
                    const face = (matchedPlayer as any).face;
                    if (img) return <img src={img} alt={player.playerName ?? matchedPlayer.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} />;
                    if (isRealFaceConfig(face)) return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div></div>;
                    const initialsSource = player.playerName ?? matchedPlayer.name ?? '';
                    return <div className="w-full h-full flex items-center justify-center text-lg font-black text-indigo-900">{initialsSource.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>;
                  })()}
                </div>
                <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-black text-white text-sm truncate uppercase tracking-tight">{player.playerName ?? matchedPlayer.name}</p>
                    {BIO_LEAGUE_MAP[matchedPlayer.status ?? ''] && (
                      <span className="text-[8px] font-black text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap shrink-0">
                        {matchedPlayer.status}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-white/40 uppercase">
                    {player.pos ?? matchedPlayer.pos ?? '—'}
                    {typeof player.displayOvr === 'number' && typeof player.displayPot === 'number'
                      ? ` · OVR ${player.displayOvr} | POT ${player.displayPot}`
                      : ''}
                    {dRound != null
                      ? ` · R${dRound} #${dPick ?? '—'}`
                      : ` · #${dPick ?? player._slot}`}
                    {player.schoolClubTeam ? ` · ${player.schoolClubTeam}` : ''}
                  </div>
                </div>
                <div className="flex items-center shrink-0 border-l border-[#333] bg-black/20 px-1 gap-1">
                  <DraftTeamBadge
                    logoUrl={drafteeTeam?.logoUrl ?? (drafteeTeam as any)?.imgURL}
                    alt={drafteeTeam ? getTeamFullName(drafteeTeam) : 'Draft team'}
                    fallback={drafteeTeam?.abbrev ?? '—'}
                  />
                  {!currentTeamIsDraftee && currentTeamLogoUrl && (
                    <DraftTeamBadge
                      logoUrl={currentTeamLogoUrl}
                      alt={currentTeam?.name ?? 'Current team'}
                      fallback={currentTeam?.abbrev ?? '—'}
                      dimmed
                    />
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
