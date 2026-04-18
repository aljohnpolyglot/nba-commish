import React from 'react';
import { ArrowLeft, MessageCircle, Repeat2, Heart, Share, MoreHorizontal } from 'lucide-react';
import { useSocialGame } from '../../store/SocialGameContext';
import { SocialPost } from '../../types';
import SocialPostCard from './SocialPostCard';
import { formatTwitterDate } from '../../utils/socialhelpers';
import { cn } from '../../lib/utils';

interface ThreadViewProps {
  postId: string;
  onBack: () => void;
  onProfileClick: (handle: string) => void;
  onPostClick: (postId: string) => void;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ postId, onBack, onProfileClick, onPostClick }) => {
const { state, toggleLike, toggleRetweet } = useSocialGame();
  
  const post = state.socialFeed.find(p => p.id === postId);
  const cachedProfile = state.cachedProfiles?.[post?.handle?.replace('@', '') ?? ''];
  if (!post) {
    return (
      <div className="p-4 text-center text-zinc-500">
        Post not found
        <button onClick={onBack} className="block mx-auto mt-4 text-sky-500 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const replies = React.useMemo(() => 
    state.socialFeed.filter(p => p.replyToId === postId),
    [state.socialFeed, postId]
  );

  const [replyContent, setReplyContent] = React.useState('');
  const [showReplyBox, setShowReplyBox] = React.useState(false);
const { addReply, generateReplies, isGeneratingReplies } = useSocialGame();

  React.useEffect(() => {
    if (post && replies.length === 0) {
      // Don't block render — fire and forget
      setTimeout(() => generateReplies(post.id), 0);
    }
  }, [post?.id]); // intentionally minimal deps so it only fires once

  const handleReply = () => {
    if (!replyContent.trim()) return;

    const newReply: SocialPost = {
      id: `reply-${Date.now()}`,
      author: state.userProfile.name,
      handle: state.userProfile.handle,
      avatarUrl: state.userProfile.avatarUrl,
      content: replyContent,
      date: 'Just now',
      likes: 0,
      retweets: 0,
      replies: [],
      source: 'TwitterX',
      replyToId: post.id,
      isLiked: false,
      isRetweeted: false,
    };

    addReply(post.id, newReply);
    setReplyContent('');
    setShowReplyBox(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-black">
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md px-4 py-3 flex items-center space-x-8 border-b border-[#2f3336]">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold">Post</h2>
      </div>

      <div className="px-4 py-3 border-b border-[#2f3336]">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden cursor-pointer" onClick={() => onProfileClick(post.handle)}>
            {(cachedProfile?.avatarUrl || post.avatarUrl) ? (
              <img src={cachedProfile?.avatarUrl || post.avatarUrl!} alt={post.author} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl">
                {post.author?.[0] || '?'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div onClick={() => onProfileClick(post.handle)} className="cursor-pointer">
                <p className="font-bold text-white text-[15px] hover:underline">{cachedProfile?.name || post.author}</p>
                <p className="text-zinc-500 text-[15px]">{post.handle}</p>
              </div>
              <button className="text-zinc-500 hover:text-sky-500 p-1.5 rounded-full hover:bg-sky-500/10 transition-colors">
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>
        </div>

        <p className="text-[17px] text-white leading-normal mt-4 whitespace-pre-wrap">{post.content}</p>

        {post.mediaUrl && post.mediaUrl !== post.avatarUrl && (
          <div className="mt-3 rounded-2xl overflow-hidden border border-[#2f3336]">
            <img
              src={post.mediaUrl}
              alt=""
              className="w-full object-cover max-h-[512px]"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <div className="py-4 border-b border-[#2f3336] mt-4 flex items-center space-x-4 text-[15px]">
          <p className="text-zinc-500">
            <span className="text-white">{formatTwitterDate(post.date, state.date)}</span>
          </p>
          <p className="text-zinc-500">
            <span className="text-white">{post.likes + post.retweets}</span> <span className="text-zinc-500">Views</span>
          </p>
        </div>

        <div className="py-4 border-b border-[#2f3336] flex items-center space-x-6 text-[15px]">
          <p className="text-zinc-500">
            <span className="text-white">{post.retweets}</span> <span className="text-zinc-500">Retweets</span>
          </p>
          <p className="text-zinc-500">
            <span className="text-white">{post.likes}</span> <span className="text-zinc-500">Likes</span>
          </p>
        </div>

        <div className="flex items-center justify-around py-2 text-zinc-500 border-b border-[#2f3336]">
          <button 
            onClick={() => setShowReplyBox(true)}
            className="p-2 rounded-full hover:bg-sky-500/10 hover:text-sky-500 transition-colors"
          >
            <MessageCircle size={22} />
          </button>
          <button 
            onClick={() => toggleRetweet(post.id)}
            className={cn("p-2 rounded-full hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors", post.isRetweeted && "text-emerald-500")}
          >
            <Repeat2 size={22} className={cn(post.isRetweeted && "fill-current")} />
          </button>
          <button 
            onClick={() => toggleLike(post.id)}
            className={cn("p-2 rounded-full hover:bg-rose-500/10 hover:text-rose-500 transition-colors", post.isLiked && "text-rose-500")}
          >
            <Heart size={22} className={cn(post.isLiked && "fill-current")} />
          </button>
          <button className="p-2 rounded-full hover:bg-sky-500/10 hover:text-sky-500 transition-colors">
            <Share size={22} />
          </button>
        </div>

        {showReplyBox && (
          <div className="mt-4 flex space-x-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden">
                {state.userProfile.avatarUrl ? (
                  <img src={state.userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold">
                    {state.userProfile.name[0]}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Post your reply"
                autoFocus
                className="w-full bg-transparent border-none text-white text-lg placeholder-zinc-500 focus:ring-0 resize-none min-h-[40px] outline-none"
              />
              <div className="flex justify-end mt-2">
                <button 
                  onClick={handleReply}
                  disabled={!replyContent.trim()}
                  className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-full transition-colors"
                >
                  Reply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        {isGeneratingReplies[post.id] ? (
          <>
            {[1, 2, 3].map(i => (
              <div key={i} className="px-4 py-3 border-b border-[#2f3336] animate-pulse">
                <div className="flex space-x-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-800 flex-shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="flex space-x-2">
                      <div className="h-3.5 bg-zinc-800 rounded w-24" />
                      <div className="h-3.5 bg-zinc-800 rounded w-16" />
                    </div>
                    <div className="h-3.5 bg-zinc-800 rounded w-full" />
                    <div className="h-3.5 bg-zinc-800 rounded w-4/5" />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          replies.map(reply => (
            <SocialPostCard 
              key={reply.id} 
              post={reply} 
              onClick={() => onPostClick(reply.id)} 
              onProfileClick={(handle) => onProfileClick(handle || reply.handle)}
            />
          ))
        )}
      </div>
    </div>
  );
};
