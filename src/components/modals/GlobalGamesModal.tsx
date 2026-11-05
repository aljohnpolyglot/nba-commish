import React, { useState, useEffect, useMemo } from 'react';
import { X, Globe, MapPin, Sparkles, Star } from 'lucide-react';
import { NBAPlayer, NBATeam, type LeagueStats } from '../../types';
import { toISODateString } from '../../utils/dateUtils';
import { getLeagueCalendarDates } from '../../services/leagueCalendar';
import {
  buildGlobalGameRecommendations,
  DEFAULT_GLOBAL_GAME_CITIES,
  getGlobalCityMarketScore,
  loadGlobalGameCities,
  type GlobalGameCity,
} from '../../services/globalGamesRecommendations';
import { getTeamFullName } from '../../utils/teamNames';
import { CountryFlag } from '../shared/CountryFlag';
import { GlobalGameSelectorCard, type GlobalGameDraft } from './GlobalGameSelectorCard';
import { loadPbaVenues, type PbaVenue } from '../../services/pba/venues';

interface GlobalGamesModalProps {
  teams: NBATeam[];
  players: NBAPlayer[];
  onClose: () => void;
  onConfirm: (games: GlobalGameDraft[]) => void;
  seasonYear?: number;
  leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>;
  variant?: 'global' | 'pba-opening-night';
  fixedDate?: string;
  initialGames?: GlobalGameDraft[];
}

const RECOMMENDATION_ACCENTS = [
  'border-l-blue-500',
  'border-l-violet-500',
  'border-l-cyan-400',
  'border-l-amber-400',
  'border-l-rose-500',
] as const;

export const GlobalGamesModal: React.FC<GlobalGamesModalProps> = ({
  teams,
  players,
  onClose,
  onConfirm,
  seasonYear = 2026,
  leagueStats,
  variant = 'global',
  fixedDate,
  initialGames,
}) => {
  const isPbaOpeningNight = variant === 'pba-opening-night';
  const calendarDates = getLeagueCalendarDates(seasonYear, leagueStats);
  const openingNightMs = calendarDates.regularSeasonStart.getTime();
  const regularSeasonEnd = calendarDates.regularSeasonEnd.getTime();
  const defaultDate = fixedDate ?? toISODateString(new Date(openingNightMs + Math.max(0, regularSeasonEnd - openingNightMs) / 2));
  const emptyGame: GlobalGameDraft = { homeTid: -1, awayTid: -1, date: defaultDate, city: '', country: '' };
  const [games, setGames] = useState<GlobalGameDraft[]>(
    initialGames?.length ? initialGames.slice(0, isPbaOpeningNight ? 1 : 5) : [emptyGame],
  );
  const [cities, setCities] = useState<GlobalGameCity[]>([]);
  const [pbaVenues, setPbaVenues] = useState<PbaVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [citySearchTerms, setCitySearchTerms] = useState<string[]>(['']);
  const [activeCitySearchIndex, setActiveCitySearchIndex] = useState<number | null>(null);
  const [expandedGames, setExpandedGames] = useState<boolean[]>([true]);

  useEffect(() => {
    if (isPbaOpeningNight) {
      loadPbaVenues(seasonYear)
        .then(venues => {
          setPbaVenues(venues);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
      return;
    }
    loadGlobalGameCities()
      .then(internationalCities => {
        setCities(internationalCities);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setCities(DEFAULT_GLOBAL_GAME_CITIES);
        setLoading(false);
      });
  }, [isPbaOpeningNight, seasonYear]);

  const recommendations = useMemo(() => isPbaOpeningNight ? [] : buildGlobalGameRecommendations({
    teams,
    players,
    seasonYear,
    regularSeasonStart: toISODateString(calendarDates.regularSeasonStart),
    regularSeasonEnd: toISODateString(calendarDates.regularSeasonEnd),
    cities: cities.length > 0 ? cities : DEFAULT_GLOBAL_GAME_CITIES,
  }), [calendarDates.regularSeasonEnd, calendarDates.regularSeasonStart, cities, isPbaOpeningNight, players, seasonYear, teams]);

  const useRecommendations = () => {
    setGames(recommendations.map(({ homeTid, awayTid, date, city, country }) => ({
      homeTid,
      awayTid,
      date,
      city,
      country,
    })));
    setCitySearchTerms(recommendations.map(game => `${game.city}, ${game.country}`));
    setExpandedGames(recommendations.map(() => true));
  };

  const addGame = () => {
    if (!isPbaOpeningNight && games.length < 5) {
      setGames([...games, emptyGame]);
      setCitySearchTerms([...citySearchTerms, '']);
      setExpandedGames([...expandedGames, true]);
    }
  };

  const removeGame = (index: number) => {
    const newGames = [...games];
    newGames.splice(index, 1);
    setGames(newGames.length > 0 ? newGames : [emptyGame]);
    
    const newSearchTerms = [...citySearchTerms];
    newSearchTerms.splice(index, 1);
    setCitySearchTerms(newSearchTerms.length > 0 ? newSearchTerms : ['']);

    const newExpandedGames = [...expandedGames];
    newExpandedGames.splice(index, 1);
    setExpandedGames(newExpandedGames.length > 0 ? newExpandedGames : [true]);
  };

  const updateGame = <K extends keyof GlobalGameDraft>(index: number, field: K, value: GlobalGameDraft[K]) => {
    setGames(current => current.map((game, gameIndex) => (
      gameIndex === index ? { ...game, [field]: value } : game
    )));
  };

  const updateGameLocation = (index: number, city: string, country: string) => {
    setGames(current => current.map((game, gameIndex) => (
      gameIndex === index ? { ...game, city, country } : game
    )));
  };

  const getFilteredCities = (index: number) => {
    const term = (citySearchTerms[index] ?? '').toLowerCase();
    if (!term) return [];
    return cities.filter(c => 
      c.name.toLowerCase().includes(term) || 
      (c.country && c.country.toLowerCase().includes(term))
    ).sort((left, right) => getGlobalCityMarketScore(right) - getGlobalCityMarketScore(left)).slice(0, 10);
  };

  const resolvedGames = games.map((g, i) => {
    const term = citySearchTerms[i] || '';
    const displayCity = g.city || (term.includes(',') ? term.split(',')[0].trim() : term.trim());
    const displayCountry = g.country || (term.includes(',') ? term.split(',')[1].trim() : '');
    return { ...g, displayCity, displayCountry };
  });
  const activeGames = resolvedGames.filter(g => g.homeTid !== -1 || g.awayTid !== -1 || g.displayCity !== '');

  const isGameConfigured = (g: typeof resolvedGames[number]) => {
    const gameDate = new Date(g.date).getTime();
    if (isPbaOpeningNight) {
      return (
        g.homeTid !== -1
        && g.awayTid !== -1
        && g.homeTid !== g.awayTid
        && g.date === defaultDate
        && g.venue?.trim() !== ''
        && g.displayCity !== ''
      );
    }
    return (
      g.homeTid !== -1 &&
      g.awayTid !== -1 &&
      g.homeTid !== g.awayTid &&
      g.date !== '' &&
      g.displayCity !== '' &&
      !isNaN(gameDate) &&
      gameDate >= openingNightMs &&
      gameDate <= regularSeasonEnd
    );
  };
  const isValid = activeGames.length > 0 && activeGames.every(isGameConfigured);

  const usedTeamIds = new Set<number>();
  games.forEach(g => {
    if (g.homeTid !== -1) usedTeamIds.add(g.homeTid);
    if (g.awayTid !== -1) usedTeamIds.add(g.awayTid);
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)]">
        <div className="p-4 sm:p-6 md:p-8 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-900/50">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              {isPbaOpeningNight ? <MapPin className="text-blue-500" size={24} /> : <Globe className="text-blue-500" size={24} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">{isPbaOpeningNight ? 'PBA Opening Night' : 'Global Games'}</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{isPbaOpeningNight ? 'Choose the matchup and venue' : 'Schedule International Matchups'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white flex-shrink-0">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 custom-scrollbar">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4">
            <p className="text-sm text-slate-400 leading-relaxed italic">
              {isPbaOpeningNight
                ? 'Choose the two teams that will open the Philippine Cup and the arena that will host opening night.'
                : '"Commissioner, expanding our global footprint is key to revenue growth. Select up to 5 matchups to be played internationally this season."'}
            </p>
          </div>

          {recommendations.length > 0 && (
            <section className="overflow-hidden rounded-[1.75rem] border border-blue-400/20 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.13),transparent_46%),linear-gradient(145deg,rgba(15,38,76,0.96),rgba(8,25,50,0.96))] p-4 shadow-[0_22px_70px_rgba(2,12,27,0.35)] sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-blue-400/70 bg-blue-500/10 text-blue-300 shadow-[inset_0_0_18px_rgba(59,130,246,0.12)] sm:size-14">
                    <Star size={26} strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black uppercase tracking-wide text-white sm:text-xl">Recommended slate</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-sm">Basketball interest, market size, team strength, and roster connections.</p>
                  </div>
                </div>
                <button onClick={useRecommendations} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300/40 bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 lg:w-auto lg:min-w-64">
                  <Sparkles size={16} /> Use recommendations
                </button>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {recommendations.map((game, index) => {
                  const awayTeam = teams.find(team => team.id === game.awayTid);
                  const homeTeam = teams.find(team => team.id === game.homeTid);
                  return (
                    <article
                      key={`${game.city}-${game.homeTid}-${game.awayTid}`}
                      className={`rounded-2xl border border-l-[6px] border-slate-500/60 ${RECOMMENDATION_ACCENTS[index % RECOMMENDATION_ACCENTS.length]} bg-slate-950/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:p-5`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <CountryFlag
                              country={game.country}
                              className="inline-flex h-6 w-9 rounded-sm sm:h-7 sm:w-10"
                              imageClassName="h-full w-full rounded-sm object-cover"
                            />
                            <h4 className="min-w-0 text-base font-black leading-tight text-white sm:text-lg">
                              {game.city}, {game.country}
                            </h4>
                            <MapPin size={15} className="hidden shrink-0 text-slate-300 sm:block" />
                          </div>
                          <p className="mt-2 text-sm text-slate-300 sm:text-base">
                            {getTeamFullName(awayTeam)} vs {getTeamFullName(homeTeam)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {[awayTeam, homeTeam].map(team => (
                            <div key={team?.id ?? getTeamFullName(team)} className="flex size-11 items-center justify-center sm:size-14">
                              {team?.logoUrl ? (
                                <img
                                  src={team.logoUrl}
                                  alt={getTeamFullName(team)}
                                  className="max-h-full max-w-full object-contain drop-shadow-lg"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-[10px] font-black text-slate-400">{team?.abbrev ?? '—'}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {[
                          { value: game.marketFit, label: 'Market fit' },
                          { value: game.matchupStrength, label: 'Matchup strength' },
                          {
                            value: game.rosterConnections,
                            label: `Roster connection${game.rosterConnections === 1 ? '' : 's'}`,
                          },
                        ].map(metric => (
                          <div key={metric.label} className="inline-flex items-center gap-2 rounded-lg border border-blue-300/10 bg-slate-950/30 px-2 py-1.5">
                            <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-sm font-black tabular-nums text-sky-300">{metric.value}</span>
                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-300 sm:text-[10px]">{metric.label}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <div className="space-y-3">
            {games.map((game, index) => {
              const resolvedGame = resolvedGames[index];
              return (
                <GlobalGameSelectorCard
                  key={index}
                  index={index}
                  game={game}
                  teams={teams}
                  usedTeamIds={usedTeamIds}
                  citySearchTerm={citySearchTerms[index] ?? ''}
                  filteredCities={getFilteredCities(index)}
                  displayCity={resolvedGame.displayCity}
                  displayCountry={resolvedGame.displayCountry}
                  configured={isGameConfigured(resolvedGame)}
                  expanded={expandedGames[index] ?? true}
                  active={activeCitySearchIndex === index}
                  loading={loading}
                  minDate={isPbaOpeningNight ? defaultDate : toISODateString(calendarDates.regularSeasonStart)}
                  maxDate={isPbaOpeningNight ? defaultDate : toISODateString(calendarDates.regularSeasonEnd)}
                  venueOptions={isPbaOpeningNight ? pbaVenues : undefined}
                  onUpdate={(field, value) => updateGame(index, field, value)}
                  onSearchFocus={() => setActiveCitySearchIndex(index)}
                  onSearchBlur={() => setTimeout(() => setActiveCitySearchIndex(null), 200)}
                  onSearchChange={value => {
                    const newTerms = [...citySearchTerms];
                    newTerms[index] = value;
                    setCitySearchTerms(newTerms);
                    setActiveCitySearchIndex(index);
                    if (game.city) {
                      updateGameLocation(index, '', '');
                    }
                  }}
                  onSelectCity={city => {
                    updateGameLocation(index, city.name, city.country);
                    const newTerms = [...citySearchTerms];
                    newTerms[index] = `${city.name}, ${city.country}`;
                    setCitySearchTerms(newTerms);
                    setActiveCitySearchIndex(null);
                  }}
                  onToggle={() => setExpandedGames(current => current.map((value, gameIndex) => gameIndex === index ? !value : value))}
                  onRemove={() => removeGame(index)}
                />
              );
            })}
          </div>

          {!isPbaOpeningNight && games.length < 5 && (
            <button 
              onClick={addGame}
              className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all font-bold text-sm flex items-center justify-center gap-2"
            >
              Add Another Game
            </button>
          )}
        </div>

        <div className="p-4 sm:p-6 md:p-8 border-t border-slate-800 bg-slate-900/50 flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4">
          <button 
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(activeGames.map(({ displayCity, displayCountry, ...g }) => ({
              ...g,
              city: displayCity,
              country: displayCountry
            })))}
            disabled={!isValid}
            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all shadow-xl ${
              isValid 
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 hover:scale-105 active:scale-95' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isPbaOpeningNight ? 'Confirm Opening Night' : 'Confirm Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
};
