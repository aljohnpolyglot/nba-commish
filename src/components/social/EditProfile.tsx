import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useGame } from '../../store/GameContext';

interface EditProfileProps {
  onClose: () => void;
}

const EditProfile: React.FC<EditProfileProps> = ({ onClose }) => {
  const { state, dispatchAction } = useGame();
  const commName = state.commissionerName || 'Commissioner';
  const current = state.userProfile ?? {
    name: commName,
    handle: '@' + commName.toLowerCase().replace(/\s+/g, ''),
    bio: '',
    location: '',
    website: '',
  };

  const [name, setName] = useState(current.name || commName);
  const [bio, setBio] = useState(current.bio || '');
  const [location, setLocation] = useState(current.location || '');
  const [website, setWebsite] = useState(current.website || '');

  const handleSave = () => {
    dispatchAction({
      type: 'UPDATE_USER_PROFILE' as any,
      payload: { name, bio, location, website },
    } as any);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-10 px-4">
      <div className="bg-black border border-[#2f3336] rounded-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3336]">
          <div className="flex items-center gap-6">
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
              <X size={20} className="text-white" />
            </button>
            <h2 className="text-xl font-bold text-white">Edit profile</h2>
          </div>
          <button
            onClick={handleSave}
            className="bg-white text-black font-bold text-sm px-4 py-1.5 rounded-full hover:bg-zinc-200 transition-colors"
          >
            Save
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          <div className="border border-[#2f3336] rounded-lg px-3 pt-2 pb-2 focus-within:border-sky-500 transition-colors">
            <label className="text-xs text-zinc-500">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={50}
              className="w-full bg-transparent text-white outline-none text-[15px] mt-0.5"
            />
          </div>
          <div className="border border-[#2f3336] rounded-lg px-3 pt-2 pb-2 focus-within:border-sky-500 transition-colors">
            <label className="text-xs text-zinc-500">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={160}
              rows={3}
              className="w-full bg-transparent text-white outline-none text-[15px] mt-0.5 resize-none"
            />
          </div>
          <div className="border border-[#2f3336] rounded-lg px-3 pt-2 pb-2 focus-within:border-sky-500 transition-colors">
            <label className="text-xs text-zinc-500">Location</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              maxLength={30}
              className="w-full bg-transparent text-white outline-none text-[15px] mt-0.5"
            />
          </div>
          <div className="border border-[#2f3336] rounded-lg px-3 pt-2 pb-2 focus-within:border-sky-500 transition-colors">
            <label className="text-xs text-zinc-500">Website</label>
            <input
              value={website}
              onChange={e => setWebsite(e.target.value)}
              maxLength={100}
              className="w-full bg-transparent text-white outline-none text-[15px] mt-0.5"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfile;
