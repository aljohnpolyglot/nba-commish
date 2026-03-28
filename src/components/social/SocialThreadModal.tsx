import React from 'react';
import { motion } from 'motion/react';
import { X, MessageCircle, RefreshCw } from 'lucide-react';
import type { SocialPost } from '../../types';
import SocialPostCard from './SocialPostCard';

interface SocialThreadModalProps {
  selectedPost: SocialPost;
  setSelectedPost: (post: SocialPost | null) => void;
  isLoadingThread: boolean;
  batchCount: Record<string, number>;
  loadMoreReplies: (post: SocialPost) => Promise<void>;
  handleReplyToReply: (parentPost: SocialPost, reply: SocialPost) => Promise<void>;
  llmEnabled?: boolean;
}

export const SocialThreadModal: React.FC<SocialThreadModalProps> = ({
  selectedPost,
  setSelectedPost,
  isLoadingThread,
  batchCount,
  loadMoreReplies,
  handleReplyToReply,
  llmEnabled = true,
}) => {
  return (
    <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
        onClick={() => setSelectedPost(null)}
    >
        <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <MessageCircle size={20} className="text-indigo-500" />
                    Thread
                </h3>
                <button onClick={() => setSelectedPost(null)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                <div className="pointer-events-none">
                    <SocialPostCard post={selectedPost} />
                </div>
                
                <div className="pl-8 border-l-2 border-slate-800 space-y-6">
                    {selectedPost.replies?.map((reply, idx) => (
                        <div key={reply.id || `reply-${idx}-${reply.handle}`} className="space-y-4">
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {reply.avatarUrl ? (
                                            <img src={reply.avatarUrl} alt={reply.author} className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                                        ) : reply.playerPortraitUrl ? (
                                            <img src={reply.playerPortraitUrl} alt={reply.author} className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                                        ) : null}
                                        <span className="text-sm font-bold text-white">{reply.author}</span>
                                        <span className="text-xs text-slate-500">{reply.handle}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Just now</span>
                                </div>
                                <p className="text-slate-300 text-sm">{reply.content}</p>
                                <div className="mt-3 flex items-center gap-4 text-slate-500 text-xs font-bold">
                                    <span>{reply.likes} Likes</span>
                                    <span>{reply.retweets} Reposts</span>
                                    <button 
                                        onClick={() => handleReplyToReply(selectedPost, reply)}
                                        className="text-indigo-500 hover:text-indigo-400 transition-colors"
                                    >
                                        Reply
                                    </button>
                                </div>
                            </div>
                            
                            {/* Nested Replies */}
                            {reply.replies && reply.replies.length > 0 && (
                                <div className="pl-6 border-l border-slate-800 space-y-4">
                                    {reply.replies.map((nested, nIdx) => (
                                        <div key={nested.id || `nested-${nIdx}-${nested.handle}`} className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold text-white">{nested.author}</span>
                                                <span className="text-[10px] text-slate-500">{nested.handle}</span>
                                            </div>
                                            <p className="text-slate-400 text-xs">{nested.content}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {isLoadingThread ? (
                        <div className="flex items-center gap-3 text-slate-500 py-4">
                            <RefreshCw size={16} className="animate-spin" />
                            <span className="text-xs font-bold uppercase tracking-widest">Generating...</span>
                        </div>
                    ) : !llmEnabled ? (
                        <p className="text-center text-xs text-slate-600 py-4 border-t border-slate-800/50 mt-4">
                            Enable AI in settings to load more replies
                        </p>
                    ) : (
                        (batchCount[selectedPost.id] || 0) < 5 && (
                            <button
                                onClick={() => loadMoreReplies(selectedPost)}
                                className="w-full py-4 text-xs font-black text-slate-500 uppercase tracking-[0.2em] hover:text-indigo-500 transition-colors border-t border-slate-800/50 mt-4"
                            >
                                Load More Replies
                            </button>
                        )
                    )}
                </div>
            </div>
        </motion.div>
    </motion.div>
  );
};
