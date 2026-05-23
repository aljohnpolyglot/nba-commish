import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, ArrowLeft, History, LayoutGrid, Trophy } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { getAllCachedSeasons } from '../../../data/brefFetcher';
import {
  fetchRegularRecords, fetchPlayoffRecords, fetchCareerLeaders, fetchAverageLeaders,
  fetchMissingPortraits,
  filterToTeam, getStatValue, CATEGORY_ORDER, CATEGORY_ORDER_AVG,
  cleanName, computeLiveTotals, mergeCareerLeaders, mergeAverageLeaders, parseStatVal,
} from '../../../data/franchiseService';
import { ensurePhotosLoaded, getPhotoBySlug, getPhotoByName } from '../../../data/realPlayerDataFetcher';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import type { Tab } from '../../../types';
import { getActiveLeagueTeams, resolveAnyTeam } from '../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../utils/uiMode';
import { getTeamMascot } from '../../../utils/helpers';
import { TeamHistoryLeadersPanel, TeamHistoryOverviewPanel, TeamHistoryRecordsPanel, TeamHistoryRetireModal, TeamHistorySeasonPanel } from './TeamHistoryPanels';
import { TeamHistoryPicker } from './TeamHistoryPicker';
import { avatarFallback, consumePendingTeamHistoryOrigin, consumePendingTeamHistoryTid, getBestAccentColor, NBA_HUB_ID, requestTeamHistoryFor } from './TeamHistoryShared';

export { requestTeamHistoryFor };

interface TeamHistoryViewProps {
  onViewChange?: (view: Tab) => void;
}

export const TeamHistoryView: React.FC<TeamHistoryViewProps> = ({ onViewChange }) => {
  const { state } = useGame();
  const isFictional = state.leagueType === 'fictional';
  const euroIsolated = isEuroIsolatedMode(state);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(() => consumePendingTeamHistoryTid());
  const [originView, setOriginView] = useState<Tab | null>(() => consumePendingTeamHistoryOrigin());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'leaders' | 'history'>('overview');
  const [recordType, setRecordType] = useState<'regular' | 'playoff'>('regular');
  const [leaderSubTab, setLeaderSubTab] = useState<'totals' | 'averages'>('totals');
  const [expandedLeaders, setExpandedLeaders] = useState<Record<string, boolean>>({});
  const [expandedRecords, setExpandedRecords] = useState<Record<string, boolean>>({});
  const [showRetireModal, setShowRetireModal] = useState(false);
  const [regularRecords, setRegularRecords] = useState<any[]>([]);
  const [playoffRecords, setPlayoffRecords] = useState<any[]>([]);
  const [careerLeaders, setCareerLeaders] = useState<any[]>([]);
  const [averageLeaders, setAverageLeaders] = useState<any[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [portraitMap, setPortraitMap] = useState<Map<string, string>>(new Map());

  const nbaHubTeam = {
    id: NBA_HUB_ID,
    name: 'Association',
    region: isFictional ? 'Fictional Basketball' : 'National Basketball',
    abbrev: isFictional ? 'LGE' : 'NBA',
    colors: ['#1D428A', '#C8102E'],
    conference: 'League',
    logoUrl: isFictional ? undefined : 'https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg',
  };
  const selectedTeam = selectedTeamId === NBA_HUB_ID ? nbaHubTeam : (selectedTeamId != null ? resolveAnyTeam(selectedTeamId, state.teams, state.nonNBATeams ?? []) ?? null : null);
  const isNBAHub = selectedTeamId === NBA_HUB_ID;

  const liveTotals = useMemo(() => selectedTeam ? computeLiveTotals(state.players, selectedTeam.id) : [], [selectedTeam, state.players]);
  const mergedCareer = useMemo(() => mergeCareerLeaders(careerLeaders, liveTotals), [careerLeaders, liveTotals]);
  const mergedAverage = useMemo(() => mergeAverageLeaders(averageLeaders, liveTotals), [averageLeaders, liveTotals]);
  const accent = selectedTeam ? getBestAccentColor(selectedTeam.colors, selectedTeam.name) : '#94a3b8';

  const findPlayerImg = (name: string): string => {
    const key = name?.toLowerCase().trim();
    const statePlayer = state.players.find(player => player.name?.toLowerCase() === key);
    if (statePlayer?.imgURL) return statePlayer.imgURL;
    if (statePlayer?.srID) {
      const fromPhotos = getPhotoBySlug(statePlayer.srID);
      if (fromPhotos) return fromPhotos;
    }
    const fromGist = portraitMap.get(key);
    if (fromGist) return fromGist;
    const fromZenGM = getPhotoByName(name);
    if (fromZenGM) return fromZenGM;
    return avatarFallback(name);
  };

  useEffect(() => {
    ensurePhotosLoaded();
    fetchMissingPortraits().then(portraits => {
      const next = new Map<string, string>();
      for (const portrait of portraits) {
        if (portrait.name && portrait.portrait) next.set(portrait.name.toLowerCase().trim(), portrait.portrait);
      }
      setPortraitMap(next);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    if (isFictional || euroIsolated || selectedTeam.id >= 100) {
      setRegularRecords([]);
      setPlayoffRecords([]);
      setCareerLeaders([]);
      setAverageLeaders([]);
      setExternalError(null);
      setExternalLoading(false);
      return;
    }

    let cancelled = false;
    setExternalLoading(true);
    setExternalError(null);
    Promise.all([fetchRegularRecords(), fetchPlayoffRecords(), fetchCareerLeaders(), fetchAverageLeaders()])
      .then(([regular, playoff, career, average]) => {
        if (cancelled) return;
        if (selectedTeamId === NBA_HUB_ID) {
          setRegularRecords(regular);
          setPlayoffRecords(playoff);
          setCareerLeaders(career);
          setAverageLeaders(average.filter(leader => parseInt(leader.GP || '0', 10) >= 100));
          return;
        }
        setRegularRecords(filterToTeam(regular, selectedTeam));
        setPlayoffRecords(filterToTeam(playoff, selectedTeam));
        setCareerLeaders(filterToTeam(career, selectedTeam));
        setAverageLeaders(filterToTeam(average, selectedTeam).filter(leader => parseInt(leader.GP || '0', 10) >= 100));
      })
      .catch(error => { if (!cancelled) setExternalError(String(error)); })
      .finally(() => { if (!cancelled) setExternalLoading(false); });

    return () => { cancelled = true; };
  }, [euroIsolated, isFictional, selectedTeam, selectedTeamId]);

  const topPlayers = useMemo(() => {
    if (!selectedTeam) return [];

    const scorePlayer = (player: any, tid: number | null): number => {
      const teamSeasons = tid !== null ? new Set((player.stats ?? []).filter((season: any) => season.tid === tid).map((season: any) => season.season)) : null;
      const inScope = (season: number) => teamSeasons === null || teamSeasons.has(season);

      const awards = (player.awards ?? []).filter((award: any) => inScope(award.season));
      const mvp = awards.filter((award: any) => award.type === 'Most Valuable Player').length;
      const fmvp = awards.filter((award: any) => award.type === 'Finals MVP').length;
      const al1 = awards.filter((award: any) => award.type === 'All-NBA First Team').length;
      const al2 = awards.filter((award: any) => award.type === 'All-NBA Second Team').length;
      const al3 = awards.filter((award: any) => award.type === 'All-NBA Third Team').length;
      const ad1 = awards.filter((award: any) => award.type === 'All-Defensive First Team').length;
      const ad2 = awards.filter((award: any) => award.type === 'All-Defensive Second Team').length;
      const allStar = awards.filter((award: any) => award.type === 'All-Star').length;
      const champ = awards.filter((award: any) => award.type === 'NBA Champion').length;
      const regularStats = (player.stats ?? []).filter((season: any) => !season.playoffs && (tid === null || season.tid === tid));
      const playoffStats = (player.stats ?? []).filter((season: any) => !!season.playoffs && (tid === null || season.tid === tid));
      const regularWS = regularStats.reduce((sum: number, season: any) => sum + (season.ows ?? 0) + (season.dws ?? 0) + (season.ewa ?? 0), 0);
      const playoffWS = playoffStats.reduce((sum: number, season: any) => sum + (season.ows ?? 0) + (season.dws ?? 0) + (season.ewa ?? 0), 0);
      return mvp * 6 + fmvp * 6 + al1 * 2 + al2 + al3 * 0.25 + (ad1 + ad2) * 0.15 + allStar * 0.1 + champ + (playoffWS / 2) * 0.1 + (regularWS / 2) * 0.075;
    };

    if (isNBAHub) {
      return state.players
        .map(player => ({ name: player.name, score: scorePlayer(player, null), imgURL: player.imgURL, hof: player.hof ?? false }))
        .filter(entry => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 100);
    }

    const teamId = selectedTeam.id;
    const parMap = new Map<string, { pts: number; reb: number; ast: number }>();
    for (const row of mergedCareer) {
      const name = cleanName(row.NAME);
      if (!parMap.has(name)) parMap.set(name, { pts: 0, reb: 0, ast: 0 });
      const entry = parMap.get(name)!;
      const category = row.Category ?? row.Career_Leader_Category;
      const value = (row._val ?? 0) || parseStatVal(getStatValue(row, category));
      if (category === 'Points') entry.pts = Math.max(entry.pts, value);
      if (category === 'Rebounds') entry.reb = Math.max(entry.reb, value);
      if (category === 'Assists') entry.ast = Math.max(entry.ast, value);
    }
    for (const live of liveTotals) {
      const name = live.NAME;
      if (!parMap.has(name)) parMap.set(name, { pts: 0, reb: 0, ast: 0 });
      const entry = parMap.get(name)!;
      entry.pts = Math.max(entry.pts, parseFloat(live.PTS ?? '0') || 0);
      entry.reb = Math.max(entry.reb, parseFloat(live.REB ?? '0') || 0);
      entry.ast = Math.max(entry.ast, parseFloat(live.AST ?? '0') || 0);
    }
    return Array.from(parMap.entries())
      .map(([name, stats]) => {
        const statePlayer = state.players.find(player => player.name?.toLowerCase() === name.toLowerCase());
        const score = statePlayer ? scorePlayer(statePlayer, teamId) : (stats.pts + stats.reb + stats.ast) * 0.001;
        return { name, score, imgURL: statePlayer?.imgURL, hof: statePlayer?.hof ?? false };
      })
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 30);
  }, [isNBAHub, liveTotals, mergedCareer, selectedTeam, state.players]);

  const seasonHistory = useMemo(() => {
    if (!selectedTeam) return [];
    const awards = (state.historicalAwards as any[]) ?? [];
    const teamId = selectedTeam.id;
    const seasonsSet = new Set<number>();
    awards.forEach(award => { if (award.season) seasonsSet.add(Number(award.season)); });
    ((selectedTeam as any).seasons ?? []).forEach((season: any) => { if (season.season) seasonsSet.add(Number(season.season)); });
    state.players.forEach(player => (player.stats ?? []).forEach((season: any) => { if (season.tid === teamId && season.season) seasonsSet.add(Number(season.season)); }));

    const champAwards = awards.filter((award: any) => award.type === 'Champion' && Number(award.tid) === teamId);
    const runnerUpAwards = awards.filter((award: any) => award.type === 'Runner Up' && Number(award.tid) === teamId);
    const champSeasons = new Set(champAwards.map((award: any) => Number(award.season)));
    const runnerUpSeasons = new Set(runnerUpAwards.map((award: any) => Number(award.season)));

    if (!isFictional) {
      for (const [year, brefData] of getAllCachedSeasons().entries()) {
        const championLabel = (brefData.champion?.name ?? '').toLowerCase();
        const runnerUpLabel = (brefData.runnerUp?.name ?? '').toLowerCase();
        const teamLabel = (selectedTeam.name ?? '').toLowerCase();
        const fullLabel = `${(selectedTeam as any).region ?? ''} ${selectedTeam.name ?? ''}`.toLowerCase().trim();
        if (championLabel && (championLabel.includes(teamLabel) || fullLabel.includes(championLabel))) { champSeasons.add(year); seasonsSet.add(year); }
        if (runnerUpLabel && (runnerUpLabel.includes(teamLabel) || fullLabel.includes(runnerUpLabel))) { runnerUpSeasons.add(year); seasonsSet.add(year); }
      }
    }

    const currentSeason = state.leagueStats?.year ?? new Date(state.date).getFullYear();
    return Array.from(seasonsSet).sort((left, right) => right - left).map(season => {
      const teamSeason = ((selectedTeam as any).seasons ?? []).find((entry: any) => Number(entry.season) === season);
      const playoffRoundsWon = teamSeason?.playoffRoundsWon;
      const isChamp = champSeasons.has(season) || playoffRoundsWon === 4;
      const isRU = !isChamp && (runnerUpSeasons.has(season) || playoffRoundsWon === 3);
      const isCurrent = season === currentSeason && (teamSeason?.won ?? 0) + (teamSeason?.lost ?? 0) === 0;
      return {
        season,
        won: isCurrent ? undefined : teamSeason?.won,
        lost: isCurrent ? undefined : teamSeason?.lost,
        playoffRoundsWon: isCurrent ? undefined : (playoffRoundsWon ?? (isChamp ? 4 : isRU ? 3 : undefined)),
        isChamp,
        isRU,
        isCurrent,
      };
    });
  }, [isFictional, selectedTeam, state.date, state.historicalAwards, state.leagueStats, state.players]);

  const summaryStats = useMemo(() => {
    const known = seasonHistory.filter(season => season.won != null && (season.won + (season.lost ?? 0)) > 0);
    const totalW = known.reduce((sum, season) => sum + (season.won ?? 0), 0);
    const totalL = known.reduce((sum, season) => sum + (season.lost ?? 0), 0);
    const sorted = [...known].sort((left, right) => ((right.won ?? 0) / (((right.won ?? 0) + (right.lost ?? 0)) || 1)) - ((left.won ?? 0) / (((left.won ?? 0) + (left.lost ?? 0)) || 1)));
    return {
      totalW,
      totalL,
      winPct: totalW + totalL > 0 ? (totalW / (totalW + totalL)).toFixed(3) : '.000',
      playoffApps: seasonHistory.filter(season => (season.playoffRoundsWon ?? -1) >= 0).length,
      finalsApps: seasonHistory.filter(season => (season.playoffRoundsWon ?? -1) >= 3).length,
      titles: seasonHistory.filter(season => season.isChamp).length,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [seasonHistory]);

  const processedRecords = useMemo(() => {
    const source = recordType === 'regular' ? regularRecords : playoffRecords;
    const isPlayoff = recordType === 'playoff';
    const filtered = source.filter(record => {
      if (!record.DATE) return true;
      try {
        const date = new Date(record.DATE);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        if (year === 2025 && month >= 10) return false;
        if (year === 2026 && month <= 6) return false;
      } catch {}
      return true;
    });

    const simRecords = (state.simFranchiseRecords ?? []).filter((record: any) => record.isPlayoff === isPlayoff && (isNBAHub || record.tid === selectedTeam?.id));
    const all = [...filtered, ...simRecords];
    const grouped: Record<string, any[]> = {};
    all.forEach(record => {
      const category = record.SearchCategory;
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(record);
    });
    for (const category of Object.keys(grouped)) {
      grouped[category].sort((left, right) => parseStatVal(getStatValue(right, category)) - parseStatVal(getStatValue(left, category)));
      const seen = new Set<string>();
      grouped[category] = grouped[category].filter(record => {
        const name = cleanName(record.NAME ?? '').toLowerCase();
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
    }
    return Object.entries(grouped)
      .sort(([left], [right]) => (CATEGORY_ORDER.indexOf(left) === -1 ? 99 : CATEGORY_ORDER.indexOf(left)) - (CATEGORY_ORDER.indexOf(right) === -1 ? 99 : CATEGORY_ORDER.indexOf(right)))
      .map(([, records]) => records);
  }, [isNBAHub, playoffRecords, recordType, regularRecords, selectedTeam, state.simFranchiseRecords]);

  const filteredTeams = useMemo(() => {
    const lowered = searchTerm.toLowerCase();
    const sourceTeams = euroIsolated ? getActiveLeagueTeams(state) : state.teams;
    return sourceTeams.filter(team => team.name.toLowerCase().includes(lowered) || (team.region ?? '').toLowerCase().includes(lowered) || team.abbrev.toLowerCase().includes(lowered));
  }, [euroIsolated, searchTerm, state]);

  const quick = usePlayerQuickActions();
  const isGM = state.gameMode === 'gm';
  const canRetireForTeam = !isGM || selectedTeamId === (state as any).userTeamId;

  if (quick.fullPageView) return quick.fullPageView;
  if (!selectedTeam) {
    return <TeamHistoryPicker euroIsolated={euroIsolated} isFictional={isFictional} searchTerm={searchTerm} setSearchTerm={setSearchTerm} filteredTeams={filteredTeams} setSelectedTeamId={setSelectedTeamId} setActiveTab={setActiveTab} setExpandedLeaders={setExpandedLeaders} setExpandedRecords={setExpandedRecords} quickPortals={quick.portals} />;
  }

  const retiredJerseys: any[] = (selectedTeam as any).retiredJerseyNumbers ?? [];
  const jerseyReasonLabel = (jersey: any) => {
    const reason = jersey.reason ?? jersey.tier;
    if (reason === 'franchise_icon' || reason === 'automatic') return 'Franchise Icon';
    if (reason === 'championship_core' || reason === 'fast_track') return 'Title Core';
    if (reason === 'hof_legend') return 'HOF Legend';
    if (reason === 'loyal_star' || reason === 'standard') return 'Loyal Star';
    if (reason === 'honorary' || reason === 'late_honor') return 'Honorary';
    return null;
  };
  const retiredJerseyDisplayName = (jersey: any) => {
    const text = String(jersey.text ?? '').trim();
    if (text) return text;
    const matched = jersey.pid != null ? state.players.find((player: any) => player.pid === jersey.pid || player.id === jersey.pid)?.name : undefined;
    if (matched) return matched;
    return String(jersey.number) === '6' ? 'Bill Russell' : 'Legend';
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#09090b] text-zinc-100" style={{ '--ta': accent } as React.CSSProperties}>
      <div className="relative overflow-hidden border-b border-zinc-800/50 bg-zinc-950">
        <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(ellipse at top right, ${accent}, transparent 70%)` }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-6 pb-8">
          <button
            onClick={() => {
              if (originView && onViewChange) {
                const destination = originView;
                setOriginView(null);
                setSelectedTeamId(null);
                onViewChange(destination);
                return;
              }
              setSelectedTeamId(null);
            }}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" style={{ color: accent }} />
            {originView === 'League History' ? 'Back to League History' : 'All Teams'}
          </button>
          <div className="flex items-center gap-5">
            {selectedTeam.logoUrl ? <img src={selectedTeam.logoUrl} alt={selectedTeam.name} className="w-20 h-20 object-contain drop-shadow-xl shrink-0" referrerPolicy="no-referrer" /> : <div className="w-20 h-20 rounded-2xl bg-zinc-800 flex items-center justify-center text-2xl font-black shrink-0" style={{ color: accent }}>{selectedTeam.abbrev}</div>}
            <div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase leading-none">
                {selectedTeam.region && <span className="text-zinc-300">{selectedTeam.region} </span>}
                <span style={{ color: accent }}>{getTeamMascot(selectedTeam.name, selectedTeam.region)}</span>
              </h1>
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                <span>{selectedTeam.abbrev}</span>
                <span>{selectedTeam.conference}</span>
                {summaryStats.titles > 0 && <span className="flex items-center gap-1" style={{ color: accent }}><Trophy className="w-3 h-3" /> {summaryStats.titles}× Champion</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-20 bg-[#09090b]/90 backdrop-blur border-b border-zinc-800/50 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-6 flex gap-6 min-w-max">
          {[
            { id: 'overview' as const, label: 'Overview', icon: LayoutGrid },
            { id: 'records' as const, label: 'Records', icon: Trophy },
            { id: 'leaders' as const, label: 'Leaders', icon: Award },
            ...(!isNBAHub ? [{ id: 'history' as const, label: 'Season History', icon: History }] : []),
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 py-4 text-xs font-semibold transition-all relative whitespace-nowrap ${activeTab === tab.id ? '' : 'text-zinc-500 hover:text-zinc-300'}`} style={activeTab === tab.id ? { color: accent } : {}}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && <motion.div layoutId="teamHistoryTab" className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: accent }} />}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && <TeamHistoryOverviewPanel accent={accent} isNBAHub={isNBAHub} retiredJerseys={retiredJerseys} retiredJerseyDisplayName={retiredJerseyDisplayName} jerseyReasonLabel={jerseyReasonLabel} canRetireForTeam={canRetireForTeam} setShowRetireModal={setShowRetireModal} topPlayers={topPlayers} statePlayers={state.players} findPlayerImg={findPlayerImg} onOpenPlayer={name => { const player = state.players.find(entry => entry.name?.toLowerCase() === name.toLowerCase()); if (player) quick.openFor(player); }} />}
          {activeTab === 'records' && <TeamHistoryRecordsPanel accent={accent} isNBAHub={isNBAHub} recordType={recordType} setRecordType={setRecordType} externalLoading={externalLoading} externalError={externalError} processedRecords={processedRecords} expandedRecords={expandedRecords} setExpandedRecords={setExpandedRecords} findPlayerImg={findPlayerImg} cleanName={cleanName} getStatValue={getStatValue} />}
          {activeTab === 'leaders' && <TeamHistoryLeadersPanel accent={accent} isNBAHub={isNBAHub} leaderSubTab={leaderSubTab} setLeaderSubTab={setLeaderSubTab} externalLoading={externalLoading} externalError={externalError} mergedCareer={mergedCareer} mergedAverage={mergedAverage} expandedLeaders={expandedLeaders} setExpandedLeaders={setExpandedLeaders} statePlayers={state.players} findPlayerImg={findPlayerImg} cleanName={cleanName} getStatValue={getStatValue} categoryOrder={CATEGORY_ORDER} categoryOrderAvg={CATEGORY_ORDER_AVG} />}
          {activeTab === 'history' && <TeamHistorySeasonPanel accent={accent} summaryStats={summaryStats} seasonHistory={seasonHistory} isFictional={isFictional} />}
        </AnimatePresence>
      </div>

      <TeamHistoryRetireModal selectedTeamId={selectedTeamId} teamId={selectedTeam.id} isNBAHub={isNBAHub} showRetireModal={showRetireModal} setShowRetireModal={setShowRetireModal} accent={accent} findPlayerImg={findPlayerImg} />
      {quick.portals}
    </div>
  );
};
