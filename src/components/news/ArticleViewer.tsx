import React, { useEffect, useState } from 'react';
import { X, Sparkles, Share2, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NewsItem } from './types';
import { generateContentWithRetry } from '../../services/llm/utils/api';
import Markdown from 'react-markdown';
import type { GameResult, NBATeam } from '../../types';

interface ArticleViewerProps {
  article: NewsItem | null;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  cachedContent: string | null;
  onCacheContent: (id: string, content: string) => void;
  boxScores?: GameResult[];
  teams?: NBATeam[];
}

function buildBoxScoreContext(item: NewsItem, boxScores: GameResult[], teams: NBATeam[]): string {
  if (!item.gameId && !item.homeTeamId) return '';
  const game = boxScores.find(g =>
    g.gameId === item.gameId ||
    (item.homeTeamId && item.awayTeamId && g.homeTeamId === item.homeTeamId && g.awayTeamId === item.awayTeamId)
  );
  if (!game) return '';
  const homeTeam = teams.find(t => t.id === game.homeTeamId);
  const awayTeam = teams.find(t => t.id === game.awayTeamId);
  if (!homeTeam || !awayTeam) return '';

  const allStats = [...game.homeStats, ...game.awayStats]
    .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))
    .slice(0, 8);

  const performers = allStats.map(s => {
    const teamName = game.homeStats.some(h => h.playerId === s.playerId) ? homeTeam.name : awayTeam.name;
    return `  - ${s.name} (${teamName}): ${s.pts} pts, ${s.reb} reb, ${s.ast} ast — GmSc ${s.gameScore?.toFixed(1) ?? '0.0'} (${Math.floor(s.min)} min)`;
  }).join('\n');

  const quarters = game.quarterScores
    ? `Q1: ${game.quarterScores.away[0]}–${game.quarterScores.home[0]}, Q2: ${game.quarterScores.away[1]}–${game.quarterScores.home[1]}, Q3: ${game.quarterScores.away[2]}–${game.quarterScores.home[2]}, Q4: ${game.quarterScores.away[3]}–${game.quarterScores.home[3]}${game.isOT ? ` OT×${game.otCount}` : ''}`
    : '';

  // Format notable highlights (posterizers, alley-oops, buzzer beaters, etc.)
  let highlightLines = '';
  if (game.highlights && game.highlights.length > 0) {
    const notable = game.highlights
      .filter(h => ['posterizer', 'alley_oop', 'limitless_3', 'ankle_breaker', 'fastbreak_dunk'].includes(h.type))
      .slice(0, 6);
    if (notable.length > 0) {
      const labelMap: Record<string, string> = {
        posterizer: 'POSTERIZER DUNK',
        alley_oop: 'ALLEY-OOP',
        limitless_3: 'LIMITLESS 3-POINTER',
        ankle_breaker: 'ANKLE BREAKER',
        fastbreak_dunk: 'FASTBREAK SLAM',
      };
      highlightLines = '\n  Notable Plays:\n' + notable.map(h => {
        const desc = labelMap[h.type] ?? h.type.replace(/_/g, ' ').toUpperCase();
        const assist = h.assisterName ? ` (assisted by ${h.assisterName})` : '';
        const victim = h.victimName ? ` on ${h.victimName}` : '';
        return `    - ${h.playerName}: ${desc}${victim}${assist}`;
      }).join('\n');
    }
  }

  if (game.gameWinner) {
    const gw = game.gameWinner;
    const shotDesc = gw.shotType === 'clutch_3' ? 'walk-off 3-pointer' : gw.shotType === 'clutch_ft' ? 'clutch free throw' : 'walk-off shot';
    highlightLines += `\n  Game Winner: ${gw.playerName} hit a ${shotDesc} (${gw.clockRemaining} remaining)`;
  }

  return `
GAME BOX SCORE — use these real stats to write a detailed, accurate article:
  Matchup: ${awayTeam.name} @ ${homeTeam.name}
  Final Score: ${awayTeam.name} ${game.awayScore} – ${homeTeam.name} ${game.homeScore}${game.isOT ? ` (OT)` : ''}
  ${quarters ? `Quarter Scores: ${quarters}` : ''}
  Top Performers:
${performers}${highlightLines}`;
}

export default function ArticleViewer({
  article,
  onClose,
  isBookmarked,
  onToggleBookmark,
  cachedContent,
  onCacheContent,
  boxScores = [],
  teams = [],
}: ArticleViewerProps) {
  const [elaboratedContent, setElaboratedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (article) {
      if (cachedContent) {
        setElaboratedContent(cachedContent);
      } else {
        elaborateNews(article);
      }
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    } else {
      setElaboratedContent('');
    }
  }, [article, cachedContent]);

  const elaborateNews = async (item: NewsItem) => {
    setIsLoading(true);
    try {
      const boxScoreContext = buildBoxScoreContext(item, boxScores, teams);
      const response = await generateContentWithRetry({
        model: 'gemini-2.5-flash-lite',
        contents: `You are an expert NBA sports journalist. Elaborate on the following news report into a detailed, engaging, and professional article. Include background context, analysis of how this impacts the team and league, and a "Scout's Take" section at the end.

Title: ${item.title}
Short Summary: ${item.content}
Category: ${item.category}
Date: ${item.date}
${boxScoreContext}

CRITICAL INSTRUCTIONS:
1. DO NOT include the title in your response.
2. DO NOT include "By: [Name]", "Category:", or "Date:".
3. Start directly with the article body.
4. If box score data is provided above, reference the REAL stats (exact numbers) — do not invent or change statistics.
5. If notable plays are listed, weave them into the narrative naturally.
6. Use Markdown for formatting (bolding, headers, lists).
7. Write 3-5 paragraphs in professional sports journalism style, followed by a ## Scout's Take section.`,
        config: {
          maxOutputTokens: 1024,
          temperature: 0.75,
        },
      });

      const content = response.text || item.content;
      setElaboratedContent(content);
      onCacheContent(item.id, content);
    } catch (error) {
      console.error('Error elaborating news:', error);
      setElaboratedContent(item.content || '');
    } finally {
      setIsLoading(false);
    }
  };

  if (!article) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              onClick={() => article && onToggleBookmark(article.id)}
              className={`p-2 backdrop-blur-md rounded-full transition-colors ${
                isBookmarked
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
            <button className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors">
              <Share2 size={20} />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div ref={scrollRef} className="overflow-y-auto no-scrollbar flex-grow">
            {/* Hero Image */}
            <div className="relative h-[300px] md:h-[450px] w-full">
              {article.imageUrl ? (
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                  <Sparkles size={64} className="text-indigo-500 opacity-20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
            </div>

            {/* Article Body */}
            <div className="px-6 md:px-12 pb-12 -mt-20 relative">
              <div className="bg-white p-6 md:p-10 rounded-xl shadow-lg border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded">
                    {article.category}
                  </span>
                  <span className="text-gray-400 text-xs font-medium">
                    {article.date}
                  </span>
                </div>

                <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight mb-8">
                  {article.title}
                </h1>

                <div className="flex items-center gap-4 mb-10 pb-8 border-b border-gray-100">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                    <img
                      src={article.author?.image_url || 'https://i.pravatar.cc/150?u=commish'}
                      alt={article.author?.name || 'Author'}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{article.author?.name || 'Commish Sim Reports'}</p>
                    <p className="text-xs text-gray-500">{article.author?.position?.replace(/\s*\[\d{4}\]/g, '').trim() || 'Lead Insider • Verified Source'}</p>
                  </div>
                </div>

                {/* AI Elaborated Content */}
                <div className="markdown-body">
                  {isLoading ? (
                    <div className="space-y-4 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-full"></div>
                      <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                      <div className="h-4 bg-gray-200 rounded w-full"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                      <div className="pt-8 space-y-4">
                        <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-200 rounded w-full"></div>
                        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-800 leading-relaxed font-serif text-lg [&_p]:mb-6 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-bold">
                      <Markdown>{elaboratedContent || article.content || `*${article.title}*\n\nNo additional details are available for this article.`}</Markdown>
                    </div>
                  )}
                </div>

                {/* Interaction Footer */}
                <div className="mt-12 pt-8 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => onToggleBookmark(article.id)}
                      className={`flex items-center gap-2 transition-colors ${
                        isBookmarked ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'
                      }`}
                    >
                      <Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'} />
                      <span className="text-sm font-bold">{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                    </button>
                    <button className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors">
                      <Share2 size={20} />
                      <span className="text-sm font-bold">Share</span>
                    </button>
                  </div>
                  <button
                    onClick={onClose}
                    className="px-6 py-2 bg-gray-900 text-white rounded-full font-bold text-sm hover:bg-indigo-600 transition-colors"
                  >
                    Close Article
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
