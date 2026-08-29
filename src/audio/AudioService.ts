import type { Lang, VoiceKey } from '../core/types';

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
  preload: string;
  currentTime: number;
  loop: boolean;
  volume: number;
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

const KEEPALIVE_TONE_AMPLITUDE = 0;

function silentLoopWavDataUri(): string {
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
  for (let i = 0; i < samples; i += 1) {
    view.setInt16(44 + i * 2, KEEPALIVE_TONE_AMPLITUDE, true);
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
  private pool = new Map<string, MinimalAudioEl>();
  private keepAliveEl: MinimalAudioEl | null = null;
  private unlocked = false;

  constructor(deps: AudioDeps) {
    this.deps = deps;
  }

  static urlFor(lang: Lang, key: VoiceKey): string {
    return `${import.meta.env.BASE_URL}audio/${lang}/${key}.mp3`;
  }

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (!this.ctx) {
      try {
        const factory = this.deps.createCtx ?? defaultCtxFactory;
        const ctx = factory();
        void ctx.resume().catch(() => undefined);
        this.ctx = ctx;
      } catch {
        this.ctx = null;
      }
    }
    this.primeVoices();
    this.attachMediaSession();
  }

  voice(key: VoiceKey): void {
    if (!this.deps.voiceOn()) return;
    const el = this.pool.get(`${this.deps.lang()}/${key}`);
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
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
    if (on) {
      if (!this.keepAliveEl) {
        try {
          const factory = this.deps.createAudioEl ?? defaultAudioElFactory;
          const el = factory(silentLoopWavDataUri());
          el.loop = true;
          el.volume = 0.0001;
          this.keepAliveEl = el;
        } catch {
          return;
        }
      }
      void this.keepAliveEl.play().catch(() => undefined);
    } else {
      this.keepAliveEl?.pause();
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  private ensureCtx(): MinimalAudioCtx | null {
    if (this.ctx) return this.ctx;
    if (!this.deps.createCtx) return null;
    try {
      this.ctx = this.deps.createCtx();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private primeVoices(): void {
    const factory =
      this.deps.createAudioEl ??
      ((url: string) => new (globalThis as { Audio?: typeof Audio }).Audio!(url) as unknown as MinimalAudioEl);
    for (const lang of ['ru', 'en'] as const) {
      for (const key of VOICE_KEYS) {
        const id = `${lang}/${key}`;
        if (this.pool.has(id)) continue;
        try {
          const el = factory(AudioService.urlFor(lang, key));
          el.preload = 'auto';
          this.pool.set(id, el);
        } catch {
          /* missing files degrade to beeps only */
        }
      }
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
      } catch {
        /* unsupported action on this platform */
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
