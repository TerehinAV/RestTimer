import { useRef } from 'react';
import type { TouchEvent } from 'react';
import { haptic } from '../tg/tg';

export function useSwipeBack(onBack: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = t.clientX < 48 ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchMove: (e: TouchEvent) => {
      if (!start.current) return;
      const dy = Math.abs(e.touches[0].clientY - start.current.y);
      if (dy > 60) start.current = null;
    },
    onTouchEnd: (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      start.current = null;
      if (dx > 64) {
        haptic('tap');
        onBack();
      }
    },
  };
}
