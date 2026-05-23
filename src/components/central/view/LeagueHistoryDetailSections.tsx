import React from 'react';
import { Shield, Star, Trophy } from 'lucide-react';
import type { NBAPlayer } from '../../../types';
import { RankedPersonCard } from '../../shared/ui';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import type { HistoryAwardCard, HistoryAwardGroup, LeaderEntry } from './leagueHistoryDetailData';
import { formatHistoryStat } from './leagueHistoryDetailData';
import { resolveLeagueHistoryPortraitUrl } from './leagueHistoryShared';

export const AwardWinner: React.FC<{ label: string; award: any; isCurrent: boolean; winCount?: number; onClick?: () => void }> = ({ label, award, isCurrent, winCount = 1, onClick }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</div>
    {award ? (
      <RankedPersonCard
        rank={winCount}
        portraitUrl={award.imgURL}
        face={award.face}
        name={award.name}
        subtitle={award.team}
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

export const COYWinner: React.FC<{ award: any; isCurrent: boolean; winCount?: number }> = ({ award, isCurrent, winCount = 1 }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">COY</div>
    {award ? (
      <RankedPersonCard
        rank={winCount}
        portraitUrl={award.imgURL}
        face={award.face}
        name={award.name}
        subtitle={award.team}
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

export const AllTeamSection: React.FC<{ label: string; icon: React.ReactNode; iconColor: string; teams: HistoryAwardGroup[]; onPlayerClick?: (player: HistoryAwardCard) => void; showCount?: boolean }> = ({ label, icon, iconColor, teams, onPlayerClick, showCount = false }) => {
  const hasAny = teams.some((team) => team.players.length > 0);
  if (!hasAny) return null;
  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 ${iconColor}`}>
        {icon}
        <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="space-y-4">
        {teams.map(({ name, players }) => (
          players.length === 0 ? null : (
            <div key={name}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">{name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                {players.map((player, index) => (
                  <div
                    key={`${name}-${index}`}
                    className={`flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 transition-colors ${onPlayerClick ? 'cursor-pointer hover:border-slate-600 hover:bg-slate-800/60' : ''}`}
                    onClick={() => onPlayerClick?.(player)}
                  >
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                      <PlayerPortrait
                        imgUrl={player.imgURL}
                        face={player.face}
                        playerName={player.name}
                        teamLogoUrl={player.teamLogoUrl}
                        size={40}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{player.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">{player.team}</div>
                    </div>
                    {showCount && (player.count ?? 0) > 0 && (
                      <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                        {player.count}×
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

export const LeaderColumnWithSeason: React.FC<{ title: string; unit: string; leaders: LeaderEntry[]; isCurrent: boolean; onPlayerClick?: (player: any) => void }> = ({ title, unit, leaders, isCurrent, onPlayerClick }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between px-1 mb-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</span>
      <span className="text-[10px] font-black text-slate-500">{unit}</span>
    </div>
    {leaders.length === 0 ? (
      <div className="text-xs italic text-slate-700 px-2 py-3">{isCurrent ? 'No data yet' : 'No data'}</div>
    ) : leaders.map((entry, index) => (
      <RankedPersonCard
        key={entry.player.internalId}
        rank={index + 1}
        portraitUrl={entry.player.imgURL}
        face={(entry.player as any)?.face}
        name={entry.player.name}
        subtitle={`${entry.team?.abbrev ?? '—'} · ${formatHistoryStat(entry.value)} ${unit}`}
        accentColor="indigo"
        animDelay={index * 0.04}
        onClick={onPlayerClick ? () => onPlayerClick(entry.player) : undefined}
      />
    ))}
  </div>
);

export const ChampionHeroSection: React.FC<{
  champTeam: any;
  champRecord: any;
  runnerUpTeam: any;
  runnerUpRecord: any;
  finalsMvp: any;
  isCurrent: boolean;
  countChamp: (teamId: number | undefined) => number;
  countRunnerUp: (teamId: number | undefined) => number;
  onFinalsMvpClick: () => void;
}> = ({ champTeam, champRecord, runnerUpTeam, runnerUpRecord, finalsMvp, isCurrent, countChamp, countRunnerUp, onFinalsMvpClick }) => (
  <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 p-5">
    <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-amber-400/5 blur-3xl pointer-events-none" />
    <div className="flex flex-col md:flex-row md:items-center gap-6">
      <div className="flex-1">
        <div className="flex items-center gap-1.5 mb-3">
          <Trophy size={13} className="text-amber-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Champion</span>
        </div>
        {champTeam ? (
          <div className="flex items-center gap-4">
            {champTeam.logoUrl && (
              <img
                src={champTeam.logoUrl}
                alt={champTeam.abbrev}
                className="w-20 h-20 object-contain drop-shadow-xl shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-amber-400">{champTeam.name}</span>
                <span className="text-xs font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {countChamp(champTeam.id)}×
                </span>
              </div>
              {champRecord && (
                <div className="text-slate-400 font-semibold text-sm">
                  {champRecord.won ?? champRecord.wins ?? 0}-{champRecord.lost ?? champRecord.losses ?? 0}
                </div>
              )}
              {finalsMvp && (
                <div
                  className="flex items-center gap-2 mt-2 bg-slate-800/60 rounded-lg px-2.5 py-1.5 w-fit cursor-pointer hover:bg-slate-700/60 transition-colors"
                  onClick={onFinalsMvpClick}
                >
                  <PlayerPortrait
                    imgUrl={finalsMvp.imgURL}
                    face={finalsMvp.face}
                    playerName={finalsMvp.name}
                    size={32}
                  />
                  <div>
                    <div className="text-[9px] text-amber-500 uppercase font-black tracking-wider">Finals MVP</div>
                    <div className="text-sm font-bold text-white">{finalsMvp.name}</div>
                    {finalsMvp.statLine && <div className="text-[10px] text-slate-400">{finalsMvp.statLine}</div>}
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
      {runnerUpTeam && (
        <div className="md:border-l md:border-slate-700/50 md:pl-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Runner-Up</div>
          <div className="flex items-center gap-3">
            {runnerUpTeam.logoUrl && (
              <img
                src={runnerUpTeam.logoUrl}
                alt={runnerUpTeam.abbrev}
                className="w-12 h-12 object-contain opacity-50 shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-300">{runnerUpTeam.name}</span>
                <span className="text-[9px] font-black text-slate-400 bg-slate-700/50 border border-slate-600/30 px-1.5 py-0.5 rounded-full">
                  {countRunnerUp(runnerUpTeam.id)}× Finals
                </span>
              </div>
              {runnerUpRecord && (
                <div className="text-sm text-slate-500">
                  {runnerUpRecord.won ?? runnerUpRecord.wins ?? 0}-{runnerUpRecord.lost ?? runnerUpRecord.losses ?? 0}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);

export const BestRecordsSection: React.FC<{ bestRecords: { conference: string; team: any; ts: any }[] }> = ({ bestRecords }) => {
  if (!bestRecords.length) return null;
  return (
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
          const conferenceLabel = conference === 'East' || conference === 'Eastern' ? 'Eastern' : 'Western';
          return (
            <div key={conference} className="relative bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center gap-4 overflow-hidden transition-colors">
              {team.logoUrl && (
                <img
                  src={team.logoUrl}
                  alt=""
                  aria-hidden
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-16 h-16 object-contain opacity-[0.06] pointer-events-none"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                {team.logoUrl
                  ? <img src={team.logoUrl} alt={team.abbrev} className="w-11 h-11 object-contain" referrerPolicy="no-referrer" />
                  : <span className="text-lg font-black text-slate-600">{team.abbrev}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5">
                  {conferenceLabel} Conference
                </div>
                <div className="text-base font-black text-white truncate leading-tight">{team.name}</div>
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
  );
};

export const SemifinalsMvpsSection: React.FC<{ semifinalsMvps: any[]; onPlayerSelect: (player: NBAPlayer) => void; onPlayerMissing: (name: string) => void }> = ({ semifinalsMvps, onPlayerSelect, onPlayerMissing }) => {
  if (!semifinalsMvps.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Shield size={13} className="text-slate-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Semifinals MVPs</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {semifinalsMvps.map((award, index) => (
          <RankedPersonCard
            key={index}
            rank={index + 1}
            portraitUrl={award.imgURL}
            face={award.face}
            name={award.name}
            subtitle={`${award.team}${award.statLine ? ` · ${award.statLine}` : ''}`}
            accentColor="indigo"
            animDelay={index * 0.04}
            onClick={() => award.playerRef ? onPlayerSelect(award.playerRef as NBAPlayer) : onPlayerMissing(award.name)}
          />
        ))}
      </div>
    </div>
  );
};

const EAST_LOGO = 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748';
const WEST_LOGO = 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726';

const AllStarConferenceSection: React.FC<{ conference: string; logo: string; roster: any[]; players: any[]; teams: any[]; season: number; countAllStar: (playerName: string | undefined) => number; onPlayerSelect: (player: NBAPlayer) => void; onPlayerMissing: (name: string) => void }> = ({ conference, logo, roster, players, teams, season, countAllStar, onPlayerSelect, onPlayerMissing }) => {
  if (!roster.length) return null;
  const starters = roster.filter((entry: any) => entry.isStarter);
  const reserves = roster.filter((entry: any) => !entry.isStarter);
  const isEast = conference === 'East';
  const confText = isEast ? 'text-blue-400' : 'text-red-400';
  const confBorder = isEast ? 'border-blue-500/20' : 'border-red-500/20';
  const confFrom = isEast ? 'from-blue-950/20' : 'from-red-950/20';

  const getSnap = (entry: any) => {
    const player = players.find((candidate: any) => String(candidate.internalId) === String(entry.playerId));
    const stats = player?.stats?.filter((stat: any) => Number(stat.season) === Number(season) && !stat.playoffs && (stat.tid ?? -1) >= 0) ?? [];
    const tid = stats.length ? stats.reduce((left: any, right: any) => (left.gp >= right.gp ? left : right)).tid : player?.tid;
    const team = teams.find((candidate: any) => candidate.id === tid) ?? teams.find((candidate: any) => candidate.abbrev === entry.teamAbbrev);
    const snapOvr = player?.ratings?.find((rating: any) => Number(rating.season) === Number(season))?.ovr ?? player?.overallRating;
    const snapRatings = player?.ratings?.filter((rating: any) => Number(rating.season) === Number(season));
    return {
      player,
      team,
      teamColor: team?.colors?.[0] ?? '#64748b',
      snapOvr,
      snapRatings,
      pos: (player as any)?.pos ?? '—',
      count: countAllStar(entry.playerName),
    };
  };

  return (
    <div className={`rounded-2xl border ${confBorder} bg-gradient-to-b ${confFrom} via-slate-900/80 to-slate-900 overflow-hidden`}>
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${confBorder}`}>
        <img src={logo} className="w-6 h-6 object-contain" alt={conference} />
        <span className={`text-sm font-black uppercase tracking-wider ${confText}`}>
          {isEast ? 'Eastern' : 'Western'} Conference
        </span>
        <span className="ml-auto text-[10px] font-black text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">
          {roster.length}
        </span>
      </div>
      {starters.length > 0 && (
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Star size={9} className="text-amber-400 fill-amber-400" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/70">Starters</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {starters.map((entry: any) => {
              const { player, team, teamColor, snapOvr, snapRatings, pos, count } = getSnap(entry);
              return (
                <div
                  key={entry.playerId}
                  className="relative flex flex-col items-center gap-1.5 p-3 pt-4 rounded-2xl border cursor-pointer"
                  style={{ borderColor: `${teamColor}55`, background: `linear-gradient(160deg, ${teamColor}18 0%, rgba(15,23,42,0.9) 55%)` }}
                  onClick={() => player ? onPlayerSelect(player as NBAPlayer) : onPlayerMissing(entry.playerName)}
                >
                  <div className="absolute top-0 left-4 right-4 h-px rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${teamColor}90, transparent)` }} />
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 rounded-full">
                    <Star size={7} className="text-amber-400 fill-amber-400" />
                    <span className="text-[7px] font-black text-amber-400 uppercase tracking-wide">Starter</span>
                  </div>
                  <div className="mt-1">
                    <PlayerPortrait
                      imgUrl={resolveLeagueHistoryPortraitUrl(player, entry.playerName)}
                      face={(player as any)?.face}
                      playerName={entry.playerName}
                      teamLogoUrl={team?.logoUrl}
                      overallRating={snapOvr}
                      ratings={snapRatings}
                      size={56}
                    />
                  </div>
                  <div className="text-center w-full mt-0.5">
                    <div className="text-[11px] font-black text-white leading-tight truncate px-1">{entry.playerName}</div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">{pos}</div>
                  </div>
                  <div className="flex items-center gap-0.5 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                    <Star size={7} className="text-amber-400 fill-amber-400" />
                    <span className="text-[9px] font-black text-amber-400">{count}×</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {reserves.length > 0 && (
        <div className={starters.length > 0 ? 'border-t border-slate-800/60' : ''}>
          {starters.length > 0 && (
            <div className="px-4 py-2.5 border-b border-slate-800/40">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Reserves</span>
            </div>
          )}
          <div className="p-3 space-y-1.5">
            {reserves.map((entry: any) => {
              const { player, team, snapOvr, snapRatings, pos, count } = getSnap(entry);
              return (
                <div
                  key={entry.playerId}
                  className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-2.5 py-1.5 border border-slate-800 cursor-pointer hover:border-slate-600 hover:bg-slate-800/60 transition-colors"
                  onClick={() => player ? onPlayerSelect(player as NBAPlayer) : onPlayerMissing(entry.playerName)}
                >
                  <PlayerPortrait
                    imgUrl={resolveLeagueHistoryPortraitUrl(player, entry.playerName)}
                    face={(player as any)?.face}
                    playerName={entry.playerName}
                    teamLogoUrl={team?.logoUrl}
                    overallRating={snapOvr}
                    ratings={snapRatings}
                    size={36}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{entry.playerName}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">
                      {pos !== '—' ? `${pos} · ` : ''}{entry.teamAbbrev}
                    </div>
                  </div>
                  <span className="text-[9px] font-black text-amber-400/80 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full shrink-0">
                    {count}×
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const AllStarSection: React.FC<{ allStarRoster: any[] | null; players: any[]; teams: any[]; season: number; countAllStar: (playerName: string | undefined) => number; onPlayerSelect: (player: NBAPlayer) => void; onPlayerMissing: (name: string) => void }> = ({ allStarRoster, players, teams, season, countAllStar, onPlayerSelect, onPlayerMissing }) => {
  if (!allStarRoster?.length) return null;
  const eastRoster = allStarRoster.filter((entry: any) => entry.conference === 'East' || entry.conference === 'Eastern' || entry.conference?.startsWith('East'));
  const westRoster = allStarRoster.filter((entry: any) => entry.conference === 'West' || entry.conference === 'Western' || entry.conference?.startsWith('West'));
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Star size={13} className="text-amber-400 fill-amber-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
          All-Stars ({allStarRoster.length})
        </span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AllStarConferenceSection
          conference="East"
          logo={EAST_LOGO}
          roster={eastRoster}
          players={players}
          teams={teams}
          season={season}
          countAllStar={countAllStar}
          onPlayerSelect={onPlayerSelect}
          onPlayerMissing={onPlayerMissing}
        />
        <AllStarConferenceSection
          conference="West"
          logo={WEST_LOGO}
          roster={westRoster}
          players={players}
          teams={teams}
          season={season}
          countAllStar={countAllStar}
          onPlayerSelect={onPlayerSelect}
          onPlayerMissing={onPlayerMissing}
        />
      </div>
    </div>
  );
};
