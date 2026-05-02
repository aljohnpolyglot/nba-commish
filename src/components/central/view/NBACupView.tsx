import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  Users,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  Medal,
  Award,
  Search,
} from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBACupState } from '../../../types';
import type { NBAPlayer } from '../../../types';
import { NBACupYearData, Standing, BracketTeam, WikiYearData } from '../types';
import { PlayerBioView } from './PlayerBioView';
import { extractNbaId, hdPortrait } from '../../../utils/helpers';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { isNbaCupEnabled } from '../../../utils/ruleFlags';

const GIST_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbacupdata';

function parseSeasonEndYear(season: string): string {
  const trimmed = season.trim();
  const singleYear = trimmed.match(/^(\d{4})/);
  if (singleYear) return String(Number(singleYear[1]) + 1);
  return trimmed;
}

function formatStandingPd(pd: number): string {
  if (!Number.isFinite(pd)) return '';
  return pd >= 0 ? `+${pd}` : String(pd);
}

function parseStandingNumber(value: string): number {
  const normalized = String(value ?? '')
    .replace(/−/g, '-')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortStandingsRows(rows: Standing[]): Standing[] {
  return [...rows]
    .sort((a, b) => parseStandingNumber(b.w) - parseStandingNumber(a.w) || parseStandingNumber(b.pd) - parseStandingNumber(a.pd) || parseStandingNumber(b.pf) - parseStandingNumber(a.pf))
    .map((row, idx) => ({
      ...row,
      rank: row.rank || String(idx + 1),
      pd: row.pd === '' ? row.pd : formatStandingPd(parseStandingNumber(row.pd)),
    }));
}

function inferTeamConference(
  teamName: string,
  teams?: { id: number; name: string; logoURL?: string; conference?: string }[],
): 'East' | 'West' | null {
  if (!teams) return null;
  const cleanName = teamName.replace(/^[EW]\d+\s*/i, '').trim().toLowerCase();
  const normalizedName = cleanName.replace(/[^a-z0-9]/g, '');
  const match = teams.find(team => {
    const teamNameLower = team.name.toLowerCase();
    const teamNameNorm = teamNameLower.replace(/[^a-z0-9]/g, '');
    const abbrevNorm = (team as any).abbrev ? String((team as any).abbrev).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    return (
      teamNameLower === cleanName ||
      teamNameNorm === normalizedName ||
      (abbrevNorm && normalizedName.includes(abbrevNorm)) ||
      (abbrevNorm && abbrevNorm.includes(normalizedName)) ||
      cleanName.includes(teamNameLower) ||
      teamNameLower.includes(cleanName)
    );
  });
  if (!match) return null;
  return match.conference === 'East' || match.conference === 'West' ? match.conference : null;
}

function inferGroupConference(
  groupName: string,
  standings: Standing[],
  teams?: { id: number; name: string; logoURL?: string; conference?: string }[],
): 'East' | 'West' | null {
  const lower = groupName.toLowerCase();
  if (lower.includes('east')) return 'East';
  if (lower.includes('west')) return 'West';

  if (teams) {
    let east = 0;
    let west = 0;
    for (const row of standings) {
      const conf = inferTeamConference(row.team, teams);
      if (conf === 'East') east++;
      if (conf === 'West') west++;
    }
    if (east !== west) return east > west ? 'East' : 'West';
  }

  const groupMatch = lower.match(/group\s*([a-z0-9]+)/i) ?? lower.match(/\b([a-z])\b/i);
  if (groupMatch?.[1]) {
    const groupToken = groupMatch[1].toUpperCase();
    const letter = groupToken.charCodeAt(0);
    if (letter >= 65 && letter <= 67) return 'East';
    if (letter >= 68 && letter <= 90) return 'West';
  }

  return null;
}

function groupSortKey(name: string): number {
  const match = name.toLowerCase().match(/group\s*([a-z0-9]+)/i) ?? name.toLowerCase().match(/(?:east|west)[-\s]?([a-z0-9]+)/i);
  if (!match?.[1]) return 999;
  const token = match[1].toUpperCase();
  if (/^\d+$/.test(token)) return Number(token);
  return token.charCodeAt(0) - 64;
}

function sortGroupsForDisplay(
  groups: Record<string, Standing[]>,
  teams?: { id: number; name: string; logoURL?: string; conference?: string }[],
) {
  const east: { name: string; standings: Standing[] }[] = [];
  const west: { name: string; standings: Standing[] }[] = [];
  const unknown: { name: string; standings: Standing[] }[] = [];

  const orderedGroups = Object.entries(groups ?? {})
    .map(([name, standings]) => ({ name, standings: sortStandingsRows(Array.isArray(standings) ? standings : []) }))
    .sort((a, b) => groupSortKey(a.name) - groupSortKey(b.name) || a.name.localeCompare(b.name));

  const eastFallbackCutoff = Math.ceil(orderedGroups.length / 2);

  orderedGroups.forEach((group, idx) => {
    const conf = inferGroupConference(group.name, group.standings, teams)
      ?? (idx < eastFallbackCutoff ? 'East' : 'West');
    if (conf === 'East') east.push(group);
    else if (conf === 'West') west.push(group);
    else unknown.push(group);
  });

  return { east: [...east, ...unknown], west };
}

// ─── Live-state adapter ───────────────────────────────────────────────────────
function cupStateToViewData(
  cup: NBACupState,
  teams: { id: number; name: string; logoURL?: string }[],
  players?: Array<{ internalId: string; name: string }>,
  schedule?: Array<{ gid: number; homeTid: number; awayTid: number; homeScore?: number; awayScore?: number; played?: boolean }>,
  boxScores?: Array<{ gameId: number; homeTeamId: number; awayTeamId: number; homeScore: number; awayScore: number }>,
): NBACupYearData {
  const teamName = (tid: number) => teams.find(t => t.id === tid)?.name ?? String(tid);
  const playerName = (pid: string) => players?.find(p => p.internalId === pid)?.name ?? pid;
  const champion = cup.championTid !== undefined ? teamName(cup.championTid) : 'TBD';
  const runnerUp = cup.runnerUpTid !== undefined ? teamName(cup.runnerUpTid) : 'TBD';

  // Group tables
  // Advancement coloring: rank-1 → group winner (always advances). Wildcards
  // come from cup.wildcards.{East,West} once the group stage closes. Anyone
  // else is eliminated (only meaningful AFTER group stage is complete).
  const wildcardTids = new Set<number>();
  if (cup.wildcards?.East != null) wildcardTids.add(cup.wildcards.East);
  if (cup.wildcards?.West != null) wildcardTids.add(cup.wildcards.West);
  const phaseLocked = cup.status !== 'group';
  const groups: Record<string, Standing[]> = {};
  for (const g of cup.groups) {
    const sorted = [...g.standings].sort((a, b) => b.w - a.w || b.pd - a.pd || b.pf - a.pf);
    groups[g.id] = sorted.map((s, idx) => {
      let advancement: Standing['advancement'] | undefined;
      if (phaseLocked) {
        if (idx === 0) advancement = 'winner';
        else if (wildcardTids.has(s.tid)) advancement = 'wildcard';
        else advancement = 'eliminated';
      }
      return {
        rank: String(idx + 1),
        team: teamName(s.tid),
        pld: String(s.gp),
        w: String(s.w),
        l: String(s.l),
        pf: String(s.pf),
        pa: String(s.pa),
        pd: s.pd >= 0 ? `+${s.pd}` : String(s.pd),
        advancement,
      };
    });
  }

  // Bracket from knockout — pull live scores from the schedule; fall back to box scores
  // for past seasons where the schedule has been cleared.
  const bracket: BracketTeam[] = [];
  for (const ko of cup.knockout) {
    const game = ko.gameId != null ? schedule?.find(g => g.gid === ko.gameId) : undefined;
    let score1 = 0, score2 = 0;
    if (game?.played) {
      const tid1IsHome = game.homeTid === ko.tid1;
      score1 = (tid1IsHome ? game.homeScore : game.awayScore) ?? 0;
      score2 = (tid1IsHome ? game.awayScore : game.homeScore) ?? 0;
    } else if (ko.gameId != null && boxScores) {
      const bs = boxScores.find(b => b.gameId === ko.gameId);
      if (bs) {
        const tid1IsHome = bs.homeTeamId === ko.tid1;
        score1 = tid1IsHome ? bs.homeScore : bs.awayScore;
        score2 = tid1IsHome ? bs.awayScore : bs.homeScore;
      }
    }
    bracket.push({ seed: String(ko.seed1), team: teamName(ko.tid1), score: score1, gameId: ko.gameId });
    bracket.push({ seed: String(ko.seed2), team: teamName(ko.tid2), score: score2, gameId: ko.gameId });
  }

  // All-Tournament Team
  const allTournamentTeam = (cup.allTournamentTeam ?? []).map(entry => {
    return {
      pos: entry.pos,
      player: playerName(entry.playerId),
      team: teamName(entry.tid),
      is_mvp: entry.isMvp,
    };
  });

  return {
    year: String(cup.year),
    summary: {
      location: 'T-Mobile Arena',
      date: `Dec ${cup.year - 1}`,
      venues: 'T-Mobile Arena, Las Vegas',
      teams: '30',
      purse: cup.prizePool ? '$500k / $200k / $100k / $50k per player' : 'Cup Bonuses Off',
      champions: champion,
      runner_up: runnerUp,
      mvp: cup.mvpPlayerId ? playerName(cup.mvpPlayerId) : 'TBD',
    },
    all_tournament_team: allTournamentTeam,
    groups,
    bracket,
  };
}

// ─── Wiki/gist data transform ─────────────────────────────────────────────────
function transformWikiData(wikiData: WikiYearData[]): NBACupYearData[] {
  return wikiData
    .map(yearData => {
    const year = parseSeasonEndYear(yearData.season);
    const infobox = yearData.infobox;

    const summary = {
      location: infobox.Location || '',
      date: infobox.Date || '',
      venues: infobox.Venues || '',
      teams: infobox.Teams || '',
      purse: infobox.Purse || '',
      champions: infobox.Champions || '',
      runner_up: infobox['Runner-up'] || '',
      mvp: infobox.MVP || '',
    };

    const groups: Record<string, Standing[]> = {};
    let groupCount = 0;

    yearData.tables.forEach(table => {
      const headers = table.headers.map(h => h.toLowerCase());
      const posIdx = headers.indexOf('pos');
      const teamIdx = headers.indexOf('team');
      if (posIdx === -1 || teamIdx === -1) return;

      const pldIdx = headers.indexOf('pld');
      const wIdx = headers.indexOf('w');
      const lIdx = headers.indexOf('l');
      const pfIdx = headers.indexOf('pf');
      const paIdx = headers.indexOf('pa');
      const pdIdx = headers.indexOf('pd');
      const grpIdx = headers.indexOf('grp');
      const qualIdx = headers.indexOf('qualification');

      const standings = table.rows
        .map(row => {
          if (row[teamIdx] === 'Team' || row[posIdx] === 'Pos') return null;
          const clean = (s: string) => String(s).replace(/[\[\(\{][\w\-]+[\]\)\}]/g, '').trim();
          const pdValue = pdIdx !== -1 ? row[pdIdx] : '';
          return {
            rank: clean(row[posIdx] || ''),
            team: clean(row[teamIdx] || ''),
            pld: pldIdx !== -1 ? clean(row[pldIdx]) : '',
            w: wIdx !== -1 ? clean(row[wIdx]) : '',
            l: lIdx !== -1 ? clean(row[lIdx]) : '',
            pf: pfIdx !== -1 ? clean(row[pfIdx]) : '',
            pa: paIdx !== -1 ? clean(row[paIdx]) : '',
            pd: pdValue === '' ? '' : formatStandingPd(parseStandingNumber(pdValue)),
            grp: grpIdx !== -1 ? clean(row[grpIdx]) : undefined,
            qualification: qualIdx !== -1 ? clean(row[qualIdx]) : undefined,
          } as Standing;
        })
        .filter((s): s is Standing => !!s && s.team !== '' && s.team !== 'Team');

      if (standings.length === 5) {
        const groupName = table.caption || `Group ${String.fromCharCode(65 + groupCount)}`;
        // Auto-detect advancement from the wiki "qualification" column (text like
        // "Advanced to Knockout Stage", "...as Wild Card", "Eliminated").
        const sorted = sortStandingsRows(standings);
        const tagged = sorted.map((row, idx) => {
          const q = (row.qualification ?? '').toLowerCase();
          const isWildcard = q.includes('wild');
          const isAdvanced = q.includes('advanc') || q.includes('knockout');
          let advancement: Standing['advancement'] | undefined;
          if (isWildcard) advancement = 'wildcard';
          else if (isAdvanced || idx === 0) advancement = 'winner';
          else advancement = 'eliminated';
          return { ...row, advancement };
        });
        groups[groupName] = tagged;
        groupCount++;
      }
    });

    const allTournamentTable = yearData.tables.find(
      t => t.caption.includes('All-NBA') || t.caption.includes('All-Tournament'),
    );
    const all_tournament_team = (allTournamentTable?.rows ?? []).map(row => ({
      pos: row[0] || '',
      player: (row[1] || '').replace(' (MVP)', ''),
      team: row[2] || '',
      is_mvp: (row[1] || '').includes('(MVP)'),
    }));

    const rawBracket = yearData.bracket;
    const bracket: BracketTeam[] = typeof rawBracket === 'object' && rawBracket !== null
      ? (() => {
          const parseTeam = (text: string, score: number): BracketTeam => {
            const m = text.match(/^([EW])?(\d+)?\s*(.*)$/);
            return { seed: m?.[2] || '', team: m?.[3]?.trim() || text.trim(), score: score || 0 };
          };
          const extract = (game: any): BracketTeam[] =>
            game ? [parseTeam(game.team1 || '', game.score1), parseTeam(game.team2 || '', game.score2)] : [];
          const qf = (rawBracket.quarterfinals || []).flatMap(extract);
          const sf = (rawBracket.semifinals || []).flatMap(extract);
          const final = extract(rawBracket.final);
          return [...qf, ...sf, ...final];
        })()
      : [];

    // Wildcards = teams in bracket that aren't 1st in their standings group.
    // Bracket names are city-only (e.g. "Milwaukee", "LA Lakers"); standings use
    // full names ("Milwaukee Bucks") — fuzzy match by substring.
    const bracketCities = new Set(
      bracket.map(b => b.team.toLowerCase().trim()).filter(Boolean),
    );
    Object.keys(groups).forEach(gKey => {
      groups[gKey] = groups[gKey].map((row, idx) => {
        if (idx === 0) return row; // group winner stays
        const std = row.team.toLowerCase();
        const inBracket = [...bracketCities].some(b => std.includes(b) || b.includes(std));
        return inBracket ? { ...row, advancement: 'wildcard' as const } : row;
      });
    });

    const result = { year, summary, all_tournament_team, groups, bracket };
    console.log('Transform item:', { season: yearData.season, year, resultYear: result.year });
    return result;
  });
}

function getTeamLogo(teamName: string, teams?: any[]): string | null {
  const clean = teamName.toLowerCase().replace(/^[ew]\d+\s*/i, '').trim();
  const t = teams?.find(t => {
    const tName = t.name.toLowerCase();
    return tName === clean || tName.includes(clean) || clean.includes(tName.split(' ').pop() ?? '');
  });
  return t?.logoUrl ?? null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PrizePool({ cup }: { cup?: NBACupState }) {
  if (cup && cup.prizePool === undefined && cup.status !== 'group') {
    return (
      <div className="mb-8 px-4 py-3 bg-slate-800/40 border border-slate-700/30 rounded-2xl">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cup Bonuses Off</span>
      </div>
    );
  }

  const prizes = [
    { label: 'Winner', amount: '$500,000', color: 'text-amber-500', border: 'border-amber-500/30', icon: <Trophy className="w-5 h-5 text-amber-500" /> },
    { label: 'Runner-up', amount: '$200,000', color: 'text-slate-200', border: 'border-white/10', icon: <Medal className="w-5 h-5 text-slate-400" /> },
    { label: 'Semifinalist', amount: '$100,000', color: 'text-slate-400', border: 'border-white/5', icon: <Award className="w-5 h-5 text-slate-500" /> },
    { label: 'Quarterfinalist', amount: '$50,000', color: 'text-slate-500', border: 'border-white/5', icon: <Users className="w-5 h-5 text-slate-600" /> },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
      {prizes.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`bg-white/[0.03] backdrop-blur-xl border ${p.border} p-6 rounded-3xl relative overflow-hidden group hover:bg-white/[0.05] transition-all`}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              {p.icon}
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{p.label}</span>
            </div>
            <p className={`text-2xl font-black ${p.color} tabular-nums leading-none`}>{p.amount}</p>
          </div>
          <div className="absolute -bottom-6 -right-6 opacity-5 group-hover:opacity-10 transition-all pointer-events-none">
            <Trophy size={100} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, icon, subText }: { label: string; value: string; icon: React.ReactNode; subText?: string }) {
  return (
    <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6 rounded-3xl hover:bg-white/[0.06] transition-all hover:scale-[1.02] hover:border-white/20 group cursor-default">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 group-hover:border-amber-500/30 transition-colors">
          {icon}
        </div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className="text-xl font-black text-white leading-none tracking-tight mb-2 uppercase italic">{value}</p>
      {subText && (
        <div className="inline-flex items-center px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{subText}</span>
        </div>
      )}
    </div>
  );
}

function GroupTable({
  name,
  standings,
  variant = 'default',
  teams,
}: {
  name: string;
  standings: Standing[];
  variant?: 'default' | 'info' | 'success';
  teams?: { id: number; name: string; logoURL?: string }[];
}) {
  const variantStyles = {
    default: { border: 'border-white/5', header: 'bg-white/5', icon: <Users className="w-4 h-4 text-amber-500" /> },
    info: { border: 'border-blue-500/10', header: 'bg-blue-500/5', icon: <Search className="w-4 h-4 text-blue-500" /> },
    success: { border: 'border-emerald-500/10', header: 'bg-emerald-500/5', icon: <Award className="w-4 h-4 text-emerald-500" /> },
  };
  const style = variantStyles[variant];

  return (
    <div className={`bg-white/[0.03] backdrop-blur-xl border ${style.border} rounded-[40px] overflow-hidden shadow-2xl transition-all hover:bg-white/[0.05]`}>
      <div className={`px-8 py-6 ${style.header} border-b border-white/5 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center border border-white/5">
            {style.icon}
          </div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white italic">{name}</h3>
        </div>
        <div className="text-[9px] font-black text-slate-500 bg-white/5 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
          {variant === 'default' ? 'Group Stage' : 'Phase Final'}
        </div>
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-xs text-left min-w-[600px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-[0.2em] text-[10px] border-b border-white/5">
              <th className="px-8 py-5 font-bold">Team</th>
              {standings[0]?.grp && <th className="px-3 py-5 font-bold text-center">Grp</th>}
              <th className="px-3 py-5 font-bold text-center">GP</th>
              <th className="px-3 py-5 font-bold text-center">W</th>
              <th className="px-3 py-5 font-bold text-center">L</th>
              <th className="px-3 py-5 font-bold text-center">PF</th>
              <th className="px-3 py-5 font-bold text-center">PA</th>
              <th className="px-8 py-5 font-bold text-right font-mono">PD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {standings.map(row => {
              const advBg = row.advancement === 'winner'    ? 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10] border-l-2 border-emerald-500/60'
                          : row.advancement === 'wildcard'  ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.10] border-l-2 border-amber-500/60'
                          : row.advancement === 'eliminated'? 'opacity-50 hover:bg-white/[0.02]'
                          :                                   'hover:bg-white/[0.02]';
              const rankColor = row.advancement === 'winner'   ? 'text-emerald-400'
                              : row.advancement === 'wildcard' ? 'text-amber-400'
                              : row.rank === '1'               ? 'text-amber-500'
                              :                                  'text-slate-600 group-hover:text-slate-400';
              return (
              <tr key={row.team} className={`transition-colors group ${advBg}`}>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-5">
                    <span className={`w-4 text-center font-black tabular-nums ${rankColor}`}>
                      {row.rank}
                    </span>
                    {row.advancement === 'winner' && (
                      <span title="Group Winner — Advanced" className="text-[8px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">
                        ADV
                      </span>
                    )}
                    {row.advancement === 'wildcard' && (
                      <span title="Wildcard — Advanced" className="text-[8px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">
                        WC
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-black/40 flex items-center justify-center p-1.5 border border-white/10 shadow-inner group-hover:border-white/20 transition-all">
                        <img
                          src={getTeamLogo(row.team, teams) ?? `https://via.placeholder.com/32?text=${row.team.charAt(0)}`}
                          alt={row.team}
                          className="w-full h-full object-contain"
                          onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                        />
                      </div>
                      <span className="font-bold text-slate-200 group-hover:text-white transition-colors text-sm">{row.team}</span>
                    </div>
                  </div>
                </td>
                {row.grp && (
                  <td className="px-3 py-5 text-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase bg-white/5 px-2 py-0.5 rounded border border-white/5">{row.grp}</span>
                  </td>
                )}
                <td className="px-3 py-5 text-center text-slate-500 font-mono tabular-nums font-bold">{row.pld}</td>
                <td className="px-3 py-5 text-center">
                  <span className="font-mono font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded text-[11px] tabular-nums">{row.w}</span>
                </td>
                <td className="px-3 py-5 text-center">
                  <span className="font-mono font-black text-red-500 bg-red-500/10 px-2.5 py-1 rounded text-[11px] tabular-nums">{row.l}</span>
                </td>
                <td className="px-3 py-5 text-center text-slate-400 font-mono tabular-nums font-bold">{row.pf}</td>
                <td className="px-3 py-5 text-center text-slate-400 font-mono tabular-nums font-bold">{row.pa}</td>
                <td className={`px-8 py-5 text-right font-mono font-black tabular-nums text-sm ${
                  row.pd.startsWith('+') ? 'text-emerald-400' :
                  row.pd === '0' || row.pd === '+0' ? 'text-slate-500' : 'text-red-400'
                }`}>
                  {row.pd}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchCard({ teams: matchTeams, highlighted, size = 'default', delay = 0, liveTeams, onGameClick }: { teams: [BracketTeam, BracketTeam]; highlighted?: boolean; size?: 'default' | 'large'; delay?: number; liveTeams?: { id: number; name: string; logoURL?: string }[]; onGameClick?: () => void }) {
  const winnerIndex = matchTeams[0].score > matchTeams[1].score ? 0 : 1;
  const isLarge = size === 'large';
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onGameClick}
      className={`${isLarge ? 'w-64' : 'w-60'} bg-white/[0.03] backdrop-blur-xl border ${highlighted ? 'border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.1)]' : 'border-white/5'} rounded-[24px] overflow-hidden shadow-2xl transition-all hover:bg-white/[0.06] hover:border-white/10 ${onGameClick ? 'cursor-pointer' : ''}`}
    >
      {matchTeams.map((t, i) => (
        <div
          key={i}
          className={`px-5 py-4 flex items-center justify-between gap-3 ${i === 0 ? 'border-b border-white/5' : ''} ${winnerIndex === i ? 'bg-white/[0.02]' : 'opacity-60'}`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-[10px] font-black text-slate-500 w-4 tabular-nums">{t.seed}</span>
            <div className="w-6 h-6 shrink-0 rounded bg-black/20 p-0.5 border border-white/5">
              <img
                src={getTeamLogo(t.team, liveTeams) ?? `https://via.placeholder.com/24?text=${t.team.charAt(0)}`}
                alt={t.team}
                className="w-full h-full object-contain"
                onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            </div>
            <span className={`text-xs font-bold truncate ${winnerIndex === i ? 'text-white' : 'text-slate-400'}`}>{t.team}</span>
          </div>
          <span className={`font-mono font-black text-xs tabular-nums ${winnerIndex === i ? 'text-amber-500' : 'text-slate-500'}`}>{t.score}</span>
        </div>
      ))}
    </motion.div>
  );
}

function BracketDisplay({ bracket, liveTeams, onGameClick }: { bracket: BracketTeam[]; liveTeams?: { id: number; name: string; logoURL?: string }[]; onGameClick?: (gameId: number) => void }) {
  if (!bracket || bracket.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
          <LayoutDashboard className="text-slate-700" size={40} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Bracket TBD</h3>
        <p className="text-slate-500 text-sm max-w-xs">The knockout stage starts after the group stage concludes.</p>
      </div>
    );
  }

  const games: Array<[BracketTeam, BracketTeam]> = [];
  for (let i = 0; i < bracket.length; i += 2) {
    if (bracket[i] && bracket[i + 1]) games.push([bracket[i], bracket[i + 1]]);
  }

  const qf = games.slice(0, 4);
  const sf = games.slice(4, 6);
  const final = games.slice(6, 7);

  return (
    <div className="relative overflow-x-auto no-scrollbar pb-10">
      <div className="min-w-[900px] flex justify-between gap-8 pt-12 pb-8 px-4">
        <div className="flex flex-col justify-between gap-8">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] text-center mb-4">Quarterfinals</div>
          {qf.map((game, i) => <MatchCard key={i} teams={game} delay={i * 0.1} liveTeams={liveTeams} onGameClick={game[0].gameId != null ? () => onGameClick?.(game[0].gameId!) : undefined} />)}
        </div>
        <div className="flex flex-col justify-around py-20 w-8">
          {[1, 2].map(i => <div key={i} className="h-32 border-y border-r border-white/10 rounded-r-xl" />)}
        </div>
        <div className="flex flex-col justify-around py-16">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] text-center mb-4">Semifinals</div>
          {sf.map((game, i) => <MatchCard key={i} teams={game} delay={0.4 + i * 0.1} liveTeams={liveTeams} onGameClick={game[0].gameId != null ? () => onGameClick?.(game[0].gameId!) : undefined} />)}
        </div>
        <div className="flex flex-col justify-center py-20 w-8">
          <div className="h-64 border-y border-r border-white/10 rounded-r-xl" />
        </div>
        <div className="flex flex-col justify-center pt-20">
          <div className="text-[10px] font-black text-amber-500/50 uppercase tracking-[0.3em] text-center mb-6">Championship</div>
          <div className="relative">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <Trophy className="text-amber-500 w-16 h-16 drop-shadow-[0_0_40px_rgba(245,158,11,0.6)]" />
              <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full mt-3 backdrop-blur-xl">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] whitespace-nowrap italic">NBA Cup Champion</span>
              </div>
            </div>
            {final.map((game, i) => <MatchCard key={i} teams={game} highlighted size="large" delay={0.7} liveTeams={liveTeams} onGameClick={game[0].gameId != null ? () => onGameClick?.(game[0].gameId!) : undefined} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Historical gist wrapper ──────────────────────────────────────────────────
function HistoricalNBACupData({ viewYear, teams }: { viewYear: number; teams?: { id: number; name: string; logoURL?: string; conference?: string }[] }) {
  const [data, setData] = useState<NBACupYearData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(GIST_URL)
      .then(r => r.json())
      .then(json => {
        if (Array.isArray(json)) setData(transformWikiData(json));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const yearData = data.find(d => d.year === String(viewYear))
    ?? data.find(d => d.year === String(viewYear - 1));
  if (!yearData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Trophy size={48} className="text-slate-700 mb-4" />
        <p className="text-slate-500">No data available for {viewYear - 1}–{String(viewYear).slice(-2)}.</p>
      </div>
    );
  }

  return <CupContent data={yearData} teams={teams} view="groups" />;
}

// ─── Champion Hero (ported from LeagueHistoryDetailView, no record line) ─────
function CupChampionHero({
  data,
  liveCup,
  teams,
  players,
  boxScores,
  schedule,
  onPlayerClick,
}: {
  data: NBACupYearData;
  liveCup?: NBACupState;
  teams?: Array<{ id: number; name: string; logoURL?: string; logoUrl?: string; abbrev?: string }>;
  players?: Array<{ internalId: string; name: string; imgURL?: string; face?: any }>;
  boxScores?: Array<{ gameId: number; homeStats?: any[]; awayStats?: any[] }>;
  schedule?: Array<{ gid: number; isNBACup?: boolean }>;
  onPlayerClick?: (name: string, livePlayer?: any) => void;
}) {
  // Live state preferred; fall back to gist text strings
  const champTeam = liveCup?.championTid != null
    ? teams?.find(t => t.id === liveCup.championTid)
    : (() => {
        const name = data.summary?.champions?.split('(')[0]?.trim();
        return name ? teams?.find(t => t.name === name) : undefined;
      })();
  const runnerUpTeam = liveCup?.runnerUpTid != null
    ? teams?.find(t => t.id === liveCup.runnerUpTid)
    : (() => {
        const name = data.summary?.runner_up?.split('(')[0]?.trim();
        return name ? teams?.find(t => t.name === name) : undefined;
      })();
  const mvpPid = liveCup?.mvpPlayerId;
  const mvpFromLive = mvpPid ? players?.find(p => p.internalId === mvpPid) : undefined;
  const mvpName = mvpFromLive?.name ?? data.summary?.mvp?.split('(')[0]?.trim() ?? '';
  // Gist fallback: match by name against current state.players for BBGM portrait
  const mvpPlayer = mvpFromLive ?? (mvpName ? players?.find(p => p.name === mvpName) : undefined);

  // Full-tournament stat line for MVP — group + KO games (same source PlayerStatsView uses)
  const mvpStatLine = useMemo(() => {
    if (!mvpPid || !boxScores?.length) return undefined;
    const cupGids = new Set<number>();
    for (const g of schedule ?? []) if (g.isNBACup) cupGids.add(g.gid);
    if (cupGids.size === 0 && liveCup) {
      for (const k of liveCup.knockout) if (k.gameId != null) cupGids.add(k.gameId);
    }
    if (cupGids.size === 0) return undefined;
    let gp = 0, pts = 0, reb = 0, ast = 0;
    for (const box of boxScores) {
      if (!cupGids.has(box.gameId)) continue;
      const ln = [...(box.homeStats ?? []), ...(box.awayStats ?? [])].find((l: any) => l?.playerId === mvpPid);
      if (!ln) continue;
      gp++;
      pts += ln.pts ?? 0;
      reb += ln.reb ?? ((ln.orb ?? 0) + (ln.drb ?? 0));
      ast += ln.ast ?? 0;
    }
    if (gp === 0) return undefined;
    return `${(pts / gp).toFixed(1)} PTS · ${(reb / gp).toFixed(1)} REB · ${(ast / gp).toFixed(1)} AST`;
  }, [mvpPid, boxScores, schedule, liveCup]);

  const champLogo  = (champTeam as any)?.logoUrl ?? (champTeam as any)?.logoURL;
  const runnerLogo = (runnerUpTeam as any)?.logoUrl ?? (runnerUpTeam as any)?.logoURL;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 p-5">
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-amber-400/5 blur-3xl pointer-events-none" />
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        {/* Champion */}
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-3">
            <Trophy size={13} className="text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Champion</span>
          </div>
          {champTeam ? (
            <div className="flex items-center gap-4">
              {champLogo && (
                <img src={champLogo} alt={(champTeam as any).abbrev ?? champTeam.name}
                  className="w-20 h-20 object-contain drop-shadow-xl shrink-0"
                  referrerPolicy="no-referrer" />
              )}
              <div>
                <span className="text-2xl font-black text-amber-400">{champTeam.name}</span>
                {/* MVP nested under champion (LeagueHistoryDetailView pattern) */}
                {mvpName && (
                  <div
                    className={`flex items-center gap-2 mt-2 bg-slate-800/60 rounded-lg px-2.5 py-1.5 w-fit ${onPlayerClick ? 'cursor-pointer hover:bg-slate-800 transition-colors' : ''}`}
                    onClick={onPlayerClick ? () => onPlayerClick(mvpName, mvpPlayer) : undefined}
                  >
                    {mvpPlayer?.imgURL && (
                      <img src={mvpPlayer.imgURL} alt={mvpName} className="w-8 h-8 rounded-md object-cover bg-slate-700" referrerPolicy="no-referrer"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div>
                      <div className="text-[9px] text-amber-500 uppercase font-black tracking-wider">Cup MVP</div>
                      <div className="text-sm font-bold text-white">{mvpName}</div>
                      {mvpStatLine && (
                        <div className="text-[10px] font-mono text-slate-300 mt-0.5">{mvpStatLine}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 italic text-sm">Champion TBD</p>
          )}
        </div>

        {/* Runner-Up */}
        {runnerUpTeam && (
          <div className="md:border-l md:border-slate-700/50 md:pl-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Runner-Up</div>
            <div className="flex items-center gap-3">
              {runnerLogo && (
                <img src={runnerLogo} alt={(runnerUpTeam as any).abbrev ?? runnerUpTeam.name}
                  className="w-12 h-12 object-contain opacity-50 shrink-0" referrerPolicy="no-referrer" />
              )}
              <span className="text-base font-bold text-slate-300">{runnerUpTeam.name}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── All-Tournament Team (LeagueHistoryDetailView card + AwardRacesView stats) ─
function CupAllTournamentSection({
  data,
  liveCup,
  teams,
  players,
  boxScores,
  schedule,
  onPlayerClick,
}: {
  data: NBACupYearData;
  liveCup?: NBACupState;
  teams?: Array<{ id: number; name: string; logoURL?: string; logoUrl?: string; abbrev?: string }>;
  players?: Array<{ internalId: string; name: string; imgURL?: string; face?: any }>;
  boxScores?: Array<{ gameId: number; homeTeamId?: number; awayTeamId?: number; homeStats?: any[]; awayStats?: any[] }>;
  schedule?: Array<{ gid: number; isNBACup?: boolean }>;
  onPlayerClick?: (name: string, livePlayer?: any) => void;
}) {
  // Per-player full-tournament totals (group + KO) — gist data has no boxes
  const cupStatsByPid = useMemo(() => {
    const out = new Map<string, { gp: number; pts: number; reb: number; ast: number }>();
    if (!boxScores?.length) return out;
    const cupGids = new Set<number>();
    for (const g of schedule ?? []) if (g.isNBACup) cupGids.add(g.gid);
    if (cupGids.size === 0 && liveCup) {
      for (const k of liveCup.knockout) if (k.gameId != null) cupGids.add(k.gameId);
    }
    if (cupGids.size === 0) return out;
    for (const box of boxScores) {
      if (!cupGids.has(box.gameId)) continue;
      const all = [...(box.homeStats ?? []), ...(box.awayStats ?? [])];
      for (const ln of all) {
        if (!ln?.playerId) continue;
        const prev = out.get(ln.playerId) ?? { gp: 0, pts: 0, reb: 0, ast: 0 };
        out.set(ln.playerId, {
          gp:  prev.gp + 1,
          pts: prev.pts + (ln.pts ?? 0),
          reb: prev.reb + (ln.reb ?? ((ln.orb ?? 0) + (ln.drb ?? 0))),
          ast: prev.ast + (ln.ast ?? 0),
        });
      }
    }
    return out;
  }, [liveCup, boxScores, schedule]);

  // Build entries — prefer live state (has playerId for stats lookup), fallback to gist text rows
  const entries: Array<{ pos: string; playerName: string; teamName: string; teamLogo?: string; imgURL?: string; isMvp: boolean; statLine?: string; livePlayer?: any }> = (() => {
    if (liveCup?.allTournamentTeam?.length) {
      return liveCup.allTournamentTeam.map(e => {
        const player = players?.find(p => p.internalId === e.playerId);
        const team   = teams?.find(t => t.id === e.tid);
        const ko     = cupStatsByPid.get(e.playerId);
        const statLine = ko && ko.gp > 0
          ? `${(ko.pts / ko.gp).toFixed(1)} PTS · ${(ko.reb / ko.gp).toFixed(1)} REB · ${(ko.ast / ko.gp).toFixed(1)} AST`
          : undefined;
        return {
          pos: e.pos,
          playerName: player?.name ?? e.playerId,
          teamName: team?.name ?? '—',
          teamLogo: (team as any)?.logoUrl ?? (team as any)?.logoURL,
          imgURL: player?.imgURL,
          isMvp: e.isMvp,
          statLine,
          livePlayer: player,
        };
      });
    }
    return (data.all_tournament_team ?? []).map(p => {
      const match = players?.find(pl => pl.name === p.player);
      // Use the historical team from the gist row (e.g. "Indiana Pacers" in 2023),
      // not the player's current team. Match against state.teams by name/suffix.
      const histLow = (p.team ?? '').toLowerCase().trim();
      const histTeam = histLow
        ? teams?.find(t => {
            const tn = t.name.toLowerCase();
            return tn === histLow || histLow.includes(tn) || tn.includes(histLow.split(' ').pop() ?? '');
          })
        : undefined;
      return {
        pos: p.pos,
        playerName: p.player,
        teamName: p.team,
        teamLogo: (histTeam as any)?.logoUrl ?? (histTeam as any)?.logoURL,
        imgURL: match?.imgURL,
        isMvp: !!p.is_mvp,
        livePlayer: match,
      };
    });
  })();

  if (entries.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <div className="h-6 w-1 bg-amber-500 rounded-full" />
        <h2 className="text-lg font-black uppercase tracking-tighter text-white italic">All-Tournament Team</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {entries.map((e, idx) => (
          <motion.div
            key={`${e.playerName}-${idx}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={onPlayerClick ? () => onPlayerClick(e.playerName, e.livePlayer) : undefined}
            className={`relative flex flex-col gap-2 p-3 rounded-2xl border transition-colors ${onPlayerClick ? 'cursor-pointer' : ''} ${
              e.isMvp
                ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/40 hover:border-amber-400'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'
            }`}
          >
            {e.isMvp && (
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full">
                <Trophy size={9} className="text-amber-400" />
                <span className="text-[8px] font-black text-amber-300 uppercase tracking-wider">MVP</span>
              </span>
            )}
            <div className="flex items-center gap-2.5">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                {e.imgURL
                  ? <img src={e.imgURL} alt={e.playerName} className="w-full h-full object-cover" referrerPolicy="no-referrer"
                      onError={ev => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  : <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px] font-black">
                      {e.playerName.split(' ').map(s => s[0]).slice(0, 2).join('')}
                    </div>
                }
                {e.teamLogo && (
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-white/90 rounded-tl-md p-0.5">
                    <img src={e.teamLogo} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest">{e.pos}</div>
                <div className="text-xs font-bold text-white truncate leading-tight">{e.playerName}</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold truncate">{e.teamName}</div>
              </div>
            </div>
            {e.statLine && (
              <div className="text-[10px] font-mono text-slate-400 bg-black/20 rounded-md px-2 py-1 border border-white/5">
                {e.statLine}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── Shared content renderer ──────────────────────────────────────────────────
function CupContent({
  data,
  liveCup,
  teams,
  players,
  boxScores,
  schedule,
  view,
  onPlayerClick,
  onGameClick,
}: {
  data: NBACupYearData;
  liveCup?: NBACupState;
  teams?: Array<{ id: number; name: string; logoURL?: string; logoUrl?: string; abbrev?: string }>;
  players?: Array<{ internalId: string; name: string; imgURL?: string; pos?: string; tid?: number; face?: any }>;
  boxScores?: Array<{ gameId: number; homeTeamId?: number; awayTeamId?: number; homeStats?: any[]; awayStats?: any[] }>;
  schedule?: Array<{ gid: number; isNBACup?: boolean }>;
  view: 'groups' | 'bracket';
  onPlayerClick?: (name: string, livePlayer?: any) => void;
  onGameClick?: (gameId: number) => void;
}) {

  const categorizedGroups = useMemo(() => {
    return sortGroupsForDisplay(data.groups ?? {}, teams);
  }, [data.groups, teams]);

  return (
    <>
      <AnimatePresence mode="wait">
        {view === 'groups' ? (
          <motion.div key="groups" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-12">
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-6 w-1 bg-amber-500 rounded-full" />
                <h2 className="text-lg font-black uppercase tracking-tighter text-white italic">Prize Pool <span className="text-slate-500 font-medium normal-case text-xs">(Per Player)</span></h2>
              </div>
              <PrizePool cup={liveCup} />
            </section>

            <CupChampionHero
              data={data}
              liveCup={liveCup}
              teams={teams}
              players={players}
              boxScores={boxScores}
              schedule={schedule}
              onPlayerClick={onPlayerClick}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
              <section className="space-y-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-6 w-1 bg-blue-500 rounded-full" />
                  <h2 className="text-lg font-black uppercase tracking-tighter text-white italic">Eastern Conference</h2>
                </div>
                <div className="flex flex-col gap-8">
                  {categorizedGroups.east.map(({ name, standings }) => <GroupTable key={name} name={name} standings={standings} teams={teams} />)}
                </div>
              </section>
              <section className="space-y-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-6 w-1 bg-red-500 rounded-full" />
                  <h2 className="text-lg font-black uppercase tracking-tighter text-white italic">Western Conference</h2>
                </div>
                <div className="flex flex-col gap-8">
                  {categorizedGroups.west.map(({ name, standings }) => <GroupTable key={name} name={name} standings={standings} teams={teams} />)}
                </div>
              </section>
            </div>

            <CupAllTournamentSection
              data={data}
              liveCup={liveCup}
              teams={teams}
              players={players}
              boxScores={boxScores}
              schedule={schedule}
              onPlayerClick={onPlayerClick}
            />
          </motion.div>
        ) : (
          <motion.div key="bracket" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.3 }}>
            <BracketDisplay bracket={data.bracket} liveTeams={teams} onGameClick={onGameClick} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function NBACupView() {
  const { state } = useGame();
  const year = state.leagueStats.year;
  const [gistData, setGistData] = useState<NBACupYearData[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(String(year));
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'groups' | 'bracket'>('groups');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [cupBoxScore, setCupBoxScore] = useState<{ game: any; result: any; homeTeam: any; awayTeam: any } | null>(null);

  const handlePlayerClick = (name: string, livePlayer?: any) => {
    if (livePlayer?.internalId) {
      setViewingPlayer(livePlayer as NBAPlayer);
      return;
    }
    const match = state.players.find(p => p.name === name);
    if (match) {
      setViewingPlayer(match as NBAPlayer);
      return;
    }
    // Historical legend not in state.players — stub so PlayerBioView fetches via NAME_TO_ID.
    // Pre-fill imgURL from NBA CDN since PlayerBioHero only renders portraitSrc, which
    // PlayerBioView seeds from player.imgURL (it never writes back from the bio fetch).
    const nbaId = extractNbaId('', name);
    const stub: NBAPlayer = {
      internalId: `hist-${name.replace(/\s+/g, '-')}`,
      name,
      tid: -1,
      overallRating: 0,
      ratings: [],
      stats: [],
      imgURL: nbaId ? hdPortrait(nbaId) : undefined,
      pos: 'G',
      status: undefined,
      hof: false,
      injury: { type: 'Healthy', gamesRemaining: 0 },
    } as NBAPlayer;
    setViewingPlayer(stub);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(GIST_URL);
        const json = await response.json();
        console.log('NBA Cup raw gist:', json);
        if (Array.isArray(json)) {
          const transformed = transformWikiData(json);
          console.log('NBA Cup transformed:', transformed.length, 'items');
          setGistData(transformed);
        }
      } catch (error) {
        console.error('Error fetching NBA Cup gist:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const inSeasonTournamentEnabled = isNbaCupEnabled(state.leagueStats);
  const viewYear = Number(selectedYear);
  const isHistorical = viewYear !== year;

  const currentCup = state.nbaCup ?? null;
  const pastSimCup = (state.nbaCupHistory ?? {})[viewYear] ?? null;

  const handleGameClick = (gameId: number) => {
    const result = (state.boxScores as any[])?.find((b: any) => b.gameId === gameId);
    if (!result) return;
    const schedGame = (state.schedule as any[])?.find((g: any) => g.gid === gameId);
    const game = schedGame ?? {
      gid: gameId,
      homeTid: result.homeTeamId,
      awayTid: result.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      played: true,
      date: result.date ?? '',
      isNBACup: true,
    };
    const homeTeam = (state.teams as any[]).find((t: any) => t.id === (game.homeTid ?? result.homeTeamId));
    const awayTeam = (state.teams as any[]).find((t: any) => t.id === (game.awayTid ?? result.awayTeamId));
    if (!homeTeam || !awayTeam) return;
    setCupBoxScore({ game, result, homeTeam, awayTeam });
  };

  const liveData = useMemo(
    () => currentCup && !isHistorical ? cupStateToViewData(currentCup, state.teams, state.players, state.schedule as any, state.boxScores as any) : null,
    [currentCup, isHistorical, state.teams, state.schedule, state.boxScores],
  );

  const pastData = useMemo(
    () => pastSimCup ? cupStateToViewData(pastSimCup, state.teams, state.players, state.schedule as any, state.boxScores as any) : null,
    [pastSimCup, state.teams, state.schedule, state.boxScores],
  );

  const gistYearData = useMemo(
    () => {
      const found = gistData.find(d => d.year === String(viewYear));
      console.log('Gist lookup:', { viewYear, gistDataYears: gistData.map(d => d.year), found: !!found });
      return found;
    },
    [gistData, viewYear],
  );

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer as any} onBack={() => setViewingPlayer(null)} />;
  }

  if (!inSeasonTournamentEnabled) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-center p-8">
        <div>
          <Trophy size={48} className="text-slate-700 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white uppercase italic mb-2">In-Season Tournament Disabled</h2>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">Enable the In-Season Tournament in League Settings → Format to activate the NBA Cup.</p>
        </div>
      </div>
    );
  }

  const statusLabel = currentCup?.status === 'complete' ? 'Complete'
    : currentCup?.status === 'knockout' ? 'Knockout Stage'
    : currentCup?.status === 'group' ? 'Group Stage'
    : 'Not Started';

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans selection:bg-amber-500/30">
      {/* Fixed background accents */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-amber-500/5 blur-[120px] -z-10 rounded-full pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 blur-[120px] -z-10 rounded-full pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-md border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <Trophy className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white uppercase italic">NBA Cup</h1>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.2em]">
                {`${viewYear - 1}–${String(viewYear).slice(-2)}`}
                {!isHistorical && currentCup && (
                  <span className="ml-2 text-amber-400/80">{statusLabel}</span>
                )}
                {!isHistorical && currentCup?.status !== 'complete' && (
                  <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-amber-400 text-[8px] font-black uppercase tracking-widest">LIVE</span>
                )}
              </p>
            </div>
            {/* Groups / Bracket toggle, sitting next to the logo */}
            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 ml-2">
              <button
                onClick={() => setView('groups')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'groups' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <Users size={11} /> Groups
              </button>
              <button
                onClick={() => setView('bracket')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'bracket' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <LayoutDashboard size={11} /> Bracket
              </button>
            </div>
          </div>

          {/* Year navigator */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newYear = String(Math.max(2024, Number(selectedYear) - 1));
                console.log('Year nav:', selectedYear, '→', newYear);
                setSelectedYear(newYear);
              }}
              className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={16} className="text-slate-400" />
            </button>
            <span className="text-sm font-bold text-white px-3">{viewYear - 1}–{String(viewYear).slice(-2)}</span>
            <button
              onClick={() => setSelectedYear(y => String(Math.min(year, Number(y) + 1)))}
              className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30"
              disabled={viewYear >= year}
            >
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Mode A: current live sim */}
        {!isHistorical && liveData && (
          <CupContent data={liveData} liveCup={currentCup ?? undefined} teams={state.teams} players={state.players} boxScores={state.boxScores as any} schedule={state.schedule as any} view={view} onPlayerClick={handlePlayerClick} onGameClick={handleGameClick} />
        )}

        {/* No cup yet this season */}
        {!isHistorical && !currentCup && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Calendar size={48} className="text-slate-700 mb-4" />
            <h2 className="text-xl font-black text-white uppercase italic mb-2">Cup Not Started</h2>
            <p className="text-slate-500 text-sm max-w-xs">The {year - 1}–{String(year).slice(-2)} NBA Cup begins in November. Simulate through opening night to see the groups.</p>
          </div>
        )}

        {/* Mode B: past sim year */}
        {isHistorical && pastData && (
          <CupContent data={pastData} liveCup={pastSimCup ?? undefined} teams={state.teams} players={state.players} boxScores={state.boxScores as any} schedule={state.schedule as any} view={view} onPlayerClick={handlePlayerClick} onGameClick={handleGameClick} />
        )}

        {/* Mode C: pre-sim historical (gist) */}
        {isHistorical && !pastSimCup && (
          <>
            {loading && (
              <div className="flex items-center justify-center py-20">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full"
                />
              </div>
            )}
            {!loading && gistYearData && (
              <CupContent data={gistYearData} teams={state.teams} players={state.players} view={view} onPlayerClick={handlePlayerClick} />
            )}
            {!loading && !gistYearData && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Trophy size={48} className="text-slate-700 mb-4" />
                <p className="text-slate-500">No data available for {viewYear - 1}–{String(viewYear).slice(-2)}.</p>
              </div>
            )}
          </>
        )}
      </main>

      {cupBoxScore && (
        <BoxScoreModal
          game={cupBoxScore.game}
          result={cupBoxScore.result}
          homeTeam={cupBoxScore.homeTeam}
          awayTeam={cupBoxScore.awayTeam}
          players={state.players as NBAPlayer[]}
          onClose={() => setCupBoxScore(null)}
        />
      )}
    </div>
  );
}
