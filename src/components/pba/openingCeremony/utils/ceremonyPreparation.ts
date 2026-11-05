import { ANNOUNCER_CLIPS, AnnouncerClipKey } from '../data/announcerClips';
import { ANNOUNCER_PATTERNS, AnnouncementSegment } from '../data/announcerPatterns';
import { PBATeam, PreparedTeamCeremony, CeremonyEvent, AnnouncementPhase } from '../types';

const CLIP_TEXT_MAP: Record<AnnouncerClipKey, string> = {
  ladiesAndGentlemen: 'Ladies and Gentlemen!',
  pbaFansMakeSomeNoise: 'PBA fans, make some noise!',
  nowEnteringTheHardwood: 'Now entering the hardwood!',
  steppingOntoTheMainCourt: 'Stepping onto the main court!',
  directFromTheTeamTunnel: 'Direct from the team tunnel!',
  theCourtIsElectrified: 'The court is electrified!',
  welcomeTheMighty: 'Welcome the mighty',
  ledByTeamMuse: 'led by team muse',
  accompaniedByTeamMuse: 'accompanied by team muse',
  featuringTeamMuse: 'featuring team muse',
  andTeamCaptain: 'and team captain',
  togetherWithTeamCaptain: 'together with team captain',
  alongsideTeamCaptain: 'alongside team captain',
  thunderousPbaWelcome: 'Give them a thunderous PBA welcome!',
  letTheArenaHearYou: 'Let the arena hear you!',
  makeSomeNoise: 'Make some noise!',
  welcomeToTheGrandParade: 'Welcome to the grand parade!',
  theFloorIsTheirs: 'The floor is theirs!',
};

const audioBufferCache = new Map<string, AudioBuffer>();
const unavailableAudioUrls = new Set<string>();

export function clearCeremonyCaches(): void {
  audioBufferCache.clear();
  unavailableAudioUrls.clear();
}

async function fetchAudioBuffer(url: string, context: AudioContext): Promise<AudioBuffer | null> {
  if (audioBufferCache.has(url)) {
    return audioBufferCache.get(url)!;
  }
  if (unavailableAudioUrls.has(url)) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      unavailableAudioUrls.add(url);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await context.decodeAudioData(arrayBuffer);
    audioBufferCache.set(url, buffer);
    return buffer;
  } catch (err) {
    clearTimeout(timeoutId);
    unavailableAudioUrls.add(url);
    console.warn(`[CeremonyPrep] Audio fetch/decode failed for ${url}:`, err);
    return null;
  }
}

async function fetchTTSBuffer(text: string, context: AudioContext): Promise<AudioBuffer | null> {
  void text;
  void context;
  return null;
}

function getPhaseForSegment(segment: AnnouncementSegment): AnnouncementPhase {
  if (segment.type === 'nativeTts') {
    if (segment.field === 'teamName') return 'team';
    if (segment.field === 'museName') return 'muse';
    if (segment.field === 'captainName') return 'captain';
  } else if (segment.type === 'audio') {
    const c = segment.clip;
    const openers = ['ladiesAndGentlemen', 'pbaFansMakeSomeNoise', 'nowEnteringTheHardwood', 'steppingOntoTheMainCourt', 'directFromTheTeamTunnel', 'theCourtIsElectrified', 'welcomeTheMighty'];
    const muses = ['ledByTeamMuse', 'accompaniedByTeamMuse', 'featuringTeamMuse'];
    const captains = ['andTeamCaptain', 'togetherWithTeamCaptain', 'alongsideTeamCaptain'];
    if (openers.includes(c)) return 'opener';
    if (muses.includes(c)) return 'muse';
    if (captains.includes(c)) return 'captain';
    return 'closer';
  }
  return 'opener';
}

export async function prepareTeamCeremony(
  team: PBATeam,
  teamIndex: number,
  context: AudioContext
): Promise<PreparedTeamCeremony> {
  const patternIndex = teamIndex % ANNOUNCER_PATTERNS.length;
  const pattern = ANNOUNCER_PATTERNS[patternIndex];
  
  const captain = team.players?.find((p) => p.isCaptain) || team.players?.[0];
  const values = {
    teamName: team.spokenName ?? team.name ?? 'PBA Team',
    museName: team.muse?.spokenName ?? team.muse?.name ?? '',
    captainName: captain?.spokenName ?? captain?.name ?? '',
  };

  const segments: { buffer: AudioBuffer | null; durationMs: number; phase: AnnouncementPhase; text: string }[] = [];

  // NOTE: WAV audio clips will NEVER use "accompanied by" for team captains ("accompaniedByTeamMuse" is for muses).
  // Team captains strictly use "and team captain", "together with team captain", or "alongside team captain" immediately.
  const museClips = ['ledByTeamMuse', 'accompaniedByTeamMuse', 'featuringTeamMuse'];
  const captainClips = ['andTeamCaptain', 'togetherWithTeamCaptain', 'alongsideTeamCaptain'];

  for (const segment of pattern.segments) {
    if (segment.type === 'pause') {
      segments.push({ buffer: null, durationMs: segment.durationMs, phase: 'idle', text: '' });
    } else if (segment.type === 'audio') {
      // Omit muse clip if no muse present
      if (!values.museName && museClips.includes(segment.clip)) {
        continue;
      }
      // Omit captain clip if no captain present
      if (!values.captainName && captainClips.includes(segment.clip)) {
        continue;
      }

      const url = ANNOUNCER_CLIPS[segment.clip];
      const buffer = await fetchAudioBuffer(url, context);
      const durationMs = buffer ? buffer.duration * 1000 : 1200;
      segments.push({ 
        buffer, 
        durationMs, 
        phase: getPhaseForSegment(segment), 
        text: CLIP_TEXT_MAP[segment.clip] || '' 
      });
      if (segment.gapAfterMs) {
        segments.push({ buffer: null, durationMs: segment.gapAfterMs, phase: 'idle', text: '' });
      }
    } else if (segment.type === 'nativeTts') {
      const text = values[segment.field] || '';
      if (!text) continue; // Skip segment if text is empty (e.g. missing muse/captain)

      const buffer = await fetchTTSBuffer(text, context);
      if (buffer) {
        segments.push({ 
          buffer, 
          durationMs: buffer.duration * 1000, 
          phase: getPhaseForSegment(segment), 
          text 
        });
      } else {
        // Fallback for missing Gemini TTS: estimate duration based on character count so native TTS has time
        const fallbackDurationMs = Math.max(1500, text.length * 90);
        segments.push({ buffer: null, durationMs: fallbackDurationMs, phase: getPhaseForSegment(segment), text });
      }
      if (segment.gapAfterMs) {
        segments.push({ buffer: null, durationMs: segment.gapAfterMs, phase: 'idle', text: '' });
      }
    }
  }

  // Final group pose hold
  segments.push({ buffer: null, durationMs: 2000, phase: 'closer', text: '' });

  // Format subtitle text conditionally omitting missing roles
  let fullText = pattern.formatText(values);
  if (!values.museName) {
    fullText = fullText.replace(/led by team muse\s*/i, '')
                       .replace(/accompanied by team muse\s*/i, '')
                       .replace(/featuring team muse\s*/i, '');
  }
  if (!values.captainName) {
    fullText = fullText.replace(/and team captain\s*/i, '')
                       .replace(/together with team captain\s*/i, '')
                       .replace(/alongside team captain\s*/i, '');
  }
  fullText = fullText.trim();

  // Calculate total duration and build timeline
  let totalDurationMs = 0;
  const timeline: CeremonyEvent[] = [];

  for (const s of segments) {
    const startMs = totalDurationMs;
    const endMs = startMs + s.durationMs;
    
    timeline.push({
      startMs,
      endMs,
      phase: s.phase,
      caption: fullText,
      // If we have text but no decoded buffer, native browser TTS will be triggered
      ttsText: (!s.buffer && s.text) ? s.text : undefined
    });
    
    totalDurationMs += s.durationMs;
  }

  // Concatenate available buffers into master audio track
  const sampleRate = context.sampleRate || 44100;
  const totalLength = Math.max(1, Math.ceil(sampleRate * (totalDurationMs / 1000)));
  const finalBuffer = context.createBuffer(2, totalLength, sampleRate);

  let currentOffset = 0;
  for (const s of segments) {
    if (s.buffer) {
      for (let channel = 0; channel < finalBuffer.numberOfChannels; channel++) {
        const outData = finalBuffer.getChannelData(channel);
        const inData = s.buffer.getChannelData(Math.min(channel, s.buffer.numberOfChannels - 1));
        const copyLen = Math.min(inData.length, totalLength - currentOffset);
        for (let k = 0; k < copyLen; k++) {
          outData[currentOffset + k] = inData[k];
        }
      }
    }
    currentOffset += Math.ceil(s.durationMs / 1000 * sampleRate);
  }

  // Export concatenated AudioBuffer to WAV Blob
  const blob = await bufferToWav(finalBuffer);
  const audioUrl = URL.createObjectURL(blob);

  return {
    teamId: team.id,
    audioUrl,
    durationMs: totalDurationMs,
    timeline
  };
}

// Helper to convert AudioBuffer to WAV blob
async function bufferToWav(buffer: AudioBuffer): Promise<Blob> {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset] || 0)); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([outBuffer], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}
