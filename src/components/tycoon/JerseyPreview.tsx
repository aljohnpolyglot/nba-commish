import React, { useEffect, useState } from 'react';
import { loadJerseyIndex, findTeamJerseys, pickKit, jerseyUrl, type JerseyLeague } from '../../utils/jerseyLoader';

interface Props {
  teamName: string;
  league?: JerseyLeague;
  /** Hint to prefer specific variants — e.g. 'home', 'icon', '2526h'. */
  variantHint?: string;
  /** Show both front body and shorts. Default true. */
  showShorts?: boolean;
  className?: string;
}

export const JerseyPreview: React.FC<Props> = ({ teamName, league, variantHint, showShorts = true, className }) => {
  const [urls, setUrls] = useState<{ body: string | null; shorts: string | null }>({ body: null, shorts: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idx = await loadJerseyIndex();
      if (cancelled) return;
      const team = findTeamJerseys(idx, teamName, league);
      if (!team) {
        setLoaded(true);
        return;
      }
      const { body, shorts } = pickKit(team, variantHint);
      setUrls({ body: jerseyUrl(body?.localPath), shorts: jerseyUrl(shorts?.localPath) });
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [teamName, league, variantHint]);

  if (!loaded) {
    return <div className={`w-full aspect-[3/4] rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-[10px] text-slate-600 ${className ?? ''}`}>Loading…</div>;
  }

  if (!urls.body) {
    return (
      <div className={`w-full aspect-[3/4] rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-[10px] text-slate-500 text-center px-2 ${className ?? ''}`}>
        No jersey art for<br />{teamName}
      </div>
    );
  }

  return (
    <div className={`w-full flex flex-col items-center gap-2 ${className ?? ''}`}>
      <img src={urls.body} alt={`${teamName} jersey`} className="max-w-full max-h-[180px] object-contain" />
      {showShorts && urls.shorts && (
        <img src={urls.shorts} alt={`${teamName} shorts`} className="max-w-full max-h-[80px] object-contain" />
      )}
    </div>
  );
};
