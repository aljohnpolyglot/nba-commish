import React, { useEffect, useState } from 'react';
import { X, Share2, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NewsItem } from './types';
import { generateContentWithRetry } from '../../services/llm/utils/api';
import { SettingsManager } from '../../services/SettingsManager';
import Markdown from 'react-markdown';
import type { GameResult, NBATeam } from '../../types';
import type { NewsMediaEra } from '../../utils/mediaTimeline';
import type { NewsBranding } from './branding';

interface ArticleViewerProps {
  article: NewsItem | null;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  cachedContent: string | null;
  onCacheContent: (id: string, content: string) => void;
  boxScores?: GameResult[];
  teams?: NBATeam[];
  mediaEra?: NewsMediaEra;
  branding: NewsBranding;
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
    return `  - ${s.name} (${teamName}): ${s.pts} pts, ${s.reb} reb, ${s.ast} ast, ${s.stl} stl, ${s.blk} blk (${s.min} min)`;
  }).join('\n');

  const quarters = game.quarterScores
    ? `Q1: ${game.quarterScores.away[0]}–${game.quarterScores.home[0]}, Q2: ${game.quarterScores.away[1]}–${game.quarterScores.home[1]}, Q3: ${game.quarterScores.away[2]}–${game.quarterScores.home[2]}, Q4: ${game.quarterScores.away[3]}–${game.quarterScores.home[3]}${game.isOT ? ` OT×${game.otCount}` : ''}`
    : '';

  return `
GAME BOX SCORE (use these real stats to write a detailed, accurate article):
  Matchup: ${awayTeam.name} @ ${homeTeam.name}
  Final Score: ${awayTeam.name} ${game.awayScore} – ${homeTeam.name} ${game.homeScore}${game.isOT ? ` (OT)` : ''}
  ${quarters ? `Quarter Scores: ${quarters}` : ''}
  Top Performers:
${performers}`;
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSafeVideoEmbedUrl(value: string): boolean {
  try {
    const parsed = new URL(value, window.location.href);
    const host = parsed.hostname.replace(/^www\./, '');
    if ((host === 'youtube.com' || host === 'youtube-nocookie.com') && parsed.pathname.startsWith('/embed/')) return true;
    return false;
  } catch {
    return false;
  }
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function replaceTag(element: Element, tagName: string): void {
  const replacement = element.ownerDocument.createElement(tagName);
  while (element.firstChild) replacement.appendChild(element.firstChild);
  element.parentNode?.replaceChild(replacement, element);
}

function paragraphText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeRecapHeadings(body: HTMLElement): void {
  body.querySelectorAll('a').forEach(anchor => {
    if (/^next season$/i.test(paragraphText(anchor))) anchor.remove();
  });

  body.querySelectorAll('p').forEach(paragraph => {
    paragraph.innerHTML = paragraph.innerHTML
      .replace(/(&nbsp;|\s)*\|(&nbsp;|\s)*$/g, '')
      .replace(/^(&nbsp;|\s)*\|(&nbsp;|\s)*/g, '');
    const text = paragraphText(paragraph);
    if (!text) {
      paragraph.remove();
      return;
    }
    if (!text || text.length > 90 || /^(previous|next) season/i.test(text)) return;

    const strongText = Array.from(paragraph.querySelectorAll('strong,b'))
      .map(node => paragraphText(node))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hasLargeText = Array.from(paragraph.querySelectorAll('span'))
      .some(span => /font-size:\s*(18|20|24)pt/i.test(span.getAttribute('style') ?? ''));
    const isAllCaps = text === text.toUpperCase() && /[A-Z]/.test(text);
    if (hasLargeText || (isAllCaps && strongText && text.includes(strongText))) {
      replaceTag(paragraph, 'h2');
      return;
    }
    if (strongText === text) replaceTag(paragraph, 'h3');
  });
}

function sanitizeRecapHtml(html: string, heroImageUrl?: string): string {
  if (typeof window === 'undefined' || !html.trim()) return '';

  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,svg,object,embed,form,input,button,textarea,select').forEach(node => node.remove());
  document.querySelectorAll('iframe').forEach(frame => {
    const src = frame.getAttribute('src') ?? '';
    if (!isSafeVideoEmbedUrl(src)) {
      const link = document.createElement('a');
      link.textContent = frame.getAttribute('title') || 'Watch video';
      if (isSafeExternalUrl(src)) link.setAttribute('href', src);
      frame.replaceWith(link);
    }
  });

  const firstChild = document.body.firstElementChild;
  const firstImage = firstChild?.querySelector('img');
  if (
    firstChild?.tagName.toLowerCase() === 'p' &&
    firstImage &&
    !paragraphText(firstChild) &&
    (!heroImageUrl || firstImage.getAttribute('src') === heroImageUrl)
  ) {
    firstChild.remove();
  }

  normalizeRecapHeadings(document.body);

  const allowedTags = new Set(['a', 'b', 'blockquote', 'br', 'div', 'em', 'h1', 'h2', 'h3', 'hr', 'iframe', 'img', 'li', 'ol', 'p', 'strong', 'ul']);
  Array.from(document.body.querySelectorAll('*')).forEach(element => {
    const tag = element.tagName.toLowerCase();
    if (!allowedTags.has(tag)) {
      unwrapElement(element);
      return;
    }

    const href = element.getAttribute('href') ?? '';
    const src = element.getAttribute('src') ?? '';
    const alt = element.getAttribute('alt') ?? '';
    Array.from(element.attributes).forEach(attr => element.removeAttribute(attr.name));
    if (tag === 'a') {
      if (isSafeExternalUrl(href)) {
        element.setAttribute('href', new URL(href, window.location.href).href);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noreferrer');
      }
    }
    if (tag === 'img') {
      if (isSafeExternalUrl(src)) {
        element.setAttribute('src', new URL(src, window.location.href).href);
        element.setAttribute('alt', alt);
        element.setAttribute('loading', 'lazy');
        element.setAttribute('referrerpolicy', 'no-referrer');
      } else {
        element.remove();
      }
    }
    if (tag === 'iframe') {
      if (isSafeVideoEmbedUrl(src)) {
        element.setAttribute('src', new URL(src, window.location.href).href);
        element.setAttribute('title', alt || 'Video');
        element.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        element.setAttribute('allowfullscreen', '');
        element.setAttribute('loading', 'lazy');
      } else {
        element.remove();
      }
    }
  });

  return document.body.innerHTML;
}

type ArticleChrome = {
  container: string;
  card: string;
  topBar?: string;
  topBarLabel?: string;
  topBarClose?: string;
  control: string;
  bookmarkedControl: string;
  scroll: string;
  hero: string;
  image: string;
  gradient: string;
  bodyOffset: string;
  bodyCard: string;
  badge: string;
  date: string;
  title: string;
  authorWrap: string;
  authorName: string;
  authorRole: string;
  content: string;
  readMore: string;
  footer: string;
  closeButton: string;
};

function articleChromeForEra(mediaEra: NewsMediaEra, branding: NewsBranding): ArticleChrome {
  if (mediaEra === 'newspaper') {
    return {
      container: 'relative w-full max-w-4xl max-h-[calc(100vh-1rem)] bg-[#f4f1ea] shadow-2xl overflow-hidden flex flex-col border border-stone-500 font-serif',
      card: 'bg-[#f4f1ea]',
      control: 'p-1 border border-black bg-[#f4f1ea] text-black hover:bg-black hover:text-white transition-colors',
      bookmarkedControl: 'p-1 border border-black bg-black text-white transition-colors',
      scroll: 'overflow-y-auto flex-grow',
      hero: 'relative h-[230px] md:h-[360px] w-full border-b-4 border-black bg-stone-200',
      image: 'w-full h-full object-cover grayscale contrast-125',
      gradient: 'absolute inset-0 bg-gradient-to-t from-[#f4f1ea] via-[#f4f1ea]/20 to-transparent',
      bodyOffset: 'px-4 md:px-10 pb-10 -mt-10 relative',
      bodyCard: 'bg-[#f4f1ea] p-5 md:p-8 border-t-4 border-black',
      badge: 'text-[10px] font-black uppercase tracking-[0.28em] text-stone-600',
      date: 'text-stone-700 text-xs font-bold uppercase tracking-wider',
      title: 'text-3xl md:text-5xl font-black text-black leading-tight mb-6 text-center',
      authorWrap: 'flex items-center justify-center gap-4 mb-8 pb-5 border-b-2 border-black',
      authorName: 'text-sm font-black uppercase text-black',
      authorRole: 'text-xs text-stone-700',
      content: 'text-black leading-relaxed font-serif text-base md:text-lg text-justify [&_a]:font-bold [&_a]:text-black [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-black [&_blockquote]:pl-5 [&_h1]:mt-10 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-black [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:border-t-2 [&_h2]:border-black [&_h2]:pt-6 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:uppercase [&_h3]:mt-7 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-black [&_hr]:my-8 [&_hr]:border-black [&_iframe]:my-8 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:border [&_iframe]:border-black [&_img]:my-8 [&_img]:w-full [&_img]:border [&_img]:border-black [&_img]:grayscale [&_img]:contrast-125 [&_li]:mb-2 [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-5 [&_strong]:font-black [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6',
      readMore: 'mt-10 border-2 border-black bg-[#ede8dc] p-5',
      footer: 'mt-10 pt-6 border-t-2 border-black flex items-center justify-between',
      closeButton: 'px-5 py-2 border-2 border-black text-black font-black text-xs uppercase hover:bg-black hover:text-white transition-colors',
    };
  }

  if (mediaEra === 'tv') {
    return {
      container: 'relative w-full max-w-4xl max-h-[calc(100vh-1rem)] bg-black rounded-xl shadow-[0_0_50px_rgba(0,0,0,1)] overflow-hidden flex flex-col border-4 border-[#333] font-mono text-[#00ff00]',
      card: 'bg-black',
      topBar: 'bg-gradient-to-b from-[#7a1010] to-[#3a0000] text-[#ffd700] flex justify-between items-center px-4 py-2 font-bold text-sm border-b-4 border-[#333] uppercase tracking-widest',
      topBarLabel: `${branding.wordmark} REPORT`,
      topBarClose: '[CLOSE]',
      control: 'p-2 bg-black/70 border border-[#444] text-[#ffd700] hover:text-white transition-colors',
      bookmarkedControl: 'p-2 bg-[#ffd700] border border-[#ffd700] text-black transition-colors',
      scroll: 'overflow-y-auto flex-grow bg-[#050505]',
      hero: 'relative h-[230px] md:h-[360px] w-full border-b-4 border-[#333] bg-black',
      image: 'w-full h-full object-cover grayscale sepia opacity-80',
      gradient: 'absolute inset-0 bg-gradient-to-t from-[#050505] via-black/40 to-transparent',
      bodyOffset: 'px-4 md:px-8 pb-10 -mt-12 relative',
      bodyCard: 'bg-[#050505] p-5 md:p-8 border-2 border-[#333] rounded-lg',
      badge: 'px-3 py-1 border border-[#ffd700] text-[#ffd700] text-[10px] font-black uppercase tracking-widest',
      date: 'text-[#00aa00] text-xs font-bold uppercase',
      title: 'text-3xl md:text-5xl font-black text-white leading-tight mb-6 uppercase drop-shadow-[0_0_8px_rgba(255,255,255,0.35)]',
      authorWrap: 'flex items-center gap-4 mb-8 pb-5 border-b-2 border-dashed border-[#00aa00]',
      authorName: 'text-sm font-bold text-[#0077ff] uppercase',
      authorRole: 'text-xs text-[#00aa00] uppercase',
      content: 'text-white leading-relaxed font-mono text-sm md:text-base [&_a]:font-bold [&_a]:text-[#ffd700] [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-[#333] [&_blockquote]:pl-5 [&_h1]:mt-10 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-black [&_h1]:uppercase [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:border-t-2 [&_h2]:border-[#333] [&_h2]:pt-6 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:text-[#ffd700] [&_h3]:mt-7 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-black [&_h3]:uppercase [&_h3]:text-[#00ff00] [&_hr]:my-8 [&_hr]:border-[#333] [&_iframe]:my-8 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:rounded-lg [&_iframe]:border-2 [&_iframe]:border-[#444] [&_img]:my-8 [&_img]:w-full [&_img]:rounded [&_img]:grayscale [&_img]:sepia [&_img]:opacity-80 [&_li]:mb-2 [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-5 [&_strong]:font-black [&_strong]:text-[#ffd700] [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6',
      readMore: 'mt-10 border-2 border-[#333] bg-[#0a0a0a] p-5',
      footer: 'mt-10 pt-6 border-t-2 border-[#333] flex items-center justify-between',
      closeButton: 'px-5 py-2 border-2 border-[#00ff00] text-[#00ff00] font-black text-xs uppercase hover:bg-[#00ff00] hover:text-black transition-colors',
    };
  }

  if (mediaEra === 'earlyInternet') {
    return {
      container: 'relative w-full max-w-3xl max-h-[calc(100vh-1rem)] bg-[#c0c0c0] overflow-hidden flex flex-col border-t-2 border-l-2 border-t-white border-l-white border-r-2 border-b-2 border-r-gray-800 border-b-gray-800 font-sans text-black',
      card: 'bg-[#c0c0c0]',
      topBar: 'bg-[#000080] text-white flex justify-between items-center px-2 py-1 font-bold text-sm border-b border-gray-400',
      topBarLabel: `${branding.wordmark}.com`,
      topBarClose: 'X',
      control: 'bg-[#c0c0c0] text-black border-t-2 border-l-2 border-t-white border-l-white border-r-2 border-b-2 border-r-gray-800 border-b-gray-800 p-1',
      bookmarkedControl: 'bg-[#000080] text-white border-t-2 border-l-2 border-t-white border-l-white border-r-2 border-b-2 border-r-gray-800 border-b-gray-800 p-1',
      scroll: 'overflow-y-auto flex-grow bg-white border-2 border-gray-500 m-[2px]',
      hero: 'relative w-full bg-white border-b border-black',
      image: 'w-full h-auto max-h-[300px] object-cover',
      gradient: 'hidden',
      bodyOffset: 'p-4 relative',
      bodyCard: 'bg-white',
      badge: 'text-xs font-bold uppercase text-black',
      date: 'text-black text-xs font-bold uppercase',
      title: 'text-xl md:text-2xl font-bold font-serif text-black mb-3 border-b-2 border-black pb-2',
      authorWrap: 'flex items-center gap-3 mb-5 pb-3 border-b border-gray-400',
      authorName: 'text-xs font-bold text-[#000080]',
      authorRole: 'text-xs text-gray-700',
      content: 'text-black leading-relaxed font-serif text-sm [&_a]:text-[#000080] [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-500 [&_blockquote]:pl-3 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:uppercase [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_hr]:my-6 [&_hr]:border-black [&_iframe]:my-5 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:border [&_iframe]:border-black [&_img]:my-5 [&_img]:w-full [&_img]:border [&_img]:border-black [&_li]:mb-1 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-4 [&_strong]:font-bold [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5',
      readMore: 'mt-8 border-2 border-gray-500 bg-[#d4d0c8] p-3',
      footer: 'mt-8 pt-4 border-t-2 border-black flex items-center justify-between',
      closeButton: 'bg-[#c0c0c0] text-black border-t-2 border-l-2 border-t-white border-l-white border-r-2 border-b-2 border-r-gray-800 border-b-gray-800 px-4 py-1 font-bold text-xs',
    };
  }

  if (mediaEra === 'web2') {
    return {
      container: 'relative w-full max-w-4xl max-h-[calc(100vh-1rem)] bg-white shadow-2xl overflow-hidden flex flex-col font-sans',
      card: 'bg-white',
      topBar: 'bg-[linear-gradient(to_bottom,#005c9e_0%,#003767_100%)] h-12 flex justify-between items-center px-4 border-b border-[#002b52]',
      topBarLabel: `${branding.wordmark}.com | News`,
      topBarClose: 'Close ✕',
      control: 'p-2 bg-[#005c9e] text-white hover:bg-[#003767] transition-colors',
      bookmarkedControl: 'p-2 bg-[#f6c343] text-[#003767] transition-colors',
      scroll: 'overflow-y-auto flex-grow bg-white',
      hero: 'relative w-full bg-white',
      image: 'w-full h-auto max-h-[420px] object-cover',
      gradient: 'hidden',
      bodyOffset: 'p-6 sm:p-10 relative',
      bodyCard: 'mx-auto max-w-[700px] bg-white',
      badge: 'text-[11px] text-gray-500 font-bold uppercase tracking-wider',
      date: 'text-gray-500 text-[11px] font-bold uppercase tracking-wider',
      title: 'text-3xl sm:text-4xl font-bold text-[#333] leading-tight mb-4 font-serif',
      authorWrap: 'flex items-center gap-4 mb-6 pb-4 border-y border-gray-200 py-3',
      authorName: 'text-sm font-bold text-[#333]',
      authorRole: 'text-xs text-gray-500',
      content: 'text-[#444] leading-relaxed text-[15px] [&_a]:font-bold [&_a]:text-[#005c9e] [&_a]:underline [&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-200 [&_blockquote]:pl-4 [&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-bold [&_hr]:my-7 [&_hr]:border-gray-200 [&_iframe]:my-7 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:border-0 [&_img]:my-7 [&_img]:w-full [&_li]:mb-1 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-5 [&_strong]:font-bold [&_strong]:text-[#333] [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6',
      readMore: 'mt-8 border border-gray-200 bg-[#f5f5f5] p-4',
      footer: 'mt-8 pt-4 border-t border-gray-200 flex items-center justify-between',
      closeButton: 'px-5 py-2 bg-[#005c9e] text-white font-bold text-sm hover:bg-[#003767] transition-colors',
    };
  }

  return {
    container: 'relative w-full max-w-4xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col',
    card: 'bg-white',
    control: 'p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors',
    bookmarkedControl: 'p-2 bg-indigo-600 text-white backdrop-blur-md rounded-full transition-colors',
    scroll: 'overflow-y-auto no-scrollbar flex-grow',
    hero: 'relative h-[300px] md:h-[450px] w-full',
    image: 'w-full h-full object-cover',
    gradient: 'absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent',
    bodyOffset: 'px-6 md:px-12 pb-12 -mt-20 relative',
    bodyCard: 'bg-white p-6 md:p-10 rounded-xl shadow-lg border border-gray-100',
    badge: 'px-3 py-1 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded',
    date: 'text-gray-400 text-xs font-medium',
    title: 'text-3xl md:text-5xl font-black text-gray-900 leading-tight mb-8',
    authorWrap: 'flex items-center gap-4 mb-10 pb-8 border-b border-gray-100',
    authorName: 'text-sm font-bold text-gray-900',
    authorRole: 'text-xs text-gray-500',
    content: 'text-gray-800 leading-relaxed font-serif text-base md:text-lg [&_a]:font-semibold [&_a]:text-indigo-700 [&_a]:underline [&_a]:decoration-indigo-200 [&_a:hover]:text-indigo-900 [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-200 [&_blockquote]:pl-5 [&_blockquote]:text-gray-600 [&_h1]:mt-12 [&_h1]:mb-5 [&_h1]:font-sans [&_h1]:text-3xl [&_h1]:font-black [&_h1]:tracking-tight [&_h2]:mt-12 [&_h2]:mb-5 [&_h2]:border-t [&_h2]:border-gray-200 [&_h2]:pt-8 [&_h2]:font-sans [&_h2]:text-2xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-tight [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-sans [&_h3]:text-xl [&_h3]:font-black [&_h3]:tracking-tight [&_hr]:my-10 [&_hr]:border-gray-200 [&_iframe]:my-8 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:rounded-xl [&_iframe]:border-0 [&_iframe]:bg-black [&_img]:my-8 [&_img]:w-full [&_img]:rounded-xl [&_img]:object-cover [&_li]:mb-2 [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-6 [&_strong]:font-bold [&_strong]:text-gray-950 [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6',
    readMore: 'mt-10 rounded-xl border border-gray-100 bg-gray-50 p-5',
    footer: 'mt-12 pt-8 border-t border-gray-100 flex items-center justify-between',
    closeButton: 'px-6 py-2 bg-gray-900 text-white rounded-full font-bold text-sm hover:bg-indigo-600 transition-colors',
  };
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
  mediaEra = 'modern',
  branding,
}: ArticleViewerProps) {
  const [elaboratedContent, setElaboratedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const showImage = Boolean(article?.imageUrl && article.imageUrl !== failedImageUrl);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const chrome = articleChromeForEra(mediaEra, branding);
  const sanitizedHtml = React.useMemo(
    () => article?.htmlContent ? sanitizeRecapHtml(article.htmlContent, article.imageUrl) : '',
    [article?.htmlContent, article?.imageUrl]
  );

  useEffect(() => {
    if (article) {
      if (article.htmlContent || article.skipAiExpansion) {
        setElaboratedContent(article.content);
        setIsLoading(false);
      } else if (cachedContent) {
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
    const settings = SettingsManager.getSettings();
    if (!settings.enableLLM) {
      setElaboratedContent(item.content);
      return;
    }

    const boxScoreContext = buildBoxScoreContext(item, boxScores, teams);

    setIsLoading(true);
    try {
      const response = await generateContentWithRetry({
        model: 'gemini-2.5-flash-lite',
        contents: `You are an expert sports journalist. Elaborate on the following ${branding.displayName} news report to provide a detailed, engaging, and professional article. Include background context, potential impact on the competition, and a "Scout's Take" section.

Title: ${item.title}
Short Summary: ${item.content}
Category: ${item.category}
Date: ${item.date}
${boxScoreContext}

CRITICAL INSTRUCTIONS:
1. DO NOT include the title in your response.
2. DO NOT include "By: [Name]", "Category:", or "Date:".
3. Start directly with the article body.
4. If box score data is provided above, reference the REAL stats (exact numbers) in your article — do not invent statistics.
5. Use Markdown for formatting (bolding, headers, lists).
6. Format the output with clear headings and professional sports journalism style.`,
        config: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
      });

      const content = response.text || 'Failed to generate content.';
      setElaboratedContent(content);
      onCacheContent(item.id, content);
    } catch (error) {
      console.error('Error elaborating news:', error);
      setElaboratedContent(item.content);
    } finally {
      setIsLoading(false);
    }
  };

  if (!article) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 md:p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={chrome.container}
        >
          {mediaEra === 'tv' && (
            <>
              <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-15" />
              <div className="pointer-events-none absolute inset-0 z-50 rounded-xl shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]" />
            </>
          )}

          {chrome.topBar ? (
            <div className={`${chrome.topBar} relative z-20 shrink-0`}>
              <div className="min-w-0 truncate pr-4">{chrome.topBarLabel}: {article.title}</div>
              <button onClick={onClose} className="shrink-0 cursor-pointer font-bold">
                {chrome.topBarClose}
              </button>
            </div>
          ) : (
            <div className={showImage
              ? 'absolute top-4 right-4 z-20 flex items-center gap-2'
              : `relative z-20 flex shrink-0 items-center justify-end gap-2 p-4 ${mediaEra === 'modern' ? 'bg-gray-900' : ''}`}>
              <button
                onClick={() => article && onToggleBookmark(article.id)}
                className={isBookmarked ? chrome.bookmarkedControl : chrome.control}
              >
                <Bookmark size={20} fill={isBookmarked ? "currentColor" : "none"} />
              </button>
              <button className={chrome.control}>
                <Share2 size={20} />
              </button>
              <button onClick={onClose} className={chrome.control}>
                <X size={20} />
              </button>
            </div>
          )}

          <div ref={scrollRef} className={chrome.scroll}>
            {showImage && <div className={chrome.hero}>
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className={chrome.image}
                  referrerPolicy="no-referrer"
                  onError={() => setFailedImageUrl(article.imageUrl)}
                />
              <div className={chrome.gradient} />
              {article.photoCredit && (
                <span className="absolute bottom-2 right-3 z-10 rounded bg-black/60 px-2 py-1 text-[10px] text-white/90">
                  {article.photoCredit}
                </span>
              )}
            </div>}

            <div className={chrome.bodyOffset} style={showImage ? undefined : { marginTop: 0 }}>
              <div className={chrome.bodyCard}>
                <div className="flex items-center gap-3 mb-6">
                  <span className={chrome.badge}>
                    {article.category}
                  </span>
                  <span className={chrome.date}>
                    {article.date}
                  </span>
                  {chrome.topBar && (
                    <span className="ml-auto flex items-center gap-2">
                      <button onClick={() => onToggleBookmark(article.id)} className={isBookmarked ? chrome.bookmarkedControl : chrome.control}>
                        <Bookmark size={16} fill={isBookmarked ? "currentColor" : "none"} />
                      </button>
                      <button className={chrome.control}>
                        <Share2 size={16} />
                      </button>
                    </span>
                  )}
                </div>

                <h1 className={chrome.title}>
                  {article.title}
                </h1>

                <div className={chrome.authorWrap}>
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                    <img
                      src={article.author?.image_url || "https://i.pravatar.cc/150?u=commish"}
                      alt={article.author?.name || "Author"}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div>
                    <p className={chrome.authorName}>{article.author?.name || "Commish Sim Reports"}</p>
                    <p className={chrome.authorRole}>{article.author?.position?.replace(/\s*\[\d{4}\]/g, '').trim() || "Lead Insider • Verified Source"}</p>
                  </div>
                </div>

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
                    <div className={chrome.content}>
                      {sanitizedHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                      ) : (
                        <Markdown>{elaboratedContent || article.content || `*${article.title}*\n\nNo additional details are available for this article at this time.`}</Markdown>
                      )}
                    </div>
                  )}
                </div>

                {(article.sourceUrl || (article.readMoreLinks?.length ?? 0) > 0) && (
                  <div className={chrome.readMore}>
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Read more</h2>
                    <div className="mt-4 grid gap-3">
                      {article.sourceUrl && (
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-bold text-indigo-700 hover:text-indigo-900 hover:underline"
                        >
                          Full season recap
                        </a>
                      )}
                      {(article.readMoreLinks ?? []).map(link => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-gray-700 hover:text-indigo-700 hover:underline"
                        >
                          {link.text}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className={chrome.footer}>
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => onToggleBookmark(article.id)}
                      className={`flex items-center gap-2 transition-colors ${
                        isBookmarked ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'
                      }`}
                    >
                      <Bookmark size={20} fill={isBookmarked ? "currentColor" : "none"} />
                      <span className="text-sm font-bold">{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                    </button>
                    <button className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors">
                      <Share2 size={20} />
                      <span className="text-sm font-bold">Share</span>
                    </button>
                  </div>
                  <button
                    onClick={onClose}
                    className={chrome.closeButton}
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
