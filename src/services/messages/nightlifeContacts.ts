import type { Email, GameState, NightlifeContact } from '../../types';
import { getNameData, pickGenderedName } from '../../data/nameDataFetcher';
import {
  createPortraitUsageSet,
  getNationalityPortraitRace,
  getNewgenPortraitUrl,
  getRegenPortraitUrl,
} from '../../utils/newgenPortrait';
import { hashPortraitSeed } from '../../utils/portraitPoolAllocator';
import { getSimulationSeed } from '../saveIdentity';

const MESSAGES = [
  "Hey... remember last night? 😉",
  "That was a wild night. Hope you're feeling okay today.",
  'You were definitely the life of the party last night!',
  'Had so much fun with you. We should do it again sometime.',
  'Still thinking about that dance last night... call me?',
  'You left your sunglasses at the table. I have them if you want to meet up.',
];

function seededRng(seed: string): () => number {
  let value = hashPortraitSeed(seed) || 1;
  return () => {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function knownContacts(state: GameState): NightlifeContact[] {
  return state.nightlifeContacts ?? [];
}

function usedPortraits(state: GameState): Set<string> {
  const staffPortraits = state.staff
    ? [
        ...state.staff.owners,
        ...state.staff.gms,
        ...state.staff.coaches,
        ...(state.staff.leagueOffice ?? []),
      ].map(member => member.playerPortraitUrl)
    : [];
  return createPortraitUsageSet([
    ...state.players.map(player => player.imgURL),
    ...staffPortraits,
    ...knownContacts(state).map(contact => contact.portraitUrl),
    ...state.chats.flatMap(chat => chat.participantDetails.map(person => person.avatarUrl)),
  ]);
}

function createUniqueContact(state: GameState, location: string, messageDate: string): NightlifeContact {
  const seedBase = `${getSimulationSeed(state)}:${state.day}:${messageDate}:${location}`;
  const existingNames = new Set(knownContacts(state).map(contact => contact.name.toLowerCase()));
  let name = '';
  for (let attempt = 0; attempt < 500; attempt++) {
    const candidate = pickGenderedName(getNameData(), 'USA', 'female', seededRng(`${seedBase}:${attempt}`));
    if (!existingNames.has(candidate.toLowerCase())) {
      name = candidate;
      break;
    }
  }
  if (!name) name = `Alexis Stone ${existingNames.size + 1}`;
  const race = getNationalityPortraitRace(name, 'USA');
  const portraitUrl = getRegenPortraitUrl(name, race, {
    nationality: 'USA',
    gender: 'female',
    usedPortraitUrls: usedPortraits(state),
  }) ?? getNewgenPortraitUrl(name, 'female');
  return {
    id: `nightlife-${hashPortraitSeed(`${getSimulationSeed(state)}:${name}`).toString(36)}`,
    name,
    portraitUrl,
    firstMetDate: messageDate,
    lastSeenDate: messageDate,
    metAt: location,
    encounterCount: 1,
  };
}

export function createNightlifeMessage(
  state: GameState,
  location: string,
  messageDate: string,
): { contact: NightlifeContact; contacts: NightlifeContact[]; message: Email } {
  const contacts = knownContacts(state);
  const revisitRoll = hashPortraitSeed(`${getSimulationSeed(state)}:${state.day}:${location}:revisit`) / 0xffffffff;
  const existing = contacts.length > 0 && revisitRoll < 0.35
    ? contacts[hashPortraitSeed(`${messageDate}:${location}`) % contacts.length]
    : undefined;
  const contact = existing
    ? {
        ...existing,
        lastSeenDate: messageDate,
        metAt: location,
        encounterCount: existing.encounterCount + 1,
      }
    : createUniqueContact(state, location, messageDate);
  const nextContacts = existing
    ? contacts.map(item => item.id === contact.id ? contact : item)
    : [...contacts, contact];
  const messageIndex = hashPortraitSeed(`${contact.id}:${messageDate}:${contact.encounterCount}`) % MESSAGES.length;
  return {
    contact,
    contacts: nextContacts,
    message: {
      id: `club-message-${state.saveId ?? 'save'}-${state.day}-${contact.id}`,
      senderId: contact.id,
      sender: contact.name,
      senderRole: 'Someone you met last night',
      subject: 'Last night',
      body: MESSAGES[messageIndex] ?? MESSAGES[0],
      date: messageDate,
      read: false,
      replied: false,
      playerPortraitUrl: contact.portraitUrl,
      delivery: 'message',
    },
  };
}
