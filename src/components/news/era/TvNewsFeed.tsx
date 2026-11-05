import React, { useEffect, useState } from 'react';
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
}

interface TvNewsFeedProps {
  articles: NewsItem[];
  lead: NewsItem;
  scores: ScoreRow[];
  leaders: LeaderRow[];
  standings: NBATeam[];
  seasonYear: number;
  issueDate: string;
  leagueName: string;
  branding: NewsBranding;
  onOpen: (article: NewsItem) => void;
}

type StandingsConf = 'East' | 'West';
type StatCategory = 'POINTS' | 'ASSISTS' | 'REBOUNDS' | 'STEALS' | 'BLOCKS';

function TvPanel({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative flex flex-col overflow-hidden rounded-sm border-[3px] border-[#3a3a3a] bg-black shadow-[0_0_10px_rgba(0,0,0,0.8)] ${className}`}>
      {title && (
        <div className="border-b-[3px] border-[#3a3a3a] bg-gradient-to-b from-[#7a1010] to-[#3a0000] py-1 text-center font-sans text-sm font-bold uppercase tracking-widest text-[#ffd700] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]">
          {title}
        </div>
      )}
      <div className="flex-1 overflow-hidden p-3 font-mono text-sm text-[#00ff00]">{children}</div>
    </div>
  );
}

function statValue(leader: LeaderRow, category: StatCategory): number {
  if (category === 'POINTS') return leader.pts ?? leader.value;
  if (category === 'ASSISTS') return leader.ast ?? leader.value;
  if (category === 'REBOUNDS') return leader.reb ?? leader.value;
  if (category === 'STEALS') return leader.stl ?? leader.value;
  return leader.blk ?? leader.value;
}

function excerpt(article: NewsItem, max = 220): string {
  const text = article.content || article.title;
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function confTeams(teams: NBATeam[], conf: StandingsConf): NBATeam[] {
  const prefix = conf.toLowerCase()[0];
  return teams
    .filter(t => t.conference?.toLowerCase().startsWith(prefix) || (conf === 'East' ? t.cid === 0 : t.cid === 1))
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || getTeamFullName(a).localeCompare(getTeamFullName(b)));
}

export default function TvNewsFeed({
  articles,
  lead,
  scores,
  leaders,
  standings,
  seasonYear,
  issueDate,
  leagueName,
  branding,
  onOpen,
}: TvNewsFeedProps) {
  const [standingsConf, setStandingsConf] = useState<StandingsConf>('East');
  const [statsCategory, setStatsCategory] = useState<StatCategory>('POINTS');

  useEffect(() => {
    const categories: StatCategory[] = ['POINTS', 'ASSISTS', 'REBOUNDS', 'STEALS', 'BLOCKS'];
    const interval = window.setInterval(() => {
      setStandingsConf(prev => (prev === 'East' ? 'West' : 'East'));
      setStatsCategory(prev => categories[(categories.indexOf(prev) + 1) % categories.length]);
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const newsStories = articles.filter(a => a.id !== lead.id);
  const isNba = branding.kind === 'nba';
  const activeConfTeams = isNba ? confTeams(standings, standingsConf) : standings.slice(0, 8);
  const categoryLeaders = [...leaders]
    .sort((a, b) => statValue(b, statsCategory) - statValue(a, statsCategory))
    .slice(0, 5);
  const tickerStories = [lead, ...newsStories].slice(0, 8);
  const programStories = newsStories.length > 1 ? newsStories.slice(0, 2) : [lead];

  return (
    <div className="relative flex min-h-full overflow-auto bg-[#111] p-4 font-mono select-none sm:p-8">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,#333_0%,#000_100%)] opacity-20" />

      <div className="relative z-10 m-auto flex h-[768px] w-[1024px] shrink-0 flex-col gap-4 overflow-hidden rounded-3xl border-[16px] border-[#1a1a1a] bg-gradient-to-b from-[#2a2a2a] to-[#0a0a0a] p-4 shadow-[0_0_50px_rgba(0,0,0,1)_inset,0_20px_50px_rgba(0,0,0,0.8)]">
        <div className="relative flex flex-1 flex-col gap-3 overflow-hidden rounded-xl border-4 border-[#333] bg-black p-3 shadow-[inset_0_0_30px_rgba(0,0,0,1)]">
          <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-15" />
          <div className="pointer-events-none absolute inset-0 z-50 rounded-xl shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]" />

          <div className="flex h-[10%] min-h-[60px] gap-3">
            <TvPanel className="flex w-1/5 items-center justify-center p-0">
              <div className="flex h-full flex-col items-center justify-center font-black italic leading-none tracking-tighter">
                <span className="text-4xl text-red-600 drop-shadow-[0_0_5px_rgba(255,0,0,0.8)]">{leagueName.toUpperCase()}</span>
                <span className="text-2xl text-blue-500 drop-shadow-[0_0_5px_rgba(0,0,255,0.8)]">TONIGHT</span>
              </div>
            </TvPanel>

            <TvPanel className="flex flex-1 flex-col items-center justify-center border-x-[3px] border-y-0 bg-[#050505]">
              <div className="text-2xl font-bold uppercase tracking-[0.2em] text-[#00ff00] drop-shadow-[0_0_5px_rgba(0,255,0,0.8)]">
                {branding.networkName.toUpperCase()}
              </div>
              <div className="mt-1 flex gap-4 text-sm tracking-widest text-[#00aa00]">
                <span>NEWS • SCORES • STANDINGS • HIGHLIGHTS</span>
              </div>
            </TvPanel>

            <TvPanel className="flex w-1/5 flex-col items-center justify-center text-[#ffd700]">
              <div className="text-3xl font-bold drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]">9:47 <span className="text-sm">PM ET</span></div>
              <div className="mt-1 text-sm uppercase tracking-widest text-[#aa8800]">{issueDate}</div>
            </TvPanel>
          </div>

          <div className="flex min-h-0 flex-1 gap-3">
            <TvPanel title="SCORES & RESULTS" className="w-[20%] overflow-y-auto">
              <div className="mb-2 border-b border-dashed border-[#00aa00] pb-1 text-center text-[#00aa00]">-- LATEST --</div>
              {scores.slice(0, 5).map(score => (
                <div key={score.id} className="mb-4">
                  <div className="flex justify-between text-[#00ff00]"><span>{score.away.toUpperCase()}</span><span>{score.awayScore}</span></div>
                  <div className="flex justify-between text-[#00ff00]"><span>{score.home.toUpperCase()}</span><span>{score.homeScore}</span></div>
                  <div className="mt-0.5 text-[10px] text-[#00aa00]">FINAL</div>
                </div>
              ))}
              {scores.length === 0 && <div className="text-center text-[#ffd700]">NO GAMES ON THE BOARD</div>}
            </TvPanel>

            <button type="button" onClick={() => onOpen(lead)} className="group relative flex-1 cursor-pointer overflow-hidden rounded-xl border-[4px] border-[#555] bg-black text-left shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              <div className="absolute inset-0 z-0">
                <img
                  src={lead.imageUrl || 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&w=800&q=80'}
                  alt=""
                  className="h-full w-full object-cover opacity-40 mix-blend-screen grayscale sepia"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
              </div>
              <div className="relative z-10 flex h-full w-2/3 flex-col justify-center p-6">
                <div className="mb-2 text-base font-bold uppercase tracking-widest text-[#ffd700] drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]">TOP STORY</div>
                <h2 className="mb-4 font-sans text-5xl font-black uppercase leading-none tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{lead.title}</h2>
                <div className="mb-4 font-sans text-base font-bold uppercase leading-tight text-[#ffd700]">{lead.category} - REPORT</div>
                <p className="line-clamp-4 font-sans text-sm leading-snug text-white opacity-90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{excerpt(lead)}</p>
                <span className="mt-4 w-max border-2 border-[#ffd700] bg-transparent px-4 py-2 text-xs font-bold uppercase text-[#ffd700] transition-colors group-hover:bg-[#ffd700] group-hover:text-black">
                  READ FULL STORY
                </span>
              </div>
            </button>

            <div className="flex w-[22%] flex-col gap-3">
              <TvPanel title={`TONIGHT ON ${leagueName.toUpperCase()} TV`} className="flex-1">
                <div className="space-y-3">
                  {programStories.map((article, index) => (
                    <div key={article.id}>
                      <div className="text-[10px] text-[#00aa00]">{index === 0 ? '8:00' : '8:30'} PM ET</div>
                      <button type="button" onClick={() => onOpen(article)} className={index === 0 ? 'text-[#ffd700]' : 'text-[#00ff00]'}>
                        {article.title.toUpperCase().slice(0, 22)}
                      </button>
                      <div className="text-[10px] text-[#00ff00]">{article.category.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </TvPanel>

              <TvPanel title={isNba ? `${standingsConf.toUpperCase()}ERN STANDINGS` : 'LEAGUE TABLE'} className="h-2/5">
                <table className="w-full text-left text-xs text-[#00ff00]">
                  <thead>
                    <tr className="border-b border-dashed border-[#00aa00] text-[#00aa00]">
                      <th className="pb-1 font-normal">TEAM</th>
                      <th className="pb-1 text-right font-normal">W</th>
                      <th className="pb-1 text-right font-normal">L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeConfTeams.slice(0, 5).map((team, index) => (
                      <tr key={team.id}>
                        <td className="py-0.5">{index + 1}. {(team.region || getTeamFullName(team)).toUpperCase()}</td>
                        <td className="text-right">{team.wins}</td>
                        <td className="text-right">{team.losses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TvPanel>
            </div>
          </div>

          <div className="flex h-[20%] min-h-[100px] gap-3">
            <TvPanel title="LEAGUE UPDATE" className="w-[22%]">
              <div className="mb-2 text-[11px] uppercase leading-tight text-[#ffd700]">{excerpt(newsStories[0] ?? lead, 140)}</div>
            </TvPanel>

            <TvPanel className="flex w-[25%] flex-col p-0">
              <div className="flex items-center gap-2 border-b-[3px] border-[#3a3a3a] bg-blue-900/30 p-1">
                <div className="flex h-6 w-6 items-center justify-center bg-white">
                  <div className="text-[8px] font-black leading-none text-blue-700">{leagueName.toUpperCase()}</div>
                </div>
                <div className="text-[11px] font-bold uppercase tracking-tighter text-[#00ff00]">{seasonYear} {statsCategory} LEADERS</div>
              </div>
              <div className="flex-1 p-2">
                {categoryLeaders.map((leader, index) => (
                  <div key={`${leader.name}-${index}`} className="mb-0.5 flex justify-between text-[11px]">
                    <span className="w-5 text-white">{index + 1}.</span>
                    <span className="flex-1 text-[#00ff00]">{leader.name.toUpperCase()}</span>
                    <span className="w-8 text-[#00aa00]">{leader.team ?? 'SIM'}</span>
                    <span className="w-8 text-right text-white">{statValue(leader, statsCategory).toFixed(statsCategory === 'POINTS' ? 0 : 1)}</span>
                  </div>
                ))}
                <div className="mt-1 text-center text-[9px] uppercase tracking-widest text-[#0077ff]">{statsCategory} PER GAME</div>
              </div>
            </TvPanel>

            <TvPanel title="AROUND THE LEAGUE" className="flex-1">
              <ul className="list-inside list-disc space-y-1.5 text-[11px] text-[#00ff00]">
                {tickerStories.slice(0, 5).map(article => (
                  <li key={article.id} className="cursor-pointer truncate uppercase hover:text-white" onClick={() => onOpen(article)}>
                    {article.title}
                  </li>
                ))}
              </ul>
            </TvPanel>

            <div className="relative flex w-[20%] flex-col items-center justify-center overflow-hidden rounded-sm border-[3px] border-[#3a3a3a] bg-[#000510]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#0055ff_0%,transparent_70%)] opacity-30" />
              <div className="z-10 -mb-2 font-serif text-xl italic text-[#99ccff] drop-shadow-[0_0_10px_#0055ff]">The</div>
              <div className="z-10 border-b-2 border-red-500 bg-gradient-to-b from-[#ff5555] to-[#aa0000] bg-clip-text font-sans text-5xl font-black italic tracking-tighter text-transparent drop-shadow-[0_0_15px_#ff0000]">{leagueName.toUpperCase()}</div>
              <div className="z-10 mt-1 font-serif text-xs italic text-[#99ccff] drop-shadow-[0_0_5px_#0055ff]">This Is Why We Play</div>
            </div>
          </div>

          <div className="mt-1 flex h-[5%] min-h-[30px] overflow-hidden rounded-sm border-[3px] border-[#3a3a3a] bg-black">
            <div className="relative z-10 flex shrink-0 items-center justify-center border-r-[3px] border-[#3a3a3a] bg-gradient-to-b from-[#8b0000] to-[#4a0000] px-3 text-sm font-bold uppercase tracking-widest text-white">
              <span className="mr-1 opacity-70">{leagueName.toUpperCase()}</span> NEWS TICKER
            </div>
            <div className="relative flex flex-1 items-center overflow-hidden bg-[#0a0a0a]">
              <div className="absolute left-full inline-block whitespace-nowrap text-sm font-bold uppercase text-[#ffd700] animate-[ticker_30s_linear_infinite]" style={{ paddingLeft: '100%' }}>
                {tickerStories.map(story => story.title.toUpperCase()).join(' • ')}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex h-[30px] items-center justify-between px-16 opacity-70">
          <div className="flex gap-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-6 w-2.5 rounded-full bg-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)]" />)}</div>
          <div className="flex items-center gap-4">
            <div className="h-0.5 w-12 bg-red-600 shadow-[0_1px_1px_rgba(255,255,255,0.3)]" />
            <div className="font-sans text-xs font-black uppercase tracking-[0.5em] text-[#888] shadow-[0_1px_0_rgba(255,255,255,0.2)]">{branding.displayName}</div>
            <div className="h-0.5 w-12 bg-blue-600 shadow-[0_1px_1px_rgba(255,255,255,0.3)]" />
          </div>
          <div className="flex gap-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-6 w-2.5 rounded-full bg-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)]" />)}</div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: '@keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }' }} />
    </div>
  );
}
