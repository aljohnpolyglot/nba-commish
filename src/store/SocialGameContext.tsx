import React, { createContext, useContext, useReducer, ReactNode, useState } from 'react';
import { SocialPost, UserProfile } from '../types';
import { fetchProfileData } from '../utils/socialapi';
import { generateContentWithRetry } from '../services/llm/utils/api';

interface SocialGameState {
  date: string;
  socialFeed: SocialPost[];
  followedHandles: string[];
  teams: any[];
  boxScores: any[];
  userProfile: UserProfile;
  cachedProfiles: Record<string, any>;
}

type Action =
  | { type: 'SET_FEED'; payload: SocialPost[] }
  | { type: 'TOGGLE_LIKE'; payload: string }
  | { type: 'TOGGLE_RETWEET'; payload: string }
  | { type: 'FOLLOW_USER'; payload: string }
  | { type: 'UNFOLLOW_USER'; payload: string }
  | { type: 'SAVE_SOCIAL_THREAD'; payload: { postId: string; replies: SocialPost[] } }
  | { type: 'UPDATE_PROFILE'; payload: Partial<UserProfile> }
  | { type: 'ADD_POST'; payload: SocialPost }
  | { type: 'ADD_REPLY'; payload: { postId: string; reply: SocialPost } }
  | { type: 'ADD_REPLIES'; payload: { postId: string; replies: SocialPost[] } }
  | { type: 'CACHE_PROFILE'; payload: { handle: string; profile: any } };

const STORAGE_KEY = 'twitter_game_state';

const loadState = (): SocialGameState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return {
    date: '2026-04-02',
    socialFeed: [],
    followedHandles: ['ShamsCharania', 'Wojespn', 'NBA'],
    teams: [],
    boxScores: [],
    userProfile: {
      name: 'User Name',
      handle: '@username',
      bio: '',
      location: 'Global',
      website: 'x.com/username',
      followingCount: 0,
      followersCount: 0,
    },
    cachedProfiles: {}
  };
};

const initialState: SocialGameState = loadState();

function gameReducer(state: SocialGameState, action: Action): SocialGameState {
  let newState: SocialGameState;
  switch (action.type) {
    case 'SET_FEED':
      newState = { ...state, socialFeed: action.payload };
      break;
    case 'TOGGLE_LIKE':
      newState = {
        ...state,
        socialFeed: state.socialFeed.map(post =>
          post.id === action.payload
            ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
            : post
        ),
      };
      break;
    case 'TOGGLE_RETWEET':
      newState = {
        ...state,
        socialFeed: state.socialFeed.map(post =>
          post.id === action.payload
            ? { ...post, isRetweeted: !post.isRetweeted, retweets: post.isRetweeted ? post.retweets - 1 : post.retweets + 1 }
            : post
        ),
      };
      break;
    case 'FOLLOW_USER':
      newState = { ...state, followedHandles: [...state.followedHandles, action.payload] };
      break;
    case 'UNFOLLOW_USER':
      newState = { ...state, followedHandles: state.followedHandles.filter(h => h !== action.payload) };
      break;
    case 'SAVE_SOCIAL_THREAD':
      const existingIds = new Set(state.socialFeed.map(p => p.id));
      const uniqueNewReplies = action.payload.replies.filter(r => !existingIds.has(r.id));
      newState = {
        ...state,
        socialFeed: [...state.socialFeed, ...uniqueNewReplies]
      };
      break;
    case 'UPDATE_PROFILE':
      newState = {
        ...state,
        userProfile: { ...state.userProfile, ...action.payload }
      };
      break;
    case 'ADD_POST':
      newState = {
        ...state,
        socialFeed: [action.payload, ...state.socialFeed]
      };
      break;
    case 'ADD_REPLY':
      newState = {
        ...state,
        socialFeed: [action.payload.reply, ...state.socialFeed]
      };
      break;
    case 'ADD_REPLIES': {
      const existingIds = new Set(state.socialFeed.map(p => p.id));
      const uniqueNewReplies = action.payload.replies.filter(r => !existingIds.has(r.id));
      newState = {
        ...state,
        socialFeed: [...state.socialFeed, ...uniqueNewReplies]
      };
      break;
    }
    case 'CACHE_PROFILE':
      newState = {
        ...state,
        cachedProfiles: {
          ...(state.cachedProfiles || {}),
          [action.payload.handle.replace('@', '')]: action.payload.profile
        }
      };
      break;
    default:
      return state;
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  return newState;
}

const SocialGameContext = createContext<{
  state: SocialGameState;
  dispatchAction: React.Dispatch<Action>;
  toggleLike: (id: string) => void;
  toggleRetweet: (id: string) => void;
  followUser: (handle: string) => void;
  unfollowUser: (handle: string) => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  addPost: (post: SocialPost) => void;
  addReply: (postId: string, reply: SocialPost) => void;
  generateReplies: (postId: string) => Promise<void>;
  isGeneratingReplies: Record<string, boolean>;
} | undefined>(undefined);

export function SocialGameProvider({ children }: { children: ReactNode }) {
  const [state, dispatchAction] = useReducer(gameReducer, initialState);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState<Record<string, boolean>>({});

  const toggleLike = (id: string) => dispatchAction({ type: 'TOGGLE_LIKE', payload: id });
  const toggleRetweet = (id: string) => dispatchAction({ type: 'TOGGLE_RETWEET', payload: id });
  const followUser = (handle: string) => dispatchAction({ type: 'FOLLOW_USER', payload: handle });
  const unfollowUser = (handle: string) => dispatchAction({ type: 'UNFOLLOW_USER', payload: handle });
  const updateProfile = (profile: Partial<UserProfile>) => dispatchAction({ type: 'UPDATE_PROFILE', payload: profile });
  const addPost = (post: SocialPost) => dispatchAction({ type: 'ADD_POST', payload: post });
  const addReply = (postId: string, reply: SocialPost) => dispatchAction({ type: 'ADD_REPLY', payload: { postId, reply } });

  const generateReplies = async (postId: string) => {
    const post = state.socialFeed.find((p) => p.id === postId);
    if (!post || post.replies?.length || isGeneratingReplies[postId]) return;

    setIsGeneratingReplies((prev) => ({ ...prev, [postId]: true }));

    try {
      const response = await generateContentWithRetry({
        model: 'gemini-2.5-flash-lite',
        contents: `Generate 3-5 realistic Twitter replies to this tweet by ${post.author} (${post.handle}): "${post.content}". Return ONLY a JSON array, no markdown, with objects: {author, handle, content, likes, retweets}`,
      });
      const generatedData = JSON.parse(response.text?.replace(/```json|```/g, '').trim() || '[]');
      
      // Add replies to state immediately
      const newReplies: SocialPost[] = generatedData.map((data: any, index: number) => ({
        id: `gen-reply-${postId}-${index}-${Date.now()}`,
        author: data.author,
        handle: data.handle,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.handle.replace('@', '')}`,
        content: data.content,
        date: 'Just now',
        likes: data.likes,
        retweets: data.retweets,
        replies: [],
        source: 'TwitterX',
        replyToId: postId,
        isLiked: false,
        isRetweeted: false,
        isAI: true,
      }));
      
      dispatchAction({ type: 'ADD_REPLIES', payload: { postId, replies: newReplies } });

      // Proactively fetch profile data for generated handles
      const uniqueHandles = Array.from(new Set(generatedData.map((d: any) => d.handle.replace('@', '')))) as string[];
      await Promise.all(uniqueHandles.map(handle => fetchProfileData(handle, dispatchAction)));
    } catch (error) {
      console.error("Failed to generate replies:", error);
    } finally {
      setIsGeneratingReplies((prev) => ({ ...prev, [postId]: false }));
    }
  };

  return (
    <SocialGameContext.Provider value={{ state, dispatchAction, toggleLike, toggleRetweet, followUser, unfollowUser, updateProfile, addPost, addReply, generateReplies, isGeneratingReplies }}>
      {children}
    </SocialGameContext.Provider>
  );
}

export function useSocialGame() {
  const context = useContext(SocialGameContext);
  if (!context) throw new Error('useSocialGame must be used within a SocialGameProvider');
  return context;
}
