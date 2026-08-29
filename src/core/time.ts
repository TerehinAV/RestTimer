import type { GroupConfig } from './types';

export function timerDurMs(cfg: GroupConfig, index: number): number {
  return (cfg.startSec + index * cfg.incSec) * 1000;
}

export function plannedMs(cfg: GroupConfig): number {
  const n = cfg.count;
  const totalSec = n * cfg.startSec + (cfg.incSec * n * (n - 1)) / 2;
  return totalSec * 1000;
}

export function fmtMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
