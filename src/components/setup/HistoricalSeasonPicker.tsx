import React from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, DollarSign, LoaderCircle, RefreshCw, Trophy, Users, X, UserRound } from 'lucide-react';
import {
  HISTORICAL_NBA_SEASONS,
  getHistoricalExternalLeagueLabels,
  getHistoricalNbaSalaryCap,
  getHistoricalNbaSeason,
  shouldLoadExternalLeaguesForNbaStart,
} from '../../data/historicalNbaSeasons';
import { hasHistoricalNbaRosterSource } from '../../data/historicalNbaRosterSources';
import {
  ensurePortraitLookupsLoaded,
  getPhotoByPlayerIdentity,
  getPortraitLookupCount,
  retryPortraitLookupsLoaded,
} from '../../data/realPlayerDataFetcher';
import type { NBAPlayer, NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { buildHistoricalSeasonPreview } from '../../utils/historicalSeasonPreview';
import { playModdedSetupSound } from './moddedSetupAudio';
import {
  getCachedNbaEraPortraitCandidates,
  getNbaEraPortraitCatalogEntryCount,
  loadNbaEraPortraitCatalog,
} from '../../services/nbaEraPortraitCatalog';
import { isPortraitUrlUnavailable, markPortraitUrlUnavailable } from '../../utils/portraitAvailability';

interface HistoricalSeasonPickerProps {
  selectedStartYear: number;
  onChange: (startYear: number) => void;
  onContinue: () => void;
  onBack: () => void;
  teams: NBATeam[];
  players: NBAPlayer[];
  loading?: boolean;
  loadSlow?: boolean;
  sourceReady?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  continueLabel?: string;
}

const TeamLogo: React.FC<{ team: NBATeam }> = ({ team }) => {
  if (!team.logoUrl) {
    return (
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-sm font-black text-slate-400">
        {team.abbrev}
      </div>
    );
  }

  return (
    <img
      src={team.logoUrl}
      alt=""
      className="mx-auto mb-3 h-16 w-16 rounded-full object-contain"
      loading="lazy"
    />
  );
};

const PlayerPortrait: React.FC<{ player: NBAPlayer; photosReady: boolean; season: number }> = ({ player, photosReady, season }) => {
  const [sourceIndex, setSourceIndex] = React.useState(0);
  const isProspect = player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';
  const photoSources = React.useMemo(() => {
    const chronological = photosReady
      ? getCachedNbaEraPortraitCandidates(player, { season, isProspect })
      : [];
    return Array.from(new Set([
      ...chronological,
      photosReady ? getPhotoByPlayerIdentity(player) : null,
      player.imgURL,
    ].filter((url): url is string => Boolean(url) && !isPortraitUrlUnavailable(url))));
  }, [isProspect, photosReady, player, season]);
  React.useEffect(() => {
    setSourceIndex(0);
  }, [player.internalId, photoSources, season]);
  const photo = photoSources[sourceIndex] ?? null;
  return (
    <div className="h-20 w-full overflow-hidden rounded-t-md bg-slate-900">
      {photo ? (
        <img
          src={photo}
          alt={player.name}
          className="h-full w-full object-cover object-top"
          loading="lazy"
          onError={() => {
            markPortraitUrlUnavailable(photo);
            setSourceIndex(index => index + 1);
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-500">
          <UserRound size={28} />
        </div>
      )}
    </div>
  );
};

export const HistoricalSeasonPicker: React.FC<HistoricalSeasonPickerProps> = ({
  selectedStartYear,
  onChange,
  onContinue,
  onBack,
  teams,
  players,
  loading = false,
  loadSlow = false,
  sourceReady = true,
  errorMessage,
  onRetry,
  continueLabel = 'Choose Team',
}) => {
  const [portraitState, setPortraitState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const selected = getHistoricalNbaSeason(selectedStartYear);
  const externalLeaguesEnabled = shouldLoadExternalLeaguesForNbaStart(selectedStartYear);
  const externalLeagueLabels = getHistoricalExternalLeagueLabels(selectedStartYear);
  const externalLeagueSummary = externalLeagueLabels.length > 4
    ? `${externalLeagueLabels.slice(0, 4).join(' · ')} +${externalLeagueLabels.length - 4}`
    : externalLeagueLabels.join(' · ');
  const selectedHasRosterSource = hasHistoricalNbaRosterSource(selectedStartYear);
  const activeNbaPlayers = React.useMemo(
    () => players.filter(player => player.tid >= 0 && player.tid < 100 && player.status === 'Active').length,
    [players],
  );
  const hasPlayableRoster = teams.length > 0 && activeNbaPlayers > 0;
  const requiredPortraitPlayers = React.useMemo(() => players.filter(player => {
    const draftYear = Number(player.draft?.year);
    if (!Number.isFinite(draftYear)) return false;
    const prospect = player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';
    const currentRookie = player.tid >= 0 && player.tid < 100 && draftYear >= selectedStartYear - 1;
    return currentRookie || (prospect && draftYear >= selectedStartYear && draftYear <= selectedStartYear + 3);
  }), [players, selectedStartYear]);
  const embeddedPortraitMatches = React.useMemo(
    () => requiredPortraitPlayers.filter(player => Boolean(player.imgURL)).length,
    [requiredPortraitPlayers],
  );
  const lookupPortraitMatches = React.useMemo(() => portraitState === 'ready'
    ? requiredPortraitPlayers.filter(player => {
      const candidates = getCachedNbaEraPortraitCandidates(player, {
        season: selectedStartYear,
        isProspect: player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect',
      });
      return candidates.length > 0 || Boolean(getPhotoByPlayerIdentity(player));
    }).length
    : 0, [portraitState, requiredPortraitPlayers, selectedStartYear]);
  const hasRequiredPortraitPack = requiredPortraitPlayers.length === 0
    || embeddedPortraitMatches > 0
    || (portraitState === 'ready' && (getPortraitLookupCount() > 0 || getNbaEraPortraitCatalogEntryCount() > 0) && lookupPortraitMatches > 0);
  const preparing = loading || (portraitState === 'loading' && embeddedPortraitMatches === 0);
  const canContinue = selectedHasRosterSource && sourceReady && !preparing && hasPlayableRoster && hasRequiredPortraitPack;
  const showRosterError = selectedHasRosterSource && !preparing && (!sourceReady || !hasPlayableRoster || !hasRequiredPortraitPack);
  const rosterErrorMessage = errorMessage ?? (
    !sourceReady
      ? 'This season could not be prepared. Check your connection and try again.'
      : !hasPlayableRoster
        ? 'No playable teams were found for this season. Try again or choose another season.'
        : 'Required rookie and draft-class player images could not be found. Try again or choose another season.'
  );
  const salaryCap = getHistoricalNbaSalaryCap(selectedStartYear);
  const salaryCapLabel = salaryCap == null ? 'No Cap' : `$${(salaryCap / 1_000_000).toFixed(salaryCap >= 10_000_000 ? 1 : 2)}M`;
  const seasonOptions = React.useMemo(() => [...HISTORICAL_NBA_SEASONS].reverse(), []);
  const preview = React.useMemo(
    () => buildHistoricalSeasonPreview(teams, players, selectedStartYear),
    [players, selectedStartYear, teams],
  );
  const topTeams = preview.topTeams;
  const notablePlayers = preview.notablePlayers;

  React.useEffect(() => {
    let cancelled = false;
    setPortraitState('loading');
    Promise.allSettled([ensurePortraitLookupsLoaded(), loadNbaEraPortraitCatalog()]).then(() => {
      if (!cancelled) {
        setPortraitState(getPortraitLookupCount() > 0 || getNbaEraPortraitCatalogEntryCount() > 0 ? 'ready' : 'error');
      }
    });
    return () => { cancelled = true; };
  }, [selectedStartYear]);

  const retrySeason = React.useCallback(() => {
    setPortraitState('loading');
    onRetry?.();
    Promise.allSettled([retryPortraitLookupsLoaded(), loadNbaEraPortraitCatalog()]).then(() => {
      setPortraitState(getPortraitLookupCount() > 0 || getNbaEraPortraitCatalogEntryCount() > 0 ? 'ready' : 'error');
    });
  }, [onRetry]);

  return (
    <div className="modded-setup modded-scanlines min-h-screen bg-[#07090e] p-3 text-white sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-6xl items-center justify-center">
        <div className="relative w-full overflow-hidden rounded-xl border-2 border-blue-600 bg-[#0b1021] shadow-[0_0_42px_rgba(37,99,235,0.24)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.22),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(239,68,68,0.14),_transparent_38%)]" />
          <div className="relative p-5 sm:p-8">
            <button
              onClick={() => {
                playModdedSetupSound('back');
                onBack();
              }}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              title="Close"
            >
              <X size={24} />
            </button>

            <header className="mb-6 flex items-start gap-4 pr-10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-400/60 bg-blue-500/10 text-yellow-400">
                <Trophy size={28} />
              </div>
              <div>
                <h1 className="modded-font-sport text-3xl font-black uppercase italic tracking-tight text-yellow-400 sm:text-4xl">Start New Simulation</h1>
                <p className="mt-1 text-sm text-slate-400 sm:text-base">Choose an NBA season to begin your simulation.</p>
              </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[390px_1fr]">
              <aside className="rounded-lg border border-blue-500/35 bg-blue-950/20 p-5">
                <h2 className="modded-font-sport mb-5 text-sm font-black uppercase italic tracking-widest text-blue-300">Select Start Season</h2>
                <div className="mb-4 rounded-lg border border-slate-700 bg-slate-950/80 p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Start Year</div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-xl font-black text-white">
                      <CalendarDays size={20} className="text-slate-400" />
                      {selected.label}
                    </div>
                    <ChevronDown size={20} className="text-slate-300" />
                  </div>
                </div>

                <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60">
                  {seasonOptions.map(season => {
                    const active = season.startYear === selectedStartYear;
                    const hasRosterSource = hasHistoricalNbaRosterSource(season.startYear);
                    return (
                      <button
                        key={season.startYear}
                        onMouseEnter={() => hasRosterSource && playModdedSetupSound('hover')}
                        onClick={() => {
                          playModdedSetupSound('click');
                          onChange(season.startYear);
                        }}
                        className={`flex w-full items-center justify-between border-b border-slate-800 px-4 py-3.5 text-left text-lg font-bold transition-colors last:border-b-0 ${
                          active
                            ? 'bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500'
                            : hasRosterSource
                              ? 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                              : 'text-slate-600 hover:bg-white/[0.02] hover:text-slate-400'
                        }`}
                      >
                        <span>{season.label}</span>
                        {!hasRosterSource && !active && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Not Ready</span>
                        )}
                        {active && <Check size={22} className="text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="rounded-lg border border-blue-500/25 bg-[#050814]/85 p-5">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <div>
                    <h2 className="modded-font-sport text-sm font-black uppercase italic tracking-widest text-blue-300">Season Preview</h2>
                    <div className="modded-font-sport mt-3 text-5xl font-black italic tracking-tight text-white">{selected.label}</div>
                  </div>
                  <div className="mt-7 rounded border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-sm font-black uppercase italic tracking-wider text-yellow-300">
                    Historical Start
                  </div>
                </div>

                {!selectedHasRosterSource ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 px-6 text-center">
                    <div>
                      <div className="text-sm font-black uppercase tracking-widest text-slate-500">Season Setup Not Ready</div>
                      <div className="mt-3 text-sm leading-6 text-slate-400">
                        This season is on the roadmap, but it is not startable yet.
                      </div>
                    </div>
                  </div>
                ) : preparing ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 px-6 text-center">
                    <div className="max-w-md">
                      <LoaderCircle className="mx-auto mb-4 h-9 w-9 animate-spin text-blue-400" />
                      <div className="text-sm font-black uppercase tracking-widest text-slate-300">
                        {loadSlow ? 'Still Preparing Season' : 'Preparing Season'}
                      </div>
                      <div className="mt-3 text-sm leading-6 text-slate-400">
                        {loadSlow
                          ? 'This can take longer on a weak connection. You can wait here or choose another season.'
                          : `Getting ${selected.label} ready for team selection.`}
                      </div>
                    </div>
                  </div>
                ) : showRosterError ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-6 text-center">
                    <div className="max-w-md">
                      <AlertTriangle className="mx-auto mb-4 h-9 w-9 text-amber-300" />
                      <div className="text-sm font-black uppercase tracking-widest text-amber-300">Season Unavailable</div>
                      <div className="mt-3 text-sm leading-6 text-slate-300">
                        {rosterErrorMessage}
                      </div>
                      <button
                        onClick={retrySeason}
                        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 text-xs font-black uppercase tracking-widest text-slate-950 transition-colors hover:bg-amber-400"
                      >
                        <RefreshCw size={15} />
                        Try Again
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                        <Trophy size={18} className="text-blue-400" />
                        Top Teams
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {topTeams.length === 0 ? (
                          <div className="col-span-full rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                            No team preview available for this roster year.
                          </div>
                        ) : topTeams.map(team => (
                          <div key={team.id} className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-4 text-center">
                            <TeamLogo team={team} />
                            <div className="min-h-12 text-base font-bold leading-tight text-white">{getTeamFullName(team)}</div>
                            <div className="mt-2 text-lg font-black text-slate-400">OVR {Math.round(team.strength ?? 0)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                        <Users size={18} className="text-blue-400" />
                        Notable Players
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                        {notablePlayers.length === 0 ? (
                          <div className="col-span-full rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                            No player preview available for this roster year.
                          </div>
                        ) : notablePlayers.map(({ player, k2 }) => (
                          <div
                            key={player.internalId}
                            className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50 text-center"
                            data-testid="historical-notable-player"
                            data-player-id={player.internalId}
                            data-player-name={player.name}
                            data-portrait-season={selectedStartYear}
                          >
                            <PlayerPortrait player={player} photosReady={portraitState === 'ready'} season={selectedStartYear} />
                            <div className="flex min-h-16 flex-col items-center justify-center px-2 py-2">
                              <div className="text-sm font-bold leading-tight text-white">{player.name}</div>
                              <div className="mt-1 text-xs font-black text-slate-400">OVR {k2}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                        <div className="flex items-center gap-3">
                          <DollarSign size={34} className="text-amber-400" />
                          <div>
                            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Salary Cap</div>
                            <div className="text-2xl font-black text-amber-400">{salaryCapLabel}</div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                        <div className="flex items-center gap-3">
                          <Users size={34} className="text-purple-400" />
                          <div>
                            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Teams</div>
                            <div className="text-2xl font-black text-purple-400">{teams.length}</div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                        <div className="flex items-center gap-3">
                          <Users size={34} className={externalLeaguesEnabled ? 'text-emerald-400' : 'text-slate-500'} />
                          <div>
                            <div className="text-xs font-black uppercase tracking-widest text-slate-400">External Leagues</div>
                            <div className={`text-2xl font-black ${externalLeaguesEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {externalLeaguesEnabled ? 'On' : 'Off'}
                            </div>
                            {externalLeagueSummary && (
                              <div className="mt-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-400">
                                {externalLeagueSummary}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <footer className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
              <button
                onClick={() => {
                  playModdedSetupSound('back');
                  onBack();
                }}
                className="h-14 rounded-lg border border-slate-700 bg-slate-900/80 px-8 text-sm font-black uppercase tracking-widest text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  playModdedSetupSound('success');
                  onContinue();
                }}
                disabled={!canContinue}
                className="modded-font-sport h-14 rounded-lg border border-blue-400/50 bg-gradient-to-r from-blue-700 to-indigo-900 px-10 text-sm font-black uppercase italic tracking-widest text-white shadow-[0_0_24px_rgba(37,99,235,0.28)] transition-colors hover:from-blue-600 hover:to-indigo-800 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {preparing ? 'Preparing...' : continueLabel}
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
};
