import euroLeagueLogos from '../../data/euroLeagueLogos.json';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../utils/uiMode';

export type NewsBrandKind = 'nba' | 'wnba' | 'pba' | 'europe' | 'neutral';

export interface NewsBranding {
  kind: NewsBrandKind;
  displayName: string;
  wordmark: string;
  portalLabel: string;
  logoUrl?: string;
  primary: string;
  secondary: string;
  accent: string;
  legalName: string;
  networkName: string;
  sectionHeadline: string;
  earlyHeaderImage?: string;
  earlyPromoImages: string[];
  web2LogoUrl?: string;
  web2HeaderImage?: string;
  web2PromoImages: string[];
  modernPromoImages: string[];
}

interface BrandingState {
  leagueType?: string | null;
  moddedLeagueBase?: string | null;
  leagueStats?: { uiMode?: string | null; leagueName?: string | null; year?: number | null };
}

const euroLeagueRoot = euroLeagueLogos.pages.find(page => page.isRootPage);
const euroLeagueMark = euroLeagueRoot?.logos.find(logo => logo.caption === 'EuroLeague')
  ?? euroLeagueRoot?.logos[0];
const euroLeagueLogoUrl = euroLeagueMark?.thumbnailUrl || euroLeagueMark?.imageUrl;
const euroPalette = euroLeagueMark?.palette ?? [];

const EURO_EARLY_HEADER = 'https://web.archive.org/web/20050801003727im_/http://www.euroleague.net/fotos/noticias/jornada21/med_783_8.jpg';
const EURO_EARLY_PROMOS = [
  'https://web.archive.org/web/20050710183415im_/http://www.euroleague.net/images/home/moltengl7w.jpg',
  'https://web.archive.org/web/20050619045815im_/http://www.euroleague.net/images/home/ulebcup.gif',
  'https://web.archive.org/web/20051016142601im_/http://www.euroleague.net/fotos/noticias/jornada1/peq_1771_54.gif',
];

const WNBA_MODERN_LOGO = 'https://web.archive.org/web/20260718064041im_/https://cdn.wnba.com/sites/4/2026/04/WNBA30_ALL_ORANGE.svg';
const WNBA_WEB2_LOGO = 'https://web.archive.org/web/20151126161005im_/http://ak-static.cms.nba.com/wp-content/themes/wnba-parent/img/logos/wnba-secondary-logo.svg';
const WNBA_EARLY_HEADER = 'https://web.archive.org/web/20040116052345im_/http://www.wnba.com/media/wnba/insideHeader.jpg';
const WNBA_EARLY_PROMOS = [
  'https://web.archive.org/web/20031101103908im_/http://www.wnba.com/media/wnbahome91603_shockc.gif',
  'https://web.archive.org/web/20031101075526im_/http://www.wnba.com/media/wnba_hp_hdr_nbatv_v03.gif',
];

const PBA_NEWS_ASSET_ROOT = '/data/pba/news-assets';
const PBA_LOGO = `${PBA_NEWS_ASSET_ROOT}/early-web2-pba-logo.jpg`;
const PBA_EARLY_PROMOS = [
  `${PBA_NEWS_ASSET_ROOT}/early-item-framework.jpg`,
  `${PBA_NEWS_ASSET_ROOT}/early-web2-37th-jersey.gif`,
  `${PBA_NEWS_ASSET_ROOT}/early-web2-top-5-plays.jpg`,
  `${PBA_NEWS_ASSET_ROOT}/early-web2-standings.jpg`,
];
const PBA_WEB2_PROMOS = [
  `${PBA_NEWS_ASSET_ROOT}/web2-mobile-responsive-ad.jpg`,
  `${PBA_NEWS_ASSET_ROOT}/early-web2-37th-jersey.gif`,
  `${PBA_NEWS_ASSET_ROOT}/early-web2-top-5-plays.jpg`,
  `${PBA_NEWS_ASSET_ROOT}/early-web2-standings.jpg`,
];

export function resolveNewsBranding(state: BrandingState, fallbackLeagueName: string): NewsBranding {
  if (isEuroIsolatedMode(state)) {
    return {
      kind: 'europe',
      displayName: 'European Basketball',
      wordmark: 'EUROLEAGUE',
      portalLabel: 'Europe',
      logoUrl: euroLeagueLogoUrl,
      primary: euroPalette[1] ?? '#102020',
      secondary: '#000000',
      accent: euroPalette[0] ?? '#FF5000',
      legalName: 'Euro Basketball Media',
      networkName: 'European Basketball Network',
      sectionHeadline: 'News Across Europe',
      earlyHeaderImage: EURO_EARLY_HEADER,
      earlyPromoImages: EURO_EARLY_PROMOS,
      web2PromoImages: ['https://web.archive.org/web/20120113032020im_/http://www.euroleague.net/rs/34403/c0b3b50d-66b5-4a70-9d3b-0cc444335636/7ac/filename/ebtv-300x180.jpg'],
      modernPromoImages: [],
    };
  }

  if (isPbaIsolatedMode(state)) {
    const displayName = state.leagueStats?.leagueName?.trim() || 'PBA';
    return {
      kind: 'pba',
      displayName,
      wordmark: 'PBA',
      portalLabel: 'League',
      logoUrl: PBA_LOGO,
      primary: '#0b2c5f',
      secondary: '#111827',
      accent: '#d71920',
      legalName: 'Philippine Basketball Association',
      networkName: 'PBA.ph',
      sectionHeadline: 'Around the PBA',
      earlyHeaderImage: PBA_LOGO,
      earlyPromoImages: PBA_EARLY_PROMOS,
      web2LogoUrl: PBA_LOGO,
      web2HeaderImage: `${PBA_NEWS_ASSET_ROOT}/web2-logo-glow.png`,
      web2PromoImages: PBA_WEB2_PROMOS,
      modernPromoImages: [`${PBA_NEWS_ASSET_ROOT}/modern-betting-ad.png`],
    };
  }

  if (isWnbaIsolatedMode(state)) {
    const seasonYear = Number(state.leagueStats?.year ?? 0);
    return {
      kind: 'wnba',
      displayName: 'WNBA',
      wordmark: 'WNBA',
      portalLabel: 'League',
      logoUrl: seasonYear >= 2026 ? WNBA_MODERN_LOGO : WNBA_WEB2_LOGO,
      primary: '#233a9f',
      secondary: '#111111',
      accent: '#f15a24',
      legalName: 'WNBA Enterprises, LLC',
      networkName: 'WNBA.com',
      sectionHeadline: 'Around the W',
      earlyHeaderImage: WNBA_EARLY_HEADER,
      earlyPromoImages: WNBA_EARLY_PROMOS,
      web2LogoUrl: WNBA_WEB2_LOGO,
      web2PromoImages: [WNBA_EARLY_PROMOS[0]],
      modernPromoImages: [],
    };
  }

  const isNba = state.leagueType !== 'fictional'
    && (!state.moddedLeagueBase || state.moddedLeagueBase === 'nba')
    && state.leagueStats?.uiMode !== 'pba_isolated'
    && state.leagueStats?.uiMode !== 'wnba_isolated';
  if (isNba) {
    return {
      kind: 'nba',
      displayName: fallbackLeagueName,
      wordmark: 'NBA',
      portalLabel: 'League',
      logoUrl: 'https://cdn.nba.com/logos/leagues/logo-nba.svg',
      primary: '#051c2d',
      secondary: '#000000',
      accent: '#0078ff',
      legalName: 'NBA Media Ventures, LLC',
      networkName: 'Turner Sports Digital',
      sectionHeadline: 'News From the East & West',
      earlyPromoImages: [],
      web2PromoImages: [],
      modernPromoImages: [],
    };
  }

  const displayName = state.leagueStats?.leagueName?.trim() || fallbackLeagueName || 'League';
  return {
    kind: 'neutral',
    displayName,
    wordmark: displayName.toUpperCase(),
    portalLabel: 'League',
    primary: '#111827',
    secondary: '#020617',
    accent: '#38bdf8',
    legalName: `${displayName} Media`,
    networkName: 'League Wire Network',
    sectionHeadline: 'Around the League',
    earlyPromoImages: [],
    web2PromoImages: [],
    modernPromoImages: [],
  };
}
