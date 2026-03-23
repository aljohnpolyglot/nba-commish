import React, { useState, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { Newspaper, Clock, TrendingUp, Share2, Bookmark } from 'lucide-react';
import { motion } from 'motion/react';
import { useInView } from '../hooks/useInView';
import { enrichNewsWithPhoto, getResolvedUrl, type GamePhotoInfo } from '../services/social/photoEnricher';
import type { GameResult } from '../types';

// ─── Per-item lazy photo wrapper ──────────────────────────────────────────────

interface LazyNewsCardProps {
    item: { id: string; headline: string; content: string; date: string; image?: string; isNew?: boolean };
    gameLookup: Map<number, GamePhotoInfo>;
    index: number;
}

const LazyNewsCard: React.FC<LazyNewsCardProps> = ({ item, gameLookup, index }) => {
    const { ref, inView } = useInView(0.05);
    const [resolvedImage, setResolvedImage] = useState<string | undefined>(() => {
        const cached = getResolvedUrl(item.id);
        if (cached) return cached;
        return item.image;
    });

    React.useEffect(() => {
        if (!inView) return;
        if (resolvedImage) return; // already have one

        enrichNewsWithPhoto(item, gameLookup).then(url => {
            if (url) setResolvedImage(url);
        });
    }, [inView]); // only fire once on scroll into view

    return (
        <motion.div
            ref={ref}
            key={item.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.1, 0.5), duration: 0.5 }}
            className="bg-slate-900/40 border border-slate-800 rounded-[3rem] overflow-hidden flex flex-col lg:flex-row shadow-2xl hover:border-indigo-500/30 transition-all duration-500 group"
        >
            {resolvedImage && (
                <div className="lg:w-80 h-64 lg:h-auto bg-slate-800 flex-shrink-0 relative overflow-hidden">
                    <img
                        src={resolvedImage}
                        alt={item.headline}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
            )}

            {/* Placeholder shimmer while no image yet and item is in view */}
            {!resolvedImage && inView && (
                <div className="lg:w-80 h-64 lg:h-auto bg-slate-800/50 flex-shrink-0 animate-pulse" />
            )}

            <div className="p-10 flex-1 flex flex-col justify-center relative">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 bg-indigo-500/10 px-3 py-1.5 rounded-lg">
                            Breaking News
                        </span>
                        <div className="w-1 h-1 rounded-full bg-slate-700" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {item.date}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all">
                            <Bookmark size={16} />
                        </button>
                        <button className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all">
                            <Share2 size={16} />
                        </button>
                    </div>
                </div>

                <h3 className="text-3xl font-black text-white mb-6 leading-[1.1] tracking-tight group-hover:text-indigo-400 transition-colors duration-300">
                    {item.headline}
                </h3>
                <p className="text-slate-400 leading-relaxed text-lg font-medium italic">
                    "{item.content}"
                </p>

                <div className="mt-8 pt-8 border-t border-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                            High Impact Event
                        </span>
                    </div>
                    <button className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] hover:text-indigo-400 transition-colors">
                        Read Full Report →
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

// ─── Build game lookup (same pattern as SocialFeedView) ───────────────────────

function useGameLookup(): Map<number, GamePhotoInfo> {
    const { state } = useGame();

    return useMemo(() => {
        const lookup = new Map<number, GamePhotoInfo>();
        for (const bs of (state.boxScores || []) as GameResult[]) {
            if (!bs.gameId || bs.homeTeamId <= 0 || bs.awayTeamId <= 0) continue;
            const home = state.teams.find(t => t.id === bs.homeTeamId);
            const away = state.teams.find(t => t.id === bs.awayTeamId);
            if (!home || !away) continue;

            const topPlayers = [
                ...(bs.homeStats || []),
                ...(bs.awayStats || []),
            ]
                .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))
                .slice(0, 10)
                .map(s => ({ name: s.name, gameScore: s.gameScore ?? 0 }));

            lookup.set(bs.gameId, {
                homeTeam: home,
                awayTeam: away,
                topPlayers,
                date: bs.date || '',
            });
        }
        return lookup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.boxScores, state.teams]);
}

// ─── Main component ───────────────────────────────────────────────────────────

export const NewsFeed: React.FC = () => {
    const { state } = useGame();
    const gameLookup = useGameLookup();

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-300 overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <div className="p-10 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between backdrop-blur-md">
                <div className="flex flex-col">
                    <h2 className="text-3xl font-black text-white flex items-center gap-4 tracking-tighter uppercase">
                        <Newspaper className="text-indigo-500" size={32} />
                        League News
                    </h2>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">
                        Official NBA Press Terminal
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                        <Clock size={14} className="text-indigo-500" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Real-time Updates
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-10">
                    {state.news.map((item, index) => (
                        <LazyNewsCard
                            key={item.id || `news-${index}`}
                            item={item}
                            gameLookup={gameLookup}
                            index={index}
                        />
                    ))}
                </div>

                {state.news.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-96 text-slate-700 gap-8">
                        <div className="w-32 h-32 rounded-full bg-slate-900 flex items-center justify-center border-4 border-slate-800 opacity-20">
                            <Newspaper size={64} />
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-black uppercase tracking-tighter">
                                Silence in the Press Room
                            </p>
                            <p className="text-sm font-bold uppercase tracking-widest mt-2">
                                Awaiting the next major league development
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};