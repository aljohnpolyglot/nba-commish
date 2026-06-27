import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Star, Target, Zap, UserCheck, Info, Award, Flame, Sparkles, Users } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { useHubScope } from '../../hooks/useHubScope';
import { AwardService, type AllNBASpot } from '../../services/logic/AwardService';
import { assignCoachOdds, assignOdds } from '../../services/logic/AwardServiceShared';
import { resolveStaffRating } from '../../services/staff/displayAttributes';
import { fetchCoachData, getCoachPhoto } from '../../data/photos/coaches';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { RankedPersonCard, StatPills } from '../shared/ui';
import { getOwnTeamId } from '../../utils/helpers';
import type { NBAPlayer } from '../../types';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { PBA_TEAM_DATA } from '../../data/templates/philippines/teamPopulations';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { isPbaRosterLocal } from '../../services/pba/importManager';
import { getPbaMostImprovedCandidates, isPbaRookieForSeason } from '../../services/pba/awards';
import { getPbaHeadCoachPhotoForTeam } from '../../services/pba/staffSources';
import { selectCountedPbaRegularBoxScores } from '../../services/pba/competitionGames';

type PbaTab = 'mvp' | 'bpc' | 'bestImport' | 'roy' | 'mip' | 'coy' | 'dpoy' | 'mqm' | 'allPBA';

type PbaCandidate = {
  player: NBAPlayer;
  team: any;
  stats: any;
  odds?: string;
};

type PbaCoachCandidate = {
  coachName: string;
  team: any;
  wins: number;
  losses: number;
  coachPhotoUrl?: string;
  odds?: string;
};

const TAB_META: Record<PbaTab, { title: string; desc: string; icon: React.ReactElement }> = {
  mvp: { title: 'Most Valuable Player', desc: 'Top all-around performer in the PBA.', icon: <Star className="text-yellow-400" /> },
  bpc: { title: 'Best Player of the Conference', desc: 'Conference-level top performer.', icon: <Award className="text-indigo-400" /> },
  bestImport: { title: 'Best Import of the Conference', desc: 'Top import in the active PBA conference.', icon: <Users className="text-cyan-400" /> },
  roy: { title: 'Rookie of the Year', desc: 'Top-performing rookie.', icon: <Sparkles className="text-emerald-400" /> },
  mip: { title: 'Most Improved Player', desc: 'Biggest leap from last season.', icon: <Zap className="text-orange-400" /> },
  coy: { title: 'Coach of the Year', desc: 'Best coaching job this season.', icon: <UserCheck className="text-teal-400" /> },
  dpoy: { title: 'Defensive Player of the Year', desc: 'Most impactful defender.', icon: <Target className="text-blue-400" /> },
  mqm: { title: 'Mr. Quality Minutes', desc: 'Best bench/rotation value.', icon: <Flame className="text-pink-400" /> },
  allPBA: { title: 'Mythical Team / All-Defense / All-Rookie', desc: 'Projected PBA honor teams in the NBA award-race layout.', icon: <Users className="text-indigo-400" /> },
};

const HISTORY_TYPES: Record<PbaTab, string> = {
  mvp: 'Most Valuable Player',
  bpc: 'Best Player of the Conference',
  bestImport: 'Best Import of the Conference',
  roy: 'Rookie of the Year',
  mip: 'Most Improved Player',
  coy: 'Coach of the Year',
  dpoy: 'Defensive Player of the Year',
  mqm: 'Mr. Quality Minutes',
  allPBA: 'PBA Mythical Team',
};
const COY_HISTORY_TYPES = ['Coach of the Year', 'Baby Dalupan PBA Coach of the Year award', 'PBA Coach of the Year award'];
const BEST_IMPORT_HISTORY_TYPES = ['Best Import of the Conference', 'Best Import'];
const HISTORY_TYPE_ALIASES: Record<PbaTab, string[]> = {
  mvp: ['MVP', HISTORY_TYPES.mvp],
  bpc: [HISTORY_TYPES.bpc],
  bestImport: BEST_IMPORT_HISTORY_TYPES,
  roy: ['ROY', HISTORY_TYPES.roy],
  mip: ['MIP', HISTORY_TYPES.mip],
  coy: ['COY', ...COY_HISTORY_TYPES],
  dpoy: ['DPOY', HISTORY_TYPES.dpoy],
  mqm: ['SMOY', 'Sixth Man of the Year', HISTORY_TYPES.mqm],
  allPBA: ['PBA Mythical First Team', 'PBA Mythical Second Team', HISTORY_TYPES.allPBA],
};

const normalizeText = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const awardTypeMatches = (award: any, types: readonly string[]) => {
  const type = String(award?.type ?? '');
  return types.some(candidate => type === candidate || type.includes(candidate));
};
const pbaTeamId = (tid: unknown): boolean => Number(tid) >= 2000 && Number(tid) < 2100;
const isPbaTeamPlayer = (player: NBAPlayer): boolean => player.status === 'PBA' || pbaTeamId(player.tid);
const hasActivePbaImportContract = (player: NBAPlayer): boolean => {
  const contract = (player as any).pbaImportContract;
  return !!contract && contract.status !== 'released';
};
const isPbaImportLike = (player: NBAPlayer): boolean =>
  !!(player as any).isImport ||
  !!(player as any).importConference ||
  hasActivePbaImportContract(player);
const isPbaLocalAwardPlayer = (player: NBAPlayer, leagueStats: any): boolean =>
  isPbaTeamPlayer(player) &&
  isPbaRosterLocal(player, leagueStats) &&
  !isPbaImportLike(player);
const statRebounds = (stats: any): number => stats?.trb ?? stats?.reb ?? ((stats?.orb ?? 0) + (stats?.drb ?? 0));
const posGroup = (pos?: string): 'G' | 'F' | 'C' => {
  const key = String(pos ?? '').toUpperCase();
  if (key.startsWith('C')) return 'C';
  if (key.includes('G')) return 'G';
  return 'F';
};

export const PBAAwardRacesView: React.FC = () => {
  const { state } = useGame();
  const { players, teams } = useHubScope();
  const ownTid = getOwnTeamId(state);
  const [selectedTab, setSelectedTab] = useState<PbaTab>('mvp');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const pbaConference = ((state.leagueStats as any)?.pbaConference ?? 'philippine') as 'philippine' | 'commissioners' | 'governors';
  const currentHistory = (state.historicalAwards ?? []).filter((award: any) => {
    if (Number(award.season) !== Number(season)) return false;
    if (selectedTab === 'bpc' || selectedTab === 'bestImport') {
      const awardConference = normalizeText(award.conference ?? award.source ?? award.type);
      const wantsConference = pbaConference === 'philippine'
        ? 'philippine'
        : pbaConference === 'commissioners'
          ? 'commissioner'
          : 'governor';
      if (!awardConference.includes(wantsConference)) return false;
      if (selectedTab === 'bestImport') return awardTypeMatches(award, HISTORY_TYPE_ALIASES.bestImport);
    }
    return awardTypeMatches(award, HISTORY_TYPE_ALIASES[selectedTab]);
  });
  const pbaSpec = (() => {
    const current = (state.leagueStats as any)?.pbaConference;
    if (current === 'commissioners') return PBA_COMPETITIONS[1];
    if (current === 'governors') return PBA_COMPETITIONS[2];
    return PBA_COMPETITIONS[0];
  })();
  const showBestImport = pbaSpec.importRule !== 'none';
  const visibleTabs = useMemo(() => (
    showBestImport
      ? (['mvp', 'bpc', 'bestImport', 'roy', 'mip', 'coy', 'dpoy', 'mqm', 'allPBA'] as PbaTab[])
      : (['mvp', 'bpc', 'roy', 'mip', 'coy', 'dpoy', 'mqm', 'allPBA'] as PbaTab[])
  ), [showBestImport]);

  useEffect(() => {
    void fetchCoachData();
  }, []);

  const teamsWithRecords = useMemo(() => {
    const records = new Map<number, { wins: number; losses: number }>();
    for (const team of teams) {
      records.set(team.id, { wins: 0, losses: 0 });
    }
    for (const box of selectCountedPbaRegularBoxScores(state.boxScores ?? [], pbaSpec, Number(season))) {
      const homeTid = Number((box as any).homeTeamId);
      const awayTid = Number((box as any).awayTeamId);
      const home = records.get(homeTid) ?? { wins: 0, losses: 0 };
      const away = records.get(awayTid) ?? { wins: 0, losses: 0 };
      const homeWon = Number((box as any).homeScore) > Number((box as any).awayScore);
      home.wins += homeWon ? 1 : 0;
      home.losses += homeWon ? 0 : 1;
      away.wins += homeWon ? 0 : 1;
      away.losses += homeWon ? 1 : 0;
      records.set(homeTid, home);
      records.set(awayTid, away);
    }

    return teams.map(team => {
      const record = records.get(team.id);
      return record ? { ...team, wins: record.wins, losses: record.losses } : team;
    });
  }, [pbaSpec, season, state.boxScores, teams]);

  const pbaPlayers = useMemo(
    () => players.filter(player => isPbaTeamPlayer(player)),
    [players],
  );
  const localPbaPlayers = useMemo(
    () => pbaPlayers.filter(player => isPbaLocalAwardPlayer(player, state.leagueStats)),
    [pbaPlayers, state.leagueStats],
  );
  const importPbaPlayers = useMemo(
    () => pbaPlayers.filter(player => pbaTeamId(player.tid) && isPbaImportLike(player)),
    [pbaPlayers],
  );

  const liveRaces = useMemo(() => AwardService.calculateAwardRaces(
    localPbaPlayers,
    teamsWithRecords,
    season,
    state.staff,
    state.leagueStats?.minGamesRequirement,
  ), [localPbaPlayers, teamsWithRecords, season, state.staff, state.leagueStats?.minGamesRequirement]);

  const pbaTeamMeta = useMemo(() => {
    const byAbbrev = new Map<string, typeof PBA_TEAM_DATA[number]>();
    const byName = new Map<string, typeof PBA_TEAM_DATA[number]>();
    const putAlias = (alias: string, team: typeof PBA_TEAM_DATA[number]) => {
      const key = normalizeText(alias);
      if (key) byName.set(key, team);
    };
    for (const team of PBA_TEAM_DATA) {
      byAbbrev.set(normalizeText(team.abbrev), team);
      putAlias(team.name, team);
      putAlias(`${team.region} ${team.name}`, team);
      putAlias(team.region, team);
    }
    const aliasPairs: Array<[string, string]> = [
      ['TIT', 'TGR'],
      ['Titan Ultra Giant Risers', 'TGR'],
      ['NorthPort Batang Pier', 'TGR'],
      ['BLB', 'BWB'],
      ['Blackwater Bossing', 'BWB'],
      ['Bossing', 'BWB'],
      ['BGSM', 'BGSM'],
      ['Ginebra', 'BGSM'],
      ['Barangay Ginebra', 'BGSM'],
      ['ROS', 'ROS'],
      ['Rain or Shine', 'ROS'],
      ['MER', 'MER'],
      ['Meralco', 'MER'],
      ['MAG', 'MAG'],
      ['Magnolia', 'MAG'],
      ['PHX', 'PHX'],
      ['Phoenix', 'PHX'],
      ['TER', 'TER'],
      ['Terrafirma', 'TER'],
      ['CON', 'CON'],
      ['Converge', 'CON'],
    ];
    for (const [alias, abbrev] of aliasPairs) {
      const team = byAbbrev.get(normalizeText(abbrev));
      if (!team) continue;
      byAbbrev.set(normalizeText(alias), team);
      putAlias(alias, team);
    }
    return { byAbbrev, byName };
  }, []);

  const coyRaces = useMemo(() => {
    const scored = teamsWithRecords
      .filter((team: any) => pbaTeamId(team.id) && (Number(team.wins ?? 0) + Number(team.losses ?? 0)) > 0)
      .map((team: any) => {
        const wins = Number(team.wins ?? 0);
        const losses = Number(team.losses ?? 0);
        const winPct = wins / ((wins + losses) || 1);
        const teamMeta =
          pbaTeamMeta.byAbbrev.get(normalizeText(team.abbrev)) ??
          pbaTeamMeta.byName.get(normalizeText(team.name)) ??
          pbaTeamMeta.byName.get(normalizeText(team.region)) ??
          pbaTeamMeta.byName.get(normalizeText(`${team.region ?? ''} ${team.name ?? ''}`));
        const coachName = teamMeta?.coach ?? (team as any).coachName ?? (team as any).coach ?? (team as any).headCoach ?? '';
        if (!coachName) return null;
        const coachRating = resolveStaffRating('Head Coach', {
          name: coachName,
          role: 'Head Coach',
          attributeProfile: 'nba',
        });
        const score = (winPct * 72) + (coachRating * 0.45);
        return {
          coachName,
          team,
          score,
          odds: '',
          wins,
          losses,
          improvement: 0,
          coachRating,
          coachPhotoUrl: getPbaHeadCoachPhotoForTeam(team, season) ?? getCoachPhoto(coachName),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
      .sort((a, b) => b.score - a.score);

    return assignCoachOdds(scored);
  }, [pbaTeamMeta, season, teamsWithRecords]);

  const hasRegularSeasonSample = useMemo(() => (state.boxScores ?? []).some((box: any) => {
    const phase = String(box?.competitionPhase ?? '').toLowerCase();
    const boxSeason = Number(box?.season ?? season);
    return box?.competitionId === pbaSpec.id
      && boxSeason === Number(season)
      && (!phase || phase.startsWith('r') || phase === 'regular' || phase === 'league' || phase === 'group');
  }), [pbaSpec.id, season, state.boxScores]);

  const fallback = useMemo(() => {
    const scorePlayers = (pool: NBAPlayer[]) => pool
      .map((player) => {
        const stats = player.stats?.find((row: any) => Number(row.season) === Number(season) && !row.playoffs && (row.gp ?? 0) > 0)
          ?? player.stats?.[player.stats.length - 1];
        if (!stats || !stats.gp) return null;
        const team = teamsWithRecords.find(t => t.id === player.tid);
        if (!team) return null;
        const ppg = (stats.pts ?? 0) / stats.gp;
        const rpg = (statRebounds(stats) || 0) / stats.gp;
        const apg = (stats.ast ?? 0) / stats.gp;
        const winPct = team && (team.wins + team.losses) > 0 ? team.wins / (team.wins + team.losses) : 0.5;
        return {
          player,
          team,
          stats,
          score: (ppg * 1.1 + rpg * 0.35 + apg * 0.35) * (0.75 + winPct * 0.5),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
      .sort((a, b) => b.score - a.score);
    const scoredLocals = scorePlayers(localPbaPlayers);
    const scoredImports = scorePlayers(importPbaPlayers);

    return {
      bpc: scoredLocals,
      finalsMvp: scoredLocals,
      bestImport: scoredImports,
    };
  }, [importPbaPlayers, localPbaPlayers, season, teamsWithRecords]);

  const rookieCandidates = useMemo(() => {
    const candidates = (fallback.bpc as Array<PbaCandidate & { score?: number }>)
      .filter(entry => isPbaRookieForSeason(state, entry.player, season))
      .slice(0, 10)
      .map(entry => ({ ...entry, odds: entry.odds ?? '' }));
    return assignOdds(candidates as any) as PbaCandidate[];
  }, [fallback.bpc, season, state]);

  const honorTeams = useMemo(() => {
    const toSpot = (entry: PbaCandidate & { score?: number }): AllNBASpot => ({
      player: entry.player,
      team: entry.team,
      pos: posGroup(entry.player.pos),
      score: entry.score ?? 0,
      stats: entry.stats,
    });
    const mythical = (fallback.bpc as Array<PbaCandidate & { score?: number }>).map(toSpot);
    const defense = localPbaPlayers
      .map(player => {
        const stats = player.stats?.find((row: any) => Number(row.season) === Number(season) && !row.playoffs && (row.gp ?? 0) > 0);
        const team = teamsWithRecords.find(entry => Number(entry.id) === Number(player.tid));
        if (!stats || !team) return null;
        const gp = Math.max(Number(stats.gp ?? 1), 1);
        const diq = Number((player.ratings?.[player.ratings.length - 1] as any)?.diq ?? 50);
        const score = ((Number(stats.stl ?? 0) / gp) * 3.4) +
          ((Number(stats.blk ?? 0) / gp) * 3.1) +
          ((statRebounds(stats) / gp) * 0.28) +
          (diq * 0.045);
        return { player, team, pos: posGroup(player.pos), score, stats } as AllNBASpot;
      })
      .filter((entry): entry is AllNBASpot => !!entry)
      .sort((a, b) => b.score - a.score);
    const rookies = rookieCandidates.map(entry => toSpot(entry as PbaCandidate & { score?: number }));
    return {
      allNBA: [mythical.slice(0, 5), mythical.slice(5, 10), []] as [AllNBASpot[], AllNBASpot[], AllNBASpot[]],
      allDefense: [defense.slice(0, 5), []] as [AllNBASpot[], AllNBASpot[]],
      allRookie: [rookies.slice(0, 5), []] as [AllNBASpot[], AllNBASpot[]],
    };
  }, [fallback.bpc, localPbaPlayers, rookieCandidates, season, teamsWithRecords]);

  const selectedMeta = TAB_META[selectedTab];

  const pbaMipCandidates = useMemo(
    () => getPbaMostImprovedCandidates(state, localPbaPlayers, teamsWithRecords as any, season, { live: true }) as PbaCandidate[],
    [localPbaPlayers, season, state, teamsWithRecords],
  );

  const livePlayerCandidates = useMemo(() => {
    return {
      mvp: liveRaces.mvp as PbaCandidate[],
      roy: rookieCandidates,
      mip: pbaMipCandidates.length > 0 ? pbaMipCandidates : liveRaces.mip as PbaCandidate[],
      dpoy: liveRaces.dpoy as PbaCandidate[],
      mqm: liveRaces.smoy as PbaCandidate[],
    };
  }, [liveRaces, pbaMipCandidates, rookieCandidates]);

  const selectedWinnerLabel = (() => {
    if (selectedTab === 'coy') return coyRaces[0]?.coachName ?? 'No leader yet';
    if (selectedTab === 'allPBA') return 'Projected honor teams';
    if (selectedTab === 'bpc') return (fallback.bpc as Array<{ player: NBAPlayer }>)[0]?.player.name ?? 'No leader yet';
    if (selectedTab === 'bestImport') return (fallback.bestImport as Array<{ player: NBAPlayer }>)[0]?.player.name ?? 'No leader yet';
    return (livePlayerCandidates[selectedTab as Exclude<PbaTab, 'coy' | 'bpc'>] as PbaCandidate[])[0]?.player.name ?? 'No leader yet';
  })();

  React.useEffect(() => {
    if (!visibleTabs.includes(selectedTab)) setSelectedTab('mvp');
  }, [selectedTab, visibleTabs]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  const renderPlayerBoard = (candidates: PbaCandidate[], accentColor: 'indigo' | 'teal' | 'amber' | 'emerald' | 'rose' | 'violet' | 'sky' = 'indigo') => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {candidates.slice(0, 10).map((candidate, index) => {
        const isOwn = ownTid !== null && candidate.player.tid === ownTid;
        const gp = candidate.stats?.gp || 1;
        return (
          <div key={candidate.player.internalId} className={isOwn ? 'ring-2 ring-indigo-500/50 rounded-xl' : ''}>
            <RankedPersonCard
              rank={index + 1}
              portraitUrl={candidate.player.imgURL}
              face={(candidate.player as any).face}
              name={candidate.player.name}
              badge={candidate.player.pos}
              subtitle={`${candidate.team?.name ?? 'PBA'} · ${candidate.team ? `${candidate.team.wins}-${candidate.team.losses}` : '—'}`}
              teamLogoUrl={candidate.team?.logoUrl}
              stats={[
                { label: 'PTS', val: ((candidate.stats.pts ?? 0) / gp).toFixed(1) },
                { label: 'REB', val: (((candidate.stats.trb ?? ((candidate.stats.orb ?? 0) + (candidate.stats.drb ?? 0))) || 0) / gp).toFixed(1) },
                { label: 'AST', val: ((candidate.stats.ast ?? 0) / gp).toFixed(1) },
              ]}
              odds={candidate.odds}
              accentColor={accentColor}
              animDelay={index * 0.05}
              onClick={() => setViewingPlayer(candidate.player)}
            />
          </div>
        );
      })}
    </div>
  );

  const renderCoachBoard = (candidates: PbaCoachCandidate[]) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {candidates.slice(0, 10).map((candidate, index) => (
        <RankedPersonCard
          key={`${candidate.coachName}-${candidate.team.id}`}
          rank={index + 1}
          portraitUrl={candidate.coachPhotoUrl ?? getCoachPhoto(candidate.coachName)}
          name={candidate.coachName}
          subtitle={`${candidate.team.name} · ${candidate.wins}–${candidate.losses}`}
          teamLogoUrl={candidate.team.logoUrl}
          odds={candidate.odds}
          accentColor="teal"
          animDelay={index * 0.05}
        />
      ))}
    </div>
  );

  const AllPBASection: React.FC<{ label: string; color: string; teams: AllNBASpot[][]; names?: string[] }> = ({ label, color, teams, names }) => (
    <div className="mb-8">
      <h4 className={`text-xs font-black uppercase tracking-[0.2em] mb-3 ${color}`}>{label}</h4>
      {teams.map((team, ti) => (
        <div key={ti} className="mb-4">
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-2">
            {names?.[ti] ?? (ti === 0 ? '1st Team' : ti === 1 ? '2nd Team' : `Team ${ti + 1}`)}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {team.map((spot, si) => {
              const isOwn = ownTid !== null && spot.player.tid === ownTid;
              return (
                <div
                  key={`${spot.player.internalId}-${ti}-${si}`}
                  onClick={() => setViewingPlayer(spot.player)}
                  className={`group flex items-center gap-3 border rounded-xl p-3 cursor-pointer transition-all ${
                    isOwn
                      ? 'bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/40 hover:border-indigo-500/60'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-indigo-500/40'
                  }`}
                >
                  <PlayerPortrait
                    imgUrl={spot.player.imgURL}
                    face={(spot.player as any).face}
                    playerName={spot.player.name}
                    teamLogoUrl={spot.team.logoUrl}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-xs truncate group-hover:text-indigo-400 transition-colors"><PlayerNameWithHover player={spot.player}>{spot.player.name}</PlayerNameWithHover></p>
                    <p className="text-[10px] text-slate-500">{spot.pos} · {spot.team.abbrev}</p>
                    <p className="text-[10px] text-slate-600">{spot.team.wins}–{spot.team.losses}</p>
                  </div>
                  <StatPills
                    stats={[
                      { label: 'PTS', val: (spot.stats.pts / spot.stats.gp).toFixed(1) },
                      { label: 'REB', val: ((spot.stats.trb || (spot.stats.orb || 0) + (spot.stats.drb || 0)) / spot.stats.gp).toFixed(1) },
                      { label: 'AST', val: (spot.stats.ast / spot.stats.gp).toFixed(1) },
                    ]}
                    size="xs"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  if (!hasRegularSeasonSample) {
    return (
      <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
        <div className="p-6 bg-slate-900/50 border-b border-slate-800">
          <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <Trophy className="text-yellow-500" size={32} />
            PBA Award Races
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-500">
          No live sample yet. Once games are played, PBA projections will populate here.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      <div className="p-6 bg-slate-900/50 border-b border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <Trophy className="text-yellow-500" size={32} />
              PBA Award Races
            </h2>
            <p className="text-slate-400 text-sm mt-1">Live contenders alongside past PBA award winners.</p>
          </div>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar gap-0.5">
            {visibleTabs.map((key) => (
              <button
                key={key}
                onClick={() => setSelectedTab(key)}
                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex flex-col items-center gap-0.5 ${
                  selectedTab === key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                }`}
              >
                <span>{key === 'bestImport' ? 'BIMP' : key.toUpperCase()}</span>
                <span className={`text-[8px] font-bold ${selectedTab === key ? 'text-indigo-200' : 'text-slate-700'}`}>{TAB_META[key].title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/20 flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              {React.cloneElement(selectedMeta.icon, { size: 32 } as any)}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">{selectedMeta.title}</h3>
              <p className="text-slate-400">{selectedMeta.desc}</p>
            </div>
            <div className="ml-auto hidden md:flex flex-col items-end gap-1">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Season</span>
              <span className="text-lg font-black text-slate-300">{season}</span>
            </div>
          </div>

          <div className="space-y-6">
            {selectedTab === 'allPBA' ? (
              <div>
                <AllPBASection
                  label="PBA Mythical Teams"
                  color="text-amber-400"
                  teams={[honorTeams.allNBA[0] ?? [], honorTeams.allNBA[1] ?? []]}
                  names={['Mythical First Team', 'Mythical Second Team']}
                />
                <AllPBASection
                  label="PBA All-Defensive Team"
                  color="text-blue-400"
                  teams={[honorTeams.allDefense[0] ?? []]}
                  names={['All-Defensive Team']}
                />
                <AllPBASection
                  label="PBA All-Rookie Team"
                  color="text-emerald-400"
                  teams={[honorTeams.allRookie[0] ?? []]}
                  names={['All-Rookie Team']}
                />
              </div>
            ) : selectedTab === 'coy'
              ? renderCoachBoard(coyRaces as PbaCoachCandidate[])
              : selectedTab === 'bpc'
                ? renderPlayerBoard(fallback.bpc as PbaCandidate[])
                : selectedTab === 'bestImport'
                  ? renderPlayerBoard(fallback.bestImport as PbaCandidate[], 'sky')
                  : renderPlayerBoard(livePlayerCandidates[selectedTab as Exclude<PbaTab, 'coy' | 'bpc' | 'bestImport'>] ?? [])
            }

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Current Season Result</div>
              <div className="mb-3 text-sm text-slate-400">
                Current leader: <span className="text-white font-bold">{selectedWinnerLabel}</span>
              </div>
              {selectedTab === 'allPBA' ? (
                <div className="text-sm text-slate-500">This tab shows live projected honor teams. Current-season winners will appear in League History once the awards are written.</div>
              ) : currentHistory.length > 0 ? (
                <div className="space-y-2">
                  {currentHistory.map((award: any, index: number) => (
                    <div key={`${award.type}-${award.name}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/40 bg-slate-950/60 px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white truncate">{award.name}</div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-500">{award.team || award.conference || award.source || award.type}</div>
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">{award.type}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">Final winner has not been announced yet.</div>
              )}
            </div>
          </div>

          <div className="mt-12 p-4 rounded-xl bg-slate-900/30 border border-slate-800/50 flex items-start gap-3">
            <Info size={18} className="text-slate-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Live rankings are projections. Final winners appear here after the awards are written.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
