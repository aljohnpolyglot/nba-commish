import { Type } from "@google/genai";

export const OUTCOME_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    outcomeText: { type: Type.STRING },
    consequence: {
      type: Type.OBJECT,
      properties: {
        narrative: { type: Type.STRING },
        statChanges: {
          type: Type.OBJECT,
          properties: {
            morale: {
              type: Type.OBJECT,
              properties: {
                fans: { type: Type.NUMBER },
                players: { type: Type.NUMBER },
                owners: { type: Type.NUMBER },
              }
            },
            revenue: { type: Type.NUMBER },
            viewership: { type: Type.NUMBER },
            legacy: { type: Type.NUMBER },
          }
        },
        forcedTrade: {
          type: Type.OBJECT,
          properties: {
            playerName: { type: Type.STRING },
            destinationTeam: { type: Type.STRING },
          }
        }
      }
    },
    statChanges: {
      type: Type.OBJECT,
      properties: {
        publicApproval: { type: Type.NUMBER },
        ownerApproval: { type: Type.NUMBER },
        playerApproval: { type: Type.NUMBER },
        leagueFunds: { type: Type.NUMBER },
        personalWealth: { type: Type.NUMBER },
        legacy: { type: Type.NUMBER },
      },
      required: ["publicApproval", "ownerApproval", "playerApproval", "leagueFunds", "personalWealth", "legacy"],
    },
    newEmails: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sender: { type: Type.STRING },
          senderRole: { type: Type.STRING },
          organization: { type: Type.STRING },
          subject: { type: Type.STRING },
          body: { type: Type.STRING },
          playerPortraitUrl: { type: Type.STRING },
        },
        required: ["sender", "senderRole", "organization", "subject", "body"],
      },
    },
    newNews: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          content: { type: Type.STRING },
          date: { type: Type.STRING, description: "Optional date for the news item (e.g. 'Oct 24, 2025')" },
        },
        required: ["headline", "content"],
      },
    },
    newSocialPosts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          author: { type: Type.STRING },
          handle: { type: Type.STRING },
          content: { type: Type.STRING },
          source: { type: Type.STRING },
          playerPortraitUrl: { type: Type.STRING },
          date: { type: Type.STRING, description: "Optional ISO timestamp or relative date" },
        },
        required: ["author", "handle", "content", "source"],
      },
    },
  },
  required: ["outcomeText", "statChanges", "newEmails", "newNews", "newSocialPosts"],
};

export const SOCIAL_THREAD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    replies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          author: { type: Type.STRING },
          handle: { type: Type.STRING },
          content: { type: Type.STRING },
        },
        required: ["author", "handle", "content"],
      },
    },
  },
  required: ["replies"],
};

export const RULE_DETAILS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ["title", "description"],
};
