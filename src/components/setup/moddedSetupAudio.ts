import type { EuropeMarket, ModdedLeagueBase } from './LeagueTypeSelector';

type ModdedSetupTrack = ModdedLeagueBase | EuropeMarket | 'college';

const TRACKS: Partial<Record<ModdedSetupTrack, readonly string[]>> = {
  nba: ['/audio/nba-modded-setup.m4a', '/audio/nba-modded-setup.mp3'],
  wnba: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/02/a2/08/02a20837-6af3-dc21-de09-0edbcf824080/mzaf_7041063547633199849.plus.aac.ep.m4a'],
  philippines: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview112/v4/3a/5f/89/3a5f899b-2b65-9507-56a4-184890c67ba3/mzaf_9006515339846752658.plus.aac.ep.m4a'],
  college: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a1/5b/20/a15b2021-a4c0-4f6c-abf5-112ef1b59e8e/mzaf_5780906319786939332.plus.aac.p.m4a'],
  europe: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/74/e0/a0/74e0a085-823a-9d40-e3f7-f7350634a980/mzaf_2435340328726193307.plus.aac.ep.m4a'],
  spain: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/ec/8d/0d/ec8d0d3e-5912-687d-2774-3c566408124d/mzaf_6164773407766158456.plus.aac.ep.m4a'],
  france: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ba/db/ff/badbff73-aa90-26f0-47ad-dd301169f260/mzaf_4264889596276626663.plus.aac.ep.m4a'],
  germany: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/39/c4/14/39c4142f-e08c-b99a-f2e3-df3865010ee7/mzaf_16225332725370266633.plus.aac.ep.m4a'],
  italy: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/de/57/96/de57969f-08c7-9ab3-49ae-be5a91f6566a/mzaf_14952871825810299010.plus.aac.ep.m4a'],
  greece: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/d3/5b/d9/d35bd9a3-d105-95d8-ba29-0f5c6b8e764b/mzaf_4065488766692049907.plus.aac.ep.m4a'],
  turkey: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/a7/58/d0/a758d099-0805-47ad-ef50-c0c7e7b19310/mzaf_12031212836113753676.plus.aac.ep.m4a'],
  serbia: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/82/58/41/82584112-35e5-95b6-669d-1d0766ffce3d/mzaf_17095427763394427315.plus.aac.ep.m4a'],
  lithuania: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/e7/25/53/e72553b7-09d4-493c-b20d-e8921aa3e4c0/mzaf_10239602640549250489.plus.aac.ep.m4a'],
  israel: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/b5/de/d9/b5ded98c-66d9-e856-838b-92af52aecdad/mzaf_15772820470168986790.plus.aac.ep.m4a'],
  russia: ['https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview122/v4/4b/b4/34/4bb43412-37dc-42ef-2029-36e68da3116e/mzaf_9602522118140156064.plus.aac.ep.m4a'],
};

let soundtrack: HTMLAudioElement | null = null;
let soundtrackKey = '';
let muted = false;

export function setModdedSetupMuted(nextMuted: boolean): void {
  muted = nextMuted;
  if (!soundtrack) return;
  if (muted) soundtrack.pause();
  else void soundtrack.play().catch(() => undefined);
}

export function isModdedSetupMuted(): boolean {
  return muted;
}

export function resolveModdedSetupTrackSources(key: ModdedSetupTrack): string[] {
  return [...(TRACKS[key] ?? [])];
}

export function playModdedSetupTrack(key: ModdedSetupTrack): void {
  if (typeof Audio === 'undefined') return;
  const sources = resolveModdedSetupTrackSources(key);
  if (sources.length === 0) return;
  if (soundtrack && soundtrackKey === key) {
    if (!muted) void soundtrack.play().catch(() => undefined);
    return;
  }
  soundtrack?.pause();
  const audio = new Audio(sources[0]);
  let sourceIndex = 0;
  soundtrack = audio;
  soundtrackKey = key;
  audio.volume = 0.35;
  audio.loop = true;
  audio.addEventListener('error', () => {
    if (soundtrack !== audio || soundtrackKey !== key || sourceIndex >= sources.length - 1) return;
    sourceIndex += 1;
    audio.src = sources[sourceIndex];
    audio.load();
    if (!muted) void audio.play().catch(() => undefined);
  });
  audio.addEventListener('loadedmetadata', () => {
    if (soundtrack && soundtrack.currentTime < 5) soundtrack.currentTime = 5;
  }, { once: true });
  if (!muted) void audio.play().catch(() => undefined);
}

export function stopModdedSetupTrack(): void {
  soundtrack?.pause();
  if (soundtrack) soundtrack.currentTime = 0;
  soundtrack = null;
  soundtrackKey = '';
}

export function playModdedSetupSound(type: 'hover' | 'click' | 'back' | 'success'): void {
  if (muted || typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  const start = context.currentTime;
  if (type === 'hover') {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(320, start);
    oscillator.frequency.exponentialRampToValueAtTime(550, start + 0.06);
    gain.gain.setValueAtTime(0.015, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
    oscillator.start();
    oscillator.stop(start + 0.06);
  } else if (type === 'back') {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(280, start);
    oscillator.frequency.exponentialRampToValueAtTime(180, start + 0.08);
    gain.gain.setValueAtTime(0.03, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
    oscillator.start();
    oscillator.stop(start + 0.08);
  } else {
    oscillator.type = 'triangle';
    if (type === 'success') {
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        oscillator.frequency.setValueAtTime(frequency, start + index * 0.055);
      });
    } else {
      oscillator.frequency.setValueAtTime(440, start);
      oscillator.frequency.setValueAtTime(554.37, start + 0.08);
    }
    gain.gain.setValueAtTime(0.04, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (type === 'success' ? 0.3 : 0.12));
    oscillator.start();
    oscillator.stop(start + (type === 'success' ? 0.3 : 0.12));
  }
}
