import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MyFace, isRealFaceConfig } from './MyFace';
import { convertTo2KRating, extractNbaId, hdPortrait } from '../../utils/helpers';
import { ensurePortraitLookupsLoaded, getPhotoByName } from '../../data/realPlayerDataFetcher';
import { useGame } from '../../store/GameContext';
import { isLowQualityPlayerPortrait, isPba2021FallbackPortrait, isUsablePlayerPortraitUrl } from '../../utils/playerImage';
import { getCachedExternalPortraitCandidatesForName } from '../../services/externalPortraitCatalog';
import { getCachedNbaEraPortraitCandidates, loadNbaEraPortraitCatalog } from '../../services/nbaEraPortraitCatalog';
import { isPbaIsolatedMode, isWnbaIsolatedMode } from '../../utils/uiMode';
import type { NBAPlayer } from '../../types';
import { isPortraitUrlUnavailable, markPortraitUrlUnavailable } from '../../utils/portraitAvailability';

export interface PlayerPortraitProps {
  imgUrl?: string;
  fallbackImgUrl?: string;
  teamLogoUrl?: string;
  fallbackTeamLogoUrl?: string;
  overallRating?: number;
  /** Player ratings array — used to apply tp elite bonus to the OVR badge */
  ratings?: any[];
  /** Portrait diameter in px (default 48) */
  size?: number;
  /** Show the incoming arrow badge (blue, bottom-left) */
  isIncoming?: boolean;
  /** Custom badge content instead of OVR number */
  ovrLabel?: string;
  /** Player name — used for initials fallback */
  playerName?: string;
  playerIdentity?: Pick<NBAPlayer, 'internalId' | 'personId' | 'sourceIds' | 'srID' | 'slug' | 'nbaId' | 'name' | 'born' | 'draft' | 'gender' | 'status' | 'historicalEndesaSource' | 'historicalPbaSource' | 'historicalEuropeSource'>;
  /** Disable every name-derived player image for staff and other non-player identities. */
  disableNameFallback?: boolean;
  portraitSeason?: number;
  isDraftProspect?: boolean;
  /** facesjs face descriptor — rendered when imgUrl is absent. Only generated prospects carry this. */
  face?: any;
}

/**
 * Reusable player portrait with:
 *  - circular player photo
 *  - team logo badge (top-left)
 *  - OVR rating badge (bottom-right)
 *  - optional incoming-trade arrow badge (bottom-left)
 *
 * Canonical player headshot / facesjs renderer.
 * Use this instead of duplicating img/MyFace/initials fallback logic in view files.
 */
export const PlayerPortrait: React.FC<PlayerPortraitProps> = ({
  imgUrl,
  fallbackImgUrl,
  teamLogoUrl,
  fallbackTeamLogoUrl,
  overallRating,
  ratings,
  size = 48,
  isIncoming = false,
  ovrLabel,
  playerName,
  playerIdentity,
  disableNameFallback = false,
  portraitSeason,
  isDraftProspect = false,
  face,
}) => {
  const { state } = useGame();
  const px = `${size}px`;
  const badgeSize = Math.round(size * 0.5);  // team logo badge ~50% of portrait
  const allowNameFallback = !disableNameFallback && state.leagueType !== 'fictional';
  const preferCanonicalNbaPortrait = state.leagueType === 'modded' && state.moddedLeagueBase === 'nba';
  const resolvedPortraitSeason = portraitSeason ?? state.leagueStats?.year;
  const [nbaEraPortraitCandidates, setNbaEraPortraitCandidates] = useState<string[]>([]);
  const externalPortraitCandidates = useMemo(() => {
    if (!allowNameFallback || !playerName) return [];
    const league = playerIdentity?.status === 'PBA'
      ? 'PBA'
      : isWnbaIsolatedMode(state)
        ? 'WNBA'
        : isPbaIsolatedMode(state)
          ? 'PBA'
          : null;
    return league
      ? getCachedExternalPortraitCandidatesForName(league, playerName, resolvedPortraitSeason)
      : [];
  }, [allowNameFallback, playerIdentity?.status, playerName, resolvedPortraitSeason, state]);
  const [lookupImgUrl, setLookupImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setNbaEraPortraitCandidates([]);
    if (!allowNameFallback || !preferCanonicalNbaPortrait || !playerName) return () => { active = false; };
    loadNbaEraPortraitCatalog().then(() => {
      if (active) {
        setNbaEraPortraitCandidates(getCachedNbaEraPortraitCandidates(playerIdentity ?? playerName, {
          season: resolvedPortraitSeason,
          isProspect: isDraftProspect,
        }));
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [allowNameFallback, isDraftProspect, playerIdentity, playerName, preferCanonicalNbaPortrait, resolvedPortraitSeason]);

  const nameFallback = useMemo(() => {
    if (!allowNameFallback) return null;
    if (!playerName) return null;
    const nbaId = extractNbaId('', playerName);
    return nbaId ? hdPortrait(nbaId) : null;
  }, [allowNameFallback, playerName]);

  const imageCandidates = useMemo(() => {
    const explicit = isUsablePlayerPortraitUrl(imgUrl) ? imgUrl : null;
    const highQualityExternal = externalPortraitCandidates.filter(candidate => !isLowQualityPlayerPortrait(candidate));
    const pbaHdCandidates = highQualityExternal.filter(candidate => !isPba2021FallbackPortrait(candidate));
    const pba2021Fallbacks = externalPortraitCandidates.filter(isPba2021FallbackPortrait);
    const pbaLowQualityCandidates = externalPortraitCandidates.filter(isLowQualityPlayerPortrait);
    const preferPbaAvailability = playerIdentity?.status === 'PBA' || isPbaIsolatedMode(state);
    const pbaCandidates = [
      ...pbaHdCandidates,
      explicit && !isLowQualityPlayerPortrait(explicit) ? explicit : null,
      fallbackImgUrl && !isLowQualityPlayerPortrait(fallbackImgUrl) ? fallbackImgUrl : null,
      ...pba2021Fallbacks,
      ...pbaLowQualityCandidates,
      explicit,
      fallbackImgUrl,
    ];
    const candidates = preferPbaAvailability
      ? pbaCandidates
      : preferCanonicalNbaPortrait
      ? [
          ...(allowNameFallback ? nbaEraPortraitCandidates : []),
          nameFallback,
          lookupImgUrl && !isLowQualityPlayerPortrait(lookupImgUrl) ? lookupImgUrl : null,
          ...highQualityExternal,
          explicit && !isLowQualityPlayerPortrait(explicit) ? explicit : null,
          fallbackImgUrl && !isLowQualityPlayerPortrait(fallbackImgUrl) ? fallbackImgUrl : null,
          lookupImgUrl,
          explicit,
          fallbackImgUrl,
          ...externalPortraitCandidates,
        ]
      : [
          lookupImgUrl && !isLowQualityPlayerPortrait(lookupImgUrl) ? lookupImgUrl : null,
          ...highQualityExternal,
          explicit && !isLowQualityPlayerPortrait(explicit) ? explicit : null,
          fallbackImgUrl && !isLowQualityPlayerPortrait(fallbackImgUrl) ? fallbackImgUrl : null,
          nameFallback,
          lookupImgUrl,
          explicit,
          fallbackImgUrl,
          ...externalPortraitCandidates,
        ];
    return [...new Set(candidates.filter((candidate): candidate is string => isUsablePlayerPortraitUrl(candidate)))];
  }, [allowNameFallback, externalPortraitCandidates, fallbackImgUrl, imgUrl, lookupImgUrl, nameFallback, nbaEraPortraitCandidates, playerIdentity?.status, preferCanonicalNbaPortrait, state]);

  const [imgSrc, setImgSrc] = useState<string | null>(imageCandidates[0] ?? null);
  const teamLogoCandidates = useMemo(
    () => [...new Set([teamLogoUrl, fallbackTeamLogoUrl].filter((url): url is string => !!url))],
    [fallbackTeamLogoUrl, teamLogoUrl],
  );
  const [teamLogoSrc, setTeamLogoSrc] = useState<string | null>(teamLogoCandidates[0] ?? null);

  // Reset when the imgUrl prop changes (e.g. navigating between players without unmount)
  useEffect(() => {
    setImgSrc(imageCandidates[0] ?? null);
  }, [imageCandidates]);

  useEffect(() => {
    setTeamLogoSrc(teamLogoCandidates[0] ?? null);
  }, [teamLogoCandidates]);

  useEffect(() => {
    let active = true;
    setLookupImgUrl(null);
    if (!playerName || !allowNameFallback) return () => { active = false; };
    ensurePortraitLookupsLoaded().then(() => {
      if (active) setLookupImgUrl(getPhotoByName(playerName));
    }).catch(() => {});
    return () => { active = false; };
  }, [allowNameFallback, playerName]);

  const handleImgError = () => {
    setImgSrc(current => {
      if (current) markPortraitUrlUnavailable(current);
      const currentIndex = current ? imageCandidates.indexOf(current) : -1;
      return imageCandidates.slice(currentIndex + 1).find(candidate => !isPortraitUrlUnavailable(candidate)) ?? null;
    });
  };

  const handleTeamLogoError = () => {
    setTeamLogoSrc(current => {
      const currentIndex = current ? teamLogoCandidates.indexOf(current) : -1;
      return teamLogoCandidates[currentIndex + 1] ?? null;
    });
  };

  const initials = playerName
    ? playerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="relative flex-shrink-0" style={{ width: px, height: px }}>
      {/* Player photo */}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="rounded-full object-cover bg-slate-800 border-2 border-slate-700 group-hover:border-slate-500 transition-colors w-full h-full"
          referrerPolicy="no-referrer"
          onError={handleImgError}
        />
      ) : isRealFaceConfig(face) ? (
        // Prospect-only: facesjs cartoon via shared MyFace wrapper.
        // MyFace enforces facesjs's required 2:3 aspect ratio — we just give it a tall container
        // and center-crop to the circular clip so it still reads as a portrait thumbnail.
        <div className="rounded-full bg-slate-700 border-2 border-slate-600 overflow-hidden w-full h-full relative">
          <div className="absolute left-1/2 top-1/2" style={{ width: size * 0.85, height: size * 1.275, transform: 'translate(-50%, -50%)' }}>
            <MyFace face={face} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      ) : (
        <div
          className="rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center w-full h-full"
          style={{ fontSize: `${Math.round(size * 0.33)}px` }}
        >
          <span className="font-black text-slate-300">{initials}</span>
        </div>
      )}

      {/* Team logo — top-left */}
      {teamLogoSrc && (
        <div
          className="absolute -top-1 -left-1 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center p-0.5 shadow-xl z-10"
          style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }}
        >
          <img src={teamLogoSrc} alt="" className="w-full h-full object-contain" onError={handleTeamLogoError} />
        </div>
      )}

      {/* Incoming trade indicator — bottom-left (replaces team logo slot on that side) */}
      {isIncoming && (
        <div className="absolute -bottom-1 -left-1 bg-indigo-500 rounded-full p-1 border-2 border-slate-900 shadow-lg z-10">
          <ArrowLeftRight size={8} className="text-white" strokeWidth={3} />
        </div>
      )}

      {/* OVR badge — bottom-right */}
      {overallRating !== undefined && (
        <div
          aria-label={`Overall ${ovrLabel ?? convertTo2KRating(overallRating ?? 0, ratings?.[ratings.length - 1]?.hgt ?? 50, ratings?.[ratings.length - 1]?.tp)}`}
          className="absolute -bottom-1 -right-1 bg-slate-950 border-2 border-slate-800 rounded-lg px-1.5 py-0.5 shadow-lg z-10"
        >
          <span className="text-[9px] font-black text-white italic">
            {ovrLabel ?? convertTo2KRating(overallRating ?? 0, ratings?.[ratings.length - 1]?.hgt ?? 50, ratings?.[ratings.length - 1]?.tp)}
          </span>
        </div>
      )}
    </div>
  );
};
