import React, { useEffect, useMemo, useState } from 'react';
import { getCountryFlagCode, normalizeNationality } from '../../utils/countryFlags';
import { getCountryCode } from '../../utils/helpers';

interface CountryFlagProps {
  country?: string;
  iso2?: string;
  className?: string;
  imageClassName?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({
  country,
  iso2,
  className = 'inline-flex h-4 w-6',
  imageClassName = 'h-full w-full object-cover',
}) => {
  const code = useMemo(() => {
    const direct = String(iso2 ?? '').trim().toLowerCase();
    return /^[a-z]{2}$/.test(direct) ? direct : getCountryFlagCode(country) || getCountryCode(normalizeNationality(country));
  }, [country, iso2]);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [code]);

  const fallback = normalizeNationality(country || iso2);
  if (!code || failed) {
    return <span className="inline-flex shrink-0 items-center whitespace-nowrap text-[10px] font-semibold text-slate-400">{fallback}</span>;
  }
  return (
    <span className={`${className} shrink-0 items-center justify-center overflow-hidden`} aria-label={country ? `${country} flag` : 'Country flag'}>
      <img
        src={`https://flagcdn.com/w80/${code}.png`}
        srcSet={`https://flagcdn.com/w160/${code}.png 2x`}
        alt=""
        className={imageClassName}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
};
