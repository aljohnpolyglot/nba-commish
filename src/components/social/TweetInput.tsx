import React, { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { SocialPost } from '../../types';

export const TweetInput = () => {
  const { state, addPost } = useGame();
  const [content, setContent] = useState('');
  const [image, setImage] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const userProfile = state.userProfile;
  const commName = state.commissionerName || 'Commissioner';
  const name = userProfile?.name || commName;
  const handle = userProfile?.handle || ('@' + commName.toLowerCase().replace(/\s+/g, ''));
  const avatarUrl = userProfile?.avatarUrl;

  const handlePost = () => {
    if (!content.trim() && !image) return;
    const newPost: SocialPost = {
      id: `post-${Date.now()}`,
      author: name,
      handle,
      avatarUrl,
      date: new Date().toISOString(),
      content,
      source: 'TwitterX' as const,
      mediaUrl: image || undefined,
      likes: 0,
      retweets: 0,
      replies: [],
      replyCount: 0,
      isLiked: false,
      isRetweeted: false,
      isNew: true,
    };
    addPost(newPost);
    setContent('');
    setImage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="border-b border-zinc-700 p-4 space-y-4">
      <div className="flex gap-4">
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex-shrink-0 overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
              {name[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening!"
            className="w-full bg-transparent text-xl text-white placeholder-zinc-500 outline-none resize-none"
            rows={3}
          />
          {image && (
            <div className="relative mt-2 rounded-xl overflow-hidden">
              <img src={image} alt="upload preview" className="max-h-60 rounded-xl object-cover w-full" />
              <button
                onClick={() => setImage('')}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-black/80"
              >
                <X size={16} className="text-white" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2 text-sky-500">
              <button onClick={() => fileInputRef.current?.click()}>
                <ImageIcon size={20} className="cursor-pointer hover:opacity-80" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <button
              onClick={handlePost}
              disabled={!content.trim() && !image}
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

export default TweetInput;
