import React from 'react';
import { Loader2 } from 'lucide-react';

interface PlayerBioHeroProps {
  bioData: any;
  teamColor: string;
  teamLogo: string | null | undefined;
  teamFullName: string | null;
  portraitSrc: string;
  playerImgURL?: string;
  isSyncing: boolean;
  fetchDone: boolean;
  isHoF?: boolean;
}

/**
 * Hero section for the player bio page.
 * Includes:
 *  - Team colour background with watermark logo
 *  - HD player portrait with fallback
 *  - Name / meta line
 *  - Stats bar (PTS / REB / AST / STL / BLK)
 *  - Info grid (height, weight, country, school, age, birthdate, draft, experience)
 */
const HOF_LOGO = 'https://upload.wikimedia.org/wikipedia/en/7/7e/Naismith_Basketball_Hall_of_Fame_logo.png';

export const PlayerBioHero: React.FC<PlayerBioHeroProps> = ({
  bioData,
  teamColor,
  teamLogo,
  teamFullName,
  portraitSrc,
  playerImgURL,
  isSyncing,
  fetchDone,
  isHoF,
}) => (
  <>
    {/* ── Hero Banner ── */}
    <div
      className="relative h-auto min-h-[350px] flex flex-col md:flex-row items-center md:items-end px-[5%] overflow-hidden pt-16 pb-4 md:pb-0 md:pt-0 md:h-[350px]"
      style={{ backgroundColor: teamColor }}
    >
      {teamLogo && (
        <img
          src={teamLogo} alt=""
          className="absolute top-1/2 left-[10%] -translate-y-[45%] w-[120%] max-w-[1000px] opacity-[0.20] pointer-events-none z-0 select-none grayscale brightness-200"
          style={{ mixBlendMode: 'screen' }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      {teamLogo && (
        <div className="absolute top-8 left-10 md:left-24 z-30 flex flex-col items-center">
          <img
            src={teamLogo} alt="Team Logo"
            className="w-16 md:w-20 h-auto drop-shadow-xl"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <span className="hidden md:block text-[10px] font-black tracking-[3px] mt-2 text-white/80 uppercase text-center leading-tight max-w-[100px]">
            {teamFullName || 'TEAM'}
          </span>
        </div>
      )}

      <div className="relative z-20 mt-8 md:mt-0 md:ml-10 flex flex-col items-center self-end">
        <img
          key={portraitSrc}
          src={portraitSrc}
          alt={bioData.n}
          className="h-48 md:h-[340px] drop-shadow-[10px_0_20px_rgba(0,0,0,0.5)] object-contain object-bottom"
          referrerPolicy="no-referrer"
          onError={e => {
            const img = e.currentTarget;
            // Use data-attribute to track whether we've already tried the BBGM fallback,
            // avoiding false-equality issues when img.src is normalized by the browser.
            if (playerImgURL && !img.dataset.triedFallback) {
              img.dataset.triedFallback = '1';
              img.src = playerImgURL;
            } else {
              img.style.display = 'none';
            }
          }}
        />
        {isHoF && (
          <div className="absolute -bottom-2 -right-2 md:-right-4 w-10 h-10 md:w-14 md:h-14 bg-white rounded-full flex items-center justify-center shadow-xl border-2 border-white/30 z-30" title="Basketball Hall of Fame">
            <img src={HOF_LOGO} alt="Hall of Fame" className="w-8 h-8 md:w-11 md:h-11 object-contain" referrerPolicy="no-referrer" />
          </div>
        )}
      </div>

      <div className="z-20 text-center md:text-left mb-6 md:mb-12 md:ml-10 flex-1">
        <p className="m-0 uppercase text-sm font-medium tracking-widest text-white/90">{bioData.m}</p>
        <h1 className="m-0 mt-1 text-2xl sm:text-3xl md:text-[64px] leading-[0.95] uppercase font-black tracking-tight text-white break-words w-full">
          {bioData.n.split(' ').map((part: string, i: number) => (
            <React.Fragment key={i}>{part}<br /></React.Fragment>
          ))}
        </h1>
      </div>
      <div className="hidden md:flex z-20 mb-12 mr-4">
        <button className="px-6 py-2 rounded-full border border-white text-white font-medium hover:bg-white/10 transition-colors flex items-center gap-2">
          <span>☆</span> FOLLOW
        </button>
      </div>
    </div>

    {/* ── Stats Bar ── */}
    <div className="flex flex-col md:flex-row border-y border-white/20" style={{ backgroundColor: teamColor }}>
      <div className="flex flex-row w-full md:w-2/5 border-b md:border-b-0 md:border-r border-white/20 bg-black/20">
        {(['PTS', 'REB', 'AST'] as const).map((key, i, arr) => (
          <div key={key} className={`flex-1 flex flex-col justify-center items-center py-4 md:py-6 ${i < arr.length - 1 ? 'border-r border-white/20' : ''}`}>
            <span className="text-[10px] text-white/80 uppercase mb-1 tracking-widest font-bold">
              {key === 'PTS' ? 'PPG' : key === 'REB' ? 'RPG' : 'APG'}
            </span>
            <span className="text-2xl md:text-3xl font-black text-white">{bioData.stats[key]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 w-full md:w-3/5 bg-black/40">
        {[
          { label: 'Height',        val: bioData.h, border: 'border-r border-b' },
          { label: 'Weight',        val: bioData.w, border: 'border-r border-b' },
          { label: 'Country',       val: bioData.c, border: 'border-r border-b' },
          { label: 'Last Attended', val: bioData.s, border: 'border-r border-b' },
          { label: 'Age',           val: bioData.a, border: 'border-r border-b' },
          { label: 'Birthdate',     val: bioData.b, border: 'border-b' },
          { label: 'Draft',         val: bioData.d, border: 'border-r' },
          { label: 'Experience',    val: bioData.e, border: 'border-r' },
        ].map(({ label, val, border }) => (
          <div key={label} className={`${border} border-white/20 flex flex-col justify-center items-center py-3 px-2 text-center`}>
            <span className="bg-white/10 text-white/70 text-[8px] px-2 py-0.5 rounded-sm uppercase font-bold mb-1 tracking-widest">{label}</span>
            <span className="text-sm font-semibold text-white leading-tight">{val}</span>
          </div>
        ))}
      </div>
    </div>

    {/* inline style for bio bullet lists */}
    <style dangerouslySetInnerHTML={{ __html: `
      .bio-list { list-style: none; padding: 0; margin: 0; }
      .bio-list li { padding-left: 25px; position: relative; line-height: 1.7; color: #999; font-size: 15px; margin-bottom: 12px; }
      .bio-list li::before { content: ""; width: 6px; height: 6px; background: ${teamColor}; position: absolute; left: 0; top: 8px; border-radius: 1px; }
      .bio-list b { color: #eee; font-weight: 700; }
    `}} />
  </>
);
