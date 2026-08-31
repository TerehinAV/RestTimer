import { nanoid } from 'nanoid';
import { plannedMs, timerDurMs } from '../core/time';
import type { GroupConfig, RunSnapshot, TimerStatus, VoiceKey } from '../core/types';

export type CueKey = Extract<VoiceKey, `n${number}`>;

export type EngineEvent =
  | { type: 'snapshot'; runs: RunSnapshot[] }
  | { type: 'timerStarted'; runId: string; focused: boolean }
  | { type: 'timerEnded'; runId: string; focused: boolean }
  | { type: 'cue'; runId: string; focused: boolean; key: CueKey }
  | { type: 'groupFinished'; runId: string; focused: boolean };

type TimerState = {
  durMs: number;
  status: TimerStatus;
  remainMs: number;
  endAt: number | null;
  firedCues: Set<number>;
};

type RunState = {
  runId: string;
  config: GroupConfig;
  label: string;
  timers: TimerState[];
  current: number;
  firstStartedAt: number | null;
  finishedAt: number | null;
  overrunStartedAt: number | null;
  overrunLimitMs: number;
  unseenFinish: boolean;
  lastTickAt: number;
};

export const CUE_THRESHOLDS_SEC = [15, 10, 5, 4, 3, 2, 1] as const;
const STALE_CUE_GRACE_MS = 1200;
const GAP_DETECTION_MS = 2000;

export type EngineOptions = {
  onEvent: (e: EngineEvent) => void;
  now?: () => number;
};

export class TimerEngine {
  private runs = new Map<string, RunState>();
  private focusedId: string | null = null;
  private onEvent: (e: EngineEvent) => void;
  private now: () => number;

  constructor(opts: EngineOptions) {
    this.onEvent = opts.onEvent;
    this.now = opts.now ?? (() => Date.now());
  }

  get size(): number {
    return this.runs.size;
  }

  get focusedRunId(): string | null {
    return this.focusedId;
  }

  hasStartedRuns(): boolean {
    for (const run of this.runs.values()) {
      if (run.finishedAt === null && run.firstStartedAt !== null) return true;
    }
    return false;
  }

  hasRunningTimers(): boolean {
    for (const run of this.runs.values()) {
      const t = run.timers[run.current];
      if (t && t.status === 'running') return true;
    }
    return false;
  }

  start(config: GroupConfig): string {
    const runId = nanoid(8);
    const now = this.now();
    this.runs.set(runId, {
      runId,
      config,
      label: config.name ?? '',
      timers: Array.from({ length: config.count }, (_, i) => {
        const durMs = timerDurMs(config, i);
        return { durMs, status: 'waiting' as TimerStatus, remainMs: durMs, endAt: null, firedCues: new Set<number>() };
      }),
      current: 0,
      firstStartedAt: null,
      finishedAt: null,
      overrunStartedAt: null,
      overrunLimitMs: 0,
      unseenFinish: false,
      lastTickAt: now,
    });
    this.focusedId = runId;
    this.emitSnapshot();
    return runId;
  }

  dismiss(runId: string): void {
    this.runs.delete(runId);
    if (this.focusedId === runId) {
      this.focusedId = [...this.runs.keys()].at(-1) ?? null;
    }
    this.emitSnapshot();
  }

  focus(runId: string): void {
    if (!this.runs.has(runId)) return;
    this.focusedId = runId;
    const run = this.runs.get(runId)!;
    if (run.unseenFinish) {
      run.unseenFinish = false;
    }
    this.emitSnapshot();
  }

  tap(runId = this.focusedRunId): void {
    const run = runId ? this.runs.get(runId) : undefined;
    if (!run) return;
    const t = run.timers[run.current];
    if (!t) return;
    if (t.status === 'waiting') this.startCurrent(run);
    else if (t.status === 'running') this.pauseCurrent(run);
    else if (t.status === 'paused') this.resumeCurrent(run);
  }

  pause(runId = this.focusedRunId): void {
    const run = runId ? this.runs.get(runId) : undefined;
    if (!run) return;
    const t = run.timers[run.current];
    if (t && t.status === 'running') this.pauseCurrent(run);
  }

  resume(runId = this.focusedRunId): void {
    const run = runId ? this.runs.get(runId) : undefined;
    if (!run) return;
    const t = run.timers[run.current];
    if (t && t.status === 'paused') this.resumeCurrent(run);
  }

  skip(runId = this.focusedRunId): void {
    const run = runId ? this.runs.get(runId) : undefined;
    if (!run) return;
    const t = run.timers[run.current];
    if (!t || t.status === 'done') return;
    t.status = 'done';
    t.remainMs = 0;
    t.endAt = null;
    this.advance(run);
  }

  restart(runId = this.focusedRunId): void {
    const run = runId ? this.runs.get(runId) : undefined;
    if (!run) return;
    const t = run.timers[run.current];
    if (!t || t.status === 'waiting' || t.status === 'done') return;
    const now = this.now();
    t.remainMs = t.durMs;
    t.endAt = now + t.durMs;
    t.status = 'running';
    t.firedCues.clear();
    run.overrunStartedAt = null;
    run.overrunLimitMs = 0;
    run.lastTickAt = now;
    this.emitSnapshot();
  }

  previous(runId = this.focusedRunId): void {
    const run = runId ? this.runs.get(runId) : undefined;
    if (!run || run.finishedAt !== null) return;
    if (run.current <= 0) return;
    const cur = run.timers[run.current];
    if (cur && cur.status !== 'done') {
      cur.status = 'waiting';
      cur.remainMs = cur.durMs;
      cur.endAt = null;
    }
    run.current -= 1;
    const prev = run.timers[run.current];
    prev.status = 'waiting';
    prev.remainMs = prev.durMs;
    prev.endAt = null;
    prev.firedCues.clear();
    run.overrunStartedAt = null;
    run.overrunLimitMs = 0;
    this.emitSnapshot();
  }

  finish(runId = this.focusedRunId): void {
    const run = runId ? this.runs.get(runId) : undefined;
    if (!run || run.finishedAt !== null) return;
    const t = run.timers[run.current];
    if (t && t.status !== 'done') {
      t.status = 'done';
      t.remainMs = 0;
      t.endAt = null;
    }
    run.current = run.timers.length;
    run.finishedAt = this.now();
    run.overrunStartedAt = null;
    run.overrunLimitMs = 0;
    const focused = run.runId === this.focusedId;
    if (!focused) run.unseenFinish = true;
    this.onEvent({ type: 'groupFinished', runId: run.runId, focused });
    this.emitSnapshot();
  }

  tick(): void {
    const now = this.now();
    let changed = false;
    for (const run of this.runs.values()) {
      const t = run.timers[run.current];
      const dt = now - run.lastTickAt;
      if (t && t.status === 'running' && t.endAt !== null) {
        const focused = run.runId === this.focusedId;
        const remain = t.endAt - now;
        if (remain <= 0) {
          t.status = 'done';
          t.remainMs = 0;
          t.endAt = null;
          this.onEvent({ type: 'timerEnded', runId: run.runId, focused });
          this.advance(run);
        } else {
          this.fireDueCues(run, t, remain, dt, focused);
        }
        changed = true;
      }
      run.lastTickAt = now;
    }
    if (changed || this.runs.size > 0) this.emitSnapshot();
  }

  handleVisibility(visible: boolean): void {
    if (visible) this.tick();
  }

  snapshots(): RunSnapshot[] {
    const now = this.now();
    return [...this.runs.values()].map((run) => this.snapshotOf(run, now));
  }

  private emitSnapshot(): void {
    this.onEvent({ type: 'snapshot', runs: this.snapshots() });
  }

  private fireDueCues(run: RunState, t: TimerState, remain: number, dt: number, focused: boolean): void {
    if (!focused) return;
    if (dt > GAP_DETECTION_MS) {
      for (const th of CUE_THRESHOLDS_SEC) {
        if (remain <= th * 1000 - STALE_CUE_GRACE_MS) t.firedCues.add(th);
      }
    }
    for (const th of CUE_THRESHOLDS_SEC) {
      if (!t.firedCues.has(th) && remain <= th * 1000) {
        t.firedCues.add(th);
        this.onEvent({ type: 'cue', runId: run.runId, focused: true, key: `n${th}` as CueKey });
      }
    }
  }

  private startCurrent(run: RunState): void {
    const t = run.timers[run.current];
    if (!t) return;
    const now = this.now();
    if (run.firstStartedAt === null) run.firstStartedAt = now;
    run.overrunStartedAt = null;
    run.overrunLimitMs = 0;
    t.status = 'running';
    t.endAt = now + t.remainMs;
    t.firedCues.clear();
    run.lastTickAt = now;
    this.onEvent({ type: 'timerStarted', runId: run.runId, focused: run.runId === this.focusedId });
    this.emitSnapshot();
  }

  private pauseCurrent(run: RunState): void {
    const t = run.timers[run.current];
    if (!t || t.endAt === null) return;
    t.remainMs = Math.max(0, t.endAt - this.now());
    t.endAt = null;
    t.status = 'paused';
    this.emitSnapshot();
  }

  private resumeCurrent(run: RunState): void {
    const t = run.timers[run.current];
    if (!t) return;
    const now = this.now();
    t.status = 'running';
    t.endAt = now + t.remainMs;
    run.lastTickAt = now;
    this.onEvent({ type: 'timerStarted', runId: run.runId, focused: run.runId === this.focusedId });
    this.emitSnapshot();
  }

  private advance(run: RunState): void {
    const completed = run.timers[run.current];
    run.current += 1;
    if (run.current >= run.timers.length) {
      run.current = run.timers.length;
      run.finishedAt = this.now();
      const focused = run.runId === this.focusedId;
      if (!focused) run.unseenFinish = true;
      this.onEvent({ type: 'groupFinished', runId: run.runId, focused });
    } else {
      run.overrunStartedAt = this.now();
      run.overrunLimitMs = (completed?.durMs ?? 0) * 5;
    }
    this.emitSnapshot();
  }

  private snapshotOf(run: RunState, now: number): RunSnapshot {
    const actualMs =
      run.finishedAt !== null && run.firstStartedAt !== null
        ? run.finishedAt - run.firstStartedAt
        : run.firstStartedAt !== null
          ? now - run.firstStartedAt
          : 0;
    return {
      runId: run.runId,
      configId: run.config.id,
      label: run.label,
      timers: run.timers.map((t) => ({
        status: t.status,
        remainMs: t.status === 'running' && t.endAt !== null ? Math.max(0, t.endAt - now) : t.remainMs,
        durMs: t.durMs,
      })),
      current: Math.min(run.current, run.timers.length - 1),
      plannedMs: plannedMs(run.config),
      actualMs,
      overrunMs:
        run.overrunStartedAt === null ? 0 : Math.min(now - run.overrunStartedAt, run.overrunLimitMs),
      overrunLimitMs: run.overrunLimitMs,
      runStatus: run.finishedAt !== null ? 'done' : 'active',
      unseenFinish: run.unseenFinish,
    };
  }
}
