import React, { useState } from 'react';
import { Play, Volume2 } from 'lucide-react';
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
  date: string;
  awayWon: boolean;
}

interface LeaderRow {
  name: string;
  line: string;
  value: number;
}

interface EarlyInternetNewsFeedProps {
  articles: NewsItem[];
  lead: NewsItem;
  secondary: NewsItem[];
  scores: ScoreRow[];
  leaders: LeaderRow[];
  standings: NBATeam[];
  seasonYear: number;
  issueDate: string;
  leagueName: string;
  branding: NewsBranding;
  onOpen: (article: NewsItem) => void;
}

function excerpt(article: NewsItem, max = 190): string {
  const text = article.content || article.title;
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function categoryIncludes(article: NewsItem, needle: string): boolean {
  return article.category.toLowerCase().includes(needle);
}

function datedShort(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

function streamLabels(year: number): [string, string, string] {
  if (year >= 2004) return ['56K', 'DSL', 'BROADBAND'];
  if (year >= 2002) return ['56K', '100K', 'DSL'];
  return ['28.8K', '56K', 'ISDN'];
}

function StoryLine({ article, onOpen }: { article: NewsItem; onOpen: (article: NewsItem) => void }) {
  return (
    <div className="mb-3 leading-snug">
      <p className="font-sans text-xs text-black md:text-[13px]">
        <button
          type="button"
          onClick={() => onOpen(article)}
          className="cursor-pointer text-left font-bold text-[#003399] underline"
        >
          {article.title}
        </button>
        <span> - {excerpt(article, 150)}</span>
      </p>
    </div>
  );
}

function MaintenanceLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer text-white hover:underline">
      {children}
    </button>
  );
}

export default function EarlyInternetNewsFeed({
  articles,
  lead,
  secondary,
  scores,
  leaders,
  standings,
  seasonYear,
  issueDate,
  leagueName,
  branding,
  onOpen,
}: EarlyInternetNewsFeedProps) {
  const [showFeatureModal, setShowFeatureModal] = useState(false);
  const brand = branding.wordmark || leagueName.toUpperCase();
  const isNba = branding.kind === 'nba';
  const isWnba = branding.kind === 'wnba';
  const isPba = branding.kind === 'pba';
  const isEurope = branding.kind === 'europe';
  const networkLinks = isEurope
    ? ['EUROBASKET', 'EUROLEAGUE', 'EUROCUP', 'DOMESTIC LEAGUES', 'FIBA', 'BASKETBALL TV']
    : isWnba
      ? ['NBA', 'NBDL', 'WNBA', 'USA BASKETBALL', 'WNBA STORE', 'NBA TV']
    : isNba
      ? ['ESPN.COM', 'ABCSPORTS.COM', `${brand}.COM`, 'WNBA.COM', 'NHL.COM', 'NASCAR ONLINE']
      : isPba
        ? ['PBA.COM.PH', 'TEAMS', 'SCHEDULE', 'STANDINGS', 'VIDEOS', 'TICKETS']
      : [`${brand}.COM`, 'LEAGUE NEWS', 'TEAMS', 'SCORES', 'GLOBAL BASKETBALL', 'BASKETBALL TV'];
  const portalImage = isNba
    ? 'https://web.archive.org/web/20000706193530im_/http://a4.g.akamaitech.net/7/4/624/000/nba.com/images/logo_jan_fin.gif'
    : branding.earlyHeaderImage || branding.logoUrl;
  const promoImage = branding.earlyPromoImages[0] || branding.logoUrl;
  const widePromoImage = branding.earlyPromoImages[1];
  const videoPromoImage = branding.earlyPromoImages[2];
  const ticketPromoImage = branding.earlyPromoImages[3];
  const [streamA, streamB, streamC] = streamLabels(seasonYear);
  const newsStories = articles.filter(a => categoryIncludes(a, 'league'));
  const draftStories = articles.filter(a => categoryIncludes(a, 'breaking') || a.impact === 'high');
  const injuryStories = articles.filter(a => categoryIncludes(a, 'injury'));
  const transactionStories = articles.filter(a => categoryIncludes(a, 'transaction'));
  const featureStories = articles.filter(a => a.imageUrl || a.impact === 'high');
  const leadFeature = featureStories[0] ?? lead;
  const fallbackList = secondary.length > 0 ? secondary : articles.filter(a => a.id !== lead.id).slice(0, 6);
  const todayLinks = fallbackList.length > 0 ? fallbackList.slice(0, 4) : [lead];
  const clipSource = leaders.length > 0
    ? leaders.slice(0, 2).map(l => ({ title: l.name, text: l.line }))
    : todayLinks.slice(0, 2).map(a => ({ title: a.title, text: excerpt(a, 90) }));
  const scoreboardScores = scores.slice(0, 2);
  const tvScores = scores.slice(0, 2);
  const mainNavLinks = isWnba
    ? ['Teams', 'Players', 'Schedule', 'Stats', 'Standings', 'News', 'Photos', 'Video', 'Tickets', 'WNBA LiveAccess']
    : isPba
      ? ['News', 'Features', 'Schedule', 'Teams', 'Players', 'Sights&Sounds', 'Standings', 'PBA TV', 'History', 'Store', 'Tickets']
      : ['News', 'Features', 'Stats&Schedules', 'Teams', 'Players', 'Sights&Sounds', 'Chats&Mailboxes', 'Global Basketball', 'International TV', 'History', `${brand} Store`, 'Tickets'];

  return (
    <div className="min-h-full px-2 py-4 font-serif text-black sm:px-6" style={{ backgroundColor: isEurope ? branding.accent : branding.primary }}>
      {showFeatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm border-2 border-black bg-white p-4 font-sans text-sm shadow-[4px_4px_0px_#000]">
            <h3 className="mb-2 font-bold text-[#cc0000]">Site Maintenance</h3>
            <p className="text-black">This section of {brand}.com is currently undergoing scheduled maintenance. Please check back later.</p>
            <button
              type="button"
              onClick={() => setShowFeatureModal(false)}
              className="mt-4 cursor-pointer bg-black px-3 py-1 text-xs font-bold uppercase text-white hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[800px] border-2 border-black bg-white">
        <div className="flex flex-wrap items-center justify-center gap-2 bg-white px-2 py-1 text-center font-sans text-[10px] font-normal">
          {networkLinks.map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 && <span className="text-black">|</span>}
              <button type="button" onClick={() => setShowFeatureModal(true)} className="text-[#999999] hover:text-black">
                {label}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="mx-1 h-1 rounded-t-sm border-b-2 border-black bg-white" />

        <div className="flex flex-col md:flex-row">
          <div className="flex shrink-0 flex-col border-r border-gray-300 md:w-[130px]" style={{ backgroundColor: isEurope ? '#bdb8ac' : isWnba ? '#dfe6ff' : '#e8effa' }}>
            <div className="relative flex h-[78px] items-center justify-center overflow-hidden bg-black p-1">
              {portalImage
                ? <img src={portalImage} alt={`${brand}.com`} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                : <span className="text-center font-sans text-sm font-black text-white">{brand}</span>}
            </div>

            <div className="flex-1 space-y-6 p-2 font-sans text-xs">
              <div className="mt-1 border border-black bg-white">
                <div className="flex items-center justify-between px-2 py-1 text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: isEurope ? branding.accent : branding.primary }}>
                  <span>SCOREBOARD</span>
                  <span className="font-mono text-[9px] text-yellow-300">{scoreboardScores.length ? 'LIVE' : 'WIRE'}</span>
                </div>
                <div className="space-y-2.5 p-2">
                  {scoreboardScores.length > 0 ? scoreboardScores.map(score => {
                    const awayWon = score.awayWon;
                    return (
                      <div key={score.id} className="space-y-1 border border-dashed border-gray-300 bg-gray-50 p-1.5">
                        <div className="flex justify-between font-bold text-gray-800">
                          <span>{score.away}</span>
                          <span className={`font-mono ${awayWon ? 'text-[#cc0000]' : ''}`}>{score.awayScore}</span>
                        </div>
                        <div className="flex justify-between font-bold text-gray-800">
                          <span>{score.home}</span>
                          <span className={`font-mono ${awayWon ? '' : 'text-[#cc0000]'}`}>{score.homeScore}</span>
                        </div>
                        <span className="block pt-1 text-[9px] font-bold uppercase text-green-700">✔ FINAL REPORT</span>
                      </div>
                    );
                  }) : (
                    <div className="border border-dashed border-gray-300 bg-gray-50 p-1.5 text-center text-[10px] font-bold uppercase text-gray-700">
                      No games today<br />
                      <span className="text-[#003399]">Offseason wire active</span>
                    </div>
                  )}
                  <div className="pt-1 text-center">
                    <span className="block cursor-pointer text-[10px] font-bold text-[#003399] underline">• VIEW FULL STANDINGS •</span>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden border border-black bg-white shadow-[2px_2px_0px_#ccc]">
                <div className="flex justify-center border-b border-gray-300 bg-black px-2 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  {isNba
                    ? <img src="https://web.archive.org/web/20000706193530im_/http://nba.com/nbatv/img/nbatv_icon.gif" alt="NBA TV" className="h-6" referrerPolicy="no-referrer" />
                    : <span style={{ color: branding.accent }}>{brand} TV</span>}
                </div>
                <div className="space-y-3 p-1.5">
                  <div className="space-y-1.5 border border-[#d6d6a2] bg-[#fcfcde] p-1.5 text-center text-[11px]">
                    <p className="font-bold text-[10px] text-black">DAILY GAME CLIPS</p>
                    {videoPromoImage && <img src={videoPromoImage} alt="PBA Top 5 Plays" className="mx-auto h-auto max-h-24 w-full object-contain" />}
                    <p className="font-serif text-[10px] leading-tight text-gray-600">
                      Watch stunning poster dunks, fast-break passes, and critical buzzer beaters.
                    </p>
                    <div className="flex justify-center gap-1 pt-1">
                      {[streamA, streamB, streamC].map((label, index) => (
                        <span key={label} className={`${index === 0 ? 'bg-[#cc0000] text-white' : index === 1 ? 'bg-[#003399] text-white' : 'bg-[#ffcc00] text-black'} cursor-pointer px-1 py-0.5 font-mono text-[8px] font-black hover:bg-black hover:text-white`}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <p className="border-b border-gray-300 pb-1 text-[9px] font-black uppercase tracking-wider text-gray-500">VIDEO CLIPS:</p>
                    {clipSource.map(item => (
                      <div key={`video-${item.title}`} className="space-y-0.5">
                        <span className="flex cursor-pointer items-center gap-1 text-[10px] font-black text-[#cc0000] hover:underline">
                          <Play className="h-2 w-2 fill-current" />
                          {item.title}
                        </span>
                        <p className="text-[9px] leading-snug text-gray-500">{item.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 border-t border-gray-200 pt-1">
                    <p className="border-b border-gray-300 pb-1 text-[9px] font-black uppercase tracking-wider text-gray-500">AUDIO CLIPS:</p>
                    {todayLinks.slice(0, 2).map(article => (
                      <div key={`audio-${article.id}`} className="space-y-0.5">
                        <button type="button" onClick={() => onOpen(article)} className="flex cursor-pointer items-center gap-1 text-left text-[10px] font-black text-[#003399] underline">
                          <Volume2 className="h-2.5 w-2.5" />
                          {article.title}
                        </button>
                        <p className="text-[9px] leading-snug text-gray-500">{article.category}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border bg-[#fff5fa] p-2 text-center font-sans text-[10px]" style={{ borderColor: branding.accent }}>
                {(isNba || promoImage) && <img src={isNba ? 'https://web.archive.org/web/20000706193530im_/http://www.wnba.com/images/wnba_logo80.gif' : promoImage} alt="" className="mx-auto mb-2 max-h-20 max-w-full object-contain" referrerPolicy="no-referrer" />}
                <span className="mb-1 block text-[9px] font-black uppercase tracking-widest" style={{ color: branding.accent }}>{isWnba ? 'WNBA' : isNba ? 'NBA' : isEurope ? 'EUROPE' : 'GLOBAL'} COVERAGE {seasonYear}</span>
                <p className="mb-2 font-serif text-[9px] leading-snug text-[#333]">Follow competitions, standings, awards, and star performances.</p>
                <button type="button" onClick={() => setShowFeatureModal(true)} className="block cursor-pointer text-[9px] font-bold hover:underline" style={{ color: branding.accent }}>
                  OPEN COVERAGE &gt;&gt;
                </button>
              </div>
              {ticketPromoImage && (
                <img src={ticketPromoImage} alt="PBA tickets" className="h-auto w-full border border-black object-contain" />
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-col">
              <div
                className="relative flex h-[48px] items-center justify-center py-2"
                style={{ backgroundColor: branding.primary, backgroundImage: isNba ? "url('https://web.archive.org/web/20000706193530im_/http://www.nba.com/images/blue_tv_tile.jpg')" : undefined }}
              >
                {isNba
                  ? <img src="https://web.archive.org/web/20000706193530im_/http://a4.g.akamaitech.net/7/4/624/000/nba.com/images/banner_long_new.gif" alt={`${brand} Banner`} className="max-w-full sepia-[.2] contrast-125 saturate-50 mix-blend-luminosity" referrerPolicy="no-referrer" />
                  : portalImage
                    ? <img src={portalImage} alt={`${brand} Banner`} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                    : <span className="font-sans text-lg font-black text-white">{brand}</span>}
              </div>

              <div className="min-h-[44px] bg-black px-2 py-1.5 text-center font-sans text-[11px] font-bold leading-relaxed text-white">
                {mainNavLinks.map(label => (
                  <React.Fragment key={label}>
                    <span className="text-[9px] text-[#99ccff]">•</span>
                    <MaintenanceLink onClick={() => setShowFeatureModal(true)}>{label}</MaintenanceLink>{' '}
                  </React.Fragment>
                ))}
              </div>
              {widePromoImage && (
                <div className="border-b border-black bg-black p-1">
                  <img src={widePromoImage} alt="PBA promotion" className="mx-auto h-auto max-h-[170px] w-full object-contain" />
                </div>
              )}

              <div
                className="flex h-[24px] items-stretch justify-between bg-[#003399]"
                style={{ backgroundColor: branding.primary, backgroundImage: isNba ? "url('https://web.archive.org/web/20000706193530im_/http://www.nba.com/images/blue_tv_tile.jpg')" : undefined }}
              >
                <div className="hidden w-[136px] sm:block">
                  {portalImage && <img src={isNba ? 'https://web.archive.org/web/20000706193530im_/http://a4.g.akamaitech.net/7/4/624/000/nba.com/images/logo_jan1a.gif' : portalImage} alt={`${brand} Logo Sidebar`} className="h-full w-full object-contain" referrerPolicy="no-referrer" />}
                </div>
                <div className="flex items-center gap-1.5 pr-3 pb-1 font-sans text-[9px] font-normal text-[#fffff2]">
                  {(isEurope
                    ? ['EUROPE', 'EUROLEAGUE', 'EUROCUP', 'FIBA']
                    : isWnba
                      ? ['TEAMS', 'PLAYERS', 'TRANSACTIONS', 'WNBA TV']
                      : ['CANADA', 'ESPAÑOL', 'JAPAN', 'UK']).map((label, index) => (
                    <React.Fragment key={label}>
                      {index > 0 && ' | '}
                      <button type="button" onClick={() => setShowFeatureModal(true)} className="hover:underline">{label}</button>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col border-t-2 border-black md:flex-row">
              <main className="min-w-0 flex-1 space-y-6 bg-white p-4 font-serif">
                <div className="border-b border-black pb-2">
                  <span className="block font-sans text-[10px] font-bold uppercase tracking-widest text-gray-500">{issueDate} | Daily Glance</span>
                  <h2 className="mt-1 font-sans text-xl font-black uppercase leading-tight tracking-tight text-[#990000] md:text-2xl">{branding.sectionHeadline}</h2>
                </div>

                <div className="space-y-3">
                  {leadFeature.imageUrl && (
                    <div className="border border-black bg-gray-50 p-1 shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
                      <img src={leadFeature.imageUrl} alt={leadFeature.title} className="max-h-56 w-full object-cover sepia-[.2] contrast-125 saturate-50" referrerPolicy="no-referrer" />
                      <div className="mt-1 flex items-center justify-between bg-[#003399] px-2 py-1 font-sans text-[10px] font-black uppercase tracking-wider text-white">
                        <span>DAILY COVERAGE PICTURE</span>
                        <span className="text-yellow-300">★ EXCLUSIVE</span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => onOpen(leadFeature)}
                      className="cursor-pointer text-left font-sans text-base font-bold leading-tight text-[#003399] underline md:text-lg"
                    >
                      {leadFeature.title}
                    </button>
                    <p className="text-justify text-[13px] leading-relaxed text-gray-800 first-letter:float-left first-letter:mr-2 first-letter:text-3xl first-letter:font-black first-letter:text-[#990000] md:text-sm">
                      {excerpt(leadFeature, 360)}
                    </p>
                    <p className="font-sans text-[12px] text-gray-500">
                      Date: {leadFeature.date} | Category: <strong className="uppercase text-black">{leadFeature.category}</strong>
                    </p>
                    <button type="button" onClick={() => onOpen(leadFeature)} className="block cursor-pointer font-sans text-[11px] font-bold uppercase tracking-wider text-[#990000] underline hover:text-black">
                      Read full exclusive report &gt;&gt;
                    </button>
                  </div>
                </div>

                {[
                  ['N E W S', newsStories.length ? newsStories : todayLinks],
                  ['F E A T U R E S', featureStories.filter(a => a.id !== leadFeature.id).slice(0, 4)],
                  [isNba ? 'N B A   D R A F T   &   C H A M P I O N S H I P' : isWnba ? 'W N B A   P L A Y E R S   &   P L A Y O F F S' : isEurope ? 'E U R O P E A N   C O M P E T I T I O N S' : 'D R A F T   &   C H A M P I O N S H I P', draftStories.slice(0, 4)],
                  ['I N J U R Y   R E P O R T S', injuryStories.slice(0, 4)],
                  ['T R A N S A C T I O N S', transactionStories.slice(0, 4)],
                ].filter(([, list]) => Array.isArray(list) && list.length > 0).map(([title, list]) => (
                  <div key={String(title)} className="mt-4 space-y-2">
                    <div className="font-sans text-sm font-bold uppercase tracking-[0.2em] text-[#cc0000]">{String(title)}</div>
                    <div className="space-y-3">
                      {(list as NewsItem[]).map(article => <StoryLine key={article.id} article={article} onOpen={onOpen} />)}
                    </div>
                  </div>
                ))}
              </main>

              <aside className="flex shrink-0 flex-col items-center border-l border-gray-300 md:w-[140px]" style={{ backgroundColor: isEurope ? '#bdb8ac' : isWnba ? '#cbd7ff' : '#99ccff' }}>
                <div className="mt-2 w-full">
                  <div className="mb-1 flex justify-center bg-black py-1 text-center text-[10px] font-bold uppercase leading-tight tracking-wider text-white">TV TUNE IN!</div>
                  {tvScores.length > 0 ? tvScores.map(score => (
                    <div key={`tv-${score.id}`}>
                      <div
                        className="mb-1 w-full bg-[#0A3A81] py-0.5 text-center"
                        style={{ backgroundColor: branding.primary, backgroundImage: isNba ? "url('https://web.archive.org/web/20000706193530im_/http://nba.com/images/blue_tv_tile.jpg')" : undefined }}
                      >
                        <span className="text-[9px] font-bold text-white">{datedShort(score.date)}</span>
                      </div>
                      <div className="mb-2 space-y-1 px-2">
                        <span className="mr-1 text-xs font-black text-[#cc0000]">•</span>
                        <span className="text-[9px] font-bold text-black">{score.away} at {score.home}</span>
                        <div className="pl-3 text-[9px]">FINAL <span className="font-black">{score.awayScore}-{score.homeScore}</span></div>
                      </div>
                    </div>
                  )) : (
                    <div className="px-2 pb-3 text-center text-[9px] font-bold text-black">
                      {issueDate}<br />
                      No games scheduled
                    </div>
                  )}
                </div>

                <div className="my-1 h-0.5 w-full bg-white" />

                <div className="w-full bg-black p-2 text-center">
                  <span className="mb-1 block text-xs font-black uppercase tracking-widest text-white">{brand} STORE</span>
                  <div className="mb-1 bg-white p-0.5">
                    {(isNba || promoImage) && <img src={isNba ? 'https://web.archive.org/web/20000706193530im_/http://www.nba.com/store/images/lakers_video000706_1.jpg' : promoImage} alt={`${brand} Store Item`} className="h-auto w-full grayscale contrast-125" referrerPolicy="no-referrer" />}
                  </div>
                  <button type="button" onClick={() => setShowFeatureModal(true)} className="block cursor-pointer text-[9px] leading-tight text-white hover:underline">
                    Check out championship merchandise in the {brand} Store!
                  </button>
                  <p className="mt-3 mb-1 text-[10px] font-bold uppercase text-red-500">News &amp; Events</p>
                  <button type="button" onClick={() => setShowFeatureModal(true)} className="block cursor-pointer text-[9px] leading-tight text-white hover:underline">
                    • Players to appear at the {brand} Store
                  </button>
                </div>

                <div className="my-1 h-0.5 w-full bg-white" />

                <div className="mt-1 w-full px-1 pb-4">
                  <div className="mb-2 bg-black py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-white">{brand} TODAY</div>
                  <ul className="space-y-2 pl-1 text-[9px] leading-snug">
                    {todayLinks.map(article => (
                      <li key={`today-${article.id}`}>
                        <span className="mr-1 font-bold text-red-600">•</span>
                        <button type="button" onClick={() => onOpen(article)} className="cursor-pointer text-left text-[#003399] underline">{article.title}</button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="w-full px-1 pb-4">
                  <div className="mb-2 bg-black py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-white">STANDINGS</div>
                  {standings.slice(0, 8).map((team, index) => (
                    <div key={team.id} className="flex justify-between border-b border-black/20 py-1 text-[9px]">
                      <span>{index + 1}. {getTeamFullName(team)}</span>
                      <b>{team.wins}-{team.losses}</b>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </div>

        <footer className="mt-auto bg-white px-6 pt-2 pb-6 text-center font-sans text-xs">
          <div className="mx-auto mb-2 max-w-4xl border-t border-gray-400 pt-2" />
          <div className="flex flex-wrap justify-center gap-x-1 gap-y-1 text-[13px] text-[#003399]">
            {[`Contact ${brand}.com`, 'Rules & References', 'FAQ', `${brand}@Work`].map((label, index) => (
              <React.Fragment key={label}>
                {index > 0 && <span className="text-black"> | </span>}
                <button type="button" onClick={() => setShowFeatureModal(true)} className="cursor-pointer underline">{label}</button>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-1">
            <button type="button" onClick={() => setShowFeatureModal(true)} className="cursor-pointer text-[13px] text-[#003399] underline">
              Sign up for {brand}.com Special Delivery
            </button>
          </div>
          <div className="mx-auto mt-2 mb-4 max-w-4xl border-t border-gray-400" />
          <div className="mx-auto max-w-xl font-serif text-[10px] font-normal leading-normal text-gray-500">
            {isNba && <div className="my-4 flex justify-center"><img src="https://web.archive.org/web/20000706193530im_/http://nba.com/images/eiv.gif" alt="ESPN Internet Ventures" referrerPolicy="no-referrer" /></div>}
            <p className="mb-2">
              Copyright © {seasonYear} {branding.legalName}.
              All rights reserved. No portion of this site may be duplicated, redistributed or manipulated in any form without express written consent.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
