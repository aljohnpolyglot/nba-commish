import { useMemo, useState } from 'react';
import { ChevronDown, Globe2 } from 'lucide-react';
import { CountryFlag } from '../shared/CountryFlag';
import type { NewsBranding } from './branding';
import type { EuroNewsTeamOption } from '../../services/news/europeNews';

interface EuroNewsPortalNavProps {
  branding: NewsBranding;
  countries: string[];
  teams: EuroNewsTeamOption[];
  selectedCountry: string | null;
  selectedTeamId: number | null;
  onSelectCountry: (country: string | null) => void;
  onSelectTeam: (teamId: number | null) => void;
  compact?: boolean;
}

export default function EuroNewsPortalNav({
  branding,
  countries,
  teams,
  selectedCountry,
  selectedTeamId,
  onSelectCountry,
  onSelectTeam,
  compact = false,
}: EuroNewsPortalNavProps) {
  const [countryOpen, setCountryOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const selectedTeam = teams.find(team => team.id === selectedTeamId) ?? null;
  const countryTeams = useMemo(
    () => selectedCountry ? teams.filter(team => team.country === selectedCountry) : [],
    [selectedCountry, teams],
  );

  const selectCountry = (country: string | null) => {
    onSelectCountry(country);
    onSelectTeam(null);
    setCountryOpen(false);
    setTeamOpen(false);
  };

  return (
    <div className={`relative flex min-w-0 flex-wrap items-center gap-2 ${compact ? 'py-1' : 'py-2'}`}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setCountryOpen(open => !open)}
          className="flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors"
          style={{ borderColor: `${branding.accent}66`, color: branding.kind === 'europe' ? branding.accent : 'currentColor' }}
          aria-expanded={countryOpen}
        >
          {selectedCountry ? <CountryFlag country={selectedCountry} /> : <Globe2 size={16} />}
          <span>{selectedCountry ?? branding.portalLabel}</span>
          <ChevronDown size={14} className={countryOpen ? 'rotate-180' : ''} />
        </button>

        {countryOpen && (
          <>
            <button type="button" aria-label="Close country menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setCountryOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-[min(92vw,760px)] max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl">
              <button
                type="button"
                onClick={() => selectCountry(null)}
                className={`mb-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-black ${selectedCountry === null ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50'}`}
              >
                <Globe2 size={17} /> {branding.portalLabel}
              </button>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {countries.map(country => (
                  <button
                    type="button"
                    key={country}
                    onClick={() => selectCountry(country)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold ${selectedCountry === country ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50'}`}
                  >
                    <CountryFlag country={country} />
                    <span className="truncate">{country}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {selectedCountry && (
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => setTeamOpen(open => !open)}
            className="flex min-h-9 max-w-[72vw] items-center gap-2 rounded-md border border-current/20 px-3 py-2 text-xs font-black uppercase tracking-wider"
            aria-expanded={teamOpen}
          >
            {selectedTeam?.logoUrl && <img src={selectedTeam.logoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" referrerPolicy="no-referrer" />}
            <span className="truncate">{selectedTeam?.name ?? 'Clubs'}</span>
            <ChevronDown size={14} className={`shrink-0 ${teamOpen ? 'rotate-180' : ''}`} />
          </button>

          {teamOpen && (
            <>
              <button type="button" aria-label="Close club menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setTeamOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-[min(88vw,360px)] max-h-[65vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl">
                <button
                  type="button"
                  onClick={() => { onSelectTeam(null); setTeamOpen(false); }}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm font-black ${selectedTeamId === null ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50'}`}
                >
                  All {selectedCountry} clubs
                </button>
                {countryTeams.map(team => (
                  <button
                    type="button"
                    key={team.id}
                    onClick={() => { onSelectTeam(team.id); setTeamOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold ${selectedTeamId === team.id ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50'}`}
                  >
                    {team.logoUrl
                      ? <img src={team.logoUrl} alt="" className="h-7 w-7 shrink-0 object-contain" referrerPolicy="no-referrer" />
                      : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-black">{team.abbrev}</span>}
                    <span className="truncate">{team.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
