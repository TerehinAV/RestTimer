import FakeTimers from '@sinonjs/fake-timers';
import type { InstalledClock } from '@sinonjs/fake-timers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TimerEngine } from './TimerEngine';
import type { EngineEvent } from './TimerEngine';
import type { GroupConfig } from '../core/types';

const cfg = (over: Partial<GroupConfig> = {}): GroupConfig => ({
  id: 'cfg1',
  startSec: 20,
  count: 3,
  incSec: 0,
  ...over,
});

let clock: InstalledClock;
let events: EngineEvent[];
let engine: TimerEngine;

beforeEach(() => {
  clock = FakeTimers.install({ now: 1_000_000 });
  events = [];
  engine = new TimerEngine({ onEvent: (e) => events.push(e), now: () => Date.now() });
});

afterEach(() => {
  clock.uninstall();
});

const eventsOf = (type: EngineEvent['type']) => events.filter((e) => e.type === type);
const lastSnapshot = () => {
  const snaps = events.filter((e): e is Extract<EngineEvent, { type: 'snapshot' }> => e.type === 'snapshot');
  return snaps.at(-1)!.runs;
};

describe('TimerEngine lifecycle', () => {
  it('tap starts first waiting timer and emits timerStarted', () => {
    engine.start(cfg());
    engine.tap();
    expect(eventsOf('timerStarted')).toHaveLength(1);
    const t = lastSnapshot()[0].timers[0];
    expect(t.status).toBe('running');
    expect(t.remainMs).toBe(20_000);
  });

  it('pause freezes remaining, resume recomputes deadline (no drift)', () => {
    engine.start(cfg());
    engine.tap();
    clock.tick(5000);
    engine.tick();
    engine.tap();
    let t = lastSnapshot()[0].timers[0];
    expect(t.status).toBe('paused');
    expect(t.remainMs).toBe(15_000);
    clock.tick(7000);
    engine.tick();
    engine.tap();
    t = lastSnapshot()[0].timers[0];
    expect(t.status).toBe('running');
    expect(t.remainMs).toBe(15_000);
  });

  it('natural end fires timerEnded once, advances to next waiting, no auto-start', () => {
    engine.start(cfg());
    engine.tap();
    clock.tick(20_100);
    engine.tick();
    expect(eventsOf('timerEnded')).toHaveLength(1);
    const snap = lastSnapshot()[0];
    expect(snap.timers[0].status).toBe('done');
    expect(snap.timers[1].status).toBe('waiting');
    expect(snap.current).toBe(1);
    expect(eventsOf('timerStarted')).toHaveLength(1);
  });

  it('last timer end finishes the group with actualMs', () => {
    engine.start(cfg({ startSec: 10, count: 2, incSec: 5 }));
    engine.tap();
    clock.tick(10_000);
    engine.tick();
    engine.tap();
    clock.tick(15_000);
    engine.tick();
    expect(eventsOf('groupFinished')).toHaveLength(1);
    const snap = lastSnapshot()[0];
    expect(snap.runStatus).toBe('done');
    expect(snap.actualMs).toBe(25_000);
    expect(snap.plannedMs).toBe(25_000);
  });
});

describe('cue scheduling', () => {
  it('fires 15/10/5..1 cues in order while focused', () => {
    engine.start(cfg({ startSec: 20 }));
    engine.tap();
    for (let s = 1; s <= 19; s += 1) {
      clock.tick(1000);
      engine.tick();
    }
    const cues = eventsOf('cue') as Extract<EngineEvent, { type: 'cue' }>[];
    expect(cues.map((c) => c.key)).toEqual(['n15', 'n10', 'n5', 'n4', 'n3', 'n2', 'n1']);
  });

  it('suppresses stale cue machine-gun after hidden gap but keeps imminent ones', () => {
    engine.start(cfg({ startSec: 70 }));
    engine.tap();
    engine.tick();
    clock.tick(67_000);
    engine.tick();
    const cues = eventsOf('cue') as Extract<EngineEvent, { type: 'cue' }>[];
    const keys = cues.map((c) => c.key);
    expect(keys).not.toContain('n15');
    expect(keys).not.toContain('n10');
    expect(keys).not.toContain('n5');
    expect(keys).toContain('n3');
    clock.tick(1000);
    engine.tick();
    clock.tick(1000);
    engine.tick();
    const keys2 = (eventsOf('cue') as Extract<EngineEvent, { type: 'cue' }>[]).map((c) => c.key);
    expect(keys2).toEqual(expect.arrayContaining(['n2', 'n1']));
    clock.tick(1000);
    engine.tick();
    expect(eventsOf('timerEnded')).toHaveLength(1);
  });

  it('fires exactly one timerEnded after long hidden overshoot', () => {
    engine.start(cfg({ startSec: 30 }));
    engine.tap();
    engine.tick();
    clock.tick(300_000);
    engine.tick();
    engine.tick();
    engine.tick();
    expect(eventsOf('timerEnded')).toHaveLength(1);
  });
});

describe('parallel runs and focus', () => {
  it('unfocused run gets no cues; its end is marked unseenFinish until focused', () => {
    const a = engine.start(cfg({ id: 'a', name: 'A', startSec: 30 }));
    const b = engine.start(cfg({ id: 'b', name: 'B', startSec: 20, count: 1 }));
    engine.focus(a);
    engine.tap(a);
    engine.tap(b);
    expect(engine.focusedRunId).toBe(a);
    clock.tick(5000);
    engine.tick();
    clock.tick(5000);
    engine.tick();
    clock.tick(5000);
    engine.tick();
    clock.tick(5000);
    engine.tick();
    const snapB = lastSnapshot().find((r) => r.runId === b)!;
    expect(snapB.runStatus).toBe('done');
    expect(snapB.unseenFinish).toBe(true);
    const cues = eventsOf('cue') as Extract<EngineEvent, { type: 'cue' }>[];
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((c) => c.runId === a)).toBe(true);
    const endedB = eventsOf('timerEnded') as Extract<EngineEvent, { type: 'timerEnded' }>[];
    expect(endedB.every((e) => e.runId === b)).toBe(true);
    engine.focus(b);
    expect(lastSnapshot().find((r) => r.runId === b)!.unseenFinish).toBe(false);
  });
});

describe('skip and restart', () => {
  it('skip advances silently without timerEnded voice event', () => {
    engine.start(cfg());
    engine.tap();
    clock.tick(3000);
    engine.tick();
    events.length = 0;
    engine.skip();
    expect(eventsOf('timerEnded')).toHaveLength(0);
    const snap = lastSnapshot()[0];
    expect(snap.timers[0].status).toBe('done');
    expect(snap.current).toBe(1);
    expect(snap.timers[1].status).toBe('waiting');
  });

  it('skip on last timer finishes group', () => {
    engine.start(cfg({ count: 1 }));
    engine.tap();
    engine.skip();
    expect(eventsOf('groupFinished')).toHaveLength(1);
  });

  it('restart resets remaining and clears fired cues', () => {
    engine.start(cfg({ startSec: 20 }));
    engine.tap();
    clock.tick(6000);
    engine.tick();
    expect((eventsOf('cue') as Extract<EngineEvent, { type: 'cue' }>[]).map((c) => c.key)).toContain('n15');
    engine.restart();
    const t = lastSnapshot()[0].timers[0];
    expect(t.status).toBe('running');
    expect(t.remainMs).toBe(20_000);
    clock.tick(5000);
    engine.tick();
    const cues = (eventsOf('cue') as Extract<EngineEvent, { type: 'cue' }>[]).map((c) => c.key);
    expect(cues.filter((k) => k === 'n15')).toHaveLength(2);
  });
});

describe('previous and finish', () => {
  it('previous returns to prior timer in waiting state with full duration', () => {
    engine.start(cfg({ startSec: 30, count: 3, incSec: 10 }));
    engine.tap();
    clock.tick(30_000);
    engine.tick();
    engine.tap();
    clock.tick(5000);
    engine.tick();
    engine.previous();
    const snap = lastSnapshot()[0];
    expect(snap.current).toBe(0);
    expect(snap.timers[0].status).toBe('waiting');
    expect(snap.timers[0].remainMs).toBe(30_000);
    expect(snap.timers[1].status).toBe('waiting');
    expect(snap.timers[1].remainMs).toBe(40_000);
  });

  it('previous is a no-op on the first timer and on finished runs', () => {
    engine.start(cfg({ count: 2 }));
    engine.previous();
    expect(lastSnapshot()[0].current).toBe(0);
    engine.tap();
    clock.tick(21_000);
    engine.tick();
    engine.tap();
    clock.tick(21_000);
    engine.tick();
    expect(lastSnapshot()[0].runStatus).toBe('done');
    const before = lastSnapshot();
    engine.previous();
    expect(lastSnapshot()[0].runStatus).toBe('done');
    expect(lastSnapshot()[0].timers[0].status).toBe('done');
    void before;
  });

  it('finish ends the run early with groupFinished and done counters', () => {
    engine.start(cfg({ count: 5 }));
    engine.tap();
    clock.tick(10_000);
    engine.tick();
    engine.finish();
    expect(eventsOf('groupFinished')).toHaveLength(1);
    const snap = lastSnapshot()[0];
    expect(snap.runStatus).toBe('done');
    expect(snap.timers.filter((x) => x.status === 'done').length).toBe(1);
    expect(snap.actualMs).toBeGreaterThan(0);
  });

  it('finish on already finished run is a no-op', () => {
    engine.start(cfg({ count: 1 }));
    engine.tap();
    clock.tick(21_000);
    engine.tick();
    const before = events.length;
    engine.finish();
    expect(eventsOf('groupFinished')).toHaveLength(1);
    expect(events.length).toBe(before);
  });

  it('tap on finished group is a no-op', () => {
    engine.start(cfg({ count: 1 }));
    engine.tap();
    clock.tick(21_000);
    engine.tick();
    const before = events.length;
    engine.tap();
    expect(events.length).toBe(before);
    expect(lastSnapshot()[0].runStatus).toBe('done');
  });
});

describe('bumpNext', () => {
  it('adds delta to upcoming timers only', () => {
    engine.start(cfg({ startSec: 30, count: 3, incSec: 0 }));
    engine.tap();
    clock.tick(30_000);
    engine.tick();
    engine.bumpNext(undefined, 5);
    const snap = lastSnapshot()[0];
    expect(snap.timers[1].durMs).toBe(35_000);
    expect(snap.timers[2].durMs).toBe(35_000);
    expect(snap.timers[0].durMs).toBe(30_000);
    expect(snap.plannedMs).toBe(100_000);
  });

  it('caps bumped duration at the max limit', () => {
    engine.start(cfg({ startSec: 1800, count: 2, incSec: 0 }));
    engine.tap();
    engine.bumpNext(undefined, 5);
    expect(lastSnapshot()[0].timers[1].durMs).toBe(1_800_000);
  });
});

describe('overrun timer', () => {
  it('counts after timer ends until the next timer starts', () => {
    engine.start(cfg({ startSec: 10, count: 2 }));
    engine.tap();
    clock.tick(10_000);
    engine.tick();
    expect(lastSnapshot()[0].overrunMs).toBe(0);
    expect(lastSnapshot()[0].overrunLimitMs).toBe(50_000);
    clock.tick(7_500);
    engine.tick();
    expect(lastSnapshot()[0].overrunMs).toBe(7_500);
    engine.tap();
    expect(lastSnapshot()[0].overrunMs).toBe(0);
    expect(lastSnapshot()[0].overrunLimitMs).toBe(0);
  });

  it('caps overrun at five times the completed timer', () => {
    engine.start(cfg({ startSec: 5, count: 2 }));
    engine.tap();
    clock.tick(5_000);
    engine.tick();
    clock.tick(90_000);
    engine.tick();
    expect(lastSnapshot()[0].overrunMs).toBe(25_000);
    expect(lastSnapshot()[0].overrunLimitMs).toBe(25_000);
  });
});

describe('dismiss', () => {
  it('removes run and refocuses to remaining one', () => {
    const a = engine.start(cfg({ id: 'a' }));
    const b = engine.start(cfg({ id: 'b' }));
    expect(engine.focusedRunId).toBe(b);
    engine.dismiss(b);
    expect(engine.focusedRunId).toBe(a);
    expect(engine.size).toBe(1);
    engine.dismiss(a);
    expect(engine.size).toBe(0);
    expect(engine.focusedRunId).toBeNull();
  });
});
