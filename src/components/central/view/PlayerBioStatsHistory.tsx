import React, { useEffect, useMemo, useState } from 'react';
import type { NBAPlayer, NBAGMStat } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { ADV_COLS, GH_COLS, PG_COLS, Phase, PhaseTabs, SeasonRow, SL_COLS, SL_GROUPS, StatsTable } from './PlayerBioStatsHistoryShared';
import { buildSeasonRows, useBoxData } from './playerBioStatsHistoryData';
import { loadPbaStatsForPlayers } from '../../../services/pba/statsArchive';
import { loadEuroStatsForPlayers } from '../../../services/euro/statsArchive';

interface Props {
  player: NBAPlayer;
}

export const PlayerBioStatsHistory: React.FC<Props> = ({ player }) => {
  const { state } = useGame();
  const labels = useLeagueLabels();
  const [pgPhase, setPgPhase] = useState<Phase>('rs');
  const [slPhase, setSlPhase] = useState<Phase>('rs');
  const [advPhase, setAdvPhase] = useState<Phase>('rs');
  const [ghPhase, setGhPhase] = useState<Phase>('rs');
  const [pbaArchiveStats, setPbaArchiveStats] = useState<NBAGMStat[]>([]);
  const [euroArchiveStats, setEuroArchiveStats] = useState<NBAGMStat[]>([]);
  const isPbaPlayer = player.status === 'PBA' || (player.tid >= 2000 && player.tid < 3000);
  const isEuroPlayer = player.status === 'Euroleague' || player.status === 'Endesa' || (player.tid >= 1000 && player.tid < 2000) || (player.tid >= 5000 && player.tid < 6000);

  const allStarSeasons = useMemo(() => {
    const set = new Set<number>();
    (player.awards ?? []).forEach(award => {
      if (award.type && (award.type.toLowerCase().includes('all-star') || award.type.toLowerCase().includes('allstar'))) {
        set.add(award.season);
      }
    });
    return set;
  }, [player.awards]);

  const ringSeasons = useMemo(() => {
    const set = new Set<number>();
    (player.awards ?? []).forEach(award => {
      if (!award.type) return;
      const type = award.type.toLowerCase();
      if ((type.includes('champion') || type === 'nba champion' || type === 'nba championship') && !type.includes('cup')) {
        set.add(award.season);
      }
    });
    return set;
  }, [player.awards]);

  const cupSeasons = useMemo(() => {
    const set = new Set<number>();
    (player.awards ?? []).forEach(award => {
      if (award.type?.toLowerCase() === 'nba cup champion') set.add(award.season);
    });
    return set;
  }, [player.awards]);

  const boxData = useBoxData(player.internalId, state.boxScores);
  useEffect(() => {
    let cancelled = false;
    if (!isPbaPlayer) {
      setPbaArchiveStats([]);
    } else {
      loadPbaStatsForPlayers([player]).then(rowsByPlayer => {
        if (!cancelled) setPbaArchiveStats(rowsByPlayer.get(player.internalId) ?? []);
      });
    }
    if (!isEuroPlayer) {
      setEuroArchiveStats([]);
    } else {
      loadEuroStatsForPlayers([player]).then(rowsByPlayer => {
        if (!cancelled) setEuroArchiveStats(rowsByPlayer.get(player.internalId) ?? []);
      });
    }
    return () => { cancelled = true; };
  }, [isEuroPlayer, isPbaPlayer, player]);

  const stats = useMemo(() => {
    const base = (player.stats ?? []) as NBAGMStat[];
    const existingSeasons = new Set(base.filter(row => !row.playoffs && (row.gp ?? 0) > 0).map(row => row.season));
    const archive = [...pbaArchiveStats, ...euroArchiveStats].filter(row => !existingSeasons.has(row.season));
    if (!archive.length) return base;
    return [...base, ...archive];
  }, [euroArchiveStats, pbaArchiveStats, player.stats]);
  const computedAge = player.born?.year ? state.leagueStats.year - player.born.year : (player.age ?? 0);
  const allTeamsForRows = useMemo(() => [
    ...state.teams.map(team => ({ id: team.id, abbrev: team.abbrev })),
    ...(state.nonNBATeams ?? []).map(team => ({
      id: team.tid,
      abbrev: team.abbrev || (team.name ?? 'INT').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'INT',
    })),
  ], [state.nonNBATeams, state.teams]);

  const build = (phase: Phase) => buildSeasonRows(stats, allTeamsForRows, state.leagueStats.year, computedAge, boxData, phase);
  const pgData = useMemo(() => build(pgPhase), [boxData, pgPhase, stats]);
  const slData = useMemo(() => build(slPhase), [boxData, slPhase, stats]);
  const advData = useMemo(() => build(advPhase), [advPhase, boxData, stats]);
  const ghData = useMemo(() => build(ghPhase), [boxData, ghPhase, stats]);
  const toRows = (data: { body: SeasonRow[]; career: SeasonRow | null }) => [...data.body, ...(data.career ? [data.career] : [])];

  return (
    <div className="p-4 md:p-6 bg-[#080808] space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Per Game</h3>
            {(allStarSeasons.size > 0 || ringSeasons.size > 0 || cupSeasons.size > 0) && (
              <p className="text-[10px] text-slate-600 mt-0.5">
                {ringSeasons.size > 0 && '💍 Champion  '}
                {cupSeasons.size > 0 && '🏆 Cup Champion  '}
                {allStarSeasons.size > 0 && '★ All-Star'}
              </p>
            )}
          </div>
          <PhaseTabs phase={pgPhase} onChange={setPgPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(pgData)} cols={PG_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Shot Locations &amp; Feats</h3>
          <PhaseTabs phase={slPhase} onChange={setSlPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(slData)} cols={SL_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} groupHeaders={SL_GROUPS} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Advanced</h3>
          <PhaseTabs phase={advPhase} onChange={setAdvPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(advData)} cols={ADV_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Game Highs</h3>
          <PhaseTabs phase={ghPhase} onChange={setGhPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(ghData)} cols={GH_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} />
        </div>
      </section>
    </div>
  );
};
