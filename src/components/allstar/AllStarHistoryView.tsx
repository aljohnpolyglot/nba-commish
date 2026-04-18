import React, { useMemo, useEffect, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { Trophy, MapPin } from 'lucide-react';
import { fetchAllStarHistory, AllStarHistoryEntry } from '../../data/allStarHistoryFetcher';
import { matchTeamByWikiName, generateAbbrev } from '../../data/brefFetcher';
import { getAllStarSunday } from '../../services/allStar/AllStarWeekendOrchestrator';

/**
 * All-Star history table — mirrors LeagueHistoryView layout.
 * Merges:
 *   - Sim results from state.boxScores / state.schedule / state.allStar for current & past sim seasons
 *   - JSON gist (nbaallstarhistory) for real-world 1951→present
 *   - leagueStats.allStarHosts for future-assigned hosts
 */

const MvpCell = ({ mvp, teams, players }: { mvp: any; teams: any[]; players: any[] }) => {
  if (!mvp) {
    return <span className="italic text-xs text-slate-700">—</span>;
  }
  const matchedTeam = matchTeamByWikiName(mvp.team, teams as any[]) as any;
  const player = players.find(p => p.name?.toLowerCase() === (mvp.name ?? '').toLowerCase());
  const imgURL = player?.imgURL ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(mvp.name)}&background=1e293b&color=94a3b8`;
  const teamLogoUrl = matchedTeam?.logoUrl;
  const teamAbbrev = matchedTeam?.abbrev ?? (mvp.team ? generateAbbrev(mvp.team) : '');

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-7 h-7 rounded-full bg-slate-800 overflow-hidden border border-slate-700 shrink-0">
        <img
          src={imgURL}
          alt={mvp.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (teamLogoUrl && img.src !== teamLogoUrl) { img.src = teamLogoUrl; img.className = 'w-full h-full object-contain p-1'; }
            else img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvp.name)}&background=1e293b&color=e2e8f0&size=64&bold=true`;
          }}
        />
        {teamLogoUrl && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700">
            <img src={teamLogoUrl} alt={teamAbbrev} className="w-2.5 h-2.5 object-contain" referrerPolicy="no-referrer" />
          </div>
        )}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-semibold text-white text-xs">{mvp.name}</span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{teamAbbrev}</span>
      </div>
    </div>
  );
};

const HostCell = ({ host, teams }: { host: { city: string; arena?: string; teamIds?: number[]; teamNames?: string[] } | null; teams: any[] }) => {
  if (!host) {
    return <span className="italic text-xs text-slate-700">—</span>;
  }
  const hostTeams = host.teamIds
    ? host.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean)
    : (host.teamNames ?? [])
        .map(name => matchTeamByWikiName(name, teams as any[]))
        .filter(Boolean) as any[];

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1">
        {hostTeams.slice(0, 2).map((t: any, i) => (
          t?.logoUrl
            ? <img key={i} src={t.logoUrl} className="w-5 h-5 object-contain rounded-full bg-slate-900 border border-slate-800" referrerPolicy="no-referrer" alt={t.abbrev} />
            : <div key={i} className="w-5 h-5 bg-slate-800 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-bold text-white">{host.city}</span>
        {host.arena && <span className="text-[10px] text-slate-500">{host.arena}</span>}
      </div>
    </div>
  );
};

interface AllStarHistoryViewProps {
  onClose: () => void;
}

export const AllStarHistoryView: React.FC<AllStarHistoryViewProps> = ({ onClose }) => {
  const { state } = useGame();
  const [history, setHistory] = useState<AllStarHistoryEntry[] | null>(null);

  useEffect(() => {
    fetchAllStarHistory().then(setHistory);
  }, []);

  const rows = useMemo(() => {
    const currentYear = state.leagueStats?.year ?? 2026;
    const currentDate = state.date ? new Date(state.date) : new Date();

    // Sim ASG result (only exists after the in-game All-Star game has been simulated)
    const asGameId = state.allStar?.allStarGameId;
    const asBox = asGameId ? state.boxScores?.find((b: any) => b.gameId === asGameId) : null;

    // A year is "played in-sim" if:
    //   - year < currentYear (any prior season is by definition simulated past), OR
    //   - year === currentYear AND we have the ASG box score, OR
    //   - year === currentYear AND current date is past All-Star Sunday (edge case,
    //     e.g. sim ran but box score cleanup happened) — treat as played.
    const hasPlayed = (year: number): boolean => {
      if (year < currentYear) return true;
      if (year === currentYear) {
        if (asBox) return true;
        if (currentDate > getAllStarSunday(year)) return true;
      }
      return false;
    };

    type Row = {
      year: number;
      isCurrent: boolean;
      isFuture: boolean;
      isSim: boolean;
      teams: string[];
      winner: string | null;
      finalScore: Record<string, number> | null;
      host: { city: string; arena?: string; teamIds?: number[]; teamNames?: string[] } | null;
      mvps: Array<{ name: string; team: string }>;
    };

    const rowMap = new Map<number, Row>();

    // Source 1: gist — for played years ONLY (keeps real winners/MVPs/scores).
    // For unplayed years, we still use the gist's host info but suppress results.
    (history ?? []).forEach(h => {
      const played = hasPlayed(h.year);
      rowMap.set(h.year, {
        year: h.year,
        isCurrent: h.year === currentYear,
        isFuture: h.year > currentYear || !played,
        isSim: false,
        teams: played ? h.teams : [],
        winner: played ? h.winner : null,
        finalScore: played ? h.final_score : null,
        host: { city: h.host_city, arena: h.host_arena, teamNames: h.host_teams },
        mvps: played ? (h.mvps ?? []) : [],
      });
    });

    // Source 2: sim results override for the current season's ASG
    if (asBox && asGameId) {
      const homeTeam = asBox.homeTeamName ?? 'East';
      const awayTeam = asBox.awayTeamName ?? 'West';
      const winner = asBox.homeScore > asBox.awayScore ? homeTeam : awayTeam;
      const mvp = (state.allStar as any)?.gameMvp ?? (state.allStar as any)?.allStarGameResult?.mvp;
      const existing = rowMap.get(currentYear);
      rowMap.set(currentYear, {
        year: currentYear,
        isCurrent: true,
        isFuture: false,
        isSim: true,
        teams: [homeTeam, awayTeam],
        winner,
        finalScore: { [homeTeam]: asBox.homeScore, [awayTeam]: asBox.awayScore },
        host: existing?.host ?? hostFromLeagueStats(currentYear, state.leagueStats),
        mvps: mvp ? [{ name: mvp.name ?? mvp, team: mvp.teamAbbrev ?? mvp.team ?? '' }] : [],
      });
    }

    // Source 3: leagueStats.allStarHosts — fills in host city/arena for any year
    // that's not in the gist, or overrides if commissioner assigned their own host.
    const hosts = state.leagueStats?.allStarHosts ?? [];
    hosts.forEach((h: any) => {
      const existing = rowMap.get(h.year);
      const played = hasPlayed(h.year);
      if (existing) {
        // Commissioner host overrides gist host (in case of rename/move).
        existing.host = { city: h.city, arena: h.arena, teamIds: h.teamIds };
        return;
      }
      rowMap.set(h.year, {
        year: h.year,
        isCurrent: h.year === currentYear,
        isFuture: !played,
        isSim: false,
        teams: [],
        winner: null,
        finalScore: null,
        host: { city: h.city, arena: h.arena, teamIds: h.teamIds },
        mvps: [],
      });
    });

    return Array.from(rowMap.values()).sort((a, b) => b.year - a.year);
  }, [history, state.teams, state.players, state.boxScores, state.allStar, state.leagueStats, state.date]);

  return (
    <div className="h-full overflow-hidden p-4 md:p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
        <div className="mb-6 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <Trophy className="text-amber-400" size={32} />
              All-Star History
            </h2>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            ← Back to Weekend
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                <tr>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Year</th>
                  <th className="p-3 font-bold text-amber-400 border-b border-slate-800 whitespace-nowrap">Winner</th>
                  <th className="p-3 font-bold text-slate-400 border-b border-slate-800 whitespace-nowrap">Score</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">MVP</th>
                  <th className="p-3 font-bold text-sky-400 border-b border-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-1"><MapPin size={12} /> Host</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-500 italic">Loading All-Star history…</td></tr>
                )}
                {rows.map(row => (
                  <tr
                    key={row.year}
                    className={`group transition-colors ${
                      row.isCurrent ? 'bg-blue-950/20' :
                      row.isFuture ? 'bg-amber-950/10' :
                      'hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">{row.year}</span>
                        {row.isCurrent && (
                          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">NOW</span>
                        )}
                        {row.isFuture && (
                          <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">UPCOMING</span>
                        )}
                        {row.isSim && (
                          <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">SIM</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {row.winner ? (
                        <span className="font-bold text-amber-400 text-sm">{row.winner}</span>
                      ) : (
                        <span className="italic text-xs text-slate-700">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {row.finalScore ? (
                        <span className="text-xs text-slate-300">
                          {row.teams.map(t => `${t} ${row.finalScore![t] ?? '?'}`).join(' – ')}
                        </span>
                      ) : (
                        <span className="italic text-xs text-slate-700">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <MvpCell mvp={row.mvps[0]} teams={state.teams} players={state.players} />
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <HostCell host={row.host} teams={state.teams} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

function hostFromLeagueStats(year: number, leagueStats: any): { city: string; arena?: string; teamIds?: number[] } | null {
  const h = (leagueStats?.allStarHosts ?? []).find((x: any) => x.year === year);
  return h ? { city: h.city, arena: h.arena, teamIds: h.teamIds } : null;
}

export default AllStarHistoryView;
