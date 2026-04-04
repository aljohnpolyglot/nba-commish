import React from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import SocialPostCard from './SocialPostCard';

interface ThreadViewProps {
  postId?: string;
  onBack?: () => void;
  onProfileClick?: (handle: string) => void;
  onPostClick?: (postId: string) => void;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ postId, onBack, onProfileClick, onPostClick }) => {
  const { state, toggleLike, toggleRetweet, addReply, generateReplies, isGeneratingReplies } = useGame();
  const [replyContent, setReplyContent] = React.useState('');

  const post = React.useMemo(
    () => (state.socialFeed || []).find(p => p.id === postId),
    [state.socialFeed, postId]
  );

  const replies = React.useMemo(
    () => (state.socialFeed || []).filter(p => p.replyToId === postId),
    [state.socialFeed, postId]
  );

  const isLoading = postId ? (isGeneratingReplies[postId] ?? false) : false;

  React.useEffect(() => {
    if (post && replies.length === 0 && !isLoading) {
      setTimeout(() => generateReplies(post.id), 0);
    }
  }, [post?.id]);

  const handleReply = () => {
    if (!replyContent.trim() || !post) return;
    const userProfile = state.userProfile;
    const commName = state.commissionerName || 'Commissioner';
    const name = userProfile?.name || commName;
    const handle = userProfile?.handle || ('@' + commName.toLowerCase().replace(/\s+/g, ''));

    const reply = {
      id: `reply-${Date.now()}`,
      author: name,
      handle,
      avatarUrl: userProfile?.avatarUrl,
      date: new Date().toISOString(),
      content: replyContent,
      source: 'TwitterX' as const,
      likes: 0,
      retweets: 0,
      replies: [],
      replyCount: 0,
      replyToId: post.id,
      isLiked: false,
      isRetweeted: false,
      isNew: true,
    };
    addReply(post.id, reply);
    setReplyContent('');
  };

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
          {/* Parent post if this is a reply */}
          {post.replyToId && (() => {
            const parent = (state.socialFeed || []).find(p => p.id === post.replyToId);
            return parent ? (
              <div className="opacity-70 border-b border-[#2f3336]">
                <SocialPostCard
                  post={parent}
                  onClick={() => onPostClick?.(parent.id)}
                  onProfileClick={(h) => onProfileClick?.(h || parent.handle)}
                />
              </div>
            ) : (
              <div className="px-4 py-2 text-zinc-500 text-sm border-b border-[#2f3336]">
                Replying to @{post.replyToId}
              </div>
            );
          })()}

          {/* Root post */}
          <SocialPostCard
            post={post}
            onClick={() => {}}
            onProfileClick={(h) => onProfileClick?.(h || post.handle)}
          />

          {/* Inline reply compose */}
          <div className="border-t border-[#2f3336] px-4 py-3 flex gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex-shrink-0 overflow-hidden">
              {state.userProfile?.avatarUrl ? (
                <img src={state.userProfile.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-bold">
                  {(state.userProfile?.name || state.commissionerName || 'C')[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <textarea
                value={replyContent}
                onChange={e => setReplyContent(e.target.value)}
                placeholder="Post your reply"
                className="w-full bg-transparent text-white placeholder-zinc-500 outline-none resize-none text-base"
                rows={2}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleReply}
                  disabled={!replyContent.trim()}
                  className="bg-sky-500 text-white font-bold py-1.5 px-5 rounded-full hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Reply
                </button>
              </div>
            </div>
          </div>

          {/* Replies */}
          <div className="border-t border-[#2f3336]">
            {isLoading ? (
              <div className="space-y-0">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 p-4 border-b border-[#2f3336] animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-zinc-800 rounded w-1/3" />
                      <div className="h-3 bg-zinc-800 rounded w-2/3" />
                      <div className="h-3 bg-zinc-800 rounded w-1/2" />
                    </div>
                  </div>
                ))}
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
                <p className="text-zinc-500 text-sm">No replies yet.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ThreadView;
