import LZString from 'lz-string';
import { nanoid } from 'nanoid';
import { LIMITS } from './types';
import type { GroupConfig } from './types';

export const STARTAPP_BUDGET = 512;
export const QR_BUDGET = 1200;

type WireGroup = [name: string | 0, startSec: number, count: number, incSec: number, tags?: string[]];

function toWire(groups: GroupConfig[]): { v: 1; g: WireGroup[] } {
  return {
    v: 1,
    g: groups.map((g) => {
      const wire: WireGroup = [g.name ? g.name : 0, g.startSec, g.count, g.incSec];
      if (g.tags && g.tags.length > 0) wire.push(g.tags);
      return wire;
    }),
  };
}

export function encodeGroups(groups: GroupConfig[]): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(toWire(groups)));
}

export function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().slice(0, LIMITS.tagMax);
    if (tag.length > 0) seen.add(tag);
    if (seen.size >= LIMITS.tagsPerGroupMax) break;
  }
  return [...seen];
}

function clampNum(v: unknown, min: number, max: number, fallback: number, step: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const clamped = Math.min(max, Math.max(min, Math.round(n)));
  return Math.round(clamped / step) * step;
}

function parseGroup(item: unknown): GroupConfig | null {
  if (!Array.isArray(item) || item.length < 4) return null;
  const [name, startSec, count, incSec, tags] = item;
  if (typeof startSec !== 'number' || typeof count !== 'number' || typeof incSec !== 'number') {
    return null;
  }
  const group: GroupConfig = {
    id: nanoid(8),
    startSec: clampNum(startSec, LIMITS.startSecMin, LIMITS.startSecMax, 60, LIMITS.startStep),
    count: clampNum(count, LIMITS.countMin, LIMITS.countMax, 8, 1),
    incSec: clampNum(incSec, LIMITS.incSecMin, LIMITS.incSecMax, 0, LIMITS.incStep),
  };
  if (typeof name === 'string' && name.trim().length > 0) {
    group.name = name.trim().slice(0, LIMITS.nameMax);
  }
  const cleanTags = sanitizeTags(tags);
  if (cleanTags.length > 0) group.tags = cleanTags;
  return group;
}

export function decodeCfg(payload: string): GroupConfig[] | null {
  if (!payload || payload.length > 4000) return null;
  let raw: unknown;
  try {
    const json = LZString.decompressFromEncodedURIComponent(payload);
    if (!json) return null;
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as { v?: unknown; g?: unknown };
  if (obj.v !== 1 || !Array.isArray(obj.g) || obj.g.length === 0) return null;
  if (obj.g.length > 50) return null;
  const groups = obj.g.map(parseGroup).filter((g): g is GroupConfig => g !== null);
  return groups.length > 0 ? groups : null;
}

export type CapacityReport = {
  totalChars: number;
  perGroupChars: number[];
  cumulativeStartapp: boolean[];
  cumulativeQr: boolean[];
  fitsStartapp: boolean;
  fitsQr: boolean;
};

export function capacityReport(groups: GroupConfig[]): CapacityReport {
  const perGroupChars: number[] = [];
  const cumulativeStartapp: boolean[] = [];
  const cumulativeQr: boolean[] = [];
  let prev = encodeGroups(groups.slice(0, 0)).length;
  groups.forEach((_, i) => {
    const total = encodeGroups(groups.slice(0, i + 1)).length;
    perGroupChars.push(total - prev);
    cumulativeStartapp.push(total <= STARTAPP_BUDGET);
    cumulativeQr.push(total <= QR_BUDGET);
    prev = total;
  });
  return {
    totalChars: prev,
    perGroupChars,
    cumulativeStartapp,
    cumulativeQr,
    fitsStartapp: prev <= STARTAPP_BUDGET,
    fitsQr: prev <= QR_BUDGET,
  };
}
