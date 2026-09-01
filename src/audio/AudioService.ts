import type { Lang, VoiceKey } from '../core/types';
import { diag, diagCount } from '../diagnostics/diagnostics';

export const VOICE_KEYS: readonly VoiceKey[] = [
  'start',
  'n15',
  'n10',
  'n5',
  'n4',
  'n3',
  'n2',
  'n1',
  'end',
  'groupDone',
  'cfgLoaded',
  'hello',
] as const;

export type MediaAction = 'play' | 'pause' | 'next' | 'prev';
export type BeepKind = 'end' | 'tick' | 'chime';
export type PlaybackState = 'playing' | 'paused' | 'none';

export type MinimalAudioEl = {
  src: string;
  preload: string;
  currentTime: number;
  loop: boolean;
  volume: number;
  muted?: boolean;
  paused?: boolean;
  readyState?: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  load(): void;
  play(): Promise<void>;
  pause(): void;
};

export type AudioDeps = {
  lang: () => Lang;
  voiceOn: () => boolean;
  beepsOn: () => boolean;
  voiceInSilentMode: () => boolean;
  mediaControlsEnabled: () => boolean;
  onMediaAction: (a: MediaAction) => void;
  createAudioEl?: (url: string) => MinimalAudioEl;
};

const defaultAudioElFactory = (url: string): MinimalAudioEl =>
  new Audio(url) as unknown as MinimalAudioEl;

const SAMPLE_RATE = 22050;

type ToneSegment = { freq: number; startSec: number; durSec: number; peak: number };

function wavFromTones(segments: ToneSegment[]): string {
  const totalSamples = Math.ceil((segments.at(-1)!.startSec + segments.at(-1)!.durSec + 0.04) * SAMPLE_RATE);
  const view = new DataView(new ArrayBuffer(44 + totalSamples * 2));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, totalSamples * 2, true);
  for (const seg of segments) {
    const from = Math.floor(seg.startSec * SAMPLE_RATE);
    const len = Math.floor(seg.durSec * SAMPLE_RATE);
    for (let i = 0; i < len; i += 1) {
      const t = i / SAMPLE_RATE;
      const envelope = 1 - i / len;
      const sample = Math.sin(2 * Math.PI * seg.freq * t) * seg.peak * envelope;
      view.setInt16(44 + (from + i) * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
    }
  }
  const bytes = new Uint8Array(view.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

const BEEP_SEGMENTS: Record<BeepKind, ToneSegment[]> = {
  end: [
    { freq: 880, startSec: 0, durSec: 0.09, peak: 0.55 },
    { freq: 880, startSec: 0.14, durSec: 0.09, peak: 0.55 },
    { freq: 1175, startSec: 0.28, durSec: 0.16, peak: 0.65 },
  ],
  tick: [{ freq: 1200, startSec: 0, durSec: 0.035, peak: 0.4 }],
  chime: [
    { freq: 660, startSec: 0, durSec: 0.12, peak: 0.5 },
    { freq: 990, startSec: 0.15, durSec: 0.2, peak: 0.55 },
  ],
};

export class AudioService {
  private deps: AudioDeps;
  private voiceEl: MinimalAudioEl | null = null;
  private voiceSource: { lang: Lang; key: VoiceKey } | null = null;
  private voicePlaying = false;
  private channelQueue: Array<() => void> = [];
  private keepAliveEl: MinimalAudioEl | null = null;
  private keepAliveActive = false;
  private unlocked = false;

  constructor(deps: AudioDeps) {
    this.deps = deps;
    this.prepareStart();
  }

  static urlFor(lang: Lang, key: VoiceKey): string {
    return `${import.meta.env.BASE_URL}audio/${lang}/${key}.mp3`;
  }

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.blessChannel();
    if (this.deps.mediaControlsEnabled()) this.attachMediaSession();
  }

  private blessChannel(): void {
    const el = this.ensureVoiceEl();
    try {
      el.onended = null;
      el.onerror = null;
      el.src = silentChannelWavDataUri();
      el.load();
      el.currentTime = 0;
      const captured = el.src;
      this.voiceSource = null;
      void el
        .play()
        .then(() => {
          if (el.src === captured) el.pause();
        })
        .catch(() => undefined);
    } catch {
      /* blessing is best-effort */
    }
  }

  private ensureVoiceEl(): MinimalAudioEl {
    if (this.voiceEl) return this.voiceEl;
    const factory = this.deps.createAudioEl ?? defaultAudioElFactory;
    const lang = this.deps.lang();
    const el = factory(AudioService.urlFor(lang, 'start'));
    el.loop = false;
    el.preload = 'auto';
    el.load();
    this.voiceEl = el;
    this.voiceSource = { lang, key: 'start' };
    return el;
  }

  prepareStart(): void {
    if (this.voicePlaying) return;
    const lang = this.deps.lang();
    const el = this.ensureVoiceEl();
    if (this.voiceSource?.lang === lang && this.voiceSource.key === 'start') return;
    el.pause();
    el.src = AudioService.urlFor(lang, 'start');
    el.preload = 'auto';
    el.load();
    this.voiceSource = { lang, key: 'start' };
  }

  voice(key: VoiceKey, enqueue = false): void {
    if (!this.deps.voiceOn()) return;
    const lang = this.deps.lang();
    diagCount(`voice.${lang}.${key}`);
    if (enqueue && this.voicePlaying) {
      this.channelQueue.push(() => this.playVoice(lang, key));
      return;
    }
    if (!enqueue) this.channelQueue = [];
    this.playVoice(lang, key);
  }

  beep(kind: BeepKind): void {
    if (!this.deps.beepsOn()) return;
    if (kind === 'end' && this.deps.voiceOn()) return;
    diagCount(`beep.${kind}`);
    if (this.voicePlaying) {
      this.channelQueue.push(() => this.playBeepNow(kind));
      return;
    }
    this.channelQueue = [];
    this.playBeepNow(kind);
  }

  private playBeepNow(kind: BeepKind): void {
    this.playOnChannel(wavFromTones(BEEP_SEGMENTS[kind]), `beep.${kind}`);
  }

  private playVoice(lang: Lang, key: VoiceKey): void {
    this.playOnChannel(AudioService.urlFor(lang, key), `voice.${lang}.${key}`);
  }

  private playOnChannel(src: string, label: string): void {
    const el = this.ensureVoiceEl();
    try {
      el.pause();
      this.voicePlaying = true;
      this.setAudioSessionType(this.deps.voiceInSilentMode() ? 'playback' : 'transient');
      if (el.src !== src) {
        el.src = src;
        el.load();
      }
      el.loop = false;
      el.onended = () => {
        diag(`${label}.ended`, {});
        this.finishChannel();
      };
      el.onerror = () => {
        diag(`${label}.mediaError`, {});
        this.finishChannel();
      };
      el.currentTime = 0;
      void el
        .play()
        .then(() =>
          diag('channel.playResolved', {
            label,
            volume: el.volume,
            muted: el.muted ?? false,
            paused: el.paused ?? false,
            readyState: el.readyState ?? null,
          }),
        )
        .catch((err) => {
          diag('channel.playFail', { label, err: String(err).slice(0, 120) });
          this.finishChannel();
        });
    } catch (err) {
      diag('channel.fail', { label, err: String(err).slice(0, 120) });
      this.finishChannel();
    }
  }

  private finishChannel(): void {
    this.voicePlaying = false;
    const next = this.channelQueue.shift();
    if (next) {
      next();
      return;
    }
    this.setAudioSessionType('auto');
  }

  private setAudioSessionType(type: 'auto' | 'transient' | 'playback'): boolean {
    const session = (navigator as { audioSession?: { type?: string } }).audioSession;
    if (!session || !('type' in session)) return false;
    try {
      session.type = type;
      diag('audioSession.type', type);
      return true;
    } catch {
      diag('audioSession.typeFail', type);
      return false;
    }
  }

  syncMediaState(state: PlaybackState): void {
    if (!this.deps.mediaControlsEnabled()) return;
    const ms = (navigator as { mediaSession?: { playbackState?: PlaybackState } }).mediaSession;
    if (ms) ms.playbackState = state;
  }

  setKeepAlive(on: boolean): void {
    if (this.keepAliveActive === on) return;
    this.keepAliveActive = on;
    diag('keepAlive', on);
    if (on) {
      const el = this.ensureKeepAliveEl();
      if (el) void el.play().catch((err) => diag('keepAlive.playFail', String(err).slice(0, 120)));
    } else {
      this.keepAliveEl?.pause();
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  private ensureKeepAliveEl(): MinimalAudioEl {
    if (this.keepAliveEl) return this.keepAliveEl;
    try {
      const factory = this.deps.createAudioEl ?? defaultAudioElFactory;
      const el = factory(silentLoopWavDataUri(300));
      el.loop = true;
      this.keepAliveEl = el;
      return el;
    } catch {
      return null as unknown as MinimalAudioEl;
    }
  }

  private attachMediaSession(): void {
    const ms = (
      navigator as {
        mediaSession?: {
          metadata?: unknown;
          playbackState?: PlaybackState;
          setActionHandler?: (a: string, fn: () => void) => void;
        };
      }
    ).mediaSession;
    if (!ms || typeof ms.setActionHandler !== 'function') return;
    try {
      const Ctor = (globalThis as { MediaMetadata?: new (m: unknown) => unknown }).MediaMetadata;
      if (Ctor) ms.metadata = new Ctor({ title: 'RestTimer' });
    } catch {
      /* metadata is decorative */
    }
    const bind = (action: string, handler: () => void) => {
      try {
        ms.setActionHandler!(action, handler);
        diagCount(`mediaSession.bound.${action}`);
      } catch {
        diag('mediaSession.bindFail', action);
      }
    };
    bind('play', () => this.deps.onMediaAction('play'));
    bind('pause', () => this.deps.onMediaAction('pause'));
    bind('nexttrack', () => this.deps.onMediaAction('next'));
    bind('previoustrack', () => this.deps.onMediaAction('prev'));
  }
}

function silentChannelWavDataUri(): string {
  const samples = Math.floor(SAMPLE_RATE * 0.05);
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  const bytes = new Uint8Array(view.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function silentLoopWavDataUri(amplitude: number): string {
  const sr = 8000;
  const samples = Math.floor(sr * 0.5);
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  const cycles = 4;
  for (let i = 0; i < samples; i += 1) {
    const wave = Math.sin((2 * Math.PI * cycles * i) / samples) * amplitude;
    view.setInt16(44 + i * 2, Math.round(wave), true);
  }
  const bytes = new Uint8Array(view.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
