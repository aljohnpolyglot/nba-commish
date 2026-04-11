import React, { useMemo, useState, useEffect } from 'react';
import { useGame } from '../../../store/GameContext';
import { Trophy, ChevronRight } from 'lucide-react';
import { LeagueHistoryDetailView } from './LeagueHistoryDetailView';
import { useBRefSeasonsBatch, getAllCachedSeasons, matchTeamByWikiName, generateAbbrev } from '../../../data/brefFetcher';
import type { BRefSeasonData } from '../../../data/brefFetcher';
import { fetchCoachData, getCoachPhoto } from '../../../data/photos/coaches';

// ─────────────────────────────────────────────────────────────────────────────
// Mini award cell for table rows
// ─────────────────────────────────────────────────────────────────────────────

const AwardCell = ({ award, isCurrent }: { award: any; isCurrent?: boolean }) => {
  if (!award) {
    return (
      <span className={`italic text-xs ${isCurrent ? 'text-slate-500' : 'text-slate-700'}`}>
        {isCurrent ? 'TBA' : '—'}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-7 h-7 rounded-full bg-slate-800 overflow-hidden border border-slate-700 shrink-0">
        <img
          src={award.imgURL}
          alt={award.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        {award.teamLogoUrl && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700">
            <img
              src={award.teamLogoUrl}
              alt={award.team}
              className="w-2.5 h-2.5 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-white text-xs">{award.name}</span>
          {(award.count ?? 0) > 0 && (
            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1 py-px rounded-full leading-none">
              {award.count}×
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{award.team}</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────────────────────

export const LeagueHistoryView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [coachPhotosReady, setCoachPhotosReady] = useState(false);
  useEffect(() => { fetchCoachData().then(() => setCoachPhotosReady(true)); }, []);

  // ── Safety Net: Inject historical awards for saved games ──────────────────
  useEffect(() => {
    if (!state.historicalAwards || state.historicalAwards.length === 0) {
      import('../../../services/rosterService').then(service => {
        service.getHistoricalAwards().then(data => {
          if (data && data.length > 0) {
            dispatchAction({ type: 'UPDATE_STATE' as any, payload: { historicalAwards: data } });
          }
        });
      });
    }
  }, [state.historicalAwards]);

  const currentSeason = state.leagueStats.year;

  // ── Collect all historical season years (for bref batch hook) ────────────
  const historicalYears = useMemo(() => {
    const awardsToUse = state.historicalAwards || [];
    const seasonsSet = new Set<number>();
    state.teams.forEach(t => t.seasons?.forEach((s: any) => { if (s.season < currentSeason) seasonsSet.add(s.season); }));
    state.players.forEach(p => p.awards?.forEach((a: any) => { if (a.season < currentSeason) seasonsSet.add(a.season); }));
    awardsToUse.forEach((a: any) => { if (a.season < currentSeason) seasonsSet.add(a.season); });
    return Array.from(seasonsSet).sort((a, b) => b - a).slice(0, 12);
  }, [state.teams, state.players, state.historicalAwards, currentSeason]);

  // ── Progressively fetch B-Ref summaries via the batch hook ───────────────
  const brefMap = useBRefSeasonsBatch(historicalYears);

  const historyData = useMemo(() => {
    const awardsToUse = state.historicalAwards || [];

    // Collect all known seasons
    const seasonsSet = new Set<number>([currentSeason]);
    state.teams.forEach(t => t.seasons?.forEach((s: any) => seasonsSet.add(s.season)));
    state.players.forEach(p => p.awards?.forEach((a: any) => seasonsSet.add(a.season)));
    awardsToUse.forEach((a: any) => seasonsSet.add(a.season));
    const seasons = Array.from(seasonsSet).sort((a, b) => b - a);

    // ── Player lookup — handles BOTH pid formats ──────────────────────────────
    // AutoResolver pid = internalId (string "nba-Name-tid")
    // BBGM pid = integer player ID (no relation to internalId)
    const findPlayer = (a: any) => {
      if (!a) return undefined;
      if (a.pid && typeof a.pid === 'string') {
        const byId = state.players.find(p => p.internalId === a.pid);
        if (byId) return byId;
      }
      return state.players.find(p => p.name === a.name)
        ?? state.players.find(p => p.name?.toLowerCase() === a.name?.toLowerCase?.());
    };

    const makeAwardObj = (a: any) => {
      if (!a) return null;
      const team = state.teams.find(t => t.id === a.tid);
      const player = findPlayer(a);
      return {
        name: a.name,
        team: team?.abbrev ?? 'FA',
        id: player?.internalId ?? a.name,
        imgURL: player?.imgURL ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=1e293b&color=94a3b8`,
        teamLogoUrl: team?.logoUrl,
      };
    };

    // ── Wikipedia award fallback helper ──────────────────────────────────────
    const makeBrefAwardObj = (a: { name: string; team: string } | undefined) => {
      if (!a?.name) return null;
      const nl = a.name.toLowerCase();
      const player = state.players.find(p => p.name?.toLowerCase() === nl);
      const team = matchTeamByWikiName(a.team, state.teams as any[]) as any;
      return {
        name: a.name,
        team: team?.abbrev ?? (a.team ? generateAbbrev(a.team) : ''),
        id: player?.internalId ?? a.name,
        imgURL: player?.imgURL ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=1e293b&color=94a3b8`,
        teamLogoUrl: team?.logoUrl,
      };
    };

    // ── Championship year map: teamId → Set<year> ────────────────────────────
    // Built from flat autoResolver awards + Wikipedia brefMap (deduped by year).
    // state.teams has NO seasons array (stripped at import), so brefMap is the
    // authoritative source for historical BBGM seasons.
    const champYearsByTeamId = new Map<number, Set<number>>();
    // Source 1: flat 'Champion' awards (current sim seasons)
    for (const a of awardsToUse) {
      if (a.type !== 'Champion' || a.tid == null) continue;
      const tid = Number(a.tid);
      if (!champYearsByTeamId.has(tid)) champYearsByTeamId.set(tid, new Set());
      champYearsByTeamId.get(tid)!.add(Number(a.season));
    }
    // Source 2: Wikipedia full cache (all 79 seasons — populated after first fetch)
    // We use getAllCachedSeasons() instead of brefMap because brefMap only holds
    // the batch window (12 years). The full cache is available after any season loads.
    for (const [yr, brefData] of getAllCachedSeasons().entries()) {
      if (!brefData.champion?.name) continue;
      const matched = matchTeamByWikiName(brefData.champion.name, state.teams as any[]) as any;
      if (!matched) continue;
      if (!champYearsByTeamId.has(matched.id)) champYearsByTeamId.set(matched.id, new Set());
      champYearsByTeamId.get(matched.id)!.add(yr);
    }

    // ── Runner-up appearances map: teamId → Set<year> ────────────────────────
    const ruYearsByTeamId = new Map<number, Set<number>>();
    for (const a of awardsToUse) {
      if (a.type !== 'Runner Up' || a.tid == null) continue;
      const tid = Number(a.tid);
      if (!ruYearsByTeamId.has(tid)) ruYearsByTeamId.set(tid, new Set());
      ruYearsByTeamId.get(tid)!.add(Number(a.season));
    }
    for (const [yr, brefData] of getAllCachedSeasons().entries()) {
      if (!brefData.runnerUp?.name) continue;
      const matched = matchTeamByWikiName(brefData.runnerUp.name, state.teams as any[]) as any;
      if (!matched) continue;
      if (!ruYearsByTeamId.has(matched.id)) ruYearsByTeamId.set(matched.id, new Set());
      ruYearsByTeamId.get(matched.id)!.add(yr);
    }

    // ── Cumulative win count helpers ──────────────────────────────────────────
    const countForPlayer = (name: string | undefined, flatType: string, bbgmKey: string, upTo: number): number => {
      if (!name) return 1;
      return Math.max(1, awardsToUse.reduce((cnt: number, a: any) => {
        if (Number(a.season) > upTo) return cnt;
        if (a.type) return cnt + (a.type === flatType && a.name === name ? 1 : 0);
        return cnt + (a[bbgmKey]?.name === name ? 1 : 0);
      }, 0));
    };

    const countChamp = (teamId: number | undefined, upTo: number): number => {
      if (teamId == null) return 1;
      const years = champYearsByTeamId.get(teamId);
      if (!years) return 1;
      const cnt = [...years].filter(y => y <= upTo).length;
      return Math.max(cnt, 1);
    };

    const countRunnerUp = (teamId: number | undefined, upTo: number): number => {
      if (teamId == null) return 1;
      const years = ruYearsByTeamId.get(teamId);
      if (!years) return 1;
      const cnt = [...years].filter(y => y <= upTo).length;
      return Math.max(cnt, 1);
    };

    return seasons.map(season => {
      const isCurrent = season === currentSeason;
      const bref = brefMap.get(season);

      // ── Split historicalAwards by schema ──────────────────────────────────
      // BBGM format: { season, mvp: {…}, dpoy: {…}, … } — no 'type' field
      // AutoResolver format: { season, type: 'MVP', name, pid, tid } — flat
      const bbgmRecord = awardsToUse.find(
        (a: any) => Number(a.season) === Number(season) && !a.type
      );
      const flatAwards = awardsToUse.filter(
        (a: any) => Number(a.season) === Number(season) && !!a.type
      );
      const flat = (type: string) => flatAwards.find((a: any) => a.type === type);

      // Resolve an award entry preferring autoResolver (richer pid), falling back to BBGM
      const getAwardEntry = (bbgmKey: string, flatType: string) =>
        flat(flatType) ?? bbgmRecord?.[bbgmKey] ?? null;

      // ── Champion & Runner Up: autoResolver first, then playoffRoundsWon ──
      let champ: any = null;
      let runnerUp: any = null;

      const champEntry  = flat('Champion');
      const runnerEntry = flat('Runner Up');
      if (champEntry) {
        const team = state.teams.find(t => t.id === champEntry.tid);
        if (team) champ = { ...team, record: '' };
      }
      if (runnerEntry) {
        const team = state.teams.find(t => t.id === runnerEntry.tid);
        if (team) runnerUp = { ...team, record: '' };
      }

      // Fallback: playoffRoundsWon (works once rosterService populates seasons)
      if (!champ || !runnerUp) {
        let maxRounds = -1;
        state.teams.forEach(t => {
          const ts = t.seasons?.find((s: any) => Number(s.season) === Number(season));
          if (ts?.playoffRoundsWon !== undefined && ts.playoffRoundsWon > maxRounds)
            maxRounds = ts.playoffRoundsWon;
        });
        if (maxRounds > 0) {
          state.teams.forEach(t => {
            const ts = t.seasons?.find((s: any) => Number(s.season) === Number(season));
            if (!ts) return;
            if (!champ && ts.playoffRoundsWon === maxRounds)
              champ = { ...t, record: `${ts.won}-${ts.lost}` };
            else if (!runnerUp && ts.playoffRoundsWon === maxRounds - 1)
              runnerUp = { ...t, record: `${ts.won}-${ts.lost}` };
          });
        }
      }

      // Fallback: champion from Finals MVP tid
      if (!champ) {
        const fmvpEntry = flat('Finals MVP') ?? bbgmRecord?.finalsMvp;
        if (fmvpEntry) {
          const team = state.teams.find(t => t.id === fmvpEntry.tid);
          if (team) champ = { ...team, record: '' };
        }
      }

      // Wikipedia fallback — use full cache for all 79 seasons, not just 12-year brefMap
      const wikiSeason = getAllCachedSeasons().get(season) ?? bref;
      if (!champ && wikiSeason?.champion) {
        const matched = matchTeamByWikiName(wikiSeason.champion.name, state.teams as any[]) as any;
        if (matched) champ = { ...matched, record: '' };
      }
      if (!runnerUp && wikiSeason?.runnerUp) {
        const matched = matchTeamByWikiName(wikiSeason.runnerUp.name, state.teams as any[]) as any;
        if (matched) runnerUp = { ...matched, record: '' };
      }

      // ── Awards (unified from both schemas) ────────────────────────────────
      const awards: Record<string, any> = {
        finalsMvp: makeAwardObj(getAwardEntry('finalsMvp', 'Finals MVP')),
        mvp:       makeAwardObj(getAwardEntry('mvp',       'MVP')),
        dpoy:      makeAwardObj(getAwardEntry('dpoy',      'DPOY')),
        smoy:      makeAwardObj(getAwardEntry('smoy',      'SMOY')),
        mip:       makeAwardObj(getAwardEntry('mip',       'MIP')),
        roy:       makeAwardObj(getAwardEntry('roy',       'ROY')),
        coy:       makeAwardObj(getAwardEntry('coy',       'COY')),
      };

      // Wikipedia fallback — use full cache so all 79 seasons are covered
      const wiki = wikiSeason;
      if (wiki) {
        if (!awards.mvp)       awards.mvp       = makeBrefAwardObj(wiki.mvp);
        if (!awards.dpoy)      awards.dpoy      = makeBrefAwardObj(wiki.dpoy);
        if (!awards.smoy)      awards.smoy      = makeBrefAwardObj(wiki.smoy);
        if (!awards.mip)       awards.mip       = makeBrefAwardObj(wiki.mip);
        if (!awards.roy)       awards.roy       = makeBrefAwardObj(wiki.roy);
        if (!awards.coy)       awards.coy       = makeBrefAwardObj(wiki.coy);
        if (!awards.finalsMvp) awards.finalsMvp = makeBrefAwardObj(wiki.finalsMvp);
      }

      // Coach photo override for COY
      if (awards.coy) {
        const photo = getCoachPhoto(awards.coy.name);
        if (photo) awards.coy.imgURL = photo;
      }

      // Stamp cumulative win counts onto each award object
      if (awards.mvp)       awards.mvp.count       = countForPlayer(awards.mvp.name,       'MVP',       'mvp',       season);
      if (awards.dpoy)      awards.dpoy.count      = countForPlayer(awards.dpoy.name,      'DPOY',      'dpoy',      season);
      if (awards.smoy)      awards.smoy.count      = countForPlayer(awards.smoy.name,      'SMOY',      'smoy',      season);
      if (awards.mip)       awards.mip.count       = countForPlayer(awards.mip.name,       'MIP',       'mip',       season);
      if (awards.roy)       awards.roy.count       = countForPlayer(awards.roy.name,       'ROY',       'roy',       season);
      if (awards.coy)       awards.coy.count       = countForPlayer(awards.coy.name,       'COY',       'coy',       season);
      if (awards.finalsMvp) awards.finalsMvp.count = countForPlayer(awards.finalsMvp.name, 'Finals MVP','finalsMvp', season);
      if (champ)    champ    = { ...champ,    champCount: countChamp(champ.id, season) };
      if (runnerUp) runnerUp = { ...runnerUp, ruCount:    countRunnerUp(runnerUp.id, season) };

      return { season, isCurrent, champ, runnerUp, awards };
    });
  }, [state.teams, state.players, state.historicalAwards, currentSeason, brefMap, coachPhotosReady]);

  if (selectedSeason !== null) {
    return <LeagueHistoryDetailView season={selectedSeason} onBack={() => setSelectedSeason(null)} />;
  }

  return (
    <div className="h-full overflow-hidden p-4 md:p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col">

        <div className="mb-6 shrink-0">
          <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <Trophy className="text-amber-400" size={32} />
            League History
          </h2>
          <p className="text-slate-400 font-medium mt-1">
            Click any season to see the full recap.
          </p>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                <tr>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Season</th>
                  <th className="p-3 font-bold text-amber-400 border-b border-slate-800 whitespace-nowrap">Champion</th>
                  <th className="p-3 font-bold text-slate-400 border-b border-slate-800 whitespace-nowrap">Runner Up</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Finals MVP">Finals MVP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Most Valuable Player">MVP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Defensive Player of the Year">DPOY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Coach of the Year">COY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Sixth Man of the Year">SMOY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Most Improved Player">MIP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Rookie of the Year">ROY</th>
                  <th className="p-3 border-b border-slate-800 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {historyData.map(row => (
                  <tr
                    key={row.season}
                    onClick={() => setSelectedSeason(row.season)}
                    className={`cursor-pointer transition-colors group ${
                      row.isCurrent
                        ? 'bg-blue-950/20 hover:bg-blue-900/20'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Season year */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">
                          {row.season - 1}–{String(row.season).slice(-2)}
                        </span>
                        {row.isCurrent && (
                          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                            NOW
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Champion */}
                    <td className="p-3 whitespace-nowrap">
                      {row.champ ? (
                        <div className="flex items-center gap-2">
                          {row.champ.logoUrl && (
                            <img src={row.champ.logoUrl} alt={row.champ.abbrev} className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                          )}
                          <span className="font-bold text-amber-400 text-sm">{row.champ.name}</span>
                          {(row.champ.champCount ?? 0) > 0 && (
                            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-px rounded-full">
                              {row.champ.champCount}×
                            </span>
                          )}
                          {row.champ.record && <span className="text-xs text-slate-500">({row.champ.record})</span>}
                        </div>
                      ) : (
                        <span className={`italic text-xs ${row.isCurrent ? 'text-slate-500' : 'text-slate-700'}`}>
                          {row.isCurrent ? 'TBA' : '—'}
                        </span>
                      )}
                    </td>

                    {/* Runner Up */}
                    <td className="p-3 whitespace-nowrap">
                      {row.runnerUp ? (
                        <div className="flex items-center gap-2">
                          {row.runnerUp.logoUrl && (
                            <img src={row.runnerUp.logoUrl} alt={row.runnerUp.abbrev} className="w-4 h-4 object-contain opacity-70" referrerPolicy="no-referrer" />
                          )}
                          <span className="font-medium text-slate-300 text-xs">{row.runnerUp.name}</span>
                          {(row.runnerUp.ruCount ?? 0) > 0 && (
                            <span className="text-[9px] font-black text-slate-400 bg-slate-700/50 px-1 py-px rounded-full">
                              {row.runnerUp.ruCount}×
                            </span>
                          )}
                          {row.runnerUp.record && <span className="text-xs text-slate-600">({row.runnerUp.record})</span>}
                        </div>
                      ) : (
                        <span className={`italic text-xs ${row.isCurrent ? 'text-slate-500' : 'text-slate-700'}`}>
                          {row.isCurrent ? 'TBA' : '—'}
                        </span>
                      )}
                    </td>

                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.finalsMvp} isCurrent={row.isCurrent} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.mvp}       isCurrent={row.isCurrent} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.dpoy}      isCurrent={row.isCurrent} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.coy}       isCurrent={row.isCurrent} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.smoy}      isCurrent={row.isCurrent} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.mip}       isCurrent={row.isCurrent} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.roy}       isCurrent={row.isCurrent} /></td>
                    <td className="p-3">
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
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
