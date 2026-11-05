import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Globe2, MapPin, Plane, Search, Send, Users } from 'lucide-react';
import type { Contact } from '../../types';
import { loadGlobalGameCities, type GlobalGameCity } from '../../services/globalGamesRecommendations';
import { useGame } from '../../store/GameContext';
import { getGamePhase } from '../../utils/helpers';
import { CountryFlag } from '../shared/CountryFlag';
import { ActionInfoPanel } from '../shared/actions/ActionInfoPanel';
import { ActionModalShell } from '../shared/actions/ActionModalShell';
import { ActionTextField } from '../shared/actions/ActionTextField';
import { PersonSelectorModal } from './PersonSelectorModal';

type TravelType = 'domestic' | 'international';
type TravelStep = 'type' | 'city' | 'people' | 'reason' | 'confirm';

interface TravelCity extends GlobalGameCity {
  state?: string;
}

interface TravelModalProps {
  onClose: () => void;
  onConfirm: (payload: {
    city: string;
    country: string;
    travelType: TravelType;
    reason: string;
    invitees: string[];
    inviteeRoles: string[];
    contacts: Contact[];
  }) => void;
}

const US_CITIES_URL = 'https://gist.githubusercontent.com/ahmu83/38865147cf3727d221941a2ef8c22a77/raw/c647f74643c0b3f8407c28ddbb599e9f594365ca/US_States_and_Cities.json';

async function loadDomesticCities(): Promise<TravelCity[]> {
  const response = await fetch(US_CITIES_URL);
  if (!response.ok) throw new Error(`Domestic cities request failed (${response.status})`);
  const data = await response.json();
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data as Record<string, unknown>).flatMap(([state, cityList]) => {
    if (!Array.isArray(cityList)) return [];
    return cityList.flatMap((cityName): TravelCity[] => typeof cityName === 'string'
      ? [{ name: cityName, country: 'United States', state }]
      : []);
  });
}

export function TravelModal({ onClose, onConfirm }: TravelModalProps) {
  const { state } = useGame();
  const [step, setStep] = useState<TravelStep>('type');
  const [travelType, setTravelType] = useState<TravelType | null>(null);
  const [cities, setCities] = useState<TravelCity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<TravelCity | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [reason, setReason] = useState('');

  const phase = getGamePhase(state.date, state.leagueStats);
  const inSeason = phase.includes('Regular Season') || phase.includes('Playoffs');
  const filteredCities = useMemo(() => {
    const query = citySearch.trim().toLowerCase();
    if (!query) return [];
    return cities
      .filter(city => `${city.name} ${city.state ?? ''} ${city.country}`.toLowerCase().includes(query))
      .slice(0, 60);
  }, [cities, citySearch]);

  useEffect(() => {
    if (!travelType) return;
    let active = true;
    setLoadingCities(true);
    setCities([]);
    const request = travelType === 'domestic' ? loadDomesticCities() : loadGlobalGameCities();
    request
      .then(result => {
        if (active) setCities(result);
      })
      .catch(error => console.error('Failed to load travel cities', error))
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => {
      active = false;
    };
  }, [travelType]);

  const chooseType = (type: TravelType) => {
    setTravelType(type);
    setSelectedCity(null);
    setCitySearch('');
    setStep('city');
  };

  const goBack = () => {
    if (step === 'city') setStep('type');
    if (step === 'people') setStep('city');
    if (step === 'reason') setStep('people');
    if (step === 'confirm') setStep('reason');
  };

  if (step === 'type') {
    return (
      <ActionModalShell
        title="Select Travel Type"
        icon={<Globe2 size={24} />}
        accent="emerald"
        compact
        onClose={onClose}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            ['domestic', 'Domestic', 'Travel within the US. Visit expansion candidates.', MapPin],
            ['international', 'International', 'Travel abroad. Build global relations.', Globe2],
          ] as const).map(([type, label, copy, Icon]) => (
            <button
              key={type}
              type="button"
              onClick={() => chooseType(type)}
              className="group flex min-h-52 flex-col items-center justify-center rounded-2xl border border-slate-600/60 bg-slate-800/35 p-6 text-center transition hover:border-emerald-400/70 hover:bg-emerald-500/[0.06]"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700/80 text-slate-400 transition group-hover:bg-emerald-500/15 group-hover:text-emerald-300">
                <Icon size={32} />
              </span>
              <span className="mt-5 text-lg font-black text-white">{label}</span>
              <span className="mt-2 max-w-48 text-xs leading-relaxed text-slate-400">{copy}</span>
            </button>
          ))}
        </div>
      </ActionModalShell>
    );
  }

  if (step === 'city') {
    return (
      <ActionModalShell
        title={travelType === 'international' ? 'Select International Destination' : 'Select Domestic Destination'}
        description="Choose where the trip will take place."
        icon={<MapPin size={28} />}
        accent={travelType === 'international' ? 'emerald' : 'sky'}
        onClose={onClose}
        onBack={goBack}
        primaryLabel="Next: Select Travelers"
        primaryDisabled={!selectedCity}
        onPrimary={() => setStep('people')}
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={17} />
            <input
              value={citySearch}
              onChange={event => setCitySearch(event.target.value)}
              placeholder={travelType === 'international' ? 'Search city or country...' : 'Search city or state...'}
              autoFocus
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/55 pl-11 pr-12 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/70"
            />
            {loadingCities && <span className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-300" />}
          </div>
          <div className="custom-scrollbar grid max-h-[48vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {filteredCities.map(city => {
              const selected = selectedCity?.name === city.name && selectedCity.country === city.country;
              return (
                <button
                  type="button"
                  key={`${city.name}-${city.state ?? city.country}`}
                  onClick={() => setSelectedCity(city)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                    selected ? 'border-emerald-400/70 bg-emerald-500/10' : 'border-slate-700 bg-slate-950/25 hover:border-slate-500'
                  }`}
                >
                  <CountryFlag country={city.country} className="inline-flex h-7 w-10 rounded-sm" imageClassName="h-full w-full rounded-sm object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{city.name}</p>
                    <p className="truncate text-xs text-slate-500">{city.state ?? city.country}</p>
                  </div>
                  {selected && <CheckCircle2 size={18} className="shrink-0 text-emerald-300" />}
                </button>
              );
            })}
            {!loadingCities && citySearch && filteredCities.length === 0 && (
              <p className="col-span-full rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No matching destination found.</p>
            )}
            {!citySearch && (
              <p className="col-span-full rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">Search by city, {travelType === 'international' ? 'country' : 'or state'}.</p>
            )}
          </div>
        </div>
      </ActionModalShell>
    );
  }

  if (step === 'people') {
    return (
      <PersonSelectorModal
        title="Select Travelers"
        actionType="general"
        onClose={onClose}
        onSelectionBack={goBack}
        initialSelectedContacts={selectedContacts}
        allowEmptySelection
        selectionTitle="Select Travelers"
        selectionDescription={`Choose who will join the trip to ${selectedCity?.name}. You may continue alone.${inSeason ? ' Active players and head coaches are unavailable during the season.' : ''}`}
        peoplePrimaryLabel="Next: Add Reason"
        contactFilter={contact => {
          if (contact.title === 'Prospect' || contact.title === 'Retired') return false;
          if (!inSeason) return true;
          return contact.title !== 'Player' && contact.title !== 'Head Coach';
        }}
        onSelect={contacts => {
          setSelectedContacts(contacts);
          setStep('reason');
        }}
      />
    );
  }

  if (step === 'reason') {
    return (
      <ActionModalShell
        title="Reason for Travel"
        description={`Set the purpose of the ${travelType} trip to ${selectedCity?.name}.`}
        icon={<Plane size={28} />}
        accent={travelType === 'international' ? 'emerald' : 'sky'}
        onClose={onClose}
        onBack={goBack}
        selectedCount={selectedContacts.length}
        primaryLabel="Review Trip"
        primaryDisabled={!reason.trim()}
        onPrimary={() => setStep('confirm')}
      >
        <ActionTextField
          label="Reason"
          value={reason}
          onChange={setReason}
          placeholder="Scouting talent, league business, relationship building..."
          required
          multiline
          minRowsClassName="min-h-36"
        />
      </ActionModalShell>
    );
  }

  return (
    <ActionModalShell
      title="Confirm Travel"
      description="Review the trip before it is scheduled."
      icon={<Send size={28} />}
      accent={travelType === 'international' ? 'emerald' : 'sky'}
      onClose={onClose}
      onBack={goBack}
      selectedCount={selectedContacts.length}
      primaryLabel="Confirm Trip"
      primaryIcon={<Plane size={17} />}
      onPrimary={() => onConfirm({
        city: selectedCity!.name,
        country: selectedCity!.country,
        travelType: travelType!,
        reason: reason.trim(),
        invitees: selectedContacts.map(contact => contact.name),
        inviteeRoles: selectedContacts.map(contact => contact.title),
        contacts: selectedContacts,
      })}
    >
      <div className="space-y-4">
        <ActionInfoPanel icon={<MapPin size={24} />} title="Destination" accent={travelType === 'international' ? 'emerald' : 'sky'}>
          <span className="inline-flex items-center gap-3">
            <CountryFlag country={selectedCity?.country} className="inline-flex h-5 w-8 rounded-sm" imageClassName="h-full w-full rounded-sm object-cover" />
            {selectedCity?.name}, {selectedCity?.country}
          </span>
        </ActionInfoPanel>
        <ActionInfoPanel icon={<Users size={24} />} title="Travel Party" accent="violet">
          {selectedContacts.length > 0 ? selectedContacts.map(contact => contact.name).join(', ') : 'Commissioner traveling alone'}
        </ActionInfoPanel>
        <ActionInfoPanel icon={<Plane size={24} />} title="Purpose" accent="cyan">
          {reason}
        </ActionInfoPanel>
      </div>
    </ActionModalShell>
  );
}
