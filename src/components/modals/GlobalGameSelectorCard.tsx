import React from 'react';
import { CalendarDays, ChevronDown, MapPin, Search, X } from 'lucide-react';
import type { NBATeam } from '../../types';
import type { GlobalGameCity } from '../../services/globalGamesRecommendations';
import { getTeamFullName } from '../../utils/teamNames';
import { CountryFlag } from '../shared/CountryFlag';
import type { PbaVenue } from '../../services/pba/venues';

export interface GlobalGameDraft {
  homeTid: number;
  awayTid: number;
  date: string;
  city: string;
  country: string;
  venue?: string;
}

interface GlobalGameSelectorCardProps {
  index: number;
  game: GlobalGameDraft;
  teams: NBATeam[];
  usedTeamIds: Set<number>;
  citySearchTerm: string;
  filteredCities: GlobalGameCity[];
  displayCity: string;
  displayCountry: string;
  configured: boolean;
  expanded: boolean;
  active: boolean;
  loading: boolean;
  minDate: string;
  maxDate: string;
  venueOptions?: PbaVenue[];
  onUpdate: <K extends keyof GlobalGameDraft>(field: K, value: GlobalGameDraft[K]) => void;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onSelectCity: (city: GlobalGameCity) => void;
  onToggle: () => void;
  onRemove: () => void;
}

const CARD_ACCENTS = [
  {
    border: 'border-l-sky-500',
    badge: 'border-sky-400/20 bg-sky-500/10 text-sky-400',
  },
  {
    border: 'border-l-teal-400',
    badge: 'border-teal-300/20 bg-teal-400/10 text-teal-300',
  },
  {
    border: 'border-l-violet-500',
    badge: 'border-violet-400/20 bg-violet-500/10 text-violet-400',
  },
  {
    border: 'border-l-amber-400',
    badge: 'border-amber-300/20 bg-amber-400/10 text-amber-300',
  },
  {
    border: 'border-l-rose-500',
    badge: 'border-rose-400/20 bg-rose-500/10 text-rose-400',
  },
] as const;

const formatSelectorDate = (date: string) => {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : 'Select date';
};

const TeamSummary: React.FC<{ team?: NBATeam; placeholder: string }> = ({ team, placeholder }) => {
  const name = getTeamFullName(team) || placeholder;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-950/45 sm:size-10">
        {team?.logoUrl ? (
          <img
            src={team.logoUrl}
            alt={name}
            className="max-h-full max-w-full object-contain drop-shadow-md"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="text-[9px] font-black text-slate-500">{team?.abbrev ?? '—'}</span>
        )}
      </div>
      <span className="truncate text-xs font-bold text-slate-100 sm:text-sm" title={name}>{name}</span>
    </div>
  );
};

export const GlobalGameSelectorCard: React.FC<GlobalGameSelectorCardProps> = ({
  index,
  game,
  teams,
  usedTeamIds,
  citySearchTerm,
  filteredCities,
  displayCity,
  displayCountry,
  configured,
  expanded,
  active,
  loading,
  minDate,
  maxDate,
  venueOptions,
  onUpdate,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onSelectCity,
  onToggle,
  onRemove,
}) => {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const awayTeam = teams.find(team => team.id === game.awayTid);
  const homeTeam = teams.find(team => team.id === game.homeTid);
  const location = game.venue
    ? `${game.venue} · ${displayCity}`
    : [displayCity, displayCountry].filter(Boolean).join(', ') || 'Select location';

  return (
    <article
      className={`relative overflow-visible rounded-xl border border-l-4 border-slate-700/70 ${accent.border} bg-[linear-gradient(135deg,rgba(10,24,43,0.98),rgba(7,18,34,0.98))] shadow-[0_14px_36px_rgba(2,8,23,0.22)]`}
      style={{ zIndex: active ? 50 : 1 }}
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border text-lg font-black ${accent.badge}`}>
            {index + 1}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <TeamSummary team={awayTeam} placeholder="Select away team" />
            <span className="shrink-0 text-[10px] font-black uppercase text-slate-500">vs</span>
            <TeamSummary team={homeTeam} placeholder="Select home team" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 text-xs font-semibold text-slate-300">
            <CalendarDays size={15} className="text-slate-400" />
            <span className="tabular-nums">{formatSelectorDate(game.date)}</span>
          </div>
          <div className="inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 text-xs font-semibold text-slate-300 sm:max-w-72">
            {displayCountry ? (
              <CountryFlag country={displayCountry} className="inline-flex h-4 w-6 rounded-sm" />
            ) : (
              <MapPin size={15} className="shrink-0 text-slate-400" />
            )}
            <span className="truncate" title={location}>{location}</span>
          </div>
          <span className={`inline-flex h-9 items-center rounded-lg border px-3 text-[10px] font-black uppercase tracking-wide ${
            configured
              ? 'border-emerald-400/15 bg-emerald-400/5 text-emerald-400'
              : 'border-amber-400/15 bg-amber-400/5 text-amber-300'
          }`}>
            {configured ? 'Configured' : 'Needs details'}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} game ${index + 1}`}
            className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <ChevronDown size={18} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove game ${index + 1}`}
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-4 border-t border-slate-700/45 p-3 sm:p-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="ml-0.5 block text-[9px] font-black uppercase tracking-widest text-slate-500">Away team</span>
            <select
              value={game.awayTid}
              onChange={event => onUpdate('awayTid', Number(event.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/45 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="-1">Select team</option>
              {teams.map(team => (
                <option
                  key={team.id}
                  value={team.id}
                  disabled={usedTeamIds.has(team.id) && game.awayTid !== team.id}
                >
                  {getTeamFullName(team)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="ml-0.5 block text-[9px] font-black uppercase tracking-widest text-slate-500">Home team</span>
            <select
              value={game.homeTid}
              onChange={event => onUpdate('homeTid', Number(event.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/45 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="-1">Select team</option>
              {teams.map(team => (
                <option
                  key={team.id}
                  value={team.id}
                  disabled={usedTeamIds.has(team.id) && game.homeTid !== team.id}
                >
                  {getTeamFullName(team)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="ml-0.5 block text-[9px] font-black uppercase tracking-widest text-slate-500">Date</span>
            <input
              type="date"
              value={game.date}
              min={minDate}
              max={maxDate}
              onChange={event => onUpdate('date', event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/45 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            />
          </label>

          {venueOptions ? (
            <label className="space-y-1.5">
              <span className="ml-0.5 block text-[9px] font-black uppercase tracking-widest text-slate-500">Venue</span>
              <select
                value={game.venue ?? ''}
                onChange={event => {
                  const venue = venueOptions.find(candidate => candidate.name === event.target.value);
                  onUpdate('venue', venue?.name ?? '');
                  if (venue) {
                    onUpdate('city', venue.city);
                    onUpdate('country', 'Philippines');
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/45 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">Select venue</option>
                {venueOptions.map(venue => (
                  <option key={venue.id} value={venue.name}>
                    {venue.name} · {venue.city}{venue.capacity ? ` · ${venue.capacity.toLocaleString()} seats` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
          <div className="relative space-y-1.5">
            <label htmlFor={`global-game-city-${index}`} className="ml-0.5 block text-[9px] font-black uppercase tracking-widest text-slate-500">
              International city
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                id={`global-game-city-${index}`}
                type="text"
                value={citySearchTerm}
                onFocus={onSearchFocus}
                onBlur={onSearchBlur}
                onChange={event => onSearchChange(event.target.value)}
                placeholder="Search city or country..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950/45 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
            {active && citySearchTerm && !game.city && (
              <div className="absolute z-[100] mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl custom-scrollbar">
                {loading ? (
                  <div className="p-3 text-center text-xs text-slate-500">Loading cities...</div>
                ) : filteredCities.length > 0 ? (
                  filteredCities.map(city => (
                    <button
                      key={`${city.name}-${city.country}`}
                      type="button"
                      onMouseDown={event => {
                        event.preventDefault();
                        onSelectCity(city);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                    >
                      <CountryFlag country={city.country} className="inline-flex h-4 w-6 rounded-sm" />
                      <span className="truncate">{city.name}, {city.country}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-xs text-slate-500">No cities found</div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </article>
  );
};
