import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface ProfileViewProps {
  handle?: string;
  onBack?: () => void;
  onPostClick?: (postId: string) => void;
  onProfileClick?: (handle: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ handle, onBack, onPostClick, onProfileClick }) => {
  return (
    <div className="flex-1 flex flex-col border-l border-zinc-700">
      <div className="flex items-center gap-4 p-4 border-b border-zinc-700 sticky top-0 bg-black/80 backdrop-blur">
        <button onClick={onBack} className="hover:bg-white/10 rounded-full p-2 transition-colors">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">{handle}</h2>
          <p className="text-sm text-zinc-500">Profile</p>
        </div>
      </div>
      <div className="flex-1 p-4 text-zinc-500">
        {/* Profile content placeholder */}
        Profile view for {handle}
      </div>
    </div>
  );
};