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

export type MinimalOscNode = {
  frequency: { value: number };
  connect(node: unknown): MinimalOscNode;
  start(when: number): void;
  stop(when: number): void;
};

export type MinimalGainNode = {
  gain: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void };
  connect(node: unknown): MinimalGainNode;
};

export type MinimalAudioCtx = {
  currentTime: number;
  resume(): Promise<void>;
  createOscillator(): MinimalOscNode;
  createGain(): MinimalGainNode;
  destination: unknown;
};

export type AudioDeps = {
  lang: () => Lang;
  voiceOn: () => boolean;
  beepsOn: () => boolean;
  voiceInSilentMode: () => boolean;
  mediaControlsEnabled: () => boolean;
  onMediaAction: (a: MediaAction) => void;
  createAudioEl?: (url: string) => MinimalAudioEl;
  createCtx?: () => MinimalAudioCtx;
};

const defaultCtxFactory = (): MinimalAudioCtx => {
  const ctx = new AudioContext();
  return {
    get currentTime() {
      return ctx.currentTime;
    },
    resume: () => ctx.resume(),
    createOscillator: () => ctx.createOscillator() as unknown as MinimalOscNode,
    createGain: () => ctx.createGain() as unknown as MinimalGainNode,
    destination: ctx.destination,
  };
};

const KEEPALIVE_TONE_AMPLITUDE = 300;

function silentLoopWavDataUri(amplitude = KEEPALIVE_TONE_AMPLITUDE): string {
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

const defaultAudioElFactory = (url: string): MinimalAudioEl =>
  new Audio(url) as unknown as MinimalAudioEl;

export class AudioService {
  private deps: AudioDeps;
  private ctx: MinimalAudioCtx | null = null;
  private voiceEl: MinimalAudioEl | null = null;
  private voiceSource: { lang: Lang; key: VoiceKey } | null = null;
  private voicePlaying = false;
  private voiceQueue: { lang: Lang; key: VoiceKey }[] = [];
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
    this.ensureVoiceEl();
    if (this.deps.mediaControlsEnabled()) this.attachMediaSession();
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

  private ensureKeepAliveEl(): MinimalAudioEl {
    if (this.keepAliveEl) return this.keepAliveEl;
    try {
      const factory = this.deps.createAudioEl ?? defaultAudioElFactory;
      const el = factory(silentLoopWavDataUri());
      el.loop = true;
      this.keepAliveEl = el;
      return el;
    } catch {
      return null as unknown as MinimalAudioEl;
    }
  }

  voice(key: VoiceKey, enqueue = false): void {
    if (!this.deps.voiceOn()) return;
    const lang = this.deps.lang();
    diagCount(`voice.${lang}.${key}`);
    if (enqueue && this.voicePlaying) {
      this.voiceQueue.push({ lang, key });
      return;
    }
    if (!enqueue) this.voiceQueue = [];
    this.playVoice(lang, key);
  }

  private playVoice(lang: Lang, key: VoiceKey): void {
    const el = this.ensureVoiceEl();
    try {
      el.pause();
      this.voicePlaying = true;
      this.setAudioSessionType(this.deps.voiceInSilentMode() ? 'playback' : 'transient');
      const sourceChanged = this.voiceSource?.lang !== lang || this.voiceSource.key !== key;
      if (sourceChanged) {
        el.src = AudioService.urlFor(lang, key);
        el.load();
        this.voiceSource = { lang, key };
      }
      el.loop = false;
      el.onended = () => {
        diag('voice.ended', { key, lang });
        this.finishVoice();
      };
      el.onerror = () => {
        diag('voice.mediaError', key);
        this.finishVoice();
      };
      el.currentTime = 0;
      void el
        .play()
        .then(() =>
          diag('voice.playResolved', {
            key,
            lang,
            volume: el.volume,
            muted: el.muted ?? false,
            paused: el.paused ?? false,
            readyState: el.readyState ?? null,
          }),
        )
        .catch((err) => {
          diag('voice.playFail', { key, err: String(err).slice(0, 120) });
          this.finishVoice();
        });
    } catch (err) {
      diag('voice.channelFail', { key, err: String(err).slice(0, 120) });
      this.finishVoice();
    }
  }

  private finishVoice(): void {
    this.voicePlaying = false;
    const next = this.voiceQueue.shift();
    if (next) {
      this.playVoice(next.lang, next.key);
      return;
    }
    this.setAudioSessionType('auto');
  }

  private setAudioSessionType(type: 'auto' | 'transient' | 'playback'): void {
    const session = (navigator as { audioSession?: { type?: string } }).audioSession;
    if (!session || !('type' in session)) return;
    try {
      session.type = type;
      diag('audioSession.type', type);
    } catch {
      diag('audioSession.typeFail', type);
    }
  }

  beep(kind: BeepKind): void {
    if (!this.deps.beepsOn()) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    if (kind === 'end') {
      this.tone(ctx, 880, t0, 0.09, 0.18);
      this.tone(ctx, 880, t0 + 0.14, 0.09, 0.18);
      this.tone(ctx, 1175, t0 + 0.28, 0.16, 0.22);
    } else if (kind === 'tick') {
      this.tone(ctx, 1200, t0, 0.035, 0.12);
    } else {
      this.tone(ctx, 660, t0, 0.12, 0.16);
      this.tone(ctx, 990, t0 + 0.15, 0.2, 0.18);
    }
  }

  syncMediaState(state: PlaybackState): void {
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

  private ensureCtx(): MinimalAudioCtx | null {
    if (this.ctx) return this.ctx;
    try {
      const factory = this.deps.createCtx ?? defaultCtxFactory;
      this.ctx = factory();
      void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    } catch {
      return null;
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

  private tone(ctx: MinimalAudioCtx, freq: number, at: number, dur: number, peak: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }
}
