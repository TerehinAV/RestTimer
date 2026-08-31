import { beforeEach, describe, expect, it } from 'vitest';
import { AudioService } from './AudioService';
import type { MinimalAudioCtx, MinimalAudioEl } from './AudioService';

type Call = { id: string; op: 'play' | 'pause' };

let calls: Call[];
let state: { lang: 'ru' | 'en'; voice: boolean; beeps: boolean };
let actions: string[];

const fakeAudioEl = (id: string): MinimalAudioEl => ({
  src: id,
  preload: '',
  currentTime: 0,
  loop: false,
  volume: 1,
  onended: null,
  onerror: null,
  load() {},
  play() {
    calls.push({ id: this.src, op: 'play' });
    return Promise.resolve();
  },
  pause() {
    calls.push({ id: this.src, op: 'pause' });
  },
});

const fakeCtx = (): MinimalAudioCtx => {
  const started: number[] = [];
  return {
    currentTime: 0,
    resume: async () => undefined,
    createOscillator: () => ({
      frequency: { value: 0 },
      connect: () => ({}) as unknown as MinimalOscLike,
      start: (w: number) => {
        started.push(w);
      },
      stop: () => undefined,
    }) as unknown as import('./AudioService').MinimalOscNode,
    createGain: () =>
      ({
        gain: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      }) as unknown as import('./AudioService').MinimalGainNode,
    destination: {},
  };
};

type MinimalOscLike = import('./AudioService').MinimalOscNode;

const makeService = () =>
  new AudioService({
    lang: () => state.lang,
    voiceOn: () => state.voice,
    beepsOn: () => state.beeps,
    onMediaAction: (a) => actions.push(a),
    createAudioEl: (url) => fakeAudioEl(url),
    createCtx: () => fakeCtx(),
  });

beforeEach(() => {
  calls = [];
  actions = [];
  state = { lang: 'ru', voice: true, beeps: true };
});

describe('AudioService', () => {
  it('unlock activates the voice pool and keepalive within the gesture', async () => {
    const svc = makeService();
    svc.unlock();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const plays = calls.filter((c) => c.op === 'play');
    const pauses = calls.filter((c) => c.op === 'pause');
    expect(plays).toHaveLength(1);
    expect(pauses).toHaveLength(1);
    expect(plays[0].id.startsWith('data:audio/wav')).toBe(true);
    expect(svc.isUnlocked).toBe(true);
  });

  it('voice plays the file for the current language and resets time', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    svc.voice('end');
    const plays = calls.filter((c) => c.op === 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0].id).toContain('/ru/end.mp3');
    state.lang = 'en';
    svc.voice('start');
    expect(calls.filter((c) => c.op === 'play').at(-1)!.id).toContain('/en/start.mp3');
  });

  it('new voice stops the previous one (single channel)', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    svc.voice('start');
    svc.voice('end');
    const startPauses = calls.filter((c) => c.id.includes('/ru/start.mp3') && c.op === 'pause');
    expect(startPauses).toHaveLength(1);
    const endPlays = calls.filter((c) => c.id.includes('/ru/end.mp3') && c.op === 'play');
    expect(endPlays).toHaveLength(1);
  });

  it('voice is suppressed when disabled in settings', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    state.voice = false;
    svc.voice('end');
    expect(calls.filter((c) => c.op === 'play')).toHaveLength(0);
  });

  it('media session handlers forward to engine actions', () => {
    const handlers = new Map<string, () => void>();
    const ms = {
      setActionHandler: (a: string, fn: () => void) => handlers.set(a, fn),
      playbackState: 'none' as string,
    };
    const original = (navigator as { mediaSession?: unknown }).mediaSession;
    Object.defineProperty(navigator, 'mediaSession', { value: ms, configurable: true });
    try {
      const svc = makeService();
      svc.unlock();
      handlers.get('play')!();
      handlers.get('pause')!();
      handlers.get('nexttrack')!();
      handlers.get('previoustrack')!();
      svc.syncMediaState('playing');
      expect(actions).toEqual(['play', 'pause', 'next', 'prev']);
      expect(ms.playbackState).toBe('playing');
    } finally {
      Object.defineProperty(navigator, 'mediaSession', { value: original, configurable: true });
    }
  });

  it('beeps are suppressed when disabled', () => {
    const svc = makeService();
    svc.unlock();
    state.beeps = false;
    expect(() => svc.beep('end')).not.toThrow();
    state.beeps = true;
    expect(() => svc.beep('chime')).not.toThrow();
    expect(() => svc.beep('tick')).not.toThrow();
  });
});
