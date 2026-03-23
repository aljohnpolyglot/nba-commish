import React, { useState, useCallback, useMemo } from 'react';
import type { SocialPost, GameResult } from '../../types';
import SocialPostCard from './SocialPostCard';
import { generateSocialThread } from '../../services/llm/llm';
import { useGame } from '../../store/GameContext';
import { AnimatePresence } from 'motion/react';
import { SocialThreadModal } from './SocialThreadModal';
import { ImageModal } from './ImageModal';
import { useInView } from '../../hooks/useInView';
import { enrichPostWithPhoto, getResolvedUrl, type GamePhotoInfo } from '../../services/social/photoEnricher';

interface SocialFeedViewProps {
    posts: SocialPost[];
}

// ─── Build game lookup from boxScores + teams ─────────────────────────────────
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

// ─── Per-post lazy photo wrapper ──────────────────────────────────────────────
interface LazyPostProps {
    post: SocialPost;
    gameLookup: Map<number, GamePhotoInfo>;
    onClick: () => void;
    onImageClick: (url: string) => void;
}

const LazyPhotoPost: React.FC<LazyPostProps> = ({ post, gameLookup, onClick, onImageClick }) => {
    const { ref, inView } = useInView(0.05);
    const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | undefined>(() => {
        // Initialize from cache so image shows instantly on re-mount (navigation back)
        const cached = getResolvedUrl(post.id);
        if (cached) return cached;
        return post.mediaUrl ?? undefined;
    });

    React.useEffect(() => {
        if (!inView) return;
        if (resolvedMediaUrl) return; // already have one

        enrichPostWithPhoto(post, gameLookup).then(url => {
            if (url) setResolvedMediaUrl(url);
        });
    }, [inView]); // intentionally only trigger on inView change

    const enrichedPost: SocialPost = resolvedMediaUrl
        ? { ...post, mediaUrl: resolvedMediaUrl }
        : post;

    return (
        <div
            ref={ref}
            onClick={onClick}
            className="cursor-pointer transition-transform hover:scale-[1.01]"
        >
            <SocialPostCard post={enrichedPost} onImageClick={onImageClick} />
        </div>
    );
};

// ─── Main feed ────────────────────────────────────────────────────────────────
const SocialFeedView: React.FC<SocialFeedViewProps> = ({ posts }) => {
    const { state, dispatchAction } = useGame();
    const gameLookup = useGameLookup();

    const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
    const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
    const [isLoadingThread, setIsLoadingThread] = useState(false);
    const [batchCount, setBatchCount] = useState<Record<string, number>>({});

    // Keep selectedPost in sync when replies arrive from global state
    React.useEffect(() => {
        if (!selectedPost) return;
        const updated = posts.find(p => p.id === selectedPost.id);
        if (
            updated &&
            JSON.stringify(updated.replies) !== JSON.stringify(selectedPost.replies)
        ) {
            setSelectedPost(updated);
        }
    }, [posts, selectedPost]);

    const loadMoreReplies = useCallback(async (post: SocialPost) => {
        const currentBatch = batchCount[post.id] || 0;
        if (currentBatch >= 5) return;

        setIsLoadingThread(true);
        console.log('[SocialFeed] loadMoreReplies → generating thread for:', post.id, post.handle, post.content.slice(0, 60));

        try {
            const replies = await generateSocialThread(post, state);
            console.log('[SocialFeed] generateSocialThread returned:', replies?.length, 'replies');

            if (!replies || replies.length === 0) {
                console.warn('[SocialFeed] No replies returned from generateSocialThread');
                return;
            }

            const existingReplies = post.replies || [];
            const updatedReplies = [...existingReplies, ...replies];

            setSelectedPost(prev =>
                prev?.id === post.id ? { ...prev, replies: updatedReplies } : prev
            );
            setBatchCount(prev => ({ ...prev, [post.id]: currentBatch + 1 }));

            dispatchAction({
                type: 'SAVE_SOCIAL_THREAD',
                payload: { postId: post.id, replies: updatedReplies },
            });
        } catch (error) {
            console.error('[SocialFeed] generateSocialThread failed:', error);
        } finally {
            setIsLoadingThread(false);
        }
    }, [batchCount, state, dispatchAction]);

    const handlePostClick = useCallback(async (post: SocialPost) => {
        setSelectedPost(post);
        console.log('[SocialFeed] Post clicked:', post.id, '| existing replies:', post.replies?.length ?? 0);

        if (post.replies && post.replies.length > 0) {
            console.log('[SocialFeed] Already has replies, skipping fetch.');
            return;
        }
        await loadMoreReplies(post);
    }, [loadMoreReplies]);

    const handleReplyToReply = useCallback(async (
        parentPost: SocialPost,
        reply: SocialPost
    ) => {
        if (reply.replies && reply.replies.length > 0) return;

        setIsLoadingThread(true);
        console.log('[SocialFeed] handleReplyToReply → generating nested thread for:', reply.id, reply.content.slice(0, 60));

        try {
            const nestedReplies = await generateSocialThread(reply, state);
            console.log('[SocialFeed] nested replies returned:', nestedReplies?.length);

            if (!nestedReplies?.length) return;

            const updateNested = (arr: SocialPost[]): SocialPost[] =>
                arr.map(p => {
                    if (p.id === reply.id) return { ...p, replies: nestedReplies };
                    if (p.replies) return { ...p, replies: updateNested(p.replies) };
                    return p;
                });

            const updatedTopLevelReplies = updateNested(parentPost.replies || []);

            setSelectedPost(prev =>
                prev?.id === parentPost.id
                    ? { ...parentPost, replies: updatedTopLevelReplies }
                    : prev
            );

            dispatchAction({
                type: 'SAVE_SOCIAL_THREAD',
                payload: { postId: parentPost.id, replies: updatedTopLevelReplies },
            });
        } catch (error) {
            console.error('[SocialFeed] handleReplyToReply failed:', error);
        } finally {
            setIsLoadingThread(false);
        }
    }, [state, dispatchAction]);

    if (posts.length === 0) {
        return (
            <div className="text-center py-20">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mx-auto h-12 w-12 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <h3 className="mt-2 text-lg font-medium text-white">The Digital Sphere is Quiet</h3>
                <p className="mt-1 text-sm text-slate-400">
                    Make a decision to see how the world reacts.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 p-4 md:p-6">
            <h2 className="text-xl font-bold text-white mb-2">Social Feed</h2>

            {posts.map((post, index) => (
                <LazyPhotoPost
                    key={post.id || `post-${index}`}
                    post={post}
                    gameLookup={gameLookup}
                    onClick={() => handlePostClick(post)}
                    onImageClick={(url) => setModalImageUrl(url)}
                />
            ))}

            <AnimatePresence>
                {selectedPost && (
                    <SocialThreadModal
                        selectedPost={selectedPost}
                        setSelectedPost={setSelectedPost}
                        isLoadingThread={isLoadingThread}
                        batchCount={batchCount}
                        loadMoreReplies={loadMoreReplies}
                        handleReplyToReply={handleReplyToReply}
                    />
                )}
                <ImageModal
                    url={modalImageUrl}
                    onClose={() => setModalImageUrl(null)}
                />
            </AnimatePresence>
        </div>
    );
};

export default SocialFeedView;