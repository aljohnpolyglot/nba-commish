import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Globe, Plus, Trash2, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface City {
  name: string;
  lat: number;
  lng: number;
  state?: string;
  country?: string;
}

interface CitySelectorModalProps {
  onClose: () => void;
  onConfirm: (cities: City[]) => void;
  title: string;
  description: string;
  maxSelections?: number;
  confirmLabel?: string;
  type: 'expansion';
}

const US_CITIES_URL = 'https://gist.githubusercontent.com/ahmu83/38865147cf3727d221941a2ef8c22a77/raw/c647f74643c0b3f8407c28ddbb599e9f594365ca/US_States_and_Cities.json';
const GLOBAL_CITIES_URL = 'https://gist.githubusercontent.com/randymeech/e9398d4f6fb827e2294a/raw/22925b92339f0f4c005159ae4d36f8f3988e9d39/top-1000-cities.json';

// NBA Cities to exclude (approximate list)
const NBA_CITIES = [
  'Atlanta', 'Boston', 'Brooklyn', 'Charlotte', 'Chicago', 'Cleveland', 'Dallas', 'Denver', 'Detroit', 
  'San Francisco', 'Houston', 'Indianapolis', 'Los Angeles', 'Memphis', 'Miami', 'Milwaukee', 'Minneapolis', 
  'New Orleans', 'New York', 'Oklahoma City', 'Orlando', 'Philadelphia', 'Phoenix', 'Portland', 'Sacramento', 
  'San Antonio', 'Toronto', 'Salt Lake City', 'Washington'
];

const EXTRA_CITIES: City[] = [
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332, country: 'Mexico' },
  { name: 'Montreal', lat: 45.5017, lng: -73.5673, country: 'Canada' },
  { name: 'Vancouver', lat: 49.2827, lng: -123.1207, country: 'Canada' },
  { name: 'Tijuana', lat: 32.5149, lng: -117.0382, country: 'Mexico' },
  { name: 'Guadalajara', lat: 20.6597, lng: -103.3496, country: 'Mexico' },
  { name: 'Monterrey', lat: 25.6866, lng: -100.3161, country: 'Mexico' },
  { name: 'Calgary', lat: 51.0447, lng: -114.0719, country: 'Canada' },
  { name: 'Ottawa', lat: 45.4215, lng: -75.6972, country: 'Canada' },
  { name: 'Edmonton', lat: 53.5461, lng: -113.4938, country: 'Canada' }
];

export const CitySelectorModal: React.FC<CitySelectorModalProps> = ({ onClose, onConfirm, title, description, maxSelections = 30, confirmLabel = "Confirm Selection", type }) => {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCities, setSelectedCities] = useState<City[]>([]);

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const url = US_CITIES_URL;
        const response = await fetch(url);
        const data = await response.json();
        
        const parsedCities: City[] = [];

        // Parse US States and Cities (Object with state keys)
        Object.entries(data).forEach(([state, cityList]) => {
            if (Array.isArray(cityList)) {
                cityList.forEach((cityName: any) => {
                    if (typeof cityName === 'string') {
                        parsedCities.push({
                            name: cityName,
                            lat: 0, // Mock lat/lng as it's not in the source
                            lng: 0,
                            state: state,
                            country: 'USA'
                        });
                    }
                });
            }
        });
        // Add extra cities for expansion (Canada/Mexico)
        parsedCities.push(...EXTRA_CITIES);

        // Filter and sort cities
        const filteredCities = parsedCities
          .sort((a: City, b: City) => a.name.localeCompare(b.name));
          
        setCities(filteredCities);
      } catch (error) {
        console.error("Failed to fetch cities:", error);
        // Fallback to extra cities if fetch fails
        setCities(EXTRA_CITIES);
      } finally {
        setLoading(false);
      }
    };

    fetchCities();
  }, [type]);

  const filteredList = useMemo(() => {
    if (!searchTerm) return [];
    return cities.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (c.state && c.state.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.country && c.country.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 50);
  }, [cities, searchTerm]);

  const handleAddCity = (city: City) => {
    if (!selectedCities.some(c => c.name === city.name)) {
      if (selectedCities.length < maxSelections) {
          setSelectedCities([...selectedCities, city]);
      }
    }
    setSearchTerm('');
  };

  const handleRemoveCity = (cityName: string) => {
    setSelectedCities(selectedCities.filter(c => c.name !== cityName));
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3 text-blue-400">
                <Globe size={24} />
                <h3 className="text-xl font-black uppercase tracking-tight text-white">{title}</h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl">
                <p className="text-sm text-blue-200 leading-relaxed">
                    {description}
                </p>
            </div>

            <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    Search Cities
                </label>
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Type a city name (e.g., Las Vegas, Mexico City)..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none placeholder:text-slate-700 transition-all"
                    />
                    {loading && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>

                {searchTerm && (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredList.length > 0 ? (
                            filteredList.map((city, idx) => (
                                <button
                                    key={`${city.name}-${idx}`}
                                    onClick={() => handleAddCity(city)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-900 flex items-center justify-between group transition-colors"
                                >
                                    <div>
                                        <span className="text-slate-300 font-medium group-hover:text-white block">{city.name}</span>
                                        <span className="text-xs text-slate-500">{city.country || city.state}</span>
                                    </div>
                                    <Plus size={14} className="text-slate-600 group-hover:text-blue-400" />
                                </button>
                            ))
                        ) : (
                            <div className="p-4 text-center text-slate-500 text-sm">No cities found</div>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    Selected Cities ({selectedCities.length}/{maxSelections})
                </label>
                {selectedCities.length === 0 ? (
                    <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-600">
                        <MapPin size={24} className="mb-2 opacity-50" />
                        <span className="text-sm font-medium">No cities selected yet</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedCities.map((city, idx) => (
                            <div key={`${city.name}-${idx}`} className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-800 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <Globe size={14} />
                                    </div>
                                    <div>
                                        <span className="text-slate-200 font-bold text-sm block">{city.name}</span>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">{city.country || city.state}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleRemoveCity(city.name)}
                                    className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>

          <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
            <button 
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider"
            >
                Cancel
            </button>
            <button 
                onClick={() => onConfirm(selectedCities)}
                disabled={selectedCities.length === 0}
                className="px-6 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider shadow-lg shadow-blue-600/20"
            >
                {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
