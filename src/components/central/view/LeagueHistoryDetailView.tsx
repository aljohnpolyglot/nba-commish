import React, { useMemo, useState, useEffect } from 'react';
import { useGame } from '../../../store/GameContext';
import { ChevronLeft, Trophy, Shield, Zap, Star, Loader } from 'lucide-react';
import { getStatValue, StatCategory } from '../../../utils/statUtils';
import { RankedPersonCard } from '../../shared/ui';
import { useBRefSeason, getAllCachedSeasons, matchTeamByWikiName, generateAbbrev } from '../../../data/brefFetcher';
import type { BRefSeasonData } from '../../../data/brefFetcher';
import { fetchCoachData, getCoachPhoto } from '../../../data/photos/coaches';
import { PlayerBioView } from './PlayerBioView';
import type { NBAPlayer } from '../../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function aggregateSeason(player: any, season: number) {
  const rows = (player.stats ?? []).filter(
    (s: any) => Number(s.season) === Number(season) && !s.playoffs && (s.tid ?? -1) >= 0,
  );
  if (!rows.length) return null;
  const tot = rows.reduce((acc: any, s: any) => ({
    gp:  acc.gp  + (s.gp  ?? 0),
    fg:  acc.fg  + (s.fg  ?? 0), fga: acc.fga + (s.fga ?? 0),
    tp:  acc.tp  + (s.tp  ?? 0), tpa: acc.tpa + (s.tpa ?? 0),
    ft:  acc.ft  + (s.ft  ?? 0), fta: acc.fta + (s.fta ?? 0),
    orb: acc.orb + (s.orb ?? 0), drb: acc.drb + (s.drb ?? 0),
    trb: acc.trb + ((s.trb || s.reb || (s.orb ?? 0) + (s.drb ?? 0)) ?? 0),
    ast: acc.ast + (s.ast ?? 0), stl: acc.stl + (s.stl ?? 0),
    blk: acc.blk + (s.blk ?? 0), tov: acc.tov + (s.tov ?? 0),
    pf:  acc.pf  + (s.pf  ?? 0), pts: acc.pts + (s.pts ?? 0),
    min: acc.min + (s.min ?? 0),
    per: acc.per > 0 ? acc.per : (s.per ?? 0),
  }), { gp:0,fg:0,fga:0,tp:0,tpa:0,ft:0,fta:0,orb:0,drb:0,trb:0,ast:0,stl:0,blk:0,tov:0,pf:0,pts:0,min:0,per:0 });
  const primaryRow = rows.reduce((a: any, b: any) => (a.gp >= b.gp ? a : b));
  return { ...tot, primaryTid: primaryRow.tid };
}

function fmt(v: number, dec = 1) { return v.toFixed(dec); }

interface LeaderEntry { player: any; agg: any; value: number; team: any }

function getLeaders(
  players: any[], teams: any[], season: number,
  cat: StatCategory, n: number, minGP: number,
): LeaderEntry[] {
  const out: LeaderEntry[] = [];
  for (const p of players) {
    const agg = aggregateSeason(p, season);
    if (!agg || agg.gp < minGP) continue;
    const value = getStatValue(agg, cat);
    if (value <= 0) continue;
    const team = teams.find((t: any) => t.id === agg.primaryTid);
    out.push({ player: p, agg, value, team });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Mini award winner card — rank shows cumulative win count */
const AwardWinner: React.FC<{ label: string; award: any; isCurrent: boolean; winCount?: number; onClick?: () => void }> = ({ label, award, isCurrent, winCount = 1, onClick }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</div>
    {award ? (
      <RankedPersonCard
        rank={winCount}
        portraitUrl={award.imgURL}
        name={award.name}
        subtitle={award.team}
        teamLogoUrl={award.teamLogoUrl}
        stats={award.statLine ? [
          { label: 'PPG', val: award.statLine.split(' / ')[0] ?? '' },
          { label: 'RPG', val: award.statLine.split(' / ')[1] ?? '' },
          { label: 'APG', val: award.statLine.split(' / ')[2] ?? '' },
        ] : undefined}
        accentColor="amber"
        animDelay={0}
        onClick={onClick}
      />
    ) : (
      <div className="flex items-center gap-2 py-2 opacity-40">
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
          <Trophy size={16} className="text-slate-600" />
        </div>
        <span className="text-sm italic text-slate-600">{isCurrent ? 'TBA' : '—'}</span>
      </div>
    )}
  </div>
);

/** Coach of the Year — uses RankedPersonCard for consistent card sizing */
const COYWinner: React.FC<{ award: any; isCurrent: boolean; winCount?: number }> = ({ award, isCurrent, winCount = 1 }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">COY</div>
    {award ? (
      <RankedPersonCard
        rank={winCount}
        portraitUrl={award.imgURL}
        name={award.name}
        subtitle={award.team}
        teamLogoUrl={award.teamLogoUrl}
        accentColor="amber"
        animDelay={0}
      />
    ) : (
      <div className="flex items-center gap-2 py-2 opacity-40">
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
          <Trophy size={16} className="text-slate-600" />
        </div>
        <span className="text-sm italic text-slate-600">{isCurrent ? 'TBA' : '—'}</span>
      </div>
    )}
  </div>
);

/** All-NBA / All-Defensive / All-Rookie section */
const AllTeamSection: React.FC<{
  label: string; icon: React.ReactNode; iconColor: string;
  teams: { name: string; players: any[] }[];
  onPlayerClick?: (p: any) => void;
  showCount?: boolean;
}> = ({ label, icon, iconColor, teams, onPlayerClick, showCount = false }) => {
  const hasAny = teams.some(t => t.players.length > 0);
  if (!hasAny) return null;
  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 ${iconColor}`}>
        {icon}
        <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="space-y-4">
        {teams.map(({ name, players }) =>
          players.length === 0 ? null : (
            <div key={name}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">{name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                {players.map((p, i) => (
                  <div key={i}
                    className={`flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 transition-colors ${onPlayerClick ? 'cursor-pointer hover:border-slate-600 hover:bg-slate-800/60' : ''}`}
                    onClick={() => onPlayerClick && onPlayerClick(p)}
                  >
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                      <img
                        src={p.imgURL ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1e293b&color=94a3b8`}
                        alt={p.name} className="w-full h-full object-cover object-top"
                        referrerPolicy="no-referrer" />
                      {p.teamLogoUrl && (
                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-white rounded-tl-lg flex items-center justify-center">
                          <img src={p.teamLogoUrl} alt="" className="w-3.5 h-3.5 object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">{p.team}</div>
                    </div>
                    {showCount && (p.count ?? 0) > 0 && (
                      <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                        {p.count}×
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props { season: number; onBack: () => void }

export const LeagueHistoryDetailView: React.FC<Props> = ({ season, onBack }) => {
  const { state } = useGame();
  const currentSeason = state.leagueStats.year;
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [coachPhotosReady, setCoachPhotosReady] = useState(false);
  useEffect(() => { fetchCoachData().then(() => setCoachPhotosReady(true)); }, []);
  const [notFoundName, setNotFoundName] = useState<string | null>(null);
  const isCurrent = season === currentSeason;
  const minGP = isCurrent ? 15 : 20;

  // ── Split historicalAwards by schema (same logic as LeagueHistoryView) ────
  // BBGM: { season, mvp:{…}, dpoy:{…} } — no 'type' field, one per season
  // AutoResolver: { season, type:'MVP', name, pid, tid } — flat, many per season
  const awardsAll = (state.historicalAwards as any[]) ?? [];
  const bbgmRecord: any = awardsAll.find(
    a => Number(a.season) === Number(season) && !a.type
  );
  const flatAwards: any[] = awardsAll.filter(
    a => Number(a.season) === Number(season) && !!a.type
  );
  const flat = (type: string) => flatAwards.find(a => a.type === type) ?? null;

  // ── Wikipedia data hook — always fetch for historical seasons ────────────────
  const { data: bref, loading: brefLoading } = useBRefSeason(!isCurrent ? season : null);

  // Player lookup: string pid = internalId (autoResolver), then name fallback
  const findPlayer = (a: any) => {
    if (!a) return undefined;
    if (a.pid && typeof a.pid === 'string') {
      const byId = state.players.find((p: any) => p.internalId === a.pid);
      if (byId) return byId;
    }
    return state.players.find((p: any) => p.name === a.name)
      ?? state.players.find((p: any) => p.name?.toLowerCase() === a.name?.toLowerCase?.());
  };

  const avatarFallback = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=94a3b8`;

  const getDetailAwardObj = (a: any) => {
    if (!a) return null;
    const team = state.teams.find((t: any) => t.id === a.tid);
    const player = findPlayer(a);
    const agg = player ? aggregateSeason(player, season) : null;
    const statLine = agg && agg.gp > 0
      ? `${fmt(getStatValue(agg, 'PTS'))} / ${fmt(getStatValue(agg, 'REB'))} / ${fmt(getStatValue(agg, 'AST'))}`
      : '';
    return {
      name: a.name, team: team?.abbrev ?? 'FA',
      imgURL: player?.imgURL ?? avatarFallback(a.name),
      teamLogoUrl: team?.logoUrl, statLine,
    };
  };

  // Resolve each award from either schema
  const getAwardEntry = (bbgmKey: string, flatType: string) =>
    flat(flatType) ?? bbgmRecord?.[bbgmKey] ?? null;

  const awards: Record<string, any> = {
    mvp:       getDetailAwardObj(getAwardEntry('mvp',       'MVP')),
    dpoy:      getDetailAwardObj(getAwardEntry('dpoy',      'DPOY')),
    smoy:      getDetailAwardObj(getAwardEntry('smoy',      'SMOY')),
    mip:       getDetailAwardObj(getAwardEntry('mip',       'MIP')),
    roy:       getDetailAwardObj(getAwardEntry('roy',       'ROY')),
    finalsMvp: getDetailAwardObj(getAwardEntry('finalsMvp', 'Finals MVP')),
    coy:       getDetailAwardObj(getAwardEntry('coy',       'COY')),
  };

  // ── Wikipedia fallback for missing awards ─────────────────────────────────
  // Called after bref loads (async re-render fills gaps state.historicalAwards doesn't have)
  const makeBrefAward = (a: { name: string; team: string } | undefined) => {
    if (!a?.name) return null;
    const nl = a.name.toLowerCase();
    const player = state.players.find((p: any) =>
      p.name?.toLowerCase() === nl
    );
    const team = matchTeamByWikiName(a.team, state.teams as any[]) as any;
    const agg = player ? aggregateSeason(player, season) : null;
    const teamDisplay = team?.abbrev ?? (a.team ? generateAbbrev(a.team) : '');
    return {
      name: a.name, team: teamDisplay,
      imgURL: player?.imgURL ?? avatarFallback(a.name),
      teamLogoUrl: team?.logoUrl,
      statLine: agg && agg.gp > 0
        ? `${fmt(getStatValue(agg, 'PTS'))} / ${fmt(getStatValue(agg, 'REB'))} / ${fmt(getStatValue(agg, 'AST'))}`
        : '',
    };
  };
  if (bref) {
    if (!awards.mvp)       awards.mvp       = makeBrefAward(bref.mvp);
    if (!awards.dpoy)      awards.dpoy      = makeBrefAward(bref.dpoy);
    if (!awards.smoy)      awards.smoy      = makeBrefAward(bref.smoy);
    if (!awards.mip)       awards.mip       = makeBrefAward(bref.mip);
    if (!awards.roy)       awards.roy       = makeBrefAward(bref.roy);
    if (!awards.finalsMvp) awards.finalsMvp = makeBrefAward(bref.finalsMvp);
    if (!awards.coy)       awards.coy       = makeBrefAward(bref.coy);
  }
  // Coach photo — coaches are not in state.players so need dedicated photo lookup
  if (awards.coy && coachPhotosReady) {
    const photo = getCoachPhoto(awards.coy.name);
    if (photo) awards.coy = { ...awards.coy, imgURL: photo };
  }

  // ── Champion / Runner Up ───────────────────────────────────────────────────
  const champAward  = flat('Champion');
  const runnerAward = flat('Runner Up');

  const champTeam: any = (() => {
    if (champAward) return state.teams.find((t: any) => t.id === champAward.tid);
    
    // BBGM Native Way: Find by playoffRoundsWon
    let best: any = null; let maxR = -1;
    state.teams.forEach((t: any) => {
      const ts = t.seasons?.find((s: any) => Number(s.season) === Number(season));
      if ((ts?.playoffRoundsWon ?? -1) > maxR) { maxR = ts?.playoffRoundsWon ?? -1; best = t; }
    });
    if (maxR > 0) return best; // > 0 means playoffs actually happened

    // Derive from Finals MVP team
    if (awards.finalsMvp) {
      for (const p of state.players) {
        const hit = p.awards?.find((a: any) => Number(a.season) === Number(season) && a.type === 'Finals MVP');
        if (hit) {
          const stats = p.stats?.filter((s: any) => Number(s.season) === Number(season) && !s.playoffs && (s.tid ?? -1) >= 0) ?? [];
          const tid = stats.length ? stats.reduce((pr: any, cu: any) => pr.gp >= cu.gp ? pr : cu).tid : p.tid;
          return state.teams.find((t: any) => t.id === tid) ?? null;
        }
      }
    }
    // Wikipedia fallback (franchise-merge aware)
    if (bref?.champion) {
      return (matchTeamByWikiName(bref.champion.name, state.teams as any[]) as any) ?? null;
    }
    return null;
  })();

  const runnerUpTeam: any = (() => {
    if (runnerAward) return state.teams.find((t: any) => t.id === runnerAward.tid);
    
    // BBGM Native Way: Runner up won 1 less round than the max
    let maxR = -1;
    state.teams.forEach((t: any) => {
      const ts = t.seasons?.find((s: any) => Number(s.season) === Number(season));
      if ((ts?.playoffRoundsWon ?? -1) > maxR) { maxR = ts?.playoffRoundsWon ?? -1; }
    });
    if (maxR > 0) {
      let runner: any = null;
      state.teams.forEach((t: any) => {
        const ts = t.seasons?.find((s: any) => Number(s.season) === Number(season));
        if (ts?.playoffRoundsWon === maxR - 1) runner = t;
      });
      return runner;
    }
    // Wikipedia fallback (franchise-merge aware)
    if (bref?.runnerUp) {
      return (matchTeamByWikiName(bref.runnerUp.name, state.teams as any[]) as any) ?? null;
    }
    return null;
  })();

  const champRecord  = champTeam?.seasons?.find((s: any) => Number(s.season) === Number(season));
  const ruRecord     = runnerUpTeam?.seasons?.find((s: any) => Number(s.season) === Number(season));

  // ── All-league teams ───────────────────────────────────────────────────────
  // BBGM has allLeague nested; autoResolver stores flat 'All-NBA First Team' entries
  const hasAllLeague = !!bbgmRecord?.allLeague
    || flatAwards.some(a => a.type?.startsWith('All-NBA') || a.type?.startsWith('All-Defensive') || a.type?.startsWith('All-Rookie'));

  // Helper to map player arrays to UI — works for both schemas
  const resolveTeamArray = (playersArray: any[]) => {
    if (!playersArray) return [];
    return playersArray.map((a: any) => {
      const team = state.teams.find((t: any) => t.id === a.tid);
      const player = findPlayer(a);
      return {
        name: a.name,
        team: team?.abbrev ?? 'FA',
        imgURL: player?.imgURL ?? avatarFallback(a.name),
        teamLogoUrl: team?.logoUrl,
        playerRef: player ?? null,
      };
    });
  };

  // Build flat autoResolver All-NBA/Defense/Rookie into the same structure
  const buildFlatTeams = (prefix: string, teamNames: string[]) => {
    return teamNames.map(tname => {
      const fullType = `${prefix} ${tname}`;
      const entries = flatAwards.filter(a => a.type === fullType);
      return { name: tname, players: resolveTeamArray(entries) };
    }).filter(t => t.players.length > 0);
  };

  // ── Player click helper ───────────────────────────────────────────────────────
  const handlePlayerClick = (awardEntry: any) => {
    const p = findPlayer(awardEntry);
    if (p) {
      setViewingPlayer(p as NBAPlayer);
    } else if (awardEntry?.name) {
      // Historical legend not in state.players — build a minimal stub so
      // PlayerBioView can still fetch their bio via the NBA ID lookup (NAME_TO_ID).
      const stub: NBAPlayer = {
        internalId: `hist-${(awardEntry.name as string).replace(/\s+/g, '-')}`,
        name: awardEntry.name,
        tid: -1,
        overallRating: 0,
        ratings: [],
        stats: [],
        imgURL: undefined,
        pos: 'G',
        status: undefined,
        hof: false,
        injury: { type: 'Healthy', gamesRemaining: 0 },
      };
      setViewingPlayer(stub);
    } else {
      setNotFoundName(awardEntry?.name ?? 'Player');
    }
  };

  // (bref hook moved — see declaration above awards)

  // ── Stat leaders ───────────────────────────────────────────────────────────
  const leaders = useMemo(() => ({
    pts: getLeaders(state.players, state.teams, season, 'PTS', 1, minGP),
    reb: getLeaders(state.players, state.teams, season, 'REB', 1, minGP),
    ast: getLeaders(state.players, state.teams, season, 'AST', 1, minGP),
    stl: getLeaders(state.players, state.teams, season, 'STL', 1, minGP),
    blk: getLeaders(state.players, state.teams, season, 'BLK', 1, minGP),
    tpm: getLeaders(state.players, state.teams, season, '3PM', 1, minGP),
    per: getLeaders(state.players, state.teams, season, 'PER', 1, minGP),
  }), [state.players, state.teams, season, minGP]);

  // All-Stars: current season uses state.allStar; historical uses player.awards[]
  const allStarRoster = useMemo(() => {
    if (isCurrent && state.allStar?.roster?.length) return state.allStar.roster;
    // Historical: collect players with 'All-Star' award that season
    const list: { playerId: string; playerName: string; teamAbbrev: string; conference: string; isStarter?: boolean }[] = [];
    const seen = new Set<string>();
    for (const p of state.players) {
      const hit = p.awards?.find((a: any) => Number(a.season) === Number(season) && a.type === 'All-Star');
      if (!hit || seen.has(p.internalId)) continue;
      seen.add(p.internalId);
      const stats = p.stats?.filter((s: any) => Number(s.season) === Number(season) && !s.playoffs && (s.tid ?? -1) >= 0) ?? [];
      const tid = stats.length ? stats.reduce((pr: any, cu: any) => pr.gp >= cu.gp ? pr : cu).tid : p.tid;
      const team = state.teams.find((t: any) => t.id === tid);
      list.push({
        playerId: p.internalId,
        playerName: p.name,
        teamAbbrev: team?.abbrev ?? '—',
        conference: team?.conference ?? 'East',
        isStarter: (hit as any).isStarter ?? false,
      });
    }
    return list.length ? list : null;
  }, [isCurrent, state.allStar, state.players, state.teams, season]);

  // Best records per conference — state seasons data, bref fallback
  const bestRecords = useMemo(() => {
    const byConf: Record<string, { team: any; ts: any }[]> = {};
    state.teams.forEach((t: any) => {
      const ts = t.seasons?.find((s: any) => Number(s.season) === Number(season));
      if (!ts || ts.won === undefined) return;
      const conf = t.conference ?? 'Unknown';
      if (!byConf[conf]) byConf[conf] = [];
      byConf[conf].push({ team: t, ts });
    });
    const result: { conference: string; team: any; ts: any }[] = [];
    for (const [conf, entries] of Object.entries(byConf)) {
      if (!entries.length) continue;
      const best = entries.sort((a, b) => b.ts.won - a.ts.won)[0];
      result.push({ conference: conf, ...best });
    }
    // Bref fallback when state seasons are empty (pre-load saved games)
    if (result.length === 0 && bref?.bestRecords?.length) {
      bref.bestRecords.forEach(br => {
        const team = matchTeamByWikiName(br.name, state.teams as any[]) as any;
        if (team) result.push({
          conference: br.conference.replace('ern', ''),
          team,
          ts: { won: br.wins, lost: br.losses },
        });
      });
    }
    return result.sort((a, b) => a.conference.localeCompare(b.conference));
  }, [state.teams, season, bref]);

  // Semifinals MVPs — from BBGM sfmvp array or flat 'Semifinals MVP' entries
  const semifinalsMvps = useMemo(() => {
    const entries: any[] =
      bbgmRecord?.sfmvp ??
      flatAwards.filter(a => a.type === 'Semifinals MVP' || a.type === 'Conference Finals MVP') ??
      [];
    return entries.map((a: any) => {
      const team = state.teams.find((t: any) => t.id === a.tid);
      const player = findPlayer(a);
      const agg = player ? aggregateSeason(player, season) : null;
      return {
        name: a.name, team: team?.abbrev ?? '—',
        imgURL: player?.imgURL ?? avatarFallback(a.name),
        teamLogoUrl: team?.logoUrl,
        playerRef: player ?? null,
        statLine: agg && agg.gp > 0
          ? `${fmt(getStatValue(agg, 'PTS'))} pts, ${fmt(getStatValue(agg, 'REB'))} trb, ${fmt(getStatValue(agg, 'AST'))} ast`
          : '',
      };
    });
  }, [bbgmRecord, flatAwards, state.teams, state.players, season]);

  // ── Cumulative award win counts (up to and including this season) ─────────
  const awardCounts = useMemo(() => {
    const prior = awardsAll.filter(a => Number(a.season) <= Number(season));

    const countForPlayer = (name: string | undefined, flatType: string, bbgmKey: string): number => {
      if (!name) return 1;
      return Math.max(1, prior.reduce((cnt, a) => {
        if (a.type) return cnt + (a.type === flatType && a.name === name ? 1 : 0);
        return cnt + (a[bbgmKey]?.name === name ? 1 : 0);
      }, 0));
    };

    const countChamp = (teamId: number | undefined): number => {
      if (teamId == null) return 1;
      const champSeasons = new Set<number>();
      // Flat autoResolver 'Champion' awards (current sim seasons)
      for (const a of prior) {
        if (a.type === 'Champion' && a.tid === teamId) champSeasons.add(Number(a.season));
      }
      // Wikipedia cache — all 79 historical seasons (populated after first fetch)
      for (const [yr, brefData] of getAllCachedSeasons().entries()) {
        if (yr > Number(season)) continue;
        if (!brefData.champion?.name) continue;
        const matched = matchTeamByWikiName(brefData.champion.name, state.teams as any[]);
        if (matched && (matched as any).id === teamId) champSeasons.add(yr);
      }
      return Math.max(champSeasons.size, 1);
    };

    const countAllStar = (playerName: string | undefined): number => {
      if (!playerName) return 1;
      let cnt = 0;
      for (const p of state.players) {
        if (p.name !== playerName) continue;
        for (const a of (p.awards ?? [])) {
          if (a.type === 'All-Star' && Number(a.season) <= Number(season)) cnt++;
        }
      }
      return Math.max(cnt, 1);
    };

    const countAllNBA = (playerName: string | undefined): number => {
      if (!playerName) return 1;
      let cnt = 0;
      for (const a of prior) {
        if (a.type) {
          if (a.name === playerName && /^All-NBA/.test(a.type)) cnt++;
        } else {
          for (const team of (a.allLeague ?? [])) {
            if ((team.players ?? []).some((p: any) => p.name === playerName)) cnt++;
          }
        }
      }
      return Math.max(cnt, 1);
    };

    const countAllDef = (playerName: string | undefined): number => {
      if (!playerName) return 1;
      let cnt = 0;
      for (const a of prior) {
        if (a.type) {
          if (a.name === playerName && /^All-Defensive/.test(a.type)) cnt++;
        } else {
          for (const team of (a.allDefensive ?? [])) {
            if ((team.players ?? []).some((p: any) => p.name === playerName)) cnt++;
          }
        }
      }
      return Math.max(cnt, 1);
    };

    const countRunnerUp = (teamId: number | undefined): number => {
      if (teamId == null) return 1;
      const ruSeasons = new Set<number>();
      // Flat autoResolver 'Runner Up' awards
      for (const a of prior) {
        if (a.type === 'Runner Up' && a.tid === teamId) ruSeasons.add(Number(a.season));
      }
      // Wikipedia cache — match by franchise-merge-aware lookup
      const team = state.teams.find((t: any) => t.id === teamId);
      if (team) {
        for (const [yr, brefData] of getAllCachedSeasons().entries()) {
          if (yr > Number(season)) continue;
          if (!brefData.runnerUp?.name) continue;
          const matched = matchTeamByWikiName(brefData.runnerUp.name, state.teams as any[]);
          if (matched && (matched as any).id === teamId) ruSeasons.add(yr);
        }
      }
      return Math.max(ruSeasons.size, 1);
    };

    return { countForPlayer, countChamp, countRunnerUp, countAllStar, countAllNBA, countAllDef };
  }, [awardsAll, season, state.players, state.teams, bref]); // bref triggers re-run after wiki data loads

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer as any} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

        {/* Not-found toast */}
        {notFoundName && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
            <span>Records not available for <span className="text-white">{notFoundName}</span></span>
            <button onClick={() => setNotFoundName(null)} className="text-slate-500 hover:text-white ml-1">✕</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors shrink-0">
            <ChevronLeft size={16} /> League History
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            {season - 1}–{String(season).slice(-2)} Season
            {isCurrent && (
              <span className="text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                In Progress
              </span>
            )}
          </h2>
        </div>

        {/* ── Champion Hero ─────────────────────────────────────────────────── */}
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
                  {champTeam.logoUrl && (
                    <img src={champTeam.logoUrl} alt={champTeam.abbrev}
                      className="w-20 h-20 object-contain drop-shadow-xl shrink-0"
                      referrerPolicy="no-referrer" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-amber-400">
                        {champTeam.name}
                      </span>
                      {(() => {
                        const cnt = awardCounts.countChamp(champTeam.id);
                        return (
                          <span className="text-xs font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            {cnt}×
                          </span>
                        );
                      })()}
                    </div>
                    {champRecord && (
                      <div className="text-slate-400 font-semibold text-sm">{champRecord.won}-{champRecord.lost}</div>
                    )}
                    {awards.finalsMvp && (
                      <div
                        className="flex items-center gap-2 mt-2 bg-slate-800/60 rounded-lg px-2.5 py-1.5 w-fit cursor-pointer hover:bg-slate-700/60 transition-colors"
                        onClick={() => handlePlayerClick(getAwardEntry('finalsMvp', 'Finals MVP'))}
                      >
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-700 shrink-0">
                          <img src={awards.finalsMvp.imgURL ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(awards.finalsMvp.name)}&background=1e293b&color=fff`}
                            alt={awards.finalsMvp.name} className="w-full h-full object-cover object-top"
                            referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <div className="text-[9px] text-amber-500 uppercase font-black tracking-wider">Finals MVP</div>
                          <div className="text-sm font-bold text-white">{awards.finalsMvp.name}</div>
                          {awards.finalsMvp.statLine && (
                            <div className="text-[10px] text-slate-400">{awards.finalsMvp.statLine}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 italic text-sm">
                  {isCurrent ? 'Season in progress — champion TBD' : 'Champion data not available'}
                </p>
              )}
            </div>

            {/* Runner-Up */}
            {runnerUpTeam && (
              <div className="md:border-l md:border-slate-700/50 md:pl-6">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Runner-Up</div>
                <div className="flex items-center gap-3">
                  {runnerUpTeam.logoUrl && (
                    <img src={runnerUpTeam.logoUrl} alt={runnerUpTeam.abbrev}
                      className="w-12 h-12 object-contain opacity-50 shrink-0" referrerPolicy="no-referrer" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-slate-300">{runnerUpTeam.name}</span>
                      {(() => {
                        const cnt = awardCounts.countRunnerUp(runnerUpTeam.id);
                        return (
                          <span className="text-[9px] font-black text-slate-400 bg-slate-700/50 border border-slate-600/30 px-1.5 py-0.5 rounded-full">
                            {cnt}× Finals
                          </span>
                        );
                      })()}
                    </div>
                    {ruRecord && <div className="text-sm text-slate-500">{ruRecord.won}-{ruRecord.lost}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Season Awards ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={13} className="text-slate-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Season Awards</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <AwardWinner label="MVP"  award={awards.mvp}  isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.mvp?.name,  'MVP',       'mvp')}  onClick={() => handlePlayerClick(getAwardEntry('mvp',  'MVP'))} />
            <AwardWinner label="DPOY" award={awards.dpoy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.dpoy?.name, 'DPOY',      'dpoy')} onClick={() => handlePlayerClick(getAwardEntry('dpoy', 'DPOY'))} />
            <COYWinner                award={awards.coy}  isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.coy?.name,  'COY',       'coy')} />
            <AwardWinner label="SMOY" award={awards.smoy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.smoy?.name, 'SMOY',      'smoy')} onClick={() => handlePlayerClick(getAwardEntry('smoy', 'SMOY'))} />
            <AwardWinner label="MIP"  award={awards.mip}  isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.mip?.name,  'MIP',       'mip')}  onClick={() => handlePlayerClick(getAwardEntry('mip',  'MIP'))} />
            <AwardWinner label="ROY"  award={awards.roy}  isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.roy?.name,  'ROY',       'roy')}  onClick={() => handlePlayerClick(getAwardEntry('roy',  'ROY'))} />
          </div>
        </div>

        {/* ── Stat Leaders ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-slate-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Stat Leaders
              <span className="ml-2 text-slate-600 font-normal normal-case text-[10px]">min {minGP} GP</span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {([
              { key: 'pts', title: 'Scoring',   unit: 'PPG', cat: 'PTS' as StatCategory },
              { key: 'reb', title: 'Rebounds',  unit: 'RPG', cat: 'REB' as StatCategory },
              { key: 'ast', title: 'Assists',   unit: 'APG', cat: 'AST' as StatCategory },
              { key: 'stl', title: 'Steals',    unit: 'SPG', cat: 'STL' as StatCategory },
              { key: 'blk', title: 'Blocks',    unit: 'BPG', cat: 'BLK' as StatCategory },
              { key: 'tpm', title: '3-Pointers', unit: '3PM', cat: '3PM' as StatCategory },
              { key: 'per', title: 'PER',       unit: 'PER', cat: 'PER' as StatCategory },
            ] as const).map(({ key, title, unit, cat }) => (
              <LeaderColumnWithSeason
                key={key}
                title={title} unit={unit}
                leaders={(leaders as any)[key]}
                cat={cat}
                isCurrent={isCurrent}
                season={season}
                onPlayerClick={p => setViewingPlayer(p as NBAPlayer)}
              />
            ))}
          </div>
        </div>

        {/* ── All-League Teams ──────────────────────────────────────────────── */}
        {brefLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
            <Loader size={14} className="animate-spin" />
            Loading season data…
          </div>
        ) : (hasAllLeague || bref) && (() => {
          // Helper to stamp cumulative count onto each player object
          const withCounts = (teams: { name: string; players: any[] }[], countFn: (name: string) => number) =>
            teams.map(t => ({ ...t, players: t.players.map(p => ({ ...p, count: countFn(p.name) })) }));

          // BBGM nested format
          const allNBATeams = withCounts(
            bbgmRecord?.allLeague
              ? [
                  { name: '1st Team', players: resolveTeamArray(bbgmRecord.allLeague[0]?.players) },
                  { name: '2nd Team', players: resolveTeamArray(bbgmRecord.allLeague[1]?.players) },
                  { name: '3rd Team', players: resolveTeamArray(bbgmRecord.allLeague[2]?.players) },
                ]
              : buildFlatTeams('All-NBA', ['First Team', 'Second Team', 'Third Team']),
            name => awardCounts.countAllNBA(name),
          );

          const allDefTeams = withCounts(
            bbgmRecord?.allDefensive
              ? [
                  { name: '1st Team', players: resolveTeamArray(bbgmRecord.allDefensive[0]?.players) },
                  { name: '2nd Team', players: resolveTeamArray(bbgmRecord.allDefensive[1]?.players) },
                ]
              : buildFlatTeams('All-Defensive', ['First Team', 'Second Team']),
            name => awardCounts.countAllDef(name),
          );

          // All-Rookie: no counts
          const allRookieTeams = bbgmRecord?.allRookie
            ? [{ name: '1st Team', players: resolveTeamArray(bbgmRecord.allRookie) }]
            : buildFlatTeams('All-Rookie', ['First Team', 'Second Team']);

          // Bref fallback when no state data and no flat entries
          const brefTeams = (section: any[], brefData: any[]) =>
            section.some(t => t.players.length) ? section :
            (brefData ?? []).map(t => ({
              name: t.teamName,
              players: t.players.map((p: any) => {
                const player = state.players.find(sp => sp.name === p.name);
                const team = state.teams.find(st => st.abbrev === p.team || st.name?.endsWith(p.team));
                return {
                  name: p.name, team: p.team,
                  imgURL: player?.imgURL ?? avatarFallback(p.name),
                  teamLogoUrl: team?.logoUrl,
                };
              }),
            }));

          const handleAllTeamPlayerClick = (p: any) => {
            if (p.playerRef) { setViewingPlayer(p.playerRef as NBAPlayer); }
            else { setNotFoundName(p.name ?? 'Player'); }
          };
          return (
            <div className="space-y-6">
              <AllTeamSection label="All-NBA"       icon={<Trophy size={12} />} iconColor="text-amber-400" teams={brefTeams(allNBATeams,    bref?.allNBA      ?? [])} onPlayerClick={handleAllTeamPlayerClick} showCount />
              <AllTeamSection label="All-Defensive" icon={<Shield size={12} />} iconColor="text-blue-400"  teams={brefTeams(allDefTeams,    bref?.allDefensive ?? [])} onPlayerClick={handleAllTeamPlayerClick} showCount />
              <AllTeamSection label="All-Rookie"    icon={<Zap    size={12} />} iconColor="text-green-400" teams={brefTeams(allRookieTeams, bref?.allRookie    ?? [])} onPlayerClick={handleAllTeamPlayerClick} />
            </div>
          );
        })()}

        {/* ── Best Records ─────────────────────────────────────────────────── */}
        {bestRecords.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star size={13} className="text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Best Records</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {bestRecords.map(({ conference, team, ts }) => {
                const wins = ts.won ?? 0;
                const losses = ts.lost ?? 0;
                const total = wins + losses || 82;
                const pct = (wins / total * 100).toFixed(0);
                return (
                  <div key={conference} className="relative bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center gap-4 overflow-hidden transition-colors">
                    {/* Faint logo watermark */}
                    {team.logoUrl && (
                      <img src={team.logoUrl} alt="" aria-hidden
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-16 h-16 object-contain opacity-[0.06] pointer-events-none"
                        referrerPolicy="no-referrer" />
                    )}
                    {/* Logo */}
                    <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      {team.logoUrl
                        ? <img src={team.logoUrl} alt={team.abbrev} className="w-11 h-11 object-contain" referrerPolicy="no-referrer" />
                        : <span className="text-lg font-black text-slate-600">{team.abbrev}</span>
                      }
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5">
                        {conference === 'East' || conference === 'Eastern' ? 'Eastern' : 'Western'} Conference
                      </div>
                      <div className="text-base font-black text-white truncate leading-tight">
                        {team.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xl font-black font-mono text-emerald-400">{wins}–{losses}</span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">.{pct}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Semifinals MVPs ───────────────────────────────────────────────── */}
        {semifinalsMvps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={13} className="text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Semifinals MVPs</span>
            </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {semifinalsMvps.map((m: any, i: number) => (
                <RankedPersonCard
                  key={i}
                  rank={i + 1}
                  portraitUrl={m.imgURL}
                  name={m.name}
                  subtitle={`${m.team}${m.statLine ? ` · ${m.statLine}` : ''}`}
                  teamLogoUrl={m.teamLogoUrl}
                  accentColor="indigo"
                  animDelay={i * 0.04}
                  onClick={() => {
                    if (m.playerRef) { setViewingPlayer(m.playerRef as NBAPlayer); }
                    else { setNotFoundName(m.name); }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── All-Stars ─────────────────────────────────────────────────────── */}
        {allStarRoster?.length ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star size={13} className="text-amber-400 fill-amber-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                All-Stars ({allStarRoster.length})
              </span>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {['East', 'West'].map(conf => {
                const roster = allStarRoster.filter((r: any) =>
                  r.conference === conf || r.conference === `${conf}ern` || r.conference?.startsWith(conf));
                if (!roster.length) return null;
                return (
                  <div key={conf}>
                    <div className={`text-xs font-black uppercase tracking-wide mb-2 ${conf === 'East' ? 'text-blue-400' : 'text-red-400'}`}>
                      {conf}
                    </div>
                    <div className="space-y-1.5">
                      {roster.map((r: any) => {
                        const p = state.players.find((pl: any) => pl.internalId === r.playerId);
                        return (
                          <div key={r.playerId}
                            className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-2.5 py-1.5 border border-slate-800 cursor-pointer hover:border-slate-600 hover:bg-slate-800/60 transition-colors"
                            onClick={() => p ? setViewingPlayer(p as NBAPlayer) : setNotFoundName(r.playerName)}
                          >
                            <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-slate-800 shrink-0">
                              <img src={p?.imgURL ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(r.playerName)}&background=1e293b&color=fff`}
                                alt={r.playerName} className="w-full h-full object-cover object-top"
                                referrerPolicy="no-referrer" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-white truncate">{r.playerName}</div>
                              <div className="text-[10px] text-slate-500">{r.teamAbbrev}</div>
                            </div>
                            {r.isStarter && (
                              <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                            )}
                            {(() => {
                              const cnt = awardCounts.countAllStar(r.playerName);
                              return (
                                <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                                  {cnt}×
                                </span>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
};

// Wrapper that passes season into LeaderColumn for OVR lookup
const LeaderColumnWithSeason: React.FC<{
  title: string; unit: string; leaders: LeaderEntry[];
  cat: StatCategory; isCurrent: boolean; season: number;
  onPlayerClick?: (player: any) => void;
}> = ({ title, unit, leaders, cat, isCurrent, season, onPlayerClick }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between px-1 mb-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</span>
      <span className="text-[10px] font-black text-slate-500">{unit}</span>
    </div>
    {leaders.length === 0 ? (
      <div className="text-xs italic text-slate-700 px-2 py-3">{isCurrent ? 'No data yet' : 'No data'}</div>
    ) : leaders.map((e, i) => (
      <RankedPersonCard
        key={e.player.internalId}
        rank={i + 1}
        portraitUrl={e.player.imgURL}
        name={e.player.name}
        subtitle={`${e.team?.abbrev ?? '—'} · ${fmt(e.value)} ${unit}`}
        teamLogoUrl={e.team?.logoUrl}
        accentColor="indigo"
        animDelay={i * 0.04}
        onClick={onPlayerClick ? () => onPlayerClick(e.player) : undefined}
      />
    ))}
  </div>
);
