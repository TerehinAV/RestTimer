import { beforeEach, describe, expect, it } from 'vitest';
import { AudioService } from './AudioService';
import type { MinimalAudioEl } from './AudioService';

type Call = { id: string; op: 'play' | 'pause' };

let calls: Call[];
let state: { lang: 'ru' | 'en'; voice: boolean; beeps: boolean };
let actions: string[];
let createdAudioEls: MinimalAudioEl[];

const fakeAudioEl = (id: string): MinimalAudioEl => {
  const el: MinimalAudioEl = {
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
  };
  createdAudioEls.push(el);
  return el;
};

const makeService = () =>
  new AudioService({
    lang: () => state.lang,
    voiceOn: () => state.voice,
    beepsOn: () => state.beeps,
    voiceInSilentMode: () => true,
    mediaControlsEnabled: () => true,
    onMediaAction: (a) => actions.push(a),
    createAudioEl: (url) => fakeAudioEl(url),
  });

beforeEach(() => {
  calls = [];
  actions = [];
  createdAudioEls = [];
  state = { lang: 'ru', voice: true, beeps: true };
});

describe('AudioService channel', () => {
  it('unlock blesses exactly one silent channel within the gesture', async () => {
    const svc = makeService();
    svc.unlock();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const plays = calls.filter((c) => c.op === 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0].id.startsWith('data:audio/wav')).toBe(true);
    expect(createdAudioEls).toHaveLength(1);
    expect(svc.isUnlocked).toBe(true);
  });

  it('voice plays the file for the current language', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    svc.voice('end');
    expect(calls.filter((c) => c.op === 'play' && c.id.includes('/ru/end.mp3'))).toHaveLength(1);
    state.lang = 'en';
    svc.voice('start');
    expect(calls.filter((c) => c.op === 'play' && c.id.includes('/en/start.mp3'))).toHaveLength(1);
  });

  it('new voice stops the previous one (single channel)', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    svc.voice('start');
    svc.voice('end');
    expect(calls.filter((c) => c.op === 'play' && c.id.includes('/ru/start.mp3'))).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'play' && c.id.includes('/ru/end.mp3'))).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'pause' && c.id.includes('/ru/start.mp3'))).toHaveLength(1);
  });

  it('queues group completion after timer end voice', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    svc.voice('end');
    svc.voice('groupDone', true);
    expect(calls.filter((c) => c.op === 'play' && c.id.includes('/groupDone.mp3'))).toHaveLength(0);
    createdAudioEls[0].onended?.();
    expect(calls.filter((c) => c.op === 'play' && c.id.includes('/groupDone.mp3'))).toHaveLength(1);
  });

  it('voice is suppressed when disabled in settings', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    state.voice = false;
    svc.voice('end');
    expect(calls.filter((c) => c.op === 'play')).toHaveLength(0);
  });

  it('end beep is skipped when voice is on, others still play as wav', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    svc.beep('end');
    svc.beep('tick');
    svc.beep('chime');
    expect(calls.filter((c) => c.op === 'play' && c.id.startsWith('data:audio/wav'))).toHaveLength(1);
    createdAudioEls[0].onended?.();
    expect(calls.filter((c) => c.op === 'play' && c.id.startsWith('data:audio/wav'))).toHaveLength(2);
  });

  it('end beep plays as wav when voice is off', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    state.voice = false;
    svc.beep('end');
    expect(calls.filter((c) => c.op === 'play' && c.id.startsWith('data:audio/wav'))).toHaveLength(1);
  });

  it('beeps are suppressed when disabled', () => {
    const svc = makeService();
    svc.unlock();
    calls.length = 0;
    state.beeps = false;
    state.voice = false;
    svc.beep('end');
    svc.beep('tick');
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
});
