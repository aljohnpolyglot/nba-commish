import React from 'react';
import { motion } from 'motion/react';
import { NBAPlayer, NonNBATeam } from '../../../types';
import { getPlayerImage } from '../../central/view/bioCache';
import { useGame } from '../../../store/GameContext';
import { PlayerNameWithHover } from '../../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { CountryFlag } from '../../shared/CountryFlag';
import { formatFuzzedRating } from '../../../utils/scoutingFuzz';
import { isNonNbaIsolatedMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { isPbaRosterLocal } from '../../../services/pba/importManager';
import { getDisplayAge, getDisplayOverall } from '../../../store/playerRatingStore';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { isExternalLeagueStatus } from '../../../constants';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { getPlayerNationalityCountries } from '../../../utils/playerNationality';

const LEAGUE_LOGOS: Record<string, string> = {
  PBA: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/93/Philippine_Basketball_Association_logo.svg/200px-Philippine_Basketball_Association_logo.svg.png',
  Euroleague: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b7/EuroLeague_logo.svg/200px-EuroLeague_logo.svg.png',
  'B-League': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmjuA28r8Wi0G12PZR5iGIk8X2sMvjOgyyXw&s',
  'G-League': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/NBA_G_League_logo.svg/200px-NBA_G_League_logo.svg.png',
  Endesa: 'https://r2.thesportsdb.com/images/media/league/badge/9i99ii1549879285.png',
};

interface FreeAgentCardProps {
  player: NBAPlayer;
  nonNBATeams?: NonNBATeam[];
  onClick: (player: NBAPlayer) => void;
}

export const FreeAgentCard: React.FC<FreeAgentCardProps> = ({ player, nonNBATeams = [], onClick }) => {
  const { state } = useGame();
  const nonNbaIsolated = isNonNbaIsolatedMode(state);
  const pbaMode = isPbaIsolatedMode(state);
  const simYear = state.leagueStats?.year ?? new Date().getFullYear();
  const pbaLocal = pbaMode && isPbaRosterLocal(player, state.leagueStats as any);
  const showImportBadge = pbaMode && !pbaLocal;
  const age = getDisplayAge(player, simYear);
  const ovr = getDisplayOverall(player, simYear);
  const displayOvr = formatFuzzedRating(ovr, state, player);
  const countries = getPlayerNationalityCountries(player as NBAPlayer & { nationality?: unknown }).slice(0, 2);

  const resolvedTeam = player.tid >= 0
    ? resolveAnyTeam(player.tid, state.teams, nonNBATeams)
    : null;
  const isNBA = player.tid >= 0 && player.tid < 100;
  const nonNBATeam = player.tid >= 100
    ? nonNBATeams.find(t => t.tid === player.tid) ?? null
    : null;
  const nbaTeam = isNBA
    ? state.teams.find(t => t.id === player.tid) ?? null
    : null;
  const teamLogo = resolvedTeam ? getResolvedTeamLogoUrl(resolvedTeam, simYear) || null : null;
  const leagueLogo = player.tid !== -1 && !nonNbaIsolated && !nbaTeam && player.status ? LEAGUE_LOGOS[player.status] || null : null;

  let orgLabel = 'Free Agent';
  if (nbaTeam) {
    // BBGM's NBATeam.name already contains the full "Los Angeles Lakers" form — don't double-prefix region.
    orgLabel = nbaTeam.name;
  } else if (nonNBATeam) {
    orgLabel = getTeamFullName(nonNBATeam);
  } else if (resolvedTeam) {
    orgLabel = resolvedTeam.name;
  } else if (player.tid !== -1 && !nonNbaIsolated && isExternalLeagueStatus(player.status)) {
    orgLabel = player.status!;
  }

  // Option chip from contractYears final entry (player / team option).
  const contractYears = (player as any).contractYears as Array<{ option?: string }> | undefined;
  const finalOpt = contractYears?.[contractYears.length - 1]?.option ?? '';
  const optionChip = finalOpt === 'player'
    ? { label: 'Player Option', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' }
    : finalOpt === 'team'
      ? { label: 'Team Option', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' }
      : null;

  const isInjured = player.injury && player.injury.type !== 'Healthy' && player.injury.gamesRemaining > 0;
  const isSuspended = player.suspension && player.suspension.gamesRemaining > 0;
  const isAvailable = !isInjured && !isSuspended;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-slate-900/40 border ${isAvailable ? 'border-slate-800/50' : 'border-rose-500/30'} rounded-3xl overflow-hidden hover:border-indigo-500/50 transition-all group relative cursor-pointer`}
      onClick={() => onClick(player)}
    >
      {!isAvailable && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-rose-500/50 z-20" />
      )}
      <div className="p-4">
        <div className="flex items-center gap-4 relative z-10">
          <div className="relative flex-shrink-0">
            <PlayerPortrait
              imgUrl={getPlayerImage(player)}
              face={(player as any).face}
              playerName={player.name}
              playerIdentity={player}
              teamLogoUrl={teamLogo ?? undefined}
              fallbackTeamLogoUrl={player.status === 'PBA' ? LEAGUE_LOGOS.PBA : undefined}
              overallRating={ovr}
              ovrLabel={displayOvr}
              size={64}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <h4 className="text-sm font-bold text-white truncate group-hover:text-indigo-400 transition-colors leading-tight">
                <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
              </h4>
              {!isAvailable && (
                <span className="text-[8px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase tracking-tighter whitespace-nowrap flex-shrink-0">
                  {isInjured ? 'OUT' : /red card/i.test(player.suspension?.reason ?? '') ? 'RED CARD' : 'SUSP'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{player.pos}</span>
              <span className="text-[10px] text-slate-600">•</span>
              <span className="text-[10px] font-bold text-slate-500">{age}y</span>
              {showImportBadge && (
                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/30">
                  Import
                </span>
              )}
              {optionChip && (
                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${optionChip.color}`}>
                  {optionChip.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {countries.map(country => (
                <CountryFlag key={country} country={country} className="h-2 w-3" imageClassName="h-full w-full rounded-[1px] object-cover" />
              ))}
              {teamLogo && (
                <img
                  src={teamLogo}
                  alt=""
                  loading="lazy"
                  className="w-3.5 h-3.5 object-contain flex-shrink-0"
                  onError={e => e.currentTarget.style.display = 'none'}
                />
              )}
              <span className="text-[10px] font-medium text-slate-500 truncate">{orgLabel}</span>
            </div>
          </div>
          {leagueLogo && (
            <div className="flex-shrink-0 ml-1">
              <img
                src={leagueLogo}
                alt={player.status || ''}
                loading="lazy"
                className="w-7 h-7 object-contain opacity-60 group-hover:opacity-100 transition-opacity"
                onError={e => e.currentTarget.style.display = 'none'}
              />
            </div>
          )}
        </div>
      </div>
      {/* Accent Glow */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-indigo-500/10 transition-all" />
    </motion.div>
  );
};
