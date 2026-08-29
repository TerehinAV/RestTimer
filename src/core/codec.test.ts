import { describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { capacityReport, decodeCfg, encodeGroups, QR_BUDGET, STARTAPP_BUDGET } from './codec';
import { fmtMs, plannedMs, timerDurMs } from './time';
import type { GroupConfig } from './types';

const g = (over: Partial<GroupConfig> = {}): GroupConfig => ({
  id: 'x1',
  startSec: 60,
  count: 8,
  incSec: 0,
  ...over,
});

describe('codec', () => {
  it('roundtrips groups with and without names', () => {
    const groups = [g({ name: 'Присед' }), g({ id: 'x2', startSec: 45, count: 12, incSec: 10 }), g({ name: 'жим лёжа верхний блок' })];
    const decoded = decodeCfg(encodeGroups(groups));
    expect(decoded).not.toBeNull();
    expect(decoded!.map(({ name, startSec, count, incSec }) => ({ name, startSec, count, incSec }))).toEqual(
      groups.map(({ name, startSec, count, incSec }) => ({ name, startSec, count, incSec })),
    );
  });

  it('truncates names to the 40-char limit', () => {
    const decoded = decodeCfg(encodeGroups([g({ name: 'x'.repeat(80) })]))!;
    expect(decoded[0].name!.length).toBe(40);
  });

  it('regenerates ids on decode', () => {
    const decoded = decodeCfg(encodeGroups([g()]))!;
    expect(decoded[0].id).not.toBe('x1');
  });

  it('clamps out-of-range values', () => {
    const decoded = decodeCfg(encodeGroups([g({ startSec: 99999, count: 500, incSec: -30 })]))!;
    expect(decoded[0]).toMatchObject({ startSec: 1800, count: 30, incSec: 0 });
  });

  it('rejects garbage payloads', () => {
    expect(decodeCfg('')).toBeNull();
    expect(decodeCfg('garbage!!!')).toBeNull();
    expect(decodeCfg('AAAA')).toBeNull();
  });

  it('capacity flags mirror budgets', () => {
    const incompressible: GroupConfig[] = Array.from({ length: 50 }, (_, i) => g({ id: `id-${i}`, name: nanoid(40) }));
    const report = capacityReport(incompressible);
    expect(report.perGroupChars.length).toBe(50);
    expect(report.cumulativeStartapp[0]).toBe(true);
    expect(report.cumulativeStartapp[49]).toBe(false);
    expect(report.totalChars).toBeGreaterThan(STARTAPP_BUDGET);
    const small = capacityReport([g(), g({ id: 'b' })]);
    expect(small.fitsStartapp).toBe(true);
    expect(small.fitsQr).toBe(true);
    expect(small.totalChars).toBeLessThanOrEqual(QR_BUDGET);
  });
});

describe('time', () => {
  it('planned sum matches pyramid math', () => {
    expect(plannedMs(g({ startSec: 60, count: 8, incSec: 10 }))).toBe(760_000);
    expect(plannedMs(g({ startSec: 30, count: 1, incSec: 5 }))).toBe(30_000);
  });

  it('per-timer durations grow by increment', () => {
    const cfg = g({ startSec: 60, count: 3, incSec: 15 });
    expect(timerDurMs(cfg, 0)).toBe(60_000);
    expect(timerDurMs(cfg, 2)).toBe(90_000);
  });

  it('formats clock strings', () => {
    expect(fmtMs(90_000)).toBe('1:30');
    expect(fmtMs(0)).toBe('0:00');
    expect(fmtMs(3_723_000)).toBe('1:02:03');
    expect(fmtMs(-5)).toBe('0:00');
  });
});
