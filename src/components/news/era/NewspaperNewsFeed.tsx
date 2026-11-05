import React from 'react';
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

interface NewspaperNewsFeedProps {
  articles: NewsItem[];
  lead: NewsItem;
  secondary: NewsItem[];
  scores: ScoreRow[];
  standings: NBATeam[];
  seasonYear: number;
  date: string;
  leagueName: string;
  branding: NewsBranding;
  onOpen: (article: NewsItem) => void;
}

function longDate(value: string, seasonYear: number): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || String(seasonYear);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function issueNumber(value: string): number {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 1;
  return Math.max(1, Math.floor((d.getTime() - new Date('1851-09-18').getTime()) / 86400000));
}

function toRoman(value: number): string {
  const map: Array<[string, number]> = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
  let rest = value;
  let out = '';
  for (const [letter, amount] of map) {
    while (rest >= amount) {
      out += letter;
      rest -= amount;
    }
  }
  return out || 'I';
}

function excerpt(article: NewsItem, max = 360): string {
  const text = article.content || article.title;
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function StoryBrief({ article, onOpen }: { article: NewsItem; onOpen: (article: NewsItem) => void }) {
  return (
    <li className="border-b border-dashed border-gray-400 pb-4 last:border-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">{article.category || 'General'}</span>
      <button
        type="button"
        onClick={() => onOpen(article)}
        className="cursor-pointer text-left text-sm font-bold leading-snug hover:underline"
      >
        {article.title}
      </button>
    </li>
  );
}

export default function NewspaperNewsFeed({
  articles,
  lead,
  secondary,
  scores,
  standings,
  seasonYear,
  date,
  leagueName,
  branding,
  onOpen,
}: NewspaperNewsFeedProps) {
  const sortedArticles = [lead, ...secondary, ...articles.filter(a => a.id !== lead.id && !secondary.some(s => s.id === a.id))];
  const subLeadStories = sortedArticles.slice(1, 4);
  const columnStories = sortedArticles.slice(4, 8);
  const briefStories = sortedArticles.slice(8, 18);
  const issue = issueNumber(date);
  const volume = toRoman(Math.floor(issue / 365) + 1);
  const paperDate = longDate(date, seasonYear);

  return (
    <div className="min-h-full bg-[#f4f1ea] px-4 py-8 font-serif text-[#1a1a1a] selection:bg-black selection:text-white sm:px-8">
      <div className="mx-auto max-w-6xl border border-gray-300 bg-[#fdfbf7] p-6 shadow-2xl sm:p-10">
        <header className="mb-6 border-b-4 border-double border-black pb-6 text-center">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.35em]" style={{ color: branding.kind === 'nba' ? undefined : branding.accent }}>{leagueName} Season {seasonYear}</div>
          <h1 className="mb-2 text-5xl font-black uppercase tracking-tighter md:text-8xl" style={{ fontFamily: 'Georgia, serif' }}>
            The Daily Chronicle
          </h1>
          <div className="flex flex-col items-center justify-between border-y-2 border-black py-2 text-xs font-bold uppercase tracking-widest md:flex-row md:text-sm">
            <span>Vol. {volume}... No. {issue.toLocaleString()}</span>
            <span>{paperDate}</span>
            <span>Two Cents</span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-3 lg:border-r lg:border-gray-300 lg:pr-8">
            {subLeadStories.map((article, index) => (
              <div key={article.id} className={index !== subLeadStories.length - 1 ? 'border-b border-gray-300 pb-6' : ''}>
                <button
                  type="button"
                  onClick={() => onOpen(article)}
                  className="mb-2 cursor-pointer text-left text-xl font-bold leading-tight hover:underline"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  {article.title}
                </button>
                <p className="text-justify text-sm leading-relaxed text-gray-800">{excerpt(article, 210)}</p>
                <span className="mt-2 block text-xs font-bold uppercase tracking-wider text-gray-500">By Special Telegraph</span>
              </div>
            ))}

            <div className="border-2 border-black bg-[#f0ebd8] p-4 text-center">
              <h4 className="mb-2 border-b border-black pb-2 text-xl font-black uppercase tracking-widest">Scores</h4>
              {scores.slice(0, 3).map(score => (
                <div key={score.id} className="border-b border-black/30 py-2 text-xs last:border-b-0">
                  <div className="flex justify-between gap-2"><span>{score.away}</span><b>{score.awayScore}</b></div>
                  <div className="flex justify-between gap-2"><span>{score.home}</span><b>{score.homeScore}</b></div>
                </div>
              ))}
              {scores.length === 0 && <p className="text-sm italic">No games were contested before press time.</p>}
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-6 lg:border-r lg:border-gray-300 lg:pr-8">
            <article>
              <button
                type="button"
                onClick={() => onOpen(lead)}
                className="mb-4 cursor-pointer text-center text-4xl font-black leading-none hover:underline md:text-5xl"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                {lead.title}
              </button>
              {lead.imageUrl && (
                <div className="mb-4 border border-black p-1">
                  <img src={lead.imageUrl} alt={lead.title} className="h-auto w-full grayscale sepia-[.3] contrast-125" referrerPolicy="no-referrer" />
                  <p className="mt-1 text-center text-xs italic text-gray-600">Captured exclusively for The Chronicle</p>
                </div>
              )}
              <div className="columns-1 gap-6 text-justify text-base leading-relaxed sm:columns-2">
                <p className="first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:text-6xl first-letter:font-black">
                  {excerpt(lead, 720)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpen(lead)}
                className="mt-4 cursor-pointer border-b border-black pb-0.5 text-xs font-bold uppercase tracking-widest hover:text-gray-600"
              >
                Continue Reading on Page 2
              </button>
            </article>

            <div className="mt-4 grid grid-cols-1 gap-6 border-t-2 border-black pt-6 sm:grid-cols-2">
              {columnStories.slice(0, 4).map(article => (
                <div key={article.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(article)}
                    className="mb-2 cursor-pointer text-left text-lg font-bold leading-tight hover:underline"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {article.title}
                  </button>
                  <p className="line-clamp-4 text-justify text-xs leading-relaxed text-gray-800">{excerpt(article, 190)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-3">
            <div className="border-2 border-black bg-[#f0ebd8] p-4 text-center">
              <h4 className="mb-2 border-b border-black pb-2 text-xl font-black uppercase tracking-widest">Notice</h4>
              <p className="mb-2 text-sm italic">Readers are advised that recent events across the league are moving swiftly.</p>
              <p className="text-xs font-bold uppercase">- Management</p>
            </div>

            <div>
              <h4 className="mb-4 border-b-2 border-black pb-1 text-lg font-black uppercase">News in Brief</h4>
              <ul className="space-y-4">
                {(briefStories.length ? briefStories : sortedArticles.slice(1, 7)).map(article => <StoryBrief key={article.id} article={article} onOpen={onOpen} />)}
              </ul>
            </div>

            <div>
              <h4 className="mb-3 border-b-2 border-black pb-1 text-lg font-black uppercase">League Table</h4>
              {standings.slice(0, 8).map((team, index) => (
                <div key={team.id} className="flex justify-between border-b border-dashed border-gray-400 py-1 text-xs">
                  <span>{index + 1}. {getTeamFullName(team)}</span>
                  <b>{team.wins}-{team.losses}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
