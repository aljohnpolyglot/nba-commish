import React, { useState } from 'react';
import { Image as ImageIcon, Heart, MessageCircle, Share } from 'lucide-react';

interface TweetInputProps {
  onTweet?: (content: string) => void;
  placeholder?: string;
}

export const TweetInput: React.FC<TweetInputProps> = ({
  onTweet,
  placeholder = "What's happening!",
}) => {
  const [content, setContent] = useState('');

  const handleTweet = () => {
    if (content.trim()) {
      onTweet?.(content);
      setContent('');
    }
  };

  return (
    <div className="border-b border-zinc-700 p-4 space-y-4">
      <div className="flex gap-4">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex-shrink-0"></div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent text-2xl text-white placeholder-zinc-500 outline-none resize-none"
            rows={3}
          />
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2 text-sky-500">
              <ImageIcon size={20} className="cursor-pointer hover:opacity-80" />
            </div>
            <button
              onClick={handleTweet}
              disabled={!content.trim()}
              className="bg-sky-500 text-white font-bold py-2 px-6 rounded-full hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};