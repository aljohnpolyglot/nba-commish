import React from 'react';
import { AlertTriangle, CalendarDays, Check, LoaderCircle, RefreshCw, Trophy, Users, X } from 'lucide-react';
import { HISTORICAL_ENDESA_SEASONS } from '../../services/historicalEndesa/catalog';
import type { NBAPlayer, NBATeam } from '../../types';
import { getDisplayOverall } from '../../utils/playerRatings';
import { getTeamFullName } from '../../utils/teamNames';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { playModdedSetupSound } from './moddedSetupAudio';
import { isOnRoster } from '../../utils/teamLookup';

interface HistoricalEndesaSeasonPickerProps {
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
  leagueName?: string;
  countryName?: string;
  seasons?: ReadonlyArray<{ startYear: number; sourceSeason: number; label: string }>;
  requiredTeamCount?: number;
  seasonNote?: string;
  featuredPlayerFilter?: (player: NBAPlayer) => boolean;
  earliestPlayableNote?: string;
  statusForSeason?: (season: number) => string | undefined;
}

export function getHistoricalPickerTeamsWithoutPlayers(teams: NBATeam[], players: NBAPlayer[]): NBATeam[] {
  const staffedTeamIds = new Set(players
    .filter(isOnRoster)
    .map(player => Number(player.tid)));
  return teams.filter(team => !staffedTeamIds.has(Number(team.id)));
}

export function HistoricalEndesaSeasonPicker({
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
  leagueName = 'Liga Endesa',
  countryName = 'Spanish',
  seasons = HISTORICAL_ENDESA_SEASONS,
  requiredTeamCount = 18,
  seasonNote = 'Other European leagues join as their eras begin, and every future season unfolds uniquely.',
  featuredPlayerFilter,
  earliestPlayableNote,
  statusForSeason,
}: HistoricalEndesaSeasonPickerProps) {
  const season = seasons.find(entry => entry.startYear === selectedStartYear) ?? seasons.at(-1)!;
  const options = React.useMemo(() => [...seasons].reverse(), [seasons]);
  const activeTeamIds = React.useMemo(
    () => new Set(teams.map(team => Number(team.id))),
    [teams],
  );
  const topPlayers = React.useMemo(() => players
    .filter(player => activeTeamIds.has(Number(player.tid)))
    .filter(player => featuredPlayerFilter?.(player) ?? true)
    .sort((left, right) => getDisplayOverall(right, season.sourceSeason) - getDisplayOverall(left, season.sourceSeason))
    .slice(0, 6), [activeTeamIds, featuredPlayerFilter, players, season.sourceSeason]);
  const featuredTeams = React.useMemo(() => teams.slice(0, 6), [teams]);
  const teamsWithoutPlayers = React.useMemo(
    () => getHistoricalPickerTeamsWithoutPlayers(teams, players),
    [players, teams],
  );
  const canContinue = sourceReady
    && !loading
    && teams.length >= requiredTeamCount
    && teamsWithoutPlayers.length === 0;
  const rosterError = teamsWithoutPlayers.length > 0
    ? `${teamsWithoutPlayers.map(team => getTeamFullName(team)).join(', ')} ${teamsWithoutPlayers.length === 1 ? 'has' : 'have'} no available players for this season.`
    : null;

  return (
    <div className="modded-setup modded-scanlines min-h-screen bg-[#07090e] p-3 text-white sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-6xl items-center justify-center">
        <section className="relative w-full overflow-hidden rounded-xl border-2 border-blue-600 bg-[#0b1021] shadow-[0_0_42px_rgba(37,99,235,0.24)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.22),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(239,68,68,0.14),_transparent_38%)]" />
          <div className="relative p-4 sm:p-8">
            <button onClick={() => { playModdedSetupSound('back'); onBack(); }} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
              <X size={24} />
            </button>

            <header className="mb-6 flex items-start gap-4 pr-10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-400/60 bg-blue-500/10 text-yellow-400">
                <Trophy size={27} />
              </div>
              <div>
                <h1 className="modded-font-sport text-2xl font-black uppercase italic tracking-tight text-yellow-400 sm:text-4xl">Start {leagueName} Career</h1>
                <p className="mt-1 text-sm text-slate-400 sm:text-base">Choose the season where your {countryName} basketball story begins.</p>
              </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <aside className="rounded-xl border border-blue-500/35 bg-blue-950/20 p-4 sm:p-5">
                <h2 className="modded-font-sport mb-4 text-xs font-black uppercase italic tracking-widest text-blue-300">Select Start Season</h2>
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.07] p-4">
                  <CalendarDays size={22} className="text-orange-400" />
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{leagueName}</div>
                    <div className="text-2xl font-black">{season.label}</div>
                  </div>
                </div>
                <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-slate-800">
                  {options.map(option => {
                    const active = option.startYear === selectedStartYear;
                    return (
                      <button
                        key={option.startYear}
                        onMouseEnter={() => playModdedSetupSound('hover')}
                        onClick={() => {
                          playModdedSetupSound('click');
                          onChange(option.startYear);
                        }}
                        className={`flex w-full items-center justify-between border-b border-slate-800 px-4 py-3 text-left text-base font-bold last:border-b-0 ${active ? 'bg-orange-500/10 text-orange-300 ring-1 ring-inset ring-orange-500' : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'}`}
                      >
                        <span>{option.label}</span>
                        <span className="flex items-center gap-2">
                          {statusForSeason?.(option.sourceSeason) && (
                            <span className="hidden text-[9px] font-black uppercase tracking-wider text-slate-500 sm:inline">
                              {statusForSeason(option.sourceSeason)?.replaceAll('_', ' ')}
                            </span>
                          )}
                          {active && <Check size={19} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {season.sourceSeason === seasons[0]?.sourceSeason && earliestPlayableNote && (
                  <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3 text-xs leading-5 text-emerald-200">
                    {earliestPlayableNote}
                  </p>
                )}
              </aside>

              <div className="min-w-0 rounded-xl border border-blue-500/25 bg-[#050814]/85 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="modded-font-sport text-xs font-black uppercase italic tracking-widest text-blue-300">Season Preview</div>
                    <div className="modded-font-sport mt-1 text-4xl font-black italic sm:text-5xl">{season.label}</div>
                  </div>
                  <div className="rounded-lg border border-yellow-400/35 bg-yellow-400/10 px-3 py-2 text-xs font-black uppercase italic tracking-wider text-yellow-300">Historical Start</div>
                </div>

                {loading ? (
                  <div className="flex min-h-[430px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950/50 text-center">
                    <div className="max-w-sm px-5">
                      <LoaderCircle className="mx-auto mb-4 animate-spin text-orange-400" size={38} />
                      <div className="font-black uppercase tracking-widest text-slate-300">{loadSlow ? 'Still Preparing Season' : 'Preparing Season'}</div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">Building the clubs, players, stats, and completed history available at this date.</p>
                    </div>
                  </div>
                ) : !sourceReady || teams.length === 0 || rosterError ? (
                  <div className="flex min-h-[430px] items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/[0.06] text-center">
                    <div className="max-w-sm px-5">
                      <AlertTriangle className="mx-auto mb-4 text-amber-300" size={38} />
                      <div className="font-black uppercase tracking-widest text-amber-300">Season Unavailable</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{rosterError ?? errorMessage ?? 'This season could not be prepared.'}</p>
                      {onRetry && <button onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950"><RefreshCw size={15} />Try Again</button>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><Users size={17} className="text-orange-400" />{teams.length} Clubs</div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {featuredTeams.map(team => <div key={team.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/50 p-2 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center">{team.logoUrl ? <img src={team.logoUrl} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-black text-slate-500">{team.abbrev}</span>}</div><div className="mt-2 truncate text-[10px] font-bold text-slate-300">{getTeamFullName(team)}</div></div>)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><Trophy size={17} className="text-orange-400" />Players to Watch</div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                        {topPlayers.map(player => <div key={player.internalId} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"><div className="flex h-24 items-center justify-center overflow-hidden bg-slate-950"><PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={88} /></div><div className="p-2 text-center"><div className="truncate text-xs font-bold text-white">{player.name}</div><div className="mt-1 text-[10px] font-black text-orange-300">OVR {getDisplayOverall(player, season.sourceSeason)}</div></div></div>)}
                      </div>
                    </div>
                    {seasonNote && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm leading-6 text-slate-300">
                        Your career begins with the basketball world of this season. {seasonNote}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => { playModdedSetupSound('back'); onBack(); }} className="h-14 rounded-xl border border-slate-700 bg-slate-900 px-7 text-xs font-black uppercase tracking-widest text-slate-300 hover:bg-slate-800">Back</button>
              <button onClick={() => { playModdedSetupSound('success'); onContinue(); }} disabled={!canContinue} className="modded-font-sport h-14 rounded-lg border border-blue-400/50 bg-gradient-to-r from-blue-700 to-indigo-900 px-9 text-xs font-black uppercase italic tracking-widest text-white shadow-[0_0_24px_rgba(37,99,235,0.28)] hover:from-blue-600 hover:to-indigo-800 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500">Choose Club</button>
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}
