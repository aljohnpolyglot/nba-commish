import React, { useState, useEffect, useMemo } from 'react';
import { X, Globe, Search, MapPin } from 'lucide-react';
import { NBATeam } from '../../types';
import { getOpeningNightDate, toISODateString } from '../../utils/dateUtils';

interface City {
  name: string;
  lat: number;
  lng: number;
  country?: string;
}

interface GlobalGamesModalProps {
  teams: NBATeam[];
  onClose: () => void;
  onConfirm: (games: { homeTid: number; awayTid: number; date: string; city: string; country: string }[]) => void;
  seasonYear?: number;
}

const GLOBAL_CITIES_URL = 'https://gist.githubusercontent.com/randymeech/e9398d4f6fb827e2294a/raw/22925b92339f0f4c005159ae4d36f8f3988e9d39/top-1000-cities.json';

const FALLBACK_CITIES: City[] = [
  { name: 'Paris', lat: 48.8566, lng: 2.3522, country: 'France' },
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'United Kingdom' },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, country: 'Germany' },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan' },
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332, country: 'Mexico' },
  { name: 'Abu Dhabi', lat: 24.4539, lng: 54.3773, country: 'United Arab Emirates' },
  { name: 'Athens', lat: 37.9838, lng: 23.7275, country: 'Greece' },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038, country: 'Spain' }
];

export const GlobalGamesModal: React.FC<GlobalGamesModalProps> = ({ teams, onClose, onConfirm, seasonYear = 2026 }) => {
  const openingNightMs = getOpeningNightDate(seasonYear).getTime();
  const regularSeasonEnd = new Date(Date.UTC(seasonYear - 1, 3, 15)).getTime(); // Apr 15 of pre-season year
  const [games, setGames] = useState<{ homeTid: number; awayTid: number; date: string; city: string; country: string }[]>([
    { homeTid: -1, awayTid: -1, date: '2026-01-15', city: '', country: '' }
  ]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [citySearchTerms, setCitySearchTerms] = useState<string[]>(['']);
  const [activeCitySearchIndex, setActiveCitySearchIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch(GLOBAL_CITIES_URL)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          // Filter out US cities for global games
          const internationalCities = data
            .filter((c: any) => c.country !== 'United States')
            .map((c: any) => ({
              name: c.name,
              lat: c.lat,
              lng: c.lng,
              country: c.country
            }));
          setCities(internationalCities.length > 0 ? internationalCities : FALLBACK_CITIES);
        } else {
          setCities(FALLBACK_CITIES);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setCities(FALLBACK_CITIES);
        setLoading(false);
      });
  }, []);

  const addGame = () => {
    if (games.length < 5) {
      setGames([...games, { homeTid: -1, awayTid: -1, date: '2026-01-15', city: '', country: '' }]);
      setCitySearchTerms([...citySearchTerms, '']);
    }
  };

  const removeGame = (index: number) => {
    const newGames = [...games];
    newGames.splice(index, 1);
    setGames(newGames.length > 0 ? newGames : [{ homeTid: -1, awayTid: -1, date: '2026-01-15', city: '', country: '' }]);
    
    const newSearchTerms = [...citySearchTerms];
    newSearchTerms.splice(index, 1);
    setCitySearchTerms(newSearchTerms.length > 0 ? newSearchTerms : ['']);
  };

  const updateGame = (index: number, field: keyof typeof games[0], value: any) => {
    const newGames = [...games];
    newGames[index] = { ...newGames[index], [field]: value };
    setGames(newGames);
  };

  const getFilteredCities = (index: number) => {
    const term = citySearchTerms[index].toLowerCase();
    if (!term) return [];
    return cities.filter(c => 
      c.name.toLowerCase().includes(term) || 
      (c.country && c.country.toLowerCase().includes(term))
    ).slice(0, 10);
  };

  const activeGames = games.map((g, i) => {
    const term = citySearchTerms[i] || '';
    const displayCity = g.city || (term.includes(',') ? term.split(',')[0].trim() : term.trim());
    const displayCountry = g.country || (term.includes(',') ? term.split(',')[1].trim() : '');
    return { ...g, displayCity, displayCountry };
  }).filter(g => g.homeTid !== -1 || g.awayTid !== -1 || g.displayCity !== '');

  const isValid = activeGames.length > 0 && activeGames.every(g => {
    const gameDate = new Date(g.date).getTime();
    const minDate = openingNightMs;
    const maxDate = regularSeasonEnd;
    
    return (
      g.homeTid !== -1 && 
      g.awayTid !== -1 && 
      g.homeTid !== g.awayTid && 
      g.date !== '' && 
      g.displayCity !== '' &&
      !isNaN(gameDate) &&
      gameDate >= minDate &&
      gameDate <= maxDate
    );
  });

  const usedTeamIds = new Set<number>();
  games.forEach(g => {
    if (g.homeTid !== -1) usedTeamIds.add(g.homeTid);
    if (g.awayTid !== -1) usedTeamIds.add(g.awayTid);
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 md:p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              <Globe className="text-blue-500" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Global Games</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Schedule International Matchups</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4">
            <p className="text-sm text-slate-400 leading-relaxed italic">
              "Commissioner, expanding our global footprint is key to revenue growth. Select up to 5 matchups to be played internationally this season (Oct 24 - Apr 15)."
            </p>
          </div>

          <div className="space-y-4">
            {games.map((game, index) => (
              <div 
                key={index} 
                className="flex flex-col gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 group animate-in slide-in-from-bottom-2 duration-300" 
                style={{ 
                  animationDelay: `${index * 50}ms`,
                  zIndex: activeCitySearchIndex === index ? 50 : 1
                }}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-bold text-sm">Game {index + 1}</h4>
                  <button 
                    onClick={() => removeGame(index)}
                    className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Away Team</label>
                    <select
                      value={game.awayTid}
                      onChange={(e) => updateGame(index, 'awayTid', parseInt(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    >
                      <option value="-1">Select Team</option>
                      {teams.map(t => (
                        <option 
                          key={t.id} 
                          value={t.id} 
                          disabled={usedTeamIds.has(t.id) && game.awayTid !== t.id}
                        >
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Home Team</label>
                    <select
                      value={game.homeTid}
                      onChange={(e) => updateGame(index, 'homeTid', parseInt(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    >
                      <option value="-1">Select Team</option>
                      {teams.map(t => (
                        <option 
                          key={t.id} 
                          value={t.id} 
                          disabled={usedTeamIds.has(t.id) && game.homeTid !== t.id}
                        >
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Date</label>
                    <input
                      type="date"
                      value={game.date}
                      min="2025-10-24"
                      max="2026-04-15"
                      onChange={(e) => updateGame(index, 'date', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5 relative">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">International City</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                      <input
                        type="text"
                        value={citySearchTerms[index]}
                        onFocus={() => {
                          setActiveCitySearchIndex(index);
                        }}
                        onBlur={() => {
                          // Small delay to allow onMouseDown to fire
                          setTimeout(() => setActiveCitySearchIndex(null), 200);
                        }}
                        onChange={(e) => {
                          const newTerms = [...citySearchTerms];
                          newTerms[index] = e.target.value;
                          setCitySearchTerms(newTerms);
                          setActiveCitySearchIndex(index);
                          if (game.city) {
                            updateGame(index, 'city', '');
                            updateGame(index, 'country', '');
                          }
                        }}
                        placeholder="Search city..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      />
                    </div>
                    {activeCitySearchIndex === index && citySearchTerms[index] && !game.city && (
                      <div className="absolute z-[100] w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-40 overflow-y-auto custom-scrollbar">
                        {loading ? (
                          <div className="p-3 text-center text-xs text-slate-500">Loading cities...</div>
                        ) : getFilteredCities(index).length > 0 ? (
                          getFilteredCities(index).map((city, cIdx) => (
                            <button
                              key={cIdx}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                updateGame(index, 'city', city.name);
                                updateGame(index, 'country', city.country || '');
                                const newTerms = [...citySearchTerms];
                                newTerms[index] = city.country && city.country.trim() ? `${city.name}, ${city.country.trim()}` : city.name;
                                setCitySearchTerms(newTerms);
                                setActiveCitySearchIndex(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                              <MapPin size={12} className="text-slate-500" />
                              <span>{city.name}{city.country && city.country.trim() ? `, ${city.country.trim()}` : ''}</span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-slate-500">No cities found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {games.length < 5 && (
            <button 
              onClick={addGame}
              className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all font-bold text-sm flex items-center justify-center gap-2"
            >
              Add Another Game
            </button>
          )}
        </div>

        <div className="p-6 md:p-8 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white transition-colors"
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
            className={`px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all shadow-xl ${
              isValid 
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 hover:scale-105 active:scale-95' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Confirm Schedule
          </button>
        </div>
      </div>
    </div>
  );
};
