import React from 'react';
import { ExternalLink, Mic2, Sparkles, Star, X } from 'lucide-react';
import { motion } from 'motion/react';
import { NBAPlayer } from '../../../../types';
import { getScoutedDisplayOverall } from '../../../../utils/scoutingFuzz';
import { ALL_STAR_ASSETS } from '../../../../services/allStar/AllStarSelectionService';
import { resolveLegendCaptains } from '../../../../services/allStar/captainPool';
import { getPlayerImage } from '../../../../utils/playerImage';
import { PlayerPortrait } from '../../../shared/PlayerPortrait';
import { PlayerNameWithHover } from '../../../shared/PlayerNameWithHover';
import { getLocalRatedCelebritiesForYear } from '../../../../data/celebrityEventSource';
import { normalizeCelebrityImageNameKey } from '../../../../data/celebrities';

const EAST_LOGO_URL = ALL_STAR_ASSETS.eastLogo;
const WEST_LOGO_URL = ALL_STAR_ASSETS.westLogo;

interface AllStarRosterModalProps {
  tab: string;
  allStar: any;
  state: any;
  onClose: () => void;
  onGoToAllStar: () => void;
}

type Accent = 'amber' | 'sky';

export const AllStarRosterModal: React.FC<AllStarRosterModalProps> = ({ tab, allStar, state, onClose, onGoToAllStar }) => {
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const isCaptainsDraft = state.leagueStats?.allStarFormat === 'captains_draft';
  const players: NBAPlayer[] = state.players ?? [];
  const playerById = new Map(players.map(player => [player.internalId, player]));
  const teamById = new Map<number, any>((state.teams ?? []).map((team: any) => [Number(team.id ?? team.tid), team]));
  const legendCaptains = state.leagueStats?.allStarCaptainType === 'legend'
    ? resolveLegendCaptains(state.leagueStats?.allStarLegendCaptainIds, players)
    : [];
  const meta = tab === 'rising-stars'
    ? { title: 'Rising Stars Rosters', eyebrow: 'Friday Night', accent: 'sky' as Accent, icon: Sparkles }
    : tab === 'celebrity'
      ? { title: 'Celebrity Game Rosters', eyebrow: 'Exhibition Matchup', accent: 'fuchsia' as const, icon: Mic2 }
      : { title: 'All-Star Rosters', eyebrow: 'Sunday Showcase', accent: 'amber' as Accent, icon: Star };
  const MetaIcon = meta.icon;

  const getBucketLabel = (bucket: string) => {
    if (isCaptainsDraft) {
      const index = bucket === 'West' ? 1 : 0;
      const savedName = state.leagueStats?.allStarTeamNames?.[index];
      if (savedName) return savedName;
      if (legendCaptains[index]?.name) return `Team ${legendCaptains[index].name.trim().split(/\s+/).at(-1)}`;
      const captain = allStar?.roster?.find((entry: any) => entry.conference === bucket && entry.isCaptain);
      if (captain?.playerName) return `Team ${String(captain.playerName).trim().split(/\s+/).at(-1)}`;
      return bucket === 'East' ? (isPba ? 'Team A' : 'East All-Stars') : (isPba ? 'Team B' : 'West All-Stars');
    }
    if (bucket === 'East') return isPba ? 'Team A' : 'Eastern Conference';
    if (bucket === 'West') return isPba ? 'Team B' : 'Western Conference';
    return bucket;
  };

  const getBucketLogo = (bucket: string) => {
    if (isCaptainsDraft) {
      const index = bucket === 'West' ? 1 : 0;
      if (legendCaptains[index]) return getPlayerImage(legendCaptains[index] as NBAPlayer);
      const captain = allStar?.roster?.find((entry: any) => entry.conference === bucket && entry.isCaptain);
      const player = playerById.get(captain?.playerId);
      if (player) return getPlayerImage(player);
    }
    return allStar?.bracket?.teams?.find((team: any) => team.bucketKey === bucket)?.logoUrl
      ?? (bucket === 'West' ? WEST_LOGO_URL : EAST_LOGO_URL);
  };

  const renderPlayer = (entry: any, accent: Accent = 'sky', featured = false) => {
    const player = playerById.get(entry.playerId);
    const team = player ? teamById.get(Number(player.tid)) : undefined;
    const teamAbbrev = entry.teamAbbrev ?? team?.abbrev ?? (player?.status === 'G-League' ? 'GL' : '—');
    const rating = player ? getScoutedDisplayOverall(state, player, state.leagueStats.year) : null;
    const accentClasses = accent === 'amber'
      ? 'border-amber-400/25 bg-amber-400/[0.07]'
      : 'border-sky-400/20 bg-sky-400/[0.05]';
    const ratingClass = rating && rating >= 90
      ? 'text-amber-300'
      : rating && rating >= 80 ? 'text-emerald-300' : 'text-slate-300';

    return (
      <div
        key={entry.playerId}
        className={`group flex min-h-14 items-center gap-3 border px-3 py-2.5 transition-colors hover:border-white/20 hover:bg-white/[0.06] ${featured ? accentClasses : 'border-white/[0.06] bg-white/[0.025]'}`}
      >
        <PlayerPortrait
          imgUrl={player ? getPlayerImage(player) : undefined}
          face={player?.face}
          playerName={entry.playerName}
          size={38}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">
            {player ? <PlayerNameWithHover player={player}>{entry.playerName}</PlayerNameWithHover> : entry.playerName}
          </div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
            {teamAbbrev}{entry.position || player?.pos ? ` · ${entry.position ?? player?.pos}` : ''}
          </div>
        </div>
        {rating !== null && (
          <div className="shrink-0 border-l border-white/[0.08] pl-3 text-right">
            <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">OVR</div>
            <div className={`font-mono text-base font-black leading-none ${ratingClass}`}>{rating}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-2 backdrop-blur-md sm:p-4">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-star-roster-modal-title"
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080b12] shadow-2xl sm:max-h-[88dvh] sm:rounded-[28px]"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[#0d111b] px-4 py-4 sm:px-6 sm:py-5">
          <div className={`absolute inset-y-0 left-0 w-1 ${meta.accent === 'fuchsia' ? 'bg-fuchsia-500' : meta.accent === 'amber' ? 'bg-amber-400' : 'bg-sky-400'}`} />
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${meta.accent === 'fuchsia' ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300' : meta.accent === 'amber' ? 'border-amber-400/25 bg-amber-400/10 text-amber-300' : 'border-sky-400/25 bg-sky-400/10 text-sky-300'}`}>
                <MetaIcon size={19} />
              </div>
              <div className="min-w-0">
                <p className={`text-[9px] font-black uppercase tracking-[0.22em] ${meta.accent === 'fuchsia' ? 'text-fuchsia-300' : meta.accent === 'amber' ? 'text-amber-300' : 'text-sky-300'}`}>{meta.eyebrow}</p>
                <h3 id="all-star-roster-modal-title" className="truncate text-lg font-black uppercase tracking-tight text-white sm:text-2xl">{meta.title}</h3>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {tab !== 'celebrity' && (
                <button
                  onClick={onGoToAllStar}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-300 transition-colors hover:bg-white/[0.06] hover:text-white sm:px-3"
                >
                  <span className="hidden sm:inline">Full details</span><ExternalLink size={14} />
                </button>
              )}
              <button onClick={onClose} aria-label="Close rosters" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white">
                <X size={20} />
              </button>
            </div>
          </div>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-3 sm:p-6">
          {tab === 'rising-stars' && (() => {
            const bracket = allStar?.risingStarsBracket;
            const panels = bracket?.teams?.length >= 3
              ? bracket.teams.map((team: any) => ({
                  key: String(team.tid),
                  label: team.name,
                  subtitle: `${team.coachName ? `Coach ${team.coachName}` : team.isGLeague ? 'G League' : 'Roster'} · ${team.wins ?? 0}-${team.losses ?? 0}`,
                  entries: (team.playerIds ?? []).map((id: string) => {
                    const player = playerById.get(id);
                    return player ? { playerId: player.internalId, playerName: player.name, position: player.pos } : null;
                  }).filter(Boolean),
                }))
              : (() => {
                  const roster = allStar?.risingStarsRoster ?? [];
                  const names = allStar?.risingStarsTeams ?? ['Team USA', 'Team World'];
                  const captains = state.leagueStats?.risingStarsFormat === 'captains_draft';
                  return [
                    { key: 'one', label: names[0], subtitle: captains ? 'Former Player Captain' : 'Sophomores', entries: roster.filter((p: any) => captains ? p.risingStarsTeam === 'Captain 1' : !p.isRookie) },
                    { key: 'two', label: names[1], subtitle: captains ? 'Former Player Captain' : 'Rookies', entries: roster.filter((p: any) => captains ? p.risingStarsTeam === 'Captain 2' : p.isRookie) },
                  ];
                })();

            return (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {panels.map((panel: any) => (
                  <section key={panel.key} className="overflow-hidden rounded-2xl border border-sky-400/15 bg-[#0c1220]">
                    <div className="border-b border-sky-400/15 bg-sky-400/[0.05] px-4 py-3">
                      <h4 className="text-sm font-black uppercase tracking-[0.08em] text-white">{panel.label}</h4>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-sky-300/75">{panel.subtitle} · {panel.entries.length} players</p>
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      {panel.entries.length > 0 ? panel.entries.map((entry: any) => renderPlayer(entry)) : (
                        <p className="px-2 py-6 text-center text-xs italic text-slate-600">Roster assigned at sim time.</p>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            );
          })()}

          {tab === 'celebrity' && (() => {
            const roster: string[] = allStar?.celebrityRoster ?? state.leagueStats?.celebrityRoster ?? [];
            const localProfiles = getLocalRatedCelebritiesForYear(state.leagueStats?.year, state.leagueType === 'fictional' ? 'fictional' : 'real');
            const savedProfiles = allStar?.celebrityRosterProfiles ?? state.leagueStats?.celebrityRosterProfiles ?? [];
            const profilesByName = new Map([...localProfiles, ...savedProfiles].map((profile: any) => [normalizeCelebrityImageNameKey(profile.name), profile]));
            const names = allStar?.celebrityTeams ?? ['Team 1', 'Team 2'];
            const sides = [roster.slice(0, 10), roster.slice(10, 20)];
            return (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {names.slice(0, 2).map((label: string, side: number) => (
                  <section key={label} className="overflow-hidden rounded-2xl border border-fuchsia-400/15 bg-[#120c18]">
                    <div className="border-b border-fuchsia-400/15 bg-fuchsia-400/[0.05] px-4 py-3">
                      <h4 className="text-sm font-black uppercase tracking-[0.08em] text-white">{label}</h4>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-fuchsia-300/75">Celebrity roster · {sides[side].length} guests</p>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 p-2.5 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                      {sides[side].map((name, index) => {
                        const profile = profilesByName.get(normalizeCelebrityImageNameKey(name));
                        return (
                          <div key={`${name}-${index}`} className="flex min-h-14 items-center gap-3 border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 transition-colors hover:border-fuchsia-300/20 hover:bg-fuchsia-300/[0.05]">
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fuchsia-950 text-xs font-black text-fuchsia-300">
                              {name.charAt(0)}
                              {profile?.imgUrl && <img src={profile.imgUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                            </div>
                            <span className="min-w-0 truncate text-sm font-bold text-white">{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            );
          })()}

          {tab === 'all-star' && (() => {
            const roster = (allStar?.roster ?? []).filter((entry: any) => !entry.isInjuredDNP);
            const order = ['East', 'West', 'USA1', 'USA2', 'WORLD', 'WORLD1', 'WORLD2'];
            const buckets = Array.from(new Set<string>(roster.map((entry: any) => entry.conference).filter(Boolean)));
            buckets.sort((a, b) => order.indexOf(a) - order.indexOf(b));
            return (
              <div className={`grid grid-cols-1 gap-4 ${buckets.length === 2 ? 'md:grid-cols-2' : ''}`}>
                {buckets.map(bucket => {
                  const entries = roster.filter((entry: any) => entry.conference === bucket);
                  const starters = entries.filter((entry: any) => entry.isStarter);
                  const reserves = entries.filter((entry: any) => !entry.isStarter);
                  const label = getBucketLabel(bucket);
                  return (
                    <section key={bucket} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d111b]">
                      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.025] px-4 py-3">
                        <img src={getBucketLogo(bucket)} className="h-9 w-9 object-contain" alt="" />
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-[0.08em] text-white">{label}</h4>
                          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{entries.length} selections</p>
                        </div>
                      </div>
                      <div className="space-y-4 p-2.5">
                        <div>
                          <p className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">{isCaptainsDraft ? 'Top picks' : 'Starters · fan vote'}</p>
                          <div className="space-y-1.5">{starters.map((entry: any) => renderPlayer(entry, 'amber', true))}</div>
                        </div>
                        <div>
                          <p className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{isCaptainsDraft ? 'Drafted' : 'Reserves · coach select'}</p>
                          <div className="space-y-1.5">{reserves.map((entry: any) => renderPlayer(entry, 'amber'))}</div>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </motion.div>
    </div>
  );
};
