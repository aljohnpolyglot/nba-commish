import React, { useState } from 'react';
import type { SocialPost } from '../../types';
import SocialPostCard from './SocialPostCard';
import { generateSocialThread } from '../../services/llm/llm';
import { useGame } from '../../store/GameContext';
import { AnimatePresence } from 'motion/react';
import { SocialThreadModal } from './SocialThreadModal';

interface SocialFeedViewProps {
  posts: SocialPost[];
}

const SocialFeedView: React.FC<SocialFeedViewProps> = ({ posts }) => {
  const { state, dispatchAction } = useGame();
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [batchCount, setBatchCount] = useState<Record<string, number>>({});

  // Sync selectedPost with global state when posts update
  React.useEffect(() => {
    if (selectedPost) {
        const updated = posts.find(p => p.id === selectedPost.id);
        if (updated && JSON.stringify(updated.replies) !== JSON.stringify(selectedPost.replies)) {
            setSelectedPost(updated);
        }
    }
  }, [posts, selectedPost]);

  const handlePostClick = async (post: SocialPost) => {
    setSelectedPost(post);
    
    if (post.replies && post.replies.length > 0) {
        return; // Already generated
    }

    await loadMoreReplies(post);
  };

  const loadMoreReplies = async (post: SocialPost) => {
    const currentBatch = batchCount[post.id] || 0;
    if (currentBatch >= 5) return;

    setIsLoadingThread(true);
    try {
        const replies = await generateSocialThread(post, state);
        const existingReplies = post.replies || [];
        const updatedReplies = [...existingReplies, ...replies];
        
        // Update local state
        setSelectedPost(prev => {
            if (prev?.id === post.id) {
                return { ...prev, replies: updatedReplies };
            }
            return prev;
        });
        
        setBatchCount(prev => ({ ...prev, [post.id]: currentBatch + 1 }));

        // Dispatch to save globally
        dispatchAction({
            type: 'SAVE_SOCIAL_THREAD',
            payload: {
                postId: post.id,
                replies: updatedReplies
            }
        });
    } catch (error) {
        console.error("Failed to load thread", error);
    } finally {
        setIsLoadingThread(false);
    }
  };

  const handleReplyToReply = async (parentPost: SocialPost, reply: SocialPost) => {
    if (reply.replies && reply.replies.length > 0) return;

    setIsLoadingThread(true);
    try {
        const nestedReplies = await generateSocialThread(reply, state);
        
        const updateNested = (posts: SocialPost[]): SocialPost[] => {
            return posts.map(p => {
                if (p.id === reply.id) return { ...p, replies: nestedReplies };
                if (p.replies) return { ...p, replies: updateNested(p.replies) };
                return p;
            });
        };

        const updatedTopLevelReplies = updateNested(parentPost.replies || []);
        
        if (selectedPost?.id === parentPost.id) {
            setSelectedPost({ ...parentPost, replies: updatedTopLevelReplies });
        }

        dispatchAction({
            type: 'SAVE_SOCIAL_THREAD',
            payload: {
                postId: parentPost.id,
                replies: updatedTopLevelReplies
            }
        });
    } catch (error) {
        console.error("Failed to generate nested reply", error);
    } finally {
        setIsLoadingThread(false);
    }
  };

  if (posts.length === 0) {
    return (
      <div className="text-center py-20">
         <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
         </svg>
        <h3 className="mt-2 text-lg font-medium text-white">The Digital Sphere is Quiet</h3>
        <p className="mt-1 text-sm text-slate-400">Make a decision to see how the world reacts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h2 className="text-xl font-bold text-white mb-2">Social Feed</h2>
      {posts.map((post, index) => (
        <div key={post.id || `post-${index}`} onClick={() => handlePostClick(post)} className="cursor-pointer transition-transform hover:scale-[1.01]">
            <SocialPostCard post={post} />
        </div>
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
      </AnimatePresence>
    </div>
  );
};

export default SocialFeedView;

