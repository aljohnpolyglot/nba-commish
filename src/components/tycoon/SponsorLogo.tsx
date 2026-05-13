import React, { useState, useEffect } from 'react';
import { resolveSponsorLogoUrl, type BrandMeta } from '../../utils/sponsorLogos';
import { SponsorIndustryIcon } from './SponsorIndustryIcon';
import type { SponsorIndustry } from '../../types/tycoon';

interface Props {
  name: string;
  meta?: BrandMeta;
  industry?: SponsorIndustry | 'generic';
  size?: number;
}

export const SponsorLogo: React.FC<Props> = ({ name, meta, industry, size = 56 }) => {
  const url = resolveSponsorLogoUrl(meta);
  const fallbackIndustry = meta?.industry ?? industry ?? 'generic';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return <SponsorIndustryIcon industry={fallbackIndustry} size={size} />;
  }

  return (
    <div
      className="rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      <img
        src={url}
        alt={`${name} logo`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
};
