import React from 'react';
import { NewsItem } from './types';
import { motion } from 'motion/react';

interface ArticleCardProps {
  article: NewsItem;
  variant?: 'hero' | 'related' | 'latest' | 'sidebar' | 'bottom' | 'hero-bottom';
  onOpen?: (article: NewsItem) => void;
  isLoading?: boolean;
}

export default function ArticleCard({ article, variant = 'latest', onOpen, isLoading = false }: ArticleCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onOpen && !isLoading) {
      e.preventDefault();
      onOpen(article);
    }
  };

  if (isLoading) {
    return (
      <div className="group flex space-x-6 p-6 bg-white rounded-xl shadow-sm border border-gray-100 animate-pulse">
        <div className="w-32 h-20 md:w-64 md:h-40 flex-shrink-0 bg-gray-200 rounded-lg" />
        <div className="flex-grow flex flex-col justify-center space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-5/6" />
          </div>
          <div className="h-3 bg-gray-200 rounded w-1/4" />
        </div>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <motion.a
        href={article.url}
        onClick={handleClick}
        whileHover={{ y: -4 }}
        className="group block w-full overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 cursor-pointer"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
        <div className="p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
              {article.category}
            </span>
          </div>
          <h2 className="text-gray-900 text-3xl md:text-5xl font-black leading-tight mb-4 group-hover:text-[#0078ff] transition-colors">
            {article.title}
          </h2>
          <p className="text-gray-600 text-base md:text-xl line-clamp-2 mb-8 leading-relaxed">
            {article.content}
          </p>
          <div className="flex items-center justify-between pt-6 border-t border-gray-50">
            <span className="text-gray-400 text-xs md:text-sm font-medium uppercase tracking-widest">
              {article.date}
            </span>
          </div>
        </div>
      </motion.a>
    );
  }

  if (variant === 'related') {
    return (
      <a href={article.url} onClick={handleClick} className="group flex flex-col space-y-3 cursor-pointer p-4 bg-white rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
        <div className="aspect-[16/9] overflow-hidden rounded-lg bg-gray-100">
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-gray-900 font-bold text-base leading-snug group-hover:text-[#0078ff] transition-colors line-clamp-2">
            {article.title}
          </h3>
          <p className="text-gray-500 text-xs line-clamp-2 leading-relaxed">
            {article.content}
          </p>
          <span className="text-gray-400 text-[10px] font-medium uppercase tracking-wider block pt-1">
            {article.date}
          </span>
        </div>
      </a>
    );
  }

  if (variant === 'bottom') {
    return (
      <a href={article.url} onClick={handleClick} className="group block p-4 border-l-4 border-transparent hover:border-[#0078ff] hover:bg-gray-50 transition-all cursor-pointer">
        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 block mb-1">
          {article.category}
        </span>
        <h4 className="text-gray-900 font-bold text-base mb-2 group-hover:text-[#0078ff] transition-colors line-clamp-1">
          {article.title}
        </h4>
        <p className="text-gray-600 text-sm line-clamp-2 mb-2">
          {article.content}
        </p>
        <span className="text-gray-400 text-xs">{article.date}</span>
      </a>
    );
  }

  if (variant === 'hero-bottom') {
    return (
      <a
        href={article.url}
        onClick={handleClick}
        className="group block py-6 px-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer"
      >
        <h3 className="text-gray-900 font-bold text-[15px] leading-tight mb-2 group-hover:text-[#0078ff] transition-colors line-clamp-2">
          {article.title}
        </h3>
        <p className="text-gray-500 text-[12px] leading-snug line-clamp-2 mb-3">
          {article.content}
        </p>
        <span className="text-gray-400 text-[10px] font-medium uppercase tracking-widest">
          {article.date}
        </span>
      </a>
    );
  }

  if (variant === 'sidebar') {
    return (
      <a href={article.url} onClick={handleClick} className="group block py-6 border-b border-gray-100 last:border-0 cursor-pointer">
        <h4 className="text-gray-900 font-black text-sm group-hover:text-[#0078ff] transition-colors leading-tight uppercase mb-2 line-clamp-2">
          {article.title}
        </h4>
        <span className="text-gray-400 text-[11px] font-medium block">
          {article.date}
        </span>
      </a>
    );
  }

  // default: latest
  return (
    <a
      href={article.url}
      onClick={handleClick}
      className="group flex space-x-6 p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="w-32 h-20 md:w-64 md:h-40 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {article.imageUrl && (
          <img
            src={article.imageUrl}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
      <div className="flex-grow flex flex-col justify-center space-y-3">
        <h3 className="text-gray-900 font-black text-sm md:text-2xl leading-tight group-hover:text-[#0078ff] transition-colors line-clamp-2 uppercase tracking-tight">
          {article.title}
        </h3>
        <p className="text-gray-600 text-xs md:text-base line-clamp-2 leading-relaxed">
          {article.content}
        </p>
        <span className="text-gray-400 text-[10px] md:text-xs font-bold uppercase tracking-widest block">
          {article.date}
        </span>
      </div>
    </a>
  );
}
