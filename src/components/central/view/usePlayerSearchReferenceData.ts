import { useEffect, useMemo, useState } from 'react';

const FALLBACK_COUNTRIES = [
  'usa',
  'united states',
  'canada',
  'serbia',
  'slovenia',
  'france',
  'spain',
  'greece',
  'australia',
  'nigeria',
  'cameroon',
  'germany',
  'italy',
  'brazil',
  'argentina',
  'china',
  'japan',
  'philippines',
];

type SearchReferencePlayer = {
  college?: string;
  extractedCountry?: string;
};

export const usePlayerSearchReferenceData = (players: SearchReferencePlayer[]) => {
  const [countriesList, setCountriesList] = useState<string[]>([]);

  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const names = data.map((country: any) => country.name.common.toLowerCase());
          setCountriesList(names);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch countries:', err);
        setCountriesList(FALLBACK_COUNTRIES);
      });
  }, []);

  const allCountries = useMemo(() => {
    const set = new Set<string>();
    players.forEach((player) => {
      if (player.extractedCountry) set.add(player.extractedCountry);
    });
    return Array.from(set).sort();
  }, [players]);

  const allColleges = useMemo(() => {
    const set = new Set<string>();
    players.forEach((player) => {
      if (player.college) {
        const collegeLower = player.college.toLowerCase();
        if (!countriesList.includes(collegeLower)) {
          set.add(player.college);
        }
      }
    });
    return Array.from(set).sort();
  }, [players, countriesList]);

  return { allColleges, allCountries };
};
