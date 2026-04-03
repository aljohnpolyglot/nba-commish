import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import SocialPostCard from './SocialPostCard';
import { generateSocialThread } from '../../services/llm/llm';
import { SettingsManager } from '../../services/SettingsManager';

interface ThreadViewProps {
  postId?: string;
  onBack?: () => void;
  onProfileClick?: (handle: string) => void;
  onPostClick?: (postId: string) => void;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ postId, onBack, onProfileClick, onPostClick }) => {
  const { state, dispatchAction } = useGame();
  const [isLoading, setIsLoading] = useState(false);

  const post = (state.socialFeed || []).find(p => p.id === postId);
  const replies = post?.replies || [];
  const llmEnabled = SettingsManager.getSettings().enableLLM;

  const fetchReplies = useCallback(async (p: typeof post) => {
    if (!p || !llmEnabled || p.replies?.length) return;
    setIsLoading(true);
    try {
      const generated = await generateSocialThread(p, state);
      if (!generated?.length) return;
      dispatchAction({
        type: 'SAVE_SOCIAL_THREAD',
        payload: { postId: p.id, replies: generated },
      });
    } catch (e) {
      console.error('[ThreadView] generateSocialThread failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [llmEnabled, state, dispatchAction]);

  useEffect(() => {
    if (post) fetchReplies(post);
  }, [postId]); // only re-fetch when navigating to a different post

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md px-4 py-3 flex items-center space-x-6 border-b border-[#2f3336]">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-white">Post</h2>
      </div>

      {!post ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-zinc-500">Post not found.</p>
        </div>
      ) : (
        <>
          {/* Root post — larger, non-clickable */}
          <SocialPostCard
            post={post}
            onClick={() => {}}
            onProfileClick={(h) => onProfileClick?.(h || post.handle)}
          />

          {/* Replies or loading */}
          <div className="border-t border-[#2f3336]">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={24} className="animate-spin text-sky-500" />
              </div>
            ) : replies.length > 0 ? (
              replies.map(reply => (
                <SocialPostCard
                  key={reply.id}
                  post={reply}
                  onClick={() => onPostClick?.(reply.id)}
                  onProfileClick={(h) => onProfileClick?.(h || reply.handle)}
                />
              ))
            ) : (
              <div className="flex flex-col items-center py-16 px-8 text-center">
                <p className="text-zinc-500 text-sm">
                  {llmEnabled ? 'No replies generated.' : 'Enable LLM in settings to generate replies.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
