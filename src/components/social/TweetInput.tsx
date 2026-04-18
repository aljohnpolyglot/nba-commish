import React, { useState } from 'react';
import { Image, X } from 'lucide-react';
import { useSocialGame } from '../../store/SocialGameContext';

export const TweetInput = () => {
const { state, addPost } = useSocialGame();
  const [content, setContent] = useState('');

  const handlePost = () => {
    if (!content.trim() && !image) return;

    const newPost = {
        source: 'TwitterX' as const,
      id: `post-${Date.now()}`,
      author: state.userProfile.name,
      handle: state.userProfile.handle,
      avatarUrl: state.userProfile.avatarUrl,
      date: new Date().toISOString(),
      content: content,
      mediaUrl: image || undefined,
      likes: 0,
      retweets: 0,
      // TODO: Claude code - Comment calculator based on likes/retweets algorithm with variance
      // e.g., replies = Math.floor((likes * 0.1) + (retweets * 0.2) + (Math.random() * 10))
      replies: [],
      replyCount: 0,
      isLiked: false,
      isRetweeted: false,
      isNew: true
    };

    addPost(newPost);
    setContent('');
    setImage('');
  };

  const [image, setImage] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="px-4 py-3 border-b border-[#2f3336] flex space-x-3">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-white font-bold overflow-hidden">
          {state.userProfile.avatarUrl ? (
            <img src={state.userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            state.userProfile.name[0]
          )}
        </div>
      </div>
      <div className="flex-1">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What is happening?!"
          className="w-full bg-transparent border-none text-white text-xl placeholder-zinc-500 focus:ring-0 resize-none min-h-[50px] outline-none"
        />

        {image && (
          <div className="mt-2 relative rounded-2xl overflow-hidden border border-zinc-800">
            <img src={image} alt="Preview" className="w-full h-auto max-h-[400px] object-cover" />
            <button 
              onClick={() => setImage('')}
              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center space-x-1 text-sky-500">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full hover:bg-sky-500/10 transition-colors"
            >
              <Image size={20} />
            </button>
          </div>
          <button 
            onClick={handlePost}
            disabled={!content.trim() && !image}
            className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-full transition-colors"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
};
