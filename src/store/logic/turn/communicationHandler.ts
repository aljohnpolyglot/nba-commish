import { GameState, Email, NBAPlayer as Player, UserAction } from '../../../types';
import { getAllReferees } from '../../../data/photos';

export const handleCommunication = (state: GameState, action: UserAction, result: any, dateString: string) => {
    let updatedInbox = [...state.inbox];
    
    // Handle email replies
    if (action.type === 'REPLY_EMAIL' && action.payload?.emailId) {
        updatedInbox = updatedInbox.map(e => {
            if (e.id === action.payload.emailId) {
                const thread = e.thread || [{sender: e.sender, text: e.body}];
                return { 
                    ...e, 
                    replied: true, 
                    thread: [...thread, {sender: 'Commissioner', text: action.payload.replyText}] 
                };
            }
            return e;
        });
    }

    const rawEmails: Email[] = (result.newEmails || []).map((e: any, i: number) => ({
        ...e,
        id: e.id || `llm-email-${state.day}-${i}-${Date.now()}`,
        date: dateString
    }));

    const chatRoles = ['Player', 'Owner', 'GM', 'Coach', 'Legend', 'WNBA', 'Free Agent', 'General Manager'];
    const newInboxEmails: Email[] = [];
    const newChatMessages: Email[] = [];

    rawEmails.forEach(email => {
        const role = (email.senderRole || '').toLowerCase();
        const isChatRole = chatRoles.some(r => {
            const rLower = r.toLowerCase();
            if (rLower === 'player' && role.includes('agent')) return false;
            return role.includes(rLower);
        });

        if (isChatRole) {
            newChatMessages.push(email);
        } else {
            newInboxEmails.push(email);
        }
    });

    // Probabilistic Inbox Messages (Scandals, Discipline, Sponsors)
    const dailyProb = 0.002; // Roughly 5-6% monthly
    if (Math.random() < dailyProb) {
        const sponsor = ["Nike", "Adidas", "Jordan Brand", "State Farm", "Gatorade"][Math.floor(Math.random() * 5)];
        newInboxEmails.push({
            id: `sponsor-${Date.now()}`,
            sender: sponsor,
            senderRole: "Sponsor Representative",
            subject: "Partnership Update & Campaign Proposal",
            body: `Dear Commissioner, we've been monitoring the league's recent trajectory. We'd like to discuss a new marketing initiative that could significantly boost viewership. Let's schedule a call to discuss the details.`,
            date: dateString,
            read: false,
            replied: false
        });
    }

    const existingEmailIds = new Set(state.inbox.map(e => e.id));
    const uniqueNewEmails = newInboxEmails.filter(e => !existingEmailIds.has(e.id));

    let updatedChats = [...state.chats];
    newChatMessages.forEach(msg => {
        const matchedPlayer = state.players.find(
            p => p.name.toLowerCase() === msg.sender.toLowerCase()
        );
        const matchedStaff = [
            ...(state.staff?.owners || []),
            ...(state.staff?.gms || []),
            ...(state.staff?.coaches || []),
        ].find(s => s.name.toLowerCase() === msg.sender.toLowerCase());
        const matchedRef = getAllReferees().find(
            r => r.name.toLowerCase() === msg.sender.toLowerCase()
        );
        const targetId = matchedPlayer?.internalId
            || matchedStaff?.name
            || (matchedRef ? `ref-${matchedRef.id}` : null)
            || msg.sender;
        let chatIndex = updatedChats.findIndex(c =>
            c.participants.includes(targetId) ||
            c.participants.includes(msg.sender)
        );
        let chat;
        let avatarUrl = msg.playerPortraitUrl;

        if (!avatarUrl) {
            const allStaff = [
                ...(state.staff?.owners || []),
                ...(state.staff?.gms || []),
                ...(state.staff?.coaches || []),
                ...(state.staff?.leagueOffice || [])
            ];
            const staff = allStaff.find(s => s.name.toLowerCase() === msg.sender.toLowerCase());
            if (staff) {
                avatarUrl = staff.playerPortraitUrl;
            } else {
                const player = state.players.find(p => p.name.toLowerCase() === msg.sender.toLowerCase());
                if (player) {
                    avatarUrl = player.imgURL;
                }
            }
        }

        if (chatIndex === -1) {
            chat = {
                id: `chat-${Date.now()}-${Math.random()}`,
                participants: ['commissioner', targetId],
                participantDetails: [
                    { id: 'commissioner', name: state.commissionerName, role: 'Commissioner' },
                    { id: targetId, name: msg.sender, role: msg.senderRole, avatarUrl: avatarUrl }
                ],
                messages: [],
                unreadCount: 0,
                isTyping: false
            };
            updatedChats.unshift(chat);
            chatIndex = 0;
        } else {
            chat = { ...updatedChats[chatIndex] };
            const pIndex = chat.participantDetails.findIndex(p => p.id === targetId);
            if (pIndex !== -1 && !chat.participantDetails[pIndex].avatarUrl && avatarUrl) {
                chat.participantDetails = [...chat.participantDetails];
                chat.participantDetails[pIndex] = { ...chat.participantDetails[pIndex], avatarUrl };
            }
            updatedChats.splice(chatIndex, 1);
            updatedChats.unshift(chat);
            chatIndex = 0;
        }

        const gameDate = new Date(state.date);
        const now = new Date();
        gameDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

        const botMessage = {
            id: `msg-${Date.now()}-${Math.random()}`,
            senderId: targetId,
            senderName: msg.sender,
            text: msg.body,
            timestamp: gameDate.toISOString(),
            read: false,
            seen: false,
            type: 'text' as const
        };

        chat.messages = [...chat.messages, botMessage];
        chat.lastMessage = botMessage;
        chat.unreadCount += 1;
        updatedChats[chatIndex] = chat;
    });

    return { uniqueNewEmails, updatedInbox, updatedChats };
};
