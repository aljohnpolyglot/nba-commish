import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Users, LayoutDashboard, Calendar, MapPin, DollarSign,
  TrendingUp, Globe2, ChevronRight, Wallet,
} from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NBAPlayer, NonNBATeam } from '../../types';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { EXTERNAL_SALARY_SCALE, EXTERNAL_CURRENCY, formatExternalSalary, EUROLEAGUE_TEAM_COUNTRIES, ENDESA_TEAM_COUNTRY } from '../../constants';
import { LeagueFinancesPanel } from '../finances/LeagueFinancesPanel';

// ─── League config ────────────────────────────────────────────────────────────
type LeagueId = 'Euroleague' | 'Endesa' | 'G-League' | 'WNBA' | 'B-League' | 'China CBA' | 'NBL Australia' | 'PBA';

interface LeagueConfig {
  id: LeagueId;
  shortName: string;
  fullName: string;
  region: string;
  flag: string;
  accentHex: string;
  accentBg: string;       // tailwind glow
  accentBorder: string;
  accentText: string;
  numTeams: number;
  regularSeasonGames: number;
  playoffTeams: number;
  playoffFormat: 'final-four' | 'bracket' | 'cup-format';
  seasonWindow: string;
  logoUrl: string;
}

const LEAGUE_CONFIG: Record<LeagueId, LeagueConfig> = {
  Euroleague: {
    id: 'Euroleague',
    shortName: 'EuroLeague',
    fullName: 'Turkish Airlines EuroLeague',
    region: 'Europe',
    flag: '🌍',
    accentHex: '#E8440A',
    accentBg: 'bg-orange-500/10',
    accentBorder: 'border-orange-500/30',
    accentText: 'text-orange-500',
    numTeams: 20,
    regularSeasonGames: 38,
    playoffTeams: 8,
    playoffFormat: 'final-four',
    seasonWindow: 'Sep 30 → May 24 (Final Four)',
    logoUrl: 'https://r2.thesportsdb.com/images/media/league/badge/7xjtuy1554397263.png',
  },
  Endesa: {
    id: 'Endesa',
    shortName: 'Liga ACB',
    fullName: 'Liga Endesa (ACB)',
    region: 'Spain',
    flag: '🇪🇸',
    accentHex: '#C41E3A',
    accentBg: 'bg-red-500/10',
    accentBorder: 'border-red-500/30',
    accentText: 'text-red-500',
    numTeams: 18,
    regularSeasonGames: 34,
    playoffTeams: 8,
    playoffFormat: 'bracket',
    seasonWindow: 'Oct 4 → Jun 28',
    logoUrl: 'https://r2.thesportsdb.com/images/media/league/badge/9i99ii1549879285.png',
  },
  'G-League': {
    id: 'G-League',
    shortName: 'G League',
    fullName: 'NBA G League',
    region: 'United States',
    flag: '🇺🇸',
    accentHex: '#6CA0DC',
    accentBg: 'bg-sky-500/10',
    accentBorder: 'border-sky-500/30',
    accentText: 'text-sky-400',
    numTeams: 30,
    regularSeasonGames: 50,
    playoffTeams: 16,
    playoffFormat: 'bracket',
    seasonWindow: 'Nov → Apr',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/NBA_G_League_logo.svg/1280px-NBA_G_League_logo.svg.png',
  },
  WNBA: {
    id: 'WNBA',
    shortName: 'WNBA',
    fullName: 'Women\'s National Basketball Association',
    region: 'United States',
    flag: '🇺🇸',
    accentHex: '#F68121',
    accentBg: 'bg-orange-400/10',
    accentBorder: 'border-orange-400/30',
    accentText: 'text-orange-400',
    numTeams: 13,
    regularSeasonGames: 40,
    playoffTeams: 8,
    playoffFormat: 'bracket',
    seasonWindow: 'May → Oct',
    logoUrl: 'https://content.sportslogos.net/logos/16/1152/full/6613__wnba-alternate-2020.png',
  },
  'B-League': {
    id: 'B-League',
    shortName: 'B.League',
    fullName: 'Japan B.League',
    region: 'Japan',
    flag: '🇯🇵',
    accentHex: '#003087',
    accentBg: 'bg-blue-600/10',
    accentBorder: 'border-blue-600/30',
    accentText: 'text-blue-400',
    numTeams: 24,
    regularSeasonGames: 60,
    playoffTeams: 8,
    playoffFormat: 'bracket',
    seasonWindow: 'Oct → May',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/B.LEAGUE_Logo.svg/1280px-B.LEAGUE_Logo.svg.png',
  },
  'China CBA': {
    id: 'China CBA',
    shortName: 'CBA',
    fullName: 'Chinese Basketball Association',
    region: 'China',
    flag: '🇨🇳',
    accentHex: '#CC0000',
    accentBg: 'bg-rose-500/10',
    accentBorder: 'border-rose-500/30',
    accentText: 'text-rose-400',
    numTeams: 20,
    regularSeasonGames: 52,
    playoffTeams: 12,
    playoffFormat: 'bracket',
    seasonWindow: 'Oct → Apr',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/b/b9/CBAlogo.svg',
  },
  'NBL Australia': {
    id: 'NBL Australia',
    shortName: 'NBL',
    fullName: 'National Basketball League (Australia)',
    region: 'Australia',
    flag: '🇦🇺',
    accentHex: '#007A4D',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/30',
    accentText: 'text-emerald-400',
    numTeams: 10,
    regularSeasonGames: 28,
    playoffTeams: 6,
    playoffFormat: 'bracket',
    seasonWindow: 'Sep → Mar',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c9/NBL_logo.svg/1280px-NBL_logo.svg.png',
  },
  PBA: {
    id: 'PBA',
    shortName: 'PBA',
    fullName: 'Philippine Basketball Association',
    region: 'Philippines',
    flag: '🇵🇭',
    accentHex: '#FFC72C',
    accentBg: 'bg-amber-400/10',
    accentBorder: 'border-amber-400/30',
    accentText: 'text-amber-400',
    numTeams: 12,
    regularSeasonGames: 33,
    playoffTeams: 8,
    playoffFormat: 'cup-format',
    seasonWindow: '3 cups per season',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/dd/Philippine_Basketball_Association_%28logo%29.svg/1280px-Philippine_Basketball_Association_%28logo%29.svg.png',
  },
};

// Map between Tab name (with " Hub" suffix) and LeagueId
export const HUB_TAB_TO_LEAGUE: Record<string, LeagueId> = {
  'Euroleague Hub': 'Euroleague',
  'Endesa Hub': 'Endesa',
  'G-League Hub': 'G-League',
  'WNBA Hub': 'WNBA',
  'B-League Hub': 'B-League',
  'China CBA Hub': 'China CBA',
  'NBL Australia Hub': 'NBL Australia',
  'PBA Hub': 'PBA',
};

// ─── Deterministic seeded W-L generator ───────────────────────────────────────
// Stable across renders, not random — same TID always gets same noise.
function seededNoise(tid: number): number {
  let x = (tid * 9301 + 49297) % 233280;
  return (x / 233280) - 0.5; // ~[-0.5, +0.5]
}

interface StandingRow {
  team: NonNBATeam;
  wins: number;
  losses: number;
  winPct: number;
  pf: number;
  pa: number;
  pd: number;
  teamOvr: number;
  topPlayers: NBAPlayer[];
}

function buildStandings(
  teams: NonNBATeam[],
  players: NBAPlayer[],
  config: LeagueConfig,
): StandingRow[] {
  return teams.map(team => {
    const roster = players.filter(p => p.tid === team.tid);
    const topPlayers = [...roster]
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
      .slice(0, 8);
    const teamOvr = topPlayers.length
      ? topPlayers.reduce((s, p) => s + (p.overallRating ?? 0), 0) / topPlayers.length
      : 50;
    // Convert OVR (40-85) into a winning percentage centred on 0.5.
    // Higher OVR → better record; deterministic noise prevents identical splits.
    const baseWinPct = (teamOvr - 50) / 30;
    const noise = seededNoise(team.tid) * 0.18;
    const winPct = Math.max(0.12, Math.min(0.88, 0.5 + baseWinPct + noise));
    const wins = Math.round(config.regularSeasonGames * winPct);
    const losses = config.regularSeasonGames - wins;
    // Synthetic point-diff: stronger teams ~1.05× weaker teams' scoring
    const ppg = 80 + (teamOvr - 50) * 0.6;
    const opp = 80 - (teamOvr - 50) * 0.4;
    const pf = Math.round(ppg * config.regularSeasonGames);
    const pa = Math.round(opp * config.regularSeasonGames);
    return {
      team, wins, losses,
      winPct: wins / (wins + losses || 1),
      pf, pa, pd: pf - pa,
      teamOvr, topPlayers,
    };
  }).sort((a, b) => b.winPct - a.winPct || b.pd - a.pd);
}

// ─── Header ───────────────────────────────────────────────────────────────────
const HubHeader: React.FC<{ config: LeagueConfig; teamCount: number; playerCount: number }> = ({
  config, teamCount, playerCount,
}) => (
  <div
    className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6"
    style={{ borderColor: `${config.accentHex}40` }}
  >
    <div
      className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
      style={{ background: config.accentHex }}
    />
    <div className="relative flex flex-col md:flex-row md:items-center gap-6">
      <div className="w-20 h-20 rounded-2xl bg-white/95 flex items-center justify-center p-3 shrink-0">
        <img src={config.logoUrl} alt={config.shortName}
          className="max-w-full max-h-full object-contain"
          referrerPolicy="no-referrer"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{config.flag} {config.region}</span>
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: `${config.accentHex}20`, color: config.accentHex }}>
            {config.numTeams} TEAMS
          </span>
        </div>
        <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">{config.fullName}</h1>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><Calendar size={12} />{config.seasonWindow}</span>
          <span className="flex items-center gap-1.5"><Users size={12} />{teamCount} clubs · {playerCount} players</span>
        </div>
      </div>
    </div>
  </div>
);

// ─── Subtab strip ─────────────────────────────────────────────────────────────
type SubView = 'standings' | 'teams' | 'players' | 'economy' | 'finances' | 'playoffs';

const SUBTABS: { id: SubView; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'standings', label: 'Standings',  icon: TrendingUp },
  { id: 'teams',     label: 'Teams',      icon: Users },
  { id: 'players',   label: 'Players',    icon: Trophy },
  { id: 'economy',   label: 'Economy',    icon: DollarSign },
  { id: 'finances',  label: 'Finances',   icon: Wallet },
  { id: 'playoffs',  label: 'Playoffs',   icon: LayoutDashboard },
];

const SubTabStrip: React.FC<{ active: SubView; onChange: (v: SubView) => void; accent: string }> = ({
  active, onChange, accent,
}) => (
  <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit">
    {SUBTABS.map(t => {
      const isActive = active === t.id;
      return (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
          style={isActive ? { background: accent, color: '#000' } : { color: '#94a3b8' }}
        >
          <t.icon size={12} />
          {t.label}
        </button>
      );
    })}
  </div>
);

// ─── Standings table ──────────────────────────────────────────────────────────
const StandingsTable: React.FC<{ rows: StandingRow[]; config: LeagueConfig }> = ({ rows, config }) => {
  const playoffCutoff = config.playoffTeams;
  return (
    <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-white italic">League Standings</h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Top {playoffCutoff} → Playoffs
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left min-w-[640px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-widest text-[10px] border-b border-white/5">
              <th className="px-4 py-3 font-bold">#</th>
              <th className="px-4 py-3 font-bold">Team</th>
              <th className="px-2 py-3 font-bold text-center">W</th>
              <th className="px-2 py-3 font-bold text-center">L</th>
              <th className="px-2 py-3 font-bold text-center">PCT</th>
              <th className="px-2 py-3 font-bold text-center">PF</th>
              <th className="px-2 py-3 font-bold text-center">PA</th>
              <th className="px-3 py-3 font-bold text-right">+/-</th>
              <th className="px-3 py-3 font-bold text-right">OVR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r, idx) => {
              const inPlayoffs = idx < playoffCutoff;
              return (
                <tr key={r.team.tid}
                    className={`group transition-colors ${inPlayoffs ? '' : 'opacity-60'} hover:bg-white/[0.04]`}>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    <span style={inPlayoffs ? { color: config.accentHex } : { color: '#475569' }}
                      className="font-black">
                      {idx + 1}
                    </span>
                    {inPlayoffs && (
                      <span className="ml-1.5 text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded"
                        style={{ background: `${config.accentHex}20`, color: config.accentHex }}>
                        PO
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {r.team.imgURL && (
                        <div className="w-7 h-7 rounded-md bg-black/30 p-0.5 border border-white/5">
                          <img src={r.team.imgURL} alt={r.team.name}
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      )}
                      <span className="font-bold text-slate-200 group-hover:text-white text-xs">
                        {r.team.region} {r.team.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center font-mono tabular-nums font-black text-emerald-500">{r.wins}</td>
                  <td className="px-2 py-2.5 text-center font-mono tabular-nums font-black text-red-500">{r.losses}</td>
                  <td className="px-2 py-2.5 text-center font-mono tabular-nums text-slate-300">{r.winPct.toFixed(3).slice(1)}</td>
                  <td className="px-2 py-2.5 text-center font-mono tabular-nums text-slate-400">{r.pf}</td>
                  <td className="px-2 py-2.5 text-center font-mono tabular-nums text-slate-400">{r.pa}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-bold ${r.pd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.pd >= 0 ? '+' : ''}{r.pd}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-black text-white">{r.teamOvr.toFixed(1)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No team data available for this league yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-white/5 text-[10px] text-slate-500">
        Standings derived from current squad ratings. Replace with live W-L when sim engine wires this league.
      </div>
    </div>
  );
};

// ─── Team grid ────────────────────────────────────────────────────────────────
const TeamGrid: React.FC<{ rows: StandingRow[]; config: LeagueConfig; onPick?: (team: NonNBATeam) => void }> = ({
  rows, config, onPick,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {rows.map(r => {
      const country = config.id === 'Euroleague'
        ? EUROLEAGUE_TEAM_COUNTRIES[r.team.tid] ?? '—'
        : config.id === 'Endesa' ? ENDESA_TEAM_COUNTRY : config.region;
      return (
        <button
          key={r.team.tid}
          onClick={() => onPick?.(r.team)}
          className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 rounded-2xl p-4 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-white/95 p-1.5 shrink-0">
              {r.team.imgURL
                ? <img src={r.team.imgURL} alt={r.team.name}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                : <div className="w-full h-full flex items-center justify-center text-slate-700 text-sm font-black">
                    {r.team.abbrev}
                  </div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black text-white truncate uppercase italic">
                {r.team.region} {r.team.name}
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">{r.team.abbrev} · {country}</div>
            </div>
            <ChevronRight size={14} className="text-slate-600 group-hover:text-white" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5">
            <Stat label="REC" value={`${r.wins}-${r.losses}`} />
            <Stat label="OVR" value={r.teamOvr.toFixed(1)} accent={config.accentHex} />
            <Stat label="POP" value={`${r.team.pop.toFixed(1)}M`} />
          </div>
        </button>
      );
    })}
  </div>
);

const Stat: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <div>
    <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">{label}</div>
    <div className="text-sm font-black tabular-nums" style={{ color: accent ?? '#fff' }}>{value}</div>
  </div>
);

// ─── Player leaders ───────────────────────────────────────────────────────────
const PlayerLeaders: React.FC<{
  players: NBAPlayer[];
  teams: NonNBATeam[];
  config: LeagueConfig;
  onPick: (p: NBAPlayer) => void;
}> = ({ players, teams, config, onPick }) => {
  const teamMap = useMemo(() => new Map(teams.map(t => [t.tid, t])), [teams]);
  const sorted = useMemo(
    () => [...players].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0)).slice(0, 50),
    [players],
  );
  return (
    <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5">
        <h3 className="text-sm font-black uppercase tracking-widest text-white italic">Top 50 Players · OVR</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left min-w-[600px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-widest text-[10px] border-b border-white/5">
              <th className="px-4 py-3 font-bold">#</th>
              <th className="px-4 py-3 font-bold">Player</th>
              <th className="px-3 py-3 font-bold">Team</th>
              <th className="px-2 py-3 font-bold text-center">POS</th>
              <th className="px-2 py-3 font-bold text-center">AGE</th>
              <th className="px-3 py-3 font-bold text-right">OVR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((p, idx) => {
              const team = teamMap.get(p.tid);
              return (
                <tr key={p.internalId}
                    onClick={() => onPick(p)}
                    className="group hover:bg-white/[0.04] transition-colors cursor-pointer">
                  <td className="px-4 py-2.5 font-mono tabular-nums text-slate-500 font-black">{idx + 1}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {p.imgURL && (
                        <img src={p.imgURL} alt={p.name}
                          className="w-8 h-8 rounded-md object-cover bg-slate-800"
                          referrerPolicy="no-referrer"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <span className="font-bold text-slate-200 group-hover:text-white text-xs">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 text-[11px]">
                    {team ? `${team.region} ${team.name}` : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-500 text-[11px] font-bold">{p.pos ?? '—'}</td>
                  <td className="px-2 py-2.5 text-center text-slate-500 font-mono tabular-nums">
                    {(p as any).age ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-black"
                      style={{ color: config.accentHex }}>
                    {p.overallRating ?? '—'}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No players loaded for this league.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Economy panel ────────────────────────────────────────────────────────────
const EconomyPanel: React.FC<{ config: LeagueConfig; nbaSalaryCap: number }> = ({ config, nbaSalaryCap }) => {
  const scale = EXTERNAL_SALARY_SCALE[config.id];
  const cur = EXTERNAL_CURRENCY[config.id];
  if (!scale) {
    return <div className="text-slate-500 text-sm">No economy scale defined for this league.</div>;
  }
  // The scale.maxPct is a fraction of the NBA cap (not max contract).
  const maxUSD = nbaSalaryCap * scale.maxPct;
  const minUSD = nbaSalaryCap * scale.minPct;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="Salary Scale" accent={config.accentHex}>
        <Row label="Max contract"
             usd={maxUSD}
             local={formatExternalSalary(maxUSD, config.id)} />
        <Row label="Min contract"
             usd={minUSD}
             local={formatExternalSalary(minUSD, config.id)} />
        <div className="pt-3 mt-2 border-t border-white/5 text-[10px] text-slate-500">
          Scaled at <span className="font-bold text-slate-300">{(scale.maxPct * 100).toFixed(2)}%</span> of NBA cap
          (${(nbaSalaryCap / 1_000_000).toFixed(0)}M). Inflates automatically with NBA cap.
        </div>
      </Card>
      <Card title="Currency & FX" accent={config.accentHex}>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Code</span>
            <span className="font-mono font-black text-white">{cur?.code ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Symbol</span>
            <span className="font-mono font-black text-white">{cur?.symbol ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">FX rate</span>
            <span className="font-mono font-black text-white">{cur?.rate.toFixed(2) ?? '—'} / USD</span>
          </div>
        </div>
      </Card>
      <Card title="FA Behavior" accent={config.accentHex}>
        <Row label="Re-sign probability" plain="90%" />
        <Row label="Home-country bias"  plain="60%" />
        <div className="pt-3 mt-2 border-t border-white/5 text-[10px] text-slate-500">
          Players in {config.shortName} re-sign or shuffle within the league at year-end.
          Cross-league moves trigger when their attribute scaling exceeds NBA-pool threshold.
        </div>
      </Card>
      <Card title="Roster Footprint" accent={config.accentHex}>
        <Row label="Teams"            plain={String(config.numTeams)} />
        <Row label="Regular season"   plain={`${config.regularSeasonGames} games`} />
        <Row label="Playoff teams"    plain={String(config.playoffTeams)} />
        <Row label="Format"           plain={config.playoffFormat} />
      </Card>
    </div>
  );
};

const Card: React.FC<{ title: string; accent: string; children: React.ReactNode }> = ({ title, accent, children }) => (
  <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-5">
    <div className="flex items-center gap-2 mb-4">
      <div className="h-4 w-1 rounded-full" style={{ background: accent }} />
      <h4 className="text-xs font-black uppercase tracking-widest text-white italic">{title}</h4>
    </div>
    <div className="space-y-2 text-xs">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; usd?: number; local?: string; plain?: string }> = ({
  label, usd, local, plain,
}) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">{label}</span>
    <div className="text-right">
      {plain ? <span className="font-black text-white text-xs uppercase">{plain}</span> : (
        <>
          <span className="font-black text-white text-xs">{local}</span>
          {usd !== undefined && (
            <span className="block text-[10px] text-slate-500 font-mono">
              ${(usd / 1_000_000).toFixed(2)}M USD
            </span>
          )}
        </>
      )}
    </div>
  </div>
);

// ─── Playoff placeholder (Final Four / Bracket) ───────────────────────────────
const PlayoffPlaceholder: React.FC<{ rows: StandingRow[]; config: LeagueConfig }> = ({ rows, config }) => {
  const seeded = rows.slice(0, config.playoffTeams);
  const isFinalFour = config.playoffFormat === 'final-four';
  const f4 = seeded.slice(0, 4);
  return (
    <div className="space-y-6">
      <div className="bg-white/[0.03] backdrop-blur-xl border rounded-2xl p-5"
           style={{ borderColor: `${config.accentHex}30` }}>
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} style={{ color: config.accentHex }} />
          <h3 className="text-sm font-black uppercase tracking-widest text-white italic">
            {isFinalFour ? 'Final Four — Projected Seeds' : 'Playoff Bracket — Projected Seeds'}
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Projected from current standings. Live bracket renders here once the sim engine wires {config.shortName} playoffs.
        </p>
        {isFinalFour ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {f4.map((r, idx) => (
              <SeedCard key={r.team.tid} row={r} seed={idx + 1} accent={config.accentHex} />
            ))}
            {f4.length < 4 && (
              <div className="col-span-full text-center text-slate-500 text-xs py-4">
                Need at least 4 teams to seed the Final Four.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {seeded.map((r, idx) => (
              <SeedCard key={r.team.tid} row={r} seed={idx + 1} accent={config.accentHex} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SeedCard: React.FC<{ row: StandingRow; seed: number; accent: string }> = ({ row, seed, accent }) => (
  <div className="bg-black/30 border border-white/5 rounded-xl p-3">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
        style={{ background: `${accent}20`, color: accent }}>
        #{seed}
      </span>
      <span className="text-[10px] font-mono tabular-nums text-slate-500">
        {row.wins}-{row.losses}
      </span>
    </div>
    <div className="flex items-center gap-2">
      {row.team.imgURL && (
        <div className="w-8 h-8 rounded bg-white/95 p-0.5">
          <img src={row.team.imgURL} alt={row.team.name}
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
      <span className="text-xs font-bold text-white truncate">{row.team.name}</span>
    </div>
  </div>
);

// ─── Main hub ─────────────────────────────────────────────────────────────────
interface Props {
  league: LeagueId;
}

export const InternationalLeagueHub: React.FC<Props> = ({ league }) => {
  const { state } = useGame();
  const [view, setView] = useState<SubView>('standings');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  const config = LEAGUE_CONFIG[league];
  const teams = useMemo(
    () => (state.nonNBATeams ?? []).filter(t => t.league === league),
    [state.nonNBATeams, league],
  );
  const players = useMemo(
    () => (state.players ?? []).filter(p => p.status === league && p.tid !== -1) as NBAPlayer[],
    [state.players, league],
  );
  const standings = useMemo(() => buildStandings(teams, players, config), [teams, players, config]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="min-h-full bg-[#050505] text-slate-200 px-4 md:px-8 py-6 space-y-6">
      <HubHeader config={config} teamCount={teams.length} playerCount={players.length} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <SubTabStrip active={view} onChange={setView} accent={config.accentHex} />
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <Globe2 size={12} />
          <span>League hub · standings simulated from squad strength</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {view === 'standings' && <StandingsTable rows={standings} config={config} />}
          {view === 'teams' && <TeamGrid rows={standings} config={config} />}
          {view === 'players' && (
            <PlayerLeaders
              players={players}
              teams={teams}
              config={config}
              onPick={setViewingPlayer}
            />
          )}
          {view === 'economy' && (
            <EconomyPanel config={config} nbaSalaryCap={state.leagueStats.salaryCap ?? 154_647_000} />
          )}
          {view === 'finances' && (
            <LeagueFinancesPanel
              teams={teams}
              players={players}
              displayName={config.fullName}
              shortName={config.shortName}
              currencySymbol={EXTERNAL_CURRENCY[config.id]?.symbol ?? '$'}
              seasonYear={state.leagueStats?.year ?? new Date().getFullYear()}
            />
          )}
          {view === 'playoffs' && <PlayoffPlaceholder rows={standings} config={config} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
