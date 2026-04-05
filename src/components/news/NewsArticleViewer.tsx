import React, { useEffect, useState } from 'react';
import { X, Sparkles, Share2, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NewsDisplayItem } from './NewsArticleCard';
import { generateContentWithRetry } from '../../services/llm/utils/api';
import { SettingsManager } from '../../services/SettingsManager';
import Markdown from 'react-markdown';

interface NewsArticleViewerProps {
  article: NewsDisplayItem | null;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  cachedContent: string | null;
  onCacheContent: (id: string, content: string) => void;
}

export const NewsArticleViewer: React.FC<NewsArticleViewerProps> = ({
  article, onClose, isBookmarked, onToggleBookmark, cachedContent, onCacheContent
}) => {
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
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } else {
      setElaboratedContent('');
    }
  }, [article?.id]);

  const elaborateNews = async (item: NewsDisplayItem) => {
    const settings = SettingsManager.getSettings();
    if (!settings.enableLLM) {
      setElaboratedContent(item.content);
      return;
    }

    setIsLoading(true);
    try {
      const prompt = `You are an expert sports journalist for a basketball simulation league. Elaborate on this news report into a full, engaging article. Include background context, impact analysis, and a "Analyst's Take" section.

Title: ${item.title}
Summary: ${item.content}
Category: ${item.category}
Date: ${item.date}

INSTRUCTIONS:
1. Do NOT repeat the title or include "By:" or "Date:" headers.
2. Start directly with the article body.
3. Use Markdown for formatting (bold, headers, bullet lists).
4. Write in professional sports journalism style, 400-600 words.
5. Reference specific details from the summary naturally.`;

      const response = await generateContentWithRetry({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: { maxOutputTokens: 1024, temperature: 0.7 },
      });

      let content = response.text || item.content;
      // Strip Together AI's { "response": "..." } JSON wrapper if present
      if (content.trimStart().startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          if (typeof parsed.response === 'string') content = parsed.response;
        } catch {}
      }
      setElaboratedContent(content);
      onCacheContent(item.id, content);
    } catch {
      setElaboratedContent(item.content);
    } finally {
      setIsLoading(false);
    }
  };

  if (!article) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Floating controls */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              onClick={() => article && onToggleBookmark(article.id)}
              className={`p-2 backdrop-blur-md rounded-full transition-colors ${isBookmarked ? 'bg-indigo-600 text-white' : 'bg-black/30 hover:bg-black/50 text-white'}`}
            >
              <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={onClose} className="p-2 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="overflow-y-auto flex-grow" style={{ scrollbarWidth: 'thin' }}>
            {/* Hero image */}
            <div className="relative h-[280px] md:h-[400px] w-full bg-gray-900">
              {article.imageUrl ? (
                <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover"
                  referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Sparkles size={64} className="text-indigo-500 opacity-20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
            </div>

            {/* Article body */}
            <div className="px-6 md:px-12 pb-12 -mt-16 relative">
              <div className="bg-white p-6 md:p-10 rounded-xl shadow-lg border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded">
                    {article.category}
                  </span>
                  <span className="text-gray-400 text-xs font-medium">{article.date}</span>
                </div>

                <h1 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight mb-8">{article.title}</h1>

                <div className="flex items-center gap-4 mb-10 pb-8 border-b border-gray-100">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                    <img
                      src={article.author?.image_url || 'https://i.pravatar.cc/150?u=commish'}
                      alt={article.author?.name || 'Author'}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{article.author?.name || 'Commish Sim Reports'}</p>
                    <p className="text-xs text-gray-500">{article.author?.position || 'Lead Insider · Verified Source'}</p>
                  </div>
                </div>

                <div className="text-gray-800 leading-relaxed font-serif text-base md:text-lg [&_p]:mb-5 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1 [&_strong]:font-bold">
                  {isLoading ? (
                    <div className="space-y-4 animate-pulse">
                      {[3/4, 1, 5/6, 1, 2/3].map((w, i) => (
                        <div key={i} className="h-4 bg-gray-200 rounded" style={{ width: `${w * 100}%` }} />
                      ))}
                    </div>
                  ) : (
                    <Markdown>{elaboratedContent || article.content}</Markdown>
                  )}
                </div>

                <div className="mt-10 pt-8 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => onToggleBookmark(article.id)}
                      className={`flex items-center gap-2 transition-colors ${isBookmarked ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
                    >
                      <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
                      <span className="text-sm font-bold">{isBookmarked ? 'Saved' : 'Save'}</span>
                    </button>
                    <button className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors">
                      <Share2 size={18} />
                      <span className="text-sm font-bold">Share</span>
                    </button>
                  </div>
                  <button onClick={onClose} className="px-5 py-2 bg-gray-900 text-white rounded-full font-bold text-sm hover:bg-indigo-600 transition-colors">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
