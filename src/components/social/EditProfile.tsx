import React, { useState } from 'react';
import { X, Camera } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { UserProfile } from '../../types';

interface EditProfileProps {
  initialData: UserProfile;
  onClose: () => void;
  onSave: (data: UserProfile) => void;
}

export const EditProfile: React.FC<EditProfileProps> = ({ initialData, onClose, onSave }) => {
  const { updateProfile } = useGame();
  const [formData, setFormData] = useState(initialData);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile(formData);
    onSave(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'avatar') {
          setFormData({ ...formData, avatarUrl: reader.result as string });
        } else {
          setFormData({ ...formData, bannerUrl: reader.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#5b7083]/40 backdrop-blur-sm p-4">
      <div className="bg-black w-full max-w-[600px] rounded-2xl overflow-hidden flex flex-col max-h-[90vh] relative z-[101]">
        <div className="px-4 py-3 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md z-[110]">
          <div className="flex items-center space-x-8">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold">Edit profile</h2>
          </div>
          <button
            onClick={handleSubmit}
            className="bg-white text-black font-bold px-4 py-1.5 rounded-full hover:bg-zinc-200 transition-colors"
          >
            Save
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="h-[200px] bg-zinc-800 relative group cursor-pointer overflow-hidden z-[102]">
            {formData.bannerUrl ? (
              <img src={formData.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
            ) : null}
            <label className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-[103] cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, 'banner')}
              />
              <div className="p-3 rounded-full bg-black/40 backdrop-blur-sm">
                <Camera size={24} className="text-white" />
              </div>
            </label>
            <div className="absolute -bottom-16 left-4 p-1 bg-black rounded-full z-[104]">
              <div className="w-32 h-32 rounded-full bg-zinc-900 border-4 border-black overflow-hidden relative group/avatar cursor-pointer z-[105]">
                {formData.avatarUrl ? (
                  <img src={formData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-white">
                    {formData.name[0]}
                  </div>
                )}
                <label className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity z-[106] cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, 'avatar')}
                  />
                  <div className="p-3 rounded-full bg-black/40 backdrop-blur-sm">
                    <Camera size={24} className="text-white" />
                  </div>
                </label>
              </div>
            </div>
          </div>

          <form className="mt-20 px-4 pb-8 space-y-6" onSubmit={handleSubmit}>
            <div className="relative group">
              <div className="absolute top-2 left-3 text-xs text-zinc-500 group-focus-within:text-sky-500 transition-colors">Name</div>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full pt-6 pb-2 px-3 bg-transparent border border-zinc-800 rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-white transition-all"
              />
            </div>

            <div className="relative group">
              <div className="absolute top-2 left-3 text-xs text-zinc-500 group-focus-within:text-sky-500 transition-colors">Bio</div>
              <textarea
                value={formData.bio || ''}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full pt-6 pb-2 px-3 bg-transparent border border-zinc-800 rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-white transition-all min-h-[100px] resize-none"
              />
            </div>

            <div className="relative group">
              <div className="absolute top-2 left-3 text-xs text-zinc-500 group-focus-within:text-sky-500 transition-colors">Location</div>
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full pt-6 pb-2 px-3 bg-transparent border border-zinc-800 rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-white transition-all"
              />
            </div>

            <div className="relative group">
              <div className="absolute top-2 left-3 text-xs text-zinc-500 group-focus-within:text-sky-500 transition-colors">Website</div>
              <input
                type="text"
                value={formData.website || ''}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full pt-6 pb-2 px-3 bg-transparent border border-zinc-800 rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-white transition-all"
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditProfile;
