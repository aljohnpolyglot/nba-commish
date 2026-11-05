import React, { useEffect, useMemo, useState } from 'react';
import type { NBATeam } from '../../../types';
import { getTeamFullName } from '../../../utils/teamNames';
import type { NewsItem } from '../types';
import type { NewsBranding } from '../branding';

interface ScoreRow {
  id: number;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  awayLogo?: string;
  homeLogo?: string;
}

interface LeaderRow {
  name: string;
  line: string;
  value: number;
  team?: string;
  pts?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  imageUrl?: string;
}

interface Web2NewsFeedProps {
  articles: NewsItem[];
  lead: NewsItem;
  secondary: NewsItem[];
  scores: ScoreRow[];
  leaders: LeaderRow[];
  standings: NBATeam[];
  seasonYear: number;
  leagueName: string;
  branding: NewsBranding;
  onOpen: (article: NewsItem) => void;
}

type StatCategory = 'Points' | 'Rebounds' | 'Assists' | 'Steals' | 'Blocks';

function SocialButtons() {
  return (
    <div className="mt-2 flex gap-1">
      <button type="button" className="flex items-center gap-1 rounded-[2px] border border-[#ccc] bg-[#f0f0f0] px-1.5 py-0.5 text-[10px] text-[#333] hover:bg-[#e0e0e0]">
        <span className="font-serif font-bold text-[#3b5998]">f</span> Like
      </button>
      <button type="button" className="flex items-center gap-1 rounded-[2px] border border-[#ccc] bg-[#f0f0f0] px-1.5 py-0.5 text-[10px] text-[#333] hover:bg-[#e0e0e0]">
        <span className="font-bold text-[#00acee]">t</span> Tweet
      </button>
    </div>
  );
}

function excerpt(article: NewsItem | undefined, max = 130): string {
  const text = article?.content || article?.title || '';
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function statValue(leader: LeaderRow | undefined, category: StatCategory): number {
  if (!leader) return 0;
  if (category === 'Points') return leader.pts ?? leader.value;
  if (category === 'Rebounds') return leader.reb ?? leader.value;
  if (category === 'Assists') return leader.ast ?? leader.value;
  if (category === 'Steals') return leader.stl ?? leader.value;
  return leader.blk ?? leader.value;
}

function confTeams(teams: NBATeam[], conf: 'East' | 'West'): NBATeam[] {
  const prefix = conf.toLowerCase()[0];
  return teams
    .filter(t => t.conference?.toLowerCase().startsWith(prefix) || (conf === 'East' ? t.cid === 0 : t.cid === 1))
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || getTeamFullName(a).localeCompare(getTeamFullName(b)))
    .slice(0, 8);
}

function cardImage(article: NewsItem | undefined, fallback: string): string {
  return article?.imageUrl || fallback;
}

export default function Web2NewsFeed({
  articles,
  lead,
  secondary,
  scores,
  leaders,
  standings,
  seasonYear,
  leagueName,
  branding,
  onOpen,
}: Web2NewsFeedProps) {
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [statsCategory, setStatsCategory] = useState<StatCategory>('Points');
  const [statsLeaderPage, setStatsLeaderPage] = useState(0);
  const heroMain = lead;
  const remaining = secondary.length ? secondary : articles.filter(a => a.id !== lead.id);
  const heroSide1 = remaining[0];
  const heroSide2 = remaining[1];
  const sidebarArticles = remaining.filter(a => a.id !== heroSide1?.id && a.id !== heroSide2?.id).slice(0, 10);
  const blockArticles = remaining.slice(2, 7);
  const isNba = branding.kind === 'nba';
  const isWnba = branding.kind === 'wnba';
  const isPba = branding.kind === 'pba';
  const isEurope = branding.kind === 'europe';
  const splitAt = Math.ceil(standings.length / 2);
  const conferenceMode = isNba || isWnba;
  const eastTeams = conferenceMode ? confTeams(standings, 'East') : standings.slice(0, splitAt).slice(0, 8);
  const westTeams = conferenceMode ? confTeams(standings, 'West') : standings.slice(splitAt).slice(0, 8);
  const rankedLeaders = useMemo(
    () => [...leaders].sort((a, b) => statValue(b, statsCategory) - statValue(a, statsCategory) || a.name.localeCompare(b.name)).slice(0, 5),
    [leaders, statsCategory],
  );
  const statsLeaderPageCount = Math.max(1, rankedLeaders.length);
  const dailyLeader = rankedLeaders[statsLeaderPage];
  useEffect(() => {
    setStatsLeaderPage(page => Math.min(page, statsLeaderPageCount - 1));
  }, [statsLeaderPageCount]);
  const brand = branding.wordmark || leagueName.toUpperCase();
  const neutralFallback = branding.web2PromoImages[2]
    || branding.earlyPromoImages[2]
    || branding.web2PromoImages[0]
    || branding.earlyPromoImages[0]
    || 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&w=1000&q=80';
  const eraFallback = (nbaImage: string) => isNba ? nbaImage : neutralFallback;
  const firstScore = scores[0];
  const web2Logo = branding.web2LogoUrl || branding.logoUrl;
  const navigation = isWnba
    ? ['Teams', 'Players', 'Schedule', 'Stats', 'Standings', 'News', 'Photos', 'Video', 'Tickets']
    : isPba
      ? ['Tickets', 'Teams', 'Schedule', 'News', 'Video', 'Players', 'Standings', 'Stats', 'PBA TV', 'More']
      : ['Tickets', 'Teams', 'Scores & Schedules', 'News', 'Blogs', 'Video', 'Players', 'Standings', 'Stats', 'Mobile', 'TV', 'League Pass', 'Fantasy', 'More'];
  const web2Style = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    '--web2-link': isWnba || isPba ? branding.accent : '#005c9e',
  } as React.CSSProperties;

  return (
    <div className="min-h-full bg-[#b5b8ba] pb-12 pt-4 text-[#333]" style={web2Style}>
      {showMaintenance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm border-t-4 border-[var(--web2-link)] bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-xl font-bold text-[var(--web2-link)]">Site Maintenance</h3>
            <p className="mb-4 text-sm text-gray-600">This section of {brand}.com is currently undergoing scheduled maintenance. Please check back later.</p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setShowMaintenance(false)} className="rounded bg-[var(--web2-link)] px-4 py-2 text-sm font-bold text-white opacity-90 hover:opacity-100">Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[970px] overflow-hidden bg-white shadow-lg">
        <header
          className="relative bg-gradient-to-b from-[#0066b3] to-[#004781]"
          style={isEurope
            ? { background: `linear-gradient(180deg, ${branding.secondary}, ${branding.accent})` }
            : isWnba
              ? { background: `linear-gradient(180deg, ${branding.accent}, #d63f00)` }
              : isPba
                ? { background: `linear-gradient(180deg, ${branding.primary}, #071c3d)` }
              : undefined}
        >
          {branding.web2HeaderImage && (
            <img
              src={branding.web2HeaderImage}
              alt=""
              className="pointer-events-none absolute right-0 top-0 hidden h-[100px] max-w-[58%] object-contain object-right opacity-45 md:block"
            />
          )}
          <div className="relative flex">
            <div className="relative z-10 h-[100px] w-[120px] shrink-0">
              <div className="absolute top-0 left-4 flex h-[115px] w-[85px] flex-col items-center justify-center rounded-b-lg shadow-md">
                {web2Logo
                  ? <img src={web2Logo} className="max-h-[90px] max-w-[82px] object-contain" alt={`${brand} Logo`} referrerPolicy="no-referrer" />
                  : <span className="px-2 text-center text-sm font-black text-white">{brand}</span>}
              </div>
            </div>

            <div className="flex flex-1 flex-col pr-4 pt-1">
              <div className="flex items-center justify-between text-[10px] text-[#99ccff]">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border border-[#99ccff]" />
                  <span className="cursor-pointer opacity-70 hover:text-white" onClick={() => setShowMaintenance(true)}>{isEurope ? 'EUROCUP' : isWnba ? 'NBA.COM' : isNba ? 'D-LEAGUE' : 'LEAGUE'}</span>
                  <span className="cursor-pointer opacity-70 hover:text-white" onClick={() => setShowMaintenance(true)}>{isEurope ? 'DOMESTIC' : isWnba ? 'LIVEACCESS' : isNba ? 'WNBA' : 'COMMUNITY'}</span>
                </div>
                <div className="hidden items-center gap-3 md:flex">
                  <span className="cursor-pointer hover:text-white" onClick={() => setShowMaintenance(true)}>Login | Get News &amp; Offers</span>
                  <div className="cursor-pointer rounded-[2px] border border-[#ccc] bg-[#ececec] px-1 py-0.5 text-[#333]" onClick={() => setShowMaintenance(true)}><b>Like</b> 16m</div>
                  <div className="cursor-pointer rounded-[2px] bg-[#00acee] px-1 py-0.5 text-white" onClick={() => setShowMaintenance(true)}><b>Follow @{brand}</b></div>
                  <button type="button" className="ml-2 rounded-full border border-[#003366] bg-gradient-to-b from-[#0066cc] to-[#004499] px-3 py-1 font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]" onClick={() => setShowMaintenance(true)}>
                    {brand} STORE ▶
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] font-bold text-white">
                {navigation.map(label => (
                  <button type="button" key={label} className="cursor-pointer hover:text-[#99ccff]" onClick={() => setShowMaintenance(true)}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          <div
            className="ml-0 flex h-[32px] items-center justify-between border-t border-[#003a6b] bg-gradient-to-b from-[#00518f] to-[#003a6b] px-4 md:ml-[120px]"
            style={isWnba ? { background: '#111111', borderColor: '#111111' } : undefined}
          >
            <div className="flex gap-4 text-[11px] text-[#99ccff]">
              <span>Season {seasonYear}</span>
            </div>
          </div>
        </header>

        {branding.web2PromoImages[0] && (
          <div className="border-b border-[#c9c9c9] bg-[#ececec] px-2 py-2 sm:px-4">
            <img
              src={branding.web2PromoImages[0]}
              alt="PBA sponsor"
              className="mx-auto h-auto max-h-[171px] w-full max-w-[972px] object-contain"
            />
          </div>
        )}

        <div className="px-4 py-3">
          <div className="mb-3 flex items-center bg-[#f5f5f5] p-2 text-[12px]">
            <button type="button" className="cursor-pointer text-left text-[#333] hover:text-[var(--web2-link)]" onClick={() => onOpen(heroMain)}>{heroMain.title}</button>
            {heroSide1 && <><span className="mx-2 text-gray-400">|</span><button type="button" className="cursor-pointer text-left text-[#333] hover:text-[var(--web2-link)]" onClick={() => onOpen(heroSide1)}>{heroSide1.title}</button></>}
          </div>

          <div className="mb-2 flex flex-col md:flex-row">
            <button type="button" className="group relative h-[354px] w-full cursor-pointer overflow-hidden bg-black text-left md:w-[630px]" onClick={() => onOpen(heroMain)}>
              <img src={cardImage(heroMain, eraFallback('https://web.archive.org/web/20130401041634im_/http://i2.cdn.turner.com/nba/nba/dam/assets/130304183455-chris-bosh-emotion-030413.home-t3.jpg'))} className="h-full w-full object-cover opacity-90 group-hover:opacity-100" alt="" referrerPolicy="no-referrer" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent px-4 pb-4 pt-16">
                <h2 className="mb-1 text-3xl font-bold text-white group-hover:underline">{heroMain.title}</h2>
                <p className="line-clamp-1 text-[11px] text-gray-300">{excerpt(heroMain)}</p>
                <div className="absolute right-4 bottom-5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-black/50">
                  <span className="ml-1 text-[12px] text-white">▶</span>
                </div>
              </div>
            </button>

            <div className="mt-2 flex h-[354px] w-full flex-col gap-[4px] md:ml-[4px] md:mt-0 md:w-[304px]">
              {[heroSide1, heroSide2].map((article, index) => article && (
                <button key={article.id} type="button" className="group relative flex-1 cursor-pointer overflow-hidden bg-black text-left" onClick={() => onOpen(article)}>
                  <img src={cardImage(article, eraFallback(index === 0 ? 'https://web.archive.org/web/20130401041634im_/http://i2.cdn.turner.com/nba/nba/dam/assets/130331215734-carmelo-anthony-033113.home-t6.jpg' : 'https://web.archive.org/web/20130401041634im_/http://i2.cdn.turner.com/nba/nba/dam/assets/130325174228-lebron-dunk-terry-032513.home-t6.jpg'))} className="h-full w-full object-cover opacity-90 group-hover:opacity-100" alt="" referrerPolicy="no-referrer" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent px-3 pb-2 pt-12">
                    <h3 className="text-[14px] font-bold leading-tight text-white group-hover:underline">{article.title}</h3>
                    {index === 1 && <div className="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-black/50"><span className="ml-0.5 text-[10px] text-white">▶</span></div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5 flex items-center pb-3 text-[11px] text-[#333]">
            <span className="mr-3">Create a custom {brand} video channel</span>
            <button type="button" className="flex items-center gap-1 rounded-[2px] bg-[#3b5998] px-2 py-0.5 font-bold text-white shadow-sm">
              <span className="font-serif text-[12px]">f</span> Connect with Facebook
            </button>
          </div>

          <div className="flex flex-col gap-4 md:flex-row">
            <div className="w-full shrink-0 md:w-[300px]">
              <div className="border border-[#e0e0e0] bg-white">
                <div className="border-t-[4px] border-[var(--web2-link)] bg-[#f8f8f8] px-4 py-2">
                  <h3 className="text-[15px] font-bold text-[#333]">Top Stories</h3>
                </div>
                <div className="p-3">
                  {(sidebarArticles.length ? sidebarArticles : [heroMain]).map((article, index) => (
                    <div key={article.id} className={`border-b border-dashed border-[#ddd] py-2 ${index === sidebarArticles.length - 1 ? 'border-0' : ''}`}>
                      <button type="button" className="mb-1 cursor-pointer text-left text-[13px] leading-snug text-[var(--web2-link)] hover:underline" onClick={() => onOpen(article)}>{article.title}</button>
                      <div className="flex items-center gap-1 text-[10px] text-[#666]"><span className="text-[8px] text-[var(--web2-link)]">▶</span><span>Highlights</span></div>
                    </div>
                  ))}
                  <div className="mt-3 text-center">
                    <button type="button" className="mx-auto flex w-full items-center justify-center gap-1 rounded-[2px] bg-[#3b5998] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm">
                      <span className="font-serif">f</span> Connect with Facebook
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full md:w-[622px]">
              <div className="grid grid-cols-1 gap-x-[14px] gap-y-4 md:grid-cols-2">
                {[
                  ['Latest Features', blockArticles[0], branding.web2PromoImages[2] || eraFallback('https://web.archive.org/web/20130401041634im_/http://i2.cdn.turner.com/nba/nba/dam/assets/130330150940-0021201085-chi-dal-play2-00001502.full-flex-module.jpg')],
                  ['Photo Gallery', blockArticles[1], branding.web2PromoImages[1] || eraFallback('https://web.archive.org/web/20130401041634im_/http://i.cdn.turner.com/nba/tmpl_asset/static/nba-cms3-homepage/1216/elements/global/no.png')],
                  ['League Spotlight', blockArticles[2], branding.web2PromoImages[3] || eraFallback('https://web.archive.org/web/20130401041634im_/http://i2.cdn.turner.com/nba/nba/dam/assets/121231004728-james-harden-russell-westbrook.full-flex-module.jpg')],
                ].map(([title, article, fallback]) => (
                  <div key={String(title)}>
                    <h3 className="mb-1 text-[15px] font-bold text-[#333]">{String(title)}</h3>
                    <div className={`${title === 'Photo Gallery' ? 'h-[235px] bg-black text-white' : 'bg-white'} border border-[#e0e0e0] p-3`}>
                      <img src={cardImage(article as NewsItem | undefined, String(fallback))} className={`${title === 'Photo Gallery' ? 'max-h-[160px] bg-[#111] opacity-80 hover:opacity-100' : 'mb-2 h-[140px]'} w-full cursor-pointer object-cover`} alt="" onClick={() => article && onOpen(article as NewsItem)} referrerPolicy="no-referrer" />
                      <button type="button" className="mb-1 cursor-pointer text-left text-[13px] font-bold leading-tight text-[var(--web2-link)] hover:underline" onClick={() => article && onOpen(article as NewsItem)}>
                        {(article as NewsItem | undefined)?.title || String(title)}
                      </button>
                      {title !== 'Photo Gallery' && <p className="line-clamp-2 text-[11px] text-[#333]">{excerpt(article as NewsItem | undefined)}</p>}
                      <SocialButtons />
                    </div>
                  </div>
                ))}

                <div className="mt-1">
                  <div className="border border-[#e0e0e0] bg-white">
                    <div className="border-b border-[#e0e0e0] bg-[#f5f5f5] px-3 py-2">
                      <h3 className="text-[14px] font-bold text-[#333]">Popular Topics</h3>
                    </div>
                    <ul className="p-3">
                      {(sidebarArticles.length ? sidebarArticles : [heroMain]).slice(0, 5).map((article, index) => (
                        <li key={article.id} className="mb-2 last:mb-0">
                          <button type="button" className="mb-1 cursor-pointer text-left text-[12px] font-bold leading-tight text-[var(--web2-link)] hover:underline" onClick={() => onOpen(article)}>{article.title}</button>
                          <div className="h-1 w-full bg-gray-200"><div className="h-full bg-red-600" style={{ width: `${Math.max(10, 80 - index * 15)}%` }} /></div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t-[3px] border-[#ccc] pt-4">
            <div className="mb-3 flex items-center gap-2">
              {web2Logo && <img src={web2Logo} className="h-5 w-auto" alt={`${brand} Logo`} referrerPolicy="no-referrer" />}
              <span className="text-[22px] font-bold">TV</span>
            </div>
            <div className="flex flex-col gap-[14px] md:flex-row">
              <div className="flex-1 border border-[#e0e0e0] bg-[#f9f9f9] p-4">
                <h3 className="mb-2 text-[13px] font-bold text-[#333]">Fan Night Vote</h3>
                <div className="relative mb-2 flex h-[110px] w-full overflow-hidden bg-gradient-to-b from-[#1a4a9b] to-[#0a2351]">
                  <div className="absolute inset-0 flex items-center justify-between px-6">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-white/90 p-1 shadow-md">
                      {firstScore?.awayLogo
                        ? <img src={firstScore.awayLogo} alt={`${firstScore.away} logo`} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                        : <span className="text-xs font-bold text-[#164280]">{firstScore?.away.slice(0, 3).toUpperCase() || 'AWY'}</span>}
                    </div>
                    <div className="text-xl font-black italic text-white drop-shadow-md">AT</div>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#FDB927] bg-white/90 p-1 shadow-md">
                      {firstScore?.homeLogo
                        ? <img src={firstScore.homeLogo} alt={`${firstScore.home} logo`} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                        : <span className="text-xs font-bold text-[#552583]">{firstScore?.home.slice(0, 3).toUpperCase() || 'HME'}</span>}
                    </div>
                  </div>
                  <div className="absolute bottom-1 left-2 text-[10px] font-bold uppercase tracking-widest text-white">Vote Now</div>
                </div>
                <div className="text-[12px] font-bold text-[#333]">Tune in Tuesday at 10:00 PM ET</div>
                <div className="mb-2 text-[11px] text-[#555]">{firstScore ? `Watch ${firstScore.away} battle ${firstScore.home}.` : 'Watch the league spotlight matchup.'}</div>
                <SocialButtons />
              </div>

              <div className="flex-1 border border-[#e0e0e0] bg-[#f9f9f9] p-4">
                <h3 className="mb-2 text-[13px] font-bold text-[#333]">Primetime Schedule</h3>
                <div className="mb-2 flex flex-col gap-2 border-b border-[#ddd] pb-3 text-[11px] text-[#333]">
                  {(isNba
                    ? ['NBA.com Fantasy Inside...', 'Beat #520, The', 'NBA GameTime', 'AutoTrader.com Pregam...']
                    : isWnba
                      ? ['WNBA Game Center', 'Player Movement', 'Team Spotlight', 'WNBA LiveAccess']
                    : isEurope
                      ? ['EuroLeague Game Center', 'Domestic Roundup', 'Transfer Market', 'International Window']
                      : ['League Game Center', 'Daily Roundup', 'Team Spotlight', 'Pregame']).map((label, index) => (
                    <div key={label} className="flex justify-between"><span>{label}</span><span className="font-bold">{5 + index}:00 PM ET</span></div>
                  ))}
                </div>
                <div className="cursor-pointer text-right text-[11px] font-bold text-[var(--web2-link)] hover:underline">Complete Schedule ▶</div>
              </div>

              <div className="flex-1 border border-[#e0e0e0] bg-[#f9f9f9] p-4">
                <h3 className="mb-2 text-[13px] font-bold text-[#333]">{blockArticles[3]?.title || "League Streak Watch"}</h3>
                <img src={cardImage(blockArticles[3], cardImage(heroMain, eraFallback('https://web.archive.org/web/20130401041634im_/http://i2.cdn.turner.com/nba/nba/dam/assets/130328103538-lebron-james-reacts-udonis-haslem-032813.full-flex-module.jpg')))} className="mb-2 h-[110px] w-full object-cover" alt="" referrerPolicy="no-referrer" />
                <div className="text-[12px] font-bold text-[#333]">{blockArticles[3]?.title || 'Top plays from the latest run'}</div>
                <div className="mb-2 text-[11px] text-[#555]">{excerpt(blockArticles[3] ?? heroMain)}</div>
                <SocialButtons />
              </div>
            </div>
          </div>

          <div className="mt-8 border-t-[4px] border-[var(--web2-link)] pb-4 pt-4">
            <h2 className="mb-3 text-[20px] font-bold text-[#333]">Stats &amp; Standings</h2>
            <div className="flex flex-col gap-[14px] md:flex-row">
              <div className="shrink-0 md:w-[300px]">
                <div className="relative min-h-[330px] overflow-hidden border border-[#dcdcdc] bg-gradient-to-b from-[#e6f0fa] to-white p-3">
                  <div className="relative z-10 mb-4 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold">Stats Leaders</h3>
                    <select aria-label="Stats leader category" className="border border-[#aaa] bg-gradient-to-b from-white to-[#eaeaea] px-2 py-0.5 text-[11px] font-bold shadow-sm" value={statsCategory} onChange={e => { setStatsCategory(e.target.value as StatCategory); setStatsLeaderPage(0); }}>
                      <option>Points</option><option>Rebounds</option><option>Assists</option><option>Steals</option><option>Blocks</option>
                    </select>
                  </div>
                  <div className="relative z-10 flex h-[160px] items-center">
                    <div className="flex h-[160px] w-[140px] items-end justify-center">
                      {dailyLeader?.imageUrl
                        ? <img src={dailyLeader.imageUrl} className="max-h-[160px] max-w-[140px] object-contain object-bottom" alt={dailyLeader.name} referrerPolicy="no-referrer" />
                        : <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-[#b9cce0] bg-white text-xl font-black text-[#315d87]">{dailyLeader?.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('') || '—'}</div>}
                    </div>
                    <div className="flex flex-1 flex-col items-center">
                      <div className="text-[13px] font-bold text-[#333]">Daily Leader</div>
                      <div className="mb-2 min-h-[36px] text-center font-serif text-[15px] leading-tight text-[#333]">{dailyLeader?.name || 'N/A'}</div>
                      <div className="w-full border-t border-[#ccc] pt-2 text-center text-[54px] font-bold leading-none tracking-tighter text-[#333]">
                        {Math.round(statValue(dailyLeader, statsCategory))}
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-[10px] text-[#666]">
                    <button type="button" aria-label="Previous stats leader" disabled={statsLeaderPage === 0} onClick={() => setStatsLeaderPage(page => Math.max(0, page - 1))} className="border border-[#ccc] bg-gradient-to-b from-white to-[#eaeaea] px-1.5 py-0.5 shadow-sm disabled:opacity-40">◀</button>
                    {Array.from({ length: statsLeaderPageCount }, (_, index) => (
                      <button type="button" key={index} aria-label={`Stats leader ${index + 1}`} aria-current={statsLeaderPage === index ? 'page' : undefined} onClick={() => setStatsLeaderPage(index)} className={statsLeaderPage === index ? 'font-black text-[var(--web2-link)] underline' : 'hover:underline'}>{index + 1}</button>
                    ))}
                    <button type="button" aria-label="Next stats leader" disabled={statsLeaderPage >= statsLeaderPageCount - 1} onClick={() => setStatsLeaderPage(page => Math.min(statsLeaderPageCount - 1, page + 1))} className="border border-[#ccc] bg-gradient-to-b from-white to-[#eaeaea] px-1.5 py-0.5 shadow-sm disabled:opacity-40">▶</button>
                  </div>
                </div>
              </div>

              <div className="min-h-[330px] flex-1 border border-[#e0e0e0] bg-[#f9f9f9] p-4">
                <h3 className="mb-3 text-[14px] font-bold">Standings</h3>
                <div className="flex flex-col gap-6 md:flex-row">
                  {[
                    [conferenceMode ? 'EASTERN' : 'TABLE A', eastTeams],
                    [conferenceMode ? 'WESTERN' : 'TABLE B', westTeams],
                  ].map(([label, teams]) => (
                    <div key={String(label)} className="flex-1">
                      <table className="w-full text-[11px]">
                        <thead><tr className="border-b border-[#ccc] text-[#333]"><th className="w-[80px] pb-1 text-left font-bold">{String(label)}</th><th className="w-6 pb-1 text-center font-bold">W</th><th className="w-6 pb-1 text-center font-bold">L</th></tr></thead>
                        <tbody>
                          {(teams as NBATeam[]).map((team, index) => (
                            <tr key={team.id} className="border-b border-[#eaeaea]">
                              <td className="flex gap-2 py-1.5"><span className="w-3 text-[#666]">{index + 1}</span><span className="w-24 truncate font-bold text-[#333]">{getTeamFullName(team)}</span></td>
                              <td className="py-1.5 text-center text-[#666]">{team.wins}</td>
                              <td className="py-1.5 text-center text-[#666]">{team.losses}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t-[8px] border-[#c9082a] bg-[#2a2a2a] px-8 py-10 text-[11px] text-[#aaa]">
          <p className="mb-4 leading-relaxed text-white">
            Copyright © {seasonYear} {branding.legalName}. All rights reserved. No portion of {brand}.com may be duplicated, redistributed or manipulated in any form.
          </p>
          <div className="mb-4 flex min-h-[24px] w-max min-w-[80px] items-center justify-center rounded-full border border-gray-500 bg-gradient-to-b from-[#666] to-[#444] px-3 text-[12px] font-black italic tracking-widest text-gray-400 opacity-70 shadow-inner">{branding.wordmark}</div>
          <p>{brand}.com is part of {branding.networkName}.</p>
        </footer>
      </div>
    </div>
  );
}
