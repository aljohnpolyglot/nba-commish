import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { X, Search, Globe, User, CheckCircle2, MapPin, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBAPlayer, Contact } from '../../types';
import { getGamePhase } from '../../utils/helpers';

interface City {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  state?: string;
}

interface TravelModalProps {
  onClose: () => void;
  onConfirm: (payload: { city: string, reason: string, invitees: string[], inviteeRoles: string[] }) => void;
}

const GLOBAL_CITIES_URL = 'https://gist.githubusercontent.com/randymeech/e9398d4f6fb827e2294a/raw/22925b92339f0f4c005159ae4d36f8f3988e9d39/top-1000-cities.json';
const US_CITIES_URL = 'https://gist.githubusercontent.com/ahmu83/38865147cf3727d221941a2ef8c22a77/raw/c647f74643c0b3f8407c28ddbb599e9f594365ca/US_States_and_Cities.json';

const TravelTypeSelectionStep: React.FC<{
    onSelect: (type: 'domestic' | 'international') => void;
}> = ({ onSelect }) => (
    <div className="grid grid-cols-2 gap-4 h-full">
        <button
            onClick={() => onSelect('domestic')}
            className="flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-800/50 border-2 border-slate-700 hover:border-blue-500 hover:bg-blue-500/10 transition-all group h-64"
        >
            <div className="w-20 h-20 rounded-full bg-slate-700 group-hover:bg-blue-500/20 flex items-center justify-center mb-6 transition-colors">
                <MapPin size={40} className="text-slate-400 group-hover:text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Domestic</h3>
            <p className="text-sm text-slate-400 text-center max-w-[200px]">Travel within the US. Visit expansion candidates.</p>
        </button>
        <button
            onClick={() => onSelect('international')}
            className="flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-800/50 border-2 border-slate-700 hover:border-emerald-500 hover:bg-emerald-500/10 transition-all group h-64"
        >
            <div className="w-20 h-20 rounded-full bg-slate-700 group-hover:bg-emerald-500/20 flex items-center justify-center mb-6 transition-colors">
                <Globe size={40} className="text-slate-400 group-hover:text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">International</h3>
            <p className="text-sm text-slate-400 text-center max-w-[200px]">Travel abroad. Build global relations.</p>
        </button>
    </div>
);

const CitySelectionStep: React.FC<{
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredCities: City[];
  selectedCity: City | null;
  setSelectedCity: (city: City) => void;
  travelType: 'domestic' | 'international';
  loading: boolean;
}> = ({ searchTerm, setSearchTerm, filteredCities, selectedCity, setSelectedCity, travelType, loading }) => (
  <>
    <div className={`p-4 rounded-2xl border ${travelType === 'domestic' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
        <p className={`text-sm leading-relaxed ${travelType === 'domestic' ? 'text-blue-200' : 'text-emerald-200'}`}>
            Select a {travelType} city for your trip. Travel will take <strong>2 days</strong> and may influence relations.
        </p>
    </div>
    <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
        <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${travelType} cities...`}
            className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 outline-none placeholder:text-slate-700 transition-all focus:ring-2 ${travelType === 'domestic' ? 'focus:ring-blue-500/50 focus:border-blue-500' : 'focus:ring-emerald-500/50 focus:border-emerald-500'}`}
            autoFocus
        />
        {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
        {filteredCities.map((city, idx) => (
            <button
                key={`${city.name}-${idx}`}
                onClick={() => setSelectedCity(city)}
                className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-200 ${
                    selectedCity?.name === city.name 
                        ? travelType === 'domestic' 
                            ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10' 
                            : 'bg-emerald-600/20 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                        : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                }`}
            >
                <div className="flex items-center gap-3">
                    <MapPin size={16} className="text-slate-500" />
                    <div>
                        <span className="text-sm font-bold text-white block">{city.name}</span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                            {travelType === 'domestic' ? city.state : city.country}
                        </span>
                    </div>
                </div>
                {selectedCity?.name === city.name && <CheckCircle2 size={16} className={travelType === 'domestic' ? "text-blue-400" : "text-emerald-400"} />}
            </button>
        ))}
        {!loading && filteredCities.length === 0 && (
            <div className="col-span-2 text-center p-8 text-slate-500 text-sm">
                No cities found matching "{searchTerm}"
            </div>
        )}
    </div>
  </>
);

const TravelDetailsStep: React.FC<{
  reason: string;
  setReason: (reason: string) => void;
  isSeason: boolean;
  inviteeSearch: string;
  setInviteeSearch: (term: string) => void;
  filteredInvitees: Contact[];
  selectedInvitees: Contact[];
  setSelectedInvitees: (invitees: Contact[]) => void;
  travelType: 'domestic' | 'international';
}> = ({ reason, setReason, isSeason, inviteeSearch, setInviteeSearch, filteredInvitees, selectedInvitees, setSelectedInvitees, travelType }) => (
  <div className="space-y-6">
      <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reason for Travel <span className="text-rose-500">*</span></label>
          <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Scouting talent, business meeting, vacation..."
              className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 outline-none placeholder:text-slate-700 transition-all focus:ring-2 ${travelType === 'domestic' ? 'focus:ring-blue-500/50 focus:border-blue-500' : 'focus:ring-emerald-500/50 focus:border-emerald-500'}`}
          />
      </div>

      <div className="space-y-4">
          <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Invite Guests (Optional)</label>
              {isSeason && (
                  <div className="flex items-center gap-1.5 text-amber-500">
                      <AlertCircle size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-tight">Season: Players/Coaches Unavailable</span>
                  </div>
              )}
          </div>
          <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                  type="text"
                  value={inviteeSearch}
                  onChange={(e) => setInviteeSearch(e.target.value)}
                  placeholder="Search contacts to invite..."
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 outline-none placeholder:text-slate-700 transition-all focus:ring-2 ${travelType === 'domestic' ? 'focus:ring-blue-500/50 focus:border-blue-500' : 'focus:ring-emerald-500/50 focus:border-emerald-500'}`}
              />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
              {filteredInvitees.map(contact => {
                  const isSelected = selectedInvitees.some(i => i.id === contact.id);
                  return (
                      <button
                          key={contact.id}
                          onClick={() => {
                              if (isSelected) setSelectedInvitees(selectedInvitees.filter(i => i.id !== contact.id));
                              else setSelectedInvitees([...selectedInvitees, contact]);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                              isSelected 
                                  ? travelType === 'domestic' 
                                      ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10' 
                                      : 'bg-emerald-600/20 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                      >
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                              {contact.playerPortraitUrl ? <img src={contact.playerPortraitUrl} alt={contact.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <User size={14} className="text-slate-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold truncate text-white">{contact.name}</div>
                              <div className="text-[10px] text-slate-500 truncate">{contact.title}</div>
                          </div>
                          {isSelected && <CheckCircle2 size={14} className={travelType === 'domestic' ? "text-blue-400" : "text-emerald-400"} />}
                      </button>
                  );
              })}
              {filteredInvitees.length === 0 && (
                  <div className="col-span-2 text-center p-4 text-slate-500 text-xs">
                      No contacts found
                  </div>
              )}
          </div>
      </div>
  </div>
);

export const TravelModal: React.FC<TravelModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const [step, setStep] = useState<'type' | 'city' | 'details'>('type');
  const [travelType, setTravelType] = useState<'domestic' | 'international' | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [reason, setReason] = useState('');
  const [selectedInvitees, setSelectedInvitees] = useState<Contact[]>([]);
  const [inviteeSearch, setInviteeSearch] = useState('');

  const gamePhase = getGamePhase(state.date);
  const isSeason = gamePhase.includes('Regular Season') || gamePhase.includes('Playoffs');

  useEffect(() => {
    if (!travelType) return;

    setLoading(true);
    setCities([]);
    const url = travelType === 'domestic' ? US_CITIES_URL : GLOBAL_CITIES_URL;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        const parsedCities: City[] = [];
        
        if (travelType === 'domestic') {
             // Parse US States and Cities (Object with state keys)
             Object.entries(data).forEach(([state, cityList]) => {
                if (Array.isArray(cityList)) {
                    cityList.forEach((cityName: any) => {
                        if (typeof cityName === 'string') {
                            parsedCities.push({
                                name: cityName,
                                lat: 0, 
                                lng: 0,
                                country: 'USA',
                                state: state
                            });
                        }
                    });
                }
            });
        } else {
            if (Array.isArray(data)) {
                parsedCities.push(...data.map((c: any) => ({ name: c.name, lat: c.lat, lng: c.lng })));
            }
        }
        setCities(parsedCities);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [travelType]);

  const filteredCities = useMemo(() => {
    if (!searchTerm) return [];
    return cities.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.state && c.state.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.country && c.country.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 50);
  }, [cities, searchTerm]);

  const allInvitees = useMemo(() => {
    const contactsMap = new Map<string, Contact>();
    const { staff, players, teams } = state;

    if (staff) {
        staff.gms.forEach(gm => contactsMap.set(`gm-${gm.name}`, { 
            id: `gm-${gm.name}`, name: gm.name, title: 'General Manager', organization: gm.team || 'NBA', type: 'gm' as const, playerPortraitUrl: gm.playerPortraitUrl 
        }));
        staff.owners.forEach(o => contactsMap.set(`owner-${o.name}`, { 
            id: `owner-${o.name}`, name: o.name, title: 'Owner', organization: o.team || 'NBA', type: 'owner' as const, playerPortraitUrl: o.playerPortraitUrl 
        }));
        
        // Season restriction for coaches
        if (!isSeason) {
            staff.coaches.forEach(c => contactsMap.set(`coach-${c.name}`, { 
                id: `coach-${c.name}`, name: c.name, title: 'Head Coach', organization: c.team || 'NBA', type: 'coach' as const, playerPortraitUrl: c.playerPortraitUrl 
            }));
        }
    }
    
    // Season restriction for players
    if (!isSeason) {
        players.filter(p => p.status !== 'Retired').forEach(p => {
            contactsMap.set(p.internalId, {
                id: p.internalId, name: p.name, title: 'Player', organization: p.tid >= 0 ? teams.find(t => t.id === p.tid)?.name || 'NBA' : 'Free Agent', type: 'player' as const, playerPortraitUrl: p.imgURL
            });
        });
    }
    
    // Include WNBA players regardless of season (assuming different schedule or just available)
    // This will overwrite existing entries if they exist (e.g. if !isSeason included them), which is fine.
    // We want to ensure they are marked as WNBA if they are WNBA.
    players.filter(p => p.status === 'WNBA' || p.tid === -100).forEach(p => {
        contactsMap.set(p.internalId, {
            id: p.internalId, name: p.name, title: 'WNBA', organization: 'WNBA', type: 'player' as const, playerPortraitUrl: p.imgURL
        });
    });
    
    return Array.from(contactsMap.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [state, isSeason]);

  const filteredInvitees = useMemo(() => {
    return allInvitees.filter(c => 
        c.name.toLowerCase().includes(inviteeSearch.toLowerCase()) ||
        c.organization.toLowerCase().includes(inviteeSearch.toLowerCase())
    ).slice(0, 50);
  }, [allInvitees, inviteeSearch]);

  const handleConfirm = () => {
    if (selectedCity && reason.trim()) {
      onConfirm({
        city: selectedCity.name,
        reason: reason,
        invitees: selectedInvitees.map(i => i.name),
        inviteeRoles: selectedInvitees.map(i => i.title)
      });
    }
  };

  const handleTypeSelect = (type: 'domestic' | 'international') => {
      setTravelType(type);
      setStep('city');
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
            <div className={`flex items-center gap-3 ${travelType === 'domestic' ? 'text-blue-400' : 'text-emerald-400'}`}>
                {travelType === 'domestic' ? <MapPin size={24} /> : <Globe size={24} />}
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                    {step === 'type' ? 'Select Travel Type' : step === 'city' ? 'Select Destination' : `Travel to ${selectedCity?.name}`}
                </h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {step === 'type' ? (
                <TravelTypeSelectionStep onSelect={handleTypeSelect} />
            ) : step === 'city' ? (
                <CitySelectionStep 
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    filteredCities={filteredCities}
                    selectedCity={selectedCity}
                    setSelectedCity={setSelectedCity}
                    travelType={travelType!}
                    loading={loading}
                />
            ) : (
                <TravelDetailsStep 
                    reason={reason}
                    setReason={setReason}
                    isSeason={isSeason}
                    inviteeSearch={inviteeSearch}
                    setInviteeSearch={setInviteeSearch}
                    filteredInvitees={filteredInvitees}
                    selectedInvitees={selectedInvitees}
                    setSelectedInvitees={setSelectedInvitees}
                    travelType={travelType!}
                />
            )}
          </div>

          <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider">
                Cancel
            </button>
            {step === 'type' ? (
                // No next button, selection moves to next step
                null
            ) : step === 'city' ? (
                <button 
                    onClick={() => setStep('details')}
                    disabled={!selectedCity}
                    className={`px-6 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 transition-all uppercase tracking-wider ${travelType === 'domestic' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                    Next: Trip Details
                </button>
            ) : (
                <button 
                    onClick={handleConfirm}
                    disabled={!reason.trim()}
                    className={`px-6 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 transition-all uppercase tracking-wider ${travelType === 'domestic' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                    Confirm Trip
                </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
