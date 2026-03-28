import { GameState, SocialPost, NewsItem, Email } from '../../types';
import { generateReactions } from '../../services/llm/llm';
import { calculateSocialEngagement } from '../../utils/helpers';

export const handleAnnounceChange = async (state: GameState, payload: any): Promise<Partial<GameState>> => {
    const { description, statUpdates } = payload;
    
    // Generate AI reactions
    const reactions = await generateReactions(state, description, statUpdates);
    
    const newEmails = (reactions.newEmails || []).map((e: any, i: number) => ({
      ...e,
      id: `react-email-${Date.now()}-${i}`,
      read: false,
      replied: false,
      date: state.date,
    }));

    const newNews = (reactions.newNews || []).map((n: any, i: number) => ({
      ...n,
      id: `react-news-${Date.now()}-${i}`,
      date: state.date,
    }));

    const newSocial = (reactions.newSocialPosts || []).map((s: any, i: number) => {
      const engagement = calculateSocialEngagement(s.handle, s.content);
      return {
        ...s,
        id: `react-social-${Date.now()}-${i}`,
        date: state.date,
        likes: engagement.likes,
        retweets: engagement.retweets,
        isNew: true
      };
    });

    const actualChanges = {
        publicApproval: statUpdates.morale?.fans || 0,
        ownerApproval: statUpdates.morale?.owners || 0,
        playerApproval: statUpdates.morale?.players || 0,
        legacy: statUpdates.legacy || 0,
        viewership: statUpdates.viewership || 0,
        revenue: statUpdates.revenue || 0,
    };

    const consequence = {
        narrative: description,
        statChanges: {
            morale: {
                fans: statUpdates.morale?.fans || 0,
                players: statUpdates.morale?.players || 0,
                owners: statUpdates.morale?.owners || 0,
                legacy: statUpdates.morale?.legacy || 0
            },
            revenue: statUpdates.revenue || 0,
            viewership: statUpdates.viewership || 0,
            legacy: statUpdates.legacy || 0
        },
        actualChanges
    };

    const newStats = {
        ...state.stats,
        publicApproval: Math.round(Math.max(0, Math.min(100, state.stats.publicApproval + actualChanges.publicApproval))),
        ownerApproval: Math.round(Math.max(0, Math.min(100, state.stats.ownerApproval + actualChanges.ownerApproval))),
        playerApproval: Math.round(Math.max(0, Math.min(100, state.stats.playerApproval + actualChanges.playerApproval))),
        legacy: Math.round(Math.max(0, Math.min(100, state.stats.legacy + actualChanges.legacy))),
    };

    // Correctly update leagueStats by adding increments for revenue/viewership
    // and merging morale
    const updatedLeagueStats = {
        ...state.leagueStats,
        ...statUpdates,
        revenue: (state.leagueStats.revenue || 0) + (statUpdates.revenue || 0),
        viewership: (state.leagueStats.viewership || 0) + (statUpdates.viewership || 0),
        morale: {
            ...state.leagueStats.morale,
            fans: Math.max(0, Math.min(100, (state.leagueStats.morale?.fans || 0) + (statUpdates.morale?.fans || 0))),
            players: Math.max(0, Math.min(100, (state.leagueStats.morale?.players || 0) + (statUpdates.morale?.players || 0))),
            owners: Math.max(0, Math.min(100, (state.leagueStats.morale?.owners || 0) + (statUpdates.morale?.owners || 0))),
            legacy: Math.max(0, Math.min(100, (state.leagueStats.morale?.legacy || 0) + (statUpdates.morale?.legacy || 0))),
        }
    };

    return {
        stats: newStats,
        leagueStats: updatedLeagueStats,
        inbox: [...newEmails, ...state.inbox],
        news: [...newNews, ...state.news],
        socialFeed: [...newSocial, ...state.socialFeed],
        isProcessing: false,
        history: [...state.history, { text: description, date: state.date, type: 'League Event' } as any],
        lastOutcome: description,
        lastConsequence: consequence
    };
};
